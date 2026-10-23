// Car and Motorbike Service Reminder: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.ServiceCore;
    const KEY = 'car-and-motorbike-service-reminder.state', UI_KEY = 'car-and-motorbike-service-reminder.ui';
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', 'AED': 'AED (dirham)',
        'SAR': 'SAR (riyal)', 'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', '¥': '¥ (yen, yuan)',
        '₺': '₺ (lira)', 'E£': 'E£ (Egyptian pound)', 'R$': 'R$ (real)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'CHF': 'CHF (franc)', 'kr': 'kr (krona, krone)', 'zł': 'zł (złoty)' };
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };

    let canSave = true, state, ui = { cur: '' }, today = C.todayIso();
    let editing = null;          // { v, j } ids of the service in the form, or null for a new one
    let formOpen = false;
    let doneOpen = null;         // job id with the Done form open
    let lower = null;            // { v, raw } a lower odometer reading waiting for an answer
    let editingV = null;         // vehicle id being edited
    const odoDraft = {};         // typed but not saved odometer numbers, kept across re-draws

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); const u = JSON.parse(localStorage.getItem(UI_KEY) || '{}'); if (u && typeof u.cur === 'string' && C.SYMBOLS.includes(u.cur)) ui.cur = u.cur; } catch (e) { if (raw == null) canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved list could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem(UI_KEY, JSON.stringify(ui)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; doneOpen = null; lower = null; editingV = null; closeForm(); commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const timers = {};
    const MSGS = ['list-msg', 'form-msg', 'set-msg'];
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        MSGS.forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) box.appendChild(btn('undo', 'Undo', () => { restoreSnap(undoSnap); show(id, 'Undone.'); }));
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const vehicle = id => state.vehicles.find(v => v.id === id);
    const money = c => C.fmt(c, ui.cur);
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
    const fileName = s => (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'vehicle');
    const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    function calendar(vehicles, name, msgId) {
        const r = C.ics(state, vehicles, today, stamp());
        if (!r.count) { show(msgId, 'No service has a due date still to come. Calendar reminders are for services set to every so many months or weeks.'); return; }
        download(name, 'text/calendar', r.text);
        show(msgId, 'Saved a calendar file with ' + r.count + (r.count === 1 ? ' due date' : ' due dates') + '. Open it to add them to your calendar.');
    }
    function copyAndSay(text, msgId, what) {
        copyText(text).then(ok => show(msgId, ok ? 'Copied ' + what + '. Paste it into a message or note.' : 'Could not copy here. Try "Email the list" instead.'));
    }

    // ---------- the page ----------
    function render() {
        today = C.todayIso();
        renderSummary();
        renderVehicles();
        if (!state.vehicles.length) formOpen = true;
        $('form').hidden = !formOpen;
        $('open-form').hidden = formOpen;
        $('app').classList.toggle('setup', !state.vehicles.length);
        $('cur').value = ui.cur;
        if (formOpen) fillVehicleSelect();
    }

    function renderSummary() {
        const body = $('sum-body'); body.textContent = '';
        if (!state.vehicles.length) { body.appendChild(el('p', 'sum-empty', 'Add your car or motorbike to see what is due.')); return; }
        const list = C.todo(state, today);
        const multi = state.vehicles.length > 1;
        if (list.length) {
            const over = list.filter(x => x.s.level !== 'soon').length;
            body.appendChild(el('p', 'next', over ? plural(over, 'service') + ' to do now' + (list.length > over ? ', ' + (list.length - over) + ' due soon' : '') : plural(list.length, 'service') + ' due soon'));
            const ul = el('ul', 'sum-list');
            list.forEach(x => {
                const li = el('li', x.s.level === 'soon' ? 'soon' : 'over');
                li.appendChild(el('b', null, (multi ? x.v.name + ': ' : '') + C.jobTitle(x.v, x.j)));
                li.appendChild(el('span', null, ' ' + C.headline(x.v, x.j, x.s, today).replace(/^./, c => c.toLowerCase())));
                ul.appendChild(li);
            });
            body.appendChild(ul);
        } else {
            body.appendChild(el('p', 'next good-ink', 'Nothing is due. All services are OK.'));
        }
        const n = C.nextUp(state, today);
        if (n) body.appendChild(el('p', 'sum-next', 'Next: ' + (multi ? n.v.name + ', ' : '') + C.jobTitle(n.v, n.j) + ', ' + C.headline(n.v, n.j, n.s, today).replace(/^./, c => c.toLowerCase()) + '.'));
        const stale = state.vehicles.filter(v => { const r = C.lastReading(v); return v.jobs.some(j => j.dist) && (!r || C.diff(r.on, today) > 14); });
        if (stale.length) body.appendChild(el('p', 'sum-stale', 'Odometer not updated for 2 weeks: ' + stale.map(v => v.name).join(', ') + '. Type today\'s reading for the right km left.'));
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

    function renderVehicles() {
        const ul = $('vehicles'); ul.textContent = '';
        $('empty').hidden = state.vehicles.length > 0;
        state.vehicles.forEach(v => ul.appendChild(vehicleBox(v)));
    }

    function vehicleBox(v) {
        const li = el('li', 'vehicle'); li.dataset.id = v.id;
        const top = el('div', 'v-top');
        top.appendChild(el('h3', 'v-name', v.name));
        top.appendChild(el('span', 'v-kind', (v.kind === 'bike' ? 'Motorbike' : 'Car') + ', ' + C.unitWord(v.unit)));
        li.appendChild(top);

        if (editingV === v.id) { li.appendChild(vehicleEdit(v)); return li; }

        // odometer
        const lr = C.lastReading(v);
        const odo = el('div', 'odo');
        const lab = el('label', null, 'Odometer now'); lab.htmlFor = 'odo-' + v.id; odo.appendChild(lab);
        const row = el('div', 'odo-row');
        const inp = el('input'); inp.type = 'text'; inp.id = 'odo-' + v.id; inp.inputMode = 'numeric'; inp.maxLength = 11; inp.autocomplete = 'off';
        inp.placeholder = lr ? 'Today\'s reading' : 'e.g. 45210'; inp.value = odoDraft[v.id] || '';
        inp.setAttribute('aria-describedby', 'odo-e-' + v.id + ' odo-h-' + v.id);
        inp.addEventListener('input', () => { odoDraft[v.id] = inp.value; });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveReading(v, inp.value, false); } });
        const wrap = el('div', 'inline grow'); wrap.append(inp, el('span', 'unit', C.unitWord(v.unit)));
        row.append(wrap, btn('secondary small', 'Save reading', () => saveReading(v, inp.value, false)));
        odo.appendChild(row);
        const rate = C.perDay(v, today);
        const hint = el('p', 'hint', lr ? 'Last reading ' + C.dist(lr.r, v.unit) + ' on ' + C.longDate(lr.on, false) + (C.diff(lr.on, today) === 0 ? ' (today)' : C.diff(lr.on, today) === 1 ? ' (yesterday)' : ' (' + C.span(lr.on, today) + ' ago)') +
            (rate ? '. You drive about ' + (rate >= 10 ? Math.round(rate) : Math.round(rate * 10) / 10) + ' ' + C.unitWord(v.unit) + ' a day.' : '.') : 'No reading yet. Type the number on the meter.');
        hint.id = 'odo-h-' + v.id; odo.appendChild(hint);
        const err = el('p', 'err', ''); err.id = 'odo-e-' + v.id; err.setAttribute('role', 'alert'); odo.appendChild(err);
        if (lower && lower.v === v.id) {
            const q = el('div', 'ask');
            q.appendChild(el('p', null, C.group(+lower.r) + ' is lower than the last reading (' + C.dist(lr.r, v.unit) + '). Was the meter replaced or reset?'));
            const b = el('div', 'box-btns');
            b.append(btn('mini strong', 'The meter was replaced or reset', () => saveReading(v, lower.raw, true)),
                btn('mini', 'Let me fix the number', () => { lower = null; render(); const i = $('odo-' + v.id); if (i) i.focus(); }));
            q.appendChild(b); odo.appendChild(q);
        }
        li.appendChild(odo);

        // services
        const jobs = C.sortJobs(v, today);
        if (!jobs.length) li.appendChild(el('p', 'empty', 'No services yet for ' + v.name + '.'));
        const list = el('ul', 'box-list');
        jobs.forEach(x => list.appendChild(jobBox(v, x.j, x.s)));
        li.appendChild(list);

        const sp = C.spent(v, today);
        if (sp.n) li.appendChild(el('p', 'spent', 'Spent on services: ' + money(sp.year) + ' this year, ' + money(sp.all) + ' in all.'));

        const b1 = el('div', 'box-btns v-btns');
        b1.append(btn('mini strong', '+ Add a service for ' + v.name, () => openForm(null, v.id)),
            btn('mini', 'Copy for the mechanic', () => copyAndSay(C.mechanicText(state, [v], today), 'list-msg', 'the service list for ' + v.name), 'Copy the list for the mechanic for ' + v.name));
        const b2 = el('div', 'box-btns two');
        b2.append(btn('mini', 'Calendar', () => calendar([v], fileName(v.name) + '-services.ics', 'list-msg'), 'Add ' + v.name + ' due dates to my calendar'),
            btn('mini', 'Edit vehicle', () => { editingV = v.id; render(); const i = $('ve-name-' + v.id); if (i) i.focus(); }, 'Edit ' + v.name),
            btn('mini bad', 'Remove', () => removeVehicle(v), 'Remove ' + v.name));
        li.append(b1, b2);
        return li;
    }

    function vehicleEdit(v) {
        const f = el('div', 'v-edit');
        const l1 = el('label', null, 'Vehicle name'); l1.htmlFor = 've-name-' + v.id;
        const name = el('input'); name.type = 'text'; name.id = 've-name-' + v.id; name.maxLength = 40; name.value = v.name; name.autocomplete = 'off';
        const pair = el('div', 'pair');
        const k = el('div'), u = el('div');
        const l2 = el('label', null, 'Car or motorbike?'); l2.htmlFor = 've-kind-' + v.id;
        const kind = el('select'); kind.id = 've-kind-' + v.id;
        [['car', 'Car'], ['bike', 'Motorbike']].forEach(([a, b]) => { const o = el('option', null, b); o.value = a; kind.appendChild(o); }); kind.value = v.kind;
        const l3 = el('label', null, 'Distance in'); l3.htmlFor = 've-unit-' + v.id;
        const unit = el('select'); unit.id = 've-unit-' + v.id;
        [['km', 'km'], ['mi', 'miles']].forEach(([a, b]) => { const o = el('option', null, b); o.value = a; unit.appendChild(o); }); unit.value = v.unit;
        k.append(l2, kind); u.append(l3, unit); pair.append(k, u);
        const hint = el('p', 'hint', 'Changing km or miles only changes the word: the numbers you typed stay as they are.');
        const err = el('p', 'err', ''); err.setAttribute('role', 'alert');
        const b = el('div', 'box-btns');
        b.append(btn('mini strong', 'Save', () => {
            const n = C.clip(name.value, 40);
            if (!n) { err.textContent = 'Type a name.'; name.setAttribute('aria-invalid', 'true'); name.focus(); return; }
            if (state.vehicles.some(x => x.id !== v.id && x.name.toLowerCase() === n.toLowerCase())) { err.textContent = 'Another vehicle is called ' + n + '.'; name.focus(); return; }
            if (kind.value !== v.kind && v.jobs.some(j => j.type !== 'other' && !C.jobType(kind.value, j.type))) {
                v.jobs.forEach(j => { if (j.type !== 'other' && !C.jobType(kind.value, j.type)) { j.name = C.jobTitle(v, j); j.type = 'other'; } });
            }
            v.name = n; v.kind = kind.value === 'bike' ? 'bike' : 'car'; v.unit = unit.value === 'mi' ? 'mi' : 'km'; editingV = null; commit(); show('list-msg', 'Saved.');
        }), btn('mini', 'Cancel', () => { editingV = null; render(); }));
        f.append(l1, name, pair, hint, err, b);
        return f;
    }

    function jobBox(v, j, s) {
        const li = el('li', 'box ' + s.level); li.dataset.id = j.id;
        const top = el('div', 'box-top');
        top.appendChild(el('h4', 'box-name', C.jobTitle(v, j)));
        top.appendChild(el('span', 'badge ' + s.level, C.levelWord[s.level]));
        li.appendChild(top);
        li.appendChild(el('p', 'box-line', C.headline(v, j, s, today) + '.'));
        const d = C.detail(v, j, s, today); if (d) li.appendChild(el('p', 'box-adv', d));
        li.appendChild(el('p', 'box-sub', C.everyText(v, j) + '. ' + C.lastText(v, j, today) + '.'));

        if (doneOpen === j.id) { li.appendChild(doneForm(v, j)); return li; }

        if (j.history.length > 1 || j.history.some(h => h.cost != null || h.note)) {
            const det = el('details', 'hist');
            det.appendChild(el('summary', null, 'Past services (' + j.history.length + ')'));
            const ul = el('ul');
            j.history.slice().sort((a, b) => a.on < b.on ? 1 : a.on > b.on ? -1 : 0).forEach(h => {
                const row = el('li');
                row.appendChild(el('span', null, C.longDate(h.on, false) + (h.r != null ? ', ' + C.dist(h.r, v.unit) : '') + (h.cost != null ? ', ' + money(h.cost) : '') + (h.note ? ', ' + h.note : '')));
                if (j.history.length > 1) row.appendChild(btn('mini-link', 'Delete', () => {
                    const snap = snapshot(); j.history.splice(j.history.indexOf(h), 1); commit(); show('list-msg', 'Deleted the ' + C.longDate(h.on, false) + ' entry.', snap);
                }, 'Delete the ' + C.longDate(h.on, false) + ' entry'));
                ul.appendChild(row);
            });
            det.appendChild(ul); li.appendChild(det);
        }
        const b = el('div', 'box-btns');
        b.append(btn('mini strong', 'Done', () => { doneOpen = j.id; lower = null; render(); const i = $('d-on-' + j.id); if (i) i.focus(); }, 'Mark ' + C.jobTitle(v, j) + ' done'),
            btn('mini', 'Edit', () => openForm({ v: v.id, j: j.id }), 'Edit ' + C.jobTitle(v, j)));
        li.appendChild(b);
        return li;
    }

    function doneForm(v, j) {
        const f = el('div', 'done-form');
        const lr = C.lastReading(v);
        const pair = el('div', 'pair');
        const a = el('div'), b = el('div');
        const l1 = el('label', null, 'Done on'); l1.htmlFor = 'd-on-' + j.id;
        const on = el('input'); on.type = 'date'; on.id = 'd-on-' + j.id; on.value = today; on.max = today;
        const l2 = el('label', null, 'At odometer'); l2.htmlFor = 'd-at-' + j.id;
        const at = el('input'); at.type = 'text'; at.id = 'd-at-' + j.id; at.inputMode = 'numeric'; at.maxLength = 11; at.autocomplete = 'off'; at.value = lr ? String(lr.r) : '';
        const w = el('div', 'inline grow'); w.append(at, el('span', 'unit', C.unitWord(v.unit)));
        a.append(l1, on); b.append(l2, w); pair.append(a, b);
        f.appendChild(pair);
        if (!j.dist) f.appendChild(el('p', 'hint', 'The odometer is optional for this one.'));
        const more = el('div', 'opt'); more.hidden = true;
        const l3 = el('label', null, 'Cost'); l3.htmlFor = 'd-cost-' + j.id;
        const cost = el('input'); cost.type = 'text'; cost.id = 'd-cost-' + j.id; cost.inputMode = 'decimal'; cost.maxLength = 16; cost.autocomplete = 'off'; cost.placeholder = 'e.g. 3500';
        const cw = el('div', 'inline grow'); if (ui.cur) cw.appendChild(el('span', 'unit cur-sym', ui.cur)); cw.appendChild(cost);
        const l4 = el('label', null, 'Workshop or note'); l4.htmlFor = 'd-note-' + j.id;
        const note = el('input'); note.type = 'text'; note.id = 'd-note-' + j.id; note.maxLength = 200; note.autocomplete = 'off'; note.placeholder = 'e.g. Shell 5W-30, Ali Motors';
        more.append(l3, cw, l4, note);
        const open = btn('link', '+ Add cost or workshop (optional)', () => { more.hidden = false; open.hidden = true; cost.focus(); });
        f.append(open, more);
        const err = el('p', 'err', ''); err.setAttribute('role', 'alert'); f.appendChild(err);
        const bs = el('div', 'box-btns');
        bs.append(btn('mini strong', 'Save', () => {
            [on, at, cost].forEach(i => i.removeAttribute('aria-invalid'));
            const snap = snapshot();
            const r = C.markDone(state, v, j, { on: on.value, reading: at.value, cost: cost.value, note: note.value }, today);
            if (r.err) { err.textContent = r.err; const i = { on, reading: at, cost }[r.field]; if (i) { i.setAttribute('aria-invalid', 'true'); if (r.field === 'cost') { more.hidden = false; open.hidden = true; } i.focus(); } return; }
            doneOpen = null; delete odoDraft[v.id]; commit();
            const s = C.status(v, j, today);
            show('list-msg', C.jobTitle(v, j) + ' done. Next: ' + C.headline(v, j, s, today).replace(/^./, c => c.toLowerCase()) + '.', snap);
            flash(j.id);
        }), btn('mini', 'Cancel', () => { doneOpen = null; render(); }));
        f.appendChild(bs);
        return f;
    }

    function flash(id) {
        const b = document.querySelector('.box[data-id="' + id + '"]');
        if (b) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 1200); }
    }

    function saveReading(v, raw, replaced) {
        const errBox = $('odo-e-' + v.id), inp = $('odo-' + v.id);
        const snap = snapshot();
        const r = C.addReading(state, v, raw, today, replaced);
        if (r === 'LOWER') { lower = { v: v.id, raw, r: C.parseDist(raw) }; render(); return; }
        if (r) { if (errBox) errBox.textContent = r; if (inp) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); } return; }
        lower = null; delete odoDraft[v.id]; commit();
        const due = C.sortJobs(v, today).filter(x => ['over', 'due'].includes(x.s.level)).length;
        show('list-msg', 'Saved ' + C.dist(C.lastReading(v).r, v.unit) + ' for ' + v.name + '.' + (replaced ? ' The app keeps counting from the last reading.' : '') + (due ? ' ' + plural(due, 'service') + ' to do now.' : ''), snap);
    }

    function removeVehicle(v) {
        const snap = snapshot();
        state.vehicles = state.vehicles.filter(x => x !== v);
        if (editing && editing.v === v.id) closeForm();
        commit();
        show('list-msg', 'Removed ' + v.name + ' and its services.', snap);
    }

    // ---------- the add/edit form ----------
    function fillVehicleSelect(keep) {
        const sel = $('f-vehicle'), cur = keep != null ? keep : sel.value;
        sel.textContent = '';
        state.vehicles.forEach(v => { const o = el('option', null, v.name); o.value = String(v.id); sel.appendChild(o); });
        const o = el('option', null, '+ New vehicle'); o.value = 'new'; sel.appendChild(o);
        sel.value = [...sel.options].some(x => x.value === cur) ? cur : (state.vehicles.length ? String(state.vehicles[0].id) : 'new');
        sel.disabled = !!editing;
        syncVehicle(false);
    }
    const formKind = () => { const v = $('f-vehicle').value; if (v === 'new') return $('f-vkind').value; const x = vehicle(+v); return x ? x.kind : 'car'; };
    const formUnit = () => { const v = $('f-vehicle').value; if (v === 'new') return $('f-vunit').value; const x = vehicle(+v); return x ? x.unit : 'km'; };
    let lastKind = null;
    function syncVehicle(resetType) {
        const isNew = $('f-vehicle').value === 'new';
        $('w-new').hidden = !isNew;
        const kind = formKind();
        document.querySelectorAll('#form .u-word').forEach(s => { s.textContent = C.unitWord(formUnit()); });
        $('f-dist').setAttribute('aria-label', 'Every how many ' + C.unitWord(formUnit()));
        if (kind !== lastKind || resetType) {
            const keep = $('f-type').value, sel = $('f-type'); sel.textContent = '';
            C.JOBS[kind].forEach(t => { const o = el('option', null, t.label); o.value = t.k; sel.appendChild(o); });
            sel.value = C.JOBS[kind].some(t => t.k === keep) ? keep : 'oil';
            if (lastKind !== null && !editing) setDefaults();
            lastKind = kind;
        }
        if (!editing && $('f-lastat').dataset.auto !== 'no') {
            const v = isNew ? null : vehicle(+$('f-vehicle').value), lr = v ? C.lastReading(v) : null;
            $('f-lastat').value = isNew ? $('f-vodo').value.trim() : lr ? String(lr.r) : '';
        }
        syncType(); preview();
    }
    function setDefaults() {
        const t = C.jobType(formKind(), $('f-type').value); if (!t) return;
        const d = t.d[formUnit() === 'mi' ? 1 : 0];
        $('f-dist').value = d ? String(d) : '';
        $('f-timen').value = t.t ? String(t.t.n) : ''; $('f-timeu').value = t.t ? t.t.u : 'm';
    }
    function syncType() {
        $('w-name').hidden = $('f-type').value !== 'other';
        const byDist = $('f-dist').value.trim() !== '';
        $('w-lastat').hidden = !byDist;
        $('h-last').textContent = byDist ? 'Not sure? Leave today and today\'s reading: it counts from now.' : 'Not sure? Leave today: it counts from now.';
    }
    function readF() {
        return { vehicle: $('f-vehicle').value, vName: $('f-vname').value, vKind: $('f-vkind').value, vUnit: $('f-vunit').value, vOdo: $('f-vodo').value,
            type: $('f-type').value, name: $('f-name').value, dist: $('f-dist').value, timeN: $('f-timen').value, timeU: $('f-timeu').value,
            lastOn: $('f-laston').value, lastAt: $('w-lastat').hidden ? '' : $('f-lastat').value };
    }
    const ERR = { vehicle: ['e-vehicle', 'f-vehicle'], vName: ['e-vname', 'f-vname'], vOdo: ['e-vodo', 'f-vodo'], type: ['e-type', 'f-type'], name: ['e-name', 'f-name'],
        dist: ['e-dist', 'f-dist'], time: ['e-time', 'f-timen'], lastOn: ['e-laston', 'f-laston'], lastAt: ['e-lastat', 'f-lastat'] };
    function clearErrs() { Object.values(ERR).forEach(([e, i]) => { $(e).textContent = ''; $(i).removeAttribute('aria-invalid'); }); }
    function preview() {
        const r = C.readForm(readF(), state, today, editing && editing.j);
        $('preview').textContent = r.errs ? '' : C.previewText(r, today);
    }
    function openForm(ed, vid) {
        editing = ed; formOpen = true; clearErrs(); clearMsg('form-msg');
        $('form').reset(); $('f-lastat').dataset.auto = '';
        $('f-laston').value = today; $('f-laston').max = today;
        lastKind = null;
        fillVehicleSelect(ed ? String(ed.v) : vid != null ? String(vid) : undefined);
        if (ed) {
            const v = vehicle(ed.v), j = v && v.jobs.find(x => x.id === ed.j); if (!j) { editing = null; return openForm(null); }
            $('f-type').value = j.type; $('f-name').value = j.name || '';
            $('f-dist').value = j.dist ? String(j.dist) : ''; $('f-timen').value = j.time ? String(j.time.n) : ''; $('f-timeu').value = j.time ? j.time.u : 'm';
            const l = C.lastDone(j); $('f-laston').value = l.on; $('f-lastat').value = l.r != null ? String(l.r) : '';
            $('f-lastat').dataset.auto = 'no';
        } else setDefaults();
        $('form-h').textContent = ed ? 'Edit a service' : 'Add a service';
        $('save').textContent = ed ? 'Save changes' : 'Add to the list';
        $('del').hidden = !ed;
        syncType(); preview(); render();
        if (ed || vid != null) { $('add').scrollIntoView({ block: 'start', behavior: 'smooth' }); setTimeout(() => $(ed ? 'f-dist' : 'f-type').focus({ preventScroll: true }), 50); }
    }
    function closeForm() {
        editing = null; formOpen = !state.vehicles.length; clearErrs();
        $('form').reset(); $('preview').textContent = ''; $('del').hidden = true;
        $('form-h').textContent = 'Add a service'; $('save').textContent = 'Add to the list';
        $('f-vehicle').disabled = false;
    }
    function submit(e) {
        e.preventDefault(); clearErrs();
        const r = C.readForm(readF(), state, today, editing && editing.j);
        if (r.errs) {
            let first = null;
            Object.keys(r.errs).forEach(k => { const [eid, iid] = ERR[k]; $(eid).textContent = r.errs[k]; $(iid).setAttribute('aria-invalid', 'true'); if (!first) first = iid; });
            $(first).focus(); return;
        }
        const snap = snapshot(), was = !!editing;
        const { v, j } = C.applyForm(state, r, today, editing && editing.j);
        closeForm(); commit();
        const s = C.status(v, j, today);
        show('form-msg', (was ? 'Saved ' : 'Added ') + C.jobTitle(v, j) + ' for ' + v.name + ': ' + C.headline(v, j, s, today).replace(/^./, c => c.toLowerCase()) + '.', snap);
        flash(j.id);
    }

    // ---------- start ----------
    state = load();
    C.SYMBOLS.forEach(s => { const o = el('option', null, CUR_NAMES[s] || s); o.value = s; $('cur').appendChild(o); });
    $('form').addEventListener('submit', submit);
    $('f-vehicle').addEventListener('change', () => { $('f-lastat').dataset.auto = ''; syncVehicle(false); });
    $('f-vkind').addEventListener('change', () => syncVehicle(false));
    $('f-vunit').addEventListener('change', () => { syncVehicle(false); if (!editing) setDefaults(); syncType(); preview(); });
    $('f-vodo').addEventListener('input', () => { if ($('f-lastat').dataset.auto !== 'no') $('f-lastat').value = $('f-vodo').value.trim(); preview(); });
    $('f-type').addEventListener('change', () => { if (!editing) setDefaults(); syncType(); preview(); if ($('f-type').value === 'other') $('f-name').focus(); });
    $('f-lastat').addEventListener('input', () => { $('f-lastat').dataset.auto = 'no'; preview(); });
    ['f-vname', 'f-name', 'f-timen', 'f-laston'].forEach(id => $(id).addEventListener('input', preview));
    $('f-dist').addEventListener('input', () => { syncType(); preview(); });
    $('f-timeu').addEventListener('change', preview);
    $('cancel').addEventListener('click', () => { closeForm(); render(); });
    $('open-form').addEventListener('click', () => openForm(null));
    $('del').addEventListener('click', () => {
        if (!editing) return;
        const v = vehicle(editing.v), j = v && v.jobs.find(x => x.id === editing.j); if (!j) return;
        const snap = snapshot(), title = C.jobTitle(v, j);
        v.jobs = v.jobs.filter(x => x !== j); closeForm(); commit();
        show('list-msg', 'Deleted ' + title + ' from ' + v.name + '.', snap);
    });

    $('copy-all').addEventListener('click', () => { if (!state.vehicles.length) return show('set-msg', 'Add a vehicle first.'); copyAndSay(C.fullText(state, today, ui.cur), 'set-msg', 'the list'); });
    $('mail-all').addEventListener('click', () => {
        if (!state.vehicles.length) return show('set-msg', 'Add a vehicle first.');
        location.href = 'mailto:?subject=' + encodeURIComponent('Car and motorbike services') + '&body=' + encodeURIComponent(C.fullText(state, today, ui.cur));
    });
    $('cal-all').addEventListener('click', () => { if (!state.vehicles.length) return show('set-msg', 'Add a vehicle first.'); calendar(state.vehicles, 'vehicle-services.ics', 'set-msg'); });
    $('cur').addEventListener('change', () => { ui.cur = C.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; commit(); show('set-msg', ui.cur ? 'Costs now show ' + ui.cur + '.' : 'Costs now show plain numbers.'); });
    $('backup').addEventListener('click', () => {
        if (!state.vehicles.length) return show('set-msg', 'There is nothing to back up yet.');
        download('vehicle-services-' + today + '.json', 'application/json', JSON.stringify({ app: C.SLUG, saved: today, cur: ui.cur, data: state }, null, 1));
        show('set-msg', 'Saved a backup file. Keep it somewhere safe, like your email or cloud drive.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const file = $('restore-file').files[0]; $('restore-file').value = '';
        if (!file) return;
        if (file.size > 5e6) return show('set-msg', 'That file is too big to be a backup from this app.');
        const rd = new FileReader();
        rd.onload = () => {
            let raw = null; try { raw = JSON.parse(rd.result); } catch (e) { raw = null; }
            const s = raw && C.validate(raw.data || raw);
            if (!s || !s.vehicles.length) return show('set-msg', 'That file is not a backup from this app, or it is empty. Nothing was changed.');
            const snap = snapshot();
            state = s; if (raw && typeof raw.cur === 'string' && C.SYMBOLS.includes(raw.cur)) ui.cur = raw.cur;
            doneOpen = null; lower = null; editingV = null; closeForm(); commit();
            show('set-msg', 'Restored ' + plural(s.vehicles.length, 'vehicle') + '.', snap);
        };
        rd.onerror = () => show('set-msg', 'Could not read that file.');
        rd.readAsText(file);
    });
    $('wipe').addEventListener('click', () => {
        if (!state.vehicles.length) return show('set-msg', 'There is nothing to delete.');
        const snap = snapshot(); state = C.emptyState(); doneOpen = null; lower = null; editingV = null; closeForm(); commit();
        show('set-msg', 'Deleted everything.', snap);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayIso() !== today) render(); });

    closeForm();
    if (!state.vehicles.length) openForm(null); else render();
    save();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
