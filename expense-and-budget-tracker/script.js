// Page code for Expense and Budget Tracker. The maths lives in core.js (ExpenseCore).
(function () {
    const C = window.ExpenseCore, KEY = 'expense-and-budget-tracker.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (text, cls) => { const b = el('button', cls, text); b.type = 'button'; return b; };

    let state = load(), canSave = true;
    let todayStr = C.today();
    let view = C.periodOf(todayStr, state.startDay).start;     // start date of the budget month on screen
    let editingId = null, gone = null, goneCat = null, splitting = false, parts = [], dateTouched = false;

    function load() {
        try { const raw = localStorage.getItem(KEY); return C.clean(raw ? JSON.parse(raw) : null); } catch (e) { return C.clean(null); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { if (canSave) { canSave = false; $('save-warn').hidden = false; } }
    }
    const snapshot = () => JSON.parse(JSON.stringify(state));
    // puts back a snapshot (Undo). The category editor is redrawn so it edits the restored categories.
    function restore(before, settings) {
        state = before; gone = null; goneCat = null;
        if (settings) { $('cur').value = state.cur; $('start-day').value = String(state.startDay); view = C.periodOf(todayStr, state.startDay).start; }
        refreshSelects(); renderCatEditor(); render();
    }
    const money = c => C.fmt(c, state.cur);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const period = () => C.periodOf(view, state.startDay);
    const catById = id => state.cats.find(c => c.id === id) || state.cats.find(c => c.id === 'other');

    // a short message with an optional Undo button
    function say(box, text, undo, cls) {
        box.textContent = text; box.className = 'msg' + (cls ? ' ' + cls : '');
        if (undo) {
            const b = btn('Undo');
            b.addEventListener('click', () => { undo(); box.textContent = ''; box.className = 'msg'; });
            box.appendChild(b);
        }
    }
    const clearMsgs = () => ['add-msg', 'list-msg', 'cat-msg', 'tools-msg'].forEach(id => { $(id).textContent = ''; $(id).className = 'msg'; });
    function amountError(r, what) {
        return r.err === 'negative' ? what + ' cannot be below 0. For money back, choose Money back (refund).' : r.err === 'big' ? what + ' is too big (up to 10,000,000).' : 'Type ' + what.toLowerCase() + ' as a number, for example 12.50.';
    }

    // ---- selects that list the categories
    function fillCatSelect(sel, value, withAll) {
        sel.textContent = '';
        if (withAll) sel.appendChild(new Option('All categories', ''));
        state.cats.forEach(c => sel.appendChild(new Option(c.name, c.id)));
        sel.value = state.cats.some(c => c.id === value) || (withAll && value === '') ? value : (withAll ? '' : state.cats[0].id);
    }
    function refreshSelects() {
        fillCatSelect($('f-cat'), $('f-cat').value, false);
        fillCatSelect($('filter'), $('filter').value, true);
        document.querySelectorAll('.part select').forEach((s, i) => { fillCatSelect(s, parts[i] ? parts[i].cat : s.value, false); if (parts[i]) parts[i].cat = s.value; });
    }

    // ---- render everything except the category editor (which is redrawn only when categories are added or removed)
    function render() {
        const p = period(), s = C.summary(state, p, todayStr);
        document.querySelectorAll('.sym').forEach(e => { e.textContent = state.cur; });
        $('m-label').textContent = C.periodLabel(p, state.startDay);
        $('to-now').hidden = s.isCurrent;
        $('intro').hidden = state.entries.length > 0;

        // the big number
        const big = $('big'), bw = $('bar-wrap');
        big.classList.remove('over'); bw.className = 'bar';
        if (s.budget == null) {
            $('big-label').textContent = s.isCurrent ? 'Spent this month' : 'Spent';
            big.textContent = money(s.spent);
            $('meta').textContent = s.count ? plural(s.count, 'expense', 'expenses') + '. Set budgets to see what is left.' : 'No expenses yet.';
            bw.hidden = true;
        } else {
            const over = s.left < 0;
            $('big-label').textContent = over ? 'Over budget by' : 'Left to spend';
            big.textContent = money(Math.abs(s.left)); big.classList.toggle('over', over);
            $('meta').textContent = 'Spent ' + money(s.spent) + ' of your ' + money(s.budget) + ' budget.' + (s.unbudgeted ? ' Includes ' + money(s.unbudgeted) + ' in categories with no budget.' : '');
            bw.hidden = false;
            const pct = s.budget === 0 ? (s.spent > 0 ? 100 : 0) : Math.max(0, Math.min(100, s.spent * 100 / s.budget));
            $('bar').style.width = pct.toFixed(1) + '%';
            bw.classList.add(over ? 'over' : pct >= 80 ? 'near' : 'ok');
        }
        let pd = '';
        if (s.isCurrent && s.perDay != null) pd = 'That is ' + money(s.perDay) + ' a day for the ' + plural(s.daysLeft, 'day', 'days') + ' left, today included.';
        else if (s.isCurrent && s.left != null && s.left === 0) pd = 'Your whole budget is used, with ' + plural(s.daysLeft, 'day', 'days') + ' to go.';
        else if (s.isPast && s.left != null) pd = s.left >= 0 ? 'This month is over. You finished ' + money(s.left) + ' under budget.' : 'This month is over. You finished ' + money(-s.left) + ' over budget.';
        else if (!s.isCurrent && !s.isPast) pd = 'This month has not started yet.';
        $('per-day').textContent = pd;

        const alerts = $('alerts'); alerts.textContent = '';
        const alert = (text, cls) => alerts.appendChild(el('li', cls, text));
        if (s.left != null && s.left < 0 && s.isCurrent) alert('You have spent ' + money(-s.left) + ' more than your whole budget for this month.', 'bad');
        s.cats.forEach(c => {
            if (c.status === 'over') alert(c.name + ' is ' + money(-c.left) + ' over its ' + money(c.budget) + ' budget.', 'bad');
        });
        s.cats.forEach(c => {
            if (c.status === 'near') alert(c.name + ': ' + Math.floor(c.pct) + '% of its budget used, ' + money(c.left) + ' left.', 'warn');
        });
        if (!state.entries.length) alert('Add your first expense to see where your money goes.', 'info');
        $('go-budgets').hidden = s.budget != null;

        // by category
        const cl = $('cat-list'); cl.textContent = '';
        const shown = s.cats.filter(c => c.count || c.budget != null);
        shown.forEach(c => {
            const li = el('li', 'cat-row ' + c.status); li.style.setProperty('--c', c.color);
            const top = el('div', 'top');
            top.appendChild(el('span', 'name', c.name));
            top.appendChild(el('span', 'amt', c.budget == null ? money(c.spent) : money(c.spent) + ' of ' + money(c.budget)));
            li.appendChild(top);
            if (c.budget != null) {
                const bar = el('div', 'bar ' + (c.status === 'over' ? 'over' : c.status === 'near' ? 'near' : ''));
                bar.setAttribute('aria-hidden', 'true');
                const i = el('i'); i.style.width = c.pct.toFixed(1) + '%'; bar.appendChild(i); li.appendChild(bar);
            }
            const st = el('p', 'status');
            st.appendChild(el('b', null, c.budget == null ? 'No budget' : c.left >= 0 ? money(c.left) + ' left' : money(-c.left) + ' over'));
            st.appendChild(el('span', null, c.budget == null ? plural(c.count, 'expense', 'expenses') : c.status === 'near' ? 'Nearly used, ' + Math.floor(c.pct) + '%' : c.status === 'over' ? 'Over budget' : Math.floor(c.pct) + '% used'));
            li.appendChild(st);
            cl.appendChild(li);
        });
        $('cat-empty').hidden = shown.length > 0;
        $('cat-empty').textContent = s.isCurrent ? 'Nothing spent yet this month.' : 'Nothing spent in this month.';

        renderList(p);
        // budget total line in the editor
        $('total-budget').textContent = s.budget == null ? '' : 'Total budget: ' + money(s.budget) + ' a month';
        $('mail').href = mailHref();
        save();
    }

    function renderList(p) {
        const filter = $('filter').value;
        const entries = state.entries.slice();
        if (gone) entries.splice(Math.min(gone.index, entries.length), 0, gone.entry);
        const list = C.entriesIn({ entries }, p, filter || null);
        const box = $('list'); box.textContent = '';
        let day = null, ul = null, n = 0;
        const groups = [];
        list.forEach(e => {
            if (e.date !== day) { day = e.date; ul = el('ul', 'entries'); groups.push({ day, ul, total: 0 }); }
            const g = groups[groups.length - 1];
            if (gone && e === gone.entry) { ul.appendChild(goneRow()); return; }
            n++;
            g.total += filter ? e.parts.filter(x => x.cat === filter).reduce((a, x) => a + x.cents, 0) * (e.refund ? -1 : 1) : C.signed(e);
            ul.appendChild(entryRow(e));
        });
        groups.forEach(g => {
            const h = el('h3', 'day-h');
            h.appendChild(el('span', null, C.dayLabel(g.day, g.day.slice(0, 4) !== todayStr.slice(0, 4)) + (g.day === todayStr ? ' (today)' : '')));
            h.appendChild(el('span', null, money(g.total)));
            box.appendChild(h); box.appendChild(g.ul);
        });
        $('list-n').textContent = '(' + n + ')';
        const empty = $('list-empty');
        empty.hidden = list.length > 0;
        empty.textContent = filter ? 'No ' + catById(filter).name + ' expenses in this month.' : C.summary(state, p, todayStr).isCurrent ? 'No expenses this month yet.' : 'No expenses in this month.';
    }

    function goneRow() {
        const li = el('li', 'entry gone');
        const e = gone.entry;
        li.appendChild(el('span', null, (e.note || catById(e.parts[0].cat).name) + ', ' + money(C.entryTotal(e)) + ', deleted.'));
        const b = btn('Undo');
        b.addEventListener('click', () => { state.entries.splice(Math.min(gone.index, state.entries.length), 0, gone.entry); const id = gone.entry.id; gone = null; render(); focusEntry(id); });
        li.appendChild(b);
        return li;
    }

    function partsText(e) {
        const ps = C.mergeParts(e.parts);
        return ps.map(p => catById(p.cat).name + (ps.length > 1 ? ' ' + money(p.cents) : '')).join(' + ');
    }
    function entryRow(e) {
        const li = el('li', 'entry' + (e.refund ? ' refund' : '') + (editingId === e.id ? ' editing' : '')); li.dataset.id = e.id;
        li.style.setProperty('--c', catById(e.parts[0].cat).color);
        const top = el('div', 'top');
        top.appendChild(el('span', 'what', e.note || partsText(e)));
        top.appendChild(el('span', 'amt', (e.refund ? '+' : '') + money(C.entryTotal(e))));
        li.appendChild(top);
        const row = el('div', 'row');
        row.appendChild(el('span', 'cats', (e.note ? partsText(e) : e.parts.length > 1 ? 'Split' : '') + (e.refund ? (e.note || e.parts.length > 1 ? ', ' : '') + 'money back' : '')));
        const btns = el('div', 'btns');
        const eb = btn('Edit'), db = btn('Delete');
        const name = (e.note || partsText(e)) + ' ' + money(C.entryTotal(e));
        eb.setAttribute('aria-label', 'Edit ' + name); db.setAttribute('aria-label', 'Delete ' + name);
        eb.addEventListener('click', () => startEdit(e));
        db.addEventListener('click', () => {
            const i = state.entries.indexOf(e); if (i < 0) return;
            if (editingId === e.id) stopEdit();
            state.entries.splice(i, 1); gone = { entry: e, index: i }; clearMsgs(); render();
            const u = document.querySelector('.entry.gone button'); if (u) u.focus();
        });
        btns.appendChild(eb); btns.appendChild(db); row.appendChild(btns);
        li.appendChild(row);
        return li;
    }
    function focusEntry(id) { const b = document.querySelector('.entry[data-id="' + id + '"] .btns button'); if (b) b.focus(); }

    // ---- the form
    function setKind(refund) { $(refund ? 'k-refund' : 'k-spent').checked = true; updateKind(); }
    function updateKind() {
        const refund = $('k-refund').checked;
        $('amount-label').textContent = refund ? 'Amount back' : 'Amount';
    }
    document.querySelectorAll('input[name=kind]').forEach(r => r.addEventListener('change', () => { updateKind(); updateSplitStatus(); }));

    function resetForm() {
        $('f-amount').value = ''; $('f-note').value = ''; $('form-err').textContent = '';
        if (!$('f-note').value) { $('note-box').hidden = true; $('open-note').hidden = false; }
        closeSplit();
        setKind(false);
    }

    function openSplit(initial) {
        splitting = true;
        $('split-box').hidden = false; $('open-split').hidden = true; $('one-cat').hidden = true;
        if (initial) parts = initial;
        else {
            const first = $('f-cat').value, second = (state.cats.find(c => c.id !== first) || state.cats[0]).id;
            parts = [{ cat: first, val: '' }, { cat: second, val: '' }];
        }
        renderParts();
    }
    function closeSplit() {
        if (splitting && parts[0]) $('f-cat').value = parts[0].cat;
        splitting = false; parts = [];
        $('split-box').hidden = true; $('open-split').hidden = false; $('one-cat').hidden = false;
        $('parts').textContent = '';
    }
    function renderParts() {
        const ul = $('parts'); ul.textContent = '';
        parts.forEach((pt, i) => {
            const li = el('li', 'part');
            const top = el('div', 'part-top');
            top.appendChild(el('b', null, 'Part ' + (i + 1)));
            if (parts.length > 2) {
                const rb = btn('Remove'); rb.setAttribute('aria-label', 'Remove part ' + (i + 1));
                rb.addEventListener('click', () => { parts.splice(i, 1); renderParts(); const f = document.querySelector('.part input'); if (f) f.focus(); });
                top.appendChild(rb);
            }
            li.appendChild(top);
            const grid = el('div', 'part-grid');
            const d1 = el('div'), d2 = el('div');
            const l1 = el('label', null, 'Category'); l1.htmlFor = 'p-cat-' + i;
            const sel = el('select'); sel.id = 'p-cat-' + i; fillCatSelect(sel, pt.cat, false);
            sel.addEventListener('change', () => { pt.cat = sel.value; });
            d1.appendChild(l1); d1.appendChild(sel);
            const l2 = el('label', null, 'Amount'); l2.htmlFor = 'p-amt-' + i;
            const m = el('div', 'money'); const sym = el('span', 'sym', state.cur); sym.setAttribute('aria-hidden', 'true'); m.appendChild(sym);
            const inp = el('input'); inp.type = 'text'; inp.id = 'p-amt-' + i; inp.inputMode = 'decimal'; inp.maxLength = 16; inp.placeholder = 'the rest'; inp.value = pt.val; inp.autocomplete = 'off';
            inp.addEventListener('input', () => { pt.val = inp.value; updateSplitStatus(); });
            m.appendChild(inp);
            d2.appendChild(l2); d2.appendChild(m);
            grid.appendChild(d1); grid.appendChild(d2);
            li.appendChild(grid);
            ul.appendChild(li);
        });
        $('add-part').hidden = parts.length >= C.MAX_PARTS;
        updateSplitStatus();
    }
    // Reads the split. Returns { parts } or { err, field }.
    function readSplit(total) {
        const ps = [];
        for (let i = 0; i < parts.length; i++) {
            const r = C.parseAmount(parts[i].val);
            if (r.err) return { err: 'Part ' + (i + 1) + ': ' + amountError(r, 'The amount'), field: $('p-amt-' + i) };
            ps.push({ cat: parts[i].cat, cents: r.blank ? null : r.cents });
        }
        return C.resolveSplit(total, ps);
    }
    function splitMessage(res, total) {
        if (res.err === 'blanks') return 'Leave only one part empty. That part gets the rest. Parts so far: ' + money(res.assigned) + ' of ' + money(total) + '.';
        if (res.err === 'over') return 'The parts add up to ' + money(res.assigned) + ', which is ' + money(-res.rest) + ' more than ' + money(total) + '.';
        if (res.err === 'nothing-left') return 'The other parts already add up to ' + money(total) + ', so nothing is left for the empty part. Remove it or change an amount.';
        if (res.err === 'short') return 'The parts add up to ' + money(res.assigned) + ' of ' + money(total) + '. ' + money(res.rest) + ' still to assign, or leave one part empty to give it the rest.';
        return res.err;
    }
    function updateSplitStatus() {
        if (!splitting) return;
        const st = $('split-status'), a = C.parseAmount($('f-amount').value);
        st.className = 'split-status';
        if (a.blank || a.err || !a.cents || parts.every(pt => !pt.val.trim())) { st.textContent = 'Type the whole amount above, then how much of it goes to each category. Leave one part empty to give it the rest.'; return; }
        const r = readSplit(a.cents);
        if (r.parts) {
            const blank = parts.findIndex(pt => !pt.val.trim());
            const rest = a.cents - parts.reduce((acc, x) => acc + (C.parseAmount(x.val).cents || 0), 0);
            st.textContent = blank >= 0 ? 'Part ' + (blank + 1) + ' gets the rest: ' + money(rest) + '.' : 'All ' + money(a.cents) + ' assigned.';
            st.classList.add('ok');
        } else { st.textContent = r.field ? r.err : splitMessage(r, a.cents); st.classList.add('bad'); }
    }
    $('open-split').addEventListener('click', () => { openSplit(); const f = $('p-amt-0'); if (f) f.focus(); });
    $('close-split').addEventListener('click', () => { closeSplit(); $('f-cat').focus(); });
    $('add-part').addEventListener('click', () => {
        if (parts.length >= C.MAX_PARTS) return;
        const used = parts.map(x => x.cat), next = (state.cats.find(c => !used.includes(c.id)) || state.cats[0]).id;
        parts.push({ cat: next, val: '' }); renderParts();
        $('p-amt-' + (parts.length - 1)).focus();
    });
    $('f-amount').addEventListener('input', updateSplitStatus);
    $('open-note').addEventListener('click', () => { $('note-box').hidden = false; $('open-note').hidden = true; $('f-note').focus(); });
    $('f-date').addEventListener('input', () => { dateTouched = true; });

    function readForm() {
        const a = C.parseAmount($('f-amount').value);
        if (a.blank) return { err: 'Type the amount, for example 12.50.', field: $('f-amount') };
        if (a.err) return { err: amountError(a, 'The amount'), field: $('f-amount') };
        if (a.cents === 0) return { err: 'The amount must be more than 0.', field: $('f-amount') };
        const date = $('f-date').value;
        if (!C.validDate(date)) return { err: 'Choose the date of the expense (between the years 2000 and 2100).', field: $('f-date') };
        let ps;
        if (splitting) {
            const r = readSplit(a.cents);
            if (!r.parts) return { err: r.field ? r.err : splitMessage(r, a.cents), field: r.field || $('p-amt-0') };
            ps = r.parts;
        } else ps = [{ cat: $('f-cat').value, cents: a.cents }];
        return { entry: { date, note: $('f-note').value.replace(/\s+/g, ' ').trim().slice(0, C.MAX_NOTE), refund: $('k-refund').checked, parts: ps } };
    }

    // after adding or changing an expense: say if a category it touched is now nearly used or over
    function budgetNote(entry) {
        const s = C.summary(state, C.periodOf(entry.date, state.startDay), todayStr);
        const notes = [];
        entry.parts.forEach(p => {
            const c = s.cats.find(x => x.id === p.cat);
            if (!c || entry.refund) return;
            if (c.status === 'over') notes.push({ t: c.name + ' is now ' + money(-c.left) + ' over its ' + money(c.budget) + ' budget.', cls: 'bad' });
            else if (c.status === 'near') notes.push({ t: c.name + ' has ' + money(c.left) + ' left of its ' + money(c.budget) + ' budget (' + Math.floor(c.pct) + '% used).', cls: 'warn' });
        });
        return notes;
    }

    $('form').addEventListener('submit', ev => {
        ev.preventDefault();
        const r = readForm();
        $('form-err').textContent = r.err || '';
        if (r.err) { r.field.focus(); return; }
        const before = snapshot(), e = r.entry;
        gone = null; goneCat = null; clearMsgs();
        let text;
        if (editingId) {
            const old = state.entries.find(x => x.id === editingId);
            if (old) Object.assign(old, e); else { e.id = C.newId('e'); state.entries.push(e); }
            e.id = old ? old.id : e.id;
            text = 'Changes saved.';
            stopEdit(true);
        } else {
            if (state.entries.length >= C.MAX_ENTRIES) { $('form-err').textContent = 'The app is full (' + C.MAX_ENTRIES + ' expenses). Save a backup and delete old months first.'; return; }
            e.id = C.newId('e');
            state.entries.push(e);
            const where = e.parts.length > 1 ? plural(e.parts.length, 'category', 'categories') : catById(e.parts[0].cat).name;
            text = (e.refund ? 'Added ' + money(C.entryTotal(e)) + ' back to ' : 'Added ' + money(C.entryTotal(e)) + ' to ') + where + (e.date !== todayStr ? ' on ' + C.dayLabel(e.date) : '') + '.';
            const p = C.periodOf(e.date, state.startDay);
            if (p.start !== view) text += ' It is in ' + C.periodLabel(p, state.startDay) + '.';
            resetForm();
        }
        const notes = budgetNote(e);
        if (notes.length) text += ' ' + notes.map(n => n.t).join(' ');
        render();
        say($('add-msg'), text, () => { stopEdit(true); restore(before); }, notes.some(n => n.cls === 'bad') ? 'bad' : notes.length ? 'warn' : '');
        $('f-amount').focus();
    });

    function startEdit(e) {
        editingId = e.id; gone = null; clearMsgs();
        $('form').classList.add('editing');
        $('form-h').textContent = 'Edit expense';
        $('save').textContent = 'Save changes';
        $('cancel-edit').hidden = false; $('cancel-edit').parentNode.classList.add('editing');
        setKind(e.refund);
        $('f-amount').value = C.plain(C.entryTotal(e));
        $('f-date').value = e.date;
        $('f-note').value = e.note;
        $('note-box').hidden = !e.note; $('open-note').hidden = !!e.note;
        closeSplit();
        if (e.parts.length > 1) openSplit(e.parts.map(p => ({ cat: p.cat, val: C.plain(p.cents) })));
        else $('f-cat').value = e.parts[0].cat;
        $('form-err').textContent = '';
        render();
        $('form').scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('f-amount').focus({ preventScroll: true });
    }
    function stopEdit(keepForm) {
        const id = editingId;
        editingId = null;
        $('form').classList.remove('editing');
        $('form-h').textContent = 'Add an expense';
        $('save').textContent = 'Add expense';
        $('cancel-edit').hidden = true; $('cancel-edit').parentNode.classList.remove('editing');
        resetForm();
        $('f-date').value = todayStr; dateTouched = false;
        return id;
    }
    $('cancel-edit').addEventListener('click', () => { const id = stopEdit(); render(); focusEntry(id); });
    $('form').addEventListener('keydown', e => { if (e.key === 'Escape' && editingId) { e.preventDefault(); const id = stopEdit(); render(); focusEntry(id); } });

    // ---- months
    $('prev').addEventListener('click', () => { view = C.shiftPeriod(view, -1, state.startDay).start; gone = null; render(); });
    $('next').addEventListener('click', () => { view = C.shiftPeriod(view, 1, state.startDay).start; gone = null; render(); });
    $('to-now').addEventListener('click', () => { view = C.periodOf(todayStr, state.startDay).start; gone = null; render(); $('prev').focus(); });
    $('filter').addEventListener('change', () => { gone = null; render(); });

    // ---- category editor
    function renderCatEditor() {
        const ul = $('cat-edit'); ul.textContent = '';
        state.cats.forEach((c, i) => {
            if (goneCat && goneCat.index === i) ul.appendChild(goneCatRow());
            ul.appendChild(catEditRow(c));
        });
        if (goneCat && goneCat.index >= state.cats.length) ul.appendChild(goneCatRow());
        $('add-cat').hidden = state.cats.length >= C.MAX_CATS;
    }
    function catEditRow(c) {
        const li = el('li', 'cat-edit'); li.style.setProperty('--c', c.color); li.dataset.id = c.id;
        const grid = el('div', 'ce-grid'), d1 = el('div'), d2 = el('div');
        const l1 = el('label', null, 'Name'); l1.htmlFor = 'cn-' + c.id;
        const name = el('input'); name.type = 'text'; name.id = 'cn-' + c.id; name.maxLength = C.MAX_NAME; name.value = c.name; name.autocomplete = 'off';
        d1.appendChild(l1); d1.appendChild(name);
        const l2 = el('label', null, 'Monthly budget'); l2.htmlFor = 'cb-' + c.id;
        const m = el('div', 'money'); const sym = el('span', 'sym', state.cur); sym.setAttribute('aria-hidden', 'true'); m.appendChild(sym);
        const bud = el('input'); bud.type = 'text'; bud.id = 'cb-' + c.id; bud.inputMode = 'decimal'; bud.maxLength = 16; bud.placeholder = 'No limit'; bud.autocomplete = 'off';
        bud.value = c.budget == null ? '' : C.plain(c.budget).replace(/\.00$/, '');
        m.appendChild(bud); d2.appendChild(l2); d2.appendChild(m);
        grid.appendChild(d1); grid.appendChild(d2); li.appendChild(grid);
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); li.appendChild(err);
        const foot = el('div', 'ce-foot');
        foot.appendChild(el('small', null, c.id === 'other' ? 'For anything that fits nowhere else.' : ''));
        if (c.id !== 'other') {
            const db = btn('Delete'); db.setAttribute('aria-label', 'Delete category ' + c.name);
            db.addEventListener('click', () => deleteCat(c));
            foot.appendChild(db);
        }
        li.appendChild(foot);
        name.addEventListener('input', () => {
            const v = name.value.replace(/\s+/g, ' ').trim();
            if (!v) { err.textContent = 'Type a name for this category.'; return; }
            if (state.cats.some(x => x !== c && x.name.toLowerCase() === v.toLowerCase())) { err.textContent = 'There is already a category called ' + v + '.'; return; }
            err.textContent = ''; c.name = v.slice(0, C.MAX_NAME); refreshSelects(); render();
        });
        name.addEventListener('blur', () => { if (err.textContent && name.value !== c.name) { name.value = c.name; err.textContent = ''; } });
        bud.addEventListener('input', () => {
            const r = C.parseAmount(bud.value);
            if (r.err) { err.textContent = amountError(r, 'The budget'); return; }
            err.textContent = '';
            c.budget = r.blank ? null : r.cents; render();
        });
        bud.addEventListener('blur', () => { if (err.textContent) { bud.value = c.budget == null ? '' : C.plain(c.budget).replace(/\.00$/, ''); err.textContent = ''; } });
        return li;
    }
    function goneCatRow() {
        const li = el('li', 'cat-edit gone');
        li.appendChild(el('span', null, goneCat.cat.name + ' deleted.' + (goneCat.moved.length ? ' ' + plural(new Set(goneCat.moved.map(m => m.id)).size, 'expense', 'expenses') + ' moved to ' + catById('other').name + '.' : '')));
        const b = btn('Undo');
        b.addEventListener('click', () => {
            const g = goneCat; goneCat = null;
            state.cats.splice(Math.min(g.index, state.cats.length - 1), 0, g.cat);
            g.moved.forEach(m => { const e = state.entries.find(x => x.id === m.id); if (e && e.parts[m.i] && e.parts[m.i].cat === 'other') e.parts[m.i].cat = g.cat.id; });
            refreshSelects(); renderCatEditor(); render();
            const f = $('cn-' + g.cat.id); if (f) f.focus();
        });
        li.appendChild(b);
        return li;
    }
    function deleteCat(c) {
        const i = state.cats.indexOf(c); if (i < 0) return;
        const moved = [];
        state.entries.forEach(e => e.parts.forEach((p, j) => { if (p.cat === c.id) { p.cat = 'other'; moved.push({ id: e.id, i: j }); } }));
        if (gone) gone.entry.parts.forEach(p => { if (p.cat === c.id) p.cat = 'other'; });
        state.cats.splice(i, 1);
        goneCat = { cat: c, index: i, moved };
        parts.forEach(pt => { if (pt.cat === c.id) pt.cat = 'other'; });
        if ($('filter').value === c.id) $('filter').value = '';
        clearMsgs(); refreshSelects(); renderCatEditor(); render();
        const u = document.querySelector('.cat-edit.gone button'); if (u) u.focus();
    }
    $('add-cat').addEventListener('click', () => {
        if (state.cats.length >= C.MAX_CATS) return;
        let n = 'New category', k = 2;
        while (state.cats.some(c => c.name.toLowerCase() === n.toLowerCase())) n = 'New category ' + k++;
        const used = state.cats.map(c => c.color), color = C.COLORS.find(x => !used.includes(x)) || C.COLORS[state.cats.length % C.COLORS.length];
        const c = { id: C.newId('c'), name: n, budget: null, color };
        const oi = state.cats.findIndex(x => x.id === 'other');
        state.cats.splice(oi < 0 ? state.cats.length : oi, 0, c);
        goneCat = null; clearMsgs(); refreshSelects(); renderCatEditor(); render();
        const f = $('cn-' + c.id); f.focus(); f.select();
    });
    $('go-budgets').addEventListener('click', () => {
        $('budgets').scrollIntoView({ block: 'start', behavior: 'smooth' });
        const f = document.querySelector('.cat-edit input[inputmode=decimal]'); if (f) f.focus({ preventScroll: true });
    });
    const sd = $('start-day');
    for (let d = 1; d <= 28; d++) sd.appendChild(new Option(d === 1 ? '1 (calendar months)' : String(d), String(d)));
    sd.addEventListener('change', () => {
        state.startDay = Math.min(28, Math.max(1, parseInt(sd.value, 10) || 1));
        view = C.periodOf(todayStr, state.startDay).start; gone = null;
        render();
        say($('cat-msg'), 'Your months now run ' + C.periodLabel(period(), state.startDay) + (state.startDay === 1 ? ' (calendar months).' : ' and so on.'));
    });

    // ---- example month
    $('demo').addEventListener('click', () => {
        const before = snapshot(), start = C.dayNum(C.periodOf(todayStr, state.startDay).start), last = C.dayNum(todayStr);
        const byName = n => state.cats.find(c => c.name === n), budgets = { Groceries: 40000, 'Eating out': 15000, Transport: 12000, 'Home and bills': 90000, Shopping: 10000, Fun: 8000 };
        const hasBudgets = state.cats.some(c => c.budget != null);
        if (!hasBudgets) Object.keys(budgets).forEach(n => { const c = byName(n); if (c) c.budget = budgets[n]; });
        const id = n => (byName(n) || catById('other')).id;
        const d = k => C.fromNum(Math.min(start + k, last));
        const E = (k, cat, cents, note, refund) => state.entries.push({ id: C.newId('e'), date: d(k), note, refund: !!refund, parts: Array.isArray(cat) ? cat.map(([n, c]) => ({ cat: id(n), cents: c })) : [{ cat: id(cat), cents }] });
        E(0, 'Home and bills', 85000, 'Rent'); E(1, 'Groceries', 6235, 'Supermarket'); E(2, 'Transport', 4500, 'Bus pass'); E(3, 'Eating out', 3850, 'Pizza night');
        E(4, [['Groceries', 6420], ['Home and bills', 2000]], 0, 'Big shop'); E(5, 'Fun', 2400, 'Cinema'); E(6, 'Eating out', 5680, 'Birthday dinner');
        E(7, 'Shopping', 4999, 'Shoes'); E(8, 'Shopping', 7450, 'Jacket'); E(8, 'Shopping', 1500, 'Returned T-shirt', true); E(8, 'Transport', 3000, 'Fuel');
        E(9, 'Groceries', 7115, 'Supermarket'); E(9, 'Health', 875, 'Pharmacy'); E(10, 'Eating out', 4260, 'Takeaway'); E(10, 'Fun', 1299, 'Concert ticket'); E(11, 'Groceries', 1840, 'Bakery and fruit');
        view = C.periodOf(todayStr, state.startDay).start; gone = null;
        renderCatEditor(); render();
        say($('add-msg'), 'Example month added' + (hasBudgets ? '' : ' with budgets') + '. Edit or delete anything, or tap Undo to remove it all.', () => restore(before));
    });

    // ---- share, backup, settings
    $('cur').addEventListener('change', () => { state.cur = C.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; render(); });
    function mailHref() {
        let body = C.summaryText(state, period(), todayStr, state.cur);
        if (body.length > 1800) body = body.slice(0, 1800).replace(/\n[^\n]*$/, '') + '\n(shortened: use Copy for all of it)';
        return 'mailto:?subject=' + encodeURIComponent('Spending for ' + C.periodLabel(period(), state.startDay)) + '&body=' + encodeURIComponent(body);
    }
    $('copy').addEventListener('click', async () => {
        const text = C.summaryText(state, period(), todayStr, state.cur);
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        }
        say($('tools-msg'), ok ? 'Summary of ' + C.periodLabel(period(), state.startDay) + ' copied. Paste it into a message or note.' : 'Could not copy here. Use Email instead.');
    });
    $('print').addEventListener('click', () => window.print());
    $('backup').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify({ app: 'expense-and-budget-tracker', saved: todayStr, ...state }, null, 1)], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'expense-and-budget-tracker-backup-' + todayStr + '.json';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        say($('tools-msg'), 'Backup saved to your downloads: ' + plural(state.entries.length, 'expense', 'expenses') + ' and ' + plural(state.cats.length, 'category', 'categories') + '.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; $('restore-file').value = '';
        if (!f) return;
        if (f.size > 20 * 1024 * 1024) { say($('tools-msg'), 'That file is too big to be a backup from this app.', null, 'bad'); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let raw; try { raw = JSON.parse(rd.result); } catch (e) { raw = null; }
            if (!raw || typeof raw !== 'object' || (!Array.isArray(raw.entries) && !Array.isArray(raw.cats))) { say($('tools-msg'), 'This file is not a backup from Expense and Budget Tracker. Nothing was changed.', null, 'bad'); return; }
            const before = snapshot(), next = C.clean(raw);
            const dropped = (Array.isArray(raw.entries) ? raw.entries.length : 0) - next.entries.length;
            state = next; stopEdit(true); gone = null; goneCat = null;
            view = C.periodOf(todayStr, state.startDay).start;
            $('cur').value = state.cur; sd.value = String(state.startDay);
            refreshSelects(); renderCatEditor(); render();
            say($('tools-msg'), 'Backup restored: ' + plural(state.entries.length, 'expense', 'expenses') + ' and ' + plural(state.cats.length, 'category', 'categories') + '.' + (dropped > 0 ? ' ' + plural(dropped, 'damaged expense was', 'damaged expenses were') + ' left out.' : ''), () => {
                restore(before, true);
            });
        };
        rd.onerror = () => say($('tools-msg'), 'Could not read that file. Nothing was changed.', null, 'bad');
        rd.readAsText(f);
    });
    $('wipe').addEventListener('click', () => {
        const before = snapshot();
        state = C.clean({ cur: state.cur }); stopEdit(true); gone = null; goneCat = null;
        view = C.periodOf(todayStr, state.startDay).start; sd.value = '1';
        refreshSelects(); renderCatEditor(); render();
        say($('tools-msg'), 'Everything deleted: expenses, budgets and your own categories.', () => restore(before, true));
    });

    // ---- a new day while the page is open (midnight): today's date and the current month move on
    function checkDay() {
        const t = C.today();
        if (t === todayStr) return;
        const wasCurrent = view === C.periodOf(todayStr, state.startDay).start;
        if (!dateTouched && !editingId && $('f-date').value === todayStr) $('f-date').value = t;
        todayStr = t;
        if (wasCurrent) view = C.periodOf(todayStr, state.startDay).start;
        render();
    }
    setInterval(checkDay, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });

    // ---- start
    $('cur').value = state.cur; sd.value = String(state.startDay);
    $('f-date').value = todayStr;
    fillCatSelect($('f-cat'), state.cats[0].id, false);
    fillCatSelect($('filter'), '', true);
    renderCatEditor();
    render();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
