// Logic checks for core.js. Run: node tests.js  (or open test.html in a browser)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.ReplaceCore;
    let pass = 0, failed = 0; const out = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); } };
    const T = '2026-10-24';   // a Saturday
    let nid = 1;
    const thing = o => Object.assign({ id: nid++, name: 'Thing', who: '', n: 3, unit: 'month', last: '2026-08-02', skip: 0, paused: '', history: [], note: '', added: T }, o);
    const form = o => Object.assign({ name: 'Toothbrush', who: '', n: '3', unit: 'month', last: T, note: '' }, o);

    // ---- words and dates
    eq(C.everyText(1, 'day'), 'every day', 'every day');
    eq(C.everyText(10, 'day'), 'every 10 days', 'every 10 days');
    eq(C.everyText(1, 'week'), 'every week', 'every week');
    eq(C.everyText(4, 'week'), 'every 4 weeks', 'every 4 weeks');
    eq(C.everyText(1, 'month'), 'every month', 'every month');
    eq(C.everyText(3, 'month'), 'every 3 months', 'every 3 months');
    eq(C.everyText(12, 'month'), 'every year', 'every year');
    eq(C.everyText(24, 'month'), 'every 2 years', 'every 2 years');
    eq(C.everyText(18, 'month'), 'every 18 months', '18 months stays months');
    eq(C.addMonths('2027-01-31', 1), '2027-02-28', '31 Jan + 1 month = 28 Feb');
    eq(C.addMonths('2028-01-31', 1), '2028-02-29', 'leap year 29 Feb');
    eq(C.addMonths('2026-11-30', 3), '2027-02-28', 'across the year end');
    eq(C.addMonths('2026-08-02', 3), '2026-11-02', '2 Aug + 3 months');
    eq(C.addMonths('2026-03-15', -1), '2026-02-15', 'month back (chip "A month ago")');
    eq(C.addMonths('2026-03-31', -1), '2026-02-28', 'month back clamps');
    eq(C.addEvery('2026-10-24', 2, 'week'), '2026-11-07', '2 weeks');
    eq(C.addEvery('2026-12-31', 1, 'day'), '2027-01-01', 'a day across new year');
    eq(C.rel(T, '2026-10-25'), 'tomorrow', 'tomorrow');
    eq(C.rel(T, '2026-11-02'), 'in 9 days', 'in 9 days');
    eq(C.rel(T, '2026-12-10'), 'in 6 weeks', 'in 6 weeks');
    eq(C.rel(T, '2027-01-15'), 'in 2 months', 'in 2 months');
    eq(C.rel(T, '2026-01-15'), '9 months ago', '9 months ago');
    eq(C.shortDate(T, T), 'Sat 24 Oct', 'short date');
    eq(C.shortDate('2027-01-15', T), 'Fri 15 Jan 2027', 'next year shows the year');

    // ---- Ayesha's house on Sat 24 Oct 2026
    const jug = thing({ name: 'Water filter jug cartridge', n: 4, unit: 'week', last: '2026-09-15', history: ['2026-08-18', '2026-09-15'] });
    const ac = thing({ name: 'AC filter (wash or clean)', n: 1, unit: 'month', last: '2026-09-24' });
    const brushes = ['Ali', 'Sara', 'Mum', 'Dad'].map(w => thing({ name: 'Toothbrush', who: w, n: 3, unit: 'month', last: '2026-08-02' }));
    const lens = thing({ name: 'Contact lenses (monthly)', who: 'Mum', n: 1, unit: 'month', last: '2026-10-03' });
    const fridge = thing({ name: 'Fridge water filter', n: 6, unit: 'month', last: '2026-06-10' });
    const wipers = thing({ name: 'Car wiper blades', n: 12, unit: 'month', last: '2026-01-15' });
    const all = [jug, ac].concat(brushes, [lens, fridge, wipers]);
    eq(C.nextDue(jug, T), '2026-10-13', 'jug due 13 Oct');
    eq(C.dueLine(jug, T), 'Replace now: 11 days late (was due Tue 13 Oct)', 'jug line');
    eq(C.dueLine(ac, T), 'Replace today', 'ac today');
    eq(C.dueLine(brushes[0], T), 'Due Mon 2 Nov (in 9 days)', 'toothbrush in 9 days');
    eq(C.dueLine(lens, T), 'Due Tue 3 Nov (in 10 days)', 'lenses');
    eq(C.dueLine(fridge, T), 'Due Thu 10 Dec (in 6 weeks)', 'fridge');
    eq(C.dueLine(wipers, T), 'Due Fri 15 Jan 2027 (in 2 months)', 'wipers');
    eq(C.dueLine(thing({ n: 1, unit: 'day', last: T }), T), 'Due tomorrow, Sun 25 Oct', 'tomorrow line');
    eq(C.dueLine(thing({ last: '' }), T), 'Replace now (no date recorded yet)', 'not sure');
    eq(C.dueLine(thing({ last: '2025-01-01', n: 1, unit: 'month' }), T), 'Replace now: 20 months late (was due Sat 1 Feb 2025)', 'very late in months');
    eq(C.subLine(brushes[0], T), 'Replace every 3 months · last replaced Sun 2 Aug (2 months ago)', 'sub line');
    eq(C.subLine(thing({ last: '' }), T), 'Replace every 3 months · no date recorded', 'sub line no date');
    eq(C.historyLine(jug, T), 'Earlier: Tue 18 Aug', 'history line');
    eq(C.historyLine(ac, T), '', 'no history line');
    eq(C.label(brushes[2]), 'Toothbrush (Mum)', 'label with who');
    const g = C.groups(all, T);
    eq(g.now.map(C.label), ['Water filter jug cartridge', 'AC filter (wash or clean)'], 'replace now, latest first');
    eq(g.later.map(C.label), ['Toothbrush (Ali)', 'Toothbrush (Dad)', 'Toothbrush (Mum)', 'Toothbrush (Sara)', 'Contact lenses (monthly) (Mum)', 'Fridge water filter', 'Car wiper blades'], 'coming up order');
    eq(g.now.map(x => C.dueName(x, T)), ['Water filter jug cartridge (11 days late)', 'AC filter (wash or clean)'], 'summary names');

    // shopping list for the next 30 days: same names counted together
    eq(C.shoppingText(all, T, 30), 'To buy for the next 30 days (Sat 24 Oct 2026):\n' +
        '- Water filter jug cartridge, needed now\n- AC filter (wash or clean), needed now\n' +
        '- Toothbrush x 4 (Ali, Dad, Mum, Sara), first needed Mon 2 Nov\n- Contact lenses (monthly) (Mum), first needed Tue 3 Nov', 'shopping list 30 days');
    eq(C.shoppingText(all, T, 7).split('\n').length, 3, 'shopping list 7 days: only the 2 due now');
    eq(C.shoppingText([], T, 30), '', 'empty shopping list');
    eq(C.shoppingText([Object.assign({}, jug, { paused: T })], T, 30), '', 'paused things are not on the shopping list');

    // ---- actions
    const r1 = C.replaced(jug, T);
    eq([r1.last, C.dueLine(r1, T), r1.history], [T, 'Due Sat 21 Nov (in 4 weeks)', ['2026-08-18', '2026-09-15', T]], 'replaced today');
    eq(C.replaced(r1, T).history.length, 3, 'replaced twice same day counted once');
    eq(C.replaced(r1, '2026-10-01').last, T, 'an earlier date never moves last back');
    eq(jug.last, '2026-09-15', 'actions do not change the old item');
    // pause on 1 Oct, resume on 24 Oct: 23 days not counted
    const acP = C.pause(thing({ name: 'AC', n: 3, unit: 'month', last: '2026-09-01' }), '2026-10-01');
    eq(C.dueLine(acP, T), 'Paused since Thu 1 Oct: not counting', 'paused line');
    eq(C.groups([acP], T).paused.length, 1, 'paused group');
    const acR = C.resume(acP, T);
    eq([acR.paused, acR.skip, C.nextDue(acR, T)], ['', 23, '2026-12-24'], 'resume adds the paused days (1 Dec + 23 days)');
    eq(C.subLine(acR, T), 'Replace every 3 months · last replaced Tue 1 Sep (7 weeks ago) · 23 paused days not counted', 'sub line with skip');
    eq(C.replaced(acR, T).skip, 0, 'replacing clears paused days');
    eq(C.resume(C.pause(thing({ last: '' }), '2026-10-01'), T).skip, 0, 'no date recorded: nothing to add');
    eq(C.replaced(acP, T).paused, '', 'replacing a paused thing resumes it');
    eq(C.averageGap(thing({ history: ['2026-01-01', '2026-04-01', '2026-07-01'] })), 91, 'average gap');
    eq(C.averageGap(jug), 0, 'average gap needs 3 dates');

    // ---- the form
    const f1 = C.readForm(form({ who: 'Ali, Sara, Mum, Dad', last: '2026-08-02' }), T, [], null);
    eq(f1.items.map(x => x.who), ['Ali', 'Sara', 'Mum', 'Dad'], 'one item per name');
    eq(f1.items[0], { name: 'Toothbrush', who: 'Ali', n: 3, unit: 'month', last: '2026-08-02', note: '' }, 'item from the form');
    eq(C.readForm(form({ who: ' Ali ,, ali, , Sara ' }), T, [], null).items.map(x => x.who), ['Ali', 'Sara'], 'blank and repeated names dropped');
    eq(C.readForm(form({ who: 'Kitchen, upstairs' }), T, [], 5).items.map(x => x.who), ['Kitchen, upstairs'], 'editing keeps commas as text');
    eq(C.readForm(form({ who: '' }), T, [], null).items.map(x => x.who), [''], 'no who');
    eq(!!C.readForm(form({ who: Array.from({ length: 13 }, (_, i) => 'P' + i).join(',') }), T, [], null).errors.who, true, '13 names refused');
    eq(C.readForm(form({ name: '   ' }), T, [], null).errors.name.slice(0, 26), 'Type what needs replacing,', 'blank name');
    eq(C.readForm(form({ name: '  Pasted\n\tname   here ' }), T, [], null).items[0].name, 'Pasted name here', 'pasted whitespace cleaned');
    eq(C.readForm(form({ name: 'x'.repeat(200) }), T, [], null).items[0].name.length, 60, 'very long name cut to 60');
    eq(!!C.readForm(form({ n: '0' }), T, [], null).errors.n, true, 'zero refused');
    eq(!!C.readForm(form({ n: '-2' }), T, [], null).errors.n, true, 'negative refused');
    eq(!!C.readForm(form({ n: '1.5' }), T, [], null).errors.n, true, 'decimal refused');
    eq(!!C.readForm(form({ n: '' }), T, [], null).errors.n, true, 'blank number refused');
    eq(C.readForm(form({ n: '37' }), T, [], null).errors.n, 'Type a whole number from 1 to 36 months.', '37 months refused');
    eq(C.readForm(form({ n: '730', unit: 'day' }), T, [], null).items[0].n, 730, '730 days ok');
    eq(!!C.readForm(form({ n: '731', unit: 'day' }), T, [], null).errors.n, true, '731 days refused');
    eq(C.readForm(form({ n: '104', unit: 'week' }), T, [], null).items[0].n, 104, '104 weeks ok');
    eq(C.readForm(form({ n: ' 2 ' }), T, [], null).items[0].n, 2, 'spaces around the number');
    eq(C.readForm(form({ last: '2026-10-25' }), T, [], null).errors.last.slice(0, 41), 'The last replacement cannot be in the fut', 'future date refused');
    eq(!!C.readForm(form({ last: '2026-02-30' }), T, [], null).errors.last, true, 'impossible date refused');
    eq(C.readForm(form({ last: '' }), T, [], null).items[0].last, '', 'not sure allowed');
    eq(C.readForm(form({ note: ' a\r\nb ' }), T, [], null).items[0].note, 'a\nb', 'note kept');
    eq(C.readForm(form({ who: 'Ali' }), T, brushes, null).warn, 'You already had Toothbrush (Ali). Both are kept.', 'duplicate warns');
    eq(C.readForm(form({ who: 'Ali' }), T, brushes, brushes[0].id).warn, '', 'editing itself is not a duplicate');

    // ---- sharing
    const lt = C.listText(all, T);
    eq(lt.split('\n')[0], 'Things to replace, Sat 24 Oct 2026', 'list title');
    eq(lt.includes('- Water filter jug cartridge: replace now: 11 days late (was due Tue 13 Oct), every 4 weeks'), true, 'list line');
    eq(C.listText([], T), '', 'empty list text');
    const cal = C.ics(all.concat([Object.assign({}, fridge, { id: 99, paused: T })]), T, 'https://x/');
    eq((cal.match(/BEGIN:VEVENT/g) || []).length, 9, 'one event per active item (paused left out)');
    eq(cal.includes('DTSTART;VALUE=DATE:20261024\r\n'), true, 'late item lands today');
    eq(cal.includes('RRULE:FREQ=MONTHLY;INTERVAL=3'), true, 'repeats every 3 months');
    eq(cal.includes('RRULE:FREQ=WEEKLY;INTERVAL=4'), true, 'repeats every 4 weeks');
    eq(cal.includes('SUMMARY:Replace: Toothbrush (Ali)'), true, 'event title');
    eq(cal.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75), true, 'lines folded at 75 bytes');
    eq(C.ics([thing({ name: 'Filter; a, b' })], T, 'u').includes('Filter\\; a\\, b'), true, 'ics escapes');

    // ---- saved data
    eq(C.validate(null), null, 'null state');
    eq(C.validate({ items: 'x' }), null, 'bad items');
    const v = C.validate({ nextId: 2, items: [jug, { id: 'x' }, { id: 50, name: 'Bad unit', n: 3, unit: 'year' }, { id: 51, name: 'Too many', n: 99, unit: 'month' },
        Object.assign({}, ac, { id: jug.id }), Object.assign({}, lens, { last: '2026-13-01', skip: 9, history: ['bad', '2026-01-01'] }), Object.assign({}, fridge, { unit: '__proto__' })] });
    eq(v.items.map(x => x.name), ['Water filter jug cartridge', 'Contact lenses (monthly)'], 'invalid items dropped');
    eq([v.items[1].last, v.items[1].skip, v.items[1].history], ['', 0, ['2026-01-01']], 'bad dates cleaned');
    eq(v.nextId > Math.max(jug.id, lens.id), true, 'nextId above every id');
    eq(C.PRESETS.every(p => p.n >= 1 && p.n <= C.MAX[p.unit]), true, 'presets within limits');

    const msg = pass + ' passed, ' + failed + ' failed' + (out.length ? '\n' + out.join('\n') : '');
    if (typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function') { console.log(msg); if (failed) process.exitCode = 1; }
    else { const pre = document.createElement('pre'); pre.textContent = msg; document.body.appendChild(pre); }
})();
