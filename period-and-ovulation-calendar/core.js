// Period and Ovulation Calendar: the date maths, with no page code. Works in the browser (window.PeriodCore) and in node (require).
// Dates are calendar days ('2026-10-16') turned into whole day numbers, so time zones and summer time never move a period.
(function (root) {
    'use strict';
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const SYMPTOMS = [['cramps', 'Cramps'], ['heavy', 'Heavy flow'], ['spotting', 'Spotting'], ['headache', 'Headache'], ['bloating', 'Bloating'],
        ['tender', 'Tender breasts'], ['mood', 'Low mood'], ['tired', 'Tired'], ['acne', 'Spots / acne'], ['discharge', 'Clear, stretchy discharge']];
    const SYM_KEYS = SYMPTOMS.map(s => s[0]);
    const LIMITS = { cycleMin: 15, cycleMax: 90, lenMin: 1, lenMax: 15, keep: 6, ignoreGap: 90, short: 21, long: 35 };
    const DEFAULTS = { cycle: 28, len: 5, paused: false, weekStart: 1, icsFertile: true };

    // ---- days
    function validISO(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const [y, m, d] = s.split('-').map(Number);
        if (y < 1950 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
        return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
    }
    const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
    const isoOf = n => new Date(n * 864e5).toISOString().slice(0, 10);
    const addDays = (s, k) => isoOf(dayNum(s) + k);
    const diff = (a, b) => dayNum(b) - dayNum(a);
    const localISO = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const weekday = s => new Date(dayNum(s) * 864e5).getUTCDay();
    function fmt(s, opt = {}) {
        const [y, m, d] = s.split('-').map(Number);
        return (opt.day ? DAYS[weekday(s)] + ' ' : '') + d + ' ' + MONTHS[m - 1] + (opt.year === false ? '' : ' ' + y);
    }
    // "9 to 18 Oct 2026", "28 Oct to 2 Nov 2026"
    function fmtRange(a, b) {
        if (a === b) return fmt(a);
        const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
        if (ya === yb && ma === mb) return +a.slice(8) + ' to ' + fmt(b);
        if (ya === yb) return fmt(a, { year: false }) + ' to ' + fmt(b);
        return fmt(a) + ' to ' + fmt(b);
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

    // ---- saved data: check everything, keep what is valid
    function clampInt(v, lo, hi, def) { v = Number(v); return Number.isInteger(v) && v >= lo && v <= hi ? v : def; }
    function normalize(raw) {
        const out = { v: 1, periods: [], days: {}, settings: Object.assign({}, DEFAULTS) };
        if (!raw || typeof raw !== 'object') return out;
        const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
        out.settings.cycle = clampInt(s.cycle, LIMITS.cycleMin, LIMITS.cycleMax, DEFAULTS.cycle);
        out.settings.len = clampInt(s.len, LIMITS.lenMin, LIMITS.lenMax, DEFAULTS.len);
        out.settings.paused = s.paused === true;
        out.settings.weekStart = s.weekStart === 0 ? 0 : 1;
        out.settings.icsFertile = s.icsFertile !== false;
        const seen = new Set();
        (Array.isArray(raw.periods) ? raw.periods : []).forEach(p => {
            if (!p || !validISO(p.start) || seen.has(p.start)) return;
            seen.add(p.start);
            out.periods.push({ start: p.start, len: clampInt(p.len, LIMITS.lenMin, LIMITS.lenMax, out.settings.len), skipGap: p.skipGap === true });
        });
        out.periods.sort((a, b) => a.start < b.start ? -1 : 1);
        if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
            Object.keys(raw.days).forEach(k => {
                const d = raw.days[k]; if (!validISO(k) || !d || typeof d !== 'object') return;
                const sy = (Array.isArray(d.s) ? d.s : []).filter((x, i, a) => SYM_KEYS.includes(x) && a.indexOf(x) === i);
                const n = typeof d.n === 'string' ? d.n.slice(0, 300) : '';
                if (sy.length || n.trim()) out.days[k] = { s: sy, n };
            });
        }
        return out;
    }

    // ---- the periods with the cycle before each one
    function cycles(periods) {
        return periods.map((p, i) => {
            const r = { start: p.start, len: p.len, skipGap: p.skipGap, cycle: null, counted: false, flag: '' };
            if (i === 0) return r;
            r.cycle = diff(periods[i - 1].start, p.start);
            if (p.skipGap) r.flag = 'skipped';
            else if (r.cycle >= LIMITS.ignoreGap) r.flag = 'gap';
            else {
                r.counted = true;
                if (r.cycle < LIMITS.short) r.flag = 'short';
                else if (r.cycle > LIMITS.long) r.flag = 'long';
            }
            return r;
        });
    }

    // ---- everything the page shows, for the day `today`
    function analyse(state, today) {
        const st = state.settings, list = cycles(state.periods);
        const a = { today, list, periods: state.periods.length, paused: st.paused };
        const counted = list.filter(r => r.counted).slice(-LIMITS.keep).map(r => r.cycle);
        const lens = state.periods.slice(-LIMITS.keep).map(p => p.len);
        a.countedCycles = counted.length;
        a.avg = counted.length ? Math.round(counted.reduce((x, y) => x + y, 0) / counted.length) : st.cycle;
        a.min = counted.length ? Math.min(...counted) : st.cycle;
        a.max = counted.length ? Math.max(...counted) : st.cycle;
        a.fromTyped = !counted.length;
        a.avgLen = lens.length ? Math.round(lens.reduce((x, y) => x + y, 0) / lens.length) : st.len;
        a.irregular = counted.length >= 2 && a.max - a.min > 7;
        a.flags = list.filter(r => r.flag === 'short' || r.flag === 'long').slice(-LIMITS.keep);
        if (!state.periods.length) { a.status = 'empty'; return a; }
        const last = state.periods[state.periods.length - 1];
        a.last = last.start;
        a.cycleDay = diff(last.start, today) + 1;
        if (a.cycleDay < 1) { a.status = 'future'; return a; }
        a.onPeriod = a.cycleDay <= last.len ? a.cycleDay : 0;
        a.lastLen = last.len;
        a.sinceDays = a.cycleDay - 1;
        if (st.paused) { a.status = 'paused'; return a; }
        a.expected = addDays(last.start, a.avg);
        a.earliest = addDays(last.start, a.min);
        a.latest = addDays(last.start, a.max);
        a.hasRange = a.earliest !== a.latest;
        a.ovulation = addDays(a.expected, -14);
        a.fertileStart = addDays(a.earliest, -14 - 5);
        a.fertileEnd = addDays(a.latest, -14 + 1);
        a.daysToExpected = diff(today, a.expected);
        a.late = a.daysToExpected < 0 ? -a.daysToExpected : 0;
        a.pastLatest = diff(a.latest, today) > 0;
        a.longGap = a.sinceDays >= 60;
        if (a.onPeriod) a.status = 'period';
        else if (a.late) a.status = 'late';
        else a.status = 'waiting';
        if (today < a.fertileStart) a.fertileWhen = 'ahead';
        else if (today <= a.fertileEnd) a.fertileWhen = 'now';
        else a.fertileWhen = 'passed';
        // the next three periods: when late, the next one is expected from today on
        a.next = [];
        let s = a.late ? today : a.expected;
        for (let k = 0; k < 3; k++) { a.next.push({ start: s, len: a.avgLen }); s = addDays(s, a.avg); }
        // fertile windows: this cycle's, then one before each predicted period after the first
        a.windows = [{ start: a.fertileStart, end: a.fertileEnd, ovulation: a.ovulation, current: true }];
        for (let k = 1; k < a.next.length; k++) {
            const ov = addDays(a.next[k].start, -14);
            a.windows.push({ start: addDays(ov, a.min - a.avg - 5), end: addDays(ov, a.max - a.avg + 1), ovulation: ov });
        }
        return a;
    }

    // what to draw on one calendar day
    function mark(state, a, iso) {
        const m = { logged: 0, start: false, predicted: false, fertile: false, ovulation: false, today: iso === a.today, future: iso > a.today };
        for (const p of state.periods) {
            const k = diff(p.start, iso);
            if (k >= 0 && k < p.len) { m.logged = k + 1; m.start = k === 0; m.periodStart = p.start; break; }
        }
        if (!m.logged && a.next && iso >= a.today) {
            m.predicted = a.next.some(n => { const k = diff(n.start, iso); return k >= 0 && k < n.len; });
        }
        if (!m.logged && !m.predicted && a.windows) {
            m.fertile = a.windows.some(w => iso >= w.start && iso <= w.end && (iso >= a.today || w.current));
            m.ovulation = a.windows.some(w => w.ovulation === iso && (iso >= a.today || w.current));
        }
        const d = state.days[iso]; m.notes = !!(d && (d.s.length || d.n.trim()));
        return m;
    }

    // can this day be logged as the first day of a period?
    function checkStart(state, iso, today) {
        if (!validISO(iso)) return { error: 'Pick the day your period started.' };
        if (iso > today) return { error: 'That day is in the future. Log a period on the day it starts.' };
        if (diff(iso, today) > 366 * 10) return { error: 'That is more than 10 years ago. Pick a later day.' };
        if (state.periods.some(p => p.start === iso)) return { error: 'A period starting ' + fmt(iso) + ' is already logged.' };
        const inside = state.periods.find(p => { const k = diff(p.start, iso); return k > 0 && k < p.len; });
        if (inside) return { error: 'That is day ' + (diff(inside.start, iso) + 1) + ' of the period that started ' + fmt(inside.start) + '. Log only the first day of each period. If it lasted longer, change "Lasted" in Your periods.' };
        const before = state.periods.filter(p => p.start < iso).pop(), after = state.periods.find(p => p.start > iso);
        const near = [before && diff(before.start, iso), after && diff(iso, after.start)].filter(x => x != null && x < LIMITS.short - 6);
        return near.length ? { warn: 'Only ' + plural(Math.min(...near), 'day') + ' from another period. If this was light spotting, you can delete it again.' } : {};
    }

    // ---- summary for copy, email and print
    function summary(state, a) {
        const L = ['Period and Ovulation Calendar summary, ' + fmt(a.today)];
        if (!state.periods.length) { L.push('No periods logged yet.'); return L.join('\n'); }
        L.push('', 'Last period started: ' + fmt(a.last, { day: true }) + (a.cycleDay >= 1 ? ' (today is day ' + a.cycleDay + ' of the cycle)' : ''));
        if (a.status === 'paused') L.push('Predictions paused (pregnant, breastfeeding or on hormonal birth control).');
        else if (a.expected) {
            L.push('Next period expected: ' + (a.late ? fmt(a.expected, { day: true }) + ', now ' + plural(a.late, 'day') + ' late' : 'around ' + fmt(a.expected, { day: true })) + (a.hasRange ? ' (usual range ' + fmtRange(a.earliest, a.latest) + ')' : ''));
            L.push('Likely fertile window: ' + fmtRange(a.fertileStart, a.fertileEnd) + ', ovulation around ' + fmt(a.ovulation));
        }
        if (a.fromTyped) L.push('Cycle length: ' + a.avg + ' days (typed in, not enough periods logged yet)');
        else L.push('Average cycle: ' + a.avg + ' days (shortest ' + a.min + ', longest ' + a.max + ', from the last ' + plural(a.countedCycles, 'cycle') + ')');
        L.push('Average period length: ' + plural(a.avgLen, 'day'));
        L.push('', 'Periods logged (' + state.periods.length + '):');
        a.list.slice().reverse().forEach(r => L.push('- ' + fmt(r.start) + ', lasted ' + plural(r.len, 'day') + (r.cycle == null ? '' : ', ' + r.cycle + ' days after the one before' + (r.counted ? '' : ' (not counted)') + (r.flag === 'short' ? ' (short)' : r.flag === 'long' ? ' (long)' : ''))));
        const since = addDays(a.today, -92), days = Object.keys(state.days).filter(k => k >= since && k <= a.today).sort();
        if (days.length) {
            L.push('', 'Symptoms and notes (last 3 months):');
            days.forEach(k => { const d = state.days[k]; L.push('- ' + fmt(k) + ': ' + d.s.map(x => SYMPTOMS.find(s => s[0] === x)[1].toLowerCase()).concat(d.n.trim() ? [d.n.trim().replace(/\s+/g, ' ')] : []).join(', ')); });
        }
        L.push('', 'Estimates from past cycles, not medical advice and not birth control.');
        return L.join('\n');
    }

    // ---- calendar file (.ics) with the next periods and, if wanted, fertile windows
    function ics(a, withFertile, stamp) {
        const d8 = s => s.replace(/-/g, '');
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Period and Ovulation Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
        const ev = (uid, start, endExcl, title, desc, alarm) => {
            L.push('BEGIN:VEVENT', 'UID:' + uid + '@period-and-ovulation-calendar', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d8(start), 'DTEND;VALUE=DATE:' + d8(endExcl),
                'SUMMARY:' + title, 'DESCRIPTION:' + desc, 'TRANSP:TRANSPARENT');
            if (alarm) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + title, 'TRIGGER:-PT12H', 'END:VALARM');
            L.push('END:VEVENT');
        };
        (a.next || []).forEach(n => ev('period-' + d8(n.start), n.start, addDays(n.start, n.len), 'Period expected', 'Estimate from your past cycles (average ' + a.avg + ' days).', true));
        if (withFertile) (a.windows || []).filter(w => w.end >= a.today).forEach(w => ev('fertile-' + d8(w.start), w.start, addDays(w.end, 1), 'Fertile window', 'Likely fertile days, ovulation around ' + fmt(w.ovulation) + '. An estimate, not birth control.', false));
        L.push('END:VCALENDAR');
        return L.join('\r\n') + '\r\n';
    }

    // ---- calendar grid: 6 weeks of iso days for a month
    function monthGrid(year, month, weekStart) {
        const first = Date.UTC(year, month, 1) / 864e5, dow = new Date(first * 864e5).getUTCDay();
        const start = first - ((dow - weekStart + 7) % 7);
        const days = []; for (let i = 0; i < 42; i++) days.push(isoOf(start + i));
        while (days.length > 28 && days.slice(-7).every(d => +d.slice(5, 7) !== month + 1)) days.splice(-7);
        return days;
    }

    const api = { MONTHS, MONTHS_LONG, DAYS, SYMPTOMS, LIMITS, DEFAULTS, validISO, dayNum, isoOf, addDays, diff, localISO, weekday, fmt, fmtRange, plural,
        normalize, cycles, analyse, mark, checkStart, summary, ics, monthGrid };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PeriodCore = api;
})(this);
