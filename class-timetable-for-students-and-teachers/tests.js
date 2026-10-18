// Logic checks for core.js. Run: node tests.js  (or open test.html in a browser)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.TimetableCore;
    let pass = 0, failed = 0; const out = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); } };
    const T = '2026-10-19';   // a Monday
    const m = s => C.parseTime(s);
    let n = 1;
    const subj = (name, times, o) => Object.assign({ id: 's' + (n++), name, color: C.COLORS[0], teacher: '', bring: '', note: '',
        times: times.map(([day, a, b, room, week]) => ({ id: 't' + (n++), day, s: m(a), e: m(b), room: room || '', week: week || 'every' })) }, o || {});
    const state = (subjects, o) => Object.assign(C.emptyState(), { subjects }, o || {});

    // ---- words and times
    eq(C.weekday('2026-10-19'), 1, 'Mon 19 Oct is a Monday');
    eq(C.weekday('2026-10-18'), 0, 'Sun 18 Oct is a Sunday');
    eq(C.shortDate(T, T), 'Mon 19 Oct', 'short date');
    eq(C.shortDate('2027-01-04', T), 'Mon 4 Jan 2027', 'short date next year');
    eq(C.parseTime('08:30'), 510, 'parse 08:30');
    eq(C.parseTime('8:05'), 485, 'parse 8:05');
    eq(C.parseTime('24:00'), null, '24:00 is not a time');
    eq(C.parseTime('12:60'), null, '12:60 is not a time');
    eq(C.parseTime(''), null, 'blank time');
    eq(C.fmtTime(510, false), '08:30', '24-hour');
    eq(C.fmtTime(510, true), '8:30 am', '12-hour morning');
    eq(C.fmtTime(0, true), '12:00 am', '12-hour midnight');
    eq(C.fmtTime(720, true), '12:00 pm', '12-hour noon');
    eq(C.fmtTime(805, true), '1:25 pm', '12-hour afternoon');
    eq(C.fmtDur(25), '25 min', 'duration minutes');
    eq(C.fmtDur(60), '1 h', 'duration hour');
    eq(C.fmtDur(70), '1 h 10 min', 'duration hour and minutes');
    eq(C.roomLabel('12'), 'Room 12', 'room number');
    eq(C.roomLabel('B4'), 'Room B4', 'room code');
    eq(C.roomLabel('room 5'), 'Room 5', 'typed room kept once');
    eq(C.roomLabel('Sports hall'), 'Sports hall', 'room name as typed');
    eq(C.roomLabel(''), '', 'no room');
    eq(C.weekOf(T, 1), '2026-10-19', 'week from Monday');
    eq(C.weekOf(T, 0), '2026-10-18', 'week from Sunday');
    eq(C.weekOf(T, 6), '2026-10-17', 'week from Saturday');

    // ---- Ayesha's Monday
    const maths = subj('Maths', [[1, '08:30', '09:30', '12'], [3, '10:50', '11:50', '12']], { teacher: 'Mr Ahmed' });
    const eng = subj('English', [[1, '09:30', '10:30', '5']]);
    const chem = subj('Chemistry', [[1, '10:50', '11:50', 'Lab B4'], [2, '13:00', '14:00', 'Lab B4']], { bring: 'lab coat' });
    const pe = subj('PE', [[2, '09:30', '10:30', 'Sports hall']], { bring: 'PE kit' });
    const st = state([maths, eng, chem, pe]);
    let s = C.status(T, m('10:10'), st);
    eq(s.kind, 'now', '10:10 is during a lesson');
    eq(s.current.map(c => c.subject.name), ['English'], 'English now');
    eq(s.left, 20, '20 min left');
    eq(s.next.subject.name + ' ' + s.next.s, 'Chemistry 650', 'next Chemistry at 10:50');
    s = C.status(T, m('09:30'), st);
    eq(s.current.map(c => c.subject.name), ['English'], 'at the bell the new lesson is now');
    s = C.status(T, m('10:30'), st);
    eq([s.kind, s.wait, s.next.subject.name], ['free', 20, 'Chemistry'], 'break: free 20 min');
    s = C.status(T, m('07:00'), st);
    eq([s.kind, s.wait], ['before', 90], 'before school');
    s = C.status(T, m('11:50'), st);
    eq([s.kind, s.later.iso, s.later.items[0].subject.name], ['done', '2026-10-20', 'PE'], 'after the last lesson: tomorrow PE');
    s = C.status('2026-10-24', m('10:00'), st);
    eq([s.kind, s.later.iso], ['none', '2026-10-26'], 'Saturday: next is Monday');
    eq(C.status(T, 600, state([])).kind, 'empty', 'no subjects');
    eq(C.status(T, 600, state([subj('Art', [])])).kind, 'empty', 'subject with no times');
    eq(C.gaps(C.lessonsOn(T, st).items), [{ s: 630, e: 650 }], 'one gap on Monday');
    eq(C.bringList(C.lessonsOn('2026-10-20', st).items), ['PE kit (PE)', 'lab coat (Chemistry)'], 'bring list in lesson order');
    eq(C.weekDays(st), [1, 2, 3], 'week days used');
    eq(C.weekDays(state([])), [1, 2, 3, 4, 5], 'empty week shows Mon-Fri');
    eq(C.weekDays(Object.assign(state([subj('X', [[0, '08:00', '09:00'], [4, '08:00', '09:00']])]), { weekStart: 0 })), [0, 4], 'Sunday-start week order');

    // ---- clashes
    const urdu = subj('Urdu', [[1, '09:00', '09:45']]);
    const st2 = state([maths, eng, urdu]);
    eq(C.clashes(st2).length, 2, 'Urdu clashes with Maths and English');
    eq(C.clashesFor(urdu.id, st2).map(c => c.other.subject.name), ['Maths', 'English'], 'clash names');
    eq(C.clashes(state([subj('A', [[1, '08:00', '09:00']]), subj('B', [[1, '09:00', '10:00']])])).length, 0, 'back to back is not a clash');

    // ---- week A / week B
    const ab = state([subj('CS', [[5, '10:50', '11:50', '', 'B']]), subj('Art', [[5, '10:50', '11:50', '', 'A']])], { ab: true });
    C.setWeekLetter(ab, T, 'A');
    eq(ab.weekA, '2026-10-19', 'this week is A');
    eq([C.weekLetter(T, ab), C.weekLetter('2026-10-25', ab), C.weekLetter('2026-10-26', ab), C.weekLetter('2026-11-02', ab), C.weekLetter('2026-10-12', ab)], ['A', 'A', 'B', 'A', 'B'], 'weeks alternate both ways');
    eq(C.lessonsOn('2026-10-23', ab).items.map(i => i.subject.name), ['Art'], 'Friday of week A');
    eq(C.lessonsOn('2026-10-30', ab).items.map(i => i.subject.name), ['CS'], 'Friday of week B');
    eq(C.clashes(ab).length, 0, 'A and B lessons at the same time do not clash');
    C.setWeekLetter(ab, T, 'B');
    eq(C.weekLetter(T, ab), 'B', 'switch this week to B');
    eq(C.weekLetter('2027-01-04', ab), 'A', 'across the new year: 11 weeks after a Week B is Week A');
    const sunAB = Object.assign(state([]), { ab: true, weekStart: 0 }); C.setWeekLetter(sunAB, T, 'A');
    eq([C.weekLetter('2026-10-24', sunAB), C.weekLetter('2026-10-25', sunAB)], ['A', 'B'], 'Sunday-start week switches on Sunday');
    eq(C.weekLetter(T, Object.assign(state([]), { ab: false })), '', 'no letter when off');

    // ---- holidays
    const hol = state([maths], { holidays: [{ id: 'h1', name: 'Half term', from: '2026-10-26', to: '2026-11-01' }] });
    eq(C.lessonsOn('2026-10-26', hol).items.length, 0, 'no lessons in half term');
    s = C.status('2026-10-28', 600, hol);
    eq([s.kind, s.holiday.name, s.later.iso], ['holiday', 'Half term', '2026-11-02'], 'holiday then Mon 2 Nov');
    eq(C.nextSchoolDay('2026-10-23', hol).iso, '2026-11-02', 'Friday before half term: next is after it');
    eq(C.lessonsOn('2026-10-26', hol, true).items.length, 1, 'holiday can be ignored');
    const all = state([maths], { holidays: [{ id: 'h', name: 'Summer', from: '2026-10-20', to: '2027-06-01' }] });
    eq(C.status(T, 1200, all).later, null, 'nothing in the next 4 months');

    // ---- the form
    const f = (o) => Object.assign({ name: 'Maths', color: C.COLORS[2], rows: [{ day: '1', start: '08:30', end: '09:15', room: ' 12 ' }] }, o || {});
    let r = C.readForm(f(), st, null);
    eq([r.ok, r.subject.times[0].s, r.subject.times[0].e, r.subject.times[0].room, r.duplicate], [true, 510, 555, '12', true], 'good form, duplicate name noticed');
    r = C.readForm(f({ name: '  ' }), st, null); eq(r.errors.name.slice(0, 8), 'Type the', 'blank name');
    r = C.readForm(f({ rows: [] }), st, null); eq([r.ok, r.noTimes], [false, 'Add at least one day and time.'], 'no rows');
    r = C.readForm(f({ rows: [{ day: '1', start: '10:00', end: '09:00' }] }), st, null); eq(r.errors.rows[0].slice(0, 22), 'It ends before it star', 'end before start');
    r = C.readForm(f({ rows: [{ day: '1', start: '10:00', end: '10:00' }] }), st, null); eq(r.errors.rows[0], 'The end time is the same as the start time.', 'zero length');
    r = C.readForm(f({ rows: [{ day: '1', start: '', end: '10:00' }] }), st, null); eq(r.errors.rows[0], 'Type when it starts.', 'no start');
    r = C.readForm(f({ rows: [{ day: '1', start: '10:00', end: '' }] }), st, null); eq(r.errors.rows[0], 'Type when it ends.', 'no end');
    r = C.readForm(f({ rows: [{ day: '9', start: '10:00', end: '11:00' }] }), st, null); eq(r.errors.rows[0], 'Choose the day.', 'bad day');
    r = C.readForm(f({ name: 'Maths', rows: [{ day: '1', start: '08:00', end: '09:00', week: 'A' }] }), st, maths.id); eq([r.duplicate, r.subject.times[0].week], [false, 'every'], 'editing itself is not a duplicate; week ignored when A/B is off');
    r = C.readForm(f({ rows: [{ day: '5', start: '08:00', end: '09:00', week: 'B' }] }), ab, null); eq(r.subject.times[0].week, 'B', 'week kept when A/B is on');
    r = C.readForm(f({ name: 'x'.repeat(61) }), st, null); eq(r.ok, false, 'name too long');
    eq(C.nextColor(state([subj('A', [], { color: C.COLORS[0] })])), C.COLORS[1], 'next unused colour');

    // ---- text
    const wt = C.weekText(st, false);
    eq(wt.split('\n').slice(0, 3), ['Monday', '  08:30 - 09:30  Maths (Room 12, Mr Ahmed)', '  09:30 - 10:30  English (Room 5)'], 'week text');
    eq(wt.includes('What to bring\n  Chemistry: lab coat\n  PE: PE kit'), true, 'week text bring list');
    eq(C.dayText(C.lessonsOn('2026-10-26', hol), T, false), 'Mon 26 Oct: no lessons, Half term', 'day text holiday');

    // ---- calendar file
    const ic = C.ics(hol, T, '2026-11-13', 'https://x/').text;
    eq((ic.match(/BEGIN:VEVENT/g) || []).length, 2, 'two Maths lessons');
    eq(ic.includes('DTSTART:20261019T083000\r\nDTEND:20261019T093000\r\nRRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=20261113T235959'), true, 'Monday maths from today');
    eq(ic.includes('DTSTART:20261021T105000'), true, 'Wednesday maths first on Wed 21 Oct');
    eq(ic.includes('EXDATE:20261026T083000') && ic.includes('EXDATE:20261028T105000'), true, 'half term skipped');
    eq(ic.includes('LOCATION:Room 12') && ic.includes('DESCRIPTION:Mr Ahmed\\nhttps://x/'), true, 'room and teacher');
    eq(C.ics(hol, T, '2026-10-18', '').count, 0, 'end before start: nothing');
    const ic2 = C.ics(ab, T, '2026-12-18', '').text;   // this week is B now
    eq(ic2.includes('DTSTART:20261023T105000') && ic2.includes('INTERVAL=2'), true, 'week B lesson starts this Friday, every 2 weeks');
    eq(C.ics(state([subj('Semi;colon, test', [[1, '08:00', '09:00']])]), T, '2026-11-01', '').text.includes('SUMMARY:Semi\\;colon\\, test'), true, 'ics escapes text');

    // ---- saved state
    eq(C.validate(null), null, 'null state');
    eq(C.validate({ hello: 1 }), null, 'not our data');
    const v = C.validate({ subjects: [{ name: 'Art', color: 'red', times: [{ day: 1, s: 600, e: 540 }, { day: 1, s: 600, e: 660, week: 'Z' }, { day: 7, s: 1, e: 2 }] }, { name: '' }, 5],
        holidays: [{ from: '2026-10-01', to: '2026-09-01' }, { from: '2026-10-01', to: '2026-10-02', name: '' }], ab: true, weekStart: 3, clock: 'x' });
    eq([v.subjects.length, v.subjects[0].times.length, v.subjects[0].times[0].week, v.subjects[0].color, v.holidays.length, v.holidays[0].name, v.ab, v.weekStart, v.clock],
        [1, 1, 'every', C.COLORS[0], 1, 'Holiday', false, 1, 'auto'], 'bad values dropped or fixed');
    const round = C.validate(JSON.parse(JSON.stringify(ab)));
    eq([round.ab, round.weekA, round.subjects.length], [true, ab.weekA, 2], 'round trip');

    const msg = (failed ? 'FAILED ' + failed + ' of ' + (pass + failed) : 'ALL ' + pass + ' LOGIC CHECKS PASSED') + (out.length ? '\n' + out.join('\n') : '');
    if (typeof document !== 'undefined') { const p = document.createElement('pre'); p.textContent = msg; document.body.appendChild(p); }
    else { console.log(msg); process.exitCode = failed ? 1 : 0; }
})();
