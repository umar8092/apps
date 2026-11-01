// Online Orders and Cash on Delivery Tracker: the page. The sums are in core.js.
(function () {
    'use strict';
    const C = window.ParcelCore;
    const KEY = 'online-orders-and-cash-on-delivery-tracker.state';
    const $ = id => document.getElementById(id);
    const app = $('app');

    // ---------- saved state ----------
    let canSave = true;
    function blank() { return { v: 1, cur: '', style: 'intl', nextId: 1, orders: [] }; }
    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return blank();
            return C.cleanState(JSON.parse(raw));
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
    const curOf = o => (o && o.cur) || S.cur;
    const money = (c, o) => C.fmtMoney(c, curOf(o), S.style);
    const multi = m => C.fmtMulti(m, S.cur, S.style);
    const byId = id => S.orders.find(o => o.id === id);
    const plural = C.plural;
    const centsText = c => (c / 100).toString();

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
    function restoreSnap(snap) { S = C.cleanState(JSON.parse(snap)); save(); fillSettings(); render(); }

    async function copyText(text, msgId, okText) {
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px'; document.body.appendChild(t); t.select();
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
            t.remove();
        }
        say(msgId, ok ? (okText || 'Copied. Paste it in a message or note.') : 'Could not copy here. Select the text and copy it yourself.');
        return ok;
    }
    function download(name, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    // ---------- settings ----------
    const CUR_LABELS = { '': 'None', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (riyal)', 'Tk': 'Tk (taka)', 'RM': 'RM (ringgit)', 'R': 'R (rand)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)', '₱': '₱ (peso)', '¥': '¥ (yen or yuan)', '₺': '₺ (lira)', 'Rp': 'Rp (rupiah)', '฿': '฿ (baht)', 'E£': 'E£ (Egyptian pound)' };
    C.CURS.forEach(c => { const o = el('option', null, CUR_LABELS[c] || c); o.value = c; $('s-cur').appendChild(o); });
    function fillOrderCurs() {
        const sel = $('f-cur'), keep = sel.value; sel.textContent = '';
        const m = el('option', null, 'Same as usual' + (S.cur ? ' (' + S.cur + ')' : '')); m.value = ''; sel.appendChild(m);
        C.CURS.filter(c => c && c !== S.cur).forEach(c => { const o = el('option', null, CUR_LABELS[c] || c); o.value = c; sel.appendChild(o); });
        sel.value = keep !== S.cur && [...sel.options].some(o => o.value === keep) ? keep : '';
    }
    function fillSettings() {
        $('s-cur').value = S.cur; $('s-style').value = S.style;
        fillOrderCurs(); showCur();
    }
    $('s-cur').addEventListener('change', () => { S.cur = $('s-cur').value; S.orders.forEach(o => { if (o.cur === S.cur) o.cur = ''; }); save(); fillSettings(); render(); preview(); });
    $('s-style').addEventListener('change', () => { S.style = $('s-style').value; save(); render(); preview(); });

    // ---------- the form ----------
    const EXP = [['', 'Not sure yet'], ['0', 'Today'], ['1', 'Tomorrow'], ['2', 'In 2 days'], ['3', 'In 3 days'], ['4', 'In 4 days'], ['5', 'In 5 days'], ['7', 'In 1 week'], ['10', 'In 10 days'], ['14', 'In 2 weeks'], ['21', 'In 3 weeks'], ['30', 'In 1 month'], ['date', 'Pick a date...']];
    function fillExp() {
        const sel = $('f-exp'), keep = sel.value, t = today(); sel.textContent = '';
        EXP.forEach(([v, t2]) => { const o = el('option', null, v && v !== 'date' ? t2 + ' (' + C.fmtDate(C.addDays(t, Number(v))) + ')' : t2); o.value = v; sel.appendChild(o); });
        sel.value = keep || '';
    }
    const RET = [['0', 'No return window'], ['7', '7 days'], ['10', '10 days'], ['14', '14 days'], ['15', '15 days'], ['30', '30 days'], ['other', 'Other number of days...']];
    function fillRetSelect(sel) { RET.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sel.appendChild(o); }); }
    fillRetSelect($('f-ret'));
    const COURIERS = ['TCS', 'Leopards', 'M&P', 'PostEx', 'Trax', 'Daraz Express', 'Pakistan Post', 'Delhivery', 'Blue Dart', 'Ekart', 'India Post', 'Aramex', 'DHL', 'FedEx', 'UPS', 'USPS', 'Royal Mail', 'Evri', 'DPD', 'Yodel', 'Amazon Logistics', 'J&T Express', 'Ninja Van', 'SMSA', 'Emirates Post'];
    COURIERS.forEach(c => { const o = el('option'); o.value = c; $('courier-list').appendChild(o); });
    const SHOPS = ['Daraz', 'Amazon', 'Temu', 'Shein', 'AliExpress', 'Flipkart', 'Meesho', 'Myntra', 'Noon', 'Namshi', 'eBay', 'Etsy', 'Walmart', 'Argos', 'Lazada', 'Shopee', 'Jumia', 'Instagram shop', 'Facebook Marketplace', 'WhatsApp seller'];

    let editing = null;   // id of the order being edited
    const reveal = (link, wrap, focusId) => { $(wrap).hidden = false; $(link).hidden = true; if (focusId) $(focusId).focus(); };
    [['o-ordered', 'w-ordered', 'f-ordered'], ['o-track', 'w-track', 'f-track'], ['o-ret', 'w-ret', 'f-ret'], ['o-cur', 'w-cur', 'f-cur'], ['o-note', 'w-note', 'f-note']]
        .forEach(([l, w, f]) => $(l).addEventListener('click', () => { reveal(l, w, f); preview(); }));
    const pay = () => ($('p-online').checked ? 'online' : 'cod');
    function showCur() {
        const c = $('w-cur').hidden ? S.cur : ($('f-cur').value || S.cur);
        $('f-cur-label').textContent = c;
    }
    function showPay() {
        $('l-price').textContent = pay() === 'cod' ? 'Amount to pay the rider' : 'Amount you paid';
    }
    document.querySelectorAll('input[name=pay]').forEach(r => r.addEventListener('change', () => { showPay(); preview(); }));
    $('f-cur').addEventListener('change', () => { showCur(); preview(); });
    $('f-exp').addEventListener('change', () => {
        const d = $('f-exp').value === 'date';
        $('f-exp-date').hidden = !d;
        if (d) { if (!$('f-exp-date').value) $('f-exp-date').value = C.addDays(today(), 3); $('f-exp-date').focus(); }
        preview();
    });
    $('f-ret').addEventListener('change', () => { const o = $('f-ret').value === 'other'; $('f-ret-days').hidden = !o; if (o) $('f-ret-days').focus(); preview(); });
    function orderedValue() { return $('w-ordered').hidden ? (editing ? byId(editing).ordered : today()) : $('f-ordered').value; }
    function expValue() {
        const v = $('f-exp').value;
        if (v === '') return '';
        if (v === 'date') return $('f-exp-date').value;
        return C.addDays(today(), Number(v));
    }
    function readDays(sel, input) {
        const v = sel.value;
        if (v !== 'other') return Number(v) || 0;
        const t = input.value.trim();
        return /^\d{1,3}$/.test(t) && Number(t) >= 1 && Number(t) <= 365 ? Number(t) : NaN;
    }
    function setErr(id, text) {
        $('e-' + id).textContent = text || '';
        const input = $('f-' + id); if (input) input.setAttribute('aria-invalid', text ? 'true' : 'false');
    }
    // reads the form; returns the order fields, or null with the errors shown
    function readForm(showErrors) {
        const t = today();
        const v = {
            shop: $('f-shop').value.trim(), what: $('f-what').value.trim(), pay: pay(),
            ordered: orderedValue(), expected: expValue(),
            track: $('w-track').hidden ? '' : $('f-track').value.trim(), courier: $('w-track').hidden ? '' : $('f-courier').value.trim(), orderNo: $('w-track').hidden ? '' : $('f-orderno').value.trim(),
            retDays: $('w-ret').hidden ? 0 : readDays($('f-ret'), $('f-ret-days')),
            cur: $('w-cur').hidden ? '' : $('f-cur').value, note: $('w-note').hidden ? '' : $('f-note').value.trim(),
        };
        const errs = {};
        if (!v.what) errs.what = 'Type what you ordered.';
        const pr = $('f-price').value.trim();
        v.price = C.readMoney(pr);
        if (!pr) errs.price = 'Type the amount (0 if it is free).';
        else if (Number.isNaN(v.price)) errs.price = 'Type a number such as 1250 or 24.99, not below 0 or above 10,000,000,000.';
        if (!C.isDate(v.ordered)) errs.ordered = 'Pick the day you ordered it.';
        else if (v.ordered > t) errs.ordered = 'The order date cannot be after today.';
        if ($('f-exp').value === 'date' && !C.isDate(v.expected)) errs.exp = 'Pick the day it should arrive, or choose "Not sure yet".';
        else if (v.expected && C.isDate(v.ordered) && v.expected < v.ordered) errs.exp = 'It cannot arrive before the order date (' + C.fmtDate(v.ordered) + ').';
        if (Number.isNaN(v.retDays)) errs.ret = 'Type a number of days from 1 to 365.';
        if (showErrors) {
            ['what', 'price', 'ordered', 'exp'].forEach(k => setErr(k, errs[k]));
            $('e-ret').textContent = errs.ret || ''; $('f-ret-days').setAttribute('aria-invalid', errs.ret ? 'true' : 'false');
        }
        return Object.keys(errs).length ? null : v;
    }
    function preview() {
        const v = readForm(false), pv = $('preview');
        pv.textContent = '';
        if (!v) return;
        const f = c => C.fmtMoney(c, v.cur || S.cur, S.style), t = today();
        const when = !v.expected ? 'arrival date not known' : v.expected < t ? 'it was due ' + C.fmtDate(v.expected) + ', so it shows as late' : 'expected ' + C.relDay(v.expected, t) + (C.daysBetween(t, v.expected) > 1 ? ' (' + C.fmtDate(v.expected) + ')' : '');
        pv.textContent = (v.pay === 'cod' ? 'Cash on delivery: keep ' + f(v.price) + ' ready for the rider' : 'Paid online ' + f(v.price)) + ', ' + when + '.' + (v.retDays ? ' ' + plural(v.retDays, 'day') + ' to return it after it arrives.' : '');
    }
    ['f-shop', 'f-what', 'f-price', 'f-exp-date', 'f-ordered', 'f-ret-days', 'f-note', 'f-track'].forEach(id => $(id).addEventListener('input', preview));
    ['f-exp-date', 'f-ordered'].forEach(id => $(id).addEventListener('change', preview));

    function resetForm() {
        editing = null;
        $('form').reset();
        ['w-ordered', 'w-track', 'w-ret', 'w-cur', 'w-note'].forEach(w => { $(w).hidden = true; });
        ['o-ordered', 'o-track', 'o-ret', 'o-cur', 'o-note'].forEach(l => { $(l).hidden = false; });
        $('p-cod').checked = true; showPay();
        fillExp(); $('f-exp').value = ''; $('f-exp-date').hidden = true; $('f-exp-date').value = '';
        $('f-ret').value = '0'; $('f-ret-days').hidden = true;
        $('f-ordered').value = today(); $('f-ordered').max = today();
        fillOrderCurs(); $('f-cur').value = ''; showCur();
        ['what', 'price', 'ordered', 'exp'].forEach(k => setErr(k, '')); $('e-ret').textContent = '';
        $('form-h').textContent = 'Add an order';
        $('save').textContent = 'Add the order';
        $('cancel').hidden = true; $('del').hidden = true;
        preview();
    }
    function setRet(sel, input, days) {
        if (!days) { sel.value = '0'; input.hidden = true; input.value = ''; return; }
        if ([...sel.options].some(o => o.value === String(days))) { sel.value = String(days); input.hidden = true; input.value = ''; }
        else { sel.value = 'other'; input.hidden = false; input.value = String(days); }
    }
    function fillForm(o, asCopy) {
        resetForm();
        editing = asCopy ? null : o.id;
        $('f-shop').value = o.shop; $('f-what').value = o.what;
        (o.pay === 'online' ? $('p-online') : $('p-cod')).checked = true; showPay();
        $('f-price').value = centsText(o.price);
        if (!asCopy) {
            if (o.ordered !== today()) { $('f-ordered').value = o.ordered; reveal('o-ordered', 'w-ordered'); }
            if (o.expected) { $('f-exp').value = 'date'; $('f-exp-date').hidden = false; $('f-exp-date').value = o.expected; }
            if (o.track || o.courier || o.orderNo) { $('f-track').value = o.track; $('f-courier').value = o.courier; $('f-orderno').value = o.orderNo; reveal('o-track', 'w-track'); }
            if (o.note) { $('f-note').value = o.note; reveal('o-note', 'w-note'); }
        } else if (o.courier) { $('f-courier').value = o.courier; }
        if (o.retDays) { setRet($('f-ret'), $('f-ret-days'), o.retDays); reveal('o-ret', 'w-ret'); }
        if (o.cur) { $('f-cur').value = o.cur; reveal('o-cur', 'w-cur'); showCur(); }
        if (!asCopy) {
            $('form-h').textContent = 'Edit order #' + o.n;
            $('save').textContent = 'Save changes';
            $('del').hidden = false;
        }
        $('cancel').hidden = false;
        preview();
        $('add').scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => $(asCopy ? 'f-what' : 'f-shop').focus({ preventScroll: true }), 300);
    }
    $('cancel').addEventListener('click', () => { resetForm(); render(); });
    $('jump-add').addEventListener('click', () => { $('add').scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => $('f-shop').focus({ preventScroll: true }), 350); });
    $('form').addEventListener('submit', e => {
        e.preventDefault();
        const v = readForm(true);
        if (!v) { const first = document.querySelector('#form [aria-invalid="true"]'); if (first) first.focus(); return; }
        const snap = snapshot();
        if (editing) {
            const o = byId(editing);
            const wasPaid = C.paid(o);
            Object.assign(o, v);
            if (o.pay === 'online' && o.status === 'cancelled' && !wasPaid && !o.refundDue) o.refundDue = o.price;
            if (o.pay === 'cod' && o.status === 'coming') o.codPaid = o.price;
            if (o.refundDue > C.paid(o) && C.paid(o) > 0) o.refundDue = C.paid(o);
            Object.assign(o, C.cleanOrder(o));
            say('form-msg', 'Order #' + o.n + ' is saved.', { undo: () => restoreSnap(snap) });
        } else {
            const id = S.nextId++;
            const o = C.newOrder(Object.assign({ codPaid: v.price }, v), id);
            S.orders.push(o);
            say('form-msg', 'Added: ' + o.what + (o.pay === 'cod' ? '. Keep ' + money(o.price, o) + ' cash ready.' : '.'), { undo: () => restoreSnap(snap) });
            tab = 'coming'; $('t-coming').checked = true;
        }
        save(); resetForm(); render();
    });
    $('del').addEventListener('click', () => { if (editing) { const id = editing; resetForm(); removeOrder(id); } });
    function removeOrder(id) {
        const o = byId(id); if (!o) return;
        const snap = snapshot();
        S.orders = S.orders.filter(x => x.id !== id);
        panel = null; save(); render();
        say(S.orders.length ? 'list-msg' : 'form-msg', 'Deleted: ' + o.what + '.', { undo: () => restoreSnap(snap) });
    }

    // ---------- at a glance ----------
    function alertBlock(cls, title, items) {
        const w = el('div', 'alert' + (cls ? ' ' + cls : ''));
        w.appendChild(el('b', null, title));
        const ul = el('ul');
        items.forEach(t => ul.appendChild(el('li', null, t)));
        w.appendChild(ul);
        return w;
    }
    function renderSummary(t) {
        const s = C.summary(S.orders, t), body = $('sum-body');
        body.textContent = '';
        const cash = el('div', 'cash');
        cash.appendChild(el('p', 'k', 'On the way: ' + plural(s.coming.length, 'parcel')));
        if (s.cod.length && !C.isZero(s.cash)) {
            cash.appendChild(el('p', 'v', 'Keep ' + multi(s.cash) + ' cash ready'));
            cash.appendChild(el('p', 's', 'for ' + plural(s.cod.length, 'cash on delivery parcel') + (s.coming.length > s.cod.length ? '. ' + plural(s.coming.length - s.cod.length, 'parcel') + ' already paid online.' : '.')));
        } else {
            cash.appendChild(el('p', 'v', s.coming.length ? 'No cash needed' : 'Nothing on the way'));
            if (s.coming.length) cash.appendChild(el('p', 's', 'Nothing to pay the rider: every parcel on the way is paid or free.'));
        }
        body.appendChild(cash);
        if (s.soon.length) body.appendChild(alertBlock('info', 'Arriving today or tomorrow', s.soon.map(o => C.itemName(o) + ', ' + C.relDay(o.expected, t) + (o.pay === 'cod' ? ': pay ' + money(o.price, o) : ': paid online'))));
        if (s.late.length) body.appendChild(alertBlock('', 'Late: ' + plural(s.late.length, 'parcel'), s.late.map(o => C.itemName(o) + ', expected ' + C.fmtDate(o.expected) + ' (' + plural(C.daysBetween(o.expected, t), 'day') + ' late)')));
        if (s.returns.length) body.appendChild(alertBlock('good', 'You can still return ' + plural(s.returns.length, 'item'), s.returns.map(o => {
            const n = C.daysBetween(t, C.returnBy(o));
            return C.itemName(o) + ': return by ' + C.fmtDate(C.returnBy(o)) + (n === 0 ? ' (today is the last day)' : ' (' + plural(n, 'day') + ' left)');
        })));
        if (s.refunds.length) body.appendChild(alertBlock('', 'Refunds waiting: ' + multi(s.refundTotal) + ' from ' + plural(s.refunds.length, 'order'), s.refunds.map(o => {
            const d = C.endDate(o);
            return money(C.refundOwed(o), o) + ' for ' + C.itemName(o) + (d ? ', ' + plural(C.daysBetween(d, t), 'day') + ' since ' + (o.status === 'returning' ? 'you sent it back' : o.status === 'refused' ? 'you refused it' : 'it was cancelled') : '');
        })));
        const m = el('div', 'stat month');
        m.appendChild(el('h3', null, 'Ordered in ' + s.month.name));
        const dl = el('dl');
        [['Orders', String(s.month.count)], ['Paid so far', multi(s.month.spent)]].forEach(([k, v]) => { const d = el('div'); d.appendChild(el('dt', null, k)); d.appendChild(el('dd', null, v)); dl.appendChild(d); });
        m.appendChild(dl);
        const extra = [];
        if (!C.isZero(s.month.refunded)) extra.push('After ' + multi(s.month.refunded) + ' refunded.');
        if (s.month.shops.length) extra.push('Most from: ' + s.month.shops.slice(0, 3).map(x => x.shop + ' (' + x.n + ')').join(', ') + '.');
        if (s.cod.length) extra.push('Cash on delivery counts once you pay the rider.');
        if (extra.length) m.appendChild(el('p', 'shops', extra.join(' ')));
        body.appendChild(m);
        $('copy-coming').hidden = !s.coming.length;
    }
    $('copy-coming').addEventListener('click', () => copyText(C.comingText(S.orders, today(), S.cur, S.style), 'sum-msg'));

    // ---------- the order list ----------
    let tab = 'coming', panel = null;   // panel: { id, kind: 'arrived' | 'cancel' | 'return' | 'refund' }
    document.querySelectorAll('input[name=tab]').forEach(r => r.addEventListener('change', () => { tab = r.value; panel = null; renderList(today()); }));
    $('q').addEventListener('input', () => renderList(today()));

    function field(labelText, input, id) { const d = el('div'), l = el('label', null, labelText); input.id = id; l.htmlFor = id; d.append(l, input); return d; }
    function dateInput(value, max) { const i = el('input'); i.type = 'date'; i.value = value; if (max) i.max = max; return i; }
    function moneyInput(o, value) {
        const wrap = el('div', 'inline money'), cur = el('span', 'unit pre cur', curOf(o)), i = el('input');
        i.type = 'text'; i.inputMode = 'decimal'; i.maxLength = 16; i.autocomplete = 'off'; i.value = value;
        cur.setAttribute('aria-hidden', 'true'); wrap.append(cur, i);
        return { wrap, input: i };
    }
    function moneyField(labelText, o, value, id) { const m = moneyInput(o, value); m.input.id = id; const d = el('div'), l = el('label', null, labelText); l.htmlFor = id; d.append(l, m.wrap); return { div: d, input: m.input }; }
    function panelForm(title, o) {
        const f = el('form', 'panel'); f.noValidate = true;
        f.appendChild(el('h5', null, title));
        const err = el('p', 'err'); err.setAttribute('role', 'alert');
        return { f, err };
    }
    function panelButtons(f, err, saveText) {
        f.appendChild(err);
        const row = el('div', 'row-btns');
        const sv = el('button', 'primary', saveText); sv.type = 'submit';
        row.append(sv, btn('Cancel', 'secondary', () => { panel = null; renderList(today()); }));
        f.appendChild(row);
    }
    function closePanel(msg, snap) { panel = null; save(); render(); say('list-msg', msg, { undo: () => restoreSnap(snap) }); }

    function arrivedPanel(o) {
        const t = today(), { f, err } = panelForm('It arrived', o);
        const d = dateInput(t, t);
        const two = el('div', 'two');
        two.appendChild(field('Day it arrived', d, 'a-date-' + o.id));
        let cash = null;
        if (o.pay === 'cod') { const m = moneyField('Cash paid to the rider', o, centsText(o.price), 'a-cash-' + o.id); cash = m.input; two.appendChild(m.div); }
        f.appendChild(two);
        const rs = el('select'), ri = el('input');
        fillRetSelect(rs); ri.type = 'text'; ri.inputMode = 'numeric'; ri.maxLength = 3; ri.autocomplete = 'off'; ri.placeholder = 'Days, 1 to 365'; ri.setAttribute('aria-label', 'Number of days to return'); ri.hidden = true; ri.style.marginTop = '.4rem';
        const rd = field('Days to return it', rs, 'a-ret-' + o.id); rd.appendChild(ri); f.appendChild(rd);
        setRet(rs, ri, o.retDays);
        rs.addEventListener('change', () => { ri.hidden = rs.value !== 'other'; if (!ri.hidden) ri.focus(); });
        panelButtons(f, err, 'Save: it arrived');
        f.addEventListener('submit', e => {
            e.preventDefault();
            if (!C.isDate(d.value)) { err.textContent = 'Pick the day it arrived.'; d.focus(); return; }
            if (d.value > t) { err.textContent = 'The day it arrived cannot be after today.'; d.focus(); return; }
            if (d.value < o.ordered) { err.textContent = 'It cannot arrive before the order date (' + C.fmtDate(o.ordered) + ').'; d.focus(); return; }
            let paidCash = 0;
            if (cash) { paidCash = C.readMoney(cash.value); if (Number.isNaN(paidCash)) { err.textContent = 'Type the cash you paid, such as 1250.'; cash.focus(); return; } }
            const days = readDays(rs, ri);
            if (Number.isNaN(days)) { err.textContent = 'Type a number of days from 1 to 365.'; ri.focus(); return; }
            const snap = snapshot();
            Object.assign(o, { status: 'arrived', arrived: d.value, codPaid: cash ? paidCash : o.codPaid, retDays: days, keep: false });
            const r = C.returnBy(o);
            closePanel('Arrived: ' + o.what + '.' + (r ? ' Return by ' + C.fmtDate(r) + ' if it is not right.' : ''), snap);
        });
        setTimeout(() => (cash || d).focus(), 0);
        return f;
    }
    function cancelPanel(o) {
        const t = today(), { f, err } = panelForm('Cancelled or refused?', o);
        const fs = el('fieldset', 'choice'), lg = el('legend', null, 'What happened'), seg = el('div', 'seg');
        fs.append(lg, seg);
        const opts = [['cancelled', 'Cancelled', 'by you or the shop']];
        if (o.pay === 'cod') opts.push(['refused', 'Refused at the door', 'did not take it']);
        else opts.push(['refused', 'Refused at the door', 'sent back unopened']);
        opts.forEach(([v, txt, small], i) => {
            const r = el('input'); r.type = 'radio'; r.name = 'why-' + o.id; r.value = v; r.id = 'why-' + v + '-' + o.id; if (!i) r.checked = true;
            const l = el('label', null, txt); l.htmlFor = r.id; l.appendChild(el('small', null, small));
            seg.append(r, l);
        });
        f.appendChild(fs);
        const two = el('div', 'two');
        const d = dateInput(t, t);
        two.appendChild(field('Date', d, 'c-date-' + o.id));
        let refund = null;
        if (o.pay === 'online') { const m = moneyField('Refund you are owed', o, centsText(o.price), 'c-ref-' + o.id); refund = m.input; two.appendChild(m.div); }
        f.appendChild(two);
        f.appendChild(el('p', 'hint', o.pay === 'online' ? 'You paid ' + money(o.price, o) + ' online. Type 0 if no refund is due.' : 'Nothing was paid, so no refund is needed.'));
        panelButtons(f, err, 'Save');
        f.addEventListener('submit', e => {
            e.preventDefault();
            if (!C.isDate(d.value) || d.value > t) { err.textContent = 'Pick a date up to today.'; d.focus(); return; }
            let due = 0;
            if (refund) {
                due = C.readMoney(refund.value);
                if (Number.isNaN(due)) { err.textContent = 'Type the refund, such as ' + centsText(o.price) + ', or 0.'; refund.focus(); return; }
                if (due > o.price) { err.textContent = 'The refund cannot be more than you paid (' + money(o.price, o) + ').'; refund.focus(); return; }
            }
            const why = f.querySelector('input[name="why-' + o.id + '"]:checked').value;
            const snap = snapshot();
            Object.assign(o, { status: why, endDate: d.value, refundDue: due, refunds: [], refundClosed: false });
            closePanel((why === 'refused' ? 'Refused: ' : 'Cancelled: ') + o.what + '.' + (due ? ' ' + money(due, o) + ' refund is now under "Refunds waiting".' : ''), snap);
        });
        return f;
    }
    function returnPanel(o) {
        const t = today(), { f, err } = panelForm('Sending it back', o);
        const two = el('div', 'two'), d = dateInput(t, t);
        two.appendChild(field('Day you sent it back', d, 'r-date-' + o.id));
        const p = C.paid(o), m = moneyField('Refund you expect', o, centsText(p), 'r-ref-' + o.id);
        two.appendChild(m.div); f.appendChild(two);
        f.appendChild(el('p', 'hint', 'You paid ' + money(p, o) + '. Type less if the shop keeps a delivery or return fee, or 0 for an exchange.'));
        panelButtons(f, err, 'Save: sending it back');
        f.addEventListener('submit', e => {
            e.preventDefault();
            if (!C.isDate(d.value) || d.value > t) { err.textContent = 'Pick a date up to today.'; d.focus(); return; }
            if (d.value < o.arrived) { err.textContent = 'It cannot be sent back before it arrived (' + C.fmtDate(o.arrived) + ').'; d.focus(); return; }
            const due = C.readMoney(m.input.value);
            if (Number.isNaN(due)) { err.textContent = 'Type the refund you expect, such as ' + centsText(p) + ', or 0.'; m.input.focus(); return; }
            if (due > p) { err.textContent = 'The refund cannot be more than you paid (' + money(p, o) + ').'; m.input.focus(); return; }
            const snap = snapshot();
            Object.assign(o, { status: 'returning', retSent: d.value, refundDue: due, refunds: [], refundClosed: false });
            closePanel('Sending back: ' + o.what + '.' + (due ? ' ' + money(due, o) + ' refund is now under "Refunds waiting".' : ''), snap);
        });
        return f;
    }
    function refundPanel(o) {
        const t = today(), owed = C.refundOwed(o), { f, err } = panelForm('Refund received', o);
        const two = el('div', 'two'), d = dateInput(t, t);
        const m = moneyField('Amount received', o, centsText(owed), 'f-ra-' + o.id);
        two.appendChild(m.div); two.appendChild(field('Date', d, 'f-rd-' + o.id));
        f.appendChild(two);
        f.appendChild(el('p', 'hint', 'Still owed: ' + money(owed, o) + '. If only part came, type that amount and the rest keeps waiting.'));
        panelButtons(f, err, 'Save refund');
        f.addEventListener('submit', e => {
            e.preventDefault();
            const amt = C.readMoney(m.input.value);
            if (Number.isNaN(amt) || amt <= 0) { err.textContent = 'Type the amount that came back, such as ' + centsText(owed) + '.'; m.input.focus(); return; }
            if (amt > owed) { err.textContent = 'That is more than you are owed (' + money(owed, o) + ').'; m.input.focus(); return; }
            if (!C.isDate(d.value) || d.value > t) { err.textContent = 'Pick a date up to today.'; d.focus(); return; }
            const snap = snapshot();
            o.refunds.push({ d: d.value, amt });
            const left = C.refundOwed(o);
            closePanel(money(amt, o) + ' refund recorded. ' + (left ? money(left, o) + ' still to come.' : 'Refunded in full.'), snap);
        });
        setTimeout(() => m.input.focus(), 0);
        return f;
    }
    function act(o, fn, msg) { const snap = snapshot(); fn(o); closePanel(msg, snap); }
    function orderBox(o, t) {
        const b = C.badge(o, t), owed = C.refundOwed(o);
        const box = el('article', 'box ' + b.k);
        box.dataset.id = o.id;
        const top = el('div', 'box-top');
        top.appendChild(el('h3', 'box-name', o.what));
        top.appendChild(el('span', 'badge ' + b.k, b.t));
        box.appendChild(top);
        box.appendChild(el('p', 'box-sub', '#' + o.n + (o.shop ? ' · ' + o.shop : '') + ' · ordered ' + C.fmtDate(o.ordered) + (o.ordered.slice(0, 4) !== t.slice(0, 4) ? ' ' + o.ordered.slice(0, 4) : '')));
        box.appendChild(el('p', 'line' + (b.k === 'late' ? ' late' : ''), C.whenLine(o, t)));
        const ml = C.moneyLine(o, S.cur, S.style);
        box.appendChild(el('p', 'line' + (owed ? ' due' : o.status === 'coming' && o.pay === 'cod' && o.price ? ' cash-line' : ''), ml));
        if (o.refunds.length) box.appendChild(el('p', 'box-sub', 'Refunds: ' + o.refunds.map(r => money(r.amt, o) + ' on ' + C.fmtDate(r.d)).join(', ')));
        if (o.track || o.courier || o.orderNo) {
            const tr = el('p', 'track');
            if (o.track) {
                const s = el('span'); s.appendChild(document.createTextNode((o.courier ? o.courier + ' ' : '') + 'tracking ')); s.appendChild(el('code', null, o.track)); tr.appendChild(s);
                tr.appendChild(btn('Copy', 'mini', () => copyText(o.track, 'list-msg', 'Tracking number copied: ' + o.track), 'Copy tracking number ' + o.track));
            } else if (o.courier) tr.appendChild(el('span', null, 'Courier: ' + o.courier));
            if (o.orderNo) tr.appendChild(el('span', null, 'Order no. ' + o.orderNo));
            box.appendChild(tr);
        }
        if (o.note) box.appendChild(el('p', 'note', o.note));
        const btns = el('div', 'box-btns'), who = ' for ' + o.what + ' (#' + o.n + ')';
        const on = k => panel && panel.id === o.id && panel.kind === k ? ' on' : '';
        const add = (text, cls, fn) => btns.appendChild(btn(text, 'mini' + (cls ? ' ' + cls : ''), fn, text + who));
        if (o.status === 'coming') {
            add('It arrived', 'strong' + on('arrived'), () => togglePanel(o.id, 'arrived'));
            add('Cancelled or refused', on('cancel'), () => togglePanel(o.id, 'cancel'));
            add('Ask the shop', '', () => openSheet(o.id));
        } else if (o.status === 'arrived') {
            add('Sending it back', on('return'), () => togglePanel(o.id, 'return'));
            if (C.returnOpen(o, t)) add('Keeping it', '', () => act(o, x => { x.keep = true; }, 'Keeping: ' + o.what + '. The return reminder is off.'));
            else if (o.keep) add('Undo keeping it', 'on', () => act(o, x => { x.keep = false; }, 'The return reminder for ' + o.what + ' is back on.'));
            add('Not arrived yet', '', () => act(o, x => { x.status = 'coming'; x.arrived = ''; x.keep = false; }, o.what + ' is back under "On the way".'));
        } else {
            if (owed) {
                add('Refund received', 'strong' + on('refund'), () => togglePanel(o.id, 'refund'));
                add('Ask the shop', '', () => openSheet(o.id));
                add('No more refund coming', '', () => act(o, x => { x.refundClosed = true; }, 'Closed: no more refund for ' + o.what + '.'));
            } else if (o.refundClosed && o.refundDue > C.refundGot(o)) add('Still waiting for refund', '', () => act(o, x => { x.refundClosed = false; }, o.what + ' is back under "Refunds waiting".'));
            if (o.status === 'returning') add('Not sending it back', '', () => act(o, x => { x.status = 'arrived'; x.retSent = ''; x.refundDue = 0; x.refunds = []; x.refundClosed = false; }, o.what + ' is back under "Arrived".'));
            else add(o.status === 'refused' ? 'Undo refused' : 'Undo cancel', '', () => act(o, x => { x.status = 'coming'; x.endDate = ''; x.refundDue = 0; x.refunds = []; x.refundClosed = false; }, o.what + ' is back under "On the way".'));
        }
        add('Edit', '', () => fillForm(o, false));
        if (o.status !== 'coming') add('Order again', '', () => fillForm(o, true));
        add('Delete', 'del', () => removeOrder(o.id));
        box.appendChild(btns);
        if (panel && panel.id === o.id) box.appendChild({ arrived: arrivedPanel, cancel: cancelPanel, return: returnPanel, refund: refundPanel }[panel.kind](o));
        return box;
    }
    function togglePanel(id, kind) { panel = panel && panel.id === id && panel.kind === kind ? null : { id, kind }; renderList(today()); }
    function renderList(t) {
        const n = C.counts(S.orders);
        Object.keys(n).forEach(k => { $('n-' + k).textContent = '(' + n[k] + ')'; });
        const list = C.listView(S.orders, tab, t, $('q').value), host = $('boxes');
        host.textContent = '';
        if (!list.length) {
            const q = $('q').value.trim();
            host.appendChild(el('p', 'empty', q ? 'No orders match "' + q + '".' : tab === 'coming' ? 'Nothing on the way. Orders you add show here.' : tab === 'arrived' ? 'No parcels marked as arrived yet.' : tab === 'returns' ? 'No returns or refunds waiting.' : 'No orders yet.'));
            return;
        }
        list.forEach(o => host.appendChild(orderBox(o, t)));
    }
    function render() {
        const t = today(), any = S.orders.length > 0;
        app.classList.toggle('setup', !any);
        $('sum').hidden = !any; $('list').hidden = !any; $('jump-add').hidden = !any;
        if (any) { renderSummary(t); renderList(t); }
        const dl = $('shop-list'); dl.textContent = '';
        const names = C.shopNames(S.orders), lower = names.map(x => x.toLowerCase());
        names.concat(SHOPS.filter(x => !lower.includes(x.toLowerCase()))).forEach(c => { const o = el('option'); o.value = c; dl.appendChild(o); });
    }

    // ---------- message for the shop ----------
    const sheet = $('sheet');
    let sheetId = null;
    function openSheet(id) {
        const o = byId(id); if (!o) return;
        sheetId = id;
        $('sheet-h').textContent = o.status === 'coming' ? 'Ask where your parcel is' : 'Ask about your refund';
        $('sheet-text').value = C.chaseText(o, today(), S.cur, S.style);
        mailHref();
        say('sheet-msg', '');
        $('sheet-share').hidden = !navigator.share;
        if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
        $('sheet-text').focus();
    }
    function mailHref() {
        const o = byId(sheetId); if (!o) return;
        const subj = (o.status === 'coming' ? 'Where is my order: ' : 'Refund for my order: ') + o.what;
        $('sheet-mail').href = 'mailto:?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent($('sheet-text').value);
    }
    $('sheet-text').addEventListener('input', mailHref);
    $('sheet-copy').addEventListener('click', () => copyText($('sheet-text').value, 'sheet-msg', 'Copied. Paste it in the shop\'s chat, app or email.'));
    $('sheet-share').addEventListener('click', () => { navigator.share({ text: $('sheet-text').value }).catch(() => {}); });
    $('sheet-close').addEventListener('click', () => sheet.close());
    sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });

    // ---------- backup ----------
    $('csv').addEventListener('click', () => {
        if (!S.orders.length) return say('set-msg', 'There are no orders to save yet.');
        download('online-orders-' + today() + '.csv', C.csv(S.orders, S.cur), 'text/csv');
        say('set-msg', 'Saved ' + plural(S.orders.length, 'order') + ' as a CSV file.');
    });
    $('backup').addEventListener('click', () => {
        download('online-orders-backup-' + today() + '.json', JSON.stringify(S, null, 1), 'application/json');
        say('set-msg', 'Backup file saved. Keep it somewhere safe.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; if (!f) return;
        const r = new FileReader();
        r.onload = () => {
            let raw = null;
            try { raw = JSON.parse(String(r.result)); } catch (e) { raw = null; }
            $('restore-file').value = '';
            if (!raw || !Array.isArray(raw.orders)) return say('set-msg', 'That file is not a backup from this app. Nothing was changed.');
            const next = C.cleanState(raw), snap = snapshot();
            S = next; save(); fillSettings(); resetForm(); panel = null; render();
            say('set-msg', 'Backup restored: ' + plural(S.orders.length, 'order') + '.', { undo: () => restoreSnap(snap) });
        };
        r.onerror = () => say('set-msg', 'Could not read that file.');
        r.readAsText(f);
    });
    $('wipe').addEventListener('click', () => {
        if (!S.orders.length) return say('set-msg', 'There is nothing to delete.');
        const snap = snapshot();
        S = Object.assign(blank(), { cur: S.cur, style: S.style }); save(); resetForm(); panel = null; render();
        say('set-msg', 'Every order is deleted.', { undo: () => restoreSnap(snap) });
    });

    // ---------- start ----------
    fillSettings(); resetForm(); render();
    // a new day while the page stays open: refresh what is late and the dates in the form
    let lastDay = today();
    function dayCheck() { if (today() !== lastDay) { lastDay = today(); const keep = $('f-exp').value; fillExp(); $('f-exp').value = keep; $('f-ordered').max = today(); render(); } }
    setInterval(dayCheck, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) dayCheck(); });
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
