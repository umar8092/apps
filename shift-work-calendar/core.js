// Logic for Shift Work Calendar, kept apart from the page so it can be tested (tests.js).
// Dates are whole calendar days ("day numbers" since 1 Jan 1970), never clock times, so time zones and
// summer-time changes can never move a shift to the wrong date. Shift times are minutes after midnight.
(function (root) {
    const MAX_PEOPLE = 4, MAX_DAYS = 98, MAX_TYPES = 10, MAX_CHANGES = 5000;
    const OFF = 'off', HOL = 'hol', SICK = 'sick';
    // shifts that are not work: they always exist and cannot be edited
    const REST = {
        off: { id: OFF, name: 'Off', short: 'Off', color: '' },
        hol: { id: HOL, name: 'Holiday or leave', short: 'Hol', color: '#16a34a' },
        sick: { id: SICK, name: 'Sick', short: 'Sick', color: '#64748b' }
    };
    // ready-made shift types a pattern can use (each person keeps their own copy, so their own times)
    const BUILT_IN = {
        D: { id: 'D', name: 'Day', start: '07:00', end: '19:00', color: '#f59e0b' },
        N: { id: 'N', name: 'Night', start: '19:00', end: '07:00', color: '#6366f1' },
        E: { id: 'E', name: 'Early', start: '06:00', end: '14:00', color: '#0ea5e9' },
        L: { id: 'L', name: 'Late', start: '14:00', end: '22:00', color: '#f97316' },
        T: { id: 'T', name: '24-hour', start: '07:00', end: '07:00', color: '#e11d48' }
    };
    const EXTRA_COLORS = ['#14b8a6', '#db2777', '#84cc16', '#a16207', '#8b5cf6', '#0891b2', '#dc2626', '#4d7c0f', '#c026d3', '#475569'];
    const rep = (id, n) => Array(n).fill(id);
    const PRESETS = [
        { id: '4on4off', name: '4 on, 4 off (12-hour days)', seq: [...rep('D', 4), ...rep(OFF, 4)] },
        { id: '4n4off', name: '4 on, 4 off (12-hour nights)', seq: [...rep('N', 4), ...rep(OFF, 4)] },
        { id: '2d2n4off', name: '2 days, 2 nights, 4 off', seq: ['D', 'D', 'N', 'N', ...rep(OFF, 4)] },
        { id: '3d3n6off', name: '3 days, 3 nights, 6 off', seq: [...rep('D', 3), ...rep('N', 3), ...rep(OFF, 6)] },
        { id: '3on3off', name: '3 on, 3 off', seq: [...rep('D', 3), ...rep(OFF, 3)] },
        { id: '2on2off', name: '2 on, 2 off', seq: ['D', 'D', OFF, OFF] },
        { id: 'pitman', name: 'Pitman 2-2-3 (days only, 14 days)', seq: ['D', 'D', OFF, OFF, 'D', 'D', 'D', OFF, OFF, 'D', 'D', OFF, OFF, OFF] },
        { id: 'pitman-dn', name: 'Pitman 2-2-3 (2 weeks days, 2 weeks nights)', seq: ['D', 'D', OFF, OFF, 'D', 'D', 'D', OFF, OFF, 'D', 'D', OFF, OFF, OFF, 'N', 'N', OFF, OFF, 'N', 'N', 'N', OFF, OFF, 'N', 'N', OFF, OFF, OFF] },
        { id: 'dupont', name: 'DuPont (4 weeks, days and nights)', seq: [...rep('N', 4), ...rep(OFF, 3), ...rep('D', 3), OFF, ...rep('N', 3), ...rep(OFF, 3), ...rep('D', 4), ...rep(OFF, 7)] },
        { id: 'eln', name: 'Earlies, lates, nights (2-2-2, 4 off)', seq: ['E', 'E', 'L', 'L', 'N', 'N', ...rep(OFF, 4)] },
        { id: '24-48', name: '24 on, 48 off', seq: ['T', OFF, OFF] },
        { id: '24-72', name: '24 on, 72 off', seq: ['T', OFF, OFF, OFF] },
        { id: 'mon-fri', name: 'Monday to Friday (5 on, 2 off)', seq: [...rep('D', 5), OFF, OFF], monday: true }
    ];

    // ---- calendar days
    const DAY_MS = 86400000;
    function dayNum(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
        if (!m) return NaN;
        const y = +m[1], mo = +m[2], d = +m[3];
        const t = Date.UTC(y, mo - 1, d), back = new Date(t);
        if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return NaN;   // 31 Feb etc.
        return Math.round(t / DAY_MS);
    }
    const pad = n => String(n).padStart(2, '0');
    function isoOf(n) { const d = new Date(n * DAY_MS); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    function todayNum(now) { const d = now || new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS); }   // the phone's own date
    const weekday = n => ((n % 7) + 7 + 4) % 7;   // 0 = Sunday (1 Jan 1970 was a Thursday)
    const mod = (a, b) => ((a % b) + b) % b;
    const MIN_DAY = dayNum('1900-01-01'), MAX_DAY = dayNum('2200-12-31');
    function monthDays(y, m) { const first = Math.round(Date.UTC(y, m - 1, 1) / DAY_MS); return { first, count: Math.round(Date.UTC(y, m, 1) / DAY_MS) - first }; }

    // ---- times "HH:MM" -> minutes; '' means no time set
    function mins(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); if (!m || +m[1] > 23 || +m[2] > 59) return null; return +m[1] * 60 + +m[2]; }
    function lengthMins(type) {   // how long a shift is; same start and end means 24 hours
        const s = mins(type && type.start), e = mins(type && type.end);
        if (s == null || e == null) return 0;
        const d = mod(e - s, 1440); return d === 0 ? 1440 : d;
    }
    const crossesMidnight = type => { const s = mins(type.start), e = mins(type.end); return s != null && e != null && e <= s; };

    // ---- people and their patterns
    function newPerson(name, presetId, start) {
        const p = { id: 'p' + Math.random().toString(36).slice(2, 9), name: name || 'Me', seq: [], start: start, types: [], changes: {} };
        if (presetId) applyPreset(p, presetId);
        return p;
    }
    function presetFor(seq) { const s = seq.join(','); const p = PRESETS.find(x => x.seq.join(',') === s); return p ? p.id : ''; }
    function applyPreset(person, presetId, today) {
        const pr = PRESETS.find(p => p.id === presetId); if (!pr) return false;
        person.seq = pr.seq.slice();
        pr.seq.forEach(id => ensureType(person, id));
        if (pr.monday && today != null) person.start = isoOf(today - mod(weekday(today) - 1, 7));   // this week's Monday
        return true;
    }
    function ensureType(person, id) {
        if (REST[id] || person.types.some(t => t.id === id)) return;
        if (BUILT_IN[id]) person.types.push(Object.assign({}, BUILT_IN[id]));
    }
    function addType(person, id, name) {   // id: a built-in letter, or '' for a named one
        if (person.types.length >= MAX_TYPES) return { error: 'You can have up to ' + MAX_TYPES + ' shift types.' };
        if (id && BUILT_IN[id]) { if (person.types.some(t => t.id === id)) return { error: 'You already have ' + BUILT_IN[id].name + '.' }; ensureType(person, id); return { type: person.types[person.types.length - 1] }; }
        let n = 1; while (person.types.some(t => t.id === 'c' + n)) n++;
        const used = person.types.map(t => t.color);
        const t = { id: 'c' + n, name: cleanName(name, 'Shift ' + (person.types.length + 1), 20), start: '', end: '', color: EXTRA_COLORS.find(c => !used.includes(c)) || EXTRA_COLORS[n % EXTRA_COLORS.length] };
        person.types.push(t); return { type: t };
    }
    function removeType(person, id) {
        if (person.seq.includes(id)) return { error: 'This shift is in your pattern. Remove it from the pattern first.' };
        person.types = person.types.filter(t => t.id !== id);
        Object.keys(person.changes).forEach(k => { if (person.changes[k] === id) delete person.changes[k]; });
        return { ok: true };
    }
    function cleanName(s, fallback, max) { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 30); return t || fallback; }
    function typeOf(person, id) { return REST[id] || person.types.find(t => t.id === id) || REST.off; }
    function isWork(id) { return !REST[id]; }
    // the short label shown in a calendar square: letter for built-ins, first letters of the name otherwise
    function shortOf(person, id) {
        if (REST[id]) return REST[id].short;
        const t = typeOf(person, id);
        if (BUILT_IN[id]) return id === 'T' ? '24' : id;
        const words = t.name.split(' ').filter(Boolean);
        const first = (words[0] || '?')[0].toUpperCase();
        const base = o => BUILT_IN[o.id] ? (o.id === 'T' ? '24' : o.id) : (o.name.trim()[0] || '?').toUpperCase();
        const clash = person.types.some(o => o !== t && base(o) === first);
        return clash ? (words.length > 1 ? first + words[1][0].toUpperCase() : t.name.slice(0, 2)) : first;
    }

    // which shift a person is on, and why
    function shiftOn(person, n) {
        const changed = person.changes[isoOf(n)];
        const len = person.seq.length, start = dayNum(person.start);
        const planned = len && !isNaN(start) ? person.seq[mod(n - start, len)] : OFF;
        return { id: changed && (REST[changed] || person.types.some(t => t.id === changed)) ? changed : planned, planned, changed: !!changed && changed !== planned, dayOfPattern: len && !isNaN(start) ? mod(n - start, len) + 1 : 0 };
    }
    function setChange(person, n, id) {
        const k = isoOf(n), planned = shiftOn(person, n).planned;
        if (id == null || id === '' || id === planned) delete person.changes[k]; else person.changes[k] = id;
    }
    function nextOff(person, from) {        // first day off strictly after a work day today, or today when off
        for (let n = from; n < from + 3660; n++) if (!isWork(shiftOn(person, n).id)) {
            let run = 0; while (run < 3660 && !isWork(shiftOn(person, n + run).id)) run++;
            return { day: n, run };
        }
        return null;
    }
    function nextWork(person, from) { for (let n = from; n < from + 3660; n++) if (isWork(shiftOn(person, n).id)) return n; return null; }
    function allOff(people, from, count, horizon) {
        const out = []; if (people.length < 2) return out;
        for (let n = from; n < from + (horizon || 732) && out.length < count; n++) if (people.every(p => !isWork(shiftOn(p, n).id))) out.push(n);
        return out;
    }
    // what is happening right now, at minute `now` of day `today`: last night's shift may still be running
    function atWorkNow(person, today, nowMin) {
        const y = shiftOn(person, today - 1), yt = typeOf(person, y.id);
        if (isWork(y.id) && (crossesMidnight(yt) || lengthMins(yt) === 1440)) { const e = mins(yt.end); if (e != null && nowMin < e) return { id: y.id, until: yt.end, fromYesterday: true }; }
        const t = shiftOn(person, today), tt = typeOf(person, t.id);
        if (isWork(t.id)) { const s = mins(tt.start), e = mins(tt.end); if (s != null && e != null && nowMin >= s && (crossesMidnight(tt) || lengthMins(tt) === 1440 || nowMin < e)) return { id: t.id, until: tt.end, fromYesterday: false }; }
        return null;
    }
    function monthStats(person, y, m) {
        const { first, count } = monthDays(y, m), by = {};
        let shifts = 0, minutes = 0, off = 0, hol = 0, sick = 0, noTime = 0, changed = 0;
        for (let n = first; n < first + count; n++) {
            const s = shiftOn(person, n); if (s.changed) changed++;
            if (s.id === OFF) off++; else if (s.id === HOL) hol++; else if (s.id === SICK) sick++;
            else { shifts++; by[s.id] = (by[s.id] || 0) + 1; const l = lengthMins(typeOf(person, s.id)); minutes += l; if (!l) noTime++; }
        }
        return { shifts, minutes, off, hol, sick, by, noTime, changed, days: count };
    }
    function fmtHours(minutes) { const h = Math.floor(minutes / 60), m = minutes % 60; return m ? h + ' h ' + m + ' min' : h + ' h'; }

    // ---- calendar file (.ics): times are "floating" (no time zone) so 07:00 stays 07:00 wherever the phone is
    function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
    function fold(line) { let out = '', s = line; while (s.length > 74) { out += s.slice(0, 74) + '\r\n '; s = s.slice(74); } return out + s; }
    function ics(person, from, to, withName, stamp) {
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Shift Work Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
        const compact = n => isoOf(n).replace(/-/g, '');
        let events = 0;
        for (let n = from; n <= to; n++) {
            const s = shiftOn(person, n); if (!isWork(s.id)) continue;
            const t = typeOf(person, s.id), a = mins(t.start), len = lengthMins(t);
            L.push('BEGIN:VEVENT', 'UID:shift-work-calendar-' + person.id + '-' + compact(n) + '@umar8092.github.io', 'DTSTAMP:' + stamp);
            if (a != null && len) {
                const endAbs = a + len, endDay = n + Math.floor(endAbs / 1440), e = endAbs % 1440;
                L.push('DTSTART:' + compact(n) + 'T' + pad(Math.floor(a / 60)) + pad(a % 60) + '00', 'DTEND:' + compact(endDay) + 'T' + pad(Math.floor(e / 60)) + pad(e % 60) + '00');
            } else L.push('DTSTART;VALUE=DATE:' + compact(n), 'DTEND;VALUE=DATE:' + compact(n + 1));
            L.push(fold('SUMMARY:' + icsEscape((withName ? person.name + ': ' : '') + t.name + ' shift')), 'TRANSP:OPAQUE', 'END:VEVENT');
            events++;
        }
        L.push('END:VCALENDAR');
        return { text: L.join('\r\n') + '\r\n', events };
    }

    // ---- saved data: anything odd is dropped or fixed, never trusted
    const COLOR = /^#[0-9a-f]{6}$/i, TIME = /^(\d{2}:\d{2})?$/;
    function cleanPerson(p, i) {
        if (!p || typeof p !== 'object') return null;
        const types = [];
        (Array.isArray(p.types) ? p.types : []).slice(0, MAX_TYPES).forEach(t => {
            if (!t || typeof t.id !== 'string' || !/^([DNELT]|c\d{1,3})$/.test(t.id) || types.some(x => x.id === t.id)) return;
            types.push({ id: t.id, name: cleanName(t.name, BUILT_IN[t.id] ? BUILT_IN[t.id].name : 'Shift', 20),
                start: typeof t.start === 'string' && TIME.test(t.start) && (t.start === '' || mins(t.start) != null) ? t.start : '',
                end: typeof t.end === 'string' && TIME.test(t.end) && (t.end === '' || mins(t.end) != null) ? t.end : '',
                color: COLOR.test(t.color) ? t.color : EXTRA_COLORS[types.length % EXTRA_COLORS.length] });
        });
        const ok = id => !!REST[id] || types.some(t => t.id === id);
        const seq = (Array.isArray(p.seq) ? p.seq : []).slice(0, MAX_DAYS).filter(id => typeof id === 'string' && ok(id) && id !== HOL && id !== SICK);
        const start = !isNaN(dayNum(p.start)) && dayNum(p.start) >= MIN_DAY && dayNum(p.start) <= MAX_DAY ? p.start : null;
        if (!start) return null;
        const changes = {};
        if (p.changes && typeof p.changes === 'object') Object.keys(p.changes).slice(0, MAX_CHANGES).forEach(k => { if (!isNaN(dayNum(k)) && typeof p.changes[k] === 'string' && ok(p.changes[k])) changes[k] = p.changes[k]; });
        return { id: typeof p.id === 'string' && /^[a-z0-9]{1,12}$/i.test(p.id) ? p.id : 'p' + i + Math.random().toString(36).slice(2, 7), name: cleanName(p.name, i ? 'Person ' + (i + 1) : 'Me', 30), seq, start, types, changes };
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.people)) return null;
        const people = s.people.slice(0, MAX_PEOPLE).map(cleanPerson).filter(Boolean);
        if (!people.length) return null;
        const ids = new Set(); people.forEach((p, i) => { if (ids.has(p.id)) p.id = p.id + i; ids.add(p.id); });
        return { v: 1, people, active: Number.isInteger(s.active) && s.active >= 0 && s.active < people.length ? s.active : 0, weekStart: s.weekStart === 0 ? 0 : 1, set: !!s.set };
    }

    const api = { MAX_PEOPLE, MAX_DAYS, MAX_TYPES, OFF, HOL, SICK, REST, BUILT_IN, PRESETS, dayNum, isoOf, todayNum, weekday, mod, monthDays, MIN_DAY, MAX_DAY,
        mins, lengthMins, crossesMidnight, newPerson, presetFor, applyPreset, addType, removeType, cleanName, typeOf, isWork, shortOf, shiftOn, setChange,
        nextOff, nextWork, allOff, atWorkNow, monthStats, fmtHours, ics, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ShiftCore = api;
})(this);
