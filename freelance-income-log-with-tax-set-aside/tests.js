// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.INCOME;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const m = s => C.parseMoney(s).n, merr = s => !!C.parseMoney(s).error;
    const T = '2026-10-28';

    // typed amounts
    eq('500', m('500'), 50000); eq('1,850.50', m('1,850.50'), 185050); eq('Rs 1,25,000 (lakh)', m('Rs 1,25,000'), 12500000); eq('$600', m('$600'), 60000); eq('pasted with spaces', m('  41.99 '), 4199);
    eq('blank', merr(''), true); eq('words', merr('abc'), true); eq('minus', merr('-50'), true); eq('3 decimals', merr('1.2345'), true); eq('1.234 is one thousand', m('1.234'), 123400); eq('huge', merr('1000000000'), true);
    // fee
    eq('fee 10% of 600', C.parseFee('10%', 60000), { fee: 6000, pct: 1000 }); eq('fee 24', C.parseFee('24', 80000), { fee: 2400, pct: null }); eq('fee blank', C.parseFee('', 80000), { fee: 0, pct: null });
    eq('fee 3% of 33.33 rounds 0.9999 to 1.00', C.parseFee('3%', 3333).fee, 100); eq('fee 2.5% of 99.99 = 2.49975 -> 2.50', C.parseFee('2.5%', 9999).fee, 250);
    eq('fee equal to amount', !!C.parseFee('600', 60000).error, true); eq('fee 100%', !!C.parseFee('100%', 60000).error, true); eq('fee words', !!C.parseFee('ten', 60000).error, true); eq('fee minus', !!C.parseFee('-5', 60000).error, true);
    // rate
    eq('rate 279.5', C.parseRate('279.5').n, 279500000); eq('rate 0.0037', C.parseRate('0.0037').n, 3700); eq('rate 1,234.567891', C.parseRate('1,234.567891').n, 1234567891); eq('rate 0', !!C.parseRate('0').error, true); eq('rate 7 decimals', !!C.parseRate('1.1234567').error, true);
    // percent
    eq('pct 15', C.parsePct('15').n, 1500); eq('pct 12.5%', C.parsePct('12.5%').n, 1250); eq('pct over 60', !!C.parsePct('61', 6000).error, true); eq('pct words', C.pctWords(1250), '12.5%'); eq('pct words 7.25', C.pctWords(725), '7.25%');

    // tax years
    eq('Pakistan Oct', C.taxYear('2026-10-28', '07-01'), { from: '2026-07-01', to: '2027-06-30', label: '2026-27' });
    eq('Pakistan 30 Jun', C.taxYear('2026-06-30', '07-01').label, '2025-26');
    eq('UK 5 Apr', C.taxYear('2026-04-05', '04-06'), { from: '2025-04-06', to: '2026-04-05', label: '2025-26' });
    eq('UK 6 Apr', C.taxYear('2026-04-06', '04-06').from, '2026-04-06'); eq('India 31 Mar', C.taxYear('2027-03-31', '04-01').label, '2026-27');
    eq('calendar year', C.taxYear('2026-12-31', '01-01'), { from: '2026-01-01', to: '2026-12-31', label: '2026' }); eq('bad start falls back', C.taxYear('2026-05-01', 'xx').label, '2026');
    eq('months wrap', [C.addMonth('2026-12', 1), C.addMonth('2026-01', -1), C.addMonth('2026-10', -11)], ['2027-01', '2025-12', '2025-11']);
    eq('month last Feb leap', C.monthLast('2028-02'), '2028-02-29');
    eq('guess tax start', ['Asia/Karachi', 'Asia/Kolkata', 'Europe/London', 'Australia/Sydney', 'America/New_York', 'Asia/Dhaka'].map(C.guessTaxStart), ['07-01', '04-01', '04-06', '07-01', '01-01', '07-01']);

    // the worked example: Bilal in Lahore, October 2026
    const cl = (id, name, cur) => ({ id, name, cur: cur || '', fee: '' });
    const pay = (id, client, d, cur, gross, fee, o) => Object.assign({ id, client, date: d, cur, gross, fee, feePct: null, rate: 0, home: null, refund: false, note: '' }, o || {});
    const S = C.cleanState({ clients: [cl('n', 'Northwind Studio', 'USD'), cl('b', 'Brightline Media', 'USD'), cl('m', 'Maple and Co', 'GBP'), cl('l', 'Local school')], pct: 1500, taxStart: '07-01', cur: 'Rs', saved: [{ id: 's1', date: '2026-09-30', amt: 3000000 }],
        pays: [
            pay('p1', 'n', '2026-10-02', 'USD', 60000, 6000, { feePct: 1000, rate: 279200000 }),     // 540 USD x 279.20 = 150,768.00
            pay('p2', 'b', '2026-10-14', 'USD', 80000, 2400, { home: 21604000 }),                     // 776 USD -> 216,040.00 typed
            pay('p3', 'm', '2026-10-20', 'GBP', 25000, 185, { rate: 371600000 }),                     // 248.15 GBP x 371.60 = 92,212.54
            pay('p4', 'l', '2026-10-25', '', 3500000, 0),                                               // 35,000 in your own money
            pay('p5', 'b', '2026-10-27', 'USD', 30000, 900),                                            // 291 USD still in Payoneer
            pay('p6', 'n', '2026-09-12', 'USD', 50000, 5000, { feePct: 1000, rate: 280000000 }),       // Sep: 450 x 280 = 126,000.00
            pay('p7', 'n', '2026-09-20', 'USD', 10000, 0, { refund: true, rate: 280000000 }),          // Sep refund: -28,000.00
            pay('p8', 'm', '2026-06-15', 'GBP', 20000, 0, { home: 7000000 })                           // Jun (last tax year): 70,000
        ] });
    eq('state kept all 8 payments', S.pays.length, 8);
    eq('p1 home 150,768.00', C.homeOf(S.pays[0]), 15076800); eq('p3 home 92,212.54', C.homeOf(S.pays[2]), 9221254); eq('p4 own currency 35,000', C.homeOf(S.pays[3]), 3500000);
    eq('p5 not in bank', C.homeOf(S.pays[4]), null); eq('p7 refund negative', C.homeOf(S.pays[6]), -2800000);
    eq('p2 rate you got 278.402062', C.rateOf(S.pays[1]), 278402062); eq('fmtRate', C.fmtRate(278402062), '278.40');
    const oct = C.stats(S, '2026-10-01', '2026-10-31');
    eq('Oct reached bank 494,020.54', oct.home, 49402054);
    eq('Oct counts', [oct.count, oct.pendingCount, oct.refunds], [5, 1, 0]);
    eq('Oct USD paid and fees', oct.byCur.USD, { gross: 170000, fee: 9300, count: 3 }); eq('Oct pending 291 USD', oct.pending, { USD: 29100 });
    eq('Oct set aside 15% = 74,103.08', C.setAside(oct.home, 1500), 7410308);
    eq('fee share USD 93/1700 = 5.5%', C.feeShare(9300, 170000), '5.5%'); eq('fee share none', C.feeShare(0, 100), '0%'); eq('fee share 10%', C.feeShare(6000, 60000), '10%');
    const sep = C.stats(S, '2026-09-01', '2026-09-30');
    eq('Sep after refund 98,000', sep.home, 9800000); eq('Sep refunds 1', sep.refunds, 1); eq('Sep USD gross after refund 400', sep.byCur.USD.gross, 40000);
    eq('negative month sets aside 0', C.setAside(-500, 1500), 0);
    // average: first payment Jun, so Oct over 5 months (Jun-Oct): 70,000 + 0 + 0 + 98,000 + 494,020.54 = 662,020.54 / 5 = 132,404.108 -> 132,404.11
    const a6 = C.average(S, '2026-10', 6);
    eq('average since June', [a6.from, a6.months, a6.total, a6.avg], ['2026-06', 5, 66202054, 13240411]);
    eq('average before first payment', C.average(S, '2026-05', 6), null);
    eq('first month', C.firstMonth(S), '2026-06');
    // tax year 2026-27: Sep + Oct = 98,000 + 494,020.54 = 592,020.54; 15% = 88,803.081 -> 88,803.08; put aside 30,000; still 58,803.08
    const tx = C.taxStats(S, T);
    eq('tax year totals', [tx.ty.label, tx.s.home, tx.need, tx.putAside, tx.left], ['2026-27', 59202054, 8880308, 3000000, 5880308]);
    const cs = C.clientStats(S, tx.ty.from, tx.ty.to);
    eq('best client Northwind (248,768) then Brightline (216,040)', cs.map(r => r.c.name), ['Northwind Studio', 'Brightline Media', 'Maple and Co', 'Local school']);
    eq('Northwind tax year 150,768 + 126,000 - 28,000', cs[0].s.home, 24876800); eq('Brightline pending count', cs[1].s.pending, 1); eq('Maple June payment is last tax year', cs[2].s.home, 9221254);
    eq('12 months list ends Oct', C.months(S, '2026-10', 12).map(x => x.key)[11], '2026-10');
    eq('months Jun value', C.months(S, '2026-10', 12).find(x => x.key === '2026-06').home, 7000000);

    // words
    eq('fmtIn USD', C.fmtIn(29100, 'USD', 'Rs', 'en-US'), '291 USD'); eq('fmtIn own', C.fmtIn(3500000, '', 'Rs', 'en-US'), 'Rs 35,000'); eq('fmtMoney $', C.fmtMoney(-1250, '$', 'en-US'), '-$12.50');
    eq('curList', C.curList(oct.byCur, 'gross', 'Rs', 'en-US'), 'Rs 35,000 + 250 GBP + 1,700 USD');
    const txt = C.summaryText(S, '2026-10', T, 'en-US');
    eq('summary has bank total', txt.includes('Reached my bank: Rs 494,020.54 from 5 payments'), true);
    eq('summary has tax', txt.includes('Keep 15% aside for tax: Rs 74,103.08'), true);
    eq('summary has pending', txt.includes('Not in my bank yet: 291 USD'), true);
    eq('summary tax year', txt.includes('Tax year 2026-27 (1 Jul 2026 to 30 Jun 2027): Rs 592,020.54 received, keep aside Rs 88,803.08, put aside so far Rs 30,000, still to put aside Rs 58,803.08'), true);
    const csv = C.csv(S, tx.ty.from, tx.ty.to).split('\r\n');
    eq('csv header + 7 rows + end', csv.length, 9);
    eq('csv first row', csv[1], '2026-09-12,Northwind Studio,500,USD,50,450,280,126000,,');
    eq('csv refund row', csv[2], '2026-09-20,Northwind Studio,-100,USD,0,-100,280,-28000,Yes,');
    eq('csv pending row', csv[7], '2026-10-27,Brightline Media,300,USD,9,291,,Not yet,,');
    eq('csv own currency', csv[6].split(',')[3], 'Own currency (Rs)');
    eq('csv formula guarded', C.csv(C.cleanState({ clients: [cl('x', '=HYPERLINK("a")')], pays: [pay('q', 'x', T, '', 100, 0)] }), T, T).split('\r\n')[1].startsWith(T + ',"\'=HYPERLINK'), true);

    // saved data is checked
    eq('corrupt state', C.cleanState('nope'), null); eq('missing arrays', C.cleanState({ clients: 1 }), null);
    const bad = C.cleanState({ clients: [cl('a', 'A'), { id: 'z' }, cl('a', 'Dup id')], pays: [pay('1', 'a', '2026-02-30', '', 100, 0), pay('2', 'a', T, '', 100, 100), pay('3', 'ghost', T, '', 100, 0), pay('4', 'a', T, 'XYZ', 500, 0, { rate: -1, home: 1.5 }), pay('5', 'a', T, '', 0, 0)], pct: 99999, taxStart: 'x', cur: 'toolong' });
    eq('bad rows dropped', [bad.clients.length, bad.pays.length, bad.pct, bad.taxStart, bad.cur], [2, 1, 1000, '01-01', '']);
    eq('unknown currency becomes own', [bad.pays[0].cur, bad.pays[0].rate, bad.pays[0].home], ['', 0, null]);
    eq('duplicate ids made unique', bad.clients[0].id !== bad.clients[1].id, true);
    eq('mulDiv big numbers exact', C.mulDiv(10000000000, 1000000000000, 1000000), 10000000000000000);
    eq('mulDiv rounds half up', [C.mulDiv(5, 1, 10), C.mulDiv(-5, 1, 10), C.mulDiv(4, 1, 10)], [1, -1, 0]);

    const res = 'ALL ' + (pass + fail) + ' CHECKS: ' + pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = res + '\n\n' + out.join('\n');
    else { out.filter(l => l.startsWith('FAIL')).forEach(l => console.log(l)); console.log(res); if (fail) process.exitCode = 1; }
})();
