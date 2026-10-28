// Gift Ideas List for Family and Friends: the page. The dates, money and words are in core.js (window.GIFTS).
(function () {
    'use strict';
    const C = window.GIFTS, SLUG = 'gift-ideas-list-for-family-and-friends', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)',
        'NZ$': 'NZ$ (New Zealand dollar)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (riyal)', 'KWD': 'KWD (dinar)', 'R': 'R (rand)', '৳': '৳ (taka)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)',
        'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₱': '₱ (peso)', 'S$': 'S$ (Singapore dollar)', '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    // occasions to pick from; fixed days are filled in, days that move every year are "One time"
    const PRESETS = [
        { name: 'Birthday', kind: 'yearly' }, { name: 'Anniversary', kind: 'yearly' }, { name: 'Eid ul-Fitr', kind: 'once' }, { name: 'Eid ul-Adha', kind: 'once' },
        { name: 'Christmas', kind: 'yearly', d: 25, m: 12 }, { name: 'Diwali', kind: 'once' }, { name: "Mother's Day", kind: 'once' }, { name: "Father's Day", kind: 'once' },
        { name: "Valentine's Day", kind: 'yearly', d: 14, m: 2 }, { name: 'Wedding', kind: 'once' }, { name: 'Graduation', kind: 'once' }, { name: 'New baby', kind: 'once' }, { name: 'Other', kind: 'yearly', other: true }];
    let state = C.emptyState(), t = C.today(new Date());
    let form = null;             // the one open form inside a box: { kind: 'occ'|'occe'|'idea'|'pedit', pid, id, mode }
    let showGiven = {};          // person id -> true when "Show all" given gifts is open
    let flash = null, undoSnap = null, canSave = true, loadNote = '', pendingPhoto = null, formPhoto;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (!raw) return;
        let s = null;
        try { s = C.cleanState(JSON.parse(raw)); } catch (e) { s = null; }
        if (s) state = s; else loadNote = 'Your saved list could not be read, so the app started fresh. If you have a backup file, restore it below.';
    }
    function save() {
        if (!canSave) { $('store-warn').hidden = false; return true; }
        try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
        catch (e) {
            // most often the photos filled the space: say so and keep the app usable
            flash = { where: 'top-msg', text: 'This browser is full and could not save the last change. Remove some photos or save a backup file.', bad: true };
            return false;
        }
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
        const where = flash && $(flash.where) ? flash.where : 'top-msg';
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
    const date = (s, o) => C.fmtDate(s, t, o);
    const byId = id => state.people.find(x => x.id === id);
    const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    function copyText(text, where, what) {
        const done = () => { flash = { where, text: 'Copied ' + (what || 'the list') + '. Paste it into a message or email.' }; render(); };
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
        row.appendChild(textInput(id, value, 20, ph, 'decimal'));
        box.append(row, errP(id));
    }
    function dateField(box, id, lbl, value) {
        const i = el('input'); i.id = id; i.type = 'date'; i.value = value || ''; i.setAttribute('aria-describedby', id + '-err');
        box.append(label(id, lbl), i, errP(id));
    }
    function select(id, opts, value) {
        const s = el('select'); s.id = id;
        opts.forEach(([v, txt]) => { const o = el('option', null, txt); o.value = v; s.appendChild(o); });
        if (value != null && opts.some(o => o[0] === value)) s.value = value;
        return s;
    }
    function readDate(id) { const v = $(id).value; if (!C.isDate(v)) { setErr(id, 'Pick a date.'); return null; } setErr(id, ''); return v; }
    // returns { ok, n } with n = null for blank
    function readOptMoney(id) {
        const r = C.parseOptMoney($(id).value);
        if (r.error) { setErr(id, r.error); return { ok: false }; }
        setErr(id, ''); return { ok: true, n: r.n };
    }
    function dayMonth(box, idD, idM, d, m, blank) {
        const sd = select(idD, [['', blank ? 'Day' : 'Day']].concat(Array.from({ length: 31 }, (_, k) => [String(k + 1), String(k + 1)])), d ? String(d) : '');
        const sm = select(idM, [['', 'Month']].concat(C.MONTHS.map((n, k) => [String(k + 1), n])), m ? String(m) : '');
        sd.setAttribute('aria-label', 'Day'); sm.setAttribute('aria-label', 'Month');
        const two = el('div', 'two');
        const f1 = el('div', 'field'), f2 = el('div', 'field');
        f1.appendChild(sd); f2.appendChild(sm); two.append(f1, f2);
        box.appendChild(two);
        return two;
    }
    // reads a day + month pair; both blank = null, one blank or a day the month does not have = error
    function readDM(idD, idM, required) {
        const d = +$(idD).value || 0, m = +$(idM).value || 0;
        if (!d && !m) { if (required) { setErr(idD, 'Pick the day and the month.'); return { ok: false }; } setErr(idD, ''); return { ok: true, v: null }; }
        if (!d || !m) { setErr(idD, 'Pick both the day and the month, or leave both empty.'); return { ok: false }; }
        if (!C.validDM(d, m)) { setErr(idD, C.MONTHS[m - 1] + ' has no day ' + d + '.'); return { ok: false }; }
        setErr(idD, ''); return { ok: true, v: { d, m } };
    }
    // a photo is made small (at most 360 px) before it is kept, so many fit in the browser's storage
    function readPhoto(file) {
        return new Promise((resolve, reject) => {
            if (!file || !/^image\//.test(file.type)) { reject(new Error('That file is not a photo. Pick a JPG or PNG.')); return; }
            if (file.size > 40000000) { reject(new Error('That photo is too big. Pick a smaller one.')); return; }
            const url = URL.createObjectURL(file), img = new Image();
            img.onload = () => {
                const k = Math.min(1, 360 / Math.max(img.naturalWidth, img.naturalHeight));
                const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
                const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
                const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                resolve(cv.toDataURL('image/jpeg', 0.72));
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be opened. Try another one.')); };
            img.src = url;
        });
    }
    function photoPreview(box, data, onRemove) {
        box.textContent = '';
        box.hidden = !data;
        if (!data) return;
        const im = el('img'); im.src = data; im.alt = 'Photo of the gift';
        box.append(im, btn('Remove photo', 'secondary small', onRemove));
    }
    const occOptions = (pr, anyText) => [['', anyText || 'Any occasion']].concat(pr ? pr.occ.map(o => [o.id, o.name + (C.next(o, t) && !C.next(o, t).past ? ' (' + date(C.next(o, t).d) + ')' : '')]) : []);
    const ordered = () => C.orderPeople(state.people, t);
    function goTo(pid) {
        const b = $('person-' + pid); if (!b) return;
        if ($('find').value) { $('find').value = ''; filter(); }
        b.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const h = b.querySelector('.c-name'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    }
    function repWarn(pr, what, exceptId) {
        const g = pr ? C.givenBefore(pr, what, exceptId) : [];
        if (!g.length) return '';
        return 'Heads up: you gave ' + pr.name + ' ' + g.slice(0, 3).map(i => '"' + i.what + '"' + (C.givenWhen(i) ? ' for ' + C.givenWhen(i) : '')).join(', ') + '.';
    }

    // ---------- the "Save a gift idea" card ----------
    function fillWho(keep) {
        const sel = $('i-who'), old = keep || sel.value;
        sel.textContent = '';
        ordered().forEach(pr => { const o = el('option', null, pr.name); o.value = pr.id; sel.appendChild(o); });
        if (old && byId(old)) sel.value = old;
        fillOcc();
    }
    function fillOcc() {
        const pr = byId($('i-who').value), sel = $('i-occ'), old = sel.value;
        sel.textContent = '';
        occOptions(pr, 'Any occasion, not decided').forEach(([v, txt]) => { const o = el('option', null, txt); o.value = v; sel.appendChild(o); });
        // default: the person's next occasion, as that is usually what the idea is for
        const nx = pr && C.personNext(pr, t);
        sel.value = old && pr && pr.occ.some(o => o.id === old) ? old : nx ? nx.o.id : '';
        checkRep();
    }
    function checkRep() {
        const msg = repWarn(byId($('i-who').value), $('i-what').value);
        $('i-rep').textContent = msg; $('i-rep').hidden = !msg;
    }
    function saveIdea() {
        clearMsgs();
        const pr = byId($('i-who').value);
        if (!pr) return;
        const what = C.cleanText($('i-what').value, C.LIM.what);
        let ok = setErr('i-what', what ? '' : 'Type the gift, such as "Rose perfume".');
        const price = readOptMoney('i-price'); ok = price.ok && ok;
        const link = C.cleanLink($('i-link').value);
        if (link === null) { setErr('i-link', 'That does not look like a web link. Paste it like https://shop.com/item, or leave it empty.'); ok = false; } else setErr('i-link', '');
        if (!ok) {
            if (!price.ok || link === null) { $('i-more').hidden = false; $('i-more-open').hidden = true; }
            const bad = document.querySelector('#idea-card [aria-invalid="true"]'); if (bad) bad.focus();
            return;
        }
        const idea = { id: newId('g'), what, st: 'idea', price: price.n, paid: null, occ: $('i-occ').value, where: C.cleanText($('i-where').value, C.LIM.where),
            link, note: C.cleanNote($('i-note').value, C.LIM.note), added: t };
        if (pendingPhoto) idea.photo = pendingPhoto;
        change(() => { pr.ideas.push(idea); }, 'idea-msg', 'Saved for ' + pr.name + ': ' + what + '.');
        ['i-what', 'i-price', 'i-where', 'i-link', 'i-note', 'i-photo'].forEach(id => { $(id).value = ''; });
        pendingPhoto = null; photoPreview($('i-photo-prev'), null);
        $('i-more').hidden = true; $('i-more-open').hidden = false; $('i-note-box').hidden = true; $('i-note-open').hidden = false;
        checkRep();
    }

    // ---------- the "Add a person" card ----------
    function fillBirthday() {
        const d = $('p-bd-d'), m = $('p-bd-m');
        [['', 'Day']].concat(Array.from({ length: 31 }, (_, k) => [String(k + 1), String(k + 1)])).forEach(([v, x]) => { const o = el('option', null, x); o.value = v; d.appendChild(o); });
        [['', 'Month']].concat(C.MONTHS.map((n, k) => [String(k + 1), n])).forEach(([v, x]) => { const o = el('option', null, x); o.value = v; m.appendChild(o); });
    }
    function nameTaken(name, exceptId) { const n = name.toLowerCase(); return state.people.some(x => x.id !== exceptId && x.name.toLowerCase() === n); }
    function addPerson() {
        clearMsgs();
        const name = C.cleanText($('p-name').value, C.LIM.name);
        let ok = setErr('p-name', !name ? 'Type a name, such as "Sana" or "Mum".' : nameTaken(name) ? name + ' is already on the list. Add something to tell them apart, such as "' + name + ' (cousin)".' : '');
        const bd = readDM('p-bd-d', 'p-bd-m'); ok = bd.ok && ok;
        const budget = readOptMoney('p-budget'); ok = budget.ok && ok;
        if (budget.ok && budget.n != null && bd.ok && !bd.v) { setErr('p-budget', 'Pick the birthday first, or leave the budget empty. Budgets for other days go on each occasion in their box.'); ok = false; }
        if (!ok) { const bad = document.querySelector('#add [aria-invalid="true"]'); if (bad) bad.focus(); return; }
        const pr = { id: newId('p'), name, likes: C.cleanNote($('p-likes').value, C.LIM.likes), occ: [], ideas: [] };
        if (bd.v) pr.occ.push({ id: newId('o'), name: 'Birthday', kind: 'yearly', d: bd.v.d, m: bd.v.m, budget: budget.n });
        change(() => { state.people.push(pr); }, 'add-msg', name + ' added. Save their first gift idea under "Save a gift idea", or add Eid, Christmas or another day in their box.');
        ['p-name', 'p-bd-d', 'p-bd-m', 'p-budget', 'p-likes'].forEach(id => { $(id).value = ''; });
        $('p-budget-box').hidden = true; $('p-budget-open').hidden = false; $('p-likes-box').hidden = true; $('p-likes-open').hidden = false;
        fillWho(pr.id);
    }

    // ---------- a person's box ----------
    function occForm(pr, o) {
        const f = el('div', 'inline-form'), id = 'of-' + pr.id;
        f.appendChild(p('f-h', o ? 'Change ' + o.name : 'Add an occasion for ' + pr.name));
        if (!o) {
            const q = el('div', 'quick'); q.setAttribute('role', 'group'); q.setAttribute('aria-label', 'Occasion');
            PRESETS.forEach(ps => {
                if (ps.name === 'Birthday' && pr.occ.some(x => x.name === 'Birthday')) return;
                q.appendChild(btn(ps.name, 'chip', () => {
                    $(id + '-name').value = ps.other ? '' : ps.name;
                    setKind(ps.kind);
                    if (ps.d) { $(id + '-d').value = String(ps.d); $(id + '-m').value = String(ps.m); }
                    q.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.textContent === ps.name));
                    (ps.other ? $(id + '-name') : (ps.kind === 'once' ? $(id + '-date') : ps.d ? $(id + '-save') : $(id + '-d'))).focus();
                }));
            });
            f.appendChild(q);
        }
        f.append(label(id + '-name', 'Name of the day'), textInput(id + '-name', o ? o.name : '', C.LIM.occ, 'e.g. Anniversary'), errP(id + '-name'));
        const fs = el('fieldset', 'kinds'); fs.appendChild(el('legend', null, 'When is it?'));
        [['yearly', 'Every year on the same day'], ['once', 'One time (Eid, Diwali, a wedding)'], ['none', 'No date yet']].forEach(([v, txt]) => {
            const l = el('label', 'radio'), r = el('input'); r.type = 'radio'; r.name = id + '-kind'; r.value = v;
            r.addEventListener('change', () => setKind(v));
            l.append(r, document.createTextNode(' ' + txt)); fs.appendChild(l);
        });
        f.appendChild(fs);
        const yb = el('div'); yb.id = id + '-ybox';
        yb.appendChild(label(id + '-d', 'Day and month'));
        dayMonth(yb, id + '-d', id + '-m', o && o.kind === 'yearly' ? o.d : null, o && o.kind === 'yearly' ? o.m : null);
        yb.appendChild(errP(id + '-d'));
        const ob = el('div'); ob.id = id + '-obox';
        dateField(ob, id + '-date', 'Date this time', o && o.kind === 'once' ? o.date : '');
        ob.appendChild(p('hint', 'For days that move every year, such as Eid: pick this year\'s date and change it next year.'));
        f.append(yb, ob);
        const bo = btn('+ Budget (optional)', 'link', () => { bo.hidden = true; bb.hidden = false; $(id + '-budget').focus(); });
        const bb = el('div');
        moneyField(bb, id + '-budget', 'Budget for this gift', C.moneyInput(o ? o.budget : null), 'e.g. 5000');
        bb.hidden = !(o && o.budget != null); bo.hidden = !bb.hidden;
        f.append(bo, bb);
        const rb = el('div', 'row-btns');
        const sv = btn(o ? 'Save changes' : 'Add occasion', 'primary', () => saveOcc(pr, o, id)); sv.id = id + '-save';
        rb.append(sv, btn('Cancel', 'secondary', () => { form = null; render(); }));
        f.appendChild(rb);
        function setKind(v) {
            f.querySelectorAll('input[name="' + id + '-kind"]').forEach(r => { r.checked = r.value === v; });
            yb.hidden = v !== 'yearly'; ob.hidden = v !== 'once';
        }
        setKind(o ? o.kind : 'yearly');
        return f;
    }
    function saveOcc(pr, o, id) {
        clearMsgs();
        const name = C.cleanText($(id + '-name').value, C.LIM.occ);
        const kindEl = document.querySelector('input[name="' + id + '-kind"]:checked'), kind = kindEl ? kindEl.value : 'yearly';
        let ok = setErr(id + '-name', !name ? 'Type a name, such as "Anniversary", or tap one above.' : pr.occ.some(x => x !== o && x.name.toLowerCase() === name.toLowerCase()) ? pr.name + ' already has ' + name + '.' : '');
        let dm = null, dt = null;
        if (kind === 'yearly') { const r = readDM(id + '-d', id + '-m', true); ok = r.ok && ok; dm = r.v; }
        if (kind === 'once') { dt = readDate(id + '-date'); ok = !!dt && ok; }
        const budget = readOptMoney(id + '-budget'); ok = budget.ok && ok;
        if (!ok) { const bad = document.querySelector('.inline-form [aria-invalid="true"]'); if (bad) bad.focus(); return; }
        const rec = { id: o ? o.id : newId('o'), name, kind, budget: budget.n };
        if (dm) { rec.d = dm.d; rec.m = dm.m; }
        if (dt) rec.date = dt;
        form = null;
        change(() => {
            const cur = byId(pr.id);
            if (o) cur.occ[cur.occ.findIndex(x => x.id === o.id)] = rec; else cur.occ.push(rec);
        }, 'pm-' + pr.id, (o ? 'Saved ' : 'Added ') + name + ' for ' + pr.name + ': ' + C.whenWords(rec, t) + '.');
    }
    function delOcc(pr, o) {
        const n = pr.ideas.filter(i => i.st !== 'given' && i.occ === o.id).length;
        form = null;
        change(() => {
            const cur = byId(pr.id);
            cur.occ = cur.occ.filter(x => x.id !== o.id);
            cur.ideas.forEach(i => { if (i.occ === o.id) i.occ = ''; if (i.go === o.id) { i.go = ''; } });
        }, 'pm-' + pr.id, 'Deleted ' + o.name + '.' + (n ? ' Its ' + C.plural(n, 'gift') + ' now say "Any occasion".' : ''));
    }

    // one form for: Edit (everything), Bought it, Given it
    function ideaForm(pr, i, mode) {
        const f = el('div', 'inline-form'), id = 'if-' + i.id;
        formPhoto = i.photo || null;
        f.appendChild(p('f-h', mode === 'bought' ? 'Bought: ' + i.what : mode === 'given' ? 'Given: ' + i.what : 'Change this gift'));
        let stSel = null;
        if (mode === 'edit') {
            const wi = textInput(id + '-what', i.what, C.LIM.what, 'e.g. Rose perfume'), rep = p('rep'); rep.hidden = true;
            f.append(label(id + '-what', 'What is the gift?'), wi, errP(id + '-what'), rep);
            wi.addEventListener('input', () => { const m = repWarn(pr, wi.value, i.id); rep.textContent = m; rep.hidden = !m; });
            moneyField(f, id + '-price', 'Rough price (optional)', C.moneyInput(i.price), 'e.g. 4500');
            f.appendChild(label(id + '-st', 'Status'));
            stSel = select(id + '-st', [['idea', 'Gift idea'], ['bought', 'Bought, not given yet'], ['given', 'Given']], i.st);
            f.appendChild(stSel);
        }
        const st = () => mode === 'edit' ? stSel.value : mode;
        const occBox = el('div');
        occBox.appendChild(label(id + '-occ', 'For which occasion?'));
        occBox.appendChild(select(id + '-occ', occOptions(pr, 'Any occasion, not decided'), i.occ));
        f.appendChild(occBox);
        const paidBox = el('div');
        moneyField(paidBox, id + '-paid', 'Price you paid (optional)', C.moneyInput(i.paid != null ? i.paid : i.price), 'e.g. 4200');
        // giving an idea straight away (made by hand, bought on the day) only asks the price: the day bought is the day given
        const quickGive = mode === 'given' && i.st === 'idea';
        const bdWrap = el('div'); dateField(bdWrap, id + '-bd', 'Day you bought it', i.bd || t);
        const keepWrap = el('div'); keepWrap.append(label(id + '-keep', 'Where it is kept (optional)'), textInput(id + '-keep', i.keep || '', C.LIM.keep, 'e.g. Top shelf of the wardrobe'));
        bdWrap.hidden = keepWrap.hidden = quickGive;
        paidBox.append(bdWrap, keepWrap);
        f.appendChild(paidBox);
        const givenBox = el('div');
        dateField(givenBox, id + '-gd', 'Day you gave it', i.gd || t);
        givenBox.appendChild(label(id + '-go', 'Given for'));
        givenBox.appendChild(select(id + '-go', occOptions(pr, 'No occasion, just because'), i.st === 'given' ? i.go : i.occ));
        f.appendChild(givenBox);
        if (mode === 'edit') {
            f.append(label(id + '-where', 'Where to buy it (optional)'), textInput(id + '-where', i.where, C.LIM.where, 'e.g. Dolmen Mall'));
            f.append(label(id + '-link', 'Web link (optional)'), textInput(id + '-link', i.link, C.LIM.link, 'Paste the shop page link', 'url'), errP(id + '-link'));
            const ta = el('textarea'); ta.id = id + '-note'; ta.rows = 3; ta.maxLength = C.LIM.note; ta.value = i.note || '';
            f.append(label(id + '-note', 'Note (optional)'), ta);
            const fi = el('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.id = id + '-photo'; fi.setAttribute('aria-describedby', id + '-photo-err');
            const prev = el('div', 'ph-prev');
            const showP = () => photoPreview(prev, formPhoto, () => { formPhoto = null; fi.value = ''; showP(); });
            fi.addEventListener('change', () => {
                setErr(id + '-photo', '');
                if (!fi.files[0]) return;
                readPhoto(fi.files[0]).then(d => { formPhoto = d; showP(); }, e => { setErr(id + '-photo', e.message); fi.value = ''; });
            });
            f.append(label(id + '-photo', 'Photo (optional)'), fi, errP(id + '-photo'), prev);
            showP();
            const others = ordered().filter(x => x.id !== pr.id);
            if (others.length) {
                f.appendChild(label(id + '-copy', 'Also save it for (optional)'));
                f.appendChild(select(id + '-copy', [['', 'No one else']].concat(others.map(x => [x.id, x.name])), ''));
                f.appendChild(p('hint', 'For one gift for two people, such as a couple. It is added to their ideas too.'));
            }
        }
        const sync = () => { const s = st(); paidBox.hidden = s === 'idea' || (mode === 'given' && i.st === 'bought'); givenBox.hidden = s !== 'given'; occBox.hidden = s === 'given'; keepWrap.hidden = quickGive || s === 'given'; };
        if (stSel) stSel.addEventListener('change', sync);
        sync();
        const rb = el('div', 'row-btns');
        rb.append(btn(mode === 'bought' ? 'Mark as bought' : mode === 'given' ? 'Mark as given' : 'Save changes', 'primary', () => saveIdeaForm(pr, i, mode, id, st())),
            btn('Cancel', 'secondary', () => { form = null; render(); }));
        f.appendChild(rb);
        return f;
    }
    function saveIdeaForm(pr, i, mode, id, st) {
        clearMsgs();
        let ok = true;
        const rec = Object.assign({}, i);
        if (mode === 'edit') {
            rec.what = C.cleanText($(id + '-what').value, C.LIM.what);
            ok = setErr(id + '-what', rec.what ? '' : 'Type the gift.') && ok;
            const pr1 = readOptMoney(id + '-price'); ok = pr1.ok && ok; rec.price = pr1.n;
            rec.where = C.cleanText($(id + '-where').value, C.LIM.where);
            const link = C.cleanLink($(id + '-link').value);
            if (link === null) { setErr(id + '-link', 'That does not look like a web link. Paste it like https://shop.com/item, or leave it empty.'); ok = false; } else { setErr(id + '-link', ''); rec.link = link; }
            rec.note = C.cleanNote($(id + '-note').value, C.LIM.note);
            if (formPhoto) rec.photo = formPhoto; else delete rec.photo;
        }
        if (mode !== 'given') rec.occ = $(id + '-occ').value;
        rec.st = st;
        if (st === 'idea') { rec.paid = null; delete rec.bd; delete rec.keep; delete rec.gd; delete rec.go; delete rec.gon; }
        const askPaid = st !== 'idea' && !(mode === 'given' && i.st === 'bought');
        if (askPaid) {
            const pd = readOptMoney(id + '-paid'); ok = pd.ok && ok; rec.paid = pd.n;
            if (mode === 'given' && i.st === 'idea') rec.bd = null;
            else {
                const bd = readDate(id + '-bd'); ok = !!bd && ok; rec.bd = bd;
                if (bd && bd > t) { setErr(id + '-bd', 'That day is in the future. Pick today or an earlier day.'); ok = false; }
            }
            rec.keep = st === 'given' ? '' : C.cleanText($(id + '-keep').value, C.LIM.keep);
        }
        if (st === 'given') {
            const gd = readDate(id + '-gd'); ok = !!gd && ok; rec.gd = gd;
            if (gd && gd > t) { setErr(id + '-gd', 'That day is in the future. Tap Given it on the day you give it.'); ok = false; }
            if (gd && rec.bd && gd < rec.bd) { setErr(id + '-gd', 'You gave it before the day you bought it. Check both days.'); ok = false; }
            if (gd && rec.bd === null) rec.bd = gd;
            rec.go = $(id + '-go').value; rec.gon = C.occName(pr, rec.go);
            rec.occ = rec.go;
        } else { delete rec.gd; delete rec.go; delete rec.gon; }
        if (!ok) { const bad = document.querySelector('.inline-form [aria-invalid="true"]'); if (bad) bad.focus(); return; }
        const copyTo = mode === 'edit' && $(id + '-copy') ? byId($(id + '-copy').value) : null;
        form = null;
        const text = mode === 'bought' ? 'Bought: ' + rec.what + '.' : mode === 'given' ? 'Given: ' + rec.what + '. It is kept under "Already given".' : 'Saved ' + rec.what + '.';
        change(() => {
            const cur = byId(pr.id), k = cur.ideas.findIndex(x => x.id === i.id);
            cur.ideas[k] = C.cleanIdea(rec, cur.occ.map(o => o.id)) || cur.ideas[k];
            if (copyTo) {
                const c = { id: newId('g'), what: rec.what, st: 'idea', price: rec.price, paid: null, occ: '', where: rec.where, link: rec.link, note: rec.note, added: t };
                if (rec.photo) c.photo = rec.photo;
                const nx = C.personNext(copyTo, t); if (nx) c.occ = nx.o.id;
                byId(copyTo.id).ideas.push(c);
            }
        }, 'pm-' + pr.id, text + (copyTo ? ' Also saved for ' + copyTo.name + '.' : ''));
    }
    function delIdea(pr, i) {
        form = null;
        change(() => { const cur = byId(pr.id); cur.ideas = cur.ideas.filter(x => x.id !== i.id); }, 'pm-' + pr.id, 'Deleted ' + i.what + '.');
    }
    function giftCard(pr, i) {
        const c = el('div', 'gift k-' + i.st);
        if (form && form.kind === 'idea' && form.id === i.id) { c.appendChild(ideaForm(pr, i, form.mode)); return c; }
        const top = el('div', 'g-top');
        if (i.photo) { const im = el('img', 'g-photo'); im.src = i.photo; im.alt = 'Photo of ' + i.what; im.addEventListener('click', () => im.classList.toggle('big')); top.appendChild(im); }
        const body = el('div', 'g-body');
        const h = el('p', 'g-what', i.what);
        body.appendChild(h);
        const meta = [];
        const price = i.paid != null && i.st !== 'idea' ? i.paid : i.price;
        if (price != null) meta.push((i.st !== 'idea' && i.paid != null ? 'Paid ' : 'About ') + money(price));
        if (i.st === 'given') meta.push('Given ' + date(i.gd, { year: true }) + (i.gon ? ' for ' + i.gon : ''));
        else meta.push(i.occ && C.occName(pr, i.occ) ? 'For ' + C.occName(pr, i.occ) : 'Any occasion');
        if (i.st === 'bought' && i.bd) meta.push('Bought ' + date(i.bd));
        body.appendChild(p('g-meta', meta.join(' · ')));
        if (i.st === 'bought' && i.keep) body.appendChild(p('g-keep', 'Kept: ' + i.keep));
        if (i.where) body.appendChild(p('g-where', 'From ' + i.where));
        if (i.link) {
            const a = el('a', 'g-link', 'Open link: ' + C.linkHost(i.link));
            a.href = i.link; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
            body.appendChild(a);
        }
        if (i.note) body.appendChild(p('g-note', i.note));
        if (i.st !== 'given') { const r = repWarn(pr, i.what, i.id); if (r) body.appendChild(p('rep', r)); }
        top.appendChild(body);
        c.appendChild(top);
        const b = el('div', 'g-btns');
        const open = mode => () => { form = { kind: 'idea', pid: pr.id, id: i.id, mode }; render(); focusForm(); };
        if (i.st === 'idea') b.append(btn('Bought it', 'secondary', open('bought'), 'Bought ' + i.what), btn('Given it', 'secondary', open('given'), 'Given ' + i.what));
        if (i.st === 'bought') b.append(btn('Given it', 'secondary', open('given'), 'Given ' + i.what));
        b.append(btn('Edit', 'secondary', open('edit'), 'Edit ' + i.what), btn('Delete', 'secondary danger-t', () => delIdea(pr, i), 'Delete ' + i.what));
        c.appendChild(b);
        return c;
    }
    function focusForm() { const f = document.querySelector('.inline-form'); if (f) { f.scrollIntoView({ block: 'nearest' }); const x = f.querySelector('input:not([type=radio]), select, textarea'); if (x) x.focus({ preventScroll: true }); } }
    function occRow(pr, o) {
        const r = el('div', 'occ k-' + kindOf(pr, o));
        if (form && form.kind === 'occe' && form.id === o.id) { r.appendChild(occForm(pr, o)); return r; }
        const st = C.occStats(pr, o, t), nx = C.next(o, t);
        const top = el('div', 'o-top');
        top.append(el('p', 'o-name', o.name), el('p', 'o-when', C.whenWords(o, t)));
        r.appendChild(top);
        const lines = [C.repeatWords(o)];
        if (nx && nx.past) lines.push('Tap Edit to pick the next date');
        r.appendChild(p('o-rep', lines.join(' · ')));
        r.appendChild(p('o-st', C.giftWords(st)));
        const bw = C.budgetWords(st, money);
        if (bw) r.appendChild(p('o-bud' + (st.over ? ' over' : ''), bw));
        if (nx && !nx.past && nx.days <= 14 && !st.bought && !st.given) r.appendChild(p('o-warn', 'Nothing bought yet'));
        const b = el('div', 'o-btns');
        b.append(btn('Edit', 'secondary small', () => { form = { kind: 'occe', pid: pr.id, id: o.id }; render(); focusForm(); }, 'Edit ' + o.name),
            btn('Delete', 'secondary small danger-t', () => delOcc(pr, o), 'Delete ' + o.name));
        r.appendChild(b);
        return r;
    }
    function kindOf(pr, o) {
        const nx = C.next(o, t);
        if (!nx) return 'none';
        if (nx.past) return 'past';
        const st = C.occStats(pr, o, t);
        if (nx.days <= 14 && !st.bought && !st.given) return 'warn';
        return nx.days <= 30 ? 'soon' : 'ok';
    }
    function personBox(pr) {
        const box = el('article', 'person'); box.id = 'person-' + pr.id; box.dataset.name = pr.name.toLowerCase();
        const nx = C.personNext(pr, t);
        if (nx && nx.n.days <= 14) box.classList.add('k-near');
        if (form && form.kind === 'pedit' && form.pid === pr.id) { box.appendChild(personEdit(pr)); return box; }
        const top = el('div', 'c-top');
        top.appendChild(el('h3', 'c-name', pr.name));
        if (nx) top.appendChild(el('span', 'tag', nx.o.name + ' ' + C.rel(nx.n.d, t)));
        box.appendChild(top);
        const o = C.openIdeas(pr), b = C.boughtIdeas(pr), g = C.givenIdeas(pr);
        box.appendChild(p('c-count', [C.plural(o.length, 'idea'), b.length + ' bought, not given', g.length + ' given before'].join(' · ')));
        if (pr.likes) box.appendChild(p('p-note', pr.likes));
        const msg = el('div', 'msg'); msg.id = 'pm-' + pr.id; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
        box.appendChild(msg);

        // occasions
        const os = el('div', 'sec');
        os.appendChild(el('h4', null, 'Days to buy for'));
        const sorted = pr.occ.slice().sort((a, c) => { const x = C.next(a, t), y = C.next(c, t); const kx = x ? (x.past ? '2' + x.d : '1' + x.d) : '3', ky = y ? (y.past ? '2' + y.d : '1' + y.d) : '3'; return kx.localeCompare(ky); });
        if (!sorted.length) os.appendChild(p('hint', 'No days yet. Add their birthday, Eid, Christmas or an anniversary.'));
        const ol = el('div', 'o-list'); sorted.forEach(x => ol.appendChild(occRow(pr, x))); os.appendChild(ol);
        if (form && form.kind === 'occ' && form.pid === pr.id) os.appendChild(occForm(pr, null));
        else os.appendChild(btn('+ Add an occasion', 'link', () => { form = { kind: 'occ', pid: pr.id }; render(); focusForm(); }));
        box.appendChild(os);

        // gifts
        const gs = el('div', 'sec');
        if (b.length) { gs.appendChild(el('h4', null, 'Bought, not given yet')); const l = el('div', 'g-list'); b.forEach(i => l.appendChild(giftCard(pr, i))); gs.appendChild(l); }
        gs.appendChild(el('h4', null, 'Gift ideas'));
        if (!o.length) gs.appendChild(p('hint', 'No ideas saved yet.'));
        const il = el('div', 'g-list');
        o.slice().reverse().forEach(i => il.appendChild(giftCard(pr, i)));
        gs.appendChild(il);
        gs.appendChild(btn('+ Add a gift idea for ' + pr.name, 'link', () => {
            fillWho(pr.id); $('i-who').value = pr.id; fillOcc();
            $('idea-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('i-what').focus({ preventScroll: true });
        }));
        box.appendChild(gs);

        if (g.length) {
            const hs = el('div', 'sec');
            hs.appendChild(el('h4', null, 'Already given'));
            const all = showGiven[pr.id], shown = all ? g : g.slice(0, 3);
            const l = el('div', 'g-list'); shown.forEach(i => l.appendChild(giftCard(pr, i))); hs.appendChild(l);
            if (g.length > 3) hs.appendChild(btn(all ? 'Show fewer' : 'Show all ' + g.length + ' given gifts', 'link', () => { showGiven[pr.id] = !all; render(); }));
            box.appendChild(hs);
        }

        const cb = el('div', 'c-btns');
        cb.append(btn('Copy their list', 'secondary', () => copyText(C.personText(pr, t, state.cur, LOC), 'pm-' + pr.id, 'the list for ' + pr.name)),
            btn('Edit person', 'secondary', () => { form = { kind: 'pedit', pid: pr.id }; render(); focusForm(); }),
            btn('Delete person', 'secondary danger-t', () => { form = null; change(() => { state.people = state.people.filter(x => x.id !== pr.id); }, 'top-msg', 'Deleted ' + pr.name + ' and their gifts.'); }));
        box.appendChild(cb);
        return box;
    }
    function personEdit(pr) {
        const f = el('div', 'inline-form'), id = 'pe-' + pr.id;
        f.appendChild(p('f-h', 'Edit ' + pr.name));
        f.append(label(id + '-name', 'Name'), textInput(id + '-name', pr.name, C.LIM.name), errP(id + '-name'));
        const ta = el('textarea'); ta.id = id + '-likes'; ta.rows = 3; ta.maxLength = C.LIM.likes; ta.value = pr.likes; ta.placeholder = 'e.g. Shirt size M, loves green';
        f.append(label(id + '-likes', 'Sizes, favourite colours, things they like (optional)'), ta);
        f.appendChild(p('hint', 'Change their birthday and other days under "Days to buy for".'));
        const rb = el('div', 'row-btns');
        rb.append(btn('Save changes', 'primary', () => {
            const name = C.cleanText($(id + '-name').value, C.LIM.name);
            if (!setErr(id + '-name', !name ? 'Type a name.' : nameTaken(name, pr.id) ? name + ' is already on the list.' : '')) { $(id + '-name').focus(); return; }
            form = null;
            change(() => { const c = byId(pr.id); c.name = name; c.likes = C.cleanNote($(id + '-likes').value, C.LIM.likes); }, 'pm-' + pr.id, 'Saved.');
            fillWho();
        }), btn('Cancel', 'secondary', () => { form = null; render(); }));
        f.appendChild(rb);
        return f;
    }

    // ---------- coming up ----------
    function renderSoon() {
        const body = $('soon-body'); body.textContent = '';
        const up = C.upcoming(state.people, t, 60, 3);
        if (!up.length) body.appendChild(p('hint', 'No dates yet. Add a birthday or another day in a person\'s box to see what is coming up.'));
        else {
            const f = up[0];
            body.appendChild(p('s-big', 'Next: ' + f.p.name + ', ' + f.o.name));
            body.appendChild(p('s-when', date(f.d) + ' (' + C.rel(f.d, t) + ')'));
            const bw = C.budgetWords(f.st, money);
            body.appendChild(p('s-st', C.giftWords(f.st) + (bw ? ' · ' + bw : '')));
            if (f.days <= 14 && !f.st.bought && !f.st.given) body.appendChild(p('s-st warn-t', 'Nothing bought yet'));
            const ul = el('ul', 'u-list');
            up.slice(1).forEach(r => {
                const li = el('li', 'u-row');
                const a = btn(r.p.name + ', ' + r.o.name, 'link inline u-name', () => goTo(r.p.id));
                li.append(a, el('span', 'u-when', ': ' + date(r.d) + ' (' + C.rel(r.d, t) + ')'));
                const warn = r.days <= 14 && !r.st.bought && !r.st.given;
                li.appendChild(p('u-st' + (warn ? ' warn-t' : ''), warn ? 'Nothing bought yet' + (r.st.ideas ? ', ' + C.plural(r.st.ideas, 'idea') + ' saved' : ', no ideas saved') : C.giftWords(r.st)));
                ul.appendChild(li);
            });
            if (up.length > 1) { body.appendChild(el('h4', null, 'After that')); body.appendChild(ul); }
        }
        const wait = [];
        state.people.forEach(pr => C.boughtIdeas(pr).forEach(i => wait.push({ pr, i })));
        if (wait.length) {
            const tot = wait.reduce((a, w) => a + C.cost(w.i), 0);
            body.appendChild(el('h4', null, 'Bought, not given yet: ' + C.plural(wait.length, 'gift') + (tot ? ', ' + money(tot) : '')));
            const ul = el('ul', 'u-list');
            wait.forEach(w => { const li = el('li'); li.textContent = w.pr.name + ': ' + w.i.what + (w.i.keep ? ' (kept: ' + w.i.keep + ')' : ''); ul.appendChild(li); });
            body.appendChild(ul);
        }
        const y = +t.slice(0, 4), sp = C.spentInYear(state.people, y);
        if (sp.count) body.appendChild(p('s-spent', 'Spent on gifts in ' + y + ': ' + money(sp.total) + ' on ' + C.plural(sp.count, 'gift')));
    }

    // ---------- whole page ----------
    function render() {
        t = C.today(new Date());
        const has = state.people.length > 0;
        $('intro').hidden = has;
        $('soon').hidden = !has;
        $('idea-card').hidden = !has;
        $('people').hidden = !has;
        $('find-box').hidden = state.people.length < 5;
        $('restore-first').hidden = has;
        ['i-price-cur', 'p-budget-cur'].forEach(id => { $(id).textContent = state.cur; $(id).hidden = !state.cur; });
        if (has) { fillWho(); renderSoon(); }
        const list = $('p-list'); list.textContent = '';
        ordered().forEach(pr => list.appendChild(personBox(pr)));
        filter();
        const sum = C.summaryText(state, t, LOC);
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('Gift ideas') + '&body=' + encodeURIComponent(sum.length > 1800 ? sum.slice(0, 1800) + '\n...' : sum);
        if (flash) {
            const box = $(flash.where) || $('top-msg');
            showMsg(box, flash.text, flash.undo, flash.bad);
            flash = null;
        }
    }
    function filter() {
        const q = $('find').value.trim().toLowerCase();
        let n = 0;
        document.querySelectorAll('#p-list .person').forEach(b => { const show = !q || b.dataset.name.includes(q); b.hidden = !show; if (show) n++; });
        $('find-none').hidden = !q || n > 0;
    }
    function fillCur() {
        const s = $('cur'); s.textContent = '';
        C.CURS.forEach(c => { const o = el('option', null, CUR_NAMES[c] || c); o.value = c; s.appendChild(o); });
        s.value = state.cur;
    }

    // ---------- events ----------
    document.querySelectorAll('#quick .chip').forEach(c => c.addEventListener('click', () => { $('p-name').value = c.dataset.name; setErr('p-name', ''); $('p-name').focus(); }));
    const reveal = (openId, boxId, focusId) => $(openId).addEventListener('click', () => { $(openId).hidden = true; $(boxId).hidden = false; $(focusId).focus(); });
    reveal('i-more-open', 'i-more', 'i-price');
    reveal('i-note-open', 'i-note-box', 'i-note');
    reveal('p-budget-open', 'p-budget-box', 'p-budget');
    reveal('p-likes-open', 'p-likes-box', 'p-likes');
    $('i-who').addEventListener('change', fillOcc);
    $('i-what').addEventListener('input', checkRep);
    $('i-what').addEventListener('keydown', e => { if (e.key === 'Enter') saveIdea(); });
    $('i-save').addEventListener('click', saveIdea);
    $('i-photo').addEventListener('change', () => {
        setErr('i-photo', '');
        const f = $('i-photo').files[0]; if (!f) return;
        readPhoto(f).then(d => { pendingPhoto = d; photoPreview($('i-photo-prev'), d, () => { pendingPhoto = null; $('i-photo').value = ''; photoPreview($('i-photo-prev'), null); }); },
            e => { setErr('i-photo', e.message); $('i-photo').value = ''; });
    });
    $('p-save').addEventListener('click', addPerson);
    $('p-name').addEventListener('keydown', e => { if (e.key === 'Enter') addPerson(); });
    $('find').addEventListener('input', filter);
    $('cur').addEventListener('change', () => { const v = $('cur').value; change(() => { state.cur = v; }, 'tools-msg', 'Prices now show ' + (v ? 'with ' + v : 'as plain numbers') + '.'); });
    $('copy').addEventListener('click', () => copyText(C.summaryText(state, t, LOC), 'soon-msg'));
    $('ics').addEventListener('click', () => {
        const d = new Date(), stamp = d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
        const r = C.ics(state.people, t, stamp);
        if (!r.count) { flash = { where: 'soon-msg', text: 'No dates to add yet. Add a birthday or another day with a date first.', bad: true }; render(); return; }
        download('gift-days.ics', 'text/calendar', r.text);
        flash = { where: 'soon-msg', text: 'Saved a calendar file with ' + C.plural(r.count, 'day') + '. Open it to add them to your calendar, with a reminder a week before each one.' }; render();
    });
    $('backup').addEventListener('click', () => {
        download('gift-ideas-backup-' + t + '.json', 'application/json', JSON.stringify(Object.assign({ app: SLUG }, state), null, 1));
        flash = { where: 'tools-msg', text: 'Saved the backup file. Keep it somewhere safe, such as your email or cloud drive.' }; render();
    });
    const pick = () => { $('restore-file').value = ''; $('restore-file').click(); };
    $('restore').addEventListener('click', pick);
    $('restore-first').addEventListener('click', pick);
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; if (!f) return;
        const where = state.people.length ? 'tools-msg' : 'add-msg';
        if (f.size > 20000000) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let s = null;
            try { s = C.cleanState(JSON.parse(rd.result)); } catch (e) { s = null; }
            if (!s || !s.people.length) { flash = { where, text: 'That file is not a backup from this app, or it has no people in it.', bad: true }; render(); return; }
            form = null;
            change(() => { state = s; }, 'top-msg', 'Restored ' + C.plural(s.people.length, 'person', 'people') + ' from the backup.');
            fillCur();
        };
        rd.onerror = () => { flash = { where, text: 'That file could not be read.', bad: true }; render(); };
        rd.readAsText(f);
    });
    $('del-all').addEventListener('click', () => {
        if (!state.people.length) { flash = { where: 'tools-msg', text: 'There is nothing to delete.' }; render(); return; }
        form = null;
        change(() => { state = Object.assign(C.emptyState(), { cur: state.cur }); }, 'top-msg', 'Deleted everything.');
    });
    // a new day: refresh the dates when the page comes back
    document.addEventListener('visibilitychange', () => { if (!document.hidden && C.today(new Date()) !== t && !form) render(); });

    fillBirthday();
    load();
    fillCur();
    if (!canSave) $('store-warn').hidden = false;
    render();
    if (loadNote) showMsg($('top-msg'), loadNote, false, true);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
