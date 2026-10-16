// Workout Log for the Gym: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.WorkoutCore;
    const SLUG = 'workout-log-for-the-gym';
    const KEY = SLUG + '.data', SKEY = SLUG + '.settings';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, attrs) => { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); if (attrs) Object.keys(attrs).forEach(k => b.setAttribute(k, attrs[k])); return b; };
    const now = () => Date.now();
    const OVERNIGHT_MS = 3 * 3600000;

    let canSave = true, loadNote = '';
    let data = loadData(), settings = loadSettings();
    let view = 'start';            // start | plan | session | done
    let editId = null;             // an earlier workout being changed (not the one in progress)
    let editSnap = null;           // how everything was before that change, for Cancel
    let editIsNew = false;
    let planDraft = null;          // { id, name, ex: [{ id|null, name, kind, rest }] }
    let doneId = null;
    let histShown = 10;
    const openProg = new Set();
    let editSet = null;            // { ex, i } set being changed
    const drafts = {};             // what is typed in each exercise's boxes, by exercise id
    const showExtra = new Set();   // bodyweight exercises showing the extra weight box
    const noteOpen = new Set();
    let overnightOk = 0;
    let laterOpen = false;           // the list of exercises not done yet is shown           // asked "still training?" and was told yes at this time

    // ---------- saving ----------
    function loadData() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const d = C.validate(JSON.parse(raw)); if (d) return d; } catch (e) { /* damaged */ }
            loadNote = 'Your saved workouts could not be read, so the app started fresh. If you have a backup file, use "Restore a backup".';
        }
        return C.emptyData();
    }
    function loadSettings() {
        const s = { unit: 'kg', rest: 90, sound: true, weekStart: 1 };
        try {
            const o = JSON.parse(localStorage.getItem(SKEY) || 'null');
            if (o && typeof o === 'object') {
                if (o.unit === 'kg' || o.unit === 'lb') s.unit = o.unit;
                if (Number.isInteger(o.rest) && o.rest >= 0 && o.rest <= C.LIMIT.maxRest) s.rest = o.rest;
                if (typeof o.sound === 'boolean') s.sound = o.sound;
                if ([0, 1, 6].includes(o.weekStart)) s.weekStart = o.weekStart;
            }
        } catch (e) { /* use the defaults */ }
        return s;
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(data)); localStorage.setItem(SKEY, JSON.stringify(settings)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify({ data, view, editId, doneId });
    function restoreSnap(snap) {
        const o = JSON.parse(snap);
        data = C.validate(o.data) || C.emptyData();
        view = o.view; editId = o.editId; doneId = o.doneId;
        if (view === 'session' && !curSession()) view = 'start';
        if (view === 'done' && !findSession(doneId)) view = 'start';
        if (view === 'plan') view = 'start';
        commit();
    }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const timers = {};
    function show(target, text, undoSnap) {
        const box = typeof target === 'string' ? $(target) : target;
        if (!box) return;
        box.textContent = '';
        box.classList.toggle('show', !!text);
        if (!text) return;
        box.appendChild(el('span', '', text));
        if (undoSnap) box.appendChild(btn('undo', 'Undo', () => { restoreSnap(undoSnap); show(box.id ? box.id : box, 'Undone.'); }));
        const key = box.id || 'x';
        clearTimeout(timers[key]);
        timers[key] = setTimeout(() => { box.textContent = ''; box.classList.remove('show'); }, undoSnap ? 12000 : 6000);
    }
    function say(text) { const s = $('sr-live'); s.textContent = ''; setTimeout(() => { s.textContent = text; }, 30); }

    // ---------- helpers ----------
    const findSession = id => data.sessions.find(s => s.id === id) || null;
    const liveSession = () => data.live ? findSession(data.live.id) : null;
    const curSession = () => editId ? findSession(editId) : liveSession();
    const findPlan = id => data.plans.find(p => p.id === id) || null;
    const restOf = ex => ex.rest == null ? settings.rest : ex.rest;
    const U = () => settings.unit;
    const step = () => settings.unit === 'lb' ? 500 : 250;

    // a rest choice: preset list plus "Other" with a seconds box
    function restPicker(id, current, withUsual, onChange) {
        const wrap = el('div', 'rest-pick');
        const lab = el('label', '', 'Rest after each set'); lab.htmlFor = id;
        const sel = el('select'); sel.id = id;
        if (withUsual) sel.appendChild(new Option('Usual (' + C.fmtRest(settings.rest) + ')', 'usual'));
        C.REST_PRESETS.forEach(s => sel.appendChild(new Option(C.fmtRest(s), String(s))));
        sel.appendChild(new Option('Other…', 'other'));
        const row = el('div', 'inline'); const inp = el('input'); inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 3; inp.id = id + '-s'; inp.setAttribute('aria-label', 'Rest in seconds');
        row.append(inp, el('span', 'unit', 'seconds (5 to 900)'));
        const err = el('p', 'err');
        const isPreset = current == null ? withUsual : C.REST_PRESETS.includes(current);
        sel.value = current == null ? 'usual' : (isPreset ? String(current) : 'other');
        row.hidden = sel.value !== 'other';
        if (sel.value === 'other') inp.value = String(current);
        const apply = () => {
            err.textContent = '';
            if (sel.value === 'usual') return onChange(null);
            if (sel.value !== 'other') return onChange(+sel.value);
            const v = inp.value.trim();
            if (!/^\d+$/.test(v) || +v < C.LIMIT.minRest || +v > C.LIMIT.maxRest) { if (v) err.textContent = 'Type a number of seconds from 5 to 900.'; return; }
            onChange(+v);
        };
        sel.addEventListener('change', () => { row.hidden = sel.value !== 'other'; if (sel.value === 'other') { inp.focus(); } else apply(); });
        inp.addEventListener('change', apply);
        wrap.append(lab, sel, row, err);
        return wrap;
    }

    // ---------- render ----------
    function render() {
        const live = liveSession();
        if (view === 'session' && !curSession()) view = 'start';
        if (live && view === 'start') view = 'session';
        $('start-view').hidden = view !== 'start';
        $('plan-form').hidden = view !== 'plan';
        $('session-view').hidden = view !== 'session';
        $('done-view').hidden = view !== 'done';
        $('app').classList.toggle('training', view === 'session' && !editId);
        const dl = $('ex-names'); dl.textContent = '';
        data.exercises.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(e => dl.appendChild(new Option(e.name)));
        if (view === 'start') renderStart();
        if (view === 'plan') renderPlanForm();
        if (view === 'session') renderSession();
        if (view === 'done') renderDone();
        renderHistory();
        renderProgress();
        renderSettings();
        updateTitle();
    }

    // ----- start: choose a plan
    function renderStart() {
        $('today-h').textContent = 'Start a workout';
        $('first-use').hidden = data.plans.length > 0 || data.sessions.length > 0;
        const ws = C.weekStats(data, now(), settings.weekStart), fin = C.finishedSessions(data);
        const week = $('week'); week.textContent = '';
        if (fin.length) {
            week.append(el('b', '', 'This week: ' + ws.workouts + (ws.workouts === 1 ? ' workout, ' : ' workouts, ') + ws.sets + (ws.sets === 1 ? ' set.' : ' sets.')));
            week.append(' Last workout: ' + fin[0].name + ', ' + C.ago(fin[0].start, now()) + '.');
        }
        week.hidden = !fin.length;
        const list = $('plans'); list.textContent = '';
        // the plan done longest ago (or never) is up next
        const lastDone = p => { const s = fin.find(x => x.plan === p.id); return s ? s.start : -1; };
        let next = null;
        if (data.plans.length > 1 && fin.length) next = data.plans.reduce((a, p) => lastDone(p) < lastDone(a) ? p : a, data.plans[0]);
        data.plans.forEach(p => {
            const li = el('li', 'box plan');
            const top = el('div', 'box-top'); top.appendChild(el('h3', 'box-name', p.name));
            if (next && next.id === p.id) top.appendChild(el('span', 'badge', 'Up next'));
            li.appendChild(top);
            const names = p.ex.map(id => (C.findEx(data, id) || {}).name).filter(Boolean);
            li.appendChild(el('p', 'box-sub', names.length ? names.join(' · ') : 'No exercises yet'));
            const ld = lastDone(p);
            li.appendChild(el('p', 'box-sub', ld > 0 ? 'Last done ' + C.ago(ld, now()) : 'Not done yet'));
            const b = el('div', 'box-btns');
            b.append(btn('mini strong', 'Start ' + p.name, () => startWorkout(p)), btn('mini', 'Change', () => openPlan(p), { 'aria-label': 'Change ' + p.name }));
            li.appendChild(b);
            list.appendChild(li);
        });
        $('new-plan').textContent = data.plans.length ? '+ Make a new workout plan' : '+ Make my own plan';
    }

    function startWorkout(plan) {
        if (liveSession()) return;
        const s = { id: C.newId(data), name: plan ? plan.name : 'Workout', plan: plan ? plan.id : null, start: now(), end: null,
            entries: plan ? plan.ex.filter(id => C.findEx(data, id)).map(id => ({ ex: id, sets: [], note: '' })) : [] };
        data.sessions.push(s);
        data.live = { id: s.id, rest: null };
        editId = null; view = 'session'; overnightOk = 0;
        Object.keys(drafts).forEach(k => delete drafts[k]); showExtra.clear(); noteOpen.clear(); editSet = null;
        commit();
        $('today').scrollIntoView({ block: 'start' });
        if (!s.entries.length) openAddEx();
    }

    // ----- plans
    function openPlan(p) {
        planDraft = p ? { id: p.id, name: p.name, ex: p.ex.map(id => C.findEx(data, id)).filter(Boolean).map(e => ({ id: e.id, name: e.name, kind: e.kind, rest: e.rest })) }
                      : { id: null, name: '', ex: [] };
        view = 'plan';
        render();
        $('p-name').value = planDraft.name;
        $('p-name-err').textContent = ''; $('p-new-err').textContent = ''; $('p-new').value = '';
        (p ? $('p-new') : $('p-name')).focus();
    }
    function renderPlanForm() {
        $('today-h').textContent = planDraft.id ? 'Change plan: ' + (findPlan(planDraft.id) || {}).name : 'New workout plan';
        $('p-delete').hidden = !planDraft.id;
        const ol = $('p-ex'); ol.textContent = '';
        $('p-ex-none').hidden = planDraft.ex.length > 0;
        planDraft.ex.forEach((x, i) => {
            const li = el('li', 'box pex');
            const top = el('div', 'box-top');
            top.append(el('h4', 'box-name', (i + 1) + '. ' + x.name), el('span', 'badge', C.KIND_LABEL[x.kind]));
            li.appendChild(top);
            li.appendChild(restPicker('pr-' + i, x.rest, true, v => { x.rest = v; }));
            const b = el('div', 'box-btns');
            const up = btn('mini', 'Move up', () => { planDraft.ex.splice(i - 1, 0, planDraft.ex.splice(i, 1)[0]); renderPlanForm(); focusSel('#p-ex li:nth-child(' + i + ') .mv-up, #p-ex li:nth-child(' + i + ') .mv-down'); }, { 'aria-label': 'Move ' + x.name + ' up' });
            up.classList.add('mv-up'); up.disabled = i === 0;
            const dn = btn('mini', 'Move down', () => { planDraft.ex.splice(i + 1, 0, planDraft.ex.splice(i, 1)[0]); renderPlanForm(); focusSel('#p-ex li:nth-child(' + (i + 2) + ') .mv-down, #p-ex li:nth-child(' + (i + 2) + ') .mv-up'); }, { 'aria-label': 'Move ' + x.name + ' down' });
            dn.classList.add('mv-down'); dn.disabled = i === planDraft.ex.length - 1;
            const rm = btn('mini bad', 'Remove', () => { planDraft.ex.splice(i, 1); renderPlanForm(); $('p-new').focus(); }, { 'aria-label': 'Remove ' + x.name + ' from this plan' });
            b.append(up, dn, rm);
            li.appendChild(b);
            ol.appendChild(li);
        });
        $('p-add').hidden = planDraft.ex.length >= C.LIMIT.exPerPlan;
        syncKind('p-new', 'p-kind');
    }
    function focusSel(sel) { const e = document.querySelector(sel); if (e && !e.disabled) e.focus(); else { const all = document.querySelectorAll(sel); for (const x of all) if (!x.disabled) { x.focus(); break; } } }
    // when the typed name is a known exercise, its kind is fixed
    function syncKind(inputId, selId) {
        const ex = C.findExByName(data, $(inputId).value);
        $(selId).disabled = !!ex;
        if (ex) $(selId).value = ex.kind;
    }
    function planAddExercise() {
        const name = C.norm($('p-new').value), err = $('p-new-err');
        err.textContent = '';
        if (!name) { err.textContent = 'Type the name of the exercise.'; $('p-new').focus(); return; }
        if (planDraft.ex.some(x => x.name.toLowerCase() === name.toLowerCase())) { err.textContent = name + ' is already in this plan.'; return; }
        const known = C.findExByName(data, name);
        planDraft.ex.push(known ? { id: known.id, name: known.name, kind: known.kind, rest: known.rest } : { id: null, name: name.slice(0, C.LIMIT.name), kind: $('p-kind').value, rest: null });
        $('p-new').value = ''; $('p-kind').value = 'weight';
        renderPlanForm();
        $('p-new').focus();
    }
    function savePlan(e) {
        if (e) e.preventDefault();
        const name = C.norm($('p-name').value);
        $('p-name-err').textContent = '';
        if ($('p-new').value.trim()) planAddExercise();
        if ($('p-new-err').textContent) return;
        if (!name) { $('p-name-err').textContent = 'Give the plan a name, like Push or Leg day.'; $('p-name').focus(); return; }
        if (!planDraft.ex.length) { $('p-new-err').textContent = 'Add at least one exercise.'; $('p-new').focus(); return; }
        if (data.plans.some(p => p.id !== planDraft.id && p.name.toLowerCase() === name.toLowerCase())) { $('p-name-err').textContent = 'You already have a plan called ' + name + '. Pick another name.'; $('p-name').focus(); return; }
        if (!planDraft.id && data.plans.length >= C.LIMIT.plans) { $('p-name-err').textContent = 'You have ' + C.LIMIT.plans + ' plans, the most there can be. Delete one first.'; return; }
        const snap = snapshot();
        const ids = planDraft.ex.map(x => {
            const ex = x.id ? C.findEx(data, x.id) : C.getOrAddExercise(data, x.name, x.kind, null);
            ex.rest = x.rest;
            return ex.id;
        });
        let plan = planDraft.id ? findPlan(planDraft.id) : null;
        const isNew = !plan;
        if (!plan) { plan = { id: C.newId(data), name, ex: [] }; data.plans.push(plan); }
        plan.name = name.slice(0, C.LIMIT.plan); plan.ex = ids;
        view = 'start'; planDraft = null;
        commit();
        show('today-msg', (isNew ? 'Plan ' : 'Changes to ') + plan.name + (isNew ? ' saved.' : ' saved.'), snap);
    }
    function deletePlan() {
        const p = findPlan(planDraft.id); if (!p) return;
        const snap = snapshot();
        data.plans = data.plans.filter(x => x.id !== p.id);
        view = 'start'; planDraft = null;
        commit();
        show('today-msg', 'Plan ' + p.name + ' deleted. Your workouts with it stay in History.', snap);
    }

    // ----- the workout
    function renderSession() {
        const s = curSession(); if (!s) return;
        const live = !editId;
        $('today-h').textContent = live ? 'Today’s workout: ' + s.name : (editIsNew ? 'Add a workout I did earlier' : 'Change workout: ' + s.name + ', ' + C.fmtDay(s.start, now()));
        // top line
        const meta = $('s-meta'); meta.textContent = '';
        if (live) {
            meta.append('Started ' + C.fmtTime(s.start) + (C.isoDay(s.start) !== C.isoDay(now()) ? ' on ' + C.fmtDay(s.start, now()) : '') + ' · ');
            const len = el('span', '', C.fmtLen(now() - s.start)); len.id = 's-len'; meta.append(len);
            const n = C.setCount(s); meta.append(' · ' + n + (n === 1 ? ' set' : ' sets'));
        }
        meta.hidden = !live;
        // forgot to finish?
        const last = C.lastSetAt(s) || s.start, on = $('s-overnight');
        on.hidden = !(live && now() - last > OVERNIGHT_MS && now() - overnightOk > OVERNIGHT_MS);
        if (!on.hidden) {
            const has = C.setCount(s) > 0;
            $('s-overnight-text').textContent = 'This workout started ' + C.fmtDay(s.start, now()) + ' at ' + C.fmtTime(s.start) + (has ? ' and your last set was at ' + C.fmtTime(last) + (C.isoDay(last) !== C.isoDay(s.start) ? ' on ' + C.fmtDay(last, now()) : '') + '.' : ' and has no sets.') + ' Did you forget to finish it?';
            $('s-overnight-finish').textContent = has ? 'Finish it at ' + C.fmtTime(last) : 'Throw it away';
        }
        // earlier workout: day and times
        $('s-past').hidden = live;
        $('s-awake-row').hidden = !live || !('wakeLock' in navigator);
        $('s-finish').textContent = live ? 'Finish workout' : 'Save changes';
        $('s-discard').textContent = live ? 'Discard workout' : 'Cancel';
        $('s-discard').className = live ? 'danger' : 'secondary';
        const p = s.plan ? findPlan(s.plan) : null;
        $('s-also-row').hidden = !live || !p;
        if (p) $('s-also-text').textContent = 'Also add it to the ' + p.name + ' plan';
        // the exercises
        const ol = $('s-ex'), active = document.activeElement && document.activeElement.id;
        ol.textContent = '';
        $('s-empty').hidden = s.entries.length > 0;
        const bests = C.sessionBests(data, s);
        s.entries.forEach(entry => { const ex = C.findEx(data, entry.ex); if (ex) ol.appendChild(exerciseBox(s, entry, ex, bests, live)); });
        if (active && $(active) && document.activeElement !== $(active)) $(active).focus({ preventScroll: true });
        tick();
    }

    function exerciseBox(s, entry, ex, bests, live) {
        const u = U(), id = ex.id;
        const li = el('li', 'box ex'); li.id = 'ex-' + id;
        const top = el('div', 'box-top');
        top.appendChild(el('h3', 'box-name', ex.name));
        const work = entry.sets.filter(C.isWork).length;
        top.appendChild(el('span', 'badge', work ? work + (work === 1 ? ' set' : ' sets') : (live ? 'To do' : 'No sets')));
        li.appendChild(top);
        // last time and best
        const lt = C.lastTime(data, id, s.start, s.id);
        if (lt) {
            const p = el('p', 'last'); p.append(el('b', '', 'Last time, ' + C.fmtDay(lt.session.start, now()) + ': '), C.setsText(ex.kind, lt.sets, u));
            li.appendChild(p);
            if (lt.note) li.appendChild(el('p', 'box-sub', 'Your note: ' + lt.note));
            const be = bestBefore(id, ex.kind, s);
            if (be) { const bp = el('p', 'box-sub'); bp.append('Your best: ' + C.setText(ex.kind, be, u)); const e1 = ex.kind === 'weight' ? C.e1rmText(be, u) : ''; if (e1) bp.append(' (' + e1 + ')'); li.appendChild(bp); }
        } else li.appendChild(el('p', 'last first', 'First time: today’s sets are your starting point.'));
        // logged sets
        if (entry.sets.length) {
            const ol = el('ol', 'sets');
            let n = 0;
            entry.sets.forEach((x, i) => {
                const row = el('li', 'set' + (x.wu ? ' wu' : ''));
                if (editSet && editSet.ex === id && editSet.i === i) { row.appendChild(setEditor(s, entry, ex, i)); ol.appendChild(row); if (!x.wu) n++; return; }
                row.appendChild(el('span', 'set-n', x.wu ? 'W' : String(++n)));
                const main = el('span', 'set-main'); main.appendChild(el('span', 'set-v', C.setText(ex.kind, x, u)));
                if (x.wu) main.appendChild(el('span', 'tag', 'warm-up'));
                const b = bests[id + ':' + i]; if (b) main.appendChild(el('span', 'tag best', b.text));
                row.appendChild(main);
                row.appendChild(btn('mini tiny', 'Edit', () => { editSet = { ex: id, i }; renderSession(); const f = document.querySelector('#ex-' + id + ' .set-edit input'); if (f) f.focus(); }, { 'aria-label': 'Edit ' + (x.wu ? 'warm-up' : 'set ' + n) + ' of ' + ex.name }));
                ol.appendChild(row);
            });
            li.appendChild(ol);
        }
        const msg = el('div', 'msg'); msg.id = 'exmsg-' + id; msg.setAttribute('role', 'status'); li.appendChild(msg);
        // rest timer
        if (live && data.live.rest && data.live.rest.ex === id) {
            const r = el('div', 'rest'); r.id = 'rest-box';
            const lab = el('span', 'rest-lab', 'Rest');
            const clk = el('span', 'rest-clock', C.clock((data.live.rest.ends - now()) / 1000)); clk.id = 'rest-clock';
            const bar = el('div', 'rest-bar'); const fill = el('i'); fill.id = 'rest-fill'; bar.appendChild(fill);
            const b = el('div', 'rest-btns');
            b.append(btn('mini', '+30 s', () => { data.live.rest.ends += 30000; data.live.rest.total += 30; commit(); }), btn('mini', 'Skip rest', () => { data.live.rest = null; commit(); }));
            r.append(lab, clk, bar, b);
            li.appendChild(r);
        }
        // log the next set
        if (entry.sets.length < C.LIMIT.setsPerEx) li.appendChild(logForm(s, entry, ex));
        else li.appendChild(el('p', 'hint', 'This exercise has ' + C.LIMIT.setsPerEx + ' sets, the most there can be.'));
        // note and remove
        const extra = el('div', 'box-links');
        if (entry.note || noteOpen.has(id)) {
            const lab = el('label', '', 'Note for ' + ex.name); lab.htmlFor = 'note-' + id;
            const ta = el('textarea'); ta.id = 'note-' + id; ta.maxLength = C.LIMIT.note; ta.rows = 2; ta.value = entry.note; ta.placeholder = 'For example: seat height 4, felt easy';
            ta.addEventListener('change', () => { entry.note = ta.value.trim().slice(0, C.LIMIT.note); save(); });
            li.append(lab, ta);
        } else extra.appendChild(btn('link', '+ Add a note (optional)', () => { noteOpen.add(id); renderSession(); $('note-' + id).focus(); }));
        if (!entry.sets.length) extra.appendChild(btn('link muted', 'Remove from this workout', () => {
            const snap = snapshot();
            s.entries = s.entries.filter(x => x !== entry);
            if (data.live && data.live.rest && data.live.rest.ex === id) data.live.rest = null;
            commit(); show('today-msg', ex.name + ' removed from this workout.', snap);
        }));
        if (extra.childNodes.length) li.appendChild(extra);
        return li;
    }
    function bestBefore(exId, kind, s) {
        const sets = C.priorSets(data, exId, s.start, s.id);
        if (!sets.length) return null;
        const tmp = { sessions: [{ id: -1, start: 0, entries: [{ ex: exId, sets }] }] };
        const b = C.bestEver(tmp, exId, kind);
        return b && b.set;
    }

    // the boxes for one set: weight/reps, reps (+ extra weight), or time
    function fieldsFor(ex, prefix, vals) {
        const u = U(), wrap = el('div', 'fields k-' + ex.kind);
        const stepper = (name, label, value, stepBy, min, mode) => {
            const f = el('div', 'field');
            const lab = el('label', '', label); lab.htmlFor = prefix + name;
            const row = el('div', 'stepper');
            const inp = el('input'); inp.type = 'text'; inp.id = prefix + name; inp.inputMode = mode; inp.autocomplete = 'off'; inp.maxLength = 8; inp.value = value;
            const minus = btn('step', '−', () => bump(-1), { 'aria-label': 'Less ' + label.toLowerCase().replace(/ \(.*/, '') });
            const plus = btn('step', '+', () => bump(1), { 'aria-label': 'More ' + label.toLowerCase().replace(/ \(.*/, '') });
            function bump(dir) {
                const cur = name === 'r' ? C.parseReps(inp.value) : C.parseWeight(inp.value, u);
                let v = cur.v != null ? cur.v : (name === 'r' ? 0 : 0);
                v = Math.max(min, v + dir * stepBy);
                inp.value = name === 'r' ? String(v) : C.fmtNum(v).replace(/,/g, '');
                inp.dispatchEvent(new Event('input', { bubbles: true }));
            }
            row.append(minus, inp, plus);
            f.append(lab, row);
            return f;
        };
        if (ex.kind === 'weight') {
            wrap.appendChild(stepper('w', 'Weight (' + u + ')', vals.w, step(), 0, 'decimal'));
            wrap.appendChild(stepper('r', 'Reps', vals.r, 1, 1, 'numeric'));
        } else if (ex.kind === 'body') {
            wrap.appendChild(stepper('r', 'Reps', vals.r, 1, 1, 'numeric'));
            if (vals.showX) wrap.appendChild(stepper('x', 'Extra weight (' + u + ')', vals.x, step(), 0, 'decimal'));
        } else {
            const f = el('div', 'field');
            const lab = el('label', '', 'Time held'); lab.htmlFor = prefix + 't';
            const inp = el('input'); inp.type = 'text'; inp.id = prefix + 't'; inp.autocomplete = 'off'; inp.maxLength = 8; inp.value = vals.t; inp.placeholder = '45 or 1:30';
            f.append(lab, inp, el('p', 'hint', 'Seconds, or minutes:seconds'));
            wrap.appendChild(f);
        }
        return wrap;
    }
    // reads the boxes; returns { set } or { err, field }
    function readFields(ex, prefix) {
        const u = U(), v = id => ($(prefix + id) || {}).value || '';
        if (ex.kind === 'time') {
            const t = C.parseDuration(v('t'));
            if (t.empty) return { err: 'Type how long you held it, like 45 or 1:30.', field: 't' };
            if (t.err) return { err: t.err, field: 't' };
            return { set: { t: t.v, u } };
        }
        const set = { u };
        if (ex.kind === 'weight') {
            const w = C.parseWeight(v('w'), u);
            if (w.empty) return { err: 'Type the weight (0 if there is none).', field: 'w' };
            if (w.err) return { err: w.err, field: 'w' };
            set.w = w.v;
        }
        const r = C.parseReps(v('r'));
        if (r.empty) return { err: 'Type how many reps you did.', field: 'r' };
        if (r.err) return { err: r.err, field: 'r' };
        set.r = r.v;
        if (ex.kind === 'body' && $(prefix + 'x')) {
            const x = C.parseWeight(v('x'), u);
            if (x.err) return { err: 'Extra weight: ' + x.err, field: 'x' };
            if (!x.empty && x.v > 0) set.w = x.v;
        }
        return { set };
    }

    function logForm(s, entry, ex) {
        const id = ex.id, u = U(), prefix = 'f' + id + '-';
        const sug = C.suggestNext(data, s, id, u);
        const d = drafts[id] || {};
        const vals = {
            w: d.w != null ? d.w : (sug ? C.fmtNum(sug.w).replace(/,/g, '') : ''),
            r: d.r != null ? d.r : (sug && sug.r ? String(sug.r) : ''),
            x: d.x != null ? d.x : (sug && sug.w ? C.fmtNum(sug.w).replace(/,/g, '') : ''),
            t: d.t != null ? d.t : (sug && sug.t ? (sug.t < 60 ? String(sug.t) : C.clock(sug.t)) : ''),
            showX: showExtra.has(id) || !!(sug && sug.w && ex.kind === 'body') || (d.x != null && d.x !== '')
        };
        const box = el('div', 'log');
        const fields = fieldsFor(ex, prefix, vals);
        fields.addEventListener('input', e => { const k = e.target.id.slice(prefix.length); drafts[id] = Object.assign(drafts[id] || {}, { [k]: e.target.value }); e.target.removeAttribute('aria-invalid'); });
        box.appendChild(fields);
        if (ex.kind === 'body' && !vals.showX) box.appendChild(btn('link', '+ Add extra weight (optional)', () => { showExtra.add(id); renderSession(); $(prefix + 'x').focus(); }));
        const row = el('div', 'log-row');
        const wl = el('label', 'check'); const wu = el('input'); wu.type = 'checkbox'; wu.id = prefix + 'wu'; wu.checked = !!d.wu;
        wu.addEventListener('change', () => { drafts[id] = Object.assign(drafts[id] || {}, { wu: wu.checked }); });
        wl.append(wu, ' Warm-up');
        const workDone = entry.sets.filter(C.isWork).length;
        const go = btn('primary log-btn', 'Log set ' + (workDone + 1), () => logSet(s, entry, ex));
        go.id = prefix + 'go';
        wu.addEventListener('change', () => { go.textContent = wu.checked ? 'Log warm-up' : 'Log set ' + (workDone + 1); });
        if (wu.checked) go.textContent = 'Log warm-up';
        row.append(wl, go);
        box.appendChild(row);
        const err = el('p', 'err'); err.id = prefix + 'err'; box.appendChild(err);
        box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') { e.preventDefault(); logSet(s, entry, ex); } });
        return box;
    }

    function logSet(s, entry, ex) {
        const prefix = 'f' + ex.id + '-', got = readFields(ex, prefix);
        if (got.err) { $(prefix + 'err').textContent = got.err; const f = $(prefix + got.field); if (f) { f.setAttribute('aria-invalid', 'true'); f.focus(); } return; }
        unlockSound();
        const set = got.set; set.at = editId ? s.start : now();
        if ($(prefix + 'wu') && $(prefix + 'wu').checked) set.wu = true;
        entry.sets.push(set);
        delete drafts[ex.id];
        const live = !editId;
        if (live) {
            const rest = restOf(ex);
            data.live.rest = rest > 0 ? { ex: ex.id, ends: now() + rest * 1000, total: rest } : null;
        }
        commit();
        const b = C.sessionBests(data, s)[ex.id + ':' + (entry.sets.length - 1)];
        say('Logged ' + (set.wu ? 'warm-up' : 'set') + ': ' + C.setText(ex.kind, set, U()) + '.' + (b ? ' ' + b.text + '!' : '') + (live && data.live.rest ? ' Rest ' + C.fmtRest(data.live.rest.total) + '.' : ''));
        const go = $(prefix + 'go'); if (go) go.focus({ preventScroll: true });
    }

    function setEditor(s, entry, ex, i) {
        const x = entry.sets[i], u = U(), prefix = 'e' + ex.id + '-';
        const wv = x.w ? C.fmtNum(C.weightIn(x.w, x.u, u)).replace(/,/g, '') : (ex.kind === 'weight' ? '0' : '');
        const box = el('div', 'set-edit');
        box.appendChild(fieldsFor(ex, prefix, { w: wv, r: x.r ? String(x.r) : '', x: wv, t: x.t ? (x.t < 60 ? String(x.t) : C.clock(x.t)) : '', showX: ex.kind === 'body' }));
        const wl = el('label', 'check'); const wu = el('input'); wu.type = 'checkbox'; wu.id = prefix + 'wu'; wu.checked = !!x.wu; wl.append(wu, ' Warm-up');
        box.appendChild(wl);
        const err = el('p', 'err'); box.appendChild(err);
        const b = el('div', 'box-btns');
        b.append(btn('mini strong', 'Save', () => {
            const got = readFields(ex, prefix);
            if (got.err) { err.textContent = got.err; const f = $(prefix + got.field); if (f) f.focus(); return; }
            const snap = snapshot();
            const ns = got.set; ns.at = x.at; if (wu.checked) ns.wu = true;
            entry.sets[i] = ns; editSet = null; commit();
            show('exmsg-' + ex.id, 'Set changed.', snap);
        }), btn('mini', 'Cancel', () => { editSet = null; renderSession(); }), btn('mini bad', 'Delete set', () => {
            const snap = snapshot();
            entry.sets.splice(i, 1); editSet = null;
            commit(); show('exmsg-' + ex.id, 'Set deleted.', snap);
        }));
        box.appendChild(b);
        box.addEventListener('keydown', e => { if (e.key === 'Escape') { editSet = null; renderSession(); } });
        return box;
    }

    // add an exercise to the workout
    function openAddEx() { $('s-add').hidden = false; $('s-add-open').hidden = true; $('s-new').value = ''; $('s-new-err').textContent = ''; $('s-also').checked = false; syncKind('s-new', 's-kind'); $('s-new').focus(); }
    function closeAddEx() { $('s-add').hidden = true; $('s-add-open').hidden = false; }
    function addExToSession() {
        const s = curSession(); if (!s) return;
        const name = C.norm($('s-new').value), err = $('s-new-err'); err.textContent = '';
        if (!name) { err.textContent = 'Type the name of the exercise.'; $('s-new').focus(); return; }
        const known = C.findExByName(data, name);
        if (known && s.entries.some(e => e.ex === known.id)) { err.textContent = known.name + ' is already in this workout.'; return; }
        if (s.entries.length >= C.LIMIT.exPerPlan) { err.textContent = 'This workout has ' + C.LIMIT.exPerPlan + ' exercises, the most there can be.'; return; }
        const ex = known || C.getOrAddExercise(data, name, $('s-kind').value, null);
        s.entries.push({ ex: ex.id, sets: [], note: '' });
        const p = s.plan ? findPlan(s.plan) : null;
        if (!editId && p && $('s-also').checked && !p.ex.includes(ex.id) && p.ex.length < C.LIMIT.exPerPlan) p.ex.push(ex.id);
        closeAddEx();
        commit();
        const f = document.querySelector('#ex-' + ex.id + ' .fields input'); if (f) f.focus();
    }

    function finishWorkout(at) {
        const s = liveSession(); if (!s) return;
        const snap = snapshot();
        releaseWake();
        if (!C.setCount(s)) {
            data.sessions = data.sessions.filter(x => x.id !== s.id); data.live = null; view = 'start';
            commit(); show('today-msg', 'Nothing was logged, so the workout was not saved.', snap); return;
        }
        s.end = Math.max(s.start, at || now());
        data.live = null;
        doneId = s.id; view = 'done';
        commit();
        $('today').scrollIntoView({ block: 'start' });
        say('Workout finished. ' + $('d-big').textContent);
    }
    function discardWorkout() {
        const s = liveSession(); if (!s) return;
        const snap = snapshot();
        releaseWake();
        data.sessions = data.sessions.filter(x => x.id !== s.id); data.live = null; view = 'start';
        commit(); show('today-msg', 'Workout discarded.', snap);
    }

    // ----- changing an earlier workout
    function editPast(s, isNew) {
        if (liveSession()) { show('hist-msg', 'Finish today’s workout first, then you can change earlier ones.'); return; }
        editSnap = isNew ? editSnap : snapshot();
        editId = s.id; editIsNew = !!isNew; view = 'session'; editSet = null;
        Object.keys(drafts).forEach(k => delete drafts[k]);
        render();
        $('s-day').value = C.isoDay(s.start); $('s-from').value = C.fmtTime(s.start); $('s-to').value = C.fmtTime(s.end || s.start);
        $('s-name').value = s.name; $('s-past-err').textContent = '';
        renderPastPlanChooser(s);
        $('today').scrollIntoView({ block: 'start' });
        $('s-day').focus({ preventScroll: true });
    }
    function renderPastPlanChooser(s) {
        let wrap = $('s-plan-wrap');
        if (wrap) wrap.remove();
        if (!editIsNew || !data.plans.length) return;
        wrap = el('div'); wrap.id = 's-plan-wrap';
        const lab = el('label', '', 'Exercises from a plan (optional)'); lab.htmlFor = 's-plan';
        const sel = el('select'); sel.id = 's-plan';
        sel.appendChild(new Option('None, I will add them', ''));
        data.plans.forEach(p => sel.appendChild(new Option(p.name, String(p.id))));
        sel.value = s.plan ? String(s.plan) : '';
        sel.addEventListener('change', () => {
            if (C.setCount(s)) { $('s-past-err').textContent = 'Sets are already logged, so the exercises were not changed.'; sel.value = s.plan ? String(s.plan) : ''; return; }
            const p = findPlan(+sel.value);
            s.plan = p ? p.id : null;
            s.entries = p ? p.ex.map(id => ({ ex: id, sets: [], note: '' })) : [];
            if (p && (!$('s-name').value.trim() || $('s-name').value === 'Workout' || data.plans.some(q => q.name === $('s-name').value))) $('s-name').value = p.name;
            commit();
        });
        wrap.append(lab, sel);
        $('s-past').appendChild(wrap);
    }
    function addPastWorkout() {
        if (liveSession()) { show('today-msg', 'Finish today’s workout first.'); return; }
        editSnap = snapshot();
        const y = new Date(now()); y.setDate(y.getDate() - 1); y.setHours(18, 0, 0, 0);
        const s = { id: C.newId(data), name: 'Workout', plan: null, start: y.getTime(), end: y.getTime() + 3600000, entries: [] };
        data.sessions.push(s);
        save();
        editPast(s, true);
    }
    // reads Day / Started / Finished; returns an error text or null
    function applyPastFields(s) {
        const day = $('s-day').value, from = C.atTime(day, $('s-from').value), to0 = C.atTime(day, $('s-to').value);
        if (!day || from == null) return 'Choose the day and the time it started.';
        if (to0 == null) return 'Choose the time it finished.';
        let to = to0; if (to <= from) to += 86400000;          // finished after midnight
        if (from > now()) return 'That start is in the future. A workout in progress is logged with "Start".';
        if (to - from > 8 * 3600000) return 'That is longer than 8 hours. Check the times.';
        const name = C.norm($('s-name').value) || s.name;
        const shift = from - s.start;
        s.start = from; s.end = Math.min(Math.max(to, from), Math.max(to, from)); s.name = name.slice(0, C.LIMIT.plan);
        s.entries.forEach(e => e.sets.forEach(x => { x.at = x.at ? Math.min(Math.max(x.at + shift, s.start), s.end) : s.start; }));
        return null;
    }
    function savePast() {
        const s = curSession(); if (!s) return;
        const err = applyPastFields(s);
        if (err) { $('s-past-err').textContent = err; return; }
        const before = editSnap, wasNew = editIsNew;
        if (!C.setCount(s)) {
            if (wasNew) { $('s-past-err').textContent = 'Log at least one set, or tap Cancel.'; return; }
        }
        editId = null; editSnap = null; editIsNew = false; view = 'start';
        commit();
        show('hist-msg', (wasNew ? 'Workout added: ' : 'Changes saved: ') + s.name + ', ' + C.fmtDay(s.start, now()) + '.', before);
    }
    function cancelPast() {
        const snap = editSnap; editId = null; editSnap = null; editIsNew = false;
        if (snap) { const o = JSON.parse(snap); data = C.validate(o.data) || data; }
        view = 'start'; commit();
    }

    // ----- after finishing
    function renderDone() {
        const s = findSession(doneId); if (!s) { view = 'start'; return renderStart(); }
        const u = U(), sm = C.summary(data, s, u);
        $('today-h').textContent = 'Well done!';
        $('d-big').textContent = s.name + ' finished: ' + C.fmtLen(sm.lengthMs) + '.';
        const st = $('d-stats'); st.textContent = '';
        const stat = (n, l) => { const li = el('li'); li.append(el('b', '', n), el('span', '', l)); st.appendChild(li); };
        stat(String(sm.exercisesDone), sm.exercisesDone === 1 ? 'exercise' : 'exercises');
        stat(String(sm.sets), sm.sets === 1 ? 'set' : 'sets');
        if (sm.volume) stat(C.fmtW(sm.volume, u), 'lifted in total');
        const bd = $('d-bests'); bd.textContent = '';
        if (sm.bests.length) {
            bd.appendChild(el('h3', 'g-h', sm.bests.length === 1 ? '1 new best' : sm.bests.length + ' new bests'));
            const ul = el('ul', 'best-list');
            sm.bests.forEach(b => { const li = el('li'); li.append(el('b', '', b.name + ': ' + b.text), ' (' + b.why.replace(/^New best: /, '') + ')'); ul.appendChild(li); });
            bd.appendChild(ul);
        } else bd.appendChild(el('p', 'hint', 'No new bests this time. Showing up is what counts.'));
        $('d-skipped').textContent = sm.skipped.length ? 'Skipped: ' + sm.skipped.join(', ') + '.' : '';
    }

    // ---------- history ----------
    function renderHistory() {
        const fin = C.finishedSessions(data), ul = $('hist-list'), u = U();
        ul.textContent = '';
        $('hist-empty').hidden = fin.length > 0;
        fin.slice(0, histShown).forEach(s => {
            const sm = C.summary(data, s, u);
            const li = el('li', 'box hist' + (s.id === editId ? ' editing' : '')); li.id = 'h-' + s.id;
            const top = el('div', 'box-top');
            top.append(el('h3', 'box-name', s.name), el('span', 'badge', C.fmtDay(s.start, now())));
            li.appendChild(top);
            li.appendChild(el('p', 'box-sub', C.fmtTime(s.start) + ', ' + C.fmtLen(s.end - s.start) + ' · ' + sm.sets + (sm.sets === 1 ? ' set' : ' sets') + (sm.volume ? ' · ' + C.fmtW(sm.volume, u) + ' lifted' : '')));
            const dl = el('ul', 'dl');
            s.entries.forEach(e => {
                const ex = C.findEx(data, e.ex); if (!ex || !e.sets.length) return;
                const w = e.sets.filter(C.isWork);
                const row = el('li'); row.append(el('b', '', ex.name + ': '), w.length ? C.setsText(ex.kind, w, u) : 'warm-up only');
                dl.appendChild(row);
            });
            li.appendChild(dl);
            if (sm.bests.length) li.appendChild(el('p', 'best-line', (sm.bests.length === 1 ? '1 new best: ' : sm.bests.length + ' new bests: ') + sm.bests.map(b => b.name).join(', ')));
            if (sm.skipped.length) li.appendChild(el('p', 'box-sub', 'Skipped: ' + sm.skipped.join(', ')));
            const b = el('div', 'box-btns');
            b.append(btn('mini', 'Copy', () => copyText(C.sessionTextPlain(data, s, U(), now()), 'hist-msg', 'Workout copied.'), { 'aria-label': 'Copy ' + s.name + ', ' + C.fmtDay(s.start, now()) }),
                btn('mini', 'Edit', () => editPast(s), { 'aria-label': 'Edit ' + s.name + ', ' + C.fmtDay(s.start, now()) }),
                btn('mini bad', 'Delete', () => {
                    const snap = snapshot();
                    data.sessions = data.sessions.filter(x => x.id !== s.id);
                    if (doneId === s.id && view === 'done') view = 'start';
                    commit(); show('hist-msg', 'Deleted ' + s.name + ', ' + C.fmtDay(s.start, now()) + '.', snap);
                }, { 'aria-label': 'Delete ' + s.name + ', ' + C.fmtDay(s.start, now()) }));
            if (s.id === editId) b.querySelectorAll('button').forEach(x => { x.disabled = true; });
            li.appendChild(b);
            ul.appendChild(li);
        });
        $('hist-more').hidden = fin.length <= histShown;
        $('hist-more').textContent = 'Show older workouts (' + (fin.length - histShown) + ' more)';
    }

    // ---------- progress ----------
    function renderProgress() {
        const u = U();
        $('prog-list').textContent = '';
        const rows = data.exercises.map(ex => ({ ex, st: C.exerciseStats(data, ex.id) }))
            .sort((a, b) => (b.st.last - a.st.last) || a.ex.name.localeCompare(b.ex.name));
        const done = rows.filter(r => r.st.sessions), notDone = rows.filter(r => !r.st.sessions);
        $('prog-empty').hidden = done.length > 0;
        const later = $('prog-later'); later.hidden = !notDone.length;
        $('prog-later-btn').textContent = (laterOpen ? 'Hide' : 'Show') + ' exercises not done yet (' + notDone.length + ')';
        $('prog-later-btn').setAttribute('aria-expanded', String(laterOpen));
        $('prog-later-box').hidden = !laterOpen;
        const ul2 = $('prog-later-list'); ul2.textContent = '';
        rows.forEach(({ ex, st }) => {
            const ul = st.sessions ? $('prog-list') : ul2;
            const li = el('li', 'box prog'); li.id = 'p-' + ex.id;
            const top = el('div', 'box-top'); top.append(el('h3', 'box-name', ex.name), el('span', 'badge', C.KIND_LABEL[ex.kind]));
            li.appendChild(top);
            const be = C.bestEver(data, ex.id, ex.kind);
            if (st.sessions) {
                li.appendChild(el('p', 'box-sub', 'Last done ' + C.ago(st.last, now()) + ' · ' + st.sessions + (st.sessions === 1 ? ' workout' : ' workouts') + ' · ' + st.sets + (st.sets === 1 ? ' set' : ' sets')));
                if (be) { const p = el('p', 'best-set'); p.append(el('b', '', 'Best: ' + C.setText(ex.kind, be.set, u))); const e1 = ex.kind === 'weight' ? C.e1rmText(be.set, u) : ''; p.append((e1 ? ' (' + e1 + ')' : '') + ', ' + C.fmtDay(be.session.start, now())); li.appendChild(p); }
            } else li.appendChild(el('p', 'box-sub', 'Not done yet'));
            const open = openProg.has(ex.id);
            const tg = btn('mini', open ? 'Hide' : 'Show progress', () => { open ? openProg.delete(ex.id) : openProg.add(ex.id); renderProgress(); const t = document.querySelector('#p-' + ex.id + ' .tg'); if (t) t.focus(); }, { 'aria-expanded': String(open), 'aria-label': (open ? 'Hide ' : 'Show progress of ') + ex.name });
            tg.classList.add('tg');
            const bb = el('div', 'box-btns'); bb.appendChild(tg); li.appendChild(bb);
            if (open) li.appendChild(progressDetail(ex, st));
            ul.appendChild(li);
        });
    }
    function progressDetail(ex, st) {
        const u = U(), d = el('div', 'detail');
        const pts = C.progressPoints(data, ex.id, ex.kind, u);
        const label = C.progressLabel(ex.kind, data, ex.id) + (C.progressLabel(ex.kind, data, ex.id).includes('weight') || C.progressLabel(ex.kind, data, ex.id).startsWith('Heaviest') ? ' (' + u + ')' : '');
        d.appendChild(el('h4', 'chart-h', label));
        if (pts.length >= 2) d.appendChild(chart(pts, label, ex.kind));
        else d.appendChild(el('p', 'hint', st.sessions ? 'Do it in one more workout to see a chart.' : 'Do it in 2 workouts to see a chart.'));
        // every workout with it, newest first
        const list = el('ul', 'dl');
        data.sessions.filter(s => s.end).sort((a, b) => b.start - a.start).forEach(s => {
            const e = s.entries.find(x => x.ex === ex.id); if (!e) return;
            const w = e.sets.filter(C.isWork); if (!w.length) return;
            if (list.childNodes.length >= 15) return;
            const li = el('li'); li.append(el('b', '', C.fmtDay(s.start, now()) + ': '), C.setsText(ex.kind, w, u)); list.appendChild(li);
        });
        if (list.childNodes.length) d.appendChild(list);
        // rename
        const nid = 'rn-' + ex.id;
        const lab = el('label', '', 'Name'); lab.htmlFor = nid;
        const row = el('div', 'inline grow');
        const inp = el('input'); inp.type = 'text'; inp.id = nid; inp.maxLength = C.LIMIT.name; inp.value = ex.name; inp.autocomplete = 'off';
        const err = el('p', 'err');
        const saveName = btn('mini strong', 'Rename', () => {
            const n = C.norm(inp.value); err.textContent = '';
            if (!n) { err.textContent = 'Type a name.'; return; }
            const other = C.findExByName(data, n);
            if (other && other.id !== ex.id) { err.textContent = 'You already have an exercise called ' + other.name + '.'; return; }
            const snap = snapshot(), old = ex.name; ex.name = n.slice(0, C.LIMIT.name); commit();
            show('prog-msg', old + ' is now called ' + ex.name + '. Its history stays.', snap);
        }, { 'aria-label': 'Rename ' + ex.name });
        row.append(inp, saveName);
        d.append(lab, row, err);
        // what is logged (only while it has no sets)
        const kid = 'kd-' + ex.id;
        const kl = el('label', '', 'What you log'); kl.htmlFor = kid;
        const ks = el('select'); ks.id = kid;
        C.KINDS.forEach(k => ks.appendChild(new Option(C.KIND_LABEL[k], k)));
        ks.value = ex.kind; ks.disabled = st.sets > 0 || exHasSets(ex.id);
        ks.addEventListener('change', () => { const snap = snapshot(); ex.kind = ks.value; commit(); show('prog-msg', ex.name + ' now logs: ' + C.KIND_LABEL[ex.kind] + '.', snap); });
        d.append(kl, ks);
        if (ks.disabled) d.appendChild(el('p', 'hint', 'This can only be changed before any sets are logged.'));
        d.appendChild(restPicker('rs-' + ex.id, ex.rest, true, v => { ex.rest = v; save(); show('prog-msg', 'Rest after each set of ' + ex.name + ': ' + (v == null ? 'usual (' + C.fmtRest(settings.rest) + ')' : C.fmtRest(v)) + '.'); }));
        // delete
        const inPlans = data.plans.filter(p => p.ex.includes(ex.id)).map(p => p.name);
        d.appendChild(btn('danger', st.sets ? 'Delete ' + ex.name + ' and its ' + st.sets + (st.sets === 1 ? ' set' : ' sets') : 'Delete ' + ex.name, () => {
            if (curSession() && curSession().entries.some(e => e.ex === ex.id)) { show('prog-msg', ex.name + ' is in the workout you have open. Remove it there first.'); return; }
            const snap = snapshot();
            data.exercises = data.exercises.filter(x => x.id !== ex.id);
            data.plans.forEach(p => { p.ex = p.ex.filter(id => id !== ex.id); });
            data.sessions.forEach(s => { s.entries = s.entries.filter(e => e.ex !== ex.id); });
            data.sessions = data.sessions.filter(s => s.entries.length || !s.end || C.setCount(s));
            openProg.delete(ex.id);
            commit(); show('prog-msg', ex.name + ' deleted' + (inPlans.length ? ' and taken out of ' + inPlans.join(', ') : '') + '.', snap);
        }));
        return d;
    }
    const exHasSets = id => data.sessions.some(s => s.entries.some(e => e.ex === id && e.sets.length));

    // a simple line chart, one dot per workout
    function chart(pts, label, kind) {
        const NS = 'http://www.w3.org/2000/svg', W = 320, H = 150, L = 40, R = 10, T = 12, B = 26;
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img');
        const first = pts[0], last = pts[pts.length - 1];
        const fmtV = v => kind === 'time' ? C.fmtSec(v) : C.fmtNum(Math.round(v * 100));
        svg.setAttribute('aria-label', label + ': ' + fmtV(first.v) + ' on ' + C.fmtDay(first.t, now()) + ', ' + fmtV(last.v) + ' on ' + C.fmtDay(last.t, now()) + ', ' + pts.length + ' workouts.');
        // round steps (2.5, 5, 10 ... or 15 s, 30 s, 1 min ...) so the axis reads 70, 75, 80
        const vmin = Math.min(...pts.map(p => p.v)), vmax = Math.max(...pts.map(p => p.v));
        const steps = kind === 'time' ? [5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600] : [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500];
        let stepV = steps[steps.length - 1];
        for (const st of steps) { if (Math.ceil(vmax / st) - Math.floor(vmin / st) <= 4) { stepV = st; break; } }
        let lo = Math.floor(vmin / stepV) * stepV, hi = Math.ceil(vmax / stepV) * stepV;
        if (hi === lo) { hi += stepV; lo = Math.max(0, lo - stepV); }
        const ticks = []; for (let v = lo; v <= hi + 1e-9; v += stepV) ticks.push(v);
        const t0 = first.t, t1 = last.t === first.t ? first.t + 1 : last.t;
        const x = t => L + (t - t0) / (t1 - t0) * (W - L - R), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
        const mk = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k])); if (text != null) e.textContent = text; svg.appendChild(e); return e; };
        ticks.forEach(v => { mk('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }); mk('text', { x: L - 5, y: y(v) + 4, 'text-anchor': 'end', class: 'ax' }, kind === 'time' ? C.fmtSec(v) : C.fmtNum(Math.round(v * 100))); });
        mk('text', { x: L, y: H - 6, 'text-anchor': 'start', class: 'ax' }, C.fmtDay(first.t, now()));
        mk('text', { x: W - R, y: H - 6, 'text-anchor': 'end', class: 'ax' }, C.fmtDay(last.t, now()));
        mk('polyline', { points: pts.map(p => x(p.t).toFixed(1) + ',' + y(p.v).toFixed(1)).join(' '), class: 'ln' });
        pts.forEach(p => { const c = mk('circle', { cx: x(p.t).toFixed(1), cy: y(p.v).toFixed(1), r: 3.5, class: 'dot' }); const t = document.createElementNS(NS, 'title'); t.textContent = C.fmtDay(p.t, now()) + ': ' + fmtV(p.v); c.appendChild(t); });
        return svg;
    }

    // ---------- settings ----------
    function renderSettings() {
        $('unit').value = settings.unit;
        $('week-start').value = String(settings.weekStart);
        $('sound').checked = settings.sound;
        const sel = $('rest');
        if (!sel.options.length) { C.REST_PRESETS.forEach(s => sel.appendChild(new Option(C.fmtRest(s), String(s)))); sel.appendChild(new Option('Other…', 'other')); }
        if (document.activeElement !== sel && document.activeElement !== $('rest-custom')) {
            const preset = C.REST_PRESETS.includes(settings.rest);
            sel.value = preset ? String(settings.rest) : 'other';
            $('rest-custom-row').hidden = preset;
            if (!preset) $('rest-custom').value = String(settings.rest);
        }
    }

    // ---------- rest timer, sound, screen ----------
    let audio = null, restEndedFor = 0;
    function unlockSound() {
        try { if (!audio) { const A = window.AudioContext || window.webkitAudioContext; if (A) audio = new A(); } if (audio && audio.state === 'suspended') audio.resume(); } catch (e) { audio = null; }
    }
    function beep() {
        if (!settings.sound) return;
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* no vibration */ }
        if (!audio) return;
        try {
            [0, 0.25, 0.5].forEach((t, i) => {
                const o = audio.createOscillator(), g = audio.createGain();
                o.frequency.value = i === 2 ? 1320 : 880; o.connect(g); g.connect(audio.destination);
                const s = audio.currentTime + t; g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.35, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
                o.start(s); o.stop(s + 0.2);
            });
        } catch (e) { /* sound blocked */ }
    }
    function tick() {
        const live = liveSession();
        const len = $('s-len'); if (len && live) len.textContent = C.fmtLen(now() - live.start);
        const r = data.live && data.live.rest;
        if (r) {
            const left = (r.ends - now()) / 1000;
            if (left <= 0) {
                data.live.rest = null; save();
                if (restEndedFor !== r.ends && now() - r.ends < 60000) { restEndedFor = r.ends; beep(); say('Rest over. Time for the next set.'); }
                if (view === 'session' && !editId) {
                    renderSession();
                    const ex = C.findEx(data, r.ex); const m = $('exmsg-' + r.ex);
                    if (ex && m && now() - r.ends < 60000) show(m, 'Rest over. Time for the next set.');
                }
            } else {
                const c = $('rest-clock'), f = $('rest-fill');
                if (c) c.textContent = C.clock(left);
                if (f) f.style.width = Math.max(0, Math.min(100, left / r.total * 100)).toFixed(1) + '%';
            }
        }
        updateTitle();
    }
    function updateTitle() {
        const r = data.live && data.live.rest;
        const base = 'Workout Log for the Gym: See What You Lifted Last Time';
        document.title = r && r.ends > now() ? 'Rest ' + C.clock((r.ends - now()) / 1000) + ' · Workout Log' : base;
    }
    let wake = null;
    async function takeWake() {
        try { if ('wakeLock' in navigator && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); } } catch (e) { wake = null; $('s-awake').checked = false; }
    }
    function releaseWake() { try { if (wake) wake.release(); } catch (e) { /* already off */ } wake = null; $('s-awake').checked = false; }

    // ---------- copy, share, files ----------
    function copyText(text, msgId, okText) {
        const done = () => show(msgId, okText), fail = () => { fallbackCopy(text) ? done() : show(msgId, 'Copy did not work here. Use "Share or email" instead.'); };
        try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fail); else fail(); } catch (e) { fail(); }
    }
    function fallbackCopy(text) {
        const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); return ok;
    }
    function shareText(text, subject) {
        if (navigator.share) { navigator.share({ title: subject, text }).catch(() => {}); return; }
        location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
    }
    function download(name, text, type) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    // ---------- events ----------
    document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
        const snap = snapshot(); const made = C.addPreset(data, b.dataset.preset); commit();
        show('today-msg', 'Added ' + made.map(p => p.name).join(', ') + '. Tap Start on the one you are doing today.', snap);
        const f = document.querySelector('#plans .mini.strong'); if (f) f.focus();
    }));
    $('new-plan').addEventListener('click', () => openPlan(null));
    $('start-empty').addEventListener('click', () => startWorkout(null));
    $('add-past').addEventListener('click', addPastWorkout);
    $('plan-form').addEventListener('submit', savePlan);
    $('p-add-btn').addEventListener('click', planAddExercise);
    $('p-new').addEventListener('input', () => { $('p-new-err').textContent = ''; syncKind('p-new', 'p-kind'); });
    $('p-new').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); planAddExercise(); } });
    $('p-cancel').addEventListener('click', () => { planDraft = null; view = 'start'; render(); });
    $('p-delete').addEventListener('click', deletePlan);
    $('s-add-open').addEventListener('click', openAddEx);
    $('s-add-cancel').addEventListener('click', () => { closeAddEx(); $('s-add-open').focus(); });
    $('s-add-btn').addEventListener('click', addExToSession);
    $('s-new').addEventListener('input', () => { $('s-new-err').textContent = ''; syncKind('s-new', 's-kind'); });
    $('s-new').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addExToSession(); } });
    $('s-finish').addEventListener('click', () => editId ? savePast() : finishWorkout());
    $('s-discard').addEventListener('click', () => editId ? cancelPast() : discardWorkout());
    $('s-overnight-finish').addEventListener('click', () => { const s = liveSession(); if (!s) return; if (C.setCount(s)) finishWorkout(C.lastSetAt(s)); else discardWorkout(); });
    $('s-overnight-keep').addEventListener('click', () => { overnightOk = now(); renderSession(); });
    $('s-awake').addEventListener('change', () => { if ($('s-awake').checked) takeWake(); else releaseWake(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if ($('s-awake').checked && liveSession()) takeWake(); tick(); } });
    $('d-copy').addEventListener('click', () => { const s = findSession(doneId); if (s) copyText(C.sessionTextPlain(data, s, U(), now()), 'today-msg', 'Workout copied.'); });
    $('d-share').addEventListener('click', () => { const s = findSession(doneId); if (s) shareText(C.sessionTextPlain(data, s, U(), now()), 'My workout: ' + s.name + ', ' + C.fmtDay(s.start, now())); });
    $('d-undo').addEventListener('click', () => {
        const s = findSession(doneId); if (!s || liveSession()) return;
        s.end = null; data.live = { id: s.id, rest: null }; view = 'session'; overnightOk = now(); commit();
    });
    $('d-close').addEventListener('click', () => { view = 'start'; doneId = null; render(); $('today').scrollIntoView({ block: 'start' }); });
    $('prog-later-btn').addEventListener('click', () => { laterOpen = !laterOpen; renderProgress(); $('prog-later-btn').focus(); });
    $('hist-more').addEventListener('click', () => { histShown += 10; renderHistory(); });
    // settings
    $('unit').addEventListener('change', () => { settings.unit = $('unit').value; Object.keys(drafts).forEach(k => delete drafts[k]); commit(); show('set-msg', 'Weights now shown in ' + settings.unit + '.'); });
    $('week-start').addEventListener('change', () => { settings.weekStart = +$('week-start').value; commit(); });
    $('sound').addEventListener('change', () => { settings.sound = $('sound').checked; save(); if (settings.sound) { unlockSound(); beep(); } });
    $('rest').addEventListener('change', () => {
        const v = $('rest').value; $('rest-err').textContent = '';
        $('rest-custom-row').hidden = v !== 'other';
        if (v === 'other') { $('rest-custom').value = String(settings.rest || 90); $('rest-custom').focus(); return; }
        settings.rest = +v; commit(); show('set-msg', 'Rest after each set: ' + C.fmtRest(settings.rest) + '.');
    });
    $('rest-custom').addEventListener('change', () => {
        const v = $('rest-custom').value.trim(); $('rest-err').textContent = '';
        if (!/^\d+$/.test(v) || +v < C.LIMIT.minRest || +v > C.LIMIT.maxRest) { $('rest-err').textContent = 'Type a number of seconds from 5 to 900.'; return; }
        settings.rest = +v; commit(); show('set-msg', 'Rest after each set: ' + C.fmtRest(settings.rest) + '.');
    });
    $('backup').addEventListener('click', () => {
        download('workout-log-backup-' + C.isoDay(now()) + '.json', JSON.stringify({ app: SLUG, v: 1, saved: new Date(now()).toISOString(), settings, data }, null, 1), 'application/json');
        show('set-msg', 'Backup file saved. Keep it somewhere safe, like your email or cloud drive.');
    });
    $('csv').addEventListener('click', () => {
        if (!C.finishedSessions(data).length) { show('set-msg', 'There are no finished workouts to download yet.'); return; }
        download('workout-log-' + C.isoDay(now()) + '.csv', C.csv(data, U()), 'text/csv'); show('set-msg', 'CSV file saved.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; $('restore-file').value = '';
        if (!f) return;
        if (f.size > 20e6) { show('set-msg', 'That file is too big to be a Workout Log backup.'); return; }
        const r = new FileReader();
        r.onload = () => {
            let o = null; try { o = JSON.parse(r.result); } catch (e) { o = null; }
            const d = o && o.app === SLUG ? C.validate(o.data) : null;
            if (!d) { show('set-msg', 'This file is not a Workout Log backup, so nothing was changed.'); return; }
            const snap = snapshot();
            data = d;
            if (o.settings && typeof o.settings === 'object') { try { localStorage.setItem(SKEY, JSON.stringify(o.settings)); } catch (e) { /* keep current */ } const s2 = loadSettingsFrom(o.settings); if (s2) settings = s2; }
            editId = null; view = 'start'; doneId = null;
            commit();
            const n = C.finishedSessions(data).length;
            show('set-msg', 'Restored ' + n + (n === 1 ? ' workout' : ' workouts') + ' and ' + data.plans.length + (data.plans.length === 1 ? ' plan.' : ' plans.'), snap);
        };
        r.onerror = () => show('set-msg', 'The file could not be read.');
        r.readAsText(f);
    });
    function loadSettingsFrom(o) {
        const s = Object.assign({}, settings);
        if (o.unit === 'kg' || o.unit === 'lb') s.unit = o.unit;
        if (Number.isInteger(o.rest) && o.rest >= 0 && o.rest <= C.LIMIT.maxRest) s.rest = o.rest;
        if (typeof o.sound === 'boolean') s.sound = o.sound;
        if ([0, 1, 6].includes(o.weekStart)) s.weekStart = o.weekStart;
        return s;
    }
    $('wipe').addEventListener('click', () => {
        if (!data.sessions.length && !data.plans.length && !data.exercises.length) { show('set-msg', 'There is nothing to delete.'); return; }
        const snap = snapshot();
        releaseWake();
        data = C.emptyData(); view = 'start'; editId = null; doneId = null; openProg.clear();
        commit(); show('set-msg', 'Everything was deleted.', snap);
    });

    // ---------- start ----------
    const sr = el('div', 'sr-only'); sr.id = 'sr-live'; sr.setAttribute('aria-live', 'polite'); document.body.appendChild(sr);
    if (!canSave) $('storage-warn').hidden = false;
    render();
    if (loadNote) show('today-msg', loadNote);
    setInterval(tick, 250);
    // a new minute or a new day while the page stays open
    let lastMin = Math.floor(now() / 60000);
    setInterval(() => { const m = Math.floor(now() / 60000); if (m !== lastMin) { lastMin = m; if (view === 'session') { const s = $('s-overnight'); const before = s.hidden; renderSessionMetaOnly(before); } else if (view === 'start') renderStart(); renderHistory(); } }, 5000);
    function renderSessionMetaOnly() {
        const live = liveSession(); if (!live || editId) return;
        const last = C.lastSetAt(live) || live.start;
        if (now() - last > OVERNIGHT_MS && now() - overnightOk > OVERNIGHT_MS && $('s-overnight').hidden) renderSession();
    }

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
