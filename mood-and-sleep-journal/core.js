// Logic for Mood and Sleep Journal, kept apart from the page so it can be tested (tests.js).
// One entry per calendar day ("2026-10-18"): mood 1-5, minutes slept the night before (or none), tags and a note.
// Averages use whole-number maths: mood to one decimal, sleep to the minute, 0.5 rounds up.
(function (root) {
    const MOODS = { 1: 'Very low', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Very good' };
    const MAX_TAGS = 24, TAG_MAX = 24, NOTE_MAX = 1000, HELP_MAX = 200, MAX_DAYS = 20000;
    const DEFAULT_TAGS = ['Exercise', 'Time outside', 'Work or study stress', 'Caffeine after 2 pm', 'Alcohol', 'Saw friends or family', 'Period', 'Poor sleep or nightmares'];
    const FEW = 3;   // with fewer days than this on either side, a difference may just be chance

    const pad = n => String(n).padStart(2, '0');
    function dayOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function validDay(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
        if (!m) return false;
        const y = +m[1], mo = +m[2], d = +m[3];
        return y >= 1990 && y <= 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
    }
    function addDays(date, n) { const [y, m, d] = date.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
    function daysBetween(a, b) { const f = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((f(b) - f(a)) / 864e5); }

    // ---- sleep typed as "7.5", "7,5", "7:30", "7h30", "7 h 30 min", "45 min", "8"
    function parseSleep(text) {
        const s = String(text == null ? '' : text).trim().toLowerCase().replace(/\s+/g, ' ');
        if (!s) return { minutes: null };
        let h = null, m = 0, x;
        if ((x = /^(\d{1,2})(?:[.,](\d{1,2}))?\s*(?:h|hr|hrs|hour|hours)?$/.exec(s))) { h = +x[1]; if (x[2]) m = Math.round(Number('0.' + x[2]) * 60); }
        else if ((x = /^(\d{1,2}):(\d{2})$/.exec(s))) { h = +x[1]; m = +x[2]; if (m > 59) return { error: 'Minutes go up to 59, for example 7:30.' }; }
        else if ((x = /^(\d{1,2})\s*(?:h|hr|hrs|hours?)\s*(\d{1,2})\s*(?:m|min|mins|minutes?)?$/.exec(s))) { h = +x[1]; m = +x[2]; if (m > 59) return { error: 'Minutes go up to 59, for example 7 h 30.' }; }
        else if ((x = /^(\d{1,3})\s*(?:m|min|mins|minutes?)$/.exec(s))) { h = 0; m = +x[1]; }
        else return { error: 'Type the hours slept, for example 7.5 or 7:30.' };
        const total = h * 60 + m;
        if (total > 24 * 60) return { error: 'That is more than 24 hours. Type the hours slept, for example 7.5.' };
        return { minutes: total };
    }
    // bedtime and wake-up time "HH:MM"; a wake-up time earlier than bedtime is the next morning
    function sleepFromTimes(bed, wake) {
        const ok = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
        if (!ok(bed) || !ok(wake)) return { error: 'Choose both times.' };
        const mins = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
        const d = (mins(wake) - mins(bed) + 1440) % 1440;
        if (d === 0) return { error: 'Bedtime and wake-up time are the same.' };
        return { minutes: d };
    }
    function fmtSleep(min) { if (min == null) return ''; const h = Math.floor(min / 60), m = min % 60; return h + ' h' + (m ? ' ' + m + ' min' : ''); }

    // ---- averages
    function avgMood(list) { if (!list.length) return null; const s = list.reduce((a, e) => a + e.m, 0), n = list.length; return Math.floor((20 * s + n) / (2 * n)) / 10; }
    function avgSleep(list) { const l = list.filter(e => e.s != null); if (!l.length) return null; const s = l.reduce((a, e) => a + e.s, 0), n = l.length; return Math.floor((2 * s + n) / (2 * n)); }
    function moodWord(avg) { return MOODS[Math.min(5, Math.max(1, Math.floor(avg + 0.5)))]; }

    // entries: { 'YYYY-MM-DD': {m, s, tags, note} }; from/to inclusive (null = open)
    function inPeriod(entries, from, to) {
        return Object.keys(entries).filter(d => (!from || d >= from) && (!to || d <= to)).sort().map(d => Object.assign({ day: d }, entries[d]));
    }
    function summary(entries, opt) {
        const o = opt || {}, list = inPeriod(entries, o.from, o.to), tags = o.tags || [];
        const from = o.from || (list.length ? list[0].day : null), to = o.to || (list.length ? list[list.length - 1].day : null);
        const span = from && to ? daysBetween(from, to) + 1 : 0;
        if (!list.length) return { n: 0, span };
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        list.forEach(e => { counts[e.m]++; });
        // mood with and without each tag, only for tags used at least once in these days
        const byTag = tags.map(t => {
            const w = list.filter(e => e.tags.includes(t.id)), wo = list.filter(e => !e.tags.includes(t.id));
            if (!w.length) return null;
            const a = avgMood(w), b = avgMood(wo);
            return { id: t.id, name: t.name, withN: w.length, withoutN: wo.length, withAvg: a, withoutAvg: b,
                diff: b == null ? null : Math.round((a - b) * 10) / 10, few: w.length < FEW || wo.length < FEW };
        }).filter(Boolean).sort((x, y) => (y.diff == null ? -99 : Math.abs(y.diff)) - (x.diff == null ? -99 : Math.abs(x.diff)) || y.withN - x.withN);
        // mood after short, middling and long nights
        const sl = list.filter(e => e.s != null);
        const band = (lo, hi) => { const l = sl.filter(e => e.s >= lo && e.s < hi); return { n: l.length, avg: avgMood(l) }; };
        const sleepBands = { short: band(0, 360), mid: band(360, 420), long: band(420, 24 * 60 + 1) };
        const sorted = list.slice().sort((a, b) => a.m - b.m || (a.day < b.day ? -1 : 1));
        return { n: list.length, span, from, to, avg: avgMood(list), sleep: avgSleep(list), sleepN: sl.length, counts, byTag, sleepBands,
            lowDays: list.filter(e => e.m <= 2).length, worst: sorted[0], best: sorted[sorted.length - 1] };
    }

    // ---- saved data: check every value, drop anything that does not make sense
    function cleanText(s, max, keepLines) { let t = String(s == null ? '' : s).replace(keepLines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' '); return t.trim().slice(0, max); }
    let idn = 0;
    function newId() { return Date.now().toString(36) + (idn++).toString(36) + Math.random().toString(36).slice(2, 6); }
    function defaultTags() { return DEFAULT_TAGS.map((name, i) => ({ id: 't' + i, name })); }
    function cleanEntry(e, tagIds) {
        if (!e || typeof e !== 'object' || ![1, 2, 3, 4, 5].includes(e.m)) return null;
        const s = Number.isInteger(e.s) && e.s >= 0 && e.s <= 1440 ? e.s : null;
        const tags = [...new Set(Array.isArray(e.tags) ? e.tags.filter(t => typeof t === 'string' && tagIds.has(t)) : [])];
        return { m: e.m, s, tags, note: cleanText(e.note, NOTE_MAX, true) };
    }
    function clean(data) {
        if (!data || typeof data !== 'object' || !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries)) return null;
        const out = { entries: {}, tags: [], helpline: cleanText(data.helpline, HELP_MAX), period: '30', month: '' };
        const seen = new Set(), names = new Set();
        (Array.isArray(data.tags) ? data.tags : defaultTags()).slice(0, MAX_TAGS).forEach(t => {
            if (!t || typeof t !== 'object') return;
            const id = cleanText(t.id, 40), name = cleanText(t.name, TAG_MAX);
            if (!id || !name || seen.has(id) || names.has(name.toLowerCase())) return;
            seen.add(id); names.add(name.toLowerCase()); out.tags.push({ id, name });
        });
        let n = 0;
        Object.keys(data.entries).sort().forEach(d => {
            if (n >= MAX_DAYS || !validDay(d)) return;
            const e = cleanEntry(data.entries[d], seen);
            if (e) { out.entries[d] = e; n++; }
        });
        if (['7', '30', '90', 'all'].includes(String(data.period))) out.period = String(data.period);
        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month || '')) out.month = data.month;
        return out;
    }
    // a new tag name: trimmed, not blank, not a repeat (ignoring case)
    function checkTag(name, tags) {
        const n = cleanText(name, 200);
        if (!n) return { error: 'Type a name for the tag, for example "Meditated".' };
        if (n.length > TAG_MAX) return { error: 'Keep it to ' + TAG_MAX + ' letters or fewer.' };
        if (tags.some(t => t.name.toLowerCase() === n.toLowerCase())) return { error: '"' + n + '" is already in the list.' };
        if (tags.length >= MAX_TAGS) return { error: 'You can keep up to ' + MAX_TAGS + ' tags. Remove one first.' };
        return { name: n };
    }

    // ---- spreadsheet: a leading = + - @ would run as a formula in Excel, so it gets a ' in front
    function csvCell(v) { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
    function csv(entries, tags) {
        const name = id => (tags.find(t => t.id === id) || {}).name || '';
        const rows = [['Date', 'Mood (1-5)', 'Mood', 'Hours slept', 'Tags', 'Note']];
        inPeriod(entries).forEach(e => rows.push([e.day, e.m, MOODS[e.m], e.s == null ? '' : (Math.round(e.s / 6) / 10).toFixed(1), e.tags.map(name).filter(Boolean).join('; '), e.note]));
        return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    const api = { MOODS, MAX_TAGS, TAG_MAX, NOTE_MAX, HELP_MAX, FEW, dayOf, validDay, addDays, daysBetween, parseSleep, sleepFromTimes, fmtSleep,
        avgMood, avgSleep, moodWord, inPeriod, summary, defaultTags, cleanEntry, clean, checkTag, newId, csv, csvCell, cleanText };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MoodCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
