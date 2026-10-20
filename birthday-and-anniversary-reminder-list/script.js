// Birthday and Anniversary Reminder List: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.BdayCore;
    const KEY = 'birthday-and-anniversary-reminder-list.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };

    let canSave = true, state, today = C.todayIso();
    let editing = null;          // id of the entry in the form, or null for a new one
    let formOpen = false;
    let pending = null;          // rows from "Check the list" or a contacts file, waiting for "Add"

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved list could not be read, so the app started fresh.'), 0);
        }
        const s = C.emptyState();
        s.order = C.guessOrder(navigator.language);
        return s;
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeForm(); commit(); syncSettings(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        ['list-msg', 'form-msg', 'set-msg'].forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) box.appendChild(btn('undo', 'Undo', () => { restoreSnap(undoSnap); show(id, 'Undone.'); }));
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const entry = id => state.entries.find(e => e.id === id);
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
    const fileName = s => (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'birthday');
    const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    function calendar(list, name, msgId) {
        if (!list.length) { show(msgId, 'Add someone first, then their reminder can go in your calendar.'); return; }
        const r = C.ics(list, today, stamp(), state.before);
        download(name, 'text/calendar', r.text);
        show(msgId, 'Saved a calendar file with ' + (r.count === 1 ? '1 yearly reminder' : r.count + ' yearly reminders') + '. Open it to add ' + (r.count === 1 ? 'it' : 'them') + ' to your calendar.');
    }

    // ---------- the page ----------
    function render() {
        today = C.todayIso();
        const empty = !state.entries.length;
        if (empty) formOpen = true;
        $('app').classList.toggle('setup', empty);
        $('form').hidden = !formOpen;
        $('open-form').hidden = formOpen;
        $('cancel').hidden = empty && editing === null;
        renderSummary();
        renderList();
        const text = C.listText(state.entries, today, 60);
        $('mail-all').href = 'mailto:?subject=' + encodeURIComponent('Birthdays and anniversaries') + '&body=' + encodeURIComponent(text);
    }

    function wishBtn(e) {
        const done = C.wishedFor(e, today);
        return btn('mini wish' + (done ? ' on' : ''), done ? 'Wished ✓' : 'Mark as wished', () => {
            const o = C.nextOcc(e, today).days === 0 ? C.nextOcc(e, today) : C.lastOcc(e, today);
            e.wished = done ? '' : o.date;
            commit();
            const b = document.querySelector('[data-wish="' + e.id + '"]'); if (b) b.focus();
        }, done ? 'Wished ' + e.name + '. Tap to undo.' : 'Mark ' + e.name + ' as wished');
    }

    function renderSummary() {
        const body = $('sum-body'); body.textContent = '';
        if (!state.entries.length) { body.appendChild(el('p', 'sum-empty', 'Add a birthday or anniversary and you will see here who is next and how many days are left.')); return; }
        const u = C.upcoming(state.entries, today);
        const block = (head, rows, cls, past) => {
            if (!rows.length) return;
            body.appendChild(el('h3', 'sum-h3', head));
            const ul = el('ul', 'sum-list');
            rows.forEach(x => {
                const li = el('li', cls + (C.wishedFor(x.e, today) && (cls === 'today' || past) ? ' wished' : ''));
                li.appendChild(el('span', 'sum-line', past ? C.pastLine(x.e, today) : C.upLine(x.e, today)));
                if (x.e.note && cls !== 'soon') li.appendChild(el('span', 'sum-note', x.e.note));
                if (cls === 'today' || past) { const b = wishBtn(x.e); b.dataset.wish = x.e.id; li.appendChild(b); }
                ul.appendChild(li);
            });
            body.appendChild(ul);
        };
        if (!u.today.length && !u.tomorrow.length) body.appendChild(el('p', 'sum-none', 'Nothing today or tomorrow.'));
        block('Today', u.today, 'today');
        block('Tomorrow', u.tomorrow, 'tomorrow');
        block('Next 30 days', u.soon, 'soon');
        if (!u.soon.length) {
            const next = C.sorted(state.entries, today).find(x => x.o.days > 1);
            if (next) body.appendChild(el('p', 'sum-next', 'Next after that: ' + C.upLine(next.e, today) + '.'));
        }
        block('Just passed', u.passed, 'passed', true);
        const n = state.entries.length;
        body.appendChild(el('p', 'sum-count', n === 1 ? '1 date on your list.' : n + ' dates on your list.'));
    }

    function renderList() {
        const box = $('months'); box.textContent = '';
        const n = state.entries.length;
        $('empty').hidden = n > 0;
        $('find').hidden = n < 8;
        const q = $('find').hidden ? '' : $('q').value.trim().toLowerCase();
        const g = $('find').hidden ? 'all' : $('g-filter').value;
        const rows = C.sorted(state.entries, today).filter(x => (!q || x.e.name.toLowerCase().includes(q)) && (g === 'all' || x.e.group === g));
        $('no-match').hidden = !n || rows.length > 0;
        const ty = today.slice(0, 4);
        let curKey = '', ul = null;
        rows.forEach(x => {
            const key = x.o.date.slice(0, 7);
            if (key !== curKey) {
                curKey = key;
                const m = +key.slice(5, 7), y = key.slice(0, 4);
                const sec = el('section', 'month');
                sec.appendChild(el('h3', 'm-h', C.MONTHS_LONG[m - 1] + (y === ty ? '' : ' ' + y)));
                ul = el('ul', 'box-list'); sec.appendChild(ul); box.appendChild(sec);
            }
            ul.appendChild(entryBox(x.e, x.o));
        });
    }

    function entryBox(e, o) {
        const li = el('li', 'box' + (o.days === 0 ? ' today' : o.days === 1 ? ' tomorrow' : o.days <= 7 ? ' week' : ''));
        li.id = 'e-' + e.id;
        const top = el('div', 'box-top');
        top.appendChild(el('h4', 'box-name', e.name));
        top.appendChild(el('span', 'badge ' + e.kind, C.kindLabel(e)));
        li.appendChild(top);
        const line = el('p', 'box-line');
        line.appendChild(el('span', 'chip', C.daysChip(o)));
        line.appendChild(document.createTextNode(' ' + C.boxLine(e, today).replace(/ \(in \d+ days\)$/, '')));
        li.appendChild(line);
        li.appendChild(el('p', 'box-sub', C.since(e) + (e.group ? ' · ' + C.GROUPS[e.group] : '')));
        if (e.note) li.appendChild(el('p', 'box-note', e.note));
        const b = el('div', 'box-btns');
        b.appendChild(btn('mini', 'Edit', () => openForm(e.id), 'Edit ' + e.name));
        b.appendChild(btn('mini', 'Calendar', () => calendar([e], fileName(e.name + '-' + C.kindLabel(e)) + '.ics', 'list-msg'), 'Add ' + e.name + ' to my calendar'));
        li.appendChild(b);
        return li;
    }

    // ---------- the form ----------
    const kindNow = () => (document.querySelector('input[name=kind]:checked') || {}).value || 'birthday';
    function fillDays() {
        const sel = $('f-day');
        for (let d = 1; d <= 31; d++) { const o = el('option', null, String(d)); o.value = String(d); sel.appendChild(o); }
    }
    function formValues() {
        return { name: $('f-name').value, kind: kindNow(), label: $('f-label').value, day: $('f-day').value, month: $('f-month').value, year: $('f-year').value,
            feb29: $('f-feb29').value, group: $('f-group').value, note: $('f-note').value };
    }
    const others = () => state.entries.filter(e => e.id !== editing);
    function syncKind() {
        const k = kindNow();
        $('w-label').hidden = k !== 'other';
        $('l-name').textContent = k === 'anniversary' ? 'Whose anniversary?' : k === 'other' ? 'Whose day?' : 'Whose birthday?';
        $('f-name').placeholder = k === 'anniversary' ? 'e.g. Ali and Sara, or Mum and Dad' : k === 'other' ? 'e.g. Ahmed, or Me' : 'e.g. Sara, or Mum';
        $('h-year').textContent = k === 'birthday' ? 'The year is optional. With it you see the age they turn.' : 'The year is optional. With it you see how many years it has been.';
    }
    function syncPreview() {
        $('w-feb29').hidden = !($('f-day').value === '29' && $('f-month').value === '2');
        const r = C.readForm(formValues(), today, others());
        $('preview').textContent = r.entry ? C.upLine(r.entry, today) + '.' : '';
    }
    function setErr(id, field, text) {
        $(id).textContent = text || '';
        [].concat(field).forEach(f => { if ($(f)) $(f).setAttribute('aria-invalid', text ? 'true' : 'false'); });
    }
    function clearErrs() { setErr('e-name', 'f-name'); setErr('e-label', 'f-label'); setErr('e-date', ['f-day', 'f-month', 'f-year']); }

    function openForm(id) {
        editing = id == null ? null : id;
        formOpen = true; clearErrs();
        const e = editing ? entry(editing) : null;
        const kind = e ? e.kind : 'birthday';
        $('k-' + kind).checked = true;
        $('f-name').value = e ? e.name : '';
        $('f-label').value = e ? e.label : '';
        $('f-day').value = e ? String(e.d) : '';
        $('f-month').value = e ? String(e.m) : '';
        $('f-year').value = e && e.y ? String(e.y) : '';
        $('f-feb29').value = e ? e.feb29 : '28';
        $('f-group').value = e ? e.group : '';
        $('f-note').value = e ? e.note : '';
        $('w-note').hidden = !(e && e.note); $('o-note').hidden = !$('w-note').hidden;
        $('form-h').textContent = e ? 'Edit ' + e.name : 'Add a birthday or anniversary';
        $('save').textContent = e ? 'Save changes' : 'Add to the list';
        $('del').hidden = !e;
        syncKind(); syncPreview(); render();
        $('add').scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('f-name').focus({ preventScroll: true });
    }
    function closeForm() {
        editing = null; formOpen = !state.entries.length;
        $('form').reset(); $('w-note').hidden = true; $('o-note').hidden = false; $('del').hidden = true;
        $('form-h').textContent = 'Add a birthday or anniversary'; $('save').textContent = 'Add to the list';
        clearErrs(); syncKind(); syncPreview();
    }
    function flash(id) {
        const b = $('e-' + id); if (!b) return;
        b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 1600);
        if (window.matchMedia('(max-width: 899px)').matches) b.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function submit(ev) {
        ev.preventDefault();
        clearErrs();
        const r = C.readForm(formValues(), today, others());
        if (r.err) {
            setErr('e-name', 'f-name', r.err.name); setErr('e-label', 'f-label', r.err.label); setErr('e-date', ['f-day', 'f-month', 'f-year'], r.err.date || r.err.year);
            const first = r.err.label ? 'f-label' : r.err.name ? 'f-name' : r.err.year ? 'f-year' : !$('f-day').value ? 'f-day' : 'f-month';
            $(first).focus(); return;
        }
        const snap = snapshot();
        let id;
        if (editing) {
            const e = entry(editing); id = e.id;
            const wished = e.d === r.entry.d && e.m === r.entry.m ? e.wished : '';
            Object.assign(e, r.entry, { id, wished });
            show('list-msg', 'Saved the changes for ' + e.name + '.', snap);
        } else {
            if (state.entries.length >= C.MAX_ENTRIES) { setErr('e-name', 'f-name', 'The list is full (' + C.MAX_ENTRIES + ' dates). Delete some first.'); return; }
            id = state.nextId++;
            state.entries.push(Object.assign({ id }, r.entry));
            show('list-msg', 'Added: ' + C.upLine(r.entry, today) + '.', snap);
        }
        closeForm(); commit(); flash(id);
    }

    // ---------- add many ----------
    function showImport(rows, source) {
        const out = $('import-out'); out.textContent = '';
        const s = C.sortImport(rows, state.entries);
        const room = C.MAX_ENTRIES - state.entries.length;
        if (s.add.length > room) s.add.length = Math.max(0, room);
        pending = s.add;
        if (!rows.length) { out.appendChild(el('p', 'err', source === 'vcf' ? 'No birthdays or anniversaries were found in that contacts file.' : 'Type or paste at least one line, such as "Sara 24/10/1995".')); return; }
        const res = el('div', 'import');
        if (s.add.length) {
            res.appendChild(el('p', 'imp-h good-ink', s.add.length === 1 ? '1 to add:' : s.add.length + ' to add:'));
            const ul = el('ul', 'imp-list');
            s.add.slice(0, 40).forEach(e => ul.appendChild(el('li', null, e.name + ' — ' + C.kindLabel(e) + ', ' + C.since(e).replace(/^(Born|Married|Since) /, ''))));
            if (s.add.length > 40) ul.appendChild(el('li', null, '...and ' + (s.add.length - 40) + ' more'));
            res.appendChild(ul);
        }
        if (s.dup.length) res.appendChild(el('p', 'hint', (s.dup.length === 1 ? '1 is' : s.dup.length + ' are') + ' already on the list and will be left out.'));
        if (s.bad.length) {
            res.appendChild(el('p', 'imp-h bad-ink', (s.bad.length === 1 ? '1 line' : s.bad.length + ' lines') + ' could not be read:'));
            const ul = el('ul', 'imp-list bad');
            s.bad.slice(0, 20).forEach(r => ul.appendChild(el('li', null, '"' + r.line + '": ' + (r.error === 'no date found' ? 'no date found.' : r.error))));
            res.appendChild(ul);
            if (source !== 'vcf') res.appendChild(el('p', 'hint', 'Fix those lines above and tap "Check the list" again, or add them one by one.'));
        }
        if (rows.length && !s.add.length && !s.bad.length) res.appendChild(el('p', 'hint', 'Nothing new to add.'));
        if (s.add.length) {
            const b = el('div', 'row-btns');
            b.appendChild(btn('primary', 'Add ' + (s.add.length === 1 ? '1 date' : s.add.length + ' dates') + ' to the list', () => {
                const snap = snapshot();
                const count = pending.length;
                pending.forEach(e => state.entries.push(Object.assign({ id: state.nextId++ }, e)));
                pending = null; out.textContent = '';
                if (source !== 'vcf') $('paste').value = '';
                closeForm(); commit();
                show('list-msg', 'Added ' + (count === 1 ? '1 date' : count + ' dates') + ' to the list.', snap);
                if (window.matchMedia('(max-width: 899px)').matches) $('list').scrollIntoView({ block: 'start', behavior: 'smooth' });
            }));
            b.appendChild(btn('secondary', 'Cancel', () => { pending = null; out.textContent = ''; }));
            res.appendChild(b);
        }
        out.appendChild(res);
    }

    // ---------- settings ----------
    function syncSettings() { $('before').value = String(state.before); $('order').value = state.order; }

    function init() {
        state = load();
        fillDays();
        syncSettings();
        $('form').addEventListener('submit', submit);
        document.querySelectorAll('input[name=kind]').forEach(r => r.addEventListener('change', () => { syncKind(); syncPreview(); }));
        ['f-name', 'f-label', 'f-day', 'f-month', 'f-year', 'f-feb29'].forEach(id => $(id).addEventListener('input', syncPreview));
        $('f-day').addEventListener('change', syncPreview); $('f-month').addEventListener('change', syncPreview);
        $('o-note').addEventListener('click', () => { $('w-note').hidden = false; $('o-note').hidden = true; $('f-note').focus(); });
        $('open-form').addEventListener('click', () => openForm(null));
        $('cancel').addEventListener('click', () => { const was = editing; closeForm(); render(); if (was) flash(was); else if (!$('open-form').hidden) $('open-form').focus(); });
        $('del').addEventListener('click', () => {
            const e = entry(editing); if (!e) return;
            const snap = snapshot();
            state.entries = state.entries.filter(x => x.id !== e.id);
            closeForm(); commit();
            show('list-msg', 'Deleted ' + e.name + ' (' + C.kindLabel(e).toLowerCase() + ').', snap);
        });
        $('q').addEventListener('input', renderList);
        $('g-filter').addEventListener('change', renderList);

        $('read-paste').addEventListener('click', () => showImport(C.parsePaste($('paste').value, state.order, today), 'paste'));
        $('order').addEventListener('change', () => { state.order = $('order').value === 'md' ? 'md' : 'dm'; save(); if (pending && $('paste').value.trim()) showImport(C.parsePaste($('paste').value, state.order, today), 'paste'); });
        $('vcf-btn').addEventListener('click', () => $('vcf-file').click());
        $('vcf-file').addEventListener('change', () => {
            const f = $('vcf-file').files[0]; $('vcf-file').value = '';
            if (!f) return;
            if (f.size > 8e6) { $('import-out').textContent = ''; $('import-out').appendChild(el('p', 'err', 'That file is too big for a contacts file.')); return; }
            const rd = new FileReader();
            rd.onload = () => showImport(C.parseVcf(String(rd.result), today), 'vcf');
            rd.onerror = () => { $('import-out').textContent = ''; $('import-out').appendChild(el('p', 'err', 'That file could not be read.')); };
            rd.readAsText(f);
        });

        $('before').addEventListener('change', () => { const v = +$('before').value; state.before = C.BEFORE.includes(v) ? v : 1; save(); });
        $('cal-all').addEventListener('click', () => calendar(state.entries, 'birthdays-and-anniversaries.ics', 'set-msg'));
        $('copy-all').addEventListener('click', () => {
            if (!state.entries.length) { show('set-msg', 'The list is empty, so there is nothing to copy yet.'); return; }
            copyText(C.listText(state.entries, today)).then(ok => show('set-msg', ok ? 'Copied the list. Paste it into a message or a note.' : 'Your browser did not allow copying.'));
        });
        $('mail-all').addEventListener('click', ev => { if (!state.entries.length) { ev.preventDefault(); show('set-msg', 'The list is empty, so there is nothing to email yet.'); } });
        $('backup').addEventListener('click', () => {
            if (!state.entries.length) { show('set-msg', 'The list is empty, so there is nothing to back up yet.'); return; }
            download('birthdays-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1));
            show('set-msg', 'Saved a backup file with ' + state.entries.length + ' dates. Keep it somewhere safe.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', () => {
            const f = $('restore-file').files[0]; $('restore-file').value = '';
            if (!f) return;
            const rd = new FileReader();
            rd.onload = () => {
                let s = null;
                try { s = C.validate(JSON.parse(String(rd.result))); } catch (e) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app, so nothing was changed.'); return; }
                const snap = snapshot(); state = s; closeForm(); commit(); syncSettings();
                show('set-msg', 'Restored ' + (s.entries.length === 1 ? '1 date' : s.entries.length + ' dates') + ' from the backup.', snap);
            };
            rd.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.entries.length) { show('set-msg', 'The list is already empty.'); return; }
            const snap = snapshot(), keep = { order: state.order, before: state.before };
            state = Object.assign(C.emptyState(), keep); closeForm(); commit();
            show('set-msg', 'Deleted everything.', snap);
        });

        // The days left change at midnight, and when the app comes back from the background.
        setInterval(() => { if (C.todayIso() !== today) render(); }, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayIso() !== today) render(); });
        window.addEventListener('storage', ev => { if (ev.key === KEY) { state = load(); closeForm(); render(); syncSettings(); } });

        closeForm(); save(); render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
