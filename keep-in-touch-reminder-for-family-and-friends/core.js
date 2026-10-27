// Keep in Touch Reminder for Family and Friends: the maths and the words. No page code here, so tests.js can check it in node.
(function (root) {
    'use strict';
    const DAY = 86400000;
    const KINDS = { call: 'Called', msg: 'Messaged', met: 'Met up', any: 'In touch', try: 'Tried, no answer' };
    const VERB = { call: 'called', msg: 'messaged', met: 'met up', any: 'in touch' };
    const MAX_PEOPLE = 200, MAX_LOG = 2000;

    // ---------- days ("YYYY-MM-DD" strings, counted in whole days) ----------
    const pad = n => String(n).padStart(2, '0');
    const localDay = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    function isDay(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const [y, m, d] = s.split('-').map(Number);
        const t = new Date(Date.UTC(y, m - 1, d));
        return y >= 1900 && y <= 2200 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
    }
    const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY; };
    const dayStr = n => new Date(n * DAY).toISOString().slice(0, 10);
    const addDays = (s, n) => dayStr(dayNum(s) + n);
    const diff = (a, b) => dayNum(b) - dayNum(a);   // days from a to b

    // ---------- typed values ----------
    // how often, in days: a whole number from 1 to 365 ("10", "10 days")
    function parseEvery(s) {
        const t = String(s == null ? '' : s).trim().toLowerCase().replace(/\s*days?$/, '');
        if (!t) return { error: 'Type how many days, such as 10.' };
        if (!/^-?\d+([.,]\d+)?$/.test(t)) return { error: 'Type a whole number of days, such as 10.' };
        const n = Number(t.replace(',', '.'));
        if (n <= 0) return { error: 'Type at least 1 day.' };
        if (!Number.isInteger(n)) return { error: 'Type a whole number of days, such as 10.' };
        if (n > 365) return { error: 'Type 365 days or fewer.' };
        return { n };
    }
    const cleanName = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 40);
    const cleanNote = (s, max) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

    // ---------- one person ----------
    // log entries sorted newest first; on the same day the one added later comes first
    function sorted(p) {
        return p.log.map((e, i) => ({ e, i })).sort((a, b) => a.e.d === b.e.d ? b.i - a.i : (a.e.d < b.e.d ? 1 : -1)).map(x => x.e);
    }
    const lastContact = p => sorted(p).find(e => e.k !== 'try') || null;
    // the latest "Tried, no answer" since the last real contact, or null
    function lastTry(p) {
        const s = sorted(p), ti = s.findIndex(e => e.k === 'try'), ci = s.findIndex(e => e.k !== 'try');
        return ti >= 0 && (ci < 0 || ti < ci) ? s[ti] : null;
    }

    // where a person stands today
    //   kind: 'paused' | 'never' | 'over' (overdue) | 'today' | 'soon' (due within 2 days) | 'ok'
    function status(p, today) {
        const last = lastContact(p), tr = lastTry(p);
        const o = { last, since: last ? diff(last.d, today) : null, tried: tr, triedAgo: tr ? diff(tr.d, today) : null };
        if (p.paused) return Object.assign(o, { kind: 'paused', due: null, days: null });
        if (!last) return Object.assign(o, { kind: 'never', due: today, days: 0 });
        let due = addDays(last.d, p.every);
        if (p.resumed && p.resumed > due && p.resumed <= today) due = p.resumed;   // overdue before a pause: due on the day it was resumed, not years late
        const d = diff(due, today);   // > 0 overdue by d days, 0 due today, < 0 due in -d days
        const kind = d > 0 ? 'over' : d === 0 ? 'today' : d >= -2 ? 'soon' : 'ok';
        return Object.assign(o, { kind, due, days: d });
    }
    // the order of the boxes: most overdue first, then due today, then the soonest; paused at the end
    function order(people, today) {
        return people.map(p => ({ p, s: status(p, today) })).sort((a, b) => {
            const pa = a.s.kind === 'paused', pb = b.s.kind === 'paused';
            if (pa !== pb) return pa ? 1 : -1;
            if (pa) return a.p.name.localeCompare(b.p.name);
            if (a.s.due !== b.s.due) return a.s.due < b.s.due ? -1 : 1;
            const na = a.s.kind === 'never', nb = b.s.kind === 'never';
            if (na !== nb) return na ? 1 : -1;                      // on one day: the ones already late before the never-contacted
            const sa = a.s.since == null ? -1 : a.s.since, sb = b.s.since == null ? -1 : b.s.since;
            if (sa !== sb) return sb - sa;                           // then the longest since last time
            return a.p.name.localeCompare(b.p.name);
        });
    }
    function summary(people, today) {
        const rows = order(people, today), o = { over: [], today: [], never: [], soon: [], ok: [], paused: [], next: null };
        rows.forEach(r => o[r.s.kind].push(r));
        o.now = o.over.concat(o.today, o.never);                      // get in touch today
        o.next = o.soon.concat(o.ok)[0] || null;
        return o;
    }
    // contacts in the last 30 days (today and the 29 days before)
    function last30(p, today) {
        const from = addDays(today, -29), c = { call: 0, msg: 0, met: 0, any: 0, try: 0 };
        p.log.forEach(e => { if (e.d >= from && e.d <= today) c[e.k]++; });
        return c;
    }
    function checkEntry(e, today) {
        if (!isDay(e.d)) return 'Pick the day.';
        if (e.d > today) return 'That day is in the future. Pick today or an earlier day.';
        if (e.d < '1900-01-01') return 'Pick a later day.';
        if (!KINDS[e.k]) return 'Pick what you did.';
        return null;
    }

    // ---------- time zones and good times to call ----------
    // their clock now: minutes after midnight, weekday and the offset from your clock in minutes
    function clock(tz, now) {
        const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' });
        const parts = {}; f.formatToParts(now).forEach(x => { parts[x.type] = x.value; });
        const h = Number(parts.hour) % 24, m = Number(parts.minute);
        const theirs = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), h, m);
        const mine = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
        return { min: h * 60 + m, wd: parts.weekday, ahead: Math.round((theirs - mine) / 60000) };
    }
    function validTz(tz) {
        if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
        try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
    }
    // is "min" inside the window from..to (minutes after midnight)? A window such as 22:00 to 06:00 crosses midnight.
    const inWin = (min, w) => w.from < w.to ? min >= w.from && min < w.to : min >= w.from || min < w.to;
    // advice for one moment: { good, untilEnd } inside the window, { good:false, untilStart } outside
    function advice(min, w) {
        if (!w) return { good: true, any: true };
        if (inWin(min, w)) return { good: true, untilEnd: (w.to - min + 1440) % 1440 || 1440 };
        return { good: false, untilStart: (w.from - min + 1440) % 1440 };
    }
    const hm = min => pad(Math.floor(min / 60) % 24) + ':' + pad(min % 60);
    function fmtMin(min, loc) {
        try { return new Intl.DateTimeFormat(loc || 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1) + min * 60000)); }
        catch (e) { return hm(min); }
    }
    function fmtGap(mins) {
        const h = Math.floor(mins / 60), m = mins % 60;
        if (!h) return m + ' min';
        return h + ' h' + (m ? ' ' + m + ' min' : '');
    }
    function aheadWords(ahead) {
        if (!ahead) return 'same time as you';
        const a = Math.abs(ahead), h = Math.floor(a / 60), m = a % 60;
        const t = (h ? h + (h === 1 ? ' hour' : ' hours') : '') + (m ? (h ? ' ' : '') + m + ' min' : '');
        return t + (ahead > 0 ? ' ahead of you' : ' behind you');
    }
    // a short place name from an IANA zone: "America/Argentina/Buenos_Aires" -> "Buenos Aires"
    const tzCity = tz => tz.split('/').pop().replace(/_/g, ' ');

    // ---------- words ----------
    function fmtDate(s, loc, opt) {
        const o = { day: 'numeric', month: 'short', timeZone: 'UTC' };
        if (opt === true || opt === 'year') o.year = 'numeric';
        if (opt === 'wd') o.weekday = 'short';
        try { return new Intl.DateTimeFormat(loc || 'en-GB', o).format(new Date(dayNum(s) * DAY)); } catch (e) { return s; }
    }
    const daysWord = n => n + (n === 1 ? ' day' : ' days');
    const ago = n => n === 0 ? 'today' : n === 1 ? 'yesterday' : daysWord(n) + ' ago';
    const everyWords = n => n === 1 ? 'every day' : n === 7 ? 'every week' : n === 14 ? 'every 2 weeks' : n === 30 ? 'every month' : n === 60 ? 'every 2 months' : n === 90 ? 'every 3 months' : 'every ' + n + ' days';
    // the big line in a person's box
    function headline(s) {
        if (s.kind === 'paused') return 'Paused';
        if (s.kind === 'never') return 'Get in touch today';
        if (s.kind === 'over') return daysWord(s.days) + ' overdue';
        if (s.kind === 'today') return 'Due today';
        return s.days === -1 ? 'Due tomorrow' : 'Due in ' + daysWord(-s.days);
    }
    // "called 9 days ago (Sun 18 Oct)"
    function lastWords(s, loc) {
        if (!s.last) return 'No contact logged yet';
        return 'Last ' + VERB[s.last.k] + ' ' + ago(s.since) + (s.since > 1 ? ' (' + fmtDate(s.last.d, loc, 'wd') + ')' : '');
    }
    // plain text of who to contact, for Copy and Email
    function summaryText(people, today, loc) {
        const sm = summary(people, today), L = [];
        L.push('Keep in touch: ' + fmtDate(today, loc, 'wd'));
        const line = r => '- ' + r.p.name + ': ' + headline(r.s).toLowerCase().replace(/^get in touch today$/, 'no contact logged yet') +
            (r.s.last ? ' (' + lastWords(r.s, loc).replace(/^Last/, 'last') + ', aim ' + everyWords(r.p.every) + ')' : ' (aim ' + everyWords(r.p.every) + ')');
        if (sm.now.length) { L.push('', 'Get in touch today:'); sm.now.forEach(r => L.push(line(r))); }
        else L.push('', 'Everyone is up to date.');
        const later = sm.soon.concat(sm.ok);
        if (later.length) { L.push('', 'Coming up:'); later.forEach(r => L.push('- ' + r.p.name + ': ' + headline(r.s).toLowerCase() + ' (' + fmtDate(r.s.due, loc, 'wd') + ')')); }
        if (sm.paused.length) L.push('', 'Paused: ' + sm.paused.map(r => r.p.name).join(', '));
        return L.join('\n');
    }
    function namesList(names) {
        if (names.length <= 1) return names.join('');
        return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    }

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, people: [] });
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    const str = (x, max) => typeof x === 'string' ? x.slice(0, max) : '';
    const rid = pre => pre + Math.random().toString(36).slice(2, 10);
    function cleanEntry(e) {
        if (!e || typeof e !== 'object' || !isDay(e.d) || !KINDS[e.k]) return null;
        const o = { id: str(e.id, 40) || rid('e'), d: e.d, k: e.k };
        const n = cleanNote(str(e.n, 400), 200); if (n) o.n = n;
        return o;
    }
    function cleanWin(w) {
        if (!w || typeof w !== 'object' || !int(w.from, 0, 1439) || !int(w.to, 0, 1439) || w.from === w.to) return null;
        return { from: w.from, to: w.to };
    }
    function cleanPerson(p) {
        if (!p || typeof p !== 'object') return null;
        const name = cleanName(str(p.name, 200));
        if (!name || !int(p.every, 1, 365)) return null;
        const o = { id: str(p.id, 40) || rid('p'), name, every: p.every, log: [] };
        const note = cleanNote(str(p.note, 1000), 500); if (note) o.note = note;
        if (p.tz && validTz(p.tz)) o.tz = p.tz;
        const w = cleanWin(p.win); if (w) o.win = w;
        if (isDay(p.paused)) o.paused = p.paused;
        if (isDay(p.resumed)) o.resumed = p.resumed;
        if (isDay(p.added)) o.added = p.added;
        (Array.isArray(p.log) ? p.log : []).slice(0, MAX_LOG).forEach(e => { const x = cleanEntry(e); if (x) o.log.push(x); });
        return o;
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.people)) return null;
        const o = emptyState(), seen = new Set();
        s.people.slice(0, MAX_PEOPLE).forEach(p => {
            const x = cleanPerson(p); if (!x) return;
            if (seen.has(x.id)) x.id = rid('p');
            seen.add(x.id); o.people.push(x);
        });
        return o;
    }

    const api = { KINDS, VERB, localDay, isDay, addDays, diff, parseEvery, cleanName, cleanNote, sorted, lastContact, lastTry, status, order, summary, last30, checkEntry,
        clock, validTz, inWin, advice, hm, fmtMin, fmtGap, aheadWords, tzCity, fmtDate, daysWord, ago, everyWords, headline, lastWords, summaryText, namesList,
        emptyState, cleanPerson, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KIT = api;
})(typeof window !== 'undefined' ? window : this);
