// Daily Cash Book for Small Shops: the maths and the words, with no page code, so tests.js can check it in node.
// Amounts are whole cents (hundredths) so totals are always exact. Days are calendar days ('2026-10-22').
(function (root) {
    'use strict';
    const MAX = 999999999999; // 9,999,999,999.99 in cents
    const SYMBOLS = ['', 'Rs', '₹', '$', '€', '£', '৳', 'AED', 'SAR', 'RM', 'Rp', '₦', 'KSh', '₵', 'R', '₱', '¥', '₺', 'E£', 'R$', 'A$', 'C$', 'CHF', 'kr', 'zł'];

    // "2,500" "2.500" "2 500" "1,00,000" "12.5" "12,50" "$40" "Rs 1500" -> cents, or { error }. opts.zero allows 0 (a cash count).
    function parseAmount(text, opts) {
        opts = opts || {};
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: opts.zero ? 'Type the cash you counted, such as 18200.' : 'Type the amount, such as 2500.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₦₱৳₺])\s*/i, '').replace(/\s*(rs\.?|\/-|[$€£₹¥₦₱৳₺])$/i, '').trim();
        if (/^[-−–]/.test(s)) return { error: 'Type the amount without a minus sign.' };
        if (/^\+/.test(s)) s = s.slice(1).trim();
        if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return { error: 'Type a number, such as 2500 or 12.50.' };
        const bad = { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
        let whole, frac = '';
        if (/\s/.test(s)) {
            const parts = s.split(/\s+/), last = parts[parts.length - 1], dm = last.match(/^(\d{3})([.,]\d{0,2})?$/);
            if (!/^\d{1,3}$/.test(parts[0]) || !parts.slice(1, -1).every(p => /^\d{3}$/.test(p)) || !dm) return bad;
            whole = parts.join('').replace(/[.,]\d*$/, ''); frac = dm[2] ? dm[2].slice(1) : '';
        } else {
            const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
            let dec = null; // which mark is the decimal point
            if (dots && commas) dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
            else if (dots + commas === 1) {
                const mark = dots ? '.' : ',', [a, b] = s.split(mark);
                dec = (b.length === 3 && /^\d{1,3}$/.test(a) && a !== '0') ? null : mark;
            }
            let intPart = s, fracPart = '';
            if (dec) { const i = s.lastIndexOf(dec); intPart = s.slice(0, i); fracPart = s.slice(i + 1); }
            const th = dec === '.' ? ',' : dec === ',' ? '.' : (dots ? '.' : ',');
            if (intPart.includes(dec || '\u0000')) return bad;
            if (intPart.includes(th)) {
                const re = new RegExp('^\\d{1,3}(\\' + th + '\\d{3})+$'), ind = new RegExp('^\\d{1,2}(\\' + th + '\\d{2})*\\' + th + '\\d{3}$');
                if (!re.test(intPart) && !ind.test(intPart)) return bad;
            }
            if (!/^\d*$/.test(fracPart)) return bad;
            whole = intPart.split(th).join(''); frac = fracPart;
            if (whole === '' && frac === '') return { error: 'Type a number, such as 2500 or 12.50.' };
        }
        if (frac.length > 2) return { error: 'Use at most 2 numbers after the decimal point, such as 12.50.' };
        whole = whole.replace(/^0+(?=\d)/, '') || '0';
        if (whole.length > 10) return { error: 'That amount is too big. The most is 9,999,999,999.99.' };
        const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
        if (cents === 0 && !opts.zero) return { error: 'Type an amount more than 0.' };
        if (cents > MAX) return { error: 'That amount is too big. The most is 9,999,999,999.99.' };
        return { cents };
    }

    // 1850000 -> "18,500" (lakh grouping "1,85,000" for rupees and taka); negative amounts get a minus sign
    function fmt(cents, cur) {
        const n = Math.abs(cents), locale = localeFor(cur);
        let t;
        try { t = new Intl.NumberFormat(locale, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        if (cur) t = /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
        return (cents < 0 ? '−' : '') + t;
    }
    const localeFor = cur => (['Rs', '₹', '৳'].includes(cur) ? 'en-IN' : 'en-US');

    // notes and coins for counting the drawer, by currency symbol (values in cents)
    const DENOMS = {
        Rs: [500000, 100000, 50000, 10000, 5000, 2000, 1000, 500, 200, 100],
        '₹': [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100],
        '৳': [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100],
        $: [10000, 5000, 2000, 1000, 500, 100, 25, 10, 5, 1],
        '€': [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1],
        '£': [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1],
        AED: [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100, 50, 25],
        SAR: [50000, 20000, 10000, 5000, 1000, 500, 100, 50, 25]
    };
    const GENERIC = [500000, 100000, 50000, 10000, 5000, 2000, 1000, 500, 200, 100];
    const denomsFor = cur => DENOMS[cur] || GENERIC;

    // entry types: where the money goes and whether it passes through the drawer
    const TYPES = {
        sale: { label: 'Cash sale', short: 'Cash sale', dir: 1, drawer: true },
        card: { label: 'Card or mobile sale', short: 'Card/mobile sale', dir: 1, drawer: false },
        in: { label: 'Other cash in', short: 'Cash in', dir: 1, drawer: true },
        stock: { label: 'Bought stock', short: 'Stock', dir: -1, drawer: true },
        exp: { label: 'Expense', short: 'Expense', dir: -1, drawer: true },
        owner: { label: 'Owner took', short: 'Owner took', dir: -1, drawer: true }
    };
    const CATS = ['Rent', 'Electricity', 'Gas', 'Wages', 'Transport', 'Tea and food', 'Repairs', 'Phone and internet', 'Shopping bags', 'Committee', 'Other'];

    // dates
    const pad = n => String(n).padStart(2, '0');
    const dayStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    function toDate(s) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d, 12); t.setFullYear(y); return t; }
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= '1900-01-01' && dayStr(toDate(s)) === s;
    function addDays(s, n) { const d = toDate(s); d.setDate(d.getDate() + n); return dayStr(d); }
    const weekStart = s => addDays(s, -((toDate(s).getDay() + 6) % 7)); // Monday
    const monthEnd = ym => { const [y, m] = ym.split('-').map(Number); return ym + '-' + pad(new Date(y, m, 0).getDate()); };
    function niceDate(s, withDay) {
        try { return toDate(s).toLocaleDateString('en-GB', withDay ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s; }
    }
    const shortDate = s => { try { return toDate(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return s; } };
    const monthName = ym => { try { return toDate(ym + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); } catch (e) { return ym; } };
    const plural = (n, one, many) => n.toLocaleString('en') + ' ' + (n === 1 ? one : many);
    const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);

    // ---- one day ----
    function dayTotals(day) {
        const t = { sale: 0, card: 0, in: 0, stock: 0, exp: 0, owner: 0, byCat: {}, lines: 0 };
        (day && day.items || []).forEach(it => {
            t[it.t] += it.c; t.lines++;
            if (it.t === 'exp') { const k = it.cat || 'Other'; t.byCat[k] = (t.byCat[k] || 0) + it.c; }
        });
        t.cashIn = t.sale + t.in;
        t.cashOut = t.stock + t.exp + t.owner;
        t.sales = t.sale + t.card;
        t.net = t.sales - t.stock - t.exp; // sales minus stock and expenses (owner's money taken is not a cost)
        return t;
    }
    const hasData = day => !!day && ((day.items && day.items.length) || day.count != null || day.open != null);
    const dayKeys = state => Object.keys(state.days).filter(k => hasData(state.days[k])).sort();

    // walks every day in order: opening = typed, or the closing of the last day before it (the count if counted, else what should be there)
    function chain(state) {
        const out = {}; let prev = null;
        dayKeys(state).forEach(k => {
            const day = state.days[k], tot = dayTotals(day);
            let open, from;
            if (day.open != null) { open = day.open; from = 'typed'; }
            else if (prev) { open = prev.close; from = prev.count != null ? 'count' : 'expected'; }
            else { open = 0; from = 'none'; }
            const expected = open + tot.cashIn - tot.cashOut;
            const count = day.count != null ? day.count : null;
            const r = { key: k, open, from, prevKey: prev ? prev.key : null, prevClose: prev ? prev.close : null, tot, expected, count,
                        diff: count != null ? count - expected : null, close: count != null ? count : expected };
            out[k] = r; prev = r;
        });
        return out;
    }
    // the day as the page shows it, also for a day with nothing written yet
    function dayView(state, key, ch) {
        ch = ch || chain(state);
        if (ch[key]) return ch[key];
        const before = Object.keys(ch).filter(k => k < key).sort().pop();
        const p = before ? ch[before] : null;
        const tot = dayTotals(null);
        const open = p ? p.close : 0;
        return { key, open, from: p ? (p.count != null ? 'count' : 'expected') : 'none', prevKey: p ? p.key : null, prevClose: p ? p.close : null,
                 tot, expected: open, count: null, diff: null, close: open, empty: true };
    }
    // "250 short" / "300 over" / "matches"
    function diffWords(diff, cur) {
        if (diff == null) return '';
        if (diff === 0) return 'Matches exactly';
        return fmt(Math.abs(diff), cur) + (diff < 0 ? ' short' : ' over');
    }

    // ---- a week or a month ----
    function summarize(state, from, to, ch) {
        ch = ch || chain(state);
        const s = { from, to, days: [], sale: 0, card: 0, in: 0, stock: 0, exp: 0, owner: 0, byCat: {}, counted: 0, diff: 0, shortDays: 0, overDays: 0 };
        Object.keys(ch).sort().forEach(k => {
            if (k < from || k > to) return;
            const d = ch[k]; s.days.push(d);
            ['sale', 'card', 'in', 'stock', 'exp', 'owner'].forEach(f => { s[f] += d.tot[f]; });
            Object.keys(d.tot.byCat).forEach(c => { s.byCat[c] = (s.byCat[c] || 0) + d.tot.byCat[c]; });
            if (d.count != null) { s.counted++; s.diff += d.diff; if (d.diff < 0) s.shortDays++; if (d.diff > 0) s.overDays++; }
        });
        s.sales = s.sale + s.card;
        s.net = s.sales - s.stock - s.exp;
        s.cats = Object.keys(s.byCat).sort((a, b) => s.byCat[b] - s.byCat[a] || a.localeCompare(b)).map(c => ({ cat: c, c: s.byCat[c] }));
        const lastDay = s.days[s.days.length - 1];
        s.endCash = lastDay ? lastDay.close : null;
        return s;
    }
    // the periods the Totals list offers: this week, last week, this month, last month, then older months that have entries
    function periods(state, today) {
        const ws = weekStart(today), lws = addDays(ws, -7), ym = today.slice(0, 7);
        const lm = (() => { const d = toDate(ym + '-01'); d.setMonth(d.getMonth() - 1); return dayStr(d).slice(0, 7); })();
        const list = [
            { id: 'w:' + ws, label: 'This week (' + shortDate(ws) + ' to ' + shortDate(addDays(ws, 6)) + ')', title: 'Week of ' + niceDate(ws), from: ws, to: addDays(ws, 6) },
            { id: 'w:' + lws, label: 'Last week (' + shortDate(lws) + ' to ' + shortDate(addDays(lws, 6)) + ')', title: 'Week of ' + niceDate(lws), from: lws, to: addDays(lws, 6) },
            { id: 'm:' + ym, label: 'This month (' + monthName(ym) + ')', title: monthName(ym), from: ym + '-01', to: monthEnd(ym) },
            { id: 'm:' + lm, label: 'Last month (' + monthName(lm) + ')', title: monthName(lm), from: lm + '-01', to: monthEnd(lm) }
        ];
        const months = [...new Set(dayKeys(state).map(k => k.slice(0, 7)))].filter(m => m < lm).sort().reverse();
        months.forEach(m => list.push({ id: 'm:' + m, label: monthName(m), title: monthName(m), from: m + '-01', to: monthEnd(m) }));
        return list;
    }

    // ---- words to copy, email or print ----
    function itemWords(it, cur) {
        const ty = TYPES[it.t];
        let w = (it.t === 'exp' ? (it.cat || 'Other') : ty.label) + ': ' + fmt(it.c, cur);
        if (it.note) w += ' (' + it.note + ')';
        return w;
    }
    function dayText(state, key, cur, shop, ch) {
        const d = dayView(state, key, ch), t = d.tot, L = [];
        L.push((shop ? shop + ', cash for ' : 'Shop cash for ') + niceDate(key, true));
        L.push('Opening cash: ' + fmt(d.open, cur));
        if (t.sale) L.push('+ Cash sales: ' + fmt(t.sale, cur));
        if (t.in) L.push('+ Other cash in: ' + fmt(t.in, cur));
        if (t.stock) L.push('− Bought stock: ' + fmt(t.stock, cur));
        if (t.exp) L.push('− Expenses: ' + fmt(t.exp, cur) + ' (' + Object.keys(t.byCat).map(c => c + ' ' + fmt(t.byCat[c], cur)).join(', ') + ')');
        if (t.owner) L.push('− Owner took: ' + fmt(t.owner, cur));
        L.push('Cash should be: ' + fmt(d.expected, cur));
        if (d.count != null) L.push('Cash counted: ' + fmt(d.count, cur) + (d.diff === 0 ? ' (matches exactly)' : ' (' + diffWords(d.diff, cur) + ')'));
        else L.push('Cash not counted yet');
        L.push('');
        L.push('Sales: ' + fmt(t.sales, cur) + (t.card ? ' (cash ' + fmt(t.sale, cur) + ', card or mobile ' + fmt(t.card, cur) + ')' : ''));
        L.push('Sales minus stock and expenses: ' + fmt(t.net, cur));
        if ((state.days[key] || {}).items && state.days[key].items.length) {
            L.push(''); L.push('Entries:');
            state.days[key].items.forEach(it => L.push('- ' + (it.at ? it.at + ' ' : '') + itemWords(it, cur)));
        }
        return L.join('\n');
    }
    function periodLines(s, cur) {
        const L = [];
        L.push('Sales: ' + fmt(s.sales, cur) + (s.card ? ' (cash ' + fmt(s.sale, cur) + ', card or mobile ' + fmt(s.card, cur) + ')' : ''));
        if (s.in) L.push('Other cash in: ' + fmt(s.in, cur));
        L.push('Bought stock: ' + fmt(s.stock, cur));
        L.push('Expenses: ' + fmt(s.exp, cur));
        s.cats.forEach(c => L.push('   ' + c.cat + ': ' + fmt(c.c, cur)));
        L.push('Sales minus stock and expenses: ' + fmt(s.net, cur));
        L.push('Owner took: ' + fmt(s.owner, cur));
        if (s.counted) L.push('Cash count: ' + (s.diff === 0 ? 'no difference' : diffWords(s.diff, cur) + ' in total') + ' over ' + plural(s.counted, 'counted day', 'counted days'));
        else L.push('Cash count: no day counted');
        if (s.endCash != null) L.push('Cash at the end: ' + fmt(s.endCash, cur));
        return L;
    }
    function periodText(state, p, cur, shop, ch, withDays) {
        const s = summarize(state, p.from, p.to, ch), L = [];
        L.push((shop ? shop + ' cash book: ' : 'Cash book: ') + p.title + ' (' + niceDate(p.from) + ' to ' + niceDate(p.to) + ')');
        L.push('Days with entries: ' + s.days.length);
        if (!s.days.length) { L.push('Nothing written in these days.'); return L.join('\n'); }
        L.push(...periodLines(s, cur));
        if (withDays !== false) {
            L.push(''); L.push('Day by day:');
            s.days.forEach(d => L.push(shortDate(d.key) + ': sales ' + fmt(d.tot.sales, cur) + ', stock ' + fmt(d.tot.stock, cur) + ', expenses ' + fmt(d.tot.exp, cur) +
                ', owner took ' + fmt(d.tot.owner, cur) + ', cash should be ' + fmt(d.expected, cur) + (d.count != null ? ', counted ' + fmt(d.count, cur) + (d.diff ? ' (' + diffWords(d.diff, cur) + ')' : ' (matches)') : ', not counted')));
        }
        return L.join('\n');
    }

    // ---- saved data ----
    const emptyState = () => ({ v: 1, shop: '', days: {}, cats: [] });
    const okCents = (c, zero) => Number.isInteger(c) && c >= (zero ? 0 : 1) && c <= MAX;
    function normalize(raw) {
        if (!raw || typeof raw !== 'object' || !raw.days || typeof raw.days !== 'object' || Array.isArray(raw.days)) throw new Error('not a cash book');
        const st = emptyState();
        st.shop = clean(raw.shop, 60);
        const ids = new Set();
        Object.keys(raw.days).forEach(k => {
            if (!isDay(k)) return;
            const d = raw.days[k]; if (!d || typeof d !== 'object') return;
            const day = { open: okCents(d.open, true) ? d.open : null, count: okCents(d.count, true) ? d.count : null, items: [], notes: {} };
            (Array.isArray(d.items) ? d.items : []).forEach(it => {
                if (!it || !TYPES[it.t] || !okCents(it.c)) return;
                let id = clean(it.id, 40) || 'i' + Math.random().toString(36).slice(2, 10);
                while (ids.has(id)) id += 'x';
                ids.add(id);
                day.items.push({ id, t: it.t, c: it.c, cat: it.t === 'exp' ? (clean(it.cat, 40) || 'Other') : '', note: clean(it.note, 120), at: /^\d{2}:\d{2}$/.test(it.at) ? it.at : '' });
            });
            if (d.notes && typeof d.notes === 'object') Object.keys(d.notes).forEach(v => { const n = d.notes[v]; if (/^\d+$/.test(v) && Number.isInteger(n) && n > 0 && n <= 99999) day.notes[v] = n; });
            if (hasData(day) || Object.keys(day.notes).length) st.days[k] = day;
        });
        if (Array.isArray(raw.cats)) raw.cats.forEach(c => { c = clean(c, 40); if (c && !st.cats.some(x => x.toLowerCase() === c.toLowerCase())) st.cats.push(c); });
        return st;
    }

    const api = { MAX, SYMBOLS, TYPES, CATS, parseAmount, fmt, localeFor, denomsFor, dayStr, toDate, isDay, addDays, weekStart, monthEnd, niceDate, shortDate, monthName,
        plural, clean, dayTotals, hasData, dayKeys, chain, dayView, diffWords, summarize, periods, itemWords, dayText, periodLines, periodText, emptyState, normalize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CashBook = api;
})(this);
