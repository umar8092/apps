// Order Book for Home Bakers and Caterers: the page. The sums are in core.js.
(function () {
    'use strict';
    const C = window.OrderCore;
    const KEY = 'order-book-for-home-bakers-and-caterers.state';
    const $ = id => document.getElementById(id);
    const app = $('app');

    // ---------- saved state ----------
    let canSave = true;
    function blank() { return { v: 1, cur: '', style: 'intl', limit: 0, shop: '', nextId: 1, orders: [] }; }
    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return blank();
            return C.cleanState(JSON.parse(raw)) || blank();
        } catch (e) { return blank(); }   // corrupt or blocked: start fresh
    }
    let S = load();
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(S)); canSave = true; }
        catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    try { localStorage.setItem(KEY + '.test', '1'); localStorage.removeItem(KEY + '.test'); } catch (e) { canSave = false; $('storage-warn').hidden = false; }

    const today = () => C.localISO(new Date());
    const money = c => C.fmtMoney(c, S.cur, S.style);
    const byId = id => S.orders.find(o => o.id === id);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

    // ---------- small DOM helpers (user text always goes in with textContent) ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }

    // messages with an optional Undo or extra button
    const timers = {};
    function say(boxId, text, opts) {
        const box = $(boxId); opts = opts || {};
        box.textContent = ''; box.classList.remove('show'); clearTimeout(timers[boxId]);
        if (!text) return;
        box.appendChild(el('span', null, text));
        if (opts.undo) box.appendChild(btn('Undo', 'undo', () => { opts.undo(); say(boxId, 'Undone.'); }));
        if (opts.extra) box.appendChild(btn(opts.extra[0], 'undo', opts.extra[1]));
        box.classList.add('show');
        timers[boxId] = setTimeout(() => { box.textContent = ''; box.classList.remove('show'); }, opts.undo || opts.extra ? 15000 : 5000);
    }
    function snapshot() { return JSON.stringify(S); }
    function restoreSnap(snap) { S = C.cleanState(JSON.parse(snap)) || blank(); save(); fillSettings(); render(); }

    async function copyText(text, msgId) {
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px'; document.body.appendChild(t); t.select();
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
            t.remove();
        }
        say(msgId, ok ? 'Copied. Paste it in a message or note.' : 'Could not copy here. Select the text and copy it yourself.');
        return ok;
    }
    function download(name, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    // ---------- settings ----------
    const CUR_LABELS = { '': 'None', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'Tk': 'Tk (taka)', 'RM': 'RM (ringgit)', 'R': 'R (rand)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)', '₱': '₱ (peso)', '¥': '¥ (yen or yuan)' };
    C.CURS.forEach(c => { const o = el('option', null, CUR_LABELS[c] || c); o.value = c; $('s-cur').appendChild(o); });
    { const o = el('option', null, 'No limit'); o.value = '0'; $('s-limit').appendChild(o); for (let i = 1; i <= 30; i++) { const p = el('option', null, plural(i, 'order') + ' a day'); p.value = String(i); $('s-limit').appendChild(p); } }
    function fillSettings() {
        $('s-cur').value = S.cur; $('s-style').value = S.style;
        $('s-limit').value = String(S.limit <= 30 ? S.limit : 30);
        $('s-shop').value = S.shop;
        if (S.shop) { $('w-shop').hidden = false; $('o-shop').hidden = true; }
        document.querySelectorAll('.cur').forEach(s => { s.textContent = S.cur; });
    }
    $('s-cur').addEventListener('change', () => { S.cur = $('s-cur').value; save(); fillSettings(); render(); preview(); });
    $('s-style').addEventListener('change', () => { S.style = $('s-style').value; save(); render(); preview(); });
    $('s-limit').addEventListener('change', () => { S.limit = Number($('s-limit').value) || 0; save(); preview(); });
    $('s-shop').addEventListener('input', () => { S.shop = $('s-shop').value.trim().slice(0, 60); save(); });
    $('o-shop').addEventListener('click', () => { $('w-shop').hidden = false; $('o-shop').hidden = true; $('s-shop').focus(); });

    // ---------- the form ----------
    const timeSel = $('f-time');
    { const a = el('option', null, 'Any time'); a.value = ''; timeSel.appendChild(a);
      for (let m = 0; m < 1440; m += 30) { const v = C.pad(Math.floor(m / 60)) + ':' + C.pad(m % 60); const o = el('option', null, C.fmtTime(v)); o.value = v; timeSel.appendChild(o); }
      const x = el('option', null, 'Other time...'); x.value = 'other'; timeSel.appendChild(x); }
    let editing = null;   // id of the order being edited
    const reveal = (link, wrap, focusId) => { $(wrap).hidden = false; $(link).hidden = true; if (focusId) $(focusId).focus(); };
    [['o-phone', 'w-phone', 'f-phone'], ['o-note', 'w-note', 'f-note'], ['o-addr', 'w-addr', 'f-addr'], ['o-deliv', 'w-deliv', 'f-deliv'], ['o-adv', 'w-adv', 'f-adv']]
        .forEach(([l, w, f]) => $(l).addEventListener('click', () => reveal(l, w, f)));
    const mode = () => ($('m-delivery').checked ? 'delivery' : 'pickup');
    function showMode() { $('w-delivery').hidden = mode() !== 'delivery'; }
    document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { showMode(); preview(); }));
    timeSel.addEventListener('change', () => {
        const other = timeSel.value === 'other';
        $('f-time-other').hidden = !other;
        if (other) $('f-time-other').focus();
        preview();
    });
    function timeValue() { if (timeSel.value === 'other') return $('f-time-other').value || ''; return timeSel.value; }
    function setTime(t) {
        if (!t) { timeSel.value = ''; $('f-time-other').hidden = true; $('f-time-other').value = ''; return; }
        if (/:(00|30)$/.test(t)) { timeSel.value = t; $('f-time-other').hidden = true; $('f-time-other').value = ''; }
        else { timeSel.value = 'other'; $('f-time-other').hidden = false; $('f-time-other').value = t; }
    }

    function setErr(id, text) {
        $('e-' + id).textContent = text || '';
        const input = $('f-' + id); if (input) input.setAttribute('aria-invalid', text ? 'true' : 'false');
    }
    // reads the form; returns { order fields } or null with errors shown
    function readForm(showErrors) {
        const v = {
            name: $('f-name').value.trim(), phone: $('w-phone').hidden ? '' : $('f-phone').value.trim(),
            what: $('f-what').value.trim(), note: $('w-note').hidden ? '' : $('f-note').value.trim(),
            date: $('f-date').value, time: timeValue(), mode: mode(),
            addr: mode() === 'delivery' && !$('w-addr').hidden ? $('f-addr').value.trim() : '',
        };
        const errs = {};
        if (!v.name) errs.name = 'Type the customer\'s name.';
        if (!v.what) errs.what = 'Type what they ordered.';
        if (!C.isDate(v.date)) errs.date = 'Pick the date.';
        const pr = $('f-price').value.trim();
        v.price = C.readMoney(pr);
        if (!pr) errs.price = 'Type the price (0 if it is free).';
        else if (Number.isNaN(v.price)) errs.price = 'Type a number such as 4500 or 4500.50, not below 0 or above 10,000,000,000.';
        const dv = mode() === 'delivery' && !$('w-deliv').hidden ? $('f-deliv').value.trim() : '';
        v.deliv = dv ? C.readMoney(dv) : 0;
        if (Number.isNaN(v.deliv)) errs.deliv = 'Type a number such as 250 (0 to 10,000,000,000), or leave it empty.';
        const av = $('w-adv').hidden ? '' : $('f-adv').value.trim();
        v.adv = av ? C.readMoney(av) : 0;
        if (Number.isNaN(v.adv)) errs.adv = 'Type a number such as 1500 (0 to 10,000,000,000), or leave it empty.';
        else if (!errs.price && !errs.deliv) {
            const later = editing ? byId(editing).pays.reduce((s, p) => s + p.amt, 0) : 0;
            const t = v.price + (v.mode === 'delivery' ? v.deliv : 0);
            if (v.adv + later > t) errs.adv = 'The advance is more than the total (' + money(t) + ').';
        }
        if (showErrors) ['name', 'what', 'date', 'price', 'deliv', 'adv'].forEach(k => setErr(k, errs[k]));
        return Object.keys(errs).length ? null : v;
    }
    function preview() {
        const v = readForm(false), pv = $('preview'), lw = $('limit-warn');
        lw.textContent = ''; pv.textContent = '';
        const d = $('f-date').value;
        if (C.isDate(d)) {
            const n = C.countOn(S.orders, d, editing);
            const t = today();
            let warn = '';
            if (S.limit && n >= S.limit) warn = C.fmtDate(d) + ' is full: you already have ' + plural(n, 'order') + ' (your limit is ' + S.limit + '). You can still add it.';
            else if (n) warn = 'Already ' + plural(n, 'order') + ' on ' + C.fmtDate(d) + (S.limit ? ' (limit ' + S.limit + ').' : '.');
            if (d < t && !editing) warn = (warn ? warn + ' ' : '') + 'This date has passed.';
            lw.textContent = warn;
            lw.classList.toggle('full', !!(S.limit && n >= S.limit));
        }
        if (!v) return;
        const t = v.price + (v.mode === 'delivery' ? v.deliv : 0);
        const later = editing ? byId(editing).pays.reduce((s, p) => s + p.amt, 0) : 0;
        const p = v.adv + later, b = t - p;
        pv.textContent = (v.mode === 'delivery' ? 'Delivery' : 'Pickup') + ' ' + C.fmtDate(v.date) + ', ' + C.fmtTime(v.time).toLowerCase() + '. Total ' + money(t) + (p ? ', paid ' + money(p) : '') + ', ' + (b > 0 ? 'balance ' + money(b) + ' to collect' : 'paid in full') + '.';
    }
    ['f-name', 'f-what', 'f-date', 'f-price', 'f-deliv', 'f-adv', 'f-time-other', 'f-phone', 'f-note', 'f-addr'].forEach(id => $(id).addEventListener('input', preview));
    $('f-date').addEventListener('change', preview);
    // a returning customer: fill in their phone number
    $('f-name').addEventListener('change', () => {
        const name = $('f-name').value.trim().toLowerCase();
        const c = C.customers(S.orders).find(x => x.name.toLowerCase() === name);
        if (c && c.phone && !$('f-phone').value.trim()) { $('f-phone').value = c.phone; $('w-phone').hidden = false; $('o-phone').hidden = true; }
    });

    function resetForm() {
        editing = null;
        $('form').reset();
        ['w-phone', 'w-note', 'w-addr', 'w-deliv', 'w-adv'].forEach(w => { $(w).hidden = true; });
        ['o-phone', 'o-note', 'o-addr', 'o-deliv', 'o-adv'].forEach(l => { $(l).hidden = false; });
        $('m-pickup').checked = true; showMode();
        setTime('');
        $('f-date').value = C.addDays(today(), 1);
        ['name', 'what', 'date', 'price', 'deliv', 'adv'].forEach(k => setErr(k, ''));
        $('form-h').textContent = 'Add an order';
        $('save').textContent = 'Add the order';
        $('l-adv').textContent = 'Advance paid';
        $('cancel').hidden = true; $('del').hidden = true;
        preview();
    }
    function fillForm(o, asCopy) {
        resetForm();
        editing = asCopy ? null : o.id;
        $('f-name').value = o.name;
        if (o.phone) { $('f-phone').value = o.phone; reveal('o-phone', 'w-phone'); }
        $('f-what').value = o.what;
        if (o.note) { $('f-note').value = o.note; reveal('o-note', 'w-note'); }
        if (!asCopy) $('f-date').value = o.date;
        setTime(o.time);
        (o.mode === 'delivery' ? $('m-delivery') : $('m-pickup')).checked = true; showMode();
        if (o.addr) { $('f-addr').value = o.addr; reveal('o-addr', 'w-addr'); }
        if (o.mode === 'delivery' && o.deliv) { $('f-deliv').value = (o.deliv / 100).toString(); reveal('o-deliv', 'w-deliv'); }
        $('f-price').value = (o.price / 100).toString();
        if (!asCopy && o.adv) { $('f-adv').value = (o.adv / 100).toString(); reveal('o-adv', 'w-adv'); }
        if (asCopy) { $('form-h').textContent = 'Add an order'; }
        else {
            $('form-h').textContent = 'Edit order #' + o.n;
            $('save').textContent = 'Save changes';
            if (o.pays.length) $('l-adv').textContent = 'Advance paid (later payments: ' + money(o.pays.reduce((s, p) => s + p.amt, 0)) + ')';
            $('del').hidden = false;
        }
        $('cancel').hidden = false;
        preview();
        $('add').scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => $(asCopy ? 'f-date' : 'f-name').focus({ preventScroll: true }), 300);
    }
    $('cancel').addEventListener('click', () => { resetForm(); render(); });
    $('jump-add').addEventListener('click', () => { $('add').scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => $('f-name').focus({ preventScroll: true }), 350); });
    $('form').addEventListener('submit', e => {
        e.preventDefault();
        const v = readForm(true);
        if (!v) { const first = document.querySelector('#form [aria-invalid="true"]'); if (first) first.focus(); return; }
        const snap = snapshot();
        let o;
        if (editing) {
            o = byId(editing);
            Object.assign(o, v);
            if (o.mode !== 'delivery') o.deliv = 0;
            say('form-msg', 'Order #' + o.n + ' for ' + o.name + ' is saved.', { undo: () => restoreSnap(snap) });
        } else {
            const id = S.nextId++;
            o = Object.assign({ id, n: id, pays: [], status: 'open', refund: false, created: today() }, v);
            S.orders.push(o);
            say('form-msg', 'Order #' + o.n + ' added for ' + C.fmtDate(o.date) + '.', { undo: () => restoreSnap(snap), extra: ['Send confirmation', () => openSheet(o.id, 'confirm')] });
        }
        save(); resetForm(); render();
    });
    $('del').addEventListener('click', () => { if (editing) { const id = editing; resetForm(); removeOrder(id); } });
    function removeOrder(id) {
        const o = byId(id); if (!o) return;
        const snap = snapshot();
        S.orders = S.orders.filter(x => x.id !== id);
        save(); render();
        say(S.orders.length ? 'list-msg' : 'form-msg', 'Order #' + o.n + ' for ' + o.name + ' deleted.', { undo: () => restoreSnap(snap) });
    }

    // ---------- coming up ----------
    function dayBlock(label, d) {
        const wrap = el('div', 'day-sum');
        const head = el('p', 'big');
        head.appendChild(el('span', 'day-name', label + ', ' + C.fmtDate(d.date)));
        const line = el('span', 'day-line');
        if (!d.count) line.textContent = 'No orders';
        else { line.appendChild(el('strong', null, plural(d.count, 'order'))); line.appendChild(document.createTextNode(d.collect ? ' · collect ' : ' · all paid')); if (d.collect) line.appendChild(el('strong', null, money(d.collect))); }
        head.appendChild(line);
        wrap.appendChild(head);
        if (d.count) {
            const ul = el('ul', 'mini-list');
            d.list.forEach(o => {
                const li = el('li');
                li.appendChild(el('b', null, C.fmtTime(o.time)));
                li.appendChild(el('span', null, o.name + ': ' + o.what + (o.status === 'ready' ? ' (ready)' : '')));
                ul.appendChild(li);
            });
            wrap.appendChild(ul);
        }
        return wrap;
    }
    function statBlock(label, st) {
        const box = el('div', 'stat');
        box.appendChild(el('h3', null, label));
        const dl = el('dl');
        [['Orders', String(st.count)], ['Sales', money(st.sales)], ['Received', money(st.received)], ['Still to collect', money(st.toCollect)]].forEach(([k, v]) => {
            const d = el('div'); d.appendChild(el('dt', null, k)); d.appendChild(el('dd', null, v)); dl.appendChild(d);
        });
        box.appendChild(dl);
        return box;
    }
    function renderSummary(t) {
        const s = C.summary(S.orders, t), body = $('sum-body');
        body.textContent = '';
        body.appendChild(dayBlock('Today', s.today));
        body.appendChild(dayBlock('Tomorrow', s.tomorrow));
        if (s.late.length) {
            const w = el('div', 'alert');
            w.appendChild(el('b', null, 'Not handed over yet from earlier days: ' + plural(s.late.length, 'order')));
            const ul = el('ul');
            s.late.forEach(o => ul.appendChild(el('li', null, C.fmtDate(o.date) + ' (' + C.relDay(o.date, t) + '): ' + o.name + ', ' + o.what)));
            w.appendChild(ul); body.appendChild(w);
        }
        if (s.owed.length) {
            const w = el('div', 'alert');
            const sum = s.owed.reduce((a, o) => a + C.balance(o), 0);
            w.appendChild(el('b', null, 'Still owed: ' + money(sum) + ' from ' + plural(s.owed.length, 'order') + ' already handed over'));
            const ul = el('ul');
            s.owed.forEach(o => ul.appendChild(el('li', null, o.name + ' owes ' + money(C.balance(o)) + ' (' + C.fmtDate(o.date) + ', ' + o.what + ')')));
            w.appendChild(ul); body.appendChild(w);
        }
        const wrap = el('div', 'stats');
        wrap.appendChild(statBlock('This week', s.week));
        wrap.appendChild(statBlock(C.monthName(t), s.month));
        body.appendChild(wrap);
        body.appendChild(el('p', 'hint', 'This week is ' + C.fmtDate(s.week.from) + ' to ' + C.fmtDate(s.week.to) + '. Counted by order date.'));
    }
    $('copy-today').addEventListener('click', () => copyText(C.dayListText(S.orders, today(), S.cur, S.style), 'sum-msg'));
    $('copy-tomorrow').addEventListener('click', () => copyText(C.dayListText(S.orders, C.addDays(today(), 1), S.cur, S.style), 'sum-msg'));

    // ---------- the order list ----------
    let tab = 'upcoming', panel = null;   // panel: { id, kind: 'pay' | 'cancel' }
    document.querySelectorAll('input[name=tab]').forEach(r => r.addEventListener('change', () => { tab = r.value; panel = null; renderList(today()); }));
    $('q').addEventListener('input', () => renderList(today()));

    function orderBox(o, t) {
        const box = el('article', 'box ' + o.status + (C.balance(o) > 0 && o.status === 'done' ? ' owes' : ''));
        box.dataset.id = o.id;
        const top = el('div', 'box-top');
        const h = el('h4', 'box-name');
        h.appendChild(el('span', 'when', C.fmtTime(o.time)));
        h.appendChild(document.createTextNode(' ' + o.name));
        top.appendChild(h);
        top.appendChild(el('span', 'badge ' + o.status, C.STATUS[o.status]));
        box.appendChild(top);
        box.appendChild(el('p', 'what', o.what));
        if (o.note) box.appendChild(el('p', 'note', '"' + o.note + '"'));
        const meta = el('p', 'box-sub');
        meta.textContent = '#' + o.n + ' · ' + (o.mode === 'delivery' ? 'Delivery' + (o.addr ? ' to ' + o.addr : '') : 'Pickup') + (tab !== 'upcoming' ? ' · ' + C.fmtDateY(o.date) : '');
        box.appendChild(meta);
        if (o.phone) {
            const ph = el('p', 'box-sub');
            const a = el('a', null, o.phone); a.href = 'tel:' + o.phone.replace(/[^\d+]/g, '');
            ph.appendChild(document.createTextNode('Phone: ')); ph.appendChild(a); box.appendChild(ph);
        }
        const b = C.balance(o);
        box.appendChild(el('p', 'line' + (b > 0 ? ' due' : o.status === 'cancel' ? '' : ' good'), C.moneyLine(o, S.cur, S.style)));
        if (o.pays.length) box.appendChild(el('p', 'box-sub', 'Paid later: ' + o.pays.map(p => money(p.amt) + ' on ' + C.fmtDate(p.d)).join(', ')));

        const btns = el('div', 'box-btns');
        const who = ' for ' + o.name + ' (#' + o.n + ')';
        if (C.isActive(o)) {
            btns.appendChild(btn(o.status === 'ready' ? 'Not ready yet' : 'Mark ready', 'mini' + (o.status === 'ready' ? ' on' : ''), () => setStatus(o.id, o.status === 'ready' ? 'open' : 'ready'), (o.status === 'ready' ? 'Not ready yet' : 'Mark ready') + who));
            if (b > 0) {
                btns.appendChild(btn('Handed over and paid', 'mini strong', () => handOver(o.id, true), 'Handed over and paid' + who));
                btns.appendChild(btn('Handed over, pays later', 'mini', () => handOver(o.id, false), 'Handed over, pays later' + who));
            } else btns.appendChild(btn('Handed over', 'mini strong', () => handOver(o.id, false), 'Handed over' + who));
        }
        if (o.status !== 'cancel' && b > 0) btns.appendChild(btn('Record a payment', 'mini' + (panel && panel.id === o.id && panel.kind === 'pay' ? ' on' : ''), () => togglePanel(o.id, 'pay'), 'Record a payment' + who));
        if (o.status !== 'cancel') btns.appendChild(btn('Message', 'mini', () => openSheet(o.id, C.isActive(o) ? (o.date <= C.addDays(t, 1) ? (o.status === 'ready' ? 'ready' : 'remind') : 'confirm') : 'pay'), 'Message' + who));
        if (o.status === 'done') btns.appendChild(btn('Not handed over', 'mini', () => setStatus(o.id, 'open'), 'Not handed over' + who));
        if (o.status === 'cancel') btns.appendChild(btn('Restore order', 'mini', () => setStatus(o.id, 'open'), 'Restore order' + who));
        btns.appendChild(btn('Edit', 'mini', () => fillForm(o, false), 'Edit' + who));
        if (!C.isActive(o)) btns.appendChild(btn('Order again', 'mini', () => fillForm(o, true), 'Order again' + who));
        if (C.isActive(o)) btns.appendChild(btn('Cancel order', 'mini del' + (panel && panel.id === o.id && panel.kind === 'cancel' ? ' on' : ''), () => togglePanel(o.id, 'cancel'), 'Cancel order' + who));
        btns.appendChild(btn('Delete', 'mini del', () => removeOrder(o.id), 'Delete' + who));
        box.appendChild(btns);
        if (panel && panel.id === o.id) box.appendChild(panel.kind === 'pay' ? payPanel(o) : cancelPanel(o));
        return box;
    }
    function payPanel(o) {
        const f = el('form', 'panel'); f.noValidate = true;
        f.appendChild(el('h5', null, 'Record a payment'));
        const two = el('div', 'two');
        const d1 = el('div'), l1 = el('label', null, 'Date paid'), i1 = el('input');
        i1.type = 'date'; i1.id = 'p-date-' + o.id; l1.htmlFor = i1.id; i1.value = today(); d1.append(l1, i1);
        const d2 = el('div'), l2 = el('label', null, 'Amount'), wrap = el('div', 'inline money'), cur = el('span', 'unit pre cur', S.cur), i2 = el('input');
        i2.type = 'text'; i2.inputMode = 'decimal'; i2.maxLength = 16; i2.autocomplete = 'off'; i2.id = 'p-amt-' + o.id; l2.htmlFor = i2.id; i2.value = (C.balance(o) / 100).toString();
        cur.setAttribute('aria-hidden', 'true'); wrap.append(cur, i2); d2.append(l2, wrap);
        two.append(d1, d2); f.appendChild(two);
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); f.appendChild(err);
        f.appendChild(el('p', 'hint', 'Balance before this payment: ' + money(C.balance(o)) + '.'));
        const row = el('div', 'row-btns');
        const sv = el('button', 'primary', 'Save payment'); sv.type = 'submit';
        row.append(sv, btn('Cancel', 'secondary', () => { panel = null; renderList(today()); }));
        f.appendChild(row);
        f.addEventListener('submit', e => {
            e.preventDefault();
            const amt = C.readMoney(i2.value);
            if (!C.isDate(i1.value)) { err.textContent = 'Pick the date it was paid.'; i1.focus(); return; }
            if (Number.isNaN(amt) || amt <= 0) { err.textContent = 'Type the amount paid, such as 1500.'; i2.focus(); return; }
            if (amt > C.balance(o)) { err.textContent = 'That is more than the balance (' + money(C.balance(o)) + ').'; i2.focus(); return; }
            const snap = snapshot();
            o.pays.push({ d: i1.value, amt });
            panel = null; save(); render();
            say('list-msg', money(amt) + ' recorded for ' + o.name + '. ' + (C.balance(o) > 0 ? 'Balance now ' + money(C.balance(o)) + '.' : 'Paid in full.'), { undo: () => restoreSnap(snap) });
        });
        setTimeout(() => i2.focus(), 0);
        return f;
    }
    function cancelPanel(o) {
        const p = el('div', 'panel');
        p.appendChild(el('h5', null, 'Cancel order #' + o.n + '?'));
        const paidAmt = C.paid(o);
        const row = el('div', 'row-btns');
        if (paidAmt > 0) {
            p.appendChild(el('p', 'hint', o.name + ' paid ' + money(paidAmt) + '. What happened to it?'));
            row.appendChild(btn('Kept the advance', 'secondary', () => cancelOrder(o.id, false)));
            row.appendChild(btn('Gave the advance back', 'secondary', () => cancelOrder(o.id, true)));
        } else row.appendChild(btn('Yes, cancel it', 'secondary', () => cancelOrder(o.id, false)));
        row.appendChild(btn('Keep the order', 'secondary', () => { panel = null; renderList(today()); }));
        p.appendChild(row);
        return p;
    }
    function togglePanel(id, kind) { panel = panel && panel.id === id && panel.kind === kind ? null : { id, kind }; renderList(today()); }
    function setStatus(id, st) {
        const o = byId(id), snap = snapshot();
        o.status = st; if (st !== 'cancel') o.refund = false;
        panel = null; save(); render();
        const text = st === 'ready' ? 'Order #' + o.n + ' is ready.' : st === 'open' ? 'Order #' + o.n + ' is back in "To make".' : '';
        if (text) say('list-msg', text, { undo: () => restoreSnap(snap), extra: st === 'ready' ? ['Tell the customer', () => openSheet(id, 'ready')] : null });
    }
    function handOver(id, payNow) {
        const o = byId(id), snap = snapshot(), b = C.balance(o);
        if (payNow && b > 0) o.pays.push({ d: today(), amt: b });
        o.status = 'done'; panel = null; save(); render();
        say('list-msg', 'Order #' + o.n + ' handed over to ' + o.name + '. ' + (C.balance(o) > 0 ? money(C.balance(o)) + ' still owed.' : 'Paid in full.'), { undo: () => restoreSnap(snap) });
    }
    function cancelOrder(id, refund) {
        const o = byId(id), snap = snapshot();
        o.status = 'cancel'; o.refund = refund && C.paid(o) > 0; panel = null; save(); render();
        say('list-msg', 'Order #' + o.n + ' cancelled' + (C.paid(o) ? (o.refund ? ', ' + money(C.paid(o)) + ' given back.' : ', you kept ' + money(C.paid(o)) + '.') : '.'), { undo: () => restoreSnap(snap) });
    }

    function renderList(t) {
        const counts = { upcoming: S.orders.filter(C.isActive).length, done: S.orders.filter(o => o.status === 'done').length, cancel: S.orders.filter(o => o.status === 'cancel').length, all: S.orders.length };
        Object.keys(counts).forEach(k => { $('n-' + k).textContent = '(' + counts[k] + ')'; });
        const v = C.listView(S.orders, tab, t, $('q').value), host = $('groups');
        host.textContent = '';
        if (!v.count) {
            const q = $('q').value.trim();
            host.appendChild(el('p', 'empty', q ? 'No orders match "' + q + '".' : tab === 'upcoming' ? 'Nothing to make. New orders you add show here.' : tab === 'done' ? 'No orders handed over yet.' : tab === 'cancel' ? 'No cancelled orders.' : 'No orders yet.'));
            return;
        }
        v.groups.forEach(g => {
            const sec = el('section', 'group' + (g.late ? ' late' : ''));
            const h = el('h3', 'group-h');
            if (g.late) h.textContent = 'Earlier days, not handed over yet';
            else {
                h.appendChild(el('span', null, C.fmtDate(g.date) + (Math.abs(C.daysBetween(t, g.date)) <= 1 || tab === 'upcoming' ? ' (' + C.relDay(g.date, t) + ')' : '')));
                h.appendChild(el('small', null, plural(g.list.length, 'order') + (g.collect ? ' · collect ' + money(g.collect) : '')));
            }
            sec.appendChild(h);
            const ul = el('div', 'box-list');
            g.list.forEach(o => ul.appendChild(orderBox(o, t)));
            sec.appendChild(ul);
            host.appendChild(sec);
        });
    }
    function render() {
        const t = today(), any = S.orders.length > 0;
        app.classList.toggle('setup', !any);
        $('sum').hidden = !any; $('list').hidden = !any; $('jump-add').hidden = !any;
        if (any) { renderSummary(t); renderList(t); }
        const dl = $('cust-list'); dl.textContent = '';
        C.customers(S.orders).forEach(c => { const o = el('option'); o.value = c.name; dl.appendChild(o); });
    }

    // ---------- messages for the customer ----------
    const sheet = $('sheet');
    let sheetId = null;
    function waHref(o, text) {
        const raw = (o.phone || '').trim();
        let digits = raw.replace(/\D/g, '');
        if (raw.startsWith('00')) digits = digits.slice(2);
        const intl = (raw.startsWith('+') || raw.startsWith('00')) && digits.length >= 8;
        return 'https://wa.me/' + (intl ? digits : '') + '?text=' + encodeURIComponent(text);
    }
    function fillSheet() {
        const o = byId(sheetId); if (!o) return;
        const kind = document.querySelector('input[name=kind]:checked').value;
        $('sheet-text').value = C.message(o, kind, S.cur, S.style, S.shop);
        $('sheet-h').textContent = 'Message for ' + o.name;
        $('sheet-wa').href = waHref(o, $('sheet-text').value);
        $('sheet-wa').textContent = o.phone && /^(\+|00)/.test(o.phone.trim()) ? 'Open WhatsApp chat' : 'Open WhatsApp';
        say('sheet-msg', '');
    }
    function openSheet(id, kind) {
        sheetId = id;
        $('k-' + kind).checked = true;
        fillSheet();
        $('sheet-share').hidden = !navigator.share;
        if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
        $('sheet-text').focus();
    }
    document.querySelectorAll('input[name=kind]').forEach(r => r.addEventListener('change', fillSheet));
    $('sheet-text').addEventListener('input', () => { const o = byId(sheetId); if (o) $('sheet-wa').href = waHref(o, $('sheet-text').value); });
    $('sheet-copy').addEventListener('click', () => copyText($('sheet-text').value, 'sheet-msg'));
    $('sheet-share').addEventListener('click', () => { navigator.share({ text: $('sheet-text').value }).catch(() => {}); });
    $('sheet-close').addEventListener('click', () => sheet.close());
    sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });

    // ---------- backup ----------
    $('csv').addEventListener('click', () => {
        if (!S.orders.length) return say('set-msg', 'There are no orders to save yet.');
        download('orders-' + today() + '.csv', '﻿' + C.csv(S.orders), 'text/csv');
        say('set-msg', 'Saved ' + plural(S.orders.length, 'order') + ' as a CSV file.');
    });
    $('backup').addEventListener('click', () => {
        download('order-book-backup-' + today() + '.json', JSON.stringify(S, null, 1), 'application/json');
        say('set-msg', 'Backup file saved. Keep it somewhere safe.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
            let next = null;
            try { next = C.cleanState(JSON.parse(String(r.result))); } catch (e) { next = null; }
            $('restore-file').value = '';
            if (!next) return say('set-msg', 'That file is not an Order Book backup. Nothing was changed.');
            const snap = snapshot();
            S = next; save(); fillSettings(); resetForm(); render();
            say('set-msg', 'Backup restored: ' + plural(S.orders.length, 'order') + '.', { undo: () => restoreSnap(snap) });
        };
        r.onerror = () => say('set-msg', 'Could not read that file.');
        r.readAsText(f);
    });
    $('wipe').addEventListener('click', () => {
        if (!S.orders.length) return say('set-msg', 'There is nothing to delete.');
        const snap = snapshot();
        const keep = { cur: S.cur, style: S.style, limit: S.limit, shop: S.shop };
        S = Object.assign(blank(), keep); save(); resetForm(); render();
        say('set-msg', 'Every order is deleted.', { undo: () => restoreSnap(snap) });
    });

    // ---------- start ----------
    fillSettings(); resetForm(); render();
    // a new day while the page stays open: refresh Today and Tomorrow
    let lastDay = today();
    setInterval(() => { if (today() !== lastDay) { lastDay = today(); render(); } }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== lastDay) { lastDay = today(); render(); } });
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
