// Checks for core.js: run with `node tests.js`, or open test.html in a browser.
(function () {
    'use strict';
    const C = typeof require !== 'undefined' ? require('./core.js') : window.TFR;
    let pass = 0, fail = 0;
    const out = [];
    function eq(got, want, what) {
        const g = JSON.stringify(got), w = JSON.stringify(want);
        if (g === w) pass++; else { fail++; out.push('FAIL ' + what + '\n   got:  ' + g + '\n   want: ' + w); }
    }
    const L = 'en-GB', T = '2026-10-22', H = {};
    function stu(o) {
        const s = C.newStudent(o.id || 's1', o.start || '2026-10-01');
        Object.assign(s, { name: 'Ali', days: [1, 2, 3, 4], bill: 'month' }, o);
        s.fees = o.fees || [{ from: C.monthOf(s.start), c: 500000 }];
        return s;
    }
    const pay = (s, d, c, m, note) => s.entries.push({ id: 'p' + s.entries.length, k: 'pay', d, c, m: m || C.monthOf(d), note: note || '' });

    // ---------- the main situation: Ali, 5,000 a month, Mon to Thu, absent 6 and 20 Oct, nothing paid on 22 Oct ----------
    const ali = stu({ marks: { '2026-10-06': 'a', '2026-10-20': 'a' } });
    const a = C.monthFee(ali, '2026-10', H, T);
    eq([a.held, a.attended, a.later, a.fee, a.carry, a.toPay], [13, 11, 4, 500000, 0, 500000], 'Ali: 11 of 13 classes, 4 to come (26-29 Oct), owes 5,000');
    eq(C.attendText(a, L), 'Attended 11 of 13 classes: absent 6 Oct and 20 Oct.', 'Ali attendance words');
    eq(C.statusText(a, '', L), 'Still to pay: 5,000', 'Ali status');
    eq(C.isLate(ali, a, T, 10), true, 'Ali is late after the 10th');
    eq(C.isLate(ali, a, '2026-10-08', 10), false, 'not late on the 8th');
    eq(C.messageText(a, ali, 'Rs', L, 'Assalam o alaikum'), "Assalam o alaikum,\nThis is a reminder that Ali's tuition fee for October 2026 is Rs 5,000.\nClasses in October: attended 11 of 13 classes: absent 6 Oct and 20 Oct.\nThank you.", 'Ali reminder message');

    // Sara: part paid
    const sara = stu({ id: 's2', name: 'Sara', days: [1, 3, 5] });
    pay(sara, '2026-10-05', 300000);
    const sr = C.monthFee(sara, '2026-10', H, T);
    eq([sr.paid, sr.toPay, C.statusText(sr, '', L)], [300000, 200000, 'Still to pay: 2,000 (3,000 paid)'], 'Sara part paid');
    eq(C.messageText(sr, sara, '', L, ''), "Hello,\nThis is a reminder that Sara's tuition fee for October 2026 is 5,000, of which 3,000 has been received. Still to pay: 2,000.\n- Monthly fee: 5,000\n- Paid 5 Oct: −3,000\nClasses in October: attended 9 of 9 classes.\nThank you.", 'Sara message');
    // she pays the rest: receipt
    pay(sara, '2026-10-22', 200000);
    const sr2 = C.monthFee(sara, '2026-10', H, T);
    eq([sr2.toPay, C.statusText(sr2, '', L)], [0, 'October paid in full'], 'Sara paid in full');
    eq(C.messageText(sr2, sara, '', L, 'Dear parent,').split('\n').slice(0, 2), ['Dear parent,', "Thank you. Sara's tuition fee for October 2026 (5,000) has been received in full."], 'receipt message');

    // Omar: September paid, October unpaid; November carries the unpaid October
    const omar = stu({ id: 's3', name: 'Omar', start: '2026-09-01', days: [2, 4], fees: [{ from: '2026-09', c: 400000 }] });
    pay(omar, '2026-09-04', 400000, '2026-09');
    const o9 = C.monthFee(omar, '2026-09', H, T), o10 = C.monthFee(omar, '2026-10', H, T), o11 = C.monthFee(omar, '2026-11', H, T);
    eq([o9.toPay, o10.carry, o10.toPay, o11.carry, o11.toPay], [0, 0, 400000, 400000, 800000], 'Omar: unpaid October carries into November');
    eq(C.feeLines(o11, omar, '', L).map(l => l.t + ' ' + l.c), ['Monthly fee 400000', 'Unpaid from before 400000', 'Total for November 800000'], 'November lines');
    eq(C.isLate(omar, o9, T, 10), false, 'paid past month is not late');
    eq(C.isLate(omar, C.monthFee(omar, '2026-09', H, '2026-11-02'), '2026-11-02', 10), false, 'still not late later');
    // a payment for September that was short is late in October
    const omar2 = stu({ id: 's3b', name: 'Omar', start: '2026-09-01', days: [2, 4], fees: [{ from: '2026-09', c: 400000 }] });
    pay(omar2, '2026-09-04', 200000, '2026-09');
    const p9 = C.monthFee(omar2, '2026-09', H, T), p10 = C.monthFee(omar2, '2026-10', H, '2026-10-03');
    eq([p9.toPay, C.isLate(omar2, p9, T, 10), p10.carry, C.isLate(omar2, p10, '2026-10-03', 10)], [200000, true, 200000, true], 'unpaid from September is late at once');

    // Hina: per class 600, Mon and Wed, absent 14 Oct, an extra class on Sat 17 Oct
    const hina = stu({ id: 's4', name: 'Hina', days: [1, 3], bill: 'class', fees: [{ from: '2026-10', c: 60000 }], marks: { '2026-10-14': 'a', '2026-10-17': 'x' } });
    const h = C.monthFee(hina, '2026-10', H, T);
    eq([h.held, h.attended, h.n, h.fee, h.soFar, h.later], [7, 6, 6, 360000, true, 2], 'Hina: 6 classes x 600 = 3,600 so far');
    eq(C.feeLines(h, hina, '', L)[0].t, '6 classes × 600 so far', 'per class line');
    eq(C.isLate(hina, h, T, 10), false, 'per class fee is not late in its own month');
    eq(C.attendText(h, L), 'Attended 6 of 7 classes: absent 14 Oct; 1 extra class (17 Oct).', 'Hina attendance');
    const hm = Object.assign({}, hina, { missed: true });
    eq([C.monthFee(hm, '2026-10', H, T).fee, C.feeLines(C.monthFee(hm, '2026-10', H, T), hm, '', L)[0].t], [420000, '7 classes (1 missed, charged) × 600 so far'], 'charge missed classes too');
    eq(C.monthFee(hina, '2026-10', H, '2026-10-31').fee, 480000, 'Hina at month end: Mon/Wed 5,7,12,19,21,26,28 + Sat 17 = 8 classes x 600');
    eq(C.monthFee(hina, '2026-11', H, T).fee, 0, 'per class: nothing for a month still to come');
    eq(C.statusText(C.monthFee(hina, '2026-11', H, T), '', L), 'Still to pay: 3,600', 'per class: October so far carries into November');
    const hp = stu({ id: 's4b', days: [1, 3], bill: 'class', fees: [{ from: '2026-11', c: 60000 }], start: '2026-11-01' });
    eq(C.statusText(C.monthFee(hp, '2026-11', H, T), '', L), 'No classes to pay for yet in November', 'per class future status');

    // Bilal: joins 15 Oct, Mon to Fri, 6,000 a month, part-month fee; pays 3,300 so 27.27 comes off November
    const bilal = stu({ id: 's5', name: 'Bilal', start: '2026-10-15', days: [1, 2, 3, 4, 5], part: 'part', fees: [{ from: '2026-10', c: 600000 }] });
    pay(bilal, '2026-10-16', 330000);
    const b = C.monthFee(bilal, '2026-10', H, T);
    eq([b.partial, b.fee, b.toPay, C.statusText(b, '', L)], [{ R: 12, T: 22 }, 327273, -2727, 'Paid 27.27 extra. It comes off the next fee.'], 'Bilal part month 6,000 x 12/22 = 3,272.73');
    eq(C.feeLines(b, bilal, '', L)[0].t, 'Fee for 12 of 22 class days (monthly fee 6,000)', 'part month words');
    const b11 = C.monthFee(bilal, '2026-11', H, T);
    eq([b11.carry, b11.toPay], [-2727, 597273], 'November less the 27.27 paid extra');
    eq(C.feeLines(b11, bilal, '', L).map(l => l.t), ['Monthly fee', 'Paid extra before', 'Total for November'], 'credit line');
    const bf = Object.assign({}, bilal, { part: 'full' });
    eq(C.monthFee(bf, '2026-10', H, T).fee, 600000, 'full month fee when chosen');
    // leaving part way
    const left = stu({ id: 's6', name: 'Left', start: '2026-09-01', stop: '2026-10-09', part: 'part', fees: [{ from: '2026-09', c: 500000 }] });
    const lf = C.monthFee(left, '2026-10', H, T);
    eq([lf.partial, lf.fee], [{ R: 5, T: 17 }, 147059], 'left on 9 Oct: Mon-Thu 1,5,6,7,8 = 5 of 17 days, 5,000 x 5/17 = 1,470.59');
    eq([C.monthFee(left, '2026-11', H, T).active, C.monthFee(left, '2026-11', H, T).fee, C.monthFee(left, '2026-11', H, T).carry], [false, 0, 500000 + 147059], 'after leaving: no new fee, the unpaid stays');

    // Zara: sister discount 1,000 in October, pays 4,000 -> paid in full
    const zara = stu({ id: 's7', name: 'Zara' });
    zara.entries.push({ id: 'd1', k: 'disc', d: '2026-10-01', c: 100000, m: '2026-10', note: 'sister discount' });
    pay(zara, '2026-10-02', 400000);
    const z = C.monthFee(zara, '2026-10', H, T);
    eq([z.charge, z.toPay], [400000, 0], 'Zara discount');
    eq(C.feeLines(z, zara, '', L).map(l => [l.t, l.c]), [['Monthly fee', 500000], ['Discount: sister discount', -100000], ['Total for October', 400000], ['Paid 2 Oct', -400000]], 'Zara lines');
    // extra charge for books
    zara.entries.push({ id: 'x1', k: 'add', d: '2026-10-03', c: 75050, m: '2026-10', note: 'books' });
    eq(C.monthFee(zara, '2026-10', H, T).toPay, 75050, 'extra charge 750.50 for books');

    // holidays: a holiday for everyone is not a class; an extra class on a holiday counts
    const hol = { '2026-10-07': 1, '2026-10-08': 1 };
    const ah = C.monthFee(ali, '2026-10', hol, T);
    eq([ah.held, ah.attended, ah.hol], [11, 9, ['2026-10-07', '2026-10-08']], 'holidays not counted as classes');
    const hh = C.monthFee(hina, '2026-10', hol, T);
    eq([hh.held, hh.fee], [6, 300000], 'per class: no fee for a holiday (7 Oct)');
    const ax = stu({ marks: { '2026-10-07': 'x' } });
    eq(C.monthFee(ax, '2026-10', hol, T).attended, 13 - 1, 'class held on a holiday counts (8 Oct holiday)');
    // no class for one student
    const ac = stu({ marks: { '2026-10-05': 'c' } });
    eq([C.monthFee(ac, '2026-10', H, T).held, C.monthFee(ac, '2026-10', H, T).none], [12, ['2026-10-05']], 'no class that day for this student');

    // no fixed days: every class added by hand
    const free = stu({ id: 's8', days: [], bill: 'class', fees: [{ from: '2026-10', c: 100000 }], marks: { '2026-10-03': 'x', '2026-10-10': 'x', '2026-10-30': 'x' } });
    const fr = C.monthFee(free, '2026-10', H, T);
    eq([fr.held, fr.later, fr.fee], [2, 1, 200000], 'no fixed days, two classes so far');
    eq(C.countDays(Object.assign({}, free, { days: [] }), '2026-10-15', '2026-10-31'), 17, 'no fixed days part month counts calendar days');

    // fee change from November keeps October
    const fc = stu({ fees: [{ from: '2026-10', c: 500000 }, { from: '2026-11', c: 550000 }] });
    eq([C.feeFor(fc, '2026-10'), C.feeFor(fc, '2026-11'), C.feeFor(fc, '2027-03')], [500000, 550000, 550000], 'fee change');
    // advance payment for November shows in November, not in October
    const adv = stu({});
    pay(adv, '2026-10-22', 500000, '2026-10'); pay(adv, '2026-10-22', 500000, '2026-11');
    const ad10 = C.monthFee(adv, '2026-10', H, T), ad11 = C.monthFee(adv, '2026-11', H, T);
    eq([ad10.toPay, ad10.ahead.length, ad11.carry, ad11.toPay], [0, 1, 0, 0], 'advance for November');
    // opening balance from before
    const op = stu({ open: 250000 });
    eq(C.monthFee(op, '2026-10', H, T).toPay, 750000, 'unpaid from before the app');
    // month before the start
    const pre = C.monthFee(ali, '2026-09', H, T);
    eq([pre.started, pre.active, pre.busy, C.statusText(pre, '', L)], [false, false, false, 'Nothing to pay for September'], 'before they started');
    // a long run of months (no drift)
    const longS = stu({ start: '2024-01-01', fees: [{ from: '2024-01', c: 333333 }] });
    for (let m = '2024-01'; m <= '2026-09'; m = C.addMonth(m, 1)) pay(longS, m + '-05', 333333, m);
    eq(C.monthFee(longS, '2026-10', H, T).toPay, 333333, '33 months paid, October owed exactly');

    // the month summary
    const st = { v: 1, cur: '', due: 10, greet: '', hol: {}, students: [ali, C.cleanStudent(JSON.parse(JSON.stringify(sara))), omar, hina, bilal] };
    st.students[1].entries.pop(); // Sara back to 3,000 paid
    const sm = C.summary(st, '2026-10', T);
    eq([sm.list.length, sm.owe.map(x => x.s.name), sm.charged, sm.paid, sm.toCollect, sm.received], [5, ['Ali', 'Sara', 'Omar', 'Hina'], 500000 + 500000 + 400000 + 360000 + 327273, 300000 + 330000, 500000 + 200000 + 400000 + 360000, 630000], 'October summary');
    eq(C.unpaidText(sm.list, '2026-10', '', L), 'Fees not paid yet for October 2026 (4):\n- Ali: 5,000\n- Sara: 2,000 (3,000 paid)\n- Omar: 4,000\n- Hina: 3,600\nTotal still to collect: 14,600', 'unpaid list');
    eq(C.unpaidText([], '2026-10', '', L), 'All fees for October 2026 are paid.', 'nobody owes');
    eq(C.classOn(st, '2026-10-22', T).map(s => s.name), ['Ali', 'Omar', 'Bilal'], 'Thursday class list');
    eq(C.classOn(st, '2026-10-17', T).map(s => s.name), ['Hina'], 'Saturday extra class only');

    // typed amounts
    eq([C.parseAmount('5,000').cents, C.parseAmount('1,00,000').cents, C.parseAmount('Rs 600').cents, C.parseAmount('12.5').cents], [500000, 10000000, 60000, 1250], 'amounts');
    eq([!!C.parseAmount('').error, !!C.parseAmount('-5').error, !!C.parseAmount('0').error, !!C.parseAmount('abc').error, !!C.parseAmount('99999999999').error], [true, true, true, true, true], 'bad amounts');

    // saved data is checked
    eq(C.cleanState(null), null, 'null state');
    eq(C.cleanState({ students: 'x' }), null, 'bad students');
    const cs = C.cleanState({ cur: 'XX', due: 99, hol: { 'bad': 1, '2026-10-07': 1 }, students: [
        { id: 'a', name: 'Ok', start: '2026-10-01', days: [1, 1, 9, 3], bill: 'week', fees: [{ from: '2026-10', c: 500000 }, { from: 'x', c: 1 }], marks: { '2026-10-05': 'a', '2026-10-06': 'z', 'no': 'a' },
            entries: [{ k: 'pay', d: '2026-10-02', c: 100, m: '2025-01' }, { k: 'pay', d: '2026-10-02', c: -5 }, { k: 'zz', d: '2026-10-02', c: 5 }] },
        { id: 'a', name: 'Dup', start: '2026-10-01', fees: [{ from: '2026-10', c: 1 }] },
        { name: '', start: '2026-10-01', fees: [{ from: '2026-10', c: 1 }] },
        { name: 'No fee', start: '2026-10-01', fees: [] },
        { name: 'Bad date', start: '2026-02-30', fees: [{ from: '2026-10', c: 1 }] }] });
    eq([cs.cur, cs.due, Object.keys(cs.hol), cs.students.length, cs.students[0].days, cs.students[0].bill, cs.students[0].fees.length, cs.students[0].marks, cs.students[0].entries.map(e => e.m)],
        ['', 10, ['2026-10-07'], 1, [1, 3], 'month', 1, { '2026-10-05': 'a' }, ['2026-10']], 'clean state');
    const round = C.cleanState(JSON.parse(JSON.stringify(st)));
    eq(C.summary(round, '2026-10', T).toCollect, sm.toCollect, 'backup round trip');

    const result = (fail ? fail + ' FAILED, ' : 'ALL PASSED, ') + pass + ' checks';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.concat(result).join('\n');
    else { out.forEach(x => console.log(x)); console.log(result); if (fail) process.exitCode = 1; }
})();
