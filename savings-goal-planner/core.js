// Savings goal maths, no page code. Money is whole cents, interest rates are thousandths of a percent (4.5% = 4500),
// dates are plain calendar dates ("2026-10-12"), so every answer is exact and time zones never move a date.
(function (root) {
    const MAX_AMOUNT = 1000000000;   // 10,000,000.00
    const MAX_RATE = 30000;          // 30% a year
    const MAX_GOALS = 30;
    const MAX_LOG = 2000;
    const MAX_NAME = 50;
    const MAX_YEARS = 100;
    const SYMBOLS = ['', '$', '€', '£', '₹', 'Rs', '¥', '₩', '₦', '₱', 'R', 'kr', 'CHF', 'AED', 'SAR', 'RM'];
    const COLORS = ['#eab308', '#22c55e', '#3b82f6', '#ec4899', '#a855f7', '#f97316', '#14b8a6', '#ef4444', '#6366f1', '#84cc16'];
    const FREQS = { month: { ppy: 12, one: 'month', every: 'a month' }, '2weeks': { ppy: 26, one: '2 weeks', every: 'every 2 weeks' }, week: { ppy: 52, one: 'week', every: 'a week' } };
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = n => String(n).padStart(2, '0');

    // Reads what people type or paste: "12.50", "12,50", "$1,299.00", "1.299,00 €". Returns { cents }, { blank } or { err }.
    function parseAmount(v) {
        let s = String(v == null ? '' : v).trim();
        if (!s) return { blank: true };
        if (/^-|-\s*\d|\d\s*-$/.test(s)) return { err: 'negative' };
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
        if (w.replace(/^0+/, '').length > 8) return { err: 'big' };
        const f3 = (f + '000').slice(0, 3);
        const cents = parseInt(w || '0', 10) * 100 + parseInt(f3.slice(0, 2), 10) + (+f3[2] >= 5 ? 1 : 0);
        return cents > MAX_AMOUNT ? { err: 'big' } : { cents };
    }
    // "4.5" or "4,5%" -> 4500. Returns { n }, { blank } or { err }.
    function parseRate(v) {
        const s = String(v == null ? '' : v).trim().replace('%', '').trim().replace(',', '.');
        if (!s) return { blank: true };
        if (/^-/.test(s)) return { err: 'negative' };
        if (!/^\d*\.?\d*$/.test(s) || s === '.') return { err: 'nan' };
        const [w, f = ''] = s.split('.');
        if (w.replace(/^0+/, '').length > 3) return { err: 'big' };
        const f4 = (f + '0000').slice(0, 4);
        const n = parseInt(w || '0', 10) * 1000 + parseInt(f4.slice(0, 3), 10) + (+f4[3] >= 5 ? 1 : 0);
        return n > MAX_RATE ? { err: 'big' } : { n };
    }
    const rateText = n => String(Math.floor(n / 1000)) + (n % 1000 ? ('.' + String(n % 1000).padStart(3, '0')).replace(/0+$/, '') : '');

    function fmt(cents, sym) {
        const neg = cents < 0, c = Math.abs(Math.round(cents));
        const s = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + pad(c % 100);
        const p = !sym ? '' : /[A-Za-z]$/.test(sym) ? sym + ' ' : sym;
        return (neg ? '-' : '') + p + s;
    }
    const plain = cents => (cents / 100).toFixed(2).replace(/\.00$/, '');

    // ---- calendar dates
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    function validDate(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
        if (!m) return false;
        const y = +m[1], mo = +m[2], d = +m[3];
        return y >= 2000 && y <= 2150 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo);
    }
    const parts = s => s.split('-').map(Number);
    const dayNum = s => { const [y, m, d] = parts(s); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
    const fromNum = n => { const t = new Date(n * 864e5); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); };
    const today = (now = new Date()) => now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    // k months after a date; a day that does not exist in that month becomes its last day (31 Jan + 1 month = 28 Feb)
    function addMonths(s, k) {
        let [y, m, d] = parts(s); m += k;
        y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
        return y + '-' + pad(m) + '-' + pad(Math.min(d, daysIn(y, m)));
    }
    // date of payment number k (0 = the first) when saving every month, 2 weeks or week from `first`
    const payDate = (first, k, freq) => freq === 'month' ? addMonths(first, k) : fromNum(dayNum(first) + k * (freq === 'week' ? 7 : 14));
    const dateText = (s, withYear = true) => { const [y, m, d] = parts(s); return d + ' ' + MONTHS[m - 1] + (withYear ? ' ' + y : ''); };

    // ---- goals
    const saved = g => g.start + g.log.reduce((a, x) => a + x.cents, 0);
    // The first payment still to make: today, or, when money was already put in during this saving period, the next one after it
    function firstPayDate(g, todayStr) {
        const last = g.log.filter(x => x.cents > 0).reduce((a, x) => (x.date > a ? x.date : a), '');
        if (last && last <= todayStr) { const next = payDate(last, 1, g.freq); if (next > todayStr) return next; }
        return todayStr;
    }
    const perPeriodInterest = (bal, rate, ppy) => bal > 0 && rate ? Math.floor((bal * rate + 50000 * ppy) / (100000 * ppy)) : 0;

    // Saves `pay` each time (less the last time if less is enough) until the target is reached, at most maxN payments.
    // Interest at the yearly rate / payments a year is added before each payment after the first.
    // Returns { count, last, at, interest } (at = index of the payment date when the target is reached) or { never }.
    function run(bal, pay, rate, ppy, target, maxN) {
        let interest = 0, lastDep = 0, deps = 0;
        for (let k = 0; k < maxN; k++) {
            if (k > 0) { const i = perPeriodInterest(bal, rate, ppy); bal += i; interest += i; }
            const need = target - bal;
            if (need <= 0) return { count: deps, last: lastDep, at: k, interest };
            if (pay <= 0) continue;
            const dep = Math.min(pay, need);
            bal += dep; lastDep = dep; deps++;
            if (dep === need) return { count: deps, last: dep, at: k, interest };
        }
        return { never: true };
    }

    // The answer for one goal. Returns an object the page turns into words:
    //  { status: 'reached', extra }                                     already there
    //  { status: 'past' }                                               the goal date is today or has passed
    //  { status: 'too-soon', rem, first }                               no payment left before the goal date
    //  { status: 'plan', pay, count, last, first, lastDate, interest, rem }      by a date: how much each time
    //  { status: 'when', pay, count, last, first, date, interest, rem }          a set amount: when it is reached
    //  { status: 'never' } / { status: 'too-long' }                     a set amount of 0, or more than 100 years
    function plan(g, todayStr) {
        const have = saved(g), rem = g.target - have, f = FREQS[g.freq], ppy = f.ppy;
        if (rem <= 0) return { status: 'reached', extra: -rem, saved: have };
        const first = firstPayDate(g, todayStr);
        if (g.mode === 'date') {
            if (g.date <= todayStr) return { status: 'past', rem, saved: have };
            let n = 0; while (payDate(first, n, g.freq) <= g.date) n++;
            if (!n) return { status: 'too-soon', rem, first, saved: have };
            let lo = 1, hi = rem;
            while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (run(have, mid, g.rate, ppy, g.target, n).never) lo = mid + 1; else hi = mid; }
            const r = run(have, lo, g.rate, ppy, g.target, n);
            return { status: 'plan', pay: lo, count: r.count, last: r.last, first, lastDate: payDate(first, Math.max(0, r.count - 1), g.freq), interest: r.interest, n, rem, saved: have };
        }
        if (g.pay <= 0 && (!g.rate || have <= 0)) return { status: 'never', rem, saved: have };
        const r = run(have, g.pay, g.rate, ppy, g.target, MAX_YEARS * ppy + 1);
        if (r.never) return { status: 'too-long', rem, saved: have };
        return { status: 'when', pay: g.pay, count: r.count, last: r.last, first, date: payDate(first, r.at, g.freq), interest: r.interest, rem, saved: have };
    }
    // about how much a month a payment is (for the total at the top): 100 a week = about 433.33 a month
    const perMonth = (pay, freq) => Math.round(pay * FREQS[freq].ppy / 12);

    // ---- saved data
    const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const okCents = (n, min) => Number.isInteger(n) && n >= min && n <= MAX_AMOUNT;
    const str = (v, max) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
    function cleanGoal(g, i) {
        if (!g || typeof g !== 'object') return null;
        const name = str(g.name, MAX_NAME);
        if (!name || !okCents(g.target, 1)) return null;
        const out = {
            id: typeof g.id === 'string' && /^[\w-]{1,40}$/.test(g.id) ? g.id : newId('g'), name, target: g.target,
            start: Number.isInteger(g.start) && Math.abs(g.start) <= MAX_AMOUNT ? g.start : 0,
            mode: g.mode === 'amount' ? 'amount' : 'date',
            date: validDate(g.date) ? g.date : null,
            pay: okCents(g.pay, 0) ? g.pay : 0,
            freq: FREQS[g.freq] ? g.freq : 'month',
            rate: Number.isInteger(g.rate) && g.rate >= 0 && g.rate <= MAX_RATE ? g.rate : 0,
            color: /^#[0-9a-f]{6}$/i.test(g.color) ? g.color : COLORS[i % COLORS.length], log: []
        };
        if (out.mode === 'date' && !out.date) return null;
        if (Array.isArray(g.log)) {
            g.log.slice(0, MAX_LOG).forEach(x => {
                if (!x || !validDate(x.date) || !Number.isInteger(x.cents) || x.cents === 0 || Math.abs(x.cents) > MAX_AMOUNT) return;
                out.log.push({ id: typeof x.id === 'string' && /^[\w-]{1,40}$/.test(x.id) ? x.id : newId('d'), date: x.date, cents: x.cents });
            });
        }
        // "start" is what was saved before the money in and out listed here; what is saved now is never below 0
        const now = saved(out);
        if (now < 0) out.start -= now;
        if (saved(out) > MAX_AMOUNT * 10) return null;
        return out;
    }
    function clean(raw) {
        const s = { v: 1, cur: '', goals: [] };
        if (!raw || typeof raw !== 'object') return s;
        if (SYMBOLS.includes(raw.cur)) s.cur = raw.cur;
        if (Array.isArray(raw.goals)) {
            const ids = new Set();
            raw.goals.slice(0, MAX_GOALS).forEach((g, i) => { const c = cleanGoal(g, i); if (!c) return; while (ids.has(c.id)) c.id = newId('g'); ids.add(c.id); s.goals.push(c); });
        }
        return s;
    }

    const api = { MAX_AMOUNT, MAX_RATE, MAX_GOALS, MAX_LOG, MAX_NAME, MAX_YEARS, SYMBOLS, COLORS, FREQS, parseAmount, parseRate, rateText, fmt, plain, validDate, dayNum, fromNum, today,
        addMonths, payDate, dateText, saved, firstPayDate, run, plan, perMonth, newId, clean, cleanGoal };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SavingsCore = api;
})(this);
