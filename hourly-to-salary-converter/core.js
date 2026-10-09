// Pay maths, with no page code. Works in the browser (window.PayCore) and in Node (require).
// Money is whole cents. Every result is worked out as an exact fraction (BigInt) and rounded half up once, at the end.
// A year is 52 weeks. Days off are counted in half days so 2.5 days is exact.
(function (root) {
    const PERS = ['hour', 'day', 'week', '2week', 'month', 'year'];
    const PER_TEXT = { hour: 'an hour', day: 'a day', week: 'a week', '2week': 'every 2 weeks', month: 'a month', year: 'a year' };
    const MAX_CENTS = 10000000000;   // 100,000,000.00 per period
    const B = BigInt;

    // ---- reading what people type or paste
    // "1,299.50", "1.299,50", "22,50", "$ 45,000", "45000.00" -> cents
    function parseMoney(v) {
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
        const cents = toScaled(s, 100);
        if (cents > MAX_CENTS) return { err: 'big' };
        return { cents };
    }
    // "37.5" or "37,5" -> 3750 when scale is 100. Rounds half up past the last kept decimal.
    function parseNum(v, scale) {
        let s = String(v == null ? '' : v).trim().replace(/\s/g, '');
        if (!s) return { err: 'blank' };
        if (/^-/.test(s)) return { err: 'negative' };
        s = s.replace(',', '.');
        if (!/^\d*\.?\d*$/.test(s) || s === '.' || s === '') return { err: 'nan' };
        return { v: toScaled(s, scale) };
    }
    function toScaled(s, scale) {
        const [w, f = ''] = s.split('.'), digits = String(scale).length - 1;
        const keep = (f + '0'.repeat(digits + 1)).slice(0, digits + 1);
        let n = Number(w || '0') * scale + Number(keep.slice(0, digits) || '0');
        if (Number(keep[digits]) >= 5) n += 1;
        return n;
    }

    // ---- exact fractions
    const q = (n, d = 1) => ({ n: B(n), d: B(d) });
    const mul = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
    const div = (a, b) => ({ n: a.n * b.d, d: a.d * b.n });
    const add = (a, b) => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
    const round = a => { if (a.n < 0n) return -round({ n: -a.n, d: a.d }); return Number((a.n * 2n + a.d) / (a.d * 2n)); };

    // ---- one job
    // job: { cents, per, hc (hours a week x100), days (1-7), u2 / p2 (unpaid / paid days off a year, x2), oc (overtime hours a week x100), mc (overtime rate x100) }
    function calc(j) {
        const D = j.days, slots = 104 * D;            // half days of work in a 52-week year
        const H = q(j.hc, 100);
        const full = { hour: mul(q(j.cents * 52), H), day: q(j.cents * D * 52), week: q(j.cents * 52), '2week': q(j.cents * 26), month: q(j.cents * 12), year: q(j.cents) }[j.per];
        const hour = div(full, mul(q(52), H));                         // normal rate per hour
        const day = div(full, q(52 * D));                               // a normal working day
        const baseWeek = div(full, q(52));
        const paidShare = q(slots - j.u2, slots);                       // unpaid days lower the year
        const baseYear = mul(full, paidShare);
        const weeksWorked = q(slots - j.u2 - j.p2, 2 * D);              // weeks you are actually at work
        const otWeek = j.oc ? mul(mul(hour, q(j.mc, 100)), q(j.oc, 100)) : q(0);
        const otYear = mul(otWeek, weeksWorked);
        const year = add(baseYear, otYear);
        const week = add(baseWeek, otWeek);
        const hoursYear = mul(add(H, q(j.oc, 100)), weeksWorked);
        const eff = hoursYear.n > 0n ? div(year, hoursYear) : null;
        const r = {
            hour: round(hour), day: round(day), dayHours: round(div(mul(H, q(100)), q(D))),
            week: round(week), twoWeeks: round(mul(week, q(2))), month: round(div(year, q(12))), year: round(year),
            full: round(full), unpaidCut: round(full) - round(baseYear), otYear: round(otYear),
            hoursYear: round(mul(hoursYear, q(10))) / 10, weeksWorked: round(mul(weeksWorked, q(10))) / 10,
            eff: eff ? round(eff) : null
        };
        r.effDiffers = r.eff != null && r.eff !== r.hour;
        return r;
    }

    // ---- check what was typed for one job. raw holds the strings from the form.
    function readJob(raw) {
        const e = {}, j = { per: PERS.includes(raw.per) ? raw.per : 'hour', days: Math.min(7, Math.max(1, Math.round(Number(raw.days)) || 5)) };
        const m = parseMoney(raw.pay);
        if (m.err === 'blank') e.pay = 'blank';
        else if (m.err === 'negative') e.pay = 'Pay cannot be negative.';
        else if (m.err === 'big') e.pay = 'That is more than 100,000,000. Check the number.';
        else if (m.err) e.pay = 'Type the pay as a number, for example 22.50 or 45,000.';
        else j.cents = m.cents;

        const h = parseNum(raw.hours, 100);
        if (h.err === 'blank') e.hours = 'Type the hours you work in a normal week.';
        else if (h.err) e.hours = 'Type the hours as a number, for example 40 or 37.5.';
        else if (h.v < 25) e.hours = 'Hours a week must be at least 0.25.';
        else if (h.v > 16800) e.hours = 'A week has only 168 hours.';
        else j.hc = h.v;

        const half = (v, name) => {
            if (String(v == null ? '' : v).trim() === '') return 0;
            const p = parseNum(v, 10);
            if (p.err) { e[name] = 'Type the number of days, for example 10 or 2.5.'; return 0; }
            if (p.v % 5) { e[name] = 'Use whole or half days, for example 10 or 2.5.'; return 0; }
            return p.v / 5;
        };
        j.p2 = half(raw.paid, 'paid'); j.u2 = half(raw.unpaid, 'unpaid');
        if (!e.paid && !e.unpaid && j.p2 + j.u2 > 104 * j.days) e.unpaid = 'Days off add up to more than the ' + 52 * j.days + ' working days in a year (' + j.days + ' a week x 52).';

        j.oc = 0; j.mc = 150;
        if (String(raw.ot == null ? '' : raw.ot).trim() !== '') {
            const o = parseNum(raw.ot, 100);
            if (o.err) e.ot = 'Type the overtime hours as a number, for example 5.';
            else if (j.hc != null && j.hc + o.v > 16800) e.ot = 'Normal and overtime hours add up to more than the 168 hours in a week.';
            else j.oc = o.v;
            const mk = parseNum(raw.mult, 100);
            if (mk.err || mk.v < 100 || mk.v > 500) e.mult = 'The overtime rate must be between 1 and 5 times your normal rate.';
            else j.mc = mk.v;
        }
        const ok = !Object.keys(e).length;
        return { ok, errs: e, job: j, res: ok ? calc(j) : null };
    }

    // ---- compare jobs: the one that pays the most a year first, and per hour you actually work
    function compare(list) {   // list: [{ name, res }]
        const done = list.filter(x => x.res);
        if (done.length < 2) return null;
        const byYear = done.slice().sort((a, b) => b.res.year - a.res.year);
        const byHour = done.filter(x => x.res.eff != null).sort((a, b) => b.res.eff - a.res.eff);
        const top = byYear[0];
        const rows = byYear.slice(1).map(x => ({ name: x.name, less: top.res.year - x.res.year, lessMonth: top.res.month - x.res.month, res: x.res }));
        const tie = rows.length && rows.every(r => r.less === 0);
        const hourTop = byHour[0], hourTie = byHour.length > 1 && byHour[1].res.eff === hourTop.res.eff;
        return { top, rows, tie, hourTop, hourTie, hourDiffers: !!hourTop && !hourTie && hourTop !== top && hourTop.res.year !== top.res.year };
    }

    function pad(n) { return String(n).padStart(2, '0'); }
    function fmt(cents, sym) {
        const neg = cents < 0, c = Math.abs(Math.round(cents));
        const s = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + pad(c % 100);
        const p = !sym ? '' : /[A-Za-z]$/.test(sym) ? sym + ' ' : sym;
        return (neg ? '-' : '') + p + s;
    }
    // 37.5 -> "37.5", 40 -> "40", 1816 -> "1,816"
    function num(v) { const [w, f] = String(Math.round(v * 100) / 100).split('.'); return w.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); }

    const api = { PERS, PER_TEXT, parseMoney, parseNum, calc, readJob, compare, fmt, num };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PayCore = api;
})(this);
