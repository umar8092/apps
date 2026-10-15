// Contraction Timer for Labour: page code. The maths lives in core.js (window.CT).
(function () {
    'use strict';
    const KEY = 'contraction-timer-for-labour.state';
    const $ = id => document.getElementById(id);
    const now = () => Date.now();
    let state, firstMetCache = null, canSave = true, undoSnap = null, toastTimer = 0, wakeLock = null, editing = null;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
        state = CT.cleanState(raw);
    }
    function save() {
        firstMetCache = null;
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snap = () => JSON.stringify(state);
    function restore(s) { state = CT.cleanState(JSON.parse(s)); save(); closeForms(); render(); syncRule(); }

    function toast(text, undoable) {
        $('toast-text').textContent = text;
        $('toast-undo').hidden = !undoable;
        $('toast').hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { $('toast').hidden = true; undoSnap = null; }, undoable ? 10000 : 4000);
    }
    function withUndo(text, fn) { const before = snap(); fn(); save(); render(); undoSnap = before; toast(text, true); }
    $('toast-undo').addEventListener('click', () => {
        if (undoSnap) { restore(undoSnap); undoSnap = null; }
        $('toast').hidden = true;
    });

    // ---------- formatting ----------
    function sameDay(a, b) { const x = new Date(a), y = new Date(b); return x.toDateString() === y.toDateString(); }
    function fmtTime(t, secs) {
        const s = new Date(t).toLocaleTimeString([], secs === false ? { hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return sameDay(t, now()) ? s : new Date(t).toLocaleDateString([], { weekday: 'short' }) + ' ' + s;
    }
    const pad = n => String(n).padStart(2, '0');
    function timeValue(t, secs) { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + (secs ? ':' + pad(d.getSeconds()) : ''); }
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

    // ---------- the big button ----------
    function tap() {
        const t = now();
        if (state.running == null) {
            state.running = t; save(); vibrate(40); render();
            return;
        }
        const len = (t - state.running) / 1000;
        if (len > CT.MAX_LEN) { openForgot('That ran for over 10 minutes, so you probably forgot to tap. Type how long it really lasted.'); return; }
        if (len < CT.MIN_LEN) {
            withUndo('Under 5 seconds, so it was not saved.', () => { state.running = null; });
            return;
        }
        state.items.push({ id: newId(), start: state.running, end: t, strength: '' });
        state.running = null; save(); vibrate([30, 60, 30]); closeForgot(); render();
    }
    function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* not supported */ } }
    function newId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
    $('tap').addEventListener('click', tap);

    // forgot to tap when it ended
    function openForgot(err) {
        $('forgot-box').hidden = false; $('forgot').setAttribute('aria-expanded', 'true');
        $('forgot-err').textContent = err || ''; $('forgot-len').focus();
    }
    function closeForgot() {
        $('forgot-box').hidden = true; $('forgot').setAttribute('aria-expanded', 'false');
        $('forgot-len').value = ''; $('forgot-read').textContent = ''; $('forgot-err').textContent = ''; $('forgot-len').removeAttribute('aria-invalid');
    }
    $('forgot').addEventListener('click', () => $('forgot-box').hidden ? openForgot() : closeForgot());
    $('forgot-len').addEventListener('input', () => readBack($('forgot-len'), $('forgot-read')));
    $('forgot-len').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('forgot-save').click(); } });
    $('forgot-save').addEventListener('click', () => {
        if (state.running == null) { closeForgot(); return; }
        const sec = CT.parseLen($('forgot-len').value);
        const c = { id: newId(), start: state.running, end: sec == null ? NaN : state.running + sec * 1000, strength: '' };
        const err = sec == null ? 'Type how long it lasted, for example 1:05 or 50.' : CT.checkOne(state.items, c, now(), fmtTime);
        if (err) { $('forgot-err').textContent = err; $('forgot-len').setAttribute('aria-invalid', 'true'); return; }
        state.items.push(c); state.running = null; save(); closeForgot(); render();
        toast('Saved: lasted ' + CT.fmtLen(sec) + '.', false);
    });
    $('forgot-drop').addEventListener('click', () => { withUndo('Timing thrown away.', () => { state.running = null; }); closeForgot(); });

    function readBack(input, out) {
        const v = input.value.trim(), sec = CT.parseLen(v);
        out.textContent = !v ? '' : sec == null ? 'Type minutes:seconds, for example 1:05, or seconds, for example 50.' : '= ' + CT.fmtWords(sec);
        input.removeAttribute('aria-invalid');
    }

    // strength of the newest contraction
    document.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
        const last = state.items[state.items.length - 1]; if (!last) return;
        last.strength = last.strength === b.dataset.strength ? '' : b.dataset.strength;
        save(); render();
    }));

    // keep the screen on
    async function applyWake() {
        try {
            if (state.wake && document.visibilityState === 'visible' && !wakeLock) {
                wakeLock = await navigator.wakeLock.request('screen');
                wakeLock.addEventListener('release', () => { wakeLock = null; });
            } else if (!state.wake && wakeLock) { await wakeLock.release(); wakeLock = null; }
        } catch (e) { wakeLock = null; }
    }
    if ('wakeLock' in navigator) {
        $('wake-wrap').hidden = false;
        $('wake').addEventListener('change', () => { state.wake = $('wake').checked; save(); applyWake(); });
        document.addEventListener('visibilitychange', applyWake);
    }

    // ---------- edit, add missed, notes ----------
    function closeForms() {
        ['edit-form', 'note-form'].forEach(id => { const f = $(id); f.hidden = true; $('form-home').appendChild(f); });
        editing = null;
    }
    function openEdit(c) {
        closeForms();
        const f = $('edit-form'), add = !c;
        editing = { kind: 'item', id: c ? c.id : null };
        $('edit-h').textContent = add ? 'Add a contraction you missed' : 'Change this contraction';
        $('e-start').value = timeValue(c ? c.start : now() - 60000, true);
        $('e-len').value = c ? CT.fmtLen(Math.round((c.end - c.start) / 1000)) : '';
        $('e-strength').value = c ? c.strength || '' : '';
        $('e-delete').hidden = add;
        $('e-save').textContent = add ? 'Add contraction' : 'Save';
        $('e-err').textContent = ''; ['e-start', 'e-len'].forEach(i => $(i).removeAttribute('aria-invalid'));
        readBack($('e-len'), $('e-read'));
        const host = c ? document.querySelector('[data-id="' + c.id + '"]') : null;
        (host || $('form-home')).appendChild(f);
        f.hidden = false;
        (add ? $('e-start') : $('e-len')).focus();
    }
    $('e-len').addEventListener('input', () => readBack($('e-len'), $('e-read')));
    $('e-cancel').addEventListener('click', closeForms);
    $('edit-form').addEventListener('submit', e => {
        e.preventDefault();
        const old = editing && editing.id ? state.items.find(x => x.id === editing.id) : null;
        const t = now(), start = CT.timeToMs($('e-start').value, old ? old.start : t, t), sec = CT.parseLen($('e-len').value);
        let err = '';
        if (isNaN(start)) { err = 'Choose the time it started.'; $('e-start').setAttribute('aria-invalid', 'true'); }
        else if (sec == null) { err = 'Type how long it lasted, for example 1:05 or 50.'; $('e-len').setAttribute('aria-invalid', 'true'); }
        const c = { id: old ? old.id : newId(), start, end: start + (sec || 0) * 1000, strength: $('e-strength').value };
        if (!err) err = CT.checkOne(state.items, c, t, fmtTime);
        if (!err && state.running != null && c.end > state.running) err = 'That overlaps the contraction you are timing now.';
        if (err) { $('e-err').textContent = err; return; }
        if (old) Object.assign(old, c); else state.items.push(c);
        state.items.sort((a, b) => a.start - b.start);
        save(); closeForms(); render();
        toast(old ? 'Contraction changed.' : 'Contraction added.', false);
    });
    $('e-delete').addEventListener('click', () => {
        const id = editing && editing.id; if (!id) return;
        closeForms();
        withUndo('Contraction deleted.', () => { state.items = state.items.filter(x => x.id !== id); });
    });
    $('add-missed').addEventListener('click', () => openEdit(null));

    function openNote(n) {
        closeForms();
        editing = { kind: 'note', id: n ? n.id : null };
        $('n-h').textContent = n ? 'Change this note' : 'Add a note';
        $('n-kind').value = n ? n.kind : 'waters';
        $('n-at').value = timeValue(n ? n.at : now(), false);
        $('n-text').value = n ? n.text : '';
        $('n-delete').hidden = !n; $('n-err').textContent = '';
        const host = n ? document.querySelector('[data-id="' + n.id + '"]') : null;
        (host || $('form-home')).appendChild($('note-form'));
        $('note-form').hidden = false; $('n-kind').focus();
    }
    $('add-note').addEventListener('click', () => openNote(null));
    $('n-cancel').addEventListener('click', closeForms);
    $('note-form').addEventListener('submit', e => {
        e.preventDefault();
        const old = editing && editing.id ? state.notes.find(x => x.id === editing.id) : null, t = now();
        let at = CT.timeToMs($('n-at').value, old ? old.at : t, t);
        if (old && !isNaN(at) && timeValue(at, false) === timeValue(old.at, false)) at = old.at;   // time not changed: keep the seconds
        if (isNaN(at)) { $('n-err').textContent = 'Choose the time it happened.'; return; }
        const n = { id: old ? old.id : newId(), at, kind: $('n-kind').value, text: $('n-text').value.trim().slice(0, 200) };
        if (old) Object.assign(old, n); else state.notes.push(n);
        state.notes.sort((a, b) => a.at - b.at);
        save(); closeForms(); render();
        toast(old ? 'Note changed.' : 'Note added.', false);
    });
    $('n-delete').addEventListener('click', () => {
        const id = editing && editing.id; if (!id) return;
        closeForms();
        withUndo('Note deleted.', () => { state.notes = state.notes.filter(x => x.id !== id); });
    });

    // ---------- the rule ----------
    function syncRule() {
        const r = state.rule;
        $('rule-preset').value = r.preset;
        $('custom').hidden = r.preset !== 'custom';
        $('r-apart').value = +(r.apart / 60).toFixed(2); $('r-last').value = r.last; $('r-hold').value = r.hold;
        $('rule-err').textContent = '';
        $('rule-words').textContent = 'Call when: ' + CT.ruleWords(r) + '.';
    }
    $('rule-preset').addEventListener('change', () => {
        const p = $('rule-preset').value;
        state.rule = CT.cleanRule(p === 'custom' ? Object.assign({}, state.rule, { preset: 'custom' }) : { preset: p });
        save(); syncRule(); render();
    });
    function customChanged() {
        const a = parseFloat($('r-apart').value), l = parseFloat($('r-last').value), h = parseFloat($('r-hold').value);
        const L = CT.LIMITS;
        let err = '';
        if (!(a * 60 >= L.apart[0] && a * 60 <= L.apart[1])) err = 'Apart: type 1 to 15 minutes.';
        else if (!(l >= L.last[0] && l <= L.last[1])) err = 'Lasting: type 20 to 180 seconds.';
        else if (!(h >= L.hold[0] && h <= L.hold[1])) err = 'For: type 10 to 240 minutes.';
        $('rule-err').textContent = err;
        if (err) return;
        state.rule = CT.cleanRule({ preset: 'custom', apart: a * 60, last: l, hold: h });
        save(); $('rule-words').textContent = 'Call when: ' + CT.ruleWords(state.rule) + '.'; render();
    }
    ['r-apart', 'r-last', 'r-hold'].forEach(id => $(id).addEventListener('input', customChanged));

    // ---------- share ----------
    const logText = () => CT.logText(state.items, state.notes, state.rule, now(), t => fmtTime(t));
    function said(t) { $('share-msg').textContent = t; setTimeout(() => { if ($('share-msg').textContent === t) $('share-msg').textContent = ''; }, 5000); }
    $('copy').addEventListener('click', async () => {
        const text = logText();
        try { await navigator.clipboard.writeText(text); said('Copied. Paste it into a message or read it out.'); return; } catch (e) { /* fall back below */ }
        const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        said(ok ? 'Copied. Paste it into a message or read it out.' : 'Could not copy on this browser. Use "Email the log" instead.');
    });
    // the link is filled in just before it is followed, so the log in it is always up to date
    const mailHref = () => { $('email').href = 'mailto:?subject=' + encodeURIComponent('Contraction log') + '&body=' + encodeURIComponent(logText()); };
    ['click', 'focus', 'pointerdown'].forEach(ev => $('email').addEventListener(ev, mailHref));
    if (navigator.share) {
        $('share').hidden = false;
        $('share').addEventListener('click', () => { navigator.share({ title: 'Contraction log', text: logText() }).catch(() => {}); });
    }
    $('reset').addEventListener('click', () => {
        if (!state.items.length && !state.notes.length && state.running == null) { said('The log is already empty.'); return; }
        closeForms(); closeForgot();
        withUndo('Log cleared.', () => { state.items = []; state.notes = []; state.running = null; });
    });

    // ---------- drawing ----------
    function renderTimer(t, r) {
        const running = state.running != null, card = $('timer-card');
        card.classList.toggle('running', running);
        const btn = $('tap');
        btn.textContent = running ? 'Contraction ended' : 'Contraction started';
        btn.classList.toggle('stop', running); btn.classList.toggle('start', !running);
        $('forgot-wrap').hidden = !running;
        if (!running && !$('forgot-box').hidden) closeForgot();
        const last = state.items[state.items.length - 1];
        if (running) {
            const sec = Math.max(0, Math.floor((t - state.running) / 1000));
            $('state-label').textContent = 'Contraction now';
            $('clock').textContent = CT.fmtLen(sec);
            $('tap-hint').textContent = 'Tap when it ends. Started at ' + fmtTime(state.running) + '.';
            const long = sec >= 180;
            $('run-long').hidden = !long;
            if (long) $('run-long').textContent = 'Still going after ' + CT.fmtWords(Math.floor(sec / 60) * 60) + '? Contractions rarely last that long. If it already ended, tap "Forgot to tap when it ended?".';
        } else {
            $('run-long').hidden = true;
            if (last) {
                $('state-label').textContent = 'Since the last one started';
                $('clock').textContent = CT.fmtLen(Math.max(0, Math.floor((t - last.start) / 1000)));
                $('tap-hint').textContent = 'Tap "Contraction started" when the next one begins.';
            } else {
                $('state-label').textContent = 'Ready';
                $('clock').textContent = '0:00';
                $('tap-hint').textContent = 'Tap the moment a contraction begins.';
            }
        }
        $('last-box').hidden = running || !last;
        if (last && !running) {
            const withA = CT.withApart(state.items), l = withA[withA.length - 1];
            $('last-line').textContent = 'Last one: lasted ' + CT.fmtLen(l.len) + (l.apart != null ? ', ' + CT.fmtLen(l.apart) + ' after the one before' : ' (your first one)') + '.';
            document.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(last.strength === b.dataset.strength)));
        }
    }

    let lastHead = '';
    function renderVerdict(t, r) {
        const rule = r.rule, v = $('verdict');
        let head, text = '';
        v.classList.toggle('met', r.met); v.classList.toggle('paused', !r.met && r.paused);
        if (!r.total) {
            head = 'Time a few contractions to find out.';
            text = 'After 3 or more you will see how far apart they are and how long they last, compared with your ' + rule.label + ' rule.';
        } else if (r.met) {
            head = 'Your ' + rule.label + ' rule is reached. Call your midwife or hospital now.';
            text = 'Over ' + CT.lastWords(rule.hold) + ' your contractions came every ' + CT.fmtLen(r.avgApart) + ' on average and lasted ' + CT.fmtLen(r.avgLen) + '.';
        } else if (r.paused) {
            head = 'Your contractions have slowed down or stopped.';
            text = 'The last one started ' + CT.fmtWords(Math.floor(r.sinceLast / 60) * 60) + ' ago. Keep timing if they start again. Call if you are worried.';
        } else if (r.total < 3 || r.avgApart == null) {
            head = 'Not yet. Keep timing.';
            text = 'Time at least 3 contractions to see a pattern.';
        } else {
            head = 'Not yet. Keep timing.';
            const miss = [];
            if (!r.okApart) miss.push('they are further apart than ' + CT.fmtLen(rule.apart));
            if (!r.okLen) miss.push('they last less than ' + CT.fmtLen(rule.last));
            if (!r.okHold) miss.push('you have timed ' + CT.fmtWords(Math.floor(r.timedFor / 60) * 60 || r.timedFor) + ' of the ' + CT.holdWords(rule.hold) + ' needed');
            if (miss.length === 0) miss.push('time a few more');
            text = 'Your ' + rule.label + ' rule is not reached because ' + miss.join(', and ') + '.';
        }
        if (head !== lastHead) { $('v-head').textContent = head; lastHead = head; }
        $('v-text').textContent = text;
        const showChecks = r.total >= 2 && r.avgApart != null;
        $('v-checks').hidden = !showChecks;
        if (showChecks) {
            setCheck('c-apart', r.okApart, 'Every ' + CT.fmtLen(r.avgApart) + ' on average', 'your rule: ' + CT.fmtLen(rule.apart) + ' or closer');
            setCheck('c-len', r.okLen, 'Lasting ' + CT.fmtLen(r.avgLen) + ' on average', 'your rule: ' + CT.fmtLen(rule.last) + ' or longer');
            setCheck('c-hold', r.okHold, 'Timing for ' + CT.fmtWords(r.okHold ? r.timedFor : Math.floor(r.timedFor / 60) * 60 || r.timedFor), 'your rule: ' + CT.holdWords(rule.hold) + ' or more');
        }
        if (!firstMetCache) firstMetCache = { v: r.total ? CT.firstMet(state.items, rule) : null };   // cleared by save()
        const fm = firstMetCache.v;
        $('v-first').textContent = fm ? 'Rule first reached at ' + fmtTime(fm, false) + '.' : r.count ? 'Based on the ' + r.count + ' contraction' + (r.count === 1 ? '' : 's') + ' that started in ' + CT.lastWords(rule.hold) + '.' : '';
        const waters = state.notes.filter(n => n.kind === 'waters').pop();
        $('v-waters').hidden = !waters;
        if (waters) $('v-waters').textContent = 'You noted your waters broke at ' + fmtTime(waters.at, false) + '. Most midwives and hospitals want a call when waters break, even without contractions.';
    }
    function setCheck(id, ok, main, rule) {
        const li = $(id); li.className = ok ? 'ok' : 'no';
        li.querySelector('.ctext').textContent = main + ' (' + rule + ')';
        li.querySelector('.mark').setAttribute('aria-label', ok ? 'Met' : 'Not met');
        li.setAttribute('aria-label', (ok ? 'Met: ' : 'Not met: ') + main + ', ' + rule);
    }

    function renderLog() {
        const list = $('items'), keep = editing && !$( editing.kind === 'note' ? 'note-form' : 'edit-form').hidden ? editing : null;
        const form = keep ? $(keep.kind === 'note' ? 'note-form' : 'edit-form') : null;
        if (form) $('form-home').appendChild(form);
        list.textContent = '';
        const withA = CT.withApart(state.items);
        const rows = withA.map((c, i) => ({ t: c.start, c, n: i + 1 })).concat(state.notes.map(n => ({ t: n.at, note: n }))).sort((a, b) => b.t - a.t);
        const brk = Math.max(30 * 60, 2 * state.rule.apart);
        rows.forEach(row => {
            const li = el('li', 'item');
            if (row.c) {
                const c = row.c; li.dataset.id = c.id;
                const top = el('div', 'item-top');
                top.append(el('span', 'item-no', '#' + row.n), el('span', 'item-time', fmtTime(c.start)));
                const b = el('button', 'secondary', 'Change'); b.type = 'button';
                b.setAttribute('aria-label', 'Change the contraction at ' + fmtTime(c.start));
                b.addEventListener('click', () => openEdit(state.items.find(x => x.id === c.id)));
                top.append(b);
                const facts = el('div', 'item-facts');
                const fact = (lbl, val) => { const s = el('span'); s.append(el('span', 'lbl', lbl + ' '), el('b', null, val)); return s; };
                facts.append(fact('Lasted', CT.fmtLen(c.len)));
                facts.append(c.apart != null ? fact('Apart', c.apart > brk ? CT.fmtWords(c.apart) + ' (new stretch)' : CT.fmtLen(c.apart)) : fact('Apart', 'first one'));
                if (c.strength) facts.append(fact('Strength', CT.STRENGTHS[c.strength]));
                li.append(top, facts);
            } else {
                const n = row.note; li.classList.add('note'); li.dataset.id = n.id;
                const top = el('div', 'item-top');
                top.append(el('span', 'item-time', fmtTime(n.at, false)), el('span', 'note-what', CT.KINDS[n.kind] === 'Note' ? 'Note' : CT.KINDS[n.kind]));
                const b = el('button', 'secondary', 'Change'); b.type = 'button';
                b.setAttribute('aria-label', 'Change the note at ' + fmtTime(n.at, false));
                b.addEventListener('click', () => openNote(state.notes.find(x => x.id === n.id)));
                top.append(b);
                li.append(top);
                if (n.text) li.append(el('p', 'note-text', n.text));
            }
            list.append(li);
        });
        $('log-empty').hidden = rows.length > 0;
        $('log-count').textContent = state.items.length ? '(' + state.items.length + ')' : '';
        if (form) {
            const host = keep.id ? list.querySelector('[data-id="' + keep.id + '"]') : null;
            if (keep.id && !host) closeForms(); else (host || $('form-home')).appendChild(form);
        }
    }

    function render() {
        const r = evalNow();
        renderTimer(r.t, r); renderVerdict(r.t, r); renderLog();
        $('wake').checked = state.wake;
    }
    function tick() { const r = evalNow(); renderTimer(r.t, r); renderVerdict(r.t, r); }
    function evalNow() {
        const t = now(), r = CT.evaluate(state.items, state.rule, t);
        if (state.running != null) r.paused = false;   // one is happening now, so they have not stopped
        r.t = t; return r;
    }

    // another tab changed the log
    window.addEventListener('storage', e => { if (e.key === KEY) { load(); firstMetCache = null; render(); syncRule(); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && editing) closeForms(); });

    load(); save(); syncRule(); render(); applyWake();
    setInterval(tick, 250);   // 4 times a second, so the clock never lags a whole second

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
})();
