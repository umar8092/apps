// Prepaid Mobile Data Bundle Tracker: the page. The maths and the words are in core.js (window.PDB).
(function () {
    'use strict';
    const C = window.PDB, SLUG = 'prepaid-mobile-data-bundle-tracker', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    // a locale Intl accepts (some systems report tags such as "en-US@posix")
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', '₦': '₦ (naira)',
        'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', 'Rp': 'Rp (rupiah)', 'RM': 'RM (ringgit)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const VALID = [1, 3, 7, 14, 15, 28, 30, 60, 90];
    let state = C.emptyState(), now = C.localNow(new Date());
    let editing = null;          // id of the line in the top form, or null when adding
    let open = {};               // line id -> 'top' | 'renew' (inline form shown)
    let otherTime = {};          // line id -> show the date and time for a balance check
    let editRead = null;         // { lid, rid }
    let showAll = {};            // line id -> show every balance check
    let pastOpen = {};           // line id -> earlier bundles opened
    let flash = null, undoSnap = null, canSave = true, keep = {};
    const forms = {};            // prefix -> reader for a set of bundle fields

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
    function change(fn, where, text, clear) {
        const before = JSON.stringify(state);
        fn();
        save();
        undoSnap = before;
        flash = { where, text, undo: true };
        render(clear);
    }
    function undo() {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap));
        if (s) state = s;
        const where = flash && $(flash.where) ? flash.where : 'top-msg';
        undoSnap = null; editRead = null;
        save();
        flash = { where, text: 'Undone.' };
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const p = (cls, text) => el('p', cls, text);
    const money = c => C.fmtMoney(c, state.cur, LOC);
    const data = n => C.fmtData(n, LOC);
    const when = (s, time) => C.fmtWhen(s, LOC, { time, year: s.slice(0, 4) !== now.slice(0, 4) });
    const byId = id => state.lines.find(x => x.id === id);
    const cur = l => l.buys[l.buys.length - 1];
    const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into a message or email.' }; render(); };
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
    function field(lbl, ctrl, cls) { const f = el('div', 'field' + (cls ? ' ' + cls : '')); f.append(label(ctrl.id, lbl), ctrl); return f; }
    function unitSel(id, value) {
        const s = el('select'); s.id = id; s.setAttribute('aria-label', 'Unit');
        ['GB', 'MB'].forEach(u => { const o = el('option', null, u); o.value = u; s.appendChild(o); });
        s.value = value === 'MB' ? 'MB' : 'GB';
        return s;
    }
    function dataRow(id, value, unit, ph) {
        const r = el('div', 'amount-row');
        r.append(input(id, 'text', value, ph), unitSel(id + '-u', unit));
        return r;
    }
    const slugName = l => l.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bundle';

    // ---------- the bundle fields (top form and "Bought a new bundle") ----------
    // v = { mb, price, start, exp, days }
    function buyFields(box, pre, v, opt) {
        opt = opt || {};
        box.textContent = '';
        const d = v.mb != null ? C.dataInput(v.mb) : { v: '', u: 'GB' };
        box.append(label(pre + '-mb', 'Data in the bundle'), dataRow(pre + '-mb', d.v, d.u, 'e.g. 30'), errP(pre + '-mb'));
        const priceBox = el('div'); priceBox.id = pre + '-price-box';
        const pr = el('div', 'amount-row');
        const pi = input(pre + '-price', 'text', v.price != null ? String(v.price / 100) : '', 'e.g. 1000');
        if (state.cur) pr.appendChild(el('span', 'cur-tag', state.cur));
        pr.appendChild(pi);
        priceBox.append(label(pre + '-price', 'Price paid'), pr, errP(pre + '-price'));
        const priceOpen = btn('+ Add the price (optional)', 'link', () => { priceBox.hidden = false; priceOpen.hidden = true; pi.focus(); });
        priceOpen.id = pre + '-price-open';
        priceBox.hidden = v.price == null; priceOpen.hidden = v.price != null;
        box.append(priceOpen, priceBox);

        const t1 = el('div', 'two');
        t1.append(field('Bought on', input(pre + '-sd', 'date', v.start.slice(0, 10))), field('At', input(pre + '-st', 'time', v.start.slice(11))));
        box.append(t1, errP(pre + '-sd'));
        const vs = el('select'); vs.id = pre + '-valid';
        VALID.forEach(n => { const o = el('option', null, n === 1 ? '1 day' : n + ' days'); o.value = String(n); vs.appendChild(o); });
        const oo = el('option', null, 'Other: I will type the expiry'); oo.value = 'other'; vs.appendChild(oo);
        vs.value = v.days && VALID.includes(v.days) ? String(v.days) : 'other';
        box.append(label(pre + '-valid', 'Valid for'), vs);
        const t2 = el('div', 'two');
        t2.append(field('Expires on', input(pre + '-ed', 'date', v.exp.slice(0, 10))), field('At', input(pre + '-et', 'time', v.exp.slice(11))));
        box.append(t2, errP(pre + '-ed'), p('hint', 'If your operator\'s message shows the exact expiry, type that date and time.'));
        if (opt.carry) {
            const c = el('label', 'check'), cb = el('input'); cb.type = 'checkbox'; cb.id = pre + '-carry';
            c.append(cb, el('span', null, 'Add the data left from the old bundle (about ' + data(opt.carry) + '), if your operator carries it over'));
            box.appendChild(c);
        }
        const q = id => box.querySelector('#' + pre + '-' + id);
        function fillExp() {
            if (q('valid').value === 'other') return;
            const sdv = q('sd').value, stv = q('st').value || '00:00';
            if (!/^\d{4}-\d{2}-\d{2}$/.test(sdv)) return;
            const e = C.addMin(C.join(sdv, stv.slice(0, 5)), Number(q('valid').value) * C.DAYM);
            q('ed').value = e.slice(0, 10); q('et').value = e.slice(11);
        }
        [q('sd'), q('st'), q('valid')].forEach(i => i.addEventListener('change', fillExp));
        [q('ed'), q('et')].forEach(i => i.addEventListener('change', () => { q('valid').value = 'other'; }));
        forms[pre] = () => readBuy(box, pre);
    }
    function readBuy(box, pre) {
        const q = id => box.querySelector('#' + pre + '-' + id);
        let ok = true;
        const r = C.parseData(q('mb').value, q('mb-u').value, { positive: true, blank: 'Type how much data the bundle has, such as 30.' });
        if (r.error) ok = setErr(pre + '-mb', r.error) && ok; else setErr(pre + '-mb', '');
        let price;
        if (!q('price-box').hidden && q('price').value.trim()) {
            const m = C.parseMoney(q('price').value);
            if (m.error) ok = setErr(pre + '-price', m.error) && ok; else { setErr(pre + '-price', ''); price = m.n; }
        } else setErr(pre + '-price', '');
        const start = C.join(q('sd').value, (q('st').value || '00:00').slice(0, 5)), exp = C.join(q('ed').value, (q('et').value || '23:59').slice(0, 5));
        const bad = C.checkBuy({ start, exp }, C.localNow(new Date()));
        setErr(pre + '-sd', bad && bad.f === 'start' ? bad.e : ''); setErr(pre + '-ed', bad && bad.f === 'exp' ? bad.e : '');
        if (bad) ok = false;
        if (!ok) { const b = box.querySelector('[aria-invalid="true"]'); if (b) b.focus(); return null; }
        const o = { mb: r.n, start, exp, unit: r.unit };
        if (price != null) o.price = price;
        if (q('carry')) o.carry = q('carry').checked;
        return o;
    }
    const daysOf = b => { const m = C.tMin(b.exp) - C.tMin(b.start); return m % C.DAYM === 0 ? m / C.DAYM : null; };

    // ---------- the top form ----------
    function freshVals(days) { const s = C.localNow(new Date()); return { start: s, exp: C.addMin(s, (days || 30) * C.DAYM), days: days || 30 }; }
    function resetForm() {
        editing = null;
        $('f-name').value = ''; setErr('f-name', '');
        buyFields($('f-buy'), 'f', freshVals(30));
        $('add-h').textContent = 'Add a data bundle';
        $('f-save').textContent = 'Add bundle';
        $('f-cancel').hidden = true;
        $('quick').hidden = false;
        $('add-intro').hidden = false;
        const del = $('f-del-cur'); if (del) del.remove();
    }
    function fillForm(l) {
        editing = l.id;
        const b = cur(l);
        $('f-name').value = l.name; setErr('f-name', '');
        buyFields($('f-buy'), 'f', { mb: b.mb, price: b.price, start: b.start, exp: b.exp, days: daysOf(b) });
        $('add-h').textContent = 'Edit ' + l.name;
        $('f-save').textContent = 'Save changes';
        $('f-cancel').hidden = false;
        $('quick').hidden = true;
        $('add-intro').hidden = true;
        if (l.buys.length > 1) {
            const d = btn('Delete this bundle only (keep the earlier ones)', 'danger', () => {
                const name = l.name;
                change(() => { removeBuy(l, l.buys.length - 1); }, 'top-msg', 'Deleted the latest bundle of ' + name + '.');
                resetForm();
            });
            d.id = 'f-del-cur';
            $('f-cancel').parentNode.after(d);
        }
        $('add').scrollIntoView({ block: 'start' });
        $('f-name').focus({ preventScroll: true });
    }
    function removeBuy(l, i) {
        const b = l.buys[i], prev = l.buys[i - 1];
        if (prev && prev.ended && prev.ended === b.start) delete prev.ended;
        l.buys.splice(i, 1);
    }
    // every balance and top-up must still fit the edited bundle
    function fits(b) {
        const end = C.endOf(b);
        for (const t of b.tops) if (t.at < b.start || t.at > end) return 'Extra data added on ' + when(t.at, true) + ' is outside these dates. Change the dates or delete it first.';
        const test = Object.assign({}, b, { reads: [] });
        for (const r of C.sortedReads(b)) {
            const e = C.checkRead(test, r.at, r.mb, null);
            if (e) return 'Your balance of ' + data(r.mb) + ' on ' + when(r.at, true) + ' does not fit: ' + e;
            test.reads.push(r);
        }
        return '';
    }
    function saveForm() {
        const name = $('f-name').value.trim();
        const nameOk = setErr('f-name', name ? '' : 'Type a name, such as Jazz monthly.');
        const o = forms.f();
        if (!nameOk) { $('f-name').focus(); return; }
        if (!o) return;
        if (editing) {
            const l = byId(editing); if (!l) { resetForm(); render(); return; }
            const b = cur(l), prev = l.buys[l.buys.length - 2];
            const nb = Object.assign({}, b, { mb: o.mb, start: o.start, exp: o.exp });
            if (o.price != null) nb.price = o.price; else delete nb.price;
            if (prev && o.start <= prev.start) { setErr('f-sd', 'This bundle must start after the earlier one (bought ' + when(prev.start, true) + ').'); return; }
            const bad = fits(nb);
            if (bad) { showMsg($('add-msg'), bad, false, true); return; }
            resetForm();
            change(() => {
                l.name = name; l.unit = o.unit;
                Object.assign(b, nb);
                if (o.price == null) delete b.price;
                if (prev && prev.ended && C.tMin(prev.ended) !== C.tMin(o.start)) { if (o.start < prev.exp) prev.ended = o.start; else delete prev.ended; }
            }, 'l-msg-' + l.id, 'Saved the changes.');
            return;
        }
        const l = { id: newId('l'), name, unit: o.unit, buys: [{ id: newId('b'), start: o.start, exp: o.exp, mb: o.mb, tops: [], reads: [] }] };
        if (o.price != null) l.buys[0].price = o.price;
        resetForm();
        change(() => { state.lines.unshift(l); }, 'l-msg-' + l.id, 'Added. Now check your balance and type the data left.');
        const box = $('line-' + l.id); if (box) { box.scrollIntoView({ block: 'nearest' }); const i = $('rd-' + l.id); if (i) i.focus({ preventScroll: true }); }
    }

    // ---------- actions in a box ----------
    function saveRead(l) {
        const b = cur(l), id = 'rd-' + l.id;
        const r = C.parseData($(id).value, $(id + '-u').value, { blank: 'Type the data left, such as 7.4.' });
        if (r.error) { setErr(id, r.error); $(id).focus(); return; }
        let at = C.localNow(new Date());
        if (otherTime[l.id]) {
            const d = $('rdd-' + l.id).value, t = ($('rdt-' + l.id).value || '').slice(0, 5);
            if (!d || !t) { setErr(id, 'Pick the date and time you checked.'); return; }
            at = C.join(d, t);
        } else if (at > C.endOf(b)) {
            setErr(id, 'This bundle has expired. Use "+ Checked at a different time" for a balance seen before it expired, or log the new bundle.'); return;
        }
        // two checks in the same minute: the newer one replaces the older one
        const same = b.reads.find(x => x.at === at);
        const e = C.checkRead(b, at, r.n, C.localNow(new Date()), same && same.id);
        if (e) { setErr(id, e); $(id).focus(); return; }
        setErr(id, '');
        delete keep[id];
        change(() => {
            l.unit = r.unit;
            if (same) same.mb = r.n; else b.reads.push({ id: newId('r'), at, mb: r.n });
            b.reads = C.sortedReads(b);
            otherTime[l.id] = false;
        }, 'l-msg-' + l.id, 'Saved ' + data(r.n) + ' left.', [id]);
    }
    function saveEditRead(l, r) {
        const b = cur(l), id = 'er-' + r.id;
        const x = C.parseData($(id).value, $(id + '-u').value, { blank: 'Type the data left, such as 7.4.' });
        if (x.error) { setErr(id, x.error); return; }
        const at = C.join($('erd-' + r.id).value, ($('ert-' + r.id).value || '').slice(0, 5));
        const e = C.checkRead(b, at, x.n, C.localNow(new Date()), r.id);
        if (e) { setErr(id, e); return; }
        editRead = null;
        change(() => { r.mb = x.n; r.at = at; b.reads = C.sortedReads(b); }, 'l-msg-' + l.id, 'Saved.');
    }
    function saveTop(l) {
        const b = cur(l), pre = 'tp-' + l.id;
        const r = C.parseData($(pre).value, $(pre + '-u').value, { positive: true, blank: 'Type how much extra data, such as 5.' });
        let ok = setErr(pre, r.error || '');
        let price;
        if ($(pre + 'p').value.trim()) { const m = C.parseMoney($(pre + 'p').value); ok = setErr(pre + 'p', m.error || '') && ok; price = m.n; } else setErr(pre + 'p', '');
        const at = C.join($(pre + 'd').value, ($(pre + 't').value || '').slice(0, 5));
        let te = '';
        if (!C.isTime(at)) te = 'Pick the date and time you added it.';
        else if (at < b.start) te = 'That is before the bundle was bought.';
        else if (at > C.endOf(b)) te = 'That is after the bundle expired. Log it as a new bundle instead.';
        else if (at > C.localNow(new Date())) te = 'That time has not come yet.';
        ok = setErr(pre + 'd', te) && ok;
        if (!ok) return;
        open[l.id] = null;
        change(() => { const t = { id: newId('t'), at, mb: r.n }; if (price != null) t.price = price; b.tops.push(t); }, 'l-msg-' + l.id, 'Added ' + data(r.n) + ' of extra data.');
    }
    function saveRenew(l) {
        const o = forms['rn-' + l.id](); if (!o) return;
        const b = cur(l);
        if (o.start <= b.start) { setErr('rn-' + l.id + '-sd', 'The new bundle must start after the last one (bought ' + when(b.start, true) + ').'); return; }
        const late = b.reads.concat(b.tops).filter(x => x.at > o.start).sort((x, y) => x.at < y.at ? 1 : -1)[0];
        if (late && o.start < b.exp) { setErr('rn-' + l.id + '-sd', 'You saved a balance or top-up on the old bundle on ' + when(late.at, true) + '. The new bundle must start after that.'); return; }
        const carry = o.start < b.exp && o.carry ? C.leftAt(b, o.start) : 0;
        open[l.id] = null;
        change(() => {
            if (o.start < b.exp) b.ended = o.start;
            const nb = { id: newId('b'), start: o.start, exp: o.exp, mb: o.mb, tops: [], reads: [] };
            if (o.price != null) nb.price = o.price;
            if (carry > 0) nb.carried = carry;
            l.buys.push(nb); l.unit = o.unit;
        }, 'l-msg-' + l.id, 'New bundle logged. Check your balance now and then and type the data left.');
    }
    function summary(l) {
        const b = cur(l), a = C.analyse(b, now);
        const lines = [l.name + ' (' + data(b.mb) + (b.price != null ? ' for ' + money(b.price) : '') + ', expires ' + when(b.exp, true) + ')'];
        if (a.state === 'expired') lines.push('Expired on ' + when(b.exp, true) + '.' + (a.checked ? ' Last check: ' + data(a.left) + ' left on ' + when(a.leftAt, true) + '.' : ''));
        else if (a.state === 'out') lines.push('Ran out on ' + when(a.outAt, true) + ', ' + C.fmtSpan(a.early) + ' before it expired.');
        else {
            lines.push((a.estimated ? 'About ' : '') + data(a.est) + ' left, ' + C.fmtSpan(a.remain) + ' to go.');
            lines.push('You can use ' + C.perDay(a.allow, LOC) + '.');
            if (a.pace != null) lines.push(paceText(a));
        }
        if (a.perGB != null) lines.push('Cost per GB: ' + money(a.perGB) + '.');
        return lines.join('\n');
    }
    function paceText(a) {
        const pace = 'At your pace so far (' + C.perDay(a.pace, LOC) + ')';
        if (a.maybeOut) return pace + ' it may have run out already. Check your balance.';
        if (a.lasts === false) return pace + ' it will run out on ' + when(a.runOut, true) + ', about ' + C.fmtSpan(a.early) + ' before it expires.';
        if (a.spare > a.cap / 20) return pace + ' it will last. About ' + data(a.spare) + ' will be left unused when it expires, so you can use more.';
        return pace + ' it will last until it expires.';
    }
    function mailLink(l) {
        const a = el('a', 'secondary mail', 'Email');
        a.href = 'mailto:?subject=' + encodeURIComponent('Data bundle: ' + l.name) + '&body=' + encodeURIComponent(summary(l));
        return a;
    }
    function ics(l) {
        const b = cur(l), at = C.tMin(b.exp) - C.DAYM > C.tMin(now) ? C.addMin(b.exp, -C.DAYM) : C.addMin(b.exp, -60);
        const f = s => s.replace(/[-:]/g, '') + '00';
        const esc = s => s.replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
        const title = 'Data bundle expires ' + (at === C.addMin(b.exp, -C.DAYM) ? 'tomorrow' : 'soon') + ': ' + l.name;
        const text = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Prepaid Mobile Data Bundle Tracker//EN', 'BEGIN:VEVENT', 'UID:' + b.id + '-' + f(b.exp) + '@umar8092.github.io',
            'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', 'DTSTART:' + f(at), 'DTEND:' + f(C.addMin(at, 15)), 'SUMMARY:' + esc(title),
            'DESCRIPTION:' + esc(l.name + ' expires on ' + when(b.exp, true) + '. Renew it or use the data left.'),
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        download('data-bundle-' + slugName(l) + '.ics', 'text/calendar', text);
        flash = { where: 'l-msg-' + l.id, text: 'Saved a calendar file. Open it to add the reminder.' }; render();
    }

    // ---------- drawing ----------
    function keepVals() {
        keep = {};
        document.querySelectorAll('#l-list input, #l-list select').forEach(i => { if (i.id && i.type !== 'checkbox' && i.type !== 'file') keep[i.id] = i.value; });
    }
    function bar(name, pct, cls) {
        const w = el('div', 'meter');
        const top = el('div', 'm-top'); top.append(el('span', null, name), el('b', null, pct + '%'));
        const b = el('div', 'bar ' + (cls || '')); b.setAttribute('role', 'img'); b.setAttribute('aria-label', name + ' ' + pct + '%');
        const s = el('span'); s.style.width = pct + '%'; b.appendChild(s);
        w.append(top, b);
        return w;
    }
    function drawResult(box, l, b, a) {
        const res = el('div', 'res');
        if (a.state === 'expired') {
            res.append(p('r-label', 'Expired'), p('r-big small', when(b.exp, true)));
            if (a.checked) {
                const u = C.usedTotal(b);
                res.appendChild(p('r-line', u && u.exact && u.left > 0 ? data(u.left) + ' was left at your last check (' + when(u.at, true) + ') and went unused.' : 'Last check: ' + data(a.left) + ' left on ' + when(a.leftAt, true) + '.'));
            }
            const act = el('div', 'act is-due'); act.append(p('a-big', 'Bought the next one? Log it to keep tracking.'), btn('Bought a new bundle', 'primary', () => { open[l.id] = 'renew'; render(); const f = $('rn-' + l.id + '-mb'); if (f) f.focus(); }));
            res.appendChild(act);
        } else if (a.state === 'out') {
            res.append(p('r-label', 'Ran out'), p('r-big small', when(a.outAt, true)));
            res.appendChild(p('r-line', C.fmtSpan(a.early) + ' before it expires on ' + when(b.exp, true) + '.'));
            const act = el('div', 'act is-late'); act.appendChild(p('a-big', 'Add extra data or log a new bundle below.')); res.appendChild(act);
        } else {
            res.appendChild(p('r-label', a.estimated ? 'About' : (a.checked ? 'Left at your last check' : 'Not checked yet: the full bundle')));
            res.appendChild(p('r-big', data(a.est) + ' left'));
            res.appendChild(p('r-line', C.fmtSpan(a.remain) + ' to go, expires ' + when(b.exp, true)));
            res.appendChild(p('r-line strong allow', 'You can use ' + C.perDay(a.allow, LOC)));
            if (a.estimated) res.appendChild(p('r-note', 'Estimated from your pace. Last check: ' + data(a.left) + ' on ' + when(a.leftAt, true) + '.'));
            if (a.pace != null) {
                const act = el('div', 'act ' + (a.lasts ? 'is-ok' : 'is-late'));
                act.appendChild(p('a-big', paceText(a)));
                res.appendChild(act);
            } else res.appendChild(p('r-note', a.checked ? 'Check again in a few hours to see your pace and whether it will last.' : 'Check your balance and type the data left below to see your pace and whether it will last.'));
            const m = el('div', 'meters');
            m.append(bar('Data used', a.usedPct, a.usedPct > a.timePct + 5 ? 'hot' : ''), bar('Time gone', a.timePct, 'time'));
            res.appendChild(m);
        }
        if (a.perGB != null) res.appendChild(p('r-note cost', 'Cost per GB: ' + money(a.perGB) + ' (' + data(a.total) + ' for ' + money(a.paid) + ')'));
        if (b.carried) res.appendChild(p('r-note', 'Includes ' + data(b.carried) + ' carried over from the old bundle.'));
        box.appendChild(res);
    }
    function drawCheck(box, l, b, a) {
        if (a.state === 'expired' && !otherTime[l.id]) {
            box.appendChild(btn('+ Add a balance you checked before it expired', 'link', () => { otherTime[l.id] = true; render(); const d = $('rd-' + l.id); if (d) d.focus(); }));
            return;
        }
        const s = el('div', 'check-box');
        const id = 'rd-' + l.id;
        s.appendChild(el('h4', null, 'Check your balance'));
        s.appendChild(label(id, 'Data left now'));
        const row = el('div', 'save-row');
        row.append(dataRow(id, '', l.unit || 'GB', 'e.g. 7.4'), btn('Save', 'primary save', () => saveRead(l)));
        row.querySelector('input').addEventListener('keydown', e => { if (e.key === 'Enter') saveRead(l); });
        s.append(row, errP(id));
        if (otherTime[l.id]) {
            const lastT = C.localNow(new Date()) < C.endOf(b) ? C.localNow(new Date()) : C.endOf(b);
            const t = el('div', 'two');
            t.append(field('Checked on', input('rdd-' + l.id, 'date', lastT.slice(0, 10))), field('At', input('rdt-' + l.id, 'time', lastT.slice(11))));
            s.appendChild(t);
            s.appendChild(btn('Use the time now', 'link', () => { otherTime[l.id] = false; render(); }));
        } else s.appendChild(btn('+ Checked at a different time', 'link', () => { otherTime[l.id] = true; render(); const d = $('rdd-' + l.id); if (d) d.focus(); }));
        s.appendChild(p('hint', 'Dial your operator\'s balance code, open their app or read their text message, then type the data left.'));
        box.appendChild(s);
    }
    function drawReads(box, l, b) {
        const rs = C.sortedReads(b).reverse();
        if (!rs.length && !b.tops.length) return;
        const w = el('div', 'reads');
        w.appendChild(el('h4', null, 'Balance checks for this bundle'));
        const list = el('div', 'r-list');
        const items = rs.map(r => ({ k: 'r', at: r.at, r })).concat(b.tops.map(t => ({ k: 't', at: t.at, t }))).sort((x, y) => x.at < y.at ? 1 : -1);
        const shown = showAll[l.id] ? items : items.slice(0, 5);
        shown.forEach(it => {
            const row = el('div', 'r-row');
            if (it.k === 't') {
                const m = el('div', 'r-main');
                m.append(p('r-date', when(it.at, true)), p('r-val', '+ ' + data(it.t.mb) + ' extra data' + (it.t.price != null ? ' for ' + money(it.t.price) : '')));
                row.append(m, el('div', 'r-btns'));
                row.lastChild.appendChild(btn('Delete', 'secondary small danger-t', () => {
                    const later = b.reads.find(r => r.at > it.at && r.mb > C.capBefore(b, r.at) - it.t.mb);
                    if (later) { flash = { where: 'l-msg-' + l.id, text: 'A balance of ' + data(later.mb) + ' after this top-up only fits with it. Delete that balance first.', bad: true }; render(); return; }
                    change(() => { b.tops = b.tops.filter(x => x.id !== it.t.id); }, 'l-msg-' + l.id, 'Deleted the extra data.');
                }, 'Delete extra data of ' + when(it.at, true)));
            } else if (editRead && editRead.rid === it.r.id) {
                row.classList.add('editing');
                const r = it.r, d = C.dataInput(r.mb), id = 'er-' + r.id;
                row.append(label(id, 'Data left'), dataRow(id, d.v, d.u), errP(id));
                const t = el('div', 'two');
                t.append(field('Checked on', input('erd-' + r.id, 'date', r.at.slice(0, 10))), field('At', input('ert-' + r.id, 'time', r.at.slice(11))));
                const bs = el('div', 'row-btns');
                bs.append(btn('Save', 'primary', () => saveEditRead(l, r)), btn('Cancel', 'secondary', () => { editRead = null; render(); }));
                row.append(t, bs);
            } else {
                const r = it.r, m = el('div', 'r-main');
                const prev = rs[rs.indexOf(r) + 1];
                m.append(p('r-date', when(r.at, true)), p('r-val', data(r.mb) + ' left'));
                if (prev) {
                    const used = prev.mb + C.topsBetween(b, prev.at, r.at) - r.mb, span = C.tMin(r.at) - C.tMin(prev.at);
                    m.appendChild(p('r-used', 'Used ' + data(used) + ' in ' + C.fmtSpan(span) + (span >= 180 ? ' (' + C.perDay(Math.round(used * C.DAYM / span), LOC) + ')' : '')));
                }
                const bs = el('div', 'r-btns');
                bs.append(btn('Edit', 'secondary small', () => { editRead = { lid: l.id, rid: r.id }; render(); const i = $('er-' + r.id); if (i) i.focus(); }, 'Edit balance of ' + when(r.at, true)),
                    btn('Delete', 'secondary small danger-t', () => change(() => { b.reads = b.reads.filter(x => x.id !== r.id); }, 'l-msg-' + l.id, 'Deleted the balance check.'), 'Delete balance of ' + when(r.at, true)));
                row.append(m, bs);
            }
            list.appendChild(row);
        });
        w.appendChild(list);
        if (items.length > 5) w.appendChild(btn(showAll[l.id] ? 'Show fewer' : 'Show all ' + items.length, 'link', () => { showAll[l.id] = !showAll[l.id]; render(); }));
        box.appendChild(w);
    }
    function drawMore(box, l, b, a) {
        const w = el('div', 'more');
        const bs = el('div', 'more-btns');
        const ended = a.state === 'expired';
        if (!ended) bs.appendChild(btn(open[l.id] === 'top' ? 'Close extra data' : '+ Add extra data', 'secondary', () => { open[l.id] = open[l.id] === 'top' ? null : 'top'; render(); const i = $('tp-' + l.id); if (i) i.focus(); }));
        bs.appendChild(btn(open[l.id] === 'renew' ? 'Close new bundle' : 'Bought a new bundle', 'secondary', () => { open[l.id] = open[l.id] === 'renew' ? null : 'renew'; render(); const i = $('rn-' + l.id + '-mb'); if (i) i.focus(); }));
        w.appendChild(bs);
        if (open[l.id] === 'top' && !ended) {
            const f = el('div', 'sub-box'), pre = 'tp-' + l.id, t0 = C.localNow(new Date());
            f.append(el('h4', null, 'Add extra data (same expiry)'), label(pre, 'Extra data'), dataRow(pre, '', l.unit === 'MB' ? 'MB' : 'GB', 'e.g. 5'), errP(pre));
            const pr = el('div', 'amount-row'); if (state.cur) pr.appendChild(el('span', 'cur-tag', state.cur)); pr.appendChild(input(pre + 'p', 'text', '', 'optional'));
            f.append(label(pre + 'p', 'Price paid (optional)'), pr, errP(pre + 'p'));
            const t = el('div', 'two'); t.append(field('Added on', input(pre + 'd', 'date', t0.slice(0, 10))), field('At', input(pre + 't', 'time', t0.slice(11))));
            const rb = el('div', 'row-btns'); rb.append(btn('Add extra data', 'primary', () => saveTop(l)), btn('Cancel', 'secondary', () => { open[l.id] = null; render(); }));
            f.append(t, errP(pre + 'd'), rb);
            w.appendChild(f);
        }
        if (open[l.id] === 'renew') {
            const f = el('div', 'sub-box'), pre = 'rn-' + l.id;
            f.appendChild(el('h4', null, 'Bought a new bundle'));
            const inner = el('div');
            const days = daysOf(b) || 30, v = freshVals(days);
            v.mb = b.mb; v.price = b.price;
            const carry = a.state === 'active' ? a.est : 0;
            buyFields(inner, pre, v, { carry: carry > 0 ? carry : 0 });
            f.appendChild(inner);
            if (a.state === 'active' || a.state === 'out') f.appendChild(p('hint', 'The current bundle ends when the new one starts.'));
            const rb = el('div', 'row-btns'); rb.append(btn('Save new bundle', 'primary', () => saveRenew(l)), btn('Cancel', 'secondary', () => { open[l.id] = null; render(); }));
            f.appendChild(rb);
            w.appendChild(f);
        }
        box.appendChild(w);
    }
    function drawPast(box, l) {
        const past = l.buys.slice(0, -1).reverse();
        if (!past.length) return;
        const w = el('details', 'past');
        w.open = !!pastOpen[l.id];
        w.addEventListener('toggle', () => { pastOpen[l.id] = w.open; });
        w.appendChild(el('summary', null, 'Earlier bundles (' + past.length + ')'));
        const list = el('div', 'h-list');
        past.forEach(b => {
            const a = C.analyse(b, now), u = C.usedTotal(b);
            const row = el('div', 'h-row'), left = el('div', 'h-l');
            left.appendChild(p('h-when', C.fmtWhen(b.start, LOC, { wd: false, year: b.start.slice(0, 4) !== now.slice(0, 4) }) + ' to ' + C.fmtWhen(C.endOf(b), LOC, { wd: false, year: b.exp.slice(0, 4) !== now.slice(0, 4) })));
            left.appendChild(p('h-what', data(a.total) + (b.price != null ? ' for ' + money(a.paid) : '') + (a.perGB != null ? ' · ' + money(a.perGB) + ' a GB' : '') + (a.replaced ? ' · replaced early' : '')));
            let ut;
            if (!u) ut = 'Balance not checked';
            else if (u.exact) {
                ut = 'Used ' + data(u.used) + (u.left > 0 ? ', ' + data(u.left) + (a.replaced ? ' left when replaced' : ' expired unused') : ', all of it');
                if (a.hasPrice && u.used > 0 && u.left > 0) ut += ' · ' + money(Math.round(a.paid * C.GB / u.used)) + ' a GB used';
            } else ut = 'Used at least ' + data(u.used) + ' (last checked ' + when(u.at, true) + ')';
            left.appendChild(p('h-used', ut));
            row.append(left, btn('Delete', 'secondary small danger-t', () => change(() => { removeBuy(l, l.buys.indexOf(b)); }, 'l-msg-' + l.id, 'Deleted that bundle.'), 'Delete bundle of ' + when(b.start)));
            list.appendChild(row);
        });
        w.appendChild(list);
        box.appendChild(w);
    }
    function drawLine(l) {
        const b = cur(l), a = C.analyse(b, now);
        const box = el('article', 'line'); box.id = 'line-' + l.id;
        if (a.state === 'expired') box.classList.add('is-expired');
        const top = el('div', 'l-top');
        top.append(el('h3', 'l-name', l.name), el('span', 'tag ' + a.state, { active: 'In use', out: 'Ran out', expired: 'Expired' }[a.state]));
        box.appendChild(top);
        box.appendChild(p('l-sub', data(b.mb) + ' bundle' + (b.price != null ? ' · ' + money(b.price) : '') + ' · bought ' + when(b.start, true)));
        const msg = el('div', 'msg'); msg.id = 'l-msg-' + l.id; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
        drawResult(box, l, b, a);
        box.appendChild(msg);
        drawCheck(box, l, b, a);
        drawReads(box, l, b);
        drawMore(box, l, b, a);
        drawPast(box, l);
        const cb = el('div', 'l-btns');
        const name = l.name;
        cb.append(btn('Copy summary', 'secondary', () => copyText(summary(l), 'l-msg-' + l.id)),
            mailLink(l));
        const rem = btn('Expiry reminder', 'secondary', () => ics(l)); rem.disabled = a.state === 'expired'; if (rem.disabled) rem.title = 'This bundle has expired';
        cb.append(rem, btn('Edit bundle', 'secondary', () => fillForm(l)),
            btn('Delete', 'secondary danger-t', () => { change(() => { state.lines = state.lines.filter(x => x.id !== l.id); }, 'top-msg', 'Deleted ' + name + '.'); if (editing === l.id) resetForm(); }, 'Delete ' + l.name));
        box.appendChild(cb);
        return box;
    }
    function drawSpend() {
        const priced = state.lines.some(l => l.buys.some(b => b.price != null || b.tops.some(t => t.price != null)));
        $('spend').hidden = !priced;
        if (!priced) return;
        const body = $('spend-body'); body.textContent = '';
        const ym = now.slice(0, 7), y = +ym.slice(0, 4), m = +ym.slice(5, 7);
        const prevYm = m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0');
        const mn = s => { try { return new Intl.DateTimeFormat(LOC, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, 1))); } catch (e) { return s; } };
        const words = s => s.bundles + (s.bundles === 1 ? ' bundle' : ' bundles') + (s.extras ? ', ' + s.extras + ' extra' : '');
        const a = C.spentIn(state, ym), b = C.spentIn(state, prevYm);
        const g = el('div', 'sp-grid');
        [[mn(ym) + ' so far', a], [mn(prevYm), b]].forEach(([t, s]) => { const c = el('div', 'sp'); c.append(p('sp-l', t), p('sp-big', money(s.cents)), p('sp-n', s.cents || s.bundles ? words(s) : 'Nothing logged')); g.appendChild(c); });
        body.appendChild(g);
        const per = state.lines.map(l => ({ l, a: C.analyse(cur(l), now) })).filter(x => x.a.perGB != null);
        if (per.length > 1) {
            body.appendChild(el('h4', null, 'Cost per GB of your latest bundles'));
            const ul = el('ul', 'per');
            per.sort((x, z) => x.a.perGB - z.a.perGB).forEach((x, i) => { const li = el('li', i === 0 ? 'best' : null); li.append(el('span', null, x.l.name), el('b', null, money(x.a.perGB) + (i === 0 ? ' cheapest' : ''))); ul.appendChild(li); });
            body.appendChild(ul);
        }
    }
    function render(clear) {
        now = C.localNow(new Date());
        keepVals();
        (clear || []).forEach(id => delete keep[id]);
        const any = state.lines.length > 0;
        $('lines').hidden = !any;
        $('intro').hidden = any;
        $('restore-first').hidden = any;
        $('add-h').textContent = editing ? $('add-h').textContent : (any ? 'Add another SIM or bundle' : 'Add a data bundle');
        drawSpend();
        const list = $('l-list'); list.textContent = '';
        state.lines.forEach(l => list.appendChild(drawLine(l)));
        Object.keys(keep).forEach(id => { const i = $(id); if (i) i.value = keep[id]; });
        ['top-msg', 'add-msg', 'tools-msg'].forEach(id => { $(id).className = 'msg'; $(id).textContent = ''; });
        if (flash) {
            const box = $(flash.where) || $('top-msg');
            showMsg(box, flash.text, flash.undo && !!undoSnap, flash.bad);
            flash = null;
        }
    }

    // ---------- backup ----------
    function backup() {
        download(SLUG + '-backup-' + now.slice(0, 10) + '.json', 'application/json', JSON.stringify(state, null, 1));
        flash = { where: 'tools-msg', text: 'Saved a backup file. Keep it somewhere safe, such as your email or cloud drive.' }; render();
    }
    function restore(file) {
        const r = new FileReader();
        r.onload = () => {
            let s = null;
            try { s = C.cleanState(JSON.parse(String(r.result))); } catch (e) { s = null; }
            if (!s) { flash = { where: 'tools-msg', text: 'That file is not a backup from this app.', bad: true }; render(); return; }
            resetForm();
            change(() => { state = s; }, 'tools-msg', 'Restored ' + s.lines.length + (s.lines.length === 1 ? ' bundle.' : ' bundles.'));
        };
        r.onerror = () => { flash = { where: 'tools-msg', text: 'Could not read that file.', bad: true }; render(); };
        r.readAsText(file);
    }

    // ---------- start ----------
    load();
    Object.keys(CUR_NAMES).forEach(k => { const o = el('option', null, CUR_NAMES[k]); o.value = k; $('cur').appendChild(o); });
    if (state.cur && !(state.cur in CUR_NAMES)) { const o = el('option', null, state.cur); o.value = state.cur; $('cur').appendChild(o); }
    $('cur').value = state.cur;
    $('cur').addEventListener('change', () => {
        state.cur = $('cur').value; save();
        const keepForm = {}; ['f-mb', 'f-mb-u', 'f-price', 'f-sd', 'f-st', 'f-valid', 'f-ed', 'f-et'].forEach(id => { if ($(id)) keepForm[id] = $(id).value; });
        const priceOpen = !$('f-price-box').hidden;
        buyFields($('f-buy'), 'f', freshVals(30));
        Object.keys(keepForm).forEach(id => { $(id).value = keepForm[id]; });
        if (priceOpen) { $('f-price-box').hidden = false; $('f-price-open').hidden = true; }
        render();
    });
    resetForm();
    $('quick').addEventListener('click', e => {
        const c = e.target.closest('.chip'); if (!c) return;
        if (!$('f-name').value.trim() || [...document.querySelectorAll('#quick .chip')].some(x => x.dataset.name === $('f-name').value)) $('f-name').value = c.dataset.name;
        $('f-valid').value = c.dataset.days; $('f-valid').dispatchEvent(new Event('change'));
        setErr('f-name', '');
        $('f-mb').focus();
    });
    $('f-save').addEventListener('click', saveForm);
    $('f-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveForm(); });
    $('f-cancel').addEventListener('click', () => { resetForm(); render(); });
    $('backup').addEventListener('click', backup);
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-first').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) restore(f); e.target.value = ''; });
    $('del-all').addEventListener('click', () => {
        if (!state.lines.length) { flash = { where: 'tools-msg', text: 'There is nothing to delete.' }; render(); return; }
        resetForm();
        change(() => { const c = state.cur; state = C.emptyState(); state.cur = c; }, 'tools-msg', 'Deleted everything.');
    });
    render();
    // keep the answer fresh while the page stays open, without disturbing typing
    setInterval(() => { const a = document.activeElement; if (!a || !/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) render(); }, 60000);
})();
