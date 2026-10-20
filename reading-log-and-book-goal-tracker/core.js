// Reading Log and Book Goal Tracker: the logic, with no page code, so tests.js can check it in Node and in test.html.
// Dates are local 'YYYY-MM-DD' strings. Positions are whole numbers: a page, a percent (ebook) or minutes (audiobook).
(function (root) {
    'use strict';
    const FORMATS = ['pages', 'percent', 'audio'];
    const STATUSES = ['reading', 'want', 'finished', 'stopped'];
    const LIMITS = { pages: 20000, audio: 200 * 60, goal: 1000, title: 150, author: 100 };
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;
    function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
    function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function todayIso(now) { return iso(now || new Date()); }
    function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
    function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); } // b - a in days
    const yearOf = s => Number(s.slice(0, 4));
    const daysInYear = y => (new Date(y, 1, 29).getMonth() === 1 ? 366 : 365);
    const dayOfYear = s => diffDays(yearOf(s) + '-01-01', s) + 1;
    function fmtDate(s) { const d = parse(s); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
    function fmtDateY(s) { const d = parse(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }

    // ---------- amounts ----------
    function fmtMin(m) { const h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : r + ' min'; }
    function fmtAmount(format, n) {
        if (format === 'percent') return n + '%';
        if (format === 'audio') return fmtMin(n);
        return n + (n === 1 ? ' page' : ' pages');
    }
    function fmtPos(book, at) {
        if (book.format === 'percent') return at + '%';
        if (book.format === 'audio') return fmtMin(at) + ' in';
        return 'page ' + at;
    }
    const unitWord = f => (f === 'percent' ? 'percent' : f === 'audio' ? 'minutes' : 'pages');
    const totalOf = b => (b.format === 'percent' ? 100 : b.total);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    // ---------- one book ----------
    // log entries sorted by day, then by the order they were typed
    const sortedLog = b => b.log.map((e, i) => ({ d: e.d, at: e.at, i })).sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : x.i - y.i));
    function position(b) { const l = sortedLog(b); return l.length ? l[l.length - 1].at : b.start; }
    const leftOf = b => Math.max(0, totalOf(b) - position(b));
    // what was read each day: the sum of the steps forward (going back to re-read counts nothing, re-read pages count again)
    function dailyAmounts(b) {
        const out = {}; let prev = b.start;
        sortedLog(b).forEach(e => { const step = Math.max(0, e.at - prev); out[e.d] = (out[e.d] || 0) + step; prev = e.at; });
        return out;
    }
    const readOn = (b, day) => b.log.some(e => e.d === day);
    const totalRead = b => Object.values(dailyAmounts(b)).reduce((a, n) => a + n, 0);

    // pace: what was read in the last 30 days (or since the first reading, if later), per calendar day
    function pace(b, today) {
        const l = sortedLog(b); if (!l.length) return null;
        const from = l[0].d > addDays(today, -29) ? l[0].d : addDays(today, -29);
        const am = dailyAmounts(b); let sum = 0;
        Object.keys(am).forEach(d => { if (d >= from && d <= today) sum += am[d]; });
        const days = diffDays(from, today) + 1;
        if (sum <= 0 || days <= 0) return null;
        return { perDay: sum / days, days, sum };
    }
    // the first day still open for reading: tomorrow if the person has already read this book today
    const startDay = (b, today) => (readOn(b, today) ? addDays(today, 1) : today);
    function estimate(b, today) {
        const p = pace(b, today), left = leftOf(b);
        if (!p || left <= 0) return null;
        const days = Math.ceil(left / p.perDay - 1e-9), start = startDay(b, today);
        return { perDay: p.perDay, days, date: addDays(start, days - 1) };
    }
    function finishPlan(b, today) {
        if (!b.by) return null;
        const left = leftOf(b); if (left <= 0) return null;
        if (b.by < today) return { passed: true, left, by: b.by };
        let start = startDay(b, today);
        if (start > b.by) start = today; // finish-by is today and today is logged: what is left is still for today
        const days = diffDays(start, b.by) + 1;
        return { passed: false, left, by: b.by, days, perDay: Math.ceil(left / days), from: start === today ? 'today' : 'tomorrow' };
    }
    // check a new reading before it is saved. Returns {error} or {ok, back} where back means lower than the last time.
    function checkLog(b, day, at, today) {
        if (!isIso(day)) return { error: 'Pick the day you read.' };
        if (day > today) return { error: 'That day has not come yet. Pick today or an earlier day.' };
        if (!Number.isInteger(at) || at < 0) return { error: b.format === 'audio' ? 'Type how far in you are, in hours and minutes.' : b.format === 'percent' ? 'Type a whole percent from 0 to 100.' : 'Type the page number you stopped on.' };
        const total = totalOf(b);
        if (at > total) return { error: b.format === 'pages' ? 'This book has ' + total + ' pages. Type a page from 0 to ' + total + ', or change the pages under Edit.' : b.format === 'percent' ? 'Type a percent from 0 to 100.' : 'This audiobook is ' + fmtMin(total) + ' long. Type a time up to that, or change the length under Edit.' };
        const l = sortedLog(b);
        const before = l.filter(e => e.d <= day), after = l.filter(e => e.d > day);
        const prev = before.length ? before[before.length - 1].at : b.start;
        if (after.length) {
            const next = after[0].at;
            if (at < prev || at > next) return { error: 'On ' + fmtDate(after[0].d) + ' you were at ' + fmtPos(b, next) + '. For ' + fmtDate(day) + ' type ' + (prev === next ? fmtPos(b, prev) : 'from ' + fmtPos(b, prev) + ' to ' + fmtPos(b, next)) + '.' };
            return { ok: true, back: false };
        }
        if (at === prev) return { error: 'You were already at ' + fmtPos(b, prev) + '. Type where you stopped this time.' };
        return { ok: true, back: at < prev, prev };
    }

    // ---------- all books ----------
    function finishedIn(state, year) {
        return state.books.filter(b => b.status === 'finished' && b.finished && yearOf(b.finished) === year)
            .sort((a, b) => (a.finished < b.finished ? -1 : a.finished > b.finished ? 1 : 0));
    }
    // the yearly goal: how many should be done by today, ahead or behind, and the pace for the rest of the year
    function yearSummary(state, year, today) {
        const done = finishedIn(state, year).length, goal = state.goals[String(year)] || 0;
        const out = { year, done, goal };
        if (!goal) return out;
        const diy = daysInYear(year), ty = yearOf(today);
        const doy = ty === year ? dayOfYear(today) : ty > year ? diy : 0;
        out.target = Math.floor(goal * doy / diy);
        out.ahead = done - out.target;
        out.remaining = Math.max(0, goal - done);
        out.daysLeft = ty === year ? diy - doy + 1 : ty < year ? diy : 0;
        if (out.remaining && out.daysLeft) out.every = Math.round(out.daysLeft / out.remaining * 10) / 10;
        out.over = ty > year;
        return out;
    }
    // per day, across every book: pages, percent and minutes kept apart
    function daily(state) {
        const out = {};
        state.books.forEach(b => {
            const am = dailyAmounts(b);
            Object.keys(am).forEach(d => { const o = out[d] || (out[d] = { pages: 0, percent: 0, audio: 0, any: false }); o[b.format] += am[d]; o.any = true; });
        });
        return out;
    }
    // days in a row with any reading logged. If today is not logged yet the streak still counts up to yesterday.
    function streak(state, today) {
        const days = Object.keys(daily(state)).filter(d => d <= today).sort();
        const set = new Set(days);
        let current = 0, d = set.has(today) ? today : addDays(today, -1);
        while (set.has(d)) { current++; d = addDays(d, -1); }
        let longest = 0, run = 0, last = null;
        days.forEach(x => { run = last && diffDays(last, x) === 1 ? run + 1 : 1; longest = Math.max(longest, run); last = x; });
        return { current, longest, readToday: set.has(today) };
    }
    function lastDays(state, today, n) {
        const all = daily(state), out = [];
        for (let i = n - 1; i >= 0; i--) { const d = addDays(today, -i); out.push(Object.assign({ d }, all[d] || { pages: 0, percent: 0, audio: 0, any: false })); }
        return out;
    }
    function sumDays(days) { return days.reduce((a, x) => ({ pages: a.pages + x.pages, percent: a.percent + x.percent, audio: a.audio + x.audio, n: a.n + (x.any ? 1 : 0) }), { pages: 0, percent: 0, audio: 0, n: 0 }); }
    function amountsText(s) {
        const parts = [];
        if (s.pages) parts.push(fmtAmount('pages', s.pages));
        if (s.percent) parts.push(s.percent + '% of ebooks');
        if (s.audio) parts.push(fmtMin(s.audio) + ' listened');
        return parts.join(', ');
    }
    function listText(state, year, today) {
        const list = finishedIn(state, year), y = yearSummary(state, year, today);
        let head = 'Books I read in ' + year + ': ' + list.length + (y.goal ? ' of my goal of ' + y.goal : '');
        const lines = list.map((b, i) => (i + 1) + '. ' + b.title + (b.author ? ' by ' + b.author : '') + ' (finished ' + fmtDateY(b.finished) + ')');
        if (!lines.length) lines.push('None finished yet.');
        const now = state.books.filter(b => b.status === 'reading');
        if (now.length) { lines.push('', 'Reading now:'); now.forEach(b => lines.push('- ' + b.title + (b.author ? ' by ' + b.author : '') + ', ' + Math.floor(100 * position(b) / totalOf(b)) + '% done')); }
        return head + '\n\n' + lines.join('\n') + '\n';
    }

    // ---------- reading what was typed ----------
    // "182", " 182 ", "1,204" -> number; blank or nonsense -> NaN
    function readInt(s) {
        const t = String(s == null ? '' : s).trim().replace(/[,\s]/g, '');
        return /^\d{1,7}$/.test(t) ? Number(t) : NaN;
    }
    function readHM(h, m) {
        const hs = String(h == null ? '' : h).trim(), ms = String(m == null ? '' : m).trim();
        if (!hs && !ms) return NaN;
        const H = hs ? readInt(hs) : 0, M = ms ? readInt(ms) : 0;
        if (Number.isNaN(H) || Number.isNaN(M) || M > 59 && hs) return NaN;
        return H * 60 + M;
    }
    const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

    // ---------- saved state ----------
    function emptyState() { return { v: 1, books: [], goals: {}, seq: 1 }; }
    // checks every value of a saved or restored file; returns a clean state or null
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.books)) return null;
        const out = emptyState(), ids = new Set();
        if (s.goals && typeof s.goals === 'object') Object.keys(s.goals).forEach(k => { const g = s.goals[k]; if (/^\d{4}$/.test(k) && Number.isInteger(g) && g > 0 && g <= LIMITS.goal) out.goals[k] = g; });
        for (const b of s.books.slice(0, 5000)) {
            if (!b || typeof b !== 'object') return null;
            const format = FORMATS.includes(b.format) ? b.format : null, status = STATUSES.includes(b.status) ? b.status : null;
            const title = cleanText(b.title, LIMITS.title);
            if (!format || !status || !title || !isIso(b.added)) return null;
            const total = format === 'percent' ? 100 : b.total;
            const max = format === 'audio' ? LIMITS.audio : format === 'pages' ? LIMITS.pages : 100;
            if (!Number.isInteger(total) || total < 1 || total > max) return null;
            if (!Number.isInteger(b.start) || b.start < 0 || b.start >= total) return null;
            if (!Array.isArray(b.log)) return null;
            const log = [];
            for (const e of b.log.slice(0, 20000)) { if (!e || !isIso(e.d) || !Number.isInteger(e.at) || e.at < 0 || e.at > total) return null; log.push({ d: e.d, at: e.at }); }
            if (b.by != null && b.by !== '' && !isIso(b.by)) return null;
            if (status === 'finished' && !isIso(b.finished)) return null;
            let id = Number.isInteger(b.id) && b.id > 0 ? b.id : 0;
            if (!id || ids.has(id)) id = 0;
            const clean = { id, title, author: cleanText(b.author, LIMITS.author), format, total, start: b.start, status, added: b.added, by: b.by || '', finished: status === 'finished' ? b.finished : '', log };
            out.books.push(clean); if (id) ids.add(id);
        }
        let next = Math.max(0, ...out.books.map(b => b.id)) + 1;
        out.books.forEach(b => { if (!b.id) b.id = next++; });
        out.seq = Math.max(next, Number.isInteger(s.seq) ? s.seq : 1);
        return out;
    }

    const api = { FORMATS, LIMITS, isIso, iso, parse, todayIso, addDays, diffDays, yearOf, daysInYear, dayOfYear, fmtDate, fmtDateY, fmtMin, fmtAmount, fmtPos, unitWord, totalOf, plural,
        sortedLog, position, leftOf, dailyAmounts, readOn, totalRead, pace, estimate, finishPlan, checkLog, finishedIn, yearSummary, daily, streak, lastDays, sumDays, amountsText, listText,
        readInt, readHM, cleanText, emptyState, validate };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.ReadCore = api;
})(this);
