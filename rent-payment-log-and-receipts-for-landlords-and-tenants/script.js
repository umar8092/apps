// Rent Payment Log and Receipts: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.RentCore;
    const KEY = 'rent-payment-log-and-receipts-for-landlords-and-tenants.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };

    let canSave = true, state, today = C.todayIso();
    let editing = null;                 // id of the tenancy in the form, or null for a new one
    const panel = {};                   // tenancy id -> 'pay' | 'list' | 'stmt' | 'rent' | 'out'
    const payEdit = {};                 // tenancy id -> payment id being edited
    const stmtYear = {};                // tenancy id -> year shown in Statement
    let showEnded = false;

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
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeForm(true); commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['list-msg', 'form-msg', 'set-msg'];
    const timers = {};
    function show(id, text, undoSnap, extra) {
        const box = $(id); if (!box) return;
        MSGS.forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) box.appendChild(btn('undo', 'Undo', () => { restoreSnap(undoSnap); show(id, 'Undone.'); }));
        if (extra) box.appendChild(extra);
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const M = c => C.fmtMoney(c, state.cur, state.style);
    const ten = id => state.tenancies.find(t => t.id === id);
    const dayWord = d => (d === today ? 'today' : d === C.addDays(today, -1) ? 'yesterday' : C.fmtDate(d));
    const ordinal = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
    const dueText = d => (d >= 29 ? 'the ' + ordinal(d) + ' (or the last day)' : 'the ' + ordinal(d));
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
    function field(labelText, input, err) {
        const w = el('div', 'fld'); const l = el('label', null, labelText); l.htmlFor = input.id; w.append(l, input); if (err) w.appendChild(err); return w;
    }
    function input(id, type, placeholder, extra) {
        const i = el('input'); i.id = id; i.type = type; i.autocomplete = 'off'; if (placeholder) i.placeholder = placeholder; Object.assign(i, extra || {}); return i;
    }
    function moneyInput(id, placeholder) {
        const wrap = el('div', 'inline money');
        const cur = el('span', 'unit pre cur', state.cur); cur.setAttribute('aria-hidden', 'true'); cur.hidden = !state.cur;
        const i = input(id, 'text', placeholder, { inputMode: 'decimal', maxLength: 16 });
        wrap.append(cur, i); return { wrap, i };
    }
    const errP = id => { const p = el('p', 'err'); p.id = id; p.setAttribute('role', 'alert'); return p; };

    // ---------- render ----------
    function render() {
        today = C.todayIso();
        const has = state.tenancies.length > 0;
        $('app').classList.toggle('setup', !has);
        $('month').hidden = !has; $('list').hidden = !has;
        renderMonth(); renderList();
        $('open-form').hidden = !has || editing !== null || !$('form').hidden;
        $('form-h').hidden = $('form').hidden; // the button says it when the form is folded away
        document.querySelectorAll('.cur').forEach(c => { c.textContent = state.cur; c.hidden = !state.cur; });
        $('s-cur').value = state.cur; $('s-style').value = state.style;
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('Rent summary') + '&body=' + encodeURIComponent(C.summaryText(state, today));
        preview();
    }

    function renderMonth() {
        const s = C.monthSummary(state, today), body = $('month-body'); body.textContent = '';
        $('month-h').textContent = C.fmtMonth(s.ym);
        const p = el('p', 'big');
        p.appendChild(el('strong', null, M(s.collected))); p.appendChild(document.createTextNode(' of ' + M(s.due) + ' rent for this month paid'));
        body.appendChild(p);
        if (s.due) { const b = el('div', 'bar'); const sp = el('span'); sp.style.width = Math.min(100, Math.floor(100 * s.collected / s.due)) + '%'; b.appendChild(sp); b.setAttribute('aria-hidden', 'true'); body.appendChild(b); }
        if (!s.owing.length) { body.appendChild(el('p', 'state good', 'Nobody owes rent today.')); return; }
        const ul = el('ul', 'owing');
        s.owing.forEach(o => {
            const li = el('li');
            li.appendChild(el('b', null, o.tenant + ' owes ' + M(o.owed)));
            li.appendChild(el('span', null, o.place + ', since ' + C.fmtMonth(o.from) + (o.late > 0 ? ', ' + C.plural(o.late, 'day', 'days') + ' late' : ', due today')));
            ul.appendChild(li);
        });
        body.appendChild(ul);
    }

    function renderList() {
        const on = state.tenancies.filter(t => !(t.end && t.end < today)), off = state.tenancies.filter(t => t.end && t.end < today);
        const ul = $('boxes'); ul.textContent = '';
        on.forEach(t => ul.appendChild(box(t)));
        if (!on.length) ul.appendChild(el('li', 'empty', 'Everyone has moved out. Add a new tenancy, or open the list below.'));
        $('ended-wrap').hidden = !off.length;
        $('ended-btn').textContent = (showEnded ? 'Hide' : 'Show') + ' moved out (' + off.length + ')';
        $('ended-btn').setAttribute('aria-expanded', String(showEnded));
        const ue = $('ended-boxes'); ue.textContent = ''; ue.hidden = !showEnded;
        if (showEnded) off.forEach(t => ue.appendChild(box(t)));
    }

    function box(t) {
        const lg = C.ledger(t, today), li = el('li', 'box' + (lg.owed ? ' owes' : '') + (lg.ended ? ' ended' : '')); li.dataset.id = String(t.id);
        const top = el('div', 'box-top');
        top.appendChild(el('h3', 'box-name', t.place));
        top.appendChild(el('span', 'badge ' + (lg.owed ? 'bad' : 'good'), lg.ended ? 'Moved out' : lg.owed ? 'Owes ' + M(lg.owed) : t.start > today ? 'Not moved in' : 'Paid up'));
        li.appendChild(top);
        const rentNow = C.rentFor(t, C.ymOf(today < t.start ? t.start : today));
        li.appendChild(el('p', 'box-sub', 'Tenant: ' + t.tenant + (t.landlord ? '. Landlord: ' + t.landlord : '') + '. Rent ' + M(rentNow) + ' due on ' + dueText(t.due) + ', since ' + C.fmtDateY(t.start) + '.'));
        // where things stand
        if (lg.owed) li.appendChild(el('p', 'line bad', 'Owes ' + M(lg.owed) + (lg.firstUnpaid.ym === lastDueYm(lg) ? ' for ' + C.fmtMonth(lg.firstUnpaid.ym) : ' since ' + C.fmtMonth(lg.firstUnpaid.ym)) + (lg.lateDays > 0 ? ', ' + C.plural(lg.lateDays, 'day', 'days') + ' late.' : ', due today.')));
        li.appendChild(el('p', 'line', lg.upTo ? 'Paid up to ' + C.fmtMonth(lg.upTo) + '.' : 'No month paid in full yet.'));
        if (lg.ahead && !lg.ended) li.appendChild(el('p', 'line good', M(lg.ahead) + ' paid ahead' + (lg.next && lg.next.paid ? ' towards ' + C.fmtMonth(lg.next.ym) : '') + '.'));
        if (lg.next && !lg.ended) li.appendChild(el('p', 'sub-line', 'Next: ' + C.fmtMonth(lg.next.ym) + ' rent ' + M(lg.next.amt) + (lg.next.full ? '' : ' (' + lg.next.days + ' days)') + ' due on ' + C.fmtDate(lg.next.due) + (lg.next.paid ? ', ' + M(lg.next.left) + ' still to pay' : '') + '.'));
        if (t.end) li.appendChild(el('p', 'sub-line', (t.end < today ? 'Moved out on ' : 'Moves out on ') + C.fmtDateY(t.end) + '.' + (lg.over ? ' Paid ' + M(lg.over) + ' more than the rent.' : '')));
        if (t.deposit) li.appendChild(el('p', 'sub-line', 'Deposit ' + M(t.deposit.amt) + (t.deposit.back === null ? ' held.' : ': ' + M(t.deposit.back) + ' returned' + (t.deposit.backDate ? ' on ' + C.fmtDateY(t.deposit.backDate) : '') + (t.deposit.back < t.deposit.amt ? ', ' + M(t.deposit.amt - t.deposit.back) + ' kept.' : '.'))));
        // buttons
        const p = panel[t.id];
        const rec = btn('primary', p === 'pay' ? 'Close' : 'Record a payment', () => togglePanel(t.id, 'pay'), (p === 'pay' ? 'Close the payment form for ' : 'Record a payment for ') + t.place);
        rec.classList.add('rec'); rec.setAttribute('aria-expanded', String(p === 'pay'));
        li.appendChild(rec);
        const g = el('div', 'box-btns');
        [['list', 'Payments and receipts'], ['stmt', 'Statement'], ['rent', 'Change the rent'], ['out', t.end ? 'Move-out and deposit' : 'Moved out']].forEach(([k, label]) => {
            const b = btn('mini' + (p === k ? ' on' : ''), label, () => togglePanel(t.id, k), label + ': ' + t.place); b.setAttribute('aria-expanded', String(p === k)); g.appendChild(b);
        });
        g.appendChild(btn('mini', 'Edit', () => openForm(t.id), 'Edit ' + t.place));
        li.appendChild(g);
        if (p === 'pay') li.appendChild(payForm(t, lg));
        if (p === 'list') li.appendChild(payList(t));
        if (p === 'stmt') li.appendChild(stmtPanel(t));
        if (p === 'rent') li.appendChild(rentForm(t));
        if (p === 'out') li.appendChild(outForm(t));
        return li;
    }
    const lastDueYm = lg => { const d = lg.rows.filter(r => r.isDue); return d.length ? d[d.length - 1].ym : ''; };
    function togglePanel(id, k) {
        panel[id] = panel[id] === k ? null : k; delete payEdit[id]; render();
        const b = document.querySelector('#app li[data-id="' + id + '"] .panel input, #app li[data-id="' + id + '"] .panel select, #app li[data-id="' + id + '"] .panel button');
        if (panel[id] && b) b.focus(); else focusBox(id, k === 'pay' ? '.rec' : '.mini');
    }
    function focusBox(id, sel) { const b = document.querySelector('#app li[data-id="' + id + '"] ' + sel); if (b) b.focus(); }

    // ---------- record a payment ----------
    function payForm(t, lg) {
        const f = el('form', 'panel'); f.noValidate = true;
        const editP = payEdit[t.id] ? t.payments.find(p => p.id === payEdit[t.id]) : null;
        f.appendChild(el('h4', null, editP ? 'Edit payment (receipt ' + editP.n + ')' : 'Record a payment'));
        const id = 'p' + t.id;
        const d = input(id + '-d', 'date', '', { max: today }); d.value = editP ? editP.d : today;
        const ed = errP(id + '-ed'); d.setAttribute('aria-describedby', ed.id);
        f.appendChild(field('Date paid', d, ed));
        const suggest = lg.owed || (lg.next ? lg.next.left : 0);
        const amt = moneyInput(id + '-a', 'e.g. ' + C.group(Math.floor((suggest || C.rentFor(t, C.ymOf(today))) / 100), state.style));
        if (editP) amt.i.value = (editP.amt / 100).toFixed(editP.amt % 100 ? 2 : 0);
        const ea = errP(id + '-ea'); amt.i.setAttribute('aria-describedby', ea.id);
        const aw = el('div', 'fld'); const al = el('label', null, 'Amount'); al.htmlFor = amt.i.id; aw.append(al, amt.wrap);
        if (!editP && suggest) aw.appendChild(btn('chip', (lg.owed ? 'Fill in what is owed: ' : 'Fill in the next rent: ') + M(suggest), () => { amt.i.value = (suggest / 100).toFixed(suggest % 100 ? 2 : 0); ea.textContent = ''; }));
        aw.appendChild(ea); f.appendChild(aw);
        const m = el('select'); m.id = id + '-m';
        Object.keys(C.METHODS).forEach(k => { const o = el('option', null, C.METHODS[k].charAt(0).toUpperCase() + C.METHODS[k].slice(1)); o.value = k; m.appendChild(o); });
        m.value = editP ? editP.method : (t.payments.length ? C.sortedPayments(t).slice(-1)[0].method : 'cash');
        f.appendChild(field('How was it paid?', m));
        const note = input(id + '-n', 'text', 'e.g. cheque no. 1042', { maxLength: C.LIMITS.note });
        const nw = el('div', 'opt'); nw.appendChild(field('Note', note));
        const ob = btn('link', '+ Add a note (optional)', () => { nw.hidden = false; ob.hidden = true; note.focus(); });
        if (editP && editP.note) { note.value = editP.note; ob.hidden = true; } else nw.hidden = true;
        f.append(ob, nw);
        const rb = el('div', 'row-btns');
        const sb = el('button', 'primary', editP ? 'Save changes' : 'Save payment'); sb.type = 'submit';
        rb.append(sb, btn('secondary', 'Cancel', () => togglePanel(t.id, 'pay')));
        f.appendChild(rb);
        f.addEventListener('submit', ev => {
            ev.preventDefault(); ed.textContent = ''; ea.textContent = ''; d.removeAttribute('aria-invalid'); amt.i.removeAttribute('aria-invalid');
            const x = { d: d.value, amt: C.readMoney(amt.i.value), method: m.value, note: C.cleanText(note.value, C.LIMITS.note) };
            const e = C.checkPayment(t, x, today);
            if (e.d) { ed.textContent = e.d; d.setAttribute('aria-invalid', 'true'); }
            if (e.amt) { ea.textContent = amt.i.value.trim() && Number.isNaN(x.amt) ? 'Type the amount as a number, such as 30000 or 30000.50.' : e.amt; amt.i.setAttribute('aria-invalid', 'true'); }
            if (e.d || e.amt) { (e.d ? d : amt.i).focus(); return; }
            const snap = snapshot();
            let p;
            if (editP) { Object.assign(editP, x); p = editP; } else { p = Object.assign({ id: state.nextId++, n: t.nextN++ }, x); t.payments.push(p); }
            panel[t.id] = null; delete payEdit[t.id];
            commit();
            const lg2 = C.ledger(t, today);
            show('list-msg', (editP ? 'Payment changed: ' : 'Payment saved: ') + M(x.amt) + ' ' + dayWord(x.d) + '. ' + (lg2.owed ? 'Still owes ' + M(lg2.owed) + '.' : lg2.upTo ? 'Paid up to ' + C.fmtMonth(lg2.upTo) + '.' : ''), snap,
                btn('undo', 'Receipt', () => openReceipt(t.id, p.id)));
            focusBox(t.id, '.rec');
        });
        return f;
    }

    function payList(t) {
        const w = el('div', 'panel'); w.appendChild(el('h4', null, 'Payments and receipts'));
        const ps = C.sortedPayments(t).reverse();
        if (!ps.length) { w.appendChild(el('p', 'empty', 'No payments yet. Tap "Record a payment".')); return w; }
        const cv = C.coverage(t), ul = el('ul', 'pays');
        ps.forEach(p => {
            const li = el('li');
            const tx = el('div', 'pay-text');
            tx.appendChild(el('b', null, C.fmtDateY(p.d) + ': ' + M(p.amt)));
            tx.appendChild(el('span', null, 'Receipt ' + p.n + ', ' + C.METHODS[p.method] + '. For ' + (C.coverText(cv[p.id], state.cur, state.style) || 'rent') + '.' + (p.note ? ' ' + p.note : '')));
            li.appendChild(tx);
            const b = el('div', 'pay-btns');
            b.appendChild(btn('mini', 'Receipt', () => openReceipt(t.id, p.id), 'Receipt ' + p.n));
            b.appendChild(btn('mini', 'Edit', () => { panel[t.id] = 'pay'; payEdit[t.id] = p.id; render(); focusBox(t.id, '.panel input'); }, 'Edit payment of ' + C.fmtDateY(p.d)));
            b.appendChild(btn('mini del', 'Delete', () => {
                const snap = snapshot(); t.payments = t.payments.filter(x => x.id !== p.id); commit();
                show('list-msg', 'Deleted the payment of ' + M(p.amt) + ' on ' + C.fmtDateY(p.d) + '.', snap);
            }, 'Delete payment of ' + C.fmtDateY(p.d)));
            li.appendChild(b); ul.appendChild(li);
        });
        w.appendChild(ul); return w;
    }

    function years(t) { const ys = []; for (let y = Number(today.slice(0, 4)); y >= Number(t.start.slice(0, 4)); y--) ys.push(y); return ys.length ? ys : [Number(t.start.slice(0, 4))]; }
    function stmtPanel(t) {
        const w = el('div', 'panel'); w.appendChild(el('h4', null, 'Statement'));
        const ys = years(t); if (!ys.includes(stmtYear[t.id])) stmtYear[t.id] = ys[0];
        const y = stmtYear[t.id];
        const sel = el('select'); sel.id = 's' + t.id + '-y';
        ys.forEach(v => { const o = el('option', null, String(v)); o.value = String(v); sel.appendChild(o); });
        sel.value = String(y);
        sel.addEventListener('change', () => { stmtYear[t.id] = Number(sel.value); render(); const s2 = $('s' + t.id + '-y'); if (s2) s2.focus(); });
        const yr = el('div', 'year-pick'); const yl = el('label', null, 'Year'); yl.htmlFor = sel.id; yr.append(yl, sel); w.appendChild(yr);
        w.appendChild(stmtTable(t, y));
        const g = el('div', 'tool-grid');
        g.appendChild(btn('secondary', 'Print or save as PDF', () => openStatement(t.id, y)));
        g.appendChild(btn('secondary', 'Copy statement', () => copyText(C.statementText(t, y, today, state.cur, state.style)).then(ok => show('list-msg', ok ? 'Statement copied.' : 'Your browser did not allow copying.'))));
        w.appendChild(g);
        return w;
    }
    function stmtTable(t, y) {
        // plain numbers in the cells and the currency in the headings, so the table fits a phone
        const st = C.statement(t, y, today), wrap = el('div', 'stmt'), N = c => C.fmtMoney(c, '', state.style), cur = state.cur ? ' (' + state.cur + ')' : '';
        if (!st.rows.length) { wrap.appendChild(el('p', 'empty', 'No rent due in ' + y + '.')); return wrap; }
        const tb = el('table'); const cap = el('caption', null, 'Rent for ' + y + ': ' + t.place); tb.appendChild(cap);
        const hr = el('tr'); ['Month', 'Rent' + cur, 'Paid' + cur, 'Owed' + cur].forEach(h => { const th = el('th', null, h); th.scope = 'col'; hr.appendChild(th); });
        const th = el('thead'); th.appendChild(hr); tb.appendChild(th);
        const bd = el('tbody');
        st.rows.forEach(r => {
            const tr = el('tr'); const mh = el('th', null, C.MONTHS[Number(r.ym.slice(5)) - 1].slice(0, 3)); mh.scope = 'row'; tr.appendChild(mh);
            tr.appendChild(el('td', null, N(r.amt))); tr.appendChild(el('td', null, N(r.paid)));
            tr.appendChild(el('td', r.left && r.isDue ? 'bad' : '', r.isDue ? N(r.left) : 'not due'));
            bd.appendChild(tr);
        });
        tb.appendChild(bd);
        const ft = el('tfoot'), fr = el('tr'); const fh = el('th', null, 'Total'); fh.scope = 'row'; fr.appendChild(fh);
        fr.appendChild(el('td', null, N(st.due))); fr.appendChild(el('td', null, N(st.paidTowards))); fr.appendChild(el('td', st.left ? 'bad' : '', N(st.left)));
        ft.appendChild(fr); tb.appendChild(ft);
        wrap.appendChild(tb);
        wrap.appendChild(el('p', 'sub-line', 'Received in ' + y + ': ' + M(st.received) + ' in ' + C.plural(st.payments.length, 'payment', 'payments') + '.'));
        return wrap;
    }

    // ---------- change the rent ----------
    function rentForm(t) {
        const f = el('form', 'panel'); f.noValidate = true; f.appendChild(el('h4', null, 'Change the rent'));
        const id = 'r' + t.id;
        const ms = el('select'); ms.id = id + '-m'; C.MONTHS.forEach((n, i) => { const o = el('option', null, n); o.value = String(i + 1).padStart(2, '0'); ms.appendChild(o); });
        const ys = el('select'); ys.id = id + '-y'; for (let y = Number(t.start.slice(0, 4)); y <= Number(today.slice(0, 4)) + 2; y++) { const o = el('option', null, String(y)); o.value = String(y); ys.appendChild(o); }
        const nextYm = C.addMonths(C.ymOf(today), 1) > C.ymOf(t.start) ? C.addMonths(C.ymOf(today), 1) : C.addMonths(C.ymOf(t.start), 1);
        ms.value = nextYm.slice(5); ys.value = nextYm.slice(0, 4);
        const row = el('div', 'two');
        row.append(field('From month', ms), field('Year', ys));
        f.appendChild(row);
        const amt = moneyInput(id + '-a', 'e.g. ' + C.group(Math.floor(C.rentFor(t, C.ymOf(today)) / 100), state.style));
        const er = errP(id + '-e'); amt.i.setAttribute('aria-describedby', er.id);
        const aw = el('div', 'fld'); const al = el('label', null, 'New monthly rent'); al.htmlFor = amt.i.id; aw.append(al, amt.wrap, er); f.appendChild(aw);
        if (t.rents.length > 1) {
            const ul = el('ul', 'rents'); f.appendChild(el('p', 'sub-line', 'Rent so far:'));
            t.rents.forEach(r => ul.appendChild(el('li', null, 'From ' + C.fmtMonth(r.from) + ': ' + M(r.amt))));
            f.appendChild(ul);
        }
        const rb = el('div', 'row-btns'); const sb = el('button', 'primary', 'Save the new rent'); sb.type = 'submit';
        rb.append(sb, btn('secondary', 'Cancel', () => togglePanel(t.id, 'rent'))); f.appendChild(rb);
        f.addEventListener('submit', ev => {
            ev.preventDefault(); er.textContent = '';
            const from = ys.value + '-' + ms.value, a = C.readMoney(amt.i.value);
            const e = C.checkRentChange(t, from, a);
            if (e) { er.textContent = e; amt.i.setAttribute('aria-invalid', 'true'); amt.i.focus(); return; }
            const snap = snapshot(); C.setRent(t, from, a); panel[t.id] = null; commit();
            show('list-msg', 'Rent for ' + t.place + ' is ' + M(a) + ' from ' + C.fmtMonth(from) + '.', snap);
            focusBox(t.id, '.rec');
        });
        return f;
    }

    // ---------- moved out and deposit ----------
    function outForm(t) {
        const f = el('form', 'panel'); f.noValidate = true; f.appendChild(el('h4', null, 'Move-out and deposit'));
        const id = 'o' + t.id;
        const d = input(id + '-d', 'date', '', { min: t.start }); d.value = t.end || today;
        const ee = errP(id + '-e'); d.setAttribute('aria-describedby', ee.id);
        f.appendChild(field('Last day in the home', d, ee));
        if (t.firstByDays) f.appendChild(el('p', 'hint', 'The last month is charged only for the days lived, like the first.'));
        let dep = null, depDate = null;
        if (t.deposit) {
            dep = moneyInput(id + '-dep', C.group(Math.floor(t.deposit.amt / 100), state.style));
            if (t.deposit.back !== null) dep.i.value = (t.deposit.back / 100).toFixed(t.deposit.back % 100 ? 2 : 0);
            const dw = el('div', 'fld'); const dl = el('label', null, 'Deposit returned (optional)'); dl.htmlFor = dep.i.id;
            dw.append(dl, dep.wrap, el('p', 'hint', 'Of ' + M(t.deposit.amt) + '. Leave it empty if it is still held.'));
            f.appendChild(dw);
            depDate = input(id + '-dd', 'date', ''); depDate.value = t.deposit.backDate || today;
            f.appendChild(field('Deposit returned on', depDate));
        }
        const rb = el('div', 'row-btns'); const sb = el('button', 'primary', 'Save'); sb.type = 'submit'; rb.append(sb);
        if (t.end) rb.append(btn('secondary', 'Still living there', () => { const snap = snapshot(); t.end = ''; panel[t.id] = null; commit(); show('list-msg', t.tenant + ' is living at ' + t.place + ' again.', snap); }));
        else rb.append(btn('secondary', 'Cancel', () => togglePanel(t.id, 'out')));
        f.appendChild(rb);
        f.addEventListener('submit', ev => {
            ev.preventDefault(); ee.textContent = '';
            if (!C.isIso(d.value) || d.value < t.start) { ee.textContent = 'Pick the last day, on or after the move-in day (' + C.fmtDateY(t.start) + ').'; d.focus(); return; }
            let back = null;
            if (dep && dep.i.value.trim()) {
                back = C.readMoney(dep.i.value);
                if (Number.isNaN(back) || back > t.deposit.amt) { ee.textContent = 'Type the deposit returned, up to ' + M(t.deposit.amt) + ', or leave it empty.'; dep.i.focus(); return; }
            }
            const snap = snapshot(); t.end = d.value;
            if (t.deposit) { t.deposit.back = back; t.deposit.backDate = back === null ? '' : (C.isIso(depDate.value) ? depDate.value : today); }
            panel[t.id] = null; if (t.end < today) showEnded = true; commit();
            show('list-msg', t.tenant + (t.end < today ? ' moved out on ' : ' moves out on ') + C.fmtDateY(t.end) + '.', snap);
        });
        return f;
    }

    // ---------- receipt and statement sheet ----------
    function openSheet(paper, text, title) {
        $('sheet-paper').textContent = ''; $('sheet-paper').appendChild(paper); $('sheet-msg').textContent = '';
        $('sheet').dataset.text = text; document.title = title;
        if (!$('sheet').open) $('sheet').showModal();
        $('sheet-print').focus();
    }
    function openReceipt(tid, pid) {
        const t = ten(tid), p = t && t.payments.find(x => x.id === pid); if (!p) return;
        const cv = C.coverage(t)[p.id], bal = C.balanceAfter(t, p.id);
        const paper = el('div', 'receipt');
        const h = el('h2', null, 'Rent receipt'); h.id = 'sheet-h'; paper.appendChild(h);
        const meta = el('p', 'meta'); meta.append(el('span', null, 'No. ' + p.n), el('span', null, 'Date: ' + C.fmtDateY(p.d))); paper.appendChild(meta);
        const amount = el('p', 'amount'); amount.appendChild(el('strong', null, M(p.amt))); amount.appendChild(el('span', null, C.moneyWords(p.amt, state.style))); paper.appendChild(amount);
        const dl = el('dl');
        [['Received from', t.tenant], ['For', (C.coverText(cv, state.cur, state.style) || 'rent')], ['Property', t.place], ['Paid by', C.METHODS[p.method]], ['Note', p.note],
            [bal > 0 ? 'Rent still owed' : bal < 0 ? 'Paid ahead' : 'Rent owed', bal ? M(Math.abs(bal)) : 'Nothing, all rent due is paid'], ['Received by', t.landlord]]
            .forEach(([k, v]) => { if (!v) return; const d = el('div'); d.append(el('dt', null, k), el('dd', null, v)); dl.appendChild(d); });
        paper.appendChild(dl);
        const sig = el('p', 'sig'); sig.append(el('span', null, 'Signature'), el('span', 'line-sign')); paper.appendChild(sig);
        openSheet(paper, C.receiptText(t, p, today, state.cur, state.style), 'Rent receipt ' + p.n + ' - ' + t.tenant);
    }
    function openStatement(tid, y) {
        const t = ten(tid); if (!t) return;
        const paper = el('div', 'receipt statement');
        const h = el('h2', null, 'Rent statement ' + y); h.id = 'sheet-h'; paper.appendChild(h);
        paper.appendChild(el('p', 'meta-line', t.place + '. Tenant: ' + t.tenant + (t.landlord ? '. Landlord: ' + t.landlord : '') + '. Made on ' + C.fmtDateY(today) + '.'));
        paper.appendChild(stmtTable(t, y));
        const st = C.statement(t, y, today);
        if (st.payments.length) {
            paper.appendChild(el('h3', null, 'Payments received'));
            const ul = el('ul', 'stmt-pays');
            st.payments.forEach(p => ul.appendChild(el('li', null, C.fmtDateY(p.d) + ': ' + M(p.amt) + ', ' + C.METHODS[p.method] + ', receipt ' + p.n + (p.note ? ' (' + p.note + ')' : ''))));
            paper.appendChild(ul);
        }
        openSheet(paper, C.statementText(t, y, today, state.cur, state.style), 'Rent statement ' + y + ' - ' + t.place);
    }
    function closeSheet() { if ($('sheet').open) $('sheet').close(); }

    // ---------- the tenancy form ----------
    function dueOptions() {
        const s = $('f-due'); s.textContent = '';
        for (let d = 1; d <= 31; d++) { const o = el('option', null, d >= 29 ? ordinal(d) + ' (or last day)' : ordinal(d) + ' of the month'); o.value = String(d); s.appendChild(o); }
        s.value = '1';
    }
    function readForm() {
        const depRaw = $('w-deposit').hidden ? '' : $('f-deposit').value.trim();
        return { place: C.cleanText($('f-place').value, C.LIMITS.place), tenant: C.cleanText($('f-tenant').value, C.LIMITS.name), landlord: $('w-landlord').hidden ? '' : C.cleanText($('f-landlord').value, C.LIMITS.name),
            rent: C.readMoney($('f-rent').value), due: Number($('f-due').value), start: $('f-start').value, firstByDays: !$('w-bydays').hidden && $('f-bydays').checked, deposit: depRaw === '' ? null : C.readMoney(depRaw) };
    }
    function byDaysVisible() {
        const s = $('f-start').value, show = C.isIso(s) && s.slice(8) !== '01';
        $('w-bydays').hidden = !show;
        if (show) { const ym = C.ymOf(s), dim = C.daysInMonth(ym), days = dim - Number(s.slice(8)) + 1; $('l-bydays').textContent = 'Charge the first month only for the days lived (' + days + ' of ' + dim + ' days)'; }
    }
    function preview() {
        const out = $('preview'); out.textContent = '';
        if ($('form').hidden) return;
        const x = readForm(); if (!x.place && !x.tenant && Number.isNaN(x.rent)) return;
        if (Object.keys(C.checkTenancy(x, today)).length) return;
        const t = { rents: [{ from: C.ymOf(x.start), amt: x.rent }], start: x.start, firstByDays: x.firstByDays, end: '', due: x.due };
        const ch = C.chargeFor(t, C.ymOf(x.start)); let due = C.dueDateOf(C.ymOf(x.start), x.due); if (due < x.start) due = x.start;
        out.textContent = 'First rent: ' + C.fmtMonth(C.ymOf(x.start)) + ', ' + M(ch.amt) + (ch.full ? '' : ' (' + ch.days + ' days)') + ', due on ' + C.fmtDateY(due) + '. Then ' + M(x.rent) + ' due on ' + dueText(x.due) + ' of each month.';
    }
    function clearErrors() { ['place', 'tenant', 'rent', 'due', 'start', 'deposit'].forEach(k => { $('e-' + k).textContent = ''; const f = $('f-' + k); if (f) f.removeAttribute('aria-invalid'); }); }
    function openForm(id) {
        editing = id === undefined ? null : id;
        const t = editing ? ten(editing) : null;
        $('form').hidden = false; $('open-form').hidden = true; clearErrors();
        $('f-place').value = t ? t.place : ''; $('f-tenant').value = t ? t.tenant : '';
        $('f-landlord').value = t ? t.landlord : ''; $('w-landlord').hidden = !(t && t.landlord); $('o-landlord').hidden = !$('w-landlord').hidden;
        $('f-rent').value = t ? (t.rents[0].amt / 100).toFixed(t.rents[0].amt % 100 ? 2 : 0) : '';
        $('f-due').value = t ? String(t.due) : '1';
        $('f-start').value = t ? t.start : today;
        $('f-bydays').checked = !!(t && t.firstByDays);
        $('f-deposit').value = t && t.deposit ? (t.deposit.amt / 100).toFixed(t.deposit.amt % 100 ? 2 : 0) : '';
        $('w-deposit').hidden = !(t && t.deposit); $('o-deposit').hidden = !$('w-deposit').hidden;
        $('form-h').textContent = t ? 'Edit ' + t.place : 'Add a tenancy';
        $('save').textContent = t ? 'Save changes' : 'Add the tenancy';
        $('cancel').hidden = !state.tenancies.length && !t; $('del').hidden = !t;
        $('l-rent').textContent = t && t.rents.length > 1 ? 'First monthly rent (from ' + C.fmtMonth(t.rents[0].from) + ')' : 'Monthly rent';
        byDaysVisible(); render();
        if (id !== undefined) { $('add').scrollIntoView({ block: 'start' }); $('f-place').focus({ preventScroll: true }); }
    }
    function closeForm(quiet) {
        editing = null;
        if (state.tenancies.length) { $('form').hidden = true; } else openFormQuiet();
        if (!quiet) render();
    }
    function openFormQuiet() { editing = null; $('form').hidden = false; $('form-h').textContent = 'Add a tenancy'; $('save').textContent = 'Add the tenancy'; $('del').hidden = true; $('cancel').hidden = true; if (!$('f-start').value) $('f-start').value = today; byDaysVisible(); }
    function submitForm(ev) {
        ev.preventDefault(); clearErrors();
        const x = readForm(), e = C.checkTenancy(x, today);
        if ($('f-rent').value.trim() && Number.isNaN(x.rent)) e.rent = 'Type the rent as a number, such as 30000 or 30000.50.';
        const t = editing ? ten(editing) : null;
        if (t && !e.start && t.payments.length && t.end && t.end < x.start) e.start = 'This is after the move-out day. Change the move-out first.';
        if (t && !e.start && t.rents.length > 1 && t.rents[1].from <= C.ymOf(x.start)) e.start = 'The rent changes in ' + C.fmtMonth(t.rents[1].from) + ', before this. Pick an earlier day.';
        const keys = Object.keys(e);
        if (keys.length) { keys.forEach(k => { $('e-' + k).textContent = e[k]; const f = $('f-' + k); if (f) f.setAttribute('aria-invalid', 'true'); }); const f = $('f-' + keys[0]); if (f) f.focus(); return; }
        const snap = snapshot();
        if (t) {
            Object.assign(t, { place: x.place, tenant: x.tenant, landlord: x.landlord, due: x.due, start: x.start, firstByDays: x.firstByDays });
            t.rents[0] = { from: C.ymOf(x.start), amt: x.rent };
            if (x.deposit === null) t.deposit = null;
            else t.deposit = { amt: x.deposit, back: t.deposit && t.deposit.back !== null && t.deposit.back <= x.deposit ? t.deposit.back : null, backDate: t.deposit && t.deposit.back !== null && t.deposit.back <= x.deposit ? t.deposit.backDate : '' };
        } else {
            state.tenancies.push({ id: state.nextId++, place: x.place, tenant: x.tenant, landlord: x.landlord, rents: [{ from: C.ymOf(x.start), amt: x.rent }], due: x.due, start: x.start, firstByDays: x.firstByDays, end: '',
                deposit: x.deposit === null ? null : { amt: x.deposit, back: null, backDate: '' }, payments: [], nextN: 1 });
        }
        const was = editing; editing = null; $('form').hidden = true; commit();
        show('list-msg', was ? 'Saved the changes to ' + x.place + '.' : 'Added ' + x.place + '. Tap "Record a payment" when rent comes in.', snap);
        $('list').scrollIntoView({ block: 'nearest' });
    }

    // ---------- events ----------
    function wire() {
        dueOptions();
        const cs = $('s-cur'); C.CURRENCIES.forEach(c => { const o = el('option', null, c || 'None'); o.value = c; cs.appendChild(o); });
        $('form').addEventListener('submit', submitForm);
        $('form').addEventListener('input', preview);
        $('form').addEventListener('change', preview);
        $('f-start').addEventListener('input', byDaysVisible); $('f-start').addEventListener('change', () => { byDaysVisible(); preview(); });
        $('o-landlord').addEventListener('click', () => { $('w-landlord').hidden = false; $('o-landlord').hidden = true; $('f-landlord').focus(); });
        $('o-deposit').addEventListener('click', () => { $('w-deposit').hidden = false; $('o-deposit').hidden = true; $('f-deposit').focus(); });
        $('open-form').addEventListener('click', () => { openForm(); $('f-place').focus(); });
        $('cancel').addEventListener('click', () => closeForm());
        $('del').addEventListener('click', () => {
            const t = ten(editing); if (!t) return;
            const snap = snapshot(); state.tenancies = state.tenancies.filter(x => x.id !== t.id); editing = null; closeForm(true); commit();
            show(state.tenancies.length ? 'list-msg' : 'form-msg', 'Deleted ' + t.place + ' and its payments.', snap);
        });
        $('ended-btn').addEventListener('click', () => { showEnded = !showEnded; render(); $('ended-btn').focus(); });
        // money settings
        $('s-cur').addEventListener('change', () => { state.cur = C.CURRENCIES.includes($('s-cur').value) ? $('s-cur').value : ''; commit(); });
        $('s-style').addEventListener('change', () => { state.style = $('s-style').value === 'sa' ? 'sa' : 'intl'; commit(); });
        // sheet
        $('sheet-print').addEventListener('click', () => window.print());
        $('sheet-copy').addEventListener('click', () => copyText($('sheet').dataset.text || '').then(ok => { $('sheet-msg').textContent = ok ? 'Copied. Paste it in a message or email.' : 'Your browser did not allow copying.'; }));
        $('sheet-close').addEventListener('click', closeSheet);
        $('sheet').addEventListener('close', () => { document.title = 'Rent Payment Log and Receipts for Landlords and Tenants'; });
        // backup
        $('copy').addEventListener('click', () => copyText(C.summaryText(state, today)).then(ok => show('set-msg', ok ? 'Rent summary copied.' : 'Your browser did not allow copying.')));
        $('backup').addEventListener('click', () => { download('rent-log-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1)); show('set-msg', 'Backup file saved. Keep it somewhere safe.'); });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', () => {
            const f = $('restore-file').files[0]; $('restore-file').value = '';
            if (!f) return;
            if (f.size > 5e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            f.text().then(txt => {
                let s = null; try { s = C.validate(JSON.parse(txt)); } catch (e) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app, so nothing was changed.'); return; }
                const snap = snapshot(); state = s; closeForm(true); commit(); show('set-msg', 'Backup restored.', snap);
            });
        });
        $('wipe').addEventListener('click', () => { const snap = snapshot(); state = C.emptyState(); closeForm(true); commit(); show('set-msg', 'Everything was deleted.', snap); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayIso() !== today) render(); });
        setInterval(() => { if (C.todayIso() !== today) render(); }, 60000);
    }

    state = load();
    wire();
    if (state.tenancies.length) $('form').hidden = true; else openFormQuiet();
    render(); save();
})();
