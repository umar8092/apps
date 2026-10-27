// Grocery Price Book: the page. The maths and the words are in core.js (window.GPB).
(function () {
    'use strict';
    const C = window.GPB, SLUG = 'grocery-price-book-for-comparing-shops', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    // a locale Intl accepts (some systems report tags such as "en-US@posix")
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', '₦': '₦ (naira)',
        'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', 'Rp': 'Rp (rupiah)', 'RM': 'RM (ringgit)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const NEW = '__new';
    let state = C.emptyState(), today = C.localDay(new Date());
    let editing = null;        // id of the item in the top form, or null when adding
    let drafts = {};           // typed but not saved prices per item
    let editEntry = {};        // item id -> id of the price being edited
    let showAll = {};          // item id -> list every price
    let renaming = null;       // id of the shop being renamed
    let flash = null, undoSnap = null, canSave = true;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (!raw) return;
        try { const s = C.cleanState(JSON.parse(raw)); if (s) { state = s; state.last = typeof JSON.parse(raw).last === 'string' ? JSON.parse(raw).last : ''; } } catch (e) { /* corrupt: start fresh */ }
    }
    function save() {
        if (!canSave) { $('store-warn').hidden = false; return; }
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canSave = false; $('store-warn').hidden = false; }
    }
    const snap = () => JSON.stringify(state);
    function change(fn, where, text) {
        const before = snap();
        lastWhere = where;
        fn();
        save();
        undoSnap = before;
        flash = { where, text, undo: true };
        render();
    }
    function undo() {
        if (!undoSnap) return;
        const raw = JSON.parse(undoSnap), s = C.cleanState(raw);
        if (s) { state = s; state.last = raw.last || ''; }
        undoSnap = null; editEntry = {}; renaming = null;
        save();
        $('cur').value = state.cur;
        flash = { where: $(lastWhere) ? lastWhere : 'top-msg', text: 'Undone.' };
        render();
    }
    let lastWhere = 'top-msg';

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    function p(cls, text) { return el('p', cls, text); }
    const money = c => C.fmtMoney(c, state.cur, LOC);
    const yearOpt = s => s.slice(0, 4) !== today.slice(0, 4);
    const date = s => C.fmtDate(s, LOC, yearOpt(s));
    const itemById = id => state.items.find(x => x.id === id);
    const shopById = id => state.shops.find(x => x.id === id);
    const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const sorted = () => state.items.slice().sort((a, b) => a.name.localeCompare(b.name, LOC, { sensitivity: 'base' }));
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into a message or email.' }; render(); };
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Use Email list instead.', bad: true }; render(); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function setErr(id, msg) {
        const e = $(id + '-err'); if (e) e.textContent = msg || '';
        const inp = $(id); if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
        return !msg;
    }
    function showMsg(box, text, withUndo, bad) {
        if (!box) return;
        box.textContent = '';
        box.className = 'msg show' + (bad ? ' bad' : '');
        box.appendChild(document.createTextNode(text + ' '));
        if (withUndo) box.appendChild(btn('Undo', 'link inline undo', undo));
    }
    function download(name, type, text) {
        const blob = new Blob([text], { type });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function field(labelText, input, errId) {
        const f = el('div', 'field');
        const l = el('label', null, labelText); l.htmlFor = input.id;
        f.append(l, input);
        if (errId) { const e = p('err', ''); e.id = errId; e.setAttribute('role', 'alert'); f.appendChild(e); input.setAttribute('aria-describedby', errId); }
        return f;
    }
    function input(id, value, ph, mode, max) {
        const i = el('input'); i.type = 'text'; i.id = id; i.value = value || ''; i.autocomplete = 'off';
        if (ph) i.placeholder = ph; if (mode) i.inputMode = mode; i.maxLength = max || 20;
        return i;
    }

    // ---------- the item form ----------
    function fillPer(kind) {
        const sel = $('f-per'), keep = sel.value;
        sel.textContent = '';
        C.PER_ORDER.forEach(k => { if (kind && C.PER[k].k !== kind) return; const o = el('option', null, C.PER_LABEL[k]); o.value = k; sel.appendChild(o); });
        if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
    }
    function fillCur() {
        const sel = $('cur');
        Object.keys(CUR_NAMES).forEach(k => { const o = el('option', null, CUR_NAMES[k]); o.value = k; sel.appendChild(o); });
        if (state.cur && !(state.cur in CUR_NAMES)) { const o = el('option', null, state.cur); o.value = state.cur; sel.appendChild(o); }
        sel.value = state.cur;
    }
    function resetForm() {
        editing = null;
        fillPer(null);
        $('f-name').value = ''; $('f-per').value = 'kg';
        setErr('f-name', '');
    }
    function fillForm(it) {
        resetForm();
        editing = it.id;
        // with prices saved, only a "per" of the same kind (weight, liquid, items) keeps them comparable
        fillPer(it.entries.length ? C.PER[it.per].k : null);
        $('f-name').value = it.name; $('f-per').value = it.per;
    }
    function saveItem() {
        const name = C.cleanName($('f-name').value, 60);
        if (!name) { setErr('f-name', 'Type a name, such as Cooking oil.'); $('f-name').focus(); return; }
        const dup = state.items.find(x => x.id !== editing && C.same(x.name, name));
        if (dup) { setErr('f-name', 'You already have ' + dup.name + '. Use a different name, such as ' + name + ' 5 L.'); $('f-name').focus(); return; }
        setErr('f-name', '');
        const per = $('f-per').value;
        if (editing) {
            const it = itemById(editing);
            if (!it) { resetForm(); render(); return; }
            const id = it.id;
            change(() => { it.name = name; it.per = per; drafts[id] = null; }, 'top-msg', 'Saved the changes to ' + name + '.');
            resetForm(); render();
            const b = document.querySelector('[data-id="' + id + '"]'); if (b) b.scrollIntoView({ block: 'start' });
            return;
        }
        const it = { id: newId('i'), name, per, entries: [] };
        $('find').value = '';
        change(() => { state.items.push(it); }, 'top-msg', 'Added ' + name + '. Now note its price at a shop.');
        resetForm(); render();
        const box = document.querySelector('[data-id="' + it.id + '"]');
        if (box) { box.scrollIntoView({ block: 'start' }); const f = box.querySelector(state.shops.length ? '.p-price' : '.p-newshop'); if (f) f.focus(); }
    }

    // ---------- prices ----------
    function lastEntry(it) { let e = null; it.entries.forEach(x => { if (!e || x.n > e.n) e = x; }); return e; }
    function draftOf(it) {
        const s = state.shops.some(x => x.id === state.last) ? state.last : state.shops.length ? state.shops[0].id : NEW;
        if (drafts[it.id]) {
            // an untouched shop list follows the shop used last, so noting many prices in one shop is quick
            const d = drafts[it.id];
            if (!d.sTouched && !editEntry[it.id]) d.s = s;
            return d;
        }
        const last = lastEntry(it);
        return (drafts[it.id] = { s, shop: '', c: '', q: last ? C.fmtNum(last.q / 1000, 'en-US').replace(/,/g, '') : '', u: last ? last.u : C.PER[it.per].unit, k: '', multi: false, d: today, sale: false });
    }
    // reads the typed price; strict = show the errors (on Save), otherwise quietly return null
    function readDraft(it, strict) {
        const d = drafts[it.id], id = it.id, out = {};
        let ok = true;
        const err = (f, msg) => { if (strict) setErr(f + '-' + id, msg); ok = false; };
        if (strict) ['ps', 'pn', 'pc', 'pq', 'pk', 'pd'].forEach(f => setErr(f + '-' + id, ''));
        if (d.s === NEW) {
            const name = C.cleanName(d.shop, 40);
            if (!name) err('pn', 'Type the shop name, such as Metro.');
            else { const old = state.shops.find(x => C.same(x.name, name)); out.s = old ? old.id : NEW; out.shopName = old ? old.name : name; }
        } else if (!shopById(d.s)) err('ps', 'Pick a shop.'); else out.s = d.s;
        const c = C.parseMoney(d.c);
        if (c.error) err('pc', c.error); else out.c = c.n;
        const q = C.parseSize(d.q);
        if (q.error) err('pq', q.error);
        else {
            out.q = q.n; out.u = d.u;
            if (q.u) {
                if (C.UNITS[q.u].k !== C.PER[it.per].k) err('pq', it.name + ' is compared ' + C.PER_LABEL[it.per].replace(/ \(.*/, '') + '. Pick a unit from the list.');
                else out.u = q.u;
            }
        }
        const k = d.multi ? C.parsePacks(d.k) : { n: 1 };
        if (k.error) err('pk', k.error); else out.k = k.n;
        const de = C.checkDay(d.d, today);
        if (de) err('pd', de); else out.d = d.d;
        out.sale = !!d.sale;
        return ok ? out : null;
    }
    // the green or red answer under the form, redrawn on every key press
    function drawVerdict(it) {
        const box = $('pv-' + it.id);
        if (!box) return;
        box.textContent = '';
        box.className = 'verdict';
        const r = readDraft(it, false);
        if (!r) { box.appendChild(p('v-wait', 'Type the price and the pack size to see if it is a good price.')); return; }
        const lines = C.verdict(state, it, r, today, LOC, editEntry[it.id]);
        const main = lines.find(l => l.tone !== 'info');
        box.classList.add('is-' + (main ? main.tone : 'info'));
        lines.forEach((l, i) => box.appendChild(p('v-line' + (i === 1 ? ' v-main' : '') + ' t-' + l.tone, l.text)));
    }
    function savePrice(it) {
        const r = readDraft(it, true);
        if (!r) { const bad = document.querySelector('[data-id="' + it.id + '"] .p-form [aria-invalid="true"]'); if (bad) bad.focus(); return; }
        const eid = editEntry[it.id];
        lastWhere = 'pm-' + it.id;
        change(() => {
            if (r.s === NEW) { const s = { id: newId('s'), name: r.shopName }; state.shops.push(s); r.s = s.id; }
            state.last = r.s;
            state.seq += 1;
            const e = { id: eid || newId('e'), s: r.s, c: r.c, q: r.q, u: r.u, k: r.k, d: r.d, n: state.seq };
            if (r.sale) e.sale = true;
            if (eid) { const i = it.entries.findIndex(x => x.id === eid); if (i >= 0) it.entries[i] = e; else it.entries.push(e); }
            else it.entries.push(e);
            editEntry[it.id] = null;
            drafts[it.id] = null;
        }, 'pm-' + it.id, (eid ? 'Saved the changes: ' : 'Saved: ') + C.priceText({ c: r.c, q: r.q, u: r.u, k: r.k }, state.cur, LOC) + ' at ' + (r.shopName || shopById(r.s).name) + '.');
    }
    function startEdit(it, e) {
        editEntry[it.id] = e.id;
        drafts[it.id] = { s: e.s, shop: '', c: C.fmtNum(e.c / 100, 'en-US', 2).replace(/,/g, ''), q: C.fmtNum(e.q / 1000, 'en-US').replace(/,/g, ''), u: e.u, k: e.k > 1 ? String(e.k) : '', multi: e.k > 1, d: e.d, sale: !!e.sale };
        render();
        const f = $('pc-' + it.id); if (f) { f.closest('.p-form').scrollIntoView({ block: 'center' }); f.focus(); }
    }
    function cancelEdit(it) { editEntry[it.id] = null; drafts[it.id] = null; render(); }
    function deleteEntry(it, e) {
        lastWhere = 'pm-' + it.id;
        if (editEntry[it.id] === e.id) { editEntry[it.id] = null; drafts[it.id] = null; }
        change(() => { it.entries = it.entries.filter(x => x.id !== e.id); }, 'pm-' + it.id, 'Deleted the price of ' + date(e.d) + ' at ' + C.shopName(state, e.s) + '.');
    }

    // ---------- one item box ----------
    function priceForm(it) {
        const d = draftOf(it), id = it.id, f = el('div', 'p-form'), eid = editEntry[id];
        f.appendChild(el('h3', null, eid ? 'Change this price' : 'Check or add a price'));
        // shop
        const ss = el('select'); ss.id = 'ps-' + id;
        state.shops.forEach(s => { const o = el('option', null, s.name); o.value = s.id; ss.appendChild(o); });
        const on = el('option', null, '+ New shop…'); on.value = NEW; ss.appendChild(on);
        ss.value = d.s;
        ss.addEventListener('change', () => { d.s = ss.value; d.sTouched = true; nb.hidden = d.s !== NEW; drawVerdict(it); if (d.s === NEW) ni.focus(); });
        f.appendChild(field('Shop', ss, 'ps-' + id + '-err'));
        const nb = el('div', 'new-shop'); nb.hidden = d.s !== NEW;
        const ni = input('pn-' + id, d.shop, 'e.g. Metro', null, 40); ni.classList.add('p-newshop');
        ni.addEventListener('input', () => { d.shop = ni.value; drawVerdict(it); });
        nb.appendChild(field(state.shops.length ? 'New shop name' : 'Shop name', ni, 'pn-' + id + '-err'));
        f.appendChild(nb);
        // price and pack
        const two = el('div', 'two');
        const ci = input('pc-' + id, d.c, 'e.g. 2690', 'decimal', 20); ci.classList.add('p-price');
        ci.addEventListener('input', () => { d.c = ci.value; drawVerdict(it); });
        const cf = field('Price', ci, 'pc-' + id + '-err');
        if (state.cur) { const row = el('div', 'amount-row'); row.append(el('span', 'cur-tag', state.cur), ci); cf.insertBefore(row, cf.querySelector('.err')); }
        two.appendChild(cf);
        const qi = input('pq-' + id, d.q, 'e.g. 5', 'decimal', 20);
        const us = el('select'); us.id = 'pu-' + id; us.setAttribute('aria-label', 'Unit of the pack size');
        C.UNIT_ORDER[C.PER[it.per].k].forEach(u => { const o = el('option', null, C.UNITS[u].label); o.value = u; us.appendChild(o); });
        us.value = d.u;
        qi.addEventListener('input', () => {
            d.q = qi.value;
            // "500 g" typed in the box picks g in the list
            const r = C.parseSize(qi.value);
            if (r.u && C.UNITS[r.u].k === C.PER[it.per].k) { d.u = r.u; us.value = r.u; }
            drawVerdict(it);
        });
        us.addEventListener('change', () => { d.u = us.value; drawVerdict(it); });
        const qf = field('Pack size', qi, 'pq-' + id + '-err');
        const qrow = el('div', 'size-row'); qrow.append(qi, us); qf.insertBefore(qrow, qf.querySelector('.err'));
        two.appendChild(qf);
        f.appendChild(two);
        // multipack
        const mo = btn('+ Multipack or "buy 2" deal (optional)', 'link', () => { d.multi = true; mo.hidden = true; mb.hidden = false; ki.focus(); });
        mo.hidden = d.multi;
        const mb = el('div', 'multi'); mb.hidden = !d.multi;
        const ki = input('pk-' + id, d.k, 'e.g. 2', 'numeric', 4);
        ki.addEventListener('input', () => { d.k = ki.value; drawVerdict(it); });
        mb.appendChild(field('How many packs this price is for', ki, 'pk-' + id + '-err'));
        mb.appendChild(btn('Remove', 'link small-link', () => { d.multi = false; d.k = ''; mb.hidden = true; mo.hidden = false; setErr('pk-' + id, ''); drawVerdict(it); }, 'Remove the multipack'));
        f.append(mo, mb);
        // date and sale
        const di = el('input'); di.type = 'date'; di.id = 'pd-' + id; di.value = d.d; di.max = today;
        di.addEventListener('change', () => { d.d = di.value; drawVerdict(it); });
        di.addEventListener('input', () => { d.d = di.value; drawVerdict(it); });
        f.appendChild(field('Date seen', di, 'pd-' + id + '-err'));
        const sl = el('label', 'check'), sc = el('input'); sc.type = 'checkbox'; sc.id = 'pa-' + id; sc.checked = d.sale;
        sc.addEventListener('change', () => { d.sale = sc.checked; drawVerdict(it); });
        sl.append(sc, el('span', null, 'This is a sale or special offer'));
        f.appendChild(sl);
        // the answer
        const v = el('div', 'verdict'); v.id = 'pv-' + id; v.setAttribute('aria-live', 'polite');
        f.appendChild(v);
        const rb = el('div', 'row-btns');
        rb.appendChild(btn(eid ? 'Save changes' : 'Save price', 'primary save-p', () => savePrice(it)));
        if (eid) rb.appendChild(btn('Cancel', 'secondary', () => cancelEdit(it)));
        f.appendChild(rb);
        f.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); savePrice(it); } });
        return f;
    }
    function itemBox(it) {
        const a = C.analyse(it, today), box = el('article', 'item'), id = it.id;
        box.dataset.id = id;
        const top = el('div', 'i-top');
        const h = el('h2', 'i-name', it.name); h.id = 'ih-' + id;
        top.append(h, el('span', 'tag', 'per ' + C.PER[it.per].word));
        box.setAttribute('aria-labelledby', h.id);
        box.appendChild(top);
        if (!a.best) box.appendChild(p('i-empty', 'No prices yet. Note the first one below.'));
        else {
            const res = el('div', 'best');
            res.appendChild(p('r-label', a.ties.length > 1 ? 'Cheapest now (same price at ' + a.ties.length + ' shops)' : 'Cheapest now'));
            res.appendChild(p('r-big', a.ties.map(r => C.shopName(state, r.s)).join(', ')));
            res.appendChild(p('r-line', C.priceText(a.best.e, state.cur, LOC) + ' · ' + C.perText(a.best.up, it.per, state.cur, LOC)));
            res.appendChild(p('r-note', 'Seen ' + date(a.best.e.d) + ' (' + C.ago(a.best.age) + ')' + (a.best.e.sale ? ', sale price' : '') + (a.best.old ? '. Old price: it may have changed.' : '')));
            if (a.rows.length === 1) res.appendChild(p('r-note', 'Only one shop so far. Note a price at another shop to compare.'));
            box.appendChild(res);
            if (a.rows.length > 1) {
                const list = el('div', 's-list'); list.setAttribute('role', 'list'); list.setAttribute('aria-label', 'Newest price at each shop, cheapest first');
                a.rows.forEach(r => {
                    const row = el('div', 's-row' + (r.cheapest ? ' cheapest' : '')); row.setAttribute('role', 'listitem');
                    const l = el('div', 's-l');
                    const nm = p('s-name'); nm.appendChild(document.createTextNode(C.shopName(state, r.s) + ' '));
                    if (r.e.sale) nm.appendChild(el('span', 'tag sale', 'sale'));
                    l.append(nm, p('s-what', C.priceText(r.e, state.cur, LOC) + ' · ' + C.perText(r.up, it.per, state.cur, LOC)));
                    let note = date(r.e.d) + ' (' + C.ago(r.age) + ')';
                    if (r.change !== null) note += r.change === 0 ? ', same as before' : ', ' + (r.change > 0 ? 'up ' : 'down ') + C.pctText(r.change) + ' since ' + date(r.prev.d);
                    l.appendChild(p('s-when', note));
                    if (r.old) l.appendChild(p('s-old', 'Old price: it may have changed.'));
                    row.appendChild(l);
                    row.appendChild(p('s-diff' + (r.cheapest ? ' good' : ''), r.cheapest ? 'Cheapest' : '+' + C.pctText(r.pct)));
                    list.appendChild(row);
                });
                box.appendChild(list);
            }
        }
        box.appendChild(priceForm(it));
        const msg = el('div', 'msg'); msg.id = 'pm-' + id; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
        box.appendChild(msg);
        // every price
        if (it.entries.length) {
            const hist = el('div', 'hist');
            const open = !!showAll[id];
            const tg = btn((open ? 'Hide all prices' : 'All prices') + ' (' + it.entries.length + ')', 'link', () => { showAll[id] = !open; render(); });
            tg.setAttribute('aria-expanded', String(open));
            hist.appendChild(tg);
            if (open) {
                const list = el('div', 'h-list');
                it.entries.slice().sort((x, y) => x.d !== y.d ? (x.d < y.d ? 1 : -1) : y.n - x.n).forEach(e => {
                    const row = el('div', 'h-row' + (editEntry[id] === e.id ? ' editing' : ''));
                    const l = el('div', 'h-l');
                    l.appendChild(p('h-when', date(e.d) + ' · ' + C.shopName(state, e.s) + (e.sale ? ' · sale' : '')));
                    l.appendChild(p('h-what', C.priceText(e, state.cur, LOC) + ' · ' + C.perText(C.unitPrice(e, it.per), it.per, state.cur, LOC)));
                    const b = el('div', 'h-btns');
                    b.append(btn('Edit', 'secondary small', () => startEdit(it, e), 'Edit the price of ' + date(e.d) + ' at ' + C.shopName(state, e.s)),
                        btn('Delete', 'secondary small danger-t', () => deleteEntry(it, e), 'Delete the price of ' + date(e.d) + ' at ' + C.shopName(state, e.s)));
                    row.append(l, b);
                    list.appendChild(row);
                });
                hist.appendChild(list);
            }
            box.appendChild(hist);
        }
        const ib = el('div', 'i-btns');
        ib.append(btn('Change item', 'secondary', () => { fillForm(it); render(); $('add').scrollIntoView({ block: 'start' }); $('f-name').focus(); }, 'Change ' + it.name),
            btn('Delete item', 'secondary danger-t', () => {
                lastWhere = 'top-msg';
                if (editing === id) resetForm();
                change(() => { state.items = state.items.filter(x => x.id !== id); }, 'top-msg', 'Deleted ' + it.name + (it.entries.length ? ' and its ' + it.entries.length + (it.entries.length === 1 ? ' price' : ' prices') : '') + '.');
            }, 'Delete ' + it.name));
        box.appendChild(ib);
        return box;
    }

    // ---------- where to buy ----------
    function drawPlan() {
        const g = C.plan(state, today), list = $('plan-list');
        list.textContent = '';
        $('plan').hidden = !g.length;
        g.forEach(x => {
            const s = el('div', 'pl-shop');
            s.appendChild(el('h3', null, x.name + ' (' + x.items.length + (x.items.length === 1 ? ' item' : ' items') + ')'));
            const ul = el('ul');
            x.items.forEach(i => {
                const li = el('li');
                li.appendChild(el('b', null, i.item.name));
                li.appendChild(document.createTextNode(': ' + C.priceText(i.row.e, state.cur, LOC) + ' (' + C.perText(i.row.up, i.item.per, state.cur, LOC) + ')'));
                const notes = [];
                if (i.tie.length) notes.push('same at ' + i.tie.join(', '));
                if (i.only) notes.push('only one shop checked');
                if (i.row.old) notes.push('old price');
                if (notes.length) li.appendChild(el('span', 'pl-note', ' ' + notes.join(', ')));
                ul.appendChild(li);
            });
            s.appendChild(ul);
            list.appendChild(s);
        });
        $('plan-mail').href = 'mailto:?subject=' + encodeURIComponent('Where to buy groceries') + '&body=' + encodeURIComponent(C.planText(state, today, LOC));
    }

    // ---------- shops ----------
    function drawShops() {
        const list = $('shop-list');
        list.textContent = '';
        $('shops-box').hidden = !state.shops.length;
        state.shops.forEach(s => {
            const n = state.items.reduce((t, it) => t + it.entries.filter(e => e.s === s.id).length, 0);
            const row = el('div', 'shop-row');
            if (renaming === s.id) {
                const i = input('rn-' + s.id, s.name, 'e.g. Metro', null, 40);
                const f = field('New name for ' + s.name, i, 'rn-' + s.id + '-err');
                const b = el('div', 'row-btns');
                const go = () => {
                    const name = C.cleanName(i.value, 40);
                    if (!name) { setErr('rn-' + s.id, 'Type a name.'); i.focus(); return; }
                    if (state.shops.some(x => x.id !== s.id && C.same(x.name, name))) { setErr('rn-' + s.id, 'You already have a shop called ' + name + '.'); i.focus(); return; }
                    renaming = null; lastWhere = 'tools-msg';
                    change(() => { s.name = name; }, 'tools-msg', 'Renamed to ' + name + '.');
                };
                i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') { renaming = null; render(); } });
                b.append(btn('Save name', 'primary', go), btn('Cancel', 'secondary', () => { renaming = null; render(); }));
                row.classList.add('editing');
                row.append(f, b);
                list.appendChild(row);
                setTimeout(() => { if ($('rn-' + s.id) && document.activeElement !== i) i.focus(); }, 0);
                return;
            }
            const l = el('div', 'h-l');
            l.append(p('h-when', s.name), p('h-what', n === 1 ? '1 price' : n + ' prices'));
            const b = el('div', 'h-btns');
            b.append(btn('Rename', 'secondary small', () => { renaming = s.id; render(); }, 'Rename ' + s.name),
                btn('Delete', 'secondary small danger-t', () => {
                    lastWhere = 'tools-msg';
                    Object.keys(drafts).forEach(k => { if (drafts[k] && drafts[k].s === s.id) drafts[k] = null; });
                    Object.keys(editEntry).forEach(k => { if (editEntry[k]) { editEntry[k] = null; drafts[k] = null; } });
                    change(() => { state.shops = state.shops.filter(x => x.id !== s.id); state.items.forEach(it => { it.entries = it.entries.filter(e => e.s !== s.id); }); if (state.last === s.id) state.last = ''; },
                        'tools-msg', 'Deleted ' + s.name + (n ? ' and its ' + (n === 1 ? '1 price' : n + ' prices') : '') + '.');
                }, 'Delete ' + s.name));
            row.append(l, b);
            list.appendChild(row);
        });
    }

    // ---------- the whole page ----------
    function filterList() {
        const q = C.cleanName($('find').value, 60).toLocaleLowerCase();
        let shown = 0;
        document.querySelectorAll('#i-list .item').forEach(b => {
            const it = itemById(b.dataset.id), hit = !q || (it && it.name.toLocaleLowerCase().includes(q));
            b.hidden = !hit; if (hit) shown++;
        });
        const none = $('find-none');
        none.hidden = !q || shown > 0;
        none.textContent = '';
        if (q && !shown) {
            none.appendChild(document.createTextNode('No item called "' + $('find').value.trim() + '". '));
            none.appendChild(btn('Add it as a new item', 'link inline', () => { resetForm(); $('f-name').value = C.cleanName($('find').value, 60); render(); $('add').scrollIntoView({ block: 'start' }); $('f-per').focus(); }));
        }
    }
    function render() {
        // keep the focus on the same field when the page is drawn again
        const focusId = document.activeElement && document.activeElement.id;
        const list = $('i-list');
        list.textContent = '';
        sorted().forEach(it => list.appendChild(itemBox(it)));
        state.items.forEach(it => drawVerdict(it));
        $('items').hidden = !state.items.length && !(flash && flash.where === 'top-msg');
        $('find-box').hidden = state.items.length < 4;
        if ($('find-box').hidden) $('find').value = '';
        filterList();
        $('intro').hidden = !!state.items.length;
        $('add-h').textContent = editing ? 'Change ' + (itemById(editing) ? itemById(editing).name : 'item') : state.items.length ? 'Add another item' : 'Add an item';
        $('add-intro').hidden = !!editing;
        $('quick').hidden = !!editing;
        $('f-per-hint').textContent = editing && itemById(editing) && itemById(editing).entries.length ? 'Its saved prices are ' + ({ w: 'weights', v: 'liquids', c: 'counted items' })[C.PER[itemById(editing).per].k] + ', so only those choices are shown.' : 'Packs of different sizes are compared by this price, so a 5 L tin and a 1 L bottle are fair to compare.';
        $('f-save').textContent = editing ? 'Save changes' : 'Add item';
        $('f-cancel').hidden = !editing;
        $('restore-first').hidden = !!state.items.length || !!editing;
        $('del-all').hidden = !state.items.length && !state.shops.length;
        $('backup').disabled = !state.items.length && !state.shops.length;
        drawPlan();
        drawShops();
        ['top-msg', 'add-msg', 'tools-msg', 'plan-msg'].forEach(id => { $(id).textContent = ''; $(id).className = 'msg'; });
        if (flash) {
            showMsg($(flash.where) || $('top-msg'), flash.text, flash.undo && undoSnap, flash.bad);
            flash = null;
        }
        if (focusId && $(focusId) && document.activeElement !== $(focusId) && /^(ps|pn|pc|pq|pu|pk|pd|pa)-/.test(focusId)) $(focusId).focus();
    }

    // ---------- backup ----------
    function backup() {
        download('grocery-prices-' + today + '.json', 'application/json', JSON.stringify({ app: SLUG, saved: today, state }, null, 1));
        flash = { where: 'tools-msg', text: 'Backup file saved to your downloads.' }; render();
    }
    function restore(file) {
        const where = state.items.length ? 'tools-msg' : 'add-msg';
        if (!file) return;
        if (file.size > 5e6) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let s = null;
            try { const j = JSON.parse(rd.result); s = C.cleanState(j && j.state ? j.state : j); } catch (e) { s = null; }
            if (!s) { flash = { where, text: 'That file is not a backup from this app.', bad: true }; render(); return; }
            resetForm(); drafts = {}; editEntry = {};
            lastWhere = where;
            change(() => { state = s; state.last = ''; }, where, 'Restored ' + s.items.length + (s.items.length === 1 ? ' item' : ' items') + ' and ' + s.shops.length + (s.shops.length === 1 ? ' shop' : ' shops') + '.');
            $('cur').value = state.cur;
        };
        rd.onerror = () => { flash = { where, text: 'Could not read that file.', bad: true }; render(); };
        rd.readAsText(file);
    }

    // ---------- wire up ----------
    function init() {
        load();
        fillCur();
        const top = el('div', 'msg'); top.id = 'top-msg'; top.setAttribute('role', 'status'); top.setAttribute('aria-live', 'polite');
        $('items').insertBefore(top, $('find-box'));
        resetForm();
        document.querySelectorAll('#quick .chip').forEach(c => c.addEventListener('click', () => { $('f-name').value = c.dataset.name; $('f-per').value = c.dataset.per; setErr('f-name', ''); $('f-save').focus(); }));
        $('f-save').addEventListener('click', saveItem);
        $('f-cancel').addEventListener('click', () => { const id = editing; resetForm(); render(); const b = document.querySelector('[data-id="' + id + '"]'); if (b) b.scrollIntoView({ block: 'start' }); });
        $('f-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveItem(); });
        $('find').addEventListener('input', filterList);
        $('cur').addEventListener('change', () => { state.cur = $('cur').value; save(); render(); });
        $('plan-copy').addEventListener('click', () => copyText(C.planText(state, today, LOC), 'plan-msg'));
        $('backup').addEventListener('click', backup);
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-first').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => { restore(e.target.files[0]); e.target.value = ''; });
        $('del-all').addEventListener('click', () => { resetForm(); drafts = {}; editEntry = {}; renaming = null; lastWhere = 'tools-msg'; change(() => { const c = state.cur; state = C.emptyState(); state.cur = c; state.last = ''; }, 'tools-msg', 'Deleted every item, shop and price.'); });
        if (!canSave) $('store-warn').hidden = false;
        render();
        // a new day while the page stays open
        setInterval(() => { const t = C.localDay(new Date()); if (t !== today) { Object.values(drafts).forEach(d => { if (d && d.d === today) d.d = t; }); today = t; render(); } }, 60000);
        if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
