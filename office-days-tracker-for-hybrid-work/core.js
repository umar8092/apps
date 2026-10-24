// Office Days Tracker for Hybrid Work: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings on the person's own calendar. Office time is counted in half days (2 = one full day)
// so half days stay exact.
(function (root) {
    'use strict';
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    // office: half days in the office; off: a day off that does not count against you
    const MARKS = {
        O: { label: 'Office', short: 'O', office: 2 },
        T: { label: 'Work trip', short: 'T', office: 2 },
        HO: { label: 'Half day in office', short: '½', office: 1 },
        H: { label: 'Home', short: 'H', office: 0 },
        L: { label: 'Leave', short: 'L', office: 0, off: true },
        S: { label: 'Sick', short: 'S', office: 0, off: true },
        P: { label: 'Public holiday', short: 'PH', office: 0, off: true }
    };
    const MAX_DAYS = 6000;

    // ---- dates
    const pad = n => String(n).padStart(2, '0');
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    function parseDate(v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 1990 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
        return { y, m: mo, d };
    }
    const isDate = v => !!parseDate(v);
    const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
    const toUtc = s => { const p = parseDate(s); return Date.UTC(p.y, p.m - 1, p.d); };
    const fromUtc = t => { const d = new Date(t); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
    const addDays = (s, n) => fromUtc(toUtc(s) + n * 86400000);
    const diff = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
    const dow = s => new Date(toUtc(s)).getUTCDay();
    function todayIso(now) { const d = now || new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
    function shortDate(s, today) {
        const p = parseDate(s);
        const yr = today && parseDate(today) && parseDate(today).y !== p.y ? ' ' + p.y : '';
        return DAYS[dow(s)] + ' ' + p.d + ' ' + MONTHS[p.m - 1] + yr;
    }
    const plural = (n, word, many) => n + ' ' + (n === 1 ? word : (many || word + 's'));
    // half days as words: 2 -> "1", 5 -> "2.5"
    const num = h => (h % 2 ? (h / 2).toFixed(1) : String(h / 2));
    const daysWord = h => num(h) + ' office ' + (h === 2 ? 'day' : 'days');

    // ---- ranges
    function weekRange(s, start) {
        const back = (dow(s) - start + 7) % 7;
        const a = addDays(s, -back);
        return [a, addDays(a, 6)];
    }
    function monthRange(s) { const p = parseDate(s); return [iso(p.y, p.m, 1), iso(p.y, p.m, daysIn(p.y, p.m))]; }
    function quarterRange(s) {
        const p = parseDate(s), q = Math.floor((p.m - 1) / 3) * 3 + 1;
        return [iso(p.y, q, 1), iso(p.y, q + 2, daysIn(p.y, q + 2))];
    }
    function rangeName(a, b, kind, today) {
        const pa = parseDate(a), pb = parseDate(b);
        if (kind === 'month') return MONTHS_LONG[pa.m - 1] + ' ' + pa.y;
        if (kind === 'quarter') return 'Q' + (Math.floor((pa.m - 1) / 3) + 1) + ' (' + MONTHS[pa.m - 1] + ' to ' + MONTHS[pb.m - 1] + ' ' + pb.y + ')';
        return shortDate(a, today) + ' to ' + shortDate(b, today);
    }

    // ---- settings
    const DEFAULT_RULE = { type: 'week', n: 3, pct: 60, period: 'quarter', offRule: 'lower' };
    function emptyState() { return { v: 1, rule: Object.assign({}, DEFAULT_RULE), workdays: [1, 2, 3, 4, 5], weekStart: 1, start: '', days: {} }; }
    function ruleText(st) {
        const r = st.rule, wd = workdaysText(st.workdays);
        if (r.type === 'pct') return r.pct + '% of working days in the office, counted each ' + (r.period === 'month' ? 'month' : 'quarter') + ' (' + wd + ')';
        return plural(r.n, 'office day') + ' a ' + (r.type === 'month' ? 'month' : 'week') + ' (' + wd + ')';
    }
    function workdaysText(w) {
        const s = w.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
        if (!s.length) return 'no working days set';
        // a run like Mon to Fri or Sun to Thu (it may wrap past the week end), else a list
        if (w.length >= 3 && w.length < 7) for (const first of w) if (!w.includes((first + 6) % 7)) {
            let ok = true; for (let i = 0; i < w.length; i++) if (!w.includes((first + i) % 7)) ok = false;
            if (ok) return DAYS[first] + ' to ' + DAYS[(first + w.length - 1) % 7];
        }
        if (w.length === 7) return 'every day';
        return s.map(d => DAYS[d]).join(', ');
    }

    // ---- counting one range
    // Counts every day from a to b. Days before the "count from" date are left out. Today counts as done once marked.
    function tally(st, a, b, today) {
        const t = { wd: 0, off: 0, before: 0, extra: 0, doneH: 0, planH: 0, avail: [], unmarked: [], planned: [], count: {} };
        Object.keys(MARKS).forEach(k => { t.count[k] = 0; });
        for (let d = a; d <= b; d = addDays(d, 1)) {
            const work = st.workdays.includes(dow(d)), m = st.days[d], mk = m ? MARKS[m] : null;
            if (st.start && d < st.start) { if (work) t.before++; continue; }
            if (mk) t.count[m]++;
            if (work) {
                t.wd++;
                if (mk && mk.off) { t.off++; continue; }
            } else if (!mk || !mk.office) continue;
            else t.extra++;                       // an office day on a day you do not normally work
            if (mk && mk.office) { if (d <= today) t.doneH += mk.office; else { t.planH += mk.office; t.planned.push(d); } }
            if (work && !mk) { if (d >= today) t.avail.push(d); else t.unmarked.push(d); }
        }
        t.countable = t.wd - t.off + t.extra;       // working days that count, for a percentage rule
        return t;
    }
    // what the rule needs in this range, in half days
    function required(st, t, kind) {
        const r = st.rule;
        if (r.type === 'pct') return 2 * Math.ceil(r.pct * t.countable / 100);
        const possible = Math.max(0, t.wd - t.off);
        const n = r.offRule === 'keep' ? r.n : r.n - t.off - t.before;
        return 2 * Math.max(0, Math.min(n, possible));
    }
    function status(st, a, b, today, kind) {
        const t = tally(st, a, b, today), req = required(st, t, kind);
        const need = Math.max(0, req - t.doneH), still = Math.max(0, need - t.planH);
        const res = Object.assign(t, { a, b, kind, req, need, still, past: b < today, future: a > today });
        res.state = req === 0 ? 'none' : t.doneH >= req ? 'met' : still <= 2 * t.avail.length && !res.past ? (t.planH >= need ? 'planned' : 'ontrack') : 'short';
        return res;
    }
    function periodKind(st) { return st.rule.type === 'week' ? 'week' : st.rule.type === 'month' ? 'month' : st.rule.period; }
    function rangeOf(kind, d, st) { return kind === 'week' ? weekRange(d, st.weekStart) : kind === 'month' ? monthRange(d) : quarterRange(d); }
    function current(st, today) { const k = periodKind(st), r = rangeOf(k, today, st); return status(st, r[0], r[1], today, k); }
    // the first day that counts: the "count from" date, else the first day ever marked
    function firstDay(st) { if (st.start) return st.start; const k = Object.keys(st.days).sort(); return k[0] || ''; }
    function previous(st, today) {
        const k = periodKind(st), r = rangeOf(k, today, st), p = rangeOf(k, addDays(r[0], -1), st), f = firstDay(st);
        if (!f || p[1] < f) return null;
        return status(st, p[0], p[1], today, k);
    }

    // the main sentence and the lines under it
    function headline(s) {
        const per = s.kind === 'week' ? 'this week' : s.kind === 'month' ? 'this month' : 'this quarter';
        if (s.state === 'none') return 'No office days needed ' + per;
        if (s.state === 'met') return 'Target met for ' + per;
        if (s.state === 'planned') return 'On track: your planned days meet the target';
        if (s.state === 'ontrack') return num(s.still) + ' more office ' + (s.still === 2 ? 'day' : 'days') + ' needed ' + per;
        if (s.past) return 'Target missed by ' + daysWord(s.need);
        return 'Not reachable ' + per + ': ' + daysWord(s.still) + ' still needed, ' + plural(s.avail.length, 'working day') + ' left';
    }
    function lines(s, st, today) {
        const out = [];
        if (s.req === 0 && st.rule.type !== 'pct') {
            out.push('Every working day here is off' + (s.before ? ' or before your start date' : '') + ', so no office days are needed.');
            if (s.doneH) out.push(num(s.doneH) + ' office ' + (s.doneH === 2 ? 'day' : 'days') + ' anyway.');
            return out;
        }
        out.push(num(s.doneH) + ' of ' + num(s.req) + ' office ' + (s.req === 2 ? 'day' : 'days') + ' done' + (s.planH ? ', ' + num(s.planH) + ' planned' : '') + '.');
        if (st.rule.type === 'pct') {
            const pastC = tally(st, s.a, today < s.b ? today : s.b, today);
            const pc = pastC.countable ? Math.round(100 * pastC.doneH / 2 / pastC.countable) : 0;
            out.push(st.rule.pct + '% of ' + plural(s.countable, 'working day') + ' counted = ' + num(s.req) + ' (rounded up). So far ' + pc + '% (' + num(pastC.doneH) + ' of ' + pastC.countable + ' days up to today).');
        }
        const offs = s.off + (st.rule.type !== 'pct' && st.rule.offRule !== 'keep' ? s.before : 0);
        if (st.rule.type !== 'pct' && offs && st.rule.offRule !== 'keep') out.push('Target lowered from ' + st.rule.n + ' to ' + num(s.req) + ' for ' + plural(offs, 'day') + ' off' + (s.before ? ' or before your start date' : '') + '.');
        if (st.rule.type === 'pct' && s.off) out.push(plural(s.off, 'day') + ' of leave, sick or holiday left out of the count.');
        if (s.planned.length && s.state !== 'met') out.push('Planned: ' + s.planned.map(d => shortDate(d, today)).join(', ') + '.');
        if (s.state === 'ontrack' || s.state === 'short') {
            if (s.avail.length) out.push(plural(s.avail.length, 'working day') + ' left: ' + listDates(s.avail, today) + '.');
            else out.push('No working days left in this ' + (s.kind === 'week' ? 'week' : s.kind) + '.');
        }
        if (s.unmarked.length) out.push(plural(s.unmarked.length, 'past working day') + ' not marked yet: ' + listDates(s.unmarked, today) + '. Not marked counts as not in the office.');
        if (s.unmarked.length > 3 && !st.start) out.push('Started using this app part-way through? Set "Count from" under Your office rule, or mark the earlier days.');
        return out;
    }
    function listDates(ds, today) { return ds.length > 6 ? ds.slice(0, 5).map(d => shortDate(d, today)).join(', ') + ' and ' + (ds.length - 5) + ' more' : ds.map(d => shortDate(d, today)).join(', '); }

    // weeks met in the quarter, for a weekly rule (a week belongs to the quarter it starts in)
    function weeksInQuarter(st, today) {
        const q = quarterRange(today), r = { met: 0, missed: 0, excused: 0, current: null, missedWeeks: [], q };
        let a = weekRange(q[0], st.weekStart)[0];
        if (a < q[0]) a = addDays(a, 7);
        const f = firstDay(st);
        for (; a <= q[1] && a <= today; a = addDays(a, 7)) {
            const b = addDays(a, 6);
            if (b < today && (!f || b < f)) continue;
            const s = status(st, a, b, today, 'week');
            if (b >= today) { r.current = s; continue; }
            if (s.state === 'none') r.excused++; else if (s.state === 'met') r.met++; else { r.missed++; r.missedWeeks.push(a); }
        }
        return r;
    }
    function quarterLine(st, today) {
        const w = weeksInQuarter(st, today), done = w.met + w.missed + w.excused;
        const name = rangeName(w.q[0], w.q[1], 'quarter');
        if (!done) return name + ': this is the first week counted.';
        let s = name + ': ' + w.met + ' of ' + (w.met + w.missed) + ' finished ' + (w.met + w.missed === 1 ? 'week' : 'weeks') + ' met';
        if (w.excused) s += ', ' + plural(w.excused, 'week') + ' fully off';
        if (w.missed) s += '. Missed: week of ' + w.missedWeeks.map(d => shortDate(d, today)).join(', ');
        return s + '.';
    }
    function prevLine(st, today) {
        const p = previous(st, today); if (!p) return '';
        const name = p.kind === 'week' ? 'Last week' : p.kind === 'month' ? 'Last month (' + MONTHS_LONG[parseDate(p.a).m - 1] + ')' : 'Last quarter';
        if (p.state === 'none') return name + ': no office days needed.';
        return name + ': ' + num(p.doneH) + ' of ' + num(p.req) + ' office days, ' + (p.state === 'met' ? 'target met.' : 'missed by ' + num(p.req - p.doneH) + '.');
    }

    // ---- marking
    function mark(st, d, m) {
        const days = Object.assign({}, st.days);
        if (m && MARKS[m]) days[d] = m; else delete days[d];
        return Object.assign({}, st, { days });
    }
    // marks a run of days; only working days unless the mark is Office or Work trip and the day is a working day too
    function markRange(st, a, b, m) {
        const days = Object.assign({}, st.days); let n = 0;
        if (!isDate(a) || !isDate(b) || b < a || diff(a, b) > 365) return { st, n: -1 };
        for (let d = a; d <= b; d = addDays(d, 1)) {
            if (!st.workdays.includes(dow(d))) continue;
            if (m && MARKS[m]) days[d] = m; else delete days[d];
            n++;
        }
        return { st: Object.assign({}, st, { days }), n };
    }

    // ---- month view
    function monthGrid(st, y, m, today) {
        const first = iso(y, m, 1), lead = (dow(first) - st.weekStart + 7) % 7, cells = [];
        for (let i = 0; i < lead; i++) cells.push(null);
        for (let d = 1; d <= daysIn(y, m); d++) {
            const s = iso(y, m, d);
            cells.push({ d: s, n: d, mark: st.days[s] || '', work: st.workdays.includes(dow(s)), today: s === today, future: s > today, before: !!(st.start && s < st.start) });
        }
        while (cells.length % 7) cells.push(null);
        return { cells, heads: [0, 1, 2, 3, 4, 5, 6].map(i => DAYS[(st.weekStart + i) % 7]) };
    }
    function monthCounts(st, y, m, today) {
        const t = tally(st, iso(y, m, 1), iso(y, m, daysIn(y, m)), today);
        const parts = [['O', 'office'], ['T', 'work trip', 'work trips'], ['HO', 'half day in office', 'half days in office'], ['H', 'home'], ['L', 'leave'], ['S', 'sick'], ['P', 'public holiday', 'public holidays']]
            .filter(([k]) => t.count[k]).map(([k, one, many]) => t.count[k] + ' ' + (t.count[k] === 1 || !many ? one : many));
        return parts.length ? MONTHS_LONG[m - 1] + ': ' + parts.join(', ') + '.' : '';
    }

    // ---- sharing
    function summaryText(st, today) {
        const s = current(st, today), out = ['Office days, ' + shortDate(today) + ' ' + parseDate(today).y, 'Rule: ' + ruleText(st), ''];
        out.push(rangeName(s.a, s.b, s.kind, today) + ': ' + headline(s) + '.');
        lines(s, st, today).forEach(l => out.push('- ' + l));
        if (st.rule.type === 'week') out.push(quarterLine(st, today));
        const p = prevLine(st, today); if (p) out.push(p);
        const pm = parseDate(today), mc = monthCounts(st, pm.y, pm.m, today); if (mc) out.push(mc);
        return out.join('\n');
    }
    function csv(st, today) {
        const keys = Object.keys(st.days).sort();
        const rows = ['Date,Day,Where,Office days'];
        keys.forEach(d => { const m = MARKS[st.days[d]]; rows.push(d + ',' + DAYS_LONG[dow(d)] + ',' + m.label + ',' + num(m.office)); });
        return rows.join('\r\n') + '\r\n';
    }

    // ---- reading the rule form; each value checked
    function readRule(f) {
        const errs = {}, type = ['week', 'month', 'pct'].includes(f.type) ? f.type : 'week';
        const rule = { type, n: 3, pct: 60, period: f.period === 'month' ? 'month' : 'quarter', offRule: f.offRule === 'keep' ? 'keep' : 'lower' };
        const clean = v => String(v == null ? '' : v).trim().replace(/%$/, '').trim();
        if (type === 'pct') {
            const v = clean(f.pct);
            if (!v) errs.pct = 'Type the percentage, for example 60.';
            else if (!/^\d+$/.test(v)) errs.pct = 'Type a whole number from 1 to 100.';
            else if (+v < 1 || +v > 100) errs.pct = 'Use a number from 1 to 100.';
            else rule.pct = +v;
            rule.n = Number.isInteger(+f.n) && +f.n >= 1 ? Math.min(+f.n, 31) : 3;
        } else {
            const v = clean(f.n), max = type === 'week' ? 7 : 31;
            if (!v) errs.n = 'Type how many office days, for example 3.';
            else if (!/^\d+$/.test(v)) errs.n = 'Type a whole number of days.';
            else if (+v < 1 || +v > max) errs.n = type === 'week' ? 'A week has 1 to 7 days.' : 'Use 1 to 31 days a month.';
            else rule.n = +v;
            rule.pct = Number.isInteger(+f.pct) && +f.pct >= 1 && +f.pct <= 100 ? +f.pct : 60;
        }
        return { rule, errs, ok: !Object.keys(errs).length };
    }

    function validate(s) {
        if (!s || typeof s !== 'object') return null;
        const st = emptyState();
        const r = s.rule && typeof s.rule === 'object' ? s.rule : {};
        st.rule.type = ['week', 'month', 'pct'].includes(r.type) ? r.type : 'week';
        st.rule.n = Number.isInteger(r.n) && r.n >= 1 && r.n <= (st.rule.type === 'week' ? 7 : 31) ? r.n : 3;
        st.rule.pct = Number.isInteger(r.pct) && r.pct >= 1 && r.pct <= 100 ? r.pct : 60;
        st.rule.period = r.period === 'month' ? 'month' : 'quarter';
        st.rule.offRule = r.offRule === 'keep' ? 'keep' : 'lower';
        if (Array.isArray(s.workdays)) {
            const w = [...new Set(s.workdays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))];
            if (w.length) st.workdays = w.sort();
        }
        st.weekStart = [0, 1, 6].includes(s.weekStart) ? s.weekStart : 1;
        st.start = isDate(s.start) ? s.start : '';
        if (s.days && typeof s.days === 'object' && !Array.isArray(s.days)) {
            Object.keys(s.days).sort().slice(-MAX_DAYS).forEach(d => { if (isDate(d) && MARKS[s.days[d]]) st.days[d] = s.days[d]; });
        } else if (s.days != null) return null;
        return st;
    }

    const api = { DAYS, DAYS_LONG, MONTHS, MONTHS_LONG, MARKS, DEFAULT_RULE, parseDate, isDate, iso, addDays, diff, dow, todayIso, shortDate, plural, num, daysWord,
        weekRange, monthRange, quarterRange, rangeName, emptyState, ruleText, workdaysText, tally, required, status, periodKind, current, previous,
        firstDay, headline, lines, weeksInQuarter, quarterLine, prevLine, mark, markRange, monthGrid, monthCounts, summaryText, csv, readRule, validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OfficeCore = api;
})(this);
