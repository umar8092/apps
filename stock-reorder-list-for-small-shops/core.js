// Stock Reorder List for Small Shops: the maths and the words, with no page code, so tests.js can check it in node.
// Quantities are whole hundredths (2.5 kg is 250) and money is whole cents, so every order and total is exact.
// An item is one thing the shop sells: its unit, the supplier, how many are in stock, the level to order at,
// the level to fill up to, the last price paid, and an order that has been sent but not delivered yet.
(function (root) {
    'use strict';
    const MAXQ = 99999900;      // 999,999 of a unit, in hundredths
    const MAXP = 10000000000;   // 100,000,000 a unit, in cents
    const MAXPAY = MAXP;
    const SYMBOLS = ['', 'Rs', '₹', '$', '€', '£', '৳', '₦', 'KSh', '₵', 'R', '₱', 'Rp', 'RM', 'AED', 'SAR', '¥', '₩', '₺', 'R$', 'E£', 'A$', 'C$', 'kr', 'CHF', 'zł'];
    // units offered in the form: [one, many, order when down to, order up to]
    const UNITS = [
        ['piece', 'pieces', 5, 20], ['packet', 'packets', 10, 40], ['carton', 'cartons', 2, 6], ['box', 'boxes', 2, 6],
        ['bag', 'bags', 1, 4], ['sack', 'sacks', 1, 3], ['kg', 'kg', 5, 20], ['litre', 'litres', 5, 20],
        ['bottle', 'bottles', 6, 24], ['tin', 'tins', 6, 24], ['dozen', 'dozen', 2, 6], ['roll', 'rolls', 2, 10],
        ['tray', 'trays', 2, 6], ['strip', 'strips', 10, 50]];
    const unitRow = u => UNITS.find(x => x[0] === u);
    const isUnit = u => !!unitRow(u);

    // ---------- typed numbers ----------
    // "2,500" "2.500" "2 500" "1,00,000" "12.5" "12,50" "$40" "Rs 1500" -> cents, or { error }
    function parseAmount(text, opt) {
        opt = opt || {};
        const max = opt.max || MAXPAY, maxTxt = fmt(max, '', 'en-US');
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: opt.blank || 'Type the amount, such as 220.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴])$/i, '').trim();
        if (/^[-−–]/.test(s)) return { error: 'Type the amount without a minus sign.' };
        if (/^\+/.test(s)) s = s.slice(1).trim();
        if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return { error: 'Type a number, such as 220 or 12.50.' };
        let whole, frac = '';
        if (/\s/.test(s)) {
            const parts = s.split(/\s+/), last = parts[parts.length - 1], dm = last.match(/^(\d{3})([.,]\d{0,2})?$/);
            if (!/^\d{1,3}$/.test(parts[0]) || !parts.slice(1, -1).every(p => /^\d{3}$/.test(p)) || !dm) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            whole = parts.join('').replace(/[.,]\d*$/, ''); frac = dm[2] ? dm[2].slice(1) : '';
        } else {
            const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
            let dec = null;
            if (dots && commas) dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
            else if (dots + commas === 1) {
                const mark = dots ? '.' : ',', [a, b] = s.split(mark);
                dec = (b.length === 3 && /^\d{1,3}$/.test(a) && a !== '0') ? null : mark;
            }
            let intPart = s, fracPart = '';
            if (dec) { const i = s.lastIndexOf(dec); intPart = s.slice(0, i); fracPart = s.slice(i + 1); }
            const th = dec === '.' ? ',' : dec === ',' ? '.' : (dots ? '.' : ',');
            if (intPart.includes(dec || '\u0000')) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            if (intPart.includes(th)) {
                const re = new RegExp('^\\d{1,3}(\\' + th + '\\d{3})+$'), ind = new RegExp('^\\d{1,2}(\\' + th + '\\d{2})*\\' + th + '\\d{3}$');
                if (!re.test(intPart) && !ind.test(intPart)) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            }
            if (!/^\d*$/.test(fracPart)) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            whole = intPart.split(th).join(''); frac = fracPart;
            if (whole === '' && frac === '') return { error: 'Type a number, such as 220 or 12.50.' };
        }
        if (frac.length > 2) return { error: 'Use at most 2 numbers after the decimal point, such as 12.50.' };
        whole = whole.replace(/^0+(?=\d)/, '') || '0';
        if (whole.length > 10) return { error: 'That amount is too big. The most is ' + maxTxt + '.' };
        const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
        if (cents === 0 && !opt.zeroOk) return { error: 'Type an amount more than 0.' };
        if (cents > max) return { error: 'That amount is too big. The most is ' + maxTxt + '.' };
        return { cents };
    }

    function fmt(cents, cur, locale) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }

    // "4" "2.5" "2,5" "4 cartons" "1,000" -> hundredths, or { error }
    function parseQty(text, opt) {
        opt = opt || {};
        let s = String(text == null ? '' : text).replace(/[   ]/g, ' ').trim();
        s = s.replace(/(\d)\s*[A-Za-z][A-Za-z.]*$/, '$1').trim();
        if (!s) return { error: opt.blank || 'Type a number, such as 4 or 2.5.' };
        if (/^[-−–]/.test(s)) return { error: 'Type the number without a minus sign.' };
        const r = parseAmount(s, { zeroOk: opt.zeroOk !== false, max: MAXQ });
        if (r.error) {
            if (/too big/.test(r.error)) return { error: 'That is too many. The most is 999,999.' };
            if (/decimal/.test(r.error)) return { error: 'Use at most 2 numbers after the decimal point, such as 2.5.' };
            if (/more than 0/.test(r.error)) return { error: opt.zeroMsg || 'Type a number more than 0.' };
            return { error: 'Type a number, such as 4 or 2.5.' };
        }
        return { q: r.cents };
    }
    function fmtQ(q, locale) {
        let t;
        try { t = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(q / 100); }
        catch (e) { t = String(q / 100); }
        return t;
    }
    // 400 'carton' -> "4 cartons", 100 -> "1 carton", 250 'kg' -> "2.5 kg"; a unit the shop typed stays as typed
    function qtyText(q, unit, locale) {
        const r = unitRow(unit), n = fmtQ(q, locale);
        if (!r) return unit ? n + ' ' + unit : n;
        return n + ' ' + (q === 100 ? r[0] : r[1]);
    }
    const unitMany = unit => { const r = unitRow(unit); return r ? r[1] : unit; };
    const qtyInput = q => q % 100 ? (q / 100).toFixed(2).replace(/0$/, '') : String(q / 100);
    const priceInput = c => c ? (c % 100 ? (c / 100).toFixed(2) : String(c / 100)) : '';
    const presets = unit => { const r = unitRow(unit); return r ? { low: r[2] * 100, full: r[3] * 100 } : { low: 200, full: 1000 }; };
    // price of q hundredths at c cents a unit, rounded to the nearest cent
    const lineCost = (c, q) => Math.round(c * q / 100);

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    const dayStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    function toDate(s) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d, 12); t.setFullYear(y); return t; }
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2100 && dayStr(toDate(s)) === s;
    function addDays(s, n) { const d = toDate(s); d.setDate(d.getDate() + n); return dayStr(d); }
    function daysBetween(a, b) { const u = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((u(b) - u(a)) / 864e5); }
    function niceDate(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s; } }
    function shortDate(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return s; } }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    // "today", "yesterday", "4 days ago", "on Mon 12 Oct" (a long time ago or a day in the future)
    function ago(d, today, locale) {
        const n = daysBetween(d, today);
        if (n === 0) return 'today';
        if (n === 1) return 'yesterday';
        if (n > 1 && n <= 30) return n + ' days ago';
        return 'on ' + shortDate(d, locale);
    }

    // ---------- one item ----------
    // what the item needs now: { kind: 'order', q } (stock at or below the order level), { kind: 'ordered' }, or { kind: 'ok' }
    function need(it) {
        if (it.ord) return { kind: 'ordered', q: it.ord.q };
        if (it.stock <= it.low) return { kind: 'order', q: Math.max(it.full - it.stock, 0) };
        return { kind: 'ok', q: 0 };
    }
    const supKey = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const sameItem = (a, b) => supKey(a.name) === supKey(b.name) && supKey(a.sup) === supKey(b.sup);

    // ---------- the order list ----------
    // items to order, grouped by supplier (A to Z, "no supplier" last), each line with its quantity and estimated cost
    function orders(state) {
        const groups = new Map();
        state.items.filter(it => !it.arch).forEach(it => {
            const n = need(it);
            if (n.kind !== 'order' || n.q <= 0) return;
            const k = supKey(it.sup);
            if (!groups.has(k)) groups.set(k, { key: k, sup: it.sup ? it.sup.replace(/\s+/g, ' ').trim() : '', lines: [], est: 0, priced: 0, noPrice: 0 });
            const g = groups.get(k);
            const cost = it.price ? lineCost(it.price, n.q) : 0;
            g.lines.push({ id: it.id, name: it.name, unit: it.unit, q: n.q, price: it.price, cost, out: it.stock === 0 });
            if (it.price) { g.est += cost; g.priced++; } else g.noPrice++;
        });
        const list = [...groups.values()];
        list.forEach(g => g.lines.sort((a, b) => a.name.localeCompare(b.name)));
        list.sort((a, b) => (a.key === '') - (b.key === '') || a.sup.localeCompare(b.sup));
        const est = list.reduce((t, g) => t + g.est, 0), noPrice = list.reduce((t, g) => t + g.noPrice, 0);
        const items = list.reduce((t, g) => t + g.lines.length, 0);
        return { groups: list, est, noPrice, items };
    }
    // items ordered and waiting for the delivery, oldest order first
    function waiting(state) {
        return state.items.filter(it => !it.arch && it.ord).sort((a, b) => a.ord.d < b.ord.d ? -1 : a.ord.d > b.ord.d ? 1 : a.name.localeCompare(b.name));
    }
    // the message for the supplier: no prices, just what to send
    function orderText(g, shop, today, locale) {
        const out = [];
        out.push((g.sup ? 'Hello ' + g.sup + ', please' : 'Please') + ' send' + (shop ? ' to ' + shop : '') + ':');
        g.lines.forEach((l, i) => out.push((i + 1) + '. ' + l.name + ': ' + qtyText(l.q, l.unit, locale)));
        out.push('Order of ' + niceDate(today, locale) + '. Thank you.');
        if (shop) out.push(shop);
        return out.join('\n');
    }
    // ---------- changes ----------
    // the order was sent: remember what and when, so it is not ordered twice
    function markOrdered(it, q, today) { it.ord = { q, d: today }; }
    // the delivery came: add what came to the stock, keep the new price, close the order
    function receive(it, q, price, today) {
        it.stock = Math.min(MAXQ, it.stock + q);
        if (price) it.price = price;
        it.got = [{ d: today, q, p: price || it.price || 0 }].concat(it.got || []).slice(0, 12);
        it.ord = null;
        it.upd = today;
    }

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, cur: '', shop: '', phones: {}, items: [] });
    const str = (x, n) => typeof x === 'string' ? x.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, n) : '';
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    let seq = 0;
    const newId = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
    function cleanItem(o) {
        if (!o || typeof o !== 'object') return null;
        const name = str(o.name, 60).replace(/\s+/g, ' ').trim();
        const unit = str(o.unit, 20).replace(/\s+/g, ' ').trim();
        if (!name || !unit || !int(o.stock, 0, MAXQ) || !int(o.low, 0, MAXQ - 1) || !int(o.full, 1, MAXQ) || o.full <= o.low) return null;
        const it = { id: str(o.id, 40) || newId(), name, unit, sup: str(o.sup, 60).replace(/\s+/g, ' ').trim(), stock: o.stock, low: o.low, full: o.full,
            price: int(o.price, 0, MAXP) ? o.price : 0, arch: o.arch === true, upd: isDay(o.upd) ? o.upd : '', ord: null, got: [] };
        if (o.ord && typeof o.ord === 'object' && int(o.ord.q, 1, MAXQ) && isDay(o.ord.d)) it.ord = { q: o.ord.q, d: o.ord.d };
        if (Array.isArray(o.got)) o.got.slice(0, 12).forEach(g => { if (g && isDay(g.d) && int(g.q, 1, MAXQ)) it.got.push({ d: g.d, q: g.q, p: int(g.p, 0, MAXP) ? g.p : 0 }); });
        return it;
    }
    function cleanState(o) {
        if (!o || typeof o !== 'object' || !Array.isArray(o.items)) return null;
        const s = emptyState();
        s.cur = SYMBOLS.includes(o.cur) ? o.cur : '';
        s.shop = str(o.shop, 60).replace(/\s+/g, ' ').trim();
        const seen = new Set();
        o.items.slice(0, 2000).forEach(x => { const it = cleanItem(x); if (it && !seen.has(it.id)) { seen.add(it.id); s.items.push(it); } });
        if (o.phones && typeof o.phones === 'object') Object.keys(o.phones).slice(0, 200).forEach(k => {
            const v = o.phones[k];
            if (k.length <= 60 && typeof v === 'string' && /^\d{6,15}$/.test(v)) s.phones[k] = v;
        });
        return s;
    }
    // "0300 1234567" "+92 300 1234567" "(021) 555-0101" -> digits for a WhatsApp link, or { error }
    function parsePhone(text) {
        const s = String(text == null ? '' : text).trim();
        if (!s) return { digits: '' };
        if (!/^\+?[\d\s().-]+$/.test(s)) return { error: 'Type only the number, such as +92 300 1234567.' };
        const intl = /^\s*(\+|00)/.test(s);
        if (!intl && /^\s*0/.test(s)) return { error: 'Type it with the country code, such as +92 300 1234567.' };
        const d = s.replace(/\D/g, '').replace(/^00/, '');
        if (d.length < 6 || d.length > 15) return { error: 'That number looks too short or too long. Type it with the country code, such as +92 300 1234567.' };
        return { digits: d };
    }

    const api = { MAXQ, MAXP, SYMBOLS, UNITS, isUnit, unitMany, parseAmount, parseQty, fmt, fmtQ, qtyText, qtyInput, priceInput, presets, lineCost,
        dayStr, toDate, isDay, addDays, daysBetween, niceDate, shortDate, plural, ago,
        need, supKey, sameItem, orders, waiting, orderText, markOrdered, receive,
        emptyState, cleanItem, cleanState, newId, parsePhone };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SRL = api;
})(typeof window !== 'undefined' ? window : this);
