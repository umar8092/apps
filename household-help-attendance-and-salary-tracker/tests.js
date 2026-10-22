// Checks for core.js: run with `node tests.js`, or open test.html in a browser.
(function () {
    'use strict';
    const C = typeof require !== 'undefined' ? require('./core.js') : window.HHS;
    let pass = 0, fail = 0;
    const out = [];
    function eq(got, want, what) {
        const g = JSON.stringify(got), w = JSON.stringify(want);
        if (g === w) pass++; else { fail++; out.push('FAIL ' + what + '\n   got:  ' + g + '\n   want: ' + w); }
    }
    const L = 'en-GB';
    function worker(o) {
        const w = C.newWorker('w1', o.start || '2026-09-01');
        Object.assign(w, { name: 'Rubina', role: 'Maid', off: [0], leave: 2, rule: 'thirty' }, o);
        w.pays = o.pays || [{ from: C.monthOf(w.start), c: 3000000 }];
        return w;
    }
    const mark = (w, days, k) => days.forEach(d => { w.marks[d] = { k }; });

    // ---------- the main situation: Rubina, 30,000 a month, Sundays off, 2 paid leave days a month ----------
    const r1 = worker({});
    mark(r1, ['2026-10-05', '2026-10-06', '2026-10-19', '2026-10-20'], 'a');
    mark(r1, ['2026-10-27'], 'h');
    mark(r1, ['2026-10-11'], 'x');
    r1.entries.push({ id: 'a1', k: 'adv', d: '2026-10-12', c: 500000, note: '', n: 1, from: '2026-10' });
    r1.entries.push({ id: 'p1', k: 'paid', d: '2026-10-01', c: 3000000, note: '', m: '2026-09' });
    const sep = C.monthPay(r1, '2026-09');
    eq([sep.net, sep.paid, sep.toPay], [3000000, 3000000, 0], 'September: full pay, paid on 1 Oct');
    const oct = C.monthPay(r1, '2026-10');
    eq([oct.base, oct.leaveUsed, oct.unpaidH, oct.ded, oct.extraPay, oct.adv, oct.net, oct.toPay], [3000000, 4, 5, 250000, 100000, 500000, 2350000, 2350000], 'October: 30,000 - 2.5 unpaid + 1 extra - 5,000 advance = 23,500');
    eq([oct.a.worked, oct.a.absent.length, oct.a.half.length, oct.a.extra.length, oct.a.off], [22, 4, 1, 1, 3], 'October attendance counts');
    eq(C.slipText(oct, r1, '', L, '2026-10-31'), [
        'Rubina (Maid): pay for October 2026',
        'Attendance: 22 days worked, 1 half day, 4 days absent, 1 extra day, 3 weekly days off',
        'Monthly pay: 30,000',
        'Paid leave: 2 days (5 Oct and 6 Oct), nothing taken off',
        'Unpaid days off: 2½ days (19 Oct, 20 Oct and 27 Oct (half)) at 1,000 a day: −2,500',
        'Worked on a day off: 1 day (11 Oct) at 1,000 a day: 1,000',
        'Advance of 5,000 given 12 Oct: −5,000',
        'Pay for October: 23,500',
        'To pay: 23,500'].join('\n'), 'October slip text');
    eq(C.attendText(oct, r1, '2026-10-22'), '22 days worked, 1 half day, 4 days absent, 1 extra day, 3 weekly days off (days still to come are counted as worked)', 'current month says future days count as worked');

    // ---------- the three ways of working out one day's pay ----------
    const r2 = JSON.parse(JSON.stringify(r1)); r2.rule = 'month';
    const o2 = C.monthPay(r2, '2026-10');
    eq([o2.D, o2.ded, o2.extraPay], [31, 241935, 96774], '÷ days in the month: 2.5 × 30,000/31 = 2,419.35, one day 967.74');
    eq(C.slipLines(o2, r2, '', L)[2].t, 'Unpaid days off: 2½ days (19 Oct, 20 Oct and 27 Oct (half)) at 30,000 ÷ 31 a day', 'uneven day pay shows the division');
    const r3 = JSON.parse(JSON.stringify(r1)); r3.rule = 'work';
    const o3 = C.monthPay(r3, '2026-10');
    eq([o3.D, o3.ded, o3.extraPay], [27, 277778, 111111], '÷ working days: 27 in Oct with Sundays off; 2,777.78 and 1,111.11');

    // ---------- joined or left part way through a month ----------
    const j = worker({ start: '2026-10-15', rule: 'month' });
    eq(C.monthPay(j, '2026-10').base, 1645161, 'joined 15 Oct, ÷31: 17 of 31 days = 16,451.61');
    j.rule = 'thirty';
    eq(C.monthPay(j, '2026-10').base, 1700000, 'joined 15 Oct, ÷30: 17 of 30 days = 17,000');
    j.rule = 'work';
    eq([C.monthPay(j, '2026-10').counted, C.monthPay(j, '2026-10').base], [15, 1666667], 'joined 15 Oct, working days: 15 of 27 = 16,666.67');
    eq(C.slipLines(C.monthPay(j, '2026-10'), j, '', L)[0].t, 'Monthly pay 30,000 for 15 of 27 working days (15 Oct to 31 Oct)', 'part month line');
    const lv = worker({ stop: '2026-10-10' });
    eq([C.monthPay(lv, '2026-10').base, C.monthPay(lv, '2026-11').employed, C.monthPay(lv, '2026-11').base], [1000000, false, 0], 'left on 10 Oct: 10 of 30 days; nothing in November');
    const lv2 = worker({ start: '2026-10-02' });
    eq(C.monthPay(lv2, '2026-10').base, 3000000, '÷30 rule: 30 days from 2 Oct is the full pay');
    eq(C.monthPay(worker({ start: '2026-10-15' }), '2026-09').employed, false, 'month before joining is empty');

    // ---------- leave ----------
    const c1 = worker({ leave: 1, carry: true });
    mark(c1, ['2026-10-05', '2026-10-06', '2026-10-07'], 'a');
    const co = C.monthPay(c1, '2026-10');
    eq([co.carriedIn, co.leaveAvail, co.leaveUsed, co.unpaidH, co.ded], [2, 4, 4, 2, 100000], 'unused September leave carried: 2 paid, 1 unpaid');
    c1.carry = false;
    eq(C.monthPay(c1, '2026-10').ded, 200000, 'no carry: 1 paid, 2 unpaid');
    const hl = worker({ leave: 1 });
    mark(hl, ['2026-10-05'], 'h'); mark(hl, ['2026-10-06'], 'a');
    const ho = C.monthPay(hl, '2026-10');
    eq([ho.paidLeave, ho.unpaid, ho.ded], [[{ d: '2026-10-05', h: 1, of: 1 }, { d: '2026-10-06', h: 1, of: 2 }], [{ d: '2026-10-06', h: 1, of: 2 }], 50000], 'half a leave day left covers half of the next full day off');
    const ph = worker({ leave: 0 });
    mark(ph, ['2026-10-02'], 'p');
    eq([C.monthPay(ph, '2026-10').ded, C.monthPay(ph, '2026-10').net], [0, 3000000], 'paid holiday takes nothing off');
    const offAbs = worker({ leave: 0 });
    mark(offAbs, ['2026-10-04'], 'a');
    eq(C.monthPay(offAbs, '2026-10').ded, 0, 'a day off marked absent is still just a day off');

    // ---------- extremes ----------
    const all = worker({ off: [], leave: 0, start: '2026-09-01' });
    for (let d = '2026-10-01'; d <= '2026-10-31'; d = C.addDays(d, 1)) all.marks[d] = { k: 'a' };
    eq(C.monthPay(all, '2026-10').net, 0, 'absent all 31 days on ÷30: nothing to pay, never negative');
    const feb = worker({ off: [], leave: 0, start: '2027-01-01' });
    for (let d = '2027-02-01'; d <= '2027-02-28'; d = C.addDays(d, 1)) feb.marks[d] = { k: 'a' };
    eq(C.monthPay(feb, '2027-02').net, 200000, '÷30 rule in February: 28 absent days take 28,000 off');
    eq(C.divisor(worker({ rule: 'month' }), '2027-02'), 28, 'February has 28 days');
    eq(C.divisor(worker({ rule: 'month' }), '2028-02'), 29, 'leap February has 29');

    // ---------- money: advances, bonuses, payments ----------
    const ad = worker({ off: [], leave: 0 });
    ad.entries.push({ id: 'x', k: 'adv', d: '2026-10-12', c: 1000000, note: '', n: 3, from: '2026-10' });
    eq([C.monthPay(ad, '2026-10').adv, C.monthPay(ad, '2026-11').adv, C.monthPay(ad, '2026-12').adv, C.monthPay(ad, '2027-01').adv], [333334, 333333, 333333, 0], '10,000 over 3 months adds up exactly');
    eq(C.slipLines(C.monthPay(ad, '2026-11'), ad, '', L).find(l => l.id === 'x').t, 'Advance of 10,000 given 12 Oct, part 2 of 3, 3,333.33 still to take back', 'advance part line');
    eq(C.slipLines(C.monthPay(ad, '2026-12'), ad, '', L).find(l => l.id === 'x').t, 'Advance of 10,000 given 12 Oct, part 3 of 3, all taken back', 'last part line');
    const late = worker({ start: '2026-10-01', off: [], leave: 0 });
    late.entries.push({ id: 'l', k: 'adv', d: '2026-10-28', c: 300000, note: '', n: 1, from: '2026-11' });
    eq([C.monthPay(late, '2026-10').adv, C.monthPay(late, '2026-11').adv, C.slipLines(C.monthPay(late, '2026-10'), late, '', L)[1].t], [0, 300000, 'Advance of 3,000 given 28 Oct, taken back from November pay'], 'advance taken back from next month');
    const big = worker({ start: '2026-10-01', off: [], leave: 0, pays: [{ from: '2026-10', c: 1000000 }] });
    big.entries.push({ id: 'b', k: 'adv', d: '2026-10-03', c: 1500000, note: '', n: 1, from: '2026-10' });
    const bo = C.monthPay(big, '2026-10');
    eq([bo.net, bo.toPay, C.toPayText(bo, '', L)], [-500000, -500000, 'Nothing to pay. 5,000 comes off next month\'s pay'], 'advance bigger than the pay');
    const gone = worker({ start: '2026-10-01', stop: '2026-10-31', off: [], leave: 0 });
    gone.entries.push({ id: 'g1', k: 'adv', d: '2026-10-03', c: 4000000, note: '', n: 2, from: '2026-10' });
    eq([C.monthPay(gone, '2026-10').toPay, C.toPayText(C.monthPay(gone, '2026-11'), '', L)], [1000000, 'Nothing to pay. They owe you 10,000'], 'left with half of a 40,000 advance (20,000) not taken back and October (10,000) unpaid');
    eq(C.monthPay(big, '2026-11').toPay, 500000, 'November: 10,000 - 5,000 left over = 5,000');
    const pp = JSON.parse(JSON.stringify(r1));
    pp.entries.push({ id: 'p2', k: 'paid', d: '2026-11-01', c: 2000000, note: '', m: '2026-10' });
    eq([C.monthPay(pp, '2026-10').toPay, C.monthPay(pp, '2026-11').bf, C.monthPay(pp, '2026-11').toPay], [350000, 350000, 3350000], 'paid 20,000 of 23,500: 3,500 carried');
    pp.entries.push({ id: 'p3', k: 'paid', d: '2026-11-02', c: 350000, note: '', m: '2026-10' });
    eq(C.toPayText(C.monthPay(pp, '2026-10'), 'Rs', L), 'Fully paid', 'fully paid');
    const bn = worker({ start: '2026-10-01', off: [], leave: 0 });
    bn.entries.push({ id: 'e', k: 'bonus', d: '2026-10-20', c: 500000, note: 'Eid' });
    bn.entries.push({ id: 'g', k: 'ded', d: '2026-10-21', c: 30050, note: 'broken glass' });
    const bno = C.monthPay(bn, '2026-10');
    eq(bno.net, 3000000 + 500000 - 30050, 'bonus 5,000 and 300.50 taken off');
    eq(C.slipLines(bno, bn, 'Rs', L).map(l => l.t + ' ' + (l.c == null ? '' : C.signed(l.c, 'Rs', L))), ['Monthly pay Rs 30,000', 'Bonus: Eid (20 Oct) Rs 5,000', 'Taken off: broken glass (21 Oct) −Rs 300.50', 'Pay for October Rs 34,699.50'], 'bonus and deduction lines with a currency');
    const rise = worker({ off: [], leave: 0, pays: [{ from: '2026-09', c: 3000000 }, { from: '2026-11', c: 3200000 }] });
    eq([C.monthPay(rise, '2026-10').net, C.monthPay(rise, '2026-11').net], [3000000, 3200000], 'pay rise from November');
    const ot = worker({ off: [], leave: 0, otC: 20000 });
    ot.marks['2026-10-03'] = { k: '', ot: 120 }; ot.marks['2026-10-04'] = { k: '', ot: 90 };
    eq([C.monthPay(ot, '2026-10').otPay, C.slipLines(C.monthPay(ot, '2026-10'), ot, '', L)[1].t], [70000, 'Overtime: 3 h 30 min at 200 an hour'], 'overtime 3.5 hours at 200');
    const ex = worker({ extraC: 150000 });
    mark(ex, ['2026-10-04', '2026-10-11'], 'x');
    eq(C.monthPay(ex, '2026-10').extraPay, 300000, 'own pay for a day off worked: 2 × 1,500');
    const st = worker({ start: '2025-03-10', off: [], leave: 0, settled: '2026-10', open: 150000 });
    eq([C.monthPay(st, '2025-03').toPay, C.monthPay(st, '2026-09').toPay, C.toPayText(C.monthPay(st, '2026-09'), '', L), C.monthPay(st, '2026-10').bf, C.monthPay(st, '2026-10').toPay], [0, 0, 'Already paid before this record was started', 150000, 3150000], 'months before the record are settled; owed from before starts with October');
    const op = worker({ off: [], leave: 0, open: 200000 });
    eq(C.monthPay(op, '2026-09').toPay, 3200000, 'owed from before the start');

    // ---------- typing ----------
    eq([C.parseAmount('30,000').cents, C.parseAmount('1,00,000').cents, C.parseAmount('Rs 500').cents, C.parseAmount('12.5').cents], [3000000, 10000000, 50000, 1250], 'amounts');
    eq([!!C.parseAmount('-5').error, !!C.parseAmount('').error, !!C.parseAmount('abc').error, !!C.parseAmount('0').error, !!C.parseAmount('999999999999').error], [true, true, true, true, true], 'bad amounts');
    eq(['2', '1.5', '1,5', '1:30', '90 min', '2 hours', '', '0.25'].map(t => C.parseHours(t).min), [120, 90, 90, 90, 90, 120, 0, 15], 'hours');
    eq([!!C.parseHours('-1').error, !!C.parseHours('25').error, !!C.parseHours('abc').error], [true, true, true], 'bad hours');
    eq([C.halvesText(1), C.halvesText(2), C.halvesText(5), C.halvesText(6)], ['½ day', '1 day', '2½ days', '3 days'], 'half days in words');

    // ---------- saved data ----------
    eq(C.cleanState(null), null, 'null state');
    eq(C.cleanState({ workers: 'x' }), null, 'bad workers');
    const dirty = C.cleanState({ cur: '<b>', workers: [{ id: 'a', name: 'Ali', start: '2026-02-30', pays: [{ from: '2026-01', c: 100 }] },
        { id: 'b', name: ' Sara ', start: '2026-09-01', off: [0, 9, 0], leave: 99, rule: 'x', pays: [{ from: '2026-09', c: -1 }, { from: '2026-09', c: 2000000 }],
          marks: { '2026-10-01': { k: 'a' }, 'bad': { k: 'a' }, '2026-10-02': { k: 'z' }, '2026-10-03': { k: 'h', ot: 99999 } },
          entries: [{ k: 'adv', d: '2026-10-01', c: 100, n: 99 }, { k: 'bonus', d: 'x', c: 5 }, { k: 'paid', d: '2026-10-01', c: 1.5 }] }] });
    eq([dirty.cur, dirty.workers.length, dirty.workers[0].name, dirty.workers[0].off, dirty.workers[0].leave, dirty.workers[0].rule, dirty.workers[0].pays, Object.keys(dirty.workers[0].marks), dirty.workers[0].entries.length, dirty.workers[0].entries[0].n],
        ['', 1, 'Sara', [0], 0, 'thirty', [{ from: '2026-09', c: 2000000 }], ['2026-10-01', '2026-10-03'], 1, 1], 'corrupt saved data is cleaned');

    const msg = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') { document.getElementById('out').textContent = out.concat(msg).join('\n'); }
    else { out.forEach(l => console.log(l)); console.log(msg); if (fail) process.exitCode = 1; }
})();
