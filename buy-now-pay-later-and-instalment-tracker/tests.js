// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.BNPL;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const m = s => C.parseMoney(s).n, merr = s => !!C.parseMoney(s).error, fm = c => C.fmtMoney(c, '', 'en-US');
    const amts = s => s.pays.map(x => x.amt), dues = s => s.pays.map(x => x.due);

    // typed amounts
    eq('120', m('120'), 12000); eq('33.50', m('33.50'), 3350); eq('Rs 1,49,999.50 lakh', m('Rs 1,49,999.50'), 14999950); eq('£1,200', m('£1,200'), 120000);
    eq('comma decimal 49,99', m('49,99'), 4999); eq('pasted spaces', m('  80 '), 8000); eq('0 is a number', m('0'), 0);
    eq('blank', merr(''), true); eq('words', merr('lots'), true); eq('minus', merr('-5'), true); eq('3 decimals', merr('1.2345'), true); eq('1.234 is a thousands mark', m('1.234'), 123400); eq('huge', merr('1000000000'), true);
    eq('positive refuses 0', !!C.parseMoney('0', { positive: true }).error, true);
    eq('count 4', C.parseCount('4', 60, 'payments').n, 4); eq('count 0', !!C.parseCount('0', 60, 'x').error, true); eq('count 61', !!C.parseCount('61', 60, 'x').error, true);
    eq('count 2.5', !!C.parseCount('2.5', 60, 'x').error, true); eq('count blank', !!C.parseCount('', 60, 'x').error, true);

    // days
    eq('date ok', C.isDate('2026-02-28'), true); eq('date bad', C.isDate('2026-02-30'), false); eq('date junk', C.isDate('soon'), false);
    eq('add 14 days over month', C.addDays('2026-10-28', 14), '2026-11-11'); eq('over new year', C.addDays('2026-12-25', 14), '2027-01-08');
    eq('31 Jan + 1 month = 28 Feb', C.addMonths('2026-01-31', 1), '2026-02-28'); eq('back to the 31st', C.addMonths('2026-01-31', 2, 31), '2026-03-31');
    eq('leap year', C.addMonths('2028-01-31', 1), '2028-02-29'); eq('December to January', C.addMonths('2026-12-15', 1), '2027-01-15');
    eq('month end', C.monthEnd('2026-02-10'), '2026-02-28'); eq('next month', C.nextMonth('2026-12-31'), '2027-01-01');
    eq('fmtDate this year', C.fmtDate('2026-11-03', '2026-10-28'), 'Tue 3 Nov'); eq('fmtDate next year', C.fmtDate('2027-03-15', '2026-10-28'), 'Mon 15 Mar 2027');
    eq('rel today', C.rel('2026-10-28', '2026-10-28'), 'today'); eq('rel tomorrow', C.rel('2026-10-29', '2026-10-28'), 'tomorrow'); eq('rel in 6', C.rel('2026-11-03', '2026-10-28'), 'in 6 days');
    eq('rel late', C.rel('2026-10-05', '2026-10-28'), '23 days ago');

    // schedules worked by hand
    let s = C.schedule({ mode: 'total', amount: 12000, n: 4, freq: '2w', first: '2026-10-28' });
    eq('pay in 4: 30 each', amts(s), [3000, 3000, 3000, 3000]); eq('pay in 4 dates', dues(s), ['2026-10-28', '2026-11-11', '2026-11-25', '2026-12-09']);
    eq('pay in 4 words', C.splitWords(s.pays, fm), '4 payments of 30');
    s = C.schedule({ mode: 'total', amount: 10000, n: 3, freq: 'm', first: '2026-01-31' });
    eq('100 in 3: 33.34 first', amts(s), [3334, 3333, 3333]); eq('31st kept', dues(s), ['2026-01-31', '2026-02-28', '2026-03-31']);
    eq('100 in 3 words', C.splitWords(s.pays, fm), '3 payments: 33.34, then 2 of 33.33');
    s = C.schedule({ mode: 'total', amount: 100000, n: 7, freq: 'w', first: '2026-10-28' });
    eq('1000 in 7: odd cents first', amts(s), [14286, 14286, 14286, 14286, 14286, 14285, 14285]); eq('1000 in 7 adds up', amts(s).reduce((a, b) => a + b), 100000);
    eq('1000 in 7 words', C.splitWords(s.pays, fm), '7 payments: 5 of 142.86, then 2 of 142.85'); eq('weekly', s.pays[1].due, '2026-11-04');
    s = C.schedule({ mode: 'total', amount: 15000000, down: 3000000, n: 12, freq: 'm', first: '2026-11-05' });
    eq('down payment then 12 of 10,000', amts(s).every(a => a === 1000000), true); eq('down payment total', [s.total, s.rest, s.down], [15000000, 12000000, 3000000]);
    eq('12th payment date', s.pays[11].due, '2027-10-05');
    s = C.schedule({ mode: 'each', amount: 4999, n: 6, freq: 'm', first: '2026-11-01' });
    eq('each mode 6 x 49.99', [s.total, amts(s)[5]], [29994, 4999]);
    s = C.schedule({ mode: 'each', amount: 2000, down: 5000, n: 3, freq: 'd', every: 10, first: '2026-10-28' });
    eq('each mode with down payment and every 10 days', [s.total, dues(s)[2]], [11000, '2026-11-17']);
    s = C.schedule({ mode: 'total', amount: 5000, n: 1, freq: 'm', first: '2026-11-27' });
    eq('pay in 30 days: one payment', [s.pays.length, s.pays[0].amt], [1, 5000]); eq('one payment words', C.splitWords(s.pays, fm), '1 payment of 50');
    eq('down payment too big', !!C.schedule({ mode: 'total', amount: 5000, down: 5000, n: 2, freq: 'm', first: '2026-11-01' }).error, true);
    eq('less than a cent each', !!C.schedule({ mode: 'total', amount: 3, n: 4, freq: 'w', first: '2026-11-01' }).error, true);
    eq('60 payments of 1,000,000 too big', !!C.schedule({ mode: 'each', amount: 9999999999, n: 60, freq: 'm', first: '2026-11-01' }).error, true);
    eq('respread 100 over 3', C.respread([1, 2, 3], 10000), [3334, 3333, 3333]); eq('respread 90 over 3', C.respread([1, 2, 3], 9000), [3000, 3000, 3000]);

    // the main situation on Wed 28 Oct 2026
    const T = '2026-10-28';
    const mk = (id, name, provider, o, paidUpTo) => { const sc = C.schedule(o); return { id, name, provider, bought: o.first, down: o.down || 0, how: '',
        pays: sc.pays.map((x, i) => ({ id: 'p' + (i + 1), due: x.due, amt: x.amt, paid: x.due <= paidUpTo ? x.due : null })), closed: null }; };
    const plans = () => [
        mk('a', 'Winter coat', 'Klarna', { mode: 'total', amount: 12000, n: 4, freq: '2w', first: '2026-10-14' }, '2026-10-14'),
        mk('b', 'Phone', 'Bank 0% plan', { mode: 'total', amount: 120000, n: 12, freq: 'm', first: '2026-09-05' }, '2026-09-05'),
        mk('c', 'Shoes', 'Afterpay', { mode: 'total', amount: 8000, n: 4, freq: '2w', first: '2026-10-20' }, '2026-10-20')];
    let P = plans(), sm = C.summary(P, T);
    eq('late: the phone payment of 5 Oct', [sm.late.n, sm.late.sum], [1, 10000]); eq('due today: the coat', [sm.today.n, sm.today.sum], [1, 3000]);
    eq('still to pay in October (late included)', [sm.thisMonth.n, sm.thisMonth.sum, sm.thisMonth.month], [2, 13000, '2026-10']);
    eq('November', [sm.nextMonth.n, sm.nextMonth.sum, sm.nextMonth.month], [5, 20000, '2026-11']);
    eq('still owed in total', [sm.owed, sm.plans, sm.last], [125000, 3, '2027-08-05']); eq('next 7 days', [sm.week.n, sm.week.sum], [2, 5000]);
    eq('next payments sorted, late first', sm.rows.slice(0, 3).map(r => r.plan.id + r.pay.due), ['b2026-10-05', 'a2026-10-28', 'c2026-11-03']);
    eq('month by month', C.monthTotals(P, T, 3), [{ month: '2026-10', sum: 13000, n: 2 }, { month: '2026-11', sum: 20000, n: 5 }, { month: '2026-12', sum: 12000, n: 2 }]);
    let a = C.analyse(P[1], T);
    eq('phone is late', [a.state, a.paidCount, a.count, a.paid, a.owed, a.pct, a.lateSum], ['late', 1, 12, 10000, 110000, 8.3, 10000]);
    eq('coat due today', C.analyse(P[0], T).state, 'today'); a = C.analyse(P[2], T);
    eq('shoes on track, next 3 Nov', [a.state, a.next.due, a.next.amt, a.last], ['ok', '2026-11-03', 2000, '2026-12-01']);
    eq('due within 3 days is soon', C.analyse(P[2], '2026-11-01').state, 'soon');
    // second use the next day: the coat payment of today becomes late if not ticked
    eq('next day: coat late', C.analyse(P[0], '2026-10-29').state, 'late');
    // ticking the late phone payment
    P[1].pays[1].paid = T; sm = C.summary(P, T);
    eq('after paying the phone: nothing late', [sm.late.n, sm.thisMonth.sum, sm.owed], [0, 3000, 115000]);
    // all paid
    P[0].pays.forEach(x => { x.paid = T; }); eq('coat paid off', C.analyse(P[0], T).state, 'done'); eq('paid off plan leaves the plan count', C.summary(P, T).plans, 2);
    // returned: the rest is cancelled and the refund is expected
    P[2].pays.forEach(x => { if (!x.paid) x.cancelled = true; }); P[2].closed = { type: 'returned', on: T, refund: 2000, refundGot: false };
    sm = C.summary(P, T); a = C.analyse(P[2], T);
    eq('returned shoes', [a.state, a.owed, a.paid, a.count], ['returned', 0, 2000, 1]); eq('summary skips returned, counts the refund', [sm.owed, sm.refund, sm.refundPlans], [100000, 2000, 1]);
    // fees
    P = plans(); P[1].pays.push({ id: 'f1', due: '2026-10-20', amt: 1200, paid: null, fee: true }); sm = C.summary(P, T);
    eq('late fee adds to what is late and owed', [sm.late.n, sm.late.sum, sm.owed], [2, 11200, 126200]);
    // empty
    sm = C.summary([], T); eq('empty', [sm.owed, sm.rows.length, sm.last, sm.thisMonth.sum], [0, 0, null, 0]);

    // words for copying and the calendar
    P = plans();
    const txt = C.summaryText(P, T, '$');
    eq('summary text late line', txt.includes('LATE: 1 payment, $100'), true); eq('summary text this month', txt.includes('Still to pay in October: $130 (2 payments)'), true);
    eq('summary text total', txt.includes('Still owed in total: $1,250 on 3 plans, last payment Thu 5 Aug 2027'), true);
    eq('summary text next row', txt.includes('- Mon 5 Oct (LATE): $100 Phone (Bank 0% plan)'), true);
    const cal = C.ics(P, T, '', '20261028T000000Z');
    eq('calendar: payments from today on', cal.count, 16); eq('calendar has an all-day event', cal.text.includes('DTSTART;VALUE=DATE:20261111'), true);
    eq('calendar reminder the day before', cal.text.includes('TRIGGER:-P1D'), true); eq('calendar lines end CRLF', /\r\n$/.test(cal.text) && !/[^\r]\n/.test(cal.text), true);
    const odd = [{ id: 'x', name: 'Sofa, grey; 3-seat', provider: 'Shop', bought: T, down: 0, closed: null, pays: [{ id: 'p1', due: '2026-11-01', amt: 100, paid: null }] }];
    eq('calendar escapes commas', C.ics(odd, T, '', 'X').text.includes('Sofa\\, grey\; 3-seat'), true);
    eq('money with symbol', C.fmtMoney(123456, 'Rs', 'en-US'), 'Rs 1,234.56'); eq('money with £', C.fmtMoney(3000, '£', 'en-US'), '£30'); eq('money input', C.moneyInput(3334), '33.34');

    // saved and restored data
    eq('clean: not an object', C.cleanState('x'), null); eq('clean: no plans', C.cleanState({}), null);
    const cl = C.cleanState({ plans: [{ name: 'A', provider: 'K', pays: [{ due: '2026-11-01', amt: 100 }, { due: 'bad', amt: 1 }, { due: '2026-11-02', amt: -5 }, { due: '2026-11-03', amt: 1.5 }] },
        { name: '', provider: 'K', pays: [{ due: '2026-11-01', amt: 100 }] }, { name: 'B', provider: 'K', pays: [] }, null], cur: '£' });
    eq('clean keeps good rows only', [cl.plans.length, cl.plans[0].pays.length, cl.cur], [1, 1, '£']);
    eq('clean fills ids', typeof cl.plans[0].id === 'string' && typeof cl.plans[0].pays[0].id === 'string', true);
    eq('clean: long names cut', C.cleanPlan({ name: 'x'.repeat(200), provider: 'K', pays: [{ due: '2026-11-01', amt: 1 }] }).name.length, 60);
    eq('clean: paid and cancelled', C.cleanPay({ due: '2026-11-01', amt: 1, paid: '2026-11-01', cancelled: true }).cancelled, undefined);
    eq('round trip', JSON.stringify(C.cleanState(JSON.parse(JSON.stringify({ v: 1, plans: plans(), cur: '' })))) === JSON.stringify({ v: 1, plans: plans(), cur: '' }), true);

    out.push('', pass + ' passed, ' + fail + ' failed');
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n');
    else { console.log(out.filter(l => !l.startsWith('PASS')).join('\n')); if (fail) process.exitCode = 1; }
})();
