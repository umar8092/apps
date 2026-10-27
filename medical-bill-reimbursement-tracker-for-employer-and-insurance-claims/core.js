// Medical Bill Reimbursement Tracker: the maths and the words. No page code here, so tests.js can run it in node.
// Money is kept in whole cents and days as whole day numbers, so every sum is exact.
// A bill is "still to claim" until claims cover its amount; a rejected claim gives its bills back; a refund that covers
// several bills is shared between them in proportion to what was claimed for each, to the cent.
(function (root) {
    'use strict';
    const MAXC = 100000000000;     // money up to 1,000,000,000
    const DAY = 86400000;
    const KINDS = ['Doctor', 'Lab test', 'Medicine', 'Hospital', 'Dentist', 'Eyes', 'Other'];
    const SOON = 14;               // a claim-by date this close is "claim soon"

    // ---------- typed numbers ----------
    // "12,345.6", "12.345,6", "12 345", "1,00,000" and "Rs 23.5" all work. Returns the number times 10^dec as a whole number.
    function parseNum(text, dec, opt) {
        opt = opt || {};
        const bad = opt.bad || 'That number looks mistyped. Type it like 12345 or 12345.6.';
        let s = String(text == null ? '' : text).replace(/[\u00a0\u202f\u2009']/g, ' ').trim();
        if (!s) return { error: opt.blank || 'Type a number.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴]|\/-)$/i, '').trim();
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
    const parseMoney = (t, positive) => parseNum(t, 2, { max: MAXC, positive, blank: 'Type the amount, such as 2500.', zero: 'Type an amount bigger than 0.', big: 'That amount is too big.', bad: 'Type an amount such as 2500 or 1350.50.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.' });
    function parseDays(t) {
        const s = String(t == null ? '' : t).replace(/\s*days?$/i, '').trim();
        if (!s) return { error: 'Type a number of days, such as 90.' };
        if (!/^\d+$/.test(s)) return { error: 'Type a whole number of days, such as 90.' };
        const n = Number(s);
        if (n < 1) return { error: 'Type at least 1 day.' };
        if (n > 1095) return { error: 'Type at most 1095 days (3 years).' };
        return { n };
    }

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    function dayNum(s) { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); }
    function dayStr(n) { const d = new Date(n * DAY); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number(s.slice(0, 4)) >= 1990 && Number(s.slice(0, 4)) <= 2200 && dayStr(dayNum(s)) === s;
    const localDay = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    const addDays = (s, n) => dayStr(dayNum(s) + n);
    const diff = (a, b) => dayNum(b) - dayNum(a);
    // the claim year (starting on the 1st of month `start`, 1-12) that holds day s: [first day, last day]
    function claimYear(s, start) {
        const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7));
        const y0 = m >= start ? y : y - 1;
        const from = y0 + '-' + pad(start) + '-01';
        const to = addDays((y0 + 1) + '-' + pad(start) + '-01', -1);
        return [from, to];
    }

    // ---------- sharing a refund between bills ----------
    // Splits total cents in proportion to weights; the leftover cents go to the largest remainders (then the earliest).
    function share(total, weights) {
        const sum = weights.reduce((a, b) => a + b, 0);
        if (!sum) return weights.map((w, i) => i === 0 ? total : 0);
        const raw = weights.map(w => total * w / sum), out = raw.map(Math.floor);
        let left = total - out.reduce((a, b) => a + b, 0);
        raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
        return out;
    }

    // ---------- the answers ----------
    const claimTotal = c => c.items.reduce((s, it) => s + it.a, 0);
    // per bill: what is waiting, refunded, claimed and still to claim; per claim: its total and refund shares
    function analyse(state, today) {
        const payers = {}; state.payers.forEach(p => { payers[p.id] = p; });
        const B = {};
        state.bills.forEach(b => { B[b.id] = { bill: b, waiting: 0, refunded: 0, claimedPaid: 0, reopened: 0, rejected: [], claims: [], open: 0, own: 0 }; });
        const claims = state.claims.map(c => {
            const total = claimTotal(c);
            const shares = c.st === 'paid' ? share(c.got, c.items.map(it => it.a)) : c.items.map(() => 0);
            c.items.forEach((it, i) => {
                const x = B[it.b]; if (!x) return;
                x.claims.push(c.id);
                if (c.st === 'wait') x.waiting += it.a;
                else if (c.st === 'paid') { x.claimedPaid += it.a; x.refunded += shares[i]; if (c.rest) x.reopened += it.a - shares[i]; }
                else x.rejected.push({ d: c.d, why: c.why || '', payer: c.payer });
            });
            return { claim: c, total, shares, short: c.st === 'paid' ? total - c.got : 0, age: diff(c.d, today), payer: payers[c.payer] };
        });
        const bills = state.bills.map(b => {
            const x = B[b.id], p = payers[b.payer];
            x.open = b.skip ? 0 : Math.max(0, b.amt + x.reopened - x.waiting - x.claimedPaid);
            x.own = b.amt - x.refunded;
            x.claimBy = p && p.days ? addDays(b.d, p.days) : null;
            x.left = x.claimBy ? diff(today, x.claimBy) : null;
            x.status = b.skip ? 'skip' : x.open > 0 ? 'todo' : x.waiting > 0 ? 'wait' : x.claimedPaid > 0 ? 'paid' : 'done';
            x.urgency = x.status !== 'todo' || x.left == null ? 'none' : x.left < 0 ? 'late' : x.left <= SOON ? 'soon' : 'ok';
            x.payer = p;
            return x;
        });
        const todo = bills.filter(x => x.status === 'todo').sort((a, b) => (a.claimBy || '9999') < (b.claimBy || '9999') ? -1 : (a.claimBy || '9999') > (b.claimBy || '9999') ? 1 : a.bill.d < b.bill.d ? -1 : 1);
        const waiting = claims.filter(c => c.claim.st === 'wait').sort((a, b) => a.claim.d < b.claim.d ? -1 : 1);
        const done = claims.filter(c => c.claim.st !== 'wait').sort((a, b) => (b.claim.pd || b.claim.d) < (a.claim.pd || a.claim.d) ? -1 : 1);
        // per payer this claim year: claimed (by the bill's date), refunded and waiting, for the family and per person
        const years = state.payers.map(p => {
            const [from, to] = claimYear(today, p.start || 1);
            const o = { payer: p, from, to, refunded: 0, waiting: 0, people: {} };
            claims.forEach(c => {
                if (c.claim.payer !== p.id || c.claim.st === 'rej') return;
                c.claim.items.forEach((it, i) => {
                    const x = B[it.b]; if (!x || x.bill.d < from || x.bill.d > to) return;
                    const r = c.claim.st === 'paid' ? c.shares[i] : 0, w = c.claim.st === 'wait' ? it.a : 0;
                    o.refunded += r; o.waiting += w;
                    const k = x.bill.who || '';
                    const q = o.people[k] || (o.people[k] = { refunded: 0, waiting: 0 });
                    q.refunded += r; q.waiting += w;
                });
            });
            o.used = o.refunded + o.waiting;
            if (p.limit != null) {
                if (p.per === 'person') {
                    o.perPerson = Object.keys(o.people).sort().map(k => { const q = o.people[k], used = q.refunded + q.waiting; return { who: k, used, left: p.limit - used }; });
                } else o.left = p.limit - o.used;
            }
            return o;
        });
        // per person, everything so far
        const people = {};
        bills.forEach(x => {
            const k = x.bill.who || '';
            const q = people[k] || (people[k] = { who: k, n: 0, spent: 0, refunded: 0, waiting: 0, open: 0 });
            q.n++; q.spent += x.bill.amt; q.refunded += x.refunded; q.waiting += x.waiting; q.open += x.open;
        });
        const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
        return {
            bills, claims, todo, waiting, done, years,
            people: Object.keys(people).sort((a, b) => a.localeCompare(b)).map(k => people[k]),
            openTotal: sum(todo, x => x.open), late: todo.filter(x => x.urgency === 'late'), soon: todo.filter(x => x.urgency === 'soon'),
            waitTotal: sum(waiting, c => c.total), refundedTotal: sum(bills, x => x.refunded), spentTotal: sum(bills, x => x.bill.amt)
        };
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
    function fmtDate(s, loc, opt) {
        const o = { day: 'numeric', month: 'short', timeZone: 'UTC' };
        if (opt === true || opt === 'year' || opt === 'wdy') o.year = 'numeric';
        if (opt === 'wd' || opt === 'wdy') o.weekday = 'short';
        try { return new Intl.DateTimeFormat(loc || 'en-GB', o).format(new Date(dayNum(s) * DAY)); } catch (e) { return s; }
    }
    const daysWord = n => n + (n === 1 ? ' day' : ' days');
    const inDays = n => n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? 'in ' + daysWord(n) : daysWord(-n) + ' ago';
    const billsWord = n => n + (n === 1 ? ' bill' : ' bills');
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // CSV for an accountant or an HR form; every cell quoted, formulas defused
    function csv(state, a, cur, loc) {
        const q = v => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
        const m = c => (c / 100).toFixed(2);
        const words = { todo: 'Not claimed yet', wait: 'Claimed, waiting', paid: 'Refunded', skip: 'Not claiming', done: 'Claimed' };
        const rows = [['Bill date', 'For', 'Type', 'Doctor, lab or shop', 'Amount paid', 'Claim from', 'Status', 'Claim sent', 'Claim number', 'Refunded', 'Waiting', 'Still to claim', 'Not refunded', 'Note']];
        const byId = {}; state.claims.forEach(c => { byId[c.id] = c; });
        a.bills.slice().sort((x, y) => x.bill.d < y.bill.d ? -1 : 1).forEach(x => {
            const b = x.bill, cl = x.claims.map(id => byId[id]).filter(Boolean);
            rows.push([b.d, b.who, b.kind, b.place || '', m(b.amt), x.payer ? x.payer.name : '', words[x.status], cl.map(c => c.d).join(' '), cl.map(c => c.ref || '').filter(Boolean).join(' '),
                m(x.refunded), m(x.waiting), m(x.open), m(x.own), b.note || '']);
        });
        return rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
    }

    // a calendar file for the claim-by day
    function ics(day, title, text, stamp) {
        const d = day.replace(/-/g, ''), e = addDays(day, 1).replace(/-/g, '');
        const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
        return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Medical Bill Reimbursement Tracker//EN', 'BEGIN:VEVENT',
            'UID:' + d + '-' + Math.random().toString(36).slice(2, 10) + '@umar8092.github.io', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + e,
            'SUMMARY:' + esc(title), 'DESCRIPTION:' + esc(text),
            'BEGIN:VALARM', 'TRIGGER:-P2D', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
    }

    // ---------- saved data ----------
    const str = (x, max) => typeof x === 'string' ? x.slice(0, max).trim() : '';
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    const newPayer = () => ({ id: 'p1', name: 'My employer', days: null, limit: null, per: 'family', start: 1 });
    const emptyState = () => ({ v: 1, cur: '', payers: [newPayer()], bills: [], claims: [] });
    function cleanPayer(p) {
        if (!p || typeof p !== 'object') return null;
        const o = { id: str(p.id, 40), name: str(p.name, 40), days: null, limit: null, per: p.per === 'person' ? 'person' : 'family', start: int(p.start, 1, 12) ? p.start : 1 };
        if (!o.id || !o.name) return null;
        if (int(p.days, 1, 1095)) o.days = p.days;
        if (int(p.limit, 0, MAXC)) o.limit = p.limit;
        return o;
    }
    function cleanBill(b, payers) {
        if (!b || typeof b !== 'object' || !isDay(b.d) || !int(b.amt, 1, MAXC)) return null;
        const o = { id: str(b.id, 40), d: b.d, who: str(b.who, 40), kind: KINDS.includes(b.kind) ? b.kind : 'Other', amt: b.amt, payer: payers.includes(b.payer) ? b.payer : payers[0] };
        if (!o.id || !o.who) return null;
        const place = str(b.place, 60), note = str(b.note, 300);
        if (place) o.place = place;
        if (note) o.note = note;
        if (b.skip === true) o.skip = true;
        return o;
    }
    function cleanClaim(c, payers, bills) {
        if (!c || typeof c !== 'object' || !isDay(c.d) || !Array.isArray(c.items)) return null;
        const o = { id: str(c.id, 40), payer: payers.includes(c.payer) ? c.payer : payers[0], d: c.d, st: ['wait', 'paid', 'rej'].includes(c.st) ? c.st : 'wait', items: [] };
        if (!o.id) return null;
        const seen = {};
        c.items.forEach(it => { if (it && bills[it.b] && !seen[it.b] && int(it.a, 1, MAXC)) { seen[it.b] = 1; o.items.push({ b: it.b, a: it.a }); } });
        if (!o.items.length) return null;
        const ref = str(c.ref, 40); if (ref) o.ref = ref;
        if (o.st === 'paid') {
            if (!int(c.got, 0, MAXC) || c.got > claimTotal(o)) return null;
            o.got = c.got; o.pd = isDay(c.pd) && c.pd >= o.d ? c.pd : o.d;
            if (c.rest === true && o.got < claimTotal(o)) o.rest = true;
        }
        if (o.st === 'rej') { const why = str(c.why, 200); if (why) o.why = why; o.pd = isDay(c.pd) && c.pd >= o.d ? c.pd : o.d; }
        return o;
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.payers) || !Array.isArray(s.bills) || !Array.isArray(s.claims)) return null;
        const o = { v: 1, cur: str(s.cur, 6), payers: [], bills: [], claims: [] };
        const pid = {};
        s.payers.slice(0, 10).forEach(p => { const x = cleanPayer(p); if (x && !pid[x.id]) { pid[x.id] = 1; o.payers.push(x); } });
        if (!o.payers.length) o.payers.push(newPayer());
        const ps = o.payers.map(p => p.id), bid = {};
        s.bills.slice(0, 5000).forEach(b => { const x = cleanBill(b, ps); if (x && !bid[x.id]) { bid[x.id] = x; o.bills.push(x); } });
        const cid = {};
        s.claims.slice(0, 5000).forEach(c => { const x = cleanClaim(c, ps, bid); if (x && !cid[x.id]) { cid[x.id] = 1; o.claims.push(x); } });
        return o;
    }
    // what is left to claim on a bill if this claim (being edited) were removed; used to check typed claim amounts
    function openWithout(state, billId, claimId) {
        const b = state.bills.find(x => x.id === billId); if (!b) return 0;
        let used = 0;
        state.claims.forEach(c => {
            if (c.id === claimId || c.st === 'rej') return;
            const sh = c.st === 'paid' && c.rest ? share(c.got, c.items.map(it => it.a)) : null;
            c.items.forEach((it, i) => { if (it.b === billId) used += sh ? sh[i] : it.a; });
        });
        return Math.max(0, b.amt - used);
    }

    const api = { KINDS, MONTHS, SOON, parseNum, parseMoney, parseDays, dayNum, dayStr, isDay, localDay, addDays, diff, claimYear, share, claimTotal, analyse,
        fmtMoney, fmtDate, daysWord, inDays, billsWord, csv, ics, emptyState, newPayer, cleanPayer, cleanBill, cleanClaim, cleanState, openWithout };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MBR = api;
})(typeof window !== 'undefined' ? window : this);
