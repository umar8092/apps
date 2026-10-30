// Work Hours Limit Tracker logic: no page code here, so it can be tested on its own (node tests.js).
// Dates are 'YYYY-MM-DD' strings and are counted as whole days (UTC maths, so summer time never shifts a day).
// Times are whole minutes, so every total is exact.
(function (root) {
    'use strict';
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // limit and holiday are hours; holiday null means no limit in holiday weeks
    const PRESETS = [
        { id: 'uk-degree', short: 'UK, degree level', name: 'UK Student visa, degree level', limit: 20, period: 7, holiday: null },
        { id: 'uk-below', short: 'UK, below degree level', name: 'UK Student visa, below degree level', limit: 10, period: 7, holiday: null },
        { id: 'au', short: 'Australia', name: 'Australia Student visa (subclass 500)', limit: 48, period: 14, holiday: null },
        { id: 'ca', short: 'Canada, work off campus', name: 'Canada study permit, work off campus', limit: 24, period: 7, holiday: null },
        { id: 'ie', short: 'Ireland', name: 'Ireland Stamp 2', limit: 20, period: 7, holiday: 40 },
        { id: 'nz', short: 'New Zealand', name: 'New Zealand student visa', limit: 25, period: 7, holiday: null },
        { id: 'us', short: 'USA F-1, job on campus', name: 'USA F-1 visa, job on campus', limit: 20, period: 7, holiday: null },
        { id: 'custom', short: 'My own limit', name: 'My own limit', limit: 20, period: 7, holiday: null }
    ];
    const preset = id => PRESETS.find(p => p.id === id) || null;

    function defaultRule() { return { preset: 'uk-degree', limit: 1200, period: 7, weekStart: 1, holiday: null }; }
    function ruleFromPreset(id, weekStart) {
        const p = preset(id) || PRESETS[0];
        return { preset: p.id, limit: p.limit * 60, period: p.period, weekStart: weekStart === undefined ? 1 : weekStart, holiday: p.holiday === null ? null : p.holiday * 60 };
    }

    // ---- dates ----
    function parseDate(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
        if (!m) return NaN;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return NaN;
        const t = Date.UTC(y, mo - 1, d), back = new Date(t);
        if (back.getUTCDate() !== d) return NaN;
        return Math.round(t / 86400000);
    }
    const isDate = s => !isNaN(parseDate(s));
    function dayStr(n) { const d = new Date(n * 86400000); return d.toISOString().slice(0, 10); }
    const weekday = n => ((n + 4) % 7 + 7) % 7; // 1 Jan 1970 was a Thursday; 0 = Sunday
    const periodStart = (n, weekStart) => n - ((weekday(n) - weekStart + 7) % 7);
    function fmtDay(n, withYear) {
        const d = new Date(n * 86400000);
        return DAY_NAMES[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + (withYear ? ' ' + d.getUTCFullYear() : '');
    }
    function fmtRange(a, b) { return fmtDay(a) + ' to ' + fmtDay(b, true); }
    function nowParts(date) {
        const d = date || new Date();
        const pad = x => String(x).padStart(2, '0');
        return { day: parseDate(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())), min: d.getHours() * 60 + d.getMinutes() };
    }

    // ---- times ----
    function parseTime(s) {
        const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(String(s || ''));
        if (!m) return NaN;
        const h = +m[1], mi = +m[2];
        if (h > 23 || mi > 59) return NaN;
        return h * 60 + mi;
    }
    const pad2 = n => String(n).padStart(2, '0');
    const timeStr = m => pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
    function fmt(min) {
        min = Math.round(Math.abs(min));
        const h = Math.floor(min / 60), m = min % 60;
        if (!h) return m + ' min';
        return m ? h + ' h ' + m + ' min' : h + ' h';
    }
    // hours typed by the user: "20", "19.5", "19,5"
    function parseHours(s, max) {
        const t = String(s === undefined || s === null ? '' : s).trim().replace(',', '.');
        if (!t) return { error: 'Type the number of hours.' };
        if (!/^\d+(\.\d+)?$/.test(t)) return { error: 'Type hours as a number, for example 20 or 19.5.' };
        const n = Math.round(parseFloat(t) * 60);
        if (n <= 0) return { error: 'The limit must be more than 0 hours.' };
        if (n > max * 60) return { error: 'That is more than ' + max + ' hours.' };
        return { min: n };
    }

    // ---- shifts ----
    function cleanText(s, max) { return String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max); }
    function cleanNote(s, max) { return String(s === undefined || s === null ? '' : s).replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max); }

    function span(s) {
        const a = parseTime(s.start), b = parseTime(s.end);
        const crosses = b <= a;
        return { a, b, crosses, gross: crosses ? 1440 - a + b : b - a };
    }
    // checks what was typed in the form; returns { ok, errors, shift }
    function validateShift(raw) {
        const errors = {};
        const date = String(raw.date || '').trim();
        if (!date) errors.date = 'Pick the day the shift starts.';
        else if (!isDate(date)) errors.date = 'That date is not right. Pick it from the calendar.';
        const a = parseTime(raw.start), b = parseTime(raw.end);
        if (!String(raw.start || '').trim()) errors.start = 'Type the time the shift starts.';
        else if (isNaN(a)) errors.start = 'Type a time like 09:00 or 18:30.';
        if (!String(raw.end || '').trim()) errors.end = 'Type the time the shift ends.';
        else if (isNaN(b)) errors.end = 'Type a time like 17:00 or 22:30.';
        else if (!isNaN(a) && a === b) errors.end = 'Start and end are the same time. A shift past midnight ends the next morning, for example 22:00 to 06:00.';
        let brk = 0;
        const bt = String(raw.brk === undefined || raw.brk === null ? '' : raw.brk).trim();
        if (bt) {
            if (!/^\d+$/.test(bt)) errors.brk = 'Type the break in whole minutes, for example 30.';
            else brk = +bt;
        }
        if (!errors.brk && !errors.start && !errors.end && !isNaN(a) && !isNaN(b)) {
            const g = span({ start: raw.start, end: raw.end }).gross;
            if (brk >= g) errors.brk = 'The break (' + fmt(brk) + ') is as long as the whole shift (' + fmt(g) + ').';
        }
        const ok = !Object.keys(errors).length;
        return {
            ok, errors,
            shift: ok ? { date, start: timeStr(a), end: timeStr(b), brk, employer: cleanText(raw.employer, 60), note: cleanNote(raw.note, 200) } : null
        };
    }
    const net = s => span(s).gross - (s.brk || 0);
    // a shift past midnight counts on both days; the break comes off the first day first
    function parts(s) {
        const d = parseDate(s.date), sp = span(s);
        let first = sp.crosses ? 1440 - sp.a : sp.gross, second = sp.crosses ? sp.b : 0, brk = s.brk || 0;
        const off = Math.min(brk, first); first -= off; second -= brk - off;
        const out = [];
        if (first > 0) out.push({ day: d, min: first });
        if (second > 0) out.push({ day: d + 1, min: second });
        return out;
    }
    // planned = it has not ended yet
    function isPlanned(s, now) {
        const sp = span(s), endAt = (parseDate(s.date) + (sp.crosses ? 1 : 0)) * 1440 + sp.b;
        return endAt > now.day * 1440 + now.min;
    }
    function overlaps(a, b) {
        const sa = span(a), sb = span(b);
        const a0 = parseDate(a.date) * 1440 + sa.a, a1 = a0 + sa.gross, b0 = parseDate(b.date) * 1440 + sb.a, b1 = b0 + sb.gross;
        return a0 < b1 && b0 < a1;
    }
    function sortShifts(list) {
        return list.slice().sort((x, y) => (parseDate(x.date) - parseDate(y.date)) || (parseTime(x.start) - parseTime(y.start)) || String(x.id).localeCompare(String(y.id)));
    }

    // ---- holidays ----
    function validateHoliday(raw) {
        const errors = {}, from = String(raw.from || '').trim(), to = String(raw.to || '').trim();
        if (!from) errors.from = 'Pick the first day of the holiday.'; else if (!isDate(from)) errors.from = 'That date is not right.';
        if (!to) errors.to = 'Pick the last day of the holiday.'; else if (!isDate(to)) errors.to = 'That date is not right.';
        if (!errors.from && !errors.to && parseDate(to) < parseDate(from)) errors.to = 'The last day is before the first day.';
        if (!errors.from && !errors.to && parseDate(to) - parseDate(from) > 366) errors.to = 'A holiday longer than a year? Check the dates.';
        const ok = !Object.keys(errors).length;
        return { ok, errors, holiday: ok ? { from, to, name: cleanText(raw.name, 60) } : null };
    }
    const inHoliday = (n, hols) => hols.some(h => n >= parseDate(h.from) && n <= parseDate(h.to));

    // ---- limits ----
    // the limit for a period: holiday rules only when every day is in an official holiday (the safe choice)
    function limitFor(rule, hols, from, days) {
        let hol = 0;
        for (let i = 0; i < days; i++) if (inHoliday(from + i, hols)) hol++;
        const holiday = hol === days;
        return { limit: holiday ? rule.holiday : rule.limit, holiday, part: hol > 0 && !holiday };
    }
    function windowTotals(shifts, from, days, now) {
        let worked = 0, planned = 0;
        const byEmp = {};
        for (const s of shifts) {
            const p = isPlanned(s, now);
            for (const x of parts(s)) {
                if (x.day < from || x.day >= from + days) continue;
                if (p) planned += x.min; else worked += x.min;
                const k = s.employer || '';
                byEmp[k] = (byEmp[k] || 0) + x.min;
            }
        }
        return { worked, planned, total: worked + planned, byEmp };
    }
    function windowReport(state, from, days, now) {
        const lim = limitFor(state.rule, state.holidays, from, days), t = windowTotals(state.shifts, from, days, now);
        const r = { from, to: from + days - 1, days, limit: lim.limit, holiday: lim.holiday, part: lim.part, worked: t.worked, planned: t.planned, total: t.total, byEmp: t.byEmp };
        r.left = r.limit === null ? null : Math.max(0, r.limit - r.total);
        r.over = r.limit === null ? 0 : Math.max(0, r.total - r.limit);
        r.workedOver = r.limit === null ? 0 : Math.max(0, r.worked - r.limit);
        return r;
    }
    // everything about one week; with a fortnight rule both fortnights that hold this week are checked
    function weekReport(state, weekFrom, now) {
        const week = windowReport(state, weekFrom, 7, now);
        const windows = state.rule.period === 14 ? [windowReport(state, weekFrom - 7, 14, now), windowReport(state, weekFrom, 14, now)] : [week];
        const limited = windows.filter(w => w.limit !== null);
        const left = limited.length ? Math.min.apply(null, limited.map(w => w.left)) : null;
        const over = limited.length ? Math.max.apply(null, limited.map(w => w.over)) : 0;
        const workedOver = limited.length ? Math.max.apply(null, limited.map(w => w.workedOver)) : 0;
        // planned shifts in this week that sit in a period that is over
        const overShifts = over > 0 ? sortShifts(state.shifts.filter(s => isPlanned(s, now) && parts(s).some(x => x.day >= weekFrom && x.day < weekFrom + 7))) : [];
        const shifts = sortShifts(state.shifts.filter(s => parts(s).some(x => x.day >= weekFrom && x.day < weekFrom + 7) || (parseDate(s.date) >= weekFrom && parseDate(s.date) < weekFrom + 7)));
        let status = 'ok';
        if (left === null) status = 'nolimit';
        else if (workedOver > 0) status = 'over';
        else if (over > 0) status = 'planned-over';
        else if (left === 0) status = 'full';
        return { from: weekFrom, to: weekFrom + 6, week, windows, left, over, workedOver, overShifts, shifts, status };
    }
    // every week (or rolling fortnight) that has any hours, newest first
    function allWindows(state, now) {
        const days = state.rule.period, starts = new Set();
        for (const s of state.shifts) for (const x of parts(s)) {
            const w = periodStart(x.day, state.rule.weekStart);
            starts.add(w);
            if (days === 14) starts.add(w - 7);
        }
        return Array.from(starts).sort((a, b) => b - a).map(f => windowReport(state, f, days, now)).filter(w => w.total > 0);
    }
    function overSummary(state, now) {
        const all = allWindows(state, now);
        return { worked: all.filter(w => w.workedOver > 0), planned: all.filter(w => w.over > 0 && w.workedOver === 0) };
    }

    function ruleText(rule) {
        const p = preset(rule.preset);
        const per = rule.period === 14 ? 'a fortnight' : 'a week';
        let t = fmt(rule.limit) + ' ' + per + ' in term time';
        t += rule.holiday === null ? ', no limit in official holidays' : ', ' + fmt(rule.holiday) + ' ' + per + ' in official holidays';
        return { name: p ? p.name : 'My own limit', text: t, starts: (rule.period === 14 ? 'Fortnights' : 'Weeks') + ' start on ' + FULL_DAYS[rule.weekStart] };
    }

    // ---- text out ----
    function shiftLine(s) {
        const sp = span(s);
        return fmtDay(parseDate(s.date)) + ', ' + s.start + ' to ' + s.end + (sp.crosses ? ' (next day)' : '') + ', ' + fmt(net(s)) + (s.brk ? ' (' + fmt(s.brk) + ' unpaid break)' : '') + (s.employer ? ', ' + s.employer : '');
    }
    function weekText(state, rep, now) {
        const L = [];
        L.push('Work hours, ' + fmtRange(rep.from, rep.to));
        L.push('Total this week: ' + fmt(rep.week.total) + (rep.week.planned ? ' (' + fmt(rep.week.worked) + ' worked, ' + fmt(rep.week.planned) + ' planned)' : ''));
        for (const w of rep.windows) {
            if (state.rule.period === 14) L.push('Fortnight ' + fmtRange(w.from, w.to) + ': ' + fmt(w.total) + (w.limit === null ? ' (holiday, no limit)' : ' of ' + fmt(w.limit)));
            else if (w.limit === null) L.push('Holiday week, no limit');
            else L.push('Limit: ' + fmt(w.limit) + (w.holiday ? ' (holiday week)' : ''));
        }
        const emps = Object.keys(rep.week.byEmp).filter(k => k);
        if (emps.length > 1) for (const k of emps.sort()) L.push(k + ': ' + fmt(rep.week.byEmp[k]));
        L.push('');
        for (const s of rep.shifts) L.push(shiftLine(s) + (isPlanned(s, now) ? ' [planned]' : ''));
        if (!rep.shifts.length) L.push('No shifts.');
        return L.join('\n');
    }
    function csvCell(v) { const t = String(v); return /[",\n]/.test(t) || /^[=+\-@]/.test(t) ? '"' + (/^[=+\-@]/.test(t) ? "'" : '') + t.replace(/"/g, '""') + '"' : t; }
    function csv(state) {
        const rows = [['Date', 'Day', 'Employer', 'Start', 'End', 'Unpaid break (min)', 'Hours', 'Minutes', 'Note']];
        for (const s of sortShifts(state.shifts)) {
            const n = net(s), d = parseDate(s.date);
            rows.push([s.date, DAY_NAMES[weekday(d)], s.employer, s.start, s.end, s.brk || 0, (n / 60).toFixed(2), n, s.note || '']);
        }
        return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    // ---- saved data ----
    function emptyState() { return { v: 1, rule: defaultRule(), holidays: [], shifts: [] }; }
    let idN = 0;
    function newId() { return Date.now().toString(36) + (idN++).toString(36) + Math.random().toString(36).slice(2, 6); }
    // checks every value of saved or imported data; bad rows are dropped, never trusted
    function sanitize(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
        const st = emptyState();
        const r = data.rule;
        if (r && typeof r === 'object') {
            const period = r.period === 14 ? 14 : 7;
            const limit = Number.isInteger(r.limit) && r.limit > 0 && r.limit <= period * 24 * 60 ? r.limit : null;
            const hol = r.holiday === null ? null : (Number.isInteger(r.holiday) && r.holiday > 0 && r.holiday <= period * 24 * 60 ? r.holiday : undefined);
            if (limit !== null && hol !== undefined) {
                st.rule = { preset: preset(r.preset) ? r.preset : 'custom', limit, period, weekStart: Number.isInteger(r.weekStart) && r.weekStart >= 0 && r.weekStart <= 6 ? r.weekStart : 1, holiday: hol };
            }
        }
        const ids = new Set();
        const uid = x => { let id = typeof x === 'string' && x && x.length <= 40 ? x : newId(); while (ids.has(id)) id = newId(); ids.add(id); return id; };
        if (Array.isArray(data.holidays)) for (const h of data.holidays.slice(0, 200)) {
            if (!h || typeof h !== 'object') continue;
            const v = validateHoliday(h);
            if (v.ok) st.holidays.push(Object.assign({ id: uid(h.id) }, v.holiday));
        }
        if (Array.isArray(data.shifts)) for (const s of data.shifts.slice(0, 20000)) {
            if (!s || typeof s !== 'object') continue;
            const v = validateShift({ date: s.date, start: s.start, end: s.end, brk: s.brk === undefined ? '' : String(s.brk), employer: s.employer, note: s.note });
            if (v.ok) st.shifts.push(Object.assign({ id: uid(s.id) }, v.shift));
        }
        return st;
    }

    const api = {
        PRESETS, preset, defaultRule, ruleFromPreset, parseDate, isDate, dayStr, weekday, periodStart, fmtDay, fmtRange, nowParts,
        parseTime, timeStr, fmt, parseHours, cleanText, cleanNote, span, validateShift, net, parts, isPlanned, overlaps, sortShifts,
        validateHoliday, inHoliday, limitFor, windowTotals, windowReport, weekReport, allWindows, overSummary, ruleText,
        shiftLine, weekText, csv, emptyState, newId, sanitize, FULL_DAYS
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.WHL = api;
})(typeof window !== 'undefined' ? window : this);
