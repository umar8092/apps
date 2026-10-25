// Laundry and Dry-Cleaning Clothes Count Log: the page. The maths and the words are in core.js (window.LDC).
(function () {
    'use strict';
    const C = window.LDC, SLUG = 'laundry-and-dry-cleaning-clothes-count-log', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const LOC = navigator.language || 'en-GB';
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', '₦': '₦ (naira)',
        'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', 'Rp': 'Rp (rupiah)', 'RM': 'RM (ringgit)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const READY = [1, 2, 3, 4, 5, 7, 10, 14];
    const PAGE = 20;
    let state = C.emptyState(), today = C.dayStr(new Date()), view = C.monthOf(today);
    let filter = 'all', shown = PAGE;
    let editing = null;      // id of the batch in the form, or null when adding
    let fl = {};             // form rows: lower-case kind -> { t, n, p }
    let showMore = false;
    let panel = null;        // { id, what: 'pay' | 'lost' | 'shop' }
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
    const snap = () => JSON.stringify(state);
    function change(fn, where, text) {
        const before = snap(), focusId = document.activeElement && document.activeElement.id;
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
        if (editing && !byId(editing)) cancelEdit();
        save();
        flash = { where, text: 'Undone.' };
        fillShops();
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const money = c => (c < 0 ? '-' : '') + C.fmt(c, state.cur, LOC);
    const byId = id => state.batches.find(x => x.id === id);
    const shopOf = id => state.shops.find(s => s.id === id);
    const shopName = id => (shopOf(id) || { name: 'Shop' }).name;
    const pieces = n => C.pieces(n);
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into a message to the shop.' }; render(); };
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Use Print or save as PDF instead.', bad: true }; render(); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function setErr(id, msg) {
        $(id + '-err').textContent = msg || '';
        const inp = $(id); if (inp && inp.tagName !== 'FIELDSET' && inp.tagName !== 'DIV') { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
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
    function stepper(value, label, onSet, max, min, idBase) {
        const box = el('div', 'stepper');
        const minus = btn('−', 'step', () => onSet(Math.max(min || 0, value - 1)), 'One less ' + label);
        const plus = btn('+', 'step', () => onSet(Math.min(max, value + 1)), 'One more ' + label);
        minus.disabled = value <= (min || 0); plus.disabled = value >= max;
        if (idBase) { minus.id = idBase + '-minus'; plus.id = idBase + '-plus'; }
        const num = el('span', 'step-n', String(value));
        box.append(minus, num, plus);
        return box;
    }
    function reveal(openId, boxId, focusId) {
        $(openId).hidden = true; $(boxId).hidden = false;
        if (focusId) $(focusId).focus();
    }

    // ---------- the form ----------
    const svc = () => (document.querySelector('input[name=svc]:checked') || { value: 'wash' }).value;
    const formShop = () => $('f-shop').value && $('f-shop').value !== '+new' ? shopOf($('f-shop').value) : null;
    function fillShops(pickLast) {
        const sel = $('f-shop'), cur = sel.value;
        sel.textContent = '';
        state.shops.forEach(s => { const o = el('option', '', s.name); o.value = s.id; sel.appendChild(o); });
        const o = el('option', '', '+ A new shop…'); o.value = '+new'; sel.appendChild(o);
        sel.value = !pickLast && (state.shops.some(s => s.id === cur) || (cur === '+new' && state.shops.length)) ? cur : (state.last && shopOf(state.last) ? state.last : (state.shops[0] ? state.shops[0].id : '+new'));
        shopMode();
    }
    function shopMode() {
        const none = !state.shops.length;
        $('f-shop-pick').hidden = none;
        $('f-shop-new').hidden = !none && $('f-shop').value !== '+new';
        $('f-shop-name').previousElementSibling.textContent = none ? 'Shop or dhobi name' : 'Name of the new shop';
    }
    function allKinds() {
        const list = C.KINDS.concat(state.kinds);
        Object.values(fl).forEach(r => { if (!list.some(k => k.toLowerCase() === r.t.toLowerCase())) list.push(r.t); });
        return list;
    }
    function row(k) { const key = k.toLowerCase(); if (!fl[key]) fl[key] = { t: k, n: 0, p: C.priceInput(C.priceFor(formShop(), svc(), k)) }; return fl[key]; }
    function fillPrices() {
        const sh = formShop(), s = svc();
        Object.values(fl).forEach(r => { r.p = C.priceInput(C.priceFor(sh, s, r.t)); });
        buildKinds();
    }
    function buildKinds() {
        const box = $('kinds'), focusId = document.activeElement && box.contains(document.activeElement) ? document.activeElement.id : null;
        box.textContent = '';
        const base = C.KINDS.slice(0, C.FIRST);
        const list = allKinds().filter(k => showMore || base.includes(k) || !C.KINDS.includes(k) || row(k).n > 0);
        list.forEach((k, i) => {
            const r = row(k), id = 'k' + i;
            const item = el('div', 'kind' + (r.n > 0 ? ' on' : ''));
            const top = el('div', 'kind-top');
            const name = el('label', 'kind-name', k); name.htmlFor = id + '-n';
            const stp = el('div', 'stepper');
            const minus = btn('−', 'step', () => { r.n = Math.max(0, r.n - 1); buildKinds(); preview(); }, 'One less ' + k);
            const plus = btn('+', 'step', () => { r.n = Math.min(C.MAXN, r.n + 1); if (r.n === 1 && !r.p) r.p = C.priceInput(C.priceFor(formShop(), svc(), k)); buildKinds(); preview(); }, 'One more ' + k);
            minus.id = id + '-minus'; plus.id = id + '-plus'; minus.disabled = r.n <= 0;
            const num = el('input', 'step-in'); num.id = id + '-n'; num.type = 'text'; num.inputMode = 'numeric'; num.maxLength = 5; num.autocomplete = 'off';
            num.value = String(r.n); num.setAttribute('aria-label', 'How many: ' + k);
            num.addEventListener('focus', () => num.select());
            num.addEventListener('input', () => {
                const c = C.parseCount(num.value || '0');
                if (c.error) { num.setAttribute('aria-invalid', 'true'); return; }
                num.removeAttribute('aria-invalid');
                const was = r.n; r.n = c.n;
                if ((was === 0) !== (r.n === 0)) { buildKinds(); const again = $(id + '-n'); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } }
                else { minus.disabled = r.n <= 0; const sum = item.querySelector('.kind-sum'); if (sum) sum.textContent = lineSum(r); }
                preview();
            });
            stp.append(minus, num, plus);
            top.append(name, stp);
            item.appendChild(top);
            if (r.n > 0) {
                const pr = el('div', 'kind-price');
                const pl = el('label', '', 'Price each' + (state.cur ? ' (' + state.cur + ')' : '')); pl.htmlFor = id + '-p';
                const pin = el('input'); pin.id = id + '-p'; pin.type = 'text'; pin.inputMode = 'decimal'; pin.maxLength = 12; pin.autocomplete = 'off'; pin.placeholder = 'e.g. 40';
                pin.value = r.p;
                const sum = el('span', 'kind-sum', lineSum(r));
                pin.addEventListener('input', () => { r.p = pin.value; sum.textContent = lineSum(r); const bad = pin.value.trim() && C.parseAmount(pin.value, { zeroOk: true, max: C.MAXP }).error; if (bad) pin.setAttribute('aria-invalid', 'true'); else pin.removeAttribute('aria-invalid'); preview(); });
                pr.append(pl, pin, sum);
                item.appendChild(pr);
            }
            box.appendChild(item);
        });
        $('f-more').hidden = showMore;
        if (focusId && $(focusId)) $(focusId).focus();
    }
    function priceOf(r) { if (!String(r.p).trim()) return 0; const a = C.parseAmount(r.p, { zeroOk: true, max: C.MAXP }); return a.error ? null : a.cents; }
    function lineSum(r) {
        const p = priceOf(r);
        if (p === null) return 'Check the price';
        if (!p) return 'Price not set';
        return '= ' + C.fmt(r.n * p, state.cur, LOC);
    }
    function preview() {
        const rows = Object.values(fl).filter(r => r.n > 0);
        const n = rows.reduce((t, r) => t + r.n, 0);
        if (!n) { $('f-preview').textContent = 'Tap + next to each kind of clothing you are giving.'; return; }
        let bill = 0, missing = 0, bad = false;
        rows.forEach(r => { const p = priceOf(r); if (p === null) bad = true; else if (!p) missing += r.n; else bill += r.n * p; });
        let extra = 0;
        if (!$('f-extra-box').hidden && $('f-extra').value.trim()) { const a = C.parseAmount($('f-extra').value); if (!a.error) extra = a.cents; else bad = true; }
        let t = pieces(n) + ' · Bill ' + C.fmt(bill + extra, state.cur, LOC);
        if (missing) t += ' (price not set for ' + pieces(missing) + ')';
        if (bad) t = pieces(n) + ' · fix the price marked in red';
        $('f-preview').textContent = t;
    }
    function resetForm(keepShop) {
        editing = null; fl = {}; showMore = false;
        $('f-date').value = today;
        $('f-shop-name').value = ''; $('f-kind').value = ''; $('f-extra').value = ''; $('f-extra-label').value = ''; $('f-note').value = '';
        ['f-shop-name', 'f-date', 'f-kind', 'f-extra', 'f-lines'].forEach(id => setErr(id, ''));
        $('f-extra-box').hidden = true; $('f-extra-open').hidden = false;
        $('f-note-box').hidden = true; $('f-note-open').hidden = false;
        $('f-kind-box').hidden = true; $('f-kind-open').hidden = false;
        $('add-h').textContent = 'Give clothes to the laundry'; $('f-save').textContent = 'Save this batch'; $('f-cancel').hidden = true;
        if (!keepShop) { const r = document.querySelector('input[name=svc][value=wash]'); r.checked = true; }
        fillShops(true);
        fillPrices();
        preview();
    }
    function cancelEdit() { resetForm(true); }
    function startEdit(b) {
        resetForm(true);
        editing = b.id;
        $('f-shop').value = b.shop; shopMode();
        $('f-date').value = b.date;
        document.querySelector('input[name=svc][value=' + b.svc + ']').checked = true;
        fl = {};
        b.lines.forEach(l => { fl[l.t.toLowerCase()] = { t: l.t, n: l.n, p: C.priceInput(l.p) }; });
        if (b.extra) { $('f-extra-label').value = b.extra.label; $('f-extra').value = C.priceInput(b.extra.c); reveal('f-extra-open', 'f-extra-box'); }
        if (b.note) { $('f-note').value = b.note; reveal('f-note-open', 'f-note-box'); }
        $('add-h').textContent = 'Change the batch of ' + C.dayName(b.date, LOC); $('f-save').textContent = 'Save changes'; $('f-cancel').hidden = false;
        buildKinds(); preview();
        $('add').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('f-date').focus({ preventScroll: true });
    }
    function saveForm() {
        clearMsgs();
        let ok = true, shop = formShop(), newName = '';
        if (!shop) {
            newName = $('f-shop-name').value.replace(/\s+/g, ' ').trim();
            const dupe = state.shops.find(s => s.name.toLowerCase() === newName.toLowerCase());
            if (!newName) ok = setErr('f-shop-name', 'Type the name of the shop or dhobi, such as City Laundry.') && ok;
            else if (dupe) ok = setErr('f-shop-name', 'You already have "' + dupe.name + '". Pick it in Shop.') && ok;
            else setErr('f-shop-name', '');
        }
        const d = $('f-date').value;
        if (!C.isDay(d)) ok = setErr('f-date', 'Pick the day you gave the clothes.') && ok;
        else if (d > today) ok = setErr('f-date', 'The day given cannot be after today.') && ok;
        else setErr('f-date', '');
        const rows = Object.values(fl).filter(r => r.n > 0);
        let badPrice = rows.find(r => priceOf(r) === null);
        if (!rows.length) ok = setErr('f-lines', 'Count at least one piece: tap + next to Shirt, for example.') && ok;
        else if (badPrice) ok = setErr('f-lines', 'The price for ' + badPrice.t + ' looks mistyped. Type it like 40 or 12.50, or leave it empty.') && ok;
        else if (document.querySelector('#kinds [aria-invalid=true]')) ok = setErr('f-lines', 'A count looks mistyped. Use whole pieces, such as 5.') && ok;
        else setErr('f-lines', '');
        let extra = null;
        if (!$('f-extra-box').hidden && $('f-extra').value.trim()) {
            const a = C.parseAmount($('f-extra').value);
            if (a.error) ok = setErr('f-extra', a.error) && ok;
            else { setErr('f-extra', ''); extra = { label: $('f-extra-label').value.replace(/\s+/g, ' ').trim().slice(0, 40), c: a.cents }; }
        } else setErr('f-extra', '');
        if (!ok) { const first = document.querySelector('#add [aria-invalid=true], #add .err:not(:empty)'); if (first) (first.tagName === 'P' ? first.previousElementSibling || first : first).scrollIntoView({ block: 'center' }); return; }
        const s = svc(), note = $('f-note').value.trim().slice(0, 300);
        const lines = rows.map(r => ({ t: r.t, n: r.n, back: 0, lost: 0, p: priceOf(r) }));
        const wasEditing = editing;
        let text;
        change(() => {
            if (!shop) { shop = { id: C.newId(), name: newName.slice(0, 60), ready: 0, prices: {} }; state.shops.push(shop); }
            shop = shopOf(shop.id);
            C.rememberPrices(shop, s, lines);
            state.last = shop.id;
            let b = wasEditing ? byId(wasEditing) : null;
            if (b) {
                lines.forEach(l => { const old = b.lines.find(x => x.t.toLowerCase() === l.t.toLowerCase()); if (old) { l.lost = Math.min(old.lost, l.n); l.back = Math.min(old.back, l.n - l.lost); } });
                Object.assign(b, { shop: shop.id, date: d, svc: s, lines, extra, note });
            } else {
                b = { id: C.newId(), shop: shop.id, date: d, svc: s, lines, extra, comp: 0, note, pays: [], done: '' };
                state.batches.push(b);
            }
            C.markDone(b, today);
            const k = C.calc(b);
            text = (wasEditing ? 'Changed: ' : 'Saved: ') + pieces(k.given) + ' to ' + shop.name + ', bill ' + money(k.bill) + '.';
            resetForm(true);
        }, 'add-msg', () => text);
    }

    // ---------- the top ----------
    function renderSummary() {
        const has = state.batches.length > 0;
        $('summary').hidden = !has; $('list').hidden = !has; $('shops').hidden = !state.shops.length;
        $('add-intro').hidden = has;
        if (!has) return;
        const o = C.outNow(state), w = C.owedNow(state);
        $('tile-out-n').textContent = String(o.n);
        $('tile-out-s').textContent = o.n ? pieces(o.n) + ' in ' + C.plural(o.batches, 'batch', 'batches') : 'Everything is back';
        $('tile-pay-n').textContent = C.fmt(w.owe, state.cur, LOC);
        $('tile-pay-s').textContent = w.owe ? 'to all shops' + (w.ahead ? '; a shop owes you ' + C.fmt(w.ahead, state.cur, LOC) : '') : (w.ahead ? 'A shop owes you ' + C.fmt(w.ahead, state.cur, LOC) : 'All paid');
        $('tile-out').classList.toggle('on', filter === 'out'); $('tile-pay').classList.toggle('on', filter === 'unpaid');
        $('tile-out').classList.toggle('t-warn', o.n > 0); $('tile-pay').classList.toggle('t-warn', w.owe > 0);
        // the month
        const first = state.batches.reduce((m, b) => C.monthOf(b.date) < m ? C.monthOf(b.date) : m, C.monthOf(today));
        if (view < first) view = first;
        if (view > C.monthOf(today)) view = C.monthOf(today);
        $('mo-h').textContent = C.monthName(view, LOC);
        $('mo-prev').disabled = view <= first; $('mo-next').disabled = view >= C.monthOf(today);
        const ms = C.monthSummary(state, view), box = $('mo-rows');
        box.textContent = '';
        if (!ms.rows.length) box.appendChild(el('p', 'empty', 'No clothes given in ' + C.monthName(view, LOC) + '.'));
        ms.rows.forEach(r => {
            const d = el('div', 'mo-shop');
            d.appendChild(el('p', 'mo-name', r.shop.name));
            d.appendChild(el('p', 'mo-line', C.plural(r.batches, 'batch', 'batches') + ', ' + pieces(r.given) + ' · Bill ' + money(r.bill) + ' · Paid ' + money(r.paid)));
            const pt = el('p', 'mo-pay ' + (r.toPay > 0 ? 'owe' : 'ok'), C.payText(r.toPay, state.cur, LOC)); d.appendChild(pt);
            if (r.noPrice) d.appendChild(el('p', 'hint', 'Price not set for ' + pieces(r.noPrice) + ', so the bill may be more.'));
            d.appendChild(btn('Copy month bill', 'secondary small', () => copyText(C.monthText(state, view, r.shop.id, state.cur, LOC), 'sum-msg'), 'Copy the ' + C.monthName(view, LOC) + ' bill for ' + r.shop.name));
            box.appendChild(d);
        });
        $('mo-tot').textContent = ms.rows.length > 1 ? 'All shops in ' + C.monthName(view, LOC) + ': ' + pieces(ms.tot.given) + ', bill ' + money(ms.tot.bill) + '. ' + C.payText(ms.tot.toPay, state.cur, LOC) + '.' : '';
        $('mo-tot').hidden = ms.rows.length < 2;
    }

    // ---------- the batches ----------
    function matches(b) {
        const k = C.calc(b);
        if (filter === 'out') return k.out > 0;
        if (filter === 'unpaid') return k.toPay > 0;
        return true;
    }
    function renderList() {
        if (!state.batches.length) return;
        const sorted = state.batches.slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
        $('cnt-out').textContent = String(sorted.filter(b => C.calc(b).out > 0).length);
        $('cnt-unpaid').textContent = String(sorted.filter(b => C.calc(b).toPay > 0).length);
        $('cnt-all').textContent = String(sorted.length);
        document.querySelectorAll('input[name=filter]').forEach(r => { r.checked = r.value === filter; });
        const list = sorted.filter(matches), ul = $('batches');
        ul.textContent = '';
        list.slice(0, shown).forEach(b => ul.appendChild(batchBox(b)));
        $('more').hidden = list.length <= shown;
        const empty = $('list-empty');
        empty.hidden = list.length > 0;
        empty.textContent = filter === 'out' ? 'Nothing is at the laundry. Every piece is back.' : filter === 'unpaid' ? 'Nothing to pay. Every batch is paid.' : '';
    }
    function batchBox(b) {
        const k = C.calc(b), sh = shopOf(b.shop), st = C.status(b, sh ? sh.ready : 0, today, LOC);
        const li = el('li', 'batch st-' + st.kind); li.id = 'batch-' + b.id;
        const head = el('div', 'b-head');
        head.appendChild(el('h3', 'b-title', C.dayName(b.date, LOC) + ' · ' + shopName(b.shop)));
        head.appendChild(el('p', 'b-line', C.SERVICES[b.svc] + ' · ' + pieces(k.given) + ' given · ' + k.back + ' back'));
        head.appendChild(el('p', 'tag tag-' + st.kind, st.text));
        if (k.out > 0) head.appendChild(el('p', 'b-out', 'Not back yet: ' + C.outList(b)));
        li.appendChild(head);
        // one row per kind: given, back with + and -
        const rows = el('ul', 'b-rows');
        b.lines.forEach((l, i) => {
            const r = el('li', 'b-row' + (l.back + l.lost >= l.n ? ' full' : ''));
            const info = el('div', 'b-info');
            info.appendChild(el('p', 'b-kind', l.t + ' × ' + l.n));
            let sub = l.p ? C.fmt(l.p, state.cur, LOC) + ' each = ' + C.fmt((l.n - l.lost) * l.p, state.cur, LOC) : 'Price not set';
            if (l.lost) sub += ' · ' + l.lost + ' lost';
            info.appendChild(el('p', 'b-sub', sub));
            const back = el('div', 'b-back');
            back.appendChild(el('span', 'b-back-l', 'Back'));
            back.appendChild(stepper(l.back, 'back: ' + l.t, v => change(() => { byId(b.id).lines[i].back = v; C.markDone(byId(b.id), today); }, 'msg-' + b.id, l.t + ': ' + v + ' of ' + (l.n - l.lost) + ' back.'), l.n - l.lost, 0, 'bk-' + b.id + '-' + i));
            r.append(info, back);
            rows.appendChild(r);
        });
        li.appendChild(rows);
        if (k.out > 0) li.appendChild(btn('All back', 'primary all-back', () => change(() => { const x = byId(b.id); x.lines.forEach(l => { l.back = l.n - l.lost; }); C.markDone(x, today); }, 'msg-' + b.id, 'All ' + pieces(k.given - k.lost) + ' marked as back.'), 'All pieces back for the batch of ' + C.dayName(b.date, LOC)));
        // the money
        const bill = el('div', 'b-bill');
        const parts = [];
        if (b.extra) parts.push((b.extra.label || 'Extra charge') + ' ' + C.fmt(b.extra.c, state.cur, LOC));
        if (b.comp) parts.push('Taken off for lost or damaged: ' + C.fmt(b.comp, state.cur, LOC));
        if (parts.length) bill.appendChild(el('p', 'b-sub', parts.join(' · ')));
        bill.appendChild(el('p', 'b-money', 'Bill ' + money(k.bill) + ' · Paid ' + C.fmt(k.paid, state.cur, LOC)));
        bill.appendChild(el('p', 'b-topay ' + (k.toPay > 0 ? 'owe' : 'ok'), C.payText(k.toPay, state.cur, LOC)));
        if (k.noPrice) bill.appendChild(el('p', 'hint', 'Price not set for ' + pieces(k.noPrice) + '. Tap Edit to add it.'));
        if (b.pays.length) {
            const pl = el('ul', 'pays');
            b.pays.forEach(p => {
                const pi = el('li', 'pay');
                pi.appendChild(el('span', '', 'Paid ' + C.fmt(p.c, state.cur, LOC) + ' on ' + C.shortDate(p.d, LOC)));
                pi.appendChild(btn('Delete', 'link inline-link del', () => change(() => { const x = byId(b.id); x.pays = x.pays.filter(y => y.id !== p.id); }, 'msg-' + b.id, 'Payment deleted.'), 'Delete the payment of ' + C.fmt(p.c, state.cur, LOC)));
                pl.appendChild(pi);
            });
            bill.appendChild(pl);
        }
        li.appendChild(bill);
        if (b.note) li.appendChild(el('p', 'b-note', b.note));
        const btns = el('div', 'item-btns');
        if (k.toPay > 0) btns.appendChild(btn('Record a payment', 'secondary small', () => { panel = { id: b.id, what: 'pay' }; render(); focusPanel(); }));
        btns.appendChild(btn('Lost or damaged', 'secondary small', () => { panel = { id: b.id, what: 'lost' }; render(); focusPanel(); }));
        btns.appendChild(btn('Copy the list', 'secondary small', () => copyText(C.batchText(b, shopName(b.shop), state.cur, LOC), 'msg-' + b.id)));
        if (navigator.share) btns.appendChild(btn('Share', 'secondary small', () => { navigator.share({ text: C.batchText(b, shopName(b.shop), state.cur, LOC) }).catch(() => {}); }));
        btns.appendChild(btn('Edit', 'secondary small', () => startEdit(b), 'Edit the batch of ' + C.dayName(b.date, LOC)));
        btns.appendChild(btn('Delete', 'secondary small del', () => change(() => { state.batches = state.batches.filter(x => x.id !== b.id); if (editing === b.id) cancelEdit(); }, 'list-msg', 'Deleted the batch of ' + C.dayName(b.date, LOC) + '.'), 'Delete the batch of ' + C.dayName(b.date, LOC)));
        li.appendChild(btns);
        if (panel && panel.id === b.id) li.appendChild(panel.what === 'pay' ? payPanel(b, k) : lostPanel(b));
        const m = el('div', 'msg'); m.id = 'msg-' + b.id; m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite');
        li.appendChild(m);
        return li;
    }
    function focusPanel() { const p = document.querySelector('.panel input'); if (p) { p.focus(); p.closest('.panel').scrollIntoView({ block: 'nearest' }); } }
    function field(labelText, id, value, ph, mode) {
        const f = el('div', 'field');
        const l = el('label', '', labelText); l.htmlFor = id;
        const i = el('input'); i.id = id; i.type = mode === 'date' ? 'date' : 'text'; if (mode === 'decimal') i.inputMode = 'decimal'; i.autocomplete = 'off'; i.value = value; if (ph) i.placeholder = ph; i.maxLength = mode === 'note' ? 120 : 16;
        const e = el('p', 'err'); e.id = id + '-err'; e.setAttribute('role', 'alert'); i.setAttribute('aria-describedby', e.id);
        f.append(l, i, e);
        return f;
    }
    function payPanel(b, k) {
        const p = el('div', 'panel');
        p.appendChild(el('h4', '', 'Record a payment for ' + C.dayName(b.date, LOC)));
        p.appendChild(field('Amount paid' + (state.cur ? ' (' + state.cur + ')' : ''), 'p-amt', C.priceInput(k.toPay), 'e.g. 500', 'decimal'));
        p.appendChild(field('Day paid', 'p-day', today, '', 'date'));
        const row = el('div', 'row-btns');
        row.appendChild(btn('Save payment', 'primary', () => {
            const a = C.parseAmount($('p-amt').value), d = $('p-day').value;
            let ok = true;
            if (a.error) ok = setErr('p-amt', a.error) && ok;
            else if (a.cents > k.toPay) ok = setErr('p-amt', 'That is more than the ' + C.fmt(k.toPay, state.cur, LOC) + ' still to pay.') && ok;
            else setErr('p-amt', '');
            if (!C.isDay(d)) ok = setErr('p-day', 'Pick the day you paid.') && ok;
            else if (d > today) ok = setErr('p-day', 'The day paid cannot be after today.') && ok;
            else setErr('p-day', '');
            if (!ok) return;
            panel = null;
            change(() => { byId(b.id).pays.push({ id: C.newId(), d, c: a.cents }); }, 'msg-' + b.id, 'Payment of ' + C.fmt(a.cents, state.cur, LOC) + ' saved. ' + C.payText(k.toPay - a.cents, state.cur, LOC) + '.');
        }));
        row.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); }));
        p.appendChild(row);
        return p;
    }
    function lostPanel(b) {
        const p = el('div', 'panel'), draft = b.lines.map(l => l.lost);
        p.appendChild(el('h4', '', 'Lost or damaged pieces'));
        p.appendChild(el('p', 'hint', 'Lost pieces are not charged and do not count as still at the shop. A damaged piece that came back is not lost: just type what the shop agreed to pay or take off.'));
        const box = el('div', 'lost-rows');
        const paint = () => {
            box.textContent = '';
            b.lines.forEach((l, i) => {
                const r = el('div', 'lost-row');
                r.appendChild(el('span', 'b-kind', l.t + ' × ' + l.n + ': lost'));
                r.appendChild(stepper(draft[i], 'lost: ' + l.t, v => { const fid = document.activeElement && document.activeElement.id; draft[i] = v; paint(); if (fid && $(fid) && !$(fid).disabled) $(fid).focus(); }, l.n, 0, 'ls-' + i));
                box.appendChild(r);
            });
        };
        paint();
        p.appendChild(box);
        p.appendChild(field('Amount the shop agreed to pay you or take off (optional)' + (state.cur ? ' (' + state.cur + ')' : ''), 'l-amt', C.priceInput(b.comp), 'e.g. 500', 'decimal'));
        p.appendChild(field('What happened (optional)', 'l-note', b.note, 'e.g. Blue shirt lost', 'note'));
        const row = el('div', 'row-btns');
        row.appendChild(btn('Save', 'primary', () => {
            let comp = 0;
            if ($('l-amt').value.trim()) { const a = C.parseAmount($('l-amt').value, { zeroOk: true }); if (a.error) { setErr('l-amt', a.error); return; } comp = a.cents; }
            const note = $('l-note').value.trim().slice(0, 300);
            const lostN = draft.reduce((t, x) => t + x, 0);
            panel = null;
            change(() => {
                const x = byId(b.id);
                x.lines.forEach((l, i) => { l.lost = draft[i]; l.back = Math.min(l.back, l.n - l.lost); });
                x.comp = comp; x.note = note;
                C.markDone(x, today);
            }, 'msg-' + b.id, (lostN ? pieces(lostN) + ' marked as lost' : 'No pieces lost') + (comp ? ', ' + C.fmt(comp, state.cur, LOC) + ' taken off the bill.' : '.'));
        }));
        row.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); }));
        p.appendChild(row);
        return p;
    }

    // ---------- shops ----------
    function renderShops() {
        const ul = $('shop-list');
        ul.textContent = '';
        state.shops.forEach(sh => {
            const li = el('li', 'shop');
            const n = state.batches.filter(b => b.shop === sh.id).length, bal = C.shopBalance(state, sh.id), np = Object.keys(sh.prices).length;
            li.appendChild(el('p', 'shop-name', sh.name));
            li.appendChild(el('p', 'shop-line', C.plural(n, 'batch', 'batches') + ' · ' + C.payText(bal, state.cur, LOC)));
            li.appendChild(el('p', 'shop-line', (sh.ready ? 'Usually ready in ' + C.plural(sh.ready, 'day', 'days') : 'Ready time not set') + ' · ' + (np ? 'prices remembered for ' + C.plural(np, 'kind', 'kinds') : 'no prices yet')));
            const bt = el('div', 'item-btns');
            bt.appendChild(btn('Edit', 'secondary small', () => { panel = { id: sh.id, what: 'shop' }; render(); focusPanel(); }, 'Edit ' + sh.name));
            bt.appendChild(btn('Delete', 'secondary small del', () => change(() => {
                state.shops = state.shops.filter(s => s.id !== sh.id);
                state.batches = state.batches.filter(b => b.shop !== sh.id);
                if (state.last === sh.id) state.last = state.shops[0] ? state.shops[0].id : '';
                if (editing && !byId(editing)) cancelEdit();
                fillShops();
            }, 'shops-msg', 'Deleted ' + sh.name + (n ? ' and its ' + C.plural(n, 'batch', 'batches') : '') + '.'), 'Delete ' + sh.name));
            li.appendChild(bt);
            if (panel && panel.id === sh.id && panel.what === 'shop') li.appendChild(shopPanel(sh));
            ul.appendChild(li);
        });
    }
    function shopPanel(sh) {
        const p = el('div', 'panel');
        p.appendChild(el('h4', '', 'Edit ' + sh.name));
        p.appendChild(field('Shop name', 's-name', sh.name, 'e.g. City Laundry', 'note'));
        const f = el('div', 'field');
        const l = el('label', '', 'Usually ready in'); l.htmlFor = 's-ready';
        const sel = el('select'); sel.id = 's-ready';
        const add = (v, t) => { const o = el('option', '', t); o.value = String(v); sel.appendChild(o); };
        add(0, 'Not set'); READY.forEach(d => add(d, C.plural(d, 'day', 'days'))); add('o', 'Other…');
        const other = el('input'); other.id = 's-ready-o'; other.type = 'text'; other.inputMode = 'numeric'; other.maxLength = 2; other.placeholder = 'Days, 1 to 60'; other.setAttribute('aria-label', 'Number of days, 1 to 60');
        if (!sh.ready || READY.includes(sh.ready)) { sel.value = String(sh.ready || 0); other.hidden = true; } else { sel.value = 'o'; other.value = String(sh.ready); }
        sel.addEventListener('change', () => { other.hidden = sel.value !== 'o'; if (!other.hidden) other.focus(); });
        const e = el('p', 'err'); e.id = 's-ready-o-err'; e.setAttribute('role', 'alert');
        f.append(l, sel, other, e);
        p.appendChild(f);
        const row = el('div', 'row-btns');
        row.appendChild(btn('Save', 'primary', () => {
            const name = $('s-name').value.replace(/\s+/g, ' ').trim().slice(0, 60);
            let ok = true;
            const dupe = state.shops.find(s => s.id !== sh.id && s.name.toLowerCase() === name.toLowerCase());
            if (!name) ok = setErr('s-name', 'Type the shop name.') && ok;
            else if (dupe) ok = setErr('s-name', 'You already have a shop called ' + dupe.name + '.') && ok;
            else setErr('s-name', '');
            let ready = sel.value === 'o' ? Number(other.value) : Number(sel.value);
            if (sel.value === 'o' && !(/^\d{1,2}$/.test(other.value.trim()) && ready >= 1 && ready <= 60)) ok = setErr('s-ready-o', 'Type the days, from 1 to 60.') && ok;
            else setErr('s-ready-o', '');
            if (!ok) return;
            panel = null;
            change(() => { const x = shopOf(sh.id); x.name = name; x.ready = ready; fillShops(); }, 'shops-msg', 'Saved ' + name + '.');
        }));
        row.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); }));
        p.appendChild(row);
        return p;
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
            change(() => { state = s; panel = null; resetForm(); }, where, 'Backup restored: ' + C.plural(s.shops.length, 'shop', 'shops') + ', ' + C.plural(s.batches.length, 'batch', 'batches') + '.');
        };
        r.onerror = () => { flash = { where, text: 'Could not read that file.', bad: true }; render(); };
        r.readAsText(file);
    }

    // ---------- draw ----------
    function render() {
        renderSummary();
        renderList();
        renderShops();
        $('cur').value = state.cur;
        $('restore-first').hidden = state.batches.length > 0 || state.shops.length > 0;
        clearMsgs();
        if (flash) { const f = flash; flash = null; showMsg($(f.where) ? f.where : 'list-msg', f.text, f.undo, f.bad); }
    }

    // ---------- start ----------
    function start() {
        load();
        if (!canSave) $('store-warn').hidden = false;
        Object.keys(CUR_NAMES).forEach(k => { const o = el('option', '', CUR_NAMES[k]); o.value = k; $('cur').appendChild(o); });
        resetForm();
        render();
        $('f-shop').addEventListener('change', () => { shopMode(); fillPrices(); preview(); if ($('f-shop').value === '+new') $('f-shop-name').focus(); });
        document.querySelectorAll('input[name=svc]').forEach(r => r.addEventListener('change', () => { fillPrices(); preview(); }));
        $('f-today').addEventListener('click', () => { $('f-date').value = today; setErr('f-date', ''); });
        $('f-yday').addEventListener('click', () => { $('f-date').value = C.addDays(today, -1); setErr('f-date', ''); });
        $('f-more').addEventListener('click', () => { showMore = true; buildKinds(); const k = $('k' + C.FIRST + '-plus'); if (k) k.focus(); });
        $('f-kind-open').addEventListener('click', () => reveal('f-kind-open', 'f-kind-box', 'f-kind'));
        const addKind = () => {
            const t = $('f-kind').value.replace(/\s+/g, ' ').trim().slice(0, 40);
            if (!t) { setErr('f-kind', 'Type the kind of clothing, such as Abaya.'); return; }
            setErr('f-kind', '');
            const known = allKinds().find(k => k.toLowerCase() === t.toLowerCase());
            if (!known) { state.kinds.push(t); save(); }
            const name = known || t;
            if (C.KINDS.indexOf(name) >= C.FIRST) showMore = true;
            const r = row(name); if (!r.n) { r.n = 1; r.p = C.priceInput(C.priceFor(formShop(), svc(), name)); }
            $('f-kind').value = ''; $('f-kind-box').hidden = true; $('f-kind-open').hidden = false;
            buildKinds(); preview();
            const i = allKinds().filter(k => showMore || C.KINDS.slice(0, C.FIRST).includes(k) || !C.KINDS.includes(k) || row(k).n > 0).indexOf(name);
            const inp = $('k' + i + '-p') || $('k' + i + '-n'); if (inp) inp.focus();
        };
        $('f-kind-add').addEventListener('click', addKind);
        $('f-kind').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addKind(); } });
        $('f-extra-open').addEventListener('click', () => reveal('f-extra-open', 'f-extra-box', 'f-extra-label'));
        $('f-note-open').addEventListener('click', () => reveal('f-note-open', 'f-note-box', 'f-note'));
        $('f-extra').addEventListener('input', preview);
        $('f-save').addEventListener('click', saveForm);
        $('f-cancel').addEventListener('click', () => { cancelEdit(); render(); });
        $('go-add').addEventListener('click', () => { $('add').scrollIntoView({ behavior: 'smooth', block: 'start' }); const p = $('k0-plus'); if (p) p.focus({ preventScroll: true }); });
        $('tile-out').addEventListener('click', () => { filter = filter === 'out' ? 'all' : 'out'; shown = PAGE; render(); $('list').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        $('tile-pay').addEventListener('click', () => { filter = filter === 'unpaid' ? 'all' : 'unpaid'; shown = PAGE; render(); $('list').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        document.querySelectorAll('input[name=filter]').forEach(r => r.addEventListener('change', () => { filter = r.value; shown = PAGE; render(); }));
        $('more').addEventListener('click', () => { shown += PAGE; render(); });
        $('mo-prev').addEventListener('click', () => { view = C.addMonth(view, -1); render(); });
        $('mo-next').addEventListener('click', () => { view = C.addMonth(view, 1); render(); });
        $('mo-print').addEventListener('click', () => window.print());
        $('cur').addEventListener('change', () => { state.cur = C.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; save(); buildKinds(); preview(); flash = { where: 'tools-msg', text: 'Currency symbol saved.' }; render(); });
        $('backup').addEventListener('click', backup);
        $('restore').addEventListener('click', () => { $('restore-file').dataset.where = 'tools-msg'; $('restore-file').click(); });
        $('restore-first').addEventListener('click', () => { $('restore-file').dataset.where = 'add-msg'; $('restore-file').click(); });
        $('restore-file').addEventListener('change', e => { restore(e.target.files[0], e.target.dataset.where || 'tools-msg'); e.target.value = ''; });
        $('del-all').addEventListener('click', () => {
            if (!state.batches.length && !state.shops.length) { flash = { where: 'tools-msg', text: 'There is nothing to delete.' }; render(); return; }
            const cur = state.cur;
            change(() => { state = C.emptyState(); state.cur = cur; panel = null; resetForm(); }, 'tools-msg', 'Everything deleted.');
        });
        // a new day while the page stays open
        setInterval(() => { const t = C.dayStr(new Date()); if (t !== today) { today = t; render(); } }, 60000);
        if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    start();
})();
