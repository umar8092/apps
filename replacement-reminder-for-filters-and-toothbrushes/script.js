// Replacement Reminder for Filters and Toothbrushes: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.ReplaceCore;
    const KEY = 'replacement-reminder-for-filters-and-toothbrushes.state';
    const KEY_DAYS = 'replacement-reminder-for-filters-and-toothbrushes.shopDays';
    const URL_SELF = 'https://umar8092.github.io/apps/replacement-reminder-for-filters-and-toothbrushes/';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    let canSave = true, state, today = C.todayIso();
    let editing = null;          // id of the item in the form, or null for a new one
    let formOpen = false;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved list could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeForm(); commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['list-msg', 'form-msg', 'set-msg'];
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        MSGS.forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) {
            const b = el('button', 'undo', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { restoreSnap(undoSnap); show(id, 'Undone.'); });
            box.appendChild(b);
        }
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const item = id => state.items.find(x => x.id === id);
    const replace = (id, nx) => { state.items = state.items.map(x => (x.id === id ? nx : x)); };
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
        return Promise.resolve(fallbackCopy(text));
    }
    function fallbackCopy(text) {
        const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); return ok;
    }
    function download(name, type, body) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    function mailto(subject, text) {
        let body = text;
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(The list is too long for an email link. Use "Copy" and paste it.)';
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
    function flash(id) {
        const t = document.querySelector('li.box[data-id="' + id + '"]');
        if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1600); }
    }
    function nextWords(it) {
        const d = C.nextDue(it, today), n = C.diff(today, d);
        return n <= 0 ? 'now' : n === 1 ? 'tomorrow, ' + C.shortDate(d, today) : C.shortDate(d, today) + ' (' + C.rel(today, d) + ')';
    }

    // ---------- the list ----------
    function render() {
        today = C.todayIso();
        const all = state.items;
        renderSummary();
        const g = C.groups(all, today);
        ['now', 'later', 'paused'].forEach(k => {
            const ul = $('l-' + k); ul.textContent = '';
            g[k].forEach(x => ul.appendChild(box(x)));
            $('g-' + k).hidden = !g[k].length;
        });
        // the form is always open while the list is empty
        if (!all.length) formOpen = true;
        $('form').hidden = !formOpen;
        $('open-form').hidden = formOpen;
        $('form-h').hidden = !formOpen;   // the button says it already
        $('cancel').hidden = !all.length && editing == null;
        $('app').classList.toggle('setup', !all.length);
        $('list').hidden = !all.length;
        $('share-tools').hidden = !all.length;
        $('mail-all').href = mailto('Things to replace', C.listText(all, today) || 'Things to replace');
        renderShop();
    }

    function renderSummary() {
        const b = $('sum-body'); b.textContent = '';
        const all = state.items;
        if (!all.length) {
            b.appendChild(el('p', 'sum-empty', 'Nothing added yet. Add the things you replace on a schedule, like the water filter or the toothbrushes, and the app shows what is due.'));
            return;
        }
        const g = C.groups(all, today);
        if (g.now.length) {
            b.appendChild(el('p', 'next-label', g.now.length === 1 ? 'Replace now' : g.now.length + ' things to replace now'));
            b.appendChild(el('p', 'next', g.now.map(x => C.dueName(x, today)).join(', ')));
            if (g.now.length >= 2) {
                const btn = el('button', 'primary all-btn', 'I replaced all ' + g.now.length); btn.type = 'button'; btn.id = 'replace-all';
                btn.addEventListener('click', replaceAll);
                b.appendChild(btn);
            }
        } else {
            b.appendChild(el('p', 'next ok', 'Nothing needs replacing today.'));
        }
        const nxt = g.later[0];
        if (nxt) b.appendChild(el('p', 'next-left', 'Next: ' + C.label(nxt) + ', ' + nextWords(nxt) + '.'));
        else if (!g.now.length && g.paused.length) b.appendChild(el('p', 'next-left', 'Everything is paused.'));
    }

    function box(x) {
        const paused = !!x.paused;
        const next = C.nextDue(x, today), d = C.diff(today, next);
        const cls = paused ? 'paused' : d < 0 || !x.last ? 'late' : d === 0 ? 'now' : 'later';
        const li = el('li', 'box ' + cls); li.dataset.id = x.id;
        const top = el('div', 'box-top');
        top.appendChild(el('h4', 'box-name', x.name));
        if (x.who) top.appendChild(el('span', 'who', x.who));
        li.appendChild(top);
        li.appendChild(el('p', 'st ' + cls, C.dueLine(x, today)));
        li.appendChild(el('p', 'box-sub', C.subLine(x, today)));
        const h = C.historyLine(x, today);
        if (h) li.appendChild(el('p', 'box-sub hist', h));
        if (x.note) li.appendChild(el('p', 'box-note', x.note));
        const btns = el('div', 'box-btns');
        const mini = (text, fn, aria, extra) => { const b = el('button', 'mini' + (extra ? ' ' + extra : ''), text); b.type = 'button'; b.setAttribute('aria-label', aria); b.addEventListener('click', fn); btns.appendChild(b); return b; };
        const nm = C.label(x);
        if (!paused) {
            mini('Replaced today', () => replacedNow(x.id), 'Replaced today: ' + nm, 'strong');
            mini('Edit', () => openForm(x.id), 'Edit ' + nm);
            mini('Pause', () => setPaused(x.id, true), 'Pause ' + nm + ', not in use');
        } else {
            mini('Resume', () => setPaused(x.id, false), 'Resume ' + nm, 'strong');
            mini('Edit', () => openForm(x.id), 'Edit ' + nm);
        }
        li.appendChild(btns);
        return li;
    }

    function replacedNow(id) {
        const x = item(id); if (!x) return;
        if (x.last === today) { show('list-msg', C.label(x) + ' is already marked replaced today. Next: ' + nextWords(x) + '.'); return; }
        const before = snapshot();
        const nx = C.replaced(x, today); replace(id, nx); commit();
        show('list-msg', C.label(x) + ' replaced. Next: ' + nextWords(nx) + '.', before);
        flash(id);
    }
    function replaceAll() {
        const g = C.groups(state.items, today);
        if (!g.now.length) return;
        const before = snapshot(), names = g.now.map(C.label);
        g.now.forEach(x => replace(x.id, C.replaced(x, today)));
        commit();
        show('list-msg', 'Replaced ' + names.join(', ') + '.', before);
    }
    function setPaused(id, on) {
        const x = item(id); if (!x) return;
        const before = snapshot();
        const nx = on ? C.pause(x, today) : C.resume(x, today);
        replace(id, nx);
        if (editing === id) closeForm();
        commit();
        const days = on ? 0 : C.diff(x.paused, today);
        show('list-msg', on ? C.label(x) + ' paused. It will not show as due until you tap Resume.'
            : C.label(x) + ' resumed' + (x.last && days > 0 ? ': the ' + C.plural(days, 'paused day') + ' are not counted' : '') + '. Next: ' + nextWords(nx) + '.', before);
        flash(id);
    }
    function removeItem(id) {
        const x = item(id); if (!x) return;
        const before = snapshot();
        state.items = state.items.filter(y => y.id !== id);
        if (editing === id) closeForm();
        commit();
        show('list-msg', 'Deleted ' + C.label(x) + '.', before);
    }

    // ---------- shopping list ----------
    let shopNow = '';
    function renderShop() {
        const days = Number($('s-days').value) || 30;
        shopNow = C.shoppingText(state.items, today, days);
        $('shop-text').textContent = shopNow || 'Nothing is due within ' + $('s-days').selectedOptions[0].textContent + '.';
        $('shop-copy').disabled = !shopNow;
        $('shop-mail').href = mailto('Shopping list: things to replace', shopNow || 'Nothing to buy');
        $('shop-mail').classList.toggle('off', !shopNow);
        $('shop-mail').setAttribute('aria-disabled', String(!shopNow));
    }

    // ---------- the form ----------
    function fillPresets() {
        const s = $('f-preset'); s.textContent = '';
        const o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Choose, or type your own below'; s.appendChild(o0);
        C.PRESETS.forEach((p, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = p.name + ' (' + C.everyText(p.n, p.unit) + ')'; s.appendChild(o); });
    }
    function showPart(part, on) { $('w-' + part).hidden = !on; $('o-' + part).hidden = on; }
    function clearErrors() {
        ['name', 'n', 'last', 'who'].forEach(k => { $('e-' + k).textContent = ''; });
        document.querySelectorAll('#form [aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
    }
    function openForm(id) {
        const x = id != null ? item(id) : null;
        editing = x ? x.id : null; formOpen = true;
        clearErrors(); clearMsg('form-msg');
        $('f-preset').value = '';
        $('f-name').value = x ? x.name : '';
        $('f-n').value = x ? String(x.n) : '3';
        $('f-unit').value = x ? x.unit : 'month';
        $('f-last').value = x ? x.last : today;
        $('f-who').value = x ? x.who : '';
        $('f-note').value = x ? x.note : '';
        showPart('who', !!(x && x.who));
        showPart('note', !!(x && x.note));
        $('h-who').hidden = !!x;
        $('form-h').textContent = x ? 'Edit ' + C.label(x) : 'Add something to replace';
        $('save').textContent = x ? 'Save changes' : 'Add it';
        $('cancel').textContent = x ? 'Cancel' : 'Done';
        $('edit-tools').hidden = !x;
        $('pause').textContent = x && x.paused ? 'Resume it' : 'Pause it (not in use)';
        const avg = x ? C.averageGap(x) : 0;
        $('avg').hidden = !avg;
        $('avg').textContent = avg ? 'You have really been replacing it about every ' + C.span(avg) + '.' : '';
        render(); preview();
        if (x) { $('add').scrollIntoView({ block: 'start', behavior: 'smooth' }); setTimeout(() => $('f-name').focus({ preventScroll: true }), 300); }
    }
    function closeForm() {
        editing = null; formOpen = false;
        $('form-h').textContent = 'Add something to replace'; $('save').textContent = 'Add it'; $('cancel').textContent = 'Done';
        $('edit-tools').hidden = true; $('avg').hidden = true; $('h-who').hidden = false; clearErrors();
    }
    function formData() {
        return { name: $('f-name').value, n: $('f-n').value, unit: $('f-unit').value, last: $('f-last').value,
            who: $('w-who').hidden ? (editing != null ? (item(editing) || {}).who : '') : $('f-who').value,
            note: $('w-note').hidden ? (editing != null ? (item(editing) || {}).note : '') : $('f-note').value };
    }
    function preview() {
        const f = formData();
        $('h-last').textContent = f.last ? '' : 'Not sure: it will show as "Replace now". Set the date when you change it.';
        const r = C.readForm(Object.assign({}, f, { name: f.name.trim() || 'x', who: '' }), today, [], editing);
        const pv = $('preview');
        if (!r.items) { pv.textContent = ''; return; }
        const x = Object.assign({ skip: editing != null && f.last === (item(editing) || {}).last ? (item(editing) || {}).skip : 0, paused: '' }, r.items[0]);
        const d = C.nextDue(x, today), dd = C.diff(today, d);
        const when = !x.last ? 'now (no date recorded yet)' : dd < 0 ? 'now (' + C.span(-dd) + ' late, was due ' + C.shortDate(d, today) + ')' : dd === 0 ? 'today' : dd === 1 ? 'tomorrow, ' + C.shortDate(d, today) : C.shortDate(d, today) + ' (' + C.rel(today, d) + ')';
        const whoN = editing == null && !$('w-who').hidden ? C.readForm(Object.assign({}, f, { name: 'x' }), today, [], null) : null;
        const many = whoN && whoN.items && whoN.items.length > 1 ? ' Adds ' + whoN.items.length + ' boxes: ' + whoN.items.map(i => i.who).join(', ') + '.' : '';
        pv.textContent = 'Replace ' + when + ', then ' + C.everyText(x.n, x.unit) + '.' + many;
    }
    function submit(e) {
        e.preventDefault();
        clearErrors();
        const r = C.readForm(formData(), today, state.items, editing);
        if (r.errors) {
            const map = { name: 'f-name', n: 'f-n', last: 'f-last', who: 'f-who' };
            let first = null;
            Object.keys(r.errors).forEach(k => {
                $('e-' + k).textContent = r.errors[k];
                const inp = $(map[k]); inp.setAttribute('aria-invalid', 'true'); if (!first) first = inp;
            });
            if (first) first.focus();
            return;
        }
        if (editing == null && state.items.length + r.items.length > C.MAX_ITEMS) { $('e-name').textContent = 'You have ' + state.items.length + ' things, and this app keeps up to ' + C.MAX_ITEMS + '. Delete some first.'; return; }
        const before = snapshot();
        if (editing != null) {
            const old = item(editing), nx = r.items[0];
            const upd = Object.assign({}, old, nx);
            if (nx.last !== old.last) { upd.skip = 0; upd.history = nx.last ? old.history.filter(h => h !== old.last).concat([nx.last]).sort() : old.history.filter(h => h !== old.last); }
            replace(editing, upd);
            const id = editing; closeForm(); commit();
            show('list-msg', 'Saved ' + C.label(upd) + '. Next: ' + nextWords(upd) + '.' + (r.warn ? ' ' + r.warn : ''), before);
            flash(id);
        } else {
            const ids = r.items.map(nx => { const id = state.nextId++; state.items.push(Object.assign({ id, skip: 0, paused: '', history: nx.last ? [nx.last] : [], added: today }, nx)); return id; });
            commit();
            const first = item(ids[0]);
            const what = ids.length > 1 ? ids.length + ' boxes' + ' for ' + first.name + ' (' + r.items.map(i => i.who).join(', ') + ')' : C.label(first);
            show('form-msg', 'Added ' + what + '. Next: ' + nextWords(first) + '. Add the next thing, or tap Done.' + (r.warn ? ' ' + r.warn : ''), before);
            // ready for the next thing
            $('f-preset').value = ''; $('f-name').value = ''; $('f-note').value = ''; $('f-who').value = ''; $('f-last').value = today;
            showPart('who', false); showPart('note', false);
            preview();
            $('f-name').focus({ preventScroll: true });
        }
    }

    // ---------- wiring ----------
    function init() {
        state = load();
        fillPresets();
        try { const d = localStorage.getItem(KEY_DAYS); if (['7', '14', '30', '90'].includes(d)) $('s-days').value = d; } catch (e) { /* fine */ }
        $('form').addEventListener('submit', submit);
        $('form').addEventListener('input', preview);
        $('form').addEventListener('change', preview);
        $('open-form').addEventListener('click', () => { openForm(null); $('f-preset').focus(); });
        $('cancel').addEventListener('click', () => { const was = editing; closeForm(); clearMsg('form-msg'); render(); if (was != null) flash(was); });
        $('f-preset').addEventListener('change', () => {
            const p = C.PRESETS[Number($('f-preset').value)];
            if (!$('f-preset').value || !p) return;
            $('f-name').value = p.name; $('f-n').value = String(p.n); $('f-unit').value = p.unit;
            ['name', 'n'].forEach(k => { $('e-' + k).textContent = ''; }); $('f-name').removeAttribute('aria-invalid'); $('f-n').removeAttribute('aria-invalid');
            preview();
        });
        $('quick-last').addEventListener('click', e => {
            const b = e.target.closest('.chip'); if (!b) return;
            const a = b.dataset.ago, m = /^(\d+)([dm])$/.exec(a);
            $('f-last').value = !m ? '' : m[2] === 'm' ? C.addMonths(today, -Number(m[1])) : C.addDays(today, -Number(m[1]));
            $('e-last').textContent = ''; $('f-last').removeAttribute('aria-invalid');
            preview();
        });
        $('o-who').addEventListener('click', () => { showPart('who', true); $('f-who').focus(); preview(); });
        $('o-note').addEventListener('click', () => { showPart('note', true); $('f-note').focus(); });
        $('pause').addEventListener('click', () => { if (editing != null) { const x = item(editing); setPaused(editing, !(x && x.paused)); } });
        $('del').addEventListener('click', () => { if (editing != null) removeItem(editing); });
        $('s-days').addEventListener('change', () => { try { localStorage.setItem(KEY_DAYS, $('s-days').value); } catch (e) { /* fine */ } renderShop(); });
        $('shop-copy').addEventListener('click', () => { if (shopNow) copyText(shopNow).then(ok => show('set-msg', ok ? 'Copied the shopping list.' : 'Could not copy. Select the list and copy it yourself.')); });
        $('shop-mail').addEventListener('click', e => { if (!shopNow) { e.preventDefault(); show('set-msg', 'Nothing to buy in that time. Choose a longer time.'); } });
        $('copy-all').addEventListener('click', () => {
            const t = C.listText(state.items, today); if (!t) return;
            copyText(t).then(ok => show('set-msg', ok ? 'Copied your whole list.' : 'Could not copy. Try "Email my whole list" instead.'));
        });
        $('cal').addEventListener('click', () => {
            const active = state.items.filter(x => !x.paused);
            if (!active.length) { show('set-msg', 'Everything is paused, so there are no dates to add.'); return; }
            download('replacement-reminders.ics', 'text/calendar', C.ics(state.items, today, URL_SELF));
            show('set-msg', 'Saved a calendar file with ' + C.plural(active.length, 'reminder') + '. Open it to add them to your calendar.');
        });
        $('backup').addEventListener('click', () => {
            download('replacement-reminder-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1));
            show('set-msg', 'Saved a backup file with ' + C.plural(state.items.length, 'thing') + '.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => {
            const f = e.target.files && e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (f.size > 2e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            const r = new FileReader();
            r.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(String(r.result))); } catch (err) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
                const before = snapshot(); state = s; closeForm(); commit();
                show('set-msg', 'Restored ' + C.plural(s.items.length, 'thing') + '.', before);
            };
            r.onerror = () => show('set-msg', 'Could not read that file.');
            r.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.items.length) { show('set-msg', 'There is nothing to delete.'); return; }
            const before = snapshot(); state = C.emptyState(); closeForm(); commit();
            show('set-msg', 'Deleted everything.', before);
        });
        // a new day while the page stays open
        setInterval(() => { if (C.todayIso() !== today) { render(); preview(); } }, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayIso() !== today) { render(); preview(); } });
        if (!canSave) $('storage-warn').hidden = false;
        $('f-last').value = today;
        render(); preview();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
