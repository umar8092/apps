// Logic checks for core.js. Run with: node tests.js   (or open test.html in a browser)
(function () {
    const H = typeof module !== 'undefined' && typeof require !== 'undefined' ? require('./core.js') : window.HabitCore;
    let pass = 0, failed = 0;
    const out = [];
    const eq = (got, want, name) => {
        const ok = JSON.stringify(got) === JSON.stringify(want);
        if (ok) pass++; else { failed++; out.push('FAIL ' + name + '\n   got:  ' + JSON.stringify(got) + '\n   want: ' + JSON.stringify(want)); }
    };
    const habit = (id, from, kind, target, unit, sched, extra) => ({ id, name: id, color: H.COLORS[0], versions: [Object.assign({ from, kind, target, unit, step: 1, sched }, extra || {})] });
    const daily = { type: 'daily' };

    // ---------- dates
    eq(H.add('2026-02-28', 1), '2026-03-01', 'add over February');
    eq(H.add('2024-02-28', 1), '2024-02-29', 'leap day');
    eq(H.add('2026-01-01', -1), '2025-12-31', 'back over new year');
    eq(H.add('2026-03-28', 2), '2026-03-30', 'over summer time change (Europe)');
    eq(H.diff('2026-10-01', '2026-10-14'), 13, 'diff');
    eq(H.dow('2026-10-14'), 3, '14 Oct 2026 is a Wednesday');
    eq(H.weekStart('2026-10-14', 1), '2026-10-12', 'week from Monday');
    eq(H.weekStart('2026-10-14', 0), '2026-10-11', 'week from Sunday');
    eq(H.weekStart('2026-10-11', 1), '2026-10-05', 'Sunday belongs to the week from the Monday before');
    eq([H.valid('2026-02-29'), H.valid('2024-02-29'), H.valid('2026-13-01'), H.valid('x'), H.valid(null)], [false, true, false, false, false], 'valid dates');

    // ---------- typed numbers
    eq(H.parseWhole('8', 0, 100), { n: 8 }, 'plain number');
    eq(H.parseWhole(' 10,000 ', 0, 100000), { n: 10000 }, 'thousands with comma');
    eq(H.parseWhole('10.000', 0, 100000), { n: 10000 }, 'thousands with dot');
    eq(H.parseWhole('1 500', 0, 100000), { n: 1500 }, 'thousands with space');
    eq(H.parseWhole('', 0, 9).error, 'empty', 'blank');
    eq(H.parseWhole('-3', 0, 9).error, 'negative', 'negative');
    eq(H.parseWhole('1.5', 0, 9).error, 'decimal', 'decimal');
    eq(H.parseWhole('8 glasses', 0, 9).error, 'notnumber', 'words');
    eq(H.parseWhole('0', 1, 9).error, 'small', 'zero when 1 is the least');
    eq(H.parseWhole('999999999', 0, 100000).error, 'big', 'huge');

    // ---------- the main situation: 8 glasses of water a day, started Thu 8 Oct, today is Wed 14 Oct
    const today = '2026-10-14';
    const water = habit('water', '2026-10-08', 'count', 8, 'glasses', daily);
    const log = { water: { '2026-10-08': { n: 8 }, '2026-10-09': { n: 8 }, '2026-10-10': { n: 5 }, '2026-10-11': { n: 8 }, '2026-10-12': { n: 8 }, '2026-10-13': { n: 9 }, '2026-10-14': { n: 3 } } };
    eq(H.dayState(water, log, '2026-10-10', today), 'missed', '5 of 8 is missed');
    eq(H.dayState(water, log, today, today), 'todo', 'today not reached yet');
    eq(H.dayState(water, log, '2026-10-07', today), 'before', 'before the start');
    eq(H.dayState(water, log, '2026-10-15', today), 'future', 'tomorrow');
    eq(H.streak(water, log, today, 1), { cur: 3, best: 3, unit: 'day' }, 'streak 3 (11, 12, 13 Oct), today not counted yet');
    eq(H.rate(water, log, today, 1), { met: 5, of: 6, unit: 'day' }, '5 of 6 days, today left out until done');
    let i = H.info(water, log, today, today, 1);
    eq(H.statusText(i, true), '3 of 8 glasses, 5 glasses to go', 'status 3 of 8');
    eq([i.due, i.done], [true, false], 'due, not done');
    log.water[today] = { n: 8 };
    eq(H.streak(water, log, today, 1).cur, 4, 'reaching 8 today makes it 4');
    eq(H.statusText(H.info(water, log, today, today, 1), true), '8 glasses, goal reached', 'goal reached');
    log.water[today] = { n: 7 };
    eq(H.statusText(H.info(water, log, today, today, 1), true), '7 of 8 glasses, 1 glass to go', 'singular glass');
    // a skipped day (ill) never breaks the streak
    log.water['2026-10-10'] = { n: 5, s: 1 };
    eq(H.dayState(water, log, '2026-10-10', today), 'skip', 'skipped day');
    eq(H.streak(water, log, today, 1), { cur: 5, best: 5, unit: 'day' }, 'skip joins the streak');
    eq(H.rate(water, log, today, 1), { met: 5, of: 5, unit: 'day' }, 'skipped day not in the rate');
    eq(H.statusText(H.info(water, log, '2026-10-10', today, 1), false), 'Skipped, does not break the streak', 'skipped status');

    // ---------- goal raised from 8 to 10 on 12 Oct: earlier days keep 8
    const w2 = habit('w2', '2026-10-08', 'count', 8, 'glasses', daily);
    H.applyVersion(w2, { kind: 'count', target: 10, unit: 'glasses', step: 1, sched: daily }, '2026-10-12', false);
    eq(w2.versions.map(v => v.from + ':' + v.target), ['2026-10-08:8', '2026-10-12:10'], 'two versions');
    const l2 = { w2: { '2026-10-11': { n: 8 }, '2026-10-12': { n: 8 } } };
    eq([H.dayState(w2, l2, '2026-10-11', today), H.dayState(w2, l2, '2026-10-12', today)], ['met', 'missed'], 'old goal before, new goal after');
    H.applyVersion(w2, { kind: 'count', target: 9, unit: 'glasses', step: 1, sched: daily }, '2026-10-12', false);
    eq(w2.versions.map(v => v.from + ':' + v.target), ['2026-10-08:8', '2026-10-12:9'], 'same-day change replaces');
    H.applyVersion(w2, { kind: 'count', target: 6, unit: 'glasses', step: 1, sched: daily }, today, true);
    eq(w2.versions.map(v => v.from + ':' + v.target), ['2026-10-08:6'], 'use for earlier days too');
    // start moved earlier / later
    H.setStart(w2, '2026-10-01');
    eq(H.first(w2), '2026-10-01', 'start earlier');
    const w3 = habit('w3', '2026-10-01', 'count', 8, 'glasses', daily);
    H.applyVersion(w3, { kind: 'count', target: 10, unit: 'glasses', step: 1, sched: daily }, '2026-10-05', false);
    H.setStart(w3, '2026-10-07');
    eq(w3.versions.map(v => v.from + ':' + v.target), ['2026-10-07:10'], 'start later keeps the goal in force then');

    // ---------- some days only: gym Mon, Wed, Fri. Rest days never break it.
    const gym = habit('gym', '2026-10-05', 'check', 1, '', { type: 'days', days: [1, 3, 5] });
    const lg = { gym: { '2026-10-05': { n: 1 }, '2026-10-07': { n: 1 }, '2026-10-09': { n: 1 }, '2026-10-12': { n: 1 } } };
    eq(H.dayState(gym, lg, '2026-10-06', today), 'rest', 'Tuesday is a rest day');
    eq(H.streak(gym, lg, today, 1), { cur: 4, best: 4, unit: 'day' }, 'gym streak 4, Wednesday today still to do');
    eq(H.info(gym, lg, '2026-10-13', today, 1).due, false, 'not due on Tuesday');
    lg.gym['2026-10-10'] = { n: 1 };
    eq(H.dayState(gym, lg, '2026-10-10', today), 'extra', 'done on a rest day');
    eq(H.streak(gym, lg, today, 1).cur, 4, 'extra day does not add');
    eq(H.schedText(gym.versions[0], 1), 'Mon, Wed, Fri', 'some days text');
    eq(H.schedText({ sched: { type: 'days', days: [0, 6] } }, 1), 'Weekends', 'weekends text');
    eq(H.schedText({ sched: { type: 'days', days: [1, 2, 3, 4, 5] } }, 1), 'Weekdays (Mon to Fri)', 'weekdays text');
    eq(H.schedText({ sched: { type: 'days', days: [0, 1] } }, 1), 'Mon, Sun', 'week from Monday order');
    eq(H.schedText({ sched: { type: 'days', days: [0, 1] } }, 0), 'Sun, Mon', 'week from Sunday order');
    eq(H.statusText(H.info(gym, lg, '2026-10-13', today, 1), false), 'Not planned for this day', 'rest day status');

    // ---------- 3 times a week (exercise), weeks from Monday
    const ex = habit('ex', '2026-10-05', 'check', 1, '', { type: 'week', times: 3 });
    const le = { ex: { '2026-10-05': { n: 1 }, '2026-10-07': { n: 1 }, '2026-10-10': { n: 1 }, '2026-10-12': { n: 1 } } };
    eq(H.week(ex, le, '2026-10-05', today).state, 'met', 'last week 3 of 3');
    let wk = H.week(ex, le, '2026-10-12', today);
    eq([wk.done, wk.target, wk.state], [1, 3, 'open'], 'this week 1 of 3, still open');
    eq(H.streak(ex, le, today, 1), { cur: 1, best: 1, unit: 'week' }, 'one week in a row, this week open');
    i = H.info(ex, le, today, today, 1);
    eq([i.due, i.done], [true, false], 'due today while week short');
    le.ex['2026-10-13'] = { n: 1 }; le.ex[today] = { n: 1 };
    eq(H.streak(ex, le, today, 1).cur, 2, 'this week met: 2 weeks');
    const exNext = H.info(ex, le, '2026-10-15', '2026-10-15', 1);
    eq([exNext.due, H.statusText(exNext, true)], [false, 'Done 3 of 3 this week, nothing more needed'], 'week met, not due on Thursday');
    // started on a Saturday: only 2 days left that week, so the target is 2
    const ex2 = habit('ex2', '2026-10-10', 'check', 1, '', { type: 'week', times: 3 });
    eq(H.week(ex2, {}, '2026-10-05', today).target, 2, 'part week target');
    // a missed week breaks the streak
    const ex3 = habit('ex3', '2026-09-28', 'check', 1, '', { type: 'week', times: 2 });
    const l3 = { ex3: { '2026-09-28': { n: 1 }, '2026-09-29': { n: 1 }, '2026-10-12': { n: 1 }, '2026-10-13': { n: 1 } } };
    eq(H.streak(ex3, l3, today, 1), { cur: 1, best: 1, unit: 'week' }, 'missed week resets');
    eq(H.rate(ex3, l3, today, 1), { met: 2, of: 3, unit: 'week' }, 'weeks rate');
    // weeks starting Sunday change which days belong together
    const ex4 = habit('ex4', '2026-10-04', 'check', 1, '', { type: 'week', times: 2 });
    const l4 = { ex4: { '2026-10-10': { n: 1 }, '2026-10-11': { n: 1 } } }; // Sat and Sun
    eq([H.week(ex4, l4, H.weekStart('2026-10-10', 1), today).done, H.week(ex4, l4, H.weekStart('2026-10-10', 0), today).done], [2, 1], 'Sat+Sun same week from Monday, split from Sunday');

    // ---------- limit: no more than 2 cups of coffee
    const cof = habit('cof', '2026-10-08', 'limit', 2, 'cups', daily);
    const lc = { cof: { '2026-10-08': { n: 1 }, '2026-10-09': { n: 3 }, '2026-10-11': { n: 2 }, '2026-10-12': { n: 1 } } };
    eq(H.dayState(cof, lc, '2026-10-10', '2026-10-12'), 'met', 'no coffee is within the limit');
    eq(H.dayState(cof, lc, '2026-10-12', '2026-10-12'), 'ontrack', 'today under the limit is on track');
    eq(H.streak(cof, lc, '2026-10-12', 1), { cur: 2, best: 2, unit: 'day' }, 'limit streak does not count today');
    eq(H.statusText(H.info(cof, lc, '2026-10-12', '2026-10-12', 1), true), '1 of 2 cups, 1 cup left', 'limit status');
    lc.cof['2026-10-12'] = { n: 4 };
    eq(H.statusText(H.info(cof, lc, '2026-10-12', '2026-10-12', 1), true), '4 cups, 2 cups over the limit', 'over the limit');
    eq(H.streak(cof, lc, '2026-10-12', 1).cur, 0, 'over the limit today breaks it');
    const zero = habit('zero', '2026-10-08', 'limit', 0, 'cigarettes', daily);
    eq(H.statusText(H.info(zero, {}, today, today, 1), true), '0 cigarettes, on track', 'limit 0');

    // ---------- tick habit
    const vit = habit('vit', today, 'check', 1, '', daily);
    eq(H.statusText(H.info(vit, {}, today, today, 1), true), 'Not done yet', 'check not done');
    eq(H.statusText(H.info(vit, { vit: { [today]: { n: 1 } } }, today, today, 1), true), 'Done', 'check done');
    eq(H.streak(vit, {}, today, 1), { cur: 0, best: 0, unit: 'day' }, 'new habit streak 0');

    // ---------- day totals for the summary
    const tot = H.dayTotals([water, gym, vit], log, today, today, 1);
    eq([tot.due, tot.done], [3, 0], 'three due today, none done (water 7 of 8)');

    // ---------- words
    eq(H.goalText({ kind: 'count', target: 2000, unit: 'ml' }), '2,000 ml a day', 'goal ml');
    eq(H.goalText({ kind: 'limit', target: 1, unit: 'cups' }), 'No more than 1 cup a day', 'goal limit singular');
    eq(H.streakText({ cur: 1, best: 9, unit: 'day' }), 'Streak: 1 day · Best: 9 days', 'streak words');
    eq(H.streakText({ cur: 2, best: 2, unit: 'week' }), 'Streak: 2 weeks', 'streak weeks');
    eq(H.amount(10000, 'steps'), '10,000 steps', 'thousands shown');

    // ---------- saving one day
    const lx = {};
    H.setN(lx, 'a', today, 3); eq(lx, { a: { [today]: { n: 3 } } }, 'set 3');
    H.setN(lx, 'a', today, 0); eq(lx, {}, 'set 0 removes');
    H.setN(lx, 'a', today, 0, true); eq(lx, { a: { [today]: { n: 0, s: 1 } } }, 'skip with 0');
    H.setN(lx, 'a', today, -5); eq(lx, {}, 'negative becomes 0');

    // ---------- checking saved data and backups
    eq(H.clean(null), null, 'null');
    eq(H.clean('x'), null, 'text');
    eq(H.clean({ habits: 'no' }), null, 'habits not a list');
    const dirty = { weekStart: 0, habits: [
        { id: 'ok1', name: '  Drink   water ', color: '#nothex', versions: [{ from: '2026-10-08', kind: 'count', target: 8, unit: 'glasses', step: 1, sched: { type: 'daily' } }] },
        { id: 'BAD ID', name: 'x', versions: [] },
        { id: 'ok2', name: '<img src=x onerror=alert(1)>', versions: [{ from: '2026-10-08', kind: 'check', sched: { type: 'days', days: [1, 1, 9, 3] } }] },
        { id: 'no1', name: '', versions: [{ from: '2026-10-08', kind: 'check', sched: { type: 'daily' } }] },
        { id: 'no2', name: 'Bad target', versions: [{ from: '2026-10-08', kind: 'count', target: -1, sched: { type: 'daily' } }] },
        { id: 'no3', name: 'Limit weekly', versions: [{ from: '2026-10-08', kind: 'limit', target: 2, sched: { type: 'week', times: 2 } }] },
        { id: 'ok1', name: 'duplicate id', versions: [{ from: '2026-10-08', kind: 'check', sched: { type: 'daily' } }] }],
        log: { ok1: { '2026-10-08': { n: 8 }, '2026-02-30': { n: 1 }, '2026-10-09': { n: -4 }, '2026-10-10': { n: 1.5, s: 1 } }, ghost: { '2026-10-08': { n: 1 } } } };
    const c = H.clean(dirty);
    eq(c.habits.map(h => h.id), ['ok1', 'ok2'], 'only valid habits kept');
    eq(c.habits[0].name, 'Drink water', 'name tidied');
    eq(c.habits[0].color, H.COLORS[0], 'bad colour replaced');
    eq(c.habits[1].versions[0].sched, { type: 'days', days: [1, 3] }, 'days cleaned');
    eq(c.log, { ok1: { '2026-10-08': { n: 8 }, '2026-10-10': { n: 0, s: 1 } } }, 'log cleaned');
    eq(c.weekStart, 0, 'week start kept');
    eq(H.clean({ habits: [] }), { habits: [], log: {}, weekStart: 1 }, 'empty is fine');

    // ---------- calendar reminder
    const ics = H.ics(gym, gym.versions[0], '07:30', '2026-10-14', '20261014T000000Z');
    eq(/RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR/.test(ics), true, 'weekly rule');
    eq(/DTSTART:20261014T073000\r\n/.test(ics), true, 'first day is the Wednesday, local time');
    const ics2 = H.ics(water, water.versions[0], '09:00', '2026-10-13', '20261014T000000Z');
    eq(/DTSTART:20261013T090000/.test(ics2) && /RRULE:FREQ=DAILY/.test(ics2) && /SUMMARY:Habit: water \(8 glasses\)/.test(ics2), true, 'daily rule');
    eq(ics.split('\r\n').every(l => l.length <= 75), true, 'lines folded');
    const odd = habit('odd', today, 'check', 1, '', daily); odd.name = 'Floss, then; rinse';
    eq(/SUMMARY:Habit: Floss\\, then\\; rinse/.test(H.ics(odd, odd.versions[0], '22:00', today, 'x')), true, 'ics escaping');

    const summary = (failed ? out.join('\n') + '\n\n' : '') + pass + ' passed, ' + failed + ' failed';
    if (typeof document !== 'undefined' && document.getElementById('out')) document.getElementById('out').textContent = summary;
    else { console.log(summary); if (failed) process.exitCode = 1; }
})();
