// Wedding Gift Register and Guest List: the page. The maths and the words are in core.js (window.WGR).
(function () {
    'use strict';
    const W = window.WGR, KEY = 'wedding-gift-register-and-guest-list.state', UIKEY = 'wedding-gift-register-and-guest-list.ui';
    const $ = id => document.getElementById(id);
    const CUR_NAMES = { '': 'None (plain numbers)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '₹': '₹ (rupee)', 'Rs': 'Rs (rupee)', '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₦': '₦ (naira)',
        '₱': '₱ (peso)', 'R': 'R (rand)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '৳': '৳ (taka)',
        '₺': '₺ (lira)', 'R$': 'R$ (real)', 'zł': 'zł (złoty)', '₽': '₽ (ruble)', '₴': '₴ (hryvnia)', 'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)' };
    const MSGS = ['add-msg', 'list-msg', 'tools-msg', 'g-msg'];
    const PAGE = 50;
    let state = W.emptyState(), ui = { view: 'gifts', gEvent: '', gShow: 'all' }, storageOK = true, today = W.dayStr(new Date());
    let undoSnap = null, open = null, editing = null, evOpen = null, shown = PAGE, newAuto = false;
    const evText = { in: '', out: '' }, dateKeep = { in: null, out: null }; // the event and date typed for each choice, kept when switching

    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(cls, text, fn) { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
    const L = () => W.localeFor(state.cur);
    const money = cents => W.fmt(cents, state.cur, L());
    const nice = d => W.niceDate(d, L());
    const famById = id => state.families.find(f => f.id === id);
    const evByName = name => state.events.find(e => W.same(e.name, name));
    function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    // ---------- storage ----------
    function load() {
        state = W.emptyState();
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) { const s = W.normalize(JSON.parse(raw)); if (s) state = s; }
        } catch (e) { state = W.emptyState(); }
        try {
            const u = JSON.parse(localStorage.getItem(UIKEY) || '{}') || {};
            if (u.view === 'guests' || u.view === 'gifts') ui.view = u.view;
            if (typeof u.gEvent === 'string') ui.gEvent = u.gEvent;
            if (['all', 'wait', 'yes', 'no'].includes(u.gShow)) ui.gShow = u.gShow;
        } catch (e) { /* bad or blocked: defaults */ }
        try { localStorage.setItem(KEY + '.test', '1'); localStorage.removeItem(KEY + '.test'); } catch (e) { storageOK = false; }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOK = false; } }
    function saveUi() { try { localStorage.setItem(UIKEY, JSON.stringify(ui)); } catch (e) { /* not saved */ } }
    const snap = () => JSON.stringify(state);
    function commit(before) { undoSnap = before; save(); render(); }

    function say(box, text, withUndo) {
        box.textContent = '';
        if (!text) { box.classList.remove('show'); return; }
        box.classList.add('show');
        box.appendChild(document.createTextNode(text + ' '));
        if (withUndo && undoSnap) {
            const s = undoSnap;
            box.appendChild(btn('link inline undo', 'Undo', () => {
                state = W.normalize(JSON.parse(s)) || W.emptyState(); undoSnap = null; open = null; editing = null; evOpen = null; save(); render(); updateForm();
                MSGS.forEach(id => say($(id), ''));
                say(box, 'Undone.');
            }));
        }
    }
    function clearMsgs(except) { MSGS.forEach(id => { if (id !== except) say($(id), ''); }); }
    function setErr(input, errBox, text) { errBox.textContent = text || ''; input.setAttribute('aria-invalid', text ? 'true' : 'false'); }

    // ---------- which family is meant ----------
    // a typed city decides first (it tells two families with the same name apart); then an exact "Name (City)"; then the name if only one family has it
    function resolveFam(typed, city) {
        const t = W.cleanName(typed); if (!t) return { none: true, name: '' };
        const exact = state.families.find(f => W.same(W.label(f), t)), c = W.clean(city, 40);
        if (c) {
            const r = W.findFamily(state, t, c); if (r.fam) return r;
            if (exact && exact.city) return { fam: exact }; // "Ahmed Khan (Lahore)" picked from the suggestions
            return { none: true, name: t };
        }
        if (exact) return { fam: exact };
        const r = W.findFamily(state, t, '');
        if (r.none) r.name = t;
        return r;
    }

    // ---------- the add form ----------
    const dirNow = () => document.querySelector('input[name=dir]:checked').value;
    const formDate = () => ($('date-box').hidden ? today : ($('date').value || ''));
    const cityTyped = () => ($('more-box').hidden ? '' : $('city').value);

    function fillDatalists() {
        const fl = $('fam-list'); fl.textContent = '';
        state.families.slice().sort((a, b) => W.label(a).localeCompare(W.label(b))).forEach(f => { const o = el('option'); o.value = W.label(f); fl.appendChild(o); });
        const el2 = $('ev-list'); el2.textContent = '';
        const names = dirNow() === 'in' ? W.eventsByDate(state).map(e => e.name)
            : [...new Set(state.gifts.filter(g => g.dir === 'out' && g.event).sort((a, b) => (a.date < b.date ? 1 : -1)).map(g => g.event))];
        names.forEach(n => { const o = el('option'); o.value = n; el2.appendChild(o); });
    }

    function famNote(box, r) {
        box.textContent = '';
        if (r.fam) {
            const f = r.fam, l = W.familyLines(state, f);
            box.appendChild(el('p', 'fn-name', 'Already in your list: ' + W.label(f) + (f.relation ? ', ' + f.relation : '')));
            box.appendChild(el('p', null, l.gave)); box.appendChild(el('p', null, l.you));
            box.appendChild(el('p', 'fn-bal', l.bal));
            if ($('more-box').hidden && box === $('fam-note') && W.same(W.cleanName($('fam').value), f.name)) box.appendChild(el('p', 'fn-tip', 'A different family with the same name? Tap "+ Add relation and city" and type their city.'));
        } else if (r.many) {
            box.appendChild(el('p', null, 'There are ' + r.many.length + ' families called ' + r.many[0].name + ' (' + r.many.map(f => f.city || 'no city').join(', ') + '). Pick one from the suggestions, or add a different city for a new family.'));
        } else if (r.name) {
            box.appendChild(el('p', null, 'New family: ' + r.name + (W.clean(cityTyped(), 40) ? ' (' + W.clean(cityTyped(), 40) + ')' : '') + '. They get their own box below.'));
        }
    }

    function updateForm() {
        const dir = dirNow();
        $('ev-label').textContent = dir === 'in' ? 'At which of your events?' : 'At which of their events?';
        $('ev').placeholder = dir === 'in' ? "e.g. Sara's wedding" : "e.g. Bilal's wedding";
        $('cur-tag').hidden = !state.cur; $('cur-tag').textContent = state.cur;
        const r = resolveFam($('fam').value, cityTyped());
        famNote($('fam-note'), r);
        $('more-open').hidden = !$('more-box').hidden;
        // the event line
        const evName = W.clean($('ev').value, 60), note = $('ev-note');
        if (dir === 'in' && evName) {
            const ev = evByName(evName);
            note.textContent = ev ? 'Adding to ' + ev.name + ': ' + W.eventWords(state, ev.id).replace(/^Received/, 'received') + ' so far.' : 'New event: ' + evName + '. It gets its own total under "Your events".';
        } else note.textContent = '';
        $('date-text').textContent = $('date-box').hidden ? 'today' : ($('date').value ? ($('date').value === today ? 'today' : W.isDay($('date').value) ? nice($('date').value) : 'not set') : 'not set');
        // what it will look like after saving
        const pv = $('preview'), a = W.parseAmount($('amount').value), item = W.clean($('item').value, 80);
        const cents = a.error ? 0 : a.cents;
        if ((!r.fam && !r.name) || r.many || !evName || (!cents && !item)) { pv.textContent = ''; return; }
        const tmp = { cur: state.cur, families: state.families.slice(), events: state.events.slice(), gifts: state.gifts.slice(), guests: [] };
        const fam = r.fam || { id: '_new', name: r.name, city: W.clean(cityTyped(), 40), relation: '' };
        if (!r.fam) tmp.families.push(fam);
        let evId = evName;
        if (dir === 'in') { const ev = evByName(evName); evId = ev ? ev.id : '_newev'; if (!ev) tmp.events.push({ id: '_newev', name: evName }); }
        const dup = dir === 'in' && state.gifts.find(g => g.fam === fam.id && g.dir === 'in' && g.event === evId);
        tmp.gifts.push({ id: '_g', fam: fam.id, dir, event: evId, amount: cents, item, date: formDate() || today, note: '', seq: 1e9 });
        let t = 'After this: ' + W.familyLines(tmp, fam).bal;
        if (dir === 'in') t += ' ' + W.eventOf(tmp, evId).name + ': ' + W.eventWords(tmp, evId).replace(/^Received/, 'received') + '.';
        if (dup) t = W.label(fam) + ' already gave ' + W.giftWhat(dup, state.cur, L()) + ' at this event: this adds a second gift. ' + t;
        pv.textContent = t;
    }

    function saveGift() {
        clearMsgs();
        const dir = dirNow(), r = resolveFam($('fam').value, cityTyped()), evName = W.clean($('ev').value, 60), item = W.clean($('item').value, 80);
        let bad = null;
        setErr($('fam'), $('fam-err'), ''); setErr($('ev'), $('ev-err'), ''); setErr($('amount'), $('amount-err'), ''); setErr($('date'), $('date-err'), '');
        if (r.many) { setErr($('fam'), $('fam-err'), 'Two or more families have this name. Pick one from the suggestions, such as ' + W.label(r.many[0]) + '.'); bad = bad || $('fam'); }
        else if (!r.fam && !r.name) { setErr($('fam'), $('fam-err'), 'Type the name of the family or person.'); bad = bad || $('fam'); }
        if (!evName) { setErr($('ev'), $('ev-err'), dir === 'in' ? "Type the name of your event, such as Sara's wedding." : "Type the name of their event, such as Bilal's wedding."); bad = bad || $('ev'); }
        let cents = 0;
        if (W.clean($('amount').value, 30)) {
            const a = W.parseAmount($('amount').value);
            if (a.error) { setErr($('amount'), $('amount-err'), a.error); bad = bad || $('amount'); } else cents = a.cents;
        } else if (!item) { setErr($('amount'), $('amount-err'), 'Type the cash amount, or tap "+ Add a gift in kind" for gold, clothes or other gifts.'); bad = bad || $('amount'); }
        const date = formDate();
        if (!W.isDay(date)) { setErr($('date'), $('date-err'), 'Choose the date of the event.'); bad = bad || $('date'); }
        else if (date > today) { setErr($('date'), $('date-err'), 'That date is in the future. Choose the day the gift was given.'); bad = bad || $('date'); }
        if (bad) { if (bad === $('date')) { $('date-box').hidden = false; $('date-open').hidden = true; } bad.focus(); return; }

        const before = snap();
        let fam = r.fam;
        if (!fam) { fam = { id: newId('f'), name: r.name, relation: W.clean($('rel').value, 40), city: W.clean(cityTyped(), 40) }; state.families.push(fam); }
        let evId = evName;
        if (dir === 'in') { let ev = evByName(evName); if (!ev) { ev = { id: newId('e'), name: evName }; state.events.push(ev); } evId = ev.id; if (!ui.gEvent) { ui.gEvent = ev.id; saveUi(); } }
        state.seq++;
        state.gifts.push({ id: newId('g'), fam: fam.id, dir, event: evId, amount: cents, item, date, note: W.clean($('note').value, 200), seq: state.seq });
        commit(before);
        const what = W.giftWhat({ amount: cents, item }, state.cur, L());
        say($('add-msg'), 'Saved: ' + (dir === 'in' ? W.label(fam) + ' gave you ' + what + ' at ' + evName : 'you gave ' + W.label(fam) + ' ' + what + ' at ' + evName) + '.', true);
        // ready for the next envelope: same choice, event and date
        ['fam', 'rel', 'city', 'amount', 'item', 'note'].forEach(id => { $(id).value = ''; });
        $('more-box').hidden = true; $('item-box').hidden = true; $('item-open').hidden = false; $('note-box').hidden = true; $('note-open').hidden = false;
        updateForm(); $('fam').focus();
    }

    // ---------- your events ----------
    function eventPanel(ev, host, after) {
        host.textContent = '';
        const s = W.eventSummary(state, ev.id);
        host.appendChild(el('h3', null, 'Rename or delete ' + ev.name));
        const lab = el('label', null, 'Name of the event'), inp = el('input'), err = el('p', 'err');
        const id = 'evn-' + ev.id; lab.htmlFor = id; inp.id = id; inp.type = 'text'; inp.maxLength = 60; inp.value = ev.name; inp.autocomplete = 'off'; err.setAttribute('role', 'alert');
        host.append(lab, inp, err);
        const rename = () => {
            const n = W.clean(inp.value, 60);
            if (!n) { err.textContent = 'Type a name for the event.'; return inp.focus(); }
            const other = evByName(n); if (other && other.id !== ev.id) { err.textContent = 'You already have an event called ' + other.name + '.'; return inp.focus(); }
            const before = snap(); ev.name = n; evOpen = null; commit(before); after('Renamed to ' + n + '.');
        };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); rename(); } if (e.key === 'Escape') { evOpen = null; render(); } });
        const row = el('div', 'row-btns');
        row.append(btn('primary small', 'Save name', rename), btn('secondary small', 'Cancel', () => { evOpen = null; render(); }));
        host.appendChild(row);
        const parts = [];
        if (s.gifts.length) parts.push(W.plural(s.gifts.length, 'gift', 'gifts'));
        if (s.guests) parts.push('its guest list of ' + W.plural(s.guests, 'family', 'families'));
        host.appendChild(btn('danger', parts.length ? 'Delete this event, ' + parts.join(' and ') : 'Delete this event', () => {
            const before = snap();
            state.events = state.events.filter(e => e.id !== ev.id);
            state.gifts = state.gifts.filter(g => !(g.dir === 'in' && g.event === ev.id));
            state.guests = state.guests.filter(x => x.event !== ev.id);
            if (ui.gEvent === ev.id) { ui.gEvent = ''; saveUi(); }
            evOpen = null; commit(before); after('Deleted ' + ev.name + '.');
        }));
        inp.focus({ preventScroll: true });
    }

    function renderEvents() {
        const box = $('events'); box.textContent = '';
        const list = W.eventsByDate(state);
        $('ev-empty').hidden = list.length > 0;
        list.forEach(ev => {
            const s = W.eventSummary(state, ev.id), card = el('div', 'ev');
            card.dataset.id = ev.id;
            const h = el('p', 'ev-name', ev.name + ' ');
            if (s.date) h.appendChild(el('span', 'ev-date', '· ' + nice(s.date)));
            card.appendChild(h);
            card.appendChild(el('p', 'ev-words', W.eventWords(state, ev.id)));
            const sub = [];
            if (s.families > s.cashFamilies) sub.push(W.plural(s.families, 'family', 'families') + ' gave in all, cash or gifts in kind');
            if (s.guests) { const gs = W.guestSummary(state, ev.id); sub.push('Guest list: ' + W.plural(gs.all.f, 'family', 'families') + ', ' + W.plural(gs.yes.p, 'person', 'people') + ' coming'); }
            if (sub.length) card.appendChild(el('p', 'ev-sub', sub.join(' · ')));
            const row = el('div', 'row-btns');
            const cp = btn('secondary small', 'Copy list', () => { clearMsgs('list-msg'); s.gifts.length ? copyText(W.eventText(state, ev.id, L()), $('list-msg')) : say($('list-msg'), 'No gifts at ' + ev.name + ' yet.'); });
            cp.setAttribute('aria-label', 'Copy the list of gifts at ' + ev.name);
            const rn = btn('secondary small', 'Rename or delete', () => { evOpen = evOpen === ev.id ? null : ev.id; render(); });
            rn.setAttribute('aria-label', 'Rename or delete ' + ev.name); rn.setAttribute('aria-expanded', String(evOpen === ev.id));
            row.append(cp, rn); card.appendChild(row);
            if (evOpen === ev.id) { const p = el('div', 'panel'); card.appendChild(p); eventPanel(ev, p, m => say($('list-msg'), m, true)); }
            box.appendChild(card);
        });
        const t = W.totals(state), all = $('t-all');
        all.hidden = !state.gifts.length;
        all.textContent = 'In all: received ' + money(t.received) + ' at your events, and given ' + money(t.given) + ' at other families\' events.';
    }

    // ---------- the families ----------
    function line(text) {
        const p = el('p', 'p-line'), i = text.indexOf(': ');
        if (i < 0) { p.textContent = text; return p; }
        p.appendChild(el('b', null, text.slice(0, i + 1))); p.appendChild(document.createTextNode(' ' + text.slice(i + 2)));
        return p;
    }
    function famBox(f) {
        const l = W.familyLines(state, f), s = W.familySummary(state, f), box = el('article', 'person ' + l.tone);
        box.dataset.id = f.id;
        box.appendChild(el('h3', 'p-name', W.label(f)));
        if (f.relation) box.appendChild(el('p', 'p-meta', f.relation));
        box.appendChild(line(l.gave)); box.appendChild(line(l.you));
        box.appendChild(el('p', 'p-bal', l.bal));
        const b = el('div', 'p-btns');
        const add = btn('secondary', 'Add for ' + W.label(f), () => addFor(f));
        const hi = btn('secondary', 'History (' + s.gifts.length + ')', () => { open = open && open.fid === f.id && open.what === 'hist' ? null : { fid: f.id, what: 'hist' }; editing = null; render(); focusPanel(f.id); });
        hi.setAttribute('aria-expanded', String(!!(open && open.fid === f.id && open.what === 'hist')));
        const ed = btn('secondary', 'Edit family', () => { open = open && open.fid === f.id && open.what === 'edit' ? null : { fid: f.id, what: 'edit' }; editing = null; render(); focusPanel(f.id); });
        ed.setAttribute('aria-expanded', String(!!(open && open.fid === f.id && open.what === 'edit')));
        const del = btn('secondary', 'Delete family', () => {
            const before = snap();
            state.families = state.families.filter(x => x.id !== f.id); state.gifts = state.gifts.filter(g => g.fam !== f.id); state.guests = state.guests.filter(x => x.fam !== f.id);
            open = null; commit(before); clearMsgs(); say($('list-msg'), 'Deleted ' + W.label(f) + ' and ' + W.plural(s.gifts.length, 'gift', 'gifts') + '.', true); updateForm();
        });
        [add, hi, ed, del].forEach(x => x.setAttribute('aria-describedby', 'fn-' + f.id));
        box.querySelector('.p-name').id = 'fn-' + f.id;
        b.append(add, hi, ed, del); box.appendChild(b);
        if (open && open.fid === f.id) box.appendChild(open.what === 'hist' ? histPanel(f, s) : famEditPanel(f));
        return box;
    }
    function focusPanel(fid) { const p = document.querySelector('.person[data-id="' + fid + '"] .panel'); if (p) { const t = p.querySelector('input, button'); if (t) t.focus({ preventScroll: true }); p.scrollIntoView({ block: 'nearest' }); } }
    function addFor(f) {
        $('fam').value = W.label(f); $('more-box').hidden = true; setErr($('fam'), $('fam-err'), '');
        updateForm(); $('add').scrollIntoView({ block: 'start', behavior: 'smooth' }); $('amount').focus({ preventScroll: true });
    }
    function field(labelText, input, id) { const w = el('div', 'field'), l = el('label', null, labelText); input.id = id; l.htmlFor = id; w.append(l, input); const e = el('p', 'err'); e.setAttribute('role', 'alert'); w.appendChild(e); w.err = e; return w; }
    function textInput(value, max, ph) { const i = el('input'); i.type = 'text'; i.maxLength = max; i.value = value || ''; i.autocomplete = 'off'; if (ph) i.placeholder = ph; return i; }

    function famEditPanel(f) {
        const p = el('div', 'panel');
        p.appendChild(el('h3', null, 'Edit family'));
        const n = textInput(f.name, 60), r = textInput(f.relation, 40, 'e.g. cousin'), c = textInput(f.city, 40, 'e.g. Lahore');
        const fn = field('Name', n, 'fe-n-' + f.id), fr = field('Relation (optional)', r, 'fe-r-' + f.id), fc = field('City (optional)', c, 'fe-c-' + f.id);
        p.append(fn, fr, fc);
        const go = () => {
            const name = W.cleanName(n.value), city = W.clean(c.value, 40);
            if (!name) { fn.err.textContent = 'Type a name.'; return n.focus(); }
            const lab = W.label({ name, city }), other = state.families.find(x => x.id !== f.id && W.same(W.label(x), lab));
            if (other) { fn.err.textContent = 'There is already a family called ' + lab + '. Add or change the city to tell them apart.'; return n.focus(); }
            const before = snap(); f.name = name; f.relation = W.clean(r.value, 40); f.city = city; open = null; commit(before);
            say($('list-msg'), 'Saved ' + W.label(f) + '.', true); updateForm();
        };
        [n, r, c].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } if (e.key === 'Escape') { open = null; render(); } }));
        const row = el('div', 'row-btns'); row.append(btn('primary small', 'Save', go), btn('secondary small', 'Cancel', () => { open = null; render(); }));
        p.appendChild(row);
        return p;
    }

    function histPanel(f, s) {
        const p = el('div', 'panel');
        p.appendChild(el('h3', null, 'Every gift with ' + W.label(f)));
        if (!s.gifts.length) { p.appendChild(el('p', 'p-meta', 'No gifts yet.')); return p; }
        const ul = el('ul', 'hist');
        s.gifts.slice().reverse().forEach(g => {
            const li = el('li', 'h-row');
            if (editing === g.id) { li.className = 'h-row h-edit'; li.appendChild(giftEditor(f, g)); ul.appendChild(li); return; }
            const m = el('div', 'h-main');
            m.appendChild(el('div', 'h-dir', g.dir === 'in' ? 'They gave you' : 'You gave them'));
            m.appendChild(el('div', 'h-what', W.giftWhat(g, state.cur, L())));
            m.appendChild(el('div', 'h-sub', W.eventName(state, g) + ' · ' + nice(g.date) + (g.note ? ' · ' + g.note : '')));
            const bs = el('div', 'h-btns');
            const e1 = btn('secondary small', 'Edit', () => { editing = g.id; render(); const i = document.querySelector('.h-edit input'); if (i) i.focus(); });
            const d1 = btn('secondary small', 'Delete', () => {
                const before = snap(); state.gifts = state.gifts.filter(x => x.id !== g.id); commit(before);
                say($('list-msg'), 'Deleted the gift of ' + W.giftWhat(g, state.cur, L()) + '.', true); updateForm();
            });
            e1.setAttribute('aria-label', 'Edit the gift of ' + W.giftWhat(g, state.cur, L()) + ' on ' + nice(g.date));
            d1.setAttribute('aria-label', 'Delete the gift of ' + W.giftWhat(g, state.cur, L()) + ' on ' + nice(g.date));
            bs.append(e1, d1); li.append(m, bs); ul.appendChild(li);
        });
        p.appendChild(ul);
        return p;
    }

    function giftEditor(f, g) {
        const box = el('div');
        const fs = el('fieldset', 'kinds'), lg = el('legend', null, 'What happened?'); fs.appendChild(lg);
        const nm = 'ed-dir-' + g.id;
        [['in', 'They gave us'], ['out', 'We gave them']].forEach(([v, t]) => {
            const lab = el('label', 'kind'), r = el('input'); r.type = 'radio'; r.name = nm; r.value = v; r.checked = g.dir === v;
            lab.append(r, el('span', null, t)); fs.appendChild(lab);
        });
        const ev = textInput(W.eventName(state, g), 60), am = textInput(g.amount ? (g.amount / 100).toFixed(g.amount % 100 ? 2 : 0) : '', 24), it = textInput(g.item, 80, 'e.g. gold ring');
        const dt = el('input'); dt.type = 'date'; dt.value = g.date; dt.max = today;
        const nt = textInput(g.note, 200);
        am.inputMode = 'decimal';
        const fe = field('Event', ev, 'ed-ev-' + g.id), fa = field('Cash amount', am, 'ed-am-' + g.id), fi = field('Gift in kind (optional)', it, 'ed-it-' + g.id),
            fd = field('Date', dt, 'ed-dt-' + g.id), fn = field('Note (optional)', nt, 'ed-nt-' + g.id);
        box.append(fs, fe, fa, fi, fd, fn);
        const go = () => {
            [fe, fa, fd].forEach(x => { x.err.textContent = ''; });
            const dir = box.querySelector('input[name="' + nm + '"]:checked').value, evName = W.clean(ev.value, 60), item = W.clean(it.value, 80);
            let cents = 0, bad = null;
            if (!evName) { fe.err.textContent = 'Type the event.'; bad = bad || ev; }
            if (W.clean(am.value, 30)) { const a = W.parseAmount(am.value); if (a.error) { fa.err.textContent = a.error; bad = bad || am; } else cents = a.cents; }
            else if (!item) { fa.err.textContent = 'Type the cash amount or a gift in kind.'; bad = bad || am; }
            if (!W.isDay(dt.value)) { fd.err.textContent = 'Choose a date.'; bad = bad || dt; } else if (dt.value > today) { fd.err.textContent = 'That date is in the future.'; bad = bad || dt; }
            if (bad) return bad.focus();
            const before = snap();
            let evId = evName;
            if (dir === 'in') { let e = evByName(evName); if (!e) { e = { id: newId('e'), name: evName }; state.events.push(e); } evId = e.id; }
            Object.assign(g, { dir, event: evId, amount: cents, item, date: dt.value, note: W.clean(nt.value, 200) });
            // an event of ours with no gifts and no guest list left is dropped
            state.events = state.events.filter(e => state.gifts.some(x => x.dir === 'in' && x.event === e.id) || state.guests.some(x => x.event === e.id));
            editing = null; commit(before); say($('list-msg'), 'Saved the change.', true); updateForm();
        };
        [ev, am, it, dt, nt].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } if (e.key === 'Escape') { editing = null; render(); } }));
        const row = el('div', 'row-btns'); row.append(btn('primary small', 'Save', go), btn('secondary small', 'Cancel', () => { editing = null; render(); }));
        box.appendChild(row);
        return box;
    }

    function renderFamilies() {
        const box = $('fams'); box.textContent = '';
        const q = $('find').value, all = W.sortFamilies(state, state.sort), list = all.filter(f => W.matches(state, f, q));
        $('empty').hidden = state.families.length > 0;
        $('sort-wrap').hidden = state.families.length < 2; $('find-wrap').hidden = state.families.length < 2;
        $('sort').value = state.sort;
        $('found').textContent = W.clean(q, 60) ? (list.length ? W.plural(list.length, 'family matches', 'families match') + ' "' + W.clean(q, 60) + '".' : 'No family matches "' + W.clean(q, 60) + '". Check the spelling, or add them as a new family.') : '';
        if (open && !list.slice(0, shown).some(f => f.id === open.fid)) { const i = list.findIndex(f => f.id === open.fid); if (i >= 0) shown = Math.max(shown, i + 1); }
        list.slice(0, shown).forEach(f => box.appendChild(famBox(f)));
        const more = list.length - shown;
        $('show-more').hidden = more <= 0;
        $('show-more').textContent = 'Show ' + Math.min(more, PAGE) + ' more (' + W.plural(more, 'family', 'families') + ' not shown)';
    }

    // ---------- guest list ----------
    function currentEvent() {
        let ev = W.eventOf(state, ui.gEvent);
        if (!ev) { ev = W.eventsByDate(state)[0] || null; ui.gEvent = ev ? ev.id : ''; }
        return ev;
    }
    function renderGuests() {
        const ev = currentEvent(), sel = $('g-event');
        sel.textContent = '';
        W.eventsByDate(state).forEach(e => { const o = el('option', null, e.name); o.value = e.id; sel.appendChild(o); });
        $('g-pick').hidden = !ev; $('g-body').hidden = !ev;
        if (!ev) { $('g-new-box').hidden = false; $('g-new-open').hidden = true; $('g-new-cancel').hidden = true; newAuto = true; return; }
        if (newAuto) { newAuto = false; if (!W.clean($('g-new').value, 60)) { $('g-new-box').hidden = true; setErr($('g-new'), $('g-new-err'), ''); } }
        $('g-new-cancel').hidden = false; if ($('g-new-box').hidden) $('g-new-open').hidden = false;
        sel.value = ev.id;
        const c = W.guestSummary(state, ev.id), ppl = n => W.plural(n, 'person', 'people'), fam = n => W.plural(n, 'family', 'families');
        $('gt-yes').textContent = c.yes.p.toLocaleString('en'); $('gt-yes-f').textContent = (c.yes.p === 1 ? 'person, ' : 'people, ') + fam(c.yes.f);
        $('gt-wait').textContent = c.wait.p.toLocaleString('en'); $('gt-wait-f').textContent = (c.wait.p === 1 ? 'person, ' : 'people, ') + fam(c.wait.f);
        $('gt-no').textContent = c.no.p.toLocaleString('en'); $('gt-no-f').textContent = (c.no.p === 1 ? 'person, ' : 'people, ') + fam(c.no.f);
        $('g-words').textContent = W.guestWords(state, ev.id) + (c.all.f ? ' ' + c.gave + ' of the invited families gave a gift at ' + ev.name + '.' : '');
        $('g-ev-open').textContent = 'Rename or delete ' + ev.name;
        $('g-ev-box').hidden = evOpen !== 'g:' + ev.id;
        if (evOpen === 'g:' + ev.id) eventPanel(ev, $('g-ev-box'), m => say($('g-msg'), m, true)); else $('g-ev-box').textContent = '';
        $('g-show').value = ui.gShow;
        const F = {}; state.families.forEach(f => { F[f.id] = f; });
        const all = state.guests.filter(x => x.event === ev.id), list = all.filter(x => ui.gShow === 'all' || x.status === ui.gShow)
            .sort((a, b) => W.label(F[a.fam]).localeCompare(W.label(F[b.fam]), undefined, { sensitivity: 'base' }));
        $('g-list-h').textContent = 'Invited (' + fam(all.length) + ', ' + ppl(c.all.p) + ')';
        $('g-empty').hidden = list.length > 0;
        $('g-empty').textContent = all.length ? 'No family is marked "' + W.STATUS[ui.gShow] + '". Choose Everyone to see the whole list.' : 'Nobody on this guest list yet. Add the first family on the left, or tap "Add every family in the register".';
        const box = $('glist'); box.textContent = '';
        const gaveAt = {}; state.gifts.forEach(g => { if (g.dir === 'in' && g.event === ev.id) (gaveAt[g.fam] = gaveAt[g.fam] || []).push(g); });
        list.forEach(x => {
            const f = F[x.fam], row = el('div', 'guest ' + x.status);
            const nm = el('h4', 'g-nm', W.label(f)); nm.id = 'gn-' + x.id; row.appendChild(nm);
            const meta = el('p', 'g-meta');
            if (f.relation) meta.appendChild(document.createTextNode(f.relation + (gaveAt[x.fam] ? ' · ' : '')));
            if (gaveAt[x.fam]) meta.appendChild(el('span', 'g-gave', 'Gave ' + gaveAt[x.fam].map(g => W.giftWhat(g, state.cur, L())).join(' + ') + ' here'));
            if (meta.childNodes.length) row.appendChild(meta);
            const ctl = el('div', 'g-ctl'), st = el('div', 'stepper');
            const setN = (d, key) => { const n = Math.min(999, Math.max(1, x.n + d)); if (n === x.n) return; x.n = n; save(); renderAll(); refocus(key); };
            const minus = btn('', '−', () => setN(-1, 'm-' + x.id)), plus = btn('', '+', () => setN(1, 'p-' + x.id));
            minus.dataset.k = 'm-' + x.id; plus.dataset.k = 'p-' + x.id;
            minus.setAttribute('aria-label', 'One person fewer from ' + W.label(f)); plus.setAttribute('aria-label', 'One more person from ' + W.label(f));
            minus.disabled = x.n <= 1; plus.disabled = x.n >= 999;
            const out = el('output', null, W.plural(x.n, 'person', 'people')); out.setAttribute('aria-live', 'polite');
            st.append(minus, out, plus); ctl.appendChild(st);
            const seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-labelledby', nm.id);
            [['wait', 'No reply yet'], ['yes', 'Coming'], ['no', 'Not coming']].forEach(([v, t]) => {
                const b = btn('s-' + v, t, () => { if (x.status === v) return; x.status = v; save(); renderAll(); refocus('s-' + v + '-' + x.id); });
                b.dataset.k = 's-' + v + '-' + x.id; b.setAttribute('aria-pressed', String(x.status === v)); seg.appendChild(b);
            });
            ctl.appendChild(seg);
            const rm = btn('secondary small g-rm', 'Remove', () => {
                const before = snap(); state.guests = state.guests.filter(y => y.id !== x.id); commit(before);
                say($('g-msg'), 'Took ' + W.label(f) + ' off the guest list.', true);
            });
            rm.setAttribute('aria-label', 'Remove ' + W.label(f) + ' from the guest list');
            ctl.appendChild(rm);
            row.appendChild(ctl); box.appendChild(row);
        });
    }
    function refocus(key) { const b = document.querySelector('[data-k="' + key + '"]'); if (b && !b.disabled) b.focus({ preventScroll: true }); else { const o = document.querySelector('[data-k^="' + key.split('-')[0] + '-"]'); if (o) o.focus({ preventScroll: true }); } }

    function addGuest() {
        clearMsgs();
        const ev = currentEvent(); if (!ev) return;
        setErr($('g-fam'), $('g-fam-err'), ''); $('g-n').setAttribute('aria-invalid', 'false');
        const r = resolveFam($('g-fam').value, '');
        if (!r.fam && !r.name && !r.many) { setErr($('g-fam'), $('g-fam-err'), 'Type the name of the family or person.'); return $('g-fam').focus(); }
        if (r.many) { setErr($('g-fam'), $('g-fam-err'), 'Two or more families have this name. Pick one from the suggestions, such as ' + W.label(r.many[0]) + '.'); return $('g-fam').focus(); }
        const nt = W.clean($('g-n').value, 5);
        const n = nt === '' ? 1 : /^\d{1,3}$/.test(nt) ? Number(nt) : NaN;
        if (!(n >= 1 && n <= 999)) { $('g-fam-err').textContent = 'Type how many people, from 1 to 999.'; $('g-n').setAttribute('aria-invalid', 'true'); return $('g-n').focus(); }
        if (r.fam && state.guests.some(x => x.event === ev.id && x.fam === r.fam.id)) { setErr($('g-fam'), $('g-fam-err'), W.label(r.fam) + ' is already on this guest list.'); return $('g-fam').focus(); }
        const before = snap();
        let fam = r.fam;
        if (!fam) { fam = { id: newId('f'), name: r.name, relation: '', city: '' }; state.families.push(fam); }
        state.guests.push({ id: newId('x'), event: ev.id, fam: fam.id, n, status: 'wait' });
        if (ui.gShow !== 'all' && ui.gShow !== 'wait') { ui.gShow = 'all'; saveUi(); }
        commit(before);
        say($('g-msg'), 'Added ' + W.label(fam) + ' (' + W.plural(n, 'person', 'people') + ')' + (r.fam ? '' : ', a new family') + '.', true);
        $('g-fam').value = ''; $('g-n').value = '1'; $('g-fam').focus();
    }

    function renderAll() { renderEvents(); renderFamilies(); renderGuests(); fillDatalists(); }
    function render() {
        renderAll();
        $('cur').value = state.cur;
        const g = ui.view === 'guests';
        $('app').classList.toggle('view-gifts', !g); $('app').classList.toggle('view-guests', g);
        $('guests').hidden = !g;
        $('tab-gifts').setAttribute('aria-pressed', String(!g)); $('tab-guests').setAttribute('aria-pressed', String(g));
    }

    // ---------- share, print, backup ----------
    async function copyText(text, box) {
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px'; document.body.appendChild(t); t.select();
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        }
        say(box, ok ? 'Copied. Paste it into a message, note or email.' : 'Could not copy here. Select the text and copy it by hand.');
    }
    const mailto = (subject, body) => 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body.length > 1800 ? body.slice(0, 1800) + '\n...' : body);
    function table(r, heads, rows) {
        const tb = el('table'), th = el('thead'), hr = el('tr');
        heads.forEach(x => hr.appendChild(el('th', null, x))); th.appendChild(hr); tb.appendChild(th);
        const body = el('tbody');
        rows.forEach(cells => { const tr = el('tr'); cells.forEach(v => tr.appendChild(el('td', null, v))); body.appendChild(tr); });
        tb.appendChild(body); r.appendChild(tb);
    }
    function buildReport(mode) {
        const r = $('report'); r.textContent = '';
        const F = {}; state.families.forEach(f => { F[f.id] = f; });
        const byLab = (a, b) => W.label(F[a.fam]).localeCompare(W.label(F[b.fam]));
        if (mode === 'guests') {
            const ev = currentEvent(); if (!ev) return;
            r.appendChild(el('h2', null, 'Guest list for ' + ev.name));
            r.appendChild(el('p', null, W.guestWords(state, ev.id)));
            table(r, ['Family', 'People', 'Reply'], state.guests.filter(x => x.event === ev.id).sort(byLab).map(x => [W.label(F[x.fam]), String(x.n), W.STATUS[x.status]]));
            return;
        }
        const t = W.totals(state);
        r.appendChild(el('h2', null, 'Gift register'));
        r.appendChild(el('p', null, nice(today) + '. Received in all: ' + money(t.received) + '. Given in all: ' + money(t.given) + '.'));
        W.eventsByDate(state).forEach(ev => {
            const s = W.eventSummary(state, ev.id); if (!s.gifts.length) return;
            r.appendChild(el('h3', null, ev.name + (s.date ? ', ' + nice(s.date) : '') + ': ' + W.eventWords(state, ev.id)));
            table(r, ['Family', 'Relation', 'Gift', 'Note'], s.gifts.slice().sort(byLab).map(g => [W.label(F[g.fam]), F[g.fam].relation, W.giftWhat(g, state.cur, L()), g.note]));
        });
        r.appendChild(el('h3', null, 'Every family'));
        table(r, ['Family', 'Gave you', 'You gave them', 'Difference'], W.sortFamilies(state, 'name').map(f => {
            const l = W.familyLines(state, f); return [W.label(f) + (f.relation ? ', ' + f.relation : ''), l.gave.replace(/^Gave you: /, ''), l.you.replace(/^You gave them: /, ''), l.bal];
        }));
    }
    function download(name, text) {
        const blob = new Blob([text], { type: 'application/json' }), a = el('a');
        a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    const empty = () => !state.families.length && !state.events.length;

    function setView(v) { ui.view = v; saveUi(); clearMsgs(); render(); }

    function wire() {
        const sel = $('cur');
        W.SYMBOLS.forEach(s => { const o = el('option', null, CUR_NAMES[s] || s); o.value = s; sel.appendChild(o); });
        $('date').value = today; $('date').max = today;
        $('tab-gifts').addEventListener('click', () => setView('gifts'));
        $('tab-guests').addEventListener('click', () => setView('guests'));
        document.querySelectorAll('input[name=dir]').forEach(r => r.addEventListener('change', () => {
            const was = r.value === 'in' ? 'out' : 'in';
            evText[was] = $('ev').value; $('ev').value = evText[r.value];
            dateKeep[was] = $('date-box').hidden ? null : $('date').value;
            const d = dateKeep[r.value]; $('date-box').hidden = d == null; $('date-open').hidden = d != null; $('date').value = d == null ? today : d;
            setErr($('ev'), $('ev-err'), ''); setErr($('date'), $('date-err'), ''); fillDatalists(); updateForm();
        }));
        $('fam').addEventListener('input', () => { setErr($('fam'), $('fam-err'), ''); updateForm(); });
        $('ev').addEventListener('input', () => { setErr($('ev'), $('ev-err'), ''); updateForm(); });
        $('amount').addEventListener('input', () => { setErr($('amount'), $('amount-err'), ''); updateForm(); });
        ['item', 'city', 'rel'].forEach(id => $(id).addEventListener('input', () => { setErr($('amount'), $('amount-err'), ''); updateForm(); }));
        ['fam', 'ev', 'amount', 'item', 'note', 'rel', 'city'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveGift(); } }));
        $('save').addEventListener('click', saveGift);
        $('more-open').addEventListener('click', () => { $('more-box').hidden = false; $('more-open').hidden = true; $('rel').focus(); updateForm(); });
        $('item-open').addEventListener('click', () => { $('item-box').hidden = false; $('item-open').hidden = true; $('item').focus(); });
        $('note-open').addEventListener('click', () => { $('note-box').hidden = false; $('note-open').hidden = true; $('note').focus(); });
        $('date-open').addEventListener('click', () => { $('date-box').hidden = false; $('date-open').hidden = true; $('date').max = today; if (!$('date').value) $('date').value = today; $('date').focus(); updateForm(); });
        $('date-today').addEventListener('click', () => { $('date').value = today; $('date-box').hidden = true; $('date-open').hidden = false; setErr($('date'), $('date-err'), ''); updateForm(); $('date-open').focus(); });
        $('date').addEventListener('input', () => { setErr($('date'), $('date-err'), ''); updateForm(); });

        $('sort').addEventListener('change', () => { state.sort = $('sort').value; save(); renderFamilies(); });
        $('find').addEventListener('input', () => { shown = PAGE; renderFamilies(); });
        $('show-more').addEventListener('click', () => { shown += PAGE; renderFamilies(); });
        $('cur').addEventListener('change', () => { state.cur = $('cur').value; save(); render(); updateForm(); });

        // guest list
        $('g-event').addEventListener('change', () => { ui.gEvent = $('g-event').value; evOpen = null; saveUi(); clearMsgs(); renderGuests(); });
        $('g-show').addEventListener('change', () => { ui.gShow = $('g-show').value; saveUi(); renderGuests(); });
        $('g-new-open').addEventListener('click', () => { $('g-new-box').hidden = false; $('g-new-open').hidden = true; $('g-new').focus(); });
        $('g-new-cancel').addEventListener('click', () => { $('g-new-box').hidden = true; $('g-new').value = ''; setErr($('g-new'), $('g-new-err'), ''); $('g-new-open').hidden = false; $('g-new-open').focus(); });
        const createEvent = () => {
            const n = W.clean($('g-new').value, 60);
            if (!n) { setErr($('g-new'), $('g-new-err'), "Type a name, such as Sara's wedding."); return $('g-new').focus(); }
            const ex = evByName(n);
            if (ex) { setErr($('g-new'), $('g-new-err'), 'You already have ' + ex.name + '. Choose it under "For which event?".'); return $('g-new').focus(); }
            const before = snap(), ev = { id: newId('e'), name: n }; state.events.push(ev); ui.gEvent = ev.id; saveUi();
            $('g-new').value = ''; $('g-new-box').hidden = true; setErr($('g-new'), $('g-new-err'), '');
            commit(before); say($('g-msg'), 'Created ' + n + '. Add the first family below.', true); $('g-fam').focus();
        };
        $('g-new-save').addEventListener('click', createEvent);
        $('g-new').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); createEvent(); } });
        $('g-add').addEventListener('click', addGuest);
        ['g-fam', 'g-n'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addGuest(); } }));
        $('g-fam').addEventListener('input', () => setErr($('g-fam'), $('g-fam-err'), ''));
        $('g-all').addEventListener('click', () => {
            clearMsgs(); const ev = currentEvent(); if (!ev) return;
            const have = new Set(state.guests.filter(x => x.event === ev.id).map(x => x.fam)), add = state.families.filter(f => !have.has(f.id));
            if (!add.length) return say($('g-msg'), state.families.length ? 'Every family in the register is already on this guest list.' : 'The register is empty. Add families on the Gifts page, or type them here.');
            const before = snap();
            add.forEach(f => state.guests.push({ id: newId('x'), event: ev.id, fam: f.id, n: 1, status: 'wait' }));
            commit(before); say($('g-msg'), 'Added ' + W.plural(add.length, 'family', 'families') + ' with 1 person each. Set the number of people in each box.', true);
        });
        $('g-copy').addEventListener('click', () => { clearMsgs('g-msg'); const ev = currentEvent(); if (!ev) return; state.guests.some(x => x.event === ev.id) ? copyText(W.guestText(state, ev.id, L()), $('g-msg')) : say($('g-msg'), 'This guest list is empty.'); });
        $('g-print').addEventListener('click', () => { clearMsgs('g-msg'); const ev = currentEvent(); if (!ev) return; if (!state.guests.some(x => x.event === ev.id)) return say($('g-msg'), 'This guest list is empty.'); buildReport('guests'); window.print(); });
        $('g-ev-open').addEventListener('click', () => { const ev = currentEvent(); if (!ev) return; evOpen = evOpen === 'g:' + ev.id ? null : 'g:' + ev.id; renderGuests(); });

        // share and backup
        $('copy-all').addEventListener('click', () => { clearMsgs('tools-msg'); state.families.length ? copyText(W.registerText(state, L(), today), $('tools-msg')) : say($('tools-msg'), 'The register is empty.'); });
        $('email-all').addEventListener('click', () => { clearMsgs('tools-msg'); if (!state.families.length) return say($('tools-msg'), 'The register is empty.'); location.href = mailto('Gift register', W.registerText(state, L(), today)); });
        $('print-all').addEventListener('click', () => { clearMsgs('tools-msg'); if (!state.families.length) return say($('tools-msg'), 'The register is empty.'); buildReport('all'); window.print(); });
        $('backup').addEventListener('click', () => {
            clearMsgs('tools-msg');
            if (empty()) return say($('tools-msg'), 'There is nothing to back up yet.');
            download('wedding-gift-register-backup-' + today + '.json', JSON.stringify(Object.assign({ app: 'wedding-gift-register-and-guest-list', saved: today }, state), null, 1));
            say($('tools-msg'), 'Backup saved to your downloads: ' + W.plural(state.families.length, 'family', 'families') + ', ' + W.plural(state.gifts.length, 'gift', 'gifts') + ' and ' + W.plural(state.guests.length, 'guest list entry', 'guest list entries') + '.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', async () => {
            clearMsgs('tools-msg');
            const file = $('restore-file').files[0]; $('restore-file').value = '';
            if (!file) return;
            if (file.size > 10e6) return say($('tools-msg'), 'That file is too big to be a backup from this app.');
            let s = null;
            try { const raw = JSON.parse(await file.text()); s = raw && raw.app === 'wedding-gift-register-and-guest-list' ? W.normalize(raw) : null; } catch (e) { s = null; }
            if (!s) return say($('tools-msg'), 'That file is not a backup from this app. Nothing was changed.');
            const before = snap(); state = s; open = null; editing = null; evOpen = null; commit(before);
            say($('tools-msg'), 'Restored ' + W.plural(s.families.length, 'family', 'families') + ' and ' + W.plural(s.gifts.length, 'gift', 'gifts') + '.', true);
            updateForm();
        });
        $('wipe').addEventListener('click', () => {
            clearMsgs('tools-msg');
            if (empty()) return say($('tools-msg'), 'There is nothing to delete.');
            const before = snap(), cur = state.cur, sort = state.sort;
            state = W.emptyState(); state.cur = cur; state.sort = sort; open = null; editing = null; evOpen = null; commit(before);
            say($('tools-msg'), 'Deleted everything.', true); updateForm();
        });
        window.addEventListener('storage', e => { if (e.key === KEY) { load(); open = null; editing = null; evOpen = null; render(); updateForm(); } });
        setInterval(() => { const t = W.dayStr(new Date()); if (t !== today) { today = t; $('date').max = today; updateForm(); } }, 30000);
    }

    load(); wire(); render(); updateForm();
    if (!storageOK) say($('add-msg'), 'This browser is not letting the app save (private mode or blocked storage). Everything works, but it will be gone when you close the page.');
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
