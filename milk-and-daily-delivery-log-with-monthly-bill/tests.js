// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.MDL;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const L = 'en-GB', T = '2026-10-20';
    const c = s => C.parseAmount(s).cents, err = s => !!C.parseAmount(s).error;
    const q = (s, z) => C.parseQty(s, z).m, qerr = (s, z) => !!C.parseQty(s, z).error;

    // typed prices
    eq('220', c('220'), 22000); eq('1,500', c('1,500'), 150000); eq('Rs 220', c('Rs 220'), 22000); eq('12.50', c('12.50'), 1250); eq('12,50', c('12,50'), 1250);
    eq('lakh', c('1,00,000'), 10000000); eq('pasted nbsp', c('2 500'), 250000);
    eq('blank', err(''), true); eq('zero', err('0'), true); eq('minus', err('-5'), true); eq('words', err('abc'), true); eq('3 decimals', err('0.505'), true);
    eq('price max', C.parseAmount('1000000', { max: C.MAXP }).cents, 100000000); eq('price too big', !!C.parseAmount('1000001', { max: C.MAXP }).error, true);
    eq('huge', err('99999999999999'), true);

    // typed amounts per day
    eq('2', q('2'), 2000); eq('1.5', q('1.5'), 1500); eq('1,5', q('1,5'), 1500); eq('0.25', q('0.25'), 250); eq('.5', q('.5'), 500); eq('1/2', q('1/2'), 500);
    eq('1 1/2', q('1 1/2'), 1500); eq('½', q('½'), 500); eq('2 litres', q('2 litres'), 2000); eq('1.5L', q('1.5L'), 1500); eq('3 cans', q('3 cans'), 3000);
    eq('0 not allowed as usual', qerr('0'), true); eq('0 allowed for a day', q('0', true), 0); eq('blank', qerr(''), true); eq('minus', qerr('-1'), true);
    eq('4 decimals', qerr('0.1255'), true); eq('too much', qerr('1001'), true); eq('max', q('1000'), 1000000); eq('1/3 not exact', qerr('1/3'), true); eq('words', qerr('two'), true);

    // words
    eq('fmt plain', C.fmt(1331000, '', 'en-US'), '13,310'); eq('fmt Rs', C.fmt(22000, 'Rs', 'en-US'), 'Rs 220'); eq('fmt $', C.fmt(1250, '$', 'en-US'), '$12.50');
    eq('qty 1 litre', C.qtyText(1000, 'litre', L), '1 litre'); eq('qty 1.5 litres', C.qtyText(1500, 'litre', L), '1.5 litres'); eq('copies', C.qtyText(20000, 'copy', L), '20 copies');
    eq('custom unit', C.qtyText(2000, 'jar', L), '2 jar');

    // dates
    eq('days in Feb leap', C.daysIn('2028-02'), 29); eq('days in Feb', C.daysIn('2027-02'), 28); eq('next month Dec', C.addMonth('2026-12', 1), '2027-01'); eq('prev month Jan', C.addMonth('2027-01', -1), '2026-12');
    eq('rangeList', C.rangeList(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-20'], L), '8 to 10 Oct, 20 Oct');
    eq('dayList', C.dayList(['2026-10-05', '2026-10-12'], L), '5 Oct and 12 Oct');

    // rounding: what the seller charges
    eq('cost 59 L x 220', C.costOf(59000, 22000), 1298000); eq('cost 0.75 x 0.99 rounds half up', C.costOf(750, 99), 74); eq('cost 0.5 x 0.01', C.costOf(500, 1), 1);
    eq('cost biggest month fits', Number.isSafeInteger(31 * C.MAXQ * C.MAXP), true);

    // the README situation: 2 litres of milk every day at 220 from 1 Sep 2026; September paid in full on 2 Oct.
    // October: not delivered on 5 and 12 Oct, 3 litres on 17 Oct for guests, price 230 from 16 Oct. Today is Tue 20 Oct.
    function milk() {
        const it = C.newItem('m', '2026-09-01'); it.name = 'Milk'; it.seller = 'Ahmed';
        it.plans = [{ from: '2026-09-01', q: 2000, p: 22000 }, { from: '2026-10-16', q: 2000, p: 23000 }];
        it.ch = { '2026-10-05': 0, '2026-10-12': 0, '2026-10-17': 3000 };
        it.pay = { '2026-09': [{ id: 'p1', d: '2026-10-02', c: 1320000 }] };
        return it;
    }
    let it = milk();
    let sep = C.monthBill(it, '2026-09', null);
    eq('Sep days', sep.days, 30); eq('Sep litres', sep.qty, 60000); eq('Sep bill', sep.cents, 1320000);
    let v = C.monthView(it, '2026-10', T);
    eq('Oct state', v.state, 'now'); eq('Oct so far days', v.sofar.days, 18); eq('Oct so far litres', v.sofar.qty, 37000);
    eq('Oct segments', v.sofar.segs.map(s => [s.q, s.p, s.cents]), [[26000, 22000, 572000], [11000, 23000, 253000]]);
    eq('Oct so far bill', v.sofar.cents, 825000); eq('missed', v.sofar.missed, ['2026-10-05', '2026-10-12']);
    eq('changed', v.sofar.changed, [{ d: '2026-10-17', q: 3000, usual: 2000 }]);
    eq('brought forward 0 (Sep paid)', v.bf, 0); eq('to pay now', v.toPay, 825000);
    eq('full month litres', v.full.qty, 59000); eq('full month bill', v.full.cents, 572000 + 759000); eq('to pay by month end', v.toPayFull, 1331000);
    eq('usual text', C.usualText(it, C.planOn(it, T), '', L), '2 litres every day at 230 per litre');
    eq('plan before change', C.planOn(it, '2026-10-15').p, 22000); eq('plan on change day', C.planOn(it, '2026-10-16').p, 23000);
    eq('summary', C.summaryText(it, '2026-10', T, 'Rs', 'en-US').split('\n'), [
        'Milk: October 2026 (Ahmed)', 'So far, 1 to Oct 20:', 'Delivered on 18 days: 37 litres',
        '26 litres × Rs 220 = Rs 5,720 (Oct 1 to Oct 15)', '11 litres × Rs 230 = Rs 2,530 (Oct 16 to Oct 20)',
        'Not delivered: Oct 5 and Oct 12', 'Changed: Oct 17 3 litres (usual 2)', 'Bill for these days: Rs 8,250', 'To pay: Rs 8,250']);

    // last day of the month: the bill is the whole month
    v = C.monthView(it, '2026-10', '2026-10-31');
    eq('31 Oct so far = full', v.sofar.cents, v.full.cents); eq('31 Oct summary says month', C.summaryText(it, '2026-10', '2026-10-31', '', L).includes('Bill for the month: 13,310'), true);
    // November: October unpaid is carried
    v = C.monthView(it, '2026-11', '2026-11-03');
    eq('Nov brought forward = Oct bill', v.bf, 1331000); eq('Nov so far 3 days', v.sofar.qty, 6000); eq('Nov to pay', v.toPay, 1331000 + 138000);
    // pay October in November (recorded for October) -> nothing carried
    it.pay['2026-10'] = [{ id: 'p2', d: '2026-11-01', c: 1331000 }];
    eq('Nov bf after paying Oct', C.monthView(it, '2026-11', '2026-11-03').bf, 0);
    // part payment then advance
    it.pay['2026-10'] = [{ id: 'p2', d: '2026-11-01', c: 1000000 }];
    eq('part payment carried', C.broughtForward(it, '2026-11'), 331000);
    it.pay['2026-10'] = [{ id: 'p2', d: '2026-11-01', c: 1500000 }];
    eq('overpaid becomes paid ahead', C.broughtForward(it, '2026-11'), -169000);
    eq('paid ahead words', C.balanceText(-169000, '', 'en-US'), 'Paid ahead: 1,690 (nothing to pay)');
    eq('all paid words', C.balanceText(0, '', 'en-US'), 'Nothing to pay: all paid');
    // a past month view
    eq('Sep is past', C.monthView(it, '2026-09', T).state, 'past'); eq('Sep to pay 0', C.monthView(it, '2026-09', T).toPay, 0);
    // a future month is "expected"
    v = C.monthView(it, '2026-12', T);
    eq('Dec future', v.state, 'future'); eq('Dec expected', v.bill.qty, 62000); eq('future summary', C.summaryText(it, '2026-12', T, '', L).split('\n')[1], 'Expected if nothing changes:');

    // opening balance: owed 500 before starting, and an advance
    it = milk(); it.open = 50000; eq('opening owed in Sep', C.broughtForward(it, '2026-09'), 50000);
    it.open = -50000; eq('opening advance', C.monthView(it, '2026-09', T).toPay, 1320000 - 50000 - 1320000);

    // started mid-month: 17 Oct, 1.5 litres
    it = C.newItem('x', '2026-10-17'); it.plans[0] = { from: '2026-10-17', q: 1500, p: 22000 };
    v = C.monthView(it, '2026-10', T);
    eq('mid-month days', v.sofar.days, 4); eq('mid-month litres', v.sofar.qty, 6000); eq('mid-month bill', v.sofar.cents, 132000);
    eq('before start is none', C.dayInfo(it, '2026-10-16').kind, 'none'); eq('Sep nothing', C.monthBill(it, '2026-09', null).days, 0);
    eq('bf before start month', C.broughtForward(it, '2026-10'), 0);
    // stopped
    it.stop = '2026-10-18'; eq('stopped after 18', C.monthView(it, '2026-10', T).sofar.days, 2); eq('full month after stop', C.monthBill(it, '2026-10', null).days, 2);

    // pause (away 8 to 10 Oct), and a delivery that still came on the 9th
    it = milk(); it.ch = {}; it.pauses = [{ id: 'a', from: '2026-10-08', to: '2026-10-10' }];
    let b = C.monthBill(it, '2026-10', T);
    eq('paused days', b.paused, ['2026-10-08', '2026-10-09', '2026-10-10']); eq('paused not billed', b.days, 17);
    it.ch['2026-10-09'] = 2000; b = C.monthBill(it, '2026-10', T);
    eq('delivery on a paused day counts', b.days, 18); eq('paused list shrinks', b.paused, ['2026-10-08', '2026-10-10']);
    eq('pause words', C.rangeList(['2026-10-08', '2026-10-10'], L), '8 Oct, 10 Oct');

    // chosen weekdays: water cans on Mon and Thu, 1 can at 120
    it = C.newItem('w', '2026-10-01'); it.name = 'Water cans'; it.unit = 'can'; it.mode = 'week'; it.wd = [1, 4]; it.plans[0] = { from: '2026-10-01', q: 1000, p: 12000 };
    b = C.monthBill(it, '2026-10', null);
    eq('Mon+Thu in Oct 2026', b.days, 9); eq('cans bill', b.cents, 108000);
    eq('weekday text', C.usualText(it, it.plans[0], '', L), '1 can on Mon, Thu at 120 per can');
    it.ch['2026-10-03'] = 2000; b = C.monthBill(it, '2026-10', null);
    eq('extra on a Saturday', b.extra, [{ d: '2026-10-03', q: 2000 }]); eq('extra billed', b.qty, 11000);
    it.ch['2026-10-04'] = 0; eq('0 on a day off is not "missed"', C.monthBill(it, '2026-10', null).missed, []);
    // every 2nd day from 1 Oct: 1, 3, ... 31 -> 16 days
    it = C.newItem('a', '2026-10-01'); it.mode = 'alt'; it.plans[0].p = 10000;
    eq('every 2nd day', C.monthBill(it, '2026-10', null).days, 16); eq('alt continues into Nov (1 Nov is day 31)', C.dayInfo(it, '2026-11-01').kind, 'off');
    eq('alt text', C.usualText(it, it.plans[0], '', L), '1 litre every 2nd day at 100 per litre');

    // February and 31-day months, newspaper
    it = C.newItem('n', '2027-02-01'); it.unit = 'copy'; it.plans[0].p = 4000;
    eq('Feb 2027 28 copies', C.monthBill(it, '2027-02', null).qty, 28000); eq('Mar 31 copies', C.monthBill(it, '2027-03', null).cents, 124000);
    eq('newspaper text', C.usualText(it, it.plans[0], 'Rs', 'en-US'), '1 copy every day at Rs 40 per copy');

    // decimals that do not make whole cents: 0.75 litres a day at 0.99 for 31 days = 23.25 x 0.99 = 23.0175 -> 23.02
    it = C.newItem('d', '2026-10-01'); it.plans[0] = { from: '2026-10-01', q: 750, p: 99 };
    eq('decimal bill rounds once, half up', C.monthBill(it, '2026-10', null).cents, 2302);
    // price 0 (free samples) still counts the litres
    it.plans[0].p = 0; eq('free', C.monthBill(it, '2026-10', null).cents, 0);

    // saved data
    eq('clean null', C.cleanState(null), null); eq('clean junk', C.cleanState({ items: 'x' }), null);
    let s = C.cleanState({ cur: 'Rs', items: [milk(), { start: 'bad' }, { start: '2026-10-01', plans: [] }, Object.assign(milk(), { id: 'm' })] });
    eq('clean keeps good, drops bad and duplicate id', s.items.length, 1); eq('clean cur', s.cur, 'Rs');
    eq('clean unknown cur', C.cleanState({ cur: '<b>', items: [] }).cur, '');
    let bad = milk(); bad.ch['2026-13-01'] = 1000; bad.ch['2026-10-18'] = -5; bad.plans.push({ from: '2026-08-01', q: 1000, p: 5 }); bad.pay['nope'] = [{ d: '2026-10-01', c: 5 }]; bad.pay['2026-08'] = [{ d: 'x', c: 5 }]; bad.wd = [9, 1, 1];
    let cl = C.cleanItem(bad);
    eq('bad days dropped', Object.keys(cl.ch).sort(), ['2026-10-05', '2026-10-12', '2026-10-17']); eq('plan before start folded', cl.plans, [{ from: '2026-09-01', q: 2000, p: 22000 }, { from: '2026-10-16', q: 2000, p: 23000 }]);
    eq('bad pay months dropped', Object.keys(cl.pay), ['2026-09']); eq('weekdays cleaned', cl.wd, [1]);
    eq('round trip', JSON.stringify(C.cleanItem(JSON.parse(JSON.stringify(milk())))) === JSON.stringify(milk()), true);

    out.push('', pass + ' passed, ' + fail + ' failed');
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n');
    else { console.log(out.join('\n')); if (fail) process.exitCode = 1; }
})();
