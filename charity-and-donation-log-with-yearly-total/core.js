// Charity and Donation Log with Yearly Total: the maths and the words. No page code here, so tests.js can run it in node.
// Money is kept in whole cents and dates as "2026-10-28" day strings, so every total is exact.
(function (root) {
    'use strict';
    const MAXC = 10000000000;        // up to 100,000,000 for one gift
    const YEARS = { '01-01': 'January to December', '04-01': '1 April to 31 March (India and others)', '04-06': '6 April to 5 April (UK, for Gift Aid)', '07-01': '1 July to 30 June (Pakistan, Australia and others)' };
    const KINDS = ['General donation', 'Zakat', 'Sadqa', 'Fitrana', 'Tithe or church offering', 'Temple or gurdwara offering', 'Help to someone in need'];
    const HOW = { cash: 'Cash', bank: 'Bank transfer', online: 'Card or online', cheque: 'Cheque', goods: 'Goods or food' };
    const RECEIPT = { kept: 'Receipt kept', todo: 'Receipt still to get', none: 'No receipt needed' };
    const FREQ = { week: 'Every week', month: 'Every month', year: 'Every year' };

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
        const n = Number(intPart || '0') * Math.pow(10, dec) + Number(fracPart.padEnd(dec, '0').slice(0, dec) || '0');
        if (opt.max != null && n > opt.max) return { error: opt.big || 'That number is too big.' };
        if (opt.positive && n <= 0) return { error: opt.zero || 'Type a number bigger than 0.' };
        return { n };
    }
    const parseMoney = (t, opt) => parseNum(t, 2, Object.assign({ max: MAXC, blank: 'Type the amount, such as 5000.', big: 'That amount is too big.', bad: 'Type an amount such as 5000 or 1,250.50.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.', positive: true, zero: 'Type an amount bigger than 0.' }, opt || {}));
    // a * b / d rounded half up, exact for big numbers
    function mulDiv(a, b, d) { return Number((BigInt(a) * BigInt(b) * 2n + BigInt(d)) / (2n * BigInt(d))); }

    // ---------- days ----------
    const pad = n => String(n).padStart(2, '0');
    const dNum = s => Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
    function dStr(n) { const d = new Date(n * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2200 && dStr(dNum(s)) === s;
    const today = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    const addDays = (s, n) => dStr(dNum(s) + n);
    const ym = s => s.slice(0, 7);
    function addMonth(key, k) { const m = +key.slice(0, 4) * 12 + (+key.slice(5, 7) - 1) + k; return Math.floor(m / 12) + '-' + pad(m % 12 + 1); }
    const monthLast = key => addDays(addMonth(key, 1) + '-01', -1);
    // the same day k months later, or the last day of a shorter month (31 Jan + 1 month = 28 Feb)
    function addMonthsClamp(s, k) { const key = addMonth(ym(s), k), last = monthLast(key); const d = key + '-' + s.slice(8, 10); return d > last ? last : d; }
    function monthsBetween(a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); }
    // the giving year a day falls in, for a start such as "07-01"
    function yearOf(s, start) {
        if (!YEARS[start]) start = '01-01';
        let y = +s.slice(0, 4);
        if (s.slice(5) < start) y--;
        return yearFrom(y, start);
    }
    function yearFrom(y, start) {
        if (!YEARS[start]) start = '01-01';
        const from = y + '-' + start, to = addDays((y + 1) + '-' + start, -1);
        return { y, from, to, label: start === '01-01' ? String(y) : y + '-' + String(y + 1).slice(2) };
    }

    // ---------- names ----------
    const norm = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const tidy = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, max);

    // ---------- regular gifts ----------
    // occurrence k (0 = the start) of a plan
    function occ(plan, k) {
        if (plan.freq === 'week') return addDays(plan.start, 7 * k);
        if (plan.freq === 'year') return addMonthsClamp(plan.start, 12 * k);
        return addMonthsClamp(plan.start, k);
    }
    const nextOf = plan => occ(plan, plan.n);
    // the gifts of a plan that are due up to today and not yet marked given or skipped (at most `cap`)
    function duesOf(plan, t, cap) {
        const out = [];
        if (plan.stopped) return out;
        cap = cap || 120;
        for (let k = plan.n; out.length < cap; k++) { const d = occ(plan, k); if (d > t) break; out.push({ k, date: d }); }
        return out;
    }
    function allDues(state, t) {
        const out = [];
        state.plans.forEach(p => duesOf(p, t).forEach(d => out.push({ plan: p, k: d.k, date: d.date })));
        return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.plan.to.localeCompare(b.plan.to));
    }
    // how many due dates exist in total (beyond the cap) for the "and N more" line
    function dueCount(plan, t) {
        if (plan.stopped) return 0;
        let n = 0; for (let k = plan.n; n < 5000; k++) { if (occ(plan, k) > t) break; n++; }
        return n;
    }

    // ---------- adding up ----------
    const inRange = (state, from, to) => state.gifts.filter(g => g.date >= from && g.date <= to);
    function bump(map, key, label, amt) { const o = map[key] || (map[key] = { name: label, total: 0, count: 0, last: '' }); o.total += amt; o.count++; return o; }
    function yearStats(state, from, to) {
        const list = inRange(state, from, to).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
        const o = { total: 0, count: list.length, own: 0, kinds: {}, causes: {}, behalf: {}, how: {},
            receipts: { kept: { n: 0, amt: 0 }, todo: { n: 0, amt: 0, list: [] }, none: { n: 0, amt: 0 } }, months: [] };
        list.forEach(g => {
            o.total += g.amt;
            bump(o.kinds, norm(g.kind), g.kind, g.amt);
            const c = bump(o.causes, norm(g.to), g.to, g.amt); c.name = g.to; c.last = g.date;   // the newest spelling wins
            bump(o.how, g.how, HOW[g.how], g.amt);
            if (g.behalf) { const b = bump(o.behalf, norm(g.behalf), g.behalf, g.amt); b.name = g.behalf; } else o.own += g.amt;
            const r = o.receipts[g.receipt]; r.n++; r.amt += g.amt; if (g.receipt === 'todo') r.list.push(g);
        });
        let k = ym(from); const end = ym(to);
        while (k <= end) { const mf = k + '-01', ml = monthLast(k); o.months.push({ key: k, total: list.filter(g => g.date >= mf && g.date <= ml).reduce((a, g) => a + g.amt, 0) }); k = addMonth(k, 1); }
        const sortMap = m => Object.keys(m).map(x => m[x]).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
        o.kindList = sortMap(o.kinds); o.causeList = sortMap(o.causes); o.behalfList = sortMap(o.behalf); o.howList = sortMap(o.how);
        return o;
    }
    // the yearly goal: what is left and, for the year we are in, how much a month to reach it
    function goalStats(goal, total, yr, t) {
        if (!goal) return null;
        const left = Math.max(0, goal - total), pct = Math.min(100, Math.floor(total * 100 / goal));
        const o = { goal, total, left, pct, reached: total >= goal, over: Math.max(0, total - goal), monthsLeft: 0, perMonth: 0, past: t > yr.to, future: t < yr.from };
        if (!o.past && !o.future) { o.monthsLeft = monthsBetween(ym(t), ym(yr.to)) + 1; o.perMonth = left ? Math.ceil(left / o.monthsLeft) : 0; }
        return o;
    }
    // a promise paid in parts: every gift to the same name on or after the day of the promise counts
    function pledgeStats(state, pl) {
        const list = state.gifts.filter(g => norm(g.to) === norm(pl.to) && g.date >= pl.from);
        const paid = list.reduce((a, g) => a + g.amt, 0);
        return { paid, count: list.length, left: Math.max(0, pl.amt - paid), over: Math.max(0, paid - pl.amt), done: paid >= pl.amt, pct: Math.min(100, Math.floor(paid * 100 / pl.amt)),
            last: list.reduce((a, g) => g.date > a ? g.date : a, '') };
    }
    // every name given to before, newest first, for the "Given to" suggestions
    function names(state, field) {
        const seen = {}, out = [];
        state.gifts.slice().sort((a, b) => a.date < b.date ? 1 : -1).concat(state.plans).forEach(g => { const v = g[field]; if (v && !seen[norm(v)]) { seen[norm(v)] = 1; out.push(v); } });
        return out;
    }
    // custom kinds the person has typed, plus the built-in ones
    function kinds(state) {
        const out = KINDS.slice(), seen = {}; KINDS.forEach(k => { seen[norm(k)] = 1; });
        state.gifts.concat(state.plans).forEach(g => { if (g.kind && !seen[norm(g.kind)]) { seen[norm(g.kind)] = 1; out.push(g.kind); } });
        return out;
    }

    // ---------- words ----------
    function fmtNum(cents, loc) {
        const n = Math.abs(cents);
        let s;
        try { s = new Intl.NumberFormat(loc || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { s = (n / 100).toFixed(n % 100 ? 2 : 0); }
        return (cents < 0 ? '-' : '') + s;
    }
    function fmtMoney(cents, cur, loc) {
        const s = fmtNum(Math.abs(cents), loc), m = cents < 0 ? '-' : '';
        if (!cur) return m + s;
        return m + (/^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + s : cur + s);
    }
    const moneyInput = c => (c / 100).toFixed(c % 100 ? 2 : 0);
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    function fmtDate(s, t, opt) {
        opt = opt || {};
        const wd = WD[new Date(dNum(s) * 86400000).getUTCDay()];
        return (opt.noDay ? '' : wd + ' ') + (+s.slice(8, 10)) + ' ' + MON[+s.slice(5, 7) - 1] + (!t || s.slice(0, 4) !== t.slice(0, 4) || opt.year ? ' ' + s.slice(0, 4) : '');
    }
    const shortMonth = key => MON[+key.slice(5, 7) - 1];
    const rangeWords = (from, to) => fmtDate(from, null, { noDay: true }) + ' to ' + fmtDate(to, null, { noDay: true });
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const yearTitle = (yr, start) => (start === '01-01' ? 'Year ' : 'Year ') + yr.label;
    function freqWords(plan, t) {
        const s = plan.start;
        if (plan.freq === 'week') return 'Every ' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(dNum(s) * 86400000).getUTCDay()];
        if (plan.freq === 'year') return 'Every year on ' + (+s.slice(8, 10)) + ' ' + MON[+s.slice(5, 7) - 1];
        const d = +s.slice(8, 10);
        return 'Every month on the ' + d + (d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th') + (d > 28 ? ' (or the last day)' : '');
    }

    function summaryText(state, yr, t, loc) {
        const fm = c => fmtMoney(c, state.cur, loc || 'en-US');
        const s = yearStats(state, yr.from, yr.to), L = [];
        L.push('My giving for ' + yr.label + ' (' + rangeWords(yr.from, yr.to) + ')');
        L.push('Given: ' + fm(s.total) + ' in ' + plural(s.count, 'gift', 'gifts') + ' to ' + plural(s.causeList.length, 'cause', 'causes'));
        if (s.behalfList.length) L.push('Of this, on behalf of others: ' + s.behalfList.map(b => b.name + ' ' + fm(b.total)).join(', ') + '. My own giving: ' + fm(s.own));
        const g = goalStats(state.goal, s.total, yr, t);
        if (g) L.push('Yearly goal ' + fm(g.goal) + ': ' + (g.reached ? 'reached' + (g.over ? ', ' + fm(g.over) + ' more than the goal' : '') : fm(g.left) + ' still to give' + (g.monthsLeft ? ' (about ' + fm(g.perMonth) + ' a month)' : '')));
        if (s.kindList.length) { L.push('', 'By kind:'); s.kindList.forEach(k => L.push('- ' + k.name + ': ' + fm(k.total))); }
        if (s.count) {
            L.push('', 'Receipts:');
            L.push('- Receipt kept: ' + plural(s.receipts.kept.n, 'gift', 'gifts') + ', ' + fm(s.receipts.kept.amt));
            L.push('- Receipt still to get: ' + plural(s.receipts.todo.n, 'gift', 'gifts') + ', ' + fm(s.receipts.todo.amt));
            L.push('- No receipt needed: ' + plural(s.receipts.none.n, 'gift', 'gifts') + ', ' + fm(s.receipts.none.amt));
            L.push('', 'Gifts:');
            inRange(state, yr.from, yr.to).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).forEach(x => {
                L.push('- ' + fmtDate(x.date, null, { noDay: true }) + ' ' + x.to + ': ' + fm(x.amt) + ' (' + x.kind + ', ' + HOW[x.how].toLowerCase() + ', ' + RECEIPT[x.receipt].toLowerCase() + (x.behalf ? ', on behalf of ' + x.behalf : '') + ')' + (x.note ? ' ' + x.note : ''));
            });
        }
        return L.join('\n');
    }
    const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) || (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) ? '"' + s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"' : s; };
    function csv(state, from, to) {
        const head = ['Date', 'Given to', 'Amount' + (state.cur ? ' (' + state.cur + ')' : ''), 'Kind', 'How paid', 'Receipt', 'On behalf of', 'Note'];
        const rows = inRange(state, from, to).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
            .map(g => [g.date, g.to, moneyInput(g.amt), g.kind, HOW[g.how], RECEIPT[g.receipt], g.behalf, g.note]);
        return [head].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, gifts: [], plans: [], pledges: [], cur: '', yearStart: '01-01', goal: 0 });
    const cents = x => Number.isInteger(x) && x > 0 && x <= MAXC;
    const rid = p => p + Math.random().toString(36).slice(2, 9);
    function uniq(list) { const ids = new Set(); list.forEach(x => { while (ids.has(x.id)) x.id += 'x'; ids.add(x.id); }); return list; }
    function cleanCommon(g) {
        const to = tidy(g.to, 60), kind = tidy(g.kind, 40);
        if (!to || !cents(g.amt)) return null;
        return { to, amt: g.amt, kind: kind || 'General donation', how: HOW[g.how] ? g.how : 'cash', receipt: RECEIPT[g.receipt] ? g.receipt : 'none', behalf: tidy(g.behalf, 40), note: tidy(g.note, 120) };
    }
    function cleanGift(g) {
        if (!g || typeof g !== 'object' || !isDate(g.date)) return null;
        const c = cleanCommon(g); if (!c) return null;
        return Object.assign({ id: tidy(g.id, 40) || rid('g'), date: g.date }, c, { plan: tidy(g.plan, 40) });
    }
    function cleanPlan(p) {
        if (!p || typeof p !== 'object' || !isDate(p.start) || !FREQ[p.freq]) return null;
        const c = cleanCommon(p); if (!c) return null;
        return Object.assign({ id: tidy(p.id, 40) || rid('r'), start: p.start, freq: p.freq, n: Number.isInteger(p.n) && p.n >= 0 && p.n <= 100000 ? p.n : 0, stopped: isDate(p.stopped) ? p.stopped : '' }, c);
    }
    function cleanPledge(p) {
        if (!p || typeof p !== 'object' || !isDate(p.from) || !cents(p.amt)) return null;
        const to = tidy(p.to, 60); if (!to) return null;
        return { id: tidy(p.id, 40) || rid('p'), to, amt: p.amt, from: p.from };
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.gifts)) return null;
        const o = emptyState();
        o.gifts = uniq(s.gifts.slice(0, 20000).map(cleanGift).filter(Boolean));
        o.plans = uniq((Array.isArray(s.plans) ? s.plans : []).slice(0, 200).map(cleanPlan).filter(Boolean));
        o.pledges = uniq((Array.isArray(s.pledges) ? s.pledges : []).slice(0, 200).map(cleanPledge).filter(Boolean));
        if (typeof s.cur === 'string' && s.cur.length <= 4) o.cur = s.cur;
        if (YEARS[s.yearStart]) o.yearStart = s.yearStart;
        if (Number.isInteger(s.goal) && s.goal > 0 && s.goal <= MAXC * 10) o.goal = s.goal;
        return o;
    }
    // a sensible year from the time zone: Pakistan and Australia July, India April, UK 6 April
    function guessYearStart(tz) {
        tz = String(tz || '');
        if (/^(Asia\/Karachi|Australia\/|Asia\/Dhaka|Africa\/(Cairo|Nairobi))/.test(tz)) return '07-01';
        if (/^(Asia\/(Kolkata|Calcutta)|Pacific\/Auckland)/.test(tz)) return '04-01';
        if (/^Europe\/London/.test(tz)) return '04-06';
        return '01-01';
    }

    const api = { MAXC, YEARS, KINDS, HOW, RECEIPT, FREQ, parseNum, parseMoney, mulDiv, isDate, today, addDays, ym, addMonth, monthLast, addMonthsClamp, monthsBetween, yearOf, yearFrom,
        norm, tidy, occ, nextOf, duesOf, allDues, dueCount, inRange, yearStats, goalStats, pledgeStats, names, kinds, fmtNum, fmtMoney, moneyInput, fmtDate, shortMonth, rangeWords, plural, yearTitle,
        freqWords, summaryText, csv, emptyState, cleanGift, cleanPlan, cleanPledge, cleanState, guessYearStart };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GIVING = api;
})(typeof window !== 'undefined' ? window : this);
