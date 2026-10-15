// Warranty and Return Deadline Tracker: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.WarrantyCore;
    const KEY = 'warranty-and-return-deadline-tracker.state';
    const DB_NAME = 'warranty-and-return-deadline-tracker.receipts';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    let canSave = true, state, today = C.todayIso();
    let editing = null;          // id of the item in the form, or null for a new one
    let formOpen = false;
    let formPhoto = null;        // { id } existing, or { data, type } new, or null
    const memPhotos = {};        // used when the browser has no IndexedDB (photos then last until the page closes)

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

    // ---------- receipt photos (IndexedDB) ----------
    let dbp = null;
    function db() {
        if (dbp) return dbp;
        dbp = new Promise((res, rej) => {
            try {
                const r = indexedDB.open(DB_NAME, 1);
                r.onupgradeneeded = () => r.result.createObjectStore('files');
                r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
            } catch (e) { rej(e); }
        });
        return dbp;
    }
    function tx(mode, fn) {
        return db().then(d => new Promise((res, rej) => { const t = d.transaction('files', mode), s = t.objectStore('files'); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }));
    }
    const putPhoto = (id, data) => tx('readwrite', s => s.put(data, id)).catch(() => { memPhotos[id] = data; });
    const getPhoto = id => memPhotos[id] ? Promise.resolve(memPhotos[id]) : tx('readonly', s => s.get(id)).catch(() => null);
    const photoKeys = () => tx('readonly', s => s.getAllKeys()).catch(() => []);
    // Removes receipt files no item uses any more (after deletes whose Undo time has passed, at the next visit).
    function tidyPhotos() {
        const used = new Set(state.items.map(it => it.photo).filter(Boolean));
        photoKeys().then(keys => (keys || []).filter(k => !used.has(k)).forEach(k => tx('readwrite', s => s.delete(k)).catch(() => {})));
    }
    const newPhotoId = () => 'p' + Date.now() + String(Math.floor(Math.random() * 90 + 10));
    // Makes a photo smaller (longest side 1600 px, JPEG) so many receipts fit on the phone.
    function shrink(file) {
        return new Promise((res, rej) => {
            const url = URL.createObjectURL(file), img = new Image();
            img.onload = () => {
                const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
                const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
                const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82));
            };
            img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
            img.src = url;
        });
    }
    const readAsData = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    function dataToBlobUrl(data) {
        const [head, b64] = data.split(','), type = head.slice(5, head.indexOf(';')), bin = atob(b64), a = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([a], { type }));
    }

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
    const sym = () => state.cur;
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

    // ---------- the list ----------
    function render() {
        today = C.todayIso();
        renderSummary();
        const q = $('find').value.trim().toLowerCase();
        const all = state.items;
        $('find-wrap').hidden = all.length < 6;
        const match = it => !q || [it.name, it.shop, it.order, it.serial, it.note].some(v => v && v.toLowerCase().includes(q));
        const shown = all.length >= 6 ? all.filter(match) : all;
        $('find-none').hidden = !(q && all.length && !shown.length);
        const g = C.groups(shown, today);
        $('empty').hidden = all.length > 0;
        ['return', 'warranty', 'ended', 'archive'].forEach(k => {
            const ul = $('l-' + k); ul.textContent = '';
            g[k].forEach(it => ul.appendChild(box(it)));
            $('g-' + k).hidden = !g[k].length;
        });
        $('archive-sum').textContent = 'Returned or no longer have (' + g.archive.length + ')';
        if (q && g.archive.length) $('g-archive').open = true;
        // the form is always open while the list is empty
        if (!all.length) formOpen = true;
        $('form').hidden = !formOpen;
        $('open-form').hidden = formOpen;
        $('form-h').hidden = !formOpen;   // the button says it already
        $('cancel').hidden = !all.length && editing == null;
        // sharing tools
        const active = all.filter(it => it.status === 'active');
        $('copy-all').disabled = !active.length; $('cal-all').disabled = !active.length;
        const text = C.listText(all, today, sym());
        let body = text || 'My purchases, return deadlines and warranties';
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(The list is too long for an email link. Use "Copy the list" and paste it.)';
        $('mail-all').href = 'mailto:?subject=' + encodeURIComponent('My purchases, return deadlines and warranties') + '&body=' + encodeURIComponent(body);
        $('cur').value = state.cur;
        $('cur-sym').textContent = state.cur; $('cur-sym').hidden = !state.cur;
        $('app').classList.toggle('setup', !all.length);
    }

    function renderSummary() {
        const b = $('sum-body'); b.textContent = '';
        const s = C.summary(state.items, today, sym());
        if (!s.total) {
            b.appendChild(el('p', 'sum-empty', state.items.length
                ? 'Nothing to watch: everything is returned or put away.'
                : 'Nothing added yet. Add what you bought and the app shows the last day to return it and when its warranty ends.'));
            return;
        }
        if (s.next) {
            const it = item(s.next.id), k = C.classify(it, today);
            const p = el('p', 'next' + (k.soon ? ' soon' : ''));
            if (s.next.kind === 'return') p.appendChild(document.createTextNode('Return ' + it.name + (it.shop ? ' to ' + it.shop : '') + ' by ' + C.shortDate(s.next.date, today)));
            else p.appendChild(document.createTextNode((C.extEnd(it) && C.extEnd(it) === s.next.date ? 'Extended warranty on ' : 'Warranty on ') + it.name + ' ends ' + C.shortDate(s.next.date, null)));
            b.appendChild(p);
            const left = el('p', 'next-left' + (k.soon ? ' soon' : ''), s.next.left.charAt(0).toUpperCase() + s.next.left.slice(1));
            b.appendChild(left);
            const go = el('button', 'link', 'Show it in the list'); go.type = 'button';
            go.addEventListener('click', () => { const t = document.querySelector('[data-id="' + it.id + '"]'); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1600); } });
            b.appendChild(go);
        } else {
            b.appendChild(el('p', 'next', 'No dates to watch: everything left has a lifetime warranty or no cover.'));
        }
        const counts = el('ul', 'counts');
        const add = (n, text, cls) => { const li = el('li', cls || ''); li.appendChild(el('b', null, String(n))); li.appendChild(document.createTextNode(' ' + text)); counts.appendChild(li); };
        add(s.canReturn, s.canReturn === 1 ? 'can still be returned' : 'can still be returned', s.soonReturn ? 'warn' : '');
        add(s.covered, 'under warranty', s.soonWar ? 'warn' : '');
        add(s.ended, 'cover ended');
        b.appendChild(counts);
        const notes = [];
        if (s.soonReturn) notes.push(s.soonReturn + (s.soonReturn === 1 ? ' return closes' : ' returns close') + ' within 7 days.');
        if (s.soonWar) notes.push(s.soonWar + (s.soonWar === 1 ? ' warranty ends' : ' warranties end') + ' within 30 days.');
        if (s.coveredWorth > 0) notes.push(C.fmt(s.coveredWorth, sym()) + ' of your things are under warranty.');
        if (notes.length) b.appendChild(el('p', 'hint', notes.join(' ')));
    }

    function box(it) {
        const k = C.classify(it, today);
        const li = el('li', 'box ' + k.section + (k.soon ? ' soon' : '')); li.dataset.id = it.id;
        const top = el('div', 'box-top');
        top.appendChild(el('h4', 'box-name', it.name));
        if (it.price != null) top.appendChild(el('span', 'badge', C.fmt(it.price, sym())));
        li.appendChild(top);
        const sub = [it.shop, 'bought ' + C.longDate(it.bought, false), it.delivered ? 'delivered ' + C.longDate(it.delivered, false) : ''].filter(Boolean).join(' · ');
        li.appendChild(el('p', 'box-sub', sub.charAt(0).toUpperCase() + sub.slice(1)));
        const lines = el('ul', 'dl');
        const line = (text, cls) => { if (text) lines.appendChild(el('li', cls, text)); };
        if (it.status === 'returned') line('Returned' + (it.statusDate ? ' on ' + C.longDate(it.statusDate, false) : ''), 'done');
        else if (it.status === 'gone') line('No longer have it' + (it.statusDate ? ', since ' + C.longDate(it.statusDate, false) : ''), 'done');
        else {
            const r = C.returnEnd(it);
            line(C.returnLine(it, today), 'ret' + (k.returnOpen ? (k.section === 'return' && k.soon ? ' urgent' : ' open') : ' off'));
            const w = C.warrantyEnd(it), wl = C.warrantyLine(it, today), e = C.extEnd(it);
            const wSoon = w && w !== 'life' && w >= today && C.diff(today, w) <= C.WARRANTY_SOON && !e;
            line(wl, 'war' + (w === 'life' || (w && w >= today) ? (wSoon ? ' urgent' : ' open') : ' off'));
            const eSoon = e && e >= today && C.diff(today, e) <= C.WARRANTY_SOON;
            line(C.extLine(it, today), 'war' + (e && e >= today ? (eSoon ? ' urgent' : ' open') : ' off'));
            if (r == null && !w && !e) { /* both lines already say none */ }
        }
        li.appendChild(lines);
        const extra = [it.order ? 'Order: ' + it.order : '', it.serial ? 'Serial: ' + it.serial : ''].filter(Boolean).join(' · ');
        if (extra) li.appendChild(el('p', 'box-sub', extra));
        if (it.note) li.appendChild(el('p', 'box-note', it.note));
        const btns = el('div', 'box-btns');
        const btn = (text, fn, cls) => { const b = el('button', cls || 'mini', text); b.type = 'button'; b.addEventListener('click', fn); btns.appendChild(b); return b; };
        if (it.status === 'active') {
            btn('Edit', () => openForm(it.id));
            btn('Copy', () => copyText(C.itemText(it, today, sym())).then(ok => show('list-msg', ok ? 'Copied the details of ' + it.name + '.' : 'Could not copy. Select the text and copy it yourself.')));
            const hasDates = (k.returnOpen) || (() => { const w = C.warrantyEnd(it), e = C.extEnd(it); return (w && w !== 'life' && w >= today) || (e && e >= today); })();
            if (hasDates) btn('Calendar', () => calendar([it], fileName(it.name) + '-deadlines.ics'));
            if (it.photo) btn('Receipt', () => showPhoto(it.photo));
            const two = el('div', 'box-btns two');
            const sbtn = (text, fn) => { const b = el('button', 'mini strong', text); b.type = 'button'; b.addEventListener('click', fn); two.appendChild(b); };
            const r = C.returnEnd(it);
            if (r && r >= today) {
                if (it.kept) sbtn('Might return it', () => change(it, s => { s.kept = false; }, 'The return countdown for ' + it.name + ' is back.'));
                else sbtn('Keeping it', () => change(it, s => { s.kept = true; }, 'Keeping ' + it.name + '. It is now under "' + (C.coverEnd(it) ? 'Under warranty' : 'Cover ended') + '".'));
                sbtn('Returned it', () => change(it, s => { s.status = 'returned'; s.statusDate = today; }, 'Marked ' + it.name + ' as returned.'));
            } else {
                sbtn('No longer have it', () => change(it, s => { s.status = 'gone'; s.statusDate = today; }, 'Moved ' + it.name + ' to "Returned or no longer have".'));
            }
            li.appendChild(btns); li.appendChild(two);
        } else {
            btn('Put back', () => change(it, s => { s.status = 'active'; s.statusDate = ''; }, 'Put ' + it.name + ' back in your list.'));
            btn('Copy', () => copyText(C.itemText(it, today, sym())).then(ok => show('list-msg', ok ? 'Copied the details of ' + it.name + '.' : 'Could not copy.')));
            if (it.photo) btn('Receipt', () => showPhoto(it.photo));
            btn('Delete', () => removeItem(it.id, 'list-msg'), 'mini bad');
            li.appendChild(btns);
        }
        return li;
    }
    function change(it, fn, text) {
        const before = snapshot(); fn(it); commit(); show('list-msg', text, before);
    }
    function removeItem(id, where) {
        const it = item(id); if (!it) return;
        const before = snapshot();
        state.items = state.items.filter(x => x.id !== id);
        if (editing === id) closeForm();
        commit(); show(where, 'Deleted ' + it.name + '.', before);
    }
    function calendar(items, name) {
        const r = C.ics(items, today, stamp());
        if (!r.count) { show('set-msg', 'There are no deadlines still to come.'); return; }
        download(name, 'text/calendar', r.text);
        show(items.length === 1 ? 'list-msg' : 'set-msg', 'Saved a calendar file with ' + r.count + (r.count === 1 ? ' deadline' : ' deadlines') + '. Open it to add ' + (r.count === 1 ? 'it' : 'them') + ' to your calendar.');
    }
    function showPhoto(id) {
        getPhoto(id).then(data => {
            if (!data) { show('list-msg', 'The receipt is not on this device any more. Add it again with Edit.'); return; }
            const url = dataToBlobUrl(data);
            if (data.startsWith('data:application/pdf')) { window.open(url, '_blank', 'noopener'); return; }
            $('photo-img').src = url; $('photo-open').href = url;
            const d = $('photo-dlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
        });
    }

    // ---------- the form ----------
    const F = id => $('f-' + id);
    function formValues() {
        return {
            name: F('name').value, shop: F('shop').value, bought: F('bought').value, delivered: $('w-deliv').hidden ? '' : F('deliv').value,
            retSel: F('ret').value, retDays: F('retdays').value, retUntil: F('retuntil').value,
            warSel: F('war').value, warNum: F('warnum').value, warUnit: F('warunit').value, warUntil: F('waruntil').value,
            extSel: $('w-ext').hidden ? '0' : F('ext').value, extNum: F('extnum').value, extUnit: F('extunit').value,
            price: F('price').value, order: F('order').value, serial: F('serial').value, note: F('note').value
        };
    }
    function syncForm() {
        $('w-retdays').hidden = F('ret').value !== 'custom';
        $('w-retuntil').hidden = F('ret').value !== 'until';
        $('w-warnum').hidden = F('war').value !== 'custom';
        $('w-waruntil').hidden = F('war').value !== 'until';
        $('w-extnum').hidden = F('ext').value !== 'custom';
        $('o-deliv').hidden = !$('w-deliv').hidden;
        $('o-ext').hidden = !$('w-ext').hidden || F('war').value === 'life';
        if (F('war').value === 'life' && !$('w-ext').hidden) { $('w-ext').hidden = true; $('o-ext').hidden = true; }
        $('o-more').hidden = !$('w-more').hidden;
        $('o-photo').hidden = !$('w-photo').hidden;
        $('preview').textContent = C.previewText(formValues(), C.todayIso());
    }
    function clearErrs() {
        ['name', 'bought', 'deliv', 'ret', 'war', 'ext', 'price', 'photo'].forEach(k => { $('e-' + k).textContent = ''; });
        document.querySelectorAll('#form [aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    }
    function setPhotoUi() {
        const has = !!formPhoto;
        F('unpick').hidden = !has; F('pick').textContent = has ? 'Choose a different one' : 'Choose a photo or PDF';
        F('thumb').hidden = true; F('pdf').hidden = true;
        if (!has) return;
        const showData = d => { if (!d) return; if (d.startsWith('data:application/pdf')) F('pdf').hidden = false; else { F('thumb').src = d; F('thumb').hidden = false; } };
        if (formPhoto.data) showData(formPhoto.data); else getPhoto(formPhoto.id).then(showData);
    }
    function openForm(id) {
        editing = id == null ? null : id;
        const it = editing != null ? item(editing) : null;
        clearErrs();
        F('name').value = it ? it.name : ''; F('shop').value = it ? it.shop : '';
        F('bought').value = it ? it.bought : C.todayIso(); F('bought').max = C.todayIso();
        F('deliv').value = it ? it.delivered : ''; $('w-deliv').hidden = !(it && it.delivered);
        const r = it ? it.ret : { t: 'days', days: 30 };
        const retPresets = ['7', '14', '28', '30', '60', '90'];
        F('ret').value = r.t === 'none' ? 'none' : r.t === 'until' ? 'until' : retPresets.includes(String(r.days)) ? String(r.days) : 'custom';
        F('retdays').value = r.t === 'days' && !retPresets.includes(String(r.days)) ? r.days : '';
        F('retuntil').value = r.t === 'until' ? r.until : '';
        const w = it ? it.war : { t: 'months', months: 24 }, warPresets = ['3', '6', '12', '24', '36', '60'];
        F('war').value = w.t === 'none' ? 'none' : w.t === 'life' ? 'life' : w.t === 'until' ? 'until' : warPresets.includes(String(w.months)) ? String(w.months) : 'custom';
        if (w.t === 'months' && !warPresets.includes(String(w.months))) { const y = w.months % 12 === 0; F('warnum').value = y ? w.months / 12 : w.months; F('warunit').value = y ? 'y' : 'm'; }
        else { F('warnum').value = ''; F('warunit').value = 'y'; }
        F('waruntil').value = w.t === 'until' ? w.until : '';
        const extPresets = ['12', '24', '36', '60'];
        $('w-ext').hidden = !(it && it.ext);
        F('ext').value = it && it.ext ? (extPresets.includes(String(it.ext)) ? String(it.ext) : 'custom') : '36';
        if (it && it.ext && !extPresets.includes(String(it.ext))) { const y = it.ext % 12 === 0; F('extnum').value = y ? it.ext / 12 : it.ext; F('extunit').value = y ? 'y' : 'm'; }
        else { F('extnum').value = ''; F('extunit').value = 'y'; }
        F('price').value = it && it.price != null ? (it.price / 100).toFixed(2) : '';
        F('order').value = it ? it.order : ''; F('serial').value = it ? it.serial : ''; F('note').value = it ? it.note : '';
        $('w-more').hidden = !(it && (it.price != null || it.order || it.serial || it.note));
        formPhoto = it && it.photo ? { id: it.photo } : null;
        $('w-photo').hidden = !formPhoto;
        setPhotoUi();
        $('form-h').textContent = it ? 'Edit ' + it.name : 'Add something you bought';
        $('save').textContent = it ? 'Save changes' : 'Add to my list';
        $('del').hidden = !it;
        formOpen = true;
        syncForm(); render();
        if (id != null || state.items.length) { $('add').scrollIntoView({ block: 'start', behavior: 'smooth' }); F('name').focus({ preventScroll: true }); }
    }
    function closeForm() {
        editing = null; formPhoto = null;
        formOpen = !state.items.length;
        if (formOpen) openFormSilently();
    }
    function openFormSilently() {   // empty list: show a fresh form without scrolling
        editing = null; clearErrs();
        ['name', 'shop', 'deliv', 'retdays', 'retuntil', 'warnum', 'waruntil', 'extnum', 'price', 'order', 'serial', 'note'].forEach(k => { F(k).value = ''; });
        F('bought').value = C.todayIso(); F('bought').max = C.todayIso(); F('ret').value = '30'; F('war').value = '24'; F('ext').value = '36';
        ['w-deliv', 'w-ext', 'w-more', 'w-photo'].forEach(k => { $(k).hidden = true; });
        formPhoto = null; setPhotoUi();
        $('form-h').textContent = 'Add something you bought'; $('save').textContent = 'Add to my list'; $('del').hidden = true;
        syncForm();
    }
    function submit(e) {
        e.preventDefault();
        clearErrs();
        const t = C.todayIso(), r = C.readForm(formValues(), t);
        const map = { name: 'name', bought: 'bought', delivered: 'deliv', ret: 'ret', war: 'war', ext: 'ext', price: 'price' };
        const fieldOf = { name: 'name', bought: 'bought', delivered: 'deliv', ret: F('ret').value === 'custom' ? 'retdays' : F('ret').value === 'until' ? 'retuntil' : 'ret',
            war: F('war').value === 'custom' ? 'warnum' : F('war').value === 'until' ? 'waruntil' : 'war', ext: F('ext').value === 'custom' ? 'extnum' : 'ext', price: 'price' };
        let first = null;
        Object.keys(r.errs).forEach(k => { $('e-' + map[k]).textContent = r.errs[k]; const f = F(fieldOf[k]); if (f) { f.setAttribute('aria-invalid', 'true'); first = first || f; } });
        if (!r.ok) { if (first) first.focus(); return; }
        if (editing == null && state.items.length >= C.MAX_ITEMS) { $('e-name').textContent = 'The list is full (500 items). Delete old items first.'; return; }
        const before = snapshot();
        const done = photoId => {
            const old = editing != null ? item(editing) : null;
            const it = Object.assign({ id: old ? old.id : state.nextId++, status: 'active', statusDate: '', kept: false }, old ? { status: old.status, statusDate: old.statusDate, kept: old.kept } : {}, r.item, { photo: photoId });
            if (old && it.kept && !(C.returnEnd(it) && C.returnEnd(it) >= t)) it.kept = false;
            if (old) state.items = state.items.map(x => x.id === old.id ? it : x); else state.items.push(it);
            const k = C.classify(it, t);
            const what = k.section === 'return' ? C.returnLine(it, t) + '.' : k.section === 'warranty' ? (C.warrantyLine(it, t) || C.extLine(it, t)) + '.' : 'Its return window and warranty have both ended.';
            formOpen = false; editing = null; formPhoto = null;
            commit();
            show('form-msg', (old ? 'Saved ' : 'Added ') + it.name + '. ' + what, before);
        };
        if (formPhoto && formPhoto.data) { const id = newPhotoId(); putPhoto(id, formPhoto.data).then(() => done(id)); }
        else done(formPhoto ? formPhoto.id : '');
    }

    // ---------- wiring ----------
    function wire() {
        $('form').addEventListener('submit', submit);
        $('form').addEventListener('input', syncForm);
        $('form').addEventListener('change', syncForm);
        $('open-form').addEventListener('click', () => openForm(null));
        $('cancel').addEventListener('click', () => { closeForm(); render(); });
        $('del').addEventListener('click', () => { const id = editing; removeItem(id, 'form-msg'); });
        $('o-deliv').addEventListener('click', () => { $('w-deliv').hidden = false; if (!F('deliv').value) F('deliv').value = C.todayIso(); syncForm(); F('deliv').focus(); });
        $('x-deliv').addEventListener('click', () => { $('w-deliv').hidden = true; F('deliv').value = ''; $('e-deliv').textContent = ''; syncForm(); $('o-deliv').focus(); });
        $('o-ext').addEventListener('click', () => { $('w-ext').hidden = false; syncForm(); F('ext').focus(); });
        $('x-ext').addEventListener('click', () => { $('w-ext').hidden = true; $('e-ext').textContent = ''; syncForm(); $('o-ext').focus(); });
        $('o-more').addEventListener('click', () => { $('w-more').hidden = false; syncForm(); F('price').focus(); });
        $('o-photo').addEventListener('click', () => { $('w-photo').hidden = false; syncForm(); F('pick').focus(); });
        F('pick').addEventListener('click', () => F('file').click());
        F('unpick').addEventListener('click', () => { formPhoto = null; setPhotoUi(); F('pick').focus(); });
        F('file').addEventListener('change', () => {
            const file = F('file').files[0]; F('file').value = ''; $('e-photo').textContent = '';
            if (!file) return;
            const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
            if (isPdf) {
                if (file.size > 8e6) { $('e-photo').textContent = 'That PDF is bigger than 8 MB. Take a photo of the receipt instead.'; return; }
                readAsData(file).then(d => { formPhoto = { data: d.replace(/^data:[^;]*;/, 'data:application/pdf;') }; setPhotoUi(); }, () => { $('e-photo').textContent = 'That file could not be read.'; });
            } else if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(file.name)) {
                shrink(file).then(d => { formPhoto = { data: d }; setPhotoUi(); }, () => { $('e-photo').textContent = 'That photo could not be opened here. Try a JPEG or PNG, or take a screenshot of it.'; });
            } else $('e-photo').textContent = 'Choose a photo or a PDF.';
        });
        $('find').addEventListener('input', render);
        $('cur').addEventListener('change', () => { state.cur = C.CURS.includes($('cur').value) ? $('cur').value : ''; commit(); });
        $('copy-all').addEventListener('click', () => {
            const t = C.listText(state.items, today, sym());
            if (!t) { show('set-msg', 'There is nothing in your list to copy.'); return; }
            copyText(t).then(ok => show('set-msg', ok ? 'Copied your list. Paste it into a message or a note.' : 'Could not copy. Try "Email the list" instead.'));
        });
        $('cal-all').addEventListener('click', () => calendar(state.items, 'purchase-deadlines.ics'));
        $('backup').addEventListener('click', () => {
            const ids = state.items.map(it => it.photo).filter(Boolean);
            Promise.all(ids.map(id => getPhoto(id).then(d => [id, d]))).then(pairs => {
                const photos = {}; pairs.forEach(([id, d]) => { if (C.okPhoto(d)) photos[id] = d; });
                download('warranty-and-return-backup-' + today + '.json', 'application/json', JSON.stringify({ app: C.SLUG, saved: today, state, photos }));
                show('set-msg', 'Saved a backup file with ' + state.items.length + (state.items.length === 1 ? ' item' : ' items') + (ids.length ? ' and ' + Object.keys(photos).length + ' receipts' : '') + '.');
            });
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', () => {
            const file = $('restore-file').files[0]; $('restore-file').value = '';
            if (!file) return;
            if (file.size > 200e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            file.text().then(txt => {
                let data; try { data = JSON.parse(txt); } catch (e) { data = null; }
                const s = data && data.app === C.SLUG ? C.validate(data.state) : null;
                if (!s) { show('set-msg', 'That file is not a backup from this app, so nothing was changed.'); return; }
                const photos = data.photos && typeof data.photos === 'object' ? data.photos : {};
                const jobs = [];
                s.items.forEach(it => { if (it.photo) { if (C.okPhoto(photos[it.photo])) jobs.push(putPhoto(it.photo, photos[it.photo])); else it.photo = ''; } });
                Promise.all(jobs).then(() => {
                    const before = snapshot(); state = s; closeForm(); commit();
                    show('set-msg', 'Restored ' + s.items.length + (s.items.length === 1 ? ' item' : ' items') + ' from the backup.', before);
                });
            }, () => show('set-msg', 'That file could not be read.'));
        });
        $('wipe').addEventListener('click', () => {
            if (!state.items.length) { show('set-msg', 'Your list is already empty.'); return; }
            const before = snapshot(), cur = state.cur; state = C.emptyState(); state.cur = cur; closeForm(); commit();
            show('set-msg', 'Deleted everything.', before);
        });
        $('photo-close').addEventListener('click', () => $('photo-dlg').close());
        $('photo-dlg').addEventListener('click', e => { if (e.target === $('photo-dlg')) $('photo-dlg').close(); });
        $('photo-dlg').addEventListener('close', () => { const s = $('photo-img').src; if (s.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(s), 60000); });
        // the days left change at midnight
        const tick = () => { if (C.todayIso() !== today) render(); };
        setInterval(tick, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); render(); } });
    }

    state = load();
    save();
    wire();
    if (!state.items.length) openFormSilently(); else { formOpen = false; syncForm(); }
    render();
    tidyPhotos();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
