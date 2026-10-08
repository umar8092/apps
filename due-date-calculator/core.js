// Due date maths with no page code. Dates are whole day numbers (days since 1970-01-01, UTC),
// so daylight saving and time zones can never shift a result by a day.
(function (root) {
    const DAY = 86400000;
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const PREGNANCY_DAYS = 280;       // 40 weeks counted from the first day of the last period
    const CONCEPTION_DAYS = 266;      // 38 weeks counted from conception

    // 'yyyy-mm-dd' -> day number, or null when it is not a real calendar date
    function parseISO(text) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        const t = Date.UTC(y, mo - 1, d);
        const back = new Date(t);
        if (y < 1900 || back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
        return Math.round(t / DAY);
    }
    function toISO(n) {
        const dt = new Date(n * DAY);
        return dt.getUTCFullYear() + '-' + String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
    }
    // The same text everywhere in the world: "Tuesday 8 June 2027"
    function fmtDate(n, withWeekday) {
        const dt = new Date(n * DAY);
        const s = dt.getUTCDate() + ' ' + MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear();
        return withWeekday === false ? s : DAYS[dt.getUTCDay()] + ' ' + s;
    }
    function fmtShort(n) {
        const dt = new Date(n * DAY);
        return dt.getUTCDate() + ' ' + MONTHS[dt.getUTCMonth()].slice(0, 3) + ' ' + dt.getUTCFullYear();
    }
    function todayNum(now) {
        const d = now || new Date();
        return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
    }
    const clampInt = (v, lo, hi, dflt) => {
        const n = v === '' || v === null || v === undefined ? NaN : Math.round(Number(v));
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
    };
    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    function weeksDays(days) {
        const w = Math.floor(days / 7), d = days - w * 7;
        return w === 0 ? plural(d, 'day') : plural(w, 'week') + (d ? ' ' + plural(d, 'day') : '');
    }

    // inputs: { method: 'lmp'|'conception'|'ivf'|'scan', date, cycle, embryoDay, weeks, days }
    // returns { error } or { due, start, method }. `start` is day 0 of the pregnancy count (the day that is 0 weeks 0 days).
    function dueDate(inp, today) {
        const date = parseISO(inp.date);
        if (date === null) return { error: 'Please pick a date.' };
        const names = { lmp: 'The first day of your last period', conception: 'The conception date', ivf: 'The transfer date', scan: 'The scan date' };
        if (today !== undefined && date > today) return { error: names[inp.method] + " can't be in the future. Pick a date that has already happened." };
        let start, notes = [];
        if (inp.method === 'lmp') {
            const cycle = clampInt(inp.cycle, 20, 45, 28);
            start = date + (cycle - 28);
            if (cycle !== 28) notes.push('Adjusted for a ' + cycle + '-day cycle.');
        } else if (inp.method === 'conception') {
            start = date - 14;
        } else if (inp.method === 'ivf') {
            const day = clampInt(inp.embryoDay, 3, 6, 5);
            // embryo age on transfer day = day, so conception-equivalent is day days earlier
            start = date - day - 14;
            notes.push('Based on a day ' + day + ' embryo transfer.');
        } else if (inp.method === 'scan') {
            const w = clampInt(inp.weeks, 4, 42, NaN), d = clampInt(inp.days, 0, 6, 0);
            if (Number.isNaN(w)) return { error: 'Enter the weeks (4 to 42) the scan measured.' };
            start = date - (w * 7 + d);
            notes.push('Based on ' + weeksDays(w * 7 + d) + ' at the scan.');
        } else return { error: 'Unknown method.' };
        return { due: start + PREGNANCY_DAYS, start, method: inp.method, notes };
    }

    function trimesterOf(ga) { return ga < 98 ? 1 : ga < 196 ? 2 : 3; }
    const ORD = ['', '1st', '2nd', '3rd'];

    // Where the pregnancy is on a given day
    function progress(r, today) {
        const ga = today - r.start;
        const toGo = r.due - today;
        const out = { ga, toGo, weeks: Math.floor(ga / 7), days: ga - Math.floor(ga / 7) * 7, trimester: trimesterOf(Math.max(ga, 0)),
                      percent: Math.max(0, Math.min(100, Math.round(ga / PREGNANCY_DAYS * 100))), notes: [] };
        out.age = weeksDays(Math.max(ga, 0));
        if (ga < 0) out.notes.push('That date is before the start of a pregnancy count. Please check it.');
        if (ga > 300) out.notes.push('That is more than 42 weeks ago, so please check the date.');
        if (toGo > 0) out.line = 'Today you are ' + out.age + ' pregnant (' + ORD[out.trimester] + ' trimester).';
        else if (toGo === 0) out.line = 'Your due date is today.';
        else out.line = 'Your due date was ' + plural(-toGo, 'day') + ' ago (' + out.age + ').';
        out.togo = toGo > 0 ? plural(toGo, 'day') + ' to go' + (toGo >= 7 ? ' (' + weeksDays(toGo) + ')' : '') : toGo === 0 ? 'Due today' : plural(-toGo, 'day') + ' past the due date';
        return out;
    }

    const MILESTONES = [
        [6, 'A heartbeat can usually be seen on an early scan'],
        [8, 'Booking appointment with your midwife or doctor, usually by now'],
        [12, 'First trimester ends soon: dating scan (11 to 14 weeks)'],
        [14, 'Second trimester begins'],
        [20, 'Anatomy scan (18 to 22 weeks) is around here'],
        [24, 'A baby born from here can survive with intensive care'],
        [28, 'Third trimester begins'],
        [37, 'Baby is counted as full term from here'],
        [40, 'Your due date']
    ];
    function milestones(r, today) {
        return MILESTONES.map(m => {
            const date = r.start + m[0] * 7;
            const diff = date - today;
            return { weeks: m[0], text: m[1], date, status: diff < 0 ? 'passed' : diff === 0 ? 'today' : 'in ' + plural(diff, 'day') };
        });
    }

    function summary(r, today, opts) {
        const p = progress(r, today);
        const lines = ['Estimated due date: ' + fmtDate(r.due), p.line, p.togo + '.', ''];
        milestones(r, today).forEach(m => lines.push(m.weeks + ' weeks: ' + fmtShort(m.date) + ' - ' + m.text));
        lines.push('', 'Only about 1 baby in 25 arrives exactly on the due date. Most arrive within two weeks either side.');
        return lines.join('\n');
    }
    // All-day calendar event on the due date
    function ics(r) {
        const compact = n => toISO(n).replace(/-/g, '');
        return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Due Date Calculator//EN', 'BEGIN:VEVENT',
            'UID:due-' + compact(r.due) + '@umar8092.github.io', 'DTSTAMP:' + compact(r.due) + 'T000000Z',
            'DTSTART;VALUE=DATE:' + compact(r.due), 'DTEND;VALUE=DATE:' + compact(r.due + 1),
            'SUMMARY:Estimated due date', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    }

    const api = { parseISO, toISO, fmtDate, fmtShort, todayNum, weeksDays, dueDate, progress, milestones, summary, ics, PREGNANCY_DAYS, CONCEPTION_DAYS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DueCore = api;
})(typeof self !== 'undefined' ? self : this);
