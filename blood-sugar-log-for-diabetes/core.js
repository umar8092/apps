// Logic for Blood Sugar Log for Diabetes, kept apart from the page so it can be tested (tests.js).
// Each reading keeps the number exactly as typed with its unit (mg/dL or mmol/L), so nothing is lost by rounding;
// it is converted only for showing (1 mmol/L = 18.016 mg/dL). Times are wall-clock ("2026-10-13T07:10"), so time zones
// or summer time never move a reading to another day.
(function (root) {
    const MG = 18.016;                                  // mg/dL in 1 mmol/L of glucose
    const LIMITS = { mg: [20, 600], mmol: [1.1, 33.3] }; // what home meters can show; below or above they say LO or HI
    const LOW = 70, VERY_LOW = 54, VERY_HIGH = 250;     // mg/dL: hypo level 1 and 2 (ADA), and very high
    const MAX_PEOPLE = 6, MAX_READINGS = 20000, NOTE_MAX = 200, NAME_MAX = 40, PLAN_MAX = 400;
    const MORNING_FROM = 4;                             // readings between midnight and 3:59 belong to the day before

    const TAGS = ['fasting', 'before', 'after1', 'after2', 'bedtime', 'night', 'other'];
    const TAG_NAMES = { fasting: 'Fasting (on waking)', before: 'Before a meal', after1: '1 hour after a meal', after2: '2 hours after a meal',
        bedtime: 'Bedtime', night: 'During the night', other: 'Other time' };
    const TAG_SHORT = { fasting: 'Fasting', before: 'Before meal', after1: '1 h after meal', after2: '2 h after meal', bedtime: 'Bedtime', night: 'Night', other: 'Other' };

    // target ranges in mg/dL; a lower end of 70 or less is shown as "under <high end>"
    const PRESETS = {
        ada: { name: 'General targets for adults (ADA)', t: { fasting: [80, 130], before: [80, 130], after1: [70, 180], after2: [70, 180], bedtime: [90, 150], night: [70, 180], other: [70, 180] } },
        preg: { name: 'Pregnancy with diabetes (ADA)', t: { fasting: [70, 95], before: [70, 95], after1: [70, 140], after2: [70, 120], bedtime: [70, 120], night: [70, 120], other: [70, 140] } }
    };
    function presetTargets(key) { const p = PRESETS[key] || PRESETS.ada, out = {}; TAGS.forEach(k => { out[k] = { lo: p.t[k][0], hi: p.t[k][1] }; }); return out; }

    // ---- units: show mg/dL as whole numbers and mmol/L with one decimal, rounded half up
    const toMg = (v, u) => u === 'mmol' ? v * MG : v;
    function show(mg, unit) { return unit === 'mmol' ? Math.round(mg / MG * 10 + 1e-7) / 10 : Math.round(mg + 1e-7); }
    function fmt(mg, unit) { const v = show(mg, unit); return unit === 'mmol' ? v.toFixed(1) : String(v); }
    const unitName = u => u === 'mmol' ? 'mmol/L' : 'mg/dL';
    function readingMg(r) { return r.hl ? null : toMg(r.v, r.u); }
    function fmtReading(r, unit) { return r.hl || fmt(readingMg(r), unit); }

    // ---- typing: "126", "7.2", "7,2", "7.2 mmol", "HI", "LO"
    // returns { reading: {v, u, hl} } or { error, suggest?: {v, u} } where suggest is the same number in the other unit
    function parseValue(text, unit) {
        let s = String(text == null ? '' : text).trim().toLowerCase().replace(/\s+/g, ' ');
        if (!s) return { error: 'Type the number from your meter, for example ' + (unit === 'mmol' ? '7.2' : '130') + '.' };
        if (/^(hi|high)$/.test(s)) return { reading: { v: null, u: unit, hl: 'HI' } };
        if (/^(lo|low)$/.test(s)) return { reading: { v: null, u: unit, hl: 'LO' } };
        let u = unit;
        const m = s.match(/^(.*?)\s*(mg\s*\/?\s*dl|mg|mmol\s*\/?\s*l|mmol)$/);
        if (m) { s = m[1]; u = m[2].startsWith('mmol') ? 'mmol' : 'mg'; }
        s = s.replace(',', '.');
        if (!/^\d+(\.\d+)?$/.test(s) && !/^\.\d+$/.test(s)) return { error: 'Type the reading as a number, for example ' + (unit === 'mmol' ? '7.2' : '130') + ', or HI or LO if the meter shows that.' };
        const n = Number(s), dec = s.includes('.') ? s.split('.')[1].length : 0, other = u === 'mg' ? 'mmol' : 'mg';
        const fitsOther = other === 'mmol' ? n >= LIMITS.mmol[0] && n <= LIMITS.mmol[1] && dec <= 1 : n >= LIMITS.mg[0] && n <= LIMITS.mg[1] && dec === 0;
        if (u === 'mg') {
            if (dec > 0 || n < LIMITS.mg[0]) {
                if (fitsOther) return { error: s + ' looks like mmol/L (mg/dL readings are whole numbers such as 130). Is your meter in mmol/L?', suggest: { v: n, u: 'mmol' } };
                if (dec > 0) return { error: 'Readings in mg/dL are whole numbers, as the meter shows them.' };
                return { error: n + ' mg/dL is lower than a meter can show (' + LIMITS.mg[0] + '). If the meter says LO, type LO.' };
            }
            if (n > LIMITS.mg[1]) return { error: n + ' mg/dL is higher than a meter can show (' + LIMITS.mg[1] + '). If the meter says HI, type HI.' };
            return { reading: { v: n, u: 'mg', hl: '' } };
        }
        if (n > LIMITS.mmol[1]) {
            if (fitsOther) return { error: n + ' is too high for mmol/L; it looks like mg/dL. Is your meter in mg/dL?', suggest: { v: n, u: 'mg' } };
            return { error: n + ' mmol/L is higher than a meter can show (' + LIMITS.mmol[1] + '). If the meter says HI, type HI.' };
        }
        if (dec > 1) return { error: 'Readings in mmol/L have one decimal, for example 7.2.' };
        if (n < LIMITS.mmol[0]) return { error: n + ' mmol/L is lower than a meter can show (' + LIMITS.mmol[0] + '). If the meter says LO, type LO.' };
        return { reading: { v: n, u: 'mmol', hl: '' } };
    }

    // ---- what one reading means, judged in the person's unit as shown, so the label always agrees with the numbers on screen
    const STATUS = {
        vlow: { name: 'Very low', rank: 0 }, low: { name: 'Low', rank: 1 }, below: { name: 'Below target', rank: 2 },
        in: { name: 'In target', rank: 3 }, above: { name: 'Above target', rank: 4 }, vhigh: { name: 'Very high', rank: 5 }
    };
    function status(r, target, unit) {
        if (r.hl === 'LO') return 'vlow';
        if (r.hl === 'HI') return 'vhigh';
        const v = show(readingMg(r), unit), at = mg => show(mg, unit);
        if (v < at(VERY_LOW)) return 'vlow';
        if (v < at(LOW)) return 'low';
        if (v >= at(VERY_HIGH)) return 'vhigh';
        if (target && v < at(target.lo)) return 'below';
        if (target && v > at(target.hi)) return 'above';
        return 'in';
    }
    function targetText(t, unit) { return (t.lo <= LOW ? 'under ' + fmt(t.hi, unit) : fmt(t.lo, unit) + ' to ' + fmt(t.hi, unit)) + ' ' + unitName(unit); }

    // ---- wall-clock times "YYYY-MM-DDTHH:MM"
    const pad = n => String(n).padStart(2, '0');
    function stamp(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function validStamp(t) {
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(t || ''));
        if (!m) return false;
        const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
        if (y < 1990 || y > 2200 || mo < 1 || mo > 12 || h > 23 || mi > 59 || d < 1) return false;
        return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
    }
    function addDays(date, n) { const [y, m, d] = date.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
    function logDay(t) { const d = t.slice(0, 10); return +t.slice(11, 13) < MORNING_FROM ? addDays(d, -1) : d; }

    function sortReadings(list) { return list.slice().sort((a, b) => a.t < b.t ? -1 : a.t > b.t ? 1 : (a.id < b.id ? -1 : 1)); }
    function inPeriod(readings, from, to) { return readings.filter(r => { const d = logDay(r.t); return (!from || d >= from) && (!to || d <= to); }); }

    // ---- summary for the chosen days, all in the person's unit
    function avgMg(list) { const nums = list.filter(r => !r.hl); return nums.length ? nums.reduce((a, r) => a + readingMg(r), 0) / nums.length : null; }
    function summary(readings, opt) {
        const o = opt || {}, unit = o.unit === 'mmol' ? 'mmol' : 'mg', targets = o.targets || presetTargets('ada');
        const list = sortReadings(inPeriod(readings, o.from, o.to));
        if (!list.length) return { n: 0, unit };
        const counts = {}, byTag = {};
        list.forEach(r => {
            const st = status(r, targets[r.tag], unit);
            counts[st] = (counts[st] || 0) + 1;
            const b = byTag[r.tag] || (byTag[r.tag] = { n: 0, above: 0, below: 0, in: 0, list: [] });
            b.n++; b.list.push(r);
            if (st === 'in') b.in++; else if (st === 'above' || st === 'vhigh') b.above++; else b.below++;
        });
        TAGS.forEach(k => { if (byTag[k]) { const a = avgMg(byTag[k].list); byTag[k].avg = a == null ? null : show(a, unit); byTag[k].hi = byTag[k].list.filter(r => r.hl === 'HI').length; byTag[k].lo = byTag[k].list.filter(r => r.hl === 'LO').length; delete byTag[k].list; } });
        // highest and lowest: a meter's HI beats any number and LO is below any number
        const val = r => r.hl === 'HI' ? Infinity : r.hl === 'LO' ? -Infinity : show(readingMg(r), unit);
        const highest = list.reduce((a, r) => val(r) > val(a) ? r : a, list[0]);
        const lowest = list.reduce((a, r) => val(r) < val(a) ? r : a, list[0]);
        const a = avgMg(list), days = new Set(list.map(r => logDay(r.t)));
        const inN = counts.in || 0;
        return { n: list.length, unit, days: days.size, first: logDay(list[0].t), last: logDay(list[list.length - 1].t),
            avg: a == null ? null : show(a, unit), numbers: list.filter(r => !r.hl).length,
            hiCount: list.filter(r => r.hl === 'HI').length, loCount: list.filter(r => r.hl === 'LO').length,
            counts, byTag, inTarget: inN, percent: Math.round(inN * 100 / list.length + 1e-9),
            lows: (counts.low || 0) + (counts.vlow || 0), veryHighs: counts.vhigh || 0, highest, lowest,
            lowList: list.filter(r => { const s = status(r, targets[r.tag], unit); return s === 'low' || s === 'vlow'; }),
            vhighList: list.filter(r => status(r, targets[r.tag], unit) === 'vhigh') };
    }

    // ---- what to say about one reading
    const LOW_PLAN = 'Low sugar: have 15 g of fast sugar now (for example 150 ml of juice or a non-diet soft drink, or 4 glucose tablets), check again in 15 minutes and repeat if it is still under ' ;
    function advice(st, unit, plan) {
        if (st === 'low' || st === 'vlow') {
            const own = String(plan || '').trim();
            const base = own ? 'Your low-sugar plan: ' + own : LOW_PLAN + fmt(LOW, unit) + ' ' + unitName(unit) + ', then eat a snack or meal.';
            return st === 'vlow' ? base + ' If the person is confused, drowsy or cannot swallow, call emergency services.' : base;
        }
        if (st === 'vhigh') return 'Very high: drink water and check again in 1 to 2 hours. If it stays this high, or you feel sick, are vomiting or breathing fast, contact your doctor or emergency services today. If you have type 1 diabetes, check for ketones.';
        return '';
    }

    // ---- saved data: check every value, drop anything that does not make sense
    function cleanText(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max); }
    function cleanReading(r) {
        if (!r || typeof r !== 'object' || !validStamp(r.t) || !TAGS.includes(r.tag)) return null;
        const u = r.u === 'mmol' ? 'mmol' : r.u === 'mg' ? 'mg' : null;
        if (!u) return null;
        const hl = r.hl === 'HI' || r.hl === 'LO' ? r.hl : '';
        let v = null;
        if (!hl) {
            if (typeof r.v !== 'number' || !isFinite(r.v)) return null;
            v = u === 'mg' ? r.v : Math.round(r.v * 10) / 10;
            if (u === 'mg' && !Number.isInteger(v)) return null;
            if (v < LIMITS[u][0] || v > LIMITS[u][1]) return null;
        }
        return { id: cleanText(r.id, 40) || newId(), t: r.t, tag: r.tag, v, u, hl, note: cleanText(r.note, NOTE_MAX).replace(/\n/g, ' ') };
    }
    function cleanTargets(t) {
        const out = presetTargets('ada');
        if (!t || typeof t !== 'object') return out;
        TAGS.forEach(k => {
            const x = t[k];
            if (x && typeof x.lo === 'number' && typeof x.hi === 'number' && isFinite(x.lo) && isFinite(x.hi) && x.lo >= 36 && x.hi <= 400 && x.lo < x.hi) out[k] = { lo: x.lo, hi: x.hi };
        });
        return out;
    }
    function newPerson(name, unit) { return { id: newId(), name: cleanText(name, NAME_MAX), unit: unit === 'mmol' ? 'mmol' : 'mg', preset: 'ada', targets: presetTargets('ada'), plan: '', readings: [] }; }
    function clean(data, defaultUnit) {
        if (!data || typeof data !== 'object' || !Array.isArray(data.people)) return null;
        const out = { people: [], current: '', period: '14', from: '', to: '' };
        const seen = new Set();
        data.people.slice(0, MAX_PEOPLE).forEach(p => {
            if (!p || typeof p !== 'object') return;
            const q = newPerson(p.name, p.unit === 'mmol' || p.unit === 'mg' ? p.unit : defaultUnit);
            if (typeof p.id === 'string' && p.id && !seen.has(p.id)) q.id = cleanText(p.id, 40);
            seen.add(q.id);
            q.preset = ['ada', 'preg', 'custom'].includes(p.preset) ? p.preset : 'ada';
            q.targets = q.preset === 'custom' ? cleanTargets(p.targets) : presetTargets(q.preset);
            q.plan = cleanText(p.plan, PLAN_MAX);
            const ids = new Set();
            (Array.isArray(p.readings) ? p.readings : []).slice(0, MAX_READINGS).forEach(r => { const c = cleanReading(r); if (c && !ids.has(c.id)) { ids.add(c.id); q.readings.push(c); } });
            q.readings = sortReadings(q.readings);
            out.people.push(q);
        });
        if (!out.people.length) return null;
        out.current = out.people.some(p => p.id === data.current) ? data.current : out.people[0].id;
        if (['7', '14', '30', '90', 'all', 'dates'].includes(String(data.period))) out.period = String(data.period);
        if (/^\d{4}-\d{2}-\d{2}$/.test(data.from || '')) out.from = data.from;
        if (/^\d{4}-\d{2}-\d{2}$/.test(data.to || '')) out.to = data.to;
        return out;
    }
    // a target typed in the person's unit, stored in mg/dL; returns { t: {lo, hi} } or { error }
    function parseTarget(loText, hiText, unit) {
        const num = s => { s = String(s == null ? '' : s).trim().replace(',', '.'); return /^\d+(\.\d)?$/.test(s) ? Number(s) : NaN; };
        const lo = num(loText), hi = num(hiText);
        if (isNaN(lo) || isNaN(hi)) return { error: 'Type two numbers' + (unit === 'mmol' ? ' such as 4.4 and 7.2.' : ' such as 80 and 130.') };
        const loMg = toMg(lo, unit), hiMg = toMg(hi, unit);
        if (loMg >= hiMg) return { error: 'The first number must be lower than the second.' };
        if (loMg < 36 || hiMg > 400) return { error: unit === 'mmol' ? 'Use numbers between 2.0 and 22.2.' : 'Use numbers between 36 and 400.' };
        return { t: { lo: loMg, hi: hiMg } };
    }
    let idn = 0;
    function newId() { return Date.now().toString(36) + (idn++).toString(36) + Math.random().toString(36).slice(2, 6); }

    // ---- spreadsheet: a leading = + - @ would run as a formula in Excel, so it gets a ' in front
    function csvCell(v) { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    function csv(readings, unit, targets) {
        const rows = [['Date', 'Time', 'Reading (' + unitName(unit) + ')', 'When', 'Result', 'Note']];
        sortReadings(readings).forEach(r => rows.push([r.t.slice(0, 10), r.t.slice(11), fmtReading(r, unit), TAG_NAMES[r.tag], STATUS[status(r, targets[r.tag], unit)].name, r.note]));
        return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    const api = { MG, LIMITS, LOW, VERY_LOW, VERY_HIGH, MAX_PEOPLE, NOTE_MAX, NAME_MAX, PLAN_MAX, TAGS, TAG_NAMES, TAG_SHORT, PRESETS, STATUS,
        presetTargets, toMg, show, fmt, unitName, readingMg, fmtReading, parseValue, status, targetText, stamp, validStamp, addDays, logDay,
        sortReadings, inPeriod, summary, advice, cleanReading, cleanTargets, newPerson, clean, parseTarget, newId, csv, csvCell };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SugarCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
