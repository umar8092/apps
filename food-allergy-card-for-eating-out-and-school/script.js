// Food Allergy Card for Eating Out and School: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.AllergyCore;
    const SLUG = 'food-allergy-card-for-eating-out-and-school';
    const KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };

    let canSave = true, state;
    const today = C.todayIso();
    const cur = () => state.people.find(p => p.id === state.cur) || state.people[0];
    const nameOr = (p, other) => (C.has(p.name) ? p.name.trim() : other);

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved cards could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; save(); renderAll(); }
    // Every change to a person: remember the day (printed on the school note), save and redraw the card.
    function touch() { cur().updated = today; save(); renderOut(); }

    // ---------- messages with Undo ----------
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        document.querySelectorAll('.msg.show').forEach(o => { if (o.id !== id) clearMsg(o.id); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) box.appendChild(btn('undo', 'Undo', () => { clearMsg(id); restoreSnap(undoSnap); }));
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 12000 : 7000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- people ----------
    function renderPeople() {
        const box = $('people'); box.textContent = '';
        state.people.forEach(p => {
            const b = btn('chip', nameOr(p, '(no name yet)'), () => { if (p.id === state.cur) return; state.cur = p.id; save(); renderAll(); });
            b.setAttribute('aria-pressed', String(p.id === state.cur));
            box.appendChild(b);
        });
        $('add-person').hidden = state.people.length >= C.LIMITS.people;
        const p = cur();
        $('food-who').textContent = nameOr(p, 'they');
        $('del-person').textContent = C.has(p.name) ? 'Delete ' + p.name.trim() + "'s card" : "Delete this person's card";
    }
    $('add-person').addEventListener('click', () => {
        const p = C.blankPerson('');
        state.people.push(p); state.cur = p.id; save(); renderAll();
        $('f-name').focus();
        show('who-msg', 'New card started. Type their name.');
    });

    // ---------- optional parts ----------
    const OPT = { emerg: 'Add an adrenaline pen and who to call (optional)', school: 'Add notes for school or carers (optional)' };
    function setOpen(key, open) {
        $('w-' + key).hidden = !open; $('o-' + key).setAttribute('aria-expanded', String(open));
        $('o-' + key).textContent = (open ? '− ' : '+ ') + OPT[key];
    }
    Object.keys(OPT).forEach(k => $('o-' + k).addEventListener('click', () => {
        const open = $('w-' + k).hidden; setOpen(k, open);
        if (open) (k === 'emerg' ? $('f-pen') : $('f-act')).focus();
    }));

    // ---------- the form ----------
    function fillForm() {
        const p = cur();
        $('f-name').value = p.name;
        $('f-pen').checked = p.pen; $('w-penwhere').hidden = !p.pen; $('f-penwhere').value = p.penWhere;
        $('f-cname').value = p.cName; $('f-cphone').value = p.cPhone;
        $('f-act').value = p.act; $('f-med').value = p.med; $('f-safe').value = p.safe;
        setOpen('emerg', p.pen || C.has(p.cName) || C.has(p.cPhone) || C.has(p.penWhere));
        setOpen('school', C.has(p.act) || C.has(p.med) || C.has(p.safe));
        checkPhone();
    }
    function bindText(id, field, max, oneLine) {
        $(id).addEventListener('input', () => {
            const v = $(id).value;
            cur()[field] = oneLine ? C.oneLine(v, max) : C.clean(v, max);
            if (field === 'name') renderPeople();
            if (field === 'cPhone') checkPhone();
            touch();
        });
    }
    bindText('f-name', 'name', C.LIMITS.name, true);
    bindText('f-penwhere', 'penWhere', C.LIMITS.short, true);
    bindText('f-cname', 'cName', C.LIMITS.short, true);
    bindText('f-cphone', 'cPhone', C.LIMITS.phone, true);
    bindText('f-act', 'act', C.LIMITS.long);
    bindText('f-med', 'med', C.LIMITS.long);
    bindText('f-safe', 'safe', C.LIMITS.long);
    $('f-pen').addEventListener('change', () => {
        cur().pen = $('f-pen').checked; $('w-penwhere').hidden = !cur().pen;
        if (cur().pen) $('f-penwhere').focus();
        touch();
    });
    function checkPhone() {
        const ok = C.phoneOk(cur().cPhone);
        $('f-cphone').setAttribute('aria-invalid', String(!ok));
        $('cphone-err').textContent = ok ? '' : 'This does not look like a phone number. Use digits, with + and the country code if you travel, like +92 300 1234567.';
    }

    // ---------- foods ----------
    function renderPicks() {
        const box = $('picks'); box.textContent = '';
        const p = cur();
        C.ALLERGENS.forEach(a => {
            const on = p.foods.some(f => f.k === a.k);
            const b = btn('pick', a.short, () => togglePick(a.k));
            b.setAttribute('aria-pressed', String(on));
            box.appendChild(b);
        });
    }
    function togglePick(k) {
        const p = cur(), i = p.foods.findIndex(f => f.k === k);
        if (i >= 0) {
            const snap = snapshot(); p.foods.splice(i, 1);
            touch(); renderFoods();
            show('food-msg', C.BY_KEY[k].short + ' taken off the card.', snap);
        } else {
            const r = C.addFoods(p, [{ k }]);
            if (r.full.length) { show('food-msg', 'A card can list up to ' + C.LIMITS.foods + ' foods. Take one off first.'); return; }
            touch(); renderFoods();
        }
        const again = [...document.querySelectorAll('#picks .pick')].find(b => b.textContent === C.BY_KEY[k].short);
        if (again) again.focus();
    }
    function addOther() {
        const text = $('f-other').value;
        const list = C.parseFoods(text);
        if (!list.length) { show('food-msg', 'Type a food first, for example kiwi.'); $('f-other').focus(); return; }
        const r = C.addFoods(cur(), list);
        const bits = [];
        if (r.added.length) bits.push('Added: ' + r.added.join(', ') + '.');
        if (r.dupes.length) bits.push('Already on the card: ' + r.dupes.join(', ') + '.');
        if (r.full.length) bits.push('Not added, the card is full (' + C.LIMITS.foods + ' foods): ' + r.full.join(', ') + '.');
        if (r.added.length) { $('f-other').value = ''; touch(); renderFoods(); }
        show('food-msg', bits.join(' '));
        $('f-other').focus();
    }
    $('add-other').addEventListener('click', addOther);
    // A one-line box drops line breaks, so a pasted list on several lines would run together: turn them into commas.
    $('f-other').addEventListener('paste', e => {
        const t = e.clipboardData && e.clipboardData.getData('text');
        if (!t || !/[\r\n]/.test(t)) return;
        e.preventDefault();
        const box = $('f-other'), joined = t.split(/[\r\n]+/).map(x => x.trim()).filter(Boolean).join(', ');
        box.setRangeText(joined, box.selectionStart, box.selectionEnd, 'end');
    });
    $('f-other').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addOther(); } });

    function renderFoods() {
        renderPicks();
        const p = cur(), list = $('foods'); list.textContent = '';
        $('foods-empty').hidden = p.foods.length > 0;
        const lang = state.lang;
        p.foods.forEach((f, i) => {
            const li = el('li', 'row-box lvl-' + f.lvl);
            const title = C.shortName(f);
            li.appendChild(el('p', 'food-name', title));
            if (f.k && C.BY_KEY[f.k].en !== title) li.appendChild(el('p', 'food-sub', 'On the card: ' + C.BY_KEY[f.k].en));
            const seg = el('div', 'seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'How serious for ' + title);
            [['trace', 'Even a trace is dangerous'], ['avoid', 'Must not eat it']].forEach(([v, t]) => {
                const lab = el('label'); const r = el('input'); r.type = 'radio'; r.name = 'lvl-' + f.id; r.value = v; r.checked = f.lvl === v;
                r.addEventListener('change', () => { f.lvl = v; li.className = 'row-box lvl-' + v; touch(); });
                lab.appendChild(r); lab.appendChild(document.createTextNode(t)); seg.appendChild(lab);
            });
            li.appendChild(seg);
            if (!f.k && lang) {
                const id = 'tr-' + f.id, ln = C.LANGS[lang].name.replace(/ \(.*\)$/, '');
                const lab = el('label', null, 'How to write "' + f.c + '" in ' + ln + ' (optional)'); lab.htmlFor = id;
                const inp = el('input'); inp.type = 'text'; inp.id = id; inp.maxLength = C.LIMITS.food; inp.value = (f.tr || {})[lang] || '';
                inp.dir = 'auto';
                inp.addEventListener('input', () => { f.tr = f.tr || {}; const v = C.oneLine(inp.value, C.LIMITS.food); if (v) f.tr[lang] = v; else delete f.tr[lang]; touch(); });
                li.appendChild(lab); li.appendChild(inp);
            }
            li.appendChild(btn('mini bad remove', 'Remove', () => {
                const snap = snapshot(); p.foods.splice(i, 1); touch(); renderFoods();
                show('food-msg', title + ' taken off the card.', snap);
            }, 'Remove ' + title));
            list.appendChild(li);
        });
    }

    // ---------- the card ----------
    function cardEl(m, showLang) {
        const box = el('div', 'acard'); box.dir = m.dir; box.lang = m.lang;
        const h = el('p', 'ah', m.head);
        if (showLang) h.appendChild(el('span', 'lang-tag', m.langName));
        box.appendChild(h);
        const b = el('div', 'ab');
        m.groups.forEach(g => {
            const sec = el('div', 'g-' + g.lvl);
            sec.appendChild(el('p', 'al', g.line));
            const ul = el('ul'); g.items.forEach(t => ul.appendChild(el('li', null, t)));
            sec.appendChild(ul); b.appendChild(sec);
        });
        m.care.forEach(t => b.appendChild(el('p', null, t)));
        b.appendChild(el('p', null, m.ask));
        if (m.emerg.length) {
            const e = el('div', 'ae'); e.appendChild(el('p', 'aet', m.emergTitle));
            m.emerg.forEach(x => {
                const line = el('p', null, x.t);
                if (x.v) { line.appendChild(document.createTextNode(' ')); const v = el('bdi', null, x.v); v.dir = 'auto'; line.appendChild(v); }
                e.appendChild(line);
            });
            b.appendChild(e);
        }
        box.appendChild(b);
        return box;
    }
    const langs = () => (state.lang ? ['en', state.lang] : ['en']);
    function renderOut() {
        const p = cur(), en = C.cardModel(p, 'en');
        $('card-empty').hidden = !!en; $('card-ready').hidden = !en;
        const todo = $('todo'); todo.textContent = '';
        const pv = $('previews'); pv.textContent = '';
        if (en) {
            langs().forEach(l => pv.appendChild(cardEl(C.cardModel(p, l), true)));
            if (state.lang) {
                const miss = C.cardModel(p, state.lang).missing;
                if (miss.length) todo.appendChild(el('li', null, 'Shown in English on the ' + C.LANGS[state.lang].name.replace(/ \(.*\)$/, '') + ' card: ' + miss.join(', ') + '. Add how to write ' + (miss.length > 1 ? 'them' : 'it') + ' in ' + (miss.length > 1 ? 'their boxes' : 'its box') + ' on the left (above, on a phone).'));
            }
            const subj = 'Food allergy: ' + nameOr(p, 'please read');
            $('email-card').href = 'mailto:?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(C.cardText(p, state.lang));
        }
        const note = C.note(p, today);
        $('note').textContent = note;
        $('email-note').href = 'mailto:?subject=' + encodeURIComponent('Allergy note: ' + nameOr(p, 'please read')) + '&body=' + encodeURIComponent(note);
    }

    function fillLangs() {
        const s = $('f-lang');
        C.LANG_ORDER.forEach(l => { const o = el('option', null, C.LANGS[l].name); o.value = l; s.appendChild(o); });
        s.addEventListener('change', () => { state.lang = C.LANGS[s.value] ? s.value : ''; save(); renderFoods(); renderOut(); });
    }

    // ---------- full screen ----------
    let fullLang = 'en';
    function renderFull() {
        const p = cur(), bar = $('full-langs'); bar.textContent = '';
        langs().forEach(l => {
            const b = btn('', C.LANGS[l].name, () => { fullLang = l; renderFull(); });
            b.setAttribute('aria-pressed', String(l === fullLang)); bar.appendChild(b);
        });
        const box = $('full-card'); box.textContent = '';
        box.appendChild(cardEl(C.cardModel(p, fullLang), false));
    }
    $('show-full').addEventListener('click', () => {
        fullLang = state.lang || 'en'; renderFull();
        const d = $('full'); d.showModal(); d.scrollTop = 0;
        if (d.requestFullscreen && matchMedia('(max-width: 899px)').matches) d.requestFullscreen().catch(() => {});
    });
    $('full-close').addEventListener('click', () => $('full').close());
    $('full').addEventListener('close', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); $('show-full').focus(); });

    // ---------- printing ----------
    // Shrinks the text inside each fixed-size box until it fits; returns false if even the smallest size does not fit.
    function fit(box, startPt, minPt) {
        const inner = box.firstChild; let pt = startPt;
        inner.style.fontSize = pt + 'pt';
        while (box.scrollHeight > box.clientHeight + 1 && pt > minPt) { pt -= 0.25; inner.style.fontSize = pt + 'pt'; }
        return box.scrollHeight <= box.clientHeight + 1;
    }
    function printWith(build) {
        const area = $('print-area'); area.textContent = '';
        const done = () => {
            document.body.classList.remove('printing'); area.textContent = ''; area.setAttribute('aria-hidden', 'true');
            removeEventListener('afterprint', done); scrollTo(0, 0);
        };
        // If the browser shows no print window (or does not say when it closed), this button brings the app back.
        const back = btn('secondary no-print', '← Back to the app', done);
        area.appendChild(back);
        document.body.classList.add('printing'); area.removeAttribute('aria-hidden');
        const ok = build(area);
        addEventListener('afterprint', done);
        back.focus();
        setTimeout(() => { try { window.print(); } catch (e) { /* printing blocked: the button stays */ } }, 50);
        return ok;
    }
    $('print-cards').addEventListener('click', () => {
        const p = cur();
        let allFit = true;
        printWith(area => {
            area.appendChild(el('p', 'print-h', 'Food allergy card: ' + nameOr(p, '') + '  ·  for the kitchen'));
            const row = el('div', 'big-row');
            langs().forEach(l => { const b = el('div', 'pc'); b.appendChild(cardEl(C.cardModel(p, l), l !== 'en')); row.appendChild(b); });
            area.appendChild(row);
            area.appendChild(el('p', 'print-h', 'Wallet card: cut along the outer line' + (state.lang ? ' and fold on the dashed line' : '')));
            const w = el('div', 'wallet');
            langs().forEach(l => { const b = el('div', 'wc'); b.appendChild(cardEl(C.cardModel(p, l), false)); w.appendChild(b); });
            area.appendChild(w);
            area.querySelectorAll('.pc').forEach(b => { if (!fit(b, 13, 7)) allFit = false; });
            area.querySelectorAll('.wc').forEach(b => { if (!fit(b, 8, 4.5)) allFit = false; });
            if (!allFit) area.appendChild(el('p', 'print-tip', 'Some text did not fit on a card. Take off foods you do not need, or keep the emergency part shorter.'));
            return allFit;
        });
        show('card-msg', allFit ? 'Opening the print window: one big card per language and a wallet card.' : 'Some text did not fit even at the smallest size. Take off foods you do not need, or shorten "Where the pen is kept".');
    });
    $('print-note').addEventListener('click', () => {
        printWith(area => { area.appendChild(el('div', 'print-note', C.note(cur(), today))); return true; });
    });

    // ---------- copy ----------
    function copy(text, msgId, what) {
        const done = () => show(msgId, what + ' copied. Paste it into a message or email.');
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove(); ok ? done() : show(msgId, 'Copying is blocked here. Select the text and copy it by hand.');
        };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    $('copy-card').addEventListener('click', () => copy(C.cardText(cur(), state.lang), 'card-msg', 'The card text'));
    $('copy-note').addEventListener('click', () => copy(C.note(cur(), today), 'note-msg', 'The note'));

    // ---------- backup, delete ----------
    $('backup').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'food-allergy-cards-' + today + '.json';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        show('set-msg', 'Backup saved to your downloads.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; $('restore-file').value = '';
        if (!f) return;
        if (f.size > 2e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
        const r = new FileReader();
        r.onload = () => {
            let s = null; try { s = C.validate(JSON.parse(r.result)); } catch (e) { s = null; }
            if (!s) { show('set-msg', 'That file is not a backup from this app, so nothing was changed.'); return; }
            const snap = snapshot(); state = s; save(); renderAll();
            show('set-msg', 'Restored ' + s.people.length + (s.people.length === 1 ? ' card.' : ' cards.'), snap);
        };
        r.onerror = () => show('set-msg', 'The file could not be read.');
        r.readAsText(f);
    });
    $('del-person').addEventListener('click', () => {
        const snap = snapshot(), p = cur(), who = nameOr(p, 'The card');
        state.people = state.people.filter(x => x.id !== p.id);
        if (!state.people.length) state.people.push(C.blankPerson(''));
        state.cur = state.people[0].id; save(); renderAll();
        show('set-msg', who + (C.has(p.name) ? "'s card" : '') + ' deleted.', snap);
    });
    $('del-all').addEventListener('click', () => {
        const snap = snapshot(); state = C.emptyState(); save(); renderAll();
        show('set-msg', 'Everything deleted. You are starting fresh.', snap);
    });

    function renderAll() {
        renderPeople(); fillForm(); $('f-lang').value = state.lang; renderFoods(); renderOut();
    }

    state = load();
    fillLangs();
    renderAll();
    try { localStorage.setItem(SLUG + '.probe', '1'); localStorage.removeItem(SLUG + '.probe'); } catch (e) { canSave = false; }
    $('storage-warn').hidden = canSave;
})();
