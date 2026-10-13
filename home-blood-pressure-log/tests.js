// Checks for core.js. Run: node home-blood-pressure-log/tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.BPCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; if (!ok) out.push('FAIL ' + name + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); };

    // ---- the doctor's 7-day check from the README: day 1 (7 Oct) is left out, then 6 days x 4 readings
    const WEEK = [
        ['2026-10-07', [148, 95], [146, 93], [142, 90], [140, 88]],
        ['2026-10-08', [142, 90], [140, 88], [136, 86], [134, 84]],
        ['2026-10-09', [144, 91], [141, 89], [135, 85], [133, 84]],
        ['2026-10-10', [139, 88], [137, 87], [132, 83], [130, 82]],
        ['2026-10-11', [141, 89], [139, 88], [134, 85], [132, 83]],
        ['2026-10-12', [143, 90], [140, 88], [136, 86], [133, 84]],
        ['2026-10-13', [140, 89], [138, 87], [133, 84], [131, 83]]];
    const R = []; let k = 0;
    WEEK.forEach(([d, a, b, c, e]) => [['07:10', a], ['07:12', b], ['21:00', c], ['21:02', e]].forEach(([tm, v]) => R.push({ id: 'r' + (k++), t: d + 'T' + tm, sys: v[0], dia: v[1], pulse: null, arm: '', note: '' })));
    const s = C.summary(R, { from: '2026-10-07', to: '2026-10-13', skipFirst: true, guide: 'nice' });
    eq('week n', s.n, 24); eq('week days', s.days, 6); eq('week skipped', s.skipped, { day: '2026-10-07', n: 4 });
    eq('week avg', [s.avg.sys, s.avg.dia], [137, 86]);            // 3283/24 = 136.79, 2073/24 = 86.38
    eq('week morning', [s.morning.sys, s.morning.dia], [140, 89]); // 1684/12 = 140.33, 1064/12 = 88.67
    eq('week evening', [s.evening.sys, s.evening.dia], [133, 84]); // 1599/12 = 133.25, 1009/12 = 84.08
    eq('week level nice', s.level, 's1');
    eq('week highest', [s.highest.sys, s.highest.dia, s.highest.t], [144, 91, '2026-10-09T07:10']);
    eq('week lowest', [s.lowest.sys, s.lowest.dia, s.lowest.t], [130, 82, '2026-10-10T21:02']);
    eq('week first/last', [s.first, s.last], ['2026-10-08', '2026-10-13']);
    const s2 = C.summary(R, { from: '2026-10-07', to: '2026-10-13', skipFirst: false, guide: 'aha' });
    eq('week with day 1', [s2.n, s2.avg.sys, s2.avg.dia, s2.skipped], [28, 138, 87, null]);   // 3859/28 = 137.8, 2439/28 = 87.1
    eq('week aha level', s2.level, 's1');
    eq('week counts aha', s2.counts, { s2: 12, s1: 16 });
    eq('target met', C.summary(R, { from: '2026-10-08', to: '2026-10-13', target: { sys: 140, dia: 90 } }).target, { met: true, sysOk: true, diaOk: true });
    eq('target not met', C.summary(R, { from: '2026-10-08', to: '2026-10-13', target: { sys: 135, dia: 85 } }).target, { met: false, sysOk: false, diaOk: false });
    eq('target equal is not under', C.targetCheck({ sys: 140, dia: 80 }, { sys: 140, dia: 90 }), { met: false, sysOk: false, diaOk: true });
    eq('skip first with one day only keeps it', C.summary(R, { from: '2026-10-13', to: '2026-10-13', skipFirst: true }).n, 4);
    eq('empty period', C.summary(R, { from: '2026-11-01', to: '2026-11-07' }).n, 0);
    eq('no readings', C.summary([], {}).n, 0);
    eq('all readings', C.summary(R, {}).n, 28);

    // averages round half up with whole numbers
    eq('avg half up', C.average([{ sys: 120, dia: 80 }, { sys: 121, dia: 81 }]), { sys: 121, dia: 81, pulse: null, n: 2 });
    eq('avg down', C.average([{ sys: 120, dia: 80 }, { sys: 120, dia: 80 }, { sys: 121, dia: 81 }]), { sys: 120, dia: 80, pulse: null, n: 3 });
    eq('avg pulse only where given', C.average([{ sys: 120, dia: 80, pulse: 70 }, { sys: 120, dia: 80, pulse: null }, { sys: 120, dia: 80, pulse: 75 }]).pulse, 73);

    // ---- levels: UK and Europe home guide
    eq('nice 134/84', C.level(134, 84, 'nice'), 'normal');
    eq('nice 135/70', C.level(135, 70, 'nice'), 's1');
    eq('nice 120/85', C.level(120, 85, 'nice'), 's1');
    eq('nice 149/94', C.level(149, 94, 'nice'), 's1');
    eq('nice 150/80', C.level(150, 80, 'nice'), 's2');
    eq('nice 130/95', C.level(130, 95, 'nice'), 's2');
    eq('nice 179/119', C.level(179, 119, 'nice'), 's2');
    eq('nice 180/100', C.level(180, 100, 'nice'), 'severe');
    eq('nice 160/120', C.level(160, 120, 'nice'), 'severe');
    eq('nice 89/70', C.level(89, 70, 'nice'), 'low');
    eq('nice 110/59', C.level(110, 59, 'nice'), 'low');
    eq('nice 90/60', C.level(90, 60, 'nice'), 'normal');
    // US guide
    eq('aha 119/79', C.level(119, 79, 'aha'), 'normal');
    eq('aha 120/79', C.level(120, 79, 'aha'), 'elevated');
    eq('aha 129/79', C.level(129, 79, 'aha'), 'elevated');
    eq('aha 125/80', C.level(125, 80, 'aha'), 's1');
    eq('aha 130/70', C.level(130, 70, 'aha'), 's1');
    eq('aha 139/89', C.level(139, 89, 'aha'), 's1');
    eq('aha 140/70', C.level(140, 70, 'aha'), 's2');
    eq('aha 118/90', C.level(118, 90, 'aha'), 's2');
    eq('aha 180/120 not severe', C.level(180, 120, 'aha'), 's2');
    eq('aha 181/100 severe', C.level(181, 100, 'aha'), 'severe');
    eq('aha 150/121 severe', C.level(150, 121, 'aha'), 'severe');
    eq('aha 85/55 low', C.level(85, 55, 'aha'), 'low');
    eq('aha 125/55 elevated beats low', C.level(125, 55, 'aha'), 'elevated');
    eq('names', [C.levelText('s1', 'nice'), C.levelText('elevated', 'aha'), C.levelText('severe', 'aha')],
        ['Raised: stage 1 range (135/85 or higher)', 'Elevated (120 to 129 and under 80)', 'Severe (over 180 or over 120)']);
    eq('advice severe', /emergency/.test(C.advice('severe')), true);
    eq('advice normal', C.advice('normal'), '');

    // ---- typing
    eq('reading ok', C.checkReading('128', '82', ''), { reading: { sys: 128, dia: 82, pulse: null } });
    eq('reading with pulse', C.checkReading(' 128 ', '82', '71').reading, { sys: 128, dia: 82, pulse: 71 });
    eq('blank top', Object.keys(C.checkReading('', '82', '').errors), ['sys']);
    eq('blank both', Object.keys(C.checkReading('', '', '').errors), ['sys', 'dia']);
    eq('1200 typo', C.checkReading('1200', '80', '').errors.sys, '1200 is too high for the top number. Did you mean 120?');
    eq('8000 typo', C.checkReading('120', '8000', '').errors.dia, '8000 is too high for the bottom number. Check the number.');
    eq('decimal', /whole number/.test(C.checkReading('120.5', '80', '').errors.sys), true);
    eq('comma decimal', /whole number/.test(C.checkReading('120', '80,5', '').errors.dia), true);
    eq('negative', !!C.checkReading('-120', '80', '').errors.sys, true);
    eq('zero', !!C.checkReading('0', '80', '').errors.sys, true);
    eq('words', !!C.checkReading('abc', '80', '').errors.sys, true);
    eq('1e3', !!C.checkReading('1e3', '80', '').errors.sys, true);
    eq('too low top', /too low/.test(C.checkReading('50', '40', '').errors.sys), true);
    eq('pulse too high', /too high/.test(C.checkReading('120', '80', '400').errors.pulse), true);
    eq('pulse words', !!C.checkReading('120', '80', 'x').errors.pulse, true);
    eq('swapped', C.checkReading('80', '120', ''), { errors: { dia: 'The top number (80) must be bigger than the bottom number (120). Did you swap them?' }, swap: true });
    eq('same', C.checkReading('100', '100', '').swap, false);
    eq('limits ok', C.checkReading('300', '200', '250').reading, { sys: 300, dia: 200, pulse: 250 });
    eq('limits low ok', C.checkReading('60', '30', '30').reading, { sys: 60, dia: 30, pulse: 30 });
    eq('paste 120/80', C.splitPasted('120/80'), { sys: '120', dia: '80', pulse: '' });
    eq('paste 120/80/72', C.splitPasted('120/80/72'), { sys: '120', dia: '80', pulse: '72' });
    eq('paste spaces', C.splitPasted(' 132 84 70 '), { sys: '132', dia: '84', pulse: '70' });
    eq('paste mmHg', C.splitPasted('132/84 mmHg'), { sys: '132', dia: '84', pulse: '' });
    eq('paste with words', C.splitPasted('132/84 pulse 70'), { sys: '132', dia: '84', pulse: '70' });
    eq('paste one number', C.splitPasted('132'), null);
    eq('paste text', C.splitPasted('hello'), null);

    // ---- days: after midnight belongs to the evening before
    eq('logDay 07:10', C.logDay('2026-10-13T07:10'), '2026-10-13');
    eq('logDay 00:30', C.logDay('2026-10-14T00:30'), '2026-10-13');
    eq('logDay 03:59', C.logDay('2026-03-01T03:59'), '2026-02-28');
    eq('logDay 04:00', C.logDay('2026-10-14T04:00'), '2026-10-14');
    eq('logDay year end', C.logDay('2027-01-01T01:00'), '2026-12-31');
    eq('part 04:00', C.partOfDay('2026-10-13T04:00'), 'morning');
    eq('part 11:59', C.partOfDay('2026-10-13T11:59'), 'morning');
    eq('part 12:00', C.partOfDay('2026-10-13T12:00'), 'evening');
    eq('part 00:30', C.partOfDay('2026-10-13T00:30'), 'evening');
    eq('addDays leap', C.addDays('2028-02-28', 1), '2028-02-29');
    eq('addDays back over year', C.addDays('2027-01-03', -6), '2026-12-28');
    eq('daysBetween', C.daysBetween('2026-10-07', '2026-10-13'), 6);
    eq('valid stamp', C.validStamp('2026-10-13T07:10'), true);
    eq('bad stamp 31 Feb', C.validStamp('2026-02-31T07:10'), false);
    eq('bad stamp 24:00', C.validStamp('2026-10-13T24:00'), false);
    eq('bad stamp text', C.validStamp('yesterday'), false);
    eq('after-midnight reading in the evening before', C.summary([{ id: 'a', t: '2026-10-14T00:30', sys: 130, dia: 80 }], { from: '2026-10-13', to: '2026-10-13' }).evening.n, 1);
    eq('stamp', C.stamp(new Date(2026, 0, 5, 7, 3)), '2026-01-05T07:03');

    // ---- saved data
    const good = { people: [{ id: 'p1', name: 'Sara', guide: 'aha', target: { sys: 140, dia: 90 }, readings: [{ id: 'a', t: '2026-10-13T07:10', sys: 130, dia: 85, pulse: 70, arm: 'L', note: 'after coffee' }] }], current: 'p1', period: '14', skipFirst: true };
    const c = C.clean(good, 'nice');
    eq('clean keeps', [c.people[0].name, c.people[0].guide, c.people[0].target, c.people[0].readings.length, c.period, c.skipFirst, c.current], ['Sara', 'aha', { sys: 140, dia: 90 }, 1, '14', true, 'p1']);
    eq('clean null', C.clean(null), null);
    eq('clean string', C.clean('{bad'), null);
    eq('clean no people', C.clean({ people: [] }), null);
    const bad = C.clean({ people: [{ name: '<b>x</b>', guide: 'zzz', target: { sys: 80, dia: 90 }, readings: [
        { t: '2026-10-13T07:10', sys: 80, dia: 120 }, { t: 'x', sys: 120, dia: 80 }, { t: '2026-10-13T07:10', sys: 120.5, dia: 80 }, { t: '2026-10-13T07:10', sys: '120', dia: 80 },
        { t: '2026-10-13T08:00', sys: 120, dia: 80, pulse: 999, arm: 'X', note: 'a\u0000b' }, null, 5] }], current: 'nope', period: 'year' }, 'aha');
    eq('clean drops bad readings', bad.people[0].readings.map(r => [r.sys, r.dia, r.pulse, r.arm, r.note]), [[120, 80, null, '', 'a b']]);
    eq('clean name kept as text', bad.people[0].name, '<b>x</b>');
    eq('clean bad guide uses default', bad.people[0].guide, 'aha');
    eq('clean bad target', bad.people[0].target, null);
    eq('clean bad period', bad.period, '7');
    eq('clean bad current', bad.current, bad.people[0].id);
    eq('clean sorts', C.clean({ people: [{ readings: [{ id: 'b', t: '2026-10-13T21:00', sys: 120, dia: 80 }, { id: 'a', t: '2026-10-13T07:00', sys: 121, dia: 80 }] }] }).people[0].readings.map(r => r.id), ['a', 'b']);
    eq('clean dup ids', C.clean({ people: [{ readings: [{ id: 'a', t: '2026-10-13T21:00', sys: 120, dia: 80 }, { id: 'a', t: '2026-10-13T07:00', sys: 121, dia: 80 }] }] }).people[0].readings.length, 1);
    eq('clean max people', C.clean({ people: Array(10).fill({ name: 'x' }) }).people.length, C.MAX_PEOPLE);
    eq('clean long note', C.clean({ people: [{ readings: [{ t: '2026-10-13T07:00', sys: 121, dia: 80, note: 'x'.repeat(500) }] }] }).people[0].readings[0].note.length, 200);

    // ---- spreadsheet
    const csv = C.csv([{ t: '2026-10-13T21:00', sys: 181, dia: 100, pulse: null, arm: 'R', note: '=HYPERLINK("x")' }, { t: '2026-10-13T07:10', sys: 130, dia: 85, pulse: 70, arm: 'L', note: 'tired, "late"' }], 'aha');
    eq('csv', csv.split('\r\n'), ['Date,Time,Systolic (top),Diastolic (bottom),Pulse,Arm,Morning or evening,Range,Note',
        '2026-10-13,07:10,130,85,70,Left,Morning,High: stage 1,"tired, ""late"""',
        '2026-10-13,21:00,181,100,,Right,Evening,Severe,"\'=HYPERLINK(""x"")"', '']);

    const msg = (fail ? out.join('\n') + '\n' : '') + pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined' && document.getElementById('out')) document.getElementById('out').textContent = msg;
    else { console.log(msg); if (fail && typeof process !== 'undefined') process.exitCode = 1; }
})();
