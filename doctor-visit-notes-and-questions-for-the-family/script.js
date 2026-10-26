// Doctor Visit Notes and Questions for the Family: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.VisitCore;
    const SLUG = 'doctor-visit-notes-and-questions-for-the-family';
    const KEY = SLUG + '.state';
    const URL_SELF = 'https://umar8092.github.io/apps/' + SLUG + '/';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    let canSave = true, state, today = C.todayIso();
    let edPerson = null, edVisit = null, apptFor = null, edAppt = null;   // what each window is editing
    let focusQ = null;                                                    // the person whose question box gets the focus back after a redraw
    const openHist = new Set(), openAsked = new Set();                   // open "All visits" and "Asked before" lists, kept open across redraws

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved notes could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeAll(); commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['person-msg', 'set-msg'];
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        MSGS.forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) {
            const b = el('button', 'undo', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { restoreSnap(undoSnap); show(id, 'Undone.'); });
            box.appendChild(b);
        }
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 7000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const person = id => C.byId(state.people, id);
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
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(Too long for an email link. Use "Copy" and paste it into the email.)';
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
    function flash(pid) {
        const t = document.querySelector('.person[data-id="' + pid + '"]');
        if (t) { t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1600); }
    }
    function btn(parent, cls, text, fn, aria) {
        const b = el('button', cls, text); b.type = 'button';
        if (aria) b.setAttribute('aria-label', aria);
        b.addEventListener('click', fn); parent.appendChild(b); return b;
    }
    const fileName = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person';

    // ---------- the page ----------
    function render() {
        today = C.todayIso();
        renderUp();
        renderPeople();
        renderSearch();
        renderLists();
        $('add-person').textContent = state.people.length ? '+ Add another person' : '+ Add a person';
    }

    function renderUp() {
        const body = $('up-body'); body.textContent = '';
        const rows = C.comingUp(state, today);
        if (!rows.length) {
            body.appendChild(el('p', 'sum-empty', state.people.length
                ? 'No appointments booked. When one is booked, tap "+ Add an appointment" in the person\'s box, or add the next visit when you write a visit\'s notes.'
                : 'Add the first person below, like a parent, a child or yourself. Then add their questions for the doctor, appointments and visit notes.'));
            return;
        }
        const ul = el('ul', 'glance');
        rows.forEach(r => {
            const li = el('li', r.cls);
            const t = el('div', 'g-text');
            t.appendChild(el('b', null, r.person.name + ':'));
            t.appendChild(document.createTextNode(' '));
            t.appendChild(el('span', null, r.text));
            li.appendChild(t);
            if (r.cls === 'past' || r.cls === 'today') {
                const b = el('div', 'g-btns');
                btn(b, 'mini', 'Add notes', () => openVisit(null, r.appt.id, r.person.id), 'Add notes from ' + r.person.name + '\'s visit to ' + r.appt.doctor);
                if (r.cls === 'past') btn(b, 'mini', 'Remove', () => deleteAppt(r.appt.id), 'Remove ' + r.person.name + '\'s appointment with ' + r.appt.doctor);
                li.appendChild(b);
            }
            ul.appendChild(li);
        });
        body.appendChild(ul);
    }

    function renderPeople() {
        const ul = $('person-list'); ul.textContent = '';
        state.people.forEach(p => ul.appendChild(personBox(p)));
        if (focusQ != null) { const i = document.querySelector('.person[data-id="' + focusQ + '"] .q-input'); if (i) i.focus(); focusQ = null; }
    }

    function personBox(p) {
        const li = el('li', 'person'); li.dataset.id = p.id;
        const top = el('div', 'p-top');
        top.appendChild(el('h3', 'p-name', p.name));
        btn(top, 'mini edit', 'Edit', () => openPerson(p.id), 'Edit ' + p.name);
        li.appendChild(top);
        if (p.note) li.appendChild(el('p', 'p-note', p.note));

        // appointments
        const appts = C.openAppts(state, p.id);
        const ap = el('div', 'part');
        ap.appendChild(el('h4', null, appts.length > 1 ? 'Next visits' : 'Next visit'));
        if (!appts.length) ap.appendChild(el('p', 'muted', 'None booked.'));
        appts.forEach(a => {
            const st = C.apptState(a, today);
            const row = el('div', 'appt ' + st);
            row.appendChild(el('p', 'appt-text', C.apptText(state, a, today).replace(/ \d+ questions? to ask\.$/, '') + (a.note ? ' ' + a.note : '')));
            const acts = el('div', 'act');
            if (st === 'past' || st === 'today') btn(acts, 'mini wide', 'Add notes from this visit', () => openVisit(null, a.id, p.id));
            if (st !== 'past') btn(acts, 'mini', 'Calendar', () => {
                download(fileName(p.name + ' ' + a.doctor) + '-' + a.date + '.ics', 'text/calendar', C.ics(state, a, today, URL_SELF));
                show('person-msg', 'Saved a calendar file for ' + p.name + ' with ' + a.doctor + '. Open it to add it to your calendar.');
            }, 'Add ' + p.name + '\'s appointment with ' + a.doctor + ' to the calendar');
            btn(acts, 'mini', 'Edit', () => openAppt(a.id, p.id), 'Edit the appointment with ' + a.doctor);
            if (st === 'past') btn(acts, 'mini', 'Remove', () => deleteAppt(a.id), 'Remove the appointment with ' + a.doctor);
            row.appendChild(acts);
            ap.appendChild(row);
        });
        li.appendChild(ap);

        // questions
        const qs = C.openQs(state, p.id), asked = C.askedQs(state, p.id);
        const qp = el('div', 'part');
        qp.appendChild(el('h4', null, 'Questions for next time' + (qs.length ? ' (' + qs.length + ')' : '')));
        if (qs.length) {
            const ql = el('ul', 'q-list');
            qs.forEach(q => {
                const qi = el('li', 'q');
                qi.appendChild(el('span', null, q.text));
                btn(qi, 'mini', 'Mark asked', () => markAsked(q.id, true), 'Mark asked: ' + q.text);
                btn(qi, 'mini x', 'Delete', () => deleteQ(q.id), 'Delete question: ' + q.text);
                ql.appendChild(qi);
            });
            qp.appendChild(ql);
        }
        const form = el('form', 'q-form'); form.noValidate = true;
        const qid = 'q-in-' + p.id;
        const lab = el('label', 'sr', 'Add a question for the doctor'); lab.htmlFor = qid; form.appendChild(lab);
        const inp = el('textarea', 'q-input'); inp.id = qid; inp.rows = 1; inp.maxLength = 3000; inp.placeholder = 'Question for the doctor';
        inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); } });
        form.appendChild(inp);
        const add = el('button', 'secondary small', 'Add'); add.type = 'submit'; add.setAttribute('aria-label', 'Add the question for ' + p.name); form.appendChild(add);
        form.addEventListener('submit', e => { e.preventDefault(); addQuestion(p.id, inp.value); });
        qp.appendChild(form);
        if (asked.length) {
            const d = el('details', 'sub-list'); d.open = openAsked.has(p.id);
            d.addEventListener('toggle', () => { if (d.open) openAsked.add(p.id); else openAsked.delete(p.id); });
            d.appendChild(el('summary', null, 'Asked before (' + asked.length + ')'));
            const al = el('ul', 'q-list asked');
            asked.forEach(q => {
                const qi = el('li', 'q');
                qi.appendChild(el('span', null, q.text + ' (asked ' + C.shortDate(q.asked, today) + ')'));
                btn(qi, 'mini', 'Ask again', () => markAsked(q.id, false), 'Ask again: ' + q.text);
                al.appendChild(qi);
            });
            d.appendChild(al);
            qp.appendChild(d);
        }
        li.appendChild(qp);

        // medicines now
        const meds = C.medsNow(state, p.id);
        const mp = el('div', 'part');
        mp.appendChild(el('h4', null, 'Medicines now (from your notes)'));
        if (!meds.length) mp.appendChild(el('p', 'muted', 'None written down yet. Add them as "Started" in a visit\'s notes.'));
        else {
            const ml = el('ul', 'med-now');
            meds.forEach(m => {
                const mi = el('li');
                mi.appendChild(el('b', null, m.name + (m.dose ? ' ' + m.dose : '')));
                mi.appendChild(el('span', null, (m.act === 'change' ? 'Dose changed ' : 'Started ') + C.shortDate(m.date, today) + ', ' + m.doctor));
                ml.appendChild(mi);
            });
            mp.appendChild(ml);
        }
        li.appendChild(mp);

        // visits
        const vs = C.visitsOf(state, p.id).reverse();
        const vp = el('div', 'part');
        if (vs.length) {
            const last = vs[0];
            vp.appendChild(el('h4', null, 'Last visit'));
            vp.appendChild(el('p', 'last', C.shortDate(last.date, today) + ' (' + C.rel(today, last.date) + '), ' + last.doctor + (last.said ? ': ' + (last.said.length > 160 ? last.said.slice(0, 157).trim() + '...' : last.said) : '.')));
        } else vp.appendChild(el('p', 'muted', 'No visits written down yet.'));
        li.appendChild(vp);

        const acts = el('div', 'act');
        btn(acts, 'go', '+ Add visit notes', () => openVisit(null, null, p.id), 'Add visit notes for ' + p.name);
        btn(acts, 'mini wide', '+ Add an appointment', () => openAppt(null, p.id), 'Add an appointment for ' + p.name);
        li.appendChild(acts);

        if (vs.length) {
            const d = el('details', 'hist'); d.open = openHist.has(p.id);
            d.addEventListener('toggle', () => { if (d.open) openHist.add(p.id); else openHist.delete(p.id); });
            d.appendChild(el('summary', null, 'All visits (' + vs.length + ')'));
            const vl = el('ul', 'visit-list');
            vs.forEach(v => vl.appendChild(visitItem(v, false)));
            d.appendChild(vl);
            li.appendChild(d);
        }
        const tools = el('div', 'tools');
        btn(tools, 'mini', 'Print', () => printPerson(p.id), 'Print ' + p.name + '\'s history');
        btn(tools, 'mini', 'Copy', () => copyText(C.historyText(state, p.id, today)).then(ok => show('person-msg', ok ? 'Copied ' + p.name + '\'s history. Paste it into a message or a note.' : 'Could not copy here. Use Email or Print instead.')), 'Copy ' + p.name + '\'s history');
        const mail = el('a', 'mini', 'Email'); mail.href = mailto(p.name + ': doctor visits and medicines', C.historyText(state, p.id, today));
        mail.setAttribute('aria-label', 'Email ' + p.name + '\'s history'); tools.appendChild(mail);
        li.appendChild(tools);
        return li;
    }

    function visitItem(v, withName) {
        const li = el('li', 'visit');
        const top = el('div', 'v-top');
        const p = person(v.person);
        top.appendChild(el('h5', null, (withName && p ? p.name + ', ' : '') + C.shortDate(v.date, today) + ', ' + v.doctor));
        btn(top, 'mini edit', 'Edit', () => openVisit(v.id, null, v.person), 'Edit the visit to ' + v.doctor + ' on ' + C.shortDate(v.date, today));
        li.appendChild(top);
        if (v.reason) li.appendChild(el('p', 'v-line', 'Why: ' + v.reason));
        if (v.said) li.appendChild(el('p', 'v-said', v.said));
        if (v.meds.length) {
            const ml = el('ul', 'v-meds');
            v.meds.forEach(m => ml.appendChild(el('li', 'm-' + m.act, C.medChange(m))));
            li.appendChild(ml);
        }
        if (v.tests) li.appendChild(el('p', 'v-line', 'Tests: ' + v.tests));
        const qs = state.questions.filter(q => q.visit === v.id);
        if (qs.length) li.appendChild(el('p', 'v-line muted', 'Asked: ' + qs.map(q => q.text).join(' / ')));
        const nx = state.appts.find(a => a.fromVisit === v.id);
        if (nx) li.appendChild(el('p', 'v-line muted', 'Next visit booked: ' + C.shortDate(nx.date, today) + (nx.time ? ' at ' + C.niceTime(nx.time) : '')));
        return li;
    }

    function renderSearch() {
        const q = $('q').value, ul = $('q-results'); ul.textContent = '';
        if (!q.trim()) { $('q-count').textContent = ''; return; }
        const found = C.search(state, q);
        $('q-count').textContent = found.length ? C.plural(found.length, 'visit') + ' found, newest first.' : 'No visit notes contain that.';
        found.slice(0, 50).forEach(v => ul.appendChild(visitItem(v, true)));
    }
    function renderLists() {
        const dl = $('doc-list'); dl.textContent = '';
        C.doctors(state).forEach(d => { const o = el('option'); o.value = d; dl.appendChild(o); });
        const ml = $('med-list'); ml.textContent = ''; const seen = new Set();
        state.visits.forEach(v => v.meds.forEach(m => { const k = m.name.toLowerCase(); if (!seen.has(k)) { seen.add(k); const o = el('option'); o.value = m.name; ml.appendChild(o); } }));
    }

    function printPerson(pid) {
        const p = person(pid); if (!p) return;
        const area = $('print-area'); area.textContent = '';
        const lines = C.historyText(state, pid, today).split('\n');
        area.appendChild(el('h1', null, lines[0]));
        area.appendChild(el('pre', null, lines.slice(1).join('\n').trim()));
        document.body.classList.add('printing');
        const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
        window.addEventListener('afterprint', done);
        window.print();
        setTimeout(done, 1500);
    }

    // ---------- questions ----------
    function addQuestion(pid, text) {
        const p = person(pid); if (!p) return;
        if (!text.trim()) { show('person-msg', 'Type a question first, like "Can he fast in Ramadan?".'); focusQ = pid; renderPeople(); return; }
        const before = snapshot();
        const r = C.addQuestions(state, pid, text, today);
        focusQ = pid;
        commit();
        if (!r.added.length) { show('person-msg', r.dup.length ? 'That question is already in ' + p.name + '\'s list.' : 'You have reached the most questions the app keeps.'); return; }
        show('person-msg', (r.added.length === 1 ? 'Added a question for ' : 'Added ' + r.added.length + ' questions for ') + p.name + '.' + (r.dup.length ? ' ' + C.plural(r.dup.length, 'question') + ' already in the list were skipped.' : ''), before);
    }
    function markAsked(qid, asked) {
        const q = C.byId(state.questions, qid); if (!q) return;
        const before = snapshot();
        q.asked = asked ? today : ''; q.visit = 0;
        commit();
        show('person-msg', asked ? 'Marked as asked. It is in "Asked before".' : 'Back in the questions for next time.', before);
    }
    function deleteQ(qid) {
        const before = snapshot();
        state.questions = state.questions.filter(q => q.id !== qid);
        commit();
        show('person-msg', 'Deleted the question.', before);
    }

    // ---------- windows ----------
    function openDlg(id) { const d = $(id); if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); } }
    function closeDlg(id) { const d = $(id); if (d.open) { if (d.close) d.close(); else d.removeAttribute('open'); } }
    function closeAll() { ['d-person', 'd-visit', 'd-appt'].forEach(closeDlg); edPerson = edVisit = apptFor = edAppt = null; }
    function clearErrors(form) {
        form.querySelectorAll('.err').forEach(e => { e.textContent = ''; });
        form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    }
    function showErrors(errors, map) {
        let first = null;
        Object.keys(errors).forEach(k => {
            const m = map[k]; if (!m) return;
            $(m[1]).textContent = errors[k];
            const f = $(m[0]); if (f) { f.setAttribute('aria-invalid', 'true'); if (!first) first = f; }
        });
        if (first) first.focus();
    }
    function showPart(w, o, on) { $(w).hidden = !on; $(o).hidden = on; }
    function fillPeople(sel, pid) {
        sel.textContent = '';
        state.people.forEach(p => { const o = el('option', null, p.name); o.value = p.id; sel.appendChild(o); });
        sel.value = String(pid);
    }

    // a person
    function openPerson(id) {
        closeAll();
        const p = id != null ? person(id) : null;
        edPerson = p ? p.id : null;
        const f = $('f-person'); f.reset(); clearErrors(f);
        $('dp-h').textContent = p ? 'Edit ' + p.name : 'Add a person';
        $('p-save').textContent = p ? 'Save' : 'Add person';
        $('p-name').value = p ? p.name : '';
        $('p-note').value = p ? p.note : '';
        showPart('pw-note', 'po-note', !!(p && p.note));
        $('p-edit').hidden = !p;
        $('p-del').textContent = p ? 'Delete ' + p.name + ' and all their notes' : '';
        openDlg('d-person');
        $('p-name').focus();
    }
    function submitPerson(e) {
        e.preventDefault();
        const f = $('f-person'); clearErrors(f);
        const r = C.readPerson({ name: $('p-name').value, note: $('pw-note').hidden ? '' : $('p-note').value }, state, edPerson);
        if (r.errors) return showErrors(r.errors, { name: ['p-name', 'pe-name'] });
        const before = snapshot();
        let p = edPerson != null ? person(edPerson) : null;
        if (p) Object.assign(p, r.person);
        else { p = Object.assign({ id: C.newId(state) }, r.person); state.people.push(p); }
        const editing = edPerson != null;
        closeAll(); commit();
        show('person-msg', editing ? 'Saved.' : 'Added ' + p.name + '. Add their questions for the doctor, an appointment or the notes from a visit.', before);
        flash(p.id);
    }
    function deletePerson() {
        const p = person(edPerson); if (!p) return;
        const before = snapshot();
        C.deletePerson(state, p.id);
        closeAll(); commit();
        show('person-msg', 'Deleted ' + p.name + ' and all their notes.', before);
    }

    // a visit: id edits that visit; aid writes the notes for that appointment; pid is the person whose box it came from
    function openVisit(id, aid, pid) {
        closeAll();
        const v = id != null ? C.byId(state.visits, id) : null, a = aid != null ? C.byId(state.appts, aid) : null;
        edVisit = v ? v.id : null; apptFor = a ? a.id : null;
        const f = $('f-visit'); f.reset(); clearErrors(f);
        const who = v ? v.person : a ? a.person : pid;
        fillPeople($('v-person'), who);
        $('dv-h').textContent = v ? 'Edit visit notes' : 'Add visit notes';
        $('v-for').textContent = a ? 'For the appointment with ' + a.doctor + ' on ' + C.shortDate(a.date, today) + '.' : '';
        $('v-date').value = v ? v.date : a && a.date <= today ? a.date : today;
        $('v-date').max = today;
        $('v-doctor').value = v ? v.doctor : a ? a.doctor : '';
        $('v-reason').value = v ? v.reason : '';
        showPart('vw-reason', 'vo-reason', !!(v && v.reason));
        $('v-said').value = v ? v.said : '';
        $('v-tests').value = v ? v.tests : '';
        showPart('vw-tests', 'vo-tests', !!(v && v.tests));
        const nx = v ? state.appts.find(x => x.fromVisit === v.id) : null;
        $('v-next').value = nx ? nx.date : ''; $('v-next-time').value = nx ? nx.time : '';
        showPart('vw-next', 'vo-next', !!nx);
        $('v-meds').textContent = '';
        (v ? v.meds : []).forEach(m => addMedRow(m));
        updMedHint();
        fillAsked(v ? state.questions.filter(q => q.visit === v.id).map(q => q.id) : []);
        $('v-edit').hidden = !v;
        $('v-warn').textContent = '';
        openDlg('d-visit');
        (v || a ? $('v-said') : $('v-doctor')).focus();
    }
    function fillAsked(checked) {
        const pid = Number($('v-person').value), box = $('v-asked'); box.textContent = '';
        const qs = state.questions.filter(q => q.person === pid && (!q.asked || (edVisit != null && q.visit === edVisit)));
        $('v-asked-box').hidden = !qs.length;
        qs.forEach(q => {
            const l = el('label', 'check');
            const c = el('input'); c.type = 'checkbox'; c.value = q.id; c.checked = checked.includes(q.id);
            l.appendChild(c); l.appendChild(el('span', null, q.text));
            box.appendChild(l);
        });
    }
    let medSeq = 0;
    function addMedRow(m) {
        const n = ++medSeq;
        const li = el('li', 'med-row');
        const l1 = el('label', null, 'What the doctor did'); l1.htmlFor = 'm-act-' + n;
        const s = el('select'); s.id = 'm-act-' + n; s.className = 'm-act';
        [['start', 'Started a medicine'], ['change', 'Changed the dose'], ['stop', 'Stopped a medicine']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; s.appendChild(o); });
        s.value = m && m.act ? m.act : 'start';
        const l2 = el('label', null, 'Medicine'); l2.htmlFor = 'm-name-' + n;
        const i1 = el('input'); i1.type = 'text'; i1.id = 'm-name-' + n; i1.className = 'm-name'; i1.maxLength = 60; i1.autocomplete = 'off'; i1.placeholder = 'e.g. Metformin'; i1.setAttribute('list', 'med-list'); i1.value = m ? m.name : '';
        const dw = el('div', 'm-dose-w');
        const l3 = el('label', null, 'New dose and how often (optional)'); l3.htmlFor = 'm-dose-' + n;
        const i2 = el('input'); i2.type = 'text'; i2.id = 'm-dose-' + n; i2.className = 'm-dose'; i2.maxLength = 80; i2.autocomplete = 'off'; i2.placeholder = 'e.g. 5 mg at night'; i2.value = m ? m.dose : '';
        dw.appendChild(l3); dw.appendChild(i2);
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); err.id = 'm-err-' + n;
        i1.setAttribute('aria-describedby', err.id);
        const sync = () => { dw.hidden = s.value === 'stop'; l3.textContent = s.value === 'start' ? 'Dose and how often (optional)' : 'New dose and how often (optional)'; };
        s.addEventListener('change', sync); sync();
        [l1, s, l2, i1, dw, err].forEach(x => li.appendChild(x));
        btn(li, 'link rm', 'Remove this medicine', () => { li.remove(); updMedHint(); });
        $('v-meds').appendChild(li);
        updMedHint();
        return i1;
    }
    function updMedHint() {
        const n = $('v-meds').children.length;
        $('v-add-med').textContent = n ? '+ Add another medicine change' : '+ Add a medicine change';
        $('v-add-med').hidden = n >= C.MAX_MEDS;
    }
    function nextFrom(b) {
        const base = C.isDate($('v-date').value) ? $('v-date').value : today;
        return b.dataset.m ? C.addMonths(base, Number(b.dataset.m)) : C.addDays(base, Number(b.dataset.d));
    }
    function submitVisit(e) {
        e.preventDefault();
        const f = $('f-visit'); clearErrors(f);
        const rows = [...$('v-meds').children];
        const input = {
            person: $('v-person').value, date: $('v-date').value, doctor: $('v-doctor').value,
            reason: $('vw-reason').hidden ? '' : $('v-reason').value, said: $('v-said').value, tests: $('vw-tests').hidden ? '' : $('v-tests').value,
            meds: rows.map(r => ({ act: r.querySelector('.m-act').value, name: r.querySelector('.m-name').value, dose: r.querySelector('.m-dose').value })),
            next: $('vw-next').hidden ? null : { date: $('v-next').value, time: $('v-next-time').value },
            asked: [...$('v-asked').querySelectorAll('input:checked')].map(c => Number(c.value))
        };
        const r = C.readVisit(input, state, today, edVisit);
        if (r.errors) {
            const map = { person: ['v-person', 've-person'], date: ['v-date', 've-date'], doctor: ['v-doctor', 've-doctor'], next: ['v-next', 've-next'] };
            rows.forEach((row, i) => { map['med' + i] = [row.querySelector('.m-name').id, row.querySelector('.err').id]; });
            return showErrors(r.errors, map);
        }
        const before = snapshot(), editing = edVisit != null;
        const res = C.saveVisit(state, r, edVisit, apptFor);
        const p = person(res.visit.person);
        closeAll(); commit();
        const bits = [editing ? 'Saved the visit notes.' : 'Saved ' + p.name + '\'s visit to ' + res.visit.doctor + '.'];
        if (res.linked && !editing) bits.push('The appointment on ' + C.shortDate(res.linked.date, today) + ' is done.');
        if (r.next) bits.push('Next visit: ' + C.shortDate(r.next.date, today) + (r.next.time ? ' at ' + C.niceTime(r.next.time) : '') + '.');
        if (r.warn) bits.push(r.warn);
        show('person-msg', bits.join(' '), before);
        flash(p.id);
    }
    function deleteVisit() {
        const v = C.byId(state.visits, edVisit); if (!v) return;
        const before = snapshot();
        C.deleteVisit(state, v.id);
        closeAll(); commit();
        show('person-msg', 'Deleted the visit to ' + v.doctor + ' on ' + C.shortDate(v.date, today) + '.', before);
    }

    // an appointment
    function openAppt(id, pid) {
        closeAll();
        const a = id != null ? C.byId(state.appts, id) : null;
        edAppt = a ? a.id : null;
        const f = $('f-appt'); f.reset(); clearErrors(f);
        fillPeople($('a-person'), a ? a.person : pid);
        $('da-h').textContent = a ? 'Edit the appointment' : 'Add an appointment';
        $('a-save').textContent = a ? 'Save' : 'Add appointment';
        $('a-doctor').value = a ? a.doctor : '';
        $('a-date').value = a ? a.date : '';
        $('a-time').value = a ? a.time : '';
        $('a-note').value = a ? a.note : '';
        showPart('aw-note', 'ao-note', !!(a && a.note));
        $('a-edit').hidden = !a;
        $('a-warn').textContent = '';
        openDlg('d-appt');
        $('a-doctor').focus();
    }
    function submitAppt(e) {
        e.preventDefault();
        const f = $('f-appt'); clearErrors(f);
        const r = C.readAppt({ person: $('a-person').value, doctor: $('a-doctor').value, date: $('a-date').value, time: $('a-time').value, note: $('aw-note').hidden ? '' : $('a-note').value }, state, today);
        if (r.errors) return showErrors(r.errors, { person: ['a-person', 'ae-person'], doctor: ['a-doctor', 'ae-doctor'], date: ['a-date', 'ae-date'], time: ['a-time', 'ae-time'] });
        const before = snapshot();
        let a = edAppt != null ? C.byId(state.appts, edAppt) : null;
        if (a) Object.assign(a, r.appt);
        else { a = Object.assign({ id: C.newId(state) }, r.appt, { fromVisit: 0, done: 0 }); state.appts.push(a); }
        const editing = edAppt != null;
        closeAll(); commit();
        const p = person(a.person);
        show('person-msg', (editing ? 'Saved the appointment: ' : 'Added ' + p.name + '\'s appointment: ') + a.doctor + ', ' + C.shortDate(a.date, today) + (a.time ? ' at ' + C.niceTime(a.time) : '') + ' (' + C.rel(today, a.date) + ').' + (r.warn ? ' ' + r.warn : ''), before);
        flash(p.id);
    }
    function deleteAppt(id) {
        const a = C.byId(state.appts, id); if (!a) return;
        const before = snapshot();
        state.appts = state.appts.filter(x => x.id !== id);
        closeAll(); commit();
        show('person-msg', 'Removed the appointment with ' + a.doctor + ' on ' + C.shortDate(a.date, today) + '.', before);
    }

    // ---------- wiring ----------
    function init() {
        state = load();
        $('add-person').addEventListener('click', () => openPerson(null));
        document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeAll()));
        $('d-person').addEventListener('close', () => { edPerson = null; });
        $('d-visit').addEventListener('close', () => { edVisit = apptFor = null; });
        $('d-appt').addEventListener('close', () => { edAppt = null; });

        $('f-person').addEventListener('submit', submitPerson);
        $('po-note').addEventListener('click', () => { showPart('pw-note', 'po-note', true); $('p-note').focus(); });
        $('p-del').addEventListener('click', deletePerson);

        $('f-visit').addEventListener('submit', submitVisit);
        $('v-person').addEventListener('change', () => fillAsked([]));
        $('v-quick').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $('v-date').value = C.addDays(today, -Number(b.dataset.ago)); $('ve-date').textContent = ''; $('v-date').removeAttribute('aria-invalid'); });
        $('vo-reason').addEventListener('click', () => { showPart('vw-reason', 'vo-reason', true); $('v-reason').focus(); });
        $('vo-tests').addEventListener('click', () => { showPart('vw-tests', 'vo-tests', true); $('v-tests').focus(); });
        $('vo-next').addEventListener('click', () => { showPart('vw-next', 'vo-next', true); $('v-next').focus(); });
        $('v-next-clear').addEventListener('click', () => { $('v-next').value = ''; $('v-next-time').value = ''; $('ve-next').textContent = ''; $('v-next').removeAttribute('aria-invalid'); showPart('vw-next', 'vo-next', false); $('vo-next').focus(); });
        $('v-quick-next').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $('v-next').value = nextFrom(b); $('ve-next').textContent = ''; $('v-next').removeAttribute('aria-invalid'); });
        $('v-add-med').addEventListener('click', () => addMedRow(null).focus());
        $('v-del').addEventListener('click', deleteVisit);

        $('f-appt').addEventListener('submit', submitAppt);
        $('a-quick').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $('a-date').value = b.dataset.m ? C.addMonths(today, Number(b.dataset.m)) : C.addDays(today, Number(b.dataset.d)); $('ae-date').textContent = ''; $('a-date').removeAttribute('aria-invalid'); });
        $('ao-note').addEventListener('click', () => { showPart('aw-note', 'ao-note', true); $('a-note').focus(); });
        $('a-del').addEventListener('click', () => { if (edAppt != null) deleteAppt(edAppt); });

        $('q').addEventListener('input', renderSearch);

        $('backup').addEventListener('click', () => {
            download('doctor-visit-notes-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1));
            show('set-msg', 'Saved a backup file with ' + C.plural(state.people.length, 'person').replace('persons', 'people') + ' and ' + C.plural(state.visits.length, 'visit') + '.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => {
            const f = e.target.files && e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (f.size > 10e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            const r = new FileReader();
            r.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(String(r.result))); } catch (err) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
                const before = snapshot(); state = s; closeAll(); commit();
                show('set-msg', 'Restored ' + C.plural(s.people.length, 'person').replace('persons', 'people') + ' and ' + C.plural(s.visits.length, 'visit') + '.', before);
            };
            r.onerror = () => show('set-msg', 'Could not read that file.');
            r.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.people.length) { show('set-msg', 'There is nothing to delete.'); return; }
            const before = snapshot(); state = C.emptyState(); closeAll(); commit();
            show('set-msg', 'Deleted everything.', before);
        });
        // a new day while the page stays open
        const tick = () => { if (C.todayIso() !== today) render(); };
        setInterval(tick, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        if (!canSave) $('storage-warn').hidden = false;
        render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
