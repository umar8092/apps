// Logic checks for core.js. Run: node tests.js  (or open test.html in a browser)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.PetCore;
    let pass = 0, failed = 0; const out = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); } };
    const T = '2026-10-25';   // a Sunday
    let nid = 100;
    const care = o => Object.assign({ id: nid++, pet: 1, name: 'Thing', n: 1, unit: 'month', last: '', due: '', history: [], note: '' }, o);

    // ---- words and dates
    eq(C.everyText(1, 'month'), 'every month', 'every month');
    eq(C.everyText(3, 'month'), 'every 3 months', 'every 3 months');
    eq(C.everyText(12, 'month'), 'every year', '12 months = every year');
    eq(C.everyText(1, 'year'), 'every year', 'every year');
    eq(C.everyText(3, 'year'), 'every 3 years', 'every 3 years');
    eq(C.everyText(2, 'week'), 'every 2 weeks', 'every 2 weeks');
    eq(C.everyText(1, 'once'), 'just once', 'just once');
    eq(C.addMonths('2026-01-31', 1), '2026-02-28', '31 Jan + 1 month');
    eq(C.addMonths('2028-01-31', 1), '2028-02-29', 'leap year');
    eq(C.addEvery('2026-01-12', 1, 'year'), '2027-01-12', '+1 year');
    eq(C.addEvery('2028-02-29', 1, 'year'), '2029-02-28', '29 Feb + 1 year');
    eq(C.addEvery('2026-12-30', 1, 'week'), '2027-01-06', 'week over new year');
    eq(C.shortDate(T, T), 'Sun 25 Oct', 'short date this year');
    eq(C.shortDate('2027-01-12', T), 'Tue 12 Jan 2027', 'short date next year');
    eq(C.clock('2026-10-25T08:05'), '8:05 am', 'clock morning');
    eq(C.clock('2026-10-25T00:15'), '12:15 am', 'clock just after midnight');
    eq(C.clock('2026-10-25T12:00'), '12:00 pm', 'clock noon');
    eq(C.clock('2026-10-25T18:30'), '6:30 pm', 'clock evening');
    eq(C.age('2023-08-20', T), '3 years 2 months old', 'age 3y2m');
    eq(C.age('2024-10-25', T), '2 years old', 'age exactly 2 years');
    eq(C.age('2026-10-04', T), '3 weeks old', 'age in weeks');
    eq(C.age('2026-06-30', T), '3 months old', 'age in months, day not reached');
    eq(C.age('2026-10-25', T), '0 days old', 'born today');
    eq(C.age('2026-11-01', T), '', 'future birthday shows nothing');
    eq(C.age('', T), '', 'no birthday');

    // ---- the situation: Ayesha's cat Milo
    const worm = care({ name: 'Worming', n: 3, unit: 'month', last: '2026-07-19', history: ['2026-04-19', '2026-07-19'] });
    const flea = care({ name: 'Flea treatment', n: 1, unit: 'month', last: '2026-09-29' });
    const vac = care({ name: 'Vaccine booster', n: 1, unit: 'year', last: '2026-01-12' });
    const nails = care({ name: 'Nail trim', n: 4, unit: 'week', last: '2026-09-27' });
    eq(C.nextDue(worm, T), '2026-10-19', 'worming due date');
    eq(C.dueLine(worm, T), '6 days late (was due Mon 19 Oct)', 'worming late');
    eq(C.urgency(worm, T), 'late', 'worming urgency');
    eq(C.dueLine(flea, T), 'Due Thu 29 Oct (in 4 days)', 'flea soon');
    eq(C.urgency(flea, T), 'soon', 'flea urgency');
    eq(C.dueLine(vac, T), 'Due Tue 12 Jan 2027 (in 2 months)', 'vaccine next year');
    eq(C.urgency(vac, T), 'later', 'vaccine urgency');
    eq(C.dueLine(nails, T), 'Due today', 'nails today');
    eq(C.urgency(nails, T), 'now', 'nails urgency');
    eq(C.dueLine(care({ last: '2026-09-26' }), T), 'Due tomorrow, Mon 26 Oct', 'due tomorrow');
    eq(C.subLine(worm, T), 'Repeat every 3 months · last done Sun 19 Jul (3 months ago)', 'sub line');
    eq(C.historyLine(worm, T), 'Before: Sun 19 Apr', 'history line');
    const nodate = care({ name: 'Brushing' });
    eq(C.dueLine(nodate, T), 'Due now (no date recorded yet)', 'no date = due now');
    eq(C.urgency(nodate, T), 'late', 'no date urgency');
    eq(C.subLine(nodate, T), 'Repeat every month · no date recorded', 'no date sub');
    // done: the next date counts from the real day
    const w2 = C.done(worm, T);
    eq([w2.last, C.nextDue(w2, T), w2.history], [T, '2027-01-25', ['2026-04-19', '2026-07-19', T]], 'done late: next counts from today');
    eq(worm.last, '2026-07-19', 'done does not change the old item');
    const w3 = C.done(worm, '2026-07-01');
    eq([w3.last, w3.history], ['2026-07-19', ['2026-04-19', '2026-07-01', '2026-07-19']], 'an older day only goes into history');
    eq(C.done(worm, '2026-07-19').history, ['2026-04-19', '2026-07-19'], 'same day not doubled');
    // just once (an appointment)
    const appt = care({ name: 'Dental check', unit: 'once', n: 1, due: '2026-10-29' });
    eq(C.dueLine(appt, T), 'Appointment Thu 29 Oct (in 4 days)', 'appointment soon');
    eq(C.dueLine(care({ unit: 'once', due: T }), T), 'Appointment today', 'appointment today');
    eq(C.dueLine(care({ unit: 'once', due: '2026-10-26' }), T), 'Appointment tomorrow, Mon 26 Oct', 'appointment tomorrow');
    eq(C.dueLine(care({ unit: 'once', due: '2026-10-20' }), T), 'Appointment was Tue 20 Oct (5 days ago): tap Done or change the date', 'appointment passed');
    eq(C.urgency(care({ unit: 'once', due: '2026-10-20' }), T), 'late', 'passed appointment is late');
    eq(C.subLine(appt, T), 'One-off, not repeated', 'appointment sub');
    eq(C.sortCare([vac, flea, worm, nails], T).map(c => c.name), ['Worming', 'Nail trim', 'Flea treatment', 'Vaccine booster'], 'sorted most urgent first');

    // ---- meals
    const milo = { id: 1, name: 'Milo', kind: 'Cat', meals: 2, birthday: '', note: '', archived: '' };
    const feeds = [{ pet: 1, t: '2026-10-24T23:50' }, { pet: 1, t: '2026-10-25T08:10' }, { pet: 2, t: '2026-10-25T07:00' }];
    eq(C.feedLine(milo, feeds, T), 'Fed today at 8:10 am (1 of 2)', 'fed once, yesterday 23:50 not counted');
    eq(C.feedLine(milo, [], T), 'Not fed yet today (2 meals a day)', 'not fed yet');
    eq(C.feedLine(Object.assign({}, milo, { meals: 1 }), [], T), 'Not fed yet today (1 meal a day)', 'one meal wording');
    eq(C.feedLine(Object.assign({}, milo, { meals: 0 }), feeds, T), '', 'meals not logged');
    eq(C.feedLine(milo, feeds.concat([{ pet: 1, t: '2026-10-25T06:55' }, { pet: 1, t: '2026-10-25T19:00' }]), T), 'Fed today at 6:55 am, 8:10 am, 7:00 pm (3 of 2)', 'times sorted, more than planned shown');
    eq(C.trimFeeds([{ pet: 1, t: '2026-10-10T08:00' }, { pet: 1, t: '2026-10-11T08:00' }], T).length, 1, 'meals older than 14 days dropped');

    // ---- money: whole cents
    eq(C.parseMoney('2,500'), { cents: 250000 }, 'money with comma');
    eq(C.parseMoney('12.5'), { cents: 1250 }, 'money one decimal');
    eq(C.parseMoney('0.10'), { cents: 10 }, 'ten cents');
    eq(C.parseMoney(''), { cents: null }, 'blank cost is fine');
    eq(C.parseMoney('0'), { cents: 0 }, 'zero cost');
    eq(!!C.parseMoney('12.505').error, true, 'three decimals refused');
    eq(!!C.parseMoney('-5').error, true, 'negative refused');
    eq(!!C.parseMoney('abc').error, true, 'text refused');
    eq(!!C.parseMoney('99999999999').error, true, 'huge refused');
    eq(C.money(250000, 'Rs'), 'Rs 2,500', 'Rs format');
    eq(C.money(1250, '$'), '$12.50', '$ format');
    eq(C.money(123456789, ''), '1,234,567.89', 'no symbol');
    eq(C.money(0, '£'), '£0', 'zero');
    const pets = [milo, { id: 2, name: 'Bruno', kind: 'Dog', meals: 2 }];
    const visits = [
        { id: 1, pet: 1, date: '2026-10-12', what: 'Vaccines', cents: 350000 },
        { id: 2, pet: 2, date: '2026-10-03', what: 'Ear infection', cents: 900000 },
        { id: 3, pet: 1, date: '2026-03-02', what: 'Check-up', cents: 200000 },
        { id: 4, pet: 2, date: '2025-12-20', what: 'Neutering', cents: 500000 },
        { id: 5, pet: 2, date: '2026-10-20', what: 'Follow-up', cents: 0 }];
    const tot = C.costTotals(visits, pets, T);
    eq([tot.month, tot.year, tot.all], [1250000, 1450000, 1950000], 'month, year and all totals');
    eq(tot.perPet.map(x => [x.pet.name, x.cents]), [['Milo', 550000], ['Bruno', 900000]], 'per pet this year');
    eq(C.sortVisits(visits).map(v => v.id), [5, 1, 2, 3, 4], 'visits newest first');
    eq(C.costTotals([], pets, T), { month: 0, year: 0, all: 0, perPet: [] }, 'no visits');

    // ---- weight: whole grams
    eq(C.parseWeight('4.5', 'kg'), { g: 4500 }, '4.5 kg');
    eq(C.parseWeight('4,5', 'kg'), { g: 4500 }, '4,5 kg (comma decimal)');
    eq(C.parseWeight('10', 'lb'), { g: 4536 }, '10 lb in grams');
    eq(C.parseWeight('.12', 'kg'), { g: 120 }, 'hamster weight');
    eq(C.parseWeight(' 32.25 ', 'kg'), { g: 32250 }, 'spaces trimmed');
    ['', '0', '-3', 'abc', '200', '1.2.3', '4.5555'].forEach(v => eq(!!C.parseWeight(v, 'kg').error, true, 'bad weight refused: "' + v + '"'));
    eq(!!C.parseWeight('331', 'lb').error, true, 'over 330 lb refused');
    eq(C.weightText(4600, 'kg'), '4.6 kg', 'kg text');
    eq(C.weightText(32000, 'kg'), '32 kg', 'kg whole');
    eq(C.weightText(120, 'kg'), '0.12 kg', 'small kg');
    eq(C.weightText(4536, 'lb'), '10 lb', 'lb round trip');
    eq(C.weightText(4600, 'lb'), '10.1 lb', 'lb text');
    eq(C.weightText(4000, 'lb'), '8.82 lb', 'lb under 10, two decimals');
    eq(C.weightText(20000, 'lb'), '44.1 lb', 'lb one decimal');
    const ws = [{ id: 1, pet: 1, date: '2026-08-12', g: 4300 }, { id: 2, pet: 1, date: '2026-10-12', g: 4600 }, { id: 3, pet: 2, date: '2026-10-01', g: 30000 }];
    eq(C.weightsOf(ws, 1).map(w => w.id), [1, 2], 'weights of one pet');
    eq(C.weightLine(C.weightsOf(ws, 1), 'kg', T), '4.6 kg on Mon 12 Oct (up 0.3 kg since Wed 12 Aug)', 'weight up');
    eq(C.weightLine([ws[1], { id: 9, pet: 1, date: '2026-10-20', g: 4450 }], 'kg', T), '4.45 kg on Tue 20 Oct (down 0.15 kg since Mon 12 Oct)', 'weight down');
    eq(C.weightLine([ws[1], { id: 9, pet: 1, date: '2026-10-20', g: 4600 }], 'kg', T), '4.6 kg on Tue 20 Oct (same as Mon 12 Oct)', 'weight same');
    eq(C.weightLine([ws[1]], 'kg', T), '4.6 kg on Mon 12 Oct', 'one weight');
    eq(C.weightLine([], 'kg', T), '', 'no weight');

    // ---- the whole day
    const state = C.validate({ v: 1, nextId: 50, pets: [Object.assign({}, milo), { id: 2, name: 'Bruno', kind: 'Dog', meals: 2 }, { id: 3, name: 'Coco', kind: 'Rabbit', archived: '2026-05-01' }],
        care: [Object.assign({}, worm, { id: 10 }), Object.assign({}, flea, { id: 11 }), Object.assign({}, vac, { id: 12 }), Object.assign({}, nails, { id: 13, pet: 2, name: 'Nail trim' }),
            { id: 14, pet: 3, name: 'Vaccine', n: 1, unit: 'year', last: '2025-01-01' }],
        feeds: [{ pet: 1, t: '2026-10-25T08:10' }, { pet: 2, t: '2026-10-25T07:30' }, { pet: 2, t: '2026-10-25T18:00' }],
        weights: ws, visits });
    const day = C.todayList(state, T);
    eq(day.due.map(x => x.pet.name + ': ' + x.care.name), ['Milo: Worming', 'Bruno: Nail trim'], 'due today, archived pet left out');
    eq(day.next.pet.name + ': ' + day.next.care.name, 'Milo: Flea treatment', 'next thing');
    eq(day.hungry.map(h => h.pet.name + ' ' + h.fed), ['Milo 1'], 'meals still to give');
    const sheet = C.petSheet(state, state.pets[0], T, 'kg', 'Rs');
    eq(sheet.split('\n').slice(0, 3), ['Milo (Cat)', 'Meals: 2 meals a day', 'Weight: 4.6 kg on Mon 12 Oct (up 0.3 kg since Wed 12 Aug)'], 'care sheet top');
    eq(sheet.includes('- Worming: 6 days late (was due Mon 19 Oct), every 3 months, last done Sun 19 Jul 2026'), true, 'care sheet care line');
    eq(sheet.includes('- Mon 12 Oct 2026: Vaccines, Rs 3,500'), true, 'care sheet visit line');
    eq(C.allText(state, T, 'kg', '').startsWith('Pet care, Sun 25 Oct 2026\n\nMilo (Cat)'), true, 'all care sheets');
    eq(C.allText(state, T, 'kg', '').includes('Coco'), false, 'archived pet not in all care sheets');
    eq(C.allText(C.emptyState(), T, 'kg', ''), '', 'nothing to share');
    const cal = C.ics(state, T, 'https://x/');
    eq(cal.count, 4, 'calendar: 4 reminders (archived pet left out)');
    eq(cal.text.includes('RRULE:FREQ=YEARLY;INTERVAL=1'), true, 'yearly rule');
    eq(cal.text.includes('RRULE:FREQ=MONTHLY;INTERVAL=3'), true, 'every 3 months rule');
    eq(cal.text.includes('DTSTART;VALUE=DATE:20261025'), true, 'late item starts today');
    eq(cal.text.includes('SUMMARY:Milo: Worming'), true, 'summary has the pet name');
    const cal2 = C.ics(Object.assign({}, state, { care: [{ id: 20, pet: 1, name: 'Old appt', n: 1, unit: 'once', due: '2026-10-01', last: '', history: [] }, { id: 21, pet: 1, name: 'Dentist, check', n: 1, unit: 'once', due: '2026-11-02', last: '', history: [] }] }), T, 'u');
    eq([cal2.count, cal2.text.includes('RRULE'), cal2.text.includes('SUMMARY:Milo: Dentist\\, check')], [1, false, true], 'appointments: past skipped, no repeat, comma escaped');

    // ---- forms
    eq(C.readPet({ name: '  Milo  ', kind: 'Cat', meals: '2' }, T, [], null).pet, { name: 'Milo', kind: 'Cat', birthday: '', meals: 2, note: '' }, 'pet form');
    eq(!!C.readPet({ name: '   ' }, T, [], null).errors.name, true, 'pet name needed');
    eq(!!C.readPet({ name: 'A', birthday: '2026-11-01' }, T, [], null).errors.birthday, true, 'future birthday refused');
    eq(C.readPet({ name: 'A', kind: 'Dragon', meals: '99' }, T, [], null).pet.kind + C.readPet({ name: 'A', meals: '99' }, T, [], null).pet.meals, 'Other0', 'bad kind and meals cleaned');
    eq(C.readPet({ name: 'milo' }, T, [milo], null).warn !== '', true, 'same name warns');
    eq(C.readPet({ name: 'Milo' }, T, [milo], 1).warn, '', 'editing itself does not warn');
    eq(C.readPet({ name: 'x'.repeat(90) }, T, [], null).pet.name.length, 40, 'long name cut');
    eq(C.readCare({ name: 'Worming', n: '3', unit: 'month', last: '2026-07-19' }, T).care, { name: 'Worming', n: 3, unit: 'month', last: '2026-07-19', due: '', note: '' }, 'care form');
    eq(C.readCare({ name: 'Worming', n: '3', unit: 'month', last: '' }, T).care.last, '', 'not sure is allowed');
    eq(Object.keys(C.readCare({ name: '', n: '0', unit: 'month', last: '2026-11-01' }, T).errors).sort(), ['last', 'n', 'name'], 'care form errors');
    eq(!!C.readCare({ name: 'A', n: '37', unit: 'month' }, T).errors.n, true, 'too many months');
    eq(!!C.readCare({ name: 'A', n: '2.5', unit: 'week' }, T).errors.n, true, 'decimal interval refused');
    eq(!!C.readCare({ name: 'A', n: '6', unit: 'year' }, T).errors.n, true, 'too many years');
    eq(C.readCare({ name: 'A', n: '5', unit: 'year' }, T).care.n, 5, '5 years allowed');
    eq(C.readCare({ name: 'Dentist', n: '', unit: 'once', due: '2026-10-29' }, T).care, { name: 'Dentist', n: 1, unit: 'once', last: '', due: '2026-10-29', note: '' }, 'appointment form');
    eq(!!C.readCare({ name: 'Dentist', unit: 'once', due: '' }, T).errors.due, true, 'appointment needs a date');
    eq(C.readVisit({ date: '2026-10-12', what: 'Vaccines', cost: '3,500', note: ' ok ' }, T).visit, { date: '2026-10-12', what: 'Vaccines', cents: 350000, note: 'ok' }, 'visit form');
    eq(C.readVisit({ date: T, what: 'Check-up', cost: '' }, T).visit.cents, 0, 'visit without cost');
    eq(Object.keys(C.readVisit({ date: '2026-10-26', what: ' ', cost: '1.234' }, T).errors).sort(), ['cost', 'date', 'what'], 'visit form errors');
    eq(C.readWeight({ date: T, weight: '4.6', unit: 'kg' }, T).weight, { date: T, g: 4600 }, 'weight form');
    eq(Object.keys(C.readWeight({ date: '2026-10-30', weight: '0', unit: 'kg' }, T).errors).sort(), ['date', 'weight'], 'weight form errors');

    // ---- saved data
    eq(C.validate(null), null, 'null');
    eq(C.validate({}), null, 'no pets list');
    eq(C.validate('x'), null, 'string');
    const v = C.validate({ nextId: 2, pets: [{ id: 1, name: 'Milo', kind: 'Cat', meals: 2 }, { id: 1, name: 'Dup' }, { id: 5, name: '' }, { id: 'x', name: 'Bad' }, null],
        care: [{ id: 7, pet: 1, name: 'Worm', n: 3, unit: 'month', last: '2026-13-01', history: ['2026-01-01', 'bad', '2026-01-01'] }, { id: 8, pet: 99, name: 'Orphan', n: 1, unit: 'month' },
            { id: 9, pet: 1, name: 'Bad unit', n: 1, unit: 'hour' }, { id: 10, pet: 1, name: 'Appt', unit: 'once' }, { id: 7, pet: 1, name: 'Dup id', n: 1, unit: 'day' }],
        feeds: [{ pet: 1, t: '2026-10-25T08:10' }, { pet: 1, t: '2026-10-25T25:10' }, { pet: 9, t: '2026-10-25T08:10' }, { pet: 1, t: 5 }],
        weights: [{ id: 20, pet: 1, date: '2026-10-01', g: 4500 }, { id: 21, pet: 1, date: '2026-10-01', g: -4 }, { id: 22, pet: 1, date: '2026-10-01', g: 4.5 }],
        visits: [{ id: 30, pet: 1, date: '2026-10-01', what: 'Check', cents: -100 }, { id: 31, pet: 1, date: 'nope', what: 'x' }] });
    eq(v.pets.map(p => p.id + p.name), ['1Milo'], 'pets cleaned');
    eq(v.care.map(c => [c.id, c.last, c.history]), [[7, '', ['2026-01-01']]], 'care cleaned');
    eq(v.feeds.length, 1, 'feeds cleaned');
    eq(v.weights.map(w => w.id), [20], 'weights cleaned');
    eq(v.visits.map(x => [x.id, x.cents]), [[30, 0]], 'visits cleaned, bad cost becomes 0');
    eq(v.nextId, 31, 'nextId above every id');
    eq(JSON.stringify(C.validate(JSON.parse(JSON.stringify(state)))), JSON.stringify(state), 'save and load round trip');
    eq(Object.keys(C.PRESETS).every(k => C.KINDS.includes(k) && C.PRESETS[k].every(p => p.n >= 1 && p.n <= C.MAX[p.unit])), true, 'presets within limits');

    const msg = pass + ' passed, ' + failed + ' failed' + (out.length ? '\n' + out.join('\n') : '');
    if (typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function') { console.log(msg); if (failed) process.exitCode = 1; }
    else { const pre = document.createElement('pre'); pre.textContent = msg; document.body.appendChild(pre); }
})();
