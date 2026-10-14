// Weekly Meal Planner with Shopping List: page code. The maths lives in core.js (MealCore).
(function () {
    const C = window.MealCore;
    const KEY = C.SLUG + '.v1';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    // ---- saving
    let state = C.newState(), canSave = true;
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { state = C.sanitize(JSON.parse(raw)); }
            catch (e) { state = C.newState(); flash('week-msg', 'Your saved plan could not be read, so the app started fresh.'); }
        }
        try { localStorage.setItem(KEY + '.test', '1'); localStorage.removeItem(KEY + '.test'); } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canSave = false; $('storage-warn').hidden = false; } }

    // ---- messages with Undo
    let undoState = null;
    function flash(id, text, withUndo) {
        document.querySelectorAll('.msg.show').forEach(m => { if (m.id !== id) { m.textContent = ''; m.classList.remove('show'); } });
        const box = $(id); box.textContent = ''; box.classList.toggle('show', !!text);
        if (!text) return;
        box.appendChild(el('span', null, text + ' '));
        if (withUndo) {
            const b = el('button', 'link inline', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => {
                if (!undoState) return;
                state = C.sanitize(JSON.parse(undoState)); undoState = null; save(); closePick(); closeMealForm(); render();
                flash(id, 'Undone.');
            });
            box.appendChild(b);
        }
    }
    const remember = () => { undoState = JSON.stringify(state); };

    // ---- week being shown
    let today = C.todayIso();
    let weekStart = C.weekStartOf(today, state.settings.weekStart);
    let listFrom = 'all';
    const days = () => C.weekDays(weekStart);
    const mealById = id => state.meals.find(m => m.id === id);

    // ---- whole numbers 1 to 50 for people and portions
    function readWhole(id, errId, what) {
        const v = $(id).value.trim(), n = Number(v);
        let err = '';
        if (!v) err = 'Type how many ' + what + '.';
        else if (/^-/.test(v)) err = 'It cannot be below 1.';
        else if (!/^\d+$/.test(v)) err = 'Use a whole number, such as 4.';
        else if (n < 1) err = 'It must be at least 1.';
        else if (n > C.LIMITS.people) err = 'The most is ' + C.LIMITS.people + '.';
        $(errId).textContent = err; $(id).setAttribute('aria-invalid', err ? 'true' : 'false');
        return err ? null : n;
    }
    document.querySelectorAll('.step').forEach(b => b.addEventListener('click', () => {
        const inp = $(b.dataset.for), n = parseInt(inp.value, 10);
        const v = Math.min(C.LIMITS.people, Math.max(1, (Number.isFinite(n) ? n : 0) + Number(b.dataset.d)));
        inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true }));
    }));

    // ---- the week
    function renderWeek() {
        const ds = days();
        $('week-range').textContent = C.rangeText(ds[0], ds[6]);
        $('this-week').hidden = ds.includes(today);
        if (document.activeElement !== $('people')) $('people').value = state.settings.people;
        const chips = $('slot-chips'); chips.textContent = '';
        for (const [k, name] of C.SLOTS) {
            const b = el('button', 'chip', name); b.type = 'button';
            const on = state.settings.slots.includes(k);
            b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('on', on);
            b.addEventListener('click', () => {
                const s = state.settings.slots;
                if (s.includes(k)) {
                    if (s.length === 1) { flash('week-msg', 'Keep at least one meal time.'); return; }
                    state.settings.slots = s.filter(x => x !== k);
                    const used = days().some(d => (state.plan[d] || []).some(e => e.slot === k));
                    if (used) flash('week-msg', name + ' is hidden on empty weeks, but stays on days that already have a ' + name.toLowerCase() + ' planned.');
                } else state.settings.slots = C.SLOT_KEYS.filter(x => s.includes(x) || x === k);
                save(); render();
            });
            chips.appendChild(b);
        }
        const list = $('days'); list.textContent = '';
        for (const d of ds) {
            const li = el('li', 'day' + (d === today ? ' today' : '') + (d < today ? ' past' : ''));
            li.dataset.date = d;
            const head = el('div', 'day-head');
            head.appendChild(el('h3', 'day-date', C.dateText(d, true)));
            if (d === today) head.appendChild(el('span', 'badge', 'Today'));
            li.appendChild(head);
            const entries = state.plan[d] || [];
            const slots = C.SLOT_KEYS.filter(k => state.settings.slots.includes(k) || entries.some(e => e.slot === k));
            for (const k of slots) {
                const box = el('div', 'slot'); box.dataset.slot = k;
                const mine = entries.filter(e => e.slot === k);
                const row = el('div', 'slot-row');
                row.appendChild(el('span', 'slot-name', C.slotName(k)));
                const body = el('div', 'slot-body');
                const ul = el('ul', 'entries');
                for (const e of mine) ul.appendChild(entryItem(d, e));
                body.appendChild(ul);
                if (mine.length < C.LIMITS.entries) {
                    const add = el('button', 'add-btn', '+ Add ' + C.slotName(k).toLowerCase()); add.type = 'button';
                    add.setAttribute('aria-label', 'Add ' + C.slotName(k).toLowerCase() + ' on ' + C.dateText(d, true));
                    add.addEventListener('click', () => openPick({ date: d, slot: k }, box));
                    body.appendChild(add);
                }
                row.appendChild(body);
                box.appendChild(row);
                li.appendChild(box);
            }
            list.appendChild(li);
        }
        const prevStart = C.addDays(weekStart, -7);
        $('copy-last').disabled = !C.weekDays(prevStart).some(d => (state.plan[d] || []).length);
        $('clear-week').disabled = !ds.some(d => (state.plan[d] || []).length);
    }
    function entryItem(date, e) {
        const li = el('li', 'entry' + (e.meal ? '' : ' note'));
        const m = e.meal && mealById(e.meal);
        const b = el('button', 'entry-btn'); b.type = 'button';
        b.appendChild(el('span', 'e-name', m ? m.name : e.note));
        if (m) {
            b.appendChild(el('span', 'e-ppl', e.people + (e.people === 1 ? ' person' : ' people')));
            if (!C.parseLines(m.ingredients).length) b.appendChild(el('span', 'e-warn', 'No ingredients yet'));
        } else b.appendChild(el('span', 'e-ppl', 'Nothing to buy'));
        b.setAttribute('aria-label', 'Change ' + (m ? m.name : e.note) + ' on ' + C.dateText(date, true));
        b.addEventListener('click', () => openPick({ date, slot: e.slot, id: e.id }, li.closest('.slot')));
        li.appendChild(b);
        const x = el('button', 'x', '×'); x.type = 'button';
        x.setAttribute('aria-label', 'Take ' + (m ? m.name : e.note) + ' off ' + C.dateText(date, true));
        x.addEventListener('click', () => removeEntry(date, e.id));
        li.appendChild(x);
        return li;
    }
    function removeEntry(date, id) {
        const e = (state.plan[date] || []).find(x => x.id === id); if (!e) return;
        remember();
        state.plan[date] = state.plan[date].filter(x => x.id !== id);
        if (!state.plan[date].length) delete state.plan[date];
        save(); closePick(); render();
        flash('week-msg', 'Took ' + C.entryText(state, e).replace(/ \(for \d+\)$/, '') + ' off ' + C.dateText(date, true) + '.', true);
    }

    // ---- the add / change panel
    let pick = null;    // { date, slot, id? }
    function fillMealSelect(sel, current) {
        sel.textContent = '';
        const meals = state.meals.slice().sort((a, b) => a.name.localeCompare(b.name));
        if (meals.length) {
            const g = document.createElement('optgroup'); g.label = 'My meals';
            meals.forEach(m => { const o = el('option', null, m.name); o.value = 'm:' + m.id; g.appendChild(o); });
            sel.appendChild(g);
        }
        const g2 = document.createElement('optgroup'); g2.label = 'Nothing to buy';
        C.NOTES.forEach(n => { const o = el('option', null, n); o.value = 'n:' + n; g2.appendChild(o); });
        const o2 = el('option', null, 'Something else'); o2.value = 'other'; g2.appendChild(o2);
        sel.appendChild(g2);
        const o3 = el('option', null, 'A new meal…'); o3.value = 'new'; sel.appendChild(o3);
        sel.value = current || (meals.length ? 'm:' + meals[0].id : 'new');
    }
    function openPick(p, host) {
        closeMealForm();
        pick = p;
        const panel = $('pick');
        host.appendChild(panel);
        panel.hidden = false;
        const e = p.id ? (state.plan[p.date] || []).find(x => x.id === p.id) : null;
        $('pick-h').textContent = e ? 'Change ' + C.slotName(p.slot).toLowerCase() + ' on ' + C.dateText(p.date, true)
            : 'Add ' + C.slotName(p.slot).toLowerCase() + ' on ' + C.dateText(p.date, true);
        let cur = null;
        if (e) cur = e.meal ? 'm:' + e.meal : (C.NOTES.includes(e.note) ? 'n:' + e.note : 'other');
        fillMealSelect($('p-meal'), cur);
        $('p-note').value = e && !e.meal && !C.NOTES.includes(e.note) ? e.note : '';
        $('p-people').value = e ? e.people : state.settings.people;
        $('p-name').value = ''; $('p-ing').value = ''; $('p-makes').value = state.settings.people;
        ['p-name-err', 'p-makes-err', 'p-people-err', 'p-note-err'].forEach(id => { $(id).textContent = ''; });
        $('p-move').hidden = !e; $('p-remove').hidden = !e;
        $('p-save').textContent = e ? 'Save' : 'Add';
        if (e) {
            const sd = $('p-day'); sd.textContent = '';
            days().forEach(d => { const o = el('option', null, C.dateText(d, true)); o.value = d; sd.appendChild(o); });
            if (!days().includes(p.date)) { const o = el('option', null, C.dateText(p.date, true)); o.value = p.date; sd.appendChild(o); }
            sd.value = p.date;
            const ss = $('p-slot'); ss.textContent = '';
            C.SLOTS.forEach(([k, n]) => { const o = el('option', null, n); o.value = k; ss.appendChild(o); });
            ss.value = p.slot;
        }
        pickMode();
        panel.scrollIntoView({ block: 'nearest' });
        $('p-meal').focus();
    }
    function pickMode() {
        const v = $('p-meal').value;
        $('p-new').hidden = v !== 'new';
        $('p-other').hidden = v !== 'other';
        $('p-people-wrap').hidden = !(v === 'new' || v.startsWith('m:'));
        peopleHint();
    }
    function peopleHint() {
        const v = $('p-meal').value, n = parseInt($('p-people').value, 10);
        let t = '';
        if (v.startsWith('m:')) {
            const m = mealById(v.slice(2));
            if (m && Number.isFinite(n) && n >= 1) t = 'The recipe makes ' + m.makes + '. ' + (n === m.makes ? 'The list uses the recipe as it is.' : 'The list uses ' + C.numText(C.R(n, m.makes)) + ' times every ingredient.');
        } else if (v === 'new') t = 'Ingredients are worked out for this many people.';
        $('p-people-hint').textContent = t;
    }
    $('p-meal').addEventListener('change', () => { pickMode(); const v = $('p-meal').value; if (v === 'new') $('p-name').focus(); else if (v === 'other') $('p-note').focus(); });
    $('p-people').addEventListener('input', peopleHint);
    function closePick() { const p = $('pick'); p.hidden = true; pick = null; $('week').appendChild(p); }
    $('p-cancel').addEventListener('click', () => { const back = pick && document.querySelector('.day[data-date="' + pick.date + '"] .slot[data-slot="' + pick.slot + '"] .add-btn'); closePick(); if (back) back.focus(); });
    $('p-remove').addEventListener('click', () => { if (pick && pick.id) removeEntry(pick.date, pick.id); });
    $('pick').addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); $('p-cancel').click(); } });
    $('pick').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); $('p-save').click(); } });

    $('p-save').addEventListener('click', () => {
        if (!pick) return;
        const v = $('p-meal').value;
        const entry = { id: pick.id || C.uid(), slot: pick.slot, people: state.settings.people };
        let newMeal = null;
        if (v === 'new') {
            const name = $('p-name').value.trim();
            const nameErr = !name ? 'Type the name of the meal.' : state.meals.some(m => m.name.toLowerCase() === name.toLowerCase()) ? 'You already have a meal called ' + name + '. Pick it from the list.' : '';
            $('p-name-err').textContent = nameErr; $('p-name').setAttribute('aria-invalid', nameErr ? 'true' : 'false');
            const makes = readWhole('p-makes', 'p-makes-err', 'portions the recipe makes');
            const ppl = readWhole('p-people', 'p-people-err', 'people');
            if (nameErr || makes == null || ppl == null) { (nameErr ? $('p-name') : makes == null ? $('p-makes') : $('p-people')).focus(); return; }
            if (state.meals.length >= C.LIMITS.meals) { $('p-name-err').textContent = 'You have ' + C.LIMITS.meals + ' meals, the most. Delete one in My meals first.'; return; }
            newMeal = { id: C.uid(), name: name.slice(0, C.LIMITS.name), makes, ingredients: cleanIngredients($('p-ing').value) };
            entry.meal = newMeal.id; entry.people = ppl;
        } else if (v.startsWith('m:')) {
            const ppl = readWhole('p-people', 'p-people-err', 'people');
            if (ppl == null) { $('p-people').focus(); return; }
            entry.meal = v.slice(2); entry.people = ppl;
        } else if (v === 'other') {
            const note = $('p-note').value.trim();
            $('p-note-err').textContent = note ? '' : 'Type what it is, such as "Takeaway pizza".';
            if (!note) { $('p-note').focus(); return; }
            entry.note = note.slice(0, C.LIMITS.note);
        } else entry.note = v.slice(2);
        let date = pick.date, slot = pick.slot;
        if (pick.id) { date = $('p-day').value; slot = $('p-slot').value; entry.slot = slot; }
        const target = (state.plan[date] || []).filter(x => x.id !== pick.id);
        if (target.filter(x => x.slot === slot).length >= C.LIMITS.entries) { $('p-people-err').textContent = 'That meal time already has ' + C.LIMITS.entries + ' things, the most.'; return; }
        remember();
        if (newMeal) state.meals.push(newMeal);
        if (pick.id) {
            state.plan[pick.date] = (state.plan[pick.date] || []).filter(x => x.id !== pick.id);
            if (!state.plan[pick.date].length) delete state.plan[pick.date];
        }
        state.plan[date] = (state.plan[date] || []).concat([entry]);
        if (!state.settings.slots.includes(slot)) state.settings.slots = C.SLOT_KEYS.filter(x => state.settings.slots.includes(x) || x === slot);
        const was = pick.id;
        save(); closePick(); render();
        const nm = C.entryText(state, entry).replace(/ \(for \d+\)$/, '');
        flash('week-msg', (was ? 'Saved ' : 'Added ') + nm + ' on ' + C.dateText(date, true) + '.' + (newMeal && !C.parseLines(newMeal.ingredients).length ? ' Add its ingredients in My meals to put them on the list.' : ''), true);
        const btn = document.querySelector('.day[data-date="' + date + '"] .slot[data-slot="' + slot + '"] .add-btn');
        if (btn) btn.focus();
    });
    function cleanIngredients(t) {
        return String(t).split(/\r?\n/).map(l => l.replace(/\s+$/, '').slice(0, C.LIMITS.lineLen)).filter(l => l.trim()).slice(0, C.LIMITS.lines).join('\n');
    }

    $('people').addEventListener('input', () => {
        const n = readWhole('people', 'people-err', 'people');
        if (n != null && n !== state.settings.people) { state.settings.people = n; save(); }
    });
    $('people').addEventListener('blur', () => { $('people').value = state.settings.people; $('people-err').textContent = ''; $('people').setAttribute('aria-invalid', 'false'); });
    $('prev').addEventListener('click', () => { weekStart = C.addDays(weekStart, -7); listFrom = 'all'; closePick(); flash('week-msg', ''); render(); });
    $('next').addEventListener('click', () => { weekStart = C.addDays(weekStart, 7); listFrom = 'all'; closePick(); flash('week-msg', ''); render(); });
    $('this-week').addEventListener('click', () => { weekStart = C.weekStartOf(today, state.settings.weekStart); listFrom = 'all'; closePick(); flash('week-msg', ''); render(); $('prev').focus(); });
    $('copy-last').addEventListener('click', () => {
        const from = C.weekDays(C.addDays(weekStart, -7)), to = days();
        remember();
        let n = 0;
        to.forEach((d, i) => {
            const src = state.plan[from[i]] || [];
            if (src.length) { state.plan[d] = src.map(e => Object.assign({}, e, { id: C.uid() })); n += src.length; }
            else delete state.plan[d];
        });
        save(); closePick(); render();
        flash('week-msg', 'Copied ' + n + (n === 1 ? ' meal' : ' meals') + ' from last week onto the same days.', true);
    });
    $('clear-week').addEventListener('click', () => {
        remember();
        days().forEach(d => delete state.plan[d]);
        delete state.ticks[weekStart];
        save(); closePick(); render();
        flash('week-msg', 'Cleared this week.', true);
    });

    // ---- the shopping list
    function listDates() {
        const ds = days();
        return listFrom === 'today' && ds.includes(today) ? ds.filter(d => d >= today) : ds;
    }
    function currentList() { return C.buildList(state, listDates(), state.extras[weekStart] || []); }
    function renderList() {
        const ds = days();
        const showFrom = ds.includes(today) && today !== ds[0];
        $('list-days-wrap').hidden = !showFrom;
        if (!showFrom) listFrom = 'all';
        else {
            const sel = $('list-days'); sel.textContent = '';
            const a = el('option', null, 'The whole week (' + C.dayShort(ds[0]) + ' to ' + C.dayShort(ds[6]) + ')'); a.value = 'all';
            const b = el('option', null, 'Today to ' + C.dayShort(ds[6]) + ' (leave out days gone)'); b.value = 'today';
            sel.append(a, b); sel.value = listFrom;
        }
        const list = currentList(), ticks = new Set(state.ticks[weekStart] || []);
        const left = list.items.filter(i => !ticks.has(i.key)), got = list.items.filter(i => ticks.has(i.key));
        const lds = listDates();
        const span = C.dateText(lds[0]) + ' to ' + C.dateText(lds[lds.length - 1]);
        const planned = lds.reduce((n, d) => n + (state.plan[d] || []).filter(e => e.meal && mealById(e.meal)).length, 0);
        let sum = '';
        if (!list.items.length) sum = '';
        else if (!left.length) sum = 'All ' + list.items.length + ' things ticked off. Done!';
        else sum = left.length + (left.length === 1 ? ' thing' : ' things') + ' to buy for ' + list.meals + (list.meals === 1 ? ' meal' : ' meals') + ', ' + span + (got.length ? '. ' + got.length + ' ticked off.' : '.');
        $('list-sum').textContent = sum;
        $('list-sum').classList.toggle('good', !!list.items.length && !left.length);
        let empty = '';
        if (!list.items.length) {
            if (!planned) empty = 'Nothing yet. Add meals to the days of your week and their ingredients appear here, added up.';
            else empty = 'The meals planned for ' + span + ' have no ingredients yet. Add them in My meals.';
        } else if (planned > list.meals) empty = (planned - list.meals) + (planned - list.meals === 1 ? ' meal has' : ' meals have') + ' no ingredients yet, so ' + (planned - list.meals === 1 ? 'it is' : 'they are') + ' not on the list.';
        $('list-empty').textContent = empty; $('list-empty').hidden = !empty;
        const groups = $('groups'); groups.textContent = '';
        for (const [a, title] of C.AISLES) {
            const items = left.filter(i => i.aisle === a); if (!items.length) continue;
            const g = el('div', 'group');
            g.appendChild(el('h3', 'group-h', title));
            const ul = el('ul', 'items');
            items.forEach(i => ul.appendChild(listItem(i, false)));
            g.appendChild(ul); groups.appendChild(g);
        }
        $('got-wrap').hidden = !got.length;
        $('got-h').textContent = 'Got it (' + got.length + ')';
        const gl = $('got-list'); gl.textContent = '';
        got.forEach(i => gl.appendChild(listItem(i, true)));
        const has = list.items.length > 0;
        ['copy', 'share', 'print'].forEach(id => { $(id).disabled = !has && !planned; });
        $('email').href = emailHref();
        $('untick').disabled = !got.length;
        $('share').hidden = !navigator.share;
    }
    function listItem(i, done) {
        const li = el('li', 'item' + (done ? ' done' : ''));
        const lab = el('label', 'check');
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = done;
        cb.addEventListener('change', () => {
            const t = new Set(state.ticks[weekStart] || []);
            if (cb.checked) t.add(i.key); else t.delete(i.key);
            state.ticks[weekStart] = [...t]; if (!t.size) delete state.ticks[weekStart];
            save(); renderList();
            const again = [...document.querySelectorAll('#list .item')].find(x => x.dataset.key === i.key);
            const box = again && again.querySelector('input');
            if (box) box.focus();
        });
        lab.appendChild(cb);
        const t = el('span', 'it-text');
        const top = el('span', 'it-top');
        top.appendChild(el('span', 'it-name', i.name));
        if (i.amount) top.appendChild(el('span', 'it-amt', i.amount));
        t.appendChild(top);
        const why = i.meals.join(' · ') + (i.extra ? (i.meals.length ? ' · ' : '') + 'Added by you' : '');
        if (why) t.appendChild(el('span', 'it-for', why));
        lab.appendChild(t);
        li.dataset.key = i.key;
        li.appendChild(lab);
        if (i.extra) {
            const x = el('button', 'x', '×'); x.type = 'button';
            x.setAttribute('aria-label', 'Remove ' + i.name + ' that you added');
            x.addEventListener('click', () => {
                remember();
                state.extras[weekStart] = (state.extras[weekStart] || []).filter(e => !i.extraIds.includes(e.id));
                if (!state.extras[weekStart].length) delete state.extras[weekStart];
                save(); renderList();
                flash('list-msg', 'Removed ' + i.name + '.', true);
            });
            li.appendChild(x);
        }
        return li;
    }
    $('list-days').addEventListener('change', () => { listFrom = $('list-days').value; renderList(); });
    function addExtra() {
        const raw = $('extra').value;
        const lines = raw.split(/\r?\n|;/).map(s => s.trim()).filter(Boolean);
        const parsed = lines.filter(l => C.parseLine(l));
        if (!parsed.length) { $('extra-err').textContent = 'Type something to buy, such as "Toilet roll".'; $('extra').setAttribute('aria-invalid', 'true'); $('extra').focus(); return; }
        const cur = state.extras[weekStart] || [];
        if (cur.length + parsed.length > C.LIMITS.extras) { $('extra-err').textContent = 'You can add up to ' + C.LIMITS.extras + ' things a week.'; return; }
        $('extra-err').textContent = ''; $('extra').setAttribute('aria-invalid', 'false');
        remember();
        state.extras[weekStart] = cur.concat(parsed.map(t => ({ id: C.uid(), text: t.slice(0, C.LIMITS.lineLen) })));
        // something added again after it was ticked comes back to the list
        const keys = parsed.map(t => C.parseLine(t).key);
        if (state.ticks[weekStart]) state.ticks[weekStart] = state.ticks[weekStart].filter(k => !keys.includes(k));
        save(); $('extra').value = ''; renderList();
        flash('list-msg', 'Added ' + parsed.map(t => C.parseLine(t).name).join(', ') + '.', true);
        $('extra').focus();
    }
    $('extra-add').addEventListener('click', addExtra);
    $('extra').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); addExtra(); } });
    $('extra').addEventListener('paste', ev => {
        // a pasted list with several lines: one item per line
        const t = (ev.clipboardData || window.clipboardData).getData('text');
        if (/\n/.test(t)) { ev.preventDefault(); $('extra').value = t.split(/\r?\n/).map(s => s.trim()).filter(Boolean).join('; '); }
    });
    $('untick').addEventListener('click', () => {
        remember(); delete state.ticks[weekStart]; save(); renderList();
        flash('list-msg', 'Unticked everything.', true);
    });

    function shareText() {
        const lds = listDates(), list = currentList();
        const title = 'Shopping list for ' + C.dateText(lds[0]) + ' to ' + C.dateText(lds[lds.length - 1]);
        const plan = C.planText(state, days());
        return { title, text: C.listText(list, state.ticks[weekStart], title) + (plan ? '\n\nMEALS THIS WEEK\n' + plan : '') };
    }
    async function copyText(t) {
        try { await navigator.clipboard.writeText(t); return true; } catch (e) {
            const ta = el('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
            ta.remove(); return ok;
        }
    }
    $('copy').addEventListener('click', async () => {
        const ok = await copyText(shareText().text);
        flash('list-msg', ok ? 'Copied. Paste it into a message or notes.' : 'Your browser did not allow copying. Use Email the list instead.');
    });
    $('share').addEventListener('click', () => { const s = shareText(); navigator.share({ title: s.title, text: s.text }).catch(() => {}); });
    function emailHref() {
        const s = shareText();
        let body = s.text;
        if (body.length > 1800) body = body.slice(0, 1750).replace(/\n[^\n]*$/, '') + '\n\n(Shortened to fit an email link. Use Copy the list for all of it.)';
        return 'mailto:?subject=' + encodeURIComponent(s.title) + '&body=' + encodeURIComponent(body);
    }
    $('print').addEventListener('click', () => { closePick(); window.print(); });

    // ---- my meals
    let editing = null;     // meal id or 'new'
    function renderMeals() {
        const q = $('find').value.trim().toLowerCase();
        $('find-wrap').hidden = state.meals.length < 7;
        const list = $('meal-list'); list.textContent = '';
        const shown = state.meals.filter(m => !q || m.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
        const ds = days();
        for (const m of shown) {
            const li = el('li', 'meal');
            const top = el('div', 'meal-top');
            top.appendChild(el('h3', 'meal-name', m.name));
            top.appendChild(el('span', 'badge', 'Makes ' + m.makes));
            li.appendChild(top);
            const on = ds.filter(d => (state.plan[d] || []).some(e => e.meal === m.id)).map(C.dayShort);
            li.appendChild(el('p', 'meal-on', on.length ? 'This week: ' + on.join(', ') : 'Not on this week'));
            const ing = C.parseLines(m.ingredients);
            if (ing.length) {
                const ul = el('ul', 'ing');
                m.ingredients.split('\n').filter(l => l.trim()).forEach(l => ul.appendChild(el('li', null, l.trim())));
                li.appendChild(ul);
            } else li.appendChild(el('p', 'meal-on warn', 'No ingredients yet, so nothing goes on the list.'));
            const btns = el('div', 'meal-btns');
            const ed = el('button', 'secondary small', 'Edit'); ed.type = 'button'; ed.setAttribute('aria-label', 'Edit ' + m.name);
            ed.addEventListener('click', () => openMealForm(m.id, li));
            const del = el('button', 'secondary small', 'Delete'); del.type = 'button'; del.setAttribute('aria-label', 'Delete ' + m.name);
            del.addEventListener('click', () => deleteMeal(m.id));
            btns.append(ed, del); li.appendChild(btns);
            list.appendChild(li);
        }
        $('meals-empty').hidden = !!shown.length;
        $('meals-empty').textContent = state.meals.length ? 'No meal has "' + $('find').value.trim() + '" in its name.' : 'No meals yet. Add the meals you cook, or start with some examples.';
        $('examples').hidden = state.meals.length > 0;
    }
    function deleteMeal(id) {
        const m = mealById(id); if (!m) return;
        remember();
        let n = 0;
        for (const d of Object.keys(state.plan)) {
            const before = state.plan[d].length;
            state.plan[d] = state.plan[d].filter(e => e.meal !== id); n += before - state.plan[d].length;
            if (!state.plan[d].length) delete state.plan[d];
        }
        state.meals = state.meals.filter(x => x.id !== id);
        save(); closePick(); closeMealForm(); render();
        flash('meals-msg', 'Deleted ' + m.name + (n ? ' and took it off ' + n + (n === 1 ? ' day' : ' days') + ' of the plan' : '') + '.', true);
    }
    function openMealForm(id, host) {
        closePick();
        editing = id;
        const m = id !== 'new' ? mealById(id) : null;
        const f = $('meal-form');
        (host || $('meals')).appendChild(f);
        if (!host) $('meals').insertBefore(f, $('meal-add').nextSibling);
        f.hidden = false; $('meal-add').hidden = true;
        $('mf-h').textContent = m ? 'Edit ' + m.name : 'Add a meal';
        $('m-name').value = m ? m.name : '';
        $('m-makes').value = m ? m.makes : state.settings.people;
        $('m-ing').value = m ? m.ingredients : '';
        ['m-name-err', 'm-makes-err'].forEach(x => { $(x).textContent = ''; });
        $('m-save').textContent = m ? 'Save changes' : 'Save meal';
        preview();
        $('m-name').focus();
    }
    function closeMealForm() { const f = $('meal-form'); f.hidden = true; editing = null; $('meal-add').hidden = false; $('meals').appendChild(f); }
    function preview() {
        const ps = C.parseLines($('m-ing').value);
        $('m-preview').hidden = !ps.length;
        const ul = $('m-preview-list'); ul.textContent = '';
        ps.forEach(p => {
            const li = el('li');
            li.appendChild(el('span', 'pv-name', p.name));
            li.appendChild(el('span', 'pv-amt', C.lineAmount(p) || 'no amount'));
            ul.appendChild(li);
        });
    }
    $('m-ing').addEventListener('input', preview);
    $('meal-add').addEventListener('click', () => openMealForm('new'));
    $('m-cancel').addEventListener('click', () => { const was = editing; closeMealForm(); const b = was && was !== 'new' ? document.querySelector('[aria-label="Edit ' + CSS.escape((mealById(was) || {}).name || '') + '"]') : $('meal-add'); if (b) b.focus(); });
    $('meal-form').addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); $('m-cancel').click(); } });
    $('m-name').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); $('m-ing').focus(); } });
    $('m-save').addEventListener('click', () => {
        const name = $('m-name').value.trim();
        const clash = state.meals.find(m => m.name.toLowerCase() === name.toLowerCase() && m.id !== editing);
        const err = !name ? 'Type the name of the meal.' : clash ? 'You already have a meal called ' + clash.name + '.' : '';
        $('m-name-err').textContent = err; $('m-name').setAttribute('aria-invalid', err ? 'true' : 'false');
        const makes = readWhole('m-makes', 'm-makes-err', 'portions the recipe makes');
        if (err || makes == null) { (err ? $('m-name') : $('m-makes')).focus(); return; }
        if (editing === 'new' && state.meals.length >= C.LIMITS.meals) { $('m-name-err').textContent = 'You have ' + C.LIMITS.meals + ' meals, the most. Delete one first.'; return; }
        const lines = $('m-ing').value.split(/\r?\n/).filter(l => l.trim());
        remember();
        const data = { name: name.slice(0, C.LIMITS.name), makes, ingredients: cleanIngredients($('m-ing').value) };
        if (editing === 'new') state.meals.push(Object.assign({ id: C.uid() }, data));
        else Object.assign(mealById(editing), data);
        const was = editing;
        save(); closeMealForm(); render();
        flash('meals-msg', (was === 'new' ? 'Saved ' : 'Saved changes to ') + data.name + '.' + (lines.length > C.LIMITS.lines ? ' Only the first ' + C.LIMITS.lines + ' ingredients were kept.' : '') + (was === 'new' ? ' Pick it on a day of your week.' : ''), true);
    });
    $('find').addEventListener('input', renderMeals);
    const EXAMPLES = [
        ['Spaghetti bolognese', 4, '500 g beef mince\n1 onion\n2 cloves garlic\n1 tin chopped tomatoes\n2 tbsp tomato puree\n400 g spaghetti\n50 g parmesan\nOlive oil'],
        ['Chicken curry', 4, '600 g chicken thighs\n2 onions\n3 cloves garlic\n2 tbsp curry paste\n1 tin coconut milk\n300 g basmati rice\n1 bunch coriander'],
        ['Chicken fajitas', 4, '500 g chicken breast\n2 red peppers\n1 onion\n8 tortilla wraps\n150 ml sour cream\n1 lime'],
        ['Salmon with potatoes and green beans', 4, '4 salmon fillets\n1 kg potatoes\n300 g green beans\n1 lemon\n2 tbsp olive oil'],
        ['Daal and rice', 4, '250 g red lentils\n1 onion\n2 cloves garlic\n1 tin chopped tomatoes\n1 tsp turmeric\n1 tsp cumin seeds\n300 g basmati rice'],
        ['Vegetable stir fry', 2, '200 g egg noodles\n1 red pepper\n1 head broccoli\n2 carrots\n2 tbsp soy sauce\n1 tbsp sesame oil'],
        ['Cheese omelette', 1, '3 eggs\n1 tbsp butter\n30 g cheddar']
    ];
    $('examples').addEventListener('click', () => {
        remember();
        let n = 0;
        for (const [name, makes, ing] of EXAMPLES) {
            if (state.meals.some(m => m.name.toLowerCase() === name.toLowerCase())) continue;
            state.meals.push({ id: C.uid(), name, makes, ingredients: ing }); n++;
        }
        save(); render();
        flash('meals-msg', 'Added ' + n + ' example meals. Pick them on the days of your week.', true);
    });

    // ---- settings and backup
    function renderSettings() {
        const s = $('wstart');
        if (!s.options.length) C.DAY.forEach((d, i) => { const o = el('option', null, d); o.value = String(i); s.appendChild(o); });
        s.value = String(state.settings.weekStart);
    }
    $('wstart').addEventListener('change', () => {
        const ns = Number($('wstart').value);
        const map = k => C.weekStartOf(k, ns);
        // ticks and extra items follow the new weeks
        const ex = {}, tk = {};
        for (const [k, v] of Object.entries(state.extras)) ex[map(k)] = (ex[map(k)] || []).concat(v);
        for (const [k, v] of Object.entries(state.ticks)) tk[map(k)] = [...new Set((tk[map(k)] || []).concat(v))];
        state.extras = ex; state.ticks = tk;
        state.settings.weekStart = ns;
        weekStart = C.weekStartOf(days().includes(today) ? today : weekStart, ns);
        save(); closePick(); render();
        flash('set-msg', 'Your weeks now start on ' + C.DAY[ns] + '.');
    });
    $('backup').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(Object.assign({ app: C.SLUG, saved: new Date().toISOString() }, state), null, 1)], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'meal-planner-backup-' + today + '.json';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        flash('set-msg', 'Backup saved to your downloads.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; $('restore-file').value = '';
        if (!f) return;
        if (f.size > 5e6) { flash('set-msg', 'That file is too big to be a backup from this app.'); return; }
        const r = new FileReader();
        r.onload = () => {
            let s;
            try { s = C.sanitize(JSON.parse(r.result)); } catch (e) { flash('set-msg', 'That file is not a backup from this app, so nothing was changed.'); return; }
            remember(); state = s; save();
            weekStart = C.weekStartOf(today, state.settings.weekStart);
            closePick(); closeMealForm(); render();
            flash('set-msg', 'Restored ' + s.meals.length + (s.meals.length === 1 ? ' meal' : ' meals') + ' and your plan.', true);
        };
        r.onerror = () => flash('set-msg', 'That file could not be read.');
        r.readAsText(f);
    });
    $('wipe').addEventListener('click', () => {
        remember(); state = C.newState(); save();
        weekStart = C.weekStartOf(today, state.settings.weekStart);
        closePick(); closeMealForm(); render();
        flash('set-msg', 'Deleted everything.', true);
    });

    function render() { renderWeek(); renderList(); renderMeals(); renderSettings(); }

    // midnight: today moves on, and the shown week with it if it was this week
    setInterval(() => {
        const t = C.todayIso();
        if (t === today) return;
        const wasThis = days().includes(today);
        today = t;
        if (wasThis) weekStart = C.weekStartOf(today, state.settings.weekStart);
        if (!pick && editing == null) render();
    }, 30000);
    // changes made in another tab
    window.addEventListener('storage', ev => {
        if (ev.key !== KEY) return;
        try { state = ev.newValue ? C.sanitize(JSON.parse(ev.newValue)) : C.newState(); } catch (e) { return; }
        if (!pick && editing == null) render();
    });

    load();
    weekStart = C.weekStartOf(today, state.settings.weekStart);
    render();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
