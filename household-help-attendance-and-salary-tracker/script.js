// Household Help Attendance and Salary Tracker: the page. The maths and the words are in core.js (window.HHS).
(function () {
    'use strict';
    const C = window.HHS, SLUG = 'household-help-attendance-and-salary-tracker', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const LOC = navigator.language || 'en-GB';
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', '₦': '₦ (naira)',
        'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', 'Rp': 'Rp (rupiah)', 'RM': 'RM (ringgit)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (Qatari riyal)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
    const MARK = { worked: '✓', leave: 'L', absent: '✗', half: '½', hol: 'H', extra: '+1', off: 'Off', none: '' };
    const KIND_WORDS = { worked: 'worked', leave: 'absent, paid leave', absent: 'absent, unpaid', half: 'half day', hol: 'paid holiday', extra: 'came on a day off, extra day', off: 'weekly day off', none: 'not working for you' };
    let state = C.emptyState(), today = C.dayStr(new Date()), view = C.monthOf(today);
    let editing = null;      // id of the worker shown in the form, or null when adding
    let openDay = null;      // { id, day } day editor that is open
    let panel = null;        // { id, what: 'adv' | 'bonus' | 'pay' }
    let flash = null;        // { where, text, undo, bad }
    let undoSnap = null, canSave = true, role = '';

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (!raw) return;
        try { const s = C.cleanState(JSON.parse(raw)); if (s) state = s; } catch (e) { /* corrupt: start fresh */ }
    }
    function save() {
        if (!canSave) return;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canSave = false; $('store-warn').hidden = false; }
    }
    const snap = () => JSON.stringify(state);
    function change(fn, where, text) {
        const before = snap();
        fn();
        save();
        undoSnap = before;
        flash = { where, text, undo: true };
        render();
    }
    function undo() {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap));
        if (s) state = s;
        const where = flash && $(flash.where) ? flash.where : 'add-msg';
        undoSnap = null; openDay = null; panel = null;
        save();
        flash = { where, text: 'Undone.' };
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const money = c => C.fmt(c, state.cur, LOC);
    const signed = c => C.signed(c, state.cur, LOC);
    const byId = id => state.workers.find(x => x.id === id);
    const nameOf = w => w.name || 'Worker';
    const amtText = c => (c / 100).toFixed(c % 100 ? 2 : 0);
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into a message.' }; render(); };
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Use Print slip instead.', bad: true }; render(); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function setErr(id, msg) {
        const box = $(id + '-err'); if (box) box.textContent = msg || '';
        const inp = $(id); if (inp && inp.tagName !== 'FIELDSET') { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
        return !msg;
    }
    function showMsg(where, text, withUndo, bad) {
        const box = typeof where === 'string' ? $(where) : where;
        if (!box) return;
        box.textContent = '';
        box.className = 'msg show' + (bad ? ' bad' : '');
        box.appendChild(document.createTextNode(text + ' '));
        if (withUndo) box.appendChild(btn('Undo', 'link inline undo', undo));
    }
    function minMonth() { return state.workers.reduce((m, w) => C.monthOf(w.start) < m ? C.monthOf(w.start) : m, C.monthOf(today)); }
    const maxMonth = () => C.addMonth(C.monthOf(today), 2);

    // ---------- the form ----------
    function buildForm() {
        WD_ORDER.forEach(d => {
            const lab = el('label', 'wd-chip'), cb = el('input');
            cb.type = 'checkbox'; cb.value = String(d); cb.id = 'f-wd-' + d;
            cb.setAttribute('aria-label', C.DAYS_LONG[d]);
            lab.appendChild(cb); lab.appendChild(el('span', '', C.DAYS[d]));
            $('f-wd-row').appendChild(lab);
        });
        for (let i = 0; i <= 10; i++) { const o = el('option', '', i === 0 ? 'None' : C.plural(i, 'day', 'days')); o.value = String(i); $('f-leave').appendChild(o); }
        C.SYMBOLS.forEach(s => { const o = el('option', '', CUR_NAMES[s] || s); o.value = s; $('cur').appendChild(o); });
    }
    function setRole(r, other) {
        role = r;
        document.querySelectorAll('#quick .chip').forEach(c => {
            const on = other ? c.dataset.role === '' : (c.dataset.role === r && r !== '');
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        $('f-role-box').hidden = !other;
        if (other) $('f-role').value = r;
    }
    const offTicked = () => [...document.querySelectorAll('#f-wd-row input:checked')].map(cb => Number(cb.value));
    function formHints() {
        $('f-carry-box').hidden = $('f-leave').value === '0';
        const hasOff = offTicked().length > 0;
        $('f-extra-open').hidden = !hasOff || !$('f-extra-box').hidden;
        if (!hasOff) $('f-extra-box').hidden = true;
        const p = C.parseAmount($('f-pay').value);
        const rule = $('f-rule').value;
        let t = 'Used for unpaid days off, extra days, and a month they joined or left part way.';
        if (!p.error) {
            const ym = C.monthOf(today), wk = C.newWorker('x', C.firstDay(ym));
            wk.rule = rule; wk.off = offTicked();
            const D = C.divisor(wk, ym), day = C.mulDiv(p.cents, 1, D);
            t = 'With ' + money(p.cents) + ' a month, one day is ' + money(day) + (rule === 'thirty' ? ' in every month.' : ' in ' + C.monthOnly(ym, LOC) + ' (' + D + (rule === 'work' ? ' working' : '') + ' days).');
        }
        $('f-rule-hint').textContent = t;
        const st = $('f-start').value, w0 = editing && byId(editing);
        const sm = w0 && w0.settled ? w0.settled : C.monthOf(today);
        $('f-settled-box').hidden = !(C.isDay(st) && C.monthOf(st) < sm);
        $('f-settled-t').textContent = 'Pay before ' + C.monthName(sm, LOC) + ' is already settled';
        if (editing) {
            const w = byId(editing);
            const changed = w && !p.error && p.cents !== C.payFor(w, C.monthOf(today) < C.monthOf(w.start) ? C.monthOf(w.start) : C.monthOf(today));
            $('f-from-box').hidden = !changed;
        }
    }
    function fillFrom(w) {
        const sel = $('f-from'); sel.textContent = '';
        const first = C.monthOf(w.start), cur = C.monthOf(today);
        const lo = C.addMonth(cur, -12) > first ? C.addMonth(cur, -12) : first;
        for (let m = lo; m <= C.addMonth(cur, 3); m = C.addMonth(m, 1)) {
            const o = el('option', '', C.monthName(m, LOC) + ' pay' + (m === first ? ' (from the start)' : ''));
            o.value = m; sel.appendChild(o);
        }
        sel.value = cur >= lo ? cur : lo;
    }
    function resetForm() {
        editing = null;
        ['f-name', 'f-role', 'f-pay', 'f-extra', 'f-ot', 'f-open', 'f-stop'].forEach(id => { $(id).value = ''; });
        ['f-name', 'f-pay', 'f-wd', 'f-start', 'f-stop', 'f-extra', 'f-ot', 'f-open'].forEach(id => setErr(id, ''));
        setRole('', false);
        document.querySelectorAll('#f-wd-row input').forEach(cb => { cb.checked = false; });
        $('f-leave').value = '0'; $('f-carry').checked = false; $('f-settled').checked = true; $('f-rule').value = 'thirty'; $('f-open-kind').value = 'owe';
        $('f-start').value = C.firstDay(C.monthOf(today));
        ['f-extra-box', 'f-ot-box', 'f-open-box', 'f-stop-box', 'f-from-box'].forEach(id => { $(id).hidden = true; });
        $('f-ot-open').hidden = false; $('f-open-open').hidden = false; $('f-stop-open').hidden = true;
        $('add-h').textContent = 'Add a worker'; $('f-save').textContent = 'Add worker'; $('f-cancel').hidden = true;
        $('f-pay-l').textContent = 'Monthly pay';
        $('f-start-hint').textContent = 'If they have worked for you for a while, pick the 1st of this month.';
        $('add-intro').hidden = false;
        formHints();
    }
    function fillForm(w) {
        resetForm();
        editing = w.id;
        $('f-name').value = w.name;
        const known = [...document.querySelectorAll('#quick .chip')].some(c => c.dataset.role && c.dataset.role === w.role);
        setRole(w.role, !!w.role && !known);
        const cur = C.monthOf(today) < C.monthOf(w.start) ? C.monthOf(w.start) : C.monthOf(today);
        $('f-pay').value = amtText(C.payFor(w, cur));
        $('f-pay-l').textContent = 'Monthly pay now';
        fillFrom(w);
        document.querySelectorAll('#f-wd-row input').forEach(cb => { cb.checked = w.off.includes(Number(cb.value)); });
        $('f-leave').value = String(w.leave); $('f-carry').checked = w.carry; $('f-rule').value = w.rule;
        $('f-start').value = w.start;
        $('f-settled').checked = !!w.settled;
        if (w.extraC) { $('f-extra-box').hidden = false; $('f-extra').value = amtText(w.extraC); }
        if (w.otC) { $('f-ot-box').hidden = false; $('f-ot-open').hidden = true; $('f-ot').value = amtText(w.otC); }
        if (w.open) { $('f-open-box').hidden = false; $('f-open-open').hidden = true; $('f-open-kind').value = w.open > 0 ? 'owe' : 'adv'; $('f-open').value = amtText(Math.abs(w.open)); }
        $('f-stop-open').hidden = !!w.stop; $('f-stop-box').hidden = !w.stop; $('f-stop').value = w.stop;
        $('add-h').textContent = 'Edit ' + nameOf(w); $('f-save').textContent = 'Save changes'; $('f-cancel').hidden = false;
        $('f-start-hint').textContent = 'Changing the days off, leave or start date changes the slips of earlier months too.';
        $('add-intro').hidden = true;
        formHints();
        render();
        $('add').scrollIntoView({ block: 'start' });
        $('f-name').focus({ preventScroll: true });
    }
    function readForm() {
        let ok = true;
        const name = $('f-name').value.trim();
        ok = setErr('f-name', name ? '' : 'Type their name, such as Rubina.') && ok;
        const p = C.parseAmount($('f-pay').value, { blank: 'Type the monthly pay, such as 30000.' });
        ok = setErr('f-pay', p.error || '') && ok;
        const off = offTicked();
        ok = setErr('f-wd', off.length === 7 ? 'Untick at least one day: they must work on some days.' : '') && ok;
        const start = $('f-start').value;
        ok = setErr('f-start', C.isDay(start) ? '' : 'Pick the day they started working.') && ok;
        let stop = '';
        if (!$('f-stop-box').hidden && $('f-stop').value) {
            stop = $('f-stop').value;
            ok = setErr('f-stop', !C.isDay(stop) ? 'Pick a real day.' : C.isDay(start) && stop < start ? 'The last working day cannot be before the start.' : '') && ok;
        } else setErr('f-stop', '');
        const opt = (id, box) => {
            if ($(box).hidden || !$(id).value.trim()) { setErr(id, ''); return 0; }
            const x = C.parseAmount($(id).value);
            ok = setErr(id, x.error || '') && ok;
            return x.error ? 0 : x.cents;
        };
        const extraC = off.length ? opt('f-extra', 'f-extra-box') : 0, otC = opt('f-ot', 'f-ot-box'), o = opt('f-open', 'f-open-box');
        const roleText = $('f-role-box').hidden ? role : $('f-role').value.trim().slice(0, 30);
        if (!ok) { const first = document.querySelector('#add [aria-invalid="true"], #add .err:not(:empty)'); if (first) { const t = first.tagName === 'P' ? first.parentElement.querySelector('input') : first; if (t) t.focus(); } return null; }
        return { name: name.slice(0, 40), role: roleText, pay: p.cents, off, leave: Number($('f-leave').value), carry: $('f-leave').value !== '0' && $('f-carry').checked,
            rule: $('f-rule').value, start, stop, extraC, otC, open: $('f-open-kind').value === 'adv' ? -o : o, from: $('f-from').value,
            settled: !$('f-settled-box').hidden && $('f-settled').checked };
    }
    function saveForm() {
        const f = readForm();
        if (!f) return;
        const set = w => Object.assign(w, { name: f.name, role: f.role, off: f.off, leave: f.leave, carry: f.carry, rule: f.rule, start: f.start, stop: f.stop, extraC: f.extraC, otC: f.otC, open: f.open,
            settled: f.settled ? (w.settled || C.monthOf(today)) : '' });
        if (!editing) {
            if (state.workers.length >= 30) { flash = { where: 'add-msg', text: 'You can keep up to 30 workers.', bad: true }; render(); return; }
            const w = C.newWorker(C.newId(), f.start);
            set(w); w.pays = [{ from: C.monthOf(f.start), c: f.pay }];
            change(() => { state.workers.push(w); }, 'item-' + w.id, f.name + ' added. Every working day counts as worked: tap a day in the calendar if they were absent.');
            view = C.monthOf(today) < C.monthOf(f.start) ? C.monthOf(f.start) : C.monthOf(today);
            resetForm(); render();
            const box = $('item-' + w.id); if (box) box.scrollIntoView({ block: 'start' });
            return;
        }
        const w = byId(editing);
        if (!w) { resetForm(); render(); return; }
        const id = w.id, payChanged = !$('f-from-box').hidden;
        change(() => {
            const x = byId(id);
            set(x);
            const first = C.monthOf(f.start);
            let pays = x.pays.slice();
            if (payChanged) {
                const from = f.from < first ? first : f.from;
                pays = pays.filter(p => p.from < from).concat([{ from, c: f.pay }]);
            }
            // the first pay always starts with the first month
            if (!pays.length) pays = [{ from: first, c: f.pay }];
            pays[0] = { from: pays[0].from < first ? pays[0].from : first, c: pays[0].c };
            const seen = {}; pays.forEach(p => { seen[p.from] = p.c; });
            x.pays = Object.keys(seen).sort().map(m => ({ from: m, c: seen[m] }));
            // marks outside the working dates are dropped
            Object.keys(x.marks).forEach(d => { if (!C.employedOn(x, d)) delete x.marks[d]; });
        }, 'item-' + id, 'Changes saved.');
        resetForm(); render();
        const box = $('item-' + id); if (box) box.scrollIntoView({ block: 'start' });
    }

    // ---------- the month box ----------
    function renderMonth() {
        const has = state.workers.length > 0;
        $('month').hidden = !has;
        if (!has) return;
        if (view < minMonth()) view = minMonth();
        if (view > maxMonth()) view = maxMonth();
        $('month-h').textContent = C.monthName(view, LOC);
        $('mo-prev').disabled = view <= minMonth();
        $('mo-next').disabled = view >= maxMonth();
        $('mo-today').hidden = view === C.monthOf(today);
        const rows = $('mo-rows'); rows.textContent = '';
        let total = 0, shown = 0;
        state.workers.forEach(w => {
            const r = C.monthPay(w, view);
            if (!r.busy) return;
            shown++;
            if (r.toPay > 0) total += r.toPay;
            const row = el('div', 'mo-row'), l = el('div', 'mo-l');
            l.appendChild(el('p', 'mo-name', nameOf(w) + (w.role ? ' (' + w.role + ')' : '')));
            l.appendChild(el('p', 'mo-what', 'Pay for ' + C.monthOnly(view, LOC) + ': ' + signed(r.net) + (r.paid ? ', paid ' + money(r.paid) : '')));
            row.appendChild(l);
            row.appendChild(el('p', 'mo-r' + (r.toPay > 0 ? '' : ' good'), r.toPay > 0 ? money(r.toPay) + ' to pay' : r.toPay === 0 ? (r.paid ? 'Paid' : 'Nothing to pay') : money(-r.toPay) + ' off next month'));
            rows.appendChild(row);
        });
        if (!shown) rows.appendChild(el('p', 'mo-what', 'Nobody worked for you in this month.'));
        $('mo-pay').textContent = 'To pay for ' + C.monthOnly(view, LOC) + ': ' + money(total);
        const cur = C.monthOf(today);
        $('mo-note').textContent = view === cur ? 'Days still to come this month are counted as worked.' : view > cur ? 'A month still to come: every working day is counted as worked.' : '';
    }

    // ---------- one worker's box ----------
    function kindOf(w, d, r) {
        const k = C.dayKind(w, d);
        if (k === 'absent' && r && !r.unpaid.some(x => x.d === d)) return 'leave';
        return k;
    }
    function markDay(id, day, k, text) {
        change(() => {
            const w = byId(id), ot = w.marks[day] && w.marks[day].ot;
            if (k || ot) w.marks[day] = ot ? { k, ot } : { k }; else delete w.marks[day];
            if (!k && !ot) delete w.marks[day];
        }, 'item-msg-' + id, text);
    }
    function todayBox(w, r) {
        if (view !== C.monthOf(today) || !C.employedOn(w, today)) return null;
        const box = el('div', 'today-box'), k = kindOf(w, today, r), off = C.isOff(w, today);
        const dn = C.dayName(today, LOC);
        const words = { worked: 'a working day', leave: 'absent (paid leave)', absent: 'absent (unpaid)', half: 'half day', hol: 'paid holiday', extra: 'came on their day off (extra day)', off: 'weekly day off' };
        box.appendChild(el('p', 'tb-t', 'Today, ' + dn + ': ' + words[k]));
        const row = el('div', 'tb-btns');
        if (off) {
            if (k === 'extra') row.appendChild(btn('Undo: did not come', 'secondary', () => markDay(w.id, today, '', 'Today is a day off again.')));
            else row.appendChild(btn('Came to work today', 'secondary', () => markDay(w.id, today, 'x', nameOf(w) + ' came on their day off: one extra day added.')));
        } else if (k === 'worked') {
            row.appendChild(btn('Absent today', 'secondary', () => markDay(w.id, today, 'a', nameOf(w) + ' marked absent today.')));
            row.appendChild(btn('Half day today', 'secondary', () => markDay(w.id, today, 'h', nameOf(w) + ' marked half day today.')));
        } else row.appendChild(btn('Mark today as worked', 'secondary', () => markDay(w.id, today, '', nameOf(w) + ' marked as worked today.')));
        box.appendChild(row);
        return box;
    }
    function calendar(w, r) {
        const cal = el('div', 'cal');
        cal.setAttribute('role', 'group'); cal.setAttribute('aria-label', 'Attendance in ' + C.monthName(view, LOC) + ', tap a day to change it');
        WD_ORDER.forEach(d => { cal.appendChild(el('span', 'cal-h', C.DAYS[d].slice(0, 2))); });
        const first = C.firstDay(view), lead = (C.weekday(first) + 6) % 7;
        for (let i = 0; i < lead; i++) cal.appendChild(el('span', 'day blank'));
        for (let d = first, last = C.lastDay(view); d <= last; d = C.addDays(d, 1)) {
            const k = kindOf(w, d, r), n = Number(d.slice(8));
            let cell;
            if (k === 'none') { cell = el('span', 'day none'); cell.appendChild(el('span', 'dn', String(n))); }
            else {
                cell = btn('', 'day ' + k, () => { openDay = openDay && openDay.id === w.id && openDay.day === d ? null : { id: w.id, day: d }; panel = null; render(); const p = $('dp-' + w.id); if (p) p.querySelector('button').focus(); });
                cell.appendChild(el('span', 'dn', String(n)));
                cell.appendChild(el('span', 'dq', MARK[k]));
                const ot = w.marks[d] && w.marks[d].ot;
                cell.setAttribute('aria-label', C.dayName(d, LOC) + ': ' + KIND_WORDS[k] + (ot ? ', ' + C.hoursText(ot) + ' overtime' : '') + (d > today ? ' (still to come)' : ''));
                if (ot) cell.classList.add('ot');
                if (d > today) cell.classList.add('later');
                if (d === today) cell.classList.add('today');
                if (openDay && openDay.id === w.id && openDay.day === d) { cell.classList.add('sel'); cell.setAttribute('aria-expanded', 'true'); }
            }
            cal.appendChild(cell);
        }
        return cal;
    }
    function dayPanel(w, r) {
        if (!openDay || openDay.id !== w.id || C.monthOf(openDay.day) !== view) return null;
        const d = openDay.day, off = C.isOff(w, d), k = kindOf(w, d, r);
        const p = el('div', 'panel'); p.id = 'dp-' + w.id;
        p.appendChild(el('h3', '', C.dayName(d, LOC)));
        p.appendChild(el('p', 'dp-now', 'Now: ' + KIND_WORDS[k] + '.'));
        const row = el('div', 'dp-btns');
        const opt = (text, mk, msg) => { const b = btn(text, 'secondary', () => markDay(w.id, d, mk, msg)); const cur = ((w.marks[d] || {}).k || ''); b.setAttribute('aria-pressed', cur === mk ? 'true' : 'false'); row.appendChild(b); };
        const ds = C.shortDate(d, LOC);
        if (off) {
            opt('Day off', '', ds + ': weekly day off.');
            opt('Came to work', 'x', ds + ': came on the day off, one extra day added.');
        } else {
            opt('Worked', '', ds + ': worked.');
            opt('Absent', 'a', ds + ': absent.');
            opt('Half day', 'h', ds + ': half day.');
            opt('Paid holiday', 'p', ds + ': paid holiday, nothing taken off.');
        }
        p.appendChild(row);
        if (w.otC) {
            const id = 'ot-' + w.id;
            const lab = el('label', '', 'Overtime hours'); lab.htmlFor = id;
            const inp = el('input'); inp.type = 'text'; inp.id = id; inp.inputMode = 'decimal'; inp.maxLength = 10; inp.autocomplete = 'off'; inp.placeholder = 'e.g. 2 or 1:30';
            const cur = w.marks[d] && w.marks[d].ot; if (cur) inp.value = String(Math.round(cur / 6) / 10);
            const err = el('p', 'err'); err.id = id + '-err'; err.setAttribute('role', 'alert');
            inp.setAttribute('aria-describedby', err.id);
            const go = () => {
                const h = C.parseHours(inp.value);
                if (h.error) { err.textContent = h.error; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
                change(() => { const x = byId(w.id), mk = x.marks[d] || { k: '' }; if (h.min) x.marks[d] = { k: mk.k || '', ot: h.min }; else if (mk.k) x.marks[d] = { k: mk.k }; else delete x.marks[d]; },
                    'item-msg-' + w.id, h.min ? ds + ': ' + C.hoursText(h.min) + ' overtime.' : ds + ': no overtime.');
            };
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
            const line = el('div', 'dp-amt'); line.appendChild(inp); line.appendChild(btn('Save hours', 'primary', go));
            p.appendChild(lab); p.appendChild(line); p.appendChild(err);
        }
        p.appendChild(btn('Close', 'link', () => { openDay = null; render(); }));
        return p;
    }
    function field(p, id, label, type, val, ph) {
        const lab = el('label', '', label); lab.htmlFor = id; p.appendChild(lab);
        const inp = el('input'); inp.type = type; inp.id = id; if (type === 'text') { inp.inputMode = 'decimal'; inp.maxLength = 16; inp.autocomplete = 'off'; }
        if (ph) inp.placeholder = ph; inp.value = val || '';
        p.appendChild(inp);
        const err = el('p', 'err'); err.id = id + '-err'; err.setAttribute('role', 'alert'); p.appendChild(err);
        inp.setAttribute('aria-describedby', err.id);
        return inp;
    }
    function select(p, id, label, opts, val) {
        const lab = el('label', '', label); lab.htmlFor = id; p.appendChild(lab);
        const s = el('select'); s.id = id;
        opts.forEach(([v, t]) => { const o = el('option', '', t); o.value = v; s.appendChild(o); });
        if (val != null) s.value = val;
        p.appendChild(s);
        return s;
    }
    function noteField(p, id, ph) {
        const box = el('div', 'field'); box.hidden = true;
        const open = btn('+ Add a note (optional)', 'link', () => { box.hidden = false; open.hidden = true; inp.focus(); });
        const lab = el('label', '', 'Note'); lab.htmlFor = id;
        const inp = el('input'); inp.type = 'text'; inp.id = id; inp.maxLength = 60; inp.autocomplete = 'off'; inp.placeholder = ph;
        box.appendChild(lab); box.appendChild(inp);
        p.appendChild(open); p.appendChild(box);
        return inp;
    }
    const defDay = () => view === C.monthOf(today) ? today : view < C.monthOf(today) ? C.lastDay(view) : C.firstDay(view);
    function moneyPanel(w, r) {
        if (!panel || panel.id !== w.id) return null;
        const p = el('div', 'panel'), id = w.id;
        p.id = 'mp-' + id;
        const mo = C.monthOnly(view, LOC);
        const cancel = btn('Cancel', 'secondary', () => { panel = null; render(); });
        const okBtn = (text, fn) => { const row = el('div', 'row-btns'); row.appendChild(btn(text, 'primary', fn)); row.appendChild(cancel); p.appendChild(row); };
        const amt = (inp, blank) => { const a = C.parseAmount(inp.value, { blank }); setErr(inp.id, a.error || ''); return a; };
        const dayOk = (inp) => { const ok = C.isDay(inp.value); setErr(inp.id, ok ? '' : 'Pick a day.'); return ok; };
        if (panel.what === 'adv') {
            p.appendChild(el('h3', '', 'Advance or loan to ' + nameOf(w)));
            const a = field(p, 'adv-amt-' + id, 'Amount given', 'text', '', 'e.g. 5000');
            const d = field(p, 'adv-day-' + id, 'Date given', 'date', defDay());
            const nOpts = [['1', 'All from one month\'s pay']];
            for (let i = 2; i <= 12; i++) nOpts.push([String(i), 'Over ' + i + ' months']);
            const n = select(p, 'adv-n-' + id, 'Take it back', nOpts, '1');
            const from = select(p, 'adv-from-' + id, 'Starting with', [], null);
            const fillFromSel = () => {
                const base = C.isDay(d.value) ? C.monthOf(d.value) : view, first = C.monthOf(w.start), m0 = base < first ? first : base;
                const keep = from.value; from.textContent = '';
                [m0, C.addMonth(m0, 1)].forEach(m => { const o = el('option', '', C.monthName(m, LOC) + ' pay'); o.value = m; from.appendChild(o); });
                if ([...from.options].some(o => o.value === keep)) from.value = keep;
            };
            d.addEventListener('change', fillFromSel); fillFromSel();
            const note = noteField(p, 'adv-note-' + id, 'e.g. for school fees');
            okBtn('Save advance', () => {
                const x = amt(a, 'Type the amount given, such as 5000.'), dk = dayOk(d);
                if (x.error || !dk) { (x.error ? a : d).focus(); return; }
                const e = { id: C.newId(), k: 'adv', d: d.value, c: x.cents, note: note.value.trim().slice(0, 60), n: Number(n.value), from: from.value };
                panel = null;
                change(() => { byId(id).entries.push(e); }, 'item-msg-' + id, 'Advance of ' + money(e.c) + ' saved' + (e.n > 1 ? ', taken back over ' + e.n + ' months.' : ', taken back from ' + C.monthOnly(e.from, LOC) + ' pay.'));
            });
            setTimeout(() => a.focus(), 0);
        } else if (panel.what === 'bonus') {
            p.appendChild(el('h3', '', 'Bonus or deduction for ' + nameOf(w)));
            const k = select(p, 'bn-k-' + id, 'What is it', [['bonus', 'Bonus or gift (added to the pay)'], ['ded', 'Deduction (taken off the pay)']], 'bonus');
            const a = field(p, 'bn-amt-' + id, 'Amount', 'text', '', 'e.g. 5000');
            const d = field(p, 'bn-day-' + id, 'Date', 'date', defDay());
            p.appendChild(el('p', 'hint', 'It goes on the pay slip of the month of this date.'));
            const note = noteField(p, 'bn-note-' + id, 'e.g. Eid');
            okBtn('Save', () => {
                const x = amt(a, 'Type the amount, such as 5000.'), dk = dayOk(d);
                if (x.error || !dk) { (x.error ? a : d).focus(); return; }
                if (d.value < w.start) { setErr(d.id, 'Pick a day on or after they started (' + C.niceDate(w.start, LOC) + ').'); d.focus(); return; }
                const e = { id: C.newId(), k: k.value, d: d.value, c: x.cents, note: note.value.trim().slice(0, 60) };
                panel = null;
                view = C.monthOf(e.d);
                change(() => { byId(id).entries.push(e); }, 'item-msg-' + id, (e.k === 'bonus' ? 'Bonus of ' : 'Deduction of ') + money(e.c) + ' saved on the ' + C.monthName(view, LOC) + ' slip.');
            });
            setTimeout(() => k.focus(), 0);
        } else {
            p.appendChild(el('h3', '', 'Payment to ' + nameOf(w) + ' for ' + mo + ' pay'));
            const a = field(p, 'pay-amt-' + id, 'Amount paid', 'text', r.toPay > 0 ? amtText(r.toPay) : '', 'e.g. 23500');
            const d = field(p, 'pay-day-' + id, 'Date paid', 'date', today);
            p.appendChild(el('p', 'hint', 'Paying for ' + mo + ' in the next month, such as on the 1st? Still record it here, in ' + mo + '.'));
            okBtn('Save payment', () => {
                const x = amt(a, 'Type the amount paid.'), dk = dayOk(d);
                if (x.error || !dk) { (x.error ? a : d).focus(); return; }
                const e = { id: C.newId(), k: 'paid', d: d.value, c: x.cents, note: '', m: view };
                panel = null;
                change(() => { byId(id).entries.push(e); }, 'item-msg-' + id, 'Payment of ' + money(e.c) + ' saved for ' + mo + '.');
            });
            setTimeout(() => a.focus(), 0);
        }
        return p;
    }
    function slip(w, r) {
        const box = el('div', 'bill');
        box.appendChild(el('p', 'b-head', 'Pay slip for ' + C.monthName(view, LOC)));
        const at = C.attendText(r, w, today);
        if (at) box.appendChild(el('p', 'b-note', 'Attendance: ' + at));
        if (w.stop && w.stop < C.firstDay(view)) box.appendChild(el('p', 'b-note', 'Left on ' + C.niceDate(w.stop, LOC) + '.'));
        if (!r.employed && view < C.monthOf(w.start)) box.appendChild(el('p', 'b-note', 'Started on ' + C.niceDate(w.start, LOC) + '.'));
        const lines = el('div', 'b-lines');
        C.slipLines(r, w, state.cur, LOC).forEach(l => {
            const row = el('div', 'b-line ' + l.kind);
            const tx = el('span', 'b-t', l.t + ' ');
            row.appendChild(tx);
            if (l.id) {
                const e = w.entries.find(x => x.id === l.id);
                const what = e.k === 'adv' ? 'advance' : e.k === 'paid' ? 'payment' : e.k === 'bonus' ? 'bonus' : 'deduction';
                tx.appendChild(btn('Delete', 'link inline', () => change(() => { const x = byId(w.id); x.entries = x.entries.filter(y => y.id !== l.id); }, 'item-msg-' + w.id,
                    (what === 'advance' && e.n > 1 ? 'Advance deleted from every month.' : what[0].toUpperCase() + what.slice(1) + ' deleted.')), 'Delete this ' + what));
            }
            row.appendChild(el('span', 'b-amt', l.c == null ? '' : signed(l.c)));
            lines.appendChild(row);
        });
        box.appendChild(lines);
        box.appendChild(el('p', 'b-pay' + (r.toPay > 0 ? '' : ' good'), C.toPayText(r, state.cur, LOC)));
        return box;
    }
    function renderWorker(w) {
        const r = C.monthPay(w, view);
        const box = el('article', 'item' + (r.toPay > 0 ? ' owes' : ' ok')); box.id = 'item-' + w.id;
        box.setAttribute('aria-label', nameOf(w));
        const top = el('div', 'i-top');
        top.appendChild(el('h2', 'i-name', nameOf(w)));
        if (w.role) top.appendChild(el('span', 'tag', w.role));
        if (w.stop) top.appendChild(el('span', 'tag', 'Left ' + C.niceDate(w.stop, LOC)));
        box.appendChild(top);
        const S = r.S, bits = [money(S) + ' a month'];
        bits.push(w.off.length ? WD_ORDER.filter(d => w.off.includes(d)).map(d => C.DAYS[d]).join(', ') + ' off' : 'no weekly day off');
        bits.push(w.leave ? C.plural(w.leave, 'paid leave day', 'paid leave days') + ' a month' + (w.carry ? ' (carries over)' : '') : 'no paid leave');
        box.appendChild(el('p', 'i-usual', bits.join(' · ')));
        box.appendChild(el('p', 'i-usual', 'One day\'s pay: ' + C.RULE_TEXT[w.rule] + (r.employed ? ' = ' + money(C.mulDiv(S, 1, r.D)) : '')));
        const tb = todayBox(w, r); if (tb) box.appendChild(tb);
        if (r.employed) {
            box.appendChild(calendar(w, r));
            const leg = el('p', 'legend', '✓ worked · L paid leave · ✗ unpaid day off · ½ half day · H paid holiday · +1 extra day · Off weekly day off');
            box.appendChild(leg);
            const dp = dayPanel(w, r); if (dp) box.appendChild(dp);
        }
        const msg = el('div', 'msg'); msg.id = 'item-msg-' + w.id; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
        box.appendChild(slip(w, r));
        const acts = el('div', 'i-acts');
        const open = what => () => { panel = panel && panel.id === w.id && panel.what === what ? null : { id: w.id, what }; openDay = null; render(); const p = $('mp-' + w.id); if (p) p.scrollIntoView({ block: 'nearest' }); };
        acts.appendChild(btn('Advance', 'secondary', open('adv'), 'Add an advance or loan for ' + nameOf(w)));
        acts.appendChild(btn('Bonus or deduction', 'secondary', open('bonus'), 'Add a bonus or deduction for ' + nameOf(w)));
        acts.appendChild(btn('Record a payment', 'primary', open('pay'), 'Record a payment to ' + nameOf(w) + ' for ' + C.monthOnly(view, LOC)));
        if (!r.settled) box.appendChild(acts);
        const mp = moneyPanel(w, r); if (mp) box.appendChild(mp);
        const share = el('div', 'i-btns');
        const text = () => C.slipText(C.monthPay(byId(w.id), view), byId(w.id), state.cur, LOC, today);
        share.appendChild(btn('Copy pay slip', 'secondary', () => copyText(text(), 'item-msg-' + w.id)));
        if (navigator.share) share.appendChild(btn('Share', 'secondary', () => { navigator.share({ text: text() }).catch(() => {}); }));
        share.appendChild(btn('Print slip', 'secondary', () => printSlips([w.id])));
        share.appendChild(btn('Edit', 'secondary', () => fillForm(byId(w.id)), 'Edit ' + nameOf(w)));
        share.appendChild(btn('Delete', 'secondary danger-t', () => {
            if (editing === w.id) resetForm();
            change(() => { state.workers = state.workers.filter(x => x.id !== w.id); }, 'add-msg', nameOf(w) + ' deleted.');
        }, 'Delete ' + nameOf(w)));
        box.appendChild(share);
        box.appendChild(msg);
        return box;
    }

    // ---------- printing ----------
    function printSlips(ids) {
        const rep = $('report'); rep.textContent = '';
        ids.forEach(id => {
            const w = byId(id); if (!w) return;
            const r = C.monthPay(w, view);
            if (!r.busy) return;
            const sec = el('div', 'r-slip');
            sec.appendChild(el('h2', '', nameOf(w) + (w.role ? ' (' + w.role + ')' : '') + ': pay for ' + C.monthName(view, LOC)));
            const at = C.attendText(r, w, today); if (at) sec.appendChild(el('p', '', 'Attendance: ' + at));
            const t = el('table');
            C.slipLines(r, w, state.cur, LOC).forEach(l => { const tr = el('tr'); tr.appendChild(el('td', '', l.t)); tr.appendChild(el('td', '', l.c == null ? '' : signed(l.c))); if (l.kind === 'total') tr.className = 'tot'; t.appendChild(tr); });
            sec.appendChild(t);
            sec.appendChild(el('p', 'r-pay', C.toPayText(r, state.cur, LOC)));
            sec.appendChild(el('p', 'r-sign', 'Received by: ____________________   Date: ____________'));
            rep.appendChild(sec);
        });
        window.print();
    }

    // ---------- render ----------
    function render() {
        document.querySelectorAll('.msg').forEach(m => { if (!m.closest('.item')) { m.textContent = ''; m.className = 'msg'; } });
        $('cur').value = state.cur;
        $('cur-tag').hidden = !state.cur; $('cur-tag').textContent = state.cur;
        renderMonth();
        const list = $('i-list'); list.textContent = '';
        $('items').hidden = !state.workers.length;
        state.workers.forEach(w => list.appendChild(renderWorker(w)));
        $('restore-first').hidden = state.workers.length > 0 || !!editing;
        $('store-warn').hidden = canSave;
        if (flash) { showMsg(flash.where, flash.text, flash.undo, flash.bad); flash = null; }
    }

    // ---------- backup ----------
    function backup() {
        const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = SLUG + '-' + today + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        flash = { where: 'tools-msg', text: 'Backup file saved to your downloads.' }; render();
    }
    function restore(file) {
        const rd = new FileReader();
        rd.onload = () => {
            let s = null;
            try { s = C.cleanState(JSON.parse(rd.result)); } catch (e) { s = null; }
            if (!s) { flash = { where: 'tools-msg', text: 'That file is not a backup from this app.', bad: true }; render(); return; }
            change(() => { state = s; }, 'tools-msg', 'Backup restored: ' + C.plural(s.workers.length, 'worker', 'workers') + '.');
            resetForm(); render();
        };
        rd.onerror = () => { flash = { where: 'tools-msg', text: 'Could not read that file.', bad: true }; render(); };
        rd.readAsText(file);
    }

    // ---------- wiring ----------
    function init() {
        buildForm();
        load();
        try { localStorage.setItem(SLUG + '.test', '1'); localStorage.removeItem(SLUG + '.test'); } catch (e) { canSave = false; }
        resetForm();
        document.querySelectorAll('#quick .chip').forEach(c => c.addEventListener('click', () => {
            if (c.dataset.role === '') { setRole($('f-role').value.trim(), true); $('f-role').focus(); }
            else if (role === c.dataset.role && $('f-role-box').hidden) setRole('', false);
            else setRole(c.dataset.role, false);
        }));
        ['f-pay', 'f-rule', 'f-leave', 'f-start'].forEach(id => { $(id).addEventListener('input', formHints); $(id).addEventListener('change', formHints); });
        $('f-wd-row').addEventListener('change', formHints);
        const reveal = (open, box, focus) => $(open).addEventListener('click', () => { $(box).hidden = false; $(open).hidden = true; $(focus).focus(); });
        reveal('f-extra-open', 'f-extra-box', 'f-extra'); reveal('f-ot-open', 'f-ot-box', 'f-ot'); reveal('f-open-open', 'f-open-box', 'f-open'); reveal('f-stop-open', 'f-stop-box', 'f-stop');
        $('f-save').addEventListener('click', saveForm);
        $('add').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') { e.preventDefault(); saveForm(); } });
        $('f-cancel').addEventListener('click', () => { resetForm(); render(); });
        $('mo-prev').addEventListener('click', () => { view = C.addMonth(view, -1); openDay = null; panel = null; render(); });
        $('mo-next').addEventListener('click', () => { view = C.addMonth(view, 1); openDay = null; panel = null; render(); });
        $('mo-today').addEventListener('click', () => { view = C.monthOf(today); openDay = null; panel = null; render(); });
        $('mo-copy').addEventListener('click', () => {
            const t = state.workers.map(w => ({ w, r: C.monthPay(w, view) })).filter(x => x.r.busy).map(x => C.slipText(x.r, x.w, state.cur, LOC, today));
            if (!t.length) { flash = { where: 'month-msg', text: 'Nothing to copy for this month.', bad: true }; render(); return; }
            copyText(t.join('\n\n'), 'month-msg');
        });
        $('mo-print').addEventListener('click', () => printSlips(state.workers.map(w => w.id)));
        $('cur').addEventListener('change', () => { change(() => { state.cur = C.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; }, 'tools-msg', 'Currency symbol saved.'); formHints(); });
        $('backup').addEventListener('click', backup);
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-first').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) restore(f); e.target.value = ''; });
        $('del-all').addEventListener('click', () => {
            if (!state.workers.length) { flash = { where: 'tools-msg', text: 'There is nothing to delete.' }; render(); return; }
            resetForm();
            change(() => { state = C.emptyState(); }, 'tools-msg', 'Everything deleted.');
        });
        // a new day while the page stays open (second use the next morning)
        const tick = () => { const t = C.dayStr(new Date()); if (t !== today) { const was = C.monthOf(today); today = t; if (view === was) view = C.monthOf(t); render(); } };
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        setInterval(tick, 60000);
        render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
