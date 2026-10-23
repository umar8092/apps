// Logic checks for core.js. Run with `node tests.js` or open test.html.
(function () {
    'use strict';
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : window.ServiceCore;
    let pass = 0; const fails = [];
    const eq = (got, want, name) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(name + ': got ' + g + ', want ' + w); };
    const ok = (c, name) => eq(!!c, true, name);
    const T = '2026-10-23';
    function car(odo, on) { return { id: 1, name: 'Honda City', kind: 'car', unit: 'km', readings: [{ on: on || T, r: odo, base: 0 }], jobs: [] }; }
    const job = (o) => Object.assign({ id: 2, type: 'oil', name: '', dist: 5000, time: { n: 6, u: 'm' }, history: [{ on: '2026-06-10', r: 40850, base: 0, cost: null, note: '' }] }, o || {});
    const st = (v, j, t) => C.status(v, j, t || T);
    const head = (v, j, t) => C.headline(v, j, st(v, j, t), t || T);

    // ---- numbers and dates
    eq(C.parseDist('45,210'), 45210, 'odometer with comma');
    eq(C.parseDist(' 45 210 '), 45210, 'odometer with space');
    eq(Number.isNaN(C.parseDist('45.5')), true, 'odometer with decimals rejected');
    eq(Number.isNaN(C.parseDist('-5')), true, 'negative odometer rejected');
    eq(Number.isNaN(C.parseDist('99999999')), true, 'huge odometer rejected');
    eq(Number.isNaN(C.parseDist('abc')), true, 'text odometer rejected');
    eq(C.parseDist(''), '', 'blank odometer');
    eq(C.parseDist('0'), 0, 'zero odometer allowed (new vehicle)');
    eq(C.parseMoney('3,500.50'), 350050, 'cost with comma and cents');
    eq(C.parseMoney('Rs 1250.5'), 125050, 'cost with symbol and one decimal');
    eq(C.parseMoney('0'), 0, 'zero cost');
    eq(C.parseMoney(''), '', 'blank cost');
    eq(Number.isNaN(C.parseMoney('-3')), true, 'negative cost rejected');
    eq(Number.isNaN(C.parseMoney('abc')), true, 'text cost rejected');
    eq(C.fmt(350050, 'Rs'), 'Rs 3,500.50', 'money format with symbol');
    eq(C.fmt(1240000, ''), '12,400', 'money format plain');
    eq(C.addMonths('2026-08-31', 6), '2027-02-28', '31 Aug + 6 months is 28 Feb');
    eq(C.addMonths('2027-08-31', 6), '2028-02-29', 'leap year end of month');
    eq(C.dist(1, 'mi'), '1 mile', 'one mile');
    eq(C.dist(45210, 'km'), '45,210 km', 'km grouping');
    eq(C.jobType('car', 'oil').d, [5000, 3000], 'car oil default km and miles');
    eq(C.jobType('bike', 'oil').d, [1000, 600], 'bike oil default');

    // ---- the main situation: oil done 10 Jun at 40,850 km, every 5,000 km or 6 months, odometer now 45,210
    let v = car(45210), j = job(); v.jobs.push(j);
    let s = st(v, j);
    eq([s.level, s.left, s.dueAt, s.dueOn], ['ok', 640, 45850, '2026-12-10'], 'main: 640 km left, due 10 Dec');
    eq(head(v, j), 'Due in 640 km or by Thu 10 Dec 2026 (in 6 weeks), whichever comes first', 'main headline');
    eq(C.detail(v, j, s, T), 'Watch for 45,850 km on the odometer.', 'main detail');
    eq(C.everyText(v, j), 'Every 5,000 km or every 6 months', 'every text');
    eq(C.lastText(v, j, T), 'Last done 10 Jun 2026 at 40,850 km', 'last text');

    // soon by distance (500 km is 10% of 5,000)
    v = car(45400); j = job(); v.jobs.push(j); s = st(v, j);
    eq([s.level, s.left], ['soon', 450], 'due soon at 450 km left');
    // due now exactly
    v = car(45850); j = job(); v.jobs.push(j);
    eq(st(v, j).level, 'due', 'due now at exactly the reading');
    eq(head(v, j), 'Due now: the odometer has reached 45,850 km', 'due now headline');
    // overdue by distance
    v = car(47050); j = job(); v.jobs.push(j);
    eq(st(v, j).level, 'over', 'overdue by km');
    eq(head(v, j), 'Overdue by 1,200 km', 'overdue km headline');
    eq(C.detail(v, j, st(v, j), T), 'Was due at 45,850 km.', 'overdue km detail');
    // overdue by time only (hardly driven)
    v = car(41000); j = job({ history: [{ on: '2026-03-01', r: 40850, base: 0, cost: null, note: '' }] }); v.jobs.push(j);
    s = st(v, j);
    eq([s.level, s.dueOn, s.left], ['over', '2026-09-01', 4850], 'overdue by date with km to spare');
    eq(head(v, j), 'Overdue by 7 weeks', 'overdue time headline');
    // overdue both ways
    v = car(47050); j = job({ history: [{ on: '2026-03-01', r: 40850, base: 0, cost: null, note: '' }] }); v.jobs.push(j);
    eq(head(v, j), 'Overdue by 1,200 km and 7 weeks late', 'overdue both');
    // time-only job: insurance every 12 months, last 1 Nov 2025
    v = car(45210); j = job({ type: 'insurance', dist: 0, time: { n: 12, u: 'm' }, history: [{ on: '2025-11-01', r: null, base: 0, cost: null, note: '' }] }); v.jobs.push(j);
    s = st(v, j);
    eq([s.level, s.dueOn, s.daysLeft], ['soon', '2026-11-01', 9], 'insurance due soon in 9 days');
    eq(head(v, j), 'Due by Sun 1 Nov 2026 (in 9 days)', 'time-only headline');
    // weeks: chain every 2 weeks from 10 Oct
    v = { id: 1, name: 'Bike', kind: 'bike', unit: 'km', readings: [{ on: T, r: 12000, base: 0 }], jobs: [] };
    j = job({ type: 'chain', dist: 0, time: { n: 2, u: 'w' }, history: [{ on: '2026-10-10', r: null, base: 0, cost: null, note: '' }] }); v.jobs.push(j);
    eq(head(v, j), 'Due by Sat 24 Oct 2026 (tomorrow)', 'every 2 weeks, due tomorrow');
    eq(C.jobTitle(v, j), 'Chain clean, lube and adjust', 'bike job title');
    // due today by date
    j.history[0].on = '2026-10-09'; eq([st(v, j).level, head(v, j)], ['due', 'Due today'], 'due today by date');
    // distance-only job, miles
    v = { id: 1, name: 'Ford', kind: 'car', unit: 'mi', readings: [{ on: T, r: 30100, base: 0 }], jobs: [] };
    j = job({ type: 'rotation', dist: 6000, time: null, history: [{ on: '2026-01-05', r: 27000, base: 0, cost: null, note: '' }] }); v.jobs.push(j);
    eq(head(v, j), 'Due in 2,900 miles', 'miles, distance only');
    // estimate from readings: 44,440 on 1 Oct to 45,210 on 23 Oct = 35 km a day
    v = car(45210); v.readings.unshift({ on: '2026-10-01', r: 44440, base: 0 }); j = job(); v.jobs.push(j);
    s = st(v, j);
    eq([C.perDay(v, T), s.estOn, s.first], [35, '2026-11-11', 'dist'], 'estimate 35 km a day, about 11 Nov');
    eq(C.detail(v, j, s, T), 'Watch for 45,850 km on the odometer. About 11 Nov at your usual 35 km a day, so the distance will come first.', 'estimate detail');
    // readings less than a week apart give no estimate
    v.readings[0].on = '2026-10-20'; eq(C.perDay(v, T), 0, 'no estimate under 7 days');
    // a distance job with no reading at all
    v = car(0); v.readings = []; j = job(); v.jobs.push(j);
    s = st(v, j); eq([s.needReading, s.left], [true, undefined], 'no reading: needs one');

    // ---- odometer readings and a replaced meter
    let S = C.emptyState(); v = car(48210, '2026-10-20'); S.vehicles.push(v);
    eq(C.addReading(S, v, '200', T, false), 'LOWER', 'lower reading asks first');
    eq(v.readings.length, 1, 'lower reading not saved without an answer');
    eq(C.addReading(S, v, '200', T, true), '', 'replaced meter accepted');
    eq([C.curTotal(v), C.curBase(v)], [48210, 48010], 'total keeps counting after reset');
    j = job({ dist: 5000, time: null, history: [{ on: '2026-08-01', r: 45000, base: 0, cost: null, note: '' }] }); v.jobs.push(j);
    s = st(v, j); eq([s.left, s.dueAt], [1790, 1990], 'after reset: 1,790 km left, watch for 1,990 on the new meter');
    eq(C.addReading(S, v, '500', T, false), '', 'same-day reading replaces');
    eq([v.readings.length, st(v, j).left], [2, 1490], 'same day keeps one reading');
    eq(C.addReading(S, v, '', T, false), 'Type the number on the odometer.', 'blank reading');
    eq(C.addReading(S, v, '12.5', T, false), 'Type the odometer as a whole number, like 45210.', 'decimal reading');
    eq(/later reading/.test(C.addReading(S, v, '900', '2026-10-01', false)), true, 'reading before the last one refused');

    // ---- marking done
    S = C.emptyState(); v = car(45210); S.vehicles.push(v); j = job(); v.jobs.push(j);
    eq(C.markDone(S, v, j, { on: T, reading: '45210', cost: '3,500', note: ' Ali  Motors ' }, T).err, '', 'done early');
    s = st(v, j); eq([s.left, s.dueOn, j.history.length, j.history[1].cost, j.history[1].note], [5000, '2027-04-23', 2, 350000, 'Ali Motors'], 'done early resets from today');
    eq(C.markDone(S, v, j, { on: '2026-10-24', reading: '45210' }, T).field, 'on', 'future done date refused');
    eq(C.markDone(S, v, j, { on: T, reading: '' }, T).field, 'reading', 'distance job needs a reading');
    eq(C.markDone(S, v, j, { on: T, reading: '44000' }, T).field, 'reading', 'lower than the odometer today refused');
    eq(C.markDone(S, v, j, { on: T, reading: '45300', cost: 'abc' }, T).field, 'cost', 'bad cost refused');
    eq(C.markDone(S, v, j, { on: '2026-09-01', reading: '43000' }, T).err, '', 'an older service with a lower reading is fine');
    eq(C.curTotal(v), 45210, 'older service does not move the odometer');
    eq(C.lastDone(j).on, T, 'latest service still counts');
    eq(C.markDone(S, v, j, { on: T, reading: '45600' }, T).err, '', 'done with a higher reading today');
    eq(C.curTotal(v), 45600, 'a higher reading moves the odometer on');
    const ins = job({ id: 9, type: 'insurance', dist: 0, time: { n: 12, u: 'm' }, history: [{ on: '2025-11-01', r: null, base: 0, cost: null, note: '' }] }); v.jobs.push(ins);
    eq(C.markDone(S, v, ins, { on: T, reading: '' }, T).err, '', 'time-only job without a reading');
    eq(st(v, ins).dueOn, '2027-10-23', 'insurance renewed today, due next year');
    eq(C.spent(v, T), { year: 350000, all: 350000, n: 1 }, 'spent this year');

    // ---- the form
    S = C.emptyState();
    const F = o => Object.assign({ vehicle: 'new', vName: 'Honda City', vKind: 'car', vUnit: 'km', vOdo: '45210', type: 'oil', name: '', dist: '5000', timeN: '6', timeU: 'm', lastOn: '2026-06-10', lastAt: '40850' }, o);
    let r = C.readForm(F(), S, T);
    eq(r.errs, null, 'valid form');
    eq(C.previewText(r, T), 'OK: due in 640 km or by Thu 10 Dec 2026 (in 6 weeks), whichever comes first.', 'form preview');
    eq(Object.keys(C.readForm(F({ vName: ' ' }), S, T).errs), ['vName'], 'blank vehicle name');
    eq(Object.keys(C.readForm(F({ vOdo: '' }), S, T).errs), ['vOdo'], 'blank odometer');
    eq(Object.keys(C.readForm(F({ dist: '', timeN: '' }), S, T).errs), ['dist'], 'both intervals empty');
    eq(Object.keys(C.readForm(F({ dist: '0' }), S, T).errs), ['dist'], 'zero km refused');
    eq(Object.keys(C.readForm(F({ timeN: '121' }), S, T).errs), ['time'], '121 months refused');
    eq(C.readForm(F({ timeN: '200', timeU: 'w' }), S, T).errs, null, '200 weeks fine');
    eq(Object.keys(C.readForm(F({ lastOn: '2026-10-30' }), S, T).errs), ['lastOn'], 'future last date');
    eq(Object.keys(C.readForm(F({ lastAt: '50000' }), S, T).errs), ['lastAt'], 'last done above the odometer');
    eq(Object.keys(C.readForm(F({ lastAt: '' }), S, T).errs), ['lastAt'], 'distance job needs last reading');
    eq(C.readForm(F({ dist: '', lastAt: '' }), S, T).errs, null, 'time-only job needs no reading');
    eq(Object.keys(C.readForm(F({ type: 'other', name: '' }), S, T).errs), ['name'], 'something else needs a name');
    const made = C.applyForm(S, r, T);
    eq([S.vehicles.length, made.v.readings, made.j.history.length], [1, [{ on: T, r: 45210, base: 0 }], 1], 'apply makes the vehicle and job');
    eq(Object.keys(C.readForm(F({ vName: 'honda city' }), S, T).errs), ['vName'], 'same vehicle name twice');
    eq(Object.keys(C.readForm(F({ vehicle: String(made.v.id) }), S, T).errs), ['type'], 'same service twice on one vehicle');
    r = C.readForm(F({ vehicle: String(made.v.id), dist: '7000', lastAt: '41000' }), S, T, made.j.id);
    eq(r.errs, null, 'edit form valid');
    C.applyForm(S, r, T, made.j.id);
    eq([made.j.dist, made.j.history.length, C.lastDone(made.j).r], [7000, 1, 41000], 'edit changes the job and its last entry');
    r = C.readForm(F({ vehicle: String(made.v.id), type: 'airfilter', dist: '15000', timeN: '12', lastAt: '45210', lastOn: T }), S, T);
    C.applyForm(S, r, T);
    eq(made.v.jobs.length, 2, 'second job added');

    // ---- across vehicles, sharing, calendar
    S = C.emptyState();
    const a = car(47050); a.jobs.push(job()); a.jobs.push(job({ id: 3, type: 'airfilter', dist: 15000, time: { n: 12, u: 'm' }, history: [{ on: '2026-06-10', r: 40850, base: 0, cost: null, note: '' }] }));
    const b = { id: 5, name: 'My bike', kind: 'bike', unit: 'km', readings: [{ on: T, r: 12000, base: 0 }], jobs: [job({ id: 6, type: 'oil', dist: 1000, time: { n: 3, u: 'm' }, history: [{ on: '2026-10-01', r: 11500, base: 0, cost: 120000, note: '' }] })] };
    S.vehicles.push(a, b);
    eq(C.sortJobs(a, T).map(x => x.j.type), ['oil', 'airfilter'], 'overdue first');
    eq(C.todo(S, T).map(x => x.v.name + ' ' + x.j.type), ['Honda City oil'], 'only overdue/soon in the todo list');
    const nx = C.nextUp(S, T); eq(nx.v.name + ' ' + nx.j.type, 'My bike oil', 'next up is the soonest OK service');
    const mt = C.mechanicText(S, S.vehicles, T);
    ok(mt.includes('Honda City (odometer 47,050 km on 23 Oct 2026)') && mt.includes('- Engine oil and oil filter: overdue by 1,200 km') && mt.includes('- Nothing due now.'), 'mechanic text');
    const ft = C.fullText(S, T, 'Rs');
    ok(ft.includes('Spent on services: Rs 1,200 this year, Rs 1,200 in all.') && ft.includes('[Overdue]'), 'full text');
    const cal = C.ics(S, S.vehicles, T, '20261023T000000Z');
    eq(cal.count, 3, 'calendar has the three date-based due days still to come');
    ok(cal.text.includes('DTSTART;VALUE=DATE:20261210') && cal.text.includes('SUMMARY:Honda City: Engine oil and oil filter due') && cal.text.includes('\\,'), 'calendar content and escaping');
    ok(cal.text.split('\r\n').every(l => l.length <= 75), 'calendar lines folded');

    // ---- saved state
    eq(C.validate(null), null, 'null state');
    eq(C.validate({ vehicles: 'x' }), null, 'bad vehicles');
    const bad = { nextId: 'x', vehicles: [
        { id: 1, name: 'A', kind: 'truck', unit: 'yards', readings: [{ on: '2026-10-05', r: 200, base: 0 }, { on: '2026-10-01', r: 100 }, { on: 'bad', r: 5 }, { on: T, r: -1 }],
            jobs: [{ id: 2, type: 'oil', dist: 5000, time: null, history: [{ on: '2026-01-01', r: 50, cost: -5, note: 7 }] }, { id: 3, type: 'oil', dist: 0, time: null, history: [{ on: T }] },
                { id: 4, type: 'zzz', name: '<b>x</b>', dist: 100, time: { n: 3, u: 'm' }, history: [] }, { id: 5, type: 'zzz', name: '', dist: 0, time: { n: 3, u: 'w' }, history: [{ on: T, r: 'x' }] }] },
        { id: 1, name: 'dup id' }, { id: 7, name: 'a' }, { id: 8, name: '' }, 'junk'] };
    const g = C.validate(bad);
    eq(g.vehicles.length, 1, 'bad vehicles dropped');
    eq([g.vehicles[0].kind, g.vehicles[0].unit], ['car', 'km'], 'unknown kind and unit fall back');
    eq(g.vehicles[0].readings, [{ on: '2026-10-01', r: 100, base: 0 }, { on: '2026-10-05', r: 200, base: 0 }], 'readings cleaned and sorted');
    eq(g.vehicles[0].jobs.map(x => x.id), [2, 5], 'jobs without interval or history dropped');
    eq(g.vehicles[0].jobs[0].history[0], { on: '2026-01-01', r: 50, base: 0, cost: null, note: '7' }, 'history cleaned');
    eq([g.vehicles[0].jobs[1].type, g.vehicles[0].jobs[1].name, g.vehicles[0].jobs[1].history[0].r], ['other', 'Service', null], 'unknown type becomes something else');
    eq(g.nextId, 6, 'next id after the largest');
    const rt = C.validate(JSON.parse(JSON.stringify(S)));
    eq(rt.vehicles, S.vehicles, 'a real state survives a save and load');

    const msg = pass + ' passed, ' + fails.length + ' failed' + (fails.length ? '\n - ' + fails.join('\n - ') : '');
    if (typeof module !== 'undefined' && module.exports) { console.log(msg); if (fails.length) process.exit(1); }
    else { const p = document.createElement('pre'); p.textContent = msg; document.body.appendChild(p); }
})();
