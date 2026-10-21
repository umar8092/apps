// School Fee and Tuition Payment Tracker: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.FeeCore;
    const SLUG = 'school-fee-and-tuition-payment-tracker-for-parents';
    const KEY = SLUG + '.state';
    const TITLE = 'School Fee and Tuition Payment Tracker for Parents';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };

    let canSave = true, state, today = C.todayIso();
    let editing = null;                 // id of the fee in the form, or null for a new one
    const panel = {};                   // 'f' + fee id -> 'pay' | 'list' | 'change';  'c' + child id -> 'stmt' | 'edit'
    const payEdit = {};                 // fee id -> payment id being edited
    const stmtYear = {};                // child id -> year shown in Statement
    const draftPhoto = {};              // fee id -> { blob, url } chosen in the payment form, or 'remove'

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved records could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeForm(true); commit(); }
    function commit() { save(); render(); }
    // a different set of records: close every open panel
    function resetPanels() { [panel, payEdit, stmtYear].forEach(o => Object.keys(o).forEach(k => delete o[k])); Object.keys(draftPhoto).forEach(k => dropDraft(Number(k))); }

    // ---------- receipt photos, kept in this browser (IndexedDB) ----------
    const DB = SLUG + '.photos';
    let dbP = null;
    function db() {
        if (!dbP) dbP = new Promise((res, rej) => {
            try {
                const r = indexedDB.open(DB, 1);
                r.onupgradeneeded = () => r.result.createObjectStore('photos');
                r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
            } catch (e) { rej(e); }
        });
        return dbP;
    }
    function store(mode, fn) {
        return db().then(d => new Promise((res, rej) => {
            const tx = d.transaction('photos', mode), req = fn(tx.objectStore('photos'));
            tx.oncomplete = () => res(req ? req.result : undefined); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
        }));
    }
    const photoPut = (id, blob) => store('readwrite', s => s.put(blob, id));
    const photoGet = id => store('readonly', s => s.get(id));
    const photoKeys = () => store('readonly', s => s.getAllKeys());
    const photoDel = id => store('readwrite', s => s.delete(id));
    // remove photos that no saved payment points to (deleted payments, after their Undo has gone)
    function prunePhotos() { const keep = C.photoIds(state); photoKeys().then(keys => keys.forEach(k => { if (!keep.has(k)) photoDel(k); })).catch(() => {}); }
    let pruneTimer = 0;
    // shrinks a photo to at most 1400 px so it takes little space
    function shrink(file) {
        return new Promise((res, rej) => {
            const url = URL.createObjectURL(file), img = new Image();
            img.onload = () => {
                const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
                const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
                const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                c.toBlob(b => (b ? res(b) : rej(new Error('no image'))), 'image/jpeg', 0.75);
            };
            img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('not an image')); };
            img.src = url;
        });
    }
    const blobToData = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
    function dataToBlob(s) {
        const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(s || ''); if (!m) return null;
        const bin = atob(m[2]), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        return new Blob([a], { type: m[1] });
    }

    // ---------- messages with Undo ----------
    const MSGS = ['list-msg', 'form-msg', 'set-msg'];
    const timers = {};
    function show(id, text, undoSnap, extra) {
        const box = $(id); if (!box) return;
        MSGS.forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) box.appendChild(btn('undo', 'Undo', () => { restoreSnap(undoSnap); show(id, 'Undone.'); }));
        if (extra) box.appendChild(extra);
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
        if (undoSnap) { clearTimeout(pruneTimer); pruneTimer = setTimeout(prunePhotos, 16000); }
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const M = c => C.fmtMoney(c, state.cur, state.style);
    const kid = id => state.children.find(c => c.id === id);
    function findFee(id) { for (const c of state.children) { const f = c.fees.find(x => x.id === id); if (f) return { child: c, fee: f }; } return null; }
    const dayWord = d => (d === today ? 'today' : d === C.addDays(today, -1) ? 'yesterday' : C.fmtDateY(d));
    const inDays = n => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days');
    const dueText = d => 'the ' + C.ordinal(d) + (d >= 29 ? ' (or the last day)' : '');
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
    function field(labelText, inputEl, err) {
        const w = el('div', 'fld'); const l = el('label', null, labelText); l.htmlFor = inputEl.id; w.append(l, inputEl); if (err) w.appendChild(err); return w;
    }
    function input(id, type, placeholder, extra) {
        const i = el('input'); i.id = id; i.type = type; i.autocomplete = 'off'; if (placeholder) i.placeholder = placeholder; Object.assign(i, extra || {}); return i;
    }
    function moneyInput(id, placeholder) {
        const wrap = el('div', 'inline money');
        const cur = el('span', 'unit pre cur', state.cur); cur.setAttribute('aria-hidden', 'true'); cur.hidden = !state.cur;
        const i = input(id, 'text', placeholder, { inputMode: 'decimal', maxLength: 16 });
        wrap.append(cur, i); return { wrap, i };
    }
    const errP = id => { const p = el('p', 'err'); p.id = id; p.setAttribute('role', 'alert'); return p; };
    function monthYearPick(id, ym, fromYear, toYear) {
        const ms = el('select'); ms.id = id + '-m'; C.MONTHS.forEach((n, i) => { const o = el('option', null, n); o.value = String(i + 1).padStart(2, '0'); ms.appendChild(o); });
        const ys = el('select'); ys.id = id + '-y'; for (let y = fromYear; y <= toYear; y++) { const o = el('option', null, String(y)); o.value = String(y); ys.appendChild(o); }
        ms.value = ym.slice(5); ys.value = ym.slice(0, 4);
        const row = el('div', 'two my');
        const a = el('div'), b = el('div');
        const la = el('label', 'sr', 'Month'); la.htmlFor = ms.id; const lb = el('label', 'sr', 'Year'); lb.htmlFor = ys.id;
        a.append(la, ms); b.append(lb, ys); row.append(a, b);
        return { row, get: () => ys.value + '-' + ms.value, ms, ys };
    }
    // "6,000 every 3 months, due on the 1st of Sep, Dec, Mar and Jun"
    function feeSchedule(fee) {
        const ym = C.ymOf(today) < fee.start ? fee.start : C.ymOf(today);
        const a = M(C.amountFor(fee, ym)), m0 = Number(fee.start.slice(5)) - 1;
        if (fee.every === 0) return a + ' only once, due on ' + C.fmtDateY(C.dueDateOf(fee.start, fee.due)) + '.';
        if (fee.every === 1) {
            const sk = fee.skip.map(n => C.MONTHS[n - 1].slice(0, 3));
            return a + ' every month, due on ' + dueText(fee.due) + '.' + (sk.length ? ' No fee in ' + sk.join(', ') + '.' : '');
        }
        if (fee.every === 12) return a + ' once a year, due on the ' + C.ordinal(fee.due) + ' of ' + C.MONTHS[m0] + '.';
        const ms = []; for (let k = 0; k < 12 / fee.every; k++) ms.push(C.MONTHS[(m0 + k * fee.every) % 12].slice(0, 3));
        return a + ' ' + C.EVERY[fee.every] + ', due on the ' + C.ordinal(fee.due) + ' of ' + ms.slice(0, -1).join(', ') + ' and ' + ms[ms.length - 1] + '.';
    }

    // ---------- render ----------
    function render() {
        today = C.todayIso();
        const has = state.children.length > 0;
        $('app').classList.toggle('setup', !has);
        $('due').hidden = !has; $('list').hidden = !has;
        if (has) { renderDue(); renderList(); }
        $('open-form').hidden = !has || !$('form').hidden;
        $('form-h').hidden = !$('form').hidden ? false : has;
        document.querySelectorAll('.cur').forEach(c => { c.textContent = state.cur; c.hidden = !state.cur; });
        $('s-cur').value = state.cur; $('s-style').value = state.style;
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('School fees') + '&body=' + encodeURIComponent(C.summaryText(state, today));
        childOptions();
        preview();
    }

    function renderDue() {
        const s = C.familySummary(state, today), body = $('due-body'); body.textContent = '';
        const mname = C.MONTHS[Number(s.ym.slice(5)) - 1];
        const p = el('p', 'big');
        if (s.monthLeft) { p.appendChild(el('strong', null, M(s.monthLeft))); p.appendChild(document.createTextNode(' left to pay in ' + mname)); }
        else p.textContent = 'Nothing left to pay in ' + mname + '.';
        body.appendChild(p);
        if (s.late.length) {
            body.appendChild(el('h3', null, 'Late'));
            const ul = el('ul', 'owing');
            s.late.forEach(o => {
                const li = el('li');
                li.appendChild(el('b', null, o.child.name + ': ' + o.fee.name + ', ' + M(o.owed)));
                li.appendChild(el('span', null, (o.count > 1 ? 'Since ' + o.from.label + ' (' + o.count + ' fees)' : o.from.label) + ', ' + (o.late > 0 ? C.plural(o.late, 'day', 'days') + ' late' : 'due today')));
                ul.appendChild(li);
            });
            body.appendChild(ul);
        }
        if (s.soon.length) {
            body.appendChild(el('h3', null, 'Due in the next ' + C.SOON_DAYS + ' days'));
            const ul = el('ul', 'owing soon');
            s.soon.forEach(o => {
                const li = el('li');
                li.appendChild(el('b', null, o.child.name + ': ' + o.fee.name + ', ' + M(o.amt) + (o.part ? ' left' : '')));
                li.appendChild(el('span', null, o.row.label + ', due ' + C.fmtDate(o.row.due) + ' (' + inDays(o.days) + ')'));
                ul.appendChild(li);
            });
            body.appendChild(ul);
        }
        if (!s.late.length && !s.soon.length) body.appendChild(el('p', 'state good', 'Nothing is late and nothing is due in the next ' + C.SOON_DAYS + ' days.'));
    }

    function renderList() {
        const ul = $('boxes'); ul.textContent = '';
        state.children.forEach(c => ul.appendChild(childBox(c)));
    }

    function childBox(c) {
        const st = C.childStatus(c, today), li = el('li', 'box' + (st.owed ? ' owes' : '')); li.dataset.id = String(c.id);
        const top = el('div', 'box-top');
        top.appendChild(el('h3', 'box-name', c.name));
        top.appendChild(el('span', 'badge ' + (st.owed ? 'bad' : 'good'), st.owed ? 'Owes ' + M(st.owed) : c.fees.length ? 'All paid' : 'No fees yet'));
        li.appendChild(top);
        if (c.school) li.appendChild(el('p', 'child-sub', c.school));
        const year = Number(today.slice(0, 4)), ys = C.yearSummary(c, year, today);
        if (ys.total) {
            const y = el('p', 'year');
            y.appendChild(el('b', null, year + ': ' + M(ys.total) + ' in fees. '));
            const bits = [M(ys.paid) + ' paid']; if (ys.owed) bits.push(M(ys.owed) + ' owed'); if (ys.toCome) bits.push(M(ys.toCome) + ' still to come');
            y.appendChild(document.createTextNode(bits.join(', ') + '.'));
            li.appendChild(y);
        }
        if (c.fees.length) { const fl = el('ul', 'fees'); c.fees.forEach(f => fl.appendChild(feeBox(c, f))); li.appendChild(fl); }
        else li.appendChild(el('p', 'empty', 'No fees yet. Tap "+ Add a fee".'));
        const g = el('div', 'child-btns'), p = panel['c' + c.id];
        g.appendChild(btn('mini', '+ Add a fee', () => openForm(null, c.id), 'Add a fee for ' + c.name));
        [['stmt', 'Statement'], ['edit', 'Edit child']].forEach(([k, label]) => {
            const b = btn('mini' + (p === k ? ' on' : ''), label, () => togglePanel('c' + c.id, k), label + ': ' + c.name); b.setAttribute('aria-expanded', String(p === k)); g.appendChild(b);
        });
        li.appendChild(g);
        if (p === 'stmt') li.appendChild(stmtPanel(c));
        if (p === 'edit') li.appendChild(childForm(c));
        return li;
    }

    function feeBox(c, f) {
        const lg = C.ledger(f, today), off = lg.stopped && !lg.owed;
        const li = el('li', 'fee' + (lg.owed ? ' owes' : '') + (off ? ' off' : '')); li.dataset.fee = String(f.id);
        li.appendChild(el('h4', 'fee-name', f.name));
        li.appendChild(el('p', 'fee-sub', feeSchedule(f) + (f.end ? ' Stopped after ' + C.fmtMonth(f.end) + '.' : '')));
        if (lg.owed) {
            const n = lg.unpaid.length;
            li.appendChild(el('p', 'line bad', 'Owes ' + M(lg.owed) + (f.every === 0 ? '' : n > 1 ? ' since ' + lg.firstUnpaid.label + ' (' + n + ' fees)' : ' for ' + lg.firstUnpaid.label) + (lg.lateDays > 0 ? ', ' + C.plural(lg.lateDays, 'day', 'days') + ' late.' : ', due today.')));
        }
        if (lg.notStarted) li.appendChild(el('p', 'line', 'Starts in ' + C.fmtMonth(f.start) + '.'));
        if (f.every === 0) { if (!lg.owed) li.appendChild(el('p', 'line' + (lg.rows[0].left === 0 ? ' good' : ''), lg.rows[0].left === 0 ? 'Paid.' : 'Not due yet.')); }
        else if (!lg.notStarted || lg.upTo) li.appendChild(el('p', 'line', lg.upTo ? 'Paid up to ' + C.fmtMonth(lg.upTo.last) + '.' : 'Nothing paid yet.'));
        if (lg.ahead && !off) li.appendChild(el('p', 'line good', M(lg.ahead) + ' paid ahead.'));
        if (lg.over) li.appendChild(el('p', 'sub-line', 'Paid ' + M(lg.over) + ' more than the fee.'));
        if (lg.next) li.appendChild(el('p', 'sub-line', 'Next: ' + lg.next.label + ', ' + (lg.next.paid ? M(lg.next.left) + ' of ' + M(lg.next.amt) + ' left' : M(lg.next.amt)) + ', due ' + C.fmtDate(lg.next.due) + (lg.next.due.slice(0, 4) !== today.slice(0, 4) ? ' ' + lg.next.due.slice(0, 4) : '') + '.'));
        const key = 'f' + f.id, p = panel[key];
        const rec = btn('primary rec', p === 'pay' ? 'Close' : 'Record a payment', () => togglePanel(key, 'pay'), (p === 'pay' ? 'Close the payment form for ' : 'Record a payment for ') + c.name + ', ' + f.name);
        rec.setAttribute('aria-expanded', String(p === 'pay'));
        li.appendChild(rec);
        const g = el('div', 'fee-btns');
        [['list', 'Payments (' + f.payments.length + ')'], ['change', 'Change or stop']].forEach(([k, label]) => {
            const b = btn('mini' + (p === k ? ' on' : ''), label, () => togglePanel(key, k), label + ': ' + c.name + ', ' + f.name); b.setAttribute('aria-expanded', String(p === k)); g.appendChild(b);
        });
        li.appendChild(g);
        if (p === 'pay') li.appendChild(payForm(c, f, lg));
        if (p === 'list') li.appendChild(payList(c, f));
        if (p === 'change') li.appendChild(changePanel(c, f));
        return li;
    }
    const boxSel = key => (key[0] === 'f' ? '#boxes li[data-fee="' + key.slice(1) + '"]' : '#boxes li[data-id="' + key.slice(1) + '"]');
    function togglePanel(key, k) {
        panel[key] = panel[key] === k ? null : k;
        if (key[0] === 'f') { const id = Number(key.slice(1)); delete payEdit[id]; dropDraft(id); }
        render();
        const sel = boxSel(key), first = document.querySelector(sel + ' .panel input:not([type=file]), ' + sel + ' .panel select, ' + sel + ' .panel button');
        if (panel[key] && first) first.focus(); else focusIn(key, k === 'pay' ? '.rec' : '.mini');
    }
    function focusIn(key, sel) { const b = document.querySelector(boxSel(key) + ' ' + sel); if (b) b.focus(); }
    function dropDraft(id) { const d = draftPhoto[id]; if (d && d.url) URL.revokeObjectURL(d.url); delete draftPhoto[id]; }

    // ---------- record a payment ----------
    function payForm(c, f, lg) {
        const form = el('form', 'panel'); form.noValidate = true;
        const editP = payEdit[f.id] ? f.payments.find(p => p.id === payEdit[f.id]) : null;
        form.appendChild(el('h4', null, editP ? 'Edit the payment of ' + C.fmtDateY(editP.d) : 'Record a payment'));
        const id = 'p' + f.id;
        const d = input(id + '-d', 'date', '', { max: today }); d.value = editP ? editP.d : today;
        const ed = errP(id + '-ed'); d.setAttribute('aria-describedby', ed.id);
        form.appendChild(field('Date paid', d, ed));
        const suggest = lg.owed || (lg.next ? lg.next.left : 0);
        const amt = moneyInput(id + '-a', 'e.g. ' + C.group(Math.floor((suggest || C.amountFor(f, C.ymOf(today))) / 100), state.style));
        if (editP) amt.i.value = C.centsToInput(editP.amt);
        const ea = errP(id + '-ea'); amt.i.setAttribute('aria-describedby', ea.id);
        const aw = el('div', 'fld'); const al = el('label', null, 'Amount'); al.htmlFor = amt.i.id; aw.append(al, amt.wrap);
        if (!editP && suggest) aw.appendChild(btn('chip', (lg.owed ? 'Fill in what is owed: ' : 'Fill in the next fee: ') + M(suggest), () => { amt.i.value = C.centsToInput(suggest); ea.textContent = ''; amt.i.removeAttribute('aria-invalid'); }));
        aw.appendChild(ea); form.appendChild(aw);
        // note
        const note = input(id + '-n', 'text', 'e.g. receipt no. 4471', { maxLength: C.LIMITS.note });
        const nw = el('div', 'opt'); nw.appendChild(field('Note', note));
        const ob = btn('link', '+ Add a note (optional)', () => { nw.hidden = false; ob.hidden = true; note.focus(); });
        if (editP && editP.note) { note.value = editP.note; ob.hidden = true; } else nw.hidden = true;
        form.append(ob, nw);
        // receipt photo
        const file = input(id + '-ph', 'file', '', { accept: 'image/*' }); file.hidden = true; file.setAttribute('aria-label', 'Photo of the receipt');
        const pw = el('div', 'photo-pick'), pe = errP(id + '-pe');
        const draft = draftPhoto[f.id], hasOld = editP && editP.photo && draft !== 'remove';
        if (draft && draft !== 'remove') {
            const im = el('img'); im.src = draft.url; im.alt = 'The receipt photo you picked';
            pw.append(im, el('span', null, 'Photo added.'), btn('link', 'Remove photo', () => { dropDraft(f.id); render(); focusIn('f' + f.id, '.panel .link'); }));
        } else if (hasOld) {
            pw.append(el('span', null, 'Receipt photo saved.'), btn('link', 'Remove photo', () => { draftPhoto[f.id] = 'remove'; render(); focusIn('f' + f.id, '.panel .photo-pick .link'); }));
        } else if (photosOk) pw.appendChild(btn('link', '+ Add a photo of the receipt (optional)', () => file.click()));
        file.addEventListener('change', () => {
            const fl = file.files[0]; file.value = ''; if (!fl) return;
            pe.textContent = '';
            shrink(fl).then(blob => { dropDraft(f.id); draftPhoto[f.id] = { blob, url: URL.createObjectURL(blob) }; keepForm(f.id, () => render()); },
                () => { pe.textContent = 'That photo could not be opened. Try a JPG or PNG photo.'; });
        });
        form.append(pw, file, pe);
        const rb = el('div', 'row-btns');
        const sb = el('button', 'primary', editP ? 'Save changes' : 'Save payment'); sb.type = 'submit';
        rb.append(sb, btn('secondary', 'Cancel', () => togglePanel('f' + f.id, 'pay')));
        form.appendChild(rb);
        form.addEventListener('submit', ev => {
            ev.preventDefault(); ed.textContent = ''; ea.textContent = ''; d.removeAttribute('aria-invalid'); amt.i.removeAttribute('aria-invalid');
            const x = { d: d.value, amt: C.readMoney(amt.i.value), note: C.cleanText(note.value, C.LIMITS.note) };
            const e = C.checkPayment(f, x, today);
            if (e.d) { ed.textContent = e.d; d.setAttribute('aria-invalid', 'true'); }
            if (e.amt) { ea.textContent = amt.i.value.trim() && Number.isNaN(x.amt) ? 'Type the amount as a number, such as 8000 or 8000.50.' : e.amt; amt.i.setAttribute('aria-invalid', 'true'); }
            if (e.d || e.amt) { (e.d ? d : amt.i).focus(); return; }
            const snap = snapshot(), dr = draftPhoto[f.id];
            let p;
            if (editP) { Object.assign(editP, x); p = editP; } else { p = Object.assign({ id: state.nextId++, photo: '' }, x); f.payments.push(p); }
            if (dr === 'remove') p.photo = '';
            const finish = photoNote => {
                panel['f' + f.id] = null; delete payEdit[f.id]; dropDraft(f.id);
                commit();
                const lg2 = C.ledger(f, today);
                show('list-msg', (editP ? 'Payment changed: ' : 'Payment saved: ') + M(x.amt) + ' ' + dayWord(x.d) + ' for ' + c.name + '\'s ' + f.name + '. ' +
                    (lg2.owed ? 'Still owes ' + M(lg2.owed) + '.' : f.every === 0 ? 'Paid.' : lg2.upTo ? 'Paid up to ' + C.fmtMonth(lg2.upTo.last) + '.' : '') + (photoNote || ''), snap);
                focusIn('f' + f.id, '.rec');
            };
            if (dr && dr !== 'remove') {
                const pid = 'ph' + state.nextId++;
                photoPut(pid, dr.blob).then(() => { p.photo = pid; finish(''); }, () => finish(' The photo could not be saved on this device.'));
            } else finish('');
        });
        return form;
    }
    // re-render without losing what was typed in an open payment form
    function keepForm(feeId, fn) {
        const sel = '#boxes li[data-fee="' + feeId + '"] .panel', vals = {};
        document.querySelectorAll(sel + ' input:not([type=file])').forEach(i => { vals[i.id] = i.value; });
        const noteOpen = document.querySelector(sel + ' .opt') && !document.querySelector(sel + ' .opt').hidden;
        fn();
        Object.keys(vals).forEach(k => { const i = $(k); if (i) i.value = vals[k]; });
        if (noteOpen) { const o = document.querySelector(sel + ' .opt'), l = document.querySelector(sel + ' > .link'); if (o) o.hidden = false; if (l) l.hidden = true; }
        const r = document.querySelector(sel + ' .photo-pick .link'); if (r) r.focus();
    }

    function payList(c, f) {
        const w = el('div', 'panel'); w.appendChild(el('h4', null, 'Payments'));
        const ps = C.sortedPayments(f).reverse();
        if (!ps.length) { w.appendChild(el('p', 'empty', 'No payments yet. Tap "Record a payment".')); return w; }
        const cv = C.coverage(f, today), ul = el('ul', 'pays');
        ps.forEach(p => {
            const li = el('li');
            const tx = el('div', 'pay-text');
            tx.appendChild(el('b', null, C.fmtDateY(p.d) + ': ' + M(p.amt)));
            tx.appendChild(el('span', null, 'For ' + (C.coverText(cv[p.id], state.cur, state.style) || f.name) + '.' + (p.note ? ' ' + p.note : '')));
            li.appendChild(tx);
            const b = el('div', 'pay-btns');
            if (p.photo) b.appendChild(btn('mini', 'Photo', () => openPhoto(c, f, p), 'Receipt photo of ' + C.fmtDateY(p.d)));
            b.appendChild(btn('mini', 'Edit', () => { panel['f' + f.id] = 'pay'; payEdit[f.id] = p.id; dropDraft(f.id); render(); focusIn('f' + f.id, '.panel input'); }, 'Edit the payment of ' + C.fmtDateY(p.d)));
            b.appendChild(btn('mini del', 'Delete', () => {
                const snap = snapshot(); f.payments = f.payments.filter(x => x.id !== p.id); commit();
                show('list-msg', 'Deleted the payment of ' + M(p.amt) + ' on ' + C.fmtDateY(p.d) + '.', snap);
                focusIn('f' + f.id, '.mini');
            }, 'Delete the payment of ' + C.fmtDateY(p.d)));
            if (!p.photo) b.classList.add('two-only');
            li.appendChild(b); ul.appendChild(li);
        });
        w.appendChild(ul); return w;
    }

    // ---------- change, skip months, stop ----------
    function changePanel(c, f) {
        const w = el('div', 'panel'); w.appendChild(el('h4', null, 'Change or stop: ' + f.name));
        const id = 'g' + f.id, y0 = Number(f.start.slice(0, 4)), y1 = Number(today.slice(0, 4)) + 2;
        if (f.every !== 0) {
            // new amount from a month
            const fa = el('form'); fa.noValidate = true;
            fa.appendChild(el('h5', null, 'The fee changes'));
            const nextYm = C.addMonths(C.ymOf(today), 1) > f.start ? C.addMonths(C.ymOf(today), 1) : C.addMonths(f.start, f.every);
            const pick = monthYearPick(id + '-from', nextYm, y0, Math.max(y1, Number(nextYm.slice(0, 4))));
            const pl = el('p', 'label-like', 'From'); fa.append(pl, pick.row);
            const amt = moneyInput(id + '-a', 'e.g. ' + C.group(Math.floor(C.amountFor(f, C.ymOf(today)) / 100), state.style));
            const er = errP(id + '-e'); amt.i.setAttribute('aria-describedby', er.id);
            const aw = el('div', 'fld'); const al = el('label', null, 'New amount'); al.htmlFor = amt.i.id; aw.append(al, amt.wrap, er); fa.appendChild(aw);
            if (f.amts.length > 1) {
                fa.appendChild(el('p', 'sub-line', 'Amounts so far:'));
                const ul = el('ul', 'rents'); f.amts.forEach(r => ul.appendChild(el('li', null, 'From ' + C.fmtMonth(r.from) + ': ' + M(r.amt)))); fa.appendChild(ul);
            }
            const sb = el('button', 'primary', 'Save the new amount'); sb.type = 'submit'; const rb = el('div', 'row-btns'); rb.appendChild(sb); fa.appendChild(rb);
            fa.addEventListener('submit', ev => {
                ev.preventDefault(); er.textContent = ''; amt.i.removeAttribute('aria-invalid');
                const from = pick.get(), a = C.readMoney(amt.i.value), e = C.checkChange(f, from, a);
                if (e) { er.textContent = amt.i.value.trim() && Number.isNaN(a) ? 'Type the new fee as a number, such as 9000.' : e; amt.i.setAttribute('aria-invalid', 'true'); amt.i.focus(); return; }
                const snap = snapshot(); C.setAmount(f, from, a); panel['f' + f.id] = null; commit();
                show('list-msg', c.name + '\'s ' + f.name + ' is ' + M(a) + ' from ' + C.fmtMonth(from) + '. Earlier months keep the old fee.', snap);
                focusIn('f' + f.id, '.rec');
            });
            w.appendChild(fa);
        }
        if (f.every === 1) {
            // holiday months
            const fs = el('form'); fs.noValidate = true; fs.appendChild(el('hr', 'sep'));
            fs.appendChild(el('h5', null, 'Months with no fee'));
            fs.appendChild(el('p', 'hint', 'For example June and July for a van in the summer holidays. They are skipped every year.'));
            const g = el('div', 'skip-grid'), boxes = [];
            C.MONTHS.forEach((n, i) => {
                const wrap = el('div', 'check'), cb = input(id + '-s' + (i + 1), 'checkbox'); cb.checked = f.skip.includes(i + 1);
                const l = el('label', null, n.slice(0, 3)); l.htmlFor = cb.id; l.setAttribute('aria-label', n);
                wrap.append(cb, l); g.appendChild(wrap); boxes.push(cb);
            });
            fs.appendChild(g);
            const es = errP(id + '-es'); fs.appendChild(es);
            const sb = el('button', 'secondary', 'Save these months'); sb.type = 'submit'; const rb = el('div', 'row-btns'); rb.appendChild(sb); fs.appendChild(rb);
            fs.addEventListener('submit', ev => {
                ev.preventDefault(); es.textContent = '';
                const sk = boxes.map((b, i) => (b.checked ? i + 1 : 0)).filter(Boolean);
                if (sk.length === 12) { es.textContent = 'At least one month must have the fee. To end the fee, use "Stop this fee".'; return; }
                const snap = snapshot(); f.skip = sk; panel['f' + f.id] = null; commit();
                show('list-msg', sk.length ? 'No ' + f.name + ' in ' + sk.map(n => C.MONTHS[n - 1]).join(', ') + ', every year.' : f.name + ' is charged every month.', snap);
                focusIn('f' + f.id, '.rec');
            });
            w.appendChild(fs);
        }
        if (f.every !== 0) {
            // stop
            const fx = el('form'); fx.noValidate = true; fx.appendChild(el('hr', 'sep'));
            fx.appendChild(el('h5', null, f.end ? 'Stopped' : 'Stop this fee'));
            const ex = errP(id + '-ex');
            if (f.end) {
                fx.appendChild(el('p', 'sub-line', 'The last fee was for ' + C.fmtMonth(f.end) + '. No more ' + f.name + ' after that.'));
                const rb = el('div', 'row-btns');
                rb.appendChild(btn('secondary', 'Start it again', () => {
                    const snap = snapshot(); f.end = ''; panel['f' + f.id] = null; commit();
                    show('list-msg', c.name + '\'s ' + f.name + ' is running again.', snap); focusIn('f' + f.id, '.rec');
                }));
                fx.appendChild(rb);
            } else {
                fx.appendChild(el('p', 'hint', 'For example when ' + c.name + ' leaves the van or the school. Pick the last month that is paid for.'));
                const pick = monthYearPick(id + '-end', C.ymOf(today) < f.start ? f.start : C.ymOf(today), y0, Math.max(y1, Number(f.start.slice(0, 4)) + 1));
                fx.append(el('p', 'label-like', 'Last month'), pick.row, ex);
                const sb = el('button', 'secondary', 'Stop this fee'); sb.type = 'submit'; const rb = el('div', 'row-btns'); rb.appendChild(sb); fx.appendChild(rb);
                fx.addEventListener('submit', ev => {
                    ev.preventDefault(); ex.textContent = '';
                    const ym = pick.get(), e = C.checkStop(f, ym);
                    if (e) { ex.textContent = e; pick.ms.focus(); return; }
                    const snap = snapshot(); f.end = ym; panel['f' + f.id] = null; commit();
                    show('list-msg', c.name + '\'s ' + f.name + ' stops after ' + C.fmtMonth(ym) + '.', snap); focusIn('f' + f.id, '.rec');
                });
            }
            w.appendChild(fx);
        }
        const rb = el('div', 'row-btns'); if (f.every !== 0) w.appendChild(el('hr', 'sep'));
        rb.append(btn('secondary', 'Edit the fee', () => { panel['f' + f.id] = null; openForm(f.id); }), btn('secondary', 'Close', () => togglePanel('f' + f.id, 'change')));
        w.appendChild(rb);
        return w;
    }

    // ---------- a child: edit, statement ----------
    function childForm(c) {
        const form = el('form', 'panel'); form.noValidate = true; form.appendChild(el('h4', null, 'Edit child'));
        const id = 'k' + c.id;
        const nm = input(id + '-n', 'text', 'e.g. Ali', { maxLength: C.LIMITS.name }); nm.value = c.name;
        const en = errP(id + '-en'); nm.setAttribute('aria-describedby', en.id);
        form.appendChild(field('Child\'s name', nm, en));
        const sc = input(id + '-s', 'text', 'e.g. City School', { maxLength: C.LIMITS.school }); sc.value = c.school;
        form.appendChild(field('School\'s name (optional)', sc));
        const rb = el('div', 'row-btns'); const sb = el('button', 'primary', 'Save changes'); sb.type = 'submit';
        rb.append(sb, btn('secondary', 'Cancel', () => togglePanel('c' + c.id, 'edit'))); form.appendChild(rb);
        form.appendChild(btn('danger', 'Delete ' + c.name + ' and all their fees', () => {
            const snap = snapshot(); state.children = state.children.filter(x => x.id !== c.id); delete panel['c' + c.id];
            if (editing && !findFee(editing)) closeForm(true);
            commit();
            show(state.children.length ? 'list-msg' : 'form-msg', 'Deleted ' + c.name + ' and their fees.', snap);
        }));
        form.addEventListener('submit', ev => {
            ev.preventDefault(); en.textContent = '';
            const n = C.cleanText(nm.value, C.LIMITS.name);
            if (!n) { en.textContent = 'Type the child\'s name.'; nm.focus(); return; }
            const snap = snapshot(); c.name = n; c.school = C.cleanText(sc.value, C.LIMITS.school); panel['c' + c.id] = null; commit();
            show('list-msg', 'Saved.', snap); focusIn('c' + c.id, '.mini');
        });
        return form;
    }
    function years(c) {
        const ys = [], starts = c.fees.map(f => Number(f.start.slice(0, 4))), now = Number(today.slice(0, 4));
        const lo = starts.length ? Math.min(now, ...starts) : now, hi = starts.length ? Math.max(now, ...starts) : now;
        for (let y = hi; y >= lo; y--) ys.push(y);
        return ys;
    }
    function stmtPanel(c) {
        const w = el('div', 'panel'); w.appendChild(el('h4', null, 'Statement for ' + c.name));
        const ys = years(c); if (!ys.includes(stmtYear[c.id])) stmtYear[c.id] = Number(today.slice(0, 4));
        const y = stmtYear[c.id];
        const sel = el('select'); sel.id = 's' + c.id + '-y';
        ys.forEach(v => { const o = el('option', null, String(v)); o.value = String(v); sel.appendChild(o); });
        sel.value = String(y);
        sel.addEventListener('change', () => { stmtYear[c.id] = Number(sel.value); render(); const s2 = $('s' + c.id + '-y'); if (s2) s2.focus(); });
        const yr = el('div', 'year-pick'); const yl = el('label', null, 'Year'); yl.htmlFor = sel.id; yr.append(yl, sel); w.appendChild(yr);
        w.appendChild(stmtTables(c, y));
        const g = el('div', 'tool-grid');
        g.appendChild(btn('secondary', 'Print or save as PDF', () => openStatement(c.id, y)));
        g.appendChild(btn('secondary', 'Copy statement', () => copyText(C.statementText(c, y, today, state.cur, state.style)).then(ok => show('list-msg', ok ? 'Statement copied. Paste it in a message or email.' : 'Your browser did not allow copying.'))));
        w.appendChild(g);
        return w;
    }
    function stmtTables(c, y) {
        // plain numbers in the cells and the currency in the headings, so the table fits a phone
        const ys = C.yearSummary(c, y, today), wrap = el('div', 'stmt'), N = x => C.fmtMoney(x, '', state.style), cur = state.cur ? ' (' + state.cur + ')' : '';
        if (!ys.fees.length) { wrap.appendChild(el('p', 'empty', 'No fees in ' + y + '.')); return wrap; }
        ys.fees.forEach(fs => {
            const tb = el('table'); tb.appendChild(el('caption', null, fs.fee.name + ', ' + C.EVERY[fs.fee.every]));
            const hr = el('tr'); [fs.fee.every > 1 ? 'Months' : 'Month', 'Fee' + cur, 'Paid' + cur, 'Owed' + cur].forEach(h => { const th = el('th', null, h); th.scope = 'col'; hr.appendChild(th); });
            const th = el('thead'); th.appendChild(hr); tb.appendChild(th);
            const bd = el('tbody');
            fs.rows.forEach(r => {
                const tr = el('tr');
                const nm = fs.fee.every > 1 ? C.MONTHS[Number(r.ym.slice(5)) - 1].slice(0, 3) + '-' + C.MONTHS[Number(r.last.slice(5)) - 1].slice(0, 3) : C.MONTHS[Number(r.ym.slice(5)) - 1].slice(0, 3);
                const mh = el('th', null, nm); mh.scope = 'row'; mh.title = r.label; tr.appendChild(mh);
                tr.appendChild(el('td', null, N(r.amt))); tr.appendChild(el('td', null, N(r.paid)));
                tr.appendChild(el('td', r.left && r.isDue ? 'bad' : '', r.isDue || !r.left ? N(r.left) : 'not due'));
                bd.appendChild(tr);
            });
            tb.appendChild(bd);
            if (fs.rows.length > 1) {
                const ft = el('tfoot'), fr = el('tr'); const fh = el('th', null, 'Total'); fh.scope = 'row'; fr.appendChild(fh);
                fr.appendChild(el('td', null, N(fs.total))); fr.appendChild(el('td', null, N(fs.paid))); fr.appendChild(el('td', fs.owed ? 'bad' : '', N(fs.owed)));
                ft.appendChild(fr); tb.appendChild(ft);
            }
            if (fs.rows.length) wrap.appendChild(tb);
            else wrap.appendChild(el('p', 'sub-line', fs.fee.name + ': no fee in ' + y + '.'));
        });
        const bits = ['Fees for ' + y + ': ' + M(ys.total), 'paid ' + M(ys.paid)]; if (ys.owed) bits.push('owed now ' + M(ys.owed)); if (ys.toCome) bits.push('still to come ' + M(ys.toCome));
        wrap.appendChild(el('p', 'sub-line', bits.join(', ') + '.'));
        return wrap;
    }

    // ---------- statement and photo sheet ----------
    function openSheet(paper, text, title, printable) {
        $('sheet-paper').textContent = ''; $('sheet-paper').appendChild(paper); $('sheet-msg').textContent = '';
        $('sheet').dataset.text = text || ''; document.title = title;
        $('sheet-print').hidden = !printable; $('sheet-copy').hidden = !printable; $('sheet-btns').classList.toggle('only-close', !printable);
        if (!$('sheet').open) $('sheet').showModal();
        (printable ? $('sheet-print') : $('sheet-close')).focus();
    }
    function openStatement(cid, y) {
        const c = kid(cid); if (!c) return;
        const paper = el('div', 'receipt statement');
        const h = el('h2', null, 'Fee statement ' + y); h.id = 'sheet-h'; paper.appendChild(h);
        paper.appendChild(el('p', 'meta-line', c.name + (c.school ? ', ' + c.school : '') + '. Made on ' + C.fmtDateY(today) + '.'));
        paper.appendChild(stmtTables(c, y));
        const ys = C.yearSummary(c, y, today), pays = [];
        ys.fees.forEach(fs => fs.payments.forEach(p => pays.push({ p, fee: fs.fee })));
        pays.sort((a, b) => (a.p.d < b.p.d ? -1 : a.p.d > b.p.d ? 1 : 0));
        if (pays.length) {
            paper.appendChild(el('h3', null, 'Payments made in ' + y));
            const ul = el('ul', 'stmt-pays');
            pays.forEach(({ p, fee }) => ul.appendChild(el('li', null, C.fmtDateY(p.d) + ': ' + M(p.amt) + ', ' + fee.name + (p.note ? ' (' + p.note + ')' : ''))));
            paper.appendChild(ul);
        }
        openSheet(paper, C.statementText(c, y, today, state.cur, state.style), 'Fee statement ' + y + ' - ' + c.name, true);
    }
    let photoUrl = '';
    function openPhoto(c, f, p) {
        const paper = el('div');
        const h = el('h2', 'sheet-title', 'Receipt: ' + c.name + ', ' + f.name); h.id = 'sheet-h'; paper.appendChild(h);
        const cap = el('p', 'sheet-photo-cap', C.fmtDateY(p.d) + ', ' + M(p.amt) + (p.note ? '. ' + p.note : ''));
        photoGet(p.photo).then(b => {
            if (!b) { paper.insertBefore(el('p', 'empty', 'This photo is not on this device any more.'), cap); return; }
            if (photoUrl) URL.revokeObjectURL(photoUrl);
            photoUrl = URL.createObjectURL(b);
            const im = el('img', 'sheet-photo'); im.src = photoUrl; im.alt = 'Receipt photo for ' + c.name + '\'s ' + f.name + ', paid ' + C.fmtDateY(p.d);
            paper.insertBefore(im, cap);
        }, () => paper.insertBefore(el('p', 'empty', 'The photo could not be opened in this browser.'), cap));
        paper.appendChild(cap);
        openSheet(paper, '', 'Receipt photo - ' + c.name, false);
    }
    function closeSheet() { if ($('sheet').open) $('sheet').close(); }

    // ---------- the fee form ----------
    function dueOptions() {
        const s = $('f-due'); s.textContent = '';
        for (let d = 1; d <= 31; d++) { const o = el('option', null, d >= 29 ? 'the ' + C.ordinal(d) + ' (or last day)' : 'the ' + C.ordinal(d)); o.value = String(d); s.appendChild(o); }
        s.value = '10';
    }
    function startOptions() {
        const ms = $('f-sm'), ys = $('f-sy'); ms.textContent = ''; ys.textContent = '';
        C.MONTHS.forEach((n, i) => { const o = el('option', null, n); o.value = String(i + 1).padStart(2, '0'); ms.appendChild(o); });
        const y = Number(today.slice(0, 4));
        for (let k = y - 5; k <= y + 1; k++) { const o = el('option', null, String(k)); o.value = String(k); ys.appendChild(o); }
        setStart(C.ymOf(today));
    }
    function setStart(ym) {
        const ys = $('f-sy');
        if (![...ys.options].some(o => o.value === ym.slice(0, 4))) { const o = el('option', null, ym.slice(0, 4)); o.value = ym.slice(0, 4); ys.insertBefore(o, ys.firstChild); }
        $('f-sm').value = ym.slice(5); ys.value = ym.slice(0, 4);
    }
    function childOptions() {
        const s = $('f-child'), keep = s.value; s.textContent = '';
        state.children.forEach(c => { const o = el('option', null, c.name); o.value = String(c.id); s.appendChild(o); });
        const o = el('option', null, '+ A new child'); o.value = 'new'; s.appendChild(o);
        s.value = [...s.options].some(x => x.value === keep) ? keep : (state.children.length ? String(state.children[0].id) : 'new');
        childVisible();
    }
    function childVisible() {
        const has = state.children.length > 0;
        $('w-child').hidden = !has;
        $('w-new').hidden = has && $('f-child').value !== 'new';
        $('f-child').disabled = editing !== null;
    }
    function readForm() {
        const newChild = $('f-child').value === 'new' || !state.children.length;
        return { newChild, childId: newChild ? null : Number($('f-child').value), child: C.cleanText($('f-name').value, C.LIMITS.name), school: $('w-school').hidden ? '' : C.cleanText($('f-school').value, C.LIMITS.school),
            name: C.cleanText($('f-fee').value, C.LIMITS.fee), amt: C.readMoney($('f-amt').value), every: Number($('f-every').value), due: Number($('f-due').value), start: $('f-sy').value + '-' + $('f-sm').value };
    }
    function preview() {
        const out = $('preview'); out.textContent = '';
        chipsOn();
        $('l-start').textContent = Number($('f-every').value) === 0 ? 'Month it is due' : 'First month to track';
        $('h-start').textContent = Number($('f-every').value) > 1 ? 'Pick the first month of a term. Months before it are not counted.' : Number($('f-every').value) === 0 ? '' : 'Months before this are not counted.';
        if ($('form').hidden) return;
        const x = readForm();
        if (Object.keys(C.checkFee(editing ? Object.assign({}, x, { newChild: false }) : x, today)).length) return;
        const who = x.newChild ? x.child : (kid(x.childId) || {}).name;
        const fee = { amts: [{ from: x.start, amt: x.amt }], every: x.every, due: x.due, start: x.start, skip: [] };
        const due = C.dueDateOf(x.start, x.due), lbl = C.periodLabel(fee, x.start);
        out.textContent = who + ': ' + x.name + ', ' + M(x.amt) + ' ' + C.EVERY[x.every] + '. ' + (x.every === 0 ? 'Due' : 'First: ' + lbl + ', due') + ' ' + C.fmtDate(due) + ' ' + due.slice(0, 4) + (due <= today ? ' (already due: record it if it is paid)' : '') + '.';
    }
    function chipsOn() { const v = C.cleanText($('f-fee').value, 50).toLowerCase(); document.querySelectorAll('#fee-chips .chip').forEach(b => { const on = b.dataset.fee.toLowerCase() === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }
    const FIELDS = { child: 'f-name', name: 'f-fee', amt: 'f-amt', every: 'f-every', due: 'f-due', start: 'f-sm' };
    function clearErrors() { Object.keys(FIELDS).forEach(k => { $('e-' + k).textContent = ''; $(FIELDS[k]).removeAttribute('aria-invalid'); }); }
    function openForm(feeId, childId) {
        editing = feeId || null;
        const hit = editing ? findFee(editing) : null, f = hit && hit.fee;
        $('form').hidden = false; $('open-form').hidden = true; clearErrors(); clearMsg('form-msg');
        childOptions();
        if (hit) $('f-child').value = String(hit.child.id);
        else if (childId) $('f-child').value = String(childId);
        else if (state.children.length) $('f-child').value = String(state.children[state.children.length - 1].id);
        $('f-name').value = ''; $('f-school').value = ''; $('w-school').hidden = true; $('o-school').hidden = false;
        $('f-fee').value = f ? f.name : '';
        $('f-amt').value = f ? C.centsToInput(f.amts[0].amt) : '';
        $('f-every').value = f ? String(f.every) : '1';
        $('f-due').value = f ? String(f.due) : '10';
        setStart(f ? f.start : C.ymOf(today));
        $('l-amt').textContent = f && f.amts.length > 1 ? 'First amount (' + C.shortMonth(f.amts[0].from) + ')' : 'Fee amount';
        $('form-h').textContent = f ? 'Edit ' + hit.child.name + '\'s ' + f.name : 'Add a fee';
        $('save').textContent = f ? 'Save changes' : 'Add the fee';
        $('cancel').hidden = !state.children.length; $('del').hidden = !f;
        childVisible(); render();
        $('add').scrollIntoView({ block: 'start' });
        const focus = !state.children.length || $('f-child').value === 'new' ? $('f-name') : $('f-fee');
        focus.focus({ preventScroll: true });
    }
    function closeForm(quiet) {
        editing = null;
        if (state.children.length) { $('form').hidden = true; } else openFormQuiet();
        childVisible();
        if (!quiet) render();
    }
    function openFormQuiet() {
        editing = null; $('form').hidden = false; $('form-h').textContent = 'Add a fee'; $('save').textContent = 'Add the fee'; $('del').hidden = true; $('cancel').hidden = true;
        $('l-amt').textContent = 'Fee amount';
    }
    function submitForm(ev) {
        ev.preventDefault(); clearErrors();
        const x = readForm(), hit = editing ? findFee(editing) : null;
        const e = C.checkFee(hit ? Object.assign({}, x, { newChild: false }) : x, today);
        if ($('f-amt').value.trim() && Number.isNaN(x.amt)) e.amt = 'Type the fee as a number, such as 8000 or 8000.50.';
        if (hit && !e.start) {
            const f = hit.fee;
            if (f.amts.length > 1 && f.amts[1].from <= x.start) e.start = 'The fee changes in ' + C.fmtMonth(f.amts[1].from) + ', so the first month must be before that.';
            else if (f.end && f.end < x.start) e.start = 'This fee stops after ' + C.fmtMonth(f.end) + '. Pick an earlier month, or start the fee again first.';
        }
        const keys = Object.keys(e);
        if (keys.length) { keys.forEach(k => { $('e-' + k).textContent = e[k]; $(FIELDS[k]).setAttribute('aria-invalid', 'true'); }); $(FIELDS[keys[0]]).focus(); return; }
        const snap = snapshot();
        let child, msg;
        if (hit) {
            const f = hit.fee; child = hit.child;
            Object.assign(f, { name: x.name, every: x.every, due: x.due, start: x.start });
            f.amts[0] = { from: x.start, amt: x.amt };
            msg = 'Saved the changes to ' + child.name + '\'s ' + x.name + '.';
        } else {
            if (x.newChild) {
                child = state.children.find(c => c.name.toLowerCase() === x.child.toLowerCase());
                if (!child) { child = { id: state.nextId++, name: x.child, school: x.school, fees: [] }; state.children.push(child); }
                else if (x.school && !child.school) child.school = x.school;
            } else child = kid(x.childId);
            child.fees.push({ id: state.nextId++, name: x.name, amts: [{ from: x.start, amt: x.amt }], every: x.every, due: x.due, start: x.start, end: '', skip: [], payments: [] });
            msg = 'Added ' + child.name + '\'s ' + x.name + '. Tap "Record a payment" when you pay it.';
        }
        editing = null; $('form').hidden = true; $('f-child').value = String(child.id); commit();
        show('list-msg', msg, snap);
        const b = document.querySelector('#boxes li[data-id="' + child.id + '"]'); if (b) b.scrollIntoView({ block: 'nearest' });
    }

    // ---------- backup ----------
    function backup() {
        const ids = [...C.photoIds(state)], photos = {};
        const done = () => { download('school-fees-backup-' + today + '.json', 'application/json', JSON.stringify({ app: SLUG, state, photos })); show('set-msg', 'Backup file saved' + (ids.length ? ' with ' + C.plural(Object.keys(photos).length, 'receipt photo', 'receipt photos') : '') + '. Keep it somewhere safe.'); };
        if (!ids.length) return done();
        Promise.all(ids.map(id => photoGet(id).then(b => (b ? blobToData(b).then(d => { photos[id] = d; }) : null)).catch(() => null))).then(done, done);
    }
    function restore(txt) {
        let o = null; try { o = JSON.parse(txt); } catch (e) { o = null; }
        const s = o && (o.state ? C.validate(o.state) : C.validate(o));
        if (!s) { show('set-msg', 'That file is not a backup from this app, so nothing was changed.'); return; }
        const photos = o.state && o.photos && typeof o.photos === 'object' ? o.photos : {};
        const need = C.photoIds(s), puts = [];
        need.forEach(id => { const b = dataToBlob(photos[id]); if (b) puts.push(photoPut(id, b).catch(() => null)); });
        Promise.all(puts).then(() => {
            const snap = snapshot(); state = s; resetPanels(); closeForm(true); commit(); show('set-msg', 'Backup restored.', snap);
        });
    }

    // ---------- events ----------
    let photosOk = typeof indexedDB !== 'undefined';
    function wire() {
        dueOptions(); startOptions();
        const cs = $('s-cur'); C.CURRENCIES.forEach(c => { const o = el('option', null, c || 'None'); o.value = c; cs.appendChild(o); });
        $('form').addEventListener('submit', submitForm);
        $('form').addEventListener('input', preview);
        $('form').addEventListener('change', preview);
        $('f-child').addEventListener('change', () => { childVisible(); if ($('f-child').value === 'new') $('f-name').focus(); });
        document.querySelectorAll('#fee-chips .chip').forEach(b => b.addEventListener('click', () => {
            $('f-fee').value = b.dataset.fee; $('e-name').textContent = ''; $('f-fee').removeAttribute('aria-invalid');
            if (b.dataset.fee === 'Admission fee') $('f-every').value = '0';
            preview(); $('f-amt').focus();
        }));
        $('o-school').addEventListener('click', () => { $('w-school').hidden = false; $('o-school').hidden = true; $('f-school').focus(); });
        $('open-form').addEventListener('click', () => openForm());
        $('cancel').addEventListener('click', () => { closeForm(); $('open-form').focus(); });
        $('del').addEventListener('click', () => {
            const hit = findFee(editing); if (!hit) return;
            const snap = snapshot(); hit.child.fees = hit.child.fees.filter(x => x.id !== hit.fee.id); editing = null; closeForm(true); commit();
            show('list-msg', 'Deleted ' + hit.child.name + '\'s ' + hit.fee.name + ' and its payments.', snap);
        });
        // money settings
        $('s-cur').addEventListener('change', () => { state.cur = C.CURRENCIES.includes($('s-cur').value) ? $('s-cur').value : ''; commit(); });
        $('s-style').addEventListener('change', () => { state.style = $('s-style').value === 'sa' ? 'sa' : 'intl'; commit(); });
        // sheet
        $('sheet-print').addEventListener('click', () => window.print());
        $('sheet-copy').addEventListener('click', () => copyText($('sheet').dataset.text || '').then(ok => { $('sheet-msg').textContent = ok ? 'Copied. Paste it in a message or email.' : 'Your browser did not allow copying.'; }));
        $('sheet-close').addEventListener('click', closeSheet);
        $('sheet').addEventListener('close', () => { document.title = TITLE; if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = ''; } });
        // summary and backup
        $('copy').addEventListener('click', () => copyText(C.summaryText(state, today)).then(ok => show('set-msg', ok ? 'Fee summary copied.' : 'Your browser did not allow copying.')));
        $('backup').addEventListener('click', backup);
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', () => {
            const f = $('restore-file').files[0]; $('restore-file').value = '';
            if (!f) return;
            if (f.size > 80e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            f.text().then(restore);
        });
        $('wipe').addEventListener('click', () => { const snap = snapshot(); state = C.emptyState(); resetPanels(); closeForm(true); commit(); show('set-msg', 'Everything was deleted.', snap); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayIso() !== today) render(); });
        setInterval(() => { if (C.todayIso() !== today) render(); }, 60000);
    }

    state = load();
    wire();
    if (state.children.length) $('form').hidden = true; else openFormQuiet();
    render(); save();
    db().then(() => prunePhotos(), () => { photosOk = false; render(); });
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
        navigator.serviceWorker.register('sw.js').catch(() => { /* the app still works online without it */ });
    }
})();
