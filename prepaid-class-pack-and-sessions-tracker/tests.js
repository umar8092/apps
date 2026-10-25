// Logic checks for core.js. Run with: node tests.js   (or open test.html)
(function () {
    'use strict';
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : window.PackCore;
    let pass = 0; const fails = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(what + '\n   got:  ' + g + '\n   want: ' + w); };
    const ok = (v, what) => eq(!!v, true, what);
    const T = '2026-10-25';   // a Sunday
    const pk = (o) => Object.assign({ id: 1, name: 'Swimming lessons', people: ['Ali'], size: 10, start: '2026-10-01', expiry: '2026-11-30', cents: 600000, note: '', usedBefore: 0, carried: 0, archived: '', added: '2026-10-01' }, o);
    const st = (packs, uses) => C.validate({ v: 1, nextId: 1, packs, uses: uses || [] });
    const goes = (pack, dates, kind, who) => dates.map((d, i) => ({ id: 100 + i, pack, date: d, kind: kind || 'went', who: who || '', note: '' }));

    // ---- dates
    eq(C.lastDayAfter('2026-10-01', 3), '2026-12-31', '3 months from 1 Oct ends 31 Dec');
    eq(C.lastDayAfter('2026-01-31', 1), '2026-02-27', '1 month from 31 Jan: last day 27 Feb (28 Feb is the start of the next month)');
    eq(C.lastDayAfter('2028-02-29', 12), '2029-02-27', '1 year from 29 Feb (leap)');
    eq(C.length('2026-10-01', '2026-12-31'), '3 months', 'length in months');
    eq(C.length('2026-10-01', '2027-09-30'), '1 year', 'length in years');
    eq(C.length('2026-10-01', '2026-10-14'), '2 weeks', 'length in weeks');
    eq(C.length('2026-10-01', '2026-10-10'), '10 days', 'length in days');
    eq(C.shortDate('2026-11-30', T), 'Mon 30 Nov', 'short date this year');
    eq(C.shortDate('2027-01-24', T), 'Sun 24 Jan 2027', 'short date next year');

    // ---- money
    eq(C.parseMoney('6,000').cents, 600000, 'price with a comma');
    eq(C.parseMoney(' 89.5 ').cents, 8950, 'price with one decimal and spaces');
    eq(C.parseMoney('').cents, null, 'blank price is fine');
    ok(C.parseMoney('-5').error, 'negative price refused');
    ok(C.parseMoney('abc').error, 'text price refused');
    ok(C.parseMoney('1.234').error, 'three decimals refused');
    ok(C.parseMoney('9999999999').error, 'huge price refused');
    eq(C.money(123456789, 'Rs'), 'Rs 1,234,567.89', 'money with symbol');
    eq(C.money(60000, ''), '600', 'money, plain number');
    eq(C.money(60000, '$'), '$600', 'money with $');

    // ---- the main situation: 10 swimming lessons for 6,000 from 1 Oct, last day 30 Nov, 6 used, today 25 Oct
    let s = st([pk()], goes(1, ['2026-10-01', '2026-10-04', '2026-10-08', '2026-10-11', '2026-10-15', '2026-10-18'], 'went', 'Ali'));
    let r = C.status(s, s.packs[0], T, 'Rs');
    eq(r.big, '4 of 10 left', 'main: 4 of 10 left');
    eq(r.s.daysLeft, 37, 'main: 37 usable days, today and 30 Nov included');
    eq(r.head, 'Last day to use it: Mon 30 Nov (in 5 weeks).', 'main: last day line');
    eq(r.lines[0], 'To use them all, go about 1 every 9 days.', 'main: pace needed (4 in 37 days)');
    eq(r.lines[1], 'Rs 6,000 for 10: Rs 600 per session, Rs 2,400 still unused.', 'main: money line');
    eq(r.cls, 'ok', 'main: on track');
    eq(r.s.projected, 8, 'main: 6 in 25 days -> about 8 more fit in 37 days');
    eq(C.glance(s, T, 'Rs').rows[0].text, '4 of 10 left, ends in 5 weeks', 'main: at a glance line');
    eq(C.glance(s, T, 'Rs').unused, 240000, 'main: 2,400 paid and unused');

    // waste warning: 2 used in 30 days, 6 left, 20 days to go
    s = st([pk({ size: 8, start: '2026-09-26', expiry: '2026-11-13', cents: null })], goes(1, ['2026-10-01', '2026-10-15']));
    r = C.status(s, s.packs[0], T, '');
    eq([r.s.left, r.s.daysLeft, r.s.elapsed, r.s.projected, r.s.risk], [6, 20, 30, 1, 5], 'risk: numbers');
    eq(r.cls, 'risk', 'risk: class');
    eq(r.lines[0], 'You have used 2 in the last 30 days. At that pace about 1 more fit before it ends, so 5 sessions could go to waste. Go 2 to 3 a week to use them all.', 'risk: the warning');
    eq(C.glance(s, T, '').risk, 1, 'risk: counted at a glance');

    // not enough days at all
    s = st([pk({ start: '2026-10-20', expiry: '2026-10-27' })]);
    r = C.status(s, s.packs[0], T, '');
    eq(r.cls, 'risk', 'too few days: class');
    eq(r.lines[0], 'Not enough days left: even going every day, 7 sessions would go to waste. Ask the centre for more time.', 'too few days: 10 left, 3 days');

    // pace wording
    eq(C.needPace(4, 37), '1 every 9 days', 'pace 4 in 37');
    eq(C.needPace(4, 28), '1 a week', 'pace 4 in 28');
    eq(C.needPace(8, 28), '2 a week', 'pace 8 in 28');
    eq(C.needPace(9, 28), '2 to 3 a week', 'pace 9 in 28');
    eq(C.needPace(5, 5), 'every day', 'pace one a day');
    eq(C.needPace(6, 5), '', 'pace impossible');
    eq(C.needPace(0, 5), '', 'pace nothing left');

    // last day today
    s = st([pk({ expiry: T })], goes(1, ['2026-10-01']));
    r = C.status(s, s.packs[0], T, '');
    eq(r.head, 'Last day to use it: today.', 'expiry today');
    eq(r.s.daysLeft, 1, 'expiry today = 1 usable day');

    // used up
    s = st([pk({ size: 3 })], goes(1, ['2026-10-02', '2026-10-09', '2026-10-16']));
    r = C.status(s, s.packs[0], T, '$');
    eq([r.cls, r.big], ['done', '0 of 3 left'], 'used up: class and count');
    eq(r.head, 'All 3 used, the last on Fri 16 Oct. Time to renew?', 'used up: line');
    eq(r.lines[0], '$6,000 for 3: $2,000 per session.', 'used up: no unused money');

    // expired with sessions left: exact unused value with odd cents (100.00 over 3 = 33.33 each)
    s = st([pk({ size: 3, cents: 10000, start: '2026-09-01', expiry: '2026-10-20' })], goes(1, ['2026-09-10']));
    r = C.status(s, s.packs[0], T, '');
    eq(r.cls, 'bad', 'expired: class');
    eq(r.head, 'Expired on Tue 20 Oct with 2 sessions not used (worth 66.67).', 'expired: unused value 2 x 33.33 rounded from 66.666');
    eq(r.s.per, 3333, 'odd cents: 100 / 3 = 33.33 per session');

    // not started yet
    s = st([pk({ start: '2026-11-01', expiry: '2026-12-31' })]);
    r = C.status(s, s.packs[0], T, '');
    eq([r.cls, r.head], ['wait', 'Starts Sun 1 Nov (in 7 days). Last day Thu 31 Dec.'], 'not started');
    eq(r.s.daysLeft, 61, 'not started: days counted from the first day');

    // no expiry: pace gives an end date
    s = st([pk({ expiry: '', size: 20 })], goes(1, ['2026-10-02', '2026-10-06', '2026-10-09', '2026-10-13', '2026-10-16']));
    r = C.status(s, s.packs[0], T, '');
    eq(r.head, 'No expiry date.', 'no expiry: line');
    eq(r.lines[0], 'At your pace so far, the last one will be around Fri 8 Jan 2027.', 'no expiry: 5 in 25 days, 15 left -> 75 days (25 Oct + 75)');

    // low
    s = st([pk({ size: 5 })], goes(1, ['2026-10-02', '2026-10-09', '2026-10-16']));
    r = C.status(s, s.packs[0], T, '');
    eq(r.cls, 'low', 'low: 2 left');
    ok(r.lines.includes('Only 2 left: think about renewing.'), 'low: renew hint');

    // missed counts, cancelled does not
    s = st([pk({ size: 4 })], [...goes(1, ['2026-10-02']), { id: 200, pack: 1, date: '2026-10-05', kind: 'missed', who: '', note: '' }, { id: 201, pack: 1, date: '2026-10-09', kind: 'off', who: '', note: 'pool closed' }]);
    r = C.stats(s, s.packs[0], T);
    eq([r.used, r.left, r.missed, r.off], [2, 2, 1, 1], 'missed counted, cancelled not');
    ok(C.logText(s, s.packs[0], T, '').includes('-  Fri 9 Oct cancelled or excused, not counted: pool closed'), 'log lists the cancelled class');
    ok(C.logText(s, s.packs[0], T, '').includes('2. Mon 5 Oct missed, still counted'), 'log numbers the missed class');

    // used before the app
    s = st([pk({ usedBefore: 3, added: '2026-10-20' })], goes(1, ['2026-10-22']));
    r = C.stats(s, s.packs[0], T);
    eq([r.used, r.left], [4, 6], 'used before + logged');
    ok(C.logText(s, s.packs[0], T, '').includes('1 to 3. Used before this log was started\n4. Thu 22 Oct went'), 'log: used before then #4');

    // two children on one pack
    s = st([pk({ people: ['Ali', 'Sara'] })], [...goes(1, ['2026-10-02', '2026-10-09'], 'went', 'Ali'), { id: 300, pack: 1, date: '2026-10-09', kind: 'went', who: 'Sara', note: '' }]);
    r = C.stats(s, s.packs[0], T);
    eq(r.byPerson, [{ name: 'Ali', n: 2 }, { name: 'Sara', n: 1 }], 'per person counts');
    eq(C.title(s.packs[0]), 'Swimming lessons (Ali, Sara)', 'title with two people');
    ok(C.logText(s, s.packs[0], T, '').includes('3. Fri 9 Oct went (Sara)'), 'log names who went when two share');

    // unlimited pass
    s = st([pk({ size: 0, cents: 300000, start: '2026-10-01', expiry: '2026-10-31' })], goes(1, ['2026-10-02', '2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21', '2026-10-23', '2026-10-24']));
    r = C.status(s, s.packs[0], T, '');
    eq([r.big, r.head], ['9 visits so far', 'Valid until Sat 31 Oct (in 6 days).'], 'pass: visits and end');
    eq(r.lines[0], '3,000 paid: 333.33 per visit so far.', 'pass: cost per visit');
    eq(r.cls, 'soon', 'pass: ends within a week');

    // ---- the pack form
    let f = { name: '  Swimming   lessons ', type: 'count', size: '10', people: 'Ali, Sara, ali', start: T, expiry: C.lastDayAfter(T, 3), price: '6000', note: '', usedBefore: '' };
    let p = C.readPack(f, T, null, 0, '');
    eq([p.pack.name, p.pack.people, p.pack.size, p.pack.expiry, p.pack.cents, p.pack.usedBefore], ['Swimming lessons', ['Ali', 'Sara'], 10, '2027-01-24', 600000, 0], 'form: clean pack, duplicate name dropped');
    eq(C.readPack(Object.assign({}, f, { name: '' }), T, null, 0, '').errors.name, 'Type what the pack is for, like Swimming lessons.', 'form: blank name');
    eq(C.readPack(Object.assign({}, f, { size: '' }), T, null, 0, '').errors.size, 'Type how many sessions the pack has.', 'form: blank size');
    eq(C.readPack(Object.assign({}, f, { size: '0' }), T, null, 0, '').errors.size, 'A pack needs at least 1 session.', 'form: zero size');
    eq(C.readPack(Object.assign({}, f, { size: '-3' }), T, null, 0, '').errors.size, 'Type a whole number of sessions, like 10.', 'form: negative size');
    eq(C.readPack(Object.assign({}, f, { size: '2.5' }), T, null, 0, '').errors.size, 'Type a whole number of sessions, like 10.', 'form: decimal size');
    ok(C.readPack(Object.assign({}, f, { size: '501' }), T, null, 0, '').errors.size, 'form: huge size');
    eq(C.readPack(Object.assign({}, f, { expiry: '2026-10-01' }), T, null, 0, '').errors.expiry, 'The last day cannot be before the first day.', 'form: expiry before start');
    eq(C.readPack(Object.assign({}, f, { expiry: '' }), T, null, 0, '').pack.expiry, '', 'form: no expiry allowed');
    ok(C.readPack(Object.assign({}, f, { type: 'pass', expiry: '' }), T, null, 0, '').errors.expiry, 'form: a pass needs a last day');
    eq(C.readPack(Object.assign({}, f, { type: 'pass', size: 'abc' }), T, null, 0, '').pack.size, 0, 'form: pass ignores the size box');
    ok(C.readPack(Object.assign({}, f, { start: '' }), T, null, 0, '').errors.start, 'form: blank start');
    ok(C.readPack(Object.assign({}, f, { price: '12abc' }), T, null, 0, '').errors.price, 'form: bad price');
    eq(C.readPack(Object.assign({}, f, { price: '' }), T, null, 0, '').pack.cents, null, 'form: price optional');
    ok(C.readPack(Object.assign({}, f, { people: 'A, B, C, D, E' }), T, null, 0, '').errors.people, 'form: too many people');
    eq(C.readPack(Object.assign({}, f, { usedBefore: '4' }), T, null, 0, '').pack.usedBefore, 4, 'form: used before');
    ok(C.readPack(Object.assign({}, f, { usedBefore: '11' }), T, null, 0, '').errors.usedBefore, 'form: used before more than the pack');
    ok(C.readPack(Object.assign({}, f, { size: '5' }), T, pk(), 6, '2026-10-01').errors.size, 'form: editing a pack below what was logged');
    ok(C.readPack(Object.assign({}, f, { start: '2026-10-10' }), T, pk(), 1, '2026-10-02').errors.start, 'form: first day after a logged session');
    ok(C.readPack(Object.assign({}, f, { start: '2026-08-01', expiry: '2026-09-30' }), T, null, 0, '').warn, 'form: an old pack gives a warning, not an error');
    eq(C.readPack(Object.assign({}, f, { name: 'x'.repeat(200) }), T, null, 0, '').pack.name.length, 60, 'form: very long name cut to 60');

    // ---- the session form
    const P = pk(), S = C.stats(st([P]), P, T);
    eq(C.readUse({ date: T, kind: 'went', who: '', note: '' }, P, T, S, null).use, { date: T, kind: 'went', who: 'Ali', note: '' }, 'use: one person filled in');
    ok(C.readUse({ date: '2026-10-26', kind: 'went' }, P, T, S, null).errors.date, 'use: future date refused');
    ok(C.readUse({ date: '2026-09-30', kind: 'went' }, P, T, S, null).errors.date, 'use: before the pack starts refused');
    ok(C.readUse({ date: '', kind: 'went' }, P, T, S, null).errors.date, 'use: blank date');
    ok(C.readUse({ date: T, kind: 'x' }, P, T, S, null).errors.kind, 'use: unknown kind');
    const P2 = pk({ people: ['Ali', 'Sara'] });
    ok(C.readUse({ date: T, kind: 'went', who: '' }, P2, T, S, null).errors.who, 'use: two people, who is needed');
    eq(C.readUse({ date: T, kind: 'off', who: '' }, P2, T, S, null).use.who, '', 'use: cancelled class needs no person');
    const full = st([pk({ size: 1 })], goes(1, ['2026-10-02']));
    const FS = C.stats(full, full.packs[0], T);
    ok(C.readUse({ date: T, kind: 'went' }, full.packs[0], T, FS, null).errors.kind, 'use: no session left');
    ok(!C.readUse({ date: T, kind: 'off' }, full.packs[0], T, FS, null).errors, 'use: cancelled allowed on a used-up pack');
    ok(!C.readUse({ date: '2026-10-03', kind: 'went' }, full.packs[0], T, FS, full.uses[0]).errors, 'use: editing the counted entry of a full pack');
    ok(C.readUse({ date: T, kind: 'went' }, pk({ expiry: '2026-10-20' }), T, S, null).warn, 'use: after the last day warns');

    // ---- renewal
    eq(C.renewal(pk({ start: '2026-10-01', expiry: '2026-12-31' }), T), { name: 'Swimming lessons', people: ['Ali'], size: 10, start: T, expiry: '2027-01-24', cents: 600000, note: '' }, 'renew: same 3 months from today');
    eq(C.renewal(pk({ start: '2026-10-01', expiry: '2026-10-14', size: 12, carried: 2 }), T).size, 10, 'renew: odd length kept, carried sessions not doubled');
    eq(C.renewal(pk({ start: '2026-10-01', expiry: '2026-10-14' }), T).expiry, '2026-11-07', 'renew: 14-day pack -> 14 days from today');

    // ---- sorting: most urgent first
    s = st([pk({ id: 1, name: 'A' }), pk({ id: 2, name: 'B', size: 5, start: '2026-09-01', expiry: '2026-10-20' }), pk({ id: 3, name: 'C', size: 3 })], goes(3, ['2026-10-02', '2026-10-05']));
    eq(C.sortPacks(s, s.packs, T).map(p => p.name), ['B', 'C', 'A'], 'sort: expired, low, ok');

    // ---- calendar
    s = st([pk(), pk({ id: 2, expiry: '' }), pk({ id: 3, expiry: '2026-10-28' })]);
    const cal = C.ics(s, T, 'https://x/');
    eq(cal.count, 2, 'ics: one per pack with a future last day');
    ok(cal.text.includes('DTSTART;VALUE=DATE:20261123'), 'ics: a week before 30 Nov');
    ok(cal.text.includes('DTSTART;VALUE=DATE:20261025'), 'ics: less than a week away -> today');

    // ---- saved data
    eq(C.validate(null), null, 'validate: null');
    eq(C.validate({ packs: 'x' }), null, 'validate: wrong shape');
    const bad = C.validate({ nextId: 'x', packs: [pk(), pk(), { id: 2, name: '', start: T, size: 3 }, { id: 3, name: 'Gym', start: 'nope', size: 3 }, pk({ id: 4, size: 0, expiry: '' }), pk({ id: 5, size: 999 }), pk({ id: 6, people: ['<b>x</b>', 7] })],
        uses: [{ id: 1, pack: 1, date: '2026-10-02', kind: 'went' }, { id: 1, pack: 1, date: '2026-10-03', kind: 'went' }, { id: 2, pack: 9, date: T, kind: 'went' }, { id: 3, pack: 1, date: '2026-09-01', kind: 'went' }, { id: 4, pack: 1, date: T, kind: 'boom' }, { id: 5, pack: 1, date: T, kind: 'off', who: 'Zed' }] });
    eq(bad.packs.map(p => p.id), [1, 6], 'validate: bad and duplicate packs dropped');
    eq(bad.packs[1].people, ['<b>x</b>'], 'validate: people kept as text, not numbers');
    eq(bad.uses.map(u => u.id), [1, 5], 'validate: bad uses dropped');
    eq(bad.uses[1].who, '', 'validate: unknown person cleared');
    eq(bad.nextId, 7, 'validate: nextId above all ids');
    const over = C.validate({ packs: [pk({ size: 2 })], uses: goes(1, ['2026-10-02', '2026-10-03', '2026-10-04']) });
    eq(over.uses.length, 2, 'validate: never more counted sessions than the pack holds');

    const out = pass + ' checks passed' + (fails.length ? ', ' + fails.length + ' FAILED:\n' + fails.join('\n') : '. ALL GOOD');
    if (typeof module !== 'undefined' && module.exports) { console.log(out); if (fails.length) process.exitCode = 1; }
    else { const pre = document.createElement('pre'); pre.textContent = out; pre.id = 'result'; document.body.appendChild(pre); }
})();
