// Logic checks for core.js. Run with `node tests.js` or open test.html.
(function () {
    'use strict';
    var TO = (typeof window !== 'undefined' ? window : globalThis).TO;
    if (!TO && typeof require === 'function') { require('./core.js'); TO = globalThis.TO; }
    var pass = 0, fails = [];
    function eq(got, want, what) {
        var g = JSON.stringify(got), w = JSON.stringify(want);
        if (g === w) pass++; else fails.push(what + ': got ' + g + ', want ' + w);
    }
    function ok(c, what) { eq(!!c, true, what); }
    var T = '2026-10-27';

    // ---- dates ----
    eq(TO.fmt('2026-10-27'), 'Tue 27 Oct', 'short date');
    eq(TO.fmt('2027-01-01', true), 'Fri 1 Jan 2027', 'date with year');
    eq(TO.fmtNear('2027-01-01', T), 'Fri 1 Jan 2027', 'next year shows its year');
    eq(TO.addDays('2026-12-31', 1), '2027-01-01', 'over the new year');
    eq(TO.addDays('2028-02-28', 1), '2028-02-29', 'leap day');
    eq(TO.addDays('2026-03-28', 2), '2026-03-30', 'over a clock change');
    eq(TO.rel('2026-10-28', T), 'tomorrow', 'tomorrow');
    eq(TO.rel('2026-11-03', T), 'in 7 days', 'in 7 days');
    ok(!TO.isIso('2026-02-30'), '30 Feb is not a date'); ok(!TO.isIso(''), 'blank is not a date'); ok(!TO.isIso('2026-1-5'), 'needs two digits');
    eq(TO.age('2026-10-27', T), 'today', 'measured today');
    eq(TO.age('2026-10-20', T), '7 days ago', 'a week ago in days');
    eq(TO.age('2026-09-27', T), '4 weeks ago', 'four weeks');
    eq(TO.age('2026-03-12', T), '7 months ago', 'seven months');
    eq(TO.age('2025-03-28', T), '1 year 6 months ago', 'year and months');
    eq(TO.monthsBetween('2026-01-31', '2026-02-28'), 0, 'not a full month yet');

    // ---- reading measurements ----
    eq(TO.parseMeasure('14'), 14, 'whole');
    eq(TO.parseMeasure('14.5'), 14.5, 'decimal');
    eq(TO.parseMeasure('14,5'), 14.5, 'decimal comma');
    eq(TO.parseMeasure('14½'), 14.5, 'half sign');
    eq(TO.parseMeasure('14 ½'), 14.5, 'half sign with space');
    eq(TO.parseMeasure('14 1/2'), 14.5, 'fraction with space');
    eq(TO.parseMeasure('14-3/4'), 14.75, 'fraction with dash');
    eq(TO.parseMeasure('1/2'), 0.5, 'fraction alone');
    eq(TO.parseMeasure('38 in'), 38, 'with in');
    eq(TO.parseMeasure('96cm'), 96, 'with cm');
    eq(TO.parseMeasure(' 22" '), 22, 'with inch mark');
    eq(TO.parseMeasure(''), null, 'blank is empty');
    eq(TO.parseMeasure('   '), null, 'spaces are empty');
    ok(isNaN(TO.parseMeasure('abc')), 'letters');
    ok(isNaN(TO.parseMeasure('14 3/2')), 'top-heavy fraction');
    ok(isNaN(TO.parseMeasure('14 1/0')), 'divide by zero');
    ok(isNaN(TO.parseMeasure('-3')), 'negative typed');
    eq(TO.checkMeasure('0', 'in').error, 'A measurement must be more than 0.', 'zero refused');
    eq(TO.checkMeasure('250', 'in').error, 'That is more than 200 inches. Check the number and the unit.', 'huge inches');
    eq(TO.checkMeasure('250', 'cm').value, 250, '250 cm is fine');
    eq(TO.checkMeasure('x', 'cm').error, 'Type a number like 14, 14.5 or 14 1/2.', 'not a number');
    eq(TO.checkMeasure('', 'cm'), { value: null }, 'blank is fine');

    // ---- showing measurements ----
    eq(TO.fmtMeasure(14.5, 'in'), '14½', 'half');
    eq(TO.fmtMeasure(38.75, 'in'), '38¾', 'three quarters');
    eq(TO.fmtMeasure(9.125, 'in'), '9⅛', 'eighth');
    eq(TO.fmtMeasure(0.5, 'in'), '½', 'just a half');
    eq(TO.fmtMeasure(40, 'in'), '40', 'whole inches');
    eq(TO.fmtMeasure(14.3, 'in'), '14.3', 'odd decimal stays decimal');
    eq(TO.fmtMeasure(96.25, 'cm'), '96.3', 'cm one decimal');
    eq(TO.fmtMeasure(96, 'cm'), '96', 'cm whole');

    // ---- converting ----
    eq(TO.convert(14.5, 'in', 'cm'), 37, '14½ in is about 37 cm');
    eq(TO.convert(37, 'cm', 'in'), 14.5, '37 cm is about 14½ in');
    eq(TO.convert(40, 'in', 'cm'), 101.5, '40 in = 101.6 cm, shown 101.5');
    eq(TO.convert(100, 'cm', 'in'), 39.25, '100 cm = 39.37 in, shown 39¼');
    eq(TO.convert(12, 'in', 'in'), 12, 'same unit unchanged');

    // ---- what changed ----
    var old = { unit: 'in', date: '2025-03-01', values: { length: 34, chest: 30, sleeve: 20 }, custom: [] };
    var now = { unit: 'in', date: '2026-03-12', values: { length: 36.5, chest: 30, sleeve: 21, neck: 13 }, custom: [] };
    eq(TO.changes(old, now).map(function (c) { return c.text; }), ['Shirt / kameez length 34 → 36½', 'Sleeve length 20 → 21'], 'growth shown, unchanged and new fields skipped');
    var oldCm = { unit: 'cm', date: '2025-01-01', values: { chest: 76 }, custom: [] };
    eq(TO.changes(oldCm, { unit: 'in', date: '2026-01-01', values: { chest: 31 }, custom: [] }).map(function (c) { return c.text; }), ['Chest 30 → 31'], 'older cm set converted to inches');
    eq(TO.changes(null, now), [], 'first set has no changes');

    // ---- measurement text for the tailor ----
    var ali = { id: 'p1', name: 'Ali', note: 'Loose fit, round daman', sets: [old, { unit: 'in', date: '2026-03-12', values: { length: 38, chest: 34, sleeve: 22.5, tlength: 37, bottom: 7.5 }, custom: [{ label: 'Kurta collar style', text: 'Ban' }] }] };
    eq(TO.measureText(ali, T), 'Ali measurements (inches, taken Thu 12 Mar 2026)\n\nShirt / kameez\nLength: 38\nChest: 34\nSleeve length: 22½\n\nShalwar / trousers\nLength: 37\nBottom / paicha: 7½\n\nOther\nKurta collar style: Ban\n\nFit: Loose fit, round daman', 'measurement text');
    eq(TO.measureText({ name: 'Sara', note: '', sets: [] }, T), 'Sara: no measurements saved yet.', 'no measurements yet');

    // ---- money ----
    eq(TO.parseMoney('1200'), 120000, 'plain');
    eq(TO.parseMoney('1,200.50'), 120050, 'commas and cents');
    eq(TO.parseMoney('1,20,000'), 12000000, 'lakh commas');
    eq(TO.parseMoney('Rs 3,500'), 350000, 'with Rs');
    eq(TO.parseMoney('$45.5'), 4550, 'with $ and one decimal');
    eq(TO.parseMoney(''), null, 'blank');
    eq(TO.parseMoney('-5'), -1, 'negative marker');
    ok(isNaN(TO.parseMoney('12.345')), 'three decimals');
    ok(isNaN(TO.parseMoney('abc')), 'letters');
    eq(TO.checkMoney('-5', 'Advance paid').error, 'Advance paid cannot be below 0.', 'negative refused');
    eq(TO.checkMoney('999999999999', 'Stitching price').error, 'Stitching price is too large. Check the number.', 'huge refused');
    eq(TO.checkMoney('0', 'Stitching price').value, 0, 'zero allowed (free alteration)');
    eq(TO.money(120000, ''), '1,200', 'no symbol');
    eq(TO.money(120050, 'Rs'), 'Rs 1,200.50', 'with Rs and cents');
    eq(TO.money(-20000, '$'), '-$ 200', 'negative');
    eq(TO.money(5, ''), '0.05', 'five cents');

    // ---- orders and status ----
    function order(x) { return Object.assign({ id: Math.random().toString(36), personId: null, personName: 'Ali', item: 'Kurta', tailor: 'Master Tailor', pieces: 1, given: '2026-10-20', promised: '', price: null, payments: [], note: '', status: 'given', collected: '', fixes: [] }, x); }
    var a = order({ promised: '2026-10-29', price: 300000, payments: [{ id: 'x', date: '2026-10-20', cents: 180000 }], pieces: 2 });
    eq(TO.balanceOf(a), 120000, 'balance 3000 - 1800');
    eq(TO.statusOf(a, T).text, 'Ready Thu 29 Oct (in 2 days)', 'due in 2 days');
    eq(TO.orderLine(a, T, 'Rs'), 'Ali: Kurta (2 pieces) at Master Tailor, ready Thu 29 Oct (in 2 days), balance Rs 1,200', 'order line');
    var late = order({ personName: 'Ayesha', item: 'Suit (3 piece)', tailor: 'Style Boutique', promised: '2026-10-24', price: 450000, payments: [{ id: 'y', date: '2026-10-10', cents: 200000 }] });
    eq(TO.statusOf(late, T).text, '3 days late (promised Sat 24 Oct)', 'late');
    eq(TO.statusOf(order({ promised: T }), T).text, 'Ready today, Tue 27 Oct', 'due today is not late');
    eq(TO.statusOf(order({ status: 'ready', promised: '2026-10-01' }), T).key, 'ready', 'ready is never late');
    eq(TO.statusOf(order({}), T).text, 'No ready date', 'no date');
    eq(TO.moneyLine(order({ price: 100000, payments: [{ id: 'p', date: T, cents: 120000 }] }), ''), 'Price 1,000, paid 1,200 (200 more than the price)', 'overpaid');
    eq(TO.moneyLine(order({ price: 0 }), ''), 'No charge', 'free');
    eq(TO.moneyLine(order({ price: 150000 }), 'Rs'), 'Price Rs 1,500, nothing paid yet', 'nothing paid');
    eq(TO.moneyLine(order({ price: 50000, payments: [{ id: 'p', date: T, cents: 50000 }] }), ''), 'Price 500, fully paid', 'fully paid');
    eq(TO.moneyLine(order({ payments: [{ id: 'p', date: T, cents: 50000 }] }), ''), 'Paid 500, price not set', 'paid with no price');
    eq(TO.moneyLine(order({}), ''), '', 'nothing about money');
    eq(TO.orderLine(order({ personName: 'Sara', item: 'School uniform', tailor: 'Master Tailor' }), T, ''), 'Sara: School uniform at Master Tailor, no ready date, price not set', 'line with no date and no price');

    // odd cents add up exactly
    var odd = order({ price: 100001, payments: [{ id: 'a', date: T, cents: 33333 }, { id: 'b', date: T, cents: 33334 }] });
    eq(TO.balanceOf(odd), 33334, 'odd cents exact');

    var ready = order({ personName: 'Sara', item: 'Dress', tailor: 'Style Boutique', status: 'ready', promised: '2026-10-26', price: 150000 });
    var noDate = order({ personName: 'Abbu', item: 'Shalwar kameez', tailor: 'master tailor', price: 200000 });
    var later = order({ personName: 'Omar', item: 'Shirt', promised: '2026-11-20', price: 80000, payments: [{ id: 'z', date: T, cents: 80000 }] });
    var done = order({ personName: 'Omar', item: 'Trousers', status: 'collected', collected: '2026-10-22', price: 60000, payments: [{ id: 'q', date: T, cents: 60000 }] });
    var list = [a, late, ready, noDate, later, done];
    eq(TO.sortOpen(list, T).map(function (o) { return o.personName; }), ['Ayesha', 'Sara', 'Ali', 'Omar', 'Abbu'], 'late, ready, soon, later, no date');
    var s = TO.summary(list, T);
    eq([s.count, s.pieces, s.late, s.ready, s.week, s.toPay, s.noPrice], [5, 6, 1, 1, 1, 120000 + 250000 + 150000 + 200000, 0], 'summary numbers');
    eq(s.tailors.map(function (t) { return t.name + ' ' + t.orders + ' ' + t.toPay; }), ['Master Tailor 3 320000', 'Style Boutique 2 400000'], 'tailor names grouped ignoring case');
    eq(TO.summaryText(list, T, 'Rs'), [
        'At the tailor (Tue 27 Oct 2026)',
        '5 orders (6 pieces) at 2 tailors. Still to pay: Rs 7,200',
        '', 'LATE', '- Ayesha: Suit (3 piece) at Style Boutique, 3 days late (promised Sat 24 Oct), balance Rs 2,500',
        '', 'READY TO COLLECT', '- Sara: Dress at Style Boutique, ready to collect, balance Rs 1,500',
        '', 'COMING UP', '- Ali: Kurta (2 pieces) at Master Tailor, ready Thu 29 Oct (in 2 days), balance Rs 1,200', '- Omar: Shirt at Master Tailor, ready Fri 20 Nov (in 24 days), paid',
        '', 'NO READY DATE', '- Abbu: Shalwar kameez at master tailor, no ready date, balance Rs 2,000'].join('\n'), 'summary text');
    eq(TO.summaryText([done], T, ''), 'At the tailor (Tue 27 Oct 2026)\nNothing at the tailor right now.', 'empty summary');
    eq(TO.sortCollected(list).length, 1, 'collected list');

    eq(TO.orderText(a, ali, T, ''), 'Order for Ali: Kurta (2 pieces)\nTailor: Master Tailor\nGiven Tue 20 Oct 2026, ready by Thu 29 Oct 2026\nPrice 3,000, paid 1,800, balance 1,200\n\n' + TO.measureText(ali, T), 'order text with measurements');

    // ---- reading the form ----
    var r = TO.readOrder({ personName: '  Ali ', item: 'Kurta', tailor: 'Master Tailor', pieces: '', given: '', promised: '2026-11-03', price: '3,000', advance: '1000', note: '' }, T);
    eq(r.order, { personId: null, personName: 'Ali', item: 'Kurta', tailor: 'Master Tailor', pieces: 1, given: T, promised: '2026-11-03', price: 300000, advance: 100000, note: '' }, 'good order, blank pieces is 1, blank given is today');
    eq(Object.keys(TO.readOrder({}, T).errors).sort(), ['item', 'person', 'tailor'], 'blank form says what is missing');
    eq(TO.readOrder({ personName: 'A', item: 'B', tailor: 'C', given: '2026-10-27', promised: '2026-10-20' }, T).errors.promised, 'The ready date is before the day you gave it.', 'ready before given');
    eq(TO.readOrder({ personName: 'A', item: 'B', tailor: 'C', pieces: '0' }, T).errors.pieces, 'Pieces: a whole number from 1 to 50.', 'zero pieces');
    eq(TO.readOrder({ personName: 'A', item: 'B', tailor: 'C', pieces: '2.5' }, T).errors.pieces, 'Pieces: a whole number from 1 to 50.', 'half a piece');
    eq(TO.readOrder({ personName: 'A', item: 'B', tailor: 'C', advance: '-1' }, T).errors.advance, 'Advance paid cannot be below 0.', 'negative advance');
    eq(TO.readOrder({ personName: 'x'.repeat(200), item: 'B', tailor: 'C' }, T).order.personName.length, 60, 'very long name cut to 60');
    eq(TO.readOrder({ personName: 'A', item: 'B', tailor: 'C', note: 'n'.repeat(5000) }, T).order.note.length, 1000, 'very long note cut');

    // ---- saved data ----
    eq(TO.clean(null), { v: 1, people: [], orders: [] }, 'nothing saved');
    eq(TO.clean('garbage'), { v: 1, people: [], orders: [] }, 'garbage');
    var c = TO.clean({ people: [{ id: 'p1', name: 'Ali', sets: [{ unit: 'in', date: '2026-03-12', values: { chest: 34, waist: -3, hip: 'x', neck: 999 }, custom: [{ label: 'Collar', text: 'Ban' }, { label: '' }] }] }, { name: '' }, 7],
        orders: [{ id: 'o1', personId: 'p1', personName: 'Ali', item: 'Kurta', tailor: 'M', given: '2026-10-20', promised: '2026-10-01', price: -5, payments: [{ cents: 100, date: '2026-10-20' }, { cents: -1, date: '2026-10-20' }, { cents: 5, date: 'bad' }], status: 'weird', pieces: 99 },
                 { id: 'o2', personId: 'gone', personName: 'Sara', item: 'Dress', tailor: 'S', given: '2026-10-20', status: 'collected' }, { item: 'x' }] });
    eq(c.people.length, 1, 'person with no name dropped');
    eq(c.people[0].sets[0].values, { chest: 34 }, 'bad measurements dropped');
    eq(c.people[0].sets[0].custom, [{ label: 'Collar', text: 'Ban' }], 'custom row without a label dropped');
    eq(c.orders.length, 2, 'order with missing fields dropped');
    eq([c.orders[0].promised, c.orders[0].price, c.orders[0].payments.length, c.orders[0].status, c.orders[0].pieces], ['', null, 1, 'given', 1], 'bad order values made safe');
    eq([c.orders[1].personId, c.orders[1].collected], [null, '2026-10-20'], 'link to a deleted person dropped, collected date filled');
    var twice = TO.clean({ people: [{ id: 'a', name: 'X' }, { id: 'a', name: 'Y' }] });
    ok(twice.people[0].id !== twice.people[1].id, 'duplicate ids made unique');

    var out = pass + ' checks passed' + (fails.length ? ', ' + fails.length + ' FAILED:\n' + fails.join('\n') : '');
    if (typeof window !== 'undefined') window.TEST_RESULT = { pass: pass, fails: fails };
    if (typeof document !== 'undefined' && document.body) { var pre = document.createElement('pre'); pre.textContent = out; document.body.appendChild(pre); }
    if (typeof console !== 'undefined') console.log(out);
    if (fails.length && typeof process !== 'undefined' && process.exit) process.exit(1);
})();
