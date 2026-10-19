// Emergency Medical Info Lock Screen and Wallet Card: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.IceCore;
    const SLUG = 'emergency-medical-info-lock-screen-and-wallet-card';
    const KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };
    const KINDS = ['allergies', 'conditions', 'meds', 'contacts'];
    const NOUN = { allergies: 'allergy', conditions: 'condition', meds: 'medicine', contacts: 'person to call' };

    let canSave = true, state, today = C.todayIso();
    const cur = () => state.people.find(p => p.id === state.cur) || state.people[0];

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved cards could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; save(); renderAll(); }
    // Every change: remember the day it was changed (printed on the card), save, and redraw the pictures.
    function touch() { cur().updated = today; save(); scheduleOut(); }

    // ---------- messages with Undo ----------
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        document.querySelectorAll('.msg.show').forEach(o => { if (o.id !== id) clearMsg(o.id); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) box.appendChild(btn('undo', 'Undo', () => { clearMsg(id); restoreSnap(undoSnap); }));
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 12000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- people ----------
    function renderPeople() {
        const box = $('people'); box.textContent = '';
        state.people.forEach(p => {
            const b = btn('chip', C.has(p.name) ? p.name.trim() : '(no name yet)', () => { if (p.id === state.cur) return; state.cur = p.id; save(); renderAll(); });
            b.setAttribute('aria-pressed', String(p.id === state.cur));
            box.appendChild(b);
        });
        $('add-person').hidden = state.people.length >= C.LIMITS.people;
        const p = cur();
        $('about-who').textContent = C.has(p.name) ? p.name.trim() : 'this person';
        $('del-person').textContent = C.has(p.name) ? 'Delete ' + p.name.trim() + "'s card" : "Delete this person's card";
    }
    $('add-person').addEventListener('click', () => {
        const p = C.blankPerson('');
        const from = cur(); p.out = Object.assign({}, from.out);  // same phone and look as the last card, changeable
        state.people.push(p); state.cur = p.id; save(); renderAll();
        $('f-name').focus();
        show('who-msg', 'New card started. Type their full name.');
    });

    // ---------- the form ----------
    function setOpen(key, open) {
        const o = $('o-' + key), w = $('w-' + key);
        const text = { doctor: 'Add a doctor (optional)', notes: 'Add other notes (optional)', lang: 'Add labels in a second language (optional)' }[key];
        w.hidden = !open; o.setAttribute('aria-expanded', String(open)); o.textContent = (open ? '− ' : '+ ') + text;
    }
    ['doctor', 'notes', 'lang'].forEach(k => $('o-' + k).addEventListener('click', () => {
        const open = $('w-' + k).hidden; setOpen(k, open);
        if (open) (k === 'doctor' ? $('f-docname') : k === 'notes' ? $('f-notes') : $('f-lang')).focus();
    }));

    function fillForm() {
        const p = cur();
        $('f-name').value = p.name; $('f-dob').value = p.dob; $('f-blood').value = p.blood;
        $('f-noal').checked = p.noAllergies;
        $('f-docname').value = p.doctor.name; $('f-docphone').value = p.doctor.phone;
        $('f-notes').value = p.notes;
        setOpen('doctor', C.has(p.doctor.name) || C.has(p.doctor.phone));
        setOpen('notes', C.has(p.notes));
        setOpen('lang', !!p.out.lang);
        $('f-size').value = p.out.size; $('f-w').value = p.out.w; $('f-h').value = p.out.h; $('w-custom').hidden = p.out.size !== 'custom';
        $('size-err').textContent = '';
        document.querySelectorAll('input[name=look]').forEach(r => { r.checked = r.value === p.out.theme; });
        $('f-lang').value = p.out.lang;
        $('dob-err').textContent = C.dobError(p.dob, today);
        $('f-dob').setAttribute('aria-invalid', String(!!C.dobError(p.dob, today)));
        $('f-dob').max = today;
        $('docphone-err').textContent = C.phoneError(p.doctor.phone);
        notesCount();
    }
    function notesCount() { const n = $('f-notes').value.length; $('notes-count').textContent = n ? n + ' of ' + C.LIMITS.notes + ' characters' : ''; }

    $('f-name').addEventListener('input', e => { cur().name = C.line(e.target.value, C.LIMITS.name); touch(); renderPeople(); });
    $('f-dob').addEventListener('input', e => {
        const err = C.dobError(e.target.value, today);
        $('dob-err').textContent = err; e.target.setAttribute('aria-invalid', String(!!err));
        cur().dob = e.target.value && !err ? e.target.value : ''; touch();
    });
    $('f-blood').addEventListener('change', e => { cur().blood = e.target.value; touch(); });
    $('f-noal').addEventListener('change', e => { cur().noAllergies = e.target.checked; touch(); });
    $('f-docname').addEventListener('input', e => { cur().doctor.name = C.line(e.target.value, C.LIMITS.name); touch(); });
    $('f-docphone').addEventListener('input', e => { cur().doctor.phone = C.line(e.target.value, C.LIMITS.phone); $('docphone-err').textContent = C.phoneError(e.target.value); touch(); });
    $('f-notes').addEventListener('input', e => { cur().notes = C.text(e.target.value, C.LIMITS.notes); notesCount(); touch(); });

    // ---------- rows (each allergy, condition, medicine and person to call in its own box) ----------
    function field(kind, i, key, labelText, value, opts) {
        const id = kind + '-' + i + '-' + key, wrap = el('div', 'opt f-' + key);
        const lab = el('label', null, labelText); lab.htmlFor = id; wrap.appendChild(lab);
        let inp;
        if (opts.select) {
            inp = el('select');
            opts.select.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; inp.appendChild(o); });
            inp.value = value;
            inp.addEventListener('change', () => { cur()[kind][i][key] = inp.value; touch(); });
        } else {
            inp = el('input'); inp.type = opts.type || 'text'; inp.value = value; inp.maxLength = opts.max;
            if (opts.placeholder) inp.placeholder = opts.placeholder;
            if (opts.list) inp.setAttribute('list', opts.list);
            if (opts.auto) inp.autocomplete = opts.auto;
            inp.addEventListener('input', () => {
                cur()[kind][i][key] = C.line(inp.value, opts.max);
                if (opts.onInput) opts.onInput(inp);
                touch();
            });
        }
        inp.id = id; wrap.appendChild(inp);
        return wrap;
    }
    function renderRows(kind) {
        const ul = $('rows-' + kind); ul.textContent = '';
        const p = cur();
        p[kind].forEach((r, i) => {
            const li = el('li', 'row-box row-' + kind);
            const n = p[kind].length > 1 ? ' ' + (i + 1) : '';
            if (kind === 'allergies') {
                li.appendChild(field(kind, i, 't', 'Allergy' + n, r.t, { max: C.LIMITS.item, placeholder: 'e.g. Penicillin' }));
                li.appendChild(field(kind, i, 'sev', 'How bad? (optional)', r.sev, { select: [['', 'Not said'], ['life', 'Life-threatening'], ['severe', 'Severe'], ['moderate', 'Moderate'], ['mild', 'Mild']] }));
            } else if (kind === 'conditions') {
                li.appendChild(field(kind, i, 't', 'Condition' + n, r.t, { max: C.LIMITS.item, placeholder: 'e.g. Type 2 diabetes' }));
            } else if (kind === 'meds') {
                li.appendChild(field(kind, i, 't', 'Medicine' + n, r.t, { max: C.LIMITS.item, placeholder: 'e.g. Warfarin' }));
                li.appendChild(field(kind, i, 'dose', 'Dose and when (optional)', r.dose, { max: C.LIMITS.dose, placeholder: 'e.g. 5 mg every evening' }));
            } else {
                li.appendChild(field(kind, i, 'name', 'Name' + n, r.name, { max: C.LIMITS.name, placeholder: 'e.g. Bilal Khan' }));
                li.appendChild(field(kind, i, 'rel', 'Relationship (optional)', r.rel, { max: C.LIMITS.rel, placeholder: 'e.g. Son', list: 'rels' }));
                const err = el('p', 'err', C.phoneError(r.phone));
                li.appendChild(field(kind, i, 'phone', 'Phone number', r.phone, { max: C.LIMITS.phone, type: 'tel', placeholder: 'e.g. +44 7700 900123',
                    onInput: inp => { err.textContent = C.phoneError(inp.value); inp.setAttribute('aria-invalid', String(!!err.textContent)); ccHint(); } }));
                li.appendChild(err);
            }
            const label = (kind === 'contacts' ? r.name : r.t) || NOUN[kind];
            li.appendChild(btn('mini bad remove', 'Remove', () => removeRow(kind, i), 'Remove ' + label));
            ul.appendChild(li);
        });
        ul.parentElement.querySelector('.add-row').hidden = p[kind].length >= C.LIMITS.rows;
        if (kind === 'allergies') { const none = !p.allergies.some(a => C.has(a.t)); $('no-al-wrap').hidden = !none; }
        if (kind === 'contacts') ccHint();
    }
    function ccHint() {
        $('cc-hint').textContent = cur().contacts.some(c => C.needsCountryCode(c.phone))
            ? 'Tip: start each number with the country code (like +44 or +92) so it works if you are abroad or the person calling is.' : '';
    }
    function rowMsg(kind) {
        let m = $('msg-' + kind);
        if (!m) { m = el('p', 'msg'); m.id = 'msg-' + kind; m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite'); $('rows-' + kind).after(m); }
        return m.id;
    }
    function addRow(kind) {
        const p = cur();
        const blank = { allergies: { t: '', sev: '' }, conditions: { t: '' }, meds: { t: '', dose: '' }, contacts: { name: '', rel: '', phone: '' } }[kind];
        p[kind].push(blank); save(); renderRows(kind);
        const inputs = $('rows-' + kind).querySelectorAll('li:last-child input');
        if (inputs[0]) inputs[0].focus();
    }
    function removeRow(kind, i) {
        const snap = snapshot(), p = cur(), r = p[kind][i];
        const what = (kind === 'contacts' ? r.name : r.t) || '';
        p[kind].splice(i, 1);
        touch(); renderRows(kind);
        show(rowMsg(kind), (what ? '"' + what.trim() + '"' : 'The empty ' + NOUN[kind]) + ' removed.', snap);
        $('rows-' + kind).parentElement.querySelector('.add-row').focus();
    }
    document.querySelectorAll('.add-row').forEach(b => b.addEventListener('click', () => addRow(b.dataset.add)));

    // ---------- lock screen and card settings ----------
    Object.entries(C.SIZES).forEach(([k, s]) => { const o = el('option', null, s.label); o.value = k; $('f-size').appendChild(o); });
    Object.entries(C.LANGS).forEach(([k, l]) => { const o = el('option', null, l.name); o.value = k; $('f-lang').appendChild(o); });
    $('f-size').addEventListener('change', e => {
        const o = cur().out; o.size = e.target.value;
        if (o.size !== 'custom') { o.w = C.SIZES[o.size].w; o.h = C.SIZES[o.size].h; }
        $('f-w').value = o.w; $('f-h').value = o.h;
        $('w-custom').hidden = o.size !== 'custom'; $('size-err').textContent = '';
        save(); scheduleOut();
    });
    ['f-w', 'f-h'].forEach(id => $(id).addEventListener('input', () => {
        const w = Number($('f-w').value), h = Number($('f-h').value);
        const ok = v => Number.isInteger(v) && v >= C.SIZE_MIN && v <= C.SIZE_MAX;
        if (!ok(w) || !ok(h)) { $('size-err').textContent = 'Type a width and a height between ' + C.SIZE_MIN + ' and ' + C.SIZE_MAX + ' pixels, in whole numbers.'; return; }
        $('size-err').textContent = '';
        cur().out.w = w; cur().out.h = h; save(); scheduleOut();
    }));
    document.querySelectorAll('input[name=look]').forEach(r => r.addEventListener('change', () => { cur().out.theme = r.value; save(); scheduleOut(); }));
    $('f-lang').addEventListener('change', e => { cur().out.lang = e.target.value; save(); scheduleOut(); });
    $('f-clock').addEventListener('change', () => drawPreview());

    // ---------- drawing ----------
    const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", Arial, sans-serif';
    const font = (size, bold) => (bold ? '700 ' : '400 ') + size.toFixed(2) + 'px ' + FONT;
    const mctx = document.createElement('canvas').getContext('2d');
    const measure = (t, size, bold) => { mctx.font = font(size, bold); return mctx.measureText(t).width; };
    const THEMES = {
        dark: { bg: ['#1c1c21', '#050506'], panel: 'rgba(255,255,255,.08)', stroke: 'rgba(255,255,255,.2)', band: '#d62828', title: '#fff', name: '#fff', sub: '#dee2e6', label: '#ff9a9a', item: '#f1f3f5', alert: '#ff7070', more: '#adb5bd', updated: '#adb5bd', dot: '#ff8787' },
        light: { bg: ['#fbfbfc', '#e9ecef'], panel: '#ffffff', stroke: '#ced4da', band: '#c92a2a', title: '#fff', name: '#111', sub: '#343a40', label: '#b02525', item: '#212529', alert: '#b02525', more: '#5c636a', updated: '#5c636a', dot: '#c92a2a' }
    };
    function drawLines(ctx, lay, ox, oy, th, u) {
        ctx.textBaseline = 'top';
        lay.lines.forEach(l => {
            if (l.role === 'band') {
                ctx.fillStyle = th.band; ctx.beginPath(); ctx.roundRect(ox, oy + l.y, l.w, l.h, u * 0.35); ctx.fill(); return;
            }
            ctx.font = font(l.size, l.bold); ctx.fillStyle = th[l.role] || th.item;
            const ty = oy + l.y + (l.h - l.size) / 2;
            ctx.fillText(l.t, ox + l.x, ty);
            if (l.dot) { ctx.fillStyle = l.role === 'alert' ? th.alert : th.dot; ctx.beginPath(); ctx.arc(ox + u * 0.32, ty + l.size * 0.55, Math.max(2, l.size * 0.15), 0, Math.PI * 2); ctx.fill(); }
        });
    }
    // The lock screen picture at the phone's exact size.
    function renderWall(p) {
        const W = p.out.w, H = p.out.h, th = THEMES[p.out.theme];
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const box = C.wallBox(W, H), pd = Math.round(box.w * 0.05);
        const lay = C.fit(C.model(p, today, 'all'), { w: box.w - pd * 2, h: box.h - pd * 2 }, measure, { maxU: box.w / 16, minU: box.w / 36 });
        ctx.fillStyle = th.panel; ctx.strokeStyle = th.stroke; ctx.lineWidth = Math.max(2, W / 400);
        ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, lay.height + pd * 2, box.w * 0.045); ctx.fill(); ctx.stroke();
        drawLines(ctx, lay, box.x + pd, box.y + pd, th, lay.u);
        return { cv, lay };
    }
    // One half of the wallet card, at 300 dots per inch.
    function renderFace(p, part) {
        const { w, h, pad } = C.CARD, th = THEMES.light;
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        const lay = C.fit(C.model(p, today, part), { w: w - pad * 2, h: h - pad * 2 }, measure, { maxU: 36, minU: 21 });
        drawLines(ctx, lay, pad, pad, th, lay.u);
        return { cv, lay };
    }
    function cardImage(front, back) {
        const { w, h } = C.CARD, cv = document.createElement('canvas'); cv.width = w * 2 + 6; cv.height = h + 6;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(front, 3, 3); ctx.drawImage(back, w + 3, 3);
        ctx.strokeStyle = '#495057'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, cv.width - 3, cv.height - 3);
        ctx.setLineDash([18, 12]); ctx.beginPath(); ctx.moveTo(w + 3, 3); ctx.lineTo(w + 3, h + 3); ctx.stroke();
        return cv;
    }

    let wall = null, front = null, back = null, outTimer = 0;
    function scheduleOut() { clearTimeout(outTimer); outTimer = setTimeout(renderOutputs, 120); }
    function cutText(where, lay) {
        if (!lay.fits) return 'Some text is still cut off at the bottom of the ' + where + '. Shorten the longest items.';
        if (lay.cut.length) return 'Left off the ' + where + ' because it did not fit: ' + lay.cut.join('; ') + '. Put the most important first, or shorten the wording.';
        return '';
    }
    function renderOutputs() {
        clearTimeout(outTimer);
        const p = cur(), empty = C.isEmpty(p);
        $('out-empty').hidden = !empty; $('out-ready').hidden = empty;
        $('card-sec').hidden = empty; $('text-sec').hidden = empty;
        const todo = $('todo'); todo.textContent = '';
        if (empty) { wall = front = back = null; return; }
        C.missing(p).forEach(m => todo.appendChild(el('li', null, m)));
        wall = renderWall(p);
        const wn = cutText('lock screen', wall.lay);
        $('wall-fit').textContent = wn || 'Everything fits on the lock screen.';
        $('wall-fit').className = 'fitnote ' + (wn ? 'warn' : 'ok');
        drawPreview();
        front = renderFace(p, 'front'); back = renderFace(p, 'back');
        $('card-front').src = front.cv.toDataURL('image/png'); $('card-back').src = back.cv.toDataURL('image/png');
        const cn = [cutText('front of the card', front.lay), cutText('back of the card', back.lay)].filter(Boolean).join(' ');
        $('card-fit').textContent = cn || 'Everything fits on the card.';
        $('card-fit').className = 'fitnote ' + (cn ? 'warn' : 'ok');
        $('plain').textContent = C.plainText(p, today);
        $('email-text').href = C.mailto(p, today);
    }
    function drawPreview() {
        if (!wall) return;
        const pv = $('wall-preview'), src = wall.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
        const cssW = 260, scale = cssW / src.width;
        pv.width = Math.round(cssW * dpr); pv.height = Math.round(src.height * scale * dpr);
        pv.style.aspectRatio = src.width + ' / ' + src.height;
        const ctx = pv.getContext('2d');
        ctx.drawImage(src, 0, 0, pv.width, pv.height);
        if ($('f-clock').checked) {
            const W = pv.width, H = pv.height, dark = cur().out.theme === 'dark';
            ctx.fillStyle = dark ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.45)';
            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.font = '500 ' + (W * 0.045) + 'px ' + FONT; ctx.fillText('Monday 19 October', W / 2, H * 0.095);
            ctx.font = '600 ' + (W * 0.2) + 'px ' + FONT; ctx.fillText('9:41', W / 2, H * 0.205);
            [0.2, 0.8].forEach(x => { ctx.beginPath(); ctx.arc(W * x, H * 0.925, W * 0.065, 0, Math.PI * 2); ctx.fill(); });
            ctx.textAlign = 'left';
        }
        pv.setAttribute('aria-label', 'Lock screen preview: ' + C.plainText(cur(), today).replace(/\n+/g, '. '));
    }

    // ---------- saving the pictures, printing, sharing ----------
    function download(name, blob) {
        const url = URL.createObjectURL(blob), a = el('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    const toBlob = cv => new Promise(res => cv.toBlob(res, 'image/png'));
    $('save-wall').addEventListener('click', async () => {
        renderOutputs(); if (!wall) return;
        download(C.fileName('emergency-lock-screen', cur()), await toBlob(wall.cv));
        show('out-msg', 'Picture saved (' + cur().out.w + ' × ' + cur().out.h + '). Now set it as your lock screen.');
    });
    const canShareFiles = () => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] })); } catch (e) { return false; } };
    $('share-wall').hidden = !canShareFiles();
    $('share-wall').addEventListener('click', async () => {
        renderOutputs(); if (!wall) return;
        const file = new File([await toBlob(wall.cv)], C.fileName('emergency-lock-screen', cur()), { type: 'image/png' });
        try { await navigator.share({ files: [file], title: 'Emergency lock screen' }); } catch (e) { if (e && e.name !== 'AbortError') show('out-msg', 'Sharing did not work here. Use "Save the picture" instead.'); }
    });
    $('save-card').addEventListener('click', async () => {
        renderOutputs(); if (!front) return;
        download(C.fileName('emergency-wallet-card', cur()), await toBlob(cardImage(front.cv, back.cv)));
        show('text-msg', 'Card saved as a picture: front on the left, back on the right.');
    });
    $('print-card').addEventListener('click', () => {
        renderOutputs(); if (!front) return;
        const area = $('print-area'); area.textContent = '';
        area.appendChild(el('p', 'print-h', 'Emergency wallet card: ' + cur().name.trim()));
        const sheet = el('div', 'print-card');
        [front, back].forEach((f, i) => { const img = el('img'); img.src = f.cv.toDataURL('image/png'); img.alt = i ? 'Back' : 'Front'; sheet.appendChild(img); });
        area.appendChild(sheet);
        area.appendChild(el('p', 'print-tip', 'Cut along the outer line. Fold on the dashed line so the printing is on the outside, then glue or tape the halves together. Keep it next to your bank card.'));
        setTimeout(() => window.print(), 60);
    });
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
        return Promise.resolve(fallbackCopy(text));
    }
    function fallbackCopy(text) {
        const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
        document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); return ok;
    }
    $('copy-text').addEventListener('click', () => copyText(C.plainText(cur(), today)).then(ok =>
        show('text-msg', ok ? 'Copied. Paste it into your phone\'s Medical ID.' : 'Could not copy here. Select the text above and copy it.')));

    // ---------- backup, delete, start over ----------
    $('backup').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(Object.assign({ app: SLUG, saved: today }, state), null, 1)], { type: 'application/json' });
        download('emergency-medical-info-backup-' + today + '.json', blob);
        show('set-msg', 'Backup saved with ' + state.people.length + (state.people.length === 1 ? ' card.' : ' cards.'));
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', e => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        if (f.size > 1e6) return show('set-msg', 'That file is too big to be a backup from this app.');
        const r = new FileReader();
        r.onload = () => {
            let s = null; try { s = C.validate(JSON.parse(r.result)); } catch (err) { s = null; }
            if (!s) return show('set-msg', 'That file is not a backup from this app, so nothing was changed.');
            const snap = snapshot(); state = s; save(); renderAll();
            show('set-msg', 'Backup restored: ' + s.people.length + (s.people.length === 1 ? ' card.' : ' cards.'), snap);
        };
        r.onerror = () => show('set-msg', 'That file could not be read.');
        r.readAsText(f);
    });
    $('del-person').addEventListener('click', () => {
        const snap = snapshot(), p = cur(), name = C.has(p.name) ? p.name.trim() + "'s card" : 'The card';
        if (state.people.length > 1) { state.people = state.people.filter(x => x.id !== p.id); state.cur = state.people[0].id; }
        else { const b = C.blankPerson(''); b.out = Object.assign({}, p.out); state.people = [b]; state.cur = b.id; }
        save(); renderAll(); show('set-msg', name + ' deleted.', snap);
    });
    $('del-all').addEventListener('click', () => {
        const snap = snapshot(); state = C.emptyState(); save(); renderAll();
        show('set-msg', 'Everything deleted. You can start again.', snap);
    });

    function renderAll() { renderPeople(); fillForm(); KINDS.forEach(renderRows); renderOutputs(); }
    // A new day: the age is worked out again.
    document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayIso() !== today) { today = C.todayIso(); renderAll(); } });

    state = load();
    save();
    renderAll();
    window.__ice = { get state() { return state; }, render: renderAll, renderOutputs, get wall() { return wall; }, get front() { return front; }, get back() { return back; } };
})();
