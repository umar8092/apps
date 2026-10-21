// Logic checks for core.js. Expected percentiles were worked out separately from the full daily WHO tables (L, M, S for every day)
// with the WHO formula, so they also check the every-7-days tables and the in-between values. Run: node tests.js  (or open test.html)
(function () {
    const C = typeof module === 'object' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.GrowthCore;
    let pass = 0; const fails = [];
    const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(name + ': got ' + g + ', want ' + w); };
    const near = (name, got, want, tol) => { if (typeof got === 'number' && Math.abs(got - want) <= tol) pass++; else fails.push(name + ': got ' + got + ', want ' + want + ' ± ' + tol); };
    const T = '2026-10-21';
    const ali = { id: 1, name: 'Ali', sex: 1, birth: '2026-04-03', weeks: 0, m: [
        { id: 2, d: '2026-04-03', weight: 3.4, length: 50.5, head: 34.5 }, { id: 3, d: '2026-05-01', weight: 4.6, length: 55 },
        { id: 4, d: '2026-07-03', weight: 6.6, length: 63.5, head: 41 }, { id: 5, d: '2026-10-05', weight: 7.4, length: 67.5, head: 43.5 }] };
    const P = (k, sex, day, x) => C.percentile(C.zScore(k, sex, day, x));

    // dates and ages
    eq('diffDays', C.diffDays('2026-04-03', '2026-10-05'), 185);
    eq('monthsBetween day before', C.monthsBetween('2026-04-03', '2026-10-02'), 5);
    eq('monthsBetween same day', C.monthsBetween('2026-04-03', '2026-10-03'), 6);
    eq('addMonths end of month', C.addMonths('2026-01-31', 1), '2026-02-28');
    eq('age birth day', C.ageWords('2026-04-03', '2026-04-03'), 'newborn (day of birth)');
    eq('age 9 days', C.ageWords('2026-04-03', '2026-04-12'), '9 days');
    eq('age 4 weeks', C.ageWords('2026-04-03', '2026-05-01'), '4 weeks');
    eq('age 6 weeks 3 days', C.ageWords('2026-04-03', '2026-05-18'), '6 weeks 3 days');
    eq('age 3 months', C.ageWords('2026-04-03', '2026-07-03'), '3 months');
    eq('age 6 months', C.ageWords('2026-04-03', '2026-10-05'), '6 months');
    eq('age 6 months 2 weeks', C.ageWords('2026-04-03', T), '6 months 2 weeks');
    eq('age 2 years 3 months', C.ageWords('2024-07-01', T), '2 years 3 months');
    eq('age 3 years', C.ageWords('2023-10-21', T), '3 years');
    eq('age before birth', C.ageWords(T, '2026-10-20'), 'before birth');

    // corrected age: born at 34 weeks is 6 weeks (42 days) early, used until 730 days
    const sara = { id: 6, name: 'Sara', sex: 2, birth: '2026-08-10', weeks: 34, m: [] };
    eq('corrected age', C.chartAge(sara, '2026-10-20'), { days: 29, corrected: true, real: 71, early: 42 });
    eq('before the due date', C.chartAge(sara, '2026-09-01').days, -20);
    eq('no correction after 2 years', C.chartAge(sara, '2028-08-11'), { days: 732, corrected: false, real: 732, early: 0 });
    eq('37 weeks not corrected', C.chartAge(Object.assign({}, sara, { weeks: 37 }), '2026-10-20').corrected, false);
    eq('before due: no percentile', C.assess(sara, '2026-09-01', 'weight', 2.5).stop, 'beforeDue');
    near('Sara 3.3 kg at corrected 29 days', C.assess(sara, '2026-10-20', 'weight', 3.3).p, 5.41, 0.05);

    // typed numbers and units
    eq('readNum', [C.readNum('7.4'), C.readNum(' 7,4 '), C.readNum('.5'), C.readNum('7.40')], [7.4, 7.4, 0.5, 7.4]);
    eq('readNum bad', [C.readNum(''), C.readNum('-3'), C.readNum('7.4kg'), C.readNum('1.2.3'), C.readNum('abc')].map(Number.isNaN), [true, true, true, true, true]);
    eq('lb oz to kg', C.kgFromLbOz(16, 5), 7.399);
    eq('kg to lb oz', C.lbOz(7.4), { lb: 16, oz: 5 });
    eq('kg to lb oz rounding up to a pound', C.lbOz(0.4536 * 2 - 0.0005), { lb: 2, oz: 0 });
    eq('in to cm', C.cmFromIn(26.5), 67.31);
    eq('cm to in', C.inFromCm(67.5), 26.6);
    eq('show weight', [C.showWeight(7.4, 'metric'), C.showWeight(3.25, 'metric'), C.showWeight(7.4, 'imperial')], ['7.4 kg', '3.25 kg', '16 lb 5 oz']);
    eq('show length', [C.showLen(67.5, 'metric'), C.showLen(67.5, 'imperial')], ['67.5 cm', '26.6 in']);
    eq('value checks', [C.checkValue('weight', 7.4), C.checkValue('weight', 74).startsWith('A weight of 74 kg is not possible'), C.checkValue('length', 0).startsWith('A length of 0 cm'), C.checkValue('head', NaN)], ['', true, true, 'Type a number, such as 43.5.']);
    eq('day checks', [C.checkDay(ali, '2026-10-22', T), C.checkDay(ali, '2026-04-02', T), C.checkDay(ali, '', T), C.checkDay(ali, T, T)],
        ['The day cannot be in the future.', 'That day is before Ali was born (3 Apr 2026).', 'Pick the day it was measured.', '']);

    // the normal curve
    near('phi 0', C.phi(0), 0.5, 1e-9);
    near('phi 1.96', C.phi(1.96), 0.9750021, 1e-6);
    near('probit 0.97', C.probit(0.97), 1.8807936, 1e-6);
    near('probit 0.03', C.probit(0.03), -1.8807936, 1e-6);
    // WHO tables: medians from the WHO tables
    near('boy median at birth', C.lms('weight', 1, 0).M, 3.3464, 1e-9);
    near('girl median length 1 year', C.lms('length', 2, 365).M, 74.0, 0.05);
    near('boy 3rd percentile at 183 days', C.valueAt('weight', 1, 183, 3), 6.44, 0.01);
    near('boy 97th percentile at 183 days', C.valueAt('weight', 1, 183, 97), 9.73, 0.01);
    eq('outside 0 to 1826 days', [C.lms('weight', 1, -1), C.lms('weight', 1, 1827)], [null, null]);
    near('z of the median is 0', C.zScore('weight', 1, 0, 3.3464), 0, 1e-9);
    // beyond 3 SD (WHO rule): worked from the daily table
    near('very heavy newborn z', C.zScore('weight', 1, 0, 5.5), 3.7678, 0.001);
    near('very light newborn z', C.zScore('weight', 1, 0, 1.8), -3.7396, 0.001);

    // Ali (boy, born 3 Apr 2026): percentiles from the full daily tables
    near('Ali birth weight', P('weight', 1, 0, 3.4), 54.34, 0.05);
    near('Ali birth length', P('length', 1, 0, 50.5), 62.75, 0.05);
    near('Ali birth head', P('head', 1, 0, 34.5), 51.20, 0.05);
    near('Ali 4 weeks weight', P('weight', 1, 28, 4.6), 65.07, 0.05);
    near('Ali 3 months length (day 91)', P('length', 1, 91, 63.5), 84.77, 0.05);
    near('Ali 6 months weight (day 185, between table rows)', P('weight', 1, 185, 7.4), 25.21, 0.05);
    near('Ali 6 months length', P('length', 1, 185, 67.5), 45.37, 0.05);
    near('Ali 6 months head', P('head', 1, 185, 43.5), 53.74, 0.05);
    near('girl 1 year 9.5 kg', P('weight', 2, 365, 9.5), 68.68, 0.05);
    eq('words', [C.pctWords(25.21), C.pctWords(0.62), C.pctWords(0.04), C.pctWords(99.95), C.pctWords(99.42), C.pctWords(1.4), C.pctWords(11.6), C.pctWords(22.4), C.pctWords(3)],
        ['the 25th percentile', 'the 0.6th percentile', 'below the 0.1st percentile', 'above the 99.9th percentile', 'the 99.4th percentile', 'the 1st percentile', 'the 12th percentile', 'the 22nd percentile', 'the 3rd percentile']);
    eq('ordinals', [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 50, 97].map(C.ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '50th', '97th']);

    // the series and warnings
    const rows = C.series(ali);
    eq('series in date order', rows.map(r => r.m.d), ['2026-04-03', '2026-05-01', '2026-07-03', '2026-10-05']);
    eq('Ali no warnings (62nd to 25th crosses one line)', rows.map(r => Object.keys(r.res).filter(k => r.res[k].flag)), [[], [], [], []]);
    eq('Ali latest words', rows[3].res.weight.words, 'the 25th percentile');
    eq('names', [rows[0].res.length.name, C.kindName('length', 731), C.kindName('head', 10)], ['Length', 'Height', 'Head size']);
    eq('lines crossed', [C.linesCrossed(62, 25), C.linesCrossed(60, 10), C.linesCrossed(10, 60), C.linesCrossed(50, 50), C.linesCrossed(2, 98)], [1, 2, 2, 0, 5]);
    // a weight that drops from about the 62nd to the 10th (worked from the daily table: 9.71) crosses the 50th and 15th: a warning
    const drop = Object.assign({}, ali, { m: ali.m.slice(0, 3).concat({ id: 9, d: '2026-10-05', weight: 6.9 }) });
    const dr = C.series(drop)[3].res.weight;
    eq('crossing two lines', [dr.flag, dr.crossed.n, dr.crossed.since], ['crossDown', 2, '2026-07-03']);
    near('dropped to', dr.p, 9.71, 0.05);
    eq('below the 3rd', C.assess(ali, '2026-10-05', 'weight', 6.2).flag, 'low');
    eq('above the 97th', C.assess(ali, '2026-10-05', 'weight', 10).flag, 'high');
    eq('very far from usual', C.assess(ali, '2026-10-05', 'weight', 20).flag, 'check');
    eq('over 5 years', C.assess(ali, '2031-04-05', 'weight', 19).stop, 'over5');
    eq('exactly 5 years still on the chart', C.assess({ sex: 1, birth: '2021-10-21', weeks: 0 }, '2026-10-21', 'weight', 18.3).p != null, true);
    // two on the same day: both kept, in the order typed
    eq('same day kept', C.series(Object.assign({}, ali, { m: [{ id: 2, d: T, weight: 7 }, { id: 1, d: T, weight: 7.1 }] })).map(r => r.m.id), [1, 2]);

    // the table for the doctor
    const tb = C.table(ali, 'metric', T).split('\n');
    eq('table head', tb[0], 'Ali (boy, born 3 Apr 2026)');
    eq('table last row', tb[6], '5 Oct 2026, 6 months: Weight 7.4 kg (25th percentile), Length 67.5 cm (45th percentile), Head size 43.5 cm (54th percentile)');
    eq('table first row', tb[3], '3 Apr 2026, newborn (day of birth): Weight 3.4 kg (54th percentile), Length 50.5 cm (63rd percentile), Head size 34.5 cm (51st percentile)');
    eq('table imperial', C.table(ali, 'imperial', T).split('\n')[6], '5 Oct 2026, 6 months: Weight 16 lb 5 oz (25th percentile), Length 26.6 in (45th percentile), Head size 17.1 in (54th percentile)');
    eq('table corrected', C.table(Object.assign({}, sara, { m: [{ id: 1, d: '2026-10-20', weight: 3.3 }] }), 'metric', T).split('\n')[3], '20 Oct 2026, 2 months 1 week (corrected 4 weeks 1 day): Weight 3.3 kg (5th percentile)');

    // saved state
    eq('null', C.validate(null), null);
    eq('no children list', C.validate({ children: 3 }), null);
    eq('empty', C.validate({ children: [] }).children.length, 0);
    const v = C.validate({ units: 'imperial', active: 99, children: [ali, { id: 1, name: 'dup', sex: 1, birth: '2026-01-01' }, { id: 7, name: 'x', sex: 3, birth: '2026-01-01' }, { id: 8, name: '', sex: 2, birth: '2026-02-30' },
        { id: 10, name: '  Zara\n', sex: 2, birth: '2025-01-01', weeks: 50, m: [{ id: 11, d: '2024-12-31', weight: 3 }, { id: 12, d: '2025-02-01', weight: 999, length: 55 }, { id: 13, d: '2025-03-01', weight: 'x' }, { id: 12, d: '2025-04-01', weight: 5 }] }] });
    eq('validate keeps good, drops bad', [v.children.map(c => c.name), v.units, v.active, v.children[1].weeks, v.children[1].m, v.nextId], [['Ali', 'Zara'], 'imperial', 1, 0, [{ id: 12, d: '2025-02-01', length: 55 }], 13]);

    const out = pass + ' passed, ' + fails.length + ' failed' + (fails.length ? '\n' + fails.join('\n') : '');
    if (typeof document !== 'undefined') { const pre = document.createElement('pre'); pre.textContent = out; document.body.appendChild(pre); } else { console.log(out); if (fails.length) process.exit(1); }
})();
