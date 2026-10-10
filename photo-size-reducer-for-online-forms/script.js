// Page code for Photo Size Reducer for Online Forms. The sizing rules and the search live in core.js (PhotoCore).
(function () {
    const C = window.PhotoCore, KEY = 'photo-size-reducer-for-online-forms.rules';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const PX_PRESETS = [['', 'Keep the photo’s shape'], ['600x600', '600 × 600 (square)'], ['413x531', '413 × 531 (passport 35 × 45 mm)'],
        ['1200x1200', '1200 × 1200 (square)'], ['other', 'Other size']];

    let photos = [], removed = null, queue = Promise.resolve(), nextId = 1;
    let lastRules = loadRules();

    function loadRules() {
        try { const raw = localStorage.getItem(KEY); return C.cleanRules(raw ? JSON.parse(raw) : null); } catch (e) { return C.cleanRules(null); }
    }
    function saveRules(r) {
        lastRules = C.cleanRules(r);
        try { localStorage.setItem(KEY, JSON.stringify(lastRules)); } catch (e) { /* storage blocked: rules are used for this visit only */ }
    }

    function say(box, text, undo) {
        box.textContent = text;
        if (undo) {
            const b = el('button', null, 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { box.textContent = ''; undo(); });
            box.appendChild(b);
        }
    }
    const announce = t => { $('announce').textContent = t; };

    // ---- reading files
    function addFiles(list) {
        const files = [...list];
        if (!files.length) return;
        const notes = [];
        let room = C.MAX_PHOTOS - photos.length;
        files.forEach(f => {
            const kind = C.kindOf(f.name, f.type, f.size), name = f.name || 'pasted-image.png';
            if (kind === 'pdf') return notes.push('“' + name + '” is a PDF, not a photo. Choose a JPG, PNG, WebP or HEIC photo.');
            if (kind === 'other') return notes.push('“' + name + '” is not a photo. Choose a JPG, PNG, WebP or HEIC photo.');
            if (kind === 'empty') return notes.push('“' + name + '” is empty (0 bytes). Choose the photo again.');
            if (kind === 'big') return notes.push('“' + name + '” is bigger than 100 MB, too big to open here.');
            if (room <= 0) return notes.push('Only ' + C.MAX_PHOTOS + ' photos fit at a time. Remove some to add “' + name + '”.');
            room--;
            const p = { id: nextId++, file: f, name, rot: 0, rules: JSON.parse(JSON.stringify(lastRules)), token: 0 };
            photos.push(p);
            p.card = buildCard(p);
            $('photos').appendChild(p.card.li);
            setWorking(p);
            open(p, kind === 'heic');
        });
        $('pick-msg').textContent = notes.join(' ');
        $('file').value = '';
        $('list-msg').textContent = '';
        refresh();
        const first = photos[photos.length - 1];
        if (first && window.matchMedia('(max-width: 899px)').matches) first.card.li.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Decodes the photo (turned the right way up by the browser) to learn its size, then makes it smaller.
    function decode(file) {
        return new Promise((res, rej) => {
            const url = URL.createObjectURL(file), img = new Image();
            img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => res({ img, url })); };
            img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
            img.src = url;
        });
    }
    async function open(p, heic) {
        try {
            const d = await decode(p.file);
            p.srcW = d.img.naturalWidth; p.srcH = d.img.naturalHeight;
            URL.revokeObjectURL(d.url);
            if (!p.srcW || !p.srcH) throw new Error('decode');
            schedule(p, 0);
        } catch (e) {
            p.broken = true;
            showError(p, heic
                ? 'This browser cannot open HEIC photos (the iPhone format). Open this page in Safari, or save the photo as JPG first.'
                : 'This file could not be opened as a photo. It may be damaged, or a format this browser cannot read. Try saving it as JPG first.');
        }
    }

    // ---- making it smaller, one photo at a time so phones do not run out of memory
    function schedule(p, delay) {
        const token = ++p.token;
        clearTimeout(p.timer);
        setWorking(p);
        p.timer = setTimeout(() => { queue = queue.then(() => run(p, token)).catch(() => {}); }, delay == null ? 350 : delay);
    }

    async function run(p, token) {
        if (p.token !== token || !photos.includes(p)) return;
        const rules = p.rules, file = p.file;
        if (C.canKeep(file, rules, p.rot)) return finish(p, token, { blob: file, w: turnedW(p), h: turnedH(p), kept: true });
        let d;
        try { d = await decode(file); } catch (e) { return showError(p, 'This file could not be opened as a photo.'); }
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        let drawn = '';
        const draw = (w, h) => {
            if (drawn === w + 'x' + h) return;
            canvas.width = w; canvas.height = h;
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);       // see-through parts become white
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            const t = C.turned(p.srcW, p.srcH, p.rot), pl = C.placement(t.w, t.h, w, h, rules.px ? rules.fit : 'crop');
            ctx.save();
            ctx.translate(pl.dx + pl.dw / 2, pl.dy + pl.dh / 2);
            ctx.rotate(p.rot * Math.PI / 180);
            const iw = p.rot % 180 ? pl.dh : pl.dw, ih = p.rot % 180 ? pl.dw : pl.dh;
            ctx.drawImage(d.img, -iw / 2, -ih / 2, iw, ih);
            ctx.restore();
            drawn = w + 'x' + h;
        };
        const encode = (long, q) => {
            if (p.token !== token) return Promise.reject(new Error('stale'));
            const s = C.outSize(p.srcW, p.srcH, p.rot, rules.px, long);
            draw(s.w, s.h);
            return new Promise((res, rej) => canvas.toBlob(b => b ? res({ blob: b, size: b.size, w: s.w, h: s.h }) : rej(new Error('encode')), 'image/jpeg', Math.min(1, q)));
        };
        let r;
        try {
            const start = rules.px ? Math.max(rules.px.w, rules.px.h) : C.startLong(p.srcW, p.srcH);
            r = await C.shrink(encode, { long: start, maxBytes: C.maxBytes(rules.maxKB), minBytes: rules.minKB ? C.minBytes(rules.minKB) : 0, fixed: !!rules.px });
        } catch (e) {
            URL.revokeObjectURL(d.url);
            if (e.message === 'stale') return;
            return showError(p, 'This photo could not be made smaller in this browser. Try a different browser.');
        }
        URL.revokeObjectURL(d.url);
        canvas.width = canvas.height = 1;                             // frees the memory straight away
        if (p.token !== token) return;
        if (!r.ok) return finish(p, token, { fail: true, smallest: r.smallest ? r.smallest.size : 0 });
        let blob = r.res.blob, padded = false;
        if (r.pad && rules.minKB) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            blob = new Blob([C.padJpeg(bytes, C.padTarget(rules.minKB, rules.maxKB))], { type: 'image/jpeg' });
            padded = true;
        }
        finish(p, token, { blob, w: r.res.w, h: r.res.h, padded });
    }
    const dims = (w, h) => w + '\u00a0×\u00a0' + h + '\u00a0px';   // kept on one line
    const turnedW = p => C.turned(p.srcW, p.srcH, p.rot).w, turnedH = p => C.turned(p.srcW, p.srcH, p.rot).h;

    // ---- one box per photo
    let uid = 0;
    function field(wrap, labelText, input, cls) {
        const id = 'f' + (++uid);
        const lab = el('label', cls || null, labelText); lab.htmlFor = id; input.id = id;
        wrap.append(lab); return lab;
    }
    function textInput(placeholder, mode) {
        const i = el('input'); i.type = 'text'; i.inputMode = mode || 'decimal'; i.autocomplete = 'off'; i.placeholder = placeholder; i.maxLength = 20;
        return i;
    }
    function selectOf(options) {
        const s = el('select');
        options.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; s.appendChild(o); });
        return s;
    }

    function buildCard(p) {
        const c = {}, li = el('li', 'photo'); c.li = li; li.dataset.id = p.id;
        const head = el('div', 'p-head');
        c.name = el('span', 'p-name', p.name);
        c.remove = el('button', 'p-remove', 'Remove'); c.remove.type = 'button';
        c.remove.setAttribute('aria-label', 'Remove ' + p.name);
        c.remove.addEventListener('click', () => removePhoto(p));
        head.append(c.name, c.remove);

        // the size rules for this photo
        const rules = el('div', 'p-rules');
        c.max = selectOf(C.PRESETS.map(kb => [String(kb), C.limitLabel(kb)]).concat([['other', 'Other size']]));
        c.max.dataset.f = 'max';
        field(rules, 'Must be under', c.max, 'first');
        rules.append(c.max);
        c.otherBox = el('div', 'other-box');
        c.other = textInput('e.g. 150'); c.other.dataset.f = 'other';
        c.unit = selectOf([['KB', 'KB'], ['MB', 'MB']]); c.unit.dataset.f = 'unit'; c.unit.setAttribute('aria-label', 'Unit');
        field(c.otherBox, 'Size limit', c.other);
        const ob = el('div', 'inline'); ob.append(c.other, c.unit); c.otherBox.append(ob);
        rules.append(c.otherBox);

        c.moreBtn = el('button', 'link small', '+ More size rules (optional)'); c.moreBtn.type = 'button';
        c.more = el('div', 'more');
        c.min = textInput('none'); c.min.dataset.f = 'min';
        field(c.more, 'At least (optional)', c.min);
        const mb = el('div', 'money'); mb.append(c.min, el('span', 'suffix', 'KB')); c.more.append(mb);
        c.px = selectOf(PX_PRESETS); c.px.dataset.f = 'px';
        field(c.more, 'Exact width and height (optional)', c.px);
        c.more.append(c.px);
        c.pxBox = el('div', 'px-box');
        c.w = textInput('Width', 'numeric'); c.w.dataset.f = 'w';
        c.h = textInput('Height', 'numeric'); c.h.dataset.f = 'h';
        const two = el('div', 'two');
        const wW = el('div'), wH = el('div');
        field(wW, 'Width (pixels)', c.w); wW.append(c.w);
        field(wH, 'Height (pixels)', c.h); wH.append(c.h);
        two.append(wW, wH); c.pxBox.append(two);
        c.more.append(c.pxBox);
        c.fitBox = el('div');
        c.fit = selectOf([['crop', 'Crop the edges to fill it'], ['pad', 'Add white bars, keep the whole photo']]); c.fit.dataset.f = 'fit';
        field(c.fitBox, 'If the shape is different', c.fit);
        c.fitBox.append(c.fit);
        c.more.append(c.fitBox);
        c.err = el('p', 'err'); c.err.setAttribute('role', 'alert');
        rules.append(c.moreBtn, c.more, c.err);

        // the result
        const body = el('div', 'p-body');
        c.thumb = el('div', 'p-thumb');
        c.img = el('img'); c.img.alt = 'The smaller ' + p.name; c.img.hidden = true;
        c.thumb.append(c.img);
        const info = el('div', 'p-info');
        c.size = el('p', 'p-size', '…');
        c.verdict = el('p', 'p-verdict');
        c.detail = el('p', 'p-detail');
        info.append(c.size, c.verdict, c.detail);
        body.append(c.thumb, info);

        const btns = el('div', 'p-btns');
        c.dl = el('a', 'primary', 'Download'); c.dl.setAttribute('role', 'button');
        c.share = el('button', 'secondary', 'Share or save'); c.share.type = 'button'; c.share.hidden = true;
        c.rotate = el('button', 'secondary', 'Rotate'); c.rotate.type = 'button';
        c.rotate.setAttribute('aria-label', 'Rotate ' + p.name + ' a quarter turn');
        btns.append(c.dl, c.share, c.rotate);

        li.append(head, rules, body, btns);
        fillRules(c, p.rules);

        // events
        c.moreBtn.addEventListener('click', () => { c.more.hidden = false; c.moreBtn.hidden = true; c.min.focus(); });
        c.max.addEventListener('change', () => { syncBoxes(c); if (c.max.value === 'other') c.other.focus(); rulesChanged(p); });
        c.px.addEventListener('change', () => { syncBoxes(c); if (c.px.value === 'other') c.w.focus(); rulesChanged(p); });
        [c.other, c.min, c.w, c.h].forEach(i => i.addEventListener('input', () => rulesChanged(p)));
        [c.unit, c.fit].forEach(s => s.addEventListener('change', () => rulesChanged(p)));
        c.rotate.addEventListener('click', () => { if (p.broken || !p.srcW) return; p.rot = (p.rot + 90) % 360; rulesChanged(p); });
        c.share.addEventListener('click', () => sharePhoto(p));
        return c;
    }

    function fillRules(c, r) {
        const preset = C.PRESETS.includes(r.maxKB);
        c.max.value = preset ? String(r.maxKB) : 'other';
        if (!preset) {
            const mb = r.maxKB >= 1000 && Math.round(r.maxKB) % 100 === 0;
            c.other.value = String(mb ? r.maxKB / 1000 : r.maxKB); c.unit.value = mb ? 'MB' : 'KB';
        }
        c.min.value = r.minKB ? String(r.minKB) : '';
        const key = r.px ? r.px.w + 'x' + r.px.h : '';
        c.px.value = PX_PRESETS.some(o => o[0] === key) ? key : 'other';
        c.w.value = r.px ? String(r.px.w) : ''; c.h.value = r.px ? String(r.px.h) : '';
        c.fit.value = r.fit === 'pad' ? 'pad' : 'crop';
        const extra = !!(r.minKB || r.px);
        c.more.hidden = !extra; c.moreBtn.hidden = extra;
        syncBoxes(c);
    }
    function syncBoxes(c) {
        c.otherBox.hidden = c.max.value !== 'other';
        c.pxBox.hidden = c.px.value !== 'other';
        c.fitBox.hidden = c.px.value === '';
        if (c.px.value !== 'other' && c.px.value) { const [w, h] = c.px.value.split('x'); c.w.value = w; c.h.value = h; }
        if (!c.px.value) { c.w.value = ''; c.h.value = ''; }
    }

    // Reads this photo's rules from its box. Returns { rules } or { err, field }.
    function readRules(c) {
        let maxKB;
        if (c.max.value === 'other') {
            const r = C.parseLimit(c.other.value, c.unit.value);
            if (r.err) return { field: c.other, err: r.err === 'blank' ? 'Type the size the form allows, for example 150.'
                : r.err === 'small' || r.err === 'zero' || r.err === 'negative' ? 'The size limit must be at least 2 KB.'
                : r.err === 'big' ? 'The size limit can be up to 50 MB.' : 'Type the size as a number, for example 150 or 1.5.' };
            maxKB = r.kb;
        } else maxKB = Number(c.max.value);
        const m = C.parseMin(c.min.value);
        if (m.err) return { field: c.min, err: m.err === 'negative' ? 'At least cannot be below 0.' : 'Type the smallest size in KB as a number, for example 20.' };
        if (!C.minFits(m.kb, maxKB)) return { field: c.min, err: 'At least must be a good bit smaller than the limit of ' + C.limitLabel(maxKB) + '. Leave it empty if the form has no minimum.' };
        let px = null;
        if (c.px.value) {
            const r = C.parsePixels(c.w.value, c.h.value);
            if (r.off || r.err === 'one') return { field: c.w.value.trim() ? c.h : c.w, err: 'Type both the width and the height in pixels.' };
            if (r.err) return { field: c.w, err: r.err === 'range' ? 'Width and height must be between 16 and 8000 pixels.' : 'Type the width and height as whole numbers, for example 600.' };
            px = { w: r.w, h: r.h };
        }
        return { rules: { maxKB, minKB: m.kb, px, fit: c.fit.value === 'pad' ? 'pad' : 'crop' } };
    }

    function rulesChanged(p) {
        const c = p.card, r = readRules(c);
        [c.other, c.min, c.w, c.h].forEach(i => i.removeAttribute('aria-invalid'));
        if (r.err) {
            c.err.textContent = r.err; r.field.setAttribute('aria-invalid', 'true');
            p.token++; clearTimeout(p.timer);
            clearResult(p);
            c.li.classList.remove('busy');
            c.size.textContent = '—'; c.verdict.className = 'p-verdict warn'; c.verdict.textContent = 'Fix the size rule above to see the new size.';
            c.detail.textContent = '';
            return;
        }
        c.err.textContent = '';
        p.rules = r.rules; saveRules(r.rules);
        if (!p.broken && p.srcW) schedule(p);
    }

    // ---- showing the result
    function clearResult(p) {
        const c = p.card;
        if (p.url) { URL.revokeObjectURL(p.url); p.url = null; }
        p.result = null;
        c.img.hidden = true; c.img.removeAttribute('src');
        c.dl.hidden = true; c.share.hidden = true;
        c.li.classList.remove('ok', 'bad');
    }
    function setWorking(p) {
        const c = p.card;
        c.li.classList.add('busy');
        c.verdict.className = 'p-verdict';
        c.verdict.textContent = 'Making it smaller…';
        c.dl.classList.add('wait');
    }
    function showError(p, text) {
        const c = p.card;
        clearResult(p);
        c.li.classList.remove('busy'); c.li.classList.add('bad');
        c.size.textContent = 'Can’t open';
        c.verdict.className = 'p-verdict bad'; c.verdict.textContent = text;
        c.detail.textContent = C.fmtSize(p.file.size) + ', ' + (p.file.type || 'unknown type') + '.';
        c.rotate.hidden = true;
        c.li.querySelector('.p-rules').hidden = true;
        announce(p.name + ': ' + text);
    }
    function finish(p, token, r) {
        if (p.token !== token || !photos.includes(p)) return;
        const c = p.card, rules = p.rules, lim = C.limitLabel(rules.maxKB);
        clearResult(p);
        c.li.classList.remove('busy');
        c.dl.classList.remove('wait');
        const was = 'Was ' + C.fmtSize(p.file.size) + ', ' + dims(p.srcW, p.srcH);
        if (r.fail) {
            c.li.classList.add('bad');
            c.size.textContent = 'Too small';
            c.verdict.className = 'p-verdict bad';
            c.verdict.textContent = 'This photo cannot be made under ' + lim + ' and still be recognisable' +
                (r.smallest ? ' (the smallest it gets is ' + C.fmtSize(r.smallest) + ')' : '') + '. Check the limit, or choose a bigger one.';
            c.detail.textContent = was + '.';
            announce(p.name + ': cannot be made under ' + lim + '.');
            return;
        }
        p.result = r;
        p.url = URL.createObjectURL(r.blob);
        c.img.src = p.url; c.img.hidden = false;
        c.size.textContent = C.fmtSize(r.blob.size);
        const range = rules.minKB ? 'Between ' + C.limitLabel(rules.minKB) + ' and ' + lim : 'Under ' + lim;
        c.verdict.className = 'p-verdict good';
        c.verdict.textContent = r.kept ? 'Already under ' + lim + ', so it is left exactly as it is. Ready to upload.' : range + '. Ready to upload.';
        const saved = p.file.size > r.blob.size ? ' ' + Math.round((1 - r.blob.size / p.file.size) * 100) + '% smaller.' : '';
        c.detail.textContent = r.kept ? dims(p.srcW, p.srcH) + ', JPG. Nothing was changed.'
            : was + '\nNow ' + dims(r.w, r.h) + ', JPG.' + saved + (r.padded ? ' Padded with empty space to reach ' + C.limitLabel(rules.minKB) + '; the picture is not changed.' : '');
        c.li.classList.add('ok');
        const name = r.kept ? p.name : C.outName(p.name, rules.maxKB);
        p.outName = name;
        c.dl.href = p.url; c.dl.download = name; c.dl.hidden = false;
        c.dl.setAttribute('aria-label', 'Download ' + name);
        try {
            const f = new File([r.blob], name, { type: 'image/jpeg' });
            c.share.hidden = !(navigator.canShare && navigator.canShare({ files: [f] }));
        } catch (e) { c.share.hidden = true; }
        announce(p.name + ': now ' + C.fmtSize(r.blob.size) + ', ' + range.toLowerCase() + '.');
    }

    async function sharePhoto(p) {
        if (!p.result) return;
        try { await navigator.share({ files: [new File([p.result.blob], p.outName, { type: 'image/jpeg' })], title: p.outName }); }
        catch (e) { if (e && e.name !== 'AbortError') say($('list-msg'), 'Sharing did not work here. Use Download instead.'); }
    }

    // ---- remove, undo, start over
    function removePhoto(p) {
        const i = photos.indexOf(p);
        if (i < 0) return;
        dropOld();
        p.token++; clearTimeout(p.timer);
        photos.splice(i, 1); p.card.li.remove();
        removed = { list: [{ p, i }] };
        say($('list-msg'), 'Removed “' + p.name + '”.', undo);
        refresh();
        if (photos.length) (photos[Math.min(i, photos.length - 1)].card.remove).focus(); else $('drop').focus();
    }
    function removeAll() {
        if (!photos.length) return;
        dropOld();
        removed = { list: photos.map((p, i) => ({ p, i })) };
        photos.forEach(p => { p.token++; clearTimeout(p.timer); p.card.li.remove(); });
        photos = [];
        say($('list-msg'), 'Removed all photos.', undo);
        $('pick-msg').textContent = '';
        refresh();
    }
    function undo() {
        if (!removed) return;
        removed.list.forEach(({ p, i }) => {
            photos.splice(Math.min(i, photos.length), 0, p);
            const after = photos[photos.indexOf(p) + 1];
            $('photos').insertBefore(p.card.li, after ? after.card.li : null);
            if (!p.result && !p.broken && p.srcW) schedule(p, 0);
        });
        removed = null;
        refresh();
    }
    // a removed photo that can no longer be brought back gives its memory back
    function dropOld() {
        if (!removed) return;
        removed.list.forEach(({ p }) => { if (p.url) URL.revokeObjectURL(p.url); p.url = null; });
        removed = null;
    }

    function refresh() {
        const n = photos.length;
        $('empty').hidden = n > 0;
        $('all-actions').hidden = n < 2;
        $('count').textContent = n ? '(' + n + ')' : '';
        $('results').classList.toggle('has', n > 0);
    }

    // ---- a sample photo, drawn here so it works offline: a lake at sunset with fine grain, about 2-3 MB like a phone photo
    function makeSample() {
        const W = 3000, H = 2000, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const g = cv.getContext('2d');
        let sky = g.createLinearGradient(0, 0, 0, H * 0.62);
        sky.addColorStop(0, '#3b2a6b'); sky.addColorStop(0.45, '#c2507a'); sky.addColorStop(0.8, '#f59e5b'); sky.addColorStop(1, '#fcd38d');
        g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.62);
        g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(W * 0.62, H * 0.5, 150, 0, Math.PI * 2); g.fill();
        const ridge = (base, amp, color, seed) => {
            g.fillStyle = color; g.beginPath(); g.moveTo(0, H * 0.62);
            for (let x = 0; x <= W; x += 20) g.lineTo(x, base - amp * (0.55 + 0.45 * Math.sin(x / 260 + seed) * Math.cos(x / 610 + seed * 2)));
            g.lineTo(W, H * 0.62); g.closePath(); g.fill();
        };
        ridge(H * 0.5, 380, '#6b3f74', 1); ridge(H * 0.58, 260, '#45305e', 4); ridge(H * 0.63, 150, '#2a2245', 7);
        let water = g.createLinearGradient(0, H * 0.62, 0, H);
        water.addColorStop(0, '#e58a6a'); water.addColorStop(0.3, '#8a4a78'); water.addColorStop(1, '#241c3c');
        g.fillStyle = water; g.fillRect(0, H * 0.62, W, H * 0.38);
        g.fillStyle = 'rgba(255,240,200,.55)';
        for (let i = 0; i < 40; i++) { const y = H * 0.64 + i * 16, w = 420 - i * 9; g.fillRect(W * 0.62 - w / 2 + Math.sin(i) * 30, y, w, 5); }
        const img = g.getImageData(0, 0, W, H), d = img.data;
        let s = 12345;
        for (let i = 0; i < d.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const n = (s % 41) - 20; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        g.putImageData(img, 0, 0);
        return new Promise(res => cv.toBlob(b => res(new File([b], 'sample-photo.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92));
    }

    // ---- wiring
    $('file').addEventListener('change', e => addFiles(e.target.files));
    $('sample').addEventListener('click', async () => {
        $('sample').disabled = true; $('pick-msg').textContent = 'Making a sample photo…';
        const f = await makeSample();
        $('pick-msg').textContent = '';
        addFiles([f]);
        $('sample').disabled = false;
    });
    $('clear').addEventListener('click', removeAll);
    const drop = $('drop');
    ['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } }));
    ['dragleave', 'dragend'].forEach(t => document.addEventListener(t, e => { if (!e.relatedTarget) drop.classList.remove('over'); }));
    document.addEventListener('drop', e => {
        if (!e.dataTransfer || !e.dataTransfer.files.length) return;
        e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files);
    });
    document.addEventListener('paste', e => {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        const files = e.clipboardData ? [...e.clipboardData.files].filter(f => /^image\//.test(f.type)) : [];
        if (files.length) { e.preventDefault(); addFiles(files); }
    });
    refresh();

    window.PhotoApp = { addFiles, photos: () => photos };                  // used by ui-test.js

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
