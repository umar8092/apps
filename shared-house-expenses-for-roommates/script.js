// Shared House Expenses for Roommates: the page. The maths and the words are in core.js (window.HouseCore).
(function () {
    'use strict';
    const C = window.HouseCore, SLUG = 'shared-house-expenses-for-roommates', KEY = SLUG + '.state', UIKEY = SLUG + '.ui';
    const $ = id => document.getElementById(id);
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', 'AED': 'AED (dirham)',
        'SAR': 'SAR (riyal)', 'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', '¥': '¥ (yen, yuan)',
        '₺': '₺ (lira)', 'E£': 'E£ (Egyptian pound)', 'R$': 'R$ (real)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'CHF': 'CHF (franc)', 'kr': 'kr (krona, krone)', 'zł': 'zł (złoty)' };
    const MSGS = ['people-msg', 'add-msg', 'owe-msg', 'list-msg', 'tools-msg'];
    const SPLIT_HINT = {
        equal: 'Everyone ticked pays the same.',
        shares: 'Give each person a number of shares, such as 2 for the big room and 1 for the others.',
        exact: 'Type how much each person pays. The parts must add up to the amount.'
    };
    let state = C.emptyState(), ui = { cur: '', by: '', split: 'equal' }, storageOK = true;  // split always starts as Equally
    let today = C.dayStr(new Date()), month = today.slice(0, 7), undoSnap = null, editing = null, renaming = null;
    let sel = new Set(), vals = {};   // the "Who shares it?" ticks and the typed shares or parts

    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(cls, text, fn) { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
    const money = c => C.fmt(c, ui.cur);
    const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const mode = () => (document.querySelector('input[name="mode"]:checked') || {}).value || 'exp';
    const split = () => (document.querySelector('input[name="split"]:checked') || {}).value || 'equal';
    const name = id => C.nameOf(state, id);
    const active = () => state.people.filter(p => !p.out);
    const used = id => state.items.some(it => it.by === id || it.from === id || it.to === id || (it.parts && it.parts[id] != null));

    // ---------- storage ----------
    function load() {
        state = C.emptyState();
        try { const raw = localStorage.getItem(KEY); if (raw) state = C.normalize(JSON.parse(raw)); } catch (e) { state = C.emptyState(); }
        try {
            const u = JSON.parse(localStorage.getItem(UIKEY) || '{}') || {};
            if (typeof u.cur === 'string' && C.SYMBOLS.includes(u.cur)) ui.cur = u.cur;
            if (typeof u.by === 'string') ui.by = u.by;
        } catch (e) { /* bad or blocked: defaults */ }
        try { localStorage.setItem(KEY + '.test', '1'); localStorage.removeItem(KEY + '.test'); } catch (e) { storageOK = false; }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOK = false; } }
    function saveUi() { try { localStorage.setItem(UIKEY, JSON.stringify(ui)); } catch (e) { /* not saved */ } }
    const snap = () => JSON.stringify(state);
    function commit(before) { undoSnap = before; save(); render(); }

    function say(box, text, withUndo) {
        box.textContent = '';
        if (!text) { box.classList.remove('show'); return; }
        box.classList.add('show');
        box.appendChild(document.createTextNode(text + ' '));
        if (withUndo && undoSnap) {
            const s = undoSnap;
            box.appendChild(btn('link inline undo', 'Undo', () => {
                try { state = C.normalize(JSON.parse(s)); } catch (e) { state = C.emptyState(); }
                undoSnap = null; stopEdit(); renaming = null; save(); resetSel(); render();
                clearMsgs();
                say(box, 'Undone.');
            }));
        }
    }
    function clearMsgs(except) { MSGS.forEach(id => { if (id !== except) say($(id), ''); }); }
    function setErr(input, box, text) { box.textContent = text || ''; if (input) input.setAttribute('aria-invalid', text ? 'true' : 'false'); }
    function clearErrs() {
        [['what', 'what-err'], ['amount', 'amount-err'], ['by', 'by-err'], ['date', 'date-err'], ['from', 'from-err'], ['to', 'to-err']].forEach(([i, e]) => setErr($(i), $(e), ''));
        setErr(null, $('sel-err'), '');
        document.querySelectorAll('#sel input.val').forEach(i => i.setAttribute('aria-invalid', 'false'));
    }
    function checkToday() { const t = C.dayStr(new Date()); if (t !== today) { if (month === today.slice(0, 7)) month = t.slice(0, 7); today = t; } }

    // ---------- people ----------
    function addPerson() {
        clearMsgs('people-msg');
        const input = $('new-name'), nm = C.clean(input.value, 30);
        if (!nm) { setErr(input, $('name-err'), 'Type a name, such as Ali.'); input.focus(); return; }
        if (state.people.some(p => p.name.toLowerCase() === nm.toLowerCase())) { setErr(input, $('name-err'), nm + ' is already in the list. Add a surname or initial, such as ' + nm + ' K.'); input.focus(); return; }
        if (state.people.length >= C.MAX_PEOPLE) { setErr(input, $('name-err'), 'The most is ' + C.MAX_PEOPLE + ' people.'); return; }
        setErr(input, $('name-err'), '');
        const before = snap(), id = newId('p');
        state.people.push({ id, name: nm, out: false });
        if (!editing) sel.add(id);
        commit(before);
        input.value = '';
        say($('people-msg'), 'Added ' + nm + '.', true);
        input.focus();
    }
    function renderPeople() {
        const box = $('plist'); box.textContent = '';
        $('people-empty').hidden = state.people.length > 0;
        const bal = C.balances(state);
        state.people.forEach(p => {
            const card = el('div', 'person' + (p.out ? ' out' : ''));
            const top = el('div', 'p-top');
            const nm = el('p', 'p-name', p.name);
            if (p.out) nm.appendChild(el('span', 'tag', 'Moved out'));
            const b = bal[p.id] || 0;
            top.append(nm, el('p', 'p-bal ' + (b > 0 ? 'get' : b < 0 ? 'owes' : 'even'), b > 0 ? 'gets back ' + money(b) : b < 0 ? 'owes ' + money(-b) : 'settled up'));
            card.appendChild(top);
            if (renaming === p.id) {
                const panel = el('div', 'panel'), lab = el('label', null, 'New name for ' + p.name), inp = el('input'), err = el('p', 'err');
                inp.type = 'text'; inp.maxLength = 30; inp.id = 'rename-in'; inp.value = p.name; inp.autocomplete = 'off'; lab.htmlFor = 'rename-in'; err.setAttribute('role', 'alert');
                const doSave = () => {
                    const v = C.clean(inp.value, 30);
                    if (!v) { err.textContent = 'Type a name.'; inp.setAttribute('aria-invalid', 'true'); return; }
                    if (state.people.some(x => x.id !== p.id && x.name.toLowerCase() === v.toLowerCase())) { err.textContent = v + ' is already in the list.'; inp.setAttribute('aria-invalid', 'true'); return; }
                    const before = snap(), old = p.name; p.name = v; renaming = null; commit(before);
                    say($('people-msg'), old === v ? 'Name kept.' : 'Renamed ' + old + ' to ' + v + '.', old !== v);
                };
                inp.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') { renaming = null; render(); } });
                const rb = el('div', 'row-btns');
                rb.append(btn('primary small', 'Save name', doSave), btn('secondary small', 'Cancel', () => { renaming = null; render(); }));
                panel.append(lab, inp, err, rb); card.appendChild(panel);
                setTimeout(() => inp.focus(), 0);
            } else {
                const row = el('div', 'p-btns');
                row.append(
                    btn('secondary small', 'Rename', () => { clearMsgs(); renaming = p.id; render(); }),
                    btn('secondary small', p.out ? 'Moved back in' : 'Moved out', () => toggleOut(p)),
                    btn('secondary small del', 'Delete', () => delPerson(p)));
                row.lastChild.setAttribute('aria-label', 'Delete ' + p.name);
                row.firstChild.setAttribute('aria-label', 'Rename ' + p.name);
                card.appendChild(row);
            }
            box.appendChild(card);
        });
    }
    function toggleOut(p) {
        clearMsgs('people-msg');
        const before = snap(); p.out = !p.out;
        if (p.out && !editing) sel.delete(p.id); else if (!p.out && !editing) sel.add(p.id);
        commit(before);
        say($('people-msg'), p.out ? p.name + ' moved out. Past costs stay; they are left unticked on new ones.' + ((C.balances(state)[p.id] || 0) ? ' Their balance stays until it is paid.' : '') : p.name + ' is back in.', true);
    }
    function delPerson(p) {
        clearMsgs('people-msg');
        if (used(p.id)) {
            const n = state.items.filter(it => it.by === p.id || it.from === p.id || it.to === p.id || (it.parts && it.parts[p.id] != null)).length;
            say($('people-msg'), p.name + ' is in ' + C.plural(n, 'entry', 'entries') + ', so they cannot be deleted without changing everyone\'s balance. Tap "Moved out" instead, or delete those entries first.');
            return;
        }
        const before = snap();
        state.people = state.people.filter(x => x.id !== p.id); sel.delete(p.id); delete vals[p.id];
        commit(before);
        say($('people-msg'), 'Deleted ' + p.name + '.', true);
    }

    // ---------- the form ----------
    function resetSel() { sel = new Set(active().map(p => p.id)); vals = {}; }
    function fillSelects() {
        const opts = (s, keep, blank) => {
            const v = keep != null ? keep : s.value; s.textContent = '';
            if (blank) { const o = el('option', null, blank); o.value = ''; s.appendChild(o); }
            state.people.forEach(p => { const o = el('option', null, p.name + (p.out ? ' (moved out)' : '')); o.value = p.id; s.appendChild(o); });
            if ([...s.options].some(o => o.value === v)) s.value = v; else s.selectedIndex = 0;
        };
        opts($('by'), $('by').value || ui.by, 'Choose who paid');
        opts($('from'), null, 'Choose a person'); opts($('to'), null, 'Choose a person');
    }
    function renderSel() {
        const box = $('sel'); box.textContent = '';
        const sp = split();
        state.people.forEach(p => {
            const row = el('div', 'srow' + (sel.has(p.id) ? ' on' : '') + (p.out ? ' out' : ''));
            const lab = el('label', 'tick'), cb = el('input');
            cb.type = 'checkbox'; cb.checked = sel.has(p.id); cb.dataset.id = p.id;
            cb.addEventListener('change', () => { if (cb.checked) sel.add(p.id); else sel.delete(p.id); setErr(null, $('sel-err'), ''); renderSel(); updatePreview();
                const f = document.querySelector('#sel input[type=checkbox][data-id="' + p.id + '"]'); if (f) f.focus(); });
            lab.append(cb, el('span', null, p.name + (p.out ? ' (moved out)' : '')));
            row.appendChild(lab);
            if (sel.has(p.id) && sp !== 'equal') {
                const inp = el('input', 'val');
                inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off'; inp.maxLength = sp === 'exact' ? 24 : 7;
                inp.dataset.id = p.id;
                inp.value = vals[p.id] != null ? vals[p.id] : (sp === 'shares' ? '1' : '');
                if (vals[p.id] == null && sp === 'shares') vals[p.id] = '1';
                inp.placeholder = sp === 'shares' ? 'e.g. 1' : 'e.g. 500';
                inp.setAttribute('aria-label', (sp === 'shares' ? 'Shares for ' : 'Part for ') + p.name);
                inp.addEventListener('input', () => { vals[p.id] = inp.value; inp.setAttribute('aria-invalid', 'false'); setErr(null, $('sel-err'), ''); updateEach(); updatePreview(); });
                if (sp === 'exact' && ui.cur) { const wrap = el('div', 'val-wrap'); wrap.append(el('span', 'cur-mini', ui.cur), inp); row.appendChild(wrap); } else row.appendChild(inp);
            }
            const each = el('span', 'each'); each.dataset.id = p.id;
            row.appendChild(each);
            box.appendChild(row);
        });
        updateEach();
    }
    // the amount shown at the end of each ticked row
    function updateEach() {
        const sp = split(), amt = C.parseAmount($('amount').value), ids = state.people.map(p => p.id).filter(id => sel.has(id)), out = {};
        if (!amt.error && ids.length) {
            if (sp === 'exact') ids.forEach(id => { const a = C.parseAmount(vals[id], { zero: true }); if (!a.error && String(vals[id] || '').trim()) out[id] = a.cents; });
            else {
                const w = ids.map(id => { if (sp === 'equal') return 1; const s = C.parseShare(vals[id]); return s.error ? 0 : s.n; });
                if (w.every(x => x > 0)) C.allocate(amt.cents, w).forEach((c, i) => { out[ids[i]] = c; });
            }
        }
        document.querySelectorAll('#sel .each').forEach(e => { const id = e.dataset.id; e.textContent = !sel.has(id) ? 'pays nothing' : out[id] != null && sp !== 'exact' ? money(out[id]) : ''; });
        const left = $('exact-left');
        if (sp === 'exact' && !amt.error && ids.length) {
            const l = C.exactLeft($('amount').value, vals, ids);
            left.className = 'left' + (l === 0 ? ' ok' : ' bad');
            left.textContent = l == null ? '' : l === 0 ? 'The parts add up to ' + money(amt.cents) + '.' : l > 0 ? money(l) + ' left to give out.' : money(-l) + ' too much: the parts add up to more than ' + money(amt.cents) + '.';
        } else { left.textContent = ''; left.className = 'left'; }
    }
    function draft() {
        return { what: $('what').value, amount: $('amount').value, by: $('by').value, date: $('date').value, split: split(),
            sel: state.people.map(p => p.id).filter(id => sel.has(id)), vals, cur: ui.cur };
    }
    function updatePreview() {
        let pv = '';
        if (mode() === 'pay') {
            const a = C.parseAmount($('amount').value), f = $('from').value, t = $('to').value;
            if (!a.error && f && t && f !== t) pv = name(f) + ' pays back ' + money(a.cents) + ' to ' + name(t) + '. ' + name(f) + ' then owes ' + money(a.cents) + ' less.';
        } else {
            const d = draft(), r = C.makeExpense(state, Object.assign({}, d, { what: d.what || 'x', date: d.date || today }));
            if (r.item) {
                const sh = C.sharesOf(state, r.item), ids = Object.keys(sh), payer = name(r.item.by);
                if (ids.length === 1 && ids[0] === r.item.by) pv = 'Only ' + payer + ' shares this, so nobody owes anything for it.';
                else {
                    const others = ids.filter(id => id !== r.item.by);
                    pv = payer + ' paid ' + money(r.item.c) + '. ' + others.map(id => name(id) + ' owes ' + payer + ' ' + money(sh[id])).join(', ') + '.';
                    if (!ids.includes(r.item.by)) pv += ' ' + payer + ' pays nothing towards it.';
                }
            }
        }
        $('preview').textContent = pv;
    }
    function updateForm() {
        const m = mode(), enough = state.people.length >= 2;
        $('need-people').hidden = enough; $('add-body').hidden = !enough;
        $('exp-fields').hidden = $('exp-more').hidden = m !== 'exp';
        $('pay-fields').hidden = m !== 'pay';
        $('add-h').textContent = editing ? (m === 'pay' ? 'Edit money paid back' : 'Edit an expense') : 'Add an expense';
        $('save').textContent = editing ? 'Save changes' : m === 'pay' ? 'Add money paid back' : 'Add expense';
        $('cancel-edit').hidden = !editing;
        $('modes').hidden = !!editing;
        $('amount').placeholder = m === 'pay' ? 'e.g. 7200' : 'e.g. 8400';
        $('split-hint').textContent = SPLIT_HINT[split()];
        $('who-legend').textContent = split() === 'equal' ? 'Who shares it?' : split() === 'shares' ? 'Who shares it, and how many shares?' : 'Who shares it, and how much each?';
        $('sel-btns').hidden = state.people.length < 3;
        const chips = $('chips'); chips.textContent = '';
        const typed = $('what').value.trim().toLowerCase();
        C.CATS.forEach(c => {
            const b = btn('chip', c, () => { $('what').value = c; setErr($('what'), $('what-err'), ''); updateForm(); $('amount').focus(); });
            b.setAttribute('aria-pressed', String(c.toLowerCase() === typed)); b.tabIndex = -1; chips.appendChild(b);  // keyboard users type; the text box suggests the same words
        });
        $('date').max = '2999-12-31';
        renderSel(); updatePreview();
    }
    function stopEdit() {
        editing = null;
        $('what').value = ''; $('amount').value = ''; $('date').value = today;
        document.querySelector('input[name="split"][value="' + ui.split + '"]').checked = true;
        resetSel();
    }
    function startEdit(it) {
        clearMsgs(); clearErrs();
        editing = it.id;
        document.querySelector('input[name="mode"][value="' + it.k + '"]').checked = true;
        $('amount').value = (it.c / 100).toFixed(it.c % 100 ? 2 : 0); $('date').value = it.d;
        if (it.k === 'pay') { fillSelects(); $('from').value = it.from; $('to').value = it.to; }
        else {
            $('what').value = it.what; fillSelects(); $('by').value = it.by;
            document.querySelector('input[name="split"][value="' + it.split + '"]').checked = true;
            sel = new Set(Object.keys(it.parts)); vals = {};
            Object.keys(it.parts).forEach(id => { vals[id] = it.split === 'shares' ? String(it.parts[id] / 100) : it.split === 'exact' ? (it.parts[id] / 100).toFixed(it.parts[id] % 100 ? 2 : 0) : ''; });
        }
        render();
        $('add').scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => $('amount').focus({ preventScroll: true }), 300);
    }
    function saveEntry() {
        checkToday(); clearMsgs('add-msg'); clearErrs();
        const m = mode();
        let r;
        if (m === 'pay') r = C.makePayment(state, { from: $('from').value, to: $('to').value, amount: $('amount').value, date: $('date').value });
        else r = C.makeExpense(state, draft());
        if (r.error) {
            const map = { what: ['what', 'what-err'], amount: ['amount', 'amount-err'], by: ['by', 'by-err'], date: ['date', 'date-err'], from: ['from', 'from-err'], to: ['to', 'to-err'] };
            if (map[r.field]) { setErr($(map[r.field][0]), $(map[r.field][1]), r.error); $(map[r.field][0]).focus(); }
            else {
                setErr(null, $('sel-err'), r.error);
                const inp = r.who && document.querySelector('#sel input.val[data-id="' + r.who + '"]');
                if (inp) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); } else { const f = document.querySelector('#sel input'); if (f) f.focus(); }
            }
            return;
        }
        const before = snap(), item = r.item;
        if (editing) {
            const i = state.items.findIndex(x => x.id === editing);
            if (i < 0) { stopEdit(); render(); return; }
            item.id = editing; state.items[i] = item;
        } else { item.id = newId('e'); state.items.push(item); }
        const wasEdit = !!editing;
        if (item.k === 'exp') { ui.by = item.by; saveUi(); }
        month = item.d.slice(0, 7);
        stopEdit();
        document.querySelector('input[name="mode"][value="' + m + '"]').checked = true;
        if (m === 'pay') { $('from').value = ''; $('to').value = ''; }
        commit(before);
        say($('add-msg'), (wasEdit ? 'Saved: ' : 'Added: ') + C.itemTitle(state, item, ui.cur) + '.', true);
        if (!wasEdit) (m === 'pay' ? $('amount') : $('what')).focus();
    }

    // ---------- who owes whom ----------
    function renderOwe() {
        const has = state.people.length >= 2 && state.items.length > 0;
        $('owe-empty').hidden = has; $('owe-body').hidden = !has;
        if (!has) return;
        const bal = C.balances(state), tr = C.settle(state, bal);
        $('settled').hidden = tr.length > 0; $('tr-h').hidden = !tr.length; $('pay-all').hidden = tr.length < 2;
        const tl = $('tlist'); tl.textContent = '';
        tr.forEach(t => {
            const row = el('div', 'trow');
            const txt = el('p', 'tr-txt');
            txt.append(el('b', null, name(t.from)), ' pays ', el('b', null, name(t.to)), ' ', el('span', 'tr-amt', money(t.c)));
            const b = btn('primary small', 'Mark as paid', () => markPaid([t]));
            b.setAttribute('aria-label', 'Mark as paid: ' + name(t.from) + ' pays ' + name(t.to) + ' ' + money(t.c));
            row.append(txt, b); tl.appendChild(row);
        });
        const bl = $('blist'); bl.textContent = '';
        state.people.forEach(p => {
            const b = bal[p.id] || 0;
            if (p.out && !b) return;
            const row = el('div', 'brow ' + (b > 0 ? 'get' : b < 0 ? 'owes' : 'even'));
            row.append(el('span', 'b-name', p.name + (p.out ? ' (moved out)' : '')), el('span', 'b-val', b > 0 ? 'gets back ' + money(b) : b < 0 ? 'owes ' + money(-b) : 'settled up'));
            bl.appendChild(row);
        });
        $('share').hidden = typeof navigator.share !== 'function';
    }
    function markPaid(list) {
        checkToday(); clearMsgs('owe-msg');
        const before = snap();
        list.forEach(t => state.items.push({ id: newId('e'), k: 'pay', d: today, from: t.from, to: t.to, c: t.c }));
        month = today.slice(0, 7);
        commit(before);
        say($('owe-msg'), list.length === 1 ? 'Recorded: ' + name(list[0].from) + ' paid ' + name(list[0].to) + ' ' + money(list[0].c) + '.' : 'Recorded ' + list.length + ' payments. Everyone is settled up.', true);
    }

    // ---------- months ----------
    function renderList() {
        const sel = $('month'), ms = C.months(state), cur = today.slice(0, 7);
        if (!ms.includes(cur)) ms.unshift(cur);
        ms.sort().reverse();
        if (month && !ms.includes(month)) month = cur;
        sel.textContent = '';
        ms.forEach(m => { const o = el('option', null, m === cur ? 'This month (' + C.monthName(m) + ')' : C.monthName(m)); o.value = m; sel.appendChild(o); });
        const all = el('option', null, 'All months together'); all.value = ''; sel.appendChild(all);
        sel.value = month;
        const s = C.monthSummary(state, month);
        $('list-empty').hidden = s.items.length > 0; $('list-body').hidden = !s.items.length;
        if (!s.items.length) return;
        $('t-total-l').textContent = month ? 'Spent together in ' + C.monthName(month).split(' ')[0] : 'Spent together, all months';
        $('t-total').textContent = money(s.total);
        $('t-count').textContent = C.plural(s.count, 'expense', 'expenses') + (s.payments ? ', ' + C.plural(s.payments, 'payment back', 'payments back') : '');
        const top = s.byWhat[0];
        $('t-top').textContent = top ? money(top.c) : '–'; $('t-top-sub').textContent = top ? top.what : 'No costs, only payments back';
        const cats = $('cats'); cats.textContent = '';
        s.byWhat.forEach(w => { const li = el('li'); li.append(el('span', null, w.what), el('b', null, money(w.c))); cats.appendChild(li); });
        if (!s.byWhat.length) cats.appendChild(el('li', 'none', 'No shared costs this month.'));
        const pm = $('pm'); pm.textContent = '';
        state.people.forEach(p => {
            const x = s.people[p.id];
            if (!x.paid && !x.share) return;
            const row = el('div', 'pmrow');
            row.append(el('span', 'pm-name', p.name), el('span', 'pm-val', 'share ' + money(x.share) + ' · paid ' + money(x.paid)));
            pm.appendChild(row);
        });
        if (!pm.children.length) pm.appendChild(el('p', 'hint first', 'No shared costs this month.'));
        const items = $('items'); items.textContent = '';
        s.items.forEach(it => {
            const box = el('div', 'item ' + (it.k === 'pay' ? 'pay' : 'exp') + (editing === it.id ? ' editing' : ''));
            const top = el('div', 'i-top');
            top.append(el('p', 'i-what', it.k === 'pay' ? 'Money paid back' : it.what), el('p', 'i-amt', money(it.c)));
            box.appendChild(top);
            box.appendChild(el('p', 'i-sub', it.k === 'pay' ? name(it.from) + ' paid ' + name(it.to) + ' · ' + C.niceDate(it.d) : 'Paid by ' + name(it.by) + ' · ' + C.niceDate(it.d)));
            if (it.k === 'exp') box.appendChild(el('p', 'i-sub', C.splitWords(state, it, ui.cur)));
            const bs = el('div', 'i-btns');
            const eb = btn('secondary small', 'Edit', () => startEdit(it)), db = btn('secondary small del', 'Delete', () => delItem(it));
            const label = it.k === 'pay' ? 'money paid back on ' + C.niceDate(it.d) : it.what + ' on ' + C.niceDate(it.d);
            eb.setAttribute('aria-label', 'Edit ' + label); db.setAttribute('aria-label', 'Delete ' + label);
            bs.append(eb, db); box.appendChild(bs);
            items.appendChild(box);
        });
    }
    function delItem(it) {
        clearMsgs('list-msg');
        const before = snap();
        state.items = state.items.filter(x => x.id !== it.id);
        if (editing === it.id) stopEdit();
        commit(before);
        say($('list-msg'), 'Deleted: ' + C.itemTitle(state, it, ui.cur) + '.', true);
    }

    // ---------- share and backup ----------
    async function copyText(text, box) {
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px'; document.body.appendChild(t); t.select();
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        }
        say(box, ok ? 'Copied. Paste it into the house chat, a note or an email.' : 'Could not copy here. Try "Email summary" instead.');
    }
    const summary = () => C.summaryText(state, month, ui.cur, today);
    function download(fname, text) {
        const blob = new Blob([text], { type: 'application/json' }), a = el('a');
        a.href = URL.createObjectURL(blob); a.download = fname; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    function render() {
        checkToday();
        $('store-warn').hidden = storageOK;
        fillSelects();
        renderPeople(); updateForm(); renderOwe(); renderList();
        $('cur-tag').hidden = !ui.cur; $('cur-tag').textContent = ui.cur;
        $('cur').value = ui.cur;
        const dl = $('what-list'); dl.textContent = '';
        const seen = new Set();
        C.CATS.concat(state.items.filter(it => it.k === 'exp').map(it => it.what)).forEach(w => { const k = w.toLowerCase(); if (seen.has(k)) return; seen.add(k); const o = el('option'); o.value = w; dl.appendChild(o); });
    }

    function init() {
        load();
        C.SYMBOLS.forEach(s => { const o = el('option', null, CUR_NAMES[s] || s); o.value = s; $('cur').appendChild(o); });
        $('date').value = today;
        document.querySelector('input[name="split"][value="' + ui.split + '"]').checked = true;
        resetSel();
        render();

        $('add-person').addEventListener('click', addPerson);
        $('new-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } });
        $('new-name').addEventListener('input', () => setErr($('new-name'), $('name-err'), ''));
        document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', () => { clearErrs(); clearMsgs(); updateForm(); }));
        document.querySelectorAll('input[name="split"]').forEach(r => r.addEventListener('change', () => { clearErrs(); vals = {}; updateForm(); }));
        ['what', 'amount', 'by', 'date', 'from', 'to'].forEach(id => {
            const ev = $(id).tagName === 'SELECT' || id === 'date' ? 'change' : 'input';
            $(id).addEventListener(ev, () => { setErr($(id), $(id + '-err'), ''); if (id === 'what') updateForm(); else { updateEach(); updatePreview(); } });
        });
        ['what', 'amount', 'date'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveEntry(); } }));
        $('sel').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('val')) { e.preventDefault(); saveEntry(); } });
        $('save').addEventListener('click', saveEntry);
        $('cancel-edit').addEventListener('click', () => { stopEdit(); clearErrs(); render(); say($('add-msg'), 'Editing cancelled. Nothing was changed.'); });
        $('sel-all').addEventListener('click', () => { state.people.forEach(p => sel.add(p.id)); setErr(null, $('sel-err'), ''); renderSel(); updatePreview(); });
        $('sel-none').addEventListener('click', () => { sel.clear(); renderSel(); updatePreview(); });

        $('pay-all').addEventListener('click', () => markPaid(C.settle(state)));
        $('copy').addEventListener('click', () => { clearMsgs('owe-msg'); copyText(summary(), $('owe-msg')); });
        $('email').addEventListener('click', () => { clearMsgs(); location.href = 'mailto:?subject=' + encodeURIComponent('Shared house expenses: who owes whom') + '&body=' + encodeURIComponent(summary()); });
        $('share').addEventListener('click', () => { clearMsgs(); navigator.share({ title: 'Shared house expenses', text: summary() }).catch(() => { /* closed */ }); });
        $('month').addEventListener('change', () => { month = $('month').value; clearMsgs(); renderList(); });

        $('cur').addEventListener('change', () => { ui.cur = C.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; saveUi(); render(); });
        $('backup').addEventListener('click', () => {
            clearMsgs('tools-msg');
            download('shared-house-expenses-' + today + '.json', JSON.stringify({ app: SLUG, saved: today, cur: ui.cur, data: state }, null, 1));
            say($('tools-msg'), 'Backup file saved to your downloads. Keep it somewhere safe.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', async () => {
            clearMsgs('tools-msg');
            const file = $('restore-file').files[0]; $('restore-file').value = '';
            if (!file) return;
            try {
                if (file.size > 5000000) throw new Error('too big');
                const raw = JSON.parse(await file.text()), data = C.normalize(raw && raw.data ? raw.data : raw);
                const before = snap();
                state = data; stopEdit(); renaming = null;
                if (raw && typeof raw.cur === 'string' && C.SYMBOLS.includes(raw.cur)) { ui.cur = raw.cur; saveUi(); }
                commit(before);
                say($('tools-msg'), 'Backup restored: ' + C.plural(state.people.length, 'person', 'people') + ', ' + C.plural(state.items.length, 'entry', 'entries') + '.', true);
            } catch (e) { say($('tools-msg'), 'That file is not a Shared House Expenses backup. Nothing was changed.'); }
        });
        $('wipe').addEventListener('click', () => {
            clearMsgs('tools-msg');
            if (!state.people.length && !state.items.length) { say($('tools-msg'), 'There is nothing to delete.'); return; }
            const before = snap();
            state = C.emptyState(); stopEdit(); renaming = null; month = today.slice(0, 7);
            commit(before);
            say($('tools-msg'), 'Everything was deleted. Tap Undo to bring it back.', true);
        });

        if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { /* offline copy not available */ });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) { const t = today; checkToday(); if (t !== today) { if (!editing) $('date').value = today; render(); } } });
    }
    init();
})();
