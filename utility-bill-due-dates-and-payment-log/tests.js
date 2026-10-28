// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.BILLS;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const m = s => C.parseMoney(s).n, merr = s => !!C.parseMoney(s).error;
    const T = '2026-10-28';
    const pay = (on, amt, how, ref) => ({ id: 'p' + on + amt, on, amt, how: how || '', ref: ref || '' });
    const ent = (due, amt, pays, late) => ({ id: 'e' + due, due, amt, late: late || 0, pays: pays || [] });
    const acct = (name, entries, o) => Object.assign({ id: 'a' + name, name, kind: 'other', every: 1, day: 0, acct: '', payer: '', auto: false, closed: false, entries }, o || {});

    // typed amounts
    eq('3499', m('3499'), 349900); eq('2,180.50', m('2,180.50'), 218050); eq('Rs 1,25,000 lakh', m('Rs 1,25,000'), 12500000); eq('0 allowed for a credit bill', m('0'), 0);
    eq('pasted with spaces', m('  41.99 '), 4199); eq('blank', merr(''), true); eq('words', merr('abc'), true); eq('minus', merr('-50'), true); eq('3 decimals', merr('1.2345'), true); eq('huge', merr('1000000000'), true);

    // days
    eq('31st in February', C.addMonths('2026-01-31', 1, 31), '2026-02-28'); eq('back to 31st', C.addMonths('2026-02-28', 1, 31), '2026-03-31');
    eq('December to January', C.addMonths('2026-12-15', 1), '2027-01-15'); eq('every 2 months over the year', C.addMonths('2026-11-20', 2, 20), '2027-01-20');
    eq('ord 1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 31st', [1, 2, 3, 4, 11, 12, 13, 21, 22, 31].map(C.ord), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '31st']);

    // one bill
    let s = C.entryState(ent('2026-10-30', 349900), T);
    eq('unpaid, due in 2 days', [s.st, s.left, s.need], ['due', 349900, 349900]);
    s = C.entryState(ent('2026-10-26', 218000), T);
    eq('overdue gas', [s.st, s.left], ['overdue', 218000]);
    s = C.entryState(ent('2026-10-28', 100000), T);
    eq('due today', s.st, 'today');
    s = C.entryState(ent('2026-10-24', 349900, [pay('2026-10-22', 349900, 'Bank app', 'TXN 1')]), T);
    eq('paid on time', [s.st, s.left, s.paidOn, s.onTime], ['paid', 0, '2026-10-22', true]);
    s = C.entryState(ent('2026-11-05', 349900, [pay('2026-10-28', 100000)]), T);
    eq('part paid: 1,000 of 3,499', [s.st, s.paid, s.left], ['part', 100000, 249900]);
    s = C.entryState(ent('2026-10-20', 349900, [pay('2026-10-10', 100000)]), T);
    eq('part paid and overdue', [s.st, s.left], ['overdue', 249900]);
    s = C.entryState(ent('2026-10-20', 0), T);
    eq('a 0 bill is nothing to pay', [s.st, s.left], ['nothing', 0]);
    s = C.entryState(ent('2026-10-20', 349900, [pay('2026-10-19', 350000)]), T);
    eq('paid 1.00 too much', [s.st, s.extra], ['paid', 100]);
    // late amount: 2,000 by the due date, 2,200 after
    s = C.entryState(ent('2026-11-02', 200000, [], 220000), T);
    eq('late amount not yet', [s.need, s.lateApplies], [200000, false]);
    s = C.entryState(ent('2026-10-20', 200000, [], 220000), T);
    eq('late amount applies after the due date', [s.st, s.need, s.left, s.lateApplies], ['overdue', 220000, 220000, true]);
    s = C.entryState(ent('2026-10-20', 200000, [pay('2026-10-19', 200000)], 220000), T);
    eq('paid by the due date: no late amount', [s.st, s.need], ['paid', 200000]);
    s = C.entryState(ent('2026-10-20', 200000, [pay('2026-10-25', 200000)], 220000), T);
    eq('paid 2,000 after the due date: 200 left', [s.st, s.need, s.left], ['overdue', 220000, 20000]);
    s = C.entryState(ent('2026-10-20', 200000, [pay('2026-10-18', 50000), pay('2026-10-25', 170000)], 220000), T);
    eq('part before, rest after: late total met', [s.st, s.paid, s.left, s.onTime], ['paid', 220000, 0, false]);

    // next due date
    eq('next from the usual day later this month', C.nextDue(acct('E', [], { day: 30 }), T), '2026-10-30');
    eq('next from the usual day already passed', C.nextDue(acct('E', [], { day: 5 }), T), '2026-11-05');
    eq('next on the 31st in November', C.nextDue(acct('E', [], { day: 31 }), '2026-11-02'), '2026-11-30');
    eq('next after the last bill', C.nextDue(acct('E', [ent('2026-10-24', 1)], { day: 24 }), T), '2026-11-24');
    eq('next after the last bill, every 2 months', C.nextDue(acct('W', [ent('2026-09-15', 1)], { every: 2, day: 15 }), T), '2026-11-15');
    eq('next keeps the 31st after February', C.nextDue(acct('E', [ent('2027-02-28', 1)], { day: 31 }), T), '2027-03-31');
    eq('next with no day and no bill', C.nextDue(acct('E', []), T), null);
    eq('next with no day uses the last bill day', C.nextDue(acct('E', [ent('2026-10-12', 1)]), T), '2026-11-12');

    // compare: July 2026 41% higher than July 2025
    const el = acct('Electricity', [ent('2025-07-24', 1000000), ent('2026-06-24', 1300000), ent('2026-07-24', 1410000)]);
    let c = C.compare(el, el.entries[2]);
    eq('same month last year', [c.kind, c.pct, C.compareWords(c, T)], ['year', 41, '41% higher than Jul 2025']);
    c = C.compare(el, el.entries[1]);
    eq('no last year: the bill before', [c.kind, c.pct, C.compareWords(c, T)], ['last', 30, '30% higher than the last bill']);
    eq('first bill has nothing to compare', C.compare(el, el.entries[0]), null);
    const lower = acct('G', [ent('2026-09-12', 300000), ent('2026-10-12', 240000)]);
    eq('lower', C.compareWords(C.compare(lower, lower.entries[1]), T), '20% lower than the last bill');
    const same = acct('I', [ent('2026-09-30', 349900), ent('2026-10-30', 349900)]);
    eq('same', C.compareWords(C.compare(same, same.entries[1]), T), 'Same as the last bill');
    const zero = acct('Z', [ent('2026-09-30', 0), ent('2026-10-30', 349900)]);
    eq('after a 0 bill: no percentage', C.compare(zero, zero.entries[1]), null);

    // the household on 28 Oct 2026
    const house = [
        acct('Electricity', [ent('2025-10-24', 1000000, [pay('2025-10-20', 1000000)]), ent('2026-09-24', 1300000, [pay('2026-09-22', 1300000)]), ent('2026-10-24', 1410000, [pay('2026-10-23', 1410000, 'Bank app', 'TXN 48120931')])], { kind: 'electricity', day: 24 }),
        acct('Gas', [ent('2026-10-26', 218000)], { kind: 'gas', day: 26 }),
        acct('Internet', [ent('2026-10-30', 349900)], { kind: 'internet', day: 30 }),
        acct('Water', [ent('2026-10-03', 120000, [pay('2026-09-30', 120000)])], { kind: 'water', day: 3 }),
        acct('Phone', [ent('2026-11-02', 150000)], { kind: 'phone', day: 2, auto: true }),
        acct('Maintenance', [ent('2026-11-10', 500000)], { kind: 'maintenance', day: 10 }),
        acct('Old cable', [ent('2026-10-01', 90000)], { closed: true })
    ];
    const sm = C.summary(house, T);
    eq('overdue: Gas 2,180', [sm.overdue.list.map(r => r.a.name), sm.overdue.sum], [['Gas'], 218000]);
    eq('next 7 days: Internet 3,499 + Phone 1,500', [sm.soon.list.map(r => r.a.name), sm.soon.sum], [['Internet', 'Phone'], 499900]);
    eq('still to pay by 31 Oct: Gas + Internet', [sm.monthLeft.list.length, sm.monthLeft.sum], [2, 567900]);
    eq('paid in October', [sm.paidMonth, sm.paidN], [1410000, 1]);
    eq('owed in total (closed account left out)', sm.owed, 1217900);
    eq('Water bill not in yet, expected 3 Nov', sm.notIn.map(x => [x.a.name, x.next]), [['Water', '2026-11-03']]);
    eq('active accounts', sm.active, 6);
    eq('Electricity is paid, next 24 Nov', [C.analyse(house[0], T).st, C.analyse(house[0], T).next], ['paid', '2026-11-24']);
    eq('Phone is auto-pay', C.analyse(house[4], T).st, 'auto');
    eq('Gas overdue', C.analyse(house[1], T).st, 'overdue');
    eq('Water expected', C.analyse(house[3], T).st, 'expected');
    eq('closed', C.analyse(house[6], T).st, 'closed');
    eq('Electricity compared with Oct 2025', C.compareWords(C.compare(house[0], house[0].entries[2]), T), '41% higher than Oct 2025');
    const later = C.summary(house, '2026-11-04');
    eq('auto-pay after its date is a check, not overdue', [later.autoCheck.map(r => r.a.name), later.overdue.list.map(r => r.a.name)], [['Phone'], ['Gas', 'Internet']]);
    const pm = C.paidByMonth(house, T, 3);
    eq('paid per month', pm.map(x => [x.month, x.sum]), [['2026-10', 1410000], ['2026-09', 1420000], ['2026-08', 0]]);
    eq('empty household', [C.summary([], T).owed, C.summary([], T).rows.length, C.summary([], T).notIn.length], [0, 0, 0]);

    const txt = C.summaryText(house, T, 'Rs');
    eq('summary text: overdue line', txt.split('\n')[1], 'OVERDUE: Gas Rs 2,180 (due Mon 26 Oct)');
    eq('summary text: still to pay', txt.includes('Still to pay by Sat 31 Oct: Rs 5,679 (2 bills)'), true);
    eq('summary text: paid with ref', txt.includes('- Electricity: Rs 14,100 on Fri 23 Oct, Bank app, ref TXN 48120931'), true);
    eq('summary text: not in yet', txt.includes('- Water, expected around Tue 3 Nov'), true);
    eq('summary text: closed account left out', txt.includes('Old cable'), false);
    const cal = C.ics(house, T, '', '20261028T000000Z');
    eq('calendar: Internet, Phone, Maintenance due + next Electricity and Water', cal.count, 5);
    eq('calendar: reminder 2 days before', (cal.text.match(/TRIGGER:-P2D/g) || []).length, 5);
    eq('calendar: CRLF lines', cal.text.includes('\r\nEND:VCALENDAR\r\n'), true);
    eq('calendar: overdue Gas left out', cal.text.includes('Gas'), false);
    eq('money with symbol', C.fmtMoney(349900, 'Rs', 'en-US'), 'Rs 3,499'); eq('money with $', C.fmtMoney(4199, '$', 'en-US'), '$41.99'); eq('money plain', C.fmtMoney(218050, '', 'en-US'), '2,180.50');

    // saved data
    eq('clean empty', C.cleanState({ accts: [] }), { v: 1, accts: [], cur: '' });
    eq('junk is refused', C.cleanState('junk'), null); eq('no accts is refused', C.cleanState({ plans: [] }), null);
    const dirty = C.cleanState({ cur: 'Rs', accts: [{ id: 'x', name: '  Gas  ', kind: 'nuclear', every: 7, day: 40, auto: 'yes', entries: [{ due: '2026-02-30', amt: 5 }, { due: '2026-10-01', amt: -5 }, { due: '2026-10-02', amt: 100, late: 50, pays: [{ on: 'soon', amt: 1 }, { on: '2026-10-02', amt: 100 }] }] }, { name: '' }, null] });
    eq('dirty data cleaned', [dirty.accts.length, dirty.accts[0].name, dirty.accts[0].kind, dirty.accts[0].every, dirty.accts[0].day, dirty.accts[0].auto, dirty.accts[0].entries.length, dirty.accts[0].entries[0].late, dirty.accts[0].entries[0].pays.length, dirty.cur],
        [1, 'Gas', 'other', 1, 0, false, 1, 0, 1, 'Rs']);
    const long = C.cleanState({ accts: [{ name: 'x'.repeat(500), acct: 'y'.repeat(500), entries: [] }] });
    eq('long text cut', [long.accts[0].name.length, long.accts[0].acct.length], [50, 40]);

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof module !== 'undefined' && typeof require === 'function' && typeof window === 'undefined') { console.log(out.filter(l => l.startsWith('FAIL')).join('\n')); console.log(summary); if (fail) process.exit(1); }
    else document.getElementById('out').textContent = summary + '\n\n' + out.join('\n');
})();
