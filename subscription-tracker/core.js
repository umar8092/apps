// Subscription maths, no page code. Money is whole cents, dates are 'YYYY-MM-DD' strings (no time zones involved).
(function (root) {
    const UNITS = { day: 365, week: 52, month: 12, year: 1 };          // payments per year when every = 1
    const MAX_EVERY = { day: 365, week: 52, month: 24, year: 10 };
    const STATUSES = ['active', 'trial', 'paused', 'cancelled'];
    const MAX_CENTS = 100000000;                                         // 1,000,000.00

    // ---- dates
    const pad = n => String(n).padStart(2, '0');
    function parseDate(v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
        return { y, m: mo, d };
    }
    const isDate = v => !!parseDate(v);
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dayNum = iso => { const p = parseDate(iso); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 864e5); };
    const fromNum = n => { const d = new Date(n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
    const addDays = (iso, n) => fromNum(dayNum(iso) + n);
    // Adds months and keeps the day of the month, or the last day when the month is shorter (31 Jan -> 28 Feb -> 31 Mar).
    function addMonths(iso, k) {
        const p = parseDate(iso), t = p.y * 12 + (p.m - 1) + k, y = Math.floor(t / 12), m = t - y * 12 + 1;
        return y + '-' + pad(m) + '-' + pad(Math.min(p.d, daysIn(y, m)));
    }
    const diff = (a, b) => dayNum(b) - dayNum(a);                         // days from a to b
    const todayIso = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

    // The k-th payment counted from the date the person typed (k = 0 is that date).
    function nth(sub, k) {
        const n = sub.every * k;
        if (sub.unit === 'day') return addDays(sub.date, n);
        if (sub.unit === 'week') return addDays(sub.date, 7 * n);
        return addMonths(sub.date, sub.unit === 'year' ? 12 * n : n);
    }
    // First payment on or after `from`. Dates in the past roll forward by themselves, so the list stays right day after day.
    function nextOn(sub, from) {
        if (!isDate(sub.date)) return null;
        if (sub.date >= from) return sub.date;
        const gap = diff(sub.date, from), stepDays = { day: 1, week: 7, month: 28, year: 365 }[sub.unit] * sub.every;
        let k = Math.max(0, Math.floor(gap / stepDays) - 2);
        while (nth(sub, k) < from) k++;
        return nth(sub, k);
    }
    function between(sub, from, to) {                                   // payments with from <= date <= to
        const out = [], first = nextOn(sub, from);
        if (!first) return out;
        let k = 0; while (nth(sub, k) < first) k++;
        for (let d = nth(sub, k); d <= to && out.length < 400; d = nth(sub, ++k)) out.push(d);
        return out;
    }

    // ---- money
    // Reads what people type or paste: "9.99", "9,99", "$1,299.00", "1.299,00 €", " 12 ". Returns { cents } or { err }.
    function parsePrice(v) {
        let s = String(v == null ? '' : v).trim();
        if (!s) return { err: 'blank' };
        if (/-/.test(s)) return { err: 'negative' };
        s = s.replace(/[^\d.,]/g, '');
        if (!/\d/.test(s)) return { err: 'nan' };
        const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
        if (lastDot >= 0 && lastComma >= 0) {
            const dec = lastDot > lastComma ? '.' : ',', other = dec === '.' ? ',' : '.';
            s = s.split(other).join('');
            if (s.split(dec).length > 2) return { err: 'nan' };
            s = s.replace(dec, '.');
        } else if (lastComma >= 0) {
            s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : (s.split(',').length === 2 ? s.replace(',', '.') : null);
        } else if (lastDot >= 0 && s.split('.').length > 2) {
            s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : null;
        }
        if (s == null || !/^\d*\.?\d*$/.test(s) || s === '.') return { err: 'nan' };
        const [w, f = ''] = s.split('.');
        if (w.replace(/^0+/, '').length > 7) return { err: 'big' };
        const f3 = (f + '000').slice(0, 3);
        const cents = parseInt(w || '0', 10) * 100 + parseInt(f3.slice(0, 2), 10) + (+f3[2] >= 5 ? 1 : 0);
        return cents > MAX_CENTS ? { err: 'big' } : { cents };
    }
    function fmt(cents, sym) {
        const neg = cents < 0, c = Math.abs(Math.round(cents));
        const s = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + pad(c % 100);
        const p = !sym ? '' : /[A-Za-z]$/.test(sym) ? sym + ' ' : sym;
        return (neg ? '-' : '') + p + s;
    }
    // A year counts 365 days, 52 weeks or 12 months. Rounded to the cent for each subscription.
    const yearly = sub => Math.round(sub.price * UNITS[sub.unit] / sub.every);
    const monthly = sub => Math.round(yearly(sub) / 12);

    function cycleText(every, unit) {
        if (every === 1) return { day: 'every day', week: 'every week', month: 'every month', year: 'every year' }[unit];
        return 'every ' + every + ' ' + unit + 's';
    }

    // ---- state
    // Trials whose end date has passed are now paid subscriptions.
    const status = (sub, today) => sub.status === 'trial' && isDate(sub.date) && sub.date < today ? 'active' : sub.status;
    const counted = (sub, today) => { const st = status(sub, today); return st === 'active' || st === 'trial'; };

    function summary(subs, today) {
        const live = subs.filter(s => counted(s, today));
        const year = live.reduce((t, s) => t + yearly(s), 0);
        const end7 = addDays(today, 6), end30 = addDays(today, 29);
        const upcoming = [];
        live.forEach(s => between(s, today, end30).forEach(d => upcoming.push({ id: s.id, name: s.name, date: d, cents: s.price,
            trialEnd: status(s, today) === 'trial' && d === s.date, days: diff(today, d) })));
        upcoming.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : b.cents - a.cents || a.name.localeCompare(b.name));
        const sumTo = end => upcoming.filter(u => u.date <= end).reduce((t, u) => t + u.cents, 0);
        const biggest = live.filter(s => s.price > 0).map(s => ({ id: s.id, name: s.name, month: monthly(s), year: yearly(s), pct: year ? Math.round(yearly(s) * 100 / year) : 0 }))
            .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name)).slice(0, 5);
        const names = {};
        subs.filter(s => s.status !== 'cancelled').forEach(s => { const k = s.name.trim().toLowerCase(); names[k] = (names[k] || []).concat(s.name.trim()); });
        return {
            count: live.length, year, month: Math.round(year / 12), upcoming, next7: sumTo(end7), next30: sumTo(end30), biggest,
            paused: subs.filter(s => s.status === 'paused').length,
            cancelled: subs.filter(s => s.status === 'cancelled').length,
            saved: subs.filter(s => s.status === 'cancelled').reduce((t, s) => t + yearly(s), 0),
            trialsSoon: subs.filter(s => status(s, today) === 'trial' && diff(today, s.date) <= 7).map(s => ({ id: s.id, name: s.name, date: s.date, days: diff(today, s.date), cents: s.price })),
            undated: live.filter(s => !isDate(s.date)).map(s => s.name),
            dups: Object.values(names).filter(v => v.length > 1).map(v => v[0])
        };
    }

    // ---- saved or imported data: keep only valid values
    function clean(x, i) {
        if (!x || typeof x !== 'object') return null;
        const name = String(x.name == null ? '' : x.name).replace(/\s+/g, ' ').trim().slice(0, 60);
        const price = Math.round(Number(x.price));
        const unit = Object.prototype.hasOwnProperty.call(UNITS, x.unit) ? x.unit : null;
        const every = Math.round(Number(x.every));
        if (!name || !unit || !(price >= 0 && price <= MAX_CENTS) || !(every >= 1 && every <= MAX_EVERY[unit])) return null;
        return {
            id: typeof x.id === 'string' && /^[\w-]{1,40}$/.test(x.id) ? x.id : 's' + Date.now().toString(36) + '-' + i,
            name, price, every, unit, date: isDate(x.date) ? x.date : '',
            status: STATUSES.includes(x.status) ? x.status : 'active',
            note: String(x.note == null ? '' : x.note).slice(0, 200)
        };
    }
    function cleanList(list) {
        if (list && !Array.isArray(list) && Array.isArray(list.subs)) list = list.subs;
        if (!Array.isArray(list)) return null;
        const out = [], seen = {};
        list.slice(0, 300).forEach((x, i) => { const c = clean(x, i); if (c) { if (seen[c.id]) c.id += '-' + i; seen[c.id] = 1; out.push(c); } });
        return out;
    }

    // ---- calendar file: one repeating event per subscription, with a reminder the day before
    function rrule(sub) {
        const p = parseDate(sub.date), base = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[sub.unit];
        let r = 'RRULE:FREQ=' + base + (sub.every > 1 ? ';INTERVAL=' + sub.every : '');
        if (sub.unit === 'month' && p.d >= 29) { const d = []; for (let i = 28; i <= p.d; i++) d.push(i); r += ';BYMONTHDAY=' + d.join(',') + ';BYSETPOS=-1'; }
        if (sub.unit === 'year' && p.m === 2 && p.d === 29) r += ';BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1';
        return r;
    }
    const esc = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    function fold(line) {
        const out = []; let s = line;
        while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
        out.push(s); return out.join('\r\n');
    }
    function ics(subs, today, sym, stamp) {
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Subscription Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
        const ds = d => d.replace(/-/g, '');
        const ev = (uid, date, summary, desc, rule, alarmDays) => {
            L.push('BEGIN:VEVENT', 'UID:' + uid + '@subscription-tracker', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ds(date),
                'DTEND;VALUE=DATE:' + ds(addDays(date, 1)), fold('SUMMARY:' + esc(summary)), fold('DESCRIPTION:' + esc(desc)), 'TRANSP:TRANSPARENT');
            if (rule) L.push(rule);
            L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(summary.slice(0, 60)), 'TRIGGER:-P' + alarmDays + 'D', 'END:VALARM', 'END:VEVENT');
        };
        let n = 0;
        subs.filter(s => counted(s, today) && isDate(s.date) && s.price > 0).forEach(s => {
            const price = fmt(s.price, sym), how = cycleText(s.every, s.unit);
            if (status(s, today) === 'trial') {
                ev(s.id + '-trial', s.date, s.name + ' free trial ends: cancel or pay ' + price, 'Your free trial of ' + s.name + ' ends today and the first payment of ' + price + ' is taken. Cancel before then if you do not want to pay ' + price + ' ' + how + '.', '', 2);
            }
            // the rule keeps the original day of the month (31st stays the last day of shorter months)
            const first = status(s, today) === 'trial' ? nth(s, 1) : nextOn(s, today);
            ev(s.id, first, s.name + ' payment: ' + price, s.name + ' takes ' + price + ' ' + how + '.' + (s.note ? '\n' + s.note : ''), rrule(s), 1);
            n++;
        });
        L.push('END:VCALENDAR');
        return { text: L.join('\r\n') + '\r\n', count: n };
    }

    const api = { UNITS, MAX_EVERY, STATUSES, parseDate, isDate, addDays, addMonths, diff, todayIso, nth, nextOn, between,
        parsePrice, fmt, yearly, monthly, cycleText, status, counted, summary, clean, cleanList, rrule, ics };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SubCore = api;
})(this);
