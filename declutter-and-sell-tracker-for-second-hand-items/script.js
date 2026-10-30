// Declutter and Sell Tracker for Second-Hand Items: the page. The money, dates and words are in core.js (window.DECLUTTER).
(function () {
    'use strict';
    const C = window.DECLUTTER, SLUG = 'declutter-and-sell-tracker-for-second-hand-items', KEY = SLUG + '.state', SITEKEY = SLUG + '.sites';
    const $ = id => document.getElementById(id);
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)',
        'NZ$': 'NZ$ (New Zealand dollar)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (riyal)', 'KWD': 'KWD (dinar)', 'R': 'R (rand)', '৳': '৳ (taka)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)',
        'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₱': '₱ (peso)', 'S$': 'S$ (Singapore dollar)', '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    let state = C.emptyState(), t = C.today(new Date());
    let form = null;             // the one open form inside an item: { kind, id, offer }
    let more = null;             // the item whose More buttons are open
    let addSites = [], addPhoto = '';
    let doneTab = 'sold', doneAll = false;
    let flash = null, undoSnap = null, canSave = true, loadNote = '';

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        try { const s = JSON.parse(localStorage.getItem(SITEKEY) || '[]'); addSites = C.cleanSites(s).filter(x => C.SITES.includes(x)); } catch (e) { addSites = []; }
        if (!raw) return;
        let s = null;
        try { s = C.cleanState(JSON.parse(raw)); } catch (e) { s = null; }
        if (s) state = s; else loadNote = 'Your saved list could not be read, so the app started fresh. If you have a backup file, restore it below.';
    }
    function save() {
        if (!canSave) { $('store-warn').hidden = false; return true; }
        try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
        catch (e) { flash = { where: 'top-msg', text: 'This browser is full and could not save the last change. Remove some photos, or save a backup file.', bad: true }; return false; }
    }
    function change(fn, where, text) {
        const before = JSON.stringify(state);
        fn();
        undoSnap = before;
        flash = { where, text, undo: true };
        if (!save()) { state = C.cleanState(JSON.parse(before)) || state; undoSnap = null; render(); return false; }
        render();
        return true;
    }
    function undo() {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap));
        if (s) state = s;
        const where = flash && flash.where ? flash.where : 'top-msg';
        undoSnap = null; form = null; more = null;
        save();
        flash = { where, text: 'Undone.' };
        fillCur();
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, lbl) { const b = el('button', cls, text); b.type = 'button'; if (lbl) b.setAttribute('aria-label', lbl); b.addEventListener('click', fn); return b; }
    const p = (cls, text) => el('p', cls, text);
    const money = c => C.fmtMoney(c, state.cur, LOC);
    const date = s => C.fmtDate(s, t);
    const byId = id => state.items.find(x => x.id === id);
    const newId = pre => (pre || 'i') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    function copyText(text, where, what) {
        const done = () => { flash = { where, text: 'Copied ' + what + '. Paste it into a message, email or listing.' }; render(); };
        const fallback = () => {
            const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            ta.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Select the text and copy it yourself.', bad: true }; render(); }
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
    function dateInput(id, value) {
        const i = el('input'); i.id = id; i.type = 'date'; i.value = value || ''; i.setAttribute('aria-describedby', id + '-err');
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
    // optional amount: blank is null
    function readMoney(id, opt) {
        const r = C.parseOptMoney($(id).value, opt);
        if (r.error) { setErr(id, r.error); return { ok: false }; }
        setErr(id, ''); return { ok: true, n: r.n };
    }
    function needMoney(id, blankMsg) {
        const r = readMoney(id);
        if (r.ok && r.n == null) { setErr(id, blankMsg); return { ok: false }; }
        return r;
    }
    function readDate(id, opt) {
        const v = $(id).value;
        if (!v) { if (opt.need) { setErr(id, opt.need); return { ok: false }; } setErr(id, ''); return { ok: true, v: null }; }
        if (!C.isDate(v)) { setErr(id, 'Pick a date, or leave it blank.'); return { ok: false }; }
        if (opt.notAfter && v > opt.notAfter) { setErr(id, opt.afterMsg); return { ok: false }; }
        if (opt.notBefore && v < opt.notBefore) { setErr(id, opt.beforeMsg); return { ok: false }; }
        setErr(id, ''); return { ok: true, v };
    }
    const focusBad = box => { const bad = box.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); };

    // the site chips (add form and edit form)
    function sitePicker(box, chosen, onChange) {
        box.textContent = '';
        C.SITES.forEach(s => {
            const on = chosen.includes(s), c = btn(s, 'chip' + (on ? ' on' : ''), () => {
                const i = chosen.indexOf(s);
                if (i >= 0) chosen.splice(i, 1); else chosen.push(s);
                c.classList.toggle('on', i < 0); c.setAttribute('aria-pressed', i < 0 ? 'true' : 'false');
                if (onChange) onChange();
            });
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
            box.appendChild(c);
        });
    }
    // a photo from the phone made small (longest side 360px) so many fit in the browser's storage
    function readPhoto(file, done, fail) {
        if (!file || !/^image\//.test(file.type || 'image/')) { fail('That file is not a photo.'); return; }
        if (file.size > 40000000) { fail('That photo is too big. Pick a smaller one.'); return; }
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => {
            const k = Math.min(1, 360 / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
            const cv = el('canvas'); cv.width = w; cv.height = h;
            const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            let data = '';
            try { data = cv.toDataURL('image/jpeg', 0.72); } catch (e) { data = ''; }
            if (!C.okPhoto(data)) { fail('That photo could not be used. Try another one.'); return; }
            done(data);
        };
        img.onerror = () => { URL.revokeObjectURL(url); fail('That photo could not be opened. Try a JPG or PNG.'); };
        img.src = url;
    }

    // ---------- the add form ----------
    function showAddPhoto() {
        $('a-photo-img').hidden = !addPhoto; if (addPhoto) $('a-photo-img').src = addPhoto; else $('a-photo-img').removeAttribute('src');
        $('a-photo-del').hidden = !addPhoto;
        $('a-photo-btn').textContent = addPhoto ? 'Change photo' : 'Add a photo';
    }
    function addItem() {
        const name = C.cleanText($('a-name').value, C.LIM.name);
        let ok = setErr('a-name', name ? '' : 'Type what you are selling, such as Baby cot.');
        const pr = readMoney('a-price'); ok = pr.ok && ok;
        const mn = readMoney('a-min'); ok = mn.ok && ok;
        if (mn.ok && pr.ok && mn.n != null && pr.n != null && mn.n > pr.n) ok = setErr('a-min', 'This is more than the asking price (' + money(pr.n) + ').') && ok;
        const ld = readDate('a-listed', { notAfter: t, afterMsg: 'Pick today or an earlier day.' }); ok = ld.ok && ok;
        if (!ok) { focusBad($('add')); return; }
        const it = { id: newId('i'), name, st: 'sale', listed: ld.v || t, sites: C.cleanSites(addSites.concat(C.splitSites($('a-other').value))), note: C.cleanNote($('a-note').value, C.LIM.note),
            prices: pr.n == null ? [] : [{ d: ld.v || t, c: pr.n }], min: mn.n, photo: addPhoto, dep: 0, offers: [], log: [], deal: null, done: null };
        const saved = change(() => { state.items.push(it); }, 'add-msg', 'Added ' + it.name + (pr.n != null ? ' at ' + money(pr.n) : '') + '. It is under For sale.');
        if (!saved) return;
        ['a-name', 'a-price', 'a-min', 'a-listed', 'a-note', 'a-other'].forEach(id => { $(id).value = ''; });
        addPhoto = ''; showAddPhoto();
        try { localStorage.setItem(SITEKEY, JSON.stringify(addSites)); } catch (e) { /* not remembered */ }
        $('a-name').focus();
    }

    // ---------- one item ----------
    function itemCard(it) {
        const c = el('article', 'item k-' + it.st), pr = C.price(it), drop = C.dropDue(it, t);
        c.dataset.id = it.id;
        if (drop) c.classList.add('due');
        const top = el('div', 'it-top');
        if (it.photo) { const im = el('img', 'thumb'); im.src = it.photo; im.alt = 'Photo of ' + it.name; top.appendChild(im); }
        const nm = el('div', 'it-head');
        nm.append(el('h3', 'it-name', it.name), el('span', 'it-price' + (pr == null ? ' none' : ''), it.st === 'sale' ? (pr == null ? 'Offers wanted' : money(pr)) : it.st === 'reserved' ? money(it.deal.c) : ''));
        top.appendChild(nm);
        c.appendChild(top);
        const trail = C.priceTrail(it, state.cur, LOC);
        if (trail && (it.st === 'sale' || it.st === 'reserved')) c.appendChild(p('it-trail', trail));
        c.appendChild(p('it-meta', (it.st === 'sale' ? 'Listed ' + C.ago(C.daysListed(it, t)) + ' (' + date(it.listed) + ')' : 'Listed ' + date(it.listed)) + ' · ' + (it.sites.length ? it.sites.join(', ') : 'Where: not set')));
        if (it.min != null && (it.st === 'sale' || it.st === 'reserved')) c.appendChild(p('it-meta', 'Lowest you will take: ' + money(it.min)));
        if (it.note) c.appendChild(p('it-note', it.note));
        if (it.st === 'sale') {
            if (drop) c.appendChild(p('it-due', 'Price drop due: same price for ' + drop + ' days and no offers.'));
            c.appendChild(offerList(it));
        } else if (it.st === 'reserved') {
            const d = it.deal, late = d.pick && d.pick < t;
            c.appendChild(p('it-when' + (late ? ' late' : ''), 'Reserved for ' + (d.who || 'a buyer') + ' at ' + money(d.c) + (pr != null && pr !== d.c ? ' (you asked ' + money(pr) + ')' : '')));
            c.appendChild(p('it-meta strong', d.pick ? (late ? 'Collection day was ' + C.dayWord(d.pick, t) + '. Did they come?' : 'Collecting ' + C.dayWord(d.pick, t) + (C.dayWord(d.pick, t) === date(d.pick) ? '' : ' (' + date(d.pick) + ')')) : 'No collection day set'));
            c.appendChild(p('it-meta strong', d.paid > 0 ? money(d.paid) + ' deposit paid, ' + money(d.c - d.paid) + ' to collect' : money(d.c) + ' to collect'));
        } else {
            c.appendChild(p('it-when', C.doneWords(it, t, state.cur, LOC) + '.'));
            if (it.st === 'sold' && it.done.bundle) {
                const others = state.items.filter(x => x !== it && x.done && x.done.bundle === it.done.bundle).map(x => x.name);
                if (others.length) c.appendChild(p('it-meta', 'Sold together with ' + others.join(', ') + '.'));
            }
            if (it.st === 'sold' && it.sites.length) c.appendChild(p('it-meta', 'Take the ad down on ' + it.sites.join(', ') + ' if it is still up.'));
        }
        if (it.dep > 0) c.appendChild(p('it-meta', 'Deposits kept from buyers who did not come: ' + money(it.dep)));
        if (it.log.length && (it.st === 'sale' || it.st === 'reserved')) {
            const nos = it.log.filter(l => / did not come/.test(l.text));
            if (nos.length) c.appendChild(p('it-meta', nos.slice(-2).map(l => l.text + ' (' + date(l.d) + ')').join('. ') + '.'));
        }
        if (form && form.id === it.id) c.appendChild(FORMS[form.kind](it));
        else c.appendChild(itemBtns(it));
        return c;
    }
    function offerList(it) {
        const box = el('div', 'offers'), show = it.offers.filter(o => o.st === 'open').concat(it.offers.filter(o => o.st !== 'open').slice(-3)).sort((a, b) => (a.st !== 'open') - (b.st !== 'open') || b.c - a.c);
        if (!show.length) return box;
        box.appendChild(p('o-h', 'Offers'));
        show.forEach(o => {
            const row = el('div', 'offer o-' + o.st);
            const words = (o.who || 'Someone') + ' offered ' + money(o.c);
            const tail = o.st === 'declined' ? ' · declined' : o.st === 'noshow' ? ' · did not come' : o.st === 'accepted' ? ' · accepted' : '';
            row.appendChild(p('o-line', words + ' · ' + date(o.d) + tail));
            if (o.st === 'open' && it.min != null && o.c < it.min) row.appendChild(p('o-low', 'Below your lowest price (' + money(it.min) + ')'));
            if (o.st === 'open') {
                const b = el('div', 'o-btns');
                b.append(btn('Accept', 'secondary', () => open('reserve', it, o.id), 'Accept ' + words), btn('Decline', 'secondary', () => change(() => C.setOffer(it, o.id, 'declined'), 'sale-msg', 'Declined ' + words + '.'), 'Decline ' + words));
                row.appendChild(b);
            }
            box.appendChild(row);
        });
        return box;
    }
    const sectionMsg = st => st === 'reserved' ? 'res-msg' : st === 'sale' ? 'sale-msg' : 'done-msg';
    function open(kind, it, offer) {
        form = { kind, id: it.id, offer: offer || null }; more = null; clearMsgs(); render();
        const f = document.querySelector('.item[data-id="' + it.id + '"] .inline-form input:not([type=checkbox]), .item[data-id="' + it.id + '"] .inline-form button');
        if (f) f.focus();
    }
    function close(id) { form = null; render(); const b = document.querySelector('.item[data-id="' + id + '"] .it-btns button'); if (b) b.focus(); }
    function del(it) { more = null; change(() => { state.items = state.items.filter(x => x !== it); }, sectionMsg(it.st), 'Deleted ' + it.name + '.'); }
    function itemBtns(it) {
        const b = el('div', 'it-btns'), n = it.name;
        if (it.st === 'sale') {
            b.append(btn('+ Offer', 'secondary', () => open('offer', it), 'Add an offer for ' + n), btn('Reserve for a buyer', 'secondary', () => open('reserve', it), 'Reserve ' + n + ' for a buyer'),
                btn('Mark as sold', 'primary', () => open('sell', it), 'Mark ' + n + ' as sold'), btn('Change price', 'secondary', () => open('price', it), 'Change the price of ' + n),
                btn('Copy ad text', 'secondary', () => copyText(C.adText(it, state.cur, LOC), 'sale-msg', 'the ad text for ' + n), 'Copy the ad text for ' + n));
            const m = btn(more === it.id ? 'Less' : 'More', 'secondary', () => { more = more === it.id ? null : it.id; form = null; render(); const x = document.querySelector('.item[data-id="' + it.id + '"] .more-btn'); if (x) x.focus(); }, (more === it.id ? 'Fewer' : 'More') + ' buttons for ' + n);
            m.classList.add('more-btn'); m.setAttribute('aria-expanded', more === it.id ? 'true' : 'false');
            b.appendChild(m);
            if (more === it.id) {
                b.append(btn('Edit', 'secondary', () => open('edit', it), 'Edit ' + n), btn('Given away', 'secondary', () => open('give', it), 'Mark ' + n + ' as given away'),
                    btn('I will keep it', 'secondary', () => { more = null; doneTab = 'kept'; change(() => C.keep(it, t), 'sale-msg', 'Took ' + n + ' off sale. It is under Done, Kept.'); }, 'Keep ' + n + ' and take it off sale'),
                    btn('Delete', 'secondary', () => del(it), 'Delete ' + n));
            }
        } else if (it.st === 'reserved') {
            b.append(btn('Collected and paid', 'primary', () => open('sell', it), n + ' was collected and paid for'), btn('Buyer did not come', 'secondary', () => {
                if (it.deal.paid > 0) open('noshow', it);
                else change(() => C.noShow(it, t, false), 'sale-msg', n + ' is back on sale. The no-show is noted on it.');
            }, 'The buyer for ' + n + ' did not come'), btn('Change the deal', 'secondary', () => open('reserve', it), 'Change the deal for ' + n), btn('Edit', 'secondary', () => open('edit', it), 'Edit ' + n), btn('Delete', 'secondary', () => del(it), 'Delete ' + n));
        } else {
            b.append(btn('Put back on sale', 'secondary', () => {
                const bundle = it.st === 'sold' && it.done.bundle;
                change(() => C.relist(it, t), 'done-msg', n + ' is back under For sale.' + (bundle ? ' The other items sold with it stay sold.' : ''));
            }, 'Put ' + n + ' back on sale'), btn('Edit', 'secondary', () => open('edit', it), 'Edit ' + n), btn('Delete', 'secondary', () => del(it), 'Delete ' + n));
        }
        return b;
    }
    function formBtns(f, saveText, onSave, id) {
        const r = el('div', 'row-btns');
        r.append(btn(saveText, 'primary', onSave), btn('Cancel', 'secondary', () => close(id)));
        f.appendChild(r);
        f.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); close(id); }
            if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') { e.preventDefault(); onSave(); }
        });
    }
    function offerForm(it) {
        const f = el('div', 'inline-form'), k = 'o-' + it.id;
        f.appendChild(p('f-h', 'Offer for ' + it.name));
        f.append(label(k + 'w', 'Who offered? (name or number)'), textInput(k + 'w', '', C.LIM.who, 'e.g. Ali'), errP(k + 'w'));
        const inp = moneyField(f, k + 'c', 'Amount offered', '', 'e.g. 7000');
        const note = p('f-note'); f.appendChild(note);
        const upd = () => {
            const r = C.parseOptMoney(inp.value); note.textContent = ''; note.className = 'f-note';
            if (r.error || r.n == null) return;
            if (it.min != null && r.n < it.min) { note.textContent = money(it.min - r.n) + ' below the lowest you will take (' + money(it.min) + ').'; note.className = 'f-note over'; }
            else if (C.price(it) != null) note.textContent = r.n >= C.price(it) ? 'That is your full asking price.' : money(C.price(it) - r.n) + ' less than you are asking.';
        };
        inp.addEventListener('input', upd);
        formBtns(f, 'Save offer', () => {
            const r = needMoney(k + 'c', 'Type the amount they offered.');
            if (!r.ok) { inp.focus(); return; }
            const who = C.cleanText($(k + 'w').value, C.LIM.who);
            form = null;
            change(() => C.addOffer(it, { id: newId('o'), who, c: r.n }, t), 'sale-msg', 'Saved ' + (who || 'the') + (who ? '\'s' : '') + ' offer of ' + money(r.n) + ' for ' + it.name + '.');
        }, it.id);
        return f;
    }
    function reserveForm(it) {
        const f = el('div', 'inline-form'), k = 'r-' + it.id, d = it.deal, o = form.offer ? it.offers.find(x => x.id === form.offer) : null;
        f.appendChild(p('f-h', d ? 'Change the deal for ' + it.name : 'Reserve ' + it.name + ' for a buyer'));
        f.append(label(k + 'w', 'Buyer\'s name'), textInput(k + 'w', d ? d.who : o ? o.who : '', C.LIM.who, 'e.g. Ali'), errP(k + 'w'));
        moneyField(f, k + 'c', 'Price agreed', C.moneyInput(d ? d.c : o ? o.c : C.price(it)), 'e.g. 8000');
        f.append(label(k + 'p', 'Day they collect (optional)'), dateInput(k + 'p', d ? d.pick : ''), errP(k + 'p'));
        moneyField(f, k + 'd', 'Deposit already paid (optional)', d && d.paid ? C.moneyInput(d.paid) : '', 'e.g. 2000');
        formBtns(f, d ? 'Save the deal' : 'Reserve it', () => {
            const who = C.cleanText($(k + 'w').value, C.LIM.who);
            let ok = setErr(k + 'w', who ? '' : 'Type the buyer\'s name, so you know who is coming.');
            const c = needMoney(k + 'c', 'Type the price you agreed.'); ok = c.ok && ok;
            const pk = readDate(k + 'p', {}); ok = pk.ok && ok;
            const dep = C.parseZeroMoney($(k + 'd').value);
            if (dep.error) ok = setErr(k + 'd', dep.error) && ok;
            else if (c.ok && dep.n > c.n) ok = setErr(k + 'd', 'The deposit is more than the price agreed.') && ok;
            else setErr(k + 'd', '');
            if (!ok) { focusBad(f); return; }
            form = null;
            if (d) change(() => { it.deal = Object.assign({}, d, { who, c: c.n, pick: pk.v, paid: dep.n }); }, 'res-msg', 'Saved the deal for ' + it.name + '.');
            else change(() => { C.reserve(it, { who, c: c.n, pick: pk.v, paid: dep.n }, t); if (o && o.st === 'open') o.st = 'accepted'; }, 'res-msg', 'Reserved ' + it.name + ' for ' + who + ' at ' + money(c.n) + '.' + (pk.v ? ' Collecting ' + C.dayWord(pk.v, t) + '.' : ''));
        }, it.id);
        return f;
    }
    function sellForm(it) {
        const f = el('div', 'inline-form'), k = 's-' + it.id, d = it.deal, best = C.bestOffer(it);
        f.appendChild(p('f-h', d ? it.name + ': collected and paid' : 'Sold ' + it.name));
        f.append(label(k + 'w', 'Sold to (optional)'), textInput(k + 'w', d ? d.who : best ? best.who : '', C.LIM.who, 'e.g. Ali'));
        const inp = moneyField(f, k + 'c', d ? 'Total they paid' : 'Price you got', C.moneyInput(d ? d.c : best ? best.c : C.price(it)), 'e.g. 8000');
        // swap
        const swOpen = btn('+ Swapped it for something (optional)', 'link', () => { swOpen.hidden = true; sw.hidden = false; $(k + 's').focus(); });
        const sw = el('div', 'sub-box'); sw.hidden = true;
        sw.append(label(k + 's', 'What did you get for it?'), textInput(k + 's', '', C.LIM.swap, 'e.g. A child car seat'), p('hint', 'Type any money you got as well in the price above, or 0.'));
        f.append(swOpen, sw);
        // bundle
        const others = state.items.filter(x => x !== it && (x.st === 'sale' || x.st === 'reserved'));
        const picked = new Set(), note = p('f-note');
        const showSplit = () => {
            note.textContent = '';
            if (!picked.size) return;
            const r = C.parseOptMoney(inp.value);
            if (r.error || r.n == null) { note.textContent = 'Type the one price you got for all of them.'; return; }
            const list = [it].concat(others.filter(x => picked.has(x.id))), parts = C.split(r.n, list.map(C.price));
            note.textContent = 'Split: ' + list.map((x, i) => x.name + ' ' + money(parts[i])).join(', ') + '.';
        };
        if (others.length) {
            const bOpen = btn('+ Sold together with other items (optional)', 'link', () => { bOpen.hidden = true; bx.hidden = false; const c1 = bx.querySelector('input'); if (c1) c1.focus(); });
            const bx = el('fieldset', 'sub-box bundle'); bx.hidden = true;
            bx.appendChild(el('legend', null, 'Also in this sale'));
            others.forEach(x => {
                const lb = el('label', 'check'), cb = el('input'); cb.type = 'checkbox'; cb.value = x.id;
                cb.addEventListener('change', () => { if (cb.checked) picked.add(x.id); else picked.delete(x.id); showSplit(); });
                lb.append(cb, document.createTextNode(' ' + x.name + (C.price(x) != null ? ' (' + money(C.price(x)) + ')' : '')));
                bx.appendChild(lb);
            });
            bx.appendChild(p('hint', 'Type the one price for all of them above. It is split by their asking prices.'));
            f.append(bOpen, bx);
        }
        f.appendChild(note);
        inp.addEventListener('input', showSplit);
        formBtns(f, 'Save as sold', () => {
            const swap = C.cleanText($(k + 's').value, C.LIM.swap);
            const blank = inp.value.trim() === '', r = C.parseZeroMoney(inp.value);
            let err = r.error || '';
            if (!err && !swap && (blank || r.n === 0)) err = 'Type the price you got. If it was free, use Given away instead.';
            if (!setErr(k + 'c', err)) { inp.focus(); return; }
            const who = C.cleanText($(k + 'w').value, C.LIM.who), list = [it].concat(others.filter(x => picked.has(x.id)));
            const sites = C.cleanSites([].concat(...list.map(x => x.sites)));
            const tip = sites.length ? ' Remember to take the ad down on ' + sites.join(', ') + '.' : '';
            form = null; doneTab = 'sold'; doneAll = false;
            if (list.length > 1) change(() => C.sellBundle(list, r.n, { who, swap }, t, newId('b')), sectionMsg(it.st), 'Sold ' + list.length + ' items together for ' + money(r.n) + '.' + tip);
            else change(() => C.sell(it, { who, c: r.n, swap }, t), sectionMsg(it.st), 'Sold ' + it.name + (swap ? ', swapped for ' + swap : ' for ' + money(r.n)) + '.' + tip);
        }, it.id);
        return f;
    }
    function priceForm(it) {
        const f = el('div', 'inline-form'), k = 'p-' + it.id, old = C.price(it);
        f.appendChild(p('f-h', 'New asking price for ' + it.name));
        const inp = moneyField(f, k, 'New asking price', '', old != null ? 'Now ' + C.moneyInput(old) : 'e.g. 8000');
        const quick = el('div', 'quick');
        if (old != null) {
            [10, 20].forEach(pc => {
                const n = Math.max(1, Math.round(old * (100 - pc) / 10000) * 100);
                quick.appendChild(btn(pc + '% less: ' + money(n), 'chip', () => { inp.value = C.moneyInput(n); inp.dispatchEvent(new Event('input')); inp.focus(); }));
            });
            f.appendChild(quick);
        }
        const note = p('f-note'); f.appendChild(note);
        inp.addEventListener('input', () => {
            const r = C.parseOptMoney(inp.value); note.textContent = ''; note.className = 'f-note';
            if (!r.error && r.n != null && it.min != null && r.n < it.min) { note.textContent = 'Below the lowest you said you would take (' + money(it.min) + ').'; note.className = 'f-note over'; }
        });
        f.appendChild(p('hint', 'The old price is kept on the item so you can see how it changed.'));
        formBtns(f, 'Save price', () => {
            const r = needMoney(k, 'Type the new asking price.');
            if (!r.ok) { inp.focus(); return; }
            form = null;
            change(() => { C.setPrice(it, r.n, t); C.log(it, t, 'Price ' + money(r.n)); }, 'sale-msg', it.name + ' is now ' + money(r.n) + (old != null && old !== r.n ? ' (was ' + money(old) + ').' : '.') + (it.sites.length ? ' Change it on ' + it.sites.join(', ') + ' too.' : ''));
        }, it.id);
        return f;
    }
    function giveForm(it) {
        const f = el('div', 'inline-form'), k = 'g-' + it.id;
        f.appendChild(p('f-h', 'Give ' + it.name + ' away'));
        f.append(label(k, 'Given to (optional)'), textInput(k, '', C.LIM.who, 'e.g. Charity shop, or a neighbour'));
        formBtns(f, 'Save as given away', () => {
            const who = C.cleanText($(k).value, C.LIM.who);
            form = null; doneTab = 'given'; doneAll = false;
            change(() => C.giveAway(it, who, t), 'sale-msg', 'Gave ' + it.name + ' away' + (who ? ' to ' + who : '') + '. It is under Done, Given away.');
        }, it.id);
        return f;
    }
    function noShowForm(it) {
        const f = el('div', 'inline-form'), d = it.deal;
        f.appendChild(p('f-h', (d.who || 'The buyer') + ' did not come. What about the ' + money(d.paid) + ' deposit?'));
        const r = el('div', 'row-btns');
        const go = keepIt => { form = null; change(() => C.noShow(it, t, keepIt), 'sale-msg', it.name + ' is back on sale.' + (keepIt ? ' The ' + money(d.paid) + ' deposit is added to Money made.' : ' The deposit was given back.')); };
        r.append(btn('Gave the deposit back', 'secondary', () => go(false)), btn('Kept the deposit', 'secondary', () => go(true)), btn('Cancel', 'secondary', () => close(it.id)));
        f.appendChild(r);
        f.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(it.id); } });
        return f;
    }
    function editForm(it) {
        const f = el('div', 'inline-form'), k = 'e-' + it.id, sites = it.sites.filter(s => C.SITES.includes(s));
        let photo = it.photo;
        f.appendChild(p('f-h', 'Change ' + it.name));
        f.append(label(k + 'n', 'What are you selling?'), textInput(k + 'n', it.name, C.LIM.name), errP(k + 'n'));
        if (it.st === 'sale' || it.st === 'reserved') {
            moneyField(f, k + 'p', 'Asking price', C.moneyInput(C.price(it)), 'Blank: offers wanted');
            moneyField(f, k + 'm', 'Lowest price you will take (optional)', C.moneyInput(it.min), 'e.g. 7500');
        }
        const fs = el('fieldset', 'sites'); fs.appendChild(el('legend', null, 'Where is it listed?'));
        const q = el('div', 'quick'); q.setAttribute('role', 'group'); q.setAttribute('aria-label', 'Where it is listed');
        sitePicker(q, sites); fs.appendChild(q);
        fs.append(label(k + 'o', 'Other places'), textInput(k + 'o', it.sites.filter(s => !C.SITES.includes(s)).join(', '), 120, 'e.g. Shpock, school group'));
        f.appendChild(fs);
        f.append(label(k + 'l', 'Date listed'), dateInput(k + 'l', it.listed), errP(k + 'l'));
        const ta = el('textarea'); ta.id = k + 't'; ta.maxLength = C.LIM.note; ta.rows = 3; ta.value = it.note; ta.placeholder = 'Size, condition, collection area';
        f.append(label(k + 't', 'Ad text'), ta);
        f.appendChild(p('label-like', 'Photo'));
        const pr = el('div', 'photo-row'), im = el('img', 'thumb'), add = btn('', 'secondary', () => file.click()), rm = btn('Remove photo', 'secondary', () => { photo = ''; showP(); });
        im.alt = 'Photo of ' + it.name;
        const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
        const perr = p('err');
        const showP = () => { im.hidden = !photo; if (photo) im.src = photo; add.textContent = photo ? 'Change photo' : 'Add a photo'; rm.hidden = !photo; };
        file.addEventListener('change', () => { perr.textContent = ''; readPhoto(file.files[0], d => { photo = d; showP(); }, m => { perr.textContent = m; }); file.value = ''; });
        pr.append(im, add, rm, file); f.append(pr, perr); showP();
        formBtns(f, 'Save changes', () => {
            const name = C.cleanText($(k + 'n').value, C.LIM.name);
            let ok = setErr(k + 'n', name ? '' : 'Type what you are selling.');
            let pc = { ok: true, n: C.price(it) }, mn = { ok: true, n: it.min };
            if ($(k + 'p')) { pc = readMoney(k + 'p'); mn = readMoney(k + 'm'); ok = pc.ok && mn.ok && ok; if (pc.ok && mn.ok && pc.n != null && mn.n != null && mn.n > pc.n) ok = setErr(k + 'm', 'This is more than the asking price.') && ok; }
            const ld = readDate(k + 'l', { need: 'Pick the day you listed it.', notAfter: t, afterMsg: 'Pick today or an earlier day.' }); ok = ld.ok && ok;
            if (!ok) { focusBad(f); return; }
            const st = it.st;
            form = null;
            change(() => {
                it.name = name; C.setPrice(it, pc.n, t); it.min = mn.n; it.listed = ld.v;
                if (it.prices.length === 1 || (it.prices.length && it.prices[0].d < it.listed)) it.prices[0].d = it.listed;
                it.sites = C.cleanSites(sites.concat(C.splitSites($(k + 'o').value))); it.note = C.cleanNote(ta.value, C.LIM.note); it.photo = photo;
            }, sectionMsg(st), 'Saved the changes to ' + name + '.');
        }, it.id);
        return f;
    }
    const FORMS = { offer: offerForm, reserve: reserveForm, sell: sellForm, price: priceForm, give: giveForm, noshow: noShowForm, edit: editForm };

    // ---------- the page ----------
    function statRow(list, name, value, cls) { const li = el('li', cls || ''); li.append(el('span', null, name), el('b', null, value)); list.appendChild(li); }
    function render() {
        t = C.today(new Date());
        if (form && !byId(form.id)) form = null;
        const has = state.items.length > 0, m = C.summary(state, t), s = C.sorted(state.items, t);
        $('intro').hidden = has; $('sum').hidden = !has;
        // the totals
        $('sum-big').textContent = money(m.made);
        $('sum-sub').textContent = m.sold ? 'From ' + C.plural(m.sold, 'item') + ' sold' + (m.pct != null ? ', ' + m.pct + '% of what you first asked.' : '.') + (m.depKept ? ' Includes ' + money(m.depKept) + ' in kept deposits.' : '')
            : 'When something sells, the money is added here.' + (m.depKept ? ' So far: ' + money(m.depKept) + ' in kept deposits.' : '');
        const L = $('sum-list'); L.textContent = '';
        if (m.reserved) statRow(L, 'Waiting to be collected', C.plural(m.reserved, 'item') + ', ' + money(m.toCollect) + ' to collect', 'hot');
        statRow(L, 'For sale', C.plural(m.sale, 'item') + (m.sale ? ', asking ' + money(m.asking) : '') + (m.noPrice ? ' (' + m.noPrice + ' with no price)' : ''));
        if (m.offers) statRow(L, 'Offers to answer', String(m.offers), 'hot');
        if (m.dropDue) statRow(L, 'Price drop due', C.plural(m.dropDue, 'item'), 'hot');
        if (m.sold) statRow(L, 'Sold', C.plural(m.sold, 'item') + ' for ' + money(m.soldFor) + (m.swaps ? ' (' + m.swaps + ' swapped)' : ''));
        if (m.given) statRow(L, 'Given away', C.plural(m.given, 'item'));
        if (m.kept) statRow(L, 'Kept', C.plural(m.kept, 'item'));
        const bs = C.bySite(state.items);
        if (bs.length > 1 || (bs.length === 1 && bs[0].site !== 'Not set')) statRow(L, 'By place', '', 'site-h');
        if (bs.length > 1 || (bs.length === 1 && bs[0].site !== 'Not set')) bs.forEach(e => statRow(L, e.site, [e.sale ? e.sale + ' listed' : '', e.sold ? e.sold + ' sold' : ''].filter(Boolean).join(', '), 'site'));
        // the lists
        const fw = flash ? flash.where : '';
        const fillList = (sec, list, items, msgId) => {
            const box = $(list); box.textContent = '';
            const msg = el('div', 'msg'); msg.id = msgId; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
            box.appendChild(msg);
            items.forEach(it => box.appendChild(itemCard(it)));
            $(sec).hidden = !items.length && fw !== msgId;
        };
        fillList('res-sec', 'res-list', s.reserved, 'res-msg');
        $('res-h').textContent = 'Waiting to be collected' + (s.reserved.length ? ' (' + s.reserved.length + ')' : '');
        fillList('sale-sec', 'sale-list', s.sale, 'sale-msg');
        $('sale-h').textContent = 'For sale' + (s.sale.length ? ' (' + s.sale.length + ')' : '');
        const done = s[doneTab], MAX = 10;
        fillList('done-sec', 'done-list', doneAll ? done : done.slice(0, MAX), 'done-msg');
        $('done-sec').hidden = !s.sold.length && !s.given.length && !s.kept.length && fw !== 'done-msg';
        [['tab-sold', 'sold', 'Sold'], ['tab-given', 'given', 'Given away'], ['tab-kept', 'kept', 'Kept']].forEach(([id, v, txt]) => {
            $(id).textContent = txt + ' (' + s[v].length + ')'; $(id).classList.toggle('on', doneTab === v); $(id).setAttribute('aria-pressed', doneTab === v ? 'true' : 'false');
        });
        $('done-none').hidden = done.length > 0;
        $('done-none').textContent = doneTab === 'sold' ? 'Nothing sold yet.' : doneTab === 'given' ? 'Nothing given away yet.' : 'Nothing kept yet.';
        $('done-more').hidden = doneAll || done.length <= MAX;
        $('done-more').textContent = 'Show all ' + done.length;
        // the add form
        ['a-price-cur', 'a-min-cur'].forEach(id => { $(id).textContent = state.cur; $(id).hidden = !state.cur; });
        $('restore-first').hidden = has;
        $('a-listed').max = t;
        const txt = C.listText(state, t, state.cur, LOC);
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('My things for sale') + '&body=' + encodeURIComponent(txt.length > 1800 ? txt.slice(0, 1800) + '\n...' : txt);
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
    $('a-more-open').addEventListener('click', () => { $('a-more-open').hidden = true; $('a-more').hidden = false; $('a-min').focus(); });
    $('a-name').addEventListener('input', () => setErr('a-name', ''));
    ['a-name', 'a-price', 'a-other', 'a-min'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }));
    $('a-save').addEventListener('click', addItem);
    $('a-photo-btn').addEventListener('click', () => { $('a-photo').value = ''; $('a-photo').click(); });
    $('a-photo-del').addEventListener('click', () => { addPhoto = ''; showAddPhoto(); });
    $('a-photo').addEventListener('change', () => readPhoto($('a-photo').files[0], d => { addPhoto = d; showAddPhoto(); }, msg => { flash = { where: 'add-msg', text: msg, bad: true }; render(); }));
    [['tab-sold', 'sold'], ['tab-given', 'given'], ['tab-kept', 'kept']].forEach(([id, v]) => $(id).addEventListener('click', () => { doneTab = v; doneAll = false; render(); }));
    $('done-more').addEventListener('click', () => { doneAll = true; render(); });
    $('cur').addEventListener('change', () => { const v = $('cur').value; change(() => { state.cur = v; }, 'tools-msg', 'Prices now show ' + (v ? 'with ' + v : 'as plain numbers') + '.'); });
    $('copy').addEventListener('click', () => copyText(C.listText(state, t, state.cur, LOC), 'sum-msg', 'the list'));
    $('backup').addEventListener('click', () => {
        download('declutter-and-sell-backup-' + t + '.json', 'application/json', JSON.stringify(Object.assign({ app: SLUG }, state), null, 1));
        flash = { where: 'tools-msg', text: 'Saved the backup file. Keep it somewhere safe, such as your email or cloud drive.' }; render();
    });
    const pick = () => { $('restore-file').value = ''; $('restore-file').click(); };
    $('restore').addEventListener('click', pick);
    $('restore-first').addEventListener('click', pick);
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; if (!f) return;
        const where = state.items.length ? 'tools-msg' : 'add-msg';
        if (f.size > 30000000) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let s = null;
            try { s = C.cleanState(JSON.parse(rd.result)); } catch (e) { s = null; }
            if (!s || !s.items.length) { flash = { where, text: 'That file is not a backup from this app, or it has nothing in it.', bad: true }; render(); return; }
            form = null; more = null;
            change(() => { state = s; }, 'top-msg', 'Restored ' + C.plural(s.items.length, 'item') + ' from the backup.');
            fillCur(); render();
        };
        rd.onerror = () => { flash = { where, text: 'That file could not be read.', bad: true }; render(); };
        rd.readAsText(f);
    });
    $('del-all').addEventListener('click', () => {
        if (!state.items.length) { flash = { where: 'tools-msg', text: 'There is nothing to delete.' }; render(); return; }
        form = null; more = null;
        change(() => { state = Object.assign(C.emptyState(), { cur: state.cur }); }, 'top-msg', 'Deleted everything.');
    });
    // a new day: listed days and price drop notes move on
    const tick = () => { if (C.today(new Date()) !== t && !form) render(); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    setInterval(tick, 60000);

    load();
    fillCur();
    if (!canSave) $('store-warn').hidden = false;
    sitePicker($('a-sites'), addSites);
    render();
    if (loadNote) showMsg($('top-msg'), loadNote, false, true);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
