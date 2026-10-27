// Logic checks for core.js. Run: TZ=Asia/Dubai node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.KIT;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const L = 'en-GB', T = '2026-10-27';

    // typed values
    const ev = s => C.parseEvery(s).n, everr = s => !!C.parseEvery(s).error;
    eq('every 7', ev('7'), 7); eq('every "10 days"', ev('10 days'), 10); eq('every " 1 day "', ev(' 1 day '), 1); eq('every 365', ev('365'), 365);
    eq('every blank', everr(''), true); eq('every 0', everr('0'), true); eq('every -3', everr('-3'), true); eq('every 2.5', everr('2.5'), true); eq('every 2,5', everr('2,5'), true);
    eq('every 366', everr('366'), true); eq('every words', everr('often'), true); eq('every huge', everr('99999999999'), true);
    eq('name spaces', C.cleanName('  Nani   jaan \n'), 'Nani jaan'); eq('name 40 chars', C.cleanName('x'.repeat(90)).length, 40);
    eq('note keeps lines', C.cleanNote('Line 1\r\n\r\n\r\n\r\nLine 2  \n', 500), 'Line 1\n\nLine 2');

    // dates
    eq('isDay 31 Feb', C.isDay('2026-02-31'), false); eq('isDay 29 Feb 2028', C.isDay('2028-02-29'), true); eq('isDay junk', C.isDay('27/10/2026'), false);
    eq('addDays across year', C.addDays('2026-12-29', 7), '2027-01-05'); eq('diff', C.diff('2026-10-18', T), 9);
    eq('ago', [C.ago(0), C.ago(1), C.ago(9)], ['today', 'yesterday', '9 days ago']);
    eq('every words', [1, 3, 7, 14, 30, 60, 90, 45].map(C.everyWords), ['every day', 'every 3 days', 'every week', 'every 2 weeks', 'every month', 'every 2 months', 'every 3 months', 'every 45 days']);
    eq('fmtDate', C.fmtDate('2026-10-18', L, 'wd'), 'Sun 18 Oct');

    // the main situation: Sara in Dubai on Tue 27 Oct 2026
    const P = (id, name, every, log, x) => Object.assign({ id, name, every, log: log.map(([d, k, n], i) => Object.assign({ id: id + i, d, k }, n ? { n } : {})) }, x || {});
    const nani = P('n', 'Nani', 7, [['2026-10-11', 'call'], ['2026-10-18', 'call', 'Her knee is better']], { tz: 'Asia/Karachi', win: { from: 540, to: 1260 } });
    const ammi = P('a', 'Ammi and Abbu', 3, [['2026-10-21', 'call'], ['2026-10-24', 'msg']], { tz: 'Asia/Karachi' });
    const ahmed = P('h', 'Ahmed (uni friend)', 30, [['2026-10-01', 'call']], { tz: 'Europe/London', win: { from: 1080, to: 1320 } });
    const bhai = P('b', 'Bilal bhai', 7, [['2026-10-22', 'call'], ['2026-10-26', 'try']], { tz: 'America/Toronto', win: { from: 540, to: 1260 } });
    const zara = P('z', 'Zara', 14, []);
    const khala = P('k', 'Khala', 14, [['2026-09-01', 'met']], { paused: '2026-10-20' });
    const all = [ahmed, khala, zara, bhai, ammi, nani];

    let s = C.status(nani, T);
    eq('Nani: 2 days overdue', [s.kind, s.days, s.due, s.since], ['over', 2, '2026-10-25', 9]);
    eq('Nani headline', C.headline(s), '2 days overdue'); eq('Nani last words', C.lastWords(s, L), 'Last called 9 days ago (Sun 18 Oct)');
    s = C.status(ammi, T); eq('Ammi and Abbu: due today', [s.kind, s.days, s.since, s.last.k], ['today', 0, 3, 'msg']); eq('due today headline', C.headline(s), 'Due today');
    s = C.status(ahmed, T); eq('Ahmed: due in 4 days on 31 Oct', [s.kind, s.days, s.due], ['ok', -4, '2026-10-31']); eq('Ahmed headline', C.headline(s), 'Due in 4 days');
    s = C.status(bhai, T); eq('Bilal: due in 2 days (soon)', [s.kind, s.days], ['soon', -2]);
    eq('Bilal: tried yesterday, does not reset the clock', [s.last.d, s.tried.d, s.triedAgo], ['2026-10-22', '2026-10-26', 1]);
    s = C.status(zara, T); eq('Zara: no contact yet, due today', [s.kind, s.due, s.since, C.headline(s)], ['never', T, null, 'Get in touch today']);
    eq('Zara last words', C.lastWords(s, L), 'No contact logged yet');
    s = C.status(khala, T); eq('Khala paused', [s.kind, C.headline(s)], ['paused', 'Paused']);
    eq('order: most overdue first, paused last', C.order(all, T).map(r => r.p.id), ['n', 'a', 'z', 'b', 'h', 'k']);
    const sm = C.summary(all, T);
    eq('summary now', sm.now.map(r => r.p.name), ['Nani', 'Ammi and Abbu', 'Zara']); eq('summary next', sm.next.p.name, 'Bilal bhai');
    eq('summary counts', [sm.over.length, sm.today.length, sm.never.length, sm.soon.length, sm.ok.length, sm.paused.length], [1, 1, 1, 1, 1, 1]);
    eq('names list', [C.namesList(['A']), C.namesList(['A', 'B']), C.namesList(['A', 'B', 'C'])], ['A', 'A and B', 'A, B and C']);
    eq('summary text', C.summaryText(all, T, L), ['Keep in touch: Tue 27 Oct', '', 'Get in touch today:',
        '- Nani: 2 days overdue (last called 9 days ago (Sun 18 Oct), aim every week)',
        '- Ammi and Abbu: due today (last messaged 3 days ago (Sat 24 Oct), aim every 3 days)',
        '- Zara: no contact logged yet (aim every 2 weeks)', '', 'Coming up:',
        '- Bilal bhai: due in 2 days (Thu 29 Oct)', '- Ahmed (uni friend): due in 4 days (Sat 31 Oct)', '', 'Paused: Khala'].join('\n'));
    eq('everyone up to date', C.summaryText([ahmed], T, L).includes('Everyone is up to date.'), true);
    eq('empty list summary', C.summary([], T).now.length, 0);

    // more cases
    const twice = P('t', 'T', 7, [['2026-10-27', 'msg'], ['2026-10-27', 'call']]);
    eq('two contacts in one day: the later one counts', [C.lastContact(twice).k, C.status(twice, T).due], ['call', '2026-11-03']);
    const late = P('l', 'L', 7, [['2026-10-20', 'call'], ['2026-10-10', 'met']]);
    eq('an older entry added later does not move the last contact', C.lastContact(late).d, '2026-10-20');
    const tryAfter = P('ta', 'TA', 7, [['2026-10-20', 'try'], ['2026-10-21', 'call']]);
    eq('a try before the last call is not shown', C.lastTry(tryAfter), null);
    const sameDay = P('sd', 'SD', 7, [['2026-10-27', 'call'], ['2026-10-27', 'try']]);
    eq('a try after a call on the same day is shown', !!C.lastTry(sameDay), true);
    const onlyTry = P('ot', 'OT', 7, [['2026-10-25', 'try']]);
    eq('only tried: still never', [C.status(onlyTry, T).kind, C.status(onlyTry, T).triedAgo], ['never', 2]);
    const daily = P('d', 'D', 1, [['2026-10-26', 'msg']]);
    eq('every day, last yesterday: due today', C.status(daily, T).kind, 'today');
    const today1 = P('d1', 'D1', 1, [['2026-10-27', 'msg']]);
    eq('every day, done today: due tomorrow', [C.status(today1, T).kind, C.headline(C.status(today1, T))], ['soon', 'Due tomorrow']);
    const yearly = P('y', 'Y', 365, [['2025-10-27', 'met']]);
    eq('every 365 days from 27 Oct 2025: due today', C.status(yearly, T).kind, 'today');
    const resumed = P('r', 'R', 7, [['2026-08-01', 'call']], { resumed: '2026-10-26' });
    eq('resumed after a pause: due on the resume day, 1 day overdue', [C.status(resumed, T).due, C.status(resumed, T).days], ['2026-10-26', 1]);
    const resumedFine = P('r2', 'R2', 7, [['2026-10-25', 'call']], { resumed: '2026-10-26' });
    eq('resumed but not late: normal due day', C.status(resumedFine, T).due, '2026-11-01');
    eq('last 30 days', C.last30(P('x', 'X', 7, [['2026-09-27', 'call'], ['2026-09-28', 'call'], ['2026-10-10', 'msg'], ['2026-10-27', 'met'], ['2026-10-26', 'try']]), T), { call: 1, msg: 1, met: 1, any: 0, try: 1 });
    eq('check entry future', !!C.checkEntry({ d: '2026-10-28', k: 'call' }, T), true); eq('check entry ok', C.checkEntry({ d: T, k: 'msg' }, T), null);
    eq('check entry bad kind', !!C.checkEntry({ d: T, k: 'x' }, T), true); eq('check entry bad day', !!C.checkEntry({ d: '', k: 'call' }, T), true);

    // time zones and good times to call
    eq('inWin daytime', [C.inWin(540, { from: 540, to: 1260 }), C.inWin(1259, { from: 540, to: 1260 }), C.inWin(1260, { from: 540, to: 1260 }), C.inWin(539, { from: 540, to: 1260 })], [true, true, false, false]);
    const night = { from: 1320, to: 360 };
    eq('night shift 22:00 to 06:00 crosses midnight', [C.inWin(1380, night), C.inWin(0, night), C.inWin(359, night), C.inWin(360, night), C.inWin(720, night)], [true, true, true, false, false]);
    eq('advice inside', C.advice(1380, night), { good: true, untilEnd: 420 }); eq('advice outside', C.advice(360, night), { good: false, untilStart: 960 });
    eq('advice no window', C.advice(100, null), { good: true, any: true });
    eq('Toronto 06:13 to 09:00', C.advice(373, { from: 540, to: 1260 }), { good: false, untilStart: 167 }); eq('gap words', [C.fmtGap(167), C.fmtGap(45), C.fmtGap(120)], ['2 h 47 min', '45 min', '2 h']);
    eq('fmtMin', [C.fmtMin(540, L), C.fmtMin(0, L), C.fmtMin(1290, L)], ['09:00', '00:00', '21:30']);
    eq('ahead words', [C.aheadWords(60), C.aheadWords(-240), C.aheadWords(0), C.aheadWords(-570), C.aheadWords(90)], ['1 hour ahead of you', '4 hours behind you', 'same time as you', '9 hours 30 min behind you', '1 hour 30 min ahead of you']);
    eq('tz city', [C.tzCity('America/Argentina/Buenos_Aires'), C.tzCity('Asia/Karachi')], ['Buenos Aires', 'Karachi']);
    eq('valid tz', [C.validTz('Asia/Karachi'), C.validTz('Mars/Base'), C.validTz(''), C.validTz(5)], [true, false, false, false]);
    if (typeof process !== 'undefined' && process.env && process.env.TZ === 'Asia/Dubai') {
        const now = new Date('2026-10-27T10:13:00Z');   // 14:13 in Dubai
        eq('Karachi clock: 15:13, 1 hour ahead', C.clock('Asia/Karachi', now), { min: 913, wd: 'Tue', ahead: 60 });
        eq('London after the clocks went back on 25 Oct: 10:13, 4 hours behind', C.clock('Europe/London', now), { min: 613, wd: 'Tue', ahead: -240 });
        eq('Toronto before its clocks change on 1 Nov: 06:13, 8 hours behind', C.clock('America/Toronto', now), { min: 373, wd: 'Tue', ahead: -480 });
        eq('Kolkata 15:43, 1 h 30 ahead', C.clock('Asia/Kolkata', now).ahead, 90);
        eq('Auckland is on Wednesday already', C.clock('Pacific/Auckland', new Date('2026-10-27T20:00:00Z')).wd, 'Wed');
    }

    // saved data
    eq('cleanState rejects junk', [C.cleanState(null), C.cleanState({}), C.cleanState({ people: 'x' })], [null, null, null]);
    const cs = C.cleanState({ people: [nani, { name: '', every: 7 }, { name: 'Bad every', every: 0 }, { name: 'Big', every: 999 }, { id: 'n', name: 'Dup id', every: 2, log: [{ d: 'x', k: 'call' }, { d: T, k: 'hack' }, { d: T, k: 'msg', n: 5 }] },
        { name: 'Bad tz', every: 7, tz: 'Nowhere/Here', win: { from: 60, to: 60 } }, { name: '<img src=x onerror=alert(1)>', every: 7 }] });
    eq('cleanState keeps valid people only', cs.people.map(p => p.name), ['Nani', 'Dup id', 'Bad tz', '<img src=x onerror=alert(1)>']);
    eq('cleanState keeps the good log entry only', cs.people[1].log.map(e => e.k), ['msg']); eq('duplicate id replaced', cs.people[1].id !== 'n', true);
    eq('bad tz and same from/to dropped', [cs.people[2].tz, cs.people[2].win], [undefined, undefined]);
    eq('round trip', C.cleanState(JSON.parse(JSON.stringify(C.cleanState({ people: all })))).people.length, 6);

    const msg = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') { document.getElementById('out').textContent = msg + '\n\n' + out.join('\n'); }
    else { out.filter(x => x.startsWith('FAIL')).forEach(x => console.log(x)); console.log(msg); if (fail) process.exitCode = 1; }
})();
