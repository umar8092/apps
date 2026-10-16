// Pomodoro Focus Timer: page code. The logic lives in core.js (window.Focus).
(function () {
    'use strict';
    const F = window.Focus, SLUG = 'pomodoro-focus-timer-for-study-and-work', KEY = SLUG + '.data';
    const $ = id => document.getElementById(id);
    const now = () => Date.now();
    const MODE_NAME = { focus: 'Focus', short: 'Short break', long: 'Long break' };

    let data, canSave = true, viewDay = null, editTask = null, editRec = null, alertTitle = '', tickTimer = null, endTimer = null, wake = null;
    let undo = null;  // { box, restore }

    // ---------- storage ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        let parsed = null;
        if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
        data = F.cleanData(parsed);
        if (raw && !parsed) setTimeout(() => say('timer-msg', 'Your saved data could not be read, so the app started fresh.'), 0);
    }
    function save() {
        if (!canSave) return;
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { canSave = false; $('storage-warn').hidden = false; }
    }
    window.addEventListener('storage', e => {
        if (e.key !== KEY) return;
        load();  // another tab changed something; every change is saved at once, so its copy is the newest
        renderAll();
    });

    // ---------- small helpers ----------
    function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function btn(text, cls, fn, label) { const b = el('button', cls || 'secondary small', text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    function say(id, text, undoFn) {
        const box = $(id); box.textContent = '';
        if (!text) return;
        box.appendChild(el('span', null, text));
        if (undoFn) {
            const b = btn('Undo', 'link', () => { undoFn(); box.textContent = ''; save(); renderAll(); });
            box.appendChild(b);
        }
    }
    function taskById(id) { return data.tasks.find(t => t.id === id) || null; }
    function newId(prefix) { return prefix + now().toString(36) + Math.random().toString(36).slice(2, 7); }
    const clone = o => JSON.parse(JSON.stringify(o));

    // ---------- sound, vibration, notification, wake lock ----------
    let audio = null;
    function unlockAudio() {
        try { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { audio = null; }
    }
    function playSound(kind) {
        if (kind === 'off' || !audio) return;
        try {
            const t0 = audio.currentTime + .02;
            const note = (freq, at, len, type, vol) => {
                const o = audio.createOscillator(), g = audio.createGain();
                o.type = type; o.frequency.value = freq;
                g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + .01); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
                o.connect(g); g.connect(audio.destination); o.start(at); o.stop(at + len + .05);
            };
            if (kind === 'beep') { for (let i = 0; i < 3; i++) note(880, t0 + i * .35, .22, 'square', .12); }
            else { for (let i = 0; i < 3; i++) { const at = t0 + i * .9; note(1318.5, at, 1.6, 'sine', .32); note(2637, at, .8, 'sine', .08); note(659.3, at, 1.2, 'sine', .12); } }
        } catch (e) { /* sound is a bonus */ }
    }
    function vibrate() { try { if (data.settings.vibrate && navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) { /* not all phones */ } }
    function notify(text) {
        if (!data.settings.notify || !('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
        const opts = { body: text, icon: 'icons/icon-192.png', tag: SLUG };
        const plain = () => { try { new Notification('Pomodoro Focus Timer', opts); } catch (e) { /* Android needs the service worker */ } };
        if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r => r.showNotification('Pomodoro Focus Timer', opts)).catch(plain);
        else plain();
    }
    async function keepAwake(on) {
        try {
            if (on && !wake && 'wakeLock' in navigator && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
            else if (!on && wake) { await wake.release(); wake = null; }
        } catch (e) { wake = null; }
    }

    // ---------- timer ----------
    function tick() {
        const t = data.timer;
        if (t.status === 'running' && t.endsAt <= now()) {
            const r = F.advance(t, data.settings, now(), data.tasks);
            data.timer = r.timer;
            data.records = F.mergeRecords(data.records, r.records);
            save();
            const last = r.ended[r.ended.length - 1];
            const live = r.ended.some(e => e.live);
            const msg = endMessage(r.ended);
            if (live) { playSound(data.settings.sound); vibrate(); }
            notify(msg);
            say('timer-msg', msg);
            alertTitle = last.mode === 'focus' ? 'Time for a break!' : 'Break over: time to focus';
            renderAll();
            return;
        }
        renderTimer();
    }
    function endMessage(ended) {
        const fullBlocks = ended.filter(e => e.mode === 'focus').length, last = ended[ended.length - 1];
        const when = last.live ? '' : ' at ' + F.clock(last.at);
        if (ended.length === 1) {
            if (last.mode === 'focus') return 'Focus block done' + when + ' and counted. ' + (last.next === 'long' ? 'Time for a long break.' : 'Time for a short break.');
            return (last.mode === 'long' ? 'Long break' : 'Break') + ' over' + when + '. Ready for the next focus block?';
        }
        return 'While you were away: ' + F.plural(fullBlocks, 'focus block') + ' counted, last phase ended at ' + F.clock(last.at) + '.';
    }
    function schedule() {
        clearInterval(tickTimer); clearTimeout(endTimer);
        const t = data.timer;
        if (t.status === 'running') {
            tickTimer = setInterval(tick, 250);
            endTimer = setTimeout(tick, Math.max(0, t.endsAt - now()) + 30);
        }
        keepAwake(t.status === 'running' && data.settings.awake);
    }

    function goPressed() {
        unlockAudio();
        alertTitle = '';
        hideAsk();
        const t = data.timer;
        if (t.status === 'running') { data.timer = F.pause(t, now()); say('timer-msg', 'Paused.'); }
        else { data.timer = F.start(t, now()); say('timer-msg', ''); }
        save(); renderAll();
    }
    let askHow = null, askWasRunning = false;
    function stopPressed(how) {
        unlockAudio();
        alertTitle = '';
        const t = data.timer, done = F.elapsedAt(t, now()), mins = Math.round(done / F.MIN);
        if (t.mode === 'focus' && t.startedAt != null && done >= F.MIN) {
            askHow = how;
            const task = taskById(t.taskId);
            $('ask-text').textContent = 'You focused ' + F.duration(mins) + (task ? ' on ' + task.name : '') + '. Count it in your focus time?';
            $('ask-yes').textContent = 'Count ' + F.duration(mins);
            askWasRunning = t.status === 'running';
            if (askWasRunning) data.timer = F.pause(t, now());
            $('ask').hidden = false;
            renderTimer();
            $('ask-yes').focus();
            return;
        }
        finishStop(how, false);
    }
    function finishStop(how, count) {
        const t = data.timer;
        const r = F.stopEarly(t, data.settings, now(), how, count, data.tasks);
        data.timer = r.timer;
        data.records = F.mergeRecords(data.records, r.records);
        hideAsk();
        const added = r.records[0];
        let msg = how === 'skip' ? (t.mode === 'focus' ? 'Focus block ended early. Take a short break.' : 'Break skipped. Ready to focus.') : 'The clock is back to the start.';
        if (added) msg = 'Counted ' + F.duration(added.mins) + '. ' + msg;
        else if (t.mode === 'focus' && t.startedAt != null && count === false && F.elapsedAt(t, now()) >= F.MIN) msg = 'Not counted. ' + msg;
        say('timer-msg', msg);
        save(); renderAll();
    }
    function hideAsk() { $('ask').hidden = true; askHow = null; }
    $('ask-yes').addEventListener('click', () => finishStop(askHow, true));
    $('ask-no').addEventListener('click', () => finishStop(askHow, false));
    $('ask-back').addEventListener('click', () => {
        const was = askWasRunning; askWasRunning = false;
        hideAsk();
        if (was) data.timer = F.start(data.timer, now());
        save(); renderAll(); $('go').focus();
    });
    $('go').addEventListener('click', goPressed);
    $('skip').addEventListener('click', () => stopPressed('skip'));
    $('reset').addEventListener('click', () => stopPressed('reset'));
    document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => {
        const t = data.timer;
        if (t.status === 'running' || b.dataset.mode === t.mode && t.startedAt == null) return;
        if (t.mode === 'focus' && t.startedAt != null && F.elapsedAt(t, now()) >= F.MIN) {
            say('timer-msg', 'Finish or stop this focus block first: press “Start this block again” or “Skip to break”.');
            return;
        }
        data.timer = F.switchMode(t, b.dataset.mode, data.settings);
        hideAsk(); say('timer-msg', ''); save(); renderAll();
    }));
    document.addEventListener('keydown', e => {
        if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        const tag = (e.target && e.target.tagName) || '';
        if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(tag) || document.querySelector('dialog[open]') || !$('ask').hidden) return;
        e.preventDefault(); goPressed();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { tick(); keepAwake(data.timer.status === 'running' && data.settings.awake); }
    });
    window.addEventListener('focus', () => { alertTitle = ''; renderTimer(); });

    function renderTimer() {
        const t = data.timer, s = data.settings, rem = F.remainingAt(t, now());
        $('timer').dataset.mode = t.mode;
        document.querySelectorAll('.mode').forEach(b => {
            b.setAttribute('aria-pressed', String(b.dataset.mode === t.mode));
            b.disabled = t.status === 'running' && b.dataset.mode !== t.mode;
        });
        $('time').textContent = F.countdown(rem);
        const blockNo = (t.cycleDay === F.dayKey(now()) ? t.cycle : 0) + (t.mode === 'focus' ? 1 : 0);
        let phase;
        if (t.mode === 'focus') phase = s.every ? 'Focus block ' + Math.min(blockNo, 99) + ' · long break after block ' + (Math.ceil(blockNo / s.every) * s.every) : 'Focus block ' + blockNo;
        else if (t.mode === 'short') phase = 'Short break · ' + F.plural(t.cycle, 'block') + ' done' + (s.every ? ', long break after ' + (Math.ceil(Math.max(1, t.cycle + 1) / s.every) * s.every) : '');
        else phase = 'Long break · ' + F.plural(t.cycle, 'block') + ' done, well done';
        $('phase').textContent = phase;
        $('ends').textContent = t.status === 'running' ? 'Ends at ' + F.clock(t.endsAt) : t.status === 'paused' ? 'Paused · ' + F.countdown(rem) + ' left' : F.duration(Math.round(t.length / F.MIN)) + (t.mode === 'focus' ? ' of focus' : ' break');
        const task = taskById(t.taskId), w = $('working');
        w.textContent = '';
        if (t.mode !== 'focus') w.appendChild(el('span', null, task ? 'Next: ' + task.name : 'Stand up, drink some water, look away from the screen.'));
        else if (task) { w.appendChild(el('span', 'k', 'Working on: ')); w.appendChild(el('b', null, task.name)); }
        else w.appendChild(el('span', null, 'No task picked. Tap “Work on this” on a task (optional).'));
        const go = $('go');
        go.textContent = t.status === 'running' ? 'Pause' : t.status === 'paused' ? 'Resume' : t.mode === 'focus' ? 'Start focus' : 'Start break';
        go.setAttribute('aria-pressed', String(t.status === 'running'));
        $('skip').textContent = t.mode === 'focus' ? 'Skip to break' : 'Skip break';
        $('reset').textContent = t.mode === 'focus' ? 'Start this block again' : 'Start this break again';
        $('reset').disabled = t.startedAt == null;
        const asking = !$('ask').hidden;
        go.disabled = asking; $('skip').disabled = asking; if (asking) $('reset').disabled = true;
        document.title = alertTitle ? alertTitle + ' · Pomodoro Focus Timer' : t.status !== 'idle'
            ? F.countdown(rem) + ' ' + MODE_NAME[t.mode] + (t.status === 'paused' ? ' (paused)' : '') + ' · Pomodoro Focus Timer'
            : 'Pomodoro Focus Timer for Study and Work';
        $('set-note').hidden = t.startedAt == null;
    }

    // ---------- tasks ----------
    $('add-est-btn').addEventListener('click', () => { $('add-est-row').hidden = false; $('add-est-btn').hidden = true; $('task-est').focus(); });
    $('task-new').addEventListener('paste', e => {
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (!/\n/.test(text.trim())) return;
        e.preventDefault();
        const names = F.splitTasks(text);
        addTasks(names, null);
    });
    $('add-form').addEventListener('submit', e => {
        e.preventDefault();
        const names = F.splitTasks($('task-new').value), estText = $('task-est').value.trim();
        $('add-err').textContent = '';
        $('task-new').removeAttribute('aria-invalid'); $('task-est').removeAttribute('aria-invalid');
        if (!names.length) { $('add-err').textContent = 'Type what you will work on first.'; $('task-new').setAttribute('aria-invalid', 'true'); $('task-new').focus(); return; }
        let est = null;
        if (!$('add-est-row').hidden && estText) {
            est = F.parseWhole(estText, 1, 50);
            if (est == null) { $('add-err').textContent = 'Blocks it needs must be a whole number from 1 to 50, or leave it empty.'; $('task-est').setAttribute('aria-invalid', 'true'); $('task-est').focus(); return; }
        }
        addTasks(names, est);
    });
    function addTasks(names, est) {
        if (!names.length) return;
        const before = clone(data.tasks), beforeTimer = data.timer.taskId;
        const added = [];
        for (const name of names.slice(0, 100)) {
            if (data.tasks.length >= 500) break;
            const existing = data.tasks.find(t => !t.done && t.name.toLowerCase() === name.toLowerCase());
            if (existing) continue;
            const t = { id: newId('t'), name, est, done: false, created: now() };
            data.tasks.push(t); added.push(t);
        }
        $('task-new').value = ''; $('task-est').value = '';
        $('add-est-row').hidden = true; $('add-est-btn').hidden = false;
        if (!added.length) { say('tasks-msg', 'That task is already on your list.'); return; }
        if (!data.timer.taskId && data.timer.status === 'idle') data.timer.taskId = added[0].id;
        say('tasks-msg', added.length === 1 ? 'Added “' + added[0].name + '”.' : 'Added ' + added.length + ' tasks.', () => { data.tasks = before; data.timer.taskId = beforeTimer; });
        save(); renderAll();
        $('task-new').focus();
    }
    function renderTasks() {
        const list = $('task-list'); list.textContent = '';
        const tasks = [...data.tasks].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
        $('tasks-empty').hidden = tasks.length > 0;
        $('clear-done').hidden = !tasks.some(t => t.done);
        const todayKey = F.dayKey(now()), today = F.recordsOn(data.records, todayKey);
        for (const t of tasks) {
            const li = el('li', 'task' + (t.done ? ' done' : '') + (data.timer.taskId === t.id ? ' current' : ''));
            if (editTask === t.id) { li.appendChild(taskEditForm(t)); list.appendChild(li); continue; }
            const top = el('div', 'task-top');
            const pick = btn(data.timer.taskId === t.id ? 'Working on this' : 'Work on this', 'pick', () => pickTask(t.id));
            pick.setAttribute('aria-pressed', String(data.timer.taskId === t.id));
            pick.disabled = t.done;
            top.appendChild(el('span', 'task-name', t.name));
            li.appendChild(top);
            const all = F.taskTotals(data.records, t.id), tod = F.totals(today.filter(r => r.task === t.id));
            let meta = t.est ? all.blocks + ' of ' + F.plural(t.est, 'block') + (all.blocks > t.est ? ' (' + (all.blocks - t.est) + ' over)' : '') : F.plural(all.blocks, 'block');
            meta += all.mins ? ' · ' + F.duration(all.mins) + ' in total' + (tod.mins ? ' · ' + F.duration(tod.mins) + ' today' : '') : ' · no focus time yet';
            li.appendChild(el('p', 'task-meta', meta));
            if (t.est) { const bar = el('div', 'bar small'); bar.setAttribute('aria-hidden', 'true'); const i = el('i'); i.style.width = Math.min(100, all.blocks / t.est * 100) + '%'; bar.appendChild(i); li.appendChild(bar); }
            const row = el('div', 'task-btns');
            row.appendChild(pick);
            const lab = el('label', 'check inline-check'), cb = el('input');
            cb.type = 'checkbox'; cb.checked = t.done; cb.setAttribute('aria-label', 'Finished: ' + t.name);
            cb.addEventListener('change', () => setDone(t.id, cb.checked));
            lab.appendChild(cb); lab.appendChild(document.createTextNode(' Finished'));
            row.appendChild(lab);
            const grp = el('span', 'grp');
            grp.appendChild(btn('Edit', 'secondary small', () => { editTask = t.id; renderTasks(); const f = document.querySelector('.task-edit input'); if (f) f.focus(); }, 'Edit ' + t.name));
            grp.appendChild(btn('Delete', 'secondary small', () => deleteTask(t.id), 'Delete ' + t.name));
            row.appendChild(grp);
            li.appendChild(row);
            list.appendChild(li);
        }
    }
    function taskEditForm(t) {
        const f = el('form', 'task-edit'); f.noValidate = true;
        const idN = 'en-' + t.id, idE = 'ee-' + t.id;
        const l1 = el('label', null, 'Task name'); l1.htmlFor = idN;
        const n = el('input'); n.id = idN; n.type = 'text'; n.maxLength = 120; n.value = t.name; n.autocomplete = 'off';
        const l2 = el('label', null, 'Focus blocks it needs (optional, 1 to 50)'); l2.htmlFor = idE;
        const e = el('input'); e.id = idE; e.type = 'text'; e.inputMode = 'numeric'; e.maxLength = 2; e.value = t.est || ''; e.placeholder = 'Leave empty if not sure';
        const err = el('p', 'err'); err.setAttribute('role', 'alert');
        const row = el('div', 'row-btns two');
        const ok = el('button', 'primary', 'Save'); ok.type = 'submit';
        row.appendChild(ok); row.appendChild(btn('Cancel', 'secondary', () => { editTask = null; renderTasks(); }));
        [l1, n, l2, e, err, row].forEach(x => f.appendChild(x));
        f.addEventListener('submit', ev => {
            ev.preventDefault();
            const name = F.cleanName(n.value), et = e.value.trim(), est = et ? F.parseWhole(et, 1, 50) : null;
            if (!name) { err.textContent = 'The task needs a name.'; n.setAttribute('aria-invalid', 'true'); n.focus(); return; }
            if (et && est == null) { err.textContent = 'Blocks it needs must be a whole number from 1 to 50, or leave it empty.'; e.setAttribute('aria-invalid', 'true'); e.focus(); return; }
            const before = clone(t);
            t.name = name; t.est = est; editTask = null;
            say('tasks-msg', 'Saved “' + name + '”.', () => { Object.assign(taskById(t.id) || {}, before); });
            save(); renderAll();
        });
        f.addEventListener('keydown', ev => { if (ev.key === 'Escape') { editTask = null; renderTasks(); } });
        return f;
    }
    function pickTask(id) {
        data.timer.taskId = data.timer.taskId === id ? null : id;
        const t = taskById(data.timer.taskId);
        say('tasks-msg', t ? 'Now working on “' + t.name + '”.' + (data.timer.status === 'running' && data.timer.mode === 'focus' ? ' This block counts for it.' : '') : 'No task picked.');
        save(); renderAll();
    }
    function setDone(id, done) {
        const t = taskById(id); if (!t) return;
        const beforeTimer = data.timer.taskId;
        t.done = done;
        if (done && data.timer.taskId === id && data.timer.status === 'idle') data.timer.taskId = null;
        say('tasks-msg', done ? 'Well done: “' + t.name + '” is finished.' : '“' + t.name + '” is back on your list.', () => { const x = taskById(id); if (x) x.done = !done; data.timer.taskId = beforeTimer; });
        save(); renderAll();
    }
    function deleteTask(id) {
        const before = clone(data.tasks), beforeTimer = data.timer.taskId, t = taskById(id);
        data.tasks = data.tasks.filter(x => x.id !== id);
        if (data.timer.taskId === id) data.timer.taskId = null;
        // records keep the name, so the log still says what the time was for
        data.records.forEach(r => { if (r.task === id) r.name = t.name; });
        say('tasks-msg', 'Deleted “' + t.name + '”. Its focus time stays in your log.', () => { data.tasks = before; data.timer.taskId = beforeTimer; });
        save(); renderAll();
    }
    $('clear-done').addEventListener('click', () => {
        const before = clone(data.tasks), n = data.tasks.filter(t => t.done).length;
        data.tasks.filter(t => t.done).forEach(t => data.records.forEach(r => { if (r.task === t.id) r.name = t.name; }));
        data.tasks = data.tasks.filter(t => !t.done);
        say('tasks-msg', 'Removed ' + F.plural(n, 'finished task') + '. Their focus time stays in your log.', () => { data.tasks = before; });
        save(); renderAll();
    });

    // ---------- day view ----------
    function currentDay() { return viewDay || F.dayKey(now()); }
    function renderDay() {
        const key = currentDay(), todayKey = F.dayKey(now()), isToday = key === todayKey;
        const recs = F.recordsOn(data.records, key), tot = F.totals(recs);
        $('day-h').textContent = isToday ? 'Today' : key === F.addDays(todayKey, -1) ? 'Yesterday, ' + F.dayLabel(key) : F.dayLabel(key, true);
        $('day-today').hidden = isToday;
        $('day-total').textContent = recs.length ? F.duration(tot.mins) + ' of focus · ' + F.blocksText(tot) : (isToday ? 'No focus time yet today.' : 'No focus time on this day.');
        const goal = data.settings.goal;
        $('goal').hidden = !goal;
        if (goal) {
            $('goal-fill').style.width = Math.min(100, tot.blocks / goal * 100) + '%';
            $('goal-text').textContent = 'Daily goal: ' + tot.blocks + ' of ' + F.plural(goal, 'block') + (tot.blocks >= goal ? '. Goal reached!' : ', ' + (goal - tot.blocks) + ' to go.');
        }
        const split = $('day-tasks'); split.textContent = '';
        for (const g of F.byTask(recs, data.tasks)) {
            const li = el('li');
            li.appendChild(el('span', 'nm', g.name));
            li.appendChild(el('span', 'v', F.duration(g.mins) + ' · ' + F.blocksText(g)));
            split.appendChild(li);
        }
        split.hidden = !recs.length;
        $('day-empty').hidden = recs.length > 0;
        $('day-empty').textContent = isToday ? 'No focus time yet. Press Start focus to begin your first block.' : 'Nothing logged on this day.';
        $('day-log-h').hidden = !recs.length;
        const log = $('day-log'); log.textContent = '';
        for (const r of recs) {
            const li = el('li', 'rec' + (r.full ? '' : ' part'));
            if (editRec === r.id) { li.appendChild(recEditForm(r)); log.appendChild(li); continue; }
            const live = taskById(r.task);
            const txt = el('div', 'rec-txt');
            txt.appendChild(el('span', 'when', F.clock(r.start) + '–' + F.clock(r.end)));
            txt.appendChild(el('span', 'nm', live ? live.name : r.name || 'No task picked'));
            txt.appendChild(el('span', 'v', F.duration(r.mins) + (r.full ? '' : ' (stopped early)')));
            li.appendChild(txt);
            const b = el('div', 'rec-btns');
            b.appendChild(btn('Edit', 'secondary small', () => { editRec = r.id; renderDay(); const f = document.querySelector('.rec-edit select'); if (f) f.focus(); }, 'Edit block at ' + F.clock(r.start)));
            b.appendChild(btn('Delete', 'secondary small', () => deleteRec(r.id), 'Delete block at ' + F.clock(r.start)));
            li.appendChild(b);
            log.appendChild(li);
        }
        const text = F.summaryText(data.records, data.tasks, key);
        $('email').href = 'mailto:?subject=' + encodeURIComponent('Focus time, ' + F.dayLabel(key, true)) + '&body=' + encodeURIComponent(text);
        $('copy').disabled = !recs.length;
        $('email').classList.toggle('off', !recs.length);
        $('email').setAttribute('aria-disabled', String(!recs.length));
    }
    $('email').addEventListener('click', e => { if ($('email').getAttribute('aria-disabled') === 'true') e.preventDefault(); });
    function taskOptions(select, selected) {
        select.textContent = '';
        const none = el('option', null, 'No task'); none.value = ''; select.appendChild(none);
        for (const t of data.tasks) { const o = el('option', null, t.name + (t.done ? ' (finished)' : '')); o.value = t.id; select.appendChild(o); }
        select.value = selected && taskById(selected) ? selected : '';
    }
    function recEditForm(r) {
        const f = el('form', 'rec-edit'); f.noValidate = true;
        const l1 = el('label', null, 'Task'); l1.htmlFor = 're-task';
        const s = el('select'); s.id = 're-task'; taskOptions(s, r.task);
        if (!taskById(r.task) && r.name) { const o = el('option', null, r.name + ' (deleted)'); o.value = '__keep'; s.appendChild(o); s.value = '__keep'; }
        const l2 = el('label', null, 'Minutes (1 to 600)'); l2.htmlFor = 're-mins';
        const m = el('input'); m.id = 're-mins'; m.type = 'text'; m.inputMode = 'numeric'; m.maxLength = 3; m.value = r.mins;
        const err = el('p', 'err'); err.setAttribute('role', 'alert');
        const row = el('div', 'row-btns two');
        const ok = el('button', 'primary', 'Save'); ok.type = 'submit';
        row.appendChild(ok); row.appendChild(btn('Cancel', 'secondary', () => { editRec = null; renderDay(); }));
        [l1, s, l2, m, err, row].forEach(x => f.appendChild(x));
        f.addEventListener('submit', ev => {
            ev.preventDefault();
            const mins = F.parseWhole(m.value, 1, 600);
            if (mins == null) { err.textContent = 'Minutes must be a whole number from 1 to 600.'; m.setAttribute('aria-invalid', 'true'); m.focus(); return; }
            const before = clone(data.records);
            const rec = data.records.find(x => x.id === r.id);
            if (s.value !== '__keep') { const t = taskById(s.value); rec.task = t ? t.id : null; rec.name = t ? t.name : ''; }
            if (rec.mins !== mins) rec.end = rec.start + mins * F.MIN;
            rec.mins = mins;
            editRec = null;
            say('day-msg', 'Block saved.', () => { data.records = before; });
            save(); renderAll();
        });
        f.addEventListener('keydown', ev => { if (ev.key === 'Escape') { editRec = null; renderDay(); } });
        return f;
    }
    function deleteRec(id) {
        const before = clone(data.records), r = data.records.find(x => x.id === id);
        data.records = data.records.filter(x => x.id !== id);
        say('day-msg', 'Deleted the block at ' + F.clock(r.start) + ' (' + F.duration(r.mins) + ').', () => { data.records = before; });
        save(); renderAll();
    }
    $('day-today').addEventListener('click', () => { viewDay = null; editRec = null; renderAll(); });
    $('copy').addEventListener('click', async () => {
        const text = F.summaryText(data.records, data.tasks, currentDay());
        try { await navigator.clipboard.writeText(text); say('day-msg', 'Summary copied. Paste it into a message or a timesheet.'); }
        catch (e) {
            const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px'; document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (x) { ok = false; }
            ta.remove();
            say('day-msg', ok ? 'Summary copied.' : 'Copying is blocked here. Use Email this summary instead.');
        }
    });
    $('add-past').addEventListener('click', () => {
        const f = $('past-form'); f.hidden = false; $('add-past').hidden = true;
        taskOptions($('past-task'), data.timer.taskId);
        const key = currentDay(); $('past-date').value = key; $('past-date').max = F.dayKey(now());
        const d = new Date(now() - data.settings.focus * F.MIN); $('past-time').value = key === F.dayKey(now()) ? F.clock(d.getTime()) : '09:00';
        $('past-mins').value = data.settings.focus; $('past-full').checked = true; $('past-err').textContent = '';
        $('past-task').focus();
    });
    function closePast() { $('past-form').hidden = true; $('add-past').hidden = false; }
    $('past-cancel').addEventListener('click', closePast);
    $('past-form').addEventListener('submit', e => {
        e.preventDefault();
        const err = $('past-err'); err.textContent = '';
        const dv = $('past-date').value, tv = $('past-time').value, mins = F.parseWhole($('past-mins').value, 1, 600);
        if (!/^\d{4}-\d\d-\d\d$/.test(dv)) { err.textContent = 'Pick the day.'; $('past-date').focus(); return; }
        if (!/^\d\d:\d\d$/.test(tv)) { err.textContent = 'Type the time you started, like 09:30.'; $('past-time').focus(); return; }
        if (mins == null) { err.textContent = 'Minutes must be a whole number from 1 to 600.'; $('past-mins').focus(); return; }
        const [y, mo, d] = dv.split('-').map(Number), [h, mi] = tv.split(':').map(Number);
        const start = new Date(y, mo - 1, d, h, mi).getTime(), end = start + mins * F.MIN;
        if (start > now()) { err.textContent = 'That start time is still in the future.'; $('past-time').focus(); return; }
        const t = taskById($('past-task').value);
        let id = 'r' + start;
        while (data.records.some(r => r.id === id)) id += 'x';
        const before = clone(data.records);
        data.records.push({ id, start, end, mins, task: t ? t.id : null, name: t ? t.name : '', full: $('past-full').checked });
        closePast();
        viewDay = F.dayKey(start) === F.dayKey(now()) ? null : F.dayKey(start);
        say('day-msg', 'Added ' + F.duration(mins) + (t ? ' for ' + t.name : '') + ' on ' + F.dayLabel(F.dayKey(start)) + '.', () => { data.records = before; });
        save(); renderAll();
    });

    // ---------- week ----------
    function renderWeek() {
        const todayKey = F.dayKey(now()), w = F.week(data.records, todayKey), st = F.streak(data.records, todayKey);
        $('week-total').textContent = w.mins ? F.duration(w.mins) + ' of focus · ' + F.plural(w.blocks, 'full block') + ' · ' + (st >= 2 ? st + ' days in a row' : F.plural(w.active, 'day') + ' with focus')
            : 'No focus time in the last 7 days yet.';
        const bars = $('bars'); bars.textContent = '';
        for (const d of w.days) {
            const b = el('button', 'day-bar' + (d.key === currentDay() ? ' sel' : '') + (d.key === todayKey ? ' today' : '')); b.type = 'button';
            b.setAttribute('aria-pressed', String(d.key === currentDay()));
            b.setAttribute('aria-label', F.dayLabel(d.key) + ': ' + (d.mins ? F.duration(d.mins) + ', ' + F.blocksText(d) : 'no focus time'));
            const col = el('span', 'col'); const fill = el('i'); fill.style.height = (w.max ? Math.max(d.mins ? 6 : 0, d.mins / w.max * 100) : 0) + '%'; col.appendChild(fill);
            b.appendChild(el('span', 'val', d.mins ? (d.mins >= 60 ? (Math.round(d.mins / 6) / 10) + ' h' : d.mins + 'm') : '–'));
            b.appendChild(col);
            b.appendChild(el('span', 'lbl', d.key === todayKey ? 'Today' : F.dayLabel(d.key).split(' ')[0]));
            b.addEventListener('click', () => { viewDay = d.key === todayKey ? null : d.key; editRec = null; renderAll(); if (window.innerWidth < 900) $('day').scrollIntoView({ block: 'start' }); });
            bars.appendChild(b);
        }
    }

    // ---------- settings ----------
    const CHOICES = {
        focus: [15, 20, 25, 30, 45, 50, 60, 90], short: [3, 5, 10, 15], long: [10, 15, 20, 30],
        every: null, goal: [0, 2, 4, 6, 8, 10, 12]
    };
    function fillSelect(key) {
        const s = $('s-' + key); s.textContent = '';
        if (key === 'every') {
            for (const n of [2, 3, 4, 5, 6, 8]) { const o = el('option', null, 'After every ' + n + ' focus blocks'); o.value = n; s.appendChild(o); }
            const o = el('option', null, 'Never'); o.value = 0; s.appendChild(o);
        } else {
            for (const n of CHOICES[key]) { const o = el('option', null, key === 'goal' ? (n ? F.plural(n, 'block') + ' a day (' + F.duration(n * data.settings.focus) + ')' : 'No goal') : F.duration(n)); o.value = n; s.appendChild(o); }
            const o = el('option', null, 'Other…'); o.value = 'other'; s.appendChild(o);
        }
    }
    function renderSettings() {
        const st = data.settings;
        for (const key of ['focus', 'short', 'long', 'every', 'goal']) {
            fillSelect(key);
            const s = $('s-' + key), field = s.closest('.field'), box = field.querySelector('.inline');
            const known = [...s.options].some(o => o.value === String(st[key]));
            if (box && (box.dataset.open === '1' || !known)) { s.value = 'other'; box.hidden = false; const i = box.querySelector('input'); if (document.activeElement !== i) i.value = st[key]; }
            else { s.value = String(st[key]); if (box) box.hidden = true; }
        }
        $('s-sound').value = st.sound;
        for (const k of ['autoBreak', 'autoFocus', 'vibrate', 'awake', 'notify']) $('s-' + k).checked = st[k];
        if (!('Notification' in window)) { $('s-notify').disabled = true; $('s-notify').checked = false; }
        if (!('wakeLock' in navigator)) $('s-awake').disabled = true;
        document.querySelectorAll('.preset').forEach(b => {
            const p = F.PRESETS[b.dataset.preset];
            b.setAttribute('aria-pressed', String(Object.keys(p).every(k => st[k] === p[k])));
        });
    }
    function setSetting(key, value) {
        const before = clone(data.settings);
        data.settings[key] = value;
        data.settings = F.cleanSettings(data.settings);
        data.timer = F.applySettings(data.timer, data.settings);
        save(); renderAll();
        return before;
    }
    for (const key of ['focus', 'short', 'long', 'every', 'goal']) {
        const s = $('s-' + key), box = s.closest('.field').querySelector('.inline');
        s.addEventListener('change', () => {
            $('set-err').textContent = '';
            if (s.value === 'other') { box.hidden = false; box.dataset.open = '1'; const i = box.querySelector('input'); i.value = data.settings[key] || ''; i.focus(); i.select(); return; }
            if (box) { box.hidden = true; box.dataset.open = ''; }
            setSetting(key, +s.value);
            say('set-msg', 'Saved.');
        });
        if (box) {
            const i = box.querySelector('input'), [lo, hi] = key === 'goal' ? [1, 30] : F.LIMITS[key];
            const commit = () => {
                const n = F.parseWhole(i.value, lo, hi);
                if (n == null) { $('set-err').textContent = s.previousElementSibling.textContent + ' must be a whole number of ' + (key === 'goal' ? 'blocks' : 'minutes') + ' from ' + lo + ' to ' + hi + '.'; i.setAttribute('aria-invalid', 'true'); return; }
                i.removeAttribute('aria-invalid'); $('set-err').textContent = '';
                if (n !== data.settings[key]) { setSetting(key, n); say('set-msg', 'Saved.'); }
            };
            i.addEventListener('change', commit);
            i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
        }
    }
    $('s-sound').addEventListener('change', () => { unlockAudio(); setSetting('sound', $('s-sound').value); playSound(data.settings.sound); });
    $('test-sound').addEventListener('click', () => {
        unlockAudio();
        if (data.settings.sound === 'off') { say('set-msg', 'Sound is set to No sound. Pick Bell or Beeps to hear it.'); return; }
        playSound(data.settings.sound);
        say('set-msg', 'Playing the ' + (data.settings.sound === 'bell' ? 'bell' : 'beeps') + '. Nothing? Check the volume and the silent switch.');
    });
    for (const k of ['autoBreak', 'autoFocus', 'vibrate', 'awake']) $('s-' + k).addEventListener('change', () => { setSetting(k, $('s-' + k).checked); schedule(); say('set-msg', 'Saved.'); });
    $('s-notify').addEventListener('change', async () => {
        const cb = $('s-notify');
        if (!cb.checked) { setSetting('notify', false); say('set-msg', 'Notifications off.'); return; }
        let perm = 'denied';
        try { perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission(); } catch (e) { perm = 'denied'; }
        if (perm === 'granted') { setSetting('notify', true); say('set-msg', 'You will get a notification when time is up while this page is in the background.'); }
        else { cb.checked = false; setSetting('notify', false); say('set-msg', 'Your browser blocked notifications. Allow them for this site in the browser settings, then tick this again.'); }
    });
    document.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => {
        const before = clone(data.settings);
        Object.assign(data.settings, F.PRESETS[b.dataset.preset]);
        data.settings = F.cleanSettings(data.settings);
        data.timer = F.applySettings(data.timer, data.settings);
        document.querySelectorAll('.field .inline').forEach(x => { x.dataset.open = ''; });
        $('set-err').textContent = '';
        say('set-msg', 'Set to ' + b.querySelector('b').textContent + '.', () => { data.settings = before; data.timer = F.applySettings(data.timer, data.settings); });
        save(); renderAll();
    }));

    // backup, CSV, delete everything
    function download(name, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    $('backup').addEventListener('click', () => {
        download('pomodoro-focus-timer-backup-' + F.dayKey(now()) + '.json', JSON.stringify(Object.assign({ app: SLUG, saved: new Date().toISOString() }, data), null, 1), 'application/json');
        say('set-msg', 'Backup saved to your downloads.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const file = $('restore-file').files[0]; $('restore-file').value = '';
        if (!file) return;
        if (file.size > 20e6) { say('set-msg', 'That file is too big to be a backup from this app.'); return; }
        const r = new FileReader();
        r.onload = () => {
            let parsed;
            try { parsed = JSON.parse(r.result); } catch (e) { parsed = null; }
            if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed.tasks) && !Array.isArray(parsed.records))) { say('set-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
            const before = clone(data), clean = F.cleanData(parsed);
            clean.timer = F.newTimer(clean.settings, 'focus');
            data = clean; viewDay = null;
            say('set-msg', 'Restored ' + F.plural(data.tasks.length, 'task') + ' and ' + F.plural(data.records.length, 'focus block') + '.', () => { data = before; });
            save(); renderAll();
        };
        r.onerror = () => say('set-msg', 'That file could not be read.');
        r.readAsText(file);
    });
    $('csv').addEventListener('click', () => {
        if (!data.records.length) { say('set-msg', 'There is no focus time to download yet.'); return; }
        download('focus-log-' + F.dayKey(now()) + '.csv', F.csv(data.records, data.tasks), 'text/csv');
        say('set-msg', 'Focus log downloaded.');
    });
    $('wipe').addEventListener('click', () => {
        if (!data.tasks.length && !data.records.length) { say('set-msg', 'There is nothing to delete.'); return; }
        if (!confirm('Delete all tasks and all focus time on this device? You can undo straight after.')) return;
        const before = clone(data);
        data = { v: 1, settings: data.settings, tasks: [], records: [], timer: F.newTimer(data.settings, 'focus') };
        viewDay = null;
        say('set-msg', 'Everything was deleted. Your settings stay.', () => { data = before; });
        save(); renderAll();
    });

    function renderAll() {
        if (viewDay && viewDay >= F.dayKey(now())) viewDay = null;
        renderTimer(); renderTasks(); renderDay(); renderWeek(); renderSettings(); schedule();
        $('storage-warn').hidden = canSave;
    }

    load();
    if (canSave) { try { localStorage.setItem(KEY + '.test', '1'); localStorage.removeItem(KEY + '.test'); } catch (e) { canSave = false; } }
    // catch up on anything that ended while the page was closed
    tick();
    renderAll();
    window.addEventListener('pagehide', save);

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    window.__focusApp = { get data() { return data; } };
})();
