// Document Scanner to PDF: the page. The maths is in core.js.
(function () {
    'use strict';
    const C = window.ScanCore;
    const SLUG = 'document-scanner-to-pdf';
    const K_SET = SLUG + '.settings', K_NAME = SLUG + '.name';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const store = {
        get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
        del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
    };
    const say = (box, text, undo, bad) => {
        box.textContent = text; box.classList.toggle('bad', !!bad);
        if (undo) { const b = el('button', null, 'Undo'); b.type = 'button'; b.addEventListener('click', () => { box.textContent = ''; undo(); }); box.appendChild(b); }
    };
    const announce = t => { $('announce').textContent = ''; setTimeout(() => { $('announce').textContent = t; }, 30); };
    const tick = () => new Promise(r => setTimeout(r, 0));
    const LOOK_NAME = { color: 'Clean colour', bw: 'Black and white', grey: 'Grey', photo: 'Photo as is' };
    const ROT_NAME = { 90: 'turned right', 180: 'upside down', 270: 'turned left' };

    // ---- saved pages (IndexedDB, so a reload or the phone closing the tab does not lose them)
    const db = {
        h: null, ok: false,
        open() {
            return new Promise(res => {
                try {
                    const r = indexedDB.open(SLUG, 1);
                    r.onupgradeneeded = () => { r.result.createObjectStore('pages', { keyPath: 'id' }); };
                    r.onsuccess = () => { this.h = r.result; this.ok = true; res(true); };
                    r.onerror = () => res(false);
                    r.onblocked = () => res(false);
                } catch (e) { res(false); }
            });
        },
        tx(mode, fn) {
            if (!this.ok) return Promise.resolve(null);
            return new Promise(res => {
                try {
                    const t = this.h.transaction('pages', mode), s = t.objectStore('pages'), out = fn(s);
                    t.oncomplete = () => res(out && 'result' in out ? out.result : true);
                    t.onerror = t.onabort = () => res(null);
                } catch (e) { res(null); }
            });
        },
        all() { return this.tx('readonly', s => s.getAll()); },
        put(rec) { return this.tx('readwrite', s => s.put(rec)); },
        del(id) { return this.tx('readwrite', s => s.delete(id)); },
        clear() { return this.tx('readwrite', s => s.clear()); }
    };

    // ---- state
    let pages = [];                 // { id, w, h, corners, found, auto, rot, look, blob, thumb }
    let settings = C.cleanSettings(store.get(K_SET));
    let editing = null;             // the page open in "Fix page"
    let result = null, objectUrl = '';
    let busy = false;
    const meta = p => ({ id: p.id, w: p.w, h: p.h, corners: p.corners, found: p.found || null, auto: p.auto, rot: p.rot, look: p.look, order: pages.indexOf(p), blob: p.blob });
    const savePage = p => db.put(meta(p));
    const saveOrder = () => Promise.all(pages.map(savePage));
    const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    // ---- pictures
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
    const toBlob = (c, type, q) => new Promise(res => c.toBlob(b => res(b), type, q));
    function decode(blob) {
        return new Promise((res, rej) => {
            const url = URL.createObjectURL(blob), img = new Image();
            img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => { URL.revokeObjectURL(url); res(img); }); };
            img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
            img.src = url;
        });
    }
    // the photo of a page as pixels, decoded once and kept for the page being worked on
    const pixelCache = new Map();
    async function pixels(p) {
        if (pixelCache.has(p.id)) return pixelCache.get(p.id);
        const img = await decode(p.blob), c = canvas(p.w, p.h), x = c.getContext('2d');
        x.drawImage(img, 0, 0, c.width, c.height);
        const data = { img, canvas: c, id: x.getImageData(0, 0, c.width, c.height) };
        pixelCache.set(p.id, data);
        while (pixelCache.size > 3) pixelCache.delete(pixelCache.keys().next().value);   // keep memory low with many pages
        return data;
    }
    // the finished page as a canvas, at most `long` pixels on its long side (scale 1 = full size)
    async function render(p, scale, long) {
        const px = await pixels(p), full = C.outSize(p.corners, 0);
        let s = scale || 1; if (long) s = Math.min(s, long / Math.max(full.w, full.h));
        const W = Math.max(1, Math.round(full.w * s)), H = Math.max(1, Math.round(full.h * s));
        let img = C.warp(px.id, p.corners, W, H);
        C.applyLook(img, p.look);
        img = C.rotate(img, p.rot);
        const c = canvas(img.width, img.height);
        c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
        return c;
    }
    function find(img) {
        const s = Math.min(1, 256 / Math.max(img.width, img.height)), c = canvas(img.width * s, img.height * s), x = c.getContext('2d');
        x.drawImage(img, 0, 0, c.width, c.height);
        const q = C.detectPage(x.getImageData(0, 0, c.width, c.height));
        if (!q) return null;
        return C.inset(C.scaleCorners(q, img.width / c.width), 0.006).map(p => [Math.min(img.width, Math.max(0, p[0])), Math.min(img.height, Math.max(0, p[1]))]);
    }
    async function thumb(p) {
        const c = await render(p, 1, 240), b = await toBlob(c, 'image/jpeg', 0.8);
        if (p.thumb) URL.revokeObjectURL(p.thumb);
        p.thumb = b ? URL.createObjectURL(b) : '';
    }

    // ---- adding photos
    async function addFile(file) {
        const kind = C.kindOf(file.name, file.type, file.size), name = file.name || 'pasted picture';
        if (kind === 'pdf') return { err: '“' + name + '” is already a PDF. Choose photos of the pages instead.' };
        if (kind === 'other') return { err: '“' + name + '” is not a photo. Choose JPG, PNG or HEIC photos.' };
        if (kind === 'empty') return { err: '“' + name + '” is empty (0 bytes). Choose it again.' };
        if (kind === 'big') return { err: '“' + name + '” is bigger than 60 MB, too big to open here.' };
        let img;
        try { img = await decode(file); } catch (e) {
            return { err: kind === 'heic' ? '“' + name + '” is an iPhone HEIC photo, which this browser cannot open. Open this page in Safari, or choose a JPG or a screenshot.'
                : '“' + name + '” could not be opened. It may be damaged. Try another photo.' };
        }
        if (!img.naturalWidth || !img.naturalHeight) return { err: '“' + name + '” could not be opened. Try another photo.' };
        return addImage(img);
    }
    async function addImage(img, look) {
        const s = Math.min(1, C.STORE_LONG / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
        const c = canvas((img.naturalWidth || img.width) * s, (img.naturalHeight || img.height) * s);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        const blob = await toBlob(c, 'image/jpeg', 0.92);
        if (!blob) return { err: 'This photo could not be read. Try another one.' };
        const found = find(c);
        const p = { id: newId(), w: c.width, h: c.height, corners: found || C.wholePhoto(c.width, c.height), found, auto: !!found, rot: 0, look: look || settings.look, blob };
        pages.push(p);
        await thumb(p);
        savePage(p);
        return { page: p };
    }
    async function addFiles(list) {
        const files = [...list];
        if (!files.length || busy) return;
        const msg = $('add-msg'), room = C.MAX_PAGES - pages.length;
        if (room <= 0) return say(msg, 'This PDF already has ' + C.MAX_PAGES + ' pages, the most it can have. Make this PDF, then Start over for the next one.', null, true);
        busy = true; closeEditor(true);
        const errs = [], added = [];
        for (let i = 0; i < files.length; i++) {
            if (added.length >= room) { errs.push((files.length - i) + ' more not added: ' + C.MAX_PAGES + ' pages is the most in one PDF.'); break; }
            say(msg, files.length > 1 ? 'Adding photo ' + (i + 1) + ' of ' + files.length + '…' : 'Adding the photo…');
            await tick();
            const r = await addFile(files[i]);
            if (r.err) errs.push(r.err); else added.push(r.page);
        }
        busy = false;
        changed();
        const missed = added.filter(p => !p.auto).length;
        let text = added.length === 1 ? 'Page ' + (pages.indexOf(added[0]) + 1) + ' added.' : added.length ? added.length + ' pages added.' : '';
        if (added.length === 1) text += added[0].auto ? ' Check the corners, then tap Done.' : ' The edges of the page were not found, so drag the circles onto its corners.';
        else if (missed) text += ' On ' + missed + ' of them the edges were not found: tap Edit to set the corners.';
        else if (added.length) text += ' Tap Edit on a page to check its corners.';
        say(msg, [text, ...errs].filter(Boolean).join(' '), null, !added.length && errs.length);
        if (added.length) announce(text);
        if (added.length === 1) openEditor(added[0]);
    }
    $('cam-btn').addEventListener('click', () => $('camera').click());
    $('files-btn').addEventListener('click', () => $('files').click());
    $('camera').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
    $('files').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
    const card = document.querySelector('.add-card');
    document.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); card.classList.add('over'); } });
    document.addEventListener('dragleave', e => { if (!e.relatedTarget) card.classList.remove('over'); });
    document.addEventListener('drop', e => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); card.classList.remove('over'); addFiles(e.dataTransfer.files); });
    document.addEventListener('paste', e => {
        const f = [...((e.clipboardData && e.clipboardData.files) || [])].filter(x => /^image\//.test(x.type));
        if (f.length && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) addFiles(f);
    });

    // ---- example pages: photos of paper on a wooden table, drawn here
    function examplePhoto(kind) {
        const W = 1500, H = 2000, c = canvas(W, H), x = c.getContext('2d');
        const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#6b4a2f'); g.addColorStop(1, '#3f2a1a');
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.globalAlpha = 0.12; x.strokeStyle = '#2a1a0e'; x.lineWidth = 6;
        for (let i = 0; i < 40; i++) { x.beginPath(); x.moveTo(0, i * 55 + 10); x.bezierCurveTo(W / 3, i * 55 + 40, W * 2 / 3, i * 55 - 20, W, i * 55 + 15); x.stroke(); }
        x.globalAlpha = 1;
        const card = kind === 'id';
        const pw = card ? 1100 : 1180, ph = card ? 700 : 1650;
        x.save(); x.translate(W / 2 + (card ? 10 : -15), H / 2 + (card ? -60 : 20)); x.rotate(card ? 0.06 : kind === 2 ? 0.05 : -0.035);
        x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 30; x.shadowOffsetY = 12;
        x.fillStyle = card ? '#e8eef7' : '#f3f0e8'; x.fillRect(-pw / 2, -ph / 2, pw, ph);
        x.shadowColor = 'transparent';
        const sh = x.createLinearGradient(-pw / 2, 0, pw / 2, 0); sh.addColorStop(0, 'rgba(0,0,0,.18)'); sh.addColorStop(0.6, 'rgba(0,0,0,0)');
        x.fillStyle = sh; x.fillRect(-pw / 2, -ph / 2, pw, ph);
        x.translate(-pw / 2, -ph / 2); x.fillStyle = '#222'; x.textBaseline = 'top';
        if (card) {
            x.fillStyle = '#c7dbf5'; x.fillRect(0, 0, pw, 110); x.fillStyle = '#1e3a8a'; x.font = 'bold 54px sans-serif'; x.fillText('RESIDENT IDENTITY CARD', 50, 28);
            x.fillStyle = '#9ca3af'; x.fillRect(60, 170, 300, 380); x.fillStyle = '#6b7280'; x.beginPath(); x.arc(210, 300, 80, 0, 7); x.fill(); x.fillRect(110, 400, 200, 150);
            x.fillStyle = '#111'; x.font = '40px sans-serif';
            [['Name', 'AYESHA KHAN'], ['Date of birth', '14 MAR 1994'], ['Card number', '35202-1234567-8'], ['Expires', '02 JUN 2031']].forEach((r, i) => {
                x.fillStyle = '#4b5563'; x.font = '30px sans-serif'; x.fillText(r[0], 420, 175 + i * 98); x.fillStyle = '#111'; x.font = 'bold 42px sans-serif'; x.fillText(r[1], 420, 210 + i * 98);
            });
        } else {
            const title = kind === 1 ? 'TENANCY AGREEMENT' : 'TENANCY AGREEMENT (continued)';
            x.font = 'bold 58px serif'; x.fillText(title, 90, 100);
            x.font = '34px serif';
            const words = 'The tenant agrees to pay the rent on the first day of each month and to keep the property clean and in good repair. The landlord will carry out repairs to the structure, heating and water within a reasonable time after being told about them. Either party may end this agreement with two months notice in writing.'.split(' ');
            let y = 220;
            for (let para = 0; para < (kind === 1 ? 6 : 4); para++) {
                let line = '', n = 0;
                for (let k = 0; k < 42; k++) {
                    const w = words[(k + para * 7) % words.length], t = line ? line + ' ' + w : w;
                    if (x.measureText(t).width > pw - 180) { x.fillText(line, 90, y); y += 48; line = w; n++; } else line = t;
                }
                if (line) { x.fillText(line, 90, y); y += 48; }
                y += 34;
            }
            if (kind === 2) {
                x.font = '34px serif'; x.fillText('Signed by the tenant:', 90, y + 40);
                x.strokeStyle = '#1d4ed8'; x.lineWidth = 5; x.beginPath(); x.moveTo(110, y + 160); x.bezierCurveTo(180, y + 60, 220, y + 200, 290, y + 120); x.bezierCurveTo(340, y + 70, 360, y + 170, 470, y + 110); x.stroke();
                x.fillStyle = '#b91c1c'; x.globalAlpha = 0.8; x.lineWidth = 6; x.strokeStyle = '#b91c1c'; x.beginPath(); x.arc(pw - 260, y + 120, 95, 0, 7); x.stroke();
                x.font = 'bold 30px sans-serif'; x.fillText('RECEIVED', pw - 335, y + 104); x.globalAlpha = 1;
            }
            x.fillStyle = '#555'; x.font = '28px serif'; x.fillText('Page ' + kind + ' of 2', pw / 2 - 60, ph - 90);
        }
        x.restore();
        return c;
    }
    $('demo').addEventListener('click', async () => {
        if (busy) return;
        if (pages.length + 3 > C.MAX_PAGES) return say($('add-msg'), 'There is no room for 3 more pages.', null, true);
        busy = true; closeEditor(true); say($('add-msg'), 'Adding 3 example pages…'); await tick();
        await addImage(examplePhoto(1)); await addImage(examplePhoto(2)); await addImage(examplePhoto('id'), 'photo');
        if (!$('name').value) $('name').value = 'Lease and ID';
        saveName();
        busy = false; changed();
        say($('add-msg'), '3 example pages added: a 2-page lease and an ID card, each photographed on a table. The app found the pages and cut away the table. Tap Edit on a page to see how.');
    });

    // ---- the list of pages
    function renderList() {
        const ol = $('pages');
        ol.textContent = '';
        $('pages-card').hidden = !pages.length;
        $('pages-n').textContent = pages.length ? '(' + pages.length + ')' : '';
        pages.forEach((p, i) => {
            const li = el('li', 'page' + (editing === p ? ' editing' : '')), th = el('div', 'thumb'), im = el('img');
            im.alt = 'Page ' + (i + 1); if (p.thumb) im.src = p.thumb; th.appendChild(im);
            const info = el('div', 'p-info');
            info.appendChild(el('p', 'p-title', 'Page ' + (i + 1)));
            info.appendChild(el('p', 'p-sub', [LOOK_NAME[p.look], ROT_NAME[p.rot], p.auto ? '' : 'whole photo, set the corners'].filter(Boolean).join(', ')));
            const b = el('div', 'p-btns');
            const btn = (text, label, fn, cls, dis) => { const x = el('button', cls || '', text); x.type = 'button'; x.setAttribute('aria-label', label); x.disabled = !!dis; x.addEventListener('click', fn); b.appendChild(x); return x; };
            btn('Edit', 'Edit page ' + (i + 1) + ': corners, look and turn', () => openEditor(p), 'p-edit');
            btn('Delete', 'Delete page ' + (i + 1), () => removePage(p, li));
            btn('↑ Up', 'Move page ' + (i + 1) + ' up', () => move(p, -1), 'p-up', i === 0);
            btn('↓ Down', 'Move page ' + (i + 1) + ' down', () => move(p, 1), 'p-down', i === pages.length - 1);
            info.appendChild(b);
            li.append(th, info);
            ol.appendChild(li);
        });
    }
    function move(p, d) {
        const i = pages.indexOf(p), j = i + d;
        if (j < 0 || j >= pages.length) return;
        pages.splice(i, 1); pages.splice(j, 0, p);
        saveOrder(); changed();
        const btn = $('pages').children[j].querySelector(d < 0 ? '.p-up' : '.p-down');
        (btn && !btn.disabled ? btn : $('pages').children[j].querySelector('.p-edit')).focus();
        announce('Page moved to number ' + (j + 1) + '.');
    }
    function removePage(p, li) {
        const i = pages.indexOf(p);
        if (editing === p) closeEditor(true);
        pages.splice(i, 1); db.del(p.id); pixelCache.delete(p.id);
        changed();
        const msg = $('pages-msg');
        say(msg, 'Page ' + (i + 1) + ' deleted.', () => { pages.splice(Math.min(i, pages.length), 0, p); saveOrder(); changed(); announce('Page ' + (i + 1) + ' is back.'); });
        if (!pages.length) say($('add-msg'), 'Page deleted. Undo brings it back.', () => { pages.splice(0, 0, p); saveOrder(); changed(); $('add-msg').textContent = ''; });
        const u = (pages.length ? msg : $('add-msg')).querySelector('button'); if (u) u.focus();
    }
    $('restart').addEventListener('click', () => {
        const old = pages.slice(), oldName = $('name').value;
        closeEditor(true);
        pages = []; db.clear(); pixelCache.clear(); $('name').value = ''; saveName();
        changed();
        say($('add-msg'), 'All ' + old.length + ' page' + (old.length === 1 ? '' : 's') + ' removed. Ready for a new document.', () => {
            pages = old.concat(pages); saveOrder(); $('name').value = oldName; saveName(); changed(); $('add-msg').textContent = '';
        });
        $('add-msg').querySelector('button').focus();
    });

    // ---- "Fix page": corners, look, turn
    const stage = $('stage'), photoC = $('ed-photo'), handles = [...document.querySelectorAll('.handle')], loupe = $('loupe');
    let view = { s: 1 }, drag = null, prevTimer = 0;
    async function openEditor(p) {
        editing = p;
        $('editor').hidden = false;
        $('ed-h').textContent = 'Fix page ' + (pages.indexOf(p) + 1);
        $('ed-msg').textContent = '';
        document.querySelectorAll('input[name=look]').forEach(r => { r.checked = r.value === p.look; });
        $('ed-find').disabled = !p.found;
        $('ed-find').title = p.found ? '' : 'The edges of the page were not found in this photo';
        renderList();
        const px = await pixels(p);
        if (editing !== p) return;
        layoutStage(px);
        drawPreview(0);
        $('editor').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        handles[0].focus({ preventScroll: true });
    }
    function layoutStage(px) {
        const p = editing; if (!p) return;
        const wrap = stage.parentElement, maxW = Math.max(120, wrap.clientWidth - 24), maxH = Math.max(220, Math.min(window.innerHeight * 0.62, 640));
        const s = Math.min(maxW / p.w, maxH / p.h), W = Math.round(p.w * s), H = Math.round(p.h * s), dpr = Math.min(2, window.devicePixelRatio || 1);
        photoC.width = Math.round(W * dpr); photoC.height = Math.round(H * dpr); photoC.style.width = W + 'px'; photoC.style.height = H + 'px';
        photoC.getContext('2d').drawImage(px.canvas, 0, 0, photoC.width, photoC.height);
        stage.style.width = W + 'px'; stage.style.height = H + 'px';
        $('ed-svg').setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        view = { s, W, H };
        drawQuad();
    }
    function drawQuad() {
        const p = editing; if (!p) return;
        const q = p.corners.map(c => [c[0] * view.s, c[1] * view.s]);
        $('ed-quad').setAttribute('points', q.map(c => c.join(',')).join(' '));
        $('ed-shade').setAttribute('d', 'M0 0H' + view.W + 'V' + view.H + 'H0Z M' + q.map(c => c.join(' ')).join(' L') + 'Z');
        handles.forEach((h, i) => { h.style.left = q[i][0] + 'px'; h.style.top = q[i][1] + 'px'; });
    }
    function setCorner(i, x, y) {
        const p = editing, q = p.corners.map(c => c.slice());
        q[i] = [Math.min(p.w, Math.max(0, x)), Math.min(p.h, Math.max(0, y))];
        if (!C.isConvex(q) || C.quadArea(q) < 400) return false;   // corners may not cross over
        p.corners = q; p.auto = true; drawQuad(); return true;
    }
    function edited() { if (!editing) return; savePage(editing); drawPreview(140); changed(true); }
    function drawPreview(delay) {
        clearTimeout(prevTimer);
        prevTimer = setTimeout(async () => {
            const p = editing; if (!p) return;
            const c = await render(p, 1, 700); if (editing !== p) return;
            const pc = $('ed-prev'); pc.width = c.width; pc.height = c.height; pc.getContext('2d').drawImage(c, 0, 0);
            const s = Math.min(1, 420 / c.height); pc.style.width = Math.round(c.width * s) + 'px'; pc.style.maxWidth = '100%';
            await thumb(p); renderList();
        }, delay);
    }
    function nearest(x, y) {
        let best = -1, d = Infinity;
        editing.corners.forEach((c, i) => { const dd = Math.hypot(c[0] * view.s - x, c[1] * view.s - y); if (dd < d) { d = dd; best = i; } });
        return d < 70 ? best : -1;
    }
    function showLoupe(i) {
        const px = pixelCache.get(editing.id); if (!px) return;
        const c = editing.corners[i], x = loupe.getContext('2d'), S = loupe.width, half = 20 / view.s;   // about 3 times bigger than on screen
        // keep the zoom out from under the finger: top left, or top right when the corner is there
        loupe.classList.toggle('right', c[0] * view.s < 150 && c[1] * view.s < 150);
        x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
        x.drawImage(px.canvas, c[0] - half, c[1] - half, half * 2, half * 2, 0, 0, S, S);
        x.strokeStyle = '#a3e635'; x.lineWidth = 3; x.beginPath(); x.moveTo(S / 2, S / 2 - 26); x.lineTo(S / 2, S / 2 + 26); x.moveTo(S / 2 - 26, S / 2); x.lineTo(S / 2 + 26, S / 2); x.stroke();
        loupe.hidden = false;
    }
    stage.addEventListener('pointerdown', e => {
        if (!editing || e.button > 0) return;
        const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        const hi = e.target.classList && e.target.classList.contains('handle') ? +e.target.dataset.i : nearest(x, y);
        if (hi < 0) return;
        e.preventDefault();
        const c = editing.corners[hi];
        drag = { i: hi, id: e.pointerId, dx: c[0] * view.s - x, dy: c[1] * view.s - y };
        try { stage.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
        handles[hi].focus({ preventScroll: true });
        showLoupe(hi);
    });
    stage.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        const r = stage.getBoundingClientRect();
        setCorner(drag.i, (e.clientX - r.left + drag.dx) / view.s, (e.clientY - r.top + drag.dy) / view.s);
        showLoupe(drag.i);
    });
    const endDrag = e => { if (!drag || (e && e.pointerId !== drag.id)) return; drag = null; loupe.hidden = true; edited(); };
    stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag); stage.addEventListener('lostpointercapture', endDrag);
    handles.forEach((h, i) => h.addEventListener('keydown', e => {
        const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!k || !editing) return;
        e.preventDefault();
        const step = Math.max(1, Math.max(editing.w, editing.h) * (e.shiftKey ? 0.05 : 0.01)), c = editing.corners[i];
        if (setCorner(i, c[0] + k[0] * step, c[1] + k[1] * step)) edited();
    }));
    $('ed-find').addEventListener('click', () => { if (!editing || !editing.found) return; editing.corners = editing.found.map(c => c.slice()); editing.auto = true; drawQuad(); edited(); say($('ed-msg'), 'The corners are back where the page was found.'); });
    $('ed-whole').addEventListener('click', () => { if (!editing) return; editing.corners = C.wholePhoto(editing.w, editing.h); editing.auto = true; drawQuad(); edited(); say($('ed-msg'), 'The whole photo is used.'); });
    document.querySelectorAll('input[name=look]').forEach(r => r.addEventListener('change', () => { if (!editing || !r.checked) return; editing.look = r.value; edited(); }));
    $('ed-all').addEventListener('click', () => {
        if (!editing) return;
        const look = editing.look, old = pages.map(p => p.look), oldDefault = settings.look;
        pages.forEach(p => { p.look = look; }); settings.look = look; store.set(K_SET, settings);
        saveOrder(); changed(true); Promise.all(pages.map(thumb)).then(renderList);
        say($('ed-msg'), 'All ' + pages.length + ' pages are now ' + LOOK_NAME[look] + ', and new pages will be too.', () => {
            pages.forEach((p, i) => { p.look = old[i]; }); settings.look = oldDefault; store.set(K_SET, settings);
            if (editing) document.querySelectorAll('input[name=look]').forEach(x => { x.checked = x.value === editing.look; });
            saveOrder(); changed(true); Promise.all(pages.map(thumb)).then(renderList); drawPreview(0);
        });
    });
    $('ed-left').addEventListener('click', () => { if (!editing) return; editing.rot = (editing.rot + 270) % 360; edited(); announce('Page turned left.'); });
    $('ed-right').addEventListener('click', () => { if (!editing) return; editing.rot = (editing.rot + 90) % 360; edited(); announce('Page turned right.'); });
    function closeEditor(quiet) {
        const p = editing;
        editing = null; $('editor').hidden = true; loupe.hidden = true; drag = null;
        if (!quiet && p) {
            renderList();
            const li = $('pages').children[pages.indexOf(p)];
            if (li) { li.scrollIntoView({ block: 'nearest' }); li.querySelector('.p-edit').focus({ preventScroll: true }); }
        }
    }
    $('ed-done').addEventListener('click', () => closeEditor());
    window.addEventListener('resize', () => { if (editing && pixelCache.get(editing.id)) layoutStage(pixelCache.get(editing.id)); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && editing && !document.querySelector('dialog[open]')) closeEditor(); });

    // ---- the PDF
    function saveName() { if ($('name').value.trim()) store.set(K_NAME, $('name').value.slice(0, 80)); else store.del(K_NAME); }
    function limitBytes() {
        if ($('limit').value !== 'custom') return { bytes: +$('limit').value || 0 };
        return C.parseLimit($('custom').value);
    }
    function changed(keepList) {
        if (!keepList) renderList();
        $('ready').textContent = pages.length ? pages.length + ' page' + (pages.length === 1 ? '' : 's') + ' will go in the PDF, in the order shown.' : 'Add at least one page first.';
        $('make').disabled = !pages.length || busy;
        $('add-lead').hidden = pages.length > 0;
        $('demo').hidden = pages.length > 0;
        clearResult();
    }
    function clearResult() {
        if (!result) return;
        result = null; $('result').hidden = true;
        if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
        $('make').textContent = 'Make the PDF';
        $('make-msg').textContent = 'Something changed. Tap Make the PDF again for an up-to-date file.';
    }
    $('name').addEventListener('input', () => { saveName(); if (result) { const n = C.fileName($('name').value); $('download').download = n; result.name = n; $('res-label').textContent = n; } });
    $('paper').addEventListener('change', () => { settings.paper = $('paper').value; store.set(K_SET, settings); clearResult(); });
    $('limit').addEventListener('change', () => {
        const custom = $('limit').value === 'custom';
        $('custom-box').hidden = !custom;
        if (custom) $('custom').focus(); else { settings.limit = +$('limit').value || 0; store.set(K_SET, settings); }
        $('custom-err').textContent = '';
        clearResult();
    });
    $('custom').addEventListener('input', () => {
        const r = C.parseLimit($('custom').value);
        $('custom-err').textContent = '';
        if (!r.err && r.bytes) { settings.limit = r.bytes; store.set(K_SET, settings); }
        clearResult();
    });
    const LIMIT_ERR = { nan: 'Type the size as a number of MB, for example 3 or 1.5.', small: 'The smallest limit is 0.1 MB (100 KB).', big: 'The largest limit is 500 MB.' };

    async function encodeAll(scale, q, progress) {
        const out = [];
        for (let i = 0; i < pages.length; i++) {
            progress(i);
            await tick();
            const c = await render(pages[i], scale), b = await toBlob(c, 'image/jpeg', q);
            if (!b) throw new Error('encode');
            out.push({ jpeg: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height });
        }
        return out;
    }
    $('make').addEventListener('click', async () => {
        if (busy) return;
        if (!pages.length) return say($('make-msg'), 'Add at least one page first.', null, true);
        const lim = limitBytes();
        if (lim.err || ($('limit').value === 'custom' && !lim.bytes)) {
            $('custom-err').textContent = lim.err ? LIMIT_ERR[lim.err] : 'Type the size limit in MB, or pick one from the list.';
            $('custom').focus(); return;
        }
        busy = true; $('make').disabled = true; clearResult(); $('make-msg').classList.remove('bad');
        const n = pages.length, paper = $('paper').value, name = C.fileName($('name').value);
        let best = null, step = 0, tries = 0;
        try {
            while (step < C.FIT_STEPS.length) {
                const [scale, q] = C.FIT_STEPS[step];
                tries++;
                const enc = await encodeAll(scale, q, i => { $('make-msg').textContent = (tries > 1 ? 'Making it smaller to fit: page ' : 'Making page ') + (i + 1) + ' of ' + n + '…'; });
                const bytes = C.buildPdf(enc, paper, name.replace(/\.pdf$/, ''));
                best = { bytes, scale, q, step };
                if (!lim.bytes || bytes.length <= lim.bytes) break;
                // far over the limit: skip the steps that cannot be enough
                const ratio = bytes.length / lim.bytes;
                step += ratio > 3 ? 3 : ratio > 1.7 ? 2 : 1;
                if (step >= C.FIT_STEPS.length && best.step < C.FIT_STEPS.length - 1) step = C.FIT_STEPS.length - 1;
            }
        } catch (e) {
            busy = false; changed(true);
            return say($('make-msg'), 'The PDF could not be made: this device ran out of memory. Try fewer pages, then make a second PDF for the rest.', null, true);
        }
        busy = false; $('make').disabled = false; $('make-msg').textContent = '';
        showResult(best, lim.bytes, name, n);
    });
    function showResult(r, limit, name, n) {
        const blob = new Blob([r.bytes], { type: 'application/pdf' }), over = limit && blob.size > limit;
        result = { blob, name };
        objectUrl = URL.createObjectURL(blob);
        $('result').hidden = false; $('result').classList.toggle('over', !!over);
        $('res-label').textContent = name;
        $('res-size').textContent = C.fmtSize(blob.size);
        $('res-verdict').textContent = n + ' page' + (n === 1 ? '' : 's') + (limit ? (over ? ', still over your ' + C.limitText(limit) + ' limit' : ', under your ' + C.limitText(limit) + ' limit') : '') + '.';
        const lines = [];
        if (r.step > 0 && !over) lines.push('Made smaller to fit: pictures at ' + Math.round(r.scale * 100) + '% size and ' + Math.round(r.q * 100) + '% quality. Text should still be easy to read; check it before you send it.');
        if (over) lines.push('This is as small as it can get and stay readable. Delete a page, pick Black and white for text pages, or make two PDFs.');
        lines.push(blob.size.toLocaleString('en-US') + ' bytes. Paper: ' + $('paper').selectedOptions[0].textContent + '.');
        $('res-detail').textContent = lines.join('\n');
        const a = $('download'); a.href = objectUrl; a.download = name;
        let file = null; try { file = new File([blob], name, { type: 'application/pdf' }); } catch (e) { /* old browsers */ }
        $('share').hidden = !(file && navigator.canShare && navigator.canShare({ files: [file] }));
        $('make').textContent = 'Make the PDF again';
        $('res-msg').textContent = '';
        announce('PDF ready: ' + $('res-size').textContent + ', ' + $('res-verdict').textContent);
        $('result').scrollIntoView({ block: 'nearest' });
        $('download').focus({ preventScroll: true });
    }
    $('share').addEventListener('click', async () => {
        if (!result) return;
        try { await navigator.share({ files: [new File([result.blob], result.name, { type: 'application/pdf' })], title: result.name }); }
        catch (e) { if (e && e.name !== 'AbortError') say($('res-msg'), 'Sharing did not work here. Use Download PDF instead.', null, true); }
    });

    // ---- start: settings, then the saved pages
    $('paper').value = settings.paper || C.defaultPaper(navigator.language);
    if (settings.limit) {
        const opt = [...$('limit').options].find(o => +o.value === settings.limit);
        if (opt) $('limit').value = opt.value; else { $('limit').value = 'custom'; $('custom-box').hidden = false; $('custom').value = String(Math.round(settings.limit / 10000) / 100); }
    }
    const savedName = store.get(K_NAME);
    if (typeof savedName === 'string') $('name').value = savedName.slice(0, 80);
    $('name').placeholder = 'scan-' + C.today();
    changed();
    db.open().then(async ok => {
        if (!ok) { $('privacy').textContent = 'This browser is not letting the app save pages, so keep this page open until you have downloaded your PDF. Nothing is uploaded.'; return; }
        const recs = (await db.all()) || [];
        const good = [];
        for (const r of recs) {
            const c = C.cleanPage(r);
            if (!c || !(r.blob instanceof Blob) || !r.blob.size) { if (r && typeof r.id === 'string') db.del(r.id); continue; }
            c.blob = r.blob; c.found = C.validCorners(r.found, c.w, c.h) ? r.found : null;
            good.push(c);
        }
        if (!good.length || pages.length) return;
        good.sort((a, b) => a.order - b.order);
        for (const p of good) { try { await thumb(p); } catch (e) { continue; } pages.push(p); }
        changed();
        if (pages.length) say($('add-msg'), 'Your ' + pages.length + ' page' + (pages.length === 1 ? ' is' : 's are') + ' still here from last time. Start over removes them.');
    });
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
