// Checks for core.js. Run: node tests.js   (or open test.html in a browser)
(function () {
    const T = typeof require !== 'undefined' ? (require('./core.js'), globalThis.IntervalTimer) : window.IntervalTimer;
    let pass = 0; const fails = [];
    const eq = (got, want, name) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else fails.push(name + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); };
    const S = 1000, T0 = new Date(2026, 9, 18, 19, 0, 0).getTime();   // Sun 18 Oct 2026, 7:00 pm
    const preset = id => JSON.parse(JSON.stringify(T.PRESETS.find(p => p.id === id).w));
    const form = w => Object.assign({}, w, { warm: T.fmt(w.warm), work: T.fmt(w.work), rest: T.fmt(w.rest), setRest: T.fmt(w.setRest), cool: T.fmt(w.cool), rounds: String(w.rounds), sets: String(w.sets), moves: w.moves.map(m => ({ name: m.name, secs: m.secs ? String(m.secs) : '' })) });

    // reading lengths
    eq(T.parseDur('40'), { secs: 40 }, '40 = 40 s');
    eq(T.parseDur('1:30'), { secs: 90 }, '1:30');
    eq(T.parseDur('0:45'), { secs: 45 }, '0:45');
    eq(T.parseDur('2m'), { secs: 120 }, '2m');
    eq(T.parseDur('2 min'), { secs: 120 }, '2 min');
    eq(T.parseDur('1.5 min'), { secs: 90 }, '1.5 min');
    eq(T.parseDur('1,5 min'), { secs: 90 }, 'comma decimal');
    eq(T.parseDur('30s'), { secs: 30 }, '30s');
    eq(T.parseDur(' 30 sec '), { secs: 30 }, 'spaces and sec');
    eq(T.parseDur('1:00:00'), { secs: 3600 }, '1 hour');
    eq(T.parseDur('20.4'), { secs: 20 }, 'rounds to whole seconds');
    eq(T.parseDur(''), { secs: 0 }, 'blank rest is 0');
    eq(T.parseDur('0'), { secs: 0 }, '0 rest allowed');
    eq(T.parseDur('', { label: 'work time', min: 1 }).error, 'Type the work time, for example 40 or 1:30.', 'blank work refused');
    eq(T.parseDur('0', { label: 'work time', min: 1 }).error, 'The work time must be at least 1 second.', 'zero work refused');
    eq(T.parseDur('-10', { label: 'rest time' }).error, 'The rest time cannot be below 0.', 'negative refused');
    eq(T.parseDur('ten', { label: 'rest time' }).error, 'Type the rest time as seconds (40) or minutes:seconds (1:30).', 'words refused');
    eq(T.parseDur('1:75', { label: 'rest time' }).error, 'Type the rest time as seconds (40) or minutes:seconds (1:30).', '1:75 refused');
    eq(T.parseDur('3601', { label: 'warm-up' }).error, 'The longest warm-up is 1 h.', 'over an hour refused');
    eq(T.parseDur('99999999').error !== undefined, true, 'huge refused');
    eq(T.parseCount('8', 'rounds', 100), { n: 8 }, '8 rounds');
    eq(T.parseCount('', 'rounds', 100).error, 'Type the number of rounds, for example 8.', 'blank rounds');
    eq(T.parseCount('0', 'rounds', 100).error, 'You need at least 1 of the rounds.', 'zero rounds');
    eq(T.parseCount('-2', 'rounds', 100).error, 'The number of rounds cannot be below 1.', 'negative rounds');
    eq(T.parseCount('8.5', 'rounds', 100).error, 'Type the number of rounds as a whole number, for example 8.', 'decimal rounds');
    eq(T.parseCount('101', 'rounds', 100).error, 'The most rounds is 100.', 'too many rounds');

    // names and pasted lists
    eq(T.cleanName('  Jumping\n jacks  '), 'Jumping jacks', 'name tidied');
    eq(T.cleanName('x'.repeat(80)).length, 40, 'name cut to 40');
    eq(T.parseMoveList('1. Squats\n- Push-ups\n\n• Plank 1:00\nWall sit - 45s\nBurpees (30 s)'),
        [{ name: 'Squats', secs: null }, { name: 'Push-ups', secs: null }, { name: 'Plank', secs: 60 }, { name: 'Wall sit', secs: 45 }, { name: 'Burpees', secs: 30 }], 'pasted list');
    eq(T.parseMoveList('Squats, Lunges; Crunches'), [{ name: 'Squats', secs: null }, { name: 'Lunges', secs: null }, { name: 'Crunches', secs: null }], 'one line with commas');
    eq(T.parseMoveList('Push-ups 2 min'), [{ name: 'Push-ups', secs: 120 }], 'minutes at the end');
    eq(T.parseMoveList('100 squats'), [{ name: '100 squats', secs: null }], 'a number at the start stays in the name');
    eq(T.parseMoveList('   \n  '), [], 'blank paste');
    eq(T.parseMoveList(Array.from({ length: 70 }, (_, i) => 'Move ' + (i + 1)).join('\n')).length, 50, 'at most 50 moves');

    // the worked example: Circuit preset. Warm-up 3:00, 3 sets of 4 rounds 0:40 work / 0:20 rest, 1:00 between sets, cool-down 2:00
    const circuit = preset('circuit');
    let blocks = T.buildBlocks(circuit);
    eq(T.totalOf(blocks), 1080, 'circuit total 18:00 (180 + 3 x (4x40 + 3x20) + 2 x 60 + 120)');
    eq(blocks.length, 25, 'circuit has 25 steps');
    eq(blocks.map(b => b.kind).slice(0, 10), ['warm', 'work', 'rest', 'work', 'rest', 'work', 'rest', 'work', 'setrest', 'work'], 'order of steps');
    eq(blocks.filter(b => b.kind === 'work').map(b => b.name).slice(0, 5), ['Squats', 'Push-ups', 'Lunges', 'Plank', 'Squats'], 'moves repeat each set');
    eq(blocks[blocks.length - 1].kind, 'cool', 'ends with cool-down');
    eq(blocks.filter(b => b.kind === 'rest').length, 9, 'no rest after the last round of a set');
    eq(T.describe(circuit), 'Warm-up 3:00 · 3 sets of 4 rounds: 0:40 work, 0:20 rest · 1:00 rest between sets · Cool-down 2:00 · 4 moves named', 'description');
    // Tabata: 8 x 20 s + 7 x 10 s = 3:50
    eq(T.totalOf(T.buildBlocks(preset('tabata'))), 230, 'Tabata 3:50');
    eq(T.totalOf(T.buildBlocks(preset('emom'))), 600, 'EMOM 10 min, no 0-second rests');
    eq(T.buildBlocks(preset('emom')).length, 10, 'EMOM has 10 steps');
    eq(T.totalOf(T.buildBlocks(preset('3030'))), 570, '30/30 x 10 = 9:30');
    eq(T.totalOf(T.buildBlocks(preset('stretch'))), 230, 'stretching 6 x 30 + 5 x 10');
    // a move with its own time
    const own = Object.assign(T.blank(), { rounds: 3, moves: [{ name: 'Squats', secs: null }, { name: 'Plank', secs: 60 }] });
    eq(T.buildBlocks(own).filter(b => b.kind === 'work').map(b => [b.name, b.secs]), [['Squats', 40], ['Plank', 60], ['Squats', 40]], 'own time per move');
    // one round, one set: just the work
    eq(T.buildBlocks(Object.assign(T.blank(), { rounds: 1 })).map(b => b.kind), ['work'], 'single round');

    // reading the whole form
    eq(T.readForm(form(circuit)).w, circuit, 'form round trip');
    let r = T.readForm(Object.assign(form(circuit), { work: '', rounds: 'x' }));
    eq(Object.keys(r.errors).sort(), ['rounds', 'work'], 'form errors per field');
    r = T.readForm(Object.assign(form(T.blank()), { sets: '1', setRest: 'junk' }));
    eq(r.w.setRest, 60, 'set rest ignored with one set');
    r = T.readForm(Object.assign(form(T.blank()), { work: '60:00', rest: '0', rounds: '100', sets: '20' }));
    eq(/longest is 3 hours/.test(r.errors.total), true, 'over 3 hours refused');
    r = T.readForm(Object.assign(form(T.blank()), { moves: [{ name: '', secs: '' }, { name: 'Plank', secs: 'abc' }, { name: '', secs: '30' }] }));
    eq(Object.keys(r.errors), ['move1', 'move2'], 'bad move time and a time with no name');
    r = T.readForm(Object.assign(form(T.blank()), { moves: [{ name: '   ', secs: '' }] }));
    eq(r.w.moves, [], 'empty move rows ignored');

    // running: the circuit started at 7:00:00 pm
    let run = T.startRun(circuit, T0);
    let p = T.position(run, T0);
    eq([p.block.kind, T.fmtLeft(p.blockLeft), T.fmtLeft(p.left)], ['warm', '3:00', '18:00'], 'start: warm-up 3:00, 18:00 left');
    p = T.position(run, T0 + 180 * S);
    eq([p.block.kind, p.block.name, p.block.round, p.block.set, T.fmtLeft(p.blockLeft)], ['work', 'Squats', 1, 1, '0:40'], '3:00 in: Squats round 1 set 1');
    p = T.position(run, T0 + 179.2 * S);
    eq([p.block.kind, T.fmtLeft(p.blockLeft)], ['warm', '0:01'], 'shows 0:01 until the step ends');
    p = T.position(run, T0 + (180 + 220 + 10) * S);
    eq([p.block.kind, T.fmtLeft(p.blockLeft), p.next.name, p.next.set], ['setrest', '0:50', 'Squats', 2], 'set rest, then set 2');
    p = T.position(run, T0 + 1080 * S);
    eq(p.done, true, 'done at 18:00');
    // pause and resume keep the step
    run = T.startRun(circuit, T0);
    T.pause(run, T0 + 200 * S);
    p = T.position(run, T0 + 500 * S);
    eq([p.block.name, T.fmtLeft(p.blockLeft)], ['Squats', '0:20'], 'paused stays at Squats 0:20');
    T.resume(run, T0 + 500 * S);
    p = T.position(run, T0 + 510 * S);
    eq([p.block.name, T.fmtLeft(p.blockLeft)], ['Squats', '0:10'], 'resumed carries on');
    eq(T.activeSecs(run, T0 + 510 * S), 210, 'pause not counted as workout time');
    // skip and back
    run = T.startRun(circuit, T0);
    T.skip(run, T0 + 10 * S);
    p = T.position(run, T0 + 10 * S);
    eq([p.block.name, T.fmtLeft(p.blockLeft)], ['Squats', '0:40'], 'skip the warm-up');
    T.back(run, T0 + 11 * S);
    p = T.position(run, T0 + 11 * S);
    eq([p.block.kind, T.fmtLeft(p.blockLeft)], ['warm', '3:00'], 'back within 3 s goes to the step before');
    T.skip(run, T0 + 12 * S);
    T.back(run, T0 + 22 * S);
    p = T.position(run, T0 + 22 * S);
    eq([p.block.name, T.fmtLeft(p.blockLeft)], ['Squats', '0:40'], 'back after 3 s starts the step again');
    T.back(run, T0 + 22 * S);
    eq(T.position(run, T0 + 22 * S).block.kind, 'warm', 'back on the first second of a step goes to the one before');
    T.jump(run, 0, T0 + 22 * S);
    T.back(run, T0 + 22 * S);
    eq(T.position(run, T0 + 22 * S).block.kind, 'warm', 'back on the first step stays');
    // skip while paused stays paused at the new step
    run = T.startRun(circuit, T0);
    T.pause(run, T0 + 5 * S);
    T.skip(run, T0 + 60 * S);
    p = T.position(run, T0 + 90 * S);
    eq([p.block.name, T.fmtLeft(p.blockLeft), run.pausedAt != null], ['Squats', '0:40', true], 'skip while paused');
    // skip past the last step finishes
    run = T.startRun(Object.assign(T.blank(), { rounds: 1 }), T0);
    T.skip(run, T0 + S);
    eq(T.position(run, T0 + S).done, true, 'skipping the last step ends the workout');
    // sounds
    run = T.startRun(preset('tabata'), T0);
    const c = T.cues(run, 0, true);
    eq(c.slice(0, 5).map(x => [x.at / S, x.kind]), [[0, 'work'], [17, 'tick'], [18, 'tick'], [19, 'tick'], [20, 'rest']], 'beeps: start, 3-2-1, rest');
    eq(c.filter(x => x.kind === 'tick').length, 8 * 3 + 7 * 3, '3-2-1 on every step of 5 s or more');
    eq(c[c.length - 1], { at: 230 * S, kind: 'done' }, 'done beep at the end');
    eq(T.cues(run, 0, false).filter(x => x.kind === 'tick').length, 0, 'no 3-2-1 when switched off');
    eq(T.cues(run, 225 * S, true).map(x => x.at / S), [227, 228, 229, 230], 'only sounds still to come');

    // showing time
    eq([T.fmt(0), T.fmt(40), T.fmt(90), T.fmt(1080), T.fmt(3725)], ['0:00', '0:40', '1:30', '18:00', '1:02:05'], 'fmt');
    eq([T.fmtWords(45), T.fmtWords(1280), T.fmtWords(3840), T.fmtWords(3600)], ['45 s', '21 min 20 s', '1 h 4 min', '1 h'], 'fmtWords');

    // history and week stats (Sun 18 Oct 2026; the week starts Mon 12 Oct)
    const day = (d, h) => new Date(2026, 9, d, h || 19).getTime();
    const hist = [{ at: day(10), secs: 600 }, { at: day(12), secs: 1080 }, { at: day(16), secs: 900 }, { at: day(17), secs: 230 }, { at: day(18, 7), secs: 1080 }];
    eq(T.stats(hist, T0), { weekCount: 4, weekSecs: 3290, monthCount: 5, monthSecs: 3890, streak: 3 }, 'week, 30 days and streak');
    eq(T.stats([{ at: day(17), secs: 60 }], T0).streak, 1, 'streak still counts from yesterday');
    eq(T.stats([{ at: day(15), secs: 60 }], T0).streak, 0, 'streak broken');
    eq(T.stats([], T0), { weekCount: 0, weekSecs: 0, monthCount: 0, monthSecs: 0, streak: 0 }, 'empty history');
    eq(new Date(T.weekStart(T0)).getDate(), 12, 'week starts on Monday');

    // saved data
    eq(T.sanitize('{bad').damaged, true, 'corrupt JSON starts fresh');
    eq(T.sanitize('[1,2]').damaged, true, 'wrong shape starts fresh');
    eq(T.sanitize('null').current, T.fresh().current, 'null starts fresh');
    let st = T.sanitize(JSON.stringify({ current: { name: '<b>x</b>', work: -5, rest: 'x', rounds: 1e9, sets: 2, setRest: 30, moves: [{ name: 'A', secs: 0 }, { name: 5 }, null] },
        settings: { beeps: false, voice: 'yes' }, saved: [{ id: 'a1', w: { work: 30 } }, { id: 'BAD ID', w: {} }],
        history: [{ id: 'h1', at: day(17), secs: 600, planned: 1080, full: false }, { id: 'h2', at: 5 }, { id: 'h3', at: Date.now() + 9e9 }] }), T0);
    eq(st.current.work, 40, 'bad work time replaced');
    eq(st.current.rounds, 8, 'huge rounds replaced');
    eq(st.current.name, '<b>x</b>', 'name kept as plain text');
    eq(st.current.moves, [{ name: 'A', secs: null }], 'bad moves dropped');
    eq([st.settings.beeps, st.settings.voice], [false, false], 'settings checked');
    eq(st.saved.map(s => s.id), ['a1'], 'bad saved workout dropped');
    eq(st.history.map(h => h.id), ['h1'], 'bad history dropped');
    // a running workout survives a reload
    run = T.startRun(circuit, T0); T.pause(run, T0 + 200 * S);
    st = T.sanitize(JSON.stringify({ run }), T0);
    eq([T.position(st.run, T0 + 999 * S).block.name, T.fmtLeft(T.position(st.run, T0 + 999 * S).blockLeft), st.run.rounds, st.run.sets], ['Squats', '0:20', 4, 3], 'saved run restored');
    st = T.sanitize(JSON.stringify({ run: Object.assign({}, run, { blocks: [{ kind: 'nope', secs: 5 }] }) }), T0);
    eq(st.run, null, 'damaged run dropped');

    const out = fails.length ? 'FAILED ' + fails.length + ' of ' + (pass + fails.length) + ':\n' + fails.join('\n') : 'All ' + pass + ' checks passed.';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out; else { console.log(out); if (fails.length) process.exit(1); }
})();
