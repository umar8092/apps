// Schengen and Visa Stay Day Counter: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.StayCore;
    const KEY = C.SLUG + '.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const L = iso => C.longDate(iso);

    let canSave = true, state, today = C.todayIso();
    let editing = null;      // id of the trip in the form, or null for a new one
    let cEditing = null;     // id of the traveller/rule in the small form, or 'new'

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved trips could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; resetForm(); closeCForm(); commit(); }
    function commit() { save(); render(); }
    const cur = () => state.counters.find(c => c.id === state.cur) || state.counters[0];

    // ---------- messages with Undo ----------
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) {
            const b = el('button', 'undo', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { restoreSnap(undoSnap); show(id, 'Undone.'); });
            box.appendChild(b);
        }
        clearTimeout(timers[id]);
        timers[id] = setTimeout(() => { box.textContent = ''; box.classList.remove('show'); }, undoSnap ? 12000 : 5000);
    }

    // ---------- the top box ----------
    function line(parent, cls, label, value) {
        const p = el('p', cls); if (label) p.appendChild(el('span', 'lbl', label + ' '));
        p.appendChild(el('b', null, value)); parent.appendChild(p); return p;
    }
    function renderStatus(c) {
        const s = C.status(c, today), body = $('st-body');
        body.textContent = '';
        $('st-h').textContent = 'Today, ' + L(today);
        $('rule-line').textContent = c.name + ': ' + C.ruleText(c) + '. Entry and exit days both count.';
        const big = el('p', 'big' + (s.over ? ' bad' : ''));
        big.appendChild(el('span', 'num', String(s.used)));
        big.appendChild(el('span', 'of', ' of ' + c.n + ' days used in the last ' + c.m + ' days'));
        body.appendChild(big);
        const bar = el('div', 'bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', s.used + ' of ' + c.n + ' days used');
        const fill = el('span', s.over ? 'over' : (s.left <= 10 ? 'low' : '')); fill.style.width = Math.min(100, s.used / c.n * 100) + '%';
        bar.appendChild(fill); body.appendChild(bar);
        body.appendChild(el('p', 'left-line', s.over ? 'Over the limit by ' + C.plural(s.used - c.n, 'day') + ' today.' : C.plural(s.left, 'day') + ' left today.'));

        const ans = el('div', 'answer main');
        if (s.inside) {
            ans.appendChild(el('p', 'a-sub', 'You are there now, since ' + L(s.inside.entry) + '.'));
            if (!s.leaveBy || s.overSince) {
                ans.classList.add('bad');
                line(ans, 'a-big', 'Over the limit since', L(s.overSince));
                ans.appendChild(el('p', 'a-sub', 'Leave as soon as you can, and keep proof of your dates.'));
            } else {
                const d = C.diff(today, s.leaveBy);
                line(ans, 'a-big', 'Last day you can stay:', L(s.leaveBy));
                ans.appendChild(el('p', 'a-sub', d === 0 ? 'Today is your last day.' : C.plural(d, 'more day') + ' after today.'));
                if (s.inside.exit) {
                    if (s.exitOk) ans.appendChild(el('p', 'a-ok', 'Your leaving day, ' + L(s.inside.exit) + ', is fine.'));
                    else { ans.classList.add('bad'); ans.appendChild(el('p', 'a-bad', 'Your leaving day, ' + L(s.inside.exit) + ', is too late by ' + C.plural(C.diff(s.leaveBy, s.inside.exit), 'day') + '.')); }
                }
                const cal = el('button', 'secondary small cal', 'Add the last day to my calendar'); cal.type = 'button'; cal.id = 'cal';
                cal.addEventListener('click', () => download('last-day-to-leave.ics', 'text/calendar',
                    C.icsEvent(s.leaveBy, 'Last day to stay: ' + c.name, 'Last day you can stay under the ' + C.ruleText(c) + ' rule (from Schengen and Visa Stay Day Counter). Check your dates before you travel.')));
                ans.appendChild(cal);
            }
        } else if (s.stayUntil) {
            line(ans, 'a-big', 'Enter today and you can stay until', L(s.stayUntil));
            ans.appendChild(el('p', 'a-sub', '(' + C.plural(s.stayToday, 'day') + ', today included' + (s.stayToday > s.left ? ', with the days you get back on the way' : '') + ')'));
        } else {
            ans.classList.add('bad');
            line(ans, 'a-big', 'You cannot enter today. Earliest day to enter:', L(s.enterFrom));
        }
        body.appendChild(ans);

        const more = el('ul', 'facts');
        const fact = (label, value) => { const li = el('li'); li.appendChild(el('span', null, label + ' ')); li.appendChild(el('b', null, value)); more.appendChild(li); };
        if (s.backOn) fact('Days start coming back on', L(s.backOn));
        if (s.full && s.full !== today) fact('Full ' + c.n + ' days again from', L(s.full));
        else if (s.full === today && c.trips.length) fact('Full ' + c.n + ' days:', 'available today');
        if (more.children.length) body.appendChild(more);
        if (s.overDay && !(s.inside && s.overSince)) {
            const w = el('p', 'over-box');
            w.textContent = (s.overDay < today ? 'The rule was broken on ' : 'Your plans break the rule on ') + L(s.overDay) + ': ' + s.overCount + ' days inside in the ' + c.m + ' days up to that day. See the trip marked in red.';
            body.appendChild(w);
        }
        if (!c.trips.length) body.appendChild(el('p', 'hint', 'Add your trips from the last ' + c.m + ' days under "Add a trip" to see your real count.'));
    }

    // ---------- planning ----------
    function renderPlan(c) {
        const entry = $('p-entry').value, exitOn = !$('w-pexit').hidden, exit = exitOn ? $('p-exit').value : '';
        const out = $('p-out'), err = $('p-err');
        out.textContent = ''; out.hidden = true; err.textContent = ''; out.className = 'answer';
        $('p-save').hidden = true;
        $('p-entry').removeAttribute('aria-invalid'); $('p-exit').removeAttribute('aria-invalid');
        if (!entry) return;
        if (exitOn && !exit) { /* still choosing */ }
        const r = C.plan(c, today, entry, exitOn && exit ? exit : null);
        if (r.error) { err.textContent = r.error; ($('p-exit').value && /leav/.test(r.error) ? $('p-exit') : $('p-entry')).setAttribute('aria-invalid', 'true'); return; }
        out.hidden = false;
        if (r.blocked) {
            out.classList.add('bad');
            line(out, 'a-big', 'You cannot enter on ' + L(entry) + '. Earliest day to enter:', L(r.enterFrom));
            out.appendChild(el('p', 'a-sub', 'All ' + c.n + ' days of the ' + c.m + ' before that day are used.'));
        } else {
            line(out, 'a-big', 'Enter on ' + L(entry) + ' and you can stay until', L(r.lastDay));
            out.appendChild(el('p', 'a-sub', '(' + C.plural(r.len, 'day') + '. You will have used ' + r.usedBefore + ' of ' + c.n + ' days before that day.)'));
            if (r.exit) {
                if (r.ok) {
                    out.appendChild(el('p', 'a-ok', 'Leaving on ' + L(r.exit) + ' fits: ' + C.plural(r.tripDays, 'day') + '. On that day you will have used ' + r.usedAtExit + ' of ' + c.n + '.'));
                    $('p-save').hidden = false; $('p-save').textContent = 'Save it as a planned trip';
                } else {
                    out.classList.add('bad');
                    out.appendChild(el('p', 'a-bad', 'Leaving on ' + L(r.exit) + ' is too long: you would be over ' + c.n + ' days on ' + L(r.overOn) + '. Leave by ' + L(r.lastDay) + '.'));
                    $('p-save').hidden = false; $('p-save').textContent = 'Use the last possible day, ' + C.shortDate(r.lastDay);
                }
            } else {
                $('p-save').hidden = false; $('p-save').textContent = 'Use ' + C.shortDate(r.lastDay) + ' as my leaving day';
            }
        }
        if (r.ongoing) out.appendChild(el('p', 'hint', 'Your trip with no leaving day is counted up to today only. Add its leaving day for an exact answer.'));
    }
    function planSave() {
        const c = cur(), entry = $('p-entry').value, exitOn = !$('w-pexit').hidden, exit = exitOn ? $('p-exit').value : '';
        const r = C.plan(c, today, entry, exit || null);
        if (r.error || r.blocked) return;
        if (!exit || !r.ok) {   // fill in the last possible day and let the person look before saving
            $('w-pexit').hidden = false; $('o-pexit').hidden = true; $('p-exit').value = r.lastDay; renderPlan(c); $('p-exit').focus(); return;
        }
        const snap = snapshot();
        c.trips.push({ id: C.newId('t'), entry, exit, note: '' });
        $('p-entry').value = ''; $('p-exit').value = ''; $('w-pexit').hidden = true; $('o-pexit').hidden = false;
        commit();
        show('list-msg', 'Planned trip added: ' + C.rangeText(entry, exit) + '.', snap);
    }

    // ---------- the trip list ----------
    function renderTrips(c) {
        const list = $('list'); list.textContent = '';
        $('empty').hidden = c.trips.length > 0;
        $('trips-h').textContent = c.trips.length ? 'Your trips (' + c.trips.length + ')' : 'Your trips';
        C.sortTrips(c.trips).forEach(t => {
            const i = C.tripInfo(c, t, today), li = el('li', 'box ' + i.kind + (i.overOn ? ' over' : '') + (i.kind === 'past' && !i.counting ? ' old' : ''));
            li.dataset.id = t.id;
            const top = el('div', 'box-top');
            top.appendChild(el('h3', 'box-name', t.exit ? C.rangeText(t.entry, t.exit) : 'Since ' + L(t.entry)));
            const badge = i.kind === 'planned' ? 'Planned' : i.kind === 'ongoing' || i.kind === 'inside' ? 'There now' : i.counting ? (i.counting === i.days ? 'Counts' : 'Counts ' + i.counting + ' of ' + i.days) : 'No longer counts';
            top.appendChild(el('span', 'badge', badge));
            li.appendChild(top);
            li.appendChild(el('p', 'box-sub', C.plural(i.days, 'day') + (i.kind === 'ongoing' ? ' so far' : '') + (t.note ? ' · ' + t.note : '')));
            const dl = el('ul', 'dl');
            if (i.kind === 'past' && i.counting) dl.appendChild(el('li', null, 'Stops counting on ' + L(i.goneOn)));
            if (i.kind === 'ongoing') dl.appendChild(el('li', null, 'Counted up to today. Edit it to add the leaving day.'));
            if (i.kind === 'planned') dl.appendChild(el('li', null, 'Counted in every answer above.'));
            if (i.overOn) dl.appendChild(el('li', 'bad', 'Over the limit from ' + L(i.overOn) + (i.kind !== 'past' && i.leaveBy ? '. Leave by ' + L(i.leaveBy) + '.' : '.')));
            if (i.overlap) dl.appendChild(el('li', 'muted', 'Overlaps another trip. Shared days are counted once.'));
            if (dl.children.length) li.appendChild(dl);
            const btns = el('div', 'box-btns');
            const eb = el('button', 'mini', 'Edit'); eb.type = 'button'; eb.setAttribute('aria-label', 'Edit trip ' + C.rangeText(t.entry, t.exit)); eb.addEventListener('click', () => startEdit(t.id));
            const db = el('button', 'mini bad', 'Delete'); db.type = 'button'; db.setAttribute('aria-label', 'Delete trip ' + C.rangeText(t.entry, t.exit)); db.addEventListener('click', () => {
                const snap = snapshot(); c.trips = c.trips.filter(x => x.id !== t.id); if (editing === t.id) resetForm(); commit();
                show('list-msg', 'Trip deleted: ' + C.rangeText(t.entry, t.exit) + '.', snap);
            });
            btns.appendChild(eb); btns.appendChild(db); li.appendChild(btns);
            list.appendChild(li);
        });
    }

    // ---------- the trip form ----------
    function formData() { return { entry: $('f-entry').value, exit: $('f-exit').value, still: $('f-still').checked, note: $('f-note').value }; }
    function clearErrs() { ['entry', 'exit', 'still'].forEach(k => { $('e-' + k).textContent = ''; const f = $('f-' + k); if (f) f.removeAttribute('aria-invalid'); }); }
    function preview() {
        const f = formData(), p = $('preview');
        $('w-exit').hidden = f.still;
        if (!C.isDate(f.entry)) { p.textContent = ''; return; }
        if (f.still) { p.textContent = f.entry <= today ? 'Counted up to today: ' + C.plural(C.diff(f.entry, today) + 1, 'day') + ' so far.' : ''; return; }
        if (!C.isDate(f.exit) || f.exit < f.entry) { p.textContent = ''; return; }
        const n = C.diff(f.entry, f.exit) + 1;
        p.textContent = C.plural(n, 'day') + ' (the day you entered and the day you left both count)' + (f.entry > today ? ', planned.' : '.');
    }
    function resetForm() {
        editing = null; $('form').reset(); clearErrs(); $('w-note').hidden = true; $('o-note').hidden = false;
        $('form-h').textContent = 'Add a trip'; $('save').textContent = 'Add trip'; $('cancel').hidden = true; preview();
    }
    function startEdit(id) {
        const t = cur().trips.find(x => x.id === id); if (!t) return;
        resetForm(); editing = id;
        $('f-entry').value = t.entry; $('f-exit').value = t.exit || ''; $('f-still').checked = !t.exit;
        if (t.note) { $('f-note').value = t.note; $('w-note').hidden = false; $('o-note').hidden = true; }
        $('form-h').textContent = 'Edit trip'; $('save').textContent = 'Save changes'; $('cancel').hidden = false; preview();
        $('add').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('f-entry').focus({ preventScroll: true });
    }
    function submit(e) {
        e.preventDefault(); clearErrs();
        const c = cur(), r = C.readTrip(formData(), c, today, editing);
        if (r.errors) {
            Object.keys(r.errors).forEach(k => { $('e-' + k).textContent = r.errors[k]; const f = $('f-' + k); if (f) f.setAttribute('aria-invalid', 'true'); });
            const first = ['entry', 'exit', 'still'].find(k => r.errors[k]); ($('f-' + first)).focus();
            return;
        }
        const snap = snapshot(), was = editing;
        if (was) c.trips = c.trips.map(x => x.id === was ? r.trip : x); else c.trips.push(r.trip);
        resetForm(); commit();
        show('form-msg', (was ? 'Trip saved: ' : 'Trip added: ') + C.rangeText(r.trip.entry, r.trip.exit) + '.', snap);
        const box = document.querySelector('li.box[data-id="' + r.trip.id + '"]'); if (box) { box.classList.add('flash'); setTimeout(() => box.classList.remove('flash'), 1600); }
    }

    // ---------- travellers and rules ----------
    function renderCounters() {
        const ul = $('counters'); ul.textContent = '';
        state.counters.forEach(c => {
            const li = el('li', 'box cbox' + (c.id === state.cur ? ' current' : ''));
            const top = el('div', 'box-top'); top.appendChild(el('h3', 'box-name', c.name));
            if (c.id === state.cur) top.appendChild(el('span', 'badge', 'Showing'));
            li.appendChild(top);
            li.appendChild(el('p', 'box-sub', C.ruleText(c) + ' · ' + C.plural(c.trips.length, 'trip')));
            const btns = el('div', 'box-btns');
            if (c.id !== state.cur) { const b = el('button', 'mini strong', 'Show'); b.type = 'button'; b.setAttribute('aria-label', 'Show ' + c.name); b.addEventListener('click', () => switchTo(c.id)); btns.appendChild(b); }
            const e = el('button', 'mini', 'Edit'); e.type = 'button'; e.setAttribute('aria-label', 'Edit ' + c.name); e.addEventListener('click', () => openCForm(c.id)); btns.appendChild(e);
            if (state.counters.length > 1) {
                const d = el('button', 'mini bad', 'Delete'); d.type = 'button'; d.setAttribute('aria-label', 'Delete ' + c.name + ' and its trips');
                d.addEventListener('click', () => {
                    const snap = snapshot(); state.counters = state.counters.filter(x => x.id !== c.id);
                    if (state.cur === c.id) state.cur = state.counters[0].id; closeCForm(); resetForm(); commit();
                    show('c-msg', 'Deleted "' + c.name + '" and its trips.', snap);
                });
                btns.appendChild(d);
            }
            li.appendChild(btns); ul.appendChild(li);
        });
        $('c-new').hidden = state.counters.length >= C.MAX_COUNTERS || cEditing === 'new';
        const who = $('who'); who.textContent = '';
        state.counters.forEach(c => { const o = el('option', null, c.name + ' (' + c.n + '/' + c.m + ')'); o.value = c.id; who.appendChild(o); });
        who.value = state.cur; $('who-wrap').hidden = state.counters.length < 2;
    }
    function switchTo(id) { state.cur = id; resetForm(); commit(); $('status').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    function ruleChoice() { $('w-custom').hidden = $('c-rule').value !== 'custom'; }
    function openCForm(id) {
        cEditing = id; const f = $('cform'); f.hidden = false; f.reset(); $('e-cname').textContent = ''; $('e-crule').textContent = '';
        if (id === 'new') { $('cform-h').textContent = 'New traveller or rule'; $('c-save').textContent = 'Add'; }
        else {
            const c = state.counters.find(x => x.id === id); $('cform-h').textContent = 'Edit "' + c.name + '"'; $('c-save').textContent = 'Save';
            $('c-name').value = c.name; const v = c.n + '/' + c.m;
            if ([...$('c-rule').options].some(o => o.value === v)) $('c-rule').value = v; else { $('c-rule').value = 'custom'; $('c-n').value = c.n; $('c-m').value = c.m; }
        }
        ruleChoice(); renderCounters(); $('c-name').focus();
    }
    function closeCForm() { cEditing = null; $('cform').hidden = true; renderCounters(); }
    function cSubmit(e) {
        e.preventDefault(); $('e-cname').textContent = ''; $('e-crule').textContent = '';
        const name = C.cleanText($('c-name').value, 40); let n, m;
        if ($('c-rule').value === 'custom') { n = /^\d+$/.test($('c-n').value.trim()) ? +$('c-n').value.trim() : NaN; m = /^\d+$/.test($('c-m').value.trim()) ? +$('c-m').value.trim() : NaN; }
        else [n, m] = $('c-rule').value.split('/').map(Number);
        let bad = false;
        if (!name) { $('e-cname').textContent = 'Type a name, for example "Ali, Schengen area".'; bad = true; }
        const re = C.ruleError(n, m); if (re) { $('e-crule').textContent = re; bad = true; }
        if (bad) return;
        const snap = snapshot();
        if (cEditing === 'new') { const c = { id: C.newId('c'), name, n, m, trips: [] }; state.counters.push(c); state.cur = c.id; }
        else { const c = state.counters.find(x => x.id === cEditing); if (c) { c.name = name; c.n = n; c.m = m; } }
        const was = cEditing; cEditing = null; $('cform').hidden = true; resetForm(); commit();
        show('c-msg', was === 'new' ? 'Added "' + name + '". It is showing now: add its trips.' : 'Saved "' + name + '".', snap);
    }

    // ---------- sharing and backup ----------
    function download(name, type, text) {
        const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type }));
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    function copyText(text) {
        const fallback = () => { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } t.remove(); return ok; };
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, fallback);
        return Promise.resolve(fallback());
    }
    function restoreFile(file) {
        const r = new FileReader();
        r.onload = () => {
            let s = null; try { const j = JSON.parse(r.result); s = C.validate(j && j.state ? j.state : j); } catch (e) { s = null; }
            if (!s) { show('set-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
            const snap = snapshot(); state = s; resetForm(); closeCForm(); commit();
            show('set-msg', 'Backup restored: ' + C.plural(s.counters.reduce((a, c) => a + c.trips.length, 0), 'trip') + '.', snap);
        };
        r.onerror = () => show('set-msg', 'That file could not be read.');
        r.readAsText(file);
    }

    // ---------- render ----------
    function render() {
        const c = cur();
        $('app').classList.toggle('setup', c.trips.length === 0);
        renderStatus(c); renderPlan(c); renderTrips(c); renderCounters();
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('My visa days: ' + c.name) + '&body=' + encodeURIComponent(C.summaryText(c, today));
        $('p-entry').min = today;
    }

    // ---------- wiring ----------
    state = load();
    $('form').addEventListener('submit', submit);
    ['f-entry', 'f-exit', 'f-still'].forEach(id => { $(id).addEventListener('input', preview); $(id).addEventListener('change', preview); });
    $('cancel').addEventListener('click', resetForm);
    $('o-note').addEventListener('click', () => { $('w-note').hidden = false; $('o-note').hidden = true; $('f-note').focus(); });
    $('p-entry').addEventListener('input', () => renderPlan(cur())); $('p-entry').addEventListener('change', () => renderPlan(cur()));
    $('p-exit').addEventListener('input', () => renderPlan(cur())); $('p-exit').addEventListener('change', () => renderPlan(cur()));
    $('o-pexit').addEventListener('click', () => { $('w-pexit').hidden = false; $('o-pexit').hidden = true; $('p-exit').focus(); renderPlan(cur()); });
    $('x-pexit').addEventListener('click', () => { $('w-pexit').hidden = true; $('o-pexit').hidden = false; $('p-exit').value = ''; renderPlan(cur()); $('o-pexit').focus(); });
    $('p-save').addEventListener('click', planSave);
    $('who').addEventListener('change', () => switchTo($('who').value));
    $('c-new').addEventListener('click', () => openCForm('new'));
    $('c-cancel').addEventListener('click', closeCForm);
    $('c-rule').addEventListener('change', ruleChoice);
    $('cform').addEventListener('submit', cSubmit);
    $('copy').addEventListener('click', () => copyText(C.summaryText(cur(), today)).then(ok => show('set-msg', ok ? 'Copied. Paste it into a message or a note.' : 'Copy is blocked here. Use "Email my days" instead.')));
    $('backup').addEventListener('click', () => { download('visa-stay-days-backup-' + today + '.json', 'application/json', JSON.stringify({ app: C.SLUG, saved: today, state }, null, 1)); show('set-msg', 'Backup file saved. Keep it somewhere safe.'); });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) restoreFile(f); e.target.value = ''; });
    $('wipe').addEventListener('click', () => { const snap = snapshot(); state = C.emptyState(); resetForm(); closeCForm(); commit(); show('set-msg', 'Everything deleted.', snap); });
    // a new day: every count moves on by itself
    const tick = () => { const t = C.todayIso(); if (t !== today) { today = t; render(); } };
    setInterval(tick, 60000); document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    resetForm(); render(); save();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
