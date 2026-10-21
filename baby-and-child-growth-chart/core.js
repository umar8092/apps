// Baby and Child Growth Chart: the logic, with no page code, so tests.js can check it in Node and in test.html.
// Dates are local 'YYYY-MM-DD' strings. Weights are kept in kg and lengths in cm; pounds and inches are only for typing and showing.
// Percentiles use the WHO LMS method, with the WHO rule for weights beyond 3 SD. Not medical advice.
(function (root) {
    'use strict';
    const WHO = typeof module === 'object' && module.exports ? require('./who-data.js') : root.WHO_GROWTH;
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MAX_DAY = 1826;             // 5 years: where the WHO 0-5 standards stop
    const CORRECT_UNTIL = 730;        // corrected age for babies born early is used up to 2 years of real age
    const KINDS = { weight: 'wfa', length: 'lfa', head: 'hcfa' };
    const LINES = [3, 15, 50, 85, 97];
    // values a person could really measure; anything outside is a typing mistake
    const RANGE = { weight: [0.3, 45], length: [30, 135], head: [20, 60] };
    const LB = 0.45359237, IN = 2.54;

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
    function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;
    const todayIso = now => iso(now || new Date());
    function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
    const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000); // b - a in days
    function fmtDateY(s) { const d = parse(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
    function fmtDate(s) { const d = parse(s); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    // whole calendar months from birth to a day (3 Apr to 2 Oct is 5 months, to 3 Oct is 6)
    function monthsBetween(a, b) {
        const A = parse(a), B = parse(b);
        let m = (B.getFullYear() - A.getFullYear()) * 12 + B.getMonth() - A.getMonth();
        if (B.getDate() < A.getDate()) m--;
        return m;
    }
    function addMonths(s, n) {
        const [y, m, d] = s.split('-').map(Number), t = new Date(y, m - 1 + n, 1, 12);
        const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
        t.setDate(Math.min(d, last)); return iso(t);
    }
    // "3 weeks 2 days", "6 months 2 weeks", "2 years 3 months"
    function ageWords(birth, day) {
        const days = diffDays(birth, day);
        if (days < 0) return 'before birth';
        if (days === 0) return 'newborn (day of birth)';
        if (days < 14) return plural(days, 'day', 'days');
        const months = monthsBetween(birth, day);
        if (months < 2) { const w = Math.floor(days / 7), r = days % 7; return plural(w, 'week', 'weeks') + (r ? ' ' + plural(r, 'day', 'days') : ''); }
        if (months < 24) { const rest = diffDays(addMonths(birth, months), day), w = Math.floor(rest / 7); return plural(months, 'month', 'months') + (w ? ' ' + plural(w, 'week', 'weeks') : ''); }
        const y = Math.floor(months / 12), m = months % 12;
        return plural(y, 'year', 'years') + (m ? ' ' + plural(m, 'month', 'months') : '');
    }
    // the age the chart uses: corrected for babies born before 37 weeks, up to 2 years of real age
    function chartAge(child, day) {
        const real = diffDays(child.birth, day);
        const early = child.weeks && child.weeks < 37 ? (40 - child.weeks) * 7 : 0;
        if (early && real <= CORRECT_UNTIL) return { days: real - early, corrected: true, real, early };
        return { days: real, corrected: false, real, early: 0 };
    }

    // ---------- typed numbers ----------
    // "7.4", "7,4" and " 7.40 " are 7.4; anything else is NaN
    function readNum(s) {
        const t = String(s == null ? '' : s).trim().replace(',', '.');
        return /^\d{1,4}(\.\d{1,3})?$/.test(t) || /^\.\d{1,3}$/.test(t) ? Number(t) : NaN;
    }
    const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const r1 = n => Math.round(n * 10) / 10, r2 = n => Math.round(n * 100) / 100, r3 = n => Math.round(n * 1000) / 1000;
    const kgFromLbOz = (lb, oz) => r3((lb + oz / 16) * LB);
    function lbOz(kg) { let oz = Math.round(kg / LB * 16 * 10) / 10, lb = Math.floor(oz / 16); oz = r1(oz - lb * 16); if (oz >= 16) { lb++; oz = 0; } return { lb, oz }; }
    const cmFromIn = i => r2(i * IN);
    const inFromCm = c => r1(c / IN);
    function showWeight(kg, units) { if (units === 'imperial') { const x = lbOz(kg); return x.lb + ' lb ' + x.oz + ' oz'; } return String(r3(kg)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') + ' kg'; }
    function showLen(cm, units) { return units === 'imperial' ? inFromCm(cm) + ' in' : String(r1(cm)) + ' cm'; }

    // ---------- LMS ----------
    function lms(kind, sex, day) {
        const t = WHO[KINDS[kind]][sex];
        if (!t || day < 0 || day > MAX_DAY) return null;
        let lo = 0, hi = t.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid][0] <= day) lo = mid; else hi = mid; }
        const a = t[lo], b = t[hi];
        if (a[0] === day || a === b) return { L: a[1], M: a[2], S: a[3] };
        if (b[0] === day) return { L: b[1], M: b[2], S: b[3] };
        const f = (day - a[0]) / (b[0] - a[0]);
        return { L: a[1] + (b[1] - a[1]) * f, M: a[2] + (b[2] - a[2]) * f, S: a[3] + (b[3] - a[3]) * f };
    }
    const atZ = (p, z) => (p.L === 0 ? p.M * Math.exp(p.S * z) : p.M * Math.pow(1 + p.L * p.S * z, 1 / p.L));
    function zScore(kind, sex, day, x) {
        const p = lms(kind, sex, day); if (!p || !(x > 0)) return null;
        let z = p.L === 0 ? Math.log(x / p.M) / p.S : (Math.pow(x / p.M, p.L) - 1) / (p.L * p.S);
        // WHO: weights beyond 3 SD are measured with the distance between 2 and 3 SD
        if (kind === 'weight' && z > 3) { const s3 = atZ(p, 3), s2 = atZ(p, 2); z = 3 + (x - s3) / (s3 - s2); }
        else if (kind === 'weight' && z < -3) { const s3 = atZ(p, -3), s2 = atZ(p, -2); z = -3 + (x - s3) / (s2 - s3); }
        return z;
    }
    // the value at a percentile, for the chart lines
    function valueAt(kind, sex, day, pct) { const p = lms(kind, sex, day); return p ? atZ(p, probit(pct / 100)) : null; }
    // normal distribution
    function phi(z) {
        const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989422804014327 * Math.exp(-z * z / 2);
        const q = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        return z >= 0 ? 1 - q : q;
    }
    function probit(p) {   // inverse of phi (Acklam), good to 1e-9
        const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628274631];
        const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
        const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
        const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
        if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
        if (p > 1 - 0.02425) return -probit(1 - p);
        const q = p - 0.5, r = q * q;
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    const percentile = z => phi(z) * 100;
    function ordinal(n) { const s = String(n), t = Math.floor(n) % 100, u = Math.floor(n) % 10; return s + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'); }
    // "the 40th percentile", "the 0.4th percentile", "below the 0.1st percentile"
    function pctWords(p) {
        if (p < 0.1) return 'below the 0.1st percentile';
        if (p > 99.9) return 'above the 99.9th percentile';
        if (p < 1) return 'the ' + ordinal(r1(p)) + ' percentile';
        if (p > 99) return 'the ' + ordinal(Math.min(99.9, r1(p))) + ' percentile';
        return 'the ' + ordinal(Math.round(p)) + ' percentile';
    }
    // how many of the chart lines (3rd, 15th, 50th, 85th, 97th) lie between two percentiles
    const linesCrossed = (a, b) => LINES.filter(l => (a < l) !== (b < l)).length;

    // ---------- one measurement ----------
    function kindName(kind, ageDays) { return kind === 'weight' ? 'Weight' : kind === 'head' ? 'Head size' : (ageDays > 730 ? 'Height' : 'Length'); }
    // result for one value: percentile, words, and any warning
    function assess(child, day, kind, value) {
        const age = chartAge(child, day);
        const out = { kind, value, age, name: kindName(kind, age.real) };
        if (age.real > MAX_DAY) { out.stop = 'over5'; return out; }
        if (age.days < 0) { out.stop = 'beforeDue'; return out; }
        const z = zScore(kind, child.sex, age.days, value);
        if (z == null) { out.stop = 'none'; return out; }
        out.z = z; out.p = percentile(z); out.words = pctWords(out.p);
        if (Math.abs(z) > 5) out.flag = 'check';
        else if (out.p < 3) out.flag = 'low';
        else if (out.p > 97) out.flag = 'high';
        return out;
    }
    function checkValue(kind, v) {
        if (Number.isNaN(v)) return 'Type a number, such as ' + (kind === 'weight' ? '7.4' : kind === 'head' ? '43.5' : '67.5') + '.';
        const [lo, hi] = RANGE[kind];
        if (v < lo || v > hi) return (kind === 'weight' ? 'A weight' : kind === 'head' ? 'A head size' : 'A length') + ' of ' + v + ' ' + (kind === 'weight' ? 'kg' : 'cm') + ' is not possible for a child up to 5. Check the number and the unit.';
        return '';
    }
    function checkDay(child, day, today) {
        if (!isIso(day)) return 'Pick the day it was measured.';
        if (diffDays(today, day) > 0) return 'The day cannot be in the future.';
        if (diffDays(child.birth, day) < 0) return 'That day is before ' + child.name + ' was born (' + fmtDateY(child.birth) + ').';
        return '';
    }
    // measurements in date order, with each one compared with the one before of the same kind
    function series(child) {
        const list = child.m.slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.id - b.id));
        const prev = {};
        return list.map(m => {
            const row = { m, age: chartAge(child, m.d), res: {} };
            ['weight', 'length', 'head'].forEach(k => {
                if (m[k] == null) return;
                const a = assess(child, m.d, k, m[k]);
                if (a.p != null && prev[k] && prev[k].p != null && diffDays(prev[k].d, m.d) > 0) {
                    const n = linesCrossed(prev[k].p, a.p);
                    if (n >= 2 && !a.flag) a.flag = a.p < prev[k].p ? 'crossDown' : 'crossUp';
                    if (n >= 2) a.crossed = { n, from: prev[k].p, since: prev[k].d };
                }
                if (a.p != null) prev[k] = { p: a.p, d: m.d };
                row.res[k] = a;
            });
            return row;
        });
    }

    // ---------- text for the doctor ----------
    function table(child, units, today) {
        const lines = [child.name + ' (' + (child.sex === 1 ? 'boy' : 'girl') + ', born ' + fmtDateY(child.birth) + (child.weeks && child.weeks < 37 ? ' at ' + child.weeks + ' weeks, corrected age used to 2 years' : '') + ')', 'WHO Child Growth Standards percentiles', ''];
        const rows = series(child);
        if (!rows.length) lines.push('No measurements yet.');
        rows.forEach(r => {
            const parts = ['weight', 'length', 'head'].filter(k => r.res[k]).map(k => {
                const a = r.res[k], v = k === 'weight' ? showWeight(a.value, units) : showLen(a.value, units);
                return a.name + ' ' + v + (a.p != null ? ' (' + (a.words.startsWith('the ') ? a.words.slice(4) : a.words) + ')' : '');
            });
            lines.push(fmtDateY(r.m.d) + ', ' + ageWords(child.birth, r.m.d) + (r.age.corrected ? ' (corrected ' + (r.age.days < 0 ? 'before due date' : ageWords(child.birth, addDays(child.birth, r.age.days))) + ')' : '') + ': ' + parts.join(', '));
        });
        lines.push('', 'Copied on ' + fmtDateY(today) + '. Not medical advice.');
        return lines.join('\n');
    }

    // ---------- state ----------
    const emptyState = () => ({ v: 1, children: [], active: 0, nextId: 1, units: 'metric' });
    const okNum = (n, lo, hi) => typeof n === 'number' && isFinite(n) && n >= lo && n <= hi;
    const okInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.children)) return null;
        const out = emptyState(); out.units = s.units === 'imperial' ? 'imperial' : 'metric';
        const ids = new Set(); let maxId = 0;
        s.children.slice(0, 20).forEach(c => {
            if (!c || typeof c !== 'object' || !okInt(c.id, 1, 1e9) || ids.has(c.id) || !isIso(c.birth) || (c.sex !== 1 && c.sex !== 2)) return;
            ids.add(c.id); maxId = Math.max(maxId, c.id);
            const k = { id: c.id, name: cleanText(c.name, 30) || 'My child', sex: c.sex, birth: c.birth, weeks: okInt(c.weeks, 22, 42) ? c.weeks : 0, m: [] };
            const mids = new Set();
            (Array.isArray(c.m) ? c.m : []).slice(0, 2000).forEach(m => {
                if (!m || !okInt(m.id, 1, 1e9) || mids.has(m.id) || !isIso(m.d) || m.d < k.birth) return;
                const x = { id: m.id, d: m.d }; let any = false;
                ['weight', 'length', 'head'].forEach(key => { if (okNum(m[key], RANGE[key][0], RANGE[key][1])) { x[key] = m[key]; any = true; } });
                if (!any) return;
                mids.add(m.id); maxId = Math.max(maxId, m.id); k.m.push(x);
            });
            out.children.push(k);
        });
        out.nextId = Math.max(okInt(s.nextId, 1, 1e9) ? s.nextId : 1, maxId + 1);
        out.active = out.children.some(c => c.id === s.active) ? s.active : (out.children[0] ? out.children[0].id : 0);
        return out;
    }

    const api = { MAX_DAY, LINES, RANGE, isIso, todayIso, addDays, diffDays, addMonths, monthsBetween, fmtDate, fmtDateY, ageWords, chartAge,
        readNum, cleanText, kgFromLbOz, lbOz, cmFromIn, inFromCm, showWeight, showLen, r1, r2, lms, zScore, valueAt, phi, probit, percentile, ordinal, pctWords,
        linesCrossed, kindName, assess, checkValue, checkDay, series, table, emptyState, validate };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.GrowthCore = api;
})(this);
