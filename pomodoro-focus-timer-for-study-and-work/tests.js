// Logic checks for core.js. Run: node tests.js   (or open test.html in a browser)
(function () {
    'use strict';
    const isNode = typeof module !== 'undefined' && module.exports !== undefined && typeof window === 'undefined';
    const F = isNode ? require('./core.js') : window.Focus;
    let pass = 0, failed = 0;
    const out = [];
    function eq(got, want, name) {
        const g = JSON.stringify(got), w = JSON.stringify(want);
        if (g === w) pass++; else { failed++; out.push('FAIL ' + name + '\n  got  ' + g + '\n  want ' + w); }
    }
    const at = (d, h, m, s) => new Date(2026, 9, d, h, m, s || 0).getTime();  // October 2026, local time
    const M = F.MIN;

    // formatting
    eq(F.countdown(25 * M), '25:00', 'countdown 25 min');
    eq(F.countdown(1), '00:01', 'countdown rounds up the last second');
    eq(F.countdown(0), '00:00', 'countdown zero');
    eq(F.countdown(-500), '00:00', 'countdown never negative');
    eq(F.countdown(90 * M + 5000), '1:30:05', 'countdown with hours');
    eq(F.duration(100), '1 h 40 min', 'duration 100');
    eq(F.duration(60), '1 h', 'duration 60');
    eq(F.duration(0), '0 min', 'duration 0');
    eq(F.duration(25), '25 min', 'duration 25');
    eq(F.parseWhole(' 45 ', 1, 180), 45, 'parse 45');
    ['', '0', '181', '-5', '2.5', '1e2', 'abc', null].forEach(v => eq(F.parseWhole(v, 1, 180), null, 'parse refuses ' + v));

    // settings cleaning
    const S = F.cleanSettings({});
    eq([S.focus, S.short, S.long, S.every, S.goal, S.sound], [25, 5, 15, 4, 0, 'bell'], 'default settings');
    eq(F.cleanSettings({ focus: 0, short: 999, long: '20', every: -1, sound: 'loud', autoBreak: 'yes' }), Object.assign({}, S, { long: 20 }), 'bad settings fall back');

    // the worked example: 25/5/15, long break after 4. Sara on Sat 17 Oct.
    const tasks = [{ id: 'thesis', name: 'Thesis chapter 2', est: 4, done: false, created: 0 }, { id: 'mail', name: 'Emails', est: null, done: false, created: 0 }];
    let t = F.newTimer(S, 'focus'), recs = [];
    t.taskId = 'thesis';
    function runFocus(startMs) {
        t = F.start(t, startMs);
        eq(t.endsAt, startMs + 25 * M, 'block ends 25 min after start');
        const r = F.advance(t, S, startMs + 25 * M + 1000, tasks);  // noticed 1 s later: live
        t = r.timer; recs = F.mergeRecords(recs, r.records);
        return r;
    }
    let r = runFocus(at(17, 9, 0));
    eq([t.mode, t.status, t.cycle, r.ended[0].live], ['short', 'idle', 1, true], 'after block 1: short break waiting');
    eq(r.records[0].mins, 25, 'block 1 is 25 min');
    t = F.start(t, at(17, 9, 25)); r = F.advance(t, S, at(17, 9, 30, 1), tasks); t = r.timer;
    eq([t.mode, t.status, t.cycle], ['focus', 'idle', 1], 'break over: focus waiting (no auto start)');
    runFocus(at(17, 9, 30));
    t = F.start(t, at(17, 9, 55)); t = F.advance(t, S, at(17, 10, 0, 1), tasks).timer;
    runFocus(at(17, 10, 0));
    t = F.start(t, at(17, 10, 25)); t = F.advance(t, S, at(17, 10, 30, 1), tasks).timer;
    t.taskId = 'mail';
    r = runFocus(at(17, 10, 30));
    eq([t.mode, t.cycle, r.ended[0].next], ['long', 4, 'long'], 'after block 4: long break');
    eq(t.remaining, 15 * M, 'long break is 15 min');
    t = F.start(t, at(17, 10, 55)); t = F.advance(t, S, at(17, 11, 10, 2), tasks).timer;
    eq([t.mode, t.cycle], ['focus', 0], 'long break resets the count');
    // block 5 on the thesis, stopped after 12 min, counted
    t.taskId = 'thesis';
    t = F.start(t, at(17, 11, 10));
    t = F.pause(t, at(17, 11, 22));
    eq(F.elapsedAt(t, at(17, 11, 40)), 12 * M, 'paused time does not count');
    let s = F.stopEarly(t, S, at(17, 11, 40), 'reset', true, tasks);
    recs = F.mergeRecords(recs, s.records); t = s.timer;
    eq([s.records[0].mins, s.records[0].full, t.mode, t.status, t.remaining], [12, false, 'focus', 'idle', 25 * M], 'stopped early: 12 min counted, clock back to 25:00');
    const day = F.recordsOn(recs, '2026-10-17'), tot = F.totals(day);
    eq([tot.mins, tot.blocks, tot.partMins], [112, 4, 12], 'today: 1 h 52 min, 4 blocks + 12 min');
    eq(F.duration(tot.mins) + ' · ' + F.blocksText(tot), '1 h 52 min · 4 blocks + 12 min', 'today line');
    const split = F.byTask(day, tasks).map(g => [g.name, g.mins, F.blocksText(g)]);
    eq(split, [['Thesis chapter 2', 87, '3 blocks + 12 min'], ['Emails', 25, '1 block']], 'per task');
    eq(F.summaryText(recs, tasks, '2026-10-17'), 'Focus time, Sat 17 Oct 2026: 1 h 52 min (4 blocks + 12 min)\n- Thesis chapter 2: 1 h 27 min (3 blocks + 12 min)\n- Emails: 25 min (1 block)', 'summary text');
    eq(F.taskTotals(recs, 'thesis').blocks, 3, 'thesis: 3 of 4 blocks');

    // stop under a minute: nothing counted
    t = F.start(F.newTimer(S, 'focus'), at(17, 12, 0));
    eq(F.stopEarly(t, S, at(17, 12, 0, 40), 'skip', true, tasks).records.length, 0, 'under a minute is never counted');
    s = F.stopEarly(t, S, at(17, 12, 10), 'skip', false, tasks);
    eq([s.records.length, s.timer.mode, s.timer.cycle], [0, 'short', 0], 'skip, not counted: short break, count unchanged');
    // 30 s rounds: 12 min 29 s -> 12, 12 min 30 s -> 13
    eq(F.stopEarly(t, S, at(17, 12, 12, 30), 'skip', true, tasks).records[0].mins, 13, 'rounds to whole minutes');
    // skipping a break goes to focus; skipping a long break resets the count
    let lb = Object.assign(F.newTimer(S, 'long'), { cycle: 4 });
    eq([F.stopEarly(lb, S, at(17, 1, 0), 'skip', true, tasks).timer.mode, F.stopEarly(lb, S, at(17, 1, 0), 'skip', true, tasks).timer.cycle], ['focus', 0], 'skip long break');
    eq(F.stopEarly(F.start(F.newTimer(S, 'short'), at(17, 1, 0)), S, at(17, 1, 3), 'skip', true, tasks).records.length, 0, 'breaks are never counted');

    // phone locked for the whole evening: auto breaks on, auto focus on. Only one block counted; focus never starts by itself while away.
    const A = Object.assign({}, S, { autoBreak: true, autoFocus: true });
    t = F.start(F.newTimer(A, 'focus'), at(17, 18, 0));
    r = F.advance(t, A, at(17, 23, 0), tasks);
    eq([r.records.length, r.timer.mode, r.timer.status, r.ended.map(e => e.mode)], [1, 'focus', 'idle', ['focus', 'short']], 'away all evening: 1 block, short break ran, focus waits');
    eq(r.ended.every(e => !e.live), true, 'catch-up is not live (no sound)');
    // live with auto focus: break ends while watching -> next focus starts at the exact end time
    t = F.start(F.newTimer(A, 'short'), at(17, 9, 25));
    r = F.advance(t, A, at(17, 9, 30, 2), tasks);
    eq([r.timer.mode, r.timer.status, r.timer.endsAt], ['focus', 'running', at(17, 9, 55)], 'auto focus starts at the end time');
    // auto break: focus ends -> break runs from the end time
    t = F.start(F.newTimer(A, 'focus'), at(17, 9, 0));
    r = F.advance(t, A, at(17, 9, 26), tasks);
    eq([r.timer.mode, r.timer.status, r.timer.endsAt], ['short', 'running', at(17, 9, 30)], 'auto break');
    // not ended yet: nothing changes
    t = F.start(F.newTimer(S, 'focus'), at(17, 9, 0));
    eq(F.advance(t, S, at(17, 9, 24, 59), tasks).records.length, 0, 'not ended yet');
    eq(F.remainingAt(t, at(17, 9, 24, 59)), 1000, 'one second left');

    // never long break; long break after 2
    const N = Object.assign({}, S, { every: 0 });
    eq(F.breakAfter(4, N), 'short', 'never long break');
    eq([F.breakAfter(1, Object.assign({}, S, { every: 2 })), F.breakAfter(2, Object.assign({}, S, { every: 2 }))], ['short', 'long'], 'long break after 2');

    // a new day starts the count again
    t = Object.assign(F.newTimer(S, 'focus'), { cycle: 3, cycleDay: '2026-10-16' });
    eq(F.start(t, at(17, 8, 0)).cycle, 0, 'new day resets count');
    eq(F.start(Object.assign({}, t, { cycleDay: '2026-10-17' }), at(17, 8, 0)).cycle, 3, 'same day keeps count');

    // across midnight: the block belongs to the day it started
    t = F.start(F.newTimer(S, 'focus'), at(17, 23, 50));
    r = F.advance(t, S, at(18, 0, 15, 1), tasks);
    eq([F.recordsOn(r.records, '2026-10-17').length, F.recordsOn(r.records, '2026-10-18').length], [1, 0], 'midnight block counts for the start day');

    // settings while running vs idle
    const S50 = Object.assign({}, S, { focus: 50 });
    eq(F.applySettings(F.newTimer(S, 'focus'), S50).remaining, 50 * M, 'idle timer takes the new length');
    t = F.start(F.newTimer(S, 'focus'), at(17, 9, 0));
    eq(F.applySettings(t, S50).endsAt, at(17, 9, 25), 'running block keeps its length');
    r = F.advance(t, S50, at(17, 9, 25, 1), tasks);
    eq(r.records[0].mins, 25, 'block recorded with the length it ran');

    // two tabs finishing the same block save it once
    eq(F.mergeRecords(r.records, r.records).length, 1, 'no double count');

    // tasks
    eq(F.splitTasks('- Revise chapter 3\n2. Maths homework\n\n* revise chapter 3\n[ ] Email tutor\n   '), ['Revise chapter 3', 'Maths homework', 'Email tutor'], 'pasted list');
    eq(F.cleanName('  a\tb\u0007 c  '), 'a b c', 'clean name');
    eq(F.cleanName('x'.repeat(300)).length, 120, 'long names cut to 120');

    // week and streak
    const wk = [at(13, 9, 0), at(15, 9, 0), at(16, 9, 0), at(17, 9, 0), at(17, 10, 0)].map((st, i) => ({ id: 'w' + i, start: st, end: st + 25 * M, mins: 25, task: null, name: '', full: true }));
    const w = F.week(wk, '2026-10-17');
    eq([w.days.length, w.days[0].key, w.days[6].mins, w.mins, w.blocks, w.active, w.max], [7, '2026-10-11', 50, 125, 5, 4, 50], 'week totals');
    eq(F.streak(wk, '2026-10-17'), 3, 'three days in a row (15, 16, 17)');
    eq(F.streak(wk, '2026-10-18'), 3, 'streak still alive the next morning');
    eq(F.streak(wk, '2026-10-19'), 0, 'streak broken');
    eq(F.streak([], '2026-10-19'), 0, 'no streak when empty');

    // CSV
    const c = F.csv([{ id: 'a', start: at(17, 9, 0), end: at(17, 9, 25), mins: 25, task: null, name: '=SUM(1,2) "x"', full: true }], []);
    eq(c, 'Date,Start,End,Minutes,Task,Full block\n2026-10-17,09:00,09:25,25,"\'=SUM(1,2) ""x""",yes\n', 'csv quoting and formula guard');

    // saved data validation
    const bad = F.cleanData({ tasks: [{ id: 'ok', name: ' Hi ' }, { id: 'ok', name: 'dup' }, { id: '<b>', name: 'x' }, { id: 'n', name: '   ' }, null, 5],
        records: [{ start: at(17, 9, 0), end: at(17, 9, 25), mins: 25 }, { start: 'x' }, { start: at(17, 9, 0), end: at(17, 8, 0), mins: 5 }, { start: at(17, 9, 0), end: at(17, 9, 25), mins: 0 }],
        timer: { mode: 'nap', status: 'running', endsAt: 'soon', taskId: 'gone' }, settings: { focus: 45 } });
    eq([bad.tasks.map(x => x.name), bad.records.length, bad.timer.mode, bad.timer.status, bad.timer.taskId, bad.settings.focus], [['Hi'], 1, 'focus', 'idle', null, 45], 'corrupt data cleaned');
    eq(F.cleanData('garbage').tasks, [], 'string data');
    eq(F.cleanData(null).timer.remaining, 25 * M, 'empty data fresh timer');
    eq(F.cleanData([1, 2]).records, [], 'array data');
    const kept = F.cleanData({ timer: { mode: 'focus', status: 'running', length: 25 * M, startedAt: at(17, 9, 0), endsAt: at(17, 9, 25), cycle: 2, cycleDay: '2026-10-17' } }).timer;
    eq([kept.status, kept.endsAt, kept.cycle], ['running', at(17, 9, 25), 2], 'running timer survives reload');
    const paused = F.cleanData({ timer: { mode: 'short', status: 'paused', length: 5 * M, startedAt: at(17, 9, 0), remaining: 2 * M } }).timer;
    eq([paused.mode, paused.status, paused.remaining], ['short', 'paused', 2 * M], 'paused timer survives reload');

    const summary = (failed ? 'FAILED ' : 'ALL PASSED ') + pass + ' passed, ' + failed + ' failed';
    if (isNode) { out.forEach(l => console.log(l)); console.log(summary); process.exit(failed ? 1 : 0); }
    else { const pre = document.createElement('pre'); pre.textContent = out.concat(summary).join('\n'); document.body.appendChild(pre); }
})();
