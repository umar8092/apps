// Milk and Daily Delivery Log: the page. The maths and the words are in core.js (window.MDL).
(function () {
    'use strict';
    const C = window.MDL, SLUG = 'milk-and-daily-delivery-log-with-monthly-bill', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const LOC = navigator.language || 'en-GB';
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', '₦': '₦ (naira)',
        'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', 'Rp': 'Rp (rupiah)', 'RM': 'RM (ringgit)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const WD_ORDER = [1, 2, 3, 4, 5, 6, 0];
    let state = C.emptyState(), today = C.dayStr(new Date()), view = C.monthOf(today);
    let editing = null;      // id of the delivery shown in the form, or null when adding
    let openDay = null;      // { id, day } day editor that is open
    let panel = null;        // { id, what: 'pay' | 'plan' | 'pause' }
    let flash = null;        // { where, text, undo, bad }
    let undoSnap = null, canSave = true;

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
        const where = flash ? flash.where : 'add-msg';
        undoSnap = null; openDay = null; panel = null;
        save();
        flash = { where, text: 'Undone.' };
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const money = c => C.fmt(c, state.cur, LOC);
    const qty = (m, it) => C.qtyText(m, it.unit, LOC);
    const byId = id => state.items.find(x => x.id === id);
    const nameOf = it => it.name || 'Delivery';
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into a message.' }; render(); };
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Use Print or save as PDF instead.', bad: true }; render(); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function setErr(id, msg) {
        $(id + '-err').textContent = msg || '';
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
    function minMonth() { return state.items.reduce((m, it) => C.monthOf(it.start) < m ? C.monthOf(it.start) : m, C.monthOf(today)); }
    const maxMonth = () => C.addMonth(C.monthOf(today), 3);

    // ---------- the form ----------
    function unitOf() { return $('f-unit').value === 'other' ? $('f-ounit').value.trim().slice(0, 20) : $('f-unit').value; }
    function unitLabels() {
        const u = unitOf(), one = C.UNITS[u] ? C.unitWord(u, 1000) : (u || 'unit');
        $('f-price-l').textContent = 'Price per ' + one;
        $('f-ounit-box').hidden = $('f-unit').value !== 'other';
    }
    function buildWeekdays() {
        WD_ORDER.forEach(d => {
            const lab = el('label', 'wd-chip'), cb = el('input');
            cb.type = 'checkbox'; cb.value = String(d); cb.checked = true; cb.id = 'f-wd-' + d;
            lab.appendChild(cb); lab.appendChild(el('span', '', C.DAYS[d]));
            $('f-wd-row').appendChild(lab);
        });
    }
    function resetForm() {
        editing = null;
        ['f-name', 'f-qty', 'f-ounit', 'f-price', 'f-seller', 'f-phone', 'f-open', 'f-stop'].forEach(id => { $(id).value = ''; });
        ['f-name', 'f-qty', 'f-ounit', 'f-price', 'f-wd', 'f-start', 'f-stop', 'f-phone', 'f-open'].forEach(id => setErr(id, ''));
        $('f-unit').value = 'litre'; $('f-mode').value = 'daily'; $('f-open-kind').value = 'owe';
        document.querySelectorAll('#f-wd-row input').forEach(cb => { cb.checked = true; });
        $('f-start').value = C.firstDay(C.monthOf(today));
        $('f-seller-box').hidden = true; $('f-seller-open').hidden = false;
        $('f-open-box').hidden = true; $('f-open-open').hidden = false;
        $('f-stop-box').hidden = true; $('f-stop-open').hidden = true;
        $('f-wd').hidden = true;
        $('add-h').textContent = 'Add a delivery'; $('f-save').textContent = 'Add delivery'; $('f-cancel').hidden = true;
        $('f-qty-l').textContent = 'Usual amount'; $('f-start-l').textContent = 'Deliveries started on';
        $('f-start-hint').textContent = 'If you have had it for a while, pick the 1st of this month and start counting from there.';
        $('quick').hidden = false;
        unitLabels();
    }
    function fillForm(it) {
        resetForm();
        editing = it.id;
        $('f-name').value = it.name;
        if (C.UNITS[it.unit]) $('f-unit').value = it.unit; else { $('f-unit').value = 'other'; $('f-ounit').value = it.unit; }
        $('f-qty').value = C.fmtQty(it.plans[0].q, 'en-US').replace(/,/g, '');
        $('f-price').value = (it.plans[0].p / 100).toFixed(it.plans[0].p % 100 ? 2 : 0);
        $('f-mode').value = it.mode; $('f-wd').hidden = it.mode !== 'week';
        document.querySelectorAll('#f-wd-row input').forEach(cb => { cb.checked = it.wd.includes(Number(cb.value)); });
        $('f-start').value = it.start;
        if (it.seller || it.phone) { $('f-seller-box').hidden = false; $('f-seller-open').hidden = true; $('f-seller').value = it.seller; $('f-phone').value = it.phone; }
        if (it.open) { $('f-open-box').hidden = false; $('f-open-open').hidden = true; $('f-open-kind').value = it.open > 0 ? 'owe' : 'adv'; $('f-open').value = (Math.abs(it.open) / 100).toFixed(Math.abs(it.open) % 100 ? 2 : 0); }
        $('f-stop-open').hidden = !!it.stop; $('f-stop-box').hidden = !it.stop; $('f-stop').value = it.stop;
        $('add-h').textContent = 'Edit ' + nameOf(it); $('f-save').textContent = 'Save changes'; $('f-cancel').hidden = false;
        $('f-qty-l').textContent = 'Amount at the start'; $('f-start-l').textContent = 'Deliveries started on';
        $('f-start-hint').textContent = it.plans.length > 1 ? 'Later price or amount changes stay as they are; they are listed in the delivery\'s box.' : 'Changing the days or the start date changes the bills of earlier months too.';
        $('quick').hidden = true;
        unitLabels();
        render();
        $('add').scrollIntoView({ block: 'start' });
        $('f-name').focus({ preventScroll: true });
    }
    function readForm() {
        let ok = true;
        const name = $('f-name').value.trim();
        ok = setErr('f-name', name ? '' : 'Type what is delivered, such as Milk.') && ok;
        const q = C.parseQty($('f-qty').value);
        ok = setErr('f-qty', q.error || '') && ok;
        const unit = unitOf();
        if ($('f-unit').value === 'other') ok = setErr('f-ounit', unit ? '' : 'Type the unit, such as jars.') && ok;
        const p = C.parseAmount($('f-price').value, { max: C.MAXP, blank: 'Type the price, such as 220.' });
        ok = setErr('f-price', p.error || '') && ok;
        const mode = $('f-mode').value;
        const wd = [...document.querySelectorAll('#f-wd-row input:checked')].map(cb => Number(cb.value));
        ok = setErr('f-wd', mode === 'week' && !wd.length ? 'Tick at least one day.' : '') && ok;
        const start = $('f-start').value;
        ok = setErr('f-start', C.isDay(start) ? '' : 'Pick the day the deliveries started.') && ok;
        let stop = '';
        if (!$('f-stop-box').hidden && $('f-stop').value) {
            stop = $('f-stop').value;
            ok = setErr('f-stop', !C.isDay(stop) ? 'Pick a real day.' : C.isDay(start) && stop < start ? 'The last delivery day cannot be before the start.' : '') && ok;
        } else setErr('f-stop', '');
        const phone = $('f-phone').value.trim();
        ok = setErr('f-phone', phone && !/^\+?[\d\s()\-.]{5,22}$/.test(phone) ? 'Type only the number, such as +92 300 1234567.' : '') && ok;
        let open = 0;
        if (!$('f-open-box').hidden && $('f-open').value.trim()) {
            const o = C.parseAmount($('f-open').value);
            ok = setErr('f-open', o.error || '') && ok;
            if (!o.error) open = $('f-open-kind').value === 'adv' ? -o.cents : o.cents;
        } else setErr('f-open', '');
        if (!ok) { const first = document.querySelector('#add [aria-invalid="true"]'); if (first) first.focus(); return null; }
        return { name: name.slice(0, 40), q: q.m, unit, p: p.cents, mode, wd: mode === 'week' ? wd : [0, 1, 2, 3, 4, 5, 6], start, stop, seller: $('f-seller').value.trim().slice(0, 60), phone, open };
    }
    function saveForm() {
        const f = readForm();
        if (!f) return;
        if (!editing) {
            if (state.items.length >= 30) { flash = { where: 'add-msg', text: 'You can keep up to 30 deliveries.', bad: true }; render(); return; }
            const it = C.newItem(C.newId(), f.start);
            Object.assign(it, { name: f.name, unit: f.unit, mode: f.mode, wd: f.wd, seller: f.seller, phone: f.phone, open: f.open, stop: f.stop });
            it.plans = [{ from: f.start, q: f.q, p: f.p }];
            change(() => { state.items.push(it); }, 'item-' + it.id, f.name + ' added. If a day it did not come or came in a different amount, tap that day in the calendar.');
            view = C.monthOf(today) < C.monthOf(f.start) ? C.monthOf(f.start) : C.monthOf(today);
            resetForm(); render();
            const box = $('item-' + it.id); if (box) box.scrollIntoView({ block: 'start' });
            return;
        }
        const it = byId(editing);
        if (!it) { resetForm(); render(); return; }
        const id = it.id;
        change(() => {
            const x = byId(id);
            const later = x.plans.slice(1).filter(p => p.from > f.start);
            const base = { from: f.start, q: f.q, p: f.p };
            Object.assign(x, { name: f.name, unit: f.unit, mode: f.mode, wd: f.wd, start: f.start, stop: f.stop, seller: f.seller, phone: f.phone, open: f.open });
            x.plans = [base].concat(later);
        }, 'item-' + id, 'Changes saved.');
        resetForm(); render();
        const box = $('item-' + id); if (box) box.scrollIntoView({ block: 'start' });
    }

    // ---------- the month box ----------
    function renderMonth() {
        const has = state.items.length > 0;
        $('month').hidden = !has;
        if (!has) return;
        if (view < minMonth()) view = minMonth();
        if (view > maxMonth()) view = maxMonth();
        const cur = C.monthOf(today), st = view < cur ? 'past' : view === cur ? 'now' : 'future';
        $('month-h').textContent = C.monthName(view, LOC);
        $('mo-prev').disabled = view <= minMonth(); $('mo-next').disabled = view >= maxMonth();
        $('mo-today').hidden = view === cur;
        $('mo-sub').textContent = st === 'past' ? 'The whole month.' : st === 'future' ? 'Expected, if nothing changes.' : today === C.lastDay(view) ? 'The whole month (today is the last day).' : 'So far: 1 to ' + C.shortDate(today, LOC) + ' (today).';
        const rows = $('mo-rows'); rows.textContent = '';
        let pay = 0, payFull = 0, bills = 0;
        state.items.forEach(it => {
            const v = C.monthView(it, view, today);
            if (v.bill.days === 0 && v.bf === 0 && v.paid === 0 && (!v.started || v.stopped)) return;
            const r = el('div', 'mo-row');
            const left = el('div', 'mo-l');
            left.appendChild(el('p', 'mo-name', nameOf(it)));
            left.appendChild(el('p', 'mo-what', qty(v.bill.qty, it) + ', bill ' + money(v.bill.cents)));
            r.appendChild(left);
            const right = el('p', 'mo-r' + (v.toPay > 0 ? '' : ' good'), v.toPay > 0 ? money(v.toPay) + ' to pay' : v.toPay < 0 ? 'Paid ahead ' + money(-v.toPay) : 'All paid');
            r.appendChild(right);
            rows.appendChild(r);
            pay += Math.max(0, v.toPay); payFull += Math.max(0, v.toPayFull); bills += v.bill.cents;
        });
        if (!rows.children.length) rows.appendChild(el('p', 'hint', 'Nothing was delivered in this month.'));
        $('mo-pay').textContent = pay > 0 ? 'To pay ' + (st === 'future' ? 'for this month' : 'now') + ': ' + money(pay) : 'Nothing to pay.';
        $('mo-pay').className = 'mo-pay' + (pay > 0 ? '' : ' good');
        $('mo-full').textContent = st === 'now' && today < C.lastDay(view) ? 'By ' + C.shortDate(C.lastDay(view), LOC) + ', if nothing changes: ' + money(payFull) + ' to pay.' : '';
        $('mo-copy').disabled = !bills && !pay;
    }

    // ---------- one delivery box ----------
    function dayCell(it, d) {
        const x = C.dayInfo(it, d), n = C.toDate(d).getDate();
        if (x.kind === 'none') { const s = el('span', 'day none'); s.appendChild(el('span', 'dn', String(n))); s.setAttribute('aria-hidden', 'true'); return s; }
        const b = el('button', 'day ' + x.kind + (d === today ? ' today' : '') + (d > today ? ' later' : '') + (openDay && openDay.id === it.id && openDay.day === d ? ' sel' : ''));
        b.type = 'button';
        b.appendChild(el('span', 'dn', String(n)));
        const mark = x.kind === 'missed' ? '✕' : x.kind === 'paused' ? '–' : x.q ? C.fmtQty(x.q, LOC) : '';
        b.appendChild(el('span', 'dq', mark));
        const what = { usual: qty(x.q, it), changed: qty(x.q, it) + ' (changed, usual ' + C.fmtQty(x.usual, LOC) + ')', extra: qty(x.q, it) + ' (extra day)', missed: 'not delivered', paused: 'paused', off: 'no delivery' }[x.kind];
        b.setAttribute('aria-label', C.dayName(d, LOC) + ': ' + what + (d === today ? ', today' : ''));
        b.addEventListener('click', () => { openDay = openDay && openDay.id === it.id && openDay.day === d ? null : { id: it.id, day: d }; panel = null; flash = null; render(); focusIn(it.id, '.dp-h'); });
        return b;
    }
    function focusIn(id, sel) { const box = $('item-' + id); const e = box && box.querySelector(sel); if (e) { e.setAttribute('tabindex', '-1'); e.focus(); } }
    function setDay(id, d, q, text) {
        change(() => { const x = byId(id); if (q === null) delete x.ch[d]; else x.ch[d] = q; }, 'item-' + id, text);
    }
    function dayPanel(it) {
        const d = openDay.day, x = C.dayInfo(it, d), pl = C.planOn(it, d), sched = C.scheduledOn(it, d), paused = C.pausedOn(it, d);
        const p = el('div', 'panel day-panel');
        p.appendChild(el('h3', 'dp-h', C.dayName(d, LOC) + (d === today ? ' (today)' : '')));
        const now = { usual: 'Delivered as usual: ' + qty(x.q, it) + '.', changed: 'Changed to ' + qty(x.q, it) + ' (usual ' + qty(x.usual, it) + ').', extra: 'Extra delivery: ' + qty(x.q, it) + ' (it does not usually come on this day).',
            missed: 'Marked as not delivered.', paused: 'Paused (away). Nothing is billed.', off: 'It does not usually come on this day.' }[x.kind];
        p.appendChild(el('p', 'dp-now', now));
        const row = el('div', 'row-btns');
        const name = C.dayName(d, LOC);
        if (x.kind !== 'usual' || Object.prototype.hasOwnProperty.call(it.ch, d)) {
            const label = sched && !paused ? 'As usual (' + qty(pl.q, it) + ')' : paused ? 'Back to paused' : 'No delivery, as usual';
            if (Object.prototype.hasOwnProperty.call(it.ch, d)) row.appendChild(btn(label, 'secondary', () => { openDay = null; setDay(it.id, d, null, name + ': ' + (sched && !paused ? 'as usual' : paused ? 'paused' : 'no delivery') + '.'); }));
        }
        if (x.q > 0) row.appendChild(btn('Not delivered', 'secondary', () => { openDay = null; setDay(it.id, d, 0, name + ': not delivered.'); }));
        p.appendChild(row);
        const lab = el('label', '', 'Different amount (' + (C.UNITS[it.unit] ? C.unitWord(it.unit, 2000) : it.unit || 'units') + ')');
        lab.htmlFor = 'dp-q-' + it.id;
        p.appendChild(lab);
        const ar = el('div', 'dp-amt');
        const inp = el('input'); inp.type = 'text'; inp.id = 'dp-q-' + it.id; inp.inputMode = 'decimal'; inp.maxLength = 12; inp.autocomplete = 'off';
        inp.placeholder = 'e.g. ' + C.fmtQty(pl.q + 1000, 'en-US'); inp.setAttribute('aria-describedby', 'dp-q-' + it.id + '-err');
        const err = el('p', 'err'); err.id = 'dp-q-' + it.id + '-err'; err.setAttribute('role', 'alert');
        const go = () => {
            const r = C.parseQty(inp.value, true);
            if (r.error) { err.textContent = r.error; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
            openDay = null;
            setDay(it.id, d, r.m, name + ': ' + (r.m ? qty(r.m, it) : 'not delivered') + '.');
        };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        ar.appendChild(inp); ar.appendChild(btn('Save amount', 'primary', go));
        p.appendChild(ar); p.appendChild(err);
        p.appendChild(btn('Close', 'link', () => { openDay = null; render(); }));
        return p;
    }
    function payPanel(it, v) {
        const p = el('div', 'panel');
        p.appendChild(el('h3', 'pp-h', 'Payment for ' + C.monthName(view, LOC)));
        const a = el('label', '', 'Amount paid'); a.htmlFor = 'pp-a-' + it.id; p.appendChild(a);
        const ai = el('input'); ai.type = 'text'; ai.id = 'pp-a-' + it.id; ai.inputMode = 'decimal'; ai.maxLength = 16; ai.autocomplete = 'off'; ai.placeholder = 'e.g. 5000';
        const due = v.state === 'now' ? Math.max(v.toPay, 0) : Math.max(v.toPayFull, 0);
        if (due) ai.value = (due / 100).toFixed(due % 100 ? 2 : 0);
        p.appendChild(ai);
        const ae = el('p', 'err'); ae.setAttribute('role', 'alert'); p.appendChild(ae);
        const dl = el('label', '', 'Paid on'); dl.htmlFor = 'pp-d-' + it.id; p.appendChild(dl);
        const di = el('input'); di.type = 'date'; di.id = 'pp-d-' + it.id; di.value = today; p.appendChild(di);
        const de = el('p', 'err'); de.setAttribute('role', 'alert'); p.appendChild(de);
        const go = () => {
            const r = C.parseAmount(ai.value);
            ae.textContent = r.error || ''; de.textContent = C.isDay(di.value) ? '' : 'Pick the day you paid.';
            if (r.error) { ai.focus(); return; } if (!C.isDay(di.value)) { di.focus(); return; }
            panel = null;
            const m = view;
            change(() => { const x = byId(it.id); (x.pay[m] = x.pay[m] || []).push({ id: C.newId(), d: di.value, c: r.cents }); }, 'item-' + it.id, 'Payment of ' + money(r.cents) + ' saved for ' + C.monthName(m, LOC) + '.');
        };
        ai.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        const row = el('div', 'row-btns');
        row.appendChild(btn('Save payment', 'primary', go)); row.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); }));
        p.appendChild(row);
        p.appendChild(el('p', 'hint', 'Paying on the 1st or 2nd for last month? Go to that month with Previous first, so the payment counts for it.'));
        return p;
    }
    function planPanel(it) {
        const p = el('div', 'panel');
        p.appendChild(el('h3', 'pp-h', 'New price or usual amount'));
        const cur = C.planOn(it, today < it.start ? it.start : today);
        const fl = el('label', '', 'From'); fl.htmlFor = 'pl-d-' + it.id; p.appendChild(fl);
        const fd = el('input'); fd.type = 'date'; fd.id = 'pl-d-' + it.id; fd.value = today > it.start ? today : C.addDays(it.start, 1); p.appendChild(fd);
        const fe = el('p', 'err'); fe.setAttribute('role', 'alert'); p.appendChild(fe);
        const ql = el('label', '', 'Usual amount each time'); ql.htmlFor = 'pl-q-' + it.id; p.appendChild(ql);
        const qi = el('input'); qi.type = 'text'; qi.id = 'pl-q-' + it.id; qi.inputMode = 'decimal'; qi.maxLength = 12; qi.autocomplete = 'off'; qi.value = C.fmtQty(cur.q, 'en-US').replace(/,/g, ''); p.appendChild(qi);
        const qe = el('p', 'err'); qe.setAttribute('role', 'alert'); p.appendChild(qe);
        const pl = el('label', '', 'Price per ' + (C.UNITS[it.unit] ? C.unitWord(it.unit, 1000) : it.unit || 'unit')); pl.htmlFor = 'pl-p-' + it.id; p.appendChild(pl);
        const pi = el('input'); pi.type = 'text'; pi.id = 'pl-p-' + it.id; pi.inputMode = 'decimal'; pi.maxLength = 16; pi.autocomplete = 'off'; pi.value = (cur.p / 100).toFixed(cur.p % 100 ? 2 : 0); p.appendChild(pi);
        const pe = el('p', 'err'); pe.setAttribute('role', 'alert'); p.appendChild(pe);
        const go = () => {
            const q = C.parseQty(qi.value), pr = C.parseAmount(pi.value, { max: C.MAXP, blank: 'Type the price, such as 230.' }), d = fd.value;
            fe.textContent = !C.isDay(d) ? 'Pick the first day of the new price or amount.' : d <= it.start ? 'Pick a day after the start (' + C.niceDate(it.start, LOC) + '). To change the first price, use Edit.' : '';
            qe.textContent = q.error || ''; pe.textContent = pr.error || '';
            if (fe.textContent) { fd.focus(); return; } if (q.error) { qi.focus(); return; } if (pr.error) { pi.focus(); return; }
            panel = null;
            change(() => {
                const x = byId(it.id);
                x.plans = x.plans.filter(z => z.from !== d).concat([{ from: d, q: q.m, p: pr.cents }]).sort((a, b) => a.from < b.from ? -1 : 1);
            }, 'item-' + it.id, 'From ' + C.niceDate(d, LOC) + ': ' + qty(q.m, it) + ' at ' + money(pr.cents) + '.');
        };
        const row = el('div', 'row-btns');
        row.appendChild(btn('Save change', 'primary', go)); row.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); }));
        p.appendChild(row);
        return p;
    }
    function pausePanel(it) {
        const p = el('div', 'panel');
        p.appendChild(el('h3', 'pp-h', 'Pause deliveries (away or holiday)'));
        const a = el('label', '', 'First day away'); a.htmlFor = 'pa-f-' + it.id; p.appendChild(a);
        const af = el('input'); af.type = 'date'; af.id = 'pa-f-' + it.id; af.value = today; p.appendChild(af);
        const b = el('label', '', 'Last day away'); b.htmlFor = 'pa-t-' + it.id; p.appendChild(b);
        const bt = el('input'); bt.type = 'date'; bt.id = 'pa-t-' + it.id; bt.value = C.addDays(today, 6); p.appendChild(bt);
        const e = el('p', 'err'); e.setAttribute('role', 'alert'); p.appendChild(e);
        let all = null;
        if (state.items.length > 1) {
            const l = el('label', 'check'); all = el('input'); all.type = 'checkbox'; all.checked = true; all.id = 'pa-all-' + it.id;
            l.appendChild(all); l.appendChild(el('span', '', 'All deliveries (' + state.items.map(nameOf).join(', ') + ')')); p.appendChild(l);
        }
        const go = () => {
            const f = af.value, t = bt.value;
            e.textContent = !C.isDay(f) || !C.isDay(t) ? 'Pick both days.' : t < f ? 'The last day cannot be before the first day.' : C.daysBetween(f, t) > 365 ? 'Pause at most a year at a time.' : '';
            if (e.textContent) { af.focus(); return; }
            panel = null;
            const ids = all && all.checked ? state.items.map(x => x.id) : [it.id];
            change(() => { ids.forEach(id => byId(id).pauses.push({ id: C.newId(), from: f, to: t })); }, 'item-' + it.id,
                'Paused ' + (f === t ? C.niceDate(f, LOC) : C.shortDate(f, LOC) + ' to ' + C.niceDate(t, LOC)) + (ids.length > 1 ? ' for all deliveries.' : '.'));
        };
        const row = el('div', 'row-btns');
        row.appendChild(btn('Save pause', 'primary', go)); row.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); }));
        p.appendChild(row);
        return p;
    }
    function waLink(it, text) {
        const digits = (it.phone || '').replace(/\D/g, '');
        return 'https://wa.me/' + (digits.length >= 6 ? digits : '') + '?text=' + encodeURIComponent(text);
    }
    function itemBox(it) {
        const v = C.monthView(it, view, today), b = v.bill, box = el('article', 'item'), id = it.id;
        box.id = 'item-' + id;
        if (v.toPay > 0) box.classList.add('owes'); else box.classList.add('ok');
        const top = el('div', 'i-top');
        top.appendChild(el('h3', 'i-name', nameOf(it)));
        if (it.seller) top.appendChild(el('span', 'tag', it.seller));
        box.appendChild(top);
        const refDay = v.state === 'now' ? (today < it.start ? it.start : today) : v.state === 'past' ? C.lastDay(view) : C.firstDay(view);
        box.appendChild(el('p', 'i-usual', C.usualText(it, C.planOn(it, refDay < it.start ? it.start : refDay), state.cur, LOC)));
        if (it.start > C.firstDay(view) && it.start <= C.lastDay(view)) box.appendChild(el('p', 'i-note', 'Started on ' + C.niceDate(it.start, LOC) + '.'));
        if (it.start > C.lastDay(view)) box.appendChild(el('p', 'i-note', 'Starts on ' + C.niceDate(it.start, LOC) + '.'));
        if (it.stop && it.stop <= C.lastDay(view)) box.appendChild(el('p', 'i-note', 'Stopped after ' + C.niceDate(it.stop, LOC) + '.'));

        // today
        if (v.state === 'now' && today >= it.start && (!it.stop || today <= it.stop)) {
            const x = C.dayInfo(it, today), t = el('div', 'today-box');
            const words = { usual: qty(x.q, it) + ' (as usual)', changed: qty(x.q, it) + ' (changed)', extra: qty(x.q, it) + ' (extra)', missed: 'not delivered', paused: 'paused (away)', off: 'no delivery today' }[x.kind];
            t.appendChild(el('p', 'tb-t', 'Today, ' + C.dayName(today, LOC) + ': ' + words));
            const row = el('div', 'tb-btns');
            if (x.q > 0) row.appendChild(btn('Not delivered today', 'secondary', () => setDay(id, today, 0, 'Today: not delivered.')));
            else if (Object.prototype.hasOwnProperty.call(it.ch, today)) row.appendChild(btn(C.scheduledOn(it, today) && !C.pausedOn(it, today) ? 'It came after all' : 'Undo today\'s change', 'secondary', () => setDay(id, today, null, 'Today: back to normal.')));
            row.appendChild(btn(x.q > 0 ? 'Change today\'s amount' : 'Add an amount for today', 'secondary', () => { openDay = { id, day: today }; panel = null; flash = null; render(); focusIn(id, '.dp-h'); }));
            t.appendChild(row);
            box.appendChild(t);
        }

        // calendar
        const cal = el('div', 'cal'); cal.setAttribute('role', 'group'); cal.setAttribute('aria-label', C.monthName(view, LOC) + ' calendar for ' + nameOf(it));
        WD_ORDER.forEach(d => { const h = el('span', 'cal-h', C.DAYS[d].slice(0, 2)); h.setAttribute('aria-hidden', 'true'); cal.appendChild(h); });
        const lead = (C.weekday(C.firstDay(view)) + 6) % 7;
        for (let i = 0; i < lead; i++) cal.appendChild(el('span', 'day blank'));
        for (let d = C.firstDay(view); d <= C.lastDay(view); d = C.addDays(d, 1)) cal.appendChild(dayCell(it, d));
        box.appendChild(cal);
        if (openDay && openDay.id === id && C.monthOf(openDay.day) === view) box.appendChild(dayPanel(it));

        // the bill
        const bill = el('div', 'bill');
        const so = v.state === 'now' && b.to < C.lastDay(view);
        bill.appendChild(el('p', 'b-head', (v.state === 'future' ? 'Expected: ' : so ? 'So far: ' : '') + 'delivered on ' + C.plural(b.days, 'day', 'days') + ', ' + qty(b.qty, it)));
        b.segs.forEach(s => bill.appendChild(el('p', 'b-seg', C.segLine(it, s, state.cur, LOC) + (b.segs.length > 1 ? ' (' + C.shortDate(s.from, LOC) + ' to ' + C.shortDate(s.to, LOC) + ')' : ''))));
        if (b.missed.length) bill.appendChild(el('p', 'b-note bad-t', 'Not delivered: ' + C.dayList(b.missed, LOC)));
        if (b.paused.length) bill.appendChild(el('p', 'b-note', 'Paused (away): ' + C.rangeList(b.paused, LOC)));
        b.changed.forEach(x => bill.appendChild(el('p', 'b-note', 'Changed: ' + C.shortDate(x.d, LOC) + ', ' + qty(x.q, it) + ' (usual ' + C.fmtQty(x.usual, LOC) + ')')));
        b.extra.forEach(x => bill.appendChild(el('p', 'b-note', 'Extra: ' + C.shortDate(x.d, LOC) + ', ' + qty(x.q, it))));
        const lines = el('div', 'b-lines');
        const line = (a, c, cls) => { const r = el('div', 'b-line' + (cls ? ' ' + cls : '')); r.appendChild(el('span', '', a)); r.appendChild(el('span', 'b-amt', c)); lines.appendChild(r); };
        line(v.state === 'future' ? 'Expected bill' : so ? 'Bill so far' : 'Bill for the month', money(b.cents));
        if (v.bf > 0) line('Owed from before', '+ ' + money(v.bf));
        if (v.bf < 0) line('Paid ahead before', '− ' + money(-v.bf));
        (it.pay[view] || []).forEach(x => {
            const r = el('div', 'b-line pay-line');
            r.appendChild(el('span', '', 'Paid on ' + C.shortDate(x.d, LOC)));
            const right = el('span', 'b-amt');
            right.appendChild(document.createTextNode('− ' + money(x.c) + ' '));
            right.appendChild(btn('Delete', 'link inline danger-t', () => change(() => { const y = byId(id); y.pay[view] = (y.pay[view] || []).filter(z => z.id !== x.id); if (!y.pay[view].length) delete y.pay[view]; }, 'item-' + id, 'Payment deleted.'), 'Delete payment of ' + money(x.c) + ' on ' + C.niceDate(x.d, LOC)));
            r.appendChild(right); lines.appendChild(r);
        });
        bill.appendChild(lines);
        const tp = el('p', 'b-pay' + (v.toPay > 0 ? '' : ' good'), C.balanceText(v.toPay, state.cur, LOC));
        bill.appendChild(tp);
        if (so) bill.appendChild(el('p', 'b-full', 'By ' + C.shortDate(C.lastDay(view), LOC) + ', if nothing changes: ' + qty(v.full.qty, it) + ', bill ' + money(v.full.cents) + (v.toPayFull === v.full.cents ? '.' : v.toPayFull > 0 ? ', ' + money(v.toPayFull) + ' to pay.' : ', nothing to pay.')));
        box.appendChild(bill);

        // changes and pauses
        const extras = it.plans.slice(1), pauses = it.pauses.slice().sort((a, c) => a.from < c.from ? -1 : 1);
        if (extras.length || pauses.length) {
            const ch = el('div', 'changes');
            ch.appendChild(el('h4', '', 'Changes and pauses'));
            extras.forEach(z => {
                const r = el('div', 'ch-row');
                r.appendChild(el('span', '', 'From ' + C.niceDate(z.from, LOC) + ': ' + qty(z.q, it) + ' at ' + money(z.p)));
                r.appendChild(btn('Delete', 'link inline danger-t', () => change(() => { const y = byId(id); y.plans = y.plans.filter(w => w.from !== z.from || w === y.plans[0]); }, 'item-' + id, 'Change from ' + C.niceDate(z.from, LOC) + ' deleted.'), 'Delete the change from ' + C.niceDate(z.from, LOC)));
                ch.appendChild(r);
            });
            pauses.forEach(z => {
                const r = el('div', 'ch-row');
                r.appendChild(el('span', '', 'Paused ' + (z.from === z.to ? C.niceDate(z.from, LOC) : C.shortDate(z.from, LOC) + ' to ' + C.niceDate(z.to, LOC))));
                r.appendChild(btn('Delete', 'link inline danger-t', () => change(() => { const y = byId(id); y.pauses = y.pauses.filter(w => w.id !== z.id); }, 'item-' + id, 'Pause deleted.'), 'Delete the pause from ' + C.niceDate(z.from, LOC)));
                ch.appendChild(r);
            });
            box.appendChild(ch);
        }

        // buttons
        const text = () => C.summaryText(byId(id), view, today, state.cur, LOC);
        const g = el('div', 'i-btns');
        g.appendChild(btn('Record a payment', 'primary', () => { panel = panel && panel.id === id && panel.what === 'pay' ? null : { id, what: 'pay' }; openDay = null; flash = null; render(); focusIn(id, '.pp-h'); }));
        g.appendChild(btn('Copy the bill', 'secondary', () => copyText(text(), 'item-' + id)));
        const wa = el('a', 'secondary', 'Send on WhatsApp'); wa.href = waLink(it, text()); wa.target = '_blank'; wa.rel = 'noopener';
        g.appendChild(wa);
        const mail = el('a', 'secondary', 'Email'); mail.href = 'mailto:?subject=' + encodeURIComponent(nameOf(it) + ' bill: ' + C.monthName(view, LOC)) + '&body=' + encodeURIComponent(text());
        g.appendChild(mail);
        g.appendChild(btn('Price or amount changed', 'secondary', () => { panel = panel && panel.id === id && panel.what === 'plan' ? null : { id, what: 'plan' }; openDay = null; flash = null; render(); focusIn(id, '.pp-h'); }));
        g.appendChild(btn('Away? Pause deliveries', 'secondary', () => { panel = panel && panel.id === id && panel.what === 'pause' ? null : { id, what: 'pause' }; openDay = null; flash = null; render(); focusIn(id, '.pp-h'); }));
        g.appendChild(btn('Edit', 'secondary', () => { openDay = null; panel = null; flash = null; fillForm(byId(id)); }, 'Edit ' + nameOf(it)));
        g.appendChild(btn('Delete', 'secondary danger-t', () => { openDay = null; panel = null; if (editing === id) resetForm(); change(() => { state.items = state.items.filter(y => y.id !== id); }, 'add-msg', nameOf(it) + ' deleted.'); }, 'Delete ' + nameOf(it)));
        box.appendChild(g);
        if (panel && panel.id === id) box.appendChild(panel.what === 'pay' ? payPanel(it, v) : panel.what === 'plan' ? planPanel(it) : pausePanel(it));
        const m = el('div', 'msg'); m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite'); m.id = 'item-' + id + '-msg';
        box.appendChild(m);
        return box;
    }

    // ---------- print ----------
    function buildReport() {
        const r = $('report'); r.textContent = '';
        r.appendChild(el('h2', '', 'Deliveries: ' + C.monthName(view, LOC)));
        state.items.forEach(it => {
            const v = C.monthView(it, view, today);
            if (!v.full.days && !v.bf && !v.paid && (!v.started || v.stopped)) return;
            r.appendChild(el('h3', '', nameOf(it) + (it.seller ? ' (' + it.seller + ')' : '')));
            const tbl = el('table'), n = C.daysIn(view);
            [[1, 16], [17, n]].forEach(([a, z]) => {
                const h = el('tr'), q = el('tr');
                h.appendChild(el('th', '', 'Day')); q.appendChild(el('th', '', C.unitWord(it.unit, 2000) || 'Amount'));
                for (let i = a; i <= z; i++) {
                    const d = view + '-' + String(i).padStart(2, '0'), x = C.dayInfo(it, d);
                    h.appendChild(el('th', '', String(i)));
                    q.appendChild(el('td', '', x.kind === 'missed' ? '✕' : x.kind === 'paused' ? '–' : x.q ? C.fmtQty(x.q, LOC) : ''));
                }
                tbl.appendChild(h); tbl.appendChild(q);
            });
            r.appendChild(tbl);
            C.summaryText(it, view, today, state.cur, LOC).split('\n').slice(1).forEach(l => r.appendChild(el('p', '', l)));
        });
    }

    // ---------- render ----------
    function render() {
        $('store-warn').hidden = canSave;
        const has = state.items.length > 0;
        $('items').hidden = !has;
        $('add-intro').hidden = has && !editing;
        $('restore-first').hidden = has;
        $('cur-tag').hidden = !state.cur; $('cur-tag').textContent = state.cur;
        $('cur').value = state.cur;
        $('del-all').hidden = !has;
        renderMonth();
        const list = $('i-list'); list.textContent = '';
        state.items.forEach(it => list.appendChild(itemBox(it)));
        ['month-msg', 'add-msg', 'tools-msg'].forEach(id => { $(id).textContent = ''; $(id).className = 'msg'; });
        if (flash) {
            let where = flash.where;
            if (where.startsWith('item-')) where = $(where) ? where + '-msg' : 'add-msg';
            showMsg(where, flash.text, flash.undo && undoSnap, flash.bad);
        }
    }

    // ---------- wiring ----------
    function init() {
        load();
        if (!canSave) $('store-warn').hidden = false;
        Object.keys(CUR_NAMES).forEach(k => { const o = el('option', '', CUR_NAMES[k]); o.value = k; $('cur').appendChild(o); });
        buildWeekdays();
        resetForm();
        document.querySelectorAll('#quick .chip').forEach(c => c.addEventListener('click', () => {
            $('f-name').value = c.dataset.name; $('f-unit').value = c.dataset.unit; unitLabels(); setErr('f-name', '');
            if (!$('f-qty').value) $('f-qty').value = c.dataset.unit === 'litre' ? '' : '1';
            $(c.dataset.unit === 'litre' || !$('f-qty').value ? 'f-qty' : 'f-price').focus();
        }));
        $('f-unit').addEventListener('change', () => { unitLabels(); if ($('f-unit').value === 'other') $('f-ounit').focus(); });
        $('f-ounit').addEventListener('input', unitLabels);
        $('f-mode').addEventListener('change', () => { $('f-wd').hidden = $('f-mode').value !== 'week'; setErr('f-wd', ''); });
        $('f-seller-open').addEventListener('click', () => { $('f-seller-box').hidden = false; $('f-seller-open').hidden = true; $('f-seller').focus(); });
        $('f-open-open').addEventListener('click', () => { $('f-open-box').hidden = false; $('f-open-open').hidden = true; $('f-open-kind').focus(); });
        $('f-stop-open').addEventListener('click', () => { $('f-stop-box').hidden = false; $('f-stop-open').hidden = true; $('f-stop').value = today; $('f-stop').focus(); });
        $('f-save').addEventListener('click', saveForm);
        ['f-name', 'f-qty', 'f-price', 'f-ounit', 'f-seller', 'f-phone', 'f-open'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') saveForm(); }));
        $('f-cancel').addEventListener('click', () => { const id = editing; resetForm(); flash = null; render(); const b = id && $('item-' + id); if (b) b.scrollIntoView({ block: 'start' }); });
        $('add').addEventListener('keydown', e => { if (e.key === 'Escape' && editing) $('f-cancel').click(); });
        $('i-list').addEventListener('keydown', e => {
            if (e.key !== 'Escape' || (!openDay && !panel)) return;
            const id = (openDay || panel).id; openDay = null; panel = null; render(); focusIn(id, '.i-name');
        });
        $('mo-prev').addEventListener('click', () => { view = C.addMonth(view, -1); openDay = null; panel = null; flash = null; render(); });
        $('mo-next').addEventListener('click', () => { view = C.addMonth(view, 1); openDay = null; panel = null; flash = null; render(); });
        $('mo-today').addEventListener('click', () => { view = C.monthOf(today); openDay = null; panel = null; flash = null; render(); });
        $('mo-copy').addEventListener('click', () => {
            const parts = state.items.map(it => { const v = C.monthView(it, view, today); return !v.bill.days && !v.bf && !v.paid ? '' : C.summaryText(it, view, today, state.cur, LOC); }).filter(Boolean);
            copyText(parts.join('\n\n'), 'month-msg');
        });
        $('mo-print').addEventListener('click', () => { buildReport(); window.print(); });
        window.addEventListener('beforeprint', buildReport);
        $('cur').addEventListener('change', () => { state.cur = C.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; save(); flash = { where: 'tools-msg', text: state.cur ? 'Amounts now show ' + state.cur + '.' : 'Amounts now show plain numbers.' }; render(); });
        $('backup').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify({ app: SLUG, saved: today, data: state }, null, 1)], { type: 'application/json' });
            const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'milk-and-delivery-log-backup-' + today + '.json';
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            flash = { where: 'tools-msg', text: 'Backup file saved to your downloads.' }; render();
        });
        const pick = () => $('restore-file').click();
        $('restore').addEventListener('click', pick); $('restore-first').addEventListener('click', pick);
        $('restore-file').addEventListener('change', () => {
            const f = $('restore-file').files[0]; $('restore-file').value = '';
            if (!f) return;
            const where = state.items.length ? 'tools-msg' : 'add-msg';
            if (f.size > 5e6) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
            f.text().then(t => {
                let s = null;
                try { const o = JSON.parse(t); s = C.cleanState(o && o.data ? o.data : o); } catch (e) { s = null; }
                if (!s) { flash = { where, text: 'That file is not a backup from this app.', bad: true }; render(); return; }
                openDay = null; panel = null; resetForm();
                change(() => { state = s; }, where, 'Backup restored: ' + C.plural(s.items.length, 'delivery', 'deliveries') + '.');
            }).catch(() => { flash = { where, text: 'Could not read that file.', bad: true }; render(); });
        });
        $('del-all').addEventListener('click', () => { openDay = null; panel = null; resetForm(); change(() => { state.items = []; }, 'add-msg', 'Everything deleted.'); });
        render();
        // a new day after midnight
        setInterval(() => { const t = C.dayStr(new Date()); if (t !== today) { const was = C.monthOf(today); today = t; if (view === was) view = C.monthOf(t); render(); } }, 60000);
        if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
