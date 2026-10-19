// Electricity, Gas and Water Meter Reading Log: the maths and the words. No page code here, so tests.js can run it in node.
// Readings and units are kept in thousandths (12,345.6 kWh = 12345600), prices in ten-thousandths (27.34 = 273400),
// money in whole cents, so every sum is exact. Between two readings the use is spread evenly over the days.
(function (root) {
    'use strict';
    const MAXR = 99999999999;      // 99,999,999.999 on the meter
    const MAXP = 10000000000;      // price per unit up to 1,000,000
    const MAXC = 100000000000;     // money up to 1,000,000,000
    const DAY = 86400000;
    const UNITS = ['kWh', 'units', 'm³', 'ft³', '100 ft³', 'litres', 'gallons'];

    // ---------- typed numbers ----------
    // "12,345.6", "12.345,6", "12 345", "1,00,000" and "Rs 23.5" all work. Returns the number times 10^dec as a whole number.
    function parseNum(text, dec, opt) {
        opt = opt || {};
        const bad = opt.bad || 'That number looks mistyped. Type it like 12345 or 12345.6.';
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: opt.blank || 'Type a number.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴%]|kwh|units?|m3|m³|ft3|ft³|litres?|liters?|gallons?)$/i, '').trim();
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
    const parseReading = t => parseNum(t, 3, { max: MAXR, blank: 'Type the number on the meter, such as 12345.', decimals: 'Use at most 3 decimal places.', big: 'That reading is too big. Check the number on the meter.', minus: 'Meter readings are never below 0. Type the number as it shows.' });
    const parsePrice = t => parseNum(t, 4, { max: MAXP, positive: true, blank: 'Type the price per unit, such as 25 or 0.27.', zero: 'The price must be more than 0.', big: 'That price is too big.', bad: 'Type a price such as 25 or 0.2734.' });
    const parseMoney = t => parseNum(t, 2, { max: MAXC, blank: 'Type an amount, such as 300.', big: 'That amount is too big.', bad: 'Type an amount such as 300 or 12.50.' });
    const parseUnits = t => parseNum(t, 3, { max: MAXR, positive: true, blank: 'Type a number of units, such as 200.', zero: 'Type a number bigger than 0.', big: 'That is too many units.' });
    const parsePct = t => {
        const r = parseNum(t, 2, { blank: 'Type the tax, such as 17.', bad: 'Type a percent such as 17 or 5.5.' });
        if (r.error) return r;
        if (r.n > 10000) return { error: 'Tax can be at most 100%.' };
        return r;
    };

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dayStr(dayNum(s)) === s;
    function dayNum(s) { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); }
    function dayStr(n) { const d = new Date(n * DAY); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const localDay = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m is 1-12
    // the reading day in a month: day 31 becomes 30 or 28/29 in short months
    function readDay(y, m, cd) { while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return dayNum(y + '-' + pad(m) + '-' + pad(Math.min(cd, daysIn(y, m)))); }
    // the bill period that holds day t (a day number): from the reading day on or before t to the next reading day
    function periodOf(t, cd) {
        const d = new Date(t * DAY), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
        let start = readDay(y, m, cd), k = 0;
        if (start > t) { start = readDay(y, m - 1, cd); k = -1; }
        return { start, end: readDay(y, m + k + 1, cd) };
    }
    function prevPeriod(p, cd) { return periodOf(p.start - 1, cd); }

    // ---------- the readings ----------
    function sorted(readings) { return readings.slice().sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0); }
    // runs of readings on the same meter; a reading marked "reset" (new meter, or it went back to 0) starts a new run
    function runs(readings) {
        const out = [];
        sorted(readings).forEach(r => {
            const p = { t: dayNum(r.d), v: r.v };
            if (!out.length || r.reset) out.push([p]); else out[out.length - 1].push(p);
        });
        return out;
    }
    function valueAt(run, t) {
        for (let i = 1; i < run.length; i++) {
            const a = run[i - 1], b = run[i];
            if (t <= b.t) return a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t);
        }
        return run[run.length - 1].v;
    }
    // use between day a and day b, spread evenly between readings; covered = days of [a, b] that readings cover
    function usageBetween(readings, a, b) {
        let mu = 0, covered = 0;
        runs(readings).forEach(run => {
            const lo = Math.max(a, run[0].t), hi = Math.min(b, run[run.length - 1].t);
            if (hi > lo) { mu += valueAt(run, hi) - valueAt(run, lo); covered += hi - lo; }
        });
        return { mu: Math.round(mu), covered };
    }
    // is this reading possible next to the others? Returns { error } or { warn } or {}
    function checkReading(readings, r, replaceId) {
        if (!isDay(r.d)) return { error: 'Pick the date you read the meter.' };
        if (r.today && r.d > r.today) return { error: 'That date is in the future. Pick today or an earlier day.' };
        if (r.d < '2000-01-01') return { error: 'Pick a date after the year 2000.' };
        const others = readings.filter(x => x.id !== replaceId && x.d !== r.d);
        const all = sorted(others.concat([{ id: '_new', d: r.d, v: r.v, reset: !!r.reset }]));
        const i = all.findIndex(x => x.id === '_new');
        const prev = all[i - 1], next = all[i + 1];
        if (prev && !r.reset && r.v < prev.v) return { error: 'This is lower than the reading on ' + fmtDate(prev.d, r.loc, true) + ' (' + fmtReading(prev.v, r.loc) + '). If the meter was changed or went back to zero, tick "New meter, or the meter went back to 0".', prev, kind: 'low' };
        if (next && !next.reset && next.v < r.v) return { error: 'This is higher than the later reading on ' + fmtDate(next.d, r.loc, true) + ' (' + fmtReading(next.v, r.loc) + '). Check the number or the date.', next, kind: 'high' };
        // a likely typo: far more per day than usual
        if (prev && !r.reset) {
            const before = all.slice(0, i), u = usageBetween(before, -Infinity, Infinity);
            const days = dayNum(r.d) - dayNum(prev.d), perDay = (r.v - prev.v) / days;
            if (u.covered >= 7 && u.mu > 0 && perDay > 5 * (u.mu / u.covered) && perDay > 1000) return { warn: true, perDay, usual: u.mu / u.covered };
        }
        return {};
    }

    // ---------- money ----------
    // cost of mu thousandths of a unit at p ten-thousandths per unit, in cents, rounded half up
    function costOf(mu, p) { return Number((BigInt(Math.round(mu)) * BigInt(p) + 50000n) / 100000n); }
    function energyCost(mu, price) {
        if (!price || price.mode === 'none') return null;
        if (price.mode === 'flat') return costOf(mu, price.flat);
        const steps = price.steps;
        if (price.whole) {
            const s = steps.find(x => x.upTo == null || mu <= x.upTo) || steps[steps.length - 1];
            return costOf(mu, s.p);
        }
        let left = mu, from = 0, c = 0;
        for (const s of steps) {
            const size = s.upTo == null ? left : Math.min(left, s.upTo - from);
            if (size > 0) { c += costOf(size, s.p); left -= size; }
            if (s.upTo != null) from = s.upTo;
            if (left <= 0) break;
        }
        return c;
    }
    // the whole bill for mu units over a period of days, or null if no price is set
    function billFor(m, mu, days) {
        const energy = energyCost(mu, m.price);
        if (energy == null) return null;
        const fixed = !m.fixed || !m.fixed.c ? 0 : m.fixed.per === 'day' ? m.fixed.c * days : m.fixed.c;
        const tax = m.tax ? Math.floor(((energy + fixed) * m.tax + 5000) / 10000) : 0;
        return { energy, fixed, tax, total: energy + fixed + tax };
    }

    // ---------- the answers for one meter ----------
    function summary(m, todayStr) {
        const rs = sorted(m.readings), today = dayNum(todayStr);
        const P = periodOf(today, m.day), days = P.end - P.start;
        const out = { count: rs.length, period: { start: dayStr(P.start), end: dayStr(P.end), days } };
        if (!rs.length) return out;
        const last = rs[rs.length - 1], lastT = dayNum(last.d);
        out.last = last; out.ago = today - lastT;
        // recent use per day: the last 30 days of readings, or all of them
        let r = usageBetween(rs, lastT - 30, lastT);
        if (r.covered < 7) r = usageBetween(rs, -Infinity, Infinity);
        const upTo = Math.max(P.start, Math.min(lastT, P.end));
        const known = usageBetween(rs, P.start, upTo);
        // use per day: this bill period once it has a week of readings, otherwise the last 30 days of readings
        out.rateFrom = known.covered >= 7 ? 'period' : '30';
        if (known.covered >= 7) r = known;
        out.rate = r.covered ? r.mu / r.covered : null;
        if (out.rate == null) return out;
        const gap = (upTo - P.start) - known.covered;       // days in this period before the readings start (or between a meter change)
        out.inPeriod = lastT > P.start;
        out.known = known.mu; out.knownFrom = dayStr(upTo - known.covered); out.knownDays = known.covered;
        out.exact = gap === 0 && out.inPeriod;
        out.soFar = Math.round(known.mu + out.rate * gap);
        out.daysLeft = P.end - upTo;
        out.projected = Math.round(out.soFar + out.rate * out.daysLeft);
        out.billSoFar = billFor(m, out.soFar, upTo - P.start);
        out.billEnd = billFor(m, out.projected, days);
        if (m.limit) {
            const L = m.limit;
            out.limit = L;
            if (out.soFar > L) out.over = out.soFar - L;
            else {
                out.allow = out.daysLeft ? (L - out.soFar) / out.daysLeft : 0;
                out.willPass = out.projected > L;
                if (out.willPass && out.rate > 0) out.passOn = dayStr(upTo + Math.max(1, Math.ceil((L - out.soFar) / out.rate)));
            }
        }
        return out;
    }
    // finished bill periods, newest first, with the same period a year before when there are readings for it
    function history(m, todayStr, max) {
        const rs = sorted(m.readings);
        if (rs.length < 2) return [];
        const first = dayNum(rs[0].d), list = [];
        let p = prevPeriod(periodOf(dayNum(todayStr), m.day), m.day);
        const all = [];
        while (p.end > first && all.length < 120) { all.push(p); p = prevPeriod(p, m.day); }
        const rows = all.map(q => {
            const u = usageBetween(rs, q.start, q.end), days = q.end - q.start;
            if (!u.covered) return null;
            const full = u.covered === days ? u.mu : Math.round(u.mu * days / u.covered);
            return { start: dayStr(q.start), end: dayStr(q.end), days, mu: full, part: u.covered < days, covered: u.covered, perDay: full / days, bill: billFor(m, full, days) };
        });
        rows.forEach((row, i) => {
            if (!row) return;
            const ly = rows[i + 12];
            if (ly && ly.covered * 2 >= ly.days && ly.perDay > 0) row.vsLastYear = { start: ly.start, change: (row.perDay - ly.perDay) / ly.perDay };
            if (list.length < (max || 24)) list.push(row);
        });
        return list;
    }
    // each reading with the use since the one before it
    function readingRows(m) {
        const rs = sorted(m.readings);
        return rs.map((r, i) => {
            const prev = rs[i - 1];
            if (!prev || r.reset) return { r, first: !prev, reset: !!r.reset && !!prev };
            const days = dayNum(r.d) - dayNum(prev.d);
            return { r, used: r.v - prev.v, days, perDay: (r.v - prev.v) / days };
        }).reverse();
    }

    // ---------- words ----------
    function fmtNum(n, dec, locale) {
        try { return new Intl.NumberFormat(locale || undefined, { maximumFractionDigits: dec }).format(n); }
        catch (e) { return String(Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec)); }
    }
    const fmtReading = (mu, loc) => fmtNum(mu / 1000, 3, loc);
    // units used: whole numbers stay whole, small amounts keep one decimal
    const fmtUnits = (mu, loc) => fmtNum(Math.abs(mu) >= 100000 ? Math.round(mu / 1000) : Math.round(mu / 100) / 10, 1, loc);
    const fmtRate = (mu, loc) => fmtNum(Math.round(mu / 100) / 10, 1, loc);
    function fmtMoney(cents, cur, loc) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(loc || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        t = (cents < 0 ? '-' : '') + t;
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }
    const fmtPrice = (p, cur, loc) => {
        let t; try { t = new Intl.NumberFormat(loc || undefined, { maximumFractionDigits: 4 }).format(p / 10000); } catch (e) { t = String(p / 10000); }
        return !cur ? t : /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    };
    function fmtDate(s, loc, withYear) {
        const d = new Date(dayNum(s) * DAY);
        const o = { day: 'numeric', month: 'short', timeZone: 'UTC' }; if (withYear) o.year = 'numeric';
        try { return new Intl.DateTimeFormat(loc || 'en-GB', o).format(d); } catch (e) { return s; }
    }
    const daysWord = n => n + (n === 1 ? ' day' : ' days');

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, cur: '', meters: [] });
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    function cleanPrice(p) {
        if (!p || typeof p !== 'object') return { mode: 'none' };
        if (p.mode === 'flat' && int(p.flat, 1, MAXP)) return { mode: 'flat', flat: p.flat };
        if (p.mode === 'steps' && Array.isArray(p.steps) && p.steps.length >= 2 && p.steps.length <= 12) {
            const steps = []; let from = 0;
            for (let i = 0; i < p.steps.length; i++) {
                const s = p.steps[i] || {}, lastOne = i === p.steps.length - 1;
                if (!int(s.p, 1, MAXP)) return { mode: 'none' };
                if (lastOne) steps.push({ upTo: null, p: s.p });
                else { if (!int(s.upTo, from + 1, MAXR)) return { mode: 'none' }; steps.push({ upTo: s.upTo, p: s.p }); from = s.upTo; }
            }
            return { mode: 'steps', steps, whole: !!p.whole };
        }
        return { mode: 'none' };
    }
    function cleanMeter(m) {
        if (!m || typeof m !== 'object') return null;
        const name = String(m.name || '').trim().slice(0, 40), unit = String(m.unit || '').trim().slice(0, 16);
        if (!name || !unit) return null;
        const out = { id: String(m.id || '').slice(0, 40) || ('m' + Math.random().toString(36).slice(2, 10)), name, unit,
            day: int(m.day, 1, 31) ? m.day : 1, price: cleanPrice(m.price),
            fixed: m.fixed && int(m.fixed.c, 1, MAXC) ? { c: m.fixed.c, per: m.fixed.per === 'day' ? 'day' : 'bill' } : null,
            tax: int(m.tax, 1, 10000) ? m.tax : 0, limit: int(m.limit, 1, MAXR) ? m.limit : 0, readings: [] };
        const seen = new Set();
        (Array.isArray(m.readings) ? m.readings : []).forEach(r => {
            if (!r || !isDay(r.d) || !int(r.v, 0, MAXR) || seen.has(r.d)) return;
            seen.add(r.d);
            out.readings.push({ id: String(r.id || '').slice(0, 40) || ('r' + Math.random().toString(36).slice(2, 10)), d: r.d, v: r.v, reset: !!r.reset });
        });
        if (out.readings.length > 5000) out.readings = sorted(out.readings).slice(-5000);
        // a later reading lower than the one before it (without a reset) cannot be right: mark it as a meter change so nothing goes negative
        const rs = sorted(out.readings);
        for (let i = 1; i < rs.length; i++) if (!rs[i].reset && rs[i].v < rs[i - 1].v) rs[i].reset = true;
        if (rs.length) rs[0].reset = false;
        out.readings = rs;
        return out;
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.meters)) return null;
        const out = emptyState();
        out.cur = typeof s.cur === 'string' ? s.cur.slice(0, 4) : '';
        const ids = new Set();
        s.meters.slice(0, 30).forEach(m => { const c = cleanMeter(m); if (c && !ids.has(c.id)) { ids.add(c.id); out.meters.push(c); } });
        return out;
    }

    const api = { MAXR, MAXP, MAXC, UNITS, parseNum, parseReading, parsePrice, parseMoney, parseUnits, parsePct,
        isDay, dayNum, dayStr, localDay, daysIn, periodOf, sorted, runs, usageBetween, checkReading,
        costOf, energyCost, billFor, summary, history, readingRows,
        fmtNum, fmtReading, fmtUnits, fmtRate, fmtMoney, fmtPrice, fmtDate, daysWord, emptyState, cleanMeter, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MRL = api;
})(typeof window !== 'undefined' ? window : this);
