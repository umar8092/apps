// Time Tracker for Freelancers: the logic (no page code), so it can be checked on its own (tests.js).
// Money is kept in whole cents and time in whole seconds, so every total is exact.
(function (root) {
    'use strict';

    var ROUNDING = [0, 6, 15, 30];               // minutes; 0 = exact minutes
    var SYMBOLS = ['', '$', '€', '£', '₹', 'Rs', '¥', 'A$', 'C$', 'AED', 'SAR', 'R', 'CHF', 'kr'];
    var MAX_RATE = 10000000;                      // 100,000.00 an hour
    var MAX_SEC = 24 * 3600;                      // one entry is at most 24 hours

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    // ---------- dates as 'YYYY-MM-DD' (calendar days, so time zones never move them) ----------
    function isDate(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        var d = new Date(s + 'T00:00:00Z');
        return !isNaN(d) && d.toISOString().slice(0, 10) === s;
    }
    function dateOf(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function minuteOf(ms) { var d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); }
    function addDays(s, n) { var d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function dayIndex(s) { return Math.round(Date.parse(s + 'T00:00:00Z') / 86400000); }
    function weekday(s) { return new Date(s + 'T00:00:00Z').getUTCDay(); } // 0 = Sunday
    function weekStart(s, first) { var back = (weekday(s) - first + 7) % 7; return addDays(s, -back); }
    function monthStart(s) { return s.slice(0, 8) + '01'; }
    function monthEnd(s) {
        var y = +s.slice(0, 4), m = +s.slice(5, 7);
        var d = new Date(Date.UTC(y, m, 0));
        return d.toISOString().slice(0, 10);
    }

    // The days a period covers. first = the day the week starts on (0 Sunday, 1 Monday, 6 Saturday).
    function periodRange(kind, today, first, from, to) {
        var ws;
        switch (kind) {
            case 'week': ws = weekStart(today, first); return { from: ws, to: addDays(ws, 6) };
            case 'lastweek': ws = addDays(weekStart(today, first), -7); return { from: ws, to: addDays(ws, 6) };
            case 'month': return { from: monthStart(today), to: monthEnd(today) };
            case 'lastmonth': var lm = addDays(monthStart(today), -1); return { from: monthStart(lm), to: monthEnd(lm) };
            case 'custom':
                if (!isDate(from) || !isDate(to)) return null;
                return from <= to ? { from: from, to: to } : { from: to, to: from };
            default: return { from: '0000-01-01', to: '9999-12-31' }; // 'unbilled' and 'all'
        }
    }

    // ---------- reading what people type ----------
    // Money per hour: "40", "40.50", "$40", "1,200", "1.200,50", "40,5". Returns { cents } or { error } or { empty }.
    function parseMoney(raw) {
        var s = String(raw == null ? '' : raw).trim();
        if (!s) return { empty: true };
        if (/^-/.test(s.replace(/^[^\d-]+/, ''))) return { error: 'The rate cannot be below zero.' };
        s = s.replace(/[^\d.,]/g, '');
        if (!s || !/\d/.test(s)) return { error: 'Type the rate as a number, for example 40 or 40.50.' };
        var lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
        var dec = -1;
        if (lastDot >= 0 && lastComma >= 0) dec = Math.max(lastDot, lastComma);
        else if (lastComma >= 0) dec = /,\d{1,2}$/.test(s) && (s.match(/,/g) || []).length === 1 ? lastComma : -1;
        else if (lastDot >= 0) dec = /\.\d{3}$/.test(s) ? -1 : ((s.match(/\./g) || []).length === 1 ? lastDot : -1);  // 1.200 = twelve hundred
        var whole = (dec >= 0 ? s.slice(0, dec) : s).replace(/[.,]/g, '');
        var frac = dec >= 0 ? s.slice(dec + 1) : '';
        if (frac.length > 2) return { error: 'Use at most 2 decimals, for example 40.50.' };
        if (!whole && !frac) return { error: 'Type the rate as a number, for example 40 or 40.50.' };
        var cents = (whole ? parseInt(whole, 10) : 0) * 100 + (frac ? parseInt((frac + '0').slice(0, 2), 10) : 0);
        if (!isFinite(cents) || cents > MAX_RATE) return { error: 'That rate is too big. The most is 100,000 an hour.' };
        return { cents: cents };
    }

    // How long: "1:30", "1h 30m", "1 h 30 min", "1.5", "1,5", "90m", "90 min", "2h", "45 minutes".
    // A plain number means hours. Returns { min } or { error }.
    function parseDuration(raw) {
        var s = String(raw == null ? '' : raw).trim().toLowerCase().replace(/,/g, '.');
        if (!s) return { error: 'Type how long you worked, for example 1:30 or 1h 30m.' };
        var m, min;
        if ((m = s.match(/^(\d{1,2}):(\d{1,2})$/))) {
            if (+m[2] > 59) return { error: 'Minutes go up to 59. For 1 hour 30 minutes type 1:30.' };
            min = +m[1] * 60 + +m[2];
        } else if ((m = s.match(/^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes))?$/)) && (m[1] || m[2])) {
            min = Math.round((m[1] ? parseFloat(m[1]) * 60 : 0) + (m[2] ? +m[2] : 0));
        } else if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) {
            var h = parseFloat(m[1]);
            if (h > 24) return { error: 'That is more than 24 hours. For minutes type ' + m[1] + 'm.' };
            min = Math.round(h * 60);
        } else {
            return { error: 'Type how long you worked, for example 1:30, 1h 30m, 1.5 or 45m.' };
        }
        if (min <= 0) return { error: 'The time must be at least 1 minute.' };
        if (min > 24 * 60) return { error: 'One entry can be at most 24 hours. Add each day on its own.' };
        return { min: min };
    }

    // 'HH:MM' from a time box -> minutes after midnight, or null.
    function parseClock(s) {
        var m = String(s || '').match(/^(\d{1,2}):(\d{2})/);
        if (!m || +m[1] > 23 || +m[2] > 59) return null;
        return +m[1] * 60 + +m[2];
    }

    // ---------- showing numbers ----------
    function groupThousands(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function fmtMoney(cents, sym) {
        var neg = cents < 0, c = Math.abs(Math.round(cents));
        var txt = groupThousands(Math.floor(c / 100)) + '.' + pad(c % 100);
        if (sym) txt = (sym.length > 1 && /[A-Za-z]$/.test(sym) ? sym + ' ' : sym) + txt;
        return (neg ? '-' : '') + txt;
    }
    function fmtRate(cents, sym) { return fmtMoney(cents, sym); }
    function fmtDur(min) {
        min = Math.max(0, Math.round(min));
        var h = Math.floor(min / 60), m = min % 60;
        if (!h) return m + ' min';
        if (!m) return h + ' h';
        return h + ' h ' + pad(m) + ' min';
    }
    function fmtDecimal(min) { return (Math.round(min / 60 * 100) / 100).toFixed(2); }
    function fmtClockSec(sec) {
        sec = Math.max(0, Math.floor(sec));
        return Math.floor(sec / 3600) + ':' + pad(Math.floor(sec / 60) % 60) + ':' + pad(sec % 60);
    }

    // ---------- entries ----------
    // An entry: { id, client, task, date, start (minutes after midnight, or null for "just how long"), sec, rate (cents an hour), billable, bill (null or { at, min }) }
    function entryMin(e) { return Math.round(e.sec / 60); }
    function roundUp(min, step) { return step > 0 ? Math.ceil(min / step) * step : min; }
    // Minutes charged for one entry: frozen once billed, else rounded up the client's way.
    function chargedMin(e, client) {
        if (e.billable === false) return 0;
        if (e.bill) return e.bill.min;
        return roundUp(entryMin(e), client ? client.round || 0 : 0);
    }
    function centsFor(min, rate) { return Math.round(min * rate / 60); }

    // Absolute minutes so entries on different days and past midnight can be compared.
    function span(e) {
        if (e.start == null) return null;
        var a = dayIndex(e.date) * 1440 + e.start;
        return { a: a, b: a + Math.max(1, Math.ceil(e.sec / 60)) };
    }
    function overlaps(e, list) {
        var s = span(e); if (!s) return [];
        return list.filter(function (o) {
            if (o.id === e.id) return false;
            var t = span(o); return t && t.a < s.b && s.a < t.b;
        });
    }
    function crossesMidnight(e) { return e.start != null && e.start + Math.ceil(e.sec / 60) > 1440; }

    // Turns a running timer into an entry. Returns { entry } or { tooShort } or { error }.
    function entryFromTimer(timer, endMs, client) {
        var sec = Math.round((endMs - timer.startMs) / 1000);
        if (sec < 0) return { error: 'The finish time is before the timer started.' };
        if (sec < 30) return { tooShort: true, sec: sec };
        if (sec > MAX_SEC) return { error: 'One entry can be at most 24 hours. Choose when you really stopped.' };
        return { entry: { client: timer.client, task: cleanText(timer.task, 80), date: dateOf(timer.startMs), start: minuteOf(timer.startMs), sec: sec, rate: client ? client.rate : 0, billable: true, bill: null } };
    }

    // From the "add time afterwards" form. mode 'times' uses start and finish, 'length' uses how long.
    function entryFromForm(f, today) {
        if (!isDate(f.date)) return { error: 'Choose the day you worked.', field: 'date' };
        if (f.date > today) return { error: 'That day is in the future. Add time once you have worked it.', field: 'date' };
        if (f.mode === 'length') {
            var d = parseDuration(f.length);
            if (d.error) return { error: d.error, field: 'length' };
            return { entry: { date: f.date, start: null, sec: d.min * 60 } };
        }
        var a = parseClock(f.start), b = parseClock(f.finish);
        if (a == null) return { error: 'Choose the start time.', field: 'start' };
        if (b == null) return { error: 'Choose the finish time.', field: 'finish' };
        if (a === b) return { error: 'Start and finish are the same time. Change one of them.', field: 'finish' };
        var min = b > a ? b - a : b + 1440 - a;  // finish earlier than start = the next day
        return { entry: { date: f.date, start: a, sec: min * 60 }, nextDay: b < a };
    }

    function cleanText(s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }
    function taskKey(s) { return cleanText(s, 80).toLowerCase(); }

    // ---------- totals ----------
    // Totals per client for the days from..to. only: 'unbilled' keeps time not billed yet.
    // Each client gets invoice lines grouped by what was worked on and the rate.
    function summarize(state, range, only) {
        var byId = {}; state.clients.forEach(function (c) { byId[c.id] = c; });
        var out = {}, order = [];
        state.entries.forEach(function (e) {
            if (e.date < range.from || e.date > range.to) return;
            if (only === 'unbilled' && (e.bill || e.billable === false)) return;
            var c = byId[e.client]; if (!c) return;
            var t = out[c.id];
            if (!t) { t = out[c.id] = { client: c, min: 0, freeMin: 0, chargedMin: 0, cents: 0, unbilledCount: 0, count: 0, lines: [], linesBy: {} }; order.push(c.id); }
            var m = entryMin(e);
            t.min += m; t.count++;
            if (e.billable === false) { t.freeMin += m; return; }
            if (!e.bill) t.unbilledCount++;
            var cm = chargedMin(e, c);
            var key = taskKey(e.task) + '|' + e.rate;
            var line = t.linesBy[key];
            if (!line) { line = t.linesBy[key] = { task: cleanText(e.task, 80) || 'Work', rate: e.rate, min: 0, chargedMin: 0, cents: 0, first: e.date, last: e.date }; t.lines.push(line); }
            line.min += m; line.chargedMin += cm;
            if (e.date < line.first) line.first = e.date;
            if (e.date > line.last) line.last = e.date;
        });
        var list = order.map(function (id) {
            var t = out[id];
            t.lines.forEach(function (l) { l.cents = centsFor(l.chargedMin, l.rate); t.chargedMin += l.chargedMin; t.cents += l.cents; });
            t.lines.sort(function (a, b) { return b.chargedMin - a.chargedMin || a.task.localeCompare(b.task); });
            delete t.linesBy;
            return t;
        });
        list.sort(function (a, b) { return b.min - a.min || a.client.name.localeCompare(b.client.name); });
        var money = {};  // per currency symbol, since clients can pay in different currencies
        list.forEach(function (t) { if (t.client.rate > 0 || t.cents) money[t.client.sym || ''] = (money[t.client.sym || ''] || 0) + t.cents; });
        return { clients: list, min: list.reduce(function (s, t) { return s + t.min; }, 0), money: money };
    }

    function moneyLine(money) {
        var keys = Object.keys(money);
        return keys.map(function (k) { return fmtMoney(money[k], k); }).join(' + ');
    }

    // The words a client's invoice needs, ready to paste.
    function invoiceText(t, label) {
        var c = t.client, lines = [c.name + ' - ' + label];
        t.lines.forEach(function (l) {
            var hrs = fmtDur(l.chargedMin) + ' (' + fmtDecimal(l.chargedMin) + ' h)';
            lines.push(l.rate > 0 ? l.task + ': ' + hrs + ' x ' + fmtRate(l.rate, c.sym) + '/h = ' + fmtMoney(l.cents, c.sym) : l.task + ': ' + hrs);
        });
        var total = 'Total: ' + fmtDur(t.chargedMin) + ' (' + fmtDecimal(t.chargedMin) + ' h)';
        if (t.cents > 0) total += ' = ' + fmtMoney(t.cents, c.sym);
        lines.push(total);
        if (t.freeMin) lines.push('Also worked, not charged: ' + fmtDur(t.freeMin));
        if (c.round && t.chargedMin !== t.min - t.freeMin) lines.push('Each entry rounded up to the next ' + c.round + ' minutes.');
        return lines.join('\n');
    }

    // ---------- spreadsheet file ----------
    function csvCell(v) { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? '"' + v.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"' : v; }
    function toCSV(state, range) {
        var byId = {}; state.clients.forEach(function (c) { byId[c.id] = c; });
        var rows = [['Date', 'Start', 'Finish', 'Client', 'Work', 'Minutes', 'Charged minutes', 'Hours charged', 'Rate per hour', 'Amount', 'Currency', 'Billed']];
        state.entries.filter(function (e) { return e.date >= range.from && e.date <= range.to && byId[e.client]; })
            .slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start || 0) - (b.start || 0); })
            .forEach(function (e) {
                var c = byId[e.client], cm = chargedMin(e, c), end = e.start == null ? null : (e.start + Math.round(e.sec / 60)) % 1440;
                rows.push([e.date, e.start == null ? '' : pad(Math.floor(e.start / 60)) + ':' + pad(e.start % 60), end == null ? '' : pad(Math.floor(end / 60)) + ':' + pad(end % 60),
                    c.name, e.task, entryMin(e), cm, fmtDecimal(cm), e.billable === false ? '0.00' : fmtMoney(e.rate, ''), fmtMoney(centsFor(cm, e.billable === false ? 0 : e.rate), ''), c.sym || '', e.bill ? 'Billed ' + e.bill.at : (e.billable === false ? 'Not charged' : 'Not billed yet')]);
            });
        return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
    }

    // ---------- saved data ----------
    function emptyState() { return { v: 1, clients: [], entries: [], timer: null, weekStart: 1, period: 'week', nextId: 1 }; }

    // Checks every value from storage or a backup file. Bad rows are dropped, never trusted.
    function validate(raw) {
        var s = emptyState();
        if (!raw || typeof raw !== 'object') return s;
        var ids = {};
        (Array.isArray(raw.clients) ? raw.clients : []).slice(0, 500).forEach(function (c) {
            if (!c || typeof c !== 'object') return;
            var id = String(c.id || ''), name = cleanText(c.name, 40);
            if (!id || !name || ids[id]) return;
            var rate = Number.isInteger(c.rate) && c.rate >= 0 && c.rate <= MAX_RATE ? c.rate : 0;
            s.clients.push({ id: id, name: name, rate: rate, sym: SYMBOLS.indexOf(c.sym) >= 0 ? c.sym : '', round: ROUNDING.indexOf(c.round) >= 0 ? c.round : 0 });
            ids[id] = true;
        });
        var eids = {};
        (Array.isArray(raw.entries) ? raw.entries : []).slice(0, 50000).forEach(function (e) {
            if (!e || typeof e !== 'object') return;
            var id = String(e.id || '');
            if (!id || eids[id] || !ids[e.client] || !isDate(e.date)) return;
            if (!Number.isInteger(e.sec) || e.sec < 1 || e.sec > MAX_SEC) return;
            var start = e.start == null ? null : (Number.isInteger(e.start) && e.start >= 0 && e.start < 1440 ? e.start : undefined);
            if (start === undefined) return;
            var bill = null;
            if (e.bill && typeof e.bill === 'object' && isDate(e.bill.at) && Number.isInteger(e.bill.min) && e.bill.min >= 0 && e.bill.min <= 1440) bill = { at: e.bill.at, min: e.bill.min };
            s.entries.push({ id: id, client: String(e.client), task: cleanText(e.task, 80), date: e.date, start: start, sec: e.sec,
                rate: Number.isInteger(e.rate) && e.rate >= 0 && e.rate <= MAX_RATE ? e.rate : 0, billable: e.billable !== false, bill: bill });
            eids[id] = true;
        });
        var t = raw.timer;
        if (t && typeof t === 'object' && ids[t.client] && typeof t.startMs === 'number' && isFinite(t.startMs) && t.startMs > 946684800000)
            s.timer = { client: String(t.client), task: cleanText(t.task, 80), startMs: t.startMs };
        if ([0, 1, 6].indexOf(raw.weekStart) >= 0) s.weekStart = raw.weekStart;
        if (['week', 'lastweek', 'month', 'lastmonth', 'unbilled', 'custom'].indexOf(raw.period) >= 0) s.period = raw.period;
        if (isDate(raw.from)) s.from = raw.from;
        if (isDate(raw.to)) s.to = raw.to;
        s.nextId = Number.isInteger(raw.nextId) && raw.nextId > 0 ? raw.nextId : 1;
        // never hand out an id that is already used
        s.clients.concat(s.entries).forEach(function (x) { var n = parseInt(String(x.id).replace(/\D/g, ''), 10); if (n >= s.nextId) s.nextId = n + 1; });
        return s;
    }

    var api = {
        ROUNDING: ROUNDING, SYMBOLS: SYMBOLS, MAX_SEC: MAX_SEC,
        isDate: isDate, dateOf: dateOf, minuteOf: minuteOf, addDays: addDays, weekday: weekday, weekStart: weekStart, monthEnd: monthEnd, periodRange: periodRange,
        parseMoney: parseMoney, parseDuration: parseDuration, parseClock: parseClock,
        fmtMoney: fmtMoney, fmtDur: fmtDur, fmtDecimal: fmtDecimal, fmtClockSec: fmtClockSec, pad: pad,
        entryMin: entryMin, roundUp: roundUp, chargedMin: chargedMin, centsFor: centsFor, overlaps: overlaps, crossesMidnight: crossesMidnight,
        entryFromTimer: entryFromTimer, entryFromForm: entryFromForm, cleanText: cleanText, taskKey: taskKey,
        summarize: summarize, moneyLine: moneyLine, invoiceText: invoiceText, toCSV: toCSV,
        emptyState: emptyState, validate: validate
    };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.TT = api;
})(this);
