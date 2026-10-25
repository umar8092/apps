// Logic checks for core.js. Run: node tests.js  (or open test.html in a browser)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.LentCore;
    let pass = 0, failed = 0; const out = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); } };
    const T = '2026-10-25';   // a Sunday
    const form = o => Object.assign({ kind: 'lent', what: 'Drill', who: 'Bilal', date: '2026-09-12', duePreset: 'none', dueDate: '', note: '', returned: null }, o);
    const item = o => { const r = C.readForm(form(o), T); if (!r.ok) throw new Error(JSON.stringify(r.errs)); return Object.assign({ id: C.newId() }, r.item); };

    // ---- dates
    eq([C.isDate('2026-02-29'), C.isDate('2028-02-29'), C.isDate('2026-13-01'), C.isDate(''), C.isDate(null), C.isDate('2026-1-5')], [false, true, false, false, false, false], 'isDate');
    eq(C.daysBetween('2026-09-12', T), 43, '12 Sep to 25 Oct = 43 days');
    eq(C.daysBetween('2026-03-28', '2026-03-30'), 2, 'summer-time change does not change day counts');
    eq(C.daysBetween('2025-12-31', '2026-01-01'), 1, 'over new year');
    eq([C.addDays('2026-10-25', 7), C.addDays('2026-12-28', 7), C.addMonths('2026-01-31', 1), C.addMonths('2028-01-31', 1), C.addMonths('2026-12-15', 1)],
        ['2026-11-01', '2027-01-04', '2026-02-28', '2028-02-29', '2027-01-15'], 'add days and months');
    eq([C.fmtDate('2026-10-30', T), C.fmtDate('2025-12-01', T), C.fmtDate('2026-09-12', T)], ['Fri 30 Oct', 'Mon 1 Dec 2025', 'Sat 12 Sep'], 'date words');
    eq([C.ago(0), C.ago(1), C.ago(43), C.ago(61), C.ago(400), C.ago(800)], ['today', 'yesterday', '43 days ago', '61 days ago, about 2 months', '400 days ago, about 13 months', '800 days ago, about 2 years'], 'ago words');
    eq([C.span(0), C.span(1), C.span(85)], ['the same day', '1 day', '85 days, about 3 months'], 'span words');

    // ---- the form
    eq(C.readForm(form({}), T).item, { kind: 'lent', what: 'Drill', who: 'Bilal', date: '2026-09-12', due: null, note: '', returned: null }, 'lent drill, no date');
    eq(C.readForm(form({ duePreset: 'w1', date: T }), T).item.due, '2026-11-01', '1 week from today');
    eq(C.readForm(form({ duePreset: 'w2', date: '2026-10-20' }), T).item.due, '2026-11-03', '2 weeks counted from the day it was lent');
    eq(C.readForm(form({ duePreset: 'm1', date: '2026-01-31' }), T).item.due, '2026-02-28', '1 month from 31 Jan');
    eq(C.readForm(form({ duePreset: 'custom', dueDate: '2026-10-30' }), T).item.due, '2026-10-30', 'custom date');
    eq(C.readForm(form({ duePreset: 'custom', dueDate: '' }), T).errs, { due: 'Pick the give-back date, or choose "No date".' }, 'custom date missing');
    eq(Object.keys(C.readForm(form({ duePreset: 'custom', dueDate: '2026-09-01' }), T).errs), ['due'], 'give-back before lent');
    eq(C.readForm(form({ duePreset: 'custom', dueDate: '2026-09-12' }), T).ok, true, 'give back the same day is fine');
    eq(Object.keys(C.readForm(form({ what: '  ', who: '' }), T).errs), ['what', 'who'], 'blank what and who');
    eq(C.readForm(form({ kind: 'borrowed', what: '' }), T).errs.what, 'Type what you borrowed, such as Cake tin.', 'borrowed wording');
    eq(C.readForm(form({ date: '2026-10-26' }), T).errs.date, 'This date is after today. Pick today or an earlier day.', 'future date');
    eq(Object.keys(C.readForm(form({ date: '' }), T).errs), ['date'], 'no date');
    eq(C.readForm(form({ what: '  Cordless\tdrill \n with  bits ', who: '​Bilal  Khan ' }), T).item.what, 'Cordless drill with bits', 'pasted text tidied');
    eq(C.readForm(form({ who: '​Bilal  Khan ' }), T).item.who, 'Bilal Khan', 'pasted name tidied');
    eq(C.readForm(form({ what: 'x'.repeat(200) }), T).item.what.length, 80, 'very long name cut to 80');
    eq(C.readForm(form({ note: 'line 1\r\n\r\n\r\n\r\nline 2' }), T).item.note, 'line 1\n\nline 2', 'note keeps line breaks, not many');
    eq(C.readForm(form({ returned: '2026-10-25' }), T).item.returned, '2026-10-25', 'returned today');
    eq(Object.keys(C.readForm(form({ returned: '2026-09-01' }), T).errs), ['returned'], 'returned before lent');
    eq(Object.keys(C.readForm(form({ returned: '2026-10-27' }), T).errs), ['returned'], 'returned after today');

    eq(Object.keys(C.readForm(form({ returned: '' }), T).errs), ['returned'], 'cleared return day asks for it');

    // ---- status and words
    const drill = item({});
    eq(C.words(drill, T), { line: 'With Bilal · lent Sat 12 Sep (43 days ago)', tag: 'No give-back date', state: 'open', held: 43 }, 'drill with Bilal, 43 days');
    const tin = item({ kind: 'borrowed', what: 'Cake tin', who: 'Aunt Sara', date: '2026-10-20', duePreset: 'custom', dueDate: '2026-10-30' });
    eq(C.words(tin, T), { line: 'From Aunt Sara · borrowed Tue 20 Oct (5 days ago)', tag: 'Give back by Fri 30 Oct · in 5 days', state: 'ok', held: 5 }, 'cake tin, give back Friday');
    const book = item({ what: 'Novel', who: 'Hina', date: '2026-09-26', duePreset: 'w2' });   // due 10 Oct
    eq(C.words(book, T).tag, '15 days late · was due Sat 10 Oct', 'book 15 days late');
    eq(C.words(item({ date: '2026-10-18', duePreset: 'w1' }), T).tag, 'Due back today', 'due back today');
    eq(C.words(item({ kind: 'borrowed', date: '2026-10-18', duePreset: 'w1' }), T).tag, 'Give it back today', 'give it back today');
    eq(C.words(item({ date: '2026-10-20', duePreset: 'custom', dueDate: '2026-10-26' }), T), { line: 'With Bilal · lent Tue 20 Oct (5 days ago)', tag: 'Due back Mon 26 Oct · in 1 day', state: 'soon', held: 5 }, 'due tomorrow is soon');
    eq(C.words(item({ date: T }), T).line, 'With Bilal · lent Sun 25 Oct (today)', 'lent today');
    eq(C.words(item({ what: 'Novel', who: 'Hina', date: '2026-08-01', returned: '2026-10-25' }), T), { line: 'Lent to Hina · Sat 1 Aug', tag: 'Got it back Sun 25 Oct, after 85 days, about 3 months', state: 'back', held: 85 }, 'returned after 85 days');
    eq(C.words(item({ kind: 'borrowed', date: T, returned: T }), T).tag, 'Gave it back Sun 25 Oct, after the same day', 'gave back the same day');
    eq(C.words(item({ date: '2025-12-30' }), T).line, 'With Bilal · lent Tue 30 Dec 2025 (299 days ago, about 10 months)', 'last year shows the year');
    // a day later the counts move on (second use the next day)
    eq(C.words(drill, '2026-10-26').line, 'With Bilal · lent Sat 12 Sep (44 days ago)', 'next day is one more day');
    eq(C.words(tin, '2026-10-31').tag, '1 day late · was due Fri 30 Oct', 'after the date it turns late');

    // ---- sorting, summary, people
    const late2 = item({ what: 'Ladder', who: 'Omar', date: '2026-10-01', duePreset: 'w1' });   // due 8 Oct, 17 late
    const today1 = item({ what: 'Charger', who: 'Ali', date: '2026-10-18', duePreset: 'w1' });
    const soon = item({ what: 'Pot', who: 'Aunt Sara', date: '2026-10-24', duePreset: 'custom', dueDate: '2026-10-27' });
    const old = item({ what: 'Tent', who: 'Bilal', date: '2026-01-05' });
    eq(C.sortOpen([drill, soon, old, book, today1, late2], T).map(i => i.what), ['Ladder', 'Novel', 'Charger', 'Pot', 'Tent', 'Drill'], 'most urgent first');
    const back = item({ what: 'Umbrella', who: 'bilal', date: '2026-07-01', returned: '2026-07-03' });
    const back2 = item({ what: 'Jacket', who: 'Hina', date: '2026-08-01', returned: '2026-09-03' });
    eq(C.sortBack([back, back2]).map(i => i.what), ['Jacket', 'Umbrella'], 'returned newest first');
    eq(C.summary([drill, tin, book, today1, back], T), { lent: 3, borrowed: 1, lentLate: 1, borrowedLate: 0, lentToday: 1, borrowedToday: 0, back: 1 }, 'summary counts');
    eq(C.summary([], T), { lent: 0, borrowed: 0, lentLate: 0, borrowedLate: 0, lentToday: 0, borrowedToday: 0, back: 0 }, 'empty summary');
    const ppl = C.people([drill, old, back, tin, book]);
    eq(ppl.map(p => [p.name, p.lent, p.borrowed, p.back]), [['Bilal', 2, 0, 1], ['Aunt Sara', 0, 1, 0], ['Hina', 1, 0, 0]], 'people, names joined ignoring case');
    eq(C.personLine(ppl[0]), 'Bilal has 2 things of yours. 1 loan finished before.', 'person line');
    eq(C.personLine({ name: 'Aunt Sara', lent: 1, borrowed: 1, back: 0 }), "Aunt Sara has 1 thing of yours; you have 1 thing of Aunt Sara's.", 'both ways');
    eq(C.personLine({ name: 'Ali', lent: 0, borrowed: 0, back: 2 }), 'Nothing open with Ali. 2 loans finished before.', 'all finished');
    eq(C.same(' Bilal ', 'bilal'), true, 'same name');

    // ---- messages
    eq(C.reminderText(drill, T), 'Hi Bilal, hope you are well! Just a friendly reminder that you still have my Drill (since Sat 12 Sep). Could I have it back when you get a chance? Thank you!', 'reminder, no date');
    eq(C.reminderText(book, T), 'Hi Hina, hope you are well! Just a friendly reminder that you still have my Novel (since Sat 26 Sep). We said Sat 10 Oct, so could I have it back soon? Thank you!', 'reminder, late');
    eq(C.reminderText(soon, T).includes('Could I have it back by Tue 27 Oct?'), true, 'reminder, due later');
    eq(C.listText([drill, tin, book, back], T), 'THINGS I LENT (2)\n- Novel: With Hina · lent Sat 26 Sep (29 days ago). 15 days late · was due Sat 10 Oct.\n- Drill: With Bilal · lent Sat 12 Sep (43 days ago). No give-back date.\n\nTHINGS I BORROWED (1)\n- Cake tin: From Aunt Sara · borrowed Tue 20 Oct (5 days ago). Give back by Fri 30 Oct · in 5 days.', 'copy list');
    eq(C.listText([], T), 'THINGS I LENT (0)\n- none\n\nTHINGS I BORROWED (0)\n- none', 'empty list');
    const cv = C.csv([drill, item({ what: '=SUM(A1)', who: 'A, "B"', note: 'two\nlines' })], T).split('\r\n');
    eq(cv[0], 'Lent or borrowed,What,Who,Date,Give back by,Returned on,Days,Status,Note', 'csv header');
    eq(cv.length >= 3 && cv.some(l => l.startsWith('Lent,"\'=SUM(A1)","A, ""B"""')), true, 'csv quotes and blocks formulas');

    // ---- search
    eq([C.matches(drill, 'bil'), C.matches(drill, 'drill bilal'), C.matches(drill, 'ladder'), C.matches(drill, '  ')], [true, true, false, true], 'search');

    // ---- restore: corrupt or odd saved data
    eq(C.restore(null).items, [], 'null');
    eq(C.restore('x').items, [], 'string');
    eq(C.restore({ items: 'no' }).items, [], 'items not a list');
    const r = C.restore({ items: [null, 5, { kind: 'stolen', what: 'a', who: 'b', date: T }, { kind: 'lent', what: '', who: 'b', date: T }, { kind: 'lent', what: 'a', who: 'b', date: '2026-02-30' },
        { id: 'abcd1234', kind: 'lent', what: ' Drill ', who: 'Bilal', date: '2026-09-12', due: '2026-01-01', returned: 'soon', note: 7, hasPhoto: 'yes' },
        { id: 'abcd1234', kind: 'borrowed', what: 'Tin', who: 'Sara', date: '2026-09-12', due: '2026-10-01', returned: '2026-10-02' }] });
    eq(r.items.length, 2, 'only valid items kept');
    eq([r.items[0].id, r.items[0].what, r.items[0].due, r.items[0].returned, r.items[0].note, r.items[0].hasPhoto], ['abcd1234', 'Drill', null, null, '7', false], 'bad fields made safe');
    eq([r.items[1].id !== 'abcd1234', r.items[1].due, r.items[1].returned], [true, '2026-10-01', '2026-10-02'], 'duplicate id replaced');
    eq([C.isPhoto('data:image/jpeg;base64,AAAA'), C.isPhoto('javascript:alert(1)'), C.isPhoto('data:image/svg+xml;base64,AAAA'), C.isPhoto(5)], [true, false, false, false], 'photo check');
    eq(C.localToday(new Date(2026, 9, 25, 23, 59)), '2026-10-25', 'local today just before midnight');
    eq(C.localToday(new Date(2026, 9, 26, 0, 0)), '2026-10-26', 'local today just after midnight');

    const summaryLine = (failed ? 'FAILED ' + failed + ' of ' + (pass + failed) : 'ALL ' + pass + ' LOGIC CHECKS PASSED');
    if (typeof document !== 'undefined') { const pre = document.createElement('pre'); pre.textContent = out.concat(summaryLine).join('\n'); document.body.appendChild(pre); }
    else { out.forEach(l => console.log(l)); console.log(summaryLine); if (failed) process.exitCode = 1; }
})();
