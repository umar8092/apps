// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const M = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.PMC;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const L = 'en-GB', T = '2026-10-17'; // Saturday
    const c = (s, o) => M.parseAmount(s, o).cents, err = (s, o) => !!M.parseAmount(s, o).error;

    // typed amounts
    eq('5', c('5'), 500); eq('2.50', c('2.50'), 250); eq('2,50 comma decimal', c('2,50'), 250); eq('.5', c('.5'), 50); eq('1,500', c('1,500'), 150000); eq('1 500', c('1 500'), 150000);
    eq('$5', c('$5'), 500); eq('Rs 150', c('Rs 150'), 15000); eq('+3', c('+3'), 300); eq('pasted nbsp', c('1 500'), 150000);
    eq('blank is an error', err(''), true); eq('blank allowed as 0 for pocket money', c('', { blank: 0, zero: true }), 0); eq('spaces allowed as 0', c('   ', { blank: 0, zero: true }), 0);
    eq('zero refused for money', err('0'), true); eq('zero allowed for a chore', c('0', { zero: true }), 0);
    eq('negative refused', err('-5'), true); eq('words refused', err('five'), true); eq('3 decimals refused', err('0.505'), true);
    eq('max', c('9999999.99'), 999999999); eq('too big', err('10000000'), true); eq('huge', err('123456789012345'), true); eq('5e3 refused', err('5e3'), true);

    // formatting
    eq('fmt whole', M.fmt(500, '', L), '5'); eq('fmt cents', M.fmt(250, '', L), '2.50'); eq('fmt £', M.fmt(1250, '£', L), '£12.50'); eq('fmt Rs', M.fmt(150000, 'Rs', L), 'Rs 1,500');
    eq('plain amount', [M.plainAmount(250), M.plainAmount(500), M.plainAmount(150000)], ['2.50', '5', '1500']);

    eq('bad browser language falls back', [M.dayName('2026-10-17', 'en-US@posix') !== '', M.niceDate('2026-10-17', T, 'en-US@posix') !== '2026-10-17', M.fmt(150000, '', 'en-US@posix')], [true, true, '1,500']);

    // paydays
    const wk = { freq: 'week', start: '2026-10-03' };
    eq('weekly paydays', M.paydaysBetween(wk, '2026-10-03', '2026-10-24'), ['2026-10-10', '2026-10-17', '2026-10-24']);
    eq('weekly from the start', M.paydaysBetween(wk, '2026-10-02', '2026-10-10'), ['2026-10-03', '2026-10-10']);
    eq('nothing before the start', M.paydaysBetween(wk, '', '2026-10-02'), []);
    eq('no payday twice', M.paydaysBetween(wk, '2026-10-17', '2026-10-17'), []);
    eq('next payday when today is payday', M.nextPayday(wk, T), '2026-10-24');
    eq('last payday on payday', M.lastPayday(wk, T), '2026-10-17');
    eq('last payday mid-week', M.lastPayday(wk, '2026-10-16'), '2026-10-10');
    eq('no last payday before start', M.lastPayday({ freq: 'week', start: '2026-10-24' }, T), '');
    eq('next payday before start is the start', M.nextPayday({ freq: 'week', start: '2026-10-24' }, T), '2026-10-24');
    const fn = { freq: '2weeks', start: '2026-10-03' };
    eq('2-weekly', M.paydaysBetween(fn, '', '2026-11-14'), ['2026-10-03', '2026-10-17', '2026-10-31', '2026-11-14']);
    eq('2-weekly next', M.nextPayday(fn, '2026-10-18'), '2026-10-31');
    const mo = { freq: 'month', start: '2026-01-31' };
    eq('monthly 31st moves to the last day', M.paydaysBetween(mo, '', '2026-06-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
    eq('monthly leap year', M.nthPayday({ freq: 'month', start: '2028-01-30' }, 1), '2028-02-29');
    eq('monthly over new year', M.paydaysBetween({ freq: 'month', start: '2026-11-01' }, '2026-11-01', '2027-02-01'), ['2026-12-01', '2027-01-01', '2027-02-01']);
    eq('monthly next', M.nextPayday({ freq: 'month', start: '2026-01-01' }, T), '2026-11-01');
    eq('weekly over summer time change', M.paydaysBetween({ freq: 'week', start: '2026-10-18' }, '', '2026-11-01'), ['2026-10-18', '2026-10-25', '2026-11-01']);
    eq('long gap is capped and correct', M.paydaysBetween(wk, '', '2027-10-16').length, 55);
    eq('sched words week', M.schedWords(wk, L), 'every Saturday');
    eq('sched words 2 weeks', M.schedWords(fn, L), 'every 2 weeks on Saturday');
    eq('sched words month', M.schedWords({ freq: 'month', start: '2026-10-01' }, L), 'on the 1st of every month');
    eq('sched words 31st', M.schedWords(mo, L), 'on the 31st of every month (the last day in shorter months)');
    eq('ordinals', [1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(M.ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);

    // the README situation: Ali gets 5 every Saturday from 3 Oct, does chores, buys stickers, saves for Lego 30
    const st = M.emptyState();
    const ali = { id: 'a', name: 'Ali', allowance: 500, sched: { freq: 'week', start: '2026-10-03' }, paidThrough: '2026-10-02', goal: { name: 'Lego set', amount: 3000 },
        chores: [{ id: 'c1', name: 'Tidy your room', value: 50 }, { id: 'c2', name: 'Wash the car', value: 200 }, { id: 'c3', name: 'Make your bed', value: 0 }], log: [] };
    const sara = { id: 's', name: 'Sara', allowance: 0, sched: { freq: 'week', start: '2026-10-03' }, paidThrough: '2026-10-02', goal: null, chores: [], log: [] };
    st.kids.push(ali, sara);
    let added = M.runPaydays(st, '2026-10-16');
    eq('catch-up adds 2 paydays', added.map(a => [a.name, a.days, a.total]), [['Ali', ['2026-10-03', '2026-10-10'], 1000]]);
    eq('payday message for 2', M.paydayMessage(added, '', '2026-10-16', L), 'Payday! Added 2 paydays of 5 for Ali, 10 in all (Sat 3 Oct to Sat 10 Oct).');
    eq('chores-only child is only marked paid', [sara.paidThrough, sara.log.length], ['2026-10-10', 0]);
    eq('running again adds nothing', M.runPaydays(st, '2026-10-16'), []);
    const push = (kind, amount, date, note, choreId) => ali.log.push(Object.assign({ id: M.uid(st), kind, amount, date, seq: st.seq, note: note || '' }, choreId ? { choreId } : {}));
    push('chore', 50, '2026-10-09', 'Tidy your room', 'c1');      // before last payday, not counted this week
    push('chore', 50, '2026-10-12', 'Tidy your room', 'c1');
    push('chore', 200, '2026-10-14', 'Wash the car', 'c2');
    push('chore', 0, '2026-10-14', 'Make your bed', 'c3');
    push('out', 350, '2026-10-15', 'Football stickers');
    added = M.runPaydays(st, T);
    eq('payday message for 1', M.paydayMessage(added, '£', T, L), 'Payday! Added £5 pocket money for Ali (Sat 17 Oct).');
    push('chore', 50, T, 'Tidy your room', 'c1'); push('chore', 50, T, 'Tidy your room', 'c1');
    eq('balance', M.balance(ali), 1500 + 50 + 50 + 200 - 350 + 100); // 15 pocket money + 4.00 chores - 3.50 stickers = 15.50
    eq('balance words', M.balanceWords(ali, '£', L), 'Ali has £15.50');
    const since = M.sincePayday(ali, T);
    eq('since payday counts today only (payday today)', [since.from, since.choreCount, since.chores], [T, 2, 100]);
    const since2 = M.sincePayday(ali, '2026-10-16');
    eq('since payday mid-week', [since2.from, since2.choreCount, since2.chores, since2.out], ['2026-10-10', 3, 250, 350]);
    eq('done twice today', M.doneOn(ali, 'c1', T), 2);
    eq('not done today', M.doneOn(ali, 'c2', T), 0);
    const g = M.goalInfo(ali, T);
    eq('goal', [g.saved, g.left, g.pct, g.reached, g.paydays, g.by], [1550, 1450, 51, false, 3, '2026-11-07']);
    eq('max out', M.maxOut(ali), 1550);
    const hist = M.history(ali);
    eq('history newest first with balance after', [hist[0].after, hist[hist.length - 1].entry.date, hist[hist.length - 1].after], [1550, '2026-10-03', 500]);
    eq('entry words', [M.entryWords({ kind: 'pay' }), M.entryWords({ kind: 'chore', note: 'Wash the car' }), M.entryWords({ kind: 'in', note: '' }), M.entryWords({ kind: 'out', note: 'Stickers' })], ['Pocket money', 'Wash the car', 'Added', 'Taken out: Stickers']);
    eq('summary text', M.summaryText(Object.assign({}, st, { cur: '£' }), T, L),
        'Pocket money on Saturday 17 Oct:\n\nAli has £15.50\n  Earned £1 from 2 chores since payday (Sat 17 Oct)\n  Pocket money £5 every Saturday, next on Sat 24 Oct\n  Saving for Lego set: £15.50 of £30, £14.50 to go\n\nSara has £0');
    // goal reached and over
    ali.goal.amount = 1200;
    const g2 = M.goalInfo(ali, T);
    eq('goal reached', [g2.reached, g2.pct, g2.left, g2.paydays], [true, 100, 0, null]);
    // chores-only child goal: no payday estimate
    sara.goal = { name: 'Book', amount: 800 };
    eq('goal without pocket money has no estimate', [M.goalInfo(sara, T).paydays, M.goalInfo(sara, T).by], [null, '']);
    // negative balance words
    eq('short words', M.balanceWords({ name: 'Zara', log: [{ kind: 'out', amount: 200 }] }, '', L), 'Zara is 2 short');

    // saved data
    eq('normalize rejects junk', [M.normalize(null), M.normalize('x'), M.normalize({}), M.normalize({ kids: 'no' })], [null, null, null, null]);
    const round = M.normalize(JSON.parse(JSON.stringify(st)));
    eq('round trip keeps everything', [round.kids.length, round.kids[0].log.length, round.kids[0].chores.length, M.balance(round.kids[0]), round.kids[0].goal], [2, ali.log.length, 3, 1550, { name: 'Lego set', amount: 1200 }]);
    const bad = M.normalize({ cur: 'XX', kids: [
        { name: '  ', sched: { freq: 'week', start: '2026-10-03' } },
        { name: 'Bo', allowance: -5, sched: { freq: 'daily', start: '2026-10-03' }, paidThrough: 'nope', goal: { name: 'x', amount: 0 },
          chores: [{ name: 'ok', value: 10 }, { name: '', value: 5 }, { name: 'neg', value: -1 }],
          log: [{ kind: 'pay', amount: 500, date: '2026-10-03' }, { kind: 'zzz', amount: 1, date: '2026-10-03' }, { kind: 'in', amount: 1.5, date: '2026-10-03' }, { kind: 'out', amount: 100, date: '2026-02-30' }, { kind: 'chore', amount: 0, date: '2026-10-04', note: '<b>x</b>' }] },
        { name: 'bo', sched: { freq: 'week', start: '2026-10-03' } },
        { name: 'No date', sched: { freq: 'week', start: '' } }] });
    const bo = bad.kids[0];
    eq('bad data cleaned', [bad.cur, bad.kids.length, bo.name, bo.allowance, bo.sched.freq, bo.paidThrough, bo.goal, bo.chores.length, bo.log.length], ['', 1, 'Bo', 0, 'week', '2026-10-02', null, 1, 2]);
    eq('note text kept as text', bo.log[1].note, '<b>x</b>');
    eq('ids unique after restore', new Set(bo.log.map(e => e.id).concat(bo.chores.map(x => x.id), [bo.id])).size, 4);
    eq('isDay', [M.isDay('2026-02-29'), M.isDay('2028-02-29'), M.isDay('20261017'), M.isDay(null)], [false, true, false, false]);

    const msg = (fail ? out.filter(l => l.startsWith('FAIL')).join('\n') + '\n' : '') + pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n') + '\n\n' + msg;
    else { console.log(msg); if (fail) process.exitCode = 1; }
})();
