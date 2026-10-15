// Checks for the maths in core.js. Run: node tests.js  (or open test.html in a browser)
(function (root) {
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.NetWorthCore;
    let pass = 0, failed = 0;
    const out = [];
    function eq(got, want, what) {
        const g = JSON.stringify(got), w = JSON.stringify(want);
        if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); }
    }

    // ---- reading amounts
    eq(C.parseAmount('1310.20'), { cents: 131020 }, 'plain decimal');
    eq(C.parseAmount('1,310.20'), { cents: 131020 }, 'thousands comma');
    eq(C.parseAmount('1.310,20 €'), { cents: 131020 }, 'european');
    eq(C.parseAmount('12,5'), { cents: 1250 }, 'decimal comma');
    eq(C.parseAmount('$9,200'), { cents: 920000 }, 'symbol and thousands');
    eq(C.parseAmount('-250'), { cents: -25000 }, 'overdrawn');
    eq(C.parseAmount('−45.50'), { cents: -4550 }, 'unicode minus');
    eq(C.parseAmount('(80)'), { cents: -8000 }, 'brackets mean minus');
    eq(C.parseAmount('-0'), { cents: 0 }, 'minus zero is zero');
    eq(C.parseAmount(''), { blank: true }, 'blank');
    eq(C.parseAmount('   '), { blank: true }, 'spaces');
    eq(C.parseAmount('abc'), { err: 'nan' }, 'words');
    eq(C.parseAmount('12-05'), { err: 'nan' }, 'dash between digits');
    eq(C.parseAmount('1.2.3'), { err: 'nan' }, 'two dots');
    eq(C.parseAmount('0.005'), { cents: 1 }, 'rounds half up');
    eq(C.parseAmount('99999999999.99'), { cents: 9999999999999 }, 'largest 11 digits');
    eq(C.parseAmount('100000000000'), { cents: 10000000000000 }, 'the limit itself');
    eq(C.parseAmount('100000000000.01'), { err: 'big' }, 'over the limit');
    eq(C.parseAmount('1234567890123'), { err: 'big' }, 'far too big');
    eq(C.fmt(1592460, ''), '15,924.60', 'format');
    eq(C.fmt(-320000, '$'), '-$3,200.00', 'format negative with symbol');
    eq(C.fmt(5, 'Rs'), 'Rs 0.05', 'format letters symbol');
    eq(C.plain(131020), '1310.20', 'plain');
    eq(C.plain(-4550), '-45.50', 'plain negative');
    eq(C.plain(0), '0', 'plain zero');
    eq(C.plain(920000), '9200', 'plain whole');

    // ---- dates
    eq(C.addMonths('2026-10-16', -3), '2026-07-16', 'three months back');
    eq(C.addMonths('2026-03-31', -1), '2026-02-28', 'end of month clamps');
    eq(C.addMonths('2026-01-15', -1), '2025-12-15', 'across a year');
    eq(C.dateText('2026-09-16'), '16 Sep 2026', 'date text');
    eq(C.validDate('2026-02-29'), false, '29 Feb in a common year');
    eq(C.validDate('2028-02-29'), true, '29 Feb in a leap year');

    // ---- the worked example from the README
    function example() {
        const s = C.clean(null);
        const acc = [['cur', 'Current account', 'cash'], ['sav', 'Savings', 'savings'], ['pen', 'Pension', 'pension'], ['car', 'Car', 'vehicle'], ['ln', 'Car loan', 'loan'], ['cc', 'Credit card', 'card']];
        acc.forEach(([id, name, kind]) => s.accounts.push({ id, name, kind }));
        const dates = ['2026-07-16', '2026-08-16', '2026-09-16', '2026-10-16'];
        const v = { cur: [124000, 98050, 142075, 131020], sav: [300000, 325000, 350000, 375000], pen: [840000, 861000, 879000, 902000],
            car: [950000, 940000, 930000, 920000], ln: [780000, 752000, 724000, 696000], cc: [64000, 91030, 48000, 39560] };
        dates.forEach((d, i) => Object.keys(v).forEach(id => C.setValue(s, d, id, v[id][i])));
        return s;
    }
    let s = example();
    eq(s.entries.map(e => e.date), ['2026-07-16', '2026-08-16', '2026-09-16', '2026-10-16'], 'entries sorted');
    eq(C.totalsAt(s, 3), { own: 2328020, owe: 735560, net: 1592460 }, 'October totals');
    eq(C.totalsAt(s, 2), { own: 2301075, owe: 772000, net: 1529075 }, 'September totals');
    eq(C.totalsAt(s, 1).net, 1381020, 'August net');
    eq(C.totalsAt(s, 0).net, 1370000, 'July net');
    eq(C.changeAt(s, 3).diff, 63385, 'up 633.85 since September');
    eq(C.changeAt(s, 3).since, '2026-09-16', 'compared with September');
    eq(C.changeAt(s, 3).added.length, 0, 'no new accounts');
    eq(C.totalsAt(s, 3).net - C.totalsAt(s, 0).net, 222460, 'up 2,224.60 since July');
    eq(C.changeAt(s, 0), null, 'first update has no change');
    eq(C.accChange(s, s.accounts[5], 3), { diff: -8440, better: true, since: '2026-09-16' }, 'card owed less is better');
    eq(C.accChange(s, s.accounts[3], 3), { diff: -10000, better: false, since: '2026-09-16' }, 'car worth less is worse');
    eq(C.accChange(s, s.accounts[0], 2), { diff: 44025, better: true, since: '2026-08-16' }, 'cash up is better');

    // ---- a new update starts with every balance carried forward
    s = example();
    let i = C.ensureEntry(s, '2026-11-16');
    eq(i, 4, 'new entry at the end');
    eq(C.totalsAt(s, 4).net, 1592460, 'carried balances');
    eq(Object.keys(s.entries[4].values).length, 6, 'new entry stores every balance');
    C.setValue(s, '2026-11-16', 'cc', 0);
    eq(C.changeAt(s, 4).diff, 39560, 'card paid off: up 395.60');
    eq(C.ensureEntry(s, '2026-11-16'), 4, 'same date is the same entry');

    // ---- a skipped month added later, in between
    s = example();
    i = C.ensureEntry(s, '2026-09-01');
    eq(i, 2, 'back-dated entry slots in');
    eq(C.totalsAt(s, 2).net, 1381020, 'starts from August');
    C.setValue(s, '2026-09-01', 'cur', 100000);
    eq(C.totalsAt(s, 3).net, 1529075, 'September unchanged by the new entry');

    // ---- a new account (a house) is reported separately in the change
    s = example();
    s.accounts.push({ id: 'h', name: 'Flat', kind: 'home' });
    C.setValue(s, '2026-10-16', 'h', 30000000);
    let ch = C.changeAt(s, 3);
    eq(ch.diff, 63385 + 30000000, 'change includes the house');
    eq(ch.addedTotal, 30000000, 'house counted as new');
    eq(C.accChange(s, s.accounts[6], 3).isNew, true, 'house is new since September');
    eq(C.valueAt(s, 'h', 2), null, 'house had no balance in September');
    s.accounts.push({ id: 'm', name: 'Mortgage', kind: 'mortgage' });
    C.setValue(s, '2026-10-16', 'm', 25000000);
    eq(C.changeAt(s, 3).addedTotal, 5000000, 'new mortgage takes away');
    eq(C.totalsAt(s, 3).net, 1592460 + 5000000, 'net with house and mortgage');

    // ---- negative net worth, overdraft, zero
    s = C.clean(null);
    s.accounts.push({ id: 'b', name: 'Bank', kind: 'cash' }, { id: 'st', name: 'Student loan', kind: 'loan' });
    C.setValue(s, '2026-10-16', 'b', -4550);
    C.setValue(s, '2026-10-16', 'st', 2400000);
    eq(C.totalsAt(s, 0), { own: -4550, owe: 2400000, net: -2404550 }, 'negative net worth');
    C.setValue(s, '2026-10-16', 'b', 0); C.setValue(s, '2026-10-16', 'st', 0);
    eq(C.totalsAt(s, 0).net, 0, 'zero');
    eq(C.totalsAt(s, -1), { own: 0, owe: 0, net: 0 }, 'no entries');

    // ---- huge values stay exact
    s = C.clean(null);
    for (let k = 0; k < 50; k++) { s.accounts.push({ id: 'x' + k, name: 'A' + k, kind: 'invest' }); C.setValue(s, '2026-10-16', 'x' + k, C.MAX_AMOUNT); }
    eq(C.totalsAt(s, 0).net, 50 * C.MAX_AMOUNT, '50 accounts at the limit stay exact');
    eq(Number.isSafeInteger(C.totalsAt(s, 0).net), true, 'safe integer');

    // ---- deleting an update keeps what later updates showed
    s = example();
    s.accounts.push({ id: 'h', name: 'Flat', kind: 'home' });
    s.entries[1].values.h = 100000;             // the house was added in August and later updates carried it
    delete s.entries[2].values.h; delete s.entries[3].values.h;
    C.deleteEntry(s, '2026-08-16');
    eq(C.valueAt(s, 'h', 2), 100000, 'house still there in October after August is deleted');
    eq(s.entries.length, 3, 'three updates left');
    eq(C.deleteEntry(s, '2020-01-01'), false, 'deleting a missing date');

    // ---- deleting an account removes it from every update
    s = example();
    C.deleteAccount(s, 'cc');
    eq(C.totalsAt(s, 3).owe, 696000, 'card gone everywhere');
    eq(s.entries.every(e => e.values.cc === undefined), true, 'no card values left');

    // ---- saved data checks
    eq(C.clean('nonsense'), { v: 1, cur: '', accounts: [], entries: [] }, 'corrupt string');
    eq(C.clean({ cur: 'BAD', accounts: 'x', entries: 5 }), { v: 1, cur: '', accounts: [], entries: [] }, 'wrong types');
    const dirty = C.clean({ cur: '£', accounts: [{ id: 'a', name: '  My   bank ', kind: 'cash' }, { id: 'a', name: 'dupe', kind: 'cash' }, { id: 'b', name: '', kind: 'cash' }, { id: 'c', name: 'Card', kind: 'zzz' }, { id: 'd', name: 'Loan', kind: 'loan' }],
        entries: [{ date: '2026-10-16', values: { a: 12.5, c: 100, zz: 5, d: -5 } }, { date: '2026-02-30', values: {} }, { date: '2026-09-16', values: { a: 100 } }, { date: '2026-09-16', values: { a: 7 } }] });
    eq(dirty.cur, '£', 'currency kept');
    eq(dirty.accounts, [{ id: 'a', name: 'My bank', kind: 'cash' }, { id: 'c', name: 'Card', kind: 'ownother' }, { id: 'd', name: 'Loan', kind: 'loan' }], 'accounts cleaned');
    eq(dirty.entries, [{ date: '2026-09-16', values: { a: 100 } }, { date: '2026-10-16', values: { c: 100 } }], 'entries cleaned and sorted');
    eq(C.clean({ accounts: [{ id: 'a', name: 'x'.repeat(90), kind: 'cash' }] }).accounts[0].name.length, 40, 'long name cut');

    // ---- spreadsheet
    s = example();
    s.accounts[0].name = '=HYPERLINK("x")';
    const lines = C.csv(s).trim().split('\r\n');
    eq(lines[0], 'Date,"\'=HYPERLINK(""x"")",Savings,Pension,Car,Car loan (owed),Credit card (owed),Total I own,Total I owe,Net worth', 'csv header, formula made harmless');
    eq(lines[4], '2026-10-16,1310.20,3750.00,9020.00,9200.00,6960.00,395.60,23280.20,7355.60,15924.60', 'csv October row');

    out.push(pass + ' passed, ' + failed + ' failed');
    if (typeof module !== 'undefined' && module.exports) { console.log(out.join('\n')); if (failed) process.exit(1); }
    else { root.testResult = { pass, failed, out }; }
})(this);
