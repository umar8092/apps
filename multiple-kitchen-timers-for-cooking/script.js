// Multiple Kitchen Timers for Cooking: the page. The timer rules live in core.js.
(function () {
    'use strict';
    const K = window.KitchenTimers;
    const SLUG = 'multiple-kitchen-timers-for-cooking', KEY = SLUG + '.data';
    const $ = id => document.getElementById(id);
    const now = () => Date.now();
    const BASE_TITLE = document.title;
    const timeFmt = t => { try { return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return new Date(t).toTimeString().slice(0, 5); } };
    const when = at => K.whenText(at, now(), timeFmt);

    // ---------- saving ----------
    let canSave = true;
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); localStorage.setItem(SLUG + '.test', '1'); localStorage.removeItem(SLUG + '.test'); } catch (e) { canSave = false; }
        return raw ? K.sanitize(raw) : K.fresh();
    }
    function save() {
        if (!canSave) return;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canSave = false; $('storage-warn').hidden = false; }
    }
    let state = load();
    if (!canSave) $('storage-warn').hidden = false;
    K.tick(state, now());   // timers that ended while the page was closed
    const byId = id => state.timers.find(t => t.id === id);

    // ---------- sound ----------
    // Alarms are scheduled on the audio clock at each timer's end time, so they ring on time even when the browser slows a background tab.
    let audio = null, master = null;
    const buffers = {}, scheduled = new Map();
    function makeBuffer(kind) {
        const rate = audio.sampleRate, secs = kind === 'bell' ? 1.7 : kind === 'short' ? 0.25 : 0.62;
        const buf = audio.createBuffer(1, Math.ceil(rate * secs), rate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / rate;
            if (kind === 'bell') {
                const env = Math.exp(-t * 2.6) * Math.min(1, t * 200);
                d[i] = env * (0.55 * Math.sin(2 * Math.PI * 880 * t) + 0.3 * Math.sin(2 * Math.PI * 1320 * t) + 0.15 * Math.sin(2 * Math.PI * 2640 * t));
            } else {
                // three bright beeps (one for the short reminder)
                const n = kind === 'short' ? 1 : 3, slot = t % 0.21, k = Math.floor(t / 0.21);
                const on = k < n && slot < 0.13;
                const env = on ? Math.min(1, slot * 300, (0.13 - slot) * 300) : 0;
                const f = 1046;
                d[i] = env * (0.6 * Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2 * t) + 0.15 * Math.sin(2 * Math.PI * f * 3 * t));
            }
        }
        return buf;
    }
    function ensureAudio() {
        try {
            if (!audio) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                audio = new AC();
                master = audio.createGain(); master.gain.value = 0.8; master.connect(audio.destination);
                ['beeps', 'bell', 'short'].forEach(k => { buffers[k] = makeBuffer(k); });
                audio.onstatechange = () => { scheduleAll(true); soundWarn(); };
            }
            if (audio.state !== 'running') audio.resume().then(() => { scheduleAll(true); soundWarn(); }).catch(() => {});
            // iPhones only unlock sound for a page that plays something during a tap
            const s = audio.createBufferSource(); s.buffer = audio.createBuffer(1, 1, 22050); s.connect(master); s.start(0);
        } catch (e) { audio = null; }
    }
    function play(kind, at) {
        const src = audio.createBufferSource();
        src.buffer = buffers[kind]; src.connect(master); src.start(Math.max(audio.currentTime, at));
        return src;
    }
    function cancel(id) {
        (scheduled.get(id) || []).forEach(n => { try { n.stop(0); n.disconnect(); } catch (e) { /* already done */ } });
        scheduled.delete(id);
    }
    function cancelAll() { [...scheduled.keys()].forEach(cancel); }
    // burst: also ring straight away for a timer that finished while we were away
    function scheduleAll(burst) {
        cancelAll();
        if (!audio || audio.state !== 'running' || state.settings.sound === 'off') return;
        const kind = state.settings.sound, t0 = now(), ac = audio.currentTime;
        for (const t of state.timers) {
            const ringing = K.isRinging(t, t0);
            if (t.status !== 'running' && !ringing) continue;
            const start = t.status === 'running' ? t.endAt : t.endedAt;
            const base = ac + (start - t0) / 1000, nodes = [];
            for (let s = 0; s < K.LOUD_FOR / 1000; s += 2) if (base + s >= ac - 0.05) nodes.push(play(kind, base + s));
            for (let s = K.LOUD_FOR / 1000; s < K.RING_FOR / 1000; s += 15) if (base + s >= ac - 0.05) nodes.push(play(kind === 'bell' ? 'bell' : 'short', base + s));
            if (burst && ringing && t0 - start > K.LOUD_FOR) for (let s = 0; s < 6; s += 2) nodes.push(play(kind, ac + s));
            scheduled.set(t.id, nodes);
        }
    }
    function soundWarn() {
        const needed = state.settings.sound !== 'off' && state.timers.some(t => t.status === 'running' || K.isRinging(t, now()));
        $('sound-warn').hidden = !(needed && (!audio || audio.state !== 'running'));
    }
    document.addEventListener('pointerdown', ensureAudio, true);
    document.addEventListener('keydown', ensureAudio, true);

    // ---------- screen, vibration, notifications ----------
    let wake = null;
    async function keepAwake() {
        const on = state.settings.awake && state.timers.some(t => t.status === 'running' || K.isRinging(t, now()));
        try {
            if (on && !wake && 'wakeLock' in navigator && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
            else if (!on && wake) { await wake.release(); wake = null; }
        } catch (e) { wake = null; }
    }
    function vibrate() { try { if (state.settings.vibrate && navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) { /* not all phones */ } }
    function notify(t) {
        if (!state.settings.notify || !('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
        const title = t.name + ' is done', opts = { body: 'Multiple Kitchen Timers', icon: 'icons/icon-192.png', tag: SLUG + t.id, requireInteraction: true };
        const plain = () => { try { new Notification(title, opts); } catch (e) { /* Android needs the service worker */ } };
        if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r => r.showNotification(title, opts)).catch(plain); else plain();
    }

    // ---------- messages with Undo ----------
    const msgTimers = {};
    function say(id, text, undo) {
        const el = $(id); el.textContent = '';
        const span = document.createElement('span'); span.textContent = text; el.appendChild(span);
        if (undo) {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'link'; b.textContent = 'Undo';
            b.addEventListener('click', () => { undo(); el.textContent = ''; });
            el.appendChild(b);
        }
        clearTimeout(msgTimers[id]);
        msgTimers[id] = setTimeout(() => { el.textContent = ''; }, undo ? 12000 : 6000);
    }
    const q = s => '“' + s + '”';
    // the timers card is hidden on phones when it is empty, so its messages go under Add a timer then
    const listMsg = () => state.timers.length ? 'list-msg' : 'add-msg';

    // ---------- timers list ----------
    let editing = null;   // id of the timer whose Change form is open
    function stateOf(t, at) { return K.isRinging(t, at) ? 'ringing' : t.status; }
    function btn(text, act, cls) { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.dataset.act = act; b.textContent = text; return b; }

    function timerBox(t, at) {
        const st = stateOf(t, at);
        const li = document.createElement('li');
        li.className = 'tbox ' + st + (st === 'ringing' ? ' done' : '');
        li.dataset.id = t.id;
        const top = document.createElement('div'); top.className = 'ttop';
        const nm = document.createElement('span'); nm.className = 'tname'; nm.textContent = t.name;
        const badge = document.createElement('span'); badge.className = 'tstate';
        badge.textContent = { running: 'Running', paused: 'Paused', ringing: 'Done!', done: 'Done' }[st];
        top.append(nm, badge);
        const time = document.createElement('div'); time.className = 'ttime'; time.setAttribute('role', 'timer'); time.setAttribute('aria-label', t.name + ', time left');
        const bar = document.createElement('div'); bar.className = 'bar'; bar.setAttribute('aria-hidden', 'true'); bar.appendChild(document.createElement('i'));
        const ends = document.createElement('p'); ends.className = 'tends';
        const btns = document.createElement('div'); btns.className = 'tbtns';
        const restartTxt = 'Restart ' + K.fmt(t.length);
        if (st === 'done') btns.append(btn(restartTxt, 'restart', 'primary'), btn('+1 min', 'plus', 'secondary'), btn('Remove', 'remove', 'secondary'));
        else btns.append(btn({ running: 'Pause', paused: 'Resume', ringing: 'Stop alarm' }[st], { running: 'pause', paused: 'resume', ringing: 'stop' }[st], 'primary'),
            btn('+1 min', 'plus', 'secondary'), btn(restartTxt, 'restart', 'secondary'));
        btns.querySelectorAll('button').forEach(b => b.setAttribute('aria-label', b.textContent + ': ' + t.name));
        const more = document.createElement('div'); more.className = 'tmore';
        if (st === 'running' || st === 'paused') more.appendChild(btn('Change', 'edit', 'link'));
        more.appendChild(btn('Save', 'fav', 'link'));
        if (st !== 'done') more.appendChild(btn('Remove', 'remove', 'link rm'));
        more.querySelectorAll('button').forEach(b => b.setAttribute('aria-label', b.textContent + ': ' + t.name));
        li.append(top, time, bar, ends, btns, more);
        if (editing === t.id && (st === 'running' || st === 'paused')) li.appendChild(editForm(t, at));
        return li;
    }

    function editForm(t, at) {
        const f = document.createElement('form'); f.className = 'tedit'; f.noValidate = true;
        const id = 'e-' + t.id, parts = K.splitLength(K.leftOf(t, at));
        const lab = (forId, text) => { const l = document.createElement('label'); l.htmlFor = forId; l.textContent = text; return l; };
        const inp = (iid, val, mode, max) => { const i = document.createElement('input'); i.type = 'text'; i.id = iid; i.value = val; i.maxLength = max; i.autocomplete = 'off'; if (mode) i.inputMode = mode; return i; };
        f.append(lab(id + '-n', 'Name'), inp(id + '-n', t.name, '', 60));
        const p = document.createElement('p'); p.className = 'label-like'; p.textContent = 'Time left';
        const hms = document.createElement('div'); hms.className = 'hms';
        [['h', 'Hours'], ['m', 'Minutes'], ['s', 'Seconds']].forEach(([k, txt]) => {
            const d = document.createElement('div'); d.append(lab(id + '-' + k, txt), inp(id + '-' + k, parts[k] ? String(parts[k]) : '', 'decimal', 5));
            d.querySelector('input').placeholder = '0'; hms.appendChild(d);
        });
        const err = document.createElement('p'); err.className = 'err'; err.setAttribute('role', 'alert');
        const row = document.createElement('div'); row.className = 'row-btns two';
        const ok = document.createElement('button'); ok.type = 'submit'; ok.className = 'primary'; ok.textContent = 'Save changes'; ok.style.marginTop = '0';
        const no = btn('Cancel', 'cancel-edit', 'secondary');
        row.append(ok, no);
        f.append(p, hms, err, row);
        f.addEventListener('submit', e => {
            e.preventDefault();
            const r = K.parseLength($(id + '-h').value, $(id + '-m').value, $(id + '-s').value);
            ['h', 'm', 's'].forEach(k => $(id + '-' + k).removeAttribute('aria-invalid'));
            if (r.error) { err.textContent = r.error; $(id + '-' + r.field).setAttribute('aria-invalid', 'true'); $(id + '-' + r.field).focus(); return; }
            const tm = byId(t.id); if (!tm) return;
            K.change(tm, $(id + '-n').value, r.ms, now());
            editing = null; commit();
            say('list-msg', 'Changed ' + q(tm.name) + (tm.status === 'running' ? ': rings ' + when(tm.endAt) + '.' : ' (still paused).'));
        });
        f.addEventListener('keydown', e => { if (e.key === 'Escape') { editing = null; render(); } });
        return f;
    }

    function render() {
        const at = now();
        // keep what is typed in an open Change form
        const keep = editing ? [...document.querySelectorAll('.tedit input')].map(i => [i.id, i.value]) : [];
        const ae = document.activeElement, inList = ae && ae.closest && ae.closest('#list .tbox');
        const focusKey = inList ? [inList.dataset.id, ae.id, ae.dataset.act] : null;
        const list = $('list'); list.textContent = '';
        K.sorted(state.timers, at).forEach(t => list.appendChild(timerBox(t, at)));
        keep.forEach(([id, v]) => { const i = $(id); if (i) i.value = v; });
        if (focusKey) {
            const box = list.querySelector('.tbox[data-id="' + focusKey[0] + '"]');
            const el = (focusKey[1] && $(focusKey[1])) || (box && (box.querySelector('[data-act="' + focusKey[2] + '"]') || box.querySelector('button')));
            if (el) el.focus();
        }
        const has = state.timers.length > 0;
        $('app').classList.toggle('empty', !has);
        $('timers-empty').hidden = has;
        $('list-tools').hidden = !has;
        $('clear-done').disabled = !state.timers.some(t => t.status === 'done');
        $('stop-all').hidden = state.timers.filter(t => K.isRinging(t, at)).length < 2;
        renderFavs();
        update();
        soundWarn();
        keepAwake();
    }
    // after any change: save, redraw, re-plan the alarms
    function commit() { save(); render(); scheduleAll(false); }

    let lastRingKey = '';
    function update() {
        const at = now();
        const finished = K.tick(state, at);
        const ringKey = state.timers.filter(t => K.isRinging(t, at)).map(t => t.id).join();
        if (finished.length || ringKey !== lastRingKey) {
            lastRingKey = ringKey;
            if (finished.length) {
                save(); onFinish(finished);
            }
            render(); return;   // render calls update again with the new order
        }
        document.querySelectorAll('#list .tbox').forEach(li => {
            const t = byId(li.dataset.id); if (!t) return;
            li.querySelector('.ttime').textContent = K.fmt(K.leftOf(t, at));
            li.querySelector('.bar i').style.width = (K.progress(t, at) * 100).toFixed(1) + '%';
            const st = stateOf(t, at);
            li.querySelector('.tends').textContent = st === 'running' ? 'Ends ' + when(t.endAt)
                : st === 'paused' ? 'Paused. Press Resume to carry on.'
                : st === 'ringing' ? 'Done ' + when(t.endedAt) + '. Press Stop alarm.'
                : K.agoText(at - t.endedAt) + ', ' + when(t.endedAt) + '.';
        });
        // summary line
        const run = state.timers.filter(t => t.status === 'running').sort((a, b) => a.endAt - b.endAt);
        const ring = state.timers.filter(t => K.isRinging(t, at));
        const paused = state.timers.filter(t => t.status === 'paused').length;
        const done = state.timers.filter(t => t.status === 'done' && !K.isRinging(t, at)).length;
        const bits = [];
        if (run.length) bits.push(run.length + ' running');
        if (paused) bits.push(paused + ' paused');
        if (ring.length + done) bits.push(ring.length + done + ' done');
        let text = bits.join(', ');
        if (ring.length) text = ring.map(t => t.name).join(', ') + (ring.length > 1 ? ' are done!' : ' is done!') + (bits.length ? ' (' + text + ')' : '');
        else if (run.length) text += '. Next: ' + run[0].name + ' in ' + K.fmt(K.leftOf(run[0], at)) + '.';
        else if (text) text += '.';
        $('summary').textContent = text;
        // tab title
        if (ring.length) document.title = Math.floor(at / 1000) % 2 ? '⏰ ' + ring.map(t => t.name).join(', ') + ' done!' : BASE_TITLE;
        else if (run.length) document.title = K.fmt(K.leftOf(run[0], at)) + ' ' + run[0].name + ' · Kitchen Timers';
        else document.title = BASE_TITLE;
        lengthText();
    }

    function onFinish(list) {
        vibrate();
        list.forEach(notify);
        $('announce').textContent = list.map(t => t.name).join(', ') + (list.length > 1 ? ' are done.' : ' is done.');
        if (audio && audio.state === 'running' && list.some(t => !scheduled.has(t.id))) scheduleAll(false);
    }

    $('list').addEventListener('click', e => {
        const b = e.target.closest('button[data-act]'); if (!b) return;
        const li = b.closest('.tbox'), t = li && byId(li.dataset.id); if (!t) return;
        const at = now(), act = b.dataset.act;
        if (act === 'pause') { K.pause(t, at); }
        else if (act === 'resume') { K.resume(t, at); }
        else if (act === 'stop') { K.silence(t); cancel(t.id); }
        else if (act === 'plus') { if (!K.addMinute(t, at)) { say('list-msg', 'A timer cannot be longer than 24 hours.'); return; } }
        else if (act === 'restart') { K.restart(t, at); say('list-msg', q(t.name) + ' started again: rings ' + when(t.endAt) + '.'); }
        else if (act === 'edit') { editing = editing === t.id ? null : t.id; render(); const n = $('e-' + t.id + '-n'); if (n) n.focus(); return; }
        else if (act === 'cancel-edit') { editing = null; render(); return; }
        else if (act === 'fav') {
            const r = K.addFav(state, t.name, t.length);
            if (r.error) say('list-msg', r.error);
            else if (r.exists) say('list-msg', q(t.name) + ' ' + K.fmt(t.length) + ' is already in Saved timers.');
            else { save(); renderFavs(); say('list-msg', 'Saved ' + q(t.name) + ' ' + K.fmt(t.length) + ' in Saved timers.'); }
            return;
        }
        else if (act === 'remove') {
            const i = state.timers.indexOf(t);
            state.timers.splice(i, 1); cancel(t.id); if (editing === t.id) editing = null;
            commit();
            say(listMsg(), 'Removed ' + q(t.name) + '.', () => { if (!byId(t.id) && state.timers.length < K.MAX_TIMERS) { state.timers.splice(Math.min(i, state.timers.length), 0, t); commit(); } });
            return;
        }
        if (editing === t.id && t.status === 'done') editing = null;
        commit();
    });
    $('stop-all').addEventListener('click', () => { state.timers.forEach(t => { if (K.silence(t)) cancel(t.id); }); commit(); });
    $('clear-done').addEventListener('click', () => {
        const gone = state.timers.filter(t => t.status === 'done'); if (!gone.length) return;
        state.timers = state.timers.filter(t => t.status !== 'done'); gone.forEach(t => cancel(t.id));
        commit();
        say(listMsg(), 'Removed ' + gone.length + ' finished timer' + (gone.length > 1 ? 's' : '') + '.', () => { state.timers = state.timers.concat(gone.filter(g => !byId(g.id))).slice(0, K.MAX_TIMERS); commit(); });
    });
    $('clear-all').addEventListener('click', () => {
        const gone = state.timers.slice(); if (!gone.length) return;
        state.timers = []; editing = null; cancelAll();
        commit();
        say('add-msg', 'Removed all ' + gone.length + ' timer' + (gone.length > 1 ? 's' : '') + '.', () => { state.timers = gone.concat(state.timers.filter(t => !gone.some(g => g.id === t.id))).slice(0, K.MAX_TIMERS); commit(); });
    });

    // ---------- add a timer ----------
    const hIn = $('len-h-in'), mIn = $('len-m-in'), sIn = $('len-s-in');
    function readLength() { return K.parseLength(hIn.value, mIn.value, sIn.value); }
    function lengthText() {
        const blank = !hIn.value.trim() && !mIn.value.trim() && !sIn.value.trim();
        const r = blank ? null : readLength(), el = $('len-text');
        el.textContent = '';
        if (r && r.ms) {
            el.append('Rings ');
            const b = document.createElement('b'); b.textContent = when(now() + r.ms); el.append(b, ', ' + K.fmtWords(r.ms) + ' from when you press Start.');
        } else el.textContent = 'Tap a length above, or type your own (up to 24 hours).';
    }
    function markPresets() {
        const r = readLength();
        document.querySelectorAll('.preset').forEach(p => p.setAttribute('aria-pressed', String(!!r.ms && Number(p.dataset.ms) === r.ms)));
    }
    document.querySelectorAll('.preset').forEach(p => p.addEventListener('click', () => {
        const parts = K.splitLength(Number(p.dataset.ms));
        hIn.value = parts.h ? String(parts.h) : ''; mIn.value = parts.m ? String(parts.m) : ''; sIn.value = parts.s ? String(parts.s) : '';
        [hIn, mIn, sIn].forEach(i => i.removeAttribute('aria-invalid')); $('add-err').textContent = '';
        markPresets(); lengthText();
    }));
    [hIn, mIn, sIn].forEach(i => i.addEventListener('input', () => { i.removeAttribute('aria-invalid'); $('add-err').textContent = ''; markPresets(); lengthText(); }));
    $('add-form').addEventListener('submit', e => {
        e.preventDefault();
        ensureAudio();
        const r = readLength();
        [hIn, mIn, sIn].forEach(i => i.removeAttribute('aria-invalid'));
        if (r.error) {
            $('add-err').textContent = r.error;
            const f = { h: hIn, m: mIn, s: sIn }[r.field]; f.setAttribute('aria-invalid', 'true');
            if (r.field !== 'm' || hIn.value.trim() || mIn.value.trim() || sIn.value.trim()) f.focus();
            return;
        }
        const res = K.addTimer(state, $('name').value, r.ms, now());
        if (res.error) { $('add-err').textContent = res.error; return; }
        const t = res.timer;
        let extra = '';
        if ($('add-save').checked) {
            const f = K.addFav(state, t.name, r.ms);
            extra = f.fav ? ' Kept in Saved timers.' : f.exists ? ' It is already in Saved timers.' : ' ' + f.error;
            $('add-save').checked = false;
        }
        $('name').value = '';
        $('add-err').textContent = '';
        commit();
        flash(t.id);
        say('add-msg', q(t.name) + ' started. Rings ' + when(t.endAt) + '.' + extra, () => removeById(t.id));
    });
    function removeById(id) { const t = byId(id); if (!t) return; state.timers = state.timers.filter(x => x !== t); cancel(id); commit(); }
    function flash(id) { const li = document.querySelector('.tbox[data-id="' + id + '"]'); if (li) li.classList.add('fresh'); }

    // ---------- saved timers ----------
    function renderFavs() {
        const ul = $('favs'); ul.textContent = '';
        state.favs.forEach(f => {
            const li = document.createElement('li'); li.className = 'fav'; li.dataset.id = f.id;
            const go = document.createElement('button'); go.type = 'button'; go.className = 'fav-go'; go.dataset.act = 'go';
            const b = document.createElement('b'); b.textContent = f.name;
            const s = document.createElement('span'); s.textContent = K.fmt(f.ms);
            go.append(b, s); go.setAttribute('aria-label', 'Start ' + f.name + ', ' + K.fmtWords(f.ms));
            const del = document.createElement('button'); del.type = 'button'; del.className = 'fav-del'; del.dataset.act = 'del'; del.textContent = '×';
            del.setAttribute('aria-label', 'Remove ' + f.name + ' from Saved timers');
            li.append(go, del); ul.appendChild(li);
        });
        $('favs-empty').hidden = state.favs.length > 0;
        $('starters').hidden = state.favs.length > 0;
    }
    $('favs').addEventListener('click', e => {
        const b = e.target.closest('button[data-act]'); if (!b) return;
        const li = b.closest('.fav'), f = state.favs.find(x => x.id === li.dataset.id); if (!f) return;
        if (b.dataset.act === 'go') {
            ensureAudio();
            const r = K.addTimer(state, f.name, f.ms, now());
            if (r.error) { say('fav-msg', r.error); return; }
            commit(); flash(r.timer.id);
            say('fav-msg', q(f.name) + ' started. Rings ' + when(r.timer.endAt) + '.', () => removeById(r.timer.id));
        } else {
            const i = state.favs.indexOf(f);
            state.favs.splice(i, 1); save(); renderFavs();
            say('fav-msg', 'Removed ' + q(f.name) + ' from Saved timers.', () => { if (!state.favs.some(x => x.id === f.id)) { state.favs.splice(Math.min(i, state.favs.length), 0, f); save(); renderFavs(); } });
        }
    });
    $('starters').addEventListener('click', () => { state.favs = K.starterFavs(state); save(); renderFavs(); say('fav-msg', 'The example timers are back.'); });

    // ---------- settings ----------
    function showSettings() {
        $('s-sound').value = state.settings.sound;
        for (const k of ['vibrate', 'awake', 'notify']) $('s-' + k).checked = state.settings[k];
        if (!('Notification' in window)) { $('s-notify').disabled = true; $('s-notify').checked = false; }
        if (!('wakeLock' in navigator)) $('s-awake').disabled = true;
        if (!navigator.vibrate) $('s-vibrate').disabled = true;
    }
    $('s-sound').addEventListener('change', () => { state.settings.sound = $('s-sound').value; save(); ensureAudio(); scheduleAll(false); soundWarn(); say('set-msg', 'Saved.'); });
    $('test-sound').addEventListener('click', () => {
        ensureAudio();
        if (state.settings.sound === 'off') { say('set-msg', 'Sound is set to No sound. Choose Loud beeps or Bell to hear the alarm.'); return; }
        if (!audio) { say('set-msg', 'This browser cannot play sound.'); return; }
        const go = () => play(state.settings.sound, audio.currentTime + 0.05);
        if (audio.state === 'running') go(); else audio.resume().then(go).catch(() => say('set-msg', 'The browser blocked the sound. Tap Play again.'));
    });
    for (const k of ['vibrate', 'awake']) $('s-' + k).addEventListener('change', () => { state.settings[k] = $('s-' + k).checked; save(); keepAwake(); if (k === 'vibrate' && state.settings.vibrate) vibrate(); say('set-msg', 'Saved.'); });
    $('s-notify').addEventListener('change', async () => {
        const cb = $('s-notify');
        if (!cb.checked) { state.settings.notify = false; save(); say('set-msg', 'Notifications off.'); return; }
        let perm = 'denied';
        try { perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission(); } catch (e) { perm = 'denied'; }
        if (perm === 'granted') { state.settings.notify = true; save(); say('set-msg', 'You will get a notification when a timer is done and this page is in the background.'); }
        else { cb.checked = false; state.settings.notify = false; save(); say('set-msg', 'The browser did not allow notifications. You can allow them in the browser settings for this site.'); }
    });
    $('sound-on').addEventListener('click', () => { ensureAudio(); setTimeout(soundWarn, 300); });

    // ---------- coming back, other tabs, clock ----------
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { update(); keepAwake(); if (audio && audio.state !== 'running') audio.resume().catch(() => {}); scheduleAll(true); soundWarn(); }
    });
    window.addEventListener('storage', e => {
        if (e.key !== KEY || e.newValue == null) return;
        state = K.sanitize(e.newValue); editing = null; render(); scheduleAll(false);
    });
    showSettings();
    lastRingKey = state.timers.filter(t => K.isRinging(t, now())).map(t => t.id).join();
    render();
    save();
    setInterval(update, 250);
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
