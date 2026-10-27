// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.PDB;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const G = C.GB, L = 'en-GB';
    const d = (s, u) => C.parseData(s, u || 'GB').n, derr = (s, u, o) => !!C.parseData(s, u || 'GB', o).error;
    const m = s => C.parseMoney(s).n, merr = s => !!C.parseMoney(s).error;

    // typed data: GB and MB, units in the box, pasted text, bad input
    eq('30 GB', d('30'), 30 * G); eq('7.4', d('7.4'), 7577600); eq('7,4 comma decimal', d('7,4'), 7577600); eq('750 MB select', d('750', 'MB'), 750000);
    eq('unit typed wins: 750MB', d('750MB'), 750000); eq('unit typed: 1.5 gb', d('1.5 gb', 'MB'), 1.5 * G); eq('1,250 MB', d('1,250 MB'), 1250000);
    eq('pasted spaces', d('  2 GB '), 2 * G); eq('0 allowed for left', d('0'), 0); eq('0.5 MB', d('0.5', 'MB'), 500);
    eq('blank', derr(''), true); eq('words', derr('lots'), true); eq('minus', derr('-3'), true); eq('4 decimals', derr('1.2345'), true);
    eq('huge', derr('20000'), true); eq('zero bundle refused', derr('0', 'GB', { positive: true }), true); eq('10000 GB ok', d('10000'), 10000 * G);
    eq('money 1000', m('1000'), 100000); eq('money Rs 1,499.50', m('Rs 1,499.50'), 149950); eq('money lakh', m('1,00,000'), 10000000);
    eq('money minus', merr('-5'), true); eq('money words', merr('free'), true); eq('money 0', m('0'), 0);

    // words
    eq('fmt 7.4 GB', C.fmtData(7577600, L), '7.4 GB'); eq('fmt 30 GB', C.fmtData(30 * G, L), '30 GB'); eq('fmt 12.25 GB -> 1 dp', C.fmtData(Math.round(12.25 * G), L), '12.3 GB');
    eq('fmt 771 MB', C.fmtData(770875, L), '771 MB'); eq('fmt 0', C.fmtData(0, L), '0 MB'); eq('fmt tiny', C.fmtData(200, L), 'under 1 MB'); eq('fmt 1 GB', C.fmtData(G, L), '1 GB');
    eq('span 9d20h', C.fmtSpan(9 * 1440 + 20 * 60), '9 days 20 hours'); eq('span 20 days', C.fmtSpan(20 * 1440 + 300), '20 days'); eq('span 1 day', C.fmtSpan(1440), '1 day');
    eq('span 5h', C.fmtSpan(300), '5 hours'); eq('span 40m', C.fmtSpan(40), '40 minutes'); eq('span negative', C.fmtSpan(-5), '0 minutes');
    eq('money fmt', C.fmtMoney(333333, 'Rs', 'en-US'), 'Rs 3,333.33'); eq('money fmt symbol', C.fmtMoney(100000, '₹', 'en-US'), '₹1,000'); eq('money none', C.fmtMoney(5, '', 'en-US'), '0.05');
    eq('input value GB', C.dataInput(7577600), { v: '7.4', u: 'GB' }); eq('input value MB', C.dataInput(750000), { v: '750', u: 'MB' });

    // times, midnight and month ends
    eq('time ok', C.isTime('2026-10-31T23:59'), true); eq('time bad day', C.isTime('2026-02-30T10:00'), false); eq('time bad hour', C.isTime('2026-10-01T24:00'), false);
    eq('add 30 days', C.addMin('2026-10-01T10:00', 30 * 1440), '2026-10-31T10:00'); eq('over midnight', C.addMin('2026-12-31T23:30', 60), '2027-01-01T00:30');
    eq('leap year', C.addMin('2028-02-28T12:00', 1440), '2028-02-29T12:00');

    // the main situation: 30 GB bought 1 Oct 10:00, valid 30 days, 7.4 GB left on 21 Oct 14:00
    const B = () => ({ start: '2026-10-01T10:00', exp: '2026-10-31T10:00', mb: 30 * G, price: 100000, tops: [], reads: [{ id: 'r1', at: '2026-10-21T14:00', mb: 7577600 }] });
    let a = C.analyse(B(), '2026-10-21T14:00');
    eq('state active', a.state, 'active'); eq('left 7.4', a.est, 7577600); eq('not estimated right after check', a.estimated, false);
    // 22.6 GB in 20 d 4 h (29,040 min): 23,142,400 * 1440 / 29,040 = 1,147,557 (1.12 GB a day)
    eq('pace', a.pace, 1147557); eq('pace words', C.perDay(a.pace, L), '1.12 GB a day');
    // 7.4 GB over 9 d 20 h (14,160 min): 7,577,600 * 1440 / 14,160 = 770,603 = 771 MB a day
    eq('allowance', a.allow, 770603); eq('allowance words', C.fmtData(a.allow, L), '771 MB');
    // 7,577,600 * 1440 / 1,147,557 = 9,508 min = 6 d 14 h 28 m after 21 Oct 14:00 -> 28 Oct 04:28
    eq('runs out', a.runOut, '2026-10-28T04:28'); eq('lasts false', a.lasts, false); eq('early 3 days', C.fmtSpan(a.early), '3 days 5 hours');
    eq('cost per GB 33.33', a.perGB, 3333); eq('time gone 67%', a.timePct, 67); eq('used 75%', a.usedPct, 75);
    // a day later with no new check: about 1.12 GB less
    a = C.analyse(B(), '2026-10-22T14:00');
    eq('estimated next day', a.estimated, true); eq('est next day', a.est, 7577600 - 1147557); eq('remain', a.remain, 13 * 60 + 8 * 1440 + 7 * 60);

    // slow use: lasts, with spare
    const slow = { start: '2026-10-01T00:00', exp: '2026-10-31T00:00', mb: 30 * G, tops: [], reads: [{ id: 'a', at: '2026-10-11T00:00', mb: 25 * G }] };
    a = C.analyse(slow, '2026-10-11T00:00');
    eq('slow pace 0.5 GB', a.pace, G / 2); eq('slow lasts', a.lasts, true); eq('slow spare 15 GB', a.spare, 15 * G); eq('no price no cost', a.perGB, null);
    // no use at all after a day: pace 0, lasts
    a = C.analyse({ start: '2026-10-01T00:00', exp: '2026-10-08T00:00', mb: G, tops: [], reads: [{ id: 'a', at: '2026-10-02T00:00', mb: G }] }, '2026-10-02T00:00');
    eq('zero use pace 0', a.pace, 0); eq('zero use lasts', a.lasts, true);
    // first use: no check yet
    a = C.analyse({ start: '2026-10-01T10:00', exp: '2026-10-08T10:00', mb: 10 * G, tops: [], reads: [] }, '2026-10-01T10:00');
    eq('no check pace null', a.pace, null); eq('no check est full', a.est, 10 * G); eq('no check allow', a.allow, Math.floor(10 * G / 7)); eq('no check checked', a.checked, false);
    // a check after only 1 hour: too soon for a pace
    a = C.analyse({ start: '2026-10-01T10:00', exp: '2026-10-08T10:00', mb: 10 * G, tops: [], reads: [{ id: 'a', at: '2026-10-01T11:00', mb: 9 * G }] }, '2026-10-01T11:00');
    eq('1 hour no pace', a.pace, null);
    // ran out
    a = C.analyse({ start: '2026-10-01T10:00', exp: '2026-10-08T10:00', mb: 10 * G, tops: [], reads: [{ id: 'a', at: '2026-10-05T22:00', mb: 0 }] }, '2026-10-06T09:00');
    eq('out state', a.state, 'out'); eq('out early', a.early, 2 * 1440 + 12 * 60);
    // expired
    a = C.analyse(B(), '2026-11-02T09:00');
    eq('expired', a.state, 'expired');
    // pace says it ran out before now
    a = C.analyse({ start: '2026-10-01T00:00', exp: '2026-10-31T00:00', mb: 10 * G, tops: [], reads: [{ id: 'a', at: '2026-10-02T00:00', mb: 8 * G }] }, '2026-10-09T00:00');
    eq('maybe out', a.maybeOut, true); eq('maybe out est 0', a.est, 0);

    // top-up: 10 GB bundle, 2 GB left on day 5, 5 GB added on day 5 evening
    const T = { start: '2026-10-01T00:00', exp: '2026-10-15T00:00', mb: 10 * G, price: 50000, tops: [{ id: 't', at: '2026-10-05T18:00', mb: 5 * G, price: 20000 }], reads: [{ id: 'a', at: '2026-10-05T00:00', mb: 2 * G }] };
    a = C.analyse(T, '2026-10-05T00:00');
    eq('top-up counted in run-out', a.runOut, '2026-10-08T12:00'); eq('top-up paid', a.paid, 70000); eq('top-up cost per GB', a.perGB, Math.round(70000 / 15)); eq('top-up total', a.total, 15 * G);
    eq('cap before top-up', C.capAt(T, '2026-10-05T17:59'), 10 * G); eq('cap after top-up', C.capAt(T, '2026-10-05T18:00'), 15 * G);
    eq('read after top-up may go up', C.checkRead(T, '2026-10-06T00:00', 6 * G, '2026-10-06T00:00'), '');
    // a top-up in the same minute as a check counts as after it
    const T2 = { start: '2026-10-01T00:00', exp: '2026-10-15T00:00', mb: 10 * G, tops: [{ id: 't', at: '2026-10-05T00:00', mb: 5 * G }], reads: [{ id: 'a', at: '2026-10-05T00:00', mb: 2 * G }] };
    eq('same-minute top-up adds to the check', C.analyse(T2, '2026-10-05T00:00').est, 7 * G); eq('same-minute top-up pace', C.analyse(T2, '2026-10-05T00:00').pace, 2 * G);
    eq('same-minute check cannot include the top-up', !!C.checkRead(Object.assign({}, T2, { reads: [] }), '2026-10-05T00:00', 12 * G, '2026-10-06T00:00'), true);
    eq('read going up without top-up refused', !!C.checkRead(T, '2026-10-05T12:00', 3 * G, '2026-10-06T00:00'), true);

    // balance checks that cannot be right
    const R = B();
    eq('more than bundle', /more than the whole bundle/.test(C.checkRead(R, '2026-10-22T10:00', 31 * G, '2026-10-23T00:00')), true);
    eq('before purchase', !!C.checkRead(R, '2026-09-30T10:00', G, '2026-10-23T00:00'), true);
    eq('future', !!C.checkRead(R, '2026-10-25T10:00', G, '2026-10-23T00:00'), true);
    eq('after expiry', !!C.checkRead(R, '2026-11-01T10:00', G, '2026-11-05T00:00'), true);
    eq('same minute twice', !!C.checkRead(R, '2026-10-21T14:00', G, '2026-10-23T00:00'), true);
    eq('same minute editing itself ok', C.checkRead(R, '2026-10-21T14:00', G, '2026-10-23T00:00', 'r1'), '');
    eq('later check more than earlier', !!C.checkRead(R, '2026-10-22T14:00', 8 * G, '2026-10-23T00:00'), true);
    eq('earlier check less than later', !!C.checkRead(R, '2026-10-10T14:00', 7 * G, '2026-10-23T00:00'), true);
    eq('fine check', C.checkRead(R, '2026-10-22T14:00', 6 * G, '2026-10-23T00:00'), '');
    eq('bad time', !!C.checkRead(R, '2026-10-22', G, '2026-10-23T00:00'), true);
    eq('replaced bundle: check after it ended', !!C.checkRead(Object.assign(B(), { ended: '2026-10-25T00:00' }), '2026-10-26T00:00', G, '2026-10-27T00:00'), true);

    // buying: dates
    eq('buy ok', C.checkBuy({ start: '2026-10-01T10:00', exp: '2026-10-31T10:00' }, '2026-10-02T00:00'), null);
    eq('buy exp before start', C.checkBuy({ start: '2026-10-01T10:00', exp: '2026-10-01T10:00' }, '2026-10-02T00:00').f, 'exp');
    eq('buy future', C.checkBuy({ start: '2026-10-05T10:00', exp: '2026-10-31T10:00' }, '2026-10-02T00:00').f, 'start');
    eq('buy too long', C.checkBuy({ start: '2026-01-01T10:00', exp: '2027-03-01T10:00' }, '2026-10-02T00:00').f, 'exp');
    eq('buy bad date', C.checkBuy({ start: 'T10:00', exp: '2026-10-31T10:00' }, '2026-10-02T00:00').f, 'start');

    // renewing early: data left at the switch, and a replaced bundle's end
    eq('left at switch', C.leftAt(B(), '2026-10-21T14:00'), 7577600);
    eq('left at switch after expiry', C.leftAt(B(), '2026-11-01T00:00'), 0);
    const rep = Object.assign(B(), { ended: '2026-10-22T00:00' });
    eq('replaced end', C.endOf(rep), '2026-10-22T00:00'); eq('replaced state', C.analyse(rep, '2026-10-23T00:00').state, 'replaced');
    eq('used total near end', C.usedTotal(Object.assign(B(), { reads: [{ id: 'a', at: '2026-10-31T08:00', mb: G }] })), { used: 29 * G, left: G, at: '2026-10-31T08:00', exact: true });
    eq('used total early check not exact', C.usedTotal(B()).exact, false); eq('used total no checks', C.usedTotal(Object.assign(B(), { reads: [] })), null);
    // carried data counts as data but not in the cost per GB
    a = C.analyse(Object.assign(B(), { carried: 2 * G, reads: [] }), '2026-10-01T10:00');
    eq('carried in cap', a.est, 32 * G); eq('carried not in cost', a.perGB, 3333);

    // money spent per month
    const S = { lines: [{ buys: [{ start: '2026-09-28T10:00', price: 50000, tops: [{ at: '2026-10-02T10:00', price: 10000, mb: G }] }, { start: '2026-10-05T10:00', price: 100000, tops: [] }, { start: '2026-10-06T10:00', tops: [] }] }] };
    eq('spent october', C.spentIn(S, '2026-10'), { cents: 110000, bundles: 1, extras: 1 }); eq('spent september', C.spentIn(S, '2026-09'), { cents: 50000, bundles: 1, extras: 0 });
    eq('spent nothing', C.spentIn(S, '2026-08'), { cents: 0, bundles: 0, extras: 0 });

    // saved data: corrupt, odd and very long values
    eq('clean null', C.cleanState(null), null); eq('clean string', C.cleanState('x'), null); eq('clean no lines', C.cleanState({}), null);
    const dirty = { cur: 'Rs', lines: [{ name: 'x'.repeat(80), buys: [Object.assign(B(), { reads: [{ at: '2026-10-21T14:00', mb: 99 * G }, { at: '2026-10-22T14:00', mb: G }, { at: 'bad', mb: 1 }], tops: [{ at: '2020-01-01T00:00', mb: G }] })] },
        { name: '', buys: [B()] }, { name: 'no buys', buys: [] }, { name: 'bad buy', buys: [{ start: '2026-10-05T00:00', exp: '2026-10-01T00:00', mb: G }] }] };
    const c = C.cleanState(dirty);
    eq('clean keeps good line', c.lines.length, 1); eq('clean name cut to 40', c.lines[0].name.length, 40); eq('clean drops impossible checks', c.lines[0].buys[0].reads.length, 1);
    eq('clean drops top-up outside dates', c.lines[0].buys[0].tops.length, 0); eq('clean keeps currency', c.cur, 'Rs');
    eq('clean round trip', JSON.stringify(C.cleanState(JSON.parse(JSON.stringify(c)))), JSON.stringify(c));
    eq('clean negative price dropped', C.cleanBuy(Object.assign(B(), { price: -5 })).price, undefined);

    const text = out.join('\n') + '\n\n' + pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined' && document.getElementById('out')) document.getElementById('out').textContent = text;
    else { console.log(text); if (fail) process.exitCode = 1; }
})();
