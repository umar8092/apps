// Interval Workout Timer for HIIT and Circuits: the page. The workout rules live in core.js.
(function () {
    'use strict';
    const T = window.IntervalTimer;
    const SLUG = 'interval-workout-timer-for-hiit-and-circuits', KEY = SLUG + '.data';
    const $ = id => document.getElementById(id);
    const now = () => Date.now();
    const BASE_TITLE = document.title;
    const timeFmt = t => { try { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return new Date(t).toTimeString().slice(0, 5); } };
    const dateFmt = t => { try { return new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return new Date(t).toDateString(); } };
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

    // ---------- saving ----------
    let canSave = true;
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); localStorage.setItem(SLUG + '.test', '1'); localStorage.removeItem(SLUG + '.test'); } catch (e) { canSave = false; }
        return raw ? T.sanitize(raw, now()) : T.fresh();
    }
    function save() {
        if (!canSave) return;
        try { localStorage.setItem(KEY, JSON.stringify(state, (k, v) => k === 'damaged' ? undefined : v)); } catch (e) { canSave = false; $('storage-warn').hidden = false; }
    }
    let state = load();
    if (!canSave) $('storage-warn').hidden = false;
    if (state.damaged) { $('damaged-warn').hidden = false; delete state.damaged; }
    const newId = () => (state.nextId++).toString(36);

    // ---------- messages with Undo ----------
    const msgTimers = {};
    function say(id, text, undo, undoText) {
        const el = $(id); el.textContent = '';
        const span = document.createElement('span'); span.textContent = text; el.appendChild(span);
        if (undo) {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'link'; b.textContent = undoText || 'Undo';
            b.addEventListener('click', () => { undo(); el.textContent = ''; });
            el.appendChild(b);
        }
        clearTimeout(msgTimers[id]);
        msgTimers[id] = setTimeout(() => { el.textContent = ''; }, undo ? 12000 : 6000);
    }
    const q = s => '“' + s + '”';

    // ---------- sound ----------
    // Beeps are planned on the audio clock at the moment each step starts, so they stay on time even when the browser slows the page.
    let audio = null, master = null, planned = [], plannedUntil = 0;
    const buffers = {};
    function tone(parts) {
        const rate = audio.sampleRate, len = parts.reduce((a, p) => Math.max(a, p.at + p.len), 0) + 0.02;
        const buf = audio.createBuffer(1, Math.ceil(rate * len), rate), d = buf.getChannelData(0);
        for (const p of parts) for (let i = Math.floor(p.at * rate); i < Math.min(d.length, (p.at + p.len) * rate); i++) {
            const t = i / rate - p.at, env = Math.min(1, t * 250, (p.len - t) * 250);
            d[i] += env * p.vol * (0.7 * Math.sin(2 * Math.PI * p.f * t) + 0.3 * Math.sin(2 * Math.PI * p.f * 2 * t));
        }
        return buf;
    }
    function ensureAudio() {
        try {
            if (!audio) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                audio = new AC();
                master = audio.createGain(); master.gain.value = 0.9; master.connect(audio.destination);
                buffers.work = tone([{ at: 0, len: 0.14, f: 1320, vol: 0.9 }, { at: 0.2, len: 0.32, f: 1320, vol: 0.9 }]);
                buffers.rest = tone([{ at: 0, len: 0.5, f: 660, vol: 0.9 }]);
                buffers.tick = tone([{ at: 0, len: 0.11, f: 880, vol: 0.7 }]);
                buffers.done = tone([{ at: 0, len: 0.2, f: 880, vol: 0.9 }, { at: 0.26, len: 0.2, f: 1100, vol: 0.9 }, { at: 0.52, len: 0.55, f: 1320, vol: 0.9 }]);
                audio.onstatechange = () => { planSounds(); soundWarn(); };
            }
            if (audio.state !== 'running') audio.resume().then(() => { planSounds(); soundWarn(); }).catch(() => {});
            // iPhones only unlock sound for a page that plays something during a tap
            const s = audio.createBufferSource(); s.buffer = audio.createBuffer(1, 1, 22050); s.connect(master); s.start(0);
        } catch (e) { audio = null; }
    }
    function play(kind, when) {
        const src = audio.createBufferSource();
        src.buffer = buffers[kind]; src.connect(master); src.start(Math.max(audio.currentTime, when));
        return src;
    }
    function stopSounds() { planned.forEach(n => { try { n.stop(0); n.disconnect(); } catch (e) { /* already played */ } }); planned = []; plannedUntil = 0; }
    const AHEAD = 10 * 60 * 1000;   // plan 10 minutes of beeps at a time
    function planSounds() {
        stopSounds();
        const run = state.run;
        if (!run || run.pausedAt != null || !audio || audio.state !== 'running') return;
        const s = state.settings, el = T.elapsedMs(run, now()), ac = audio.currentTime;
        plannedUntil = el + AHEAD;
        for (const c of T.cues(run, el - 60, s.countdown)) {
            if (c.at > plannedUntil) break;
            if (c.kind !== 'done' && c.kind !== 'tick' && !s.beeps) continue;
            planned.push(play(c.kind, ac + (c.at - el) / 1000));
        }
    }
    function soundWarn() {
        const s = state.settings, needed = (s.beeps || s.countdown) && state.run && state.run.pausedAt == null;
        $('sound-warn').hidden = !(needed && (!audio || audio.state !== 'running'));
    }
    document.addEventListener('pointerdown', ensureAudio, true);
    document.addEventListener('keydown', ensureAudio, true);
    $('sound-on').addEventListener('click', () => { ensureAudio(); setTimeout(soundWarn, 300); });
    function speak(text) {
        if (!state.settings.voice || !('speechSynthesis' in window) || document.hidden) return;
        try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; speechSynthesis.speak(u); } catch (e) { /* not supported */ }
    }

    // ---------- screen and vibration ----------
    let wake = null;
    async function keepAwake() {
        const on = state.settings.awake && state.run && state.run.pausedAt == null;
        try {
            if (on && !wake && 'wakeLock' in navigator && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
            else if (!on && wake) { await wake.release(); wake = null; }
        } catch (e) { wake = null; }
    }
    // phones only allow vibration after the page has been tapped
    const tapped = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
    function vibrate(kind) { try { if (state.settings.vibrate && navigator.vibrate && tapped()) navigator.vibrate(kind === 'work' ? [250, 100, 250] : kind === 'done' ? [400, 150, 400, 150, 400] : [400]); } catch (e) { /* not all phones */ } }

    // ---------- the form ----------
    const DUR = ['work', 'rest', 'setRest', 'warm', 'cool'], CNT = ['rounds', 'sets'], FIELDS = DUR.concat(CNT);
    let rows = [];          // the move rows as typed: [{ name, secs }]
    let lastValid = state.current;
    function fillForm(w) {
        $('f-name').value = w.name;
        DUR.forEach(k => { $('f-' + k).value = T.fmt(w[k]); });
        CNT.forEach(k => { $('f-' + k).value = String(w[k]); });
        rows = w.moves.map(m => ({ name: m.name, secs: m.secs ? T.fmt(m.secs) : '' }));
        if (rows.length) showMoves(true); else showMoves(false);
        renderMoves();
    }
    function formTexts() {
        const f = { name: $('f-name').value, moves: rows };
        FIELDS.forEach(k => { f[k] = $('f-' + k).value; });
        return f;
    }
    let formErrors = {};
    function readAndShow() {
        const r = T.readForm(formTexts());
        formErrors = r.errors || {};
        FIELDS.forEach(k => { $('e-' + k).textContent = formErrors[k] || ''; $('f-' + k).setAttribute('aria-invalid', formErrors[k] ? 'true' : 'false'); });
        document.querySelectorAll('.move').forEach((li, i) => {
            const e = li.querySelector('.err'), inp = li.querySelector('.m-secs');
            e.textContent = formErrors['move' + i] || ''; inp.setAttribute('aria-invalid', formErrors['move' + i] ? 'true' : 'false');
        });
        $('setrest-field').hidden = !(r.w ? r.w.sets > 1 : Number($('f-sets').value) > 1);
        if (r.w) { lastValid = r.w; state.current = r.w; save(); }
        renderPlan();
        return r;
    }

    // − and + next to each box
    function stepSize(v, down) { const x = down ? v - 1 : v; return x < 60 ? 5 : x < 300 ? 15 : x < 1200 ? 30 : 60; }
    document.querySelectorAll('.stp').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.for, k = id.slice(2), inp = $(id), down = b.dataset.d === '-1';
        if (CNT.includes(k)) {
            const r = T.parseCount(inp.value, k, k === 'rounds' ? T.MAX_ROUNDS : T.MAX_SETS), v = r.n || (down ? 2 : 0);
            inp.value = String(Math.min(k === 'rounds' ? T.MAX_ROUNDS : T.MAX_SETS, Math.max(1, v + (down ? -1 : 1))));
        } else {
            const r = T.parseDur(inp.value), v = r.error ? (lastValid[k] || 0) : r.secs, st = stepSize(v, down);
            let nv = down ? Math.ceil(v / st) * st - st : Math.floor(v / st) * st + st;
            nv = Math.max(k === 'work' ? 5 : 0, Math.min(T.MAX_BLOCK, nv));
            if (k === 'work' && down && v <= 5) nv = Math.max(1, v - 1);
            inp.value = T.fmt(nv);
        }
        readAndShow();
    }));
    $('form').addEventListener('input', e => { if (e.target.closest('.paste')) return; if (e.target.closest('.move')) syncRows(); readAndShow(); });
    // tidy a valid length when leaving the box: 90 -> 1:30
    $('form').addEventListener('change', e => {
        const t = e.target;
        if (t.matches('.m-secs')) { const r = T.parseDur(t.value, { min: 1 }); if (t.value.trim() && !r.error) t.value = T.fmt(r.secs); syncRows(); }
        else if (t.id && DUR.includes(t.id.slice(2)) && t.value.trim()) { const r = T.parseDur(t.value); if (!r.error) t.value = T.fmt(r.secs); }
        else if (t.id === 'f-name') t.value = T.cleanName(t.value, T.TITLE_MAX);
        readAndShow();
    });
    $('form').addEventListener('submit', e => { e.preventDefault(); });

    // ---------- moves ----------
    function showMoves(on) {
        $('moves-box').hidden = !on; $('show-moves').hidden = on; $('show-moves').setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    function syncRows() {
        rows = [...document.querySelectorAll('.move')].map(li => ({ name: li.querySelector('.m-name').value, secs: li.querySelector('.m-secs').value }));
    }
    function renderMoves(focusIndex) {
        const ol = $('moves'); ol.textContent = '';
        rows.forEach((m, i) => {
            const li = document.createElement('li'); li.className = 'move';
            const top = document.createElement('div'); top.className = 'm-top';
            const num = document.createElement('span'); num.className = 'm-num'; num.textContent = 'Move ' + (i + 1);
            const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'm-rm'; rm.textContent = '×'; rm.setAttribute('aria-label', 'Remove move ' + (i + 1) + (m.name ? ', ' + m.name : ''));
            rm.addEventListener('click', () => removeMove(i));
            top.append(num, rm);
            const row = document.createElement('div'); row.className = 'm-row';
            const n = document.createElement('input'); n.type = 'text'; n.className = 'm-name'; n.maxLength = T.NAME_MAX; n.autocomplete = 'off'; n.value = m.name; n.placeholder = 'e.g. Squats';
            n.id = 'm-name-' + i; n.setAttribute('aria-label', 'Move ' + (i + 1) + ' name');
            const s = document.createElement('input'); s.type = 'text'; s.className = 'm-secs'; s.maxLength = 8; s.autocomplete = 'off'; s.value = m.secs;
            s.placeholder = T.fmt(lastValid.work); s.setAttribute('aria-label', 'Move ' + (i + 1) + ' own time (optional, empty uses the Work time)');
            const nw = document.createElement('div'); nw.className = 'm-field'; const nl = document.createElement('span'); nl.className = 'm-lbl'; nl.textContent = 'Name'; nw.append(nl, n);
            const sw = document.createElement('div'); sw.className = 'm-field m-time'; const sl = document.createElement('span'); sl.className = 'm-lbl'; sl.textContent = 'Own time'; sw.append(sl, s);
            row.append(nw, sw);
            const err = document.createElement('p'); err.className = 'err';
            li.append(top, row, err);
            ol.appendChild(li);
            n.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (i === rows.length - 1) addMove(); else { const nx = $('m-name-' + (i + 1)); if (nx) nx.focus(); } } });
            s.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
        });
        $('clear-moves').hidden = !rows.length;
        movesNote();
        if (focusIndex != null) { const f = $('m-name-' + focusIndex); if (f) f.focus(); }
    }
    function movesNote() {
        const named = rows.filter(r => T.cleanName(r.name)).length, rounds = lastValid.rounds, el = $('moves-note');
        el.textContent = '';
        if (named > rounds) {
            const span = document.createElement('span'); span.textContent = 'You have ' + named + ' moves but ' + plural(rounds, 'round') + ', so only the first ' + rounds + ' are done. ';
            const b = document.createElement('button'); b.type = 'button'; b.className = 'link'; b.textContent = 'Make it ' + named + ' rounds';
            b.addEventListener('click', () => { $('f-rounds').value = String(Math.min(T.MAX_ROUNDS, named)); readAndShow(); movesNote(); });
            el.append(span, b);
        }
        el.hidden = !el.childNodes.length;
    }
    function addMove() {
        if (rows.length >= T.MAX_MOVES) return say('edit-msg', 'The most moves is ' + T.MAX_MOVES + '.');
        syncRows(); rows.push({ name: '', secs: '' }); renderMoves(rows.length - 1);
    }
    function removeMove(i) {
        syncRows();
        const before = rows.slice(), gone = rows[i];
        rows.splice(i, 1); renderMoves(); readAndShow();
        if (T.cleanName(gone.name) || gone.secs) say('edit-msg', 'Removed ' + (T.cleanName(gone.name) ? q(T.cleanName(gone.name)) : 'move ' + (i + 1)) + '.', () => { rows = before; renderMoves(); readAndShow(); });
    }
    $('show-moves').addEventListener('click', () => { showMoves(true); if (!rows.length) addMove(); else renderMoves(0); });
    $('add-move').addEventListener('click', addMove);
    $('clear-moves').addEventListener('click', () => {
        syncRows(); const before = rows.slice();
        rows = []; renderMoves(); showMoves(false); readAndShow();
        say('edit-msg', 'Removed all moves.', () => { rows = before; showMoves(true); renderMoves(); readAndShow(); });
    });
    function openPaste(on) { $('paste').hidden = !on; $('paste-open').setAttribute('aria-expanded', on ? 'true' : 'false'); $('e-paste').textContent = ''; if (on) $('paste-text').focus(); }
    $('paste-open').addEventListener('click', () => openPaste($('paste').hidden));
    $('paste-cancel').addEventListener('click', () => { openPaste(false); $('paste-open').focus(); });
    $('paste-add').addEventListener('click', () => {
        const list = T.parseMoveList($('paste-text').value);
        if (!list.length) { $('e-paste').textContent = 'Type or paste at least one move, one per line.'; return; }
        syncRows();
        const before = rows.slice();
        rows = rows.filter(r => T.cleanName(r.name) || String(r.secs).trim());
        const room = T.MAX_MOVES - rows.length, add = list.slice(0, Math.max(0, room));
        rows = rows.concat(add.map(m => ({ name: m.name, secs: m.secs ? T.fmt(m.secs) : '' })));
        $('paste-text').value = ''; openPaste(false); renderMoves(); readAndShow();
        say('edit-msg', 'Added ' + plural(add.length, 'move') + (add.length < list.length ? ' (the most is ' + T.MAX_MOVES + ')' : '') + '.', () => { rows = before; renderMoves(); readAndShow(); });
    });

    // ---------- 1. pick a workout ----------
    function loadWorkout(w, label) {
        const before = JSON.parse(JSON.stringify(lastValid));
        fillForm(T.sanitizeWorkout(w)); readAndShow();
        say('pick-msg', 'Loaded ' + q(label) + '.', () => { fillForm(before); readAndShow(); });
    }
    T.PRESETS.forEach(p => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'preset'; b.dataset.id = p.id;
        const t = document.createElement('b'); t.textContent = p.label;
        const n = document.createElement('span'); n.textContent = p.note + ' · ' + T.fmt(T.totalOf(T.buildBlocks(p.w)));
        b.append(t, n);
        b.addEventListener('click', () => loadWorkout(p.w, p.label));
        $('presets').appendChild(b);
    });
    function renderSaved() {
        const ul = $('saved'); ul.textContent = '';
        $('saved-empty').hidden = state.saved.length > 0;
        state.saved.forEach(s => {
            const li = document.createElement('li'); li.className = 'sbox';
            const info = document.createElement('div'); info.className = 's-info';
            const nm = document.createElement('b'); nm.textContent = s.w.name;
            const tot = document.createElement('span'); tot.className = 's-tot'; tot.textContent = T.fmt(T.totalOf(T.buildBlocks(s.w)));
            const top = document.createElement('div'); top.className = 's-top'; top.append(nm, tot);
            const d = document.createElement('p'); d.className = 's-desc'; d.textContent = T.describe(s.w);
            info.append(top, d);
            const btns = document.createElement('div'); btns.className = 's-btns';
            const ld = document.createElement('button'); ld.type = 'button'; ld.className = 'secondary small'; ld.textContent = 'Load'; ld.setAttribute('aria-label', 'Load ' + s.w.name);
            ld.addEventListener('click', () => loadWorkout(s.w, s.w.name));
            const del = document.createElement('button'); del.type = 'button'; del.className = 'link rm'; del.textContent = 'Delete'; del.setAttribute('aria-label', 'Delete ' + s.w.name);
            del.addEventListener('click', () => {
                const i = state.saved.indexOf(s); if (i < 0) return;
                state.saved.splice(i, 1); save(); renderSaved();
                say('pick-msg', 'Deleted ' + q(s.w.name) + '.', () => { state.saved.splice(Math.min(i, state.saved.length), 0, s); save(); renderSaved(); });
            });
            btns.append(ld, del);
            li.append(info, btns);
            ul.appendChild(li);
        });
    }
    $('save').addEventListener('click', () => {
        const r = readAndShow();
        if (!r.w) return say('plan-msg', 'Fix the boxes marked in red first.');
        const w = JSON.parse(JSON.stringify(r.w));
        if (!w.name) {
            let n = 1; while (state.saved.some(s => s.w.name.toLowerCase() === ('My workout ' + n).toLowerCase())) n++;
            w.name = 'My workout ' + n; $('f-name').value = w.name; readAndShow();
        }
        const i = state.saved.findIndex(s => s.w.name.toLowerCase() === w.name.toLowerCase());
        if (i >= 0) {
            const old = state.saved[i];
            state.saved[i] = { id: old.id, w }; save(); renderSaved();
            say('plan-msg', 'Updated ' + q(w.name) + ' in My workouts.', () => { state.saved[i] = old; save(); renderSaved(); });
        } else {
            if (state.saved.length >= T.MAX_SAVED) return say('plan-msg', 'My workouts is full (' + T.MAX_SAVED + '). Delete one first.');
            const s = { id: newId(), w }; state.saved.unshift(s); save(); renderSaved();
            say('plan-msg', 'Saved ' + q(w.name) + ' to My workouts.', () => { const k = state.saved.indexOf(s); if (k >= 0) state.saved.splice(k, 1); save(); renderSaved(); });
        }
    });

    // ---------- 3. the plan ----------
    function stepRow(b, withStart, sets) {
        const li = document.createElement('li');
        if (withStart) { const at = document.createElement('span'); at.className = 'st-at'; at.textContent = T.fmt(b.start); li.appendChild(at); }
        const nm = document.createElement('span'); nm.className = 'st-name k-' + b.kind;
        let label = T.title(b);
        if (b.kind === 'work' && b.round) label += ' · ' + (sets > 1 ? 'set ' + b.set + ', ' : '') + 'round ' + b.round;
        nm.textContent = label;
        const ln = document.createElement('span'); ln.className = 'st-len'; ln.textContent = T.fmt(b.secs);
        li.append(nm, ln);
        return li;
    }
    function renderPlan() {
        const w = lastValid, bad = Object.keys(formErrors).length > 0, blocks = T.buildBlocks(w), total = T.totalOf(blocks);
        $('p-name').textContent = w.name || '';
        $('p-name').hidden = !w.name;
        $('p-total').textContent = T.fmt(total);
        $('p-ends').textContent = 'Ends at ' + timeFmt(now() + total * 1000) + ' if you start now (' + T.fmtWords(total) + ').';
        $('p-desc').textContent = T.describe(w);
        $('p-note').textContent = w.rest && w.rounds > 1 ? 'The rest after the last round of each set is left out, as the set ends there.' : '';
        $('p-err').textContent = bad ? (formErrors.total || 'Fix the boxes marked in red. The total shows the last workout that was right.') : '';
        $('start').disabled = bad; $('save').disabled = bad;
        $('steps-sum').textContent = 'See every step (' + blocks.length + ')';
        const ol = $('p-steps'); ol.textContent = '';
        blocks.slice(0, 400).forEach(b => ol.appendChild(stepRow(b, true, w.sets)));
        if (blocks.length > 400) { const li = document.createElement('li'); li.textContent = '… and ' + (blocks.length - 400) + ' more steps'; ol.appendChild(li); }
        movesNote();
        document.querySelectorAll('.m-secs').forEach(s => { s.placeholder = T.fmt(w.work); });
    }

    // ---------- running ----------
    let lastIndex = -1, doneInfo = null;
    function startWorkout() {
        const r = readAndShow();
        if (!r.w) return;
        ensureAudio();
        state.run = T.startRun(r.w, now()); save();
        lastIndex = -1; doneInfo = null; confirmEnd(false);
        showRun(); tick(); planSounds(); keepAwake();
        window.scrollTo(0, 0);
        $('r-pause').focus({ preventScroll: true });
    }
    $('start').addEventListener('click', startWorkout);
    function showRun() {
        const on = !!state.run || !!doneInfo;
        $('app').classList.toggle('running', on);
        $('run').hidden = !on;
        $('run-main').hidden = !state.run; $('run-side').hidden = !state.run; $('run-done').hidden = !doneInfo;
        $('col-set').hidden = on; $('plan').hidden = on;
        if (!state.run) document.title = BASE_TITLE;
    }
    function where(b, run) {
        if (b.kind === 'work' || b.kind === 'rest') return 'Round ' + b.round + ' of ' + run.rounds + (run.sets > 1 ? ' · Set ' + b.set + ' of ' + run.sets : '');
        if (b.kind === 'setrest') return 'Set ' + b.set + ' of ' + run.sets + ' done';
        return '';
    }
    function tick() {
        const run = state.run;
        if (!run) return;
        const t = now(), p = T.position(run, t);
        if (p.done) return finish(true);
        const b = p.block, paused = run.pausedAt != null;
        $('run').className = 'card run k-' + b.kind + (paused ? ' paused' : '');
        $('r-phase').textContent = T.KINDS[b.kind] + (paused ? ' · paused' : '');
        $('r-where').textContent = where(b, run);
        $('r-name').textContent = b.kind === 'work' ? (b.name || 'Go!') : b.kind === 'rest' || b.kind === 'setrest' ? 'Rest' : T.KINDS[b.kind];
        $('r-time').textContent = T.fmtLeft(p.blockLeft);
        $('r-time').setAttribute('aria-label', 'Time left in this step');
        $('r-bar').style.width = Math.min(100, p.blockDone / (b.secs * 10)) + '%';
        $('r-next').textContent = p.next ? 'Next: ' + T.title(p.next) + ' ' + T.fmt(p.next.secs) : 'Next: finish!';
        $('r-tbar').style.width = Math.min(100, p.elapsed / (run.total * 10)) + '%';
        $('r-total').textContent = T.fmtLeft(p.left) + ' left of ' + T.fmt(run.total) + (paused ? ' · paused' : ' · ends at ' + timeFmt(t + p.left));
        $('r-pause').textContent = paused ? 'Resume' : 'Pause';
        $('r-back').disabled = p.index === 0 && p.blockDone <= 3000;
        document.title = T.fmtLeft(p.blockLeft) + ' ' + (b.kind === 'work' && b.name ? b.name : T.KINDS[b.kind]) + ' · Interval Timer';
        if (p.index !== lastIndex) {
            const first = lastIndex === -1;
            lastIndex = p.index;
            const ol = $('r-steps'); ol.textContent = '';
            run.blocks.slice(p.index + 1, p.index + 7).forEach(x => ol.appendChild(stepRow(x, false, run.sets)));
            if (!ol.childNodes.length) { const li = document.createElement('li'); li.textContent = 'Last step!'; ol.appendChild(li); }
            const words = b.kind === 'work' ? (b.name || 'Work') : T.KINDS[b.kind];
            $('announce').textContent = words + ', ' + T.fmtWords(b.secs) + '.';
            if (!paused && (first ? p.blockDone < 1500 : true)) { speak(words); vibrate(b.kind === 'work' ? 'work' : 'rest'); }
        }
        if (!paused && audio && audio.state === 'running' && p.elapsed > plannedUntil - 60000) planSounds();
    }
    setInterval(tick, 200);
    function pauseResume() {
        const run = state.run; if (!run) return;
        if (run.pausedAt == null) T.pause(run, now()); else T.resume(run, now());
        save(); planSounds(); keepAwake(); soundWarn(); tick();
    }
    function moveBy(fn) { const run = state.run; if (!run) return; fn(run, now()); save(); lastIndex = -1; tick(); planSounds(); }
    $('r-pause').addEventListener('click', pauseResume);
    $('r-skip').addEventListener('click', () => moveBy(T.skip));
    $('r-back').addEventListener('click', () => moveBy(T.back));
    function confirmEnd(on) {
        $('r-confirm').hidden = !on; $('r-end').hidden = on;
        if (on && state.run) {
            const secs = T.activeSecs(state.run, now());
            $('r-confirm-text').textContent = 'End the workout now? ' + (secs >= T.LOG_MIN ? 'The ' + T.fmt(secs) + ' you did is added to Workouts done.' : 'Under a minute done, so it is not added to Workouts done.');
            $('r-end-no').focus();
        }
    }
    $('r-end').addEventListener('click', () => confirmEnd(true));
    $('r-end-no').addEventListener('click', () => { confirmEnd(false); $('r-pause').focus(); });
    $('r-end-yes').addEventListener('click', () => finish(false));

    function finish(full) {
        const run = state.run; if (!run) return;
        const t = now(), secs = full ? Math.min(T.activeSecs(run, t), T.MAX_TOTAL) : T.activeSecs(run, t);
        const entry = { id: newId(), at: run.began, name: run.name || 'Workout', secs, planned: run.total, full };
        const logged = full || secs >= T.LOG_MIN;
        if (logged) { state.history.push(entry); if (state.history.length > T.MAX_HISTORY) state.history.shift(); }
        state.run = null; save();
        stopSounds(); keepAwake(); soundWarn(); confirmEnd(false);
        if (full) { vibrate('done'); speak('Workout done'); }
        doneInfo = { entry, logged, full };
        $('d-title').textContent = full ? 'Workout done!' : 'Workout ended';
        $('d-big').textContent = full ? T.fmt(run.total) : T.fmt(secs) + ' of ' + T.fmt(run.total);
        $('d-text').textContent = (run.name ? run.name + ': ' : '') + (full ? plural(run.blocks.length, 'step') + ' done. ' : 'stopped early. ') +
            (logged ? 'Added to Workouts done.' : 'Under a minute, so it was not added to Workouts done.');
        $('d-msg').textContent = '';
        if (logged) say('d-msg', '', () => { removeHistory(entry.id, true); $('d-text').textContent = 'Not added to Workouts done.'; }, 'Do not add it to Workouts done');
        $('announce').textContent = full ? 'Workout done.' : 'Workout ended.';
        showRun(); renderHistory();
        $('d-again').focus({ preventScroll: true });
    }
    $('d-again').addEventListener('click', () => { doneInfo = null; startWorkout(); });
    $('d-close').addEventListener('click', () => { doneInfo = null; showRun(); $('start').focus(); });

    // keyboard: Space pauses, arrows skip and go back
    document.addEventListener('keydown', e => {
        if (!state.run || e.altKey || e.ctrlKey || e.metaKey) return;
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.closest('dialog')) return;
        if (e.key === ' ' && tag !== 'button' && tag !== 'summary' && tag !== 'a') { e.preventDefault(); pauseResume(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); moveBy(T.skip); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); moveBy(T.back); }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); planSounds(); keepAwake(); } });

    // ---------- sound settings ----------
    ['beeps', 'countdown', 'voice', 'vibrate', 'awake'].forEach(k => {
        const c = $('s-' + k); c.checked = state.settings[k];
        c.addEventListener('change', () => {
            state.settings[k] = c.checked; save(); planSounds(); keepAwake(); soundWarn();
            if (k === 'voice' && c.checked && !('speechSynthesis' in window)) say('sound-msg', 'This browser cannot speak, so only the beeps will play.');
        });
    });
    $('test-sound').addEventListener('click', () => {
        ensureAudio();
        if (!audio) return say('sound-msg', 'This browser cannot play sounds.');
        const go = () => { const a = audio.currentTime + 0.05; play('tick', a); play('tick', a + 1); play('tick', a + 2); play('work', a + 3); play('rest', a + 4.5); };
        if (audio.state === 'running') go(); else audio.resume().then(go).catch(() => {});
        say('sound-msg', 'Playing: 3, 2, 1, then the work beep and the rest beep.');
        if (state.settings.voice) setTimeout(() => speak('Squats'), 3300);
    });

    // ---------- history ----------
    let showAll = false;
    function removeHistory(id, quiet) {
        const i = state.history.findIndex(h => h.id === id); if (i < 0) return;
        const h = state.history[i]; state.history.splice(i, 1); save(); renderHistory();
        if (!quiet) say('h-msg', 'Removed ' + q(h.name) + ' on ' + dateFmt(h.at) + '.', () => { state.history.splice(Math.min(i, state.history.length), 0, h); save(); renderHistory(); });
    }
    const histLine = h => h.name + ', ' + T.fmt(h.secs) + (h.full ? '' : ' of ' + T.fmt(h.planned) + ', ended early');
    function renderHistory() {
        const s = T.stats(state.history, now()), list = state.history.slice().reverse();
        $('h-empty').hidden = list.length > 0; $('h-copy').hidden = !list.length;
        $('h-sum').textContent = list.length ? 'This week: ' + plural(s.weekCount, 'workout') + ', ' + T.fmtWords(s.weekSecs) + '. Last 30 days: ' + plural(s.monthCount, 'workout') + ', ' + T.fmtWords(s.monthSecs) + '.' +
            (s.streak > 1 ? ' ' + s.streak + ' days in a row!' : '') : '';
        const ul = $('h-list'); ul.textContent = '';
        (showAll ? list : list.slice(0, 8)).forEach(h => {
            const li = document.createElement('li'); li.className = 'hbox' + (h.full ? '' : ' part');
            const info = document.createElement('div'); info.className = 'h-info';
            const d = document.createElement('span'); d.className = 'h-date'; d.textContent = dateFmt(h.at) + ', ' + timeFmt(h.at);
            const nm = document.createElement('b'); nm.textContent = h.name;
            const tm = document.createElement('span'); tm.className = 'h-time'; tm.textContent = h.full ? T.fmt(h.secs) + ' · finished' : T.fmt(h.secs) + ' of ' + T.fmt(h.planned) + ' · ended early';
            info.append(d, nm, tm);
            const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'm-rm'; rm.textContent = '×'; rm.setAttribute('aria-label', 'Remove ' + h.name + ' on ' + dateFmt(h.at));
            rm.addEventListener('click', () => removeHistory(h.id));
            li.append(info, rm); ul.appendChild(li);
        });
        $('h-more').hidden = list.length <= 8;
        $('h-more').textContent = showAll ? 'Show fewer' : 'Show all ' + list.length;
    }
    $('h-more').addEventListener('click', () => { showAll = !showAll; renderHistory(); });
    $('h-copy').addEventListener('click', () => {
        const s = T.stats(state.history, now());
        const text = 'Workouts done\n' + 'This week: ' + plural(s.weekCount, 'workout') + ', ' + T.fmtWords(s.weekSecs) + '\n\n' +
            state.history.slice().reverse().map(h => dateFmt(h.at) + ' ' + timeFmt(h.at) + ': ' + histLine(h)).join('\n');
        const done = () => say('h-msg', 'Copied ' + plural(state.history.length, 'workout') + '. Paste it anywhere.');
        const fallback = () => {
            const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            ta.remove(); if (ok) done(); else say('h-msg', 'Copying is blocked in this browser.');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    });

    // ---------- start ----------
    fillForm(state.current);
    readAndShow(); renderSaved(); renderHistory();
    if (state.run) { showRun(); tick(); keepAwake(); soundWarn(); }
    setInterval(() => { if (!state.run) renderPlan(); }, 15000);   // keep "Ends at" current

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
