// Medical Bill Reimbursement Tracker: the page. The maths and the words are in core.js (window.MBR).
(function () {
    'use strict';
    const C = window.MBR, SLUG = 'medical-bill-reimbursement-tracker-for-employer-and-insurance-claims', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    // a locale Intl accepts (some systems report tags such as "en-US@posix")
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', '₦': '₦ (naira)',
        'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', 'Rp': 'Rp (rupiah)', 'RM': 'RM (ringgit)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const DAYS_OPTS = [['', 'No time limit'], ['30', '30 days after the bill'], ['60', '60 days after the bill'], ['90', '90 days after the bill'], ['120', '120 days after the bill'],
        ['180', '180 days after the bill'], ['365', '1 year after the bill'], ['other', 'Other number of days…']];
    const KIND_WORDS = { 'Doctor': 'Doctor (consultation)', 'Lab test': 'Lab test or scan', 'Medicine': 'Medicine (pharmacy)', 'Hospital': 'Hospital or surgery', 'Dentist': 'Dentist', 'Eyes': 'Eyes (glasses, eye doctor)', 'Other': 'Other' };
    let state = C.emptyState(), today = C.localDay(new Date());
    let editing = null;        // id of the bill in the form, or null when adding
    let tab = 'todo', showAllBills = false, showAllHist = false;
    let ticks = {};            // bill id -> typed amount to claim
    let nc = { d: '', ref: '', payer: '' };
    let panel = null;          // { id, mode: 'paid' | 'rej' | 'edit', ... } open on one claim
    let payerEdit = null;      // payer id being edited, or 'new'
    let flash = null, undoSnap = null, canSave = true;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (!raw) return;
        try { const s = C.cleanState(JSON.parse(raw)); if (s) state = s; } catch (e) { /* corrupt: start fresh */ }
    }
    function save() {
        if (!canSave) { $('store-warn').hidden = false; return; }
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canSave = false; $('store-warn').hidden = false; }
    }
    const snap = () => JSON.stringify(state);
    // no bill may be claimed for more than it cost (a rejected claim gives its amount back)
    function overClaimed() {
        return state.bills.find(b => {
            let used = 0;
            state.claims.forEach(c => {
                if (c.st === 'rej') return;
                const sh = c.st === 'paid' && c.rest ? C.share(c.got, c.items.map(it => it.a)) : null;
                c.items.forEach((it, i) => { if (it.b === b.id) used += sh ? sh[i] : it.a; });
            });
            return used > b.amt;
        });
    }
    function change(fn, where, text) {
        const before = snap();
        if (fn() === false) return false;
        const bad = overClaimed();
        if (bad) {
            state = C.cleanState(JSON.parse(before));
            flash = { where, text: 'That would claim ' + bad.who + "'s " + bad.kind.toLowerCase() + ' bill of ' + money(bad.amt) + ' for more than it cost. Its bills are in another claim now.', bad: true };
            render();
            return false;
        }
        save();
        undoSnap = before;
        flash = { where, text, undo: true };
        render();
        return true;
    }
    function undo() {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap));
        if (s) state = s;
        const where = flash && $(flash.where) ? flash.where : 'top-msg';
        undoSnap = null; panel = null; payerEdit = null;
        if (editing && !byId(editing)) cancelEdit();
        save();
        flash = { where, text: 'Undone.' };
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    function p(cls, text) { return el('p', cls, text); }
    const money = c => C.fmtMoney(c, state.cur, LOC);
    const plain = c => C.fmtMoney(c, '', 'en-US').replace(/,/g, '');
    const yr = s => s.slice(0, 4) === today.slice(0, 4) ? undefined : true;
    const date = (s, o) => C.fmtDate(s, LOC, o === undefined ? yr(s) : o);
    const dateWd = s => C.fmtDate(s, LOC, yr(s) ? 'wdy' : 'wd');
    const byId = id => state.bills.find(x => x.id === id);
    const payerOf = id => state.payers.find(x => x.id === id);
    const claimOf = id => state.claims.find(x => x.id === id);
    const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const what = b => b.who + ' · ' + b.kind;
    const many = () => state.payers.length > 1;
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into the form, a message or an email.' }; render(); };
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Use Email instead.', bad: true }; render(); }
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
    function download(name, type, text) {
        const blob = new Blob([text], { type });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function field(labelText, input, errId, hint) {
        const w = el('div', 'field');
        const l = el('label', null, labelText); l.htmlFor = input.id; w.appendChild(l);
        w.appendChild(input);
        if (hint) w.appendChild(p('hint', hint));
        if (errId) { const e = p('err', ''); e.id = errId; e.setAttribute('role', 'alert'); w.appendChild(e); input.setAttribute('aria-describedby', errId); }
        return w;
    }
    function textInput(id, value, placeholder, mode, max) {
        const i = el('input'); i.type = 'text'; i.id = id; i.value = value || ''; i.autocomplete = 'off'; i.maxLength = max || 20;
        if (placeholder) i.placeholder = placeholder; if (mode) i.inputMode = mode; return i;
    }
    function dateInput(id, value, min) { const i = el('input'); i.type = 'date'; i.id = id; i.value = value || ''; i.max = today; if (min) i.min = min; return i; }
    function amountRow(input) {
        const r = el('div', 'amount-row');
        if (state.cur) r.appendChild(el('span', 'cur-tag', state.cur));
        r.appendChild(input); return r;
    }
    function select(id, opts, value) {
        const s = el('select'); s.id = id;
        opts.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; s.appendChild(o); });
        s.value = value; return s;
    }
    function checkDay(v, min, what) {
        if (!v) return 'Pick the ' + what + '.';
        if (!C.isDay(v)) return 'That date does not exist.';
        if (v > today) return 'That date is in the future.';
        if (min && v < min) return 'That is before ' + date(min, true) + '.';
        return '';
    }

    // ---------- the bill form ----------
    function fillCur() {
        const sel = $('cur');
        Object.keys(CUR_NAMES).forEach(k => { const o = el('option', null, CUR_NAMES[k]); o.value = k; sel.appendChild(o); });
        if (state.cur && !(state.cur in CUR_NAMES)) { const o = el('option', null, state.cur); o.value = state.cur; sel.appendChild(o); }
        sel.value = state.cur;
    }
    function fillKinds() { C.KINDS.forEach(k => { const o = el('option', null, KIND_WORDS[k]); o.value = k; $('b-kind').appendChild(o); }); }
    function fillPayerSelect(sel, value) {
        sel.textContent = '';
        state.payers.forEach(p => { const o = el('option', null, p.name); o.value = p.id; sel.appendChild(o); });
        sel.value = state.payers.some(p => p.id === value) ? value : state.payers[0].id;
    }
    function openMore(open) { $('b-more').hidden = !open; $('b-more-open').hidden = open; }
    function resetForm(keep) {
        const was = { d: $('b-date').value, who: $('b-who').value, payer: $('b-payer').value };
        editing = null;
        $('b-date').value = keep && was.d ? was.d : today; $('b-amt').value = ''; $('b-who').value = keep ? was.who : '';
        $('b-kind').value = 'Doctor'; $('b-place').value = ''; $('b-note').value = '';
        fillPayerSelect($('b-payer'), keep ? was.payer : state.payers[0].id);
        ['b-date', 'b-amt', 'b-who'].forEach(id => setErr(id, ''));
        openMore(false);
        $('add-h').textContent = 'Add a medical bill'; $('b-save').textContent = 'Save bill'; $('b-cancel').hidden = true;
    }
    function cancelEdit() { resetForm(false); }
    function editBill(b) {
        resetForm(false);
        editing = b.id;
        $('b-date').value = b.d; $('b-amt').value = plain(b.amt); $('b-who').value = b.who; $('b-kind').value = b.kind;
        fillPayerSelect($('b-payer'), b.payer);
        $('b-place').value = b.place || ''; $('b-note').value = b.note || '';
        openMore(!!(b.place || b.note));
        $('add-h').textContent = 'Edit bill'; $('b-save').textContent = 'Save changes'; $('b-cancel').hidden = false;
        render();
        $('add').scrollIntoView({ block: 'start' });
        $('b-amt').focus({ preventScroll: true });
    }
    function readForm() {
        let ok = true;
        ok = setErr('b-date', checkDay($('b-date').value, null, 'date of the bill')) && ok;
        const r = C.parseMoney($('b-amt').value, true);
        if (r.error) ok = setErr('b-amt', r.error) && ok; else setErr('b-amt', '');
        if (!r.error && editing) {
            const used = byId(editing).amt - C.openWithout(state, editing, null);
            if (r.n < used) ok = setErr('b-amt', money(used) + ' of this bill is already in a claim. Lower the claim first (Edit claim), then the bill.') && ok;
        }
        const who = $('b-who').value.trim();
        ok = setErr('b-who', who ? '' : 'Type who the bill was for, such as Me or Mother.') && ok;
        if (!ok) { const bad = document.querySelector('#add [aria-invalid="true"]'); if (bad) bad.focus(); return null; }
        const o = { d: $('b-date').value, amt: r.n, who, kind: $('b-kind').value, payer: $('b-payer').value };
        const place = $('b-place').value.trim(), note = $('b-note').value.trim();
        if (place) o.place = place; if (note) o.note = note;
        return o;
    }
    function saveBill() {
        const f = readForm();
        if (!f) return;
        if (editing) {
            const id = editing;
            const done = change(() => {
                const b = byId(id);
                ['place', 'note'].forEach(k => delete b[k]);
                Object.assign(b, f);
            }, 'add-msg', 'Saved the changes to ' + what(f) + '.');
            if (done) resetForm(false);
            return;
        }
        const b = Object.assign({ id: newId('b') }, f);
        const p = payerOf(b.payer);
        resetForm(true);
        change(() => { state.bills.push(b); }, 'add-msg', 'Saved: ' + what(b) + ', ' + money(b.amt) + '.' + (p && p.days ? ' Claim by ' + date(C.addDays(b.d, p.days), true) + '.' : ''));
        $('b-amt').focus({ preventScroll: true });
    }
    function renderWho() {
        const box = $('who-quick'); box.textContent = '';
        const seen = [];
        state.bills.slice().sort((a, b) => a.d < b.d ? 1 : -1).forEach(b => { if (!seen.includes(b.who)) seen.push(b.who); });
        seen.slice(0, 8).forEach(n => { const c = btn(n, 'chip', () => { $('b-who').value = n; setErr('b-who', ''); }); c.setAttribute('aria-label', 'For ' + n); box.appendChild(c); });
        box.hidden = !seen.length;
    }

    // ---------- the summary ----------
    function summaryText(a) {
        const L = ['Medical bills, ' + C.fmtDate(today, LOC, true)];
        if (a.todo.length) {
            const first = a.todo.find(x => x.claimBy);
            L.push('Still to claim: ' + money(a.openTotal) + ' (' + C.billsWord(a.todo.length) + ')' + (first ? '. Claim the first by ' + date(first.claimBy, true) + '.' : '.'));
        } else L.push('Nothing left to claim.');
        if (a.waiting.length) L.push('Claimed, waiting: ' + money(a.waitTotal) + ' (' + a.waiting.length + (a.waiting.length === 1 ? ' claim' : ' claims') + ', oldest sent ' + date(a.waiting[0].claim.d, true) + ').');
        L.push('Spent on bills: ' + money(a.spentTotal) + '. Refunded: ' + money(a.refundedTotal) + '. Not refunded: ' + money(notRefunded(a)) + '.');
        a.years.forEach(y => { const t = yearWords(y); if (t) L.push(y.payer.name + ', ' + date(y.from, true) + ' to ' + date(y.to, true) + ': ' + t); });
        if (a.todo.length) {
            L.push('', 'Not claimed yet:');
            a.todo.forEach(x => L.push('- ' + date(x.bill.d, true) + ', ' + x.bill.who + ', ' + x.bill.kind + (x.bill.place ? ' (' + x.bill.place + ')' : '') + ': ' + money(x.open) + (x.claimBy ? ', claim by ' + date(x.claimBy, true) : '')));
        }
        return L.join('\n');
    }
    const notRefunded = a => a.spentTotal - a.refundedTotal - a.bills.reduce((s, x) => s + x.waiting + x.open, 0);
    function yearWords(y) {
        const p = y.payer;
        if (p.limit == null) return y.used ? 'refunded ' + money(y.refunded) + ', waiting ' + money(y.waiting) + '. No yearly limit set.' : '';
        if (p.per === 'person') return 'limit ' + money(p.limit) + ' for each person. ' + (y.perPerson.length ? y.perPerson.map(q => q.who + ' ' + money(q.used) + ' used, ' + (q.left >= 0 ? money(q.left) + ' left' : money(-q.left) + ' over')).join('; ') + '.' : 'Nothing claimed yet.');
        return money(y.used) + ' used of ' + money(p.limit) + ' (refunded ' + money(y.refunded) + ', waiting ' + money(y.waiting) + '), ' + (y.left >= 0 ? money(y.left) + ' left.' : money(-y.left) + ' over the limit.');
    }
    function limitBar(used, limit) {
        const bar = el('div', 'bar'), fill = el('span');
        fill.style.width = (limit > 0 ? Math.min(100, Math.round(used * 100 / limit)) : 100) + '%';
        if (used > limit) bar.classList.add('over');
        bar.appendChild(fill); bar.setAttribute('aria-hidden', 'true'); return bar;
    }
    function renderGlance(a) {
        const body = $('glance-body'); body.textContent = '';
        const top = el('div', 'g-main ' + (a.late.length ? 'is-late' : a.soon.length ? 'is-soon' : a.todo.length ? 'is-todo' : 'is-clear'));
        if (a.todo.length) {
            top.appendChild(p('g-label', 'Still to claim'));
            top.appendChild(p('g-big', money(a.openTotal)));
            const first = a.todo.find(x => x.claimBy && x.left >= 0);
            top.appendChild(p('g-line', C.billsWord(a.todo.length) + (first ? ' · claim the first by ' + dateWd(first.claimBy) + ' (' + C.inDays(first.left) + ')' : '')));
            if (a.late.length) top.appendChild(p('g-late', C.billsWord(a.late.length) + ' ' + (a.late.length === 1 ? 'is' : 'are') + ' past the time limit to claim (' + money(a.late.reduce((s, x) => s + x.open, 0)) + '). Ask if they can still be accepted.'));
            else if (a.soon.length) top.appendChild(p('g-soon', C.billsWord(a.soon.length) + ' must be claimed within ' + C.SOON + ' days.'));
        } else {
            top.appendChild(p('g-label', 'Still to claim'));
            top.appendChild(p('g-big', money(0)));
            top.appendChild(p('g-line', 'Nothing left to claim. Add a bill when you pay one.'));
        }
        body.appendChild(top);
        const w = el('div', 'g-wait');
        if (a.waiting.length) {
            const o = a.waiting[0];
            w.appendChild(p('g-label', 'Claimed, waiting for the refund'));
            w.appendChild(p('g-mid', money(a.waitTotal)));
            w.appendChild(p('g-line', a.waiting.length + (a.waiting.length === 1 ? ' claim' : ' claims') + ' · oldest sent ' + date(o.claim.d) + ' (' + C.daysWord(o.age) + ' ago)'));
        } else { w.appendChild(p('g-label', 'Claimed, waiting for the refund')); w.appendChild(p('g-line', 'No claims waiting.')); }
        body.appendChild(w);
        const tiles = el('div', 'tiles');
        [['Spent on bills', a.spentTotal], ['Refunded so far', a.refundedTotal], ['Not refunded', notRefunded(a)]].forEach(([t, v], i) => {
            const d = el('div', 'tile' + (i === 1 ? ' good' : '')); d.appendChild(p('t-label', t)); d.appendChild(p('t-val', money(v))); tiles.appendChild(d);
        });
        body.appendChild(tiles);
        body.appendChild(p('hint t-hint', 'Not refunded: bills you chose not to claim and the part of claims that was not paid back.'));
        a.years.forEach(y => {
            const pr = y.payer;
            if (pr.limit == null && !y.used) return;
            const box = el('div', 'yr');
            box.appendChild(p('y-h', pr.name + ' · claim year ' + date(y.from, true) + ' to ' + date(y.to, true)));
            if (pr.limit == null) { box.appendChild(p('y-line', 'Refunded ' + money(y.refunded) + ' · waiting ' + money(y.waiting) + '. No yearly limit set.')); }
            else if (pr.per === 'person') {
                box.appendChild(p('y-line', 'Yearly limit ' + money(pr.limit) + ' for each person.'));
                const names = a.people.map(q => q.who);
                if (!names.length) box.appendChild(p('y-line', 'Nothing claimed yet.'));
                names.forEach(n => {
                    const q = y.perPerson.find(x => x.who === n) || { who: n, used: 0, left: pr.limit };
                    const r = el('div', 'y-person');
                    r.appendChild(p('y-line', n + ': ' + money(q.used) + ' used, ' + (q.left >= 0 ? money(q.left) + ' left' : money(-q.left) + ' over the limit')));
                    r.appendChild(limitBar(q.used, pr.limit)); box.appendChild(r);
                });
            } else {
                box.appendChild(p('y-big' + (y.left < 0 ? ' over' : ''), y.left >= 0 ? money(y.left) + ' of ' + money(pr.limit) + ' left' : money(-y.left) + ' over the ' + money(pr.limit) + ' limit'));
                box.appendChild(limitBar(y.used, pr.limit));
                box.appendChild(p('y-line', 'Used ' + money(y.used) + ': refunded ' + money(y.refunded) + ', waiting ' + money(y.waiting) + '.'));
                const openHere = a.todo.filter(x => x.bill.payer === pr.id && x.bill.d >= y.from && x.bill.d <= y.to).reduce((s, x) => s + x.open, 0);
                if (openHere > 0 && openHere > Math.max(0, y.left)) box.appendChild(p('y-warn', 'Your unclaimed bills from this year (' + money(openHere) + ') are more than the limit left. Claim the most important ones first.'));
            }
            body.appendChild(box);
        });
        const mail = $('g-mail');
        mail.href = 'mailto:?subject=' + encodeURIComponent('Medical bills and claims') + '&body=' + encodeURIComponent(summaryText(a).slice(0, 1800));
        const first = a.todo.find(x => x.claimBy && x.left >= 0);
        $('g-cal').hidden = !first;
    }
    function calendar(a) {
        const first = a.todo.find(x => x.claimBy && x.left >= 0);
        if (!first) return;
        const day = first.claimBy, list = a.todo.filter(x => x.claimBy === day);
        const now = new Date(), stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        const text = 'Last day to claim these medical bills from ' + first.payer.name + ':\n' + list.map(x => date(x.bill.d, true) + ', ' + x.bill.who + ', ' + x.bill.kind + ': ' + money(x.open)).join('\n');
        download('claim-medical-bills-by-' + day + '.ics', 'text/calendar', C.ics(day, 'Last day to claim medical bills (' + first.payer.name + ')', text, stamp));
        flash = { where: 'glance-msg', text: 'Saved a calendar file for ' + date(day, true) + ', with a reminder 2 days before. Open it to add it to your calendar.' };
        render();
    }

    // ---------- bills ----------
    function statusLine(x) {
        const b = x.bill, box = el('div', 'b-status');
        if (x.status === 'todo') {
            const t = x.claimBy ? (x.left < 0 ? 'Past the time limit: claim by was ' + date(x.claimBy) + ' (' + C.daysWord(-x.left) + ' ago)' : 'Claim by ' + dateWd(x.claimBy) + ' (' + C.inDays(x.left) + ')') : 'No time limit to claim';
            box.appendChild(el('span', 'tag ' + x.urgency, x.urgency === 'soon' ? 'Claim soon · ' + t : t));
            if (x.open !== b.amt) box.appendChild(p('b-part', money(x.open) + ' still to claim of ' + money(b.amt) + (x.waiting ? ' (' + money(x.waiting) + ' waiting)' : x.refunded ? ' (' + money(x.refunded) + ' refunded)' : '')));
        } else if (x.status === 'wait') box.appendChild(el('span', 'tag wait', 'Claimed, waiting: ' + money(x.waiting)));
        else if (x.status === 'paid') box.appendChild(el('span', 'tag paid', x.refunded >= b.amt ? 'Refunded in full' : 'Refunded ' + money(x.refunded) + ' of ' + money(b.amt)));
        else if (x.status === 'skip') box.appendChild(el('span', 'tag skip', 'Not claiming'));
        else box.appendChild(el('span', 'tag paid', 'Claimed'));
        if (x.rejected.length && x.status === 'todo') { const r = x.rejected[x.rejected.length - 1]; box.appendChild(p('b-rej', 'Rejected on ' + date(r.d) + (r.why ? ': ' + r.why : '') + '. Fix it and claim again.')); }
        return box;
    }
    function billBox(x, withTick) {
        const b = x.bill, box = el('article', 'bill u-' + (x.status === 'todo' ? x.urgency : x.status));
        const top = el('div', 'b-top');
        top.appendChild(el('h3', 'b-name', what(b)));
        top.appendChild(el('p', 'b-amt', money(b.amt)));
        box.appendChild(top);
        box.appendChild(p('b-sub', [date(b.d, true), b.place, many() && x.payer ? 'from ' + x.payer.name : ''].filter(Boolean).join(' · ')));
        box.appendChild(statusLine(x));
        if (b.note) box.appendChild(p('b-note', b.note));
        if (withTick) {
            const l = el('label', 'check tick'), c = el('input'); c.type = 'checkbox'; c.checked = b.id in ticks;
            c.addEventListener('change', () => { if (c.checked) ticks[b.id] = plain(x.open); else delete ticks[b.id]; if (Object.keys(ticks).length && !nc.d) nc.d = today; render(); });
            l.appendChild(c); l.appendChild(el('span', null, 'Add to the new claim')); box.appendChild(l);
        }
        const bt = el('div', 'b-btns');
        bt.appendChild(btn('Edit', 'secondary small', () => editBill(b), 'Edit ' + what(b) + ' ' + date(b.d, true)));
        if (x.status === 'todo' || x.status === 'skip') bt.appendChild(btn(b.skip ? 'Claim after all' : 'Not claiming', 'secondary small', () => {
            delete ticks[b.id];
            change(() => { if (b.skip) delete b.skip; else b.skip = true; }, 'bills-msg', b.skip ? what(b) + ' is back in Not claimed yet.' : what(b) + ' is marked Not claiming. It stays in All bills.');
        }, (b.skip ? 'Claim after all: ' : 'Not claiming: ') + what(b)));
        bt.appendChild(btn('Delete', 'secondary small danger-t', () => delBill(b), 'Delete ' + what(b) + ' ' + date(b.d, true)));
        box.appendChild(bt);
        return box;
    }
    function delBill(b) {
        delete ticks[b.id];
        if (editing === b.id) resetForm(false);
        const inClaims = state.claims.filter(c => c.items.some(it => it.b === b.id)).length;
        change(() => {
            state.bills = state.bills.filter(x => x !== b);
            state.claims = state.claims.filter(c => {
                const i = c.items.findIndex(it => it.b === b.id);
                if (i < 0) return true;
                if (c.st === 'paid') { const sh = C.share(c.got, c.items.map(it => it.a)); c.got -= sh[i]; }
                c.items.splice(i, 1);
                return c.items.length > 0;
            });
        }, 'bills-msg', 'Deleted ' + what(b) + ', ' + money(b.amt) + (inClaims ? ', and took it out of its claim.' : '.'));
    }
    function renderBills(a) {
        $('n-todo').textContent = a.todo.length; $('n-all').textContent = a.bills.length;
        document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-pressed', String(t.dataset.tab === tab)));
        const list = $('b-list'); list.textContent = '';
        // ticks only for bills still to claim
        Object.keys(ticks).forEach(id => { if (!a.todo.some(x => x.bill.id === id)) delete ticks[id]; });
        let rows;
        if (tab === 'todo') {
            rows = a.todo;
            $('bills-hint').textContent = rows.length ? 'The bills closest to their last day to claim come first. Tick the ones you are sending together.' : 'Nothing left to claim. New bills you add appear here.';
        } else {
            rows = a.bills.slice().sort((x, y) => x.bill.d < y.bill.d ? 1 : x.bill.d > y.bill.d ? -1 : 0);
            $('bills-hint').textContent = 'Every bill, newest first, with what happened to it.';
        }
        const LIM = 20, shown = showAllBills ? rows : rows.slice(0, LIM);
        shown.forEach(x => list.appendChild(billBox(x, tab === 'todo')));
        $('b-showall').hidden = rows.length <= LIM;
        $('b-showall').textContent = showAllBills ? 'Show fewer' : 'Show all ' + rows.length + ' bills';
        renderNewClaim(a);
    }
    function renderNewClaim(a) {
        const ids = Object.keys(ticks);
        $('newclaim').hidden = !ids.length || tab !== 'todo';
        if ($('newclaim').hidden) return;
        const list = $('nc-list'); list.textContent = '';
        let total = 0, okAll = true;
        ids.forEach(id => {
            const x = a.bills.find(y => y.bill.id === id), b = x.bill;
            const row = el('div', 'nc-row');
            const inp = textInput('nc-a-' + id, ticks[id], '', 'decimal');
            inp.addEventListener('input', () => { ticks[id] = inp.value; updateNcTotal(a); });
            row.appendChild(field(date(b.d) + ' · ' + what(b) + ' (of ' + money(x.open) + ')', amountRow(inp), 'nc-a-' + id + '-err'));
            list.appendChild(row);
            const r = C.parseMoney(ticks[id], true); if (r.error) okAll = false; else total += r.n;
        });
        $('nc-h').textContent = 'New claim: ' + C.billsWord(ids.length) + ', ' + (okAll ? money(total) : '…');
        $('nc-payer-box').hidden = !many();
        const firstPayer = byId(ids[0]).payer;
        fillPayerSelect($('nc-payer'), nc.payer || firstPayer);
        $('nc-date').value = nc.d || today; $('nc-date').max = today;
        $('nc-ref').value = nc.ref; if (nc.ref) { $('nc-ref-box').hidden = false; $('nc-ref-open').hidden = true; }
    }
    function updateNcTotal(a) {
        let total = 0, okAll = true;
        Object.keys(ticks).forEach(id => { const r = C.parseMoney(ticks[id], true); if (r.error) okAll = false; else total += r.n; });
        $('nc-h').textContent = 'New claim: ' + C.billsWord(Object.keys(ticks).length) + ', ' + (okAll ? money(total) : '…');
    }
    function readNewClaim() {
        const a = C.analyse(state, today);
        let ok = true; const items = [];
        Object.keys(ticks).forEach(id => {
            const x = a.bills.find(y => y.bill.id === id), r = C.parseMoney(ticks[id], true), eid = 'nc-a-' + id;
            let m = r.error || '';
            if (!m && r.n > x.open) m = 'At most ' + money(x.open) + ', what is left to claim on this bill.';
            ok = setErr(eid, m) && ok;
            if (!m) items.push({ b: id, a: r.n });
        });
        const d = $('nc-date').value;
        ok = setErr('nc-date', checkDay(d, null, 'date you sent the claim')) && ok;
        const tooEarly = items.map(it => byId(it.b)).find(b => b.d > d);
        if (ok && tooEarly) ok = setErr('nc-date', 'The claim cannot be sent before the bill date (' + date(tooEarly.d, true) + ').');
        if (!ok) { const bad = document.querySelector('#newclaim [aria-invalid="true"]'); if (bad) bad.focus(); return null; }
        const c = { id: newId('c'), payer: many() ? $('nc-payer').value : state.payers[0].id, d, st: 'wait', items };
        const ref = $('nc-ref').value.trim(); if (ref) c.ref = ref;
        return c;
    }
    function saveNewClaim() {
        const c = readNewClaim();
        if (!c) return;
        const total = C.claimTotal(c);
        const keep = { ticks, nc };
        ticks = {}; nc = { d: '', ref: '', payer: '' }; $('nc-ref-box').hidden = true; $('nc-ref-open').hidden = false;
        if (change(() => { state.claims.push(c); }, 'waiting-msg', 'Marked as claimed: ' + C.billsWord(c.items.length) + ', ' + money(total) + ', sent ' + date(c.d, true) + '. Tap Refund received when the money comes.')) $('waiting').scrollIntoView({ block: 'nearest' });
        else { ticks = keep.ticks; nc = keep.nc; render(); }
    }
    function claimListText() {
        const ids = Object.keys(ticks), payer = payerOf(many() ? $('nc-payer').value : state.payers[0].id);
        let total = 0;
        const L = ['Medical claim' + (payer ? ' for ' + payer.name : '') + ', ' + C.fmtDate($('nc-date').value || today, LOC, true)];
        ids.forEach((id, i) => {
            const b = byId(id), r = C.parseMoney(ticks[id], true), n = r.error ? 0 : r.n; total += n;
            L.push((i + 1) + '. ' + C.fmtDate(b.d, LOC, true) + ', ' + b.who + ', ' + b.kind + (b.place ? ', ' + b.place : '') + ': ' + money(n));
        });
        L.push('Total: ' + money(total));
        const ref = $('nc-ref').value.trim(); if (ref) L.push('Claim number: ' + ref);
        return L.join('\n');
    }

    // ---------- claims ----------
    function claimBills(cx) {
        const ul = el('ul', 'cl-bills');
        cx.claim.items.forEach((it, i) => {
            const b = byId(it.b); if (!b) return;
            const li = el('li');
            li.appendChild(el('span', 'cl-what', date(b.d) + ' · ' + what(b)));
            li.appendChild(el('span', 'cl-amt', money(it.a) + (cx.claim.st === 'paid' && cx.shares[i] !== it.a ? ', refunded ' + money(cx.shares[i]) : '')));
            ul.appendChild(li);
        });
        return ul;
    }
    function claimBox(cx) {
        const c = cx.claim, box = el('article', 'claim st-' + c.st);
        const top = el('div', 'b-top');
        top.appendChild(el('h3', 'b-name', (cx.payer ? cx.payer.name : 'Claim') + ' · ' + C.billsWord(c.items.length)));
        top.appendChild(el('p', 'b-amt', money(cx.total)));
        box.appendChild(top);
        box.appendChild(p('b-sub', 'Sent ' + date(c.d, true) + (c.st === 'wait' ? ' (' + C.daysWord(cx.age) + ' ago)' : '') + (c.ref ? ' · No. ' + c.ref : '')));
        if (c.st === 'paid') {
            box.appendChild(el('span', 'tag paid', cx.short ? 'Refunded ' + money(c.got) + ' of ' + money(cx.total) + ' on ' + date(c.pd) : 'Refunded in full on ' + date(c.pd)));
            if (cx.short) box.appendChild(p('cl-short', money(cx.short) + ' not refunded' + (c.rest ? '. It is back in Not claimed yet, to claim somewhere else.' : '.')));
        } else if (c.st === 'rej') {
            box.appendChild(el('span', 'tag late', 'Rejected on ' + date(c.pd)));
            box.appendChild(p('cl-short', (c.why ? 'Reason: ' + c.why + '. ' : '') + 'Its bills went back to Not claimed yet.'));
        }
        box.appendChild(claimBills(cx));
        const open = panel && panel.id === c.id;
        if (open) box.appendChild(claimPanel(cx));
        else {
            const bt = el('div', 'b-btns');
            const nm = (cx.payer ? cx.payer.name : 'claim') + ' sent ' + date(c.d, true);
            if (c.st === 'wait') {
                bt.appendChild(btn('Refund received', 'primary small', () => { panel = { id: c.id, mode: 'paid', got: plain(cx.total), pd: today }; render(); focusPanel(); }, 'Refund received: ' + nm));
                bt.appendChild(btn('Rejected', 'secondary small', () => { panel = { id: c.id, mode: 'rej', why: '', pd: today }; render(); focusPanel(); }, 'Rejected: ' + nm));
                bt.appendChild(btn('Edit claim', 'secondary small', () => { panel = editPanel(c); render(); focusPanel(); }, 'Edit claim: ' + nm));
            } else {
                if (c.st === 'paid' && cx.short) bt.appendChild(btn(c.rest ? 'Do not claim the rest' : 'Claim the rest somewhere else', 'secondary small', () => {
                    change(() => { if (c.rest) delete c.rest; else c.rest = true; }, 'history-msg', c.rest ? 'The ' + money(cx.short) + ' is no longer in Not claimed yet.' : 'The ' + money(cx.short) + ' not refunded is back in Not claimed yet.');
                }));
                bt.appendChild(btn('Mark as waiting again', 'secondary small', () => {
                    change(() => { c.st = 'wait'; delete c.got; delete c.pd; delete c.why; delete c.rest; }, 'waiting-msg', 'The claim sent ' + date(c.d, true) + ' is waiting again.');
                }, 'Mark as waiting again: ' + nm));
            }
            bt.appendChild(btn('Delete claim', 'secondary small danger-t', () => {
                if (panel && panel.id === c.id) panel = null;
                change(() => { state.claims = state.claims.filter(x => x !== c); }, c.st === 'wait' ? 'waiting-msg' : 'history-msg', 'Deleted the claim. ' + (c.st === 'rej' ? '' : 'Its bills are back in Not claimed yet.'));
            }, 'Delete claim: ' + nm));
            box.appendChild(bt);
        }
        return box;
    }
    function focusPanel() { const f = document.querySelector('.panel input, .panel select'); if (f) f.focus(); }
    function editPanel(c) { const o = { id: c.id, mode: 'edit', d: c.d, ref: c.ref || '', payer: c.payer, items: {} }; c.items.forEach(it => { o.items[it.b] = plain(it.a); }); return o; }
    function claimPanel(cx) {
        const c = cx.claim, box = el('div', 'panel');
        const done = el('div', 'row-btns');
        if (panel.mode === 'paid') {
            box.appendChild(el('h4', null, 'Refund received'));
            const g = textInput('pp-got', panel.got, '', 'decimal'); g.addEventListener('input', () => { panel.got = g.value; });
            box.appendChild(field('Amount refunded', amountRow(g), 'pp-got-err', 'The claim was for ' + money(cx.total) + '. Type less if only part was paid back, or 0 if nothing.'));
            const d = dateInput('pp-date', panel.pd, c.d); d.addEventListener('input', () => { panel.pd = d.value; });
            box.appendChild(field('Date refunded', d, 'pp-date-err'));
            done.appendChild(btn('Save refund', 'primary', () => {
                const r = C.parseMoney(panel.got, false);
                let m = r.error || ''; if (!m && r.n > cx.total) m = 'That is more than the claim. Type at most ' + money(cx.total) + '.';
                let ok = setErr('pp-got', m);
                ok = setErr('pp-date', checkDay(panel.pd, c.d, 'date refunded')) && ok;
                if (!ok) return;
                const got = r.n, pd = panel.pd; panel = null;
                change(() => { c.st = 'paid'; c.got = got; c.pd = pd; }, 'history-msg', got === cx.total ? 'Refunded in full: ' + money(got) + '.' : 'Refunded ' + money(got) + ' of ' + money(cx.total) + '; ' + money(cx.total - got) + ' not refunded.');
            }));
        } else if (panel.mode === 'rej') {
            box.appendChild(el('h4', null, 'Claim rejected'));
            const w = textInput('pp-why', panel.why, 'e.g. Receipt not stamped', null, 200); w.addEventListener('input', () => { panel.why = w.value; });
            box.appendChild(field('Why was it rejected? (optional)', w));
            const d = dateInput('pp-date', panel.pd, c.d); d.addEventListener('input', () => { panel.pd = d.value; });
            box.appendChild(field('Date you heard', d, 'pp-date-err'));
            done.appendChild(btn('Save', 'primary', () => {
                if (!setErr('pp-date', checkDay(panel.pd, c.d, 'date you heard'))) return;
                const why = panel.why.trim(), pd = panel.pd; panel = null; tab = 'todo';
                change(() => { c.st = 'rej'; c.pd = pd; if (why) c.why = why; else delete c.why; }, 'bills-msg', 'Marked as rejected. Its ' + C.billsWord(c.items.length) + ' ' + (c.items.length === 1 ? 'is' : 'are') + ' back in Not claimed yet.');
            }));
        } else {
            box.appendChild(el('h4', null, 'Edit claim'));
            c.items.forEach(it => {
                const b = byId(it.b); if (!b) return;
                const inp = textInput('pe-a-' + it.b, panel.items[it.b], '', 'decimal'); inp.addEventListener('input', () => { panel.items[it.b] = inp.value; });
                const f = field(date(b.d) + ' · ' + what(b), amountRow(inp), 'pe-a-' + it.b + '-err');
                if (c.items.length > 1) f.appendChild(btn('Take out of this claim', 'link small-link', () => {
                    change(() => { c.items = c.items.filter(x => x.b !== it.b); }, 'waiting-msg', what(b) + ' is out of the claim and back in Not claimed yet.');
                }));
                box.appendChild(f);
            });
            if (many()) { const s = select('pe-payer', state.payers.map(x => [x.id, x.name]), panel.payer); s.addEventListener('change', () => { panel.payer = s.value; }); box.appendChild(field('Claim from', s)); }
            const d = dateInput('pe-date', panel.d); d.addEventListener('input', () => { panel.d = d.value; });
            box.appendChild(field('Date you sent the claim', d, 'pe-date-err'));
            const r = textInput('pe-ref', panel.ref, 'e.g. HR-2231', null, 40); r.addEventListener('input', () => { panel.ref = r.value; });
            box.appendChild(field('Claim number (optional)', r));
            done.appendChild(btn('Save changes', 'primary', () => {
                let ok = true; const items = [];
                c.items.forEach(it => {
                    const rr = C.parseMoney(panel.items[it.b], true), max = C.openWithout(state, it.b, c.id);
                    let m = rr.error || ''; if (!m && rr.n > max) m = 'At most ' + money(max) + ', what is left to claim on this bill.';
                    ok = setErr('pe-a-' + it.b, m) && ok; if (!m) items.push({ b: it.b, a: rr.n });
                });
                let dm = checkDay(panel.d, null, 'date you sent the claim');
                const early = c.items.map(it => byId(it.b)).find(b => b && b.d > panel.d);
                if (!dm && early) dm = 'The claim cannot be sent before the bill date (' + date(early.d, true) + ').';
                ok = setErr('pe-date', dm) && ok;
                if (!ok) return;
                const o = { d: panel.d, ref: panel.ref.trim(), payer: panel.payer }; panel = null;
                change(() => { c.items = items; c.d = o.d; c.payer = payerOf(o.payer) ? o.payer : c.payer; if (o.ref) c.ref = o.ref; else delete c.ref; }, 'waiting-msg', 'Saved the changes to the claim.');
            }));
        }
        done.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); }));
        box.appendChild(done);
        return box;
    }
    function renderClaims(a) {
        const w = $('w-list'); w.textContent = '';
        a.waiting.forEach(cx => w.appendChild(claimBox(cx)));
        $('waiting').hidden = !a.waiting.length;
        const h = $('h-list'); h.textContent = '';
        const LIM = 10, shown = showAllHist ? a.done : a.done.slice(0, LIM);
        shown.forEach(cx => h.appendChild(claimBox(cx)));
        $('h-showall').hidden = a.done.length <= LIM;
        $('h-showall').textContent = showAllHist ? 'Show fewer' : 'Show all ' + a.done.length + ' claims';
        $('history').hidden = !a.done.length;
    }
    function renderPeople(a) {
        const list = $('pp-list'); list.textContent = '';
        a.people.forEach(q => {
            const box = el('div', 'person');
            const top = el('div', 'b-top'); top.appendChild(el('h3', 'b-name', q.who)); top.appendChild(el('p', 'b-amt', money(q.spent))); box.appendChild(top);
            box.appendChild(p('b-sub', C.billsWord(q.n) + ', spent in total'));
            const g = el('div', 'pp-grid');
            [['Refunded', q.refunded], ['Waiting', q.waiting], ['Still to claim', q.open], ['Not refunded', q.spent - q.refunded - q.waiting - q.open]].forEach(([t, v]) => {
                const d = el('div'); d.appendChild(p('t-label', t)); d.appendChild(p('t-val small', money(v))); g.appendChild(d);
            });
            box.appendChild(g); list.appendChild(box);
        });
        $('people').hidden = !a.people.length;
    }

    // ---------- where you claim ----------
    function payerWords(pr) {
        return [pr.days ? 'Claim within ' + (pr.days === 365 ? '1 year' : C.daysWord(pr.days)) + ' of the bill' : 'No time limit to claim',
            pr.limit != null ? 'Yearly limit ' + money(pr.limit) + (pr.per === 'person' ? ' for each person' : ' for the whole family') : 'No yearly limit',
            'Claim year starts 1 ' + C.MONTHS[pr.start - 1]];
    }
    function renderPayers() {
        const list = $('p-list'); list.textContent = '';
        state.payers.forEach(pr => {
            const box = el('div', 'payer');
            if (payerEdit === pr.id) { box.appendChild(payerForm(pr)); list.appendChild(box); return; }
            box.appendChild(el('h3', 'b-name', pr.name));
            const ul = el('ul', 'p-words'); payerWords(pr).forEach(t => ul.appendChild(el('li', null, t))); box.appendChild(ul);
            const bt = el('div', 'b-btns');
            bt.appendChild(btn('Edit', 'secondary small', () => { payerEdit = pr.id; render(); focusPayer(); }, 'Edit ' + pr.name));
            if (many()) bt.appendChild(btn('Delete', 'secondary small danger-t', () => delPayer(pr), 'Delete ' + pr.name));
            box.appendChild(bt);
            list.appendChild(box);
        });
        if (payerEdit === 'new') { const box = el('div', 'payer'); box.appendChild(payerForm(null)); list.appendChild(box); }
        $('p-add').hidden = payerEdit === 'new' || state.payers.length >= 10;
    }
    function focusPayer() { const f = document.querySelector('#p-list .pf input'); if (f) f.focus(); }
    function payerForm(pr) {
        const f = el('div', 'pf'), id = pr ? pr.id : 'new';
        f.appendChild(el('h3', 'b-name', pr ? 'Edit ' + pr.name : 'Another place you claim from'));
        if (!pr) {
            const q = el('div', 'quick'); q.setAttribute('role', 'group'); q.setAttribute('aria-label', 'Quick pick');
            ['Health insurance', 'FSA / HSA', 'Second employer'].forEach(n => q.appendChild(btn(n, 'chip', () => { $('pf-name').value = n; setErr('pf-name', ''); })));
            f.appendChild(q);
        }
        f.appendChild(field('Name', textInput('pf-name', pr ? pr.name : '', 'e.g. Health insurance', null, 40), 'pf-name-err'));
        const dv = pr && pr.days ? (DAYS_OPTS.some(o => o[0] === String(pr.days)) ? String(pr.days) : 'other') : '';
        const ds = select('pf-days', DAYS_OPTS, dv);
        f.appendChild(field('Claim within', ds, null, 'The last day to send a claim, counted from the date of the bill. Ask HR or read your policy.'));
        const ob = el('div'); ob.id = 'pf-odays-box'; ob.hidden = dv !== 'other';
        ob.appendChild(field('Days after the bill', textInput('pf-odays', dv === 'other' ? String(pr.days) : '', 'e.g. 45', 'numeric', 4), 'pf-odays-err'));
        f.appendChild(ob);
        ds.addEventListener('change', () => { ob.hidden = ds.value !== 'other'; if (ob.hidden) setErr('pf-odays', ''); });
        const hasLimit = !!(pr && pr.limit != null);
        const lo = btn('+ Add a yearly limit (optional)', 'link', () => { lb.hidden = false; lo.hidden = true; $('pf-limit').focus(); });
        lo.id = 'pf-limit-open'; lo.hidden = hasLimit; f.appendChild(lo);
        const lb = el('div'); lb.id = 'pf-limit-box'; lb.hidden = !hasLimit;
        lb.appendChild(field('Most paid back in a year', amountRow(textInput('pf-limit', hasLimit ? plain(pr.limit) : '', 'e.g. 60000', 'decimal')), 'pf-limit-err'));
        lb.appendChild(field('The limit is for', select('pf-per', [['family', 'The whole family together'], ['person', 'Each person']], pr ? pr.per : 'family')));
        lb.appendChild(btn('Remove the limit', 'link small-link', () => { $('pf-limit').value = ''; setErr('pf-limit', ''); lb.hidden = true; lo.hidden = false; }));
        f.appendChild(lb);
        f.appendChild(field('Claim year starts in', select('pf-start', C.MONTHS.map((m, i) => [String(i + 1), m]), String(pr ? pr.start : 1)), null, 'When the yearly limit starts again. Often January, or July (Pakistan) or April (India, UK).'));
        const bt = el('div', 'row-btns');
        bt.appendChild(btn(pr ? 'Save changes' : 'Add', 'primary', () => savePayer(pr)));
        bt.appendChild(btn('Cancel', 'secondary', () => { payerEdit = null; render(); }));
        f.appendChild(bt);
        f.dataset.id = id;
        return f;
    }
    function savePayer(pr) {
        let ok = true;
        const name = $('pf-name').value.trim();
        let m = name ? '' : 'Type a name, such as Health insurance.';
        if (!m && state.payers.some(x => x !== pr && x.name.toLowerCase() === name.toLowerCase())) m = 'You already have one called ' + name + '.';
        ok = setErr('pf-name', m) && ok;
        let days = null;
        const dv = $('pf-days').value;
        if (dv === 'other') { const r = C.parseDays($('pf-odays').value); if (r.error) ok = setErr('pf-odays', r.error) && ok; else { setErr('pf-odays', ''); days = r.n; } }
        else if (dv) days = Number(dv);
        let limit = null;
        if (!$('pf-limit-box').hidden && $('pf-limit').value.trim()) {
            const r = C.parseMoney($('pf-limit').value, true);
            if (r.error) ok = setErr('pf-limit', r.error) && ok; else { setErr('pf-limit', ''); limit = r.n; }
        } else if (!$('pf-limit-box').hidden) ok = setErr('pf-limit', 'Type the yearly limit, or tap Remove the limit.') && ok;
        if (!ok) { const bad = document.querySelector('#p-list [aria-invalid="true"]'); if (bad) bad.focus(); return; }
        const o = { name, days, limit, per: $('pf-per').value === 'person' ? 'person' : 'family', start: Number($('pf-start').value) };
        payerEdit = null;
        if (pr) change(() => { Object.assign(pr, o); }, 'payers-msg', 'Saved ' + name + '.');
        else change(() => { state.payers.push(Object.assign({ id: newId('p') }, o)); }, 'payers-msg', 'Added ' + name + '. Pick it in Claim it from when you add a bill.');
    }
    function delPayer(pr) {
        const others = state.payers.filter(x => x !== pr), to = others[0];
        const n = state.bills.filter(b => b.payer === pr.id).length + state.claims.filter(c => c.payer === pr.id).length;
        change(() => {
            state.payers = others;
            state.bills.forEach(b => { if (b.payer === pr.id) b.payer = to.id; });
            state.claims.forEach(c => { if (c.payer === pr.id) c.payer = to.id; });
        }, 'payers-msg', 'Deleted ' + pr.name + '.' + (n ? ' Its bills and claims now say ' + to.name + '.' : ''));
    }

    // ---------- page ----------
    function render() {
        const a = C.analyse(state, today);
        const any = state.bills.length > 0;
        $('intro').hidden = any;
        $('glance').hidden = !any; $('bills').hidden = !any;
        if (any) { renderGlance(a); renderBills(a); }
        renderClaims(a); renderPeople(a); renderPayers(); renderWho();
        $('b-payer-box').hidden = !many();
        if (!many()) $('b-payer').value = state.payers[0].id; else if (!payerOf($('b-payer').value)) fillPayerSelect($('b-payer'), state.payers[0].id);
        if ([...$('b-payer').options].length !== state.payers.length || [...$('b-payer').options].some((o, i) => o.textContent !== state.payers[i].name)) fillPayerSelect($('b-payer'), $('b-payer').value);
        document.querySelectorAll('[data-cur]').forEach(t => { t.textContent = state.cur; t.hidden = !state.cur; });
        $('restore-first').hidden = any || !!editing;
        $('backup').disabled = !any; $('csv').disabled = !any;
        $('b-date').max = today;
        ['add-msg', 'bills-msg', 'waiting-msg', 'history-msg', 'payers-msg', 'tools-msg', 'glance-msg', 'top-msg'].forEach(id => { const m = $(id); if (m) { m.textContent = ''; m.className = 'msg'; } });
        if (flash) {
            let box = $(flash.where);
            // a claim list emptied by this change still shows its message (with Undo)
            if (box && (flash.where === 'waiting-msg' || flash.where === 'history-msg')) box.closest('section').hidden = false;
            if (!box || box.closest('[hidden]')) box = $('top-msg');
            showMsg(box, flash.text, flash.undo && undoSnap, flash.bad);
            flash = null;
        }
    }

    // ---------- backup ----------
    function backup() {
        download(SLUG + '-backup-' + today + '.json', 'application/json', JSON.stringify(Object.assign({ app: SLUG, saved: today }, state), null, 1));
        flash = { where: 'tools-msg', text: 'Saved a backup file. Keep it somewhere safe, such as your email or cloud drive.' }; render();
    }
    function restore(file) {
        if (!file) return;
        const where = state.bills.length ? 'tools-msg' : 'add-msg';
        if (file.size > 5e6) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const r = new FileReader();
        r.onload = () => {
            let s = null;
            try { const j = JSON.parse(r.result); s = j && (!j.app || j.app === SLUG) ? C.cleanState(j) : null; } catch (e) { s = null; }
            if (!s) { flash = { where, text: 'That file is not a backup from this app.', bad: true }; render(); return; }
            ticks = {}; panel = null; payerEdit = null; resetForm(false);
            change(() => { state = s; }, where, 'Restored ' + C.billsWord(s.bills.length) + ' and ' + s.claims.length + (s.claims.length === 1 ? ' claim.' : ' claims.'));
            $('cur').value = state.cur;
        };
        r.onerror = () => { flash = { where, text: 'Could not read that file.', bad: true }; render(); };
        r.readAsText(file);
    }

    function init() {
        load();
        fillCur(); fillKinds();
        resetForm(false);
        $('b-save').addEventListener('click', saveBill);
        $('b-cancel').addEventListener('click', () => { resetForm(false); render(); });
        ['b-amt', 'b-who', 'b-place', 'b-note'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveBill(); } }));
        $('b-more-open').addEventListener('click', () => { openMore(true); $('b-place').focus(); });
        $('cur').addEventListener('change', () => { state.cur = $('cur').value; save(); render(); });
        document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { tab = t.dataset.tab; showAllBills = false; render(); }));
        $('b-showall').addEventListener('click', () => { showAllBills = !showAllBills; render(); });
        $('h-showall').addEventListener('click', () => { showAllHist = !showAllHist; render(); });
        $('nc-date').addEventListener('input', () => { nc.d = $('nc-date').value; });
        $('nc-ref').addEventListener('input', () => { nc.ref = $('nc-ref').value; });
        $('nc-payer').addEventListener('change', () => { nc.payer = $('nc-payer').value; });
        $('nc-ref-open').addEventListener('click', () => { $('nc-ref-box').hidden = false; $('nc-ref-open').hidden = true; $('nc-ref').focus(); });
        $('nc-save').addEventListener('click', saveNewClaim);
        $('nc-copy').addEventListener('click', () => copyText(claimListText(), 'bills-msg'));
        $('nc-clear').addEventListener('click', () => { ticks = {}; render(); });
        $('g-copy').addEventListener('click', () => copyText(summaryText(C.analyse(state, today)), 'glance-msg'));
        $('g-cal').addEventListener('click', () => calendar(C.analyse(state, today)));
        $('p-add').addEventListener('click', () => { payerEdit = 'new'; render(); focusPayer(); });
        $('backup').addEventListener('click', backup);
        $('csv').addEventListener('click', () => {
            download('medical-bills-' + today + '.csv', 'text/csv', '﻿' + C.csv(state, C.analyse(state, today), state.cur, LOC));
            flash = { where: 'tools-msg', text: 'Saved the list as a CSV file. It opens in Excel, Google Sheets or Numbers.' }; render();
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-first').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => { restore(e.target.files[0]); e.target.value = ''; });
        $('del-all').addEventListener('click', () => {
            if (!state.bills.length && state.payers.length === 1 && !state.claims.length) { flash = { where: 'tools-msg', text: 'There is nothing to delete yet.' }; render(); return; }
            ticks = {}; panel = null; payerEdit = null; resetForm(false);
            const cur = state.cur;
            change(() => { state = C.emptyState(); state.cur = cur; }, 'tools-msg', 'Deleted everything.');
        });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) { const t = C.localDay(new Date()); if (t !== today) { today = t; render(); } } });
        if (!canSave) $('store-warn').hidden = false;
        render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
