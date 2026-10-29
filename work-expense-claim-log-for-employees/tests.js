// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.WEC;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const m = s => C.parseMoney(s, true).n, merr = s => C.parseMoney(s, true).error || '';

    // typed amounts
    eq('1450', m('1450'), 145000); eq('1,350.50', m('1,350.50'), 135050); eq('Rs 1350.5', m('Rs 1350.5'), 135050); eq('1,00,000 lakh', m('1,00,000'), 10000000);
    eq('35 000 pasted', m('35 000'), 3500000); eq('1.234,56', m('1.234,56'), 123456); eq('2500/-', m('2500/-'), 250000); eq('$12.5', m('$12.5'), 1250); eq('  42  ', m('  42  '), 4200);
    eq('blank', merr(''), 'Type the amount, such as 2500.'); eq('zero', merr('0'), 'Type an amount bigger than 0.'); eq('minus', merr('-50'), 'Type it without a minus sign.');
    eq('3 decimals', merr('12.345'), ''); eq('12.3456', merr('12.3456'), 'Use at most 2 decimal places.'); eq('words', !!merr('two'), true); eq('huge', merr('99999999999'), 'That amount is too big.');
    eq('12.345 is twelve thousand', m('12.345'), 1234500);
    eq('paid 0 allowed', C.parseMoney('0', false).n, 0);
    eq('days 45', C.parseDays('45').n, 45); eq('days "45 days"', C.parseDays('45 days').n, 45); eq('days 0', !!C.parseDays('0').error, true); eq('days 1.5', !!C.parseDays('1.5').error, true); eq('days 1000', !!C.parseDays('1000').error, true);

    // other currency, to the cent: USD 15.99 at 281.4 = 4,499.586 -> 4,499.59
    eq('rate 281.4', C.parseRate('281.4').n, 281400000); eq('rate 0,92', C.parseRate('0,92').n, 920000); eq('rate 0.003612', C.parseRate('0.003612').n, 3612); eq('rate 1,234 read as decimal', C.parseRate('1,234').n, 1234000);
    eq('rate blank', C.parseRate('').error, 'Type the rate, such as 281.50.'); eq('rate 0', C.parseRate('0').error, 'Type a rate bigger than 0.'); eq('rate 7 decimals', C.parseRate('0.1234567').error, 'Use at most 6 decimal places.');
    eq('USD 15.99 at 281.4', C.fxCents(1599, 281400000), 449959); eq('AED 45 at 76.2', C.fxCents(4500, 76200000), 342900);
    eq('EUR 0.01 at 0.5 rounds half up', C.fxCents(1, 500000), 1); eq('EUR 0.01 at 0.4', C.fxCents(1, 400000), 0); eq('huge exact', C.fxCents(99999999999, 999999000000), 99999899999000001 > 0 ? C.fxCents(99999999999, 999999000000) : 0);
    // distance: 120 km at 65 = 7,800; 120.5 km at 0.45 = 54.225 -> 54.23; 37.3 miles at 0.7 = 26.11
    eq('dist 120.5', C.parseDist('120.5 km').n, 1205); eq('dist blank', C.parseDist('').error, 'Type the distance, such as 120.'); eq('dist 2 decimals', !!C.parseDist('1.25').error, true);
    eq('120 km at 65', C.kmCents(1200, C.parsePerDist('65').n), 780000); eq('120.5 km at 0.45', C.kmCents(1205, C.parsePerDist('0.45').n), 5423); eq('37.3 mi at 0.7', C.kmCents(373, C.parsePerDist('0.7').n), 2611);
    eq('fmtScaled', [C.fmtScaled(281400000, 6), C.fmtScaled(3612, 6), C.fmtScaled(1205, 1), C.fmtScaled(4500, 4), C.fmtScaled(650000, 4)], ['281.4', '0.003612', '120.5', '0.45', '65']);

    // dates
    eq('isDay 31 Feb', C.isDay('2026-02-31'), false); eq('isDay leap', C.isDay('2028-02-29'), true); eq('addDays 60', C.addDays('2026-10-03', 60), '2026-12-02');
    eq('addMonths back over a year', C.addMonths('2026-01', -1), '2025-12'); eq('addMonths forward', C.addMonths('2026-11', 3), '2027-02'); eq('monthName', C.monthName('2026-10'), 'October 2026');

    // the main situation: Ayesha, a sales executive; claims within 60 days; today Thu 29 Oct 2026
    const T = '2026-10-29';
    const S = () => C.cleanState({ cur: 'Rs', co: { name: 'Orion Traders', days: 60 }, exps: [
        { id: 'e1', d: '2026-09-14', cat: 'Train, bus or flight', what: 'Flight to Lahore', amt: 1850000, proj: 'Lahore trade fair' },
        { id: 'e2', d: '2026-09-15', cat: 'Hotel', what: 'Hotel, 1 night', amt: 980000, proj: 'Lahore trade fair' },
        { id: 'e3', d: '2026-09-18', cat: 'Taxi or ride', what: 'Careem to Habib Foods', amt: 125000, proj: 'Habib Foods' },
        { id: 'e4', d: '2026-09-22', cat: 'Client meal or entertainment', what: 'Lunch with Habib Foods buyers', amt: 860000, proj: 'Habib Foods' },
        { id: 'e5', d: '2026-09-22', cat: 'Parking or tolls', what: 'Parking at Dolmen Mall', amt: 30000 },
        { id: 'e6', d: '2026-10-03', cat: 'Taxi or ride', what: 'Uber to Habib Foods', amt: 145000, proj: 'Habib Foods' },
        { id: 'e7', d: '2026-10-09', cat: 'Office supplies', what: 'Printer ink', amt: 420000, norec: true },
        { id: 'e8', d: '2026-10-14', cat: 'Fuel or mileage', what: 'Own car to Hub factory', amt: 780000, proj: 'Habib Foods', km: { k: 1200, r: 650000, u: 'km' } },
        { id: 'e9', d: '2026-10-21', cat: 'Client meal or entertainment', what: 'Dinner with Habib Foods', amt: 590000, proj: 'Habib Foods' },
        { id: 'e10', d: '2026-10-26', cat: 'Phone or internet', what: 'Zoom Pro for the webinar', amt: 449959, fx: { c: 'usd', a: 1599, r: 281400000 } }], claims: [
        { id: 'c1', d: '2026-09-30', st: 'paid', pd: '2026-10-20', ref: 'EXP-0398', items: [{ e: 'e1', a: 1850000, p: 1850000 }, { e: 'e2', a: 980000, p: 800000 }] },
        { id: 'c2', d: '2026-10-05', st: 'wait', items: [{ e: 'e3', a: 125000 }, { e: 'e4', a: 860000 }, { e: 'e5', a: 30000 }] }] });
    let s = S(), a = C.analyse(s, T);
    const ex = id => a.exps.find(x => x.exp.id === id);
    eq('state kept everything', [s.exps.length, s.claims.length, s.co], [10, 2, { name: 'Orion Traders', days: 60 }]);
    eq('currency code upper-cased', s.exps[9].fx.c, 'USD');
    eq('not claimed yet 23,849.59', a.openTotal, 2384959);
    eq('5 expenses to claim, oldest first', a.todo.map(x => x.exp.id), ['e6', 'e7', 'e8', 'e9', 'e10']);
    eq('oldest 26 days ago', a.todo[0].age, 26);
    eq('claim by 2 Dec, in 34 days', [ex('e6').claimBy, ex('e6').left], ['2026-12-02', 34]);
    eq('waiting 10,150 (24 days)', [a.waitTotal, a.waiting[0].age], [1015000, 24]);
    eq('paid back 26,500', a.paidTotal, 2650000);
    eq('not paid back 1,800 (hotel cut)', [a.lostTotal, ex('e2').lost], [180000, 180000]);
    eq('spent 62,299.59', a.spentTotal, 6229959);
    eq('totals add up', a.paidTotal + a.waitTotal + a.openTotal + a.lostTotal, a.spentTotal);
    eq('no receipt counted', a.noReceipt.map(x => x.exp.id), ['e7']);
    eq('statuses', ['e1', 'e2', 'e3', 'e6'].map(id => ex(id).status), ['paid', 'paid', 'wait', 'todo']);
    eq('claim c1 short 1,800', [a.done[0].total, a.done[0].got, a.done[0].short], [2830000, 2650000, 180000]);
    eq('nothing late or soon', [a.late.length, a.soon.length, a.longWait.length], [0, 0, 0]);
    // month by month
    const oct = C.month(a, '2026-10');
    eq('October spent', [oct.n, oct.spent, oct.open], [5, 2384959, 2384959]);
    eq('October by type', oct.cats.map(c => [c.k, c.amt]), [['Fuel or mileage', 780000], ['Client meal or entertainment', 590000], ['Phone or internet', 449959], ['Office supplies', 420000], ['Taxi or ride', 145000]]);
    eq('October by client', oct.projects.map(c => [c.k, c.amt]), [['Habib Foods', 1515000], ['', 869959]]);
    const sep = C.month(a, '2026-09');
    eq('September', [sep.spent, sep.paidBack, sep.waiting, sep.open], [3845000, 2650000, 1015000, 0]);
    eq('empty month', [C.month(a, '2026-08').n, C.month(a, '2026-08').spent, C.month(a, '2026-08').cats], [0, 0, []]);
    eq('no projects in a month without any', C.month(C.analyse(C.cleanState({ exps: [{ id: 'x', d: T, amt: 100, cat: 'Meals', what: 'Tea' }], claims: [] }), T), '2026-10').projects, []);
    eq('howWord fx', C.howWord(s.exps[9], 'Rs', 'en-GB'), 'USD 15.99 at 281.4'); eq('howWord km', C.howWord(s.exps[7], 'Rs', 'en-GB'), '1,200 km at Rs 65 a km'.replace('1,200', '120'));
    eq('howWord mi $', C.howWord({ km: { k: 373, r: 7000, u: 'mi' } }, '$', 'en-US'), '37.3 mi at $0.7 a mile');

    // claim the cut part again: 1,800 back in not claimed yet
    s = S(); s.claims[0].rest = true; a = C.analyse(s, T);
    eq('cut part back: open 1,800 on the hotel', [ex('e2').open, ex('e2').status, ex('e2').lost], [180000, 'todo', 0]);
    eq('cut part back: totals add up', a.paidTotal + a.waitTotal + a.openTotal + a.lostTotal, a.spentTotal);
    eq('openWithout counts the paid part', C.openWithout(s, 'e2', null), 180000);
    // a rejected claim gives its expenses back, with the reason
    s = S(); s.claims[1].st = 'rej'; s.claims[1].why = 'Missing receipt'; s.claims[1].pd = '2026-10-25'; s = C.cleanState(s); a = C.analyse(s, T);
    eq('rejected: back to claim', [ex('e3').status, ex('e4').open, a.openTotal, a.waitTotal], ['todo', 860000, 2384959 + 1015000, 0]);
    eq('rejected: reason kept', ex('e4').rejected, [{ d: '2026-10-25', why: 'Missing receipt' }]);
    // part claim of one expense
    s = S(); s.claims.push({ id: 'c3', d: '2026-10-28', st: 'wait', items: [{ e: 'e9', a: 400000 }] }); s = C.cleanState(s); a = C.analyse(s, T);
    eq('part claim: 1,900 still to claim of 5,900', [ex('e9').open, ex('e9').waiting, ex('e9').status], [190000, 400000, 'todo']);
    eq('openWithout this claim', C.openWithout(s, 'e9', 'c3'), 590000);
    // over-claiming is caught
    s = S(); s.claims.push({ id: 'c4', d: '2026-10-28', st: 'wait', items: [{ e: 'e3', a: 125000 }] });
    eq('over-claimed found', (C.overClaimed(s) || {}).id, 'e3'); eq('not over-claimed normally', C.overClaimed(S()), undefined);
    // not claiming
    s = S(); s.exps[6].skip = true; a = C.analyse(s, T);
    eq('not claiming: out of the list, counted as not paid back', [ex('e7').status, a.openTotal, a.lostTotal], ['skip', 2384959 - 420000, 180000 + 420000]);
    // claim-by: late and soon, and with no limit
    s = S(); s.co.days = 30; a = C.analyse(s, T);
    eq('30 days: 3 Oct must be claimed by 2 Nov, in 4 days', [ex('e6').claimBy, ex('e6').left, ex('e6').urgency], ['2026-11-02', 4, 'soon']);
    s.co.days = 20; a = C.analyse(s, T);
    eq('20 days: 3 Oct was due 23 Oct, 6 days late', [ex('e6').claimBy, ex('e6').left, ex('e6').urgency], ['2026-10-23', -6, 'late']);
    eq('20 days: 9 Oct is due today', [ex('e7').left, ex('e7').urgency], [0, 'soon']);
    eq('20 days: 26 Oct is due 15 Nov (17 days, ok)', [ex('e10').left, ex('e10').urgency], [17, 'ok']);
    eq('20 days: late and soon lists', [a.late.map(x => x.exp.id), a.soon.map(x => x.exp.id)], [['e6'], ['e7', 'e8', 'e9']]);
    s.co.days = null; a = C.analyse(s, T);
    eq('no limit: no claim-by', [ex('e6').claimBy, ex('e6').urgency], [null, 'none']);
    // long wait
    a = C.analyse(S(), '2026-11-20');
    eq('waiting 46 days is long', [a.waiting[0].age, a.longWait.length], [46, 1]);
    // paid exactly zero (all refused)
    s = S(); s.claims[1] = { id: 'c2', d: '2026-10-05', st: 'paid', pd: '2026-10-28', items: [{ e: 'e3', a: 125000, p: 0 }, { e: 'e4', a: 860000, p: 0 }, { e: 'e5', a: 30000, p: 0 }] };
    s = C.cleanState(s); a = C.analyse(s, T);
    eq('paid 0: all not paid back', [a.done.find(c => c.claim.id === 'c2').got, a.lostTotal], [0, 180000 + 1015000]);

    // saved data is checked
    eq('null state', C.cleanState(null), null); eq('wrong shape', C.cleanState({ exps: 5, claims: [] }), null);
    const dirty = C.cleanState({ cur: 'Rs', co: { name: 'X'.repeat(90), days: 9999 }, exps: [
        { id: 'a', d: '2026-02-31', amt: 100, what: 'bad date' }, { id: 'b', d: '2026-10-01', amt: -5, what: 'neg' }, { id: 'c', d: '2026-10-01', amt: 1.5, what: 'frac' },
        { id: 'd', d: '2026-10-01', amt: 500, cat: 'Spaceship', what: '' }, { id: 'd', d: '2026-10-02', amt: 600, what: 'dup id' },
        { id: 'f', d: '2026-10-03', amt: 700, what: 'bad fx', fx: { c: 'US', a: 5, r: 1 } }], claims: [
        { id: 'k1', d: '2026-10-05', st: 'paid', items: [{ e: 'd', a: 500, p: 9999 }, { e: 'zz', a: 5 }] }, { id: 'k2', d: 'x', items: [{ e: 'd', a: 1 }] }, { id: 'k3', d: '2026-10-05', items: [] }] });
    eq('dirty: kept the good ones', dirty.exps.map(e => e.id), ['d', 'f']);
    eq('dirty: unknown type is Other, blank what is the type', [dirty.exps[0].cat, dirty.exps[0].what], ['Other', 'Other']);
    eq('dirty: bad fx dropped', dirty.exps[1].fx, undefined);
    eq('dirty: rules capped', [dirty.co.name.length, dirty.co.days], [60, null]);
    eq('dirty: claim kept, paid capped at claimed', dirty.claims.map(c => [c.id, c.items]), [['k1', [{ e: 'd', a: 500, p: 500 }]]]);
    eq('dirty: paid date falls back', dirty.claims[0].pd, '2026-10-05');
    eq('long text trimmed', C.cleanExp({ id: 'x', d: T, amt: 5, what: 'w'.repeat(500), note: 'n'.repeat(900) }).what.length, 80);

    // csv: quoted, formulas defused, both currencies
    s = S(); s.exps[2].what = '=HYPERLINK("x")'; a = C.analyse(s, T);
    const csv = C.csv(s, a, 'en-GB'), lines = csv.trim().split('\r\n');
    eq('csv rows', lines.length, 11);
    eq('csv header', lines[0].split('","')[0], '"Date');
    eq('csv formula defused', csv.includes('"\'=HYPERLINK(""x"")"'), true);
    eq('csv fx line', lines.find(l => l.includes('Zoom')).includes('"USD 15.99 at 281.4"'), true);
    eq('csv hotel cut', lines.find(l => l.includes('Hotel, 1 night')).includes('"9800.00","","Yes","Paid back","2026-09-30","EXP-0398","8000.00","0.00","0.00","1800.00"'), true);

    // words
    eq('money plain', C.fmtMoney(2384959, '', 'en-US'), '23,849.59'); eq('money Rs', C.fmtMoney(780000, 'Rs', 'en-US'), 'Rs 7,800'); eq('money $', C.fmtMoney(5, '$', 'en-US'), '$0.05');
    eq('inDays', [C.inDays(0), C.inDays(1), C.inDays(34), C.inDays(-4)], ['today', 'tomorrow', 'in 34 days', '4 days ago']);
    eq('agoWord', [C.agoWord(0), C.agoWord(1), C.agoWord(26)], ['today', 'yesterday', '26 days ago']);

    const summary = (fail ? 'FAILED ' + fail + ' of ' : 'ALL PASSED: ') + (pass + fail) + ' checks';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = summary + '\n\n' + out.join('\n');
    else { out.filter(l => l.startsWith('FAIL')).forEach(l => console.log(l)); console.log(summary); if (fail) process.exit(1); }
})();
