// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.MBR;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const m = s => C.parseMoney(s, true).n, merr = s => C.parseMoney(s, true).error || '';

    // typed amounts
    eq('2500', m('2500'), 250000); eq('1,350.50', m('1,350.50'), 135050); eq('Rs 1350.5', m('Rs 1350.5'), 135050); eq('1,00,000 lakh', m('1,00,000'), 10000000);
    eq('35 000 pasted', m('35 000'), 3500000); eq('1.234,56', m('1.234,56'), 123456); eq('2500/-', m('2500/-'), 250000); eq('$12.5', m('$12.5'), 1250);
    eq('blank', merr(''), 'Type the amount, such as 2500.'); eq('zero', merr('0'), 'Type an amount bigger than 0.'); eq('minus', merr('-50'), 'Type it without a minus sign.');
    eq('3 decimals', merr('12.3456'), 'Use at most 2 decimal places.'); eq('words', !!merr('two'), true); eq('huge', merr('99999999999'), 'That amount is too big.');
    eq('refund 0 allowed', C.parseMoney('0', false).n, 0);
    eq('days 90', C.parseDays('90').n, 90); eq('days "45 days"', C.parseDays('45 days').n, 45); eq('days 0', !!C.parseDays('0').error, true); eq('days 1.5', !!C.parseDays('1.5').error, true); eq('days 2000', !!C.parseDays('2000').error, true);

    // dates and claim years
    eq('isDay 31 Feb', C.isDay('2026-02-31'), false); eq('isDay leap', C.isDay('2028-02-29'), true); eq('addDays 90', C.addDays('2026-10-05', 90), '2027-01-03');
    eq('year Jul (Oct)', C.claimYear('2026-10-27', 7), ['2026-07-01', '2027-06-30']); eq('year Jul (Mar)', C.claimYear('2026-03-05', 7), ['2025-07-01', '2026-06-30']);
    eq('year Jan', C.claimYear('2026-10-27', 1), ['2026-01-01', '2026-12-31']); eq('year Apr on 1 Apr', C.claimYear('2026-04-01', 4), ['2026-04-01', '2027-03-31']);
    eq('year Apr on 31 Mar', C.claimYear('2026-03-31', 4), ['2025-04-01', '2026-03-31']); eq('year Mar leap', C.claimYear('2028-02-29', 3), ['2027-03-01', '2028-02-29']);

    // sharing a refund to the cent
    eq('share 1.00 in 3', C.share(100, [1, 1, 1]), [34, 33, 33]); eq('share 5400 of 4800+1800', C.share(540000, [480000, 180000]), [392727, 147273]);
    eq('share 0', C.share(0, [5, 7]), [0, 0]); eq('share no weights', C.share(5, [0, 0]), [5, 0]); eq('share sums', C.share(99999, [3, 7, 11, 13]).reduce((a, b) => a + b, 0), 99999);

    // the main situation: Usman's family, employer pays back within 90 days, 60,000 a year from July; today 27 Oct 2026
    const T = '2026-10-27';
    const S = () => C.cleanState({ cur: 'Rs', payers: [{ id: 'p1', name: 'Employer', days: 90, limit: 6000000, per: 'family', start: 7 }], bills: [
        { id: 'b1', d: '2026-07-14', who: 'Me', kind: 'Doctor', amt: 250000 }, { id: 'b2', d: '2026-07-14', who: 'Me', kind: 'Medicine', amt: 135050 },
        { id: 'b3', d: '2026-08-02', who: 'Mother', kind: 'Lab test', amt: 480000, place: 'City Lab' }, { id: 'b4', d: '2026-08-20', who: 'Ali', kind: 'Doctor', amt: 180000 },
        { id: 'b5', d: '2026-09-12', who: 'Mother', kind: 'Hospital', amt: 3500000 }, { id: 'b6', d: '2026-10-05', who: 'Sara', kind: 'Medicine', amt: 86000 },
        { id: 'b7', d: '2026-10-20', who: 'Mother', kind: 'Lab test', amt: 320000 }, { id: 'b8', d: '2026-06-10', who: 'Father', kind: 'Doctor', amt: 300000 }], claims: [
        { id: 'c1', payer: 'p1', d: '2026-07-20', st: 'paid', got: 385050, pd: '2026-08-05', items: [{ b: 'b1', a: 250000 }, { b: 'b2', a: 135050 }] },
        { id: 'c2', payer: 'p1', d: '2026-08-25', st: 'paid', got: 540000, pd: '2026-09-15', items: [{ b: 'b3', a: 480000 }, { b: 'b4', a: 180000 }] },
        { id: 'c3', payer: 'p1', d: '2026-09-30', st: 'wait', ref: 'HR-2231', items: [{ b: 'b5', a: 3500000 }] },
        { id: 'c4', payer: 'p1', d: '2026-10-01', st: 'rej', why: 'Receipt not stamped', pd: '2026-10-15', items: [{ b: 'b6', a: 86000 }] },
        { id: 'c5', payer: 'p1', d: '2026-06-15', st: 'paid', got: 300000, pd: '2026-07-01', items: [{ b: 'b8', a: 300000 }] }] });
    let s = S(), a = C.analyse(s, T);
    const bx = id => a.bills.find(x => x.bill.id === id);
    eq('state kept everything', [s.bills.length, s.claims.length], [8, 5]);
    eq('still to claim: Sara medicine (rejected) and Mother lab', a.todo.map(x => x.bill.id), ['b6', 'b7']);
    eq('still to claim total 4,060', a.openTotal, 406000);
    eq('Sara: claim by 3 Jan, in 68 days', [bx('b6').claimBy, bx('b6').left, bx('b6').urgency], ['2027-01-03', 68, 'ok']);
    eq('Sara: the rejection is kept', bx('b6').rejected, [{ d: '2026-10-01', why: 'Receipt not stamped', payer: 'p1' }]);
    eq('Mother lab: claim by 18 Jan', [bx('b7').claimBy, bx('b7').left], ['2027-01-18', 83]);
    eq('waiting: 35,000, sent 27 days ago', [a.waitTotal, a.waiting.length, a.waiting[0].age], [3500000, 1, 27]);
    eq('part refund: 1,200 not refunded', a.claims.find(c => c.claim.id === 'c2').short, 120000);
    eq('part refund shared to the cent', [bx('b3').refunded, bx('b4').refunded], [392727, 147273]);
    eq('statuses', a.bills.map(x => x.status), ['paid', 'paid', 'paid', 'paid', 'wait', 'todo', 'todo', 'paid']);
    eq('totals: spent 52,510.50, refunded 12,250.50', [a.spentTotal, a.refundedTotal], [5251050, 1225050]);
    eq('the four tiles add up (not refunded 1,200)', a.spentTotal - a.refundedTotal - a.waitTotal - a.openTotal, 120000);
    const y = a.years[0];
    eq('claim year Jul to Jun', [y.from, y.to], ['2026-07-01', '2027-06-30']);
    eq('year: refunded 9,250.50 (June bill left out), waiting 35,000', [y.refunded, y.waiting, y.used], [925050, 3500000, 4425050]);
    eq('year: 15,749.50 left of 60,000', y.left, 1574950);
    eq('history newest first', a.done.map(c => c.claim.id), ['c4', 'c2', 'c1', 'c5']);
    eq('people', a.people.map(q => [q.who, q.spent, q.refunded, q.waiting, q.open]), [['Ali', 180000, 147273, 0, 0], ['Father', 300000, 300000, 0, 0], ['Me', 385050, 385050, 0, 0],
        ['Mother', 4300000, 392727, 3500000, 320000], ['Sara', 86000, 0, 0, 86000]]);

    // per-person limit of 30,000
    s = S(); s.payers[0].per = 'person'; s.payers[0].limit = 3000000; a = C.analyse(s, T);
    eq('per person: Mother over by 8,927.27', a.years[0].perPerson.map(q => [q.who, q.used, q.left]), [['Ali', 147273, 2852727], ['Me', 385050, 2614950], ['Mother', 3892727, -892727]]);

    // claim the rest of the part refund somewhere else
    s = S(); s.claims[1].rest = true; s = C.cleanState(s); a = C.analyse(s, T);
    eq('rest: bills back with 872.73 and 327.27', [bx('b3') && a.bills.find(x => x.bill.id === 'b3').open, a.bills.find(x => x.bill.id === 'b4').open], [87273, 32727]);
    eq('rest: still to claim 5,260', a.openTotal, 526000);
    eq('rest: nothing left as not refunded', a.spentTotal - a.refundedTotal - a.waitTotal - a.openTotal, 0);
    eq('rest: open on b3 matches openWithout', C.openWithout(s, 'b3', null), 87273);
    eq('rest only kept when something is short', C.cleanState(Object.assign(S(), { claims: [Object.assign({}, S().claims[0], { rest: true })] })).claims[0].rest, undefined);

    // a bill past the time limit, and one close to it
    s = S(); s.bills.push({ id: 'b9', d: '2026-07-01', who: 'Me', kind: 'Dentist', amt: 500000, payer: 'p1' }, { id: 'b10', d: '2026-08-05', who: 'Ali', kind: 'Eyes', amt: 450000, payer: 'p1' }); a = C.analyse(s, T);
    const b9 = a.bills.find(x => x.bill.id === 'b9'), b10 = a.bills.find(x => x.bill.id === 'b10');
    eq('past the limit: was 29 Sep, 28 days ago', [b9.claimBy, b9.left, b9.urgency], ['2026-09-29', -28, 'late']);
    eq('within 14 days: 3 Nov, in 7 days', [b10.claimBy, b10.left, b10.urgency], ['2026-11-03', 7, 'soon']);
    eq('late first in the list', a.todo.map(x => x.bill.id), ['b9', 'b10', 'b6', 'b7']);
    eq('not claiming: off the list', (s.bills[8].skip = true, C.analyse(s, T).todo.map(x => x.bill.id)), ['b10', 'b6', 'b7']);
    eq('no time limit: no date', (s.payers[0].days = null, C.analyse(s, T).todo.map(x => [x.claimBy, x.urgency])), [[null, 'none'], [null, 'none'], [null, 'none']]);

    // a bill claimed in part, the rest still to claim
    s = S(); s.claims.push({ id: 'c6', payer: 'p1', d: '2026-10-25', st: 'wait', items: [{ b: 'b7', a: 200000 }] }); s = C.cleanState(s); a = C.analyse(s, T);
    const b7 = a.bills.find(x => x.bill.id === 'b7');
    eq('part claimed: 1,200 still to claim, 2,000 waiting', [b7.open, b7.waiting, b7.status], [120000, 200000, 'todo']);
    eq('openWithout skips the claim being edited', C.openWithout(s, 'b7', 'c6'), 320000);

    // empty and first use
    a = C.analyse(C.emptyState(), T);
    eq('empty', [a.todo.length, a.openTotal, a.waitTotal, a.spentTotal, a.people.length, a.years[0].used], [0, 0, 0, 0, 0, 0]);
    eq('default place', C.emptyState().payers, [{ id: 'p1', name: 'My employer', days: null, limit: null, per: 'family', start: 1 }]);

    // saved data that is broken or tampered with
    eq('not an object', C.cleanState('x'), null); eq('no lists', C.cleanState({ bills: [] }), null);
    const bad = C.cleanState({ payers: [], bills: [{ id: 'x', d: '2026-02-31', who: 'A', amt: 100 }, { id: 'y', d: '2026-01-01', who: '', amt: 100 }, { id: 'z', d: '2026-01-01', who: 'A', amt: -5 },
        { id: 'ok', d: '2026-01-01', who: 'A'.repeat(90), kind: 'Magic', amt: 100, payer: 'nope' }, { id: 'ok', d: '2026-01-02', who: 'B', amt: 100 }],
        claims: [{ id: 'k1', d: '2026-01-05', items: [{ b: 'gone', a: 100 }] }, { id: 'k2', d: '2026-01-05', st: 'paid', got: 500, items: [{ b: 'ok', a: 100 }] },
            { id: 'k3', d: '2026-01-05', st: 'paid', got: 50, pd: '2025-01-01', items: [{ b: 'ok', a: 100 }, { b: 'ok', a: 100 }] }] });
    eq('bad bills dropped, duplicates dropped, names cut, unknown kind is Other', bad.bills.map(b => [b.id, b.who.length, b.kind, b.payer]), [['ok', 40, 'Other', 'p1']]);
    eq('bad claims dropped; refund date before sending fixed', bad.claims.map(c => [c.id, c.items.length, c.got, c.pd]), [['k3', 1, 50, '2026-01-05']]);
    eq('no places: default added', bad.payers[0].name, 'My employer');

    // spreadsheet and calendar
    s = S(); s.bills[0].note = '=HYPERLINK("x")'; a = C.analyse(s, T);
    const csv = C.csv(s, a, 'Rs', 'en-GB').split('\r\n');
    eq('csv header', csv[0].split(',')[0], '"Bill date"');
    eq('csv first row (oldest bill)', csv[1], '"2026-06-10","Father","Doctor","","3000.00","Employer","Refunded","2026-06-15","","3000.00","0.00","0.00","0.00",""');
    eq('csv formula defused', csv.find(r => r.includes('HYPERLINK')).endsWith('"\'=HYPERLINK(""x"")"'), true);
    const ics = C.ics('2027-01-03', 'Claim, now', 'a;b', '20261027T100000Z');
    eq('ics day and escaping', [ics.includes('DTSTART;VALUE=DATE:20270103'), ics.includes('DTEND;VALUE=DATE:20270104'), ics.includes('SUMMARY:Claim\\, now'), ics.includes('DESCRIPTION:a\\;b')], [true, true, true, true]);

    // words
    eq('money', [C.fmtMoney(135050, '', 'en-US'), C.fmtMoney(250000, 'Rs', 'en-US'), C.fmtMoney(250000, '$', 'en-US'), C.fmtMoney(-120000, '', 'en-US')], ['1,350.50', 'Rs 2,500', '$2,500', '-1,200']);
    eq('inDays', [C.inDays(0), C.inDays(1), C.inDays(68), C.inDays(-28)], ['today', 'tomorrow', 'in 68 days', '28 days ago']);

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n') + '\n\n' + summary;
    else { out.filter(l => l.startsWith('FAIL')).forEach(l => console.log(l)); console.log(summary); if (fail) process.exitCode = 1; }
})();
