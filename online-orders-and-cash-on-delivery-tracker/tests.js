// Logic checks for core.js, with answers worked out by hand. Run: node tests.js  (or open test.html)
(function () {
    const C = typeof module === 'object' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.ParcelCore;
    let pass = 0; const fails = [];
    const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(name + ': got ' + g + ', want ' + w); };
    const T = '2026-11-16';   // Monday
    const O = (id, shop, what, price, pay, ordered, extra) => C.newOrder(Object.assign({ shop, what, price: Math.round(price * 100), pay, ordered }, extra || {}), id);
    // Ayesha's parcels from the README
    const LIST = () => [
        O(1, 'Temu', 'Phone case', 1250, 'cod', '2026-11-02', { expected: '2026-11-13', track: 'TM123456789' }),
        O(2, 'Daraz', 'Kurta', 3200, 'cod', '2026-11-14', { expected: '2026-11-17' }),
        O(3, 'Amazon', 'Earbuds', 24.99, 'online', '2026-11-09', { expected: '2026-11-20', cur: '$' }),
        O(4, 'Daraz', "Kids' shoes", 3000, 'cod', '2026-11-15', { expected: '2026-11-19' }),
        O(5, 'Shein', 'Shoes', 4800, 'online', '2026-11-01', { status: 'arrived', arrived: '2026-11-07', retDays: 14 }),
        O(6, 'Daraz', 'Table lamp', 2150, 'cod', '2026-11-08', { status: 'arrived', arrived: '2026-11-13', codPaid: 215000, retDays: 7 }),
        O(7, 'Instagram shop', 'Handbag', 2500, 'online', '2026-11-03', { status: 'cancelled', endDate: '2026-11-04', refundDue: 250000, refunds: [{ d: '2026-11-10', amt: 100000 }] }),
        O(8, 'Daraz', 'Watch', 5000, 'cod', '2026-10-20', { status: 'returning', arrived: '2026-10-25', codPaid: 500000, retSent: '2026-10-27', refundDue: 500000 }),
        O(9, 'Temu', 'Charger', 900, 'cod', '2026-11-06', { status: 'refused', endDate: '2026-11-10' }),
        O(10, 'Daraz', 'Water bottle', 1100, 'online', '2026-11-04', { status: 'arrived', arrived: '2026-11-09' }),
    ];
    const L = LIST();
    const by = n => L.find(o => o.n === n);

    // dates
    eq('fmtDate', C.fmtDate('2026-11-21'), 'Sat 21 Nov');
    eq('addDays over the year', C.addDays('2026-12-28', 7), '2027-01-04');
    eq('addDays leap day', C.addDays('2028-02-22', 7), '2028-02-29');
    eq('relDay', [C.relDay('2026-11-16', T), C.relDay('2026-11-17', T), C.relDay('2026-11-15', T), C.relDay('2026-11-20', T)], ['today', 'tomorrow', 'yesterday', 'in 4 days']);

    // money input: exact cents, junk refused
    eq('readMoney plain', C.readMoney('3200'), 320000);
    eq('readMoney commas and cents', C.readMoney('1,250.5'), 125050);
    eq('readMoney lakh commas', C.readMoney('1,50,000'), 15000000);
    eq('readMoney zero', C.readMoney('0'), 0);
    eq('readMoney spaces', C.readMoney(' 24.99 '), 2499);
    eq('readMoney blank', Number.isNaN(C.readMoney('')), true);
    eq('readMoney negative', Number.isNaN(C.readMoney('-5')), true);
    eq('readMoney three decimals', Number.isNaN(C.readMoney('1.234')), true);
    eq('readMoney letters', Number.isNaN(C.readMoney('12abc')), true);
    eq('readMoney too big', Number.isNaN(C.readMoney('12345678901')), true);
    eq('fmtMoney', [C.fmtMoney(745000, 'Rs', 'intl'), C.fmtMoney(2499, '$', 'intl'), C.fmtMoney(15000000, '', 'sa'), C.fmtMoney(5, '', 'intl')], ['Rs 7,450', '$24.99', '1,50,000', '0.05']);
    eq('fmtMulti main first', C.fmtMulti({ '$': 2499, '': 745000 }, 'Rs', 'intl'), 'Rs 7,450 + $24.99');
    eq('fmtMulti empty', C.fmtMulti({}, '', 'intl'), '0');

    // one order
    eq('paid: online is paid at once', C.paid(by(3)), 2499);
    eq('paid: cash on delivery on the way is not paid yet', C.paid(by(1)), 0);
    eq('paid: cash on delivery arrived', C.paid(by(6)), 215000);
    eq('paid: refused at the door', C.paid(by(9)), 0);
    eq('refund owed: part refund', C.refundOwed(by(7)), 150000);
    eq('refund owed: returned, nothing back yet', C.refundOwed(by(8)), 500000);
    eq('refund owed: refused cash on delivery owes nothing', C.refundOwed(by(9)), 0);
    eq('spent after a part refund', C.spent(by(7)), 150000);
    eq('return by', [C.returnBy(by(5)), C.returnBy(by(6)), C.returnBy(by(10))], ['2026-11-21', '2026-11-20', '']);
    eq('return open', [C.returnOpen(by(5), T), C.returnOpen(by(5), '2026-11-21'), C.returnOpen(by(5), '2026-11-22')], [true, true, false]);
    eq('keeping it hides the return', C.returnOpen(Object.assign({}, by(5), { keep: true }), T), false);
    eq('late', [C.isLate(by(1), T), C.isLate(by(2), T), C.isLate(by(2), '2026-11-17'), C.isLate(by(2), '2026-11-18')], [true, false, false, true]);
    eq('no expected date is never late', C.isLate(O(20, '', 'X', 1, 'cod', T), '2030-01-01'), false);

    // words on each box
    eq('when: late', C.whenLine(by(1), T), 'Late: expected Fri 13 Nov, 3 days ago');
    eq('when: tomorrow', C.whenLine(by(2), T), 'Expected tomorrow (Tue 17 Nov)');
    eq('when: today', C.whenLine(by(2), '2026-11-17'), 'Expected today (Tue 17 Nov)');
    eq('when: in 4 days', C.whenLine(by(3), T), 'Expected in 4 days, Fri 20 Nov');
    eq('when: unknown', C.whenLine(O(21, '', 'Mug', 5, 'online', '2026-11-12'), T), 'Ordered Thu 12 Nov, arrival date not known');
    eq('when: return window', C.whenLine(by(5), T), 'Arrived Sat 7 Nov, return by Sat 21 Nov (5 days left)');
    eq('when: last day to return', C.whenLine(by(5), '2026-11-21'), 'Arrived Sat 7 Nov, last day to return is today');
    eq('when: return closed', C.whenLine(by(5), '2026-11-25'), 'Arrived Sat 7 Nov, return window closed Sat 21 Nov');
    eq('when: one day left', C.whenLine(by(6), '2026-11-19'), 'Arrived Fri 13 Nov, return by Fri 20 Nov (1 day left)');
    eq('when: no window', C.whenLine(by(10), T), 'Arrived Mon 9 Nov');
    eq('when: sent back', C.whenLine(by(8), T), 'Sent back Tue 27 Oct, 20 days ago');
    eq('when: refused', C.whenLine(by(9), T), 'Refused at the door Tue 10 Nov');
    eq('money: cash on delivery', C.moneyLine(by(1), 'Rs', 'intl'), 'Cash on delivery: keep Rs 1,250 ready');
    eq('money: other currency', C.moneyLine(by(3), 'Rs', 'intl'), 'Paid online $24.99');
    eq('money: paid rider', C.moneyLine(by(6), 'Rs', 'intl'), 'Paid Rs 2,150 cash to the rider');
    eq('money: part refund', C.moneyLine(by(7), 'Rs', 'intl'), 'Refund Rs 2,500: got Rs 1,000, still waiting for Rs 1,500');
    eq('money: refund not received', C.moneyLine(by(8), 'Rs', 'intl'), 'Refund Rs 5,000, not received yet');
    eq('money: refused', C.moneyLine(by(9), 'Rs', 'intl'), 'Nothing paid');
    const full = Object.assign({}, by(7), { refunds: [{ d: '2026-11-10', amt: 100000 }, { d: '2026-11-12', amt: 150000 }] });
    eq('money: refunded in full', [C.moneyLine(full, 'Rs', 'intl'), C.refundOwed(full), C.badge(full, T).t], ['Refunded Rs 2,500 in full', 0, 'Cancelled']);
    const closed = Object.assign({}, by(7), { refundClosed: true });
    eq('money: no more refund coming', [C.moneyLine(closed, 'Rs', 'intl'), C.refundOwed(closed)], ['Refunded Rs 1,000 of Rs 2,500, no more coming', 0]);
    eq('money: cancelled with no refund due', C.moneyLine(O(22, '', 'X', 500, 'online', T, { status: 'cancelled', endDate: T }), 'Rs', 'intl'), 'Paid Rs 500, no refund expected');
    eq('badges', L.map(o => C.badge(o, T).t), ['Late', 'On the way', 'On the way', 'On the way', 'Can return', 'Can return', 'Refund waiting', 'Refund waiting', 'Refused', 'Arrived']);

    // the summary: Ayesha's answer
    const S = C.summary(L, T);
    eq('on the way, by expected date', S.coming.map(o => o.n), [1, 2, 4, 3]);
    eq('cash on delivery parcels', S.cod.map(o => o.n), [1, 2, 4]);
    eq('cash to keep: 1,250 + 3,200 + 3,000', C.fmtMulti(S.cash, 'Rs', 'intl'), 'Rs 7,450');
    eq('late', S.late.map(o => o.n), [1]);
    eq('arriving today or tomorrow', S.soon.map(o => o.n), [2]);
    eq('returns, soonest first', S.returns.map(o => o.n), [6, 5]);
    eq('refunds, oldest first', S.refunds.map(o => o.n), [8, 7]);
    eq('refund total: 5,000 + 1,500', C.fmtMulti(S.refundTotal, 'Rs', 'intl'), 'Rs 6,500');
    eq('month name', S.month.name, 'November 2026');
    eq('month orders (not cancelled or refused)', S.month.count, 7);
    eq('month spent: 4,800 + 2,150 + 1,500 + 1,100, plus $24.99', C.fmtMulti(S.month.spent, 'Rs', 'intl'), 'Rs 9,550 + $24.99');
    eq('month refunded', C.fmtMulti(S.month.refunded, 'Rs', 'intl'), 'Rs 1,000');
    eq('month shops', S.month.shops.map(s => s.shop + ' ' + s.n + ' ' + C.fmtMulti(s.m, 'Rs', 'intl')), ['Daraz 2 Rs 3,250', 'Amazon 1 $24.99', 'Shein 1 Rs 4,800', 'Instagram shop 1 Rs 1,500']);
    eq('two currencies of cash on delivery', C.fmtMulti(C.summary([O(1, '', 'A', 10, 'cod', T), O(2, '', 'B', 2.5, 'cod', T, { cur: '$' }), O(3, '', 'C', 0.75, 'cod', T)], T).cash, '', 'intl'), '10.75 + $2.50');
    const E = C.summary([], T);
    eq('empty summary', [E.coming.length, C.isZero(E.cash), E.month.count, C.fmtMulti(E.month.spent, '', 'intl')], [0, true, 0, '0']);
    eq('zero price parcel adds nothing to cash', C.isZero(C.summary([O(1, '', 'Free gift', 0, 'cod', T)], T).cash), true);

    // tabs and search
    eq('tab on the way', C.listView(L, 'coming', T, '').map(o => o.n), [1, 2, 4, 3]);
    eq('tab arrived, newest first', C.listView(L, 'arrived', T, '').map(o => o.n), [6, 10, 5]);
    eq('returns tab holds the two refunds', C.listView(L, 'returns', T, '').map(o => o.n).sort(), [7, 8]);
    eq('counts', C.counts(L), { coming: 4, arrived: 3, returns: 2, all: 10 });
    eq('search shop', C.listView(L, 'all', T, 'temu').map(o => o.n).sort((a, b) => a - b), [1, 9]);
    eq('search tracking', C.listView(L, 'all', T, 'tm1234').map(o => o.n), [1]);
    eq('search case and spaces', C.listView(L, 'all', T, '  KURTA ').map(o => o.n), [2]);
    eq('search order number', C.listView(L, 'all', T, '#10').map(o => o.n), [10]);
    eq('search nothing', C.listView(L, 'all', T, 'zzz').length, 0);
    eq('shop names once each', C.shopNames(L), ['Temu', 'Daraz', 'Amazon', 'Shein', 'Instagram shop']);

    // text to copy and send
    eq('coming text', C.comingText(L, T, 'Rs', 'intl'), [
        'On the way: 4 parcels (Mon 16 Nov 2026)',
        '- Phone case from Temu, LATE, expected Fri 13 Nov, cash on delivery Rs 1,250, tracking TM123456789',
        '- Kurta from Daraz, expected Tue 17 Nov, cash on delivery Rs 3,200',
        "- Kids' shoes from Daraz, expected Thu 19 Nov, cash on delivery Rs 3,000",
        '- Earbuds from Amazon, expected Fri 20 Nov, paid online',
        '', 'Keep Rs 7,450 cash ready for 3 cash on delivery parcels.'].join('\n'));
    eq('chase a late parcel', C.chaseText(by(1), T, 'Rs', 'intl'), ['Hello, I am asking about my order: Phone case.', 'Order date: Mon 2 Nov 2026', 'Tracking number: TM123456789',
        'It was expected on Fri 13 Nov 2026 (3 days ago) and has not arrived.', 'Please tell me where it is and when it will be delivered. Thank you.'].join('\n'));
    eq('chase a part refund', C.chaseText(by(7), T, 'Rs', 'intl'), ['Hello, I am waiting for a refund for my order: Handbag.', 'Order date: Tue 3 Nov 2026', 'I cancelled it on Wed 4 Nov 2026 (12 days ago).',
        'I have received Rs 1,000 so far. Rs 1,500 is still to be refunded.', 'Please tell me when it will be paid. Thank you.'].join('\n'));
    eq('chase a returned parcel', C.chaseText(by(8), T, 'Rs', 'intl').split('\n')[2], 'I returned it on Tue 27 Oct 2026 (20 days ago).');
    const csv = C.csv(L, 'Rs').split('\r\n');
    eq('csv rows', csv.length, 12);
    eq('csv first order', csv[1], '1,Temu,Phone case,Rs,1250.00,Cash on delivery,2026-11-02,2026-11-13,On the way,,0.00,,,0.00,0.00,0.00,TM123456789,,,');
    eq('csv formula is neutralised', C.csv([O(1, '=HYPERLINK("x")', 'A', 1, 'online', T)], '').split('\r\n')[1].split(',')[1], '"\'=HYPERLINK(""x"")"');

    // saved data
    eq('clean state from junk', C.cleanState('nonsense'), { v: 1, cur: '', style: 'intl', nextId: 1, orders: [] });
    eq('clean state from null', C.cleanState(null).orders.length, 0);
    const dirty = C.cleanState({ cur: 'Rs', style: 'sa', nextId: 2, orders: [
        { id: 5, what: 'Ok', price: 100, ordered: '2026-11-01', pay: 'cod', status: 'arrived' },
        { id: 5, what: 'Duplicate id', price: 100, ordered: '2026-11-01' },
        { id: 6, what: '', price: 100, ordered: '2026-11-01' },
        { id: 7, what: 'Bad price', price: -1, ordered: '2026-11-01' },
        { id: 8, what: 'Bad date', price: 1, ordered: '2026-02-30' },
        { id: 9, what: 'Fixes', price: 50.5, ordered: '2026-11-01' },
        { id: 10, what: 'Weird', price: 100, ordered: '2026-11-01', status: 'lost', cur: 'XYZ', retDays: 9999, refunds: [{ d: 'x', amt: 5 }, { d: '2026-11-02', amt: 40 }] },
    ] });
    eq('clean keeps valid orders only', dirty.orders.map(o => o.id), [5, 10]);
    eq('clean settings', [dirty.cur, dirty.style, dirty.nextId], ['Rs', 'sa', 11]);
    eq('clean arrived without a date gets the order date', dirty.orders[0].arrived, '2026-11-01');
    eq('clean fixes bad values', [dirty.orders[1].status, dirty.orders[1].cur, dirty.orders[1].retDays, dirty.orders[1].refunds], ['coming', '', 0, [{ d: '2026-11-02', amt: 40 }]]);
    eq('long text is cut', C.newOrder({ what: 'x'.repeat(1000), price: 1, ordered: T }, 1).what.length, 300);
    eq('round trip', C.cleanState(JSON.parse(JSON.stringify({ orders: L }))).orders, L);

    const out = pass + ' passed, ' + fails.length + ' failed' + (fails.length ? '\n' + fails.join('\n') : '');
    if (typeof document !== 'undefined') { const p = document.createElement('pre'); p.textContent = out; document.body.appendChild(p); }
    else { console.log(out); if (fails.length) process.exit(1); }
})();
