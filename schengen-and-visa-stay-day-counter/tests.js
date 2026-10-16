// Logic checks with hand-worked answers. Run: node tests.js  (or open test.html)
(function () {
    const C = typeof module === 'object' ? require('./core.js') : window.StayCore;
    let pass = 0, fail = 0;
    const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; if (!ok) out.push('FAIL ' + name + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); };
    const T = '2026-10-16';   // Friday
    const counter = (trips, n = 90, m = 180) => ({ id: 'c1', name: 'Schengen area', n, m, trips: trips.map((t, i) => ({ id: 't' + i, entry: t[0], exit: t[1] || null, note: t[2] || '' })) });

    // dates
    eq('long date', C.longDate(T), 'Fri 16 Oct 2026');
    eq('add days over year end', C.addDays('2026-11-01', 62), '2027-01-02');
    eq('range text same year', C.rangeText('2026-06-01', '2026-06-20'), '1 Jun to 20 Jun 2026');
    eq('range text over new year', C.rangeText('2025-12-28', '2026-01-03'), '28 Dec 2025 to 3 Jan 2026');
    eq('bad date', C.isDate('2026-02-30'), false);
    eq('leap day', C.isDate('2028-02-29'), true);

    // no trips: a full 90 days from today
    let s = C.status(counter([]), T);
    eq('empty used', [s.used, s.left], [0, 90]);
    eq('empty stay', [s.stayToday, s.stayUntil, s.full], [90, '2027-01-13', T]);
    eq('empty no backOn', s.backOn, undefined);

    // Ayesha: Spain 1 Mar-15 Apr (outside the window), Paris 1-20 Jun (20 days), Berlin 10 Aug-5 Sep (27 days)
    const A = counter([['2026-03-01', '2026-04-15', 'Spain'], ['2026-06-01', '2026-06-20', 'Paris and Rome'], ['2026-08-10', '2026-09-05', 'Berlin']]);
    s = C.status(A, T);
    eq('ayesha used', [s.used, s.left, s.over], [47, 43, false]);
    eq('ayesha enter today: until 17 Dec (63 days, June days drop out on the way)', [s.stayToday, s.stayUntil], [63, '2026-12-17']);
    eq('ayesha days come back', s.backOn, '2026-11-28');
    eq('ayesha full 90 again', s.full, '2026-12-05');
    eq('ayesha no overstay', s.overDay, null);
    let p = C.plan(A, T, '2026-11-01');
    eq('plan 1 Nov', [p.len, p.lastDay, p.usedBefore], [63, '2027-01-02', 47]);
    p = C.plan(A, T, '2026-11-01', '2026-12-20');
    eq('plan 1 Nov-20 Dec fits', [p.ok, p.tripDays, p.usedAtExit], [true, 50, 77]);
    p = C.plan(A, T, '2026-11-01', '2027-01-20');
    eq('plan too long', [p.ok, p.overOn, p.lastDay], [false, '2027-01-03', '2027-01-02']);
    p = C.plan(A, T, '2026-11-01', '2027-01-02');
    eq('plan exactly to the last day', [p.ok, p.usedAtExit], [true, 90]);
    eq('plan in the past', !!C.plan(A, T, '2026-10-15').error, true);
    eq('plan exit before entry', !!C.plan(A, T, '2026-11-10', '2026-11-01').error, true);
    eq('plan clash with a trip', !!C.plan(counter([['2026-11-05', '2026-11-12']]), T, '2026-11-01', '2026-11-06').error, true);
    eq('plan blank entry', !!C.plan(A, T, '').error, true);
    let i = C.tripInfo(A, A.trips[1], T);
    eq('paris info', [i.kind, i.days, i.counting, i.goneOn, !!i.overOn], ['past', 20, 20, '2026-12-17', false]);
    i = C.tripInfo(A, A.trips[0], T);
    eq('spain no longer counts', [i.counting, i.goneOn], [0, '2026-10-12']);

    // all 90 used: 1 Jul-28 Sep (90 days)
    const F = counter([['2026-07-01', '2026-09-28']]);
    s = C.status(F, T);
    eq('full used', [s.used, s.left, s.stayToday, s.stayUntil], [90, 0, 0, null]);
    eq('full: earliest entry and full stay', [s.enterFrom, s.full], ['2026-12-28', '2026-12-28']);
    p = C.plan(F, T, '2026-12-01');
    eq('plan blocked', [p.blocked, p.enterFrom], [true, '2026-12-28']);

    // overstay: 1 May-10 Aug = 102 days
    const O = counter([['2026-05-01', '2026-08-10']]);
    s = C.status(O, T);
    eq('overstay day', [s.overDay, s.overCount], ['2026-07-30', 91]);
    i = C.tripInfo(O, O.trips[0], T);
    eq('overstay trip', [i.days, i.overOn, i.leaveBy], [102, '2026-07-30', '2026-07-29']);

    // still there: entered 1 Oct, no exit yet, plus Paris and Berlin
    const G = counter([['2026-06-01', '2026-06-20'], ['2026-08-10', '2026-09-05'], ['2026-10-01', null]]);
    s = C.status(G, T);
    eq('inside now', [!!s.inside, s.used, s.left, s.leaveBy, s.overSince], [true, 63, 27, '2026-11-12', null]);
    eq('inside info', C.tripInfo(G, G.trips[2], T).kind, 'ongoing');
    eq('plan with an open trip says so', C.plan(G, T, '2026-12-01').ongoing, true);
    // still there and already over: entered 1 Jun with nothing else, 138 days by 16 Oct
    s = C.status(counter([['2026-06-01', null]]), T);
    eq('inside and over', [s.leaveBy, s.overSince, s.over], ['2026-08-29', '2026-08-30', true]);
    // inside with a planned exit
    s = C.status(counter([['2026-10-10', '2026-10-30']]), T);
    eq('inside with exit', [s.used, s.leaveBy, s.exitOk, s.full], [7, '2027-01-07', true, '2027-01-29']);

    // overlapping trips count shared days once: 1-10 Jun and 5-15 Jun = 15 days
    const V = counter([['2026-06-01', '2026-06-10'], ['2026-06-05', '2026-06-15']]);
    eq('overlap counted once', C.status(V, '2026-06-20').used, 15);
    eq('overlap flagged', C.tripInfo(V, V.trips[0], '2026-06-20').overlap, true);
    // window edge: a day exactly 180 days back still counts, 181 days back does not
    eq('day 180 back counts', C.status(counter([['2026-04-20', '2026-04-20']]), T).used, 1);
    eq('day 181 back does not', C.status(counter([['2026-04-19', '2026-04-19']]), T).used, 0);
    // a planned trip later on limits a stay that starts now
    const P = counter([['2026-12-01', '2027-01-29']]);   // 60 days planned
    eq('planned trip limits today: 30 now + 60 later = 90', C.status(P, T).stayUntil, '2026-11-14');
    // custom rule 180 days in any 365
    eq('custom rule no trips', C.status(counter([], 180, 365), T).stayToday, 180);
    eq('rule errors', [C.ruleError(90, 180), !!C.ruleError(0, 180), !!C.ruleError(90, 90), !!C.ruleError(1.5, 10), !!C.ruleError(400, 1000)], ['', true, true, true, true]);

    // reading the form
    const E = counter([]);
    let r = C.readTrip({ entry: '2026-06-01', exit: '2026-06-20', note: '  Paris \n and Rome ' }, E, T);
    eq('read trip', [r.trip.entry, r.trip.exit, r.trip.note], ['2026-06-01', '2026-06-20', 'Paris and Rome']);
    eq('read blank', Object.keys(C.readTrip({}, E, T).errors).sort(), ['entry', 'exit']);
    eq('read exit before entry', !!C.readTrip({ entry: '2026-06-10', exit: '2026-06-01' }, E, T).errors.exit, true);
    eq('read still there', C.readTrip({ entry: '2026-10-01', still: true }, E, T).trip.exit, null);
    eq('read still there in future', !!C.readTrip({ entry: '2026-11-01', still: true }, E, T).errors.entry, true);
    eq('read second open trip', !!C.readTrip({ entry: '2026-10-05', still: true }, G, T).errors.still, true);
    eq('read too long', !!C.readTrip({ entry: '2020-01-01', exit: '2026-01-01' }, E, T).errors.exit, true);
    eq('read same day trip = 1 day', C.tripLen(C.readTrip({ entry: T, exit: T }, E, T).trip), 1);

    // saved data
    eq('validate junk', C.validate('x'), null);
    eq('validate no counters', C.validate({ counters: [] }), null);
    const v = C.validate({ counters: [{ id: 'a', name: '<b>UK</b>', n: 90, m: 180, trips: [{ id: 'x', entry: '2026-01-01', exit: '2025-01-01' }, { id: 'y', entry: '2026-02-01', exit: null }, 5] }, { n: 0, m: 5 }], cur: 'zz' });
    eq('validate keeps good parts', [v.counters.length, v.counters[0].trips.length, v.cur, v.counters[0].name], [1, 1, 'a', '<b>UK</b>']);
    const empty = C.emptyState();
    eq('empty state', [empty.counters[0].n, empty.counters[0].m, empty.counters[0].name], [90, 180, 'Schengen area']);
    const txt = C.summaryText(A, T);
    eq('summary has the answer', [txt.includes('47 of 90 days used, 43 left'), txt.includes('Thu 17 Dec 2026 (63 days)'), txt.includes('Paris and Rome')], [true, true, true]);
    const ics = C.icsEvent('2026-11-12', 'Leave the Schengen area', 'Last day', new Date('2026-10-16T00:00:00Z'));
    eq('ics', [ics.includes('DTSTART;VALUE=DATE:20261112'), ics.includes('DTEND;VALUE=DATE:20261113')], [true, true]);

    // speed: a big list and a long rule still answer quickly
    const big = []; for (let k = 0; k < 300; k++) big.push([C.addDays('2020-01-01', k * 7), C.addDays('2020-01-01', k * 7 + 2)]);
    const t0 = Date.now(); C.status(counter(big, 366, 1096), '2026-01-01'); C.status(counter(big), '2026-01-01');
    eq('fast enough', Date.now() - t0 < 1500, true);

    const msg = (fail ? out.join('\n') + '\n' : '') + pass + ' passed, ' + fail + ' failed';
    if (typeof module === 'object') { console.log(msg); process.exit(fail ? 1 : 0); }
    else { const pre = document.createElement('pre'); pre.textContent = msg; document.body.appendChild(pre); }
})();
