// Logic checks for core.js. Run with: node tests.js   (or open test.html)
(function () {
    'use strict';
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : window.VisitCore;
    let pass = 0; const fails = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(what + '\n   got:  ' + g + '\n   want: ' + w); };
    const ok = (v, what) => eq(!!v, true, what);
    const T = '2026-10-26';   // a Monday
    const fresh = () => {
        const s = C.emptyState();
        s.people.push({ id: 1, name: 'Abbu', note: 'Diabetic. Allergic to penicillin.' }, { id: 2, name: 'Ali', note: '' });
        s.nextId = 3; return s;
    };
    const visit = (s, o, editId, apptId) => {
        const r = C.readVisit(Object.assign({ person: 1, date: T, doctor: 'Dr Khan (heart)', reason: '', said: '', tests: '', meds: [], next: null, asked: [] }, o), s, T, editId);
        if (r.errors) throw new Error(JSON.stringify(r.errors));
        return C.saveVisit(s, r, editId, apptId);
    };

    // ---- dates and words
    eq(C.shortDate('2026-11-03', T), 'Tue 3 Nov', 'short date this year');
    eq(C.shortDate('2027-01-05', T), 'Tue 5 Jan 2027', 'short date next year');
    eq(C.shortDate('2026-11-03', null), 'Tue 3 Nov 2026', 'short date always with year when no today');
    eq(C.rel(T, '2026-11-04'), 'in 9 days', 'in 9 days');
    eq(C.rel(T, T), 'today', 'today');
    eq(C.rel(T, '2026-10-27'), 'tomorrow', 'tomorrow');
    eq(C.rel(T, '2026-10-20'), '6 days ago', '6 days ago');
    eq(C.rel(T, '2027-04-26'), 'in 5 months', 'months away');
    eq(C.niceTime('10:30'), '10:30 am', 'morning time');
    eq(C.niceTime('12:00'), '12:00 noon', 'noon');
    eq(C.niceTime('00:15'), '12:15 am', 'just after midnight');
    eq(C.niceTime('17:05'), '5:05 pm', 'afternoon');
    eq(C.niceTime('25:00'), '', 'bad time');
    eq(C.normDoc('Dr. Khan'), C.normDoc('dr khan'), 'Dr. Khan = dr khan');
    eq(C.normDoc('Doctor Khan'), 'khan', 'Doctor Khan = khan');
    eq(C.addMonths('2026-01-31', 1), '2026-02-28', 'one month from 31 Jan');

    // ---- people
    let s = fresh();
    ok(C.readPerson({ name: '  ' }, s, null).errors.name, 'blank name refused');
    ok(C.readPerson({ name: 'abbu' }, s, null).errors.name, 'same name refused (any case)');
    eq(C.readPerson({ name: 'Abbu' }, s, 1).person.name, 'Abbu', 'editing a person keeps their own name');
    eq(C.readPerson({ name: '  Ammi   jaan ', note: 'BP\r\n\r\n\r\n\r\nthyroid' }, s, null).person, { name: 'Ammi jaan', note: 'BP\n\nthyroid' }, 'name spaces and pasted note tidied');
    eq(C.readPerson({ name: 'x'.repeat(90) }, s, null).person.name.length, 40, 'very long name cut to 40');

    // ---- the main situation: Abbu at Dr Khan, medicines changed, next visit in 9 days, questions asked
    s = fresh();
    let qa = C.addQuestions(s, 1, 'Is the swelling in his feet from the new tablet?\n- Can he fast in Ramadan?\n2) Should he walk every day?\n\n', T);
    eq(qa.added.map(q => q.text), ['Is the swelling in his feet from the new tablet?', 'Can he fast in Ramadan?', 'Should he walk every day?'], 'pasted list: one question per line, bullets and numbers removed');
    eq(C.addQuestions(s, 1, 'can he fast in ramadan?', T).dup.length, 1, 'same open question is not added twice');
    eq(C.openQs(s, 1).length, 3, '3 open questions');
    const old = visit(s, { date: '2026-09-15', doctor: 'Dr Khan (heart)', said: 'BP high', meds: [{ act: 'start', name: 'Amlodipine', dose: '5 mg once a day' }, { act: 'start', name: 'Aspirin', dose: '75 mg' }] });
    const v2 = visit(s, { date: '2026-10-21', doctor: 'Dr Khan (heart)', said: 'Feet swelling. Lower the dose.', tests: 'ECG, kidney test',
        meds: [{ act: 'change', name: 'amlodipine', dose: '2.5 mg once a day' }, { act: 'stop', name: 'Aspirin', dose: 'ignored' }, { act: 'start', name: 'Atorvastatin', dose: '10 mg at night' }, { act: '', name: '', dose: '' }],
        next: { date: '2026-11-04', time: '10:30' }, asked: [qa.added[0].id] });
    eq(C.medsNow(s, 1).map(m => m.name + ' ' + m.dose), ['amlodipine 2.5 mg once a day', 'Atorvastatin 10 mg at night'], 'medicines now: changed dose kept, stopped one gone, new one added');
    eq(C.medsNow(s, 1)[0].since, '2026-09-15', 'a changed medicine remembers when it was first started');
    eq(C.medLine(C.medsNow(s, 1)[0], T), 'amlodipine 2.5 mg once a day (dose changed Wed 21 Oct, Dr Khan (heart))', 'medicine line');
    eq(v2.visit.meds[1], { act: 'stop', name: 'Aspirin', dose: '' }, 'a stopped medicine has no dose');
    eq(C.openQs(s, 1).length, 2, 'the asked question left the list');
    eq(C.byId(s.questions, qa.added[0].id).asked, '2026-10-21', 'asked on the visit date');
    let cu = C.comingUp(s, T);
    eq(cu.map(x => x.person.name + ': ' + x.text), ['Abbu: Dr Khan (heart), Wed 4 Nov at 10:30 am (in 9 days). 2 questions to ask.'], 'coming up line');
    eq(C.medChange({ act: 'change', name: 'Metformin', dose: '1000 mg' }), 'Dose changed Metformin 1000 mg', 'med change words');
    const hist = C.historyText(s, 1, T);
    ok(hist.startsWith('Abbu: doctor visits and medicines\nWritten Mon 26 Oct 2026\n\nAbout Abbu: Diabetic. Allergic to penicillin.'), 'history header');
    ok(hist.includes('- Atorvastatin 10 mg at night (started Wed 21 Oct 2026, Dr Khan (heart))'), 'history medicines now');
    ok(hist.includes('Next visits:\n- Dr Khan (heart), Wed 4 Nov 2026 at 10:30 am'), 'history next visit');
    ok(hist.includes('Questions for next time:\n- Can he fast in Ramadan?\n- Should he walk every day?'), 'history open questions');
    ok(hist.indexOf('Wed 21 Oct 2026') < hist.indexOf('Tue 15 Sep 2026, Dr Khan'), 'history newest first');
    ok(hist.includes('Medicines: Dose changed amlodipine 2.5 mg once a day; Stopped Aspirin; Started Atorvastatin 10 mg at night'), 'history medicine changes');

    // writing up the 4 Nov visit closes the appointment, even with "Dr. Khan" typed differently and a day late
    const T2 = '2026-11-05';
    let r = C.readVisit({ person: 1, date: T2, doctor: 'dr. khan (heart)', meds: [], asked: [] }, s, T2, null);
    let sv = C.saveVisit(s, r, null, null);
    eq(!!sv.linked && sv.linked.date, '2026-11-04', 'visit a day late with the same doctor closes the appointment');
    eq(C.comingUp(s, T2).length, 0, 'nothing coming up after the write-up');
    // undo by deleting that visit: the appointment comes back as a missed write-up
    C.deleteVisit(s, sv.visit.id);
    cu = C.comingUp(s, T2);
    eq(cu.map(x => x.cls + ' ' + x.text), ['past Dr Khan (heart) was Wed 4 Nov (yesterday). Add notes from that visit, or remove it if it did not happen.'], 'deleting the visit brings the appointment back, now past');

    // a different doctor does not close it; a visit far from the date does not either
    s = fresh();
    s.appts.push({ id: 50, person: 1, date: '2026-11-04', time: '', doctor: 'Dr Khan', note: '', fromVisit: 0, done: 0 }); s.nextId = 51;
    eq(visit(s, { date: T, doctor: 'Dr Sana (eyes)' }).linked, null, 'other doctor does not close the appointment');
    eq(visit(s, { date: '2026-10-01', doctor: 'Dr Khan' }).linked, null, 'a visit 34 days before does not close it');
    eq(visit(s, { date: '2026-10-25', doctor: 'Dr Khan' }).linked, null, 'an earlier visit 10 days before does not close it');
    eq(visit(s, { person: 2, date: T, doctor: 'Dr Khan' }).linked, null, 'the same doctor for another person does not close it');
    // the button on the appointment links it even if the doctor was typed differently
    sv = visit(s, { date: T, doctor: 'Heart clinic' }, null, 50);
    eq(sv.linked && sv.linked.id, 50, 'opened from the appointment: linked');
    s.appts.push({ id: 60, person: 1, date: '2026-10-29', time: '', doctor: 'Dr Khan', note: '', fromVisit: 0, done: 0 }, { id: 61, person: 1, date: '2026-10-12', time: '', doctor: 'Dr Khan', note: '', fromVisit: 0, done: 0 }); s.nextId = 62;
    eq(visit(s, { date: T, doctor: 'Dr Khan' }).linked.id, 60, 'brought forward 3 days: closes it (closer than one 14 days ago)');
    eq(visit(s, { date: T, doctor: 'Dr Khan' }).linked.id, 61, 'written up 14 days late: closes it');
    s = fresh(); s.appts.push({ id: 70, person: 1, date: '2026-10-11', time: '', doctor: 'Dr Khan', note: '', fromVisit: 0, done: 0 }); s.nextId = 71;
    eq(visit(s, { date: T, doctor: 'Dr Khan' }).linked, null, 'a visit 15 days after does not close it');

    // ---- editing a visit
    s = fresh();
    qa = C.addQuestions(s, 1, 'Q1\nQ2', T);
    sv = visit(s, { date: '2026-10-20', next: { date: '2026-12-01', time: '' }, asked: [qa.added[0].id] });
    const vid = sv.visit.id;
    eq(s.appts.length, 1, 'next visit made an appointment');
    // edit: untick Q1, tick Q2, move the next visit, change the doctor name
    r = C.readVisit({ person: 1, date: '2026-10-20', doctor: 'Dr Khan', meds: [], next: { date: '2026-12-08', time: '09:00' }, asked: [qa.added[1].id] }, s, T, vid);
    C.saveVisit(s, r, vid, null);
    eq(s.questions.map(q => q.text + ':' + q.asked), ['Q1:', 'Q2:2026-10-20'], 'editing which questions were asked');
    eq(s.appts.map(a => a.date + ' ' + a.time + ' ' + a.doctor), ['2026-12-08 09:00 Dr Khan'], 'editing moves the same appointment, no duplicate');
    // edit: remove the next visit
    r = C.readVisit({ person: 1, date: '2026-10-20', doctor: 'Dr Khan', meds: [], next: null, asked: [] }, s, T, vid);
    C.saveVisit(s, r, vid, null);
    eq(s.appts.length, 0, 'removing the next visit deletes its open appointment');
    eq(C.openQs(s, 1).length, 2, 'unticking all puts both questions back');
    // edit: move the visit to the other person: their questions are not ticked
    r = C.readVisit({ person: 2, date: '2026-10-20', doctor: 'Dr Khan', meds: [], next: null, asked: [qa.added[0].id] }, s, T, vid);
    eq(r.asked, [], 'a question of another person cannot be ticked');

    // ---- the form refuses what makes no sense
    s = fresh();
    let e = C.readVisit({ person: 9, date: '', doctor: ' ', meds: [] }, s, T, null).errors;
    eq(Object.keys(e).sort(), ['date', 'doctor', 'person'], 'empty visit form: who, date and doctor needed');
    ok(C.readVisit({ person: 1, date: '2026-10-27', doctor: 'x', meds: [] }, s, T, null).errors.date.includes('Add an appointment'), 'a visit tomorrow is refused, pointing to appointments');
    ok(C.readVisit({ person: 1, date: '2026-02-30', doctor: 'x', meds: [] }, s, T, null).errors.date, '30 Feb refused');
    ok(C.readVisit({ person: 1, date: T, doctor: 'x', meds: [{ act: 'start', name: '', dose: '5 mg' }] }, s, T, null).errors.med0, 'a dose with no medicine name refused');
    ok(C.readVisit({ person: 1, date: T, doctor: 'x', meds: [{ act: '', name: 'Panadol', dose: '' }] }, s, T, null).errors.med0, 'a medicine with no action refused');
    ok(C.readVisit({ person: 1, date: T, doctor: 'x', meds: [], next: { date: T, time: '' } }, s, T, null).errors.next, 'next visit on the same day refused');
    ok(C.readVisit({ person: 1, date: T, doctor: 'x', meds: [], next: { date: '', time: '10:00' } }, s, T, null).errors.next, 'a next time without a date refused');
    eq(C.readVisit({ person: 1, date: '2026-01-10', doctor: 'x', meds: [], next: { date: '2026-02-10', time: '' } }, s, T, null).warn.includes('already passed'), true, 'an old visit whose next date passed: warns, allowed');
    const long = 'word '.repeat(2000);
    eq(C.readVisit({ person: 1, date: T, doctor: 'x', said: long, meds: [] }, s, T, null).visit.said.length, 5000, 'very long notes are kept up to 5000 characters');
    eq(C.readVisit({ person: 1, date: '1950-03-01', doctor: 'x', meds: [] }, s, T, null).visit.date, '1950-03-01', 'very old visit allowed');
    eq(C.readVisit({ person: 1, date: T, doctor: 'x', meds: [] }, s, T, null).visit.said, '', 'notes are optional');
    e = C.readAppt({ person: 1, date: '', time: '', doctor: '' }, s, T).errors;
    eq(Object.keys(e).sort(), ['date', 'doctor'], 'appointment needs date and doctor, time optional');
    eq(C.readAppt({ person: 1, date: '2026-11-10', time: '', doctor: 'Dr Sana (eyes)', note: 'Bring old glasses' }, s, T).appt, { person: 1, date: '2026-11-10', time: '', doctor: 'Dr Sana (eyes)', note: 'Bring old glasses' }, 'appointment without time');
    ok(C.readAppt({ person: 1, date: '2026-10-01', time: '', doctor: 'x' }, s, T).warn, 'a past appointment warns');

    // ---- coming up order: past first (most recent), then by date and time, then all-day after timed
    s = fresh();
    s.appts.push(
        { id: 10, person: 1, date: '2026-11-04', time: '', doctor: 'B', note: '', fromVisit: 0, done: 0 },
        { id: 11, person: 2, date: '2026-11-04', time: '09:00', doctor: 'A', note: '', fromVisit: 0, done: 0 },
        { id: 12, person: 1, date: '2026-10-10', time: '', doctor: 'Old', note: '', fromVisit: 0, done: 0 },
        { id: 13, person: 1, date: '2026-10-20', time: '', doctor: 'Recent', note: '', fromVisit: 0, done: 0 },
        { id: 14, person: 2, date: T, time: '16:00', doctor: 'Today', note: '', fromVisit: 0, done: 0 });
    eq(C.comingUp(s, T).map(x => x.appt.doctor + ':' + x.cls), ['Recent:past', 'Old:past', 'Today:today', 'A:later', 'B:later'], 'coming up order');
    eq(C.comingUp(s, T)[2].text, 'Today, Mon 26 Oct at 4:00 pm (today).', 'today line, no questions');

    // ---- search
    s = fresh();
    visit(s, { date: '2026-09-01', doctor: 'Dr Khan', meds: [{ act: 'start', name: 'Metformin', dose: '500 mg' }] });
    visit(s, { person: 2, date: '2026-10-01', doctor: 'Dr Rubina (children)', said: 'Ear infection. Come back if fever.' });
    eq(C.search(s, 'metformin').length, 1, 'search by medicine');
    eq(C.search(s, 'EAR fever').length, 1, 'search by words in the notes, any case, all words');
    eq(C.search(s, 'ali').length, 1, 'search by person name');
    eq(C.search(s, '   ').length, 0, 'blank search finds nothing');
    eq(C.search(s, 'dr').map(v => v.date), ['2026-10-01', '2026-09-01'], 'search results newest first');

    // ---- calendar file
    s = fresh();
    C.addQuestions(s, 1, 'Can he fast?', T);
    const a = { id: 7, person: 1, date: '2026-11-04', time: '23:30', doctor: 'Dr Khan, heart', note: 'Fasting; bring reports' };
    let t = C.ics(s, a, T, 'https://umar8092.github.io/apps/doctor-visit-notes-and-questions-for-the-family/');
    ok(t.includes('DTSTART:20261104T233000\r\nDTEND:20261105T003000'), 'ics timed event crosses midnight correctly');
    ok(t.includes('SUMMARY:Abbu: Dr Khan\\, heart'), 'ics summary escaped');
    ok(t.includes('TRIGGER:-P1D') && t.includes('TRIGGER:-PT2H'), 'ics reminders the day before and 2 hours before');
    ok(t.replace(/\r\n /g, '').includes('Questions to ask:\\n- Can he fast?'), 'ics lists the questions');
    ok(t.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75), 'ics lines folded');
    t = C.ics(s, Object.assign({}, a, { time: '' }), T, 'u');
    ok(t.includes('DTSTART;VALUE=DATE:20261104\r\nDTEND;VALUE=DATE:20261105') && t.includes('TRIGGER:-PT15H'), 'ics all-day with 9 am reminder the day before');

    // ---- deleting
    s = fresh();
    qa = C.addQuestions(s, 1, 'Q', T);
    sv = visit(s, { date: '2026-10-01', next: { date: '2026-10-20', time: '' }, asked: [qa.added[0].id] });
    const sv2 = visit(s, { date: '2026-10-20' });
    eq(sv2.linked && sv2.linked.fromVisit, sv.visit.id, 'the follow-up closes the appointment booked at the first visit');
    C.deleteVisit(s, sv.visit.id);
    eq([s.appts.length, s.appts[0].fromVisit, s.appts[0].done, C.openQs(s, 1).length], [1, 0, sv2.visit.id, 1], 'deleting the first visit keeps the done appointment and reopens its question');
    C.deletePerson(s, 1);
    eq([s.people.length, s.visits.length, s.appts.length, s.questions.length], [1, 0, 0, 0], 'deleting a person removes all their notes');

    // ---- saved data: damaged or hand-edited files
    eq(C.validate(null), null, 'null refused');
    eq(C.validate({ people: 'x' }), null, 'wrong shape refused');
    eq(C.validate({ v: 1, people: [] }).visits.length, 0, 'empty ok');
    const bad = C.validate({ nextId: 2, people: [{ id: 1, name: 'A' }, { id: 1, name: 'B' }, { id: 3, name: 'a' }, { id: 4, name: '' }, { id: 5, name: 'C', note: 7 }],
        visits: [{ id: 6, person: 1, date: '2026-10-01', doctor: 'D', meds: [{ act: 'start', name: 'M', dose: 5 }, { act: 'eat', name: 'X' }, null] },
            { id: 7, person: 99, date: '2026-10-01', doctor: 'D' }, { id: 8, person: 1, date: 'yesterday', doctor: 'D' }, { id: 1, person: 1, date: '2026-10-01', doctor: 'D' }],
        appts: [{ id: 9, person: 1, date: '2026-11-01', time: '7pm', doctor: 'D', fromVisit: 6, done: 77 }],
        questions: [{ id: 10, person: 1, text: ' Why? ', asked: 'no', visit: 6 }, { id: 11, person: 5, text: '' }] });
    eq(bad.people.map(p => p.name + '|' + p.note), ['A|', 'C|'], 'people: duplicate ids, duplicate names, blank names dropped');
    eq(bad.visits.map(v => v.id + ':' + JSON.stringify(v.meds)), ['6:[{"act":"start","name":"M","dose":""}]'], 'visits: unknown person, bad date and reused id dropped; bad medicine rows dropped');
    eq(bad.appts[0], { id: 9, person: 1, date: '2026-11-01', time: '', doctor: 'D', note: '', fromVisit: 6, done: 0 }, 'appointment: bad time and unknown done visit cleaned');
    eq(bad.questions, [{ id: 10, person: 1, text: 'Why?', added: '', asked: '', visit: 0 }], 'questions cleaned');
    eq(bad.nextId, 11, 'next id after the highest kept id');
    const round = fresh(); visit(round, { date: '2026-10-01', meds: [{ act: 'start', name: 'M', dose: '1' }], next: { date: '2026-11-01', time: '08:00' } });
    eq(C.validate(JSON.parse(JSON.stringify(round))), round, 'a saved state comes back exactly');

    const out = pass + ' checks passed' + (fails.length ? ', ' + fails.length + ' FAILED:\n' + fails.join('\n') : '. ALL LOGIC CHECKS PASSED');
    if (typeof module !== 'undefined' && module.exports) { console.log(out); if (fails.length) process.exit(1); }
    else { const p = document.createElement('pre'); p.textContent = out; document.body.appendChild(p); }
})();
