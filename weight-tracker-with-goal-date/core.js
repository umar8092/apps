// Weight Tracker with Goal Date: the maths and checks, with no page code, so tests.js can run it in node.
// Weights are stored as whole grams, so changing kg / lb / stone never changes a saved weigh-in.
(function (root) {
    const LB = 453.59237;               // grams in one pound (exact, by definition)
    const MIN_G = 20000, MAX_G = 350000; // 20 kg to 350 kg (44 lb to 772 lb)
    const UNITS = ['kg', 'lb', 'st'];

    // ---------- dates as 'YYYY-MM-DD' text, counted in whole days (UTC maths, so summer time never shifts a day)
    const pad = n => String(n).padStart(2, '0');
    const isDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && toDay(d) !== null && fromDay(toDay(d)) === d;
    function toDay(d) { const [y, m, dd] = d.split('-').map(Number); const t = Date.UTC(y, m - 1, dd); return isNaN(t) ? null : Math.round(t / 864e5); }
    function fromDay(n) { const t = new Date(n * 864e5); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
    const addDays = (d, n) => fromDay(toDay(d) + n);
    const daysBetween = (a, b) => toDay(b) - toDay(a);
    const localDate = dt => dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());

    // ---------- units
    const toG = (v, unit) => Math.round(unit === 'kg' ? v * 1000 : v * LB);
    // a number in the unit, rounded to 0.1 (stone: total pounds)
    const r1 = x => Math.round(x * 10 + 1e-9 * Math.sign(x)) / 10;
    function inUnit(g, unit) { return unit === 'kg' ? r1(g / 1000) : r1(g / LB); }
    function stoneParts(g) {
        let tenthLb = Math.round(Math.abs(g) / LB * 10), st = Math.floor(tenthLb / 140);
        return { st, lb: (tenthLb - st * 140) / 10 };
    }
    const n1 = x => x.toFixed(1);
    function fmtW(g, unit) {
        if (unit === 'st') { const p = stoneParts(g); return p.st + ' st ' + n1(p.lb) + ' lb'; }
        return n1(inUnit(g, unit)) + ' ' + unit;
    }
    // a change: '−3.4 kg', '+0.2 lb', '0.0 kg'; stone shows pounds under 1 stone
    function fmtDiff(g, unit) {
        const sign = g < 0 ? '−' : '+';
        if (unit === 'st') {
            const p = stoneParts(g);
            if (p.st === 0 && p.lb === 0) return '0.0 lb';
            return sign + (p.st ? p.st + ' st ' : '') + n1(p.lb) + ' lb';
        }
        const v = inUnit(Math.abs(g), unit);
        return v === 0 ? '0.0 ' + unit : sign + n1(v) + ' ' + unit;
    }
    // a pace: two decimals when it is small, so 0.04 kg does not show as 0.0
    function fmtPace(gPerWeek, unit) {
        const u = unit === 'st' ? 'lb' : unit, v = Math.abs(gPerWeek) / (u === 'kg' ? 1000 : LB);
        const s = v < 0.095 ? v.toFixed(2) : n1(v);
        return s + ' ' + u;
    }

    // ---------- reading what was typed
    function num(text) {
        const t = String(text == null ? '' : text).trim().replace(/\s+/g, ' ');
        if (!t) return { blank: true };
        // a comma used as the decimal mark: 82,4
        const c = t.replace(/^(\d+),(\d{1,2})$/, '$1.$2');
        if (!/^-?\d*\.?\d+$/.test(c)) return { bad: true };
        return { v: parseFloat(c) };
    }
    function rangeText(unit) { return unit === 'kg' ? '20 to 350 kg' : unit === 'lb' ? '44 to 772 lb' : '3 st 2 lb to 55 st'; }
    function checkG(g, unit, raw) {
        if (g >= MIN_G && g <= MAX_G) return { g };
        let hint = '';
        if (raw != null && raw > 0) { for (const f of [10, 100]) { const tg = toG(raw / f, unit === 'st' ? 'lb' : unit); if (tg >= MIN_G && tg <= MAX_G && unit !== 'st') { hint = 'Did you mean ' + (raw / f) + '?'; break; } } }
        return { err: 'Type a weight from ' + rangeText(unit) + '.', hint };
    }
    // one box: '82.4', '82,4', '181 lb', '82.4kg', '12 st 6', '12st 6.5lb'; a unit typed after the number wins over the chosen unit
    function parseWeight(text, unit) {
        let t = String(text == null ? '' : text).trim().toLowerCase().replace(/\s+/g, ' ');
        if (!t) return { err: 'Type your weight.' };
        let m = t.match(/^(\d+(?:[.,]\d+)?) ?(?:st|stone)s?(?: ?(\d+(?:[.,]\d+)?) ?(?:lb|lbs|pounds?)?)?$/);
        if (m) return parseStone(m[1], m[2] || '');
        m = t.match(/^(.*?) ?(kg|kgs|kilos?|lb|lbs|pounds?)$/);
        let u = unit === 'st' ? 'lb' : unit;
        if (m) { t = m[1]; u = m[2].startsWith('k') ? 'kg' : 'lb'; }
        const r = num(t);
        if (r.blank) return { err: 'Type your weight.' };
        if (r.bad) return { err: 'Type a number, for example ' + (u === 'kg' ? '82.4' : '181.6') + '.' };
        if (r.v <= 0) return { err: 'A weight must be more than 0.' };
        return checkG(toG(r.v, u), u, r.v);
    }
    function parseStone(stText, lbText) {
        const s = num(stText), l = num(lbText);
        if (s.blank && l.blank) return { err: 'Type your weight.' };
        if (s.bad || l.bad) return { err: 'Type numbers, for example 12 st and 6.5 lb.' };
        const st = s.blank ? 0 : s.v, lb = l.blank ? 0 : l.v;
        if (st < 0 || lb < 0) return { err: 'A weight must be more than 0.' };
        if (st !== Math.floor(st)) return { err: 'Type whole stones, and the rest in pounds (for example 12 st 6.5 lb).' };
        if (lb >= 14) return { err: 'Pounds must be under 14 (14 lb is 1 stone).' };
        return checkG(toG(st * 14 + lb, 'lb'), 'st', null);
    }
    // height: centimetres, or feet and inches; returns millimetres
    function parseHeight(a, b, hUnit) {
        if (hUnit === 'cm') {
            const r = num(a);
            if (r.blank) return { blank: true };
            if (r.bad || r.v < 50 || r.v > 250) return { err: 'Type a height from 50 to 250 cm.' };
            return { mm: Math.round(r.v * 10) };
        }
        const f = num(a), i = num(b);
        if (f.blank && i.blank) return { blank: true };
        if (f.bad || i.bad) return { err: 'Type numbers, for example 5 ft 7 in.' };
        const ft = f.blank ? 0 : f.v, inch = i.blank ? 0 : i.v;
        if (inch < 0 || inch >= 12 || ft < 0) return { err: 'Inches must be from 0 to under 12.' };
        const mm = Math.round((ft * 12 + inch) * 25.4);
        if (mm < 500 || mm > 2500) return { err: 'Type a height from 1 ft 8 in to 8 ft 2 in.' };
        return { mm };
    }
    function heightParts(mm) { const tin = Math.round(mm / 25.4); return { ft: Math.floor(tin / 12), inch: tin % 12 }; }

    // ---------- BMI (WHO adult ranges)
    function bmi(g, mm) {
        if (!g || !mm) return null;
        const v = Math.round(g / 1000 / Math.pow(mm / 1000, 2) * 10) / 10;
        const cat = v < 18.5 ? 'under' : v < 25 ? 'healthy' : v < 30 ? 'over' : 'obese';
        return { v, cat };
    }
    // the weight range for a healthy BMI (18.5 to 24.9) at this height, in grams
    function healthyRange(mm) { const m2 = Math.pow(mm / 1000, 2); return { lo: Math.ceil(18.5 * m2 * 1000), hi: Math.floor(24.9 * m2 * 1000) }; }

    // ---------- the log
    // one value per day: the average of that day's weigh-ins (two weigh-ins on one day are both kept)
    function daily(entries) {
        const by = new Map();
        entries.forEach(e => { const x = by.get(e.d) || { d: e.d, sum: 0, n: 0 }; x.sum += e.g; x.n++; by.set(e.d, x); });
        return [...by.values()].sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0).map(x => ({ d: x.d, g: Math.round(x.sum / x.n), n: x.n }));
    }
    // average of the daily values in the 7 days ending on `end` (both ends counted)
    function avgWindow(days, end, len) {
        const from = addDays(end, -(len - 1)), inside = days.filter(x => x.d >= from && x.d <= end);
        if (!inside.length) return null;
        return { g: Math.round(inside.reduce((s, x) => s + x.g, 0) / inside.length), days: inside.length, from, to: end };
    }
    // least-squares line through the daily values of the last 28 days: grams per day
    function pace(days, end) {
        const from = addDays(end, -27), pts = days.filter(x => x.d >= from && x.d <= end);
        if (pts.length < 3) return { none: 'few', n: pts.length };
        const span = daysBetween(pts[0].d, pts[pts.length - 1].d);
        if (span < 7) return { none: 'short', n: pts.length, span };
        const xs = pts.map(p => toDay(p.d)), mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = pts.reduce((a, p) => a + p.g, 0) / pts.length;
        let sxy = 0, sxx = 0;
        pts.forEach((p, i) => { sxy += (xs[i] - mx) * (p.g - my); sxx += (xs[i] - mx) * (xs[i] - mx); });
        const perDay = sxy / sxx;
        return { perDay, perWeek: Math.round(perDay * 7), n: pts.length, from: pts[0].d, to: pts[pts.length - 1].d, span };
    }

    // everything the page shows, from one person's weigh-ins and goal
    function stats(entries, opts) {
        opts = opts || {};
        const days = daily(entries);
        if (!days.length) return { empty: true };
        const first = days[0], last = days[days.length - 1];
        const avg7 = avgWindow(days, last.d, 7);
        const prev = avgWindow(days, addDays(last.d, -7), 7);
        const s = {
            days, count: entries.length, first, last, avg7,
            since: last.g - first.g, sinceAvg: avg7.g - first.g,
            week: prev ? { g: avg7.g - prev.g, prev } : null,
            pace: pace(days, last.d)
        };
        const goal = opts.goalG;
        if (goal) s.goal = goalInfo(s, goal, opts.target || null);
        return s;
    }
    const STILL = 50; // a pace under 50 g a week (about 0.1 lb) counts as no change
    function goalInfo(s, goal, target) {
        const now = s.avg7.g, left = goal - now;
        let dir = Math.sign(goal - s.first.g);
        if (dir === 0) dir = Math.sign(left);
        const out = { goal, left, dir };
        if (dir === 0 || (dir < 0 && now <= goal) || (dir > 0 && now >= goal)) { out.status = 'reached'; return out; }
        const p = s.pace;
        if (p.none) out.status = 'nopace';
        else if (Math.abs(p.perWeek) < STILL) out.status = 'still';
        else if (Math.sign(p.perWeek) !== Math.sign(left)) out.status = 'away';
        else {
            const d = Math.ceil(left / p.perDay);
            if (d > 365 * 5) out.status = 'far';
            else { out.status = 'date'; out.days = d; out.date = addDays(s.last.d, d); }
        }
        if (target) {
            const t = { date: target, days: daysBetween(s.last.d, target) };
            if (t.days <= 0) t.passed = true;
            else {
                t.perWeek = Math.round(left / t.days * 7);
                if (out.status === 'date') t.diffDays = daysBetween(out.date, target);   // > 0: early, < 0: late
            }
            out.target = t;
        }
        return out;
    }

    // ---------- saved data: check every value, drop what is broken
    let idn = 0;
    const newId = p => p + Date.now().toString(36) + (idn++).toString(36) + Math.random().toString(36).slice(2, 6);
    function newPerson(name) { return { id: newId('p'), name: name || '', unit: 'kg', hUnit: 'cm', heightMm: null, goalG: null, target: null, noBmi: false, range: '90', entries: [] }; }
    function cleanEntry(e) {
        if (!e || typeof e !== 'object' || !isDate(e.d) || e.d < '1900-01-01') return null;
        const g = Math.round(Number(e.g));
        if (!isFinite(g) || g < MIN_G || g > MAX_G) return null;
        return { id: typeof e.id === 'string' && e.id ? e.id.slice(0, 40) : newId('e'), d: e.d, g, note: typeof e.note === 'string' ? e.note.slice(0, 200) : '' };
    }
    function cleanPerson(p) {
        if (!p || typeof p !== 'object') return null;
        const o = newPerson(typeof p.name === 'string' ? p.name.slice(0, 40) : '');
        if (typeof p.id === 'string' && p.id) o.id = p.id.slice(0, 40);
        if (UNITS.includes(p.unit)) o.unit = p.unit;
        if (p.hUnit === 'ftin') o.hUnit = 'ftin';
        const h = Math.round(Number(p.heightMm)); if (p.heightMm != null && isFinite(h) && h >= 500 && h <= 2500) o.heightMm = h;
        const g = Math.round(Number(p.goalG)); if (p.goalG != null && isFinite(g) && g >= MIN_G && g <= MAX_G) o.goalG = g;
        if (isDate(p.target)) o.target = p.target;
        o.noBmi = p.noBmi === true;
        if (['30', '90', '365', 'all'].includes(p.range)) o.range = p.range;
        const seen = new Set();
        o.entries = (Array.isArray(p.entries) ? p.entries : []).slice(0, 20000).map(cleanEntry).filter(e => e && !seen.has(e.id) && seen.add(e.id));
        return o;
    }
    function clean(data) {
        if (!data || typeof data !== 'object' || !Array.isArray(data.people)) return null;
        const seen = new Set(), people = data.people.slice(0, 20).map(cleanPerson).filter(p => p && !seen.has(p.id) && seen.add(p.id));
        if (!people.length) return null;
        return { v: 1, people, current: people.some(p => p.id === data.current) ? data.current : people[0].id };
    }
    // newest first, and in the order typed within a day
    function sortEntries(list) { return list.map((e, i) => ({ e, i })).sort((a, b) => a.e.d < b.e.d ? 1 : a.e.d > b.e.d ? -1 : b.i - a.i).map(x => x.e); }

    // spreadsheet line: quotes around text that needs them
    const csvCell = v => { const s = String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };

    const api = { LB, MIN_G, MAX_G, isDate, toDay, fromDay, addDays, daysBetween, localDate, toG, inUnit, stoneParts, fmtW, fmtDiff, fmtPace,
        parseWeight, parseStone, parseHeight, heightParts, bmi, healthyRange, daily, avgWindow, pace, stats, goalInfo, newId, newPerson, cleanEntry, cleanPerson, clean, sortEntries, csvCell };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WTCore = api;
})(this);
