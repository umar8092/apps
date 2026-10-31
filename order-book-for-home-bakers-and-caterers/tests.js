// Logic checks for core.js, with answers worked out by hand. Run: node tests.js  (or open test.html)
(function () {
    const C = typeof module === 'object' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.OrderCore;
    let pass = 0; const fails = [];
    const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(name + ': got ' + g + ', want ' + w); };
    const T = '2026-11-04';   // Wednesday
    const O = (id, name, what, date, time, price, adv, extra) => Object.assign({ id, n: id, name, phone: '', what, note: '', date, time, mode: 'pickup', addr: '', price: price * 100, deliv: 0, adv: adv * 100, pays: [], status: 'open', refund: false, created: '2026-11-01' }, extra || {});
    // Sana's week from the README
    const BOOK = () => [
        O(1, 'Sana Ahmed', 'Chocolate cake, 2 pounds', '2026-11-05', '16:00', 4500, 1500, { note: 'Happy Birthday Ayesha', phone: '+92 300 1234567' }),
        O(2, 'Bilal Khan', 'Chicken biryani, 1 deg', '2026-11-05', '13:00', 9000, 3000, { mode: 'delivery', deliv: 25000, addr: 'House 12, Street 4' }),
        O(3, 'Hina', 'Cupcakes, 12', '2026-11-05', '', 2400, 2400),
        O(4, 'Ayesha Malik', 'Red velvet cake, 1 pound', '2026-11-04', '18:00', 2800, 0, { status: 'ready' }),
        O(5, 'Farah', 'Frozen samosas, 2 dozen', '2026-11-02', '12:00', 1800, 0, { status: 'done' }),
        O(6, 'Usman', 'Lunch boxes x10', '2026-11-07', '11:30', 6000, 2000, { mode: 'delivery' }),
        O(7, 'Zara', 'Brownies', '2026-11-03', '15:00', 1500, 500, { status: 'cancel' }),
        O(8, 'Nadia', 'Cake', '2026-11-01', '17:00', 3500, 1000, { status: 'done', pays: [{ d: '2026-11-01', amt: 250000 }] }),
        O(9, 'Imran', 'Kheer, 1 kg', '2026-11-03', '19:30', 1200, 0),
    ];

    // dates and times
    eq('fmtDate', C.fmtDate('2026-11-05'), 'Thu 5 Nov');
    eq('fmtDateLong', C.fmtDateLong('2026-11-05'), 'Thursday 5 November');
    eq('week starts Monday', C.weekStart(T), '2026-11-02');
    eq('week start on a Sunday', C.weekStart('2026-11-08'), '2026-11-02');
    eq('week start on a Monday', C.weekStart('2026-11-09'), '2026-11-09');
    eq('month end Feb leap', C.monthEnd('2028-02-10'), '2028-02-29');
    eq('month end Dec', C.monthEnd('2026-12-31'), '2026-12-31');
    eq('addDays over the year', C.addDays('2026-12-31', 1), '2027-01-01');
    eq('relDay', [C.relDay('2026-11-04', T), C.relDay('2026-11-05', T), C.relDay('2026-11-03', T), C.relDay('2026-11-08', T), C.relDay('2026-11-01', T)], ['today', 'tomorrow', 'yesterday', 'in 4 days', '3 days ago']);
    eq('fmtTime', ['00:00', '00:30', '12:00', '13:05', '23:30', ''].map(C.fmtTime), ['12:00 am', '12:30 am', '12:00 pm', '1:05 pm', '11:30 pm', 'Any time']);
    eq('isDate rejects 31 Nov', C.isDate('2026-11-31'), false);
    eq('isDate ok', C.isDate('2028-02-29'), true);
    eq('isTime', [C.isTime('24:00'), C.isTime('9:00'), C.isTime('09:00'), C.isTime('')], [false, false, true, true]);

    // money
    eq('readMoney 4,500', C.readMoney('4,500'), 450000);
    eq('readMoney lakh', C.readMoney('1,25,000'), 12500000);
    eq('readMoney cents', C.readMoney(' 4500.5 '), 450050);
    eq('readMoney zero', C.readMoney('0'), 0);
    ['-5', '1.234', '', 'abc', '12345678901'].forEach(s => eq('readMoney bad ' + s, Number.isNaN(C.readMoney(s)), true));
    eq('fmtMoney plain', C.fmtMoney(925000, '', 'intl'), '9,250');
    eq('fmtMoney Rs lakh', C.fmtMoney(12500000, 'Rs', 'sa'), 'Rs 1,25,000');
    eq('fmtMoney $ cents', C.fmtMoney(450050, '$', 'intl'), '$4,500.50');
    eq('fmtMoney negative', C.fmtMoney(-5000, '£', 'intl'), '-£50');

    // one order
    const b = BOOK(), [sana, bilal, hina] = b;
    eq('total pickup', C.total(sana), 450000);
    eq('total with delivery', C.total(bilal), 925000);
    eq('balance Sana', C.balance(sana), 300000);
    eq('balance Bilal', C.balance(bilal), 625000);
    eq('balance Hina paid in full', C.balance(hina), 0);
    eq('pickup ignores a leftover delivery charge', C.total(O(1, 'a', 'b', T, '', 100, 0, { deliv: 5000 })), 10000);
    eq('moneyLine part paid', C.moneyLine(bilal, 'Rs', 'intl'), 'Total Rs 9,250 (with Rs 250 delivery), paid Rs 3,000, balance Rs 6,250');
    eq('moneyLine paid in full', C.moneyLine(hina, '', 'intl'), 'Total 2,400, paid in full');
    eq('moneyLine nothing paid', C.moneyLine(b[3], '', 'intl'), 'Total 2,800, nothing paid yet');
    eq('moneyLine cancel kept', C.moneyLine(b[6], '', 'intl'), 'Cancelled, you kept 500');
    eq('moneyLine cancel refund', C.moneyLine(Object.assign({}, b[6], { refund: true }), '', 'intl'), 'Cancelled, 500 given back');
    eq('moneyLine overpaid', C.moneyLine(O(1, 'a', 'b', T, '', 100, 0, { pays: [{ d: T, amt: 12000 }] }), '', 'intl'), 'Total 100, paid 120 (20 more than the total)');
    eq('free order', C.moneyLine(O(1, 'a', 'b', T, '', 0, 0), '', 'intl'), 'Total 0, nothing paid yet');

    // the book
    const s = C.summary(b, T);
    eq('today: 1 order, collect 2,800', [s.today.count, s.today.collect, s.today.list.map(o => o.id)], [1, 280000, [4]]);
    eq('tomorrow: 3 orders in time order, collect 9,250', [s.tomorrow.count, s.tomorrow.collect, s.tomorrow.list.map(o => o.id)], [3, 925000, [2, 1, 3]]);
    eq('late: Imran', s.late.map(o => o.id), [9]);
    eq('owed: Farah', s.owed.map(o => o.id), [5]);
    eq('week', s.week, { from: '2026-11-02', to: '2026-11-08', count: 7, cancelled: 1, sales: 2845000, received: 940000, toCollect: 1905000 });
    eq('month', [s.month.count, s.month.sales, s.month.received, s.month.toCollect], [8, 3195000, 1290000, 1905000]);
    const refunded = BOOK(); refunded[6].refund = true;
    eq('refunded advance leaves sales', [C.summary(refunded, T).week.sales, C.summary(refunded, T).week.received], [2795000, 890000]);
    eq('empty book', C.summary([], T).week, { from: '2026-11-02', to: '2026-11-08', count: 0, cancelled: 0, sales: 0, received: 0, toCollect: 0 });
    eq('countOn Thu', C.countOn(b, '2026-11-05'), 3);
    eq('countOn Thu while editing one', C.countOn(b, '2026-11-05', 1), 2);
    eq('countOn ignores cancelled', C.countOn(b, '2026-11-03'), 1);

    const up = C.listView(b, 'upcoming', T, '');
    eq('upcoming groups: late first, then by day', up.groups.map(g => g.key), ['late', '2026-11-04', '2026-11-05', '2026-11-07']);
    eq('upcoming count', up.count, 6);
    eq('Thursday group collect', up.groups[2].collect, 925000);
    eq('done newest first', C.listView(b, 'done', T, '').groups.map(g => g.key), ['2026-11-02', '2026-11-01']);
    eq('cancelled tab', C.listView(b, 'cancel', T, '').count, 1);
    eq('all', C.listView(b, 'all', T, '').count, 9);
    eq('search name', C.listView(b, 'all', T, 'sana').count, 1);
    eq('search phone', C.listView(b, 'all', T, '1234567').count, 1);
    eq('search item', C.listView(b, 'all', T, 'CAKE').count, 4);
    eq('search order number', C.listView(b, 'all', T, '#9').groups[0].list[0].name, 'Imran');
    eq('search no match', C.listView(b, 'all', T, 'pizza').count, 0);
    eq('customers', C.customers(b.concat([O(10, 'sana ahmed ', 'Cake', T, '', 1, 0)])).map(c => c.name + '|' + c.phone + '|' + c.count).slice(0, 3), ['Ayesha Malik||1', 'Bilal Khan||1', 'Farah||1']);
    eq('repeat customer keeps phone and count', C.customers(b.concat([O(10, 'sana ahmed', 'Cake', '2026-12-01', '', 1, 0)])).find(c => c.name.toLowerCase() === 'sana ahmed').count, 2);
    eq('repeat customer phone', C.customers(b.concat([O(10, 'sana ahmed', 'Cake', '2026-12-01', '', 1, 0)])).find(c => c.name.toLowerCase() === 'sana ahmed').phone, '+92 300 1234567');

    // messages
    eq('confirm message', C.message(sana, 'confirm', 'Rs', 'intl', "Sana's Bakes"),
        "Hi Sana, your order is confirmed. Thank you!\n\nOrder #1: Chocolate cake, 2 pounds\nNote: Happy Birthday Ayesha\nPickup: Thursday 5 November at 4:00 pm\nTotal: Rs 4,500\nPaid: Rs 1,500\nBalance to pay on pickup: Rs 3,000\nSana's Bakes");
    eq('confirm delivery', C.message(bilal, 'confirm', '', 'intl', '').split('\n').slice(3, 7),
        ['Delivery: Thursday 5 November at 1:00 pm to House 12, Street 4', 'Total: 9,250 (with 250 delivery)', 'Paid: 3,000', 'Balance to pay on delivery: 6,250']);
    eq('confirm paid in full, any time', C.message(hina, 'confirm', '', 'intl', '').split('\n').slice(3), ['Pickup: Thursday 5 November', 'Total: 2,400', 'Paid: 2,400', 'Paid in full.']);
    eq('reminder', C.message(sana, 'remind', '', 'intl', ''), 'Hi Sana, a reminder that your order (Chocolate cake, 2 pounds) is for pickup on Thursday 5 November at 4:00 pm.\nBalance to pay: 3,000.\nSee you then!');
    eq('ready delivery', C.message(bilal, 'ready', '', 'intl', ''), 'Hi Bilal, your order (Chicken biryani, 1 deg) is ready and on its way.\nBalance to pay: 6,250.');
    eq('pay reminder', C.message(b[4], 'pay', '', 'intl', ''), 'Hi Farah, a kind reminder that 1,800 is still to be paid for your order of Mon 2 Nov (Frozen samosas, 2 dozen).\nTotal 1,800, paid 0. Thank you!');
    const dl = C.dayListText(b, '2026-11-05', '', 'intl').split('\n');
    eq('day list head', dl[0], 'Orders for Thu 5 Nov 2026: 3 orders, collect 9,250');
    eq('day list first is 1 pm', dl[2], '1:00 pm - Bilal Khan - #2');
    eq('day list any time last', dl.filter(l => /^\S/.test(l))[3], 'Any time - Hina - #3');
    eq('empty day list', C.dayListText(b, '2026-11-20', '', 'intl'), 'Orders for Fri 20 Nov 2026: 0 orders\nNo orders.');
    const csv = C.csv([O(1, 'Ali, "Bhai"', '=cmd', T, '', 4500.5, 0)]).split('\r\n');
    eq('csv header', csv[0].split(',').length, 16);
    eq('csv quotes and formula guard', csv[1], '1,2026-11-04,,"Ali, ""Bhai""",,"\'=cmd",,pickup,,4500.50,0.00,4500.50,0.00,4500.50,Confirmed,');

    // saved data
    eq('cleanState rejects junk', [C.cleanState(null), C.cleanState({}), C.cleanState('x')], [null, null, null]);
    const cs = C.cleanState({ cur: 'BTC', style: 'x', limit: -1, nextId: 1, orders: [O(3, ' A ', 'b', T, '25:00', 1, 0), O(4, 'A', '', T, '', 1, 0), O(5, 'A', 'b', '2026-02-30', '', 1, 0), O(6, 'A', 'b', T, '', -1, 0), O(7, 'A', 'b', T, '09:15', 10, 2, { status: 'weird', pays: [{ d: 'x', amt: 5 }, { d: T, amt: 100 }] }), O(7, 'dup', 'b', T, '', 1, 0)] });
    eq('cleanState keeps only valid orders', cs.orders.map(o => o.id), [7]);
    eq('cleanState repairs fields', [cs.cur, cs.style, cs.limit, cs.nextId, cs.orders[0].status, cs.orders[0].pays], ['', 'intl', 0, 8, 'open', [{ d: T, amt: 100 }]]);
    eq('cleanState round trip', C.cleanState(JSON.parse(JSON.stringify({ cur: 'Rs', style: 'sa', limit: 4, shop: 'S', nextId: 10, orders: BOOK() }))).orders.length, 9);
    eq('huge amount', C.fmtMoney(C.readMoney('9999999999.99'), '', 'intl'), '9,999,999,999.99');

    const out = 'Order Book logic: ' + pass + ' passed, ' + fails.length + ' failed' + (fails.length ? '\n' + fails.join('\n') : '');
    if (typeof document !== 'undefined') { const pre = document.createElement('pre'); pre.textContent = out; document.body.appendChild(pre); } else { console.log(out); if (fails.length) process.exitCode = 1; }
})();
