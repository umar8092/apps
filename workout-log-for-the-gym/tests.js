// Logic checks for core.js. Run: node tests.js  (or open test.html in a browser)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.WorkoutCore;
    let pass = 0, failed = 0; const out = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); } };
    const at = s => new Date(s).getTime();

    // ---- typing numbers
    eq(C.parseWeight('62.5', 'kg'), { v: 6250 }, '62.5 kg');
    eq(C.parseWeight('62,5', 'kg'), { v: 6250 }, 'comma decimal');
    eq(C.parseWeight(' 61.25 kg ', 'kg'), { v: 6125 }, 'with unit and spaces');
    eq(C.parseWeight('135lb', 'lb'), { v: 13500 }, '135lb');
    eq(C.parseWeight('0', 'kg'), { v: 0 }, '0 kg allowed (no weight)');
    eq(C.parseWeight('', 'kg'), { empty: true }, 'blank weight');
    eq(!!C.parseWeight('-5', 'kg').err, true, 'negative weight refused');
    eq(!!C.parseWeight('abc', 'kg').err, true, 'text weight refused');
    eq(!!C.parseWeight('1000.01', 'kg').err, true, 'over 1000 kg refused');
    eq(C.parseWeight('2200', 'lb'), { v: 220000 }, '2200 lb allowed');
    eq(!!C.parseWeight('2201', 'lb').err, true, 'over 2200 lb refused');
    eq(C.parseWeight('1e3', 'kg').err !== undefined, true, '1e3 refused');
    eq(C.parseReps('8'), { v: 8 }, '8 reps');
    eq(!!C.parseReps('0').err, true, '0 reps refused');
    eq(!!C.parseReps('8.5').err, true, 'half reps refused');
    eq(!!C.parseReps('-3').err, true, 'negative reps refused');
    eq(!!C.parseReps('1000').err, true, '1000 reps refused');
    eq(C.parseReps(' '), { empty: true }, 'blank reps');
    eq(C.parseDuration('1:30'), { v: 90 }, '1:30');
    eq(C.parseDuration('90'), { v: 90 }, '90');
    eq(C.parseDuration('45s'), { v: 45 }, '45s');
    eq(C.parseDuration('1m 30s'), { v: 90 }, '1m 30s');
    eq(C.parseDuration('2 min'), { v: 120 }, '2 min');
    eq(C.parseDuration('1:02:05'), { v: 3725 }, '1:02:05');
    eq(!!C.parseDuration('0').err, true, '0 seconds refused');
    eq(!!C.parseDuration('1:75').err, true, '1:75 refused');
    eq(!!C.parseDuration('-10').err, true, 'negative time refused');

    // ---- showing numbers
    eq(C.fmtNum(6250), '62.5', '62.5');
    eq(C.fmtNum(6125), '61.25', '61.25');
    eq(C.fmtNum(6000), '60', '60');
    eq(C.fmtNum(138000), '1,380', 'thousands');
    eq(C.fmtNum(605), '6.05', '6.05');
    eq(C.weightIn(13500, 'lb', 'kg'), 6120, '135 lb is 61.2 kg');
    eq(C.weightIn(6000, 'kg', 'lb'), 13230, '60 kg is 132.3 lb');
    eq(C.weightIn(6250, 'kg', 'kg'), 6250, 'same unit is exact');
    eq(C.fmtSec(45), '45 s', '45 s');
    eq(C.fmtSec(90), '1:30', '1:30');
    eq(C.fmtSec(3725), '1:02:05', 'an hour');
    eq(C.clock(84.2), '1:25', 'countdown rounds up');
    eq(C.clock(-3), '0:00', 'countdown never below 0');
    eq(C.fmtLen(52 * 60000), '52 min', '52 min');
    eq(C.fmtLen(65 * 60000), '1 h 5 min', '1 h 5 min');
    eq(C.fmtLen(120 * 60000), '2 h', '2 h');
    eq(C.fmtRest(90), '1:30 min', 'rest 1:30');
    eq(C.fmtRest(120), '2 min', 'rest 2 min');
    eq(C.fmtRest(0), 'Off', 'rest off');

    // ---- 1-rep max (Epley)
    eq(C.e1rmG(60000, 8), 76000, '60 x 8 is about 76 kg');
    eq(C.e1rmG(65000, 5), 75833, '65 x 5');
    eq(C.e1rmG(100000, 1), 100000, 'a single is itself');
    eq(C.e1rmG(60000, 15), null, 'no estimate past 12 reps');
    eq(C.e1rmText({ w: 6500, u: 'kg', r: 5 }, 'kg'), 'est. 1-rep max 75.8 kg', 'e1rm text');

    // ---- the main situation: Push day, last time Mon 12 Oct
    const d = C.emptyData();
    const plans = C.addPreset(d, 'ppl');
    eq(plans.map(p => p.name), ['Push', 'Pull', 'Legs'], 'preset plans');
    eq(d.exercises.length, 17, 'preset exercises: Push 6 + Pull 5 + Legs 6, no duplicates');
    eq(C.addPreset(d, 'ul').map(p => p.name), ['Upper', 'Lower'], 'second preset');
    eq(d.exercises.length, 17, 'Upper/Lower reuse the same exercises');
    eq(C.addPreset(d, 'full').map(p => p.name), ['Full body'], 'third preset');
    eq(C.addPreset(d, 'full').map(p => p.name), ['Full body 2'], 'same plan name twice gets a number');
    const bench = C.findExByName(d, 'bench PRESS'), pull = C.findExByName(d, 'Pull-up'), plank = C.findExByName(d, 'Plank');
    eq([bench.kind, pull.kind, plank.kind], ['weight', 'body', 'time'], 'kinds');
    eq(C.getOrAddExercise(d, '  Bench   press ', 'time').id, bench.id, 'same name reuses the exercise');
    const S = (id, startIso, endIso, entries) => ({ id, name: 'Push', plan: plans[0].id, start: at(startIso), end: endIso ? at(endIso) : null, entries });
    const kg = (w, r, x) => Object.assign({ w: w * 100, u: 'kg', r, at: 0 }, x || {});
    d.sessions.push(S(901, '2026-10-05T18:00:00', '2026-10-05T19:00:00', [{ ex: bench.id, sets: [kg(65, 5), kg(60, 6)], note: '' }]));
    d.sessions.push(S(902, '2026-10-12T18:00:00', '2026-10-12T18:50:00', [
        { ex: bench.id, sets: [kg(20, 10, { wu: true }), kg(60, 8), kg(60, 8), kg(60, 7)], note: 'Felt easy' },
        { ex: pull.id, sets: [{ r: 8, u: 'kg', at: 0 }, { r: 7, u: 'kg', at: 0 }], note: '' },
        { ex: plank.id, sets: [{ t: 60, u: 'kg', at: 0 }], note: '' }]));
    const lt = C.lastTime(d, bench.id, at('2026-10-16T18:00:00'));
    eq(C.fmtDay(lt.session.start, at('2026-10-16T18:00:00')), 'Mon 12 Oct', 'last time day');
    eq(C.setsText('weight', lt.sets, 'kg'), '60 kg: 8, 8, 7 reps', 'last time sets (warm-up left out)');
    eq(lt.note, 'Felt easy', 'last time note');
    eq(C.setsText('weight', [kg(60, 8), kg(62.5, 6)], 'kg'), '60 kg × 8, 62.5 kg × 6', 'mixed weights');
    eq(C.setsText('weight', [kg(60, 8)], 'lb'), '132.3 lb: 8 reps', 'shown in lb');
    eq(C.setsText('body', lt.session.entries[1].sets, 'kg'), '8, 7 reps', 'bodyweight reps');
    eq(C.setsText('body', [kg(10, 6)], 'kg'), '+10 kg: 6 reps', 'bodyweight with extra');
    eq(C.setsText('time', [{ t: 60 }], 'kg'), '1:00', 'plank time');
    eq(C.setsText('weight', [kg(100, 1)], 'kg'), '100 kg: 1 rep', 'one rep');
    const be = C.bestEver(d, bench.id, 'weight');
    eq(C.setText('weight', be.set, 'kg'), '60 kg × 8', 'best ever by est 1RM (76 kg beats 65x5 at 75.8)');
    eq(C.bestEver(d, pull.id, 'body').set.r, 8, 'best pull-up set');
    eq(C.bestEver(d, 999, 'weight'), null, 'no best for a new exercise');

    // today: Fri 16 Oct
    const today = S(903, '2026-10-16T18:05:00', null, [{ ex: bench.id, sets: [], note: '' }, { ex: pull.id, sets: [], note: '' }, { ex: plank.id, sets: [], note: '' }]);
    d.sessions.push(today);
    eq(C.suggestNext(d, today, bench.id, 'kg'), { w: 6000, r: 8, t: 0 }, 'first set suggested from last time');
    today.entries[0].sets.push(kg(20, 10, { wu: true }));
    eq(C.suggestNext(d, today, bench.id, 'kg'), { w: 2000, r: 10, t: 0 }, 'after a warm-up the warm-up is suggested');
    today.entries[0].sets.push(kg(62.5, 8, { at: at('2026-10-16T18:10:00') }));
    eq(C.suggestNext(d, today, bench.id, 'kg'), { w: 6250, r: 8, t: 0 }, 'then the last work set');
    let b = C.sessionBests(d, today);
    eq(b[bench.id + ':1'] && b[bench.id + ':1'].text, 'New best: most reps at this weight', '62.5 x 8 beats every set at 62.5+ (65 x 5 has fewer reps)');
    eq(b[bench.id + ':0'], undefined, 'warm-up is never a best');
    today.entries[0].sets.push(kg(67.5, 3, { at: at('2026-10-16T18:14:00') }));
    today.entries[0].sets.push(kg(60, 8, { at: at('2026-10-16T18:18:00') }));
    b = C.sessionBests(d, today);
    eq(b[bench.id + ':2'] && b[bench.id + ':2'].text, 'New best: heaviest ever', '67.5 is the heaviest ever');
    eq(b[bench.id + ':3'], undefined, '60 x 8 again is not a best');
    today.entries[1].sets.push({ r: 9, u: 'kg', at: at('2026-10-16T18:30:00') });
    today.entries[2].sets.push({ t: 75, u: 'kg', at: at('2026-10-16T18:40:00') });
    b = C.sessionBests(d, today);
    eq(b[pull.id + ':0'] && b[pull.id + ':0'].text, 'New best: most reps', 'pull-up 9 reps');
    eq(b[plank.id + ':0'] && b[plank.id + ':0'].text, 'New best: longest hold, 1:15', 'plank 1:15');
    eq(C.bestKind('weight', kg(60, 8), []), null, 'first time is not called a best');
    today.end = at('2026-10-16T18:57:00');
    const sm = C.summary(d, today, 'kg');
    eq(sm.sets, 5, 'work sets (warm-up not counted)');
    eq(C.fmtW(sm.volume, 'kg'), '1,182.5 kg', 'lifted: 62.5x8 + 67.5x3 + 60x8 = 500 + 202.5 + 480');
    eq(sm.exercisesDone, 3, 'exercises done');
    eq(C.fmtLen(sm.lengthMs), '52 min', 'length 18:05 to 18:57');
    eq(sm.bests.map(x => x.name + ': ' + x.text), ['Bench press: 67.5 kg × 3', 'Pull-up: 9 reps', 'Plank: 1:15'], 'bests in the summary');
    eq(C.summary(d, today, 'lb').volume, 260700, 'lifted in lb: 1182.5 kg = 2607.0 lb');
    const text = C.sessionTextPlain(d, today, 'kg', at('2026-10-16T19:00:00'));
    eq(text.split('\n').slice(0, 7), ['Push, Fri 16 Oct 18:05 (52 min)', '5 sets, 1,182.5 kg lifted', '', 'Bench press', '  Warm-up: 20 kg × 10', '  Set 1: 62.5 kg × 8  (New best: most reps at this weight)', '  Set 2: 67.5 kg × 3  (New best: heaviest ever)'], 'copy text');
    // skipped exercise
    const t2 = S(904, '2026-10-17T10:00:00', '2026-10-17T10:30:00', [{ ex: bench.id, sets: [kg(60, 5)], note: '' }, { ex: pull.id, sets: [], note: '' }]);
    eq(C.summary(d, t2, 'kg').skipped, ['Pull-up'], 'skipped exercise listed');

    // ---- the week (Fri 16 Oct; weeks from Monday 12 Oct)
    eq(C.isoDay(C.weekStartMs(at('2026-10-16T20:00:00'), 1)), '2026-10-12', 'week from Monday');
    eq(C.isoDay(C.weekStartMs(at('2026-10-16T20:00:00'), 0)), '2026-10-11', 'week from Sunday');
    eq(C.isoDay(C.weekStartMs(at('2026-10-12T00:30:00'), 1)), '2026-10-12', 'Monday just after midnight');
    eq(C.weekStats(d, at('2026-10-16T20:00:00'), 1), { workouts: 2, sets: 11 }, 'this week: 12 Oct (3+2+1 sets) and today (3+1+1 work sets)');
    eq(C.ago(at('2026-10-12T18:00:00'), at('2026-10-16T09:00:00')), '4 days ago', 'ago');
    eq(C.ago(at('2026-10-15T23:50:00'), at('2026-10-16T00:10:00')), 'yesterday', 'just before midnight is yesterday');
    eq(C.fmtDay(at('2025-12-30T10:00:00'), at('2026-10-16T10:00:00')), 'Tue 30 Dec 2025', 'other year shows the year');
    eq(C.atTime('2026-10-16', '18:05'), at('2026-10-16T18:05:00'), 'atTime');
    eq(C.atTime('2026-02-30', '18:05'), null, 'no 30 Feb');
    eq(C.atTime('2026-10-16', '25:00'), null, 'bad time');

    // ---- progress
    eq(C.progressPoints(d, bench.id, 'weight', 'kg').map(p => p.v), [65, 60, 67.5], 'heaviest per workout');
    eq(C.progressLabel('body', d, pull.id), 'Most reps in one set per workout', 'pull-up label');
    eq(C.progressPoints(d, pull.id, 'body', 'kg').map(p => p.v), [8, 9], 'pull-up reps per workout');
    eq(C.exerciseStats(d, bench.id), { sessions: 3, sets: 8, last: at('2026-10-16T18:05:00') }, 'bench stats');

    // ---- CSV with formula guard
    const d2 = C.emptyData(); const ex = C.getOrAddExercise(d2, '=HYPERLINK("x")', 'weight');
    d2.sessions.push({ id: 50, name: 'A, "B"', plan: null, start: at('2026-10-16T18:00:00'), end: at('2026-10-16T19:00:00'), entries: [{ ex: ex.id, sets: [kg(1234.5 / 10, 5)], note: '' }] });
    eq(C.csv(d2, 'kg').split('\r\n')[1], '2026-10-16,18:00,"A, ""B""","\'=HYPERLINK(""x"")",1,,123.45,5,,', 'csv row');

    // ---- saved data checks
    eq(C.validate(null), null, 'null is not data');
    eq(C.validate({ foo: 1 }), null, 'other data');
    eq(C.validate('x'), null, 'a string');
    const v = C.validate(JSON.parse(JSON.stringify(d)));
    eq(v.sessions.length, 3, 'valid data kept');
    eq(v.live, null, 'no workout in progress (today was finished)');
    const bad = { exercises: [{ id: 1, name: 'A', kind: 'x' }, { id: 1, name: 'B' }, { id: 2, name: 'a' }, { id: 3, name: '' }, { id: 4, name: 'Plank', kind: 'time', rest: 99999 }],
        plans: [{ id: 5, name: 'P', ex: [1, 1, 77, 4] }, { id: 5, name: 'dup' }],
        sessions: [{ id: 6, name: '', start: 1000, end: 500, entries: [{ ex: 1, sets: [{ w: -1, r: 5 }, { w: 500, r: 5, u: 'kg' }, { w: 500, r: 0 }, { r: 3 }] }, { ex: 1, sets: [] }, { ex: 4, sets: [{ t: 30 }, { r: 5 }] }] },
                   { id: 7, start: 2000, end: null, entries: [{ ex: 1, sets: [{ w: 100, r: 1, at: 2500 }] }] }, { id: 7, start: 5 }, { id: 8, start: 3000, end: null, entries: [] }], live: { rest: { ex: 1, ends: 9, total: 90 } }, nextId: 2 };
    const vb = C.validate(bad);
    eq(vb.exercises.map(e => e.name + ':' + e.kind + ':' + e.rest), ['A:weight:null', 'Plank:time:null'], 'bad exercises cleaned');
    eq(vb.plans.map(p => p.name + ':' + p.ex.join('+')), ['P:1+4'], 'bad plans cleaned');
    eq(vb.sessions.map(s => s.id), [6, 7, 8], 'sessions kept');
    eq(vb.sessions[0].name, 'Workout', 'blank name');
    eq(vb.sessions[0].entries.length, 2, 'duplicate entry dropped');
    eq(vb.sessions[0].entries[0].sets, [{ u: 'kg', at: 0, w: 500, r: 5 }, { u: 'kg', at: 0, r: 3, w: 0 }], 'bad sets dropped');
    eq(vb.sessions[0].entries[1].sets, [{ u: 'kg', at: 0, t: 30 }], 'time sets need seconds');
    eq(vb.live.id, 8, 'newest open workout is the live one');
    eq([vb.sessions[0].end, vb.sessions[1].end], [1000, 2500], 'older open workouts closed at their last set');
    eq(vb.live.rest, { ex: 1, ends: 9, total: 90 }, 'rest timer kept');
    eq(vb.nextId, 9, 'next id after the biggest');

    const msg = pass + ' passed, ' + failed + ' failed' + (out.length ? '\n' + out.join('\n') : '');
    if (typeof document !== 'undefined') { const p = document.createElement('pre'); p.textContent = msg; document.body.appendChild(p); }
    else { console.log(msg); if (failed) process.exitCode = 1; }
})();
