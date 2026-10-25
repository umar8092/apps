// Prepaid Class Pack and Sessions Tracker: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.PackCore;
    const SLUG = 'prepaid-class-pack-and-sessions-tracker';
    const KEY = SLUG + '.state', KEY_CUR = SLUG + '.cur';
    const URL_SELF = 'https://umar8092.github.io/apps/' + SLUG + '/';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    let canSave = true, state, today = C.todayIso(), cur = '';
    let edPack = null, renewFrom = null, usePack = null, edUse = null;   // what each window is editing
    const openLogs = new Set();                                            // packs whose log is open, kept open across redraws

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved packs could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeAll(); commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['pack-msg', 'set-msg'];
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        MSGS.forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) {
            const b = el('button', 'undo', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { restoreSnap(undoSnap); show(id, 'Undone.'); });
            box.appendChild(b);
        }
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 7000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const pack = id => state.packs.find(p => p.id === id);
    const use = id => state.uses.find(u => u.id === id);
    const newId = () => state.nextId++;
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
        return Promise.resolve(fallbackCopy(text));
    }
    function fallbackCopy(text) {
        const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); return ok;
    }
    function download(name, type, body) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    function mailto(subject, text) {
        let body = text;
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(Too long for an email link. Use "Copy log" and paste it.)';
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
    function flash(id) {
        const t = document.querySelector('.pack[data-id="' + id + '"]');
        if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1600); }
    }
    function btn(parent, cls, text, fn, aria) {
        const b = el('button', cls, text); b.type = 'button';
        if (aria) b.setAttribute('aria-label', aria);
        b.addEventListener('click', fn); parent.appendChild(b); return b;
    }
    const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

    // ---------- the page ----------
    function render() {
        today = C.todayIso();
        renderGlance();
        renderPacks();
        renderFinished();
        $('add-pack').textContent = C.live(state).length ? '+ Add another pack' : '+ Add a pack';
    }

    function renderGlance() {
        const body = $('sum-body'); body.textContent = '';
        const g = C.glance(state, today, cur);
        if (!g.rows.length) {
            body.appendChild(el('p', 'sum-empty', state.packs.length
                ? 'No open packs. Your old ones are in "Finished packs". Tap "+ Add a pack" when you buy a new one.'
                : 'Add your first pack below: swimming lessons, a gym card, physio or tuition. Then tap "Went today" after each session, and this shows what is left and what needs attention.'));
            return;
        }
        const ul = el('ul', 'glance');
        g.rows.forEach(r => {
            const li = el('li', r.cls);
            li.appendChild(el('b', null, r.name + ':'));
            li.appendChild(el('span', null, r.text));
            ul.appendChild(li);
        });
        body.appendChild(ul);
        if (g.risk) body.appendChild(el('p', 'glance-risk', g.risk === 1 ? '1 pack could have sessions going to waste. See its box.' : g.risk + ' packs could have sessions going to waste. See their boxes.'));
        if (g.unused) body.appendChild(el('p', 'glance-total', 'Paid for and not used yet: ' + C.money(g.unused, cur) + (g.withPrice > 1 ? ' across ' + g.withPrice + ' packs.' : '.')));
    }

    function renderPacks() {
        const ul = $('pack-list'); ul.textContent = '';
        C.sortPacks(state, C.live(state), today).forEach(p => ul.appendChild(packBox(p)));
    }

    function packBox(p) {
        const st = C.status(state, p, today, cur), s = st.s;
        const li = el('li', 'pack ' + st.cls); li.dataset.id = p.id;
        const top = el('div', 'pack-top');
        top.appendChild(el('h3', 'pack-name', p.name));
        if (p.people.length) top.appendChild(el('span', 'pack-who', 'for ' + (p.people.length === 1 ? p.people[0] : p.people.slice(0, -1).join(', ') + ' and ' + p.people[p.people.length - 1])));
        li.appendChild(top);
        li.appendChild(el('p', 'big', st.big));
        if (!s.unlimited) {
            if (p.size <= 40) {
                const d = el('div', 'dots' + (p.size > 20 ? ' many' : '')); d.setAttribute('aria-hidden', 'true');
                for (let i = 0; i < p.size; i++) d.appendChild(el('i', i < s.used ? 'u' : ''));
                li.appendChild(d);
            } else {
                const b = el('div', 'bar'); b.setAttribute('aria-hidden', 'true');
                const f = el('span'); f.style.width = Math.round(s.used * 100 / p.size) + '%'; b.appendChild(f); li.appendChild(b);
            }
        }
        li.appendChild(el('p', 'st', st.head));
        st.lines.forEach(t => li.appendChild(el('p', 'line' + (/waste|Not enough days|Expired|Ask the centre/.test(t) ? ' warn' : /per session|per visit/.test(t) ? ' muted' : ''), t)));
        if (s.byPerson) li.appendChild(el('p', 'line muted', 'Used so far: ' + s.byPerson.map(x => x.name + ' ' + x.n).join(', ') + '.'));
        if (s.off) li.appendChild(el('p', 'line muted', C.plural(s.off, 'cancelled or excused class') + ' not counted.'));
        if (p.note) li.appendChild(el('p', 'pack-note', p.note));

        const act = el('div', 'act');
        if (s.ended) {
            btn(act, 'go', 'Renew', () => openPack(null, p.id), 'Renew ' + p.name);
            btn(act, 'mini wide', 'Move to finished packs', () => setArchived(p.id, true), 'Move ' + p.name + ' to finished packs');
        } else if (!s.notStarted) {
            if (p.people.length > 1) p.people.forEach(n => btn(act, 'go', n + ' went today', () => went(p.id, n)));
            else btn(act, 'go', 'Went today', () => went(p.id, p.people[0] || ''), (s.unlimited ? 'Log a visit today: ' : 'Log a session today: ') + p.name);
        }
        // an expired pack still takes a session you forgot to log; a used-up one only takes Renew, Edit or a fix in the log
        if (!s.notStarted && !s.usedUp) btn(act, 'mini wide', 'Other day or missed', () => openUse(p.id, null), 'Log a session on another day, missed or cancelled: ' + p.name);
        li.appendChild(act);

        const tools = el('div', 'tools');
        btn(tools, 'mini', 'Edit', () => openPack(p.id, null), 'Edit ' + p.name);
        btn(tools, 'mini', 'Copy log', () => copyText(C.logText(state, p, today, cur)).then(ok => show('pack-msg', ok ? 'Copied the log for ' + C.title(p) + '. Paste it in a message to the centre.' : 'Could not copy. Try "Email log" instead.')), 'Copy the log for ' + p.name);
        const m = el('a', 'mini', 'Email log'); m.href = mailto(C.title(p) + ': sessions log', C.logText(state, p, today, cur)); m.setAttribute('aria-label', 'Email the log for ' + p.name);
        tools.appendChild(m);
        li.appendChild(tools);

        const total = s.uses.length + p.usedBefore;
        if (total) {
            const det = el('details', 'log'); det.open = openLogs.has(p.id);
            det.addEventListener('toggle', () => { if (det.open) openLogs.add(p.id); else openLogs.delete(p.id); });
            det.appendChild(el('summary', null, 'Log (' + C.plural(s.uses.length + p.usedBefore, 'entry').replace('entrys', 'entries') + ')'));
            const ol = el('ul', 'log-list');
            let n = p.usedBefore;
            const rows = [];
            s.uses.forEach(u => {
                const counted = C.counts(u); if (counted) n++;
                const label = (counted ? (s.unlimited ? 'Visit ' : '#') + n + ' ' : '') + C.shortDate(u.date, today) + ': ' +
                    (u.kind === 'went' ? 'went' : u.kind === 'missed' ? 'missed, still counted' : 'cancelled or excused, not counted') + (u.who && p.people.length > 1 ? ' (' + u.who + ')' : '') + (u.note ? '. ' + u.note : '');
                rows.push({ u, label });
            });
            rows.reverse().forEach(r => {
                const row = el('li', r.u.kind);
                row.appendChild(el('span', null, r.label));
                btn(row, 'mini', 'Edit', () => openUse(p.id, r.u.id), 'Edit ' + r.label);
                ol.appendChild(row);
            });
            if (p.usedBefore) { const row = el('li', 'before'); row.appendChild(el('span', null, (p.usedBefore === 1 ? '#1' : '#1 to #' + p.usedBefore) + ': used before this log was started (change it with Edit)')); ol.appendChild(row); }
            det.appendChild(ol);
            li.appendChild(det);
        }
        return li;
    }

    function renderFinished() {
        const done = state.packs.filter(p => p.archived).sort((a, b) => b.archived.localeCompare(a.archived) || b.id - a.id);
        $('finished').hidden = !done.length;
        const ul = $('fin-list'); ul.textContent = '';
        done.forEach(p => {
            const s = C.stats(state, p, today), li = el('li', 'fin');
            li.appendChild(el('h3', null, C.title(p)));
            li.appendChild(el('p', null, (s.unlimited ? C.plural(s.used, 'visit') : s.used + ' of ' + p.size + ' used') + ', ' + C.shortDate(p.start, today) + (p.expiry ? ' to ' + C.shortDate(p.expiry, today) : '') + (p.cents ? '. Paid ' + C.money(p.cents, cur) : '') + '.'));
            const act = el('div', 'act');
            btn(act, 'mini', 'Bring back', () => setArchived(p.id, false), 'Bring back ' + p.name);
            btn(act, 'mini', 'Copy log', () => copyText(C.logText(state, p, today, cur)).then(ok => show('set-msg', ok ? 'Copied the log for ' + C.title(p) + '.' : 'Could not copy.')), 'Copy the log for ' + p.name);
            btn(act, 'mini', 'Delete', () => deletePack(p.id, 'set-msg'), 'Delete ' + p.name);
            li.appendChild(act);
            ul.appendChild(li);
        });
    }

    // ---------- actions ----------
    function went(id, who) {
        const p = pack(id); if (!p) return;
        const s = C.stats(state, p, today);
        if (s.ended || s.notStarted) { render(); return; }
        const before = snapshot();
        state.uses.push({ id: newId(), pack: p.id, date: today, kind: 'went', who: who || '', note: '' });
        commit();
        const a = C.stats(state, p, today);
        const sameDay = a.uses.filter(u => u.date === today && C.counts(u)).length;
        let text = (who && p.people.length > 1 ? who + ': ' : '') + (a.unlimited ? 'Logged visit ' + a.used + ' today.' : 'Logged session ' + a.used + ' of ' + p.size + ' today. ' + (a.left ? C.plural(a.left, 'session') + ' left.' : 'That was the last one.'));
        if (sameDay > 1) text += ' (' + ord(sameDay) + ' today.)';
        show('pack-msg', text, before);
    }
    function setArchived(id, on) {
        const p = pack(id); if (!p) return;
        const before = snapshot();
        p.archived = on ? today : '';
        closeAll(); commit();
        show(on ? 'pack-msg' : 'set-msg', on ? 'Moved ' + C.title(p) + ' to Finished packs.' : 'Brought back ' + C.title(p) + '.', before);
        if (!on) flash(id);
    }
    function deletePack(id, msgId) {
        const p = pack(id); if (!p) return;
        const before = snapshot();
        state.packs = state.packs.filter(x => x.id !== id);
        state.uses = state.uses.filter(u => u.pack !== id);
        closeAll(); commit();
        show(msgId || 'pack-msg', 'Deleted ' + C.title(p) + ' and its log.', before);
    }

    // ---------- windows ----------
    function openDlg(id) { const d = $(id); if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); } }
    function closeDlg(id) { const d = $(id); if (d.open) { if (d.close) d.close(); else d.removeAttribute('open'); } }
    function closeAll() { ['d-pack', 'd-use'].forEach(closeDlg); edPack = renewFrom = usePack = edUse = null; }
    function clearErrors(form) {
        form.querySelectorAll('.err').forEach(e => { e.textContent = ''; });
        form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    }
    function showErrors(errors, map) {
        let first = null;
        Object.keys(errors).forEach(k => {
            const m = map[k]; if (!m) return;
            $(m[1]).textContent = errors[k];
            const f = $(m[0]); if (f) { f.setAttribute('aria-invalid', 'true'); if (!first) first = f; }
        });
        if (first) first.focus();
    }
    function showPart(w, o, on) { $(w).hidden = !on; $(o).hidden = on; }

    // id: edit that pack; from: renew that pack; neither: a new pack
    function openPack(id, from) {
        closeAll();
        const p = id != null ? pack(id) : null, old = from != null ? pack(from) : null;
        edPack = p ? p.id : null; renewFrom = old ? old.id : null;
        const f = $('f-pack'); f.reset(); clearErrors(f);
        const v = p || (old ? C.renewal(old, today) : { name: '', people: [], size: 0, start: today, expiry: '', cents: null, note: '', usedBefore: 0 });
        $('dp-h').textContent = p ? 'Edit pack' : old ? 'Renew: ' + C.title(old) : 'Add a pack';
        $('p-save').textContent = p ? 'Save changes' : old ? 'Start the new pack' : 'Add pack';
        $('p-name').value = v.name;
        $('p-type').value = (p || old) && v.size === 0 ? 'pass' : 'count';
        $('p-size').value = (p || old) && v.size ? String(v.size) : '';
        $('p-start').value = v.start;
        $('p-expiry').value = v.expiry;
        $('p-people').value = v.people.join(', ');
        $('p-price').value = v.cents != null ? C.money(v.cents, '').replace(/,/g, '') : '';
        $('p-before').value = p && p.usedBefore ? String(p.usedBefore) : '';
        $('p-note').value = v.note || '';
        $('pl-price').textContent = 'Price paid for the whole pack' + (cur ? ' (' + cur + ')' : '');
        showPart('pw-people', 'po-people', !!v.people.length);
        showPart('pw-price', 'po-price', v.cents != null);
        showPart('pw-before', 'po-before', !!(p && p.usedBefore));
        showPart('pw-note', 'po-note', !!v.note);
        $('p-edit').hidden = !p;
        if (p) $('p-archive').textContent = p.archived ? 'Bring back to my packs' : 'Move to finished packs';
        // carry over what is left of the old pack
        const os = old ? C.stats(state, old, today) : null;
        const carry = os && !os.unlimited && os.left > 0 ? os.left : 0;   // some centres let unused sessions roll over when you renew
        $('pw-carry').hidden = !carry; $('p-carry').checked = false;
        $('p-carry-text').textContent = carry ? 'Add the ' + C.plural(carry, 'session') + ' still left on the old pack to the new one' : '';
        $('p-carry').dataset.n = String(carry);
        typeChanged(); preview();
        $('p-warn').textContent = '';
        openDlg('d-pack');
        if (!p && !old) $('p-name').focus();
    }
    function typeChanged() {
        const pass = $('p-type').value === 'pass';
        $('pw-size').hidden = pass;
        $('po-before').hidden = pass || !$('pw-before').hidden;
        if (pass) $('pw-before').hidden = true;
        $('p-noexp').hidden = pass;
    }
    function packForm() {
        return { name: $('p-name').value, type: $('p-type').value, size: $('p-size').value, people: $('pw-people').hidden ? '' : $('p-people').value,
            start: $('p-start').value, expiry: $('p-expiry').value, price: $('pw-price').hidden ? '' : $('p-price').value,
            note: $('pw-note').hidden ? '' : $('p-note').value, usedBefore: $('pw-before').hidden ? '' : $('p-before').value };
    }
    function loggedFor(id) {
        const list = id != null ? state.uses.filter(u => u.pack === id) : [];
        return { counted: list.filter(C.counts).length, first: list.map(u => u.date).sort()[0] || '' };
    }
    function preview() {
        const f = packForm(), pass = f.type === 'pass', start = C.isDate(f.start) ? f.start : '';
        // which expiry chip matches the date
        document.querySelectorAll('#p-quick-exp .chip').forEach(c => {
            const m = Number(c.dataset.m);
            c.setAttribute('aria-pressed', String(m === 0 ? !f.expiry : !!start && !!f.expiry && C.lastDayAfter(start, m) === f.expiry));
        });
        document.querySelectorAll('#p-quick-size .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.n === f.size.trim())));
        const n = /^\d+$/.test(f.size.trim()) ? Number(f.size.trim()) : 0, carry = $('p-carry').checked ? Number($('p-carry').dataset.n) || 0 : 0;
        const size = n + carry, m = C.parseMoney(f.price);
        let t = '';
        if (start && (pass || (n >= 1 && n <= C.MAX_SIZE))) {
            const okExp = C.isDate(f.expiry) && f.expiry >= start;
            t = (pass ? 'Unlimited visits' : C.plural(size, 'session') + (carry ? ' (' + n + ' new + ' + carry + ' carried over)' : '')) + ' from ' + C.shortDate(start, today) +
                (okExp ? ' to ' + C.shortDate(f.expiry, today) + ' (' + C.length(start, f.expiry) + ').' : pass ? '.' : ', no expiry.');
            if (!pass && m.cents) t += ' ' + C.money(C.share(m.cents, size), cur) + ' per session.';
        }
        $('p-preview').textContent = t;
    }
    function submitPack(e) {
        e.preventDefault();
        const f = $('f-pack'); clearErrors(f);
        const old = edPack != null ? pack(edPack) : null, lg = loggedFor(edPack);
        const carry = renewFrom != null && $('p-carry').checked ? Number($('p-carry').dataset.n) || 0 : 0;
        const form = packForm();
        if (carry && /^\d+$/.test(form.size.trim())) form.size = String(Number(form.size.trim()) + carry);
        const r = C.readPack(form, today, old, lg.counted, lg.first);
        if (r.errors) {
            showErrors(r.errors, { name: ['p-name', 'pe-name'], size: ['p-size', 'pe-size'], people: ['p-people', 'pe-people'], start: ['p-start', 'pe-start'],
                expiry: ['p-expiry', 'pe-expiry'], price: ['p-price', 'pe-price'], usedBefore: ['p-before', 'pe-before'] });
            return;
        }
        const before = snapshot();
        let id, text;
        if (old) {
            const removed = old.people.filter(n => !r.pack.people.includes(n));
            Object.assign(old, r.pack); id = old.id;
            if (removed.length) state.uses.forEach(u => { if (u.pack === id && removed.includes(u.who)) u.who = ''; });
            text = 'Saved the changes to ' + C.title(old) + '.';
        } else {
            if (state.packs.length >= C.MAX_PACKS) { $('pe-name').textContent = 'You have ' + C.MAX_PACKS + ' packs. Delete some finished ones first.'; return; }
            id = newId();
            state.packs.push(Object.assign({ id, archived: '', added: today }, r.pack, { carried: carry }));
            if (renewFrom != null) { const o = pack(renewFrom); if (o) o.archived = today; text = 'Started the new pack. The old one is in Finished packs.'; }
            else text = 'Added ' + C.title(r.pack) + '. Tap "Went today" after each session.';
        }
        closeAll(); commit();
        show('pack-msg', text + (r.warn ? ' ' + r.warn : ''), before);
        flash(id);
    }

    function openUse(packId, useId) {
        closeAll();
        const p = pack(packId); if (!p) return;
        const u = useId != null ? use(useId) : null;
        usePack = p.id; edUse = u ? u.id : null;
        const f = $('f-use'); f.reset(); clearErrors(f);
        $('du-h').textContent = u ? 'Change this entry' : 'Log a session';
        $('u-pack').textContent = C.title(p);
        $('u-save').textContent = u ? 'Save changes' : 'Save';
        $('u-date').value = u ? u.date : (p.expiry && p.expiry < today ? p.expiry : today);
        const kind = u ? u.kind : 'went';
        f.querySelectorAll('input[name="u-kind"]').forEach(r => { r.checked = r.value === kind; });
        const sel = $('u-who'); sel.textContent = '';
        $('uw-who').hidden = p.people.length < 2;
        if (p.people.length > 1) {
            const o0 = el('option', null, 'Choose who'); o0.value = ''; sel.appendChild(o0);
            p.people.forEach(n => { const o = el('option', null, n); o.value = n; sel.appendChild(o); });
            sel.value = u && u.who ? u.who : '';
        }
        $('u-note').value = u ? u.note : '';
        showPart('uw-note', 'uo-note', !!(u && u.note));
        $('u-edit').hidden = !u;
        $('u-warn').textContent = '';
        openDlg('d-use');
    }
    function submitUse(e) {
        e.preventDefault();
        const f = $('f-use'); clearErrors(f);
        const p = pack(usePack); if (!p) return closeAll();
        const old = edUse != null ? use(edUse) : null;
        const kindEl = f.querySelector('input[name="u-kind"]:checked');
        const r = C.readUse({ date: $('u-date').value, kind: kindEl ? kindEl.value : '', who: $('u-who').value, note: $('uw-note').hidden ? '' : $('u-note').value }, p, today, C.stats(state, p, today), old);
        if (r.errors) { showErrors(r.errors, { date: ['u-date', 'ue-date'], kind: ['u-date', 'ue-kind'], who: ['u-who', 'ue-who'] }); if (r.errors.kind && !r.errors.date) $('ue-kind').scrollIntoView({ block: 'nearest' }); return; }
        const before = snapshot();
        if (old) Object.assign(old, r.use);
        else state.uses.push(Object.assign({ id: newId(), pack: p.id }, r.use));
        closeAll(); commit();
        const s = C.stats(state, p, today);
        const what = r.use.kind === 'off' ? 'Logged a cancelled or excused class on ' + C.shortDate(r.use.date, today) + ' (not counted).'
            : (old ? 'Saved.' : 'Logged ' + (r.use.kind === 'missed' ? 'a missed class' : 'a session') + ' on ' + C.shortDate(r.use.date, today) + '.');
        show('pack-msg', what + (s.unlimited ? ' ' + C.plural(s.used, 'visit') + ' so far.' : ' ' + s.left + ' of ' + p.size + ' left.') + (r.warn ? ' ' + r.warn : ''), before);
        openLogs.add(p.id); renderPacks(); flash(p.id);
    }
    function deleteUse() {
        const u = use(edUse), p = u && pack(u.pack); if (!u) return;
        const before = snapshot();
        state.uses = state.uses.filter(x => x.id !== u.id);
        closeAll(); commit();
        const s = C.stats(state, p, today);
        show('pack-msg', 'Deleted the entry for ' + C.shortDate(u.date, today) + '.' + (s.unlimited ? '' : ' ' + s.left + ' of ' + p.size + ' left.'), before);
    }

    // ---------- wiring ----------
    function init() {
        state = load();
        try { const c = localStorage.getItem(KEY_CUR); if (C.CURRENCIES.includes(c)) cur = c; } catch (e) { /* fine */ }
        const sc = $('s-cur');
        C.CURRENCIES.forEach(c => { const o = el('option', null, c || 'None'); o.value = c; sc.appendChild(o); });
        sc.value = cur;
        sc.addEventListener('change', () => { cur = sc.value; try { localStorage.setItem(KEY_CUR, cur); } catch (e) { /* fine */ } render(); });
        C.COMMON.forEach(n => { const b = el('button', 'chip', n); b.type = 'button'; b.dataset.name = n; $('p-common').appendChild(b); });

        $('add-pack').addEventListener('click', () => openPack(null, null));
        document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeAll()));
        ['d-pack', 'd-use'].forEach(id => $(id).addEventListener('close', () => { if (id === 'd-pack') edPack = renewFrom = null; else usePack = edUse = null; }));

        const fp = $('f-pack');
        fp.addEventListener('submit', submitPack);
        fp.addEventListener('input', preview);
        fp.addEventListener('change', preview);
        $('p-type').addEventListener('change', () => { typeChanged(); if ($('p-type').value === 'pass' && !$('p-expiry').value && C.isDate($('p-start').value)) $('p-expiry').value = C.lastDayAfter($('p-start').value, 1); preview(); });
        $('p-common').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $('p-name').value = b.dataset.name; $('pe-name').textContent = ''; $('p-name').removeAttribute('aria-invalid'); preview(); });
        $('p-quick-size').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $('p-size').value = b.dataset.n; $('pe-size').textContent = ''; $('p-size').removeAttribute('aria-invalid'); preview(); });
        $('p-quick-start').addEventListener('click', e => {
            const b = e.target.closest('.chip'); if (!b) return;
            const was = $('p-start').value, exp = $('p-expiry').value;
            $('p-start').value = C.addDays(today, -Number(b.dataset.ago));
            // keep a chip-made expiry in step with the new first day
            if (C.isDate(was) && C.isDate(exp)) for (const m of [1, 2, 3, 6, 12]) if (C.lastDayAfter(was, m) === exp) { $('p-expiry').value = C.lastDayAfter($('p-start').value, m); break; }
            $('pe-start').textContent = ''; $('p-start').removeAttribute('aria-invalid'); preview();
        });
        $('p-quick-exp').addEventListener('click', e => {
            const b = e.target.closest('.chip'); if (!b) return;
            const m = Number(b.dataset.m), start = C.isDate($('p-start').value) ? $('p-start').value : today;
            if (!C.isDate($('p-start').value)) $('p-start').value = today;
            $('p-expiry').value = m ? C.lastDayAfter(start, m) : '';
            $('pe-expiry').textContent = ''; $('p-expiry').removeAttribute('aria-invalid'); preview();
        });
        $('po-people').addEventListener('click', () => { showPart('pw-people', 'po-people', true); $('p-people').focus(); });
        $('po-price').addEventListener('click', () => { showPart('pw-price', 'po-price', true); $('p-price').focus(); });
        $('po-before').addEventListener('click', () => { showPart('pw-before', 'po-before', true); $('p-before').focus(); });
        $('po-note').addEventListener('click', () => { showPart('pw-note', 'po-note', true); $('p-note').focus(); });
        $('p-name').addEventListener('input', () => {
            const n = $('p-name').value.trim().toLowerCase();
            $('p-warn').textContent = n && renewFrom == null && C.live(state).some(p => p.id !== edPack && p.name.toLowerCase() === n) ? 'You already have an open pack with this name. That is fine, for example one per child; adding who uses it tells them apart.' : '';
        });
        $('p-archive').addEventListener('click', () => { const p = pack(edPack); if (p) setArchived(p.id, !p.archived); });
        $('p-del').addEventListener('click', () => { if (edPack != null) deletePack(edPack); });

        $('f-use').addEventListener('submit', submitUse);
        $('u-quick').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $('u-date').value = C.addDays(today, -Number(b.dataset.ago)); $('ue-date').textContent = ''; $('u-date').removeAttribute('aria-invalid'); });
        $('uo-note').addEventListener('click', () => { showPart('uw-note', 'uo-note', true); $('u-note').focus(); });
        $('u-del').addEventListener('click', deleteUse);

        $('cal').addEventListener('click', () => {
            const r = C.ics(state, today, URL_SELF);
            if (!r.count) { show('set-msg', C.live(state).length ? 'None of your open packs has a last day still to come.' : 'There are no packs yet. Add one first.'); return; }
            download('class-pack-end-dates.ics', 'text/calendar', r.text);
            show('set-msg', 'Saved a calendar file with ' + C.plural(r.count, 'reminder') + '. Open it to add them to your calendar.');
        });
        $('backup').addEventListener('click', () => {
            download('class-packs-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1));
            show('set-msg', 'Saved a backup file with ' + C.plural(state.packs.length, 'pack') + ' and ' + C.plural(state.uses.length, 'log entry').replace('entrys', 'entries') + '.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => {
            const f = e.target.files && e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (f.size > 5e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            const r = new FileReader();
            r.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(String(r.result))); } catch (err) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
                const before = snapshot(); state = s; closeAll(); commit();
                show('set-msg', 'Restored ' + C.plural(s.packs.length, 'pack') + ' and ' + C.plural(s.uses.length, 'log entry').replace('entrys', 'entries') + '.', before);
            };
            r.onerror = () => show('set-msg', 'Could not read that file.');
            r.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.packs.length) { show('set-msg', 'There is nothing to delete.'); return; }
            const before = snapshot(); state = C.emptyState(); closeAll(); commit();
            show('set-msg', 'Deleted everything.', before);
        });
        // a new day while the page stays open
        const tick = () => { if (C.todayIso() !== today) render(); };
        setInterval(tick, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        if (!canSave) $('storage-warn').hidden = false;
        render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
