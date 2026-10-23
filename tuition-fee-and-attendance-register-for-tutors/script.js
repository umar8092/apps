// Tuition Fee and Attendance Register for Tutors: the page. The maths and the words are in core.js (window.TFR).
(function () {
    'use strict';
    const C = window.TFR, SLUG = 'tuition-fee-and-attendance-register-for-tutors', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const LOC = navigator.language || 'en-GB';
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', '₦': '₦ (naira)',
        'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', 'Rp': 'Rp (rupiah)', 'RM': 'RM (ringgit)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (Qatari riyal)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
    const MARK = { present: '✓', absent: '✗', extra: '+', hol: 'H', none: '–', off: '' };
    const KIND_WORDS = { present: 'attended', absent: 'absent', extra: 'extra class', hol: 'holiday, no class', none: 'no class', off: 'not a class day' };
    let state = C.emptyState(), today = C.dayStr(new Date()), view = C.monthOf(today);
    let editing = null;      // id of the student shown in the form, or null when adding
    let openDay = null;      // { id, day } day editor that is open
    let panel = null;        // { id, what: 'pay' | 'adj' }
    let flash = null;        // { where, text, undo, bad }
    let undoSnap = null, canSave = true, query = '';

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
        const where = flash && flash.where && (typeof flash.where !== 'string' || $(flash.where)) ? flash.where : 'add-msg';
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
    const byId = id => state.students.find(x => x.id === id);
    const amtText = c => (c / 100).toFixed(c % 100 ? 2 : 0);
    const msgId = id => 'msg-' + id;
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into a message.' }; render(); };
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Use Share or Print instead.', bad: true }; render(); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function setErr(id, msg) {
        const box = $(id + '-err'); if (box) box.textContent = msg || '';
        const inp = $(id); if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
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
    const maxMonth = () => C.addMonth(C.monthOf(today), 3);
    function monthOptions(sel, from, to, val) {
        sel.textContent = '';
        for (let m = from; m <= to; m = C.addMonth(m, 1)) { const o = el('option', '', C.monthName(m, LOC)); o.value = m; sel.appendChild(o); }
        sel.value = val >= from && val <= to ? val : from;
    }

    // ---------- the form ----------
    function buildForm() {
        WD_ORDER.forEach(d => {
            const lab = el('label', 'wd-chip'), cb = el('input');
            cb.type = 'checkbox'; cb.value = String(d); cb.id = 'f-wd-' + d;
            lab.appendChild(cb); lab.appendChild(el('span', '', C.DAYS[d]));
            lab.setAttribute('aria-label', C.DAYS_LONG[d]);
            $('f-wd-row').appendChild(lab);
        });
        C.SYMBOLS.forEach(s => { const o = el('option', '', CUR_NAMES[s] || s); o.value = s; $('cur').appendChild(o); });
        for (let i = 1; i <= 28; i++) { const o = el('option', '', 'Day ' + i + ' of the month' + (i === 10 ? ' (common)' : '')); o.value = String(i); $('due').appendChild(o); }
    }
    const formDays = () => WD_ORDER.filter(d => $('f-wd-' + d).checked).sort();
    const formBill = () => $('f-bill-class').checked ? 'class' : 'month';
    function formHints() {
        const cls = formBill() === 'class';
        $('f-fee-l').textContent = cls ? 'Fee per class' : 'Monthly fee';
        $('f-fee').placeholder = cls ? 'e.g. 600' : 'e.g. 5000';
        $('f-missed-box').hidden = !cls;
        $('f-part-box').hidden = cls;
        $('f-fee-hint').textContent = cls ? 'Each class they attend adds this to the month\'s fee.' : 'The same every month, whatever the attendance.';
        const days = formDays();
        document.querySelectorAll('#f-days-quick .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.days === days.slice().sort((a, b) => (a || 7) - (b || 7)).join(','))));
        $('f-wd-hint').textContent = days.length ? 'Classes on ' + C.dayNames(days) + '. Days with no tick are not class days.' : 'No fixed days? Leave all unticked and add each class from the calendar.';
    }
    function setDays(days) { WD_ORDER.forEach(d => { $('f-wd-' + d).checked = days.includes(d); }); }
    function resetForm() {
        editing = null;
        ['f-name', 'f-who', 'f-subj', 'f-fee', 'f-open', 'f-stop'].forEach(id => { $(id).value = ''; setErr(id, ''); });
        setErr('f-start', '');
        setDays([]);
        $('f-bill-month').checked = true;
        $('f-missed').checked = false;
        $('f-part').value = 'full';
        $('f-start').value = C.firstDay(C.monthOf(today));
        $('f-start-hint').hidden = false;
        $('f-more-box').hidden = true; $('f-more-open').hidden = false;
        $('f-open-box').hidden = true; $('f-open-open').hidden = false;
        $('f-stop-box').hidden = true; $('f-stop-open').hidden = true;
        $('f-from-box').hidden = true;
        $('add-h').textContent = 'Add a student';
        $('add-intro').hidden = false;
        $('f-save').textContent = 'Add student';
        $('f-cancel').hidden = true;
        formHints();
    }
    function fillForm(s) {
        resetForm();
        editing = s.id;
        $('f-name').value = s.name; $('f-who').value = s.who; $('f-subj').value = s.subj;
        if (s.who || s.subj) { $('f-more-box').hidden = false; $('f-more-open').hidden = true; }
        setDays(s.days);
        (s.bill === 'class' ? $('f-bill-class') : $('f-bill-month')).checked = true;
        $('f-missed').checked = s.missed;
        $('f-part').value = s.part;
        const cm = C.monthOf(today) < C.monthOf(s.start) ? C.monthOf(s.start) : C.monthOf(today);
        $('f-fee').value = amtText(C.feeFor(s, cm));
        monthOptions($('f-from'), C.monthOf(s.start), C.addMonth(C.monthOf(today), 6), cm);
        $('f-from-box').hidden = false;
        $('f-start').value = s.start;
        $('f-start-hint').hidden = true;
        $('f-stop-open').hidden = !!s.stop; $('f-stop-box').hidden = !s.stop; $('f-stop').value = s.stop;
        if (s.open) { $('f-open-box').hidden = false; $('f-open-open').hidden = true; $('f-open').value = amtText(s.open); }
        $('add-h').textContent = 'Edit ' + s.name;
        $('add-intro').hidden = true;
        $('f-save').textContent = 'Save changes';
        $('f-cancel').hidden = false;
        formHints();
        $('add').scrollIntoView({ block: 'start' });
        $('f-name').focus({ preventScroll: true });
    }
    function readForm() {
        let ok = true;
        const name = $('f-name').value.trim().replace(/\s+/g, ' ');
        if (!name) ok = setErr('f-name', 'Type the student\'s name.') && ok;
        else if (state.students.some(s => s.id !== editing && s.name.toLowerCase() === name.toLowerCase())) ok = setErr('f-name', 'You already have a student called ' + name + '. Add something to tell them apart, such as ' + name + ' K.') && ok;
        else setErr('f-name', '');
        const fee = C.parseAmount($('f-fee').value, { blank: formBill() === 'class' ? 'Type the fee for one class, such as 600.' : 'Type the monthly fee, such as 5000.' });
        ok = setErr('f-fee', fee.error) && ok;
        const start = $('f-start').value;
        if (!C.isDay(start)) ok = setErr('f-start', 'Pick the day they started.') && ok; else setErr('f-start', '');
        const stop = $('f-stop-box').hidden ? '' : $('f-stop').value;
        if (stop && (!C.isDay(stop) || (C.isDay(start) && stop < start))) ok = setErr('f-stop', 'The last class day must be on or after the start day.') && ok; else setErr('f-stop', '');
        let open = 0;
        if (!$('f-open-box').hidden && $('f-open').value.trim()) {
            const o = C.parseAmount($('f-open').value);
            ok = setErr('f-open', o.error) && ok;
            open = o.cents || 0;
        } else setErr('f-open', '');
        if (!ok) { const bad = document.querySelector('#add [aria-invalid="true"]'); if (bad) bad.focus(); return null; }
        return { name, who: $('f-who').value.trim(), subj: $('f-subj').value.trim(), days: formDays(), bill: formBill(), fee: fee.cents,
            missed: $('f-missed').checked, part: $('f-part').value === 'part' ? 'part' : 'full', start, stop, open };
    }
    function saveForm() {
        const f = readForm();
        if (!f) return;
        if (editing) {
            const id = editing, from0 = $('f-from').value;
            resetForm();
            change(() => {
                const s = byId(id); if (!s) return;
                Object.assign(s, { name: f.name, who: f.who, subj: f.subj, days: f.days, bill: f.bill, missed: f.missed, part: f.part, start: f.start, stop: f.stop, open: f.open });
                const from = from0 >= C.monthOf(f.start) ? from0 : C.monthOf(f.start);
                if (C.feeFor(s, from) !== f.fee) s.fees = s.fees.filter(x => x.from < from).concat([{ from, c: f.fee }]);
                const clean = C.cleanStudent(JSON.parse(JSON.stringify(s)));
                if (clean) state.students[state.students.indexOf(s)] = clean;
            }, msgId(id), 'Changes saved.');
            const box = $('item-' + id); if (box) box.scrollIntoView({ block: 'nearest' });
            return;
        }
        const s = C.newStudent(C.newId(), f.start);
        Object.assign(s, { name: f.name, who: f.who, subj: f.subj, days: f.days, bill: f.bill, missed: f.missed, part: f.part, stop: f.stop, open: f.open });
        s.fees = [{ from: C.monthOf(f.start), c: f.fee }];
        if (state.students.length >= 300) { flash = { where: 'add-msg', text: 'The register holds up to 300 students.', bad: true }; render(); return; }
        resetForm();
        // the next student often has the same days and start
        setDays(f.days); (f.bill === 'class' ? $('f-bill-class') : $('f-bill-month')).checked = true; $('f-start').value = f.start; formHints();
        change(() => { state.students.push(s); }, 'add-msg', f.name + ' added. Add the next student, or mark attendance in their box.');
    }

    // ---------- today ----------
    function setMark(id, d, v) { const s = byId(id); if (!s) return; if (v) s.marks[d] = v; else delete s.marks[d]; }
    function renderToday() {
        const box = $('today');
        box.hidden = !state.students.length;
        if (box.hidden) return;
        $('t-date').textContent = C.toDate(today).toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long' });
        const list = C.classOn(state, today, today), hol = !!state.hol[today];
        const holClass = state.students.filter(s => C.enrolledOn(s, today) && C.isClassDay(s, today));
        $('t-hint').textContent = hol ? 'Holiday today: no classes for anyone' + (list.length ? ', except extra classes.' : '.')
            : list.length ? 'Everyone counts as present. Tap Absent for anyone who did not come.' : 'No one has a class today. For an extra class, tap today in the student\'s calendar.';
        const ul = $('t-list'); ul.textContent = '';
        list.forEach(s => {
            const k = C.dayKind(s, today, state.hol, today).k, row = el('div', 't-row' + (k === 'absent' ? ' is-absent' : ''));
            const l = el('div', 't-l');
            l.appendChild(el('p', 't-name', s.name));
            if (s.subj || k === 'extra') l.appendChild(el('p', 't-sub', [s.subj, k === 'extra' ? 'extra class' : ''].filter(Boolean).join(' · ')));
            row.appendChild(l);
            const g = el('div', 't-btns');
            const p = btn('Present', 'secondary small', () => { if (k !== 'absent') return; change(() => setMark(s.id, today, ''), 'today-msg', s.name + ' marked present.'); }, s.name + ': present');
            const a = btn('Absent', 'secondary small', () => { if (k === 'absent') return; change(() => setMark(s.id, today, k === 'extra' ? '' : 'a'), 'today-msg', k === 'extra' ? 'Extra class for ' + s.name + ' removed.' : s.name + ' marked absent.'); }, s.name + ': absent');
            p.setAttribute('aria-pressed', String(k !== 'absent')); a.setAttribute('aria-pressed', String(k === 'absent'));
            g.appendChild(p); g.appendChild(a);
            row.appendChild(g);
            ul.appendChild(row);
        });
        $('t-hol').hidden = !hol && !holClass.length;
        $('t-hol').textContent = hol ? 'Not a holiday: classes are on today' : 'Holiday today: no classes';
    }
    function toggleHol(d, where) {
        const on = !state.hol[d];
        change(() => { if (on) state.hol[d] = 1; else delete state.hol[d]; }, where, on ? 'Holiday on ' + C.shortDate(d, LOC) + ' for everyone: no classes.' : C.shortDate(d, LOC) + ' is a class day again.');
    }

    // ---------- the month ----------
    function renderMonth() {
        const box = $('month');
        box.hidden = !state.students.length;
        if (box.hidden) return;
        const sm = C.summary(state, view, today), mo = C.monthOnly(view, LOC);
        $('month-h').textContent = C.monthName(view, LOC);
        $('mo-today').hidden = view === C.monthOf(today);
        const pay = $('mo-pay');
        pay.className = 'mo-pay';
        if (sm.owe.length) pay.textContent = 'Still to collect: ' + money(sm.toCollect) + ' from ' + C.plural(sm.owe.length, 'student', 'students');
        else if (sm.list.length && (sm.charged > 0 || sm.paid > 0)) { pay.textContent = 'All fees for ' + mo + ' are paid'; pay.classList.add('good'); }
        else pay.textContent = 'No fees for ' + mo + ' yet';
        const rows = $('mo-rows'); rows.textContent = '';
        sm.owe.forEach(x => {
            const row = el('div', 'mo-row'), l = el('div', 'mo-l');
            const nb = btn(x.s.name, 'mo-name', () => { const b = $('item-' + x.s.id); if (b) { b.scrollIntoView({ block: 'start' }); b.focus({ preventScroll: true }); } }, 'Go to ' + x.s.name + "'s box");
            l.appendChild(nb);
            const bits = [];
            if (x.r.paid) bits.push(money(x.r.paid) + ' of ' + money(x.r.due) + ' paid');
            if (x.r.carry > 0) bits.push('includes ' + money(x.r.carry) + ' from before');
            if (x.r.soFar) bits.push('fee so far');
            if (bits.length) l.appendChild(el('p', 'mo-what', bits.join(' · ')));
            row.appendChild(l);
            const r = el('div', 'mo-r');
            r.appendChild(el('p', 'mo-amt', money(x.r.toPay)));
            if (C.isLate(x.s, x.r, today, state.due)) r.appendChild(el('span', 'late', 'Late'));
            row.appendChild(r);
            rows.appendChild(row);
        });
        const sums = $('mo-sums'); sums.textContent = '';
        const line = (t, c) => { const p = el('p', 'b-line'); p.appendChild(el('span', 'b-t', t)); p.appendChild(el('span', 'b-amt', money(c))); sums.appendChild(p); };
        if (sm.list.length) {
            line('Fees for ' + mo + (sm.list.some(x => x.r.soFar && x.r.active) ? ' (per class: so far)' : ''), sm.charged);
            line('Paid for ' + mo, sm.paid);
        }
        line('All money received in ' + mo, sm.received);
    }

    // ---------- one student ----------
    function calendar(s) {
        const wrap = el('div', 'cal'), first = C.firstDay(view), lead = (C.weekday(first) + 6) % 7;
        wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', s.name + ': attendance in ' + C.monthName(view, LOC));
        WD_ORDER.forEach(d => wrap.appendChild(el('span', 'cal-h', C.DAYS[d].slice(0, 2))));
        for (let i = 0; i < lead; i++) wrap.appendChild(el('span', 'day blank'));
        for (let d = first, last = C.lastDay(view); d <= last; d = C.addDays(d, 1)) {
            const k = C.dayKind(s, d, state.hol, today), n = String(Number(d.slice(8)));
            let cell;
            if (k.k === 'out') { cell = el('span', 'day out'); cell.appendChild(el('span', 'dn', n)); }
            else {
                const kind = k.k === 'off' && k.hol ? 'off' : k.k;
                cell = btn('', 'day ' + kind + (k.later ? ' later' : ''), () => { openDay = openDay && openDay.id === s.id && openDay.day === d ? null : { id: s.id, day: d }; panel = null; render(); focusDay(s.id, d); });
                cell.appendChild(el('span', 'dn', n));
                cell.appendChild(el('span', 'dq', k.later && (kind === 'present') ? '' : MARK[kind]));
                const words = k.later && (kind === 'present' || kind === 'extra') ? (kind === 'extra' ? 'extra class, still to come' : 'class, still to come') : KIND_WORDS[kind];
                cell.setAttribute('aria-label', C.shortDay(d) + ': ' + words);
                if (openDay && openDay.id === s.id && openDay.day === d) { cell.classList.add('sel'); cell.setAttribute('aria-expanded', 'true'); }
            }
            if (d === today) cell.classList.add('today');
            wrap.appendChild(cell);
        }
        return wrap;
    }
    function focusDay(id, d) {
        const b = [...document.querySelectorAll('#item-' + id + ' button.day')].find(x => (x.getAttribute('aria-label') || '').startsWith(C.shortDay(d) + ':'));
        if (b) b.focus({ preventScroll: true });
    }
    function dayPanel(s) {
        const d = openDay.day, k = C.dayKind(s, d, state.hol, today), p = el('div', 'panel day-panel');
        p.appendChild(el('h3', '', C.toDate(d).toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long' })));
        const now = k.k === 'off' ? (state.hol[d] ? 'Holiday for everyone. Not a class day for ' + s.name + '.' : 'Not a class day for ' + s.name + '.')
            : (k.later ? 'Still to come: ' : 'Now: ') + KIND_WORDS[k.k] + '.';
        p.appendChild(el('p', 'dp-now', now));
        const g = el('div', 'dp-btns'), where = msgId(s.id);
        const opt = (label, on, fn) => { const b = btn(label, 'secondary', () => { openDay = null; fn(); }); b.setAttribute('aria-pressed', String(on)); g.appendChild(b); };
        const set = (v, text) => change(() => setMark(s.id, d, v), where, text);
        const nice = C.shortDate(d, LOC);
        if (k.k === 'present' || k.k === 'absent' || k.k === 'none') {
            opt('Present', k.k === 'present', () => set('', s.name + ' present on ' + nice + '.'));
            opt('Absent', k.k === 'absent', () => set('a', s.name + ' absent on ' + nice + '.'));
            opt('No class', k.k === 'none', () => set('c', 'No class for ' + s.name + ' on ' + nice + '.'));
        } else if (k.k === 'hol' || (k.k === 'extra' && C.isClassDay(s, d))) {
            opt('Class held anyway', k.k === 'extra', () => set(k.k === 'extra' ? '' : 'x', k.k === 'extra' ? 'Back to a holiday for ' + s.name + ' on ' + nice + '.' : 'Class held on ' + nice + ' for ' + s.name + '.'));
        } else {
            opt('Extra class', k.k === 'extra', () => set('x', 'Extra class for ' + s.name + ' on ' + nice + '.'));
            opt('No class', k.k !== 'extra', () => set('', 'No class for ' + s.name + ' on ' + nice + '.'));
        }
        opt('Holiday for everyone', !!state.hol[d], () => toggleHol(d, where));
        p.appendChild(g);
        p.appendChild(btn('Close', 'link', () => { openDay = null; render(); focusDay(s.id, d); }));
        return p;
    }
    function field(p, id, label, type, val, ph) {
        const l = el('label', '', label); l.htmlFor = id; p.appendChild(l);
        const i = el('input'); i.id = id; i.type = type; i.value = val || ''; if (ph) i.placeholder = ph;
        if (type === 'text') { i.autocomplete = 'off'; i.maxLength = 60; }
        p.appendChild(i);
        const e = el('p', 'err'); e.id = id + '-err'; e.setAttribute('role', 'alert'); p.appendChild(e);
        i.setAttribute('aria-describedby', e.id);
        return i;
    }
    function moneyPanel(s, r) {
        const p = el('div', 'panel'), what = panel.what, pre = 'p-' + s.id;
        const sm = C.monthOf(s.start), mo = view < sm ? sm : view;
        p.appendChild(el('h3', '', what === 'pay' ? 'Record a payment for ' + s.name : 'Discount or extra charge for ' + s.name));
        let kind = 'disc';
        if (what === 'adj') {
            const seg = el('div', 'seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'Discount or extra charge');
            [['disc', 'Discount'], ['add', 'Extra charge']].forEach(([v, t]) => {
                const lab = el('label', 'seg-b'), i = el('input'); i.type = 'radio'; i.name = pre + '-kind'; i.value = v; i.checked = v === 'disc';
                i.addEventListener('change', () => { kind = v; chips.hidden = v !== 'disc' || s.bill !== 'month'; note.placeholder = v === 'disc' ? 'e.g. holiday month' : 'e.g. books, test fee'; });
                lab.appendChild(i); lab.appendChild(el('span', '', t)); seg.appendChild(lab);
            });
            p.appendChild(seg);
        }
        const suggest = what === 'pay' ? (r.toPay > 0 ? r.toPay : s.bill === 'month' ? C.feeFor(s, mo) : 0) : 0;
        const amt = field(p, pre + '-amt', 'Amount', 'text', suggest ? amtText(suggest) : '', 'e.g. ' + amtText(C.feeFor(s, mo) || 500000));
        amt.inputMode = 'decimal'; amt.maxLength = 16;
        const chips = el('div', 'quick');
        const chip = (t, c) => chips.appendChild(btn(t, 'chip', () => { amt.value = amtText(c); amt.focus(); }));
        if (what === 'pay') {
            if (r.toPay > 0) chip('Still to pay ' + money(r.toPay), r.toPay);
            if (s.bill === 'month' && C.feeFor(s, mo) !== r.toPay) chip('One month\'s fee ' + money(C.feeFor(s, mo)), C.feeFor(s, mo));
        } else if (s.bill === 'month' && r.fee > 0) chip('Whole fee (no fee this month) ' + money(r.fee), r.fee);
        if (chips.children.length) p.appendChild(chips);
        const ml = el('label', '', what === 'pay' ? 'For the month of' : 'Month'); ml.htmlFor = pre + '-m'; p.appendChild(ml);
        const msel = el('select'); msel.id = pre + '-m';
        monthOptions(msel, sm, view > maxMonth() ? view : maxMonth(), mo);
        p.appendChild(msel);
        let date = null;
        if (what === 'pay') {
            date = field(p, pre + '-d', 'Paid on', 'date', today);
            date.max = today;
        }
        const noteOpen = btn('+ Add a note (optional)', 'link', () => { noteBox.hidden = false; noteOpen.hidden = true; note.focus(); });
        p.appendChild(noteOpen);
        const noteBox = el('div', 'field'); noteBox.hidden = true;
        const note = field(noteBox, pre + '-note', 'Note', 'text', '', what === 'pay' ? 'e.g. cash, bank transfer' : 'e.g. holiday month');
        p.appendChild(noteBox);
        const go = () => {
            const a = C.parseAmount(amt.value);
            let ok = setErr(pre + '-amt', a.error);
            if (date) {
                if (!C.isDay(date.value)) ok = setErr(pre + '-d', 'Pick the day it was paid.') && ok;
                else if (date.value > today) ok = setErr(pre + '-d', 'The day paid cannot be in the future.') && ok;
                else setErr(pre + '-d', '');
            }
            if (!ok) { (a.error ? amt : date).focus(); return; }
            const m = C.isMonth(msel.value) ? msel.value : mo;
            const k = what === 'pay' ? 'pay' : kind;
            const e = { id: C.newId(), k, d: date ? date.value : today, c: a.cents, m, note: note.value.trim().slice(0, 60) };
            const label = k === 'pay' ? 'Payment of ' + money(a.cents) + ' for ' + C.monthOnly(m, LOC) + ' saved.' : (k === 'disc' ? 'Discount of ' : 'Extra charge of ') + money(a.cents) + ' for ' + C.monthOnly(m, LOC) + ' saved.';
            panel = null;
            change(() => { const st = byId(s.id); if (st) st.entries.push(e); }, msgId(s.id), label);
        };
        p.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); go(); } });
        const rb = el('div', 'row-btns');
        rb.appendChild(btn(what === 'pay' ? 'Save payment' : 'Save', 'primary', go));
        rb.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); }));
        p.appendChild(rb);
        setTimeout(() => { if (document.activeElement === document.body || !document.activeElement) amt.focus({ preventScroll: true }); }, 0);
        return p;
    }
    function renderStudent(s) {
        const r = C.monthFee(s, view, state.hol, today), late = C.isLate(s, r, today, state.due);
        const box = el('article', 'item' + (r.toPay > 0 ? (late ? ' late-box' : ' owes') : ' ok'));
        box.id = 'item-' + s.id; box.tabIndex = -1;
        box.setAttribute('aria-label', s.name);
        const top = el('div', 'i-top');
        top.appendChild(el('h3', 'i-name', s.name));
        top.appendChild(el('span', 'tag', s.bill === 'class' ? money(C.feeFor(s, view)) + ' a class' : money(C.feeFor(s, view)) + ' a month'));
        if (s.stop && s.stop < today) top.appendChild(el('span', 'tag muted', 'Stopped ' + C.niceDate(s.stop, LOC)));
        box.appendChild(top);
        const meta = [s.days.length ? C.dayNames(s.days) : 'No fixed days', s.subj, s.who ? 'Parent: ' + s.who : ''].filter(Boolean).join(' · ');
        box.appendChild(el('p', 'i-usual', meta));
        if (view < C.monthOf(s.start)) box.appendChild(el('p', 'i-note', 'Starts on ' + C.niceDate(s.start, LOC) + '.'));
        const at = C.attendText(r, LOC);
        if (at) box.appendChild(el('p', 'i-att', at));
        box.appendChild(calendar(s));
        box.appendChild(el('p', 'legend', '✓ attended · ✗ absent · + extra class · H holiday · – no class · dashed: still to come'));
        if (openDay && openDay.id === s.id) box.appendChild(dayPanel(s));

        const bill = el('div', 'bill');
        bill.appendChild(el('p', 'b-head', 'Fees for ' + C.monthName(view, LOC)));
        const lines = el('div', 'b-lines');
        C.feeLines(r, s, state.cur, LOC).forEach(l => {
            const row = el('div', 'b-line' + (l.kind === 'total' ? ' total' : '') + (l.c < 0 ? ' minus' : ''));
            const t = el('span', 'b-t', l.t);
            if (l.id) {
                const id = l.id;
                t.appendChild(document.createTextNode(' '));
                t.appendChild(btn('Delete', 'link inline del', () => change(() => { const st = byId(s.id); if (st) st.entries = st.entries.filter(e => e.id !== id); }, msgId(s.id), l.t + ' deleted.'), 'Delete ' + l.t));
            }
            row.appendChild(t);
            row.appendChild(el('span', 'b-amt', signed(l.c)));
            lines.appendChild(row);
        });
        if (lines.children.length) bill.appendChild(lines);
        const st = el('p', 'b-pay' + (r.toPay <= 0 && (r.due > 0 || r.paid > 0) ? ' good' : ''), C.statusText(r, state.cur, LOC));
        if (late) st.appendChild(el('span', 'late', r.ym < C.monthOf(today) || r.carry > 0 ? 'Late' : 'Late: due by ' + C.shortDate(view + '-' + C.pad(state.due), LOC)));
        bill.appendChild(st);
        if (r.ahead.length) {
            const by = {}; r.ahead.forEach(e => { by[e.m] = (by[e.m] || 0) + e.c; });
            bill.appendChild(el('p', 'b-full', 'Paid ahead: ' + Object.keys(by).map(m => money(by[m]) + ' for ' + C.monthOnly(m, LOC)).join(', ') + '.'));
        }
        box.appendChild(bill);
        if (panel && panel.id === s.id) box.appendChild(moneyPanel(s, r));

        const acts = el('div', 'i-acts');
        acts.appendChild(btn('Record a payment', 'primary', () => { panel = { id: s.id, what: 'pay' }; openDay = null; render(); }));
        const more = el('div', 'i-btns');
        more.appendChild(btn('Discount or extra charge', 'secondary', () => { panel = { id: s.id, what: 'adj' }; openDay = null; render(); }));
        more.appendChild(btn('Copy fee message', 'secondary', () => copyText(C.messageText(r, s, state.cur, LOC, state.greet), msgId(s.id))));
        if (navigator.share) more.appendChild(btn('Share', 'secondary', () => { navigator.share({ text: C.messageText(r, s, state.cur, LOC, state.greet) }).catch(() => {}); }, 'Share the fee message for ' + s.name));
        more.appendChild(btn('Edit', 'secondary', () => { fillForm(s); render(); }, 'Edit ' + s.name));
        more.appendChild(btn('Delete', 'secondary danger-t', () => { if (editing === s.id) resetForm(); change(() => { state.students = state.students.filter(x => x.id !== s.id); }, 'add-msg', s.name + ' deleted.'); }, 'Delete ' + s.name));
        acts.appendChild(more);
        box.appendChild(acts);
        const m = el('div', 'msg'); m.id = msgId(s.id); m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite');
        box.appendChild(m);
        return box;
    }

    // ---------- printing ----------
    function printRegister() {
        const rep = $('report'); rep.textContent = '';
        const sm = C.summary(state, view, today);
        if (!sm.list.length) { flash = { where: 'month-msg', text: 'Nothing to print for this month.', bad: true }; render(); return; }
        rep.appendChild(el('h2', '', 'Tuition register: ' + C.monthName(view, LOC)));
        const t = el('table'), head = el('tr');
        ['Student', 'Classes', 'Fee', 'Paid', 'Still to pay'].forEach(h => head.appendChild(el('th', '', h)));
        t.appendChild(head);
        sm.list.forEach(x => {
            const tr = el('tr');
            [x.s.name, x.r.active ? x.r.attended + ' of ' + x.r.held : '', money(x.r.due), money(x.r.paid), x.r.toPay > 0 ? money(x.r.toPay) : x.r.toPay < 0 ? signed(x.r.toPay) + ' (extra)' : 'Paid'].forEach(v => tr.appendChild(el('td', '', v)));
            t.appendChild(tr);
            if (x.r.absent.length) { const n = el('tr', 'sub'), td = el('td', '', 'Absent: ' + C.dayList(x.r.absent, LOC)); td.colSpan = 5; n.appendChild(td); t.appendChild(n); }
        });
        const tot = el('tr', 'tot');
        ['Total', '', money(sm.list.reduce((a, x) => a + x.r.due, 0)), money(sm.paid), money(sm.toCollect)].forEach(v => tot.appendChild(el('td', '', v)));
        t.appendChild(tot);
        rep.appendChild(t);
        window.print();
    }

    // ---------- render ----------
    function render() {
        document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.className = 'msg'; });
        $('cur').value = state.cur;
        $('due').value = String(state.due);
        if (document.activeElement !== $('greet')) $('greet').value = state.greet;
        $('cur-tag').hidden = !state.cur; $('cur-tag').textContent = state.cur;
        renderToday();
        renderMonth();
        const list = $('i-list'); list.textContent = '';
        $('items').hidden = !state.students.length;
        $('find-box').hidden = state.students.length < 6;
        if ($('find-box').hidden) query = '';
        const q = query.trim().toLowerCase();
        let shown = 0;
        state.students.forEach(s => { if (!q || s.name.toLowerCase().includes(q)) { list.appendChild(renderStudent(s)); shown++; } });
        $('find-none').hidden = !q || shown > 0;
        $('restore-first').hidden = state.students.length > 0 || !!editing;
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
            resetForm();
            change(() => { state = s; }, 'tools-msg', 'Backup restored: ' + C.plural(s.students.length, 'student', 'students') + '.');
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
        document.querySelectorAll('#f-days-quick .chip').forEach(c => c.addEventListener('click', () => { setDays(c.dataset.days.split(',').map(Number)); formHints(); }));
        $('f-wd-row').addEventListener('change', formHints);
        ['f-bill-month', 'f-bill-class'].forEach(id => $(id).addEventListener('change', formHints));
        const reveal = (open, box, focus) => $(open).addEventListener('click', () => { $(box).hidden = false; $(open).hidden = true; $(focus).focus(); });
        reveal('f-more-open', 'f-more-box', 'f-who'); reveal('f-open-open', 'f-open-box', 'f-open'); reveal('f-stop-open', 'f-stop-box', 'f-stop');
        $('f-save').addEventListener('click', saveForm);
        $('add').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') { e.preventDefault(); saveForm(); } });
        $('f-cancel').addEventListener('click', () => { resetForm(); render(); });
        $('t-hol').addEventListener('click', () => toggleHol(today, 'today-msg'));
        const go = m => { view = m; openDay = null; panel = null; render(); };
        $('mo-prev').addEventListener('click', () => go(C.addMonth(view, -1)));
        $('mo-next').addEventListener('click', () => go(C.addMonth(view, 1)));
        $('mo-today').addEventListener('click', () => go(C.monthOf(today)));
        $('mo-copy').addEventListener('click', () => copyText(C.unpaidText(C.summary(state, view, today).list, view, state.cur, LOC), 'month-msg'));
        $('mo-print').addEventListener('click', printRegister);
        $('find').addEventListener('input', () => { query = $('find').value; render(); $('find').focus(); });
        $('cur').addEventListener('change', () => change(() => { state.cur = C.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; }, 'tools-msg', 'Currency symbol saved.'));
        $('due').addEventListener('change', () => change(() => { const n = Number($('due').value); state.due = n >= 1 && n <= 28 ? n : 10; }, 'tools-msg', 'Due day saved.'));
        $('greet').addEventListener('change', () => change(() => { state.greet = $('greet').value.trim().slice(0, 40); }, 'tools-msg', 'Greeting saved.'));
        $('backup').addEventListener('click', backup);
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-first').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) restore(f); e.target.value = ''; });
        $('del-all').addEventListener('click', () => {
            if (!state.students.length) { flash = { where: 'tools-msg', text: 'There is nothing to delete.' }; render(); return; }
            resetForm();
            change(() => { const keep = { cur: state.cur, due: state.due, greet: state.greet }; state = Object.assign(C.emptyState(), keep); }, 'tools-msg', 'Everything deleted.');
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
