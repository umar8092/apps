// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.WHL;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const D = C.parseDate;
    let n = 0;
    const sh = (date, start, end, brk, employer) => Object.assign({ id: 's' + (n++) }, C.validateShift({ date, start, end, brk: brk ? String(brk) : '', employer: employer || 'Cafe' }).shift);
    const st = (shifts, rule, holidays) => ({ v: 1, rule: rule || C.defaultRule(), holidays: holidays || [], shifts });
    const NOW = { day: D('2026-11-04'), min: 12 * 60 }; // Wednesday 4 Nov 2026, 12:00
    const MON = D('2026-11-02');

    // dates
    eq('2 Nov 2026 is a Monday', C.weekday(MON), 1);
    eq('week of Wed 4 Nov starts Mon 2 Nov', C.dayStr(C.periodStart(D('2026-11-04'), 1)), '2026-11-02');
    eq('week of Sun 8 Nov still starts Mon 2 Nov', C.dayStr(C.periodStart(D('2026-11-08'), 1)), '2026-11-02');
    eq('Sunday-start week of Wed 4 Nov', C.dayStr(C.periodStart(D('2026-11-04'), 0)), '2026-11-01');
    eq('bad dates refused', [C.isDate('2026-02-30'), C.isDate(''), C.isDate('1999-01-01'), C.isDate('2028-02-29')], [false, false, false, true]);
    eq('range text', C.fmtRange(MON, MON + 6), 'Mon 2 Nov to Sun 8 Nov 2026');
    eq('summer time week has 7 days', C.periodStart(D('2026-03-31'), 1), D('2026-03-30'));

    // times and durations
    eq('fmt', [C.fmt(0), C.fmt(45), C.fmt(60), C.fmt(90), C.fmt(1200), C.fmt(990)], ['0 min', '45 min', '1 h', '1 h 30 min', '20 h', '16 h 30 min']);
    eq('times', [C.parseTime('9:00'), C.parseTime('18.30'), C.parseTime('24:00'), C.parseTime('7'), C.parseTime('')].map(x => isNaN(x) ? 'bad' : x), [540, 1110, 'bad', 'bad', 'bad']);
    eq('hours typed', [C.parseHours('20', 168).min, C.parseHours('19,5', 168).min, !!C.parseHours('0', 168).error, !!C.parseHours('-3', 168).error, !!C.parseHours('', 168).error, !!C.parseHours('200', 168).error, !!C.parseHours('abc', 168).error], [1200, 1170, true, true, true, true, true]);

    // shift checks
    const v = r => C.validateShift(Object.assign({ date: '2026-11-02', start: '09:00', end: '17:00', brk: '' }, r));
    eq('simple shift ok', v({}).ok, true);
    eq('blank date', Object.keys(v({ date: '' }).errors), ['date']);
    eq('blank start and end', Object.keys(v({ start: '', end: '' }).errors), ['start', 'end']);
    eq('same start and end refused', Object.keys(v({ end: '09:00' }).errors), ['end']);
    eq('break not a number', Object.keys(v({ brk: 'half' }).errors), ['brk']);
    eq('negative break refused', Object.keys(v({ brk: '-30' }).errors), ['brk']);
    eq('break as long as the shift refused', Object.keys(v({ brk: '480' }).errors), ['brk']);
    eq('break 479 ok', v({ brk: '479' }).ok, true);
    eq('blank break is 0, employer optional', v({}).shift.brk + '|' + v({}).shift.employer, '0|');
    eq('long employer cut to 60', v({ employer: 'x'.repeat(300) }).shift.employer.length, 60);
    eq('pasted employer tidied', v({ employer: '  Costa \n Coffee ' }).shift.employer, 'Costa Coffee');

    // hours of one shift
    eq('9 to 5 with 30 min break = 7 h 30', C.net(sh('2026-11-02', '09:00', '17:00', 30)), 450);
    eq('night shift 22:00 to 06:00 = 8 h', C.net(sh('2026-11-02', '22:00', '06:00')), 480);
    eq('night shift split over two days', C.parts(sh('2026-11-02', '22:00', '06:00')).map(p => [C.dayStr(p.day), p.min]), [['2026-11-02', 120], ['2026-11-03', 360]]);
    eq('break comes off the first day first', C.parts(sh('2026-11-02', '23:00', '05:00', 90)).map(p => [C.dayStr(p.day), p.min]), [['2026-11-03', 270]]);
    eq('ending at midnight counts on one day', C.parts(sh('2026-11-02', '18:00', '00:00')).map(p => [C.dayStr(p.day), p.min]), [['2026-11-02', 360]]);
    eq('odd minutes exact', C.net(sh('2026-11-02', '08:07', '13:52', 13)), 332);

    // planned vs worked
    eq('Mon shift is worked on Wed', C.isPlanned(sh('2026-11-02', '09:00', '17:00'), NOW), false);
    eq('Wed 09-17 is still planned at 12:00', C.isPlanned(sh('2026-11-04', '09:00', '17:00'), NOW), true);
    eq('Tue night shift ending Wed 06:00 is worked at 12:00', C.isPlanned(sh('2026-11-03', '22:00', '06:00'), NOW), false);

    // the main situation: UK 20 hours a week, two employers
    const week1 = [sh('2026-11-02', '09:00', '13:00', 0, 'Costa'), sh('2026-11-03', '17:00', '22:00', 30, 'Tesco'), sh('2026-11-04', '18:00', '22:00', 0, 'Costa'), sh('2026-11-07', '10:00', '14:30', 0, 'Tesco')];
    const r1 = C.weekReport(st(week1), MON, NOW);
    eq('UK week: 4 + 4.5 + 4 + 4.5 = 17 h', r1.week.total, 1020);
    eq('UK week: worked 8 h 30, planned 8 h 30', [r1.week.worked, r1.week.planned], [510, 510]);
    eq('UK week: 3 h left', [r1.left, r1.status], [180, 'ok']);
    eq('UK week: by employer', r1.week.byEmp, { Costa: 480, Tesco: 540 });
    const r1b = C.weekReport(st(week1.concat([sh('2026-11-08', '10:00', '14:15', 0, 'Costa')])), MON, NOW);
    eq('extra Sunday shift: over by 1 h 15 (planned)', [r1b.over, r1b.workedOver, r1b.status, r1b.left], [75, 0, 'planned-over', 0]);
    eq('planned shifts listed to drop', r1b.overShifts.map(s => s.date), ['2026-11-04', '2026-11-07', '2026-11-08']);
    const r1c = C.weekReport(st(week1.concat([sh('2026-11-02', '14:00', '19:00')])), MON, NOW);
    eq('22 h with 13 h 30 worked: planned shifts make it over', [r1c.status, r1c.workedOver, r1c.over], ['planned-over', 0, 120]);
    const r1d = C.weekReport(st(week1.concat([sh('2026-11-02', '14:00', '23:00'), sh('2026-11-03', '06:00', '16:00')])), MON, NOW);
    eq('27 h 30 already worked: over by 7 h 30', [r1d.status, r1d.workedOver, r1d.over], ['over', 450, 960]);
    const late = { day: D('2026-11-09'), min: 600 };
    eq('next week: all worked, 1 h 15 over', [C.weekReport(st(week1.concat([sh('2026-11-08', '10:00', '14:15')])), MON, late).status, C.weekReport(st(week1.concat([sh('2026-11-08', '10:00', '14:15')])), MON, late).workedOver], ['over', 75]);
    eq('exactly 20 h is full, not over', C.weekReport(st([sh('2026-11-02', '08:00', '18:00'), sh('2026-11-03', '08:00', '18:00')]), MON, late).status, 'full');
    eq('empty week', [C.weekReport(st([]), MON, NOW).week.total, C.weekReport(st([]), MON, NOW).left, C.weekReport(st([]), MON, NOW).status], [0, 1200, 'ok']);

    // a Sunday night shift goes into two weeks
    const sunNight = [sh('2026-11-08', '22:00', '04:00')];
    eq('Sun 22-04: 2 h in this week', C.weekReport(st(sunNight), MON, late).week.total, 120);
    eq('Sun 22-04: 4 h in next week', C.weekReport(st(sunNight), MON + 7, late).week.total, 240);
    eq('Sun night shift shown in both weeks', [C.weekReport(st(sunNight), MON, late).shifts.length, C.weekReport(st(sunNight), MON + 7, late).shifts.length], [1, 1]);

    // weeks starting Sunday
    const sunRule = Object.assign(C.defaultRule(), { weekStart: 0 });
    eq('Sunday-start week holds Sun 8 Nov in the next week', C.weekReport(st([sh('2026-11-08', '10:00', '12:00')], sunRule), D('2026-11-01'), late).week.total, 0);

    // holidays
    const xmas = [{ id: 'h', from: '2026-12-12', to: '2027-01-10', name: 'Christmas' }];
    const hw = D('2026-12-14');
    const longWeek = [sh('2026-12-14', '08:00', '18:00'), sh('2026-12-15', '08:00', '18:00'), sh('2026-12-16', '08:00', '18:00'), sh('2026-12-17', '08:00', '18:00')];
    eq('UK holiday week: 40 h and no limit', [C.weekReport(st(longWeek, null, xmas), hw, NOW).status, C.weekReport(st(longWeek, null, xmas), hw, NOW).left], ['nolimit', null]);
    eq('week only partly in holiday keeps the term limit', C.weekReport(st([sh('2026-12-07', '08:00', '18:00'), sh('2026-12-12', '08:00', '20:00')], null, xmas), D('2026-12-07'), NOW).week.limit, 1200);
    eq('part holiday flagged', C.weekReport(st([], null, xmas), D('2026-12-07'), NOW).week.part, true);
    const ie = C.ruleFromPreset('ie');
    eq('Ireland holiday week: 40 h limit, full', [C.weekReport(st(longWeek, ie, xmas), hw, NOW).week.limit, C.weekReport(st(longWeek, ie, xmas), hw, NOW).status], [2400, 'full']);
    eq('Ireland term week: 20 h', C.weekReport(st([], ie, xmas), D('2026-11-02'), NOW).week.limit, 1200);
    eq('holiday checks', [C.validateHoliday({ from: '2026-12-20', to: '2026-12-10' }).ok, C.validateHoliday({ from: '', to: '2026-12-10' }).ok, C.validateHoliday({ from: '2026-12-10', to: '2026-12-10' }).ok], [false, false, true]);

    // Australia: 48 hours a fortnight, every fortnight that starts on a Monday
    const au = C.ruleFromPreset('au');
    const auShifts = [];
    for (const d of ['2026-10-26', '2026-10-27', '2026-10-28']) auShifts.push(sh(d, '09:00', '17:00')); // 24 h last week
    for (const d of ['2026-11-02', '2026-11-03']) auShifts.push(sh(d, '09:00', '17:00')); // 16 h this week
    auShifts.push(sh('2026-11-10', '09:00', '19:00')); // 10 h next week
    const ra = C.weekReport(st(auShifts, au), MON, NOW);
    eq('AU: two fortnights checked', ra.windows.map(w => [C.dayStr(w.from), w.total, w.limit]), [['2026-10-26', 2400, 2880], ['2026-11-02', 1560, 2880]]);
    eq('AU: 8 h left this week (from 26 Oct fortnight)', [ra.left, ra.status], [480, 'ok']);
    const ra2 = C.weekReport(st(auShifts.concat([sh('2026-11-05', '09:00', '19:00')]), au), MON, NOW);
    eq('AU: 10 more hours: 2 h over', [ra2.over, ra2.status], [120, 'planned-over']);
    eq('AU: list of fortnights (rolling)', C.allWindows(st(auShifts, au), NOW).map(w => C.dayStr(w.from) + ' ' + w.total), ['2026-11-09 600', '2026-11-02 1560', '2026-10-26 2400', '2026-10-19 1440']);

    // over summary across weeks
    const many = [sh('2026-10-19', '08:00', '20:00'), sh('2026-10-20', '08:00', '20:00'), sh('2026-11-09', '08:00', '20:00'), sh('2026-11-10', '08:00', '20:00')];
    const os = C.overSummary(st(many), NOW);
    eq('one past week over, one planned week over', [os.worked.map(w => C.dayStr(w.from)), os.planned.map(w => C.dayStr(w.from))], [['2026-10-19'], ['2026-11-09']]);

    // overlap (duplicate entry)
    eq('overlap found', C.overlaps(sh('2026-11-02', '09:00', '13:00'), sh('2026-11-02', '12:00', '15:00')), true);
    eq('back to back is not overlap', C.overlaps(sh('2026-11-02', '09:00', '13:00'), sh('2026-11-02', '13:00', '15:00')), false);
    eq('night shift overlaps next morning', C.overlaps(sh('2026-11-02', '22:00', '06:00'), sh('2026-11-03', '05:00', '09:00')), true);

    // text out
    const txt = C.weekText(st(week1), r1, NOW);
    eq('copy text has the total', txt.includes('Total this week: 17 h (8 h 30 min worked, 8 h 30 min planned)'), true);
    eq('copy text lists employers', txt.includes('Costa: 8 h') && txt.includes('Tesco: 9 h'), true);
    eq('copy text marks planned', txt.includes('Sat 7 Nov, 10:00 to 14:30, 4 h 30 min, Tesco [planned]'), true);
    eq('night shift line', C.shiftLine(sh('2026-11-02', '22:00', '06:00', 30, 'Amazon')), 'Mon 2 Nov, 22:00 to 06:00 (next day), 7 h 30 min (30 min unpaid break), Amazon');
    const c = C.csv(st([sh('2026-11-02', '09:00', '17:00', 30, '=cmd, "Ltd"')]));
    eq('CSV safe and quoted', c.split('\r\n')[1], '2026-11-02,Mon,"\'=cmd, ""Ltd""",09:00,17:00,30,7.50,450,');
    eq('rule text', C.ruleText(C.ruleFromPreset('au')).text, '48 h a fortnight in term time, no limit in official holidays');
    eq('rule text Ireland', C.ruleText(C.ruleFromPreset('ie')).text, '20 h a week in term time, 40 h a week in official holidays');

    // saved data
    eq('corrupt data refused', [C.sanitize(null), C.sanitize('x'), C.sanitize([])], [null, null, null]);
    const san = C.sanitize({ rule: { preset: 'au', limit: 2880, period: 14, weekStart: 9, holiday: null }, holidays: [{ from: '2026-12-01', to: '2026-11-01' }, { from: '2026-12-01', to: '2026-12-31', name: 'Xmas' }], shifts: [{ id: 'a', date: '2026-11-02', start: '09:00', end: '17:00', brk: 30 }, { id: 'a', date: '2026-11-03', start: '09:00', end: '17:00' }, { date: 'bad', start: '1', end: '2' }, 'junk'] });
    eq('sanitize keeps good rows only', [san.rule.period, san.rule.weekStart, san.holidays.length, san.shifts.length], [14, 1, 1, 2]);
    eq('sanitize makes ids unique', san.shifts[0].id !== san.shifts[1].id, true);
    eq('bad rule falls back to default', C.sanitize({ rule: { limit: -5 } }).rule, C.defaultRule());

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') { document.getElementById('out').textContent = summary + '\n\n' + out.join('\n'); }
    else { console.log(out.filter(l => l.startsWith('FAIL')).join('\n')); console.log(summary); if (fail) process.exitCode = 1; }
})();
