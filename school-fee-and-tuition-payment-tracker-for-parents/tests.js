// Logic checks for core.js, with answers worked out by hand. Run: node tests.js  (or open test.html)
(function () {
    const C = typeof module === 'object' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.FeeCore;
    let pass = 0; const fails = [];
    const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(name + ': got ' + g + ', want ' + w); };
    const T = '2026-10-21';   // a Wednesday
    const P = (id, d, amt, note) => ({ id, d, amt: Math.round(amt * 100), note: note || '', photo: '' });
    const F = (id, name, amt, every, due, start, payments, extra) => Object.assign({ id, name, amts: [{ from: start, amt: Math.round(amt * 100) }], every, due, start, end: '', skip: [], payments }, extra || {});
    // the family from the README
    const aliSchool = () => F(2, 'School fee', 8000, 1, 10, '2026-08', [P(3, '2026-08-10', 8000), P(4, '2026-09-09', 8000), P(5, '2026-10-12', 4000)], { skip: [6, 7] });
    const aliVan = () => F(6, 'Van fee', 3500, 1, 25, '2026-08', [P(7, '2026-08-25', 3500), P(8, '2026-09-24', 3500)], { skip: [6, 7] });
    const saraTuition = () => F(10, 'Academy tuition', 6000, 3, 1, '2026-09', [P(11, '2026-09-01', 6000)]);
    const saraSchool = () => F(12, 'School fee', 7200, 1, 10, '2026-08', [P(13, '2026-08-08', 14400), P(14, '2026-10-10', 7200)]);
    const saraAnnual = () => F(15, 'Annual charges', 15000, 12, 15, '2026-08', [P(16, '2026-08-14', 15000)]);
    const family = () => ({ v: 1, cur: '', style: 'sa', nextId: 20, children: [
        { id: 1, name: 'Ali', school: 'City School', fees: [aliSchool(), aliVan()] },
        { id: 9, name: 'Sara', school: '', fees: [saraTuition(), saraSchool(), saraAnnual()] }] });

    // dates and money
    eq('due day 31 in February', C.dueDateOf('2026-02', 31), '2026-02-28');
    eq('due day 31 in a leap February', C.dueDateOf('2028-02', 31), '2028-02-29');
    eq('due day 31 in April', C.dueDateOf('2026-04', 31), '2026-04-30');
    eq('addMonths over the year', C.addMonths('2026-11', 3), '2027-02');
    eq('fmtDate', C.fmtDate('2026-10-25'), 'Sun 25 Oct');
    eq('readMoney commas', C.readMoney('1,25,000'), 12500000);
    eq('readMoney cents', C.readMoney('3500.5'), 350050);
    eq('readMoney negative refused', Number.isNaN(C.readMoney('-5')), true);
    eq('readMoney blank refused', Number.isNaN(C.readMoney('  ')), true);
    eq('readMoney 3 decimals refused', Number.isNaN(C.readMoney('1.005')), true);
    eq('readMoney letters refused', Number.isNaN(C.readMoney('8k')), true);
    eq('fmtMoney lakh', C.fmtMoney(12500000, 'Rs', 'sa'), 'Rs 1,25,000');
    eq('fmtMoney million', C.fmtMoney(12500000, '$', 'intl'), '$125,000');
    eq('fmtMoney odd cents', C.fmtMoney(350005, '', 'intl'), '3,500.05');
    eq('fmtMoney zero', C.fmtMoney(0, '£', 'intl'), '£0');

    // Ali's school fee: 8,000 a month due on the 10th, 4,000 paid of October
    let lg = C.ledger(aliSchool(), T);
    eq('Ali school owes', lg.owed, 400000);
    eq('Ali school late days (10 to 21 Oct)', lg.lateDays, 11);
    eq('Ali school first unpaid', lg.firstUnpaid.label, 'October 2026');
    eq('Ali school paid up to', lg.upTo.last, '2026-09');
    eq('Ali school next', [lg.next.label, lg.next.due, lg.next.left], ['November 2026', '2026-11-10', 800000]);
    // on the due day itself it is "due today", not late
    lg = C.ledger(aliSchool(), '2026-10-10');
    eq('due on the day: 0 days late', [lg.owed, lg.lateDays], [400000, 0]);
    lg = C.ledger(aliSchool(), '2026-10-09');
    eq('the day before: nothing owed yet', lg.owed, 0);

    // Ali's van fee: due on the 25th, so October is due in 4 days
    lg = C.ledger(aliVan(), T);
    eq('Ali van owes nothing', lg.owed, 0);
    eq('Ali van paid up to September', lg.upTo.last, '2026-09');
    eq('Ali van next Sun 25 Oct', [lg.next.due, lg.next.left], ['2026-10-25', 350000]);

    // Sara's tuition every 3 months: Sep to Nov paid, next Dec to Feb on 1 Dec
    lg = C.ledger(saraTuition(), T);
    eq('Sara tuition paid up to November', lg.upTo.last, '2026-11');
    eq('Sara tuition label', lg.upTo.label, 'Sep 2026 to Nov 2026');
    eq('Sara tuition next', [lg.next.label, lg.next.due], ['Dec 2026 to Feb 2027', '2026-12-01']);
    eq('Sara tuition nothing ahead (Sep period is due)', lg.ahead, 0);
    // Sara's school fee: two months paid at once in August
    lg = C.ledger(saraSchool(), T);
    eq('Sara school paid up to October', [lg.upTo.last, lg.owed], ['2026-10', 0]);
    // annual charges once a year
    lg = C.ledger(saraAnnual(), T);
    eq('annual paid up to July 2027', [lg.upTo.last, lg.next.due], ['2027-07', '2027-08-15']);

    // the family view
    const fam = C.familySummary(family(), T);
    eq('late list', fam.late.map(x => [x.child.name, x.fee.name, x.owed, x.late]), [['Ali', 'School fee', 400000, 11]]);
    eq('due in the next 7 days', fam.soon.map(x => [x.child.name, x.fee.name, x.amt, x.days]), [['Ali', 'Van fee', 350000, 4]]);
    eq('left to pay in October', fam.monthLeft, 750000);
    eq('owed now', fam.owed, 400000);

    // a year for Ali: 5 months of 8,000 and 3,500
    const ys = C.yearSummary(family().children[0], 2026, T);
    eq('Ali 2026 totals', [ys.total, ys.paid, ys.owed, ys.toCome], [5750000, 2700000, 400000, 2650000]);
    eq('Ali 2026 received', ys.received, 2700000);
    eq('Ali 2025 empty', C.yearSummary(family().children[0], 2025, T).fees.length, 0);
    const ys27 = C.yearSummary(family().children[0], 2027, T);
    eq('Ali 2027: 10 months each (no fee in June, July)', ys27.total, 10 * 800000 + 10 * 350000);

    // holiday months: van fee not charged in June and July
    const van = F(30, 'Van', 3000, 1, 5, '2027-05', [P(31, '2027-05-05', 3000)], { skip: [6, 7] });
    lg = C.ledger(van, '2027-08-10');
    eq('holidays skipped: owes only August', [lg.owed, lg.firstUnpaid.label, lg.lateDays], [300000, 'August 2027', 5]);
    eq('holidays: paid up to May', lg.upTo.last, '2027-05');
    eq('holiday rows have no fee', lg.rows.filter(r => r.skip).map(r => [r.ym, r.amt]), [['2027-06', 0], ['2027-07', 0]]);
    // one payment for the 2 months around a holiday
    van.payments.push(P(32, '2027-08-05', 6000));
    lg = C.ledger(van, '2027-08-10');
    eq('payment jumps the holiday', [lg.owed, lg.upTo.last, lg.next.label], [0, '2027-09', 'October 2027']);

    // fee rises from a month
    const rise = F(40, 'School fee', 8000, 1, 10, '2026-08', [P(41, '2026-08-10', 8000), P(42, '2026-09-10', 8000), P(43, '2026-10-10', 8000)]);
    C.setAmount(rise, '2026-10', 900000);
    lg = C.ledger(rise, T);
    eq('rise: October is 9,000, owes 1,000', [lg.owed, lg.firstUnpaid.label], [100000, 'October 2026']);
    eq('rise: amount before and after', [C.amountFor(rise, '2026-09'), C.amountFor(rise, '2026-12')], [800000, 900000]);
    eq('change: must be after the first month', C.checkChange(rise, '2026-08', 900000) !== '', true);
    eq('change: zero refused', C.checkChange(rise, '2026-11', 0) !== '', true);
    eq('change: ok', C.checkChange(rise, '2026-11', 950000), '');

    // a fee only once (admission), not paid, and paid with extra
    const adm = F(50, 'Admission fee', 25000, 0, 1, '2026-08', []);
    lg = C.ledger(adm, T);
    eq('once: owes all, late since 1 Aug', [lg.owed, lg.lateDays, lg.rows.length], [2500000, 81, 1]);
    adm.payments.push(P(51, '2026-08-02', 26000));
    lg = C.ledger(adm, T);
    eq('once: paid with 1,000 extra', [lg.owed, lg.over, lg.next], [0, 100000, null]);

    // stopped fee: van stopped after September, nothing owed later
    const stop = F(60, 'Van fee', 3500, 1, 5, '2026-08', [P(61, '2026-08-05', 3500), P(62, '2026-09-05', 3500)], { end: '2026-09' });
    lg = C.ledger(stop, T);
    eq('stopped: nothing owed, no next', [lg.owed, lg.next, lg.stopped], [0, null, true]);
    eq('stop check before start', C.checkStop(stop, '2026-07') !== '', true);

    // a fee that starts next month
    lg = C.ledger(F(70, 'Tuition', 5000, 1, 1, '2026-11', []), T);
    eq('not started', [lg.notStarted, lg.owed, lg.next.due], [true, 0, '2026-11-01']);

    // paid far ahead
    const far = F(80, 'School fee', 1000, 1, 1, '2026-10', [P(81, '2026-10-01', 12000)]);
    lg = C.ledger(far, T);
    eq('paid a year ahead', [lg.upTo.last, lg.ahead, lg.next.label], ['2027-09', 1100000, 'October 2027']);

    // odd cents part payments
    const odd = F(90, 'Lunch', 33.33, 1, 1, '2026-09', [P(91, '2026-09-01', 33.33), P(92, '2026-10-01', 10.01)]);
    lg = C.ledger(odd, T);
    eq('odd cents owed', lg.owed, 2332);

    // what each payment paid for
    const cv = C.coverage(aliSchool(), T);
    eq('coverage: part of October', C.coverText(cv[5], '', 'intl'), 'part of October 2026 (4,000 of 8,000)');
    const cv2 = C.coverage(saraSchool(), T);
    eq('coverage: two months at once', C.coverText(cv2[13], '', 'intl'), 'August 2026, September 2026 (2 in all)');
    const v2 = F(30, 'Van', 3000, 1, 5, '2027-05', [P(31, '2027-05-05', 3000), P(32, '2027-08-05', 6000)], { skip: [6, 7] });
    eq('coverage skips holidays', C.coverText(C.coverage(v2, '2027-08-10')[32], '', 'intl'), 'August 2027, September 2027 (2 in all)');

    // checks
    const ok = { child: 'Ali', name: 'School fee', amt: 800000, every: 1, due: 10, start: '2026-08' };
    eq('fee ok', C.checkFee(ok, T), {});
    eq('fee blank', Object.keys(C.checkFee({ child: '', name: '', amt: NaN, every: 5, due: 0, start: '' }, T)).sort(), ['amt', 'child', 'due', 'every', 'name', 'start']);
    eq('fee existing child needs no name', C.checkFee(Object.assign({}, ok, { child: '', newChild: false }), T), {});
    eq('fee zero', Object.keys(C.checkFee(Object.assign({}, ok, { amt: 0 }), T)), ['amt']);
    eq('fee huge', Object.keys(C.checkFee(Object.assign({}, ok, { amt: C.LIMITS.maxCents + 1 }), T)), ['amt']);
    eq('fee start 2 years ahead', Object.keys(C.checkFee(Object.assign({}, ok, { start: '2028-10' }), T)), ['start']);
    eq('payment in the future', Object.keys(C.checkPayment(aliSchool(), { d: '2026-10-22', amt: 100 }, T)), ['d']);
    eq('payment zero', Object.keys(C.checkPayment(aliSchool(), { d: T, amt: 0 }, T)), ['amt']);
    eq('payment ok', C.checkPayment(aliSchool(), { d: T, amt: 100 }, T), {});
    eq('payment years before', Object.keys(C.checkPayment(aliSchool(), { d: '2024-01-01', amt: 100 }, T)), ['d']);

    // text
    const sum = C.summaryText(family(), T);
    eq('summary has Ali owes', sum.includes('School fee (8,000 every month): paid up to September 2026, owes 4,000 (11 days late)'), true);
    eq('summary owed line', sum.split('\n').pop(), 'Owed now: 4,000');
    const st = C.statementText(family().children[0], 2026, T, 'Rs', 'sa');
    eq('statement October line', st.includes('October 2026: fee Rs 8,000, paid Rs 4,000, owed Rs 4,000'), true);
    eq('statement November line', st.includes('November 2026: fee Rs 8,000, paid Rs 0, not due yet'), true);
    eq('statement totals', st.includes('Fees for 2026: Rs 57,500') && st.includes('Owed now: Rs 4,000'), true);

    // saved state
    const v = C.validate(JSON.parse(JSON.stringify(family())));
    eq('validate round trip', JSON.stringify(v.children), JSON.stringify(family().children));
    eq('validate nextId', v.nextId, 20);
    eq('validate junk', C.validate('x'), null);
    eq('validate wrong version', C.validate({ v: 2, children: [] }), null);
    const bad = family(); bad.children[0].fees[0].payments[0].amt = -5;
    eq('validate negative payment', C.validate(bad), null);
    const dup = family(); dup.children[1].id = 1;
    eq('validate duplicate id', C.validate(dup), null);
    const badEvery = family(); badEvery.children[0].fees[0].every = 5;
    eq('validate bad every', C.validate(badEvery), null);
    const strEvery = family(); strEvery.children[0].fees[0].every = '1';
    eq('validate string every', C.validate(strEvery), null);
    const allSkip = family(); allSkip.children[0].fees[0].skip = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    eq('validate all months skipped is cleared', C.validate(allSkip).children[0].fees[0].skip, []);
    const badCur = family(); badCur.cur = '<b>';
    eq('validate bad currency', C.validate(badCur).cur, '');
    const longName = family(); longName.children[0].name = 'x'.repeat(500) + '\n';
    eq('validate long name trimmed', C.validate(longName).children[0].name.length, C.LIMITS.name);
    const badPhoto = family(); badPhoto.children[0].fees[0].payments[0].photo = 'javascript:alert(1)';
    eq('validate bad photo id dropped', C.validate(badPhoto).children[0].fees[0].payments[0].photo, '');
    const ph = family(); ph.children[0].fees[0].payments[0].photo = 'ph25';
    eq('photo ids', [...C.photoIds(C.validate(ph))], ['ph25']);

    const out = 'School fee logic: ' + pass + ' passed, ' + fails.length + ' failed' + (fails.length ? '\n' + fails.join('\n') : '');
    if (typeof document !== 'undefined') { const p = document.createElement('pre'); p.textContent = out; document.body.appendChild(p); } else { console.log(out); if (fails.length) process.exit(1); }
})();
