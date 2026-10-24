// Leave Balance Tracker for Employees: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.LeaveCore;
    const KEY = 'leave-balance-tracker-for-employees.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    let canSave = true, today = C.todayIso(), state;
    let viewY;                 // the leave year shown
    let editId = null, editAdjId = null;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw), today); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'Your saved leave could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState(today);
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap), today) || state; cancelEdit(); fillPattern(); renderTypes(); commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['add-msg', 'list-msg', 'types-msg', 'pat-msg', 'set-msg'];
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
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }
    function setErr(id, text, field) { $(id).textContent = text || ''; if (field) { if (text) field.setAttribute('aria-invalid', 'true'); else field.removeAttribute('aria-invalid'); } }

    // ---------- helpers ----------
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
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(Too long for an email link. Use "Copy my balance" and paste it.)';
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
    function yearBounds() {
        const r = C.dataYears(state), now = C.yearOf(state, today);
        return { min: Math.min(r.min, now - 1), max: Math.max(r.max, now + 1) };
    }

    // ---------- render ----------
    function render() {
        const b = yearBounds();
        if (viewY < b.min) viewY = b.min;
        if (viewY > b.max) viewY = b.max;
        renderBalance();
        renderList();
        renderTypeSelects();
        renderHolidays();
        updatePreview();
        $('mail').href = mailto('My leave balance', C.summaryText(state, viewY, today));
    }

    function renderBalance() {
        const now = C.yearOf(state, today), b = yearBounds();
        $('y-name').textContent = 'Leave year ' + yearShort(viewY) + (viewY === now ? ' (now)' : viewY < now ? ' (past)' : viewY === now + 1 ? ' (next)' : '');
        $('y-dates').textContent = C.longDate(C.yearStart(state, viewY)) + ' to ' + C.longDate(C.yearEnd(state, viewY));
        $('y-prev').disabled = viewY <= b.min; $('y-next').disabled = viewY >= b.max;
        $('y-now').hidden = viewY === now;
        const box = $('bal-list'); box.textContent = '';
        if (!state.types.length) { box.appendChild(el('p', 'empty', 'No leave types yet. Add one under "Your leave types".')); return; }
        const memo = {};
        state.types.forEach(t => {
            const r = C.balance(state, t.id, viewY, today, memo), lv = C.level(r);
            const card = el('div', 'tbal lv-' + lv);
            const top = el('div', 'tbal-top');
            top.appendChild(el('h3', null, t.name));
            top.appendChild(el('p', 'big', C.headline(r)));
            card.appendChild(top);
            if (r.mode !== 'none') {
                const total = Math.max(1, r.full + r.carried + Math.max(0, r.adj) - r.expired);
                const bar = el('div', 'bar'); bar.setAttribute('aria-hidden', 'true');
                const pt = Math.min(100, r.taken / total * 100), pb = Math.min(100 - pt, r.booked / total * 100);
                const t1 = el('span', 'taken'); t1.style.width = pt + '%'; bar.appendChild(t1);
                const t2 = el('span', 'booked'); t2.style.width = pb + '%'; bar.appendChild(t2);
                card.appendChild(bar);
            }
            const ul = el('ul', 'facts');
            C.lines(state, r, today).forEach((x, i) => {
                const li = el('li', null, x);
                if (/^Book |^Use |lost at the end/.test(x)) li.className = 'w-lose';
                if (/more than you have built up/.test(x)) li.className = 'w-over';
                ul.appendChild(li);
            });
            card.appendChild(ul);
            box.appendChild(card);
        });
        if (!state.entries.length && !state.adjs.length) box.appendChild(el('p', 'hint', 'No leave added yet. Add your first leave under "Add leave".'));
    }

    function renderList() {
        const body = $('list-body'); body.textContent = '';
        const items = [];
        C.entriesInYear(state, viewY).forEach(e => items.push({ k: 'e', d: e.from, e }));
        C.adjsInYear(state, viewY).forEach(a => items.push({ k: 'a', d: a.date, a }));
        items.sort((x, y) => (y.d < x.d ? -1 : y.d > x.d ? 1 : 0));
        $('list-h').textContent = 'Leave in this leave year' + (items.length ? ' (' + items.length + ')' : '');
        if (!items.length) { body.appendChild(el('p', 'empty', 'No leave in this leave year yet.')); return; }
        const ul = el('ul', 'items');
        items.forEach(it => {
            const li = el('li', 'item');
            const main = el('div', 'item-main');
            if (it.k === 'e') {
                const x = C.entryText(state, it.e, today);
                li.classList.add('st-' + x.status);
                const top = el('p', 'item-top');
                top.appendChild(el('span', 'item-name', x.name));
                top.appendChild(el('span', 'badge b-' + x.status, x.status === 'booked' ? 'Booked' : x.status === 'taken' ? 'Taken' : 'Today'));
                main.appendChild(top);
                main.appendChild(el('p', 'item-when', x.when));
                const inYear = Object.entries(C.entryDays(state, it.e).map).filter(([d]) => C.yearOf(state, d) === viewY).reduce((a, [, v]) => a + v, 0);
                main.appendChild(el('p', 'item-days', C.days(x.total) + (inYear !== x.total ? ' (' + C.num(inYear) + ' in this leave year)' : '') + (it.e.custom != null ? ', your number' : '')));
                if (it.e.note) main.appendChild(el('p', 'item-note', it.e.note));
            } else {
                const t = C.typeById(state, it.a.type);
                li.classList.add('st-adj');
                const top = el('p', 'item-top');
                top.appendChild(el('span', 'item-name', (t ? t.name : 'Leave')));
                top.appendChild(el('span', 'badge b-adj', 'HR correction'));
                main.appendChild(top);
                main.appendChild(el('p', 'item-when', C.shortDate(it.a.date, today)));
                main.appendChild(el('p', 'item-days', (it.a.days > 0 ? '+' : '') + C.days(it.a.days)));
                if (it.a.note) main.appendChild(el('p', 'item-note', it.a.note));
            }
            li.appendChild(main);
            const btns = el('div', 'item-btns');
            const ed = el('button', 'secondary small', 'Edit'); ed.type = 'button';
            const del = el('button', 'secondary small del', 'Delete'); del.type = 'button';
            const label = it.k === 'e' ? C.entryText(state, it.e, today).name + ', ' + C.entryText(state, it.e, today).when : 'HR correction on ' + C.shortDate(it.a.date, today);
            ed.setAttribute('aria-label', 'Edit ' + label); del.setAttribute('aria-label', 'Delete ' + label);
            ed.addEventListener('click', () => (it.k === 'e' ? startEdit(it.e) : startEditAdj(it.a)));
            del.addEventListener('click', () => {
                const snap = snapshot();
                if (it.k === 'e') { state.entries = state.entries.filter(x => x.id !== it.e.id); if (editId === it.e.id) cancelEdit(); }
                else { state.adjs = state.adjs.filter(x => x.id !== it.a.id); if (editAdjId === it.a.id) cancelEdit(); }
                commit(); show('list-msg', 'Deleted ' + label + '.', snap);
            });
            btns.appendChild(ed); btns.appendChild(del);
            li.appendChild(btns);
            ul.appendChild(li);
        });
        body.appendChild(ul);
    }

    function renderTypeSelects() {
        [['f-type', false], ['a-type', true]].forEach(([id, limitedOnly]) => {
            const sel = $(id), cur = sel.value;
            sel.textContent = '';
            state.types.filter(t => !limitedOnly || t.mode !== 'none').forEach(t => { const o = el('option', null, t.name); o.value = t.id; sel.appendChild(o); });
            if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
        });
        $('f-save').disabled = !state.types.length;
        $('a-save').disabled = !$('a-type').options.length;
    }

    // ---------- add leave ----------
    function leaveFields() {
        const from = $('f-from').value, to = $('f-to').value || from;
        const single = !to || from === to;
        return { id: editId || undefined, type: $('f-type').value, from, to,
            halfFirst: single ? $('f-half').checked : $('f-half-first').checked, halfLast: !single && $('f-half-last').checked,
            custom: $('w-custom').hidden ? null : $('f-custom').value, note: $('w-note').hidden ? '' : $('f-note').value };
    }
    function syncHalf() {
        const from = $('f-from').value, to = $('f-to').value;
        const single = !from || !to || from === to;
        $('half-one').hidden = !single; $('half-two').hidden = single;
    }
    function updatePreview() {
        const p = $('preview'); p.textContent = ''; p.className = 'preview';
        const f = leaveFields();
        if (!C.isDate(f.from) || !C.typeById(state, f.type)) return;
        const r = C.readEntry(state, f, today);
        if (!r.ok) { const k = Object.keys(r.errs)[0]; if (k !== 'to' || C.isDate($('f-to').value)) { p.textContent = r.errs[k]; p.classList.add('bad'); } return; }
        const e = r.entry, t = C.typeById(state, e.type);
        // the balance after this leave, for each leave year it touches
        const trial = JSON.parse(JSON.stringify(state)); trial.entries = trial.entries.filter(x => x.id !== e.id); trial.entries.push(e);
        const years = [...new Set(Object.keys(r.count.map).map(d => C.yearOf(state, d)))].sort();
        p.appendChild(el('strong', null, 'Takes ' + C.days(r.count.total) + ' of ' + t.name.replace(/^./, c => c.toLowerCase()) + '.'));
        const why = C.countText(state, e, today); if (why) p.appendChild(document.createTextNode(' ' + why));
        if (years.length > 1) p.appendChild(document.createTextNode(' ' + years.map(Y => C.num(Object.entries(r.count.map).filter(([d]) => C.yearOf(state, d) === Y).reduce((a, [, v]) => a + v, 0)) + ' in ' + yearShort(Y)).join(', ') + '.'));
        if (t.mode !== 'none') {
            const memo = {};
            years.forEach(Y => {
                const after = C.balance(trial, t.id, Y, today, memo);
                const left = after.left;
                const line = el('span', 'after' + (left < 0 ? ' bad' : ''), (years.length > 1 ? ' ' + yearShort(Y) + ': ' : ' Left after this: ') + (left < 0 ? C.days(-left) + ' over your allowance' : C.days(left)) + '.');
                p.appendChild(line);
            });
            const now = C.balance(trial, t.id, years[0], today, {});
            if (now.mode === 'month' && !now.past && !now.future && now.availNow < 0 && !years.some(Y => C.balance(trial, t.id, Y, today, {}).left < 0)) p.appendChild(el('span', 'after warn', ' This is more than you have built up so far (' + C.days(-now.availNow) + ' more).'));
        }
    }
    const yearShort = Y => (state.startM === 1 && state.startD === 1 ? String(Y) : Y + '/' + String(Y + 1).slice(2));

    function clearLeaveErrs() { setErr('e-type', '', $('f-type')); setErr('e-from', '', $('f-from')); setErr('e-to', '', $('f-to')); setErr('e-custom', '', $('f-custom')); }
    function resetLeaveForm() {
        $('f-from').value = ''; $('f-to').value = ''; $('f-half').checked = false; $('f-half-first').checked = false; $('f-half-last').checked = false;
        $('f-custom').value = ''; $('w-custom').hidden = true; $('o-custom').hidden = false;
        $('f-note').value = ''; $('w-note').hidden = true; $('o-note').hidden = false;
        clearLeaveErrs(); syncHalf();
    }
    function submitLeave(ev) {
        ev.preventDefault();
        clearLeaveErrs();
        const r = C.readEntry(state, leaveFields(), today);
        if (!r.ok) {
            const map = { type: ['e-type', 'f-type'], from: ['e-from', 'f-from'], to: ['e-to', 'f-to'], custom: ['e-custom', 'f-custom'] };
            Object.keys(r.errs).forEach(k => setErr(map[k][0], r.errs[k], $(map[k][1])));
            const first = map[Object.keys(r.errs)[0]]; $(first[1]).focus();
            return;
        }
        const snap = snapshot(), was = editId;
        if (was) state.entries = state.entries.map(x => (x.id === was ? r.entry : x)); else state.entries.push(r.entry);
        const x = C.entryText(state, r.entry, today);
        viewY = C.yearOf(state, r.entry.from);
        cancelEdit(); resetLeaveForm(); commit();
        show('add-msg', (was ? 'Saved: ' : 'Added: ') + x.name + ', ' + x.when + ' (' + C.days(x.total) + ').', snap);
    }
    function startEdit(e) {
        cancelEdit(); setKind('leave');
        editId = e.id;
        $('f-type').value = e.type; $('f-from').value = e.from; $('f-to').value = e.to;
        syncHalf();
        $('f-half').checked = e.from === e.to && e.halfFirst; $('f-half-first').checked = e.from !== e.to && e.halfFirst; $('f-half-last').checked = e.halfLast;
        if (e.custom != null) { $('w-custom').hidden = false; $('o-custom').hidden = true; $('f-custom').value = C.num(e.custom); }
        if (e.note) { $('w-note').hidden = false; $('o-note').hidden = true; $('f-note').value = e.note; }
        $('add-h').textContent = 'Change leave'; $('f-save').textContent = 'Save changes'; $('f-cancel').hidden = false;
        updatePreview();
        $('add').scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('f-type').focus({ preventScroll: true });
    }
    function cancelEdit() {
        const was = editId || editAdjId;
        editId = null; editAdjId = null;
        $('add-h').textContent = 'Add leave'; $('f-save').textContent = 'Add leave'; $('f-cancel').hidden = true;
        $('a-save').textContent = 'Add correction'; $('a-cancel').hidden = true;
        if (was) { resetLeaveForm(); resetAdjForm(); }
    }

    // ---------- HR corrections ----------
    function resetAdjForm() { $('a-amount').value = ''; $('a-date').value = today; $('a-note').value = ''; document.querySelector('input[name=sign][value="1"]').checked = true; clearAdjErrs(); }
    function clearAdjErrs() { setErr('e-atype', '', $('a-type')); setErr('e-amount', '', $('a-amount')); setErr('e-adate', '', $('a-date')); }
    function submitAdj(ev) {
        ev.preventDefault(); clearAdjErrs();
        const sign = +document.querySelector('input[name=sign]:checked').value;
        const r = C.readAdj(state, { id: editAdjId || undefined, type: $('a-type').value, sign, amount: $('a-amount').value, date: $('a-date').value, note: $('a-note').value });
        if (!r.ok) {
            const map = { type: ['e-atype', 'a-type'], amount: ['e-amount', 'a-amount'], date: ['e-adate', 'a-date'] };
            Object.keys(r.errs).forEach(k => setErr(map[k][0], r.errs[k], $(map[k][1])));
            $(map[Object.keys(r.errs)[0]][1]).focus();
            return;
        }
        const snap = snapshot(), was = editAdjId;
        if (was) state.adjs = state.adjs.map(x => (x.id === was ? r.adj : x)); else state.adjs.push(r.adj);
        viewY = C.yearOf(state, r.adj.date);
        const t = C.typeById(state, r.adj.type);
        cancelEdit(); resetAdjForm(); commit();
        show('add-msg', (was ? 'Saved: ' : 'Added: ') + (r.adj.days > 0 ? '+' : '') + C.days(r.adj.days) + ' of ' + t.name.replace(/^./, c => c.toLowerCase()) + ' from HR.', snap);
    }
    function startEditAdj(a) {
        cancelEdit(); setKind('adj');
        editAdjId = a.id;
        $('a-type').value = a.type; $('a-amount').value = C.num(Math.abs(a.days)); $('a-date').value = a.date; $('a-note').value = a.note;
        document.querySelector('input[name=sign][value="' + (a.days < 0 ? '-1' : '1') + '"]').checked = true;
        $('add-h').textContent = 'Change correction'; $('a-save').textContent = 'Save changes'; $('a-cancel').hidden = false;
        $('add').scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('a-type').focus({ preventScroll: true });
    }
    function setKind(k) {
        document.querySelector('input[name=kind][value="' + k + '"]').checked = true;
        $('leave-form').hidden = k !== 'leave'; $('adj-form').hidden = k !== 'adj';
        if (!editId && !editAdjId) $('add-h').textContent = k === 'adj' ? 'Add a correction' : 'Add leave';
    }

    // ---------- leave types ----------
    const MODE_TEXT = { year: 'All at the year start', month: 'Built up each month', none: 'No limit, only count it' };
    const CARRY_TEXT = { none: 'Are lost', cap: 'Some carry over', all: 'All carry over' };
    function field(box, labelText, input, hint) {
        const id = input.id;
        const l = el('label', null, labelText); l.htmlFor = id; box.appendChild(l); box.appendChild(input);
        const err = el('p', 'err'); err.id = id + '-e'; err.setAttribute('role', 'alert'); input.setAttribute('aria-describedby', err.id); box.appendChild(err);
        if (hint) box.appendChild(el('p', 'hint', hint));
        return err;
    }
    function textInput(id, value, mode, max, ph) {
        const i = el('input'); i.type = 'text'; i.id = id; i.value = value; i.autocomplete = 'off'; i.maxLength = max; if (mode) i.inputMode = mode; if (ph) i.placeholder = ph; return i;
    }
    function selectInput(id, opts, value) {
        const s = el('select'); s.id = id; Object.keys(opts).forEach(k => { const o = el('option', null, opts[k]); o.value = k; s.appendChild(o); }); s.value = value; return s;
    }
    function renderTypes() {
        const list = $('types-list'); list.textContent = '';
        const openY = C.openYear(state);
        state.types.forEach((t, i) => {
            const box = el('div', 'tbox'); box.dataset.id = t.id;
            const p = 't' + i + '-';
            box.appendChild(el('h3', 'tbox-h', t.name));
            const name = textInput(p + 'name', t.name, null, 40, 'e.g. Annual leave');
            field(box, 'Name', name);
            const mode = selectInput(p + 'mode', MODE_TEXT, t.mode);
            field(box, 'How you get it', mode);
            const wl = el('div', 'limited');
            const allow = textInput(p + 'allow', C.num(t.allow), 'decimal', 6, 'e.g. 20');
            const al = el('label', null, t.mode === 'month' ? 'Days each leave year (built up over 12 months)' : 'Days each leave year'); al.htmlFor = allow.id; al.id = p + 'allow-l';
            wl.appendChild(al);
            const row = el('div', 'inline'); row.appendChild(allow);
            const quick = el('div', 'quick');
            [10, 15, 20, 25, 30].forEach(n => { const c = el('button', 'chip', String(n)); c.type = 'button'; c.setAttribute('aria-label', n + ' days a year'); c.addEventListener('click', () => { allow.value = String(n); saveType(box, t.id); }); quick.appendChild(c); });
            row.appendChild(quick); wl.appendChild(row);
            const ae = el('p', 'err'); ae.id = allow.id + '-e'; ae.setAttribute('role', 'alert'); allow.setAttribute('aria-describedby', ae.id); wl.appendChild(ae);
            const carry = selectInput(p + 'carry', CARRY_TEXT, t.carry);
            field(wl, 'Unused days at the end of the year', carry);
            const wc = el('div', 'opt'); wc.hidden = t.carry !== 'cap';
            const cap = textInput(p + 'cap', t.carry === 'cap' ? C.num(t.cap) : '5', 'decimal', 6, 'e.g. 5');
            field(wc, 'Most days that carry over', cap);
            wl.appendChild(wc);
            // carried days that must be used within some months
            const ox = el('button', 'link', '+ Carried-over days must be used within (optional)'); ox.type = 'button'; ox.hidden = t.carry === 'none' || t.expire > 0;
            const wx = el('div', 'opt'); wx.hidden = t.carry === 'none' || !t.expire;
            const exp = textInput(p + 'expire', t.expire ? String(t.expire) : '', 'numeric', 2, 'e.g. 3');
            const xr = el('div', 'inline');
            const xl = el('label', null, 'Months to use carried-over days'); xl.htmlFor = exp.id; wx.appendChild(xl);
            xr.appendChild(exp); xr.appendChild(el('span', 'unit', 'months from the start of the leave year')); wx.appendChild(xr);
            const xe = el('p', 'err'); xe.id = exp.id + '-e'; xe.setAttribute('role', 'alert'); exp.setAttribute('aria-describedby', xe.id); wx.appendChild(xe);
            ox.addEventListener('click', () => { ox.hidden = true; wx.hidden = false; exp.value = '3'; saveType(box, t.id); exp.focus(); });
            wl.appendChild(ox); wl.appendChild(wx);
            // days brought into the first leave year
            const oo = el('button', 'link', '+ Days carried over from last year (optional)'); oo.type = 'button'; oo.hidden = t.opening > 0;
            const wo = el('div', 'opt'); wo.hidden = !t.opening;
            const op = textInput(p + 'opening', t.opening ? C.num(t.opening) : '', 'decimal', 6, 'e.g. 3');
            field(wo, 'Days carried over into ' + yearShort(openY), op, 'The days you brought into this leave year from before you used the app. Later years are carried over by the app.');
            oo.addEventListener('click', () => { oo.hidden = true; wo.hidden = false; op.focus(); });
            wl.appendChild(oo); wl.appendChild(wo);
            const wl2 = el('label', 'check warn-check'); const wcb = el('input'); wcb.type = 'checkbox'; wcb.id = p + 'warn'; wcb.checked = t.warn;
            wl2.appendChild(wcb); wl2.appendChild(document.createTextNode(' Warn me before unused days are lost'));
            wl.appendChild(wl2);
            wcb.addEventListener('change', () => saveType(box, t.id));
            wl.hidden = t.mode === 'none';
            box.appendChild(wl);
            const del = el('button', 'danger small-danger', 'Delete this leave type'); del.type = 'button';
            del.addEventListener('click', () => {
                const t = C.typeById(state, box.dataset.id); if (!t) return;
                const n = state.entries.filter(e => e.type === t.id).length + state.adjs.filter(a => a.type === t.id).length;
                const snap = snapshot();
                state.types = state.types.filter(x => x.id !== t.id);
                state.entries = state.entries.filter(e => e.type !== t.id); state.adjs = state.adjs.filter(a => a.type !== t.id);
                cancelEdit(); renderTypes(); commit();
                show('types-msg', 'Deleted ' + t.name + (n ? ' and its ' + n + (n === 1 ? ' leave' : ' leaves and corrections') : '') + '.', snap);
            });
            box.appendChild(del);
            [name, allow, cap, exp, op].forEach(inp => inp.addEventListener('input', () => saveType(box, t.id)));
            [mode, carry].forEach(s => s.addEventListener('change', () => {
                wl.hidden = mode.value === 'none'; wc.hidden = carry.value !== 'cap';
                const noCarry = carry.value === 'none';
                if (noCarry) { wx.hidden = true; ox.hidden = true; } else if (wx.hidden) ox.hidden = false;
                al.textContent = mode.value === 'month' ? 'Days each leave year (built up over 12 months)' : 'Days each leave year';
                saveType(box, t.id);
            }));
            list.appendChild(box);
        });
        if (!state.types.length) list.appendChild(el('p', 'empty', 'No leave types. Tap "+ Add a leave type".'));
    }
    let typeTimer = null;
    function saveType(box, id) {
        const q = s => box.querySelector('[id$="-' + s + '"]');
        const f = { name: q('name').value, mode: q('mode').value, allow: q('allow').value, carry: q('carry').value, cap: q('cap').value,
            expire: q('expire').closest('.opt').hidden ? '' : q('expire').value, opening: q('opening').value, warn: q('warn').checked };
        const r = C.readType(state, f, id);
        ['name', 'allow', 'cap', 'expire', 'opening'].forEach(k => { const inp = q(k), e = $(inp.id + '-e'); const msg = r.ok ? '' : r.errs[k] || ''; e.textContent = msg; if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); });
        if (!r.ok) return;
        const before = snapshot();
        state.types = state.types.map(t => (t.id === id ? r.type : t));
        box.querySelector('.tbox-h').textContent = r.type.name;
        commit();
        clearTimeout(typeTimer); typeTimer = setTimeout(() => show('types-msg', 'Saved ' + r.type.name + ': ' + C.typeRule(r.type) + '.', before), 700);
    }

    // ---------- work pattern ----------
    function fillPattern() {
        const sd = $('p-sd'), sm = $('p-sm');
        if (!sd.options.length) {
            for (let d = 1; d <= 31; d++) { const o = el('option', null, String(d)); o.value = d; sd.appendChild(o); }
            C.MONTHS_LONG.forEach((m, i) => { const o = el('option', null, m); o.value = i + 1; sm.appendChild(o); });
        }
        sd.value = state.startD; sm.value = state.startM;
        const wd = $('wd'); wd.textContent = '';
        [1, 2, 3, 4, 5, 6, 0].forEach(d => {
            const l = el('label', 'wd-day'); const c = el('input'); c.type = 'checkbox'; c.value = d; c.checked = state.workdays.includes(d);
            c.addEventListener('change', () => {
                const w = [...wd.querySelectorAll('input:checked')].map(x => +x.value);
                if (!w.length) { c.checked = true; setErr('e-wd', 'Keep at least one working day.'); return; }
                setErr('e-wd', '');
                const snap = snapshot(); state.workdays = w.sort(); commit();
                show('pat-msg', 'Working days: ' + C.workdaysText(state.workdays) + '.', snap);
            });
            l.appendChild(c); l.appendChild(el('span', null, C.DAYS[d])); wd.appendChild(l);
        });
        const hasJ = !!state.joined;
        $('o-joined').hidden = hasJ; $('w-joined').hidden = !hasJ; $('p-joined').value = state.joined || '';
    }
    function changeStart() {
        const snap = snapshot();
        state.startD = +$('p-sd').value; state.startM = +$('p-sm').value;
        viewY = C.yearOf(state, today);
        renderTypes(); commit();
        const Y = C.yearOf(state, today);
        show('pat-msg', 'Your leave year now runs ' + C.longDate(C.yearStart(state, Y)) + ' to ' + C.longDate(C.yearEnd(state, Y)) + '.', snap);
    }
    function renderHolidays() {
        const ul = $('hols'); ul.textContent = '';
        if (!state.holidays.length) { ul.appendChild(el('li', 'empty', 'No public holidays added.')); return; }
        state.holidays.forEach(h => {
            const li = el('li', 'hol');
            li.appendChild(el('span', 'hol-d', C.shortDate(h.date, today)));
            li.appendChild(el('span', 'hol-n', h.name || 'Public holiday'));
            const b = el('button', 'secondary small', 'Remove'); b.type = 'button'; b.setAttribute('aria-label', 'Remove ' + (h.name || 'public holiday') + ' on ' + C.shortDate(h.date, today));
            b.addEventListener('click', () => { const snap = snapshot(); state.holidays = state.holidays.filter(x => x.date !== h.date); commit(); show('pat-msg', 'Removed ' + (h.name || 'the public holiday') + ' on ' + C.shortDate(h.date, today) + '.', snap); });
            li.appendChild(b); ul.appendChild(li);
        });
    }
    function addHoliday() {
        const d = $('h-date').value, name = $('h-name').value.trim().slice(0, 40);
        setErr('e-hol', '', $('h-date'));
        if (!C.isDate(d)) { setErr('e-hol', 'Choose the date of the public holiday.', $('h-date')); $('h-date').focus(); return; }
        if (state.holidays.some(h => h.date === d)) { setErr('e-hol', C.shortDate(d, today) + ' is already a public holiday.', $('h-date')); return; }
        if (state.holidays.length >= 500) { setErr('e-hol', 'You can keep up to 500 public holidays. Remove old ones first.'); return; }
        const snap = snapshot();
        state.holidays.push({ date: d, name }); state.holidays.sort((a, b) => (a.date < b.date ? -1 : 1));
        $('h-date').value = ''; $('h-name').value = '';
        commit();
        const hit = state.entries.filter(e => e.from <= d && e.to >= d && e.custom == null).length;
        show('pat-msg', 'Added ' + (name || 'a public holiday') + ' on ' + C.shortDate(d, today) + '.' + (hit ? ' It is no longer taken off your leave that day.' : ''), snap);
    }

    // ---------- wiring ----------
    function wire() {
        $('y-prev').addEventListener('click', () => { viewY--; render(); });
        $('y-next').addEventListener('click', () => { viewY++; render(); });
        $('y-now').addEventListener('click', () => { viewY = C.yearOf(state, today); render(); });
        document.querySelectorAll('input[name=kind]').forEach(r => r.addEventListener('change', () => { cancelEdit(); setKind(r.value); }));
        $('leave-form').addEventListener('submit', submitLeave);
        $('adj-form').addEventListener('submit', submitAdj);
        $('f-cancel').addEventListener('click', () => { cancelEdit(); updatePreview(); show('add-msg', 'Not changed.'); });
        $('a-cancel').addEventListener('click', () => { cancelEdit(); show('add-msg', 'Not changed.'); });
        $('f-from').addEventListener('change', () => {
            const f = $('f-from').value, t = $('f-to').value;
            if (C.isDate(f) && (!C.isDate(t) || t < f)) $('f-to').value = f;
            syncHalf(); clearLeaveErrs(); updatePreview();
        });
        ['f-to'].forEach(id => $(id).addEventListener('change', () => { syncHalf(); clearLeaveErrs(); updatePreview(); }));
        ['f-from', 'f-to'].forEach(id => $(id).addEventListener('input', () => { syncHalf(); updatePreview(); }));
        ['f-type', 'f-half', 'f-half-first', 'f-half-last'].forEach(id => $(id).addEventListener('change', () => { clearLeaveErrs(); updatePreview(); }));
        $('f-custom').addEventListener('input', () => { setErr('e-custom', '', $('f-custom')); updatePreview(); });
        $('o-custom').addEventListener('click', () => { $('o-custom').hidden = true; $('w-custom').hidden = false; $('f-custom').focus(); });
        $('o-note').addEventListener('click', () => { $('o-note').hidden = true; $('w-note').hidden = false; $('f-note').focus(); });

        $('type-add').addEventListener('click', () => {
            const snap = snapshot();
            let n = 1, name = 'Other leave'; while (state.types.some(t => t.name.toLowerCase() === name.toLowerCase())) name = 'Other leave ' + (++n);
            if (state.types.length >= 30) { show('types-msg', 'You can have up to 30 leave types.'); return; }
            state.types.push({ id: C.newId(), name, mode: 'year', allow: 0, carry: 'none', cap: 0, expire: 0, opening: 0, warn: true });
            renderTypes(); commit();
            const inp = $('types-list').lastElementChild.querySelector('[id$="-name"]'); inp.focus(); inp.select();
            show('types-msg', 'Added ' + name + '. Give it a name and the days you get.', snap);
        });

        $('p-sd').addEventListener('change', changeStart);
        $('p-sm').addEventListener('change', changeStart);
        $('o-joined').addEventListener('click', () => { $('o-joined').hidden = true; $('w-joined').hidden = false; $('p-joined').focus(); });
        $('p-joined').addEventListener('change', () => {
            const v = $('p-joined').value; if (!C.isDate(v)) return;
            const snap = snapshot(); state.joined = v; commit();
            show('pat-msg', 'Joining date ' + C.longDate(v) + '. Leave before it is not given.', snap);
        });
        $('joined-clear').addEventListener('click', () => {
            const snap = snapshot(); state.joined = null; fillPattern(); commit(); show('pat-msg', 'Joining date removed.', snap);
        });
        $('h-add').addEventListener('click', addHoliday);
        $('h-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addHoliday(); } });

        $('copy').addEventListener('click', () => copyText(C.summaryText(state, viewY, today)).then(ok => show('set-msg', ok ? 'Copied. Paste it into a message or email.' : 'Could not copy. Use "Email my balance" instead.')));
        $('csv').addEventListener('click', () => { download('leave-' + today + '.csv', 'text/csv', C.csv(state, today)); show('set-msg', 'Downloaded leave-' + today + '.csv.'); });
        $('print').addEventListener('click', () => window.print());
        $('backup').addEventListener('click', () => { download('leave-balance-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1)); show('set-msg', 'Backup saved as leave-balance-backup-' + today + '.json.'); });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', ev => {
            const file = ev.target.files && ev.target.files[0]; ev.target.value = '';
            if (!file) return;
            if (file.size > 2000000) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            const rd = new FileReader();
            rd.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(rd.result), today); } catch (e) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
                const snap = snapshot(); state = s; viewY = C.yearOf(state, today);
                cancelEdit(); fillPattern(); renderTypes(); commit();
                show('set-msg', 'Restored ' + s.types.length + ' leave types and ' + s.entries.length + (s.entries.length === 1 ? ' leave.' : ' leaves.'), snap);
            };
            rd.onerror = () => show('set-msg', 'Could not read that file.');
            rd.readAsText(file);
        });
        $('wipe').addEventListener('click', () => {
            const snap = snapshot(); state = C.emptyState(today); viewY = C.yearOf(state, today);
            cancelEdit(); resetLeaveForm(); fillPattern(); renderTypes(); commit();
            show('set-msg', 'Everything deleted. The app is back to its first look.', snap);
        });

        // the day changes at midnight, also while the page stays open
        const tick = () => { const t = C.todayIso(); if (t !== today) { const wasNow = viewY === C.yearOf(state, today); today = t; if (wasNow) viewY = C.yearOf(state, today); render(); } };
        setInterval(tick, 30000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    }

    state = load();
    viewY = C.yearOf(state, today);
    fillPattern(); renderTypes(); resetAdjForm(); syncHalf(); wire(); save(); render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
