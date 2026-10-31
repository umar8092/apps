// Checks for core.js, worked out by hand. Run: node tests.js, or open test.html.
var C = typeof require !== 'undefined' ? require('./core.js') : window.Cricket;
var pass = 0, failed = 0;
function eq(got, want, name) {
    var g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) pass++; else { failed++; console.log('FAIL ' + name + '\n  got  ' + g + '\n  want ' + w); }
}
function S(m) { return C.summary(m); }
function balls(m, list) { list.forEach(function (b) { var err = typeof b === 'number' ? C.addBall(m, 'run', b) : C.addBall(m, b[0], b[1] || 0, b[2]); if (err) throw new Error(err + ' ' + JSON.stringify(b)); }); }
var team = function (o) { return C.newMatch(Object.assign({ teams: [{ name: 'Lions', players: 5 }, { name: 'Tigers', players: 5 }], overs: 2 }, o || {})); };

// ---------- setup is cleaned ----------
var s0 = C.normSetup({});
eq([s0.teams[0].name, s0.teams[1].name, s0.overs, s0.teams[0].players, s0.mode, s0.wideRun, s0.wideRebowl], ['Team A', 'Team B', 6, 6, 'team', 1, true], 'defaults');
eq(C.normSetup({ overs: 0 }).overs, 1, 'zero overs becomes 1');
eq(C.normSetup({ overs: 99 }).overs, 50, 'overs capped at 50');
eq(C.normSetup({ overs: '2.5' }).overs, 2, 'decimal overs is read as whole number');
eq(C.normSetup({ overs: -3 }).overs, 1, 'negative overs to 1');
eq(C.normSetup({ teams: [{ players: 1 }, { players: 40 }] }).teams.map(function (t) { return t.players; }), [2, 15], 'player count limits');
eq(C.normSetup({ teams: [{ name: '  Gali   No. 7\n' }] }).teams[0].name, 'Gali No. 7', 'name tidied');
eq(C.normSetup({ teams: [{ name: 'x'.repeat(80) }] }).teams[0].name.length, 30, 'long team name cut to 30');
eq(C.normSetup({ teams: [{ name: '' }, { name: '   ' }] }).teams.map(function (t) { return t.name; }), ['Team A', 'Team B'], 'blank names');
eq(C.maxWickets(C.normSetup({ teams: [{ players: 5 }, { players: 6 }] }), 0), 4, '5 players: 4 wickets');
eq(C.maxWickets(C.normSetup({ teams: [{ players: 5 }], lastMan: true }), 0), 5, 'last man stands: 5 wickets');
eq(C.maxWickets(C.normSetup({ teams: [{ players: 5 }] }), 0, true), 2, 'super over: 2 wickets');

// ---------- the main situation: 2 overs, Lions bat ----------
var m = team();
balls(m, [1, 4, ['wd'], 0, 6, 2, 1]);           // over 1: 1 4 Wd 0 6 2 1 = 15 (the wide is bowled again, so 7 balls)
var d = S(m).current;
eq([d.runs, d.wkts, d.legal, C.oversText(d.legal), d.extras.wd], [15, 0, 6, '1.0', 1], 'wide adds 1 and is bowled again');
eq(d.overList[0].map(function (b) { return b.label; }), ['1', '4', 'Wd', '0', '6', '2', '1'], 'this over list');
eq(d.overList[1], [], 'second over starts empty');
balls(m, [['out', 0, { how: 'Caught' }], ['nb', 4], ['bye', 2], 0, 0, 0, ['out', 0, { how: 'Bowled' }]]);
d = S(m).current;
eq([d.runs, d.wkts, d.legal, d.done, d.endReason, d.extras.nb, d.extras.b], [22, 2, 12, true, 'overs', 1, 2], 'innings ends after 2 overs: 15 + nb 1+4 + bye 2 = 22');
eq(S(m).phase, 'break', 'break after first innings');
eq(C.addBall(m, 'run', 1), 'This innings is over.', 'no balls after the innings');
eq(C.startNext(m), '', 'start second innings');
d = S(m).current;
eq([d.bat, d.target, d.need, d.ballsLeft, d.rrr], [1, 23, 23, 12, '11.50'], 'Tigers need 23 off 12 balls, rate 11.50');
balls(m, [6, 6, 1, 0]);
d = S(m).current;
eq([d.runs, d.need, d.ballsLeft, d.rrr, d.rr], [13, 10, 8, '7.50', '19.50'], 'need 10 off 8');
balls(m, [4, 4, 1]);
var s = S(m);
eq([s.current.runs, s.phase, s.result, s.current.need], [22, 'play', null, 1], 'level on 22, need 1, still playing');
balls(m, [1]);
s = S(m);
eq([s.phase, s.result.winner, s.result.text], ['over', 1, 'Tigers won by 4 wickets (4 balls left)'], 'chase won with wickets and balls left');
eq(C.addBall(m, 'run', 4), 'This innings is over.', 'no balls after the win');

// first team wins by runs
m = team(); balls(m, [6, 6, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0]); C.startNext(m);
balls(m, [4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1]);
eq(S(m).result.text, 'Lions won by 6 runs', 'won by runs: 36 v 30');
eq(S(m).result.winner, 0, 'winner index');
// by 1 run, singular
m = team({ overs: 1 }); balls(m, [1, 1, 1, 1, 1, 1]); C.startNext(m); balls(m, [1, 1, 1, 1, 0, 0]);
eq(S(m).result.text, 'Lions won by 2 runs', 'six singles v four');
m = team({ overs: 1 }); balls(m, [1, 1, 1, 1, 1, 1]); C.startNext(m); balls(m, [1, 1, 1, 1, 1, 0]);
eq(S(m).result.text, 'Lions won by 1 run', 'won by 1 run (singular)');
// tie and super over
m = team({ overs: 1 }); balls(m, [1, 1, 1, 1, 1, 1]); C.startNext(m); balls(m, [1, 1, 1, 1, 1, 1]);
s = S(m);
eq([s.phase, s.result.tie, s.result.text], ['tie', true, 'Match tied: both teams scored 6'], 'tie');
eq(C.startNext(m), '', 'super over starts');
eq([S(m).current.bat, S(m).current.overs, S(m).current.maxW, S(m).current.super], [1, 1, 2, true], 'team batting second bats first in the super over, 1 over, 2 wickets');
balls(m, [['out'], 4, ['out']]);
eq([S(m).current.done, S(m).current.endReason, S(m).current.runs], [true, 'allout', 4], 'super over ends at 2 wickets');
C.startNext(m);
eq([S(m).current.bat, S(m).current.target], [0, 5], 'Lions need 5 in the super over');
balls(m, [4, 1]);
s = S(m);
eq([s.phase, s.result.text, s.result.main], ['over', 'Lions won the super over', 'Match tied: both teams scored 6'], 'super over winner named');
// finish as a tie
m = team({ overs: 1 }); balls(m, [0, 0, 0, 0, 0, 0]); C.startNext(m); balls(m, [0, 0, 0, 0, 0, 0]);
eq(S(m).result.text, 'Match tied: both teams scored 0', 'zero-zero tie');
eq(C.finishTie(m), '', 'finish as tie');
eq(S(m).phase, 'over', 'tie finished');
eq(C.undo(m), 'finish', 'undo finishing');
eq(S(m).phase, 'tie', 'back to tie choice');

// all out
m = team({ overs: 5 }); balls(m, [['out'], ['out'], 3, ['out'], ['out']]);
eq([S(m).current.done, S(m).current.endReason, S(m).current.wkts, S(m).current.runs, C.fmtOvers(S(m).current.legal)], [true, 'allout', 4, 3, '0.5'], '5 players all out for 3 after 4 wickets');
// last man stands
m = team({ overs: 5, lastMan: true }); balls(m, [['out'], ['out'], ['out'], ['out']]);
eq([S(m).current.done, S(m).current.wkts], [false, 4], 'last man still batting');
balls(m, [2, ['out']]);
eq([S(m).current.done, S(m).current.wkts, S(m).current.runs], [true, 5, 2], 'all 5 out with last man stands');
// won by wickets on the last ball
m = team({ overs: 1 }); balls(m, [1, 1, 1, 1, 1, 1]); C.startNext(m); balls(m, [1, 1, 1, 1, 1, 2]);
eq(S(m).result.text, 'Tigers won by 4 wickets on the last ball', 'last ball win');
// win with the target reached on a wide
m = team({ overs: 1 }); balls(m, [1, 0, 0, 0, 0, 0]); C.startNext(m); balls(m, [1, ['wd']]);
eq(S(m).result.text, 'Tigers won by 4 wickets (5 balls left)', 'won on a wide');
eq(S(m).current.legal, 1, 'wide did not count as a ball');

// ---------- house rules ----------
m = team({ wideRun: 0 }); balls(m, [['wd'], ['wd', 1]]);
eq([S(m).current.runs, S(m).current.legal], [1, 0], 'no run for a wide, but runs run still count');
m = team({ wideRebowl: false }); balls(m, [['wd'], ['wd'], ['wd'], ['wd'], ['wd'], ['wd']]);
eq([S(m).current.runs, S(m).current.legal, S(m).current.overList.length], [6, 6, 2], 'wide not bowled again: six wides make an over');
m = team({ nbRun: 0, nbRebowl: false }); balls(m, [['nb', 6]]);
eq([S(m).current.runs, S(m).current.legal, S(m).current.extras.nb], [6, 1, 0], 'no ball worth 0 and counts as a ball');
m = team(); balls(m, [['nb', 6]]);
eq([S(m).current.runs, S(m).current.legal], [7, 0], 'normal no ball: 1 + 6, bowled again');
m = team(); balls(m, [['bye', 4], ['wd', 4]]);
eq([S(m).current.runs, S(m).current.extras.b, S(m).current.extras.wd], [9, 4, 5], 'four byes and a wide that ran away for four');

// ---------- bad input refused ----------
m = team();
eq(C.addBall(m, 'run', -1), 'Runs must be 0 to 7.', 'negative runs');
eq(C.addBall(m, 'run', 9), 'Runs must be 0 to 7.', 'too many runs');
eq(C.addBall(m, 'run', 'abc'), 'Runs must be 0 to 7.', 'text runs');
eq(C.addBall(m, 'run', 2.5), 'Runs must be 0 to 7.', 'decimal runs');
eq(C.addBall(m, 'magic', 1), 'Unknown ball.', 'unknown type');
eq(m.innings[0].events.length, 0, 'nothing saved after refused input');
eq(C.addBall(m, 'run', 5), '', 'five runs allowed (overthrows)');
eq(S(m).current.runs, 5, 'five counted');

// ---------- undo ----------
m = team({ overs: 1 }); balls(m, [4, 6]);
eq(C.undoLabel(m), '6 runs', 'undo label');
C.undo(m); eq(S(m).current.runs, 4, 'undo last ball');
balls(m, [1, 1, 1, 1, 1]); C.startNext(m);
eq(C.undoLabel(m), 'starting this innings', 'undo label at start of innings');
eq(C.undo(m), 'innings', 'undo back into first innings');
eq([m.innings.length, S(m).phase], [1, 'break'], 'back at the break');
C.undo(m); eq([S(m).phase, S(m).current.legal], ['play', 5], 'undo the last ball of the innings reopens it');
var e0 = team(); eq([C.canUndo(e0), C.undo(e0)], [false, ''], 'nothing to undo on a new match');

// ---------- changing overs and target (rain) ----------
m = team({ overs: 10 }); balls(m, [1, 1, 1, 1, 1, 1, 1, 1]);
eq(C.setOvers(m, 1), 'Already 1.2 overs bowled; choose at least 2.', 'cannot cut below balls bowled');
eq(C.setOvers(m, 'x'), 'Overs must be a whole number from 1 to 50.', 'bad overs');
eq(C.setOvers(m, 2), '', 'cut to 2 overs');
balls(m, [0, 0, 0, 0]);
eq([S(m).current.done, S(m).current.endReason], [true, 'overs'], 'shortened innings ends at 2 overs');
C.startNext(m);
eq(S(m).current.overs, 2, 'second innings gets the same overs');
eq(C.setTarget(m, 6), '', 'typed target');
eq(S(m).current.target, 6, 'target used');
eq(C.setTarget(m, '0'), 'Target must be a whole number from 1 to 9999.', 'zero target refused');
eq(C.setTarget(m, ''), '', 'blank target clears');
eq(S(m).current.target, 9, 'normal target back (8 + 1)');
var f1 = team(); eq(C.setTarget(f1, 10), 'A target is set only for the team batting second.', 'no target in first innings');
eq(C.setOvers(m, 3), '', 'can raise overs');

// end innings early
m = team({ overs: 5 }); balls(m, [4]); C.simple(m, 'end');
eq([S(m).phase, S(m).current.endReason], ['break', 'ended'], 'ended early');

// ---------- each player mode ----------
var pm = C.newMatch({ mode: 'players', overs: 2, teams: [{ name: 'Lions', players: 3, names: ['Ali', 'Bilal', 'Hamza'] }, { name: 'Tigers', players: 3, names: ['Imran', '', 'Zain'] }] });
d = S(pm).current;
eq([d.needBatter, d.needBowler], [true, false], 'openers needed first');
eq(C.addBall(pm, 'run', 1), 'Choose who bats next first.', 'cannot score without batters');
eq(C.choose(pm, 'bowl', 0), 'Choose who bats next first.', 'batter before bowler');
C.choose(pm, 'bat', 0);
eq(C.choose(pm, 'bat', 0), 'That player is already batting.', 'same batter twice');
C.choose(pm, 'bat', 1);
eq(C.choose(pm, 'bat', 2), 'Both batters are already in.', 'third batter refused');
eq(S(pm).current.needBowler, true, 'bowler needed');
eq(C.choose(pm, 'bowl', 9), 'Pick a player.', 'unknown bowler');
C.choose(pm, 'bowl', 1);
eq(C.playerName(pm.setup, 1, 1), 'Player 2', 'blank name becomes Player 2');
balls(pm, [1, 4, 0, ['nb', 2], 6, 3, 1]);
// Ali 1 -> Bilal faces 4, 0, nb+2 (ran 2), 6, 3 -> Ali faces the 6th legal ball, 1 -> Bilal, over ends -> Ali faces
d = S(pm).current;
var A = d.batters[0], B = d.batters[1];
eq([A.runs, A.balls, B.runs, B.balls, B.f4, B.f6], [2, 2, 15, 5, 1, 1], 'batter runs and balls (no ball counts as faced)');
eq([d.striker, d.nonStriker, d.needBowler, d.lastBowler, C.oversText(d.legal)], [0, 1, true, 1, '1.0'], 'ends change after the over; new bowler needed');
eq(d.bowlers[1], { legal: 6, runs: 18, wkts: 0, wd: 0, nb: 1 }, 'bowler figures: 1+4+0+3+6+3+1 = 18');
eq(C.addBall(pm, 'run', 1), 'Choose who bowls this over first.', 'ball refused until a bowler is chosen');
C.choose(pm, 'bowl', 2);
eq(C.choose(pm, 'bowl', 0), 'The bowler is already chosen for this over.', 'one bowler per over');
balls(pm, [['out', 0, { how: 'Caught' }]]);
d = S(pm).current;
eq([d.batters[0].out, d.wkts, d.needBatter, d.bowlers[2].wkts], ['caught b Zain', 1, true, 1], 'caught, credited to the bowler');
eq(C.addBall(pm, 'run', 1), 'Choose who bats next first.', 'new batter needed');
C.choose(pm, 'bat', 2);
eq([S(pm).current.striker, S(pm).current.nonStriker], [2, 1], 'new batter takes strike');
balls(pm, [['out', 1, { how: 'Run out', who: 'n' }]]);
d = S(pm).current;
eq([d.batters[2].runs, d.batters[1].out, d.wkts, d.done, d.bowlers[2].wkts], [1, 'run out', 2, true, 1], 'run out at the other end after 1 run; 3 players all out; no wicket for the bowler');
eq(d.fall.map(function (f) { return f.runs + '-' + f.wkt; }), ['18-1', '19-2'], 'fall of wickets');
var txt = C.scorecardText(pm);
eq(txt.indexOf('Lions 19/2 (1.2 ov)') >= 0, true, 'scorecard text total');
eq(txt.indexOf('Ali 2 (3) caught b Zain') >= 0, true, 'scorecard batter line');
eq(txt.indexOf('Bilal 15 (5) run out') >= 0, true, 'scorecard run out line');
eq(txt.indexOf('Bowling: Player 2 1-18-0, Zain 0.2-1-1') >= 0, true, 'scorecard bowling line');

// retire and come back, swap strike
pm = C.newMatch({ mode: 'players', overs: 5, teams: [{ name: 'A', players: 4 }, { name: 'B', players: 4 }] });
C.choose(pm, 'bat', 0); C.choose(pm, 'bat', 1); C.choose(pm, 'bowl', 0);
balls(pm, [6, 6, 6, 4]);
eq(C.simple(pm, 'retire', 's'), '', 'retire batter');
d = S(pm).current;
eq([d.batters[0].retired, d.wkts, d.needBatter, d.striker], [true, 0, true, null], 'retired is not a wicket');
C.choose(pm, 'bat', 2);
eq(C.simple(pm, 'swap'), '', 'swap strike');
eq([S(pm).current.striker, S(pm).current.nonStriker], [1, 2], 'swapped');
balls(pm, [['out']]); C.choose(pm, 'bat', 3); balls(pm, [['out']]);
d = S(pm).current;
eq([d.wkts, d.needBatter, d.done], [2, true, false], '2 out, retired player can come back');
C.choose(pm, 'bat', 0);
eq([S(pm).current.batters[0].retired, S(pm).current.batters[0].runs], [false, 22], 'retired batter back with his runs');
// over done after 6 balls: next bowler
eq(S(pm).current.needBowler, true, 'over 1 done');
C.choose(pm, 'bowl', 1);
balls(pm, [['out', 0, { how: 'Bowled' }]]);
eq(S(pm).current.done, true, '3 out of 4: all out');

// last man stands with players
pm = C.newMatch({ mode: 'players', overs: 5, lastMan: true, teams: [{ name: 'A', players: 2 }, { name: 'B', players: 2 }] });
C.choose(pm, 'bat', 0); C.choose(pm, 'bat', 1); C.choose(pm, 'bowl', 0);
balls(pm, [['out']]);
d = S(pm).current;
eq([d.needBatter, d.striker, d.nonStriker], [false, 1, null], 'last batter alone faces at once');
balls(pm, [1, 1]);
eq([S(pm).current.striker, S(pm).current.batters[1].runs], [1, 2], 'alone batter keeps strike after a single');

// ---------- saved data ----------
m = team(); balls(m, [4, ['wd'], ['out']]);
var back = C.restore(JSON.stringify(m));
eq(S(back).current.runs, S(m).current.runs, 'restore round trip');
eq(C.restore('{bad'), null, 'corrupt text');
eq(C.restore('null'), null, 'null');
eq(C.restore({ innings: [] }), null, 'no innings');
var weird = C.restore({ setup: { overs: 'many', teams: [{ name: '<b>x</b>', players: 999 }] }, innings: [{ bat: 7, events: [{ k: 'ball', t: 'run', r: 99 }, { k: 'ball', t: 'hack' }, null, 'x', { k: 'bat', id: 3 }] }] });
eq([weird.setup.overs, weird.setup.teams[0].players, weird.innings[0].bat, weird.innings[0].events.length, S(weird).current.runs], [6, 15, 0, 1, 7], 'bad values made safe');
eq(weird.setup.teams[0].name, '<b>x</b>', 'name kept as text (shown with textContent)');

console.log((failed ? 'FAILED ' + failed + ' of ' + (pass + failed) : 'ALL ' + pass + ' CORE TESTS PASSED'));
if (typeof process !== 'undefined' && failed) process.exitCode = 1;
