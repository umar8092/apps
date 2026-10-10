// Page code for Grocery List with Running Total. The maths lives in core.js (GroceryCore).
(function () {
    const C = window.GroceryCore, KEY = 'grocery-list-with-running-total.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    let state = load(), editing = null, gone = null, canSave = true;

    function load() {
        try { const raw = localStorage.getItem(KEY); return C.clean(raw ? JSON.parse(raw) : null); } catch (e) { return C.clean(null); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { if (canSave) { canSave = false; say($('tools-msg'), 'This browser is not saving your list (private mode or storage blocked). It works until you close the page.'); } }
    }
    const snapshot = () => JSON.parse(JSON.stringify(state));
    const money = c => C.fmt(c, state.cur);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    // a short message with an optional Undo button
    function say(box, text, undo) {
        box.textContent = text;
        if (undo) {
            const b = el('button', null, 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { undo(); box.textContent = ''; });
            box.appendChild(b);
        }
    }
    const clearMsgs = () => ['add-msg', 'list-msg'].forEach(id => { $(id).textContent = ''; });

    function priceError(r) {
        return r.err === 'negative' ? 'The price cannot be below 0.' : r.err === 'big' ? 'That price is too big (up to 100,000).' : 'Type the price as a number, for example 1.29.';
    }
    function qtyError(r) {
        return r.err === 'zero' || r.err === 'negative' ? 'How many must be more than 0.' : r.err === 'big' ? 'How many can be up to 999.' : 'Type how many as a number, for example 2 or 1.5.';
    }
    // Reads name, quantity and price fields. Returns { item } or { err, field }.
    function readItem(nameIn, qtyIn, priceIn) {
        const name = nameIn.value.replace(/\s+/g, ' ').trim();
        if (!name) return { err: 'Type the item you need, for example Milk.', field: nameIn };
        const q = C.parseQty(qtyIn.value); if (q.err) return { err: qtyError(q), field: qtyIn };
        const p = C.parsePrice(priceIn.value); if (p.err) return { err: priceError(p), field: priceIn };
        return { item: { name: name.slice(0, C.MAX_NAME), qty: q.n, price: p.blank ? null : p.cents } };
    }

    // Adds one item, or adds to the quantity of the same item. Returns a message.
    function addItem(it) {
        const m = C.findMerge(state.items, it);
        if (m) {
            m.qty = Math.min(C.MAX_QTY, m.qty + it.qty);
            if (m.price == null && it.price != null) m.price = it.price;
            return { merged: m };
        }
        if (state.items.length >= C.MAX_ITEMS) return { full: true };
        state.items.push({ id: newId(), name: it.name, qty: it.qty, price: it.price, got: false });
        return { added: true };
    }

    // ---- render
    function render() {
        const s = C.summary(state), has = state.items.length > 0;
        document.querySelectorAll('.sym').forEach(e => { e.textContent = state.cur; });
        $('intro').hidden = has;
        $('list-card').hidden = !has;

        // totals card
        $('r-trolley').textContent = money(s.trolley);
        const taxNote = state.tax ? ' Includes ' + C.qtyText(state.tax) + '% tax.' : '';
        $('r-count').textContent = (!has ? 'Your list is empty.' : s.got === 0 ? 'Nothing ticked yet.' : s.got === s.count ? 'All ' + s.count + ' items ticked.' : s.got + ' of ' + plural(s.count, 'item', 'items') + ' ticked.') + taxNote;
        $('r-left').textContent = money(s.left); $('r-left-n').textContent = plural(s.toGet, 'item', 'items');
        $('r-whole').textContent = money(s.whole); $('r-whole-n').textContent = plural(s.count, 'item', 'items');
        const bv = $('budget-view');
        bv.hidden = s.budget == null;
        if (s.budget != null) {
            const over = s.budgetLeft < 0;
            $('r-bar').style.width = Math.min(100, s.budget ? (s.trolley / s.budget) * 100 : 100).toFixed(1) + '%';
            bv.classList.toggle('over', over);
            $('r-budget-left').textContent = over ? money(-s.budgetLeft) + ' over your ' + money(s.budget) + ' budget' : money(s.budgetLeft) + ' left to spend of your ' + money(s.budget) + ' budget';
        }
        const alerts = $('alerts'); alerts.textContent = '';
        const alert = (text, cls) => alerts.appendChild(el('li', cls, text));
        if (!has) alert('Add items to see your totals.', 'info');
        else {
            if (s.budget != null && s.toGet > 0) {
                if (s.spare >= 0) alert('The whole list fits your budget, with ' + money(s.spare) + ' to spare.', 'good');
                else alert('The whole list is ' + money(-s.spare) + ' over your budget. Leave out items worth ' + money(-s.spare) + ' or more.', 'bad');
            }
            if (s.noPrice) alert(plural(s.noPrice, 'item has', 'items have') + ' no price yet, so the real total will be higher. Tap Edit to add a price.', 'warn');
        }
        $('add-budget').hidden = !$('budget-box').hidden;
        $('add-tax').hidden = !$('tax-box').hidden;

        // the list
        const todo = $('todo'), got = $('got');
        todo.textContent = ''; got.textContent = '';
        state.items.forEach((it, i) => {
            if (gone && gone.index === i) (gone.item.got ? got : todo).appendChild(goneRow());
            (it.got ? got : todo).appendChild(itemRow(it));
        });
        if (gone && gone.index >= state.items.length) (gone.item.got ? got : todo).appendChild(goneRow());
        $('todo-n').textContent = '(' + s.toGet + ')';
        $('got-n').textContent = '(' + s.got + ')';
        $('todo-sum').textContent = money(s.left);
        $('got-sum').textContent = money(s.trolley);
        $('todo-empty').hidden = s.toGet > 0 || !has;
        $('got-empty').hidden = s.got > 0;
        $('restart').disabled = s.got === 0;

        // share
        $('mail').href = mailHref();
        save();
    }

    function goneRow() {
        const li = el('li', 'item gone');
        li.appendChild(el('span', null, gone.item.name + ' deleted.'));
        const b = el('button', null, 'Undo'); b.type = 'button';
        b.addEventListener('click', () => { state.items.splice(Math.min(gone.index, state.items.length), 0, gone.item); gone = null; render(); });
        li.appendChild(b);
        return li;
    }

    function itemRow(it) {
        const li = el('li', 'item' + (it.got ? ' got' : '')); li.dataset.id = it.id;
        if (editing === it.id) return editRow(li, it);
        const c = C.lineCents(it);
        const top = el('div', 'i-top');
        const lab = el('label', 'tick');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = it.got;
        cb.setAttribute('aria-label', (it.got ? 'In the trolley: ' : 'Tick when in the trolley: ') + it.name);
        cb.addEventListener('change', () => { it.got = cb.checked; gone = null; clearMsgs(); render(); const f = document.querySelector('.item[data-id="' + it.id + '"] input[type=checkbox]'); if (f) f.focus(); });
        lab.appendChild(cb);
        lab.appendChild(el('span', 'i-name', it.name));
        top.appendChild(lab);
        top.appendChild(el('span', 'i-total' + (c == null ? ' none' : ''), c == null ? 'no price' : money(c)));
        li.appendChild(top);
        const detail = c == null ? (it.qty !== 1000 ? 'How many: ' + C.qtyText(it.qty) : '') : (it.qty !== 1000 ? C.qtyText(it.qty) + ' × ' + money(it.price) : '');
        const row = el('div', 'i-row');
        row.appendChild(el('span', 'i-line', detail));
        const btns = el('div', 'i-btns');
        const eb = el('button', null, 'Edit'); eb.type = 'button'; eb.setAttribute('aria-label', 'Edit ' + it.name);
        eb.addEventListener('click', () => { editing = it.id; gone = null; clearMsgs(); render(); const f = document.querySelector('.item.editing input[data-f=price]'); if (f) f.focus(); });
        const db = el('button', null, 'Delete'); db.type = 'button'; db.setAttribute('aria-label', 'Delete ' + it.name);
        db.addEventListener('click', () => { const i = state.items.indexOf(it); state.items.splice(i, 1); gone = { item: it, index: i }; clearMsgs(); render(); });
        btns.appendChild(eb); btns.appendChild(db);
        row.appendChild(btns);
        li.appendChild(row);
        return li;
    }

    function editRow(li, it) {
        li.classList.add('editing');
        const f = el('div', 'edit');
        const field = (label, key, value, mode, cls) => {
            const w = el('div', cls); const id = 'e-' + key;
            const l = el('label', null, label); l.htmlFor = id; w.appendChild(l);
            const inp = el('input'); inp.type = 'text'; inp.id = id; inp.value = value; inp.dataset.f = key; inp.autocomplete = 'off';
            if (mode) inp.inputMode = mode;
            inp.maxLength = key === 'name' ? C.MAX_NAME : 14;
            if (key === 'price') { const m = el('div', 'money'); m.appendChild(el('span', 'sym', state.cur)); m.lastChild.setAttribute('aria-hidden', 'true'); m.appendChild(inp); w.appendChild(m); inp.placeholder = 'no price'; }
            else w.appendChild(inp);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); } });
            return w;
        };
        f.appendChild(field('Item', 'name', it.name, null, 'e-name'));
        const two = el('div', 'two');
        two.appendChild(field('How many', 'qty', C.qtyText(it.qty), 'decimal'));
        two.appendChild(field('Price each', 'price', it.price == null ? '' : (it.price / 100).toFixed(2), 'decimal'));
        f.appendChild(two);
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); f.appendChild(err);
        const btns = el('div', 'two-btn');
        const sb = el('button', 'primary', 'Save'); sb.type = 'button';
        const cbn = el('button', 'secondary', 'Cancel'); cbn.type = 'button';
        btns.appendChild(sb); btns.appendChild(cbn); f.appendChild(btns);
        li.appendChild(f);
        const q = k => f.querySelector('input[data-f=' + k + ']');
        function done() {
            const r = readItem(q('name'), q('qty'), q('price'));
            if (r.err) { err.textContent = r.err; r.field.focus(); return; }
            Object.assign(it, r.item); editing = null; render(); focusRow(it.id);
        }
        function cancel() { editing = null; render(); focusRow(it.id); }
        sb.addEventListener('click', done); cbn.addEventListener('click', cancel);
        return li;
    }
    function focusRow(id) { const b = document.querySelector('.item[data-id="' + id + '"] .i-btns button'); if (b) b.focus(); }

    // ---- add form
    $('form').addEventListener('submit', e => {
        e.preventDefault();
        const r = readItem($('f-name'), $('f-qty'), $('f-price'));
        $('form-err').textContent = r.err || '';
        if (r.err) { r.field.focus(); return; }
        const before = snapshot(), res = addItem(r.item);
        gone = null; clearMsgs();
        if (res.full) { $('form-err').textContent = 'The list is full (' + C.MAX_ITEMS + ' items). Delete some items first.'; return; }
        render();
        if (res.merged) say($('add-msg'), res.merged.name + ' was already on the list, so it is now ' + C.qtyText(res.merged.qty) + '.', () => { state = before; render(); });
        else say($('add-msg'), 'Added ' + r.item.name + '.');
        ['f-name', 'f-qty', 'f-price'].forEach(id => { $(id).value = ''; });
        $('f-name').focus();
    });
    // pasting several lines into the Item box opens the paste box with them
    $('f-name').addEventListener('paste', e => {
        const t = (e.clipboardData || window.clipboardData).getData('text');
        if (/\n/.test(t.trim())) { e.preventDefault(); openPaste(t); }
    });

    function openPaste(text) {
        $('paste-box').hidden = false; $('open-paste').hidden = true;
        if (text != null) $('paste').value = text;
        $('paste').focus();
    }
    function closePaste() { $('paste-box').hidden = true; $('open-paste').hidden = false; $('paste').value = ''; }
    $('open-paste').addEventListener('click', () => openPaste());
    $('paste-cancel').addEventListener('click', () => { closePaste(); $('open-paste').focus(); });
    $('paste-add').addEventListener('click', () => {
        const list = C.parseList($('paste').value);
        if (!list.length) { say($('add-msg'), 'Nothing to add. Type or paste one item per line.'); $('paste').focus(); return; }
        const before = snapshot(); let added = 0, merged = 0, full = 0;
        list.forEach(it => { const r = addItem(it); if (r.added) added++; else if (r.merged) merged++; else full++; });
        gone = null; clearMsgs(); closePaste(); render();
        say($('add-msg'), 'Added ' + plural(added, 'item', 'items') + (merged ? ', ' + merged + ' already on the list (quantity added)' : '') + (full ? '. ' + full + ' left out: the list is full' : '') + '.', () => { state = before; render(); });
        $('open-paste').focus();
    });

    $('demo').addEventListener('click', () => {
        const ex = [['Milk', 2000, 129], ['Bread', 1000, 145], ['Eggs (12)', 1000, 320], ['Chicken breast', 1000, 650], ['Bananas', 1200, 110], ['Rice 5 kg', 1000, 899],
            ['Tomatoes', 500, 280], ['Cheddar', 1000, 375], ['Washing-up liquid', 1000, 199], ['Coffee', 1000, 549], ['Apples', 6000, 35], ['Pasta', 3000, 89]];
        state.items = ex.map(([name, qty, price]) => ({ id: newId(), name, qty, price, got: false }));
        if (state.budget == null) { state.budget = 5000; $('budget').value = '50'; }
        showBudget();
        render();
        say($('add-msg'), 'Example list added with a 50.00 budget. Tick items to see the totals change.');
    });

    // ---- budget and tax
    function showBudget() { $('budget-box').hidden = false; $('add-budget').hidden = true; }
    $('add-budget').addEventListener('click', () => { showBudget(); $('budget').focus(); });
    $('budget').addEventListener('input', () => {
        const r = C.parsePrice($('budget').value);
        $('budget-err').textContent = r.err === 'negative' ? 'The budget cannot be below 0.' : r.err === 'big' ? 'That budget is too big.' : r.err ? 'Type the budget as a number, for example 60.' : r.cents === 0 ? 'The budget must be more than 0.' : '';
        state.budget = r.blank || r.err || r.cents === 0 ? null : r.cents;
        render();
    });
    $('remove-budget').addEventListener('click', () => { state.budget = null; $('budget').value = ''; $('budget-err').textContent = ''; $('budget-box').hidden = true; render(); $('add-budget').focus(); });
    $('add-tax').addEventListener('click', () => { $('tax-box').hidden = false; render(); $('tax').focus(); });
    $('tax').addEventListener('input', () => {
        const r = C.parseTax($('tax').value);
        $('tax-err').textContent = r.err === 'big' ? 'Sales tax can be up to 30%.' : r.err ? 'Type the tax as a number, for example 8.25.' : '';
        state.tax = r.blank || r.err || !r.n ? null : r.n;
        render();
    });
    $('remove-tax').addEventListener('click', () => { state.tax = null; $('tax').value = ''; $('tax-err').textContent = ''; $('tax-box').hidden = true; render(); $('add-tax').focus(); });

    // ---- after the shop
    $('restart').addEventListener('click', () => {
        const before = snapshot();
        state.items.forEach(it => { it.got = false; }); gone = null; editing = null;
        render();
        say($('list-msg'), 'All ticks cleared. Your items and prices are kept for the next shop.', () => { state = before; render(); });
    });
    $('clear').addEventListener('click', () => {
        const before = snapshot();
        state.items = []; gone = null; editing = null;
        render();
        say($('add-msg'), 'All items deleted.', () => { state = before; render(); });
        $('f-name').focus();
    });

    // ---- share
    $('cur').addEventListener('change', () => { state.cur = C.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; render(); });
    function mailHref() {
        let body = C.listText(state, state.cur);
        if (body.length > 1800) body = body.slice(0, 1800).replace(/\n[^\n]*$/, '') + '\n(list shortened: use Copy list for all of it)';
        return 'mailto:?subject=' + encodeURIComponent('Grocery list') + '&body=' + encodeURIComponent(body);
    }
    $('copy').addEventListener('click', async () => {
        const text = C.listText(state, state.cur);
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        }
        say($('tools-msg'), ok ? 'List copied. Paste it into a message or note.' : 'Could not copy here. Use Email list instead.');
    });
    $('print').addEventListener('click', () => window.print());

    // ---- start
    $('cur').value = state.cur;
    if (state.budget != null) { $('budget').value = (state.budget / 100).toFixed(2).replace(/\.00$/, ''); showBudget(); }
    if (state.tax) { $('tax').value = C.qtyText(state.tax); $('tax-box').hidden = false; }
    render();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
