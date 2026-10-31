// Page code for the Gully Cricket Scorer. The scoring itself is in core.js.
(function () {
    'use strict';
    var C = window.Cricket, SLUG = 'gully-cricket-scorer-for-friends-matches';
    var K_MATCH = SLUG + '.match', K_SETUP = SLUG + '.setup', K_HIST = SLUG + '.history';
    var OVERS = [2, 4, 5, 6, 8, 10, 20];
    var $ = function (id) { return document.getElementById(id); };
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

    // ---------- saving ----------
    var canSave = true;
    function load(key) { try { return localStorage.getItem(key); } catch (e) { canSave = false; return null; } }
    function save(key, val) { try { localStorage.setItem(key, val); } catch (e) { canSave = false; $('storage-warn').hidden = false; } }
    try { localStorage.setItem(SLUG + '.test', '1'); localStorage.removeItem(SLUG + '.test'); } catch (e) { canSave = false; }

    var match = C.restore(load(K_MATCH));
    var draft = (function () { try { return C.normSetup(JSON.parse(load(K_SETUP) || 'null')); } catch (e) { return C.normSetup({}); } })();
    var customOvers = OVERS.indexOf(draft.overs) < 0;
    var history = (function () {
        try {
            var h = JSON.parse(load(K_HIST) || '[]');
            if (!Array.isArray(h)) return [];
            return h.filter(function (x) { return x && typeof x === 'object' && typeof x.result === 'string'; }).slice(0, 30).map(function (x) {
                return { id: C.int(x.id, 0, 9e15, 0), date: C.int(x.date, 0, 9e15, 0), title: C.cleanText(x.title, 80), result: C.cleanText(x.result, 120), scores: C.cleanText(x.scores, 200) };
            });
        } catch (e) { return []; }
    })();
    var ui = { extra: null, outOpen: false, roWho: 's', roRuns: 0, namesOpen: false };
    var lastAnnounced = '';

    function persist() {
        save(K_MATCH, match ? JSON.stringify(match) : '');
        save(K_SETUP, JSON.stringify(draft));
        syncHistory();
        save(K_HIST, JSON.stringify(history));
    }

    // ---------- toast with undo ----------
    var toastTimer = null, toastUndo = null;
    function toast(text, undoFn) {
        $('toast-text').textContent = text;
        toastUndo = undoFn || null;
        $('toast-undo').hidden = !undoFn;
        $('toast').hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { $('toast').hidden = true; toastUndo = null; }, undoFn ? 8000 : 3000);
    }
    $('toast-undo').addEventListener('click', function () { if (toastUndo) toastUndo(); $('toast').hidden = true; toastUndo = null; });

    // ---------- setup screen ----------
    function teamLabel(i) { return draft.teams[i].name || (i ? 'Team B' : 'Team A'); }
    function renderSetup() {
        var list = $('team-boxes'); list.textContent = '';
        draft.teams.forEach(function (t, i) {
            var li = el('li', 'tbox');
            var lab = el('label', null, (i ? 'Second' : 'First') + ' team name'); lab.htmlFor = 'team-' + i;
            var inp = el('input'); inp.type = 'text'; inp.id = 'team-' + i; inp.maxLength = C.LIMITS.teamName; inp.autocomplete = 'off';
            inp.placeholder = i ? 'Team B' : 'Team A'; inp.value = t.name === (i ? 'Team B' : 'Team A') ? '' : t.name;
            inp.addEventListener('input', function () { draft.teams[i].name = C.cleanText(inp.value, C.LIMITS.teamName) || (i ? 'Team B' : 'Team A'); updateFirstLabels(); save(K_SETUP, JSON.stringify(draft)); });
            li.appendChild(lab); li.appendChild(inp);
            var pl = el('span', 'label', 'Players'); pl.id = 'pl-label-' + i; li.appendChild(pl);
            var step = el('div', 'stepper'); step.setAttribute('role', 'group'); step.setAttribute('aria-labelledby', 'pl-label-' + i);
            var minus = el('button', 'step', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'One player fewer'); minus.id = 'pl-minus-' + i;
            var val = el('output', 'step-val', String(t.players)); val.id = 'pl-val-' + i; val.setAttribute('aria-live', 'polite');
            var plus = el('button', 'step', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'One more player'); plus.id = 'pl-plus-' + i;
            minus.disabled = t.players <= C.LIMITS.playersMin; plus.disabled = t.players >= C.LIMITS.playersMax;
            function change(dn) { readNames(); var n = t.players + dn; if (n < C.LIMITS.playersMin || n > C.LIMITS.playersMax) return; t.players = n; while (t.names.length < n) t.names.push(''); t.names.length = n; draft = C.normSetup(draft); save(K_SETUP, JSON.stringify(draft)); renderSetup(); var b = $(dn < 0 ? 'pl-minus-' + i : 'pl-plus-' + i); if (b && !b.disabled) b.focus(); }
            minus.addEventListener('click', function () { change(-1); });
            plus.addEventListener('click', function () { change(1); });
            step.appendChild(minus); step.appendChild(val); step.appendChild(plus); li.appendChild(step);
            var w = C.maxWickets(draft, i);
            li.appendChild(el('p', 'hint tight-hint', 'All out at ' + w + ' wicket' + (w === 1 ? '' : 's') + '.'));
            if (draft.mode === 'players') {
                var nl = el('span', 'label', 'Player names (optional)'); li.appendChild(nl);
                var grid = el('div', 'names-grid');
                for (var k = 0; k < t.players; k++) {
                    var ni = el('input'); ni.type = 'text'; ni.maxLength = C.LIMITS.playerName; ni.autocomplete = 'off'; ni.className = 'pname-in';
                    ni.dataset.team = i; ni.dataset.idx = k; ni.placeholder = 'Player ' + (k + 1); ni.value = t.names[k] || '';
                    ni.setAttribute('aria-label', teamLabel(i) + ' player ' + (k + 1) + ' name');
                    ni.addEventListener('input', function () { readNames(); save(K_SETUP, JSON.stringify(draft)); });
                    grid.appendChild(ni);
                }
                li.appendChild(grid);
            }
            list.appendChild(li);
        });
        var chips = $('overs-chips'); chips.textContent = '';
        OVERS.concat(['custom']).forEach(function (o) {
            var b = el('button', 'chip', o === 'custom' ? 'Custom' : String(o)); b.type = 'button';
            b.id = 'ov-' + o;
            var on = o === 'custom' ? customOvers : (!customOvers && draft.overs === o);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.addEventListener('click', function () {
                if (o === 'custom') { customOvers = true; $('overs-custom').value = OVERS.indexOf(draft.overs) < 0 ? String(draft.overs) : ''; }
                else { customOvers = false; draft.overs = o; save(K_SETUP, JSON.stringify(draft)); }
                $('overs-err').textContent = ''; renderSetup();
                if (o === 'custom') $('overs-custom').focus();
            });
            chips.appendChild(b);
        });
        $('overs-custom-box').hidden = !customOvers;
        if (customOvers && !$('overs-custom').value) $('overs-custom').value = OVERS.indexOf(draft.overs) < 0 ? String(draft.overs) : '';
        press('first-0', draft.battingFirst === 0); press('first-1', draft.battingFirst === 1);
        press('mode-team', draft.mode === 'team'); press('mode-players', draft.mode === 'players');
        $('mode-hint').textContent = draft.mode === 'team' ? 'Quickest: just the team\'s runs, wickets and overs.' : 'Also each batter\'s runs and balls and each bowler\'s overs. You tap who bats and who bowls.';
        press('wd-run-1', draft.wideRun === 1); press('wd-run-0', draft.wideRun === 0);
        press('wd-again-1', draft.wideRebowl); press('wd-again-0', !draft.wideRebowl);
        press('nb-run-1', draft.nbRun === 1); press('nb-run-0', draft.nbRun === 0);
        press('nb-again-1', draft.nbRebowl); press('nb-again-0', !draft.nbRebowl);
        press('lm-0', !draft.lastMan); press('lm-1', draft.lastMan);
        updateFirstLabels();
    }
    function readNames() {
        document.querySelectorAll('#team-boxes .pname-in').forEach(function (inp) {
            draft.teams[+inp.dataset.team].names[+inp.dataset.idx] = C.cleanText(inp.value, C.LIMITS.playerName);
        });
    }
    function updateFirstLabels() { $('first-0').textContent = teamLabel(0); $('first-1').textContent = teamLabel(1); }
    function press(id, on) { $(id).setAttribute('aria-pressed', on ? 'true' : 'false'); }
    function bindToggle(id, fn) { $(id).addEventListener('click', function () { readNames(); fn(); draft = C.normSetup(draft); save(K_SETUP, JSON.stringify(draft)); renderSetup(); }); }
    bindToggle('first-0', function () { draft.battingFirst = 0; });
    bindToggle('first-1', function () { draft.battingFirst = 1; });
    bindToggle('mode-team', function () { draft.mode = 'team'; });
    bindToggle('mode-players', function () { draft.mode = 'players'; });
    bindToggle('wd-run-1', function () { draft.wideRun = 1; });
    bindToggle('wd-run-0', function () { draft.wideRun = 0; });
    bindToggle('wd-again-1', function () { draft.wideRebowl = true; });
    bindToggle('wd-again-0', function () { draft.wideRebowl = false; });
    bindToggle('nb-run-1', function () { draft.nbRun = 1; });
    bindToggle('nb-run-0', function () { draft.nbRun = 0; });
    bindToggle('nb-again-1', function () { draft.nbRebowl = true; });
    bindToggle('nb-again-0', function () { draft.nbRebowl = false; });
    bindToggle('lm-0', function () { draft.lastMan = false; });
    bindToggle('lm-1', function () { draft.lastMan = true; });
    $('overs-custom').addEventListener('input', function () {
        var n = C.strict($('overs-custom').value, C.LIMITS.oversMin, C.LIMITS.oversMax);
        $('overs-err').textContent = n < 0 && $('overs-custom').value.trim() ? 'Type a whole number from 1 to 50.' : '';
        $('overs-custom').setAttribute('aria-invalid', n < 0 && $('overs-custom').value.trim() ? 'true' : 'false');
        if (n > 0) { draft.overs = n; save(K_SETUP, JSON.stringify(draft)); }
    });

    $('start').addEventListener('click', function () {
        readNames();
        if (customOvers) {
            var n = C.strict($('overs-custom').value, C.LIMITS.oversMin, C.LIMITS.oversMax);
            if (n < 0) { $('overs-err').textContent = 'Type a whole number from 1 to 50.'; $('overs-custom').setAttribute('aria-invalid', 'true'); $('overs-custom').focus(); return; }
            draft.overs = n;
        }
        draft = C.normSetup(draft);
        match = C.newMatch(draft);
        ui = { extra: null, outOpen: false, roWho: 's', roRuns: 0, namesOpen: false };
        persist(); render(); window.scrollTo(0, 0);
        var first = document.querySelector('#pick-list button, #pad-main .run');
        if (first) first.focus();
    });

    // ---------- the match screens ----------
    function teamName(i) { return match.setup.teams[i].name; }
    function pname(team, id) { return C.playerName(match.setup, team, id); }
    function ordinal(i) { return ['1st', '2nd'][i % 2] + ' innings'; }

    function render() {
        var playing = !!match;
        $('setup').hidden = playing;
        $('play-grid').hidden = !playing;
        $('board').hidden = !playing;
        document.querySelector('main').classList.toggle('playing', playing);
        if (!playing) { renderSetup(); renderHistory(); return; }
        var s = C.summary(match), d = s.current, setup = match.setup, players = setup.mode === 'players';
        // board
        var innLabel = d.super ? 'Super over' + (d.index % 2 ? ' · chase' : '') : ordinal(d.index);
        $('board-innings').textContent = innLabel;
        $('board-team').textContent = teamName(d.bat);
        $('board-runs').textContent = d.runs + '/' + d.wkts;
        $('board-overs').textContent = 'Overs ' + (d.done ? C.fmtOvers(d.legal) : C.oversText(d.legal)) + ' of ' + d.overs + (d.ballsLeft && !d.done ? ' · ' + d.ballsLeft + ' ball' + (d.ballsLeft === 1 ? '' : 's') + ' left' : '');
        var chase = $('board-chase');
        if (d.target != null && !d.done) {
            chase.hidden = false;
            chase.textContent = teamName(d.bat) + ' need ' + d.need + ' off ' + d.ballsLeft + ' ball' + (d.ballsLeft === 1 ? '' : 's');
        } else if (d.target != null && d.done) { chase.hidden = false; chase.textContent = 'Target was ' + d.target; }
        else chase.hidden = true;
        $('board-rates').textContent = 'Run rate ' + d.rr + (d.rrr && !d.done ? ' · Required rate ' + d.rrr : '');
        // batters and bowler
        $('board-players').hidden = !players;
        if (players) {
            var cr = $('crease'); cr.textContent = '';
            [d.striker, d.nonStriker].forEach(function (id, k) {
                if (id == null) return;
                var b = d.batters[id], li = el('li', k === 0 ? 'on-strike' : '');
                var n = el('span', 'cname', pname(d.bat, id) + (k === 0 ? ' *' : ''));
                li.appendChild(n); li.appendChild(el('span', 'cfig', b.runs + ' (' + b.balls + ')'));
                cr.appendChild(li);
            });
            if (!cr.children.length) cr.appendChild(el('li', 'muted', 'Choose the batters below.'));
            var bw = d.bowler != null ? d.bowler : null;
            if (bw != null) { var f = d.bowlers[bw]; $('board-bowler').textContent = 'Bowling: ' + pname(d.bowlTeam, bw) + ' ' + C.fmtOvers(f.legal) + ' overs, ' + f.runs + ' runs, ' + f.wkts + ' wicket' + (f.wkts === 1 ? '' : 's'); }
            else $('board-bowler').textContent = d.done ? '' : 'Bowler: choose below.';
        }
        var ov = $('this-over'); ov.textContent = '';
        var cur = d.overList[d.overList.length - 1] || [];
        cur.forEach(function (b) { var li = el('li', 'ball' + (b.out ? ' w' : b.extra ? ' x' : b.label === '4' ? ' b4' : b.label === '6' ? ' b6' : ''), b.label); ov.appendChild(li); });
        if (!cur.length) ov.appendChild(el('li', 'empty', d.done ? 'Innings over' : 'No balls yet'));

        // pick, pad, break, result
        var phase = s.phase;
        renderPick(d, phase);
        $('pad').hidden = phase !== 'play' || (players && (d.needBatter || d.needBowler));
        if (!$('pad').hidden) renderPad(d);
        $('break').hidden = phase !== 'break';
        if (phase === 'break') {
            var next = 1 - d.bat, need = d.runs + 1;
            $('break-title').textContent = teamName(next) + ' need ' + need + ' to win';
            $('break-sub').textContent = teamName(d.bat) + ' made ' + d.runs + '/' + d.wkts + ' in ' + C.fmtOvers(d.legal) + ' over' + (d.legal === 6 ? '' : 's') + '. ' + teamName(next) + ' have ' + d.overs + ' over' + (d.overs === 1 ? '' : 's') + (d.super ? ' (super over).' : '.');
            $('start-next').textContent = 'Start ' + teamName(next) + '\'s ' + (d.super ? 'super over' : 'innings');
        }
        $('result').hidden = phase !== 'over' && phase !== 'tie';
        if (phase === 'over' || phase === 'tie') {
            $('result-title').textContent = s.result.text;
            var lines = s.inns.filter(function (x) { return !x.super; }).map(function (x) { return teamName(x.bat) + ' ' + x.runs + '/' + x.wkts + ' (' + C.fmtOvers(x.legal) + ' ov)'; });
            var sub = lines.join(' · ');
            if (s.result.main) sub += '. ' + s.result.main + '; super over: ' + s.inns.filter(function (x) { return x.super; }).slice(-2).map(function (x) { return teamName(x.bat) + ' ' + x.runs + '/' + x.wkts; }).join(', ');
            $('result-sub').textContent = sub;
            $('tie-box').hidden = phase !== 'tie';
        }
        $('share').hidden = !navigator.share;
        renderScorecard(s);
        renderHistory();
        announce(s);
        keepAwake(phase === 'play');
    }

    function renderPick(d, phase) {
        var box = $('pick'), players = match.setup.mode === 'players';
        if (!players || phase !== 'play' || (!d.needBatter && !d.needBowler)) { box.hidden = true; return; }
        box.hidden = false;
        var list = $('pick-list'), again = $('pick-again'); list.textContent = ''; again.textContent = '';
        var team = d.needBatter ? d.bat : d.bowlTeam, n = match.setup.teams[team].players;
        if (d.needBatter) {
            var first = d.legal === 0 && d.wkts === 0 && d.order.length < 2;
            $('pick-title').textContent = first ? (d.striker == null ? 'Who faces the first ball?' : 'Who is the other opener?') : 'Who bats next for ' + teamName(team) + '?';
            $('pick-hint').textContent = first ? teamName(team) + ' batting.' : 'Wicket! ' + d.runs + '/' + d.wkts + '.';
            var againCount = 0;
            for (var i = 0; i < n; i++) {
                if (i === d.striker || i === d.nonStriker) continue;
                var b = d.batters[i];
                var btn = pickBtn(pname(team, i), b ? (b.retired ? 'retired, ' + b.runs + ' (' + b.balls + ')' : 'out, ' + b.runs) : '', 'bat', i);
                if (b && !b.retired) { again.appendChild(btn); againCount++; } else list.appendChild(btn);
            }
            $('pick-again-box').hidden = !againCount;
            if (!list.children.length) { list.appendChild(el('p', 'hint', 'Everyone has batted. Open Someone bats again, or tap Undo.')); $('pick-again-box').open = true; }
        } else {
            $('pick-title').textContent = 'Who bowls ' + (d.legal ? 'over ' + (Math.floor(d.legal / 6) + 1) : 'the first over') + '?';
            $('pick-hint').textContent = teamName(team) + ' bowling.';
            $('pick-again-box').hidden = true;
            var later = [];
            for (var j = 0; j < n; j++) {
                var f = d.bowlers[j], note = f ? C.fmtOvers(f.legal) + '-' + f.runs + '-' + f.wkts : '';
                if (j === d.lastBowler) later.push(pickBtn(pname(team, j), 'bowled the last over', 'bowl', j));
                else list.appendChild(pickBtn(pname(team, j), note, 'bowl', j));
            }
            later.forEach(function (b) { list.appendChild(b); });
        }
        var undoP = el('button', 'ghost', C.canUndo(match) ? 'Undo: ' + C.undoLabel(match) : 'Undo'); undoP.type = 'button'; undoP.id = 'undo-pick';
        undoP.disabled = !C.canUndo(match);
        undoP.addEventListener('click', doUndo);
        list.parentNode.querySelectorAll('#undo-pick').forEach(function (x) { x.remove(); });
        box.appendChild(undoP);
    }
    function pickBtn(name, note, kind, id) {
        var b = el('button', 'pick-btn'); b.type = 'button';
        b.appendChild(el('span', 'pk-name', name));
        if (note) b.appendChild(el('small', null, note));
        b.addEventListener('click', function () {
            var err = C.choose(match, kind, id);
            if (err) { toast(err); return; }
            persist(); render();
            var nx = document.querySelector('#pick-list button') || document.querySelector('#pad-main .run');
            if (nx) nx.focus();
        });
        return b;
    }

    function renderPad(d) {
        var players = match.setup.mode === 'players', blocked = players && (d.needBatter || d.needBowler);
        $('undo').disabled = !C.canUndo(match);
        $('undo').setAttribute('aria-label', C.canUndo(match) ? 'Undo ' + C.undoLabel(match) : 'Nothing to undo');
        $('undo').title = C.canUndo(match) ? 'Undo ' + C.undoLabel(match) : '';
        // extra runs panel
        var ep = $('extra-panel');
        ep.hidden = !ui.extra || blocked;
        if (ui.extra && !blocked) {
            var q = { wd: 'Wide: how many runs did they run as well?', nb: 'No ball: how many runs off the bat?', bye: 'Byes: how many runs?' }[ui.extra];
            $('extra-q').textContent = q;
            var opts = ui.extra === 'bye' ? [1, 2, 3, 4] : ui.extra === 'nb' ? [0, 1, 2, 3, 4, 6] : [0, 1, 2, 3, 4];
            var box = $('extra-runs'); box.textContent = '';
            opts.forEach(function (r) {
                var lbl = r === 0 ? (ui.extra === 'wd' ? 'None' : '0') : String(r);
                var b = el('button', 'run', lbl); b.type = 'button'; b.dataset.extraRun = r;
                b.setAttribute('aria-label', ui.extra === 'wd' ? 'Wide' + (r ? ' plus ' + r : ' only') : ui.extra === 'nb' ? 'No ball' + (r ? ' plus ' + r + ' off the bat' : ' only') : r + ' bye' + (r === 1 ? '' : 's'));
                b.addEventListener('click', function () { var t = ui.extra; ui.extra = null; ball(t, r); });
                box.appendChild(b);
            });
        }
        // out panel
        var op = $('out-panel');
        op.hidden = !ui.outOpen || blocked;
        if (ui.outOpen && !blocked) {
            var hl = $('how-list');
            if (!hl.children.length) C.HOW.forEach(function (h) {
                var b = el('button', 'ext', h); b.type = 'button'; b.dataset.how = h;
                b.addEventListener('click', function () {
                    if (h === 'Run out') { ui.runout = true; ui.roRuns = 0; ui.roWho = 's'; render(); $('runout-save').focus(); return; }
                    ui.outOpen = false; ui.runout = false; ball('out', 0, { how: h });
                });
                hl.appendChild(b);
            });
            hl.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', ui.runout && b.dataset.how === 'Run out' ? 'true' : 'false'); });
            $('runout-box').hidden = !ui.runout;
            $('runout-who-box').hidden = !players || d.nonStriker == null;
            if (players) {
                $('ro-s').textContent = d.striker != null ? pname(d.bat, d.striker) + ' (facing)' : 'Striker';
                $('ro-n').textContent = d.nonStriker != null ? pname(d.bat, d.nonStriker) : 'Other batter';
                press('ro-s', ui.roWho === 's'); press('ro-n', ui.roWho === 'n');
            }
            var rr = $('ro-runs'); rr.textContent = '';
            [0, 1, 2, 3].forEach(function (r) {
                var b = el('button', null, String(r)); b.type = 'button'; b.setAttribute('aria-pressed', ui.roRuns === r ? 'true' : 'false');
                b.addEventListener('click', function () { ui.roRuns = r; render(); });
                rr.appendChild(b);
            });
        }
        document.querySelectorAll('#pad-main [data-extra]').forEach(function (b) { b.setAttribute('aria-pressed', ui.extra === b.dataset.extra ? 'true' : 'false'); });
        $('out-open').setAttribute('aria-pressed', ui.outOpen ? 'true' : 'false');
        // options
        $('player-opts').hidden = !players;
        if (players) {
            $('swap').disabled = d.striker == null || d.nonStriker == null;
            $('retire-s').disabled = d.striker == null;
            $('retire-s').textContent = d.striker != null ? 'Retire ' + pname(d.bat, d.striker) : 'Retire batter';
        }
        if (document.activeElement !== $('set-overs')) $('set-overs').value = String(d.overs);
        $('set-overs').disabled = d.super; $('set-overs-save').disabled = d.super;
        $('target-box').hidden = d.index % 2 === 0 || d.super;
        if (d.index % 2 === 1) {
            var normal = C.playInnings(match, d.index - 1).runs + 1;
            if (document.activeElement !== $('set-target')) $('set-target').value = match.innings[d.index].target != null ? String(match.innings[d.index].target) : '';
            $('set-target').placeholder = String(normal);
            $('target-hint').textContent = 'Normal target: ' + normal + ' (' + teamName(1 - d.bat) + '\'s score + 1). Leave blank to keep it.';
        }
        renderNames();
    }

    function ball(t, r, extra) {
        var err = C.addBall(match, t, r, extra);
        $('pad-err').textContent = err;
        if (err) return;
        ui.extra = null; ui.outOpen = false; ui.runout = false;
        persist(); render();
        var s = C.summary(match);
        if (s.phase !== 'play') { var f = document.querySelector('#break:not([hidden]) .primary, #result:not([hidden]) .primary'); if (f) f.focus(); }
        else if (document.activeElement && (document.activeElement.offsetParent === null || document.activeElement.disabled)) { var nx = document.querySelector('#pick:not([hidden]) .pick-btn') || document.querySelector('#pad-main .run'); if (nx) nx.focus(); }
    }

    document.querySelectorAll('#pad-main [data-run]').forEach(function (b) { b.addEventListener('click', function () { ui.extra = null; ui.outOpen = false; ball('run', +b.dataset.run); }); });
    $('five').addEventListener('click', function () { ui.extra = null; ui.outOpen = false; ball('run', 5); });
    document.querySelectorAll('#pad-main [data-extra]').forEach(function (b) {
        b.addEventListener('click', function () { ui.outOpen = false; ui.runout = false; ui.extra = ui.extra === b.dataset.extra ? null : b.dataset.extra; render(); var f = document.querySelector('#extra-runs button'); if (f && ui.extra) f.focus(); });
    });
    $('extra-cancel').addEventListener('click', function () { ui.extra = null; render(); });
    $('out-open').addEventListener('click', function () { ui.extra = null; ui.outOpen = !ui.outOpen; ui.runout = false; render(); var f = document.querySelector('#how-list button'); if (f && ui.outOpen) f.focus(); });
    $('out-cancel').addEventListener('click', function () { ui.outOpen = false; ui.runout = false; render(); $('out-open').focus(); });
    $('ro-s').addEventListener('click', function () { ui.roWho = 's'; render(); });
    $('ro-n').addEventListener('click', function () { ui.roWho = 'n'; render(); });
    $('runout-save').addEventListener('click', function () { var w = ui.roWho, r = ui.roRuns; ui.outOpen = false; ui.runout = false; ball('out', r, { how: 'Run out', who: w }); });

    function doUndo() {
        if (!match || !C.canUndo(match)) return;
        var label = C.undoLabel(match);
        C.undo(match); ui.extra = null; ui.outOpen = false; ui.runout = false;
        persist(); render();
        toast('Undone: ' + label + '.');
    }
    $('undo').addEventListener('click', doUndo);
    $('undo-break').addEventListener('click', doUndo);
    $('undo-result').addEventListener('click', doUndo);
    $('start-next').addEventListener('click', function () { C.startNext(match); persist(); render(); window.scrollTo(0, 0); var f = document.querySelector('#pick:not([hidden]) .pick-btn') || document.querySelector('#pad-main .run'); if (f) f.focus(); });
    $('super-over').addEventListener('click', function () { C.startNext(match); persist(); render(); window.scrollTo(0, 0); });
    $('finish-tie').addEventListener('click', function () { C.finishTie(match); persist(); render(); });
    $('swap').addEventListener('click', function () { var e = C.simple(match, 'swap'); if (e) return toast(e); persist(); render(); toast('Strike swapped.'); });
    $('retire-s').addEventListener('click', function () { var e = C.simple(match, 'retire', 's'); if (e) return toast(e); persist(); render(); toast('Batter retired (not out). They can bat again later.'); });
    $('set-overs-save').addEventListener('click', function () {
        var e = C.setOvers(match, $('set-overs').value);
        $('set-overs-err').textContent = e; $('set-overs').setAttribute('aria-invalid', e ? 'true' : 'false');
        if (e) return;
        persist(); $('set-overs').blur(); render(); toast('Overs for this innings: ' + C.summary(match).current.overs + '.');
    });
    $('set-target-save').addEventListener('click', function () {
        var e = C.setTarget(match, $('set-target').value);
        $('set-target-err').textContent = e; $('set-target').setAttribute('aria-invalid', e ? 'true' : 'false');
        if (e) return;
        persist(); $('set-target').blur(); render(); toast('Target: ' + C.summary(match).current.target + '.');
    });
    $('end-innings').addEventListener('click', function () {
        var d = C.summary(match).current;
        if (!confirm('End ' + teamName(d.bat) + '\'s innings now at ' + d.runs + '/' + d.wkts + '? You can undo this.')) return;
        C.simple(match, 'end'); $('more').open = false; persist(); render(); window.scrollTo(0, 0);
    });

    // fix names during a match
    function renderNames() {
        $('names-panel').hidden = !ui.namesOpen;
        $('names-open').hidden = ui.namesOpen;
        if (!ui.namesOpen) return;
        var list = $('names-boxes');
        if (list.dataset.built === '1') return;
        list.textContent = ''; list.dataset.built = '1';
        match.setup.teams.forEach(function (t, i) {
            var li = el('li', 'tbox');
            var lab = el('label', null, 'Team name'); lab.htmlFor = 'fix-team-' + i;
            var inp = el('input'); inp.type = 'text'; inp.id = 'fix-team-' + i; inp.maxLength = C.LIMITS.teamName; inp.value = t.name; inp.dataset.fix = 'team'; inp.dataset.team = i;
            li.appendChild(lab); li.appendChild(inp);
            if (match.setup.mode === 'players') {
                var g = el('div', 'names-grid');
                t.names.forEach(function (n, k) {
                    var ni = el('input'); ni.type = 'text'; ni.maxLength = C.LIMITS.playerName; ni.value = n; ni.placeholder = 'Player ' + (k + 1);
                    ni.dataset.fix = 'player'; ni.dataset.team = i; ni.dataset.idx = k; ni.setAttribute('aria-label', t.name + ' player ' + (k + 1) + ' name');
                    g.appendChild(ni);
                });
                li.appendChild(el('span', 'label', 'Players')); li.appendChild(g);
            }
            list.appendChild(li);
        });
    }
    $('names-open').addEventListener('click', function () { ui.namesOpen = true; $('names-boxes').dataset.built = ''; render(); var f = $('fix-team-0'); if (f) f.focus(); });
    $('names-save').addEventListener('click', function () {
        document.querySelectorAll('#names-boxes input').forEach(function (inp) {
            var t = match.setup.teams[+inp.dataset.team];
            if (inp.dataset.fix === 'team') t.name = C.cleanText(inp.value, C.LIMITS.teamName) || t.name;
            else t.names[+inp.dataset.idx] = C.cleanText(inp.value, C.LIMITS.playerName);
        });
        draft.teams.forEach(function (t, i) { t.name = match.setup.teams[i].name; t.names = match.setup.teams[i].names.slice(); t.players = match.setup.teams[i].players; });
        draft = C.normSetup(draft);
        ui.namesOpen = false; persist(); render(); toast('Names saved.'); $('names-open').focus();
    });

    // new match, keeping the teams and rules
    function newMatch() {
        var prev = match, prevDraft = JSON.stringify(draft);
        draft = C.normSetup(JSON.parse(JSON.stringify(match.setup)));
        customOvers = OVERS.indexOf(draft.overs) < 0; $('overs-custom').value = customOvers ? String(draft.overs) : '';
        match = null; ui = { extra: null, outOpen: false, roWho: 's', roRuns: 0, namesOpen: false };
        $('more').open = false;
        persist(); render(); window.scrollTo(0, 0);
        toast('New match: check the teams and tap Start match.', function () { match = prev; draft = C.normSetup(JSON.parse(prevDraft)); persist(); render(); });
        $('team-0').focus();
    }
    $('rematch').addEventListener('click', newMatch);
    $('new-from-play').addEventListener('click', function () {
        var d = C.summary(match);
        if (d.inns.some(function (x) { return x.legal > 0 || x.runs > 0; }) && d.phase !== 'over' && !confirm('Leave this match and start a new one? You can undo this.')) return;
        newMatch();
    });

    // ---------- scorecard ----------
    function renderScorecard(s) {
        var card = $('scorecard'), body = $('sc-body'); body.textContent = '';
        var any = s.inns.some(function (x) { return x.legal || x.runs || x.order.length; });
        card.hidden = !any;
        if (!any) return;
        var players = match.setup.mode === 'players';
        s.inns.slice().reverse().forEach(function (d) {
            var box = el('div', 'inn-box');
            var h = el('h3', null, (d.super ? 'Super over: ' : '') + teamName(d.bat) + ' ' + d.runs + '/' + d.wkts);
            h.appendChild(el('span', 'muted', ' (' + C.fmtOvers(d.legal) + ' of ' + d.overs + ' ov' + (d.done ? '' : ', batting') + ')'));
            box.appendChild(h);
            if (players && d.order.length) {
                var sc = el('div', 'scroll'), t = el('table'), th = el('thead'), tr = el('tr');
                ['Batter', 'R', 'B', '4s', '6s'].forEach(function (x, i) { var c = el('th', null, x); c.scope = 'col'; if (i === 1) c.title = 'Runs'; if (i === 2) c.title = 'Balls'; tr.appendChild(c); });
                th.appendChild(tr); t.appendChild(th);
                var tb = el('tbody');
                d.order.forEach(function (id) {
                    var b = d.batters[id], r = el('tr'), c0 = el('th'); c0.scope = 'row';
                    c0.appendChild(el('span', 'nm', pname(d.bat, id) + ((id === d.striker) && !d.done ? ' *' : '')));
                    c0.appendChild(el('small', null, b.out ? b.out : (id === d.striker || id === d.nonStriker) && !d.done ? 'batting' : 'not out'));
                    r.appendChild(c0);
                    [b.runs, b.balls, b.f4, b.f6].forEach(function (v) { r.appendChild(el('td', null, String(v))); });
                    tb.appendChild(r);
                });
                t.appendChild(tb); sc.appendChild(t); box.appendChild(sc);
            }
            var ex = d.extras.wd + d.extras.nb + d.extras.b;
            box.appendChild(el('p', 'sc-line', 'Extras ' + ex + (ex ? ' (wides ' + d.extras.wd + ', no balls ' + d.extras.nb + ', byes ' + d.extras.b + ')' : '') + ' · Run rate ' + d.rr));
            if (d.fall.length) box.appendChild(el('p', 'sc-line', 'Wickets fell at: ' + d.fall.map(function (f) { return f.runs + '/' + f.wkt + ' (' + f.over + ')' + (players && f.id != null ? ' ' + pname(d.bat, f.id) : ''); }).join(', ')));
            if (players && d.bowlOrder.length) {
                var sc2 = el('div', 'scroll'), t2 = el('table'), th2 = el('thead'), tr2 = el('tr');
                ['Bowler', 'O', 'R', 'W', 'Wd', 'Nb'].forEach(function (x) { var c = el('th', null, x); c.scope = 'col'; tr2.appendChild(c); });
                th2.appendChild(tr2); t2.appendChild(th2);
                var tb2 = el('tbody');
                d.bowlOrder.forEach(function (id) {
                    var f = d.bowlers[id], r = el('tr'), c0 = el('th'); c0.scope = 'row'; c0.appendChild(el('span', 'nm', pname(d.bowlTeam, id))); r.appendChild(c0);
                    [C.fmtOvers(f.legal), f.runs, f.wkts, f.wd, f.nb].forEach(function (v) { r.appendChild(el('td', null, String(v))); });
                    tb2.appendChild(r);
                });
                t2.appendChild(tb2); sc2.appendChild(t2); box.appendChild(sc2);
            }
            var overs = d.overList.filter(function (o) { return o.length; });
            if (overs.length) {
                var ol = el('ol', 'over-sum');
                overs.forEach(function (o, i) {
                    var runs = o.reduce(function (a, b) { return a + b.runs; }, 0), w = o.filter(function (b) { return b.out; }).length;
                    var li = el('li');
                    li.appendChild(el('b', null, 'Over ' + (i + 1) + ': ' + runs + (w ? ', ' + w + ' wkt' : '')));
                    li.appendChild(el('span', 'muted', ' ' + o.map(function (b) { return b.label; }).join(' ')));
                    ol.appendChild(li);
                });
                box.appendChild(ol);
            }
            body.appendChild(box);
        });
    }

    // ---------- copy and share ----------
    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
        return Promise.resolve(fallbackCopy(text));
    }
    function fallbackCopy(text) {
        var ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove(); return ok;
    }
    function doCopy() { copyText(C.scorecardText(match)).then(function (ok) { toast(ok ? 'Scorecard copied. Paste it in your group chat.' : 'Could not copy on this browser.'); }); }
    $('copy').addEventListener('click', doCopy);
    $('copy-live').addEventListener('click', doCopy);
    $('share').addEventListener('click', function () {
        if (!navigator.share) return doCopy();
        navigator.share({ title: teamName(0) + ' v ' + teamName(1), text: C.scorecardText(match) }).catch(function () {});
    });

    // ---------- past matches ----------
    function syncHistory() {
        if (!match) return;
        var s = C.summary(match), id = match.created, at = history.findIndex(function (h) { return h.id === id; });
        if (s.phase === 'over' && s.result) {
            var entry = { id: id, date: Date.now(), title: teamName(0) + ' v ' + teamName(1) + ' · ' + match.setup.overs + ' overs',
                result: s.result.text, scores: s.inns.filter(function (x) { return !x.super; }).map(function (x) { return teamName(x.bat) + ' ' + x.runs + '/' + x.wkts + ' (' + C.fmtOvers(x.legal) + ')'; }).join(' · ') };
            if (at >= 0) { entry.date = history[at].date; history[at] = entry; } else history.unshift(entry);
            history = history.slice(0, 30);
        } else if (at >= 0) history.splice(at, 1);
    }
    function renderHistory() {
        var card = $('history-card'), list = $('history'); list.textContent = '';
        card.hidden = !history.length;
        history.forEach(function (h) {
            var li = el('li', 'hbox');
            li.appendChild(el('p', 'h-title', h.title));
            li.appendChild(el('p', 'h-win', h.result));
            li.appendChild(el('p', 'h-meta', h.scores + (h.date ? ' · ' + new Date(h.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')));
            list.appendChild(li);
        });
    }
    $('clear-history').addEventListener('click', function () {
        var old = history.slice(); history = [];
        save(K_HIST, '[]'); render();
        toast('Past matches cleared.', function () { history = old; save(K_HIST, JSON.stringify(history)); render(); });
    });

    // ---------- screen reader and screen awake ----------
    function announce(s) {
        var d = s.current, t;
        if (s.phase === 'over' || s.phase === 'tie') t = s.result.text;
        else if (s.phase === 'break') t = 'Innings over. ' + teamName(1 - d.bat) + ' need ' + (d.runs + 1) + ' to win.';
        else t = teamName(d.bat) + ' ' + d.runs + ' for ' + d.wkts + ', ' + C.oversText(d.legal) + ' overs' + (d.need != null ? '. Need ' + d.need + ' off ' + d.ballsLeft : '');
        if (t !== lastAnnounced) { $('announce').textContent = t; lastAnnounced = t; }
    }
    var lock = null;
    function keepAwake(on) {
        try {
            if (on && !lock && navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').then(function (l) { lock = l; l.addEventListener('release', function () { lock = null; }); }).catch(function () {});
            else if (!on && lock) { lock.release().catch(function () {}); lock = null; }
        } catch (e) { lock = null; }
    }
    document.addEventListener('visibilitychange', function () { if (match && document.visibilityState === 'visible') keepAwake(C.summary(match).phase === 'play'); });

    if (!canSave) $('storage-warn').hidden = false;
    lastAnnounced = '';
    render();
    lastAnnounced = $('announce').textContent; $('announce').textContent = '';

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
