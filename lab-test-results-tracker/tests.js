// Checks for core.js. Run: node lab-test-results-tracker/tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.LabCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; if (!ok) out.push('FAIL ' + name + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); };
    const date = d => { const [y, m, dd] = d.split('-').map(Number); return dd + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ' ' + y; };

    // ---- typing a result
    eq('plain', C.parseValue('6.4'), { v: 6.4, q: '' });
    eq('comma decimal', C.parseValue('6,4'), { v: 6.4, q: '' });
    eq('less than', C.parseValue('<5'), { v: 5, q: '<' });
    eq('less than space', C.parseValue('< 0.5'), { v: 0.5, q: '<' });
    eq('greater or equal', C.parseValue('>=90'), { v: 90, q: '≥' });
    eq('words', C.parseValue('less than 10'), { v: 10, q: '<' });
    eq('thousands', C.parseValue('250,000'), { v: 250000, q: '' });
    eq('thousands 1,500', C.parseValue('1,500'), { v: 1500, q: '' });
    eq('leading zero comma is decimal', C.parseValue('0,450'), { v: 0.45, q: '' });
    eq('european thousands', C.parseValue('1.500,5'), { v: 1500.5, q: '' });
    eq('dot only start', C.parseValue('.8'), { v: 0.8, q: '' });
    eq('zero', C.parseValue('0'), { v: 0, q: '' });
    eq('blank', C.parseValue('  '), { empty: true });
    eq('letters', !!C.parseValue('abc').error, true);
    eq('two dots', !!C.parseValue('6.4.1').error, true);
    eq('negative refused', !!C.parseValue('-2').error, true);
    eq('negative allowed for own tests', C.parseValue('-2', true), { v: -2, q: '' });
    eq('huge', !!C.parseValue('123456789').error, true);
    eq('float noise', C.parseValue('0.1').v + C.parseValue('0.2').v === 0.30000000000000004, true);

    // ---- ranges as printed on reports
    eq('range dash', C.normRange('70-99'), '70–99');
    eq('range en dash spaces', C.normRange('4.0 – 5.6'), '4.0–5.6');
    eq('range to', C.normRange('0.4 to 4.0'), '0.4–4.0');
    eq('range comma decimals', C.normRange('0,4-4,0'), '0.4–4.0');
    eq('range under', C.normRange('<200'), '<200');
    eq('range words under', C.normRange('under 200'), '<200');
    eq('range up to', C.normRange('up to 5.6'), '≤5.6');
    eq('range over', C.normRange('>40'), '>40');
    eq('range at least', C.normRange('>= 60'), '≥60');
    eq('range or more', C.normRange('60 or more'), '≥60');
    eq('range big', C.normRange('150,000-400,000'), '150000–400000');
    eq('range blank', C.parseRange(''), { range: null });
    eq('range reversed', !!C.parseRange('99-70').error, true);
    eq('range junk', !!C.parseRange('normal').error, true);
    eq('range words', C.rangeWords(C.parseRange('<200').range), 'under 200');
    eq('range words 2', C.rangeWords(C.parseRange('>=60').range), '60 or more');

    // ---- in or out of range (both ends of a "70-99" range are normal; "<200" means 200 is high)
    eq('in', C.status(85, '', '70–99'), 'ok');
    eq('edge low in', C.status(70, '', '70–99'), 'ok');
    eq('edge high in', C.status(99, '', '70–99'), 'ok');
    eq('high', C.status(100, '', '70–99'), 'high');
    eq('low', C.status(69.9, '', '70–99'), 'low');
    eq('under 200: 199', C.status(199, '', '<200'), 'ok');
    eq('under 200: 200', C.status(200, '', '<200'), 'high');
    eq('up to 5.6: 5.6', C.status(5.6, '', '≤5.6'), 'ok');
    eq('over 40: 40', C.status(40, '', '>40'), 'low');
    eq('at least 60: 60', C.status(60, '', '≥60'), 'ok');
    eq('<5 with range 5-10 is low', C.status(5, '<', '5–10'), 'low');
    eq('<5 with range <10 is ok', C.status(5, '<', '<10'), 'ok');
    eq('>90 with range >=60 ok', C.status(90, '>', '≥60'), 'ok');
    eq('>100 with range 30-100 high', C.status(100, '>', '30–100'), 'high');
    eq('no range', C.status(5, '', ''), 'none');
    eq('zero low', C.status(0, '', '3.5–5.1'), 'low');

    // ---- units
    const chol = C.newTest('tchol');
    eq('mmol to mg cholesterol', C.round(C.convert(chol, 5.2, 'mmol/L', 'mg/dL'), 1), 201.1);   // 5.2 x 38.67 = 201.08
    eq('mg to mmol cholesterol', C.round(C.convert(chol, 200, 'mg/dL', 'mmol/L'), 2), 5.17);   // 200 / 38.67 = 5.172
    const a1c = C.newTest('hba1c');
    eq('48 mmol/mol is 6.5%', C.round(C.convert(a1c, 48, 'mmol/mol', '%'), 1), 6.5);        // 48 / 10.929 + 2.15 = 6.54
    eq('6.5% is 48 mmol/mol', Math.round(C.convert(a1c, 6.5, '%', 'mmol/mol')), 48);         // (6.5 - 2.15) x 10.929 = 47.5
    const vd = C.newTest('vitd');
    eq('50 nmol/L vit D is 20 ng/mL', C.round(C.convert(vd, 50, 'nmol/L', 'ng/mL'), 1), 20);
    eq('custom unit no conversion', C.convert(C.newTest('', { name: 'Ca', unit: 'mg/dL' }), 9, 'mg/dL', 'mmol/L'), null);
    eq('units of preset', C.unitsOf(chol), ['mg/dL', 'mmol/L']);
    eq('suggest range', C.suggestRange(chol, 'mmol/L'), '<5.2');
    eq('suggest range normalised', C.suggestRange(C.newTest('hba1c'), '%'), '4.0–5.6');

    // ---- the README situation: HbA1c 7.1 in April, 6.4 in October
    const t = C.newTest('hba1c');
    t.results.push({ id: 'a', date: '2026-04-03', v: 7.1, q: '', unit: '%', range: '4.0–5.6', lab: '', note: '' });
    t.results.push({ id: 'b', date: '2026-10-12', v: 6.4, q: '', unit: '%', range: '4.0–5.6', lab: '', note: '' });
    let tr = C.trend(t);
    eq('latest', tr.last.id, 'b'); eq('change', tr.change, { delta: -0.7, d: 1, dir: 'down', text: '0.7' }); eq('status', tr.status, 'high');
    eq('sentence', C.sentence(t, date), '6.4 % on 12 Oct 2026, down 0.7 from 7.1 % on 3 Apr 2026. Above the range (4.0–5.6).');
    // the next lab gives mmol/mol: 42 mmol/mol = 5.99 %, shown as 6.0 %
    t.results.push({ id: 'c', date: '2027-01-15', v: 42, q: '', unit: 'mmol/mol', range: '20–38', lab: '', note: '' });
    tr = C.trend(t);
    eq('converted shown', tr.shown.text, '6.0');
    eq('converted change', tr.change.text + ' ' + tr.change.dir, '0.4 down');
    eq('converted sentence', C.sentence(t, date), '6.0 % on 15 Jan 2027, down 0.4 from 6.4 % on 12 Oct 2026. Above the range (20–38 mmol/mol).');
    // showing the test in mmol/mol instead
    t.unit = 'mmol/mol';
    eq('shown in mmol/mol', C.shown(t, t.results[1]).text, '46');   // (6.4 - 2.15) x 10.929 = 46.4
    eq('range band converted', C.round(C.rangeIn(t, t.results[1]).hi, 1), 37.7);
    t.unit = '%';
    // same value twice
    const s = C.newTest('tsh');
    s.results.push({ id: 'x', date: '2026-01-01', v: 2.1, q: '', unit: 'mIU/L', range: '0.4–4.0', lab: '', note: '' }, { id: 'y', date: '2026-06-01', v: 2.1, q: '', unit: 'mIU/L', range: '0.4–4.0', lab: '', note: '' });
    eq('same', C.sentence(s, date), '2.1 mIU/L on 1 Jun 2026, the same as 2.1 mIU/L on 1 Jan 2026. In the range (0.4–4.0).');
    // "<" values give no change number
    const v = C.newTest('', { name: 'CRP', unit: 'mg/L', range: '<5' });
    v.results.push({ id: 'p', date: '2026-02-01', v: 12, q: '', unit: 'mg/L', range: '<5', lab: '', note: '' }, { id: 'q', date: '2026-03-01', v: 5, q: '<', unit: 'mg/L', range: '<5', lab: '', note: '' });
    eq('qualifier sentence', C.sentence(v, date), '<5 mg/L on 1 Mar 2026, was 12 mg/L on 1 Feb 2026. In the range (<5).');
    eq('custom test range kept', v.ranges, { 'mg/L': '<5' });
    // decimals: 0.1 + 0.2 style noise never shows
    const g = C.newTest('', { name: 'X', unit: 'u' });
    g.results.push({ id: '1', date: '2026-01-01', v: 0.1, q: '', unit: 'u', range: '', lab: '', note: '' }, { id: '2', date: '2026-01-02', v: 0.3, q: '', unit: 'u', range: '', lab: '', note: '' });
    eq('no float noise', C.trend(g).change.text, '0.2');
    eq('no range sentence', C.sentence(g, date), '0.3 u on 2 Jan 2026, up 0.2 from 0.1 u on 1 Jan 2026. No range typed.');
    // same date: the one added later counts as latest
    const sd = C.newTest('', { name: 'Y', unit: 'u' });
    sd.results.push({ id: 'm', date: '2026-01-01', v: 1, q: '', unit: 'u', range: '', lab: '', note: '' }, { id: 'n', date: '2026-01-01', v: 2, q: '', unit: 'u', range: '', lab: '', note: '' });
    eq('same day latest', C.trend(sd).last.id, 'n');
    eq('empty test', C.sentence(C.newTest('ldl'), date), 'No results yet.');

    // ---- dates
    eq('valid date', C.validDate('2026-02-28'), true);
    eq('bad date', C.validDate('2026-02-30'), false);
    eq('old date', C.validDate('1850-01-01'), false);

    // ---- saved data
    eq('clean null', C.clean(null), null);
    eq('clean junk', C.clean({ people: 'x' }), null);
    eq('clean empty people', C.clean({ people: [] }), null);
    const dirty = { current: 'zz', people: [{ id: 'p1', name: 'Sara', tests: [
        { id: 't1', key: 'hba1c', name: 'HbA1c', unit: 'kg', ranges: { '%': '4.0-5.6', bad: 'x' }, results: [
            { id: 'r1', date: '2026-10-12', v: 6.4, q: '', unit: '%', range: '4.0-5.6' },
            { id: 'r2', date: 'nope', v: 6 }, { id: 'r3', date: '2026-10-12', v: 'six' }, { id: 'r4', date: '2026-10-11', v: 48, unit: 'mmol/mol', q: '!!', range: 'junk' }] },
        { id: 't2', key: '', name: '', unit: 'x' }, 5, null] }, null] };
    const c = C.clean(dirty);
    eq('clean person', [c.people.length, c.current, c.people[0].tests.length], [1, 'p1', 1]);
    eq('clean test unit fixed', c.people[0].tests[0].unit, '%');
    eq('clean ranges', c.people[0].tests[0].ranges, { '%': '4.0–5.6' });
    eq('clean results', c.people[0].tests[0].results.map(r => [r.id, r.unit, r.q, r.range]), [['r1', '%', '', '4.0–5.6'], ['r4', 'mmol/mol', '', '']]);
    eq('clean round trip', JSON.stringify(C.clean(JSON.parse(JSON.stringify(c)))), JSON.stringify(c));

    // ---- spreadsheet: formulas are made harmless, commas quoted
    const per = { name: 'Sara', tests: [v] };
    const lines = C.csv(per).split('\r\n');
    eq('csv header', lines[0], 'Person,Test,Date,Result,Unit,Normal range,Inside the range?,Lab,Note');
    eq('csv row', lines[1], 'Sara,CRP,2026-02-01,12,mg/L,<5,Above the range,,');
    v.results[0].note = '=HYPERLINK("x")';
    eq('csv formula', C.csv(per).split('\r\n')[1].endsWith(',"\'=HYPERLINK(""x"")"'), true);

    // ---- every preset has a working range in every unit
    C.PRESETS.forEach(p => p.units.forEach(u => eq('preset range ' + p.key + ' ' + u.u, C.parseRange(u.range).error, undefined)));
    eq('preset keys unique', new Set(C.PRESETS.map(p => p.key)).size, C.PRESETS.length);

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') { const o = document.getElementById('out'); if (o) o.textContent = out.concat([summary]).join('\n'); }
    else { out.forEach(l => console.log(l)); console.log(summary); if (fail) process.exitCode = 1; }
})();
