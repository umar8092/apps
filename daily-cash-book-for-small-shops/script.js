// Daily Cash Book for Small Shops: the page. The maths and the words are in core.js (window.CashBook).
(function () {
    'use strict';
    const C = window.CashBook, KEY = 'daily-cash-book-for-small-shops.state', UIKEY = 'daily-cash-book-for-small-shops.ui';
    const $ = id => document.getElementById(id);
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', 'AED': 'AED (dirham)',
        'SAR': 'SAR (riyal)', 'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', '¥': '¥ (yen, yuan)',
        '₺': '₺ (lira)', 'E£': 'E£ (Egyptian pound)', 'R$': 'R$ (real)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'CHF': 'CHF (franc)', 'kr': 'kr (krona, krone)', 'zł': 'zł (złoty)' };
    const MSGS = ['add-msg', 'list-msg', 'close-msg', 'totals-msg', 'tools-msg'];
    const HINTS = {
        sale: 'Money a customer paid in cash. It goes into the drawer.',
        card: 'Paid by card, bank transfer or mobile wallet. It counts as a sale but is not in the drawer.',
        in: 'Cash put into the drawer that is not a sale, such as change from home or old credit paid back.',
        stock: 'Cash paid from the drawer for goods to sell.',
        exp: 'Cash paid from the drawer for running the shop, such as rent, electricity or wages.',
        owner: 'Cash the owner took out for home or personal use.'
    };
    const NOTE_PH = { sale: 'e.g. 3 school bags', card: 'e.g. JazzCash', in: 'e.g. change from home', stock: 'e.g. Ali Traders', exp: 'e.g. October bill', owner: 'e.g. for home' };
    const CLS = { sale: 'in', in: 'in', card: 'card-k', stock: 'out', exp: 'out', owner: 'out' };
    let state = C.emptyState(), ui = { cur: '', period: '' }, storageOK = true;
    let today = C.dayStr(new Date()), day = today, undoSnap = null, editing = null;

    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(cls, text, fn) { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
    const money = cents => C.fmt(cents, ui.cur);
    const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const kind = () => (document.querySelector('input[name="kind"]:checked') || {}).value || 'sale';
    const dayObj = k => state.days[k] || (state.days[k] = { open: null, count: null, items: [], notes: {} });
    function tidy(k) { const d = state.days[k]; if (d && !C.hasData(d) && !Object.keys(d.notes || {}).length) delete state.days[k]; }

    // ---------- storage ----------
    function load() {
        state = C.emptyState();
        try { const raw = localStorage.getItem(KEY); if (raw) state = C.normalize(JSON.parse(raw)); } catch (e) { state = C.emptyState(); }
        try {
            const u = JSON.parse(localStorage.getItem(UIKEY) || '{}') || {};
            if (typeof u.cur === 'string' && C.SYMBOLS.includes(u.cur)) ui.cur = u.cur;
            if (typeof u.period === 'string') ui.period = u.period;
        } catch (e) { /* bad or blocked: defaults */ }
        try { localStorage.setItem(KEY + '.test', '1'); localStorage.removeItem(KEY + '.test'); } catch (e) { storageOK = false; }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOK = false; $('store-warn').hidden = false; } }
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
                undoSnap = null; editing = null; save(); render();
                MSGS.forEach(id => say($(id), ''));
                say(box, 'Undone.');
            }));
        }
    }
    function clearMsgs(except) { MSGS.forEach(id => { if (id !== except) say($(id), ''); }); }
    function setErr(input, errBox, text) { errBox.textContent = text || ''; input.setAttribute('aria-invalid', text ? 'true' : 'false'); }
    function nowHM() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function checkToday() { const t = C.dayStr(new Date()); if (t !== today) { const wasToday = day === today; today = t; if (wasToday) day = t; } }

    // ---------- the add form ----------
    function allCats() {
        const seen = new Set(), out = [];
        state.cats.concat(C.CATS).forEach(c => { const k = c.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(c); } });
        return out;
    }
    function updateForm() {
        const k = kind();
        $('kind-hint').textContent = HINTS[k];
        $('cat-box').hidden = k !== 'exp';
        $('note').placeholder = NOTE_PH[k];
        const chips = $('cat-chips'); chips.textContent = '';
        if (k === 'exp') {
            const typed = $('cat').value.trim().toLowerCase();
            allCats().slice(0, 9).forEach(c => {
                const b = btn('chip', c, () => { $('cat').value = c; setErr($('cat'), $('cat-err'), ''); updateForm(); $('amount').focus(); });
                b.setAttribute('aria-pressed', String(c.toLowerCase() === typed)); chips.appendChild(b);
            });
        }
        $('save').textContent = 'Add ' + C.TYPES[k].label.toLowerCase() + (day === today ? '' : ' to ' + C.shortDate(day));
        const p = C.parseAmount($('amount').value);
        let pv = '';
        if (!p.error) {
            const cat = k === 'exp' ? ($('cat').value.trim() || 'expense') : '';
            pv = {
                sale: 'Adds ' + money(p.cents) + ' to the cash in the drawer.',
                in: 'Adds ' + money(p.cents) + ' to the cash in the drawer.',
                card: 'Adds ' + money(p.cents) + ' to sales. The drawer does not change.',
                stock: 'Takes ' + money(p.cents) + ' out of the drawer for stock.',
                exp: 'Takes ' + money(p.cents) + ' out of the drawer for ' + cat + '.',
                owner: 'Takes ' + money(p.cents) + ' out of the drawer for the owner.'
            }[k];
        }
        $('preview').textContent = pv;
    }
    function addEntry() {
        checkToday(); clearMsgs('add-msg');
        const k = kind(), p = C.parseAmount($('amount').value);
        let cat = '';
        if (k === 'exp') {
            cat = C.clean($('cat').value, 40);
            if (!cat) { setErr($('cat'), $('cat-err'), 'Type or tap what the expense was for, such as Rent.'); $('cat').focus(); return; }
            const known = allCats().find(c => c.toLowerCase() === cat.toLowerCase()); if (known) cat = known;
        }
        setErr($('cat'), $('cat-err'), '');
        if (p.error) { setErr($('amount'), $('amount-err'), p.error); $('amount').focus(); return; }
        setErr($('amount'), $('amount-err'), '');
        if (day > today) { say($('add-msg'), 'That day has not come yet.'); return; }
        const before = snap();
        const item = { id: newId(), t: k, c: p.cents, cat, note: C.clean($('note').value, 120), at: day === today ? nowHM() : '' };
        dayObj(day).items.push(item);
        if (cat && !C.CATS.some(c => c.toLowerCase() === cat.toLowerCase()) && !state.cats.some(c => c.toLowerCase() === cat.toLowerCase())) state.cats.unshift(cat);
        commit(before);
        $('amount').value = ''; $('note').value = ''; if (k === 'exp') $('cat').value = '';
        updateForm();
        say($('add-msg'), 'Added: ' + C.itemWords(item, ui.cur) + '.', true);
        $('amount').focus();
    }

    // ---------- the day ----------
    function renderDay(ch) {
        const v = C.dayView(state, day, ch), t = v.tot, isToday = day === today;
        const title = $('day-title'); title.textContent = C.niceDate(day, true);
        if (isToday) title.appendChild(el('span', 'today-tag', 'Today'));
        $('next-day').disabled = day >= today;
        $('go-today').hidden = isToday;
        $('date').max = today; $('date').value = day;
        const nl = $('now-line'); nl.textContent = '';
        nl.append(isToday ? 'Cash that should be in the drawer now: ' : 'Cash that should be in the drawer at closing: ', el('b', null, money(v.expected)));
        $('store-warn').hidden = storageOK;

        // the sum
        $('s-open').textContent = money(v.open);
        const of = $('open-from');
        of.textContent = v.from === 'typed' ? 'Typed by you' + (v.prevClose != null && v.prevClose !== v.open ? ' (' + C.shortDate(v.prevKey) + ' closed with ' + money(v.prevClose) + ')' : '') + '.'
            : v.from === 'count' ? 'The cash you counted on ' + C.shortDate(v.prevKey) + '.'
            : v.from === 'expected' ? 'What should have been there on ' + C.shortDate(v.prevKey) + ' (not counted).'
            : 'First day: type the cash in the drawer when you opened.';
        const firstDay = v.from === 'none';
        $('open-edit').textContent = firstDay ? 'Type the opening cash' : 'Change opening cash';
        $('open-carry').hidden = v.from !== 'typed';
        if (v.from === 'typed') $('open-carry').textContent = v.prevKey ? 'Use ' + money(v.prevClose) + ' from ' + C.shortDate(v.prevKey) + ' instead' : 'Remove the typed opening cash';
        const show = (id, val) => { $('r-' + id).hidden = !val && id !== 'sale'; $('s-' + id).textContent = money(val); };
        show('sale', t.sale); show('in', t.in); show('stock', t.stock); show('exp', t.exp); show('owner', t.owner);
        $('s-expected').textContent = money(v.expected);
        $('neg-warn').hidden = v.expected >= 0;

        // the count
        const counted = v.count != null;
        if (document.activeElement !== $('count')) $('count').value = counted ? (v.count / 100).toFixed(v.count % 100 ? 2 : 0) : '';
        $('count-save').textContent = counted ? 'Update count' : 'Save count';
        $('count-remove').hidden = !counted;
        const res = $('result');
        res.className = 'result ' + (!counted ? 'none' : v.diff < 0 ? 'short' : v.diff > 0 ? 'over' : 'ok');
        if (!counted) {
            $('r-main').textContent = t.lines || v.from === 'typed' ? 'Not counted yet. At closing, count the drawer and type the total above.' : 'Count the drawer at closing and type the total above to see if any cash is short.';
            $('r-sub').textContent = '';
        } else if (v.diff === 0) {
            $('r-main').textContent = 'Matches exactly';
            $('r-sub').textContent = 'You counted ' + money(v.count) + ', the same as should be there.';
        } else {
            $('r-main').textContent = C.diffWords(v.diff, ui.cur);
            $('r-sub').textContent = 'You counted ' + money(v.count) + ' but ' + money(v.expected) + ' should be there. ' + (v.diff < 0 ? 'Check for a missed expense or wrong change given.' : 'Check for a cash sale not written down.');
        }
        const ds = $('diff-sales');
        ds.hidden = !(counted && v.diff > 0 && t.sale === 0);
        if (!ds.hidden) ds.textContent = 'Did not write each sale? Add the ' + money(v.diff) + ' difference as cash sales';

        // sales of the day
        const box = $('day-sales'); box.textContent = '';
        if (t.lines) {
            const tile = (cls, label, val, sub) => { const d = el('div', 'tile ' + cls); d.append(el('span', 't-label', label), el('span', 't-val', val)); if (sub) d.appendChild(el('span', 't-sub', sub)); return d; };
            box.append(tile('in', isToday ? 'Sales today' : 'Sales this day', money(t.sales), t.card ? 'Cash ' + money(t.sale) + ', card or mobile ' + money(t.card) : ''),
                       tile('net', 'Sales minus stock and expenses', money(t.net)));
        }
        const next = C.addDays(day, 1);
        $('carry').textContent = !t.lines && !counted && v.from !== 'typed' ? '' : (counted ? 'The next day opens with ' + money(v.count) + ' (your count).' : 'The next day opens with ' + money(v.expected) + ' unless you count the drawer.') + (next > today ? '' : '');

        // the notes and coins counter
        renderNotes();

        // entries
        const list = $('items'); list.textContent = '';
        const items = (state.days[day] || {}).items || [];
        $('entries-h').textContent = 'Entries for ' + C.shortDate(day) + (items.length ? ' (' + items.length + ')' : '');
        $('empty').hidden = items.length > 0;
        $('clear-day').hidden = !C.hasData(state.days[day]);
        items.forEach(it => list.appendChild(itemBox(it)));
    }
    function itemBox(it) {
        const box = el('div', 'item ' + CLS[it.t]); box.dataset.id = it.id;
        const top = el('div', 'i-top');
        top.append(el('p', 'i-what', it.t === 'exp' ? 'Expense: ' + it.cat : C.TYPES[it.t].label), el('p', 'i-amt', (C.TYPES[it.t].dir > 0 ? '+' : '−') + money(it.c)));
        box.appendChild(top);
        const sub = [it.at, it.note, it.t === 'card' ? 'not in the drawer' : ''].filter(Boolean).join(' · ');
        if (sub) box.appendChild(el('p', 'i-sub', sub));
        if (editing === it.id) { box.classList.add('editing'); box.appendChild(editPanel(it)); return box; }
        const b = el('div', 'i-btns');
        b.append(btn('secondary small', 'Edit', () => { editing = it.id; clearMsgs(); render(); const f = document.querySelector('.item[data-id="' + it.id + '"] select'); if (f) f.focus(); }),
                 btn('secondary small', 'Delete', () => {
                     const before = snap(); const d = state.days[day];
                     d.items = d.items.filter(x => x.id !== it.id); tidy(day); commit(before); clearMsgs('list-msg');
                     say($('list-msg'), 'Deleted: ' + C.itemWords(it, ui.cur) + '.', true);
                 }));
        b.children[0].setAttribute('aria-label', 'Edit ' + C.itemWords(it, ui.cur));
        b.children[1].setAttribute('aria-label', 'Delete ' + C.itemWords(it, ui.cur));
        box.appendChild(b);
        return box;
    }
    function editPanel(it) {
        const p = el('div', 'panel'), id = 'e-' + it.id;
        const f1 = el('div', 'field'), l1 = el('label', null, 'What happened?'), sel = el('select');
        l1.htmlFor = id + '-t'; sel.id = id + '-t';
        Object.keys(C.TYPES).forEach(k => { const o = el('option', null, C.TYPES[k].label); o.value = k; sel.appendChild(o); }); sel.value = it.t;
        f1.append(l1, sel);
        const f2 = el('div', 'field'), l2 = el('label', null, 'What was it for?'), cat = el('input');
        l2.htmlFor = id + '-c'; cat.id = id + '-c'; cat.type = 'text'; cat.maxLength = 40; cat.autocomplete = 'off'; cat.value = it.cat || ''; cat.setAttribute('list', 'cat-list'); cat.placeholder = 'e.g. Rent';
        f2.append(l2, cat);
        const f3 = el('div', 'field'), l3 = el('label', null, 'Amount'), amt = el('input');
        l3.htmlFor = id + '-a'; amt.id = id + '-a'; amt.type = 'text'; amt.inputMode = 'decimal'; amt.maxLength = 24; amt.autocomplete = 'off'; amt.value = (it.c / 100).toFixed(it.c % 100 ? 2 : 0);
        f3.append(l3, amt);
        const f4 = el('div', 'field'), l4 = el('label', null, 'Note (optional)'), note = el('input');
        l4.htmlFor = id + '-n'; note.id = id + '-n'; note.type = 'text'; note.maxLength = 120; note.autocomplete = 'off'; note.value = it.note || '';
        f4.append(l4, note);
        const err = el('p', 'err'); err.setAttribute('role', 'alert');
        const sync = () => { f2.hidden = sel.value !== 'exp'; };
        sel.addEventListener('change', sync); sync();
        const doSave = () => {
            let c = '';
            if (sel.value === 'exp') { c = C.clean(cat.value, 40); if (!c) { err.textContent = 'Type what the expense was for, such as Rent.'; cat.focus(); return; } }
            const a = C.parseAmount(amt.value);
            if (a.error) { err.textContent = a.error; amt.setAttribute('aria-invalid', 'true'); amt.focus(); return; }
            const before = snap();
            Object.assign(it, { t: sel.value, c: a.cents, cat: c, note: C.clean(note.value, 120) });
            if (c && !allCats().some(x => x.toLowerCase() === c.toLowerCase())) state.cats.unshift(c);
            editing = null; commit(before); clearMsgs('list-msg');
            say($('list-msg'), 'Saved: ' + C.itemWords(it, ui.cur) + '.', true);
        };
        [cat, amt, note].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } }));
        const rb = el('div', 'row-btns');
        rb.append(btn('primary small', 'Save changes', doSave), btn('secondary small', 'Cancel', () => { editing = null; render(); }));
        p.append(f1, f2, f3, f4, err, rb);
        p.addEventListener('keydown', e => { if (e.key === 'Escape') { editing = null; render(); } });
        return p;
    }

    // notes and coins
    function renderNotes() {
        const host = $('notes'), d = state.days[day], counts = (d && d.notes) || {};
        const vals = C.denomsFor(ui.cur);
        const sig = ui.cur + '|' + day;
        if (host.dataset.sig !== sig) {
            host.textContent = ''; host.dataset.sig = sig;
            vals.forEach(v => {
                const row = el('div', 'note-row'), id = 'n-' + v, l = el('label', null, C.fmt(v, '') + ' ×'), i = el('input'), o = el('output');
                l.htmlFor = id; i.id = id; i.type = 'text'; i.inputMode = 'numeric'; i.maxLength = 5; i.autocomplete = 'off'; i.dataset.v = v;
                i.value = counts[v] ? String(counts[v]) : '';
                i.addEventListener('input', () => {
                    i.value = i.value.replace(/\D/g, '').slice(0, 5);
                    const dd = dayObj(day); const n = parseInt(i.value, 10);
                    if (n > 0) dd.notes[v] = n; else delete dd.notes[v];
                    tidy(day); save(); notesTotal();
                });
                row.append(l, i, o); host.appendChild(row);
            });
        }
        notesTotal();
    }
    function notesTotal() {
        let total = 0;
        $('notes').querySelectorAll('input').forEach(i => {
            const n = parseInt(i.value, 10) || 0, v = Number(i.dataset.v); total += n * v;
            i.parentNode.querySelector('output').textContent = n ? '= ' + money(n * v) : '';
        });
        $('notes-total').textContent = money(total);
        return total;
    }

    // ---------- week and month totals ----------
    function renderTotals(ch) {
        const ps = C.periods(state, today), sel = $('period');
        if (!ps.some(p => p.id === ui.period)) ui.period = ps[2].id;
        sel.textContent = '';
        ps.forEach(p => { const o = el('option', null, p.label); o.value = p.id; sel.appendChild(o); });
        sel.value = ui.period;
        const p = ps.find(x => x.id === ui.period), s = C.summarize(state, p.from, p.to, ch);
        const none = !s.days.length;
        $('t-empty').hidden = !none; $('t-body').hidden = none;
        if (none) return;
        $('t-sales').textContent = money(s.sales);
        $('t-sales-sub').textContent = s.card ? 'Cash ' + money(s.sale) + ', card or mobile ' + money(s.card) : '';
        $('t-net').textContent = money(s.net);
        $('t-stock').textContent = money(s.stock);
        $('t-exp').textContent = money(s.exp);
        $('t-owner').textContent = money(s.owner);
        const dt = $('t-diff-tile');
        dt.className = 'tile ' + (!s.counted ? '' : s.diff < 0 ? 'short' : s.diff > 0 ? 'over' : '');
        $('t-diff').textContent = !s.counted ? 'Not counted' : s.diff === 0 ? 'None' : C.diffWords(s.diff, ui.cur);
        $('t-diff-sub').textContent = s.counted ? 'On ' + C.plural(s.counted, 'counted day', 'counted days') + (s.shortDays ? ', short on ' + C.plural(s.shortDays, 'day', 'days') : '') : 'Count the drawer at closing to see this.';
        const cats = $('t-cats'); cats.textContent = '';
        $('t-cats-h').hidden = !s.cats.length; cats.hidden = !s.cats.length;
        s.cats.forEach(c => { const li = el('li'); li.append(el('span', null, c.cat), el('b', null, money(c.c))); cats.appendChild(li); });
        const days = $('t-days'); days.textContent = '';
        s.days.forEach(d => {
            const b = btn('drow', null, () => { goDay(d.key); $('daybar').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
            const diff = d.count == null ? ['none', 'Not counted'] : d.diff < 0 ? ['short', C.diffWords(d.diff, ui.cur)] : d.diff > 0 ? ['over', C.diffWords(d.diff, ui.cur)] : ['ok', 'Matches'];
            b.append(el('span', 'd-date', C.shortDate(d.key)), el('span', 'd-diff ' + diff[0], diff[1]),
                     el('span', 'd-sub', 'Sales ' + money(d.tot.sales) + ' · out ' + money(d.tot.cashOut) + ' · should be ' + money(d.expected)));
            b.setAttribute('aria-label', 'Open ' + C.niceDate(d.key, true) + ': sales ' + money(d.tot.sales) + ', ' + diff[1]);
            days.appendChild(b);
        });
    }
    const currentPeriod = () => C.periods(state, today).find(x => x.id === ui.period) || C.periods(state, today)[2];

    // ---------- share, print, backup ----------
    async function copyText(text, box) {
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px'; document.body.appendChild(t); t.select();
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        }
        say(box, ok ? 'Copied. Paste it into a message, note or email.' : 'Could not copy here. Select the text and copy it by hand.');
    }
    const mailto = (subject, body) => 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    function table(r, heads, rows, numCols) {
        const tb = el('table'), th = el('thead'), hr = el('tr');
        heads.forEach((x, i) => hr.appendChild(el('th', numCols.includes(i) ? 'n' : null, x))); th.appendChild(hr); tb.appendChild(th);
        const body = el('tbody');
        rows.forEach(cells => { const tr = el('tr'); cells.forEach((v, i) => tr.appendChild(el('td', numCols.includes(i) ? 'n' : null, v))); body.appendChild(tr); });
        tb.appendChild(body); r.appendChild(tb);
    }
    function buildReport() {
        const r = $('report'); r.textContent = '';
        const p = currentPeriod(), s = C.summarize(state, p.from, p.to);
        r.appendChild(el('h2', null, (state.shop ? state.shop + ' cash book: ' : 'Cash book: ') + p.title));
        r.appendChild(el('p', null, C.niceDate(p.from) + ' to ' + C.niceDate(p.to) + '. Days with entries: ' + s.days.length + '.'));
        C.periodLines(s, ui.cur).forEach(l => r.appendChild(el('p', null, l)));
        r.appendChild(el('h3', null, 'Day by day'));
        table(r, ['Day', 'Opening', 'Cash sales', 'Card/mobile', 'Other in', 'Stock', 'Expenses', 'Owner took', 'Should be', 'Counted', 'Short/over'],
            s.days.map(d => [C.shortDate(d.key), money(d.open), money(d.tot.sale), money(d.tot.card), money(d.tot.in), money(d.tot.stock), money(d.tot.exp), money(d.tot.owner), money(d.expected),
                d.count == null ? '-' : money(d.count), d.count == null ? '-' : C.diffWords(d.diff, ui.cur)]), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        const lines = [];
        s.days.forEach(d => (state.days[d.key].items || []).forEach(it => lines.push([C.shortDate(d.key), it.at, it.t === 'exp' ? 'Expense: ' + it.cat : C.TYPES[it.t].label, it.note, money(it.c)])));
        if (lines.length) { r.appendChild(el('h3', null, 'Every entry')); table(r, ['Day', 'Time', 'What', 'Note', 'Amount'], lines, [4]); }
    }
    function download(name, text) {
        const blob = new Blob([text], { type: 'application/json' }), a = el('a');
        a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    // ---------- navigation ----------
    function goDay(k) {
        checkToday();
        if (!C.isDay(k)) return;
        if (k > today) k = today;
        day = k; editing = null; clearMsgs(); $('open-box').hidden = true; setErr($('count'), $('count-err'), '');
        render();
    }
    function render() {
        const ch = C.chain(state);
        renderDay(ch); renderTotals(ch); updateForm();
        $('cur-tag').hidden = $('cur-tag2').hidden = !ui.cur; $('cur-tag').textContent = $('cur-tag2').textContent = ui.cur;
        const dl = $('cat-list'); dl.textContent = ''; allCats().forEach(c => { const o = el('option'); o.value = c; dl.appendChild(o); });
        if (document.activeElement !== $('shop')) $('shop').value = state.shop;
        if (state.shop) { $('shop-box').hidden = false; $('shop-open').hidden = true; }
    }

    function saveCount() {
        checkToday(); clearMsgs('close-msg');
        const raw = $('count').value.trim();
        if (!raw) {
            if ((state.days[day] || {}).count == null) { setErr($('count'), $('count-err'), 'Type the cash you counted, such as 18200.'); $('count').focus(); return; }
            removeCount(); return;
        }
        const p = C.parseAmount(raw, { zero: true });
        if (p.error) { setErr($('count'), $('count-err'), p.error); $('count').focus(); return; }
        setErr($('count'), $('count-err'), '');
        const before = snap(); dayObj(day).count = p.cents; commit(before);
        $('count').blur(); render();
        say($('close-msg'), 'Count saved: ' + money(p.cents) + '.', true);
    }
    function removeCount() {
        const before = snap(); const d = state.days[day]; if (!d) return;
        d.count = null; tidy(day); commit(before); $('count').value = '';
        say($('close-msg'), 'Count removed.', true);
    }

    function wire() {
        document.querySelectorAll('input[name="kind"]').forEach(r => r.addEventListener('change', () => { setErr($('cat'), $('cat-err'), ''); setErr($('amount'), $('amount-err'), ''); updateForm(); }));
        $('amount').addEventListener('input', () => { setErr($('amount'), $('amount-err'), ''); updateForm(); });
        $('cat').addEventListener('input', () => { setErr($('cat'), $('cat-err'), ''); updateForm(); });
        ['amount', 'cat', 'note'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }));
        $('save').addEventListener('click', addEntry);
        $('note-open').addEventListener('click', () => { $('note-box').hidden = false; $('note-open').hidden = true; $('note').focus(); });

        $('prev-day').addEventListener('click', () => goDay(C.addDays(day, -1)));
        $('next-day').addEventListener('click', () => goDay(C.addDays(day, 1)));
        $('go-today').addEventListener('click', () => goDay(C.dayStr(new Date())));
        $('date-open').addEventListener('click', () => { const b = $('date-box'); b.hidden = !b.hidden; if (!b.hidden) $('date').focus(); });
        $('date').addEventListener('change', () => {
            const v = $('date').value;
            if (!C.isDay(v)) return setErr($('date'), $('date-err'), 'Pick a day.');
            if (v > C.dayStr(new Date())) return setErr($('date'), $('date-err'), 'That day has not come yet. Pick today or an earlier day.');
            setErr($('date'), $('date-err'), ''); goDay(v); $('date-box').hidden = true;
        });

        // opening cash
        $('open-edit').addEventListener('click', () => {
            const b = $('open-box'); b.hidden = !b.hidden;
            if (!b.hidden) { const v = C.dayView(state, day); $('open-label').textContent = 'Cash in the drawer when you opened on ' + C.shortDate(day); $('open-in').value = v.open ? (v.open / 100).toFixed(v.open % 100 ? 2 : 0) : ''; setErr($('open-in'), $('open-err'), ''); $('open-in').focus(); $('open-in').select(); }
        });
        const saveOpen = () => {
            const p = C.parseAmount($('open-in').value, { zero: true });
            if (p.error) { setErr($('open-in'), $('open-err'), p.error.replace('the cash you counted, such as 18200', 'the opening cash, such as 2000')); $('open-in').focus(); return; }
            const before = snap(); dayObj(day).open = p.cents; $('open-box').hidden = true; commit(before); clearMsgs('close-msg');
            say($('close-msg'), 'Opening cash for ' + C.shortDate(day) + ' saved: ' + money(p.cents) + '.', true);
        };
        $('open-save').addEventListener('click', saveOpen);
        $('open-in').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveOpen(); } if (e.key === 'Escape') $('open-box').hidden = true; });
        $('open-cancel').addEventListener('click', () => { $('open-box').hidden = true; setErr($('open-in'), $('open-err'), ''); });
        $('open-carry').addEventListener('click', () => {
            const before = snap(); if (state.days[day]) { state.days[day].open = null; tidy(day); } $('open-box').hidden = true; commit(before); clearMsgs('close-msg');
            say($('close-msg'), 'The opening cash now comes from the day before.', true);
        });

        // count
        $('count-save').addEventListener('click', saveCount);
        $('count').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveCount(); } });
        $('count').addEventListener('input', () => setErr($('count'), $('count-err'), ''));
        $('count-remove').addEventListener('click', () => { clearMsgs('close-msg'); removeCount(); });
        $('notes-open').addEventListener('click', () => { const b = $('notes-box'); b.hidden = !b.hidden; $('notes-open').textContent = b.hidden ? '+ Count by notes and coins (optional)' : '− Hide notes and coins'; if (!b.hidden) { renderNotes(); const f = b.querySelector('input'); if (f) f.focus(); } });
        $('notes-use').addEventListener('click', () => { const t = notesTotal(); $('count').value = (t / 100).toFixed(t % 100 ? 2 : 0); saveCount(); });
        $('notes-clear').addEventListener('click', () => { const d = state.days[day]; if (d) { d.notes = {}; tidy(day); save(); } $('notes').dataset.sig = ''; renderNotes(); });
        $('diff-sales').addEventListener('click', () => {
            const v = C.dayView(state, day); if (!(v.count != null && v.diff > 0)) return;
            const before = snap(); const item = { id: newId(), t: 'sale', c: v.diff, cat: '', note: 'Worked out from the count', at: '' };
            dayObj(day).items.push(item); commit(before); clearMsgs('close-msg');
            say($('close-msg'), 'Added cash sales of ' + money(item.c) + '. The count now matches.', true);
        });
        $('clear-day').addEventListener('click', () => {
            const before = snap(); delete state.days[day]; editing = null; commit(before); clearMsgs('list-msg');
            say($('list-msg'), 'Cleared ' + C.niceDate(day, true) + '.', true);
        });
        $('copy-day').addEventListener('click', () => { clearMsgs('close-msg'); copyText(C.dayText(state, day, ui.cur, state.shop), $('close-msg')); });
        $('email-day').addEventListener('click', () => { clearMsgs('close-msg'); location.href = mailto((state.shop || 'Shop') + ' cash for ' + C.niceDate(day), C.dayText(state, day, ui.cur, state.shop)); });

        // totals
        $('period').addEventListener('change', () => { ui.period = $('period').value; saveUi(); clearMsgs(); render(); });
        $('copy-period').addEventListener('click', () => { clearMsgs('totals-msg'); copyText(C.periodText(state, currentPeriod(), ui.cur, state.shop), $('totals-msg')); });
        $('email-period').addEventListener('click', () => {
            clearMsgs('totals-msg');
            const p = currentPeriod(); let body = C.periodText(state, p, ui.cur, state.shop);
            if (body.length > 1800) {
                copyText(body, $('totals-msg'));
                body = C.periodText(state, p, ui.cur, state.shop, null, false) + '\n\n(The day-by-day list is too long for an email link. It has been copied: paste it here.)';
            }
            location.href = mailto((state.shop ? state.shop + ' ' : '') + 'cash book: ' + p.title, body);
        });
        $('print-period').addEventListener('click', () => { clearMsgs(); buildReport(); window.print(); });

        // backup and settings
        const cs = $('cur');
        C.SYMBOLS.forEach(s => { const o = el('option', null, CUR_NAMES[s] || s); o.value = s; cs.appendChild(o); });
        cs.value = ui.cur;
        cs.addEventListener('change', () => { ui.cur = cs.value; saveUi(); $('notes').dataset.sig = ''; render(); });
        $('shop-open').addEventListener('click', () => { $('shop-box').hidden = false; $('shop-open').hidden = true; $('shop').focus(); });
        $('shop').addEventListener('input', () => { state.shop = C.clean($('shop').value, 60); save(); });
        $('backup').addEventListener('click', () => {
            clearMsgs('tools-msg');
            if (!C.dayKeys(state).length) return say($('tools-msg'), 'Nothing to back up yet.');
            download('daily-cash-book-' + today + '.json', JSON.stringify({ app: 'daily-cash-book-for-small-shops', saved: new Date().toISOString(), cur: ui.cur, state }, null, 1));
            say($('tools-msg'), 'Backup file saved. Keep it somewhere safe, such as your email or cloud drive.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', async () => {
            clearMsgs('tools-msg');
            const file = $('restore-file').files[0]; $('restore-file').value = '';
            if (!file) return;
            try {
                if (file.size > 20e6) throw new Error('too big');
                const data = JSON.parse(await file.text());
                const s = C.normalize(data && data.state ? data.state : data);
                const before = snap(); state = s;
                if (data && typeof data.cur === 'string' && C.SYMBOLS.includes(data.cur)) { ui.cur = data.cur; cs.value = ui.cur; saveUi(); }
                editing = null; $('notes').dataset.sig = ''; commit(before);
                say($('tools-msg'), 'Backup restored: ' + C.plural(C.dayKeys(state).length, 'day', 'days') + '.', true);
            } catch (e) { say($('tools-msg'), 'That file is not a Daily Cash Book backup. Nothing was changed.'); }
        });
        $('wipe').addEventListener('click', () => {
            clearMsgs('tools-msg');
            if (!C.dayKeys(state).length && !state.shop) return say($('tools-msg'), 'There is nothing to delete.');
            const before = snap(); state = C.emptyState(); editing = null; $('notes').dataset.sig = ''; commit(before);
            say($('tools-msg'), 'Everything deleted.', true);
        });
        window.addEventListener('focus', () => { const t = today; checkToday(); if (t !== today) render(); });
    }

    load(); wire(); render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
