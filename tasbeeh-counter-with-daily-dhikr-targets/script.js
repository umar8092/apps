// Tasbeeh Counter with Daily Dhikr Targets: the page. The counting rules live in core.js.
(function () {
    'use strict';
    const C = window.TasbeehCore;
    const KEY = 'tasbeeh-counter-with-daily-dhikr-targets.state';
    const $ = id => document.getElementById(id);
    const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Mon first
    const OWN = 'own';

    let state, today, editing = null, draftSteps = [], showDays = 7, wakeLock = null, flashTimer = 0, goalTimer = 0;

    // ---------- saving ----------
    let readProblem = false;
    function read() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) { const s = C.load(raw); if (s) return s; readProblem = true; }
        } catch (e) { $('storage-warn').hidden = false; }
        return C.starter();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { $('storage-warn').hidden = false; }
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(s) { const x = C.load(s); if (x) { state = x; save(); refreshDay(); renderAll(); } }

    // ---------- small helpers ----------
    const active = () => state.items.find(i => i.id === state.active) || null;
    function refreshDay() { const d = C.dayKey(new Date(), state.settings.dayStart); const changed = d !== today; today = d; return changed; }
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
    function msg(box, text, undo) {
        box.textContent = '';
        box.className = 'msg show';
        box.appendChild(el('span', '', text));
        if (undo) {
            const b = el('button', 'undo', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { undo(); msg(box, 'Undone.'); });
            box.appendChild(b);
        }
    }
    function clearMsg(box) { box.textContent = ''; box.className = 'msg'; }
    function kindBadge(it) {
        if (it.kind === 'set') return C.plural(it.rounds, 'round', 'rounds') + ' a day';
        if (it.kind === 'goal') return 'Big goal';
        return it.days ? 'Target ' + C.daysText(it) : 'Every day';
    }
    function doneToday(it) {
        if (it.kind === 'goal') return C.goalStatus(state, it, today).left === 0;
        const t = C.dayTarget(it, today);
        return t > 0 && C.countOn(state, today, it.id) >= t;
    }
    function progress(it) {
        const n = C.countOn(state, today, it.id);
        if (it.kind === 'goal') { const g = C.goalStatus(state, it, today); return g.done / g.total; }
        const t = C.dayTarget(it, today);
        return t ? n / t : 0;
    }
    function barSet(bar, p, good) { bar.style.width = Math.max(0, Math.min(100, p * 100)).toFixed(1) + '%'; bar.parentNode.classList.toggle('good', !!good); }
    function streakText(it) { const s = C.streak(state, it, today); return s ? C.plural(s, 'day', 'days') + ' in a row' : ''; }
    function goalExtra(it) {
        const g = C.goalStatus(state, it, today), parts = ['Today: ' + C.fmt(C.countOn(state, today, it.id))];
        if (it.by && g.left) parts.push(g.daysLeft > 0 ? C.fmt(g.perDay) + ' a day to finish by ' + C.fmtDate(it.by) : 'The date ' + C.fmtDate(it.by) + ' has passed');
        if (g.split) parts.push('Shared by ' + g.split.people + ': ' + C.splitText(g.split));
        return parts.join(' · ');
    }

    // ---------- drawing ----------
    function renderPick() {
        const box = $('pick'); box.textContent = '';
        state.items.forEach(it => {
            const b = el('button', 'chip', it.name); b.type = 'button';
            b.setAttribute('aria-pressed', String(it.id === state.active));
            if (doneToday(it)) { const ok = el('span', 'ok', '✓'); ok.setAttribute('aria-hidden', 'true'); b.appendChild(ok); b.setAttribute('aria-label', it.name + ' (done today)'); }
            b.addEventListener('click', () => { state.active = it.id; save(); closeFix(); clearMsg($('c-msg')); renderAll(); });
            box.appendChild(b);
        });
    }

    function current() {
        const it = active(); if (!it) return null;
        const n = C.countOn(state, today, it.id), out = { it, n, ar: it.arabic, step: '', big: n, sub: '', line: C.todayLine(state, it, today), extra: '', good: doneToday(it), none: false };
        if (it.kind === 'set') {
            const p = C.setPosition(it, n), s = it.steps[p.step];
            out.ar = s.arabic; out.step = 'Now: ' + s.name + (it.steps.length > 1 ? ' (' + (p.step + 1) + ' of ' + it.steps.length + ')' : '');
            out.big = p.inStep; out.sub = 'of ' + C.fmt(p.stepCount);
            const week = C.sumDays(state, it.id, C.lastDays(state, today, 7));
            out.extra = [streakText(it), 'Last 7 days: ' + C.plural(Math.floor(week / C.roundSize(it)), 'full round', 'full rounds')].filter(Boolean).join(' · ');
        } else if (it.kind === 'goal') {
            const g = C.goalStatus(state, it, today);
            out.big = g.done; out.sub = 'of ' + C.fmt(g.total); out.extra = goalExtra(it);
        } else {
            const t = C.dayTarget(it, today);
            out.sub = t ? 'of ' + C.fmt(t) : 'no target today';
            out.none = !t;
            const week = C.sumDays(state, it.id, C.lastDays(state, today, 7));
            out.extra = [streakText(it), 'Last 7 days: ' + C.fmt(week), it.days ? 'Target ' + C.daysText(it) : ''].filter(Boolean).join(' · ');
        }
        out.p = progress(it);
        return out;
    }

    function renderCur() {
        const c = current();
        $('cur').hidden = !c; $('none').hidden = !!c;
        $('counter').querySelector('.keys').hidden = !c;
        if (!c) { if (!$('focus').hidden) closeFocus(); return; }
        $('cur-name').textContent = c.it.name;
        $('cur-ar').textContent = c.ar || '';
        $('cur-step').textContent = c.step;
        $('tap-n').textContent = C.fmt(c.big);
        $('tap-sub').textContent = c.sub;
        $('tap').setAttribute('aria-label', 'Count one ' + c.it.name + '. ' + C.fmt(c.big) + ' ' + c.sub);
        $('tap').classList.toggle('done', c.good);
        const line = $('cur-line');
        line.textContent = c.line;
        line.className = 'state' + (c.good ? ' good' : c.none ? ' none' : '');
        barSet($('cur-bar'), c.p, c.good);
        $('cur-extra').textContent = c.extra;
        $('fix-round').hidden = c.it.kind !== 'set';
        // full screen view
        $('f-name').textContent = c.it.name;
        $('f-ar').textContent = c.ar || '';
        $('f-step').textContent = c.step;
        $('f-n').textContent = C.fmt(c.big);
        $('f-line').textContent = (c.sub ? c.sub + ' · ' : '') + c.line;
        $('f-tap').setAttribute('aria-label', 'Count one ' + c.it.name + '. ' + C.fmt(c.big) + ' ' + c.sub);
    }

    function renderList() {
        const ul = $('items'); ul.textContent = '';
        state.items.forEach((it, i) => {
            const li = el('li', 'box' + (doneToday(it) ? ' done' : '') + (it.id === state.active ? ' on' : ''));
            const top = el('div', 'b-top');
            top.appendChild(el('h3', 'b-name', it.name));
            top.appendChild(el('span', 'badge', it.id === state.active ? 'Counting now' : kindBadge(it)));
            li.appendChild(top);
            const ar = it.kind === 'set' ? it.steps.map(s => s.arabic).filter(Boolean).join(' · ') : it.arabic;
            if (ar) { const a = el('p', 'b-ar arabic', ar); a.lang = 'ar'; a.dir = 'rtl'; li.appendChild(a); }
            li.appendChild(el('p', 'b-line', C.todayLine(state, it, today)));
            const bar = el('div', 'bar'); bar.setAttribute('aria-hidden', 'true'); const sp = el('span'); bar.appendChild(sp); li.appendChild(bar);
            barSet(sp, progress(it), doneToday(it));
            const sub = [];
            if (it.id === state.active) sub.push(kindBadge(it));
            if (it.kind === 'set') sub.push(it.steps.map(s => s.count).join(' + ') + ' = ' + C.fmt(C.roundSize(it)) + ' a round');
            if (it.kind === 'goal') sub.push(goalExtra(it)); else { const s = streakText(it); if (s) sub.push(s); }
            if (sub.length) li.appendChild(el('p', 'b-sub', sub.join(' · ')));
            const btns = el('div', 'b-btns');
            const up = el('button', 'mini', 'Move up'); up.type = 'button'; up.disabled = i === 0;
            up.setAttribute('aria-label', 'Move ' + it.name + ' up');
            up.addEventListener('click', () => { const a = state.items; [a[i - 1], a[i]] = [a[i], a[i - 1]]; save(); renderAll(); });
            const ed = el('button', 'mini', 'Edit'); ed.type = 'button'; ed.setAttribute('aria-label', 'Edit ' + it.name);
            ed.addEventListener('click', () => openEdit(it));
            const del = el('button', 'mini del', 'Delete'); del.type = 'button'; del.setAttribute('aria-label', 'Delete ' + it.name);
            del.addEventListener('click', () => removeItem(it));
            btns.append(up, ed, del);
            li.appendChild(btns);
            ul.appendChild(li);
        });
        $('add').disabled = state.items.length >= C.LIMITS.items;
    }

    function renderWeek() {
        const week = C.lastDays(state, today, 7), wk = $('week'); wk.textContent = '';
        state.items.forEach(it => {
            const li = el('li');
            li.appendChild(el('span', 'k', it.name));
            const sum = C.sumDays(state, it.id, week);
            li.appendChild(el('span', 'v', C.countText(it, sum)));
            let d;
            if (it.kind === 'goal') { const g = C.goalStatus(state, it, today); d = C.fmt(g.done) + ' of ' + C.fmt(g.total) + ' in all'; }
            else { const m = C.metDays(state, it, week); d = m.of ? 'Target reached on ' + m.met + ' of ' + C.plural(m.of, 'day', 'days') : 'No target these 7 days'; }
            li.appendChild(el('span', 'd', d));
            wk.appendChild(li);
        });
        const ul = $('days'); ul.textContent = '';
        C.lastDays(state, today, showDays).forEach((day, i) => {
            const li = el('li');
            li.appendChild(el('span', 'day', i === 0 ? 'Today' : i === 1 ? 'Yesterday' : C.fmtDate(day)));
            li.appendChild(document.createTextNode(' '));
            const c = el('span', 'c');
            const got = state.items.filter(it => C.countOn(state, day, it.id) > 0);
            if (!got.length) c.textContent = 'Nothing counted';
            got.forEach((it, j) => {
                if (j) c.appendChild(document.createTextNode(' · '));
                c.appendChild(document.createTextNode(it.name + ' '));
                const t = C.dayTarget(it, day), n = C.countOn(state, day, it.id);
                c.appendChild(el('b', '', C.countText(it, n) + (t && n >= t ? ' ✓' : '')));
            });
            li.appendChild(c);
            ul.appendChild(li);
        });
        $('hist').hidden = !state.items.length && !Object.keys(state.log).length;
        $('days-more').textContent = showDays === 7 ? 'Show 30 days' : 'Show 7 days';
        $('days-more').setAttribute('aria-expanded', String(showDays !== 7));
    }

    function renderSettings() {
        $('s-day').value = String(state.settings.dayStart);
        $('s-vib').value = state.settings.vibrate;
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('My dhikr, ' + C.fmtDateY(today)) + '&body=' + encodeURIComponent(C.summary(state, today));
        $('copy').disabled = !state.items.length;
    }

    function renderAll() { renderPick(); renderCur(); renderList(); renderWeek(); renderSettings(); }

    // ---------- counting ----------
    function vibrate(kind) {
        const v = state.settings.vibrate;
        if (v === 'off' || !navigator.vibrate) return;
        try {
            if (kind === 'target') navigator.vibrate([220, 90, 220]);
            else if (kind === 'mark' || kind === 'round') navigator.vibrate(90);
            else if (v === 'every') navigator.vibrate(15);
        } catch (e) { /* not allowed: the flash still shows */ }
    }
    function flash(big) {
        [$('tap'), $('f-tap')].forEach(b => b.classList.add('flash'));
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => [$('tap'), $('f-tap')].forEach(b => b.classList.remove('flash')), big ? 700 : 350);
        if (big) { $('tap').classList.add('goal'); clearTimeout(goalTimer); goalTimer = setTimeout(() => $('tap').classList.remove('goal'), 1400); }
    }
    function count(delta) {
        const it = active(); if (!it) return;
        refreshDay();
        const before = C.countOn(state, today, it.id);
        const box = $('c-msg');
        if (delta < 0 && before === 0) { msg(box, 'Nothing to take back today.'); renderAll(); return; }
        if (delta > 0 && before >= C.LIMITS.count) { msg(box, 'That is the most this counter holds for one day.'); return; }
        C.addCount(state, today, it.id, delta);
        save();
        if (delta > 0) {
            const b = C.buzzAfter(state, it, today);
            vibrate(b);
            if (b) flash(b === 'target');
            const n = C.countOn(state, today, it.id);
            if (b === 'target') {
                msg(box, it.kind === 'goal' ? 'Goal reached: ' + C.fmt(it.total) + ' ' + it.name + '. Alhamdulillah!' : 'Target reached: ' + C.todayLine(state, it, today) + '. Keep going if you like.');
            } else if (it.kind === 'set' && b) {
                const p = C.setPosition(it, n), s = it.steps[p.step];
                msg(box, (b === 'round' ? 'Round ' + p.rounds + ' done. ' : '') + 'Now: ' + s.name + ' (' + s.count + ')');
            } else if (b === 'mark' && box.textContent) clearMsg(box);
        } else if (box.textContent && !box.querySelector('.undo')) clearMsg(box);
        renderAll();
    }
    $('tap').addEventListener('click', () => count(1));
    $('minus').addEventListener('click', () => count(-1));
    $('f-tap').addEventListener('click', () => count(1));
    $('f-minus').addEventListener('click', () => { count(-1); $('f-tap').focus(); });

    // full screen: dark, one big button, screen kept on where the browser allows
    async function openFocus() {
        $('focus').hidden = false;
        document.body.style.overflow = 'hidden';
        $('f-tap').focus();
        try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
    }
    function closeFocus() {
        $('focus').hidden = true;
        document.body.style.overflow = '';
        try { if (wakeLock) wakeLock.release(); } catch (e) { /* already released */ }
        wakeLock = null;
        if (!$('cur').hidden) $('focus-open').focus();
    }
    $('focus-open').addEventListener('click', openFocus);
    $('f-close').addEventListener('click', closeFocus);

    // keys: Space or Enter count, Backspace takes one back (not while typing)
    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
        const t = e.target, inFocus = !$('focus').hidden;
        if (inFocus && e.key === 'Escape') { e.preventDefault(); closeFocus(); return; }
        if (!inFocus && document.querySelector('dialog[open]')) return;
        if (!active()) return;
        const onTap = t === $('tap') || t === $('f-tap');
        if (t !== document.body && t !== document.documentElement && !onTap) return;
        if (e.key === 'Backspace') { e.preventDefault(); count(-1); return; }
        if (onTap) return; // the button counts by itself on Space and Enter
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) count(1); }
    });

    // ---------- change count ----------
    function closeFix() { $('fix').hidden = true; $('fix-open').setAttribute('aria-expanded', 'false'); setErr('fix-n', 'e-fix', ''); $('fix-n').value = ''; }
    $('fix-open').addEventListener('click', () => {
        const open = $('fix').hidden;
        if (!open) return closeFix();
        $('fix').hidden = false; $('fix-open').setAttribute('aria-expanded', 'true'); $('fix-n').focus();
    });
    function setErr(inputId, errId, text) { $(errId).textContent = text; if (text) $(inputId).setAttribute('aria-invalid', 'true'); else $(inputId).removeAttribute('aria-invalid'); }
    function fixNumber(allowZero) {
        const raw = $('fix-n').value.trim(), n = C.readInt(raw);
        if (!raw) { setErr('fix-n', 'e-fix', 'Type a number first, such as 33.'); $('fix-n').focus(); return null; }
        if (isNaN(n) || (!allowZero && n === 0)) { setErr('fix-n', 'e-fix', 'Type a whole number' + (allowZero ? '' : ' above 0') + ', such as 33.'); $('fix-n').focus(); return null; }
        if (n > C.LIMITS.count) { setErr('fix-n', 'e-fix', 'That is too big. The most is ' + C.fmt(C.LIMITS.count) + '.'); return null; }
        setErr('fix-n', 'e-fix', '');
        return n;
    }
    function changeTo(it, n, text) {
        const snap = snapshot();
        C.setCount(state, today, it.id, n);
        save(); renderAll();
        msg($('c-msg'), text, () => restoreSnap(snap));
    }
    $('fix-add').addEventListener('click', () => {
        const it = active(), n = fixNumber(false); if (!it || n === null) return;
        refreshDay();
        const now = C.countOn(state, today, it.id);
        if (now + n > C.LIMITS.count) { setErr('fix-n', 'e-fix', 'That would be more than ' + C.fmt(C.LIMITS.count) + ' today.'); return; }
        changeTo(it, now + n, 'Added ' + C.fmt(n) + ' to ' + it.name + ' today. Today: ' + C.fmt(now + n) + '.');
        $('fix-n').value = '';
    });
    $('fix-set').addEventListener('click', () => {
        const it = active(), n = fixNumber(true); if (!it || n === null) return;
        refreshDay();
        changeTo(it, n, it.name + ' today is now ' + C.fmt(n) + '.');
        $('fix-n').value = '';
    });
    $('fix-round').addEventListener('click', () => {
        const it = active(); if (!it || it.kind !== 'set') return;
        refreshDay();
        const now = C.countOn(state, today, it.id), size = C.roundSize(it);
        if (now + size > C.LIMITS.count) return;
        const snap = snapshot();
        C.setCount(state, today, it.id, now + size);
        save(); renderAll();
        msg($('c-msg'), 'Added one full round. ' + C.todayLine(state, it, today) + '.', () => restoreSnap(snap));
    });
    $('fix-reset').addEventListener('click', () => {
        const it = active(); if (!it) return;
        refreshDay();
        if (!C.countOn(state, today, it.id)) { msg($('c-msg'), it.name + ' is already 0 today.'); return; }
        changeTo(it, 0, it.name + ' today is back to 0.');
    });
    $('fix-n').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('fix-add').click(); } });

    // ---------- list ----------
    function removeItem(it) {
        const snap = snapshot();
        state.items = state.items.filter(i => i.id !== it.id);
        Object.keys(state.log).forEach(d => { delete state.log[d][it.id]; if (!Object.keys(state.log[d]).length) delete state.log[d]; });
        if (state.active === it.id) state.active = state.items[0] ? state.items[0].id : 0;
        if (editing === it.id) closeEdit();
        save(); renderAll();
        msg($('l-msg'), 'Deleted ' + it.name + ' and its counts.', () => restoreSnap(snap));
    }
    $('starter').addEventListener('click', () => {
        const s = C.starter();
        s.items.forEach(it => { it.id = state.nextId++; state.items.push(it); });
        state.active = state.items[0].id;
        save(); renderAll();
        $('tap').focus();
    });
    $('days-more').addEventListener('click', () => { showDays = showDays === 7 ? 30 : 7; renderWeek(); });

    // ---------- add or change a dhikr ----------
    function phraseOptions(select, withOwn) {
        select.textContent = '';
        C.PHRASES.forEach(p => { const o = el('option', '', p.name); o.value = p.key; select.appendChild(o); });
        if (withOwn) { const o = el('option', '', 'My own words'); o.value = OWN; select.appendChild(o); }
    }
    phraseOptions($('e-phrase'), true);
    const keyOfName = name => { const p = C.PHRASES.find(x => x.name === name); return p ? p.key : OWN; };
    const kind = () => document.querySelector('input[name=kind]:checked').value;

    const wk = $('wk');
    WEEK.forEach(d => { const b = el('button', '', C.DAYS[d]); b.type = 'button'; b.dataset.d = d; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', C.LONG_DAYS[d]); b.addEventListener('click', () => { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); $('e-days-err').textContent = ''; }); wk.appendChild(b); });
    const pickedDays = () => [...wk.querySelectorAll('button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => Number(b.dataset.d)).sort();

    function showArabic(text) {
        $('e-ar').value = text || '';
        $('w-ar').hidden = !text; $('o-ar').hidden = !!text; $('o-ar').setAttribute('aria-expanded', String(!!text));
    }
    function showKind() {
        const k = kind();
        $('w-one').hidden = k === 'set'; $('w-ar-one').hidden = k === 'set';
        $('w-daily').hidden = k !== 'daily'; $('w-set').hidden = k !== 'set'; $('w-goal').hidden = k !== 'goal';
    }
    document.querySelectorAll('input[name=kind]').forEach(r => r.addEventListener('change', () => {
        const k = kind();
        if (editing === null) {
            if (k === 'set') $('e-name').value = 'Tasbeeh after prayer (33, 33, 34)';
            else { const p = C.phrase(k === 'goal' ? 'karima' : 'istighfar'); $('e-phrase').value = p.key; $('e-name').value = p.name; showArabic(p.arabic); }
        }
        clearErrors(); showKind();
    }));
    $('e-phrase').addEventListener('change', () => {
        const p = C.phrase($('e-phrase').value);
        if (p) { $('e-name').value = p.name; showArabic(p.arabic); }
        else { $('e-name').value = ''; showArabic(''); $('e-name').focus(); }
    });
    $('o-ar').addEventListener('click', () => { $('w-ar').hidden = false; $('o-ar').hidden = true; $('o-ar').setAttribute('aria-expanded', 'true'); $('e-ar').focus(); });
    $('e-target').addEventListener('change', () => { $('w-target').hidden = $('e-target').value !== 'custom'; if (!$('w-target').hidden) $('e-target-n').focus(); });
    $('e-rounds').addEventListener('change', () => { $('w-rounds').hidden = $('e-rounds').value !== 'custom'; if (!$('w-rounds').hidden) $('e-rounds-n').focus(); });
    document.querySelectorAll('input[name=days]').forEach(r => r.addEventListener('change', () => { $('w-days').hidden = document.querySelector('input[name=days]:checked').value !== 'some'; }));
    function toggle(btn, box, input) { btn.addEventListener('click', () => { const open = box.hidden; box.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) $(input).focus(); }); }
    toggle($('o-by'), $('w-by'), 'e-by');
    toggle($('o-people'), $('w-people'), 'e-people');

    // phrases of a set, each in its own box
    function renderSteps() {
        const ol = $('steps'); ol.textContent = '';
        draftSteps.forEach((s, i) => {
            const li = el('li', 'step');
            const top = el('div', 'step-top');
            top.appendChild(el('h3', '', 'Phrase ' + (i + 1)));
            const rm = el('button', 'mini del', 'Remove'); rm.type = 'button'; rm.disabled = draftSteps.length === 1;
            rm.setAttribute('aria-label', 'Remove phrase ' + (i + 1));
            rm.addEventListener('click', () => { readSteps(); draftSteps.splice(i, 1); renderSteps(); });
            top.appendChild(rm); li.appendChild(top);
            const row = el('div', 'step-row');
            const a = el('div'), b = el('div');
            const la = el('label', '', 'Dhikr'); la.htmlFor = 'st-p' + i;
            const sel = el('select'); sel.id = 'st-p' + i; phraseOptions(sel, true); sel.value = s.key;
            a.append(la, sel);
            const lb = el('label', '', 'How many'); lb.htmlFor = 'st-c' + i;
            const cnt = el('input'); cnt.type = 'text'; cnt.id = 'st-c' + i; cnt.inputMode = 'numeric'; cnt.maxLength = 5; cnt.autocomplete = 'off'; cnt.placeholder = 'e.g. 33'; cnt.value = s.count ? String(s.count) : '';
            b.append(lb, cnt);
            row.append(a, b); li.appendChild(row);
            const wn = el('div', 'opt'); wn.hidden = s.key !== OWN;
            const ln = el('label', '', 'Your words'); ln.htmlFor = 'st-n' + i;
            const nm = el('input'); nm.type = 'text'; nm.id = 'st-n' + i; nm.maxLength = 40; nm.autocomplete = 'off'; nm.placeholder = 'e.g. Ya Latif'; nm.value = s.key === OWN ? s.name : '';
            wn.append(ln, nm); li.appendChild(wn);
            const er = el('p', 'err'); er.id = 'st-e' + i; er.setAttribute('role', 'alert'); li.appendChild(er);
            sel.addEventListener('change', () => { wn.hidden = sel.value !== OWN; if (!wn.hidden) nm.focus(); });
            ol.appendChild(li);
        });
        $('step-add').disabled = draftSteps.length >= C.LIMITS.steps;
    }
    function readSteps() {
        draftSteps = draftSteps.map((s, i) => {
            const key = $('st-p' + i).value, p = C.phrase(key);
            return { key, name: p ? p.name : $('st-n' + i).value, arabic: p ? p.arabic : (key === s.key ? s.arabic : ''), count: $('st-c' + i).value };
        });
    }
    $('step-add').addEventListener('click', () => { readSteps(); draftSteps.push({ key: 'subhanallah', name: 'SubhanAllah', arabic: C.phrase('subhanallah').arabic, count: '' }); renderSteps(); $('st-c' + (draftSteps.length - 1)).focus(); });

    function clearErrors() {
        $('edit-form').querySelectorAll('.err').forEach(e => { e.textContent = ''; });
        $('edit-form').querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    }
    function openEdit(it) {
        editing = it ? it.id : null;
        clearErrors();
        const k = it ? it.kind : 'daily';
        document.getElementById('k-' + k).checked = true;
        $('edit-form').querySelector('.choice').hidden = !!it;
        $('edit-h').textContent = it ? 'Change ' + it.name : 'Add a dhikr';
        $('save').textContent = it ? 'Save changes' : 'Add and start counting';
        const one = it && it.kind !== 'set' ? it : { name: C.phrase('istighfar').name, arabic: C.phrase('istighfar').arabic };
        $('e-phrase').value = keyOfName(one.name);
        $('e-name').value = it ? it.name : one.name;
        showArabic(one.arabic);
        // daily
        const target = it && it.kind === 'daily' ? it.target : 100;
        const preset = ['33', '100', '300', '500', '1000'].includes(String(target));
        $('e-target').value = preset ? String(target) : 'custom';
        $('e-target-n').value = preset ? '' : C.fmt(target);
        $('w-target').hidden = preset;
        const days = it && it.kind === 'daily' ? it.days : null;
        document.getElementById(days ? 'd-some' : 'd-all').checked = true;
        $('w-days').hidden = !days;
        wk.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(!!days && days.includes(Number(b.dataset.d)))));
        $('e-mark').value = String(it && it.kind === 'daily' ? it.mark : 33);
        // set
        const steps = it && it.kind === 'set' ? it.steps : C.fatimahSteps();
        draftSteps = steps.map(s => ({ key: keyOfName(s.name), name: s.name, arabic: s.arabic, count: s.count }));
        renderSteps();
        const rounds = it && it.kind === 'set' ? it.rounds : 5;
        const rp = ['1', '3', '5'].includes(String(rounds));
        $('e-rounds').value = rp ? String(rounds) : 'custom';
        $('e-rounds-n').value = rp ? '' : String(rounds);
        $('w-rounds').hidden = rp;
        // goal
        const g = it && it.kind === 'goal' ? it : null;
        $('e-total').value = g ? C.fmt(g.total) : '';
        $('e-by').value = g && g.by ? g.by : '';
        $('e-by').min = today;
        $('w-by').hidden = !(g && g.by); $('o-by').setAttribute('aria-expanded', String(!$('w-by').hidden));
        $('e-people').value = g && g.people ? String(g.people) : '';
        $('w-people').hidden = !(g && g.people); $('o-people').setAttribute('aria-expanded', String(!$('w-people').hidden));
        $('goal-again').hidden = !g;
        if (it && it.kind === 'set') $('e-name').value = it.name;
        if (!it) $('e-mark').value = '33';
        showKind();
        $('edit').hidden = false;
        $('edit').scrollIntoView({ block: 'start', behavior: 'smooth' });
        (it ? $('e-name') : $('k-daily')).focus({ preventScroll: true });
    }
    function closeEdit() { editing = null; $('edit').hidden = true; }
    $('add').addEventListener('click', () => openEdit(null));
    $('cancel').addEventListener('click', () => { closeEdit(); $('add').focus(); });

    function bad(inputId, errId, text) { $(errId).textContent = text; $(inputId).setAttribute('aria-invalid', 'true'); return inputId; }
    $('edit-form').addEventListener('submit', e => {
        e.preventDefault();
        clearErrors();
        const k = editing !== null ? state.items.find(i => i.id === editing).kind : kind();
        const errors = [];
        const name = C.cleanText($('e-name').value, C.LIMITS.name);
        if (!name) errors.push(bad('e-name', 'e-name-err', k === 'set' ? 'Give this set a name, such as Tasbeeh after prayer.' : 'Type a name, such as Istighfar.'));
        else if (state.items.some(i => i.id !== editing && i.name.toLowerCase() === name.toLowerCase())) errors.push(bad('e-name', 'e-name-err', 'You already have "' + name + '". Give this one another name, such as "' + name + ' (Friday)".'));
        const arabic = C.cleanText($('e-ar').value, C.LIMITS.arabic);
        const item = { id: editing !== null ? editing : state.nextId, kind: k, name };
        if (k === 'daily') {
            let t = Number($('e-target').value);
            if ($('e-target').value === 'custom') {
                t = C.readInt($('e-target-n').value);
                if (!(t >= 1 && t <= C.LIMITS.target)) { errors.push(bad('e-target-n', 'e-target-err', 'Type a whole number from 1 to 1,000,000.')); }
            }
            const some = document.querySelector('input[name=days]:checked').value === 'some', days = pickedDays();
            if (some && !days.length) { $('e-days-err').textContent = 'Tap at least one day, or choose Every day.'; errors.push('d-all'); }
            Object.assign(item, { arabic, target: t, days: some && days.length < 7 ? days : null, mark: Number($('e-mark').value) });
        } else if (k === 'set') {
            readSteps();
            const steps = [];
            draftSteps.forEach((s, i) => {
                const nm = C.cleanText(s.name, C.LIMITS.name), n = C.readInt(s.count);
                if (!nm) { $('st-e' + i).textContent = 'Type the words for this phrase.'; $('st-n' + i).setAttribute('aria-invalid', 'true'); errors.push('st-n' + i); }
                else if (!(n >= 1 && n <= C.LIMITS.stepCount)) { $('st-e' + i).textContent = 'Type how many, from 1 to 1,000.'; $('st-c' + i).setAttribute('aria-invalid', 'true'); errors.push('st-c' + i); }
                steps.push({ name: nm, arabic: s.arabic || '', count: n });
            });
            let r = Number($('e-rounds').value);
            if ($('e-rounds').value === 'custom') {
                r = C.readInt($('e-rounds-n').value);
                if (!(r >= 1 && r <= C.LIMITS.rounds)) errors.push(bad('e-rounds-n', 'e-rounds-err', 'Type a whole number from 1 to 50.'));
            }
            Object.assign(item, { steps, rounds: r });
        } else {
            const total = C.readInt($('e-total').value);
            if (!$('e-total').value.trim()) errors.push(bad('e-total', 'e-total-err', 'Type the total, such as 1,25,000.'));
            else if (!(total >= 1 && total <= C.LIMITS.goal)) errors.push(bad('e-total', 'e-total-err', 'Type a whole number from 1 to 9,999,999.'));
            let by = '';
            if (!$('w-by').hidden && $('e-by').value) {
                by = $('e-by').value;
                if (!C.isIso(by)) errors.push(bad('e-by', 'e-by-err', 'Pick a date.'));
                else if (C.diffDays(today, by) < 0 && !(editing !== null && state.items.find(i => i.id === editing).by === by)) errors.push(bad('e-by', 'e-by-err', 'Pick today or a day after today.'));
            }
            let people = 0;
            if (!$('w-people').hidden && $('e-people').value.trim()) {
                people = C.readInt($('e-people').value);
                if (!(people >= 1 && people <= C.LIMITS.people)) errors.push(bad('e-people', 'e-people-err', 'Type how many people, from 1 to 500.'));
                if (people === 1) people = 0;
            }
            const old = editing !== null ? state.items.find(i => i.id === editing) : null;
            Object.assign(item, { arabic, total, by, people, offset: old ? old.offset : 0 });
        }
        if (errors.length) { const f = $(errors[0]); if (f) f.focus(); return; }
        const clean = C.cleanItem(item);
        if (!clean) return;
        const snap = snapshot();
        if (editing !== null) state.items = state.items.map(i => i.id === editing ? clean : i);
        else { state.items.push(clean); state.nextId++; state.active = clean.id; }
        const was = editing;
        save(); closeEdit(); renderAll();
        msg($('l-msg'), (was !== null ? 'Saved ' : 'Added ') + clean.name + '.', () => restoreSnap(snap));
        if (was === null) { $('counter').scrollIntoView({ block: 'start', behavior: 'smooth' }); $('tap').focus({ preventScroll: true }); }
    });
    $('goal-again').addEventListener('click', () => {
        const it = state.items.find(i => i.id === editing); if (!it || it.kind !== 'goal') return;
        const snap = snapshot();
        it.offset = C.totalAll(state, it.id);
        save(); closeEdit(); renderAll();
        msg($('l-msg'), it.name + ' starts again from 0. Your past days are kept in Last 7 days.', () => restoreSnap(snap));
    });

    // ---------- settings, share and backup ----------
    $('s-day').addEventListener('change', () => { state.settings.dayStart = Number($('s-day').value); save(); refreshDay(); renderAll(); msg($('set-msg'), 'A new day now starts at ' + $('s-day').selectedOptions[0].textContent + '.'); });
    $('s-vib').addEventListener('change', () => { state.settings.vibrate = $('s-vib').value; save(); vibrate('mark'); });
    $('copy').addEventListener('click', async () => {
        refreshDay();
        const text = C.summary(state, today);
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px'; document.body.appendChild(ta); ta.select();
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
            ta.remove();
        }
        msg($('set-msg'), ok ? 'Copied. Paste it in WhatsApp or anywhere.' : 'Could not copy here. Use Email today\'s summary instead.');
    });
    $('mail').addEventListener('click', () => { refreshDay(); renderSettings(); });
    $('backup').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'tasbeeh-backup-' + today + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        msg($('set-msg'), 'Saved the backup file. Keep it somewhere safe, such as your email or cloud drive.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; if (!f) return;
        $('restore-file').value = '';
        if (f.size > 5e6) { msg($('set-msg'), 'That file is too big to be a backup from this app.'); return; }
        const r = new FileReader();
        r.onload = () => {
            const x = C.load(String(r.result));
            if (!x) { msg($('set-msg'), 'That file is not a backup from this app. Nothing was changed.'); return; }
            const snap = snapshot();
            state = x; save(); closeEdit(); refreshDay(); renderAll();
            msg($('set-msg'), 'Restored ' + C.plural(x.items.length, 'dhikr', 'dhikr') + ' and ' + C.plural(Object.keys(x.log).length, 'day', 'days') + ' of counts.', () => restoreSnap(snap));
        };
        r.onerror = () => msg($('set-msg'), 'Could not read that file.');
        r.readAsText(f);
    });
    $('wipe').addEventListener('click', () => {
        const snap = snapshot();
        state = { v: 1, items: [], log: {}, nextId: state.nextId, active: 0, settings: state.settings };
        save(); closeEdit(); closeFix(); clearMsg($('c-msg')); clearMsg($('l-msg')); renderAll();
        msg($('set-msg'), 'Deleted everything.', () => restoreSnap(snap));
    });

    // ---------- start ----------
    state = read();
    refreshDay();
    renderAll();
    if (readProblem) msg($('c-msg'), 'Your saved counts could not be read, so the app started fresh.');
    // a new day can start while the page is open
    const tick = () => { if (refreshDay()) { closeFix(); renderAll(); } };
    setInterval(tick, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); if (!$('focus').hidden && !wakeLock) openFocus(); } });
    window.addEventListener('storage', e => { if (e.key === KEY) { state = read(); refreshDay(); renderAll(); } });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
