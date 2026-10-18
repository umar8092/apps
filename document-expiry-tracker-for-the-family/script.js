// Document Expiry Tracker for the Family: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.DocCore;
    const KEY = 'document-expiry-tracker-for-the-family.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };

    let canSave = true, state, today = C.todayIso();
    let editing = null;          // { id, renew } for a document in the form, or null for a new one
    let formOpen = false;
    let remTouched = false;      // the person changed "Start renewing" themselves
    let renaming = null;         // id of the person being renamed
    const shownNumbers = new Set();

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved list could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeForm(); commit(); syncTrip(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        ['list-msg', 'form-msg', 'set-msg'].forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) box.appendChild(btn('undo', 'Undo', () => { restoreSnap(undoSnap); show(id, 'Undone.'); }));
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const doc = id => state.docs.find(d => d.id === id);
    const person = id => state.people.find(p => p.id === id);
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
    const fileName = s => (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'document');
    const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    function calendar(docs, name, msgId) {
        const r = C.ics(state, docs, today, stamp());
        if (!r.count) { show(msgId, 'There is nothing still to come to add to a calendar.'); return; }
        download(name, 'text/calendar', r.text);
        show(msgId, 'Saved a calendar file with ' + r.count + (r.count === 1 ? ' event' : ' events') + '. Open it to add the reminders to your calendar.');
    }
    const BADGE = { expired: 'Expired', soon: 'Renew now', ok: 'Valid', none: 'No expiry' };

    // ---------- the page ----------
    function render() {
        today = C.todayIso();
        renderSummary();
        renderPeople();
        renderTrip();
        if (!state.docs.length && !state.people.length) formOpen = true;
        $('form').hidden = !formOpen;
        $('open-form').hidden = formOpen;
        $('form-h').hidden = !formOpen;
        $('cancel').hidden = !state.docs.length && !state.people.length && !editing;
        $('empty').hidden = state.people.length > 0;
        const any = state.docs.length > 0;
        $('copy-all').disabled = !any; $('cal-all').disabled = !any;
        let body = C.listText(state, today) || 'Family documents and expiry dates';
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(The list is too long for an email link. Use "Copy the list" and paste it.)';
        $('mail-all').href = 'mailto:?subject=' + encodeURIComponent('Family documents and expiry dates') + '&body=' + encodeURIComponent(body);
        $('app').classList.toggle('setup', !state.people.length);
        if (formOpen) fillWho();
    }

    function renderSummary() {
        const b = $('sum-body'); b.textContent = '';
        const s = C.summary(state, today);
        if (!s.total) { b.appendChild(el('p', 'sum-empty', 'Add a document and this box will tell you what to renew and when.')); return; }
        if (s.todoLines.length) {
            b.appendChild(el('p', 'next bad-ink', s.todoLines.length === 1 ? '1 document to renew now' : s.todoLines.length + ' documents to renew now'));
            const ul = el('ul', 'sum-list');
            s.todo.forEach((d, i) => { const li = el('li', C.classify(d, today).state, s.todoLines[i]); li.appendChild(jump(d)); ul.appendChild(li); });
            b.appendChild(ul);
        } else b.appendChild(el('p', 'next good-ink', 'Nothing to renew now'));
        if (s.waitingLines.length) {
            b.appendChild(el('h3', 'sum-h3', 'Waiting for the new one'));
            const ul = el('ul', 'sum-list');
            s.waiting.forEach((d, i) => { const li = el('li', 'wait', s.waitingLines[i]); li.appendChild(jump(d)); ul.appendChild(li); });
            b.appendChild(ul);
        }
        if (s.next) b.appendChild(el('p', 'sum-next', 'Next: ' + s.nextLine + '.'));
    }
    function jump(d) {
        const a = btn('mini-link', 'Go to it', () => { const box = $('doc-' + d.id); if (box) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); flash(box); } }, 'Show ' + C.docTitle(d));
        return a;
    }
    function flash(box) { box.classList.add('flash'); setTimeout(() => box.classList.remove('flash'), 1600); }

    function renderPeople() {
        const ul = $('people'); ul.textContent = '';
        state.people.forEach(p => {
            const li = el('li', 'person'); li.id = 'person-' + p.id;
            const top = el('div', 'person-top');
            if (renaming === p.id) {
                const f = el('form', 'rename');
                const inp = el('input'); inp.type = 'text'; inp.maxLength = 40; inp.value = p.name; inp.id = 'rename-' + p.id; inp.setAttribute('aria-label', 'New name for ' + p.name);
                const err = el('p', 'err'); err.setAttribute('role', 'alert');
                f.appendChild(inp);
                const row = el('div', 'box-btns');
                const ok = el('button', 'mini strong', 'Save name'); ok.type = 'submit'; row.appendChild(ok);
                row.appendChild(btn('mini', 'Cancel', () => { renaming = null; render(); }));
                f.appendChild(row); f.appendChild(err);
                f.addEventListener('submit', e => {
                    e.preventDefault();
                    const nm = C.clip(inp.value, 40);
                    if (!nm) { err.textContent = 'Type a name.'; return; }
                    if (state.people.some(o => o.id !== p.id && o.name.toLowerCase() === nm.toLowerCase())) { err.textContent = nm + ' is already on the list.'; return; }
                    const before = snapshot(); p.name = nm; renaming = null; commit();
                    show('list-msg', 'Renamed to ' + nm + '.', before);
                });
                top.appendChild(f);
                setTimeout(() => inp.focus(), 0);
            } else {
                top.appendChild(el('h3', 'person-name', p.name));
                const docs = state.docs.filter(d => d.who === p.id);
                const bad = docs.filter(d => ['expired', 'soon'].includes(C.classify(d, today).state) && !C.classify(d, today).applied).length;
                top.appendChild(el('span', 'count' + (bad ? ' warn' : ''), docs.length ? (bad ? bad + ' to renew' : plural(docs.length, 'document')) : 'No documents'));
            }
            li.appendChild(top);
            const list = el('ul', 'box-list');
            C.sortDocs(state.docs.filter(d => d.who === p.id)).forEach(d => list.appendChild(docBox(d)));
            li.appendChild(list);
            const pb = el('div', 'box-btns person-btns');
            pb.appendChild(btn('mini strong', '+ Add a document for ' + p.name, () => openForm(null, false, p.id)));
            pb.appendChild(btn('mini', 'Copy', () => copyText(C.personText(state, p, today)).then(ok => show('list-msg', ok ? 'Copied ' + p.name + "'s documents." : 'Could not copy.')), 'Copy ' + p.name + "'s documents"));
            pb.appendChild(btn('mini', 'Rename', () => { renaming = p.id; render(); }, 'Rename ' + p.name));
            pb.appendChild(btn('mini bad', 'Remove', () => removePerson(p), 'Remove ' + p.name));
            li.appendChild(pb);
            ul.appendChild(li);
        });
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

    function docBox(d) {
        const k = C.classify(d, today);
        const li = el('li', 'box ' + (k.applied ? 'wait' : k.state)); li.id = 'doc-' + d.id;
        const top = el('div', 'box-top');
        top.appendChild(el('h4', 'box-name', C.docTitle(d)));
        top.appendChild(el('span', 'badge ' + (k.applied ? 'wait' : k.state), k.applied ? 'Applied' : BADGE[k.state]));
        li.appendChild(top);
        li.appendChild(el('p', 'box-line', C.statusLine(d, today)));
        const adv = C.adviceLine(d, today);
        if (adv) li.appendChild(el('p', 'box-adv', adv));
        if (d.number) {
            const shown = shownNumbers.has(d.id);
            const row = el('p', 'box-num');
            if (shown) row.appendChild(el('span', 'num', 'Number: ' + d.number));
            row.appendChild(btn('mini-link', shown ? 'Hide number' : 'Show number', () => { shown ? shownNumbers.delete(d.id) : shownNumbers.add(d.id); render(); }, (shown ? 'Hide' : 'Show') + ' the number of ' + C.docTitle(d)));
            li.appendChild(row);
        }
        if (d.note) li.appendChild(el('p', 'box-note', d.note));
        if (d.history.length) {
            const det = el('details', 'hist');
            det.appendChild(el('summary', null, 'Earlier (' + d.history.length + ')'));
            const ul = el('ul');
            d.history.slice().reverse().forEach(h => ul.appendChild(el('li', null, 'Expired ' + (h.exp.t === 'month' ? 'end of ' + C.expText({ exp: h.exp }) : C.longDate(h.exp.d, false)) + (h.number ? ', number ' + h.number : '') + (h.on ? ' (renewed ' + C.longDate(h.on, false) + ')' : ''))));
            det.appendChild(ul); li.appendChild(det);
        }
        const bb = el('div', 'box-btns');
        if (k.state !== 'none') {
            if (k.state !== 'ok' || d.applied) bb.appendChild(btn('mini strong', d.applied ? 'Not applied' : 'Applied for renewal', () => toggleApplied(d), (d.applied ? 'Not applied: ' : 'Applied for renewal: ') + C.docTitle(d)));
            bb.appendChild(btn(k.state === 'ok' ? 'mini' : 'mini strong', 'Renewed', () => openForm(d.id, true), 'Renewed: type the new expiry date of ' + C.docTitle(d)));
        }
        bb.appendChild(btn('mini', 'Edit', () => openForm(d.id, false), 'Edit ' + C.docTitle(d)));
        if (k.state !== 'none' && k.state !== 'expired') bb.appendChild(btn('mini', 'Calendar', () => calendar([d], fileName((person(d.who) || {}).name + '-' + C.docTitle(d)) + '.ics', 'list-msg'), 'Add ' + C.docTitle(d) + ' to my calendar'));
        bb.appendChild(btn('mini', 'Copy', () => copyText(((person(d.who) || {}).name || '') + ': ' + C.docText(d, today, true)).then(ok => show('list-msg', ok ? 'Copied ' + C.docTitle(d) + '.' : 'Could not copy.')), 'Copy ' + C.docTitle(d)));
        li.appendChild(bb);
        return li;
    }
    function toggleApplied(d) {
        const before = snapshot();
        d.applied = d.applied ? '' : today;
        commit();
        show('list-msg', d.applied ? C.docTitle(d) + ' moved to "Waiting for the new one".' : C.docTitle(d) + ' is back on "Renew now".', before);
    }
    function removePerson(p) {
        const before = snapshot(), n = state.docs.filter(d => d.who === p.id).length;
        state.people = state.people.filter(o => o.id !== p.id);
        state.docs = state.docs.filter(d => d.who !== p.id);
        if (editing && !doc(editing.id)) closeForm();
        commit();
        show('list-msg', 'Removed ' + p.name + (n ? ' and ' + plural(n, 'document') : '') + '.', before);
    }

    // ---------- travel check ----------
    function syncTrip() { $('t-back').value = state.trip.back; $('t-rule').value = String(state.trip.rule); }
    function renderTrip() {
        const out = $('trip-out'); out.textContent = ''; $('e-trip').textContent = '';
        $('t-back').removeAttribute('aria-invalid');
        const back = state.trip.back;
        if (!back) return;
        const r = C.travelCheck(state, back, state.trip.rule, today);
        if (r.err) { $('e-trip').textContent = r.err; $('t-back').setAttribute('aria-invalid', 'true'); return; }
        if (!r.rows.length) { out.appendChild(el('p', 'hint', 'Add a passport, visa, ID card or driving licence to check it for the trip.')); return; }
        out.appendChild(el('p', 'trip-head ' + (r.bad ? 'bad-ink' : 'good-ink'), r.bad ? plural(r.bad, 'document') + ' not good for this trip' : 'All good for a trip until ' + C.longDate(back)));
        const ul = el('ul', 'trip-list');
        r.rows.forEach(row => {
            const li = el('li', row.ok ? 'ok' : 'bad');
            li.appendChild(el('b', null, (row.ok ? 'OK: ' : 'Renew first: ') + row.person + ', ' + row.title));
            li.appendChild(el('span', null, ' ' + row.text + (row.applied && !row.ok ? ' You have applied to renew it.' : '')));
            ul.appendChild(li);
        });
        out.appendChild(ul);
        out.appendChild(el('p', 'hint', 'Rules differ by country and by airline. Check the country you are going to before you book.'));
    }

    // ---------- the form ----------
    const TYPE_KEY = r => r.n + r.u;
    function fillWho(pick) {
        const sel = $('f-who'), cur = pick != null ? String(pick) : sel.value;
        sel.textContent = '';
        state.people.forEach(p => { const o = el('option', null, p.name); o.value = String(p.id); sel.appendChild(o); });
        const n = el('option', null, '+ Someone new'); n.value = 'new'; sel.appendChild(n);
        sel.value = [...sel.options].some(o => o.value === cur) ? cur : state.people.length ? String(state.people[0].id) : 'new';
        $('w-new').hidden = sel.value !== 'new';
    }
    function setRemind(r) {
        const k = TYPE_KEY(r), sel = $('f-rem');
        if ([...sel.options].some(o => o.value === k)) { sel.value = k; $('w-remnum').hidden = true; }
        else { sel.value = 'custom'; $('w-remnum').hidden = false; $('f-remnum').value = String(r.n); $('f-remunit').value = r.u; }
    }
    function syncForm() {
        const t = $('f-type').value;
        $('w-name').hidden = t !== 'other';
        const k = $('f-expkind').value;
        $('w-expdate').hidden = k !== 'date';
        $('w-expmonth').hidden = k !== 'month';
        $('w-rem').hidden = k === 'none';
        $('w-remnum').hidden = $('f-rem').value !== 'custom';
        $('w-new').hidden = $('f-who').value !== 'new';
        $('h-rem').textContent = t === 'passport' ? 'For a passport, 9 months gives time to get the new one before the last 6 months, which many countries refuse.' : '';
        $('preview').textContent = $('f-expkind').value === 'date' && !$('f-expdate').value ? '' : C.previewText(formValues(), state, today);
    }
    function formValues() {
        return { who: $('f-who').value, newName: $('f-newname').value, type: $('f-type').value, name: $('f-name').value,
            expKind: $('f-expkind').value, expDate: $('f-expdate').value, expMonth: $('f-expmonth').value, expYear: $('f-expyear').value,
            remSel: $('f-rem').value, remNum: $('f-remnum').value, remUnit: $('f-remunit').value,
            number: $('f-number').value, country: $('f-country').value, note: $('f-note').value };
    }
    function clearErrors() {
        ['who', 'name', 'exp', 'rem'].forEach(k => { $('e-' + k).textContent = ''; });
        document.querySelectorAll('#form [aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    }
    function resetForm(whoId) {
        $('form').reset();
        fillWho(whoId != null ? whoId : undefined);
        $('f-newname').value = '';
        $('f-type').value = 'passport';
        $('f-expkind').value = 'date';
        remTouched = false; setRemind(C.typeOf('passport').remind);
        $('w-more').hidden = true; $('o-more').hidden = false;
        $('renew-note').hidden = true;
        clearErrors();
    }
    function openForm(id, renew, whoId) {
        editing = id ? { id, renew: !!renew } : null;
        renaming = null;
        formOpen = true;
        render();
        resetForm(whoId);
        const d = id ? doc(id) : null;
        if (d) {
            fillWho(d.who);
            $('f-type').value = d.type; $('f-name').value = d.name;
            $('f-expkind').value = d.exp.t;
            if (d.exp.t === 'date') $('f-expdate').value = d.exp.d;
            if (d.exp.t === 'month') { $('f-expmonth').value = String(d.exp.m); $('f-expyear').value = String(d.exp.y); }
            remTouched = true; setRemind(d.remind);
            $('f-number').value = d.number; $('f-country').value = d.country; $('f-note').value = d.note;
            if (d.number || d.country || d.note) { $('w-more').hidden = false; $('o-more').hidden = true; }
            if (renew) {
                $('f-expdate').value = ''; $('f-expmonth').value = ''; $('f-expyear').value = '';
                if (d.exp.t === 'none') $('f-expkind').value = 'date';
                $('renew-note').hidden = false;
                $('renew-note').textContent = 'Type the new expiry date from the new ' + C.docTitle(d).toLowerCase() + '. The old date (' + C.statusLine(d, today).toLowerCase() + ') is kept under "Earlier". Change the number too if it is new.';
                $('w-more').hidden = false; $('o-more').hidden = true;
            }
        }
        const p = d ? person(d.who) : null;
        $('form-h').textContent = d ? (renew ? 'Renewed: ' : 'Edit: ') + (p ? p.name + ', ' : '') + C.docTitle(d) : 'Add a document';
        $('save').textContent = d ? (renew ? 'Save the new date' : 'Save changes') : 'Add to the list';
        $('del').hidden = !d || renew;
        syncForm();
        $('add').scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => (renew ? (d.exp.t === 'month' ? $('f-expmonth') : $('f-expdate')) : (d ? $('f-type') : ($('f-who').value === 'new' ? $('f-newname') : $('f-type')))).focus({ preventScroll: true }), 0);
    }
    function closeForm() {
        editing = null;
        formOpen = !state.docs.length && !state.people.length;
        resetForm();
        $('form-h').textContent = 'Add a document';
        $('save').textContent = 'Add to the list';
        $('del').hidden = true;
        syncForm();
    }

    function submit(e) {
        e.preventDefault();
        clearErrors();
        const r = C.readForm(formValues(), state, today);
        const mark = (k, ids) => { $('e-' + k).textContent = r.errs[k]; ids.forEach(i => $(i).setAttribute('aria-invalid', 'true')); };
        if (r.errs.who) mark('who', ['f-newname']);
        if (r.errs.name) mark('name', ['f-name']);
        if (r.errs.exp) mark('exp', $('f-expkind').value === 'month' ? ['f-expmonth', 'f-expyear'] : ['f-expdate']);
        if (r.errs.rem) mark('rem', ['f-remnum']);
        if (!r.ok) {
            const first = document.querySelector('#form [aria-invalid="true"]');
            if (first) first.focus();
            return;
        }
        const before = snapshot(), x = r.doc;
        let who = x.who;
        if (who == null) { who = state.nextId++; state.people.push({ id: who, name: x.newName }); }
        let id, msg;
        const fields = { who, type: x.type, name: x.name, exp: x.exp, remind: x.exp.t === 'none' ? C.typeOf(x.type).remind : x.remind, number: x.number, country: x.country, note: x.note };
        if (editing && doc(editing.id)) {
            const d = doc(editing.id);
            if (editing.renew) {
                const same = JSON.stringify(d.exp) === JSON.stringify(x.exp);
                if (!same && d.exp.t !== 'none') d.history = d.history.concat([{ exp: d.exp, on: today, number: d.number !== x.number ? d.number : '' }]).slice(-20);
                d.applied = '';
                msg = 'Saved the new date for ' + C.docTitle(Object.assign({}, d, fields)) + '.';
            } else msg = 'Saved your changes.';
            Object.assign(d, fields);
            id = d.id;
        } else {
            if (state.docs.length >= C.MAX_DOCS) { show('form-msg', 'The list is full (400 documents). Delete old ones first.'); return; }
            id = state.nextId++;
            state.docs.push(Object.assign({ id, applied: '', history: [] }, fields));
            msg = 'Added ' + C.docTitle(fields) + ' for ' + person(who).name + '.';
        }
        closeForm();
        formOpen = false;
        commit();
        show('list-msg', msg, before);
        const box = $('doc-' + id);
        if (box) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); flash(box); }
    }

    function wire() {
        const sel = $('f-type');
        C.TYPES.forEach(t => { const o = el('option', null, t.label); o.value = t.k; sel.appendChild(o); });
        $('form').addEventListener('submit', submit);
        $('form').addEventListener('input', syncForm);
        $('form').addEventListener('change', syncForm);
        $('f-type').addEventListener('change', () => { if (!remTouched) setRemind(C.typeOf($('f-type').value).remind); syncForm(); });
        $('f-rem').addEventListener('change', () => { remTouched = true; if ($('f-rem').value === 'custom' && !$('f-remnum').value) $('f-remnum').value = '4'; syncForm(); });
        $('f-who').addEventListener('change', () => { syncForm(); if ($('f-who').value === 'new') $('f-newname').focus(); });
        $('o-more').addEventListener('click', () => { $('w-more').hidden = false; $('o-more').hidden = true; $('f-number').focus(); });
        $('open-form').addEventListener('click', () => openForm(null));
        $('cancel').addEventListener('click', () => { closeForm(); render(); });
        $('del').addEventListener('click', () => {
            if (!editing) return;
            const d = doc(editing.id); if (!d) return;
            const before = snapshot();
            state.docs = state.docs.filter(x => x.id !== d.id);
            closeForm(); formOpen = false; commit();
            show('list-msg', 'Deleted ' + C.docTitle(d) + '.', before);
        });
        $('t-back').addEventListener('change', () => { state.trip.back = C.isDate($('t-back').value) ? $('t-back').value : ''; commit(); });
        $('t-rule').addEventListener('change', () => { const v = +$('t-rule').value; state.trip.rule = [0, 3, 6].includes(v) ? v : 6; commit(); });
        $('copy-all').addEventListener('click', () => {
            const t = C.listText(state, today);
            if (!t) { show('set-msg', 'There is nothing in your list to copy.'); return; }
            copyText(t).then(ok => show('set-msg', ok ? 'Copied the list. Paste it into a message or a note.' : 'Could not copy. Try "Email the list" instead.'));
        });
        $('cal-all').addEventListener('click', () => calendar(state.docs, 'family-document-reminders.ics', 'set-msg'));
        $('backup').addEventListener('click', () => {
            download('family-documents-backup-' + today + '.json', 'application/json', JSON.stringify({ app: C.SLUG, saved: today, state }));
            show('set-msg', 'Saved a backup file with ' + plural(state.docs.length, 'document') + ' for ' + plural(state.people.length, 'person').replace('persons', 'people') + '.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', () => {
            const file = $('restore-file').files[0]; $('restore-file').value = '';
            if (!file) return;
            if (file.size > 5e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            file.text().then(txt => {
                let data; try { data = JSON.parse(txt); } catch (e) { data = null; }
                const s = data && data.app === C.SLUG ? C.validate(data.state) : null;
                if (!s) { show('set-msg', 'That file is not a backup from this app, so nothing was changed.'); return; }
                const before = snapshot(); state = s; closeForm(); commit(); syncTrip();
                show('set-msg', 'Restored ' + plural(s.docs.length, 'document') + ' from the backup.', before);
            }, () => show('set-msg', 'That file could not be read.'));
        });
        $('wipe').addEventListener('click', () => {
            if (!state.docs.length && !state.people.length) { show('set-msg', 'Your list is already empty.'); return; }
            const before = snapshot(); state = C.emptyState(); closeForm(); commit(); syncTrip();
            show('set-msg', 'Deleted everything.', before);
        });
        // the days left change at midnight
        const tick = () => { if (C.todayIso() !== today) render(); };
        setInterval(tick, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); render(); syncTrip(); } });
    }

    state = load();
    save();
    wire();
    formOpen = !state.people.length;
    resetForm();
    syncTrip();
    render();
    syncForm();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
