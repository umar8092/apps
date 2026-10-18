// Class Timetable for Students and Teachers: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings and times are minutes after midnight on the person's own clock (no time zones involved).
(function (root) {
    'use strict';
    const MAX_SUBJECTS = 80, MAX_TIMES = 30, MAX_HOLIDAYS = 60, LOOK_AHEAD = 120;
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const COLORS = ['#e03131', '#f08c00', '#2f9e44', '#1c7ed6', '#7048e8', '#d6336c', '#0c8599', '#8d5524', '#5c940d', '#495057'];

    // ---- dates
    const pad = n => String(n).padStart(2, '0');
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    function parseDate(v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 1950 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
        return { y, m: mo, d };
    }
    const isDate = v => !!parseDate(v);
    const dayNum = iso => { const p = parseDate(iso); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 864e5); };
    const fromNum = n => { const d = new Date(n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
    const addDays = (iso, n) => fromNum(dayNum(iso) + n);
    const diff = (a, b) => dayNum(b) - dayNum(a);
    const todayIso = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const nowMin = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
    const weekday = iso => (dayNum(iso) + 4) % 7;     // 1970-01-01 was a Thursday; 0 = Sunday
    // "Mon 19 Oct" this year, "Mon 4 Jan 2027" another year
    function shortDate(iso, today) {
        const p = parseDate(iso); if (!p) return '';
        return DAYS[weekday(iso)] + ' ' + p.d + ' ' + MONTHS[p.m - 1] + (today && iso.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + p.y);
    }
    function relDay(iso, today) {
        const d = diff(today, iso);
        return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d === -1 ? 'yesterday' : '';
    }
    // The first day of the week that holds iso. weekStart: 1 Monday, 0 Sunday, 6 Saturday.
    const weekOf = (iso, weekStart) => addDays(iso, -((weekday(iso) - weekStart + 7) % 7));

    // ---- times
    function parseTime(v) {
        const m = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*$/.exec(String(v == null ? '' : v));
        if (!m) return null;
        const h = +m[1], mi = +m[2];
        if (h > 23 || mi > 59) return null;
        return h * 60 + mi;
    }
    const hm = min => pad(Math.floor(min / 60)) + ':' + pad(min % 60);
    // '14:05' or '2:05 pm'. The end of the day (24:00) is shown as midnight.
    function fmtTime(min, twelve) {
        if (min >= 1440) return twelve ? '12:00 midnight' : '24:00';
        const h = Math.floor(min / 60), m = min % 60;
        if (!twelve) return pad(h) + ':' + pad(m);
        return ((h % 12) || 12) + ':' + pad(m) + (h < 12 ? ' am' : ' pm');
    }
    // 25 -> '25 min', 60 -> '1 h', 65 -> '1 h 5 min'
    function fmtDur(min) {
        const h = Math.floor(min / 60), m = min % 60;
        return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min';
    }

    // ---- week A / week B
    // ab.weekA is the first day of any week that is Week A; weeks then alternate.
    function weekLetter(iso, st) {
        if (!st.ab || !isDate(st.weekA)) return '';
        const n = Math.round(diff(weekOf(st.weekA, st.weekStart), weekOf(iso, st.weekStart)) / 7);
        return ((n % 2) + 2) % 2 === 0 ? 'A' : 'B';
    }
    // Make the week that holds iso the given letter.
    const setWeekLetter = (st, iso, letter) => { st.weekA = letter === 'A' ? weekOf(iso, st.weekStart) : addDays(weekOf(iso, st.weekStart), -7); };
    const timeRuns = (t, letter) => !letter || t.week === 'every' || t.week === letter;

    // ---- one day
    function holidayOn(iso, st) {
        return st.holidays.filter(h => h.from <= iso && iso <= h.to).sort((a, b) => a.to < b.to ? 1 : -1)[0] || null;
    }
    // Every lesson on a date, earliest first: [{ subject, time, s, e }]
    function lessonsOn(iso, st, ignoreHoliday) {
        const holiday = ignoreHoliday ? null : holidayOn(iso, st), letter = weekLetter(iso, st), wd = weekday(iso), items = [];
        if (!holiday) st.subjects.forEach(subject => subject.times.forEach(time => {
            if (time.day === wd && timeRuns(time, letter)) items.push({ subject, time, s: time.s, e: time.e });
        }));
        items.sort((a, b) => a.s - b.s || a.e - b.e || a.subject.name.localeCompare(b.subject.name));
        return { iso, holiday, letter, items };
    }
    const hasLessons = st => st.subjects.some(s => s.times.length);
    // The next day after iso that has lessons (holidays skipped), or null within LOOK_AHEAD days.
    function nextSchoolDay(iso, st) {
        if (!hasLessons(st)) return null;
        for (let i = 1; i <= LOOK_AHEAD; i++) {
            const day = lessonsOn(addDays(iso, i), st);
            if (day.items.length) return day;
        }
        return null;
    }
    // Free gaps between lessons on a day: [{ s, e }] (only gaps of 1 minute or more)
    function gaps(items) {
        const out = []; let end = null;
        items.forEach(it => {
            if (end !== null && it.s > end) out.push({ s: end, e: it.s });
            end = end === null ? it.e : Math.max(end, it.e);
        });
        return out;
    }

    // ---- right now
    // kind: empty | holiday | now | before | free | done | none
    function status(iso, min, st) {
        if (!hasLessons(st)) return { kind: 'empty' };
        const today = lessonsOn(iso, st), items = today.items;
        const later = nextSchoolDay(iso, st);
        if (today.holiday) return { kind: 'holiday', holiday: today.holiday, later, today };
        const current = items.filter(it => it.s <= min && min < it.e);
        const next = items.find(it => it.s > min && !current.includes(it)) || null;
        if (current.length) {
            const until = Math.min.apply(null, current.map(c => c.e));
            return { kind: 'now', current, next, left: until - min, later: next ? null : later, today };
        }
        if (next) return { kind: items.some(it => it.e <= min) ? 'free' : 'before', next, wait: next.s - min, later: null, today };
        if (items.length) return { kind: 'done', later, today };
        return { kind: 'none', later, today };
    }

    // ---- clashes: two lessons at the same time on the same day (and the same week)
    function clashes(st) {
        const all = [];
        st.subjects.forEach(subject => subject.times.forEach(time => all.push({ subject, time })));
        const out = [];
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
            const a = all[i].time, b = all[j].time;
            if (a.day !== b.day || !(a.s < b.e && b.s < a.e)) continue;
            if (st.ab && a.week !== 'every' && b.week !== 'every' && a.week !== b.week) continue;
            out.push([all[i], all[j]]);
        }
        return out;
    }
    function clashesFor(subjectId, st) {
        return clashes(st).filter(p => p[0].subject.id === subjectId || p[1].subject.id === subjectId)
            .map(p => p[0].subject.id === subjectId ? { mine: p[0], other: p[1] } : { mine: p[1], other: p[0] });
    }

    // ---- the add/edit form
    // rows: [{ day, start, end, room, week }] as typed. Returns { ok, subject, errors: { name, rows: [msg] } }
    function readForm(f, st, editId) {
        const errors = { name: '', rows: [] }, name = String(f.name || '').trim().replace(/\s+/g, ' ');
        if (!name) errors.name = 'Type the subject or class name, for example Maths.';
        else if (name.length > 60) errors.name = 'Keep the name under 60 letters.';
        const rows = Array.isArray(f.rows) ? f.rows : [];
        const times = [];
        rows.forEach((r, i) => {
            const day = Number(r.day), s = parseTime(r.start), e = parseTime(r.end);
            let msg = '';
            if (!(day >= 0 && day <= 6 && Number.isInteger(day))) msg = 'Choose the day.';
            else if (s === null && e === null) msg = 'Type when it starts and ends, for example 08:30 and 09:15.';
            else if (s === null) msg = 'Type when it starts.';
            else if (e === null) msg = 'Type when it ends.';
            else if (e === s) msg = 'The end time is the same as the start time.';
            else if (e < s) msg = 'It ends before it starts. Lessons must end on the same day (check am and pm).';
            errors.rows[i] = msg;
            if (!msg) times.push({ id: r.id || '', day, s, e, room: String(r.room || '').trim().replace(/\s+/g, ' ').slice(0, 40), week: st.ab && (r.week === 'A' || r.week === 'B') ? r.week : 'every' });
        });
        if (!rows.length) errors.rows = [];
        const noTimes = !rows.length ? 'Add at least one day and time.' : '';
        const ok = !errors.name && !noTimes && errors.rows.every(m => !m);
        const duplicate = name && st.subjects.some(s => s.id !== editId && s.name.toLowerCase() === name.toLowerCase());
        return {
            ok, errors, noTimes, duplicate,
            subject: { name: name.slice(0, 60), color: COLORS.includes(f.color) ? f.color : COLORS[0], teacher: String(f.teacher || '').trim().slice(0, 60),
                bring: String(f.bring || '').trim().slice(0, 120), note: String(f.note || '').trim().slice(0, 300), times }
        };
    }
    // The colour the next new subject gets: the first one nobody uses yet.
    const nextColor = st => COLORS.find(c => !st.subjects.some(s => s.color === c)) || COLORS[st.subjects.length % COLORS.length];

    // ---- text for copy, email and print
    function itemLine(it, twelve) {
        const bits = [roomLabel(it.time.room), it.subject.teacher].filter(Boolean);
        return fmtTime(it.s, twelve) + ' - ' + fmtTime(it.e, twelve) + '  ' + it.subject.name + (bits.length ? ' (' + bits.join(', ') + ')' : '');
    }
    // "12" and "B4" read as "Room 12"; a typed "Lab 3" or "Room 5" is kept as it is.
    const roomText = r => /^(room|rm)\b/i.test(r) ? r.replace(/^(room|rm)\.?\s*/i, '') : r;
    const roomLabel = r => !r ? '' : /^[\w-]{1,6}$/.test(r) && /\d/.test(r) ? 'Room ' + r : /^(room|rm)\b/i.test(r) ? 'Room ' + roomText(r) : r;
    function bringList(items) {
        const seen = new Set(), out = [];
        items.forEach(it => { if (it.subject.bring && !seen.has(it.subject.id)) { seen.add(it.subject.id); out.push(it.subject.bring + ' (' + it.subject.name + ')'); } });
        return out;
    }
    function dayText(day, today, twelve) {
        const head = shortDate(day.iso, today) + (day.letter ? ' (Week ' + day.letter + ')' : '');
        if (day.holiday) return head + ': no lessons, ' + day.holiday.name;
        if (!day.items.length) return head + ': no lessons';
        const lines = [head].concat(day.items.map(it => '  ' + itemLine(it, twelve)));
        const bring = bringList(day.items);
        if (bring.length) lines.push('  Bring: ' + bring.join(', '));
        return lines.join('\n');
    }
    // The days of the week to show, in school-week order: every day that has a lesson, else Monday to Friday.
    function weekDays(st) {
        const order = [0, 1, 2, 3, 4, 5, 6].map(i => (st.weekStart + i) % 7);
        const used = new Set(); st.subjects.forEach(s => s.times.forEach(t => used.add(t.day)));
        const days = order.filter(d => used.has(d));
        return days.length ? days : order.filter(d => d >= 1 && d <= 5);
    }
    // All lessons on one weekday in one week letter (no dates, no holidays): for the week grid.
    function weekdayItems(wd, letter, st) {
        const items = [];
        st.subjects.forEach(subject => subject.times.forEach(time => { if (time.day === wd && timeRuns(time, letter)) items.push({ subject, time, s: time.s, e: time.e }); }));
        return items.sort((a, b) => a.s - b.s || a.e - b.e || a.subject.name.localeCompare(b.subject.name));
    }
    function weekText(st, twelve) {
        const letters = st.ab ? ['A', 'B'] : [''];
        const out = [];
        letters.forEach(letter => {
            if (letter) out.push('WEEK ' + letter);
            weekDays(st).forEach(wd => {
                const items = weekdayItems(wd, letter, st);
                out.push(DAY_NAMES[wd]);
                if (!items.length) out.push('  No lessons');
                items.forEach(it => out.push('  ' + itemLine(it, twelve)));
            });
            out.push('');
        });
        const bring = st.subjects.filter(s => s.bring).map(s => s.name + ': ' + s.bring);
        if (bring.length) out.push('What to bring', ...bring.map(b => '  ' + b), '');
        return out.join('\n').trim();
    }

    // ---- calendar file: each lesson repeats every week (or every 2 weeks for Week A or B lessons) until the last day of term
    const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    function fold(line) {
        const out = []; let rest = line;
        while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); }
        out.push(rest); return out.join('\r\n');
    }
    const icsDate = (iso, min) => iso.replace(/-/g, '') + 'T' + pad(Math.floor(min / 60)) + pad(min % 60) + '00';
    function ics(st, from, until, url) {
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Class Timetable//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Class timetable'];
        let count = 0;
        const stamp = from.replace(/-/g, '') + 'T000000Z';
        st.subjects.forEach(subject => subject.times.forEach((time, i) => {
            const step = st.ab && time.week !== 'every' ? 14 : 7;
            let first = from;
            while (weekday(first) !== time.day || !timeRuns(time, weekLetter(first, st))) first = addDays(first, 1);
            if (first > until) return;
            const dates = []; for (let d = first; d <= until; d = addDays(d, step)) dates.push(d);
            const live = dates.filter(d => !holidayOn(d, st));
            if (!live.length) return;
            const skipped = dates.filter(d => holidayOn(d, st));
            count++;
            lines.push('BEGIN:VEVENT', 'UID:lesson-' + subject.id + '-' + i + '-' + first.replace(/-/g, '') + '@umar8092.github.io', 'DTSTAMP:' + stamp,
                'DTSTART:' + icsDate(first, time.s), 'DTEND:' + icsDate(first, time.e),
                'RRULE:FREQ=WEEKLY;INTERVAL=' + step / 7 + ';UNTIL=' + until.replace(/-/g, '') + 'T235959',
                'SUMMARY:' + icsEsc(subject.name));
            if (skipped.length) lines.push('EXDATE:' + skipped.map(d => icsDate(d, time.s)).join(','));
            if (time.room) lines.push('LOCATION:' + icsEsc(roomLabel(time.room)));
            const desc = [subject.teacher, subject.bring ? 'Bring: ' + subject.bring : '', subject.note, url].filter(Boolean).join('\n');
            if (desc) lines.push('DESCRIPTION:' + icsEsc(desc));
            lines.push('END:VEVENT');
        }));
        lines.push('END:VCALENDAR');
        return { text: lines.map(fold).join('\r\n') + '\r\n', count };
    }

    // ---- saved state
    const emptyState = () => ({ v: 1, subjects: [], holidays: [], ab: false, weekA: '', weekStart: 1, clock: 'auto', termEnd: '', seq: 1 });
    const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
    // Checks every value from storage or a backup file; drops anything broken. Returns null when it is not our data.
    function validate(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.subjects)) return null;
        const st = emptyState();
        st.ab = raw.ab === true;
        st.weekStart = [0, 1, 6].includes(raw.weekStart) ? raw.weekStart : 1;
        st.weekA = isDate(raw.weekA) ? raw.weekA : '';
        st.clock = ['auto', '24', '12'].includes(raw.clock) ? raw.clock : 'auto';
        st.termEnd = isDate(raw.termEnd) ? raw.termEnd : '';
        let seq = 1; const ids = new Set();
        const id = v => { let s = str(v, 40); if (!s || ids.has(s)) s = 'x' + (seq++); ids.add(s); return s; };
        raw.subjects.slice(0, MAX_SUBJECTS).forEach(s => {
            if (!s || typeof s !== 'object') return;
            const name = str(s.name, 60).trim(); if (!name) return;
            const times = (Array.isArray(s.times) ? s.times : []).slice(0, MAX_TIMES).filter(t => t && Number.isInteger(t.day) && t.day >= 0 && t.day <= 6
                && Number.isInteger(t.s) && Number.isInteger(t.e) && t.s >= 0 && t.e <= 1440 && t.s < t.e)
                .map(t => ({ id: id(t.id), day: t.day, s: t.s, e: t.e, room: str(t.room, 40), week: t.week === 'A' || t.week === 'B' ? t.week : 'every' }));
            st.subjects.push({ id: id(s.id), name, color: COLORS.includes(s.color) ? s.color : COLORS[st.subjects.length % COLORS.length],
                teacher: str(s.teacher, 60), bring: str(s.bring, 120), note: str(s.note, 300), times });
        });
        (Array.isArray(raw.holidays) ? raw.holidays : []).slice(0, MAX_HOLIDAYS).forEach(h => {
            if (!h || !isDate(h.from) || !isDate(h.to) || h.to < h.from) return;
            st.holidays.push({ id: id(h.id), name: str(h.name, 60).trim() || 'Holiday', from: h.from, to: h.to });
        });
        st.seq = Math.max(seq, Number.isInteger(raw.seq) && raw.seq > 0 ? raw.seq : 1);
        if (st.ab && !st.weekA) st.ab = false;
        return st;
    }

    const api = { MAX_SUBJECTS, MAX_TIMES, MAX_HOLIDAYS, DAYS, DAY_NAMES, COLORS, isDate, addDays, diff, todayIso, nowMin, weekday, shortDate, relDay, weekOf,
        parseTime, hm, fmtTime, fmtDur, weekLetter, setWeekLetter, holidayOn, lessonsOn, nextSchoolDay, gaps, status, clashes, clashesFor,
        readForm, nextColor, roomLabel, bringList, dayText, weekDays, weekdayItems, weekText, ics, emptyState, validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TimetableCore = api;
})(this);
