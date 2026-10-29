// Gold and Jewellery Record for the Family: the page. The weights, values and words are in core.js (window.GJR).
(function () {
    'use strict';
    const C = window.GJR, SLUG = 'gold-and-jewellery-record-for-the-family', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '৳': '৳ (taka)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (riyal)',
        'KWD': 'KWD (dinar)', 'OMR': 'OMR (rial)', 'BHD': 'BHD (dinar)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)',
        'NZ$': 'NZ$ (NZ dollar)', 'R': 'R (rand)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)', 'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₱': '₱ (peso)', 'S$': 'S$ (Singapore dollar)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const UNIT_WORD = { tola: 'tola', g: 'grams', oz: 'troy ounces' };
    let state = C.emptyState(), today = C.today(new Date()), fresh = true, canSave = true, loadNote = '';
    let editing = null;          // id of the piece in the form, or null when adding
    let photo = { data: null, changed: false };   // the photo in the form
    let panel = null;            // { id, mode: 'sold' | 'given' | 'rename' } open on one piece or person
    let flash = null, undoSnap = null;
    const thumbs = {};           // piece id -> data URL, read from the photo store

    // ---------- small helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const p = (cls, text) => el('p', cls, text);
    const money = c => C.fmtMoney(c, state.cur, state.group);
    const W = ug => C.fmtW(ug, state), W1 = ug => C.fmtW1(ug, state);
    const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const byId = id => state.pieces.find(x => x.id === id);
    const personName = id => { const pr = C.personOf(state, id); return pr ? pr.name : ''; };
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
            if (ok) done(); else say(where, 'Could not copy here. Use Email the list instead.', true);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function download(name, type, text) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

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
        C.prunePeople(state);
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
        if (editing && !byId(editing)) resetForm();
        save(); fillSettings(); fillRates();
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
    // shrink a phone photo so dozens fit on the device
    function shrink(file) {
        return new Promise((res, rej) => {
            const url = URL.createObjectURL(file), img = new Image();
            img.onload = () => {
                const max = 900, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
                const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.naturalWidth * sc)); cv.height = Math.max(1, Math.round(img.naturalHeight * sc));
                cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                URL.revokeObjectURL(url);
                res(cv.toDataURL('image/jpeg', 0.78));
            };
            img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
            img.src = url;
        });
    }
    function loadThumbs() {
        const want = state.pieces.filter(x => x.photo && !thumbs[x.photo]);
        if (!want.length || !DB.ok) return;
        Promise.all(want.map(x => DB.get(x.photo).then(d => { if (okPhoto(d)) thumbs[x.photo] = d; }).catch(() => {}))).then(() => render());
    }
    // photos of pieces deleted in an earlier visit (kept until then so Undo can bring them back)
    function tidyPhotos() {
        if (!DB.ok) return;
        DB.keys().then(keys => { (keys || []).forEach(k => { if (!state.pieces.some(x => x.photo === k)) DB.del(k).catch(() => {}); }); }).catch(() => {});
    }

    // ---------- the add / edit form ----------
    const unit = () => $('p-unit').value;
    function purity() {
        const v = $('p-pur').value;
        if (v === 'gx' || v === 'sx') {
            const r = C.parseNum($('p-purx').value, 0, { blank: v === 'gx' ? 'Type the karat, from 1 to 24.' : 'Type the purity from the stamp, such as 800.', bad: 'Type a whole number.', decimals: 'Type a whole number.' });
            if (r.error) return r;
            if (v === 'gx' && (r.n < 1 || r.n > 24)) return { error: 'Gold karat goes from 1 to 24.' };
            if (v === 'sx' && (r.n < 1 || r.n > 1000)) return { error: 'Silver purity goes from 1 to 1000 (925 is sterling).' };
            return v === 'gx' ? { metal: 'gold', k: r.n } : { metal: 'silver', fine: r.n };
        }
        return v[0] === 's' ? { metal: 'silver', fine: +v.slice(1) } : { metal: 'gold', k: +v.slice(1) };
    }
    function readWeight(stones) {
        const u = unit();
        if (u === 'tmr') return stones ? C.parseTMR($('p-st').value, $('p-sm').value, $('p-sr').value, { zeroOk: true }) : C.parseTMR($('p-wt').value, $('p-wm').value, $('p-wr').value);
        return stones ? (String($('p-s').value).trim() === '' ? { ug: 0 } : C.parseWeight($('p-s').value, u, { zeroOk: true })) : C.parseWeight($('p-w').value, u);
    }
    function setUnitUI() {
        const u = unit(), tmr = u === 'tmr';
        $('w-one').hidden = tmr; $('w-tmr').hidden = !tmr; $('s-one').hidden = tmr; $('s-tmr').hidden = !tmr;
        $('p-w-l').textContent = 'Weight in ' + (UNIT_WORD[u] || 'tola');
        $('p-s-l').textContent = 'In ' + (UNIT_WORD[u] || 'tola');
        $('p-w').placeholder = u === 'g' ? 'e.g. 29.16' : u === 'oz' ? 'e.g. 1.25' : 'e.g. 2.5';
        $('p-s').placeholder = u === 'g' ? 'e.g. 2.9' : u === 'oz' ? 'e.g. 0.1' : 'e.g. 0.25';
        preview();
    }
    // the same weight in every unit, as the person types
    function preview() {
        const out = $('p-w-out'), w = readWeight(false);
        if (w.error) { out.textContent = ''; return; }
        let ug = w.ug, extra = '';
        if (!$('stone-box').hidden) {
            const s = readWeight(true);
            if (!s.error && s.ug > 0 && s.ug < ug) { ug -= s.ug; extra = ' of metal, after the stones'; }
        }
        const tp = C.tmrParts(ug);
        out.textContent = '= ' + C.fmtTola(ug, state.group) + (tp.m || tp.r ? ' = ' + C.fmtTMR(ug) : '') + ' = ' + C.fmtGram(ug, state.group) + extra;
    }
    function fillQuick() {
        const oq = $('owner-quick'); oq.textContent = '';
        state.people.forEach(pr => {
            const c = btn(pr.name, 'chip' + (C.same($('p-owner').value.trim(), pr.name) ? ' on' : ''), () => { $('p-owner').value = pr.name; setErr('p-owner', ''); fillQuick(); });
            c.setAttribute('aria-pressed', C.same($('p-owner').value.trim(), pr.name) ? 'true' : 'false');
            oq.appendChild(c);
        });
        oq.hidden = !state.people.length;
        const places = [], seen = new Set();
        ['Home', 'Bank locker'].concat(state.pieces.map(x => x.place)).forEach(pl => { if (pl && !seen.has(pl.toLocaleLowerCase())) { seen.add(pl.toLocaleLowerCase()); places.push(pl); } });
        const pq = $('place-quick'); pq.textContent = '';
        places.slice(0, 8).forEach(pl => {
            const on = C.same($('p-place').value.trim(), pl);
            const c = btn(pl, 'chip' + (on ? ' on' : ''), () => { $('p-place').value = on ? '' : pl; fillQuick(); });
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
            pq.appendChild(c);
        });
    }
    function showPhoto() {
        const img = $('p-photo-img');
        img.hidden = !photo.data; if (photo.data) img.src = photo.data; else img.removeAttribute('src');
        $('p-photo-del').hidden = !photo.data;
        $('p-photo-pick').textContent = photo.data ? 'Change the photo' : 'Add a photo';
    }
    function resetForm(keepOwner) {
        const owner = $('p-owner').value;
        editing = null; photo = { data: null, changed: false };
        ['p-name', 'p-w', 'p-wt', 'p-wm', 'p-wr', 'p-s', 'p-st', 'p-sm', 'p-sr', 'p-paid', 'p-note', 'p-got', 'p-purx'].forEach(id => { $(id).value = ''; });
        $('p-owner').value = keepOwner ? owner : '';
        $('stone-box').hidden = true; $('stone-open').hidden = false;
        $('more-box').hidden = true; $('more-open').hidden = false;
        ['p-owner', 'p-name', 'p-w', 'p-s', 'p-paid', 'p-got', 'p-purx'].forEach(id => setErr(id, ''));
        $('p-save').textContent = 'Save piece'; $('p-cancel').hidden = true;
        $('add-h').textContent = 'Add a piece of jewellery';
        showPhoto(); setPurUI(); setUnitUI(); fillQuick();
    }
    function setPurUI() {
        const v = $('p-pur').value, x = v === 'gx' || v === 'sx';
        $('pur-x-box').hidden = !x;
        $('p-purx-l').textContent = v === 'sx' ? 'Silver purity from the stamp (1 to 1000)' : 'Karat (1 to 24)';
        $('p-purx').placeholder = v === 'sx' ? 'e.g. 800' : 'e.g. 20';
        if (!x) setErr('p-purx', '');
    }
    function startEdit(id) {
        const x = byId(id); if (!x) return;
        resetForm(false);
        editing = id;
        $('p-owner').value = personName(x.owner);
        $('p-name').value = x.name;
        const std = x.metal === 'gold' ? (C.KARATS.includes(x.k) ? 'g' + x.k : 'gx') : ([999, 925].includes(x.fine) ? 's' + x.fine : 'sx');
        $('p-pur').value = std;
        if (std === 'gx') $('p-purx').value = x.k; if (std === 'sx') $('p-purx').value = x.fine;
        $('p-unit').value = x.unit;
        if (x.unit === 'tmr') {
            const a = C.tmrParts(x.ug); $('p-wt').value = a.t || ''; $('p-wm').value = a.m || ''; $('p-wr').value = a.r ? String(a.r) : '';
            if (x.stoneUg) { const b = C.tmrParts(x.stoneUg); $('p-st').value = b.t || ''; $('p-sm').value = b.m || ''; $('p-sr').value = b.r ? String(b.r) : ''; }
        } else {
            $('p-w').value = C.weightInput(x.ug, x.unit);
            if (x.stoneUg) $('p-s').value = C.weightInput(x.stoneUg, x.unit);
        }
        if (x.stoneUg) { $('stone-box').hidden = false; $('stone-open').hidden = true; }
        $('p-place').value = x.place;
        $('p-got').value = x.got; $('p-paid').value = C.moneyInput(x.paid); $('p-note').value = x.note;
        if (x.got || x.paid != null || x.note || x.photo) { $('more-box').hidden = false; $('more-open').hidden = true; }
        photo = { data: x.photo ? (thumbs[x.photo] || null) : null, changed: false };
        $('p-save').textContent = 'Save changes'; $('p-cancel').hidden = false;
        $('add-h').textContent = 'Edit: ' + x.name;
        setPurUI(); setUnitUI(); showPhoto(); fillQuick();
        $('add').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('p-name').focus({ preventScroll: true });
    }
    function savePiece() {
        let ok = true;
        const owner = C.cleanText($('p-owner').value, C.LIM.person);
        ok = setErr('p-owner', owner ? '' : 'Type whose it is, such as Ammi or your own name.') && ok;
        if (owner && !state.people.some(x => C.same(x.name, owner)) && state.people.length >= C.LIM.people) ok = setErr('p-owner', 'The list has ' + C.LIM.people + ' people already. Pick one of them.') && false;
        const name = C.cleanText($('p-name').value, C.LIM.name);
        ok = setErr('p-name', name ? '' : 'Type what it is, such as Gold bangles.') && ok;
        const pur = purity();
        ok = setErr('p-purx', pur.error || '') && ok;
        const w = readWeight(false);
        const wid = unit() === 'tmr' ? 'p-wt' : 'p-w';
        ok = setErr(wid, w.error || '') && ok;
        if (w.error) $('p-w-err').textContent = w.error;
        let stoneUg = 0;
        if (!$('stone-box').hidden) {
            const s = readWeight(true), sid = unit() === 'tmr' ? 'p-st' : 'p-s';
            let e = s.error || '';
            if (!e && !w.error && s.ug >= w.ug) e = 'The stones cannot weigh as much as the whole piece. Check both weights.';
            ok = setErr(sid, e) && ok; $('p-s-err').textContent = e;
            if (!e) stoneUg = s.ug;
        }
        let got = '', paid = null;
        if (!$('more-box').hidden) {
            got = $('p-got').value;
            const ge = got && !C.isDate(got) ? 'Pick a real date.' : got && got > today ? 'That date is in the future.' : '';
            ok = setErr('p-got', ge) && ok;
            const pm = C.parseOptMoney($('p-paid').value);
            ok = setErr('p-paid', pm.error || '') && ok;
            paid = pm.error ? null : pm.n;
        }
        if (!editing && state.pieces.length >= C.LIM.pieces) { say('add-msg', 'The list is full (' + C.LIM.pieces + ' pieces).', true); return; }
        if (!ok) { const f = document.querySelector('#add [aria-invalid="true"]'); if (f) f.focus(); return; }
        const id = editing || newId('p');
        const keep = editing ? byId(editing) : null;
        let ph = photo.changed ? '' : (keep ? keep.photo : '');
        const doIt = () => change(() => {
            let pr = state.people.find(x => C.same(x.name, owner));
            if (!pr) { pr = { id: newId('u'), name: owner }; state.people.push(pr); }
            const o = { id, owner: pr.id, name, metal: pur.metal, k: pur.metal === 'gold' ? pur.k : 22, fine: pur.metal === 'silver' ? pur.fine : 999, ug: w.ug, stoneUg, unit: unit(),
                place: C.cleanText($('p-place').value, C.LIM.place), got, paid, note: C.cleanNote($('p-note').value, C.LIM.note), photo: ph,
                status: keep ? keep.status : 'have', out: keep ? keep.out : null, log: keep ? keep.log : [] };
            if (keep) state.pieces[state.pieces.indexOf(keep)] = o; else state.pieces.push(o);
        }, 'add-msg', (editing ? 'Saved the changes to ' : 'Saved ') + name + ' for ' + owner + ': ' + W1(w.ug - stoneUg) + '.');
        const finish = () => { if (doIt()) resetForm(!keep); };
        if (photo.changed && photo.data && DB.ok) {
            // a new key for every new photo, so Undo can bring back the old one
            const key = newId('f'), data = photo.data;
            DB.put(key, data).then(() => { thumbs[key] = data; ph = key; finish(); }).catch(() => { finish(); say('add-msg', 'The piece was saved, but this browser would not keep the photo.', true); });
        } else finish();
    }

    // ---------- rates ----------
    function fillRates() {
        const r = state.rates;
        $('r-unit').value = r.unit;
        $('r-gold').value = C.moneyInput(r.gold);
        C.KARAT_RATES.forEach(k => { $('r-k' + k).value = C.moneyInput(r['k' + k]); });
        $('r-silver').value = C.moneyInput(r.silver);
        if (C.KARAT_RATES.some(k => r['k' + k])) { $('rk-box').hidden = false; $('rk-open').hidden = true; }
        if (r.silver || state.pieces.some(x => x.metal === 'silver' && x.status === 'have')) { $('rs-box').hidden = false; $('rs-open').hidden = true; }
        rateLabels();
        whenLine();
    }
    function rateLabels() {
        const u = C.UNIT_NAME[$('r-unit').value];
        $('r-gold-l').textContent = '24k gold rate ' + u;
        $('r-silver-l').textContent = 'Fine silver rate ' + u;
        $('r-gold').placeholder = { tola: 'e.g. 350000', '10g': 'e.g. 300000', g: 'e.g. 30000', oz: 'e.g. 2650' }[$('r-unit').value];
        $('r-silver').placeholder = { tola: 'e.g. 4500', '10g': 'e.g. 3900', g: 'e.g. 390', oz: 'e.g. 32' }[$('r-unit').value];
    }
    function whenLine() {
        const r = state.rates;
        $('r-when').textContent = r.d && C.hasRate(r) ? 'Rate saved on ' + C.fmtDate(r.d) + ' (' + C.ago(r.d, today) + ').' : 'No rate saved yet.';
    }
    function saveRates() {
        const read = (id, errId) => { const m = C.parseOptMoney($(id).value); setErr(id, m.error || ''); if (errId && m.error) $(errId).textContent = m.error; return m; };
        const g = read('r-gold'), ks = C.KARAT_RATES.map(k => read('r-k' + k, 'r-k-err')), s = read('r-silver');
        if (!ks.some(k => k.error)) $('r-k-err').textContent = '';
        if (g.error || s.error || ks.some(k => k.error)) return;
        const o = C.emptyRates();
        o.unit = $('r-unit').value; o.d = today; o.gold = g.n || null; o.silver = s.n || null;
        C.KARAT_RATES.forEach((k, i) => { o['k' + k] = ks[i].n || null; });
        if (!C.hasRate(o)) { setErr('r-gold', 'Type the 24k gold rate, such as 350000.'); return; }
        const same = ['unit', 'gold', 'k22', 'k21', 'k18', 'silver'].every(k => o[k] === state.rates[k]);
        change(() => {
            if (!same && C.hasRate(state.rates) && state.rates.d) state.prev = state.rates;
            state.rates = o;
        }, 'rates-msg', () => {
            const s2 = C.sums(C.have(state), state.rates);
            return same ? 'Saved: the same rate as before, now dated today.' : (s2.priced ? 'Saved. The family\'s ' + plural(s2.priced, 'piece') + (s2.priced === 1 ? ' is' : ' are') + ' worth ' + money(s2.value) + ' at this rate.' : 'Saved the rate. Add the jewellery to see what it is worth.');
        });
    }

    // ---------- drawing ----------
    function render() {
        const any = state.pieces.length > 0, hv = C.have(state);
        $('intro').hidden = any;
        $('glance').hidden = !any;
        $('family').hidden = !hv.length;
        $('places').hidden = !hv.length;
        $('history').hidden = !state.pieces.some(x => x.status !== 'have');
        document.querySelectorAll('[data-cur]').forEach(t => { t.textContent = state.cur; t.hidden = !state.cur; });
        if (any) renderGlance();
        renderPeople(); renderPlaces(); renderHistory();
        fillQuick(); whenLine();
        document.querySelectorAll('.msg').forEach(m => { if (!flash || m.id !== flash.where) { m.textContent = ''; m.className = 'msg'; } });
        if (flash) showMsg($(flash.where) || $('top-msg'), flash.text, flash.undo, flash.bad);
        flash = null;
    }
    function renderGlance() {
        const b = $('glance-body'); b.textContent = '';
        const s = C.sums(C.have(state), state.rates), age = C.rateAge(state, today), ch = C.change(state);
        const top = el('div', 'glance-top'), main = el('div', 'g-main');
        if (s.goldUg) {
            main.appendChild(p('g-label', 'Whole family: gold'));
            main.appendChild(p('g-big', W1(s.goldUg)));
            main.appendChild(p('g-line', (state.wunit === 'g' ? C.fmtTola(s.goldUg, state.group) : C.fmtGram(s.goldUg, state.group)) + (C.tmrParts(s.goldUg).m || C.tmrParts(s.goldUg).r ? ' · ' + C.fmtTMR(s.goldUg) : '')));
            main.appendChild(p('g-line', 'Pure gold in it: ' + W(s.pureGoldUg)));
        }
        if (s.silverUg) {
            main.appendChild(p('g-label' + (s.goldUg ? ' g-gap' : ''), 'Whole family: silver'));
            main.appendChild(p(s.goldUg ? 'g-mid' : 'g-big', W1(s.silverUg)));
            main.appendChild(p('g-line', state.wunit === 'g' ? C.fmtTola(s.silverUg, state.group) : C.fmtGram(s.silverUg, state.group)));
        }
        top.appendChild(main);
        const val = el('div', 'g-val');
        if (s.priced) {
            val.appendChild(p('g-label', 'Worth at the rate you typed'));
            val.appendChild(p('g-big gold', money(s.value)));
            const rw = C.rateWords(state);
            val.appendChild(p('g-line muted', 'Rate of ' + C.fmtDate(state.rates.d) + ': ' + rw.join('; ') + '. Before any shop deduction.'));
            if (s.unpriced) val.appendChild(p('g-soon', plural(s.unpriced, 'piece') + ' not counted: ' + (state.rates.silver ? 'type its rate' : 'type the silver rate') + ' under Today\'s gold rate.'));
            if (ch && ch.diff) val.appendChild(p(ch.diff > 0 ? 'g-up' : 'g-down', (ch.diff > 0 ? 'Up ' : 'Down ') + money(Math.abs(ch.diff)) + ' since the rate of ' + C.fmtDate(ch.d) + '.'));
            if (age != null && age > 7) {
                val.classList.add('is-old');
                val.appendChild(p('g-soon', 'This rate is ' + age + ' days old. Type today\'s rate for an up-to-date value.'));
            }
            if (s.paidN) {
                const d = s.paidValue - s.paid;
                val.appendChild(p('g-line', plural(s.paidN, 'piece') + ' with the price written: paid ' + money(s.paid) + ', worth ' + money(s.paidValue) + ' now (' + (d >= 0 ? 'up ' : 'down ') + money(Math.abs(d)) + ').'));
            }
        } else {
            val.classList.add('is-old');
            val.appendChild(p('g-label', 'What is it worth?'));
            val.appendChild(p('g-line', C.have(state).length ? 'Type today\'s gold rate to see what the family\'s jewellery is worth.' : 'Everything has been sold or given away.'));
        }
        if (C.have(state).length) val.appendChild(btn(s.priced ? 'Type a new rate' : 'Type today\'s rate', 'secondary small g-rate', () => { $('rates').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('r-gold').focus({ preventScroll: true }); }));
        top.appendChild(val); b.appendChild(top);
        const groups = C.byPerson(state).filter(g => g.list.length);
        if (groups.length) {
            const tiles = el('div', 'tiles');
            groups.forEach(g => {
                const t = el('div', 'tile');
                t.appendChild(p('t-label', g.person.name));
                t.appendChild(p('t-val', g.s.goldUg ? W1(g.s.goldUg) : W1(g.s.silverUg) + ' silver'));
                t.appendChild(p('t-sub', g.s.priced ? money(g.s.value) : plural(g.s.n, 'piece')));
                tiles.appendChild(t);
            });
            b.appendChild(tiles);
        }
        const mail = 'mailto:?subject=' + encodeURIComponent('Family gold and jewellery list') + '&body=' + encodeURIComponent(C.allText(state, today).slice(0, 1800));
        $('g-mail').href = mail;
    }
    function pieceBox(x, inHistory) {
        const box = el('article', 'piece' + (x.metal === 'silver' ? ' silver' : '') + (inHistory ? ' past' : ''));
        box.setAttribute('aria-label', x.name);
        const top = el('div', 'pc-top');
        if (x.photo && thumbs[x.photo]) {
            const im = el('img', 'thumb'); im.src = thumbs[x.photo]; im.alt = 'Photo of ' + x.name;
            const tb = btn('', 'thumb-btn', () => box.classList.toggle('big-photo'), 'Show the photo of ' + x.name + ' bigger'); tb.appendChild(im);
            top.appendChild(tb);
        }
        const head = el('div', 'pc-head');
        head.appendChild(el('h4', 'pc-name', x.name));
        head.appendChild(p('pc-pur', C.purityName(x)));
        top.appendChild(head);
        const v = inHistory ? null : C.value(x, state.rates);
        if (v != null) top.appendChild(p('pc-val', money(v)));
        box.appendChild(top);
        const tp = C.tmrParts(C.net(x));
        box.appendChild(p('pc-w', W(C.net(x)) + (state.wunit === 'tola' && (tp.m || tp.r) ? ' · ' + C.fmtTMR(C.net(x)) : '')));
        if (x.stoneUg) box.appendChild(p('pc-sub', 'Whole piece ' + W1(x.ug) + ', stones ' + W1(x.stoneUg) + ' taken off'));
        const facts = [];
        if (inHistory) facts.push(personName(x.owner) + '\'s');
        if (x.place && !inHistory) facts.push('Kept: ' + x.place);
        if (x.paid != null) facts.push('Paid ' + money(x.paid) + (x.got ? ' on ' + C.fmtDate(x.got) : ''));
        else if (x.got) facts.push('Since ' + C.fmtDate(x.got));
        if (facts.length) box.appendChild(p('pc-sub', facts.join(' · ')));
        if (!inHistory && v != null && x.paid != null) { const d = v - x.paid; box.appendChild(p('pc-gain ' + (d >= 0 ? 'up' : 'down'), (d >= 0 ? 'Up ' : 'Down ') + money(Math.abs(d)) + ' on what was paid')); }
        if (!inHistory && v == null && C.hasRate(state.rates)) box.appendChild(p('pc-sub warnt', x.metal === 'silver' ? 'Type the silver rate to value it.' : 'Type the 24k rate to value it.'));
        if (inHistory && x.out) {
            const t = x.status === 'sold' ? 'Sold' + (x.out.d ? ' on ' + C.fmtDate(x.out.d) : '') + (x.out.amt != null ? ' for ' + money(x.out.amt) : '')
                : 'Given to ' + (x.out.to || 'someone outside the family') + (x.out.d ? ' on ' + C.fmtDate(x.out.d) : '');
            box.appendChild(p('pc-out', t));
            if (x.status === 'sold' && x.out.amt != null && x.paid != null) { const d = x.out.amt - x.paid; box.appendChild(p('pc-gain ' + (d >= 0 ? 'up' : 'down'), (d >= 0 ? 'Got ' + money(d) + ' more than' : 'Got ' + money(-d) + ' less than') + ' was paid')); }
        }
        x.log.forEach(h => box.appendChild(p('pc-log', h.text)));
        if (x.note) box.appendChild(p('pc-note', x.note));
        const bs = el('div', 'pc-btns');
        if (inHistory) {
            bs.appendChild(btn('I still have it', 'secondary small', () => change(() => { x.status = 'have'; x.out = null; }, 'history-msg', x.name + ' is back in ' + personName(x.owner) + '\'s box.'), 'I still have ' + x.name));
            bs.appendChild(btn('Delete', 'secondary small danger-t', () => delPiece(x, 'history-msg'), 'Delete ' + x.name));
        } else {
            bs.appendChild(btn('Edit', 'secondary small', () => startEdit(x.id), 'Edit ' + x.name));
            bs.appendChild(btn('Sold', 'secondary small', () => { panel = { id: x.id, mode: 'sold' }; render(); focusPanel(); }, 'Mark ' + x.name + ' as sold'));
            bs.appendChild(btn('Given', 'secondary small', () => { panel = { id: x.id, mode: 'given' }; render(); focusPanel(); }, 'Mark ' + x.name + ' as given to someone'));
            bs.appendChild(btn('Delete', 'secondary small danger-t', () => delPiece(x, 'family-msg'), 'Delete ' + x.name));
        }
        box.appendChild(bs);
        if (panel && panel.id === x.id) box.appendChild(panel.mode === 'sold' ? soldPanel(x, v) : givenPanel(x));
        return box;
    }
    function focusPanel() { const f = document.querySelector('.panel input, .panel select'); if (f) f.focus(); }
    function delPiece(x, where) {
        if (editing === x.id) resetForm(false);
        change(() => { state.pieces = state.pieces.filter(y => y !== x); }, where, 'Deleted ' + x.name + '.');
    }
    function panelField(label, input, id) {
        const w = el('div', 'field'); const l = el('label', '', label); l.htmlFor = id; input.id = id; w.appendChild(l); w.appendChild(input);
        const e = p('err'); e.id = id + '-err'; e.setAttribute('role', 'alert'); w.appendChild(e); input.setAttribute('aria-describedby', id + '-err');
        return w;
    }
    function textInput(max, ph, mode) { const i = el('input'); i.type = 'text'; i.maxLength = max; i.autocomplete = 'off'; if (ph) i.placeholder = ph; if (mode) i.inputMode = mode; return i; }
    function dateInput(v) { const i = el('input'); i.type = 'date'; i.value = v; i.max = today; return i; }
    function soldPanel(x, v) {
        const pn = el('div', 'panel'); pn.appendChild(el('h5', '', 'Mark ' + x.name + ' as sold'));
        const d = dateInput(today), amt = textInput(24, 'e.g. ' + (v != null ? C.moneyInput(v) : '200000'), 'decimal');
        if (v != null) amt.value = C.moneyInput(v);
        const two = el('div', 'two');
        two.appendChild(panelField('Sold on', d, 'sp-d'));
        const af = panelField('What you got (optional)', amt, 'sp-amt'); two.appendChild(af);
        pn.appendChild(two);
        if (v != null) pn.appendChild(p('hint', 'Filled in with today\'s value. Change it to what the shop paid.'));
        const rb = el('div', 'row-btns');
        rb.appendChild(btn('Mark as sold', 'primary', () => {
            const dv = d.value, m = C.parseOptMoney(amt.value);
            let ok = setErr('sp-d', !C.isDate(dv) ? 'Pick the date it was sold.' : dv > today ? 'That date is in the future.' : '');
            ok = setErr('sp-amt', m.error || '') && ok;
            if (!ok) return;
            panel = null;
            change(() => { x.status = 'sold'; x.out = { d: dv, amt: m.n, to: '' }; }, 'history-msg', 'Marked ' + x.name + ' as sold. It is under Sold and given away.');
        }));
        rb.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); }));
        pn.appendChild(rb);
        return pn;
    }
    function givenPanel(x) {
        const pn = el('div', 'panel'); pn.appendChild(el('h5', '', 'Who was ' + x.name + ' given to?'));
        const sel = el('select');
        state.people.filter(pr => pr.id !== x.owner).forEach(pr => { const o = el('option', '', pr.name); o.value = pr.id; sel.appendChild(o); });
        const on = el('option', '', 'Someone new in the family…'); on.value = 'new'; sel.appendChild(on);
        const oo = el('option', '', 'Someone outside the family'); oo.value = 'out'; sel.appendChild(oo);
        pn.appendChild(panelField('Given to', sel, 'gp-who'));
        const nm = textInput(C.LIM.person, 'e.g. Sara');
        const nmf = panelField('Their name', nm, 'gp-name'); pn.appendChild(nmf);
        const hint = p('hint', '');
        const d = dateInput(today);
        const sync = () => {
            const v = sel.value;
            nmf.hidden = !(v === 'new' || v === 'out');
            nmf.querySelector('label').textContent = v === 'out' ? 'Their name (optional)' : 'Their name';
            hint.textContent = v === 'out' ? 'It moves to Sold and given away.' : 'It moves to their box, with a line saying who gave it and when.';
        };
        sel.addEventListener('change', sync);
        pn.appendChild(hint);
        pn.appendChild(panelField('Given on', d, 'gp-d'));
        sync();
        const rb = el('div', 'row-btns');
        rb.appendChild(btn('Save', 'primary', () => {
            const v = sel.value, dv = d.value, name = C.cleanText(nm.value, C.LIM.person), from = personName(x.owner);
            let ok = setErr('gp-d', !C.isDate(dv) ? 'Pick the date.' : dv > today ? 'That date is in the future.' : '');
            if (v === 'new') {
                let e = name ? '' : 'Type their name.';
                if (!e && C.same(name, from)) e = 'That is who has it now.';
                if (!e && !state.people.some(y => C.same(y.name, name)) && state.people.length >= C.LIM.people) e = 'The list has ' + C.LIM.people + ' people already.';
                ok = setErr('gp-name', e) && ok;
            }
            if (!ok) return;
            panel = null;
            if (v === 'out') {
                change(() => { x.status = 'gone'; x.out = { d: dv, amt: null, to: name }; }, 'history-msg', 'Marked ' + x.name + ' as given' + (name ? ' to ' + name : '') + '. It is under Sold and given away.');
                return;
            }
            let to = null;
            change(() => {
                to = v === 'new' ? state.people.find(y => C.same(y.name, name)) : C.personOf(state, v);
                if (!to) { to = { id: newId('u'), name }; state.people.push(to); }
                x.owner = to.id;
                x.log = x.log.concat({ d: dv, text: 'Given by ' + from + ' to ' + to.name + ' on ' + C.fmtDate(dv) }).slice(-C.LIM.log);
            }, 'family-msg', x.name + ' is now in ' + (v === 'new' ? name : personName(v)) + '\'s box.');
        }));
        rb.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); }));
        pn.appendChild(rb);
        return pn;
    }
    function renamePanel(pr) {
        const pn = el('div', 'panel'); pn.appendChild(el('h5', '', 'Rename ' + pr.name));
        const i = textInput(C.LIM.person, 'e.g. Ayesha'); i.value = pr.name;
        pn.appendChild(panelField('New name', i, 'rn-name'));
        const go = () => {
            const name = C.cleanText(i.value, C.LIM.person);
            const other = state.people.find(y => y !== pr && C.same(y.name, name));
            if (!setErr('rn-name', !name ? 'Type a name.' : other ? name + ' is already in the list. Use Given on each piece to move it to them.' : '')) return;
            panel = null;
            const old = pr.name;
            change(() => { pr.name = name; }, 'family-msg', 'Renamed ' + old + ' to ' + name + '.');
        };
        i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        const rb = el('div', 'row-btns');
        rb.appendChild(btn('Save name', 'primary', go));
        rb.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); }));
        pn.appendChild(rb);
        return pn;
    }
    function renderPeople() {
        const box = $('people'); box.textContent = '';
        C.byPerson(state).filter(g => g.list.length).forEach(g => {
            const sec = el('section', 'person');
            sec.setAttribute('aria-label', g.person.name);
            const hd = el('div', 'ps-head');
            const h = el('h3', 'ps-name', g.person.name);
            hd.appendChild(h);
            hd.appendChild(p('ps-count', plural(g.s.n, 'piece')));
            sec.appendChild(hd);
            C.sumWords(g.s, state).forEach(t => sec.appendChild(p('ps-sum', t)));
            if (g.s.priced) sec.appendChild(p('ps-val', 'Worth ' + money(g.s.value) + (g.s.unpriced ? ' (' + plural(g.s.unpriced, 'piece') + ' not valued)' : '')));
            const bs = el('div', 'ps-btns');
            bs.appendChild(btn('Copy ' + g.person.name + '\'s list', 'secondary small', () => copyText(C.personText(g, state), 'family-msg')));
            bs.appendChild(btn('Rename', 'secondary small', () => { panel = { id: g.person.id, mode: 'rename' }; render(); focusPanel(); }, 'Rename ' + g.person.name));
            bs.appendChild(btn('+ Add a piece for ' + g.person.name, 'secondary small', () => {
                if (editing) resetForm(false);
                $('p-owner').value = g.person.name; fillQuick();
                $('add').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('p-name').focus({ preventScroll: true });
            }));
            sec.appendChild(bs);
            if (panel && panel.id === g.person.id && panel.mode === 'rename') sec.appendChild(renamePanel(g.person));
            const list = el('div', 'pc-list');
            g.list.forEach(x => list.appendChild(pieceBox(x, false)));
            sec.appendChild(list);
            box.appendChild(sec);
        });
    }
    function renderPlaces() {
        const box = $('pl-list'); box.textContent = '';
        C.byPlace(state).forEach(g => {
            const d = el('div', 'place');
            const hd = el('div', 'ps-head');
            hd.appendChild(el('h3', 'ps-name', g.place));
            hd.appendChild(p('ps-count', plural(g.list.length, 'piece')));
            d.appendChild(hd);
            C.sumWords(g.s, state).forEach(t => d.appendChild(p('ps-sum', t)));
            const ul = el('ul', 'pl-items');
            g.list.forEach(x => { const li = el('li'); li.appendChild(el('span', 'pl-what', x.name + ' (' + personName(x.owner) + ')')); li.appendChild(el('span', 'pl-w', W1(C.net(x)))); ul.appendChild(li); });
            d.appendChild(ul);
            d.appendChild(btn('Copy the checklist', 'secondary small', () => copyText(C.placeText(g, state), 'places-msg'), 'Copy the checklist for ' + g.place));
            box.appendChild(d);
        });
    }
    function renderHistory() {
        const box = $('h-list'); box.textContent = '';
        state.pieces.filter(x => x.status !== 'have').slice().sort((a, b) => ((b.out && b.out.d) || '').localeCompare((a.out && a.out.d) || '')).forEach(x => box.appendChild(pieceBox(x, true)));
    }

    // ---------- settings, backup ----------
    function fillSettings() {
        const c = $('cur'); c.textContent = '';
        C.CURS.forEach(k => { const o = el('option', '', CUR_NAMES[k] || k); o.value = k; c.appendChild(o); });
        c.value = state.cur; $('group').value = state.group; $('wunit').value = state.wunit;
    }
    function backup() {
        const ids = state.pieces.filter(x => x.photo).map(x => x.photo), photos = {};
        const go = () => {
            download(SLUG + '-backup-' + today + '.json', 'application/json', JSON.stringify({ app: SLUG, saved: today, state, photos }));
            say('tools-msg', 'Saved the backup file' + (Object.keys(photos).length ? ' with ' + plural(Object.keys(photos).length, 'photo') : '') + '. Keep it somewhere safe, such as your email or cloud drive.');
        };
        if (!ids.length || !DB.ok) return go();
        Promise.all(ids.map(id => DB.get(id).then(d => { if (okPhoto(d)) photos[id] = d; }).catch(() => {}))).then(go);
    }
    function restore(file) {
        if (!file) return;
        if (file.size > 80000000) { say('tools-msg', 'That file is too big to be a backup from this app.', true); return; }
        const r = new FileReader();
        r.onload = () => {
            let s = null, photos = {};
            try { const j = JSON.parse(r.result); s = C.cleanState(j && j.app === SLUG ? j.state : j); if (j && j.photos && typeof j.photos === 'object') photos = j.photos; } catch (e) { s = null; }
            if (!s) { say('tools-msg', 'That file is not a backup from this app, so nothing was changed.', true); return; }
            const puts = s.pieces.filter(x => x.photo).map(x => {
                const d = photos[x.photo];
                if (!okPhoto(d) || !DB.ok) { x.photo = ''; return Promise.resolve(); }
                return DB.put(x.photo, d).then(() => { thumbs[x.photo] = d; }).catch(() => { x.photo = ''; });
            });
            Promise.all(puts).then(() => {
                if (editing) resetForm(false);
                const before = state; state = s; fillSettings(); fillRates(); state = before;
                change(() => { state = s; }, 'tools-msg', 'Restored ' + plural(s.pieces.length, 'piece') + ' for ' + plural(s.people.length, 'person', 'people') + ' from the backup.');
            });
        };
        r.onerror = () => say('tools-msg', 'Could not read that file.', true);
        r.readAsText(file);
    }

    // ---------- start ----------
    function start() {
        load();
        if (fresh && /-(IN|PK|BD|NP|LK)$/i.test(navigator.language || '')) state.group = 'lakh';
        fillSettings(); fillRates();
        try { if (!window.indexedDB) DB.ok = false; } catch (e) { DB.ok = false; }
        if (!DB.ok) { $('photo-row').hidden = true; $('photo-hint').textContent = 'This browser cannot keep photos, so the photo option is off.'; }
        if (loadNote) flash = { where: 'top-msg', text: loadNote, bad: true };
        // the form
        $('p-pur').addEventListener('change', setPurUI);
        $('p-unit').addEventListener('change', () => {
            // keep the weight when switching between tola and tola-masha-ratti, or any two units
            const prevUnit = $('p-unit').dataset.was || 'tola';
            const read = (u, st) => u === 'tmr' ? C.parseTMR($(st ? 'p-st' : 'p-wt').value, $(st ? 'p-sm' : 'p-wm').value, $(st ? 'p-sr' : 'p-wr').value, { zeroOk: true }) : C.parseWeight($(st ? 'p-s' : 'p-w').value, u, { zeroOk: true });
            [false, true].forEach(st => {
                const w = read(prevUnit, st), u = unit();
                if (w.error || !w.ug) return;
                if (u === 'tmr') { const a = C.tmrParts(w.ug); $(st ? 'p-st' : 'p-wt').value = a.t || ''; $(st ? 'p-sm' : 'p-wm').value = a.m || ''; $(st ? 'p-sr' : 'p-wr').value = a.r ? String(a.r) : ''; }
                else $(st ? 'p-s' : 'p-w').value = C.weightInput(w.ug, u);
            });
            $('p-unit').dataset.was = unit();
            setErr('p-w', ''); setErr('p-wt', ''); setErr('p-s', ''); setErr('p-st', ''); $('p-w-err').textContent = ''; $('p-s-err').textContent = '';
            setUnitUI();
        });
        $('p-unit').dataset.was = unit();
        ['p-w', 'p-wt', 'p-wm', 'p-wr', 'p-s', 'p-st', 'p-sm', 'p-sr'].forEach(id => $(id).addEventListener('input', preview));
        $('p-owner').addEventListener('input', fillQuick);
        $('p-place').addEventListener('input', fillQuick);
        $('stone-open').addEventListener('click', () => { $('stone-box').hidden = false; $('stone-open').hidden = true; (unit() === 'tmr' ? $('p-st') : $('p-s')).focus(); preview(); });
        $('stone-close').addEventListener('click', () => { $('stone-box').hidden = true; $('stone-open').hidden = false; ['p-s', 'p-st', 'p-sm', 'p-sr'].forEach(id => { $(id).value = ''; }); setErr('p-s', ''); setErr('p-st', ''); $('p-s-err').textContent = ''; preview(); });
        $('more-open').addEventListener('click', () => { $('more-box').hidden = false; $('more-open').hidden = true; $('p-got').focus(); });
        $('p-got').max = today;
        $('p-photo-pick').addEventListener('click', () => $('p-photo').click());
        $('p-photo').addEventListener('change', e => {
            const f = e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (!/^image\//.test(f.type)) { say('add-msg', 'That file is not a photo.', true); return; }
            shrink(f).then(d => { photo = { data: d, changed: true }; showPhoto(); }).catch(() => say('add-msg', 'Could not open that photo. Try another one.', true));
        });
        $('p-photo-del').addEventListener('click', () => { photo = { data: null, changed: true }; showPhoto(); });
        $('p-save').addEventListener('click', savePiece);
        $('p-cancel').addEventListener('click', () => { resetForm(false); say('add-msg', 'Nothing was changed.'); });
        ['p-owner', 'p-name', 'p-w', 'p-wt', 'p-wm', 'p-wr', 'p-s', 'p-st', 'p-sm', 'p-sr', 'p-place', 'p-paid', 'p-note', 'p-purx'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); savePiece(); } }));
        // rates
        $('r-unit').addEventListener('change', rateLabels);
        $('rk-open').addEventListener('click', () => { $('rk-box').hidden = false; $('rk-open').hidden = true; $('r-k22').focus(); });
        $('rs-open').addEventListener('click', () => { $('rs-box').hidden = false; $('rs-open').hidden = true; $('r-silver').focus(); });
        $('r-save').addEventListener('click', saveRates);
        ['r-gold', 'r-k22', 'r-k21', 'r-k18', 'r-silver'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveRates(); } }));
        // sharing
        $('g-copy').addEventListener('click', () => copyText(C.allText(state, today), 'glance-msg'));
        $('g-print').addEventListener('click', () => window.print());
        // settings
        $('cur').addEventListener('change', e => { change(() => { state.cur = C.CURS.includes(e.target.value) ? e.target.value : ''; }, 'tools-msg', 'Money is now shown as ' + C.fmtMoney(35000000, e.target.value, state.group) + '.'); });
        $('group').addEventListener('change', e => { change(() => { state.group = e.target.value === 'lakh' ? 'lakh' : 'west'; }, 'tools-msg', () => 'Big numbers are now shown as ' + C.fmtMoney(123456700, '', state.group) + '.'); preview(); });
        $('wunit').addEventListener('change', e => { change(() => { state.wunit = e.target.value === 'g' ? 'g' : 'tola'; }, 'tools-msg', () => state.wunit === 'g' ? 'Weights now show grams first.' : 'Weights now show tola first.'); });
        $('backup').addEventListener('click', backup);
        const pick = () => $('restore-file').click();
        $('restore').addEventListener('click', pick); $('restore-first').addEventListener('click', pick);
        $('restore-file').addEventListener('change', e => { restore(e.target.files[0]); e.target.value = ''; });
        $('csv').addEventListener('click', () => {
            if (!state.pieces.length) { say('tools-msg', 'Add some jewellery first.'); return; }
            download('gold-and-jewellery-' + today + '.csv', 'text/csv;charset=utf-8', '﻿' + C.csv(state));
            say('tools-msg', 'Saved the spreadsheet file (CSV). It opens in Excel or Google Sheets.');
        });
        $('del-all').addEventListener('click', () => {
            if (!state.pieces.length && !C.hasRate(state.rates)) { say('tools-msg', 'There is nothing to delete.'); return; }
            if (editing) resetForm(false);
            change(() => { state.pieces = []; state.people = []; state.rates = C.emptyRates(); state.prev = null; }, 'tools-msg', 'Deleted everything.');
            fillRates();
        });
        // the date changes at midnight: redraw "3 days ago" and the rate's age
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.today(new Date()) !== today) { today = C.today(new Date()); $('p-got').max = today; render(); } });
        resetForm(false);
        render();
        loadThumbs(); tidyPhotos();
    }
    start();
})();
