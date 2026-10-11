// Date maths for Age and Date Difference Calculator, with no page code. Works in the browser (window.DateCore) and in Node.
// Every date is a whole day number (days since 1 January 1970), worked out on the calendar only, so time zones,
// summer time and the time of day can never move a result by a day.
(function (root) {
    const MIN_YEAR = 1000, MAX_YEAR = 9999;
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // the largest amount each unit accepts (all of them reach past 9999 from any start, so the year limit is what stops them)
    const LIMITS = { days: 3000000, weeks: 500000, months: 100000, years: 9000, workdays: 2500000 };
    const KINDS = ['birthday', 'anniversary', 'event'];
    const MAX_NAME = 60, MAX_SAVED = 200, MAX_HOLIDAYS = 200;

    const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const dim = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

    // day number <-> {y, m, d}; setUTCFullYear avoids the old rule that turns years 0 to 99 into 1900s
    function toDay(y, m, d) { const t = new Date(0); t.setUTCFullYear(y, m - 1, d); return Math.round(t.getTime() / 86400000); }
    function fromDay(n) { const t = new Date(n * 86400000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
    const weekday = n => ((n % 7) + 7 + 4) % 7;   // 1 Jan 1970 was a Thursday (4)
    const MIN_DAY = toDay(MIN_YEAR, 1, 1), MAX_DAY = toDay(MAX_YEAR, 12, 31);
    const inRange = n => Number.isInteger(n) && n >= MIN_DAY && n <= MAX_DAY;

    // "2026-10-11" -> day number, or null when it is not a real date in range
    function parseISO(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? '' : s).trim());
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1 || d > dim(y, mo)) return null;
        return toDay(y, mo, d);
    }
    const pad = (n, w) => String(n).padStart(w, '0');
    function toISO(n) { const a = fromDay(n); return pad(a.y, 4) + '-' + pad(a.m, 2) + '-' + pad(a.d, 2); }
    // today on this device's own calendar
    function today(now) { const t = now || new Date(); return toDay(t.getFullYear(), t.getMonth() + 1, t.getDate()); }

    // Add whole months. When the day does not exist in the new month (31 April, 29 February in other years):
    // rule 'last' uses the last day of that month, rule 'next' uses the 1st of the month after.
    function addMonthsYMD(a, k, rule) {
        const t = a.y * 12 + (a.m - 1) + k, y = Math.floor(t / 12), m = t - y * 12 + 1, last = dim(y, m);
        if (a.d <= last) return { y, m, d: a.d, moved: false };
        if (rule === 'next') return m === 12 ? { y: y + 1, m: 1, d: 1, moved: true } : { y, m: m + 1, d: 1, moved: true };
        return { y, m, d: last, moved: true };
    }
    function addMonths(n, k, rule) { const r = addMonthsYMD(fromDay(n), k, rule); return toDay(r.y, r.m, r.d); }

    // whole months from a to b (a <= b), then the days left over
    function diffYMD(a, b, rule) {
        const A = fromDay(a), B = fromDay(b);
        let k = (B.y - A.y) * 12 + (B.m - A.m);
        while (k > 0 && addMonths(a, k, rule) > b) k--;
        while (addMonths(a, k + 1, rule) <= b) k++;
        return { years: Math.floor(k / 12), months: k % 12, days: b - addMonths(a, k, rule), totalMonths: k };
    }

    // ---------- words
    const plural = (n, one, many) => fmtNum(n) + ' ' + (n === 1 ? one : (many || one + 's'));
    function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function list(parts) { return parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]; }
    // "36 years, 1 month and 26 days"; parts that are 0 are left out, and all zero is "0 days"
    function ymdText(r) {
        const p = [];
        if (r.years) p.push(plural(r.years, 'year'));
        if (r.months) p.push(plural(r.months, 'month'));
        if (r.days || !p.length) p.push(plural(r.days, 'day'));
        return list(p);
    }
    function weeksText(days) { const w = Math.floor(days / 7), d = days % 7; return w ? plural(w, 'week') + (d ? ' and ' + plural(d, 'day') : '') : plural(d, 'day'); }
    function fmtDate(n, long) {
        const a = fromDay(n), w = weekday(n);
        return long ? DAY_NAMES[w] + ' ' + a.d + ' ' + MONTHS[a.m - 1] + ' ' + a.y : DAY_SHORT[w] + ' ' + a.d + ' ' + MONTH_SHORT[a.m - 1] + ' ' + a.y;
    }
    function ordinal(n) { const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'; return fmtNum(n) + s; }
    function inDaysText(d) { return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d === -1 ? 'yesterday' : d > 0 ? 'in ' + plural(d, 'day') : plural(-d, 'day') + ' ago'; }
    const isFeb29 = n => { const a = fromDay(n); return a.m === 2 && a.d === 29; };

    // ---------- 1. Age
    // birth and on are day numbers; rule only matters for people born on 29 February
    function age(birth, on, rule) {
        if (!inRange(birth) || !inRange(on)) return { err: 'date' };
        if (birth > on) return { err: 'future' };
        rule = isFeb29(birth) && rule === 'next' ? 'next' : 'last';
        const r = diffYMD(birth, on, rule), totalDays = on - birth;
        const birthdayToday = totalDays > 0 && r.months === 0 && r.days === 0;
        const turning = r.years + 1, next = addMonths(birth, 12 * turning, rule);
        return {
            years: r.years, months: r.months, days: r.days, totalMonths: r.totalMonths, totalDays,
            weeks: Math.floor(totalDays / 7), weekDays: totalDays % 7,
            bornDay: DAY_NAMES[weekday(birth)], bornToday: totalDays === 0, birthdayToday, feb29: isFeb29(birth), rule,
            next: { date: next, turning, inDays: next - on, wait: diffYMD(on, next, 'last') }
        };
    }

    // ---------- working days
    // weekend: array of weekday numbers (0 Sunday to 6 Saturday) that are days off every week
    function cleanWeekend(w) { const s = [...new Set((Array.isArray(w) ? w : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort(); return s.length === 7 ? [0, 6] : s; }
    // working days in [a, b] (both ends counted), leaving out the weekend and the extra days off
    function countWorkdays(a, b, weekend, holidays) {
        if (b < a) return 0;
        const off = new Set(weekend), per = 7 - off.size, len = b - a + 1, full = Math.floor(len / 7);
        let n = full * per;
        for (let d = a + full * 7; d <= b; d++) if (!off.has(weekday(d))) n++;
        const seen = new Set();
        (holidays || []).forEach(h => { if (h >= a && h <= b && !off.has(weekday(h)) && !seen.has(h)) { seen.add(h); n--; } });
        return n;
    }
    const holidaysIn = (a, b, weekend, holidays) => [...new Set((holidays || []).filter(h => h >= a && h <= b && weekend.indexOf(weekday(h)) < 0))].length;

    // ---------- 2. Days between two dates
    function between(a, b, opt) {
        opt = opt || {};
        if (!inRange(a) || !inRange(b)) return { err: 'date' };
        const swapped = b < a; if (swapped) { const t = a; a = b; b = t; }
        const end = opt.includeEnd ? b + 1 : b;           // counting the end date adds that day
        const days = end - a, last = end - 1;               // last day that is counted
        const weekend = cleanWeekend(opt.weekend == null ? [0, 6] : opt.weekend);
        const hol = opt.holidays || [];
        const work = days > 0 ? countWorkdays(a, last, weekend, hol) : 0;
        return {
            swapped, from: a, to: b, days, firstCounted: days > 0 ? a : null, lastCounted: days > 0 ? last : null,
            ymd: diffYMD(a, end, 'last'), weeks: Math.floor(days / 7), weekDays: days % 7,
            workdays: work, holidaysSkipped: days > 0 ? holidaysIn(a, last, weekend, hol) : 0, weekend
        };
    }

    // ---------- 3. Add or subtract
    // amount: text typed by the person. Returns { n } or { err }
    function parseAmount(s, unit) {
        const t = String(s == null ? '' : s).replace(/[\s,]/g, '');
        if (t === '') return { err: 'blank' };
        if (/^[-−]/.test(t)) return { err: 'negative' };
        if (!/^\+?\d+(\.\d+)?$/.test(t)) return { err: 'number' };
        const n = Number(t.replace('+', ''));
        if (!Number.isInteger(n)) return { err: 'whole' };
        if (n > LIMITS[unit]) return { err: 'big', max: LIMITS[unit] };
        return { n };
    }
    function addAmount(start, n, unit, sign, opt) {
        opt = opt || {};
        if (!inRange(start)) return { err: 'date' };
        if (!Number.isInteger(n) || n < 0 || !(unit in LIMITS)) return { err: 'number' };
        sign = sign < 0 ? -1 : 1;
        let result, moved = false, wanted = null, skipped = 0;
        if (unit === 'days') result = start + sign * n;
        else if (unit === 'weeks') result = start + sign * 7 * n;
        else if (unit === 'months' || unit === 'years') {
            const k = unit === 'years' ? 12 * n : n, A = fromDay(start), r = addMonthsYMD(A, sign * k, 'last');
            if (r.y < MIN_YEAR || r.y > MAX_YEAR) return { err: 'range' };
            result = toDay(r.y, r.m, r.d); moved = r.moved; if (moved) wanted = { d: A.d, m: r.m, y: r.y };
        } else {
            const weekend = cleanWeekend(opt.weekend == null ? [0, 6] : opt.weekend), off = new Set(weekend), hol = new Set(opt.holidays || []);
            let d = start, left = n;
            // whole weeks first so huge numbers stay quick, then day by day (holidays are checked one by one)
            const per = 7 - off.size;
            if (!hol.size && left > 14) { const w = Math.floor(left / per) - 1; if (w > 0) { d += sign * 7 * w; left -= w * per; } }
            while (left > 0) {
                d += sign;
                if (d < MIN_DAY || d > MAX_DAY) return { err: 'range' };
                if (off.has(weekday(d))) continue;
                if (hol.has(d)) { skipped++; continue; }
                left--;
            }
            result = d;
        }
        if (!inRange(result)) return { err: 'range' };
        return { date: result, moved, wanted, holidaysSkipped: skipped };
    }

    // ---------- My dates
    // next time a saved date comes round, on or after `on`
    function nextOf(item, on, rule) {
        if (typeof item.date === 'string') item = { name: item.name, kind: item.kind, date: parseISO(item.date) };
        if (item.kind === 'event') return { date: item.date, inDays: item.date - on, past: item.date < on };
        const r = isFeb29(item.date) && rule === 'next' ? 'next' : 'last';
        if (item.date > on) return { date: item.date, inDays: item.date - on, count: 0, notYet: true };
        let k = diffYMD(item.date, on, r).years;
        let d = addMonths(item.date, 12 * k, r);
        if (d < on || k === 0) { k++; d = addMonths(item.date, 12 * k, r); }
        if (d > MAX_DAY) return { date: null, inDays: Infinity, count: k };
        return { date: d, inDays: d - on, count: k };
    }
    // the words for one saved date: { head, sub }
    function describeSaved(item, on, rule) {
        if (typeof item.date === 'string') item = { name: item.name, kind: item.kind, date: parseISO(item.date) };
        const n = nextOf(item, on, rule);
        if (item.kind === 'event') {
            const head = n.inDays === 0 ? 'Today' : n.inDays === 1 ? 'Tomorrow' : n.inDays > 0 ? plural(n.inDays, 'day') + ' to go' : inDaysText(n.inDays);
            // from two weeks away, also say it in months: "(1 month and 11 days)"
            const ymd = Math.abs(n.inDays) >= 14 ? ymdText(n.inDays > 0 ? diffYMD(on, item.date, 'last') : diffYMD(item.date, on, 'last')) : '';
            const extra = ymd && ymd !== plural(Math.abs(n.inDays), 'day') ? ' (' + ymd + ')' : '';
            return { head: head.charAt(0).toUpperCase() + head.slice(1), sub: fmtDate(item.date) + extra, next: n };
        }
        if (n.notYet) return { head: n.inDays === 1 ? 'Tomorrow' : plural(n.inDays, 'day') + ' to go', sub: (item.kind === 'birthday' ? 'Born on ' : 'Starts on ') + fmtDate(item.date), next: n };
        if (!n.date) return { head: '—', sub: fmtDate(item.date), next: n };
        const what = item.kind === 'birthday' ? 'Turns ' + fmtNum(n.count) : ordinal(n.count) + ' anniversary';
        const head = n.inDays === 0 ? (item.kind === 'birthday' ? 'Today! Turns ' + fmtNum(n.count) : 'Today! ' + ordinal(n.count) + ' anniversary') : what + ' ' + inDaysText(n.inDays);
        return { head, sub: fmtDate(n.date) + (n.inDays === 0 ? '' : ' · ' + (item.kind === 'birthday' ? 'born ' : 'since ') + fmtDate(item.date)), next: n };
    }
    // soonest first; past one-off events go last, most recent first
    function sortSaved(items, on, rule) {
        return items.map(i => ({ i, n: nextOf(i, on, rule) })).sort((x, y) => {
            const px = x.n.past ? 1 : 0, py = y.n.past ? 1 : 0;
            if (px !== py) return px - py;
            return px ? y.n.date - x.n.date : (x.n.inDays - y.n.inDays) || x.i.name.localeCompare(y.i.name);
        }).map(x => x.i);
    }

    // ---------- saved state: everything is checked, anything odd is dropped
    function cleanText(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
    function isoOr(s, fallback) { return parseISO(s) != null ? String(s) : fallback; }
    function defaultState() {
        return { mode: 'age', birth: '', ageOn: '', rule: 'last', from: '', to: '', includeEnd: false,
            start: '', amount: '', unit: 'days', sign: 1, weekend: [0, 6], holidays: [], saved: [] };
    }
    function clean(s) {
        const d = defaultState();
        if (!s || typeof s !== 'object' || Array.isArray(s)) return d;
        d.mode = ['age', 'between', 'add'].indexOf(s.mode) >= 0 ? s.mode : 'age';
        ['birth', 'ageOn', 'from', 'to', 'start'].forEach(k => { d[k] = isoOr(s[k], ''); });
        d.rule = s.rule === 'next' ? 'next' : 'last';
        d.includeEnd = s.includeEnd === true;
        d.amount = cleanText(s.amount, 12);
        d.unit = s.unit in LIMITS ? s.unit : 'days';
        d.sign = s.sign === -1 ? -1 : 1;
        if (Array.isArray(s.weekend)) d.weekend = cleanWeekend(s.weekend);
        if (Array.isArray(s.holidays)) d.holidays = [...new Set(s.holidays.filter(h => parseISO(h) != null).map(String))].sort().slice(0, MAX_HOLIDAYS);
        if (Array.isArray(s.saved)) {
            const ids = new Set();
            s.saved.forEach(x => {
                if (!x || typeof x !== 'object' || d.saved.length >= MAX_SAVED) return;
                const name = cleanText(x.name, MAX_NAME), date = parseISO(x.date), kind = KINDS.indexOf(x.kind) >= 0 ? x.kind : 'event';
                let id = typeof x.id === 'string' && /^[\w-]{1,40}$/.test(x.id) ? x.id : 'd' + d.saved.length;
                if (ids.has(id)) id = id + '-' + d.saved.length;
                if (!name || date == null) return;
                ids.add(id); d.saved.push({ id, name, date: toISO(date), kind });
            });
        }
        return d;
    }

    const api = { MIN_YEAR, MAX_YEAR, MIN_DAY, MAX_DAY, LIMITS, KINDS, MAX_NAME, MAX_SAVED, MAX_HOLIDAYS, DAY_NAMES, DAY_SHORT,
        isLeap, dim, toDay, fromDay, weekday, parseISO, toISO, today, addMonths, diffYMD, inRange,
        plural, fmtNum, ymdText, weeksText, fmtDate, ordinal, inDaysText, isFeb29,
        age, between, countWorkdays, cleanWeekend, parseAmount, addAmount, nextOf, describeSaved, sortSaved, cleanText, defaultState, clean };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DateCore = api;
})(this);
