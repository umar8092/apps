// Logic checks for core.js, with answers worked out by hand. Run: node tests.js  (or open test.html)
(function () {
    const C = typeof module === 'object' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.RentCore;
    let pass = 0; const fails = [];
    const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(name + ': got ' + g + ', want ' + w); };
    const T = '2026-10-21';
    const P = (id, d, amt, method) => ({ id, n: id, d, amt: amt * 100, method: method || 'cash', note: '' });
    // Ahmed rents Flat 2 from 17 Jun 2026 at 30,000 a month due on the 5th, June charged by days; 32,000 from October
    const mk = extra => Object.assign({ id: 1, place: 'Flat 2, 14 Garden Road', tenant: 'Ahmed Khan', landlord: 'Bilal Ahmed', rents: [{ from: '2026-06', amt: 3000000 }, { from: '2026-10', amt: 3200000 }],
        due: 5, start: '2026-06-17', firstByDays: true, end: '', deposit: { amt: 6000000, back: null, backDate: '' },
        payments: [P(1, '2026-06-17', 14000), P(2, '2026-07-04', 30000, 'bank'), P(3, '2026-08-06', 30000), P(4, '2026-09-10', 20000), P(5, '2026-09-25', 10000), P(6, '2026-10-08', 17000, 'bank')], nextN: 7 }, extra || {});

    // dates
    eq('days in Feb 2028', C.daysInMonth('2028-02'), 29);
    eq('days in Feb 2027', C.daysInMonth('2027-02'), 28);
    eq('due day 31 in February', C.dueDateOf('2026-02', 31), '2026-02-28');
    eq('due day 31 in April', C.dueDateOf('2026-04', 31), '2026-04-30');
    eq('addMonths over the year', C.addMonths('2026-12', 1), '2027-01');
    eq('addMonths back', C.addMonths('2026-01', -1), '2025-12');
    eq('fmtMonth', C.fmtMonth('2026-10'), 'October 2026');

    // money
    eq('readMoney 30,000', C.readMoney('30,000'), 3000000);
    eq('readMoney lakh commas', C.readMoney('1,25,000'), 12500000);
    eq('readMoney decimals', C.readMoney(' 30000.5 '), 3000050);
    eq('readMoney negative', Number.isNaN(C.readMoney('-5')), true);
    eq('readMoney 3 decimals', Number.isNaN(C.readMoney('1.234')), true);
    eq('readMoney blank', Number.isNaN(C.readMoney('')), true);
    eq('readMoney text', Number.isNaN(C.readMoney('abc')), true);
    eq('fmtMoney plain', C.fmtMoney(1500000, '', 'intl'), '15,000');
    eq('fmtMoney Rs', C.fmtMoney(1500000, 'Rs', 'intl'), 'Rs 15,000');
    eq('fmtMoney $', C.fmtMoney(1500000, '$', 'intl'), '$15,000');
    eq('fmtMoney cents', C.fmtMoney(1550, '', 'intl'), '15.50');
    eq('fmtMoney lakh', C.fmtMoney(34500000, '', 'sa'), '3,45,000');
    eq('group crore', C.group(12345678, 'sa'), '1,23,45,678');
    eq('words 30,000', C.moneyWords(3000000, 'intl'), 'Thirty thousand only');
    eq('words 345,000 international', C.moneyWords(34500000, 'intl'), 'Three hundred forty-five thousand only');
    eq('words 3,45,000 lakh', C.moneyWords(34500000, 'sa'), 'Three lakh forty-five thousand only');
    eq('words million', C.moneyWords(123456700, 'intl'), 'One million two hundred thirty-four thousand five hundred sixty-seven only');
    eq('words crore', C.moneyWords(12500000000, 'sa'), 'Twelve crore fifty lakh only');
    eq('words cents', C.moneyWords(3050, 'intl'), 'Thirty and 50/100 only');
    eq('words 100', C.moneyWords(10000, 'intl'), 'One hundred only');
    eq('words 15', C.moneyWords(1500, 'sa'), 'Fifteen only');

    // the rent for each month
    const A = mk();
    eq('June by days: 14 of 30 days of 30,000', C.chargeFor(A, '2026-06'), { amt: 1400000, days: 14, full: false });
    eq('July full', C.chargeFor(A, '2026-07').amt, 3000000);
    eq('October new rent', C.chargeFor(A, '2026-10').amt, 3200000);
    eq('June full when not by days', C.chargeFor(mk({ firstByDays: false }), '2026-06').amt, 3000000);

    // the ledger on 21 Oct: 14,000 + 3 x 30,000 + 32,000 = 136,000 due; 121,000 paid; 15,000 owed for October, 16 days late
    const L = C.ledger(A, T);
    eq('charged', L.charged, 13600000);
    eq('paid', L.paid, 12100000);
    eq('owed', L.owed, 1500000);
    eq('paid up to September', L.upTo, '2026-09');
    eq('first unpaid is October', L.firstUnpaid.ym, '2026-10');
    eq('16 days late (due 5 Oct)', L.lateDays, 16);
    eq('first rent due on the move-in day', L.rows[0].due, '2026-06-17');
    eq('next: November 32,000 on 5 Nov', [L.next.ym, L.next.amt, L.next.due], ['2026-11', 3200000, '2026-11-05']);
    eq('no money ahead', L.ahead, 0);
    // pays 47,000 today: the rest of October and all of November
    const B = mk(); B.payments.push(P(7, T, 47000));
    const LB = C.ledger(B, T);
    eq('ahead: 168,000 - 136,000', LB.ahead, 3200000);
    eq('paid up to November', LB.upTo, '2026-11');
    eq('nothing owed', LB.owed, 0);
    eq('next is December', LB.next.ym, '2026-12');
    // what each payment paid for
    const cv = C.coverage(A);
    eq('payment 1 is June', C.coverText(cv[1], '', 'intl'), 'rent for June 2026');
    eq('payment 4 part of September', C.coverText(cv[4], '', 'intl'), 'part of the rent for September 2026 (20,000 of 30,000)');
    eq('payment 5 the rest of September', C.coverText(cv[5], '', 'intl'), 'the rest of the rent for September 2026 (10,000 of 30,000)');
    eq('payment 6 part of October', C.coverText(cv[6], 'Rs', 'intl'), 'part of the rent for October 2026 (Rs 17,000 of Rs 32,000)');
    eq('payment 7 the rest of October and November', C.coverText(C.coverage(B)[7], '', 'intl'), 'the rest of the rent for October 2026 (15,000 of 32,000), rent for November 2026');
    const two = mk({ payments: [P(1, '2026-06-17', 74000)] });
    eq('one payment for three months', C.coverText(C.coverage(two)[1], '', 'intl'), 'rent for June 2026 to August 2026');
    eq('balance after payment 6', C.balanceAfter(A, 6), 1500000);
    eq('balance after payment 4', C.balanceAfter(A, 4), 1000000);
    eq('balance after payment 1', C.balanceAfter(A, 1), 0);
    eq('balance after paying ahead', C.balanceAfter(B, 7), -3200000);

    // moved out on 10 Aug, charged by days: 30,000 x 10 / 31 = 9,677.42 -> 9,677
    const M = mk({ end: '2026-08-10', rents: [{ from: '2026-06', amt: 3000000 }], payments: [P(1, '2026-06-17', 14000), P(2, '2026-07-04', 30000), P(3, '2026-08-06', 30000)] });
    eq('last month by days', C.chargeFor(M, '2026-08').amt, 967700);
    const LM = C.ledger(M, T);
    eq('moved out: rows stop in August', LM.rows.map(r => r.ym), ['2026-06', '2026-07', '2026-08']);
    eq('moved out: paid too much', LM.over, 2032300);
    eq('moved out: ended', LM.ended, true);
    eq('moved out: no next', LM.next, null);

    // a tenancy that starts next month
    const F = mk({ start: '2026-11-01', rents: [{ from: '2026-11', amt: 3000000 }], payments: [] });
    const LF = C.ledger(F, T);
    eq('future tenancy: nothing owed', [LF.owed, LF.charged, LF.upTo], [0, 0, null]);
    eq('future tenancy: first rent next', [LF.next.ym, LF.next.due], ['2026-11', '2026-11-05']);
    // nothing paid at all: owed since June
    const N = mk({ payments: [] });
    eq('nothing paid', [C.ledger(N, T).owed, C.ledger(N, T).firstUnpaid.ym, C.ledger(N, T).lateDays], [13600000, '2026-06', 126]);
    // due today counts as due, not late
    const D = mk({ payments: A.payments.concat([P(7, '2026-10-20', 15000)]) });
    eq('due today', [C.ledger(D, '2026-11-05').owed, C.ledger(D, '2026-11-05').lateDays], [3200000, 0]);
    eq('the day before it is due', C.ledger(D, '2026-11-04').owed, 0);

    // statement for 2026
    const st = C.statement(A, 2026, T);
    eq('statement months', st.rows.map(r => r.ym), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    eq('statement totals', [st.due, st.paidTowards, st.left, st.received], [13600000, 12100000, 1500000, 12100000]);
    eq('statement text line', C.statementText(A, 2026, T, '', 'intl').split('\n')[7], 'October 2026: rent 32,000, paid 17,000, owed 15,000');
    eq('receipt text', C.receiptText(A, A.payments[5], T, 'Rs', 'intl').split('\n').slice(0, 7),
        ['RENT RECEIPT No. 6', 'Date: 8 Oct 2026', '', 'Received from Ahmed Khan the sum of Rs 17,000 (Seventeen thousand only) by bank transfer,', 'for part of the rent for October 2026 (Rs 17,000 of Rs 32,000),', 'at Flat 2, 14 Garden Road.', 'Rent still owed after this payment: Rs 15,000.']);

    // checks
    eq('tenancy ok', C.checkTenancy({ place: 'Flat 2', tenant: 'Ahmed', rent: 3000000, due: 5, start: '2026-06-17', deposit: null }, T), {});
    eq('tenancy blanks', Object.keys(C.checkTenancy({ place: '', tenant: '', rent: NaN, due: 0, start: '' }, T)), ['place', 'tenant', 'rent', 'due', 'start']);
    eq('tenancy start far away', C.checkTenancy({ place: 'a', tenant: 'b', rent: 1, due: 1, start: '2028-01-01' }, T).start, 'That is more than a year away. Check the year.');
    eq('payment in the future', C.checkPayment(A, { d: '2026-10-22', amt: 100, method: 'cash' }, T).d, 'That day has not come yet.');
    eq('payment zero', C.checkPayment(A, { d: T, amt: 0, method: 'cash' }, T).amt, 'Type the amount paid, such as 30000.');
    eq('payment ok', C.checkPayment(A, { d: T, amt: 100, method: 'wallet' }, T), {});
    eq('rent change in the first month', C.checkRentChange(A, '2026-06', 100), 'The new rent must start after the first month (June 2026). To fix the first rent, use Edit.');
    eq('rent change ok', C.checkRentChange(A, '2027-01', 3400000), '');
    const R = mk(); C.setRent(R, '2026-10', 3300000);
    eq('setRent replaces the same month', R.rents, [{ from: '2026-06', amt: 3000000 }, { from: '2026-10', amt: 3300000 }]);

    // summary of all tenancies this month
    const S = { v: 1, cur: '', style: 'intl', tenancies: [A, mk({ id: 2, tenant: 'Sara', place: 'Room 1', firstByDays: false, start: '2026-01-01', rents: [{ from: '2026-01', amt: 2000000 }], payments: [P(10, '2026-01-01', 200000)] })], nextId: 3 };
    const ms = C.monthSummary(S, T);
    // Sara paid 200,000 on 1 Jan: ten months of 20,000, January to October
    eq('month summary', [ms.due, ms.collected, ms.owing.map(o => [o.tenant, o.owed])], [5200000, 3700000, [['Ahmed Khan', 1500000]]]);

    // saved state
    eq('validate round trip', C.validate(JSON.parse(JSON.stringify(S))).tenancies.length, 2);
    eq('validate junk', C.validate('x'), null);
    eq('validate no rents', C.validate({ v: 1, tenancies: [Object.assign(mk(), { rents: [] })] }), null);
    eq('validate negative payment', C.validate({ v: 1, tenancies: [mk({ payments: [P(1, T, -5)] })] }), null);
    eq('validate a rent that starts after move-in', C.validate({ v: 1, tenancies: [mk({ rents: [{ from: '2026-07', amt: 100 }] })] }), null);
    eq('validate bad currency falls back', C.validate({ v: 1, cur: '<b>', tenancies: [] }).cur, '');
    eq('validate next receipt number', C.validate({ v: 1, tenancies: [mk({ nextN: 2 })] }).tenancies[0].nextN, 7);

    const out = 'Rent log logic: ' + pass + ' passed, ' + fails.length + ' failed' + (fails.length ? '\n' + fails.join('\n') : '');
    if (typeof document !== 'undefined') { const p = document.createElement('pre'); p.textContent = out; document.body.appendChild(p); } else { console.log(out); if (fails.length) process.exit(1); }
})();
