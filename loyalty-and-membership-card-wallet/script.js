// Loyalty and Membership Card Wallet: page code. The barcode and card logic is in core.js.
(function () {
    'use strict';
    const C = window.WalletCore;
    const SLUG = 'loyalty-and-membership-card-wallet';
    const KEY = SLUG + '.cards', SORT_KEY = SLUG + '.sort', DRAFT_KEY = SLUG + '.draft', BROKEN_KEY = SLUG + '.unreadable';
    const $ = id => document.getElementById(id);
    const SVGNS = 'http://www.w3.org/2000/svg';
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

    // ---------- storage ----------
    let canStore = true;
    function get(k) { try { return localStorage.getItem(k); } catch (e) { canStore = false; return null; } }
    function put(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { canStore = false; $('storage-warn').hidden = false; return false; } }
    function drop(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
    try { localStorage.setItem(SLUG + '.test', '1'); localStorage.removeItem(SLUG + '.test'); } catch (e) { canStore = false; }
    if (!canStore) $('storage-warn').hidden = false;

    let cards = [], sort = 'used', query = '', editingId = null, undoSnap = null, toastTimer = null;
    let loadNote = '';
    (function load() {
        const raw = get(KEY);
        if (raw) {
            try {
                const data = JSON.parse(raw);
                cards = C.sanitizeList(data && Array.isArray(data.cards) ? data.cards : data);
                if (!cards.length && !(data && Array.isArray(data.cards) && data.cards.length === 0)) throw new Error('nothing usable');
            } catch (e) { put(BROKEN_KEY, raw); cards = []; loadNote = 'Your saved cards could not be read, so the wallet started empty. A copy was kept on this device.'; }
        }
        const s = get(SORT_KEY);
        if (['used', 'az', 'new'].includes(s)) sort = s;
    })();
    const save = () => put(KEY, JSON.stringify({ version: 1, cards }));

    // ---------- toast with undo ----------
    function toast(text, undoable) {
        $('toast-text').textContent = text;
        $('toast-undo').hidden = !undoable;
        $('toast').hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { $('toast').hidden = true; undoSnap = null; }, undoable ? 9000 : 5000);
    }
    function withUndo(text, fn) { const snap = JSON.stringify(cards); fn(); undoSnap = snap; save(); render(); toast(text, true); }
    $('toast-undo').addEventListener('click', () => {
        if (!undoSnap) return;
        cards = C.sanitizeList(JSON.parse(undoSnap)); undoSnap = null;
        if (editingId && !cards.some(c => c.id === editingId)) resetForm();
        save(); render(); toast('Undone.');
    });

    // ---------- drawing a barcode ----------
    function svg(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
    function draw(host, value, format, label) {
        host.textContent = '';
        host.className = host.className.replace(/\s*(is-qr|is-bars|is-none)/g, '');
        const enc = C.encode(value, format);
        if (enc.type === 'bars') {
            const q = enc.quiet, w = enc.bits.length + 2 * q;
            const s = svg('svg', { viewBox: '0 0 ' + w + ' 60', preserveAspectRatio: 'none', 'shape-rendering': 'crispEdges', role: 'img', 'aria-label': label });
            s.appendChild(svg('rect', { x: 0, y: 0, width: w, height: 60, fill: '#fff' }));
            let d = '';
            for (let i = 0; i < enc.bits.length;) {
                if (enc.bits[i] !== '1') { i++; continue; }
                let j = i; while (enc.bits[j] === '1') j++;
                d += 'M' + (i + q) + ' 0h' + (j - i) + 'v60h-' + (j - i) + 'z';
                i = j;
            }
            s.appendChild(svg('path', { d, fill: '#000' }));
            host.appendChild(s); host.classList.add('is-bars');
        } else if (enc.type === 'qr') {
            const q = 4, w = enc.size + 2 * q;
            const s = svg('svg', { viewBox: '0 0 ' + w + ' ' + w, 'shape-rendering': 'crispEdges', role: 'img', 'aria-label': label });
            s.appendChild(svg('rect', { x: 0, y: 0, width: w, height: w, fill: '#fff' }));
            let d = '';
            enc.modules.forEach((row, y) => row.forEach((on, x) => { if (on) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z'; }));
            s.appendChild(svg('path', { d, fill: '#000' }));
            host.appendChild(s); host.classList.add('is-qr');
        } else {
            host.appendChild(el('p', 'nocode', enc.type === 'none' ? 'No barcode on this card. Show the number below.' : enc.error));
            host.classList.add('is-none');
        }
    }

    // ---------- the list ----------
    const today = () => C.isoDay(new Date());
    function render() {
        const has = cards.length > 0;
        $('empty').hidden = has;
        $('tools').hidden = cards.length < 2;
        $('find-box').hidden = cards.length < 4;
        if (cards.length < 4 && query) { query = ''; $('find').value = ''; }
        $('sort').value = sort;
        const shown = C.list(cards, sort, query);
        const ul = $('list'); ul.textContent = '';
        $('no-match').hidden = !(has && query && !shown.length);
        if (has && query && !shown.length) $('no-match').textContent = 'No card matches "' + query + '".';
        const t = today();
        shown.forEach(c => {
            const li = el('li', 'cbox' + (c.id === editingId ? ' editing' : ''));
            li.dataset.id = c.id;
            li.style.setProperty('--c', C.colorHex(c.color));
            const top = el('div', 'ctop');
            top.appendChild(el('p', 'cname', c.name));
            if (c.owner) top.appendChild(el('p', 'cowner', c.owner));
            li.appendChild(top);
            const body = el('div', 'cbody');
            body.appendChild(el('p', 'cnum', C.display(c.number, c.format)));
            const meta = el('p', 'cmeta', c.format === 'none' ? 'Number only' : C.FORMATS[c.format]);
            const ex = C.expiry(c.expires, t);
            if (ex) { meta.appendChild(document.createTextNode(' · ')); meta.appendChild(el('span', 'exp ' + ex.level, ex.text)); }
            body.appendChild(meta);
            if (c.note) body.appendChild(el('p', 'cnote', c.note));
            const acts = el('div', 'cacts');
            const show = el('button', 'primary show-btn', c.format === 'none' ? 'Show number' : 'Show barcode');
            show.type = 'button'; show.setAttribute('aria-label', (c.format === 'none' ? 'Show number for ' : 'Show barcode for ') + c.name + (c.owner ? ', ' + c.owner : ''));
            show.addEventListener('click', () => openShow(c.id, show));
            const edit = el('button', 'small', 'Edit');
            edit.type = 'button'; edit.setAttribute('aria-label', 'Edit ' + c.name + (c.owner ? ', ' + c.owner : ''));
            edit.addEventListener('click', () => startEdit(c.id));
            acts.appendChild(show); acts.appendChild(edit);
            body.appendChild(acts);
            li.appendChild(body);
            ul.appendChild(li);
        });
        $('count').textContent = has ? cards.length + (cards.length === 1 ? ' card' : ' cards') + ' saved on this device only.' : 'Cards are saved on this device only.';
    }
    $('find').addEventListener('input', () => { query = $('find').value; render(); });
    $('sort').addEventListener('change', () => { sort = $('sort').value; put(SORT_KEY, sort); render(); });
    $('empty-add').addEventListener('click', e => { e.preventDefault(); $('form-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('name').focus({ preventScroll: true }); });

    // ---------- the barcode screen ----------
    let opener = null, wake = null;
    async function keepAwake() {
        try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; }
    }
    function openShow(id, from) {
        const c = cards.find(k => k.id === id); if (!c) return;
        c.uses += 1; c.lastUsed = Date.now(); save();
        opener = from || null;
        $('show').dataset.id = id;
        $('show-top').style.setProperty('--c', C.colorHex(c.color));
        $('show-name').textContent = c.name;
        $('show-owner').textContent = c.owner; $('show-owner').hidden = !c.owner;
        draw($('show-code'), c.number, c.format, (c.format === 'none' ? 'Card number ' : 'Barcode for ') + c.number);
        $('show-num').textContent = C.display(c.number, c.format);
        $('show-num').classList.toggle('long', c.number.length > 20);
        $('show-fmt').textContent = c.format === 'none' ? 'Read this number to the cashier' : C.FORMATS[c.format];
        const ex = C.expiry(c.expires, today());
        $('show-exp').hidden = !ex; if (ex) { $('show-exp').textContent = ex.text; $('show-exp').className = 'show-exp ' + ex.level; }
        $('show-note').hidden = !c.note; $('show-note').textContent = c.note;
        $('show').hidden = false;
        document.body.classList.add('noscroll');
        $('show-close').focus();
        keepAwake();
    }
    function closeShow() {
        if ($('show').hidden) return;
        $('show').hidden = true;
        document.body.classList.remove('noscroll');
        if (wake) { wake.release().catch(() => {}); wake = null; }
        const id = $('show').dataset.id;
        render();
        const again = document.querySelector('.cbox[data-id="' + CSS.escape(id) + '"] .show-btn');
        const target = again || (opener && document.contains(opener) ? opener : null);
        if (target) target.focus();
    }
    $('show-close').addEventListener('click', closeShow);
    $('show').addEventListener('click', e => { if (e.target === $('show')) closeShow(); });
    document.addEventListener('keydown', e => {
        if ($('show').hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); closeShow(); }
        if (e.key === 'Tab') {
            const f = [$('show-copy'), $('show-close')];
            const i = f.indexOf(document.activeElement);
            if (e.shiftKey && i <= 0) { e.preventDefault(); f[1].focus(); }
            else if (!e.shiftKey && (i === 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
        }
    });
    document.addEventListener('visibilitychange', () => { if (!$('show').hidden && document.visibilityState === 'visible') keepAwake(); });
    async function copy(text) {
        try { await navigator.clipboard.writeText(text); return true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (er) { ok = false; } t.remove(); return ok;
        }
    }
    $('show-copy').addEventListener('click', async () => {
        const c = cards.find(k => k.id === $('show').dataset.id); if (!c) return;
        toast(await copy(c.number) ? 'Number copied: ' + c.number : 'Could not copy. The number is ' + c.number);
    });

    // ---------- the form ----------
    Object.keys(C.FORMATS).forEach(f => {
        const label = { auto: 'Work it out for me (recommended)', ean13: 'EAN-13 (13 digits, most shops)', ean8: 'EAN-8 (8 digits)', upca: 'UPC-A (12 digits, US and Canada)',
            code128: 'Code 128 (letters and numbers)', code39: 'Code 39 (capital letters and numbers)', qr: 'QR code (square)', none: 'No barcode, number only' }[f];
        const o = el('option', null, label); o.value = f; $('format').appendChild(o);
    });
    let color = 'pink';
    C.COLORS.forEach(k => {
        const lab = el('label', 'sw');
        const r = el('input'); r.type = 'radio'; r.name = 'color'; r.value = k.id; r.className = 'visually-hidden'; r.setAttribute('aria-label', k.name);
        r.addEventListener('change', () => { color = k.id; saveDraft(); });
        const dot = el('span', 'dot'); dot.style.background = k.hex;
        lab.title = k.name; lab.appendChild(r); lab.appendChild(dot);
        $('swatches').appendChild(lab);
    });
    function setColor(id) { color = C.COLORS.some(k => k.id === id) ? id : 'pink'; document.querySelectorAll('#swatches input').forEach(r => { r.checked = r.value === color; }); }
    function nextColor() { const used = cards.map(c => c.color); return (C.COLORS.find(k => !used.includes(k.id)) || C.COLORS[cards.length % C.COLORS.length]).id; }

    function setMore(open) { $('more').hidden = !open; $('more-btn').setAttribute('aria-expanded', String(open)); $('more-btn').textContent = open ? '− Hide whose card, notes and expiry date' : '+ Add whose card, notes or expiry date (optional)'; }
    $('more-btn').addEventListener('click', () => setMore($('more').hidden));

    function updatePreview() {
        const raw = $('number').value, fmt = $('format').value;
        $('number-err').textContent = ''; $('number').removeAttribute('aria-invalid');
        const v = C.validate(raw, fmt);
        if (!raw.trim()) {
            $('preview-code').textContent = ''; $('preview-code').appendChild(el('p', 'nocode', 'Type the card number to see the barcode.'));
            $('preview-code').className = 'code-wrap is-none';
            $('preview-num').textContent = ''; $('format-note').textContent = ''; $('dup').hidden = true; return v;
        }
        if (!v.ok) {
            $('preview-code').textContent = ''; $('preview-code').appendChild(el('p', 'nocode err', v.error));
            $('preview-code').className = 'code-wrap is-none';
            $('preview-num').textContent = ''; $('format-note').textContent = ''; $('dup').hidden = true; return v;
        }
        draw($('preview-code'), v.value, v.format, 'Barcode preview for ' + v.value);
        $('preview-num').textContent = C.display(v.value, v.format);
        $('format-note').textContent = v.warn || (v.auto ? 'Shown as ' + C.FORMATS[v.format] + '.' : '');
        $('format-note').classList.toggle('warn-text', !!v.warn);
        const d = C.findDuplicate(cards, v.value, v.format, editingId);
        $('dup').hidden = !d;
        if (d) $('dup').textContent = 'You already have this card: ' + d.name + (d.owner ? ' (' + d.owner + ')' : '') + '. Saving adds it again.';
        return v;
    }
    ['number', 'format'].forEach(id => $(id).addEventListener('input', () => { updatePreview(); saveDraft(); }));
    $('format').addEventListener('change', () => { updatePreview(); saveDraft(); });
    ['name', 'owner', 'note', 'expires'].forEach(id => $(id).addEventListener('input', () => { $(id + '-err') && ($(id + '-err').textContent = ''); $(id).removeAttribute('aria-invalid'); saveDraft(); }));

    function formValues() { return { name: $('name').value, number: $('number').value, format: $('format').value, color, owner: $('owner').value, note: $('note').value, expires: $('expires').value }; }
    function saveDraft() {
        if (editingId) return;
        const f = formValues();
        if (f.name.trim() || f.number.trim() || f.owner.trim() || f.note.trim() || f.expires) put(DRAFT_KEY, JSON.stringify(f)); else drop(DRAFT_KEY);
    }
    function fill(f) {
        $('name').value = typeof f.name === 'string' ? f.name.slice(0, C.MAX_NAME) : '';
        $('number').value = typeof f.number === 'string' ? f.number.slice(0, 100) : '';
        $('format').value = C.FORMATS[f.format] ? f.format : 'auto';
        $('owner').value = typeof f.owner === 'string' ? f.owner.slice(0, C.MAX_OWNER) : '';
        $('note').value = typeof f.note === 'string' ? f.note.slice(0, C.MAX_NOTE) : '';
        $('expires').value = C.validDate(f.expires) ? f.expires : '';
        setColor(f.color);
        setMore(!!($('owner').value || $('note').value || $('expires').value));
        ['name-err', 'number-err', 'expires-err'].forEach(id => { $(id).textContent = ''; });
        ['name', 'number', 'expires'].forEach(id => $(id).removeAttribute('aria-invalid'));
        $('scan-msg').textContent = '';
        updatePreview();
    }
    function resetForm() {
        editingId = null;
        $('form-title').textContent = 'Add a card'; $('save').textContent = 'Save card'; $('edit-actions').hidden = true;
        fill({ format: 'auto', color: nextColor() });
    }
    function startEdit(id) {
        const c = cards.find(k => k.id === id); if (!c) return;
        editingId = id;
        $('form-title').textContent = 'Edit card'; $('save').textContent = 'Save changes'; $('edit-actions').hidden = false;
        fill(c);
        render();
        $('form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('name').focus({ preventScroll: true });
    }
    $('cancel').addEventListener('click', () => { const id = editingId; resetForm(); render(); restoreDraft(); focusCard(id); });
    $('delete').addEventListener('click', () => {
        const c = cards.find(k => k.id === editingId); if (!c) return;
        withUndo('Deleted ' + c.name + '.', () => { cards = cards.filter(k => k.id !== c.id); resetForm(); });
        restoreDraft();
    });
    function focusCard(id) { const b = id && document.querySelector('.cbox[data-id="' + CSS.escape(id) + '"] .show-btn'); if (b) { b.scrollIntoView({ block: 'center' }); b.focus({ preventScroll: true }); } }

    $('form').addEventListener('submit', e => {
        e.preventDefault();
        const f = formValues();
        const name = f.name.replace(/\s+/g, ' ').trim();
        const v = updatePreview();
        let bad = null;
        if (!name) { $('name-err').textContent = 'Type the shop or card name.'; $('name').setAttribute('aria-invalid', 'true'); bad = bad || $('name'); }
        if (!v.ok) { $('number-err').textContent = v.error; $('number').setAttribute('aria-invalid', 'true'); bad = bad || $('number'); }
        if ($('expires').validity && $('expires').validity.badInput || (f.expires && !C.validDate(f.expires))) { setMore(true); $('expires-err').textContent = 'Pick a real date, or leave it empty.'; $('expires').setAttribute('aria-invalid', 'true'); bad = bad || $('expires'); }
        if (bad) { bad.focus(); return; }
        const data = C.sanitize({ name, number: v.value, format: v.format, color: f.color, owner: f.owner, note: f.note, expires: f.expires });
        if (editingId) {
            const id = editingId;
            withUndo('Changes saved to ' + name + '.', () => {
                cards = cards.map(c => c.id === id ? Object.assign({}, c, data, { id, uses: c.uses, lastUsed: c.lastUsed, created: c.created }) : c);
                resetForm();
            });
            restoreDraft(); focusCard(id);
        } else {
            data.created = Date.now();
            withUndo('Card added: ' + name + '.', () => { cards.push(data); resetForm(); });
            drop(DRAFT_KEY);
            focusCard(data.id);
        }
    });
    function restoreDraft() {
        const raw = get(DRAFT_KEY); if (!raw) return;
        try { const d = JSON.parse(raw); if (d && typeof d === 'object') fill(Object.assign({ format: 'auto', color: nextColor() }, d)); } catch (e) { drop(DRAFT_KEY); }
    }

    // reading a barcode from a photo, where the browser can (Chrome on Android, for example)
    const MAP = { ean_13: 'ean13', ean_8: 'ean8', upc_a: 'upca', code_128: 'code128', code_39: 'code39', qr_code: 'qr' };
    if ('BarcodeDetector' in window) $('scan-box').hidden = false;
    $('photo').addEventListener('change', async () => {
        const file = $('photo').files && $('photo').files[0]; $('photo').value = '';
        if (!file) return;
        $('scan-msg').textContent = 'Reading the photo…';
        try {
            const img = await createImageBitmap(file);
            const found = await new window.BarcodeDetector().detect(img);
            if (!found || !found.length) { $('scan-msg').textContent = 'No barcode found in that photo. Try again closer and in good light, or type the number.'; return; }
            const r = found[0], fmt = MAP[r.format] || 'auto';
            $('number').value = String(r.rawValue || '').slice(0, 100);
            $('format').value = fmt;
            const v = updatePreview();
            if (!v.ok && fmt !== 'auto') { $('format').value = 'auto'; updatePreview(); }
            saveDraft();
            $('scan-msg').textContent = 'Read ' + C.clean(r.rawValue) + (MAP[r.format] ? ' (' + C.FORMATS[fmt] + ')' : '') + '. Check it matches the number on your card.';
        } catch (e) { $('scan-msg').textContent = 'This photo could not be read. Type the number instead.'; }
    });

    // ---------- backup ----------
    $('export').addEventListener('click', () => {
        if (!cards.length) { toast('No cards to back up yet.'); return; }
        const blob = new Blob([C.backup(cards, Date.now())], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'loyalty-cards-backup-' + today() + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast('Backup saved: ' + cards.length + (cards.length === 1 ? ' card.' : ' cards.'));
    });
    $('import').addEventListener('change', async () => {
        const file = $('import').files && $('import').files[0]; $('import').value = '';
        if (!file) return;
        if (file.size > 2e6) { toast('This file is too big to be a card wallet backup.'); return; }
        let text = ''; try { text = await file.text(); } catch (e) { toast('The file could not be opened.'); return; }
        const r = C.merge(cards, text);
        if (r.error) { toast(r.error); return; }
        const extra = (r.skipped ? ' ' + r.skipped + (r.skipped === 1 ? ' was' : ' were') + ' already here.' : '') + (r.bad ? ' ' + r.bad + ' could not be read.' : '');
        if (!r.added) { toast('No new cards in this backup.' + extra); return; }
        withUndo('Added ' + r.added + (r.added === 1 ? ' card.' : ' cards.') + extra, () => { cards = r.cards; });
    });
    $('copy-all').addEventListener('click', async () => {
        if (!cards.length) { toast('No cards to copy yet.'); return; }
        toast(await copy(C.textList(C.list(cards, 'az', ''))) ? 'Copied ' + cards.length + (cards.length === 1 ? ' card number.' : ' card numbers.') : 'Could not copy on this browser.');
    });
    $('clear').addEventListener('click', () => {
        if (!cards.length) { toast('The wallet is already empty.'); return; }
        const n = cards.length;
        withUndo('Deleted all ' + n + (n === 1 ? ' card.' : ' cards.'), () => { cards = []; if (editingId) resetForm(); });
    });

    // ---------- start ----------
    resetForm();
    restoreDraft();
    render();
    if (loadNote) { $('storage-warn').textContent = loadNote; $('storage-warn').hidden = false; }
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
