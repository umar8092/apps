// Page code for Net Worth Tracker. The maths lives in core.js (NetWorthCore).
(function () {
    const C = window.NetWorthCore, KEY = 'net-worth-tracker.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (text, cls) => { const b = el('button', cls, text); b.type = 'button'; return b; };
    const SVG = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs, text) => { const e = document.createElementNS(SVG, tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); if (text != null) e.textContent = text; return e; };

    let state = load(), canSave = true, todayStr = C.today(), selDate = todayStr, editingId = null;

    function load() {
        try { const raw = localStorage.getItem(KEY); return C.clean(raw ? JSON.parse(raw) : null); } catch (e) { return C.clean(null); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { if (canSave) { canSave = false; $('save-warn').hidden = false; } }
    }
    const snapshot = () => JSON.parse(JSON.stringify(state));
    const money = c => C.fmt(c, state.cur);
    const day = s => C.dateText(s);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    function say(box, text, undo) {
        box.textContent = text;
        if (undo) {
            const b = btn('Undo');
            b.addEventListener('click', () => { undo(); box.textContent = ''; });
            box.appendChild(b);
        }
    }
    const clearMsgs = () => ['bal-msg', 'add-msg', 'hist-msg', 'tools-msg'].forEach(id => { $(id).textContent = ''; });
    function amountError(r, owe) {
        if (r.err === 'big') return 'That is too big (up to 100,000,000,000).';
        if (owe && r.cents < 0) return 'Type what you owe without a minus, for example 500.';
        return 'Type a number, for example 1250.50.';
    }
    // the update the page shows: the one on the chosen date, or the last one before it (its balances are carried forward)
    const shownIndex = () => C.atOrBefore(state, selDate);
    const hasEntry = () => C.indexOf(state, selDate) >= 0;

    // ---- the account boxes
    function changeLine(a, i) {
        const ch = C.accChange(state, a, i);
        if (!ch) return { text: C.valueAt(state, a.id, i) === null && i >= 0 ? 'No balance on this date yet.' : '', cls: '' };
        if (ch.isNew) return { text: 'New since ' + day(ch.since), cls: '' };
        if (ch.diff === 0) return { text: 'Same as on ' + day(ch.since), cls: '' };
        return { text: (ch.diff > 0 ? 'Up ' : 'Down ') + money(Math.abs(ch.diff)) + ' since ' + day(ch.since), cls: ch.better ? 'good' : 'bad' };
    }
    function accountBox(a, i) {
        const k = C.KINDS[a.kind], li = el('li', 'acct ' + k.side);
        li.dataset.id = a.id;
        if (editingId === a.id) li.classList.add('editing');
        const top = el('div', 'a-top');
        top.append(el('h4', null, a.name), el('span', 'tag', k.name));
        const id = 'v-' + a.id, lab = el('label', null, k.word);
        lab.htmlFor = id;
        const box = el('div', 'money'), sym = el('span', 'sym', state.cur);
        sym.setAttribute('aria-hidden', 'true');
        const inp = el('input');
        Object.assign(inp, { id, type: 'text', inputMode: 'decimal', maxLength: 20, placeholder: '0', autocomplete: 'off' });
        inp.setAttribute('aria-describedby', 'c-' + a.id + ' e-' + a.id);
        const v = i >= 0 ? C.valueAt(state, a.id, i) : null;
        inp.value = v === null ? '' : C.plain(v);
        box.append(sym, inp);
        const cl = changeLine(a, i), change = el('p', 'a-change ' + cl.cls, cl.text);
        change.id = 'c-' + a.id;
        const err = el('p', 'a-err');
        err.id = 'e-' + a.id;
        err.setAttribute('role', 'alert');
        inp.addEventListener('input', () => typed(a, inp, err));
        inp.addEventListener('change', () => { if (!err.textContent && !inp.value.trim()) inp.value = '0'; });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
        const btns = el('div', 'a-btns'), edit = btn('Edit', 'mini'), del = btn('Delete', 'mini del');
        edit.setAttribute('aria-label', 'Edit ' + a.name);
        del.setAttribute('aria-label', 'Delete ' + a.name);
        edit.addEventListener('click', () => startEdit(a));
        del.addEventListener('click', () => removeAccount(a));
        btns.append(edit, del);
        li.append(top, lab, box, change, err, btns);
        return li;
    }
    // a balance typed in a box is saved straight away as part of the update for the chosen date
    function typed(a, inp, err) {
        const r = C.parseAmount(inp.value), owe = C.side(a) === 'owe';
        const cents = r.blank ? 0 : r.cents;
        if (r.err || (owe && cents < 0)) { err.textContent = amountError(r.blank ? { cents: 0 } : r, owe); return; }
        err.textContent = '';
        const i = shownIndex();
        if (!hasEntry() && i >= 0 && C.valueAt(state, a.id, i) === cents) return;   // nothing changed yet: do not start a new update
        C.setValue(state, selDate, a.id, cents);
        save();
        refresh();
    }
    // updates everything except the boxes being typed in, so the cursor stays put
    function refresh() {
        const i = shownIndex();
        state.accounts.forEach(a => {
            const p = $('c-' + a.id);
            if (!p) return;
            const cl = changeLine(a, i);
            p.textContent = cl.text;
            p.className = 'a-change ' + cl.cls;
        });
        dateNote();
        renderSide();
    }
    function dateNote() {
        const note = $('date-note'), i = shownIndex();
        note.classList.remove('bad');
        if (hasEntry()) note.textContent = 'Saved as your update for ' + day(selDate) + '. Changes save as you type.';
        else if (i >= 0) note.textContent = 'These are your balances from ' + day(state.entries[i].date) + '. Change any that moved to save your update for ' + day(selDate) + '.';
        else note.textContent = 'Type the balances you had on ' + day(selDate) + ' to save an update for that date.';
    }

    function render() {
        const any = state.accounts.length > 0;
        $('intro').hidden = any;
        $('bal-body').hidden = !any;
        $('date').max = todayStr;
        $('date').value = selDate;
        const i = shownIndex();
        ['own', 'owe'].forEach(sideName => {
            const list = $(sideName + '-list');
            list.replaceChildren();
            state.accounts.filter(a => C.side(a) === sideName).forEach(a => list.appendChild(accountBox(a, i)));
            $(sideName + '-empty').hidden = list.children.length > 0;
        });
        dateNote();
        renderSide();
        document.querySelectorAll('.money .sym').forEach(s => { s.textContent = state.cur; });
        $('mail').href = mailHref();
    }

    // ---- net worth, history and the line
    function renderSide() {
        const i = shownIndex(), t = C.totalsAt(state, i);
        $('result').hidden = !state.accounts.length;
        $('res-h').textContent = i >= 0 ? 'Net worth on ' + day(state.entries[i].date) : 'Net worth';
        $('net').textContent = money(t.net);
        $('net').classList.toggle('negative', t.net < 0);
        $('neg-note').hidden = t.net >= 0;
        $('neg-note').textContent = t.net < 0 ? 'You owe ' + money(-t.net) + ' more than you own.' : '';
        $('own-total').textContent = money(t.own);
        $('owe-total').textContent = money(t.owe);
        $('own-sub').textContent = money(t.own);
        $('owe-sub').textContent = money(t.owe);
        const ch = C.changeAt(state, i), change = $('change');
        change.className = 'change';
        if (i < 0) change.textContent = 'No balances saved on or before ' + day(selDate) + '.';
        else if (!ch) change.textContent = state.entries.length === 1 ? 'This is your first update. Update your balances again next month to see how it changes.' : 'This is your first update.';
        else if (ch.diff === 0) change.textContent = 'No change since ' + day(ch.since) + '.';
        else { change.textContent = (ch.diff > 0 ? 'Up ' : 'Down ') + money(Math.abs(ch.diff)) + ' since ' + day(ch.since) + '.'; change.classList.add(ch.diff > 0 ? 'good' : 'bad'); }
        const added = $('added-note');
        added.hidden = !(ch && ch.added.length);
        if (ch && ch.added.length) {
            const names = ch.added.map(x => x.acc.name);
            added.textContent = 'This includes ' + (ch.addedTotal >= 0 ? '+' : '') + money(ch.addedTotal) + ' from ' + (names.length > 3 ? names.slice(0, 3).join(', ') + ' and ' + plural(names.length - 3, 'other', 'others') : names.join(' and ')) +
                ', added since ' + day(ch.since) + '. Without ' + (names.length === 1 ? 'it' : 'them') + ' the change is ' + (ch.diff - ch.addedTotal > 0 ? 'up ' : ch.diff - ch.addedTotal < 0 ? 'down ' : '') + money(Math.abs(ch.diff - ch.addedTotal)) + '.';
        }
        const start = $('start-note');
        if (i > 1) {
            const d = t.net - C.totalsAt(state, 0).net;
            start.textContent = 'Since your first update (' + day(state.entries[0].date) + '): ' + (d > 0 ? 'up ' : d < 0 ? 'down ' : 'no change, ') + money(Math.abs(d)) + '.';
        } else start.textContent = '';
        const last = state.entries.length ? state.entries[state.entries.length - 1].date : null;
        const gap = last ? C.dayNum(todayStr) - C.dayNum(last) : 0;
        $('stale').hidden = !(last && selDate === todayStr && gap > 31);
        $('stale').textContent = last && gap > 31 ? 'Your last update was ' + day(last) + ', ' + gap + ' days ago. Time to update your balances.' : '';
        drawChart(i);
        renderHistory(i);
        $('mail').href = mailHref();
    }

    function drawChart(sel) {
        const box = $('chart-box'), g = $('chart'), n = state.entries.length;
        box.hidden = n < 2;
        [...g.querySelectorAll(':not(title)')].forEach(e => e.remove());
        if (n < 2) return;
        const nets = state.entries.map((e, i) => C.totalsAt(state, i).net), xs = state.entries.map(e => C.dayNum(e.date));
        let lo = Math.min(...nets), hi = Math.max(...nets);
        if (lo < 0 && hi < 0) hi = 0;
        if (lo === hi) { lo -= 100; hi += 100; }
        const L = 8, R = 392, T = 30, B = 168, x0 = xs[0], x1 = xs[n - 1];
        const X = x => L + (x - x0) / (x1 - x0) * (R - L), Y = v => B - (v - lo) / (hi - lo) * (B - T);
        const pts = nets.map((v, i) => X(xs[i]).toFixed(1) + ',' + Y(v).toFixed(1));
        g.append(svg('line', { x1: L, x2: R, y1: T, y2: T, class: 'grid' }), svg('line', { x1: L, x2: R, y1: B, y2: B, class: 'grid' }));
        if (lo < 0 && hi > 0) g.append(svg('line', { x1: L, x2: R, y1: Y(0), y2: Y(0), class: 'zero' }), svg('text', { x: R, y: Y(0) - 5, 'text-anchor': 'end', class: 'lbl' }, '0'));
        g.append(svg('text', { x: L, y: T - 9, class: 'lbl' }, money(hi)), svg('text', { x: L, y: B + 18, class: 'lbl' }, money(lo)));
        g.append(svg('polygon', { points: X(xs[0]).toFixed(1) + ',' + B + ' ' + pts.join(' ') + ' ' + X(xs[n - 1]).toFixed(1) + ',' + B, class: 'area' }));
        g.append(svg('polyline', { points: pts.join(' '), class: 'line' }));
        if (n <= 60) nets.forEach((v, i) => g.append(svg('circle', { cx: X(xs[i]), cy: Y(v), r: i === sel ? 6.5 : 3.5, class: i === sel ? 'dot sel' : 'dot' })));
        else if (sel >= 0) g.append(svg('circle', { cx: X(xs[sel]), cy: Y(nets[sel]), r: 6.5, class: 'dot sel' }));
        g.append(svg('text', { x: L, y: 208, class: 'lbl' }, C.shortDate(state.entries[0].date)), svg('text', { x: R, y: 208, 'text-anchor': 'end', class: 'lbl' }, C.shortDate(state.entries[n - 1].date)));
        $('chart').setAttribute('aria-label', 'Net worth over time: ' + money(nets[0]) + ' on ' + day(state.entries[0].date) + ', ' + money(nets[n - 1]) + ' on ' + day(state.entries[n - 1].date) + '. Every update is listed under Past updates.');
    }

    function renderHistory(sel) {
        const n = state.entries.length, list = $('hist-list');
        $('history').hidden = !n;
        $('hist-n').textContent = n ? '(' + n + ')' : '';
        list.replaceChildren();
        for (let i = n - 1; i >= 0; i--) {
            const e = state.entries[i], t = C.totalsAt(state, i), ch = C.changeAt(state, i);
            const li = el('li', 'h-row' + (i === sel ? ' sel' : ''));
            const info = el('div', 'h-info');
            info.append(el('b', 'h-date', day(e.date)), el('span', 'h-net', money(t.net)));
            const c = el('span', 'h-ch', !ch ? 'First update' : ch.diff === 0 ? 'No change' : (ch.diff > 0 ? '+' : '-') + money(Math.abs(ch.diff)));
            if (ch && ch.diff) c.classList.add(ch.diff > 0 ? 'good' : 'bad');
            info.appendChild(c);
            const btns = el('div', 'h-btns');
            const show = btn(i === sel ? 'Showing' : 'Show', 'mini'), del = btn('Delete', 'mini del');
            show.setAttribute('aria-label', 'Show the update of ' + day(e.date));
            del.setAttribute('aria-label', 'Delete the update of ' + day(e.date));
            if (i === sel) show.disabled = true;
            show.addEventListener('click', () => { selDate = e.date; clearMsgs(); render(); $('bal-h').scrollIntoView({ block: 'start' }); $('date').focus({ preventScroll: true }); });
            del.addEventListener('click', () => {
                const before = snapshot();
                C.deleteEntry(state, e.date);
                save(); clearMsgs(); render();
                say($('hist-msg'), 'Deleted the update of ' + day(e.date) + '.', () => { state = before; save(); render(); });
            });
            btns.append(show, del);
            li.append(info, btns);
            list.appendChild(li);
        }
    }

    // ---- the date the balances are for
    $('date').addEventListener('change', () => {
        const v = $('date').value;
        if (!C.validDate(v) || v > todayStr) {
            $('date-note').textContent = v > todayStr ? 'Pick a date up to today. Balances are for days that have happened.' : 'Pick a date, for example today.';
            $('date-note').classList.add('bad');
            return;
        }
        selDate = v;
        clearMsgs();
        render();
    });

    // ---- add or edit an account
    function kindChanged() { $('f-amount-label').textContent = C.KINDS[$('f-kind').value].word; }
    $('f-kind').addEventListener('change', kindChanged);
    $('form').addEventListener('submit', e => {
        e.preventDefault();
        const err = $('form-err');
        const name = $('f-name').value.replace(/\s+/g, ' ').trim().slice(0, C.MAX_NAME), kind = $('f-kind').value;
        if (!name) { err.textContent = 'Type a name, for example Main bank account.'; $('f-name').focus(); return; }
        if (!C.KINDS[kind]) { err.textContent = 'Choose what the account is.'; return; }
        if (state.accounts.some(a => a.id !== editingId && a.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'You already have an account called ' + name + '. Use a different name so you can tell them apart.'; $('f-name').focus(); return; }
        if (editingId) {
            const a = state.accounts.find(x => x.id === editingId);
            if (!a) { stopEdit(); return; }
            if (C.KINDS[kind].side === 'owe' && state.entries.some(en => en.values[a.id] < 0)) { err.textContent = 'This account has a balance below 0, and money you owe cannot be below 0. Set its balance to 0 or more first.'; return; }
            a.name = name; a.kind = kind;
            save(); stopEdit(); clearMsgs(); render();
            say($('bal-msg'), 'Saved ' + name + '.');
            return;
        }
        if (state.accounts.length >= C.MAX_ACCOUNTS) { err.textContent = 'You can have up to ' + C.MAX_ACCOUNTS + ' accounts.'; return; }
        const r = C.parseAmount($('f-amount').value), owe = C.KINDS[kind].side === 'owe';
        if (r.err || (owe && r.cents < 0)) { err.textContent = amountError(r, owe); $('f-amount').focus(); return; }
        const a = { id: C.newId(), name, kind };
        state.accounts.push(a);
        C.setValue(state, selDate, a.id, r.blank ? 0 : r.cents);
        save();
        err.textContent = '';
        $('f-name').value = ''; $('f-amount').value = '';
        clearMsgs(); render();
        say($('add-msg'), 'Added ' + name + ' to ' + (owe ? 'What I owe' : 'What I own') + ' for ' + day(selDate) + '. Add the next one, or change balances above.');
        $('f-name').focus();
    });
    function startEdit(a) {
        editingId = a.id;
        $('f-name').value = a.name;
        $('f-kind').value = a.kind;
        kindChanged();
        $('amount-box').hidden = true;
        $('form-h').textContent = 'Edit ' + a.name;
        $('save').textContent = 'Save changes';
        $('cancel-edit').hidden = false;
        $('form-btns').classList.add('editing');
        $('form').classList.add('editing');
        $('form-err').textContent = '';
        clearMsgs(); render();
        $('form').scrollIntoView({ block: 'center' });
        $('f-name').focus({ preventScroll: true });
    }
    function stopEdit() {
        const id = editingId;
        editingId = null;
        $('form').reset();
        kindChanged();
        $('amount-box').hidden = false;
        $('form-h').textContent = 'Add an account';
        $('save').textContent = 'Add account';
        $('cancel-edit').hidden = true;
        $('form-btns').classList.remove('editing');
        $('form').classList.remove('editing');
        $('form-err').textContent = '';
        return id;
    }
    $('cancel-edit').addEventListener('click', () => { const id = stopEdit(); render(); const b = document.querySelector('.acct[data-id="' + id + '"] .mini'); if (b) b.focus(); });
    $('form').addEventListener('keydown', e => { if (e.key === 'Escape' && editingId) $('cancel-edit').click(); });
    function removeAccount(a) {
        const before = snapshot();
        if (editingId === a.id) stopEdit();
        C.deleteAccount(state, a.id);
        save(); clearMsgs(); render();
        say($('bal-msg'), 'Deleted ' + a.name + ' from every update. Paid it off? Undo and set its balance to 0 instead.', () => { state = before; save(); render(); });
        if (!state.accounts.length) say($('add-msg'), 'Deleted ' + a.name + '.', () => { state = before; save(); render(); });
    }

    // ---- example: six accounts over four months, ending today
    $('demo').addEventListener('click', () => {
        const before = snapshot();
        const acc = [['Current account', 'cash', [124000, 98050, 142075, 131020]], ['Savings', 'savings', [300000, 325000, 350000, 375000]], ['Pension', 'pension', [840000, 861000, 879000, 902000]],
            ['Car', 'vehicle', [950000, 940000, 930000, 920000]], ['Car loan', 'loan', [780000, 752000, 724000, 696000]], ['Credit card', 'card', [64000, 91030, 48000, 39560]]];
        acc.forEach(([name, kind, vals]) => {
            const a = { id: C.newId(), name, kind };
            state.accounts.push(a);
            vals.forEach((v, k) => C.setValue(state, C.addMonths(todayStr, k - 3), a.id, v));
        });
        selDate = todayStr;
        save(); clearMsgs(); render();
        say($('bal-msg'), 'Example added: six accounts over four months. Change or delete them, or tap Undo to remove them.', () => { state = before; save(); render(); });
    });

    // ---- share, backup and settings
    $('cur').addEventListener('change', () => { state.cur = C.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; save(); render(); });
    function summaryText() {
        const i = shownIndex();
        if (i < 0) return 'My net worth: no balances saved yet.';
        const t = C.totalsAt(state, i), ch = C.changeAt(state, i), date = state.entries[i].date;
        const lines = ['My net worth on ' + day(date) + ': ' + money(t.net)];
        if (ch) lines.push((ch.diff > 0 ? 'Up ' : ch.diff < 0 ? 'Down ' : 'No change, ') + money(Math.abs(ch.diff)) + ' since ' + day(ch.since) + '.');
        ['own', 'owe'].forEach(s => {
            lines.push('', (s === 'own' ? 'I own ' + money(t.own) : 'I owe ' + money(t.owe)) + ':');
            state.accounts.filter(a => C.side(a) === s).forEach(a => { const v = C.valueAt(state, a.id, i); if (v !== null) lines.push('- ' + a.name + ' (' + C.KINDS[a.kind].name + '): ' + money(v)); });
        });
        if (state.entries.length > 1) {
            lines.push('', 'Past updates:');
            for (let k = state.entries.length - 1; k >= 0; k--) lines.push(day(state.entries[k].date) + ': ' + money(C.totalsAt(state, k).net));
        }
        return lines.join('\n');
    }
    function mailHref() {
        let body = summaryText();
        if (body.length > 1800) body = body.slice(0, 1800).replace(/\n[^\n]*$/, '') + '\n(shortened: use Copy summary for all of it)';
        return 'mailto:?subject=' + encodeURIComponent('My net worth') + '&body=' + encodeURIComponent(body);
    }
    $('copy').addEventListener('click', async () => {
        const text = summaryText();
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove();
        }
        say($('tools-msg'), ok ? 'Summary copied. Paste it into a message or note.' : 'Could not copy here. Use Email summary instead.');
    });
    $('print').addEventListener('click', () => window.print());
    function download(name, type, text) {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const a = el('a'); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    $('csv').addEventListener('click', () => {
        if (!state.entries.length) { say($('tools-msg'), 'There are no updates to put in a spreadsheet yet.'); return; }
        download('net-worth-' + todayStr + '.csv', 'text/csv', '﻿' + C.csv(state));
        say($('tools-msg'), 'Spreadsheet downloaded: one row for each update.');
    });
    $('export').addEventListener('click', () => {
        if (!state.accounts.length) { say($('tools-msg'), 'There is nothing to back up yet.'); return; }
        download('net-worth-backup-' + todayStr + '.json', 'application/json', JSON.stringify(Object.assign({ app: 'net-worth-tracker' }, state)));
        say($('tools-msg'), 'Backup file saved. Keep it somewhere safe; Load backup file puts it back.');
    });
    $('import').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', () => {
        const f = $('import-file').files[0];
        $('import-file').value = '';
        if (!f) return;
        if (f.size > 5000000) { say($('tools-msg'), 'That file is too big to be a backup from this app.'); return; }
        const reader = new FileReader();
        reader.onload = () => {
            let data = null;
            try { data = C.clean(JSON.parse(reader.result)); } catch (e) { data = null; }
            if (!data || !data.accounts.length) { say($('tools-msg'), 'This file is not a Net Worth Tracker backup, or it has no accounts in it. Nothing was changed.'); return; }
            const before = snapshot();
            if (editingId) stopEdit();
            state = data; selDate = todayStr;
            save(); clearMsgs(); $('cur').value = state.cur; render();
            say($('tools-msg'), 'Backup loaded: ' + plural(state.accounts.length, 'account', 'accounts') + ', ' + plural(state.entries.length, 'update', 'updates') + '.', () => { state = before; save(); $('cur').value = state.cur; render(); });
        };
        reader.onerror = () => say($('tools-msg'), 'Could not read that file.');
        reader.readAsText(f);
    });
    $('wipe').addEventListener('click', () => {
        if (!state.accounts.length && !state.entries.length) { say($('tools-msg'), 'There is nothing to delete.'); return; }
        const before = snapshot();
        if (editingId) stopEdit();
        state = C.clean({ cur: state.cur }); selDate = todayStr;
        save(); clearMsgs(); render();
        say($('tools-msg'), 'Everything deleted.', () => { state = before; save(); render(); });
    });

    // ---- a new day while the page is open
    function checkDay() {
        const t = C.today();
        if (t === todayStr) return;
        if (selDate === todayStr) selDate = t;
        todayStr = t;
        if (!document.activeElement || !document.activeElement.closest('.acct')) render(); else { $('date').max = t; refresh(); }
    }
    setInterval(checkDay, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });

    // ---- start
    $('cur').value = state.cur;
    kindChanged();
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
