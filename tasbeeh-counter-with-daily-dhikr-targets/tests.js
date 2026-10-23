// Logic checks for core.js, with answers worked out by hand. Run: node tests.js  (or open test.html)
(function () {
    const C = typeof module === 'object' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.TasbeehCore;
    let pass = 0; const fails = [];
    const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(name + ': got ' + g + ', want ' + w); };
    const T = '2026-10-23'; // a Friday

    // days
    eq('fmtDateY', C.fmtDateY(T), 'Fri 23 Oct 2026');
    eq('Friday is day 5', C.dow(T), 5);
    eq('addDays over a month end', C.addDays('2026-10-31', 1), '2026-11-01');
    eq('isIso rejects 31 Apr', C.isIso('2026-04-31'), false);
    eq('dayKey at noon', C.dayKey(new Date(2026, 9, 23, 12, 0), 0), '2026-10-23');
    eq('dayKey just after midnight, day starts at midnight', C.dayKey(new Date(2026, 9, 23, 0, 5), 0), '2026-10-23');
    eq('dayKey 02:30 with the day starting at 4 is the day before', C.dayKey(new Date(2026, 9, 23, 2, 30), 4), '2026-10-22');
    eq('dayKey 04:00 with the day starting at 4 is the new day', C.dayKey(new Date(2026, 9, 23, 4, 0), 4), '2026-10-23');
    eq('dayKey 01:00 on 1 Jan with the day starting at 5', C.dayKey(new Date(2027, 0, 1, 1, 0), 5), '2026-12-31');

    // typed numbers
    eq('readInt plain', C.readInt('100'), 100);
    eq('readInt lakh commas', C.readInt('1,25,000'), 125000);
    eq('readInt spaces and pasted padding', C.readInt('  1 000 '), 1000);
    eq('readInt blank', C.readInt(''), NaN);
    eq('readInt negative', C.readInt('-5'), NaN);
    eq('readInt decimal', C.readInt('3.5'), NaN);
    eq('readInt words', C.readInt('abc'), NaN);
    eq('readInt too long', C.readInt('123456789'), NaN);
    eq('fmt', C.fmt(125000), '125,000');
    eq('cleanText', C.cleanText('  a\n\tb  ', 40), 'a b');

    // a set: 33 + 33 + 34 = 100 a round
    const st = C.starter();
    const set = st.items[0], ist = st.items[1];
    eq('starter has 3 items', st.items.map(i => i.kind), ['set', 'daily', 'daily']);
    eq('round size', C.roundSize(set), 100);
    eq('position 0', C.setPosition(set, 0), { rounds: 0, step: 0, inStep: 0, stepCount: 33 });
    eq('position 32', C.setPosition(set, 32), { rounds: 0, step: 0, inStep: 32, stepCount: 33 });
    eq('position 33 moves to Alhamdulillah', C.setPosition(set, 33), { rounds: 0, step: 1, inStep: 0, stepCount: 33 });
    eq('position 66 moves to Allahu Akbar', C.setPosition(set, 66), { rounds: 0, step: 2, inStep: 0, stepCount: 34 });
    eq('position 99', C.setPosition(set, 99), { rounds: 0, step: 2, inStep: 33, stepCount: 34 });
    eq('position 100 is one round', C.setPosition(set, 100), { rounds: 1, step: 0, inStep: 0, stepCount: 33 });
    eq('position 245', C.setPosition(set, 245), { rounds: 2, step: 1, inStep: 12, stepCount: 33 });
    eq('set target is 5 rounds', C.dayTarget(set, T), 500);

    // buzzing
    const s2 = C.starter();
    const buzz = (it, n) => { C.setCount(s2, T, it.id, n); return C.buzzAfter(s2, it, T); };
    eq('buzz 1 nothing', buzz(set, 1), '');
    eq('buzz 33 next phrase', buzz(set, 33), 'mark');
    eq('buzz 100 a round', buzz(set, 100), 'round');
    eq('buzz 500 the day target', buzz(set, 500), 'target');
    eq('buzz 600 another round past the target', buzz(set, 600), 'round');
    eq('istighfar 99 nothing', buzz(ist, 99), '');
    eq('istighfar 100 target', buzz(ist, 100), 'target');
    eq('istighfar 200 a mark', buzz(ist, 200), 'mark');
    eq('istighfar 0 nothing', buzz(ist, 0), '');
    const d33 = C.newDaily(9, C.phrase('subhanallah'), 33);
    eq('target 33 marks every 33', d33.mark, 33);
    s2.items.push(d33);
    eq('33 of 33 is the target', buzz(d33, 33), 'target');
    eq('66 is a mark', buzz(d33, 66), 'mark');

    // today lines
    const s3 = C.starter();
    C.setCount(s3, T, ist.id, 64);
    eq('istighfar 64 of 100', C.todayLine(s3, ist, T), '64 of 100 today, 36 to go');
    C.setCount(s3, T, ist.id, 100);
    eq('istighfar done', C.todayLine(s3, ist, T), '100 of 100 today: done');
    C.setCount(s3, T, ist.id, 130);
    eq('istighfar past the target', C.todayLine(s3, ist, T), '130 of 100 today: done');
    C.setCount(s3, T, set.id, 245);
    eq('set 2 rounds', C.todayLine(s3, set, T), '2 of 5 rounds done today, 3 to go');
    C.setCount(s3, T, set.id, 100);
    eq('set 1 round', C.todayLine(s3, set, T), '1 of 5 rounds done today, 4 to go');
    C.setCount(s3, T, set.id, 500);
    eq('set done', C.todayLine(s3, set, T), '5 of 5 rounds done today');
    C.setCount(s3, T, set.id, 600);
    eq('set past the target', C.todayLine(s3, set, T), '6 rounds done today (target 5)');
    C.setCount(s3, T, set.id, 35);
    eq('set none yet', C.todayLine(s3, set, T), '0 of 5 rounds done today, 5 to go');
    eq('countText set', C.countText(set, 245), '245 (2 rounds)');
    eq('countText daily', C.countText(ist, 1200), '1,200');
    const one = C.newSet(8, 'One', [{ name: 'a', arabic: '', count: 100 }], 1);
    eq('one round target done', (C.setCount(s3, T, 8, 100), C.todayLine(s3, one, T)), '1 of 1 round done today');
    eq('setCount 0 removes the day entry', (C.setCount(s3, T, set.id, 0), s3.log[T][set.id]), undefined);
    eq('setCount never below 0', C.addCount(s3, T, set.id, -5), 0);
    eq('setCount caps huge counts', C.setCount(s3, T, set.id, 1e12), C.LIMITS.count);

    // Friday-only durood 1,000
    const s4 = C.starter();
    const fri = C.newDaily(4, C.phrase('durood'), 1000, [5]);
    s4.items.push(fri);
    eq('Friday target on Friday', C.dayTarget(fri, T), 1000);
    eq('no target on Thursday', C.dayTarget(fri, '2026-10-22'), 0);
    eq('Thursday line', C.todayLine(s4, fri, '2026-10-22'), '0 today (no target on Thursdays)');
    eq('days text', C.daysText(fri), 'on Fridays');
    eq('days text two', C.daysText(C.newDaily(5, C.phrase('durood'), 100, [1, 4])), 'on Mon, Thu');

    // streaks
    const s5 = C.starter();
    ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'].forEach(d => C.setCount(s5, d, ist.id, 100));
    C.setCount(s5, '2026-10-17', ist.id, 100); // a gap on the 18th
    eq('streak while today is not done yet', C.streak(s5, ist, T), 4);
    C.setCount(s5, T, ist.id, 40);
    eq('streak today part done', C.streak(s5, ist, T), 4);
    C.setCount(s5, T, ist.id, 100);
    eq('streak today done', C.streak(s5, ist, T), 5);
    eq('streak broken yesterday', C.streak(s5, ist, '2026-10-25'), 0);
    eq('no streak on an empty log', C.streak(C.starter(), ist, T), 0);
    // Friday-only: two Fridays in a row reach 1,000, the days between do not break it
    const s6 = C.starter(); s6.items.push(fri);
    C.setCount(s6, '2026-10-09', fri.id, 1000); C.setCount(s6, '2026-10-16', fri.id, 1200);
    eq('Friday streak on a Thursday', C.streak(s6, fri, '2026-10-22'), 2);
    eq('Friday streak on Friday before counting', C.streak(s6, fri, T), 2);
    C.setCount(s6, '2026-10-09', fri.id, 999);
    eq('Friday streak broken by 999', C.streak(s6, fri, T), 1);
    // a set: 5 rounds needed
    const s7 = C.starter();
    C.setCount(s7, '2026-10-22', set.id, 500); C.setCount(s7, '2026-10-21', set.id, 499);
    eq('set streak', C.streak(s7, set, T), 1);

    // last 7 days
    const s8 = C.starter();
    for (let i = 0; i < 9; i++) C.setCount(s8, C.addDays(T, -i), ist.id, 100 + i);
    const week = C.lastDays(s8, T, 7);
    eq('7 days', week.length, 7);
    eq('week starts today', week[0], T);
    eq('sum of 7 days', C.sumDays(s8, ist.id, week), 100 + 101 + 102 + 103 + 104 + 105 + 106);
    eq('met days', C.metDays(s8, ist, week), { met: 7, of: 7 });
    eq('all time', C.totalAll(s8, ist.id), 900 + 36);

    // big goal: 1,25,000 Ayat-e-Karima by Thursday 29 Oct, shared by 3
    const s9 = C.starter();
    const g = C.newGoal(4, C.phrase('karima'), 125000, '2026-10-29', 3);
    s9.items.push(g);
    C.setCount(s9, '2026-10-21', g.id, 20000); C.setCount(s9, '2026-10-22', g.id, 14500);
    let gs = C.goalStatus(s9, g, T);
    eq('goal done', gs.done, 34500);
    eq('goal left', gs.left, 90500);
    eq('goal days left (23 to 29 Oct, both counted)', gs.daysLeft, 7);
    eq('goal a day', gs.perDay, 12929); // 90,500 / 7 = 12,928.6, rounded up
    eq('goal split', gs.split, { base: 41666, extra: 2, people: 3 });
    eq('split words', C.splitText(gs.split), '2 people do 41,667 and 1 person does 41,666');
    eq('split even', C.splitText(C.splitAmong(125000, 5)), '25,000 each');
    eq('goal line', C.todayLine(s9, g, T), '34,500 of 125,000, 90,500 to go');
    C.setCount(s9, T, g.id, 90500);
    eq('goal reached buzz', C.buzzAfter(s9, g, T), 'target');
    eq('goal line reached', C.todayLine(s9, g, T), '125,000 of 125,000: goal reached');
    gs = C.goalStatus(s9, g, T);
    eq('goal no more a day when done', gs.perDay, 0);
    eq('goal past the date', C.goalStatus(s9, g, '2026-10-31').perDay, null);
    // start again keeps history: offset = what was done
    g.offset = C.totalAll(s9, g.id);
    eq('goal started again', C.goalStatus(s9, g, T).done, 0);
    C.addCount(s9, T, g.id, 100);
    eq('goal 100 after restart is a mark', C.buzzAfter(s9, g, T), 'mark');
    eq('goal with no date has no perDay', C.goalStatus(s9, C.newGoal(5, C.phrase('karima'), 1000), T).perDay, undefined);
    eq('goal streak is 0', C.streak(s9, g, T), 0);

    // summary
    const s10 = C.starter();
    C.setCount(s10, T, ist.id, 64); C.setCount(s10, T, set.id, 245);
    const sum = C.summary(s10, T);
    eq('summary first line', sum.split('\n')[0], 'My dhikr, Fri 23 Oct 2026:');
    eq('summary istighfar', sum.includes('- Astaghfirullah (Istighfar): 64 of 100 today, 36 to go'), true);
    eq('summary week', sum.includes('Last 7 days:'), true);

    // loading saved data
    eq('load rubbish', C.load('{not json'), null);
    eq('load wrong version', C.load({ v: 2, items: [] }), null);
    eq('load null', C.load(null), null);
    const round = C.load(JSON.stringify(s9));
    eq('load keeps items', round.items.length, 4);
    eq('load keeps log', round.log[T][4], 90600);
    const bad = C.load({ v: 1, active: 99, nextId: 1, items: [
        { id: 1, kind: 'daily', name: 'Ok', target: 100, days: [5, 5, 9] },
        { id: 2, kind: 'daily', name: '', target: 100 },
        { id: 3, kind: 'daily', name: 'Neg', target: -1 },
        { id: 4, kind: 'set', name: 'S', steps: [{ name: 'a', count: 0 }], rounds: 5 },
        { id: 5, kind: 'goal', name: 'G', total: 1e12 },
        { id: 1, kind: 'daily', name: 'Dup', target: 5 },
        { id: 6, kind: 'magic', name: 'X' },
        { id: 7, kind: 'daily', name: '<img src=x onerror=alert(1)>', target: 10, days: [0, 1, 2, 3, 4, 5, 6] }],
        log: { '2026-10-23': { 1: 5, 2: 3, 7: -4, 99: 1 }, 'bad': { 1: 1 }, '2026-02-30': { 1: 1 } }, settings: { dayStart: 9, vibrate: 'loud' } });
    eq('load drops bad items', bad.items.map(i => i.id), [1, 7]);
    eq('load cleans days', bad.items[0].days, [5]);
    eq('load all 7 days means every day', bad.items[1].days, null);
    eq('load keeps text as text', bad.items[1].name, '<img src=x onerror=alert(1)>');
    eq('load drops bad log entries', bad.log, { '2026-10-23': { 1: 5 } });
    eq('load fixes active', bad.active, 1);
    eq('load fixes nextId', bad.nextId, 8);
    eq('load fixes settings', bad.settings, { dayStart: 0, vibrate: 'marks' });
    eq('load an empty list', C.load({ v: 1, items: [] }).active, 0);

    const out = (fails.length ? fails.join('\n') + '\n' : '') + pass + ' passed, ' + fails.length + ' failed';
    if (typeof document !== 'undefined') { const pre = document.createElement('pre'); pre.textContent = out; document.body.appendChild(pre); }
    else { console.log(out); if (fails.length) process.exit(1); }
})();
