// Logic checks for core.js. Run: node tests.js   (or open test.html in a browser)
(function () {
    'use strict';
    const isNode = typeof module !== 'undefined' && module.exports !== undefined && typeof window === 'undefined';
    const F = isNode ? require('./core.js') : window.Fast;
    let pass = 0, failed = 0;
    const out = [];
    function eq(got, want, name) {
        const g = JSON.stringify(got), w = JSON.stringify(want);
        if (g === w) pass++; else { failed++; out.push('FAIL ' + name + '\n  got  ' + g + '\n  want ' + w); }
    }
    const at = (d, h, m) => new Date(2026, 9, d, h, m || 0).getTime();  // October 2026, local time
    const M = F.MIN;
    const fast = (id, s, e, goalH, note) => ({ id, start: s, end: e, goalMin: (goalH || 16) * 60, note: note || '' });

    // formatting
    eq(F.duration(870), '14 h 30 min', 'duration 14 h 30');
    eq(F.duration(960), '16 h', 'duration 16 h');
    eq(F.duration(45), '45 min', 'duration 45 min');
    eq(F.duration(0), '0 min', 'duration 0');
    eq(F.duration(-5), '0 min', 'duration never negative');
    eq(F.duration(3 * 24 * 60 + 5), '72 h 5 min', 'duration past a day stays in hours');
    eq(F.stopwatch(14 * 3600000 + 30 * M + 5000), '14:30:05', 'stopwatch');
    eq(F.stopwatch(30 * 3600000), '30:00:00', 'stopwatch past 24 h');
    eq(F.stopwatch(-1), '0:00:00', 'stopwatch never negative');
    eq(F.clock(at(21, 20, 0), false), '20:00', 'clock 24 h');
    eq(F.clock(at(21, 20, 5), true), '8:05 pm', 'clock 12 h pm');
    eq(F.clock(at(21, 0, 30), true), '12:30 am', 'clock 12 h midnight');
    eq(F.clock(at(21, 12, 0), true), '12:00 pm', 'clock 12 h noon');
    eq(F.dayWord(at(22, 9), at(22, 23)), 'today', 'today');
    eq(F.dayWord(at(21, 20), at(22, 10)), 'yesterday', 'yesterday');
    eq(F.dayWord(at(23, 1), at(22, 22)), 'tomorrow', 'tomorrow');
    eq(F.dayWord(at(18, 1), at(22, 22)), 'Sun 18 Oct', 'older date');

    // typed dates and goals
    eq(F.parseLocal('2026-10-21', '20:00'), at(21, 20), 'parse local');
    eq(F.parseLocal('2026-02-30', '20:00'), null, 'refuses 30 Feb');
    eq(F.parseLocal('', '20:00'), null, 'refuses blank date');
    eq(F.parseLocal('2026-10-21', ''), null, 'refuses blank time');
    eq(F.parseLocal('2026-10-21', '24:00'), null, 'refuses 24:00');
    eq(F.parseGoal('16', ''), 960, 'goal 16');
    eq(F.parseGoal('16.5', ''), 990, 'goal 16.5');
    eq(F.parseGoal('16,5', ''), 990, 'goal with comma');
    eq(F.parseGoal('16', '30'), 990, 'goal 16 h 30 min');
    eq(F.parseGoal('36', ''), 2160, 'goal 36 h');
    eq(F.parseGoal('168', ''), 10080, 'goal 168 h is the limit');
    ['', '0', '0.5', '169', '-4', 'abc', '1e2', null].forEach(v => eq(F.parseGoal(v, ''), null, 'goal refuses ' + v));
    eq(F.parseGoal('16', '60'), null, 'goal refuses 60 minutes');
    eq(F.parseGoal('0', '59'), null, 'goal under 1 h refused');
    eq(F.planName(960), '16:8', 'plan name 16:8');
    eq(F.planName(1380), 'OMAD 23:1', 'plan name OMAD');
    eq(F.planName(13 * 60), '13:11', 'plan name custom whole hours');
    eq(F.planName(990), '16 h 30 min fast', 'plan name custom minutes');
    eq(F.planName(36 * 60), '36 h fast', 'plan name 36 h');
    eq([F.windowMin(960), F.windowMin(1380), F.windowMin(1440), F.windowMin(2160)], [480, 60, 0, 0], 'eating windows');

    // the main situation: 16:8, last meal 20:00 yesterday, it is 10:30 now
    let d = F.emptyData();
    eq(F.status(d, at(22, 10, 30)).mode, 'idle', 'empty state is idle');
    d.current = { start: at(21, 20), goalMin: 960 };
    let s = F.status(d, at(22, 10, 30));
    eq([s.mode, F.minsOf(s.elapsed), s.reached, s.leftMin, s.goalText, s.startText], ['fasting', 870, false, 90, '12:00 today', '20:00 yesterday'], '14 h 30 fasted, eat at 12:00, 1 h 30 left');
    eq(Math.round(s.pct * 1000), 906, 'ring 90.6% full');
    s = F.status(d, at(22, 11, 59) + 30000);
    eq([s.reached, s.leftMin], [false, 1], 'half a minute left still shows 1 min');
    s = F.status(d, at(22, 12, 0));
    eq([s.reached, s.extraMin, s.pct], [true, 0, 1], 'goal reached exactly at 12:00');
    s = F.status(d, at(22, 12, 40));
    eq([s.reached, s.extraMin, s.pct, s.forgot], [true, 40, 1, false], '40 min past goal, ring stays full');
    eq(F.status(d, at(23, 0, 1)).forgot, true, 'over 12 h past the goal suggests "forgot to end"');
    d.settings.h12 = true;
    eq(F.status(d, at(22, 10, 30)).goalText, '12:00 pm today', '12-hour clock in text');
    d.settings.h12 = false;

    // ending the fast: 16 h 10 min logged, then the 8 h eating window
    d = F.emptyData();
    d.fasts = [fast('a', at(21, 20), at(22, 12, 10), 16)];
    eq([F.fastMin(d.fasts[0]), F.isMet(d.fasts[0])], [970, true], 'saved fast 16 h 10 met');
    s = F.status(d, at(22, 15, 0));
    eq([s.mode, s.lastMin, s.met, s.windowMin, s.nextText, s.windowLeftMin, s.windowOver, s.eatingMin], ['eating', 970, true, 480, '20:10 today', 310, false, 170], 'eating window: next fast by 20:10, 5 h 10 left');
    s = F.status(d, at(22, 21, 0));
    eq([s.windowOver, s.windowLeftMin], [true, 0], 'window over after 20:10');
    eq(F.status(d, at(24, 13, 0)).mode, 'idle', 'more than 2 days after the last fast is idle again');
    // a short fast
    const short = fast('b', at(21, 20), at(22, 8, 0), 16);
    eq([F.fastMin(short), F.isMet(short)], [720, false], '12 h of a 16 h goal is short');
    eq(F.isMet(fast('c', at(21, 20), at(22, 11, 59) + 59999, 16)), false, '15 h 59 min 59 s does not meet 16 h (minutes are whole)');
    // a 36 h fast has no eating window
    d.fasts = [fast('d', at(20, 20), at(22, 8), 36)];
    s = F.status(d, at(22, 9));
    eq([s.windowMin, s.nextAt, s.eatingMin], [0, null, 60], '36 h fast: no window, eating 1 h');

    // midnight crossing and a clock change (Europe ends summer time on 25 Oct 2026; elapsed time is real time)
    const crossing = fast('e', at(24, 22), at(25, 14), 16);
    const realMin = (crossing.end - crossing.start) / M;
    eq(F.fastMin(crossing), realMin, 'length is real elapsed time, whatever the clock change');

    // checking typed fasts
    const list = [fast('x', at(19, 20), at(20, 12), 16), fast('y', at(20, 21), at(21, 13), 16)];
    const now = at(22, 10);
    eq(F.checkFast(list, { start: null, end: at(21, 18), goalMin: 960 }, now, false).field, 'start', 'blank start refused');
    eq(F.checkFast(list, { start: at(21, 18), end: null, goalMin: 960 }, now, false).field, 'end', 'blank end refused');
    eq(F.checkFast(list, { start: at(21, 18), end: at(21, 17), goalMin: 960 }, now, false).field, 'end', 'end before start refused');
    eq(F.checkFast(list, { start: at(21, 18), end: at(21, 18), goalMin: 960 }, now, false).field, 'end', 'zero length refused');
    eq(F.checkFast(list, { start: at(21, 18), end: at(22, 11), goalMin: 960 }, now, false).field, 'end', 'end in the future refused');
    eq(F.checkFast(list, { start: at(1, 18), end: at(9, 18), goalMin: 960 }, now, false).field, 'end', 'over 7 days refused');
    eq(F.checkFast(list, { start: at(21, 18), end: at(22, 9), goalMin: null }, now, false).field, 'goal', 'missing goal refused');
    let r = F.checkFast(list, { start: at(20, 11), end: at(20, 22), goalMin: 960 }, now, false);
    eq(r.error, 'This overlaps the fast from 20:00 Mon 19 Oct to 12:00 Tue 20 Oct.', 'overlap names the other fast');
    r = F.checkFast(list, { start: at(21, 14), end: at(22, 6), goalMin: 960, note: '  felt\ngood ' }, now, false);
    eq(r.fast, { start: at(21, 14), end: at(22, 6), goalMin: 960, note: 'felt good' }, 'good fast accepted, note cleaned');
    eq(!!F.checkFast(list, { start: at(19, 20), end: at(20, 13), goalMin: 960 }, now, false, 'x').fast, true, 'editing a fast does not overlap itself');
    eq(F.cleanNote('a'.repeat(200)).length, 80, 'long note cut to 80');
    // starting a fast earlier
    eq(F.checkStart(list, at(21, 20), now, false).start, at(21, 20), 'start after last fast ok');
    eq(!!F.checkStart(list, at(21, 12), now, false).error, true, 'start before the last fast ended refused');
    eq(!!F.checkStart(list, at(22, 11), now, false).error, true, 'start in the future refused');
    eq(!!F.checkStart(list, null, now, false).error, true, 'blank start refused');
    eq(!!F.checkStart([], at(10, 11), now, false).error, true, 'start over 7 days ago refused');

    // week stats and streak
    const hist = [
        fast('1', at(15, 20), at(16, 12), 16),          // 16 h met, day 16 (the first of the 7 days when today is the 22nd)
        fast('2', at(16, 20), at(17, 12, 30), 16),      // 16 h 30 met, day 17
        fast('3', at(17, 20), at(18, 10), 16),          // 14 h short, day 18
        fast('4', at(18, 20), at(19, 13), 16),          // 17 h met, 19
        fast('5', at(19, 20), at(20, 12), 16),          // 16 h met, 20
        fast('6', at(20, 20), at(21, 14), 18)           // 18 h met, 21
    ];
    let w = F.week(hist, at(22, 10));
    eq([w.count, w.met, w.totalMin, w.avgMin, w.longestWeekMin, w.streak], [6, 5, 5850, 975, 1080, 3], 'week: 6 fasts, 5 met, average 16 h 15, streak 3 (counted from yesterday)');
    eq(w.days.map(x => x.mins), [960, 990, 840, 1020, 960, 1080, 0], 'bars by end day');
    eq(w.days[6].today, true, 'last bar is today');
    eq(w.longestEver.id, '6', 'longest ever');
    hist.push(fast('7', at(21, 21), at(22, 13, 5), 16));
    w = F.week(hist, at(22, 14));
    eq(w.streak, 4, 'streak grows when today has a met fast');
    eq(F.streak([], at(22, 10)), 0, 'no fasts no streak');
    eq(F.streak([fast('z', at(19, 20), at(20, 12), 16)], at(22, 10)), 0, 'gap of a day breaks the streak');
    eq(F.week([], at(22, 10)).avgMin, 0, 'empty week average 0');
    eq(F.week([fast('m1', at(21, 1), at(21, 9), 8), fast('m2', at(21, 10), at(21, 20), 8)], at(22, 10)).days[5], { key: '2026-10-21', label: 'Wed', today: false, mins: 600, goalMin: 480, met: true, count: 2 }, 'two fasts on one day: bar shows the longest');

    // summary and CSV
    const sd = F.emptyData(); sd.fasts = F.sortFasts([fast('a', at(21, 20), at(22, 12, 10), 16, 'felt fine'), fast('b', at(20, 20), at(21, 8), 16)]);
    const txt = F.summaryText(sd, at(22, 13));
    eq(txt.includes('Fasts: 2, goal met 1 of 2'), true, 'summary counts');
    eq(txt.includes('Wed 21 Oct 20:00 to Thu 22 Oct 12:10: 16 h 10 min (goal 16 h met) - felt fine'), true, 'summary line with note');
    eq(txt.includes('Tue 20 Oct 20:00 to Wed 21 Oct 08:00: 12 h (goal 16 h, 4 h short)'), true, 'summary short line');
    const c = F.csv([fast('q', at(21, 20), at(22, 12, 10), 16, 'said "hi", ok')], false).split('\n');
    eq(c[1], '2026-10-21,20:00,2026-10-22,12:10,16:10,970,960,yes,"said ""hi"", ok"', 'csv row with quoted note');

    // cleaning saved data
    eq(F.cleanData(null, now).data, F.emptyData(), 'null data starts fresh');
    eq(F.cleanData('garbage', now).data.fasts, [], 'string data starts fresh');
    const dirty = F.cleanData({ settings: { goalMin: 5, h12: 'yes', notify: true }, current: { start: now + 3600000, goalMin: 960 },
        fasts: [fast('a', at(21, 20), at(22, 8), 16), { start: 'x' }, fast('a', at(19, 20), at(20, 8), 16), fast('n', at(18, 20), at(18, 10), 16), fast('g', at(17, 20), at(18, 8), 999)] }, now);
    eq([dirty.data.settings.goalMin, dirty.data.settings.h12, dirty.data.settings.notify], [960, false, true], 'bad settings fixed');
    eq(dirty.data.current, null, 'future current fast dropped');
    eq(dirty.data.fasts.map(f => f.id), ['a', 'ax'], 'bad fasts dropped, duplicate id renamed, newest first');
    eq(dirty.dropped, 4, 'dropped count');
    const ok = F.cleanData({ current: { start: at(21, 20), goalMin: 960 } }, now).data.current;
    eq(ok, { start: at(21, 20), goalMin: 960, notified: false }, 'good current kept');

    const msg = 'core.js: ' + pass + ' passed, ' + failed + ' failed' + (out.length ? '\n' + out.join('\n') : '');
    if (isNode) { console.log(msg); if (failed) process.exit(1); }
    else { const pre = document.createElement('pre'); pre.textContent = msg; document.body.appendChild(pre); }
})();
