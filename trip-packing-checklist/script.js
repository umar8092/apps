// Page code for Trip Packing Checklist. The packing rules live in core.js (PackCore).
(function () {
    const C = window.PackCore, KEY = 'trip-packing-checklist.state', HIDE = 'trip-packing-checklist.hide';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const newPid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const plural = C.plural;

    let state = load(), editing = null, gone = null, canSave = true, formOpen = !state.made;
    // the people being edited in the form (copied into state when the list is made or updated)
    let draft = JSON.parse(JSON.stringify(state.people));

    function load() {
        try { const raw = localStorage.getItem(KEY); return C.clean(raw ? JSON.parse(raw) : null); } catch (e) { return C.clean(null); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { if (canSave) { canSave = false; say($('tools-msg'), 'This browser is not saving your list (private mode or storage blocked). It works until you close the page.'); } }
    }
    const snapshot = () => JSON.parse(JSON.stringify(state));
    try { $('hide-done').checked = localStorage.getItem(HIDE) === '1'; } catch (e) { /* storage blocked: start unticked */ }

    function say(box, text, undo) {
        box.textContent = text;
        if (undo) {
            const b = el('button', null, 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { undo(); box.textContent = ''; });
            box.appendChild(b);
        }
    }
    const clearMsgs = () => ['list-msg', 'add-msg', 'actions-msg', 'people-msg'].forEach(id => { $(id).textContent = ''; });

    // ---------- trip form
    function nightsError(r) {
        return r.err === 'blank' ? 'Type how many nights you are away, or 0 for a day trip.' : r.err === 'negative' ? 'Nights cannot be below 0. Type 0 for a day trip.'
            : r.err === 'whole' ? 'Type whole nights, for example 3.' : r.err === 'big' ? 'Trips can be up to ' + C.MAX_NIGHTS + ' nights.' : 'Type the number of nights, for example 5.';
    }
    function fillForm() {
        const t = state.trip;
        $('nights').value = t.nights;
        document.querySelectorAll('#tags input').forEach(i => { i.checked = t.tags.indexOf(i.value) >= 0; });
        document.querySelectorAll('#travel input').forEach(i => { i.checked = i.value === t.travel; });
        $('abroad').checked = t.abroad; $('hand').checked = t.handOnly; $('laundry').checked = t.laundry;
        $('trip-name').value = t.name;
        $('name-box').hidden = !t.name; $('open-name').hidden = !!t.name;
        draft = JSON.parse(JSON.stringify(state.people));
        $('nights-err').textContent = ''; $('form-err').textContent = '';
        renderPeople(); formHints();
    }
    function readForm() {
        const r = C.parseNights($('nights').value);
        if (r.err) return { err: nightsError(r), field: $('nights') };
        const travel = (document.querySelector('#travel input:checked') || {}).value || 'plane';
        return { trip: {
            name: C.cleanText($('trip-name').value, C.MAX_TRIP), nights: r.n,
            tags: [...document.querySelectorAll('#tags input:checked')].map(i => i.value), travel,
            abroad: $('abroad').checked, handOnly: travel === 'plane' && $('hand').checked, laundry: $('laundry').checked
        } };
    }
    function formHints() {
        const r = C.parseNights($('nights').value), plane = ($('travel').querySelector('input:checked') || {}).value === 'plane';
        $('hand-wrap').hidden = !plane;
        document.querySelectorAll('#night-chips button').forEach(b => b.setAttribute('aria-pressed', String(!r.err && Number(b.dataset.n) === r.n)));
        const lh = $('laundry-hint');
        if (r.err) { $('nights-hint').textContent = 'Type 0 for a day trip, or up to ' + C.MAX_NIGHTS + ' nights.'; lh.hidden = true; return; }
        $('nights-err').textContent = '';
        $('nights-hint').textContent = r.n === 0 ? 'A day trip: you come back the same day.' : 'That is ' + C.daysAway(r.n) + ' days away, counting the day you leave and the day you come back.';
        const d = C.daysAway(r.n);
        lh.hidden = !(d > 7);
        lh.textContent = $('laundry').checked ? 'Clothes are packed for 7 days. Plan to wash them about every week.' : 'Long trip: tick "I can wash clothes there" to pack clothes for one week instead of ' + d + ' days.';
    }

    function renderPeople() {
        const ul = $('people'); ul.textContent = '';
        draft.forEach((p, i) => {
            const li = el('li', 'person'); li.dataset.id = p.id;
            const top = el('div', 'p-top');
            top.appendChild(el('span', 'p-num', 'Traveller ' + (i + 1)));
            if (draft.length > 1) {
                const rm = el('button', 'p-remove', 'Remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + C.personName(p, i));
                rm.addEventListener('click', () => {
                    const before = JSON.parse(JSON.stringify(draft));
                    draft.splice(i, 1); renderPeople();
                    say($('people-msg'), C.personName(p, i) + ' removed.', () => { draft = before; renderPeople(); });
                    $('add-person').focus();
                });
                top.appendChild(rm);
            }
            li.appendChild(top);
            const two = el('div', 'two');
            const nw = el('div'), nid = 'pn-' + p.id;
            const nl = el('label', null, 'Name (optional)'); nl.htmlFor = nid; nw.appendChild(nl);
            const ni = el('input'); ni.type = 'text'; ni.id = nid; ni.maxLength = C.MAX_PERSON; ni.value = p.name; ni.placeholder = i === 0 ? 'e.g. Me' : 'e.g. Sam'; ni.autocomplete = 'off';
            ni.addEventListener('input', () => { p.name = ni.value; });
            nw.appendChild(ni); two.appendChild(nw);
            const kw = el('div'), kid = 'pk-' + p.id;
            const kl = el('label', null, 'Who'); kl.htmlFor = kid; kw.appendChild(kl);
            const ks = el('select'); ks.id = kid;
            Object.keys(C.KINDS).forEach(k => { const o = el('option', null, C.KINDS[k]); o.value = k; ks.appendChild(o); });
            ks.value = p.kind;
            ks.addEventListener('change', () => { p.kind = ks.value; });
            kw.appendChild(ks); two.appendChild(kw);
            li.appendChild(two);
            ul.appendChild(li);
        });
        $('add-person').hidden = draft.length >= C.MAX_PEOPLE;
    }
    $('add-person').addEventListener('click', () => {
        if (draft.length >= C.MAX_PEOPLE) return;
        draft.push({ id: newPid(), name: '', kind: 'adult' }); $('people-msg').textContent = '';
        renderPeople();
        const inputs = $('people').querySelectorAll('input'); inputs[inputs.length - 1].focus();
    });

    $('nights').addEventListener('input', formHints);
    $('night-chips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $('nights').value = b.dataset.n; formHints(); });
    $('travel').addEventListener('change', formHints);
    $('laundry').addEventListener('change', formHints);
    $('open-name').addEventListener('click', () => { $('name-box').hidden = false; $('open-name').hidden = true; $('trip-name').focus(); });

    $('trip-form').addEventListener('submit', e => {
        e.preventDefault();
        const r = readForm();
        if (r.err) { $('nights-err').textContent = r.err; $('form-err').textContent = 'Check the number of nights above.'; r.field.focus(); return; }
        $('form-err').textContent = '';
        const before = snapshot(), wasMade = state.made;
        state.trip = r.trip;
        state.people = draft.map(p => ({ id: p.id, name: C.cleanText(p.name, C.MAX_PERSON), kind: p.kind }));
        const res = C.rebuild(state, newId);
        state.items = res.items; state.made = true;
        formOpen = false; editing = null; gone = null; clearMsgs();
        render();
        if (wasMade) {
            let m = 'List updated. Your ticks, edits and own items are kept.';
            if (res.unticked) m += ' ' + plural(res.unticked, 'item needs', 'items need') + ' more than you packed, so ' + (res.unticked === 1 ? 'it was' : 'they were') + ' unticked.';
            say($('list-msg'), m, () => { state = before; formOpen = false; render(); });
        } else say($('list-msg'), 'Your list is ready: ' + plural(C.progress(state).total, 'thing', 'things') + ' to pack. Tick each one as it goes in the bag.');
        $('list-h').scrollIntoView({ block: 'start' });
        $('list-h').focus({ preventScroll: true });
    });
    $('edit-trip').addEventListener('click', () => { formOpen = true; fillForm(); render(); $('nights').focus(); });
    $('cancel-trip').addEventListener('click', () => { formOpen = false; render(); $('edit-trip').focus(); });

    $('demo').addEventListener('click', () => {
        draft = [{ id: newPid() + 'a', name: 'Sara', kind: 'adult' }, { id: newPid() + 'b', name: 'Tom', kind: 'adult' }, { id: newPid() + 'c', name: 'Leo', kind: 'child' }];
        renderPeople();
        $('nights').value = '5';
        document.querySelectorAll('#tags input').forEach(i => { i.checked = i.value === 'warm' || i.value === 'beach'; });
        document.querySelectorAll('#travel input').forEach(i => { i.checked = i.value === 'plane'; });
        $('abroad').checked = true; $('hand').checked = false; $('laundry').checked = false;
        $('name-box').hidden = false; $('open-name').hidden = true; $('trip-name').value = 'Beach week in Spain';
        formHints();
        $('make').click();
    });

    // ---------- the list
    function render() {
        const made = state.made;
        $('trip-view').hidden = !made || formOpen;
        $('trip-form').hidden = made && !formOpen;
        $('intro').hidden = made;
        $('make').textContent = made ? 'Update my list' : 'Make my packing list';
        $('cancel-trip').hidden = !made;
        $('list-card').hidden = !made;
        $('tools').hidden = !made;
        if (made) {
            $('tv-name').hidden = !state.trip.name; $('tv-name').textContent = state.trip.name;
            $('tv-line').textContent = C.tripLine(state.trip);
            $('tv-people').textContent = state.people.map((p, i) => C.personName(p, i) + ' (' + C.KINDS[p.kind].toLowerCase() + ')').join(', ');
        }
        renderProgress();
        if (made) renderList();
        $('mail').href = mailHref();
        save();
    }

    function renderProgress() {
        const pr = C.progress(state), who = $('r-who'); who.textContent = '';
        $('r-big').textContent = state.made ? pr.got + ' of ' + pr.total : 'No list yet';
        $('r-big').classList.toggle('none', !state.made);
        $('r-bar').style.width = (pr.total ? (pr.got / pr.total) * 100 : 0).toFixed(1) + '%';
        $('result').classList.toggle('done', state.made && pr.total > 0 && pr.got === pr.total);
        if (!state.made) { $('r-meta').textContent = 'Make your list to start ticking things off.'; $('r-jobs').hidden = true; return; }
        const left = pr.total - pr.got;
        $('r-meta').textContent = pr.total === 0 ? 'Your list is empty. Add your own items below the list.' : left === 0 ? 'Everything is packed. Have a good trip!' : plural(left, 'thing', 'things') + ' still to pack.';
        if (left > 0) C.groups(state).filter(g => g.kind !== 'home' && g.total).forEach(g => {
            const li = el('li', g.got === g.total ? 'ok' : '');
            li.appendChild(el('span', null, g.title));
            li.appendChild(el('b', null, g.got === g.total ? 'all packed' : (g.total - g.got) + ' left'));
            who.appendChild(li);
        });
        $('r-jobs').hidden = !pr.jobs;
        $('r-jobs').textContent = 'Before you leave home: ' + pr.jobsDone + ' of ' + plural(pr.jobs, 'job', 'jobs') + ' done.';
    }

    function renderList() {
        const box = $('groups'), hide = $('hide-done').checked; box.textContent = '';
        C.groups(state).forEach(g => {
            const goneHere = gone && gone.group === g.id;
            if (!g.total && !goneHere && g.kind === 'home') return;
            const sec = el('section', 'group ' + g.kind); sec.dataset.group = g.id;
            const h = el('h3', 'g-head');
            h.appendChild(el('span', 'g-title', g.title));
            if (g.kind !== 'shared' && g.kind !== 'home') h.appendChild(el('span', 'g-kind', C.KINDS[g.kind]));
            h.appendChild(el('span', 'g-count', g.total ? g.got + ' of ' + g.total + (g.kind === 'home' ? ' done' : ' packed') : 'nothing yet'));
            sec.appendChild(h);
            if (!g.total && !goneHere) sec.appendChild(el('p', 'empty', 'Nothing on this list. Use "+ Add your own item" below to add something.'));
            let shown = 0;
            g.secs.forEach(s => {
                const items = s.items.filter(it => !hide || !it.got || editing === it.id);
                const goneInSec = gone && gone.group === g.id && gone.item.sec === s.id;
                if (!items.length && !goneInSec) return;
                if (g.kind !== 'home') sec.appendChild(el('h4', 's-head', s.name));
                const ul = el('ul', 'items');
                items.forEach(it => ul.appendChild(itemRow(it)));
                if (goneInSec) ul.appendChild(goneRow());
                sec.appendChild(ul); shown += items.length;
            });
            if (gone && gone.group === g.id && !g.secs.some(s => s.id === gone.item.sec)) { const ul = el('ul', 'items'); ul.appendChild(goneRow()); sec.appendChild(ul); }
            if (hide && g.total && !shown) sec.appendChild(el('p', 'empty all-done', g.kind === 'home' ? 'All done.' : 'All packed.'));
            box.appendChild(sec);
        });
        const pr = C.progress(state);
        $('untick').disabled = pr.got + pr.jobsDone === 0;
        fillAddSelects();
    }

    function goneRow() {
        const li = el('li', 'item gone');
        li.appendChild(el('span', null, gone.item.name + ' deleted.'));
        const b = el('button', null, 'Undo'); b.type = 'button';
        b.addEventListener('click', () => {
            const g = gone; gone = null;
            state.items.splice(Math.min(g.index, state.items.length), 0, g.item);
            if (g.removedKey) state.removed = state.removed.filter(k => k !== g.removedKey);
            render(); focusRow(g.item.id);
        });
        li.appendChild(b);
        return li;
    }

    function itemRow(it) {
        const li = el('li', 'item' + (it.got ? ' got' : '')); li.dataset.id = it.id;
        if (editing === it.id) return editRow(li, it);
        const lab = el('label', 'tick');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = it.got;
        lab.appendChild(cb);
        const nm = el('span', 'i-name', it.name);
        lab.appendChild(nm);
        if (it.qty != null) { nm.appendChild(el('span', 'i-qty', '× ' + it.qty)); }
        if (it.always) { nm.appendChild(el('span', 'i-tag', 'every trip')); }
        cb.addEventListener('change', () => {
            it.got = cb.checked; gone = null; clearMsgs(); render();
            const f = document.querySelector('.item[data-id="' + it.id + '"] input[type=checkbox]');
            if (f) f.focus(); else { const h = $('list-h'); h.focus({ preventScroll: true }); }
        });
        li.appendChild(lab);
        const btns = el('div', 'i-btns');
        const label = C.itemText(it);
        const eb = el('button', null, 'Edit'); eb.type = 'button'; eb.setAttribute('aria-label', 'Edit ' + label);
        eb.addEventListener('click', () => { editing = it.id; gone = null; clearMsgs(); render(); const f = document.querySelector('.item.editing input'); if (f) f.focus(); });
        btns.appendChild(eb);
        li.appendChild(btns);
        return li;
    }

    function qtyError(r) {
        return r.err === 'zero' ? 'How many must be 1 or more. Leave it empty for no number.' : r.err === 'whole' ? 'Type a whole number, for example 2.'
            : r.err === 'big' ? 'How many can be up to ' + C.MAX_QTY + '.' : 'Type how many as a number, for example 2, or leave it empty.';
    }

    function editRow(li, it) {
        li.classList.add('editing');
        const f = el('div', 'edit');
        const mk = (label, id, value, max, mode) => {
            const w = el('div'); const l = el('label', null, label); l.htmlFor = id; w.appendChild(l);
            const inp = el('input'); inp.type = 'text'; inp.id = id; inp.value = value; inp.maxLength = max; inp.autocomplete = 'off'; if (mode) inp.inputMode = mode;
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); } });
            w.appendChild(inp); return { w, inp };
        };
        const two = el('div', 'two edit-two');
        const n = mk('Item', 'e-name', it.name, C.MAX_NAME), q = mk('How many', 'e-qty', it.qty == null ? '' : String(it.qty), 3, 'numeric');
        q.inp.placeholder = 'none';
        two.appendChild(n.w); two.appendChild(q.w); f.appendChild(two);
        let ev = null;
        if (!it.key) {
            const lab = el('label', 'check'); ev = el('input'); ev.type = 'checkbox'; ev.checked = !!it.always;
            lab.appendChild(ev); lab.appendChild(document.createTextNode(' Add it to every trip I make')); f.appendChild(lab);
        }
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); f.appendChild(err);
        const btns = el('div', 'edit-btns');
        const sb = el('button', 'primary', 'Save'); sb.type = 'button';
        const cb = el('button', 'secondary', 'Cancel'); cb.type = 'button';
        const db = el('button', 'danger', 'Delete'); db.type = 'button'; db.setAttribute('aria-label', 'Delete ' + C.itemText(it));
        btns.appendChild(sb); btns.appendChild(cb); btns.appendChild(db); f.appendChild(btns);
        li.appendChild(f);
        db.addEventListener('click', () => {
            const i = state.items.indexOf(it); state.items.splice(i, 1);
            const removedKey = it.key || (it.always ? 'a.' + it.always : null);
            if (removedKey && state.removed.indexOf(removedKey) < 0) state.removed.push(removedKey);
            gone = { item: it, index: i, group: it.sec === 'home' ? 'home' : it.who, removedKey };
            editing = null; clearMsgs(); render();
            const u = document.querySelector('.item.gone button'); if (u) u.focus();
        });
        function done() {
            const name = C.cleanText(n.inp.value, C.MAX_NAME);
            if (!name) { err.textContent = 'Type the item, for example Phone charger.'; n.inp.focus(); return; }
            const r = C.parseQty(q.inp.value);
            if (r.err) { err.textContent = qtyError(r); q.inp.focus(); return; }
            if (name !== it.name || r.n !== it.qty) { it.name = name; it.qty = r.n; if (it.key) it.edited = true; }
            if (ev) setAlways(it, ev.checked);
            editing = null; render(); focusRow(it.id);
        }
        function cancel() { editing = null; render(); focusRow(it.id); }
        sb.addEventListener('click', done); cb.addEventListener('click', cancel);
        return li;
    }
    function focusRow(id) { const b = document.querySelector('.item[data-id="' + id + '"] input[type=checkbox]'); if (b) b.focus(); }

    // own items that come back on every trip
    function setAlways(it, on) {
        if (on) {
            if (!it.always) { const a = { id: newId(), who: it.who, sec: it.sec, name: it.name, qty: it.qty }; state.always.push(a); it.always = a.id; }
            else { const a = state.always.find(x => x.id === it.always); if (a) { a.name = it.name; a.qty = it.qty; } }
        } else if (it.always) { state.always = state.always.filter(x => x.id !== it.always); delete it.always; }
    }

    // ---------- add your own item
    function fillAddSelects() {
        const who = $('a-who'), keepW = who.value, sec = $('a-sec'), keepS = sec.value;
        who.textContent = '';
        const o = el('option', null, 'Everyone (shared)'); o.value = C.SHARED; who.appendChild(o);
        state.people.forEach((p, i) => { const x = el('option', null, C.personName(p, i)); x.value = p.id; who.appendChild(x); });
        who.value = [...who.options].some(x => x.value === keepW) ? keepW : C.SHARED;
        if (!sec.options.length) C.SECTIONS.forEach(s => { const x = el('option', null, s.name); x.value = s.id; sec.appendChild(x); });
        sec.value = keepS || 'other';
        who.disabled = sec.value === 'home';
    }
    $('a-sec').addEventListener('change', () => { if ($('a-sec').value === 'home') $('a-who').value = C.SHARED; $('a-who').disabled = $('a-sec').value === 'home'; });
    $('open-add').addEventListener('click', () => { $('add-form').hidden = false; $('open-add').hidden = true; $('add-msg').textContent = ''; $('a-name').focus(); });
    $('add-cancel').addEventListener('click', () => { $('add-form').hidden = true; $('open-add').hidden = false; $('add-err').textContent = ''; $('open-add').focus(); });
    $('add-form').addEventListener('submit', e => {
        e.preventDefault();
        const name = C.cleanText($('a-name').value, C.MAX_NAME), err = $('add-err');
        if (!name) { err.textContent = 'Type the item, for example Camera.'; $('a-name').focus(); return; }
        const r = C.parseQty($('a-qty').value);
        if (r.err) { err.textContent = qtyError(r); $('a-qty').focus(); return; }
        if (state.items.length >= C.MAX_ITEMS) { err.textContent = 'The list is full (' + C.MAX_ITEMS + ' items). Delete some items first.'; return; }
        err.textContent = '';
        const sec = $('a-sec').value, who = sec === 'home' ? C.SHARED : $('a-who').value;
        const same = state.items.find(x => x.who === who && x.name.toLowerCase() === name.toLowerCase());
        const it = { id: newId(), key: null, who, sec, name, qty: r.n, got: false, edited: false };
        if ($('a-always').checked) setAlways(it, true);
        state.items.push(it); state.items = C.sortItems(state.items);
        gone = null; editing = null; clearMsgs(); render();
        const whoName = who === C.SHARED ? (sec === 'home' ? 'Before you leave home' : 'For everyone') : C.personName(state.people.find(p => p.id === who), state.people.findIndex(p => p.id === who));
        say($('add-msg'), 'Added ' + C.itemText(it) + ' to ' + whoName + (it.always ? ', and to every new trip' : '') + '.' + (same ? ' Note: ' + same.name + ' was already on that list.' : ''));
        $('a-name').value = ''; $('a-qty').value = ''; $('a-always').checked = false;
        $('a-name').focus();
    });

    // ---------- list actions
    $('hide-done').addEventListener('change', () => {
        try { localStorage.setItem(HIDE, $('hide-done').checked ? '1' : '0'); } catch (e) { /* not saved, still works */ }
        gone = null; render();
    });
    $('untick').addEventListener('click', () => {
        const before = snapshot();
        state.items.forEach(it => { it.got = false; });
        gone = null; editing = null; clearMsgs(); render();
        say($('actions-msg'), 'Every tick cleared. Tick things again as you pack for the way home.', () => { state = before; render(); });
    });
    $('new-trip').addEventListener('click', () => {
        const before = snapshot();
        state.items = []; state.removed = []; state.made = false; state.trip.name = '';
        formOpen = true; gone = null; editing = null; clearMsgs();
        fillForm(); render();
        say($('people-msg'), 'Started a new trip. Your travellers and every-trip items are kept.', () => { state = before; formOpen = false; draft = JSON.parse(JSON.stringify(state.people)); render(); });
        $('trip-card').scrollIntoView({ block: 'start' });
        $('nights').focus({ preventScroll: true });
    });

    // ---------- share
    function mailHref() {
        if (!state.made) return 'mailto:';
        const subject = 'Packing list' + (state.trip.name ? ': ' + state.trip.name : '');
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(C.textList(state));
    }
    $('copy').addEventListener('click', () => {
        const text = C.textList(state);
        const done = () => say($('tools-msg'), 'List copied. Paste it into a chat, a note or an email.');
        const fallback = () => {
            const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            ta.remove();
            if (ok) done(); else say($('tools-msg'), 'Copy is blocked in this browser. Use Email list or Print instead.');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    });
    $('print').addEventListener('click', () => window.print());

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

    if (formOpen) fillForm();
    render();
})();
