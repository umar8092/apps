// Freelance Income Log with Tax Set-Aside: the maths and the words. No page code here, so tests.js can run it in node.
// Money is kept in whole cents (or the smallest unit of the client's currency) and dates as "2026-10-28" day strings, so every sum is exact.
(function (root) {
    'use strict';
    const MAXC = 10000000000;        // up to 100,000,000 for one payment
    const MAXRATE = 1000000000000;   // exchange rate up to 1,000,000 (kept times 1,000,000)
    const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'AED', 'SAR', 'QAR', 'SGD', 'CHF', 'JPY', 'CNY', 'PKR', 'INR', 'BDT', 'LKR', 'NPR', 'NGN', 'KES', 'GHS', 'EGP', 'ZAR', 'PHP', 'IDR', 'MYR', 'TRY', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN'];
    const TAX_YEARS = { '01-01': 'January to December', '04-01': '1 April to 31 March (India and others)', '04-06': '6 April to 5 April (UK)', '07-01': '1 July to 30 June (Pakistan, Australia and others)' };

    // ---------- typed numbers ----------
    // "12,345.6", "12.345,6", "12 345", "1,00,000" and "Rs 23.5" all work. Returns the number times 10^dec as a whole number.
    function parseNum(text, dec, opt) {
        opt = opt || {};
        const bad = opt.bad || 'That number looks mistyped. Type it like 12345 or 12345.6.';
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: opt.blank || 'Type a number.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴%])$/i, '').trim();
        if (/^[-−–]/.test(s)) return { error: opt.minus || 'Type it without a minus sign.' };
        if (/^\+/.test(s)) s = s.slice(1).trim();
        if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return { error: bad };
        let intPart, fracPart = '';
        if (/\s/.test(s)) {
            const parts = s.split(/\s+/), last = parts[parts.length - 1], m = last.match(/^(\d{3})([.,]\d*)?$/);
            if (!/^\d{1,3}$/.test(parts[0]) || !parts.slice(1, -1).every(p => /^\d{3}$/.test(p)) || !m) return { error: bad };
            intPart = parts.slice(0, -1).join('') + m[1]; fracPart = m[2] ? m[2].slice(1) : '';
        } else {
            const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
            let mark = null;
            if (dots && commas) mark = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
            else if (dots + commas === 1) {
                const one = dots ? '.' : ',', [a, b] = s.split(one);
                // "12,345" is twelve thousand; "12,5" and "0.345" are decimals
                mark = (b.length === 3 && /^\d{1,3}$/.test(a) && a !== '0') ? null : one;
            }
            intPart = s;
            if (mark) { const i = s.lastIndexOf(mark); intPart = s.slice(0, i); fracPart = s.slice(i + 1); }
            const th = mark === '.' ? ',' : mark === ',' ? '.' : (dots ? '.' : ',');
            if (mark && intPart.includes(mark)) return { error: bad };
            if (intPart.includes(th)) {
                const west = new RegExp('^\\d{1,3}(\\' + th + '\\d{3})+$'), lakh = new RegExp('^\\d{1,2}(\\' + th + '\\d{2})*\\' + th + '\\d{3}$');
                if (!west.test(intPart) && !lakh.test(intPart)) return { error: bad };
                intPart = intPart.split(th).join('');
            }
            if (!/^\d*$/.test(fracPart) || !/^\d*$/.test(intPart)) return { error: bad };
        }
        fracPart = fracPart.replace(/0+$/, '');
        if (fracPart.length > dec) return { error: opt.decimals || ('Use at most ' + dec + ' decimal places.') };
        if (intPart.replace(/^0+/, '').length > 12) return { error: opt.big || 'That number is too big.' };
        const n = Number(intPart || '0') * Math.pow(10, dec) + Number(fracPart.padEnd(dec, '0').slice(0, dec) || '0');
        if (opt.max != null && n > opt.max) return { error: opt.big || 'That number is too big.' };
        if (opt.positive && n <= 0) return { error: opt.zero || 'Type a number bigger than 0.' };
        return { n };
    }
    const parseMoney = (t, opt) => parseNum(t, 2, Object.assign({ max: MAXC, blank: 'Type an amount, such as 500.', big: 'That amount is too big.', bad: 'Type an amount such as 500 or 1,250.75.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign. For money taken back, tick "Money taken back".' }, opt || {}));
    // a percentage such as "15" or "2.5%" -> basis points (1500, 250)
    function parsePct(t, max) {
        const r = parseNum(t, 2, { blank: 'Type a percentage, such as 15.', bad: 'Type a percentage such as 15 or 2.5.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.' });
        if (r.error) return r;
        if (r.n > (max == null ? 10000 : max)) return { error: 'Type ' + (max == null ? 100 : max / 100) + '% or less.' };
        return { n: r.n };
    }
    // the fee: blank = none, "15" = 15.00 in the client's currency, "10%" = 10% of what the client paid
    function parseFee(t, gross) {
        const s = String(t == null ? '' : t).trim();
        if (!s) return { fee: 0, pct: null };
        if (/%$/.test(s)) {
            const r = parseNum(s.replace(/%$/, ''), 2, { bad: 'Type the fee like 25 or 10%.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.' });
            if (r.error) return { error: r.error };
            if (r.n >= 10000) return { error: 'A fee must be less than 100%.' };
            return { fee: mulDiv(gross, r.n, 10000), pct: r.n };
        }
        const r = parseMoney(s, { bad: 'Type the fee like 25 or 10%.' });
        if (r.error) return { error: r.error };
        if (gross != null && r.n >= gross && r.n > 0) return { error: 'The fee must be less than what the client paid.' };
        return { fee: r.n, pct: null };
    }
    function parseRate(t) {
        const r = parseNum(t, 6, { blank: 'Type the exchange rate, such as 279.50.', bad: 'Type the rate like 279.50.', decimals: 'Use at most 6 decimal places.', minus: 'Type it without a minus sign.', big: 'That rate is too big.' });
        if (r.error) return r;
        if (r.n <= 0) return { error: 'The rate must be more than 0.' };
        if (r.n > MAXRATE) return { error: 'That rate is too big.' };
        return { n: r.n };
    }
    // a * b / d rounded half away from zero, exact for big numbers
    function mulDiv(a, b, d) {
        const neg = (a < 0) !== (b < 0);
        const A = BigInt(Math.abs(a)), B = BigInt(Math.abs(b)), D = BigInt(d);
        const q = Number((A * B * 2n + D) / (2n * D));
        return neg && q ? -q : q;
    }

    // ---------- days ----------
    const pad = n => String(n).padStart(2, '0');
    const dNum = s => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
    function dStr(n) { const d = new Date(n * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2200 && dStr(dNum(s)) === s;
    const today = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    const addDays = (s, n) => dStr(dNum(s) + n);
    const daysBetween = (a, b) => dNum(b) - dNum(a);
    const ym = s => s.slice(0, 7);
    function addMonth(key, k) { const m = +key.slice(0, 4) * 12 + (+key.slice(5, 7) - 1) + k; return Math.floor(m / 12) + '-' + pad(m % 12 + 1); }
    const monthFirst = key => key + '-01';
    const monthLast = key => addDays(addMonth(key, 1) + '-01', -1);
    // the tax year a day falls in, for a start such as "07-01"
    function taxYear(s, start) {
        if (!TAX_YEARS[start]) start = '01-01';
        let y = +s.slice(0, 4);
        if (s.slice(5) < start) y--;
        const from = y + '-' + start, to = addDays((y + 1) + '-' + start, -1);
        const label = start === '01-01' ? String(y) : y + '-' + String(y + 1).slice(2);
        return { from, to, label };
    }

    // ---------- one payment ----------
    // p = { id, client, date, cur ('' = your own currency), gross, fee, feePct, rate, home, refund, note }
    const net = p => p.gross - p.fee;
    const sign = p => p.refund ? -1 : 1;
    // what reached your bank in your own money (signed), or null when it is still in a foreign-currency balance
    function homeOf(p) {
        if (!p.cur) return sign(p) * net(p);
        if (p.rate > 0) return sign(p) * mulDiv(net(p), p.rate, 1000000);
        if (p.home != null) return sign(p) * p.home;
        return null;
    }
    // the rate you really got, times 1,000,000 (null for your own currency or not converted yet)
    function rateOf(p) {
        if (!p.cur) return null;
        if (p.rate > 0) return p.rate;
        if (p.home != null && net(p) > 0) return mulDiv(p.home, 1000000, net(p));
        return null;
    }

    // ---------- adding up ----------
    function inRange(state, from, to) { return state.pays.filter(p => p.date >= from && p.date <= to); }
    function stats(state, from, to) {
        const list = inRange(state, from, to);
        const o = { count: list.length, refunds: 0, home: 0, byCur: {}, pending: {}, pendingCount: 0 };
        list.forEach(p => {
            const s = sign(p), c = p.cur || '';
            const g = o.byCur[c] || (o.byCur[c] = { gross: 0, fee: 0, count: 0 });
            g.gross += s * p.gross; g.fee += s * p.fee; g.count++;
            if (p.refund) o.refunds++;
            const h = homeOf(p);
            if (h == null) { o.pending[c] = (o.pending[c] || 0) + s * net(p); o.pendingCount++; } else o.home += h;
        });
        return o;
    }
    const setAside = (home, pct) => home > 0 ? mulDiv(home, pct, 10000) : 0;
    const firstMonth = state => state.pays.length ? ym(state.pays.reduce((a, p) => p.date < a ? p.date : a, state.pays[0].date)) : null;
    // the average month over up to n months ending with `key` (never before the first payment)
    function average(state, key, n) {
        const first = firstMonth(state);
        if (!first || first > key) return null;
        let from = addMonth(key, -(n - 1));
        if (from < first) from = first;
        let months = 0; for (let k = from; k <= key; k = addMonth(k, 1)) months++;
        const s = stats(state, monthFirst(from), monthLast(key));
        return { from, to: key, months, total: s.home, avg: Math.round(s.home / months), pendingCount: s.pendingCount };
    }
    function months(state, key, n) {
        const out = [];
        for (let i = n - 1; i >= 0; i--) { const k = addMonth(key, -i); const s = stats(state, monthFirst(k), monthLast(k)); out.push({ key: k, home: s.home, count: s.count, pending: s.pendingCount }); }
        return out;
    }
    function clientStats(state, from, to) {
        const rows = state.clients.map(c => {
            const list = inRange(state, from, to).filter(p => p.client === c.id);
            const all = state.pays.filter(p => p.client === c.id);
            const s = { home: 0, count: list.length, byCur: {}, pending: 0 };
            list.forEach(p => {
                const g = s.byCur[p.cur] || (s.byCur[p.cur] = { gross: 0, fee: 0 });
                g.gross += sign(p) * p.gross; g.fee += sign(p) * p.fee;
                const h = homeOf(p); if (h == null) s.pending++; else s.home += h;
            });
            const last = all.reduce((a, p) => !a || p.date > a ? p.date : a, null);
            return { c, s, total: all.length, last };
        });
        return rows.sort((a, b) => b.s.home - a.s.home || (b.last || '').localeCompare(a.last || '') || a.c.name.localeCompare(b.c.name));
    }
    function taxStats(state, t) {
        const ty = taxYear(t, state.taxStart);
        const s = stats(state, ty.from, ty.to);
        const need = setAside(s.home, state.pct);
        const putAside = state.saved.filter(x => x.date >= ty.from && x.date <= ty.to).reduce((a, x) => a + x.amt, 0);
        return { ty, s, need, putAside, left: need - putAside };
    }

    // ---------- words ----------
    function fmtNum(cents, loc) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(loc || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        return (cents < 0 ? '-' : '') + t;
    }
    function fmtMoney(cents, cur, loc) {
        const t = fmtNum(Math.abs(cents), loc), m = cents < 0 ? '-' : '';
        if (!cur) return m + t;
        return m + (/^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t);
    }
    // money in the client's currency: "485 USD"; '' means your own currency (with your symbol)
    const fmtIn = (cents, c, home, loc) => c ? fmtNum(cents, loc) + ' ' + c : fmtMoney(cents, home, loc);
    const moneyInput = c => (c / 100).toFixed(c % 100 ? 2 : 0);
    function rateInput(r) { const s = (r / 1000000).toFixed(6).replace(/0+$/, '').replace(/\.$/, ''); return s; }
    function fmtRate(r) { const v = r / 1000000; return v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4).replace(/0{1,2}$/, '') : String(Number(v.toPrecision(4))); }
    const pctWords = bp => (bp / 100).toFixed(bp % 100 ? 2 : 0).replace(/(\.\d)0$/, '$1') + '%';
    // the fee as a share of what the client paid, to one decimal place: "3.1%"
    function feeShare(fee, gross) { if (gross <= 0 || fee <= 0) return '0%'; const tenths = mulDiv(fee, 1000, gross); return (tenths / 10).toFixed(tenths % 10 ? 1 : 0) + '%'; }
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    function fmtDate(s, t, opt) {
        opt = opt || {};
        const wd = WD[new Date(dNum(s) * 86400000).getUTCDay()];
        return (opt.noDay ? '' : wd + ' ') + (+s.slice(8, 10)) + ' ' + MON[+s.slice(5, 7) - 1] + (!t || s.slice(0, 4) !== t.slice(0, 4) || opt.year ? ' ' + s.slice(0, 4) : '');
    }
    const monthWords = (key, t) => MONTHS[+key.slice(5, 7) - 1] + (!t || key.slice(0, 4) !== t.slice(0, 4) ? ' ' + key.slice(0, 4) : '');
    const shortMonth = key => MON[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4);
    const rangeWords = (from, to) => fmtDate(from, null, { noDay: true }) + ' to ' + fmtDate(to, null, { noDay: true });
    // "1,850 USD + 120 GBP" from { USD: {gross}, GBP: {gross} }
    function curList(byCur, field, home, loc) {
        const keys = Object.keys(byCur).sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
        return keys.filter(k => byCur[k][field] !== 0).map(k => fmtIn(byCur[k][field], k, home, loc)).join(' + ');
    }
    function pendingWords(pending, home, loc) {
        return Object.keys(pending).sort().filter(k => pending[k] !== 0).map(k => fmtIn(pending[k], k, home, loc)).join(' + ');
    }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    function summaryText(state, key, t, loc) {
        const H = state.cur, fm = c => fmtMoney(c, H, loc || 'en-US');
        const s = stats(state, monthFirst(key), monthLast(key)), L = [];
        L.push('Freelance income for ' + monthWords(key, null));
        L.push('Reached my bank: ' + fm(s.home) + ' from ' + plural(s.count, 'payment', 'payments') + (s.refunds ? ' (' + plural(s.refunds, 'refund', 'refunds') + ' taken off)' : ''));
        const g = curList(s.byCur, 'gross', H, loc || 'en-US'); if (g) L.push('Paid by clients: ' + g);
        const f = curList(s.byCur, 'fee', H, loc || 'en-US'); if (f) L.push('Fees taken: ' + f);
        if (s.pendingCount) L.push('Not in my bank yet: ' + pendingWords(s.pending, H, loc || 'en-US'));
        L.push('Keep ' + pctWords(state.pct) + ' aside for tax: ' + fm(setAside(s.home, state.pct)));
        const tx = taxStats(state, t);
        L.push('', 'Tax year ' + tx.ty.label + ' (' + rangeWords(tx.ty.from, tx.ty.to) + '): ' + fm(tx.s.home) + ' received, keep aside ' + fm(tx.need) + ', put aside so far ' + fm(tx.putAside) + (tx.left > 0 ? ', still to put aside ' + fm(tx.left) : ''));
        const list = inRange(state, monthFirst(key), monthLast(key)).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
        if (list.length) {
            L.push('', 'Payments:');
            list.forEach(p => {
                const c = state.clients.find(x => x.id === p.client), h = homeOf(p);
                L.push('- ' + fmtDate(p.date, null, { noDay: true }) + ' ' + (c ? c.name : 'Client') + ': ' + (p.refund ? 'taken back ' : '') + fmtIn(p.gross, p.cur, H, loc || 'en-US') + (p.fee ? ', fee ' + fmtIn(p.fee, p.cur, H, loc || 'en-US') : '') +
                    (p.cur ? (h == null ? ', not in the bank yet' : ', ' + fm(h) + ' in the bank') : '') + (p.note ? ' (' + p.note + ')' : ''));
            });
        }
        return L.join('\n');
    }
    const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) || (/^[=+\-@]/.test(s) && !/^-\d+(\.\d+)?$/.test(s)) ? '"' + s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"' : s; };
    function csv(state, from, to) {
        const head = ['Date', 'Client', 'Paid by client', 'Currency', 'Fee', 'After fee', 'Exchange rate', 'Reached your bank', 'Money taken back', 'Note'];
        const rows = inRange(state, from, to).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).map(p => {
            const c = state.clients.find(x => x.id === p.client), h = homeOf(p), r = rateOf(p), sg = sign(p);
            return [p.date, c ? c.name : '', moneyInput(sg * p.gross), p.cur || 'Own currency' + (state.cur ? ' (' + state.cur + ')' : ''), moneyInput(sg * p.fee), moneyInput(sg * net(p)),
                r ? rateInput(r) : '', h == null ? 'Not yet' : moneyInput(h), p.refund ? 'Yes' : '', p.note];
        });
        return [head].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, clients: [], pays: [], saved: [], cur: '', pct: 1000, taxStart: '01-01' });
    const str = (x, max) => typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : '';
    const cents = x => Number.isInteger(x) && x >= 0 && x <= MAXC;
    const rid = p => p + Math.random().toString(36).slice(2, 9);
    function uniq(list) { const ids = new Set(); list.forEach(x => { while (ids.has(x.id)) x.id += 'x'; ids.add(x.id); }); return list; }
    function cleanClient(c) {
        if (!c || typeof c !== 'object') return null;
        const name = str(c.name, 50); if (!name) return null;
        return { id: str(c.id, 40) || rid('c'), name, cur: CURRENCIES.includes(c.cur) ? c.cur : '', fee: typeof c.fee === 'string' ? c.fee.trim().slice(0, 20) : '' };
    }
    function cleanPay(p, ids) {
        if (!p || typeof p !== 'object' || !isDate(p.date) || !cents(p.gross) || p.gross === 0 || !cents(p.fee) || p.fee >= p.gross || !ids.has(p.client)) return null;
        const cur = CURRENCIES.includes(p.cur) ? p.cur : '';
        const rate = cur && Number.isInteger(p.rate) && p.rate > 0 && p.rate <= MAXRATE ? p.rate : 0;
        const home = cur && !rate && cents(p.home) ? p.home : null;
        return { id: str(p.id, 40) || rid('p'), client: p.client, date: p.date, cur, gross: p.gross, fee: p.fee, feePct: Number.isInteger(p.feePct) && p.feePct > 0 && p.feePct < 10000 ? p.feePct : null,
            rate, home, refund: p.refund === true, note: str(p.note, 120) };
    }
    function cleanSaved(x) {
        if (!x || typeof x !== 'object' || !isDate(x.date) || !cents(x.amt) || x.amt === 0) return null;
        return { id: str(x.id, 40) || rid('s'), date: x.date, amt: x.amt, note: str(x.note, 60) };
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.clients) || !Array.isArray(s.pays)) return null;
        const o = emptyState();
        o.clients = uniq(s.clients.slice(0, 200).map(cleanClient).filter(Boolean));
        const ids = new Set(o.clients.map(c => c.id));
        o.pays = uniq(s.pays.slice(0, 5000).map(p => cleanPay(p, ids)).filter(Boolean));
        o.saved = uniq((Array.isArray(s.saved) ? s.saved : []).slice(0, 1000).map(cleanSaved).filter(Boolean));
        if (typeof s.cur === 'string' && s.cur.length <= 4) o.cur = s.cur;
        if (Number.isInteger(s.pct) && s.pct >= 0 && s.pct <= 6000) o.pct = s.pct;
        if (TAX_YEARS[s.taxStart]) o.taxStart = s.taxStart;
        return o;
    }
    // a sensible tax year from the time zone: Pakistan and Australia July, India April, UK 6 April
    function guessTaxStart(tz) {
        tz = String(tz || '');
        if (/^(Asia\/Karachi|Australia\/|Africa\/(Cairo|Nairobi)|Pacific\/Auckland)/.test(tz)) return /Auckland/.test(tz) ? '04-01' : '07-01';
        if (/^(Asia\/(Kolkata|Calcutta|Dhaka)|Asia\/Tokyo)/.test(tz)) return /Dhaka/.test(tz) ? '07-01' : '04-01';
        if (/^Europe\/London/.test(tz)) return '04-06';
        return '01-01';
    }

    const api = { MAXC, CURRENCIES, TAX_YEARS, parseNum, parseMoney, parsePct, parseFee, parseRate, mulDiv, isDate, today, addDays, daysBetween, ym, addMonth, monthFirst, monthLast, taxYear,
        net, sign, homeOf, rateOf, stats, setAside, firstMonth, average, months, clientStats, taxStats, fmtNum, fmtMoney, fmtIn, moneyInput, rateInput, fmtRate, pctWords, feeShare,
        fmtDate, monthWords, shortMonth, rangeWords, curList, pendingWords, plural, summaryText, csv, emptyState, cleanClient, cleanPay, cleanSaved, cleanState, guessTaxStart };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.INCOME = api;
})(typeof window !== 'undefined' ? window : this);
