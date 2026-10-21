// School Fee and Tuition Payment Tracker: the logic, with no page code, so tests.js can check it in Node and in test.html.
// Money is whole cents (integers). Dates are local 'YYYY-MM-DD', months 'YYYY-MM'.
// Each fee is charged once per period (every 1, 2, 3, 4, 6 or 12 months, or only once) starting from its first month,
// and is due on the fee's due day of the period's first month (the last day in shorter months).
// Payments pay the oldest fee first, so "paid up to" and "owes" never depend on what a payment was meant for.
(function (root) {
    'use strict';
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const EVERY = { 1: 'every month', 2: 'every 2 months', 3: 'every 3 months', 4: 'every 4 months', 6: 'every 6 months', 12: 'once a year', 0: 'only once' };
    const LIMITS = { name: 50, fee: 50, school: 60, note: 120, maxCents: 100000000000, children: 30, fees: 30, payments: 3000 };
    const SOON_DAYS = 7;

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
    const shortMonth = ym => MONTHS[Number(ym.slice(5, 7)) - 1].slice(0, 3) + ' ' + ym.slice(0, 4);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
    // the day a fee is due in a month: the due day, or the last day of a short month
    const dueDateOf = (ym, day) => ym + '-' + pad(Math.min(day, daysInMonth(ym)));

    // ---------- money ----------
    // "3,500", "3500.50", "1,25,000" -> cents; anything else NaN. Negative and more than 2 decimals are refused.
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
    const centsToInput = c => (c / 100).toFixed(c % 100 ? 2 : 0);
    const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

    // ---------- one fee ----------
    // fee: { id, name, amts: [{from:'YYYY-MM', amt}], every, due, start:'YYYY-MM', end:'' | 'YYYY-MM' (last month charged), skip: [month numbers 1-12], payments: [{id, d, amt, note, photo}] }
    function amountFor(fee, ym) { let a = fee.amts[0].amt; fee.amts.forEach(r => { if (r.from <= ym) a = r.amt; }); return a; }
    const lastMonthOf = (fee, ym) => (fee.every > 1 ? addMonths(ym, fee.every - 1) : ym);
    function periodLabel(fee, ym) {
        if (fee.every <= 1) return fmtMonth(ym);
        return shortMonth(ym) + ' to ' + shortMonth(lastMonthOf(fee, ym));
    }
    const isSkipped = (fee, ym) => fee.every === 1 && fee.skip.includes(Number(ym.slice(5, 7)));
    function row(fee, ym, today) {
        const skip = isSkipped(fee, ym), due = dueDateOf(ym, fee.due);
        return { ym, last: lastMonthOf(fee, ym), label: periodLabel(fee, ym), skip, amt: skip ? 0 : amountFor(fee, ym), due, isDue: due <= today, paid: 0, left: 0 };
    }
    const totalPaid = fee => fee.payments.reduce((s, p) => s + p.amt, 0);
    function sortedPayments(fee) { return fee.payments.slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.id - b.id)); }

    // every period from the first month up to untilYm, longer while money paid is left over, and (when asked) up to the first unpaid period after today
    function allocate(fee, untilYm, today, wantNext) {
        let pool = totalPaid(fee);
        const rows = [];
        let ym = fee.start, ended = false;
        for (let i = 0; i < 2400; i++) {
            if (fee.every === 0 && i > 0) { ended = true; break; }
            if (fee.end && ym > fee.end) { ended = true; break; }
            if (ym > untilYm && pool === 0 && (!wantNext || rows.some(r => !r.isDue && r.left > 0))) break;
            if (ym > untilYm && monthsBetween(untilYm, ym) > 240) break;     // never look more than 20 years ahead
            const r = row(fee, ym, today);
            r.paid = Math.min(pool, r.amt); pool -= r.paid; r.left = r.amt - r.paid;
            rows.push(r);
            ym = addMonths(ym, fee.every || 1);
        }
        return { rows, extra: ended ? pool : 0 };
    }

    // where one fee stands today
    function ledger(fee, today) {
        const tym = ymOf(today);
        const { rows, extra } = allocate(fee, tym, today, true);
        const dueRows = rows.filter(r => r.isDue && r.amt > 0);
        const owed = dueRows.reduce((s, r) => s + r.left, 0);
        const unpaid = dueRows.filter(r => r.left > 0);
        const firstUnpaid = unpaid[0] || null;
        const next = rows.find(r => !r.isDue && r.left > 0) || null;
        let upTo = null; for (const r of rows) { if (r.skip) continue; if (r.left === 0) upTo = r; else break; }
        const ahead = rows.filter(r => !r.isDue).reduce((s, r) => s + r.paid, 0);
        const stopped = fee.every !== 0 && !!fee.end && fee.end < tym;        // no more fees after the last month
        return { rows, owed, unpaid, firstUnpaid, lateDays: firstUnpaid ? diffDays(firstUnpaid.due, today) : 0, next, upTo, ahead, over: extra, stopped, notStarted: fee.start > tym };
    }

    // what each payment paid for, oldest fee first
    function coverage(fee, today) {
        const need = totalPaid(fee);
        const rows = []; let ym = fee.start, sum = 0;
        for (let i = 0; i < 2400 && sum < need; i++) {
            if ((fee.every === 0 && i > 0) || (fee.end && ym > fee.end)) break;
            const r = row(fee, ym, today); if (r.amt > 0) { r.left = r.amt; rows.push(r); sum += r.amt; }
            ym = addMonths(ym, fee.every || 1);
        }
        const out = {}; let i = 0;
        sortedPayments(fee).forEach(p => {
            let money = p.amt; const pieces = [];
            while (money > 0 && i < rows.length) {
                const r = rows[i], take = Math.min(money, r.left), before = r.left;
                r.left -= take; money -= take;
                pieces.push({ label: r.label, amt: take, fee: r.amt, whole: take === r.amt, rest: before < r.amt && r.left === 0 });
                if (r.left === 0) i++;
            }
            out[p.id] = { pieces, extra: money };
        });
        return out;
    }
    function coverText(cv, cur, style) {
        if (!cv) return '';
        const parts = [], wholes = [];
        const flush = () => { if (!wholes.length) return; parts.push(wholes.length === 1 ? wholes[0] : wholes[0] + ', ' + (wholes.length > 2 ? '... ' : '') + wholes[wholes.length - 1] + ' (' + wholes.length + ' in all)'); wholes.length = 0; };
        cv.pieces.forEach(p => {
            if (p.whole) { wholes.push(p.label); return; }
            flush();
            parts.push((p.rest ? 'the rest of ' : 'part of ') + p.label + ' (' + fmtMoney(p.amt, cur, style) + ' of ' + fmtMoney(p.fee, cur, style) + ')');
        });
        flush();
        if (cv.extra > 0) parts.push(fmtMoney(cv.extra, cur, style) + ' more than the fee');
        return parts.join(', ');
    }

    // ---------- a child, a year ----------
    // fees for the months of one calendar year: what they come to, what is paid, owed (due already) and still to come
    function yearSummary(child, year, today) {
        const out = { year, total: 0, paid: 0, owed: 0, toCome: 0, received: 0, fees: [] };
        child.fees.forEach(fee => {
            const until = String(year) + '-12' > ymOf(today) ? String(year) + '-12' : ymOf(today);
            const rows = allocate(fee, until, today, false).rows.filter(r => r.ym.slice(0, 4) === String(year) && r.amt > 0);
            const f = { fee, rows, total: 0, paid: 0, owed: 0, toCome: 0 };
            rows.forEach(r => { f.total += r.amt; f.paid += r.paid; if (r.isDue) f.owed += r.left; else f.toCome += r.left; });
            const pays = sortedPayments(fee).filter(p => p.d.slice(0, 4) === String(year));
            f.payments = pays; f.received = pays.reduce((s, p) => s + p.amt, 0);
            out.total += f.total; out.paid += f.paid; out.owed += f.owed; out.toCome += f.toCome; out.received += f.received;
            if (rows.length || pays.length) out.fees.push(f);
        });
        return out;
    }
    function childStatus(child, today) {
        let owed = 0, late = 0;
        child.fees.forEach(f => { const lg = ledger(f, today); owed += lg.owed; if (lg.owed) late = Math.max(late, lg.lateDays); });
        return { owed, late };
    }

    // the whole family today: what is late, what is due in the next 7 days, and what is left to pay this month
    function familySummary(s, today) {
        const tym = ymOf(today), soonEnd = addDays(today, SOON_DAYS);
        const out = { late: [], soon: [], monthLeft: 0, owed: 0, ym: tym };
        s.children.forEach(c => c.fees.forEach(fee => {
            const lg = ledger(fee, today);
            if (lg.owed) {
                out.owed += lg.owed;
                out.late.push({ child: c, fee, owed: lg.owed, from: lg.firstUnpaid, count: lg.unpaid.length, late: lg.lateDays });
            }
            out.monthLeft += lg.owed;
            lg.rows.forEach(r => { if (!r.isDue && r.left > 0 && ymOf(r.due) === tym) out.monthLeft += r.left; });
            const nx = lg.rows.filter(r => !r.isDue && r.left > 0 && r.due <= soonEnd);
            nx.forEach(r => out.soon.push({ child: c, fee, row: r, amt: r.left, part: r.paid > 0, days: diffDays(today, r.due) }));
        }));
        out.late.sort((a, b) => b.late - a.late);
        out.soon.sort((a, b) => (a.row.due < b.row.due ? -1 : a.row.due > b.row.due ? 1 : 0));
        return out;
    }

    // ---------- text to copy or send ----------
    function feeLine(fee, lg, cur, style) {
        const parts = [];
        if (lg.notStarted) parts.push('starts ' + fmtMonth(fee.start));
        else if (fee.every === 0) parts.push(lg.owed ? 'not paid' : lg.rows[0] && lg.rows[0].left === 0 ? 'paid' : 'not due yet');
        else parts.push(lg.upTo ? 'paid up to ' + fmtMonth(lg.upTo.last) : 'nothing paid yet');
        if (lg.owed) parts.push('owes ' + fmtMoney(lg.owed, cur, style) + (lg.lateDays > 0 ? ' (' + plural(lg.lateDays, 'day', 'days') + ' late)' : ' (due today)'));
        if (lg.next && !lg.owed) parts.push('next ' + fmtMoney(lg.next.left, cur, style) + ' due ' + fmtDateY(lg.next.due));
        return fee.name + ' (' + fmtMoney(amountFor(fee, ymOf(lg.rows.length ? lg.rows[lg.rows.length - 1].ym : fee.start)), cur, style) + ' ' + EVERY[fee.every] + '): ' + parts.join(', ');
    }
    function summaryText(s, today) {
        const cur = s.cur, st = s.style, L = ['School fees, ' + fmtDateY(today)];
        s.children.forEach(c => {
            L.push('');
            L.push(c.name + (c.school ? ' (' + c.school + ')' : ''));
            if (!c.fees.length) L.push('No fees added');
            c.fees.forEach(f => L.push('- ' + feeLine(f, ledger(f, today), cur, st)));
        });
        const fam = familySummary(s, today);
        L.push('');
        L.push(fam.owed ? 'Owed now: ' + fmtMoney(fam.owed, cur, st) : 'Nothing owed today.');
        return L.join('\n');
    }
    function statementText(child, year, today, cur, style) {
        const ys = yearSummary(child, year, today), L = [];
        L.push('Fee statement ' + year + ': ' + child.name + (child.school ? ', ' + child.school : ''));
        L.push('Made on ' + fmtDateY(today));
        ys.fees.forEach(f => {
            L.push('');
            L.push(f.fee.name + ' (' + EVERY[f.fee.every] + ')');
            f.rows.forEach(r => L.push(r.label + ': fee ' + fmtMoney(r.amt, cur, style) + ', paid ' + fmtMoney(r.paid, cur, style) + (r.left ? (r.isDue ? ', owed ' + fmtMoney(r.left, cur, style) : ', not due yet') : '')));
            if (f.payments.length) {
                L.push('Payments made in ' + year + ':');
                f.payments.forEach(p => L.push('  ' + fmtDateY(p.d) + ': ' + fmtMoney(p.amt, cur, style) + (p.note ? ' (' + p.note + ')' : '')));
            }
        });
        if (!ys.fees.length) L.push('', 'No fees in ' + year + '.');
        L.push('');
        L.push('Fees for ' + year + ': ' + fmtMoney(ys.total, cur, style));
        L.push('Paid towards them: ' + fmtMoney(ys.paid, cur, style));
        L.push('Owed now: ' + fmtMoney(ys.owed, cur, style));
        if (ys.toCome) L.push('Still to come this year: ' + fmtMoney(ys.toCome, cur, style));
        return L.join('\n');
    }

    // ---------- checks ----------
    function checkFee(x, today) {
        const e = {};
        if (x.newChild !== false && !x.child) e.child = 'Type the child\'s name, such as "Ali".';
        if (!x.name) e.name = 'Type what the fee is for, or tap one of the buttons above, such as School fee.';
        if (!Number.isInteger(x.amt) || x.amt <= 0) e.amt = 'Type the fee, such as 8000.';
        else if (x.amt > LIMITS.maxCents) e.amt = 'That fee is too large. Check the number.';
        if (!Object.prototype.hasOwnProperty.call(EVERY, String(x.every))) e.every = 'Pick how often it is paid.';
        if (!Number.isInteger(x.due) || x.due < 1 || x.due > 31) e.due = 'Pick the day it is due.';
        if (!isYm(x.start)) e.start = 'Pick the first month to track.';
        else if (monthsBetween(ymOf(today), x.start) > 12) e.start = 'That is more than a year away. Check the year.';
        else if (x.start < '2000-01') e.start = 'Check the year.';
        return e;
    }
    function checkPayment(fee, x, today) {
        const e = {};
        if (!isIso(x.d)) e.d = 'Pick the day it was paid.';
        else if (x.d > today) e.d = 'That day has not come yet.';
        else if (monthsBetween(ymOf(x.d), fee.start) > 12) e.d = 'That is more than a year before this fee starts (' + fmtMonth(fee.start) + '). Check the year.';
        if (!Number.isInteger(x.amt) || x.amt <= 0) e.amt = 'Type the amount paid, such as 8000.';
        else if (x.amt > LIMITS.maxCents) e.amt = 'That amount is too large. Check the number.';
        return e;
    }
    function checkChange(fee, from, amt) {
        if (!isYm(from)) return 'Pick the month the new fee starts.';
        if (from <= fee.start) return 'The new fee must start after the first month (' + fmtMonth(fee.start) + '). To fix the first amount, use Edit the fee.';
        if (!Number.isInteger(amt) || amt <= 0 || amt > LIMITS.maxCents) return 'Type the new fee, such as 9000.';
        return '';
    }
    function setAmount(fee, from, amt) { fee.amts = fee.amts.filter(r => r.from !== from).concat([{ from, amt }]).sort((a, b) => (a.from < b.from ? -1 : 1)); }
    function checkStop(fee, ym) {
        if (!isYm(ym)) return 'Pick the last month.';
        if (ym < fee.start) return 'Pick ' + fmtMonth(fee.start) + ' or later.';
        return '';
    }

    // ---------- saved state ----------
    const emptyState = () => ({ v: 1, cur: '', style: 'intl', children: [], nextId: 1 });
    const CURRENCIES = ['', '$', '€', '£', '₹', 'Rs', 'PKR', 'AED', 'SAR', '৳', '₦', 'R', 'KSh', 'RM', 'A$', 'C$'];
    function validate(o) {
        if (!o || typeof o !== 'object' || o.v !== 1 || !Array.isArray(o.children)) return null;
        const s = emptyState();
        s.cur = CURRENCIES.includes(o.cur) ? o.cur : '';
        s.style = o.style === 'sa' ? 'sa' : 'intl';
        const ids = new Set(); let maxId = 0;
        const useId = id => { if (!Number.isInteger(id) || id < 1 || ids.has(id)) return false; ids.add(id); maxId = Math.max(maxId, id); return true; };
        for (const c of o.children.slice(0, LIMITS.children)) {
            if (!c || !useId(c.id) || !Array.isArray(c.fees)) return null;
            const child = { id: c.id, name: cleanText(c.name, LIMITS.name), school: cleanText(c.school, LIMITS.school), fees: [] };
            if (!child.name) return null;
            for (const x of c.fees.slice(0, LIMITS.fees)) {
                if (!x || !useId(x.id)) return null;
                const f = { id: x.id, name: cleanText(x.name, LIMITS.fee), amts: [], every: x.every, due: x.due, start: x.start, end: isYm(x.end) ? x.end : '', skip: [], payments: [] };
                if (!f.name || !Object.prototype.hasOwnProperty.call(EVERY, String(f.every)) || typeof f.every !== 'number' || !Number.isInteger(f.due) || f.due < 1 || f.due > 31 || !isYm(f.start) || (f.end && f.end < f.start)) return null;
                if (!Array.isArray(x.amts) || !x.amts.length) return null;
                for (const r of x.amts.slice(0, 120)) { if (!r || !isYm(r.from) || !Number.isInteger(r.amt) || r.amt <= 0 || r.amt > LIMITS.maxCents) return null; f.amts.push({ from: r.from, amt: r.amt }); }
                f.amts.sort((a, b) => (a.from < b.from ? -1 : 1));
                if (Array.isArray(x.skip)) f.skip = [...new Set(x.skip.filter(m => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b);
                if (f.skip.length >= 12) f.skip = [];
                if (!Array.isArray(x.payments)) return null;
                for (const p of x.payments.slice(0, LIMITS.payments)) {
                    if (!p || !useId(p.id) || !isIso(p.d) || !Number.isInteger(p.amt) || p.amt <= 0 || p.amt > LIMITS.maxCents) return null;
                    f.payments.push({ id: p.id, d: p.d, amt: p.amt, note: cleanText(p.note, LIMITS.note), photo: typeof p.photo === 'string' && /^ph\d{1,12}$/.test(p.photo) ? p.photo : '' });
                }
                child.fees.push(f);
            }
            s.children.push(child);
        }
        s.nextId = Math.max(Number.isInteger(o.nextId) ? o.nextId : 1, maxId + 1);
        return s;
    }
    // every photo id the saved records point to
    function photoIds(s) { const out = new Set(); s.children.forEach(c => c.fees.forEach(f => f.payments.forEach(p => { if (p.photo) out.add(p.photo); }))); return out; }

    const api = { MONTHS, EVERY, LIMITS, CURRENCIES, SOON_DAYS, isIso, isYm, todayIso, addDays, diffDays, ymOf, addMonths, monthsBetween, daysInMonth, fmtDate, fmtDateY, fmtMonth, shortMonth, plural, ordinal, dueDateOf,
        readMoney, group, fmtMoney, centsToInput, cleanText, amountFor, periodLabel, isSkipped, totalPaid, sortedPayments, allocate, ledger, coverage, coverText,
        yearSummary, childStatus, familySummary, feeLine, summaryText, statementText, checkFee, checkPayment, checkChange, setAmount, checkStop, emptyState, validate, photoIds };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.FeeCore = api;
})(this);
