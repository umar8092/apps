// Logic for Lab Test Results Tracker, kept apart from the page so it can be tested (tests.js).
// Each result keeps the value, unit and normal range exactly as printed on that lab report, so a lab with a
// different range or unit never changes older results. Dates are plain "YYYY-MM-DD" strings.
(function (root) {
    const MAX_PEOPLE = 8, MAX_TESTS = 60, MAX_RESULTS = 2000, NAME_MAX = 60, UNIT_MAX = 24, NOTE_MAX = 200, LAB_MAX = 60;

    // ---- tests people are most often given, with the units labs print and a typical adult range for each unit.
    // f and off convert a value in that unit to the first (main) unit: main = value * f + off.
    // d is how many decimals to show when a value is converted into that unit.
    const PRESETS = [
        { key: 'hba1c', group: 'Diabetes', name: 'HbA1c (3-month sugar average)', units: [{ u: '%', f: 1, d: 1, range: '4.0-5.6' }, { u: 'mmol/mol', f: 1 / 10.929, off: 2.15, d: 0, range: '20-38' }] },
        { key: 'fbs', group: 'Diabetes', name: 'Fasting blood sugar (glucose)', units: [{ u: 'mg/dL', f: 1, d: 0, range: '70-99' }, { u: 'mmol/L', f: 18, d: 1, range: '3.9-5.5' }] },
        { key: 'tchol', group: 'Cholesterol', name: 'Total cholesterol', units: [{ u: 'mg/dL', f: 1, d: 0, range: '<200' }, { u: 'mmol/L', f: 38.67, d: 1, range: '<5.2' }] },
        { key: 'ldl', group: 'Cholesterol', name: 'LDL cholesterol ("bad")', units: [{ u: 'mg/dL', f: 1, d: 0, range: '<100' }, { u: 'mmol/L', f: 38.67, d: 1, range: '<2.6' }] },
        { key: 'hdl', group: 'Cholesterol', name: 'HDL cholesterol ("good")', units: [{ u: 'mg/dL', f: 1, d: 0, range: '>40' }, { u: 'mmol/L', f: 38.67, d: 1, range: '>1.0' }] },
        { key: 'tg', group: 'Cholesterol', name: 'Triglycerides', units: [{ u: 'mg/dL', f: 1, d: 0, range: '<150' }, { u: 'mmol/L', f: 88.57, d: 1, range: '<1.7' }] },
        { key: 'tsh', group: 'Thyroid', name: 'TSH (thyroid)', units: [{ u: 'mIU/L', f: 1, d: 2, range: '0.4-4.0' }, { u: 'µIU/mL', f: 1, d: 2, range: '0.4-4.0' }] },
        { key: 'ft4', group: 'Thyroid', name: 'Free T4', units: [{ u: 'ng/dL', f: 1, d: 2, range: '0.8-1.8' }, { u: 'pmol/L', f: 1 / 12.87, d: 1, range: '10-23' }] },
        { key: 'creat', group: 'Kidneys', name: 'Creatinine', units: [{ u: 'mg/dL', f: 1, d: 2, range: '0.6-1.3' }, { u: 'µmol/L', f: 1 / 88.4, d: 0, range: '53-115' }] },
        { key: 'egfr', group: 'Kidneys', name: 'eGFR (kidney function)', units: [{ u: 'mL/min/1.73m²', f: 1, d: 0, range: '>=60' }] },
        { key: 'uric', group: 'Kidneys', name: 'Uric acid', units: [{ u: 'mg/dL', f: 1, d: 1, range: '3.5-7.2' }, { u: 'µmol/L', f: 1 / 59.48, d: 0, range: '208-428' }] },
        { key: 'vitd', group: 'Vitamins and iron', name: 'Vitamin D (25-OH)', units: [{ u: 'ng/mL', f: 1, d: 0, range: '30-100' }, { u: 'nmol/L', f: 1 / 2.496, d: 0, range: '75-250' }] },
        { key: 'b12', group: 'Vitamins and iron', name: 'Vitamin B12', units: [{ u: 'pg/mL', f: 1, d: 0, range: '200-900' }, { u: 'pmol/L', f: 1.355, d: 0, range: '148-664' }] },
        { key: 'ferr-w', group: 'Vitamins and iron', name: 'Ferritin (iron stores), women', units: [{ u: 'ng/mL', f: 1, d: 0, range: '15-150' }, { u: 'µg/L', f: 1, d: 0, range: '15-150' }] },
        { key: 'ferr-m', group: 'Vitamins and iron', name: 'Ferritin (iron stores), men', units: [{ u: 'ng/mL', f: 1, d: 0, range: '30-400' }, { u: 'µg/L', f: 1, d: 0, range: '30-400' }] },
        { key: 'hb-w', group: 'Blood count', name: 'Haemoglobin (Hb), women', units: [{ u: 'g/dL', f: 1, d: 1, range: '12.0-15.5' }, { u: 'g/L', f: 0.1, d: 0, range: '120-155' }] },
        { key: 'hb-m', group: 'Blood count', name: 'Haemoglobin (Hb), men', units: [{ u: 'g/dL', f: 1, d: 1, range: '13.5-17.5' }, { u: 'g/L', f: 0.1, d: 0, range: '135-175' }] },
        { key: 'wbc', group: 'Blood count', name: 'White blood cells (WBC)', units: [{ u: '×10⁹/L', f: 1, d: 1, range: '4.0-11.0' }, { u: '/µL', f: 0.001, d: 0, range: '4000-11000' }] },
        { key: 'plt', group: 'Blood count', name: 'Platelets', units: [{ u: '×10⁹/L', f: 1, d: 0, range: '150-400' }, { u: '/µL', f: 0.001, d: 0, range: '150000-400000' }] },
        { key: 'alt', group: 'Liver', name: 'ALT (liver)', units: [{ u: 'U/L', f: 1, d: 0, range: '7-56' }] },
        { key: 'psa', group: 'Other', name: 'PSA (prostate)', units: [{ u: 'ng/mL', f: 1, d: 2, range: '<4.0' }] },
        { key: 'k', group: 'Other', name: 'Potassium', units: [{ u: 'mmol/L', f: 1, d: 1, range: '3.5-5.1' }] },
        { key: 'na', group: 'Other', name: 'Sodium', units: [{ u: 'mmol/L', f: 1, d: 0, range: '135-145' }] }
    ];
    const preset = key => PRESETS.find(p => p.key === key) || null;
    // units a test can be typed in: a preset's units, or the one unit the person typed for their own test
    function unitsOf(test) {
        const p = test && test.key ? preset(test.key) : null;
        return p ? p.units.map(x => x.u) : [test ? test.unit : ''];
    }
    function unitInfo(test, u) {
        const p = test && test.key ? preset(test.key) : null;
        return p ? p.units.find(x => x.u === u) || null : null;
    }
    // converts a value from one of the test's units to another; null when it cannot be converted
    function convert(test, v, from, to) {
        if (from === to) return v;
        const a = unitInfo(test, from), b = unitInfo(test, to);
        if (!a || !b) return null;
        const main = v * a.f + (a.off || 0);
        return (main - (b.off || 0)) / b.f;
    }
    function defaultRange(test, u) { const x = unitInfo(test, u); return x ? normRange(x.range) || '' : ''; }

    // ---- numbers: "6.4", "6,4" (comma decimal), "<5", "> 100", "1,500" (thousands), "250,000"
    function parseNumber(s) {
        s = String(s).trim();
        if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
        if (/^-?\d+\.$/.test(s)) return Number(s.slice(0, -1));
        if (/^-?\.\d+$/.test(s)) return Number(s.replace('.', '0.'));
        if (/^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''));   // 1,500 or 250,000.5
        if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));   // 1.500,5
        if (/^-?\d*,\d+$/.test(s)) return Number(s.replace(',', '.').replace(/^(-?)\./, '$10.'));      // 6,4
        return null;
    }
    const QUAL = { '<': '<', '<=': '≤', '≤': '≤', '>': '>', '>=': '≥', '≥': '≥' };
    function parseValue(text, allowNegative) {
        let s = String(text == null ? '' : text).trim().replace(/\s+/g, ' ');
        if (!s) return { empty: true };
        let q = '';
        const m = s.match(/^(<=|>=|<|>|≤|≥)\s*(.*)$/);
        if (m) { q = QUAL[m[1]]; s = m[2]; }
        else if (/^(less than|under|below)\s+/i.test(s)) { q = '<'; s = s.replace(/^(less than|under|below)\s+/i, ''); }
        else if (/^(more than|over|above)\s+/i.test(s)) { q = '>'; s = s.replace(/^(more than|over|above)\s+/i, ''); }
        const v = parseNumber(s);
        if (v === null || !isFinite(v)) return { error: 'Type a number as printed on the report, for example 6.4 or <5.' };
        if (v < 0 && !allowNegative) return { error: 'This result cannot be below 0.' };
        if (Math.abs(v) > 1e7) return { error: 'That number is too big. Check the report.' };
        return { v: round(v, 6), q };
    }

    // ---- normal ranges: "70-99", "70 – 99", "70 to 99", "<200", "≤5.6", ">40", ">= 60", "0,4-4,0", "under 200"
    const NUM = '(-?\\d+(?:[.,]\\d+)?|[1-9]\\d{0,2}(?:,\\d{3})+)';
    function parseRange(text) {
        let s = String(text == null ? '' : text).trim().replace(/\s+/g, ' ').replace(/[–—−]/g, '-');
        if (!s) return { range: null };
        s = s.replace(/^(less than|under|below)\s*/i, '<').replace(/^(more than|over|above)\s*/i, '>').replace(/^up to\s*/i, '<=');
        s = s.replace(/^(.+?)\s*or (more|above|higher)$/i, '>=$1').replace(/^(.+?)\s*or (less|below|lower)$/i, '<=$1');
        let m = s.match(new RegExp('^' + NUM + '\\s*(?:-|to)\\s*' + NUM + '$', 'i'));
        if (m) {
            const lo = parseNumber(m[1]), hi = parseNumber(m[2]);
            if (lo === null || hi === null) return { error: 'Type the range as printed, for example 70-99, <200 or >40.' };
            if (lo > hi) return { error: 'The first number of the range must be the smaller one, for example 70-99.' };
            return { range: { lo, loInc: true, hi, hiInc: true, ls: numText(m[1]), hs: numText(m[2]) } };
        }
        m = s.match(new RegExp('^(<=|>=|<|>|≤|≥)\\s*' + NUM + '$'));
        if (m) {
            const v = parseNumber(m[2]), q = QUAL[m[1]];
            if (v === null) return { error: 'Type the range as printed, for example 70-99, <200 or >40.' };
            if (q === '<' || q === '≤') return { range: { lo: null, loInc: true, hi: v, hiInc: q === '≤', hs: numText(m[2]) } };
            return { range: { lo: v, loInc: q === '≥', hi: null, hiInc: true, ls: numText(m[2]) } };
        }
        return { error: 'Type the range as printed, for example 70-99, <200 or >40.' };
    }
    const num = v => String(round(v, 6));
    // keeps the decimals as printed ("4.0-5.6" stays 4.0-5.6), with a dot and no thousands commas
    function numText(s) { const v = parseNumber(s); return v === null ? '' : /,\d{3}/.test(s) && !/^0/.test(s) && v >= 1000 ? num(v) : String(s).replace(',', '.').replace(/^(-?)\./, '$10.'); }
    function rangeText(r) {
        if (!r) return '';
        const lo = r.ls || num(r.lo), hi = r.hs || num(r.hi);
        if (r.lo != null && r.hi != null) return lo + '–' + hi;
        if (r.hi != null) return (r.hiInc ? '≤' : '<') + hi;
        if (r.lo != null) return (r.loInc ? '≥' : '>') + lo;
        return '';
    }
    // plain words for a range, for people who do not read "<" easily
    function rangeWords(r) {
        if (!r) return '';
        const lo = r.ls || num(r.lo), hi = r.hs || num(r.hi);
        if (r.lo != null && r.hi != null) return lo + ' to ' + hi;
        if (r.hi != null) return (r.hiInc ? 'up to ' : 'under ') + hi;
        return (r.loInc ? lo + ' or more' : 'over ' + lo);
    }
    // normalises what was typed so the same range always reads the same
    function normRange(text) { const p = parseRange(text); return p.error ? null : rangeText(p.range); }

    // ---- is a result inside its own range?  'high' | 'low' | 'ok' | 'none' (no range typed)
    function status(v, q, rangeStr) {
        const p = parseRange(rangeStr);
        if (p.error || !p.range) return 'none';
        const r = p.range;
        if (r.lo != null) {
            const below = q === '<' || q === '≤' ? v <= r.lo : q === '>' || q === '≥' ? false : r.loInc ? v < r.lo : v <= r.lo;
            if (below) return 'low';
        }
        if (r.hi != null) {
            const above = q === '>' || q === '≥' ? v >= r.hi : q === '<' || q === '≤' ? false : r.hiInc ? v > r.hi : v >= r.hi;
            if (above) return 'high';
        }
        return 'ok';
    }
    const STATUS_WORDS = { high: 'Above the range', low: 'Below the range', ok: 'In the range', none: 'No range typed' };

    // ---- numbers for people: no float noise, no needless zeros
    function round(v, d) { const k = Math.pow(10, d); return Math.round((v + (v >= 0 ? 1 : -1) * 1e-9) * k) / k; }
    function decimalsOf(v) { const s = String(v); const i = s.indexOf('.'); return i < 0 ? 0 : Math.min(6, s.length - i - 1); }
    function fmt(v, d) { return d == null ? num(v) : round(v, d).toFixed(d); }
    function valueText(r) { return (r.q || '') + num(r.v); }

    // a result shown in the test's chosen unit (converted when typed in another unit)
    function shown(test, r) {
        const u = test.unit;
        if (r.unit === u) return { v: r.v, d: decimalsOf(r.v), text: valueText(r), converted: false };
        const c = convert(test, r.v, r.unit, u);
        if (c === null) return { v: null, d: 0, text: valueText(r) + ' ' + r.unit, converted: false };
        const info = unitInfo(test, u), d = Math.max(info.d, 0);
        return { v: round(c, d), d, text: (r.q || '') + fmt(c, d), converted: true };
    }
    function rangeIn(test, r) {
        // the result's range, converted to the test's unit, for the chart band
        const p = parseRange(r.range);
        if (p.error || !p.range) return null;
        const g = x => x == null ? null : convert(test, x, r.unit, test.unit);
        const lo = g(p.range.lo), hi = g(p.range.hi);
        if ((p.range.lo != null && lo === null) || (p.range.hi != null && hi === null)) return null;
        return { lo, hi };
    }

    // ---- results in date order, newest first; the same day keeps the order they were added
    function sortResults(list) {
        return list.map((r, i) => [r, i]).sort((a, b) => a[0].date < b[0].date ? 1 : a[0].date > b[0].date ? -1 : b[1] - a[1]).map(x => x[0]);
    }
    // latest result and how it compares with the one before, in the test's unit
    function trend(test) {
        const list = sortResults(test.results);
        if (!list.length) return null;
        const last = list[0], prev = list[1] || null;
        const out = { last, prev, status: status(last.v, last.q, last.range), shown: shown(test, last), change: null };
        if (prev) {
            const a = shown(test, last), b = shown(test, prev);
            out.prevShown = b;
            if (a.v !== null && b.v !== null && !last.q && !prev.q) {
                const d = Math.max(a.d, b.d), delta = round(a.v - b.v, d);
                out.change = { delta, d, dir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same', text: fmt(Math.abs(delta), d) };
            }
        }
        return out;
    }
    // one plain sentence: "6.4 % on 12 Oct 2026, down 0.7 from 7.1 % on 3 Apr 2026. Above the range (4.0–5.6)."
    function sentence(test, fmtDate) {
        const t = trend(test);
        if (!t) return 'No results yet.';
        const u = test.unit ? ' ' + test.unit : '';
        let s = t.shown.text + u + ' on ' + fmtDate(t.last.date);
        if (t.prev) {
            const was = t.prevShown.text + (t.prevShown.v === null ? '' : u) + ' on ' + fmtDate(t.prev.date);
            s += t.change ? (t.change.dir === 'same' ? ', the same as ' + was : ', ' + t.change.dir + ' ' + t.change.text + ' from ' + was) : ', was ' + was;
        }
        s += '. ' + STATUS_WORDS[t.status];
        const rs = t.last.range;
        if (rs) s += ' (' + rs + (t.last.unit !== test.unit ? ' ' + t.last.unit : '') + ')';
        return s + '.';
    }

    // ---- new things
    let seq = 0;
    function newId() { seq = (seq + 1) % 1e6; return Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6); }
    function newPerson(name) { return { id: newId(), name: String(name || '').slice(0, NAME_MAX), tests: [] }; }
    function newTest(key, custom) {
        const p = key ? preset(key) : null;
        if (p) return { id: newId(), key: p.key, name: p.name, unit: p.units[0].u, ranges: {}, results: [] };
        const c = custom || {};
        const range = normRange(c.range || '');
        const unit = String(c.unit || '').trim().slice(0, UNIT_MAX);
        return { id: newId(), key: '', name: String(c.name || '').trim().slice(0, NAME_MAX), unit, ranges: range ? { [unit]: range } : {}, results: [] };
    }
    // the range to suggest for a new result in a unit: the last one used in that unit, else the usual one
    function suggestRange(test, u) {
        if (test.ranges && typeof test.ranges[u] === 'string') return test.ranges[u];
        return defaultRange(test, u);
    }

    // ---- dates
    function validDate(d) {
        if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
        const [y, m, dd] = d.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, dd));
        return y >= 1900 && y <= 2200 && x.getUTCMonth() === m - 1 && x.getUTCDate() === dd;
    }

    // ---- saved data: anything odd is dropped, never trusted
    const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
    function cleanResult(r, test) {
        if (!r || typeof r !== 'object' || !validDate(r.date)) return null;
        const v = Number(r.v);
        if (typeof r.v !== 'number' || !isFinite(v) || Math.abs(v) > 1e7) return null;
        const units = unitsOf(test);
        const unit = typeof r.unit === 'string' && units.includes(r.unit) ? r.unit : test.unit;
        const q = ['<', '≤', '>', '≥'].includes(r.q) ? r.q : '';
        const range = typeof r.range === 'string' ? (normRange(r.range.slice(0, 40)) || '') : '';
        return { id: str(r.id, 40) || newId(), date: r.date, v, q, unit, range, lab: str(r.lab, LAB_MAX), note: str(r.note, NOTE_MAX) };
    }
    function cleanTest(t) {
        if (!t || typeof t !== 'object') return null;
        const p = typeof t.key === 'string' && t.key ? preset(t.key) : null;
        const name = str(t.name, NAME_MAX).trim() || (p ? p.name : '');
        if (!name) return null;
        let unit = str(t.unit, UNIT_MAX);
        if (p && !p.units.some(x => x.u === unit)) unit = p.units[0].u;
        const test = { id: str(t.id, 40) || newId(), key: p ? p.key : '', name, unit, ranges: {}, results: [] };
        if (t.ranges && typeof t.ranges === 'object') Object.keys(t.ranges).slice(0, 10).forEach(u => {
            if (unitsOf(test).includes(u) && typeof t.ranges[u] === 'string') { const n = t.ranges[u] === '' ? '' : normRange(t.ranges[u].slice(0, 40)); if (n !== null) test.ranges[u] = n; }
        });
        test.results = (Array.isArray(t.results) ? t.results : []).slice(0, MAX_RESULTS).map(r => cleanResult(r, test)).filter(Boolean);
        return test;
    }
    function clean(data) {
        if (!data || typeof data !== 'object' || !Array.isArray(data.people)) return null;
        const people = data.people.slice(0, MAX_PEOPLE).filter(p => p && typeof p === 'object').map(p => ({
            id: str(p.id, 40) || newId(), name: str(p.name, NAME_MAX),
            tests: (Array.isArray(p.tests) ? p.tests : []).slice(0, MAX_TESTS).map(cleanTest).filter(Boolean)
        }));
        if (!people.length) return null;
        const ids = new Set();
        people.forEach(p => { if (ids.has(p.id)) p.id = newId(); ids.add(p.id); });
        const current = people.some(p => p.id === data.current) ? data.current : people[0].id;
        return { people, current };
    }

    // ---- spreadsheet
    function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n\r;]/.test(s) || /^[=+\-@]/.test(s) ? '"' + s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"' : s; }
    function csv(person) {
        const rows = [['Person', 'Test', 'Date', 'Result', 'Unit', 'Normal range', 'Inside the range?', 'Lab', 'Note']];
        person.tests.forEach(t => sortResults(t.results).slice().reverse().forEach(r => {
            rows.push([person.name, t.name, r.date, valueText(r), r.unit, r.range, STATUS_WORDS[status(r.v, r.q, r.range)], r.lab, r.note]);
        }));
        return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    const api = { PRESETS, preset, unitsOf, unitInfo, convert, defaultRange, parseNumber, parseValue, parseRange, rangeText, rangeWords, normRange, status, STATUS_WORDS,
        round, fmt, valueText, shown, rangeIn, sortResults, trend, sentence, newId, newPerson, newTest, suggestRange, validDate, clean, csv,
        MAX_PEOPLE, MAX_TESTS, MAX_RESULTS, NAME_MAX, UNIT_MAX, NOTE_MAX, LAB_MAX };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LabCore = api;
})(typeof window !== 'undefined' ? window : this);
