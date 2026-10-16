// Checks for core.js. Run: node weight-tracker-with-goal-date/tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.WTCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; if (!ok) out.push('FAIL ' + name + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); };
    const E = (d, kg, id) => ({ id: id || d + kg, d, g: Math.round(kg * 1000), note: '' });

    // ---- units and formatting
    eq('kg to g', C.toG(82.4, 'kg'), 82400);
    eq('lb to g', C.toG(181.6, 'lb'), 82372);                 // 181.6 x 453.59237 = 82372.37
    eq('g back to lb', C.inUnit(82372, 'lb'), 181.6);
    eq('fmt kg', C.fmtW(82400, 'kg'), '82.4 kg');
    eq('fmt lb', C.fmtW(82400, 'lb'), '181.7 lb');            // 82400 / 453.59237 = 181.66
    eq('fmt st', C.fmtW(82400, 'st'), '12 st 13.7 lb');       // 181.66 lb = 12 x 14 + 13.66
    eq('fmt st 13.96 rounds to next stone', C.fmtW(C.toG(181.96, 'lb'), 'st'), '13 st 0.0 lb');
    eq('diff down kg', C.fmtDiff(-3400, 'kg'), '−3.4 kg');
    eq('diff up lb', C.fmtDiff(454, 'lb'), '+1.0 lb');
    eq('diff zero', C.fmtDiff(20, 'kg'), '0.0 kg');
    eq('diff st small', C.fmtDiff(-C.toG(7.5, 'lb'), 'st'), '−7.5 lb');
    eq('diff st big', C.fmtDiff(-C.toG(16.5, 'lb'), 'st'), '−1 st 2.5 lb');
    eq('pace kg', C.fmtPace(-550, 'kg'), '0.6 kg');
    eq('pace small kg', C.fmtPace(-40, 'kg'), '0.04 kg');
    eq('pace st shows lb', C.fmtPace(-454, 'st'), '1.0 lb');

    // ---- typing
    eq('parse plain', C.parseWeight('82.4', 'kg'), { g: 82400 });
    eq('parse comma', C.parseWeight('82,4', 'kg'), { g: 82400 });
    eq('parse with spaces', C.parseWeight('  82.4  ', 'kg'), { g: 82400 });
    eq('parse lb suffix in kg mode', C.parseWeight('181 lb', 'kg'), { g: C.toG(181, 'lb') });
    eq('parse kg suffix in lb mode', C.parseWeight('82.4kg', 'lb'), { g: 82400 });
    eq('parse stone text', C.parseWeight('12 st 6', 'kg'), { g: C.toG(174, 'lb') });
    eq('parse stone text lb', C.parseWeight('12st 6.5lb', 'st'), { g: C.toG(174.5, 'lb') });
    eq('parse blank', C.parseWeight('', 'kg').err, 'Type your weight.');
    eq('parse letters', C.parseWeight('abc', 'kg').err, 'Type a number, for example 82.4.');
    eq('parse zero', C.parseWeight('0', 'kg').err, 'A weight must be more than 0.');
    eq('parse negative', C.parseWeight('-5', 'kg').err, 'A weight must be more than 0.');
    eq('parse typo 824', C.parseWeight('824', 'kg'), { err: 'Type a weight from 20 to 350 kg.', hint: 'Did you mean 82.4?' });
    eq('parse huge', C.parseWeight('99999999', 'kg').err, 'Type a weight from 20 to 350 kg.');
    eq('parse too low', C.parseWeight('5', 'kg').hint, '');
    eq('parse lb range', C.parseWeight('40', 'lb').err, 'Type a weight from 44 to 772 lb.');
    eq('stone boxes', C.parseStone('12', '6.5'), { g: C.toG(174.5, 'lb') });
    eq('stone lb only', C.parseStone('', '150'), { err: 'Pounds must be under 14 (14 lb is 1 stone).' });
    eq('stone part stone', C.parseStone('12.5', '').err, 'Type whole stones, and the rest in pounds (for example 12 st 6.5 lb).');
    eq('stone blank', C.parseStone('', '').err, 'Type your weight.');
    eq('height cm', C.parseHeight('172', '', 'cm'), { mm: 1720 });
    eq('height ft in', C.parseHeight('5', '7', 'ftin'), { mm: 1702 });          // 67 in x 25.4 = 1701.8
    eq('height blank', C.parseHeight('', '', 'cm'), { blank: true });
    eq('height bad', C.parseHeight('17', '', 'cm').err, 'Type a height from 50 to 250 cm.');
    eq('height inches 12', C.parseHeight('5', '12', 'ftin').err, 'Inches must be from 0 to under 12.');
    eq('height parts', C.heightParts(1702), { ft: 5, inch: 7 });

    // ---- BMI: 82.4 kg at 1.72 m = 82.4 / 2.9584 = 27.85 -> 27.9, overweight
    eq('bmi', C.bmi(82400, 1720), { v: 27.9, cat: 'over' });
    eq('bmi healthy edge', C.bmi(C.toG(24.9 * 2.9584, 'kg'), 1720).cat, 'healthy');
    eq('bmi 25 is over', C.bmi(73960, 1720), { v: 25, cat: 'over' });           // 73.96 / 2.9584 = 25.0
    eq('bmi under', C.bmi(50000, 1720).cat, 'under');
    eq('bmi obese', C.bmi(100000, 1720).cat, 'obese');
    eq('bmi no height', C.bmi(82400, null), null);
    eq('healthy range', C.healthyRange(1720), { lo: 54731, hi: 73664 });          // 18.5 x 2.9584 = 54.73, 24.9 x 2.9584 = 73.66

    // ---- dates
    eq('add days over month end', C.addDays('2026-01-31', 1), '2026-02-01');
    eq('add days leap', C.addDays('2028-02-28', 1), '2028-02-29');
    eq('days between', C.daysBetween('2026-10-16', '2027-01-29'), 105);
    eq('bad date', C.isDate('2026-02-30'), false);

    // ---- two weigh-ins on one day are both kept and averaged
    const d2 = C.daily([E('2026-10-01', 80.0), E('2026-10-01', 80.5), E('2026-10-02', 79.9)]);
    eq('daily avg', d2, [{ d: '2026-10-01', g: 80250, n: 2 }, { d: '2026-10-02', g: 79900, n: 1 }]);

    // ---- hand-worked pace and goal date: one weigh-in a week, 0.5 kg less each time
    // slope = -500 g / 7 days; 7-day average = 82.5 (only the last day is inside); 75 - 82.5 = -7.5 kg; 7500 / (500/7) = 105 days
    const weekly = [E('2026-09-25', 84.0), E('2026-10-02', 83.5), E('2026-10-09', 83.0), E('2026-10-16', 82.5)];
    let s = C.stats(weekly, { goalG: 75000 });
    eq('weekly pace', s.pace.perWeek, -500);
    eq('weekly avg7', s.avg7.g, 82500);
    eq('weekly since', s.since, -1500);
    eq('weekly week', s.week.g, -500);                                            // 82.5 now vs 83.0 in the 7 days before
    eq('weekly goal', [s.goal.status, s.goal.days, s.goal.date], ['date', 105, '2027-01-29']);
    // target date 1 Mar 2027: 136 days, 7500 / 136 x 7 = 386 g a week; projected 29 Jan is 31 days early
    s = C.stats(weekly, { goalG: 75000, target: '2027-03-01' });
    eq('target', [s.goal.target.days, s.goal.target.perWeek, s.goal.target.diffDays], [136, -386, 31]);
    s = C.stats(weekly, { goalG: 75000, target: '2026-12-01' });
    eq('target late', s.goal.target.diffDays, -59);
    s = C.stats(weekly, { goalG: 75000, target: '2026-10-16' });
    eq('target passed', s.goal.target.passed, true);

    // ---- the README situation: Ayesha weighs in most mornings from 1 Sep 2026 (85.8 kg)
    // daily = 85.8 - 0.08 a day, with water swings of +0.6, -0.4, +0.2, 0, -0.3, +0.5, -0.6 repeating; she skips every 5th day
    const swing = [0.6, -0.4, 0.2, 0, -0.3, 0.5, -0.6], ay = [];
    for (let i = 0; i <= 45; i++) { if (i % 5 === 4) continue; const kg = Math.round((85.8 - 0.08 * i + (i ? swing[i % 7] : 0)) * 10) / 10; ay.push(E(C.addDays('2026-09-01', i), kg, 'a' + i)); }
    s = C.stats(ay, { goalG: 75000 });
    // worked out separately in Python: day 45 = 85.8 - 3.6 + swing[3] (0) = 82.2
    eq('ayesha last', [s.last.d, s.last.g], ['2026-10-16', 82200]);
    eq('ayesha avg7', [s.avg7.g, s.avg7.days], [82440, 5]);                     // days 40, 41, 42, 43, 45: (83.1 + 81.9 + 83.0 + 82.0 + 82.2) / 5 = 82.44
    eq('ayesha since', s.since, -3600);
    eq('ayesha pace', s.pace.perWeek, -519);                                    // least squares over days 18-45 = -518.6 g a week
    eq('ayesha goal date', [s.goal.status, s.goal.days, s.goal.date], ['date', 101, '2027-01-25']);   // 7440 / 74.09 g a day = 100.4 -> 101 days

    // ---- no goal date when it cannot be estimated
    eq('few weigh-ins', C.stats([E('2026-10-14', 80), E('2026-10-16', 79.8)], { goalG: 75000 }).goal.status, 'nopace');
    eq('short span', C.stats([E('2026-10-10', 80), E('2026-10-12', 79.8), E('2026-10-16', 79.6)], { goalG: 75000 }).pace.none, 'short');
    eq('still', C.stats([E('2026-10-01', 80), E('2026-10-08', 80.02), E('2026-10-16', 80)], { goalG: 75000 }).goal.status, 'still');
    eq('away', C.stats([E('2026-10-01', 80), E('2026-10-08', 80.5), E('2026-10-16', 81)], { goalG: 75000 }).goal.status, 'away');
    eq('far', C.stats([E('2026-10-01', 80), E('2026-10-08', 79.9), E('2026-10-16', 79.8)], { goalG: 50000 }).goal.status, 'far');
    eq('reached', C.stats([E('2026-10-01', 80), E('2026-10-08', 76), E('2026-10-16', 74.8)], { goalG: 75000 }).goal.status, 'reached');
    // gaining weight on purpose: goal above the start
    s = C.stats([E('2026-10-02', 50), E('2026-10-09', 50.5), E('2026-10-16', 51)], { goalG: 55000 });
    eq('gain', [s.goal.dir, s.goal.status, s.goal.date], [1, 'date', '2026-12-11']);   // 4 kg / (1 kg / 14 days) = 56 days
    eq('gain reached', C.stats([E('2026-10-02', 50), E('2026-10-16', 56)], { goalG: 55000 }).goal.status, 'reached');
    eq('goal equals start', C.stats([E('2026-10-16', 75)], { goalG: 75000 }).goal.status, 'reached');
    eq('no goal', C.stats([E('2026-10-16', 75)], {}).goal, undefined);
    eq('empty', C.stats([], { goalG: 75000 }), { empty: true });
    eq('one weigh-in', [C.stats([E('2026-10-16', 75)], {}).week, C.stats([E('2026-10-16', 75)], {}).since], [null, 0]);
    // only weigh-ins older than 28 days: no pace
    eq('old data', C.stats([E('2026-01-01', 90), E('2026-01-08', 89), E('2026-01-15', 88), E('2026-10-16', 80)], { goalG: 75000 }).goal.status, 'nopace');

    // ---- saved data is checked
    eq('clean bad', C.clean({ people: 'x' }), null);
    eq('clean empty people', C.clean({ people: [] }), null);
    const cp = C.clean({ people: [{ id: 'p1', name: 'A'.repeat(99), unit: 'zz', heightMm: 99999, goalG: 'x', target: '2026-13-01', range: '7',
        entries: [{ id: 'e1', d: '2026-10-01', g: 80000 }, { id: 'e1', d: '2026-10-02', g: 80000 }, { d: 'bad', g: 1 }, { d: '2026-10-03', g: 5 }, null] }], current: 'nope' });
    eq('clean person', [cp.current, cp.people[0].name.length, cp.people[0].unit, cp.people[0].heightMm, cp.people[0].goalG, cp.people[0].target, cp.people[0].range, cp.people[0].entries.length],
        ['p1', 40, 'kg', null, null, null, '90', 1]);
    eq('sort newest first, later typed first within a day', C.sortEntries([E('2026-10-01', 80, 'x'), E('2026-10-02', 81, 'y'), E('2026-10-02', 81.5, 'z')]).map(e => e.id), ['z', 'y', 'x']);
    eq('csv cell', [C.csvCell('a,b'), C.csvCell('=SUM(A1)'), C.csvCell('plain')], ['"a,b"', '"\'=SUM(A1)"', 'plain']);

    const msg = (fail ? out.join('\n') + '\n' : '') + pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined' && document.getElementById('out')) document.getElementById('out').textContent = msg;
    else { console.log(msg); if (fail && typeof process !== 'undefined') process.exitCode = 1; }
})();
