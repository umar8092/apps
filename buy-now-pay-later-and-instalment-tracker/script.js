// Buy Now Pay Later and Instalment Tracker: the page. The maths and the words are in core.js (window.BNPL).
(function () {
    'use strict';
    const C = window.BNPL, SLUG = 'buy-now-pay-later-and-instalment-tracker', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)',
        'NZ$': 'NZ$ (New Zealand dollar)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (riyal)', 'KWD': 'KWD (dinar)', 'R': 'R (rand)', '৳': '৳ (taka)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)',
        'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₱': '₱ (peso)', 'S$': 'S$ (Singapore dollar)', '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const PROVIDERS = ['Klarna', 'Afterpay', 'Clearpay', 'Affirm', 'Zip', 'PayPal Pay in 4', 'PayPal Pay in 3', 'Sezzle', 'Tabby', 'Tamara', 'Postpay', 'Atome', 'Simpl', 'LazyPay',
        'Bank 0% plan', 'Credit card instalments', 'Shop instalment plan', 'Phone contract'];
    let state = C.emptyState(), t = C.today(new Date());
    let panel = {};              // plan id -> 'payoff' | 'return' | 'owed' | 'fee' | 'edit'
    let editPay = null;          // { pl, pay }
    let allOpen = {};            // plan id -> true when "All payments" is opened by hand
    let showAllNext = false, flash = null, undoSnap = null, canSave = true, loadNote = '';

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (!raw) return;
        let s = null;
        try { s = C.cleanState(JSON.parse(raw)); } catch (e) { s = null; }
        if (s) state = s; else loadNote = 'Your saved plans could not be read, so the app started fresh. If you have a backup file, restore it below.';
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
        undoSnap = null; editPay = null; panel = {};
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
    const byId = id => state.plans.find(x => x.id === id);
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
    function dateField(box, id, lbl, value) { box.append(label(id, lbl), input(id, 'date', value), errP(id)); }
    function readDate(id) { const v = $(id).value; if (!C.isDate(v)) { setErr(id, 'Pick a date.'); return null; } setErr(id, ''); return v; }
    function readMoney(id, opt) {
        const r = C.parseMoney($(id).value, opt);
        if (r.error) { setErr(id, r.error); return null; }
        setErr(id, ''); return r.n;
    }

    // ---------- the add form ----------
    const mode = () => document.querySelector('input[name="f-mode"]:checked').value;
    function formSchedule(showErrors) {
        const errs = {}, amt = C.parseMoney($('f-amt').value, { positive: true, zero: 'Type an amount bigger than 0.' });
        if (amt.error) errs['f-amt'] = amt.error;
        let down = 0;
        if (!$('f-down-box').hidden && $('f-down').value.trim()) { const d = C.parseMoney($('f-down').value); if (d.error) errs['f-down'] = d.error; else down = d.n; }
        const n = C.parseCount($('f-n').value, C.MAXN, 'payments'); if (n.error) errs['f-n'] = n.error;
        const freq = $('f-freq').value; let every = 0;
        if (freq === 'd') { const e = C.parseCount($('f-every').value, 365, 'days'); if (e.error) errs['f-every'] = e.error; else every = e.n; }
        const first = $('f-first').value; if (!C.isDate(first)) errs['f-first'] = 'Pick the date of the first payment.';
        let sch = null;
        if (!Object.keys(errs).length) {
            sch = C.schedule({ mode: mode(), amount: amt.n, down, n: n.n, freq, every, first });
            if (sch.error) { errs[down && mode() === 'total' ? 'f-down' : 'f-amt'] = sch.error; sch = null; }
        }
        if (showErrors) ['f-amt', 'f-down', 'f-n', 'f-every', 'f-first'].forEach(id => setErr(id, errs[id]));
        return { sch, freq, every, errs };
    }
    function preview() {
        const f = formSchedule(false), box = $('f-preview'), lab = $('f-past-l');
        ['f-amt', 'f-down', 'f-n', 'f-every', 'f-first'].forEach(id => { if ($(id).getAttribute('aria-invalid') && !f.errs[id]) setErr(id, ''); });
        if (!f.sch) { box.hidden = true; lab.hidden = true; return; }
        const pays = f.sch.pays, last = pays[pays.length - 1].due, fm = money;
        box.hidden = false; box.textContent = '';
        box.appendChild(p('pv-big', C.splitWords(pays, fm) + (pays.length > 1 ? ', ' + C.freqWords(f.freq, f.every) : '')));
        box.appendChild(p('pv-line', pays.length === 1 ? 'Due ' + date(pays[0].due) + '.' : 'From ' + date(pays[0].due) + ' to ' + date(last, { year: true }) + '.'));
        box.appendChild(p('pv-line', (f.sch.down ? 'Down payment ' + fm(f.sch.down) + ' + payments ' + fm(f.sch.rest) + ' = ' : 'Total ') + fm(f.sch.total) + '.'));
        const past = pays.filter(x => x.due <= t).length;
        lab.hidden = !past;
        $('f-past-t').textContent = past === pays.length ? (past === 1 ? 'I have already paid this payment (due on or before today)' : 'I have already paid all ' + past + ' payments (due on or before today)')
            : past === 1 ? 'I have already paid the first payment (due ' + (pays[0].due === t ? 'today' : date(pays[0].due)) + ')' : 'I have already paid the ' + past + ' payments due on or before today';
    }
    function resetForm() {
        ['f-name', 'f-prov', 'f-amt', 'f-down', 'f-every'].forEach(id => { $(id).value = ''; setErr(id, ''); });
        $('f-n').value = '4'; $('f-freq').value = '2w'; $('f-first').value = t; $('f-past').checked = true;
        document.querySelector('input[name="f-mode"][value="total"]').checked = true; modeLabels();
        $('f-down-box').hidden = true; $('f-down-open').hidden = false; $('f-every-box').hidden = true;
        ['f-name', 'f-prov', 'f-n', 'f-first'].forEach(id => setErr(id, ''));
        preview();
    }
    function modeLabels() {
        const each = mode() === 'each';
        $('f-amt-l').textContent = each ? 'Each payment' : 'Total price';
        $('f-amt').placeholder = each ? 'e.g. 30' : 'e.g. 120';
        $('f-down-hint').textContent = each ? 'Paid on the day you bought it, on top of the payments.' : 'Paid on the day you bought it. The rest of the price is split into the payments.';
    }
    function saveForm() {
        const name = $('f-name').value.trim(), prov = $('f-prov').value.trim();
        const okName = setErr('f-name', name ? '' : 'Type what you bought, such as New phone.');
        const okProv = setErr('f-prov', prov ? '' : 'Type who you pay, such as Klarna or the shop.');
        const f = formSchedule(true);
        if (!okName || !okProv || !f.sch) { const bad = document.querySelector('#add [aria-invalid="true"]'); if (bad) bad.focus(); return; }
        const paidPast = !$('f-past-l').hidden && $('f-past').checked;
        const pl = { id: newId('l'), name, provider: prov, bought: f.sch.pays[0].due < t ? f.sch.pays[0].due : t, down: f.sch.down, how: f.sch.pays.length > 1 ? C.freqWords(f.freq, f.every) : '', closed: null,
            pays: f.sch.pays.map((x, i) => ({ id: 'p' + (i + 1), due: x.due, amt: x.amt, paid: paidPast && x.due <= t ? x.due : null })) };
        if (pl.down && f.sch.pays[0].due < pl.bought) pl.bought = f.sch.pays[0].due;
        change(() => { state.plans.unshift(pl); }, 'pm-' + pl.id, 'Added. Tap Paid after each payment.');
        resetForm();
        const box = $('pl-' + pl.id); if (box) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    // ---------- actions on a plan ----------
    function markPaid(pl, pay, where, on) {
        change(() => { pay.paid = on || t; }, where, 'Marked ' + money(pay.amt) + ' for ' + pl.name + ' as paid.');
    }
    function markUnpaid(pl, pay, where) { change(() => { pay.paid = null; }, where, 'Marked ' + money(pay.amt) + ' for ' + pl.name + ' as not paid.'); }
    const unpaidOf = pl => C.sortPays(pl.pays).filter(x => !x.paid && !x.cancelled);

    function panelPayoff(pl, box) {
        const a = C.analyse(pl, t), pre = 'po-' + pl.id;
        box.appendChild(el('h4', null, 'Paid off early'));
        box.appendChild(p('hint', 'Marks the ' + plural(a.owed ? unpaidOf(pl).length : 0, 'payment', 'payments') + ' still to pay (' + money(a.owed) + ') as paid.'));
        dateField(box, pre + '-d', 'Paid on', t);
        moneyField(box, pre + '-a', 'Amount you paid', C.moneyInput(a.owed));
        box.appendChild(p('hint', 'Change it if the provider gave you a discount for paying early.'));
        const row = el('div', 'row-btns');
        row.append(btn('Mark all as paid', 'primary', () => {
            const on = readDate(pre + '-d'), amt = readMoney(pre + '-a', { positive: true, zero: 'Type the amount you paid.' });
            if (!on || amt == null) return;
            if (amt > a.owed) { setErr(pre + '-a', 'That is more than you owe (' + money(a.owed) + '). Use "+ Add a fee" for extra charges.'); return; }
            if (amt < unpaidOf(pl).length) { setErr(pre + '-a', 'That is less than 1 cent a payment.'); return; }
            panel[pl.id] = null;
            change(() => {
                const left = unpaidOf(pl), parts = C.respread(left, amt);
                left.forEach((x, i) => { x.amt = parts[i]; x.paid = on; });
            }, 'pm-' + pl.id, pl.name + ' is paid off.');
        }), btn('Cancel', 'secondary', () => { panel[pl.id] = null; render(); }));
        box.appendChild(row);
    }
    function panelReturn(pl, box) {
        const a = C.analyse(pl, t), pre = 'rt-' + pl.id;
        box.appendChild(el('h4', null, 'Returned it'));
        box.appendChild(p('hint', 'The ' + plural(unpaidOf(pl).length, 'payment', 'payments') + ' still to pay (' + money(a.owed) + ') will be cancelled. Check with ' + pl.provider + ' that they are cancelled there too.'));
        dateField(box, pre + '-d', 'Returned on', t);
        moneyField(box, pre + '-a', 'Refund to expect', C.moneyInput(a.paid), '0');
        box.appendChild(p('hint', 'What you have already paid (' + money(a.paid) + ') should come back. Type 0 if there is nothing to get back.'));
        const row = el('div', 'row-btns');
        row.append(btn('Cancel the payments still to pay', 'primary', () => {
            const on = readDate(pre + '-d'), ref = readMoney(pre + '-a');
            if (!on || ref == null) return;
            if (ref > a.paid) { setErr(pre + '-a', 'That is more than you paid (' + money(a.paid) + ').'); return; }
            panel[pl.id] = null;
            change(() => { unpaidOf(pl).forEach(x => { x.cancelled = true; }); pl.closed = { type: 'returned', on, refund: ref, refundGot: ref === 0 }; },
                'top-msg', pl.name + ' is marked as returned. It moved to "Paid off and returned".');
        }), btn('Back', 'secondary', () => { panel[pl.id] = null; render(); }));
        box.appendChild(row);
    }
    function panelOwed(pl, box) {
        const a = C.analyse(pl, t), left = unpaidOf(pl), pre = 'ow-' + pl.id;
        box.appendChild(el('h4', null, 'Change amount owed'));
        box.appendChild(p('hint', 'For a part refund, added interest or a new plan from ' + pl.provider + '. The new amount is shared over the ' + plural(left.length, 'payment', 'payments') + ' still to pay, keeping their dates.'));
        moneyField(box, pre + '-a', 'Still owed now', C.moneyInput(a.owed));
        const row = el('div', 'row-btns');
        row.append(btn('Save', 'primary', () => {
            const amt = readMoney(pre + '-a', { positive: true, zero: 'Type an amount bigger than 0. If nothing is owed, use Paid off early or Returned it.' });
            if (amt == null) return;
            if (amt < left.length) { setErr(pre + '-a', 'That is less than 1 cent a payment.'); return; }
            panel[pl.id] = null;
            change(() => { const parts = C.respread(left, amt); left.forEach((x, i) => { x.amt = parts[i]; }); }, 'pm-' + pl.id, 'Now ' + money(amt) + ' still owed, ' + C.splitWords(left.map((x, i) => ({ amt: C.respread(left, amt)[i] })), money) + '.');
        }), btn('Cancel', 'secondary', () => { panel[pl.id] = null; render(); }));
        box.appendChild(row);
    }
    function panelFee(pl, box) {
        const pre = 'fe-' + pl.id;
        box.appendChild(el('h4', null, 'Add a fee or extra payment'));
        moneyField(box, pre + '-a', 'Amount', '', 'e.g. 5');
        dateField(box, pre + '-d', 'Due on', t);
        const lab = el('label', 'check'), cb = input(pre + '-p', 'checkbox'); cb.checked = false;
        lab.append(cb, el('span', null, 'Already paid'));
        box.appendChild(lab);
        const row = el('div', 'row-btns');
        row.append(btn('Add fee', 'primary', () => {
            const amt = readMoney(pre + '-a', { positive: true, zero: 'Type an amount bigger than 0.' }), on = readDate(pre + '-d');
            if (amt == null || !on) return;
            panel[pl.id] = null;
            change(() => { pl.pays.push({ id: newId('f'), due: on, amt, paid: cb.checked ? on : null, fee: true }); pl.pays = C.sortPays(pl.pays); }, 'pm-' + pl.id, 'Added a fee of ' + money(amt) + '.');
        }), btn('Cancel', 'secondary', () => { panel[pl.id] = null; render(); }));
        box.appendChild(row);
    }
    function panelEdit(pl, box) {
        const pre = 'ed-' + pl.id;
        box.appendChild(el('h4', null, 'Edit details'));
        box.append(label(pre + '-n', 'What did you buy?'), input(pre + '-n', 'text', pl.name, null, { maxLength: 60, inputMode: 'text' }), errP(pre + '-n'));
        const pi = input(pre + '-p', 'text', pl.provider, null, { maxLength: 40, inputMode: 'text' }); pi.setAttribute('list', 'prov-list');
        box.append(label(pre + '-p', 'Paid with'), pi, errP(pre + '-p'));
        moneyField(box, pre + '-dn', 'Down payment paid at checkout', pl.down ? C.moneyInput(pl.down) : '', '0');
        box.appendChild(p('hint', 'Leave it empty if there was none. To change a payment, use Edit next to it.'));
        const row = el('div', 'row-btns');
        row.append(btn('Save', 'primary', () => {
            const n = $(pre + '-n').value.trim(), pv = $(pre + '-p').value.trim();
            const ok1 = setErr(pre + '-n', n ? '' : 'Type what you bought.'), ok2 = setErr(pre + '-p', pv ? '' : 'Type who you pay.');
            let dn = 0;
            if ($(pre + '-dn').value.trim()) { dn = readMoney(pre + '-dn'); if (dn == null) return; } else setErr(pre + '-dn', '');
            if (!ok1 || !ok2) return;
            panel[pl.id] = null;
            change(() => { pl.name = n; pl.provider = pv; pl.down = dn; }, 'pm-' + pl.id, 'Saved.');
        }), btn('Cancel', 'secondary', () => { panel[pl.id] = null; render(); }));
        box.appendChild(row);
    }
    function planText(pl) {
        const a = C.analyse(pl, t), fm = c => C.fmtMoney(c, state.cur, 'en-US'), L = [pl.name + ' (' + pl.provider + ')'];
        if (a.state === 'returned') L.push('Returned on ' + date(pl.closed.on, { year: true }) + '. Refund to expect: ' + fm(pl.closed.refund) + (pl.closed.refundGot ? ' (received)' : ''));
        L.push(a.paidCount + ' of ' + a.count + ' payments made. Paid ' + fm(a.paid) + ' of ' + fm(a.total) + ', still owed ' + fm(a.owed) + '.');
        if (pl.down) L.push('Down payment: ' + fm(pl.down));
        a.live.forEach((x, i) => L.push('- ' + (x.fee ? 'Fee' : 'Payment ' + (i + 1)) + ', ' + date(x.due, { year: true }) + ': ' + fm(x.amt) + (x.paid ? ' (paid ' + date(x.paid, { year: true }) + ')' : x.due < t ? ' (LATE)' : '')));
        return L.join('\n');
    }

    // ---------- one payment row ----------
    function payRow(pl, pay, num, a) {
        const li = el('li', 'pay'), mid = 'pm-' + pl.id;
        if (editPay && editPay.pl === pl.id && editPay.pay === pay.id) {
            li.classList.add('editing');
            const pre = 'ep-' + pay.id;
            const g = el('div', 'two');
            const d1 = el('div', 'field'); dateField(d1, pre + '-d', 'Due on', pay.due);
            const d2 = el('div', 'field'); moneyField(d2, pre + '-a', 'Amount', C.moneyInput(pay.amt));
            g.append(d1, d2); li.appendChild(g);
            if (pay.paid) dateField(li, pre + '-pd', 'Paid on', pay.paid);
            const row = el('div', 'row-btns');
            row.append(btn('Save', 'primary', () => {
                const due = readDate(pre + '-d'), amt = readMoney(pre + '-a', { positive: true, zero: 'Type an amount bigger than 0. To remove it, use Delete this payment.' });
                const pd = pay.paid ? readDate(pre + '-pd') : null;
                if (!due || amt == null || (pay.paid && !pd)) return;
                editPay = null;
                change(() => { pay.due = due; pay.amt = amt; if (pay.paid) pay.paid = pd; pl.pays = C.sortPays(pl.pays); }, mid, 'Saved.');
            }), btn('Cancel', 'secondary', () => { editPay = null; render(); }));
            li.appendChild(row);
            if (a.live.length > 1) li.appendChild(btn('Delete this payment', 'link danger-t', () => {
                editPay = null;
                change(() => { pl.pays = pl.pays.filter(x => x !== pay); }, mid, 'Deleted the payment of ' + money(pay.amt) + '.');
            }));
            return li;
        }
        const left = el('div', 'pay-l');
        left.appendChild(p('pay-n', (pay.fee ? 'Fee' : 'Payment ' + num + ' of ' + a.pays.filter(x => !x.fee).length) + ' · ' + date(pay.due)));
        let st, cls = '';
        if (pay.cancelled) { st = 'Cancelled (returned)'; cls = 'muted'; }
        else if (pay.paid) { st = 'Paid ' + (pay.paid === t ? 'today' : date(pay.paid)); cls = 'good'; }
        else if (pay.due < t) { st = 'Late, due ' + C.rel(pay.due, t); cls = 'bad'; }
        else if (pay.due === t) { st = 'Due today'; cls = 'warn'; }
        else st = 'Due ' + C.rel(pay.due, t);
        left.appendChild(p('pay-s ' + cls, st));
        li.appendChild(left);
        const right = el('div', 'pay-r');
        right.appendChild(p('pay-a' + (pay.cancelled ? ' struck' : ''), money(pay.amt)));
        const bs = el('div', 'pay-b');
        if (!pay.cancelled && !pl.closed) {
            if (pay.paid) bs.appendChild(btn('Not paid', 'secondary small', () => markUnpaid(pl, pay, mid), 'Mark ' + money(pay.amt) + ' due ' + date(pay.due) + ' as not paid'));
            else bs.appendChild(btn('Paid', 'primary small', () => markPaid(pl, pay, mid), 'Mark ' + money(pay.amt) + ' due ' + date(pay.due) + ' as paid'));
            bs.appendChild(btn('Edit', 'secondary small', () => { editPay = { pl: pl.id, pay: pay.id }; render(); const f = $('ep-' + pay.id + '-d'); if (f) f.focus(); }, 'Edit the payment due ' + date(pay.due)));
        }
        right.appendChild(bs);
        li.appendChild(right);
        if (pay.paid) li.classList.add('is-paid');
        if (cls === 'bad') li.classList.add('is-late');
        return li;
    }

    // ---------- one plan box ----------
    function planBox(pl) {
        const a = C.analyse(pl, t), box = el('article', 'plan is-' + a.state), mid = 'pm-' + pl.id;
        box.id = 'pl-' + pl.id;
        const top = el('div', 'p-top');
        const h = el('h3', 'p-name', pl.name);
        top.append(h, el('span', 'tag', pl.provider));
        const stTag = { late: ['Late', 'bad'], today: ['Due today', 'warn'], soon: ['Due soon', 'warn'], ok: ['On track', 'good'], done: ['Paid off', 'good'], returned: ['Returned', 'muted'] }[a.state];
        top.appendChild(el('span', 'tag st ' + stTag[1], stTag[0]));
        box.appendChild(top);
        const sub = [];
        sub.push('Bought ' + date(pl.bought, { noDay: true }));
        sub.push(plural(a.pays.filter(x => !x.fee).length, 'payment', 'payments') + (pl.how ? ' ' + pl.how : ''));
        if (pl.down) sub.push('down payment ' + money(pl.down));
        box.appendChild(p('p-sub', sub.join(' · ')));

        const res = el('div', 'res');
        if (a.state === 'returned') {
            res.appendChild(p('r-label', 'Refund to expect'));
            res.appendChild(p('r-big', money(pl.closed.refund)));
            res.appendChild(p('r-line', 'Returned on ' + date(pl.closed.on) + '. ' + (pl.closed.refund ? (pl.closed.refundGot ? 'Refund received.' : 'Not received yet.') : 'Nothing to get back.')));
        } else {
            res.appendChild(p('r-label', a.state === 'done' ? 'Paid in full' : 'Still owed'));
            res.appendChild(p('r-big', money(a.state === 'done' ? a.paid : a.owed)));
            res.appendChild(p('r-line', plural(a.paidCount, 'payment', 'payments') + ' of ' + a.count + ' made · ' + money(a.paid) + ' of ' + money(a.total) + ' paid'));
            const bar = el('div', 'bar'); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', a.pct + '% paid');
            const fill = el('span'); fill.style.width = Math.min(100, a.pct) + '%'; bar.appendChild(fill); res.appendChild(bar);
        }
        box.appendChild(res);

        // what to do now
        const act = el('div', 'act is-' + a.state);
        if (a.state === 'late') {
            const first = a.late[0];
            act.appendChild(p('a-big', a.late.length === 1 ? 'Late: ' + money(first.amt) + ' was due ' + date(first.due) + ' (' + C.rel(first.due, t) + ')' : plural(a.late.length, 'payment', 'payments') + ' late: ' + money(a.lateSum) + ', the first was due ' + date(first.due)));
            act.appendChild(p('a-note', 'Pay it as soon as you can; most providers add a late fee. Already paid? Mark it below.'));
            act.appendChild(btn('Paid ' + money(first.amt) + ' (due ' + date(first.due, { noDay: true }) + ')', 'primary', () => markPaid(pl, first, mid)));
        } else if (a.state === 'today') {
            const d = a.dueToday[0];
            act.appendChild(p('a-big', 'Due today: ' + money(d.amt)));
            act.appendChild(p('a-note', 'Make sure the money is in your account or on your card.'));
            act.appendChild(btn('Paid ' + money(d.amt), 'primary', () => markPaid(pl, d, mid)));
        } else if (a.state === 'ok' || a.state === 'soon') {
            act.appendChild(p('a-big', 'Next: ' + money(a.next.amt) + ' on ' + date(a.next.due) + ' (' + C.rel(a.next.due, t) + ')'));
            if (a.last && a.last !== a.next.due) act.appendChild(p('a-note', 'Last payment ' + date(a.last, { year: true }) + '.'));
            else act.appendChild(p('a-note', 'This is the last payment.'));
        } else if (a.state === 'done') {
            act.appendChild(p('a-big', 'All paid' + (a.lastPaid ? ', the last on ' + date(a.lastPaid) : '') + '.'));
        } else if (a.state === 'returned') {
            if (pl.closed.refund && !pl.closed.refundGot) act.appendChild(btn('Refund received', 'primary', () => change(() => { pl.closed.refundGot = true; }, mid, 'Marked the refund as received.')));
            else act.appendChild(p('a-big', 'Nothing left to pay.'));
        }
        box.appendChild(act);
        box.appendChild(Object.assign(el('div', 'msg'), { id: mid, role: 'status' }));

        // all payments
        const det = el('details', 'pays');
        det.open = allOpen[pl.id] != null ? allOpen[pl.id] : (a.count <= 6 && !pl.closed && a.state !== 'done') || (editPay && editPay.pl === pl.id);
        det.addEventListener('toggle', () => { allOpen[pl.id] = det.open; });
        det.appendChild(el('summary', null, 'All payments (' + a.pays.length + ')'));
        const ul = el('ul', 'pay-list');
        if (pl.down) {
            const li = el('li', 'pay is-paid');
            const l = el('div', 'pay-l'); l.append(p('pay-n', 'Down payment · ' + date(pl.bought)), p('pay-s good', 'Paid at checkout'));
            const r = el('div', 'pay-r'); r.appendChild(p('pay-a', money(pl.down)));
            li.append(l, r); ul.appendChild(li);
        }
        let num = 0;
        a.pays.forEach(x => { if (!x.fee) num++; ul.appendChild(payRow(pl, x, num, a)); });
        det.appendChild(ul);
        box.appendChild(det);

        // more
        const more = el('div', 'l-btns');
        const toggle = name => () => { panel[pl.id] = panel[pl.id] === name ? null : name; editPay = null; render(); const f = $('pl-' + pl.id).querySelector('.panel input'); if (f) f.focus(); };
        if (!pl.closed && a.owed) {
            more.append(btn('Paid off early', 'secondary', toggle('payoff')), btn('Returned it', 'secondary', toggle('return')),
                btn('Change amount owed', 'secondary', toggle('owed')), btn('+ Add a fee', 'secondary', toggle('fee')));
        } else if (!pl.closed) more.append(btn('+ Add a fee', 'secondary', toggle('fee')));
        if (pl.closed) more.appendChild(btn('Not returned after all', 'secondary', () => change(() => { pl.pays.forEach(x => { delete x.cancelled; }); pl.closed = null; }, 'top-msg', pl.name + ' is back in your plans.')));
        more.append(btn('Edit details', 'secondary', toggle('edit')), btn('Copy', 'secondary', () => copyText(planText(pl), mid)));
        more.appendChild(btn('Delete plan', 'secondary danger-t', () => { panel[pl.id] = null; change(() => { state.plans = state.plans.filter(x => x !== pl); }, 'top-msg', 'Deleted ' + pl.name + '.'); }));
        box.appendChild(more);
        if (panel[pl.id]) {
            const pb = el('div', 'panel');
            ({ payoff: panelPayoff, return: panelReturn, owed: panelOwed, fee: panelFee, edit: panelEdit })[panel[pl.id]](pl, pb);
            box.appendChild(pb);
        }
        return box;
    }

    // ---------- the totals at the top ----------
    function renderSum() {
        const s = C.summary(state.plans, t), body = $('sum-body');
        body.textContent = '';
        if (s.late.n) {
            const names = [...new Set(s.rows.filter(r => r.pay.due < t).map(r => r.plan.name))];
            body.appendChild(p('alert bad', 'Late: ' + plural(s.late.n, 'payment', 'payments') + ', ' + money(s.late.sum) + ' (' + names.join(', ') + '). Pay as soon as you can, then tap Paid.'));
        }
        if (s.today.n) body.appendChild(p('alert warn', 'Due today: ' + plural(s.today.n, 'payment', 'payments') + ', ' + money(s.today.sum) + '.'));
        if (s.refund) body.appendChild(p('alert info', 'Refunds to expect: ' + money(s.refund) + ' from ' + plural(s.refundPlans, 'returned plan', 'returned plans') + '.'));
        const g = el('div', 'tiles');
        const tile = (lab, val, note, cls) => { const d = el('div', 'tile' + (cls ? ' ' + cls : '')); d.append(p('t-l', lab), p('t-big', val), p('t-n', note)); g.appendChild(d); return d; };
        tile('Still to pay in ' + C.monthWords(s.thisMonth.month, t), money(s.thisMonth.sum), s.thisMonth.n ? plural(s.thisMonth.n, 'payment', 'payments') + (s.late.n ? ', late ones included' : '') : 'Nothing left this month', 'main');
        tile(C.monthWords(s.nextMonth.month, t), money(s.nextMonth.sum), s.nextMonth.n ? plural(s.nextMonth.n, 'payment', 'payments') : 'Nothing due');
        tile('Still owed in total', money(s.owed), s.owed ? 'on ' + plural(s.plans, 'plan', 'plans') + ', last payment ' + date(s.last, { year: true }) : 'All plans are paid');
        body.appendChild(g);

        if (s.rows.length) {
            body.appendChild(el('h3', null, 'Next payments'));
            const ul = el('ul', 'next');
            const rows = showAllNext ? s.rows : s.rows.slice(0, 6);
            rows.forEach(r => {
                const li = el('li', 'nx' + (r.pay.due < t ? ' is-late' : r.pay.due === t ? ' is-today' : ''));
                const l = el('div', 'nx-l');
                l.append(p('nx-d', date(r.pay.due) + ' · ' + (r.pay.due < t ? 'late, ' + C.rel(r.pay.due, t) : C.rel(r.pay.due, t))), p('nx-w', r.plan.name + ' · ' + r.plan.provider + (r.pay.fee ? ' · fee' : '')));
                const rt = el('div', 'nx-r');
                rt.append(p('nx-a', money(r.pay.amt)), btn('Paid', 'primary small', () => markPaid(r.plan, r.pay, 'sum-msg'), 'Mark ' + money(r.pay.amt) + ' for ' + r.plan.name + ' due ' + date(r.pay.due) + ' as paid'));
                li.append(l, rt); ul.appendChild(li);
            });
            body.appendChild(ul);
            if (s.rows.length > 6) body.appendChild(btn(showAllNext ? 'Show fewer' : 'Show all ' + s.rows.length + ' payments', 'link', () => { showAllNext = !showAllNext; render(); }));

            const months = Math.max(1, Math.min(60, (+s.last.slice(0, 4) - +t.slice(0, 4)) * 12 + (+s.last.slice(5, 7) - +t.slice(5, 7)) + 1));
            const mt = C.monthTotals(state.plans, t, months).filter(m => m.n);
            if (mt.length > 1) {
                const d = el('details', 'months');
                d.appendChild(el('summary', null, 'Month by month (' + mt.length + ' months)'));
                const ml = el('ul', 'per');
                mt.forEach(m => { const li = el('li'); li.append(el('span', null, C.monthWords(m.month, t) + (m.month === t.slice(0, 7) ? ' (still to pay)' : '') + ' · ' + plural(m.n, 'payment', 'payments')), el('b', null, money(m.sum))); ml.appendChild(li); });
                d.appendChild(ml); body.appendChild(d);
            }
        }
        const acts = el('div', 'sum-btns');
        acts.append(btn('Copy summary', 'secondary', () => copyText(C.summaryText(state.plans, t, state.cur), 'sum-msg')),
            btn('Email summary', 'secondary', () => { const m = el('a'); m.href = 'mailto:?subject=' + encodeURIComponent('My instalments') + '&body=' + encodeURIComponent(C.summaryText(state.plans, t, state.cur)); m.click(); }));
        if (s.rows.some(r => r.pay.due >= t)) acts.appendChild(btn('Add to calendar', 'secondary', () => {
            const d = new Date(), stamp = d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'), f = C.ics(state.plans, t, state.cur, stamp);
            download('instalments.ics', 'text/calendar', f.text);
            flash = { where: 'sum-msg', text: 'Saved a calendar file with ' + plural(f.count, 'payment', 'payments') + '. Open it to add them to your calendar.' }; render();
        }));
        body.appendChild(acts);
    }

    // ---------- the page ----------
    function render() {
        t = C.today(new Date());
        const active = state.plans.filter(pl => !pl.closed && C.analyse(pl, t).state !== 'done'), finished = state.plans.filter(pl => !active.includes(pl));
        const order = { late: 0, today: 1, soon: 2, ok: 3 };
        active.sort((a, b) => { const x = C.analyse(a, t), y = C.analyse(b, t); return order[x.state] - order[y.state] || (x.next ? x.next.due : '9') .localeCompare(y.next ? y.next.due : '9'); });
        $('intro').hidden = state.plans.length > 0;
        $('sum').hidden = !state.plans.length;
        if (state.plans.length) renderSum();
        const list = $('p-list'); list.textContent = '';
        active.forEach(pl => list.appendChild(planBox(pl)));
        $('plans').hidden = !active.length;
        const dl = $('done-list'); dl.textContent = '';
        finished.forEach(pl => dl.appendChild(planBox(pl)));
        $('done-wrap').hidden = !finished.length;
        $('done-s').textContent = 'Paid off and returned (' + finished.length + ')';
        $('add-h').textContent = state.plans.length ? 'Add another plan' : 'Add a plan';
        $('restore-first').hidden = state.plans.length > 0;
        $('del-all').disabled = !state.plans.length;
        ['f-amt-cur', 'f-down-cur'].forEach(id => { $(id).hidden = !state.cur; $(id).textContent = state.cur; });
        clearMsgs();
        if (loadNote) showMsg($('top-msg'), loadNote, false, true);
        if (flash) {
            let box = $(flash.where);
            if (!box) box = $('top-msg');
            showMsg(box, flash.text, flash.undo, flash.bad);
            if (finished.some(pl => 'pm-' + pl.id === flash.where)) $('done-d').open = true;
            flash = null;
        }
        preview();
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
    PROVIDERS.forEach(x => { const o = el('option'); o.value = x; $('prov-list').appendChild(o); });
    fillCur();
    $('f-first').value = t;
    document.querySelectorAll('#quick .chip').forEach(c => c.addEventListener('click', () => {
        $('f-n').value = c.dataset.n; $('f-freq').value = c.dataset.freq; $('f-every-box').hidden = true;
        const f = c.dataset.first;
        $('f-first').value = f === 'm' ? C.addMonths(t, 1) : C.addDays(t, Number(f));
        $('f-past').checked = true;
        document.querySelectorAll('#quick .chip').forEach(x => x.setAttribute('aria-pressed', x === c ? 'true' : 'false'));
        preview();
        if (!$('f-name').value.trim()) $('f-name').focus(); else $('f-amt').focus();
    }));
    document.querySelectorAll('input[name="f-mode"]').forEach(r => r.addEventListener('change', () => { modeLabels(); preview(); }));
    ['f-amt', 'f-down', 'f-n', 'f-every', 'f-first'].forEach(id => $(id).addEventListener('input', () => { document.querySelectorAll('#quick .chip').forEach(x => x.setAttribute('aria-pressed', 'false')); preview(); }));
    $('f-first').addEventListener('change', preview);
    $('f-freq').addEventListener('change', () => { $('f-every-box').hidden = $('f-freq').value !== 'd'; if (!$('f-every-box').hidden) $('f-every').focus(); preview(); });
    ['f-name', 'f-prov'].forEach(id => $(id).addEventListener('input', () => setErr(id, '')));
    $('f-down-open').addEventListener('click', () => { $('f-down-box').hidden = false; $('f-down-open').hidden = true; $('f-down').focus(); });
    $('f-save').addEventListener('click', saveForm);
    $('add').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'radio') { e.preventDefault(); saveForm(); } });
    $('cur').addEventListener('change', () => { const v = $('cur').value; state.cur = v; save(); flash = { where: 'tools-msg', text: v ? 'Amounts now show ' + v + '.' : 'Amounts now show plain numbers.' }; render(); });
    $('backup').addEventListener('click', () => {
        if (!state.plans.length) { flash = { where: 'tools-msg', text: 'Nothing to back up yet.' }; render(); return; }
        download('instalments-backup-' + t + '.json', 'application/json', JSON.stringify(Object.assign({ app: SLUG }, state), null, 1));
        flash = { where: 'tools-msg', text: 'Saved the backup file. Keep it somewhere safe, such as your email or cloud drive.' }; render();
    });
    const pick = () => { $('restore-file').value = ''; $('restore-file').click(); };
    $('restore').addEventListener('click', pick);
    $('restore-first').addEventListener('click', pick);
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; if (!f) return;
        const where = state.plans.length ? 'tools-msg' : 'add-msg';
        if (f.size > 5000000) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const r = new FileReader();
        r.onload = () => {
            let s = null; try { s = C.cleanState(JSON.parse(r.result)); } catch (e) { s = null; }
            if (!s || !s.plans.length) { flash = { where, text: 'That file is not a backup from this app, or it has no plans in it.', bad: true }; render(); return; }
            loadNote = '';
            change(() => { state = s; }, 'tools-msg', 'Restored ' + plural(s.plans.length, 'plan', 'plans') + '.');
            fillCur();
        };
        r.onerror = () => { flash = { where, text: 'Could not read that file.', bad: true }; render(); };
        r.readAsText(f);
    });
    $('del-all').addEventListener('click', () => { panel = {}; editPay = null; loadNote = ''; change(() => { state = Object.assign(C.emptyState(), { cur: state.cur }); }, 'tools-msg', 'Deleted everything.'); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && C.today(new Date()) !== t) render(); });
    resetForm();
    render();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
