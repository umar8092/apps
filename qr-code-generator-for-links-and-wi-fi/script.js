// QR Code Generator for Links and Wi-Fi: the page. All the rules are in core.js.
(function () {
    const C = window.QrCore;
    const KEY = 'qr-code-generator-for-links-and-wi-fi.state';
    const SAVED_KEY = 'qr-code-generator-for-links-and-wi-fi.saved';
    const $ = id => document.getElementById(id);
    const EMPTY_HINT = { link: 'Type a link to see its QR code here.', wifi: 'Type the Wi-Fi name to see its QR code here.', contact: 'Type a name to see the QR code here.', phone: 'Type a phone number to see its QR code here.', sms: 'Type a phone number to see its QR code here.', email: 'Type an email address to see its QR code here.', text: 'Type some text to see its QR code here.' };

    // ---- state ----
    let state = { type: 'link', fields: {}, look: C.cleanLook({}), openId: '', name: '' };
    let saved = [];
    let storageOk = true;
    let current = null;   // { payload, code, lines } when a code is showing
    let undo = null;
    C.TYPES.forEach(t => { state.fields[t] = {}; });

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) {
                const s = JSON.parse(raw);
                if (s && typeof s === 'object') {
                    if (C.TYPES.includes(s.type)) state.type = s.type;
                    C.TYPES.forEach(t => { state.fields[t] = C.cleanFields(t, s.fields && s.fields[t]); });
                    state.look = C.cleanLook(s.look);
                    state.openId = typeof s.openId === 'string' ? s.openId : '';
                    state.name = typeof s.name === 'string' ? s.name.slice(0, 80) : '';
                }
            }
        } catch (e) { /* blocked or broken: start fresh */ }
        try { saved = C.cleanSaved(JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')); } catch (e) { saved = []; }
        if (!saved.some(x => x.id === state.openId)) state.openId = '';
    }
    function store() {
        try {
            localStorage.setItem(KEY, JSON.stringify(state));
            localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
            storageOk = true;
        } catch (e) {
            if (storageOk) say('saved-msg', 'This browser is not letting the app save, so it will be empty next time. Download the codes you need.');
            storageOk = false;
        }
        return storageOk;
    }

    // ---- messages with an optional Undo ----
    function say(id, text, undoFn) {
        const el = $(id);
        el.textContent = text;
        if (undoFn) {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = 'Undo';
            b.addEventListener('click', () => { undoFn(); el.textContent = ''; });
            el.appendChild(b);
        }
        clearTimeout(el._t);
        el._t = setTimeout(() => { if (el.textContent === text + (undoFn ? 'Undo' : '')) el.textContent = ''; }, undoFn ? 12000 : 5000);
    }

    // ---- form <-> state ----
    const panels = [...document.querySelectorAll('.panel')];
    const panelOf = t => panels.find(p => p.dataset.type === t);
    function fieldEls(t) { return [...panelOf(t).querySelectorAll('[data-f]')]; }
    function readForm() {
        const f = {};
        fieldEls(state.type).forEach(el => { f[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; });
        state.fields[state.type] = f;
    }
    function fillForm() {
        C.TYPES.forEach(t => fieldEls(t).forEach(el => {
            const v = state.fields[t][el.dataset.f];
            if (el.type === 'checkbox') el.checked = v === true;
            else if (el.tagName === 'SELECT') el.value = v || el.options[0].value;
            else el.value = v || '';
        }));
        document.querySelectorAll('input[name=type]').forEach(r => { r.checked = r.value === state.type; });
        const L = state.look;
        $('fg').value = L.fg; $('bg').value = L.bg; $('transparent').checked = L.transparent; $('ecl').value = L.ecl;
        if (C.SIZES.includes(L.size)) { $('size').value = String(L.size); $('own-box').hidden = true; }
        else { $('size').value = 'own'; $('own-box').hidden = false; $('own').value = String(L.size); }
        $('caption').value = L.caption; $('wifi-text').checked = L.wifiText;
        if (L.caption) showCaption(true);
        $('save-name').value = state.name;
        // optional parts open when they hold something
        const c = state.fields.contact;
        if (['title', 'work', 'website', 'address', 'note'].some(k => c[k])) reveal('c-more-btn', 'c-more');
        const e = state.fields.email;
        if (e.subject || e.body) reveal('e-more-btn', 'e-more');
    }
    function reveal(btnId, boxId) { $(boxId).hidden = false; $(btnId).hidden = true; $(btnId).setAttribute('aria-expanded', 'true'); }
    function showCaption(open) { $('cap-box').hidden = !open; $('cap-btn').hidden = open; $('cap-btn').setAttribute('aria-expanded', String(open)); }

    // ---- make the code ----
    function render() {
        const t = state.type, f = state.fields[t], L = state.look;
        panels.forEach(p => { p.hidden = p.dataset.type !== t; });
        $('wifi-pw-box').hidden = !(t === 'wifi' && (f.security || 'WPA') !== 'nopass');
        $('wifi-text-box').hidden = t !== 'wifi';
        // field errors only for boxes the person has touched, so a new form is not covered in red
        panelOf(t).querySelectorAll('[data-err]').forEach(e => { e.textContent = ''; });
        panelOf(t).querySelectorAll('[data-f]').forEach(e => e.removeAttribute('aria-invalid'));
        const p = C.buildPayload(t, f);
        const notes = $('notes'); notes.textContent = '';
        const img = $('qr-img'), empty = $('qr-empty'), prev = $('preview');
        current = null;
        prev.classList.remove('bad');
        let problem = '';
        if (!p.ok) {
            const blank = !Object.keys(f).some(k => typeof f[k] === 'string' && f[k].trim() && k !== 'security');
            problem = blank ? EMPTY_HINT[t] : p.error;
            if (!blank && p.field) {
                const errEl = panelOf(t).querySelector('[data-err="' + p.field + '"]');
                const input = panelOf(t).querySelector('[data-f="' + p.field + '"]');
                if (errEl) errEl.textContent = p.error;
                if (input) input.setAttribute('aria-invalid', 'true');
                problem = 'Fix the box marked in red to see the code.';
            }
        } else {
            (p.notes || []).forEach(n => { const li = document.createElement('li'); li.textContent = n; notes.appendChild(li); });
            const code = C.encode(p.text, L.ecl);
            if (!code.ok) { problem = code.error; prev.classList.add('bad'); }
            else current = { payload: p, code, lines: C.captionLines(t, f, L) };
        }
        const cc = C.colourCheck(L.fg, L.bg, L.transparent);
        $('colour-warn').textContent = cc.warning;
        $('colour-reset').hidden = L.fg === '#000000' && L.bg === '#ffffff' && !L.transparent;
        ['dl-png', 'dl-svg', 'copy-img', 'share', 'print', 'save', 'save-new'].forEach(id => { $(id).disabled = !current; });
        if (!current) {
            img.hidden = true; img.removeAttribute('src'); img.alt = '';
            empty.hidden = false; empty.textContent = problem;
            $('does').textContent = ''; $('payload').textContent = '';
            $('print-hint').textContent = 'Before printing many, test the code with your own phone camera.';
        } else {
            const svg = svgText(current, 600);
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
            img.alt = 'QR code. ' + C.describe(t, f) + (current.lines.length ? '. Words under it: ' + current.lines.map(l => l.text).join(', ') : '');
            img.hidden = false; empty.hidden = true;
            $('does').textContent = doesText(t, p);
            $('payload').textContent = p.text;
            const cm = C.printWidthCm(current.code.size), inch = Math.ceil(cm / 2.54 * 10) / 10;
            $('print-hint').textContent = 'Print it at least ' + cm + ' cm (' + inch + ' in) wide, bigger for posters. Test it with your own phone camera before printing many.';
        }
        $('save').textContent = state.openId ? 'Save changes' : 'Save to My QR codes';
        $('save-new').hidden = !state.openId;
        $('save-name').placeholder = current ? C.describe(t, f) : 'Cafe Wi-Fi';
        renderSaved();
    }
    function doesText(t, p) {
        const f = state.fields[t];
        switch (t) {
            case 'link': return 'Scanning it opens ' + p.text;
            case 'wifi': return 'Scanning it joins the Wi-Fi network ' + p.ssid + (p.security === 'nopass' ? ' (no password)' : '');
            case 'contact': return 'Scanning it offers to save ' + ([f.first, f.last].map(s => (s || '').trim()).filter(Boolean).join(' ') || (f.org || '').trim()) + ' in the contacts';
            case 'phone': return 'Scanning it opens the dialler with ' + p.text.slice(4);
            case 'sms': return 'Scanning it opens a text message to ' + p.text.split(':')[1];
            case 'email': return 'Scanning it opens an email to ' + p.text.slice(7).split('?')[0];
            case 'text': return 'Scanning it shows your text';
        }
        return '';
    }

    // ---- pictures ----
    const FONT = 'Arial, Helvetica, sans-serif';
    // Splits caption lines so each fits 90% of the width; one long word is cut by letters
    function wrap(lines, width) {
        const cv = document.createElement('canvas').getContext('2d');
        const out = [];
        lines.forEach(l => {
            const size = width * (l.bold ? 0.058 : 0.05);
            cv.font = (l.bold ? '700 ' : '') + size + 'px ' + FONT;
            const max = width * 0.9;
            let line = '';
            const push = s => out.push({ text: s, bold: l.bold });
            l.text.split(/\s+/).filter(Boolean).forEach(word => {
                const tryLine = line ? line + ' ' + word : word;
                if (cv.measureText(tryLine).width <= max) { line = tryLine; return; }
                if (line) push(line);
                line = '';
                let piece = '';
                for (const ch of word) {
                    if (cv.measureText(piece + ch).width > max && piece) { push(piece); piece = ''; }
                    piece += ch;
                }
                line = piece;
            });
            if (line) push(line);
        });
        return out.slice(0, 12);
    }
    function svgText(cur, px) {
        const L = state.look;
        return C.svgFile(cur.code.modules, { fg: L.fg, bg: L.bg, transparent: L.transparent, px: px || L.size, lines: wrap(cur.lines, 1000) });
    }
    function drawCanvas(cur) {
        const L = state.look;
        const lay = C.layout(cur.code.size, L.size);
        const W = lay.width;
        const lines = wrap(cur.lines, W);
        const lineH = Math.round(W * 0.085);
        const H = W + (lines.length ? lines.length * lineH + Math.round(W * 0.04) : 0);
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        if (!L.transparent) { ctx.fillStyle = L.bg; ctx.fillRect(0, 0, W, H); }
        ctx.fillStyle = L.fg;
        cur.code.modules.forEach((row, y) => row.forEach((on, x) => { if (on) ctx.fillRect(lay.offset + x * lay.unit, lay.offset + y * lay.unit, lay.unit, lay.unit); }));
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        // text starts after the code's quiet border less one square, the same as the SVG file
        const top = W - (W / (cur.code.size + 8));
        lines.forEach((l, i) => {
            ctx.font = (l.bold ? '700 ' : '') + Math.round(lineH * (l.bold ? 0.62 : 0.56)) + 'px ' + FONT;
            ctx.fillText(l.text, W / 2, top + (i + 0.8) * lineH);
        });
        return { canvas: cv, grew: lay.grew, width: W, height: H };
    }
    const toBlob = cv => new Promise(res => cv.toBlob(b => res(b), 'image/png'));
    function fileName(ext) {
        const t = state.type, f = state.fields[t];
        const main = state.name || ({ link: f.url, wifi: f.ssid, contact: [f.first, f.last].join(' ').trim() || f.org, phone: f.number, sms: f.number, email: f.to, text: 'text' }[t] || '');
        const slug = String(main || '').toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
        return 'qr-' + (t === 'wifi' ? 'wifi' : t) + (slug ? '-' + slug : '') + '.' + ext;
    }
    function download(blob, name) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }

    $('dl-png').addEventListener('click', async () => {
        if (!current) return;
        const d = drawCanvas(current);
        download(await toBlob(d.canvas), fileName('png'));
        say('res-msg', 'Saved ' + fileName('png') + ', ' + d.width + ' × ' + d.height + ' pixels.' + (d.grew ? ' It was made bigger than you asked, because this code needs at least ' + d.width + ' pixels to stay sharp.' : ''));
    });
    $('dl-svg').addEventListener('click', () => {
        if (!current) return;
        download(new Blob([svgText(current)], { type: 'image/svg+xml' }), fileName('svg'));
        say('res-msg', 'Saved ' + fileName('svg') + '. It stays sharp at any size.');
    });
    $('copy-img').addEventListener('click', async () => {
        if (!current) return;
        try {
            if (!navigator.clipboard || !window.ClipboardItem) throw new Error('no');
            const blob = await toBlob(drawCanvas(current).canvas);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            say('res-msg', 'Picture copied. Paste it into your document or chat.');
        } catch (e) { say('res-msg', 'This browser cannot copy pictures. Use Download PNG instead.'); }
    });
    if (navigator.canShare && navigator.share) {
        try { if (navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' })] })) $('share').hidden = false; } catch (e) { /* no file sharing */ }
    }
    $('share').addEventListener('click', async () => {
        if (!current) return;
        try {
            const file = new File([await toBlob(drawCanvas(current).canvas)], fileName('png'), { type: 'image/png' });
            await navigator.share({ files: [file], title: C.describe(state.type, state.fields[state.type]) });
        } catch (e) { if (e && e.name !== 'AbortError') say('res-msg', 'Sharing did not work here. Use Download PNG instead.'); }
    });
    $('print').addEventListener('click', () => {
        if (!current) return;
        const n = Number($('copies').value) || 1;
        const area = $('print-area');
        area.textContent = ''; area.className = 'n' + n;
        const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText(current, 800));
        for (let i = 0; i < n; i++) { const im = document.createElement('img'); im.src = src; im.alt = ''; area.appendChild(im); }
        setTimeout(() => window.print(), 60);
    });

    // ---- My QR codes ----
    function renderSaved() {
        const ul = $('saved-list');
        ul.textContent = '';
        $('saved-empty').hidden = saved.length > 0;
        saved.forEach(item => {
            const li = document.createElement('li');
            li.className = 's-item' + (item.id === state.openId ? ' open' : '');
            const p = C.buildPayload(item.type, item.fields), code = p.ok ? C.encode(p.text, item.look.ecl) : null;
            const im = document.createElement('img');
            im.alt = '';
            if (code && code.ok) im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(C.svgFile(code.modules, { fg: item.look.fg, bg: item.look.transparent ? '#ffffff' : item.look.bg, px: 56 }));
            const name = document.createElement('p'); name.className = 's-name'; name.textContent = item.name;
            const type = document.createElement('p'); type.className = 's-type'; type.textContent = C.TYPE_NAMES[item.type] + (item.id === state.openId ? ' · open now' : '');
            const btns = document.createElement('div'); btns.className = 's-btns';
            const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Open'; open.setAttribute('aria-label', 'Open ' + item.name);
            open.addEventListener('click', () => openSaved(item.id));
            const del = document.createElement('button'); del.type = 'button'; del.className = 'del'; del.textContent = 'Delete'; del.setAttribute('aria-label', 'Delete ' + item.name);
            del.addEventListener('click', () => deleteSaved(item.id));
            btns.append(open, del);
            li.append(im, name, type, btns);
            ul.appendChild(li);
        });
    }
    function snapshot() { return JSON.parse(JSON.stringify(state)); }
    function saveCurrent(asNew) {
        if (!current) return;
        const name = $('save-name').value.trim() || C.describe(state.type, state.fields[state.type]);
        const entry = { id: '', type: state.type, name, fields: C.cleanFields(state.type, state.fields[state.type]), look: C.cleanLook(state.look), saved: Date.now() };
        const i = saved.findIndex(x => x.id === state.openId);
        if (!asNew && i >= 0) { entry.id = state.openId; saved[i] = entry; say('saved-msg', 'Saved the changes to "' + name + '".'); }
        else {
            if (saved.length >= 200) { say('saved-msg', 'My QR codes is full (200). Delete one first.'); return; }
            entry.id = 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            saved.unshift(entry);
            say('saved-msg', 'Saved "' + name + '" to My QR codes.');
        }
        state.openId = entry.id; state.name = name === C.describe(state.type, state.fields[state.type]) ? '' : name;
        if (!store()) say('saved-msg', 'Saved "' + name + '" for now, but this browser is not letting the app keep it after the page is closed. Download the code to keep it.');
        render();
    }
    function openSaved(id) {
        const item = saved.find(x => x.id === id);
        if (!item) return;
        const before = snapshot();
        state.type = item.type;
        state.fields[item.type] = JSON.parse(JSON.stringify(item.fields));
        state.look = C.cleanLook(item.look);
        state.openId = item.id; state.name = item.name;
        showCaption(!!state.look.caption);
        fillForm(); store(); render();
        say('saved-msg', 'Opened "' + item.name + '".', () => { state = before; showCaption(!!state.look.caption); fillForm(); store(); render(); });
        $('res-h').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function deleteSaved(id) {
        const i = saved.findIndex(x => x.id === id);
        if (i < 0) return;
        const [gone] = saved.splice(i, 1);
        const wasOpen = state.openId === id;
        if (wasOpen) state.openId = '';
        store(); render();
        say('saved-msg', 'Deleted "' + gone.name + '".', () => { saved.splice(Math.min(i, saved.length), 0, gone); if (wasOpen) state.openId = id; store(); render(); });
    }
    $('save').addEventListener('click', () => saveCurrent(false));
    $('save-new').addEventListener('click', () => saveCurrent(true));
    $('save-name').addEventListener('input', () => { state.name = $('save-name').value.slice(0, 80); store(); });

    $('restart').addEventListener('click', () => {
        const before = snapshot();
        C.TYPES.forEach(t => { state.fields[t] = {}; });
        state.look.caption = ''; state.openId = ''; state.name = '';
        showCaption(false);
        fillForm(); store(); render();
        say('saved-msg', 'Cleared what you typed.', () => { state = before; showCaption(!!state.look.caption); fillForm(); store(); render(); });
        $('what-h').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ---- inputs ----
    document.querySelectorAll('input[name=type]').forEach(r => r.addEventListener('change', () => {
        if (!r.checked) return;
        state.type = r.value; store(); render();
    }));
    panels.forEach(p => p.addEventListener('input', () => { readForm(); store(); render(); }));
    panels.forEach(p => p.addEventListener('change', () => { readForm(); store(); render(); }));
    $('pw-show').addEventListener('click', () => {
        const pw = $('wifi-pw'), show = pw.type === 'password';
        pw.type = show ? 'text' : 'password';
        $('pw-show').textContent = show ? 'Hide' : 'Show';
        $('pw-show').setAttribute('aria-pressed', String(show));
    });
    $('c-more-btn').addEventListener('click', () => { reveal('c-more-btn', 'c-more'); $('c-title').focus(); });
    $('e-more-btn').addEventListener('click', () => { reveal('e-more-btn', 'e-more'); $('e-sub').focus(); });
    $('cap-btn').addEventListener('click', () => { showCaption(true); $('caption').focus(); });

    function lookChanged() {
        const L = state.look;
        L.fg = $('fg').value.toLowerCase(); L.bg = $('bg').value.toLowerCase(); L.transparent = $('transparent').checked;
        L.ecl = $('ecl').value; L.caption = $('caption').value.slice(0, 80); L.wifiText = $('wifi-text').checked;
        const own = $('size').value === 'own';
        $('own-box').hidden = !own;
        $('own-err').textContent = ''; $('own').removeAttribute('aria-invalid');
        if (!own) L.size = Number($('size').value);
        else {
            const raw = $('own').value.trim().replace(/\s*(px|pixels?)$/i, '');
            const n = Number(raw);
            if (raw === '') { /* keep the last size until a number is typed */ }
            else if (!/^\d+$/.test(raw) || n < 64 || n > 4096) { $('own-err').textContent = 'Type a whole number of pixels from 64 to 4096. Downloads use ' + L.size + ' until then.'; $('own').setAttribute('aria-invalid', 'true'); }
            else L.size = n;
        }
        store(); render();
    }
    ['fg', 'bg', 'transparent', 'ecl', 'size', 'own', 'caption', 'wifi-text'].forEach(id => { $(id).addEventListener('input', lookChanged); $(id).addEventListener('change', lookChanged); });
    $('size').addEventListener('change', () => { if ($('size').value === 'own') { if (!$('own').value) $('own').value = String(state.look.size); $('own').focus(); } });
    $('colour-reset').addEventListener('click', () => { $('fg').value = '#000000'; $('bg').value = '#ffffff'; $('transparent').checked = false; lookChanged(); });

    // ---- start ----
    load();
    fillForm();
    render();
    if (!saved.length && !Object.values(state.fields).some(f => Object.keys(f).length)) store();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
