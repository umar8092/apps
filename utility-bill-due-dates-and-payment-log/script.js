// Utility Bill Due Dates and Payment Log: the page. The maths and the words are in core.js (window.BILLS).
(function () {
    'use strict';
    const C = window.BILLS, SLUG = 'utility-bill-due-dates-and-payment-log', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)',
        'NZ$': 'NZ$ (New Zealand dollar)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (riyal)', 'KWD': 'KWD (dinar)', 'R': 'R (rand)', '৳': '৳ (taka)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)',
        'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₱': '₱ (peso)', 'S$': 'S$ (Singapore dollar)', '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const KIND_NAMES = { electricity: 'Electricity', gas: 'Gas', water: 'Water', internet: 'Internet', phone: 'Mobile phone', tv: 'TV or cable', maintenance: 'Building maintenance', other: 'Other' };
    const HOW = ['Bank app', 'Card', 'Cash at the bank', 'Cash at a shop', 'Mobile wallet', 'Direct debit', 'Paid by a family member'];
    let state = C.emptyState(), t = C.today(new Date());
    let panel = {};              // account id -> { type: 'new' | 'pay' | 'edit' | 'details', entry }
    let histOpen = {};           // account id -> true when "Past bills" is opened by hand
    let flash = null, undoSnap = null, canSave = true, loadNote = '', formKind = 'other';

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (!raw) return;
        let s = null;
        try { s = C.cleanState(JSON.parse(raw)); } catch (e) { s = null; }
        if (s) state = s; else loadNote = 'Your saved bills could not be read, so the app started fresh. If you have a backup file, restore it below.';
    }
    function save() {
        if (!canSave) { $('store-warn').hidden = false; return; }
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canSave = false; $('store-warn').hidden = false; }
    }
    function change(fn, where, text) {
        const before = JSON.stringify(state);
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
        const where = flash && $(flash.where) ? flash.where : 'top-msg';
        undoSnap = null; panel = {};
        save();
        flash = { where, text: 'Undone.' };
        render();
        fillCur();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const p = (cls, text) => el('p', cls, text);
    const money = c => C.fmtMoney(c, state.cur, LOC);
    const date = (s, o) => C.fmtDate(s, t, o);
    const byId = id => state.accts.find(x => x.id === id);
    const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into a message or email.' }; render(); };
        const fallback = () => {
            const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            ta.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Use Email summary instead.', bad: true }; render(); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function setErr(id, msg) {
        const e = $(id + '-err'); if (e) e.textContent = msg || '';
        const inp = $(id); if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
        return !msg;
    }
    function showMsg(box, text, withUndo, bad) {
        if (!box) return;
        box.textContent = '';
        box.className = 'msg show' + (bad ? ' bad' : '');
        box.appendChild(document.createTextNode(text + ' '));
        if (withUndo) box.appendChild(btn('Undo', 'link inline undo', undo));
    }
    function clearMsgs() { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.className = 'msg'; }); }
    function download(name, type, text) {
        const blob = new Blob([text], { type });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function input(id, type, value, ph, extra) {
        const i = el('input'); i.id = id; i.type = type; i.autocomplete = 'off';
        if (type === 'text') { i.maxLength = 20; i.inputMode = 'decimal'; }
        if (value != null) i.value = value;
        if (ph) i.placeholder = ph;
        i.setAttribute('aria-describedby', id + '-err');
        Object.assign(i, extra || {});
        return i;
    }
    function label(forId, text) { const l = el('label', null, text); l.htmlFor = forId; return l; }
    const errP = id => { const e = p('err'); e.id = id + '-err'; e.setAttribute('role', 'alert'); return e; };
    function moneyField(box, id, lbl, value, ph) {
        box.appendChild(label(id, lbl));
        const row = el('div', 'amount-row');
        if (state.cur) row.appendChild(el('span', 'cur-tag', state.cur));
        row.appendChild(input(id, 'text', value, ph));
        box.append(row, errP(id));
    }
    function textField(box, id, lbl, value, ph, max) {
        box.append(label(id, lbl), input(id, 'text', value, ph, { maxLength: max || 40, inputMode: 'text' }), errP(id));
        return $(id) || box.querySelector('#' + id);
    }
    function dateField(box, id, lbl, value) { box.append(label(id, lbl), input(id, 'date', value), errP(id)); }
    function readDate(id, msg) { const v = $(id).value; if (!C.isDate(v)) { setErr(id, msg || 'Pick a date.'); return null; } setErr(id, ''); return v; }
    function readMoney(id, opt) {
        const r = C.parseMoney($(id).value, opt);
        if (r.error) { setErr(id, r.error); return null; }
        setErr(id, ''); return r.n;
    }
    // an optional field behind a "+ Add ... (optional)" link
    function optional(box, linkText, open, build) {
        const wrap = el('div'), link = btn(linkText, 'link', () => { wrap.hidden = false; link.hidden = true; const f = wrap.querySelector('input'); if (f) f.focus(); });
        build(wrap);
        wrap.hidden = !open; link.hidden = open;
        box.append(link, wrap);
        return wrap;
    }
    function dayOptions(sel, value) {
        sel.textContent = '';
        const o0 = el('option', null, 'Not sure or it changes'); o0.value = '0'; sel.appendChild(o0);
        for (let d = 1; d <= 31; d++) { const o = el('option', null, 'The ' + C.ord(d) + (d >= 29 ? ' (or the last day)' : '')); o.value = String(d); sel.appendChild(o); }
        sel.value = String(value || 0);
    }
    function everyOptions(sel, value) {
        sel.textContent = '';
        [[1, 'Every month'], [2, 'Every 2 months'], [3, 'Every 3 months'], [6, 'Every 6 months'], [12, 'Once a year']].forEach(([v, l]) => { const o = el('option', null, l); o.value = String(v); sel.appendChild(o); });
        sel.value = String(value || 1);
    }
    function openPanel(a, type, entry) {
        panel = {}; panel[a.id] = { type, entry: entry || null };
        render();
        const box = $('ac-' + a.id);
        if (box) {
            const f = box.querySelector('.panel input:not([type=checkbox]), .panel select');
            box.querySelector('.panel').scrollIntoView({ block: 'center', behavior: 'smooth' });
            if (f) f.focus({ preventScroll: true });
        }
    }
    const closePanel = () => { panel = {}; render(); };

    // ---------- the add form ----------
    function resetForm() {
        ['f-name', 'f-acct', 'f-payer'].forEach(id => { $(id).value = ''; setErr(id, ''); });
        $('f-day').value = '0'; $('f-every').value = '1'; $('f-auto').checked = false; formKind = 'other';
        $('f-acct-box').hidden = true; $('f-acct-open').hidden = false; $('f-payer-box').hidden = true; $('f-payer-open').hidden = false;
        document.querySelectorAll('#quick .chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
    }
    function saveForm() {
        const name = $('f-name').value.trim();
        if (!setErr('f-name', name ? '' : 'Type a name, such as Electricity or Home internet.')) { $('f-name').focus(); return; }
        if (state.accts.some(x => x.name.toLowerCase() === name.toLowerCase() && !x.closed)) {
            setErr('f-name', 'You already have a bill called ' + name + '. Give this one a different name, such as ' + name + ' 2 or ' + name + ' flat.'); $('f-name').focus(); return;
        }
        const a = { id: newId('a'), name, kind: formKind, every: +$('f-every').value, day: +$('f-day').value, acct: $('f-acct').value.trim(), payer: $('f-payer').value.trim(),
            auto: $('f-auto').checked, closed: false, entries: [] };
        state.accts.push(a);
        save();
        undoSnap = null;
        resetForm();
        flash = { where: 'am-' + a.id, text: 'Added ' + a.name + '. Type in the current bill below, or later when it comes.' };
        openPanel(a, 'new');
    }

    // ---------- panels inside a bill's box ----------
    function panelNew(a, box, e) {
        const pre = 'nb-' + a.id, last = C.lastBill(a), editing = !!e;
        box.appendChild(el('h4', null, editing ? 'Edit the bill due ' + date(e.due, { year: true }) : 'Type in the new bill'));
        moneyField(box, pre + '-a', 'Amount on the bill', editing ? C.moneyInput(e.amt) : '', 'e.g. 3499');
        if (!editing && last) {
            const row = el('div', 'chip-row');
            row.appendChild(btn('Same as last bill: ' + money(last.amt), 'chip', () => { $(pre + '-a').value = C.moneyInput(last.amt); setErr(pre + '-a', ''); $(pre + '-d').focus(); }));
            box.appendChild(row);
        }
        dateField(box, pre + '-d', 'Due date', editing ? e.due : (C.nextDue(a, t) || ''));
        box.appendChild(p('hint', editing ? 'Printed on the bill.' : C.nextDue(a, t) ? 'Filled in from ' + (last ? 'the last bill' : 'the usual due day') + '. Check it against the bill.' : 'Printed on the bill, often as "due date" or "pay by".'));
        optional(box, '+ Add the amount after the due date (optional)', editing && e.late > 0, w => {
            moneyField(w, pre + '-l', 'Amount if paid after the due date', editing && e.late ? C.moneyInput(e.late) : '', 'e.g. 3700');
            w.appendChild(p('hint', 'Some bills show a higher "payable after due date" amount. Leave it empty if yours does not.'));
        });
        let cb = null, payBox = null;
        if (!editing) {
            const lab = el('label', 'check'); cb = input(pre + '-paid', 'checkbox'); cb.removeAttribute('aria-describedby');
            lab.append(cb, el('span', null, 'I have already paid it'));
            box.appendChild(lab);
            payBox = el('div');
            payFields(payBox, pre, null, t);
            payBox.hidden = true;
            box.appendChild(payBox);
            cb.addEventListener('change', () => { payBox.hidden = !cb.checked; });
        } else if (e.pays.length) {
            box.appendChild(el('h4', null, 'Payments on this bill'));
            const ul = el('ul', 'plist');
            C.sortBy(e.pays, 'on').forEach(py => {
                const li = el('li'), l = el('div');
                l.append(p('pay-n', money(py.amt) + ' on ' + date(py.on, { year: true })), p('pay-x', [py.how, py.ref ? 'ref ' + py.ref : ''].filter(Boolean).join(' · ') || 'No details'));
                li.append(l, btn('Remove', 'secondary small', () => { panel = {}; change(() => { e.pays = e.pays.filter(x => x !== py); }, 'am-' + a.id, 'Removed the payment of ' + money(py.amt) + '.'); }, 'Remove the payment of ' + money(py.amt) + ' on ' + date(py.on)));
                ul.appendChild(li);
            });
            box.appendChild(ul);
        }
        const row = el('div', 'row-btns');
        row.append(btn(editing ? 'Save changes' : 'Save bill', 'primary', () => {
            const amt = readMoney(pre + '-a', { blank: 'Type the amount on the bill, such as 3499. Type 0 if a credit covers it.' }), due = readDate(pre + '-d', 'Pick the due date.');
            let late = 0;
            const lf = $(pre + '-l');
            if (lf && lf.closest('div[hidden]') == null && lf.value.trim()) { late = readMoney(pre + '-l'); if (late == null) return; if (amt != null && late <= amt) { setErr(pre + '-l', 'This must be more than the amount on the bill (' + money(amt) + ').'); return; } }
            else if (lf) setErr(pre + '-l', '');
            if (amt == null || !due) return;
            if (!editing && a.entries.some(x => x.due === due)) { setErr(pre + '-d', 'There is already a ' + a.name + ' bill due on ' + date(due, { year: true }) + '. Use Edit in Past bills to change it.'); return; }
            if (editing && a.entries.some(x => x !== e && x.due === due)) { setErr(pre + '-d', 'Another bill is already due on that day.'); return; }
            let pay = null;
            if (cb && cb.checked && amt > 0) { pay = readPay(pre, on => late && on > due ? late : amt); if (!pay) return; }
            panel = {};
            if (editing) change(() => { e.amt = amt; e.due = due; e.late = late; a.entries = C.sortBy(a.entries, 'due'); }, 'am-' + a.id, 'Saved.');
            else change(() => {
                const ent = { id: newId('e'), due, amt, late, pays: pay ? [pay] : [] };
                a.entries.push(ent); a.entries = C.sortBy(a.entries, 'due');
            }, 'am-' + a.id, amt === 0 ? 'Saved: nothing to pay on this bill.' : pay ? 'Saved and marked as paid.' : 'Saved. Tap Paid when you pay it.');
        }), btn('Cancel', 'secondary', closePanel));
        box.appendChild(row);
        if (editing) box.appendChild(btn('Delete this bill', 'link danger-t', () => { panel = {}; change(() => { a.entries = a.entries.filter(x => x !== e); }, 'am-' + a.id, 'Deleted the bill due ' + date(e.due, { year: true }) + '.'); }));
    }
    function payFields(box, pre, amount, on) {
        if (amount != null) moneyField(box, pre + '-pa', 'Amount paid', C.moneyInput(amount));
        dateField(box, pre + '-po', 'Paid on', on);
        const hi = textField(box, pre + '-ph', 'How you paid (optional)', '', 'e.g. Bank app');
        if (hi) hi.setAttribute('list', 'how-list');
        optional(box, '+ Add a reference or receipt number (optional)', false, w => {
            textField(w, pre + '-pr', 'Reference or receipt number', '', 'e.g. TXN 48120931');
            w.appendChild(p('hint', 'The transaction ID from the bank app or the stamp number on the receipt. Proof that you paid.'));
        });
    }
    // fullAmt is the amount when there is no "Amount paid" field: a number, or a function of the day paid
    function readPay(pre, fullAmt) {
        let amt = null;
        if ($(pre + '-pa')) { amt = readMoney(pre + '-pa', { positive: true, zero: 'Type the amount you paid.' }); if (amt == null) return null; }
        const on = readDate(pre + '-po', 'Pick the day you paid.');
        if (!on) return null;
        if (on > t) { setErr(pre + '-po', 'That date is in the future. Pick today or an earlier day.'); return null; }
        if (amt == null) amt = typeof fullAmt === 'function' ? fullAmt(on) : fullAmt;
        if (!(amt > 0)) return null;
        return { id: newId('p'), on, amt, how: $(pre + '-ph').value.trim().slice(0, 40), ref: $(pre + '-pr') ? $(pre + '-pr').value.trim().slice(0, 40) : '' };
    }
    function panelPay(a, box, e) {
        const pre = 'py-' + a.id, s = C.entryState(e, t);
        box.appendChild(el('h4', null, 'Pay the ' + a.name + ' bill due ' + date(e.due)));
        if (s.paid) box.appendChild(p('hint', 'Already paid ' + money(s.paid) + ' of ' + money(s.need) + '. ' + money(s.left) + ' is left.'));
        if (s.lateApplies) box.appendChild(p('hint', 'The due date has passed, so the bill asks for the late amount: ' + money(e.late) + '.'));
        payFields(box, pre, s.left, t);
        box.appendChild(p('hint', 'Paid less? Type what you paid; the rest stays to pay.'));
        const row = el('div', 'row-btns');
        row.append(btn('Save payment', 'primary', () => {
            const pay = readPay(pre, s.left);
            if (!pay) return;
            panel = {};
            change(() => { e.pays.push(pay); e.pays = C.sortBy(e.pays, 'on'); }, 'am-' + a.id, (() => {
                const after = C.entryState(Object.assign({}, e, { pays: e.pays.concat([pay]) }), t);
                return after.left ? 'Saved ' + money(pay.amt) + '. ' + money(after.left) + ' is still to pay.' : after.extra ? 'Paid. That is ' + money(after.extra) + ' more than the bill; it may show as a credit on the next one.' : 'Paid. ' + a.name + ' is done until the next bill.';
            })());
        }), btn('Cancel', 'secondary', closePanel));
        box.appendChild(row);
    }
    function panelDetails(a, box) {
        const pre = 'dt-' + a.id;
        box.appendChild(el('h4', null, 'Edit details'));
        textField(box, pre + '-n', 'Name of the bill', a.name, null, 50);
        box.appendChild(label(pre + '-k', 'Type of bill'));
        const ks = el('select'); ks.id = pre + '-k';
        Object.keys(KIND_NAMES).forEach(k => { const o = el('option', null, KIND_NAMES[k]); o.value = k; ks.appendChild(o); }); ks.value = a.kind;
        box.appendChild(ks);
        const g = el('div', 'two'), f1 = el('div', 'field'), f2 = el('div', 'field');
        const ds = el('select'); ds.id = pre + '-d'; dayOptions(ds, a.day); f1.append(label(pre + '-d', 'Usually due on'), ds);
        const es = el('select'); es.id = pre + '-e'; everyOptions(es, a.every); f2.append(label(pre + '-e', 'A new bill comes'), es);
        g.append(f1, f2); box.appendChild(g);
        const lab = el('label', 'check'), cb = el('input'); cb.type = 'checkbox'; cb.id = pre + '-au'; cb.checked = a.auto;
        lab.append(cb, el('span', null, 'Paid automatically (direct debit or auto-pay)')); box.appendChild(lab);
        textField(box, pre + '-ac', 'Account or customer number (optional)', a.acct, null, 40);
        textField(box, pre + '-py', 'Who pays it (optional)', a.payer, null, 40);
        const row = el('div', 'row-btns');
        row.append(btn('Save', 'primary', () => {
            const n = $(pre + '-n').value.trim();
            if (!setErr(pre + '-n', n ? '' : 'Type a name.')) return;
            if (state.accts.some(x => x !== a && !x.closed && x.name.toLowerCase() === n.toLowerCase())) { setErr(pre + '-n', 'Another bill already has that name.'); return; }
            panel = {};
            change(() => { a.name = n; a.kind = ks.value; a.day = +ds.value; a.every = +es.value; a.auto = cb.checked; a.acct = $(pre + '-ac').value.trim(); a.payer = $(pre + '-py').value.trim(); }, 'am-' + a.id, 'Saved.');
        }), btn('Cancel', 'secondary', closePanel));
        box.appendChild(row);
    }

    // ---------- words for one bill ----------
    function entryLine(a, e) {
        const s = C.entryState(e, t), bits = [];
        if (s.st === 'nothing') bits.push('Nothing to pay');
        else if (s.left === 0) {
            const last = s.pays[s.pays.length - 1];
            bits.push('Paid ' + (s.paidOn === t ? 'today' : date(s.paidOn, { year: true })) + (s.pays.length > 1 ? ' (in ' + s.pays.length + ' parts)' : ''));
            if (last.how) bits.push(last.how);
            if (last.ref) bits.push('ref ' + last.ref);
            if (!s.onTime) bits.push('after the due date');
        } else if (s.paid) bits.push('Part paid: ' + money(s.paid) + ', ' + money(s.left) + ' left');
        else if (e.due < t) bits.push(a.auto ? 'Auto-pay: check it was taken' : 'Overdue by ' + plural(C.daysBetween(e.due, t), 'day', 'days'));
        else if (e.due === t) bits.push('Due today');
        else bits.push('Due ' + C.rel(e.due, t));
        return { text: bits.join(' · '), cls: s.st === 'nothing' || s.left === 0 ? 'good' : e.due < t && !a.auto ? 'bad' : e.due <= t ? 'warn' : '' };
    }
    function acctText(a) {
        const fm = c => C.fmtMoney(c, state.cur, 'en-US'), L = [a.name + (a.acct ? ' (account ' + a.acct + ')' : '')];
        if (a.payer) L.push('Paid by ' + a.payer);
        const es = C.sortBy(a.entries, 'due').reverse();
        if (!es.length) L.push('No bills typed in yet.');
        es.forEach(e => {
            const s = C.entryState(e, t), ln = entryLine(a, e);
            L.push('- Due ' + date(e.due, { year: true }) + ': ' + fm(s.need) + '. ' + ln.text);
        });
        return L.join('\n');
    }

    // ---------- one bill box ----------
    const ST = { overdue: ['Overdue', 'bad'], today: ['Due today', 'warn'], due: ['To pay', ''], part: ['Part paid', 'warn'], auto: ['Auto-pay', ''], autocheck: ['Check auto-pay', 'warn'],
        expected: ['Bill expected', 'warn'], paid: ['Paid', 'good'], nothing: ['Nothing to pay', 'good'], none: ['No bill yet', 'muted'], closed: ['Stopped', 'muted'] };
    function acctBox(a) {
        const x = C.analyse(a, t), box = el('article', 'acct is-' + x.st), mid = 'am-' + a.id;
        box.id = 'ac-' + a.id;
        const top = el('div', 'a-top');
        top.append(el('h3', 'a-name', a.name), el('span', 'tag', KIND_NAMES[a.kind]));
        const st = ST[x.st];
        top.appendChild(el('span', 'tag st ' + st[1], st[0]));
        box.appendChild(top);
        const sub = [C.everyWords(a.every) + (a.day ? ', usually due on the ' + C.ord(a.day) : '')];
        if (a.auto) sub.push('paid automatically');
        if (a.acct) sub.push('account ' + a.acct);
        if (a.payer) sub.push('paid by ' + a.payer);
        box.appendChild(p('a-sub', sub.join(' · ')));

        // what to do now
        const act = el('div', 'act is-' + x.st), e = x.firstOpen;
        if (a.closed) {
            act.appendChild(p('a-big', 'Stopped. No new bills are expected.'));
        } else if (e) {
            const s = x.s;
            const res = el('div', 'res');
            res.appendChild(p('r-label', s.paid ? 'Still to pay' : 'Amount due'));
            res.appendChild(p('r-big', money(s.left)));
            act.appendChild(res);
            let line;
            if (a.auto && !s.partial) line = e.due < t ? 'Was due ' + date(e.due) + ' (' + C.rel(e.due, t) + '). Check your bank that it was taken.' : 'Will be taken automatically on ' + date(e.due) + ' (' + C.rel(e.due, t) + ').';
            else if (e.due < t) line = 'Overdue: was due ' + date(e.due) + ' (' + C.rel(e.due, t) + '). Pay it as soon as you can.';
            else if (e.due === t) line = 'Due today, ' + date(e.due) + '.';
            else line = 'Due ' + date(e.due) + ' (' + C.rel(e.due, t) + ').';
            act.appendChild(p('a-big', line));
            if (s.paid) act.appendChild(p('a-note', 'Paid ' + money(s.paid) + ' of ' + money(s.need) + ' so far.'));
            if (e.late && !s.lateApplies && e.due >= t) act.appendChild(p('a-note', 'After the due date it becomes ' + money(e.late) + '.'));
            if (s.lateApplies) act.appendChild(p('a-note', 'The late amount ' + money(e.late) + ' applies (the bill was ' + money(e.amt) + ').'));
            if (x.open.length > 1) act.appendChild(p('a-note', plural(x.open.length - 1, 'more bill', 'more bills') + ' unpaid, see Past bills.'));
            const cmp = C.compare(a, e);
            if (cmp) act.appendChild(p('cmp' + (cmp.pct >= 20 ? ' up' : cmp.pct <= -10 ? ' down' : ''), C.compareWords(cmp, t) + ' (' + money(cmp.base.amt) + ')'));
            const bs = el('div', 'row-btns');
            if (a.auto && !s.partial && e.due <= t) bs.appendChild(btn('It was taken', 'primary', () => change(() => { e.pays.push({ id: newId('p'), on: e.due, amt: s.left, how: 'Auto-pay', ref: '' }); }, mid, 'Marked as taken by auto-pay on ' + date(e.due) + '.')));
            bs.appendChild(btn(a.auto && !s.partial && e.due <= t ? 'Paid another way' : 'Paid', a.auto && !s.partial && e.due <= t ? 'secondary' : 'primary', () => openPanel(a, 'pay', e.id), 'Paid the ' + a.name + ' bill of ' + money(s.left)));
            act.appendChild(bs);
        } else {
            const last = x.last;
            if (last) {
                const ls = C.entryState(last, t);
                const res = el('div', 'res');
                res.appendChild(p('r-label', 'Last bill'));
                res.appendChild(p('r-big', money(ls.need)));
                act.appendChild(res);
                act.appendChild(p('a-big', ls.st === 'nothing' ? 'Nothing to pay on the bill due ' + date(last.due) + '.' : 'Paid ' + (ls.paidOn === t ? 'today' : date(ls.paidOn)) + (ls.onTime ? '' : ', after the due date') + '.'));
                const lp = ls.pays[ls.pays.length - 1];
                if (lp && (lp.how || lp.ref)) act.appendChild(p('a-note', [lp.how, lp.ref ? 'ref ' + lp.ref : ''].filter(Boolean).join(' · ')));
                const cmp = C.compare(a, last);
                if (cmp) act.appendChild(p('cmp' + (cmp.pct >= 20 ? ' up' : cmp.pct <= -10 ? ' down' : ''), C.compareWords(cmp, t) + ' (' + money(cmp.base.amt) + ')'));
            }
            if (x.next) act.appendChild(p(last ? 'a-note' : 'a-big', (x.next < t ? 'The next bill was expected around ' : 'Next bill expected around ') + date(x.next) + ' (' + C.rel(x.next, t) + ').'));
            else if (!last) act.appendChild(p('a-big', 'No bill typed in yet.'));
            const bs = el('div', 'row-btns');
            bs.appendChild(btn('Type in the new bill', x.st === 'expected' || !last ? 'primary' : 'secondary', () => openPanel(a, 'new')));
            act.appendChild(bs);
        }
        box.appendChild(act);
        box.appendChild(Object.assign(el('div', 'msg'), { id: mid, role: 'status' }));
        const pnl = panel[a.id];
        if (pnl && (pnl.type === 'new' || pnl.type === 'pay')) box.appendChild(panelEl(a, pnl));

        // past bills
        if (x.es.length) {
            const det = el('details', 'pays');
            det.open = histOpen[a.id] != null ? histOpen[a.id] : !!(pnl && pnl.type === 'edit');
            det.addEventListener('toggle', () => { histOpen[a.id] = det.open; });
            det.appendChild(el('summary', null, 'Past bills (' + x.es.length + ')'));
            const recent = x.es.slice(-12), tot = recent.reduce((s, e2) => s + C.entryState(e2, t).need, 0);
            if (recent.length > 1) det.appendChild(p('stats', 'Last ' + recent.length + ' bills: ' + money(tot) + ' in total, ' + money(Math.round(tot / recent.length)) + ' on average.'));
            const ul = el('ul', 'pay-list');
            x.es.slice().reverse().forEach(e2 => {
                if (pnl && pnl.type === 'edit' && pnl.entry === e2.id) { const li = el('li', 'pay editing'); li.appendChild(panelEl(a, pnl, true)); ul.appendChild(li); return; }
                const s2 = C.entryState(e2, t), ln = entryLine(a, e2), li = el('li', 'pay' + (ln.cls === 'bad' ? ' is-late' : ''));
                const l = el('div', 'pay-l');
                l.appendChild(p('pay-n', 'Due ' + date(e2.due, { year: true })));
                l.appendChild(p('pay-s ' + ln.cls, ln.text));
                const cmp = C.compare(a, e2);
                if (cmp) l.appendChild(p('pay-x', C.compareWords(cmp, t)));
                const r = el('div', 'pay-r');
                r.appendChild(p('pay-a', money(s2.need)));
                const bs = el('div', 'pay-b');
                if (s2.left > 0 && e2 !== e) bs.appendChild(btn('Paid', 'primary small', () => openPanel(a, 'pay', e2.id), 'Paid the bill due ' + date(e2.due)));
                bs.appendChild(btn('Edit', 'secondary small', () => { histOpen[a.id] = true; openPanel(a, 'edit', e2.id); }, 'Edit the bill due ' + date(e2.due, { year: true })));
                r.appendChild(bs);
                li.append(l, r); ul.appendChild(li);
            });
            det.appendChild(ul);
            box.appendChild(det);
        }

        // more
        const more = el('div', 'l-btns');
        more.append(btn('Edit details', 'secondary', () => panel[a.id] && panel[a.id].type === 'details' ? closePanel() : openPanel(a, 'details')), btn('Copy', 'secondary', () => copyText(acctText(a), mid)));
        if (a.closed) more.appendChild(btn('Start again', 'secondary', () => change(() => { a.closed = false; }, 'top-msg', a.name + ' is back in your bills.')));
        else more.appendChild(btn('Stop this bill', 'secondary', () => { panel = {}; change(() => { a.closed = true; }, 'top-msg', a.name + ' is stopped and moved to "Stopped bills". Its history is kept.'); }));
        more.appendChild(btn('Delete', 'secondary danger-t', () => { panel = {}; change(() => { state.accts = state.accts.filter(y => y !== a); }, 'top-msg', 'Deleted ' + a.name + ' and its history.'); }, 'Delete ' + a.name));
        box.appendChild(more);
        if (pnl && pnl.type === 'details') box.appendChild(panelEl(a, pnl));
        return box;
    }
    function panelEl(a, pnl, inList) {
        const pb = el('div', inList ? 'panel in-list' : 'panel');
        const e = pnl.entry ? a.entries.find(x => x.id === pnl.entry) : null;
        if (pnl.type === 'new') panelNew(a, pb, null);
        else if (pnl.type === 'edit' && e) panelNew(a, pb, e);
        else if (pnl.type === 'pay' && e) panelPay(a, pb, e);
        else if (pnl.type === 'details') panelDetails(a, pb);
        return pb;
    }

    // ---------- the totals at the top ----------
    function renderSum() {
        const s = C.summary(state.accts, t), body = $('sum-body');
        body.textContent = '';
        s.overdue.list.forEach(r => body.appendChild(p('alert bad', 'Overdue: ' + r.a.name + ' ' + money(r.s.left) + ', was due ' + date(r.e.due) + ' (' + C.rel(r.e.due, t) + ').')));
        s.autoCheck.forEach(r => body.appendChild(p('alert warn', 'Check that ' + r.a.name + ' ' + money(r.s.left) + ' was taken by auto-pay on ' + date(r.e.due) + '.')));
        const today = s.rows.filter(r => r.e.due === t);
        if (today.length) body.appendChild(p('alert warn', 'Due today: ' + today.map(r => r.a.name + ' ' + money(r.s.left)).join(', ') + '.'));
        const g = el('div', 'tiles');
        const tile = (lab, val, note, cls) => { const d = el('div', 'tile' + (cls ? ' ' + cls : '')); d.append(p('t-l', lab), p('t-big', val), p('t-n', note)); g.appendChild(d); };
        const ml = s.monthLeft.list.length, od = s.overdue.list.length;
        tile('Still to pay by ' + date(C.monthEnd(t), { noDay: true }), money(s.monthLeft.sum), ml ? plural(ml, 'bill', 'bills') + (od ? ', overdue included' : '') : 'Nothing left to pay this month', 'main');
        tile('Due in the next 7 days', money(s.soon.sum), s.soon.list.length ? plural(s.soon.list.length, 'bill', 'bills') : 'Nothing due');
        tile('Paid in ' + C.monthWords(s.month, t), money(s.paidMonth), s.paidN ? plural(s.paidN, 'payment', 'payments') : 'Nothing paid yet');
        body.appendChild(g);

        if (s.rows.length) {
            body.appendChild(el('h3', null, 'To pay'));
            const ul = el('ul', 'next');
            s.rows.forEach(r => {
                const auto = r.a.auto && !r.s.partial;
                const li = el('li', 'nx' + (r.e.due < t && !auto ? ' is-late' : r.e.due <= t ? ' is-today' : ''));
                const l = el('div', 'nx-l');
                l.append(p('nx-d', r.a.name), p('nx-w', 'Due ' + date(r.e.due) + ' · ' + (r.e.due < t ? (auto ? 'check auto-pay' : 'overdue, ' + C.rel(r.e.due, t)) : C.rel(r.e.due, t)) + (auto && r.e.due >= t ? ' · auto-pay' : '') + (r.a.payer ? ' · ' + r.a.payer : '')));
                const rt = el('div', 'nx-r');
                rt.append(p('nx-a', money(r.s.left)), btn('Paid', 'primary small', () => openPanel(r.a, 'pay', r.e.id), 'Paid the ' + r.a.name + ' bill of ' + money(r.s.left) + ' due ' + date(r.e.due)));
                li.append(l, rt); ul.appendChild(li);
            });
            body.appendChild(ul);
        } else if (!s.notIn.length) body.appendChild(p('alert info', 'All bills are paid. Type in each new bill when it comes.'));
        if (s.notIn.length) {
            body.appendChild(el('h3', null, 'Bills not in yet'));
            const ul = el('ul', 'nin');
            s.notIn.forEach(n => {
                const li = el('li', 'nx'), l = el('div', 'nx-l');
                l.append(p('nx-d', n.a.name), p('nx-w', (n.next < t ? 'Was expected around ' : 'Expected around ') + date(n.next) + ' (' + C.rel(n.next, t) + ')'));
                li.append(l, el('div', 'nx-r'));
                li.lastChild.appendChild(btn('Type it in', 'secondary small', () => openPanel(n.a, 'new'), 'Type in the new ' + n.a.name + ' bill'));
                ul.appendChild(li);
            });
            body.appendChild(ul);
        }
        const pm = C.paidByMonth(state.accts, t, 12);
        if (pm.some(m => m.n)) {
            const d = el('details', 'months');
            d.appendChild(el('summary', null, 'Paid per month (last 12 months)'));
            const list = el('ul', 'per');
            pm.forEach(m => { const li = el('li'); li.append(el('span', null, C.monthWords(m.month, t) + ' · ' + plural(m.n, 'payment', 'payments')), el('b', null, money(m.sum))); list.appendChild(li); });
            d.appendChild(list); body.appendChild(d);
        }
        const acts = el('div', 'sum-btns');
        acts.append(btn('Copy summary', 'secondary', () => copyText(C.summaryText(state.accts, t, state.cur), 'sum-msg')),
            btn('Email summary', 'secondary', () => { const m = el('a'); m.href = 'mailto:?subject=' + encodeURIComponent('Our bills') + '&body=' + encodeURIComponent(C.summaryText(state.accts, t, state.cur)); m.click(); }));
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        if (C.ics(state.accts, t, state.cur, stamp).count) acts.appendChild(btn('Add due dates to calendar', 'secondary', () => {
            const f = C.ics(state.accts, t, state.cur, stamp);
            download('bill-due-dates.ics', 'text/calendar', f.text);
            flash = { where: 'sum-msg', text: 'Saved a calendar file with ' + plural(f.count, 'due date', 'due dates') + ' and a reminder 2 days before each. Open it to add them to your calendar.' }; render();
        }));
        body.appendChild(acts);
    }

    // ---------- the page ----------
    const RANK = { overdue: 0, autocheck: 1, today: 2, part: 3, due: 4, auto: 4, expected: 5, none: 6, paid: 7, nothing: 7 };
    function render() {
        t = C.today(new Date());
        const active = state.accts.filter(a => !a.closed), stopped = state.accts.filter(a => a.closed);
        const info = new Map(active.map(a => [a, C.analyse(a, t)]));
        const key = a => { const x = info.get(a); return x.firstOpen ? x.firstOpen.due : x.next || '9999'; };
        active.sort((a, b) => RANK[info.get(a).st] - RANK[info.get(b).st] || key(a).localeCompare(key(b)));
        $('intro').hidden = state.accts.length > 0;
        $('sum').hidden = !active.length;
        if (active.length) renderSum();
        const list = $('a-list'); list.textContent = '';
        active.forEach(a => list.appendChild(acctBox(a)));
        $('accts').hidden = !active.length;
        const dl = $('done-list'); dl.textContent = '';
        stopped.forEach(a => dl.appendChild(acctBox(a)));
        $('done-wrap').hidden = !stopped.length;
        $('done-s').textContent = 'Stopped bills (' + stopped.length + ')';
        $('add-h').textContent = state.accts.length ? 'Add another bill' : 'Add a bill';
        $('restore-first').hidden = state.accts.length > 0;
        $('del-all').disabled = !state.accts.length;
        clearMsgs();
        if (loadNote) showMsg($('top-msg'), loadNote, false, true);
        if (flash) {
            let box = $(flash.where);
            if (!box) box = $('top-msg');
            showMsg(box, flash.text, flash.undo, flash.bad);
            if (stopped.some(a => 'am-' + a.id === flash.where)) $('done-d').open = true;
            flash = null;
        }
    }
    function fillCur() {
        const s = $('cur'); s.textContent = '';
        const names = Object.assign({}, CUR_NAMES);
        if (!(state.cur in names)) names[state.cur] = state.cur;
        Object.keys(names).forEach(k => { const o = el('option', null, names[k]); o.value = k; s.appendChild(o); });
        s.value = state.cur;
    }

    // ---------- start ----------
    load();
    if (!canSave) $('store-warn').hidden = false;
    HOW.forEach(x => { const o = el('option'); o.value = x; $('how-list').appendChild(o); });
    fillCur();
    dayOptions($('f-day'), 0);
    document.querySelectorAll('#quick .chip').forEach(c => c.addEventListener('click', () => {
        const prev = KIND_NAMES[formKind], cur = $('f-name').value.trim();
        formKind = c.dataset.kind;
        if (!cur || Object.values(KIND_NAMES).includes(cur) || cur === prev) $('f-name').value = formKind === 'other' ? '' : KIND_NAMES[formKind];
        $('f-every').value = formKind === 'maintenance' || formKind === 'other' ? $('f-every').value : '1';
        document.querySelectorAll('#quick .chip').forEach(x => x.setAttribute('aria-pressed', x === c ? 'true' : 'false'));
        setErr('f-name', '');
        $('f-name').focus();
    }));
    $('f-name').addEventListener('input', () => setErr('f-name', ''));
    $('f-acct-open').addEventListener('click', () => { $('f-acct-box').hidden = false; $('f-acct-open').hidden = true; $('f-acct').focus(); });
    $('f-payer-open').addEventListener('click', () => { $('f-payer-box').hidden = false; $('f-payer-open').hidden = true; $('f-payer').focus(); });
    $('f-save').addEventListener('click', saveForm);
    $('add').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); saveForm(); } });
    // Enter inside a bill's panel presses its main button
    document.addEventListener('keydown', e => {
        if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'checkbox') return;
        const pnl = e.target.closest('.panel'); if (!pnl) return;
        const b = pnl.querySelector('.row-btns .primary'); if (b) { e.preventDefault(); b.click(); }
    });
    $('cur').addEventListener('change', () => { const v = $('cur').value; state.cur = v; save(); flash = { where: 'tools-msg', text: v ? 'Amounts now show ' + v + '.' : 'Amounts now show plain numbers.' }; render(); });
    $('backup').addEventListener('click', () => {
        if (!state.accts.length) { flash = { where: 'tools-msg', text: 'Nothing to back up yet.' }; render(); return; }
        download('bills-backup-' + t + '.json', 'application/json', JSON.stringify(Object.assign({ app: SLUG }, state), null, 1));
        flash = { where: 'tools-msg', text: 'Saved the backup file. Keep it somewhere safe, such as your email or cloud drive.' }; render();
    });
    const pick = () => { $('restore-file').value = ''; $('restore-file').click(); };
    $('restore').addEventListener('click', pick);
    $('restore-first').addEventListener('click', pick);
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; if (!f) return;
        const where = state.accts.length ? 'tools-msg' : 'add-msg';
        if (f.size > 5000000) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const r = new FileReader();
        r.onload = () => {
            let s = null; try { s = C.cleanState(JSON.parse(r.result)); } catch (e) { s = null; }
            if (!s || !s.accts.length) { flash = { where, text: 'That file is not a backup from this app, or it has no bills in it.', bad: true }; render(); return; }
            loadNote = ''; panel = {};
            change(() => { state = s; }, 'tools-msg', 'Restored ' + plural(s.accts.length, 'bill', 'bills') + '.');
            fillCur();
        };
        r.onerror = () => { flash = { where, text: 'Could not read that file.', bad: true }; render(); };
        r.readAsText(f);
    });
    $('del-all').addEventListener('click', () => { panel = {}; loadNote = ''; change(() => { state = Object.assign(C.emptyState(), { cur: state.cur }); }, 'tools-msg', 'Deleted everything.'); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && C.today(new Date()) !== t && !Object.keys(panel).length) render(); });
    resetForm();
    render();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
