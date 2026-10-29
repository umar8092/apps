// Home Inventory for Insurance and Moving: the page. The sums and words are in core.js (window.HIN).
(function () {
    'use strict';
    const C = window.HIN, SLUG = 'home-inventory-for-insurance-and-moving', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '৳': '৳ (taka)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (riyal)',
        'KWD': 'KWD (dinar)', 'OMR': 'OMR (rial)', 'BHD': 'BHD (dinar)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)',
        'NZ$': 'NZ$ (NZ dollar)', 'R': 'R (rand)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)', 'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₱': '₱ (peso)', 'S$': 'S$ (Singapore dollar)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const SLOTS = ['photo', 'rphoto'];
    let state = C.emptyState(), today = C.today(new Date()), fresh = true, canSave = true, loadNote = '';
    let editing = null;          // id of the item in the form, or null when adding
    let photos = { photo: { data: null, changed: false }, rphoto: { data: null, changed: false } };   // the photos in the form
    let panel = null;            // { id, mode: 'move' | 'gone' | 'rename' } open on one item or room
    let flash = null, undoSnap = null, query = '';
    const thumbs = {};           // photo key -> data URL, read from the photo store
    const big = new Set();       // photos shown large
    const shut = new Set();      // rooms whose items are hidden

    // ---------- small helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const p = (cls, text) => el('p', cls, text);
    const money = c => C.fmtMoney(c, state.cur, state.group);
    const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const byId = id => state.items.find(x => x.id === id);
    const roomName = id => { const r = C.roomOf(state, id); return r ? r.name : ''; };
    const plural = C.plural;
    function setErr(id, msg) {
        const e = $(id + '-err'); if (e) e.textContent = msg || '';
        const inp = $(id); if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
        return !msg;
    }
    function showMsg(box, text, withUndo, bad) {
        if (!box) return;
        box.textContent = '';
        box.className = 'msg show' + (bad ? ' bad' : '');
        box.appendChild(document.createTextNode(text + ' '));
        if (withUndo) box.appendChild(btn('Undo', 'link inline undo', undo));
    }
    function say(where, text, bad) { flash = { where, text, bad }; render(); }
    function copyText(text, where) {
        const done = () => say(where, 'Copied. Paste it into a message, a note or an email.');
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
            if (ok) done(); else say(where, 'Could not copy here. Use the Email button instead.', true);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function download(name, type, text) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    const mailto = (subject, body) => 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body.length > 1800 ? body.slice(0, 1800) + '\n…(the list is longer: use Copy and paste it in)' : body);
    function goTo(id, focusId) { $(id).scrollIntoView({ behavior: 'smooth', block: 'start' }); if (focusId) $(focusId).focus({ preventScroll: true }); }

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (!raw) return;
        fresh = false;
        try { const s = C.cleanState(JSON.parse(raw)); if (s) state = s; else loadNote = 'The saved list could not be read, so the app started fresh.'; } catch (e) { loadNote = 'The saved list could not be read, so the app started fresh.'; }
    }
    function save() {
        if (!canSave) { $('store-warn').hidden = false; return; }
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canSave = false; $('store-warn').hidden = false; }
    }
    function change(fn, where, text) {
        const before = JSON.stringify(state);
        if (fn() === false) return false;
        C.pruneRooms(state);
        save();
        undoSnap = before;
        flash = { where, text: typeof text === 'function' ? text() : text, undo: true };
        render();
        return true;
    }
    function undo() {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap));
        if (s) state = s;
        const where = flash && $(flash.where) ? flash.where : 'top-msg';
        undoSnap = null; panel = null;
        if (editing && !byId(editing)) resetForm(false);
        save(); fillSettings(); fillCover();
        flash = { where, text: 'Undone.' };
        render();
        loadThumbs();
    }

    // ---------- photos: kept in this browser's IndexedDB, never sent anywhere ----------
    const DB = {
        db: null, ok: true,
        open() {
            if (this.db) return Promise.resolve(this.db);
            return new Promise((res, rej) => {
                let r;
                try { r = indexedDB.open(SLUG + '.photos', 1); } catch (e) { this.ok = false; return rej(e); }
                r.onupgradeneeded = () => r.result.createObjectStore('p');
                r.onsuccess = () => { this.db = r.result; res(this.db); };
                r.onerror = () => { this.ok = false; rej(r.error); };
            });
        },
        run(mode, fn) { return this.open().then(db => new Promise((res, rej) => { const tx = db.transaction('p', mode), st = tx.objectStore('p'); const q = fn(st); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); })); },
        get(id) { return this.run('readonly', st => st.get(id)); },
        put(id, data) { return this.run('readwrite', st => st.put(data, id)); },
        del(id) { return this.run('readwrite', st => st.delete(id)); },
        keys() { return this.run('readonly', st => st.getAllKeys()); }
    };
    const okPhoto = d => typeof d === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d) && d.length < 4000000;
    const photoKeys = () => { const k = []; state.items.forEach(x => SLOTS.forEach(s => { if (x[s]) k.push(x[s]); })); return k; };
    // shrink a phone photo so hundreds fit on the device; receipts stay sharp enough to read
    function shrink(file, max) {
        return new Promise((res, rej) => {
            const url = URL.createObjectURL(file), img = new Image();
            img.onload = () => {
                const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
                const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.naturalWidth * sc)); cv.height = Math.max(1, Math.round(img.naturalHeight * sc));
                const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
                URL.revokeObjectURL(url);
                res(cv.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
            img.src = url;
        });
    }
    function loadThumbs() {
        const want = photoKeys().filter(k => !thumbs[k]);
        if (!want.length || !DB.ok) return;
        Promise.all(want.map(k => DB.get(k).then(d => { if (okPhoto(d)) thumbs[k] = d; }).catch(() => {}))).then(() => render());
    }
    // photos of items deleted in an earlier visit (kept until then so Undo can bring them back)
    function tidyPhotos() {
        if (!DB.ok) return;
        const keep = new Set(photoKeys());
        DB.keys().then(keys => { (keys || []).forEach(k => { if (!keep.has(k)) DB.del(k).catch(() => {}); }); }).catch(() => {});
    }

    // ---------- the add / edit form ----------
    function readQty() { return C.parseQty($('i-qty').value); }
    function readValue(q) {
        const v = C.parseOptMoney($('i-value').value);
        if (v.error || v.n == null || q.error) return v;
        if (v.n * q.n > C.MAXC) return { error: 'That adds up to too much for one item.' };
        return v;
    }
    // the labels and the total line follow How many
    function qtyUI() {
        const q = readQty(), many = !q.error && q.n > 1;
        $('i-value-l').textContent = many ? 'Value of each, to buy new' : 'Value, to buy it new';
        $('i-paid-l').textContent = many ? 'Price paid for all ' + q.n : 'Price paid';
        const v = readValue(q), out = $('i-total');
        out.textContent = many && !v.error && v.n != null ? q.n + ' × ' + money(v.n) + ' = ' + money(q.n * v.n) + ' for all ' + q.n : '';
    }
    function fillQuick() {
        const box = $('room-quick'); box.textContent = '';
        const names = state.rooms.map(r => r.name);
        C.ROOMS.forEach(n => { if (!names.some(x => C.same(x, n))) names.push(n); });
        const now = $('i-room').value.trim();
        names.slice(0, Math.max(10, state.rooms.length)).forEach(n => {
            const on = C.same(now, n);
            const c = btn(n, 'chip' + (on ? ' on' : '') + (state.rooms.some(r => C.same(r.name, n)) ? ' used' : ''), () => { $('i-room').value = n; setErr('i-room', ''); fillQuick(); });
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
            box.appendChild(c);
        });
    }
    function showPhotos() {
        SLOTS.forEach(s => {
            const img = $('ph-' + s + '-img'), d = photos[s].data;
            img.hidden = !d; if (d) img.src = d; else img.removeAttribute('src');
            $('ph-' + s + '-del').hidden = !d;
            $('ph-' + s + '-pick').textContent = (d ? 'Change the photo of ' : 'Add a photo of ') + (s === 'photo' ? 'it' : 'the receipt');
        });
    }
    function resetForm(keepRoom) {
        const room = $('i-room').value;
        editing = null; photos = { photo: { data: null, changed: false }, rphoto: { data: null, changed: false } };
        ['i-name', 'i-qty', 'i-value', 'i-brand', 'i-serial', 'i-got', 'i-paid', 'i-receipt', 'i-note'].forEach(id => { $(id).value = ''; });
        $('i-room').value = keepRoom ? room : '';
        $('more-box').hidden = true; $('more-open').hidden = false;
        ['i-room', 'i-name', 'i-qty', 'i-value', 'i-got', 'i-paid'].forEach(id => setErr(id, ''));
        $('i-save').textContent = 'Save item'; $('i-cancel').hidden = true;
        $('add-h').textContent = 'Add an item';
        showPhotos(); qtyUI(); fillQuick();
    }
    function startEdit(id) {
        const x = byId(id); if (!x) return;
        resetForm(false);
        editing = id; panel = null;
        $('i-room').value = roomName(x.room);
        $('i-name').value = x.name;
        $('i-qty').value = x.qty > 1 ? String(x.qty) : '';
        $('i-value').value = C.moneyInput(x.value);
        $('i-brand').value = x.brand; $('i-serial').value = x.serial; $('i-got').value = x.got; $('i-paid').value = C.moneyInput(x.paid);
        $('i-receipt').value = x.receipt; $('i-note').value = x.note;
        if (x.brand || x.serial || x.got || x.paid != null || x.receipt || x.note || x.photo || x.rphoto) { $('more-box').hidden = false; $('more-open').hidden = true; }
        SLOTS.forEach(s => { photos[s] = { data: x[s] ? (thumbs[x[s]] || null) : null, changed: false }; });
        $('i-save').textContent = 'Save changes'; $('i-cancel').hidden = false;
        $('add-h').textContent = 'Edit: ' + x.name;
        showPhotos(); qtyUI(); fillQuick(); render();
        goTo('add', 'i-name');
    }
    function saveItem() {
        let ok = true;
        const roomTxt = C.cleanText($('i-room').value, C.LIM.room);
        ok = setErr('i-room', roomTxt ? '' : 'Type the room, or tap one above.') && ok;
        if (roomTxt && !state.rooms.some(r => C.same(r.name, roomTxt)) && state.rooms.length >= C.LIM.rooms) ok = setErr('i-room', 'The list has ' + C.LIM.rooms + ' rooms already. Pick one of them.') && false;
        const name = C.cleanText($('i-name').value, C.LIM.name);
        ok = setErr('i-name', name ? '' : 'Type what it is, such as Sofa or Laptop.') && ok;
        const q = readQty();
        ok = setErr('i-qty', q.error || '') && ok;
        const v = readValue(q);
        ok = setErr('i-value', v.error || '') && ok;
        let got = '', paid = null;
        if (!$('more-box').hidden) {
            got = $('i-got').value;
            const ge = got && !C.isDate(got) ? 'Pick a real date.' : got && got > today ? 'That date is in the future.' : '';
            ok = setErr('i-got', ge) && ok;
            const pm = C.parseOptMoney($('i-paid').value);
            ok = setErr('i-paid', pm.error || '') && ok;
            paid = pm.error ? null : pm.n;
        }
        if (!editing && state.items.length >= C.LIM.items) { say('add-msg', 'The list is full (' + C.LIM.items + ' items).', true); return; }
        if (!ok) { const f = document.querySelector('#add [aria-invalid="true"]'); if (f) f.focus(); return; }
        const id = editing || newId('i');
        const keep = editing ? byId(editing) : null;
        const keys = {};
        SLOTS.forEach(s => { keys[s] = photos[s].changed ? '' : (keep ? keep[s] : ''); });
        const more = !$('more-box').hidden;
        let twinNote = '';
        const doIt = () => change(() => {
            let room = state.rooms.find(r => C.same(r.name, roomTxt));
            if (!room) { room = { id: newId('r'), name: roomTxt }; state.rooms.push(room); }
            const tw = keep ? null : C.twin(state, room.id, name, id);
            twinNote = tw ? ' ' + room.name + ' already had ' + tw.name + ': if it is the same thing, delete one.' : '';
            const o = { id, room: room.id, name, qty: q.n, value: v.n, brand: more ? C.cleanText($('i-brand').value, C.LIM.brand) : '', serial: more ? C.cleanText($('i-serial').value, C.LIM.serial) : '',
                got, paid, receipt: more ? C.cleanText($('i-receipt').value, C.LIM.receipt) : '', note: more ? C.cleanNote($('i-note').value, C.LIM.note) : '',
                photo: keys.photo, rphoto: keys.rphoto, status: keep ? keep.status : 'have', out: keep ? keep.out : null, added: keep ? keep.added : today };
            if (keep) state.items[state.items.indexOf(keep)] = o; else state.items.push(o);
        }, 'add-msg', () => (keep ? 'Saved the changes to ' : 'Saved ') + C.itemTitle({ name, qty: q.n }) + ' in ' + roomTxt + (v.n == null ? ', no value yet.' : ': ' + money(v.n * q.n) + '.') + twinNote);
        const finish = () => { if (doIt()) resetForm(!keep); };
        const puts = SLOTS.filter(s => photos[s].changed && photos[s].data && DB.ok).map(s => {
            // a new key for every new photo, so Undo can bring back the old one
            const k = newId('f'), data = photos[s].data;
            return DB.put(k, data).then(() => { thumbs[k] = data; keys[s] = k; }).catch(() => { throw new Error('photo'); });
        });
        if (!puts.length) return finish();
        Promise.all(puts).then(finish).catch(() => { finish(); say('add-msg', 'The item was saved, but this browser would not keep the photo.', true); });
    }

    // ---------- insurance cover ----------
    function fillCover() {
        $('c-cover').value = C.moneyInput(state.cover);
        $('c-limit').value = C.moneyInput(state.limit);
        setErr('c-cover', ''); setErr('c-limit', '');
    }
    function saveCover() {
        const c = C.parseOptMoney($('c-cover').value), l = C.parseOptMoney($('c-limit').value, { positive: true, zero: 'Type a limit bigger than 0, or leave it empty.' });
        let ok = setErr('c-cover', c.error || '');
        ok = setErr('c-limit', l.error || '') && ok;
        if (!ok) return;
        if (c.n === state.cover && l.n === state.limit) { say('cover-msg', 'Nothing was changed.'); return; }
        change(() => { state.cover = c.n; state.limit = l.n; }, 'cover-msg', () => {
            if (c.n == null && l.n == null) return 'Removed the cover.';
            const cw = C.coverWords(state);
            return 'Saved. ' + (cw || '') + (l.n != null ? ' ' + plural(C.overLimit(state).length, 'item is', 'items are') + ' worth more than ' + money(l.n) + '.' : '');
        });
        fillCover();
    }

    // ---------- showing it all ----------
    function render() {
        const any = state.items.length > 0, home = C.atHome(state);
        $('intro').hidden = any;
        $('glance').hidden = !any;
        $('rooms').hidden = !home.length;
        $('claim').hidden = !C.claims(state).length;
        $('history').hidden = !C.gone(state).length;
        document.querySelectorAll('[data-cur]').forEach(t => { t.textContent = state.cur; t.hidden = !state.cur; });
        if (any) renderGlance();
        renderRooms(); renderValuables(); renderClaim(); renderHistory();
        fillQuick(); qtyUI();
        document.querySelectorAll('.msg').forEach(m => { if (!flash || m.id !== flash.where) { m.textContent = ''; m.className = 'msg'; } });
        if (flash) showMsg($(flash.where) || $('top-msg'), flash.text, flash.undo, flash.bad);
        flash = null;
    }
    function renderGlance() {
        const b = $('glance-body'); b.textContent = '';
        const s = C.sums(C.atHome(state)), cc = C.coverCheck(state), ol = C.overLimit(state), cl = C.sums(C.claims(state));
        const top = el('div', 'glance-top'), main = el('div', 'g-main');
        main.appendChild(p('g-label', 'Whole home'));
        main.appendChild(p('g-big', plural(s.n, 'item')));
        main.appendChild(p('g-mid', money(s.value)));
        main.appendChild(p('g-line muted', 'to buy everything new today'));
        if (s.unvaluedN) main.appendChild(p('g-soon', plural(s.unvaluedN, 'item has', 'items have') + ' no value yet, so the real total is higher.'));
        top.appendChild(main);
        const cv = el('div', 'g-cover' + (cc ? (cc.spare < 0 ? ' short' : ' fine') : ''));
        cv.appendChild(p('g-label', 'Contents cover'));
        if (cc) {
            cv.appendChild(p('g-mid', money(cc.cover)));
            if (cc.spare < 0) {
                cv.appendChild(p('g-down', money(-cc.spare) + ' short'));
                cv.appendChild(p('g-line', 'Your things add up to more than the cover. Ask your insurer to raise it to at least ' + money(cc.total) + '.'));
            } else {
                cv.appendChild(p('g-up', 'Enough: ' + money(cc.spare) + ' to spare'));
                if (cc.unvaluedN) cv.appendChild(p('g-line muted', 'Not counting the ' + plural(cc.unvaluedN, 'item') + ' with no value yet.'));
            }
        } else {
            cv.appendChild(p('g-line muted', 'Is your cover enough? Type it from your policy.'));
            cv.appendChild(btn('+ Add your insurance cover', 'link', () => goTo('cover', 'c-cover')));
        }
        top.appendChild(cv);
        b.appendChild(top);
        if (ol.length) {
            const w = p('g-soon g-gap', plural(ol.length, 'item is', 'items are') + ' worth more than your single item limit of ' + money(state.limit) + ': ' + ol.slice(0, 4).map(x => x.name).join(', ') + (ol.length > 4 ? ' and ' + (ol.length - 4) + ' more' : '') + '. Ask your insurer to name ' + (ol.length === 1 ? 'it' : 'them') + ' on the policy.');
            b.appendChild(w);
        }
        if (cl.lines) b.appendChild(p('g-line g-gap', 'Claim list: ' + plural(cl.n, 'item') + ', ' + money(cl.value) + (cl.unvaluedN ? ' (' + cl.unvaluedN + ' without a value)' : '') + '.'));
        const groups = C.byRoom(state);
        if (groups.length) {
            const tiles = el('div', 'tiles');
            groups.forEach(g => {
                const t = btn('', 'tile', () => { shut.delete(g.room.id); query = ''; $('find').value = ''; render(); const r = document.querySelector('[data-room="' + g.room.id + '"]'); if (r) r.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, g.room.name + ': ' + C.sumWords(g.s, state) + '. Show this room');
                t.appendChild(el('span', 't-label', g.room.name));
                t.appendChild(el('span', 't-val', money(g.s.value)));
                t.appendChild(el('span', 't-sub', plural(g.s.n, 'item') + (g.s.unvaluedN ? ', ' + g.s.unvaluedN + ' no value' : '')));
                tiles.appendChild(t);
            });
            b.appendChild(tiles);
        }
        $('g-mail').href = mailto('Home inventory', C.allText(state, today));
    }
    function line(cls, text) { return p('it-line' + (cls ? ' ' + cls : ''), text); }
    function itemBox(x, mode) {
        const d = el('article', 'item' + (mode !== 'home' ? ' past' : '') + (SLOTS.some(s => big.has(x.id + s)) ? ' big-photo' : ''));
        d.setAttribute('aria-label', C.itemTitle(x));
        const top = el('div', 'it-top');
        const ths = el('div', 'thumbs');
        SLOTS.forEach(s => {
            if (!x[s] || !thumbs[x[s]]) return;
            const k = x.id + s, on = big.has(k);
            const tb = btn('', 'thumb-btn' + (on ? ' on' : ''), () => { if (on) big.delete(k); else big.add(k); render(); }, (on ? 'Make smaller: ' : 'Show bigger: ') + (s === 'photo' ? 'photo of ' : 'receipt for ') + x.name);
            const im = el('img', 'thumb'); im.src = thumbs[x[s]]; im.alt = ''; tb.appendChild(im);
            ths.appendChild(tb);
        });
        if (ths.childNodes.length) top.appendChild(ths);
        const head = el('div', 'it-head');
        head.appendChild(el('h4', 'it-name', C.itemTitle(x)));
        if (x.brand) head.appendChild(p('it-brand', x.brand));
        top.appendChild(head);
        const t = C.total(x);
        top.appendChild(el('span', 'it-val' + (t == null ? ' none' : ''), t == null ? 'No value' : money(t)));
        d.appendChild(top);
        if (mode !== 'home') {
            const r = roomName(x.room), o = x.out || {};
            d.appendChild(line('it-out', C.GONE[x.status] + (o.d ? ' on ' + C.fmtDate(o.d) : '') + (r ? ' · was in ' + r : '')));
            if (o.note) d.appendChild(line('', o.note));
        }
        if (x.qty > 1 && x.value != null) d.appendChild(line('', x.qty + ' × ' + money(x.value) + ' each'));
        if (x.serial) d.appendChild(line('', 'Serial number: ' + x.serial));
        if (x.got || x.paid != null) d.appendChild(line('', [x.got ? 'Bought ' + C.fmtDate(x.got) + (C.ageWords(x.got, today) ? ' (' + C.ageWords(x.got, today) + ')' : '') : '', x.paid != null ? 'paid ' + money(x.paid) : ''].filter(Boolean).join(', ').replace(/^paid/, 'Paid')));
        if (x.receipt) d.appendChild(line('', 'Receipt: ' + x.receipt));
        if (x.note) d.appendChild(line('it-note', x.note));
        if (mode === 'home') {
            if (x.value == null) d.appendChild(line('warnt', 'No value yet: tap Edit to add what it would cost new.'));
            if (state.limit != null && x.value != null && x.value > state.limit) d.appendChild(line('warnt', 'Worth more than your single item limit of ' + money(state.limit) + (x.serial || x.receipt || x.rphoto ? '.' : '. Add the serial number or receipt.')));
        }
        const bs = el('div', 'it-btns');
        if (mode === 'home') {
            bs.appendChild(btn('Edit', 'secondary small', () => startEdit(x.id), 'Edit ' + x.name));
            bs.appendChild(btn('Move', 'secondary small', () => { panel = { id: x.id, mode: 'move' }; render(); focusPanel(); }, 'Move ' + x.name + ' to another room'));
            bs.appendChild(btn('Gone', 'secondary small', () => { panel = { id: x.id, mode: 'gone' }; render(); focusPanel(); }, x.name + ' is gone: sold, given, thrown away, lost, stolen or damaged'));
        } else {
            bs.appendChild(btn('I still have it', 'secondary small', () => change(() => { x.status = 'have'; x.out = null; }, 'rooms-msg', 'Brought ' + x.name + ' back to ' + roomName(x.room) + '.'), 'I still have ' + x.name));
            bs.appendChild(btn('Edit', 'secondary small', () => startEdit(x.id), 'Edit ' + x.name));
        }
        bs.appendChild(btn('Delete', 'secondary small danger-t', () => delItem(x, mode === 'home' ? 'rooms-msg' : mode === 'claim' ? 'claim-msg' : 'history-msg'), 'Delete ' + x.name));
        d.appendChild(bs);
        if (panel && panel.id === x.id && panel.mode === 'move') d.appendChild(movePanel(x));
        if (panel && panel.id === x.id && panel.mode === 'gone') d.appendChild(gonePanel(x));
        return d;
    }
    function focusPanel() { const f = document.querySelector('.panel select, .panel input'); if (f) f.focus(); }
    function delItem(x, where) {
        if (editing === x.id) resetForm(false);
        change(() => { state.items = state.items.filter(y => y !== x); }, where, 'Deleted ' + x.name + '.');
    }
    function panelField(label, input, id) {
        const w = el('div', 'field'); const l = el('label', '', label); l.htmlFor = id; input.id = id; w.appendChild(l); w.appendChild(input);
        const e = p('err'); e.id = id + '-err'; e.setAttribute('role', 'alert'); w.appendChild(e); input.setAttribute('aria-describedby', id + '-err');
        return w;
    }
    function textInput(max, ph) { const i = el('input'); i.type = 'text'; i.maxLength = max; i.autocomplete = 'off'; if (ph) i.placeholder = ph; return i; }
    function closeBtn() { return btn('Cancel', 'secondary', () => { panel = null; render(); }); }
    function movePanel(x) {
        const pn = el('div', 'panel'); pn.appendChild(el('h5', '', 'Move ' + x.name + ' to'));
        const sel = el('select');
        state.rooms.filter(r => r.id !== x.room).forEach(r => { const o = el('option', '', r.name); o.value = r.id; sel.appendChild(o); });
        const on = el('option', '', 'A new room…'); on.value = 'new'; sel.appendChild(on);
        pn.appendChild(panelField('Room', sel, 'mv-room'));
        const nw = textInput(C.LIM.room, 'e.g. New bedroom'), nf = panelField('Name of the new room', nw, 'mv-new');
        const setNew = () => { nf.hidden = sel.value !== 'new'; };
        sel.addEventListener('change', () => { setNew(); if (sel.value === 'new') nw.focus(); });
        setNew();
        pn.appendChild(nf);
        const go = () => {
            let target = sel.value, nm = '';
            if (target === 'new') {
                nm = C.cleanText(nw.value, C.LIM.room);
                const ex = state.rooms.find(r => C.same(r.name, nm));
                if (!setErr('mv-new', !nm ? 'Type the name of the room.' : ex && ex.id === x.room ? 'It is in ' + ex.name + ' already.' : !ex && state.rooms.length >= C.LIM.rooms ? 'The list has ' + C.LIM.rooms + ' rooms already.' : '')) return;
                if (ex) target = ex.id;
            }
            panel = null;
            change(() => {
                if (target === 'new') { const r = { id: newId('r'), name: nm }; state.rooms.push(r); target = r.id; }
                x.room = target;
            }, 'rooms-msg', () => 'Moved ' + x.name + ' to ' + roomName(x.room) + '.');
        };
        nw.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        const rb = el('div', 'row-btns'); rb.appendChild(btn('Move it', 'primary', go)); rb.appendChild(closeBtn()); pn.appendChild(rb);
        return pn;
    }
    function gonePanel(x) {
        const pn = el('div', 'panel'); pn.appendChild(el('h5', '', 'What happened to ' + x.name + '?'));
        const sel = el('select');
        ['claim', 'sold', 'given', 'binned'].forEach(k => { const o = el('option', '', C.GONE[k]); o.value = k; sel.appendChild(o); });
        pn.appendChild(panelField('What happened', sel, 'gp-what'));
        const d = el('input'); d.type = 'date'; d.value = today; d.max = today;
        pn.appendChild(panelField('When', d, 'gp-d'));
        const nt = textInput(C.LIM.outNote, 'e.g. Burglary, police report 4471');
        pn.appendChild(panelField('Note (optional)', nt, 'gp-note'));
        const hint = p('hint');
        pn.appendChild(hint);
        const rb = el('div', 'row-btns'), go = btn('', 'primary', () => {
            const dv = d.value;
            if (!setErr('gp-d', !C.isDate(dv) ? 'Pick the date.' : dv > today ? 'That date is in the future.' : '')) return;
            const what = C.GONE[sel.value] ? sel.value : 'claim';
            panel = null;
            change(() => { x.status = what; x.out = { d: dv, note: C.cleanText(nt.value, C.LIM.outNote) }; }, what === 'claim' ? 'claim-msg' : 'history-msg',
                what === 'claim' ? 'Added ' + x.name + ' to the claim list.' : 'Moved ' + x.name + ' to Sold, given or thrown away.');
        });
        const setWhat = () => {
            const claim = sel.value === 'claim';
            go.textContent = claim ? 'Add to the claim list' : 'Mark as ' + C.GONE[sel.value].toLowerCase();
            nt.placeholder = claim ? 'e.g. Burglary, police report 4471' : sel.value === 'sold' ? 'e.g. Sold on OLX for 300' : sel.value === 'given' ? 'e.g. To my sister' : 'e.g. Broken';
            hint.textContent = claim ? 'It moves to the claim list, with its value, to send to your insurer.' : 'It moves to Sold, given or thrown away and is no longer counted.';
        };
        sel.addEventListener('change', setWhat); setWhat();
        nt.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
        rb.appendChild(go); rb.appendChild(closeBtn()); pn.appendChild(rb);
        return pn;
    }
    function renamePanel(room) {
        const pn = el('div', 'panel'); pn.appendChild(el('h5', '', 'Rename ' + room.name));
        const i = textInput(C.LIM.room); i.value = room.name;
        pn.appendChild(panelField('New name', i, 'rn-name'));
        const go = () => {
            const nm = C.cleanText(i.value, C.LIM.room);
            const clash = state.rooms.find(r => r.id !== room.id && C.same(r.name, nm));
            if (!setErr('rn-name', !nm ? 'Type a name.' : clash ? 'There is a room called ' + clash.name + ' already. To put the items together, use Move on each item.' : '')) return;
            if (nm === room.name) { panel = null; render(); return; }
            const old = room.name;
            panel = null;
            change(() => { const r = state.rooms.find(y => y.id === room.id); if (r) r.name = nm; }, 'rooms-msg', 'Renamed ' + old + ' to ' + nm + '.');
        };
        i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        const rb = el('div', 'row-btns'); rb.appendChild(btn('Save the name', 'primary', go)); rb.appendChild(closeBtn()); pn.appendChild(rb);
        return pn;
    }
    function renderRooms() {
        const box = $('room-list'); box.textContent = '';
        const q = query.trim();
        let found = 0;
        C.byRoom(state).forEach(g => {
            const list = q ? g.list.filter(x => C.matches(x, q)) : g.list;
            if (q && !list.length) return;
            found += list.length;
            const sec = el('section', 'room');
            sec.dataset.room = g.room.id;
            sec.setAttribute('aria-label', g.room.name);
            const hd = el('div', 'rm-head');
            hd.appendChild(el('h3', 'rm-name', g.room.name));
            hd.appendChild(p('rm-val', money(g.s.value)));
            sec.appendChild(hd);
            sec.appendChild(p('rm-sum', plural(g.s.n, 'item') + (g.s.unvaluedN ? ', ' + g.s.unvaluedN + ' with no value yet' : '')));
            const closed = shut.has(g.room.id) && !q;
            const bs = el('div', 'rm-btns');
            bs.appendChild(btn('+ Add an item here', 'secondary small', () => {
                if (editing) resetForm(false);
                $('i-room').value = g.room.name; fillQuick();
                goTo('add', 'i-name');
            }, 'Add an item to ' + g.room.name));
            bs.appendChild(btn('Copy the checklist', 'secondary small', () => copyText(C.checklist(g), 'rooms-msg'), 'Copy the checklist for ' + g.room.name));
            bs.appendChild(btn('Rename', 'secondary small', () => { panel = { id: g.room.id, mode: 'rename' }; render(); focusPanel(); }, 'Rename ' + g.room.name));
            if (!q) {
                const tg = btn(closed ? 'Show the items' : 'Hide the items', 'secondary small', () => { if (closed) shut.delete(g.room.id); else shut.add(g.room.id); render(); });
                tg.setAttribute('aria-expanded', closed ? 'false' : 'true');
                bs.appendChild(tg);
            }
            sec.appendChild(bs);
            if (panel && panel.id === g.room.id && panel.mode === 'rename') sec.appendChild(renamePanel(g.room));
            const ul = el('div', 'it-list' + (closed ? ' shut' : ''));
            list.forEach(x => ul.appendChild(itemBox(x, 'home')));
            sec.appendChild(ul);
            box.appendChild(sec);
        });
        $('find-out').textContent = q ? (found ? plural(found, 'item matches', 'items match') + ' "' + q + '".' : 'Nothing matches "' + q + '".') : '';
    }
    function renderValuables() {
        const ol = C.overLimit(state), top = C.topValued(state, 10);
        const list = ol.slice();
        top.forEach(x => { if (!list.includes(x)) list.push(x); });
        $('valuables').hidden = !list.length;
        $('val-intro').textContent = ol.length ? plural(ol.length, 'item is', 'items are') + ' worth more than your single item limit of ' + money(state.limit) + ': ask your insurer to name ' + (ol.length === 1 ? 'it' : 'them') + ' on the policy and keep ' + (ol.length === 1 ? 'its' : 'their') + ' receipts and photos.'
            : 'The ones to photograph, keep receipts for and check with your insurer.';
        const box = $('val-list'); box.textContent = '';
        list.forEach(x => {
            const li = el('li', ol.includes(x) ? 'over' : '');
            const a = el('div', 'v-what');
            a.appendChild(el('span', 'v-name', C.itemTitle(x)));
            const miss = [];
            if (!x.serial) miss.push('serial number');
            if (!x.receipt && !x.rphoto) miss.push('receipt');
            if (!x.photo) miss.push('photo');
            a.appendChild(el('span', 'v-sub', roomName(x.room) + (ol.includes(x) ? ' · over the limit' : '') + (miss.length ? ' · no ' + miss.join(', ') : '')));
            li.appendChild(a);
            li.appendChild(el('span', 'v-val', money(C.total(x))));
            box.appendChild(li);
        });
    }
    function renderClaim() {
        const list = C.claims(state), body = $('claim-body'); body.textContent = '';
        const box = $('claim-list'); box.textContent = '';
        if (!list.length) return;
        const s = C.sums(list);
        const m = el('div', 'g-main');
        m.appendChild(p('g-label', 'To claim'));
        m.appendChild(p('g-mid', plural(s.n, 'item') + ', ' + money(s.value)));
        m.appendChild(p('g-line muted', 'to buy new today' + (s.unvaluedN ? '; ' + plural(s.unvaluedN, 'item has', 'items have') + ' no value yet: tap Edit to add it' : '')));
        body.appendChild(m);
        list.forEach(x => box.appendChild(itemBox(x, 'claim')));
        $('cl-mail').href = mailto('Insurance claim: lost, stolen or damaged items', C.claimText(state, today));
    }
    function renderHistory() {
        const box = $('h-list'); box.textContent = '';
        C.gone(state).slice().sort((a, b) => ((b.out && b.out.d) || '').localeCompare((a.out && a.out.d) || '')).forEach(x => box.appendChild(itemBox(x, 'gone')));
    }
    function printPart(part) {
        document.body.dataset.print = part;
        window.print();
        setTimeout(() => { delete document.body.dataset.print; }, 500);
    }

    // ---------- settings, backup ----------
    function fillSettings() {
        const c = $('cur'); c.textContent = '';
        C.CURS.forEach(k => { const o = el('option', '', CUR_NAMES[k] || k); o.value = k; c.appendChild(o); });
        c.value = state.cur; $('group').value = state.group;
    }
    function backup() {
        const ids = photoKeys(), ph = {};
        const go = () => {
            download(SLUG + '-backup-' + today + '.json', 'application/json', JSON.stringify({ app: SLUG, saved: today, state, photos: ph }));
            say('tools-msg', 'Saved the backup file' + (Object.keys(ph).length ? ' with ' + plural(Object.keys(ph).length, 'photo') : '') + '. Keep it away from home, such as in your email or cloud drive.');
        };
        if (!ids.length || !DB.ok) return go();
        Promise.all(ids.map(id => DB.get(id).then(d => { if (okPhoto(d)) ph[id] = d; }).catch(() => {}))).then(go);
    }
    function restore(file) {
        if (!file) return;
        if (file.size > 200000000) { say('tools-msg', 'That file is too big to be a backup from this app.', true); return; }
        const r = new FileReader();
        r.onload = () => {
            let s = null, ph = {};
            try { const j = JSON.parse(r.result); s = C.cleanState(j && j.app === SLUG ? j.state : j); if (j && j.photos && typeof j.photos === 'object') ph = j.photos; } catch (e) { s = null; }
            if (!s) { say('tools-msg', 'That file is not a backup from this app, so nothing was changed.', true); return; }
            const puts = [];
            s.items.forEach(x => SLOTS.forEach(sl => {
                if (!x[sl]) return;
                const d = ph[x[sl]];
                if (!okPhoto(d) || !DB.ok) { x[sl] = ''; return; }
                puts.push(DB.put(x[sl], d).then(() => { thumbs[x[sl]] = d; }).catch(() => { x[sl] = ''; }));
            }));
            Promise.all(puts).then(() => {
                if (editing) resetForm(false);
                panel = null;
                change(() => { state = s; }, 'tools-msg', 'Restored ' + plural(s.items.reduce((a, x) => a + x.qty, 0), 'item') + ' in ' + plural(s.rooms.length, 'room') + ' from the backup.');
                fillSettings(); fillCover();
            });
        };
        r.onerror = () => say('tools-msg', 'Could not read that file.', true);
        r.readAsText(file);
    }

    // ---------- start ----------
    function start() {
        load();
        if (fresh && /-(IN|PK|BD|NP|LK)$/i.test(navigator.language || '')) state.group = 'lakh';
        fillSettings(); fillCover();
        try { if (!window.indexedDB) DB.ok = false; } catch (e) { DB.ok = false; }
        if (!DB.ok) { $('photo-rows').hidden = true; $('photo-hint').textContent = 'This browser cannot keep photos, so the photo option is off.'; }
        if (loadNote) flash = { where: 'top-msg', text: loadNote, bad: true };
        // the form
        $('i-room').addEventListener('input', fillQuick);
        $('i-qty').addEventListener('input', qtyUI);
        $('i-value').addEventListener('input', qtyUI);
        $('more-open').addEventListener('click', () => { $('more-box').hidden = false; $('more-open').hidden = true; $('i-brand').focus(); });
        $('i-got').max = today;
        SLOTS.forEach(s => {
            $('ph-' + s + '-pick').addEventListener('click', () => $('ph-' + s).click());
            $('ph-' + s).addEventListener('change', e => {
                const f = e.target.files[0]; e.target.value = '';
                if (!f) return;
                if (!/^image\//.test(f.type)) { say('add-msg', 'That file is not a photo.', true); return; }
                shrink(f, s === 'rphoto' ? 1400 : 900).then(d => { photos[s] = { data: d, changed: true }; showPhotos(); }).catch(() => say('add-msg', 'Could not open that photo. Try another one.', true));
            });
            $('ph-' + s + '-del').addEventListener('click', () => { photos[s] = { data: null, changed: true }; showPhotos(); });
        });
        $('i-save').addEventListener('click', saveItem);
        $('i-cancel').addEventListener('click', () => { resetForm(false); say('add-msg', 'Nothing was changed.'); });
        ['i-room', 'i-name', 'i-qty', 'i-value', 'i-brand', 'i-serial', 'i-paid', 'i-receipt', 'i-note'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveItem(); } }));
        // cover
        $('c-save').addEventListener('click', saveCover);
        ['c-cover', 'c-limit'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveCover(); } }));
        // finding
        $('find').addEventListener('input', e => { query = e.target.value; renderRooms(); });
        // sharing
        $('g-copy').addEventListener('click', () => copyText(C.allText(state, today), 'glance-msg'));
        $('g-print').addEventListener('click', () => printPart('all'));
        $('cl-copy').addEventListener('click', () => copyText(C.claimText(state, today), 'claim-msg'));
        $('cl-print').addEventListener('click', () => printPart('claim'));
        // settings
        $('cur').addEventListener('change', e => { change(() => { state.cur = C.CURS.includes(e.target.value) ? e.target.value : ''; }, 'tools-msg', () => 'Money is now shown as ' + C.fmtMoney(125000, state.cur, state.group) + '.'); });
        $('group').addEventListener('change', e => { change(() => { state.group = e.target.value === 'lakh' ? 'lakh' : 'west'; }, 'tools-msg', () => 'Big numbers are now shown as ' + C.fmtMoney(123456700, '', state.group) + '.'); });
        $('backup').addEventListener('click', backup);
        const pick = () => $('restore-file').click();
        $('restore').addEventListener('click', pick); $('restore-first').addEventListener('click', pick);
        $('restore-file').addEventListener('change', e => { restore(e.target.files[0]); e.target.value = ''; });
        $('csv').addEventListener('click', () => {
            if (!state.items.length) { say('tools-msg', 'Add some items first.'); return; }
            download('home-inventory-' + today + '.csv', 'text/csv;charset=utf-8', '﻿' + C.csv(state));
            say('tools-msg', 'Saved the spreadsheet file (CSV). It opens in Excel or Google Sheets.');
        });
        $('del-all').addEventListener('click', () => {
            if (!state.items.length && state.cover == null && state.limit == null) { say('tools-msg', 'There is nothing to delete.'); return; }
            if (editing) resetForm(false);
            panel = null; query = ''; $('find').value = '';
            change(() => { state.items = []; state.rooms = []; state.cover = null; state.limit = null; }, 'tools-msg', 'Deleted everything.');
            fillCover();
        });
        // the date changes at midnight: redraw ages and the default dates
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.today(new Date()) !== today) { today = C.today(new Date()); $('i-got').max = today; render(); } });
        resetForm(false);
        render();
        loadThumbs(); tidyPhotos();
    }
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    start();
})();
