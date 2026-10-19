// Committee and ROSCA Tracker: the page. The maths and the words are in core.js (window.CRT).
(function () {
    'use strict';
    const C = window.CRT, KEY = 'committee-and-rosca-tracker-for-savings-groups.state';
    const $ = id => document.getElementById(id);
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', '₦': '₦ (naira)',
        'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', 'Rp': 'Rp (rupiah)', 'RM': 'RM (ringgit)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const MSGS = ['setup-msg', 'members-msg', 'round-msg', 'turns-msg', 'tools-msg'];
    let state = C.emptyState(), today = C.dayStr(new Date());
    let undoSnap = null, view = null, editingSetup = false, open = null, partOpen = null; // view = round shown; open = { id, what: 'edit' | 'remind' }

    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(cls, text, fn) { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
    const com = () => state.committees.find(c => c.id === state.active) || null;
    const f = cents => C.fmt(cents, state.cur);
    const nice = d => C.niceDate(d);
    const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ready = c => c && c.amount > 0;

    // ---------- storage ----------
    function load() {
        try { const raw = localStorage.getItem(KEY); if (raw) { const s = C.normalize(JSON.parse(raw), today); if (s) state = s; } }
        catch (e) { state = C.emptyState(); }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked: works for this visit */ } }
    const snap = () => JSON.stringify(state);
    function commit(before) { undoSnap = before; save(); render(); }
    function say(id, text, withUndo) {
        const box = $(id); box.textContent = '';
        if (!text) { box.classList.remove('show'); return; }
        box.classList.add('show');
        box.appendChild(document.createTextNode(text + ' '));
        if (withUndo && undoSnap) {
            const s = undoSnap;
            box.appendChild(btn('link inline undo', 'Undo', () => {
                state = C.normalize(JSON.parse(s), today) || C.emptyState(); undoSnap = null; open = null; partOpen = null; editingSetup = false;
                save(); render(); clearMsgs(); say(id, 'Undone.');
            }));
        }
    }
    function clearMsgs(except) { MSGS.forEach(id => { if (id !== except) say(id, ''); }); }

    // ---------- committee details ----------
    function fillSetup(c) {
        $('c-name').value = c && c.name !== 'My committee' ? c.name : (c ? c.name : '');
        $('c-amount').value = c && c.amount ? (c.amount / 100).toFixed(c.amount % 100 ? 2 : 0) : '';
        $('c-freq').value = c ? c.freq : 'month';
        $('c-start').value = c ? c.start : today;
        ['c-amount-err', 'c-start-err'].forEach(id => { $(id).textContent = ''; });
        $('c-amount').setAttribute('aria-invalid', 'false'); $('c-start').setAttribute('aria-invalid', 'false');
    }
    function saveSetup() {
        clearMsgs('setup-msg');
        const a = C.parseAmount($('c-amount').value), start = $('c-start').value;
        $('c-amount-err').textContent = a.error || ''; $('c-amount').setAttribute('aria-invalid', a.error ? 'true' : 'false');
        const sErr = !C.isDay(start) ? 'Choose the date of the first collection.' : '';
        $('c-start-err').textContent = sErr; $('c-start').setAttribute('aria-invalid', sErr ? 'true' : 'false');
        if (a.error) return $('c-amount').focus();
        if (sErr) return $('c-start').focus();
        const before = snap();
        let c = com(), isNew = false;
        if (!c) { c = C.newCommittee(newId('c'), today); state.committees.push(c); state.active = c.id; isNew = true; }
        const hadPaid = Object.keys(c.paid).length > 0, changedAmt = c.amount && c.amount !== a.cents;
        c.name = C.cleanName($('c-name').value) || 'My committee';
        c.amount = a.cents; c.freq = $('c-freq').value in C.FREQS ? $('c-freq').value : 'month'; c.start = start;
        editingSetup = false; view = null;
        commit(isNew ? null : before);
        if (isNew || !c.members.length) { say('setup-msg', 'Saved. Now add the members below.'); $('m-name').focus(); }
        else say('setup-msg', 'Details saved.' + (hadPaid && changedAmt ? ' Payments already ticked keep the amount they were saved with.' : ''), true);
    }

    function renderSetup() {
        const c = com();
        const many = state.committees.length > 1;
        $('pick-wrap').hidden = !many;
        $('pick').textContent = '';
        state.committees.forEach(x => { const o = el('option', '', x.name); o.value = x.id; $('pick').appendChild(o); });
        if (c) $('pick').value = c.id;
                $('pick-row').hidden = !many;
        const showForm = !ready(c) || editingSetup;
        $('setup-form').hidden = !showForm; $('setup-view').hidden = showForm;
        $('setup-form-h').textContent = ready(c) ? 'Change committee details' : (state.committees.length ? 'Set up your new committee' : 'Set up your committee');
        $('c-cancel').hidden = !(ready(c) && editingSetup) && !(c && !ready(c) && state.committees.length > 1);
        $('cur-tag').hidden = !state.cur; $('cur-tag').textContent = state.cur;
        $('restore-first').hidden = state.committees.some(ready);
        if (showForm) return;
        $('setup-h').textContent = c.name;
        const n = C.rounds(c), shares = C.totalShares(c);
        $('c-line1').textContent = f(c.amount) + ' per share ' + C.FREQS[c.freq].per + ' · ' + C.plural(c.members.length, 'member', 'members') +
            (shares !== c.members.length ? ' (' + shares + ' shares)' : '') + (n ? ' · pot ' + f(C.pot(c)) : '');
        $('c-line2').textContent = n ? C.plural(n, 'round', 'rounds') + ', from ' + nice(c.start) + ' to ' + nice(C.roundDate(c, n - 1)) : 'First collection ' + nice(c.start) + '. Add the members to see the rounds.';
        const now = $('c-now'); now.className = 'c-now';
        if (n < 2) { now.textContent = n ? 'Add at least one more member.' : ''; return; }
        const cr = C.currentRound(c, today);
        if (!cr.started) now.textContent = 'Starts on ' + nice(c.start) + ' (' + (cr.days === 1 ? 'tomorrow' : 'in ' + cr.days + ' days') + ').';
        else if (cr.ended) { now.textContent = 'Finished: every member has taken the pot and every payment is in.'; now.classList.add('good'); }
        else {
            const s = C.roundStatus(c, cr.r);
            now.textContent = 'Now: round ' + (cr.r + 1) + ' of ' + n + '. ' + C.headline(c, cr.r, state.cur) + '. Paid ' + s.paidCount + ' of ' + s.memberCount + '.';
            if (s.allPaid) now.classList.add('good');
        }
    }

    // ---------- members ----------
    function sharesSelect(sel, value, min) {
        sel.textContent = '';
        for (let k = Math.max(1, min || 1); k <= C.MAX_SHARES; k++) { const o = el('option', '', k === 1 ? '1 share' : k + ' shares'); o.value = k; sel.appendChild(o); }
        sel.value = String(value || 1);
    }
    function addMember() {
        clearMsgs('members-msg');
        const c = com(), name = C.cleanName($('m-name').value), shares = +$('m-shares').value || 1;
        let err = '';
        if (!name) err = 'Type the member\'s name.';
        else if (c.members.some(m => C.sameName(m.name, name))) err = name + ' is already in this committee. Give each member a different name, such as "' + name + ' 2", or give them 2 shares with Edit.';
        else if (C.totalShares(c) + shares > C.MAX_TURNS) err = 'A committee can have at most ' + C.MAX_TURNS + ' shares (rounds).';
        $('m-name-err').textContent = err; $('m-name').setAttribute('aria-invalid', err ? 'true' : 'false');
        let ph = { phone: '' };
        if (!$('m-phone-box').hidden) { ph = C.cleanPhone($('m-phone').value); $('m-phone-err').textContent = ph.error || ''; $('m-phone').setAttribute('aria-invalid', ph.error ? 'true' : 'false'); }
        if (err) return $('m-name').focus();
        if (ph.error) return $('m-phone').focus();
        const before = snap();
        c.members.push({ id: newId('m'), name, shares, phone: ph.phone });
        C.syncOrder(c);
        commit(before);
        const turns = c.order.map((id, r) => r).filter(r => c.members[c.members.length - 1].id === c.order[r]);
        say('members-msg', 'Added ' + name + (shares > 1 ? ' with ' + shares + ' shares' : '') + '. Takes the pot in ' + turns.map(r => 'round ' + (r + 1)).join(' and ') + '.', true);
        $('m-name').value = ''; $('m-phone').value = ''; $('m-shares').value = '1'; $('m-phone-box').hidden = true; $('m-phone-open').hidden = false;
        $('m-name').focus();
    }
    function deleteMember(m) {
        const c = com(); clearMsgs('members-msg');
        const took = C.handedCount(c, m.id);
        if (took) return say('members-msg', m.name + ' has already taken the pot, so they cannot be deleted: they still owe the rest of their payments. If someone else took their place, tap Edit and change the name.');
        const before = snap();
        c.members = c.members.filter(x => x.id !== m.id); C.syncOrder(c); open = null;
        commit(before);
        say('members-msg', 'Deleted ' + m.name + ' and their payments. The turns after theirs moved up.', true);
    }
    function memberEditPanel(c, m) {
        const p = el('div', 'panel');
        p.appendChild(el('h3', '', 'Edit ' + m.name));
        const uid = 'e-' + m.id;
        const ln = el('label', '', 'Name'); ln.htmlFor = uid + '-n'; p.appendChild(ln);
        const n = el('input'); n.type = 'text'; n.id = uid + '-n'; n.maxLength = 60; n.value = m.name; n.autocomplete = 'off'; p.appendChild(n);
        const ls = el('label', '', 'Shares'); ls.htmlFor = uid + '-s'; p.appendChild(ls);
        const s = el('select'); s.id = uid + '-s'; sharesSelect(s, m.shares, C.handedCount(c, m.id)); p.appendChild(s);
        const lp = el('label', '', 'Phone number, with country code (optional)'); lp.htmlFor = uid + '-p'; p.appendChild(lp);
        const ph = el('input'); ph.type = 'tel'; ph.id = uid + '-p'; ph.maxLength = 24; ph.value = m.phone; ph.placeholder = 'e.g. +92 300 1234567'; ph.autocomplete = 'off'; p.appendChild(ph);
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); p.appendChild(err);
        const row = el('div', 'row-btns');
        const doSave = () => {
            const name = C.cleanName(n.value), shares = +s.value, pp = C.cleanPhone(ph.value);
            let e = '';
            if (!name) e = 'Type the member\'s name.';
            else if (c.members.some(x => x.id !== m.id && C.sameName(x.name, name))) e = name + ' is already in this committee.';
            else if (C.totalShares(c) - m.shares + shares > C.MAX_TURNS) e = 'A committee can have at most ' + C.MAX_TURNS + ' shares (rounds).';
            else if (pp.error) e = pp.error;
            err.textContent = e; if (e) return (pp.error && name ? ph : n).focus();
            const before = snap(), old = m.name;
            m.name = name; m.shares = shares; m.phone = pp.phone; C.syncOrder(c); open = null;
            commit(before);
            say('members-msg', 'Saved ' + name + (old !== name ? ' (was ' + old + ')' : '') + '.', true);
        };
        row.appendChild(btn('primary small', 'Save', doSave));
        row.appendChild(btn('secondary small', 'Cancel', () => { open = null; render(); }));
        [n, ph].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); }));
        p.addEventListener('keydown', e => { if (e.key === 'Escape') { open = null; render(); } });
        p.appendChild(row);
        return p;
    }
    function messagePanel(text, phone, title) {
        const p = el('div', 'panel');
        p.appendChild(el('h3', '', title));
        const ta = el('textarea'); ta.value = text; ta.setAttribute('aria-label', title); p.appendChild(ta);
        const row = el('div', 'row-btns');
        const note = el('p', 'msg');
        row.appendChild(btn('secondary small', 'Copy', () => copy(ta.value, note)));
        const wa = el('a', 'secondary small', phone ? 'WhatsApp' : 'Send on WhatsApp'); wa.href = C.waLink(phone, ta.value); wa.target = '_blank'; wa.rel = 'noopener';
        row.appendChild(wa);
        if (navigator.share) row.appendChild(btn('secondary small', 'Share', () => { navigator.share({ text: ta.value }).catch(() => {}); }));
        ta.addEventListener('input', () => { wa.href = C.waLink(phone, ta.value); });
        row.appendChild(btn('secondary small', 'Close', () => { open = null; render(); }));
        p.appendChild(row); p.appendChild(note);
        return p;
    }
    function renderMembers() {
        const c = com(), list = $('m-list');
        $('members').hidden = !ready(c);
        if (!ready(c)) return;
        $('members-h').textContent = c.members.length ? 'Members (' + c.members.length + ')' : 'Members';
        $('m-empty').hidden = c.members.length > 0;
        list.textContent = '';
        c.members.forEach(m => {
            const s = C.memberSummary(c, m, today), box = el('div', 'member' + (s.owedCents ? ' owes' : s.dueRounds ? ' ok' : ''));
            box.dataset.id = m.id;
            const top = el('div', 'm-top');
            top.appendChild(el('p', 'm-name', m.name));
            if (m.shares > 1) top.appendChild(el('span', 'tag', m.shares + ' shares'));
            box.appendChild(top);
            box.appendChild(el('p', 'm-meta', 'Pays ' + f(s.due) + ' ' + C.FREQS[c.freq].each + (m.phone ? ' · ' + m.phone : '')));
            const turnWords = s.turns.map(r => (C.isLocked(c, r) ? 'took it in round ' : 'round ') + (r + 1) + ' (' + nice(C.roundDate(c, r)) + ')');
            if (turnWords.length) box.appendChild(el('p', 'm-turn', 'Takes the pot: ' + turnWords.join(', ')));
            let st;
            if (s.owedCents) st = 'Owes ' + f(s.owedCents) + ' now (' + s.owed.map(o => 'round ' + (o.r + 1) + (o.part ? ', part paid' : '')).join('; ') + ')';
            else if (s.dueRounds) st = 'Paid up: ' + s.fullRounds + ' of ' + C.plural(C.rounds(c), 'round', 'rounds') + ' paid';
            else st = 'Nothing due yet' + (s.fullRounds ? ' (' + s.fullRounds + ' paid early)' : '');
            box.appendChild(el('p', 'm-status', st));
            box.appendChild(el('p', 'm-meta', 'Paid in so far: ' + f(s.paidTotal) + ' of ' + f(s.totalDue)));
            const b = el('div', 'p-btns');
            b.appendChild(btn('secondary small', 'Reminder', () => { open = open && open.id === m.id && open.what === 'remind' ? null : { id: m.id, what: 'remind' }; render(); focusPanel(m.id); }));
            b.appendChild(btn('secondary small', 'Edit', () => { open = open && open.id === m.id && open.what === 'edit' ? null : { id: m.id, what: 'edit' }; render(); focusPanel(m.id); }));
            b.appendChild(btn('secondary small danger-t', 'Delete', () => deleteMember(m)));
            box.appendChild(b);
            if (open && open.id === m.id) box.appendChild(open.what === 'edit' ? memberEditPanel(c, m) : messagePanel(C.memberText(c, m, state.cur, today), m.phone, 'Reminder for ' + m.name));
            list.appendChild(box);
        });
    }
    function focusPanel(id) { const p = document.querySelector('.member[data-id="' + id + '"] .panel input, .member[data-id="' + id + '"] .panel textarea'); if (p) p.focus(); }

    // ---------- round ----------
    function setPaid(c, r, m, cents) {
        const before = snap();
        if (cents > 0) (c.paid[r] = c.paid[r] || {})[m.id] = { c: cents, d: today };
        else if (c.paid[r]) { delete c.paid[r][m.id]; if (!Object.keys(c.paid[r]).length) delete c.paid[r]; }
        partOpen = null;
        commit(before);
        const s = C.roundStatus(c, r);
        say('round-msg', (cents >= C.dueOf(c, m) ? m.name + ' paid ' + f(cents) + '.' : cents > 0 ? m.name + ' paid ' + f(cents) + ', ' + f(C.dueOf(c, m) - cents) + ' still to pay.' : m.name + ' marked as not paid.') +
            ' Paid ' + s.paidCount + ' of ' + s.memberCount + (s.allPaid ? ': everyone has paid.' : '.'), true);
    }
    function renderRound() {
        const c = com(), n = c ? C.rounds(c) : 0;
        $('round').hidden = !(ready(c) && n >= 2);
        if ($('round').hidden) return;
        const cr = C.currentRound(c, today);
        if (view == null || view >= n) view = cr.r;
        const r = view, s = C.roundStatus(c, r), d = C.roundDate(c, r), gap = C.daysBetween(today, d);
        $('round-h').textContent = 'Round ' + (r + 1) + ' of ' + n;
        $('r-prev').disabled = r === 0; $('r-next').disabled = r === n - 1;
        $('r-date').textContent = 'Collection date: ' + nice(d) + (gap === 0 ? ' (today)' : gap === 1 ? ' (tomorrow)' : gap > 0 ? ' (in ' + gap + ' days)' : gap === -1 ? ' (yesterday)' : ' (' + -gap + ' days ago)');
        $('r-today').hidden = r === cr.r;
        $('r-today').textContent = cr.started ? 'Go back to this round (round ' + (cr.r + 1) + ')' : 'Go back to round 1';
        const note = $('r-note');
        note.hidden = true;
        if (!cr.started && r === 0) { note.hidden = false; note.textContent = 'The committee starts on ' + nice(c.start) + '. You can tick early payments already.'; }
        else if (gap > 0 && cr.started) { note.hidden = false; note.textContent = 'This round is still to come. Payments ticked here are early payments.'; }
        $('r-taker').textContent = C.headline(c, r, state.cur);
        $('r-handed').checked = s.handed;
        $('r-handed-l').textContent = 'Pot handed over to ' + s.taker.name;
        $('r-progress').textContent = 'Paid: ' + s.paidCount + ' of ' + s.memberCount + ' (' + f(s.paidCents) + ' of ' + f(s.dueCents) + ')';
        $('r-bar').style.width = (s.dueCents ? Math.round(s.paidCents * 100 / s.dueCents) : 0) + '%';
        const left = $('r-left'); left.className = 'r-left' + (s.allPaid ? ' good' : '');
        left.textContent = s.allPaid ? 'Everyone has paid this round.' : 'Still to pay: ' + s.unpaid.map(u => u.m.name + ' ' + f(u.left)).join(', ') + ' (' + f(s.leftCents) + ' in all)';
        const list = $('pay-list'); list.textContent = '';
        s.rows.forEach(row => {
            const m = row.m, box = el('div', 'pay' + (row.full ? ' paid' : row.paid ? ' part' : ''));
            box.dataset.id = m.id;
            const info = el('div', 'pay-info');
            const nm = el('p', 'pay-name', m.name); if (m.id === s.taker.id) nm.appendChild(el('span', 'tag gold', 'takes the pot')); info.appendChild(nm);
            info.appendChild(el('p', 'pay-st', row.full ? 'Paid ' + f(row.paid) + (row.date ? ' on ' + nice(row.date) : '') : row.paid ? 'Paid ' + f(row.paid) + ', ' + f(row.left) + ' still to pay' : 'Not paid: ' + f(row.due) + ' due'));
            box.appendChild(info);
            const b = el('div', 'pay-btns');
            if (!row.full) b.appendChild(btn('primary small', 'Paid in full', () => setPaid(c, r, m, row.due)));
            if (!row.full) b.appendChild(btn('secondary small', 'Part payment', () => { partOpen = partOpen === m.id ? null : m.id; render(); const i = document.querySelector('.pay[data-id="' + m.id + '"] input'); if (i) i.focus(); }));
            if (row.paid) b.appendChild(btn('secondary small', 'Mark as not paid', () => setPaid(c, r, m, 0)));
            box.appendChild(b);
            if (partOpen === m.id && !row.full) {
                const p = el('div', 'panel part-panel'), id = 'part-' + m.id;
                const l = el('label', '', 'Total paid so far for this round (of ' + f(row.due) + ')'); l.htmlFor = id; p.appendChild(l);
                const inp = el('input'); inp.type = 'text'; inp.id = id; inp.inputMode = 'decimal'; inp.maxLength = 20; inp.autocomplete = 'off'; inp.placeholder = 'e.g. ' + (row.due / 200).toFixed(0);
                if (row.paid) inp.value = (row.paid / 100).toFixed(row.paid % 100 ? 2 : 0);
                p.appendChild(inp);
                const err = el('p', 'err'); err.setAttribute('role', 'alert'); p.appendChild(err);
                const go = () => {
                    const a = C.parseAmount(inp.value);
                    if (a.error) { err.textContent = a.error; return inp.focus(); }
                    if (a.cents > row.due) { err.textContent = 'That is more than the ' + f(row.due) + ' due this round. To pay ahead, go to the next round with "Next".'; return inp.focus(); }
                    setPaid(c, r, m, a.cents);
                };
                inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') { partOpen = null; render(); } });
                const row2 = el('div', 'row-btns');
                row2.appendChild(btn('primary small', 'Save', go)); row2.appendChild(btn('secondary small', 'Cancel', () => { partOpen = null; render(); }));
                p.appendChild(row2); box.appendChild(p);
            }
            list.appendChild(box);
        });
        const text = C.roundText(c, r, state.cur, today);
        $('r-wa').href = C.waLink('', text);
        $('r-mail').href = 'mailto:?subject=' + encodeURIComponent(c.name + ': round ' + (r + 1)) + '&body=' + encodeURIComponent(text);
        $('r-share').hidden = !navigator.share;
    }

    // ---------- turn order ----------
    function renderTurns() {
        const c = com(), n = c ? C.rounds(c) : 0;
        $('turns').hidden = !(ready(c) && n >= 2);
        if ($('turns').hidden) return;
        const free = c.order.filter((id, r) => !C.isLocked(c, r)).length;
        $('draw').disabled = free < 2;
        $('drawn').textContent = c.drawn ? 'Order drawn at random on ' + nice(c.drawn) + '.' : '';
        const list = $('t-list'); list.textContent = '';
        const seen = {};
        c.order.forEach((id, r) => {
            const m = C.memberById(c, id); seen[id] = (seen[id] || 0) + 1;
            const li = el('li', 't-row' + (C.isLocked(c, r) ? ' locked' : '') + (r === view ? ' viewing' : ''));
            const info = el('div', 't-info');
            info.appendChild(el('span', 't-num', String(r + 1)));
            const txt = el('div', 't-txt');
            txt.appendChild(el('p', 't-who', m.name + (m.shares > 1 ? ' (share ' + seen[id] + ' of ' + m.shares + ')' : '')));
            txt.appendChild(el('p', 't-when', nice(C.roundDate(c, r)) + (C.isLocked(c, r) ? ' · pot handed over' : '')));
            info.appendChild(txt); li.appendChild(info);
            const b = el('div', 't-btns');
            const up = btn('secondary small arrow', '↑', () => doMove(r, -1)); up.setAttribute('aria-label', 'Move ' + m.name + ' to round ' + r);
            const dn = btn('secondary small arrow', '↓', () => doMove(r, 1)); dn.setAttribute('aria-label', 'Move ' + m.name + ' to round ' + (r + 2));
            up.disabled = r === 0 || C.isLocked(c, r) || C.isLocked(c, r - 1);
            dn.disabled = r === n - 1 || C.isLocked(c, r) || C.isLocked(c, r + 1);
            b.appendChild(up); b.appendChild(dn); li.appendChild(b);
            list.appendChild(li);
        });
    }
    function doMove(r, dir) {
        const c = com(), before = snap();
        if (!C.move(c, r, dir)) return;
        commit(before); clearMsgs('turns-msg');
        say('turns-msg', C.memberById(c, c.order[r + dir]).name + ' now takes the pot in round ' + (r + dir + 1) + ', and ' + C.memberById(c, c.order[r]).name + ' in round ' + (r + 1) + '.', true);
        const btns = document.querySelectorAll('#t-list .t-row')[r + dir];
        if (btns) { const b = btns.querySelectorAll('button')[dir < 0 ? 0 : 1]; if (b && !b.disabled) b.focus(); }
    }

    // ---------- share, print, backup ----------
    async function copy(text, note) {
        let done = false;
        try { await navigator.clipboard.writeText(text); done = true; } catch (e) {
            const ta = el('textarea'); ta.value = text; ta.style.position = 'absolute'; ta.style.left = '-9999px'; document.body.appendChild(ta); ta.select();
            try { done = document.execCommand('copy'); } catch (e2) { done = false; } ta.remove();
        }
        if (typeof note === 'string') say(note, done ? 'Copied. Paste it into WhatsApp, a text or an email.' : 'Could not copy here. Select the text and copy it yourself.');
        else if (note) { note.textContent = done ? 'Copied.' : 'Could not copy here. Select the text and copy it yourself.'; note.classList.add('show'); }
    }
    function download(name, text) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function buildReport() {
        const c = com(), rep = $('report'), n = C.rounds(c); rep.textContent = '';
        rep.appendChild(el('h2', '', c.name + ' committee'));
        rep.appendChild(el('p', '', f(c.amount) + ' per share ' + C.FREQS[c.freq].per + ' · ' + C.plural(c.members.length, 'member', 'members') + ' · pot ' + f(C.pot(c)) + ' · ' + C.plural(n, 'round', 'rounds') + ' from ' + nice(c.start) + ' to ' + nice(C.roundDate(c, n - 1))));
        rep.appendChild(el('p', '', 'Printed ' + nice(today) + '. ✓ = paid in full, a number = part paid.'));
        const t = el('table'), th = el('thead'), hr = el('tr');
        hr.appendChild(el('th', '', 'Member'));
        for (let r = 0; r < n; r++) { const h = el('th', '', String(r + 1)); h.title = nice(C.roundDate(c, r)); hr.appendChild(h); }
        hr.appendChild(el('th', '', 'Owes now'));
        th.appendChild(hr); t.appendChild(th);
        const tb = el('tbody');
        c.members.forEach(m => {
            const tr = el('tr'), s = C.memberSummary(c, m, today);
            tr.appendChild(el('td', '', m.name + (m.shares > 1 ? ' (' + m.shares + ')' : '')));
            for (let r = 0; r < n; r++) { const p = C.paidIn(c, r, m.id); tr.appendChild(el('td', '', p >= C.dueOf(c, m) ? '✓' : p ? C.fmt(p, '') : '')); }
            tr.appendChild(el('td', '', s.owedCents ? f(s.owedCents) : '-'));
            tb.appendChild(tr);
        });
        t.appendChild(tb); rep.appendChild(t);
        rep.appendChild(el('h3', '', 'Turn order'));
        const t2 = el('table'), h2 = el('tr'); ['Round', 'Date', 'Takes the pot', 'Handed over'].forEach(x => h2.appendChild(el('th', '', x)));
        const th2 = el('thead'); th2.appendChild(h2); t2.appendChild(th2);
        const tb2 = el('tbody');
        c.order.forEach((id, r) => { const tr = el('tr'); [String(r + 1), nice(C.roundDate(c, r)), C.memberById(c, id).name, C.isLocked(c, r) ? 'Yes' : ''].forEach(x => tr.appendChild(el('td', '', x))); tb2.appendChild(tr); });
        t2.appendChild(tb2); rep.appendChild(t2);
    }

    function render() {
        today = C.dayStr(new Date());
        const c = com();
        renderSetup(); renderMembers(); renderRound(); renderTurns();
        $('tools').hidden = !ready(c);
        $('cur').value = state.cur;
        const big = c && C.rounds(c) >= 2;
        $('copy-sheet').disabled = !big; $('print-sheet').disabled = !big;
    }

    function init() {
        load();
        Object.keys(CUR_NAMES).forEach(k => { const o = el('option', '', CUR_NAMES[k]); o.value = k; $('cur').appendChild(o); });
        sharesSelect($('m-shares'), 1);
        fillSetup(com());
        $('c-save').addEventListener('click', saveSetup);
        ['c-name', 'c-amount'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') saveSetup(); }));
        $('c-cancel').addEventListener('click', () => {
            const c = com();
            if (c && !ready(c)) { state.committees = state.committees.filter(x => x.id !== c.id); state.active = state.committees[0].id; save(); }
            editingSetup = false; fillSetup(com()); clearMsgs(); render();
        });
        $('edit-c').addEventListener('click', () => { editingSetup = true; fillSetup(com()); clearMsgs(); render(); $('c-name').focus(); });
        $('new-c').addEventListener('click', () => {
            clearMsgs();
            const c = C.newCommittee(newId('c'), today); c.name = '';
            state.committees.push(c); state.active = c.id; editingSetup = false; view = null; open = null; partOpen = null;
            fillSetup(null); render(); $('c-name').focus();
        });
        $('pick').addEventListener('change', () => {
            const c0 = com(); if (c0 && !ready(c0)) state.committees = state.committees.filter(x => x.id !== c0.id);
            state.active = $('pick').value; view = null; open = null; partOpen = null; editingSetup = false; save(); fillSetup(com()); clearMsgs(); render();
        });
        $('m-add').addEventListener('click', addMember);
        $('m-name').addEventListener('keydown', e => { if (e.key === 'Enter') addMember(); });
        $('m-phone').addEventListener('keydown', e => { if (e.key === 'Enter') addMember(); });
        $('m-phone-open').addEventListener('click', () => { $('m-phone-box').hidden = false; $('m-phone-open').hidden = true; $('m-phone').focus(); });
        $('r-prev').addEventListener('click', () => { view = Math.max(0, view - 1); partOpen = null; clearMsgs(); render(); });
        $('r-next').addEventListener('click', () => { view = Math.min(C.rounds(com()) - 1, view + 1); partOpen = null; clearMsgs(); render(); });
        $('r-today').addEventListener('click', () => { view = null; partOpen = null; clearMsgs(); render(); $('r-prev').focus(); });
        $('r-handed').addEventListener('change', () => {
            const c = com(), before = snap(), s = C.roundStatus(c, view);
            if ($('r-handed').checked) c.handed[view] = c.order[view]; else delete c.handed[view];
            commit(before); clearMsgs('round-msg');
            say('round-msg', $('r-handed').checked ? 'Pot of ' + f(s.pot) + ' handed over to ' + s.taker.name + '. This turn is now fixed.' + (s.allPaid ? '' : ' Note: not everyone has paid this round yet.') : 'Hand-over taken back for round ' + (view + 1) + '.', true);
        });
        $('r-copy').addEventListener('click', () => copy(C.roundText(com(), view, state.cur, today), 'round-msg'));
        $('r-share').addEventListener('click', () => { navigator.share({ text: C.roundText(com(), view, state.cur, today) }).catch(() => {}); });
        $('draw').addEventListener('click', () => {
            const c = com(), before = snap();
            const rand = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
            C.draw(c, rand); c.drawn = today;
            commit(before); clearMsgs('turns-msg');
            say('turns-msg', 'New order drawn. Round 1: ' + C.memberById(c, c.order[0]).name + (C.isLocked(c, 0) ? ' (fixed)' : '') + '.', true);
        });
        $('copy-sheet').addEventListener('click', () => { clearMsgs('tools-msg'); copy(C.sheetText(com(), state.cur, today), 'tools-msg'); });
        $('print-sheet').addEventListener('click', () => { clearMsgs('tools-msg'); buildReport(); window.print(); });
        $('backup').addEventListener('click', () => {
            clearMsgs('tools-msg');
            download('committee-tracker-backup-' + today + '.json', JSON.stringify(Object.assign({ app: 'committee-and-rosca-tracker-for-savings-groups', saved: today }, state), null, 1));
            say('tools-msg', 'Backup file saved to your downloads. Keep it somewhere safe, such as your email or cloud drive.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-first').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', async () => {
            clearMsgs();
            const where = $('tools').hidden ? 'setup-msg' : 'tools-msg';
            const file = $('restore-file').files[0]; $('restore-file').value = '';
            if (!file) return;
            if (file.size > 5e6) return say(where, 'That file is too big to be a backup from this app. Nothing was changed.');
            let s = null; try { s = C.normalize(JSON.parse(await file.text()), today); } catch (e) { s = null; }
            if (!s || !s.committees.length) return say(where, 'That file is not a backup from this app. Nothing was changed.');
            const before = snap(); state = s; view = null; open = null; partOpen = null; editingSetup = false;
            commit(before); fillSetup(com());
            say(where, 'Backup restored: ' + C.plural(s.committees.length, 'committee', 'committees') + '.', true);
        });
        $('cur').addEventListener('change', () => { state.cur = C.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; save(); render(); });
        $('del-c').addEventListener('click', () => {
            const c = com(); if (!c) return;
            const before = snap();
            state.committees = state.committees.filter(x => x.id !== c.id); state.active = state.committees[0] ? state.committees[0].id : '';
            view = null; open = null; partOpen = null; editingSetup = false;
            commit(before); fillSetup(com()); clearMsgs();
            say(state.committees.length ? 'tools-msg' : 'setup-msg', 'Deleted the ' + c.name + ' committee.', true);
        });
        window.addEventListener('storage', e => { if (e.key === KEY) { load(); render(); } });
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.dayStr(new Date()) !== today) render(); });
        render();
        if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
