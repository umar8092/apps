// Page code: reads the form, draws the invoice preview, keeps My invoices.
(function () {
    'use strict';
    const C = window.InvoiceCore, KEY = 'invoice-generator-for-freelancers.state', SLUG = 'invoice-generator-for-freelancers';
    const $ = id => document.getElementById(id);
    const ERR = {
        q: { zero: 'Qty must be more than 0.', negative: 'Qty cannot be below 0.', nan: 'Qty should be a number, like 2 or 1.5.', decimals: 'Use at most 3 decimals in Qty.', big: 'Qty is too big (100,000 at most).' },
        r: { blank: 'Type the price.', nan: 'The price should be a number, like 75 or 75.50.', big: 'The price is too big (10,000,000 at most).' },
        d: { blank: 'Type what this item is for.' }
    };

    let state, saving = true, showAll = false, lastDay = C.today();
    const touched = new Set();
    function load() {
        let raw = null, bad = false;
        try { raw = localStorage.getItem(KEY); } catch (e) { saving = false; }
        let parsed = null;
        if (raw) { try { parsed = JSON.parse(raw); } catch (e) { bad = true; } }
        const s = C.clean(parsed);
        if (bad) setTimeout(() => say('act-msg', 'Your saved invoices could not be read, so the app started fresh.'), 0);
        return s;
    }
    function save() {
        if (!saving) return;
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { say('act-msg', 'Your browser is not letting this page save, so changes will be lost when you close it. Use Download backup to keep them.'); return false; }
        return true;
    }
    function el(tag, props, kids) {
        const e = document.createElement(tag);
        Object.keys(props || {}).forEach(k => { if (k === 'text') e.textContent = props[k]; else if (k === 'cls') e.className = props[k]; else if (k in e && k !== 'list') e[k] = props[k]; else e.setAttribute(k, props[k]); });
        (kids || []).forEach(k => k && e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
        return e;
    }
    const timers = {};
    function say(id, text, undoFn) {
        const m = $(id); m.textContent = text; clearTimeout(timers[id]);
        if (undoFn) { const b = el('button', { type: 'button', text: 'Undo' }); b.onclick = () => { undoFn(); m.textContent = ''; }; m.appendChild(b); }
        if (text && !undoFn) timers[id] = setTimeout(() => { if (m.textContent === text) m.textContent = ''; }, 6000);
    }
    const copy = o => JSON.parse(JSON.stringify(o));
    const inv = () => state.inv;
    const isSaved = () => state.saved.some(s => s.id === inv().id);
    function commit() {
        const i = state.saved.findIndex(s => s.id === inv().id);
        if (i >= 0) state.saved[i] = copy(inv());
        save(); render();
    }

    // ---- the form fields ----
    const FIELDS = [
        ['me-name', () => state.me, 'name'], ['me-details', () => state.me, 'details'],
        ['cl-name', () => inv().client, 'name'], ['cl-details', () => inv().client, 'details'], ['cl-email', () => inv().client, 'email'],
        ['number', inv, 'number'], ['issue', inv, 'issue'], ['terms', inv, 'terms'], ['due', inv, 'due'],
        ['disc', inv, 'disc'], ['disc-type', inv, 'discType'], ['tax-name', inv, 'taxName'], ['tax-rate', inv, 'taxRate'],
        ['paid', inv, 'paid'], ['notes', inv, 'notes'], ['cur', inv, 'cur']
    ];
    function fillForm() {
        FIELDS.forEach(([id, obj, k]) => { $(id).value = obj()[k] || ''; });
        if (!$('terms').value) $('terms').value = '30';
        $('tax-incl').checked = !!inv().taxIncl;
        $('style').value = inv().style;
        $('cl-email-box').hidden = !inv().client.email; $('cl-email-add').hidden = !!inv().client.email;
        renderItems();
    }
    FIELDS.forEach(([id, obj, k]) => {
        const ev = $(id).tagName === 'SELECT' || $(id).type === 'date' ? 'change' : 'input';
        $(id).addEventListener(ev, () => {
            let v = $(id).value;
            if (id === 'issue' && !v) v = C.today();
            obj()[k] = v;
            if (id === 'cur') state.cur = v;
            commit();
        });
    });
    $('issue').addEventListener('blur', () => { if (!$('issue').value) $('issue').value = inv().issue; });
    $('tax-incl').addEventListener('change', () => { inv().taxIncl = $('tax-incl').checked; commit(); });
    $('style').addEventListener('change', () => {
        C.restyle(inv(), inv().style, $('style').value); state.style = inv().style;
        fillForm(); commit();
    });
    $('cl-email-add').onclick = () => { $('cl-email-box').hidden = false; $('cl-email-add').hidden = true; $('cl-email').focus(); };
    [['disc', 'discOn'], ['tax', 'taxOn'], ['paid', 'paidOn']].forEach(([p, flag]) => {
        $(p + '-add').onclick = () => { inv()[flag] = true; commit(); (p === 'tax' ? $('tax-rate') : $(p)).focus(); };
        $(p + '-rm').onclick = () => { inv()[flag] = false; commit(); $(p + '-add').focus(); };
    });

    // ---- saved clients ----
    function renderPick() {
        const pick = $('pick'); pick.textContent = '';
        $('pick-box').hidden = !state.clients.length;
        pick.appendChild(el('option', { value: '', text: state.clients.length + (state.clients.length === 1 ? ' saved client' : ' saved clients') + ': choose one' }));
        state.clients.forEach((c, i) => pick.appendChild(el('option', { value: String(i), text: c.name })));
        const cur = inv().client.name.trim().toLowerCase();
        $('cl-forget').hidden = !cur || !state.clients.some(c => c.name.trim().toLowerCase() === cur);
    }
    $('pick').addEventListener('change', () => {
        const c = state.clients[+$('pick').value]; if (!c) return;
        const before = copy(inv().client);
        inv().client = copy(c); fillForm(); commit();
        $('pick').value = '';
        say('to-msg', 'Filled in ' + c.name + '.', () => { inv().client = before; fillForm(); commit(); });
    });
    $('cl-forget').onclick = () => {
        const name = inv().client.name.trim().toLowerCase(), before = copy(state.clients);
        state.clients = state.clients.filter(c => c.name.trim().toLowerCase() !== name); save(); render();
        say('to-msg', 'Removed from saved clients. This invoice keeps the name.', () => { state.clients = before; save(); render(); });
    };

    // ---- logo ----
    $('logo-add').onclick = () => $('logo-file').click();
    $('logo-file').addEventListener('change', () => {
        const f = $('logo-file').files[0]; $('logo-file').value = '';
        if (!f) return;
        if (!/^image\//.test(f.type)) return say('me-msg', 'That file is not a picture. Choose a PNG or JPG logo.');
        const url = URL.createObjectURL(f), img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const w = img.naturalWidth || 600, h = img.naturalHeight || 240, k = Math.min(1, 600 / w, 240 / h);
            const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
            const g = cv.getContext('2d'); g.drawImage(img, 0, 0, cv.width, cv.height);
            let data = cv.toDataURL('image/png');
            if (data.length > 300000) { const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; const g2 = c2.getContext('2d'); g2.fillStyle = '#fff'; g2.fillRect(0, 0, c2.width, c2.height); g2.drawImage(cv, 0, 0); data = c2.toDataURL('image/jpeg', 0.85); }
            const before = state.me.logo; state.me.logo = data;
            if (save() === false) { state.me.logo = before; save(); render(); return say('me-msg', 'The logo is too big to keep on this device. Try a smaller picture.'); }
            render(); say('me-msg', 'Logo added. It shows at the top of the invoice.');
        };
        img.onerror = () => { URL.revokeObjectURL(url); say('me-msg', 'That picture could not be read. Try a PNG or JPG.'); };
        img.src = url;
    });
    $('logo-remove').onclick = () => { const before = state.me.logo; state.me.logo = ''; save(); render(); say('me-msg', 'Logo removed.', () => { state.me.logo = before; save(); render(); }); };

    // ---- items ----
    function renderItems() {
        const ol = $('items'); ol.textContent = '';
        inv().items.forEach((it, i) => {
            const n = i + 1, li = el('li', { cls: 'item' });
            const rm = el('button', { type: 'button', cls: 'rm', text: 'Remove', 'aria-label': 'Remove item ' + n });
            rm.onclick = () => removeItem(i);
            li.appendChild(el('div', { cls: 'i-head' }, [el('span', { cls: 'i-title', text: 'Item ' + n }), rm]));
            const d = el('textarea', { id: 'd-' + i, rows: 1, maxLength: C.MAX_TEXT, value: it.d, placeholder: 'e.g. Logo design' });
            const q = el('input', { type: 'text', id: 'q-' + i, inputMode: 'decimal', maxLength: 20, value: it.q, placeholder: '1' });
            const r = el('input', { type: 'text', id: 'r-' + i, inputMode: 'decimal', maxLength: 24, value: it.r, placeholder: 'e.g. 600' });
            d.classList.add('desc');
            li.appendChild(el('label', { htmlFor: 'd-' + i, text: 'Description' })); li.appendChild(d);
            li.appendChild(el('p', { cls: 'err', id: 'd-err-' + i }));
            const money = el('div', { cls: 'money' }, [el('span', { cls: 'sym', text: inv().cur }), r]);
            li.appendChild(el('div', { cls: 'two' }, [
                el('div', {}, [el('label', { htmlFor: 'q-' + i, text: 'Qty (hours, days, pieces)' }), q, el('p', { cls: 'err', id: 'q-err-' + i })]),
                el('div', {}, [el('label', { htmlFor: 'r-' + i, text: 'Price each' }), money, el('p', { cls: 'err', id: 'r-err-' + i })])
            ]));
            const nt = el('input', { type: 'checkbox', id: 'nt-' + i, checked: it.notax });
            li.appendChild(el('label', { cls: 'check tax-only', htmlFor: 'nt-' + i }, [nt, 'No tax on this item']));
            li.appendChild(el('p', { cls: 'i-out', id: 'out-' + i }));
            [['d', d], ['q', q], ['r', r]].forEach(([k, inp]) => {
                inp.addEventListener('input', () => { it[k] = inp.value; if (k === 'd') grow(inp); commit(); });
                inp.addEventListener('blur', () => { touched.add(i); render(); });
            });
            r.addEventListener('keydown', e => { if (e.key === 'Enter' && i === inv().items.length - 1) { e.preventDefault(); addItem(); } });
            nt.addEventListener('change', () => { it.notax = nt.checked; commit(); });
            ol.appendChild(li);
            grow(d);
        });
        $('add-item').disabled = inv().items.length >= C.MAX_ITEMS;
    }
    function grow(t) { t.style.height = 'auto'; if (t.scrollHeight) t.style.height = Math.min(t.scrollHeight + 2, 200) + 'px'; }
    function addItem() {
        if (inv().items.length >= C.MAX_ITEMS) return say('items-msg', 'At most ' + C.MAX_ITEMS + ' items on one invoice.');
        inv().items.push(C.blankItem()); renderItems(); commit();
        $('d-' + (inv().items.length - 1)).focus();
    }
    $('add-item').onclick = addItem;
    function removeItem(i) {
        const before = copy(inv().items), it = inv().items[i];
        inv().items.splice(i, 1);
        if (!inv().items.length) inv().items.push(C.blankItem());
        touched.clear(); renderItems(); commit();
        say('items-msg', 'Removed ' + (it.d.trim() ? '"' + it.d.trim().slice(0, 40) + '"' : 'item ' + (i + 1)) + '.', () => { inv().items = before; renderItems(); commit(); });
        $('add-item').focus();
    }

    // ---- the answer, the problems and the preview ----
    function problemsFor(c) {
        const v = inv(), list = c.problems.filter(p => p.where !== 'items' || c.hasItems || p.text.includes('less than 0')).map(p => p.text);
        if (!v.number.trim()) list.push('Type an invoice number.');
        const d = C.dueOf(v);
        if (d.err === 'due-blank') list.push('Pick the due date, or choose another Payment due.');
        if (d.err === 'due-before') list.push('The due date is before the invoice date.');
        if (showAll) {
            if (!c.hasItems && !c.problems.some(p => p.where === 'item')) list.push('Add at least one item with a description and a price.');
            if (!state.me.name.trim()) list.push('Type your name or business name in step 1.');
            if (!v.client.name.trim()) list.push('Type the client name in step 2.');
        }
        return list;
    }
    function render() {
        const v = inv(), st = v.style, sym = v.cur, m = x => C.money(x, sym, st);
        const c = C.compute(v, st), d = C.dueOf(v);
        // optional boxes
        $('disc-box').hidden = !v.discOn; $('disc-add').hidden = v.discOn;
        $('tax-box').hidden = !v.taxOn; $('tax-add').hidden = v.taxOn;
        $('paid-box').hidden = !v.paidOn || v.status === 'paid'; $('paid-add').hidden = v.paidOn || v.status === 'paid';
        $('due-box').hidden = v.terms !== 'custom';
        document.querySelectorAll('.tax-only').forEach(e => { e.hidden = !v.taxOn; });
        document.querySelectorAll('.sym').forEach(e => { e.textContent = sym; });
        $('logo-has').hidden = !state.me.logo; $('logo-add').hidden = !!state.me.logo;
        if (state.me.logo) $('logo-img').src = state.me.logo; else $('logo-img').removeAttribute('src');
        $('disc').placeholder = v.discType === 'amt' ? 'e.g. 50' : 'e.g. 10';
        // per-item outputs and messages
        c.lines.forEach(l => {
            const out = $('out-' + l.i); if (!out) return;
            const show = showAll || touched.has(l.i);
            ['d', 'q', 'r'].forEach(k => {
                const code = l.errors[k], msg = code && (show || k === 'q' || (k === 'r' && code !== 'blank')) ? ERR[k][code] || '' : '';
                $(k + '-err-' + l.i).textContent = msg; $(k + '-' + l.i).setAttribute('aria-invalid', msg ? 'true' : 'false');
            });
            out.textContent = '';
            if (l.amount != null) { out.className = 'i-out'; out.appendChild(el('span', { text: C.fmtQty(l.qty, st) + ' × ' + m(l.price) })); out.appendChild(el('b', { text: m(l.amount) })); }
            else { out.className = 'i-out wait'; out.textContent = l.empty ? 'Type a description and a price.' : 'Amount shows when the price is filled in.'; }
        });
        const fieldErr = (id, where, inputId) => { const p = c.problems.find(x => x.where === where); $(id).textContent = p ? p.text : ''; $(inputId).setAttribute('aria-invalid', p ? 'true' : 'false'); };
        fieldErr('disc-err', 'disc', 'disc'); fieldErr('tax-err', 'tax', 'tax-rate'); fieldErr('paid-err', 'paid', 'paid');
        // number and dates
        const dup = v.number.trim() && state.saved.some(s => s.id !== v.id && s.number.trim().toLowerCase() === v.number.trim().toLowerCase());
        $('number-err').textContent = !v.number.trim() ? 'Type an invoice number.' : dup ? v.number.trim() + ' is already used by another saved invoice.' : '';
        $('date-err').textContent = d.err === 'due-before' ? 'The due date is before the invoice date.' : d.err === 'due-blank' ? 'Pick the due date.' : '';
        $('due-line').textContent = d.due ? (d.onReceipt ? 'Due on receipt (' + C.fmtDate(d.due) + ')' : d.text) : '';
        // the answer
        const probs = problemsFor(c), ans = $('answer');
        $('problems').textContent = ''; probs.forEach(p => $('problems').appendChild(el('li', { text: p })));
        if (!c.hasItems) { ans.className = ''; $('a-head').textContent = 'Add your first item to see the total.'; $('a-sub').textContent = 'The invoice below fills in as you type.'; }
        else if (v.status === 'paid') { ans.className = 'ok'; $('a-head').textContent = 'Paid in full: ' + m(c.total); $('a-sub').textContent = 'Nothing left to pay. The invoice shows PAID.'; }
        else {
            ans.className = probs.length ? '' : 'ok';
            $('a-head').textContent = 'Amount due: ' + m(c.balance);
            const parts = [];
            if (d.due) parts.push(d.onReceipt ? 'Due on receipt' : 'Due by ' + C.fmtDate(d.due));
            if (c.paid) parts.push('Total ' + m(c.total) + ', already paid ' + m(c.paid));
            else if (c.discount || c.tax) parts.push('Total ' + m(c.total) + (c.tax ? (v.taxIncl ? ', includes ' : ', with ') + (v.taxName.trim() || 'Tax') + ' ' + m(c.tax) : ''));
            $('a-sub').textContent = parts.join('. ') + (parts.length ? '.' : '');
        }
        drawPaper(c, d);
        // actions
        const subject = 'Invoice ' + v.number.trim() + (state.me.name.trim() ? ' from ' + state.me.name.trim() : '');
        $('mail').href = 'mailto:' + encodeURIComponent(v.client.email.trim()).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(C.summary(v, state.me, sym, st));
        const saved = isSaved();
        $('save').textContent = saved ? 'Saved in My invoices ✓' : 'Save to My invoices';
        $('save').disabled = saved;
        renderPick(); renderList();
    }
    function drawPaper(c, d) {
        const v = inv(), st = v.style, m = x => C.money(x, v.cur, st), p = $('paper');
        p.textContent = '';
        const ph = (t, txt) => el(t, { cls: 'p-ph', text: txt, style: 'color:#8a9893;font-style:italic' });
        const left = el('div', {}, [state.me.logo ? el('img', { cls: 'p-logo', src: state.me.logo, alt: '' }) : null, el('h3', { cls: 'p-title', text: 'INVOICE' })]);
        const meta = el('dl', { cls: 'p-meta' }, [
            el('dt', { text: 'Invoice no.' }), el('dd', { text: v.number.trim() || '—' }),
            el('dt', { text: 'Date' }), el('dd', { text: C.fmtDate(v.issue) }),
            el('dt', { text: 'Due' }), el('dd', { text: d.due ? (d.onReceipt ? 'On receipt' : C.fmtDate(d.due)) : '—' })
        ]);
        p.appendChild(el('div', { cls: 'p-top' }, [left, meta]));
        const party = (label, name, details, extra, phText) => el('div', {}, [
            el('p', { cls: 'p-label', text: label }), name ? el('p', { cls: 'p-name', text: name }) : ph('p', phText),
            details ? el('p', { cls: 'p-addr', text: details }) : null, extra ? el('p', { cls: 'p-addr', text: extra }) : null]);
        p.appendChild(el('div', { cls: 'p-parties' }, [
            party('From', state.me.name.trim(), state.me.details.trim(), '', 'Your name'),
            party('Bill to', v.client.name.trim(), v.client.details.trim(), v.client.email.trim(), 'Client name')
        ]));
        const lines = c.lines.filter(l => l.amount != null);
        const rows = el('div', { cls: 'p-rows' }, [el('div', { cls: 'p-row h' }, [el('span', { cls: 'd', text: 'Description' }), el('span', { cls: 'n q', text: 'Qty' }), el('span', { cls: 'n pr', text: 'Price' }), el('span', { cls: 'n a', text: 'Amount' })])]);
        lines.forEach(l => rows.appendChild(el('div', { cls: 'p-row' }, [
            el('span', { cls: 'd' }, [l.d, v.taxOn && l.notax ? el('span', { cls: 'notax', text: 'No ' + (v.taxName.trim() || 'tax') }) : null]),
            el('span', { cls: 'p-qp', text: C.fmtQty(l.qty, st) + ' × ' + m(l.price) }),
            el('span', { cls: 'n q', text: C.fmtQty(l.qty, st) }), el('span', { cls: 'n pr', text: m(l.price) }), el('span', { cls: 'n a', text: m(l.amount) })])));
        p.appendChild(rows);
        if (!lines.length) p.appendChild(el('p', { cls: 'p-empty', text: 'Your items will appear here.' }));
        const sums = el('dl', { cls: 'p-sums' }), row = (a, b, cls) => { sums.appendChild(el('dt', { cls: cls || '', text: a })); sums.appendChild(el('dd', { cls: cls || '', text: b })); };
        const taxName = v.taxName.trim() || 'Tax', showTax = v.taxOn && c.taxRate != null && !c.problems.some(x => x.where === 'tax') && String(v.taxRate).trim() !== '';
        if (c.discount || (showTax && !v.taxIncl)) row('Subtotal', m(c.subtotal));
        if (c.discount) row('Discount' + (c.discPct != null ? ' (' + C.fmtPct(c.discPct, st) + ')' : ''), '-' + m(c.discount));
        if (showTax && !v.taxIncl) row(taxName + ' (' + C.fmtPct(c.taxRate, st) + ')', m(c.tax));
        row('Total', m(c.total), 'tot');
        if (showTax && v.taxIncl) row('Includes ' + taxName + ' (' + C.fmtPct(c.taxRate, st) + ')', m(c.tax), 'inc');
        if (v.status === 'paid') { row('Paid', '-' + m(c.paid)); row('Amount due', m(0), 'due'); }
        else { if (c.paid) row('Already paid', '-' + m(c.paid)); row('Amount due', m(c.balance), 'due'); }
        p.appendChild(sums);
        if (v.notes.trim()) p.appendChild(el('p', { cls: 'p-notes', text: v.notes.trim() }));
        if (v.status === 'paid') p.appendChild(el('div', { cls: 'p-stamp', text: 'PAID', 'aria-hidden': 'true' }));
    }

    // ---- actions ----
    function ready(what) {
        showAll = true; render();
        const probs = problemsFor(C.compute(inv(), inv().style));
        if (probs.length) { say('act-msg', 'Fix ' + (probs.length === 1 ? 'the problem' : 'the ' + probs.length + ' problems') + ' listed above first, then ' + what + ' again.'); $('answer').scrollIntoView({ block: 'nearest' }); return false; }
        return true;
    }
    $('print').onclick = () => {
        if (!ready('print')) return;
        const t = document.title;
        document.title = ('Invoice ' + inv().number.trim() + ' ' + inv().client.name.trim()).replace(/[\\/:*?"<>|]+/g, '-').trim();
        const restore = () => { document.title = t; window.removeEventListener('afterprint', restore); };
        window.addEventListener('afterprint', restore);
        window.print();
        setTimeout(restore, 1000);
    };
    $('save').onclick = () => {
        if (!ready('save')) return;
        const v = inv(); if (!v.created) v.created = Date.now();
        state.saved.push(copy(v)); state.clients = C.upsertClient(state.clients, v.client);
        save(); render();
        say('act-msg', 'Saved ' + v.number.trim() + ' in My invoices. From now on, changes save by themselves.');
    };
    $('mail').addEventListener('click', e => { if (!ready('email it')) e.preventDefault(); });
    $('copy').onclick = async () => {
        if (!ready('copy it')) return;
        const text = C.summary(inv(), state.me, inv().cur, inv().style);
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea', { value: text }); document.body.appendChild(t); t.select();
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        }
        say('act-msg', ok ? 'Copied the invoice as text.' : 'Copying is blocked here. Use Email the invoice instead.');
    };
    function hasContent(v) { return v.client.name.trim() || v.items.some(it => it.d.trim() || it.r.trim()); }
    function loadInvoice(next, text) {
        const before = copy(inv()), wasSaved = isSaved(), lost = !wasSaved && hasContent(before);
        state.inv = next; showAll = false; touched.clear();
        fillForm(); save(); render();
        say('act-msg', text + (lost ? ' The last invoice was not saved.' : ''), () => { state.inv = before; fillForm(); save(); render(); });
    }
    $('new').onclick = () => {
        const n = C.blankInvoice(state.saved, inv());
        loadInvoice(n, 'New invoice ' + n.number + ' started. Your details, tax and notes are kept.');
        $('cl-name').focus();
    };

    // ---- My invoices ----
    function renderList() {
        const ol = $('saved'); ol.textContent = '';
        const t = C.today(), list = state.saved.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
        const owed = {}; let late = 0, open = 0;
        list.forEach(s => {
            const c = C.compute(s, s.style), stt = C.statusText(s, t), cur = s.id === inv().id;
            if (s.status !== 'paid') { open++; owed[s.cur] = (owed[s.cur] || 0) + c.balance; if (stt.cls === 'late') late++; }
            const btn = (txt, fn, cls, label) => { const b = el('button', { type: 'button', text: txt, cls: cls || '', 'aria-label': label || (txt + ' ' + s.number) }); b.onclick = fn; return b; };
            const li = el('li', { cls: 's-item ' + stt.cls + (cur ? ' current' : '') }, [
                el('div', { cls: 's-top' }, [el('span', { cls: 's-no', text: s.number + (s.client.name.trim() ? ' · ' + s.client.name.trim() : '') }), el('span', { cls: 's-amt', text: C.money(s.status === 'paid' ? c.total : c.balance, s.cur, s.style) })]),
                el('p', { cls: 's-line' }, [el('span', { cls: 's-status ' + stt.cls, text: stt.text }), ' · ' + C.fmtDate(s.issue) + (cur ? ' · open in the form' : '')]),
                el('div', { cls: 's-btns' }, [
                    cur ? null : btn('Open', () => openSaved(s.id)),
                    btn(s.status === 'paid' ? 'Mark as not paid' : 'Mark as paid', () => togglePaid(s.id)),
                    btn('Copy as new', () => duplicate(s.id)),
                    btn('Delete', () => del(s.id), 'del')
                ])
            ]);
            ol.appendChild(li);
        });
        const owedText = Object.keys(owed).filter(k => owed[k]).map(k => C.money(owed[k], k, inv().style)).join(' + ');
        $('list-sum').textContent = !list.length ? 'No saved invoices yet. Tap Save to My invoices to keep one here.'
            : list.length + (list.length === 1 ? ' invoice' : ' invoices') + '. ' + (open ? open + ' not paid' + (owedText ? ': ' + owedText + ' still to come in' : '') + (late ? ', ' + late + ' overdue' : '') + '.' : 'All paid.');
        $('backup').disabled = !list.length && !state.me.name;
    }
    const find = id => state.saved.findIndex(s => s.id === id);
    function openSaved(id) { const s = state.saved[find(id)]; if (s) { loadInvoice(copy(s), 'Opened ' + s.number + '.'); window.scrollTo({ top: 0 }); } }
    function togglePaid(id) {
        const i = find(id); if (i < 0) return; const s = state.saved[i];
        s.status = s.status === 'paid' ? 'unpaid' : 'paid';
        if (inv().id === id) inv().status = s.status;
        save(); render();
        say('list-msg', s.number + (s.status === 'paid' ? ' marked as paid.' : ' marked as not paid.'), () => togglePaid(id));
    }
    function duplicate(id) {
        const s = state.saved[find(id)]; if (!s) return;
        const n = copy(s), t = C.today();
        if (s.terms === 'custom' && C.isYmd(s.due)) n.due = C.addDays(t, C.daysBetween(s.issue, s.due));
        Object.assign(n, { id: C.newId(), number: C.nextNumber(state.saved), issue: t, status: 'unpaid', paidOn: false, paid: '', created: 0 });
        loadInvoice(n, 'New invoice ' + n.number + ' made from ' + s.number + '. Check the items and dates, then save it.');
        window.scrollTo({ top: 0 });
    }
    function del(id) {
        const i = find(id); if (i < 0) return; const s = state.saved[i];
        state.saved.splice(i, 1); save(); render();
        say('list-msg', 'Deleted ' + s.number + '.', () => { state.saved.splice(i, 0, s); save(); render(); });
    }
    $('backup').onclick = () => {
        const data = JSON.stringify({ app: SLUG, saved: new Date().toISOString(), state }, null, 1);
        const a = el('a', { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: 'invoices-backup-' + C.today() + '.json' });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        say('list-msg', 'Backup downloaded. Keep the file somewhere safe.');
    };
    $('restore').onclick = () => $('restore-file').click();
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; $('restore-file').value = '';
        if (!f) return;
        if (f.size > 20000000) return say('list-msg', 'That file is too big to be a backup from this app.');
        const r = new FileReader();
        r.onload = () => {
            let d; try { d = JSON.parse(r.result); } catch (e) { d = null; }
            if (!d || d.app !== SLUG || !d.state || typeof d.state !== 'object' || !Array.isArray(d.state.saved)) return say('list-msg', 'That file is not a backup from this app.');
            const before = copy(state);
            state = C.clean(d.state); showAll = false; touched.clear();
            fillForm(); save(); render();
            say('list-msg', 'Restored ' + state.saved.length + (state.saved.length === 1 ? ' invoice' : ' invoices') + ' and ' + state.clients.length + (state.clients.length === 1 ? ' client.' : ' clients.'), () => { state = before; fillForm(); save(); render(); });
        };
        r.onerror = () => say('list-msg', 'That file could not be read.');
        r.readAsText(f);
    });

    // a new day: status lines ("Due today") move on
    setInterval(() => { const t = C.today(); if (t !== lastDay) { lastDay = t; render(); } }, 60000);

    state = load();
    if (!saving) setTimeout(() => say('act-msg', 'Your browser is blocking storage, so nothing will be kept after you close this page.'), 0);
    fillForm(); render();

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
