// Freelance Income Log with Tax Set-Aside: the page. The maths and the words are in core.js (window.INCOME).
(function () {
    'use strict';
    const C = window.INCOME, SLUG = 'freelance-income-log-with-tax-set-aside', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)',
        'NZ$': 'NZ$ (New Zealand dollar)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (riyal)', 'KWD': 'KWD (dinar)', 'R': 'R (rand)', '৳': '৳ (taka)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)',
        'GH₵': 'GH₵ (cedi)', 'E£': 'E£ (Egyptian pound)', 'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₱': '₱ (peso)', 'S$': 'S$ (Singapore dollar)', '¥': '¥ (yen, yuan)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const PCTS = [0, 100, 200, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 3500, 4000];
    const NEW = '__new';
    let state = C.emptyState(), t = C.today(new Date()), view = C.ym(t);
    let editId = null;           // payment being edited in the form
    let panel = {};              // client id -> 'rename'
    let flash = null, undoSnap = null, canSave = true, loadNote = '';

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { tz = ''; }
        state.taxStart = C.guessTaxStart(tz);
        if (!raw) return;
        let s = null;
        try { s = C.cleanState(JSON.parse(raw)); } catch (e) { s = null; }
        if (s) state = s; else loadNote = 'Your saved payments could not be read, so the app started fresh. If you have a backup file, restore it below.';
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
        if (editId && !state.pays.some(p => p.id === editId)) resetForm();
        save();
        flash = { where, text: 'Undone.' };
        fillSettings(); fillClients(); updateForm();
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const p = (cls, text) => el('p', cls, text);
    // a no-break space keeps "Rs" and "USD" on the same line as the number
    const money = c => C.fmtMoney(c, state.cur, LOC).replace(' ', '\u00a0');
    const inCur = (c, cur) => C.fmtIn(c, cur, state.cur, LOC).replace(' ', '\u00a0');
    const date = (s, o) => C.fmtDate(s, t, o);
    const client = id => state.clients.find(x => x.id === id);
    const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const plural = C.plural;
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
    function lastPaid(id) { return state.pays.filter(x => x.client === id).reduce((a, x) => !a || x.date > a ? x.date : a, ''); }

    // ---------- the form ----------
    const conv = () => (document.querySelector('input[name="f-conv"]:checked') || {}).value || 'home';
    function setConv(v) { document.querySelectorAll('input[name="f-conv"]').forEach(r => { r.checked = r.value === v; }); }
    function fillClients(keep) {
        const s = $('f-client'), was = keep != null ? keep : s.value;
        s.textContent = '';
        const list = state.clients.slice().sort((a, b) => lastPaid(b.id).localeCompare(lastPaid(a.id)) || a.name.localeCompare(b.name));
        list.forEach(c => { const o = el('option', null, c.name); o.value = c.id; s.appendChild(o); });
        const o = el('option', null, '+ New client'); o.value = NEW; s.appendChild(o);
        s.value = list.some(c => c.id === was) ? was : list.length ? list[0].id : NEW;
        const none = !list.length;
        s.hidden = none; $('f-client').previousElementSibling.hidden = none;
        $('f-new-box').hidden = s.value !== NEW;
    }
    function fillCurSelect() {
        const s = $('f-cur'), was = s.value;
        s.textContent = '';
        const o = el('option', null, 'My own currency' + (state.cur ? ' (' + state.cur + ')' : '')); o.value = ''; s.appendChild(o);
        C.CURRENCIES.forEach(c => { const x = el('option', null, c); x.value = c; s.appendChild(x); });
        s.value = was && C.CURRENCIES.includes(was) ? was : '';
    }
    // the client's usual currency and fee, for a new payment
    function applyDefaults() {
        if (editId) return;
        const c = client($('f-client').value);
        if (!c) return;
        $('f-cur').value = c.cur || '';
        $('f-fee').value = c.fee || '';
        setErr('f-fee', '');
    }
    function updateForm() {
        const cur = $('f-cur').value, mode = conv();
        $('f-conv-box').hidden = !cur;
        $('f-home-box').hidden = mode !== 'home';
        $('f-rate-box').hidden = mode !== 'rate';
        $('f-none-hint').hidden = mode !== 'none';
        $('f-home-tag').hidden = !state.cur; $('f-home-tag').textContent = state.cur;
        $('f-rate-l').textContent = cur ? 'Exchange rate: 1 ' + cur + ' =' + (state.cur ? ' how many ' + state.cur : ' how much of your money') : 'Exchange rate';
        $('f-new-box').hidden = $('f-client').value !== NEW;
        preview();
    }
    // reads the form; returns { pay, newName } or null (and shows the errors when `show`)
    function readForm(show) {
        const err = (id, m) => { if (show) setErr(id, m); return false; };
        let ok = true;
        const cid = $('f-client').value;
        let newName = '';
        if (cid === NEW) {
            newName = $('f-new').value.trim().replace(/\s+/g, ' ');
            if (!newName) ok = err('f-new', 'Type the client\'s name.') && ok; else if (show) setErr('f-new', '');
        }
        const d = $('f-date').value;
        if (!C.isDate(d)) ok = err('f-date', 'Pick the date you were paid.') && ok;
        else if (d > C.addDays(t, 1)) ok = err('f-date', 'Pick today or an earlier date.') && ok;
        else if (show) setErr('f-date', '');
        const g = C.parseMoney($('f-gross').value, { positive: true, zero: 'Type an amount bigger than 0.' });
        if (g.error) ok = err('f-gross', g.error) && ok; else if (show) setErr('f-gross', '');
        const cur = $('f-cur').value;
        let fee = { fee: 0, pct: null };
        if (!g.error) {
            fee = C.parseFee($('f-fee').value, g.n);
            if (fee.error) ok = err('f-fee', fee.error) && ok; else if (show) setErr('f-fee', '');
        }
        let rate = 0, home = null;
        if (cur && conv() === 'home') {
            const h = C.parseMoney($('f-home').value, { blank: 'Type what reached your bank, or pick "Not in my bank yet".' });
            if (h.error) ok = err('f-home', h.error) && ok; else { home = h.n; if (show) setErr('f-home', ''); }
        } else if (cur && conv() === 'rate') {
            const r = C.parseRate($('f-rate').value);
            if (r.error) ok = err('f-rate', r.error) && ok; else { rate = r.n; if (show) setErr('f-rate', ''); }
        }
        if (!ok) return null;
        return { newName, pay: { id: editId || newId('p'), client: cid, date: d, cur, gross: g.n, fee: fee.fee, feePct: fee.pct, rate, home, refund: $('f-refund').checked, note: $('f-note').value.trim().slice(0, 120) } };
    }
    function preview() {
        const box = $('f-preview');
        const g = C.parseMoney($('f-gross').value, { positive: true });
        if (g.error) { box.hidden = true; return; }
        const r = readForm(false);
        const fee = C.parseFee($('f-fee').value, g.n);
        box.textContent = ''; box.hidden = false;
        if (fee.error) { box.appendChild(p('pv-line', 'Check the fee.')); return; }
        const cur = $('f-cur').value, n = g.n - fee.fee, refund = $('f-refund').checked;
        const after = fee.fee ? ' after a ' + inCur(fee.fee, cur) + ' fee (' + C.feeShare(fee.fee, g.n) + ')' : ' (no fee)';
        if (!cur) { box.appendChild(p('pv-big', (refund ? 'Taken back from your income: ' : 'Reaches your bank: ') + money(n))); box.appendChild(p('pv-line', 'Client paid ' + money(g.n) + after + '.')); return; }
        box.appendChild(p('pv-line', (refund ? 'Taken back: ' : 'You get ') + inCur(n, cur) + after + '.'));
        if (!r) { box.appendChild(p('pv-line', conv() === 'none' ? 'Not in your bank yet.' : 'Type what reached your bank or the rate.')); return; }
        const h = C.homeOf(r.pay);
        if (h == null) { box.appendChild(p('pv-big', 'Not in your bank yet. It will not count in your income until you add it.')); return; }
        box.appendChild(p('pv-big', (refund ? 'Taken back from your income: ' : 'Reaches your bank: ') + money(Math.abs(h))));
        const rt = C.rateOf(r.pay);
        if (rt && conv() === 'home') box.appendChild(p('pv-line', 'Rate you got: 1 ' + cur + ' = ' + C.fmtRate(rt) + (state.cur ? ' ' + state.cur : '') + '.'));
    }
    function resetForm(keepClient) {
        editId = null;
        $('add').classList.remove('editing');
        $('add-h').textContent = 'Add a payment';
        $('f-save').textContent = 'Add payment';
        $('f-cancel').hidden = true;
        ['f-new', 'f-gross', 'f-fee', 'f-home', 'f-rate', 'f-note'].forEach(id => { $(id).value = ''; setErr(id, ''); });
        $('f-date').value = t; setErr('f-date', '');
        $('f-refund').checked = false;
        $('f-note-box').hidden = true; $('f-note-open').hidden = false;
        setConv('home');
        fillClients(keepClient);
        fillCurSelect();
        applyDefaults();
        updateForm();
    }
    function startEdit(id) {
        const x = state.pays.find(y => y.id === id); if (!x) return;
        resetForm(x.client);
        editId = id;
        $('add').classList.add('editing');
        $('add-h').textContent = 'Edit payment';
        $('f-save').textContent = 'Save changes';
        $('f-cancel').hidden = false;
        $('f-date').value = x.date;
        $('f-cur').value = x.cur;
        $('f-gross').value = C.moneyInput(x.gross);
        $('f-fee').value = x.feePct ? C.pctWords(x.feePct) : x.fee ? C.moneyInput(x.fee) : '';
        setConv(x.rate ? 'rate' : x.home != null ? 'home' : x.cur ? 'none' : 'home');
        $('f-rate').value = x.rate ? C.rateInput(x.rate) : '';
        $('f-home').value = x.home != null ? C.moneyInput(x.home) : '';
        $('f-refund').checked = x.refund;
        $('f-note').value = x.note;
        if (x.note) { $('f-note-box').hidden = false; $('f-note-open').hidden = true; }
        updateForm();
        $('add').scrollIntoView({ block: 'start', behavior: 'smooth' });
        (x.cur && x.home == null && !x.rate ? $('f-gross') : $('f-gross')).focus({ preventScroll: true });
    }
    function saveForm() {
        const r = readForm(true);
        if (!r) { const bad = document.querySelector('#add [aria-invalid="true"]'); if (bad) bad.focus(); return; }
        const x = r.pay, wasEdit = !!editId;
        let name = '';
        view = C.ym(x.date);
        change(() => {
            if (x.client === NEW) {
                const same = state.clients.find(c => c.name.toLowerCase() === r.newName.toLowerCase());
                if (same) x.client = same.id;
                else { const c = { id: newId('c'), name: r.newName, cur: '', fee: '' }; state.clients.push(c); x.client = c.id; }
            }
            const c = client(x.client); name = c.name;
            if (!x.refund) { c.cur = x.cur; c.fee = $('f-fee').value.trim().slice(0, 20); }
            if (wasEdit) { const i = state.pays.findIndex(y => y.id === x.id); if (i >= 0) state.pays[i] = x; else state.pays.push(x); }
            else state.pays.push(x);
        }, 'add-msg', (wasEdit ? 'Saved the payment from ' : x.refund ? 'Added money taken back by ' : 'Added ') + (wasEdit || x.refund ? '' : inCur(x.gross, x.cur) + ' from ') + nameOf(x) + '. ' + homeWords(x));
        resetForm(x.client);
        function nameOf(y) { return y.client === NEW ? r.newName : (client(y.client) || {}).name || name; }
    }
    function homeWords(x) {
        const h = C.homeOf(x);
        if (h == null) return 'Not in your bank yet.';
        return (h < 0 ? money(-h) + ' taken off your income.' : money(h) + ' in your bank.');
    }

    // ---------- the month ----------
    function tile(cls, label, big, note) {
        const d = el('div', 'tile ' + (cls || ''));
        d.append(p('t-l', label), p('t-big', big));
        if (note) d.appendChild(p('t-n', note));
        return d;
    }
    function lines(rows) {
        const ul = el('ul', 'lines');
        rows.forEach(r => { const li = el('li', r[2] || ''); li.append(el('span', null, r[0]), el('span', null, r[1])); ul.appendChild(li); });
        return ul;
    }
    function feeWords(byCur) {
        return Object.keys(byCur).sort((a, b) => a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)).filter(k => byCur[k].fee !== 0)
            .map(k => inCur(byCur[k].fee, k) + ' (' + C.feeShare(byCur[k].fee, byCur[k].gross) + ')').join(' + ');
    }
    function renderSum() {
        const nowKey = C.ym(t), from = C.monthFirst(view), to = C.monthLast(view);
        $('sum-h').textContent = C.monthWords(view, null);
        $('m-next').disabled = view >= nowKey;
        $('m-now').hidden = view === nowKey;
        const s = C.stats(state, from, to), body = $('sum-body'); body.textContent = '';
        const mName = C.monthWords(view, t);
        if (s.pendingCount) {
            body.appendChild(p('alert', 'Not in your bank yet: ' + C.pendingWords(s.pending, state.cur, LOC) + ' (' + plural(s.pendingCount, 'payment', 'payments') + '). It is not counted below until you tap Edit on the payment and add what reached your bank.'));
        }
        const tiles = el('div', 'tiles');
        tiles.appendChild(tile('main', 'Reached your bank in ' + mName, money(s.home),
            s.count ? plural(s.count, 'payment', 'payments') + (s.refunds ? ', ' + plural(s.refunds, 'refund', 'refunds') + ' taken off' : '') + ', after fees' : 'No payments added for this month.'));
        tiles.appendChild(tile('taxt', state.pct ? 'Keep ' + C.pctWords(state.pct) + ' aside for tax' : 'Tax set-aside', state.pct ? money(C.setAside(s.home, state.pct)) : 'Off',
            state.pct ? 'of what reached your bank' : 'Pick a % under Tax set-aside'));
        const g = C.curList(s.byCur, 'gross', state.cur, LOC), f = feeWords(s.byCur);
        const gt = tile('', 'Paid by clients', g || money(0), f ? 'Fees taken: ' + f : 'No fees taken');
        if (g.length > 14) gt.querySelector('.t-big').style.fontSize = '1.1rem';
        tiles.appendChild(gt);
        body.appendChild(tiles);

        // average month
        const a6 = C.average(state, view, 6), a12 = C.average(state, view, 12);
        if (a6) {
            const b = el('div', 'block'); b.appendChild(el('h3', null, 'Average month'));
            const lab = a => a.months === 1 ? 'Only ' + C.shortMonth(a.from) + ' so far' : 'Last ' + a.months + ' months (' + C.shortMonth(a.from) + ' to ' + C.shortMonth(a.to) + ')';
            const rows = [[lab(a6), money(a6.avg)]];
            if (a12.months > a6.months) rows.push([lab(a12), money(a12.avg)]);
            b.appendChild(lines(rows));
            if (a6.months > 1 && a6.avg > 0) {
                const diff = s.home - a6.avg, pc = Math.round(Math.abs(diff) * 100 / a6.avg);
                b.appendChild(p('t-n', pc === 0 ? mName + ' is about the same as your average.' : mName + ' is ' + pc + '% ' + (diff > 0 ? 'above' : 'below') + ' your ' + a6.months + '-month average.'));
            }
            body.appendChild(b);
        }

        // tax year
        const tx = C.taxStats(state, from > t ? t : to < t ? to : t);
        const b = el('div', 'block'); b.appendChild(el('h3', null, 'Tax year ' + tx.ty.label + ' (' + C.rangeWords(tx.ty.from, tx.ty.to) + ')'));
        const rows = [['Reached your bank (' + plural(tx.s.count, 'payment', 'payments') + ')', money(tx.s.home)]];
        if (state.pct) {
            rows.push(['Keep ' + C.pctWords(state.pct) + ' aside for tax', money(tx.need)], ['Put aside so far', money(tx.putAside)]);
            if (tx.left > 0) rows.push(['Still to put aside', money(tx.left), 'strong']);
            else if (tx.need > 0 || tx.putAside > 0) rows.push([tx.left === 0 ? 'You have put aside exactly enough' : 'Put aside more than needed', tx.left === 0 ? money(0) : money(-tx.left), 'strong good']);
        }
        b.appendChild(lines(rows));
        if (tx.s.pendingCount) b.appendChild(p('t-n', 'Plus ' + C.pendingWords(tx.s.pending, state.cur, LOC) + ' not in your bank yet.'));
        const best = C.clientStats(state, tx.ty.from, tx.ty.to).filter(r => r.s.home > 0);
        if (best.length && tx.s.home > 0) b.appendChild(p('t-n', 'Best client: ' + best[0].c.name + ', ' + Math.round(best[0].s.home * 100 / tx.s.home) + '% of your income this tax year.'));
        body.appendChild(b);

        // last 12 months
        const ms = C.months(state, view, 12), top = Math.max(1, ...ms.map(m => m.home));
        const det = el('details', 'months'); det.appendChild(el('summary', null, 'Last 12 months'));
        const ul = el('ul', 'bars');
        ms.slice().reverse().forEach(m => {
            const li = el('li', m.key === view ? 'cur-m' : '');
            const bar = el('span', 'bar'), fill = el('span'); fill.style.width = Math.max(0, Math.round(m.home * 100 / top)) + '%'; bar.appendChild(fill);
            bar.setAttribute('aria-hidden', 'true');
            li.append(el('span', null, C.shortMonth(m.key)), bar, el('span', 'bv', money(m.home) + (m.pending ? ' +' + m.pending + ' waiting' : '')));
            ul.appendChild(li);
        });
        det.appendChild(ul);
        body.appendChild(det);

        const bt = el('div', 'sum-btns');
        bt.append(btn('Copy summary', 'secondary', () => copyText(C.summaryText(state, view, t, LOC), 'sum-msg')),
            btn('Email summary', 'secondary', () => {
                const a = el('a'); a.href = 'mailto:?subject=' + encodeURIComponent('Freelance income for ' + C.monthWords(view, null)) + '&body=' + encodeURIComponent(C.summaryText(state, view, t, LOC));
                document.body.appendChild(a); a.click(); a.remove();
            }),
            btn('Save list for accountant', 'secondary', () => {
                download('freelance-income-' + tx.ty.label + '.csv', 'text/csv', '﻿' + C.csv(state, tx.ty.from, tx.ty.to));
                flash = { where: 'sum-msg', text: 'Saved a CSV file of tax year ' + tx.ty.label + '. It opens in Excel or Google Sheets.' }; render();
            }, 'Save list for accountant (CSV file of the tax year)'));
        body.appendChild(bt);
    }

    // ---------- payments ----------
    function renderPays() {
        const list = state.pays.filter(x => C.ym(x.date) === view).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
        $('pays-h').textContent = 'Payments in ' + C.monthWords(view, t) + (list.length ? ' (' + list.length + ')' : '');
        const ul = $('p-list'); ul.textContent = '';
        if (!list.length) { ul.appendChild(el('li', 'empty', 'No payments in ' + C.monthWords(view, t) + '.')); return; }
        list.forEach(x => {
            const c = client(x.client), h = C.homeOf(x), li = el('li', 'pay' + (h == null ? ' is-pending' : '') + (x.refund ? ' is-refund' : ''));
            const top = el('div', 'pay-top');
            top.append(p('pay-n', (c ? c.name : 'Client') + ' · ' + date(x.date)), p('pay-a', h == null ? inCur(C.sign(x) * C.net(x), x.cur) : money(h)));
            li.appendChild(top);
            if (x.refund) li.appendChild(p('pay-s bad-t', 'Money taken back (refund or chargeback)'));
            const bits = [(x.refund ? 'Taken back ' : 'Client paid ') + inCur(x.gross, x.cur)];
            bits.push(x.fee ? 'fee ' + inCur(x.fee, x.cur) + ' (' + C.feeShare(x.fee, x.gross) + ')' : 'no fee');
            const rt = C.rateOf(x);
            if (rt) bits.push('rate ' + C.fmtRate(rt));
            li.appendChild(p('pay-s', bits.join(', ')));
            if (h == null) li.appendChild(p('pay-s warn-t', 'Not in your bank yet: ' + inCur(C.net(x), x.cur) + ' after the fee. Tap Edit when you withdraw it.'));
            if (x.note) li.appendChild(p('pay-s', x.note));
            const b = el('div', 'pay-b');
            b.append(btn(h == null ? 'Edit: add what reached the bank' : 'Edit', 'secondary small', () => startEdit(x.id), 'Edit the payment from ' + (c ? c.name : 'client') + ' on ' + date(x.date)),
                btn('Delete', 'secondary small danger-t', () => {
                    if (editId === x.id) resetForm();
                    change(() => { state.pays = state.pays.filter(y => y.id !== x.id); }, 'pays-msg', 'Deleted the payment from ' + (c ? c.name : 'the client') + ' on ' + date(x.date) + '.');
                }, 'Delete the payment from ' + (c ? c.name : 'client') + ' on ' + date(x.date)));
            li.appendChild(b);
            ul.appendChild(li);
        });
    }

    // ---------- clients ----------
    function renderClients() {
        const tx = C.taxYear(C.monthFirst(view) > t ? t : C.monthLast(view) < t ? C.monthLast(view) : t, state.taxStart);
        const rows = C.clientStats(state, tx.from, tx.to), total = rows.reduce((a, r) => a + Math.max(0, r.s.home), 0);
        $('clients-hint').textContent = 'Tax year ' + tx.label + ', best paying first.';
        const list = $('c-list'); list.textContent = '';
        rows.forEach((r, i) => {
            const c = r.c, box = el('article', 'client' + (r.s.count ? '' : ' quiet'));
            box.id = 'c-' + c.id;
            const topRow = el('div', 'c-top'); topRow.appendChild(el('h3', 'c-name', c.name));
            if (i === 0 && r.s.home > 0 && rows.length > 1) topRow.appendChild(el('span', 'tag', 'Best client'));
            box.appendChild(topRow);
            box.appendChild(p('c-big', money(r.s.home)));
            const share = total > 0 && r.s.home > 0 ? Math.round(r.s.home * 100 / total) : 0;
            box.appendChild(p('c-line', r.s.count ? plural(r.s.count, 'payment', 'payments') + ' this tax year' + (total > 0 ? ', ' + share + '% of your income' : '') : 'No payments this tax year'));
            const g = Object.keys(r.s.byCur).sort().filter(k => r.s.byCur[k].gross).map(k => inCur(r.s.byCur[k].gross, k)).join(' + ');
            const f = feeWords(r.s.byCur);
            if (g) box.appendChild(p('c-line', 'Paid ' + g + (f ? '; fees ' + f : '; no fees')));
            if (r.s.pending) box.appendChild(p('c-line warn-t', plural(r.s.pending, 'payment', 'payments') + ' not in your bank yet'));
            box.appendChild(p('c-line', r.last ? 'Last paid ' + date(r.last) + ' (' + plural(r.total, 'payment', 'payments') + ' in all)' : 'No payments yet'));
            if (total > 0) { const bar = el('div', 'share'), fill = el('span'); fill.style.width = share + '%'; bar.appendChild(fill); bar.setAttribute('aria-hidden', 'true'); box.appendChild(bar); }
            if (panel[c.id] === 'rename') {
                const pn = el('div', 'panel'), id = 'rn-' + c.id;
                const l = el('label', null, 'New name'); l.htmlFor = id;
                const inp = el('input'); inp.type = 'text'; inp.id = id; inp.maxLength = 50; inp.value = c.name; inp.autocomplete = 'off'; inp.setAttribute('aria-describedby', id + '-err');
                const er = p('err'); er.id = id + '-err'; er.setAttribute('role', 'alert');
                const rb = el('div', 'row-btns');
                const go = () => {
                    const v = inp.value.trim().replace(/\s+/g, ' ');
                    if (!v) { er.textContent = 'Type a name.'; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
                    if (state.clients.some(o => o.id !== c.id && o.name.toLowerCase() === v.toLowerCase())) { er.textContent = 'You already have a client with that name.'; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
                    delete panel[c.id];
                    change(() => { client(c.id).name = v; }, 'c-msg-' + c.id, 'Renamed to ' + v + '.');
                    fillClients();
                };
                inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
                rb.append(btn('Save name', 'primary small', go), btn('Cancel', 'secondary small', () => { delete panel[c.id]; render(); }));
                pn.append(l, inp, er, rb);
                box.appendChild(pn);
            } else {
                const lb = el('div', 'l-btns');
                lb.append(btn('Add a payment', 'primary', () => {
                    if (editId) resetForm();
                    $('f-client').value = c.id; applyDefaults(); updateForm();
                    $('add').scrollIntoView({ block: 'start', behavior: 'smooth' }); $('f-gross').focus({ preventScroll: true });
                }, 'Add a payment from ' + c.name),
                btn('Rename', 'secondary', () => { panel[c.id] = 'rename'; render(); const i2 = $('rn-' + c.id); if (i2) { i2.focus(); i2.select(); } }, 'Rename ' + c.name),
                btn('Delete client', 'secondary danger-t', () => {
                    const n = state.pays.filter(x => x.client === c.id).length;
                    if (editId && state.pays.some(x => x.id === editId && x.client === c.id)) resetForm();
                    change(() => { state.clients = state.clients.filter(o => o.id !== c.id); state.pays = state.pays.filter(x => x.client !== c.id); }, 'clients-msg',
                        'Deleted ' + c.name + (n ? ' and ' + plural(n, 'payment', 'payments') : '') + '.');
                    fillClients();
                }, 'Delete ' + c.name + ' and their payments'));
                box.appendChild(lb);
            }
            const m = el('div', 'msg'); m.id = 'c-msg-' + c.id; m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite');
            box.appendChild(m);
            list.appendChild(box);
        });
        let cm = $('clients-msg');
        if (!cm) { cm = el('div', 'msg'); cm.id = 'clients-msg'; cm.setAttribute('role', 'status'); cm.setAttribute('aria-live', 'polite'); $('clients').appendChild(cm); }
    }

    // ---------- tax ----------
    function fillSettings() {
        const s = $('t-pct'); s.textContent = '';
        PCTS.forEach(v => { const o = el('option', null, v ? C.pctWords(v) : 'Nothing (0%)'); o.value = String(v); s.appendChild(o); });
        const o = el('option', null, 'Your own %'); o.value = 'custom'; s.appendChild(o);
        const custom = !PCTS.includes(state.pct);
        s.value = custom ? 'custom' : String(state.pct);
        $('t-custom-box').hidden = !custom;
        if (custom) $('t-custom').value = C.pctWords(state.pct).replace('%', '');
        const y = $('t-year'); y.textContent = '';
        Object.keys(C.TAX_YEARS).forEach(k => { const x = el('option', null, C.TAX_YEARS[k]); x.value = k; y.appendChild(x); });
        y.value = state.taxStart;
        const c = $('cur'); c.textContent = '';
        const names = Object.assign({}, CUR_NAMES);
        if (!(state.cur in names)) names[state.cur] = state.cur;
        Object.keys(names).forEach(k => { const x = el('option', null, names[k]); x.value = k; c.appendChild(x); });
        c.value = state.cur;
        fillCurSelect();
    }
    function renderSaved() {
        $('s-tag').hidden = !state.cur; $('s-tag').textContent = state.cur;
        const ul = $('s-list'); ul.textContent = '';
        state.saved.slice().sort((a, b) => a.date < b.date ? 1 : -1).forEach(x => {
            const li = el('li');
            li.append(el('span', null, date(x.date, { year: true }) + ': ' + money(x.amt)),
                btn('Remove', 'link danger-t', () => change(() => { state.saved = state.saved.filter(y => y.id !== x.id); }, 'tax-msg', 'Removed ' + money(x.amt) + ' put aside on ' + date(x.date) + '.'), 'Remove ' + money(x.amt) + ' put aside on ' + date(x.date)));
            ul.appendChild(li);
        });
    }

    // ---------- the page ----------
    function render() {
        t = C.today(new Date());
        if (view > C.ym(t)) view = C.ym(t);
        const any = state.pays.length > 0;
        $('intro').hidden = any;
        $('sum').hidden = !any;
        $('pays').hidden = !any;
        $('clients').hidden = !state.clients.length;
        if (any) { renderSum(); renderPays(); }
        if (state.clients.length) renderClients();
        renderSaved();
        $('add-hint').hidden = any || !!editId;
        $('restore-first').hidden = state.clients.length > 0;
        $('del-all').disabled = !state.clients.length && !state.saved.length;
        clearMsgs();
        if (loadNote) showMsg($('top-msg'), loadNote, false, true);
        if (flash) {
            let box = $(flash.where);
            if (!box) box = $('top-msg');
            showMsg(box, flash.text, flash.undo, flash.bad);
            flash = null;
        }
    }

    // ---------- start ----------
    load();
    if (!canSave) $('store-warn').hidden = false;
    fillSettings();
    $('f-client').addEventListener('change', () => { setErr('f-new', ''); applyDefaults(); updateForm(); if ($('f-client').value === NEW) $('f-new').focus(); });
    $('f-cur').addEventListener('change', () => { if ($('f-cur').value && conv() === 'home' && !$('f-home').value && !$('f-rate').value) setConv('home'); updateForm(); });
    document.querySelectorAll('input[name="f-conv"]').forEach(r => r.addEventListener('change', () => { setErr('f-home', ''); setErr('f-rate', ''); updateForm(); }));
    ['f-new', 'f-gross', 'f-fee', 'f-home', 'f-rate', 'f-date'].forEach(id => $(id).addEventListener('input', () => { setErr(id, ''); preview(); }));
    $('f-date').addEventListener('change', preview);
    $('f-refund').addEventListener('change', preview);
    $('f-note-open').addEventListener('click', () => { $('f-note-box').hidden = false; $('f-note-open').hidden = true; $('f-note').focus(); });
    $('f-save').addEventListener('click', saveForm);
    $('f-cancel').addEventListener('click', () => { resetForm(); render(); });
    $('add').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'radio') { e.preventDefault(); saveForm(); } });
    $('m-prev').addEventListener('click', () => { view = C.addMonth(view, -1); render(); });
    $('m-next').addEventListener('click', () => { if (view < C.ym(t)) view = C.addMonth(view, 1); render(); });
    $('m-now').addEventListener('click', () => { view = C.ym(t); render(); $('sum-h').focus && $('m-prev').focus(); });

    $('t-pct').addEventListener('change', () => {
        const v = $('t-pct').value;
        if (v === 'custom') { $('t-custom-box').hidden = false; $('t-custom').value = ''; setErr('t-custom', ''); $('t-custom').focus(); return; }
        $('t-custom-box').hidden = true;
        change(() => { state.pct = +v; }, 'tax-msg', +v ? 'Keeping ' + C.pctWords(+v) + ' aside for tax.' : 'Not keeping anything aside for tax.');
    });
    const saveCustom = () => {
        const r = C.parsePct($('t-custom').value, 6000);
        if (r.error) { setErr('t-custom', r.error); $('t-custom').focus(); return; }
        setErr('t-custom', '');
        change(() => { state.pct = r.n; }, 'tax-msg', 'Keeping ' + C.pctWords(r.n) + ' aside for tax.');
        fillSettings();
    };
    $('t-custom-save').addEventListener('click', saveCustom);
    $('t-custom').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveCustom(); } });
    $('t-custom').addEventListener('input', () => setErr('t-custom', ''));
    $('t-year').addEventListener('change', () => { const v = $('t-year').value; change(() => { state.taxStart = v; }, 'tax-msg', 'Your tax year now runs ' + C.TAX_YEARS[v].replace(/ \(.*\)$/, '') + '.'); });
    $('s-date').value = t;
    const addSaved = () => {
        const r = C.parseMoney($('s-amt').value, { positive: true, zero: 'Type an amount bigger than 0.' });
        if (r.error) { setErr('s-amt', r.error); $('s-amt').focus(); return; }
        const d = C.isDate($('s-date').value) ? $('s-date').value : t;
        setErr('s-amt', '');
        change(() => { state.saved.push({ id: newId('s'), date: d, amt: r.n, note: '' }); }, 'tax-msg', 'Added ' + money(r.n) + ' put aside on ' + date(d) + '.');
        $('s-amt').value = ''; $('s-date').value = t;
    };
    $('s-add').addEventListener('click', addSaved);
    $('s-amt').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSaved(); } });
    $('s-amt').addEventListener('input', () => setErr('s-amt', ''));

    $('cur').addEventListener('change', () => { const v = $('cur').value; state.cur = v; save(); fillCurSelect(); updateForm(); flash = { where: 'tools-msg', text: v ? 'Money in your bank now shows ' + v + '.' : 'Money in your bank now shows plain numbers.' }; render(); });
    $('backup').addEventListener('click', () => {
        if (!state.clients.length && !state.saved.length) { flash = { where: 'tools-msg', text: 'Nothing to back up yet.' }; render(); return; }
        download('freelance-income-backup-' + t + '.json', 'application/json', JSON.stringify(Object.assign({ app: SLUG }, state), null, 1));
        flash = { where: 'tools-msg', text: 'Saved the backup file. Keep it somewhere safe, such as your email or cloud drive.' }; render();
    });
    const pick = () => { $('restore-file').value = ''; $('restore-file').click(); };
    $('restore').addEventListener('click', pick);
    $('restore-first').addEventListener('click', pick);
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; if (!f) return;
        const where = state.clients.length ? 'tools-msg' : 'add-msg';
        if (f.size > 5000000) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const r = new FileReader();
        r.onload = () => {
            let s = null; try { s = C.cleanState(JSON.parse(r.result)); } catch (e) { s = null; }
            if (!s || (!s.clients.length && !s.saved.length)) { flash = { where, text: 'That file is not a backup from this app, or it has no payments in it.', bad: true }; render(); return; }
            loadNote = ''; panel = {};
            const last = s.pays.reduce((a, x) => x.date > a ? x.date : a, '');
            view = last ? C.ym(last) : C.ym(t);
            change(() => { state = s; }, 'tools-msg', 'Restored ' + plural(s.clients.length, 'client', 'clients') + ' and ' + plural(s.pays.length, 'payment', 'payments') + '.');
            fillSettings(); resetForm();
        };
        r.onerror = () => { flash = { where, text: 'Could not read that file.', bad: true }; render(); };
        r.readAsText(f);
    });
    $('del-all').addEventListener('click', () => {
        panel = {}; loadNote = '';
        change(() => { state = Object.assign(C.emptyState(), { cur: state.cur, pct: state.pct, taxStart: state.taxStart }); }, 'tools-msg', 'Deleted everything.');
        resetForm();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && C.today(new Date()) !== t && !editId && !Object.keys(panel).length) { const old = t; render(); if ($('f-date').value === old) $('f-date').value = t; } });
    resetForm();
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
