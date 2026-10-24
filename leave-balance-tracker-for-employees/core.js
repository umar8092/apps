// Leave Balance Tracker for Employees: the logic, with no page code (also runs in node for tests.js).
// Dates are calendar dates ('2026-10-22'), so time zones and summer time never move a day.
// Days of leave are kept in hundredths of a day (1 day = 100, half a day = 50), so sums stay exact.
(function (root) {
    'use strict';
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const MODES = ['year', 'month', 'none'];
    const MAX_DAYS = 36600;          // 366 days a year is the most any allowance or correction can be
    const MAX_RANGE = 366;           // one leave can be at most 366 calendar days long

    // ---------- dates ----------
    const pad = n => (n < 10 ? '0' : '') + n;
    const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
    function parseDate(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > dim(y, mo)) return null;
        return { y, m: mo, d };
    }
    const isDate = s => !!parseDate(s);
    function dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
    const toUtc = s => { const p = parseDate(s); return Date.UTC(p.y, p.m - 1, p.d); };
    const fromUtc = t => { const d = new Date(t); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
    const addDays = (s, n) => fromUtc(toUtc(s) + n * 86400000);
    const diff = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);   // days from a to b
    const dow = s => new Date(toUtc(s)).getUTCDay();
    function addMonths(s, n) {      // same day n months later, clamped to the month's length
        const p = parseDate(s); let m = p.m - 1 + n; const y = p.y + Math.floor(m / 12); m = ((m % 12) + 12) % 12 + 1;
        return iso(y, m, Math.min(p.d, dim(y, m)));
    }
    function todayIso(now) { const d = now || new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
    function shortDate(s, today) {
        const p = parseDate(s); if (!p) return '';
        const yr = !today || parseDate(today).y !== p.y ? ' ' + p.y : '';
        return DAYS[dow(s)] + ' ' + p.d + ' ' + MONTHS[p.m - 1] + yr;
    }
    const longDate = s => { const p = parseDate(s); return p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y; };

    // ---------- day amounts ----------
    // 650 -> "6.5", 167 -> "1.67", 100 -> "1"
    function num(h) {
        const neg = h < 0, a = Math.abs(h), w = Math.floor(a / 100), f = a % 100;
        const t = f === 0 ? String(w) : w + '.' + (f % 10 === 0 ? String(f / 10) : pad(f));
        return (neg ? '-' : '') + t;
    }
    const days = h => num(h) + (Math.abs(h) === 100 ? ' day' : ' days');
    // what a person types: "2", "1.5", "1,5", ".5", " 20 " -> hundredths; null when it is not a number
    function parseAmount(str) {
        const t = String(str == null ? '' : str).trim().replace(/\s+/g, '').replace(/,(?=\d{1,2}$)/, '.');
        if (!/^\d*(\.\d{0,2})?$/.test(t) || !/\d/.test(t)) return null;
        const [w, f = ''] = t.split('.');
        return (+w || 0) * 100 + +(f + '00').slice(0, 2);
    }

    // ---------- state ----------
    let seq = 0;
    const newId = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
    function defaultTypes() {
        return [
            { id: 'annual', name: 'Annual leave', mode: 'year', allow: 2000, carry: 'cap', cap: 500, expire: 0, opening: 0, warn: true },
            { id: 'casual', name: 'Casual leave', mode: 'year', allow: 800, carry: 'none', cap: 0, expire: 0, opening: 0, warn: false },
            { id: 'sick', name: 'Sick leave', mode: 'year', allow: 1000, carry: 'none', cap: 0, expire: 0, opening: 0, warn: false },
            { id: 'unpaid', name: 'Unpaid leave', mode: 'none', allow: 0, carry: 'none', cap: 0, expire: 0, opening: 0, warn: true }
        ];
    }
    function emptyState(today) {
        return { v: 1, created: today || todayIso(), startM: 1, startD: 1, workdays: [1, 2, 3, 4, 5], joined: null, holidays: [], types: defaultTypes(), entries: [], adjs: [] };
    }
    const typeById = (s, id) => s.types.find(t => t.id === id) || null;

    // ---------- leave years ----------
    // a leave year is named by the calendar year it starts in
    function yearStart(s, Y) { return iso(Y, s.startM, Math.min(s.startD, dim(Y, s.startM))); }
    function yearOf(s, d) { const y = parseDate(d).y; return d >= yearStart(s, y) ? y : y - 1; }
    const yearEnd = (s, Y) => addDays(yearStart(s, Y + 1), -1);
    function yearName(s, Y) {
        const a = yearStart(s, Y), b = yearEnd(s, Y);
        if (s.startM === 1 && s.startD === 1) return 'Leave year ' + Y;
        return 'Leave year ' + longDate(a) + ' to ' + longDate(b);
    }
    const openYear = s => yearOf(s, s.created);
    function dataYears(s) {
        const ys = [openYear(s)];
        s.entries.forEach(e => ys.push(yearOf(s, e.from), yearOf(s, e.to)));
        s.adjs.forEach(a => ys.push(yearOf(s, a.date)));
        return { min: Math.min(...ys), max: Math.max(...ys) };
    }

    // ---------- counting one leave ----------
    const holidaySet = s => new Set(s.holidays.map(h => h.date));
    // which days a leave takes: { map: {date: hundredths}, total, weekend: [...], holidays: [...] }
    function entryDays(s, e) {
        const out = { map: {}, total: 0, weekend: [], holidays: [] };
        if (!isDate(e.from) || !isDate(e.to) || e.to < e.from) return out;
        if (e.custom != null) { out.map[e.from] = e.custom; out.total = e.custom; return out; }
        const hs = holidaySet(s), n = diff(e.from, e.to);
        const counted = [];
        for (let i = 0; i <= n; i++) {
            const d = addDays(e.from, i);
            if (!s.workdays.includes(dow(d))) out.weekend.push(d);
            else if (hs.has(d)) out.holidays.push(d);
            else counted.push(d);
        }
        counted.forEach(d => { out.map[d] = 100; });
        if (counted.length) {
            const first = counted[0], last = counted[counted.length - 1];
            if (e.halfFirst && first === e.from) out.map[first] = 50;
            if (e.halfLast && last === e.to && (last !== first || !e.halfFirst)) out.map[last] = 50;
        }
        out.total = Object.values(out.map).reduce((a, b) => a + b, 0);
        return out;
    }
    // the days of each leave falling inside a leave year, split into taken (up to today) and booked (after today)
    function used(s, typeId, Y, today, upTo) {
        const a = yearStart(s, Y), b = yearEnd(s, Y), lim = upTo || b;
        let taken = 0, booked = 0;
        s.entries.forEach(e => {
            if (e.type !== typeId) return;
            const m = entryDays(s, e).map;
            Object.keys(m).forEach(d => { if (d < a || d > lim) return; if (d <= today) taken += m[d]; else booked += m[d]; });
        });
        return { taken, booked };
    }
    function adjTotal(s, typeId, Y) {
        const a = yearStart(s, Y), b = yearEnd(s, Y);
        return s.adjs.filter(x => x.type === typeId && x.date >= a && x.date <= b).reduce((t, x) => t + x.days, 0);
    }

    // ---------- allowance for one leave year ----------
    // year mode: all at the start, part-year after joining rounded to the nearest half day
    // month mode: 1/12 at the end of each month of the leave year; the joining month counts if you joined by its 15th day
    function entitlement(s, t, Y, today) {
        const a = yearStart(s, Y), b = yearEnd(s, Y), j = s.joined;
        const r = { full: 0, earned: 0, months: 0, monthsDone: 0, prorata: null };
        if (t.mode === 'none') return r;
        if (j && j > b) return r;
        if (t.mode === 'year') {
            if (!j || j <= a) r.full = t.allow;
            else {
                const left = diff(j, b) + 1, len = diff(a, b) + 1;
                r.full = Math.round(t.allow * left / len / 50) * 50;
                r.prorata = { from: j, dayCount: left, yearDays: len, exact: t.allow * left / len };
            }
            r.earned = r.full;
            return r;
        }
        for (let k = 0; k < 12; k++) {
            const ms = addMonths(a, k), me = addDays(addMonths(a, k + 1), -1);
            if (j && j > addDays(ms, 14)) continue;
            r.months++;
            if (today >= me) r.monthsDone++;
        }
        r.full = Math.round(t.allow * r.months / 12);
        r.earned = Math.round(t.allow * r.monthsDone / 12);
        if (j && j > a) r.prorata = { from: j, months: r.months };
        return r;
    }

    // ---------- the balance of one leave type in one leave year ----------
    function balance(s, typeId, Y, today, memo) {
        const t = typeById(s, typeId); if (!t) return null;
        memo = memo || {};
        const key = typeId + ':' + Y; if (memo[key]) return memo[key];
        const a = yearStart(s, Y), b = yearEnd(s, Y), ent = entitlement(s, t, Y, today);
        const u = used(s, typeId, Y, today), adj = adjTotal(s, typeId, Y);
        const r = { type: t, Y, a, b, mode: t.mode, full: ent.full, earned: ent.earned, months: ent.months, monthsDone: ent.monthsDone, prorata: ent.prorata,
            taken: u.taken, booked: u.booked, adj, carried: 0, expiry: null, expireAmount: 0, expired: 0, atRisk: 0, left: 0, availNow: 0, carryOut: 0, lost: 0,
            past: b < today, future: a > today };
        if (t.mode === 'none') { memo[key] = r; return r; }
        // carried over from the year before
        const range = dataYears(s);
        if (Y === openYear(s)) r.carried = t.opening;
        else if (Y > range.min && !(s.joined && s.joined > yearEnd(s, Y - 1))) r.carried = balance(s, typeId, Y - 1, today, memo).carryOut;
        // carried days that must be used by a date
        if (t.expire > 0 && r.carried > 0) {
            r.expiry = addDays(addMonths(a, t.expire), -1);
            const by = used(s, typeId, Y, today, r.expiry);
            r.expireAmount = Math.max(0, r.carried - by.taken - by.booked);
            if (today > r.expiry) r.expired = r.expireAmount; else r.atRisk = r.expireAmount;
        }
        const total = r.full + r.carried + r.adj - r.expired;
        r.left = total - r.taken - r.booked;                              // left to book in this leave year
        r.availNow = r.earned + r.carried + r.adj - r.expired - r.taken;  // month mode: what is earned so far and not yet taken
        const end = r.left - r.atRisk;                                     // what will be left when the year ends
        r.carryOut = t.carry === 'all' ? Math.max(0, end) : t.carry === 'cap' ? Math.min(t.cap, Math.max(0, end)) : 0;
        r.lost = Math.max(0, end - r.carryOut);
        memo[key] = r;
        return r;
    }

    // the one-line answer for a leave type
    function headline(r) {
        if (r.mode === 'none') return days(r.taken + r.booked) + ' this leave year';
        if (r.left < 0) return days(-r.left) + ' over your allowance';
        return days(r.left) + ' left';
    }
    // the lines under it, plain sentences
    function lines(s, r, today) {
        const L = [];
        if (r.mode === 'none') {
            L.push('Taken ' + num(r.taken) + ', booked ' + num(r.booked) + '. No limit, only counted.');
            return L;
        }
        const parts = ['Allowance ' + num(r.full)];
        if (r.carried) parts.push('carried over ' + num(r.carried));
        if (r.adj) parts.push((r.adj > 0 ? 'HR added ' : 'HR took away ') + num(Math.abs(r.adj)));
        if (r.expired) parts.push('expired ' + num(r.expired));
        L.push(parts.join(', ') + '. Taken ' + num(r.taken) + ', booked ' + num(r.booked) + '.');
        if (r.prorata && r.mode === 'year') L.push('Part year from joining on ' + longDate(r.prorata.from) + ': ' + num(r.type.allow) + ' x ' + r.prorata.dayCount + '/' + r.prorata.yearDays + ' days = ' + (Math.round(r.prorata.exact) / 100).toFixed(2) + ', rounded to ' + num(r.full) + '.');
        if (r.mode === 'month') {
            if (r.past) L.push('Built up ' + num(r.full) + ' over ' + r.months + ' months.');
            else if (r.future) L.push('Builds up ' + num(Math.round(r.type.allow / 12)) + ' a month, ' + num(r.full) + ' by ' + longDate(r.b) + '.');
            else {
                L.push('Built up so far: ' + num(r.earned) + ' of ' + num(r.full) + ' (' + r.monthsDone + ' of ' + r.months + ' months).');
                L.push(r.availNow >= 0 ? 'You can take ' + days(r.availNow) + ' now.' : 'You have taken ' + days(-r.availNow) + ' more than you have built up so far.');
            }
        }
        if (r.atRisk) L.push('Use ' + days(r.atRisk) + ' carried over by ' + longDate(r.expiry) + ', or ' + (r.atRisk === 100 ? 'it expires' : 'they expire') + '.');
        if (r.expired && !r.past) L.push(days(r.expired) + ' carried over expired on ' + longDate(r.expiry) + '.');
        if (r.past) {
            if (r.carryOut) L.push(days(r.carryOut) + ' carried over to the next leave year.');
            if (r.lost) L.push(days(r.lost) + (r.type.warn ? ' lost at the end of this leave year.' : ' not used in this leave year.'));
        } else if (r.lost && !r.type.warn) {
            L.push(r.type.carry === 'cap' ? 'Up to ' + days(r.type.cap) + ' carry over after ' + longDate(r.b) + '.' : 'Unused days are not carried over after ' + longDate(r.b) + '.');
        } else if (r.lost) {
            L.push('Book ' + days(r.lost) + ' more by ' + longDate(r.b) + ' or lose ' + (r.lost === 100 ? 'it' : 'them') + (r.type.carry === 'cap' ? ' (only ' + days(r.type.cap) + ' can be carried over).' : ' (nothing is carried over).'));
        } else if (r.carryOut && r.left > 0) {
            L.push(days(r.carryOut) + ' will be carried over to the next leave year.');
        }
        return L;
    }
    // warning level of a balance, for colouring: over, lose, ok
    function level(r) { if (r.mode === 'none') return 'ok'; if (r.left < 0 || (r.availNow < 0 && r.mode === 'month' && !r.past && !r.future)) return 'over'; if ((r.lost && r.type.warn) || r.atRisk) return 'lose'; return 'ok'; }

    // ---------- reading the leave form ----------
    // f: { type, from, to, halfFirst, halfLast, custom (string or null), note, id (when editing) }
    function readEntry(s, f, today) {
        const errs = {};
        const t = typeById(s, f.type); if (!t) errs.type = 'Choose the kind of leave.';
        if (!isDate(f.from)) errs.from = 'Choose the first day of the leave.';
        let to = f.to || f.from;
        if (!errs.from && !isDate(to)) errs.to = 'Choose the last day of the leave.';
        if (!errs.from && !errs.to) {
            if (to < f.from) errs.to = 'The last day is before the first day.';
            else if (diff(f.from, to) + 1 > MAX_RANGE) errs.to = 'One leave can be at most ' + MAX_RANGE + ' days long. Add longer leave in parts.';
        }
        let custom = null;
        if (f.custom != null && String(f.custom).trim() !== '') {
            custom = parseAmount(f.custom);
            if (custom == null) errs.custom = 'Type a number of days, for example 3 or 2.5.';
            else if (custom <= 0) errs.custom = 'Type more than 0 days.';
            else if (custom > (errs.to || errs.from ? MAX_DAYS : (diff(f.from, to) + 1) * 100)) errs.custom = 'That is more days than the leave lasts.';
        }
        const note = String(f.note || '').trim().slice(0, 200);
        if (Object.keys(errs).length) return { ok: false, errs };
        const single = f.from === to;
        const e = { id: f.id || newId(), type: t.id, from: f.from, to, halfFirst: !!f.halfFirst, halfLast: !single && !!f.halfLast, custom, note };
        const c = entryDays(s, e);
        if (c.total === 0) {
            const why = c.holidays.length && !c.weekend.length ? 'a public holiday' : c.weekend.length && !c.holidays.length ? 'not one of your working days' : 'not a working day';
            errs.from = single ? shortDate(f.from, today) + ' is ' + why + ', so it takes no leave. If your employer counts it, use "+ Count a different number of days".'
                : 'None of these days are working days, so this takes no leave. If your employer counts them, use "+ Count a different number of days".';
            return { ok: false, errs };
        }
        const clash = findClash(s, e);
        if (clash) { errs.from = 'You already have ' + clash.name + ' on ' + shortDate(clash.date, today) + '. Change or delete that leave first.'; return { ok: false, errs }; }
        return { ok: true, entry: e, count: c };
    }
    // a day can hold at most one full day of leave (two half days are fine)
    function findClash(s, e) {
        const mine = entryDays(s, e).map, span = d => d >= e.from && d <= e.to;
        for (const o of s.entries) {
            if (o.id === e.id || o.to < e.from || o.from > e.to) continue;
            const om = o.custom != null ? fullSpan(o) : entryDays(s, o).map;
            const mm = e.custom != null ? fullSpan(e) : mine;
            for (const d of Object.keys(om)) {
                if (!span(d) || !(d in mm)) continue;
                if (om[d] + mm[d] > 100) { const t = typeById(s, o.type); return { date: d, name: t ? t.name.toLowerCase() : 'leave' }; }
            }
        }
        return null;
    }
    function fullSpan(e) { const m = {}; for (let i = 0; i <= diff(e.from, e.to); i++) m[addDays(e.from, i)] = 100; return m; }

    // a correction from HR: { type, sign: 1 | -1, amount (string), date, note }
    function readAdj(s, f) {
        const errs = {};
        const t = typeById(s, f.type); if (!t) errs.type = 'Choose the kind of leave.';
        else if (t.mode === 'none') errs.type = t.name + ' has no limit, so there is no balance to correct.';
        const v = parseAmount(f.amount);
        if (v == null) errs.amount = 'Type a number of days, for example 1 or 0.5.';
        else if (v <= 0) errs.amount = 'Type more than 0 days.';
        else if (v > MAX_DAYS) errs.amount = 'That is more than a year of days.';
        if (!isDate(f.date)) errs.date = 'Choose the date of the correction.';
        if (Object.keys(errs).length) return { ok: false, errs };
        return { ok: true, adj: { id: f.id || newId(), type: t.id, date: f.date, days: (f.sign < 0 ? -1 : 1) * v, note: String(f.note || '').trim().slice(0, 200) } };
    }

    // a leave type form: { name, mode, allow, carry, cap, expire, opening }
    function readType(s, f, id) {
        const errs = {};
        const name = String(f.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        if (!name) errs.name = 'Give this leave a name, for example Annual leave.';
        else if (s.types.some(t => t.id !== id && t.name.toLowerCase() === name.toLowerCase())) errs.name = 'You already have a leave called ' + name + '.';
        const mode = MODES.includes(f.mode) ? f.mode : 'year';
        let allow = 0, cap = 0, expire = 0, opening = 0;
        if (mode !== 'none') {
            allow = parseAmount(f.allow);
            if (allow == null) errs.allow = 'Type the days you get each leave year, for example 20.';
            else if (allow > MAX_DAYS) errs.allow = 'Type at most 366 days.';
            if (f.carry === 'cap') {
                cap = parseAmount(f.cap);
                if (cap == null) errs.cap = 'Type how many days can be carried over, for example 5.';
                else if (cap > MAX_DAYS) errs.cap = 'Type at most 366 days.';
            }
            if (f.carry !== 'none' && f.expire != null && String(f.expire).trim() !== '') {
                expire = /^\d{1,2}$/.test(String(f.expire).trim()) ? +String(f.expire).trim() : -1;
                if (expire < 0 || expire > 12) errs.expire = 'Type a number of months from 1 to 12, or leave it empty.';
            }
            if (f.opening != null && String(f.opening).trim() !== '') {
                opening = parseAmount(f.opening);
                if (opening == null) errs.opening = 'Type a number of days, for example 3, or leave it empty.';
                else if (opening > MAX_DAYS) errs.opening = 'Type at most 366 days.';
            }
        }
        if (Object.keys(errs).length) return { ok: false, errs };
        const carry = mode === 'none' ? 'none' : ['none', 'cap', 'all'].includes(f.carry) ? f.carry : 'none';
        return { ok: true, type: { id: id || newId(), name, mode, allow, carry, cap: carry === 'cap' ? cap : 0, expire: carry === 'none' ? 0 : expire, opening, warn: f.warn !== false } };
    }

    // ---------- words ----------
    function workdaysText(w) {
        const order = [1, 2, 3, 4, 5, 6, 0], on = order.filter(d => w.includes(d));
        if (on.length === 7) return 'every day';
        if (!on.length) return 'no days';
        // a run like Mon to Fri, also across the week end (Sat to Wed)
        for (let st = 0; st < 7; st++) {
            const run = []; for (let i = 0; i < on.length; i++) run.push(order[(st + i) % 7]);
            if (on.length > 2 && run.every(d => on.includes(d))) return DAYS[run[0]] + ' to ' + DAYS[run[run.length - 1]];
        }
        return on.map(d => DAYS[d]).join(', ');
    }
    function typeRule(t) {
        if (t.mode === 'none') return 'No limit, only counted';
        let r = t.mode === 'month' ? num(t.allow) + ' a year, built up ' + num(Math.round(t.allow / 12)) + ' a month' : num(t.allow) + ' days a year';
        r += t.carry === 'none' ? ', nothing carried over' : t.carry === 'all' ? ', all carried over' : ', up to ' + num(t.cap) + ' carried over';
        if (t.carry !== 'none' && t.expire) r += ' (use within ' + t.expire + (t.expire === 1 ? ' month)' : ' months)');
        return r;
    }
    function entryText(s, e, today) {
        const t = typeById(s, e.type), c = entryDays(s, e);
        const when = e.from === e.to ? shortDate(e.from, today) : shortDate(e.from, today) + ' to ' + shortDate(e.to, today);
        let half = '';
        if (e.custom == null) { if (e.from === e.to && e.halfFirst) half = ', half day'; else { if (e.halfFirst) half += ', first day half'; if (e.halfLast) half += ', last day half'; } }
        return { name: t ? t.name : 'Leave', when: when + half, total: c.total, status: entryStatus(s, e, today) };
    }
    function entryStatus(s, e, today) { return e.from > today ? 'booked' : e.to < today ? 'taken' : e.from === e.to ? 'today' : 'now'; }
    // why some days in a leave were not counted, for the preview
    function countText(s, e, today) {
        const c = entryDays(s, e); if (e.custom != null) return 'Counted as ' + days(e.custom) + ' (your number).';
        const p = [];
        if (c.weekend.length) p.push(c.weekend.length + (c.weekend.length === 1 ? ' day off' : ' days off') + ' (not working days)');
        if (c.holidays.length) p.push(c.holidays.length === 1 ? 'a public holiday on ' + shortDate(c.holidays[0], today) : c.holidays.length + ' public holidays');
        return p.length ? 'Not counted: ' + p.join(' and ') + '.' : '';
    }

    function summaryText(s, Y, today) {
        const memo = {}, L = [yearName(s, Y) + ' (' + longDate(yearStart(s, Y)) + ' to ' + longDate(yearEnd(s, Y)) + '), on ' + longDate(today) + ':', ''];
        s.types.forEach(t => { const r = balance(s, t.id, Y, today, memo); L.push(t.name + ': ' + headline(r) + '.'); lines(s, r, today).forEach(x => L.push('  ' + x)); });
        const list = entriesInYear(s, Y).filter(e => e.to > today);
        if (list.length) { L.push('', 'Booked leave:'); list.slice().reverse().forEach(e => { const x = entryText(s, e, today); L.push('- ' + x.name + ': ' + x.when + ' (' + days(x.total) + ')' + (e.note ? ' ' + e.note : '')); }); }
        return L.join('\n');
    }
    function entriesInYear(s, Y) {
        const a = yearStart(s, Y), b = yearEnd(s, Y);
        return s.entries.filter(e => e.to >= a && e.from <= b).sort((x, y) => (y.from < x.from ? -1 : y.from > x.from ? 1 : 0));
    }
    function adjsInYear(s, Y) {
        const a = yearStart(s, Y), b = yearEnd(s, Y);
        return s.adjs.filter(x => x.date >= a && x.date <= b).sort((x, y) => (y.date < x.date ? -1 : y.date > x.date ? 1 : 0));
    }
    const csvCell = v => { let t = String(v == null ? '' : v); if (/^[=+\-@]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    function csv(s, today) {
        const rows = [['Kind', 'Leave', 'From', 'To', 'Days', 'Status', 'Leave year', 'Note']];
        s.entries.slice().sort((x, y) => (x.from < y.from ? -1 : 1)).forEach(e => {
            const x = entryText(s, e, today);
            rows.push(['Leave', x.name, e.from, e.to, num(x.total), x.status === 'booked' ? 'Booked' : x.status === 'taken' ? 'Taken' : 'Taking now', yearOf(s, e.from), e.note]);
        });
        s.adjs.slice().sort((x, y) => (x.date < y.date ? -1 : 1)).forEach(a => { const t = typeById(s, a.type); rows.push(['HR correction', t ? t.name : '', a.date, a.date, num(a.days), '', yearOf(s, a.date), a.note]); });
        return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    // ---------- checking saved or restored data ----------
    const isAmt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    const cleanText = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    function validate(o, today) {
        if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
        const s = emptyState(today);
        if (isDate(o.created)) s.created = o.created;
        if (Number.isInteger(o.startM) && o.startM >= 1 && o.startM <= 12) s.startM = o.startM;
        if (Number.isInteger(o.startD) && o.startD >= 1 && o.startD <= 31) s.startD = o.startD;
        if (Array.isArray(o.workdays)) { const w = [...new Set(o.workdays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort(); if (w.length) s.workdays = w; }
        s.joined = isDate(o.joined) ? o.joined : null;
        if (Array.isArray(o.holidays)) {
            const seen = new Set();
            s.holidays = o.holidays.filter(h => h && isDate(h.date) && !seen.has(h.date) && seen.add(h.date)).slice(0, 500).map(h => ({ date: h.date, name: cleanText(h.name, 40) })).sort((a, b) => (a.date < b.date ? -1 : 1));
        }
        if (Array.isArray(o.types)) {
            const ids = new Set(), names = new Set(), ts = [];
            o.types.slice(0, 30).forEach(t => {
                if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id || t.id.length > 40 || ids.has(t.id)) return;
                const name = cleanText(t.name, 40); if (!name || names.has(name.toLowerCase())) return;
                const mode = MODES.includes(t.mode) ? t.mode : 'year';
                const carry = mode === 'none' ? 'none' : ['none', 'cap', 'all'].includes(t.carry) ? t.carry : 'none';
                ids.add(t.id); names.add(name.toLowerCase());
                ts.push({ id: t.id, name, mode, allow: mode === 'none' ? 0 : isAmt(t.allow, 0, MAX_DAYS) ? t.allow : 0, carry, cap: carry === 'cap' && isAmt(t.cap, 0, MAX_DAYS) ? t.cap : 0,
                    expire: carry !== 'none' && Number.isInteger(t.expire) && t.expire >= 0 && t.expire <= 12 ? t.expire : 0, opening: mode !== 'none' && isAmt(t.opening, 0, MAX_DAYS) ? t.opening : 0, warn: t.warn !== false });
            });
            s.types = ts;
        }
        const tid = new Set(s.types.map(t => t.id)), eids = new Set();
        if (Array.isArray(o.entries)) {
            s.entries = o.entries.slice(0, 5000).filter(e => e && typeof e.id === 'string' && e.id && !eids.has(e.id) && tid.has(e.type) && isDate(e.from) && isDate(e.to) && e.to >= e.from && diff(e.from, e.to) < MAX_RANGE && eids.add(e.id))
                .map(e => ({ id: e.id, type: e.type, from: e.from, to: e.to, halfFirst: e.halfFirst === true, halfLast: e.halfLast === true && e.to !== e.from,
                    custom: isAmt(e.custom, 1, (diff(e.from, e.to) + 1) * 100) ? e.custom : null, note: cleanText(e.note, 200) }));
        }
        if (Array.isArray(o.adjs)) {
            s.adjs = o.adjs.slice(0, 2000).filter(a => a && typeof a.id === 'string' && a.id && !eids.has(a.id) && tid.has(a.type) && isDate(a.date) && Number.isInteger(a.days) && a.days !== 0 && Math.abs(a.days) <= MAX_DAYS && eids.add(a.id))
                .map(a => ({ id: a.id, type: a.type, date: a.date, days: a.days, note: cleanText(a.note, 200) }));
        }
        return s;
    }

    const api = { DAYS, MONTHS, MONTHS_LONG, MAX_DAYS, MAX_RANGE, iso, parseDate, isDate, dim, addDays, addMonths, diff, dow, todayIso, shortDate, longDate, num, days, parseAmount,
        newId, defaultTypes, emptyState, typeById, yearStart, yearEnd, yearOf, yearName, openYear, dataYears, entryDays, used, adjTotal, entitlement, balance, headline, lines, level,
        readEntry, findClash, readAdj, readType, workdaysText, typeRule, entryText, entryStatus, countText, summaryText, entriesInYear, adjsInYear, csv, validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LeaveCore = api;
})(this);
