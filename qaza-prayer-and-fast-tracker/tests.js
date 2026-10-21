// Logic checks for core.js, with answers worked out by hand. Run: node tests.js  (or open test.html)
(function () {
    const C = typeof module === 'object' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.QazaCore;
    let pass = 0; const fails = [];
    const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(name + ': got ' + g + ', want ' + w); };
    const person = (owed, log, extra) => Object.assign(C.newPerson(1, 'Ahmed'), { setup: { mode: 'numbers' }, owed: owed, log: log || {} }, extra || {});
    const all = n => ({ fajr: n, dhuhr: n, asr: n, maghrib: n, isha: n, witr: n });
    const T = '2026-10-21';

    // dates
    eq('fmtDateY', C.fmtDateY('2026-10-21'), 'Wed 21 Oct 2026');
    eq('addDays over a leap day', C.addDays('2028-02-28', 1), '2028-02-29');
    eq('diffDays a leap year', C.diffDays('2024-01-01', '2025-01-01'), 366);
    eq('isIso rejects 31 Apr', C.isIso('2026-04-31'), false);
    eq('addYears 29 Feb to a normal year', C.addYears('2004-02-29', 1), '2005-02-28');
    eq('dayAtAge 12', C.dayAtAge('1996-03-15', 12), '2008-03-15');
    eq('dayAtAge bad age', C.dayAtAge('1996-03-15', -1), null);

    // typed numbers
    eq('readInt comma', C.readInt('1,204'), 1204);
    eq('readInt spaces', C.readInt(' 4 309 '), 4309);
    eq('readInt blank', Number.isNaN(C.readInt('')), true);
    eq('readInt negative', Number.isNaN(C.readInt('-5')), true);
    eq('readInt decimal', Number.isNaN(C.readInt('2.5')), true);
    eq('readInt text', Number.isNaN(C.readInt('ten')), true);
    eq('fmt groups', [C.fmt(0), C.fmt(999), C.fmt(1204), C.fmt(25854), C.fmt(1250000)], ['0', '999', '1,204', '25,854', '1,250,000']);
    eq('cleanText pasted', C.cleanText('  Ammi\n\tJaan ' + 'x'.repeat(50), 30), 'Ammi Jaan ' + 'x'.repeat(20));

    // owed from dates: both days count
    eq('one day', C.owedFromDates('2019-01-01', '2019-01-01', 0, T).days, 1);
    eq('a whole year', C.owedFromDates('2019-01-01', '2019-12-31', 0, T).days, 365);
    eq('a leap year', C.owedFromDates('2020-01-01', '2020-12-31', 0, T).days, 366);
    // Ahmed: 15 Mar 2008 (age 12) to 31 Dec 2019 = 11 years (4,017 days with 2012 and 2016) + 291 days, plus the first day = 4,309
    eq('Ahmed 15 Mar 2008 to 31 Dec 2019', C.owedFromDates('2008-03-15', '2019-12-31', 0, T).days, 4309);
    eq('leave out 700', C.owedFromDates('2008-03-15', '2019-12-31', 700, T), { span: 4309, days: 3609 });
    eq('leave out everything', C.owedFromDates('2019-01-01', '2019-01-10', 10, T).error, 'leave');
    eq('last before first', C.owedFromDates('2019-02-01', '2019-01-31', 0, T).error, 'to');
    eq('last day in the future', C.owedFromDates('2019-01-01', '2026-10-22', 0, T).error, 'to');
    eq('last day today is fine', C.owedFromDates('2026-10-21', '2026-10-21', 0, T).days, 1);
    eq('blank first day', C.owedFromDates('', '2019-01-01', 0, T).error, 'from');
    eq('blank last day', C.owedFromDates('2019-01-01', '', 0, T).error, 'to');
    eq('over 100 years', C.owedFromDates('1900-01-01', '2026-01-01', 0, T).error, 'from');

    // counting
    let p = person(all(10));
    eq('kinds with Witr', C.kinds(p).length, 6);
    eq('kinds without Witr', C.kinds(Object.assign({}, p, { witr: false })), ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
    eq('owed total', C.owedTotal(p), 60);
    C.addOne(p, 'fajr', T); C.addOne(p, 'fajr', T);
    eq('two Fajr', [C.doneOf(p, 'fajr'), C.leftOf(p, 'fajr'), C.dayCount(p, T, 'fajr')], [2, 8, 2]);
    eq('full day', C.fullDay(p, T), 6);
    eq('after full day', [C.leftOf(p, 'fajr'), C.leftOf(p, 'isha'), C.dayPrayers(p, T), C.leftTotal(p)], [7, 9, 8, 52]);
    eq('take back today', C.takeBack(p, 'fajr', T), T);
    eq('took back', C.doneOf(p, 'fajr'), 2);
    // take back from an earlier day when today has none
    p = person(all(10), { '2026-10-19': { asr: 1 }, '2026-10-20': { asr: 2 } });
    eq('take back from the latest day', C.takeBack(p, 'asr', T), '2026-10-20');
    eq('latest day now 1', p.log['2026-10-20'].asr, 1);
    C.takeBack(p, 'asr', T);
    eq('empty day removed', p.log['2026-10-20'], undefined);
    eq('take back the 19th', C.takeBack(p, 'asr', T), '2026-10-19');
    eq('nothing left to take back', C.takeBack(p, 'asr', T), null);
    eq('log empty', p.log, {});
    // cannot go past zero
    p = person({ fajr: 1, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, witr: 0 });
    eq('one Fajr owed', C.addOne(p, 'fajr', T), true);
    eq('no more Fajr', C.addOne(p, 'fajr', T), false);
    eq('zero Dhuhr refused', C.addOne(p, 'dhuhr', T), false);
    eq('full day only what is left', C.fullDay(p, T), 0);
    eq('all done', C.leftTotal(p), 0);

    // finishing: Ahmed owes 4,309 days, 2 days of prayers a day, nothing made up: 4,309 / 2 = 2,154.5, so 2,155 days, today is day 1
    p = person(all(4309));
    let f = C.finishPrayers(p, 2, T);
    eq('Ahmed 2 a day: days', f.days, 2155);
    eq('Ahmed 2 a day: date', f.date, C.addDays(T, 2154));
    eq('1 a day', C.finishPrayers(p, 1, T).days, 4309);
    // Ahmed's month: 18 days of 2 each and 1 of each today: 37 done, 4,272 left; (4,272 + 1 today) / 2 = 2,136.5, so 2,137 days
    const LOG = {};
    for (let i = 1; i <= 20; i++) { const d = '2026-10-' + String(i).padStart(2, '0'); if (i !== 7 && i !== 14) LOG[d] = all(2); }
    LOG[T] = all(1);
    p = person(all(4309), LOG);
    eq('Ahmed left', [C.doneOf(p, 'fajr'), C.leftOf(p, 'fajr'), C.leftTotal(p), C.doneTotal(p)], [37, 4272, 25632, 222]);
    f = C.finishPrayers(p, 2, T);
    eq('Ahmed finish days', f.days, 2137);
    eq('Ahmed finish date', f.date, '2032-08-26');
    eq('finish uses the largest left', C.finishPrayers(person({ fajr: 10, dhuhr: 3, asr: 0, maghrib: 0, isha: 0, witr: 0 }), 3, T).days, 4);
    eq('finish when nothing left', C.finishPrayers(person(all(0)), 2, T).days, 0);
    // pace: 222 prayers over 21 days (1 Oct to 21 Oct) = 222 / 21 / 6 = 1.76 days a day
    const pc = C.pace(p, T);
    eq('pace span', [pc.prayers, pc.span], [222, 21]);
    eq('pace per day', Math.round(pc.perDay * 100) / 100, 1.76);
    eq('no pace without days', C.pace(person(all(5)), T), null);
    // streak with goal 2: today has 6 of 12, so it counts back from yesterday: 20, 19 ... 15 = 6 days (14th missed)
    eq('streak goal 2', C.streak(p, 2, T), 6);
    eq('streak goal 1 counts today', C.streak(p, 1, T), 7);
    eq('streak goal 3', C.streak(p, 3, T), 0);

    // history newest first
    const h = C.history(p);
    eq('history first', [h[0].d, h[0].prayers], [T, 6]);
    eq('history length', h.length, 19);

    // fasts: Ramadan 2017 6 days, 2018 7 days, 3 made up: 10 left; 2 a week: 10 x 7 / 2 = 35 days
    p = person(all(10), { '2026-10-19': { fast: 2 }, '2026-10-20': { fast: 1 } }, { ramadans: [{ id: 1, year: '2017', days: 6 }, { id: 2, year: '2018', days: 7 }] });
    eq('fasts', [C.fastsOwed(p), C.fastsDone(p), C.fastsLeft(p)], [13, 3, 10]);
    eq('fasts finish 2 a week', C.finishFasts(p, 2, T), { weeks: 5, days: 35, date: '2026-11-24' });
    eq('fasts finish every day', C.finishFasts(p, 7, T).date, '2026-10-30');
    eq('fasts are not prayers', C.dayPrayers(p, '2026-10-19'), 0);
    eq('add a fast', C.addOne(p, 'fast', T), true);
    p.log = { x: 1 }; p.ramadans = [{ id: 1, year: '', days: 1 }]; p.log = { [T]: { fast: 1 } };
    eq('no more fasts', C.addOne(p, 'fast', T), false);

    // changing totals
    p = person(all(10), { [T]: { fajr: 4 } });
    eq('total below made up', C.checkOwed(p, all(3), true).error, 'fajr');
    eq('total equal to made up', C.checkOwed(p, Object.assign(all(0), { fajr: 4 }), true), null);
    eq('all zero', C.checkOwed(person(all(0)), all(0), true).error, 'fajr');
    eq('too big', C.checkOwed(p, all(100000), true).error, 'fajr');
    eq('NaN', C.checkOwed(p, Object.assign(all(5), { asr: NaN }), true).error, 'asr');
    eq('Witr ignored when off', C.checkOwed(person(all(0)), { fajr: 5, dhuhr: 5, asr: 5, maghrib: 5, isha: 5, witr: NaN }, false), null);

    // summary text
    p = person(all(4309), LOG, { ramadans: [{ id: 1, year: '2017', days: 6 }] });
    const s = C.summary(p, 2, T);
    eq('summary head', s.split('\n')[0], 'Qaza made up: Ahmed (Wed 21 Oct 2026)');
    eq('summary prayers', s.includes('Prayers: 222 of 25,854 made up, 25,632 left'), true);
    eq('summary fajr', s.includes('  Fajr: 4,272 left of 4,309'), true);
    eq('summary finish', s.includes('At 2 days of prayers a day: finished around Thu 26 Aug 2032'), true);
    eq('summary fasts', s.includes('Fasts: 0 of 6 made up, 6 left'), true);

    // saved state
    eq('empty state valid', C.validate(C.emptyState()).people.length, 1);
    eq('null', C.validate(null), null);
    eq('string', C.validate('x'), null);
    eq('no people', C.validate({ people: [] }), null);
    const bad = C.validate({ people: [{ id: 3, name: '<b>x</b>', owed: { fajr: -1, dhuhr: 5, asr: 'a', witr: 1e9 }, log: { '2026-13-01': { fajr: 1 }, '2026-10-01': { fajr: 2, isha: -3, zzz: 4 } }, ramadans: [{ days: 50 }, { year: 'abcd', days: 3 }], perDay: 0, fastsPerWeek: 99 }], active: 9 });
    eq('bad values dropped', [bad.people[0].owed, bad.people[0].log, bad.people[0].ramadans.length, bad.people[0].ramadans[0].year, bad.people[0].perDay, bad.people[0].fastsPerWeek, bad.active, bad.nextId],
        [{ dhuhr: 5 }, { '2026-10-01': { fajr: 2 } }, 1, '', 1, 2, 3, 4]);
    eq('name kept as text', bad.people[0].name, '<b>x</b>');
    eq('duplicate ids dropped', C.validate({ people: [{ id: 1 }, { id: 1 }] }).people.length, 1);
    eq('round trip', JSON.stringify(C.validate(JSON.parse(JSON.stringify(p)) && { people: [p], active: 1, nextId: 2, rid: 2 }).people[0].log), JSON.stringify(p.log));

    const out = pass + ' passed, ' + fails.length + ' failed' + (fails.length ? '\n' + fails.join('\n') : '');
    if (typeof document !== 'undefined') { const pre = document.createElement('pre'); pre.textContent = out; document.body.appendChild(pre); } else { console.log(out); if (fails.length) process.exit(1); }
})();
