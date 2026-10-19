// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.CRT;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const L = 'en-GB', T = '2026-10-19';
    const c = s => C.parseAmount(s).cents, err = s => !!C.parseAmount(s).error;

    // typed amounts
    eq('10000', c('10000'), 1000000); eq('10,000', c('10,000'), 1000000); eq('1,00,000 lakh', c('1,00,000'), 10000000); eq('Rs 5000', c('Rs 5000'), 500000);
    eq('12.50', c('12.50'), 1250); eq('12,50', c('12,50'), 1250); eq('pasted nbsp', c('2 500'), 250000);
    eq('blank', err(''), true); eq('zero', err('0'), true); eq('negative', err('-10'), true); eq('words', err('ten'), true); eq('3 decimals', err('0.505'), true);
    eq('max ok', c('100000000'), 10000000000); eq('too big', err('100000001'), true); eq('huge', err('99999999999999'), true);

    // dates
    eq('31 Jan + 1 month', C.addMonths('2027-01-31', 1), '2027-02-28'); eq('31 Jan + 2 months', C.addMonths('2027-01-31', 2), '2027-03-31');
    eq('leap year', C.addMonths('2028-01-31', 1), '2028-02-29'); eq('Dec to Jan', C.addMonths('2026-12-05', 1), '2027-01-05'); eq('+13 months', C.addMonths('2026-08-05', 13), '2027-09-05');
    eq('days across clock change', C.addDays('2026-10-20', 14), '2026-11-03'); eq('daysBetween', C.daysBetween('2026-10-19', '2026-11-05'), 17);
    eq('isDay bad', C.isDay('2026-02-30'), false); eq('isDay ok', C.isDay('2026-02-28'), true);

    // the README situation: 9 members, Imran has 2 shares, 10,000 a month from 5 Aug 2026
    function office() {
        const names = ['Ali', 'Bilal', 'Sara', 'Hina', 'Usman', 'Ayesha', 'Hamza', 'Zainab', 'Imran'];
        const k = C.newCommittee('c1', T); k.name = 'Office'; k.amount = 1000000; k.start = '2026-08-05';
        k.members = names.map((n, i) => ({ id: 'm' + i, name: n, shares: n === 'Imran' ? 2 : 1, phone: '' }));
        return C.syncOrder(k);
    }
    let k = office();
    eq('rounds = shares', C.rounds(k), 10); eq('pot', C.pot(k), 10000000); eq('Imran twice at the end', k.order.slice(-2), ['m8', 'm8']);
    eq('round 3 date', C.roundDate(k, 2), '2026-10-05'); eq('last round', C.roundDate(k, 9), '2027-05-05');
    eq('round name', C.roundName(k, 2, L), 'Round 3 of 10 (October 2026)');
    eq('current round 19 Oct', C.currentRound(k, T).r, 2); eq('on the date', C.currentRound(k, '2026-11-05').r, 3); eq('day before', C.currentRound(k, '2026-11-04').r, 2);
    eq('before start', C.currentRound(k, '2026-08-01'), { r: 0, started: false, ended: false, days: 4 }); eq('far future stays last', C.currentRound(k, '2030-01-01').r, 9);

    // payments in round 3: everyone paid but Sara, Ali; Hina half
    k.paid[2] = {}; ['m1', 'm4', 'm5', 'm6', 'm7'].forEach(id => { k.paid[2][id] = { c: 1000000, d: '2026-10-06' }; });
    k.paid[2].m8 = { c: 2000000, d: '2026-10-05' }; k.paid[2].m3 = { c: 500000, d: '2026-10-07' };
    let s = C.roundStatus(k, 2);
    eq('taker round 3', s.taker.name, 'Sara'); eq('paid count', s.paidCount, 6); eq('members', s.memberCount, 9);
    eq('paid cents', s.paidCents, 7500000); eq('due cents', s.dueCents, 10000000); eq('left', s.leftCents, 2500000);
    eq('unpaid', s.unpaid.map(u => [u.m.name, u.left]), [['Ali', 1000000], ['Sara', 1000000], ['Hina', 500000]]);
    eq('headline', C.headline(k, 2, 'Rs', L), 'Sara takes Rs 100,000');
    eq('group text', C.roundText(k, 2, 'Rs', T, L), 'Office: Round 3 of 10 (October 2026)\nSara takes the pot of Rs 100,000 this round.\nPaid: 6 of 9 (Rs 75,000 of Rs 100,000).\n\nStill to pay:\n- Ali: Rs 10,000\n- Sara: Rs 10,000\n- Hina: Rs 5,000 (paid Rs 5,000 of Rs 10,000)\n\nIt was due on 5 Oct 2026. Please pay as soon as you can. Thank you!');
    eq('group text before date', /Please pay by 5 Oct 2026\./.test(C.roundText(k, 2, '', '2026-10-01', L)), true);
    // earlier rounds: everyone paid in rounds 1 and 2 except Hina in round 2
    [0, 1].forEach(r => { k.paid[r] = {}; k.members.forEach(m => { if (!(r === 1 && m.id === 'm3')) k.paid[r][m.id] = { c: C.dueOf(k, m), d: '' }; }); });
    k.handed[0] = 'm0'; k.handed[1] = 'm1';
    const hina = k.members[3]; let ms = C.memberSummary(k, hina, T);
    eq('Hina owes', ms.owedCents, 1500000); eq('Hina owed rounds', ms.owed.map(o => [o.r, o.left, o.part]), [[1, 1000000, false], [2, 500000, true]]);
    eq('Hina turn', ms.turns, [3]); eq('Hina paid', ms.paidTotal, 1500000); eq('Hina total due', ms.totalDue, 10000000);
    eq('Hina reminder', C.memberText(k, hina, '', T, L), 'Hi Hina, a reminder for the Office committee: you have 15,000 still to pay (10,000 for round 2, 5 Sept 2026; 5,000 for round 3, 5 Oct 2026). Your turn to take the pot of 100,000: round 4 (5 Nov 2026). Thank you!');
    const imran = k.members[8]; ms = C.memberSummary(k, imran, T);
    eq('Imran 2 shares due', ms.due, 2000000); eq('Imran turns', ms.turns, [8, 9]); eq('Imran owes nothing', ms.owedCents, 0); eq('Imran full rounds', ms.fullRounds, 3);
    eq('Ali took the pot', C.memberSummary(k, k.members[0], T).received, 1);
    eq('Imran text two turns', /round 9 \(5 Apr 2027\) and round 10 \(5 May 2027\)/.test(C.memberText(k, imran, '', T, L)), true);
    eq('paid up text', /you are paid up so far/.test(C.memberText(k, imran, '', T, L)), true);

    // turn order: moves and the random draw
    eq('cannot move a handed round', C.move(k, 1, 1), false); eq('cannot move into a handed round', C.move(k, 2, -1), false);
    eq('move works', C.move(k, 2, 1), true); eq('Sara now round 4', k.order.slice(0, 4), ['m0', 'm1', 'm3', 'm2']);
    eq('move off the end', C.move(k, 9, 1), false);
    let seq = [0.1, 0.9, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4], q = 0;
    const before = k.order.slice(); const moved = C.draw(k, () => seq[q++ % seq.length]);
    eq('draw moves only free turns', moved, 8); eq('handed stay', k.order.slice(0, 2), ['m0', 'm1']);
    eq('draw is a shuffle of the same turns', k.order.slice().sort(), before.slice().sort());

    // members change: shares up/down, delete, new member
    k = office(); k.handed[0] = 'm0';
    k.members[8].shares = 1; C.syncOrder(k); eq('shares down removes the last free turn', [C.rounds(k), k.order.filter(x => x === 'm8').length], [9, 1]);
    k.members[1].shares = 3; C.syncOrder(k); eq('shares up adds turns at the end', k.order.slice(-2), ['m1', 'm1']);
    k.paid[1] = { m2: { c: 1000000, d: '' } };
    k.members = k.members.filter(m => m.id !== 'm2'); C.syncOrder(k);
    eq('deleted member gone from order', k.order.includes('m2'), false); eq('their payments gone', k.paid[1], {}); eq('handed round kept', [k.order[0], k.handed[0]], ['m0', 'm0']);
    eq('handedCount', C.handedCount(k, 'm0'), 1);
    k = office(); k.handed[3] = 'm3'; k.members = k.members.filter(m => m.id !== 'm1'); C.syncOrder(k);
    eq('locked round 4 stays at round 4 after an earlier member leaves', [k.order[3], k.handed[3]], ['m3', 'm3']);
    eq('turn count matches shares', k.order.length, C.totalShares(k));

    // finished committee
    k = office(); for (let r = 0; r < 10; r++) { k.paid[r] = {}; k.members.forEach(m => { k.paid[r][m.id] = { c: C.dueOf(k, m), d: '' }; }); k.handed[r] = k.order[r]; }
    eq('ended', C.currentRound(k, '2027-06-01').ended, true); delete k.handed[9]; eq('not ended until last pot handed', C.currentRound(k, '2027-06-01').ended, false);

    // weekly and every 2 weeks
    k = office(); k.freq = 'week'; eq('weekly round 3', C.roundDate(k, 2), '2026-08-19'); k.freq = '2week'; eq('2-week round 3', C.roundDate(k, 2), '2026-09-02');
    eq('weekly name uses the date', C.roundName(k, 0, L), 'Round 1 of 10 (5 Aug 2026)');

    // over-payment never counts more than due
    k = office(); k.paid[0] = { m0: { c: 9000000, d: '' } }; eq('over-payment capped', C.roundStatus(k, 0).paidCents, 1000000);

    // phone numbers and WhatsApp
    eq('phone ok', C.cleanPhone('+92 300 123-4567').phone, '+923001234567'); eq('phone blank', C.cleanPhone('  ').phone, ''); eq('phone letters', !!C.cleanPhone('call me').error, true);
    eq('phone short', !!C.cleanPhone('123').error, true); eq('wa link', C.waLink('+923001234567', 'Hi & bye'), 'https://wa.me/923001234567?text=Hi%20%26%20bye'); eq('wa group link', C.waLink('', 'x'), 'https://wa.me/?text=x');

    // saved or restored data is checked
    eq('null', C.normalize(null, T), null); eq('array', C.normalize([], T), null); eq('no committees', C.normalize({ committees: 'x' }, T), null);
    let bad = C.normalize({ cur: 'BAD', active: 'nope', committees: [null, 5, { id: 'bad id!' }, { id: 'c1', name: '  Family  ', amount: -5, freq: 'yearly', start: '2026-13-01',
        members: [{ id: 'a', name: 'Ali', shares: 9 }, { id: 'b', name: 'ali' }, { id: 'a', name: 'Dup id' }, { id: 'c', name: '' }, { id: 'd', name: 'Sara', shares: 2, phone: 'zzz' }],
        order: ['zz', 'd', 'a'], handed: { 0: 'd', 1: 'd', x: 'a' }, paid: { 0: { a: { c: -5 }, d: { c: 2000000, d: 'nope' } }, y: {} } }, { id: 'c1', name: 'dup' }] }, T);
    const bc = bad.committees[0];
    eq('bad currency dropped', bad.cur, ''); eq('one committee', bad.committees.length, 1); eq('active falls back', bad.active, 'c1');
    eq('name trimmed', bc.name, 'Family'); eq('bad amount', bc.amount, 0); eq('bad freq', bc.freq, 'month'); eq('bad start is today', bc.start, T);
    eq('members kept', bc.members.map(m => [m.name, m.shares, m.phone]), [['Ali', 1, ''], ['Sara', 2, '']]);
    eq('order fixed', bc.order, ['d', 'a', 'd']); eq('handed must match its turn', bc.handed, { 0: 'd' });
    eq('paid checked', bc.paid, { 0: { d: { c: 2000000, d: '' } } });
    eq('valid state round-trips', JSON.stringify(C.normalize(JSON.parse(JSON.stringify({ v: 1, cur: 'Rs', active: 'c1', committees: [office()] })), T).committees[0]), JSON.stringify(office()));

    // formatting
    eq('fmt Rs', C.fmt(10000000, 'Rs', L), 'Rs 100,000'); eq('fmt $', C.fmt(1250, '$', L), '$12.50'); eq('fmt lakh', C.fmt(10000000, '₹', 'en-IN'), '₹1,00,000');

    out.push('', pass + ' passed, ' + fail + ' failed');
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n');
    else { console.log(out.filter(l => !l.startsWith('PASS')).join('\n')); console.log(pass + ' checks'); if (fail) process.exitCode = 1; }
})();
