// Work Expense Claim Log: the maths and the words. No page code here, so tests.js can run it in node.
// Money is kept in whole cents and days as whole day numbers, so every sum is exact.
// An expense is "not claimed yet" until claims cover its amount; a rejected claim gives its expenses back; when a claim
// is paid back, each line keeps what was really paid for it, so a cut line (a meal over the limit) shows exactly.
(function (root) {
    'use strict';
    const MAXC = 100000000000;     // money up to 1,000,000,000
    const DAY = 86400000;
    const CATS = ['Taxi or ride', 'Fuel or mileage', 'Train, bus or flight', 'Hotel', 'Meals', 'Client meal or entertainment', 'Office supplies', 'Phone or internet', 'Daily allowance', 'Parking or tolls', 'Other'];
    const SOON = 14;               // a claim-by date this close is "claim soon"
    const LONG_WAIT = 30;          // a claim waiting longer than this is worth chasing

    // ---------- typed numbers ----------
    // "12,345.6", "12.345,6", "12 345", "1,00,000" and "Rs 23.5" all work. Returns the number times 10^dec as a whole number.
    function parseNum(text, dec, opt) {
        opt = opt || {};
        const bad = opt.bad || 'That number looks mistyped. Type it like 12345 or 12345.6.';
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: opt.blank || 'Type a number.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|km|mi|miles?|[$€£₹¥₩₦₱৳₺₽₴]|\/-)$/i, '').trim();
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
                mark = (b.length === 3 && /^\d{1,3}$/.test(a) && a !== '0' && !opt.rate) ? null : one;
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
        const n = Number(intPart || '0') * Math.pow(10, dec) + Number((fracPart + '0000000').slice(0, dec) || '0');
        if (opt.max != null && n > opt.max) return { error: opt.big || 'That number is too big.' };
        if (opt.positive && n <= 0) return { error: opt.zero || 'Type a number bigger than 0.' };
        return { n };
    }
    const parseMoney = (t, positive) => parseNum(t, 2, { max: MAXC, positive, blank: 'Type the amount, such as 2500.', zero: 'Type an amount bigger than 0.', big: 'That amount is too big.', bad: 'Type an amount such as 2500 or 1350.50.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.' });
    // an exchange rate such as 281.5 or 0.0036: up to 6 decimals, kept as millionths
    const parseRate = t => parseNum(t, 6, { rate: true, positive: true, max: 1e15, blank: 'Type the rate, such as 281.50.', zero: 'Type a rate bigger than 0.', bad: 'Type a rate such as 281.50 or 0.92.', decimals: 'Use at most 6 decimal places.', big: 'That rate is too big.' });
    // distance in tenths (120.5 km) and a rate per km or mile in hundredths of a cent (0.45 or 65.5)
    const parseDist = t => parseNum(t, 1, { positive: true, max: 1000000, blank: 'Type the distance, such as 120.', zero: 'Type a distance bigger than 0.', bad: 'Type a distance such as 120 or 85.5.', decimals: 'Use at most 1 decimal place.', big: 'That distance is too long.' });
    const parsePerDist = t => parseNum(t, 4, { rate: true, positive: true, max: 1e10, blank: 'Type the rate, such as 0.45 or 65.', zero: 'Type a rate bigger than 0.', bad: 'Type a rate such as 0.45 or 65.', decimals: 'Use at most 4 decimal places.', big: 'That rate is too big.' });
    // rounding half up, with BigInt so huge amounts stay exact
    function divRound(num, den) { return Number((num + den / 2n) / den); }
    const fxCents = (fcents, rateMicro) => divRound(BigInt(fcents) * BigInt(rateMicro), 1000000n);
    const kmCents = (tenths, rate4) => divRound(BigInt(tenths) * BigInt(rate4), 1000n);
    function parseDays(t) {
        const s = String(t == null ? '' : t).replace(/\s*days?$/i, '').trim();
        if (!s) return { error: 'Type a number of days, such as 45.' };
        if (!/^\d+$/.test(s)) return { error: 'Type a whole number of days, such as 45.' };
        const n = Number(s);
        if (n < 1) return { error: 'Type at least 1 day.' };
        if (n > 730) return { error: 'Type at most 730 days (2 years).' };
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
    // "2026-10" plus n months
    function addMonths(ym, n) { let y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + pad(m + 1); }

    // ---------- the answers ----------
    const claimTotal = c => c.items.reduce((s, it) => s + it.a, 0);
    const paidTotal = c => c.items.reduce((s, it) => s + (it.p || 0), 0);
    // what each claim uses up of an expense: a waiting claim its amount, a paid one its amount (or only what was paid,
    // when the cut part is claimed again), a rejected one nothing
    function used(c, it) { return c.st === 'rej' ? 0 : c.st === 'paid' && c.rest ? it.p : it.a; }
    function analyse(state, today) {
        const days = state.co && state.co.days;
        const E = {};
        state.exps.forEach(e => { E[e.id] = { exp: e, waiting: 0, paidBack: 0, claimedPaid: 0, reopened: 0, rejected: [], claims: [], open: 0 }; });
        const claims = state.claims.map(c => {
            const total = claimTotal(c), got = c.st === 'paid' ? paidTotal(c) : 0;
            c.items.forEach(it => {
                const x = E[it.e]; if (!x) return;
                x.claims.push(c.id);
                if (c.st === 'wait') x.waiting += it.a;
                else if (c.st === 'paid') { x.claimedPaid += it.a; x.paidBack += it.p; if (c.rest) x.reopened += it.a - it.p; }
                else x.rejected.push({ d: c.pd || c.d, why: c.why || '' });
            });
            return { claim: c, total, got, short: c.st === 'paid' ? total - got : 0, age: diff(c.d, today) };
        });
        const exps = state.exps.map(e => {
            const x = E[e.id];
            x.open = e.skip ? 0 : Math.max(0, e.amt + x.reopened - x.waiting - x.claimedPaid);
            x.lost = e.amt - x.paidBack - x.waiting - x.open;     // cut, refused or not claiming: paid by you
            x.claimBy = days ? addDays(e.d, days) : null;
            x.left = x.claimBy ? diff(today, x.claimBy) : null;
            x.age = diff(e.d, today);
            x.status = e.skip ? 'skip' : x.open > 0 ? 'todo' : x.waiting > 0 ? 'wait' : x.claimedPaid > 0 ? 'paid' : 'done';
            x.urgency = x.status !== 'todo' || x.left == null ? 'none' : x.left < 0 ? 'late' : x.left <= SOON ? 'soon' : 'ok';
            return x;
        });
        const todo = exps.filter(x => x.status === 'todo').sort((a, b) => a.exp.d < b.exp.d ? -1 : a.exp.d > b.exp.d ? 1 : 0);
        const waiting = claims.filter(c => c.claim.st === 'wait').sort((a, b) => a.claim.d < b.claim.d ? -1 : 1);
        const done = claims.filter(c => c.claim.st !== 'wait').sort((a, b) => (b.claim.pd || b.claim.d) < (a.claim.pd || a.claim.d) ? -1 : 1);
        const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
        return {
            exps, claims, todo, waiting, done,
            openTotal: sum(todo, x => x.open), late: todo.filter(x => x.urgency === 'late'), soon: todo.filter(x => x.urgency === 'soon'),
            noReceipt: todo.filter(x => x.exp.norec),
            waitTotal: sum(waiting, c => c.total), longWait: waiting.filter(c => c.age > LONG_WAIT),
            paidTotal: sum(exps, x => x.paidBack), spentTotal: sum(exps, x => x.exp.amt), lostTotal: sum(exps, x => x.lost)
        };
    }
    // one calendar month ("2026-10"): spent, by category and by client or project, and how much is not claimed yet
    function month(a, ym) {
        const rows = a.exps.filter(x => x.exp.d.slice(0, 7) === ym);
        const by = (f) => { const o = {}; rows.forEach(x => { const k = f(x); o[k] = (o[k] || 0) + x.exp.amt; }); return Object.keys(o).map(k => ({ k, amt: o[k] })).sort((p, q) => q.amt - p.amt || p.k.localeCompare(q.k)); };
        return {
            ym, n: rows.length, spent: rows.reduce((s, x) => s + x.exp.amt, 0), open: rows.reduce((s, x) => s + x.open, 0),
            waiting: rows.reduce((s, x) => s + x.waiting, 0), paidBack: rows.reduce((s, x) => s + x.paidBack, 0),
            cats: by(x => x.exp.cat), projects: rows.some(x => x.exp.proj) ? by(x => x.exp.proj || '') : []
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
    // a whole number scaled by 10^dec, written without trailing zeros: (2815000, 6) -> "2.815"
    function fmtScaled(n, dec) { const s = String(n).padStart(dec + 1, '0'), i = s.slice(0, s.length - dec), f = s.slice(s.length - dec).replace(/0+$/, ''); return f ? i + '.' + f : i; }
    function fmtDate(s, loc, opt) {
        const o = { day: 'numeric', month: 'short', timeZone: 'UTC' };
        if (opt === true || opt === 'year' || opt === 'wdy') o.year = 'numeric';
        if (opt === 'wd' || opt === 'wdy') o.weekday = 'short';
        try { return new Intl.DateTimeFormat(loc || 'en-GB', o).format(new Date(dayNum(s) * DAY)); } catch (e) { return s; }
    }
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = ym => MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
    const daysWord = n => n + (n === 1 ? ' day' : ' days');
    const inDays = n => n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? 'in ' + daysWord(n) : daysWord(-n) + ' ago';
    const agoWord = n => n === 0 ? 'today' : n === 1 ? 'yesterday' : daysWord(n) + ' ago';
    const expWord = n => n + (n === 1 ? ' expense' : ' expenses');
    const claimWord = n => n + (n === 1 ? ' claim' : ' claims');
    // how the amount was worked out, in words: "USD 45.20 at 281.5" or "120.5 km at 0.45"
    function howWord(e, cur, loc) {
        if (e.fx) return e.fx.c + ' ' + fmtMoney(e.fx.a, '', loc) + ' at ' + fmtScaled(e.fx.r, 6);
        if (e.km) return fmtScaled(e.km.k, 1) + ' ' + (e.km.u || 'km') + ' at ' + (cur ? (/[A-Za-z]$/.test(cur) ? cur + ' ' : cur) : '') + fmtScaled(e.km.r, 4) + ' a ' + (e.km.u === 'mi' ? 'mile' : 'km');
        return '';
    }

    // CSV for a claim form or an accountant; every cell quoted, formulas defused
    function csv(state, a, loc) {
        const q = v => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
        const m = c => (c / 100).toFixed(2);
        const words = { todo: 'Not claimed yet', wait: 'Claimed, waiting', paid: 'Paid back', skip: 'Not claiming', done: 'Claimed' };
        const rows = [['Date', 'Type', 'What for', 'Client or project', 'Amount', 'Worked out from', 'Receipt', 'Status', 'Claim sent', 'Claim number', 'Paid back', 'Waiting', 'Not claimed yet', 'Not paid back', 'Note']];
        const byId = {}; state.claims.forEach(c => { byId[c.id] = c; });
        a.exps.slice().sort((x, y) => x.exp.d < y.exp.d ? -1 : x.exp.d > y.exp.d ? 1 : 0).forEach(x => {
            const e = x.exp, cl = x.claims.map(id => byId[id]).filter(Boolean);
            rows.push([e.d, e.cat, e.what, e.proj || '', m(e.amt), howWord(e, '', 'en-US'), e.norec ? 'No receipt' : 'Yes', words[x.status], cl.map(c => c.d).join(' '), cl.map(c => c.ref || '').filter(Boolean).join(' '),
                m(x.paidBack), m(x.waiting), m(x.open), m(x.lost), e.note || '']);
        });
        return rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
    }

    // ---------- saved data ----------
    const str = (x, max) => typeof x === 'string' ? x.slice(0, max).trim() : '';
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    const emptyState = () => ({ v: 1, cur: '', co: { name: '', days: null }, exps: [], claims: [] });
    function cleanExp(e) {
        if (!e || typeof e !== 'object' || !isDay(e.d) || !int(e.amt, 1, MAXC)) return null;
        const o = { id: str(e.id, 40), d: e.d, amt: e.amt, cat: CATS.includes(e.cat) ? e.cat : 'Other', what: str(e.what, 80) };
        if (!o.id) return null;
        if (!o.what) o.what = o.cat;
        const proj = str(e.proj, 60), note = str(e.note, 300);
        if (proj) o.proj = proj;
        if (note) o.note = note;
        if (e.fx && typeof e.fx === 'object' && /^[A-Za-z]{3}$/.test(str(e.fx.c, 3)) && int(e.fx.a, 1, MAXC) && int(e.fx.r, 1, 1e15)) o.fx = { c: str(e.fx.c, 3).toUpperCase(), a: e.fx.a, r: e.fx.r };
        else if (e.km && typeof e.km === 'object' && int(e.km.k, 1, 1000000) && int(e.km.r, 1, 1e10)) o.km = { k: e.km.k, r: e.km.r, u: e.km.u === 'mi' ? 'mi' : 'km' };
        if (e.norec === true) o.norec = true;
        if (e.skip === true) o.skip = true;
        return o;
    }
    function cleanClaim(c, exps) {
        if (!c || typeof c !== 'object' || !isDay(c.d) || !Array.isArray(c.items)) return null;
        const o = { id: str(c.id, 40), d: c.d, st: ['wait', 'paid', 'rej'].includes(c.st) ? c.st : 'wait', items: [] };
        if (!o.id) return null;
        const seen = {};
        c.items.forEach(it => {
            if (!it || !exps[it.e] || seen[it.e] || !int(it.a, 1, MAXC)) return;
            seen[it.e] = 1;
            const x = { e: it.e, a: it.a };
            if (o.st === 'paid') x.p = int(it.p, 0, it.a) ? it.p : it.a;
            o.items.push(x);
        });
        if (!o.items.length) return null;
        const ref = str(c.ref, 40); if (ref) o.ref = ref;
        if (o.st !== 'wait') o.pd = isDay(c.pd) && c.pd >= o.d ? c.pd : o.d;
        if (o.st === 'paid' && c.rest === true && paidTotal(o) < claimTotal(o)) o.rest = true;
        if (o.st === 'rej') { const why = str(c.why, 200); if (why) o.why = why; }
        return o;
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.exps) || !Array.isArray(s.claims)) return null;
        const co = s.co && typeof s.co === 'object' ? s.co : {};
        const o = { v: 1, cur: str(s.cur, 6), co: { name: str(co.name, 60), days: int(co.days, 1, 730) ? co.days : null }, exps: [], claims: [] };
        const eid = {};
        s.exps.slice(0, 10000).forEach(e => { const x = cleanExp(e); if (x && !eid[x.id]) { eid[x.id] = x; o.exps.push(x); } });
        const cid = {};
        s.claims.slice(0, 5000).forEach(c => { const x = cleanClaim(c, eid); if (x && !cid[x.id]) { cid[x.id] = 1; o.claims.push(x); } });
        return o;
    }
    // what is left to claim on an expense if this claim (being edited) were left out
    function openWithout(state, expId, claimId) {
        const e = state.exps.find(x => x.id === expId); if (!e) return 0;
        let u = 0;
        state.claims.forEach(c => { if (c.id !== claimId) c.items.forEach(it => { if (it.e === expId) u += used(c, it); }); });
        return Math.max(0, e.amt - u);
    }
    // the first expense that claims would cover for more than it cost (should never happen; checked after each change)
    function overClaimed(state) {
        return state.exps.find(e => state.claims.reduce((s, c) => s + c.items.reduce((t, it) => t + (it.e === e.id ? used(c, it) : 0), 0), 0) > e.amt);
    }

    const api = { CATS, MONTHS, SOON, LONG_WAIT, parseNum, parseMoney, parseRate, parseDist, parsePerDist, fxCents, kmCents, parseDays, dayNum, dayStr, isDay, localDay, addDays, diff, addMonths,
        claimTotal, paidTotal, analyse, month, fmtMoney, fmtScaled, fmtDate, monthName, daysWord, inDays, agoWord, expWord, claimWord, howWord, csv,
        emptyState, cleanExp, cleanClaim, cleanState, openWithout, overClaimed };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WEC = api;
})(typeof window !== 'undefined' ? window : this);
