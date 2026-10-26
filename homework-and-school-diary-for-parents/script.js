// Homework and School Diary for Parents: the page. All logic that needs checking lives in core.js (window.HW).
(function () {
    'use strict';
    var SLUG = 'homework-and-school-diary-for-parents', KEY = SLUG + '.state', PREFS = SLUG + '.prefs';
    var SUBJECTS = ['English', 'Maths', 'Science', 'Urdu', 'Islamiat', 'Social studies', 'Computer', 'Art'];
    var DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
    var $ = function (id) { return document.getElementById(id); };

    var state = { v: 1, children: [], items: [] }, canSave = true;
    var ui = { child: '', due: '', dueChip: 'next', weekStart: '', edit: '', childForm: '', repeatOpen: false };

    // ---------- storage ----------
    function load() {
        try {
            var raw = localStorage.getItem(KEY);
            if (raw) { try { state = HW.cleanState(JSON.parse(raw)); } catch (e) { state = HW.cleanState(null); } }
            var p = JSON.parse(localStorage.getItem(PREFS) || 'null');
            if (p && typeof p.child === 'string') ui.child = p.child;
            localStorage.setItem(SLUG + '.probe', '1'); localStorage.removeItem(SLUG + '.probe');
        } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    function save() {
        if (!canSave) return;
        try { localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem(PREFS, JSON.stringify({ child: ui.child })); }
        catch (e) { canSave = false; $('storage-warn').hidden = false; }
    }

    // ---------- small helpers ----------
    function el(tag, attrs) {
        var n = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            var v = attrs[k];
            if (v === null || v === undefined || v === false) return;
            if (k === 'text') n.textContent = v;
            else if (k === 'class') n.className = v;
            else if (k === 'on') Object.keys(v).forEach(function (ev) { n.addEventListener(ev, v[ev]); });
            else if (k in n && typeof v !== 'string') n[k] = v;
            else n.setAttribute(k, v === true ? '' : v);
        });
        for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c === null || c === undefined || c === false) continue; n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
        return n;
    }
    function today() { return HW.todayIso(); }
    function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
    var msgTimers = {};
    function showMsg(box, text, undo) {
        clear(box); box.className = 'msg show';
        box.appendChild(el('span', { text: text }));
        if (undo) box.appendChild(el('button', { type: 'button', class: 'undo', text: 'Undo', on: { click: undo } }));
        clearTimeout(msgTimers[box.id]);
        msgTimers[box.id] = setTimeout(function () { clear(box); box.className = 'msg'; }, undo ? 12000 : 5000);
    }
    // Every change goes through here, so every change can be undone.
    function commit(box, text, change) {
        var before = JSON.stringify(state);
        change();
        state = HW.cleanState(JSON.parse(JSON.stringify(state)));
        save(); render();
        showMsg(box, text, function () {
            state = HW.cleanState(JSON.parse(before)); ui.edit = ''; if (state.children.length && ui.childForm === 'new') ui.childForm = ''; save(); render(); showMsg(box, 'Undone.');
        });
    }
    function childLabel(c) { return c.name + (c.cls ? ' (' + c.cls + ')' : ''); }
    function dueText(iso, t) { return HW.fmt(iso, iso.slice(0, 4) !== t.slice(0, 4)) + ' (' + HW.rel(iso, t) + ')'; }
    function copyText(text, box) {
        function fallback() {
            var ta = el('textarea', { readonly: true, style: 'position:fixed;top:0;left:0;opacity:0;' }); ta.value = text; document.body.appendChild(ta); ta.select();
            var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            showMsg(box, ok ? 'Copied. Paste it into WhatsApp, a text or an email.' : 'Copying is blocked here. Use Email instead.');
        }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { showMsg(box, 'Copied. Paste it into WhatsApp, a text or an email.'); }, fallback);
        else fallback();
    }
    function mailHref(subject, text) { return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text); }

    // ---------- item rows ----------
    function toggleDone(o, box) {
        var it = o.item, t = today(), name = HW.itemTitle(it);
        var wasDone = HW.isDone(it, o.date);
        commit(box, wasDone ? name + ' is open again.' : name + ' ticked done.', function () {
            if (it.repeat === 'weekly') {
                var i = it.doneDates.indexOf(o.date);
                if (i >= 0) it.doneDates.splice(i, 1); else it.doneDates.push(o.date);
            } else it.doneOn = wasDone ? '' : t;
        });
    }
    function itemRow(o, opts) {
        var it = o.item, t = today(), late = !o.done && it.repeat !== 'weekly' && o.date < t;
        var when = opts.when === false ? null : el('span', { class: 'i-when', text: (late ? 'Was due ' : 'Due ') + dueText(o.date, t) + (it.repeat === 'weekly' ? ', every week' : '') });
        var textBox = el('div', { class: 'i-text' },
            el('span', { class: 'tag ' + it.type, text: HW.TYPES[it.type] }),
            it.subject ? el('b', { text: it.subject }) : null,
            it.subject && it.text ? ': ' : '', it.text || '', when);
        var btns = el('div', { class: 'i-btns' });
        btns.appendChild(el('button', { type: 'button', class: o.done ? '' : 'tick', text: o.done ? 'Not done' : 'Done', 'aria-label': (o.done ? 'Not done: ' : 'Done: ') + HW.itemTitle(it), on: { click: function () { toggleDone(o, opts.box); } } }));
        if (opts.move && late) {
            var child = HW.findChild(state, it.childId), to = child && HW.nextSchoolDay(child, t);
            if (to) btns.appendChild(el('button', { type: 'button', text: 'Move to ' + HW.fmt(to), on: { click: function () {
                commit(opts.box, HW.itemTitle(it) + ' moved to ' + HW.fmt(to) + '.', function () { it.due = to; });
            } } }));
        }
        if (opts.edit) btns.appendChild(el('button', { type: 'button', text: 'Edit', 'aria-label': 'Edit ' + HW.itemTitle(it), on: { click: function () { ui.edit = it.id; ui.childForm = ''; render(); focusIn('edit-' + it.id); } } }));
        return el('li', { class: 'item' + (late ? ' late' : '') + (o.done ? ' done' : '') }, textBox, btns);
    }
    function focusIn(id) { var n = $(id); if (n) { var f = n.querySelector('input, textarea, select'); if (f) f.focus(); n.scrollIntoView({ block: 'nearest' }); } }

    function editBox(it) {
        var id = 'edit-' + it.id, box = el('li', { class: 'edit-box', id: id });
        var type = el('select', { id: id + '-type' });
        Object.keys(HW.TYPES).forEach(function (k) { type.appendChild(el('option', { value: k, text: HW.TYPES[k] })); });
        type.value = it.type;
        var subj = el('input', { type: 'text', id: id + '-subj', maxlength: '40', value: it.subject, autocomplete: 'off', list: 'subject-list' });
        var what = el('textarea', { id: id + '-what', maxlength: '600', rows: '3' }); what.value = it.text;
        var due = el('input', { type: 'date', id: id + '-due', value: it.due });
        var rep = el('input', { type: 'checkbox', id: id + '-rep', checked: it.repeat === 'weekly' });
        var err = el('p', { class: 'err', role: 'alert' });
        box.append(
            el('label', { for: id + '-type', text: 'What kind' }), type,
            el('label', { for: id + '-subj', text: 'Subject' }), subj,
            el('label', { for: id + '-what', text: 'What to do' }), what,
            el('label', { for: id + '-due', text: it.repeat === 'weekly' ? 'First day (it repeats every week from this day)' : 'Due' }), due,
            el('label', { class: 'check' }, rep, el('span', { text: 'Repeats every week' })),
            err,
            el('div', { class: 'form-btns' },
                el('button', { type: 'button', class: 'primary', text: 'Save', on: { click: function () {
                    var s = subj.value.trim(), w = what.value.trim();
                    if (!s && !w) { err.textContent = 'Write what to do, or a subject.'; what.setAttribute('aria-invalid', 'true'); what.focus(); return; }
                    if (!HW.isIso(due.value)) { err.textContent = 'Pick the due date.'; due.setAttribute('aria-invalid', 'true'); due.focus(); return; }
                    ui.edit = '';
                    commit($('kids-msg'), 'Saved ' + (s || HW.TYPES[type.value]) + '.', function () {
                        var weekly = rep.checked;
                        if (weekly !== (it.repeat === 'weekly')) { it.doneOn = ''; it.doneDates = []; }
                        it.type = type.value; it.subject = s; it.text = w; it.due = due.value; it.repeat = weekly ? 'weekly' : '';
                    });
                } } }),
                el('button', { type: 'button', class: 'secondary', text: 'Cancel', on: { click: function () { ui.edit = ''; render(); } } }),
                el('button', { type: 'button', class: 'danger', text: 'Delete', on: { click: function () {
                    ui.edit = '';
                    commit($('kids-msg'), 'Deleted ' + HW.itemTitle(it) + '.', function () { state.items = state.items.filter(function (x) { return x.id !== it.id; }); });
                } } })
            ));
        return box;
    }

    // ---------- tonight's check ----------
    function renderTonight() {
        var t = today(), body = $('tonight-body'); clear(body);
        $('tonight-date').textContent = HW.fmtLong(t) + ' ' + t.slice(0, 4) + '. What each child needs for their next school day.';
        $('tonight-tools').hidden = !state.children.length;
        $('email-tonight').href = mailHref('Homework and tests for ' + HW.fmt(t), HW.tonightText(state, t));
        if (!state.children.length) {
            body.appendChild(el('p', { class: 'empty-note', text: 'Start by adding your child in "Your children". Then write their homework in "Add homework or a test", and this box tells you every evening what is due next.' }));
            return;
        }
        HW.tonight(state, t).forEach(function (r) {
            var c = r.child, box = el('div', { class: 't-kid' });
            box.appendChild(el('h3', null, c.name, c.cls ? el('small', { text: ' ' + c.cls }) : null));
            if (r.holiday && r.next) box.appendChild(el('p', { class: 't-holiday', text: 'No school: ' + (r.holiday.label || 'holiday') + ' until ' + HW.fmt(r.holiday.to) + '. Back on ' + HW.fmt(r.next) + '.' }));
            var opts = { box: $('tonight-msg') };
            function list(head, arr, cls, day) {
                if (!arr.length) return;
                box.appendChild(el('p', { class: 't-head' + (cls ? ' ' + cls : ''), text: head }));
                // under "For Tue 27 Oct" the date is only repeated for an item due on another day (a weekend)
                var ul = el('ul', { class: 'items' }); arr.forEach(function (o) { ul.appendChild(itemRow(o, { box: opts.box, when: day && o.date === day && o.item.repeat !== 'weekly' ? false : undefined })); }); box.appendChild(ul);
            }
            list('Late', r.late, 'late');
            list('Due today, not ticked', r.dueToday, 'late');
            if (!r.next) box.appendChild(el('p', { class: 't-none', text: 'No school days are ticked for ' + c.name + '. Tap "Edit child" in their box.' }));
            else {
                var nextHead = 'For ' + HW.fmt(r.next) + ' (' + HW.rel(r.next, t) + ')';
                if (r.forNext.length) list(nextHead, r.forNext, '', r.next);
                if (!r.forNext.length) box.appendChild(el('p', { class: 't-none', text: 'Nothing written down for ' + HW.fmt(r.next) + ' (' + HW.rel(r.next, t) + ').' }));
                else if (!r.left) box.appendChild(el('p', { class: 't-ok', text: 'All done for ' + HW.fmt(r.next) + '.' }));
            }
            list('Coming up', r.soon);
            body.appendChild(box);
        });
    }

    // ---------- each child's box ----------
    function renderKids() {
        var t = today(), list = $('kid-list'); clear(list);
        var box = $('kids-msg');
        if (!state.children.length && !ui.childForm) ui.childForm = 'new';
        state.children.forEach(function (c) {
            var li = el('li', { class: 'kid', id: 'kid-' + c.id });
            var meta = [c.cls, 'School days: ' + HW.daysText(c.days)];
            if (c.holidays.length) meta.push(c.holidays.length === 1 ? '1 holiday' : c.holidays.length + ' holidays');
            li.appendChild(el('div', { class: 'kid-top' },
                el('div', { style: 'min-width:0;flex:1 1 10rem' }, el('h3', { text: c.name }), el('p', { class: 'kid-meta', text: meta.filter(Boolean).join(' · ') })),
                el('button', { type: 'button', class: 'secondary small', text: 'Edit child', 'aria-label': 'Edit ' + c.name, on: { click: function () { ui.childForm = c.id; ui.edit = ''; render(); focusIn('child-form'); } } })));
            if (ui.childForm === c.id) { li.appendChild(childForm(c)); list.appendChild(li); return; }
            var plan = HW.childPlan(state, c, t), opts = { box: box, edit: true, move: true };
            function rows(head, arr, cls) {
                li.appendChild(el('p', { class: 't-head' + (cls ? ' ' + cls : ''), text: head }));
                var ul = el('ul', { class: 'items' });
                arr.forEach(function (o) { ul.appendChild(ui.edit === o.item.id ? editBox(o.item) : itemRow(o, opts)); });
                li.appendChild(ul);
            }
            if (plan.late.length) rows('Late (' + plan.late.length + ')', plan.late, 'late');
            if (plan.open.length) rows('To do (' + plan.open.length + ')', plan.open);
            if (!plan.late.length && !plan.open.length) li.appendChild(el('p', { class: 't-none', text: 'Nothing to do. Write new homework in "Add homework or a test".' }));
            var weekly = state.items.filter(function (it) { return it.childId === c.id && it.repeat === 'weekly'; });
            if (weekly.length) {
                var dw = el('details', { open: weekly.some(function (it) { return it.id === ui.edit; }) }, el('summary', { text: 'Every week (' + weekly.length + ')' }));
                var ulw = el('ul', { class: 'items' });
                weekly.forEach(function (it) {
                    if (ui.edit === it.id) { ulw.appendChild(editBox(it)); return; }
                    var o = { item: it, date: HW.occurrences(it, t, HW.addDays(t, 6))[0] ? HW.occurrences(it, t, HW.addDays(t, 6))[0].date : it.due };
                    var row = el('li', { class: 'item' }, el('div', { class: 'i-text' }, el('span', { class: 'tag ' + it.type, text: HW.TYPES[it.type] }), it.subject ? el('b', { text: it.subject }) : null, it.subject && it.text ? ': ' : '', it.text,
                        el('span', { class: 'i-when', text: 'Every ' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][HW.weekday(it.due)] + ', next ' + HW.fmt(o.date) })),
                        el('div', { class: 'i-btns' }, el('button', { type: 'button', text: 'Edit', 'aria-label': 'Edit ' + HW.itemTitle(it), on: { click: function () { ui.edit = it.id; render(); focusIn('edit-' + it.id); } } })));
                    ulw.appendChild(row);
                });
                dw.appendChild(ulw); li.appendChild(dw);
            }
            if (plan.done.length) {
                var dd = el('details', { open: plan.done.slice(0, 15).some(function (o) { return o.item.id === ui.edit; }) }, el('summary', { text: 'Done recently (' + plan.done.length + ')' }));
                var uld = el('ul', { class: 'items' });
                plan.done.slice(0, 15).forEach(function (o) { uld.appendChild(ui.edit === o.item.id ? editBox(o.item) : itemRow(o, opts)); });
                if (plan.done.length > 15) uld.appendChild(el('li', { class: 'hint', text: 'Showing the latest 15. Older ones stay in the backup file and in "Week at a glance".' }));
                dd.appendChild(uld); li.appendChild(dd);
            }
            list.appendChild(li);
        });
        var slot = $('child-form-slot'); clear(slot);
        if (ui.childForm === 'new') slot.appendChild(childForm(null));
        $('add-child').hidden = ui.childForm === 'new' || state.children.length >= HW.LIMITS.children;
    }

    function childForm(c) {
        var draft = { subjects: c ? c.subjects.slice() : [], holidays: c ? c.holidays.map(function (h) { return { from: h.from, to: h.to, label: h.label }; }) : [] };
        var f = el('div', { class: 'child-form', id: 'child-form' });
        f.appendChild(el('h3', { text: c ? 'Edit ' + c.name : 'Add a child' }));
        var name = el('input', { type: 'text', id: 'cf-name', maxlength: '40', autocomplete: 'off', placeholder: 'e.g. Ali', value: c ? c.name : '' });
        f.append(el('label', { for: 'cf-name', text: 'Name' }), name);
        var cls = el('input', { type: 'text', id: 'cf-cls', maxlength: '40', autocomplete: 'off', placeholder: 'e.g. Class 5', value: c ? c.cls : '' });
        var clsWrap = el('div', { hidden: !(c && c.cls) }, el('label', { for: 'cf-cls', text: 'Class or school' }), cls);
        var clsOpen = el('button', { type: 'button', class: 'link', text: '+ Add class or school (optional)', hidden: !!(c && c.cls), on: { click: function () { clsWrap.hidden = false; clsOpen.hidden = true; cls.focus(); } } });
        f.append(clsOpen, clsWrap);

        var days = c ? c.days.slice() : HW.DEFAULT_DAYS.slice();
        var dayBoxes = {};
        var dayGrid = el('div', { class: 'chips days' });
        DAY_ORDER.forEach(function (d) {
            var cb = el('input', { type: 'checkbox', value: String(d), checked: days.indexOf(d) >= 0, 'aria-label': ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d] });
            dayBoxes[d] = cb; dayGrid.appendChild(el('label', null, cb, el('span', { text: HW.DAY_SHORT[d] })));
        });
        function setDays(list) { DAY_ORDER.forEach(function (d) { dayBoxes[d].checked = list.indexOf(d) >= 0; }); }
        var presets = el('div', { class: 'presets' },
            el('button', { type: 'button', text: 'Mon to Fri', on: { click: function () { setDays([1, 2, 3, 4, 5]); } } }),
            el('button', { type: 'button', text: 'Mon to Sat', on: { click: function () { setDays([1, 2, 3, 4, 5, 6]); } } }),
            el('button', { type: 'button', text: 'Sun to Thu', on: { click: function () { setDays([0, 1, 2, 3, 4]); } } }));
        f.appendChild(el('fieldset', null, el('legend', { text: 'School days' }), dayGrid, presets));

        var subjBox = el('div', { class: 'chips small-chips' });
        function paintSubjects() {
            clear(subjBox);
            var all = SUBJECTS.concat(draft.subjects.filter(function (s) { return SUBJECTS.indexOf(s) < 0; }));
            all.forEach(function (s) {
                var on = draft.subjects.indexOf(s) >= 0;
                subjBox.appendChild(el('button', { type: 'button', class: 'chip-btn', 'aria-pressed': on ? 'true' : 'false', text: s, on: { click: function () {
                    var i = draft.subjects.indexOf(s); if (i >= 0) draft.subjects.splice(i, 1); else if (draft.subjects.length < HW.LIMITS.subjects) draft.subjects.push(s); paintSubjects();
                } } }));
            });
        }
        var other = el('input', { type: 'text', id: 'cf-subj', maxlength: '40', autocomplete: 'off', placeholder: 'Other subject' });
        function addOther() {
            var s = other.value.trim(); if (!s) return;
            if (draft.subjects.indexOf(s) < 0 && draft.subjects.length < HW.LIMITS.subjects) draft.subjects.push(s);
            other.value = ''; paintSubjects(); other.focus();
        }
        other.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addOther(); } });
        paintSubjects();
        f.appendChild(el('fieldset', null, el('legend', { text: 'Subjects (optional): tap the ones they have' }), subjBox,
            el('label', { for: 'cf-subj', class: 'sr-label', text: 'Another subject' }),
            el('div', { class: 'subj-add' }, other, el('button', { type: 'button', class: 'secondary small', text: 'Add', on: { click: addOther } }))));

        var holBox = el('div');
        function paintHolidays() {
            clear(holBox);
            draft.holidays.forEach(function (h, i) {
                var fid = 'cf-h' + i;
                var from = el('input', { type: 'date', id: fid + 'f', value: h.from, on: { input: function () { h.from = from.value; } } });
                var to = el('input', { type: 'date', id: fid + 't', value: h.to, on: { input: function () { h.to = to.value; } } });
                var lab = el('input', { type: 'text', id: fid + 'l', maxlength: '40', placeholder: 'e.g. Winter break', value: h.label, on: { input: function () { h.label = lab.value; } } });
                holBox.appendChild(el('div', { class: 'hol-row' },
                    el('div', null, el('label', { for: fid + 'f', text: 'First day off' }), from),
                    el('div', null, el('label', { for: fid + 't', text: 'Last day off' }), to),
                    el('div', { class: 'wide' }, el('label', { for: fid + 'l', text: 'Name (optional)' }), lab),
                    el('button', { type: 'button', class: 'rm', text: 'Remove this holiday', on: { click: function () { draft.holidays.splice(i, 1); paintHolidays(); } } })));
            });
        }
        paintHolidays();
        f.append(holBox, el('button', { type: 'button', class: 'link', text: '+ Add a holiday or break (optional)', on: { click: function () {
            if (draft.holidays.length >= HW.LIMITS.holidays) return;
            var t = today(); draft.holidays.push({ from: t, to: t, label: '' }); paintHolidays(); focusIn('cf-h' + (draft.holidays.length - 1) + 'f');
        } } }));

        var err = el('p', { class: 'err', role: 'alert' });
        f.appendChild(err);
        var btns = el('div', { class: 'form-btns' },
            el('button', { type: 'button', class: 'primary', text: 'Save child', on: { click: function () {
                var n = name.value.trim();
                name.removeAttribute('aria-invalid');
                if (!n) { err.textContent = 'Type the child\'s name.'; name.setAttribute('aria-invalid', 'true'); name.focus(); return; }
                var picked = DAY_ORDER.filter(function (d) { return dayBoxes[d].checked; });
                if (!picked.length) { err.textContent = 'Tick at least one school day.'; return; }
                for (var i = 0; i < draft.holidays.length; i++) {
                    var h = draft.holidays[i];
                    if (!HW.isIso(h.from) || !HW.isIso(h.to)) { err.textContent = 'Pick both days of each holiday, or remove it.'; focusIn('cf-h' + i + 'f'); return; }
                }
                var data = { name: n, cls: cls.value.trim(), subjects: draft.subjects.slice(), days: picked, holidays: draft.holidays.map(function (h) { return { from: h.from, to: h.to, label: h.label.trim() }; }) };
                ui.childForm = '';
                if (c) commit($('kids-msg'), 'Saved ' + n + '.', function () { var cc = HW.findChild(state, c.id); Object.keys(data).forEach(function (k) { cc[k] = data[k]; }); });
                else {
                    var id = HW.uid();
                    ui.child = id;
                    commit($('kids-msg'), 'Added ' + n + '. Now write their homework in "Add homework or a test".', function () { data.id = id; state.children.push(data); });
                }
            } } }),
            el('button', { type: 'button', class: 'secondary', text: 'Cancel', hidden: !c && !state.children.length, on: { click: function () { ui.childForm = ''; render(); } } }),
            c ? el('button', { type: 'button', class: 'danger', text: 'Delete ' + c.name + ' and their items', on: { click: function () {
                ui.childForm = '';
                commit($('kids-msg'), 'Deleted ' + c.name + ' and their items.', function () {
                    state.children = state.children.filter(function (x) { return x.id !== c.id; });
                    state.items = state.items.filter(function (x) { return x.childId !== c.id; });
                });
            } } }) : null);
        f.appendChild(btns);
        return f;
    }

    // ---------- add homework ----------
    var PH = {
        homework: ['What to do', 'e.g. Exercise 4.2, questions 1 to 10', 'e.g. Maths'],
        test: ['What the test is on', 'e.g. Chapters 3 and 4', 'e.g. Science'],
        project: ['What the project is', 'e.g. Poster on the water cycle', 'e.g. Science'],
        reminder: ['What to remember', 'e.g. Bring the PE kit, sign the trip form', 'e.g. PE (optional)']
    };
    function selChild() { return HW.findChild(state, ui.child) || state.children[0] || null; }
    function typeVal() { var r = document.querySelector('input[name=type]:checked'); return r ? r.value : 'homework'; }
    function dueOptions(c, t) {
        var next = c ? HW.nextSchoolDay(c, t) : null, out = [{ k: 'today', label: 'Today', date: t }, { k: 'tomorrow', label: 'Tomorrow', date: HW.addDays(t, 1) }];
        if (next && next !== HW.addDays(t, 1)) out.push({ k: 'next', label: 'Next school day, ' + HW.fmt(next), date: next });
        out.push({ k: 'week', label: 'In 1 week', date: HW.addDays(t, 7) });
        return { list: out, next: next };
    }
    function pickDefaultDue() {
        var c = selChild(), t = today(), o = dueOptions(c, t);
        var want = ui.dueChip === 'next' ? (o.next || HW.addDays(t, 1)) : null;
        o.list.forEach(function (x) { if (x.k === ui.dueChip) want = x.date; });
        ui.due = want || HW.addDays(t, 1);
    }
    function renderAdder() {
        var has = state.children.length > 0;
        $('add-form').hidden = !has; $('add-empty').hidden = has;
        if (!has) return;
        var c = selChild(); ui.child = c.id;
        var chips = $('child-chips'); clear(chips);
        $('child-field').hidden = false;
        state.children.forEach(function (k) {
            var r = el('input', { type: 'radio', name: 'child', value: k.id, checked: k.id === c.id, on: { change: function () { ui.child = k.id; save(); if (ui.dueChip) pickDefaultDue(); renderAdder(); } } });
            chips.appendChild(el('label', null, r, el('span', { text: k.name })));
        });
        // subjects of this child, plus any they used before
        var subs = c.subjects.slice();
        state.items.forEach(function (it) { if (it.childId === c.id && it.subject && subs.indexOf(it.subject) < 0) subs.push(it.subject); });
        var dl = $('subject-list'); clear(dl); subs.forEach(function (s) { dl.appendChild(el('option', { value: s })); });
        var sc = $('subject-chips'); clear(sc);
        c.subjects.forEach(function (s) {
            sc.appendChild(el('button', { type: 'button', class: 'chip-btn', 'aria-pressed': $('subject').value === s ? 'true' : 'false', text: s, on: { click: function () { $('subject').value = s; $('subject').removeAttribute('aria-invalid'); renderAdder(); } } }));
        });
        var ph = PH[typeVal()];
        $('what-label').textContent = ph[0]; $('what').placeholder = ph[1]; $('subject').placeholder = ph[2];
        // due
        var t = today(), o = dueOptions(c, t), dc = $('due-chips'); clear(dc);
        if (ui.dueChip) pickDefaultDue();
        o.list.forEach(function (x) {
            var r = el('input', { type: 'radio', name: 'due-chip', value: x.k, checked: x.date === ui.due && (ui.dueChip === x.k || !ui.dueChip), on: { change: function () { ui.dueChip = x.k; ui.due = x.date; renderAdder(); } } });
            dc.appendChild(el('label', null, r, el('span', { text: x.label })));
        });
        // only one chip lights up even when two give the same day
        var lit = dc.querySelectorAll('input:checked'); for (var i = 1; i < lit.length; i++) lit[i].checked = false;
        if (!dc.querySelector('input:checked')) { var m = o.list.filter(function (x) { return x.date === ui.due; })[0]; if (m) dc.querySelector('input[value="' + m.k + '"]').checked = true; }
        $('due').value = ui.due;
        var note = 'Due ' + dueText(ui.due, t) + '.';
        if (ui.due < t) note += ' That day has passed, so it will show as late.';
        else if (!HW.isSchoolDay(c, ui.due)) { var hol = HW.holidayOn(c, ui.due); note += ' ' + (hol ? 'That is in ' + (hol.label || 'a holiday') : HW.DAY_SHORT[HW.weekday(ui.due)] + ' is not a school day') + ' for ' + c.name + '.'; }
        $('due-note').textContent = note;
        $('repeat-open').hidden = ui.repeatOpen; $('repeat-row').hidden = !ui.repeatOpen;
        $('repeat-text').textContent = 'Repeats every week on ' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][HW.weekday(ui.due)] + 's';
        renderSplit();
    }
    function lines() { return HW.splitPaste($('what').value, $('subject').value.trim()); }
    function renderSplit() {
        var ls = lines(), box = $('split-box'), pv = $('split-preview');
        box.hidden = ls.length < 2;
        if (ls.length < 2) return;
        $('split-text').textContent = 'Add each line as its own item (' + ls.length + ' items)';
        clear(pv);
        if (!$('split').checked) return;
        ls.forEach(function (l) { pv.appendChild(el('li', null, l.subject ? el('b', { text: l.subject + ': ' }) : null, l.text)); });
    }
    function addItems(e) {
        e.preventDefault();
        var c = selChild(), err = $('add-err'); err.textContent = '';
        $('what').removeAttribute('aria-invalid'); $('due').removeAttribute('aria-invalid');
        if (!c) return;
        var type = typeVal(), subject = $('subject').value.trim(), text = $('what').value.trim(), due = $('due').value;
        if (!HW.isIso(due)) { err.textContent = 'Pick the due date.'; $('due').setAttribute('aria-invalid', 'true'); $('due').focus(); return; }
        var ls = lines(), split = ls.length > 1 && $('split').checked, entries;
        if (split) entries = ls;
        else {
            if (!subject && !text) { err.textContent = 'Write what to do, or pick a subject.'; $('what').setAttribute('aria-invalid', 'true'); $('what').focus(); return; }
            if (text.length > HW.LIMITS.text) { err.textContent = 'That is too long for one item (' + text.length + ' letters, the limit is ' + HW.LIMITS.text + '). ' + (text.indexOf('\n') >= 0 ? 'Tick "Add each line as its own item" or shorten it.' : 'Please shorten it.'); $('what').setAttribute('aria-invalid', 'true'); $('what').focus(); return; }
            entries = [{ subject: subject, text: text }];
        }
        if (state.items.length + entries.length > HW.LIMITS.items) { err.textContent = 'The diary is full. Delete old items first.'; return; }
        var weekly = ui.repeatOpen && $('repeat').checked, now = Date.now(), t = today();
        var first = { type: type, subject: entries[0].subject, text: entries[0].text };
        var msg = entries.length > 1 ? 'Added ' + entries.length + ' items for ' + c.name + ', due ' + dueText(due, t) + '.'
            : 'Added ' + HW.itemTitle(first) + ' for ' + c.name + (weekly ? ', every ' + ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][HW.weekday(due)] : ', due ' + dueText(due, t)) + '.';
        commit($('add-msg'), msg, function () {
            entries.forEach(function (en, i) {
                state.items.push({ id: HW.uid(), childId: c.id, type: type, subject: en.subject, text: en.text, due: due, repeat: weekly ? 'weekly' : '', doneOn: '', doneDates: [], created: now + i });
            });
        });
        $('subject').value = ''; $('what').value = ''; $('repeat').checked = false; ui.repeatOpen = false; $('split').checked = true;
        renderAdder();
    }

    // ---------- week ----------
    function renderWeek() {
        var t = today(); if (!ui.weekStart) ui.weekStart = HW.weekStart(t);
        var start = ui.weekStart, end = HW.addDays(start, 6), ul = $('week-list'); clear(ul);
        $('week-title').textContent = HW.fmt(start) + ' to ' + HW.fmt(end, true) + (start === HW.weekStart(t) ? ' (this week)' : '');
        $('week-now').disabled = start === HW.weekStart(t);
        HW.week(state, start).forEach(function (d) {
            var li = el('li', { class: d.date === t ? 'is-today' : '' }, el('h3', null, HW.fmtLong(d.date), d.date === t ? el('span', { text: ' today' }) : null));
            if (!d.entries.length) li.appendChild(el('p', { class: 'none', text: 'Nothing written down' }));
            else {
                var inner = el('ul');
                d.entries.forEach(function (o) {
                    inner.appendChild(el('li', { class: o.done ? 'done' : '' }, el('b', { text: (state.children.length > 1 ? o.child.name + ': ' : '') }), HW.itemLine(o) + (o.done ? ' (done)' : '')));
                });
                li.appendChild(inner);
            }
            ul.appendChild(li);
        });
    }

    function render() { renderTonight(); renderKids(); renderAdder(); renderWeek(); }

    // ---------- wiring ----------
    function init() {
        load();
        if (navigator.share) $('share-tonight').hidden = false;
        $('add-child').addEventListener('click', function () { ui.childForm = 'new'; ui.edit = ''; render(); focusIn('child-form'); });
        $('add-form').addEventListener('submit', addItems);
        Array.prototype.forEach.call(document.querySelectorAll('input[name=type]'), function (r) { r.addEventListener('change', renderAdder); });
        $('subject').addEventListener('input', function () {
            Array.prototype.forEach.call($('subject-chips').children, function (b) { b.setAttribute('aria-pressed', b.textContent === $('subject').value.trim() ? 'true' : 'false'); });
            renderSplit();
        });
        $('what').addEventListener('input', function () { $('what').removeAttribute('aria-invalid'); $('add-err').textContent = ''; renderSplit(); });
        $('split').addEventListener('change', renderSplit);
        $('due').addEventListener('change', function () {
            if (HW.isIso($('due').value)) { ui.due = $('due').value; ui.dueChip = ''; $('due').removeAttribute('aria-invalid'); renderAdder(); }
        });
        $('repeat-open').addEventListener('click', function () { ui.repeatOpen = true; renderAdder(); $('repeat').checked = true; $('repeat').focus(); });
        $('copy-tonight').addEventListener('click', function () { copyText(HW.tonightText(state, today()), $('tonight-msg')); });
        $('share-tonight').addEventListener('click', function () {
            navigator.share({ title: 'Homework and tests', text: HW.tonightText(state, today()) }).catch(function () { /* closed */ });
        });
        $('email-tonight').addEventListener('click', function () { var t = today(); this.href = mailHref('Homework and tests for ' + HW.fmt(t), HW.tonightText(state, t)); });
        $('week-prev').addEventListener('click', function () { ui.weekStart = HW.addDays(ui.weekStart, -7); renderWeek(); });
        $('week-next').addEventListener('click', function () { ui.weekStart = HW.addDays(ui.weekStart, 7); renderWeek(); });
        $('week-now').addEventListener('click', function () { ui.weekStart = HW.weekStart(today()); renderWeek(); });
        $('copy-week').addEventListener('click', function () { copyText(HW.weekText(state, ui.weekStart), $('week-msg')); });
        $('backup').addEventListener('click', function () {
            var data = JSON.stringify({ app: SLUG, saved: new Date().toISOString(), v: 1, children: state.children, items: state.items }, null, 1);
            var a = el('a', { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: 'homework-diary-backup-' + today() + '.json' });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            showMsg($('set-msg'), 'Backup saved: ' + state.children.length + ' children, ' + state.items.length + ' items.');
        });
        $('restore').addEventListener('click', function () { $('restore-file').value = ''; $('restore-file').click(); });
        $('restore-file').addEventListener('change', function () {
            var file = this.files && this.files[0]; if (!file) return;
            if (file.size > 5e6) { showMsg($('set-msg'), 'That file is too big to be a backup from this app.'); return; }
            var rd = new FileReader();
            rd.onload = function () {
                var raw; try { raw = JSON.parse(rd.result); } catch (e) { raw = null; }
                if (!HW.looksLikeBackup(raw)) { showMsg($('set-msg'), 'This file is not a backup from this app. Nothing was changed.'); return; }
                var next = HW.cleanState(raw);
                ui.edit = ''; ui.childForm = '';
                commit($('set-msg'), 'Restored ' + next.children.length + ' children and ' + next.items.length + ' items.', function () { state = next; });
            };
            rd.onerror = function () { showMsg($('set-msg'), 'Could not read that file.'); };
            rd.readAsText(file);
        });
        $('wipe').addEventListener('click', function () {
            if (!state.children.length && !state.items.length) { showMsg($('set-msg'), 'The diary is already empty.'); return; }
            ui.edit = ''; ui.childForm = '';
            commit($('set-msg'), 'Deleted everything.', function () { state = { v: 1, children: [], items: [] }; });
        });
        // a new day while the page stays open (left open overnight)
        var shown = today();
        setInterval(function () { if (today() !== shown) { shown = today(); ui.weekStart = ''; render(); } }, 60000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden && today() !== shown) { shown = today(); ui.weekStart = ''; render(); } });
        render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () { /* offline copy not available */ });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
