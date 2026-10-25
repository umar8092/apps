// Laundry and Dry-Cleaning Clothes Count Log: the maths and the words, with no page code, so tests.js can check it in node.
// Money is whole cents (hundredths) and counts are whole pieces, so every bill is exact.
// A batch is one lot of clothes given to one shop on one day: pieces by kind, each with its own price, how many came back,
// how many were lost, an optional extra charge, an amount the shop agreed to pay back, and payments.
(function (root) {
    'use strict';
    const MAXP = 10000000;      // 100,000 a piece, in cents
    const MAXPAY = 10000000000; // 100,000,000, in cents
    const MAXN = 999;           // pieces of one kind in one batch
    const SYMBOLS = ['', 'Rs', '₹', '$', '€', '£', '৳', '₦', 'KSh', '₵', 'R', '₱', 'Rp', 'RM', 'AED', 'SAR', '¥', '₩', '₺', 'R$', 'E£', 'A$', 'C$', 'kr', 'CHF', 'zł'];
    const SERVICES = { wash: 'Wash and iron', iron: 'Ironing only', dry: 'Dry cleaning' };
    // kinds of clothes offered in the form; the first 8 show at once, the rest behind "Show more kinds"
    const KINDS = ['Shirt', 'Trousers or jeans', 'Shalwar kameez', 'Kurta', 'T-shirt', 'Bedsheet', 'Pillow cover', 'Towel',
        'Suit', 'Coat or jacket', 'Sweater', 'Dress', 'Saree', 'Dupatta or scarf', 'Blanket or quilt', 'Curtain', 'School uniform'];
    const FIRST = 8;

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


    // "5" "05" "5 pcs" "5 pieces" -> whole pieces, or { error }
    function parseCount(text, max) {
        max = max || MAXN;
        let s = String(text == null ? '' : text).replace(/[   ]/g, ' ').trim().toLowerCase();
        s = s.replace(/\s*(pcs|pieces?|pc)\.?$/, '').trim();
        if (!s) return { error: 'Type how many pieces, such as 5.' };
        if (/^[-−–]/.test(s)) return { error: 'Type the number without a minus sign.' };
        if (!/^\d+$/.test(s)) return { error: 'Type whole pieces, such as 5.' };
        const n = Number(s);
        if (n > max) return { error: 'The most is ' + max + '.' };
        return { n };
    }

    function fmt(cents, cur, locale) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }
    // for a price box: 4000 -> "40", 1250 -> "12.50", 0 -> ""
    const priceInput = c => c ? (c % 100 ? (c / 100).toFixed(2) : String(c / 100)) : '';

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    const dayStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    function toDate(s) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d, 12); t.setFullYear(y); return t; }
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2100 && dayStr(toDate(s)) === s;
    const isMonth = s => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s) && isDay(s + '-01');
    function addDays(s, n) { const d = toDate(s); d.setDate(d.getDate() + n); return dayStr(d); }
    function daysBetween(a, b) { const u = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((u(b) - u(a)) / 864e5); }
    const monthOf = s => s.slice(0, 7);
    function addMonth(ym, n) { const [y, m] = ym.split('-').map(Number), t = y * 12 + m - 1 + n; return Math.floor(t / 12) + '-' + pad(t % 12 + 1); }
    function niceDate(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s; } }
    function shortDate(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short' }); } catch (e) { return s; } }
    function dayName(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return s; } }
    function monthName(ym, locale) { try { return toDate(ym + '-01').toLocaleDateString(locale || undefined, { month: 'long', year: 'numeric' }); } catch (e) { return ym; } }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const pieces = n => plural(n, 'piece', 'pieces');

    // ---------- one batch ----------
    function calc(b) {
        let given = 0, back = 0, lost = 0, charge = 0, noPrice = 0;
        b.lines.forEach(l => {
            given += l.n; back += l.back; lost += l.lost;
            charge += (l.n - l.lost) * l.p;
            if (!l.p && l.n - l.lost > 0) noPrice += l.n - l.lost;
        });
        const extra = b.extra ? b.extra.c : 0;
        const bill = charge + extra - b.comp;
        const paid = b.pays.reduce((t, x) => t + x.c, 0);
        return { given, back, lost, out: given - back - lost, charge, extra, comp: b.comp, bill, paid, toPay: bill - paid, noPrice };
    }
    // the pieces still at the shop: "Shirt × 2, Towel × 1"
    function outList(b) {
        return b.lines.filter(l => l.n - l.back - l.lost > 0).map(l => l.t + ' × ' + (l.n - l.back - l.lost)).join(', ');
    }
    // where the batch stands today
    function status(b, ready, today, locale) {
        const k = calc(b), days = Math.max(0, daysBetween(b.date, today));
        if (k.given === 0) return { kind: 'back', text: 'No pieces' };
        if (k.out > 0) {
            let text = pieces(k.out) + ' still with the laundry (' + plural(days, 'day', 'days') + ')';
            let kind = 'out';
            if (ready) {
                const due = addDays(b.date, ready), late = daysBetween(due, today);
                if (late > 0) { kind = 'late'; text += ', ' + plural(late, 'day', 'days') + ' late'; }
                else if (late === 0) { kind = 'due'; text += ', due back today'; }
                else text += ', ready by ' + dayName(due, locale);
            }
            return { kind, text, out: k.out };
        }
        let text = k.lost === k.given ? 'All lost' : 'All back' + (b.done ? ' on ' + shortDate(b.done, locale) : '');
        if (k.lost && k.lost < k.given) text += ', except ' + plural(k.lost, 'lost piece', 'lost pieces');
        return { kind: k.lost ? 'lost' : 'back', text, out: 0 };
    }
    // set or clear the day the last piece came back
    function markDone(b, today) {
        const k = calc(b);
        if (k.out > 0 || k.given === 0) b.done = '';
        else if (!b.done) b.done = today;
    }
    const priceKey = (svc, kind) => svc + '|' + kind.toLowerCase();
    function rememberPrices(shop, svc, lines) {
        lines.forEach(l => { if (l.p > 0) shop.prices[priceKey(svc, l.t)] = l.p; });
    }
    const priceFor = (shop, svc, kind) => (shop && shop.prices[priceKey(svc, kind)]) || 0;

    // ---------- totals ----------
    function shopBalance(state, shopId) {
        return state.batches.filter(b => b.shop === shopId).reduce((t, b) => t + calc(b).toPay, 0);
    }
    function monthSummary(state, ym) {
        const rows = [];
        state.shops.forEach(sh => {
            const list = state.batches.filter(b => b.shop === sh.id && monthOf(b.date) === ym);
            if (!list.length) return;
            const r = { shop: sh, batches: list.length, given: 0, bill: 0, paid: 0, toPay: 0, noPrice: 0 };
            list.forEach(b => { const k = calc(b); r.given += k.given; r.bill += k.bill; r.paid += k.paid; r.toPay += k.toPay; r.noPrice += k.noPrice; });
            rows.push(r);
        });
        const tot = rows.reduce((t, r) => ({ given: t.given + r.given, bill: t.bill + r.bill, paid: t.paid + r.paid, toPay: t.toPay + r.toPay }), { given: 0, bill: 0, paid: 0, toPay: 0 });
        return { rows, tot };
    }
    function outNow(state) {
        let n = 0, batches = 0;
        state.batches.forEach(b => { const o = calc(b).out; if (o > 0) { n += o; batches++; } });
        return { n, batches };
    }
    function owedNow(state) {
        let owe = 0, ahead = 0;
        state.shops.forEach(sh => { const v = shopBalance(state, sh.id); if (v > 0) owe += v; else ahead -= v; });
        return { owe, ahead };
    }
    // "To pay: 1,240" / "Paid in full" / "The shop owes you 300"
    function payText(v, cur, locale) {
        if (v > 0) return 'To pay: ' + fmt(v, cur, locale);
        if (v < 0) return 'The shop owes you ' + fmt(-v, cur, locale);
        return 'Paid in full';
    }

    // ---------- words to copy ----------
    function batchText(b, shopName, cur, locale) {
        const k = calc(b), out = [];
        out.push(shopName + ': clothes given on ' + niceDate(b.date, locale) + ' (' + SERVICES[b.svc] + ')');
        b.lines.forEach(l => {
            let s = l.t + ' × ' + l.n;
            if (l.p) s += ' at ' + fmt(l.p, cur, locale) + ' = ' + fmt((l.n - l.lost) * l.p, cur, locale);
            else s += ' (price not set)';
            if (l.lost) s += ' (' + l.lost + ' lost, not charged)';
            out.push(s);
        });
        if (b.extra) out.push((b.extra.label || 'Extra charge') + ': ' + fmt(b.extra.c, cur, locale));
        if (b.comp) out.push('Taken off for lost or damaged pieces: -' + fmt(b.comp, cur, locale));
        out.push('Total: ' + pieces(k.given) + ', bill ' + (k.bill < 0 ? '-' : '') + fmt(k.bill, cur, locale));
        if (k.out > 0) out.push('Still with the laundry: ' + outList(b));
        else out.push('All pieces back' + (k.lost ? ' except ' + k.lost + ' lost' : '') + '.');
        if (k.paid) out.push('Paid: ' + fmt(k.paid, cur, locale));
        out.push(payText(k.toPay, cur, locale));
        if (b.note) out.push('Note: ' + b.note);
        return out.join('\n');
    }
    function monthText(state, ym, shopId, cur, locale) {
        const sh = state.shops.find(s => s.id === shopId);
        if (!sh) return '';
        const list = state.batches.filter(b => b.shop === shopId && monthOf(b.date) === ym).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
        const out = [sh.name + ': ' + monthName(ym, locale)];
        let bill = 0, paid = 0, given = 0;
        list.forEach(b => {
            const k = calc(b); bill += k.bill; paid += k.paid; given += k.given;
            out.push(shortDate(b.date, locale) + ' (' + SERVICES[b.svc] + '): ' + pieces(k.given) + ', ' + (k.bill < 0 ? '-' : '') + fmt(k.bill, cur, locale) + (k.out ? ' (' + k.out + ' not back yet)' : ''));
        });
        out.push('Total: ' + pieces(given) + ', bill ' + (bill < 0 ? '-' : '') + fmt(bill, cur, locale) + ', paid ' + fmt(paid, cur, locale));
        out.push(payText(bill - paid, cur, locale));
        return out.join('\n');
    }

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, cur: '', last: '', shops: [], batches: [], kinds: [] });
    const str = (x, n) => typeof x === 'string' ? x.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, n) : '';
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    let seq = 0;
    const newId = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
    function cleanShop(o) {
        if (!o || typeof o !== 'object') return null;
        const name = str(o.name, 60).trim();
        if (!name) return null;
        const sh = { id: str(o.id, 40) || newId(), name, ready: int(o.ready, 1, 60) ? o.ready : 0, prices: {} };
        if (o.prices && typeof o.prices === 'object') Object.keys(o.prices).slice(0, 400).forEach(k => {
            if (/^(wash|iron|dry)\|.{1,40}$/.test(k) && int(o.prices[k], 1, MAXP)) sh.prices[k] = o.prices[k];
        });
        return sh;
    }
    function cleanBatch(o, shopIds) {
        if (!o || typeof o !== 'object' || !shopIds.has(o.shop) || !isDay(o.date) || !Array.isArray(o.lines)) return null;
        const b = { id: str(o.id, 40) || newId(), shop: o.shop, date: o.date, svc: SERVICES[o.svc] ? o.svc : 'wash', lines: [], extra: null, comp: 0, note: str(o.note, 300), pays: [], done: isDay(o.done) ? o.done : '' };
        o.lines.slice(0, 60).forEach(l => {
            if (!l || typeof l !== 'object') return;
            const t = str(l.t, 40).trim();
            if (!t || !int(l.n, 1, MAXN)) return;
            const lost = int(l.lost, 0, l.n) ? l.lost : 0;
            const back = int(l.back, 0, l.n - lost) ? l.back : 0;
            b.lines.push({ t, n: l.n, back, lost, p: int(l.p, 0, MAXP) ? l.p : 0 });
        });
        if (!b.lines.length) return null;
        if (o.extra && typeof o.extra === 'object' && int(o.extra.c, 1, MAXPAY)) b.extra = { label: str(o.extra.label, 40).trim(), c: o.extra.c };
        b.comp = int(o.comp, 0, MAXPAY) ? o.comp : 0;
        if (Array.isArray(o.pays)) o.pays.slice(0, 50).forEach(x => { if (x && isDay(x.d) && int(x.c, 1, MAXPAY)) b.pays.push({ id: str(x.id, 40) || newId(), d: x.d, c: x.c }); });
        return b;
    }
    function cleanState(o) {
        if (!o || typeof o !== 'object' || !Array.isArray(o.shops) || !Array.isArray(o.batches)) return null;
        const s = emptyState();
        s.cur = SYMBOLS.includes(o.cur) ? o.cur : '';
        const seen = new Set();
        o.shops.slice(0, 30).forEach(x => { const sh = cleanShop(x); if (sh && !seen.has(sh.id)) { seen.add(sh.id); s.shops.push(sh); } });
        const bseen = new Set();
        o.batches.slice(0, 3000).forEach(x => { const b = cleanBatch(x, seen); if (b && !bseen.has(b.id)) { bseen.add(b.id); s.batches.push(b); } });
        if (Array.isArray(o.kinds)) o.kinds.slice(0, 40).forEach(x => { const t = str(x, 40).trim(); if (t && !KINDS.concat(s.kinds).some(k => k.toLowerCase() === t.toLowerCase())) s.kinds.push(t); });
        s.last = seen.has(o.last) ? o.last : (s.shops[0] ? s.shops[0].id : '');
        return s;
    }

    const api = { MAXP, MAXPAY, MAXN, SYMBOLS, SERVICES, KINDS, FIRST, parseAmount, parseCount, fmt, priceInput,
        dayStr, toDate, isDay, isMonth, addDays, daysBetween, monthOf, addMonth, niceDate, shortDate, dayName, monthName, plural, pieces,
        calc, outList, status, markDone, priceKey, rememberPrices, priceFor, shopBalance, monthSummary, outNow, owedNow, payText,
        batchText, monthText, emptyState, cleanShop, cleanBatch, cleanState, newId };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LDC = api;
})(typeof window !== 'undefined' ? window : this);
