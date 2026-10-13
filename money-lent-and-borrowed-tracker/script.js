// Money Lent and Borrowed Tracker: the page. The maths and the words are in core.js (window.MLB).
(function () {
    'use strict';
    const M = window.MLB, KEY = 'money-lent-and-borrowed-tracker.state';
    const $ = id => document.getElementById(id);
    const CUR_NAMES = { '': 'None (plain numbers)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '₹': '₹ (rupee)', 'Rs': 'Rs (rupee)', '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₦': '₦ (naira)',
        '₱': '₱ (peso)', 'R': 'R (rand)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '৳': '৳ (taka)',
        '₺': '₺ (lira)', 'R$': 'R$ (real)', 'zł': 'zł (złoty)', '₽': '₽ (ruble)', '₴': '₴ (hryvnia)', 'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)' };
    let state = M.emptyState(), storageOK = true, today = M.dayStr(new Date());
    let undoSnap = null, open = null, editing = null; // open = { pid, what: 'remind' | 'hist' | 'edit' }

    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(cls, text, fn) { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
    const f = (cents, cur) => M.fmt(cents, cur);
    const curOf = p => M.curOf(state, p);
    const findPerson = name => state.people.find(p => M.sameName(p.name, name));
    const byId = id => state.people.find(p => p.id === id);
    const nice = d => M.niceDate(d, today);

    // storage
    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) { const s = M.normalize(JSON.parse(raw)); if (s) state = s; }
        } catch (e) {
            if (e && /blocked|denied|security|access/i.test(String(e.message || e.name))) storageOK = false;
            state = M.emptyState();
        }
        try { localStorage.setItem(KEY + '.test', '1'); localStorage.removeItem(KEY + '.test'); } catch (e) { storageOK = false; }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOK = false; } }
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
                state = M.normalize(JSON.parse(s)) || M.emptyState(); undoSnap = null; open = null; editing = null; save(); render();
                ['add-msg', 'list-msg', 'tools-msg'].forEach(id => say($(id), ''));
                say(box, 'Undone.');
            }));
        }
    }
    function clearMsgs(except) { ['add-msg', 'list-msg', 'tools-msg'].forEach(id => { if (id !== except) say($(id), ''); }); }

    // ---------- the form ----------
    const kindNow = () => document.querySelector('input[name=kind]:checked').value;
    function formDate() { return $('date-box').hidden ? today : ($('date').value || ''); }
    function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    function updateForm() {
        const name = M.cleanName($('who').value), p = name ? findPerson(name) : null, kind = kindNow();
        const cur = p ? curOf(p) : state.cur;
        $('cur-tag').hidden = !cur; $('cur-tag').textContent = cur;
        const note = $('who-note');
        note.classList.remove('new');
        if (!name) note.textContent = '';
        else if (p) { const s = M.personSummary(p, today); note.textContent = M.balanceWords(p.name, s.balance, cur) + '.'; }
        else { note.textContent = 'New person: ' + name + '. They get their own box.'; note.classList.add('new'); }
        const owed = p ? M.personSummary(p, today).balance : 0;
        const fullOK = (kind === 'repaid' && owed > 0) || (kind === 'paid' && owed < 0);
        $('all-back').hidden = !fullOK;
        if (fullOK) $('all-back').textContent = 'Paid back in full (' + f(owed, cur) + ')';
        $('due-open').hidden = !(kind === 'lent' || kind === 'borrowed') || !$('due-box').hidden;
        if (!(kind === 'lent' || kind === 'borrowed')) $('due-box').hidden = true;
        $('date-text').textContent = $('date-box').hidden ? 'today' : ($('date').value ? (M.isDay($('date').value) && $('date').value === today ? 'today' : nice($('date').value)) : 'not set');
        // what the balance will be
        const a = M.parseAmount($('amount').value), pv = $('preview');
        if (!name || a.error) { pv.textContent = ''; return; }
        const after = owed + M.KINDS[kind].sign * a.cents;
        let t = 'After this: ' + M.balanceWords(p ? p.name : name, after, cur) + '.';
        if (kind === 'repaid' && owed >= 0 && after < 0) t += ' That is ' + f(after, cur) + ' more than they owed you.';
        if (kind === 'paid' && owed <= 0 && after > 0) t += ' That is ' + f(after, cur) + ' more than you owed.';
        pv.textContent = t;
    }

    function saveEntry() {
        clearMsgs('add-msg');
        const name = M.cleanName($('who').value), kind = kindNow();
        const a = M.parseAmount($('amount').value), date = formDate();
        let bad = null;
        const setErr = (id, msg, input) => { $(id).textContent = msg || ''; $(input).setAttribute('aria-invalid', msg ? 'true' : 'false'); if (msg && !bad) bad = input; };
        setErr('who-err', name ? '' : 'Type the person\'s name.', 'who');
        setErr('amount-err', a.error || '', 'amount');
        let dErr = '';
        if (!$('date-box').hidden) { if (!M.isDay(date)) dErr = 'Choose the date it happened.'; else if (date > today) dErr = 'That date is in the future. Choose today or an earlier day.'; else if (date < '1900-01-01') dErr = 'Choose a date after 1900.'; }
        setErr('date-err', dErr, 'date');
        let due = '', uErr = '';
        if ((kind === 'lent' || kind === 'borrowed') && !$('due-box').hidden && $('due').value) {
            due = $('due').value;
            if (!M.isDay(due)) uErr = 'Choose a date, or tap "Remove the date".';
            else if (M.isDay(date) && due < date) uErr = 'The pay-back-by date cannot be before the date of the money (' + nice(date) + ').';
        }
        setErr('due-err', uErr, 'due');
        if (bad) { $(bad).focus(); say($('add-msg'), ''); return; }
        const before = snap();
        let p = findPerson(name), isNew = false;
        if (!p) { p = { id: newId('p'), name, cur: null, entries: [] }; state.people.push(p); isNew = true; }
        const was = M.personSummary(p, today).balance;
        const e = { id: newId('e'), kind, amount: a.cents, date, seq: ++state.seq, note: M.cleanNote($('note').value) };
        if (due) e.due = due;
        p.entries.push(e);
        const s = M.personSummary(p, today), cur = curOf(p);
        const did = { lent: 'You lent ' + p.name + ' ', repaid: p.name + ' paid you back ', borrowed: 'You borrowed from ' + p.name + ' ', paid: 'You paid ' + p.name + ' back ' }[kind] + f(a.cents, cur);
        let msg = 'Saved: ' + did + (date !== today ? ' on ' + nice(date) : '') + '. ' + M.balanceWords(p.name, s.balance, cur) + '.';
        if (kind === 'repaid' && was >= 0 && s.balance < 0) msg = 'Saved: ' + did + '. That is ' + f(s.balance, cur) + ' more than they owed, so now you owe ' + p.name + ' ' + f(s.balance, cur) + '.';
        if (kind === 'paid' && was <= 0 && s.balance > 0) msg = 'Saved: ' + did + '. That is ' + f(s.balance, cur) + ' more than you owed, so now ' + p.name + ' owes you ' + f(s.balance, cur) + '.';
        if (isNew) msg += ' ' + p.name + ' now has their own box.';
        commit(before);
        say($('add-msg'), msg, true);
        $('amount').value = ''; $('note').value = ''; $('due').value = ''; $('due-box').hidden = true; $('note-box').hidden = true; $('note-open').hidden = false;
        $('who').value = ''; $('date-box').hidden = true; $('date').value = today; $('date-open').hidden = false;
        updateForm();
        $('who').focus();
    }

    // ---------- totals ----------
    function renderTotals() {
        const t = M.totals(state, today);
        const val = list => list.length ? M.moneyList(list) : f(0, state.cur);
        $('t-tome').textContent = val(t.toMe);
        $('t-iowe').textContent = val(t.iOwe);
        $('t-tome-n').textContent = t.nToMe ? 'from ' + M.plural(t.nToMe, 'person', 'people') : 'nobody owes you';
        $('t-iowe-n').textContent = t.nIOwe ? 'to ' + M.plural(t.nIOwe, 'person', 'people') : 'you owe nobody';
        const late = state.people.filter(p => M.personSummary(p, today).overdue);
        $('t-late').hidden = !late.length;
        if (late.length) {
            $('t-late').textContent = 'Past the pay-back-by date: ' + late.map(p => {
                const s = M.personSummary(p, today), d = M.plural(-s.daysLeft, 'day', 'days') + ' late';
                return s.balance > 0 ? p.name + ' (' + d + ')' : 'you to ' + p.name + ' (' + d + ')';
            }).join(', ') + '.';
        }
    }

    // ---------- people ----------
    function personBox(p) {
        const s = M.personSummary(p, today), cur = curOf(p);
        const box = el('article', 'person ' + (s.balance > 0 ? 'to-me' : s.balance < 0 ? 'i-owe' : 'settled'));
        box.dataset.id = p.id;
        box.appendChild(el('h3', 'p-name', p.name));
        box.appendChild(el('p', 'p-bal', s.balance > 0 ? 'Owes you ' + f(s.balance, cur) : s.balance < 0 ? 'You owe ' + f(s.balance, cur) : 'Settled up'));
        const dw = M.dueWords(s, today);
        if (dw) box.appendChild(el('p', 'p-due' + (s.overdue ? ' late-d' : ''), dw));
        const parts = [];
        if (s.lent) parts.push('lent ' + f(s.lent, cur));
        if (s.repaid) parts.push('paid you back ' + f(s.repaid, cur));
        if (s.borrowed) parts.push('borrowed ' + f(s.borrowed, cur));
        if (s.paid) parts.push('you paid back ' + f(s.paid, cur));
        const meta = parts.length ? parts.join(', ') + '. Last change ' + nice(s.last) + '.' : 'No entries.';
        box.appendChild(el('p', 'p-meta', meta.charAt(0).toUpperCase() + meta.slice(1)));
        const bs = el('div', 'p-btns');
        bs.appendChild(btn('secondary', 'Add for ' + p.name, () => addFor(p)));
        if (s.balance) bs.appendChild(btn('secondary', 'Paid back in full', () => paidInFull(p)));
        const toggle = (what, label) => { const b = btn('secondary', label, () => { open = open && open.pid === p.id && open.what === what ? null : { pid: p.id, what }; editing = null; render(); focusPanel(p.id); });
            b.setAttribute('aria-expanded', String(!!(open && open.pid === p.id && open.what === what))); return b; };
        if (s.count) bs.appendChild(toggle('remind', 'Reminder message'));
        if (s.count) bs.appendChild(toggle('hist', 'History (' + s.count + ')'));
        bs.appendChild(toggle('edit', 'Change name or currency'));
        bs.appendChild(btn('secondary', 'Delete person', () => delPerson(p)));
        box.appendChild(bs);
        if (open && open.pid === p.id) box.appendChild(open.what === 'remind' ? remindPanel(p) : open.what === 'hist' ? histPanel(p, s) : editPanel(p));
        return box;
    }
    function focusPanel(pid) { const b = document.querySelector('.person[data-id="' + pid + '"] .panel'); if (b) { const t = b.querySelector('textarea, input, button'); if (t) t.focus({ preventScroll: true }); b.scrollIntoView({ block: 'nearest' }); } }

    function addFor(p) {
        $('who').value = p.name; updateForm();
        $('add').scrollIntoView({ block: 'start' }); $('amount').focus({ preventScroll: true });
    }
    function paidInFull(p) {
        clearMsgs('list-msg');
        const s = M.personSummary(p, today), before = snap(), cur = curOf(p);
        p.entries.push({ id: newId('e'), kind: s.balance > 0 ? 'repaid' : 'paid', amount: Math.abs(s.balance), date: today, seq: ++state.seq, note: '' });
        open = null; commit(before);
        say($('list-msg'), (s.balance > 0 ? 'Saved: ' + p.name + ' paid you back ' : 'Saved: you paid ' + p.name + ' back ') + f(s.balance, cur) + ' today. You and ' + p.name + ' are settled up.', true);
        updateForm();
    }
    function delPerson(p) {
        clearMsgs('list-msg');
        const before = snap();
        state.people = state.people.filter(q => q.id !== p.id); open = null;
        commit(before);
        say($('list-msg'), 'Deleted ' + p.name + ' and ' + M.plural(p.entries.length, 'entry', 'entries') + '.', true);
        updateForm();
    }

    async function copyText(text, box) {
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px'; document.body.appendChild(t); t.select();
            try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        }
        say(box, ok ? 'Copied. Paste it into a message, note or email.' : 'Could not copy here. Select the text and copy it by hand.');
    }
    const mailto = (subject, body) => 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body.length > 1800 ? body.slice(0, 1800) + '\n...' : body);

    function remindPanel(p) {
        const panel = el('div', 'panel');
        const h = el('h3', null, 'Reminder message for ' + p.name); panel.appendChild(h);
        const id = 'rem-' + p.id, lab = el('label', null, 'Change the words if you like'); lab.htmlFor = id; panel.appendChild(lab);
        const ta = el('textarea'); ta.id = id; ta.maxLength = 2000; ta.value = M.reminderText(state, p, today); panel.appendChild(ta);
        const msg = el('div', 'msg'); msg.setAttribute('role', 'status');
        const row = el('div', 'row-btns');
        row.appendChild(btn('primary small', 'Copy', () => copyText(ta.value, msg)));
        if (navigator.share) row.appendChild(btn('secondary small', 'Share', () => { navigator.share({ text: ta.value }).catch(() => {}); }));
        const mail = el('a', 'secondary small', 'Email'); mail.href = mailto('Money reminder', ta.value); mail.style.flex = '1 1 6rem';
        ta.addEventListener('input', () => { mail.href = mailto('Money reminder', ta.value); });
        row.appendChild(mail);
        row.appendChild(btn('secondary small', 'Close', () => { open = null; render(); }));
        panel.appendChild(row); panel.appendChild(msg);
        return panel;
    }

    function kindPicker(name, value) {
        const fs = el('fieldset', 'kinds'); fs.appendChild(el('legend', null, 'What happened?'));
        Object.keys(M.KINDS).forEach(k => {
            const l = el('label', 'kind'), i = el('input'); i.type = 'radio'; i.name = name; i.value = k; i.checked = k === value;
            l.appendChild(i); l.appendChild(el('span', null, M.KINDS[k].me)); fs.appendChild(l);
        });
        return fs;
    }
    function field(labelText, input, id) { const w = el('div', 'field'), l = el('label', null, labelText); input.id = id; l.htmlFor = id; w.appendChild(l); w.appendChild(input); const e = el('p', 'err'); e.setAttribute('role', 'alert'); w.appendChild(e); w.err = e; return w; }

    function histPanel(p, s) {
        const panel = el('div', 'panel'), cur = curOf(p);
        panel.appendChild(el('h3', null, 'History with ' + p.name));
        const msg = el('div', 'msg'); msg.setAttribute('role', 'status');
        const ul = el('ul', 'hist');
        s.rows.forEach(r => {
            const e = r.entry, li = el('li', 'h-row');
            if (editing === e.id) { li.className = 'h-row h-edit'; li.appendChild(editEntry(p, e)); ul.appendChild(li); return; }
            const main = el('div', 'h-main');
            main.appendChild(el('div', 'h-what', nice(e.date) + ': ' + M.KINDS[e.kind].past + ' ' + f(e.amount, cur)));
            const sub = ['After this: ' + (r.after > 0 ? 'owes you ' + f(r.after, cur) : r.after < 0 ? 'you owe ' + f(r.after, cur) : 'settled up')];
            if (e.due) sub.push('pay back by ' + nice(e.due));
            if (e.note) sub.push(e.note);
            main.appendChild(el('div', 'h-sub', sub.join(' · ')));
            li.appendChild(main);
            const b = el('div', 'h-btns');
            b.appendChild(btn('secondary small', 'Edit', () => { editing = e.id; render(); const i = document.getElementById('ed-amount'); if (i) i.focus(); }));
            b.appendChild(btn('secondary small', 'Delete', () => {
                clearMsgs('list-msg');
                const before = snap(); p.entries = p.entries.filter(x => x.id !== e.id); commit(before);
                say($('list-msg'), 'Deleted the entry from ' + nice(e.date) + ' (' + M.KINDS[e.kind].past.toLowerCase() + ' ' + f(e.amount, cur) + '). ' + M.balanceWords(p.name, M.personSummary(p, today).balance, cur) + '.', true);
                updateForm();
            }));
            li.appendChild(b); ul.appendChild(li);
        });
        if (!s.rows.length) panel.appendChild(el('p', 'hint', 'No entries left.'));
        panel.appendChild(ul);
        const row = el('div', 'row-btns');
        row.appendChild(btn('secondary small', 'Copy history', () => copyText(M.statementText(state, p, today), msg)));
        row.appendChild(btn('secondary small', 'Close', () => { open = null; editing = null; render(); }));
        panel.appendChild(row); panel.appendChild(msg);
        return panel;
    }

    function editEntry(p, e) {
        const w = el('div'), cur = curOf(p);
        w.appendChild(kindPicker('ed-kind', e.kind));
        const amt = el('input'); amt.type = 'text'; amt.inputMode = 'decimal'; amt.maxLength = 24; amt.autocomplete = 'off';
        amt.value = (e.amount / 100).toFixed(e.amount % 100 ? 2 : 0);
        const fa = field('Amount' + (cur ? ' (' + cur + ')' : ''), amt, 'ed-amount'); w.appendChild(fa);
        const dt = el('input'); dt.type = 'date'; dt.value = e.date; dt.max = today;
        const fd = field('Date it happened', dt, 'ed-date'); w.appendChild(fd);
        const du = el('input'); du.type = 'date'; du.value = e.due || '';
        const fu = field('Pay back by (optional)', du, 'ed-due'); w.appendChild(fu);
        const nt = el('input'); nt.type = 'text'; nt.maxLength = 200; nt.autocomplete = 'off'; nt.value = e.note || '';
        const fn = field('Note (optional)', nt, 'ed-note'); w.appendChild(fn);
        const showDue = () => { const k = w.querySelector('input[name=ed-kind]:checked').value; fu.hidden = !(k === 'lent' || k === 'borrowed'); };
        w.querySelectorAll('input[name=ed-kind]').forEach(r => r.addEventListener('change', showDue)); showDue();
        const cancel = () => { editing = null; render(); };
        const ok = () => {
            const k = w.querySelector('input[name=ed-kind]:checked').value, a = M.parseAmount(amt.value);
            fa.err.textContent = a.error || ''; amt.setAttribute('aria-invalid', a.error ? 'true' : 'false');
            let dE = !M.isDay(dt.value) ? 'Choose the date it happened.' : dt.value > today ? 'That date is in the future.' : dt.value < '1900-01-01' ? 'Choose a date after 1900.' : '';
            fd.err.textContent = dE; dt.setAttribute('aria-invalid', dE ? 'true' : 'false');
            let uE = ''; const hasDue = !fu.hidden && du.value;
            if (hasDue && !M.isDay(du.value)) uE = 'Choose a date or leave it empty.'; else if (hasDue && !dE && du.value < dt.value) uE = 'The pay-back-by date cannot be before the date of the money.';
            fu.err.textContent = uE; du.setAttribute('aria-invalid', uE ? 'true' : 'false');
            if (a.error) return amt.focus(); if (dE) return dt.focus(); if (uE) return du.focus();
            const before = snap();
            e.kind = k; e.amount = a.cents; e.date = dt.value; e.note = M.cleanNote(nt.value);
            if (hasDue) e.due = du.value; else delete e.due;
            editing = null; commit(before);
            clearMsgs('list-msg');
            say($('list-msg'), 'Saved the change. ' + M.balanceWords(p.name, M.personSummary(p, today).balance, cur) + '.', true);
            updateForm();
        };
        [amt, nt].forEach(i => i.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); ok(); } }));
        w.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); cancel(); } });
        const row = el('div', 'row-btns');
        row.appendChild(btn('primary small', 'Save', ok)); row.appendChild(btn('secondary small', 'Cancel', cancel));
        w.appendChild(row);
        return w;
    }

    function curSelect(sel, withSame) {
        sel.textContent = '';
        if (withSame) { const o = el('option', null, 'Same as the app (' + (state.cur ? state.cur : 'plain numbers') + ')'); o.value = '__same'; sel.appendChild(o); }
        M.SYMBOLS.forEach(c => { const o = el('option', null, CUR_NAMES[c] || c); o.value = c; sel.appendChild(o); });
    }
    function editPanel(p) {
        const panel = el('div', 'panel');
        panel.appendChild(el('h3', null, 'Change name or currency'));
        const nm = el('input'); nm.type = 'text'; nm.maxLength = 60; nm.autocomplete = 'off'; nm.value = p.name;
        const fn = field('Name', nm, 'pe-name'); panel.appendChild(fn);
        const sel = el('select'); curSelect(sel, true); sel.value = p.cur == null ? '__same' : p.cur;
        const fc = field('Currency for ' + p.name, sel, 'pe-cur'); panel.appendChild(fc);
        const ok = () => {
            const name = M.cleanName(nm.value), other = findPerson(name);
            const err = !name ? 'Type a name.' : other && other.id !== p.id ? 'There is already someone called ' + other.name + '. Use a different name, such as ' + name + ' (work).' : '';
            fn.err.textContent = err; nm.setAttribute('aria-invalid', err ? 'true' : 'false');
            if (err) return nm.focus();
            const before = snap(), old = p.name;
            p.name = name; p.cur = sel.value === '__same' ? null : sel.value; open = null; commit(before);
            clearMsgs('list-msg');
            say($('list-msg'), (old !== name ? 'Renamed ' + old + ' to ' + name + '. ' : 'Saved. ') + M.balanceWords(name, M.personSummary(p, today).balance, curOf(p)) + '.', true);
            updateForm();
        };
        nm.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); ok(); } });
        panel.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); open = null; render(); } });
        const row = el('div', 'row-btns');
        row.appendChild(btn('primary small', 'Save', ok)); row.appendChild(btn('secondary small', 'Cancel', () => { open = null; render(); }));
        panel.appendChild(row);
        return panel;
    }

    function renderPeople() {
        const q = M.cleanName($('find').value).toLocaleLowerCase();
        const all = M.sortPeople(state, state.sort, today);
        $('sort-wrap').hidden = state.people.length < 2; $('sort').value = state.sort;
        $('find-wrap').hidden = state.people.length < 6; if ($('find-wrap').hidden) $('find').value = '';
        const shown = all.filter(p => !q || p.name.toLocaleLowerCase().includes(q));
        const active = shown.filter(p => M.personSummary(p, today).balance !== 0), settled = shown.filter(p => M.personSummary(p, today).balance === 0);
        $('people').textContent = ''; $('settled').textContent = '';
        active.forEach(p => $('people').appendChild(personBox(p)));
        settled.forEach(p => $('settled').appendChild(personBox(p)));
        $('settled-wrap').hidden = !settled.length;
        $('settled-sum').textContent = 'Settled up (' + settled.length + ')';
        if (open && settled.some(p => p.id === open.pid)) $('settled-wrap').open = true;
        const e = $('empty');
        e.hidden = !!shown.length;
        e.textContent = state.people.length ? 'Nobody matches "' + $('find').value.trim() + '".' : 'Nobody here yet. Add the first money you lent or borrowed, and the person gets their own box here with what they owe.';
        if (state.people.length && !active.length && settled.length && !q) { e.hidden = false; e.textContent = 'Nobody owes anything. Everyone is settled up.'; }
        const dl = $('who-list'); dl.textContent = '';
        state.people.forEach(p => { const o = el('option'); o.value = p.name; dl.appendChild(o); });
    }

    function render() {
        renderTotals(); renderPeople();
        $('cur').value = state.cur;
    }

    // ---------- share, print, backup ----------
    function buildReport() {
        const r = $('report'); r.textContent = '';
        const t = M.totals(state, today);
        r.appendChild(el('h2', null, 'Money lent and borrowed'));
        r.appendChild(el('p', null, 'On ' + M.niceDate(today, '') + '. Owed to you: ' + (t.toMe.length ? M.moneyList(t.toMe) : 'nothing') + '. You owe: ' + (t.iOwe.length ? M.moneyList(t.iOwe) : 'nothing') + '.'));
        const tb = el('table'), th = el('thead'), hr = el('tr');
        ['Person', 'Balance', 'Pay back by'].forEach(x => hr.appendChild(el('th', null, x))); th.appendChild(hr); tb.appendChild(th);
        const body = el('tbody');
        M.sortPeople(state, 'owed', today).forEach(p => {
            const s = M.personSummary(p, today), tr = el('tr');
            tr.appendChild(el('td', null, p.name));
            tr.appendChild(el('td', null, s.balance > 0 ? 'Owes you ' + f(s.balance, curOf(p)) : s.balance < 0 ? 'You owe ' + f(s.balance, curOf(p)) : 'Settled up'));
            tr.appendChild(el('td', null, s.due ? M.niceDate(s.due, '') + (s.overdue ? ' (late)' : '') : ''));
            body.appendChild(tr);
        });
        tb.appendChild(body); r.appendChild(tb);
        M.sortPeople(state, 'owed', today).filter(p => p.entries.length).forEach(p => {
            const s = M.personSummary(p, today), cur = curOf(p);
            r.appendChild(el('h3', null, p.name + ': ' + (s.balance ? M.balanceWords(p.name, s.balance, cur) : 'settled up')));
            const t2 = el('table'), h2 = el('thead'), r2 = el('tr');
            ['Date', 'What happened', 'Amount', 'After this', 'Note'].forEach(x => r2.appendChild(el('th', null, x))); h2.appendChild(r2); t2.appendChild(h2);
            const b2 = el('tbody');
            s.rows.forEach(x => {
                const tr = el('tr'), e = x.entry;
                [M.niceDate(e.date, ''), M.KINDS[e.kind].past, f(e.amount, cur), x.after > 0 ? 'owes you ' + f(x.after, cur) : x.after < 0 ? 'you owe ' + f(x.after, cur) : 'settled',
                    (e.note || '') + (e.due ? (e.note ? '; ' : '') + 'pay back by ' + M.niceDate(e.due, '') : '')].forEach(v => tr.appendChild(el('td', null, v)));
                b2.appendChild(tr);
            });
            t2.appendChild(b2); r.appendChild(t2);
        });
    }

    function download(name, text) {
        const blob = new Blob([text], { type: 'application/json' }), a = el('a');
        a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    function wire() {
        curSelect($('cur'), false);
        $('date').value = today; $('date').max = today;
        $('who').addEventListener('input', () => { $('who-err').textContent = ''; $('who').setAttribute('aria-invalid', 'false'); updateForm(); });
        $('amount').addEventListener('input', () => { $('amount-err').textContent = ''; $('amount').setAttribute('aria-invalid', 'false'); updateForm(); });
        document.querySelectorAll('input[name=kind]').forEach(r => r.addEventListener('change', updateForm));
        ['who', 'amount', 'note'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveEntry(); } }));
        $('save').addEventListener('click', saveEntry);
        $('all-back').addEventListener('click', () => {
            const p = findPerson($('who').value); if (!p) return;
            const b = Math.abs(M.personSummary(p, today).balance); $('amount').value = (b / 100).toFixed(b % 100 ? 2 : 0); updateForm(); $('save').focus();
        });
        $('date-open').addEventListener('click', () => { $('date-box').hidden = false; $('date-open').hidden = true; $('date').max = today; if (!$('date').value) $('date').value = today; $('date').focus(); updateForm(); });
        $('date-today').addEventListener('click', () => { $('date').value = today; $('date-box').hidden = true; $('date-open').hidden = false; $('date-err').textContent = ''; updateForm(); $('date-open').focus(); });
        $('date').addEventListener('input', () => { $('date-err').textContent = ''; updateForm(); });
        $('due-open').addEventListener('click', () => { $('due-box').hidden = false; $('due').min = formDate() || ''; updateForm(); $('due').focus(); });
        $('due-clear').addEventListener('click', () => { $('due').value = ''; $('due-err').textContent = ''; $('due-box').hidden = true; updateForm(); $('due-open').focus(); });
        $('note-open').addEventListener('click', () => { $('note-box').hidden = false; $('note-open').hidden = true; $('note').focus(); });

        $('sort').addEventListener('change', () => { state.sort = $('sort').value; save(); render(); });
        $('find').addEventListener('input', renderPeople);
        $('cur').addEventListener('change', () => { state.cur = $('cur').value; save(); render(); updateForm(); });

        $('copy-all').addEventListener('click', () => { clearMsgs('tools-msg'); state.people.length ? copyText(M.summaryText(state, today), $('tools-msg')) : say($('tools-msg'), 'There is nobody in the list yet.'); });
        $('email-all').addEventListener('click', () => { clearMsgs('tools-msg'); if (!state.people.length) return say($('tools-msg'), 'There is nobody in the list yet.'); location.href = mailto('Money lent and borrowed', M.summaryText(state, today)); });
        $('print-all').addEventListener('click', () => { clearMsgs('tools-msg'); if (!state.people.length) return say($('tools-msg'), 'There is nobody in the list yet.'); buildReport(); window.print(); });
        $('backup').addEventListener('click', () => {
            clearMsgs('tools-msg');
            if (!state.people.length) return say($('tools-msg'), 'There is nothing to back up yet.');
            download('money-lent-and-borrowed-backup-' + today + '.json', JSON.stringify(Object.assign({ app: 'money-lent-and-borrowed-tracker', saved: today }, state), null, 1));
            const n = state.people.reduce((a, p) => a + p.entries.length, 0);
            say($('tools-msg'), 'Backup saved to your downloads: ' + M.plural(state.people.length, 'person', 'people') + ' and ' + M.plural(n, 'entry', 'entries') + '.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', async () => {
            clearMsgs('tools-msg');
            const file = $('restore-file').files[0]; $('restore-file').value = '';
            if (!file) return;
            if (file.size > 5e6) return say($('tools-msg'), 'That file is too big to be a backup from this app.');
            let s = null;
            try { const raw = JSON.parse(await file.text()); s = raw && raw.app === 'money-lent-and-borrowed-tracker' ? M.normalize(raw) : null; } catch (e) { s = null; }
            if (!s) return say($('tools-msg'), 'That file is not a backup from this app. Nothing was changed.');
            const before = snap(); state = s; open = null; editing = null; commit(before);
            const n = s.people.reduce((a, p) => a + p.entries.length, 0);
            say($('tools-msg'), 'Restored ' + M.plural(s.people.length, 'person', 'people') + ' and ' + M.plural(n, 'entry', 'entries') + '.', true);
            updateForm();
        });
        $('wipe').addEventListener('click', () => {
            clearMsgs('tools-msg');
            if (!state.people.length) return say($('tools-msg'), 'There is nothing to delete.');
            const before = snap(), cur = state.cur, sort = state.sort;
            state = M.emptyState(); state.cur = cur; state.sort = sort; open = null; editing = null; commit(before);
            say($('tools-msg'), 'Deleted everything.', true); updateForm();
        });
        window.addEventListener('storage', e => { if (e.key === KEY) { load(); open = null; editing = null; render(); updateForm(); } });
        // a new day: "today", days left and late dates move on by themselves
        setInterval(() => { const t = M.dayStr(new Date()); if (t !== today) { today = t; $('date').max = today; render(); updateForm(); } }, 30000);
    }

    load(); wire(); render(); updateForm();
    if (!storageOK) say($('add-msg'), 'This browser is not letting the app save (private mode or blocked storage). Everything works, but it will be gone when you close the page.');
})();
