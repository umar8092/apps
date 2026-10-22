// Intermittent Fasting Timer: the page. All maths lives in core.js (window.Fast).
(function () {
    'use strict';
    const F = window.Fast, KEY = 'intermittent-fasting-timer-with-history.data';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const SHOW_FIRST = 20;

    let data = F.emptyData(), canSave = true, undoSnap = null, showAll = false, editing = null, formMode = null, lastMinute = -1;

    // ---------- saving ----------
    function load() {
        let raw = null, had = false;
        try { raw = localStorage.getItem(KEY); had = raw !== null; } catch (e) { canSave = false; }
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
        data = F.cleanData(parsed, Date.now()).data;
        if (!had) {
            try { data.settings.h12 = !!new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12; } catch (e) { /* keep 24-hour */ }
        }
        if (!canSave) $('storage-warn').hidden = false;
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(data)); canSave = true; $('storage-warn').hidden = true; }
        catch (e) { canSave = false; $('storage-warn').hidden = false; }
    }
    function remember() { undoSnap = JSON.stringify(data); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    function say(box, text, withUndo) {
        ['timer-msg', 'plan-msg', 'week-msg', 'hist-msg', 'set-msg'].forEach(id => { if (id !== box) $(id).textContent = ''; });
        const m = $(box);
        m.textContent = '';
        m.appendChild(el('span', '', text));
        if (withUndo && undoSnap) {
            const b = el('button', 'link', 'Undo');
            b.type = 'button';
            b.addEventListener('click', () => {
                const snap = undoSnap; undoSnap = null;
                data = F.cleanData(JSON.parse(snap), Date.now()).data;
                editing = null; closeTimerForm();
                commit();
                say(box, 'Undone.');
            });
            m.appendChild(b);
        }
    }

    // ---------- timer card ----------
    const h12 = () => data.settings.h12;
    function renderTimer(now) {
        const s = F.status(data, now), card = $('timer');
        card.dataset.mode = s.mode;
        card.classList.toggle('reached', s.mode === 'fasting' && s.reached);
        const fg = $('ring-fg');
        let pct = 0;
        if (s.mode === 'fasting') {
            pct = s.pct;
            $('timer-h').textContent = s.reached ? 'Goal reached! You can eat' : 'Fasting';
            $('time').textContent = F.stopwatch(s.elapsed);
            $('time-sub').textContent = 'fasted of ' + F.duration(s.goalMin);
            $('big-line').textContent = s.reached
                ? (s.extraMin ? 'You reached your goal at ' + s.goalText + ' and have fasted ' + F.duration(s.extraMin) + ' extra.' : 'You reached your goal at ' + s.goalText + '.')
                : 'Eat at ' + s.goalText + ', ' + F.duration(s.leftMin) + ' left.';
            $('ends').textContent = 'Started ' + s.startText + '. Goal: ' + F.planName(s.goalMin) + '.' + (s.forgot ? ' Forgot to end it? Tap "I ate earlier".' : '');
            $('go').textContent = 'End fast';
        } else if (s.mode === 'eating') {
            $('timer-h').textContent = s.windowMin ? (s.windowOver ? 'Eating window over' : 'Eating window open') : 'Eating';
            $('time').textContent = F.stopwatch(now - s.last.end);
            $('time-sub').textContent = 'since your last fast';
            pct = s.windowMin ? Math.min(1, (now - s.last.end) / (s.windowMin * F.MIN)) : 0;
            const lastTxt = 'Last fast: ' + F.duration(s.lastMin) + (s.met ? ', goal met.' : ', ' + F.duration(s.last.goalMin - s.lastMin) + ' short of ' + F.duration(s.last.goalMin) + '.');
            $('big-line').textContent = s.windowMin
                ? (s.windowOver ? 'Your ' + F.duration(s.windowMin) + ' eating window ended at ' + s.nextText + '. Start a fast when you finish eating.'
                    : 'Start your next fast by ' + s.nextText + ', ' + F.duration(s.windowLeftMin) + ' left to eat.')
                : 'Start your next fast when you finish eating.';
            $('ends').textContent = lastTxt + ' Ended ' + s.endText + '.';
            $('go').textContent = 'Start fast now';
        } else {
            $('timer-h').textContent = 'Not fasting';
            $('time').textContent = '0:00:00';
            $('time-sub').textContent = 'goal ' + F.duration(data.settings.goalMin);
            $('big-line').textContent = 'Press Start fast now when you finish your last meal.';
            const eatAt = now + data.settings.goalMin * F.MIN;
            $('ends').textContent = 'If you start now you can eat at ' + F.when(eatAt, now, h12()) + '.';
            $('go').textContent = 'Start fast now';
        }
        fg.setAttribute('stroke-dasharray', Math.round(pct * 1000) + ' 1000');
        const fasting = s.mode === 'fasting';
        $('l-earlier').hidden = fasting;
        $('l-start').hidden = !fasting;
        $('l-ended').hidden = !fasting;
        $('l-cancel').hidden = !fasting;
        document.title = fasting ? (s.reached ? 'Goal reached - ' : F.duration(F.minsOf(s.elapsed)) + ' fasted - ') + 'Intermittent Fasting Timer' : 'Intermittent Fasting Timer with History';
        if (fasting) checkGoal(s, now);
    }

    // beep, vibrate and notify once, when the goal is reached while the page is open
    function checkGoal(s, now) {
        const c = data.current;
        if (!s.reached || c.notified) return;
        c.notified = true;
        save();
        if (now - s.goalAt > 2 * F.MIN) return;   // reached while the page was closed: no sound now
        if (data.settings.vibrate) { beep(); try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) { /* not on this device */ } }
        if (data.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
            const text = 'You fasted ' + F.duration(c.goalMin) + '. You can eat now.';
            try {
                if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r => r.showNotification('Fasting goal reached', { body: text, icon: 'icons/icon-192.png' })).catch(() => {});
                else new Notification('Fasting goal reached', { body: text, icon: 'icons/icon-192.png' });
            } catch (e) { /* notifications not allowed here */ }
        }
    }
    let audio = null;
    function beep() {
        try {
            audio = audio || new (window.AudioContext || window.webkitAudioContext)();
            [0, 0.35].forEach(t => {
                const o = audio.createOscillator(), g = audio.createGain();
                o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
                const at = audio.currentTime + t;
                g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.3, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
                o.start(at); o.stop(at + 0.32);
            });
        } catch (e) { /* no sound on this browser */ }
    }
    function unlockAudio() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { /* ignore */ } }

    function startFast(start) {
        remember();
        data.current = { start, goalMin: data.settings.goalMin, notified: false };
        closeTimerForm();
        commit();
        const now = Date.now();
        say('timer-msg', 'Fast started ' + F.when(start, now, h12()) + '. You can eat at ' + F.when(start + data.settings.goalMin * F.MIN, now, h12()) + '.', true);
    }
    function endFast(end) {
        const c = data.current, now = Date.now();
        const r = F.checkFast(data.fasts, { start: c.start, end, goalMin: c.goalMin }, now, h12());
        if (r.error) return r.error;
        remember();
        const f = Object.assign({ id: 'f' + c.start + '-' + Math.floor(Math.random() * 1e6) }, r.fast);
        data.fasts.push(f); F.sortFasts(data.fasts);
        data.current = null;
        closeTimerForm();
        commit();
        const m = F.fastMin(f);
        say('timer-msg', 'Saved: ' + F.duration(m) + (F.isMet(f) ? ', goal met.' : ', ' + F.duration(f.goalMin - m) + ' short of your ' + F.duration(f.goalMin) + ' goal.'), true);
        return null;
    }

    $('go').addEventListener('click', () => {
        unlockAudio();
        const now = Date.now();
        if (data.current) {
            const err = endFast(now);
            if (err) say('timer-msg', err);
            return;
        }
        const r = F.checkStart(data.fasts, now, now, h12());
        if (r.error) { say('timer-msg', r.error); return; }
        startFast(now);
    });

    // one small form for: start earlier / change start / set end time
    const FORM_TEXT = {
        earlier: ['When did you finish eating?', 'Start fast from this time'],
        start: ['When did this fast start?', 'Save start time'],
        ended: ['When did you start eating?', 'End fast at this time']
    };
    function openTimerForm(mode) {
        formMode = mode;
        const now = Date.now(), base = mode === 'start' && data.current ? data.current.start : now;
        $('t-form-h').textContent = FORM_TEXT[mode][0];
        $('t-save').textContent = FORM_TEXT[mode][1];
        $('t-date').value = F.dateInput(base);
        $('t-time').value = F.timeInput(base);
        $('t-date').max = F.dateInput(now);
        $('t-err').textContent = '';
        $('t-form').hidden = false;
        $('t-time').focus();
    }
    function closeTimerForm() { formMode = null; $('t-form').hidden = true; $('t-err').textContent = ''; }
    $('l-earlier').addEventListener('click', () => openTimerForm('earlier'));
    $('l-start').addEventListener('click', () => openTimerForm('start'));
    $('l-ended').addEventListener('click', () => openTimerForm('ended'));
    $('t-cancel').addEventListener('click', closeTimerForm);
    $('t-save').addEventListener('click', () => {
        unlockAudio();
        const t = F.parseLocal($('t-date').value, $('t-time').value), now = Date.now();
        let err = null;
        if (formMode === 'earlier') {
            if (data.current) { closeTimerForm(); return; }
            const r = F.checkStart(data.fasts, t, now, h12());
            if (r.error) err = r.error; else startFast(t);
        } else if (formMode === 'start') {
            if (!data.current) { closeTimerForm(); return; }
            const r = F.checkStart(data.fasts, t, now, h12());
            if (r.error) err = r.error;
            else {
                remember();
                data.current.start = t;
                data.current.notified = F.minsOf(now - t) >= data.current.goalMin;
                closeTimerForm(); commit();
                say('timer-msg', 'Start time changed to ' + F.when(t, now, h12()) + '.', true);
            }
        } else if (formMode === 'ended') {
            if (!data.current) { closeTimerForm(); return; }
            err = t == null ? 'Enter the date and time you started eating.' : endFast(t);
        }
        if (err) $('t-err').textContent = err;
    });
    $('l-cancel').addEventListener('click', () => {
        if (!data.current) return;
        remember();
        data.current = null;
        closeTimerForm(); commit();
        say('timer-msg', 'Fast cancelled and not saved.', true);
    });

    // ---------- plan ----------
    function renderPlan() {
        const box = $('presets'), g = data.settings.goalMin;
        box.textContent = '';
        let matched = false;
        F.PLANS.forEach(p => {
            const on = p.h * 60 === g; if (on) matched = true;
            const b = el('button', 'preset'); b.type = 'button'; b.dataset.min = p.h * 60;
            b.setAttribute('aria-pressed', on);
            b.appendChild(el('b', '', p.name)); b.appendChild(el('span', '', p.hint));
            box.appendChild(b);
        });
        const c = el('button', 'preset'); c.type = 'button'; c.dataset.min = 'custom';
        c.setAttribute('aria-pressed', !matched || !$('custom').hidden);
        c.appendChild(el('b', '', 'Custom')); c.appendChild(el('span', '', matched ? 'Your own hours' : F.duration(g)));
        box.appendChild(c);
        const w = F.windowMin(g);
        $('plan-now').textContent = 'Goal: fast ' + F.duration(g) + (w ? ', then eat within ' + F.duration(w) + '.' : '. No eating window for fasts of 24 hours or more.');
    }
    function setGoal(min) {
        remember();
        data.settings.goalMin = min;
        let extra = '';
        if (data.current && data.current.goalMin !== min) {
            data.current.goalMin = min;
            data.current.notified = F.minsOf(Date.now() - data.current.start) >= min;
            extra = ' This fast\'s goal changed too.';
        }
        commit();
        say('plan-msg', 'Plan set to ' + F.planName(min) + '.' + extra, true);
    }
    $('presets').addEventListener('click', e => {
        const b = e.target.closest('.preset'); if (!b) return;
        if (b.dataset.min === 'custom') {
            $('custom').hidden = false;
            const g = data.settings.goalMin;
            $('c-h').value = String(Math.floor(g / 60)); $('c-m').value = g % 60 ? String(g % 60) : '';
            $('c-err').textContent = '';
            renderPlan(); $('c-h').focus();
            return;
        }
        $('custom').hidden = true;
        setGoal(+b.dataset.min);
    });
    $('c-save').addEventListener('click', () => {
        const g = F.parseGoal($('c-h').value, $('c-m').value);
        if (g == null) { $('c-err').textContent = 'Enter hours from 1 to 168, and minutes from 0 to 59.'; $('c-h').setAttribute('aria-invalid', 'true'); return; }
        $('c-h').removeAttribute('aria-invalid'); $('c-err').textContent = '';
        $('custom').hidden = true;
        setGoal(g);
    });
    ['c-h', 'c-m'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('c-save').click(); }));

    // ---------- week ----------
    function renderWeek(now) {
        const w = F.week(data.fasts, now), st = $('stats');
        st.textContent = '';
        const stat = (big, small) => { const d = el('div', 'stat'); d.appendChild(el('b', '', big)); d.appendChild(el('span', '', small)); st.appendChild(d); };
        stat(String(w.count), w.count === 1 ? 'fast' : 'fasts');
        stat(w.met + ' of ' + w.count, 'met the goal');
        stat(w.count ? F.duration(w.avgMin) : '-', 'average');
        stat(w.count ? F.duration(w.longestWeekMin) : '-', 'longest');
        stat(F.plural(w.streak, 'day'), 'streak');
        stat(w.longestEver ? F.duration(F.fastMin(w.longestEver)) : '-', 'longest ever');
        const bars = $('bars'), top = Math.max(1, data.settings.goalMin, ...w.days.map(d => d.mins), ...w.days.map(d => d.goalMin));
        bars.textContent = '';
        w.days.forEach(d => {
            const b = el('div', 'day-bar' + (d.today ? ' today' : '')); b.setAttribute('role', 'listitem');
            b.setAttribute('aria-label', (d.today ? 'Today' : F.dateLabel(new Date(d.key + 'T12:00').getTime())) + ': ' + (d.mins ? F.duration(d.mins) + (d.met ? ', goal met' : ', short of the goal') : 'no fast'));
            const col = el('span', 'col');
            if (d.mins) { const i = el('i', d.met ? 'met' : 'short'); i.style.height = Math.max(4, Math.round(d.mins / top * 100)) + '%'; col.appendChild(i); }
            const gl = el('u', 'goal-line'); gl.style.bottom = Math.round((d.goalMin || data.settings.goalMin) / top * 100) + '%'; col.appendChild(gl);
            b.appendChild(el('span', 'val', d.mins ? Math.floor(d.mins / 60) + 'h' : '')); b.appendChild(col); b.appendChild(el('span', 'lbl', d.label));
            bars.appendChild(b);
        });
        const text = F.summaryText(data, now);
        $('email').href = 'mailto:?subject=' + encodeURIComponent('My fasting, last 7 days') + '&body=' + encodeURIComponent(text);
    }
    $('copy').addEventListener('click', () => {
        const text = F.summaryText(data, Date.now());
        const ok = () => say('week-msg', 'Summary copied. Paste it anywhere.');
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let done = false; try { done = document.execCommand('copy'); } catch (e) { done = false; }
            t.remove();
            if (done) ok(); else say('week-msg', 'Copy is blocked here. Use Email summary instead.');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
    });

    // ---------- history ----------
    function fastForm(f, onSave, onCancel, saveText) {
        const now = Date.now(), wrap = el('div', 'fast-form'), id = f ? f.id : 'new';
        const pairRow = (label, prefix, ms) => {
            const fs = el('fieldset', 'dt'); fs.appendChild(el('legend', '', label));
            const p = el('div', 'pair');
            [['date', 'Date', F.dateInput(ms)], ['time', 'Time', F.timeInput(ms)]].forEach(([type, lab, val]) => {
                const d = el('div'), l = el('label', '', lab), i = el('input'); i.type = type; i.id = id + '-' + prefix + '-' + type; l.htmlFor = i.id; i.value = val;
                if (type === 'date') i.max = F.dateInput(now);
                d.appendChild(l); d.appendChild(i); p.appendChild(d);
            });
            fs.appendChild(p); wrap.appendChild(fs);
        };
        const s0 = f ? f.start : now - (data.settings.goalMin + 60) * F.MIN, e0 = f ? f.end : now - 60 * F.MIN;
        pairRow('Started (last meal)', 's', s0);
        pairRow('Ended (first meal)', 'e', e0);
        const g = el('label', '', 'Goal (hours)'), gi = el('input'); gi.type = 'text'; gi.inputMode = 'decimal'; gi.maxLength = 6; gi.id = id + '-goal'; g.htmlFor = gi.id; gi.autocomplete = 'off';
        const gm = f ? f.goalMin : data.settings.goalMin; gi.value = String(Math.round(gm / 60 * 100) / 100);
        wrap.appendChild(g); wrap.appendChild(gi);
        const noteBox = el('div', 'field'), nl = el('label', '', 'Note'), ni = el('input'); ni.type = 'text'; ni.maxLength = F.NOTE_MAX; ni.id = id + '-note'; nl.htmlFor = ni.id; ni.autocomplete = 'off'; ni.placeholder = 'e.g. felt great';
        ni.value = f ? f.note : '';
        noteBox.appendChild(nl); noteBox.appendChild(ni);
        const noteBtn = el('button', 'link', '+ Add a note (optional)'); noteBtn.type = 'button';
        if (f && f.note) noteBtn.hidden = true; else noteBox.hidden = true;
        noteBtn.addEventListener('click', () => { noteBox.hidden = false; noteBtn.hidden = true; ni.focus(); });
        wrap.appendChild(noteBtn); wrap.appendChild(noteBox);
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); wrap.appendChild(err);
        const btns = el('div', 'row-btns two'), sb = el('button', 'primary', saveText), cb = el('button', 'secondary', 'Cancel');
        sb.type = cb.type = 'button'; btns.appendChild(sb); btns.appendChild(cb); wrap.appendChild(btns);
        sb.addEventListener('click', () => {
            const v = k => wrap.querySelector('#' + CSS.escape(id + '-' + k)).value;
            const start = F.parseLocal(v('s-date'), v('s-time')), end = F.parseLocal(v('e-date'), v('e-time'));
            const r = F.checkFast(data.fasts, { start, end, goalMin: F.parseGoal(gi.value, ''), note: ni.value }, Date.now(), h12(), f ? f.id : undefined);
            if (!r.error && data.current && r.fast.end > data.current.start) r.error = 'This overlaps the fast you are doing now, which started ' + F.when(data.current.start, Date.now(), h12()) + '.';
            if (r.error) { err.textContent = r.error; return; }
            onSave(r.fast);
        });
        cb.addEventListener('click', onCancel);
        return wrap;
    }
    function renderHistory(now) {
        const list = $('list'), fasts = data.fasts;
        list.textContent = '';
        $('hist-empty').hidden = fasts.length > 0;
        const shown = showAll ? fasts : fasts.slice(0, SHOW_FIRST);
        shown.forEach(f => {
            const li = el('li', 'fast' + (F.isMet(f) ? ' met' : ' short')), m = F.fastMin(f);
            if (editing === f.id) {
                li.appendChild(el('p', 'form-h', 'Edit this fast'));
                li.appendChild(fastForm(f, nf => {
                    remember(); Object.assign(f, nf); F.sortFasts(data.fasts); editing = null; commit();
                    say('hist-msg', 'Fast changed: ' + F.duration(F.fastMin(f)) + '.', true);
                }, () => { editing = null; render(); }, 'Save changes'));
                list.appendChild(li);
                return;
            }
            const top = el('div', 'fast-top');
            top.appendChild(el('span', 'fast-len', F.duration(m)));
            top.appendChild(el('span', 'badge', F.isMet(f) ? 'Goal met' : F.duration(f.goalMin - m) + ' short'));
            li.appendChild(top);
            const sameDay = F.dayKey(f.start) === F.dayKey(f.end);
            li.appendChild(el('p', 'fast-when', F.dateLabel(f.start) + ', ' + F.clock(f.start, h12()) + ' to ' + (sameDay ? '' : F.dateLabel(f.end) + ', ') + F.clock(f.end, h12())));
            li.appendChild(el('p', 'fast-goal', 'Goal ' + F.duration(f.goalMin) + ' (' + F.planName(f.goalMin) + ')'));
            if (f.note) li.appendChild(el('p', 'fast-note', f.note));
            const btns = el('div', 'fast-btns'), eb = el('button', 'secondary small', 'Edit'), db = el('button', 'secondary small', 'Delete');
            eb.type = db.type = 'button';
            eb.setAttribute('aria-label', 'Edit the fast of ' + F.dateLabel(f.end)); db.setAttribute('aria-label', 'Delete the fast of ' + F.dateLabel(f.end));
            eb.addEventListener('click', () => { editing = f.id; render(); const i = $(f.id + '-s-time'); if (i) i.focus(); });
            db.addEventListener('click', () => {
                remember(); data.fasts = data.fasts.filter(x => x.id !== f.id); commit();
                say('hist-msg', 'Fast of ' + F.dateLabel(f.end) + ' deleted.', true);
            });
            btns.appendChild(eb); btns.appendChild(db); li.appendChild(btns);
            list.appendChild(li);
        });
        $('more').hidden = showAll || fasts.length <= SHOW_FIRST;
        $('more').textContent = 'Show all ' + fasts.length + ' fasts';
    }
    $('more').addEventListener('click', () => { showAll = true; render(); });
    $('add-open').addEventListener('click', () => {
        const box = $('add-form');
        box.textContent = '';
        box.appendChild(el('p', 'form-h', 'Add a past fast'));
        box.appendChild(fastForm(null, nf => {
            remember();
            data.fasts.push(Object.assign({ id: 'f' + nf.start + '-' + Math.floor(Math.random() * 1e6) }, nf)); F.sortFasts(data.fasts);
            box.hidden = true; box.textContent = ''; $('add-open').hidden = false; commit();
            say('hist-msg', 'Fast added: ' + F.duration(F.minsOf(nf.end - nf.start)) + '.', true);
        }, () => { box.hidden = true; box.textContent = ''; $('add-open').hidden = false; $('add-open').focus(); }, 'Add fast'));
        box.hidden = false; $('add-open').hidden = true;
        const first = box.querySelector('input'); if (first) first.focus();
    });

    // ---------- settings ----------
    function renderSettings() {
        $('s-clock').value = h12() ? '12' : '24';
        $('s-notify').checked = data.settings.notify;
        $('s-vibrate').checked = data.settings.vibrate;
    }
    $('s-clock').addEventListener('change', () => { data.settings.h12 = $('s-clock').value === '12'; commit(); });
    $('s-vibrate').addEventListener('change', () => { data.settings.vibrate = $('s-vibrate').checked; if (data.settings.vibrate) { unlockAudio(); beep(); } commit(); });
    $('s-notify').addEventListener('change', () => {
        const box = $('s-notify');
        if (!box.checked) { data.settings.notify = false; commit(); return; }
        if (!('Notification' in window)) { box.checked = false; say('set-msg', 'This browser cannot show notifications. Keep "Beep and vibrate" on instead.'); return; }
        const done = p => {
            data.settings.notify = p === 'granted';
            commit();
            say('set-msg', p === 'granted' ? 'You will get a notification when you can eat, while this page is open.' : 'Notifications are blocked for this page. Allow them in your browser settings to use this.');
        };
        if (Notification.permission === 'granted') done('granted');
        else { try { const p = Notification.requestPermission(done); if (p && p.then) p.then(done); } catch (e) { done('denied'); } }
    });
    function download(name, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    $('backup').addEventListener('click', () => {
        download('fasting-backup-' + F.dayKey(Date.now()) + '.json', JSON.stringify(data, null, 1), 'application/json');
        say('set-msg', 'Backup saved with ' + F.plural(data.fasts.length, 'fast') + '.');
    });
    $('csv').addEventListener('click', () => {
        if (!data.fasts.length) { say('set-msg', 'There are no fasts to download yet.'); return; }
        download('fasts-' + F.dayKey(Date.now()) + '.csv', F.csv(data.fasts, h12()), 'text/csv');
        say('set-msg', 'Downloaded ' + F.plural(data.fasts.length, 'fast') + '.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const file = $('restore-file').files[0];
        $('restore-file').value = '';
        if (!file) return;
        if (file.size > 5e6) { say('set-msg', 'That file is too big to be a backup from this app.'); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let parsed;
            try { parsed = JSON.parse(rd.result); } catch (e) { say('set-msg', 'That file is not a backup from this app.'); return; }
            if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.fasts)) { say('set-msg', 'That file is not a backup from this app.'); return; }
            const r = F.cleanData(parsed, Date.now());
            remember();
            data = r.data; editing = null; showAll = false; closeTimerForm();
            commit();
            say('set-msg', 'Restored ' + F.plural(data.fasts.length, 'fast') + '.' + (r.dropped ? ' ' + F.plural(r.dropped, 'entry', 'entries') + ' could not be read and were left out.' : ''), true);
        };
        rd.onerror = () => say('set-msg', 'Could not read that file.');
        rd.readAsText(file);
    });
    $('wipe').addEventListener('click', () => {
        if (!data.fasts.length && !data.current) { say('set-msg', 'There is nothing to delete.'); return; }
        if (!confirm('Delete all ' + F.plural(data.fasts.length, 'fast') + (data.current ? ' and the fast you are doing now' : '') + '? Your plan and settings stay.')) return;
        remember();
        data.fasts = []; data.current = null; editing = null; closeTimerForm();
        commit();
        say('set-msg', 'All fasts deleted.', true);
    });

    // ---------- drawing ----------
    function render() {
        const now = Date.now();
        lastMinute = Math.floor(now / F.MIN);
        renderTimer(now); renderPlan(); renderWeek(now); renderHistory(now); renderSettings();
    }
    function tick() {
        const now = Date.now(), minute = Math.floor(now / F.MIN);
        renderTimer(now);
        if (minute !== lastMinute) { lastMinute = minute; renderWeek(now); }   // stats move with the day; the fasts list is left alone so an open edit form keeps what was typed
    }
    window.addEventListener('storage', e => { if (e.key === KEY) { load(); render(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

    load();
    render();
    setInterval(tick, 1000);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
