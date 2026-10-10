// Page code for Recipe Scaler and Unit Converter. The maths lives in core.js (RecipeCore).
(function () {
    const C = window.RecipeCore, KEY = 'recipe-scaler-and-unit-converter.state', RKEY = 'recipe-scaler-and-unit-converter.recipes';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const newId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const EXAMPLE = {
        name: 'Fluffy pancakes', from: '4', to: '7', showMethod: true,
        ingredients: '1 1/2 cups all-purpose flour\n3 1/2 tsp baking powder\n1 tbsp sugar\n1/4 tsp salt\n1 1/4 cups milk\n1 egg\n3 tbsp butter, melted\nMaple syrup, to serve',
        method: 'Mix the flour, baking powder, sugar and salt.\nWhisk in the milk, egg and melted butter until smooth.\nHeat a griddle to 375°F and cook 1/4 cup of batter per pancake until bubbles form, then flip.'
    };

    let canSave = true, gone = null, lastText = '', lastTitle = '';
    let draft = load(KEY, C.cleanDraft, {});
    let saved = load(RKEY, C.cleanSaved, []);

    function load(key, clean, empty) {
        try { const raw = localStorage.getItem(key); return clean(raw ? JSON.parse(raw) : empty); } catch (e) { return clean(empty); }
    }
    function store() {
        try { localStorage.setItem(KEY, JSON.stringify(draft)); localStorage.setItem(RKEY, JSON.stringify(saved)); }
        catch (e) { if (canSave) { canSave = false; say($('recipe-msg'), 'This browser is not saving (private mode or storage blocked). Everything works until you close the page.'); } }
    }
    function say(box, text, undo) {
        box.textContent = text;
        if (undo) {
            const b = el('button', null, 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { undo(); box.textContent = ''; });
            box.appendChild(b);
        }
    }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const copyOf = o => JSON.parse(JSON.stringify(o));

    // put the saved draft into the boxes
    function fill() {
        $('ing').value = draft.ingredients;
        $('method').value = draft.method;
        $('from').value = draft.from;
        $('to').value = draft.to;
        $('sys').value = draft.sys;
        document.querySelector('input[name=mode][value="' + draft.mode + '"]').checked = true;
        $('method-box').hidden = !draft.showMethod;
        $('add-method').hidden = draft.showMethod;
    }

    function servingsError(r, label) {
        if (r.err === 'zero' || r.err === 'negative') return '"' + label + '" must be more than 0.';
        if (r.err === 'big') return '"' + label + '" can be up to 10,000.';
        return 'Type "' + label + '" as a number, for example 4 or 2.5.';
    }

    // ---- the scale factor and its message
    function scale() {
        const f = C.parseServings(draft.from), t = C.parseServings(draft.to);
        const errs = [];
        if (f.err) errs.push(servingsError(f, 'The recipe makes'));
        if (t.err) errs.push(servingsError(t, 'I want to make'));
        if (errs.length) return { factor: C.R(1), err: errs.join(' '), meta: 'Showing the recipe as it is until the numbers are fixed.' };
        if (f.blank && t.blank) return { factor: C.R(1), meta: 'Same amounts as the recipe. Fill in "How much to make" to scale it.' };
        if (f.blank) return { factor: C.R(1), meta: 'Type what "The recipe makes" too, to scale it.' };
        if (t.blank) return { factor: C.R(1), meta: 'Type what you want to make, to scale it.' };
        const factor = C.div(t.r, f.r), v = C.num(factor);
        if (v > 1000 || v < 0.001) return { factor: C.R(1), err: 'That is more than 1,000 times bigger or smaller than the recipe. Check the two numbers.', meta: 'Showing the recipe as it is until the numbers are fixed.' };
        const fromT = C.numText(f.r), toT = C.numText(t.r);
        return { factor, ok: true, meta: v === 1 ? 'Same amounts: the recipe already makes ' + toT + '.' : 'For ' + toT + ' instead of ' + fromT + '.' };
    }

    const WHY = { none: 'No amount, kept as written', pinch: 'Kept as written', step: 'Looks like a step, kept as written', temp: 'Kept as written' };

    // ---- draw everything
    function render() {
        const s = scale(), mode = draft.mode;
        const lines = C.scaleRecipe(draft.ingredients, s.factor, mode, draft.sys);
        const changed = s.ok && C.num(s.factor) !== 1 || mode !== 'same';
        $('intro').hidden = !!draft.ingredients.trim();
        $('scale-err').textContent = s.err || '';
        $('r-factor').textContent = C.factorText(s.factor);
        $('r-meta').textContent = s.meta;
        $('res-h').textContent = draft.name || 'Scaled recipe';
        document.querySelectorAll('.chips button').forEach(b => {
            const f = C.parseServings(draft.from), t = C.parseServings(draft.to);
            b.setAttribute('aria-pressed', String(!!(f.r && t.r && Math.abs(C.num(t.r) / C.num(f.r) - Number(b.dataset.x)) < 1e-9)));
        });

        const ul = $('lines'); ul.textContent = '';
        lines.forEach(p => {
            if (p.kind === 'heading') { ul.appendChild(el('li', 'line head', p.text)); return; }
            if (p.kind !== 'amount') {
                const li = el('li', 'line plain', p.out);
                if (changed) li.appendChild(el('span', 'was', WHY[p.why] || WHY.pinch));
                ul.appendChild(li); return;
            }
            const li = el('li', 'line');
            if (p.pre && !p.mid) { li.appendChild(document.createTextNode(p.pre + ' ')); li.appendChild(el('span', 'amt', p.amt)); }
            else {
                if (p.mid) li.appendChild(document.createTextNode(p.pre + ' '));
                li.appendChild(el('span', 'amt', p.amt));
                if (p.restOut) li.appendChild(document.createTextNode(' ' + p.restOut));
            }
            if (changed) li.appendChild(el('span', 'was', 'Recipe says: ' + C.wasText(p)));
            if (p.hint) li.appendChild(el('span', 'tip', p.hint));
            ul.appendChild(li);
        });
        $('lines-empty').hidden = lines.length > 0;

        const method = draft.showMethod ? C.methodLines(draft.method) : [];
        const ol = $('method-list'); ol.textContent = '';
        method.forEach(m => ol.appendChild(el('li', null, m.replace(/^\d+[.)]\s*/, ''))));
        $('method-out').hidden = !method.length;

        const notes = $('notes'); notes.textContent = '';
        if (lines.some(p => p.approx)) notes.appendChild(el('li', null, '≈ means it was turned between cups and grams using a typical weight for that ingredient.'));
        if (s.ok && C.num(s.factor) !== 1 && lines.length) notes.appendChild(el('li', null, 'Cooking times are not scaled. A bigger batch may need a few more minutes and a smaller one less, so check it is done the usual way.'));
        if (draft.ingredients.split(/\r?\n/).length > 300) notes.appendChild(el('li', null, 'Only the first 300 lines are shown.'));

        // share
        const title = (draft.name || 'Recipe') + (s.ok && C.num(s.factor) !== 1 ? ' for ' + C.numText(C.parseServings(draft.to).r) : '');
        const modeName = { same: 'Amounts as written', metric: 'Amounts in grams and ml', us: 'Amounts in cups and spoons' }[mode];
        const sub = (s.ok && C.num(s.factor) !== 1 ? 'Scaled ' + C.factorText(s.factor) + ' (the recipe makes ' + C.numText(C.parseServings(draft.from).r) + '). ' : '') + modeName + '.';
        lastTitle = title;
        lastText = C.recipeText({ title, subtitle: sub, lines, method }) + '\n\nScaled with Recipe Scaler and Unit Converter: https://umar8092.github.io/apps/recipe-scaler-and-unit-converter/';
        let body = lastText;
        if (body.length > 6000) body = body.slice(0, 6000) + '\n\n(Cut short. Use Copy for the whole recipe.)';
        $('mail').href = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
        const empty = !lines.length;
        ['copy', 'print', 'save'].forEach(id => { $(id).disabled = empty; });
        $('mail').setAttribute('aria-disabled', String(empty));
        $('mail').classList.toggle('off', empty);
        $('new').hidden = !draft.ingredients && !draft.method && !draft.from && !draft.to && !draft.name;

        haveOptions();
        renderSaved();
        store();
    }

    // ---- scale to an ingredient I have
    let haveList = [];
    function haveOptions() {
        const sel = $('have-line'), keep = sel.value;
        haveList = C.haveChoices(C.parseRecipe(draft.ingredients));
        sel.textContent = '';
        if (!haveList.length) { const o = el('option', null, 'No ingredients with an amount yet'); o.value = ''; sel.appendChild(o); sel.disabled = true; $('have').disabled = true; $('have-unit').textContent = ''; return; }
        sel.disabled = false; $('have').disabled = false;
        haveList.forEach(({ p }, i) => { const o = el('option', null, p.text.length > 70 ? p.text.slice(0, 68) + '…' : p.text); o.value = p.text; o.dataset.i = i; sel.appendChild(o); });
        if (keep && haveList.some(h => h.p.text === keep)) sel.value = keep;
        const cur = haveList.find(h => h.p.text === sel.value) || haveList[0];
        $('have-unit').textContent = cur.p.unitRaw ? cur.p.unitRaw : (cur.p.pre || cur.p.rest || '').slice(0, 40);
    }
    function useHave() {
        const err = $('have-err'), msg = $('have-msg');
        err.textContent = ''; msg.textContent = '';
        const cur = haveList.find(h => h.p.text === $('have-line').value);
        if (!cur) return;
        const h = C.parseHave($('have').value);
        if (h.blank) return;
        if (h.err) { err.textContent = h.err === 'zero' || h.err === 'negative' ? 'How much you have must be more than 0.' : h.err === 'big' ? 'That is too much to work with.' : 'Type how much you have as a number, for example 2 or 1 1/2.'; return; }
        const f = C.parseServings(draft.from);
        if (!f.r) draft.from = '1';
        const from = C.parseServings(draft.from).r, x = C.div(h.r, cur.p.a), to = C.mul(from, x);
        if (C.num(to) > C.MAX_SERVINGS || C.num(x) > 1000) { err.textContent = 'That is more than 1,000 times the recipe. Check the amount.'; return; }
        if (C.num(to) < 0.01) { err.textContent = 'That is too little to scale to.'; return; }
        draft.to = C.numText(to);
        $('from').value = draft.from; $('to').value = draft.to;
        render();
        msg.textContent = 'That is ' + C.factorText(x) + ' of the recipe, so "I want to make" is now ' + draft.to + '.';
    }

    // ---- My recipes
    function renderSaved() {
        const ul = $('saved'); ul.textContent = '';
        saved.forEach((r, i) => {
            if (gone && gone.index === i) ul.appendChild(goneRow());
            ul.appendChild(recRow(r));
        });
        if (gone && gone.index >= saved.length) ul.appendChild(goneRow());
        $('saved-n').textContent = saved.length ? '(' + saved.length + ')' : '';
        $('saved-empty').hidden = saved.length > 0 || !!gone;
    }
    function recRow(r) {
        const li = el('li', 'rec' + (r.id === draft.id ? ' open' : ''));
        const txt = el('div', 'rec-txt');
        txt.appendChild(el('span', 'rec-name', r.name));
        const n = C.parseRecipe(r.ingredients).filter(p => p.kind !== 'heading').length;
        const f = C.parseServings(r.from);
        txt.appendChild(el('span', 'rec-meta', (f.r ? 'Makes ' + C.numText(f.r) + ' · ' : '') + plural(n, 'ingredient', 'ingredients')));
        li.appendChild(txt);
        const btns = el('div', 'rec-btns');
        const open = el('button', 'open-btn', 'Open'); open.type = 'button'; open.setAttribute('aria-label', 'Open ' + r.name);
        open.addEventListener('click', () => openRecipe(r));
        const del = el('button', null, 'Delete'); del.type = 'button'; del.setAttribute('aria-label', 'Delete ' + r.name);
        del.addEventListener('click', () => {
            const index = saved.indexOf(r); if (index < 0) return;
            saved.splice(index, 1); gone = { index, rec: r };
            render();
            const u = document.querySelector('.rec.gone button'); if (u) u.focus();
        });
        btns.appendChild(open); btns.appendChild(del);
        li.appendChild(btns);
        return li;
    }
    function goneRow() {
        const li = el('li', 'rec gone');
        li.appendChild(el('span', null, 'Deleted "' + gone.rec.name + '".'));
        const b = el('button', null, 'Undo'); b.type = 'button';
        b.addEventListener('click', () => { saved.splice(Math.min(gone.index, saved.length), 0, gone.rec); gone = null; render(); });
        li.appendChild(b);
        return li;
    }
    function openRecipe(r) {
        const before = copyOf(draft);
        draft = C.cleanDraft(r); draft.id = r.id;
        gone = null; fill(); clearHave(); render();
        say($('recipe-msg'), 'Opened "' + r.name + '".', () => { draft = before; fill(); render(); });
        $('recipe-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function saveRecipe() {
        const name = $('name').value.replace(/\s+/g, ' ').trim();
        if (!name) { $('save-err').textContent = 'Type a name for this recipe, for example Sunday pancakes.'; $('name').focus(); return; }
        const same = saved.find(r => r.name.toLowerCase() === name.toLowerCase());
        const rec = Object.assign(C.cleanDraft(draft), { name: name.slice(0, 80), saved: Date.now() });
        if (same) { rec.id = same.id; saved.splice(saved.indexOf(same), 1); }
        else rec.id = newId();
        if (saved.length >= 200) saved.pop();
        saved.unshift(rec);
        draft.name = rec.name; draft.id = rec.id;
        gone = null;
        $('save-box').hidden = true; $('save').hidden = false; $('save-err').textContent = '';
        render();
        say($('result-msg'), (same ? 'Updated "' : 'Saved "') + rec.name + (same ? '" in My recipes.' : '" to My recipes.'));
        $('save').focus();
    }

    function clearHave() { $('have').value = ''; $('have-err').textContent = ''; $('have-msg').textContent = ''; }

    // ---- events
    $('ing').addEventListener('input', () => { draft.ingredients = $('ing').value; render(); });
    $('method').addEventListener('input', () => { draft.method = $('method').value; render(); });
    $('from').addEventListener('input', () => { draft.from = $('from').value; render(); });
    $('to').addEventListener('input', () => { draft.to = $('to').value; $('have-msg').textContent = ''; render(); });
    $('sys').addEventListener('change', () => { draft.sys = $('sys').value; render(); });
    document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { draft.mode = r.value; render(); }));
    document.querySelectorAll('.chips button').forEach(b => b.addEventListener('click', () => {
        const f = C.parseServings(draft.from);
        if (!f.r) { draft.from = '1'; $('from').value = '1'; }
        draft.to = C.numText(C.mul(C.parseServings(draft.from).r, C.readNum(b.dataset.x).r));
        $('to').value = draft.to; $('have-msg').textContent = '';
        render();
    }));
    $('add-method').addEventListener('click', () => { draft.showMethod = true; fill(); render(); $('method').focus(); });
    $('remove-method').addEventListener('click', () => {
        const before = draft.method;
        draft.showMethod = false; draft.method = ''; fill(); render(); $('add-method').focus();
        if (before.trim()) say($('recipe-msg'), 'Method removed.', () => { draft.showMethod = true; draft.method = before; fill(); render(); });
    });
    $('add-have').addEventListener('click', () => { $('have-box').hidden = false; $('add-have').hidden = true; haveOptions(); (haveList.length ? $('have-line') : $('ing')).focus(); });
    $('remove-have').addEventListener('click', () => { $('have-box').hidden = true; $('add-have').hidden = false; clearHave(); $('add-have').focus(); });
    $('have-line').addEventListener('change', () => { haveOptions(); $('have').value = ''; $('have-err').textContent = ''; $('have-msg').textContent = ''; $('have').focus(); });
    $('have').addEventListener('input', useHave);
    $('demo').addEventListener('click', () => {
        const before = copyOf(draft);
        draft = Object.assign(C.cleanDraft(EXAMPLE), { mode: draft.mode, sys: 'us' });
        fill(); render();
        say($('recipe-msg'), 'Example recipe added: it makes 4, scaled for 7.', () => { draft = before; fill(); render(); });
    });
    $('new').addEventListener('click', () => {
        const before = copyOf(draft);
        draft = C.cleanDraft({ mode: draft.mode, sys: draft.sys });
        gone = null; fill(); clearHave(); $('save-box').hidden = true; $('save').hidden = false; $('result-msg').textContent = '';
        render(); $('ing').focus();
        say($('recipe-msg'), 'Started a new recipe. Your saved recipes are still in My recipes.', () => { draft = before; fill(); render(); });
    });
    $('save').addEventListener('click', () => {
        $('save-box').hidden = false; $('save').hidden = true; $('result-msg').textContent = '';
        $('name').value = draft.name || ''; $('save-err').textContent = ''; $('name').focus();
    });
    $('save-ok').addEventListener('click', saveRecipe);
    $('name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveRecipe(); } if (e.key === 'Escape') $('save-cancel').click(); });
    $('save-cancel').addEventListener('click', () => { $('save-box').hidden = true; $('save').hidden = false; $('save-err').textContent = ''; $('save').focus(); });
    $('copy').addEventListener('click', async () => {
        let ok = false;
        try { await navigator.clipboard.writeText(lastText); ok = true; } catch (e) {
            const t = el('textarea'); t.value = lastText; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        }
        say($('result-msg'), ok ? 'Copied. Paste it into a message or your notes.' : 'Could not copy. Select the recipe and copy it by hand.');
    });
    $('mail').addEventListener('click', e => { if ($('mail').classList.contains('off')) { e.preventDefault(); say($('result-msg'), 'Add some ingredients first.'); } });
    $('print').addEventListener('click', () => window.print());

    fill();
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
