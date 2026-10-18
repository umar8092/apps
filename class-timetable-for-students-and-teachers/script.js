// Class Timetable for Students and Teachers: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.TimetableCore;
    const KEY = 'class-timetable-for-students-and-teachers.state';
    const URL_SELF = 'https://umar8092.github.io/apps/class-timetable-for-students-and-teachers/';
    const COLOR_NAMES = ['Red', 'Orange', 'Green', 'Blue', 'Purple', 'Pink', 'Teal', 'Brown', 'Olive', 'Grey'];
    const LENGTHS = [[40, '40 min'], [45, '45 min'], [60, '1 hour'], [90, '90 min']];
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    let canSave = true, state, today = C.todayIso(), lastMin = -1;
    let editing = null;          // id of the subject in the form, or null for a new one
    let formOpen = true;
    let showLetter = '';         // which week the week grid shows
    let rowSeq = 0;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('tools-msg', 'The saved timetable could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeForm(true); commit(); }
    function commit() { save(); render(); }
    const newId = p => p + (state.seq++) + '-' + Date.now().toString(36);

    // ---------- messages with Undo ----------
    const MSGS = ['list-msg', 'form-msg', 'hol-msg', 'tools-msg', 'week-msg'];
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
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    function twelve() {
        if (state.clock === '12') return true;
        if (state.clock === '24') return false;
        try { const o = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions(); return o.hour12 === true || /h1[12]/.test(o.hourCycle || ''); } catch (e) { return false; }
    }
    const t = min => C.fmtTime(min, twelve());
    const span = (s, e) => t(s) + ' – ' + t(e);
    const subject = id => state.subjects.find(s => s.id === id);
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
        return Promise.resolve(fallbackCopy(text));
    }
    function fallbackCopy(text) {
        const a = document.createElement('textarea'); a.value = text; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0';
        document.body.appendChild(a); a.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } a.remove(); return ok;
    }
    function download(name, type, body) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    function mailto(subj, text) {
        let body = text;
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(The timetable is too long for an email link. Use "Copy the week" and paste it.)';
        return 'mailto:?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(body);
    }
    function dot(color) { const d = el('span', 'dot'); d.style.background = color; d.setAttribute('aria-hidden', 'true'); return d; }
    const where = it => [C.roomLabel(it.time.room), it.subject.teacher].filter(Boolean).join(' · ');
    const dayLabel = iso => { const r = C.relDay(iso, today); return C.shortDate(iso, today) + (r ? ' (' + r + ')' : ''); };

    // ---------- render ----------
    function render() {
        today = C.todayIso(); lastMin = C.nowMin();
        const any = state.subjects.length > 0, hasTimes = state.subjects.some(s => s.times.length);
        $('app').classList.toggle('setup', !any);
        $('today').hidden = $('tomorrow').hidden = $('week').hidden = !hasTimes;
        $('empty').hidden = any;
        renderNow(); renderToday(); renderTomorrow(); renderWeek(); renderSubjects(); renderSettings();
        $('open-form').hidden = formOpen; $('form').hidden = !formOpen;
        $('form-h').textContent = editing ? 'Edit ' + (subject(editing) || { name: 'subject' }).name : (any ? 'Add another subject' : 'Add a subject');
        document.querySelectorAll('.week-sel').forEach(s => { s.closest('.f-week').hidden = !state.ab; });
        $('ab-form-hint').hidden = !state.ab;
        if (!$('c-until').value && state.termEnd) $('c-until').value = state.termEnd;
    }

    function line(cls, text) { return el('p', cls, text); }
    function bringLine(items, label) { const b = C.bringList(items); return b.length ? line('bring', (label || 'Bring') + ': ' + b.join(', ')) : null; }
    function laterBlock(later) {
        const box = el('div', 'later');
        if (!later) { box.appendChild(line('detail', 'No lessons found in the next 4 months. Check your holidays under "Weeks and holidays".')); return box; }
        const first = later.items[0];
        box.appendChild(line('label', 'Next school day: ' + dayLabel(later.iso) + (later.letter ? ', Week ' + later.letter : '')));
        const p = line('next-line'); p.appendChild(dot(first.subject.color)); p.appendChild(document.createTextNode(first.subject.name + ' at ' + t(first.s)));
        box.appendChild(p);
        const w = where(first); if (w) box.appendChild(line('detail', w));
        const b = bringLine(later.items); if (b) box.appendChild(b);
        return box;
    }
    function renderNow() {
        const body = $('now-body'); body.textContent = '';
        const s = C.status(today, C.nowMin(), state);
        const big = (text, color) => { const p = line('big'); if (color) p.appendChild(dot(color)); p.appendChild(document.createTextNode(text)); body.appendChild(p); };
        const nextBlock = (it, mins, label) => {
            const box = el('div', 'later');
            box.appendChild(line('label', label || 'Next'));
            const p = line('next-line'); p.appendChild(dot(it.subject.color)); p.appendChild(document.createTextNode(it.subject.name + ' at ' + t(it.s) + ' (in ' + C.fmtDur(mins) + ')'));
            box.appendChild(p);
            const w = where(it); if (w) box.appendChild(line('detail', w));
            const b = bringLine([it]); if (b) box.appendChild(b);
            body.appendChild(box);
        };
        $('now').dataset.kind = s.kind;
        if (s.kind === 'empty') { body.appendChild(line('detail', 'Add your subjects with their days and times, and this shows the lesson on now and what is next.')); return; }
        if (s.kind === 'now') {
            const names = s.current.map(c => c.subject.name);
            big('Now: ' + names.join(' and ') + (names.length > 1 ? ' (clash)' : ''), s.current[0].subject.color);
            s.current.forEach(c => { const w = where(c); body.appendChild(line('detail', [w, 'until ' + t(c.e)].filter(Boolean).join(' · '))); });
            body.appendChild(line('left', C.fmtDur(s.left) + ' left'));
            if (s.next) nextBlock(s.next, s.next.s - C.nowMin());
            else { body.appendChild(line('detail last', 'This is the last lesson today.')); body.appendChild(laterBlock(s.later)); }
            return;
        }
        if (s.kind === 'before') {
            big('First lesson today: ' + s.next.subject.name + ' at ' + t(s.next.s), s.next.subject.color);
            body.appendChild(line('left', 'In ' + C.fmtDur(s.wait)));
            const w = where(s.next); if (w) body.appendChild(line('detail', w));
            const b = bringLine(s.today.items, 'Bring today'); if (b) body.appendChild(b);
            return;
        }
        if (s.kind === 'free') {
            big('Free now until ' + t(s.next.s) + ' (' + C.fmtDur(s.wait) + ')');
            nextBlock(s.next, s.wait);
            return;
        }
        if (s.kind === 'holiday') {
            big('Holiday: ' + s.holiday.name);
            body.appendChild(line('detail', 'No lessons until ' + C.shortDate(C.addDays(s.holiday.to, 1), today) + '.'));
        } else if (s.kind === 'done') big('No more lessons today.');
        else big('No lessons today (' + C.DAY_NAMES[C.weekday(today)] + ').');
        body.appendChild(laterBlock(s.later));
    }

    // one day as a list, with free gaps between lessons
    function dayList(day, live) {
        const ul = el('ul', 'lessons'), min = C.nowMin();
        const gaps = C.gaps(day.items);
        const rows = day.items.map(it => ({ it, s: it.s })).concat(gaps.map(g => ({ g, s: g.s })))
            .sort((a, b) => a.s - b.s || (a.g ? 1 : -1));
        rows.forEach(r => {
            if (r.g) {
                const li = el('li', 'free-gap', 'Free ' + span(r.g.s, r.g.e) + ' (' + C.fmtDur(r.g.e - r.g.s) + ')');
                if (live && r.g.s <= min && min < r.g.e) li.classList.add('on');
                ul.appendChild(li); return;
            }
            const it = r.it, li = el('li', 'lesson');
            li.style.setProperty('--c', it.subject.color);
            li.appendChild(el('span', 'when', span(it.s, it.e)));
            const what = el('span', 'what');
            const name = el('span', 'name', it.subject.name);
            what.appendChild(name);
            const w = where(it); if (w) what.appendChild(el('span', 'meta', w));
            li.appendChild(what);
            if (live && it.s <= min && min < it.e) { li.classList.add('on'); li.appendChild(el('span', 'badge', 'Now')); }
            else if (live && it.e <= min) li.classList.add('done');
            ul.appendChild(li);
        });
        return ul;
    }
    function renderToday() {
        const body = $('today-body'); body.textContent = '';
        const day = C.lessonsOn(today, state);
        $('today-h').textContent = 'Today, ' + C.shortDate(today, today) + (day.letter ? ' · Week ' + day.letter : '');
        if (day.holiday) { body.appendChild(line('hint top', 'Holiday: ' + day.holiday.name + ' (until ' + C.shortDate(day.holiday.to, today) + '). No lessons.')); return; }
        if (!day.items.length) { body.appendChild(line('hint top', 'No lessons today.')); return; }
        body.appendChild(dayList(day, true));
        const b = bringLine(day.items, 'Bring today'); if (b) body.appendChild(b);
    }
    function renderTomorrow() {
        const body = $('tom-body'), note = $('tom-note'); body.textContent = '';
        const tom = C.addDays(today, 1), day = C.lessonsOn(tom, state);
        let show = day;
        note.hidden = true;
        if (!day.items.length) {
            note.hidden = false;
            note.textContent = day.holiday ? 'Tomorrow is a holiday: ' + day.holiday.name + '.' : 'No lessons tomorrow (' + C.DAY_NAMES[C.weekday(tom)] + ').';
            show = C.nextSchoolDay(tom, state);
        }
        if (!show) { $('tom-h').textContent = 'Tomorrow, ' + C.shortDate(tom, today); body.appendChild(line('hint top', 'No lessons found in the next 4 months.')); return; }
        $('tom-h').textContent = (show === day ? 'Tomorrow, ' : 'Next school day, ') + C.shortDate(show.iso, today) + (show.letter ? ' · Week ' + show.letter : '');
        body.appendChild(dayList(show, false));
        const b = bringLine(show.items, show === day ? 'Bring tomorrow' : 'Bring'); if (b) body.appendChild(b);
    }
    function renderWeek() {
        const grid = $('week-grid'); grid.textContent = '';
        const cur = C.weekLetter(today, state);
        if (!state.ab) showLetter = '';
        else if (!showLetter) showLetter = cur || 'A';
        $('week-ab').hidden = !state.ab;
        $('show-a').setAttribute('aria-pressed', String(showLetter === 'A'));
        $('show-b').setAttribute('aria-pressed', String(showLetter === 'B'));
        $('show-a').textContent = 'Week A' + (cur === 'A' ? ' (this week)' : '');
        $('show-b').textContent = 'Week B' + (cur === 'B' ? ' (this week)' : '');
        $('week-h').textContent = state.ab ? 'Whole week: Week ' + showLetter : 'Whole week';
        const todayWd = C.weekday(today);
        C.weekDays(state).forEach(wd => {
            const col = el('div', 'wday');
            if (wd === todayWd && (!state.ab || showLetter === cur)) col.classList.add('is-today');
            const h = el('h3', 'wday-h', C.DAY_NAMES[wd]);
            if (col.classList.contains('is-today')) h.appendChild(el('span', 'badge', 'Today'));
            col.appendChild(h);
            const items = C.weekdayItems(wd, showLetter, state);
            if (!items.length) col.appendChild(el('p', 'hint', 'No lessons'));
            const ul = el('ul', 'wlist');
            items.forEach(it => {
                const li = el('li', 'wl'); li.style.setProperty('--c', it.subject.color);
                li.appendChild(el('span', 'when', span(it.s, it.e)));
                li.appendChild(el('span', 'name', it.subject.name));
                const r = C.roomLabel(it.time.room); if (r) li.appendChild(el('span', 'meta', r));
                ul.appendChild(li);
            });
            if (items.length) col.appendChild(ul);
            grid.appendChild(col);
        });
        $('mail-week').href = mailto('My class timetable', C.weekText(state, twelve()) + '\n\n' + URL_SELF);
    }
    function timesSorted(s) {
        const order = d => (d - state.weekStart + 7) % 7;
        return s.times.slice().sort((a, b) => order(a.day) - order(b.day) || a.s - b.s);
    }
    function renderSubjects() {
        const ul = $('subj-list'); ul.textContent = '';
        const list = state.subjects.slice().sort((a, b) => a.name.localeCompare(b.name));
        $('subj-h').textContent = list.length ? 'Your subjects (' + list.length + ')' : 'Your subjects';
        list.forEach(s => {
            const li = el('li', 'box'); li.dataset.id = s.id; li.style.setProperty('--c', s.color);
            const head = el('div', 'box-head');
            const h = el('h3', 'box-h'); h.appendChild(dot(s.color)); h.appendChild(document.createTextNode(s.name)); head.appendChild(h);
            const ed = el('button', 'secondary small', 'Edit'); ed.type = 'button'; ed.setAttribute('aria-label', 'Edit ' + s.name);
            ed.addEventListener('click', () => openEdit(s.id)); head.appendChild(ed);
            li.appendChild(head);
            if (s.teacher) li.appendChild(el('p', 'box-sub', s.teacher));
            const tl = el('ul', 'times');
            const ts = timesSorted(s);
            if (!ts.length) tl.appendChild(el('li', 'hint', 'No days and times yet. Tap Edit to add them.'));
            ts.forEach(x => tl.appendChild(el('li', null, [C.DAYS[x.day] + ' ' + span(x.s, x.e), C.roomLabel(x.room), state.ab && x.week !== 'every' ? 'Week ' + x.week + ' only' : ''].filter(Boolean).join(' · '))));
            li.appendChild(tl);
            li.appendChild(el('p', 'box-sub', ts.length === 1 ? '1 lesson a week' : ts.length + ' lessons a week'));
            if (s.bring) li.appendChild(el('p', 'bring', 'Bring: ' + s.bring));
            if (s.note) li.appendChild(el('p', 'note', s.note));
            C.clashesFor(s.id, state).forEach(c => li.appendChild(el('p', 'clash', 'Clash: ' + C.DAYS[c.mine.time.day] + ' ' + span(c.mine.time.s, c.mine.time.e) + ' overlaps '
                + (c.other.subject.id === s.id ? 'another ' + s.name + ' lesson' : c.other.subject.name) + ' ' + span(c.other.time.s, c.other.time.e))));
            ul.appendChild(li);
        });
    }
    function renderSettings() {
        $('s-ab').checked = state.ab;
        $('ab-now').hidden = !state.ab;
        const cur = C.weekLetter(today, state);
        $('ab-a').checked = cur === 'A'; $('ab-b').checked = cur === 'B';
        $('ab-legend').textContent = 'This week (from ' + C.shortDate(C.weekOf(today, state.weekStart), today) + ') is';
        $('s-start').value = String(state.weekStart);
        $('s-clock').value = state.clock;
        const ul = $('hol-list'); ul.textContent = '';
        state.holidays.slice().sort((a, b) => a.from < b.from ? -1 : 1).forEach(h => {
            const li = el('li', 'box hol');
            const txt = el('div', 'hol-txt');
            txt.appendChild(el('span', 'name', h.name));
            const n = C.diff(h.from, h.to) + 1;
            txt.appendChild(el('span', 'meta', (h.from === h.to ? C.shortDate(h.from, today) : C.shortDate(h.from, today) + ' to ' + C.shortDate(h.to, today)) + ' (' + n + (n === 1 ? ' day' : ' days') + ')'
                + (h.to < today ? ', over' : h.from <= today ? ', now' : '')));
            li.appendChild(txt);
            const d = el('button', 'secondary small', 'Delete'); d.type = 'button'; d.setAttribute('aria-label', 'Delete ' + h.name);
            d.addEventListener('click', () => { const snap = snapshot(); state.holidays = state.holidays.filter(x => x.id !== h.id); commit(); show('hol-msg', h.name + ' deleted.', snap); });
            li.appendChild(d);
            ul.appendChild(li);
        });
    }

    // ---------- the form ----------
    function buildSwatches() {
        const box = $('swatches');
        C.COLORS.forEach((c, i) => {
            const lab = el('label', 'sw'); lab.style.setProperty('--c', c); lab.title = COLOR_NAMES[i];
            const r = el('input'); r.type = 'radio'; r.name = 'color'; r.value = c; r.setAttribute('aria-label', COLOR_NAMES[i]);
            lab.appendChild(r); box.appendChild(lab);
        });
    }
    const setColor = c => { document.querySelectorAll('input[name=color]').forEach(r => { r.checked = r.value === c; }); };
    const getColor = () => { const r = document.querySelector('input[name=color]:checked'); return r ? r.value : C.COLORS[0]; };

    function dayOptions(sel) {
        for (let i = 0; i < 7; i++) { const d = (state.weekStart + i) % 7; const o = el('option', null, C.DAY_NAMES[d]); o.value = String(d); sel.appendChild(o); }
    }
    function addRow(data) {
        const n = ++rowSeq, li = el('li', 'row');
        const id = k => 'r' + n + '-' + k;
        const field = (cls, labelText, input) => { const d = el('div', 'f ' + cls); const l = el('label', null, labelText); l.htmlFor = input.id; d.appendChild(l); d.appendChild(input); return d; };
        const day = el('select'); day.id = id('day'); day.className = 'day-sel'; dayOptions(day);
        const start = el('input'); start.type = 'time'; start.id = id('s'); start.className = 'start';
        const end = el('input'); end.type = 'time'; end.id = id('e'); end.className = 'end';
        const room = el('input'); room.type = 'text'; room.id = id('room'); room.className = 'room'; room.maxLength = 40; room.autocomplete = 'off'; room.placeholder = 'e.g. 12';
        const week = el('select'); week.id = id('w'); week.className = 'week-sel';
        [['every', 'Every week'], ['A', 'Week A only'], ['B', 'Week B only']].forEach(([v, txt]) => { const o = el('option', null, txt); o.value = v; week.appendChild(o); });
        const err = el('p', 'err'); err.id = id('err'); err.setAttribute('role', 'alert');
        [start, end, day, room].forEach(x => x.setAttribute('aria-describedby', err.id));
        const grid = el('div', 'row-grid');
        grid.appendChild(field('f-day', 'Day', day));
        grid.appendChild(field('f-room', 'Room (optional)', room));
        grid.appendChild(field('f-start', 'Starts', start));
        grid.appendChild(field('f-end', 'Ends', end));
        li.appendChild(grid);
        const quick = el('div', 'quick'); quick.appendChild(el('span', 'quick-l', 'Length:'));
        LENGTHS.forEach(([m, txt]) => {
            const b = el('button', 'chip', txt); b.type = 'button'; b.setAttribute('aria-label', 'Ends ' + txt + ' after it starts');
            b.addEventListener('click', () => {
                const s = C.parseTime(start.value);
                if (s === null) { err.textContent = 'Type when it starts first.'; start.focus(); return; }
                if (s + m >= 1440) { err.textContent = 'That would end after midnight.'; return; }
                end.value = C.hm(s + m); err.textContent = ''; end.removeAttribute('aria-invalid');
            });
            quick.appendChild(b);
        });
        li.appendChild(quick);
        const wf = field('f-week', 'Which weeks', week); wf.hidden = !state.ab; li.appendChild(wf);
        li.appendChild(err);
        const rm = el('button', 'link rm', 'Remove this day and time'); rm.type = 'button';
        rm.addEventListener('click', () => { li.remove(); updateRows(); const f = $('rows').querySelector('select'); if (f) f.focus(); });
        li.appendChild(rm);
        li.dataset.tid = data && data.id || '';
        if (data) {
            day.value = String(data.day); start.value = data.start || ''; end.value = data.end || ''; room.value = data.room || ''; week.value = data.week || 'every';
        } else day.value = String(state.weekStart);
        $('rows').appendChild(li);
        updateRows();
        return li;
    }
    function updateRows() {
        const rows = [...$('rows').children];
        rows.forEach((r, i) => { r.querySelector('.rm').hidden = rows.length < 2; r.setAttribute('aria-label', 'Day and time ' + (i + 1)); });
        $('e-rows').textContent = '';
    }
    function readRows() {
        return [...$('rows').children].map(r => ({ id: r.dataset.tid, day: r.querySelector('.day-sel').value, start: r.querySelector('.start').value, end: r.querySelector('.end').value,
            room: r.querySelector('.room').value, week: r.querySelector('.week-sel').value }));
    }
    function nextRowData() {
        const rows = readRows(), last = rows[rows.length - 1];
        if (!last) return null;
        // the next school day, same times and room: most subjects repeat at the same time on another day
        const school = state.weekStart === 1 ? [1, 2, 3, 4, 5] : state.weekStart === 0 ? [0, 1, 2, 3, 4] : [6, 0, 1, 2, 3, 4];
        const d = Number(last.day), idx = school.indexOf(d);
        const day = idx >= 0 ? school[(idx + 1) % school.length] : (d + 1) % 7;
        return { day, start: last.start, end: last.end, room: last.room, week: last.week };
    }
    function resetForm() {
        editing = null;
        $('form').reset();
        $('rows').textContent = '';
        addRow(null);
        setColor(C.nextColor(state));
        $('w-more').hidden = true; $('o-more').hidden = false;
        $('save').textContent = 'Add this subject';
        $('cancel').textContent = state.subjects.length ? 'Done' : 'Clear';
        $('edit-tools').hidden = true;
        clearErrors();
    }
    function clearErrors() {
        $('e-name').textContent = ''; $('h-dup').textContent = ''; $('e-rows').textContent = '';
        $('f-name').removeAttribute('aria-invalid');
        document.querySelectorAll('#rows .err').forEach(e => { e.textContent = ''; });
        document.querySelectorAll('#rows [aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    }
    function openEdit(id) {
        const s = subject(id); if (!s) return;
        formOpen = true; editing = id;
        $('form').reset(); clearErrors();
        $('f-name').value = s.name; setColor(s.color);
        $('rows').textContent = '';
        timesSorted(s).forEach(x => addRow({ id: x.id, day: x.day, start: C.hm(x.s), end: x.e >= 1440 ? '23:59' : C.hm(x.e), room: x.room, week: x.week }));
        if (!s.times.length) addRow(null);
        $('f-teacher').value = s.teacher; $('f-bring').value = s.bring; $('f-note').value = s.note;
        const more = !!(s.teacher || s.bring || s.note);
        $('w-more').hidden = !more; $('o-more').hidden = more;
        $('save').textContent = 'Save changes'; $('cancel').textContent = 'Cancel';
        $('edit-tools').hidden = false;
        render();
        $('add').scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('f-name').focus({ preventScroll: true });
    }
    function closeForm(keepOpen) {
        resetForm();
        formOpen = keepOpen === true ? formOpen : state.subjects.length === 0;
    }
    function onSave(ev) {
        ev.preventDefault();
        clearErrors();
        const res = C.readForm({ name: $('f-name').value, color: getColor(), rows: readRows(), teacher: $('f-teacher').value, bring: $('f-bring').value, note: $('f-note').value }, state, editing);
        let firstBad = null;
        if (res.errors.name) { $('e-name').textContent = res.errors.name; $('f-name').setAttribute('aria-invalid', 'true'); firstBad = $('f-name'); }
        if (res.noTimes) { $('e-rows').textContent = res.noTimes; firstBad = firstBad || $('add-row'); }
        [...$('rows').children].forEach((r, i) => {
            const m = res.errors.rows[i]; if (!m) return;
            r.querySelector('.err').textContent = m;
            const target = /starts|start time/.test(m) && !/ends/.test(m) ? r.querySelector('.start') : /end/.test(m) ? r.querySelector('.end') : /day/.test(m) ? r.querySelector('.day-sel') : r.querySelector('.start');
            target.setAttribute('aria-invalid', 'true');
            firstBad = firstBad || target;
        });
        if (!res.ok) { if (firstBad) firstBad.focus(); return; }
        if (!editing && state.subjects.length >= C.MAX_SUBJECTS) { $('e-name').textContent = 'You have ' + C.MAX_SUBJECTS + ' subjects, the most this app keeps. Delete one first.'; return; }
        if (res.subject.times.length > C.MAX_TIMES) { $('e-rows').textContent = 'Up to ' + C.MAX_TIMES + ' days and times per subject.'; return; }
        const snap = snapshot();
        res.subject.times.forEach(x => { if (!x.id) x.id = newId('t'); });
        let msg;
        if (editing) {
            state.subjects = state.subjects.map(s => s.id === editing ? Object.assign({ id: s.id }, res.subject) : s);
            msg = res.subject.name + ' saved.';
            const id = editing;
            resetForm(); formOpen = false; commit();
            show('list-msg', msg, snap);
            const box = document.querySelector('li.box[data-id="' + id + '"]');
            if (box) { box.scrollIntoView({ block: 'center', behavior: 'smooth' }); box.classList.add('flash'); setTimeout(() => box.classList.remove('flash'), 1600); }
            return;
        }
        const s = Object.assign({ id: newId('s') }, res.subject);
        state.subjects.push(s);
        const n = s.times.length;
        msg = s.name + ' added: ' + (n === 1 ? '1 lesson' : n + ' lessons') + ' a week.' + (C.clashesFor(s.id, state).length ? ' It clashes with another lesson: see its box.' : '');
        resetForm(); commit();
        show('form-msg', msg, snap);
        $('f-name').focus();
    }

    // ---------- holidays ----------
    function addHoliday() {
        const name = $('h-name').value.trim().replace(/\s+/g, ' ') || 'Holiday';
        const from = $('h-from').value, to = $('h-to').value || from;
        const e = $('e-hol'); e.textContent = '';
        if (!C.isDate(from)) { e.textContent = 'Choose the first day off.'; $('h-from').focus(); return; }
        if (!C.isDate(to)) { e.textContent = 'Choose the last day off.'; $('h-to').focus(); return; }
        if (to < from) { e.textContent = 'The last day is before the first day.'; $('h-to').focus(); return; }
        if (C.diff(from, to) > 366) { e.textContent = 'Keep it to one year or less.'; $('h-to').focus(); return; }
        if (state.holidays.length >= C.MAX_HOLIDAYS) { e.textContent = 'You have ' + C.MAX_HOLIDAYS + ' holidays. Delete an old one first.'; return; }
        const snap = snapshot();
        state.holidays.push({ id: newId('h'), name: name.slice(0, 60), from, to });
        $('h-name').value = ''; $('h-from').value = ''; $('h-to').value = '';
        $('w-hol').hidden = true; $('o-hol').hidden = false;
        commit();
        show('hol-msg', name + ' added: ' + (from === to ? C.shortDate(from, today) : C.shortDate(from, today) + ' to ' + C.shortDate(to, today)) + '.', snap);
    }

    // ---------- wire up ----------
    function init() {
        state = load();
        buildSwatches();
        resetForm();
        formOpen = state.subjects.length === 0;
        save();

        $('form').addEventListener('submit', onSave);
        $('add-row').addEventListener('click', () => {
            if ($('rows').children.length >= C.MAX_TIMES) { $('e-rows').textContent = 'Up to ' + C.MAX_TIMES + ' days and times per subject.'; return; }
            const li = addRow(nextRowData()); li.querySelector('select').focus();
        });
        $('cancel').addEventListener('click', () => { const was = editing; closeForm(); render(); if (was) { const b = document.querySelector('li.box[data-id="' + was + '"] button'); if (b) b.focus(); } });
        $('open-form').addEventListener('click', () => { formOpen = true; resetForm(); render(); $('f-name').focus(); });
        $('o-more').addEventListener('click', () => { $('w-more').hidden = false; $('o-more').hidden = true; $('f-teacher').focus(); });
        $('f-name').addEventListener('input', () => {
            const v = $('f-name').value.trim().toLowerCase();
            const dup = v && state.subjects.find(s => s.id !== editing && s.name.toLowerCase() === v);
            $('h-dup').textContent = dup ? 'You already have ' + dup.name + '. To add more lessons to it, tap Edit on its box instead.' : '';
        });
        $('del').addEventListener('click', () => {
            const s = subject(editing); if (!s) return;
            const snap = snapshot();
            state.subjects = state.subjects.filter(x => x.id !== s.id);
            closeForm(); commit();
            show(state.subjects.length ? 'list-msg' : 'form-msg', s.name + ' deleted.', snap);
        });

        $('s-ab').addEventListener('change', () => {
            const snap = snapshot();
            if ($('s-ab').checked) {
                state.ab = true; C.setWeekLetter(state, today, 'A'); showLetter = '';
                commit(); show('hol-msg', 'This week is now Week A. Change it under "This week is" if it is Week B.');
            } else {
                const had = state.subjects.some(s => s.times.some(x => x.week !== 'every'));
                state.ab = false; commit();
                show('hol-msg', had ? 'Week A and Week B lessons now show every week.' : 'Every week is now the same.', snap);
            }
        });
        ['ab-a', 'ab-b'].forEach(id => $(id).addEventListener('change', e => { C.setWeekLetter(state, today, e.target.value); showLetter = ''; commit(); }));
        $('s-start').addEventListener('change', () => {
            const letter = C.weekLetter(today, state);
            state.weekStart = Number($('s-start').value);
            if (state.ab) C.setWeekLetter(state, today, letter || 'A');
            // the day lists in the form follow the new order
            [...$('rows').querySelectorAll('.day-sel')].forEach(sel => { const v = sel.value; sel.textContent = ''; dayOptions(sel); sel.value = v; });
            commit();
        });
        $('s-clock').addEventListener('change', () => { state.clock = $('s-clock').value; commit(); });

        $('o-hol').addEventListener('click', () => { $('w-hol').hidden = false; $('o-hol').hidden = true; $('h-name').focus(); });
        $('h-cancel').addEventListener('click', () => { $('w-hol').hidden = true; $('o-hol').hidden = false; $('e-hol').textContent = ''; $('h-name').value = ''; $('h-from').value = ''; $('h-to').value = ''; });
        $('h-add').addEventListener('click', addHoliday);
        $('h-from').addEventListener('change', () => { if (!$('h-to').value || $('h-to').value < $('h-from').value) $('h-to').value = $('h-from').value; });

        $('show-a').addEventListener('click', () => { showLetter = 'A'; renderWeek(); });
        $('show-b').addEventListener('click', () => { showLetter = 'B'; renderWeek(); });
        $('copy-week').addEventListener('click', () => copyText(C.weekText(state, twelve())).then(ok => show('week-msg', ok ? 'Copied the whole week. Paste it into a message.' : 'Could not copy. Try "Email the week" instead.')));
        $('print-week').addEventListener('click', () => { document.body.classList.add('print-week'); window.print(); setTimeout(() => document.body.classList.remove('print-week'), 500); });
        window.addEventListener('afterprint', () => document.body.classList.remove('print-week'));

        $('cal').addEventListener('click', () => {
            const until = $('c-until').value, e = $('e-cal'); e.textContent = '';
            if (!state.subjects.some(s => s.times.length)) { e.textContent = 'Add your subjects and times first.'; return; }
            if (!C.isDate(until)) { e.textContent = 'Choose the last day of term.'; $('c-until').focus(); return; }
            if (until < today) { e.textContent = 'That day has passed. Choose the last day of this term.'; $('c-until').focus(); return; }
            if (C.diff(today, until) > 400) { e.textContent = 'Choose a day within about a year.'; $('c-until').focus(); return; }
            const r = C.ics(state, today, until, URL_SELF);
            if (!r.count) { e.textContent = 'No lessons between today and that day.'; return; }
            state.termEnd = until; save();
            download('class-timetable.ics', 'text/calendar', r.text);
            show('tools-msg', 'Saved a calendar file with ' + (r.count === 1 ? '1 repeating lesson' : r.count + ' repeating lessons') + ' until ' + C.shortDate(until, today) + '. Open it to add them to your calendar.');
        });
        $('backup').addEventListener('click', () => {
            download('class-timetable-backup-' + today + '.json', 'application/json', JSON.stringify(Object.assign({ app: 'class-timetable-for-students-and-teachers', saved: today }, state), null, 1));
            show('tools-msg', 'Saved a backup file. Keep it somewhere safe, such as your email or cloud drive.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', () => {
            const f = $('restore-file').files[0]; $('restore-file').value = '';
            if (!f) return;
            if (f.size > 2e6) { show('tools-msg', 'That file is too big to be a timetable backup.'); return; }
            const rd = new FileReader();
            rd.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(rd.result)); } catch (err) { s = null; }
                if (!s) { show('tools-msg', 'That file is not a Class Timetable backup. Nothing was changed.'); return; }
                const snap = snapshot(); state = s; showLetter = ''; closeForm(); commit();
                show('tools-msg', 'Restored ' + s.subjects.length + (s.subjects.length === 1 ? ' subject' : ' subjects') + ' from the backup.', snap);
            };
            rd.onerror = () => show('tools-msg', 'Could not read that file. Nothing was changed.');
            rd.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.subjects.length && !state.holidays.length) { show('tools-msg', 'There is nothing to delete.'); return; }
            const snap = snapshot(); const keep = { weekStart: state.weekStart, clock: state.clock };
            state = Object.assign(C.emptyState(), keep); showLetter = ''; closeForm(); commit();
            show('tools-msg', 'Everything was deleted.', snap);
        });

        // keep "Right now" fresh: every 15 seconds, and when the page comes back into view
        setInterval(() => { if (C.todayIso() !== today) render(); else if (C.nowMin() !== lastMin) { lastMin = C.nowMin(); renderNow(); renderToday(); } }, 15000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
        window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); render(); } });
        render();
        if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
