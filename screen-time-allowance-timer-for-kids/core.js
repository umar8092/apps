// Screen Time Allowance Timer for Kids: the logic, with no page code (also loaded by tests.js in node).
// Times are kept as real clock times (milliseconds), so the time left is right even after the phone was locked
// or the page was closed. Days are local calendar days: a session over midnight counts on both days.
(function (root) {
    'use strict';
    const DAY_MIN = 1440;
    const pad = n => String(n).padStart(2, '0');

    // ---- calendar days ("2026-10-23") ----
    const dayKey = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const isKey = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dayKey(dayStart(s)) === s;
    function dayStart(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
    function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n).getTime()); }
    const weekday = key => new Date(dayStart(key)).getDay(); // 0 Sunday .. 6 Saturday
    function timeOf(ms) { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    // a "HH:MM" on a day, as milliseconds
    function atTime(key, hhmm) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); if (!m || +m[1] > 23 || +m[2] > 59) return NaN;
        const [y, mo, d] = key.split('-').map(Number); return new Date(y, mo - 1, d, +m[1], +m[2]).getTime();
    }

    // ---- durations ----
    // "45", "45 min", "1:30", "1h30", "1 h 30 min", "1.5 h", "2 hours", "90m" -> whole minutes
    function parseDuration(text, opts) {
        opts = opts || {};
        const max = opts.max == null ? DAY_MIN : opts.max, min = opts.min == null ? 0 : opts.min;
        const s = String(text == null ? '' : text).replace(/ /g, ' ').trim().toLowerCase();
        if (!s) return { error: 'Type the minutes, such as 45, or hours and minutes, such as 1:30.' };
        if (/^-/.test(s)) return { error: 'Time cannot be below zero.' };
        let total = null, m;
        if ((m = /^(\d{1,4})$/.exec(s))) total = +m[1];
        else if ((m = /^(\d{1,2}):([0-5]\d)$/.exec(s))) total = +m[1] * 60 + +m[2];
        else if ((m = /^(\d{1,4})\s*(m|min|mins|minute|minutes)$/.exec(s))) total = +m[1];
        else if ((m = /^(\d{1,2}(?:[.,]\d{1,2})?)\s*(h|hr|hrs|hour|hours)$/.exec(s))) total = Math.round(parseFloat(m[1].replace(',', '.')) * 60);
        else if ((m = /^(\d{1,2})\s*(?:h|hr|hrs|hour|hours)\s*(?:and\s*)?(\d{1,2})\s*(?:m|min|mins|minute|minutes)?$/.exec(s))) { if (+m[2] > 59) return { error: 'Minutes after the hours must be 0 to 59, such as 1 h 30 min.' }; total = +m[1] * 60 + +m[2]; }
        if (total === null || !isFinite(total)) return { error: 'Type the minutes, such as 45, or hours and minutes, such as 1:30.' };
        if (total < min) return { error: min === 1 ? 'Type at least 1 minute.' : 'Type at least ' + fmtDur(min) + '.' };
        if (total > max) return { error: 'That is more than ' + fmtDur(max) + '. Type a shorter time.' };
        return { min: total };
    }
    // 0 -> "0 min", 45 -> "45 min", 60 -> "1 h", 90 -> "1 h 30 min"
    function fmtDur(min) {
        min = Math.max(0, Math.round(min)); const h = Math.floor(min / 60), m = min % 60;
        if (!h) return m + ' min';
        return h + ' h' + (m ? ' ' + m + ' min' : '');
    }
    // seconds as a countdown: 1499 -> "24:59", 3900 -> "1:05:00"
    function fmtClock(sec) {
        sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
        return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
    }

    // ---- state ----
    function emptyState() {
        return { v: 1, seq: 1, kids: [], sessions: [], manual: [], bonus: [], days: {}, settings: { weekend: [0, 6], warn: 5, sound: true } };
    }
    const str = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '';
    const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    const MS_MIN = Date.UTC(2000, 0, 1), MS_MAX = Date.UTC(2200, 0, 1);
    const msOk = v => Number.isFinite(v) && v >= MS_MIN && v <= MS_MAX;
    // checks every saved or restored value; returns a clean state, or null if it is not this app's data
    function normalize(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.kids)) return null;
        const st = emptyState(), ids = new Set();
        let maxId = 0;
        const id = v => { const n = Number.isInteger(v) && v > 0 ? v : 0; if (n > maxId) maxId = n; return n; };
        raw.kids.slice(0, 50).forEach(k => {
            if (!k || typeof k !== 'object') return;
            const name = str(k.name, 40), i = id(k.id);
            if (!name || !i || ids.has(i) || !intIn(k.school, 0, DAY_MIN) || !intIn(k.weekend, 0, DAY_MIN)) return;
            ids.add(i); st.kids.push({ id: i, name, school: k.school, weekend: k.weekend });
        });
        (Array.isArray(raw.sessions) ? raw.sessions : []).forEach(s => {
            if (!s || !ids.has(s.kid) || !msOk(s.start)) return;
            if (s.end !== null && !(msOk(s.end) && s.end >= s.start && s.end - s.start <= DAY_MIN * 60000)) return;
            const i = id(s.id); if (!i) return;
            st.sessions.push({ id: i, kid: s.kid, start: s.start, end: s.end });
        });
        // at most one running session per child: keep the newest
        const running = {};
        st.sessions.filter(s => s.end === null).sort((a, b) => b.start - a.start).forEach(s => { if (running[s.kid]) s.end = Math.min(s.start + DAY_MIN * 60000, Math.max(s.start, running[s.kid].start)); else running[s.kid] = s; });
        ['manual', 'bonus'].forEach(list => (Array.isArray(raw[list]) ? raw[list] : []).forEach(e => {
            if (!e || !ids.has(e.kid) || !isKey(e.date) || !intIn(e.min, 1, DAY_MIN)) return;
            const i = id(e.id); if (!i) return;
            st[list].push({ id: i, kid: e.kid, date: e.date, min: e.min, note: str(e.note, 60) });
        }));
        if (raw.days && typeof raw.days === 'object') Object.keys(raw.days).forEach(k => { if (isKey(k) && (raw.days[k] === 'school' || raw.days[k] === 'weekend')) st.days[k] = raw.days[k]; });
        const se = raw.settings || {};
        if (Array.isArray(se.weekend)) st.settings.weekend = [...new Set(se.weekend.filter(d => intIn(d, 0, 6)))].sort();
        if ([0, 1, 2, 5, 10, 15].includes(se.warn)) st.settings.warn = se.warn;
        if (typeof se.sound === 'boolean') st.settings.sound = se.sound;
        st.seq = Math.max(maxId + 1, Number.isInteger(raw.seq) ? raw.seq : 1);
        return st;
    }
    const nextId = st => st.seq++;

    // ---- the day's allowance ----
    function dayType(st, key) { return st.days[key] || (st.settings.weekend.includes(weekday(key)) ? 'weekend' : 'school'); }
    // what the calendar alone would say, to know if today was changed by hand
    const plainDayType = (st, key) => st.settings.weekend.includes(weekday(key)) ? 'weekend' : 'school';
    const bonusMin = (st, kidId, key) => st.bonus.filter(b => b.kid === kidId && b.date === key).reduce((a, b) => a + b.min, 0);
    function allowanceMin(st, kid, key) { return (dayType(st, key) === 'weekend' ? kid.weekend : kid.school) + bonusMin(st, kid.id, key); }
    // seconds of screen time on a day: timed sessions (only the part inside that day) plus time added by hand
    function usedSec(st, kidId, key, now) {
        const a = dayStart(key), b = dayStart(addDays(key, 1));
        let ms = 0;
        st.sessions.forEach(s => {
            if (s.kid !== kidId) return;
            const end = s.end === null ? Math.max(s.start, now) : s.end;
            const lo = Math.max(a, s.start), hi = Math.min(b, end);
            if (hi > lo) ms += hi - lo;
        });
        const man = st.manual.filter(m => m.kid === kidId && m.date === key).reduce((t, m) => t + m.min, 0);
        return Math.floor(ms / 1000) + man * 60;
    }
    const runningOf = (st, kidId) => st.sessions.find(s => s.kid === kidId && s.end === null) || null;
    // everything the child's box shows. usedMin + leftMin always add up to the allowance.
    function status(st, kid, key, now) {
        const allow = allowanceMin(st, kid, key), used = usedSec(st, kid.id, key, now), left = allow * 60 - used;
        const run = runningOf(st, kid.id);
        const usedMin = Math.ceil(used / 60);
        const r = { allowMin: allow, bonusMin: bonusMin(st, kid.id, key), dayType: dayType(st, key), usedSec: used, leftSec: left,
            usedMin, leftMin: left > 0 ? Math.floor(left / 60) : 0, overMin: left < 0 ? usedMin - allow : 0,
            running: !!run, since: run ? run.start : null, runSec: run ? Math.max(0, Math.floor((now - run.start) / 1000)) : 0 };
        if (left < 0 || (left === 0 && (used > 0 || r.running))) r.state = 'up';
        else if (allow === 0) r.state = 'none';
        else if (st.settings.warn && left <= st.settings.warn * 60) r.state = 'warn';
        else r.state = 'ok';
        return r;
    }
    // one plain sentence for a child: "Ali: 25 min left today (35 min of 1 h used)."
    function statusLine(kid, s) {
        const of = fmtDur(s.usedMin) + ' of ' + fmtDur(s.allowMin) + ' used';
        if (s.state === 'none') return kid.name + ': no screen time today' + (s.usedMin ? ', but ' + fmtDur(s.usedMin) + ' used.' : '.');
        if (s.overMin > 0) return kid.name + ': time is up, over by ' + fmtDur(s.overMin) + ' (' + of + ').';
        if (s.state === 'up') return kid.name + ': time is up (' + of + ').';
        return kid.name + ': ' + fmtDur(s.leftMin) + ' left today (' + of + ').';
    }

    // ---- entries of a day ----
    function dayEntries(st, kidId, key) {
        const a = dayStart(key), b = dayStart(addDays(key, 1));
        const ses = st.sessions.filter(s => s.kid === kidId && s.start < b && (s.end === null || s.end > a || s.start >= a)).sort((x, y) => x.start - y.start);
        return { sessions: ses, manual: st.manual.filter(m => m.kid === kidId && m.date === key), bonus: st.bonus.filter(m => m.kid === kidId && m.date === key) };
    }
    // the last 7 days ending today, oldest first
    function week(st, kid, today, now) {
        const out = [];
        for (let i = 6; i >= 0; i--) { const key = addDays(today, -i); out.push({ key, used: Math.ceil(usedSec(st, kid.id, key, now) / 60), allow: allowanceMin(st, kid, key), type: dayType(st, key) }); }
        return out;
    }

    // ---- changes ----
    function start(st, kidId, now) { if (runningOf(st, kidId)) return null; const s = { id: nextId(st), kid: kidId, start: now, end: null }; st.sessions.push(s); return s; }
    function stop(st, kidId, now) { const s = runningOf(st, kidId); if (!s) return null; s.end = Math.max(s.start, Math.min(now, s.start + DAY_MIN * 60000)); return s; }
    // a session typed by hand: start and end "HH:MM" on the start day; an end before the start means the next day
    function sessionTimes(key, startHM, endHM, now, running) {
        const a = atTime(key, startHM);
        if (isNaN(a)) return { error: 'Pick when it started.' };
        if (a > now) return { error: 'The start cannot be later than now.' };
        if (running) return { start: a, end: null };
        let b = atTime(key, endHM);
        if (isNaN(b)) return { error: 'Pick when it ended.' };
        if (b <= a) b = atTime(addDays(key, 1), endHM);
        if (b > now) return { error: 'The end cannot be later than now.' };
        if (b - a > DAY_MIN * 60000) return { error: 'A session cannot be longer than a day.' };
        return { start: a, end: b, nextDay: dayKey(b) !== key };
    }
    // another session of the same child that shares some of the time from a to b (so nothing is counted twice)
    function overlap(st, kidId, a, b, exceptId, now) {
        return st.sessions.find(s => s.kid === kidId && s.id !== exceptId && s.start < b && (s.end === null ? Math.max(s.start, now) : s.end) > a) || null;
    }
    // old entries are dropped so the saved data stays small
    function prune(st, today) {
        const cut = dayStart(addDays(today, -60)), cutKey = addDays(today, -60);
        st.sessions = st.sessions.filter(s => s.end === null || s.end >= cut);
        st.manual = st.manual.filter(m => m.date >= cutKey); st.bonus = st.bonus.filter(m => m.date >= cutKey);
        Object.keys(st.days).forEach(k => { if (k < cutKey) delete st.days[k]; });
    }

    // ---- words ----
    function niceDay(key, today, locale) {
        if (key === today) return 'Today';
        if (key === addDays(today, -1)) return 'Yesterday';
        try { return new Date(dayStart(key)).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return key; }
    }
    function longDay(key, locale) { try { return new Date(dayStart(key)).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return key; } }
    function shortWeekday(key, locale) { try { return new Date(dayStart(key)).toLocaleDateString(locale, { weekday: 'short' }); } catch (e) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday(key)]; } }
    function summary(st, today, now, locale) {
        const lines = ['Screen time, ' + longDay(today, locale) + ' (' + (dayType(st, today) === 'weekend' ? 'weekend or holiday' : 'school day') + ')', ''];
        st.kids.forEach(k => {
            const s = status(st, k, today, now);
            lines.push(statusLine(k, s) + (s.bonusMin ? ' Includes ' + fmtDur(s.bonusMin) + ' bonus.' : '') + (s.running ? ' Still watching since ' + timeOf(s.since) + '.' : ''));
            const w = week(st, k, today, now), tot = w.reduce((a, d) => a + d.used, 0), all = w.reduce((a, d) => a + d.allow, 0);
            lines.push('   Past 7 days: ' + fmtDur(tot) + ' of ' + fmtDur(all) + ' allowed.');
        });
        return lines.join('\n');
    }

    const api = { DAY_MIN, dayKey, isKey, dayStart, addDays, weekday, timeOf, atTime, parseDuration, fmtDur, fmtClock, emptyState, normalize, nextId,
        dayType, plainDayType, bonusMin, allowanceMin, usedSec, runningOf, status, statusLine, dayEntries, week, start, stop, sessionTimes, overlap, prune,
        niceDay, longDay, shortWeekday, summary };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.STA = api;
})(this);
