// Study Planner and Exam Countdown: the dates, the plan and the words, with no page code, so tests.js can check it in node.
// Dates are plain "YYYY-MM-DD" strings and day maths is done in UTC, so clock changes (summer time) never shift a day.
// The plan spreads each exam's topics over the study days before it, earliest exam first, as evenly as the dates allow:
// every day it takes the number of topics that keeps every exam on track (topics left divided by study days left,
// rounded), so a day never gets more than it needs and every topic is done before its exam's revision days.
(function (root) {
    'use strict';
    const MAX_EXAMS = 40, MAX_TOPICS = 200, MAX_NAME = 60, MAX_TOPIC = 80, MAX_PLACE = 60, MAX_REV = 14, MAX_OFF = 366;
    const DAY = 86400000;

    // ---------- dates ----------
    const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
    function valid(s) {
        const m = ISO.exec(String(s || '')); if (!m) return false;
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
        return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 2000 && +m[1] <= 2100;
    }
    const ms = s => { const m = ISO.exec(s); return Date.UTC(+m[1], +m[2] - 1, +m[3]); };
    const iso = t => new Date(t).toISOString().slice(0, 10);
    const addDays = (s, n) => iso(ms(s) + n * DAY);
    const diff = (a, b) => Math.round((ms(b) - ms(a)) / DAY);      // days from a to b
    const weekday = s => new Date(ms(s)).getUTCDay();              // 0 Sunday .. 6 Saturday
    const todayOf = d => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const local = s => { const m = ISO.exec(s); return new Date(+m[1], +m[2] - 1, +m[3], 12); };
    function fmtDay(s, loc, long) {
        const o = long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' };
        try { return new Intl.DateTimeFormat(loc || undefined, o).format(local(s)); } catch (e) { return s; }
    }
    function fmtDate(s, loc) {
        try { return new Intl.DateTimeFormat(loc || undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(local(s)); } catch (e) { return s; }
    }
    // "Today", "Tomorrow", "In 19 days", "2 days ago"
    function untilWords(today, date) {
        const n = diff(today, date);
        if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow';
        if (n > 1) return 'In ' + n + ' days';
        return n === -1 ? 'Yesterday' : (-n) + ' days ago';
    }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
    function fmtTime(t, loc) {
        if (!/^\d{2}:\d{2}$/.test(t || '')) return '';
        const [h, m] = t.split(':').map(Number);
        try { return new Intl.DateTimeFormat(loc || undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2026, 0, 5, h, m)); } catch (e) { return t; }
    }

    // ---------- typed text ----------
    const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    // A pasted list: one topic per line; a single line with commas or semicolons is split on them.
    // Bullets and numbering ("- ", "• ", "1. ", "2) ", "a) ") are removed. Repeats (any case) are skipped.
    function parseTopics(text, existing) {
        const raw = String(text == null ? '' : text).replace(/\r/g, '');
        let lines = raw.split('\n');
        if (lines.filter(l => l.trim()).length === 1) lines = raw.split(/[,;\n]/);
        const seen = new Set((existing || []).map(n => n.toLowerCase()));
        const names = []; let repeats = 0, cut = 0;
        for (let l of lines) {
            l = l.replace(/^\s*(?:[-*•·◦▪–—>]+|\(?\d{1,3}[.)]|\(?[a-z][.)]|\[[ x]?\])\s+/i, '');
            l = clean(l, 1000);
            if (!l) continue;
            if (l.length > MAX_TOPIC) { l = l.slice(0, MAX_TOPIC).trim(); cut++; }
            const k = l.toLowerCase();
            if (seen.has(k)) { repeats++; continue; }
            seen.add(k); names.push(l);
        }
        return { names, repeats, cut };
    }

    // ---------- state ----------
    const blank = () => ({ v: 1, seq: 0, exams: [], rest: [], off: [] });
    // Checks every saved or restored value; anything odd is dropped or fixed, never trusted.
    function normalize(o) {
        if (!o || typeof o !== 'object' || !Array.isArray(o.exams)) return null;
        const s = blank(), ids = new Set();
        s.seq = Number.isInteger(o.seq) && o.seq >= 0 && o.seq < 1e9 ? o.seq : 0;
        for (const e of o.exams.slice(0, MAX_EXAMS)) {
            if (!e || typeof e !== 'object') continue;
            const name = clean(e.name, MAX_NAME); if (!name || !valid(e.date)) continue;
            let id = typeof e.id === 'string' && /^[\w-]{1,20}$/.test(e.id) && !ids.has(e.id) ? e.id : 'x' + (++s.seq);
            while (ids.has(id)) id = 'x' + (++s.seq);
            ids.add(id);
            const rev = Number.isInteger(e.rev) && e.rev >= 0 && e.rev <= MAX_REV ? e.rev : 1;
            const topics = [], seen = new Set();
            for (const t of Array.isArray(e.topics) ? e.topics.slice(0, MAX_TOPICS) : []) {
                if (!t || typeof t !== 'object') continue;
                const tn = clean(t.name, MAX_TOPIC); if (!tn || seen.has(tn.toLowerCase())) continue;
                seen.add(tn.toLowerCase());
                let tid = typeof t.id === 'string' && /^[\w-]{1,20}$/.test(t.id) && !ids.has(t.id) ? t.id : 't' + (++s.seq);
                while (ids.has(tid)) tid = 't' + (++s.seq);
                ids.add(tid);
                topics.push({ id: tid, name: tn, done: valid(t.done) ? t.done : null });
            }
            s.exams.push({ id, name, date: e.date, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time || '') ? e.time : '', place: typeof e.place === 'string' ? clean(e.place, MAX_PLACE) : '', rev, topics });
        }
        s.rest = [...new Set(Array.isArray(o.rest) ? o.rest.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [])].sort();
        s.off = [...new Set(Array.isArray(o.off) ? o.off.filter(valid) : [])].sort().slice(-MAX_OFF);
        // make sure new ids never clash with old ones
        let max = s.seq;
        ids.forEach(i => { const n = +i.replace(/^\D+/, ''); if (Number.isInteger(n) && n > max) max = n; });
        s.seq = max;
        return s;
    }
    const byDate = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : 0;

    // Keeps ticks and ids when a topic list is edited as text: lines that match an old topic (any case) keep it.
    function mergeTopics(old, names, nextId) {
        const map = new Map(old.map(t => [t.name.toLowerCase(), t]));
        return names.map(n => { const o = map.get(n.toLowerCase()); return o ? { id: o.id, name: n, done: o.done } : { id: nextId(), name: n, done: null }; });
    }

    // ---------- the plan ----------
    // Returns the days from today to the last exam, each with its items, and per-exam facts.
    function plan(state, today) {
        const rest = new Set(state.rest), off = new Set(state.off);
        const isStudy = d => !rest.has(weekday(d)) && !off.has(d);
        const exams = state.exams.slice().sort(byDate);
        const upcoming = exams.filter(e => e.date >= today);
        const info = {};
        const out = { today, days: [], info, study: [], maxLoad: 0, left: 0, unplanned: 0, busyDays: 0 };
        exams.forEach(e => {
            const done = e.topics.filter(t => t.done).length;
            info[e.id] = { daysLeft: diff(today, e.date), total: e.topics.length, done, left: e.topics.length - done, past: e.date < today,
                studyDays: 0, rev: 0, revWanted: e.rev, revShort: false, revDays: [], last: null, unplanned: 0, noDays: false };
        });
        if (!upcoming.length) return out;
        const lastDate = upcoming[upcoming.length - 1].date;
        const G = [];                                   // study days from today to the day before the last exam
        for (let d = today; d < lastDate; d = addDays(d, 1)) if (isStudy(d)) G.push(d);
        const gi = new Map(G.map((d, i) => [d, i]));
        out.study = G;

        // per exam: its study days, revision days and the last day for new topics
        const groups = [];
        upcoming.forEach((e, order) => {
            const I = info[e.id], S = G.filter(d => d < e.date);
            I.studyDays = S.length;
            const rev = Math.min(e.rev, Math.max(0, S.length - 1));
            I.rev = rev; I.revShort = rev < e.rev && S.length > 0;
            I.revDays = S.slice(S.length - rev);
            const todo = e.topics.filter(t => !t.done || t.done === today);
            if (!S.length) { I.noDays = true; I.unplanned = e.topics.filter(t => !t.done).length; out.unplanned += I.unplanned; return; }
            I.last = S[S.length - rev - 1];
            groups.push({ e, order, dl: gi.get(I.last), todo });
        });
        groups.sort((a, b) => a.dl - b.dl || a.order - b.order);

        // the queue: earliest deadline first, each exam's topics in the order typed
        const queue = []; groups.forEach((g, k) => g.todo.forEach(t => queue.push({ t, e: g.e, k })));
        const doneToday = queue.filter(q => q.t.done === today);
        let rem = queue.filter(q => q.t.done !== today);
        out.left = rem.length;
        const roundHalfUp = (c, a) => Math.floor((2 * c + a) / (2 * a));
        // topics needed on day i: for every exam (with all earlier ones), topics left over study days left, rounded;
        // "ticked" are topics already ticked today, which count towards the exams they belong to
        const need = (list, i, ticked) => {
            let n = 0, c = 0, t = 0;
            const counts = groups.map(() => 0), tk = groups.map(() => 0);
            list.forEach(q => counts[q.k]++); (ticked || []).forEach(q => { counts[q.k]++; tk[q.k]++; });
            groups.forEach((g, k) => {
                c += counts[k]; t += tk[k];
                if (g.dl < i) return;
                n = Math.max(n, roundHalfUp(c, g.dl - i + 1) - t);
            });
            return n;
        };
        const topicsOn = new Map();
        G.forEach((d, i) => {
            let take;
            if (i === 0) {
                // topics ticked today stay on today's list, so ticking never pulls a new topic in or pushes one out
                take = need(rem, 0, doneToday);
                const picked = doneToday.concat(rem.slice(0, take));
                picked.sort((a, b) => queue.indexOf(a) - queue.indexOf(b));
                topicsOn.set(d, picked);
            } else {
                take = need(rem, i, null);
                topicsOn.set(d, rem.slice(0, take));
            }
            rem = rem.slice(take);
        });

        // the days, with exams, revision and topics
        const revOn = new Map(); groups.forEach(g => info[g.e.id].revDays.forEach(d => { if (!revOn.has(d)) revOn.set(d, []); revOn.get(d).push(g.e); }));
        const examOn = new Map(); upcoming.forEach(e => { if (!examOn.has(e.date)) examOn.set(e.date, []); examOn.get(e.date).push(e); });
        for (let d = today; d <= lastDate; d = addDays(d, 1)) {
            const items = [];
            (examOn.get(d) || []).forEach(e => items.push({ type: 'exam', exam: e }));
            (revOn.get(d) || []).forEach(e => items.push({ type: 'revise', exam: e }));
            (topicsOn.get(d) || []).forEach(q => items.push({ type: 'topic', exam: q.e, topic: q.t }));
            const study = isStudy(d), n = (topicsOn.get(d) || []).length, todo = (topicsOn.get(d) || []).filter(q => !q.t.done).length;
            if (todo > out.maxLoad) out.maxLoad = todo;   // the busiest day counts work still to do, not topics already ticked today
            out.days.push({ date: d, study, rest: rest.has(weekday(d)), off: off.has(d), items, topics: n });
        }
        groups.forEach(g => {
            const ts = []; topicsOn.forEach((list, d) => list.forEach(q => { if (q.e === g.e) ts.push(d); }));
            info[g.e.id].finish = ts.length ? ts.sort().pop() : null;
        });
        return out;
    }

    // "Today: 2 topics" style words for one day
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // ---------- sharing ----------
    function summary(state, p, loc, limit) {
        const lines = ['Study plan and exam countdown (' + fmtDate(p.today, loc) + ')', ''];
        const up = state.exams.slice().sort(byDate).filter(e => e.date >= p.today);
        if (!up.length) return lines.concat('No upcoming exams.').join('\n');
        lines.push('EXAMS');
        up.forEach(e => {
            const I = p.info[e.id], t = fmtTime(e.time, loc);
            lines.push('- ' + e.name + ': ' + fmtDate(e.date, loc) + (t ? ' at ' + t : '') + (e.place ? ', ' + e.place : '') + ' (' + untilWords(p.today, e.date).toLowerCase() + ')' +
                (I.total ? ', ' + I.done + ' of ' + plural(I.total, 'topic') + ' done' : ''));
        });
        lines.push('', 'PLAN');
        let shown = 0;
        for (const day of p.days) {
            if (limit && shown >= limit) { lines.push('...'); break; }
            shown++;
            const head = (day.date === p.today ? 'Today, ' : '') + fmtDay(day.date, loc);
            if (!day.items.length) { lines.push(head + ': ' + (day.study ? 'nothing planned' : 'rest day')); continue; }
            lines.push(head + ':');
            day.items.forEach(it => lines.push('  ' + itemText(it, loc, p.today)));
        }
        return lines.join('\n');
    }
    function itemText(it, loc) {
        if (it.type === 'exam') { const t = fmtTime(it.exam.time, loc); return 'EXAM: ' + it.exam.name + (t ? ' at ' + t : '') + (it.exam.place ? ', ' + it.exam.place : ''); }
        if (it.type === 'revise') return 'Revise ' + it.exam.name + (it.exam.topics.length ? ': go over all ' + plural(it.exam.topics.length, 'topic') : '');
        return (it.topic.done ? '[x] ' : '[ ] ') + it.exam.name + ': ' + it.topic.name;
    }

    // Calendar file with one event per upcoming exam and a reminder the day before.
    function ics(state, today, stamp) {
        const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
        const fold = l => { const out = []; while (l.length > 74) { out.push(l.slice(0, 74)); l = ' ' + l.slice(74); } out.push(l); return out.join('\r\n'); };
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Study Planner and Exam Countdown//EN', 'CALSCALE:GREGORIAN'];
        state.exams.filter(e => e.date >= today).sort(byDate).forEach(e => {
            const d = e.date.replace(/-/g, '');
            L.push('BEGIN:VEVENT', 'UID:' + e.id + '-' + d + '@study-planner-and-exam-countdown', 'DTSTAMP:' + stamp);
            if (e.time) { L.push('DTSTART:' + d + 'T' + e.time.replace(':', '') + '00', 'DURATION:PT2H'); }
            else L.push('DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + addDays(e.date, 1).replace(/-/g, ''));
            L.push('SUMMARY:' + esc(e.name + ' exam'));
            if (e.place) L.push('LOCATION:' + esc(e.place));
            if (e.topics.length) L.push('DESCRIPTION:' + esc('Topics: ' + e.topics.map(t => t.name).join(', ')));
            L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.name + ' exam tomorrow'), 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT');
        });
        L.push('END:VCALENDAR');
        return L.map(fold).join('\r\n') + '\r\n';
    }

    const api = { MAX_EXAMS, MAX_TOPICS, MAX_NAME, MAX_TOPIC, MAX_PLACE, MAX_REV, DAYS, valid, addDays, diff, weekday, todayOf, fmtDay, fmtDate, fmtTime, untilWords, plural,
        clean, parseTopics, blank, normalize, mergeTopics, byDate, plan, summary, itemText, ics };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SPC = api;
})(this);
