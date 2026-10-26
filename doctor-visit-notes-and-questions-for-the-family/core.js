// Doctor Visit Notes and Questions for the Family: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings and times 'HH:MM' on the person's own calendar and clock.
// state = { people, visits, appts, questions }:
//   a visit is what happened at the doctor (date, doctor, reason, what was said, medicine changes, tests);
//   an appointment is a visit still to come (from a visit's "next visit", or added on its own); it is done once a visit is written up for it;
//   a question belongs to one person and is open until it is asked at a visit (or ticked as asked).
(function (root) {
    'use strict';
    const MAX_PEOPLE = 20, MAX_VISITS = 3000, MAX_APPTS = 600, MAX_QS = 2000, MAX_MEDS = 20;
    const LEN = { name: 40, pnote: 400, doctor: 80, reason: 200, said: 5000, tests: 600, med: 60, dose: 80, q: 300, anote: 200 };
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const ACTS = { start: 'Started', change: 'Dose changed', stop: 'Stopped' };
    const MATCH_BEFORE = 3, MATCH_AFTER = 14;   // a visit with the same doctor from 3 days before to 14 days after an appointment counts as that appointment

    // ---- dates and times
    const pad = n => String(n).padStart(2, '0');
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    function parseDate(v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
        return { y, m: mo, d };
    }
    const isDate = v => !!parseDate(v);
    const isTime = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v == null ? '' : v));
    const dayNum = iso => { const p = parseDate(iso); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 864e5); };
    const fromNum = n => { const d = new Date(n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
    const addDays = (iso, n) => fromNum(dayNum(iso) + n);
    function addMonths(iso, n) {
        const p = parseDate(iso), t = p.y * 12 + (p.m - 1) + n, y = Math.floor(t / 12), m = t - y * 12 + 1;
        return y + '-' + pad(m) + '-' + pad(Math.min(p.d, daysIn(y, m)));
    }
    const diff = (a, b) => dayNum(b) - dayNum(a);
    const todayIso = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const dow = iso => { const p = parseDate(iso); return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]; };
    // "Tue 4 Nov" this year, "Tue 4 Nov 2025" other years (always with the year when today is not given)
    function shortDate(iso, today) {
        const p = parseDate(iso); if (!p) return '';
        return dow(iso) + ' ' + p.d + ' ' + MONTHS[p.m - 1] + (today && iso.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + p.y);
    }
    // "10:30 am", "12:00 noon", "9:05 pm"
    function niceTime(t) {
        if (!isTime(t)) return '';
        const h = +t.slice(0, 2), m = t.slice(3);
        if (h === 12 && m === '00') return '12:00 noon';
        if (h === 0 && m === '00') return '12:00 midnight';
        return (h % 12 || 12) + ':' + m + (h < 12 ? ' am' : ' pm');
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    function rel(today, date) {
        const d = diff(today, date), a = Math.abs(d);
        if (d === 0) return 'today';
        if (d === 1) return 'tomorrow';
        if (d === -1) return 'yesterday';
        const s = a <= 60 ? plural(a, 'day') : a < 730 ? plural(Math.floor(a / 30.44), 'month') : plural(Math.floor(a / 365.25), 'year');
        return d > 0 ? 'in ' + s : s + ' ago';
    }

    // ---- text
    const oneLine = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
    const multi = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
    // "Dr. Khan", "dr khan" and "Khan" are the same doctor
    const normDoc = s => oneLine(s, 200).toLowerCase().replace(/\bdr\b\.?|\bdoctor\b|[.,()]/g, ' ').replace(/\s+/g, ' ').trim();
    const normMed = s => oneLine(s, 200).toLowerCase();
    const list = (a) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

    // ---- lookups
    const byId = (arr, id) => arr.find(x => x.id === id) || null;
    const visitsOf = (state, pid) => state.visits.filter(v => v.person === pid).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);
    const openQs = (state, pid) => state.questions.filter(q => q.person === pid && !q.asked);
    const askedQs = (state, pid) => state.questions.filter(q => q.person === pid && q.asked).sort((a, b) => a.asked < b.asked ? 1 : a.asked > b.asked ? -1 : b.id - a.id);
    const apptKey = a => a.date + ' ' + (a.time || '99:99');
    const openAppts = (state, pid) => state.appts.filter(a => !a.done && (pid == null || a.person === pid)).sort((a, b) => apptKey(a) < apptKey(b) ? -1 : apptKey(a) > apptKey(b) ? 1 : a.id - b.id);
    function doctors(state) {
        const seen = new Map();
        state.visits.concat(state.appts).forEach(x => { const k = normDoc(x.doctor); if (k && !seen.has(k)) seen.set(k, x.doctor); });
        return [...seen.values()].sort((a, b) => a.localeCompare(b));
    }

    // The medicines a person is on now, worked out from the changes written at each visit, oldest first.
    // A change with no new dose keeps the old dose. Stopping a medicine that was never started is only kept in the history.
    function medsNow(state, pid) {
        const now = new Map();
        visitsOf(state, pid).forEach(v => v.meds.forEach(m => {
            const k = normMed(m.name), was = now.get(k);
            if (m.act === 'stop') { now.delete(k); return; }
            if (m.act === 'change' && was) now.set(k, { name: m.name, dose: m.dose || was.dose, date: v.date, doctor: v.doctor, act: 'change', since: was.since });
            else now.set(k, { name: m.name, dose: m.dose, date: v.date, doctor: v.doctor, act: m.act, since: v.date });
        }));
        return [...now.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    function medLine(m, today) {
        return m.name + (m.dose ? ' ' + m.dose : '') + ' (' + (m.act === 'change' ? 'dose changed ' : 'started ') + shortDate(m.date, today) + (m.doctor ? ', ' + m.doctor : '') + ')';
    }
    const medChange = m => ACTS[m.act] + ' ' + m.name + (m.act !== 'stop' && m.dose ? ' ' + m.dose : '');

    // ---- what is coming up: one line per open appointment, the ones already past first
    function apptState(a, today) {
        const d = diff(today, a.date);
        return d < 0 ? 'past' : d === 0 ? 'today' : d <= 7 ? 'soon' : 'later';
    }
    function apptText(state, a, today) {
        const st = apptState(a, today);
        if (st === 'past') return a.doctor + ' was ' + shortDate(a.date, today) + ' (' + rel(today, a.date) + '). Add notes from that visit, or remove it if it did not happen.';
        const n = openQs(state, a.person).length;
        return a.doctor + ', ' + shortDate(a.date, today) + (a.time ? ' at ' + niceTime(a.time) : '') + ' (' + rel(today, a.date) + ').' +
            (n ? ' ' + plural(n, 'question') + ' to ask.' : '');
    }
    function comingUp(state, today) {
        const past = [], next = [];
        openAppts(state, null).forEach(a => {
            const p = byId(state.people, a.person); if (!p) return;
            (apptState(a, today) === 'past' ? past : next).push({ appt: a, person: p, cls: apptState(a, today), text: apptText(state, a, today) });
        });
        past.reverse();      // the most recent missed write-up first
        return past.concat(next);
    }

    // ---- search: visits whose doctor, reason, notes, tests or medicines contain every word typed
    function search(state, q) {
        const words = oneLine(q, 100).toLowerCase().split(' ').filter(Boolean);
        if (!words.length) return [];
        return state.visits.filter(v => {
            const p = byId(state.people, v.person);
            const hay = [p ? p.name : '', v.doctor, v.reason, v.said, v.tests, ...v.meds.map(m => m.name + ' ' + m.dose)].join('\n').toLowerCase();
            return words.every(w => hay.includes(w));
        }).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id);
    }

    // ---- a person's whole history as plain text, for copy, email and a new doctor
    function visitText(v, today) {
        const L = [shortDate(v.date, null) + ', ' + v.doctor];
        if (v.reason) L.push('Why: ' + v.reason);
        if (v.said) L.push('What the doctor said: ' + v.said);
        if (v.meds.length) L.push('Medicines: ' + v.meds.map(medChange).join('; '));
        if (v.tests) L.push('Tests: ' + v.tests);
        return L.join('\n');
    }
    function historyText(state, pid, today) {
        const p = byId(state.people, pid); if (!p) return '';
        const L = [p.name + ': doctor visits and medicines', 'Written ' + shortDate(today, null)];
        if (p.note) L.push('', 'About ' + p.name + ': ' + p.note);
        const meds = medsNow(state, pid);
        L.push('', 'Medicines now (from these notes):' + (meds.length ? '' : ' none written down'));
        meds.forEach(m => L.push('- ' + medLine(m, null)));
        const ap = openAppts(state, pid).filter(a => a.date >= today);
        if (ap.length) { L.push('', 'Next visits:'); ap.forEach(a => L.push('- ' + a.doctor + ', ' + shortDate(a.date, null) + (a.time ? ' at ' + niceTime(a.time) : '') + (a.note ? ' (' + a.note + ')' : ''))); }
        const qs = openQs(state, pid);
        if (qs.length) { L.push('', 'Questions for next time:'); qs.forEach(q => L.push('- ' + q.text)); }
        const vs = visitsOf(state, pid).reverse();
        L.push('', 'Visits, newest first (' + vs.length + '):');
        vs.forEach(v => L.push('', visitText(v, today)));
        return L.join('\n');
    }

    // ---- calendar file for one appointment: a reminder the day before (and 2 hours before when the time is known)
    const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
    function fold(line) {
        const out = []; let cur = '', len = 0;
        for (const ch of line) {
            const b = new TextEncoder().encode(ch).length;
            if (len + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
            cur += ch; len += b;
        }
        out.push(cur);
        return out.join('\r\n ');
    }
    function ics(state, a, today, url) {
        const p = byId(state.people, a.person), qs = openQs(state, a.person);
        const t = (p ? p.name + ': ' : '') + a.doctor;
        const d = a.date.replace(/-/g, '');
        const desc = [a.note, qs.length ? 'Questions to ask:\n' + qs.map(q => '- ' + q.text).join('\n') : '', 'Notes: ' + url].filter(Boolean).join('\n\n');
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Doctor Visit Notes//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
            'UID:doctorvisit-' + a.id + '-' + d + '@umar8092.github.io', 'DTSTAMP:' + today.replace(/-/g, '') + 'T000000Z'];
        if (a.time) {
            const end = addMinutes(a.date, a.time, 60);
            L.push('DTSTART:' + d + 'T' + a.time.replace(':', '') + '00', 'DTEND:' + end.date.replace(/-/g, '') + 'T' + end.time.replace(':', '') + '00');
        } else L.push('DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + addDays(a.date, 1).replace(/-/g, ''));
        L.push(fold('SUMMARY:' + icsEsc(t)), fold('DESCRIPTION:' + icsEsc(desc)),
            'BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + icsEsc(t + ' tomorrow')), a.time ? 'TRIGGER:-P1D' : 'TRIGGER:-PT15H', 'END:VALARM');
        if (a.time) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + icsEsc(t + ' in 2 hours')), 'TRIGGER:-PT2H', 'END:VALARM');
        L.push('END:VEVENT', 'END:VCALENDAR');
        return L.join('\r\n') + '\r\n';
    }
    function addMinutes(date, time, mins) {
        const t = +time.slice(0, 2) * 60 + +time.slice(3) + mins, extra = Math.floor(t / 1440), m = t % 1440;
        return { date: addDays(date, extra), time: pad(Math.floor(m / 60)) + ':' + pad(m % 60) };
    }

    // ---- forms: each returns { errors } or the clean value
    function readPerson(f, state, editId) {
        const errors = {};
        const name = oneLine(f.name, LEN.name);
        if (!name) errors.name = 'Type a name, like Abbu, Mum or Ali.';
        else if (state.people.some(p => p.id !== editId && p.name.toLowerCase() === name.toLowerCase())) errors.name = name + ' is already in your list. Add something to tell them apart, like ' + name + ' (son).';
        else if (editId == null && state.people.length >= MAX_PEOPLE) errors.name = 'You can keep up to ' + MAX_PEOPLE + ' people.';
        if (Object.keys(errors).length) return { errors };
        return { person: { name, note: multi(f.note, LEN.pnote) } };
    }
    // f: { person, date, doctor, reason, said, tests, meds: [{ act, name, dose }], next: { date, time } | null, asked: [question ids] }
    function readVisit(f, state, today, editId) {
        const errors = {};
        const person = byId(state.people, Number(f.person));
        if (!person) errors.person = 'Choose who saw the doctor.';
        let date = '';
        if (!isDate(f.date)) errors.date = 'Choose the date of the visit.';
        else if (f.date > today) errors.date = 'That date is still to come. For a visit that is booked, use "+ Add an appointment" instead.';
        else date = f.date;
        const doctor = oneLine(f.doctor, LEN.doctor);
        if (!doctor) errors.doctor = 'Type the doctor or clinic, like Dr Khan (heart) or City Hospital A&E.';
        const meds = [];
        (Array.isArray(f.meds) ? f.meds : []).forEach((m, i) => {
            const name = oneLine(m && m.name, LEN.med), dose = oneLine(m && m.dose, LEN.dose), act = ACTS[m && m.act] ? m.act : '';
            if (!name && !dose) return;
            if (!name) { errors['med' + i] = 'Type the medicine\'s name, or tap Remove.'; return; }
            if (!act) { errors['med' + i] = 'Choose what the doctor did with ' + name + '.'; return; }
            meds.push({ act, name, dose: act === 'stop' ? '' : dose });
        });
        if (meds.length > MAX_MEDS) errors.med0 = 'Up to ' + MAX_MEDS + ' medicine changes fit in one visit.';
        let next = null;
        if (f.next && (f.next.date || f.next.time)) {
            if (!isDate(f.next.date)) errors.next = 'Choose the date of the next visit, or remove it.';
            else if (date && f.next.date <= date) errors.next = 'The next visit has to be after this visit (' + shortDate(date, today) + ').';
            else if (f.next.time && !isTime(f.next.time)) errors.next = 'Check the time of the next visit.';
            else next = { date: f.next.date, time: f.next.time || '' };
        }
        if (Object.keys(errors).length) return { errors };
        const asked = (Array.isArray(f.asked) ? f.asked : []).map(Number).filter(id => { const q = byId(state.questions, id); return q && q.person === person.id && (!q.asked || q.visit === editId); });
        const warns = [];
        if (next && next.date < today) warns.push('The next visit date has already passed. It will show at the top so you can add notes from it.');
        return { visit: { person: person.id, date, doctor, reason: oneLine(f.reason, LEN.reason), said: multi(f.said, LEN.said), tests: multi(f.tests, LEN.tests), meds }, next, asked, warn: warns.join(' ') };
    }
    // f: { person, date, time, doctor, note }
    function readAppt(f, state, today) {
        const errors = {};
        const person = byId(state.people, Number(f.person));
        if (!person) errors.person = 'Choose who the appointment is for.';
        const doctor = oneLine(f.doctor, LEN.doctor);
        if (!doctor) errors.doctor = 'Type the doctor or clinic.';
        let date = '';
        if (!isDate(f.date)) errors.date = 'Choose the date of the appointment.';
        else date = f.date;
        if (f.time && !isTime(f.time)) errors.time = 'Check the time, or leave it empty.';
        if (Object.keys(errors).length) return { errors };
        return { appt: { person: person.id, date, time: f.time || '', doctor, note: oneLine(f.note, LEN.anote) }, warn: date < today ? 'That date has passed. It will show at the top until you add notes from the visit or remove it.' : '' };
    }

    // ---- changes to the saved data (all in one place so the tests can check them)
    function newId(state) { return state.nextId++; }
    // r: the result of readVisit; editId: the visit being edited; apptId: the appointment the notes are for, if opened from one
    function saveVisit(state, r, editId, apptId) {
        let v = editId != null ? byId(state.visits, editId) : null;
        if (v) Object.assign(v, r.visit);
        else { v = Object.assign({ id: newId(state) }, r.visit); state.visits.push(v); }
        // questions: first undo what this visit had ticked, then tick the ones asked now
        state.questions.forEach(q => { if (q.visit === v.id) { q.asked = ''; q.visit = 0; } });
        r.asked.forEach(id => { const q = byId(state.questions, id); if (q && q.person === v.person && !q.asked) { q.asked = v.date; q.visit = v.id; } });
        // the next visit this visit booked
        const mine = state.appts.find(a => a.fromVisit === v.id);
        if (r.next) {
            if (mine) Object.assign(mine, { person: v.person, doctor: v.doctor, date: r.next.date, time: r.next.time });
            else state.appts.push({ id: newId(state), person: v.person, date: r.next.date, time: r.next.time, doctor: v.doctor, note: '', fromVisit: v.id, done: 0 });
        } else if (mine) {
            if (mine.done) mine.fromVisit = 0;
            else state.appts = state.appts.filter(a => a !== mine);
        }
        // the appointment this visit was for
        state.appts.forEach(a => { if (a.done === v.id) a.done = 0; });
        let linked = apptId != null ? byId(state.appts, apptId) : null;
        if (linked && (linked.done || linked.person !== v.person || linked.fromVisit === v.id)) linked = null;
        if (!linked) linked = matchAppt(state, v);
        if (linked) linked.done = v.id;
        return { visit: v, linked };
    }
    function matchAppt(state, v) {
        const k = normDoc(v.doctor);
        let best = null, bestGap = Infinity;
        state.appts.forEach(a => {
            if (a.done || a.person !== v.person || a.fromVisit === v.id || normDoc(a.doctor) !== k) return;
            const from = a.fromVisit ? byId(state.visits, a.fromVisit) : null;
            if (from && from.date >= v.date) return;          // booked at a later visit: not this one
            const d = diff(a.date, v.date), gap = Math.abs(d);
            if (d >= -MATCH_BEFORE && d <= MATCH_AFTER && gap < bestGap) { best = a; bestGap = gap; }
        });
        return best;
    }
    function deleteVisit(state, id) {
        state.visits = state.visits.filter(v => v.id !== id);
        state.questions.forEach(q => { if (q.visit === id) { q.asked = ''; q.visit = 0; } });
        state.appts = state.appts.filter(a => !(a.fromVisit === id && !a.done));
        state.appts.forEach(a => { if (a.done === id) a.done = 0; if (a.fromVisit === id) a.fromVisit = 0; });
    }
    function deletePerson(state, pid) {
        state.people = state.people.filter(p => p.id !== pid);
        state.visits = state.visits.filter(v => v.person !== pid);
        state.appts = state.appts.filter(a => a.person !== pid);
        state.questions = state.questions.filter(q => q.person !== pid);
    }
    // a pasted list adds one question per line
    function splitQuestions(text) {
        return String(text == null ? '' : text).split(/\r?\n/).map(s => oneLine(s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''), LEN.q)).filter(Boolean);
    }
    function addQuestions(state, pid, text, today) {
        const have = new Set(openQs(state, pid).map(q => q.text.toLowerCase()));
        const added = [], dup = [];
        splitQuestions(text).forEach(t => {
            if (have.has(t.toLowerCase())) { dup.push(t); return; }
            if (state.questions.length >= MAX_QS) return;
            have.add(t.toLowerCase());
            const q = { id: newId(state), person: pid, text: t, added: today, asked: '', visit: 0 };
            state.questions.push(q); added.push(q);
        });
        return { added, dup };
    }

    // ---- saved data
    const emptyState = () => ({ v: 1, nextId: 1, people: [], visits: [], appts: [], questions: [] });
    const okDate = v => typeof v === 'string' && isDate(v) ? v : '';
    const okId = v => Number.isInteger(v) && v > 0 ? v : null;
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.people)) return null;
        const out = emptyState(), all = [];
        const take = (arr, max, fn) => { const ids = new Set(); (Array.isArray(arr) ? arr : []).slice(0, max).forEach(x => { if (!x || typeof x !== 'object' || !okId(x.id) || ids.has(x.id) || all.includes(x.id)) return; const y = fn(x); if (y) { ids.add(x.id); all.push(x.id); } }); };
        const names = new Set();
        take(s.people, MAX_PEOPLE, x => {
            const name = oneLine(str(x.name, 200), LEN.name);
            if (!name || names.has(name.toLowerCase())) return null;
            names.add(name.toLowerCase());
            const p = { id: x.id, name, note: multi(str(x.note, 2000), LEN.pnote) }; out.people.push(p); return p;
        });
        const pids = new Set(out.people.map(p => p.id));
        take(s.visits, MAX_VISITS, x => {
            const date = okDate(x.date), doctor = oneLine(str(x.doctor, 400), LEN.doctor);
            if (!pids.has(x.person) || !date || !doctor) return null;
            const meds = (Array.isArray(x.meds) ? x.meds : []).slice(0, MAX_MEDS).filter(m => m && ACTS[m.act] && oneLine(str(m.name, 200), LEN.med))
                .map(m => ({ act: m.act, name: oneLine(m.name, LEN.med), dose: m.act === 'stop' ? '' : oneLine(str(m.dose, 300), LEN.dose) }));
            const v = { id: x.id, person: x.person, date, doctor, reason: oneLine(str(x.reason, 800), LEN.reason), said: multi(str(x.said, 20000), LEN.said), tests: multi(str(x.tests, 3000), LEN.tests), meds };
            out.visits.push(v); return v;
        });
        const vids = new Set(out.visits.map(v => v.id));
        take(s.appts, MAX_APPTS, x => {
            const date = okDate(x.date), doctor = oneLine(str(x.doctor, 400), LEN.doctor);
            if (!pids.has(x.person) || !date || !doctor) return null;
            const a = { id: x.id, person: x.person, date, time: isTime(x.time) ? x.time : '', doctor, note: oneLine(str(x.note, 800), LEN.anote),
                fromVisit: vids.has(x.fromVisit) ? x.fromVisit : 0, done: vids.has(x.done) ? x.done : 0 };
            out.appts.push(a); return a;
        });
        take(s.questions, MAX_QS, x => {
            const text = oneLine(str(x.text, 1000), LEN.q);
            if (!pids.has(x.person) || !text) return null;
            const asked = okDate(x.asked);
            const q = { id: x.id, person: x.person, text, added: okDate(x.added), asked, visit: asked && vids.has(x.visit) ? x.visit : 0 };
            out.questions.push(q); return q;
        });
        out.nextId = Math.max(Number.isInteger(s.nextId) ? s.nextId : 1, Math.max(0, ...all) + 1);
        return out;
    }

    const api = { MAX_PEOPLE, MAX_MEDS, LEN, ACTS, MATCH_BEFORE, MATCH_AFTER, parseDate, isDate, isTime, addDays, addMonths, diff, todayIso, shortDate, niceTime, plural, rel, list,
        normDoc, byId, visitsOf, openQs, askedQs, openAppts, doctors, medsNow, medLine, medChange, apptState, apptText, comingUp, search, visitText, historyText, ics,
        readPerson, readVisit, readAppt, saveVisit, matchAppt, deleteVisit, deletePerson, splitQuestions, addQuestions, newId, emptyState, validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VisitCore = api;
})(this);
