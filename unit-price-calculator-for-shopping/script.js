// Page code: draws the pack boxes, reads what is typed, shows the answer.
(function () {
    'use strict';
    const C = window.UnitPriceCore, KEY = 'unit-price-calculator-for-shopping.state';
    const $ = id => document.getElementById(id);
    const URL_APP = 'https://umar8092.github.io/apps/unit-price-calculator-for-shopping/';
    const UNIT_GROUPS = [
        ['Weight', [['g', 'g'], ['kg', 'kg'], ['oz', 'oz'], ['lb', 'lb']]],
        ['Liquid', [['ml', 'ml'], ['cl', 'cl'], ['l', 'L (litre)'], ['floz', 'fl oz (US)'], ['flozuk', 'fl oz (UK)'], ['pt', 'pint (UK)'], ['ptus', 'pint (US)'], ['gal', 'gallon (US)']]],
        ['Length', [['m', 'm'], ['ft', 'ft'], ['yd', 'yd']]],
        ['Count', [['item', 'items (pieces, rolls, sheets, tablets)']]]
    ];
    const ERR = {
        price: { blank: 'Type the price.', nan: 'The price should be a number, like 2.49.', negative: 'The price cannot be below 0.', zero: 'The price must be more than 0.', big: 'That price is too big.' },
        size: { blank: 'Type the size from the label.', nan: 'The size should be a number, like 500.', negative: 'The size cannot be below 0.', zero: 'The size must be more than 0.', big: 'That size is too big. Pick a bigger unit.' },
        count: { whole: 'How many should be a whole number, like 6.', negative: 'How many cannot be below 1.', zero: 'How many must be at least 1.', big: 'At most 10,000 in one pack.' }
    };

    let state, saving = true, undo = null;
    function load() {
        try { const raw = localStorage.getItem(KEY); return C.clean(raw ? JSON.parse(raw) : null); } catch (e) { return C.clean(null); }
    }
    function save() {
        if (!saving) return;
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { saving = false; say('tools-msg', 'Your browser is blocking storage, so this will not be kept after you close the page.'); }
    }
    function el(tag, props, kids) {
        const e = document.createElement(tag);
        Object.keys(props || {}).forEach(k => { if (k === 'text') e.textContent = props[k]; else if (k in e && k !== 'list') e[k] = props[k]; else e.setAttribute(k, props[k]); });
        (kids || []).forEach(k => k && e.appendChild(k));
        return e;
    }
    function say(id, text, undoFn) {
        const m = $(id); m.textContent = text;
        if (undoFn) { const b = el('button', { type: 'button', text: 'Undo' }); b.onclick = () => { undoFn(); m.textContent = ''; }; m.appendChild(b); }
    }
    function snapshot() { return JSON.parse(JSON.stringify(state)); }

    // --- the pack boxes ---
    function unitSelect(it) {
        const s = el('select', { id: 'unit-' + it.id, 'aria-label': 'Unit' });
        UNIT_GROUPS.forEach(([g, list]) => { const og = el('optgroup', { label: g }); list.forEach(([v, t]) => og.appendChild(el('option', { value: v, text: t }))); s.appendChild(og); });
        s.value = it.unit;
        s.addEventListener('change', () => { it.unit = s.value; changed(); });
        return s;
    }
    function field(it, key, label, attrs, wrap) {
        const id = key + '-' + it.id;
        const input = el('input', Object.assign({ id, type: 'text', autocomplete: 'off', value: it[key] }, attrs));
        input.addEventListener('input', () => { it[key] = input.value; changed(); });
        const lab = el('label', { htmlFor: id, text: label });
        return [lab, wrap ? wrap(input) : input, el('p', { className: 'err', id: 'e' + key + '-' + it.id, role: 'alert' })];
    }
    function moneyWrap(input) { return el('div', { className: 'money' }, [el('span', { className: 'sym', 'aria-hidden': 'true', text: state.cur }), input]); }

    function drawItems(focusId) {
        const ol = $('items'); ol.textContent = '';
        state.items.forEach((it, i) => {
            const letter = String.fromCharCode(65 + i);
            const title = el('span', { className: 'i-title', id: 'title-' + it.id, text: it.name.trim() || 'Item ' + letter });
            const rm = el('button', { type: 'button', className: 'rm', text: 'Remove', 'aria-label': 'Remove ' + (it.name.trim() || 'item ' + letter) });
            rm.onclick = () => removeItem(it.id);
            const head = el('div', { className: 'i-head' }, [el('span', { className: 'badge', 'aria-hidden': 'true', text: letter }), title, state.items.length > 1 ? rm : null]);
            const kids = [head];
            if (it.named) {
                const [l, inp, e] = field(it, 'name', 'Name (optional)', { maxLength: C.MAX_NAME, placeholder: 'e.g. Big bag' });
                inp.addEventListener('input', () => { title.textContent = it.name.trim() || 'Item ' + letter; });
                kids.push(el('div', { className: 'name-row' }, [l, inp, e]));
            }
            const [pl, pi, pe] = field(it, 'price', 'Price', { inputMode: 'decimal', maxLength: 20, placeholder: 'e.g. 2.49' }, moneyWrap);
            const [sl, si, se] = field(it, 'size', it.pack ? 'Size of one' : 'Size', { inputMode: 'decimal', maxLength: 20, placeholder: 'e.g. 500' });
            kids.push(el('div', { className: 'two' }, [el('div', {}, [pl, pi, pe]), el('div', {}, [sl, el('div', { className: 'size-row' }, [si, unitSelect(it)]), se])]));
            if (it.pack) {
                const [cl, ci, ce] = field(it, 'count', 'How many in the pack', { inputMode: 'numeric', maxLength: 6, placeholder: 'e.g. 6' });
                const hint = el('p', { className: 'hint', text: 'For 6 × 330 ml type 330 ml as the size and 6 here. For "3 for 5.00", type 5.00 as the price and 3 here.' });
                kids.push(el('div', { className: 'pack-row' }, [cl, ci, ce, hint]));
            }
            const links = el('div', { className: 'i-links' });
            if (!it.named) { const b = el('button', { type: 'button', className: 'link small', text: '+ Add a name (optional)' }); b.onclick = () => { it.named = true; save(); drawItems('name-' + it.id); }; links.appendChild(b); }
            if (!it.pack) { const b = el('button', { type: 'button', className: 'link small', text: '+ It is a multipack or multi-buy (optional)' }); b.onclick = () => { it.pack = true; save(); drawItems('count-' + it.id); }; links.appendChild(b); }
            else { const b = el('button', { type: 'button', className: 'link small', text: 'Not a multipack' }); b.onclick = () => { it.pack = false; it.count = ''; changed(); drawItems('size-' + it.id); }; links.appendChild(b); }
            kids.push(links);
            kids.push(el('p', { className: 'i-out', id: 'out-' + it.id, 'aria-live': 'polite' }));
            ol.appendChild(el('li', { className: 'item', id: 'item-' + it.id }, kids));
        });
        $('add-item').hidden = state.items.length >= C.MAX_ITEMS;
        $('intro').hidden = state.items.some(it => it.price || it.size);
        update();
        if (focusId && $(focusId)) $(focusId).focus();
    }

    function addItem() {
        if (state.items.length >= C.MAX_ITEMS) return;
        const last = state.items[state.items.length - 1];
        const it = C.blankItem(last ? last.unit : 'g');
        state.items.push(it); save(); say('items-msg', ''); drawItems('price-' + it.id);
    }
    function removeItem(id) {
        const before = snapshot(), i = state.items.findIndex(x => x.id === id);
        if (i < 0) return;
        const label = state.items[i].name.trim() || 'Item ' + String.fromCharCode(65 + i);
        state.items.splice(i, 1);
        if (!state.items.length) state.items.push(C.blankItem());
        save(); drawItems();
        say('items-msg', label + ' removed.', () => { state = C.clean(before); save(); drawItems(); });
        const b = $('items-msg').querySelector('button'); if (b) b.focus();
    }

    // --- the answer ---
    let last = null;
    function changed() { save(); update(); }
    function update() {
        $('intro').hidden = state.items.some(it => it.price || it.size);
        let res = C.compare(state.items);
        if (res.kind && state.per[res.kind]) res = C.compare(state.items, state.per[res.kind]);
        last = res;
        const sym = state.cur;
        res.items.forEach(it => {
            const id = state.items[it.index].id, out = $('out-' + id);
            const raw = state.items[it.index];
            ['price', 'size', 'count'].forEach(k => {
                const e = $('e' + k + '-' + id); if (!e) return;
                const code = it.errors && it.errors[k];
                // a blank box only complains once something else in the pack is typed
                const show = code && !(code === 'blank' && !(raw.price || raw.size));
                e.textContent = show ? ERR[k][code] : '';
                const inp = $(k + '-' + id); if (inp) inp.setAttribute('aria-invalid', show ? 'true' : 'false');
            });
            const t = $('title-' + id); if (t) t.textContent = it.label;
            if (!out) return;
            out.className = 'i-out';
            if (!it.ok) { out.textContent = raw.price || raw.size ? 'Not compared yet.' : 'Type the price and size.'; out.classList.add('wait'); return; }
            if (res.other.includes(it)) { out.textContent = 'Not compared: this is ' + C.KIND_WORD[it.kind] + ', the first pack is ' + C.KIND_WORD[res.kind] + '. Change the unit.'; out.classList.add('bad'); return; }
            out.textContent = '= ' + C.perText(res, it.unitPrice, sym) + (it.cheapest && res.ranked.length > 1 ? ' · cheapest' : '');
            if (it.cheapest && res.ranked.length > 1) out.classList.add('best');
        });
        // per select
        const perBox = $('per-box'), per = $('per');
        perBox.hidden = !res.kind;
        if (res.kind) {
            const want = C.perList(res.kind).map(p => p[0]).join();
            if (per.dataset.list !== want) { per.textContent = ''; C.perList(res.kind).forEach(p => per.appendChild(el('option', { value: p[0], text: 'per ' + p[2] }))); per.dataset.list = want; }
            per.value = res.per.key; per.dataset.kind = res.kind;
        }
        // verdict
        const v = C.verdict(res, sym), ranked = $('ranked'), notes = $('notes');
        ranked.textContent = ''; notes.textContent = '';
        $('verdict').className = v ? (v.single || v.tie ? 'plain' : 'win') : '';
        if (!v) {
            const filled = state.items.filter(it => it.price || it.size).length;
            $('v-head').textContent = filled ? 'Finish filling in the packs.' : 'Fill in two packs to compare.';
            $('v-sub').textContent = 'Each needs a price and a size.';
        } else {
            $('v-head').textContent = v.head; $('v-sub').textContent = v.sub;
            if (res.ranked.length > 1) res.ranked.forEach((it, i) => {
                const top = el('div', { className: 'r-top' }, [el('span', { className: 'r-rank', text: String(i + 1) }), el('b', { className: 'r-name', text: it.label }),
                    el('span', { className: 'r-per', text: C.perText(res, it.unitPrice, sym) })]);
                const kids = [top, el('p', { className: 'r-line', text: C.sizeText(it) + ' for ' + C.fmtCents(it.cents, sym) })];
                if (it.cheapest) kids.push(el('p', { className: 'r-tag best', text: v.tie ? 'Same price per ' + res.per.label : 'Cheapest' }));
                else { kids.push(el('p', { className: 'r-tag more', text: C.moreText(res, it, sym) })); kids.push(el('p', { className: 'r-same', text: C.sameAmountText(res, it, sym) })); }
                ranked.appendChild(el('li', { className: 'r-item' + (it.cheapest ? ' best' : '') }, kids));
            });
        }
        res.other.forEach(it => notes.appendChild(el('li', { className: 'bad', text: it.label + ' is not compared: it is measured as ' + C.KIND_WORD[it.kind] + ', the others as ' + C.KIND_WORD[res.kind] + '. Change its unit.' })));
        const waiting = res.skipped.filter(it => state.items[it.index].price || state.items[it.index].size);
        if (v && waiting.length) notes.appendChild(el('li', { text: 'Not compared yet: ' + waiting.map(it => it.label).join(', ') + '. Finish its price and size.' }));
        const text = C.summaryText(res, sym);
        $('copy').disabled = !text;
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('Which is cheaper?') + '&body=' + encodeURIComponent((text || 'Compare unit prices') + '\n\n' + URL_APP);
    }

    // --- events ---
    $('add-item').addEventListener('click', addItem);
    $('per').addEventListener('change', () => { const k = $('per').dataset.kind; if (k) { state.per[k] = $('per').value; save(); update(); } });
    $('cur').addEventListener('change', () => { state.cur = $('cur').value; save(); document.querySelectorAll('.money .sym').forEach(s => { s.textContent = state.cur; }); update(); });
    $('restart').addEventListener('click', () => {
        const before = snapshot();
        state.items = [C.blankItem(), C.blankItem()]; save(); drawItems();
        say('tools-msg', 'Started over. Every pack was cleared.', () => { state = C.clean(before); save(); drawItems(); });
        const b = $('tools-msg').querySelector('button'); if (b) b.focus();
    });
    $('demo').addEventListener('click', () => {
        state.items = [
            Object.assign(C.blankItem('g'), { name: 'Small bag', named: true, price: '2.49', size: '500' }),
            Object.assign(C.blankItem('kg'), { name: 'Big bag', named: true, price: '5.29', size: '1.2' }),
            Object.assign(C.blankItem('g'), { name: '4-pack', named: true, price: '4.60', size: '250', count: '4', pack: true })
        ];
        save(); drawItems();
        say('items-msg', 'Example loaded: three packs of rice. Change any number, or tap Start over.');
    });
    $('copy').addEventListener('click', async () => {
        const text = C.summaryText(last, state.cur) + '\n' + URL_APP;
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea', { value: text }); document.body.appendChild(t); t.select();
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        }
        say('tools-msg', ok ? 'Copied. Paste it into a message or a note.' : 'Could not copy. Your browser blocked it.');
    });

    state = load();
    $('cur').value = state.cur;
    drawItems();
    save();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
