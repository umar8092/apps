// Buy Now Pay Later and Instalment Tracker: the maths and the words. No page code here, so tests.js can run it in node.
// Money is kept in whole cents and dates as "2026-10-28" day strings counted in whole days, so every sum is exact.
(function (root) {
    'use strict';
    const MAXC = 10000000000;        // money up to 100,000,000 for one plan
    const MAXN = 60;                 // at most 60 payments in one plan (5 years monthly)
    const FREQ = { w: 7, '2w': 14, m: 0 }; // m = monthly on the same day of the month

    // ---------- typed numbers ----------
    // "12,345.6", "12.345,6", "12 345", "1,00,000" and "Rs 23.5" all work. Returns the number times 10^dec as a whole number.
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
    // the same day of the month k months later; the 31st becomes the last day of a short month, and comes back to the 31st after
    function addMonths(s, k, day) {
        const y = +s.slice(0, 4), m = +s.slice(5, 7) - 1 + k, d = day || +s.slice(8, 10);
        const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
        return yy + '-' + pad(mm + 1) + '-' + pad(Math.min(d, dim(yy, mm)));
    }
    const monthEnd = s => s.slice(0, 8) + pad(dim(+s.slice(0, 4), +s.slice(5, 7) - 1));
    const nextMonth = s => addMonths(s.slice(0, 8) + '01', 1);

    // ---------- the schedule ----------
    // o: { mode: 'total'|'each', amount (cents), down (cents, paid at checkout), n, freq: 'w'|'2w'|'m'|'d', every (days for 'd'), first }
    // total mode: amount is the full price; the down payment comes off it and the rest is split into n payments, the odd cents
    // going one each to the first payments (100.00 in 3 is 33.34, 33.33, 33.33). each mode: every payment is amount.
    function schedule(o) {
        const n = o.n, down = o.down || 0;
        let rest;
        if (o.mode === 'each') rest = o.amount * n; else rest = o.amount - down;
        if (o.mode !== 'each' && rest <= 0) return { error: 'The down payment must be less than the total price.' };
        if (rest < n) return { error: 'That is less than 1 cent a payment.' };
        if (rest + down > MAXC) return { error: 'That amount is too big.' };
        const base = o.mode === 'each' ? o.amount : Math.floor(rest / n), odd = o.mode === 'each' ? 0 : rest - base * n;
        const step = o.freq === 'd' ? o.every : FREQ[o.freq];
        const day = +o.first.slice(8, 10), pays = [];
        for (let i = 0; i < n; i++) {
            const due = o.freq === 'm' ? addMonths(o.first, i, day) : addDays(o.first, i * step);
            pays.push({ due, amt: base + (i < odd ? 1 : 0) });
        }
        return { pays, total: rest + down, down, rest };
    }
    // words for the form preview: "4 payments of 30", "3 payments: 33.34, then 2 of 33.33"
    function splitWords(pays, fm) {
        const n = pays.length, a = pays[0].amt, b = pays[n - 1].amt;
        if (n === 1) return '1 payment of ' + fm(a);
        if (a === b) return n + ' payments of ' + fm(a);
        const k = pays.filter(p => p.amt === a).length;
        return n + ' payments: ' + (k === 1 ? fm(a) : k + ' of ' + fm(a)) + ', then ' + (n - k === 1 ? '1 of ' : (n - k) + ' of ') + fm(b);
    }
    // spread a new amount still owed over the unpaid payments, keeping their order (the odd cents go to the earliest)
    function respread(amounts, newOwed) {
        const n = amounts.length; if (!n) return [];
        const base = Math.floor(newOwed / n), odd = newOwed - base * n;
        return amounts.map((_, i) => base + (i < odd ? 1 : 0));
    }

    // ---------- one plan ----------
    // plan: { id, name, provider, bought, down, pays: [{ id, due, amt, paid: "date"|null, fee?: true }], closed: null | { type: 'returned', on, cancelled, refund, refundGot } }
    const open = p => !p.paid && !p.cancelled;
    const sortPays = pays => pays.slice().sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0);
    function analyse(plan, t) {
        const pays = sortPays(plan.pays), live = pays.filter(p => !p.cancelled);
        const paidPays = live.filter(p => p.paid), unpaid = live.filter(open);
        const paid = paidPays.reduce((s, p) => s + p.amt, 0) + (plan.down || 0);
        const owed = unpaid.reduce((s, p) => s + p.amt, 0);
        const late = unpaid.filter(p => p.due < t), dueToday = unpaid.filter(p => p.due === t);
        const next = unpaid.find(p => p.due >= t) || null;
        const total = paid + owed;
        let state = 'ok';
        if (plan.closed && plan.closed.type === 'returned') state = 'returned';
        else if (!unpaid.length) state = 'done';
        else if (late.length) state = 'late';
        else if (dueToday.length) state = 'today';
        else if (next && daysBetween(t, next.due) <= 3) state = 'soon';
        return { pays, live, paidCount: paidPays.length, count: live.length, paid, owed, total, late, lateSum: late.reduce((s, p) => s + p.amt, 0),
            dueToday, next, last: unpaid.length ? unpaid[unpaid.length - 1].due : null, lastPaid: paidPays.reduce((m, p) => p.paid > m ? p.paid : m, ''), state,
            pct: total ? Math.round(paid * 1000 / total) / 10 : 0 };
    }
    // the totals over all plans
    function summary(plans, t) {
        const me = monthEnd(t), nm = nextMonth(t), nme = monthEnd(nm);
        const rows = [];
        plans.forEach(pl => { if (pl.closed) return; pl.pays.forEach(p => { if (open(p)) rows.push({ plan: pl, pay: p }); }); });
        rows.sort((a, b) => a.pay.due < b.pay.due ? -1 : a.pay.due > b.pay.due ? 1 : 0);
        const sum = list => list.reduce((s, r) => s + r.pay.amt, 0);
        const late = rows.filter(r => r.pay.due < t), today_ = rows.filter(r => r.pay.due === t);
        const week = rows.filter(r => r.pay.due >= t && r.pay.due <= addDays(t, 6));
        const thisM = rows.filter(r => r.pay.due <= me), nextM = rows.filter(r => r.pay.due >= nm && r.pay.due <= nme);
        const active = plans.filter(pl => !pl.closed && pl.pays.some(open));
        const refunds = plans.filter(pl => pl.closed && pl.closed.type === 'returned' && pl.closed.refund > 0 && !pl.closed.refundGot);
        return { rows, late: { n: late.length, sum: sum(late) }, today: { n: today_.length, sum: sum(today_) }, week: { n: week.length, sum: sum(week) },
            thisMonth: { n: thisM.length, sum: sum(thisM), month: t.slice(0, 7) }, nextMonth: { n: nextM.length, sum: sum(nextM), month: nm.slice(0, 7) },
            owed: sum(rows), plans: active.length, last: rows.length ? rows[rows.length - 1].pay.due : null,
            refund: refunds.reduce((s, pl) => s + pl.closed.refund, 0), refundPlans: refunds.length };
    }
    // the payments still to pay of one month ("2026-11"), grouped by plan, for the month list
    function monthTotals(plans, t, count) {
        const out = [];
        let m = t.slice(0, 7) + '-01';
        for (let i = 0; i < count; i++) {
            const key = m.slice(0, 7), end = monthEnd(m);
            let sum = 0, n = 0;
            plans.forEach(pl => { if (pl.closed) return; pl.pays.forEach(p => { if (open(p) && p.due <= end && (i === 0 || p.due >= m)) { sum += p.amt; n++; } }); });
            out.push({ month: key, sum, n });
            m = nextMonth(m);
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
    const monthName = key => MONTHS[+key.slice(5, 7) - 1];
    const monthWords = (key, t) => monthName(key) + (key.slice(0, 4) !== t.slice(0, 4) ? ' ' + key.slice(0, 4) : '');
    function rel(s, t) {
        const d = daysBetween(t, s);
        if (d === 0) return 'today';
        if (d === 1) return 'tomorrow';
        if (d === -1) return 'yesterday';
        return d > 0 ? 'in ' + d + ' days' : (-d) + ' days ago';
    }
    const freqWords = (f, every) => f === 'w' ? 'every week' : f === '2w' ? 'every 2 weeks' : f === 'm' ? 'every month' : every === 1 ? 'every day' : 'every ' + every + ' days';
    // a plain-text summary for copying or email
    function summaryText(plans, t, cur) {
        const fm = c => fmtMoney(c, cur, 'en-US'), s = summary(plans, t), L = [];
        L.push('Instalments on ' + fmtDate(t, t, { year: true }));
        if (s.late.n) L.push('LATE: ' + s.late.n + (s.late.n === 1 ? ' payment, ' : ' payments, ') + fm(s.late.sum));
        L.push('Still to pay in ' + monthWords(s.thisMonth.month, t) + ': ' + fm(s.thisMonth.sum) + ' (' + s.thisMonth.n + (s.thisMonth.n === 1 ? ' payment)' : ' payments)'));
        L.push(monthWords(s.nextMonth.month, t) + ': ' + fm(s.nextMonth.sum) + ' (' + s.nextMonth.n + (s.nextMonth.n === 1 ? ' payment)' : ' payments)'));
        L.push('Still owed in total: ' + fm(s.owed) + (s.plans ? ' on ' + s.plans + (s.plans === 1 ? ' plan' : ' plans') : '') + (s.last ? ', last payment ' + fmtDate(s.last, t, { year: true }) : ''));
        if (s.rows.length) {
            L.push('', 'Next payments:');
            s.rows.slice(0, 12).forEach(r => L.push('- ' + fmtDate(r.pay.due, t) + (r.pay.due < t ? ' (LATE)' : '') + ': ' + fm(r.pay.amt) + ' ' + r.plan.name + ' (' + r.plan.provider + ')'));
            if (s.rows.length > 12) L.push('- and ' + (s.rows.length - 12) + ' more');
        }
        plans.filter(p => !p.closed && p.pays.some(open)).forEach(p => {
            const a = analyse(p, t);
            L.push('', p.name + ' (' + p.provider + '): ' + a.paidCount + ' of ' + a.count + ' paid, ' + fm(a.owed) + ' still owed' + (a.last ? ', last payment ' + fmtDate(a.last, t, { year: true }) : ''));
        });
        if (s.refund) L.push('', 'Refunds to expect: ' + fm(s.refund));
        return L.join('\n');
    }
    // a calendar file with every payment still to pay, each with a reminder the day before
    function ics(plans, t, cur, stamp) {
        const esc = x => String(x).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
        const fold = line => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Buy Now Pay Later and Instalment Tracker//EN', 'CALSCALE:GREGORIAN'];
        let n = 0;
        plans.forEach(pl => {
            if (pl.closed) return;
            pl.pays.filter(open).forEach(p => {
                if (p.due < t) return;
                n++;
                const d = p.due.replace(/-/g, ''), e = addDays(p.due, 1).replace(/-/g, '');
                L.push('BEGIN:VEVENT', 'UID:' + pl.id + '-' + p.id + '@buy-now-pay-later-and-instalment-tracker', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + e,
                    fold('SUMMARY:' + esc('Pay ' + fmtMoney(p.amt, cur, 'en-US') + ': ' + pl.name + ' (' + pl.provider + ')')),
                    fold('DESCRIPTION:' + esc('Instalment for ' + pl.name + ' with ' + pl.provider + '. Make sure the money is in your account.')),
                    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('Instalment due tomorrow'), 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT');
            });
        });
        L.push('END:VCALENDAR');
        return { text: L.join('\r\n') + '\r\n', count: n };
    }

    // ---------- checking saved and restored data ----------
    const emptyState = () => ({ v: 1, plans: [], cur: '' });
    const str = (x, max) => typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null;
    const cents = x => Number.isInteger(x) && x >= 0 && x <= MAXC;
    function cleanPay(p) {
        if (!p || typeof p !== 'object' || !isDate(p.due) || !cents(p.amt) || p.amt === 0) return null;
        const o = { id: str(p.id, 40) || 'p' + Math.random().toString(36).slice(2, 9), due: p.due, amt: p.amt, paid: isDate(p.paid) ? p.paid : null };
        if (p.cancelled === true && !o.paid) o.cancelled = true;
        if (p.fee === true) o.fee = true;
        return o;
    }
    function cleanPlan(p) {
        if (!p || typeof p !== 'object') return null;
        const name = str(p.name, 60), provider = str(p.provider, 40);
        if (!name || !provider || !Array.isArray(p.pays)) return null;
        const pays = p.pays.slice(0, 200).map(cleanPay).filter(Boolean);
        if (!pays.length) return null;
        const ids = new Set(); pays.forEach(x => { while (ids.has(x.id)) x.id += 'x'; ids.add(x.id); });
        const o = { id: str(p.id, 40) || 'l' + Math.random().toString(36).slice(2, 9), name, provider, bought: isDate(p.bought) ? p.bought : pays[0].due,
            down: cents(p.down) ? p.down : 0, how: str(p.how, 60) || '', pays: sortPays(pays), closed: null };
        if (p.closed && typeof p.closed === 'object' && p.closed.type === 'returned' && isDate(p.closed.on))
            o.closed = { type: 'returned', on: p.closed.on, refund: cents(p.closed.refund) ? p.closed.refund : 0, refundGot: p.closed.refundGot === true };
        return o;
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.plans)) return null;
        const o = emptyState();
        o.plans = s.plans.slice(0, 300).map(cleanPlan).filter(Boolean);
        const ids = new Set(); o.plans.forEach(x => { while (ids.has(x.id)) x.id += 'x'; ids.add(x.id); });
        if (typeof s.cur === 'string' && s.cur.length <= 4) o.cur = s.cur;
        return o;
    }

    const api = { MAXC, MAXN, parseNum, parseMoney, parseCount, isDate, today, addDays, addMonths, daysBetween, monthEnd, nextMonth, schedule, splitWords, respread,
        analyse, summary, monthTotals, sortPays, fmtMoney, moneyInput, fmtDate, monthName, monthWords, rel, freqWords, summaryText, ics, emptyState, cleanPay, cleanPlan, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BNPL = api;
})(typeof window !== 'undefined' ? window : this);
