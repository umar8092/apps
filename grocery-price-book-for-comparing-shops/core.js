// Grocery Price Book: the maths and the words. No page code here, so tests.js can run it in node.
// Money is kept in whole cents and pack sizes in thousandths (1.5 kg = 1500), so what is saved is exact.
// Each shop's newest price for an item is the one that counts; the cheapest of those is the answer.
(function (root) {
    'use strict';
    const MAXC = 100000000000;     // money up to 1,000,000,000
    const MAXQ = 1000000000;       // pack sizes up to 1,000,000 (kg, L, items...)
    const MAXK = 999;              // packs in one deal
    const DAY = 86400000;
    const OLD = 90;                // a price older than 90 days may have changed

    // Every pack unit, in its kind's base unit: grams, millilitres or items.
    const UNITS = {
        g: { k: 'w', f: 1, label: 'g' }, kg: { k: 'w', f: 1000, label: 'kg' }, lb: { k: 'w', f: 453.59237, label: 'lb' }, oz: { k: 'w', f: 28.349523125, label: 'oz' },
        ml: { k: 'v', f: 1, label: 'ml' }, l: { k: 'v', f: 1000, label: 'L' }, floz: { k: 'v', f: 29.5735295625, label: 'fl oz' }, gal: { k: 'v', f: 3785.411784, label: 'US gallon' },
        pc: { k: 'c', f: 1, label: 'items' }, dz: { k: 'c', f: 12, label: 'dozen' }
    };
    const UNIT_ORDER = { w: ['kg', 'g', 'lb', 'oz'], v: ['l', 'ml', 'floz', 'gal'], c: ['pc', 'dz'] };
    // What an item's prices are compared "per".
    const PER = {
        kg: { k: 'w', f: 1000, word: 'kg', unit: 'kg' }, '100g': { k: 'w', f: 100, word: '100 g', unit: 'g' }, lb: { k: 'w', f: 453.59237, word: 'lb', unit: 'lb' },
        l: { k: 'v', f: 1000, word: 'litre', unit: 'l' }, '100ml': { k: 'v', f: 100, word: '100 ml', unit: 'ml' },
        pc: { k: 'c', f: 1, word: 'item', unit: 'pc' }, dz: { k: 'c', f: 12, word: 'dozen', unit: 'pc' }
    };
    const PER_ORDER = ['kg', '100g', 'lb', 'l', '100ml', 'pc', 'dz'];
    const PER_LABEL = { kg: 'per kg (weight)', '100g': 'per 100 g (small packs: tea, spices)', lb: 'per lb (weight)', l: 'per litre (liquids)', '100ml': 'per 100 ml (small bottles)', pc: 'per item (eggs, nappies, soap)', dz: 'per dozen (eggs, fruit)' };

    // ---------- typed numbers ----------
    // "12,345.6", "12.345,6", "12 345", "1,00,000" and "Rs 23.5" all work. Returns the number times 10^dec as a whole number.
    // "12,345.6", "12.345,6", "12 345", "1,00,000" and "Rs 23.5" all work. Returns the number times 10^dec as a whole number.
    function parseNum(text, dec, opt) {
        opt = opt || {};
        const bad = opt.bad || 'That number looks mistyped. Type it like 12345 or 12345.6.';
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: opt.blank || 'Type a number.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴]|kgs?|kilos?|g|grams?|gm|ml|l|ltrs?|litres?|liters?|lbs?|oz|items?|pcs|pieces?)$/i, '').trim();
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
        const n = Number(intPart || '0') * Math.pow(10, dec) + Number((fracPart + '0000').slice(0, dec) || '0');
        if (opt.max != null && n > opt.max) return { error: opt.big || 'That number is too big.' };
        if (opt.positive && n <= 0) return { error: opt.zero || 'Type a number bigger than 0.' };
        return { n };
    }
    const parseGas = t => parseNum(t, 3, { max: MAXG, positive: true, blank: 'Type how much gas, such as 11.8.', zero: 'Type an amount bigger than 0.', big: 'That is more gas than any cylinder holds.', bad: 'Type an amount such as 11.8 or 14.2.', decimals: 'Use at most 3 decimal places.', minus: 'Type it without a minus sign.' });
    const parseMoney = t => parseNum(t, 2, { max: MAXC, positive: true, blank: 'Type the price, such as 2690.', zero: 'Type a price bigger than 0.', big: 'That price is too big.', bad: 'Type a price such as 2690 or 2689.50.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.' });
    const SIZE_UNIT = { kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', lb: 'lb', lbs: 'lb', oz: 'oz',
        ml: 'ml', l: 'l', ltr: 'l', ltrs: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l', pc: 'pc', pcs: 'pc', item: 'pc', items: 'pc', piece: 'pc', pieces: 'pc', dozen: 'dz' };
    // "500 g" or "1.5L" also returns the unit typed (u), so the page can pick it
    function parseSize(t) {
        const m = String(t == null ? '' : t).trim().match(/^(.*?)\s*([a-z]+)\.?$/i), u = m && SIZE_UNIT[m[2].toLowerCase()];
        const r = parseSizeNum(u ? m[1] : t);
        if (u && !r.error) r.u = u;
        return r;
    }
    const parseSizeNum = t => parseNum(t, 3, { max: MAXQ, positive: true, blank: 'Type the pack size, such as 5.', zero: 'Type a size bigger than 0.', big: 'That pack is too big.', bad: 'Type a size such as 5 or 1.5.', decimals: 'Use at most 3 decimal places.', minus: 'Type it without a minus sign.' });
    function parsePacks(t) {
        const s = String(t == null ? '' : t).replace(/\s*(packs?|x|×)$/i, '').trim();
        if (!s) return { n: 1 };
        if (!/^\d+$/.test(s)) return { error: 'Type a whole number of packs, such as 2.' };
        const n = Number(s);
        if (n < 1) return { error: 'Type at least 1 pack.' };
        if (n > MAXK) return { error: 'Type at most ' + MAXK + ' packs.' };
        return { n };
    }
    const cleanName = (t, max) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, max);
    const same = (a, b) => cleanName(a, 80).toLocaleLowerCase() === cleanName(b, 80).toLocaleLowerCase();

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    function dayNum(s) { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); }
    function dayStr(n) { const d = new Date(n * DAY); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number(s.slice(0, 4)) >= 1990 && dayStr(dayNum(s)) === s;
    const localDay = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    const diff = (a, b) => dayNum(b) - dayNum(a);
    function checkDay(d, today) {
        if (!d) return 'Pick the date you saw this price.';
        if (!isDay(d)) return 'That date does not exist.';
        if (d > today) return 'Pick today or an earlier day.';
        return null;
    }

    // ---------- prices ----------
    // how much of the item one entry is, in the "per" amounts (5 L compared per litre = 5)
    const amount = (e, per) => e.q / 1000 * UNITS[e.u].f * (e.k || 1) / PER[per].f;
    // the price per kg, litre, item... in cents (not rounded)
    const unitPrice = (e, per) => e.c / amount(e, per);
    const sameNum = (a, b) => Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 1e-9;
    // "later" = newer date, or the same date typed later
    const later = (a, b) => a.d !== b.d ? a.d > b.d : (a.n || 0) > (b.n || 0);
    // each shop's newest price; ignore = an entry being edited
    function latestByShop(item, ignore) {
        const m = {};
        item.entries.forEach(e => { if (e.id !== ignore && (!m[e.s] || later(e, m[e.s]))) m[e.s] = e; });
        return m;
    }
    function prevAtShop(item, e, ignore) {
        let p = null;
        item.entries.forEach(x => { if (x.id !== e.id && x.id !== ignore && x.s === e.s && later(e, x) && (!p || later(x, p))) p = x; });
        return p;
    }
    // the answer for one item: each shop's newest price, cheapest first
    function analyse(item, today) {
        const m = latestByShop(item);
        const rows = Object.keys(m).map(s => {
            const e = m[s], age = diff(e.d, today);
            return { s, e, up: unitPrice(e, item.per), age, old: age > OLD, prev: prevAtShop(item, e) };
        });
        rows.sort((a, b) => sameNum(a.up, b.up) ? (later(a.e, b.e) ? -1 : 1) : a.up - b.up);
        const best = rows[0] || null;
        rows.forEach(r => { r.pct = best ? pct(r.up, best.up) : 0; r.cheapest = !!best && sameNum(r.up, best.up); r.change = r.prev ? pct(r.up, unitPrice(r.prev, item.per)) : null; });
        let lowest = null;
        item.entries.forEach(e => { const up = unitPrice(e, item.per); if (!lowest || up < lowest.up - 1e-9 || (sameNum(up, lowest.up) && later(e, lowest.e))) lowest = { e, up }; });
        return { rows, best, lowest, ties: rows.filter(r => r.cheapest) };
    }
    // a signed percentage, a compared with b: 538 vs 500 = 7.6
    const pct = (a, b) => sameNum(a, b) ? 0 : (a - b) / b * 100;

    // ---------- words ----------
    function fmtNum(n, loc, max) {
        try { return new Intl.NumberFormat(loc || undefined, { maximumFractionDigits: max == null ? 3 : max }).format(n); } catch (e) { return String(n); }
    }
    function fmtMoney(cents, cur, loc) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(loc || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        t = (cents < 0 ? '-' : '') + t;
        return addCur(t, cur);
    }
    const addCur = (t, cur) => !cur ? t : /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    // a price per kg or item: to the cent, or more decimals when it is below 1 (0.0035 a gram)
    function fmtUnit(up, cur, loc) {
        if (up >= 99.5) return fmtMoney(Math.round(up), cur, loc);
        let t;
        try { t = new Intl.NumberFormat(loc || undefined, { minimumFractionDigits: 2, maximumSignificantDigits: 3, maximumFractionDigits: 4 }).format(up / 100); }
        catch (e) { t = (up / 100).toPrecision(3); }
        return addCur(t, cur);
    }
    const perText = (up, per, cur, loc) => fmtUnit(up, cur, loc) + ' per ' + PER[per].word;
    function packText(e, loc) {
        const u = UNITS[e.u], size = fmtNum(e.q / 1000, loc) + ' ' + (e.u === 'pc' ? (e.q === 1000 ? 'item' : 'items') : u.label);
        return (e.k > 1 ? e.k + ' × ' : '') + size;
    }
    const priceText = (e, cur, loc) => fmtMoney(e.c, cur, loc) + ' for ' + packText(e, loc);
    function pctText(p) {
        const a = Math.abs(p);
        return a < 0.5 ? 'less than 1%' : (a < 9.95 ? fmtNum(Math.round(a * 10) / 10, 'en-US', 1) : String(Math.round(a))) + '%';
    }
    function fmtDate(s, loc, opt) {
        const o = { day: 'numeric', month: 'short', timeZone: 'UTC' };
        if (opt) o.year = 'numeric';
        try { return new Intl.DateTimeFormat(loc || 'en-GB', o).format(new Date(dayNum(s) * DAY)); } catch (e) { return s; }
    }
    function ago(n) {
        if (n <= 0) return 'today';
        if (n === 1) return 'yesterday';
        if (n < 60) return n + ' days ago';
        const m = Math.round(n / 30.44);
        return m < 24 ? m + ' months ago' : Math.round(n / 365.25) + ' years ago';
    }
    const shopName = (state, id) => { const s = state.shops.find(x => x.id === id); return s ? s.name : 'a shop'; };

    // What a price typed in the shop means, as lines of { tone, text }.
    // draft: { s, c, q, u, k, d, sale }; editId: the entry being changed, left out of the comparison.
    function verdict(state, item, draft, today, loc, editId) {
        const cur = state.cur, per = item.per, up = unitPrice(draft, per), out = [];
        const yr = d => d.slice(0, 4) !== today.slice(0, 4);
        const at = e => shopName(state, e.s) + ' (' + priceText(e, cur, loc) + ', ' + fmtDate(e.d, loc, yr(e.d)) + ')';
        const m = latestByShop(item, editId);
        const others = Object.keys(m).filter(s => s !== draft.s).map(s => ({ e: m[s], up: unitPrice(m[s], per) }))
            .sort((a, b) => sameNum(a.up, b.up) ? (later(a.e, b.e) ? -1 : 1) : a.up - b.up);
        out.push({ tone: 'info', text: 'That is ' + perText(up, per, cur, loc) + '.' });
        if (!others.length) {
            out.push({ tone: 'first', text: item.entries.some(e => e.id !== editId) ? 'No other shop has a price for ' + item.name + ' yet. Add one to compare.' : 'This is the first price for ' + item.name + '. Add prices from other shops to compare.' });
        } else {
            const b = others[0], p = pct(up, b.up);
            // what this same amount would cost at the cheapest other shop
            const there = Math.round(b.up * amount(draft, per)), gap = Math.abs(draft.c - there);
            const old = diff(b.e.d, today) > OLD ? ' That price is ' + ago(diff(b.e.d, today)) + ', so it may have changed.' : '';
            if (p === 0 || gap === 0) out.push({ tone: 'same', text: 'Same as the cheapest other shop: ' + at(b.e) + '.' + old });
            else if (p < 0) out.push({ tone: 'good', text: 'Cheapest you have seen: ' + pctText(p) + ' less than ' + at(b.e) + '. You save ' + fmtMoney(gap, cur, loc) + ' on ' + packText(draft, loc) + '.' + old });
            else out.push({ tone: 'bad', text: 'Cheaper at ' + at(b.e) + '. This price is ' + pctText(p) + ' more: the same ' + packText(draft, loc) + ' would cost about ' + fmtMoney(there, cur, loc) + ' there, ' + fmtMoney(gap, cur, loc) + ' less.' + old });
        }
        // the same shop's last price (for a sale price: the last price that was not a sale)
        let prev = null;
        item.entries.forEach(x => {
            if (x.id === editId || x.s !== draft.s || x.d > draft.d || (draft.sale && x.sale)) return;
            if (!prev || later(x, prev)) prev = x;
        });
        if (prev) {
            const p = pct(up, unitPrice(prev, per)), word = p === 0 ? 'the same' : pctText(p) + (p > 0 ? ' more' : ' less');
            const where = shopName(state, draft.s);
            if (draft.sale) out.push({ tone: p < 0 ? 'good' : 'bad', text: p < 0 ? 'The sale is real: ' + word + ' than the usual price at ' + where + ' (' + priceText(prev, cur, loc) + ' on ' + fmtDate(prev.d, loc, yr(prev.d)) + ').' : 'This "sale" is not cheaper: ' + word + ' than the usual price at ' + where + ' (' + priceText(prev, cur, loc) + ' on ' + fmtDate(prev.d, loc, yr(prev.d)) + ').' });
            else out.push({ tone: 'info', text: 'At ' + where + ' last time (' + fmtDate(prev.d, loc, yr(prev.d)) + '): ' + priceText(prev, cur, loc) + '. Now ' + word + (p === 0 ? '.' : '.') });
        }
        // the lowest ever recorded, when it is lower than all of the above
        let low = null;
        item.entries.forEach(x => { if (x.id !== editId) { const u = unitPrice(x, per); if (!low || u < low.up - 1e-9) low = { e: x, up: u }; } });
        if (low && low.up < up - 1e-9 && (!others.length || low.up < others[0].up - 1e-9) && !(prev && low.e === prev))
            out.push({ tone: 'info', text: 'Lowest you have recorded: ' + perText(low.up, per, cur, loc) + ' at ' + at(low.e) + '.' });
        return out;
    }

    // Where each item is cheapest, grouped by shop. Items with prices from only one shop are marked.
    function plan(state, today) {
        const groups = {};
        state.items.forEach(item => {
            const a = analyse(item, today);
            if (!a.best) return;
            const s = a.best.s;
            (groups[s] = groups[s] || { s, name: shopName(state, s), items: [] }).items.push({ item, row: a.best, only: a.rows.length === 1, tie: a.ties.slice(1).map(r => shopName(state, r.s)) });
        });
        return Object.values(groups).sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
    }
    function planText(state, today, loc) {
        const g = plan(state, today);
        if (!g.length) return '';
        const lines = ['Where to buy: the cheapest price I have seen for each item', ''];
        g.forEach(x => {
            lines.push(x.name + ':');
            x.items.forEach(i => lines.push('- ' + i.item.name + ': ' + priceText(i.row.e, state.cur, loc) + ' (' + perText(i.row.up, i.item.per, state.cur, loc) + ', ' + fmtDate(i.row.e.d, loc) + ')' +
                (i.tie.length ? ', same at ' + i.tie.join(', ') : '') + (i.only ? ', only one shop checked' : '')));
            lines.push('');
        });
        lines.push('Made with Grocery Price Book: https://umar8092.github.io/apps/grocery-price-book-for-comparing-shops/');
        return lines.join('\n');
    }

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, cur: '', seq: 0, shops: [], items: [] });
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    const str = (x, max) => typeof x === 'string' ? x.slice(0, max) : '';
    const rid = p => p + Math.random().toString(36).slice(2, 10);
    function cleanEntry(e, kind, shopIds) {
        if (!e || typeof e !== 'object' || !isDay(e.d) || !shopIds[e.s] || !UNITS[e.u] || UNITS[e.u].k !== kind) return null;
        if (!int(e.c, 1, MAXC) || !int(e.q, 1, MAXQ)) return null;
        const o = { id: str(e.id, 40) || rid('e'), s: e.s, c: e.c, q: e.q, u: e.u, k: int(e.k, 1, MAXK) ? e.k : 1, d: e.d, n: int(e.n, 0, 1e12) ? e.n : 0 };
        if (e.sale === true) o.sale = true;
        return o;
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.items) || !Array.isArray(s.shops)) return null;
        const o = emptyState();
        o.cur = str(s.cur, 6);
        const ids = {};
        s.shops.slice(0, 200).forEach(x => {
            const name = x && cleanName(x.name, 40);
            if (!name || o.shops.some(y => same(y.name, name))) return;
            const id = str(x.id, 40) || rid('s');
            if (ids[id]) return;
            ids[id] = 1; o.shops.push({ id, name });
        });
        let top = 0;
        s.items.slice(0, 1000).forEach(x => {
            const name = x && cleanName(x.name, 60);
            if (!name || !PER[x.per] || o.items.some(y => same(y.name, name))) return;
            const it = { id: str(x.id, 40) || rid('i'), name, per: x.per, entries: [] };
            (Array.isArray(x.entries) ? x.entries : []).slice(0, 2000).forEach(e => { const c = cleanEntry(e, PER[x.per].k, ids); if (c) { it.entries.push(c); top = Math.max(top, c.n); } });
            o.items.push(it);
        });
        o.seq = Math.max(int(s.seq, 0, 1e12) ? s.seq : 0, top);
        return o;
    }

    const api = { UNITS, UNIT_ORDER, PER, PER_ORDER, PER_LABEL, OLD, parseNum, parseMoney, parseSize, parsePacks, cleanName, same, dayNum, dayStr, isDay, localDay, diff, checkDay,
        amount, unitPrice, latestByShop, analyse, pct, fmtNum, fmtMoney, fmtUnit, perText, packText, priceText, pctText, fmtDate, ago, shopName, verdict, plan, planText,
        emptyState, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GPB = api;
})(typeof window !== 'undefined' ? window : this);
