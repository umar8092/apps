// Time Tracker for Freelancers: the page. The sums live in core.js.
(function () {
    'use strict';
    var T = window.TT;
    var KEY = 'time-tracker-for-freelancers.state';
    var $ = function (id) { return document.getElementById(id); };
    var S, saving = true, undoSnap = null, editingId = null, editingClient = null, daysShown = 7;

    // ---------- saving ----------
    function load() {
        var raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { saving = false; }
        try { S = T.validate(raw ? JSON.parse(raw) : null); } catch (e) { S = T.emptyState(); }
    }
    function save() {
        if (!saving) { $('storage-warn').hidden = false; return; }
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { saving = false; $('storage-warn').hidden = false; }
    }
    function newId(p) { return p + (S.nextId++); }
    function today() { return T.dateOf(Date.now()); }
    function clientById(id) { for (var i = 0; i < S.clients.length; i++) if (S.clients[i].id === id) return S.clients[i]; return null; }

    // ---------- small helpers ----------
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn) { var b = el('button', cls || 'secondary', text); b.type = 'button'; b.addEventListener('click', fn); return b; }
    var dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    var dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    var shortFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    var timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
    function utc(d) { return new Date(d + 'T00:00:00Z'); }
    function fmtDay(d) { var t = today(); return d === t ? 'Today, ' + dayFmt.format(utc(d)) : d === T.addDays(t, -1) ? 'Yesterday, ' + dayFmt.format(utc(d)) : dayFmt.format(utc(d)); }
    function fmtTime(min) { min = ((min % 1440) + 1440) % 1440; return timeFmt.format(new Date(2000, 0, 1, Math.floor(min / 60), min % 60)); }
    function clock(min) { return T.pad(Math.floor(min / 60) % 24) + ':' + T.pad(min % 60); }
    function rangeLabel(r) {
        if (r.from === '0000-01-01') return 'All time not billed yet, up to ' + dateFmt.format(utc(today()));
        if (r.from === r.to) return dateFmt.format(utc(r.from));
        return (r.from.slice(0, 4) === r.to.slice(0, 4) ? shortFmt.format(utc(r.from)) : dateFmt.format(utc(r.from))) + ' – ' + dateFmt.format(utc(r.to));
    }

    // One message line per card, with Undo when the change can be taken back.
    var msgTimer = null;
    function msg(id, text, canUndo) {
        document.querySelectorAll('.msg').forEach(function (m) { m.textContent = ''; });
        var box = $(id); box.textContent = '';
        box.appendChild(el('span', null, text));
        if (canUndo) box.appendChild(btn('Undo', 'undo', doUndo));
        clearTimeout(msgTimer);
        msgTimer = setTimeout(function () { box.textContent = ''; undoSnap = null; }, canUndo ? 15000 : 7000);
    }
    function snap() { undoSnap = JSON.stringify(S); }
    function doUndo() {
        if (!undoSnap) return;
        S = T.validate(JSON.parse(undoSnap)); undoSnap = null; editingId = null; editingClient = null;
        save(); renderAll();
        document.querySelectorAll('.msg').forEach(function (m) { m.textContent = ''; });
        $('entries-msg').textContent = 'Undone.';
    }

    // ---------- client form (used in three places) ----------
    function clientForm(host, client, withButtons, onDone) {
        host.textContent = '';
        var f = $('client-form-tpl').content.firstElementChild.cloneNode(true);
        var uid = 'cf' + Math.random().toString(36).slice(2, 8);
        f.querySelectorAll('[data-f]').forEach(function (x) { if (/INPUT|SELECT/.test(x.tagName) && x.type !== 'checkbox') x.id = uid + '-' + x.dataset.f; });
        f.querySelectorAll('label[data-for]').forEach(function (l) { l.htmlFor = uid + '-' + l.dataset.for; });
        var q = function (n) { return f.querySelector('[data-f="' + n + '"]'); };
        T.SYMBOLS.forEach(function (s) { var o = el('option', null, s || 'None (plain numbers)'); o.value = s; q('sym').appendChild(o); });
        q('name').value = client ? client.name : '';
        q('rate').value = client && client.rate ? T.fmtMoney(client.rate, '') : '';
        q('sym').value = client ? client.sym : (S.lastSym != null ? S.lastSym : '');
        q('round').value = String(client ? client.round : 0);
        q('btns').hidden = !withButtons;
        function readRate() {
            var r = T.parseMoney(q('rate').value);
            q('rate-read').textContent = r.cents > 0 ? 'Rate: ' + T.fmtMoney(r.cents, q('sym').value) + ' an hour' : (r.empty || r.cents === 0 ? 'No rate: hours only, no money shown.' : '');
            q('rate').setAttribute('aria-invalid', r.error ? 'true' : 'false');
            return r;
        }
        function showApply() { var r = T.parseMoney(q('rate').value); q('apply-wrap').hidden = !client || r.error || (r.cents || 0) === client.rate; }
        q('rate').addEventListener('input', function () { readRate(); showApply(); });
        q('sym').addEventListener('change', readRate);
        readRate(); showApply();
        function read() {
            var name = T.cleanText(q('name').value, 40);
            q('err').textContent = '';
            if (!name) { q('err').textContent = 'Type the client name.'; q('name').focus(); return null; }
            var dupe = S.clients.some(function (c) { return c.name.toLowerCase() === name.toLowerCase() && (!client || c.id !== client.id); });
            if (dupe) { q('err').textContent = 'You already have a client called ' + name + '. Choose it from the list or use another name.'; q('name').focus(); return null; }
            var r = readRate();
            if (r.error) { q('err').textContent = r.error; q('rate').focus(); return null; }
            return { name: name, rate: r.cents || 0, sym: q('sym').value, round: +q('round').value, apply: q('apply').checked };
        }
        // Saves the client and returns it, or null with the reason shown.
        function commit() {
            var v = read(); if (!v) return null;
            snap();
            var c = client;
            if (c) {
                var old = c.rate;
                c.name = v.name; c.sym = v.sym; c.round = v.round; c.rate = v.rate;
                if (v.apply && old !== v.rate) S.entries.forEach(function (e) { if (e.client === c.id && !e.bill) e.rate = v.rate; });
            } else {
                c = { id: newId('c'), name: v.name, rate: v.rate, sym: v.sym, round: v.round };
                S.clients.push(c);
            }
            S.lastSym = v.sym;
            save();
            return c;
        }
        q('save').addEventListener('click', function () { var c = commit(); if (c) onDone(c, client ? 'Saved ' + c.name + '.' : 'Added ' + c.name + '.'); });
        q('cancel').addEventListener('click', function () { onDone(null); });
        q('name').addEventListener('keydown', function (e) { if (e.key === 'Enter' && withButtons) { e.preventDefault(); q('save').click(); } });
        host.appendChild(f);
        return { commit: commit, focus: function () { q('name').focus(); } };
    }

    // ---------- client pickers in the timer and add forms ----------
    var pickers = {};
    function fillSelect(sel, keep) {
        var v = keep != null ? keep : sel.value;
        sel.textContent = '';
        S.clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
            var o = el('option', null, c.name + (c.rate ? ' (' + T.fmtMoney(c.rate, c.sym) + '/h)' : '')); o.value = c.id; sel.appendChild(o);
        });
        var n = el('option', null, '+ New client'); n.value = '__new'; sel.appendChild(n);
        sel.value = clientById(v) || v === '__new' ? v : (S.clients.length ? (S.lastClient && clientById(S.lastClient) ? S.lastClient : sel.options[0].value) : '__new');
    }
    function syncPicker(selId, boxId) {
        var sel = $(selId), box = $(boxId);
        if (sel.value === '__new') {
            if (box.hidden || !pickers[selId]) { box.hidden = false; pickers[selId] = clientForm(box, null, false, function () {}); }
        } else { box.hidden = true; box.textContent = ''; pickers[selId] = null; }
        fillTasks(sel.value);
    }
    // Returns the chosen client id, creating the new client first when needed.
    function pickedClient(selId) {
        var v = $(selId).value;
        if (v !== '__new') return clientById(v) ? v : null;
        var c = pickers[selId] && pickers[selId].commit();
        if (!c) return null;
        ['t-client', 'a-client'].forEach(function (id) { fillSelect($(id), id === selId || $(id).value === '__new' ? c.id : null); syncPicker(id, id === 't-client' ? 't-new' : 'a-new'); });
        renderClients();
        return c.id;
    }
    function fillTasks(cid) {
        var dl = $('task-list'), seen = {}, list = [];
        dl.textContent = '';
        S.entries.slice().reverse().forEach(function (e) {
            if (cid && cid !== '__new' && e.client !== cid) return;
            var k = T.taskKey(e.task); if (!k || seen[k]) return; seen[k] = 1; list.push(e.task);
        });
        list.slice(0, 20).forEach(function (t) { var o = el('option'); o.value = t; dl.appendChild(o); });
    }

    // ---------- timer ----------
    var tick = null;
    function renderTimer() {
        var t = S.timer, run = $('running');
        run.hidden = !t;
        $('start').textContent = t ? 'Stop and switch' : 'Start timer';
        $('t-client-l').textContent = t ? 'Switch to another client or job' : 'Client';
        clearInterval(tick);
        if (!t) { document.title = baseTitle; return; }
        var c = clientById(t.client);
        $('run-what').textContent = (c ? c.name : '') + (t.task ? ' · ' + t.task : '');
        var sd = T.dateOf(t.startMs);
        $('run-since').textContent = 'Started ' + (sd === today() ? 'today' : fmtDay(sd)) + ' at ' + fmtTime(T.minuteOf(t.startMs));
        update();
        tick = setInterval(update, 1000);
    }
    function update() {
        var t = S.timer; if (!t) return;
        var sec = Math.max(0, (Date.now() - t.startMs) / 1000);
        $('clock').textContent = T.fmtClockSec(sec);
        var c = clientById(t.client);
        document.title = '● ' + T.fmtClockSec(sec) + ' ' + (c ? c.name : '') + ' – Time Tracker';
        var long = sec >= 8 * 3600;
        $('run-long').hidden = !long;
        if (long) {
            $('run-long').textContent = sec > T.MAX_SEC
                ? 'This timer has run for more than 24 hours. Tap "I forgot to stop" and choose when you really stopped.'
                : 'This timer has run for ' + T.fmtDur(Math.floor(sec / 60)) + '. Did you forget to stop it? If so, tap "I forgot to stop".';
        }
    }
    function stopAt(endMs, quiet) {
        var t = S.timer, c = clientById(t.client);
        var r = T.entryFromTimer(t, endMs, c);
        if (r.error) return r;
        snap();
        S.timer = null;
        if (r.tooShort) { save(); return { text: 'Timer stopped after ' + r.sec + ' seconds, so nothing was saved.' }; }
        r.entry.id = newId('e');
        S.entries.push(r.entry);
        save();
        return { text: 'Saved ' + T.fmtDur(T.entryMin(r.entry)) + ' for ' + (c ? c.name : 'the client') + '.', undo: true };
    }
    function startTimer() {
        $('t-err').textContent = '';
        var cid = pickedClient('t-client');
        if (!cid) { if ($('t-client').value !== '__new') $('t-err').textContent = 'Choose a client.'; return; }
        var task = T.cleanText($('t-task').value, 80), out = null;
        if (S.timer) {
            out = stopAt(Date.now());
            if (out.error) { $('t-err').textContent = out.error; openForgot(); return; }
        } else snap();
        S.timer = { client: cid, task: task, startMs: Date.now() };
        S.lastClient = cid;
        save();
        $('t-task').value = '';
        $('forgot-box').hidden = true;
        renderAll();
        var c = clientById(cid);
        msg('timer-msg', (out && out.text ? out.text + ' ' : '') + 'Timer started for ' + c.name + '.', true);
    }
    function openForgot() {
        var box = $('forgot-box'); box.hidden = false;
        if (!$('stop-date').value) {
            var now = Date.now(), start = S.timer.startMs;
            var guess = now - start > 8 * 3600000 ? start + 3600000 : now;
            $('stop-date').value = T.dateOf(guess); $('stop-time').value = clock(T.minuteOf(guess));
        }
        $('stop-date').min = T.dateOf(S.timer.startMs); $('stop-date').max = today();
        $('stop-time').focus();
    }

    // ---------- add time afterwards ----------
    function addMode() { return document.querySelector('input[name="a-mode"]:checked').value; }
    function readAdd() {
        return T.entryFromForm({ mode: addMode(), date: $('a-date').value, start: $('a-start').value, finish: $('a-finish').value, length: $('a-length').value }, today());
    }
    function previewAdd() {
        $('a-times').hidden = addMode() !== 'times';
        $('a-length-wrap').hidden = addMode() !== 'length';
        var r = readAdd(), p = $('a-preview');
        p.className = 'preview';
        if (r.error) { p.textContent = ''; return; }
        var text = '= ' + T.fmtDur(r.entry.sec / 60) + (r.nextDay ? ' (finishes the next day, after midnight)' : '');
        var cid = $('a-client').value, ov = T.overlaps({ id: '_', date: r.entry.date, start: r.entry.start, sec: r.entry.sec }, S.entries.filter(function (e) { return e.id !== editingId; }));
        if (ov.length) {
            var o = ov[0], oc = clientById(o.client);
            text += '. Note: this overlaps ' + fmtTime(o.start) + '–' + fmtTime(o.start + T.entryMin(o)) + ' for ' + (oc ? oc.name : '') + ' on the same day. You can still add it.';
            p.className = 'preview warn';
        }
        p.textContent = text;
        void cid;
    }
    function addTime(ev) {
        ev.preventDefault();
        $('a-err').textContent = '';
        ['a-date', 'a-start', 'a-finish', 'a-length'].forEach(function (i) { $(i).removeAttribute('aria-invalid'); });
        var r = readAdd();
        if (r.error) { $('a-err').textContent = r.error; var f = $('a-' + r.field); f.setAttribute('aria-invalid', 'true'); f.focus(); return; }
        var cid = pickedClient('a-client');
        if (!cid) { if ($('a-client').value !== '__new') $('a-err').textContent = 'Choose a client.'; return; }
        snap();
        var c = clientById(cid), e = r.entry;
        e.id = newId('e'); e.client = cid; e.task = T.cleanText($('a-task').value, 80); e.rate = c.rate; e.billable = true; e.bill = null;
        S.entries.push(e); S.lastClient = cid;
        save();
        $('a-start').value = ''; $('a-finish').value = ''; $('a-length').value = ''; $('a-task').value = '';
        renderAll(); previewAdd();
        msg('timer-msg', 'Added ' + T.fmtDur(T.entryMin(e)) + ' for ' + c.name + ' on ' + fmtDay(e.date) + '.', true);
    }

    // ---------- your time (by day) ----------
    function renderEntries() {
        var host = $('days'); host.textContent = '';
        var list = S.entries.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.start == null ? -1 : b.start) - (a.start == null ? -1 : a.start); });
        $('entries-empty').hidden = list.length > 0;
        var days = [], byDay = {};
        list.forEach(function (e) { if (!byDay[e.date]) { byDay[e.date] = []; days.push(e.date); } byDay[e.date].push(e); });
        days.slice(0, daysShown).forEach(function (d) {
            var sec = el('div', 'day');
            var total = byDay[d].reduce(function (s, e) { return s + T.entryMin(e); }, 0);
            var h = el('h3', 'day-h'); h.appendChild(el('span', null, fmtDay(d))); h.appendChild(el('span', 'day-total', T.fmtDur(total)));
            sec.appendChild(h);
            var ul = el('ul', 'box-list');
            byDay[d].forEach(function (e) { ul.appendChild(editingId === e.id ? editBox(e) : entryBox(e)); });
            sec.appendChild(ul);
            host.appendChild(sec);
        });
        $('more-days').hidden = days.length <= daysShown;
    }
    function entryBox(e) {
        var c = clientById(e.client), li = el('li', 'box entry');
        var top = el('div', 'e-top');
        var who = el('div', 'e-who');
        who.appendChild(el('strong', null, c ? c.name : ''));
        who.appendChild(el('span', 'e-task', e.task || 'No description'));
        top.appendChild(who);
        top.appendChild(el('span', 'e-dur', T.fmtDur(T.entryMin(e))));
        li.appendChild(top);
        var when = e.start == null ? 'Added as a length of time' : fmtTime(e.start) + ' – ' + fmtTime(e.start + T.entryMin(e)) + (T.crossesMidnight(e) ? ' (next day)' : '');
        var info = el('p', 'e-info', when);
        var cm = T.chargedMin(e, c);
        var money = e.rate > 0 ? T.fmtMoney(T.centsFor(cm, e.rate), c ? c.sym : '') : '';
        if (e.billable !== false && cm !== T.entryMin(e)) info.appendChild(el('span', null, ' · Charged ' + T.fmtDur(cm) + (money ? ' = ' + money : '')));
        else if (e.billable !== false && money) info.appendChild(el('span', null, ' · ' + money));
        li.appendChild(info);
        if (e.bill || e.billable === false) {
            var tags = el('p', 'tags');
            if (e.bill) tags.appendChild(el('span', 'tag billed', 'Billed ' + shortFmt.format(utc(e.bill.at))));
            if (e.billable === false) tags.appendChild(el('span', 'tag free', 'Not charged'));
            li.appendChild(tags);
        }
        var b = el('div', 'row-btns small');
        b.appendChild(btn('Continue', 'secondary', function () {
            $('t-client').value = e.client; syncPicker('t-client', 't-new'); $('t-task').value = e.task; startTimer();
            $('timer-card').scrollIntoView({ block: 'start' });
        }));
        b.appendChild(btn('Edit', 'secondary', function () { editingId = e.id; renderEntries(); var f = document.querySelector('.edit-form input, .edit-form select'); if (f) f.focus(); }));
        b.appendChild(btn('Delete', 'secondary', function () {
            snap(); S.entries = S.entries.filter(function (x) { return x.id !== e.id; }); save(); renderAll();
            msg('entries-msg', 'Deleted ' + T.fmtDur(T.entryMin(e)) + (c ? ' for ' + c.name : '') + '.', true);
        }));
        li.appendChild(b);
        return li;
    }
    function editBox(e) {
        var li = el('li', 'box edit-form'), uid = 'ed' + e.id;
        function field(labelText, input, id) { var l = el('label', null, labelText); l.htmlFor = id; input.id = id; li.appendChild(l); li.appendChild(input); return input; }
        li.appendChild(el('h3', null, 'Change this time'));
        var sel = el('select'); fillSelect(sel, e.client); sel.removeChild(sel.lastChild); sel.value = e.client;
        field('Client', sel, uid + '-c');
        var task = el('input'); task.type = 'text'; task.maxLength = 80; task.value = e.task; task.setAttribute('list', 'task-list'); task.autocomplete = 'off';
        field('What did you work on?', task, uid + '-t');
        var date = el('input'); date.type = 'date'; date.value = e.date; date.max = today();
        field('Day', date, uid + '-d');
        var fs = el('fieldset', 'mode'); fs.appendChild(el('legend', null, 'Time'));
        var mode = e.start == null ? 'length' : 'times';
        ['times', 'length'].forEach(function (m) {
            var l = el('label', 'radio'), r = el('input'); r.type = 'radio'; r.name = uid + '-m'; r.value = m; r.checked = m === mode;
            l.appendChild(r); l.appendChild(document.createTextNode(m === 'times' ? ' Start and finish' : ' Just how long')); fs.appendChild(l);
            r.addEventListener('change', function () { mode = m; show(); });
        });
        li.appendChild(fs);
        var pair = el('div', 'pair'), s1 = el('div'), s2 = el('div');
        var st = el('input'); st.type = 'time'; var fi = el('input'); fi.type = 'time';
        var l1 = el('label', null, 'Start'); l1.htmlFor = st.id = uid + '-s'; var l2 = el('label', null, 'Finish'); l2.htmlFor = fi.id = uid + '-f';
        s1.appendChild(l1); s1.appendChild(st); s2.appendChild(l2); s2.appendChild(fi); pair.appendChild(s1); pair.appendChild(s2); li.appendChild(pair);
        var lenWrap = el('div'), len = el('input'); len.type = 'text'; len.inputMode = 'decimal'; len.maxLength = 20; len.autocomplete = 'off';
        var l3 = el('label', null, 'How long'); l3.htmlFor = len.id = uid + '-l'; lenWrap.appendChild(l3); lenWrap.appendChild(len); li.appendChild(lenWrap);
        var mins = T.entryMin(e);
        var origStart = e.start == null ? '' : clock(e.start), origFinish = e.start == null ? '' : clock(e.start + mins);
        st.value = origStart || '09:00'; fi.value = origFinish || clock(540 + mins);
        len.value = Math.floor(mins / 60) + ':' + T.pad(mins % 60);
        var origLen = len.value;
        function show() { pair.hidden = mode !== 'times'; lenWrap.hidden = mode !== 'length'; }
        show();
        var charge = el('label', 'check'), cb = el('input'); cb.type = 'checkbox'; cb.checked = e.billable !== false; charge.appendChild(cb); charge.appendChild(document.createTextNode(' Charge for this time')); li.appendChild(charge);
        var billed = el('label', 'check'), bb = el('input'); bb.type = 'checkbox'; bb.checked = !!e.bill; billed.appendChild(bb); billed.appendChild(document.createTextNode(' Already billed')); li.appendChild(billed);
        var err = el('p', 'err'); err.setAttribute('role', 'alert'); li.appendChild(err);
        var row = el('div', 'row-btns small');
        row.appendChild(btn('Save', 'primary', function () {
            err.textContent = '';
            var r = T.entryFromForm({ mode: mode, date: date.value, start: st.value, finish: fi.value, length: len.value }, today());
            if (r.error) { err.textContent = r.error; return; }
            snap();
            var unchanged = mode === (e.start == null ? 'length' : 'times') && (mode === 'times' ? st.value === origStart && fi.value === origFinish : len.value === origLen);
            var c = clientById(sel.value);
            if (sel.value !== e.client && !e.bill) e.rate = c.rate;
            e.client = sel.value; e.task = T.cleanText(task.value, 80); e.date = r.entry.date; e.start = r.entry.start;
            if (!unchanged) e.sec = r.entry.sec;
            e.billable = cb.checked;
            if (bb.checked && !e.bill) e.bill = { at: today(), min: T.chargedMin(Object.assign({}, e, { bill: null }), c) };
            if (!bb.checked) e.bill = null;
            editingId = null; save(); renderAll();
            msg('entries-msg', 'Saved the change.', true);
        }));
        row.appendChild(btn('Cancel', 'secondary', function () { editingId = null; renderEntries(); }));
        row.appendChild(btn('Delete', 'danger', function () {
            snap(); S.entries = S.entries.filter(function (x) { return x.id !== e.id; }); editingId = null; save(); renderAll();
            msg('entries-msg', 'Deleted that time.', true);
        }));
        li.appendChild(row);
        li.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { editingId = null; renderEntries(); } });
        return li;
    }

    // ---------- what to bill ----------
    function currentRange() {
        return T.periodRange(S.period, today(), S.weekStart, S.from, S.to) || T.periodRange('week', today(), S.weekStart);
    }
    function renderTotals() {
        $('period').value = S.period;
        $('custom-dates').hidden = S.period !== 'custom';
        if (S.period === 'custom') { $('from').value = S.from || ''; $('to').value = S.to || ''; }
        var r = currentRange(), label = rangeLabel(r);
        $('range').textContent = S.period === 'custom' && !T.periodRange('custom', today(), 1, S.from, S.to) ? 'Choose both dates. Showing this week until then: ' + label : label;
        var sum = T.summarize(S, r, S.period === 'unbilled' ? 'unbilled' : null);
        var host = $('client-totals'); host.textContent = '';
        var g = $('grand'); g.textContent = '';
        $('csv').hidden = !sum.clients.length;
        $('totals-empty').hidden = sum.clients.length > 0;
        $('totals-empty').textContent = S.period === 'unbilled' ? 'Nothing left to bill. All your charged time is marked as billed.' : 'No time in these dates. Choose other dates in "Show", or start the timer.';
        if (!sum.clients.length) return;
        g.appendChild(el('span', 'g-label', sum.clients.length > 1 ? 'All clients' : 'Total'));
        g.appendChild(el('strong', 'g-hours', T.fmtDur(sum.min) + ' worked'));
        var ml = T.moneyLine(sum.money); if (ml) g.appendChild(el('strong', 'g-money', ml));
        if (S.timer) g.appendChild(el('span', 'hint', 'The running timer is added when you stop it.'));
        sum.clients.forEach(function (t) { host.appendChild(totalBox(t, label)); });
    }
    function totalBox(t, label) {
        var c = t.client, li = el('li', 'box total');
        var top = el('div', 'e-top');
        top.appendChild(el('strong', 'tb-name', c.name));
        if (t.cents > 0) top.appendChild(el('strong', 'tb-money', T.fmtMoney(t.cents, c.sym)));
        li.appendChild(top);
        var nb = function (x) { return x.replace(/ /g, '\u00a0'); };  // keep "5 h 30 min" on one line
        var hrs = 'Worked ' + nb(T.fmtDur(t.min));
        if (t.chargedMin !== t.min) hrs += ' · Charged ' + nb(T.fmtDur(t.chargedMin));
        var hp = el('p', 'tb-hours', hrs + ' ' + nb('(' + T.fmtDecimal(t.chargedMin) + ' h)'));
        li.appendChild(hp);
        var ul = el('ul', 'lines');
        t.lines.forEach(function (l) {
            var row = el('li');
            row.appendChild(el('span', 'l-task', l.task));
            row.appendChild(el('span', 'l-sum', T.fmtDur(l.chargedMin) + (l.rate > 0 ? ' × ' + T.fmtMoney(l.rate, c.sym) + '/h = ' + T.fmtMoney(l.cents, c.sym) : '')));
            ul.appendChild(row);
        });
        if (t.lines.length) li.appendChild(ul);
        var notes = [];
        if (!c.rate && !t.cents) notes.push('No rate for this client, so hours only.');
        if (t.freeMin) notes.push('Not charged: ' + T.fmtDur(t.freeMin) + '.');
        if (c.round && t.chargedMin !== t.min - t.freeMin) notes.push('Each entry rounded up to the next ' + c.round + ' min.');
        var billedCount = t.count - t.unbilledCount - (t.freeMin ? 0 : 0);
        if (t.lines.length && !t.unbilledCount) notes.push('All of this is marked as billed.');
        else if (t.unbilledCount && billedCount > 0 && S.period !== 'unbilled') notes.push(t.unbilledCount + ' of these entries not billed yet.');
        if (notes.length) li.appendChild(el('p', 'hint', notes.join(' ')));
        var b = el('div', 'row-btns small bill-btns');
        var text = T.invoiceText(t, label);
        if (t.lines.length) {
            b.appendChild(btn('Copy invoice lines', 'secondary', function () { copy(text, 'Copied the invoice lines for ' + c.name + '. Paste them into your invoice.'); }));
            var a = el('a', 'secondary', 'Email');
            a.href = 'mailto:?subject=' + encodeURIComponent('Hours for ' + c.name + ' - ' + label) + '&body=' + encodeURIComponent(text);
            b.appendChild(a);
        }
        if (t.unbilledCount) b.appendChild(btn('Mark as billed', 'primary', function () {
            var r = currentRange(); snap(); var n = 0;
            S.entries.forEach(function (e) {
                if (e.client === c.id && !e.bill && e.billable !== false && e.date >= r.from && e.date <= r.to) { e.bill = { at: today(), min: T.chargedMin(e, c) }; n++; }
            });
            save(); renderAll();
            msg('totals-msg', 'Marked ' + n + (n === 1 ? ' entry' : ' entries') + ' for ' + c.name + ' as billed.', true);
        }));
        if (b.children.length) li.appendChild(b);
        return li;
    }
    function copy(text, okText) {
        function fallback() {
            var ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
            ta.remove();
            msg('totals-msg', ok ? okText : 'Copying is blocked in this browser. Use "Email" instead.');
        }
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { msg('totals-msg', okText); }, fallback);
        else fallback();
    }
    function download(name, type, text) {
        var a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }

    // ---------- clients ----------
    function renderClients() {
        var host = $('client-list'); host.textContent = '';
        $('clients-empty').hidden = S.clients.length > 0 || !$('c-new').hidden;
        S.clients.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
            var li = el('li', 'box client');
            if (editingClient === c.id) {
                var box = el('div'); li.appendChild(box);
                var f = clientForm(box, c, true, function (saved, text) { editingClient = null; renderAll(); if (saved) msg('clients-msg', text, true); });
                host.appendChild(li); f.focus(); return;
            }
            var top = el('div', 'e-top');
            top.appendChild(el('strong', null, c.name));
            top.appendChild(el('span', 'e-dur', c.rate ? T.fmtMoney(c.rate, c.sym) + '/h' : 'No rate'));
            li.appendChild(top);
            var n = S.entries.filter(function (e) { return e.client === c.id; }).length;
            li.appendChild(el('p', 'e-info', (c.round ? 'Rounded up to ' + c.round + ' min' : 'Exact minutes') + ' · ' + n + (n === 1 ? ' entry' : ' entries')));
            var b = el('div', 'row-btns small');
            b.appendChild(btn('Edit', 'secondary', function () { editingClient = c.id; renderClients(); }));
            b.appendChild(btn('Delete', 'secondary', function () {
                snap();
                S.clients = S.clients.filter(function (x) { return x.id !== c.id; });
                S.entries = S.entries.filter(function (e) { return e.client !== c.id; });
                if (S.timer && S.timer.client === c.id) S.timer = null;
                save(); renderAll();
                msg('clients-msg', 'Deleted ' + c.name + (n ? ' and ' + n + (n === 1 ? ' entry' : ' entries') : '') + '.', true);
            }));
            li.appendChild(b);
            host.appendChild(li);
        });
    }

    var baseTitle = document.title;
    function renderAll() {
        fillSelect($('t-client')); fillSelect($('a-client'));
        syncPicker('a-client', 'a-new'); syncPicker('t-client', 't-new');
        $('week-start').value = String(S.weekStart);
        renderTimer(); renderEntries(); renderTotals(); renderClients();
    }

    // ---------- wiring ----------
    function init() {
        load();
        if (!saving) $('storage-warn').hidden = false;
        $('a-date').value = today(); $('a-date').max = today();
        renderAll();

        $('t-client').addEventListener('change', function () { syncPicker('t-client', 't-new'); if ($('t-client').value === '__new') pickers['t-client'].focus(); });
        $('a-client').addEventListener('change', function () { syncPicker('a-client', 'a-new'); if ($('a-client').value === '__new') pickers['a-client'].focus(); });
        $('start').addEventListener('click', startTimer);
        $('t-task').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); startTimer(); } });
        $('stop').addEventListener('click', function () {
            var r = stopAt(Date.now());
            if (r.error) { openForgot(); $('stop-err').textContent = r.error; return; }
            $('forgot-box').hidden = true; renderAll(); msg('timer-msg', r.text, r.undo);
        });
        $('forgot').addEventListener('click', openForgot);
        $('stop-at').addEventListener('click', function () {
            $('stop-err').textContent = '';
            var d = $('stop-date').value, m = T.parseClock($('stop-time').value);
            if (!T.isDate(d) || m == null) { $('stop-err').textContent = 'Choose the day and the time you stopped.'; return; }
            var p = d.split('-'), end = new Date(+p[0], +p[1] - 1, +p[2], Math.floor(m / 60), m % 60).getTime();
            if (end > Date.now()) { $('stop-err').textContent = 'That time has not come yet. Choose when you really stopped.'; return; }
            if (end <= S.timer.startMs) { $('stop-err').textContent = 'That is before the timer started (' + fmtTime(T.minuteOf(S.timer.startMs)) + '). Choose a later time.'; return; }
            var r = stopAt(end);
            if (r.error) { $('stop-err').textContent = r.error; return; }
            $('forgot-box').hidden = true; $('stop-date').value = ''; renderAll(); msg('timer-msg', r.text, r.undo);
        });
        $('discard').addEventListener('click', function () {
            snap(); S.timer = null; save(); $('forgot-box').hidden = true; $('stop-date').value = ''; renderAll();
            msg('timer-msg', 'Threw the timer away. Nothing was saved.', true);
        });

        $('show-add').addEventListener('click', function () {
            var f = $('add-form'); f.hidden = !f.hidden; this.setAttribute('aria-expanded', String(!f.hidden));
            this.hidden = !f.hidden;
            if (!f.hidden) { $('a-date').max = today(); if (!$('a-date').value) $('a-date').value = today(); previewAdd(); $('a-client').focus(); }
        });
        $('a-cancel').addEventListener('click', function () { $('add-form').hidden = true; $('show-add').hidden = false; $('show-add').setAttribute('aria-expanded', 'false'); $('show-add').focus(); });
        $('add-form').addEventListener('submit', addTime);
        ['a-date', 'a-start', 'a-finish', 'a-length', 'a-client'].forEach(function (i) { $(i).addEventListener('input', previewAdd); $(i).addEventListener('change', previewAdd); });
        document.querySelectorAll('input[name="a-mode"]').forEach(function (r) { r.addEventListener('change', function () { previewAdd(); }); });

        $('more-days').addEventListener('click', function () { daysShown += 14; renderEntries(); });
        $('period').addEventListener('change', function () {
            S.period = this.value;
            if (S.period === 'custom' && !S.from) { var w = T.periodRange('month', today(), S.weekStart); S.from = w.from; S.to = today(); }
            save(); renderTotals();
        });
        ['from', 'to'].forEach(function (i) { $(i).addEventListener('change', function () { S[i] = this.value || undefined; save(); renderTotals(); }); });
        $('csv').addEventListener('click', function () {
            var r = currentRange();
            download('hours-' + (r.from === '0000-01-01' ? 'not-billed-' + today() : r.from + '-to-' + r.to) + '.csv', 'text/csv', '﻿' + T.toCSV(S.period === 'unbilled' ? { clients: S.clients, entries: S.entries.filter(function (e) { return !e.bill && e.billable !== false; }) } : S, r));
            msg('totals-msg', 'Saved the spreadsheet. Open it in Excel, Numbers or Google Sheets.');
        });

        $('add-client').addEventListener('click', function () {
            var box = $('c-new'); box.hidden = false; this.hidden = true; $('clients-empty').hidden = true;
            var f = clientForm(box, null, true, function (c, text) {
                box.hidden = true; box.textContent = ''; $('add-client').hidden = false;
                renderAll(); if (c) msg('clients-msg', text, true);
            });
            f.focus();
        });
        $('week-start').addEventListener('change', function () { S.weekStart = +this.value; save(); renderTotals(); });
        $('backup').addEventListener('click', function () {
            download('time-tracker-backup-' + today() + '.json', 'application/json', JSON.stringify(S, null, 1));
            msg('settings-msg', 'Saved the backup file. Keep it somewhere safe, for example in your email or cloud drive.');
        });
        $('restore').addEventListener('click', function () { $('restore-file').click(); });
        $('restore-file').addEventListener('change', function () {
            var file = this.files && this.files[0]; this.value = '';
            if (!file) return;
            if (file.size > 20 * 1024 * 1024) { msg('settings-msg', 'That file is too big to be a backup from this app.'); return; }
            var rd = new FileReader();
            rd.onload = function () {
                var data; try { data = JSON.parse(rd.result); } catch (e) { msg('settings-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
                var v = T.validate(data);
                if (!v.clients.length) { msg('settings-msg', 'That file has no clients or hours from this app. Nothing was changed.'); return; }
                snap(); S = v; editingId = null; editingClient = null; save(); renderAll();
                msg('settings-msg', 'Restored ' + v.clients.length + (v.clients.length === 1 ? ' client' : ' clients') + ' and ' + v.entries.length + (v.entries.length === 1 ? ' entry' : ' entries') + '.', true);
            };
            rd.onerror = function () { msg('settings-msg', 'Could not read that file. Nothing was changed.'); };
            rd.readAsText(file);
        });
        $('wipe').addEventListener('click', function () {
            if (!S.clients.length && !S.entries.length && !S.timer) { msg('settings-msg', 'There is nothing to delete.'); return; }
            snap(); var ws = S.weekStart; S = T.emptyState(); S.weekStart = ws; editingId = null; editingClient = null; save(); renderAll();
            msg('settings-msg', 'Deleted all clients and hours.', true);
        });

        // another tab changed something
        window.addEventListener('storage', function (e) { if (e.key === KEY) { load(); renderAll(); } });
        // a new day while the page stays open
        var lastDay = today();
        setInterval(function () { if (today() !== lastDay) { lastDay = today(); $('a-date').max = today(); renderEntries(); renderTotals(); } }, 60000);

        if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
    }
    init();
})();
