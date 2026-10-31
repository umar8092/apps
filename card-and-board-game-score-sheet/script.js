// Page code for the score sheet. The maths lives in core.js. Names are always shown with textContent, never as HTML.
(function () {
    'use strict';
    const C = window.ScoreCore, KEY = 'card-and-board-game-score-sheet';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    // ---------- state ----------
    const freshSetup = () => ({ names: ['', ''], rules: { presetId: 'custom', high: true, end: 'none', limit: 0 } });
    let S = { mode: 'setup', game: null, draft: {}, editing: null, newDraft: null, setup: freshSetup() };
    let history = [], rulesOpen = false, pendingRules = null, storageOk = true, toastTimer = null, undoSnap = null;

    function load() {
        try {
            const raw = JSON.parse(localStorage.getItem(KEY + '.state') || 'null');
            if (raw && typeof raw === 'object') {
                const g = C.cleanGame(raw.game);
                const names = Array.isArray(raw.setup && raw.setup.names) ? raw.setup.names.filter(n => typeof n === 'string').slice(0, C.MAX_PLAYERS).map(n => n.slice(0, C.MAX_NAME)) : [];
                const r = raw.setup && raw.setup.rules ? C.cleanGame({ ...raw.setup.rules, players: [{ id: 'x', name: 'x' }], rounds: [] }) : null;
                S.setup = { names: names.length >= 2 ? names : names.concat(['', '']).slice(0, Math.max(2, names.length)),
                    rules: r ? { presetId: r.presetId, high: r.high, end: r.end, limit: r.limit } : freshSetup().rules };
                if (raw.mode === 'game' && g) {
                    S.mode = 'game'; S.game = g;
                    S.draft = cleanDraft(raw.draft, g);
                    S.editing = Number.isInteger(raw.editing) && raw.editing >= 0 && raw.editing < g.rounds.length ? raw.editing : null;
                    S.newDraft = S.editing !== null ? cleanDraft(raw.newDraft, g) : null;
                }
            }
        } catch (e) { S = { mode: 'setup', game: null, draft: {}, editing: null, newDraft: null, setup: freshSetup() }; }
        try { history = C.cleanHistory(JSON.parse(localStorage.getItem(KEY + '.history') || '[]')); } catch (e) { history = []; }
    }
    function cleanDraft(d, g) {
        const out = {};
        if (d && typeof d === 'object') g.players.forEach(p => { if (typeof d[p.id] === 'string') out[p.id] = d[p.id].slice(0, 12); });
        return out;
    }
    function save() {
        try {
            localStorage.setItem(KEY + '.state', JSON.stringify(S));
            localStorage.setItem(KEY + '.history', JSON.stringify(history));
        } catch (e) {
            if (storageOk) { storageOk = false; $('storage-warn').hidden = false; }
        }
    }
    const snapshot = () => JSON.stringify({ S, history });
    function restore(snap) { const o = JSON.parse(snap); S = o.S; history = o.history; rulesOpen = false; save(); render(); }

    function toast(text, undoable) {
        $('toast-text').textContent = text;
        $('toast-undo').hidden = !undoable;
        $('toast').hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { $('toast').hidden = true; undoSnap = null; }, undoable ? 9000 : 5000);
    }
    function withUndo(text, fn) { const snap = snapshot(); fn(); undoSnap = snap; save(); render(); toast(text, true); }
    $('toast-undo').addEventListener('click', () => { if (undoSnap) { const s = undoSnap; undoSnap = null; restore(s); toast('Undone.'); } });

    // ---------- rules (used in setup and from "Change rules" during a game) ----------
    C.PRESETS.forEach(p => { const o = el('option', null, p.name); o.value = p.id; $('preset').appendChild(o); });
    const rulesTarget = () => S.mode === 'setup' ? S.setup.rules : pendingRules;
    const DEFAULT_LIMIT = { reach: 100, out: 101, rounds: 10 };

    function renderRules() {
        const r = rulesTarget(); if (!r) return;
        $('preset').value = r.presetId;
        $('win-high').setAttribute('aria-pressed', String(r.high));
        $('win-low').setAttribute('aria-pressed', String(!r.high));
        $('end').value = r.end;
        $('limit-box').hidden = r.end === 'none';
        $('limit-label').textContent = r.end === 'out' ? 'Out at (points)' : r.end === 'rounds' ? 'Number of rounds' : 'Score to reach';
        if (document.activeElement !== $('limit')) $('limit').value = r.end === 'none' ? '' : (r.limitText != null ? r.limitText : String(r.limit || ''));
        const L = r.limit || '?';
        $('rules-hint').textContent = r.end === 'out' ? 'A player on ' + L + ' or more is out. The last player left wins.'
            : r.end === 'reach' ? 'The game ends after the round in which someone reaches ' + L + '. The ' + (r.high ? 'highest' : 'lowest') + ' total then wins.'
            : r.end === 'rounds' ? 'After ' + L + ' rounds the ' + (r.high ? 'highest' : 'lowest') + ' total wins.'
            : 'Play as many rounds as you like, then tap End game now. The ' + (r.high ? 'highest' : 'lowest') + ' total wins.';
        $('rules-done').hidden = S.mode === 'setup';
    }
    function limitOk(r) {
        if (r.end === 'none') { $('limit-err').textContent = ''; return true; }
        const p = C.parseLimit(r.limitText != null ? r.limitText : String(r.limit || ''));
        $('limit-err').textContent = p.ok ? '' : p.error;
        $('limit').setAttribute('aria-invalid', String(!p.ok));
        if (p.ok) r.limit = p.value;
        return p.ok;
    }
    $('preset').addEventListener('change', () => {
        const r = rulesTarget(), p = C.preset($('preset').value);
        Object.assign(r, { presetId: p.id, high: p.high, end: p.end, limit: p.limit }); delete r.limitText;
        limitOk(r); renderRules(); if (S.mode === 'setup') save();
    });
    $('win-high').addEventListener('click', () => { rulesTarget().high = true; renderRules(); if (S.mode === 'setup') save(); });
    $('win-low').addEventListener('click', () => { rulesTarget().high = false; renderRules(); if (S.mode === 'setup') save(); });
    $('end').addEventListener('change', () => {
        const r = rulesTarget(); r.end = $('end').value; delete r.limitText;
        if (r.end === 'none') r.limit = 0; else if (!r.limit || r.limit < 1) r.limit = DEFAULT_LIMIT[r.end];
        limitOk(r); renderRules(); if (S.mode === 'setup') save();
    });
    $('limit').addEventListener('input', () => {
        const r = rulesTarget(); r.limitText = $('limit').value;
        if (limitOk(r)) delete r.limitText;
        renderRules(); if (S.mode === 'setup') save();
    });
    $('rules-toggle').addEventListener('click', () => {
        rulesOpen = !rulesOpen;
        pendingRules = rulesOpen ? { presetId: S.game.presetId, high: S.game.high, end: S.game.end, limit: S.game.limit } : null;
        render();
        if (rulesOpen) $('preset').focus();
    });
    $('rules-done').addEventListener('click', () => {
        const r = pendingRules;
        if (!limitOk(r)) { $('limit').focus(); return; }
        withUndo('Rules changed.', () => {
            Object.assign(S.game, { presetId: r.presetId, high: r.high, end: r.end, limit: r.end === 'none' ? 0 : r.limit, ended: false, keepFrom: 0 });
            rulesOpen = false; pendingRules = null;
        });
    });

    // ---------- setup: players ----------
    function renderSetup() {
        const ol = $('names'); ol.textContent = '';
        S.setup.names.forEach((n, i) => {
            const li = el('li', 'pbox name-row');
            const id = 'name-' + i;
            const lab = el('label', null, 'Player ' + (i + 1)); lab.htmlFor = id;
            const inp = el('input'); inp.type = 'text'; inp.id = id; inp.maxLength = C.MAX_NAME; inp.autocomplete = 'off'; inp.value = n;
            inp.placeholder = ['e.g. Ammi', 'e.g. Abbu', 'e.g. Sara', 'e.g. Ali'][i] || 'Name';
            inp.addEventListener('input', () => { S.setup.names[i] = inp.value; $('setup-err').textContent = ''; save(); });
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const next = $('name-' + (i + 1)); if (next) next.focus(); else $('add-name').click(); } });
            const rm = el('button', 'small', 'Remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove player ' + (i + 1));
            rm.disabled = S.setup.names.length <= 2;
            rm.addEventListener('click', () => { S.setup.names.splice(i, 1); save(); renderSetup(); });
            li.append(lab, inp, rm); ol.appendChild(li);
        });
        $('add-name').hidden = S.setup.names.length >= C.MAX_PLAYERS;
    }
    $('add-name').addEventListener('click', () => {
        if (S.setup.names.length >= C.MAX_PLAYERS) return;
        S.setup.names.push(''); save(); renderSetup(); $('name-' + (S.setup.names.length - 1)).focus();
    });
    function cleanNames(names) {
        const out = names.map((n, i) => n.trim().replace(/\s+/g, ' ') || 'Player ' + (i + 1));
        const seen = {};
        for (const n of out) { const k = n.toLowerCase(); if (seen[k]) return { error: 'Two players are called ' + n + '. Make the names different, for example ' + n + ' 2.' }; seen[k] = 1; }
        return { names: out };
    }
    function startGame(names, rules) {
        S.game = { presetId: rules.presetId, high: rules.high, end: rules.end, limit: rules.end === 'none' ? 0 : rules.limit,
            players: names.map(n => ({ id: uid(), name: n, start: 0, adjs: [], left: false, joinedAt: 0 })), rounds: [], ended: false, keepFrom: 0, startedAt: Date.now() };
        S.mode = 'game'; S.draft = {}; S.editing = null; S.newDraft = null; rulesOpen = false;
    }
    $('start').addEventListener('click', () => {
        const r = S.setup.rules;
        if (!limitOk(r)) { $('limit').focus(); return; }
        const used = S.setup.names.filter((n, i) => n.trim() || i < 2);
        if (used.length < 2) { $('setup-err').textContent = 'Add at least 2 players.'; return; }
        const c = cleanNames(used);
        if (c.error) { $('setup-err').textContent = c.error; return; }
        S.setup.names = c.names.slice();
        startGame(c.names, r); save(); render();
        const first = document.querySelector('#entry-list input'); if (first) first.focus({ preventScroll: true });
        window.scrollTo(0, 0);
    });

    // ---------- the game ----------
    const st = () => C.status(S.game);
    const pname = id => (S.game.players.find(p => p.id === id) || {}).name;

    function finishToHistory() {
        const g = S.game; if (!g || !g.rounds.length) return;
        history.unshift(C.historyEntry(g, C.status(g), Date.now()));
        history = history.slice(0, 100);
    }
    $('again').addEventListener('click', () => withUndo('New game started. The last one is in Past games.', () => {
        const g = S.game; finishToHistory();
        startGame(g.players.map(p => p.name), { presetId: g.presetId, high: g.high, end: g.end, limit: g.limit });
    }));
    $('new-game').addEventListener('click', () => withUndo(S.game.rounds.length ? 'Game saved in Past games.' : 'Game closed.', () => {
        const g = S.game; finishToHistory();
        S.setup = { names: g.players.map(p => p.name), rules: { presetId: g.presetId, high: g.high, end: g.end, limit: g.limit } };
        S.mode = 'setup'; S.game = null; S.draft = {}; S.editing = null; S.newDraft = null; rulesOpen = false;
        window.scrollTo(0, 0);
    }));
    $('end-now').addEventListener('click', () => {
        if (!S.game.rounds.length) { $('entry-err').textContent = 'Save at least one round first.'; return; }
        withUndo('Game ended.', () => { S.game.ended = true; cancelEdit(); });
    });
    $('keep-playing').addEventListener('click', () => withUndo('Game open again. Type the next round.', () => {
        const g = S.game; g.ended = false; g.keepFrom = g.rounds.length;
    }));

    function entryPlayers() { return C.playersFor(S.game, S.editing === null ? S.game.rounds.length : S.editing); }
    function oldScore(id) { return S.editing === null ? 0 : (S.game.rounds[S.editing].scores[id] || 0); }

    function renderEntry(status) {
        const g = S.game, ol = $('entry-list'); ol.textContent = '';
        ol.classList.toggle('has-chips', !!C.preset(g.presetId).chips);
        const n = S.editing === null ? g.rounds.length + 1 : S.editing + 1;
        $('entry-title').textContent = S.editing === null ? 'Round ' + n + ' scores' : 'Editing round ' + n;
        $('save-round').textContent = S.editing === null ? 'Save round ' + n : 'Save changes to round ' + n;
        $('cancel-edit').hidden = S.editing === null;
        $('add-late').hidden = S.editing !== null || g.players.length >= C.MAX_PLAYERS;
        $('end-now').hidden = S.editing !== null;
        const players = entryPlayers(), chips = C.preset(g.presetId).chips || null;
        players.forEach((p, i) => {
            const row = status.rows.find(r => r.id === p.id);
            const li = el('li', 'pbox');
            const head = el('div', 'phead');
            const id = 'score-' + p.id;
            const lab = el('label', 'pname', p.name); lab.htmlFor = id;
            const prev = el('span', 'preview'); prev.id = 'prev-' + p.id;
            head.append(lab, prev);
            const line = el('div', 'pin');
            const sign = el('button', 'sign', '−/+'); sign.type = 'button'; sign.setAttribute('aria-label', 'Make ' + p.name + "'s score negative or positive");
            const inp = el('input'); inp.type = 'text'; inp.id = id; inp.inputMode = 'numeric'; inp.autocomplete = 'off'; inp.maxLength = 12; inp.placeholder = '0';
            inp.value = S.draft[p.id] != null ? S.draft[p.id] : '';
            inp.dataset.pid = p.id;
            const onInput = () => { S.draft[p.id] = inp.value; $('entry-err').textContent = ''; updatePreview(p.id, row.total); save(); };
            inp.addEventListener('input', onInput);
            inp.addEventListener('keydown', e => {
                if (e.key !== 'Enter') return; e.preventDefault();
                const all = [...document.querySelectorAll('#entry-list input[data-pid]')], k = all.indexOf(inp);
                if (k < all.length - 1) all[k + 1].focus(); else $('save-round').click();
            });
            sign.addEventListener('click', () => {
                const v = inp.value.trim();
                inp.value = v.startsWith('-') || v.startsWith('−') ? v.replace(/^[-−]/, '') : '-' + v;
                onInput(); inp.focus();
            });
            line.append(sign, inp);
            const err = el('p', 'field-err'); err.id = 'err-' + p.id; err.setAttribute('role', 'alert');
            li.append(head, line, err);
            if (chips) {
                const cw = el('div', 'chips');
                chips.forEach(([v, t]) => {
                    const b = el('button', 'chip'); b.type = 'button';
                    b.append(el('span', null, t), el('b', null, String(v)));
                    b.setAttribute('aria-label', t + ': ' + v + ' points for ' + p.name);
                    b.addEventListener('click', () => { inp.value = String(v); onInput(); });
                    cw.appendChild(b);
                });
                li.appendChild(cw);
            }
            if (S.editing === null) li.appendChild(playerOptions(p));
            ol.appendChild(li);
            updatePreview(p.id, row.total);
        });
        // players without a box this round: out, or left the table
        if (S.editing === null) g.players.filter(p => !players.includes(p)).forEach(p => {
            const row = status.rows.find(r => r.id === p.id);
            const li = el('li', 'pbox inactive');
            const head = el('div', 'phead');
            head.append(el('span', 'pname', p.name), el('span', 'preview', p.left ? 'Left the table' : 'Out with ' + row.total));
            li.appendChild(head);
            const acts = el('div', 'acts1');
            if (p.left) {
                const b = el('button', 'ghost', 'Back at the table'); b.type = 'button';
                b.addEventListener('click', () => withUndo(p.name + ' is back at the table.', () => { p.left = false; }));
                acts.appendChild(b);
            } else if (row.out) {
                const t = C.rejoinTotal(g, status);
                if (t !== null) {
                    const b = el('button', 'ghost', 'Rejoin at ' + t); b.type = 'button';
                    b.setAttribute('aria-label', p.name + ' rejoins with ' + t + ' points');
                    b.addEventListener('click', () => withUndo(p.name + ' rejoined at ' + t + '.', () => { p.adjs.push({ at: g.rounds.length, amount: t - row.total }); }));
                    acts.appendChild(b);
                }
            }
            li.appendChild(acts);
            if (p.left) li.appendChild(playerOptions(p));
            ol.appendChild(li);
        });
        $('entry-hint').textContent = S.editing === null ? "Type each player's points for this round. An empty box counts as 0." : 'Change the numbers and tap Save changes. An empty box counts as 0.';
    }

    function updatePreview(id, total) {
        const span = $('prev-' + id); if (!span) return;
        const p = C.parseScore(S.draft[id]);
        const err = $('err-' + id), inp = $('score-' + id);
        if (!p.ok) { span.textContent = 'Total ' + total; err.textContent = p.error; inp.setAttribute('aria-invalid', 'true'); return; }
        err.textContent = ''; inp.removeAttribute('aria-invalid');
        const next = total - oldScore(id) + (p.value || 0);
        span.textContent = next === total ? 'Total ' + total : 'Total ' + total + ' → ' + next;
    }

    // "Edit player": rename, left the table, remove
    function playerOptions(p) {
        const wrap = el('div', 'popts');
        const tog = el('button', 'link', 'Edit player'); tog.type = 'button'; tog.setAttribute('aria-expanded', 'false');
        tog.setAttribute('aria-label', 'Edit player ' + p.name);
        const panel = el('div', 'popts-panel'); panel.hidden = true;
        const id = 'rename-' + p.id;
        const lab = el('label', null, 'Name'); lab.htmlFor = id;
        const inp = el('input'); inp.type = 'text'; inp.id = id; inp.maxLength = C.MAX_NAME; inp.value = p.name; inp.autocomplete = 'off';
        const err = el('p', 'field-err'); err.setAttribute('role', 'alert');
        const ok = el('button', 'primary alt', 'Save name'); ok.type = 'button';
        ok.addEventListener('click', () => {
            const n = inp.value.trim().replace(/\s+/g, ' ');
            if (!n) { err.textContent = 'Type a name.'; return; }
            if (S.game.players.some(q => q !== p && q.name.toLowerCase() === n.toLowerCase())) { err.textContent = 'Another player is already called ' + n + '.'; return; }
            p.name = n; save(); render(); toast('Name saved.');
        });
        const acts = el('div', 'two');
        const left = el('button', 'ghost', p.left ? 'Back at the table' : 'Left the table'); left.type = 'button';
        left.addEventListener('click', () => withUndo(p.left ? p.name + ' is back at the table.' : p.name + ' left the table and is not counted for the win.', () => { p.left = !p.left; delete S.draft[p.id]; }));
        const rm = el('button', 'ghost danger', 'Remove from game'); rm.type = 'button';
        rm.addEventListener('click', () => {
            if (S.game.players.length <= 2) { err.textContent = 'A game needs at least 2 players. Add someone first.'; return; }
            withUndo(p.name + ' removed with all their scores.', () => {
                S.game.players = S.game.players.filter(q => q !== p);
                S.game.rounds.forEach(r => { delete r.scores[p.id]; });
                delete S.draft[p.id];
            });
        });
        acts.append(left, rm);
        panel.append(lab, inp, ok, acts, err);
        tog.addEventListener('click', () => { panel.hidden = !panel.hidden; tog.setAttribute('aria-expanded', String(!panel.hidden)); tog.textContent = panel.hidden ? 'Edit player' : 'Close'; if (!panel.hidden) inp.focus(); });
        wrap.append(tog, panel);
        return wrap;
    }

    $('save-round').addEventListener('click', () => {
        const players = entryPlayers(), scores = {};
        let bad = null, typed = 0;
        players.forEach(p => {
            const r = C.parseScore(S.draft[p.id]);
            if (!r.ok) { bad = bad || p; return; }
            if (r.value !== null) typed++;
            scores[p.id] = r.value || 0;
        });
        if (bad) { $('entry-err').textContent = 'Fix the score for ' + bad.name + ' first.'; $('score-' + bad.id).focus(); return; }
        if (!players.length) { $('entry-err').textContent = 'No one is playing. Bring a player back first.'; return; }
        if (!typed) { $('entry-err').textContent = 'Type at least one score. Type 0 if everyone scored nothing.'; $('score-' + players[0].id).focus(); return; }
        if (S.editing === null) {
            const n = S.game.rounds.length + 1;
            withUndo('Round ' + n + ' saved.', () => { S.game.rounds.push({ scores }); S.draft = {}; });
        } else {
            const n = S.editing + 1;
            withUndo('Round ' + n + ' changed.', () => { S.game.rounds[S.editing] = { scores }; S.draft = S.newDraft || {}; S.editing = null; S.newDraft = null; });
        }
        const first = document.querySelector('#entry-list input[data-pid]');
        if (first && !$('entry').hidden) first.focus({ preventScroll: true });
    });
    function cancelEdit() { if (S.editing !== null) { S.draft = S.newDraft || {}; S.editing = null; S.newDraft = null; } }
    $('cancel-edit').addEventListener('click', () => { cancelEdit(); save(); render(); });

    function startEdit(i) {
        if (S.editing === null) S.newDraft = S.draft;
        S.editing = i; S.draft = {};
        Object.keys(S.game.rounds[i].scores).forEach(id => { S.draft[id] = String(S.game.rounds[i].scores[id]); });
        save(); render();
        $('entry').scrollIntoView({ block: 'start' });
        const first = document.querySelector('#entry-list input[data-pid]'); if (first) first.focus({ preventScroll: true });
    }

    // ---------- late player ----------
    function lateOptions() {
        const g = S.game, status = st(), sel = $('late-start'); sel.textContent = '';
        const playing = status.rows.filter(r => !r.left && !r.out);
        const hi = playing.length ? Math.max.apply(null, playing.map(r => r.total)) : 0;
        const lo = playing.length ? Math.min.apply(null, playing.map(r => r.total)) : 0;
        [['0', 'Starts at 0'], ['high', 'Highest score now (' + hi + ')'], ['low', 'Lowest score now (' + lo + ')'], ['custom', 'A score I type']]
            .forEach(([v, t]) => { const o = el('option', null, t); o.value = v; o.dataset.n = v === 'high' ? hi : v === 'low' ? lo : 0; sel.appendChild(o); });
        sel.value = g.end === 'out' && !g.high ? 'high' : '0';
        $('late-custom-box').hidden = true;
    }
    $('add-late').addEventListener('click', () => {
        lateOptions(); $('late-name').value = ''; $('late-custom').value = ''; $('late-err').textContent = '';
        $('late-box').hidden = false; $('late-name').focus();
    });
    $('late-start').addEventListener('change', () => { $('late-custom-box').hidden = $('late-start').value !== 'custom'; if ($('late-start').value === 'custom') $('late-custom').focus(); });
    $('late-cancel').addEventListener('click', () => { $('late-box').hidden = true; });
    $('late-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('late-add').click(); } });
    $('late-add').addEventListener('click', () => {
        const g = S.game, err = $('late-err');
        const name = $('late-name').value.trim().replace(/\s+/g, ' ');
        if (!name) { err.textContent = "Type the new player's name."; $('late-name').focus(); return; }
        if (g.players.some(p => p.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'Someone is already called ' + name + '.'; return; }
        if (g.players.length >= C.MAX_PLAYERS) { err.textContent = 'A game can have up to 12 players.'; return; }
        let start;
        if ($('late-start').value === 'custom') {
            const r = C.parseScore($('late-custom').value);
            if (!r.ok || r.value === null) { err.textContent = r.ok ? 'Type the starting score.' : r.error; $('late-custom').focus(); return; }
            start = r.value;
        } else start = Number($('late-start').selectedOptions[0].dataset.n);
        if (g.end === 'out' && start >= g.limit) { err.textContent = 'That is already out (' + g.limit + ' or more). Choose a lower score.'; return; }
        withUndo(name + ' joined with ' + start + '.', () => {
            g.players.push({ id: uid(), name, start, adjs: [], left: false, joinedAt: g.rounds.length });
            $('late-box').hidden = true;
        });
    });

    // ---------- standings, rounds table, history ----------
    function renderStandings(status) {
        const g = S.game, h = C.headline(g, status);
        $('round-label').textContent = C.rulesText(g).split(' · ')[0];
        $('headline').textContent = h.big;
        $('subline').textContent = h.small;
        $('standings').classList.toggle('over', status.over);
        const ol = $('table'); ol.textContent = '';
        status.ranked.forEach(r => {
            const li = el('li', 'srow' + (r.winner ? ' win' : '') + (r.out || r.left ? ' gone' : ''));
            li.appendChild(el('span', 'rank', r.rank ? String(r.rank) : '–'));
            const mid = el('span', 'who');
            mid.appendChild(el('span', 'nm', r.name));
            const n = C.note(g, r, status.over); if (n) mid.appendChild(el('small', null, n));
            li.append(mid, el('span', 'tot', String(r.total)));
            ol.appendChild(li);
        });
        const tie = status.over && status.winners.length > 1;
        $('over-box').hidden = !status.over || status.reason === 'out' && !tie;
        $('keep-playing').textContent = tie ? 'Play a tie-break round' : 'Keep playing';
        $('again').hidden = !status.over;
        $('new-game').textContent = status.over ? 'New game (change players or rules)' : 'Stop and start a new game';
        const text = C.summaryText(g, status, new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }));
        $('mail').href = 'mailto:?subject=' + encodeURIComponent(C.title(g) + ' scores') + '&body=' + encodeURIComponent(text);
        $('copy').dataset.text = text;
        $('copy').hidden = $('mail').hidden = !g.rounds.length;
    }
    $('copy').addEventListener('click', () => {
        const text = $('copy').dataset.text || '';
        const done = () => toast('Scores copied. Paste them in your chat.');
        const fallback = () => { const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
            try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy. Use Email scores instead.'); } t.remove(); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    });

    function renderRounds() {
        const g = S.game, t = $('rounds'); t.textContent = '';
        $('rounds-empty').hidden = g.rounds.length > 0;
        $('rounds-scroll').hidden = !g.rounds.length;
        if (!g.rounds.length) return;
        const thead = el('thead'), hr = el('tr');
        hr.appendChild(el('th', null, 'Round'));
        g.players.forEach(p => { const th = el('th', null, p.name); th.scope = 'col'; hr.appendChild(th); });
        hr.appendChild(el('th', 'acts-h', '')); thead.appendChild(hr); t.appendChild(thead);
        const tb = el('tbody');
        g.rounds.forEach((r, i) => {
            const tr = el('tr', S.editing === i ? 'editing' : '');
            const th = el('th', null, String(i + 1)); th.scope = 'row'; tr.appendChild(th);
            g.players.forEach(p => tr.appendChild(el('td', p.id in r.scores ? '' : 'none', p.id in r.scores ? String(r.scores[p.id]) : '–')));
            const td = el('td', 'acts');
            const e = el('button', 'small', 'Edit'); e.type = 'button'; e.setAttribute('aria-label', 'Edit round ' + (i + 1));
            e.addEventListener('click', () => startEdit(i));
            const d = el('button', 'small', 'Delete'); d.type = 'button'; d.setAttribute('aria-label', 'Delete round ' + (i + 1));
            d.addEventListener('click', () => withUndo('Round ' + (i + 1) + ' deleted.', () => {
                g.rounds.splice(i, 1);
                if (S.editing !== null) cancelEdit();
                g.players.forEach(p => { p.adjs = p.adjs.filter(a => a.at <= i).concat(p.adjs.filter(a => a.at > i).map(a => ({ at: a.at - 1, amount: a.amount }))); if (p.joinedAt > i) p.joinedAt--; });
                if (g.keepFrom > g.rounds.length) g.keepFrom = g.rounds.length;
            }));
            td.append(e, d); tr.appendChild(td); tb.appendChild(tr);
        });
        t.appendChild(tb);
        const tf = el('tfoot'), fr = el('tr'), status = st();
        const fth = el('th', null, 'Total'); fth.scope = 'row'; fr.appendChild(fth);
        g.players.forEach(p => fr.appendChild(el('td', null, String(status.rows.find(r => r.id === p.id).total))));
        fr.appendChild(el('td')); tf.appendChild(fr); t.appendChild(tf);
    }

    function renderHistory() {
        $('history-card').hidden = !history.length;
        if (!history.length) return;
        const tally = C.winTally(history);
        $('tally').textContent = tally.length ? 'Wins so far: ' + tally.slice(0, 8).map(t => t.name + ' ' + t.wins).join(', ') + '.' : 'No finished games yet.';
        const ol = $('history'); ol.textContent = '';
        history.slice(0, 30).forEach(h => {
            const li = el('li', 'pbox');
            const d = new Date(h.at);
            li.appendChild(el('p', 'h-title', h.title));
            li.appendChild(el('p', 'h-meta', d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + h.rounds + (h.rounds === 1 ? ' round' : ' rounds')));
            li.appendChild(el('p', 'h-win', h.finished ? (h.winners.length > 1 ? 'Tie: ' : 'Winner: ') + h.winners.join(' and ') : 'Not finished'));
            li.appendChild(el('p', 'h-scores', h.players.map(p => p.name + ' ' + p.total).join(' · ')));
            ol.appendChild(li);
        });
    }
    $('clear-history').addEventListener('click', () => withUndo('Past games cleared.', () => { history = []; }));

    // ---------- render ----------
    function render() {
        const game = S.mode === 'game' && S.game;
        document.body.classList.toggle('in-game', !!game);
        $('setup').hidden = !!game;
        ['rules-card', 'standings', 'rounds-card'].forEach(id => { $(id).hidden = !game; });
        // the rules controls live in the setup card, or in the rules card during a game
        if (game && rulesOpen) { if ($('rules').parentNode !== $('rules-slot')) $('rules-slot').appendChild($('rules')); }
        else if ($('rules').parentNode !== $('setup')) $('setup').insertBefore($('rules'), $('setup-players'));
        $('rules').hidden = !!game && !rulesOpen;
        if (!game) { renderRules(); limitOk(S.setup.rules); renderSetup(); $('entry').hidden = true; renderHistory(); return; }
        $('rules-line').textContent = C.rulesText(S.game);
        $('rules-toggle').textContent = rulesOpen ? 'Cancel' : 'Change rules';
        if (rulesOpen) renderRules();
        const status = st();
        if (status.over && S.editing === null) $('entry').hidden = true;
        else { $('entry').hidden = false; renderEntry(status); }
        $('late-box').hidden = $('late-box').hidden || S.editing !== null;
        renderStandings(status);
        renderRounds();
        renderHistory();
    }

    load(); render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
