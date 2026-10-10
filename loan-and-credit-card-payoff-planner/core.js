// Debt payoff maths, with no page code. Works in the browser (window.DebtCore) and in Node (require).
// Money is whole cents. Rates are thousandths of a percent (19.99% = 19990).
// Each month: interest is added to every debt (balance x yearly rate / 12, rounded half up to the cent),
// then every debt gets its own monthly payment, then the extra (plus the payments of debts already paid off)
// goes to one debt at a time in the chosen order.
(function (root) {
    const MAX_CENTS = 10000000000;      // 100,000,000.00
    const MAX_RATE = 1000000;           // 1000% a year
    const MAX_MONTHS = 1200;            // 100 years: past this we say it is never paid off
    const B = BigInt;

    // ---- reading what people type or paste
    // "1,299.50", "1.299,50", "22,50", "$ 4,500", "4500.00" -> cents
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
    // "19.9", "19,9", "24.99 %" -> thousandths of a percent
    function parseRate(v) {
        let s = String(v == null ? '' : v).trim().replace(/[%\s]/g, '').replace(/apr$/i, '');
        if (!s) return { err: 'blank' };
        if (/^-/.test(s)) return { err: 'negative' };
        s = s.replace(',', '.');
        if (!/^\d*\.?\d*$/.test(s) || s === '.') return { err: 'nan' };
        const r = toScaled(s, 1000);
        if (r > MAX_RATE) return { err: 'big' };
        return { rate: r };
    }
    function toScaled(s, scale) {
        const [w, f = ''] = s.split('.'), digits = String(scale).length - 1;
        const keep = (f + '0'.repeat(digits + 1)).slice(0, digits + 1);
        let n = Number(w || '0') * scale + Number(keep.slice(0, digits) || '0');
        if (Number(keep[digits]) >= 5) n += 1;
        return n;
    }

    // one month of interest on a balance, rounded half up to the cent
    function monthInterest(bal, rate) {
        if (!bal || !rate) return 0;
        const d = 1200000n;               // 100 (percent) x 1000 (thousandths) x 12 (months)
        return Number((B(bal) * B(rate) * 2n + d) / (d * 2n));
    }

    const ERR = {
        bal: { negative: 'The balance cannot be negative.', nan: 'Type a number, for example 3,200 or 3200.50.', big: 'That is too big. The most is 100,000,000.' },
        rate: { negative: 'The interest rate cannot be negative.', nan: 'Type a number, for example 19.9. Type 0 if there is no interest.', big: 'That is too high. The most is 1000% a year.' },
        pay: { negative: 'The payment cannot be negative.', nan: 'Type a number, for example 150.', big: 'That is too big. The most is 100,000,000.' }
    };
    // raw: { bal, rate, pay } as typed -> { status: 'ok' | 'wait' | 'bad' | 'paid', errs, debt: { bal, rate, min, interest1 } }
    function readDebt(raw) {
        const b = parseMoney(raw.bal), r = parseRate(raw.rate), p = parseMoney(raw.pay), errs = {};
        if (b.err) errs.bal = b.err === 'blank' ? 'blank' : ERR.bal[b.err];
        if (r.err) errs.rate = r.err === 'blank' ? 'blank' : ERR.rate[r.err];
        if (p.err) errs.pay = p.err === 'blank' ? 'blank' : ERR.pay[p.err];
        const keys = Object.keys(errs), hard = keys.filter(k => errs[k] !== 'blank');
        if (hard.length) return { status: 'bad', errs };
        if (!b.err && b.cents === 0) return { status: 'paid', errs: {} };
        if (keys.length) return { status: 'wait', errs, missing: keys };
        return { status: 'ok', errs, debt: { bal: b.cents, rate: r.rate, min: p.cents, interest1: monthInterest(b.cents, r.rate) } };
    }

    // the order debts get the extra money in. Ties: highest interest first -> smaller balance; smallest balance first -> higher rate; then as listed.
    function orderOf(debts, order) {
        const idx = debts.map((_, i) => i);
        if (order === 'snowball') idx.sort((a, b) => debts[a].bal - debts[b].bal || debts[b].rate - debts[a].rate || a - b);
        else if (order === 'avalanche') idx.sort((a, b) => debts[b].rate - debts[a].rate || debts[a].bal - debts[b].bal || a - b);
        return idx;
    }

    // debts: [{ bal, rate, min }]; opts: { extra, order: 'avalanche' | 'snowball' | 'listed', oneoffs: [{ at (payment number, 1 = first), cents }], own: true for "just each payment, no extra, no rolling over" }
    function simulate(debts, opts) {
        const o = opts || {}, extra = o.own ? 0 : (o.extra || 0), seq = orderOf(debts, o.order || 'avalanche');
        const bal = debts.map(d => d.bal), per = debts.map(() => ({ payoff: 0, interest: 0, paid: 0 }));
        const budget = debts.reduce((t, d) => t + d.min, 0) + extra;
        const ones = {}; if (!o.own) (o.oneoffs || []).forEach(x => { if (x.at >= 1 && x.cents > 0) ones[x.at] = (ones[x.at] || 0) + x.cents; });
        const rows = []; let interest = 0, paid = 0, m = 0, never = false;
        const owed = () => bal.reduce((t, v) => t + v, 0);
        while (owed() > 0) {
            m++;
            if (m > MAX_MONTHS || owed() > 1e14) { never = true; m--; break; }
            const pay = debts.map(() => 0); let mi = 0;
            debts.forEach((d, i) => { if (bal[i] > 0) { const x = monthInterest(bal[i], d.rate); bal[i] += x; per[i].interest += x; mi += x; } });
            // every debt gets its own payment first
            let left = o.own ? 0 : budget + (ones[m] || 0);
            debts.forEach((d, i) => { const x = Math.min(d.min, bal[i]); pay[i] = x; bal[i] -= x; if (!o.own) left -= x; });
            // then the rest goes to one debt at a time
            for (const i of seq) { if (left <= 0) break; const x = Math.min(left, bal[i]); pay[i] += x; bal[i] -= x; left -= x; }
            const done = [];
            debts.forEach((d, i) => { per[i].paid += pay[i]; if (bal[i] === 0 && !per[i].payoff && (pay[i] > 0 || debts[i].bal > 0)) { per[i].payoff = m; done.push(i); } });
            const tp = pay.reduce((t, v) => t + v, 0);
            interest += mi; paid += tp;
            rows.push({ m, pay: tp, interest: mi, owed: owed(), each: pay, done });
        }
        return { months: never ? null : m, never, interest, paid, per, rows, order: seq, budget, first: rows.length ? rows[0].each : debts.map(() => 0), extra };
    }

    // the smallest extra each month that gets everything paid off in at most `months` payments (null if even paying it all at once fails)
    function extraFor(debts, months, opts) {
        const base = Object.assign({}, opts, { own: false });
        const fits = e => { const r = simulate(debts, Object.assign({}, base, { extra: e })); return !r.never && r.months <= months; };
        let lo = 0, hi = debts.reduce((t, d) => t + d.bal + monthInterest(d.bal, d.rate), 0);
        if (fits(0)) return 0;
        if (!fits(hi)) return null;
        while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (fits(mid)) hi = mid; else lo = mid; }
        return hi;
    }

    // ---- dates and words
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    // start: { y, m (0-11) } is the month of payment 1
    function monthAt(start, k) { const t = start.y * 12 + start.m + k - 1; return { y: Math.floor(t / 12), m: t % 12 }; }
    function monthName(start, k, long) { const x = monthAt(start, k); return (long ? LONG : MONTHS)[x.m] + ' ' + x.y; }
    function monthKey(start, k) { const x = monthAt(start, k); return x.y + '-' + String(x.m + 1).padStart(2, '0'); }
    function indexOfKey(start, key) {
        const r = /^(\d{4})-(\d{2})$/.exec(String(key || '')); if (!r) return null;
        const mm = Number(r[2]); if (mm < 1 || mm > 12) return null;
        return Number(r[1]) * 12 + mm - 1 - (start.y * 12 + start.m) + 1;
    }
    function nextMonth(date) { const d = date || new Date(); const t = d.getFullYear() * 12 + d.getMonth() + 1; return { y: Math.floor(t / 12), m: t % 12 }; }
    function span(n) {
        const y = Math.floor(n / 12), m = n % 12, p = [];
        if (y) p.push(y + (y === 1 ? ' year' : ' years'));
        if (m || !y) p.push(m + (m === 1 ? ' month' : ' months'));
        return p.join(' ');
    }

    function pad(n) { return String(n).padStart(2, '0'); }
    function fmt(cents, sym) {
        const neg = cents < 0, c = Math.abs(Math.round(cents));
        const s = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + pad(c % 100);
        const p = !sym ? '' : /[A-Za-z]$/.test(sym) ? sym + ' ' : sym;
        return (neg ? '-' : '') + p + s;
    }
    // 19990 -> "19.99"
    function rateText(r) { return String(r / 1000).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''); }

    const api = { MAX_MONTHS, parseMoney, parseRate, monthInterest, readDebt, orderOf, simulate, extraFor, monthAt, monthName, monthKey, indexOfKey, nextMonth, span, fmt, rateText };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DebtCore = api;
})(this);
