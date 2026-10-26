// LPG Gas Cylinder Refill Log: the maths and the words. No page code here, so tests.js can run it in node.
// Gas is kept in thousandths of a kg or lb (11.8 kg = 11800), money in whole cents, days as whole day numbers,
// so sums are exact. A refill "lasts" from the day it was put on until the day it ran out, or else until the next refill.
(function (root) {
    'use strict';
    const MAXG = 999999;           // 999.999 kg or lb in one cylinder
    const MAXC = 100000000000;     // money up to 1,000,000,000
    const DAY = 86400000;
    const RECENT = 3;              // the usual use is the average of the last 3 finished cylinders
    const SHORT = 1.3, LONG = 0.5; // gas used 30% faster than before is "short"; half as fast or slower is "long"
    const SIZES = { kg: [11800, 14200, 45400, 19000, 5000, 6000, 9000, 12500, 13000, 15000], lb: [20000, 30000, 40000, 100000] };

    // ---------- typed numbers ----------
    // "12,345.6", "12.345,6", "12 345", "1,00,000" and "Rs 23.5" all work. Returns the number times 10^dec as a whole number.
    function parseNum(text, dec, opt) {
        opt = opt || {};
        const bad = opt.bad || 'That number looks mistyped. Type it like 12345 or 12345.6.';
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: opt.blank || 'Type a number.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴%]|kgs?|kilos?|kilograms?|lbs?|pounds?)$/i, '').trim();
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
    const parseGas = t => parseNum(t, 3, { max: MAXG, positive: true, blank: 'Type how much gas, such as 11.8.', zero: 'Type an amount bigger than 0.', big: 'That is more gas than any cylinder holds.', bad: 'Type an amount such as 11.8 or 14.2.', decimals: 'Use at most 3 decimal places.', minus: 'Type it without a minus sign.' });
    const parseMoney = t => parseNum(t, 2, { max: MAXC, blank: 'Type an amount, such as 3200.', big: 'That amount is too big.', bad: 'Type an amount such as 3200 or 3162.40.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.' });
    function parseDays(t) {
        const s = String(t == null ? '' : t).replace(/\s*days?$/i, '').trim();
        if (!s) return { error: 'Type a number of days, such as 25.' };
        if (!/^\d+$/.test(s)) return { error: 'Type a whole number of days, such as 25.' };
        const n = Number(s);
        if (n < 1) return { error: 'Type at least 1 day.' };
        if (n > 730) return { error: 'Type at most 730 days (2 years).' };
        return { n };
    }

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    function dayNum(s) { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); }
    function dayStr(n) { const d = new Date(n * DAY); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number(s.slice(0, 4)) >= 1990 && dayStr(dayNum(s)) === s;
    const localDay = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    const addDays = (s, n) => dayStr(dayNum(s) + n);
    const diff = (a, b) => dayNum(b) - dayNum(a);

    // ---------- the answers for one cylinder ----------
    const gasOf = (c, r) => r.g != null ? r.g : c.size;
    // price per kg or lb in cents, rounded to the cent
    const perUnit = (cents, g) => Math.round(cents * 1000 / g);
    function analyse(c, today) {
        const list = c.refills.slice().sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
        const rows = list.map((r, i) => {
            const next = list[i + 1] || null, g = gasOf(c, r);
            const end = r.out || (next ? next.d : null);
            const days = end ? diff(r.d, end) : null;
            return { r, g, assumed: r.g == null, end, days, gap: r.out && next ? diff(r.out, next.d) : null,
                inUse: !end, running: end ? null : diff(r.d, today), ppu: r.c != null ? perUnit(r.c, g) : null, flag: null };
        });
        const done = rows.filter(x => x.days != null && x.days > 0);
        // compare each finished cylinder with the (up to 3) finished before it. One that lasted twice as long as usual
        // is most likely a refill that was not logged or time away, so it is left out of the usual use.
        const base = [];
        done.forEach(x => {
            const before = base.slice(-RECENT);
            base.push(x);
            if (before.length < 2) return;
            const sg = before.reduce((a, y) => a + y.g, 0), sd = before.reduce((a, y) => a + y.days, 0);
            const usual = Math.round(x.g * sd / sg);          // days this much gas usually lasts
            const speed = (x.g / x.days) / (sg / sd);
            if (speed >= SHORT) x.flag = { kind: 'short', usual, by: usual - x.days };
            else if (speed <= LONG) { x.flag = { kind: 'long', usual, by: x.days - usual }; base.pop(); }
        });
        const out = { rows: rows.slice().reverse(), count: rows.length };
        // the usual use: the last 3 finished cylinders, or the days the person typed
        const recent = base.slice(-RECENT);
        if (recent.length) {
            const g = recent.reduce((a, y) => a + y.g, 0), d = recent.reduce((a, y) => a + y.days, 0);
            out.rate = { g, d, n: recent.length, typed: false };
        } else if (c.usual) out.rate = { g: c.size, d: c.usual, n: 0, typed: true };
        else out.rate = null;
        if (out.rate) out.fullDays = Math.round(c.size * out.rate.d / out.rate.g);
        const last = rows[rows.length - 1] || null;
        if (!last) out.status = 'start';
        else if (!last.inUse) { out.status = 'empty'; out.emptySince = last.r.out; out.emptyDays = diff(last.r.out, today); }
        else {
            out.cur = last;
            if (!out.rate) out.status = 'learning';
            else {
                const lasts = Math.max(1, Math.round(last.g * out.rate.d / out.rate.g));
                out.emptyDay = addDays(last.r.d, lasts);
                out.daysLeft = diff(today, out.emptyDay);
                out.bookDay = addDays(out.emptyDay, -c.lead);
                const used = last.running * out.rate.g / out.rate.d;
                out.left = Math.max(0, Math.round(last.g - used));
                out.leftPct = Math.max(0, Math.min(100, Math.round(out.left * 100 / last.g)));
                out.status = out.daysLeft < 0 ? 'late' : today >= out.bookDay ? 'due' : 'ok';
            }
        }
        // money
        const priced = rows.filter(x => x.ppu != null);
        if (priced.length) {
            const L = priced[priced.length - 1];
            out.price = { ppu: L.ppu, d: L.r.d };
            const E = priced.find(x => x.r.d < L.r.d && diff(x.r.d, L.r.d) <= 366);
            if (E && E.ppu > 0) out.price.trend = { pct: Math.round((L.ppu - E.ppu) * 100 / E.ppu), since: E.r.d, was: E.ppu };
            if (out.rate) out.month = Math.round(L.ppu * out.rate.g * 30 / out.rate.d / 1000 / 100) * 100;
        }
        const ym = today.slice(0, 7), y = today.slice(0, 4);
        const sum = f => rows.filter(x => x.r.c != null && f(x.r.d)).reduce((a, x) => ({ c: a.c + x.r.c, n: a.n + 1 }), { c: 0, n: 0 });
        out.spentMonth = sum(d => d.slice(0, 7) === ym);
        out.spentYear = sum(d => d.slice(0, 4) === y);
        return out;
    }

    // a new refill or an edit: returns an error message or null
    function checkRefill(c, r, today, ignoreId) {
        if (!isDay(r.d)) return { field: 'd', error: 'Pick the date it was put on.' };
        if (r.d > today) return { field: 'd', error: 'That date is in the future. Pick today or an earlier day.' };
        const others = c.refills.filter(x => x.id !== ignoreId);
        if (others.some(x => x.d === r.d)) return { field: 'd', error: 'There is already a refill on that day. Edit that one instead.' };
        if (r.g != null && r.g * 5 > c.size * 6) return { field: 'g', error: 'That is more than this cylinder holds. Check the amount, or change the size with Edit cylinder.' };
        if (r.out != null) {
            if (!isDay(r.out)) return { field: 'out', error: 'Pick the day it ran out.' };
            if (r.out < r.d) return { field: 'out', error: 'It cannot run out before it was put on.' };
            if (r.out > today) return { field: 'out', error: 'That date is in the future.' };
            const next = others.filter(x => x.d > r.d).sort((a, b) => a.d < b.d ? -1 : 1)[0];
            if (next && r.out > next.d) return { field: 'out', error: 'The next refill was put on before that day. Pick a day on or before it.' };
        }
        // a later refill with an earlier "ran out" day would now overlap
        const prev = others.filter(x => x.d < r.d).sort((a, b) => a.d < b.d ? 1 : -1)[0];
        if (prev && prev.out && prev.out > r.d) return { field: 'd', error: 'The cylinder before ran out after this date. Pick a later date, or edit that refill.' };
        return null;
    }

    // ---------- words ----------
    function fmtNum(n, loc, max) {
        try { return new Intl.NumberFormat(loc || undefined, { maximumFractionDigits: max == null ? 3 : max }).format(n); } catch (e) { return String(n); }
    }
    const fmtGas = (g, unit, loc, max) => fmtNum(g / 1000, loc, max) + ' ' + unit;
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
        if (opt === true || opt === 'year') o.year = 'numeric';
        if (opt === 'wd') o.weekday = 'short';
        try { return new Intl.DateTimeFormat(loc || 'en-GB', o).format(new Date(dayNum(s) * DAY)); } catch (e) { return s; }
    }
    const daysWord = n => n + (n === 1 ? ' day' : ' days');
    const inDays = n => n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? 'in ' + daysWord(n) : daysWord(-n) + ' ago';
    const sizeLabel = (c, loc) => fmtGas(c.size, c.unit, loc);

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, cur: '', cyls: [] });
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    const str = (x, max) => typeof x === 'string' ? x.slice(0, max) : '';
    function cleanRefill(r, size) {
        if (!r || typeof r !== 'object' || !isDay(r.d)) return null;
        const o = { id: str(r.id, 40) || ('r' + Math.random().toString(36).slice(2, 10)), d: r.d };
        if (r.g != null) { if (!int(r.g, 1, MAXG) || r.g * 5 > size * 6) return null; o.g = r.g; }
        if (r.c != null) { if (!int(r.c, 0, MAXC)) return null; o.c = r.c; }
        if (r.out != null) { if (!isDay(r.out) || r.out < r.d) return null; o.out = r.out; }
        return o;
    }
    function cleanCyl(c) {
        if (!c || typeof c !== 'object') return null;
        const name = (typeof c.name === 'string' ? c.name : '').trim().slice(0, 40);
        if (!name || !int(c.size, 1, MAXG) || (c.unit !== 'kg' && c.unit !== 'lb')) return null;
        const o = { id: str(c.id, 40) || ('c' + Math.random().toString(36).slice(2, 10)), name, size: c.size, unit: c.unit,
            lead: int(c.lead, 0, 14) ? c.lead : 2, spare: c.spare === true, refills: [] };
        if (c.usual != null && int(c.usual, 1, 730)) o.usual = c.usual;
        const seen = {};
        (Array.isArray(c.refills) ? c.refills : []).slice(0, 2000).forEach(r => {
            const x = cleanRefill(r, o.size);
            if (x && !seen[x.d]) { seen[x.d] = 1; o.refills.push(x); }
        });
        // a "ran out" day after the next refill is impossible: drop it
        o.refills.sort((a, b) => a.d < b.d ? -1 : 1).forEach((r, i, a) => { if (r.out && a[i + 1] && r.out > a[i + 1].d) delete r.out; });
        return o;
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.cyls)) return null;
        const o = emptyState();
        o.cur = str(s.cur, 6);
        s.cyls.slice(0, 50).forEach(c => { const x = cleanCyl(c); if (x) o.cyls.push(x); });
        return o;
    }

    const api = { SIZES, parseNum, parseGas, parseMoney, parseDays, dayNum, dayStr, isDay, localDay, addDays, diff, perUnit, analyse, checkRefill,
        fmtNum, fmtGas, fmtMoney, fmtDate, daysWord, inDays, sizeLabel, emptyState, cleanCyl, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LPG = api;
})(typeof window !== 'undefined' ? window : this);
