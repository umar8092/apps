// Checks for core.js. Run: node contraction-timer-for-labour/tests.js   (or open test.html in a browser)
(function () {
    const CT = typeof module === 'object' && module.exports ? require('./core.js') : window.CT;
    let pass = 0; const fails = [];
    function eq(got, want, what) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(what + ': got ' + g + ', want ' + w); }
    const T0 = new Date(2026, 9, 15, 2, 0, 0).getTime(), S = 1000, M = 60000;
    // n contractions, `gap` seconds apart, each lasting `len` seconds, starting at `from`
    const series = (n, gap, len, from) => Array.from({ length: n }, (_, i) => ({ id: 'c' + i, start: (from || T0) + i * gap * S, end: (from || T0) + i * gap * S + len * S }));

    // formatting and reading lengths
    eq(CT.fmtLen(65), '1:05', 'fmtLen 65'); eq(CT.fmtLen(0), '0:00', 'fmtLen 0'); eq(CT.fmtLen(3725), '1:02:05', 'fmtLen 1h');
    eq(CT.fmtLen(-4), '0:00', 'fmtLen negative'); eq(CT.fmtWords(65), '1 min 5 sec', 'words'); eq(CT.fmtWords(3720), '1 h 2 min', 'words h'); eq(CT.fmtWords(45), '45 sec', 'words s'); eq(CT.fmtWords(3600), '1 h', 'words 1h');
    eq(CT.parseLen('1:05'), 65, 'parse m:ss'); eq(CT.parseLen('65'), 65, 'plain = seconds'); eq(CT.parseLen('50s'), 50, 'parse 50s');
    eq(CT.parseLen('1m 5s'), 65, 'parse 1m 5s'); eq(CT.parseLen('1 min 5 sec'), 65, 'parse words'); eq(CT.parseLen('2 min'), 120, 'parse 2 min'); eq(CT.parseLen('1.5 min'), 90, 'parse 1.5 min'); eq(CT.parseLen('1,5 min'), 90, 'parse comma decimal');
    eq(CT.parseLen(''), null, 'blank'); eq(CT.parseLen('   '), null, 'spaces'); eq(CT.parseLen('abc'), null, 'text'); eq(CT.parseLen('1:75'), null, 'bad seconds'); eq(CT.parseLen('-5'), null, 'negative'); eq(CT.parseLen(null), null, 'null'); eq(CT.parseLen(' 1:05 \n'), 65, 'pasted with spaces');

    // rules
    eq(CT.cleanRule({ preset: '511' }).apart, 300, '5-1-1 apart'); eq(CT.cleanRule(null).label, '5-1-1', 'default rule');
    eq(CT.cleanRule({ preset: 'zzz' }).preset, '511', 'unknown preset -> 5-1-1');
    eq(CT.cleanRule({ preset: 'custom', apart: 420, last: 45, hold: 90 }).label, '7-0:45-1 h'.replace('1 h', '90 min'), 'custom label');
    eq(CT.cleanRule({ preset: 'custom', apart: 99999, last: -3, hold: 'x' }), { preset: 'custom', apart: 900, last: 20, hold: 60, label: '15-0:20-1' }, 'custom clamps');
    eq(CT.cleanRule({ preset: 'custom', apart: 270, last: 60, hold: 60 }).label, '4:30-1-1', 'custom 4.5 min');
    eq(CT.ruleWords(CT.cleanRule({})), 'contractions 5 min apart or closer, each lasting 1 min or more, for 1 hour', 'rule words');
    eq([CT.holdWords(60), CT.holdWords(120), CT.holdWords(90), CT.lastWords(60), CT.lastWords(45)], ['1 hour', '2 hours', '1 h 30 min', 'the last hour', 'the last 45 min'], 'hold words');

    // apart = start to start
    const a = CT.withApart([{ id: 'b', start: T0 + 5 * M, end: T0 + 5 * M + 70 * S }, { id: 'a', start: T0, end: T0 + 60 * S }]);
    eq(a.map(c => [c.id, c.len, c.apart]), [['a', 60, null], ['b', 70, 300]], 'apart from start to start, sorted');

    // empty
    let r = CT.evaluate([], {}, T0);
    eq([r.total, r.met, r.avgApart, r.count], [0, false, null, 0], 'empty log');

    // the main case: every 5:00, lasting 1:00, from 02:00. Reached at 03:01 (end of the 03:00 one), not at 02:56.
    const five = series(13, 300, 60);
    r = CT.evaluate(five, '511', T0 + 61 * M);
    eq([r.met, r.avgApart, r.avgLen, r.count, r.okHold], [true, 300, 60, 12, true], '5-1-1 reached after an hour');
    eq(CT.evaluate(five.slice(0, 12), '511', T0 + 56 * M).met, false, 'not reached at 02:56 (only 56 min timed)');
    eq(CT.evaluate(five.slice(0, 12), '511', T0 + 56 * M).okApart, true, 'apart fine at 02:56');
    eq(CT.firstMet(five, '511'), T0 + 61 * M, 'first reached at 03:01');
    // running contraction (end in the future) is not counted
    eq(CT.evaluate(five, '511', T0 + 60 * M + 30 * S).total, 12, 'contraction still going is not counted');

    // too far apart: every 7 minutes for 90 minutes
    r = CT.evaluate(series(14, 420, 60), '511', T0 + 92 * M);
    eq([r.met, r.okApart, r.okLen, r.okHold, r.avgApart], [false, false, true, true, 420], '7 min apart is not 5-1-1');
    // too short: every 4 min lasting 40 s
    r = CT.evaluate(series(17, 240, 40), '511', T0 + 65 * M);
    eq([r.met, r.okApart, r.okLen], [false, true, false], 'lasting 40 s is not 5-1-1');
    // boundary: exactly 5:00 and exactly 1:00 counts; 5:01 does not
    eq(CT.evaluate(series(14, 301, 60), '511', T0 + 66 * M).okApart, false, '5:01 apart fails');
    eq(CT.evaluate(series(14, 300, 59), '511', T0 + 66 * M).okLen, false, '0:59 long fails');
    // 4-1-1 vs 5-1-1 on the same log (every 4:30)
    const f430 = series(16, 270, 65);
    eq(CT.evaluate(f430, '511', T0 + 69 * M).met, true, '4:30 apart meets 5-1-1');
    eq(CT.evaluate(f430, { preset: '411' }, T0 + 69 * M).met, false, '4:30 apart does not meet 4-1-1');
    eq(CT.evaluate(f430, { preset: 'custom', apart: 270, last: 60, hold: 60 }, T0 + 69 * M).met, true, 'custom 4.5-1-1 met');
    // irregular but average fine: gaps 4,6,4,6... (avg 5:00)
    const irr = []; let t = T0; for (let i = 0; i < 15; i++) { irr.push({ id: 'i' + i, start: t, end: t + 62 * S }); t += (i % 2 ? 360 : 240) * S; }
    r = CT.evaluate(irr, '511', irr[14].end);
    eq([r.met, r.avgApart], [true, 300], 'irregular gaps averaging 5:00');

    // paused: last started 11 minutes ago with a 5 minute rule
    r = CT.evaluate(five, '511', five[12].start + 11 * M);
    eq([r.paused, r.met], [true, false], 'contractions stopped -> paused, not met');
    eq(CT.evaluate(five, '511', five[12].start + 9 * M).paused, false, '9 minutes is not paused yet');

    // yesterday's false alarm must not count toward the hour
    const old = series(5, 300, 60, T0 - 20 * 60 * M);
    const today = series(8, 300, 60);   // 35 minutes so far
    r = CT.evaluate(old.concat(today), '511', today[7].end);
    eq([r.met, r.okHold, r.timedFor], [false, false, 35 * 60 + 60], 'earlier stretch does not count');
    eq(CT.currentRun(CT.withApart(old.concat(today)), CT.cleanRule({})).length, 8, 'run starts after a long gap');

    // one or two contractions only
    eq(CT.evaluate(series(1, 300, 60), '511', T0 + 2 * M).avgApart, null, 'one contraction: no apart');
    r = CT.evaluate(series(2, 300, 60), '511', T0 + 7 * M);
    eq([r.avgApart, r.met], [300, false], 'two contractions');

    // checking a typed contraction
    const items = series(3, 300, 60);
    eq(CT.checkOne(items, { id: 'n', start: T0 + 16 * M, end: T0 + 16 * M + 60 * S }, T0 + 20 * M), '', 'valid new one');
    eq(/at least 5 seconds/.test(CT.checkOne(items, { id: 'n', start: T0 + 16 * M, end: T0 + 16 * M + 3 * S }, T0 + 20 * M)), true, 'too short');
    eq(/longer than 10 minutes/.test(CT.checkOne(items, { id: 'n', start: T0 + 16 * M, end: T0 + 27 * M }, T0 + 30 * M)), true, 'too long');
    eq(/not happened yet/.test(CT.checkOne(items, { id: 'n', start: T0 + 19 * M, end: T0 + 21 * M }, T0 + 20 * M)), true, 'future');
    eq(/overlaps/.test(CT.checkOne(items, { id: 'n', start: T0 + 5 * M + 30 * S, end: T0 + 7 * M }, T0 + 20 * M)), true, 'overlap');
    eq(CT.checkOne(items, Object.assign({}, items[1], { end: items[1].end + 10 * S }), T0 + 20 * M), '', 'editing itself is not an overlap');
    eq(/Choose/.test(CT.checkOne(items, { id: 'n', start: NaN, end: NaN }, T0)), true, 'blank time');

    // typed clock time -> moment
    const at = (h, m, s) => new Date(2026, 9, 15, h, m, s || 0).getTime();
    eq(CT.timeToMs('01:50', at(2, 0), at(2, 0)), at(1, 50), 'earlier today');
    eq(CT.timeToMs('23:55', at(0, 10), at(0, 10)), new Date(2026, 9, 14, 23, 55).getTime(), 'across midnight -> yesterday');
    eq(CT.timeToMs('02:30', at(2, 0), at(2, 0)), new Date(2026, 9, 14, 2, 30).getTime(), 'later than now -> yesterday');
    eq(CT.timeToMs('01:50:30', at(2, 0), at(2, 0)), at(1, 50, 30), 'with seconds');
    eq(isNaN(CT.timeToMs('', at(2, 0), at(2, 0))), true, 'blank time');
    eq(isNaN(CT.timeToMs('25:00', at(2, 0), at(2, 0))), true, 'bad hour');

    // log text
    const txt = CT.logText(five, [{ id: 'w', at: T0 + 30 * M + 10 * S, kind: 'waters', text: 'clear' }], '511', T0 + 61 * M, x => new Date(x).toTimeString().slice(0, 8));
    eq(txt.includes('My rule: 5-1-1'), true, 'log names the rule');
    eq(txt.includes('Last hour: 12 contractions, on average 5:00 apart, lasting 1:00'), true, 'log summary');
    eq(txt.includes('Rule first reached at 03:01:00'), true, 'log first reached');
    eq(txt.includes('02:30:10  WATERS BROKE: clear'), true, 'log note');
    eq(txt.includes('02:05:00  lasted 1:00  apart 5:00'), true, 'log row');
    eq(txt.indexOf('02:30:00') < txt.indexOf('02:30:10') && txt.indexOf('02:30:10') < txt.indexOf('02:35:00'), true, 'log in time order');
    eq(CT.logText([], [], '511', T0).includes('No contractions timed yet.'), true, 'empty log text');

    // restoring saved data
    eq(CT.cleanState(null), { v: 1, items: [], notes: [], running: null, rule: CT.cleanRule({}), wake: false }, 'nothing saved');
    eq(CT.cleanState('garbage').items, [], 'garbage');
    const cs = CT.cleanState({ items: [{ id: 'x', start: T0, end: T0 + 60 * S, strength: 'strong' }, { start: 'a', end: 3 }, { id: 'y', start: T0, end: T0 + 2 * 3600 * S }, null],
        notes: [{ at: T0, kind: 'zzz', text: 5 }, { at: -1 }], running: 'soon', rule: { preset: 'custom', apart: 420, last: 45, hold: 90 }, wake: 'yes' });
    eq([cs.items.length, cs.items[0].strength, cs.notes.length, cs.notes[0].kind, cs.notes[0].text, cs.running, cs.rule.apart, cs.wake], [1, 'strong', 1, 'other', '', null, 420, false], 'bad values dropped');
    eq(CT.cleanState({ running: T0 }).running, T0, 'running timer kept');

    const out = (fails.length ? 'FAILED ' + fails.length + ':\n - ' + fails.join('\n - ') + '\n' : '') + pass + ' passed, ' + fails.length + ' failed';
    if (typeof module === 'object' && module.exports) { console.log(out); process.exitCode = fails.length ? 1 : 0; }
    else { document.getElementById('out').textContent = out; }
})();
