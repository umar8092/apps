// Page code for Signature Maker for Forms. The size rules, photo cleaning and size search live in core.js (SignCore).
(function () {
    const C = window.SignCore, SLUG = 'signature-maker-for-forms';
    const K_RULES = SLUG + '.rules', K_PEN = SLUG + '.pen', K_SIG = SLUG + '.signature';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
    const store = {
        get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
        del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
    };

    // ---- state
    let mode = 'draw';                 // which tab makes the signature
    let strokes = [];                  // signing on screen: lists of [x, y] as fractions of the pad width
    let photo = null;                  // { img, rot, clean, crop, work, saved } or null
    let pen = loadPen();
    let rules = C.cleanRules(store.get(K_RULES));
    let result = null, renderToken = 0, renderTimer = 0, objectUrl = '';

    function loadPen() {
        const p = store.get(K_PEN) || {};
        return { ink: p.ink === 'blue' ? 'blue' : 'black', thick: C.PEN[p.thick] ? p.thick : 'medium' };
    }
    const say = (box, text, undo, bad) => {
        box.textContent = text; box.classList.toggle('bad', !!bad);
        if (undo) { const b = el('button', null, 'Undo'); b.type = 'button'; b.addEventListener('click', () => { box.textContent = ''; undo(); }); box.appendChild(b); }
    };
    const announce = t => { $('announce').textContent = t; };

    // ---- tabs
    function setMode(m, focus) {
        mode = m;
        [['draw', 'tab-draw', 'panel-draw'], ['photo', 'tab-photo', 'panel-photo']].forEach(([k, t, p]) => {
            const on = k === m;
            $(t).setAttribute('aria-selected', on); $(t).tabIndex = on ? 0 : -1; $(p).hidden = !on;
        });
        if (focus) $('tab-' + m).focus();
        if (m === 'draw') sizePad();
        if (m === 'photo' && photo) drawView();
        schedule(0);
    }
    $('tab-draw').addEventListener('click', () => setMode('draw'));
    $('tab-photo').addEventListener('click', () => setMode('photo'));
    $('make').querySelector('.tabs').addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setMode(mode === 'draw' ? 'photo' : 'draw', true); }
    });

    // ---- signing on screen
    const pad = $('pad'), pctx = pad.getContext('2d');
    let padW = 1, dpr = 1, drawing = null;
    function sizePad() {
        const r = pad.getBoundingClientRect();
        if (!r.width) return;
        dpr = Math.min(3, window.devicePixelRatio || 1); padW = r.width;
        pad.width = Math.round(r.width * dpr); pad.height = Math.round(r.height * dpr);
        drawPad();
    }
    function traceStroke(ctx, s) {
        ctx.beginPath();
        if (s.length === 1) { ctx.arc(s[0][0], s[0][1], ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
        ctx.moveTo(s[0][0], s[0][1]);
        for (let i = 1; i < s.length - 1; i++) { const mx = (s[i][0] + s[i + 1][0]) / 2, my = (s[i][1] + s[i + 1][1]) / 2; ctx.quadraticCurveTo(s[i][0], s[i][1], mx, my); }
        const last = s[s.length - 1]; ctx.lineTo(last[0], last[1]);
        ctx.stroke();
    }
    function paintStrokes(ctx, list, lw, color) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.fillStyle = color;
        list.forEach(s => traceStroke(ctx, s));
    }
    function drawPad() {
        pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, pad.width, pad.height);
        pctx.setTransform(dpr * padW, 0, 0, dpr * padW, 0, 0);
        paintStrokes(pctx, strokes, C.PEN[pen.thick], C.INK[pen.ink]);
        $('pad-wrap').classList.toggle('signed', strokes.length > 0);
        $('undo-line').disabled = !strokes.length; $('clear-pad').disabled = !strokes.length;
    }
    const padPoint = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width]; };
    let raf = 0;
    const redrawSoon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawPad(); }); };
    pad.addEventListener('pointerdown', e => {
        if (e.button > 0) return;
        e.preventDefault();
        if (padW !== pad.getBoundingClientRect().width) sizePad();
        try { pad.setPointerCapture(e.pointerId); } catch (x) { /* not supported */ }
        drawing = { id: e.pointerId, s: [padPoint(e)] };
        strokes.push(drawing.s);
        $('pad-msg').textContent = '';
        redrawSoon();
    });
    pad.addEventListener('pointermove', e => {
        if (!drawing || e.pointerId !== drawing.id) return;
        const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        (list.length ? list : [e]).forEach(ev => {
            const p = padPoint(ev), last = drawing.s[drawing.s.length - 1];
            if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.0015) drawing.s.push(p);
        });
        redrawSoon();
    });
    const endStroke = e => {
        if (!drawing || (e && e.pointerId !== drawing.id)) return;
        drawing = null; redrawSoon(); schedule(150);
    };
    pad.addEventListener('pointerup', endStroke);
    pad.addEventListener('pointercancel', endStroke);
    pad.addEventListener('lostpointercapture', endStroke);
    if (window.ResizeObserver) new ResizeObserver(() => { if (mode === 'draw') sizePad(); }).observe(pad);
    else window.addEventListener('resize', () => mode === 'draw' && sizePad());

    $('undo-line').addEventListener('click', () => { strokes.pop(); drawPad(); schedule(0); });
    $('clear-pad').addEventListener('click', () => {
        const old = strokes; strokes = []; drawPad(); schedule(0);
        say($('pad-msg'), 'Signature cleared.', () => { strokes = old; drawPad(); schedule(0); });
    });
    document.querySelectorAll('input[name=thick]').forEach(r => r.addEventListener('change', () => { pen.thick = r.value; store.set(K_PEN, pen); drawPad(); schedule(0); }));
    document.querySelectorAll('input[name=ink]').forEach(r => r.addEventListener('change', () => { pen.ink = r.value; store.set(K_PEN, pen); drawPad(); if (photo) drawView(); schedule(0); }));

    // ---- a photo of a signature on paper
    const WORK_LONG = 1400;
    function decode(file) {
        return new Promise((res, rej) => {
            const url = URL.createObjectURL(file), img = new Image();
            img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => { URL.revokeObjectURL(url); res(img); }); };
            img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
            img.src = url;
        });
    }
    async function choosePhoto(file) {
        const msg = $('photo-msg');
        if (!file) return;
        const kind = C.kindOf(file.name, file.type, file.size), name = file.name || 'pasted picture';
        if (kind === 'pdf') return say(msg, '“' + name + '” is a PDF. Choose a photo (JPG, PNG or HEIC) of your signature.', null, true);
        if (kind === 'other') return say(msg, '“' + name + '” is not a photo. Choose a JPG, PNG or HEIC photo of your signature.', null, true);
        if (kind === 'empty') return say(msg, '“' + name + '” is empty (0 bytes). Choose the photo again.', null, true);
        if (kind === 'big') return say(msg, '“' + name + '” is bigger than 60 MB, too big to open here.', null, true);
        say(msg, 'Opening the photo…');
        let img;
        try { img = await decode(file); } catch (e) {
            return say(msg, kind === 'heic' ? 'This browser cannot open HEIC (iPhone) photos. Open this page in Safari, or take a screenshot of the photo and choose that.'
                : '“' + name + '” could not be opened. It may be damaged. Try another photo.', null, true);
        }
        if (!img.naturalWidth || !img.naturalHeight) return say(msg, '“' + name + '” could not be opened. Try another photo.', null, true);
        const old = photo;
        photo = { img, rot: 0, clean: 5, crop: null, work: null, saved: false };
        $('clean').value = 5;
        msg.textContent = '';
        analyse(true);
        if (old) say(msg, photo.box ? 'New photo in use.' : msg.textContent + ' Undo goes back to your earlier photo.', () => { photo = old; showPhoto(); if (!photo.saved) $('clean').value = photo.clean; schedule(0); }, !photo.box);
    }
    $('file').addEventListener('change', e => { choosePhoto(e.target.files[0]); e.target.value = ''; });
    const drop = $('drop');
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) choosePhoto(f); });
    document.addEventListener('paste', e => {
        const f = [...((e.clipboardData && e.clipboardData.files) || [])].find(x => /^image\//.test(x.type));
        if (f && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { setMode('photo'); choosePhoto(f); }
    });
    $('photo-again').addEventListener('click', () => $('file').click());

    // Brightness of the photo (turned as asked), at most WORK_LONG on its longest side.
    function prepare() {
        const img = photo.img, s = Math.min(1, WORK_LONG / Math.max(img.naturalWidth, img.naturalHeight));
        const iw = Math.max(1, Math.round(img.naturalWidth * s)), ih = Math.max(1, Math.round(img.naturalHeight * s));
        const side = photo.rot % 180 !== 0, w = side ? ih : iw, h = side ? iw : ih;
        const c = canvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
        g.translate(w / 2, h / 2); g.rotate(photo.rot * Math.PI / 180); g.drawImage(img, -iw / 2, -ih / 2, iw, ih);
        const d = g.getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
        for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
        photo.work = { w, h, L, bg: C.background(L, w, h) };
    }
    // Finds the signature on the cleaned photo and makes the ink layer (black ink, see-through paper).
    function analyse(fresh) {
        if (!photo || photo.saved) return;
        if (fresh || !photo.work) prepare();
        const W = photo.work, a = C.inkAmounts(W.L, W.bg, photo.clean);
        const found = C.findSignature(a, W.w, W.h, photo.crop);
        W.a = a; W.found = found;
        const layer = canvas(W.w, W.h), g = layer.getContext('2d'), im = g.createImageData(W.w, W.h);
        if (found) for (let i = 0, j = 3; i < a.length; i++, j += 4) if (found.keep[i]) im.data[j] = Math.round(a[i] * 255);
        g.putImageData(im, 0, 0);
        photo.layer = layer; photo.box = found ? found.box : null;
        showPhoto();
        say($('photo-msg'), found ? '' : 'No signature found in this photo. Sign with a dark pen on white paper, or move Clean-up towards Keep faint ink' + (photo.crop ? ', or tap Use the whole photo.' : '.'), null, !found);
        schedule(0);
    }
    function showPhoto() {
        const has = !!photo;
        $('photo-work').hidden = !has; $('photo-pick').hidden = has;
        if (!has) return;
        $('clean-row').hidden = photo.saved; $('rotate').hidden = photo.saved; $('crop-hint').hidden = photo.saved;
        $('crop-reset').hidden = photo.saved || !photo.crop;
        drawView();
    }
    // The cleaned photo: kept ink in the chosen colour, dropped marks faint, the used part in a dashed box.
    const view = $('photo-view'), vctx = view.getContext('2d');
    function drawView(dragBox) {
        if (!photo || !photo.layer) return;
        const L = photo.layer, w = L.width, h = L.height;
        view.width = w; view.height = h;
        vctx.fillStyle = '#fff'; vctx.fillRect(0, 0, w, h);
        if (!photo.saved && photo.work && photo.work.a) {           // what was dropped, faint, so the person sees why
            const ghost = canvas(w, h), g = ghost.getContext('2d'), im = g.createImageData(w, h), a = photo.work.a, keep = photo.work.found ? photo.work.found.keep : null;
            for (let i = 0, j = 0; i < a.length; i++, j += 4) if (a[i] > 0.2 && !(keep && keep[i])) { im.data[j] = 150; im.data[j + 1] = 160; im.data[j + 2] = 180; im.data[j + 3] = Math.round(a[i] * 90); }
            g.putImageData(im, 0, 0); vctx.drawImage(ghost, 0, 0);
        }
        vctx.drawImage(tint(L, C.INK[pen.ink]), 0, 0);
        const lw = Math.max(2, Math.round(Math.max(w, h) / 300));
        const box = dragBox || photo.box;
        if (box && !photo.saved) {
            vctx.setLineDash([lw * 4, lw * 3]); vctx.lineWidth = lw; vctx.strokeStyle = dragBox ? '#f59e0b' : '#2563eb';
            vctx.strokeRect(box.x - lw, box.y - lw, box.w + 2 * lw, box.h + 2 * lw); vctx.setLineDash([]);
        }
    }
    function tint(src, color) {
        const c = canvas(src.width, src.height), g = c.getContext('2d');
        g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
        return c;
    }
    // Drag a box on the cleaned photo to choose the part that is the signature.
    let drag = null;
    const viewPoint = e => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * view.width, (e.clientY - r.top) / r.height * view.height]; };
    view.addEventListener('pointerdown', e => {
        if (!photo || photo.saved || e.button > 0) return;
        e.preventDefault(); try { view.setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
        const p = viewPoint(e); drag = { id: e.pointerId, x0: p[0], y0: p[1], box: null };
    });
    view.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        const p = viewPoint(e);
        drag.box = { x: Math.max(0, Math.min(drag.x0, p[0])), y: Math.max(0, Math.min(drag.y0, p[1])), w: Math.abs(p[0] - drag.x0), h: Math.abs(p[1] - drag.y0) };
        drawView(drag.box);
    });
    const endDrag = e => {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        const b = drag.box; drag = null;
        const min = Math.max(view.width, view.height) * 0.03;
        if (b && b.w > min && b.h > min) { photo.crop = b; analyse(); } else drawView();
    };
    view.addEventListener('pointerup', endDrag);
    view.addEventListener('pointercancel', endDrag);
    $('crop-reset').addEventListener('click', () => { if (photo) { photo.crop = null; analyse(); } });
    $('rotate').addEventListener('click', () => { if (photo && !photo.saved) { photo.rot = (photo.rot + 90) % 360; photo.crop = null; analyse(true); } });
    let cleanTimer = 0;
    $('clean').addEventListener('input', () => {
        if (!photo || photo.saved) return;
        photo.clean = Math.min(9, Math.max(1, parseInt($('clean').value, 10) || 5));
        clearTimeout(cleanTimer); cleanTimer = setTimeout(() => analyse(), 120);
    });

    // ---- the size the form asks for
    const preset = $('preset');
    C.PRESETS.forEach(p => preset.appendChild(new Option(p.label, p.id)));
    preset.appendChild(new Option('Your own size (type below)', 'own'));
    function fillRules(r) {
        $('fmt-' + r.fmt).checked = true;
        $('w').value = r.w ? r.w : ''; $('h').value = r.h ? r.h : '';
        $('max').value = r.maxKB ? r.maxKB : ''; $('min').value = r.minKB ? r.minKB : '';
        showMin(!!r.minKB);
        preset.value = C.presetFor(r);
        ['px', 'max', 'min'].forEach(k => { $('err-' + k).textContent = ''; });
        ['w', 'h', 'max', 'min'].forEach(k => $(k).removeAttribute('aria-invalid'));
    }
    function showMin(on) { $('min-row').hidden = !on; $('add-min').hidden = on; }
    function readFields() {
        const r = C.readRules({ fmt: $('fmt-png').checked ? 'png' : 'jpg', w: $('w').value, h: $('h').value, max: $('max').value, min: $('min-row').hidden ? '' : $('min').value });
        const errs = r.errs || {};
        $('err-px').textContent = errs.px || ''; $('err-max').textContent = errs.max || ''; $('err-min').textContent = errs.min || '';
        ['w', 'h'].forEach(k => errs.px ? $(k).setAttribute('aria-invalid', 'true') : $(k).removeAttribute('aria-invalid'));
        errs.max ? $('max').setAttribute('aria-invalid', 'true') : $('max').removeAttribute('aria-invalid');
        errs.min ? $('min').setAttribute('aria-invalid', 'true') : $('min').removeAttribute('aria-invalid');
        if (r.rules) { rules = Object.assign(r.rules, { preset: C.presetFor(r.rules) }); preset.value = rules.preset; store.set(K_RULES, rules); }
        else rules = null;
        schedule(250);
    }
    preset.addEventListener('change', () => {
        const p = C.PRESETS.find(x => x.id === preset.value);
        if (!p) { $('w').focus(); return; }
        fillRules(p); readFields();
    });
    ['w', 'h', 'max', 'min'].forEach(k => $(k).addEventListener('input', readFields));
    document.querySelectorAll('input[name=fmt]').forEach(r => r.addEventListener('change', readFields));
    $('add-min').addEventListener('click', () => { showMin(true); $('min').focus(); });

    // ---- making the file
    function source() {
        if (mode === 'draw') {
            if (!strokes.length) return null;
            return { kind: 'draw', box: C.strokesBox(strokes, C.PEN[pen.thick]) };
        }
        if (!photo || !photo.box) return null;
        return { kind: 'photo', box: photo.box, layer: photo.layer };
    }
    // Draws the signature into a W x H picture. Returns a canvas (see-through for PNG, white for JPG).
    function paint(src, W, H, fmt) {
        const fit = C.fitBox(src.box.w, src.box.h, W, H), ink = C.INK[pen.ink];
        const layer = canvas(W, H), g = layer.getContext('2d');
        if (src.kind === 'draw') {
            const s = fit.s;
            g.setTransform(s, 0, 0, s, fit.dx - src.box.x * s, fit.dy - src.box.y * s);
            paintStrokes(g, strokes, C.lineWidth(pen.thick, s) / s, ink);
            g.setTransform(1, 0, 0, 1, 0, 0);
        } else {
            // shrink in halves first, so thin lines stay smooth
            let c = src.layer, sx = src.box.x, sy = src.box.y, sw = src.box.w, sh = src.box.h;
            const dw = sw * fit.s, dh = sh * fit.s;
            while (sw / 2 > dw && sh / 2 > dh) {
                const t = canvas(Math.ceil(sw / 2), Math.ceil(sh / 2)), tg = t.getContext('2d');
                tg.imageSmoothingQuality = 'high'; tg.drawImage(c, sx, sy, sw, sh, 0, 0, t.width, t.height);
                c = t; sx = 0; sy = 0; sw = t.width; sh = t.height;
            }
            g.imageSmoothingQuality = 'high'; g.drawImage(c, sx, sy, sw, sh, fit.dx, fit.dy, dw, dh);
            const boost = C.inkBoost(fit.s);
            if (boost > 1) { const im = g.getImageData(0, 0, W, H); for (let j = 3; j < im.data.length; j += 4) im.data[j] = Math.min(255, im.data[j] * boost); g.putImageData(im, 0, 0); }
            g.globalCompositeOperation = 'source-in'; g.fillStyle = ink; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
        }
        if (fmt === 'png') return layer;
        const out = canvas(W, H), o = out.getContext('2d');
        o.fillStyle = '#fff'; o.fillRect(0, 0, W, H); o.drawImage(layer, 0, 0);
        return out;
    }
    const toBlob = (c, type, q) => new Promise(res => c.toBlob(b => res(b), type, q));

    function schedule(ms) {
        clearTimeout(renderTimer);
        $('result').classList.add('busy');
        renderTimer = setTimeout(render, ms);
    }
    async function render() {
        const token = ++renderToken, src = source(), r = rules;
        saveSignature();
        if (!src) return show(null);
        if (!r) return show({ failed: 'Fix the size in box 2 first.' });
        const fixed = !!(r.w && r.h);
        const cap = src.kind === 'photo' ? Math.max(src.box.w, src.box.h) * 1.5 : 0;
        const base = fixed ? { W: r.w, H: r.h } : C.keepSize(src.box.w, src.box.h, C.KEEP_LONG, cap);
        const long = Math.max(base.W, base.H), type = r.fmt === 'png' ? 'image/png' : 'image/jpeg';
        const cache = {};
        const encode = async (scale, q) => {
            const key = scale.toFixed(4);
            if (!cache[key]) {
                const size = fixed ? base : C.keepSize(src.box.w, src.box.h, C.KEEP_LONG * scale, cap ? cap * scale : 0);
                cache[key] = { c: paint(src, size.W, size.H, r.fmt), W: size.W, H: size.H };
            }
            const k = cache[key], blob = await toBlob(k.c, type, q);
            return { size: blob.size, blob, W: k.W, H: k.H, canvas: k.c };
        };
        let fit;
        try { fit = await C.fitToLimit(encode, { fmt: r.fmt, maxBytes: r.maxKB ? C.maxBytes(r.maxKB) : 0, fixed, long }); }
        catch (e) { if (token === renderToken) show({ failed: 'Something went wrong making the file. Try again, or try a smaller size.' }); return; }
        if (token !== renderToken) return;
        if (!fit.ok) {
            const sm = fit.smallest, lim = C.kbLabel(r.maxKB);
            return show({ failed: r.fmt === 'png'
                ? 'As a PNG at ' + sm.W + ' × ' + sm.H + ' px this signature is ' + C.fmtSize(sm.size) + ', over the ' + lim + ' limit. Choose JPG, or a bigger limit.'
                : fixed ? 'At ' + r.w + ' × ' + r.h + ' px the smallest this signature can be is ' + C.fmtSize(sm.size) + ', over the ' + lim + ' limit. Check the limit (' + C.kbLabel(r.maxKB * 10) + ', not ' + lim + '?) or choose a bigger one.'
                : 'This signature cannot be made under ' + lim + ' and still be readable. Check the limit, or choose a bigger one.', W: sm.W, H: sm.H });
        }
        let blob = fit.res.blob, padded = false;
        if (r.minKB && blob.size < C.minBytes(r.minKB)) {
            const bytes = new Uint8Array(await blob.arrayBuffer()), target = C.padTarget(r.minKB, r.maxKB);
            const out = r.fmt === 'png' ? C.padPng(bytes, target) : C.padJpeg(bytes, target);
            if (token !== renderToken) return;
            blob = new Blob([out], { type }); padded = true;
        }
        show({ blob, W: fit.res.W, H: fit.res.H, fmt: r.fmt, fixed, padded, rules: r, canvas: fit.res.canvas, q: fit.q });
    }

    function show(res) {
        $('result').classList.remove('busy');
        result = res && res.blob ? res : null;
        $('res-empty').hidden = !!res; $('res-body').hidden = !res;
        $('result').classList.toggle('failed', !!(res && res.failed));
        $('res-msg').textContent = '';
        if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
        if (!res) { $('res-img').removeAttribute('src'); return; }
        if (res.failed) {
            $('res-size').textContent = 'Not possible';
            $('res-verdict').textContent = res.failed; $('res-verdict').className = 'r-verdict bad';
            $('res-detail').textContent = ''; $('real-wrap').hidden = true;
            $('preview').hidden = true;
            $('download').removeAttribute('href');
            announce('The signature file cannot be made: ' + res.failed);
            return;
        }
        $('preview').hidden = false; $('real-wrap').hidden = false;
        objectUrl = URL.createObjectURL(res.blob);
        const img = $('res-img'), real = $('res-real');
        img.src = objectUrl; real.src = objectUrl;
        real.style.width = res.W + 'px'; img.style.maxWidth = Math.max(res.W, Math.min(560, res.W * 3)) + 'px';
        $('preview').classList.toggle('see-through', res.fmt === 'png');
        $('res-size').textContent = C.fmtSize(res.blob.size);
        $('res-verdict').textContent = C.verdict(res.rules); $('res-verdict').className = 'r-verdict';
        const lines = [res.W + ' × ' + res.H + ' px, ' + (res.fmt === 'png' ? 'PNG with a see-through background' : 'JPG with a white background') + ', ' + res.blob.size.toLocaleString('en-US') + ' bytes.'];
        if (res.padded) lines.push('Topped up to reach ' + C.kbLabel(res.rules.minKB) + ' with empty space inside the file. The picture is unchanged.');
        if (!res.fixed) lines.push('Its own shape, with a little space around it.');
        $('res-detail').textContent = lines.join('\n');
        const name = C.outName(res.fmt, res.W, res.H, res.fixed);
        const a = $('download'); a.href = objectUrl; a.download = name;
        const file = typeof File === 'function' ? new File([res.blob], name, { type: res.blob.type }) : null;
        $('share').hidden = !(file && navigator.canShare && navigator.canShare({ files: [file] }));
        $('copy').hidden = !(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write);
        announce('Signature file ready: ' + C.fmtSize(res.blob.size) + ', ' + res.W + ' by ' + res.H + ' pixels. ' + C.verdict(res.rules));
    }
    $('share').addEventListener('click', async () => {
        if (!result) return;
        const name = C.outName(result.fmt, result.W, result.H, result.fixed);
        try { await navigator.share({ files: [new File([result.blob], name, { type: result.blob.type })], title: 'My signature' }); }
        catch (e) { if (e && e.name !== 'AbortError') say($('res-msg'), 'Sharing did not work here. Use Download instead.', null, true); }
    });
    $('copy').addEventListener('click', async () => {
        if (!result) return;
        try {
            const png = result.fmt === 'png' ? result.blob : await toBlob(result.canvas, 'image/png');
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
            say($('res-msg'), 'Copied. Paste it into your document.');
        } catch (e) { say($('res-msg'), 'This browser cannot copy pictures. Use Download instead.', null, true); }
    });

    // ---- remembering the signature (only when the person asks)
    function saveSignature() {
        if (!$('remember').checked) return;
        if (mode === 'draw' && strokes.length) store.set(K_SIG, { v: 1, kind: 'draw', strokes });
        else if (mode === 'photo' && photo && photo.box) {
            const b = photo.box, s = Math.min(1, 900 / Math.max(b.w, b.h)), c = canvas(b.w * s, b.h * s);
            c.getContext('2d').drawImage(photo.layer, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
            if (!store.set(K_SIG, { v: 1, kind: 'image', png: c.toDataURL('image/png') })) say($('start-msg'), 'Your signature could not be saved: this browser’s storage is full or blocked.', null, true);
        } else store.del(K_SIG);
    }
    $('remember').addEventListener('change', () => {
        if ($('remember').checked) { saveSignature(); say($('start-msg'), source() ? 'Your signature is saved on this device.' : 'Your signature will be saved on this device once you make it.'); }
        else { store.del(K_SIG); say($('start-msg'), 'Your saved signature is deleted from this device.'); }
    });
    function restoreSignature() {
        const s = store.get(K_SIG);
        if (!s) return Promise.resolve(false);
        $('remember').checked = true;
        if (s.kind === 'draw') {
            const list = C.cleanStrokes(s.strokes);
            if (!list.length) { store.del(K_SIG); $('remember').checked = false; return Promise.resolve(false); }
            strokes = list; return Promise.resolve('draw');
        }
        if (s.kind === 'image' && typeof s.png === 'string' && s.png.startsWith('data:image/png;base64,')) {
            return new Promise(res => {
                const img = new Image();
                img.onload = () => {
                    const c = canvas(img.naturalWidth, img.naturalHeight); c.getContext('2d').drawImage(img, 0, 0);
                    photo = { saved: true, layer: c, box: { x: 0, y: 0, w: c.width, h: c.height } };
                    res('photo');
                };
                img.onerror = () => { store.del(K_SIG); res(false); };
                img.src = s.png;
            });
        }
        store.del(K_SIG);
        return Promise.resolve(false);
    }

    // ---- start over
    $('start-over').addEventListener('click', () => {
        const snap = { mode, strokes, photo };
        if (!snap.strokes.length && !snap.photo) { say($('start-msg'), 'Nothing to clear yet.'); return; }
        strokes = []; photo = null; drawPad(); showPhoto(); $('photo-msg').textContent = ''; $('pad-msg').textContent = '';
        setMode('draw');
        say($('start-msg'), 'Started over.' + ($('remember').checked ? ' Your saved signature is cleared too.' : ''), () => {
            strokes = snap.strokes; photo = snap.photo; showPhoto(); setMode(snap.mode); drawPad();
        });
    });

    // ---- start
    $('ink-' + pen.ink).checked = true; $('th-' + pen.thick).checked = true;
    fillRules(rules);
    restoreSignature().then(kind => {
        if (kind === 'photo') { showPhoto(); setMode('photo'); say($('photo-msg'), 'Your saved signature. Choose another photo to replace it.'); }
        else setMode('draw');
        if (kind === 'draw') drawPad();
    });

    // for the checks in ui-test.js
    window.SignApp = { state: () => ({ mode, strokes: strokes.length, photo: !!photo, rules, pen, box: photo && photo.box && photo.layer ? Object.assign({ W: photo.layer.width, H: photo.layer.height }, photo.box) : null }), result: () => result, setStrokes: s => { strokes = s; drawPad(); schedule(0); } };

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
