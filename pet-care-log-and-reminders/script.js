// Pet Care Log and Reminders: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.PetCore;
    const SLUG = 'pet-care-log-and-reminders';
    const KEY = SLUG + '.state', KEY_CUR = SLUG + '.cur', KEY_WUNIT = SLUG + '.wunit';
    const URL_SELF = 'https://umar8092.github.io/apps/' + SLUG + '/';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    let canSave = true, state, today = C.todayIso(), cur = '', wunit = 'kg', showAllVisits = false;
    let edPet = null, edCare = null, carePet = null, edVisit = null, wPet = null;   // what each window is editing

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved records could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    function saveSetting(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* fine */ } }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeAll(); commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['pet-msg', 'visit-msg', 'set-msg', 'w-msg'];
    const timers = {};
    // extra = { label, fn } for one more button, for example "Log it as a vet visit"
    function show(id, text, undoSnap, extra) {
        const box = $(id); if (!box) return;
        MSGS.forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) {
            const b = el('button', 'undo', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { restoreSnap(undoSnap); show(id, 'Undone.'); });
            box.appendChild(b);
        }
        if (extra) {
            const b = el('button', 'undo', extra.label); b.type = 'button';
            b.addEventListener('click', () => { clearMsg(id); extra.fn(); });
            box.appendChild(b);
        }
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap || extra ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const pet = id => state.pets.find(p => p.id === id);
    const care = id => state.care.find(c => c.id === id);
    const visit = id => state.visits.find(v => v.id === id);
    const livePets = () => state.pets.filter(p => !p.archived);
    const newId = () => state.nextId++;
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
        return Promise.resolve(fallbackCopy(text));
    }
    function fallbackCopy(text) {
        const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); return ok;
    }
    function download(name, type, body) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    function mailto(subject, text) {
        let body = text;
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(Too long for an email link. Use "Copy" and paste it.)';
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
    function flash(sel) {
        const t = document.querySelector(sel);
        if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1600); }
    }
    function nextWords(c) {
        const d = C.nextDue(c, today), n = C.diff(today, d);
        return n <= 0 ? 'now' : n === 1 ? 'tomorrow, ' + C.shortDate(d, today) : C.shortDate(d, today) + ' (' + C.rel(today, d) + ')';
    }
    const sheet = p => C.petSheet(state, p, today, wunit, cur);
    function mini(parent, text, fn, aria, extra) {
        const b = el('button', 'mini' + (extra ? ' ' + extra : ''), text); b.type = 'button';
        if (aria) b.setAttribute('aria-label', aria);
        b.addEventListener('click', fn); parent.appendChild(b); return b;
    }

    // ---------- the page ----------
    function render() {
        today = C.todayIso();
        renderSummary();
        renderPets();
        renderVisits();
        const has = livePets().length > 0;
        $('share-tools').hidden = !has;
        $('add-pet').textContent = state.pets.length ? '+ Add another pet' : '+ Add a pet';
        $('mail-all').href = mailto('Pet care sheets', C.allText(state, today, wunit, cur) || 'Pet care');
    }

    // a short "how late" for the Today list
    function dueShort(c) {
        const next = C.nextDue(c, today), d = C.diff(today, next);
        if (C.isOnce(c)) return d < 0 ? 'appointment was ' + C.shortDate(next, today) : 'appointment today';
        if (!c.last) return 'no date recorded yet';
        return d < 0 ? C.span(-d) + ' late' : 'due today';
    }
    function renderSummary() {
        const b = $('sum-body'); b.textContent = '';
        if (!state.pets.length) {
            b.appendChild(el('p', 'sum-empty', 'Nothing added yet. Tap "+ Add a pet" below, then add the care you want reminders for, like flea treatment, worming and vaccines.'));
            return;
        }
        if (!livePets().length) { b.appendChild(el('p', 'sum-empty', 'All your pets are archived. Tap "+ Add another pet" to start again.')); return; }
        const t = C.todayList(state, today);
        if (!state.care.some(c => pet(c.pet) && !pet(c.pet).archived)) {
            b.appendChild(el('p', 'sum-empty', 'No care reminders yet. Add flea treatment, worming or vaccines in your pet\'s box below.'));
        } else if (t.due.length) {
            b.appendChild(el('p', 'next-label', t.due.length === 1 ? 'Needs doing now' : t.due.length + ' things need doing now'));
            const ul = el('ul', 'due-list');
            t.due.forEach(x => {
                const li = el('li', C.urgency(x.care, today) === 'now' ? 'now' : 'late');
                li.appendChild(el('b', null, x.pet.name + ':'));
                li.appendChild(document.createTextNode(' ' + x.care.name + ', ' + dueShort(x.care)));
                ul.appendChild(li);
            });
            b.appendChild(ul);
        } else {
            b.appendChild(el('p', 'next', 'All caught up: nothing due today.'));
        }
        if (t.next) b.appendChild(el('p', 'next-left', 'Next: ' + t.next.pet.name + ', ' + t.next.care.name + ', ' + nextWords(t.next.care) + '.'));
        if (t.hungry.length) b.appendChild(el('p', 'hungry', 'Meals so far today: ' + t.hungry.map(h => h.pet.name + ' ' + (h.fed ? h.fed : 'none') + ' of ' + h.pet.meals).join(', ') + '.'));
    }

    function renderPets() {
        const ul = $('pet-list'); ul.textContent = '';
        livePets().forEach(p => ul.appendChild(petBox(p)));
        const arch = state.pets.filter(p => p.archived), al = $('arch-list'); al.textContent = '';
        $('archived').hidden = !arch.length;
        $('archived-sum').textContent = 'Archived pets (' + arch.length + ')';
        arch.forEach(p => {
            const li = el('li', 'arch'); li.dataset.id = p.id;
            li.appendChild(el('h3', null, p.name + ' (' + p.kind + ')'));
            li.appendChild(el('p', 'box-sub', 'Archived ' + C.shortDate(p.archived, today) + '. ' + C.plural(state.care.filter(c => c.pet === p.id).length, 'reminder') + ' and ' + C.plural(state.visits.filter(v => v.pet === p.id).length, 'vet visit') + ' kept.'));
            const bt = el('div', 'box-btns');
            mini(bt, 'Bring back', () => setArchived(p.id, false), 'Bring back ' + p.name, 'strong');
            mini(bt, 'Copy care sheet', () => copySheet(p), 'Copy care sheet for ' + p.name);
            mini(bt, 'Edit pet', () => openPet(p.id), 'Edit ' + p.name);
            li.appendChild(bt);
            al.appendChild(li);
        });
    }

    function petBox(p) {
        const li = el('li', 'pet'); li.dataset.id = p.id;
        const top = el('div', 'pet-top');
        top.appendChild(el('h3', 'pet-name', p.name));
        const a = C.age(p.birthday, today);
        top.appendChild(el('span', 'pet-kind', p.kind + (a ? ' · ' + a : '')));
        li.appendChild(top);
        if (p.note) li.appendChild(el('p', 'pet-note', p.note));
        // meals
        if (p.meals) {
            const f = el('div', 'feed'), fed = C.mealsOn(state.feeds, p.id, today).length;
            f.appendChild(el('p', 'feed-line' + (fed < p.meals ? ' todo' : ''), C.feedLine(p, state.feeds, today)));
            mini(f, 'Fed now', () => fedNow(p.id), 'Fed ' + p.name + ' now', 'strong');
            li.appendChild(f);
        }
        // care
        const list = C.sortCare(state.care.filter(c => c.pet === p.id), today);
        li.appendChild(el('h4', 'sec-h', 'Care reminders'));
        if (list.length) {
            const cl = el('ul', 'care-list');
            list.forEach(c => cl.appendChild(careBox(p, c)));
            li.appendChild(cl);
        } else {
            li.appendChild(el('p', 'starter', 'No reminders yet. Tap to add the usual ones for a ' + (p.kind === 'Other' ? 'pet' : p.kind.toLowerCase()) + ':'));
            const q = el('div', 'quick');
            C.presetsFor(p.kind).slice(0, 3).forEach((pr, i) => {
                const b = el('button', 'chip', '+ ' + pr.name); b.type = 'button';
                b.addEventListener('click', () => openCare(p.id, null, i));
                q.appendChild(b);
            });
            li.appendChild(q);
        }
        const add = el('button', 'link', '+ Add a care reminder'); add.type = 'button';
        add.setAttribute('aria-label', 'Add a care reminder for ' + p.name);
        add.addEventListener('click', () => openCare(p.id, null, null));
        li.appendChild(add);
        // weight and last vet visit
        const facts = el('div', 'pet-facts');
        const ws = C.weightsOf(state.weights, p.id);
        const fw = el('div', 'fact');
        fw.appendChild(el('p', null, ws.length ? 'Weight: ' + C.weightLine(ws, wunit, today) : 'No weight saved yet.'));
        mini(fw, 'Add weight', () => openWeight(p.id), 'Add weight for ' + p.name);
        facts.appendChild(fw);
        if (ws.length >= 2) facts.appendChild(spark(ws.slice(-12)));
        const vs = C.sortVisits(state.visits.filter(v => v.pet === p.id));
        const fv = el('div', 'fact');
        fv.appendChild(el('p', null, vs.length ? 'Last vet visit: ' + C.shortDate(vs[0].date, today) + ' (' + C.rel(today, vs[0].date) + '), ' + vs[0].what : 'No vet visits saved yet.'));
        mini(fv, 'Add vet visit', () => openVisit(p.id, null), 'Add vet visit for ' + p.name);
        facts.appendChild(fv);
        li.appendChild(facts);
        // sharing and editing
        const bt = el('div', 'pet-btns');
        mini(bt, 'Copy care sheet', () => copySheet(p), 'Copy care sheet for ' + p.name);
        const m = el('a', 'mini', 'Email care sheet'); m.href = mailto(p.name + ': pet care sheet', sheet(p)); m.setAttribute('aria-label', 'Email care sheet for ' + p.name);
        bt.appendChild(m);
        mini(bt, 'Edit pet', () => openPet(p.id), 'Edit ' + p.name);
        li.appendChild(bt);
        return li;
    }

    function careBox(p, c) {
        const u = C.urgency(c, today);
        const li = el('li', 'care ' + u); li.dataset.id = c.id;
        li.appendChild(el('h5', 'care-name', c.name));
        li.appendChild(el('p', 'st ' + u, C.dueLine(c, today)));
        li.appendChild(el('p', 'box-sub', C.subLine(c, today)));
        const h = C.historyLine(c, today);
        if (h) li.appendChild(el('p', 'box-sub', h));
        if (c.note) li.appendChild(el('p', 'box-note', c.note));
        const bt = el('div', 'box-btns');
        mini(bt, C.isOnce(c) ? 'Done' : 'Done today', () => doneNow(c.id), (C.isOnce(c) ? 'Done: ' : 'Done today: ') + p.name + ', ' + c.name, 'strong');
        mini(bt, 'Edit', () => openCare(p.id, c.id, null), 'Edit ' + p.name + ', ' + c.name);
        li.appendChild(bt);
        return li;
    }

    // a small weight line chart (SVG drawn with DOM calls, no typed text inside)
    function spark(ws) {
        const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'spark'); svg.setAttribute('viewBox', '0 0 300 56'); svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Weight chart: ' + ws.map(w => C.weightText(w.g, wunit)).join(', '));
        const lo = Math.min(...ws.map(w => w.g)), hi = Math.max(...ws.map(w => w.g)), r = hi - lo || 1;
        const pts = ws.map((w, i) => [ws.length === 1 ? 150 : 6 + i * 288 / (ws.length - 1), hi === lo ? 28 : 50 - (w.g - lo) / r * 44]);
        const pl = document.createElementNS(NS, 'polyline'); pl.setAttribute('points', pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' '));
        svg.appendChild(pl);
        return svg;
    }

    function renderVisits() {
        const has = state.pets.length > 0, all = C.sortVisits(state.visits);
        $('add-visit').hidden = !has;
        const t = $('totals'); t.textContent = '';
        if (!has) { t.appendChild(el('p', 'hint', 'Add a pet first, then save its vet visits and costs here.')); }
        else if (!all.length) { t.appendChild(el('p', 'hint', 'No vet visits saved yet. Save each visit with what it was for and the cost, to see what your pets cost each year.')); }
        else {
            const tot = C.costTotals(state.visits, state.pets, today);
            const box = el('div', 'totals');
            box.appendChild(el('p', 'big', 'This month: ' + C.money(tot.month, cur) + ' · This year: ' + C.money(tot.year, cur)));
            if (tot.perPet.length > 1) box.appendChild(el('p', 'per', 'This year per pet: ' + tot.perPet.map(x => x.pet.name + ' ' + C.money(x.cents, cur)).join(', ')));
            if (!tot.all) box.appendChild(el('p', 'per', 'No costs added yet. Add one with Edit, under "+ Add the cost".'));
            t.appendChild(box);
        }
        const ul = $('visit-list'); ul.textContent = '';
        const shown = showAllVisits ? all : all.slice(0, 5);
        shown.forEach(v => {
            const p = pet(v.pet), li = el('li', 'visit'); li.dataset.id = v.id;
            const m = el('div', 'visit-main');
            m.appendChild(el('p', 'visit-top', (p ? p.name : '?') + ' · ' + C.shortDate(v.date, today)));
            m.appendChild(el('p', 'box-sub', v.what));
            if (v.note) m.appendChild(el('p', 'box-note', v.note));
            li.appendChild(m);
            if (v.cents) li.appendChild(el('span', 'visit-cost', C.money(v.cents, cur)));
            mini(li, 'Edit', () => openVisit(v.pet, v.id), 'Edit vet visit ' + (p ? p.name : '') + ' ' + C.shortDate(v.date, today));
            ul.appendChild(li);
        });
        $('more-visits').hidden = all.length <= 5;
        $('more-visits').textContent = showAllVisits ? 'Show only the latest 5' : 'Show all ' + all.length + ' visits';
    }

    // ---------- actions ----------
    function fedNow(id) {
        const p = pet(id); if (!p) return;
        const before = snapshot(), stamp = C.nowStamp();
        const earlier = C.mealsOn(state.feeds, id, today);
        state.feeds = C.trimFeeds(state.feeds.concat([{ pet: id, t: stamp }]), today);
        commit();
        const n = earlier.length + 1, last = earlier[earlier.length - 1];
        let msg = 'Saved ' + p.name + '\'s meal at ' + C.clock(stamp) + ' (' + n + ' of ' + p.meals + ' today).';
        if (last) {
            const mins = (Date.parse(stamp + ':00') - Date.parse(last + ':00')) / 60000;
            if (mins < 60) msg += ' Already fed at ' + C.clock(last) + (mins < 1 ? ', just now' : ', ' + C.plural(Math.round(mins), 'minute') + ' ago') + ': tap Undo if this was a mistake.';
        }
        if (n > p.meals) msg += ' That is more than ' + C.plural(p.meals, 'meal') + ' today.';
        show('pet-msg', msg, before);
    }
    function doneNow(id) {
        const c = care(id); if (!c) return;
        const p = pet(c.pet);
        if (C.isOnce(c)) {
            const before = snapshot();
            state.care = state.care.filter(x => x.id !== id);
            commit();
            show('pet-msg', p.name + ': ' + c.name + ' done and taken off the list.', before,
                { label: 'Save it as a vet visit', fn: () => openVisit(p.id, null, { what: c.name, date: c.due <= today ? c.due : today }) });
            return;
        }
        if (c.last === today) { show('pet-msg', p.name + ': ' + c.name + ' is already marked done today. Next: ' + nextWords(c) + '.'); return; }
        const before = snapshot(), nx = C.done(c, today);
        state.care = state.care.map(x => x.id === id ? nx : x);
        commit();
        show('pet-msg', p.name + ': ' + c.name + ' done. Next: ' + nextWords(nx) + '.', before);
        flash('li.care[data-id="' + id + '"]');
    }
    function setArchived(id, on) {
        const p = pet(id); if (!p) return;
        const before = snapshot();
        state.pets = state.pets.map(x => x.id === id ? Object.assign({}, x, { archived: on ? today : '' }) : x);
        closeAll(); commit();
        show('pet-msg', on ? p.name + ' archived. The records are kept under "Archived pets" and there are no more reminders.' : p.name + ' is back with reminders.', before);
        if (!on) flash('li.pet[data-id="' + id + '"]');
    }
    function deletePet(id) {
        const p = pet(id); if (!p) return;
        const before = snapshot();
        state.pets = state.pets.filter(x => x.id !== id);
        state.care = state.care.filter(x => x.pet !== id);
        state.feeds = state.feeds.filter(x => x.pet !== id);
        state.weights = state.weights.filter(x => x.pet !== id);
        state.visits = state.visits.filter(x => x.pet !== id);
        closeAll(); commit();
        show('pet-msg', 'Deleted ' + p.name + ' and all ' + (p.name.endsWith('s') ? 'their' : 'its') + ' records.', before);
    }
    function copySheet(p) { copyText(sheet(p)).then(ok => show('pet-msg', ok ? 'Copied ' + p.name + '\'s care sheet. Paste it in a message to your pet sitter or vet.' : 'Could not copy. Try "Email care sheet" instead.')); }

    // ---------- windows ----------
    function openDlg(id) { const d = $(id); if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); } }
    function closeDlg(id) { const d = $(id); if (d.open) { if (d.close) d.close(); else d.removeAttribute('open'); } }
    function closeAll() { ['d-pet', 'd-care', 'd-visit', 'd-weight'].forEach(closeDlg); edPet = edCare = carePet = edVisit = wPet = null; }
    function clearErrors(form) {
        form.querySelectorAll('.err').forEach(e => { e.textContent = ''; });
        form.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
    }
    function showErrors(errors, map) {
        let first = null;
        Object.keys(errors).forEach(k => {
            const m = map[k]; if (!m) return;
            $(m[1]).textContent = errors[k];
            const inp = $(m[0]); inp.setAttribute('aria-invalid', 'true'); if (!first) first = inp;
        });
        if (first) first.focus();
    }
    function showPart(w, o, on) { $(w).hidden = !on; $(o).hidden = on; }

    // pet window
    function openPet(id) {
        const p = id != null ? pet(id) : null;
        edPet = p ? p.id : null;
        clearErrors($('f-pet'));
        $('dp-h').textContent = p ? 'Edit ' + p.name : 'Add a pet';
        $('p-name').value = p ? p.name : '';
        $('p-kind').value = p ? p.kind : 'Cat';
        $('p-meals').value = String(p ? p.meals : 0);
        $('p-bday').value = p ? p.birthday : '';
        $('p-note').value = p ? p.note : '';
        showPart('pw-bday', 'po-bday', !!(p && p.birthday));
        showPart('pw-note', 'po-note', !!(p && p.note));
        $('p-warn').textContent = '';
        $('p-save').textContent = p ? 'Save changes' : 'Add pet';
        $('p-edit').hidden = !p;
        $('p-archive').textContent = p && p.archived ? 'Bring back (not archived)' : 'Archive (rehomed or passed away)';
        openDlg('d-pet');
        $('p-name').focus();
    }
    function submitPet(e) {
        e.preventDefault(); clearErrors($('f-pet'));
        const r = C.readPet({ name: $('p-name').value, kind: $('p-kind').value, meals: $('p-meals').value,
            birthday: $('pw-bday').hidden ? '' : $('p-bday').value, note: $('pw-note').hidden ? '' : $('p-note').value }, today, state.pets, edPet);
        if (r.errors) { showErrors(r.errors, { name: ['p-name', 'pe-name'], birthday: ['p-bday', 'pe-bday'] }); return; }
        if (edPet == null && state.pets.length >= C.MAX_PETS) { $('pe-name').textContent = 'This app keeps up to ' + C.MAX_PETS + ' pets. Delete one first.'; return; }
        const before = snapshot();
        let id;
        if (edPet != null) {
            id = edPet;
            state.pets = state.pets.map(x => x.id === id ? Object.assign({}, x, r.pet) : x);
        } else {
            id = newId();
            state.pets.push(Object.assign({ id, archived: '', added: today }, r.pet));
        }
        const wasEdit = edPet != null;
        closeAll(); commit();
        show('pet-msg', (wasEdit ? 'Saved ' + r.pet.name + '.' : 'Added ' + r.pet.name + '. Now add the care you want reminders for, in ' + r.pet.name + '\'s box.') + (r.warn ? ' ' + r.warn : ''), before);
        flash('li.pet[data-id="' + id + '"]');
    }

    // care window
    function fillPresets(kind) {
        const s = $('c-preset'); s.textContent = '';
        const o0 = el('option', null, 'Choose one'); o0.value = ''; s.appendChild(o0);
        C.presetsFor(kind).forEach((p, i) => { const o = el('option', null, p.name + ' (' + C.everyText(p.n, p.unit) + ')'); o.value = String(i); s.appendChild(o); });
    }
    function applyPreset(i) {
        const p = carePet != null ? pet(carePet) : null, pr = p && C.presetsFor(p.kind)[i];
        if (!pr) return;
        $('c-preset').value = String(i);
        $('c-name').value = pr.name; $('c-n').value = String(pr.n); $('c-unit').value = pr.unit;
        ['ce-name', 'ce-n'].forEach(k => { $(k).textContent = ''; });
        $('c-name').removeAttribute('aria-invalid'); $('c-n').removeAttribute('aria-invalid');
    }
    function openCare(petId, careId, presetIdx) {
        const p = pet(petId); if (!p) return;
        const c = careId != null ? care(careId) : null;
        carePet = p.id; edCare = c ? c.id : null;
        clearErrors($('f-care'));
        fillPresets(p.kind);
        $('dc-h').textContent = c ? 'Edit ' + p.name + ': ' + c.name : 'Add a care reminder for ' + p.name;
        $('c-name').value = c ? c.name : '';
        $('c-n').value = c && !C.isOnce(c) ? String(c.n) : '1';
        $('c-unit').value = c ? c.unit : 'month';
        $('c-last').value = c ? c.last : today;
        $('c-due').value = c && C.isOnce(c) ? c.due : C.addDays(today, 7);
        $('c-note').value = c ? c.note : '';
        showPart('cw-note', 'co-note', !!(c && c.note));
        $('c-save').textContent = c ? 'Save changes' : 'Add reminder';
        $('c-edit').hidden = !c;
        if (presetIdx != null) applyPreset(presetIdx);
        unitChanged(); preview();
        openDlg('d-care');
        (presetIdx != null ? $('c-last') : c ? $('c-name') : $('c-preset')).focus();
    }
    function unitChanged() {
        const once = $('c-unit').value === 'once';
        $('c-every').classList.toggle('single', once);
        $('c-repeat').hidden = once; $('c-oncewrap').hidden = !once;
    }
    function careForm() {
        return { name: $('c-name').value, n: $('c-n').value, unit: $('c-unit').value, last: $('c-last').value, due: $('c-due').value,
            note: $('cw-note').hidden ? (edCare != null ? (care(edCare) || {}).note : '') : $('c-note').value };
    }
    function preview() {
        const f = careForm();
        $('ch-last').textContent = f.last ? '' : 'Not sure: it will show as due now. Tap "Done today" when you give it.';
        const r = C.readCare(Object.assign({}, f, { name: f.name.trim() || 'x' }), today);
        const pv = $('c-preview');
        if (!r.care) { pv.textContent = ''; return; }
        const x = r.care, d = C.nextDue(x, today), dd = C.diff(today, d);
        if (C.isOnce(x)) { pv.textContent = dd < 0 ? 'That date has passed. Choose the date of the appointment.' : 'Appointment ' + (dd === 0 ? 'today' : C.shortDate(d, today) + ' (' + C.rel(today, d) + ')') + ', not repeated.'; return; }
        const when = !x.last ? 'now (no date recorded yet)' : dd < 0 ? 'now (' + C.span(-dd) + ' late, was due ' + C.shortDate(d, today) + ')' : dd === 0 ? 'today' : dd === 1 ? 'tomorrow, ' + C.shortDate(d, today) : C.shortDate(d, today) + ' (' + C.rel(today, d) + ')';
        pv.textContent = 'Next due ' + when + ', then ' + C.everyText(x.n, x.unit) + '.';
    }
    function submitCare(e) {
        e.preventDefault(); clearErrors($('f-care'));
        const p = pet(carePet); if (!p) { closeAll(); return; }
        const r = C.readCare(careForm(), today);
        if (r.errors) { showErrors(r.errors, { name: ['c-name', 'ce-name'], n: ['c-n', 'ce-n'], last: ['c-last', 'ce-last'], due: ['c-due', 'ce-due'] }); return; }
        if (r.care.unit === 'once' && r.care.due < today && (edCare == null || (care(edCare) || {}).due !== r.care.due)) {
            showErrors({ due: 'That date has passed. For a visit that already happened, use "+ Add a vet visit".' }, { due: ['c-due', 'ce-due'] }); return;
        }
        if (edCare == null && state.care.length >= C.MAX_CARE) { $('ce-name').textContent = 'This app keeps up to ' + C.MAX_CARE + ' reminders. Delete some first.'; return; }
        const before = snapshot();
        let id, nx;
        if (edCare != null) {
            id = edCare; const old = care(id);
            nx = Object.assign({}, old, r.care);
            if (nx.last !== old.last) nx.history = (nx.last ? old.history.filter(h => h !== old.last).concat([nx.last]) : old.history.filter(h => h !== old.last)).sort();
            if (nx.unit === 'once') nx.history = [];
            state.care = state.care.map(x => x.id === id ? nx : x);
        } else {
            id = newId();
            nx = Object.assign({ id, pet: p.id, history: r.care.last ? [r.care.last] : [] }, r.care);
            state.care.push(nx);
        }
        const wasEdit = edCare != null;
        closeAll(); commit();
        const same = !wasEdit && state.care.filter(x => x.pet === p.id && x.name.toLowerCase() === nx.name.toLowerCase()).length > 1;
        show('pet-msg', (wasEdit ? 'Saved ' : 'Added ') + p.name + ': ' + nx.name + '. ' + (C.isOnce(nx) ? 'Appointment ' : 'Next: ') + nextWords(nx) + '.' + (same ? ' ' + p.name + ' already had ' + nx.name + '; both are kept.' : ''), before);
        flash('li.care[data-id="' + id + '"]');
    }

    // vet visit window
    function fillPetSelect(sel, chosen) {
        sel.textContent = '';
        state.pets.slice().sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0)).forEach(p => {
            const o = el('option', null, p.name + (p.archived ? ' (archived)' : '')); o.value = String(p.id); sel.appendChild(o);
        });
        if (chosen != null) sel.value = String(chosen);
    }
    function openVisit(petId, visitId, prefill) {
        if (!state.pets.length) return;
        const v = visitId != null ? visit(visitId) : null;
        edVisit = v ? v.id : null;
        clearErrors($('f-visit'));
        fillPetSelect($('v-pet'), v ? v.pet : petId != null ? petId : (livePets()[0] || state.pets[0]).id);
        $('dv-h').textContent = v ? 'Edit vet visit' : 'Add a vet visit';
        $('v-date').value = v ? v.date : (prefill && prefill.date) || today;
        $('v-what').value = v ? v.what : (prefill && prefill.what) || '';
        $('v-cost').value = v && v.cents ? (v.cents / 100).toFixed(2).replace(/\.00$/, '') : '';
        $('v-note').value = v ? v.note : '';
        showPart('vw-cost', 'vo-cost', !!(v && v.cents) || !!prefill);
        showPart('vw-note', 'vo-note', !!(v && v.note));
        $('vl-cost').textContent = 'Cost' + (cur ? ' (' + cur + ')' : '');
        $('v-save').textContent = v ? 'Save changes' : 'Add visit';
        $('v-edit').hidden = !v;
        openDlg('d-visit');
        (prefill ? $('v-cost') : $('v-what')).focus();
    }
    function submitVisit(e) {
        e.preventDefault(); clearErrors($('f-visit'));
        const petId = Number($('v-pet').value); if (!pet(petId)) return;
        const r = C.readVisit({ date: $('v-date').value, what: $('v-what').value, cost: $('vw-cost').hidden ? '' : $('v-cost').value, note: $('vw-note').hidden ? '' : $('v-note').value }, today);
        if (r.errors) { showErrors(r.errors, { date: ['v-date', 've-date'], what: ['v-what', 've-what'], cost: ['v-cost', 've-cost'] }); return; }
        const before = snapshot();
        let id;
        if (edVisit != null) { id = edVisit; state.visits = state.visits.map(x => x.id === id ? Object.assign({}, x, r.visit, { pet: petId }) : x); }
        else { id = newId(); state.visits.push(Object.assign({ id, pet: petId }, r.visit)); }
        const wasEdit = edVisit != null;
        closeAll();
        if (!wasEdit && C.sortVisits(state.visits).findIndex(x => x.id === id) >= 5) showAllVisits = true;
        commit();
        show('visit-msg', (wasEdit ? 'Saved the visit' : 'Saved ' + pet(petId).name + '\'s vet visit') + ' on ' + C.shortDate(r.visit.date, today) + (r.visit.cents ? ', ' + C.money(r.visit.cents, cur) : '') + '.', before);
        flash('li.visit[data-id="' + id + '"]');
    }
    function deleteVisit() {
        const v = visit(edVisit); if (!v) return;
        const before = snapshot();
        state.visits = state.visits.filter(x => x.id !== v.id);
        closeAll(); commit();
        show('visit-msg', 'Deleted the vet visit on ' + C.shortDate(v.date, today) + '.', before);
    }

    // weight window
    function openWeight(petId) {
        const p = pet(petId); if (!p) return;
        wPet = p.id;
        clearErrors($('f-weight')); clearMsg('w-msg');
        $('dw-h').textContent = 'Weight for ' + p.name;
        $('w-date').value = today; $('w-val').value = ''; $('w-unit').value = wunit;
        renderWeights();
        openDlg('d-weight');
        $('w-val').focus();
    }
    function renderWeights() {
        const ul = $('w-list'); ul.textContent = '';
        const ws = C.weightsOf(state.weights, wPet).reverse();
        $('w-hist-h').hidden = !ws.length;
        ws.forEach(w => {
            const li = el('li');
            li.appendChild(el('span', null, C.shortDate(w.date, today) + ': ' + C.weightText(w.g, wunit)));
            mini(li, 'Remove', () => {
                const before = snapshot();
                state.weights = state.weights.filter(x => x.id !== w.id); save(); render(); renderWeights();
                showWeightUndo('Removed ' + C.weightText(w.g, wunit) + ' on ' + C.shortDate(w.date, today) + '.', before);
            }, 'Remove weight ' + C.weightText(w.g, wunit) + ' on ' + C.shortDate(w.date, today), 'bad');
            ul.appendChild(li);
        });
    }
    // Undo inside the weight window keeps the window open
    function showWeightUndo(text, before) {
        const box = $('w-msg'); show('w-msg', text);
        const b = el('button', 'undo', 'Undo'); b.type = 'button';
        b.addEventListener('click', () => { state = C.validate(JSON.parse(before)) || state; save(); render(); renderWeights(); show('w-msg', 'Undone.'); });
        box.appendChild(b);
        clearTimeout(timers['w-msg']); timers['w-msg'] = setTimeout(() => clearMsg('w-msg'), 15000);
    }
    function submitWeight(e) {
        e.preventDefault(); clearErrors($('f-weight'));
        const p = pet(wPet); if (!p) return;
        const r = C.readWeight({ date: $('w-date').value, weight: $('w-val').value, unit: $('w-unit').value }, today);
        if (r.errors) { showErrors(r.errors, { date: ['w-date', 'we-date'], weight: ['w-val', 'we-val'] }); return; }
        const before = snapshot();
        const same = state.weights.find(w => w.pet === p.id && w.date === r.weight.date);
        if (same) state.weights = state.weights.map(w => w === same ? Object.assign({}, w, { g: r.weight.g }) : w);
        else state.weights.push(Object.assign({ id: newId(), pet: p.id }, r.weight));
        save(); render(); renderWeights();
        $('w-val').value = '';
        const line = C.weightLine(C.weightsOf(state.weights, p.id).filter(w => w.date <= r.weight.date), wunit, today);
        showWeightUndo((same ? 'Changed ' : 'Saved ') + p.name + '\'s weight: ' + line + '.', before);
    }

    // ---------- wiring ----------
    function init() {
        state = load();
        try { const c = localStorage.getItem(KEY_CUR); if (C.CURRENCIES.includes(c)) cur = c; const w = localStorage.getItem(KEY_WUNIT); if (w === 'lb' || w === 'kg') wunit = w; } catch (e) { /* fine */ }
        const sc = $('s-cur');
        C.CURRENCIES.forEach(c => { const o = el('option', null, c || 'None'); o.value = c; sc.appendChild(o); });
        sc.value = cur; $('s-wunit').value = wunit;
        C.KINDS.forEach(k => { const o = el('option', null, k); o.value = k; $('p-kind').appendChild(o); });

        sc.addEventListener('change', () => { cur = sc.value; saveSetting(KEY_CUR, cur); render(); });
        $('s-wunit').addEventListener('change', () => { wunit = $('s-wunit').value; saveSetting(KEY_WUNIT, wunit); render(); });
        $('add-pet').addEventListener('click', () => openPet(null));
        $('add-visit').addEventListener('click', () => openVisit(null, null));
        $('more-visits').addEventListener('click', () => { showAllVisits = !showAllVisits; renderVisits(); });
        document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeAll()));
        ['d-pet', 'd-care', 'd-visit', 'd-weight'].forEach(id => $(id).addEventListener('close', () => { if (id === 'd-weight') wPet = null; }));

        $('f-pet').addEventListener('submit', submitPet);
        $('po-bday').addEventListener('click', () => { showPart('pw-bday', 'po-bday', true); $('p-bday').focus(); });
        $('po-note').addEventListener('click', () => { showPart('pw-note', 'po-note', true); $('p-note').focus(); });
        $('p-name').addEventListener('input', () => {
            const n = $('p-name').value.trim().toLowerCase();
            $('p-warn').textContent = n && state.pets.some(p => p.id !== edPet && p.name.toLowerCase() === n) ? 'You already have a pet with this name. That is fine: both are kept.' : '';
        });
        $('p-archive').addEventListener('click', () => { const p = pet(edPet); if (p) setArchived(p.id, !p.archived); });
        $('p-del').addEventListener('click', () => { if (edPet != null) deletePet(edPet); });

        $('f-care').addEventListener('submit', submitCare);
        $('f-care').addEventListener('input', preview);
        $('f-care').addEventListener('change', preview);
        $('c-unit').addEventListener('change', () => { unitChanged(); preview(); });
        $('c-preset').addEventListener('change', () => { if ($('c-preset').value) applyPreset(Number($('c-preset').value)); unitChanged(); preview(); });
        $('c-quick-last').addEventListener('click', e => {
            const b = e.target.closest('.chip'); if (!b) return;
            const m = /^(\d+)([dm])$/.exec(b.dataset.ago);
            $('c-last').value = !m ? '' : m[2] === 'm' ? C.addMonths(today, -Number(m[1])) : C.addDays(today, -Number(m[1]));
            $('ce-last').textContent = ''; $('c-last').removeAttribute('aria-invalid'); preview();
        });
        $('c-quick-due').addEventListener('click', e => {
            const b = e.target.closest('.chip'); if (!b) return;
            $('c-due').value = C.addDays(today, Number(b.dataset.in)); $('ce-due').textContent = ''; $('c-due').removeAttribute('aria-invalid'); preview();
        });
        $('co-note').addEventListener('click', () => { showPart('cw-note', 'co-note', true); $('c-note').focus(); });
        $('c-del').addEventListener('click', () => {
            const c = care(edCare); if (!c) return;
            const p = pet(c.pet), before = snapshot();
            state.care = state.care.filter(x => x.id !== c.id);
            closeAll(); commit();
            show('pet-msg', 'Deleted ' + p.name + ': ' + c.name + '.', before);
        });

        $('f-visit').addEventListener('submit', submitVisit);
        $('v-quick').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $('v-date').value = C.addDays(today, -parseInt(b.dataset.ago, 10)); $('ve-date').textContent = ''; $('v-date').removeAttribute('aria-invalid'); });
        $('vo-cost').addEventListener('click', () => { showPart('vw-cost', 'vo-cost', true); $('v-cost').focus(); });
        $('vo-note').addEventListener('click', () => { showPart('vw-note', 'vo-note', true); $('v-note').focus(); });
        $('v-del').addEventListener('click', deleteVisit);

        $('f-weight').addEventListener('submit', submitWeight);
        $('w-unit').addEventListener('change', () => { wunit = $('w-unit').value; $('s-wunit').value = wunit; saveSetting(KEY_WUNIT, wunit); render(); renderWeights(); });

        $('copy-all').addEventListener('click', () => {
            const t = C.allText(state, today, wunit, cur); if (!t) return;
            copyText(t).then(ok => show('set-msg', ok ? 'Copied the care sheets for all your pets.' : 'Could not copy. Try "Email all care sheets" instead.'));
        });
        $('cal').addEventListener('click', () => {
            const r = C.ics(state, today, URL_SELF);
            if (!r.count) { show('set-msg', 'There are no care reminders to add yet. Add some in your pet\'s box first.'); return; }
            download('pet-care-reminders.ics', 'text/calendar', r.text);
            show('set-msg', 'Saved a calendar file with ' + C.plural(r.count, 'reminder') + '. Open it to add them to your calendar.');
        });
        $('backup').addEventListener('click', () => {
            download('pet-care-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1));
            show('set-msg', 'Saved a backup file with ' + C.plural(state.pets.length, 'pet') + ', ' + C.plural(state.care.length, 'reminder') + ' and ' + C.plural(state.visits.length, 'vet visit') + '.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => {
            const f = e.target.files && e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (f.size > 5e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            const r = new FileReader();
            r.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(String(r.result))); } catch (err) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
                const before = snapshot(); state = s; closeAll(); commit();
                show('set-msg', 'Restored ' + C.plural(s.pets.length, 'pet') + ' and ' + C.plural(s.care.length, 'reminder') + '.', before);
            };
            r.onerror = () => show('set-msg', 'Could not read that file.');
            r.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.pets.length) { show('set-msg', 'There is nothing to delete.'); return; }
            const before = snapshot(); state = C.emptyState(); closeAll(); commit();
            show('set-msg', 'Deleted everything.', before);
        });
        // a new day while the page stays open
        const tick = () => { if (C.todayIso() !== today) { render(); preview(); } };
        setInterval(tick, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        if (!canSave) $('storage-warn').hidden = false;
        render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
