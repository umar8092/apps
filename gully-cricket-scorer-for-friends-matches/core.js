// Scoring engine for the Gully Cricket Scorer. Pure functions, no page access, so tests.js can check it in node.
// A match is its setup plus, for each innings, the list of things that happened (balls, new batters, bowlers).
// Every total is worked out again from that list, so Undo is simply "remove the last thing".
(function (root) {
    'use strict';
    var LIMITS = { oversMin: 1, oversMax: 50, playersMin: 2, playersMax: 15, teamName: 30, playerName: 24 };
    var HOW = ['Bowled', 'Caught', 'Run out', 'Stumped', 'LBW', 'Hit wicket', 'Other'];

    function int(v, min, max, dflt) {
        var n = typeof v === 'number' ? v : parseInt(String(v == null ? '' : v).trim(), 10);
        if (!isFinite(n) || Math.floor(n) !== n) return dflt;
        return Math.min(max, Math.max(min, n));
    }
    // For typed values that must already be in range: returns -1 instead of clamping.
    function strict(v, min, max) {
        var t = String(v == null ? '' : v).trim();
        if (!/^\d+$/.test(t)) return -1;
        var n = parseInt(t, 10);
        return n >= min && n <= max ? n : -1;
    }
    function cleanText(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

    // Turn anything (typed, restored or imported) into a safe setup.
    function normSetup(s) {
        s = s && typeof s === 'object' ? s : {};
        var teams = [0, 1].map(function (i) {
            var t = (s.teams && s.teams[i]) || {};
            var n = int(t.players, LIMITS.playersMin, LIMITS.playersMax, 6);
            var names = [];
            for (var k = 0; k < n; k++) names.push(cleanText(t.names && t.names[k], LIMITS.playerName));
            return { name: cleanText(t.name, LIMITS.teamName) || (i ? 'Team B' : 'Team A'), players: n, names: names };
        });
        return {
            teams: teams,
            overs: int(s.overs, LIMITS.oversMin, LIMITS.oversMax, 6),
            battingFirst: s.battingFirst === 1 ? 1 : 0,
            mode: s.mode === 'players' ? 'players' : 'team',
            wideRun: s.wideRun === 0 ? 0 : 1,
            wideRebowl: s.wideRebowl !== false,
            nbRun: s.nbRun === 0 ? 0 : 1,
            nbRebowl: s.nbRebowl !== false,
            lastMan: !!s.lastMan
        };
    }

    function playerName(setup, team, id) {
        var t = setup.teams[team];
        if (id == null || !t) return '';
        return (t.names[id] || '') || 'Player ' + (id + 1);
    }

    // Wickets that end an innings: one fewer than the players, or all of them when the last batter may bat alone.
    function maxWickets(setup, team, isSuper) {
        var n = setup.teams[team].players, w = setup.lastMan ? n : n - 1;
        return isSuper ? Math.min(2, w) : w;
    }

    function newMatch(setup) {
        setup = normSetup(setup);
        return { v: 1, setup: setup, created: Date.now(), innings: [newInnings(setup, 0, setup.battingFirst, setup.overs, false)], finished: false };
    }
    function newInnings(setup, index, bat, overs, isSuper) {
        return { bat: bat, overs: overs, super: !!isSuper, target: null, events: [] };
    }

    function oversText(legal) { return Math.floor(legal / 6) + '.' + (legal % 6); }
    function fmtOvers(legal) { return legal % 6 ? oversText(legal) : String(legal / 6); }
    function rate(runs, legal) { return legal ? (Math.round(runs * 600 / legal) / 100).toFixed(2) : '0.00'; }

    function ballLabel(e, setup) {
        var r = e.r || 0;
        if (e.t === 'run') return String(r);
        if (e.t === 'wd') return r ? 'Wd+' + r : 'Wd';
        if (e.t === 'nb') return r ? 'Nb+' + r : 'Nb';
        if (e.t === 'bye') return 'B' + r;
        if (e.t === 'out') return r ? 'W+' + r : 'W';
        return '';
    }

    // Runs one innings' event list and returns everything shown on screen.
    function playInnings(match, index) {
        var setup = match.setup, inn = match.innings[index], players = setup.mode === 'players';
        var bowlTeam = 1 - inn.bat, maxW = maxWickets(setup, inn.bat, inn.super);
        var d = {
            index: index, bat: inn.bat, bowlTeam: bowlTeam, super: inn.super, overs: inn.overs, maxW: maxW,
            runs: 0, wkts: 0, legal: 0, extras: { wd: 0, nb: 0, b: 0 }, target: null,
            batters: {}, order: [], bowlers: {}, bowlOrder: [], striker: null, nonStriker: null, bowler: null, lastBowler: null,
            overList: [[]], fall: [], done: false, endReason: '', needBatter: false, needBowler: false
        };
        d.target = targetFor(match, index);
        function bat(id) {
            if (!d.batters[id]) { d.batters[id] = { runs: 0, balls: 0, f4: 0, f6: 0, out: '', retired: false, innings: 0 }; d.order.push(id); }
            return d.batters[id];
        }
        function bowl(id) {
            if (!d.bowlers[id]) { d.bowlers[id] = { legal: 0, runs: 0, wkts: 0, wd: 0, nb: 0 }; d.bowlOrder.push(id); }
            return d.bowlers[id];
        }
        function swap() {
            var a = d.striker; d.striker = d.nonStriker; d.nonStriker = a;
            if (d.striker == null && d.nonStriker != null && aloneAllowed()) { d.striker = d.nonStriker; d.nonStriker = null; }
        }
        // the last batter left (when allowed to bat alone) always faces
        function alone() { if (players && aloneAllowed() && d.striker == null && d.nonStriker != null) { d.striker = d.nonStriker; d.nonStriker = null; } }
        function aloneAllowed() { return setup.lastMan && setup.teams[inn.bat].players - d.wkts <= 1; }
        function checkDone() {
            if (d.wkts >= maxW) { d.done = true; d.endReason = 'allout'; }
            else if (d.target != null && d.runs >= d.target) { d.done = true; d.endReason = 'target'; }
            else if (d.legal >= d.overs * 6) { d.done = true; d.endReason = 'overs'; }
        }
        inn.events.forEach(function (e) {
            if (d.done) return;
            if (e.k === 'bat' && players) {
                var b = bat(e.id); b.innings++; b.out = ''; b.retired = false;
                if (d.striker == null) d.striker = e.id; else if (d.nonStriker == null) d.nonStriker = e.id;
                return;
            }
            if (e.k === 'bowl' && players) { d.bowler = e.id; bowl(e.id); return; }
            if (e.k === 'swap') { if (d.striker != null && d.nonStriker != null) swap(); return; }
            if (e.k === 'retire' && players) {
                var rid = e.end === 'n' ? d.nonStriker : d.striker;
                if (rid == null) return;
                bat(rid).retired = true; bat(rid).out = 'retired';
                if (e.end === 'n') d.nonStriker = null; else d.striker = null;
                alone();
                return;
            }
            if (e.k === 'end') { d.done = true; d.endReason = 'ended'; return; }
            if (e.k !== 'ball') return;
            var r = int(e.r, 0, 7, 0), t = e.t, legal, toBat = 0, conceded = 0, faced = false;
            var s = players ? d.striker : null, bw = players ? d.bowler : null;
            if (t === 'run') { legal = true; toBat = r; conceded = r; faced = true; }
            else if (t === 'wd') { legal = !setup.wideRebowl; d.extras.wd += setup.wideRun + r; conceded = setup.wideRun + r; }
            else if (t === 'nb') { legal = !setup.nbRebowl; d.extras.nb += setup.nbRun; toBat = r; conceded = setup.nbRun + r; faced = true; }
            else if (t === 'bye') { legal = true; d.extras.b += r; faced = true; }
            else if (t === 'out') { legal = true; toBat = r; conceded = r; faced = true; }
            else return;
            var total = t === 'wd' ? setup.wideRun + r : t === 'nb' ? setup.nbRun + r : r;
            d.runs += total;
            if (s != null) { var sb = bat(s); sb.runs += toBat; if (faced) sb.balls++; if (t === 'run' || t === 'nb') { if (r === 4) sb.f4++; if (r === 6) sb.f6++; } }
            if (bw != null) { var bb = bowl(bw); bb.runs += conceded; if (legal) bb.legal++; if (t === 'wd') bb.wd++; if (t === 'nb') bb.nb++; }
            if (legal) d.legal++;
            d.overList[d.overList.length - 1].push({ label: ballLabel(e, setup), runs: total, out: t === 'out', extra: t === 'wd' || t === 'nb' });
            // boundaries are not run, so 4 and 6 never change ends
            var preS = d.striker, preN = d.nonStriker;
            // only runs actually run change ends (a 4 or a 6 is not run)
            if (r % 2 === 1) swap();
            if (t === 'out') {
                d.wkts++;
                var how = HOW.indexOf(e.how) >= 0 ? e.how : 'Out';
                var outId = null;
                if (players) {
                    // e.who names the batter by where they stood before the ball: 's' the one facing, 'n' the other
                    outId = e.who === 'n' ? preN : preS;
                    if (outId != null) {
                        var ob = bat(outId);
                        ob.out = how === 'Run out' || how === 'Other' || how === 'Out' ? how.toLowerCase() : how.toLowerCase() + (bw != null ? ' b ' + playerName(setup, bowlTeam, bw) : '');
                        if (d.striker === outId) d.striker = null; else if (d.nonStriker === outId) d.nonStriker = null;
                    }
                    if (bw != null && how !== 'Run out' && how !== 'Other') bowl(bw).wkts++;
                }
                d.fall.push({ wkt: d.wkts, runs: d.runs, over: oversText(d.legal), id: outId });
            }
            var overDone = legal && d.legal % 6 === 0;
            checkDone();
            if (overDone) {
                if (!d.done) swap();
                d.lastBowler = d.bowler; d.bowler = null;
                if (!d.done) d.overList.push([]);
            }
            alone();
        });
        if (!d.done) checkDone();
        if (players && !d.done) {
            alone();
            d.needBatter = d.striker == null || (d.nonStriker == null && !aloneAllowed());
            d.needBowler = !d.needBatter && d.bowler == null;
        }
        if (d.overList.length > 1 && !d.overList[d.overList.length - 1].length && d.done) d.overList.pop();
        d.ballsLeft = Math.max(0, d.overs * 6 - d.legal);
        d.need = d.target != null ? Math.max(0, d.target - d.runs) : null;
        d.rr = rate(d.runs, d.legal);
        d.rrr = d.need != null && d.ballsLeft ? (Math.round(d.need * 600 / d.ballsLeft) / 100).toFixed(2) : null;
        return d;
    }

    // Second innings of each pair chases the first; a typed target (rain-shortened match) wins over that.
    function targetFor(match, index) {
        if (index % 2 === 0) return null;
        var inn = match.innings[index];
        if (inn.target != null) return inn.target;
        return playInnings(match, index - 1).runs + 1;
    }

    // Who won a pair of innings (the main match, or a super over).
    function pairResult(match, first, second) {
        if (!second || !second.done || !first.done) return null;
        var setup = match.setup, A = setup.teams[first.bat].name, B = setup.teams[second.bat].name;
        if (second.runs >= second.target) {
            var w = second.maxW - second.wkts, left = second.ballsLeft;
            return { winner: second.bat, text: B + ' won by ' + w + ' wicket' + (w === 1 ? '' : 's') + (left ? ' (' + left + ' ball' + (left === 1 ? '' : 's') + ' left)' : ' on the last ball') };
        }
        var margin = second.target - 1 - second.runs;
        if (margin === 0) return { winner: null, tie: true, text: 'Match tied: both teams scored ' + second.runs };
        if (margin < 0) return null;
        return { winner: first.bat, text: A + ' won by ' + margin + ' run' + (margin === 1 ? '' : 's') };
    }

    // Everything the screen needs about the whole match.
    function summary(match) {
        var inns = match.innings.map(function (x, i) { return playInnings(match, i); });
        var res = null, phase = 'play', cur = inns[inns.length - 1];
        var pairs = [];
        for (var i = 0; i < inns.length; i += 2) pairs.push(pairResult(match, inns[i], inns[i + 1]));
        var last = pairs[pairs.length - 1];
        if (cur.done) {
            if (inns.length % 2 === 1) phase = 'break';
            else if (last && last.tie) { phase = match.finished ? 'over' : 'tie'; res = last; }
            else { phase = 'over'; res = last; }
        }
        if (res && pairs.length > 1) {
            var main = pairs[0];
            res = { winner: res.winner, tie: res.tie, text: res.tie ? 'Super over tied too' : res.text.replace(/ won by .*/, ' won the super over'), detail: res.text, main: main ? main.text : '' };
        }
        return { inns: inns, current: cur, phase: phase, result: res, pairs: pairs };
    }

    // ---- changing a match (each returns an error message or '') ----
    function current(match) { return match.innings[match.innings.length - 1]; }
    function addBall(match, t, r, extra) {
        var s = summary(match);
        if (s.phase !== 'play') return 'This innings is over.';
        if (s.current.needBatter) return 'Choose who bats next first.';
        if (s.current.needBowler) return 'Choose who bowls this over first.';
        if (['run', 'wd', 'nb', 'bye', 'out'].indexOf(t) < 0) return 'Unknown ball.';
        r = strict(r, 0, 7);
        if (r < 0) return 'Runs must be 0 to 7.';
        var e = { k: 'ball', t: t, r: r };
        if (t === 'out') { e.how = HOW.indexOf(extra && extra.how) >= 0 ? extra.how : 'Bowled'; e.who = extra && extra.who === 'n' ? 'n' : 's'; if (e.how !== 'Run out') { e.who = 's'; e.r = 0; } }
        current(match).events.push(e);
        return '';
    }
    function choose(match, kind, id) {
        var s = summary(match), d = s.current;
        if (s.phase !== 'play') return 'This innings is over.';
        var team = kind === 'bat' ? d.bat : d.bowlTeam, n = match.setup.teams[team].players;
        id = strict(id, 0, n - 1);
        if (id < 0) return 'Pick a player.';
        if (kind === 'bat') {
            if (!d.needBatter) return 'Both batters are already in.';
            if (id === d.striker || id === d.nonStriker) return 'That player is already batting.';
        } else if (kind === 'bowl') {
            if (d.needBatter) return 'Choose who bats next first.';
            if (!d.needBowler) return 'The bowler is already chosen for this over.';
        } else return 'Unknown choice.';
        current(match).events.push({ k: kind, id: id });
        return '';
    }
    function simple(match, k, extra) {
        var s = summary(match);
        if (s.phase !== 'play') return 'This innings is over.';
        if (k === 'swap' && (s.current.striker == null || s.current.nonStriker == null)) return 'Two batters are needed to swap.';
        if (k === 'retire') { var who = extra === 'n' ? s.current.nonStriker : s.current.striker; if (who == null) return 'No batter there.'; current(match).events.push({ k: 'retire', end: extra === 'n' ? 'n' : 's' }); return ''; }
        current(match).events.push({ k: k });
        return '';
    }
    // Takes back the last thing; at the start of an innings it goes back into the previous one.
    function undo(match) {
        var inn = current(match);
        if (match.finished) { match.finished = false; return 'finish'; }
        if (inn.events.length) { var e = inn.events.pop(); return e.k; }
        if (match.innings.length > 1) { match.innings.pop(); return 'innings'; }
        return '';
    }
    function canUndo(match) { return match.finished || current(match).events.length > 0 || match.innings.length > 1; }
    function undoLabel(match) {
        if (match.finished) return 'finishing the match';
        var inn = current(match), e = inn.events[inn.events.length - 1];
        if (!e) return match.innings.length > 1 ? 'starting this innings' : '';
        if (e.k === 'ball') return ({ run: e.r + (e.r === 1 ? ' run' : ' runs'), wd: 'wide' + (e.r ? ' +' + e.r : ''), nb: 'no ball' + (e.r ? ' +' + e.r : ''), bye: e.r + ' bye' + (e.r === 1 ? '' : 's'), out: 'wicket' })[e.t];
        return ({ bat: 'new batter', bowl: 'bowler choice', swap: 'swap strike', retire: 'retired batter', end: 'ending the innings' })[e.k] || 'last change';
    }
    function startNext(match) {
        var s = summary(match);
        if (s.phase === 'break') {
            var first = match.innings[match.innings.length - 1];
            match.innings.push(newInnings(match.setup, match.innings.length, 1 - first.bat, first.overs, first.super));
            return '';
        }
        if (s.phase === 'tie') {
            // the team that batted second bats first in the super over
            var prev = match.innings[match.innings.length - 1];
            match.innings.push(newInnings(match.setup, match.innings.length, prev.bat, 1, true));
            return '';
        }
        return 'Nothing to start.';
    }
    function setOvers(match, v) {
        var n = strict(v, LIMITS.oversMin, LIMITS.oversMax);
        if (n < 0) return 'Overs must be a whole number from 1 to 50.';
        var inn = current(match), d = summary(match).current;
        if (inn.super) return 'A super over is always 1 over.';
        if (n * 6 < d.legal) return 'Already ' + oversText(d.legal) + ' overs bowled; choose at least ' + Math.ceil(d.legal / 6) + '.';
        inn.overs = n;
        return '';
    }
    function setTarget(match, v) {
        var idx = match.innings.length - 1, inn = current(match);
        if (idx % 2 === 0) return 'A target is set only for the team batting second.';
        if (String(v == null ? '' : v).trim() === '') { inn.target = null; return ''; }
        var n = strict(v, 1, 9999);
        if (n < 0) return 'Target must be a whole number from 1 to 9999.';
        inn.target = n;
        return '';
    }
    function finishTie(match) {
        if (summary(match).phase !== 'tie') return 'The match is not tied.';
        match.finished = true; return '';
    }
    function canStillBat(match, id) {
        var d = summary(match).current, b = d.batters[id];
        return { batting: id === d.striker || id === d.nonStriker, out: !!(b && b.out && !b.retired), retired: !!(b && b.retired), yet: !b };
    }

    // ---- restoring saved data safely ----
    function restore(raw) {
        try {
            var m = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!m || typeof m !== 'object' || !Array.isArray(m.innings) || !m.innings.length || m.innings.length > 12) return null;
            var setup = normSetup(m.setup), out = { v: 1, setup: setup, created: int(m.created, 0, 9e15, Date.now()), innings: [], finished: !!m.finished };
            for (var i = 0; i < m.innings.length; i++) {
                var x = m.innings[i] || {}, isSuper = i >= 2;
                var inn = { bat: x.bat === 1 ? 1 : 0, overs: isSuper ? 1 : int(x.overs, 1, 50, setup.overs), super: isSuper, target: x.target == null ? null : int(x.target, 1, 9999, null), events: [] };
                if (i % 2 === 1 && inn.bat === out.innings[i - 1].bat) inn.bat = 1 - inn.bat;
                (Array.isArray(x.events) ? x.events : []).slice(0, 5000).forEach(function (e) {
                    if (!e || typeof e !== 'object') return;
                    if (e.k === 'ball' && ['run', 'wd', 'nb', 'bye', 'out'].indexOf(e.t) >= 0) {
                        var c = { k: 'ball', t: e.t, r: int(e.r, 0, 7, 0) };
                        if (e.t === 'out') { c.how = HOW.indexOf(e.how) >= 0 ? e.how : 'Bowled'; c.who = e.who === 'n' ? 'n' : 's'; }
                        inn.events.push(c);
                    } else if ((e.k === 'bat' || e.k === 'bowl') && setup.mode === 'players') {
                        var team = e.k === 'bat' ? inn.bat : 1 - inn.bat, id = int(e.id, 0, setup.teams[team].players - 1, -1);
                        if (id >= 0) inn.events.push({ k: e.k, id: id });
                    } else if (e.k === 'swap' || e.k === 'end') inn.events.push({ k: e.k });
                    else if (e.k === 'retire') inn.events.push({ k: 'retire', end: e.end === 'n' ? 'n' : 's' });
                });
                out.innings.push(inn);
            }
            summary(out);
            return out;
        } catch (err) { return null; }
    }

    // ---- the scorecard as plain text, for copy and share ----
    function scorecardText(match) {
        var s = summary(match), setup = match.setup, L = [];
        L.push(setup.teams[0].name + ' v ' + setup.teams[1].name + ' · ' + setup.overs + ' over' + (setup.overs === 1 ? '' : 's') + ' a side');
        if (s.result) { L.push(s.result.text); if (s.result.main) L.push(s.result.main); }
        else if (s.phase === 'break') L.push(setup.teams[1 - s.current.bat].name + ' need ' + (s.current.runs + 1) + ' to win');
        else if (s.current.target != null) L.push(setup.teams[s.current.bat].name + ' need ' + s.current.need + ' off ' + s.current.ballsLeft + ' ball' + (s.current.ballsLeft === 1 ? '' : 's'));
        s.inns.forEach(function (d) {
            L.push('');
            L.push((d.super ? 'Super over: ' : '') + setup.teams[d.bat].name + ' ' + d.runs + '/' + d.wkts + ' (' + fmtOvers(d.legal) + ' ov' + (d.done ? '' : ', batting') + ')');
            if (setup.mode === 'players') {
                d.order.forEach(function (id) {
                    var b = d.batters[id], st = b.out ? b.out : (id === d.striker || id === d.nonStriker) && !d.done ? 'batting' : 'not out';
                    L.push('  ' + playerName(setup, d.bat, id) + ' ' + b.runs + ' (' + b.balls + ')' + ' ' + st);
                });
            }
            var ex = d.extras.wd + d.extras.nb + d.extras.b;
            if (ex) L.push('  Extras ' + ex + ' (wides ' + d.extras.wd + ', no balls ' + d.extras.nb + ', byes ' + d.extras.b + ')');
            if (setup.mode === 'players' && d.bowlOrder.length) {
                L.push('  Bowling: ' + d.bowlOrder.map(function (id) { var b = d.bowlers[id]; return playerName(setup, d.bowlTeam, id) + ' ' + fmtOvers(b.legal) + '-' + b.runs + '-' + b.wkts; }).join(', '));
            }
        });
        return L.join('\n');
    }

    var api = { LIMITS: LIMITS, HOW: HOW, normSetup: normSetup, newMatch: newMatch, summary: summary, playInnings: playInnings, addBall: addBall, choose: choose,
        simple: simple, undo: undo, canUndo: canUndo, undoLabel: undoLabel, startNext: startNext, setOvers: setOvers, setTarget: setTarget, restore: restore, finishTie: finishTie,
        scorecardText: scorecardText, playerName: playerName, maxWickets: maxWickets, oversText: oversText, fmtOvers: fmtOvers, rate: rate, canStillBat: canStillBat, int: int, strict: strict, cleanText: cleanText };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Cricket = api;
})(this);
