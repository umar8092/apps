// Food and Medicine Expiry Tracker: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.ExpiryCore;
    const KEY = 'food-and-medicine-expiry-tracker.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    let canSave = true, state, today = C.todayIso();
    let editing = null;          // id of the item in the form, or null for a new one
    let formOpen = false;
    let kindTouched = false;     // the person chose "Date on the pack" themselves, so the place no longer changes it
    let filter = 'all';

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
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        ['list-msg', 'form-msg', 'set-msg'].forEach(o => { if (o !== id) clearMsg(o); });
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
    const item = id => state.items.find(it => it.id === id);
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
    const fileName = s => (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item');
    const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    function flash(id) {
        const t = document.querySelector('[data-id="' + id + '"]');
        if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1600); }
    }

    // ---------- the list ----------
    function render() {
        today = C.todayIso();
        renderSummary();
        const all = state.items, active = all.filter(it => it.status === 'active');
        // place filter: only places that have something, plus All
        const counts = C.countPlaces(all), used = Object.keys(C.PLACES).filter(p => counts[p]);
        if (filter !== 'all' && !counts[filter]) filter = 'all';
        const pl = $('places'); pl.textContent = '';
        pl.hidden = used.length < 2;
        if (used.length >= 2) {
            [['all', 'All', active.length]].concat(used.map(p => [p, C.PLACES[p], counts[p]])).forEach(([k, name, n]) => {
                const b = el('button', 'place', name + ' (' + n + ')'); b.type = 'button'; b.dataset.place = k;
                b.setAttribute('aria-pressed', String(filter === k));
                b.addEventListener('click', () => { filter = k; render(); });
                pl.appendChild(b);
            });
        }
        const q = $('find').value.trim().toLowerCase();
        $('find-wrap').hidden = all.length < 8;
        const qOn = all.length >= 8 && q;
        const shown = all.filter(it => (filter === 'all' || it.place === filter || it.status !== 'active') && (!qOn || [it.name, it.note, it.qty].some(v => v && v.toLowerCase().includes(q))));
        const g = C.groups(shown, today);
        if (filter !== 'all') g.archive = g.archive.filter(it => it.place === filter);
        $('empty').hidden = all.length > 0;
        $('none-here').hidden = !(active.length && qOn && !g.expired.length && !g.soon.length && !g.later.length && !g.archive.length);
        ['expired', 'soon', 'later', 'archive'].forEach(k => {
            const ul = $('l-' + k); ul.textContent = '';
            g[k].forEach(it => ul.appendChild(box(it)));
            $('g-' + k).hidden = !g[k].length;
        });
        $('archive-sum').textContent = 'Used up or thrown away (' + g.archive.length + ')';
        if (qOn && g.archive.length) $('g-archive').open = true;
        // the form is always open while the list is empty
        if (!all.length) formOpen = true;
        $('form').hidden = !formOpen;
        $('open-form').hidden = formOpen;
        $('form-h').hidden = !formOpen;   // the button says it already
        $('cancel').hidden = !all.length && editing == null;
        // sharing tools
        $('copy-all').disabled = !active.length; $('cal-all').disabled = !active.some(it => C.effDate(it) >= today); $('print-all').disabled = !active.length;
        const text = C.listText(all, today);
        let body = text || 'My food and medicine expiry dates';
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(The list is too long for an email link. Use "Copy the list" and paste it.)';
        $('mail-all').href = 'mailto:?subject=' + encodeURIComponent('Food and medicine expiry dates') + '&body=' + encodeURIComponent(body);
        const shop = C.shoppingList(all, today);
        $('shop').textContent = 'Copy a shopping list of what ran out' + (shop.length ? ' (' + shop.length + ')' : '');
        $('app').classList.toggle('setup', !all.length);
    }

    function renderSummary() {
        const b = $('sum-body'); b.textContent = '';
        const s = C.summary(state.items, today);
        if (!s.total) {
            b.appendChild(el('p', 'sum-empty', state.items.length
                ? 'Nothing left to watch: everything is used up or thrown away.'
                : 'Nothing added yet. Add what is in your fridge, cupboard or medicine box and the app shows what to use first.'));
        } else if (s.next) {
            const it = s.next, k = C.classify(it, today);
            b.appendChild(el('p', 'next', it.name + (it.qty ? ' (' + it.qty + ')' : '') + ', ' + C.PLACES[it.place].toLowerCase()));
            b.appendChild(el('p', 'next-left' + (k.section === 'soon' ? ' soon' : ''), C.statusLine(it, today)));
            const go = el('button', 'link', 'Show it in the list'); go.type = 'button';
            go.addEventListener('click', () => { filter = 'all'; $('find').value = ''; render(); flash(it.id); });
            b.appendChild(go);
        } else {
            b.appendChild(el('p', 'next expired', 'Everything in your list has passed its date.'));
        }
        if (s.expired) b.appendChild(el('p', 'alert', s.expired + (s.expired === 1 ? ' item has' : ' items have') + ' passed the date on the pack. Check "Expired" below.'));
        if (s.total) {
            const counts = el('ul', 'counts');
            const add = (n, text, cls) => { const li = el('li', cls || ''); li.appendChild(el('b', null, String(n))); li.appendChild(document.createTextNode(' ' + text)); counts.appendChild(li); };
            add(s.expired, 'expired', s.expired ? 'bad' : '');
            add(s.soon, 'use soon', s.soon ? 'warn' : '');
            add(s.later, 'later');
            b.appendChild(counts);
        }
        if (s.used30 || s.wasted30) b.appendChild(el('p', 'hint', 'Last 30 days: ' + s.used30 + ' used up, ' + s.wasted30 + ' thrown away.'));
    }

    function box(it) {
        const k = C.classify(it, today);
        const li = el('li', 'box ' + k.section); li.dataset.id = it.id;
        const top = el('div', 'box-top');
        top.appendChild(el('h4', 'box-name', it.name));
        li.appendChild(top);
        li.appendChild(el('p', 'box-sub', C.subLine(it, today)));
        if (it.status === 'active') li.appendChild(el('p', 'st ' + k.section, C.statusLine(it, today)));
        else li.appendChild(el('p', 'st done', (it.status === 'used' ? 'Used up' : 'Thrown away') + (it.statusDate ? ' on ' + C.shortDate(it.statusDate, today) : '')));
        if (it.note) li.appendChild(el('p', 'box-note', it.note));
        const btns = el('div', 'box-btns');
        const mini = (text, fn, cls) => { const b = el('button', 'mini' + (cls ? ' ' + cls : ''), text); b.type = 'button'; b.addEventListener('click', fn); btns.appendChild(b); return b; };
        if (it.status === 'active') {
            // past its date the usual next step is the bin, so that button comes first and "Opened" is not offered
            const gone = k.section === 'expired';
            if (gone) mini('Thrown away', () => setStatus(it.id, 'wasted'), 'strong').setAttribute('aria-label', 'Thrown away: ' + it.name);
            mini('Used up', () => setStatus(it.id, 'used'), gone ? '' : 'strong').setAttribute('aria-label', 'Used up: ' + it.name);
            if (!gone) mini('Thrown away', () => setStatus(it.id, 'wasted')).setAttribute('aria-label', 'Thrown away: ' + it.name);
            if (!gone && !it.opened) mini('Opened', () => openForm(it.id, { opened: true })).setAttribute('aria-label', 'Opened: ' + it.name);
            mini('Edit', () => openForm(it.id)).setAttribute('aria-label', 'Edit ' + it.name);
            if (C.effDate(it) >= today) mini('Calendar', () => calendar([it], fileName(it.name))).setAttribute('aria-label', 'Add ' + it.name + ' to my calendar');
        } else {
            mini('Put back', () => setStatus(it.id, 'active'), 'strong').setAttribute('aria-label', 'Put back ' + it.name);
            mini('Add again', () => addAgain(it.id)).setAttribute('aria-label', 'Add ' + it.name + ' again');
            mini('Delete', () => removeItem(it.id), 'bad').setAttribute('aria-label', 'Delete ' + it.name);
        }
        li.appendChild(btns);
        return li;
    }

    function setStatus(id, status) {
        const it = item(id); if (!it) return;
        const before = snapshot();
        it.status = status; it.statusDate = status === 'active' ? '' : today;
        commit();
        show('list-msg', status === 'used' ? 'Marked ' + it.name + ' as used up.' : status === 'wasted' ? 'Marked ' + it.name + ' as thrown away.' : 'Put ' + it.name + ' back in the list.', before);
    }
    function removeItem(id) {
        const it = item(id); if (!it) return;
        const before = snapshot();
        state.items = state.items.filter(x => x.id !== id);
        if (editing === id) closeForm();
        commit();
        show('list-msg', 'Deleted ' + it.name + '.', before);
    }
    function calendar(list, name) {
        const r = C.ics(list, today, stamp());
        if (!r.count) { show('set-msg', 'There are no dates still to come.'); return; }
        download(name + '.ics', 'text/calendar', r.text);
        show(list.length === 1 ? 'list-msg' : 'set-msg', 'Saved a calendar file with ' + r.count + (r.count === 1 ? ' date' : ' dates') + '. Open it to add ' + (r.count === 1 ? 'it' : 'them') + ' to your calendar.');
    }

    // ---------- the form ----------
    function fillMonthYear() {
        const m = $('f-month'), y = $('f-year');
        m.appendChild(new Option('Choose', ''));
        C.MONTHS.forEach((n, i) => m.appendChild(new Option(n + ' (' + String(i + 1).padStart(2, '0') + ')', String(i + 1))));
        const y0 = +today.slice(0, 4);
        y.appendChild(new Option('Choose', ''));
        for (let k = y0 - 3; k <= y0 + 10; k++) y.appendChild(new Option(String(k), String(k)));
    }
    function ensureYear(yr) {
        const y = $('f-year');
        if (yr && ![...y.options].some(o => o.value === String(yr))) { y.appendChild(new Option(String(yr), String(yr))); [...y.options].slice(1).sort((a, b) => a.value - b.value).forEach(o => y.appendChild(o)); }
    }
    const mode = () => ($('f-mode-month').checked ? 'month' : 'day');
    function setMode(m) {
        $('f-mode-day').checked = m === 'day'; $('f-mode-month').checked = m === 'month';
        $('w-day').hidden = m !== 'day'; $('w-month').hidden = m !== 'month';
    }
    const OPEN_PRESETS = ['1', '2', '3', '5', '7', '14', '28', '30', '60', '90'];
    function showOpen(on, opened, days) {
        $('w-open').hidden = !on; $('o-open').hidden = on;
        if (on) {
            $('f-opened').value = opened || today;
            const d = days ? String(days) : '3';
            if (OPEN_PRESETS.includes(d)) { $('f-opensel').value = d; $('f-opendays').value = ''; } else { $('f-opensel').value = 'custom'; $('f-opendays').value = d; }
            $('w-opendays').hidden = $('f-opensel').value !== 'custom';
        }
    }
    function showMore(on) { $('w-more').hidden = !on; $('o-more').hidden = on; }
    function readFields() {
        const open = !$('w-open').hidden;
        return { name: $('f-name').value, place: $('f-place').value, kind: $('f-kind').value, mode: mode(), date: $('f-date').value,
            month: $('f-month').value, year: $('f-year').value, opened: open ? $('f-opened').value : null,
            openDays: open ? ($('f-opensel').value === 'custom' ? $('f-opendays').value : $('f-opensel').value) : '',
            qty: $('w-more').hidden ? (editing != null && item(editing) ? item(editing).qty : '') : $('f-qty').value,
            note: $('w-more').hidden ? (editing != null && item(editing) ? item(editing).note : '') : $('f-note').value };
    }
    function clearErrors() {
        ['name', 'date', 'opened', 'opendays'].forEach(k => { $('e-' + k).textContent = ''; });
        ['f-name', 'f-date', 'f-month', 'f-year', 'f-opened', 'f-opensel', 'f-opendays'].forEach(id => $(id).removeAttribute('aria-invalid'));
    }
    function updatePreview() {
        const r = C.readForm(readFields(), today);
        const e = r.errs;
        const ready = !e.date && !e.opened && !e.openDays && r.item.date;
        if (!ready) { $('preview').textContent = ''; return; }
        const it = Object.assign({ id: 0, status: 'active', name: r.item.name || 'It' }, r.item);
        $('preview').textContent = C.statusLine(it, today) + '.';
    }
    const KIND_HINT = { use: 'Food that is not safe to eat after this date (milk, meat, fish).', best: 'Food that is often still fine after this date: check it first (bread, biscuits, rice).',
        exp: 'Medicines, vitamins, baby milk and others: do not use after this date.' };
    function kindHint() { $('h-kind').textContent = KIND_HINT[$('f-kind').value] || ''; }
    function resetFields(keep) {
        $('form').reset();
        $('f-place').value = keep && keep.place || state.lastPlace;
        $('f-kind').value = keep && keep.kind || ($('f-place').value === 'medicine' ? 'exp' : 'use');
        setMode(keep && keep.mode || 'day');
        $('f-month').value = ''; $('f-year').value = '';
        showOpen(false); showMore(false);
        clearErrors(); kindHint();
    }
    function openForm(id, opts) {
        opts = opts || {};
        editing = id == null ? null : id;
        formOpen = true; kindTouched = editing != null;
        resetFields();
        const it = editing != null ? item(editing) : null;
        if (it) {
            $('f-name').value = it.name; $('f-place').value = it.place; $('f-kind').value = it.kind;
            if (it.monthOnly) { setMode('month'); const p = C.parseDate(it.date); ensureYear(p.y); $('f-month').value = String(p.m); $('f-year').value = String(p.y); }
            else { setMode('day'); $('f-date').value = it.date; }
            if (it.opened) showOpen(true, it.opened, it.openDays);
            else if (opts.opened) showOpen(true, today, 3);
            if (it.qty || it.note) { showMore(true); $('f-qty').value = it.qty; $('f-note').value = it.note; }
        } else if (opts.from) {
            const f = opts.from;
            $('f-name').value = f.name; $('f-place').value = f.place; $('f-kind').value = f.kind; kindTouched = true;
            if (f.qty) { showMore(true); $('f-qty').value = f.qty; }
        }
        kindHint();
        $('form-h').textContent = it ? 'Change ' + it.name : 'Add food or medicine';
        $('save').textContent = it ? 'Save changes' : 'Add to my list';
        $('cancel').textContent = it ? 'Cancel' : 'Done';
        $('del').hidden = !it;
        render(); updatePreview();
        $('add').scrollIntoView({ block: 'start', behavior: 'smooth' });
        const focus = opts.opened ? $('f-opened') : opts.from ? (mode() === 'day' ? $('f-date') : $('f-month')) : $('f-name');
        setTimeout(() => focus.focus({ preventScroll: true }), 50);
    }
    function closeForm() {
        editing = null; formOpen = false;
        resetFields();
        $('form-h').textContent = 'Add food or medicine'; $('save').textContent = 'Add to my list'; $('cancel').textContent = 'Done'; $('del').hidden = true;
        $('preview').textContent = '';
    }
    function addAgain(id) {
        const it = item(id); if (!it) return;
        openForm(null, { from: it });
        show('form-msg', 'Choose the date on the new ' + it.name + ', then tap "Add to my list".');
    }
    function submit(ev) {
        ev.preventDefault();
        clearErrors();
        const r = C.readForm(readFields(), today);
        if (!r.ok) {
            const map = { name: ['f-name'], date: mode() === 'day' ? ['f-date'] : ['f-month', 'f-year'], opened: ['f-opened'], openDays: [$('f-opensel').value === 'custom' ? 'f-opendays' : 'f-opensel'] };
            let first = null;
            Object.keys(r.errs).forEach(k => {
                $('e-' + k.toLowerCase()).textContent = r.errs[k];
                (map[k] || []).forEach(id => { $(id).setAttribute('aria-invalid', 'true'); first = first || $(id); });
            });
            if (first) first.focus();
            return;
        }
        const before = snapshot();
        if (editing != null) {
            const it = item(editing); if (!it) { closeForm(); render(); return; }
            Object.assign(it, r.item);
            const name = it.name, id = it.id;
            closeForm(); commit();
            show('list-msg', 'Saved ' + name + '.', before);
            flash(id);
            return;
        }
        if (state.items.length >= C.MAX_ITEMS) { show('form-msg', 'The list is full (' + C.MAX_ITEMS + ' items). Delete some used up or thrown away items first.'); return; }
        const it = Object.assign({ id: state.nextId++, status: 'active', statusDate: '', added: today }, r.item);
        state.items.push(it);
        state.lastPlace = it.place;
        const keep = { place: it.place, kind: it.kind, mode: mode() };
        filter = filter === 'all' || filter === it.place ? filter : 'all';
        resetFields(keep);
        kindTouched = false;   // the next item starts from the same choices, and the place can change them again
        commit();
        $('preview').textContent = '';
        show('form-msg', 'Added ' + it.name + ': ' + C.statusLine(it, today).replace(/^./, c => c.toLowerCase()) + '. Add the next one, or tap Done.', before);
        $('f-name').focus({ preventScroll: true });
    }

    // ---------- wiring ----------
    function init() {
        state = load();
        fillMonthYear();
        resetFields();
        save();
        $('form').addEventListener('submit', submit);
        $('form').addEventListener('input', () => { updatePreview(); });
        $('form').addEventListener('change', () => { kindHint(); updatePreview(); });
        $('open-form').addEventListener('click', () => openForm(null));
        $('cancel').addEventListener('click', () => { closeForm(); render(); $('open-form').focus({ preventScroll: true }); });
        $('del').addEventListener('click', () => { if (editing != null) removeItem(editing); });
        $('f-place').addEventListener('change', () => {
            // medicines have an expiry date, food a use by or best before date, unless the person chose one for this item
            if (kindTouched) return;
            if ($('f-place').value === 'medicine') $('f-kind').value = 'exp';
            else if ($('f-kind').value === 'exp') $('f-kind').value = 'use';
        });
        $('f-kind').addEventListener('change', () => { kindTouched = true; });
        $('f-mode-day').addEventListener('change', () => setMode('day'));
        $('f-mode-month').addEventListener('change', () => setMode('month'));
        $('quick').addEventListener('click', e => {
            const b = e.target.closest('.chip'); if (!b) return;
            $('f-date').value = b.dataset.months ? C.addMonths(today, +b.dataset.months) : C.addDays(today, +b.dataset.days);
            $('f-date').removeAttribute('aria-invalid'); $('e-date').textContent = '';
            updatePreview();
        });
        $('o-open').addEventListener('click', () => { showOpen(true, today, 3); updatePreview(); $('f-opened').focus(); });
        $('x-open').addEventListener('click', () => { showOpen(false); $('e-opened').textContent = ''; $('e-opendays').textContent = ''; updatePreview(); $('o-open').focus(); });
        $('f-opensel').addEventListener('change', () => { $('w-opendays').hidden = $('f-opensel').value !== 'custom'; if (!$('w-opendays').hidden) $('f-opendays').focus(); });
        $('o-more').addEventListener('click', () => { showMore(true); $('f-qty').focus(); });
        $('find').addEventListener('input', render);

        $('copy-all').addEventListener('click', () => {
            const t = C.listText(state.items, today);
            copyText(t).then(ok => show('set-msg', ok ? 'Copied the list. Paste it into a message or a note.' : 'Your browser blocked copying. Use "Email the list" instead.'));
        });
        $('print-all').addEventListener('click', () => { filter = 'all'; $('find').value = ''; render(); window.print(); });
        $('cal-all').addEventListener('click', () => calendar(state.items, 'expiry-dates'));
        $('shop').addEventListener('click', () => {
            const list = C.shoppingList(state.items, today);
            if (!list.length) { show('set-msg', 'Nothing to buy yet. Items you mark "Used up" or "Thrown away" show up here for 30 days.'); return; }
            copyText('Shopping list\n' + list.map(n => '- ' + n).join('\n')).then(ok => show('set-msg', ok ? 'Copied a shopping list of ' + list.length + (list.length === 1 ? ' thing' : ' things') + ': ' + list.join(', ') + '.' : 'Your browser blocked copying.'));
        });
        $('backup').addEventListener('click', () => {
            download('food-and-medicine-expiry-backup-' + today + '.json', 'application/json', JSON.stringify({ app: C.SLUG, saved: today, state }));
            show('set-msg', 'Saved a backup file with ' + state.items.length + (state.items.length === 1 ? ' item.' : ' items.'));
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', () => {
            const file = $('restore-file').files[0]; $('restore-file').value = '';
            if (!file) return;
            if (file.size > 20e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            const r = new FileReader();
            r.onload = () => {
                let s = null;
                try { const j = JSON.parse(r.result); s = C.validate(j && j.state ? j.state : j); } catch (e) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app, so nothing was changed.'); return; }
                const before = snapshot();
                state = s; closeForm(); commit();
                show('set-msg', 'Restored ' + s.items.length + (s.items.length === 1 ? ' item' : ' items') + ' from the backup.', before);
            };
            r.onerror = () => show('set-msg', 'That file could not be read.');
            r.readAsText(file);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.items.length) { show('set-msg', 'The list is already empty.'); return; }
            const before = snapshot();
            state = C.emptyState(); closeForm(); filter = 'all'; commit();
            show('set-msg', 'Deleted everything.', before);
        });
        // the days left change at midnight
        const tick = () => { if (C.todayIso() !== today) { render(); updatePreview(); } };
        setInterval(tick, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
