// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.ChoreCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const ok = (name, cond) => eq(name, !!cond, true);

    // a household that starts in the week of Mon 12 Oct 2026
    function home(names, chores, ws) {
        const s = C.emptyState(ws == null ? 1 : ws, '2026-10-14');
        names.forEach(n => s.people.push({ id: s.nextId++, name: n, from: s.start, away: [] }));
        chores.forEach(([n, e, ev, only]) => s.chores.push({ id: s.nextId++, name: n, effort: e, every: ev === 'd' ? 1 : (ev || 1), daily: ev === 'd', only: only || null, from: s.start }));
        return s;
    }
    const W = (s, i) => C.addWeeks(s.start, i);
    const nameOf = (s, id) => (s.people.find(p => p.id === id) || {}).name || null;
    const choreId = (s, n) => s.chores.find(c => c.name === n).id;
    const personId = (s, n) => s.people.find(p => p.name === n).id;
    const who = (s, i, chore) => { const r = C.compute(s, W(s, i)); return nameOf(s, r.weeks[W(s, i)].assign[choreId(s, chore)]); };
    const pointsOver = (s, from, to) => { const r = C.compute(s, W(s, to)), t = {}; s.people.forEach(p => { t[p.name] = 0; });
        for (let i = from; i <= to; i++) { const w = r.weeks[W(s, i)]; w.due.forEach(cid => { const id = w.assign[cid]; if (id != null) t[nameOf(s, id)] += s.chores.find(c => c.id === cid).effort; }); } return t; };

    // ---------- dates ----------
    eq('week of a Wednesday, Monday start', C.weekOf('2026-10-14', 1), '2026-10-12');
    eq('week of a Monday is itself', C.weekOf('2026-10-12', 1), '2026-10-12');
    eq('week of a Sunday, Monday start', C.weekOf('2026-10-18', 1), '2026-10-12');
    eq('Sunday start', C.weekOf('2026-10-14', 0), '2026-10-11');
    eq('Saturday start', C.weekOf('2026-10-14', 6), '2026-10-10');
    eq('week across new year', C.weekOf('2027-01-01', 1), '2026-12-28');
    eq('leap day', C.weekOf('2028-02-29', 1), '2028-02-28');
    eq('add weeks over summer time change', C.addWeeks('2026-10-19', 1), '2026-10-26');
    eq('weeks between', C.weeksBetween('2026-10-12', '2027-01-04'), 12);
    eq('week range', C.weekRange('2026-10-12', '2026-10-14'), 'Mon 12 Oct to Sun 18 Oct');
    eq('week range across years', C.weekRange('2026-12-28', '2026-10-14'), 'Mon 28 Dec 2026 to Sun 3 Jan 2027');
    eq('week range next year', C.weekRange('2027-01-04', '2026-10-14'), 'Mon 4 Jan to Sun 10 Jan 2027');
    eq('bad date key', C.isKey('2026-02-30'), false);
    eq('today key uses local date', C.todayKey(new Date(2026, 9, 15, 0, 5)), '2026-10-15');

    // ---------- names and numbers ----------
    eq('names with commas', C.splitNames('Ali, Sam, Zoe'), ['Ali', 'Sam', 'Zoe']);
    eq('names with "and" and &', C.splitNames('Ali, Sam and Zoe & Hira'), ['Ali', 'Sam', 'Zoe', 'Hira']);
    eq('pasted names one per line', C.splitNames('Ali\nSam\r\n\nZoe\t'), ['Ali', 'Sam', 'Zoe']);
    eq('blank names', C.splitNames('  ,  , '), []);
    eq('null names', C.splitNames(null), []);
    eq('name with "and" inside a word stays', C.splitNames('Andy, Sandra'), ['Andy', 'Sandra']);
    eq('very long name cut to 30', C.splitNames('x'.repeat(80))[0].length, 30);
    eq('spaces squeezed', C.cleanName('  Mum   and  Dad ', 30), 'Mum and Dad');
    eq('every 3', C.parseEvery(' 3 '), 3);
    eq('every 0 refused', C.parseEvery('0'), null);
    eq('every 13 refused', C.parseEvery('13'), null);
    eq('every negative refused', C.parseEvery('-2'), null);
    eq('every decimal refused', C.parseEvery('2.5'), null);
    eq('every blank refused', C.parseEvery(''), null);
    eq('every text refused', C.parseEvery('two'), null);
    eq('frequency words', [C.freqText({ every: 1 }), C.freqText({ every: 2 }), C.freqText({ every: 1, daily: true })], ['every week', 'every 2 weeks', 'every day']);
    eq('list join', [C.listJoin(['Ali']), C.listJoin(['Ali', 'Sam']), C.listJoin(['Ali', 'Sam', 'Zoe'])], ['Ali', 'Ali and Sam', 'Ali, Sam and Zoe']);

    // ---------- the main situation: 4 flatmates, 4 chores of equal work ----------
    const flat = home(['Ali', 'Sam', 'Zoe', 'Hira'], [['Kitchen', 2], ['Bathroom', 2], ['Hoover', 2], ['Bins', 2]]);
    eq('week 1 rota', ['Kitchen', 'Bathroom', 'Hoover', 'Bins'].map(c => who(flat, 0, c)), ['Ali', 'Sam', 'Zoe', 'Hira']);
    eq('week 2 rotates by one', ['Kitchen', 'Bathroom', 'Hoover', 'Bins'].map(c => who(flat, 1, c)), ['Sam', 'Zoe', 'Hira', 'Ali']);
    eq('week 5 is back to week 1', ['Kitchen', 'Bathroom', 'Hoover', 'Bins'].map(c => who(flat, 4, c)), ['Ali', 'Sam', 'Zoe', 'Hira']);
    ok('everyone does every chore once in 4 weeks', ['Kitchen', 'Bathroom', 'Hoover', 'Bins'].every(c => new Set([0, 1, 2, 3].map(i => who(flat, i, c))).size === 4));
    eq('the text for the group chat', C.weekText(flat, flat.start, '2026-10-14'), 'Chore rota, Mon 12 Oct to Sun 18 Oct\nAli: Kitchen\nSam: Bathroom\nZoe: Hoover\nHira: Bins');

    // ---------- different amounts of work ----------
    const mixed = home(['Ali', 'Sam', 'Zoe', 'Hira'], [['Kitchen', 2], ['Bathroom', 3], ['Hoover', 2], ['Bins', 1]]);
    eq('heavy jobs counted: equal points over 8 weeks', pointsOver(mixed, 0, 7), { Ali: 16, Sam: 16, Zoe: 16, Hira: 16 });
    ok('nobody cleans the bathroom two weeks running', [0, 1, 2, 3, 4, 5, 6].every(i => who(mixed, i, 'Bathroom') !== who(mixed, i + 1, 'Bathroom')));

    // ---------- more chores than people ----------
    const many = home(['Ali', 'Sam', 'Zoe'], [['Kitchen', 2], ['Bathroom', 3], ['Hoover', 2], ['Bins', 1], ['Recycling', 1], ['Windows', 2, 4]]);
    const mp = pointsOver(many, 0, 11);
    ok('3 people, 6 chores: points within one light job after 12 weeks', Math.max(...Object.values(mp)) - Math.min(...Object.values(mp)) <= 2);
    eq('every 4 weeks job is due in weeks 1, 5, 9 only', [0, 1, 2, 3, 4, 8].map(i => C.isDue(many.chores[5], W(many, i))), [true, false, false, false, true, true]);

    // ---------- more people than chores ----------
    const big = home(['A', 'B', 'C', 'D', 'E'], [['Kitchen', 2], ['Bathroom', 2]]);
    const bp = pointsOver(big, 0, 9);
    eq('5 people, 2 chores: everyone 8 points over 10 weeks', bp, { A: 8, B: 8, C: 8, D: 8, E: 8 });
    const gaps = ['A', 'B', 'C', 'D', 'E'].map(n => { const r = C.compute(big, W(big, 9)); let longest = 0, run = 0; for (let i = 0; i < 10; i++) { const w = r.weeks[W(big, i)]; const has = Object.values(w.assign).includes(personId(big, n)); run = has ? 0 : run + 1; longest = Math.max(longest, run); } return longest; });
    ok('nobody waits more than 3 weeks for a job', Math.max(...gaps) <= 3);

    // ---------- one person ----------
    const solo = home(['Ali'], [['Kitchen', 2], ['Bins', 1]]);
    eq('one person does everything', [who(solo, 0, 'Kitchen'), who(solo, 1, 'Bins')], ['Ali', 'Ali']);

    // ---------- every 2 weeks and every day ----------
    const fr = home(['Ali', 'Sam'], [['Washing up', 3, 'd'], ['Fridge', 2, 2]]);
    eq('every 2 weeks: due weeks 1 and 3, not 2', [0, 1, 2].map(i => C.isDue(fr.chores[1], W(fr, i))), [true, false, true]);
    eq('every day job swaps person each week', [who(fr, 0, 'Washing up'), who(fr, 1, 'Washing up'), who(fr, 2, 'Washing up')], ['Ali', 'Sam', 'Ali']);
    eq('every 2 weeks job alternates too', [who(fr, 0, 'Fridge'), who(fr, 2, 'Fridge')], ['Sam', 'Ali']);

    // ---------- someone away ----------
    const aw = home(['Ali', 'Sam', 'Zoe', 'Hira'], [['Kitchen', 2], ['Bathroom', 2], ['Hoover', 2], ['Bins', 2]]);
    aw.people[3].away.push(W(aw, 1));
    const awv = C.weekView(aw, W(aw, 1));
    eq('away person has no jobs', awv.people.find(p => p.name === 'Hira').jobs.length, 0);
    eq('away week: all 4 jobs still given out', awv.people.reduce((t, p) => t + p.jobs.length, 0), 4);
    eq('away week: the 3 at home share them 2-1-1', awv.people.filter(p => !p.away).map(p => p.jobs.length).sort(), [1, 1, 2]);
    eq('back home: no catching up, one job like everyone', C.weekView(aw, W(aw, 2)).people.find(p => p.name === 'Hira').jobs.length, 1);
    const awp = pointsOver(aw, 0, 7);
    ok('away week not owed: Hira does 2 points less than the average of the others', Math.abs((awp.Ali + awp.Sam + awp.Zoe) / 3 - awp.Hira - 8 / 3 * 1) <= 2);
    const allAway = home(['Ali', 'Sam'], [['Kitchen', 2]]);
    allAway.people.forEach(p => p.away.push(allAway.start));
    const aav = C.weekView(allAway, allAway.start);
    eq('everyone away: job has nobody', [aav.unassigned.length, aav.count], [1, 1]);
    ok('everyone away: text says nobody free', C.weekText(allAway, allAway.start, '2026-10-14').includes('Nobody free for: Kitchen'));
    eq('everyone away: text says away', C.weekText(allAway, allAway.start, '2026-10-14').split('\n')[1], 'Ali: away');

    // ---------- only some people can do a chore ----------
    const kids = home(['Mum', 'Dad', 'Ayan'], [['Clean the oven', 3], ['Tidy toys', 1], ['Bins', 1]]);
    kids.chores[0].only = [personId(kids, 'Mum'), personId(kids, 'Dad')];
    ok('child never gets the oven in 12 weeks', [...Array(12).keys()].every(i => who(kids, i, 'Clean the oven') !== 'Ayan'));
    ok('oven alternates between the adults', who(kids, 0, 'Clean the oven') !== who(kids, 1, 'Clean the oven'));
    kids.people[0].away.push(W(kids, 3)); kids.people[1].away.push(W(kids, 3));
    eq('both adults away: oven has nobody, toys still done', [who(kids, 3, 'Clean the oven'), who(kids, 3, 'Tidy toys')], [null, 'Ayan']);

    // ---------- swaps ----------
    const sw = home(['Ali', 'Sam', 'Zoe', 'Hira'], [['Kitchen', 2], ['Bathroom', 2], ['Hoover', 2], ['Bins', 2]]);
    sw.overrides[sw.start] = { [choreId(sw, 'Kitchen')]: personId(sw, 'Sam') };
    const swv = C.weekView(sw, sw.start);
    eq('swap: Sam does Kitchen and Bathroom this week', swv.people.find(p => p.name === 'Sam').jobs.map(j => j.name), ['Kitchen', 'Bathroom']);
    eq('swap: marked swapped, rota said Ali', [swv.people.find(p => p.name === 'Sam').jobs[0].swapped, nameOf(sw, swv.people.find(p => p.name === 'Sam').jobs[0].base)], [true, 'Ali']);
    eq('swap evens out: after 4 weeks everyone has 8 points', pointsOver(sw, 0, 3), { Ali: 8, Sam: 8, Zoe: 8, Hira: 8 });
    const swBack = home(['Ali', 'Sam'], [['Kitchen', 2]]); swBack.overrides[swBack.start] = { [choreId(swBack, 'Kitchen')]: personId(swBack, 'Ali') };
    eq('override to the rota person is not a swap', C.weekView(swBack, swBack.start).people[0].jobs[0].swapped, false);

    // ---------- changes keep the past ----------
    const ch = home(['Ali', 'Sam', 'Zoe'], [['Kitchen', 2], ['Bathroom', 3], ['Bins', 1]]);
    const before = [0, 1, 2].map(i => ['Kitchen', 'Bathroom', 'Bins'].map(c => who(ch, i, c)));
    const now = W(ch, 3);
    C.freeze(ch, now);
    ch.people.push({ id: ch.nextId++, name: 'Hira', from: now, away: [] });
    eq('adding a person does not rewrite past weeks', [0, 1, 2].map(i => ['Kitchen', 'Bathroom', 'Bins'].map(c => who(ch, i, c))), before);
    ok('new person gets a job in their first or second week', [3, 4].some(i => ['Kitchen', 'Bathroom', 'Bins'].some(c => who(ch, i, c) === 'Hira')));
    C.freeze(ch, W(ch, 5)); ch.people[0].removed = W(ch, 5);
    eq('removed person stays in past weeks', ['Kitchen', 'Bathroom', 'Bins'].map(c => who(ch, 0, c)), before[0]);
    ok('removed person has no jobs from then on', [5, 6, 7].every(i => ['Kitchen', 'Bathroom', 'Bins'].every(c => who(ch, i, c) !== 'Ali')));
    ok('removed person not listed in later weeks', !C.weekView(ch, W(ch, 6)).people.some(p => p.name === 'Ali'));
    C.freeze(ch, W(ch, 6)); ch.chores[2].removed = W(ch, 6);
    eq('removed chore not due later', C.weekView(ch, W(ch, 6)).count, 2);
    eq('removed chore still in past weeks', C.weekView(ch, W(ch, 1)).count, 3);

    // ---------- stats ----------
    const st = C.stats(flat, W(flat, 3));
    eq('stats: 4 jobs and 8 points each after 4 weeks', flat.people.map(p => [st[p.id].jobs, st[p.id].points]), [[4, 8], [4, 8], [4, 8], [4, 8]]);
    eq('stats count away weeks', C.stats(aw, W(aw, 3))[aw.people[3].id].away, 1);

    // ---------- done ticks ----------
    flat.done[flat.start] = { [choreId(flat, 'Kitchen')]: true };
    const dv = C.weekView(flat, flat.start);
    eq('1 of 4 done', [dv.done, dv.count], [1, 4]);
    ok('done shows in the text', C.weekText(flat, flat.start, '2026-10-14').includes('Ali: Kitchen (done)'));

    // ---------- empty and odd ----------
    const empty = C.emptyState(1, '2026-10-14');
    eq('empty rota: no jobs', C.weekView(empty, empty.start).count, 0);
    eq('chores but nobody: all unassigned', C.weekView(home([], [['Kitchen', 2]]), '2026-10-12').unassigned.length, 1);
    eq('people but no chores: no jobs', C.weekView(home(['Ali'], []), '2026-10-12').count, 0);
    eq('week before the start has no rota', C.weekView(flat, '2026-10-05').exists, false);
    const t0 = Date.now(), huge = home([...Array(20).keys()].map(i => 'P' + i), [...Array(40).keys()].map(i => ['C' + i, 1 + i % 3, 1 + i % 4]));
    huge.start = '2024-10-14'; huge.people.forEach(p => { p.from = huge.start; }); huge.chores.forEach(c => { c.from = huge.start; });
    C.stats(huge, C.addWeeks('2026-10-12', 104));
    ok('20 people, 40 chores, 4 years of weeks in under 2 s', Date.now() - t0 < 2000);
    const hp = Object.values(C.stats(huge, '2026-10-12')).map(s => s.points);
    ok('20 people: points stay within 3 of each other', Math.max(...hp) - Math.min(...hp) <= 3);

    // ---------- saved and imported data ----------
    eq('validate: null', C.validate(null), null);
    eq('validate: array', C.validate([]), null);
    eq('validate: text', C.validate('hello'), null);
    eq('validate: missing lists', C.validate({ people: 1 }), null);
    const v = C.validate({ weekStart: 9, start: '2026-10-14', people: [{ id: 1, name: '  Ali  ' }, { id: 1, name: 'Dup id' }, { id: 2, name: '' }, { id: 'x', name: 'Bad' }, null, { id: 3, name: 'Sam', away: ['2026-10-21', 'nope', '2026-10-21'] }],
        chores: [{ id: 4, name: 'Kitchen', every: 99, effort: 7, only: [1, 77] }, { id: 5, name: 'Bins', every: 2, effort: 1, daily: true }, { id: 6 }],
        overrides: { '2026-10-12': { 4: 3, 5: 99 }, 'bad': { 4: 1 }, '2026-10-13': { 4: 1 } }, done: { '2026-10-12': { 4: true, 5: 'yes' } }, frozen: { '2026-10-12': { 4: null, 5: 3 } }, nextId: 2 });
    eq('validate: bad week start becomes Monday', v.weekStart, 1);
    eq('validate: start snapped to its week', v.start, '2026-10-12');
    eq('validate: people cleaned', v.people.map(p => [p.id, p.name]), [[1, 'Ali'], [3, 'Sam']]);
    eq('validate: away weeks cleaned', v.people[1].away, ['2026-10-19']);
    eq('validate: chore values clamped', [v.chores[0].every, v.chores[0].effort, v.chores[0].only], [1, 2, [1]]);
    eq('validate: daily chore is weekly', [v.chores[1].every, v.chores[1].daily], [1, true]);
    eq('validate: chore without a name dropped', v.chores.length, 2);
    eq('validate: overrides cleaned', v.overrides, { '2026-10-12': { 4: 3 } });
    eq('validate: done cleaned', v.done, { '2026-10-12': { 4: true } });
    eq('validate: frozen kept', v.frozen, { '2026-10-12': { 4: null, 5: 3 } });
    eq('validate: next id above every id', v.nextId, 6);
    eq('validate round trip', C.validate(JSON.parse(JSON.stringify(flat))), C.validate(flat));

    out.push('', pass + ' passed, ' + fail + ' failed');
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n');
    else { console.log(out.filter(l => !l.startsWith('PASS')).join('\n')); if (fail) process.exitCode = 1; }
})();
