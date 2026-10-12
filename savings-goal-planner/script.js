// Page code for Savings Goal Planner. The maths lives in core.js (SavingsCore).
(function () {
    const C = window.SavingsCore, KEY = 'savings-goal-planner.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (text, cls) => { const b = el('button', cls, text); b.type = 'button'; return b; };

    let state = load(), canSave = true, todayStr = C.today();
    let editingId = null, gone = null, panel = null;   // panel = { id, kind: 'in' | 'out' } for the Add money / Take money out box
    const msgs = {};                                     // a message (with an optional Undo) shown in one goal's box: { [goalId]: { text, undo } }
    const openLogs = new Set();                          // goals whose "Money in and out" list is open

    function load() {
        try { const raw = localStorage.getItem(KEY); return C.clean(raw ? JSON.parse(raw) : null); } catch (e) { return C.clean(null); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { if (canSave) { canSave = false; $('save-warn').hidden = false; } }
    }
    const snapshot = () => JSON.parse(JSON.stringify(state));
    const money = c => C.fmt(c, state.cur);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const day = s => s === todayStr ? 'today' : C.dateText(s);

    function say(box, text, undo) {
        box.textContent = text;
        if (undo) {
            const b = btn('Undo');
            b.addEventListener('click', () => { undo(); box.textContent = ''; });
            box.appendChild(b);
        }
    }
    const clearMsgs = () => { ['add-msg', 'goals-msg', 'tools-msg'].forEach(id => { $(id).textContent = ''; }); Object.keys(msgs).forEach(k => delete msgs[k]); };
    function amountError(r, what) {
        return r.err === 'negative' ? what + ' cannot be below 0.' : r.err === 'big' ? what + ' is too big (up to 10,000,000).' : 'Type ' + what.toLowerCase() + ' as a number, for example 250.';
    }

    // ---- the answer for one goal, in words
    function answer(g) {
        const p = C.plan(g, todayStr), f = C.FREQS[g.freq], a = { p, cls: '', label: '', big: '', text: '', next: '' };
        // "8 payments of 225.00" or "11 payments of 118.19, the last one only 118.09" (with "a week" after the amount when asked)
        const paysText = (count, pay, last, every) => plural(count, 'payment', 'payments') + ' of ' + money(pay) + (every ? ' ' + every : '') + (last !== pay ? ', the last one only ' + money(last) : '');
        const interest = p.interest ? ' Interest adds ' + money(p.interest) + '.' : '';
        if (p.status === 'reached') {
            a.cls = 'good'; a.label = 'Goal reached'; a.big = money(p.saved);
            a.text = p.extra ? 'You have ' + money(p.extra) + ' more than you need.' : 'You have exactly what you need.';
        } else if (p.status === 'plan') {
            a.label = 'Save'; a.big = money(p.pay) + ' ' + f.every;
            a.text = (p.count === 1 ? 'One payment of ' + money(p.last) + ' ' + day(p.first) + ' reaches ' + money(g.target) + '.'
                : paysText(p.count, p.pay, p.last) + ', from ' + day(p.first) + ' to ' + C.dateText(p.lastDate) + '. That reaches ' + money(g.target) + ' by ' + C.dateText(g.date) + '.') + interest;
            a.next = nextText(g, p);
        } else if (p.status === 'when') {
            a.label = 'You reach it on'; a.big = C.dateText(p.date);
            a.text = (p.count === 0 ? 'Interest alone gets you there, with no more payments.' : paysText(p.count, p.pay, p.last, f.every) + '.') + interest;
            if (p.count) a.next = nextText(g, p);
        } else if (p.status === 'past') {
            a.cls = 'warn'; a.label = 'Still needed'; a.big = money(p.rem);
            a.text = 'The goal date, ' + C.dateText(g.date) + ', has passed. Tap Edit to pick a later date, or switch to Save a set amount.';
        } else if (p.status === 'too-soon') {
            a.cls = 'warn'; a.label = 'Still needed by ' + C.dateText(g.date); a.big = money(p.rem);
            a.text = 'Your next regular payment, on ' + C.dateText(p.first) + ', comes after the goal date, so put the rest in before then.';
        } else if (p.status === 'never') {
            a.cls = 'warn'; a.label = 'Not reachable yet'; a.big = 'Save more than 0';
            a.text = 'Saving ' + money(0) + ' ' + f.every + ' never gets you there. Tap Edit and type how much you can save.';
        } else {
            a.cls = 'warn'; a.label = 'Too slow'; a.big = 'Over ' + C.MAX_YEARS + ' years';
            a.text = 'At ' + money(g.pay) + ' ' + f.every + ' it would take more than ' + C.MAX_YEARS + ' years. Tap Edit and save more each time.';
        }
        return a;
    }
    function nextText(g, p) {
        const amount = money(p.count === 1 ? p.last : p.pay);
        if (p.first === todayStr) return 'Next payment: ' + amount + ' today.';
        return 'Next payment: ' + amount + ' on ' + C.dateText(p.first) + '. You already saved this ' + C.FREQS[g.freq].one + '.';
    }

    // ---- render
    function render() {
        document.querySelectorAll('.sym').forEach(e => { e.textContent = state.cur; });
        const has = state.goals.length > 0;
        $('intro').hidden = has;
        $('goals-n').textContent = has ? '(' + state.goals.length + ')' : '';

        // all goals
        $('summary').hidden = !has;
        let have = 0, want = 0, perMonth = 0, mixed = false;
        const answers = state.goals.map(g => answer(g));
        state.goals.forEach((g, i) => {
            const s = C.saved(g); have += s; want += g.target;
            const p = answers[i].p;
            if ((p.status === 'plan' || p.status === 'when') && p.count > 0) { perMonth += C.perMonth(p.pay, g.freq); if (g.freq !== 'month') mixed = true; }
        });
        $('sum-saved').textContent = money(have);
        $('sum-meta').textContent = 'saved of ' + money(want) + ' for ' + plural(state.goals.length, 'goal', 'goals') + (want ? ' (' + Math.floor(Math.min(have, want) * 100 / want) + '%)' : '') + '.';
        $('sum-bar').style.width = (want ? Math.min(100, have * 100 / want) : 0).toFixed(1) + '%';
        $('sum-month').textContent = perMonth ? 'To stay on plan you save ' + (mixed ? 'about ' : '') + money(perMonth) + ' a month in total.' : '';

        const ul = $('goals'); ul.textContent = '';
        state.goals.forEach((g, i) => {
            if (gone && gone.index === i) ul.appendChild(goneRow());
            ul.appendChild(goalBox(g, answers[i]));
        });
        if (gone && gone.index >= state.goals.length) ul.appendChild(goneRow());
        $('mail').href = mailHref();
        save();
    }

    function goneRow() {
        const li = el('li', 'goal gone');
        li.appendChild(el('span', null, gone.goal.name + ' deleted.'));
        const b = btn('Undo');
        b.addEventListener('click', () => { state.goals.splice(Math.min(gone.index, state.goals.length), 0, gone.goal); const id = gone.goal.id; gone = null; render(); focusGoal(id); });
        li.appendChild(b);
        return li;
    }
    function focusGoal(id, sel) { const b = document.querySelector('.goal[data-id="' + id + '"] ' + (sel || '.g-btns button')); if (b) b.focus(); }

    function goalBox(g, a) {
        const li = el('li', 'goal' + (editingId === g.id ? ' editing' : '')); li.dataset.id = g.id; li.style.setProperty('--c', g.color);
        const s = C.saved(g), pct = Math.floor(Math.min(s, g.target) * 100 / g.target);
        const top = el('div', 'g-top');
        top.appendChild(el('h3', null, g.name));
        top.appendChild(el('span', 'g-pct', pct + '%'));
        li.appendChild(top);
        const line = el('p', 'g-saved');
        line.appendChild(el('b', null, money(s)));
        line.appendChild(document.createTextNode(' of ' + money(g.target) + ' saved' + (g.mode === 'date' ? ', goal date ' + C.dateText(g.date) : '') + (g.rate ? ', ' + C.rateText(g.rate) + '% interest' : '') + '.'));
        li.appendChild(line);
        const bar = el('div', 'bar'); bar.setAttribute('aria-hidden', 'true');
        const bi = el('i'); bi.style.width = pct + '%'; bar.appendChild(bi); li.appendChild(bar);

        const ans = el('div', 'answer' + (a.cls ? ' ' + a.cls : ''));
        ans.appendChild(el('p', 'a-label', a.label));
        ans.appendChild(el('p', 'a-big', a.big));
        ans.appendChild(el('p', 'a-text', a.text));
        li.appendChild(ans);
        if (a.next) li.appendChild(el('p', 'g-next', a.next));

        const btns = el('div', 'g-btns');
        const bIn = btn('Add money', 'in'), bOut = btn('Take money out'), bEd = btn('Edit'), bDel = btn('Delete');
        [[bIn, 'Add money to '], [bOut, 'Take money out of '], [bEd, 'Edit '], [bDel, 'Delete ']].forEach(([b, t]) => b.setAttribute('aria-label', t + g.name));
        bOut.disabled = s <= 0;
        bIn.addEventListener('click', () => openPanel(g, 'in'));
        bOut.addEventListener('click', () => openPanel(g, 'out'));
        bEd.addEventListener('click', () => startEdit(g));
        bDel.addEventListener('click', () => {
            const i = state.goals.indexOf(g); if (i < 0) return;
            if (editingId === g.id) stopEdit();
            if (panel && panel.id === g.id) panel = null;
            state.goals.splice(i, 1); gone = { goal: g, index: i }; clearMsgs(); render();
            const u = document.querySelector('.goal.gone button'); if (u) u.focus();
        });
        [bIn, bOut, bEd, bDel].forEach(b => btns.appendChild(b));
        li.appendChild(btns);
        if (panel && panel.id === g.id) li.appendChild(moneyPanel(g, panel.kind));
        const msg = el('p', 'msg'); msg.setAttribute('role', 'status');
        const m = msgs[g.id];
        if (m) say(msg, m.text, m.undo ? () => { delete msgs[g.id]; m.undo(); } : null);
        li.appendChild(msg);
        if (g.log.length) li.appendChild(logBox(g));
        return li;
    }
    const goalSay = (id, text, undo) => { msgs[id] = { text, undo }; };

    function moneyPanel(g, kind) {
        const box = el('div', 'money-panel');
        box.appendChild(el('h4', null, kind === 'in' ? 'Add money to ' + g.name : 'Take money out of ' + g.name));
        const two = el('div', 'two'), d1 = el('div'), d2 = el('div');
        const l1 = el('label', null, kind === 'in' ? 'Amount put in' : 'Amount taken out'); l1.htmlFor = 'pm-amt';
        const m = el('div', 'money'); const sym = el('span', 'sym', state.cur); sym.setAttribute('aria-hidden', 'true'); m.appendChild(sym);
        const amt = el('input'); amt.type = 'text'; amt.id = 'pm-amt'; amt.inputMode = 'decimal'; amt.maxLength = 16; amt.autocomplete = 'off';
        const p = C.plan(g, todayStr);
        amt.placeholder = kind === 'in' && (p.status === 'plan' || p.status === 'when') && p.count ? C.plain(p.count === 1 ? p.last : p.pay) : 'e.g. 100';
        m.appendChild(amt); d1.appendChild(l1); d1.appendChild(m);
        const l2 = el('label', null, 'Date'); l2.htmlFor = 'pm-date';
        const date = el('input'); date.type = 'date'; date.id = 'pm-date'; date.value = todayStr; date.max = todayStr; date.min = '2000-01-01';
        d2.appendChild(l2); d2.appendChild(date);
        two.appendChild(d1); two.appendChild(d2); box.appendChild(two);
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); box.appendChild(err);
        const bb = el('div', 'two-btn'), ok = btn('Save', 'primary'), no = btn('Cancel', 'secondary');
        bb.appendChild(ok); bb.appendChild(no); box.appendChild(bb);
        function done() {
            const r = C.parseAmount(amt.value);
            if (r.blank) { err.textContent = 'Type the amount.'; amt.focus(); return; }
            if (r.err) { err.textContent = amountError(r, 'The amount'); amt.focus(); return; }
            if (!r.cents) { err.textContent = 'The amount must be more than 0.'; amt.focus(); return; }
            if (!C.validDate(date.value)) { err.textContent = 'Choose the date.'; date.focus(); return; }
            if (date.value > todayStr) { err.textContent = 'The date cannot be in the future.'; date.focus(); return; }
            const have = C.saved(g);
            if (kind === 'out' && r.cents > have) { err.textContent = 'You can take out at most ' + money(have) + ', what is saved.'; amt.focus(); return; }
            if (g.log.length >= C.MAX_LOG) { err.textContent = 'This goal has too many entries. Delete some old ones first.'; return; }
            const before = snapshot();
            const entry = { id: C.newId('d'), date: date.value, cents: kind === 'in' ? r.cents : -r.cents };
            g.log.push(entry); panel = null; clearMsgs();
            const after = answer(g);
            goalSay(g.id, (kind === 'in' ? 'Added ' + money(r.cents) + '. ' : 'Took out ' + money(r.cents) + '. ') + (after.p.status === 'reached' ? 'Goal reached!' : after.next || ''), () => { state = before; render(); focusGoal(g.id); });
            render(); focusGoal(g.id);
        }
        function cancel() { panel = null; render(); focusGoal(g.id, kind === 'in' ? '.g-btns button.in' : '.g-btns button:nth-child(2)'); }
        ok.addEventListener('click', done); no.addEventListener('click', cancel);
        [amt, date].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); } }));
        return box;
    }
    function openPanel(g, kind) {
        panel = panel && panel.id === g.id && panel.kind === kind ? null : { id: g.id, kind };
        gone = null; clearMsgs(); render();
        const f = $('pm-amt'); if (f) f.focus();
    }

    function logBox(g) {
        const d = el('details', 'log'), ul = el('ul');
        if (openLogs.has(g.id)) d.open = true;
        d.addEventListener('toggle', () => { if (d.open) openLogs.add(g.id); else openLogs.delete(g.id); ul.hidden = !d.open; });
        d.appendChild(el('summary', null, 'Money in and out (' + g.log.length + ')'));
        g.log.map((x, i) => ({ x, i })).sort((a, b) => a.x.date < b.x.date ? 1 : a.x.date > b.x.date ? -1 : b.i - a.i).forEach(({ x }) => {
            const li = el('li');
            li.appendChild(el('span', null, C.dateText(x.date)));
            li.appendChild(el('b', x.cents > 0 ? 'in' : 'out', (x.cents > 0 ? '+' : '−') + money(Math.abs(x.cents))));
            const b = btn('Delete'); b.setAttribute('aria-label', 'Delete ' + (x.cents > 0 ? 'money in' : 'money out') + ' of ' + money(Math.abs(x.cents)) + ' on ' + C.dateText(x.date));
            b.addEventListener('click', () => {
                if (C.saved(g) - x.cents < 0) { clearMsgs(); goalSay(g.id, 'This cannot be deleted: you took more out later. Delete that first.'); render(); return; }
                const before = snapshot();
                g.log.splice(g.log.indexOf(x), 1); clearMsgs();
                goalSay(g.id, (x.cents > 0 ? 'Money in' : 'Money out') + ' of ' + money(Math.abs(x.cents)) + ' on ' + C.dateText(x.date) + ' deleted.', () => { state = before; render(); focusGoal(g.id); });
                render(); focusGoal(g.id, '.msg button');
            });
            li.appendChild(b);
            ul.appendChild(li);
        });
        ul.hidden = !d.open;   // closed lists take no room at all
        d.appendChild(ul);
        return d;
    }

    // ---- the goal form
    function setMode(m) { $(m === 'amount' ? 'm-amount' : 'm-date').checked = true; showMode(); }
    function showMode() { const amount = $('m-amount').checked; $('date-box').hidden = amount; $('pay-box').hidden = !amount; }
    document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', showMode));
    $('open-rate').addEventListener('click', () => { $('rate-box').hidden = false; $('open-rate').hidden = true; $('f-rate').focus(); });
    $('close-rate').addEventListener('click', () => { $('rate-box').hidden = true; $('open-rate').hidden = false; $('f-rate').value = ''; $('open-rate').focus(); });

    function readForm() {
        const name = $('f-name').value.replace(/\s+/g, ' ').trim();
        if (!name) return { err: 'Type what you are saving for, for example Trip to Japan.', field: $('f-name') };
        const t = C.parseAmount($('f-target').value);
        if (t.blank) return { err: 'Type the goal amount, for example 3000.', field: $('f-target') };
        if (t.err) return { err: amountError(t, 'The goal amount'), field: $('f-target') };
        if (!t.cents) return { err: 'The goal amount must be more than 0.', field: $('f-target') };
        const s = C.parseAmount($('f-start').value);
        if (s.err) return { err: amountError(s, 'Saved so far'), field: $('f-start') };
        const mode = $('m-amount').checked ? 'amount' : 'date';
        let date = null, pay = 0;
        if (mode === 'date') {
            date = $('f-date').value;
            if (!C.validDate(date)) return { err: 'Choose the goal date: when you need the money.', field: $('f-date') };
            if (date <= todayStr) return { err: 'Choose a goal date after today.', field: $('f-date') };
        } else {
            const p = C.parseAmount($('f-pay').value);
            if (p.blank) return { err: 'Type how much you can save each time, for example 200.', field: $('f-pay') };
            if (p.err) return { err: amountError(p, 'The amount'), field: $('f-pay') };
            if (!p.cents) return { err: 'How much you can save must be more than 0.', field: $('f-pay') };
            pay = p.cents;
        }
        let rate = 0;
        if (!$('rate-box').hidden) {
            const r = C.parseRate($('f-rate').value);
            if (r.err) return { err: r.err === 'big' ? 'Interest can be up to 30% a year.' : r.err === 'negative' ? 'Interest cannot be below 0.' : 'Type the interest as a number, for example 4.5.', field: $('f-rate') };
            rate = r.blank ? 0 : r.n;
        }
        return { goal: { name: name.slice(0, C.MAX_NAME), target: t.cents, saved: s.blank ? 0 : s.cents, mode, date, pay, freq: C.FREQS[$('f-freq').value] ? $('f-freq').value : 'month', rate } };
    }
    function resetForm() {
        ['f-name', 'f-target', 'f-start', 'f-date', 'f-pay', 'f-rate'].forEach(id => { $(id).value = ''; });
        $('f-freq').value = 'month'; setMode('date');
        $('rate-box').hidden = true; $('open-rate').hidden = false; $('form-err').textContent = '';
    }
    $('form').addEventListener('submit', ev => {
        ev.preventDefault();
        const r = readForm();
        $('form-err').textContent = r.err || '';
        if (r.err) { r.field.focus(); return; }
        const before = snapshot(), v = r.goal;
        gone = null; clearMsgs();
        if (editingId) {
            const g = state.goals.find(x => x.id === editingId);
            if (g) {
                const logSum = g.log.reduce((a, x) => a + x.cents, 0);
                Object.assign(g, { name: v.name, target: v.target, start: v.saved - logSum, mode: v.mode, date: v.mode === 'date' ? v.date : g.date, pay: v.mode === 'amount' ? v.pay : g.pay, freq: v.freq, rate: v.rate });
                goalSay(g.id, 'Changes saved.', () => { state = before; render(); focusGoal(g.id); });
            }
            const id = editingId; stopEdit(); render(); focusGoal(id);
            say($('add-msg'), 'Changes saved to ' + v.name + '.');
            return;
        }
        if (state.goals.length >= C.MAX_GOALS) { $('form-err').textContent = 'You can have up to ' + C.MAX_GOALS + ' goals. Delete one first.'; return; }
        const used = state.goals.map(g => g.color), color = C.COLORS.find(c => !used.includes(c)) || C.COLORS[state.goals.length % C.COLORS.length];
        const g = { id: C.newId('g'), name: v.name, target: v.target, start: v.saved, mode: v.mode, date: v.date, pay: v.pay, freq: v.freq, rate: v.rate, color, log: [] };
        state.goals.push(g);
        resetForm(); render();
        say($('add-msg'), 'Added ' + g.name + '. ' + answer(g).big + (answer(g).label === 'You reach it on' ? ': you reach it then.' : '.'), () => { state = before; render(); });
        const box = document.querySelector('.goal[data-id="' + g.id + '"]'); if (box && box.scrollIntoView) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        $('f-name').focus({ preventScroll: true });
    });

    function startEdit(g) {
        editingId = g.id; gone = null; panel = null; clearMsgs();
        $('form-h').textContent = 'Edit ' + g.name;
        $('save').textContent = 'Save changes';
        $('cancel-edit').hidden = false; $('form-btns').classList.add('editing'); $('form').classList.add('editing');
        $('f-name').value = g.name;
        $('f-target').value = C.plain(g.target);
        const s = C.saved(g); $('f-start').value = s ? C.plain(s) : '';
        $('f-date').value = g.date || '';
        $('f-pay').value = g.pay ? C.plain(g.pay) : '';
        $('f-freq').value = g.freq;
        setMode(g.mode);
        $('rate-box').hidden = !g.rate; $('open-rate').hidden = !!g.rate; $('f-rate').value = g.rate ? C.rateText(g.rate) : '';
        $('form-err').textContent = '';
        render();
        $('form').scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('f-name').focus({ preventScroll: true });
    }
    function stopEdit() {
        const id = editingId; editingId = null;
        $('form-h').textContent = 'Add a savings goal';
        $('save').textContent = 'Add goal';
        $('cancel-edit').hidden = true; $('form-btns').classList.remove('editing'); $('form').classList.remove('editing');
        resetForm();
        return id;
    }
    $('cancel-edit').addEventListener('click', () => { const id = stopEdit(); render(); focusGoal(id); });
    $('form').addEventListener('keydown', e => { if (e.key === 'Escape' && editingId) { e.preventDefault(); const id = stopEdit(); render(); focusGoal(id); } });

    // ---- examples
    $('demo').addEventListener('click', () => {
        const before = snapshot(), add = (o, i) => Object.assign({ id: C.newId('g'), start: 0, mode: 'date', date: null, pay: 0, freq: 'month', rate: 0, color: C.COLORS[i], log: [] }, o);
        const y = +todayStr.slice(0, 4);
        state.goals.push(add({ name: 'Trip to Japan', target: 300000, start: 120000, date: C.addMonths(todayStr, 8).slice(0, 8) + '01' }, 0));
        state.goals.push(add({ name: 'Emergency fund', target: 500000, start: 75000, mode: 'amount', pay: 30000, rate: 4000 }, 1));
        const xmas = (todayStr <= y + '-12-10' ? y : y + 1) + '-12-24';
        state.goals.push(add({ name: 'New laptop', target: 129999, date: xmas, freq: 'week' }, 2));
        render();
        say($('goals-msg'), 'Three example goals added. Edit or delete them, or tap Undo to remove them.', () => { state = before; render(); });
    });

    // ---- share and settings
    $('cur').addEventListener('change', () => { state.cur = C.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; render(); });
    function planText() {
        const lines = ['My savings goals (' + C.dateText(todayStr) + ')', ''];
        state.goals.forEach(g => {
            const a = answer(g);
            lines.push(g.name + ': ' + money(C.saved(g)) + ' of ' + money(g.target) + ' saved' + (g.mode === 'date' ? ', goal date ' + C.dateText(g.date) : '') + '.');
            lines.push(a.label + ': ' + a.big + '. ' + a.text + (a.next ? ' ' + a.next : ''));
            lines.push('');
        });
        if (!state.goals.length) lines.push('No goals yet.');
        return lines.join('\n').trim();
    }
    function mailHref() {
        let body = planText();
        if (body.length > 1800) body = body.slice(0, 1800).replace(/\n[^\n]*$/, '') + '\n(shortened: use Copy plan for all of it)';
        return 'mailto:?subject=' + encodeURIComponent('My savings plan') + '&body=' + encodeURIComponent(body);
    }
    $('copy').addEventListener('click', async () => {
        const text = planText();
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        }
        say($('tools-msg'), ok ? 'Plan copied. Paste it into a message or note.' : 'Could not copy here. Use Email plan instead.');
    });
    $('print').addEventListener('click', () => window.print());
    $('wipe').addEventListener('click', () => {
        if (!state.goals.length) { say($('tools-msg'), 'There are no goals to delete.'); return; }
        const before = snapshot();
        if (editingId) stopEdit();
        state.goals = []; gone = null; panel = null; clearMsgs(); render();
        say($('tools-msg'), 'All goals deleted.', () => { state = before; render(); });
    });

    // ---- a new day while the page is open: plans count from the new today
    function checkDay() { const t = C.today(); if (t !== todayStr) { todayStr = t; render(); } }
    setInterval(checkDay, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });

    // ---- start
    $('cur').value = state.cur;
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
