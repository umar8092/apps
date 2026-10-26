// Tailor Orders and Family Measurements: the page. All logic lives in core.js (window.TO).
(function () {
    'use strict';
    const C = window.TO;
    const SLUG = 'tailor-orders-and-family-measurements';
    const KEY = SLUG + '.data', KEY_CUR = SLUG + '.cur';
    const $ = id => document.getElementById(id);
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }

    let state = { v: 1, people: [], orders: [] };
    let cur = '';
    let canSave = true;
    let today = C.todayIso();
    const panel = {};          // order id -> 'pay' | 'collect' | 'fix'
    let editingOrder = null;   // order id loaded in the form
    let personForm = null;     // { mode: 'add' | 'edit' | 'new', id }
    let chosenPerson = null;   // person id, '' for someone else, null for nobody picked yet
    let lastAdded = null;      // order id to highlight

    // ---------- saving ----------
    function warn(text) { const w = $('storage-warn'); w.textContent = text; w.hidden = !text; }
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (!canSave) { warn('Your browser is not letting this page save. Everything will be lost when you close it. Use "Save a backup file" before leaving.'); }
        if (raw) {
            try { state = C.clean(JSON.parse(raw)); }
            catch (e) {
                state = C.clean(null);
                try { localStorage.setItem(KEY + '.damaged', raw); } catch (e2) { /* fine */ }
                warn('The saved diary was damaged and could not be read, so the app started fresh. If you have a backup file, use "Restore a backup".');
            }
        }
        try { const c = localStorage.getItem(KEY_CUR); if (C.CURRENCIES.includes(c)) cur = c; } catch (e) { /* fine */ }
    }
    function save() {
        if (!canSave) return;
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { canSave = false; warn('This browser stopped letting the page save (storage full or blocked). Use "Save a backup file" so nothing is lost.'); }
    }
    const snap = () => JSON.stringify(state);

    // A change: keep the old state for Undo, save, redraw, and say what happened.
    function commit(msgId, text, before) {
        save(); render();
        say(msgId, text, before ? () => { state = C.clean(JSON.parse(before)); save(); render(); say(msgId, 'Undone.'); } : null);
    }
    function say(msgId, text, undo) {
        const m = $(msgId); m.textContent = ''; m.className = 'msg' + (text ? ' show' : '');
        if (!text) return;
        m.appendChild(el('span', null, text));
        if (undo) m.appendChild(btn('Undo', 'undo', undo));
    }
    function clearMsgs() { ['glance-msg', 'orders-msg', 'add-msg', 'family-msg', 'set-msg'].forEach(id => say(id, '')); }

    // ---------- helpers ----------
    const person = id => state.people.find(p => p.id === id) || null;
    const orderById = id => state.orders.find(o => o.id === id) || null;
    const m = c => C.money(c, cur);
    function copy(text, msgId, what) {
        const done = () => say(msgId, what + ' copied. Paste it into WhatsApp, a message or an email.');
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
            let okay = false; try { okay = document.execCommand('copy'); } catch (e) { /* fine */ }
            t.remove(); okay ? done() : say(msgId, 'Could not copy here. Use Email or Share instead.');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function mailto(subject, body) { return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body.slice(0, 1800)); }
    function chip(text, pressed, fn) { const b = btn(text, 'chip-btn', fn); b.setAttribute('aria-pressed', pressed ? 'true' : 'false'); return b; }
    function knownTailors() {
        const seen = new Map();
        state.orders.slice().sort((a, b) => b.given.localeCompare(a.given)).forEach(o => { const k = o.tailor.toLowerCase(); if (!seen.has(k)) seen.set(k, o.tailor); });
        return [...seen.values()];
    }

    // ---------- at the tailor ----------
    function renderGlance() {
        const box = $('glance-body'); box.textContent = '';
        const s = C.summary(state.orders, today);
        $('glance-tools').hidden = !s.count;
        if (!s.count) {
            const p = el('p', 'empty-note', state.orders.length ? 'Nothing at the tailor right now. Everything has been collected.' : 'Nothing at the tailor yet. Add an order in "Give clothes to the tailor", and save each person\'s measurements in "Family measurements".');
            box.appendChild(p);
            return;
        }
        box.appendChild(el('p', 'big', C.plural(s.count, 'order') + (s.pieces !== s.count ? ' (' + C.plural(s.pieces, 'piece') + ')' : '') + ' at ' + C.plural(s.tailors.length, 'tailor')));
        const pay = el('p', 'topay');
        pay.appendChild(el('span', null, 'Still to pay: '));
        pay.appendChild(el('b', null, m(s.toPay)));
        if (s.noPrice) pay.appendChild(el('span', 'muted', ' + ' + C.plural(s.noPrice, 'order') + ' with no price yet'));
        box.appendChild(pay);
        const pills = el('div', 'pills');
        if (s.late) pills.appendChild(el('span', 'pill late', s.late + ' late'));
        if (s.ready) pills.appendChild(el('span', 'pill ready', s.ready + ' ready to collect'));
        if (s.week) pills.appendChild(el('span', 'pill soon', s.week + ' due in the next 7 days'));
        if (pills.childNodes.length) box.appendChild(pills);
        const ul = el('ul', 'tailors');
        s.tailors.forEach(t => {
            const li = el('li');
            li.appendChild(el('b', null, t.name));
            const bits = [C.plural(t.orders, 'order')];
            if (t.late) bits.push(t.late + ' late');
            if (t.ready) bits.push(t.ready + ' ready');
            bits.push(t.toPay ? m(t.toPay) + ' to pay' : 'nothing to pay');
            li.appendChild(el('span', null, bits.join(' · ')));
            ul.appendChild(li);
        });
        box.appendChild(ul);
        const text = C.summaryText(state.orders, today, cur);
        $('email-glance').href = mailto('At the tailor', text);
    }

    // ---------- orders ----------
    function renderOrders() {
        const list = $('order-list'); list.textContent = '';
        const open = C.sortOpen(state.orders, today);
        if (!open.length) list.appendChild(el('li', 'empty-note', state.orders.length ? 'No open orders. Collected ones are below.' : 'Your orders will show here, each in its own box.'));
        open.forEach(o => list.appendChild(orderBox(o)));
        const done = C.sortCollected(state.orders);
        $('collected-box').hidden = !done.length;
        $('collected-sum').textContent = 'Collected (' + done.length + ')';
        const cl = $('collected-list'); cl.textContent = '';
        done.forEach(o => cl.appendChild(orderBox(o)));
    }
    function orderBox(o) {
        const s = C.statusOf(o, today);
        const li = el('li', 'order st-' + s.key + (o.id === lastAdded ? ' fresh' : ''));
        li.id = 'order-' + o.id;
        const top = el('div', 'o-top');
        const h = el('h3');
        h.appendChild(el('span', 'o-who', o.personName));
        h.appendChild(document.createTextNode(': ' + o.item + (o.pieces > 1 ? ' (' + o.pieces + ' pieces)' : '')));
        top.appendChild(h);
        const badge = { late: 'Late', ready: 'Ready', due: s.days <= 1 ? (s.days === 0 ? 'Today' : 'Tomorrow') : 'At tailor', nodate: 'At tailor', collected: 'Collected' }[s.key];
        top.appendChild(el('span', 'badge b-' + s.key, badge));
        li.appendChild(top);
        li.appendChild(el('p', 'o-when', s.text));
        li.appendChild(el('p', 'o-meta', 'At ' + o.tailor + ' · given ' + C.fmtNear(o.given, today)));
        const ml = C.moneyLine(o, cur);
        if (ml) { const p = el('p', 'o-money' + (C.balanceOf(o) > 0 ? ' owe' : ''), ml); li.appendChild(p); }
        if (o.note) li.appendChild(el('p', 'o-note', o.note));
        o.fixes.forEach(f => li.appendChild(el('p', 'o-fix', 'Sent back for a fix ' + C.fmtNear(f.date, today) + (f.note ? ': ' + f.note : ''))));
        if (o.payments.length) {
            const d = el('details', 'pays');
            d.appendChild(el('summary', null, 'Payments (' + o.payments.length + ')'));
            const ul = el('ul');
            o.payments.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(p => {
                const r = el('li');
                r.appendChild(el('span', null, C.fmtNear(p.date, today) + ': ' + m(p.cents)));
                r.appendChild(btn('Remove', 'mini', () => {
                    const before = snap(); o.payments = o.payments.filter(x => x.id !== p.id);
                    commit('orders-msg', 'Removed the payment of ' + m(p.cents) + '.', before);
                }, 'Remove payment of ' + m(p.cents) + ' on ' + C.fmt(p.date)));
                ul.appendChild(r);
            });
            d.appendChild(ul);
            li.appendChild(d);
        }
        const btns = el('div', 'o-btns');
        const who = o.personName + "'s " + o.item;
        if (o.status === 'given') btns.appendChild(btn('Mark ready', 'act', () => {
            const before = snap(); o.status = 'ready'; commit('orders-msg', who + ' is ready to collect.', before);
        }, 'Mark ready: ' + who));
        if (o.status !== 'collected') btns.appendChild(btn('Collected', 'act', () => togglePanel(o.id, 'collect'), 'Collected: ' + who));
        if (o.status !== 'given') btns.appendChild(btn('Back to tailor for a fix', null, () => togglePanel(o.id, 'fix'), 'Back to tailor for a fix: ' + who));
        btns.appendChild(btn('Add payment', null, () => togglePanel(o.id, 'pay'), 'Add payment: ' + who));
        btns.appendChild(btn('Copy for tailor', null, () => copy(C.orderText(o, person(o.personId), today, cur), 'orders-msg', who), 'Copy for tailor: ' + who));
        btns.appendChild(btn('Edit', null, () => loadOrder(o.id), 'Edit: ' + who));
        btns.appendChild(btn('Delete', 'del', () => {
            const before = snap(); state.orders = state.orders.filter(x => x.id !== o.id); delete panel[o.id];
            if (editingOrder === o.id) resetForm(true);
            commit('orders-msg', 'Deleted ' + who + '.', before);
        }, 'Delete: ' + who));
        li.appendChild(btns);
        if (panel[o.id]) li.appendChild(orderPanel(o, panel[o.id]));
        return li;
    }
    function togglePanel(id, kind) {
        panel[id] = panel[id] === kind ? null : kind;
        render();
        const f = document.querySelector('#order-' + CSS.escape(id) + ' .o-panel input');
        if (f) f.focus();
    }
    function dateChips(input, options) {
        const wrap = el('div', 'chips small-chips');
        options.forEach(([text, val]) => wrap.appendChild(btn(text, 'chip-btn', () => { input.value = val; input.dispatchEvent(new Event('input')); })));
        return wrap;
    }
    function field(labelText, input, id) { const w = el('div'); input.id = id; const l = el('label', null, labelText); l.htmlFor = id; w.appendChild(l); w.appendChild(input); return w; }
    function orderPanel(o, kind) {
        const box = el('div', 'o-panel');
        const err = el('p', 'err'); err.setAttribute('role', 'alert');
        const pid = o.id;
        const dateIn = el('input'); dateIn.type = 'date'; dateIn.value = today;
        if (kind === 'pay' || kind === 'collect') {
            const bal = C.balanceOf(o);
            box.appendChild(el('h4', null, kind === 'pay' ? 'Add a payment' : 'Collected from the tailor'));
            const price = el('input'); price.type = 'text'; price.inputMode = 'decimal'; price.maxLength = 16; price.autocomplete = 'off';
            const amt = el('input'); amt.type = 'text'; amt.inputMode = 'decimal'; amt.maxLength = 16; amt.autocomplete = 'off';
            const two = el('div', 'two');
            if (kind === 'collect') {
                price.value = o.price === null ? '' : C.money(o.price, '').replace(/,/g, '');
                price.placeholder = 'e.g. 3000';
                two.appendChild(field('Final price', price, 'cp-' + pid));
                amt.value = bal > 0 ? C.money(bal, '').replace(/,/g, '') : '';
                amt.placeholder = '0';
                two.appendChild(field('Paid now', amt, 'ca-' + pid));
            } else {
                amt.placeholder = bal > 0 ? C.money(bal, '').replace(/,/g, '') : 'e.g. 500';
                two.appendChild(field('Amount paid', amt, 'pa-' + pid));
            }
            box.appendChild(two);
            const hint = el('p', 'hint');
            const upd = () => {
                const p = kind === 'collect' ? C.parseMoney(price.value) : o.price;
                const a = C.parseMoney(amt.value);
                if (p === null || isNaN(p) || p < 0 || (a !== null && (isNaN(a) || a < 0))) { hint.textContent = ''; return; }
                const left = p - C.paidOf(o) - (a || 0);
                hint.textContent = left > 0 ? 'Balance after this: ' + m(left) : left < 0 ? 'That is ' + m(-left) + ' more than the price.' : 'Fully paid after this.';
            };
            price.addEventListener('input', upd); amt.addEventListener('input', upd); upd();
            box.appendChild(hint);
            box.appendChild(field(kind === 'pay' ? 'Paid on' : 'Collected on', dateIn, 'cd-' + pid));
            box.appendChild(dateChips(dateIn, [['Today', today], ['Yesterday', C.addDays(today, -1)]]));
            box.appendChild(err);
            const go = btn(kind === 'pay' ? 'Save payment' : 'Mark collected', 'primary', () => {
                const errs = [];
                let p = o.price;
                if (kind === 'collect') { const r = C.checkMoney(price.value, 'Final price'); if (r.error) errs.push(r.error); else p = r.value; }
                const a = C.checkMoney(amt.value, kind === 'pay' ? 'Amount paid' : 'Paid now');
                if (a.error) errs.push(a.error);
                if (kind === 'pay' && !a.error && !a.value) errs.push('Type the amount you paid.');
                if (!C.isIso(dateIn.value)) errs.push('Pick the date.');
                else if (dateIn.value < o.given) errs.push('That date is before the order was given (' + C.fmt(o.given) + ').');
                if (errs.length) { err.textContent = errs.join(' '); return; }
                const before = snap();
                if (a.value) o.payments.push({ id: C.uid(), date: dateIn.value, cents: a.value });
                let text;
                if (kind === 'collect') { o.price = p; o.status = 'collected'; o.collected = dateIn.value; text = 'Collected ' + o.personName + "'s " + o.item + '.'; }
                else text = 'Added ' + m(a.value) + ' paid for ' + o.personName + "'s " + o.item + '.';
                const bal2 = C.balanceOf(o);
                if (bal2 > 0) text += ' Balance ' + m(bal2) + '.'; else if (bal2 === 0 && o.price > 0) text += ' Fully paid.'; else if (bal2 < 0) text += ' You paid ' + m(-bal2) + ' more than the price.';
                panel[pid] = null;
                commit('orders-msg', text, before);
            });
            const row = el('div', 'form-btns'); row.appendChild(go); row.appendChild(btn('Cancel', 'secondary', () => togglePanel(pid, kind))); box.appendChild(row);
        } else {
            box.appendChild(el('h4', null, 'Back to the tailor for a fix'));
            const what = el('input'); what.type = 'text'; what.maxLength = 300; what.placeholder = 'e.g. Shorter sleeves'; what.autocomplete = 'off';
            box.appendChild(field('What needs fixing (optional)', what, 'fw-' + pid));
            const when = el('input'); when.type = 'date';
            box.appendChild(field('New ready date (optional)', when, 'fd-' + pid));
            box.appendChild(dateChips(when, [['In 2 days', C.addDays(today, 2)], ['In 1 week', C.addDays(today, 7)], ['Not set', '']]));
            box.appendChild(err);
            const go = btn('Send back', 'primary', () => {
                if (when.value && (!C.isIso(when.value) || when.value < today)) { err.textContent = 'Pick a ready date from today on, or Not set.'; return; }
                const before = snap();
                o.fixes.push({ date: today, note: what.value.trim().slice(0, 300) });
                o.status = 'given'; o.collected = ''; o.promised = when.value || '';
                if (o.promised && o.promised < o.given) o.promised = '';
                panel[pid] = null;
                commit('orders-msg', o.personName + "'s " + o.item + ' is back at ' + o.tailor + (o.promised ? ', ready ' + C.fmtNear(o.promised, today) : '') + '.', before);
            });
            const row = el('div', 'form-btns'); row.appendChild(go); row.appendChild(btn('Cancel', 'secondary', () => togglePanel(pid, kind))); box.appendChild(row);
        }
        return box;
    }

    // ---------- the order form ----------
    function renderPersonChips() {
        const box = $('person-chips'); box.textContent = '';
        if (chosenPerson && !person(chosenPerson)) chosenPerson = null;
        state.people.forEach(p => box.appendChild(chip(p.name, chosenPerson === p.id, () => { chosenPerson = p.id; $('person-name').value = ''; $('person-name').removeAttribute('aria-invalid'); renderPersonChips(); })));
        const someone = chosenPerson === '' || !state.people.length;
        if (state.people.length) box.appendChild(chip('Someone else', chosenPerson === '', () => { chosenPerson = ''; renderPersonChips(); $('person-name').focus(); }));
        box.hidden = !state.people.length;
        $('person-name').hidden = $('person-name-label').hidden = !someone;
        $('person-name-label').className = state.people.length ? '' : 'sr-label';
        $('person-hint').textContent = state.people.length ? '' : 'Tip: add people in "Family measurements" to pick them here in one tap and keep their measurements.';
    }
    function renderItemChips() {
        const box = $('item-chips'); box.textContent = '';
        const val = $('item').value.trim().toLowerCase();
        C.ITEMS.forEach(t => box.appendChild(chip(t, val === t.toLowerCase(), () => { $('item').value = t; renderItemChips(); })));
    }
    function renderTailorChips() {
        const box = $('tailor-chips'); box.textContent = '';
        const names = knownTailors();
        const dl = $('tailor-list'); dl.textContent = '';
        names.forEach(n => { const o = el('option'); o.value = n; dl.appendChild(o); });
        const val = $('tailor').value.trim().toLowerCase();
        names.slice(0, 6).forEach(n => box.appendChild(chip(n, val === n.toLowerCase(), () => { $('tailor').value = n; renderTailorChips(); })));
    }
    function renderDateChips() {
        const g = $('given').value || today;
        const gc = $('given-chips'); gc.textContent = '';
        [['Today', today], ['Yesterday', C.addDays(today, -1)]].forEach(([t, v]) => gc.appendChild(chip(t, $('given').value === v, () => { $('given').value = v; renderDateChips(); })));
        const pc = $('promised-chips'); pc.textContent = '';
        const base = C.isIso(g) ? g : today;
        [['In 3 days', 3], ['In 1 week', 7], ['In 2 weeks', 14]].forEach(([t, n]) => {
            const v = C.addDays(base, n);
            pc.appendChild(chip(t, $('promised').value === v, () => { $('promised').value = v; renderDateChips(); }));
        });
        pc.appendChild(chip('Not set', !$('promised').value, () => { $('promised').value = ''; renderDateChips(); }));
        const p = $('promised').value;
        $('promised-note').textContent = C.isIso(p) ? 'Ready ' + C.fmt(p, p.slice(0, 4) !== today.slice(0, 4)) + ' (' + C.rel(p, today) + ')' + (p < today ? ': this date has passed, so the order will show as late' : '') + '.' : 'No ready date yet. You can add one later with Edit.';
        if (C.isIso(g)) $('promised').min = g;
    }
    function renderCurLabels() {
        const s = cur ? ' (' + cur + ')' : '';
        $('price-label').textContent = 'Stitching price' + s;
        $('advance-label').textContent = 'Advance paid' + s;
    }
    function showMoney(show) { $('money-row').hidden = !show; $('money-open').hidden = show; }
    function showNote(show) { $('note-row').hidden = !show; $('note-open').hidden = show; }
    function resetForm(full) {
        const keepTailor = full ? '' : $('tailor').value, keepGiven = full ? today : ($('given').value || today), keepPromised = full ? '' : $('promised').value;
        $('add-form').reset();
        $('tailor').value = keepTailor; $('given').value = keepGiven; $('promised').value = keepPromised;
        $('pieces').value = '1';
        chosenPerson = null;
        editingOrder = null;
        $('add-h').textContent = 'Give clothes to the tailor';
        $('add-btn').textContent = 'Add order';
        $('add-cancel').hidden = true;
        $('advance-wrap').hidden = false; $('advance-hint').hidden = true;
        showMoney(false); showNote(false);
        $('add-err').textContent = '';
        document.querySelectorAll('#add-form [aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
        renderForm();
    }
    function renderForm() { renderPersonChips(); renderItemChips(); renderTailorChips(); renderDateChips(); renderCurLabels(); }
    function loadOrder(id) {
        const o = orderById(id); if (!o) return;
        editingOrder = id;
        chosenPerson = o.personId && person(o.personId) ? o.personId : '';
        $('person-name').value = chosenPerson ? '' : o.personName;
        $('item').value = o.item; $('pieces').value = String(o.pieces); $('tailor').value = o.tailor;
        $('given').value = o.given; $('promised').value = o.promised;
        $('price').value = o.price === null ? '' : C.money(o.price, '').replace(/,/g, '');
        $('advance').value = '';
        $('advance-wrap').hidden = true; $('advance-hint').hidden = false;
        $('note').value = o.note;
        showMoney(true); showNote(!!o.note);
        $('add-h').textContent = 'Edit order: ' + o.personName + "'s " + o.item;
        $('add-btn').textContent = 'Save changes';
        $('add-cancel').hidden = false;
        $('add-err').textContent = '';
        renderForm();
        $('adder').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('item').focus({ preventScroll: true });
    }
    function submitOrder(e) {
        e.preventDefault();
        const p = chosenPerson ? person(chosenPerson) : null;
        const r = C.readOrder({
            personId: p ? p.id : null, personName: p ? p.name : (chosenPerson === '' || !state.people.length ? $('person-name').value : ''), item: $('item').value, tailor: $('tailor').value, pieces: $('pieces').value,
            given: $('given').value, promised: $('promised').value, price: $('price').value, advance: editingOrder ? '' : $('advance').value, note: $('note').value
        }, today);
        const map = { person: 'person-name', item: 'item', tailor: 'tailor', pieces: 'pieces', given: 'given', promised: 'promised', price: 'price', advance: 'advance' };
        document.querySelectorAll('#add-form [aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
        if (r.errors) {
            $('add-err').textContent = Object.values(r.errors).join(' ');
            Object.keys(r.errors).forEach(k => { if (map[k]) $(map[k]).setAttribute('aria-invalid', 'true'); });
            if (r.errors.price || r.errors.advance) showMoney(true);
            const first = Object.keys(map).find(k => r.errors[k]);
            if (first === 'person' && $('person-name').hidden) $('person-chips').querySelector('button').focus();
            else if (first && !$(map[first]).hidden) $(map[first]).focus();
            return;
        }
        $('add-err').textContent = '';
        const o = r.order;
        const before = snap();
        clearMsgs();
        if (editingOrder) {
            const x = orderById(editingOrder);
            if (x) {
                const firstPay = x.payments.reduce((a, pm) => a && a < pm.date ? a : pm.date, '');
                if (firstPay && firstPay < o.given) { $('add-err').textContent = 'A payment on ' + C.fmt(firstPay) + ' is before that date. Change the date given or remove the payment first.'; $('given').setAttribute('aria-invalid', 'true'); return; }
                Object.assign(x, { personId: o.personId, personName: o.personName, item: o.item, tailor: o.tailor, pieces: o.pieces, given: o.given, promised: o.promised, price: o.price, note: o.note });
                if (x.collected && x.collected < x.given) x.collected = x.given;
                lastAdded = x.id;
            }
            resetForm(true);
            commit('add-msg', 'Saved the changes to ' + o.personName + "'s " + o.item + '.', before);
            return;
        }
        if (state.orders.length >= C.MAX_ORDERS) { $('add-err').textContent = 'The diary is full (' + C.MAX_ORDERS + ' orders). Delete old collected orders first.'; return; }
        const add = { id: C.uid(), personId: o.personId, personName: o.personName, item: o.item, tailor: o.tailor, pieces: o.pieces, given: o.given, promised: o.promised,
            price: o.price, payments: o.advance ? [{ id: C.uid(), date: o.given, cents: o.advance }] : [], note: o.note, status: 'given', collected: '', fixes: [] };
        state.orders.push(add);
        lastAdded = add.id;
        resetForm(false);
        const s = C.statusOf(add, today);
        commit('add-msg', 'Added ' + add.personName + "'s " + add.item + ' at ' + add.tailor + ': ' + s.text.charAt(0).toLowerCase() + s.text.slice(1) + '. The tailor and dates stay filled in for the next order.', before);
    }

    // ---------- family measurements ----------
    function renderPeople() {
        const ul = $('people'); ul.textContent = '';
        $('family-hint').hidden = !!state.people.length && !!personForm;
        state.people.forEach(p => ul.appendChild(personBox(p)));
        const slot = $('person-form-slot'); slot.textContent = '';
        if (personForm && personForm.mode === 'add') slot.appendChild(personFormEl(null, 'add'));
        $('add-person').hidden = !!(personForm && personForm.mode === 'add') || state.people.length >= C.MAX_PEOPLE;
    }
    function measureGrid(set) {
        const wrap = el('div');
        const rows = C.filledRows(set);
        if (!rows.length) { wrap.appendChild(el('p', 'hint', 'No numbers filled in yet.')); return wrap; }
        [['top', 'Shirt / kameez'], ['bottom', 'Shalwar / trousers'], ['other', 'Other']].forEach(([g, title]) => {
            const list = rows.filter(r => r.group === g); if (!list.length) return;
            wrap.appendChild(el('p', 'g-head', title));
            const dl = el('dl', 'mgrid');
            list.forEach(r => { const d = el('div'); d.appendChild(el('dt', null, r.label)); d.appendChild(el('dd', null, r.value)); dl.appendChild(d); });
            wrap.appendChild(dl);
        });
        return wrap;
    }
    function personBox(p) {
        const li = el('li', 'person'); li.id = 'person-' + p.id;
        const editing = personForm && personForm.id === p.id;
        const top = el('div', 'p-top');
        top.appendChild(el('h3', null, p.name));
        const set = C.latest(p);
        if (set) top.appendChild(el('span', 'unit', C.unitWord(set.unit)));
        li.appendChild(top);
        if (editing) { li.appendChild(personFormEl(p, personForm.mode)); return li; }
        if (!set) li.appendChild(el('p', 'hint', 'No measurements saved yet. Tap "New measurements" to add them.'));
        else {
            const months = C.monthsBetween(set.date, today);
            li.appendChild(el('p', 'p-meta' + (months >= 6 ? ' old' : ''), 'Measured ' + C.fmt(set.date, true) + ' (' + C.age(set.date, today) + ')' + (months >= 6 ? '. Measure again before the next order, as sizes change and children grow fast.' : '')));
            const prev = p.sets.length > 1 ? p.sets[p.sets.length - 2] : null;
            const ch = C.changes(prev, set);
            if (ch.length) li.appendChild(el('p', 'p-change', 'Changed since ' + C.fmt(prev.date, true) + ': ' + ch.map(c => c.text).join(', ')));
            li.appendChild(measureGrid(set));
        }
        if (p.note) li.appendChild(el('p', 'p-note', 'Fit: ' + p.note));
        const open = state.orders.filter(o => o.personId === p.id && o.status !== 'collected').length;
        if (open) li.appendChild(el('p', 'p-orders', C.plural(open, 'order') + ' at the tailor'));
        const btns = el('div', 'o-btns');
        if (set) btns.appendChild(btn('Copy measurements', 'act', () => copy(C.measureText(p, today), 'family-msg', p.name + "'s measurements"), 'Copy measurements: ' + p.name));
        btns.appendChild(btn('New measurements', set ? null : 'act', () => { personForm = { mode: 'new', id: p.id }; render(); focusForm(); }, 'New measurements: ' + p.name));
        btns.appendChild(btn('Edit', null, () => { personForm = { mode: 'edit', id: p.id }; render(); focusForm(); }, 'Edit: ' + p.name));
        btns.appendChild(btn('Order for ' + p.name, null, () => {
            if (editingOrder) resetForm(true);
            chosenPerson = p.id; renderPersonChips();
            $('adder').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('item').focus({ preventScroll: true });
        }));
        li.appendChild(btns);
        if (p.sets.length > 1) {
            const d = el('details', 'earlier');
            d.appendChild(el('summary', null, 'Earlier measurements (' + (p.sets.length - 1) + ')'));
            p.sets.slice(0, -1).reverse().forEach(s => {
                const box = el('div', 'old-set');
                box.appendChild(el('p', 'g-date', C.fmt(s.date, true) + ' (' + C.unitWord(s.unit) + ')'));
                box.appendChild(measureGrid(s));
                box.appendChild(btn('Delete this set', 'mini', () => {
                    const before = snap(); p.sets = p.sets.filter(x => x.id !== s.id);
                    commit('family-msg', 'Deleted the measurements from ' + C.fmt(s.date, true) + '.', before);
                }, 'Delete the measurements from ' + C.fmt(s.date, true)));
                d.appendChild(box);
            });
            li.appendChild(d);
        }
        return li;
    }
    function focusForm() { const f = document.querySelector('.p-form input'); if (f) { f.focus({ preventScroll: true }); f.closest('.p-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }

    function personFormEl(p, mode) {
        const form = el('form', 'p-form'); form.noValidate = true;
        const key = p ? p.id : 'new';
        const set = p ? C.latest(p) : null;
        form.appendChild(el('h4', null, mode === 'add' ? 'Add a person' : mode === 'new' ? 'New measurements for ' + p.name : 'Edit ' + p.name));
        if (mode === 'new' && set) form.appendChild(el('p', 'hint', 'The boxes start with the last numbers (' + C.fmt(set.date, true) + '). Change only what changed. The old set is kept.'));
        if (mode === 'edit' && set) form.appendChild(el('p', 'hint', 'This fixes the measurements from ' + C.fmt(set.date, true) + '. To keep the old ones, use "New measurements" instead.'));
        let nameIn = null;
        if (mode !== 'new') {
            nameIn = el('input'); nameIn.type = 'text'; nameIn.maxLength = 60; nameIn.autocomplete = 'off'; nameIn.placeholder = 'e.g. Ali';
            nameIn.value = p ? p.name : '';
            form.appendChild(field('Name', nameIn, 'pn-' + key));
        }
        // a new person starts in the unit most of the family already uses
        const units = state.people.map(C.latest).filter(Boolean).map(x => x.unit);
        let unit = set ? set.unit : units.filter(u => u === 'cm').length > units.length / 2 ? 'cm' : 'in';
        const fsU = el('fieldset', 'chips-field'); fsU.appendChild(el('legend', null, 'Measurements in'));
        const seg = el('div', 'seg');
        const uMsg = el('p', 'hint');
        ['in', 'cm'].forEach(u => {
            const l = el('label'); const r = el('input'); r.type = 'radio'; r.name = 'unit-' + key; r.value = u; r.checked = unit === u;
            r.addEventListener('change', () => {
                if (!r.checked || unit === u) return;
                let n = 0;
                inputs.forEach(({ input }) => { const v = C.parseMeasure(input.value); if (typeof v === 'number' && !isNaN(v) && v > 0) { input.value = C.fmtMeasure(C.convert(v, unit, u), u); n++; } });
                customRows.forEach(({ val }) => { const v = C.parseMeasure(val.value); if (typeof v === 'number' && !isNaN(v) && v > 0) { val.value = C.fmtMeasure(C.convert(v, unit, u), u); n++; } });
                unit = u;
                uMsg.textContent = n ? 'Changed ' + C.plural(n, 'number') + ' to ' + C.unitWord(u) + ' (to the nearest ' + (u === 'cm' ? '0.5 cm' : '¼ inch') + ').' : '';
                groupLegends.forEach(([lg, title]) => { lg.textContent = title + ' (' + C.unitWord(u) + ')'; });
            });
            l.appendChild(r); l.appendChild(el('span', null, C.unitWord(u))); seg.appendChild(l);
        });
        fsU.appendChild(seg); fsU.appendChild(uMsg); form.appendChild(fsU);

        const dateIn = el('input'); dateIn.type = 'date'; dateIn.max = today;
        dateIn.value = mode === 'edit' && set ? set.date : today;
        form.appendChild(field('Date measured', dateIn, 'pd-' + key));

        const inputs = [], groupLegends = [];
        [['top', 'Shirt / kameez'], ['bottom', 'Shalwar / trousers']].forEach(([g, title]) => {
            const fs = el('fieldset', 'mfield');
            const lg = el('legend', null, title + ' (' + C.unitWord(unit) + ')'); fs.appendChild(lg); groupLegends.push([lg, title]);
            const grid = el('div', 'minputs');
            C.FIELDS.filter(f => f.group === g).forEach(f => {
                const i = el('input'); i.type = 'text'; i.maxLength = 12; i.autocomplete = 'off'; i.inputMode = 'decimal';
                if (set && typeof set.values[f.key] === 'number') i.value = C.fmtMeasure(set.values[f.key], set.unit);
                grid.appendChild(field(f.label, i, 'm-' + f.key + '-' + key));
                inputs.push({ f, input: i });
            });
            fs.appendChild(grid); form.appendChild(fs);
        });

        const customWrap = el('div', 'custom'), customRows = [];
        function addCustom(label, value) {
            if (customRows.length >= C.MAX_CUSTOM) return;
            const row = el('div', 'c-row');
            const idn = 'c' + Math.random().toString(36).slice(2, 8) + '-' + key;
            const lab = el('input'); lab.type = 'text'; lab.maxLength = 40; lab.placeholder = 'e.g. Collar'; lab.value = label || ''; lab.autocomplete = 'off';
            const val = el('input'); val.type = 'text'; val.maxLength = 40; val.placeholder = 'e.g. Ban'; val.value = value || ''; val.autocomplete = 'off';
            row.appendChild(field('Measurement name', lab, idn + 'l'));
            row.appendChild(field('Size or detail', val, idn + 'v'));
            const entry = { lab, val, row };
            row.appendChild(btn('Remove', 'rm', () => { row.remove(); customRows.splice(customRows.indexOf(entry), 1); moreBtn.hidden = customRows.length >= C.MAX_CUSTOM; }, 'Remove this measurement'));
            customRows.push(entry); customWrap.appendChild(row);
            moreBtn.hidden = customRows.length >= C.MAX_CUSTOM;
        }
        const moreBtn = btn('+ Add another measurement (optional)', 'link', () => { addCustom(); customRows[customRows.length - 1].lab.focus(); });
        form.appendChild(customWrap); form.appendChild(moreBtn);
        if (set) set.custom.forEach(c => addCustom(c.label, typeof c.value === 'number' ? C.fmtMeasure(c.value, set.unit) : c.text));

        let noteIn = null;
        if (mode !== 'new') {
            noteIn = el('textarea'); noteIn.maxLength = 300; noteIn.rows = 2; noteIn.placeholder = 'e.g. Loose fit, round daman';
            noteIn.value = p ? p.note : '';
            const noteBox = field('Fit and style note', noteIn, 'pt-' + key);
            const noteBtn = btn('+ Add a fit note (optional)', 'link', () => { noteBox.hidden = false; noteBtn.hidden = true; noteIn.focus(); });
            noteBox.hidden = !noteIn.value; noteBtn.hidden = !!noteIn.value;
            form.appendChild(noteBtn); form.appendChild(noteBox);
        }

        const err = el('p', 'err'); err.setAttribute('role', 'alert'); form.appendChild(err);
        const row = el('div', 'form-btns');
        const saveB = el('button', 'primary', mode === 'new' ? 'Save new measurements' : 'Save'); saveB.type = 'submit';
        row.appendChild(saveB);
        row.appendChild(btn('Cancel', 'secondary', () => { personForm = null; render(); }));
        if (mode === 'edit') row.appendChild(btn('Delete ' + p.name, 'danger', () => {
            const before = snap();
            state.people = state.people.filter(x => x.id !== p.id);
            state.orders.forEach(o => { if (o.personId === p.id) o.personId = null; });
            personForm = null;
            commit('family-msg', 'Deleted ' + p.name + ' and their measurements. Their orders are kept.', before);
        }));
        form.appendChild(row);

        form.addEventListener('submit', e => {
            e.preventDefault();
            const errs = [];
            form.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
            let name = p ? p.name : '';
            if (nameIn) {
                name = nameIn.value.trim();
                if (!name) { errs.push('Type a name.'); nameIn.setAttribute('aria-invalid', 'true'); }
                else if (state.people.some(x => x.name.toLowerCase() === name.toLowerCase() && (!p || x.id !== p.id))) { errs.push('There is already a person called ' + name + '. Add a surname or initial.'); nameIn.setAttribute('aria-invalid', 'true'); }
            }
            if (!C.isIso(dateIn.value)) { errs.push('Pick the date measured.'); dateIn.setAttribute('aria-invalid', 'true'); }
            else if (dateIn.value > today) { errs.push('The date measured cannot be in the future.'); dateIn.setAttribute('aria-invalid', 'true'); }
            const values = {};
            inputs.forEach(({ f, input }) => {
                const r = C.checkMeasure(input.value, unit);
                if (r.error) { errs.push(f.label + ': ' + r.error); input.setAttribute('aria-invalid', 'true'); }
                else if (r.value !== null) values[f.key] = r.value;
            });
            const custom = [];
            customRows.forEach(({ lab, val }) => {
                const l = lab.value.trim(), v = val.value.trim();
                if (!l && !v) return;
                if (!l) { errs.push('Give each extra measurement a name.'); lab.setAttribute('aria-invalid', 'true'); return; }
                if (!v) { errs.push(l + ': type a size or detail, or remove it.'); val.setAttribute('aria-invalid', 'true'); return; }
                const n = C.parseMeasure(v);
                if (typeof n === 'number' && !isNaN(n) && n > 0 && n <= C.LIMIT[unit] && /^[\d\s.,/½¼¾⅛⅜⅝⅞-]+$/.test(v)) custom.push({ label: l, value: Math.round(n * 1000) / 1000 });
                else custom.push({ label: l, text: v });
            });
            if (errs.length) { err.textContent = errs.join(' '); const f = form.querySelector('[aria-invalid]'); if (f) f.focus(); return; }
            const hasNumbers = Object.keys(values).length || custom.length;
            const before = snap();
            const note = noteIn ? noteIn.value.trim().slice(0, 300) : (p ? p.note : '');
            let text;
            if (mode === 'add') {
                const np = { id: C.uid(), name, note, sets: hasNumbers ? [{ id: C.uid(), unit, date: dateIn.value, values, custom }] : [] };
                state.people.push(np);
                text = 'Added ' + name + (hasNumbers ? ' with ' + C.plural(Object.keys(values).length + custom.length, 'measurement') + '.' : '. Add measurements with "New measurements".');
            } else if (mode === 'new') {
                if (!hasNumbers) { err.textContent = 'Fill in at least one measurement.'; return; }
                if (p.sets.length >= 30) p.sets.shift();
                p.sets.push({ id: C.uid(), unit, date: dateIn.value, values, custom });
                p.sets.sort((a, b) => a.date.localeCompare(b.date));
                text = 'Saved new measurements for ' + name + '.' + (p.sets.length > 1 ? ' The earlier ones are kept.' : '');
            } else {
                const old = p.name;
                p.name = name; p.note = note;
                if (set) {
                    if (hasNumbers) Object.assign(set, { unit, date: dateIn.value, values, custom });
                    else p.sets = p.sets.filter(x => x !== set);
                    p.sets.sort((a, b) => a.date.localeCompare(b.date));
                } else if (hasNumbers) p.sets.push({ id: C.uid(), unit, date: dateIn.value, values, custom });
                state.orders.forEach(o => { if (o.personId === p.id) o.personName = name; });
                text = 'Saved ' + name + '.' + (old !== name ? ' Their orders now say ' + name + '.' : '');
            }
            personForm = null;
            commit('family-msg', text, before);
        });
        return form;
    }

    // ---------- settings ----------
    function renderSettings() {
        const sc = $('cur');
        if (!sc.options.length) C.CURRENCIES.forEach(c => { const o = el('option', null, c || 'None'); o.value = c; sc.appendChild(o); });
        sc.value = cur;
    }

    function render() {
        renderGlance(); renderOrders(); renderPeople(); renderForm(); renderSettings();
    }

    // ---------- events ----------
    $('add-form').addEventListener('submit', submitOrder);
    $('add-cancel').addEventListener('click', () => { resetForm(true); say('add-msg', ''); });
    $('item').addEventListener('input', renderItemChips);
    $('tailor').addEventListener('input', renderTailorChips);
    $('given').addEventListener('input', renderDateChips);
    $('given').addEventListener('change', renderDateChips);
    $('promised').addEventListener('input', renderDateChips);
    $('promised').addEventListener('change', renderDateChips);
    $('money-open').addEventListener('click', () => { showMoney(true); $('price').focus(); });
    $('note-open').addEventListener('click', () => { showNote(true); $('note').focus(); });
    $('add-person').addEventListener('click', () => { personForm = { mode: 'add' }; render(); focusForm(); });
    $('copy-glance').addEventListener('click', () => copy(C.summaryText(state.orders, today, cur), 'glance-msg', 'The list'));
    if (navigator.share) {
        $('share-glance').hidden = false;
        $('share-glance').addEventListener('click', () => { navigator.share({ title: 'At the tailor', text: C.summaryText(state.orders, today, cur) }).catch(() => { /* closed */ }); });
    }
    $('cur').addEventListener('change', () => {
        cur = C.CURRENCIES.includes($('cur').value) ? $('cur').value : '';
        try { localStorage.setItem(KEY_CUR, cur); } catch (e) { /* fine */ }
        render(); say('set-msg', cur ? 'Amounts now show ' + cur + '.' : 'Amounts now show as plain numbers.');
    });
    $('backup').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify({ app: SLUG, saved: new Date().toISOString(), currency: cur, data: state }, null, 1)], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'tailor-orders-backup-' + today + '.json';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        say('set-msg', 'Backup file saved (' + C.plural(state.people.length, 'person', 'people') + ', ' + C.plural(state.orders.length, 'order') + ').');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; $('restore-file').value = '';
        if (!f) return;
        if (f.size > 5000000) { say('set-msg', 'That file is too big to be a backup from this app.'); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let j; try { j = JSON.parse(rd.result); } catch (e) { say('set-msg', 'That file could not be read. Choose a backup saved by this app.'); return; }
            const data = j && j.app === SLUG ? j.data : j;
            if (!data || typeof data !== 'object' || (!Array.isArray(data.people) && !Array.isArray(data.orders))) { say('set-msg', 'That file is not a backup from Tailor Orders and Family Measurements.'); return; }
            const before = snap();
            state = C.clean(data);
            if (j && C.CURRENCIES.includes(j.currency)) { cur = j.currency; try { localStorage.setItem(KEY_CUR, cur); } catch (e) { /* fine */ } }
            personForm = null; resetForm(true);
            commit('set-msg', 'Restored ' + C.plural(state.people.length, 'person', 'people') + ' and ' + C.plural(state.orders.length, 'order') + '.', before);
        };
        rd.onerror = () => say('set-msg', 'That file could not be read.');
        rd.readAsText(f);
    });
    $('wipe').addEventListener('click', () => {
        if (!state.people.length && !state.orders.length) { say('set-msg', 'There is nothing to delete.'); return; }
        const before = snap();
        state = { v: 1, people: [], orders: [] }; personForm = null; resetForm(true);
        commit('set-msg', 'Deleted everything.', before);
    });

    // the dates move on by themselves after midnight
    setInterval(() => { const t = C.todayIso(); if (t !== today) { today = t; render(); } }, 60000);

    load();
    $('given').value = today;
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { /* offline copy not available */ });
})();
