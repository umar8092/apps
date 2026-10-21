// Rent Payment Log and Receipts: the logic, with no page code, so tests.js can check it in Node and in test.html.
// Money is whole cents (integers). Dates are local 'YYYY-MM-DD', months 'YYYY-MM'.
// Rent is charged per calendar month and is due on the tenancy's due day (the last day in shorter months).
// Payments pay the oldest rent first, so "paid up to" and "owed" never depend on what a payment was meant for.
(function (root) {
    'use strict';
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const METHODS = { cash: 'cash', bank: 'bank transfer', wallet: 'mobile wallet', cheque: 'cheque', card: 'card', other: 'other' };
    const LIMITS = { place: 80, name: 60, note: 120, maxCents: 100000000000, aheadMonths: 120 };

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
    function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;
    const isYm = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
    const todayIso = now => iso(now || new Date());
    function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
    const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
    const ymOf = s => s.slice(0, 7);
    function addMonths(ym, n) { const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n; return (y + Math.floor(m / 12)) + '-' + pad(((m % 12) + 12) % 12 + 1); }
    const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
    const daysInMonth = ym => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
    function fmtDate(s) { const d = parse(s); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); }
    function fmtDateY(s) { const d = parse(s); return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear(); }
    const fmtMonth = ym => MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    // the day rent for a month is due: the due day, or the last day of a short month
    const dueDateOf = (ym, day) => ym + '-' + pad(Math.min(day, daysInMonth(ym)));

    // ---------- money ----------
    // "30,000", "30000.50", "1,25,000" -> cents; anything else NaN. Negative and more than 2 decimals are refused.
    function readMoney(s) {
        const t = String(s == null ? '' : s).replace(/[\s,]/g, '');
        if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) return NaN;
        const [w, f = ''] = t.split('.');
        return Number(w) * 100 + Number((f + '00').slice(0, 2));
    }
    // groups digits: international 1,234,567 or South Asian 12,34,567
    function group(n, style) {
        const s = String(n);
        if (style === 'sa' && s.length > 3) { const last = s.slice(-3), rest = s.slice(0, -3); return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last; }
        return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    function fmtMoney(c, cur, style) {
        const neg = c < 0, a = Math.abs(c), w = Math.floor(a / 100), f = a % 100;
        const num = group(w, style) + (f ? '.' + pad(f) : '');
        return (neg ? '-' : '') + (cur ? cur + (/^[A-Za-z]/.test(cur) ? ' ' : '') : '') + num;
    }
    // amount in words for receipts: "thirty thousand five hundred", or in lakh and crore
    const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    function under100(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''); }
    function under1000(n) { const h = Math.floor(n / 100), r = n % 100; return (h ? ONES[h] + ' hundred' + (r ? ' ' : '') : '') + (r || !h ? under100(r) : ''); }
    function words(n, style) {
        if (n === 0) return 'zero';
        const parts = [];
        const scales = style === 'sa' ? [[1e7, 'crore'], [1e5, 'lakh'], [1e3, 'thousand']] : [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
        for (const [v, name] of scales) {
            if (n >= v) { const k = Math.floor(n / v); parts.push((k >= 1000 || (style === 'sa' && k >= 100 && v === 1e7) ? words(k, style) : under1000(k)) + ' ' + name); n %= v; }
        }
        if (n) parts.push(under1000(n));
        return parts.join(' ');
    }
    function moneyWords(c, style) {
        const w = Math.floor(c / 100), f = c % 100;
        const t = words(w, style) + (f ? ' and ' + pad(f) + '/100' : '') + ' only';
        return t.charAt(0).toUpperCase() + t.slice(1);
    }
    const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

    // ---------- one tenancy ----------
    // t: { id, place, tenant, landlord, rents: [{from:'YYYY-MM', amt}], due, start, firstByDays, end, deposit, payments: [{id, n, d, amt, method, note}], nextN }
    function rentFor(t, ym) { let a = 0; t.rents.slice().sort((x, y) => (x.from < y.from ? -1 : 1)).forEach(r => { if (r.from <= ym) a = r.amt; }); return a; }
    const roundLike = (exact, base) => (base % 100 === 0 ? Math.round(exact / 100) * 100 : Math.round(exact));
    // the rent for one month: a part month is charged by days when the person chose it
    function chargeFor(t, ym) {
        const full = rentFor(t, ym), dim = daysInMonth(ym);
        const sm = ymOf(t.start), em = t.end ? ymOf(t.end) : '';
        let from = 1, to = dim;
        if (ym === sm) from = Number(t.start.slice(8));
        if (ym === em) to = Number(t.end.slice(8));
        const days = to - from + 1;
        if (!t.firstByDays || days === dim) return { amt: full, days, full: true };
        return { amt: roundLike(full * days / dim, full), days, full: false };
    }
    function sortedPayments(t) { return t.payments.slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.id - b.id)); }
    const totalPaid = t => t.payments.reduce((s, p) => s + p.amt, 0);

    // every month from move-in to this month (or the move-out month), plus enough later months to show money paid ahead
    function ledger(t, today) {
        const sm = ymOf(t.start), lastDue = t.end ? (ymOf(t.end) < ymOf(today) ? ymOf(t.end) : ymOf(today)) : ymOf(today);
        const endYm = t.end ? ymOf(t.end) : null;
        let pool = totalPaid(t);
        const rows = [];
        const push = ym => {
            const ch = chargeFor(t, ym);
            let due = dueDateOf(ym, t.due);
            if (ym === sm && due < t.start) due = t.start; // moving in after the due day: the first rent is due on the day they move in
            const paid = Math.min(pool, ch.amt); pool -= paid;
            rows.push({ ym, amt: ch.amt, full: ch.full, days: ch.days, due, paid, left: ch.amt - paid, isDue: due <= today });
        };
        let ym = sm;
        for (; ym <= lastDue; ym = addMonths(ym, 1)) push(ym);
        // later months: the ones the money paid ahead covers, then the first one still to pay
        for (let extra = 0; (!endYm || ym <= endYm) && extra <= LIMITS.aheadMonths; extra++, ym = addMonths(ym, 1)) {
            push(ym);
            if (rows[rows.length - 1].left > 0) break;
        }
        const dueRows = rows.filter(r => r.isDue);
        const charged = dueRows.reduce((s, r) => s + r.amt, 0);
        const paidAll = totalPaid(t);
        const owed = dueRows.reduce((s, r) => s + r.left, 0);
        const firstUnpaid = dueRows.find(r => r.left > 0) || null;
        const next = rows.find(r => !r.isDue && r.left > 0) || null;
        let upTo = null; for (const r of rows) { if (r.left === 0) upTo = r.ym; else break; }
        const ahead = Math.max(0, paidAll - charged);                      // paid towards rent not due yet
        const over = endYm ? Math.max(0, paidAll - rows.reduce((s, r) => s + r.amt, 0)) : 0; // moved out and paid too much
        return { rows, charged, paid: paidAll, owed, ahead, over, upTo, firstUnpaid, lateDays: firstUnpaid ? diffDays(firstUnpaid.due, today) : 0, next, ended: !!t.end && t.end < today };
    }

    // what each payment paid for, oldest rent first
    function coverage(t) {
        // months long enough to place every payment
        const rows = []; let ym = ymOf(t.start), need = totalPaid(t);
        const endYm = t.end ? ymOf(t.end) : null;
        while (need > 0 && (!endYm || ym <= endYm) && rows.length < 2400) {
            const ch = chargeFor(t, ym);
            rows.push({ ym, amt: ch.amt, left: ch.amt }); need -= ch.amt; ym = addMonths(ym, 1);
        }
        const out = {}; let i = 0;
        sortedPayments(t).forEach(p => {
            let money = p.amt; const pieces = [];
            while (money > 0 && i < rows.length) {
                const r = rows[i], take = Math.min(money, r.left), before = r.left;
                r.left -= take; money -= take;
                pieces.push({ ym: r.ym, amt: take, rent: r.amt, whole: take === r.amt, rest: before < r.amt && r.left === 0 });
                if (r.left === 0) i++;
            }
            out[p.id] = { pieces, extra: money };
        });
        return out;
    }
    function coverText(cv, cur, style) {
        if (!cv) return '';
        const parts = [], wholes = [];
        const flush = () => { if (!wholes.length) return; parts.push(wholes.length === 1 ? 'rent for ' + fmtMonth(wholes[0]) : 'rent for ' + fmtMonth(wholes[0]) + ' to ' + fmtMonth(wholes[wholes.length - 1])); wholes.length = 0; };
        cv.pieces.forEach(p => {
            if (p.whole) { wholes.push(p.ym); return; }
            flush();
            parts.push((p.rest ? 'the rest of the rent for ' : 'part of the rent for ') + fmtMonth(p.ym) + ' (' + fmtMoney(p.amt, cur, style) + ' of ' + fmtMoney(p.rent, cur, style) + ')');
        });
        flush();
        if (cv.extra > 0) parts.push(fmtMoney(cv.extra, cur, style) + ' more than the rent owed');
        return parts.join(', ');
    }
    // owed after a payment: rent due by that payment's day minus everything paid up to and including it
    function balanceAfter(t, payId) {
        const ps = sortedPayments(t), idx = ps.findIndex(p => p.id === payId); if (idx < 0) return 0;
        const day = ps[idx].d; let paid = 0; for (let k = 0; k <= idx; k++) paid += ps[k].amt;
        let charged = 0, ym = ymOf(t.start);
        const endYm = t.end ? ymOf(t.end) : null;
        while (ym <= ymOf(day) && (!endYm || ym <= endYm)) {
            let due = dueDateOf(ym, t.due); if (ym === ymOf(t.start) && due < t.start) due = t.start;
            if (due <= day) charged += chargeFor(t, ym).amt;
            ym = addMonths(ym, 1);
        }
        return charged - paid;
    }

    // a year's statement: each month's rent, what was paid towards it, and the payments made in the year
    function statement(t, year, today) {
        const lg = ledger(t, today);
        const rows = lg.rows.filter(r => r.ym.slice(0, 4) === String(year) && (r.isDue || r.paid > 0));
        const pays = sortedPayments(t).filter(p => p.d.slice(0, 4) === String(year));
        return { rows, due: rows.reduce((s, r) => s + r.amt, 0), paidTowards: rows.reduce((s, r) => s + r.paid, 0), left: rows.reduce((s, r) => s + (r.isDue ? r.left : 0), 0), payments: pays, received: pays.reduce((s, p) => s + p.amt, 0) };
    }
    function statementText(t, year, today, cur, style) {
        const st = statement(t, year, today), L = [];
        L.push('Rent statement ' + year + ': ' + t.place);
        L.push('Tenant: ' + t.tenant + (t.landlord ? '. Landlord: ' + t.landlord : ''));
        L.push('');
        st.rows.forEach(r => L.push(fmtMonth(r.ym) + ': rent ' + fmtMoney(r.amt, cur, style) + ', paid ' + fmtMoney(r.paid, cur, style) + (r.left && r.isDue ? ', owed ' + fmtMoney(r.left, cur, style) : r.left ? ', not due yet' : '')));
        L.push('');
        L.push('Payments received in ' + year + ':');
        if (!st.payments.length) L.push('none');
        st.payments.forEach(p => L.push(fmtDateY(p.d) + ': ' + fmtMoney(p.amt, cur, style) + ' by ' + METHODS[p.method] + (p.note ? ' (' + p.note + ')' : '')));
        L.push('');
        L.push('Total rent for these months: ' + fmtMoney(st.due, cur, style));
        L.push('Total received in ' + year + ': ' + fmtMoney(st.received, cur, style));
        L.push('Still owed for these months: ' + fmtMoney(st.left, cur, style));
        return L.join('\n');
    }
    function receiptText(t, p, today, cur, style) {
        const cv = coverage(t)[p.id], bal = balanceAfter(t, p.id);
        const L = ['RENT RECEIPT No. ' + p.n, 'Date: ' + fmtDateY(p.d), '',
            'Received from ' + t.tenant + ' the sum of ' + fmtMoney(p.amt, cur, style) + ' (' + moneyWords(p.amt, style) + ') by ' + METHODS[p.method] + ',',
            'for ' + (coverText(cv, cur, style) || 'rent') + ',', 'at ' + t.place + '.'];
        if (p.note) L.push('Note: ' + p.note);
        L.push(bal > 0 ? 'Rent still owed after this payment: ' + fmtMoney(bal, cur, style) + '.' : bal < 0 ? 'Paid ahead after this payment: ' + fmtMoney(-bal, cur, style) + '.' : 'No rent owed after this payment.');
        L.push('', 'Received by: ' + (t.landlord || '____________________'), 'Signature: ____________________');
        return L.join('\n');
    }

    // ---------- checks ----------
    function checkTenancy(x, today) {
        const e = {};
        if (!x.place) e.place = 'Type the flat, house or room, such as "Flat 2, 14 Garden Road".';
        if (!x.tenant) e.tenant = 'Type the tenant\'s name.';
        if (!Number.isInteger(x.rent) || x.rent <= 0) e.rent = 'Type the monthly rent, such as 30000.';
        else if (x.rent > LIMITS.maxCents) e.rent = 'That rent is too large. Check the number.';
        if (!Number.isInteger(x.due) || x.due < 1 || x.due > 31) e.due = 'Pick the day of the month the rent is due.';
        if (!isIso(x.start)) e.start = 'Pick the day the tenancy started (the move-in day).';
        else if (diffDays(today, x.start) > 366) e.start = 'That is more than a year away. Check the year.';
        else if (x.start < '1990-01-01') e.start = 'Check the year.';
        if (x.deposit != null && (!Number.isInteger(x.deposit) || x.deposit < 0 || x.deposit > LIMITS.maxCents)) e.deposit = 'Type the deposit, such as 60000, or leave it empty.';
        return e;
    }
    function checkPayment(t, x, today) {
        const e = {};
        if (!isIso(x.d)) e.d = 'Pick the day it was paid.';
        else if (x.d > today) e.d = 'That day has not come yet.';
        else if (diffDays(x.d, t.start) > 366) e.d = 'That is more than a year before the tenancy started. Check the year.';
        if (!Number.isInteger(x.amt) || x.amt <= 0) e.amt = 'Type the amount paid, such as 30000.';
        else if (x.amt > LIMITS.maxCents) e.amt = 'That amount is too large. Check the number.';
        if (!METHODS[x.method]) e.method = 'Pick how it was paid.';
        return e;
    }
    function checkRentChange(t, from, amt) {
        if (!isYm(from)) return 'Pick the month the new rent starts.';
        if (from <= ymOf(t.start)) return 'The new rent must start after the first month (' + fmtMonth(ymOf(t.start)) + '). To fix the first rent, use Edit.';
        if (!Number.isInteger(amt) || amt <= 0 || amt > LIMITS.maxCents) return 'Type the new monthly rent, such as 32000.';
        return '';
    }
    function setRent(t, from, amt) { t.rents = t.rents.filter(r => r.from !== from).concat([{ from, amt }]).sort((a, b) => (a.from < b.from ? -1 : 1)); }

    // the summary for all tenancies this month
    function monthSummary(s, today) {
        const ym = ymOf(today), out = { ym, due: 0, collected: 0, owing: [] };
        s.tenancies.forEach(t => {
            if (t.start > today && ymOf(t.start) > ym) return;
            const lg = ledger(t, today), r = lg.rows.find(x => x.ym === ym);
            if (r) { out.due += r.amt; out.collected += r.paid; }
            if (lg.owed > 0) out.owing.push({ id: t.id, tenant: t.tenant, place: t.place, owed: lg.owed, late: lg.lateDays, from: lg.firstUnpaid.ym });
        });
        return out;
    }
    function summaryText(s, today) {
        const cur = s.cur, st = s.style, L = ['Rent summary, ' + fmtDateY(today)];
        s.tenancies.forEach(t => {
            const lg = ledger(t, today);
            L.push('');
            L.push(t.place + ' (' + t.tenant + ')' + (lg.ended ? ', moved out' : ''));
            L.push(lg.upTo ? 'Paid up to ' + fmtMonth(lg.upTo) : 'No month paid in full yet');
            if (lg.owed) L.push('Owed: ' + fmtMoney(lg.owed, cur, st) + ' since ' + fmtMonth(lg.firstUnpaid.ym));
            if (lg.ahead && !lg.ended) L.push('Paid ahead: ' + fmtMoney(lg.ahead, cur, st));
        });
        return L.join('\n');
    }

    // ---------- saved state ----------
    const emptyState = () => ({ v: 1, cur: '', style: 'intl', tenancies: [], nextId: 1 });
    const CURRENCIES = ['', '$', '€', '£', '₹', 'Rs', 'PKR', 'AED', 'SAR', '৳', '₦', 'R', 'KSh', 'RM', 'A$', 'C$'];
    function validate(o) {
        if (!o || typeof o !== 'object' || o.v !== 1 || !Array.isArray(o.tenancies)) return null;
        const s = emptyState();
        s.cur = CURRENCIES.includes(o.cur) ? o.cur : '';
        s.style = o.style === 'sa' ? 'sa' : 'intl';
        const ids = new Set(); let maxId = 0;
        for (const x of o.tenancies.slice(0, 200)) {
            if (!x || !Number.isInteger(x.id) || x.id < 1 || ids.has(x.id)) return null;
            const t = { id: x.id, place: cleanText(x.place, LIMITS.place), tenant: cleanText(x.tenant, LIMITS.name), landlord: cleanText(x.landlord, LIMITS.name),
                rents: [], due: x.due, start: x.start, firstByDays: x.firstByDays === true, end: isIso(x.end) ? x.end : '', deposit: null, payments: [], nextN: 1 };
            if (!t.place || !t.tenant || !Number.isInteger(t.due) || t.due < 1 || t.due > 31 || !isIso(t.start) || (t.end && t.end < t.start)) return null;
            if (!Array.isArray(x.rents) || !x.rents.length) return null;
            for (const r of x.rents) { if (!r || !isYm(r.from) || !Number.isInteger(r.amt) || r.amt <= 0 || r.amt > LIMITS.maxCents) return null; t.rents.push({ from: r.from, amt: r.amt }); }
            t.rents.sort((a, b) => (a.from < b.from ? -1 : 1));
            if (t.rents[0].from > ymOf(t.start)) return null;
            if (x.deposit) {
                const d = x.deposit;
                if (!Number.isInteger(d.amt) || d.amt < 0 || d.amt > LIMITS.maxCents) return null;
                t.deposit = { amt: d.amt, back: Number.isInteger(d.back) && d.back >= 0 && d.back <= d.amt ? d.back : null, backDate: isIso(d.backDate) ? d.backDate : '' };
                if (t.deposit.back === null) t.deposit.backDate = '';
            }
            if (!Array.isArray(x.payments)) return null;
            const pids = new Set(); let maxN = 0;
            for (const p of x.payments.slice(0, 5000)) {
                if (!p || !Number.isInteger(p.id) || pids.has(p.id) || !isIso(p.d) || !Number.isInteger(p.amt) || p.amt <= 0 || p.amt > LIMITS.maxCents || !METHODS[p.method] || !Number.isInteger(p.n) || p.n < 1) return null;
                pids.add(p.id); maxN = Math.max(maxN, p.n); maxId = Math.max(maxId, p.id);
                t.payments.push({ id: p.id, n: p.n, d: p.d, amt: p.amt, method: p.method, note: cleanText(p.note, LIMITS.note) });
            }
            t.nextN = Math.max(Number.isInteger(x.nextN) ? x.nextN : 1, maxN + 1);
            ids.add(t.id); maxId = Math.max(maxId, t.id);
            s.tenancies.push(t);
        }
        s.nextId = Math.max(Number.isInteger(o.nextId) ? o.nextId : 1, maxId + 1);
        return s;
    }

    const api = { MONTHS, METHODS, LIMITS, CURRENCIES, isIso, isYm, todayIso, addDays, diffDays, ymOf, addMonths, monthsBetween, daysInMonth, fmtDate, fmtDateY, fmtMonth, plural, dueDateOf,
        readMoney, group, fmtMoney, words, moneyWords, cleanText, rentFor, chargeFor, sortedPayments, totalPaid, ledger, coverage, coverText, balanceAfter, statement, statementText,
        receiptText, checkTenancy, checkPayment, checkRentChange, setRent, monthSummary, summaryText, emptyState, validate };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.RentCore = api;
})(this);
