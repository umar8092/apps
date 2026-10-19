// Milk and Daily Delivery Log: the maths and the words, with no page code, so tests.js can check it in node.
// Money is whole cents (hundredths) and amounts are whole thousandths of a unit (1.5 litres = 1500), so totals are exact.
// Dates are calendar days ('2026-10-17'), months are '2026-10'. Each delivery (milk, newspaper, water cans) is billed
// per calendar month like a seller does it: the units delivered at each price, times that price.
(function (root) {
    'use strict';
    const MAXP = 100000000;   // 1,000,000 per unit, in cents
    const MAXQ = 1000000;     // 1,000 units a day, in thousandths
    const MAXPAY = 10000000000; // 100,000,000 per payment or balance, in cents
    const SYMBOLS = ['', 'Rs', '₹', '$', '€', '£', '৳', '₦', 'KSh', '₵', 'R', '₱', 'Rp', 'RM', 'AED', 'SAR', '¥', '₩', '₺', 'R$', 'E£', 'A$', 'C$', 'kr', 'CHF', 'zł'];
    // unit -> [one, many]
    const UNITS = { litre: ['litre', 'litres'], kg: ['kg', 'kg'], packet: ['packet', 'packets'], bottle: ['bottle', 'bottles'], copy: ['copy', 'copies'],
        can: ['can', 'cans'], loaf: ['loaf', 'loaves'], piece: ['piece', 'pieces'], dozen: ['dozen', 'dozen'] };
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
        if (cents === 0) return { error: 'Type an amount more than 0.' };
        if (cents > max) return { error: 'That amount is too big. The most is ' + maxTxt + '.' };
        return { cents };
    }

    // "2" "1.5" "1,5" "0.25" "1/2" "½" "1 1/2" -> thousandths, or { error }. zeroOk lets 0 mean "not delivered".
    function parseQty(text, zeroOk) {
        let s = String(text == null ? '' : text).replace(/[   ]/g, ' ').trim().toLowerCase();
        s = s.replace(/\s*(litres?|liters?|ltrs?|l|kgs?|packets?|bottles?|copies|copy|cans?|loaves|loaf|pieces?|pcs|dozen)\.?$/, '').trim();
        s = s.replace('½', ' 1/2').replace('¼', ' 1/4').replace('¾', ' 3/4').trim();
        if (!s) return { error: 'Type how much, such as 2 or 1.5.' };
        if (/^[-−–]/.test(s)) return { error: 'Type the amount without a minus sign.' };
        let m;
        const fr = s.match(/^(?:(\d{1,4})\s+)?(\d{1,3})\s*\/\s*(\d{1,3})$/);
        if (fr) {
            const a = Number(fr[1] || 0), n = Number(fr[2]), d = Number(fr[3]);
            if (!d || (n * 1000) % d) return { error: 'Type it as a decimal, such as 1.5 or 0.25.' };
            m = a * 1000 + n * 1000 / d;
        } else {
            const x = s.match(/^(\d{0,4})(?:[.,](\d*))?$/);
            if (!x || (x[1] === '' && !x[2])) return { error: 'Type a number, such as 2 or 1.5.' };
            if ((x[2] || '').length > 3) return { error: 'Use at most 3 numbers after the decimal point, such as 0.125.' };
            m = Number(x[1] || 0) * 1000 + Number(((x[2] || '') + '000').slice(0, 3));
        }
        if (m === 0 && !zeroOk) return { error: 'Type an amount more than 0.' };
        if (m > MAXQ) return { error: 'That is too much for one day. The most is 1,000.' };
        return { m };
    }

    function fmt(cents, cur, locale) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }
    function fmtQty(m, locale) {
        try { return new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: 3 }).format(m / 1000); }
        catch (e) { return String(m / 1000); }
    }
    function unitWord(unit, m) {
        const u = UNITS[unit];
        if (!u) return unit || '';
        return m === 1000 ? u[0] : u[1];
    }
    const qtyText = (m, unit, locale) => (fmtQty(m, locale) + ' ' + unitWord(unit, m)).trim();
    // what the seller charges for m thousandths at p cents a unit, rounded half up to a whole cent
    const costOf = (m, p) => Math.floor((m * p + 500) / 1000);

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
    const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0, 12).getDate(); };
    const firstDay = ym => ym + '-01';
    const lastDay = ym => ym + '-' + pad(daysIn(ym));
    const weekday = s => toDate(s).getDay();
    function niceDate(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s; } }
    function shortDate(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short' }); } catch (e) { return s; } }
    function dayName(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return s; } }
    function monthName(ym, locale) { try { return toDate(firstDay(ym)).toLocaleDateString(locale || undefined, { month: 'long', year: 'numeric' }); } catch (e) { return ym; } }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    // "5, 12 and 19 Oct"
    function dayList(days, locale) {
        if (!days.length) return '';
        const parts = days.map(d => shortDate(d, locale));
        return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
    }

    // ---------- one delivery ----------
    function newItem(id, start) {
        return { id, name: '', unit: 'litre', mode: 'daily', wd: [0, 1, 2, 3, 4, 5, 6], start, stop: '', seller: '', phone: '', open: 0,
            plans: [{ from: start, q: 1000, p: 0 }], ch: {}, pauses: [], pay: {} };
    }
    // the usual amount and price in effect on a day
    function planOn(it, day) {
        let p = it.plans[0];
        for (const x of it.plans) if (x.from <= day) p = x;
        return p;
    }
    const pausedOn = (it, day) => it.pauses.some(x => x.from <= day && day <= x.to);
    function scheduledOn(it, day) {
        if (it.mode === 'week') return it.wd.includes(weekday(day));
        if (it.mode === 'alt') return daysBetween(it.start, day) % 2 === 0;
        return true;
    }
    const inRange = (it, day) => day >= it.start && (!it.stop || day <= it.stop);
    // what happened on a day: { q, p, usual, kind } kind = usual | changed | extra | missed | paused | off | none
    function dayInfo(it, day) {
        if (!inRange(it, day)) return { q: 0, p: 0, usual: 0, kind: 'none' };
        const pl = planOn(it, day), sch = scheduledOn(it, day), usual = sch ? pl.q : 0;
        if (Object.prototype.hasOwnProperty.call(it.ch, day)) {
            const q = it.ch[day];
            return { q, p: pl.p, usual, kind: q === 0 ? 'missed' : !sch ? 'extra' : q === pl.q ? 'usual' : 'changed' };
        }
        if (pausedOn(it, day)) return { q: 0, p: pl.p, usual, kind: sch ? 'paused' : 'off' };
        if (!sch) return { q: 0, p: pl.p, usual: 0, kind: 'off' };
        return { q: pl.q, p: pl.p, usual, kind: 'usual' };
    }

    // the bill for a month, counting days up to and including `upTo` (a day string; null = the whole month)
    function monthBill(it, ym, upTo) {
        const end = upTo && upTo < lastDay(ym) ? upTo : lastDay(ym);
        const segs = [], missed = [], changed = [], extra = [], paused = [];
        let days = 0, qty = 0;
        for (let d = firstDay(ym); d <= end; d = addDays(d, 1)) {
            const x = dayInfo(it, d);
            if (x.kind === 'missed') { if (x.usual) missed.push(d); else continue; }
            if (x.kind === 'paused') paused.push(d);
            if (x.kind === 'changed') changed.push({ d, q: x.q, usual: x.usual });
            if (x.kind === 'extra') extra.push({ d, q: x.q });
            if (!x.q) continue;
            days++; qty += x.q;
            let s = segs.find(g => g.p === x.p);
            if (!s) { s = { p: x.p, q: 0, days: 0, from: d }; segs.push(s); }
            s.q += x.q; s.days++; s.to = d;
        }
        segs.forEach(s => { s.cents = costOf(s.q, s.p); });
        return { ym, to: end, days, qty, segs, cents: segs.reduce((t, s) => t + s.cents, 0), missed, changed, extra, paused };
    }
    const paidIn = (it, ym) => (it.pay[ym] || []).reduce((t, x) => t + x.c, 0);
    // owed to the seller before this month starts (minus = paid ahead): balance from before + every earlier month's bill - what was paid for it
    function broughtForward(it, ym) {
        let b = it.open;
        const first = monthOf(it.start);
        for (let m = first; m < ym; m = addMonth(m, 1)) b += monthBill(it, m, null).cents - paidIn(it, m);
        // payments recorded for months before the start still count
        Object.keys(it.pay).forEach(m => { if (m < first && m < ym) b -= paidIn(it, m); });
        return b;
    }
    // everything the page and the summary need for one delivery in one month
    function monthView(it, ym, today) {
        const cur = monthOf(today), state = ym < cur ? 'past' : ym === cur ? 'now' : 'future';
        const full = monthBill(it, ym, null);
        const sofar = state === 'now' ? monthBill(it, ym, today) : state === 'past' ? full : monthBill(it, ym, addDays(firstDay(ym), -1));
        const bf = broughtForward(it, ym), paid = paidIn(it, ym);
        const bill = state === 'future' ? full : sofar;
        return { state, full, sofar, bill, bf, paid, toPay: bf + sofar.cents - paid, toPayFull: bf + full.cents - paid, started: it.start <= lastDay(ym), stopped: !!it.stop && it.stop < firstDay(ym) };
    }

    // ---------- words ----------
    function usualText(it, pl, cur, locale) {
        const q = qtyText(pl.q, it.unit, locale), price = fmt(pl.p, cur, locale) + ' per ' + (UNITS[it.unit] ? unitWord(it.unit, 1000) : it.unit || 'unit');
        let when = 'every day';
        if (it.mode === 'alt') when = 'every 2nd day';
        if (it.mode === 'week') when = it.wd.length === 7 ? 'every day' : it.wd.length === 0 ? 'on no days' : 'on ' + it.wd.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(i => DAYS[i]).join(', ');
        return q + ' ' + when + ' at ' + price;
    }
    function segLine(it, s, cur, locale) { return qtyText(s.q, it.unit, locale) + ' × ' + fmt(s.p, cur, locale) + ' = ' + fmt(s.cents, cur, locale); }
    function balanceText(c, cur, locale, what) {
        if (c > 0) return (what || 'To pay') + ': ' + fmt(c, cur, locale);
        if (c < 0) return 'Paid ahead: ' + fmt(-c, cur, locale) + ' (nothing to pay)';
        return 'Nothing to pay: all paid';
    }
    // the text sent to the seller for one delivery and one month
    function summaryText(it, ym, today, cur, locale) {
        const v = monthView(it, ym, today), b = v.bill, L = [];
        const head = (it.name || 'Delivery') + ': ' + monthName(ym, locale) + (it.seller ? ' (' + it.seller + ')' : '');
        L.push(head);
        if (v.state === 'now' && b.to < lastDay(ym)) L.push('So far, 1 to ' + shortDate(b.to, locale) + ':');
        if (v.state === 'future') L.push('Expected if nothing changes:');
        L.push('Delivered on ' + plural(b.days, 'day', 'days') + ': ' + qtyText(b.qty, it.unit, locale));
        b.segs.forEach(s => L.push(segLine(it, s, cur, locale) + (b.segs.length > 1 ? ' (' + shortDate(s.from, locale) + ' to ' + shortDate(s.to, locale) + ')' : '')));
        if (b.missed.length) L.push('Not delivered: ' + dayList(b.missed, locale));
        if (b.paused.length) L.push('Paused (away): ' + rangeList(b.paused, locale));
        b.changed.forEach(x => L.push('Changed: ' + shortDate(x.d, locale) + ' ' + qtyText(x.q, it.unit, locale) + ' (usual ' + fmtQty(x.usual, locale) + ')'));
        b.extra.forEach(x => L.push('Extra: ' + shortDate(x.d, locale) + ' ' + qtyText(x.q, it.unit, locale)));
        L.push('Bill for ' + (v.state === 'now' && b.to < lastDay(ym) ? 'these days' : 'the month') + ': ' + fmt(b.cents, cur, locale));
        if (v.bf > 0) L.push('Owed from before: ' + fmt(v.bf, cur, locale));
        if (v.bf < 0) L.push('Paid ahead before: ' + fmt(-v.bf, cur, locale));
        if (v.paid) L.push('Paid: ' + fmt(v.paid, cur, locale));
        L.push(balanceText(v.toPay, cur, locale));
        return L.join('\n');
    }
    // "1 to 5 Oct, 20 Oct"
    function rangeList(days, locale) {
        const out = []; let a = null, p = null;
        const push = () => { if (a) out.push(a === p ? shortDate(a, locale) : toDate(a).getDate() + ' to ' + shortDate(p, locale)); };
        days.forEach(d => { if (p && addDays(p, 1) === d) p = d; else { push(); a = p = d; } });
        push();
        return out.join(', ');
    }

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, cur: '', items: [] });
    const str = (x, n) => typeof x === 'string' ? x.slice(0, n) : '';
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    let seq = 0;
    const newId = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
    function cleanItem(o) {
        if (!o || typeof o !== 'object' || !isDay(o.start)) return null;
        const it = newItem(str(o.id, 40) || newId(), o.start);
        it.name = str(o.name, 40); it.unit = str(o.unit, 20);
        it.mode = ['daily', 'week', 'alt'].includes(o.mode) ? o.mode : 'daily';
        it.wd = Array.isArray(o.wd) ? [...new Set(o.wd.filter(x => int(x, 0, 6)))] : [0, 1, 2, 3, 4, 5, 6];
        it.stop = isDay(o.stop) && o.stop >= o.start ? o.stop : '';
        it.seller = str(o.seller, 60); it.phone = str(o.phone, 24);
        it.open = int(o.open, -MAXPAY, MAXPAY) ? o.open : 0;
        const plans = Array.isArray(o.plans) ? o.plans.filter(p => p && isDay(p.from) && int(p.q, 1, MAXQ) && int(p.p, 0, MAXP)) : [];
        plans.sort((a, b) => a.from < b.from ? -1 : 1);
        const uniq = plans.filter((p, i) => !i || p.from !== plans[i - 1].from);
        if (!uniq.length) return null;
        // the plan in effect on the start day becomes the first one
        const base = uniq.filter(p => p.from <= it.start).pop() || uniq[0];
        it.plans = [{ from: it.start, q: base.q, p: base.p }].concat(uniq.filter(p => p.from > it.start).map(p => ({ from: p.from, q: p.q, p: p.p })));
        if (o.ch && typeof o.ch === 'object') Object.keys(o.ch).forEach(d => { if (isDay(d) && int(o.ch[d], 0, MAXQ)) it.ch[d] = o.ch[d]; });
        it.pauses = Array.isArray(o.pauses) ? o.pauses.filter(p => p && isDay(p.from) && isDay(p.to) && p.from <= p.to).map(p => ({ id: str(p.id, 40) || newId(), from: p.from, to: p.to })) : [];
        if (o.pay && typeof o.pay === 'object') Object.keys(o.pay).forEach(m => {
            if (!isMonth(m) || !Array.isArray(o.pay[m])) return;
            const list = o.pay[m].filter(x => x && isDay(x.d) && int(x.c, 1, MAXPAY)).map(x => ({ id: str(x.id, 40) || newId(), d: x.d, c: x.c }));
            if (list.length) it.pay[m] = list;
        });
        return it;
    }
    function cleanState(o) {
        if (!o || typeof o !== 'object' || !Array.isArray(o.items)) return null;
        const s = emptyState();
        s.cur = SYMBOLS.includes(o.cur) ? o.cur : '';
        const seen = new Set();
        o.items.slice(0, 30).forEach(x => { const it = cleanItem(x); if (it && !seen.has(it.id)) { seen.add(it.id); s.items.push(it); } });
        return s;
    }

    const api = { MAXP, MAXQ, MAXPAY, SYMBOLS, UNITS, DAYS, parseAmount, parseQty, fmt, fmtQty, unitWord, qtyText, costOf,
        dayStr, toDate, isDay, isMonth, addDays, daysBetween, monthOf, addMonth, daysIn, firstDay, lastDay, weekday, niceDate, shortDate, dayName, monthName, plural, dayList, rangeList,
        newItem, planOn, pausedOn, scheduledOn, dayInfo, monthBill, paidIn, broughtForward, monthView, usualText, segLine, balanceText, summaryText,
        emptyState, cleanItem, cleanState, newId };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MDL = api;
})(typeof window !== 'undefined' ? window : this);
