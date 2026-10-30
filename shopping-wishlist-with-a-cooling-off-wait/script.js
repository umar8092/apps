// Shopping Wishlist with a Cooling-Off Wait: the page. The dates, money and words are in core.js (window.WISHLIST).
(function () {
    'use strict';
    const C = window.WISHLIST, SLUG = 'shopping-wishlist-with-a-cooling-off-wait', KEY = SLUG + '.state', WAITKEY = SLUG + '.wait';
    const $ = id => document.getElementById(id);
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)',
        'NZ$': 'NZ$ (New Zealand dollar)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (riyal)', 'KWD': 'KWD (dinar)', 'R': 'R (rand)', '৳': '৳ (taka)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)',
        'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₱': '₱ (peso)', 'S$': 'S$ (Singapore dollar)', '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    let state = C.emptyState(), t = C.today(new Date());
    let form = null;             // the one open form inside an item: { kind: 'buy'|'later'|'edit', id }
    let addWait = 7;             // the picked wait in days, or 'custom'
    let doneTab = 'skipped', doneAll = false;
    let flash = null, undoSnap = null, canSave = true, loadNote = '';

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        try { const w = localStorage.getItem(WAITKEY); if (w === 'custom' || C.WAITS.includes(Number(w))) addWait = w === 'custom' ? 'custom' : Number(w); } catch (e) { /* keep 1 week */ }
        if (!raw) return;
        let s = null;
        try { s = C.cleanState(JSON.parse(raw)); } catch (e) { s = null; }
        if (s) state = s; else loadNote = 'Your saved list could not be read, so the app started fresh. If you have a backup file, restore it below.';
    }
    function save() {
        if (!canSave) { $('store-warn').hidden = false; return true; }
        try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
        catch (e) { flash = { where: 'top-msg', text: 'This browser could not save the last change. Save a backup file.', bad: true }; return false; }
    }
    function change(fn, where, text) {
        const before = JSON.stringify(state);
        fn();
        undoSnap = before;
        flash = { where, text, undo: true };
        if (!save()) { state = C.cleanState(JSON.parse(before)) || state; undoSnap = null; }
        render();
    }
    function undo() {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap));
        if (s) state = s;
        const where = flash && flash.where ? flash.where : 'top-msg';
        undoSnap = null; form = null;
        save();
        flash = { where, text: 'Undone.' };
        fillCur();
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const p = (cls, text) => el('p', cls, text);
    const money = c => C.fmtMoney(c, state.cur, LOC);
    const date = s => C.fmtDate(s, t);
    const byId = id => state.items.find(x => x.id === id);
    const newId = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied the list. Paste it into a message or email.' }; render(); };
        const fallback = () => {
            const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            ta.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Use Email the list instead.', bad: true }; render(); }
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
    function label(forId, text) { const l = el('label', null, text); l.htmlFor = forId; return l; }
    const errP = id => { const e = p('err'); e.id = id + '-err'; e.setAttribute('role', 'alert'); return e; };
    function textInput(id, value, max, ph, mode) {
        const i = el('input'); i.id = id; i.type = 'text'; i.autocomplete = 'off'; i.maxLength = max;
        if (mode) i.inputMode = mode;
        if (value != null) i.value = value;
        if (ph) i.placeholder = ph;
        i.setAttribute('aria-describedby', id + '-err');
        return i;
    }
    function moneyField(box, id, lbl, value, ph) {
        box.appendChild(label(id, lbl));
        const row = el('div', 'amount-row');
        if (state.cur) row.appendChild(el('span', 'cur-tag', state.cur));
        const i = textInput(id, value, 20, ph, 'decimal');
        row.appendChild(i);
        box.append(row, errP(id));
        return i;
    }
    function readMoney(id) {
        const r = C.parseOptMoney($(id).value);
        if (r.error) { setErr(id, r.error); return { ok: false }; }
        setErr(id, ''); return { ok: true, n: r.n };
    }
    function readLink(id) {
        const v = C.cleanLink($(id).value);
        if (v === null) { setErr(id, 'That does not look like a web link. Paste one that starts with https://, or leave it blank.'); return { ok: false }; }
        setErr(id, ''); return { ok: true, v };
    }
    function readNeedBy(id) {
        const v = $(id).value;
        if (!v) { setErr(id, ''); return { ok: true, v: null }; }
        if (!C.isDate(v)) { setErr(id, 'Pick a date, or leave it blank.'); return { ok: false }; }
        if (v < t) { setErr(id, 'Pick today or a later day.'); return { ok: false }; }
        setErr(id, ''); return { ok: true, v };
    }
    const fileName = s => (C.norm(s).replace(/ /g, '-').slice(0, 40) || 'item');

    // ---------- the add form ----------
    function addDaysPicked() {
        if (addWait !== 'custom') return { n: addWait };
        return C.parseDays($('a-days').value);
    }
    function showEnds() {
        const d = addWait === 'custom' ? C.parseDays($('a-days').value) : { n: addWait };
        const nb = $('a-needby').value;
        if (d.error) { $('a-ends').textContent = ''; return; }
        const it = { added: t, ends: C.endFor(t, d.n, C.isDate(nb) && nb >= t ? nb : null) };
        $('a-ends').textContent = C.waitWords(it, t).replace(/^Wait ended today$/, 'Wait ends today') + (it.ends < C.addDays(t, d.n) ? ', the day you need it' : '');
    }
    function pickWait(v) {
        addWait = v;
        document.querySelectorAll('#a-waits .chip').forEach(c => { const on = c.dataset.days === String(v); c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        $('a-days-box').hidden = v !== 'custom';
        try { localStorage.setItem(WAITKEY, String(v)); } catch (e) { /* not saved */ }
        showEnds();
    }
    function checkRep() {
        const hit = C.sameAs(state.items, $('a-name').value, null), box = $('a-rep');
        if (!hit) { box.hidden = true; box.textContent = ''; return; }
        const st = C.status(hit, t);
        box.textContent = st === 'skipped' ? 'You skipped ' + hit.name + ' on ' + date(hit.dd) + '. Still want it?'
            : st === 'bought' ? 'You bought ' + hit.name + ' on ' + date(hit.dd) + '.'
            : 'Already on your list: ' + hit.name + ', ' + (st === 'ready' ? 'ready to decide' : C.waitWords(hit, t).replace(/^W/, 'w')) + '.';
        box.hidden = false;
    }
    function addItem() {
        const name = C.cleanText($('a-name').value, C.LIM.name);
        let ok = setErr('a-name', name ? '' : 'Type what you want to buy, such as Air fryer.');
        const pr = readMoney('a-price'); ok = pr.ok && ok;
        const d = addDaysPicked();
        if (addWait === 'custom') ok = setErr('a-days', d.error || '') && ok;
        const ln = readLink('a-link'); ok = ln.ok && ok;
        const nb = readNeedBy('a-needby'); ok = nb.ok && ok;
        if (!ok) { const bad = document.querySelector('#add [aria-invalid="true"]'); if (bad) bad.focus(); return; }
        const it = { id: newId(), name, prices: pr.n == null ? [] : [{ d: t, c: pr.n }], where: C.cleanText($('a-where').value, C.LIM.where), link: ln.v,
            why: C.cleanText($('a-why').value, C.LIM.why), added: t, wait: d.n, ends: C.endFor(t, d.n, nb.v), needBy: nb.v, st: 'wait', dd: null, paid: null, early: false };
        change(() => { state.items.push(it); }, 'add-msg', 'Added ' + it.name + '. ' + C.waitWords(it, t).replace(/^Wait ended today$/, 'Wait ends today') + '.');
        ['a-name', 'a-price', 'a-where', 'a-link', 'a-why', 'a-needby'].forEach(id => { $(id).value = ''; });
        checkRep(); showEnds();
        $('a-name').focus();
    }

    // ---------- one item ----------
    function itemCard(it) {
        const st = C.status(it, t), c = el('article', 'item k-' + st), pr = C.price(it);
        c.dataset.id = it.id;
        const top = el('div', 'it-top');
        top.append(el('h3', 'it-name', it.name), el('span', 'it-price' + (pr == null ? ' none' : ''), pr == null ? 'No price yet' : money(pr)));
        c.appendChild(top);
        const ch = C.priceChange(it);
        if (ch && (st === 'wait' || st === 'ready')) c.appendChild(p('it-drop' + (ch.diff > 0 ? ' up' : ''), 'Was ' + money(ch.from) + ' on ' + date(it.prices[0].d) + ', now ' + money(ch.now) + ' (' + money(Math.abs(ch.diff)) + (ch.diff < 0 ? ' less)' : ' more)')));
        const meta = el('p', 'it-meta');
        meta.appendChild(document.createTextNode('Added ' + date(it.added) + (it.where ? ' · ' + it.where : '')));
        c.appendChild(meta);
        if (it.link) {
            const a = el('a', 'it-link', 'Open the shop page (' + C.linkHost(it.link) + ')');
            a.href = it.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
            c.appendChild(a);
        }
        if (it.why) c.appendChild(p('it-why', 'Why: ' + it.why));
        if (st === 'wait' || st === 'ready') {
            c.appendChild(p('it-when', C.waitWords(it, t) + (it.needBy && it.ends === it.needBy ? ', the day you need it' : '')));
            if (st === 'wait') {
                const bar = el('div', 'bar'), fill = el('i');
                bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Wait passed');
                const pct = Math.round(C.progress(it, t) * 100);
                bar.setAttribute('aria-valuenow', String(pct)); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
                fill.style.width = Math.max(pct, 2) + '%';
                bar.appendChild(fill); c.appendChild(bar);
            } else c.appendChild(p('it-q', 'Do you still want it?'));
        } else if (st === 'bought') {
            let s = 'Bought ' + date(it.dd) + (it.paid != null ? ' for ' + money(it.paid) : '');
            const first = C.firstPrice(it);
            if (it.paid != null && first != null && first > it.paid) s += ' (' + money(first - it.paid) + ' less than when you added it)';
            if (it.early) s += ', before the wait ended';
            c.appendChild(p('it-when', s + '.'));
        } else {
            c.appendChild(p('it-when', 'Skipped ' + date(it.dd) + (pr != null ? ': ' + money(pr) + ' not spent' : '') + '.'));
        }
        if (form && form.id === it.id) c.appendChild(form.kind === 'buy' ? buyForm(it) : form.kind === 'later' ? laterForm(it) : editForm(it));
        else c.appendChild(itemBtns(it, st));
        return c;
    }
    const sectionMsg = st => st === 'ready' ? 'ready-msg' : st === 'wait' ? 'wait-msg' : 'done-msg';
    function open(kind, it) { form = { kind, id: it.id }; clearMsgs(); render(); const f = document.querySelector('.item[data-id="' + it.id + '"] .inline-form input, .item[data-id="' + it.id + '"] .inline-form button'); if (f) f.focus(); }
    function close(id) { form = null; render(); const b = document.querySelector('.item[data-id="' + id + '"] .it-btns button'); if (b) b.focus(); }
    function skip(it, st) {
        const pr = C.price(it);
        doneTab = 'skipped'; doneAll = false;
        change(() => C.decide(it, 'skip', t), sectionMsg(st), 'Skipped ' + it.name + '.' + (pr != null ? ' ' + money(pr) + ' added to Not spent this year.' : ''));
    }
    function del(it, st) { change(() => { state.items = state.items.filter(x => x !== it); }, sectionMsg(st), 'Deleted ' + it.name + '.'); }
    function itemBtns(it, st) {
        const b = el('div', 'it-btns');
        if (st === 'ready') {
            b.append(btn('Buy it', 'primary', () => open('buy', it), 'Buy ' + it.name), btn('Skip it', 'secondary skip', () => skip(it, st), 'Skip ' + it.name),
                btn('Wait longer', 'secondary', () => open('later', it), 'Wait longer for ' + it.name), btn('Edit', 'secondary', () => open('edit', it), 'Edit ' + it.name),
                btn('Delete', 'secondary', () => del(it, st), 'Delete ' + it.name));
        } else if (st === 'wait') {
            b.append(btn('Edit', 'secondary', () => open('edit', it), 'Edit ' + it.name), btn('Remind me', 'secondary', () => remind(it), 'Remind me when the wait for ' + it.name + ' ends'),
                btn('Skip it', 'secondary', () => skip(it, st), 'Skip ' + it.name), btn('Buy anyway', 'secondary', () => open('buy', it), 'Buy ' + it.name + ' before the wait ends'),
                btn('Delete', 'secondary', () => del(it, st), 'Delete ' + it.name));
        } else {
            b.append(btn('Put back on the list', 'secondary', () => change(() => C.reopen(it), 'done-msg', it.name + ' is back on your wishlist.'), 'Put ' + it.name + ' back on the list'),
                btn('Delete', 'secondary', () => del(it, st), 'Delete ' + it.name));
        }
        return b;
    }
    function formBtns(f, saveText, onSave, id) {
        const r = el('div', 'row-btns');
        r.append(btn(saveText, 'primary', onSave), btn('Cancel', 'secondary', () => close(id)));
        f.appendChild(r);
        f.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); close(id); }
            if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'date') { e.preventDefault(); onSave(); }
        });
    }
    function buyForm(it) {
        const f = el('div', 'inline-form'), id = 'b-' + it.id, early = it.ends > t;
        f.appendChild(p('f-h', early ? 'Buy before the wait ends?' : 'Buy ' + it.name));
        const inp = moneyField(f, id, 'Price you paid', C.moneyInput(C.price(it)), 'e.g. 16900');
        const note = p('f-note'); f.appendChild(note);
        const m = C.summary(state, t);
        const upd = () => {
            const r = C.parseOptMoney(inp.value);
            note.textContent = ''; note.className = 'f-note';
            if (r.error || state.limit == null) return;
            const after = state.limit - m.spentMonth - (r.n || 0);
            note.textContent = after >= 0 ? 'This leaves ' + money(after) + ' of this month\'s ' + money(state.limit) + ' limit.'
                : 'This is ' + money(-after) + ' over this month\'s ' + money(state.limit) + ' limit.';
            if (after < 0) note.className = 'f-note over';
        };
        inp.addEventListener('input', upd); upd();
        f.appendChild(p('hint', 'Leave it blank if you would rather not say.'));
        formBtns(f, 'Save as bought', () => {
            const r = readMoney(id); if (!r.ok) { inp.focus(); return; }
            form = null; doneTab = 'bought'; doneAll = false;
            change(() => C.decide(it, 'buy', t, r.n), sectionMsg(C.status(it, t)), 'Bought ' + it.name + (r.n != null ? ' for ' + money(r.n) : '') + '. It is under Decided, Bought.');
        }, it.id);
        return f;
    }
    function laterForm(it) {
        const f = el('div', 'inline-form'), id = 'l-' + it.id, st = C.status(it, t);
        f.appendChild(p('f-h', 'Wait longer for ' + it.name));
        const q = el('div', 'quick');
        const go = n => { form = null; change(() => C.waitLonger(it, n, t), sectionMsg(st), 'Waiting longer for ' + it.name + '. ' + C.waitWords(Object.assign({}, it, { ends: C.addDays(it.ends > t ? it.ends : t, n) }), t) + '.'); };
        [[1, '1 more day'], [7, '1 more week'], [30, '30 more days']].forEach(([n, txt]) => q.appendChild(btn(txt, 'chip', () => go(n))));
        f.appendChild(q);
        f.appendChild(label(id, 'Or another number of days'));
        f.append(textInput(id, '', 3, 'e.g. 14', 'numeric'), errP(id));
        formBtns(f, 'Wait longer', () => {
            const r = C.parseDays($(id).value);
            if (!setErr(id, r.error || '')) { $(id).focus(); return; }
            go(r.n);
        }, it.id);
        return f;
    }
    function editForm(it) {
        const f = el('div', 'inline-form'), k = 'e-' + it.id;
        f.appendChild(p('f-h', 'Change ' + it.name));
        f.append(label(k + 'n', 'What do you want to buy?'), textInput(k + 'n', it.name, C.LIM.name), errP(k + 'n'));
        moneyField(f, k + 'p', 'Price now', C.moneyInput(C.price(it)), 'e.g. 16900');
        f.appendChild(p('hint', 'Type a new price when it changes. The old price is kept so you can see if it dropped.'));
        if (it.st === 'wait') {
            f.append(label(k + 'd', 'Days to wait from ' + date(it.added)), textInput(k + 'd', String(it.wait), 4, 'e.g. 14', 'numeric'), errP(k + 'd'));
            f.append(label(k + 'b', 'Need it by (optional)'));
            const nb = el('input'); nb.id = k + 'b'; nb.type = 'date'; nb.value = it.needBy || ''; nb.setAttribute('aria-describedby', k + 'b-err');
            f.append(nb, errP(k + 'b'));
        }
        f.append(label(k + 'w', 'Shop'), textInput(k + 'w', it.where, C.LIM.where, 'e.g. Daraz, or the mall'));
        f.append(label(k + 'l', 'Web link'), textInput(k + 'l', it.link, C.LIM.link, 'Paste the shop page link', 'url'), errP(k + 'l'));
        f.append(label(k + 'y', 'Why do you want it?'), textInput(k + 'y', it.why, C.LIM.why, 'e.g. The old one broke'));
        formBtns(f, 'Save changes', () => {
            const name = C.cleanText($(k + 'n').value, C.LIM.name);
            let ok = setErr(k + 'n', name ? '' : 'Type what you want to buy.');
            const pr = readMoney(k + 'p'); ok = pr.ok && ok;
            const ln = readLink(k + 'l'); ok = ln.ok && ok;
            let days = it.wait, nb = { ok: true, v: it.needBy };
            if (it.st === 'wait') {
                const typed = $(k + 'd').value.trim();
                if (typed !== String(it.wait)) { const r = C.parseDays(typed); ok = setErr(k + 'd', r.error || '') && ok; days = r.n; }
                const v = $(k + 'b').value;
                if (v !== (it.needBy || '')) { nb = readNeedBy(k + 'b'); ok = nb.ok && ok; }
            }
            if (!ok) { const bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
            const st = C.status(it, t);
            form = null;
            change(() => {
                it.name = name; C.setPrice(it, pr.n, t); it.link = ln.v;
                it.where = C.cleanText($(k + 'w').value, C.LIM.where); it.why = C.cleanText($(k + 'y').value, C.LIM.why);
                if (it.st === 'wait' && (days !== it.wait || nb.v !== it.needBy)) { it.wait = days; it.needBy = nb.v; it.ends = C.endFor(it.added, days, nb.v); }
            }, sectionMsg(st), 'Saved the changes to ' + name + '.');
        }, it.id);
        return f;
    }
    function remind(it) {
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
        download('wishlist-' + fileName(it.name) + '.ics', 'text/calendar', C.ics(it, t, stamp));
        flash = { where: 'wait-msg', text: 'Saved a calendar file. Open it to add a reminder for ' + date(it.ends) + ' at 9 in the morning.' };
        render();
    }

    // ---------- the page ----------
    function statRow(list, name, value, cls) { const li = el('li', cls || ''); li.append(el('span', null, name), el('b', null, value)); list.appendChild(li); }
    function render() {
        t = C.today(new Date());
        const has = state.items.length > 0, m = C.summary(state, t), s = C.sorted(state.items, t);
        $('intro').hidden = has; $('sum').hidden = !has;
        // the totals
        $('sum-big').textContent = money(m.notSpentYear);
        $('sum-sub').textContent = m.skippedYear ? 'You skipped ' + C.plural(m.skippedYear, 'item') + ' this year after the wait.' : 'When a wait ends and you tap Skip it, its price is added here.';
        const L = $('sum-list'); L.textContent = '';
        if (m.ready) statRow(L, 'Ready to decide', C.plural(m.ready, 'item'), 'hot');
        statRow(L, 'On your wishlist', C.plural(m.open, 'item') + ', ' + money(m.openTotal) + (m.noPrice ? ' (' + m.noPrice + ' with no price)' : ''));
        if (state.limit != null) statRow(L, 'Bought this month', money(m.spentMonth) + ' of ' + money(state.limit) + ' limit: ' + (m.left >= 0 ? money(m.left) + ' left' : money(-m.left) + ' over'), m.left < 0 ? 'over' : '');
        else if (m.boughtMonth) statRow(L, 'Bought this month', money(m.spentMonth));
        if (m.boughtYear) statRow(L, 'Bought this year', C.plural(m.boughtYear, 'item') + ', ' + money(m.spentYear));
        if (m.dropSaved) statRow(L, 'Saved on price drops', money(m.dropSaved));
        if (m.notSpentAll !== m.notSpentYear) statRow(L, 'Not spent, all time', money(m.notSpentAll));
        // the lists
        const fw = flash ? flash.where : '';
        const fillList = (sec, list, items, msgId) => {
            const box = $(list); box.textContent = '';
            const msg = el('div', 'msg'); msg.id = msgId; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
            box.appendChild(msg);
            items.forEach(it => box.appendChild(itemCard(it)));
            $(sec).hidden = !items.length && fw !== msgId;
        };
        fillList('ready-sec', 'ready-list', s.ready, 'ready-msg');
        $('ready-h').textContent = s.ready.length ? 'Ready to decide (' + s.ready.length + ')' : 'Ready to decide';
        fillList('wait-sec', 'wait-list', s.wait, 'wait-msg');
        $('wait-h').textContent = 'Waiting' + (s.wait.length ? ' (' + s.wait.length + ')' : '');
        const done = doneTab === 'bought' ? s.bought : s.skipped, MAX = 10;
        fillList('done-sec', 'done-list', doneAll ? done : done.slice(0, MAX), 'done-msg');
        $('done-sec').hidden = !s.bought.length && !s.skipped.length && fw !== 'done-msg';
        $('tab-skipped').textContent = 'Skipped (' + s.skipped.length + ')'; $('tab-bought').textContent = 'Bought (' + s.bought.length + ')';
        [['tab-skipped', 'skipped'], ['tab-bought', 'bought']].forEach(([id, v]) => { $(id).classList.toggle('on', doneTab === v); $(id).setAttribute('aria-pressed', doneTab === v ? 'true' : 'false'); });
        $('done-none').hidden = done.length > 0;
        $('done-none').textContent = doneTab === 'bought' ? 'Nothing bought from the list yet.' : 'Nothing skipped yet.';
        $('done-more').hidden = doneAll || done.length <= MAX;
        $('done-more').textContent = 'Show all ' + done.length;
        // the add form and settings
        ['a-price-cur', 'lim-cur'].forEach(id => { $(id).textContent = state.cur; $(id).hidden = !state.cur; });
        $('restore-first').hidden = has;
        if (state.limit != null && document.activeElement !== $('lim')) { $('lim-open').hidden = true; $('lim-box').hidden = false; $('lim').value = C.moneyInput(state.limit); }
        $('lim-del').hidden = state.limit == null;
        showEnds();
        const txt = C.listText(state, t, state.cur, LOC);
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('My shopping wishlist') + '&body=' + encodeURIComponent(txt.length > 1800 ? txt.slice(0, 1800) + '\n...' : txt);
        if (flash) {
            showMsg($(flash.where) || $('top-msg'), flash.text, flash.undo, flash.bad);
            flash = null;
        }
    }
    function fillCur() {
        const s = $('cur'); s.textContent = '';
        C.CURS.forEach(c => { const o = el('option', null, CUR_NAMES[c] || c); o.value = c; s.appendChild(o); });
        s.value = state.cur;
    }

    // ---------- events ----------
    document.querySelectorAll('#a-waits .chip').forEach(c => c.addEventListener('click', () => {
        const v = c.dataset.days === 'custom' ? 'custom' : Number(c.dataset.days);
        pickWait(v);
        if (v === 'custom') $('a-days').focus();
    }));
    $('a-days').addEventListener('input', () => { setErr('a-days', ''); showEnds(); });
    $('a-needby').addEventListener('input', showEnds);
    const reveal = (openId, boxId, focusId) => $(openId).addEventListener('click', () => { $(openId).hidden = true; $(boxId).hidden = false; $(focusId).focus(); });
    reveal('a-more-open', 'a-more', 'a-where');
    reveal('a-need-open', 'a-need', 'a-needby');
    reveal('lim-open', 'lim-box', 'lim');
    $('a-name').addEventListener('input', () => { setErr('a-name', ''); checkRep(); });
    ['a-name', 'a-price', 'a-days', 'a-where', 'a-link', 'a-why'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }));
    $('a-save').addEventListener('click', addItem);
    $('tab-skipped').addEventListener('click', () => { doneTab = 'skipped'; doneAll = false; render(); });
    $('tab-bought').addEventListener('click', () => { doneTab = 'bought'; doneAll = false; render(); });
    $('done-more').addEventListener('click', () => { doneAll = true; render(); });
    $('cur').addEventListener('change', () => { const v = $('cur').value; change(() => { state.cur = v; }, 'tools-msg', 'Prices now show ' + (v ? 'with ' + v : 'as plain numbers') + '.'); });
    const saveLimit = () => {
        const r = C.parseOptMoney($('lim').value);
        if (!setErr('lim', r.error || '')) { $('lim').focus(); return; }
        if (r.n == null) { setErr('lim', 'Type an amount, or tap No limit.'); $('lim').focus(); return; }
        $('lim').blur();
        change(() => { state.limit = r.n; }, 'tools-msg', 'Monthly limit set to ' + money(r.n) + '.');
    };
    $('lim-save').addEventListener('click', saveLimit);
    $('lim').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveLimit(); } });
    $('lim-del').addEventListener('click', () => {
        setErr('lim', '');
        change(() => { state.limit = null; }, 'tools-msg', 'No monthly limit.');
        $('lim').value = ''; $('lim-box').hidden = true; $('lim-open').hidden = false;
    });
    $('copy').addEventListener('click', () => copyText(C.listText(state, t, state.cur, LOC), 'sum-msg'));
    $('backup').addEventListener('click', () => {
        download('shopping-wishlist-backup-' + t + '.json', 'application/json', JSON.stringify(Object.assign({ app: SLUG }, state), null, 1));
        flash = { where: 'tools-msg', text: 'Saved the backup file. Keep it somewhere safe, such as your email or cloud drive.' }; render();
    });
    const pick = () => { $('restore-file').value = ''; $('restore-file').click(); };
    $('restore').addEventListener('click', pick);
    $('restore-first').addEventListener('click', pick);
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; if (!f) return;
        const where = state.items.length ? 'tools-msg' : 'add-msg';
        if (f.size > 20000000) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let s = null;
            try { s = C.cleanState(JSON.parse(rd.result)); } catch (e) { s = null; }
            if (!s || !s.items.length) { flash = { where, text: 'That file is not a backup from this app, or it has nothing in it.', bad: true }; render(); return; }
            form = null;
            change(() => { state = s; }, 'top-msg', 'Restored ' + C.plural(s.items.length, 'item') + ' from the backup.');
            fillCur(); render();
        };
        rd.onerror = () => { flash = { where, text: 'That file could not be read.', bad: true }; render(); };
        rd.readAsText(f);
    });
    $('del-all').addEventListener('click', () => {
        if (!state.items.length && state.limit == null) { flash = { where: 'tools-msg', text: 'There is nothing to delete.' }; render(); return; }
        form = null;
        change(() => { state = Object.assign(C.emptyState(), { cur: state.cur }); }, 'top-msg', 'Deleted everything.');
        $('lim').value = ''; $('lim-box').hidden = true; $('lim-open').hidden = false;
    });
    // a new day: waits that end today move to Ready to decide
    const tick = () => { if (C.today(new Date()) !== t && !form) render(); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    setInterval(tick, 60000);

    load();
    fillCur();
    if (!canSave) $('store-warn').hidden = false;
    pickWait(addWait);
    render();
    if (loadNote) showMsg($('top-msg'), loadNote, false, true);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
