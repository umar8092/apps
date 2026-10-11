// Page code for Medication Tracker. The logic lives in core.js (MedCore).
(function () {
    const C = window.MedCore, KEY = 'medication-tracker.state', RANGE_KEY = 'medication-tracker.range';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fk, label) => { const b = el('button', cls, text); b.type = 'button'; if (fk) b.dataset.fk = fk; if (label) b.setAttribute('aria-label', label); return b; };
    const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const now = () => Date.now();
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    // ---- formatting in the person's own clock style (8:00 PM or 20:00)
    let tf; try { tf = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }); } catch (e) { tf = null; }
    const fmtTime = ms => { if (tf) return tf.format(new Date(ms)); const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    const fmtSlot = (day, time) => fmtTime(C.slotAt(day, time));
    let df; try { df = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { df = null; }
    const fmtDate = day => df ? df.format(new Date(C.dayStart(day) + 12 * C.HOUR)) : day;
    function dayName(day) {
        const t = C.dayKey(now());
        return day === t ? 'Today' : day === C.addDays(t, -1) ? 'Yesterday' : fmtDate(day);
    }
    const pad = n => String(n).padStart(2, '0');
    const toInput = ms => { const d = new Date(ms); return C.dayKey(ms) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    function fromInput(v) {
        const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(v || '');
        return m && C.isDay(m[1]) && C.isTime(m[2]) ? C.slotAt(m[1], m[2]) : null;
    }

    // ---- saved state
    let state = load(), canSave = true, editingId = null, editLog = null, pendingFocus = null;
    function load() {
        try { const raw = localStorage.getItem(KEY); return C.clean(raw ? JSON.parse(raw) : null, now()); } catch (e) { return C.clean(null); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { if (canSave) { canSave = false; say($('tools-msg'), 'This browser is not saving (private mode or storage blocked). Everything works until you close the page.'); } }
    }
    const snapshot = () => JSON.parse(JSON.stringify(state));
    function restore(snap) { state = C.clean(snap, now()); editLog = null; save(); render(); }
    const medById = id => state.meds.find(m => m.id === id);

    // a short message with an optional Undo button
    function say(box, text, undo) {
        box.textContent = text;
        if (undo) {
            const b = btn(null, 'Undo'); b.dataset.fk = 'undo';
            b.addEventListener('click', () => { undo(); box.textContent = ''; });
            box.appendChild(b);
        }
    }
    const clearMsgs = () => ['today-msg', 'form-msg', 'hist-msg', 'tools-msg'].forEach(id => { if (id !== 'tools-msg' || canSave) $(id).textContent = ''; });

    // ---- confirm dialog for double doses
    function ask(text) {
        const d = $('confirm');
        $('c-text').textContent = text;
        return new Promise(res => {
            const done = v => { d.removeEventListener('close', onClose); $('c-yes').onclick = $('c-no').onclick = null; if (d.open) d.close(); res(v); };
            const onClose = () => done(false);
            $('c-yes').onclick = () => done(true);
            $('c-no').onclick = () => done(false);
            d.addEventListener('close', onClose);
            if (typeof d.showModal === 'function') { d.showModal(); $('c-no').focus(); } else res(window.confirm(text + '\n\nLog it anyway?'));
        });
    }

    // ---- logging doses
    function slotLabel(med, slot) {
        if (!slot) return med.name;
        const day = slot.slice(0, 10), t = slot.slice(11);
        return med.name + ', ' + (day === C.dayKey(now()) ? '' : day === C.addDays(C.dayKey(now()), -1) ? 'yesterday ' : fmtDate(day) + ' ') + fmtSlot(day, t) + ' dose';
    }
    async function take(med, slot) {
        clearMsgs();
        const t = now(), warn = C.checkDose(state, med, t, fmtTime);
        if (warn && !await ask(warn)) { $('today-msg').textContent = 'Not logged.'; return; }
        const snap = snapshot(), t2 = now();
        state.logs.push({ id: newId('l'), med: med.id, t: t2, c: t2, slot: slot || null, skip: false, pills: med.perDose });
        save(); pendingFocus = slot ? 'chg|' + med.id + '|' + slot : 'take|' + med.id + '|';
        render();
        say($('today-msg'), slotLabel(med, slot) + ': taken at ' + fmtTime(t2) + '.', () => restore(snap));
    }
    function skip(med, slot) {
        clearMsgs();
        const snap = snapshot();
        state.logs.push({ id: newId('l'), med: med.id, t: now(), c: now(), slot, skip: true, pills: 0 });
        save(); pendingFocus = 'unskip|' + med.id + '|' + slot; render();
        say($('today-msg'), slotLabel(med, slot) + ': skipped.', () => restore(snap));
    }
    function removeLog(log, text) {
        const snap = snapshot(), med = medById(log.med);
        state.logs = state.logs.filter(l => l.id !== log.id);
        editLog = null; save(); pendingFocus = log.slot ? 'take|' + log.med + '|' + log.slot : 'take|' + log.med + '|'; render();
        say($('today-msg'), slotLabel(med, log.slot) + ': ' + text, () => restore(snap));
    }

    // inline editor to change the time of a logged dose
    function logEditor(log) {
        const box = el('div', 'edit-row'), id = 'edit-' + log.id;
        const lab = el('label', null, 'Taken at'); lab.htmlFor = id;
        const inp = el('input'); inp.type = 'datetime-local'; inp.id = id; inp.value = toInput(log.t); inp.max = toInput(now() + C.MIN);
        const err = el('p', 'err'); err.setAttribute('role', 'alert');
        const row = el('div', 'three');
        const sv = btn('primary', 'Save'), nt = btn('danger', 'Not taken'), cn = btn(null, 'Cancel');
        sv.addEventListener('click', () => {
            const t = fromInput(inp.value);
            if (t == null) { err.textContent = 'Pick the date and time you took it.'; inp.focus(); return; }
            if (t > now() + C.MIN) { err.textContent = 'That time is still ahead. Pick a time that has passed.'; inp.focus(); return; }
            if (t < now() - 7 * C.DAY) { err.textContent = 'Pick a time in the last 7 days.'; inp.focus(); return; }
            const snap = snapshot(), med = medById(log.med);
            const l = state.logs.find(x => x.id === log.id); if (l) l.t = t;
            editLog = null; save(); pendingFocus = 'chg|' + log.med + '|' + (log.slot || log.id); render();
            say($('today-msg'), slotLabel(med, log.slot) + ': time changed to ' + fmtTime(t) + '.', () => restore(snap));
        });
        nt.addEventListener('click', () => removeLog(log, 'removed, not taken.'));
        cn.addEventListener('click', () => { editLog = null; pendingFocus = 'chg|' + log.med + '|' + (log.slot || log.id); render(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sv.click(); } else if (e.key === 'Escape') cn.click(); });
        row.append(sv, nt, cn);
        box.append(lab, inp, err, row);
        setTimeout(() => inp.focus(), 0);
        return box;
    }

    // ---- the Today list
    function slotItem(med, s, today) {
        const li = el('li', 'slot ' + s.state);
        const tx = el('div', 's-text'), dot = el('span', 's-dot', s.state === 'taken' ? '✓' : s.state === 'skipped' ? '–' : '');
        dot.setAttribute('aria-hidden', 'true');
        const words = el('div');
        words.style.minWidth = '0';
        words.append(el('b', 's-time', (s.carried ? 'Yesterday ' : '') + fmtSlot(s.day, s.time)));
        let st;
        const t = now();
        if (s.state === 'taken') st = 'Taken ' + (C.dayKey(s.log.t) !== today ? (C.dayKey(s.log.t) === C.addDays(today, -1) ? 'yesterday ' : fmtDate(C.dayKey(s.log.t)) + ' ') : '') + 'at ' + fmtTime(s.log.t);
        else if (s.state === 'skipped') st = 'Skipped';
        else if (s.state === 'due') st = 'Not taken yet' + (t - s.at >= 60 * C.MIN ? ', due ' + C.dur(t - s.at) + ' ago' : '');
        else st = 'Due in ' + C.dur(s.at - t);
        words.append(el('span', 's-state', st));
        tx.append(dot, words);
        li.append(tx);
        const bx = el('div', 's-btns'), name = med.name + ', ' + (s.carried ? 'yesterday ' : '') + fmtSlot(s.day, s.time) + ' dose';
        if (s.state === 'due' || s.state === 'later') {
            const tk = btn('take', 'Taken', 'take|' + med.id + '|' + s.key, 'Taken: ' + name);
            tk.addEventListener('click', () => take(med, s.key));
            const sk = btn(null, 'Skip', 'skip|' + med.id + '|' + s.key, 'Skip: ' + name);
            sk.addEventListener('click', () => skip(med, s.key));
            bx.append(tk, sk);
        } else if (s.state === 'taken') {
            const ch = btn(null, 'Change', 'chg|' + med.id + '|' + s.key, 'Change: ' + name);
            ch.addEventListener('click', () => { clearMsgs(); editLog = s.log.id; render(); });
            bx.append(ch);
        } else {
            const un = btn(null, 'Undo skip', 'unskip|' + med.id + '|' + s.key, 'Undo skip: ' + name);
            un.addEventListener('click', () => removeLog(s.log, 'no longer skipped.'));
            bx.append(un);
        }
        if (!(s.log && editLog === s.log.id)) li.append(bx);
        else li.append(logEditor(s.log));
        return li;
    }
    function extraItem(med, log, label) {
        const li = el('li', 'slot taken');
        const tx = el('div', 's-text'), dot = el('span', 's-dot', '✓'); dot.setAttribute('aria-hidden', 'true');
        const words = el('div'); words.style.minWidth = '0';
        words.append(el('b', 's-time', fmtTime(log.t)), el('span', 's-state', label));
        tx.append(dot, words); li.append(tx);
        if (editLog === log.id) li.append(logEditor(log));
        else {
            const bx = el('div', 's-btns'), ch = btn(null, 'Change', 'chg|' + med.id + '|' + log.id, 'Change: ' + med.name + ', dose at ' + fmtTime(log.t));
            ch.addEventListener('click', () => { clearMsgs(); editLog = log.id; render(); });
            bx.append(ch); li.append(bx);
        }
        return li;
    }
    function medItem(v, today) {
        const med = v.med, li = el('li', 'med');
        if (v.slots.some(s => s.state === 'due')) li.classList.add('has-due');
        if (v.finished) li.classList.add('done');
        const top = el('div', 'm-top'), h = el('h3', 'm-name', med.name);
        const ed = btn('m-edit', 'Edit', 'edit|' + med.id, 'Edit ' + med.name);
        ed.addEventListener('click', () => startEdit(med));
        top.append(h, ed); li.append(top);
        if (med.who) li.append(el('span', 'm-who', 'For ' + med.who));
        li.append(el('p', 'm-plan', v.finished ? 'Course finished on ' + fmtDate(med.end) + '.' : v.notStarted ? 'Starts ' + fmtDate(med.start) + '.' : cap(C.scheduleText(Object.assign({}, med, { end: null }), fmtTime)) + (med.end ? '. Last day ' + fmtDate(med.end) : '') + '.'));
        if (v.pills && !v.finished) {
            const p = v.pills, n = C.pillsText(p.left);
            const pe = el('p', 'm-pills' + (p.out ? ' out' : p.low ? ' low' : ''));
            pe.textContent = p.out ? (p.left ? 'Only ' + n + ' left, not enough for a dose. Get more now.' : 'Out of pills. Get more before the next dose.')
                : n + (p.left === 100 ? ' pill' : ' pills') + ' left' + (p.days != null ? ', about ' + plural(p.days, 'day', 'days') : '') + (p.low ? '. Time to get more.' : '.');
            li.append(pe);
        }
        if (v.kind === 'needed' && !v.finished && !v.notStarted) {
            const n = v.need, box = el('div', 'need'), t = now();
            if (n.nextOk) box.append(el('p', 'wait', 'Wait until ' + (C.dayKey(n.nextOk) !== today ? 'tomorrow ' : '') + fmtTime(n.nextOk) + ' (in ' + C.dur(n.nextOk - t) + ') for the next dose.'));
            else box.append(el('p', 'ok', 'OK to take a dose now, by your settings.'));
            box.append(el('p', 'small', (n.last ? 'Last taken ' + (C.dayKey(n.last.t) === today ? '' : C.dayKey(n.last.t) === C.addDays(today, -1) ? 'yesterday ' : fmtDate(C.dayKey(n.last.t)) + ' ') + 'at ' + fmtTime(n.last.t) + ', ' + C.dur(t - n.last.t) + ' ago.' : 'Not taken yet.')
                + ' In the last 24 hours: ' + n.count24 + (n.max ? ' of ' + n.max : '') + '.'));
            const tk = btn('primary take-now', 'Taken now', 'take|' + med.id + '|', 'Taken now: ' + med.name);
            tk.addEventListener('click', () => take(med, null));
            box.append(tk); li.append(box);
        }
        if (v.slots.length || v.extras.length) {
            const ul = el('ul', 'slots');
            v.slots.forEach(s => ul.append(slotItem(med, s, today)));
            v.extras.forEach(l => ul.append(extraItem(med, l, v.kind === 'needed' ? 'Taken today' : 'Extra dose, not at a set time')));
            li.append(ul);
        } else if (v.kind === 'times' && !v.finished && !v.notStarted) li.append(el('p', 'm-done', 'Nothing to take today.'));
        return li;
    }
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

    function renderToday() {
        const v = C.todayView(state, now()), t = now(), big = $('r-big'), nx = $('r-next');
        $('intro').hidden = state.meds.length > 0;
        big.classList.toggle('small', !v.total);
        nx.classList.remove('warn');
        if (!state.meds.length) { big.textContent = 'No medicines yet'; nx.textContent = ''; }
        else if (!v.total) { big.textContent = 'No set times today'; nx.textContent = v.due ? plural(v.due, 'dose from yesterday is', 'doses from yesterday are') + ' not logged yet.' : ''; if (v.due) nx.classList.add('warn'); }
        else {
            big.textContent = v.done + ' of ' + v.total + ' doses done';
            if (v.due) { nx.textContent = plural(v.due, 'dose is', 'doses are') + ' not taken yet.'; nx.classList.add('warn'); }
            else if (v.next) nx.textContent = 'Next: ' + v.next.med.name + ' at ' + fmtTime(v.next.at) + ' (in ' + C.dur(v.next.at - t) + ').';
            else nx.textContent = 'All done for today.';
        }
        const ul = $('meds'); ul.textContent = '';
        v.meds.forEach(m => ul.append(medItem(m, v.today)));
    }

    // ---- history
    let range = 7;
    try { const r = +localStorage.getItem(RANGE_KEY); if ([7, 14, 30].includes(r)) range = r; } catch (e) { /* default */ }
    function renderHistory() {
        $('hist').hidden = !state.meds.length;
        if (!state.meds.length) return;
        $('range').value = String(range);
        const h = C.history(state, now(), range), list = $('days-list');
        $('hist-sum').textContent = 'Last ' + range + ' days: ' + C.summaryLine(h.tot);
        list.textContent = '';
        for (const d of h.days) {
            const li = el('li'); li.append(el('p', 'd-h', dayName(d.day)));
            if (!d.rows.length) li.append(el('p', 'd-row', 'Nothing to take or log.'));
            for (const r of d.rows) {
                const p = el('p', 'd-row'); p.append(el('b', null, r.med.name + ': '));
                r.items.forEach((it, i) => {
                    if (i) p.append(', ');
                    const at = it.time ? fmtSlot(d.day, it.time) + ' ' : '';
                    if (it.state === 'taken') p.append(at + 'taken ' + (C.dayKey(it.t) !== d.day ? 'next day ' : '') + 'at ' + fmtTime(it.t));
                    else if (it.state === 'skipped') p.append(at + 'skipped');
                    else if (it.state === 'missed') p.append(el('span', 'miss', at + 'not logged'));
                    else p.append('taken at ' + fmtTime(it.t));
                });
                li.append(p);
            }
            list.append(li);
        }
        let body = text(7);
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(Shortened. Use Copy in the app for the full log.)';
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('Medication log') + '&body=' + encodeURIComponent(body);
    }
    const text = days => C.historyText(state, now(), days, fmtTime, d => dayName(d) + (dayName(d) === fmtDate(d) ? '' : ' (' + fmtDate(d) + ')'));

    function render() {
        const fk = pendingFocus || (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null);
        pendingFocus = null;
        renderToday();
        renderHistory();
        if (fk) { const f = document.querySelector('[data-fk="' + CSS.escape(fk) + '"]'); if (f) f.focus(); }
    }

    // ---- the add / edit form
    let formTimes = ['08:00'];
    const PRESETS = { 1: ['08:00'], 2: ['08:00', '20:00'], 3: ['08:00', '14:00', '20:00'], 4: ['08:00', '12:00', '16:00', '20:00'] };
    const kind = () => document.querySelector('input[name=kind]:checked').value;
    function renderTimes() {
        const ul = $('times'); ul.textContent = '';
        formTimes.forEach((t, i) => {
            const li = el('li'), inp = el('input'); inp.type = 'time'; inp.value = t; inp.dataset.i = i;
            inp.setAttribute('aria-label', 'Time ' + (i + 1));
            inp.addEventListener('input', () => { formTimes[i] = inp.value; markPreset(); });
            li.append(inp);
            if (formTimes.length > 1) { const rm = btn(null, 'Remove', null, 'Remove time ' + (i + 1)); rm.addEventListener('click', () => { formTimes.splice(i, 1); renderTimes(); const f = $('times').querySelector('input'); if (f) f.focus(); }); li.append(rm); }
            ul.append(li);
        });
        $('add-time').hidden = formTimes.length >= C.MAX_TIMES;
        markPreset();
    }
    function markPreset() {
        document.querySelectorAll('[data-preset]').forEach(b => {
            const on = JSON.stringify(PRESETS[b.dataset.preset]) === JSON.stringify(formTimes);
            b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }
    document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { formTimes = PRESETS[b.dataset.preset].slice(); renderTimes(); }));
    $('add-time').addEventListener('click', () => {
        const last = formTimes.filter(C.isTime).sort().pop();
        const next = last ? Math.min(23 * 60, +last.slice(0, 2) * 60 + +last.slice(3) + 4 * 60) : 12 * 60;
        formTimes.push(pad(Math.floor(next / 60)) + ':' + pad(next % 60)); renderTimes();
        const all = $('times').querySelectorAll('input'); all[all.length - 1].focus();
    });
    function showKind() {
        $('times-box').hidden = kind() !== 'times';
        $('needed-box').hidden = kind() !== 'needed';
    }
    document.querySelectorAll('input[name=kind]').forEach(r => r.addEventListener('change', showKind));
    document.querySelectorAll('input[name=every]').forEach(r => r.addEventListener('change', () => { $('days').hidden = r.value === 'all' ? r.checked : !r.checked; }));
    function showCustom() {
        const g = $('f-gap').value === 'custom', m = $('f-max').value === 'custom';
        $('gap-custom-box').hidden = !g; $('max-custom-box').hidden = !m; $('custom-row').hidden = !g && !m;
    }
    $('f-gap').addEventListener('change', () => { showCustom(); if ($('f-gap').value === 'custom') $('f-gap-custom').focus(); });
    $('f-max').addEventListener('change', () => { showCustom(); if ($('f-max').value === 'custom') $('f-max-custom').focus(); });
    const opener = (b, box, focus) => $(b).addEventListener('click', () => { $(box).hidden = false; $(b).hidden = true; $(focus).focus(); });
    opener('open-who', 'who-box', 'f-who'); opener('open-pills', 'pills-box', 'f-left'); opener('open-end', 'end-box', 'f-end');
    function setOpen(b, box, open) { $(box).hidden = !open; $(b).hidden = open; }

    function resetForm() {
        editingId = null;
        $('form').reset();
        formTimes = ['08:00']; renderTimes();
        document.querySelector('input[name=kind][value=times]').checked = true;
        document.querySelector('input[name=every][value=all]').checked = true;
        $('days').hidden = true;
        document.querySelectorAll('#days input').forEach(c => { c.checked = false; });
        $('f-gap').value = '4'; $('f-max').value = '4'; showCustom(); showKind();
        setOpen('open-who', 'who-box', false); setOpen('open-pills', 'pills-box', false); setOpen('open-end', 'end-box', false);
        $('form-h').textContent = 'Add a medicine'; $('save').textContent = 'Add medicine';
        $('edit-btns').hidden = true; $('add-card').classList.remove('editing');
        $('form-err').textContent = '';
        $('f-end').min = C.dayKey(now());
    }
    function startEdit(med) {
        resetForm(); clearMsgs();
        editingId = med.id;
        const p = C.current(med);
        $('f-name').value = med.name;
        document.querySelector('input[name=kind][value=' + p.kind + ']').checked = true;
        if (p.kind === 'times') {
            formTimes = p.times.slice(); renderTimes();
            const all = p.days.length === 7;
            document.querySelector('input[name=every][value=' + (all ? 'all' : 'some') + ']').checked = true;
            $('days').hidden = all;
            document.querySelectorAll('#days input').forEach(c => { c.checked = !all && p.days.includes(+c.value); });
        } else {
            const h = p.gap / 60;
            if ([...$('f-gap').options].some(o => o.value === String(h))) $('f-gap').value = String(h); else { $('f-gap').value = 'custom'; $('f-gap-custom').value = String(Math.round(h * 100) / 100); }
            if (!p.max) $('f-max').value = ''; else if ([...$('f-max').options].some(o => o.value === String(p.max))) $('f-max').value = String(p.max); else { $('f-max').value = 'custom'; $('f-max-custom').value = String(p.max); }
            showCustom();
        }
        showKind();
        if (med.who) { setOpen('open-who', 'who-box', true); $('f-who').value = med.who; }
        if (med.pills) { setOpen('open-pills', 'pills-box', true); const pl = C.pillsLeft(state, med); $('f-left').value = C.pillsText(pl.left); $('f-per').value = C.pillsText(med.perDose); }
        if (med.end) { setOpen('open-end', 'end-box', true); $('f-end').value = med.end; }
        $('f-end').min = med.start;
        $('form-h').textContent = 'Change ' + med.name; $('save').textContent = 'Save changes';
        $('edit-btns').hidden = false; $('add-card').classList.add('editing');
        $('add-card').scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('f-name').focus({ preventScroll: true });
    }
    $('cancel-edit').addEventListener('click', () => { const id = editingId; resetForm(); pendingFocus = 'edit|' + id; render(); });
    $('delete-med').addEventListener('click', () => {
        const med = medById(editingId); if (!med) return resetForm();
        const snap = snapshot();
        state.meds = state.meds.filter(m => m.id !== med.id);
        state.logs = state.logs.filter(l => l.med !== med.id);
        save(); resetForm(); render();
        say($('today-msg'), med.name + ' and its history deleted.', () => restore(snap));
        $('today').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    // Reads the form. Returns { med } or { err, field }.
    function readForm() {
        const name = $('f-name').value.replace(/\s+/g, ' ').trim().slice(0, C.MAX_NAME);
        if (!name) return { err: 'Type the medicine, for example Metformin 500 mg.', field: $('f-name') };
        const who = $('who-box').hidden ? '' : $('f-who').value.replace(/\s+/g, ' ').trim().slice(0, C.MAX_WHO);
        const dup = state.meds.find(m => m.id !== editingId && m.name.toLowerCase() === name.toLowerCase() && (m.who || '').toLowerCase() === who.toLowerCase());
        if (dup) return { err: name + (who ? ' for ' + who : '') + ' is already on your list. Tap Edit on it to change its times.', field: $('f-name') };
        let plan;
        if (kind() === 'times') {
            const raw = [...$('times').querySelectorAll('input')].map(i => i.value);
            if (raw.some(v => v && !C.isTime(v))) return { err: 'One of the times is not complete. Pick the hour and minutes.', field: $('times').querySelector('input') };
            const times = raw.filter(Boolean);
            if (!times.length) return { err: 'Pick at least one time, or tap a quick pick such as Once a day.', field: $('times').querySelector('input') || $('add-time') };
            const twice = times.find((t, i) => times.indexOf(t) !== i);
            if (twice) return { err: fmtSlot('2024-01-01', twice) + ' is there twice. Change or remove one of them.', field: $('times').querySelectorAll('input')[times.lastIndexOf(twice)] };
            let days = [0, 1, 2, 3, 4, 5, 6];
            if (document.querySelector('input[name=every]:checked').value === 'some') {
                days = [...document.querySelectorAll('#days input:checked')].map(c => +c.value).sort();
                if (!days.length) return { err: 'Tick at least one day, or choose Every day.', field: document.querySelector('#days input') };
            }
            plan = { kind: 'times', times: C.cleanTimes(times), days };
        } else {
            let gap;
            if ($('f-gap').value === 'custom') {
                const g = C.parseHours($('f-gap-custom').value);
                if (g.err) return { err: g.err === 'small' ? 'The wait between doses must be at least 15 minutes (0.25 hours).' : g.err === 'big' ? 'The wait between doses can be up to 168 hours (a week).' : 'Type the hours between doses as a number, for example 5 or 1.5.', field: $('f-gap-custom') };
                gap = g.min;
            } else gap = +$('f-gap').value * 60;
            let max = null;
            if ($('f-max').value === 'custom') {
                const v = $('f-max-custom').value.trim();
                if (!/^\d{1,2}$/.test(v) || +v < 1 || +v > 24) return { err: 'Type the most doses in 24 hours as a whole number from 1 to 24.', field: $('f-max-custom') };
                max = +v;
            } else if ($('f-max').value) max = +$('f-max').value;
            plan = { kind: 'needed', gap, max };
        }
        let pills = null, perDose = 100;
        if (!$('pills-box').hidden) {
            const per = C.parsePills($('f-per').value, 5000);
            if (per.err || per.n === 0) return { err: 'Type how many pills make one dose, for example 1, 2 or 0.5.', field: $('f-per') };
            if (!per.blank) perDose = per.n;
            const left = C.parsePills($('f-left').value);
            if (left.err) return { err: left.err === 'big' ? 'Pills left can be up to 9,999.' : 'Type how many pills you have now, for example 28.', field: $('f-left') };
            if (!left.blank) pills = left.n;
        }
        let end = null;
        const today = C.dayKey(now()), start = editingId ? medById(editingId).start : today;
        if (!$('end-box').hidden && $('f-end').value) {
            if (!C.isDay($('f-end').value)) return { err: 'Pick the last day from the calendar.', field: $('f-end') };
            end = $('f-end').value;
            if (end < start) return { err: 'The last day cannot be before ' + (editingId ? 'the day you added it (' + fmtDate(start) + ').' : 'today.'), field: $('f-end') };
        }
        return { med: { name, who, plan, pills, perDose, end } };
    }
    $('form').addEventListener('submit', e => {
        e.preventDefault(); clearMsgs();
        const r = readForm();
        if (r.err) { $('form-err').textContent = r.err; if (r.field) r.field.focus(); return; }
        $('form-err').textContent = '';
        const snap = snapshot(), t = now(), today = C.dayKey(t), f = r.med;
        if (editingId) {
            const med = medById(editingId);
            med.name = f.name; med.who = f.who; med.end = f.end; med.perDose = f.perDose;
            const cur = C.current(med), np = Object.assign({ from: today }, f.plan);
            const same = JSON.stringify(Object.assign({}, cur, { from: '' })) === JSON.stringify(Object.assign({}, np, { from: '' }));
            if (!same) { if (cur.from >= today) med.plans[med.plans.length - 1] = np; else med.plans.push(np); C.remapToday(state, med, t); }
            if (f.pills == null) med.pills = null;
            else { const pl = C.pillsLeft(state, med); if (!pl || pl.left !== f.pills) med.pills = { left: f.pills, at: t }; }
            save(); const id = med.id; resetForm(); pendingFocus = 'edit|' + id; render();
            say($('today-msg'), f.name + ' saved.' + (same ? '' : ' The new times count from today.'), () => restore(snap));
            $('today').scrollIntoView({ block: 'nearest' });
        } else {
            if (state.meds.length >= C.MAX_MEDS) { $('form-err').textContent = 'You can track up to ' + C.MAX_MEDS + ' medicines. Delete one you no longer take first.'; return; }
            state.meds.push({ id: newId('m'), name: f.name, who: f.who, start: today, created: t, end: f.end, perDose: f.perDose, pills: f.pills == null ? null : { left: f.pills, at: t }, plans: [Object.assign({ from: today }, f.plan)] });
            save(); resetForm(); render();
            say($('form-msg'), f.name + ' added. It is under Today' + (f.plan.kind === 'times' ? '; tap Taken when you take each dose.' : '; tap Taken now when you take a dose.'), () => { restore(snap); });
            $('f-name').focus();
        }
    });

    // ---- example
    $('demo').addEventListener('click', () => {
        const t = now(), today = C.dayKey(t), start = C.addDays(today, -6), every = [0, 1, 2, 3, 4, 5, 6];
        const met = { id: newId('m'), name: 'Metformin 500 mg', who: '', start, end: null, perDose: 100, pills: { left: 5600, at: C.slotAt(start, '07:00') }, plans: [{ from: start, kind: 'times', times: ['08:00', '20:00'], days: every }] };
        const aml = { id: newId('m'), name: 'Amlodipine 5 mg', who: 'Mum', start, end: null, perDose: 100, pills: null, plans: [{ from: start, kind: 'times', times: ['09:00'], days: every }] };
        const ibu = { id: newId('m'), name: 'Ibuprofen 200 mg', who: '', start, end: null, perDose: 200, pills: null, plans: [{ from: start, kind: 'needed', gap: 360, max: 3 }] };
        const logs = [], add = (m, ms, slot) => { if (ms <= t) logs.push({ id: newId('l'), med: m.id, t: ms, c: ms, slot, skip: false, pills: m.perDose }); };
        for (let i = 6; i >= 0; i--) {
            const d = C.addDays(today, -i);
            add(met, C.slotAt(d, '08:00') + (3 + i) * C.MIN, d + ' 08:00');
            if (i !== 3 && i !== 0) add(met, C.slotAt(d, '20:00') + (11 - i) * C.MIN, d + ' 20:00');
            add(aml, C.slotAt(d, '09:00') + (5 + i) * C.MIN, d + ' 09:00');
        }
        add(ibu, C.slotAt(C.addDays(today, -2), '13:10'), null);
        if (t - 3 * C.HOUR - 20 * C.MIN > C.dayStart(today)) add(ibu, t - 3 * C.HOUR - 20 * C.MIN, null);
        const snap = snapshot();
        state = C.clean({ meds: [met, aml, ibu], logs }, t);
        save(); clearMsgs(); render();
        say($('today-msg'), 'Example added. Tap Taken or Change to try it.', () => restore(snap));
    });

    // ---- history, reminders and backup
    $('range').addEventListener('change', () => { range = +$('range').value; try { localStorage.setItem(RANGE_KEY, String(range)); } catch (e) { /* fine */ } renderHistory(); });
    $('copy').addEventListener('click', async () => {
        const body = text(range);
        let ok = false;
        try { await navigator.clipboard.writeText(body); ok = true; } catch (e) {
            const ta = el('textarea'); ta.value = body; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.append(ta); ta.select();
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove();
        }
        $('hist-msg').textContent = ok ? 'Copied the last ' + range + ' days. Paste it into a message or note.' : 'Could not copy here. Use Email or Print instead.';
    });
    $('print').addEventListener('click', () => window.print());
    function download(name, type, body) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    $('ics').addEventListener('click', () => {
        const d = new Date(), stamp = d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
        const r = C.ics(state, C.dayKey(now()), stamp);
        if (!r.n) { say($('tools-msg'), state.meds.length ? 'None of your medicines has set times. Medicines taken only when needed have no time to remind you of.' : 'Add a medicine with set times first.'); return; }
        download('medication-reminders.ics', 'text/calendar', r.text);
        say($('tools-msg'), 'Downloaded ' + plural(r.n, 'reminder', 'reminders') + '. Open the file to add them to your calendar. If you change times later, delete the old reminders and download again.');
    });
    $('backup').addEventListener('click', () => {
        if (!state.meds.length) { say($('tools-msg'), 'There is nothing to back up yet.'); return; }
        download('medication-tracker-backup-' + C.dayKey(now()) + '.json', 'application/json', JSON.stringify({ app: 'medication-tracker', version: 1, saved: new Date().toISOString(), state }));
        say($('tools-msg'), 'Backup saved to your downloads. Keep it somewhere safe; it lists your medicines.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; $('restore-file').value = '';
        if (!f) return;
        if (f.size > 3000000) { say($('tools-msg'), 'That file is too big to be a backup from this app. Nothing was changed.'); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let data = null; try { data = JSON.parse(rd.result); } catch (e) { data = null; }
            const s = data && data.app === 'medication-tracker' ? C.clean(data.state, now()) : null;
            if (!s || !s.meds.length) { say($('tools-msg'), 'That file is not a Medication Tracker backup, or it is empty. Nothing was changed.'); return; }
            const snap = snapshot(); state = s; save(); resetForm(); render();
            say($('tools-msg'), 'Restored ' + plural(s.meds.length, 'medicine', 'medicines') + ' and ' + plural(s.logs.length, 'logged dose', 'logged doses') + '.', () => restore(snap));
        };
        rd.onerror = () => say($('tools-msg'), 'Could not read that file. Nothing was changed.');
        rd.readAsText(f);
    });
    $('wipe').addEventListener('click', () => {
        if (!state.meds.length) { say($('tools-msg'), 'There is nothing to delete.'); return; }
        const snap = snapshot(); state = C.clean(null); save(); resetForm(); render();
        say($('tools-msg'), 'Everything deleted.', () => restore(snap));
    });

    // ---- start, and keep the countdowns and the date fresh
    resetForm(); render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode not available */ });
    setInterval(() => { if (!editLog && !$('confirm').open && document.visibilityState === 'visible') render(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !editLog) { state = load(); render(); } });
    window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); render(); } });
})();
