// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const M = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.MLB;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const L = 'en-GB', T = '2026-10-14';
    const c = s => M.parseAmount(s).cents, err = s => !!M.parseAmount(s).error;

    // typed amounts
    eq('5000', c('5000'), 500000); eq('5,000', c('5,000'), 500000); eq('5.000 (dot thousands)', c('5.000'), 500000); eq('5 000', c('5 000'), 500000);
    eq('1,00,000 (lakh)', c('1,00,000'), 10000000); eq('12,34,567', c('12,34,567'), 123456700);
    eq('12.50', c('12.50'), 1250); eq('12,50 (comma decimal)', c('12,50'), 1250); eq('12.5', c('12.5'), 1250); eq('0.99', c('0.99'), 99); eq('.5', c('.5'), 50); eq('5.', c('5.'), 500);
    eq('1,234.56', c('1,234.56'), 123456); eq('1.234,56', c('1.234,56'), 123456); eq('1 500,50', c('1 500,50'), 150050); eq('1,234,567', c('1,234,567'), 123456700);
    eq('$40', c('$40'), 4000); eq('Rs 1500', c('Rs 1500'), 150000); eq('1500 rs', c('1500 rs'), 150000); eq('€ 12,50', c('€ 12,50'), 1250); eq('+20', c('+20'), 2000); eq('  007 ', c('  007 '), 700);
    eq('0.500 is 3 decimals', err('0.500'), true); eq('blank', err(''), true); eq('spaces', err('   '), true); eq('zero', err('0'), true); eq('0.00', err('0.00'), true);
    eq('negative', err('-50'), true); eq('negative message mentions paid back', /paid me back/.test(M.parseAmount('-50').error), true);
    eq('words', err('fifty'), true); eq('12.345 is dot thousands', c('12.345'), 1234500); eq('1,2,3', err('1,2,3'), true); eq('12,34', c('12,34'), 1234); eq('1.2.3', err('1.2.3'), true);
    eq('max', c('9999999999.99'), 999999999999); eq('too big', err('10000000000'), true); eq('huge', err('99999999999999999999'), true); eq('5e3', err('5e3'), true);
    eq('pasted with nbsp', c('2 500'), 250000);

    // formatting
    eq('fmt whole', M.fmt(350000, '', L), '3,500'); eq('fmt cents', M.fmt(1250, '', L), '12.50'); eq('fmt $', M.fmt(350000, '$', L), '$3,500'); eq('fmt Rs', M.fmt(350000, 'Rs', L), 'Rs 3,500');
    eq('fmt negative shows size only', M.fmt(-50000, '', L), '500'); eq('fmt en-IN lakh', M.fmt(10000000, '₹', 'en-IN'), '₹1,00,000');

    // the README situation: Ali and Bilal
    const bilal = { id: 'b', name: 'Bilal', cur: null, entries: [
        { id: '1', kind: 'lent', amount: 500000, date: '2026-10-03', seq: 1, note: 'for the rent', due: '2026-10-31' },
        { id: '2', kind: 'repaid', amount: 150000, date: '2026-10-10', seq: 2, note: '' }] };
    let s = M.personSummary(bilal, T);
    eq('Bilal balance', s.balance, 350000); eq('Bilal words', M.balanceWords('Bilal', s.balance, '', L), 'Bilal owes you 3,500');
    eq('Bilal due', [s.due, s.daysLeft, s.overdue], ['2026-10-31', 17, false]);
    eq('Bilal due words', M.dueWords(s, T, L), 'Pay back by 31 Oct (17 days left)');
    eq('Bilal reminder', M.reminderText({ cur: '' }, bilal, T, L),
        'Hi Bilal, just a friendly reminder about the 3,500 you still owe me (5,000 I lent you on 3 Oct (for the rent), 1,500 you paid back on 10 Oct). Could you pay it back by 31 Oct? Thanks!');
    const sara = { id: 's', name: 'Sara Ahmed', cur: null, entries: [{ id: '3', kind: 'borrowed', amount: 200000, date: '2026-10-01', seq: 3, note: '' }] };
    s = M.personSummary(sara, T);
    eq('Sara balance', s.balance, -200000); eq('Sara words', M.balanceWords('Sara Ahmed', s.balance, '', L), 'You owe Sara Ahmed 2,000');
    eq('Sara note uses first name', M.reminderText({ cur: '' }, sara, T, L), 'Hi Sara, just so we both have the same note: I owe you 2,000 (2,000 I borrowed on 1 Oct). I will pay it back soon. Thanks!');

    // both directions with the same person, net balance
    const omar = { id: 'o', name: 'Omar', cur: null, entries: [
        { id: 'a', kind: 'lent', amount: 500000, date: '2026-09-01', seq: 1 }, { id: 'b', kind: 'borrowed', amount: 100000, date: '2026-09-05', seq: 2 }] };
    eq('net both ways', M.personSummary(omar, T).balance, 400000);
    omar.entries.push({ id: 'c', kind: 'paid', amount: 100000, date: '2026-09-06', seq: 3 });
    eq('I paid back adds to what they owe', M.personSummary(omar, T).balance, 500000);

    // over-payment flips the box
    const zed = { id: 'z', name: 'Zed', cur: null, entries: [{ id: 'a', kind: 'lent', amount: 100000, date: '2026-10-01', seq: 1 }, { id: 'b', kind: 'repaid', amount: 150000, date: '2026-10-02', seq: 2 }] };
    eq('over-payment', M.balanceWords('Zed', M.personSummary(zed, T).balance, '', L), 'You owe Zed 500');

    // odd cents: three part repayments of 33.33 on 100.00 leave 0.01
    const tiny = { id: 't', name: 'T', cur: null, entries: [{ id: 'a', kind: 'lent', amount: 10000, date: '2026-10-01', seq: 1 }] };
    [2, 3, 4].forEach(i => tiny.entries.push({ id: 'r' + i, kind: 'repaid', amount: 3333, date: '2026-10-0' + i, seq: i }));
    eq('odd cents exact', M.fmt(M.personSummary(tiny, T).balance, '', L), '0.01');
    tiny.entries.push({ id: 'r5', kind: 'repaid', amount: 1, date: '2026-10-05', seq: 5 });
    eq('settled exactly', M.personSummary(tiny, T).balance, 0);
    eq('settled words', M.balanceWords('T', 0, '', L), 'You and T are settled up');

    // pay-back-by dates
    const late = { id: 'l', name: 'Late', cur: null, entries: [{ id: 'a', kind: 'lent', amount: 1000, date: '2026-10-01', seq: 1, due: '2026-10-11' }] };
    s = M.personSummary(late, T); eq('late', [s.overdue, s.daysLeft], [true, -3]); eq('late words', M.dueWords(s, T, L), 'Pay back by 11 Oct (3 days late)');
    eq('late reminder', /It was due back on 11 Oct\./.test(M.reminderText({ cur: '' }, late, T, L)), true);
    late.entries.push({ id: 'b', kind: 'repaid', amount: 1000, date: '2026-10-12', seq: 2 });
    eq('paid off: due date gone', M.personSummary(late, T).due, '');
    late.entries.push({ id: 'c', kind: 'lent', amount: 500, date: '2026-10-13', seq: 3 });
    eq('new loan after settling: old due not used', M.personSummary(late, T).due, '');
    eq('due today', M.dueWords(M.personSummary({ entries: [{ kind: 'lent', amount: 1, date: T, seq: 1, due: T }] }, T), T, L), 'Pay back by 14 Oct (today)');
    eq('due tomorrow', M.dueWords(M.personSummary({ entries: [{ kind: 'lent', amount: 1, date: T, seq: 1, due: '2026-10-15' }] }, T), T, L), 'Pay back by 15 Oct (tomorrow)');
    eq('due 1 day late singular', M.dueWords(M.personSummary({ entries: [{ kind: 'lent', amount: 1, date: '2026-10-01', seq: 1, due: '2026-10-13' }] }, T), T, L), 'Pay back by 13 Oct (1 day late)');
    eq('my own due', M.dueWords(M.personSummary({ entries: [{ kind: 'borrowed', amount: 1, date: '2026-10-01', seq: 1, due: '2026-12-01' }] }, T), T, L), 'You said you would pay back by 1 Dec (48 days left)');
    eq('due across year end', M.dueWords(M.personSummary({ entries: [{ kind: 'lent', amount: 1, date: '2026-12-30', seq: 1, due: '2027-01-02' }] }, '2026-12-31'), '2026-12-31', L), 'Pay back by 2 Jan 2027 (2 days left)');
    eq('same-day order uses seq', M.personSummary({ entries: [{ kind: 'repaid', amount: 5, date: T, seq: 2 }, { kind: 'lent', amount: 5, date: T, seq: 1, due: '2026-10-20' }] }, T).rows.map(r => r.after), [5, 0]);

    // totals by currency, never added together
    const st = { cur: 'Rs', sort: 'owed', people: [bilal, sara, omar, Object.assign({}, zed), { id: 'u', name: 'Uncle Joe', cur: '$', entries: [{ id: 'x', kind: 'lent', amount: 5000, date: '2026-10-01', seq: 9 }] }, { id: 'e', name: 'Empty', cur: null, entries: [] }] };
    const t = M.totals(st, T);
    eq('to me by currency', t.toMe, [{ cur: 'Rs', cents: 850000 }, { cur: '$', cents: 5000 }]);
    eq('I owe', t.iOwe, [{ cur: 'Rs', cents: 250000 }]);
    eq('counts', [t.nToMe, t.nIOwe, t.nSettled], [3, 2, 1]);
    eq('money list', M.moneyList(t.toMe, L), 'Rs 8,500 + $50');
    eq('sort owed', M.sortPeople(st, 'owed', T).map(p => p.name), ['Omar', 'Bilal', 'Sara Ahmed', 'Zed', 'Uncle Joe', 'Empty']);
    eq('sort name', M.sortPeople(st, 'name', T).map(p => p.name), ['Bilal', 'Empty', 'Omar', 'Sara Ahmed', 'Uncle Joe', 'Zed']);
    eq('sort recent', M.sortPeople(st, 'recent', T).map(p => p.name)[0], 'Bilal');
    eq('summary text first lines', M.summaryText(st, T, L).split('\n').slice(0, 3), ['Money lent and borrowed, 14 Oct 2026', 'Owed to you: Rs 8,500 + $50 from 3 people', 'You owe: Rs 2,500 to 2 people']);
    eq('statement', M.statementText(st, bilal, T, L).split('\n'), ['Money with Bilal', 'Bilal owes you Rs 3,500.', 'Pay back by 31 Oct (17 days left).', '',
        '3 Oct: You lent Rs 5,000 (for the rent). After this: owes you Rs 5,000.', '10 Oct: They paid you back Rs 1,500. After this: owes you Rs 3,500.']);

    // names
    eq('clean name', M.cleanName('  Ali   Khan '), 'Ali Khan'); eq('same name any case', M.sameName('ali khan', 'Ali  Khan'), true); eq('long name cut', M.cleanName('x'.repeat(99)).length, 60);

    // saved and restored data is checked
    eq('normalize junk', M.normalize('x'), null); eq('normalize no people', M.normalize({}), null); eq('normalize empty', M.normalize({ people: [] }).people, []);
    const n = M.normalize({ cur: 'BAD', sort: 'zzz', people: [null, { name: '' }, { id: 'a', name: 'Ali', cur: '£', entries: [
        { kind: 'lent', amount: 100, date: '2026-10-01', due: '2026-09-01' }, { kind: 'lent', amount: -5, date: '2026-10-01' }, { kind: 'nope', amount: 5, date: '2026-10-01' },
        { kind: 'repaid', amount: 1.5, date: '2026-10-01' }, { kind: 'repaid', amount: 50, date: '2026-02-30' }, { kind: 'borrowed', amount: 50, date: '2026-10-02', note: '<b>x</b>', due: '2026-11-01' }] },
        { name: 'ALI', entries: [] }, { name: 'Ben', cur: 'XYZ' }] });
    eq('normalize keeps good people', n.people.map(p => p.name), ['Ali', 'Ben']);
    eq('normalize defaults', [n.cur, n.sort, n.people[1].cur], ['', 'owed', null]);
    eq('normalize entries', n.people[0].entries.map(e => [e.kind, e.amount, e.due || '']), [['lent', 100, ''], ['borrowed', 50, '2026-11-01']]);
    eq('note kept as plain text', n.people[0].entries[1].note, '<b>x</b>');
    eq('seq continues', n.seq >= 2, true);

    eq('isDay', [M.isDay('2026-02-29'), M.isDay('2028-02-29'), M.isDay('2026-13-01'), M.isDay('x')], [false, true, false, false]);
    eq('daysBetween over summer time', M.daysBetween('2026-03-28', '2026-03-30'), 2);

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n') + '\n\n' + summary;
    else { console.log(out.filter(l => l.startsWith('FAIL')).join('\n')); console.log(summary); if (fail) process.exitCode = 1; }
})();
