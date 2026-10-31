// Checks for core.js, worked out by hand. Run: node tests.js, or open test.html.
if (typeof require !== 'undefined') require('./core.js');
const C = globalThis.ScoreCore;
let pass = 0, failed = 0;
function eq(got, want, name) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) pass++; else { failed++; console.log('FAIL ' + name + '\n  got  ' + g + '\n  want ' + w); }
}
const P = names => names.map((n, i) => ({ id: 'p' + i, name: n, start: 0, adjs: [], left: false, joinedAt: 0 }));
const R = (...rows) => rows.map(a => { const s = {}; a.forEach((v, i) => { if (v !== null) s['p' + i] = v; }); return { scores: s }; });
const game = (o) => Object.assign({ presetId: 'custom', high: true, end: 'none', limit: 0, players: P(['Ammi', 'Abbu', 'Sara', 'Ali']), rounds: [], ended: false, keepFrom: 0 }, o);
const totals = st => st.rows.map(r => r.total);
const names = list => list.map(r => r.name);

// ---------- typed scores ----------
eq(C.parseScore(''), { ok: true, value: null }, 'blank is empty');
eq(C.parseScore('   '), { ok: true, value: null }, 'spaces are empty');
eq(C.parseScore(' 25 '), { ok: true, value: 25 }, 'trimmed');
eq(C.parseScore('-15'), { ok: true, value: -15 }, 'negative');
eq(C.parseScore('−15'), { ok: true, value: -15 }, 'typographic minus');
eq(C.parseScore('+40'), { ok: true, value: 40 }, 'plus sign');
eq(C.parseScore('0'), { ok: true, value: 0 }, 'zero');
eq(C.parseScore('-0'), { ok: true, value: 0 }, 'minus zero is zero');
eq(C.parseScore('1,250'), { ok: true, value: 1250 }, 'thousands comma');
eq(C.parseScore('2.5').ok, false, 'decimal refused');
eq(C.parseScore('2,5').error, 'Whole numbers only', 'decimal comma refused');
eq(C.parseScore('abc').error, 'Type a number', 'letters refused');
eq(C.parseScore('-').error, 'Type a number', 'lone minus');
eq(C.parseScore('999999'), { ok: true, value: 999999 }, 'largest');
eq(C.parseScore('1000000').ok, false, 'too big');
eq(C.parseScore('-1000000').ok, false, 'too small');
eq(C.parseLimit('').ok, false, 'limit blank');
eq(C.parseLimit('0').error, 'Must be 1 or more', 'limit zero');
eq(C.parseLimit('-5').ok, false, 'limit negative');
eq(C.parseLimit('101'), { ok: true, value: 101 }, 'limit 101');

// ---------- highest wins, no end (Scrabble) ----------
let g = game({ presetId: 'scrabble', rounds: R([30, 12, 25, 18], [22, 40, 10, 9]) });
let st = C.status(g);
eq(totals(st), [52, 52, 35, 27], 'scrabble totals');
eq(st.over, false, 'no end: not over');
eq(names(st.ranked), ['Ammi', 'Abbu', 'Sara', 'Ali'], 'ranked');
eq(st.ranked.map(r => r.rank), [1, 1, 3, 4], 'tie shares rank 1');
eq(C.headline(g, st), { big: 'Ammi and Abbu are level', small: 'Level on 52. After 2 rounds.' }, 'level headline');
g.ended = true; st = C.status(g);
eq([st.over, names(st.winners)], [true, ['Ammi', 'Abbu']], 'end game now with a tie');
eq(C.headline(g, st).big, 'Tie: Ammi and Abbu', 'tie headline');
g.rounds.push(R([5, 0, 0, 0])[0]); st = C.status(g);
eq(C.headline(g, st), { big: 'Ammi wins!', small: 'Won with 57, 5 ahead of Abbu.' }, 'winner headline');

// ---------- empty game ----------
g = game({}); st = C.status(g);
eq([st.over, st.rounds, totals(st)], [false, 0, [0, 0, 0, 0]], 'empty game');
eq(C.headline(g, st).big, 'Round 1', 'empty headline');
g.ended = true; st = C.status(g);
eq([st.over, st.winners.length], [true, 4], 'ending with no rounds: everyone level');

// ---------- lowest wins, leader text ----------
g = game({ presetId: 'points', high: false, rounds: R([12, 30, 4, 20]) }); st = C.status(g);
eq(C.headline(g, st), { big: 'Sara leads', small: 'With 4 (lowest wins), 8 ahead of Ammi. After 1 round.' }, 'lowest leader');

// ---------- Uno, first to 500 ----------
g = game({ presetId: 'uno', high: true, end: 'reach', limit: 500, players: P(['Ammi', 'Abbu', 'Sara']),
    rounds: R([120, 0, 0], [0, 210, 0], [0, 0, 95], [260, 0, 0]) });
st = C.status(g);
eq([totals(st), st.over], [[380, 210, 95], false], 'uno before 500');
eq(C.note(g, st.rows[0]), '120 to reach 500', 'uno note');
g.rounds.push(R([130, 0, 0])[0]); st = C.status(g);
eq([st.over, st.reason, names(st.winners)], [true, 'reach', ['Ammi']], 'uno 510 wins');
eq(C.headline(g, st), { big: 'Ammi wins!', small: 'Won with 510, 300 ahead of Abbu.' }, 'uno headline');
eq(C.note(g, st.rows[0]), '', 'no note past target');
eq(C.note(g, st.rows[1], true), '', 'no "to reach" note once the game is over');
// exactly the target counts
g = game({ end: 'reach', limit: 500, players: P(['A', 'B']), rounds: R([500, 0]) });
eq(C.status(g).over, true, 'exactly 500 ends');
// tie at the target, then a tie-break round
g = game({ end: 'reach', limit: 100, players: P(['A', 'B']), rounds: R([100, 100]) }); st = C.status(g);
eq([st.over, names(st.winners)], [true, ['A', 'B']], 'tie at the target');
g.keepFrom = 1; st = C.status(g);
eq(st.over, false, 'keep playing reopens the game');
g.rounds.push(R([0, 15])[0]); st = C.status(g);
eq([st.over, names(st.winners)], [true, ['B']], 'tie-break round decides');

// ---------- Hearts: ends at 100, lowest wins ----------
g = game({ presetId: 'hearts', high: false, end: 'reach', limit: 100, rounds: R([26, 0, 0, 0], [0, 13, 13, 0], [50, 40, 30, 26], [26, 0, 0, 0]) });
st = C.status(g);
eq([totals(st), st.over, names(st.winners)], [[102, 53, 43, 26], true, ['Ali']], 'hearts: Ammi passes 100, Ali lowest wins');
eq(st.ranked.map(r => r.name), ['Ali', 'Sara', 'Abbu', 'Ammi'], 'hearts ranking low first');

// ---------- Pool Rummy 101 ----------
g = game({ presetId: 'pool101', high: false, end: 'out', limit: 101 });
g.rounds = R([0, 20, 40, 80], [20, 0, 20, 30]);
st = C.status(g);
eq([totals(st), st.rows.map(r => r.out)], [[20, 20, 60, 110], [false, false, false, true]], 'Ali out at 110');
eq(C.note(g, st.rows[2]), 'Can take 40 more', 'sara can take 40 more (out at 101)');
eq(C.note(g, st.rows[3]), 'Out (101 or more)', 'out note');
eq(C.playersFor(g, 2).map(p => p.name), ['Ammi', 'Abbu', 'Sara'], 'out player gets no box next round');
eq(C.playersFor(g, 1).map(p => p.name), ['Ammi', 'Abbu', 'Sara', 'Ali'], 'editing round 2 keeps Ali');
eq(st.ranked.map(r => r.name), ['Ammi', 'Abbu', 'Sara', 'Ali'], 'out player ranked last');
eq(C.headline(g, st).big, 'Ammi and Abbu are level', 'pool level');
// exactly 101 is out, 100 is not
g = game({ end: 'out', limit: 101, high: false, players: P(['A', 'B', 'C']), rounds: R([100, 101, 0]) }); st = C.status(g);
eq(st.rows.map(r => r.out), [false, true, false], '101 out, 100 in');
eq(C.note(g, st.rows[0]), 'Can take 0 more', '100 can take 0 more');
// Ali rejoins at the highest score still in (60)
g = game({ presetId: 'pool101', high: false, end: 'out', limit: 101, rounds: R([0, 20, 40, 80], [20, 0, 20, 30]) });
st = C.status(g);
eq(C.rejoinTotal(g, st), 60, 'rejoin at 60');
g.players[3].adjs.push({ at: 2, amount: 60 - 110 });
st = C.status(g);
eq([st.rows[3].total, st.rows[3].out], [60, false], 'Ali back in at 60');
eq(C.playersFor(g, 2).length, 4, 'rejoined player gets a box');
// the game finishes: Sara and Ali go out, Abbu last one in
g.rounds.push(R([90, 10, 50, 45])[0]);
st = C.status(g);
eq([totals(st), st.over, names(st.winners)], [[110, 30, 110, 105], true, ['Abbu']], 'Abbu last in wins');
eq(C.headline(g, st), { big: 'Abbu wins!', small: 'Last player in, with 30.' }, 'pool winner headline');
eq(st.ranked.map(r => r.name + r.rank), ['Abbu1', 'Ali2', 'Ammi3', 'Sara3'], 'out in the same round rank by total (lower is better)');
// everyone left goes out in the same round: lowest of them wins
g = game({ end: 'out', limit: 101, high: false, players: P(['A', 'B', 'C']), rounds: R([110, 0, 0], [null, 105, 120]) });
st = C.status(g);
eq([st.over, names(st.winners)], [true, ['B']], 'both out together, lowest wins');
eq(st.ranked.map(r => r.name), ['B', 'C', 'A'], 'earlier out ranks last');
// a player who left does not count
g = game({ end: 'out', limit: 101, high: false, players: P(['A', 'B', 'C']), rounds: R([110, 10, 30]) });
g.players[2].left = true; st = C.status(g);
eq([st.over, names(st.winners)], [true, ['B']], 'left player removed, one in, game over');
eq(st.ranked[2].rank, null, 'left player has no rank');

// ---------- fixed rounds ----------
g = game({ end: 'rounds', limit: 3, players: P(['A', 'B']), rounds: R([5, 3], [2, 9]) }); st = C.status(g);
eq([st.over, C.headline(g, st).small], [false, 'With 12, 5 ahead of A. After 2 rounds of 3.'], 'two of three rounds');
g.rounds.push(R([10, 0])[0]); st = C.status(g);
eq([st.over, names(st.winners)], [true, ['A']], 'after 3 rounds A wins 17 to 12');

// ---------- late joiner and negative scores (Spades) ----------
g = game({ presetId: 'spades', end: 'reach', limit: 500, players: P(['A', 'B']), rounds: R([60, -40], [70, 80]) });
g.players.push({ id: 'p2', name: 'C', start: 40, adjs: [], left: false, joinedAt: 2 });
st = C.status(g);
eq(totals(st), [130, 40, 40], 'late joiner starts at 40, negatives count');
eq(C.playersFor(g, 1).map(p => p.name), ['A', 'B'], 'late joiner has no box in earlier rounds');
eq(C.playersFor(g, 2).map(p => p.name), ['A', 'B', 'C'], 'late joiner plays from now');

// ---------- huge numbers stay exact ----------
g = game({ players: P(['A', 'B']), rounds: Array.from({ length: 400 }, () => ({ scores: { p0: 999999, p1: -999999 } })) });
eq(totals(C.status(g)), [399999600, -399999600], '400 rounds of 999999');

// ---------- text summary ----------
g = game({ presetId: 'uno', end: 'reach', limit: 500, players: P(['Ammi', 'Sara']), rounds: R([300, 0], [0, 120], [250, 0]) });
eq(C.summaryText(g, C.status(g), '31 Oct 2026'), 'Uno, first to 500, 31 Oct 2026, 3 rounds\nAmmi wins! Won with 550, 430 ahead of Sara.\n\n1. Ammi: 550\n2. Sara: 120\n\nRound by round:\nRound 1: Ammi 300, Sara 0\nRound 2: Ammi 0, Sara 120\nRound 3: Ammi 250, Sara 0', 'summary text');
eq(C.rulesText(game({ presetId: 'pool101', high: false, end: 'out', limit: 101 })), 'Pool Rummy 101 · lowest score wins · out at 101, last one left wins', 'rules text');
eq(C.rulesText(game({ end: 'rounds', limit: 1 })), 'Custom game · highest score wins · 1 round', 'rules one round');

eq(C.title(game({ presetId: 'uno', end: 'reach', limit: 300 })), 'Uno (house rules)', 'changed preset is house rules');
eq(C.title(game({ presetId: 'uno', end: 'reach', limit: 500 })), 'Uno, first to 500', 'preset title');
eq(C.title(game({ presetId: 'scrabble', end: 'none', limit: 7 })), 'Scrabble, highest wins', 'limit ignored with no end');

// ---------- saved data ----------
eq(C.cleanGame(null), null, 'null game');
eq(C.cleanGame('{bad'), null, 'string game');
eq(C.cleanGame({ players: [], rounds: [] }), null, 'no players');
eq(C.cleanGame({ players: [{ id: 'a', name: 'A' }], rounds: [], end: 'reach' }), null, 'reach without a limit is dropped');
const cg = C.cleanGame({ presetId: 'zzz', end: 'weird', players: [{ id: 'a', name: 'A'.repeat(50), start: 'x' }, { id: 'a', name: 'dup' }, { id: 'b', name: 'B', adjs: [{ at: 1, amount: 2 }, { at: -1, amount: 3 }] }],
    rounds: [{ scores: { a: 5, b: 'x', z: 3 } }, null, { scores: { b: 1.5 } }], high: 'yes' });
eq([cg.presetId, cg.end, cg.limit, cg.players.length, cg.players[0].name.length, cg.players[0].start, cg.players[1].adjs, cg.rounds, cg.high],
    ['custom', 'none', 0, 2, 30, 0, [{ at: 1, amount: 2 }], [{ scores: { a: 5 } }, { scores: {} }], true], 'bad fields cleaned');
eq(C.cleanHistory('x'), [], 'bad history');
eq(C.cleanHistory([{ title: 'Uno', at: 1, players: [{ name: 'A', total: 5 }, { name: 'B', total: 'x' }], winners: ['A', 4], finished: true }, { title: 3 }]),
    [{ title: 'Uno', at: 1, rounds: 0, finished: true, players: [{ name: 'A', total: 5 }], winners: ['A'] }], 'history cleaned');
eq(C.winTally([{ finished: true, winners: ['Sara'] }, { finished: true, winners: ['sara ', 'Ali'] }, { finished: false, winners: [] }, { finished: true, winners: ['Ali'] }, { finished: true, winners: ['Ali'] }]),
    [{ name: 'Ali', wins: 3 }, { name: 'Sara', wins: 2 }], 'wins tally ignores case and unfinished games');

console.log((failed ? 'FAILED ' + failed + ', ' : '') + 'passed ' + pass + ' checks');
if (typeof process !== 'undefined' && failed) process.exit(1);
