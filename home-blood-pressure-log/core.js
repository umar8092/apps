// Logic for Home Blood Pressure Log, kept apart from the page so it can be tested (tests.js).
// A reading's time is stored as the wall-clock time it was taken ("2026-10-13T07:10"), so changing time zone
// or summer time never moves a reading to another day.
(function (root) {
    const LIMITS = { sys: [60, 300], dia: [30, 200], pulse: [30, 250] };
    const MAX_PEOPLE = 6, MAX_READINGS = 20000, NOTE_MAX = 200, NAME_MAX = 40;
    const MORNING_FROM = 4, EVENING_FROM = 12;   // 4:00-11:59 is morning; 12:00 to 3:59 the next night is evening

    // ---- the two guides people are most often given
    // UK and Europe (NICE NG136, ESH): thresholds for HOME readings. US (AHA/ACC): the same numbers for home and clinic.
    const GUIDES = {
        nice: { name: 'UK and Europe home guide (NICE, ESH)', short: 'UK and Europe guide', line: [135, 85] },
        aha: { name: 'US guide (American Heart Association)', short: 'US guide', line: [130, 80] }
    };
    const LEVELS = {
        low: { rank: 0, nice: 'Low', aha: 'Low', range: 'under 90/60' },
        normal: { rank: 1, nice: 'Normal', aha: 'Normal' },
        elevated: { rank: 2, aha: 'Elevated', range: '120 to 129 and under 80' },
        s1: { rank: 3, nice: 'Raised: stage 1 range', aha: 'High: stage 1' },
        s2: { rank: 4, nice: 'High: stage 2 range', aha: 'High: stage 2' },
        severe: { rank: 5, nice: 'Very high', aha: 'Severe' }
    };
    const RANGES = {
        nice: { low: 'under 90/60', normal: 'under 135/85', s1: '135/85 or higher', s2: '150/95 or higher', severe: '180/120 or higher' },
        aha: { low: 'under 90/60', normal: 'under 120/80', elevated: '120 to 129 and under 80', s1: '130 to 139 or 80 to 89', s2: '140/90 or higher', severe: 'over 180 or over 120' }
    };

    function level(sys, dia, guide) {
        if (guide === 'aha') {
            if (sys > 180 || dia > 120) return 'severe';
            if (sys >= 140 || dia >= 90) return 's2';
            if (sys >= 130 || dia >= 80) return 's1';
            if (sys >= 120) return 'elevated';
        } else {
            if (sys >= 180 || dia >= 120) return 'severe';
            if (sys >= 150 || dia >= 95) return 's2';
            if (sys >= 135 || dia >= 85) return 's1';
        }
        if (sys < 90 || dia < 60) return 'low';
        return 'normal';
    }
    function levelName(key, guide) { const g = guide === 'aha' ? 'aha' : 'nice'; return LEVELS[key][g] || LEVELS[key].aha; }
    function levelRange(key, guide) { return RANGES[guide === 'aha' ? 'aha' : 'nice'][key] || ''; }
    function levelText(key, guide) { return levelName(key, guide) + ' (' + levelRange(key, guide) + ')'; }

    // ---- typing: whole numbers, also "120/80", "120/80/72", "120 80 72" pasted into one box
    function splitPasted(text) {
        const m = String(text == null ? '' : text).trim().match(/^(\d{2,3})\s*(?:[\/\\\-,;:]|\s)\s*(\d{2,3})(?:\s*(?:[\/\\\-,;:]|\s|pulse|p|hr|bpm)+\s*(\d{2,3}))?\s*(?:bpm|mmhg)?$/i);
        if (!m) return null;
        return { sys: m[1], dia: m[2], pulse: m[3] || '' };
    }
    const WORD = { sys: 'top number', dia: 'bottom number', pulse: 'pulse' };
    function parseNum(text, kind, optional) {
        const s = String(text == null ? '' : text).trim();
        if (!s) return optional ? { value: null } : { error: 'Type the ' + WORD[kind] + (kind === 'sys' ? ' (systolic), for example 120.' : ' (diastolic), for example 80.') };
        if (/^\d+[.,]\d*$/.test(s)) return { error: 'Use a whole number for the ' + WORD[kind] + ', as the monitor shows it.' };
        if (!/^\d+$/.test(s)) return { error: 'Type the ' + WORD[kind] + ' as a number, for example ' + (kind === 'sys' ? 120 : kind === 'dia' ? 80 : 70) + '.' };
        const n = Number(s), [lo, hi] = LIMITS[kind];
        if (n > hi) {
            const guess = Math.round(n / 10);
            return { error: n + ' is too high for the ' + WORD[kind] + '.' + (guess >= lo && guess <= hi ? ' Did you mean ' + guess + '?' : ' Check the number.') };
        }
        if (n < lo) return { error: n + ' is too low for the ' + WORD[kind] + ' (lowest ' + lo + '). Check the number.' };
        return { value: n };
    }
    // returns { reading: {sys, dia, pulse} } or { errors: {sys?, dia?, pulse?}, swap?: true }
    function checkReading(sysText, diaText, pulseText) {
        const a = parseNum(sysText, 'sys'), b = parseNum(diaText, 'dia'), c = parseNum(pulseText, 'pulse', true);
        const errors = {};
        if (a.error) errors.sys = a.error;
        if (b.error) errors.dia = b.error;
        if (c.error) errors.pulse = c.error;
        if (!a.error && !b.error && a.value <= b.value) {
            errors.dia = a.value === b.value ? 'The top and bottom numbers cannot be the same. Check the monitor.'
                : 'The top number (' + a.value + ') must be bigger than the bottom number (' + b.value + '). Did you swap them?';
            return { errors, swap: a.value < b.value };
        }
        if (Object.keys(errors).length) return { errors };
        return { reading: { sys: a.value, dia: b.value, pulse: c.value } };
    }

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
    function daysBetween(a, b) { const f = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 864e5); }
    function hourOf(t) { return +t.slice(11, 13); }
    // readings taken after midnight but before 4 a.m. belong to the evening before
    function logDay(t) { const d = t.slice(0, 10); return hourOf(t) < MORNING_FROM ? addDays(d, -1) : d; }
    function partOfDay(t) { const h = hourOf(t); return h >= MORNING_FROM && h < EVENING_FROM ? 'morning' : 'evening'; }

    // ---- averages in whole mmHg, rounded half up, with exact integer maths
    function avg(sum, n) { return n ? Math.floor((2 * sum + n) / (2 * n)) : null; }
    function average(list) {
        if (!list.length) return null;
        let s = 0, d = 0, p = 0, pn = 0;
        list.forEach(r => { s += r.sys; d += r.dia; if (r.pulse != null) { p += r.pulse; pn++; } });
        return { sys: avg(s, list.length), dia: avg(d, list.length), pulse: pn ? avg(p, pn) : null, n: list.length };
    }

    // period: { from: 'YYYY-MM-DD' | null, to: 'YYYY-MM-DD' | null }; skipFirst leaves out the first day that has readings
    function inPeriod(readings, from, to) { return readings.filter(r => { const d = logDay(r.t); return (!from || d >= from) && (!to || d <= to); }); }
    function sortReadings(list) { return list.slice().sort((a, b) => a.t < b.t ? -1 : a.t > b.t ? 1 : (a.id < b.id ? -1 : 1)); }
    function summary(readings, opt) {
        const o = opt || {}, guide = o.guide === 'aha' ? 'aha' : 'nice';
        let list = sortReadings(inPeriod(readings, o.from, o.to));
        const days0 = [...new Set(list.map(r => logDay(r.t)))];
        let skipped = null;
        if (o.skipFirst && days0.length > 1) { skipped = { day: days0[0], n: list.filter(r => logDay(r.t) === days0[0]).length }; list = list.filter(r => logDay(r.t) !== days0[0]); }
        const days = [...new Set(list.map(r => logDay(r.t)))];
        const all = average(list);
        if (!all) return { n: 0, skipped, days: 0, guide };
        const am = average(list.filter(r => partOfDay(r.t) === 'morning')), pm = average(list.filter(r => partOfDay(r.t) === 'evening'));
        const byHigh = list.slice().sort((a, b) => b.sys - a.sys || b.dia - a.dia || (a.t < b.t ? -1 : 1));
        const byLow = list.slice().sort((a, b) => a.sys - b.sys || a.dia - b.dia || (a.t < b.t ? -1 : 1));
        const counts = {};
        list.forEach(r => { const k = level(r.sys, r.dia, guide); counts[k] = (counts[k] || 0) + 1; });
        const res = { n: list.length, days: days.length, first: days[0], last: days[days.length - 1], avg: all, morning: am, evening: pm,
            highest: byHigh[0], lowest: byLow[0], counts, level: level(all.sys, all.dia, guide), guide, skipped,
            severe: list.filter(r => level(r.sys, r.dia, guide) === 'severe') };
        if (o.target) res.target = targetCheck(all, o.target);
        return res;
    }
    // a doctor's target means "under" both numbers, e.g. under 140/90
    function targetCheck(a, target) {
        const sysOk = a.sys < target.sys, diaOk = a.dia < target.dia;
        return { met: sysOk && diaOk, sysOk, diaOk };
    }

    // ---- what to say about one reading
    function advice(key) {
        if (key === 'severe') return 'If you also have chest pain, shortness of breath, back pain, weakness or numbness, a change in vision or trouble speaking, call emergency services now. If not, sit quietly for 5 minutes and measure again; if it is still this high, contact your doctor today.';
        if (key === 'low') return 'Low readings are usually fine. Tell your doctor if you feel dizzy or faint.';
        return '';
    }

    // ---- saved data: check every value, drop anything that does not make sense
    function cleanText(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max); }
    function cleanReading(r) {
        if (!r || typeof r !== 'object' || !validStamp(r.t)) return null;
        const ok = (v, k) => Number.isInteger(v) && v >= LIMITS[k][0] && v <= LIMITS[k][1];
        if (!ok(r.sys, 'sys') || !ok(r.dia, 'dia') || r.sys <= r.dia) return null;
        return { id: cleanText(r.id, 40) || newId(), t: r.t, sys: r.sys, dia: r.dia, pulse: ok(r.pulse, 'pulse') ? r.pulse : null,
            arm: r.arm === 'L' || r.arm === 'R' ? r.arm : '', note: cleanText(r.note, NOTE_MAX) };
    }
    function cleanTarget(t) {
        if (!t || typeof t !== 'object') return null;
        const ok = (v, k) => Number.isInteger(v) && v >= LIMITS[k][0] && v <= LIMITS[k][1];
        return ok(t.sys, 'sys') && ok(t.dia, 'dia') && t.sys > t.dia ? { sys: t.sys, dia: t.dia } : null;
    }
    function newPerson(name, guide) { return { id: newId(), name: cleanText(name, NAME_MAX), guide: guide === 'aha' ? 'aha' : 'nice', target: null, readings: [] }; }
    function clean(data, defaultGuide) {
        const out = { people: [], current: '', period: '7', from: '', to: '', skipFirst: false };
        if (!data || typeof data !== 'object' || !Array.isArray(data.people)) return null;
        const seen = new Set();
        data.people.slice(0, MAX_PEOPLE).forEach(p => {
            if (!p || typeof p !== 'object') return;
            const q = newPerson(p.name, p.guide === 'aha' || p.guide === 'nice' ? p.guide : defaultGuide);
            if (typeof p.id === 'string' && p.id && !seen.has(p.id)) q.id = cleanText(p.id, 40);
            seen.add(q.id);
            q.target = cleanTarget(p.target);
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
        out.skipFirst = data.skipFirst === true;
        return out;
    }
    let idn = 0;
    function newId() { return Date.now().toString(36) + (idn++).toString(36) + Math.random().toString(36).slice(2, 6); }

    // ---- spreadsheet: a leading = + - @ would run as a formula in Excel, so it gets a ' in front
    function csvCell(v) { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    function csv(readings, guide) {
        const rows = [['Date', 'Time', 'Systolic (top)', 'Diastolic (bottom)', 'Pulse', 'Arm', 'Morning or evening', 'Range', 'Note']];
        sortReadings(readings).forEach(r => rows.push([r.t.slice(0, 10), r.t.slice(11), r.sys, r.dia, r.pulse == null ? '' : r.pulse,
            r.arm === 'L' ? 'Left' : r.arm === 'R' ? 'Right' : '', partOfDay(r.t) === 'morning' ? 'Morning' : 'Evening', levelName(level(r.sys, r.dia, guide), guide), r.note]));
        return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    const api = { LIMITS, MAX_PEOPLE, NOTE_MAX, NAME_MAX, GUIDES, LEVELS, level, levelName, levelRange, levelText, splitPasted, parseNum, checkReading,
        stamp, validStamp, addDays, daysBetween, logDay, partOfDay, average, inPeriod, sortReadings, summary, targetCheck, advice,
        cleanReading, cleanTarget, newPerson, clean, newId, csv, csvCell };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BPCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
