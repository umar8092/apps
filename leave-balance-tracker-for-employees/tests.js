// Logic checks for core.js. Run: node tests.js  (or open test.html in a browser)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.LeaveCore;
    let pass = 0, failed = 0; const out = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); } };
    const T = '2026-10-22';   // a Thursday
    const add = (s, f) => { const r = C.readEntry(s, f, T); if (!r.ok) throw new Error('could not add ' + JSON.stringify(f) + ' ' + JSON.stringify(r.errs)); s.entries.push(r.entry); return r; };

    // ---- dates, amounts, words
    eq(C.addMonths('2026-01-31', 1), '2026-02-28', 'month add clamps');
    eq(C.addMonths('2026-11-15', 3), '2027-02-15', 'month add across new year');
    eq([C.num(650), C.num(167), C.num(100), C.num(50), C.num(0), C.num(-150), C.num(1010)], ['6.5', '1.67', '1', '0.5', '0', '-1.5', '10.1'], 'num');
    eq([C.days(100), C.days(50), C.days(200)], ['1 day', '0.5 days', '2 days'], 'days word');
    eq([C.parseAmount('20'), C.parseAmount(' 1.5 '), C.parseAmount('1,5'), C.parseAmount('.5'), C.parseAmount('1.67'), C.parseAmount('0')], [2000, 150, 150, 50, 167, 0], 'parse amounts');
    eq([C.parseAmount(''), C.parseAmount('-2'), C.parseAmount('abc'), C.parseAmount('1.234'), C.parseAmount('1e3'), C.parseAmount('.')], [null, null, null, null, null, null], 'bad amounts');
    eq(C.parseAmount('1 000'), 100000, 'spaces inside a pasted number are ignored');
    eq(C.workdaysText([1, 2, 3, 4, 5]), 'Mon to Fri', 'Mon to Fri');
    eq(C.workdaysText([0, 1, 2, 3, 4]), 'Sun to Thu', 'Sun to Thu');
    eq(C.workdaysText([1, 3, 5]), 'Mon, Wed, Fri', 'part time');
    eq(C.workdaysText([1, 2, 3, 4, 5, 6]), 'Mon to Sat', 'six days');

    // ---- leave years
    let s = C.emptyState(T);
    eq([C.yearStart(s, 2026), C.yearEnd(s, 2026), C.yearOf(s, T), C.yearName(s, 2026)], ['2026-01-01', '2026-12-31', 2026, 'Leave year 2026'], 'calendar leave year');
    s.startM = 7; s.startD = 1;
    eq([C.yearOf(s, '2026-06-30'), C.yearOf(s, '2026-07-01'), C.yearEnd(s, 2026), C.yearName(s, 2026)], [2025, 2026, '2027-06-30', 'Leave year 1 Jul 2026 to 30 Jun 2027'], 'July leave year');
    s.startM = 2; s.startD = 30;   // a joining anniversary on 30 Feb does not exist: clamped to the month
    eq([C.yearStart(s, 2026), C.yearStart(s, 2028), C.yearEnd(s, 2026)], ['2026-02-28', '2028-02-29', '2027-02-27'], 'start day clamped to February');

    // ---- counting a leave: weekends, public holidays, half days
    s = C.emptyState(T);
    s.holidays = [{ date: '2026-12-25', name: 'Christmas' }, { date: '2026-02-05', name: 'Kashmir Day' }];
    eq(C.entryDays(s, { from: '2026-02-02', to: '2026-02-06' }).total, 400, 'Mon to Fri with a public holiday = 4');
    eq(C.entryDays(s, { from: '2026-10-23', to: '2026-10-26' }).total, 200, 'Fri to Mon skips the weekend = 2');
    eq(C.entryDays(s, { from: '2026-10-23', to: '2026-10-26' }).weekend, ['2026-10-24', '2026-10-25'], 'weekend days listed');
    eq(C.entryDays(s, { from: '2026-07-15', to: '2026-07-15', halfFirst: true }).total, 50, 'half day');
    eq(C.entryDays(s, { from: '2026-10-19', to: '2026-10-23', halfFirst: true, halfLast: true }).total, 400, 'first and last half = 4');
    eq(C.entryDays(s, { from: '2026-10-24', to: '2026-10-26', halfFirst: true }).total, 100, 'a half first day on a Saturday does not halve Monday');
    eq(C.entryDays(s, { from: '2026-10-24', to: '2026-10-24', custom: 100 }).total, 100, 'custom count on a Saturday');
    s.workdays = [0, 1, 2, 3, 4];   // Sun to Thu
    eq(C.entryDays(s, { from: '2026-10-23', to: '2026-10-26' }).total, 200, 'Sun to Thu week: Fri, Sat off, Sun and Mon count');
    // too long, backwards, nothing counted, clash
    s = C.emptyState(T);
    eq(C.readEntry(s, { type: 'annual', from: '2026-10-26', to: '2026-10-20' }, T).errs.to, 'The last day is before the first day.', 'backwards range');
    eq(C.readEntry(s, { type: 'annual', from: '2026-01-01', to: '2027-01-02' }, T).ok, false, 'over 366 days refused');
    eq(C.readEntry(s, { type: 'annual', from: '', to: '' }, T).errs.from, 'Choose the first day of the leave.', 'blank date');
    eq(C.readEntry(s, { type: 'nope', from: T }, T).errs.type, 'Choose the kind of leave.', 'unknown type');
    eq(C.readEntry(s, { type: 'annual', from: '2026-10-24' }, T).errs.from.startsWith('Sat 24 Oct is not one of your working days'), true, 'a Saturday takes no leave');
    eq(C.readEntry(s, { type: 'annual', from: '2026-10-24', custom: '1' }, T).ok, true, 'a Saturday with a custom count is fine');
    eq(C.readEntry(s, { type: 'annual', from: '2026-10-24', custom: '2' }, T).errs.custom, 'That is more days than the leave lasts.', 'custom more than the days');
    eq(C.readEntry(s, { type: 'annual', from: '2026-10-26', custom: '0' }, T).errs.custom, 'Type more than 0 days.', 'custom zero');
    eq(C.readEntry(s, { type: 'annual', from: '2026-10-26', custom: 'x' }, T).ok, false, 'custom not a number');
    eq(C.readEntry(s, { type: 'annual', from: '2026-10-26', to: '' }, T).entry.to, '2026-10-26', 'blank last day = one day');
    add(s, { type: 'annual', from: '2026-10-26', to: '2026-10-28' });
    eq(C.readEntry(s, { type: 'sick', from: '2026-10-28', to: '2026-10-29' }, T).errs.from, 'You already have annual leave on Wed 28 Oct. Change or delete that leave first.', 'clash');
    add(s, { type: 'casual', from: '2026-10-29', halfFirst: true });
    eq(C.readEntry(s, { type: 'sick', from: '2026-10-29', halfFirst: true }, T).ok, true, 'two half days on one day are fine');
    eq(C.readEntry(s, { type: 'sick', from: '2026-10-29' }, T).ok, false, 'a full day on top of a half day clashes');
    const ed = s.entries[0];
    eq(C.readEntry(s, { id: ed.id, type: 'annual', from: '2026-10-26', to: '2026-10-27' }, T).ok, true, 'editing a leave does not clash with itself');
    eq(C.readEntry(s, { type: 'annual', from: '2026-10-30', note: 'x'.repeat(300) }, T).entry.note.length, 200, 'very long note cut to 200');

    // ---- Ayesha's year (the README example)
    s = C.emptyState('2026-01-05');
    s.holidays = [{ date: '2026-02-05', name: 'Kashmir Day' }, { date: '2026-12-25', name: 'Christmas' }];
    s.types[0].opening = 300; s.types[0].expire = 3;      // 3 days carried from 2025, use by 31 Mar
    add(s, { type: 'annual', from: '2026-02-02', to: '2026-02-06' });               // 4
    add(s, { type: 'annual', from: '2026-04-06', to: '2026-04-10' });               // 5
    add(s, { type: 'annual', from: '2026-07-15', halfFirst: true });                // 0.5
    add(s, { type: 'casual', from: '2026-03-10' });
    add(s, { type: 'casual', from: '2026-06-18' });
    add(s, { type: 'casual', from: '2026-09-14', halfFirst: true });                // casual 2.5
    add(s, { type: 'sick', from: '2026-05-11', to: '2026-05-12' });                 // sick 2
    add(s, { type: 'annual', from: '2026-12-21', to: '2027-01-01', note: 'Family wedding' });   // 8 in 2026 + 1 in 2027
    s.adjs.push(C.readAdj(s, { type: 'annual', sign: 1, amount: '1', date: '2026-10-01', note: 'Day in lieu' }).adj);
    let r = C.balance(s, 'annual', 2026, T);
    eq([r.full, r.carried, r.adj, r.taken, r.booked, r.left, r.expired, r.atRisk, r.carryOut, r.lost], [2000, 300, 100, 950, 800, 650, 0, 0, 500, 150], 'Ayesha annual 2026');
    eq(C.headline(r), '6.5 days left', 'Ayesha headline');
    eq(C.lines(s, r, T), ['Allowance 20, carried over 3, HR added 1. Taken 9.5, booked 8.', 'Book 1.5 days more by 31 Dec 2026 or lose them (only 5 days can be carried over).'], 'Ayesha lines');
    eq(C.level(r), 'lose', 'Ayesha will lose days');
    eq([C.balance(s, 'casual', 2026, T).left, C.balance(s, 'sick', 2026, T).left], [550, 800], 'casual 5.5, sick 8');
    const sk = C.balance(s, 'sick', 2026, T);
    eq([C.lines(s, sk, T), C.level(sk)], [['Allowance 10. Taken 2, booked 0.', 'Unused days are not carried over after 31 Dec 2026.'], 'ok'], 'sick leave: no nagging to use it up');
    s.types[2].warn = true; eq(C.level(C.balance(s, 'sick', 2026, T)), 'lose', 'warning switched on'); s.types[2].warn = false;
    eq(C.lines(s, C.balance(s, 'sick', 2025, T), T)[1], '10 days not used in this leave year.', 'past year without warning');
    const u = C.balance(s, 'unpaid', 2026, T); eq([u.taken, u.booked, C.headline(u)], [0, 0, '0 days this leave year'], 'unpaid only counted');
    let r27 = C.balance(s, 'annual', 2027, T);
    eq([r27.carried, r27.booked, r27.left, r27.future], [500, 100, 2400, true], '2027: 5 carried in, 1 Jan booked');
    // the November week she asks about: 5 days, leaves 1.5
    const nov = C.readEntry(s, { type: 'annual', from: '2026-11-16', to: '2026-11-20' }, T);
    eq(nov.count.total, 500, 'Nov week = 5');
    s.entries.push(nov.entry); r = C.balance(s, 'annual', 2026, T);
    eq([r.left, r.lost, r.carryOut], [150, 0, 150], 'after the November week: 1.5 left, nothing lost, 1.5 carried over');
    eq(C.lines(s, r, T)[1], '1.5 days will be carried over to the next leave year.', 'carried over line');
    s.entries.pop();
    // past year view
    const r25 = C.balance(s, 'annual', 2025, T); eq([r25.past, r25.full, r25.taken], [true, 2000, 0], '2025 shows a full year');

    // ---- carried days that expire
    s = C.emptyState('2026-01-05'); s.types[0].opening = 500; s.types[0].expire = 3;
    add(s, { type: 'annual', from: '2026-02-02', to: '2026-02-03' });   // 2 used before 31 Mar
    r = C.balance(s, 'annual', 2026, '2026-03-01');
    eq([r.expiry, r.atRisk, r.expired, r.left], ['2026-03-31', 300, 0, 2300], 'before the expiry: 3 at risk');
    eq(C.lines(s, r, '2026-03-01')[1], 'Use 3 days carried over by 31 Mar 2026, or they expire.', 'at-risk line');
    r = C.balance(s, 'annual', 2026, T);
    eq([r.atRisk, r.expired, r.left], [0, 300, 2000], 'after the expiry: 3 expired');
    // carry everything, carry nothing
    s = C.emptyState('2026-01-05'); s.types[0].carry = 'all';
    eq(C.balance(s, 'annual', 2027, T).carried, 2000, 'all carried over');
    s.types[0].carry = 'none'; r = C.balance(s, 'annual', 2026, T);
    eq([r.lost, C.balance(s, 'annual', 2027, T).carried], [2000, 0], 'nothing carried over: all 20 would be lost');
    eq(C.lines(s, r, T)[1], 'Book 20 days more by 31 Dec 2026 or lose them (nothing is carried over).', 'nothing carried line');

    // ---- over the allowance
    s = C.emptyState('2026-01-05'); s.types[1].allow = 100;
    add(s, { type: 'casual', from: '2026-03-02', to: '2026-03-03' });
    r = C.balance(s, 'casual', 2026, T);
    eq([r.left, C.headline(r), C.level(r)], [-100, '1 day over your allowance', 'over'], 'over by one');
    // zero allowance
    s.types[1].allow = 0; eq(C.balance(s, 'casual', 2026, T).left, -200, 'zero allowance');

    // ---- joining part-way: year mode rounds to half days, month mode builds up
    s = C.emptyState('2026-08-01'); s.joined = '2026-08-01';
    r = C.balance(s, 'annual', 2026, T);
    eq([r.full, r.prorata.dayCount, r.prorata.yearDays], [850, 153, 365], 'joined 1 Aug: 20 x 153/365 = 8.38 -> 8.5');
    eq(C.lines(s, r, T)[1], 'Part year from joining on 1 Aug 2026: 20 x 153/365 days = 8.38, rounded to 8.5.', 'pro-rata line');
    eq(C.balance(s, 'annual', 2025, T).full, 0, 'nothing before joining');
    eq(C.balance(s, 'annual', 2027, T).full, 2000, 'full year after joining');
    s.joined = '2027-03-01'; eq(C.balance(s, 'annual', 2026, T).full, 0, 'joining in the future: nothing this year');
    s = C.emptyState('2026-01-05'); s.types[0].mode = 'month';
    r = C.balance(s, 'annual', 2026, T);
    eq([r.months, r.monthsDone, r.earned, r.full], [12, 9, 1500, 2000], 'month mode: 9 months done by 22 Oct = 15');
    r = C.balance(s, 'annual', 2026, '2026-10-31'); eq(r.monthsDone, 10, 'month counted on its last day');
    s.types[0].allow = 2000; s.joined = '2026-03-16';
    r = C.balance(s, 'annual', 2026, T); eq([r.months, r.monthsDone, r.earned, r.full], [9, 6, 1000, 1500], 'joined 16 Mar: March not counted');
    s.joined = '2026-03-15'; eq(C.balance(s, 'annual', 2026, T).months, 10, 'joined 15 Mar: March counted');
    s.joined = null; add(s, { type: 'annual', from: '2026-10-05', to: '2026-10-09' }); add(s, { type: 'annual', from: '2026-08-03', to: '2026-08-14' });
    r = C.balance(s, 'annual', 2026, T); eq([r.taken, r.availNow, C.level(r)], [1500, 0, 'ok'], 'month mode: took all built up');
    add(s, { type: 'annual', from: '2026-10-20' }); r = C.balance(s, 'annual', 2026, T);
    eq([r.availNow, C.level(r)], [-100, 'over'], 'month mode: 1 more than built up');
    eq(C.lines(s, r, T).includes('You have taken 1 day more than you have built up so far.'), true, 'taken more than built up line');
    s.types[0].allow = 2500; eq(C.balance(s, 'annual', 2026, T).earned, 1875, '25 a year over 9 months = 18.75');

    // ---- July leave year: leave crossing the year end splits
    s = C.emptyState('2026-08-01'); s.startM = 7;
    add(s, { type: 'annual', from: '2027-06-28', to: '2027-07-02' });   // Mon to Fri: 3 days in 2026/27, 2 in 2027/28
    eq([C.balance(s, 'annual', 2026, T).booked, C.balance(s, 'annual', 2027, T).booked], [300, 200], 'split over July year end');
    eq(C.entriesInYear(s, 2027).length, 1, 'shows in both years');

    // ---- taking leave today: past days taken, later days booked
    s = C.emptyState('2026-01-05'); add(s, { type: 'annual', from: '2026-10-21', to: '2026-10-23' });
    r = C.balance(s, 'annual', 2026, T); eq([r.taken, r.booked], [200, 100], 'part taken, part booked');
    eq([C.entryStatus(s, s.entries[0], T), C.entryText(s, s.entries[0], T).when], ['now', 'Wed 21 Oct to Fri 23 Oct'], 'status now');

    // ---- HR corrections
    s = C.emptyState('2026-01-05');
    eq(C.readAdj(s, { type: 'annual', sign: -1, amount: '2', date: T }).adj.days, -200, 'take away 2');
    eq(C.readAdj(s, { type: 'annual', sign: 1, amount: '0', date: T }).errs.amount, 'Type more than 0 days.', 'zero correction');
    eq(C.readAdj(s, { type: 'annual', sign: 1, amount: '', date: T }).ok, false, 'blank correction');
    eq(C.readAdj(s, { type: 'unpaid', sign: 1, amount: '1', date: T }).errs.type, 'Unpaid leave has no limit, so there is no balance to correct.', 'no correction for unlimited');
    s.adjs.push(C.readAdj(s, { type: 'annual', sign: -1, amount: '2.5', date: T }).adj);
    eq(C.balance(s, 'annual', 2026, T).left, 1750, 'correction lowers the balance');

    // ---- leave types
    s = C.emptyState(T);
    eq(C.readType(s, { name: '  Hajj   leave ', mode: 'year', allow: '30', carry: 'none' }).type.name, 'Hajj leave', 'type name tidied');
    eq(C.readType(s, { name: 'annual LEAVE', mode: 'year', allow: '5', carry: 'none' }).errs.name, 'You already have a leave called annual LEAVE.', 'duplicate name');
    eq(C.readType(s, { name: 'Annual leave', mode: 'year', allow: '25', carry: 'cap', cap: '5' }, 'annual').ok, true, 'renaming itself is fine');
    eq(C.readType(s, { name: '', mode: 'year', allow: '5' }).errs.name, 'Give this leave a name, for example Annual leave.', 'blank name');
    eq(C.readType(s, { name: 'X', mode: 'year', allow: '400' }).errs.allow, 'Type at most 366 days.', 'huge allowance');
    eq(C.readType(s, { name: 'X', mode: 'year', allow: '' }).ok, false, 'blank allowance');
    eq(C.readType(s, { name: 'X', mode: 'none', allow: '' }).ok, true, 'no limit needs no allowance');
    eq(C.readType(s, { name: 'X', mode: 'year', allow: '20', carry: 'cap', cap: '' }).errs.cap, 'Type how many days can be carried over, for example 5.', 'blank cap');
    eq(C.readType(s, { name: 'X', mode: 'year', allow: '20', carry: 'all', expire: '13' }).errs.expire, 'Type a number of months from 1 to 12, or leave it empty.', 'expiry 13');
    eq(C.readType(s, { name: 'X', mode: 'year', allow: '20', carry: 'none', expire: '3' }).type.expire, 0, 'no expiry when nothing carries');
    eq(C.typeRule(C.defaultTypes()[0]), '20 days a year, up to 5 carried over', 'rule words');
    eq(C.typeRule({ mode: 'month', allow: 2000, carry: 'all', expire: 3 }), '20 a year, built up 1.67 a month, all carried over (use within 3 months)', 'month rule words');

    // ---- text exports
    s = C.emptyState('2026-01-05'); add(s, { type: 'annual', from: '2026-12-21', to: '2026-12-24', note: '=SUM(A1), "quoted"' });
    const txt = C.summaryText(s, 2026, T);
    eq(txt.split('\n')[0], 'Leave year 2026 (1 Jan 2026 to 31 Dec 2026), on 22 Oct 2026:', 'summary first line');
    eq(txt.includes('Annual leave: 16 days left.') && txt.includes('- Annual leave: Mon 21 Dec to Thu 24 Dec (4 days)'), true, 'summary body');
    const c = C.csv(s, T).split('\r\n');
    eq(c[0], 'Kind,Leave,From,To,Days,Status,Leave year,Note', 'csv head');
    eq(c[1], 'Leave,Annual leave,2026-12-21,2026-12-24,4,Booked,2026,"\'=SUM(A1), ""quoted"""', 'csv row is safe for spreadsheets');

    // ---- saved and restored data
    eq(C.validate(null), null, 'null'); eq(C.validate([]), null, 'array'); eq(C.validate('x'), null, 'string');
    const v = C.validate({ startM: 13, startD: 0, workdays: [9, 'x'], joined: '2026-02-30', holidays: [{ date: '2026-12-25' }, { date: '2026-12-25' }, { date: 'bad' }],
        types: [{ id: 'a', name: 'A', mode: 'year', allow: -5 }, { id: 'a', name: 'B' }, { id: 'c', name: '' }, { id: 'd', name: 'D', mode: 'weird', allow: 100, carry: 'cap', cap: 50, expire: 99 }],
        entries: [{ id: 'e1', type: 'a', from: '2026-01-02', to: '2026-01-01' }, { id: 'e2', type: 'zzz', from: T, to: T }, { id: 'e3', type: 'd', from: T, to: T, custom: 99999, halfLast: true }],
        adjs: [{ id: 'x', type: 'd', date: T, days: 0 }, { id: 'y', type: 'd', date: T, days: 150, note: 5 }] }, T);
    eq([v.startM, v.startD, v.workdays, v.joined, v.holidays.length], [1, 1, [1, 2, 3, 4, 5], null, 1], 'bad settings dropped');
    eq(v.types.map(t => [t.id, t.allow, t.mode, t.expire]), [['a', 0, 'year', 0], ['d', 100, 'year', 0]], 'bad types dropped');
    eq(v.entries.map(e => [e.id, e.custom, e.halfLast]), [['e3', null, false]], 'bad entries dropped');
    eq(v.adjs.map(a => [a.id, a.days, a.note]), [['y', 150, '']], 'bad corrections dropped');
    const back = C.validate(JSON.parse(JSON.stringify(s)), T); eq(back, s, 'a backup comes back the same');

    const msg = pass + ' passed, ' + failed + ' failed' + (out.length ? '\n' + out.join('\n') : '');
    if (typeof document !== 'undefined') { const p = document.createElement('pre'); p.textContent = msg; document.body.appendChild(p); }
    else { console.log(msg); if (failed) process.exitCode = 1; }
})();
