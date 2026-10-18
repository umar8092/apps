// Logic checks for core.js. Run: node tests.js  (or open test.html in a browser)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.PlantCore;
    let pass = 0, failed = 0; const out = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); } };
    const T = '2026-10-18';   // a Sunday
    let nid = 1;
    const plant = o => Object.assign({ id: nid++, name: 'Plant', every: 7, winterEvery: 0, last: '2026-10-15', snooze: '', history: [], place: '', note: '', feedEvery: 0, lastFed: '', feedPauseWinter: false, status: 'active', added: T }, o);
    const form = o => Object.assign({ name: 'Basil', every: '2', everyCustom: '', winterOn: false, winter: '7', winterCustom: '', last: T, place: '', note: '', feedOn: false, feed: '28', feedCustom: '', lastFed: '', pauseWinter: true }, o);

    // ---- words
    eq(C.everyText(1), 'every day', 'every day');
    eq(C.everyText(3), 'every 3 days', 'every 3 days');
    eq(C.everyText(7), 'every week', 'every week');
    eq(C.everyText(14), 'every 2 weeks', 'every 2 weeks');
    eq(C.everyText(10), 'every 10 days', 'every 10 days');
    eq(C.rel(T, '2026-10-19'), 'tomorrow', 'tomorrow');
    eq(C.rel(T, '2026-10-17'), 'yesterday', 'yesterday');
    eq(C.rel(T, '2026-10-24'), 'in 6 days', 'in 6 days');
    eq(C.shortDate('2026-10-18', T), 'Sun 18 Oct', 'short date this year');
    eq(C.shortDate('2027-01-02', T), 'Sat 2 Jan 2027', 'short date next year');

    // ---- Sara's plants on Sun 18 Oct 2026
    const monstera = plant({ name: 'Monstera', every: 7, winterEvery: 14, last: '2026-10-11', place: 'living room', feedEvery: 28, lastFed: '2026-09-20', feedPauseWinter: true });
    const basil = plant({ name: 'Basil', every: 2, last: '2026-10-15', place: 'kitchen window', note: 'Water from below' });
    const fern = plant({ name: 'Fern', every: 3, last: '2026-10-17', place: 'bathroom' });
    const snake = plant({ name: 'Snake plant', every: 21, winterEvery: 28, last: '2026-10-03' });
    const lily = plant({ name: 'Peace lily', every: 5, last: '2026-10-14' });
    const aloe = plant({ name: 'Aloe vera', every: 14, last: '2026-10-09' });
    const all = [monstera, basil, fern, snake, lily, aloe];
    eq(C.nextWater(monstera, T, 'summer'), '2026-10-18', 'monstera due today');
    eq(C.waterLine(monstera, T, 'summer'), 'Water today', 'monstera line');
    eq(C.waterLine(basil, T, 'summer'), 'Water now: 1 day late (was due Sat 17 Oct)', 'basil late');
    eq(C.waterLine(fern, T, 'summer'), 'Water Tue 20 Oct (in 2 days)', 'fern');
    eq(C.waterLine(lily, T, 'summer'), 'Water tomorrow, Mon 19 Oct', 'lily tomorrow');
    eq(C.waterLine(snake, T, 'summer'), 'Water Sat 24 Oct (in 6 days)', 'snake');
    eq(C.waterLine(aloe, T, 'summer'), 'Water Fri 23 Oct (in 5 days)', 'aloe');
    eq(C.feedLine(monstera, T, 'summer'), 'Plant food: due today', 'monstera feed due');
    eq(C.feedDue(monstera, T, 'summer'), true, 'feed due flag');
    eq(C.feedLine(basil, T, 'summer'), '', 'no feed line without feeding');
    eq(C.subLine(monstera, T, 'summer'), 'living room · Water every week (winter: every 2 weeks) · last watered Sun 11 Oct (7 days ago)', 'monstera sub');
    eq(C.subLine(basil, T, 'summer'), 'kitchen window · Water every 2 days · last watered Thu 15 Oct (3 days ago)', 'basil sub');
    const g = C.groups(all, T, 'summer');
    eq(g.now.map(p => p.name), ['Basil', 'Monstera'], 'water now group, latest first');
    eq(g.later.map(p => p.name), ['Peace lily', 'Fern', 'Aloe vera', 'Snake plant'], 'coming up sorted by date');
    eq(g.now.map(p => C.dueName(p, T, 'summer')), ['Basil (1 day late)', 'Monstera'], 'summary names');
    eq(C.usesSeason(all), true, 'season switch shown when a plant has a winter number');
    eq(C.usesSeason([basil, fern]), false, 'season switch hidden otherwise');

    // ---- winter
    eq(C.nextWater(monstera, T, 'winter'), '2026-10-25', 'monstera winter every 14 days');
    eq(C.subLine(monstera, T, 'winter'), 'living room · Water every 2 weeks (winter; summer every week) · last watered Sun 11 Oct (7 days ago)', 'winter sub line');
    eq(C.nextWater(snake, T, 'winter'), '2026-10-31', 'snake winter 28 days');
    eq(C.nextWater(basil, T, 'winter'), '2026-10-17', 'no winter number: same as summer');
    eq(C.feedLine(monstera, T, 'winter'), 'Plant food: paused for winter', 'feeding paused in winter');
    eq(C.feedDue(monstera, T, 'winter'), false, 'paused feed is not due');
    eq(C.groups(all, T, 'winter').now.map(p => p.name), ['Basil'], 'winter: only basil today');

    // ---- actions
    const b2 = C.watered(basil, T);
    eq(b2.last, T, 'watered sets last');
    eq(C.waterLine(b2, T, 'summer'), 'Water Tue 20 Oct (in 2 days)', 'basil after watering');
    eq(basil.last, '2026-10-15', 'original untouched');
    eq(C.watered(b2, T).history, [T], 'watered twice on the same day keeps one date');
    const early = C.watered(fern, T);   // fern was due Tue 20, watered early
    eq(C.nextWater(early, T, 'summer'), '2026-10-21', 'watered early: counts from today');
    const wet = C.stillWet(basil, T, 1);
    eq(C.nextWater(wet, T, 'summer'), '2026-10-19', 'still wet moves to tomorrow');
    eq(C.waterLine(wet, T, 'summer'), 'Soil was still wet: check again tomorrow', 'still wet line');
    eq(C.waterLine(wet, '2026-10-19', 'summer'), 'Check the soil today and water if it is dry', 'still wet on the day');
    eq(C.groups([wet], T, 'summer').later.length, 1, 'still wet goes to coming up');
    eq(C.nextWater(C.watered(wet, T), T, 'summer'), '2026-10-20', 'watering clears still wet');
    eq(C.nextWater(C.stillWet(fern, T, 1), T, 'summer'), '2026-10-20', 'still wet never brings a date forward');
    const fedM = C.fed(monstera, T);
    eq(C.feedLine(fedM, T, 'summer'), 'Plant food: Sun 15 Nov (in 4 weeks)', 'fed: next in 28 days');
    const newPlant = plant({ name: 'Cactus', every: 21, last: '' });
    eq(C.nextWater(newPlant, T, 'summer'), T, 'not sure when watered: due today');
    eq(C.waterLine(newPlant, T, 'summer'), 'Water today (no watering recorded yet)', 'never watered line');
    eq(C.subLine(newPlant, T, 'summer'), 'Water every 3 weeks · not watered yet', 'never watered sub');
    eq(C.feedLine(plant({ feedEvery: 14, lastFed: '' }), T, 'summer'), 'Plant food: due today (no feed recorded yet)', 'feed never recorded');
    eq(C.feedLine(plant({ feedEvery: 14, lastFed: '2026-09-30' }), T, 'summer'), 'Plant food: 4 days late (was due Wed 14 Oct)', 'feed late');
    eq(C.waterLine(plant({ every: 1, last: '2026-09-18' }), T, 'summer'), 'Water now: 29 days late (was due Sat 19 Sep)', 'long late');
    // average gap
    eq(C.averageGap(plant({ history: ['2026-10-01', '2026-10-07', '2026-10-14'] })), 6.5, 'average of 6 and 7 days');
    eq(C.averageGap(plant({ history: ['2026-10-01', '2026-10-07'] })), 0, 'too few waterings for an average');
    // month and year ends
    eq(C.nextWater(plant({ every: 3, last: '2026-12-30' }), T, 'summer'), '2027-01-02', 'crosses the new year');
    eq(C.nextWater(plant({ every: 2, last: '2028-02-28' }), T, 'summer'), '2028-03-01', 'leap year February');

    // ---- going away: Sat 24 Oct to Sun 1 Nov, everything watered Fri 23 Oct
    const plan = C.tripPlan(all, '2026-10-24', '2026-11-01', true, T, 'summer');
    eq(plan.dates.map(x => x.date + ' ' + x.plants.map(p => p.name).join('+')),
        ['2026-10-25 Basil', '2026-10-26 Fern', '2026-10-27 Basil', '2026-10-28 Peace lily', '2026-10-29 Basil+Fern', '2026-10-30 Monstera', '2026-10-31 Basil', '2026-11-01 Fern'], 'sitter days');
    eq(plan.none.map(p => p.name), ['Aloe vera', 'Snake plant'], 'no water needed');
    const tt = C.tripText(all, '2026-10-24', '2026-11-01', true, T, 'summer').text;
    eq(tt.split('\n').slice(0, 4), ['Watering my plants while I am away: Sat 24 Oct to Sun 1 Nov (9 days)', 'I water all of them on Fri 23 Oct, the day before I leave.', '', 'Sun 25 Oct: Basil (kitchen window)'], 'trip text top');
    eq(tt.includes('Thu 29 Oct: Basil (kitchen window), Fern (bathroom)'), true, 'trip text two plants a day');
    eq(tt.includes('No water needed while I am away: Aloe vera, Snake plant.'), true, 'trip text none');
    eq(tt.includes('Notes:\n- Basil: Water from below'), true, 'trip notes');
    // without watering everything first: each plant keeps its own days
    const plan2 = C.tripPlan(all, '2026-10-24', '2026-11-01', false, T, 'summer');
    const byName = n => plan2.dates.filter(x => x.plants.some(p => p.name === n)).map(x => x.date.slice(5));
    eq(byName('Basil'), ['10-24', '10-26', '10-28', '10-30', '11-01'], 'basil own rhythm from today (late)');
    eq(byName('Fern'), ['10-26', '10-29', '11-01'], 'fern own rhythm');
    eq(byName('Monstera'), ['10-25', '11-01'], 'monstera own rhythm');
    eq(byName('Peace lily'), ['10-24', '10-29'], 'lily own rhythm');
    eq(byName('Snake plant'), ['10-24'], 'snake due on the first day away');
    eq(plan2.none.map(p => p.name), ['Aloe vera'], 'aloe none');
    // winter changes the plan
    eq(C.tripPlan([monstera], '2026-10-24', '2026-11-01', true, T, 'winter').none.length, 1, 'winter monstera needs nothing in 9 days');
    // gone plants are left out, empty list
    eq(C.tripPlan([Object.assign({}, basil, { status: 'gone' })], '2026-10-24', '2026-10-30', true, T, 'summer').dates.length, 0, 'gone plants left out');
    eq(C.tripText([], '2026-10-24', '2026-10-24', false, T, 'summer').text.includes('Nothing needs water while I am away.'), true, 'empty trip');
    eq(C.tripText([basil], T, T, false, T, 'summer').text.split('\n')[0], 'Watering my plants while I am away: Sun 18 Oct to Sun 18 Oct (1 day)', 'one day trip');
    eq(C.checkTrip('', '', T).field, 'from', 'trip needs from');
    eq(C.checkTrip('2026-10-17', '2026-10-20', T).field, 'from', 'trip not in the past');
    eq(C.checkTrip('2026-10-24', '2026-10-20', T).field, 'to', 'to before from');
    eq(C.checkTrip('2026-10-24', '', T).field, 'to', 'trip needs to');
    eq(C.checkTrip('2026-10-24', '2027-03-01', T).field, 'to', 'trip too long');
    eq(C.checkTrip('2026-10-24', '2026-11-01', T), null, 'trip fine');

    // ---- the copy text
    const lt = C.listText(all, T, 'summer');
    eq(lt.split('\n')[0], 'My plants, Sun 18 Oct 2026', 'list title');
    eq(lt.includes('Water today:\n- Basil (kitchen window): water now: 1 day late (was due Sat 17 Oct), every 2 days. Water from below\n- Monstera (living room): water today, every week'), true, 'list text now');
    eq(lt.includes('Coming up:\n- Peace lily: water tomorrow, Mon 19 Oct, every 5 days'), true, 'list text later');
    eq(C.listText([], T, 'summer'), '', 'empty list text');

    // ---- the form
    let r = C.readForm(form(), T, [], null);
    eq(r.plant, { name: 'Basil', every: 2, winterEvery: 0, last: T, place: '', note: '', feedEvery: 0, lastFed: '', feedPauseWinter: false }, 'simple form');
    eq(C.readForm(form({ name: '   ' }), T, [], null).errors.name !== undefined, true, 'blank name');
    eq(C.readForm(form({ name: '  Big   fern  ' }), T, [], null).plant.name, 'Big fern', 'name spaces tidied');
    eq(C.readForm(form({ name: 'x'.repeat(200) }), T, [], null).plant.name.length, 60, 'very long name cut');
    eq(C.readForm(form({ every: 'custom', everyCustom: '10' }), T, [], null).plant.every, 10, 'custom days');
    ['0', '-3', '2.5', '91', '', 'abc', '1e2'].forEach(v => eq(!!C.readForm(form({ every: 'custom', everyCustom: v }), T, [], null).errors.every, true, 'bad custom days ' + v));
    eq(C.readForm(form({ every: 'custom', everyCustom: ' 90 ' }), T, [], null).plant.every, 90, 'max days with spaces');
    eq(C.readForm(form({ last: '' }), T, [], null).plant.last, '', 'not sure');
    eq(!!C.readForm(form({ last: '2026-10-19' }), T, [], null).errors.last, true, 'future last watering');
    eq(!!C.readForm(form({ last: '2026-02-30' }), T, [], null).errors.last, true, 'impossible date');
    eq(C.readForm(form({ winterOn: true, winter: '14' }), T, [], null).plant.winterEvery, 14, 'winter number');
    eq(C.readForm(form({ winterOn: false, winter: '14' }), T, [], null).plant.winterEvery, 0, 'winter number ignored when off');
    eq(!!C.readForm(form({ winterOn: true, winter: 'custom', winterCustom: '0' }), T, [], null).errors.winter, true, 'bad winter number');
    r = C.readForm(form({ feedOn: true, feed: '28', lastFed: '2026-10-01', pauseWinter: true }), T, [], null).plant;
    eq([r.feedEvery, r.lastFed, r.feedPauseWinter], [28, '2026-10-01', true], 'feeding');
    eq(C.readForm(form({ feedOn: false, lastFed: '2026-10-01' }), T, [], null).plant.lastFed, '', 'feed fields ignored when off');
    eq(!!C.readForm(form({ feedOn: true, feed: 'custom', feedCustom: '181' }), T, [], null).errors.feed, true, 'feed too long');
    eq(!!C.readForm(form({ feedOn: true, lastFed: '2026-12-01' }), T, [], null).errors.lastFed, true, 'feed in the future');
    eq(C.readForm(form({ note: '  line one\r\nline two  ' }), T, [], null).plant.note, 'line one\nline two', 'note tidied');
    eq(C.readForm(form({ name: 'basil' }), T, [basil], null).warn, '', 'same name, different place: no warning');
    eq(C.readForm(form({ name: 'basil', place: 'Kitchen window' }), T, [basil], null).warn, 'You already have a plant called basil in Kitchen window. Both are kept.', 'same name and place warns');
    eq(C.readForm(form({ name: 'Basil', place: 'kitchen window' }), T, [basil], basil.id).warn, '', 'editing itself does not warn');

    // ---- calendar
    const ics = C.icsDaily('08:30', T, 'https://umar8092.github.io/apps/plant-watering-schedule-for-houseplants/');
    eq(ics.includes('DTSTART:20261018T083000\r\nDTEND:20261018T084500\r\nRRULE:FREQ=DAILY'), true, 'daily reminder');
    eq(C.icsDaily('23:50', T, '').includes('DTEND:20261019T000500'), true, 'reminder crossing midnight');
    eq(C.icsDaily('bad', T, '').includes('DTSTART:20261018T090000'), true, 'bad time falls back to 9:00');

    // ---- saved data
    eq(C.validate(null), null, 'null state');
    eq(C.validate({ plants: 'x' }), null, 'plants not a list');
    const v = C.validate({ season: 'autumn', nextId: 2, plants: [basil, { id: 'x', name: 'Bad', every: 3 }, { id: 99, name: '', every: 3 }, { id: 98, name: 'Huge', every: 500 },
        Object.assign({}, fern, { last: '2026-13-40', history: ['2026-10-01', 'nope', '2026-10-01'], winterEvery: -2, feedEvery: 9999, status: 'weird' }), Object.assign({}, basil)] });
    eq(v.season, 'summer', 'unknown season becomes summer');
    eq(v.plants.map(p => p.name), ['Basil', 'Fern'], 'bad plants and duplicate ids dropped');
    eq([v.plants[1].last, v.plants[1].history, v.plants[1].winterEvery, v.plants[1].feedEvery, v.plants[1].status], ['', ['2026-10-01'], 0, 0, 'active'], 'bad fields cleaned');
    eq(v.nextId > Math.max(basil.id, fern.id), true, 'next id above every id');
    eq(C.validate({ plants: [], season: 'winter', trip: { from: '2026-10-24', to: 'x', beforeAll: false } }).trip, { from: '2026-10-24', to: '', beforeAll: false }, 'trip restored and cleaned');

    const summary = pass + ' passed, ' + failed + ' failed';
    if (typeof document !== 'undefined') { const pre = document.createElement('pre'); pre.textContent = summary + '\n' + out.join('\n'); document.body.appendChild(pre); }
    else { out.forEach(l => console.log(l)); console.log(summary); if (failed) process.exit(1); }
})();
