// Lent and Borrowed Items Tracker: the page. The dates and words live in core.js.
(function () {
    'use strict';
    const C = window.LentCore, SLUG = 'lent-and-borrowed-items-tracker', KEY = SLUG + '.data', PHOTO = SLUG + '.photo.';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; };

    let data = { v: 1, items: [] }, photos = {}, canSave = true, today = C.localToday();
    let tab = 'lent', who = null, query = '', remindOpen = null, undo = null;
    const form = { editing: null, photo: undefined };   // photo: undefined = unchanged, null = none, string = new photo

    // ---------- saving ----------
    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            data = C.restore(raw ? JSON.parse(raw) : null);
        } catch (e) { data = C.restore(null); }
        data.items.forEach(it => {
            if (!it.hasPhoto) return;
            let p = null; try { p = localStorage.getItem(PHOTO + it.id); } catch (e) { p = null; }
            if (C.isPhoto(p)) photos[it.id] = p; else it.hasPhoto = false;
        });
        try {   // photos of items that no longer exist
            const ids = new Set(data.items.map(i => i.id));
            Object.keys(localStorage).filter(k => k.startsWith(PHOTO) && !ids.has(k.slice(PHOTO.length))).forEach(k => localStorage.removeItem(k));
        } catch (e) { /* storage blocked */ }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(data)); canSave = true; }
        catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    function savePhoto(id, p) {
        try { if (p) localStorage.setItem(PHOTO + id, p); else localStorage.removeItem(PHOTO + id); return true; }
        catch (e) { return false; }
    }
    function testStorage() {
        try { localStorage.setItem(SLUG + '.test', '1'); localStorage.removeItem(SLUG + '.test'); return true; } catch (e) { return false; }
    }
    const snap = () => ({ items: JSON.parse(JSON.stringify(data.items)), photos: Object.assign({}, photos) });
    function restoreSnap(s) {
        const old = Object.keys(photos);
        data.items = s.items; photos = s.photos;
        old.filter(id => !photos[id]).forEach(id => savePhoto(id, null));
        Object.keys(photos).forEach(id => savePhoto(id, photos[id]));
        save();
    }

    // ---------- messages ----------
    function say(box, text, withUndo) {
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (withUndo && undo) {
            const u = undo;
            box.appendChild(btn('undo', 'Undo', () => { restoreSnap(u.snap); undo = null; box.textContent = ''; box.classList.remove('show'); if (u.tab) setTab(u.tab); render(); say(box, 'Undone.'); }));
        }
    }
    const clearMsg = box => { box.textContent = ''; box.classList.remove('show'); };
    function change(fn, box, text, extra) {
        undo = Object.assign({ snap: snap() }, extra || {});
        fn(); save(); render();
        say(box, text, true);
    }

    // ---------- the top tiles ----------
    function tiles() {
        const s = C.summary(data.items, today), box = $('tiles'); box.textContent = '';
        const tile = (kind, n, late, dueToday, label, empty) => {
            const t = btn('tile' + (late ? ' t-late' : dueToday ? ' t-today' : '') + (tab === kind ? ' on' : ''), '', () => { setTab(kind); render(); $('list').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
            t.setAttribute('aria-label', label + ': ' + C.plural(n, 'thing') + (late ? ', ' + late + ' late' : '') + (dueToday ? ', ' + dueToday + ' due today' : '') + '. Show the list.');
            t.appendChild(el('span', 'tile-k', label));
            t.appendChild(el('span', 'tile-n', String(n)));
            t.appendChild(el('span', 'tile-s', n === 0 ? empty : [late ? late + ' late' : '', dueToday ? dueToday + ' due today' : ''].filter(Boolean).join(' · ') || (n === 1 ? 'thing, none late' : 'things, none late')));
            box.appendChild(t);
        };
        tile('lent', s.lent, s.lentLate, s.lentToday, 'You lent out', 'Nothing out');
        tile('borrowed', s.borrowed, s.borrowedLate, s.borrowedToday, 'You borrowed', 'Nothing to give back');
    }

    // ---------- the list ----------
    function setTab(t) { tab = t; document.querySelector('input[name=tab][value="' + t + '"]').checked = true; remindOpen = null; }
    function visible() {
        return data.items.filter(it => (tab === 'back' ? !!it.returned : !it.returned && it.kind === tab) &&
            (!who || C.same(it.who, who)) && (!query || C.matches(it, query)));
    }
    function render() {
        today = C.localToday();
        tiles();
        const s = C.summary(data.items, today);
        $('cnt-lent').textContent = s.lent; $('cnt-borrowed').textContent = s.borrowed; $('cnt-back').textContent = s.back;
        $('search-wrap').hidden = data.items.length < 5 && !query;
        if (who && !data.items.some(i => C.same(i.who, who))) who = null;
        $('filter').hidden = !who;
        if (who) $('filter-text').textContent = 'Showing only ' + who + '.';
        list(); people(); datalist(); updatePreview();
    }
    function list() {
        const body = $('list-body'); body.textContent = '';
        let items = visible();
        items = tab === 'back' ? C.sortBack(items) : C.sortOpen(items, today);
        if (!items.length) {
            let t;
            if (query || who) t = 'Nothing here matches' + (who ? ' ' + who : '') + (query ? ' "' + query + '"' : '') + '.';
            else if (tab === 'lent') t = data.items.length ? 'Nothing lent out right now. Everything you lent has come back.' : 'Nothing yet. Lent a book, a tool or a dish to someone? Add it with "Add something you lent or borrowed" and you will always know who has it.';
            else if (tab === 'borrowed') t = 'Nothing borrowed right now. Borrowed something? Choose "I borrowed it" when you add it.';
            else t = 'Nothing returned yet. When something comes back, tap "Got it back" and it shows here with how long it was away.';
            body.appendChild(el('p', 'empty', t));
            return;
        }
        const ul = el('ul', 'items');
        items.forEach(it => ul.appendChild(box(it)));
        body.appendChild(ul);
    }
    function box(it) {
        const w = C.words(it, today), lent = it.kind === 'lent';
        const li = el('li', 'item st-' + w.state); li.dataset.id = it.id;
        const top = el('div', 'item-top');
        if (photos[it.id]) {
            const pb = btn('thumb', '', () => { const big = li.classList.toggle('big-photo'); pb.setAttribute('aria-expanded', big ? 'true' : 'false'); });
            pb.setAttribute('aria-label', 'Show the photo of ' + it.what + ' bigger'); pb.setAttribute('aria-expanded', 'false');
            const img = el('img'); img.src = photos[it.id]; img.alt = ''; pb.appendChild(img); top.appendChild(pb);
        }
        const main = el('div', 'item-main');
        const h = el('h3', 'item-what', it.what);
        if (tab === 'back') h.appendChild(el('span', 'kind-tag', lent ? 'lent' : 'borrowed'));
        main.appendChild(h);
        main.appendChild(el('p', 'item-line', w.line));
        main.appendChild(el('p', 'tag tag-' + w.state, w.tag));
        top.appendChild(main); li.appendChild(top);
        if (it.note) li.appendChild(el('p', 'item-note', it.note));
        const row = el('div', 'item-btns');
        if (!it.returned) {
            row.appendChild(btn('primary small', lent ? 'Got it back' : 'Gave it back', () => markBack(it)));
            if (lent) { const r = btn('secondary small', 'Remind', () => { remindOpen = remindOpen === it.id ? null : it.id; list(); if (remindOpen) { const ta = document.getElementById('rem-' + it.id); if (ta) ta.focus(); } }); r.setAttribute('aria-expanded', remindOpen === it.id ? 'true' : 'false'); row.appendChild(r); }
        } else {
            row.appendChild(btn('secondary small', lent ? 'Lend again' : 'Borrow again', () => again(it)));
            row.appendChild(btn('secondary small', 'Not back yet', () => reopen(it)));
        }
        row.appendChild(btn('secondary small', 'Edit', () => startEdit(it)));
        row.appendChild(btn('secondary small del', 'Delete', () => remove(it)));
        li.appendChild(row);
        if (remindOpen === it.id && !it.returned) li.appendChild(remindPanel(it));
        return li;
    }
    function remindPanel(it) {
        const panel = el('div', 'panel');
        panel.appendChild(el('h4', null, 'Message for ' + it.who));
        const id = 'rem-' + it.id, lab = el('label', null, 'Change the words if you like'); lab.htmlFor = id; panel.appendChild(lab);
        const ta = el('textarea'); ta.id = id; ta.rows = 4; ta.maxLength = 1000; ta.value = C.reminderText(it, today); panel.appendChild(ta);
        const msg = el('div', 'msg'); msg.setAttribute('role', 'status');
        const row = el('div', 'row-btns');
        row.appendChild(btn('primary small', 'Copy', () => copyText(ta.value, msg)));
        if (navigator.share) row.appendChild(btn('secondary small', 'Share', () => { navigator.share({ text: ta.value }).catch(() => {}); }));
        const mail = el('a', 'secondary small', 'Email'); mail.href = mailto('About my ' + it.what, ta.value);
        ta.addEventListener('input', () => { mail.href = mailto('About my ' + it.what, ta.value); });
        row.appendChild(mail);
        row.appendChild(btn('secondary small', 'Close', () => { remindOpen = null; list(); }));
        panel.appendChild(row); panel.appendChild(msg);
        return panel;
    }

    // ---------- actions on an item ----------
    const find = id => data.items.find(i => i.id === id);
    function markBack(it) {
        const lent = it.kind === 'lent', w = C.words(it, today);
        if (form.editing === it.id) resetForm();
        change(() => { find(it.id).returned = today; remindOpen = null; }, $('list-msg'),
            (lent ? 'Got back ' : 'Gave back ') + it.what + (lent ? ' from ' : ' to ') + it.who + ' after ' + C.span(w.held) + '. It is now under Returned.', { tab });
    }
    function reopen(it) {
        change(() => { find(it.id).returned = null; }, $('list-msg'), it.what + ' is back on the ' + (it.kind === 'lent' ? 'Lent out' : 'Borrowed') + ' list.', { tab });
    }
    function remove(it) {
        if (form.editing === it.id) resetForm();
        change(() => { data.items = data.items.filter(i => i.id !== it.id); delete photos[it.id]; savePhoto(it.id, null); }, $('list-msg'), 'Deleted ' + it.what + '.');
    }
    function again(it) {
        resetForm();
        setKind(it.kind);
        $('f-what').value = it.what; $('f-who').value = it.who;
        if (it.note) { $('f-note').value = it.note; showOpt('note', true); }
        if (photos[it.id]) { form.photo = photos[it.id]; showOpt('photo', true); showPhoto(); }
        updatePreview();
        $('add').scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('f-date').focus({ preventScroll: true });
        say($('add-msg'), 'Filled in ' + it.what + ' for ' + it.who + '. Check the day and tap "Add to my list".');
    }

    // ---------- people ----------
    function people() {
        const ppl = C.people(data.items), body = $('people-body'); body.textContent = '';
        $('people').hidden = !ppl.length;
        if (!ppl.length) return;
        const ul = el('ul', 'ppl');
        ppl.forEach(p => {
            const li = el('li', 'person' + (who && C.same(who, p.name) ? ' on' : ''));
            const m = el('div', 'person-main');
            m.appendChild(el('h3', 'person-name', p.name));
            m.appendChild(el('p', 'person-line', C.personLine(p)));
            li.appendChild(m);
            const b = btn('secondary small', who && C.same(who, p.name) ? 'Show everyone' : 'Show only ' + p.name, () => {
                who = who && C.same(who, p.name) ? null : p.name;
                if (who) { const open = data.items.filter(i => C.same(i.who, who) && !i.returned); const k = open.length ? (open.some(i => i.kind === tab) ? tab : open[0].kind) : 'back'; setTab(k); }
                render(); $('list').scrollIntoView({ block: 'start', behavior: 'smooth' });
            });
            li.appendChild(b); ul.appendChild(li);
        });
        body.appendChild(ul);
    }
    function datalist() {
        const dl = $('people-list'); dl.textContent = '';
        C.people(data.items).forEach(p => { const o = el('option'); o.value = p.name; dl.appendChild(o); });
    }

    // ---------- the form ----------
    const kindNow = () => document.querySelector('input[name=kind]:checked').value;
    const dueNow = () => document.querySelector('input[name=due]:checked').value;
    function setKind(k) {
        document.querySelector('input[name=kind][value="' + k + '"]').checked = true;
        const lent = k === 'lent';
        $('l-who').textContent = lent ? 'Who has it' : 'Who lent it to you';
        $('f-who').placeholder = lent ? 'e.g. Bilal' : 'e.g. Aunt Sara';
        $('l-date').textContent = lent ? 'Day you lent it' : 'Day you borrowed it';
        $('l-returned').textContent = lent ? 'Came back on' : 'Gave it back on';
        $('f-what').placeholder = lent ? 'e.g. Drill, novel, charger' : 'e.g. Cake tin, ladder';
    }
    function setDue(v) { document.querySelector('input[name=due][value="' + v + '"]').checked = true; $('w-due').hidden = v !== 'custom'; }
    function showOpt(name, on) { $('w-' + name).hidden = !on; $('o-' + name).hidden = on; }
    function showPhoto() {
        const p = form.photo === undefined ? (form.editing ? photos[form.editing] || null : null) : form.photo;
        $('photo-prev').hidden = !p; $('photo-pick').textContent = p ? 'Change photo' : 'Choose or take a photo';
        if (p) $('photo-img').src = p; else $('photo-img').removeAttribute('src');
    }
    function readPhoto(file) {
        $('e-photo').textContent = '';
        if (!file) return;
        if (file.type && !/^image\//.test(file.type)) { $('e-photo').textContent = 'That file is not a photo. Pick a photo or take a new one.'; return; }
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => {
            const k = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            form.photo = c.toDataURL('image/jpeg', 0.7);
            showPhoto();
        };
        img.onerror = () => { URL.revokeObjectURL(url); $('e-photo').textContent = 'This browser cannot open that photo. Try another one.'; };
        img.src = url;
    }
    function fields() {
        return { kind: kindNow(), what: $('f-what').value, who: $('f-who').value, date: $('f-date').value, duePreset: dueNow(), dueDate: $('f-due').value,
            note: $('f-note').value, returned: form.editing && find(form.editing) && find(form.editing).returned ? $('f-returned').value || '' : null };
    }
    function showErrs(errs) {
        ['what', 'who', 'date', 'due', 'returned'].forEach(k => {
            $('e-' + k).textContent = errs[k] || '';
            const input = k === 'due' ? $('f-due') : $('f-' + k);
            if (errs[k]) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
        });
    }
    function updatePreview() {
        const p = $('preview'); p.textContent = '';
        const f = fields();
        if (!C.isDate(f.date) || f.date > today) return;
        const due = C.dueFrom(f.duePreset, f.date, f.dueDate);
        const bits = [];
        if (due && C.isDate(due) && due >= f.date) {
            const it = { kind: f.kind, what: 'x', who: 'x', date: f.date, due, returned: null };
            const s = C.status(it, today);
            bits.push((f.kind === 'lent' ? 'Due back ' : 'Give back by ') + C.fmtDate(due, today) +
                (s.state === 'late' ? ', already ' + C.plural(s.late, 'day') + ' late.' : s.state === 'today' ? ', that is today.' : ', in ' + C.plural(s.left, 'day') + '.'));
        } else if (f.duePreset === 'none') bits.push('No give-back date. The list will show how long it has been away.');
        const what = C.clean(f.what, 80);
        if (what) {
            const dup = data.items.find(i => !i.returned && i.id !== form.editing && C.same(i.what, what));
            if (dup) bits.push('Note: ' + dup.what + ' is already on your list as ' + (dup.kind === 'lent' ? 'with ' : 'borrowed from ') + dup.who + '.');
        }
        p.textContent = bits.join(' ');
    }
    function resetForm() {
        form.editing = null; form.photo = undefined;
        $('form').reset(); setKind('lent'); setDue('none');
        $('f-date').value = today; $('f-date').max = today;
        showErrs({}); showOpt('photo', false); showOpt('note', false); $('e-photo').textContent = '';
        $('w-returned').hidden = true; showPhoto();
        $('f-save').textContent = 'Add to my list'; $('f-cancel').hidden = true; $('add-h').textContent = 'Add something you lent or borrowed';
        updatePreview();
    }
    function startEdit(it) {
        resetForm();
        form.editing = it.id;
        setKind(it.kind);
        $('f-what').value = it.what; $('f-who').value = it.who; $('f-date').value = it.date;
        if (it.due) { setDue('custom'); $('f-due').value = it.due; } else setDue('none');
        if (it.note) { $('f-note').value = it.note; showOpt('note', true); }
        if (photos[it.id]) showOpt('photo', true);
        showPhoto();
        $('w-returned').hidden = !it.returned; if (it.returned) { $('f-returned').value = it.returned; $('f-returned').max = today; }
        $('add-h').textContent = 'Edit ' + it.what; $('f-save').textContent = 'Save changes'; $('f-cancel').hidden = false;
        clearMsg($('add-msg')); updatePreview();
        $('add').scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('f-what').focus({ preventScroll: true });
    }
    function submit(e) {
        e.preventDefault();
        const r = C.readForm(fields(), today);
        if (!r.ok) {
            showErrs(r.errs);
            const first = ['what', 'who', 'date', 'due', 'returned'].find(k => r.errs[k]);
            (first === 'due' ? $('f-due') : $('f-' + first)).focus();
            return;
        }
        showErrs({});
        const editing = form.editing, ph = form.photo;
        let photoMsg = '';
        undo = { snap: snap(), tab };
        let it;
        if (editing && find(editing)) { it = find(editing); Object.assign(it, r.item); }
        else { it = Object.assign({ id: C.newId(), hasPhoto: false }, r.item); data.items.push(it); }
        if (ph !== undefined) {
            if (ph) { photos[it.id] = ph; it.hasPhoto = savePhoto(it.id, ph); if (!it.hasPhoto && canSave) photoMsg = ' The photo could not be kept because this device is full, so it shows only until you close the page.'; }
            else { delete photos[it.id]; it.hasPhoto = false; savePhoto(it.id, null); }
        }
        save();
        setTab(it.returned ? 'back' : it.kind);
        resetForm(); render();
        say($('add-msg'), (editing ? 'Saved changes to ' : 'Added ') + it.what + (it.kind === 'lent' ? ' (with ' : ' (from ') + it.who + ').' + photoMsg, true);
    }

    // ---------- share, print, backup ----------
    async function copyText(text, box) {
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px'; document.body.appendChild(t); t.select();
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        }
        say(box, ok ? 'Copied. Paste it into a message, note or email.' : 'Could not copy here. Select the text and copy it by hand.');
    }
    const mailto = (subject, body) => 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body.length > 1800 ? body.slice(0, 1800) + '\n...' : body);
    function download(name, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    function wire() {
        document.querySelectorAll('input[name=tab]').forEach(r => r.addEventListener('change', () => { tab = r.value; remindOpen = null; render(); }));
        document.querySelectorAll('input[name=kind]').forEach(r => r.addEventListener('change', () => { setKind(r.value); updatePreview(); }));
        document.querySelectorAll('input[name=due]').forEach(r => r.addEventListener('change', () => {
            setDue(r.value);
            if (r.value === 'custom' && !$('f-due').value && C.isDate($('f-date').value)) $('f-due').value = C.addDays($('f-date').value, 7);
            $('e-due').textContent = ''; $('f-due').removeAttribute('aria-invalid'); updatePreview();
        }));
        ['f-what', 'f-who', 'f-date', 'f-due', 'f-returned'].forEach(id => $(id).addEventListener('input', () => { $('e-' + id.slice(2)).textContent = ''; $(id).removeAttribute('aria-invalid'); updatePreview(); }));
        $('f-date').addEventListener('change', updatePreview);
        $('o-photo').addEventListener('click', () => { showOpt('photo', true); $('photo-pick').focus(); });
        $('o-note').addEventListener('click', () => { showOpt('note', true); $('f-note').focus(); });
        $('f-photo').addEventListener('change', e => { readPhoto(e.target.files[0]); e.target.value = ''; });
        $('photo-remove').addEventListener('click', () => { form.photo = null; showPhoto(); });
        $('form').addEventListener('submit', submit);
        $('f-cancel').addEventListener('click', () => { resetForm(); clearMsg($('add-msg')); });
        $('search').addEventListener('input', e => { query = e.target.value; remindOpen = null; list(); });
        $('filter-clear').addEventListener('click', () => { who = null; render(); });

        $('copy').addEventListener('click', () => copyText(C.listText(data.items, today), $('set-msg')));
        const refreshMail = () => { $('mail').href = mailto('Things I lent and borrowed', C.listText(data.items, today)); };
        $('mail').addEventListener('click', refreshMail); $('mail').addEventListener('focus', refreshMail); $('mail').addEventListener('pointerdown', refreshMail);
        $('csv').addEventListener('click', () => {
            if (!data.items.length) { say($('set-msg'), 'Nothing to download yet. Add something first.'); return; }
            download('lent-and-borrowed-' + today + '.csv', '﻿' + C.csv(data.items, today), 'text/csv');
            say($('set-msg'), 'Downloaded ' + C.plural(data.items.length, 'item') + ' as a CSV file.');
        });
        $('print').addEventListener('click', () => window.print());
        $('backup').addEventListener('click', () => {
            const out = { app: SLUG, saved: today, v: 1, items: data.items, photos: {} };
            data.items.forEach(i => { if (photos[i.id]) out.photos[i.id] = photos[i.id]; });
            download('lent-and-borrowed-backup-' + today + '.json', JSON.stringify(out), 'application/json');
            say($('set-msg'), 'Backup saved with ' + C.plural(data.items.length, 'item') + '. Keep the file somewhere safe.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => {
            const f = e.target.files[0]; e.target.value = '';
            if (!f) return;
            const rd = new FileReader();
            rd.onload = () => {
                let raw; try { raw = JSON.parse(rd.result); } catch (err) { raw = null; }
                const got = C.restore(raw);
                if (!raw || raw.app !== SLUG || (!got.items.length && !(Array.isArray(raw.items) && raw.items.length === 0))) { say($('set-msg'), 'That file is not a backup from this app. Nothing was changed.'); return; }
                const ph = {};
                got.items.forEach(i => { const p = raw.photos && raw.photos[i.id]; if (C.isPhoto(p)) { ph[i.id] = p; i.hasPhoto = true; } else i.hasPhoto = false; });
                change(() => { restoreSnap({ items: got.items, photos: ph }); data.items.forEach(i => { if (photos[i.id]) i.hasPhoto = savePhoto(i.id, photos[i.id]); }); who = null; query = ''; $('search').value = ''; resetForm(); },
                    $('set-msg'), 'Restored ' + C.plural(got.items.length, 'item') + ' from the backup.');
            };
            rd.onerror = () => say($('set-msg'), 'Could not read that file.');
            rd.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            if (!data.items.length) { say($('set-msg'), 'There is nothing to delete.'); return; }
            change(() => { Object.keys(photos).forEach(id => savePhoto(id, null)); photos = {}; data.items = []; who = null; query = ''; $('search').value = ''; resetForm(); },
                $('set-msg'), 'Deleted everything.');
        });

        // day counts move on at midnight and when the page comes back
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.localToday() !== today) { render(); $('f-date').max = today; } });
        setInterval(() => { if (C.localToday() !== today) { render(); $('f-date').max = today; } }, 60000);
        window.addEventListener('storage', e => { if (e.key === KEY) { photos = {}; load(); render(); } });
    }

    canSave = testStorage();
    load();
    $('storage-warn').hidden = canSave;
    wire();
    resetForm();
    render();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
