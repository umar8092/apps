// Qaza Prayer and Fast Tracker: the logic, with no page code, so tests.js can check it in Node and in test.html.
// Dates are local 'YYYY-MM-DD' strings. Every count is a whole number. The app only counts what the person enters; it gives no rulings.
(function (root) {
    'use strict';
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'witr'];
    const NAMES = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha', witr: 'Witr' };
    const LIMITS = { owed: 99999, days: 36600, perDay: 50, fastsPerWeek: 7, fastDays: 30, ramadans: 80, name: 30, people: 12 };

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
    function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;
    const todayIso = now => iso(now || new Date());
    function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
    const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000); // b - a in days
    function fmtDate(s) { const d = parse(s); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
    function fmtDateY(s) { const d = parse(s); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
    function fmtMonthY(s) { const d = parse(s); return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()] + ' ' + d.getFullYear(); }
    // the same day N years later (29 Feb becomes 28 Feb in a normal year)
    function addYears(s, n) {
        const [y, m, d] = s.split('-').map(Number), ny = y + n;
        const last = new Date(ny, m, 0).getDate();
        return ny + '-' + pad(m) + '-' + pad(Math.min(d, last));
    }

    // ---------- numbers ----------
    const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const plural = (n, one, many) => fmt(n) + ' ' + (n === 1 ? one : many);
    // whole numbers only; "1,204" and spaces are fine, anything else is NaN
    function readInt(s) {
        const t = String(s == null ? '' : s).replace(/[\s,]/g, '');
        return /^\d{1,7}$/.test(t) ? Number(t) : NaN;
    }
    const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

    // ---------- working out how many are owed ----------
    // days from the first missed day to the last, both counted, less the days the person leaves out
    function owedFromDates(from, to, leaveOut, today) {
        if (!isIso(from)) return { error: 'from', msg: 'Pick the first day you missed.' };
        if (!isIso(to)) return { error: 'to', msg: 'Pick the last day you missed.' };
        if (today && diffDays(today, to) > 0) return { error: 'to', msg: 'The last day cannot be in the future.' };
        if (diffDays(from, to) < 0) return { error: 'to', msg: 'The last day must be on or after the first day.' };
        const span = diffDays(from, to) + 1;
        if (span > LIMITS.days) return { error: 'from', msg: 'That is more than 100 years. Check the first day.' };
        const out = leaveOut || 0;
        if (out < 0 || !Number.isInteger(out)) return { error: 'leave', msg: 'Type the days to leave out as a whole number.' };
        if (out >= span) return { error: 'leave', msg: 'You are leaving out ' + fmt(out) + ' days, but there are only ' + fmt(span) + ' days from ' + fmtDateY(from) + ' to ' + fmtDateY(to) + '.' };
        return { span, days: span - out };
    }
    // the day a person reached an age, from their birth date
    function dayAtAge(birth, age) { return isIso(birth) && Number.isInteger(age) && age >= 0 && age <= 120 ? addYears(birth, age) : null; }

    // ---------- one person's counts ----------
    const kinds = p => PRAYERS.filter(k => k !== 'witr' || p.witr);
    function doneOf(p, k) { let n = 0; for (const d in p.log) n += p.log[d][k] || 0; return n; }
    const leftOf = (p, k) => Math.max(0, (p.owed[k] || 0) - doneOf(p, k));
    const sum = (p, fn) => kinds(p).reduce((a, k) => a + fn(k), 0);
    const owedTotal = p => sum(p, k => p.owed[k] || 0);
    const doneTotal = p => sum(p, k => Math.min(p.owed[k] || 0, doneOf(p, k)));
    const leftTotal = p => sum(p, k => leftOf(p, k));
    const dayCount = (p, d, k) => (p.log[d] && p.log[d][k]) || 0;
    const dayPrayers = (p, d) => kinds(p).reduce((a, k) => a + dayCount(p, d, k), 0);
    const fastsOwed = p => p.ramadans.reduce((a, r) => a + r.days, 0) + (p.fastsExtra || 0);
    const fastsDone = p => Object.keys(p.log).reduce((a, d) => a + (p.log[d].fast || 0), 0);
    const fastsLeft = p => Math.max(0, fastsOwed(p) - fastsDone(p));
    const hasSetup = p => !!p.setup;

    function bump(p, d, k, n) {
        const day = p.log[d] || (p.log[d] = {});
        day[k] = (day[k] || 0) + n;
        if (day[k] <= 0) delete day[k];
        if (!Object.keys(day).length) delete p.log[d];
    }
    // one made-up prayer (or fast with k = 'fast'), on day d; refused when none are left
    function addOne(p, k, d) {
        if (k === 'fast' ? fastsLeft(p) <= 0 : leftOf(p, k) <= 0) return false;
        bump(p, d, k, 1); return true;
    }
    // take back the latest one: today's first, otherwise the most recent day that has one
    function takeBack(p, k, d) {
        if (dayCount(p, d, k) > 0) { bump(p, d, k, -1); return d; }
        const days = Object.keys(p.log).filter(x => (p.log[x][k] || 0) > 0).sort();
        if (!days.length) return null;
        const last = days[days.length - 1]; bump(p, last, k, -1); return last;
    }
    // "+1 full day": one of every prayer that still has some left
    function fullDay(p, d) { let n = 0; kinds(p).forEach(k => { if (addOne(p, k, d)) n++; }); return n; }

    // ---------- plans ----------
    // perDay = days of prayers a day (1 = one of each prayer). Today counts as day 1, including what is already made up today.
    function finishPrayers(p, perDay, today) {
        if (!(perDay >= 1)) return null;
        let days = 0;
        kinds(p).forEach(k => { const l = leftOf(p, k); if (l > 0) days = Math.max(days, Math.ceil((l + dayCount(p, today, k)) / perDay)); });
        if (!days) return { days: 0, date: today };
        return { days, date: addDays(today, days - 1) };
    }
    // fasts a week; the finish is spread evenly from today (a "around" date)
    function finishFasts(p, perWeek, today) {
        const left = fastsLeft(p);
        if (!left) return { days: 0, date: today, weeks: 0 };
        if (!(perWeek >= 1)) return null;
        const weeks = Math.ceil(left / perWeek);
        return { weeks, days: Math.ceil(left * 7 / perWeek), date: addDays(today, Math.ceil(left * 7 / perWeek) - 1) };
    }
    // prayers made up in the last 30 days (today included), as full days of prayers per day
    function pace(p, today) {
        let n = 0, first = null;
        for (let i = 0; i < 30; i++) { const d = addDays(today, -i); const c = dayPrayers(p, d); n += c; if (c) first = d; }
        if (!n) return null;
        const span = Math.min(30, diffDays(first, today) + 1);   // a new user is not divided by 30
        const perDay = n / span / kinds(p).length;
        return { prayers: n, span, perDay };
    }
    // days in a row (ending today, or yesterday when today's goal is not met yet) with at least the daily goal made up
    function streak(p, perDay, today) {
        const need = perDay * kinds(p).length;
        let d = dayPrayers(p, today) >= need ? today : addDays(today, -1), n = 0;
        while (dayPrayers(p, d) >= need && n < 40000) { n++; d = addDays(d, -1); }
        return n;
    }
    // the days with something made up, newest first
    function history(p) {
        return Object.keys(p.log).sort().reverse().map(d => ({ d, prayers: dayPrayers(p, d), fasts: p.log[d].fast || 0, byKind: Object.assign({}, p.log[d]) }));
    }
    // setting new totals: never below what is already made up
    function checkOwed(p, owed, witr) {
        const ks = PRAYERS.filter(k => k !== 'witr' || witr);
        for (const k of ks) {
            const n = owed[k];
            if (!Number.isInteger(n) || n < 0) return { error: k, msg: 'Type a whole number for ' + NAMES[k] + ', such as 0 or 1,204.' };
            if (n > LIMITS.owed) return { error: k, msg: NAMES[k] + ' can be at most ' + fmt(LIMITS.owed) + '.' };
            if (n < doneOf(p, k)) return { error: k, msg: 'You have already made up ' + plural(doneOf(p, k), NAMES[k], NAMES[k]) + ', so the total cannot be less than ' + fmt(doneOf(p, k)) + '.' };
        }
        if (!ks.some(k => owed[k] > 0)) return { error: 'fajr', msg: 'Type at least one number above 0.' };
        return null;
    }

    // ---------- text to copy or email ----------
    function summary(p, perDay, today) {
        const lines = ['Qaza made up: ' + p.name + ' (' + fmtDateY(today) + ')', ''];
        if (hasSetup(p)) {
            lines.push('Prayers: ' + fmt(doneTotal(p)) + ' of ' + fmt(owedTotal(p)) + ' made up, ' + fmt(leftTotal(p)) + ' left');
            kinds(p).forEach(k => lines.push('  ' + NAMES[k] + ': ' + fmt(leftOf(p, k)) + ' left of ' + fmt(p.owed[k] || 0)));
            const f = finishPrayers(p, perDay, today);
            if (f && f.days) lines.push('At ' + plural(perDay, 'day', 'days') + ' of prayers a day: finished around ' + fmtDateY(f.date));
            else if (owedTotal(p)) lines.push('All qaza prayers made up.');
        }
        if (fastsOwed(p)) {
            lines.push('', 'Fasts: ' + fmt(Math.min(fastsDone(p), fastsOwed(p))) + ' of ' + fmt(fastsOwed(p)) + ' made up, ' + fmt(fastsLeft(p)) + ' left');
            p.ramadans.forEach(r => lines.push('  ' + (r.year ? 'Ramadan ' + r.year : 'Ramadan') + ': ' + plural(r.days, 'day', 'days') + ' missed'));
            if (p.fastsExtra) lines.push('  Other days: ' + fmt(p.fastsExtra));
        }
        return lines.join('\n');
    }

    // ---------- state ----------
    function newPerson(id, name) {
        return { id, name: name || 'Me', witr: true, setup: null, owed: {}, ramadans: [], fastsExtra: 0, perDay: 1, fastsPerWeek: 2, log: {} };
    }
    const emptyState = () => ({ v: 1, people: [newPerson(1, 'Me')], active: 1, nextId: 2, rid: 1 });
    const okInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

    // checks every value of a saved or restored state; anything wrong is dropped, a state with nothing usable is null
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.people)) return null;
        const out = { v: 1, people: [], active: 0, nextId: 1, rid: 1 };
        const ids = new Set();
        s.people.slice(0, LIMITS.people).forEach(q => {
            if (!q || typeof q !== 'object' || !okInt(q.id, 1, 1e9) || ids.has(q.id)) return;
            ids.add(q.id);
            const p = newPerson(q.id, cleanText(q.name, LIMITS.name) || 'Me');
            p.witr = q.witr !== false;
            if (q.setup && typeof q.setup === 'object') {
                const st = q.setup;
                p.setup = { mode: st.mode === 'dates' ? 'dates' : 'numbers' };
                if (p.setup.mode === 'dates') {
                    p.setup.from = isIso(st.from) ? st.from : null; p.setup.to = isIso(st.to) ? st.to : null;
                    p.setup.leaveOut = okInt(st.leaveOut, 0, LIMITS.days) ? st.leaveOut : 0;
                    if (!p.setup.from || !p.setup.to) p.setup = { mode: 'numbers' };
                }
            }
            if (q.owed && typeof q.owed === 'object') PRAYERS.forEach(k => { if (okInt(q.owed[k], 0, LIMITS.owed)) p.owed[k] = q.owed[k]; });
            if (Array.isArray(q.ramadans)) q.ramadans.slice(0, LIMITS.ramadans).forEach(r => {
                if (!r || !okInt(r.days, 1, LIMITS.fastDays)) return;
                const id = okInt(r.id, 1, 1e9) ? r.id : out.rid;
                p.ramadans.push({ id, year: /^\d{4}$/.test(String(r.year || '')) ? String(r.year) : '', days: r.days });
                out.rid = Math.max(out.rid, id + 1);
            });
            p.fastsExtra = okInt(q.fastsExtra, 0, LIMITS.owed) ? q.fastsExtra : 0;
            p.perDay = okInt(q.perDay, 1, LIMITS.perDay) ? q.perDay : 1;
            p.fastsPerWeek = okInt(q.fastsPerWeek, 1, LIMITS.fastsPerWeek) ? q.fastsPerWeek : 2;
            if (q.log && typeof q.log === 'object' && !Array.isArray(q.log)) Object.keys(q.log).forEach(d => {
                const day = q.log[d]; if (!isIso(d) || !day || typeof day !== 'object') return;
                const keep = {};
                PRAYERS.concat('fast').forEach(k => { if (okInt(day[k], 1, LIMITS.owed)) keep[k] = day[k]; });
                if (Object.keys(keep).length) p.log[d] = keep;
            });
            out.people.push(p);
        });
        if (!out.people.length) return null;
        out.nextId = Math.max(okInt(s.nextId, 1, 1e9) ? s.nextId : 1, ...out.people.map(p => p.id + 1));
        out.rid = Math.max(out.rid, okInt(s.rid, 1, 1e9) ? s.rid : 1);
        out.active = out.people.some(p => p.id === s.active) ? s.active : out.people[0].id;
        return out;
    }

    const api = { PRAYERS, NAMES, LIMITS, isIso, todayIso, addDays, diffDays, addYears, fmtDate, fmtDateY, fmtMonthY, fmt, plural, readInt, cleanText,
        owedFromDates, dayAtAge, kinds, doneOf, leftOf, owedTotal, doneTotal, leftTotal, dayCount, dayPrayers, fastsOwed, fastsDone, fastsLeft, hasSetup,
        addOne, takeBack, fullDay, finishPrayers, finishFasts, pace, streak, history, checkOwed, summary, newPerson, emptyState, validate };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.QazaCore = api;
})(this);
