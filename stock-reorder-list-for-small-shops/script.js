// Stock Reorder List for Small Shops: the page. The maths and the words are in core.js (window.SRL).
(function () {
    'use strict';
    const C = window.SRL, SLUG = 'stock-reorder-list-for-small-shops', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const LOC = navigator.language || 'en-GB';
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', '₦': '₦ (naira)',
        'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', 'Rp': 'Rp (rupiah)', 'RM': 'RM (ringgit)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const UNIT_NAMES = { piece: 'Pieces', packet: 'Packets', carton: 'Cartons', box: 'Boxes', bag: 'Bags', sack: 'Sacks', kg: 'kg', litre: 'Litres',
        bottle: 'Bottles', tin: 'Tins', dozen: 'Dozen', roll: 'Rolls', tray: 'Trays', strip: 'Strips (medicine)' };
    let state = C.emptyState(), today = C.dayStr(new Date());
    let filter = 'all', find = '';
    let editing = null;      // id of the item in the form, or null when adding
    let levelsTouched = false;
    let panel = null;        // { id, what: 'recv' | 'phone', where }
    let flash = null;        // { where, text, undo, bad }
    let undoSnap = null, canSave = true;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (!raw) return;
        try { const s = C.cleanState(JSON.parse(raw)); if (s) state = s; } catch (e) { /* corrupt: start fresh */ }
    }
    function save() {
        if (!canSave) { $('store-warn').hidden = false; return; }
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canSave = false; $('store-warn').hidden = false; }
    }
    function change(fn, where, text) {
        const before = JSON.stringify(state), focusId = document.activeElement && document.activeElement.id;
        fn();
        save();
        undoSnap = before;
        flash = { where, text: typeof text === 'function' ? text() : text, undo: true };
        render();
        if (focusId && $(focusId) && !$(focusId).disabled) $(focusId).focus({ preventScroll: true });
    }
    function undo() {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap));
        if (s) state = s;
        const where = flash && $(flash.where) ? flash.where : 'list-msg';
        undoSnap = null; panel = null;
        if (editing && !byId(editing)) resetForm();
        save();
        flash = { where, text: 'Undone.' };
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const money = c => C.fmt(c, state.cur, LOC);
    const qty = (q, unit) => C.qtyText(q, unit, LOC);
    const byId = id => state.items.find(x => x.id === id);
    const live = () => state.items.filter(it => !it.arch);
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into a message to the supplier.' }; render(); };
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Use Send on WhatsApp or Print instead.', bad: true }; render(); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function setErr(id, msg, inputId) {
        $(id + '-err').textContent = msg || '';
        const inp = $(inputId || id);
        if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
        return !msg;
    }
    function showMsg(where, text, withUndo, bad) {
        const box = $(where);
        if (!box) return;
        box.textContent = '';
        box.className = 'msg show' + (bad ? ' bad' : '');
        box.appendChild(document.createTextNode(text + ' '));
        if (withUndo) box.appendChild(btn('Undo', 'undo', undo));
    }
    function clearMsgs() { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.className = 'msg'; }); }
    function reveal(openId, boxId, focusId) {
        $(openId).hidden = true; $(boxId).hidden = false;
        if (focusId) $(focusId).focus();
    }
    const supName = it => it.sup || 'no supplier set';

    // ---------- the form ----------
    function formUnit() {
        const v = $('f-unit').value;
        if (v === '+own') return $('f-unit-own').value.replace(/\s+/g, ' ').trim().slice(0, 20);
        return v;
    }
    function unitWord(unit, many) {
        if (!unit) return many ? 'units' : 'unit';
        return many ? C.unitMany(unit) : unit;
    }
    function labels() {
        const u = formUnit(), many = unitWord(u, true);
        $('f-stock-l').textContent = 'In stock now (' + many + ')';
        $('f-low-l').textContent = 'Order when down to';
        $('f-full-l').textContent = 'Order enough to have';
        $('f-price-l').textContent = 'Price you pay for one ' + (C.isUnit(u) ? u : (u ? u.replace(/s$/, '') : 'unit'));
        $('f-unit-own-box').hidden = $('f-unit').value !== '+own';
    }
    function fillPresets() {
        if (levelsTouched) return;
        const p = C.presets(formUnit());
        $('f-low').value = C.qtyInput(p.low);
        $('f-full').value = C.qtyInput(p.full);
    }
    function fillSups() {
        const list = $('sup-list'), seen = new Set();
        list.textContent = '';
        state.items.map(it => it.sup).filter(Boolean).sort((a, b) => a.localeCompare(b)).forEach(s => {
            const k = C.supKey(s); if (seen.has(k)) return; seen.add(k);
            const o = el('option'); o.value = s; list.appendChild(o);
        });
    }
    // read the form; returns { item } or { errors } (errors are shown only when show is true)
    function readForm(show) {
        const errs = {};
        const name = $('f-name').value.replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!name) errs.name = 'Type the item, such as Cooking oil 5 L.';
        const unit = formUnit();
        if ($('f-unit').value === '+own' && !unit) errs.own = 'Type the unit, such as jars.';
        const st = C.parseQty($('f-stock').value, { blank: 'Type how many you have now. Type 0 if it has run out.' });
        if (st.error) errs.stock = st.error;
        const lo = C.parseQty($('f-low').value, { blank: 'Type the number to order at, such as 2. Type 0 to order only when it runs out.' });
        if (lo.error) errs.low = lo.error;
        const fu = C.parseQty($('f-full').value, { blank: 'Type how many you want after the delivery, such as 6.', zeroOk: false, zeroMsg: 'Type a number more than 0, such as 6.' });
        if (fu.error) errs.full = fu.error;
        else if (!lo.error && fu.q <= lo.q) errs.full = '"Order enough to have" must be more than "Order when down to" (' + C.qtyInput(lo.q) + ').';
        let price = 0;
        if (!$('f-price-box').hidden && $('f-price').value.trim()) {
            const pr = C.parseAmount($('f-price').value, { zeroOk: true, max: C.MAXP });
            if (pr.error) errs.price = pr.error; else price = pr.cents;
        }
        const sup = $('f-sup').value.replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!errs.name) {
            const twin = state.items.find(x => x.id !== editing && C.sameItem(x, { name, sup }));
            if (twin) errs.name = twin.arch
                ? 'You already have ' + twin.name + ' under "No longer sold". Tap Sell again there, or give this one a different name.'
                : 'You already have ' + twin.name + ' from ' + supName(twin) + '. Change its stock under Your stock, or give this one a different name such as ' + name + ' (large).';
        }
        if (show) {
            setErr('f-name', errs.name); setErr('f-unit-own', errs.own); setErr('f-stock', errs.stock);
            setErr('f-low', errs.low); setErr('f-full', errs.full); setErr('f-price', errs.price);
        }
        if (Object.keys(errs).length) return { errors: errs };
        return { item: { name, unit, sup, stock: st.q, low: lo.q, full: fu.q, price } };
    }
    function preview() {
        const r = readForm(false), p = $('f-preview');
        if (r.errors) { p.textContent = ''; return; }
        const it = r.item, from = it.sup ? ' from ' + it.sup : '';
        if (it.stock <= it.low) {
            const q = it.full - it.stock;
            p.textContent = 'Now ' + qty(it.stock, it.unit) + ': this goes straight on the list. Order ' + qty(q, it.unit) + from + (it.price ? ' (about ' + money(C.lineCost(it.price, q)) + ')' : '') + '.';
        } else {
            p.textContent = 'Now ' + qty(it.stock, it.unit) + ': enough. At ' + qty(it.low, it.unit) + ' or less, it goes on the list to order' + from + '.';
        }
    }
    function resetForm() {
        editing = null; levelsTouched = false;
        ['f-name', 'f-stock', 'f-sup', 'f-price', 'f-unit-own'].forEach(id => { $(id).value = ''; });
        $('f-unit').value = 'piece';
        $('f-price-box').hidden = true; $('f-price-open').hidden = false;
        ['f-name', 'f-unit-own', 'f-stock', 'f-low', 'f-full', 'f-price'].forEach(id => setErr(id, ''));
        $('add-h').textContent = 'Add an item';
        $('f-save').textContent = 'Save item';
        $('f-cancel').hidden = true;
        labels(); fillPresets(); fillSups(); preview();
    }
    function startEdit(id) {
        const it = byId(id); if (!it) return;
        resetForm();
        editing = id; levelsTouched = true;
        $('f-name').value = it.name;
        if (C.isUnit(it.unit)) $('f-unit').value = it.unit; else { $('f-unit').value = '+own'; $('f-unit-own').value = it.unit; }
        $('f-stock').value = C.qtyInput(it.stock);
        $('f-low').value = C.qtyInput(it.low);
        $('f-full').value = C.qtyInput(it.full);
        $('f-sup').value = it.sup;
        if (it.price) { $('f-price-box').hidden = false; $('f-price-open').hidden = true; $('f-price').value = C.priceInput(it.price); }
        $('add-h').textContent = 'Change ' + it.name;
        $('f-save').textContent = 'Save changes';
        $('f-cancel').hidden = false;
        labels(); preview();
        $('add').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('f-name').focus({ preventScroll: true });
    }
    function saveForm() {
        const r = readForm(true);
        if (r.errors) {
            const first = ['name', 'own', 'stock', 'low', 'full', 'price'].find(k => r.errors[k]);
            const ids = { name: 'f-name', own: 'f-unit-own', stock: 'f-stock', low: 'f-low', full: 'f-full', price: 'f-price' };
            $(ids[first]).focus();
            return;
        }
        const n = r.item;
        if (editing) {
            const id = editing;
            change(() => {
                const it = byId(id);
                if (it.stock !== n.stock) it.upd = today;
                Object.assign(it, n);
                resetForm();
            }, 'add-msg', n.name + ' saved.');
        } else {
            change(() => {
                state.items.push(Object.assign({ id: C.newId(), arch: false, upd: today, ord: null, got: [] }, n));
                const keepUnit = $('f-unit').value, keepOwn = $('f-unit-own').value, keepSup = n.sup;
                resetForm();
                // the next item is often from the same supplier and in the same unit
                $('f-unit').value = keepUnit; $('f-unit-own').value = keepOwn; $('f-sup').value = keepSup;
                labels(); fillPresets(); preview();
            }, 'add-msg', () => n.name + ' added.' + (n.stock <= n.low ? ' It is on the list to order.' : ''));
            $('f-name').focus({ preventScroll: true });
        }
    }

    // ---------- stock changes ----------
    function setStock(id, q) {
        const it = byId(id); if (!it) return;
        const before = C.need(it).kind;
        change(() => { it.stock = q; it.upd = today; }, 'list-msg', () => {
            const n = C.need(it);
            let t = it.name + ': ' + qty(it.stock, it.unit) + ' in stock.';
            if (n.kind === 'order' && before !== 'order') t += ' Now on the list: order ' + qty(n.q, it.unit) + '.';
            if (n.kind === 'ok' && before === 'order') t += ' Off the list.';
            return t;
        });
    }
    function stockRow(it) {
        const box = el('div', 'stock-row');
        const lab = el('label', 'stock-l', 'In stock'); lab.htmlFor = 'st-' + it.id;
        const minus = btn('−', 'step', () => setStock(it.id, Math.max(0, it.stock - 100)), 'One less ' + it.name);
        minus.id = 'st-' + it.id + '-minus'; minus.disabled = it.stock <= 0;
        const inp = el('input', 'step-in'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.maxLength = 12; inp.autocomplete = 'off';
        inp.id = 'st-' + it.id; inp.value = C.qtyInput(it.stock);
        inp.setAttribute('aria-describedby', 'st-' + it.id + '-err');
        const plus = btn('+', 'step', () => setStock(it.id, Math.min(C.MAXQ, it.stock + 100)), 'One more ' + it.name);
        plus.id = 'st-' + it.id + '-plus'; plus.disabled = it.stock + 100 > C.MAXQ;
        const unit = el('span', 'stock-u', C.unitMany(it.unit));
        const err = el('p', 'err'); err.id = 'st-' + it.id + '-err'; err.setAttribute('role', 'alert');
        const commit = () => {
            if (inp.value.trim() === C.qtyInput(it.stock)) { err.textContent = ''; inp.removeAttribute('aria-invalid'); return; }
            const r = C.parseQty(inp.value, { blank: 'Type how many you have. Type 0 if it has run out.' });
            if (r.error) { err.textContent = r.error; inp.setAttribute('aria-invalid', 'true'); return; }
            setStock(it.id, r.q);
        };
        inp.addEventListener('change', commit);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { inp.value = C.qtyInput(it.stock); err.textContent = ''; inp.removeAttribute('aria-invalid'); } });
        const stepper = el('div', 'stepper'); stepper.append(minus, inp, plus, unit);
        box.append(lab, stepper);
        return [box, err];
    }

    // ---------- orders ----------
    function markGroup(g) {
        change(() => { g.lines.forEach(l => { const it = byId(l.id); if (it) C.markOrdered(it, l.q, today); }); panel = null; }, 'ord-msg',
            (g.sup || 'No supplier') + ': ' + C.plural(g.lines.length, 'item', 'items') + ' marked as ordered. Tap Delivery came when the goods arrive.');
    }
    function markOne(it) {
        const n = C.need(it);
        change(() => { C.markOrdered(it, n.q, today); }, 'list-msg', it.name + ': ' + qty(n.q, it.unit) + ' marked as ordered.');
    }
    function cancelOrder(it, where) {
        change(() => { it.ord = null; panel = null; }, where, () => it.name + ': order cancelled.' + (C.need(it).kind === 'order' ? ' It is back on the list.' : ''));
    }
    function waLink(g) {
        const ph = state.phones[g.key] || '';
        return 'https://wa.me/' + ph + '?text=' + encodeURIComponent(C.orderText(g, state.shop, today, LOC));
    }
    function phonePanel(g) {
        const p = el('div', 'panel');
        const id = 'ph-' + (g.key ? g.key.replace(/[^a-z0-9]+/g, '-') : 'none');
        const lab = el('label', '', 'WhatsApp number for ' + (g.sup || 'this supplier')); lab.htmlFor = id;
        const inp = el('input'); inp.type = 'tel'; inp.id = id; inp.maxLength = 24; inp.autocomplete = 'off'; inp.placeholder = '+92 300 1234567';
        inp.value = state.phones[g.key] ? '+' + state.phones[g.key] : '';
        inp.setAttribute('aria-describedby', id + '-err');
        const err = el('p', 'err'); err.id = id + '-err'; err.setAttribute('role', 'alert');
        const ok = () => {
            const r = C.parsePhone(inp.value);
            if (r.error) { err.textContent = r.error; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
            change(() => { if (r.digits) state.phones[g.key] = r.digits; else delete state.phones[g.key]; panel = null; }, 'ord-msg',
                r.digits ? 'WhatsApp number saved for ' + (g.sup || 'this supplier') + '.' : 'WhatsApp number removed.');
        };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
        const hint = el('p', 'hint', 'With the country code. Leave it empty to pick the chat in WhatsApp each time.');
        const row = el('div', 'row-btns');
        row.append(btn('Save number', 'primary', ok), btn('Cancel', 'secondary', () => { panel = null; render(); }));
        p.append(lab, inp, err, hint, row);
        setTimeout(() => inp.focus(), 0);
        return p;
    }
    function recvPanel(it, where) {
        const p = el('div', 'panel');
        p.appendChild(el('h4', '', 'Delivery of ' + it.name));
        const qid = 'rq-' + it.id, pid = 'rp-' + it.id;
        const ql = el('label', '', 'How many came (' + C.unitMany(it.unit) + ')'); ql.htmlFor = qid;
        const qi = el('input'); qi.type = 'text'; qi.inputMode = 'decimal'; qi.id = qid; qi.maxLength = 12; qi.autocomplete = 'off';
        qi.value = C.qtyInput(it.ord.q); qi.setAttribute('aria-describedby', qid + '-err');
        const qe = el('p', 'err'); qe.id = qid + '-err'; qe.setAttribute('role', 'alert');
        const pl = el('label', '', 'Price for one ' + (C.isUnit(it.unit) ? it.unit : it.unit.replace(/s$/, '')) + ' this time (optional)'); pl.htmlFor = pid;
        const pi = el('input'); pi.type = 'text'; pi.inputMode = 'decimal'; pi.id = pid; pi.maxLength = 16; pi.autocomplete = 'off';
        pi.value = C.priceInput(it.price); pi.placeholder = 'e.g. 1150'; pi.setAttribute('aria-describedby', pid + '-err');
        const pe = el('p', 'err'); pe.id = pid + '-err'; pe.setAttribute('role', 'alert');
        const ok = () => {
            const q = C.parseQty(qi.value, { zeroOk: false, blank: 'Type how many came, such as 4.', zeroMsg: 'Type how many came. If nothing came, tap Cancel and keep the order.' });
            let price = 0, bad = false;
            if (q.error) { qe.textContent = q.error; qi.setAttribute('aria-invalid', 'true'); bad = true; } else { qe.textContent = ''; qi.removeAttribute('aria-invalid'); }
            if (pi.value.trim()) {
                const pr = C.parseAmount(pi.value, { zeroOk: true, max: C.MAXP });
                if (pr.error) { pe.textContent = pr.error; pi.setAttribute('aria-invalid', 'true'); bad = true; } else { price = pr.cents; pe.textContent = ''; pi.removeAttribute('aria-invalid'); }
            }
            if (bad) { (q.error ? qi : pi).focus(); return; }
            const short = it.ord.q - q.q;
            change(() => { C.receive(it, q.q, price, today); panel = null; }, where,
                () => it.name + ': ' + qty(q.q, it.unit) + ' added. Now ' + qty(it.stock, it.unit) + ' in stock.' + (short > 0 ? ' (' + qty(short, it.unit) + ' less than ordered.)' : ''));
        };
        [qi, pi].forEach(x => x.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }));
        const row = el('div', 'row-btns');
        row.append(btn('Add to stock', 'primary', ok), btn('Cancel', 'secondary', () => { panel = null; render(); }));
        p.append(ql, qi, qe, pl, pi, pe, row);
        setTimeout(() => qi.focus(), 0);
        return p;
    }
    function renderOrders() {
        const has = live().length > 0;
        $('orders').hidden = !has;
        if (!has) return;
        const o = C.orders(state);
        let sum;
        if (!o.items) sum = 'Nothing to order right now. Every item is above its order level.';
        else {
            const named = o.groups.filter(g => g.sup).length, none = o.groups.find(g => !g.sup);
            sum = C.plural(o.items, 'item', 'items') + ' to order';
            if (named) sum += ' from ' + C.plural(named, 'supplier', 'suppliers');
            if (none && named) sum += ' (' + C.plural(none.lines.length, 'item has', 'items have') + ' no supplier set)';
            if (o.est) sum += ', about ' + money(o.est) + (o.noPrice ? ' (' + C.plural(o.noPrice, 'item has', 'items have') + ' no price)' : '');
            sum += '.';
        }
        $('ord-sum').textContent = sum;
        $('ord-print').hidden = !o.items;
        const ul = $('groups'); ul.textContent = '';
        o.groups.forEach(g => {
            const li = el('li', 'group');
            const head = el('div', 'g-head');
            head.appendChild(el('h3', '', g.sup || 'No supplier set'));
            head.appendChild(el('span', 'g-n', C.plural(g.lines.length, 'item', 'items')));
            li.appendChild(head);
            if (!g.sup) li.appendChild(el('p', 'hint', 'Tap Edit on these items and type their supplier, so they are grouped with the right order.'));
            const lines = el('ul', 'g-lines');
            g.lines.forEach(l => {
                const r = el('li', 'g-line');
                const left = el('span', 'g-name', l.name);
                if (l.out) left.appendChild(el('span', 'out-tag', 'out of stock'));
                const right = el('span', 'g-q');
                right.appendChild(el('b', '', qty(l.q, l.unit)));
                right.appendChild(el('span', 'g-cost', l.price ? 'about ' + money(l.cost) : 'no price'));
                r.append(left, right);
                lines.appendChild(r);
            });
            li.appendChild(lines);
            if (g.priced) li.appendChild(el('p', 'g-est', 'About ' + money(g.est) + (g.noPrice ? ' + ' + C.plural(g.noPrice, 'item', 'items') + ' with no price' : '')));
            const btns = el('div', 'g-btns');
            btns.appendChild(btn('Copy order', 'secondary', () => copyText(C.orderText(g, state.shop, today, LOC), 'ord-msg'), 'Copy the order for ' + (g.sup || 'items with no supplier')));
            const wa = el('a', 'secondary wa', 'Send on WhatsApp'); wa.href = waLink(g); wa.target = '_blank'; wa.rel = 'noopener';
            wa.setAttribute('aria-label', 'Send the order to ' + (g.sup || 'a supplier') + ' on WhatsApp');
            btns.appendChild(wa);
            btns.appendChild(btn('Mark as ordered', 'primary', () => markGroup(g), 'Mark the order from ' + (g.sup || 'no supplier') + ' as sent'));
            li.appendChild(btns);
            const ph = state.phones[g.key];
            if (panel && panel.what === 'phone' && panel.id === g.key) li.appendChild(phonePanel(g));
            else {
                const pl = btn(ph ? 'WhatsApp: +' + ph + ' (change)' : '+ Add WhatsApp number (optional)', 'link', () => { panel = { what: 'phone', id: g.key }; render(); });
                pl.id = 'phl-' + (g.key ? g.key.replace(/[^a-z0-9]+/g, '-') : 'none');
                li.appendChild(pl);
            }
            ul.appendChild(li);
        });
        const w = C.waiting(state), wl = $('wait');
        $('wait-box').hidden = !w.length;
        wl.textContent = '';
        w.forEach(it => {
            const li = el('li', 'w-item');
            li.appendChild(el('p', 'w-name', it.name + ': ' + qty(it.ord.q, it.unit)));
            li.appendChild(el('p', 'w-line', (it.sup ? 'From ' + it.sup + ', ordered ' : 'Ordered ') + C.ago(it.ord.d, today, LOC)));
            if (panel && panel.what === 'recv' && panel.id === it.id && panel.where === 'ord-msg') li.appendChild(recvPanel(it, 'ord-msg'));
            else {
                const b = el('div', 'item-btns');
                const dc = btn('Delivery came', 'primary', () => { panel = { what: 'recv', id: it.id, where: 'ord-msg' }; render(); }, 'Delivery came for ' + it.name);
                dc.id = 'wdc-' + it.id;
                b.append(dc, btn('Cancel order', 'secondary', () => cancelOrder(it, 'ord-msg'), 'Cancel the order of ' + it.name));
                li.appendChild(b);
            }
            wl.appendChild(li);
        });
    }

    // ---------- the item list ----------
    function itemBox(it) {
        const n = C.need(it);
        const li = el('li', 'item st-' + n.kind);
        const top = el('div', 'i-top');
        top.appendChild(el('h3', 'i-name', it.name));
        const tag = n.kind === 'order' ? 'Order ' + qty(n.q, it.unit) : n.kind === 'ordered' ? 'On order: ' + qty(n.q, it.unit) : 'Enough';
        top.appendChild(el('span', 'tag tag-' + n.kind, tag));
        li.appendChild(top);
        const bits = [it.sup ? 'From ' + it.sup : 'No supplier set', 'order at ' + C.fmtQ(it.low, LOC) + ', up to ' + qty(it.full, it.unit)];
        if (it.price) bits.push(money(it.price) + ' each');
        li.appendChild(el('p', 'i-line', bits.join(' · ')));
        const [row, err] = stockRow(it);
        li.append(row, err);
        let sub = it.upd ? 'Counted ' + C.ago(it.upd, today, LOC) : 'Not counted yet';
        if (it.got.length) sub += ' · last delivery ' + C.ago(it.got[0].d, today, LOC) + ': ' + qty(it.got[0].q, it.unit) + (it.got[0].p ? ' at ' + money(it.got[0].p) : '');
        if (n.kind === 'ordered') sub += ' · ordered ' + C.ago(it.ord.d, today, LOC);
        li.appendChild(el('p', 'i-sub', sub));
        if (panel && panel.what === 'recv' && panel.id === it.id && panel.where === 'list-msg') { li.appendChild(recvPanel(it, 'list-msg')); return li; }
        const b = el('div', 'item-btns');
        if (n.kind === 'order' && n.q > 0) { const m = btn('Mark as ordered', 'secondary', () => markOne(it), 'Mark ' + it.name + ' as ordered'); m.id = 'mo-' + it.id; b.appendChild(m); }
        if (n.kind === 'ordered') {
            const dc = btn('Delivery came', 'primary', () => { panel = { what: 'recv', id: it.id, where: 'list-msg' }; render(); }, 'Delivery came for ' + it.name);
            dc.id = 'dc-' + it.id;
            b.append(dc, btn('Cancel order', 'secondary', () => cancelOrder(it, 'list-msg'), 'Cancel the order of ' + it.name));
        }
        b.appendChild(btn('Edit', 'secondary', () => startEdit(it.id), 'Edit ' + it.name));
        b.appendChild(btn('No longer sold', 'secondary', () => change(() => { it.arch = true; it.ord = null; if (editing === it.id) resetForm(); }, 'list-msg', it.name + ' moved to No longer sold.'), it.name + ' is no longer sold'));
        b.appendChild(btn('Delete', 'secondary del', () => change(() => { state.items = state.items.filter(x => x.id !== it.id); if (editing === it.id) resetForm(); }, 'list-msg', it.name + ' deleted.'), 'Delete ' + it.name));
        li.appendChild(b);
        return li;
    }
    function renderList() {
        const items = live();
        $('list').hidden = !items.length;
        const k = it => C.need(it).kind;
        $('cnt-order').textContent = items.filter(it => k(it) === 'order').length;
        $('cnt-ordered').textContent = items.filter(it => k(it) === 'ordered').length;
        $('cnt-all').textContent = items.length;
        document.querySelectorAll('input[name=filter]').forEach(r => { r.checked = r.value === filter; });
        $('find-box').hidden = items.length < 7 && !find;
        const f = C.supKey(find);
        const shown = items.filter(it => (filter === 'all' || k(it) === filter) && (!f || C.supKey(it.name).includes(f) || C.supKey(it.sup).includes(f)))
            .sort((a, b) => a.name.localeCompare(b.name) || a.sup.localeCompare(b.sup));
        const ul = $('items'); ul.textContent = '';
        shown.forEach(it => ul.appendChild(itemBox(it)));
        const empty = $('list-empty');
        empty.hidden = shown.length > 0;
        if (!shown.length) empty.textContent = f ? 'No item matches "' + find.trim() + '".' : filter === 'order' ? 'Nothing to order right now.' : 'Nothing is on order. Tap Mark as ordered after you send an order.';
    }
    function renderArch() {
        const a = state.items.filter(it => it.arch).sort((x, y) => x.name.localeCompare(y.name));
        $('arch').hidden = !a.length;
        const ul = $('arch-list'); ul.textContent = '';
        a.forEach(it => {
            const li = el('li', 'arch-item');
            li.appendChild(el('p', 'arch-name', it.name));
            li.appendChild(el('p', 'i-line', (it.sup ? 'From ' + it.sup + ' · ' : '') + qty(it.stock, it.unit) + ' left'));
            const b = el('div', 'item-btns');
            b.appendChild(btn('Sell again', 'secondary', () => {
                const twin = state.items.find(x => x.id !== it.id && !x.arch && C.sameItem(x, it));
                if (twin) { flash = { where: 'arch-msg', text: 'You already have ' + twin.name + ' from ' + supName(twin) + ' in Your stock. Delete one of them first.', bad: true }; render(); return; }
                change(() => { it.arch = false; }, 'list-msg', it.name + ' is back in Your stock.');
            }, 'Sell ' + it.name + ' again'));
            b.appendChild(btn('Delete', 'secondary del', () => change(() => { state.items = state.items.filter(x => x.id !== it.id); }, 'arch-msg', it.name + ' deleted.'), 'Delete ' + it.name));
            li.appendChild(b);
            ul.appendChild(li);
        });
    }

    // ---------- backup ----------
    function backup() {
        const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = SLUG + '-' + today + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        flash = { where: 'tools-msg', text: 'Backup file saved to your downloads.' }; render();
    }
    function restore(file, where) {
        if (!file) return;
        if (file.size > 5000000) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const r = new FileReader();
        r.onload = () => {
            let s = null;
            try { s = C.cleanState(JSON.parse(String(r.result))); } catch (e) { s = null; }
            if (!s) { flash = { where, text: 'That file is not a backup from this app.', bad: true }; render(); return; }
            change(() => { state = s; panel = null; resetForm(); }, where, 'Backup restored: ' + C.plural(s.items.length, 'item', 'items') + '.');
        };
        r.onerror = () => { flash = { where, text: 'Could not read that file.', bad: true }; render(); };
        r.readAsText(file);
    }

    // ---------- draw ----------
    function render() {
        renderOrders();
        renderList();
        renderArch();
        $('cur').value = state.cur;
        $('restore-first').hidden = state.items.length > 0;
        $('shop-open').textContent = state.shop ? 'Shop name in the orders: ' + state.shop + ' (change)' : '+ Add your shop name to the orders (optional)';
        clearMsgs();
        if (flash) { const f = flash; flash = null; showMsg($(f.where) && !$(f.where).closest('[hidden]') ? f.where : 'add-msg', f.text, f.undo, f.bad); }
    }

    // ---------- start ----------
    function start() {
        load();
        if (!canSave) $('store-warn').hidden = false;
        Object.keys(CUR_NAMES).forEach(k => { const o = el('option', '', CUR_NAMES[k]); o.value = k; $('cur').appendChild(o); });
        C.UNITS.forEach(u => { const o = el('option', '', UNIT_NAMES[u[0]] || u[1]); o.value = u[0]; $('f-unit').appendChild(o); });
        const own = el('option', '', 'Other unit…'); own.value = '+own'; $('f-unit').appendChild(own);
        resetForm();
        render();
        $('f-unit').addEventListener('change', () => { labels(); fillPresets(); preview(); if ($('f-unit').value === '+own') $('f-unit-own').focus(); });
        $('f-unit-own').addEventListener('input', () => { labels(); preview(); });
        ['f-low', 'f-full'].forEach(id => $(id).addEventListener('input', () => { levelsTouched = true; preview(); }));
        ['f-name', 'f-stock', 'f-sup', 'f-price'].forEach(id => $(id).addEventListener('input', preview));
        ['f-name', 'f-stock', 'f-low', 'f-full', 'f-sup', 'f-price', 'f-unit-own'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveForm(); } }));
        $('f-price-open').addEventListener('click', () => reveal('f-price-open', 'f-price-box', 'f-price'));
        $('f-save').addEventListener('click', saveForm);
        $('f-cancel').addEventListener('click', () => { resetForm(); render(); });
        $('go-add').addEventListener('click', () => { $('add').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('f-name').focus({ preventScroll: true }); });
        document.querySelectorAll('input[name=filter]').forEach(r => r.addEventListener('change', () => { filter = r.value; render(); }));
        $('find').addEventListener('input', () => { find = $('find').value; renderList(); });
        $('ord-print').addEventListener('click', () => window.print());
        $('shop-open').addEventListener('click', () => { $('shop').value = state.shop; reveal('shop-open', 'shop-box', 'shop'); });
        const saveShop = () => {
            const v = $('shop').value.replace(/\s+/g, ' ').trim().slice(0, 60);
            $('shop-box').hidden = true; $('shop-open').hidden = false;
            change(() => { state.shop = v; }, 'tools-msg', v ? 'Shop name saved. It is added to the orders.' : 'Shop name removed from the orders.');
        };
        $('shop-save').addEventListener('click', saveShop);
        $('shop').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveShop(); } });
        $('cur').addEventListener('change', () => { state.cur = C.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; save(); preview(); flash = { where: 'tools-msg', text: 'Currency symbol saved.' }; render(); });
        $('backup').addEventListener('click', backup);
        $('restore').addEventListener('click', () => { $('restore-file').dataset.where = 'tools-msg'; $('restore-file').click(); });
        $('restore-first').addEventListener('click', () => { $('restore-file').dataset.where = 'add-msg'; $('restore-file').click(); });
        $('restore-file').addEventListener('change', e => { restore(e.target.files[0], e.target.dataset.where || 'tools-msg'); e.target.value = ''; });
        $('del-all').addEventListener('click', () => {
            if (!state.items.length) { flash = { where: 'tools-msg', text: 'There is nothing to delete.' }; render(); return; }
            const cur = state.cur, shop = state.shop;
            change(() => { state = C.emptyState(); state.cur = cur; state.shop = shop; panel = null; filter = 'all'; find = ''; $('find').value = ''; resetForm(); }, 'tools-msg', 'Everything deleted.');
        });
        // a new day while the page stays open
        setInterval(() => { const t = C.dayStr(new Date()); if (t !== today) { today = t; render(); } }, 60000);
        if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    start();
})();
