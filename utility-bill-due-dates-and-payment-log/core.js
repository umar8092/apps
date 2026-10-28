// Utility Bill Due Dates and Payment Log: the maths and the words. No page code here, so tests.js can run it in node.
// Money is kept in whole cents and dates as "2026-10-28" day strings counted in whole days, so every sum is exact.
(function (root) {
    'use strict';
    const MAXC = 10000000000;        // money up to 100,000,000 for one bill

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
        const n = Number(intPart || '0') * Math.pow(10, dec) + Number((fracPart + '0000').slice(0, dec) || '0');
        if (opt.max != null && n > opt.max) return { error: opt.big || 'That number is too big.' };
        if (opt.positive && n <= 0) return { error: opt.zero || 'Type a number bigger than 0.' };
        return { n };
    }
    const parseMoney = (t, opt) => parseNum(t, 2, Object.assign({ max: MAXC, blank: 'Type an amount, such as 120.', big: 'That amount is too big.', bad: 'Type an amount such as 120 or 33.50.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.' }, opt || {}));
    function parseCount(t, max, what) {
        const s = String(t == null ? '' : t).trim();
        if (!s) return { error: 'Type how many ' + what + '.' };
        if (!/^\d+$/.test(s)) return { error: 'Type a whole number, such as 4.' };
        const n = Number(s);
        if (n < 1) return { error: 'Type 1 or more.' };
        if (n > max) return { error: 'Type ' + max + ' or fewer.' };
        return { n };
    }

    // ---------- days ----------
    const pad = n => String(n).padStart(2, '0');
    const dNum = s => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
    function dStr(n) { const d = new Date(n * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2200 && dStr(dNum(s)) === s;
    const today = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    const addDays = (s, n) => dStr(dNum(s) + n);
    const daysBetween = (a, b) => dNum(b) - dNum(a);
    const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();   // m is 0-11
    // the same day of the month k months later; the 31st becomes the last day of a short month
    function addMonths(s, k, day) {
        const y = +s.slice(0, 4), m = +s.slice(5, 7) - 1 + k, d = day || +s.slice(8, 10);
        const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
        return yy + '-' + pad(mm + 1) + '-' + pad(Math.min(d, dim(yy, mm)));
    }
    const monthEnd = s => s.slice(0, 8) + pad(dim(+s.slice(0, 4), +s.slice(5, 7) - 1));
    const nextMonth = s => addMonths(s.slice(0, 8) + '01', 1);
    const prevMonthKey = (key, k) => addMonths(key + '-01', -(k == null ? 1 : k)).slice(0, 7);

    // ---------- one bill (one statement of an account) ----------
    // entry: { id, due, amt (cents), late (cents after the due date, 0 = none), pays: [{ id, on, amt, how, ref }] }
    // account: { id, name, kind, every (months between bills), day (usual due day 1-31 or 0), acct, payer, auto, closed, entries: [] }
    const sortBy = (list, k) => list.slice().sort((a, b) => a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0);
    // What the bill asks for now: the amount, or the late amount once the due date has passed without it being paid in full by then.
    function entryState(e, t) {
        const pays = sortBy(e.pays, 'on'), paid = pays.reduce((s, p) => s + p.amt, 0);
        const byDue = pays.filter(p => p.on <= e.due).reduce((s, p) => s + p.amt, 0);
        const lateApplies = e.late > e.amt && byDue < e.amt && (paid >= e.amt ? pays.length > 0 : t > e.due);
        const need = lateApplies ? e.late : e.amt;
        const left = Math.max(0, need - paid), extra = Math.max(0, paid - need);
        let st;
        if (need === 0) st = 'nothing';
        else if (left === 0) st = 'paid';
        else if (e.due < t) st = 'overdue';
        else if (e.due === t) st = 'today';
        else st = paid > 0 ? 'part' : 'due';
        const paidOn = left === 0 && pays.length ? pays[pays.length - 1].on : null;
        return { pays, paid, need, left, extra, st, lateApplies, paidOn, partial: paid > 0 && left > 0, onTime: left === 0 && (!paidOn || paidOn <= e.due) };
    }
    const isOpen = (e, t) => entryState(e, t).left > 0;

    // the next due date to suggest when the bill comes: after the last bill by the bill's interval, else the usual day on or after today
    function nextDue(a, t) {
        const es = sortBy(a.entries, 'due');
        if (es.length) return addMonths(es[es.length - 1].due, a.every || 1, a.day || +es[es.length - 1].due.slice(8, 10));
        if (a.day) {
            const here = addMonths(t.slice(0, 8) + '01', 0, a.day);
            return here >= t ? here : addMonths(t.slice(0, 8) + '01', 1, a.day);
        }
        return null;
    }
    function lastBill(a) { const es = sortBy(a.entries, 'due'); return es.length ? es[es.length - 1] : null; }
    // how this bill compares: same month last year when there is one, otherwise the bill before
    function compare(a, e) {
        const es = sortBy(a.entries, 'due'), i = es.findIndex(x => x.id === e.id);
        if (i < 0) return null;
        const yearAgo = e.due.slice(0, 7).replace(/^\d{4}/, y => String(+y - 1));
        let base = es.slice(0, i).reverse().find(x => x.due.slice(0, 7) === yearAgo), kind = 'year';
        if (!base) { base = i > 0 ? es[i - 1] : null; kind = 'last'; }
        if (!base || base.amt === 0) return null;
        const pct = Math.round((e.amt - base.amt) * 100 / base.amt);
        return { pct, kind, base, diff: e.amt - base.amt };
    }
    function analyse(a, t) {
        const es = sortBy(a.entries, 'due'), open = es.filter(e => isOpen(e, t)), last = es.length ? es[es.length - 1] : null;
        const next = a.closed ? null : nextDue(a, t);
        let st = 'none';
        const firstOpen = open[0] || null, s = firstOpen ? entryState(firstOpen, t) : null;
        if (a.closed) st = 'closed';
        else if (s) st = a.auto && s.st !== 'part' && !s.partial ? (firstOpen.due < t ? 'autocheck' : 'auto') : s.st;
        else if (!last && !next) st = 'none';
        else if (next && daysBetween(t, next) <= 7) st = 'expected';
        else st = last ? 'paid' : 'none';
        return { es, open, last, next, st, firstOpen, s, owed: open.reduce((x, e) => x + entryState(e, t).left, 0) };
    }

    // ---------- all accounts together ----------
    function summary(accts, t) {
        const me = monthEnd(t), week = addDays(t, 6), mkey = t.slice(0, 7), rows = [];
        accts.forEach(a => { if (a.closed) return; a.entries.forEach(e => { const s = entryState(e, t); if (s.left > 0) rows.push({ a, e, s }); }); });
        const by = (x, y) => x.e.due < y.e.due ? -1 : x.e.due > y.e.due ? 1 : 0;
        rows.sort(by);
        const sum = l => l.reduce((x, r) => x + r.s.left, 0);
        const overdue = rows.filter(r => r.e.due < t && !(r.a.auto && !r.s.partial));
        const autoCheck = rows.filter(r => r.e.due < t && r.a.auto && !r.s.partial);
        const soon = rows.filter(r => r.e.due >= t && r.e.due <= week);
        const byMonthEnd = rows.filter(r => r.e.due <= me);
        let paidMonth = 0, paidN = 0;
        accts.forEach(a => a.entries.forEach(e => e.pays.forEach(p => { if (p.on.slice(0, 7) === mkey) { paidMonth += p.amt; paidN++; } })));
        const notIn = accts.filter(a => { if (a.closed) return false; const x = analyse(a, t); return !x.open.length && x.next && daysBetween(t, x.next) <= 7; })
            .map(a => ({ a, next: nextDue(a, t) })).sort((x, y) => x.next < y.next ? -1 : 1);
        return { rows, overdue: { list: overdue, sum: sum(overdue) }, autoCheck, soon: { list: soon, sum: sum(soon) }, monthLeft: { list: byMonthEnd, sum: sum(byMonthEnd) },
            paidMonth, paidN, month: mkey, owed: sum(rows), notIn, active: accts.filter(a => !a.closed).length };
    }
    // money paid in each of the last n months (by the day it was paid), newest first
    function paidByMonth(accts, t, n) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const key = prevMonthKey(t.slice(0, 7), i);
            let sum = 0, cnt = 0;
            accts.forEach(a => a.entries.forEach(e => e.pays.forEach(p => { if (p.on.slice(0, 7) === key) { sum += p.amt; cnt++; } })));
            out.push({ month: key, sum, n: cnt });
        }
        return out;
    }

    // ---------- words ----------
    function fmtMoney(cents, cur, loc) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(loc || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        t = (cents < 0 ? '-' : '') + t;
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }
    const moneyInput = c => (c / 100).toFixed(c % 100 ? 2 : 0);
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    // "Mon 3 Nov", with the year when it is not this year: "Mon 15 Mar 2027"
    function fmtDate(s, t, opt) {
        opt = opt || {};
        const wd = WD[new Date(dNum(s) * 86400000).getUTCDay()];
        return (opt.noDay ? '' : wd + ' ') + (+s.slice(8, 10)) + ' ' + MON[+s.slice(5, 7) - 1] + (!t || s.slice(0, 4) !== t.slice(0, 4) || opt.year ? ' ' + s.slice(0, 4) : '');
    }
    const monthWords = (key, t) => MONTHS[+key.slice(5, 7) - 1] + (!t || key.slice(0, 4) !== t.slice(0, 4) ? ' ' + key.slice(0, 4) : '');
    const shortMonth = key => MON[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4);
    function rel(s, t) {
        const d = daysBetween(t, s);
        if (d === 0) return 'today';
        if (d === 1) return 'tomorrow';
        if (d === -1) return 'yesterday';
        return d > 0 ? 'in ' + d + ' days' : (-d) + ' days ago';
    }
    function ord(n) { const t = n % 100, u = n % 10; return n + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'); }
    const everyWords = n => n === 1 ? 'every month' : n === 12 ? 'every year' : 'every ' + n + ' months';
    function compareWords(c, t) {
        if (!c) return '';
        const when = c.kind === 'year' ? 'than ' + shortMonth(c.base.due.slice(0, 7)) : 'than the last bill';
        if (c.pct === 0) return c.diff === 0 ? 'Same as ' + (c.kind === 'year' ? shortMonth(c.base.due.slice(0, 7)) : 'the last bill') : 'About the same as ' + (c.kind === 'year' ? shortMonth(c.base.due.slice(0, 7)) : 'the last bill');
        return Math.abs(c.pct) + '% ' + (c.pct > 0 ? 'higher ' : 'lower ') + when;
    }
    // a plain-text summary for copying or email
    function summaryText(accts, t, cur) {
        const fm = c => fmtMoney(c, cur, 'en-US'), s = summary(accts, t), L = [];
        L.push('Bills on ' + fmtDate(t, t, { year: true }));
        if (s.overdue.list.length) L.push('OVERDUE: ' + s.overdue.list.map(r => r.a.name + ' ' + fm(r.s.left) + ' (due ' + fmtDate(r.e.due, t) + ')').join('; '));
        L.push('Still to pay by ' + fmtDate(monthEnd(t), t) + ': ' + fm(s.monthLeft.sum) + ' (' + s.monthLeft.list.length + (s.monthLeft.list.length === 1 ? ' bill)' : ' bills)'));
        L.push('Paid in ' + monthWords(s.month, t) + ': ' + fm(s.paidMonth));
        if (s.rows.length) {
            L.push('', 'To pay:');
            s.rows.forEach(r => L.push('- ' + r.a.name + ': ' + fm(r.s.left) + ', due ' + fmtDate(r.e.due, t) + (r.e.due < t ? ' (OVERDUE)' : r.e.due === t ? ' (TODAY)' : '') + (r.a.auto ? ' (auto-pay)' : '') + (r.a.payer ? ', paid by ' + r.a.payer : '')));
        }
        if (s.notIn.length) { L.push('', 'Bills not in yet:'); s.notIn.forEach(x => L.push('- ' + x.a.name + ', expected around ' + fmtDate(x.next, t))); }
        const paid = [];
        accts.forEach(a => a.entries.forEach(e => { const es = entryState(e, t); if (es.left === 0 && es.paidOn && es.paidOn.slice(0, 7) === s.month) paid.push({ a, e, es }); }));
        if (paid.length) {
            L.push('', 'Paid this month:');
            paid.sort((x, y) => x.es.paidOn < y.es.paidOn ? -1 : 1).forEach(x => { const p = x.es.pays[x.es.pays.length - 1];
                L.push('- ' + x.a.name + ': ' + fm(x.es.paid) + ' on ' + fmtDate(x.es.paidOn, t) + (p.how ? ', ' + p.how : '') + (p.ref ? ', ref ' + p.ref : '')); });
        }
        return L.join('\n');
    }
    // a calendar file: every bill still to pay, and the next expected bill of each account, with a reminder 2 days before
    function ics(accts, t, cur, stamp) {
        const esc = x => String(x).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
        const fold = line => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Utility Bill Due Dates and Payment Log//EN', 'CALSCALE:GREGORIAN'];
        let n = 0;
        const ev = (uid, day, title, desc) => {
            n++;
            L.push('BEGIN:VEVENT', 'UID:' + uid + '@utility-bill-due-dates-and-payment-log', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + day.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(day, 1).replace(/-/g, ''),
                fold('SUMMARY:' + esc(title)), fold('DESCRIPTION:' + esc(desc)),
                'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title), 'TRIGGER:-P2D', 'END:VALARM', 'END:VEVENT');
        };
        accts.forEach(a => {
            if (a.closed) return;
            const x = analyse(a, t);
            x.open.forEach(e => { if (e.due >= t) ev(a.id + '-' + e.id, e.due, (a.auto ? 'Check auto-pay: ' : 'Pay ') + a.name + ' ' + fmtMoney(entryState(e, t).left, cur, 'en-US'), 'Bill due today. Tap Paid in the Utility Bill Due Dates and Payment Log after you pay.'); });
            if (!x.open.length && x.next) ev(a.id + '-next-' + x.next, x.next, a.name + ' bill due (expected)', 'Expected due date. Type the amount into the Utility Bill Due Dates and Payment Log when the bill comes.');
        });
        L.push('END:VCALENDAR');
        return { text: L.join('\r\n') + '\r\n', count: n };
    }

    // ---------- checking saved and restored data ----------
    const KINDS = ['electricity', 'gas', 'water', 'internet', 'phone', 'tv', 'maintenance', 'other'];
    const emptyState = () => ({ v: 1, accts: [], cur: '' });
    const str = (x, max) => typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : '';
    const cents = x => Number.isInteger(x) && x >= 0 && x <= MAXC;
    const rid = p => p + Math.random().toString(36).slice(2, 9);
    function cleanPay(p) {
        if (!p || typeof p !== 'object' || !isDate(p.on) || !cents(p.amt) || p.amt === 0) return null;
        return { id: str(p.id, 40) || rid('p'), on: p.on, amt: p.amt, how: str(p.how, 40), ref: str(p.ref, 40) };
    }
    function cleanEntry(e) {
        if (!e || typeof e !== 'object' || !isDate(e.due) || !cents(e.amt)) return null;
        const pays = (Array.isArray(e.pays) ? e.pays : []).slice(0, 50).map(cleanPay).filter(Boolean);
        const ids = new Set(); pays.forEach(x => { while (ids.has(x.id)) x.id += 'x'; ids.add(x.id); });
        return { id: str(e.id, 40) || rid('e'), due: e.due, amt: e.amt, late: cents(e.late) && e.late > e.amt ? e.late : 0, pays: sortBy(pays, 'on') };
    }
    function cleanAcct(a) {
        if (!a || typeof a !== 'object') return null;
        const name = str(a.name, 50);
        if (!name) return null;
        const entries = (Array.isArray(a.entries) ? a.entries : []).slice(0, 400).map(cleanEntry).filter(Boolean);
        const ids = new Set(); entries.forEach(x => { while (ids.has(x.id)) x.id += 'x'; ids.add(x.id); });
        return { id: str(a.id, 40) || rid('a'), name, kind: KINDS.includes(a.kind) ? a.kind : 'other', every: [1, 2, 3, 6, 12].includes(a.every) ? a.every : 1,
            day: Number.isInteger(a.day) && a.day >= 1 && a.day <= 31 ? a.day : 0, acct: str(a.acct, 40), payer: str(a.payer, 40), auto: a.auto === true, closed: a.closed === true,
            entries: sortBy(entries, 'due') };
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.accts)) return null;
        const o = emptyState();
        o.accts = s.accts.slice(0, 100).map(cleanAcct).filter(Boolean);
        const ids = new Set(); o.accts.forEach(x => { while (ids.has(x.id)) x.id += 'x'; ids.add(x.id); });
        if (typeof s.cur === 'string' && s.cur.length <= 4) o.cur = s.cur;
        return o;
    }

    const api = { MAXC, KINDS, parseNum, parseMoney, parseCount, isDate, today, addDays, addMonths, daysBetween, monthEnd, nextMonth, prevMonthKey, sortBy,
        entryState, isOpen, nextDue, lastBill, compare, analyse, summary, paidByMonth, fmtMoney, moneyInput, fmtDate, monthWords, shortMonth, rel, ord, everyWords, compareWords,
        summaryText, ics, emptyState, cleanPay, cleanEntry, cleanAcct, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BILLS = api;
})(typeof window !== 'undefined' ? window : this);
