// Work Expense Claim Log: the page. The maths and the words are in core.js (window.WEC).
(function () {
    'use strict';
    const C = window.WEC, SLUG = 'work-expense-claim-log-for-employees', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    // a locale Intl accepts (some systems report tags such as "en-US@posix")
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', '₦': '₦ (naira)',
        'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', 'Rp': 'Rp (rupiah)', 'RM': 'RM (ringgit)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const DAYS_OPTS = [['', 'No time limit'], ['30', '30 days after paying'], ['60', '60 days after paying'], ['90', '90 days after paying'], ['180', '180 days after paying'],
        ['365', '1 year after paying'], ['other', 'Other number of days…']];
    let state = C.emptyState(), today = C.localDay(new Date());
    let editing = null;        // id of the expense in the form, or null when adding
    let calc = '';             // '', 'fx' or 'km': how the amount is worked out
    let tab = 'todo', showAll = false, showAllHist = false;
    let ticks = {};            // expense id -> typed amount to claim
    let nc = { d: '', ref: '' };
    let panel = null;          // { id, mode: 'paid' | 'rej' | 'edit', ... } open on one claim
    let ym = null;             // month shown in Month by month
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
    function change(fn, where, text) {
        const before = snap();
        if (fn() === false) return false;
        const bad = C.overClaimed(state);
        if (bad) {
            state = C.cleanState(JSON.parse(before));
            flash = { where, text: 'That would claim ' + bad.what + ' (' + money(bad.amt) + ') for more than it cost. Part of it is in another claim now.', bad: true };
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
        undoSnap = null; panel = null;
        if (editing && !byId(editing)) resetForm(false);
        save(); fillRules();
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
    const byId = id => state.exps.find(x => x.id === id);
    const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const what = e => e.what;
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into the claim form, a message or an email.' }; render(); };
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
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
    function download(name, type, text) {
        const blob = new Blob([text], { type });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function field(labelText, input, errId, hint) {
        const w = el('div', 'field');
        const l = el('label', null, labelText); l.htmlFor = input.id || (input.querySelector('input') || {}).id; w.appendChild(l);
        w.appendChild(input);
        if (hint) w.appendChild(p('hint', hint));
        if (errId) { const e = p('err', ''); e.id = errId; e.setAttribute('role', 'alert'); w.appendChild(e); const i = input.tagName === 'INPUT' ? input : input.querySelector('input'); if (i) i.setAttribute('aria-describedby', errId); }
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
    function checkDay(v, min, what) {
        if (!v) return 'Pick the ' + what + '.';
        if (!C.isDay(v)) return 'That date does not exist.';
        if (v > today) return 'That date is in the future.';
        if (min && v < min) return 'That is before ' + date(min, true) + '.';
        return '';
    }

    // ---------- the expense form ----------
    function fillCur() {
        const sel = $('cur');
        Object.keys(CUR_NAMES).forEach(k => { const o = el('option', null, CUR_NAMES[k]); o.value = k; sel.appendChild(o); });
        if (state.cur && !(state.cur in CUR_NAMES)) { const o = el('option', null, state.cur); o.value = state.cur; sel.appendChild(o); }
        sel.value = state.cur;
    }
    function fillCats() { C.CATS.forEach(k => { const o = el('option', null, k); o.value = k; $('e-cat').appendChild(o); }); }
    function openMore(open) { $('e-more').hidden = !open; $('e-more-open').hidden = open; }
    // the other currency or the distance box; the amount is then worked out and cannot be typed
    function setCalc(mode) {
        calc = mode;
        $('fx-box').hidden = mode !== 'fx'; $('km-box').hidden = mode !== 'km';
        $('calc-btns').hidden = !!mode;
        $('e-amt').readOnly = !!mode;
        $('e-amt').classList.toggle('worked', !!mode);
        if (!mode) { ['fx-code', 'fx-amt', 'fx-rate', 'km-dist', 'km-rate'].forEach(id => setErr(id, '')); }
        workOut();
    }
    // reads the helper box; returns { amt, fx } / { amt, km } or { error } with the messages set when `show`
    function readCalc(show) {
        const set = (id, m) => show ? setErr(id, m) : !m;
        if (calc === 'fx') {
            const code = $('fx-code').value.trim().toUpperCase();
            let ok = set('fx-code', /^[A-Z]{3}$/.test(code) ? '' : 'Type the 3-letter code, such as USD.');
            const a = C.parseMoney($('fx-amt').value, true), r = C.parseRate($('fx-rate').value);
            ok = set('fx-amt', a.error || '') && ok; ok = set('fx-rate', r.error || '') && ok;
            if (!ok || a.error || r.error) return { error: true };
            const amt = C.fxCents(a.n, r.n);
            if (amt < 1) { set('fx-rate', 'That works out at less than 0.01. Check the rate.'); return { error: true }; }
            if (amt > 100000000000) { set('fx-rate', 'That works out too big. Check the rate.'); return { error: true }; }
            return { amt, fx: { c: code, a: a.n, r: r.n } };
        }
        if (calc === 'km') {
            const d = C.parseDist($('km-dist').value), r = C.parsePerDist($('km-rate').value);
            let ok = set('km-dist', d.error || ''); ok = set('km-rate', r.error || '') && ok;
            if (!ok) return { error: true };
            const amt = C.kmCents(d.n, r.n);
            if (amt < 1) { set('km-rate', 'That works out at less than 0.01. Check the rate.'); return { error: true }; }
            if (amt > 100000000000) { set('km-rate', 'That works out too big. Check the numbers.'); return { error: true }; }
            return { amt, km: { k: d.n, r: r.n, u: $('km-unit').value === 'mi' ? 'mi' : 'km' } };
        }
        return null;
    }
    function workOut() {
        $('km-rate').previousElementSibling.textContent = 'Paid per ' + ($('km-unit').value === 'mi' ? 'mile' : 'km');
        if (!calc) return;
        const r = readCalc(false), out = $(calc + '-out');
        if (r && !r.error) {
            $('e-amt').value = plain(r.amt); setErr('e-amt', '');
            out.textContent = C.howWord(Object.assign({ amt: r.amt }, r), state.cur, LOC) + ' = ' + money(r.amt) + '. This is the Amount above.';
            out.classList.add('ok');
        } else {
            $('e-amt').value = '';
            out.textContent = calc === 'fx' ? 'Rate: how much 1 of that currency cost you, from your card statement. The Amount above is worked out for you.' : 'The rate your company pays per km or mile. The Amount above is worked out for you.';
            out.classList.remove('ok');
        }
    }
    function resetForm(keep) {
        const was = { d: $('e-date').value, proj: $('e-proj').value, cat: $('e-cat').value };
        editing = null;
        $('e-date').value = keep && was.d ? was.d : today; $('e-amt').value = ''; $('e-what').value = '';
        $('e-cat').value = keep ? was.cat : C.CATS[0]; $('e-proj').value = keep ? was.proj : ''; $('e-note').value = ''; $('e-norec').checked = false;
        ['fx-code', 'fx-amt', 'fx-rate', 'km-dist', 'km-rate'].forEach(id => { $(id).value = ''; });
        $('km-unit').value = 'km';
        ['e-date', 'e-amt', 'e-what'].forEach(id => setErr(id, ''));
        setCalc('');
        openMore(false);
        $('add-h').textContent = 'Add a work expense'; $('e-save').textContent = 'Save expense'; $('e-cancel').hidden = true;
    }
    function editExp(e) {
        resetForm(false);
        editing = e.id;
        $('e-date').value = e.d; $('e-amt').value = plain(e.amt); $('e-what').value = e.what; $('e-cat').value = e.cat;
        $('e-proj').value = e.proj || ''; $('e-note').value = e.note || ''; $('e-norec').checked = !!e.norec;
        if (e.fx) { $('fx-code').value = e.fx.c; $('fx-amt').value = plain(e.fx.a); $('fx-rate').value = C.fmtScaled(e.fx.r, 6); setCalc('fx'); }
        else if (e.km) { $('km-dist').value = C.fmtScaled(e.km.k, 1); $('km-unit').value = e.km.u || 'km'; $('km-rate').value = C.fmtScaled(e.km.r, 4); setCalc('km'); }
        openMore(!!e.note);
        $('add-h').textContent = 'Edit expense'; $('e-save').textContent = 'Save changes'; $('e-cancel').hidden = false;
        render();
        $('add').scrollIntoView({ block: 'start' });
        $(calc ? (calc === 'fx' ? 'fx-amt' : 'km-dist') : 'e-amt').focus({ preventScroll: true });
    }
    function readForm() {
        let ok = true;
        ok = setErr('e-date', checkDay($('e-date').value, null, 'date you paid')) && ok;
        let amt = null, extra = {};
        if (calc) {
            const r = readCalc(true);
            if (r.error) { ok = false; setErr('e-amt', ''); } else { amt = r.amt; extra = r.fx ? { fx: r.fx } : { km: r.km }; }
        } else {
            const r = C.parseMoney($('e-amt').value, true);
            if (r.error) ok = setErr('e-amt', r.error) && ok; else { setErr('e-amt', ''); amt = r.n; }
        }
        if (amt != null && editing) {
            const usedUp = byId(editing).amt - C.openWithout(state, editing, null);
            if (amt < usedUp) ok = setErr('e-amt', money(usedUp) + ' of this expense is already in a claim. Lower the claim first (Edit claim), then the expense.') && ok;
        }
        const w = $('e-what').value.trim();
        ok = setErr('e-what', w ? '' : 'Type what it was for, such as Taxi to client office.') && ok;
        if (!ok) { const bad = document.querySelector('#add [aria-invalid="true"]'); if (bad) bad.focus(); return null; }
        const o = Object.assign({ d: $('e-date').value, amt, cat: $('e-cat').value, what: w }, extra);
        const proj = $('e-proj').value.trim(), note = $('e-note').value.trim();
        if (proj) o.proj = proj; if (note) o.note = note;
        if ($('e-norec').checked) o.norec = true;
        return o;
    }
    function saveExp() {
        const f = readForm();
        if (!f) return;
        if (editing) {
            const id = editing;
            const done = change(() => {
                const e = byId(id);
                ['proj', 'note', 'fx', 'km', 'norec'].forEach(k => delete e[k]);
                Object.assign(e, f);
            }, 'add-msg', 'Saved the changes to ' + f.what + '.');
            if (done) resetForm(false);
            return;
        }
        const e = Object.assign({ id: newId('e') }, f);
        resetForm(true);
        ym = e.d.slice(0, 7);      // Month by month shows the month of what was just added
        change(() => { state.exps.push(e); }, 'add-msg', 'Saved: ' + e.what + ', ' + money(e.amt) + '.' + (state.co.days ? ' Claim by ' + date(C.addDays(e.d, state.co.days), true) + '.' : ''));
        $('e-amt').focus({ preventScroll: true });
    }
    function renderProj() {
        const box = $('proj-quick'); box.textContent = '';
        const seen = [];
        state.exps.slice().sort((a, b) => a.d < b.d ? 1 : -1).forEach(e => { if (e.proj && !seen.includes(e.proj)) seen.push(e.proj); });
        seen.slice(0, 8).forEach(n => { const c = btn(n, 'chip', () => { $('e-proj').value = n; }); c.setAttribute('aria-label', 'Client or project: ' + n); box.appendChild(c); });
        box.hidden = !seen.length;
    }

    // ---------- company rules ----------
    function fillRules() {
        $('co-name').value = state.co.name || '';
        const d = state.co.days, v = d ? (DAYS_OPTS.some(o => o[0] === String(d)) ? String(d) : 'other') : '';
        $('co-days').value = v; $('co-odays').value = v === 'other' ? String(d) : '';
        $('co-odays-box').hidden = v !== 'other'; setErr('co-odays', '');
    }
    function saveRules() {
        let days = null;
        const v = $('co-days').value;
        if (v === 'other') { const r = C.parseDays($('co-odays').value); if (r.error) { setErr('co-odays', r.error); $('co-odays').focus(); return; } setErr('co-odays', ''); days = r.n; }
        else if (v) days = Number(v);
        const name = $('co-name').value.trim();
        change(() => { state.co = { name, days }; }, 'rules-msg', 'Saved. ' + (days ? 'Each expense now shows the last day to claim it (' + (days === 365 ? '1 year' : C.daysWord(days)) + ' after paying).' : 'No time limit to claim.'));
    }

    // ---------- the summary ----------
    function summaryText(a) {
        const L = ['Work expenses' + (state.co.name ? ', ' + state.co.name : '') + ', ' + C.fmtDate(today, LOC, true)];
        if (a.todo.length) L.push('Not claimed yet: ' + money(a.openTotal) + ' (' + C.expWord(a.todo.length) + ', oldest from ' + date(a.todo[0].exp.d, true) + ').');
        else L.push('Nothing left to claim.');
        if (a.waiting.length) L.push('Claimed, waiting to be paid: ' + money(a.waitTotal) + ' (' + C.claimWord(a.waiting.length) + ', oldest sent ' + date(a.waiting[0].claim.d, true) + ', ' + C.daysWord(a.waiting[0].age) + ' ago).');
        L.push('Spent for work: ' + money(a.spentTotal) + '. Paid back: ' + money(a.paidTotal) + '. Not paid back: ' + money(a.lostTotal) + '.');
        if (a.todo.length) {
            L.push('', 'Not claimed yet:');
            a.todo.forEach(x => L.push('- ' + lineText(x.exp, x.open)));
        }
        return L.join('\n');
    }
    function lineText(e, amt) {
        const how = C.howWord(e, state.cur, LOC);
        return date(e.d, true) + ', ' + e.cat + ': ' + e.what + (e.proj ? ' (' + e.proj + ')' : '') + ', ' + money(amt) + (how ? ' [' + how + ']' : '') + (amt !== e.amt ? ' of ' + money(e.amt) : '') + (e.norec ? ' (no receipt)' : '');
    }
    function renderGlance(a) {
        const body = $('glance-body'); body.textContent = '';
        const top = el('div', 'g-main ' + (a.late.length ? 'is-late' : a.soon.length ? 'is-soon' : a.todo.length ? 'is-todo' : 'is-clear'));
        top.appendChild(p('g-label', 'Not claimed yet'));
        top.appendChild(p('g-big', money(a.openTotal)));
        if (a.todo.length) {
            const old = a.todo[0];
            top.appendChild(p('g-line', C.expWord(a.todo.length) + ' · oldest from ' + date(old.exp.d) + ' (' + C.agoWord(old.age) + ')'));
            const first = a.todo.filter(x => x.claimBy && x.left >= 0).sort((x, y) => x.left - y.left)[0];
            if (first) top.appendChild(p('g-line', 'Claim the first by ' + dateWd(first.claimBy) + ' (' + C.inDays(first.left) + ')'));
            if (a.late.length) top.appendChild(p('g-late', C.expWord(a.late.length) + ' ' + (a.late.length === 1 ? 'is' : 'are') + ' past the time limit to claim (' + money(a.late.reduce((s, x) => s + x.open, 0)) + '). Claim now and ask if they can still be paid.'));
            else if (a.soon.length) top.appendChild(p('g-soon', C.expWord(a.soon.length) + ' must be claimed within ' + C.SOON + ' days.'));
            if (a.noReceipt.length) top.appendChild(p('g-line muted', C.expWord(a.noReceipt.length) + ' without a receipt.'));
        } else top.appendChild(p('g-line', 'Nothing left to claim. Add an expense when you pay one.'));
        body.appendChild(top);
        const w = el('div', 'g-wait');
        w.appendChild(p('g-label', 'Claimed, waiting to be paid'));
        if (a.waiting.length) {
            const o = a.waiting[0];
            w.appendChild(p('g-mid', money(a.waitTotal)));
            w.appendChild(p('g-line', C.claimWord(a.waiting.length) + ' · oldest sent ' + date(o.claim.d) + ' (' + C.agoWord(o.age) + ')'));
            if (a.longWait.length) w.appendChild(p('g-soon', (a.longWait.length === 1 ? 'A claim has' : C.claimWord(a.longWait.length) + ' have') + ' waited over ' + C.LONG_WAIT + ' days. Ask finance when it will be paid.'));
        } else w.appendChild(p('g-line', 'No claims waiting.'));
        body.appendChild(w);
        const tiles = el('div', 'tiles');
        [['Spent for work', a.spentTotal, ''], ['Paid back', a.paidTotal, ' good'], ['Not paid back', a.lostTotal, a.lostTotal ? ' lost' : '']].forEach(([t, v, cls]) => {
            const d = el('div', 'tile' + cls); d.appendChild(p('t-label', t)); d.appendChild(p('t-val', money(v))); tiles.appendChild(d);
        });
        body.appendChild(tiles);
        body.appendChild(p('hint t-hint', 'Not paid back: lines that were cut or refused, and expenses you marked Not claiming. You paid these yourself.'));
        $('g-mail').href = 'mailto:?subject=' + encodeURIComponent('Work expenses') + '&body=' + encodeURIComponent(summaryText(a).slice(0, 1800));
    }

    // ---------- expenses ----------
    function statusLine(x) {
        const e = x.exp, box = el('div', 'e-status');
        if (x.status === 'todo') {
            const t = x.claimBy ? (x.left < 0 ? 'Past the time limit: claim by was ' + date(x.claimBy) + ' (' + C.daysWord(-x.left) + ' ago)' : 'Claim by ' + dateWd(x.claimBy) + ' (' + C.inDays(x.left) + ')') : 'Not claimed yet · paid ' + C.agoWord(x.age);
            box.appendChild(el('span', 'tag ' + x.urgency, x.urgency === 'soon' ? 'Claim soon · ' + t : t));
            if (x.open !== e.amt) box.appendChild(p('e-part', money(x.open) + ' still to claim of ' + money(e.amt) + (x.waiting ? ' (' + money(x.waiting) + ' waiting)' : x.paidBack ? ' (' + money(x.paidBack) + ' paid back)' : '')));
        } else if (x.status === 'wait') box.appendChild(el('span', 'tag wait', 'Claimed, waiting: ' + money(x.waiting)));
        else if (x.status === 'paid') box.appendChild(el('span', 'tag paid', x.paidBack >= e.amt ? 'Paid back in full' : 'Paid back ' + money(x.paidBack) + ' of ' + money(e.amt)));
        else if (x.status === 'skip') box.appendChild(el('span', 'tag skip', 'Not claiming'));
        else box.appendChild(el('span', 'tag paid', 'Claimed'));
        if (e.norec) box.appendChild(el('span', 'tag norec', 'No receipt'));
        if (x.rejected.length && x.status === 'todo') { const r = x.rejected[x.rejected.length - 1]; box.appendChild(p('e-rej', 'Rejected on ' + date(r.d) + (r.why ? ': ' + r.why : '') + '. Fix it and claim again.')); }
        return box;
    }
    function expBox(x, withTick) {
        const e = x.exp, box = el('article', 'exp u-' + (x.status === 'todo' ? x.urgency : x.status));
        const top = el('div', 'e-top');
        top.appendChild(el('h3', 'e-name', what(e)));
        top.appendChild(el('p', 'e-amt', money(e.amt)));
        box.appendChild(top);
        const how = C.howWord(e, state.cur, LOC);
        box.appendChild(p('e-sub', [date(e.d, true), e.cat, e.proj].filter(Boolean).join(' · ')));
        if (how) box.appendChild(p('e-how', how));
        box.appendChild(statusLine(x));
        if (e.note) box.appendChild(p('e-note', e.note));
        if (withTick) {
            const l = el('label', 'check tick'), c = el('input'); c.type = 'checkbox'; c.checked = e.id in ticks;
            c.addEventListener('change', () => { if (c.checked) ticks[e.id] = plain(x.open); else delete ticks[e.id]; if (Object.keys(ticks).length && !nc.d) nc.d = today; render(); });
            l.appendChild(c); l.appendChild(el('span', null, 'Add to the new claim')); box.appendChild(l);
        }
        const bt = el('div', 'e-btns');
        bt.appendChild(btn('Edit', 'secondary small', () => editExp(e), 'Edit ' + what(e) + ' ' + date(e.d, true)));
        if (x.status === 'todo' || x.status === 'skip') bt.appendChild(btn(e.skip ? 'Claim after all' : 'Not claiming', 'secondary small', () => {
            delete ticks[e.id];
            change(() => { if (e.skip) delete e.skip; else e.skip = true; }, 'exps-msg', e.skip ? what(e) + ' is back in Not claimed yet.' : what(e) + ' is marked Not claiming. It stays in All expenses.');
        }, (e.skip ? 'Claim after all: ' : 'Not claiming: ') + what(e)));
        bt.appendChild(btn('Delete', 'secondary small danger-t', () => delExp(e), 'Delete ' + what(e) + ' ' + date(e.d, true)));
        box.appendChild(bt);
        return box;
    }
    function delExp(e) {
        delete ticks[e.id];
        if (editing === e.id) resetForm(false);
        const inClaims = state.claims.some(c => c.items.some(it => it.e === e.id));
        change(() => {
            state.exps = state.exps.filter(x => x !== e);
            state.claims = state.claims.filter(c => { c.items = c.items.filter(it => it.e !== e.id); return c.items.length > 0; });
        }, 'exps-msg', 'Deleted ' + what(e) + ', ' + money(e.amt) + (inClaims ? ', and took it out of its claim.' : '.'));
    }
    function renderExps(a) {
        $('n-todo').textContent = a.todo.length; $('n-all').textContent = a.exps.length;
        document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-pressed', String(t.dataset.tab === tab)));
        const list = $('e-list'); list.textContent = '';
        Object.keys(ticks).forEach(id => { if (!a.todo.some(x => x.exp.id === id)) delete ticks[id]; });
        let rows;
        if (tab === 'todo') {
            rows = a.todo;
            $('exps-hint').textContent = rows.length ? 'Oldest first. Tick the ones you are claiming together.' : 'Nothing left to claim. New expenses you add appear here.';
        } else {
            rows = a.exps.slice().sort((x, y) => x.exp.d < y.exp.d ? 1 : x.exp.d > y.exp.d ? -1 : 0);
            $('exps-hint').textContent = 'Every expense, newest first, with what happened to it.';
        }
        $('tick-all').hidden = tab !== 'todo' || a.todo.length < 2 || a.todo.every(x => x.exp.id in ticks);
        $('tick-all').textContent = 'Tick all ' + a.todo.length + ' for one claim';
        const LIM = 25, shown = showAll ? rows : rows.slice(0, LIM);
        shown.forEach(x => list.appendChild(expBox(x, tab === 'todo')));
        $('e-showall').hidden = rows.length <= LIM;
        $('e-showall').textContent = showAll ? 'Show fewer' : 'Show all ' + rows.length + ' expenses';
        renderNewClaim(a);
    }
    function ncTotal() {
        let total = 0, okAll = true;
        Object.keys(ticks).forEach(id => { const r = C.parseMoney(ticks[id], true); if (r.error) okAll = false; else total += r.n; });
        return okAll ? total : null;
    }
    function ncHead() { const t = ncTotal(), n = Object.keys(ticks).length; $('nc-h').textContent = 'New claim: ' + C.expWord(n) + ', ' + (t == null ? '…' : money(t)); }
    function renderNewClaim(a) {
        // oldest first, like the list
        const ids = a.todo.map(x => x.exp.id).filter(id => id in ticks);
        $('newclaim').hidden = !ids.length || tab !== 'todo';
        if ($('newclaim').hidden) return;
        const list = $('nc-list'); list.textContent = '';
        ids.forEach(id => {
            const x = a.exps.find(y => y.exp.id === id), e = x.exp;
            const inp = textInput('nc-a-' + id, ticks[id], '', 'decimal');
            inp.addEventListener('input', () => { ticks[id] = inp.value; ncHead(); });
            const row = el('div', 'nc-row');
            row.appendChild(field(date(e.d) + ' · ' + what(e) + (x.open !== e.amt ? ' (' + money(x.open) + ' left)' : ''), amountRow(inp), 'nc-a-' + id + '-err'));
            list.appendChild(row);
        });
        ncHead();
        $('nc-date').value = nc.d || today; $('nc-date').max = today;
        $('nc-ref').value = nc.ref; if (nc.ref) { $('nc-ref-box').hidden = false; $('nc-ref-open').hidden = true; }
    }
    function readNewClaim() {
        const a = C.analyse(state, today);
        let ok = true; const items = [];
        a.todo.filter(x => x.exp.id in ticks).forEach(x => {
            const id = x.exp.id, r = C.parseMoney(ticks[id], true), eid = 'nc-a-' + id;
            let m = r.error || '';
            if (!m && r.n > x.open) m = 'At most ' + money(x.open) + ', what is left to claim on this expense.';
            ok = setErr(eid, m) && ok;
            if (!m) items.push({ e: id, a: r.n });
        });
        const d = $('nc-date').value;
        ok = setErr('nc-date', checkDay(d, null, 'date you sent the claim')) && ok;
        const tooEarly = items.map(it => byId(it.e)).find(e => e.d > d);
        if (ok && tooEarly) ok = setErr('nc-date', 'The claim cannot be sent before you paid ' + tooEarly.what + ' (' + date(tooEarly.d, true) + ').');
        if (!ok) { const bad = document.querySelector('#newclaim [aria-invalid="true"]'); if (bad) bad.focus(); return null; }
        const c = { id: newId('c'), d, st: 'wait', items };
        const ref = $('nc-ref').value.trim(); if (ref) c.ref = ref;
        return c;
    }
    function saveNewClaim() {
        const c = readNewClaim();
        if (!c) return;
        const total = C.claimTotal(c), keep = { ticks, nc };
        ticks = {}; nc = { d: '', ref: '' }; $('nc-ref-box').hidden = true; $('nc-ref-open').hidden = false;
        if (change(() => { state.claims.push(c); }, 'waiting-msg', 'Marked as claimed: ' + C.expWord(c.items.length) + ', ' + money(total) + ', sent ' + date(c.d, true) + '. Tap Paid back when the money comes.')) $('waiting').scrollIntoView({ block: 'nearest' });
        else { ticks = keep.ticks; nc = keep.nc; render(); }
    }
    // the list to paste into a claim form: each line, then the total by type, then the grand total
    function claimListText() {
        const a = C.analyse(state, today), ids = a.todo.map(x => x.exp.id).filter(id => id in ticks);
        let total = 0; const cats = {};
        const L = ['Expense claim' + (state.co.name ? ', ' + state.co.name : '') + ', ' + C.fmtDate($('nc-date').value || today, LOC, true)];
        const ref = $('nc-ref').value.trim(); if (ref) L.push('Claim number: ' + ref);
        L.push('');
        ids.forEach((id, i) => {
            const e = byId(id), r = C.parseMoney(ticks[id], true), n = r.error ? 0 : r.n; total += n;
            cats[e.cat] = (cats[e.cat] || 0) + n;
            L.push((i + 1) + '. ' + lineText(e, n));
        });
        const ck = Object.keys(cats);
        if (ck.length > 1) { L.push('', 'By type:'); ck.sort((x, y) => cats[y] - cats[x]).forEach(k => L.push('- ' + k + ': ' + money(cats[k]))); }
        L.push('', 'Total: ' + money(total));
        return L.join('\n');
    }

    // ---------- claims ----------
    function claimLines(cx) {
        const ul = el('ul', 'cl-lines');
        cx.claim.items.forEach(it => {
            const e = byId(it.e); if (!e) return;
            const li = el('li');
            li.appendChild(el('span', 'cl-what', date(e.d) + ' · ' + what(e)));
            li.appendChild(el('span', 'cl-amt', money(it.a) + (cx.claim.st === 'paid' && it.p !== it.a ? ', paid ' + money(it.p) : '')));
            ul.appendChild(li);
        });
        return ul;
    }
    function claimBox(cx) {
        const c = cx.claim, box = el('article', 'claim st-' + c.st);
        const top = el('div', 'e-top');
        top.appendChild(el('h3', 'e-name', 'Claim sent ' + date(c.d) + ' · ' + C.expWord(c.items.length)));
        top.appendChild(el('p', 'e-amt', money(cx.total)));
        box.appendChild(top);
        if (c.st === 'wait' || c.ref) box.appendChild(p('e-sub', [c.st === 'wait' ? 'Waiting ' + C.daysWord(cx.age) : '', c.ref ? 'No. ' + c.ref : ''].filter(Boolean).join(' · ')));
        if (c.st === 'wait' && cx.age > C.LONG_WAIT) box.appendChild(el('span', 'tag soon', 'Waiting over ' + C.LONG_WAIT + ' days: ask finance'));
        if (c.st === 'paid') {
            box.appendChild(el('span', 'tag paid', cx.short ? 'Paid back ' + money(cx.got) + ' of ' + money(cx.total) + ' on ' + date(c.pd) : 'Paid back in full on ' + date(c.pd)));
            if (cx.short) box.appendChild(p('cl-short', money(cx.short) + ' not paid back' + (c.rest ? '. It is back in Not claimed yet.' : '.')));
        } else if (c.st === 'rej') {
            box.appendChild(el('span', 'tag late', 'Rejected on ' + date(c.pd)));
            box.appendChild(p('cl-short', (c.why ? 'Reason: ' + c.why + '. ' : '') + 'Its expenses went back to Not claimed yet.'));
        }
        box.appendChild(claimLines(cx));
        if (panel && panel.id === c.id) { box.appendChild(claimPanel(cx)); return box; }
        const bt = el('div', 'e-btns'), nm = 'claim sent ' + date(c.d, true);
        if (c.st === 'wait') {
            bt.appendChild(btn('Paid back', 'primary small', () => { panel = paidPanel(c); render(); focusPanel(); }, 'Paid back: ' + nm));
            bt.appendChild(btn('Rejected', 'secondary small', () => { panel = { id: c.id, mode: 'rej', why: '', pd: today }; render(); focusPanel(); }, 'Rejected: ' + nm));
            bt.appendChild(btn('Edit claim', 'secondary small', () => { panel = editPanel(c); render(); focusPanel(); }, 'Edit ' + nm));
        } else {
            if (c.st === 'paid' && cx.short) bt.appendChild(btn(c.rest ? 'Do not claim the cut part' : 'Claim the cut part again', 'secondary small', () => {
                change(() => { if (c.rest) delete c.rest; else c.rest = true; }, 'history-msg', c.rest ? 'The ' + money(cx.short) + ' is no longer in Not claimed yet.' : 'The ' + money(cx.short) + ' not paid back is in Not claimed yet again.');
            }, (c.rest ? 'Do not claim the cut part: ' : 'Claim the cut part again: ') + nm));
            bt.appendChild(btn('Mark as waiting again', 'secondary small', () => {
                change(() => { c.st = 'wait'; c.items.forEach(it => delete it.p); delete c.pd; delete c.why; delete c.rest; }, 'waiting-msg', 'The ' + nm + ' is waiting again.');
            }, 'Mark as waiting again: ' + nm));
        }
        bt.appendChild(btn('Delete claim', 'secondary small danger-t', () => {
            change(() => { state.claims = state.claims.filter(x => x !== c); }, c.st === 'wait' ? 'waiting-msg' : 'history-msg', 'Deleted the claim.' + (c.st === 'rej' ? '' : ' Its expenses are back in Not claimed yet.'));
        }, 'Delete ' + nm));
        box.appendChild(bt);
        return box;
    }
    function focusPanel() { const f = document.querySelector('.panel input, .panel select'); if (f) f.focus(); }
    function paidPanel(c) { const o = { id: c.id, mode: 'paid', pd: today, items: {} }; c.items.forEach(it => { o.items[it.e] = plain(it.a); }); return o; }
    function editPanel(c) { const o = { id: c.id, mode: 'edit', d: c.d, ref: c.ref || '', items: {} }; c.items.forEach(it => { o.items[it.e] = plain(it.a); }); return o; }
    function panelTotal(c) {
        let t = 0; for (const it of c.items) { const r = C.parseMoney(panel.items[it.e], false); if (r.error) return null; t += r.n; } return t;
    }
    function claimPanel(cx) {
        const c = cx.claim, box = el('div', 'panel'), done = el('div', 'row-btns');
        if (panel.mode === 'paid') {
            box.appendChild(el('h4', null, 'Paid back'));
            box.appendChild(p('hint', 'Each line starts at what you claimed. Lower a line that was cut, or type 0 if it was refused.'));
            const tot = p('p-total', '');
            const upd = () => { const t = panelTotal(c); tot.textContent = t == null ? 'Paid back in all: …' : 'Paid back in all: ' + money(t) + (t < cx.total ? ' of ' + money(cx.total) + ' (' + money(cx.total - t) + ' not paid back)' : ' (in full)'); };
            c.items.forEach(it => {
                const e = byId(it.e); if (!e) return;
                const inp = textInput('pp-a-' + it.e, panel.items[it.e], '', 'decimal');
                inp.addEventListener('input', () => { panel.items[it.e] = inp.value; upd(); });
                box.appendChild(field(date(e.d) + ' · ' + what(e) + ' (claimed ' + money(it.a) + ')', amountRow(inp), 'pp-a-' + it.e + '-err'));
            });
            box.appendChild(tot); upd();
            const d = dateInput('pp-date', panel.pd, c.d); d.addEventListener('input', () => { panel.pd = d.value; });
            box.appendChild(field('Date paid back', d, 'pp-date-err'));
            done.appendChild(btn('Save payment', 'primary', () => {
                let ok = true; const paid = {};
                c.items.forEach(it => {
                    const r = C.parseMoney(panel.items[it.e], false);
                    let m = r.error ? r.error.replace('Type the amount, such as 2500.', 'Type what was paid for this line, or 0.') : '';
                    if (!m && r.n > it.a) m = 'More than you claimed. Type at most ' + money(it.a) + '.';
                    ok = setErr('pp-a-' + it.e, m) && ok; if (!m) paid[it.e] = r.n;
                });
                ok = setErr('pp-date', checkDay(panel.pd, c.d, 'date paid back')) && ok;
                if (!ok) { const bad = document.querySelector('.panel [aria-invalid="true"]'); if (bad) bad.focus(); return; }
                const pd = panel.pd; panel = null;
                const got = Object.keys(paid).reduce((s, k) => s + paid[k], 0);
                change(() => { c.st = 'paid'; c.pd = pd; c.items.forEach(it => { it.p = paid[it.e]; }); delete c.rest; },
                    'history-msg', got === cx.total ? 'Paid back in full: ' + money(got) + '.' : 'Paid back ' + money(got) + ' of ' + money(cx.total) + '; ' + money(cx.total - got) + ' not paid back.');
            }));
        } else if (panel.mode === 'rej') {
            box.appendChild(el('h4', null, 'Claim rejected'));
            const w = textInput('pp-why', panel.why, 'e.g. Missing receipt', null, 200); w.addEventListener('input', () => { panel.why = w.value; });
            box.appendChild(field('Why was it rejected? (optional)', w));
            const d = dateInput('pp-date', panel.pd, c.d); d.addEventListener('input', () => { panel.pd = d.value; });
            box.appendChild(field('Date you heard', d, 'pp-date-err'));
            done.appendChild(btn('Save', 'primary', () => {
                if (!setErr('pp-date', checkDay(panel.pd, c.d, 'date you heard'))) return;
                const why = panel.why.trim(), pd = panel.pd; panel = null; tab = 'todo';
                change(() => { c.st = 'rej'; c.pd = pd; if (why) c.why = why; else delete c.why; }, 'exps-msg', 'Marked as rejected. Its ' + C.expWord(c.items.length) + ' ' + (c.items.length === 1 ? 'is' : 'are') + ' back in Not claimed yet.');
            }));
        } else {
            box.appendChild(el('h4', null, 'Edit claim'));
            c.items.forEach(it => {
                const e = byId(it.e); if (!e) return;
                const inp = textInput('pe-a-' + it.e, panel.items[it.e], '', 'decimal'); inp.addEventListener('input', () => { panel.items[it.e] = inp.value; });
                const f = field(date(e.d) + ' · ' + what(e), amountRow(inp), 'pe-a-' + it.e + '-err');
                if (c.items.length > 1) f.appendChild(btn('Take out of this claim', 'link small-link', () => {
                    delete panel.items[it.e];
                    change(() => { c.items = c.items.filter(x => x.e !== it.e); }, 'waiting-msg', what(e) + ' is out of the claim and back in Not claimed yet.');
                }, 'Take ' + what(e) + ' out of this claim'));
                box.appendChild(f);
            });
            const d = dateInput('pe-date', panel.d); d.addEventListener('input', () => { panel.d = d.value; });
            box.appendChild(field('Date you sent the claim', d, 'pe-date-err'));
            const r = textInput('pe-ref', panel.ref, 'e.g. EXP-0412', null, 40); r.addEventListener('input', () => { panel.ref = r.value; });
            box.appendChild(field('Claim number (optional)', r));
            done.appendChild(btn('Save changes', 'primary', () => {
                let ok = true; const items = [];
                c.items.forEach(it => {
                    const rr = C.parseMoney(panel.items[it.e], true), max = C.openWithout(state, it.e, c.id);
                    let m = rr.error || ''; if (!m && rr.n > max) m = 'At most ' + money(max) + ', what is left to claim on this expense.';
                    ok = setErr('pe-a-' + it.e, m) && ok; if (!m) items.push({ e: it.e, a: rr.n });
                });
                let dm = checkDay(panel.d, null, 'date you sent the claim');
                const early = c.items.map(it => byId(it.e)).find(e => e && e.d > panel.d);
                if (!dm && early) dm = 'The claim cannot be sent before you paid ' + early.what + ' (' + date(early.d, true) + ').';
                ok = setErr('pe-date', dm) && ok;
                if (!ok) return;
                const o = { d: panel.d, ref: panel.ref.trim() }; panel = null;
                change(() => { c.items = items; c.d = o.d; if (o.ref) c.ref = o.ref; else delete c.ref; }, 'waiting-msg', 'Saved the changes to the claim.');
            }));
        }
        done.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); }));
        box.appendChild(done);
        return box;
    }
    function renderClaims(a) {
        if (panel && !state.claims.some(c => c.id === panel.id)) panel = null;
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

    // ---------- month by month ----------
    function monthRange() {
        const ms = state.exps.map(e => e.d.slice(0, 7)).concat([today.slice(0, 7)]).sort();
        return [ms[0], ms[ms.length - 1]];
    }
    function monthText(m) {
        const L = ['Work expenses, ' + C.monthName(m.ym) + (state.co.name ? ', ' + state.co.name : ''), 'Spent: ' + money(m.spent) + ' (' + C.expWord(m.n) + ')'];
        if (m.n) {
            L.push('Paid back ' + money(m.paidBack) + ', waiting ' + money(m.waiting) + ', not claimed yet ' + money(m.open) + '.');
            L.push('', 'By type:'); m.cats.forEach(c => L.push('- ' + c.k + ': ' + money(c.amt)));
            if (m.projects.length) { L.push('', 'By client or project:'); m.projects.forEach(c => L.push('- ' + (c.k || 'No client or project') + ': ' + money(c.amt))); }
        }
        return L.join('\n');
    }
    function renderMonths(a) {
        const [lo, hi] = monthRange();
        if (!ym || ym < lo || ym > hi) ym = state.exps.some(e => e.d.slice(0, 7) === today.slice(0, 7)) ? today.slice(0, 7) : (state.exps.length ? state.exps.map(e => e.d.slice(0, 7)).sort().pop() : today.slice(0, 7));
        $('m-name').textContent = C.monthName(ym);
        $('m-prev').disabled = ym <= lo; $('m-next').disabled = ym >= hi;
        $('m-prev').setAttribute('aria-label', 'Previous month: ' + C.monthName(C.addMonths(ym, -1)));
        $('m-next').setAttribute('aria-label', 'Next month: ' + C.monthName(C.addMonths(ym, 1)));
        const m = C.month(a, ym), body = $('m-body'); body.textContent = '';
        const big = el('div', 'm-top');
        big.appendChild(p('t-label', 'Spent in ' + C.monthName(ym)));
        big.appendChild(p('g-mid', money(m.spent)));
        big.appendChild(p('g-line', m.n ? C.expWord(m.n) + ' · paid back ' + money(m.paidBack) + ' · waiting ' + money(m.waiting) + ' · not claimed yet ' + money(m.open) : 'No expenses this month.'));
        body.appendChild(big);
        const list = (title, rows, blank) => {
            if (!rows.length) return;
            const box = el('div', 'm-list'); box.appendChild(el('h3', null, title));
            const ul = el('ul', 'cl-lines');
            rows.forEach(r => { const li = el('li'); li.appendChild(el('span', 'cl-what', r.k || blank)); li.appendChild(el('span', 'cl-amt', money(r.amt))); ul.appendChild(li); });
            box.appendChild(ul); body.appendChild(box);
        };
        list('By type', m.cats); list('By client or project', m.projects, 'No client or project');
        $('m-copy').hidden = !m.n;
    }

    // ---------- page ----------
    function render() {
        const a = C.analyse(state, today);
        const any = state.exps.length > 0;
        $('intro').hidden = any;
        $('glance').hidden = !any; $('exps').hidden = !any; $('months').hidden = !any;
        if (any) { renderGlance(a); renderExps(a); renderMonths(a); }
        renderClaims(a); renderProj();
        document.querySelectorAll('[data-cur]').forEach(t => { t.textContent = state.cur; t.hidden = !state.cur; });
        $('restore-first').hidden = any || !!editing;
        $('backup').disabled = !any; $('csv').disabled = !any;
        $('e-date').max = today;
        ['add-msg', 'exps-msg', 'waiting-msg', 'history-msg', 'rules-msg', 'tools-msg', 'glance-msg', 'months-msg', 'top-msg'].forEach(id => { const m = $(id); if (m) { m.textContent = ''; m.className = 'msg'; } });
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
        const where = state.exps.length ? 'tools-msg' : 'add-msg';
        if (file.size > 5e6) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const r = new FileReader();
        r.onload = () => {
            let s = null;
            try { const j = JSON.parse(r.result); s = j && (!j.app || j.app === SLUG) ? C.cleanState(j) : null; } catch (e) { s = null; }
            if (!s) { flash = { where, text: 'That file is not a backup from this app.', bad: true }; render(); return; }
            ticks = {}; panel = null; resetForm(false);
            change(() => { state = s; }, where, 'Restored ' + C.expWord(s.exps.length) + ' and ' + C.claimWord(s.claims.length) + '.');
            $('cur').value = state.cur; fillRules();
        };
        r.onerror = () => { flash = { where, text: 'Could not read that file.', bad: true }; render(); };
        r.readAsText(file);
    }

    function init() {
        load();
        fillCur(); fillCats();
        DAYS_OPTS.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; $('co-days').appendChild(o); });
        fillRules();
        resetForm(false);
        $('e-save').addEventListener('click', saveExp);
        $('e-cancel').addEventListener('click', () => { resetForm(false); render(); });
        ['e-amt', 'e-what', 'e-proj', 'e-note', 'fx-code', 'fx-amt', 'fx-rate', 'km-dist', 'km-rate'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveExp(); } }));
        ['fx-code', 'fx-amt', 'fx-rate', 'km-dist', 'km-rate'].forEach(id => $(id).addEventListener('input', workOut));
        $('km-unit').addEventListener('change', workOut);
        $('fx-open').addEventListener('click', () => { setCalc('fx'); $('fx-code').focus(); });
        $('km-open').addEventListener('click', () => { setCalc('km'); if ($('e-cat').value === C.CATS[0]) $('e-cat').value = 'Fuel or mileage'; $('km-dist').focus(); });
        $('fx-close').addEventListener('click', () => { ['fx-code', 'fx-amt', 'fx-rate'].forEach(id => { $(id).value = ''; }); setCalc(''); $('e-amt').focus(); });
        $('km-close').addEventListener('click', () => { ['km-dist', 'km-rate'].forEach(id => { $(id).value = ''; }); setCalc(''); $('e-amt').focus(); });
        $('e-more-open').addEventListener('click', () => { openMore(true); $('e-note').focus(); });
        $('co-days').addEventListener('change', () => { $('co-odays-box').hidden = $('co-days').value !== 'other'; if ($('co-odays-box').hidden) setErr('co-odays', ''); });
        $('co-save').addEventListener('click', saveRules);
        ['co-name', 'co-odays'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveRules(); } }));
        $('cur').addEventListener('change', () => { state.cur = $('cur').value; save(); workOut(); render(); });
        document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { tab = t.dataset.tab; showAll = false; render(); }));
        $('e-showall').addEventListener('click', () => { showAll = !showAll; render(); });
        $('h-showall').addEventListener('click', () => { showAllHist = !showAllHist; render(); });
        $('tick-all').addEventListener('click', () => { C.analyse(state, today).todo.forEach(x => { if (!(x.exp.id in ticks)) ticks[x.exp.id] = plain(x.open); }); if (!nc.d) nc.d = today; render(); $('newclaim').scrollIntoView({ block: 'nearest' }); });
        $('nc-date').addEventListener('input', () => { nc.d = $('nc-date').value; });
        $('nc-ref').addEventListener('input', () => { nc.ref = $('nc-ref').value; });
        $('nc-ref-open').addEventListener('click', () => { $('nc-ref-box').hidden = false; $('nc-ref-open').hidden = true; $('nc-ref').focus(); });
        $('nc-save').addEventListener('click', saveNewClaim);
        $('nc-copy').addEventListener('click', () => copyText(claimListText(), 'exps-msg'));
        $('nc-clear').addEventListener('click', () => { ticks = {}; render(); });
        $('g-copy').addEventListener('click', () => copyText(summaryText(C.analyse(state, today)), 'glance-msg'));
        $('m-prev').addEventListener('click', () => { ym = C.addMonths(ym, -1); render(); });
        $('m-next').addEventListener('click', () => { ym = C.addMonths(ym, 1); render(); });
        $('m-copy').addEventListener('click', () => copyText(monthText(C.month(C.analyse(state, today), ym)), 'months-msg'));
        $('backup').addEventListener('click', backup);
        $('csv').addEventListener('click', () => {
            download('work-expenses-' + today + '.csv', 'text/csv', '﻿' + C.csv(state, C.analyse(state, today), LOC));
            flash = { where: 'tools-msg', text: 'Saved the list as a CSV file. It opens in Excel, Google Sheets or Numbers.' }; render();
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-first').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => { restore(e.target.files[0]); e.target.value = ''; });
        $('del-all').addEventListener('click', () => {
            if (!state.exps.length && !state.claims.length) { flash = { where: 'tools-msg', text: 'There is nothing to delete yet.' }; render(); return; }
            ticks = {}; panel = null; resetForm(false);
            const cur = state.cur, co = state.co;
            change(() => { state = C.emptyState(); state.cur = cur; state.co = co; }, 'tools-msg', 'Deleted every expense and claim. Your company rules and currency are kept.');
        });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) { const t = C.localDay(new Date()); if (t !== today) { today = t; render(); } } });
        if (!canSave) $('store-warn').hidden = false;
        render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
