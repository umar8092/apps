// Study Planner and Exam Countdown: the page. All maths and words for the plan are in core.js.
// Names and topics typed by the user are always added with textContent, never as HTML.
(function () {
    'use strict';
    const C = window.SPC, SLUG = 'study-planner-and-exam-countdown', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const WEEK = [1, 2, 3, 4, 5, 6, 0];
    const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const PAGE = 14;

    let state = C.blank(), canSave = true, today = C.todayOf(), shownDays = PAGE;
    let panel = null;            // the open panel in an exam box: { id, kind: 'topics' | 'edit', values }
    const openLists = new Set(); // exams whose long topic list is shown in full

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { state = C.normalize(JSON.parse(raw)) || C.blank(); } catch (e) { state = C.blank(); }
        }
        if (!canSave) $('storage-warn').hidden = false;
    }
    function save() {
        if (!canSave) return;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canSave = false; $('storage-warn').hidden = false; }
    }
    const nextId = p => (p || 't') + (++state.seq);
    const snap = () => JSON.stringify(state);
    const restore = s => { state = C.normalize(JSON.parse(s)) || C.blank(); save(); render(); };

    // ---------- small helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const timers = {};
    function msg(box, text, undo) {
        box = typeof box === 'string' ? $(box) : box;
        box.textContent = ''; box.className = 'msg show';
        box.appendChild(document.createTextNode(text + ' '));
        if (undo) box.appendChild(btn('Undo', 'link inline undo', () => { undo(); msg(box, 'Undone.'); }));
        clearTimeout(timers[box.id]);
        timers[box.id] = setTimeout(() => { box.textContent = ''; box.className = 'msg'; }, undo ? 12000 : 6000);
    }
    function setErr(input, errId, text) {
        $(errId).textContent = text || '';
        if (input) { if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
        return !text;
    }
    const examById = id => state.exams.find(e => e.id === id);
    function revOptions(sel, value) {
        sel.textContent = '';
        for (let i = 0; i <= C.MAX_REV; i++) {
            const o = el('option', null, i === 0 ? 'None' : C.plural(i, 'day')); o.value = String(i); sel.appendChild(o);
        }
        sel.value = String(value);
    }
    function checkExam(name, date, selfId) {
        const n = C.clean(name, C.MAX_NAME);
        if (!n) return { field: 'name', error: 'Type the subject, such as Maths.' };
        if (!date) return { field: 'date', error: 'Pick the date of the exam.' };
        if (!C.valid(date)) return { field: 'date', error: 'That date does not look right. Pick it again.' };
        if (date < today) return { field: 'date', error: 'That date has passed. Pick the day of the exam.' };
        if (C.diff(today, date) > 1100) return { field: 'date', error: 'Pick a date in the next 3 years.' };
        if (state.exams.some(e => e.id !== selfId && e.date === date && e.name.toLowerCase() === n.toLowerCase())) return { field: 'name', error: n + ' on that date is already in your list.' };
        return { name: n };
    }

    // ---------- render ----------
    function render() {
        today = C.todayOf();
        const p = C.plan(state, today);
        const has = state.exams.length > 0;
        $('plan').hidden = !has;
        renderToday(p); renderPlan(p); renderExams(p); renderStudyDays();
        const formOpen = !$('add-form').hidden;
        $('add-open').hidden = formOpen;
        if (!has && !formOpen) openAdd(false);
    }

    function itemRow(it, tag) {
        const li = el(tag || 'li', 'item it-' + it.type);
        if (it.type === 'topic') {
            const lab = el('label', 'check');
            const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!it.topic.done;
            cb.addEventListener('change', () => tick(it.exam.id, it.topic.id, cb.checked));
            const span = el('span', 'it-text');
            span.appendChild(el('span', 'it-name', it.topic.name));
            span.appendChild(el('span', 'tag', it.exam.name));
            lab.append(cb, span); li.appendChild(lab);
            if (it.topic.done) li.classList.add('done');
        } else if (it.type === 'revise') {
            const n = it.exam.topics.length;
            li.appendChild(el('span', 'it-icon', '↺'));
            li.appendChild(el('span', 'it-text', 'Revise ' + it.exam.name + (n ? ': go over all ' + C.plural(n, 'topic') : '')));
        } else {
            const t = C.fmtTime(it.exam.time);
            li.appendChild(el('span', 'it-icon', '★'));
            li.appendChild(el('span', 'it-text', 'EXAM: ' + it.exam.name + (t ? ' at ' + t : '') + (it.exam.place ? ', ' + it.exam.place : '') + (it.exam.date === today ? '. Good luck!' : '')));
        }
        return li;
    }

    function renderToday(p) {
        $('today-date').textContent = C.fmtDay(today, undefined, true);
        const cd = $('countdown'); cd.textContent = '';
        const up = state.exams.slice().sort(C.byDate).filter(e => e.date >= today);
        up.forEach(e => {
            const n = C.diff(today, e.date), li = el('li', 'cd' + (n <= 3 ? ' soon' : ''));
            li.appendChild(el('span', 'cd-name', e.name));
            li.appendChild(el('span', 'cd-num', n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : String(n)));
            if (n > 1) li.appendChild(el('span', 'cd-sub', 'days left'));
            li.appendChild(el('span', 'cd-sub cd-date', C.fmtDay(e.date)));
            cd.appendChild(li);
        });
        if (!up.length) cd.appendChild(el('li', 'cd none', state.exams.length ? 'No exams coming up. Add your next exam with "+ Add an exam".' : 'No exams yet. Add your first exam and its topics. Your countdown and what to study each day then show here.'));
        const day = p.days[0], list = $('today-items'); list.textContent = '';
        const items = day ? day.items : [];
        items.forEach(it => list.appendChild(itemRow(it)));
        const topics = items.filter(i => i.type === 'topic'), done = topics.filter(i => i.topic.done).length;
        let empty = '';
        if (!up.length) empty = '';
        else if (!state.exams.some(e => e.date >= today && e.topics.length)) empty = 'Add the topics of each exam (tap "Add or edit topics") to get a plan for every day.';
        else if (day && !day.study && !topics.length) empty = 'Day off today. Nothing to study.';
        else if (!topics.length && !items.length) empty = p.left ? 'Nothing planned today. You are ahead of your plan.' : 'Every topic is done. Use the time to revise.';
        else if (!topics.length) empty = p.left ? 'No new topics today.' : 'Every topic is done. Use the time to revise.';
        $('today-empty').textContent = empty; $('today-empty').hidden = !empty;
        $('today-sub').hidden = !up.length;
        $('today-progress').textContent = topics.length ? (done === topics.length ? 'Done for today. Well done!' : done + ' of ' + C.plural(topics.length, 'topic') + ' done today.') : '';
        $('today-progress').classList.toggle('good', !!topics.length && done === topics.length);
    }

    function renderPlan(p) {
        const sum = $('plan-sum'), notes = $('plan-notes'), list = $('days');
        notes.textContent = ''; list.textContent = '';
        const up = state.exams.filter(e => e.date >= today);
        const totalTopics = up.reduce((n, e) => n + e.topics.length, 0);
        if (!up.length) sum.textContent = 'No exams coming up.';
        else if (!totalTopics) sum.textContent = 'Add topics to your exams and they are spread over the days before each exam.';
        else if (!p.left && !p.unplanned) sum.textContent = 'Every topic is done. The days left are for revision.';
        else if (!p.left) sum.textContent = 'No topics can be planned: see below.';
        else {
            const studyDays = p.study.length;
            sum.textContent = C.plural(p.left, 'topic') + ' left over ' + C.plural(studyDays, 'study day') + ': ' +
                (p.maxLoad <= 1 ? 'at most 1 topic a day.' : 'up to ' + p.maxLoad + ' topics a day.') + ' Every topic is planned before its exam.';
        }
        state.exams.slice().sort(C.byDate).forEach(e => {
            const I = p.info[e.id]; if (!I || I.past) return;
            if (I.noDays && I.daysLeft === 0 && I.left) notes.appendChild(el('li', 'warn', e.name + ' is today: ' + C.plural(I.left, 'topic') + ' not ticked. Good luck!'));
            else if (I.noDays && I.left) notes.appendChild(el('li', 'warn', 'No study day left before ' + e.name + ', so ' + C.plural(I.left, 'topic') + ' cannot be planned. Remove a day off or a day you don\'t study.'));
            else if (I.revShort && I.left) notes.appendChild(el('li', 'info', e.name + ': only ' + C.plural(I.studyDays, 'study day') + ' left, so ' + (I.rev ? C.plural(I.rev, 'revision day') : 'no revision day') + ' instead of ' + I.revWanted + '.'));
        });
        if (p.maxLoad >= 6) notes.appendChild(el('li', 'warn', 'Busy plan: up to ' + p.maxLoad + ' topics on one day. Free up a day you don\'t study, or start with the topics you know least.'));
        const days = p.days.slice(1);
        days.slice(0, shownDays).forEach(d => {
            const li = el('li', 'day' + (d.items.length ? '' : ' quiet') + (d.items.some(i => i.type === 'exam') ? ' has-exam' : ''));
            const head = el('div', 'day-head');
            head.appendChild(el('span', 'day-date', C.fmtDay(d.date)));
            const what = d.items.some(i => i.type === 'exam') ? 'Exam day' + (d.topics ? ' · ' + C.plural(d.topics, 'topic') : '') : !d.study && !d.items.length ? (d.off ? 'Day off' : 'Rest day') : d.items.length ? C.plural(d.topics, 'topic') : 'Nothing planned';
            head.appendChild(el('span', 'day-what', d.date === C.addDays(today, 1) ? 'Tomorrow · ' + what : what));
            li.appendChild(head);
            if (d.items.length) { const ul = el('ul', 'items'); d.items.forEach(it => ul.appendChild(itemRow(it))); li.appendChild(ul); }
            list.appendChild(li);
        });
        $('more').hidden = days.length <= shownDays;
        $('more').textContent = 'Show more days (' + (days.length - shownDays) + ' left)';
    }

    function renderExams(p) {
        const list = $('exam-list'); list.textContent = '';
        const up = state.exams.filter(e => e.date >= today).sort(C.byDate), past = state.exams.filter(e => e.date < today).sort(C.byDate).reverse();
        up.concat(past).forEach(e => list.appendChild(examBox(e, p.info[e.id])));
    }

    function examBox(e, I) {
        const li = el('li', 'exam' + (I.past ? ' past' : '')); li.dataset.id = e.id;
        const top = el('div', 'ex-top');
        top.appendChild(el('h3', 'ex-name', e.name));
        top.appendChild(el('span', 'badge' + (I.daysLeft <= 3 && !I.past ? ' soon' : ''), I.past ? 'Finished' : C.untilWords(today, e.date)));
        li.appendChild(top);
        const t = C.fmtTime(e.time);
        li.appendChild(el('p', 'ex-when', [C.fmtDate(e.date), t, e.place].filter(Boolean).join(' · ')));
        if (I.past) {
            li.appendChild(el('p', 'ex-note', I.total ? I.done + ' of ' + C.plural(I.total, 'topic') + ' were ticked.' : 'This exam has passed.'));
            const b = el('div', 'ex-btns'); b.appendChild(btn('Delete', 'secondary small', () => delExam(e.id), 'Delete ' + e.name)); li.appendChild(b);
            return li;
        }
        // progress
        if (I.total) {
            const pr = el('div', 'progress');
            pr.appendChild(el('span', 'pr-text', I.done + ' of ' + C.plural(I.total, 'topic') + ' done'));
            const track = el('span', 'pr-track'); const fill = el('span', 'pr-fill'); fill.style.width = Math.round(100 * I.done / I.total) + '%';
            track.appendChild(fill); pr.appendChild(track); li.appendChild(pr);
        }
        let note = '';
        if (!I.total) note = 'No topics yet. Tap "Add or edit topics" to plan your study for ' + e.name + '.';
        else if (I.daysLeft === 0) note = 'The exam is today. Good luck!';
        else if (I.noDays && I.left) note = 'No study day left before this exam, so ' + C.plural(I.left, 'topic') + ' cannot be planned.';
        else if (!I.left) note = 'All topics done.' + (I.rev ? ' Revision: ' + I.revDays.map(d => C.fmtDay(d)).join(', ') + '.' : '');
        else if (I.finish) note = 'New topics done by ' + C.fmtDay(I.finish) + (I.rev ? ', then ' + C.plural(I.rev, 'revision day') + ' (' + I.revDays.map(d => C.fmtDay(d)).join(', ') + ').' : '. No revision day.');
        if (I.revShort && I.left && !I.noDays) note += ' Only ' + C.plural(I.studyDays, 'study day') + ' left, so ' + (I.rev ? C.plural(I.rev, 'revision day') : 'no revision day') + ' instead of ' + I.revWanted + '.';
        if (note) li.appendChild(el('p', 'ex-note' + (I.noDays && I.left ? ' warn' : ''), note));
        // topics, each one tickable
        if (e.topics.length) {
            const ul = el('ul', 'topics');
            const all = openLists.has(e.id) || e.topics.length <= 10;
            (all ? e.topics : e.topics.slice(0, 8)).forEach(tp => {
                const tli = el('li', 'topic' + (tp.done ? ' done' : ''));
                const lab = el('label', 'check');
                const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!tp.done;
                cb.addEventListener('change', () => tick(e.id, tp.id, cb.checked));
                lab.append(cb, el('span', 'it-name', tp.name)); tli.appendChild(lab); ul.appendChild(tli);
            });
            li.appendChild(ul);
            if (e.topics.length > 10) li.appendChild(btn(all ? 'Show fewer topics' : 'Show all ' + e.topics.length + ' topics', 'link', () => { if (all) openLists.delete(e.id); else openLists.add(e.id); render(); }));
        }
        const b = el('div', 'ex-btns');
        b.appendChild(btn('Add or edit topics', 'secondary small', () => openPanel(e.id, 'topics'), 'Add or edit topics of ' + e.name));
        b.appendChild(btn('Edit exam', 'secondary small', () => openPanel(e.id, 'edit'), 'Edit exam ' + e.name));
        b.appendChild(btn('Delete', 'secondary small', () => delExam(e.id), 'Delete ' + e.name));
        li.appendChild(b);
        if (panel && panel.id === e.id) li.appendChild(panel.kind === 'topics' ? topicsPanel(e) : editPanel(e));
        return li;
    }

    function topicsPanel(e) {
        const box = el('div', 'panel'), v = panel.values;
        box.appendChild(el('h4', null, 'Topics for ' + e.name));
        const lab = el('label', null, 'One topic per line'); lab.htmlFor = 'tp-text'; box.appendChild(lab);
        const ta = el('textarea'); ta.id = 'tp-text'; ta.rows = Math.min(14, Math.max(5, e.topics.length + 2));
        ta.placeholder = 'e.g.\nAlgebra\nGeometry\nStatistics';
        ta.value = v.text != null ? v.text : e.topics.map(t => t.name).join('\n');
        ta.addEventListener('input', () => { v.text = ta.value; });
        ta.setAttribute('aria-describedby', 'tp-hint tp-err');
        box.appendChild(ta);
        box.appendChild(el('p', 'hint', 'Add new lines, rename, reorder or delete lines. Topics you did not rename keep their tick. The plan studies them in this order.')).id = 'tp-hint';
        const err = el('p', 'err'); err.id = 'tp-err'; err.setAttribute('role', 'alert'); box.appendChild(err);
        const row = el('div', 'row-btns');
        row.appendChild(btn('Save topics', 'primary small', () => saveTopics(e.id, ta, err)));
        row.appendChild(btn('Cancel', 'secondary small', () => { panel = null; render(); }));
        box.appendChild(row);
        return box;
    }
    function editPanel(e) {
        const box = el('div', 'panel'), v = panel.values;
        box.appendChild(el('h4', null, 'Edit exam'));
        const field = (id, label, input) => { const l = el('label', null, label); l.htmlFor = id; input.id = id; box.append(l, input); return input; };
        const name = field('ed-name', 'Subject or exam', el('input')); name.type = 'text'; name.maxLength = C.MAX_NAME; name.autocomplete = 'off'; name.value = v.name != null ? v.name : e.name;
        name.setAttribute('aria-describedby', 'ed-name-err');
        const nErr = el('p', 'err'); nErr.id = 'ed-name-err'; nErr.setAttribute('role', 'alert'); box.appendChild(nErr);
        const date = field('ed-date', 'Exam date', el('input')); date.type = 'date'; date.value = v.date != null ? v.date : e.date; date.setAttribute('aria-describedby', 'ed-date-err');
        const dErr = el('p', 'err'); dErr.id = 'ed-date-err'; dErr.setAttribute('role', 'alert'); box.appendChild(dErr);
        const two = el('div', 'two'); box.appendChild(two);
        const f1 = el('div', 'field'), f2 = el('div', 'field'); two.append(f1, f2);
        const l1 = el('label', null, 'Time (optional)'); l1.htmlFor = 'ed-time'; const time = el('input'); time.id = 'ed-time'; time.type = 'time'; time.value = v.time != null ? v.time : e.time; f1.append(l1, time);
        const l2 = el('label', null, 'Place (optional)'); l2.htmlFor = 'ed-place'; const place = el('input'); place.id = 'ed-place'; place.type = 'text'; place.maxLength = C.MAX_PLACE; place.autocomplete = 'off'; place.placeholder = 'e.g. Hall 3'; place.value = v.place != null ? v.place : e.place; f2.append(l2, place);
        const rev = field('ed-rev', 'Revision days before the exam', el('select')); revOptions(rev, v.rev != null ? v.rev : e.rev);
        [['name', name], ['date', date], ['time', time], ['place', place], ['rev', rev]].forEach(([k, i]) => i.addEventListener('input', () => { v[k] = i.value; }));
        const row = el('div', 'row-btns');
        row.appendChild(btn('Save changes', 'primary small', () => {
            const r = checkExam(name.value, date.value, e.id);
            setErr(name, 'ed-name-err', r.field === 'name' ? r.error : ''); setErr(date, 'ed-date-err', r.field === 'date' ? r.error : '');
            if (r.error) { (r.field === 'name' ? name : date).focus(); return; }
            const before = snap();
            Object.assign(e, { name: r.name, date: date.value, time: /^\d{2}:\d{2}$/.test(time.value) ? time.value : '', place: C.clean(place.value, C.MAX_PLACE), rev: +rev.value });
            panel = null; save(); render(); msg('exams-msg', r.name + ' saved.', () => restore(before));
        }));
        row.appendChild(btn('Cancel', 'secondary small', () => { panel = null; render(); }));
        box.appendChild(row);
        return box;
    }
    function openPanel(id, kind) {
        panel = panel && panel.id === id && panel.kind === kind ? null : { id, kind, values: {} };
        render();
        if (panel) { const f = document.querySelector('.exam[data-id="' + id + '"] .panel textarea, .exam[data-id="' + id + '"] .panel input'); if (f) f.focus(); }
    }

    function renderStudyDays() {
        const box = $('week'); box.textContent = '';
        WEEK.forEach(d => {
            const on = state.rest.includes(d);
            const b = btn(DAY_SHORT[d], 'chip' + (on ? ' on' : ''), () => toggleRest(d), C.DAYS[d] + (on ? ': no study' : ': study day'));
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            box.appendChild(b);
        });
        $('week-hint').textContent = state.rest.length ? 'No study on ' + WEEK.filter(d => state.rest.includes(d)).map(d => C.DAYS[d]).join(', ') + '. Tap again to study that day.' : 'Tap a day to keep it free every week. Nothing is planned on those days.';
        const ul = $('offs'); ul.textContent = '';
        state.off.filter(d => d >= today).forEach(d => {
            const li = el('li', 'off');
            li.appendChild(el('span', null, C.fmtDate(d)));
            li.appendChild(btn('×', 'x', () => { state.off = state.off.filter(o => o !== d); save(); render(); }, 'Remove day off ' + C.fmtDate(d)));
            ul.appendChild(li);
        });
    }

    // ---------- actions ----------
    function tick(examId, topicId, on) {
        const e = examById(examId), t = e && e.topics.find(x => x.id === topicId); if (!t) return;
        t.done = on ? today : null; save(); render();
    }
    function toggleRest(d) {
        if (!state.rest.includes(d) && state.rest.length >= 6) { setErr(null, 'week-err', 'Keep at least one study day in the week.'); return; }
        setErr(null, 'week-err', '');
        state.rest = state.rest.includes(d) ? state.rest.filter(x => x !== d) : state.rest.concat(d).sort();
        save(); render();
    }
    function addOff() {
        const inp = $('off-date'), d = inp.value;
        if (!d) return setErr(inp, 'off-err', 'Pick the date of your day off.');
        if (!C.valid(d)) return setErr(inp, 'off-err', 'That date does not look right. Pick it again.');
        if (d < today) return setErr(inp, 'off-err', 'That day has passed. Pick today or a later day.');
        if (state.off.includes(d)) return setErr(inp, 'off-err', 'That day is already a day off.');
        setErr(inp, 'off-err', '');
        state.off = state.off.filter(o => o >= today).concat(d).sort(); inp.value = '';
        save(); render();
    }
    function saveTopics(id, ta, err) {
        const e = examById(id); if (!e) return;
        const r = C.parseTopics(ta.value, []);
        if (r.names.length > C.MAX_TOPICS) { err.textContent = 'That is ' + r.names.length + ' topics. Keep it to ' + C.MAX_TOPICS + ' per exam.'; return; }
        const before = snap();
        e.topics = C.mergeTopics(e.topics, r.names, () => nextId('t'));
        panel = null; save(); render();
        msg('exams-msg', e.name + ': ' + C.plural(e.topics.length, 'topic') + ' saved' + (r.repeats ? ', ' + C.plural(r.repeats, 'repeat') + ' skipped' : '') + (r.cut ? ', ' + r.cut + ' shortened to ' + C.MAX_TOPIC + ' letters' : '') + '.', () => restore(before));
    }
    function delExam(id) {
        const e = examById(id); if (!e) return;
        const before = snap();
        state.exams = state.exams.filter(x => x.id !== id);
        if (panel && panel.id === id) panel = null;
        save(); render(); msg('exams-msg', e.name + ' deleted.', () => restore(before));
    }
    function openAdd(focus) {
        $('add-form').hidden = false; $('add-open').hidden = true;
        $('a-cancel').hidden = !state.exams.length;
        if (focus) $('a-name').focus();
    }
    function closeAdd() {
        $('add-form').hidden = true; $('add-open').hidden = false;
        ['a-name', 'a-date', 'a-time', 'a-place', 'a-topics'].forEach(i => { $(i).value = ''; });
        $('a-rev').value = '1'; $('a-more').hidden = true; $('a-more-open').hidden = false;
        setErr($('a-name'), 'a-name-err', ''); setErr($('a-date'), 'a-date-err', ''); setErr($('a-topics'), 'a-topics-err', '');
    }
    function addExam() {
        today = C.todayOf();
        const name = $('a-name'), date = $('a-date');
        const r = checkExam(name.value, date.value, null);
        setErr(name, 'a-name-err', r.field === 'name' ? r.error : ''); setErr(date, 'a-date-err', r.field === 'date' ? r.error : '');
        if (r.error) { (r.field === 'name' ? name : date).focus(); return; }
        if (state.exams.length >= C.MAX_EXAMS) { setErr(name, 'a-name-err', 'You have ' + C.MAX_EXAMS + ' exams. Delete a finished one first.'); return; }
        const tp = C.parseTopics($('a-topics').value, []);
        if (tp.names.length > C.MAX_TOPICS) { setErr($('a-topics'), 'a-topics-err', 'That is ' + tp.names.length + ' topics. Keep it to ' + C.MAX_TOPICS + ' per exam.'); $('a-topics').focus(); return; }
        setErr($('a-topics'), 'a-topics-err', '');
        const t = $('a-time').value;
        const e = { id: nextId('e'), name: r.name, date: date.value, time: /^\d{2}:\d{2}$/.test(t) ? t : '', place: C.clean($('a-place').value, C.MAX_PLACE), rev: +$('a-rev').value, topics: [] };
        e.topics = tp.names.map(n => ({ id: nextId('t'), name: n, done: null }));
        state.exams.push(e);
        save(); closeAdd(); render();
        msg('exams-msg', e.name + ' added: ' + C.untilWords(today, e.date).toLowerCase() + (e.topics.length ? ', ' + C.plural(e.topics.length, 'topic') : '') + (tp.repeats ? ' (' + C.plural(tp.repeats, 'repeat') + ' skipped)' : '') + '.');
        $('add-open').focus();
    }

    // ---------- sharing and backup ----------
    function download(name, text, type) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    const hasUpcoming = () => state.exams.some(e => e.date >= C.todayOf());
    async function copyPlan() {
        if (!hasUpcoming()) return msg('tools-msg', 'Add an exam first.');
        const text = C.summary(state, C.plan(state, C.todayOf()), undefined, 0);
        try { await navigator.clipboard.writeText(text); msg('tools-msg', 'Plan copied. Paste it in a message or note.'); }
        catch (e) {
            const ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (x) { ok = false; }
            ta.remove(); msg('tools-msg', ok ? 'Plan copied. Paste it in a message or note.' : 'Copying is blocked here. Use "Email the plan" instead.');
        }
    }
    function emailPlan() {
        if (!hasUpcoming()) return msg('tools-msg', 'Add an exam first.');
        const p = C.plan(state, C.todayOf());
        let limit = 21, body = C.summary(state, p, undefined, limit);
        while (encodeURIComponent(body).length > 4000 && limit > 7) { limit -= 2; body = C.summary(state, p, undefined, limit); }
        const a = document.createElement('a'); a.href = 'mailto:?subject=' + encodeURIComponent('My study plan and exam countdown') + '&body=' + encodeURIComponent(body); a.click();
        msg('tools-msg', 'Your email app opens with the plan' + (limit < p.days.length ? ' for the next ' + limit + ' days' : '') + '. Add who to send it to.');
    }
    function calFile() {
        if (!hasUpcoming()) return msg('tools-msg', 'Add an exam first.');
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
        download('exams.ics', C.ics(state, C.todayOf(), stamp), 'text/calendar');
        msg('tools-msg', 'Calendar file saved. Open it to add your exams, each with a reminder the day before.');
    }
    function backup() {
        download('study-plan-backup-' + C.todayOf() + '.json', JSON.stringify({ app: SLUG, saved: new Date().toISOString(), state }, null, 1), 'application/json');
        msg('tools-msg', 'Backup saved. Use "Restore a backup" to load it here or on another device.');
    }
    function restoreFile(file) {
        if (!file) return;
        if (file.size > 2000000) return msg('tools-msg', 'That file is too big to be a backup from this app.');
        const r = new FileReader();
        r.onload = () => {
            let s = null;
            try { const o = JSON.parse(r.result); s = C.normalize(o && o.state ? o.state : o); } catch (e) { s = null; }
            if (!s) return msg('tools-msg', 'That file is not a backup from this app. Nothing was changed.');
            const before = snap(); state = s; panel = null; save(); render();
            msg('tools-msg', 'Backup restored: ' + C.plural(s.exams.length, 'exam') + '.', () => restore(before));
        };
        r.onerror = () => msg('tools-msg', 'That file could not be read.');
        r.readAsText(file);
    }
    function wipe() {
        if (!state.exams.length && !state.rest.length && !state.off.length) return msg('tools-msg', 'There is nothing to delete.');
        const before = snap(); state = C.blank(); panel = null; save(); render();
        msg('tools-msg', 'Everything deleted.', () => restore(before));
    }

    // ---------- start ----------
    revOptions($('a-rev'), 1);
    load();
    $('add-open').addEventListener('click', () => openAdd(true));
    $('a-cancel').addEventListener('click', closeAdd);
    $('a-save').addEventListener('click', addExam);
    $('a-more-open').addEventListener('click', () => { $('a-more').hidden = false; $('a-more-open').hidden = true; $('a-time').focus(); });
    ['a-name', 'a-place', 'a-date', 'a-time'].forEach(i => $(i).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addExam(); } }));
    $('off-add').addEventListener('click', addOff);
    $('off-date').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addOff(); } });
    $('more').addEventListener('click', () => { shownDays += PAGE; render(); });
    $('copy').addEventListener('click', copyPlan);
    $('email').addEventListener('click', emailPlan);
    $('print').addEventListener('click', () => window.print());
    $('cal').addEventListener('click', calFile);
    $('backup').addEventListener('click', backup);
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', e => { restoreFile(e.target.files[0]); e.target.value = ''; });
    $('wipe').addEventListener('click', wipe);
    // a new day starts the plan again from that day
    const refresh = () => { if (C.todayOf() !== today) render(); };
    setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.addEventListener('storage', e => { if (e.key === KEY) { load(); render(); } });
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
