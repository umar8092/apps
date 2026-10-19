// Class Attendance Tracker for Students: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.AttendCore;
    const KEY = 'class-attendance-tracker-for-students.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };

    let canSave = true, state, today = C.todayIso();
    let editing = null;      // id of the subject in the form, or null for a new one
    let formOpen = false;
    const RULES = ['60', '65', '70', '75', '80', '85', '90'];
    const KIND = { p: 'Present', a: 'Absent', c: 'Cancelled' };

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved subjects could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeForm(); commit(); }
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
    const subj = id => state.subjects.find(s => s.id === id);
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
    function flash(box) { if (!box) return; box.classList.add('flash'); setTimeout(() => box.classList.remove('flash'), 1600); }

    // ---------- the page ----------
    function render() {
        today = C.todayIso();
        renderSummary();
        renderSubjects();
        renderLast();
        if (!state.subjects.length) formOpen = true;
        $('form').hidden = !formOpen;
        $('open-form').hidden = formOpen;
        $('app').classList.toggle('setup', !state.subjects.length);
        const has = state.subjects.length > 0;
        ['copy-all', 'new-term', 'backup'].forEach(id => { $(id).disabled = !has; });
        $('mail-all').href = 'mailto:?subject=' + encodeURIComponent('My class attendance') + '&body=' + encodeURIComponent(has ? C.listText(state, today) : '');
        $('mail-all').classList.toggle('off', !has);
        $('mail-all').setAttribute('aria-disabled', has ? 'false' : 'true');
        $('wipe').disabled = !has && !state.last;
    }

    function renderSummary() {
        const body = $('sum-body'); body.textContent = '';
        if (!state.subjects.length) {
            body.appendChild(el('p', 'sum-empty', 'Add your subjects with the classes held and attended so far (from your college portal or register). You will see how many classes you can still miss in each one.'));
            return;
        }
        const sm = C.summary(state.subjects);
        const n = state.subjects.length;
        let head;
        if (sm.below.length > 1) head = sm.below.length + ' subjects are below the line';
        else if (sm.below.length === 1) head = sm.below[0].s.name + ' is below ' + C.pctLabel(sm.below[0].s.bp);
        else if (sm.edge.length) head = 'Careful: do not miss ' + sm.edge.map(r => r.s.name).join(', ');
        else if (sm.safe.length) head = n === 1 ? 'Your subject is safe' : sm.none.length ? 'Every subject with classes is safe' : 'All ' + n + ' subjects are safe';
        else head = 'No classes marked yet';
        const h = el('p', 'next' + (sm.below.length ? ' bad-ink' : sm.edge.length ? ' warn-ink' : ''), head);
        body.appendChild(h);
        const list = el('ul', 'sum-list');
        sm.below.forEach(r => {
            const t = r.st.need == null ? 'cannot get back to ' + C.pctLabel(r.s.bp) : 'attend the next ' + C.classes(r.st.need);
            list.appendChild(sumItem(r, 'below', r.st.pct + ': ' + t));
        });
        sm.edge.forEach(r => list.appendChild(sumItem(r, 'edge', r.st.pct + ': do not miss the next class')));
        if (list.children.length) body.appendChild(list);
        if (sm.safe.length) {
            const p = el('p', 'sum-safe');
            p.appendChild(el('b', null, 'You can still miss: '));
            p.appendChild(document.createTextNode(sm.safe.map(r => r.s.name + ' ' + r.st.canMiss).join(', ')));
            body.appendChild(p);
        }
        if (sm.none.length) body.appendChild(el('p', 'sum-next', 'No classes marked yet: ' + sm.none.map(r => r.s.name).join(', ')));
        const o = sm.all;
        if (o.held && n > 1) body.appendChild(el('p', 'sum-next', 'All subjects together: ' + o.att + ' of ' + o.held + ' (' + o.pct + ')' +
            (o.oneRule != null ? (o.safe ? ', above ' : ', below ') + C.pctLabel(o.oneRule) : '') + '.'));
    }
    function sumItem(r, cls, text) {
        const li = el('li', cls);
        const b = btn('jump', '', () => { const box = document.querySelector('[data-id="' + r.s.id + '"]'); if (box) { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); flash(box); } }, 'Go to ' + r.s.name);
        b.appendChild(el('b', null, r.s.name + ' '));
        b.appendChild(document.createTextNode(text));
        li.appendChild(b);
        return li;
    }

    function renderSubjects() {
        const ul = $('subjects'); ul.textContent = '';
        $('empty').hidden = state.subjects.length > 0;
        state.subjects.forEach(s => ul.appendChild(subjectBox(s)));
    }
    function subjectBox(s) {
        const st = C.stats(s), adv = C.advice(st);
        const li = el('li', 'box ' + st.status); li.dataset.id = s.id;
        const top = el('div', 'box-top');
        top.appendChild(el('h3', 'box-name', s.name));
        top.appendChild(el('span', 'badge ' + st.status, C.badge(st, s.bp)));
        li.appendChild(top);

        const big = el('p', 'big');
        if (s.held) { big.appendChild(el('b', 'pct', st.pct)); big.appendChild(document.createTextNode(' ' + s.att + ' of ' + s.held + ' classes attended')); }
        else big.textContent = '0 classes so far';
        li.appendChild(big);

        // bar with the required line
        const bar = el('div', 'bar'); bar.setAttribute('aria-hidden', 'true');
        const fill = el('span', 'fill'); fill.style.width = (s.held ? Math.floor(s.att * 1000 / s.held) / 10 : 0) + '%'; bar.appendChild(fill);
        const mk = el('span', 'mark'); mk.style.left = (s.bp / 100) + '%'; bar.appendChild(mk);
        li.appendChild(bar);

        li.appendChild(el('p', 'adv', adv.main));
        if (adv.extra) li.appendChild(el('p', 'adv2', adv.extra));
        if (st.status !== 'none') li.appendChild(el('p', 'whatif', 'Next class: attend and you are at ' + st.ifAttend + ', miss it and you are at ' + st.ifMiss + '.'));
        const plan = C.planText(st);
        if (plan) li.appendChild(el('p', 'plan' + (st.plan.impossible ? ' bad' : ''), plan));

        const meta = ['Needs ' + C.pctLabel(s.bp)];
        if (s.w > 1) meta.push('each class counts as ' + s.w);
        const cancelled = s.log.filter(e => e.k === 'c').length;
        if (cancelled) meta.push(cancelled + ' cancelled (not counted)');
        li.appendChild(el('p', 'box-sub', meta.join(' · ')));

        const row = el('div', 'box-btns marks');
        row.appendChild(btn('mini strong present', 'Present', () => markClass(s.id, 'p'), s.name + ': mark Present'));
        row.appendChild(btn('mini strong absent', 'Absent', () => markClass(s.id, 'a'), s.name + ': mark Absent'));
        row.appendChild(btn('mini cancelled', 'Cancelled', () => markClass(s.id, 'c'), s.name + ': mark class Cancelled'));
        li.appendChild(row);

        if (s.log.length) {
            const last = s.log.slice(-5).reverse();
            const p = el('p', 'recent');
            p.appendChild(el('span', 'recent-h', 'Last marked: '));
            last.forEach((e, i) => { const t = el('span', 'tag ' + e.k, KIND[e.k] + ' ' + C.shortDate(e.d)); p.appendChild(t); if (i < last.length - 1) p.appendChild(document.createTextNode(' ')); });
            li.appendChild(p);
        }
        const row2 = el('div', 'box-btns two');
        row2.appendChild(btn('mini', 'Edit or fix totals', () => openForm(s.id), 'Edit ' + s.name));
        row2.appendChild(btn('mini', 'Copy', () => copyText(C.subjectText(s)).then(ok => show('list-msg', ok ? 'Copied ' + s.name + '.' : 'Could not copy. Select the text and copy it yourself.')), 'Copy ' + s.name));
        li.appendChild(row2);
        return li;
    }

    function markClass(id, kind) {
        const s = subj(id); if (!s) return;
        const snap = snapshot();
        const n = C.mark(s, kind, C.todayIso());
        if (!n) { show('list-msg', s.name + ' already has ' + C.MAX_COUNT + ' classes, the most this app can count.'); return; }
        state.subjects[state.subjects.indexOf(s)] = n;
        commit();
        const st = C.stats(n);
        const what = kind === 'c' ? 'class cancelled, not counted' : KIND[kind] + ' marked';
        show('list-msg', n.name + ': ' + what + '. ' + (n.held ? n.att + ' of ' + n.held + ' (' + st.pct + ').' : ''), snap);
        flash(document.querySelector('[data-id="' + id + '"]'));
    }

    function renderLast() {
        const L = state.last; $('last').hidden = !L;
        if (!L) return;
        $('last-h').textContent = 'Last term' + (L.ended ? ' (ended ' + C.longDate(L.ended) + ')' : '');
        const ul = $('last-list'); ul.textContent = '';
        L.subjects.forEach(s => ul.appendChild(el('li', null, s.name + ': ' + (s.held ? s.att + ' of ' + s.held + ' (' + C.pctOf(s.att, s.held) + ')' : 'no classes') + ', needed ' + C.pctLabel(s.bp))));
    }

    // ---------- the form ----------
    function ruleValue(bp) { const r = String(bp / 100); return RULES.includes(r) ? r : 'other'; }
    function formValues() {
        return { name: $('f-name').value, rule: $('f-rule').value, pct: $('f-pct').value, held: $('f-held').value, att: $('f-att').value, w: $('f-w').value, left: $('f-left').value };
    }
    function syncForm() { $('w-pct').hidden = $('f-rule').value !== 'other'; preview(); }
    function clearErrors() {
        ['name', 'pct', 'held', 'att', 'left'].forEach(k => { $('e-' + k).textContent = ''; $('f-' + k).removeAttribute('aria-invalid'); });
    }
    function preview() {
        const r = C.readForm(formValues(), state.subjects.filter(s => s.id !== editing));
        const p = $('preview');
        if (!r.ok) { p.textContent = ''; return; }
        const st = C.stats(r.subject), a = C.advice(st);
        p.textContent = (r.subject.held ? r.subject.att + ' of ' + r.subject.held + ' (' + st.pct + '). ' : '') + a.main + (C.planText(st) ? ' ' + C.planText(st) : '');
    }
    function setMore(open) { $('w-more').hidden = !open; $('o-more').setAttribute('aria-expanded', String(open)); $('o-more').textContent = (open ? '− ' : '+ ') + 'Labs and classes left this term (optional)'; }
    function resetForm() {
        editing = null;
        $('form').reset();
        $('f-rule').value = ruleValue(state.rule);
        $('f-pct').value = ruleValue(state.rule) === 'other' ? C.pctLabel(state.rule).replace('%', '') : '';
        $('f-w').value = '1';
        setMore(false);
        clearErrors();
        $('form-h').textContent = 'Add a subject';
        $('save').textContent = 'Add subject';
        $('cancel').textContent = state.subjects.length ? 'Close' : 'Clear';
        $('del').hidden = true;
        syncForm();
    }
    function openForm(id) {
        formOpen = true; resetForm();
        if (id != null) {
            const s = subj(id); if (!s) return;
            editing = id;
            $('f-name').value = s.name;
            $('f-rule').value = ruleValue(s.bp);
            $('f-pct').value = ruleValue(s.bp) === 'other' ? C.pctLabel(s.bp).replace('%', '') : '';
            $('f-held').value = String(s.held); $('f-att').value = String(s.att);
            $('f-w').value = String(s.w); $('f-left').value = s.left == null ? '' : String(s.left);
            setMore(s.w > 1 || s.left != null);
            $('form-h').textContent = 'Edit ' + s.name;
            $('save').textContent = 'Save changes';
            $('cancel').textContent = 'Cancel';
            $('del').hidden = false;
            syncForm();
        }
        render();
        $('add').scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => $('f-name').focus({ preventScroll: true }), 300);
    }
    function closeForm() { formOpen = false; resetForm(); }

    function submit(e) {
        e.preventDefault();
        clearErrors();
        const r = C.readForm(formValues(), state.subjects.filter(s => s.id !== editing));
        if (!r.ok) {
            let first = null;
            Object.keys(r.errors).forEach(k => { $('e-' + k).textContent = r.errors[k]; $('f-' + k).setAttribute('aria-invalid', 'true'); first = first || k; });
            if (r.errors.left) setMore(true);
            $('f-' + first).focus();
            return;
        }
        const snap = snapshot();
        const v = r.subject;
        state.rule = v.bp;
        if (editing != null) {
            const s = subj(editing);
            Object.assign(s, v);
            const name = s.name, id = s.id;
            formOpen = false; resetForm(); commit();
            show('list-msg', 'Saved ' + name + '.', snap);
            flash(document.querySelector('[data-id="' + id + '"]'));
            return;
        }
        if (state.subjects.length >= C.MAX_SUBJECTS) { show('form-msg', 'You can keep up to ' + C.MAX_SUBJECTS + ' subjects.'); return; }
        const s = Object.assign({ id: state.nextId++ }, v, { log: [] });
        state.subjects.push(s);
        resetForm(); commit();
        show('form-msg', 'Added ' + s.name + '. Add your next subject, or tap Close.', snap);
        $('f-name').focus({ preventScroll: true });
    }
    function del() {
        const s = subj(editing); if (!s) return;
        const snap = snapshot();
        state.subjects = state.subjects.filter(x => x.id !== s.id);
        formOpen = false; resetForm(); commit();
        show(state.subjects.length ? 'list-msg' : 'form-msg', 'Deleted ' + s.name + '.', snap);
    }

    // ---------- share, new term, backup ----------
    function wire() {
        $('form').addEventListener('submit', submit);
        $('form').addEventListener('input', () => preview());
        $('f-rule').addEventListener('change', () => { syncForm(); if ($('f-rule').value === 'other') $('f-pct').focus(); });
        $('o-more').addEventListener('click', () => setMore($('w-more').hidden));
        $('cancel').addEventListener('click', () => { if (state.subjects.length) { closeForm(); render(); } else resetForm(); });
        $('del').addEventListener('click', del);
        $('open-form').addEventListener('click', () => openForm(null));
        $('copy-all').addEventListener('click', () => copyText(C.listText(state, today)).then(ok => show('set-msg', ok ? 'Copied all subjects. Paste them into a message.' : 'Could not copy on this browser.')));
        $('mail-all').addEventListener('click', e => { if (!state.subjects.length) { e.preventDefault(); show('set-msg', 'Add a subject first.'); } });
        $('new-term').addEventListener('click', () => {
            if (!state.subjects.length) return;
            const snap = snapshot();
            state.last = { ended: C.todayIso(), term: state.term, subjects: state.subjects.map(s => Object.assign({}, s, { log: [] })) };
            state.subjects = []; state.term = '';
            closeForm(); commit();
            show('set-msg', 'New term started. Last term is kept below. Add this term\'s subjects.', snap);
        });
        $('backup').addEventListener('click', () => {
            download('class-attendance-backup-' + C.todayIso() + '.json', 'application/json', JSON.stringify({ app: C.SLUG, saved: new Date().toISOString(), state }, null, 1));
            show('set-msg', 'Saved a backup file. Keep it to move your subjects to another phone or browser.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', () => {
            const f = $('restore-file').files[0]; if (!f) return;
            if (f.size > 2e6) { show('set-msg', 'That file is too big to be a backup from this app.'); $('restore-file').value = ''; return; }
            const rd = new FileReader();
            rd.onload = () => {
                const s = C.readBackup(String(rd.result));
                $('restore-file').value = '';
                if (!s) { show('set-msg', 'That file is not a backup from Class Attendance Tracker. Nothing was changed.'); return; }
                const snap = snapshot();
                state = s; closeForm(); commit();
                show('set-msg', 'Restored ' + s.subjects.length + (s.subjects.length === 1 ? ' subject.' : ' subjects.'), snap);
            };
            rd.onerror = () => show('set-msg', 'Could not read that file.');
            rd.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            const snap = snapshot();
            state = C.emptyState(); closeForm(); commit();
            show('set-msg', 'Deleted everything.', snap);
        });
        // a new day: refresh the dates
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayIso() !== today) render(); });
    }

    state = load();
    wire();
    resetForm();
    if (!state.subjects.length) formOpen = true;
    render();
    save();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
