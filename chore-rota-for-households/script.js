// Chore Rota for Households: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.ChoreCore;
    const KEY = 'chore-rota-for-households.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const EXAMPLES = [
        ['Clean the bathroom', 3, 1], ['Clean the kitchen', 2, 1], ['Hoover and mop the floors', 2, 1], ['Take out the bins', 1, 1],
        ['Recycling', 1, 1], ['Washing up', 3, 'd'], ['Tidy the living room', 1, 1], ['Clean the fridge', 2, 4]
    ];

    let canSave = true, state, today, cw, vw;
    let openChange = null;      // "week:choreId" of the job whose Change list is open
    let renaming = null;        // id of the person being renamed
    let editing = null;         // id of the chore in the form, or 0 for a new one
    let formEffort = 2;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            show('set-msg', 'The saved rota could not be read, so the app started fresh.');
        }
        return C.emptyState(1, C.todayKey());
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; setToday(); vw = cw; commit(); }

    // ---------- messages with Undo ----------
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        ['week-msg', 'people-msg', 'chores-msg', 'set-msg'].forEach(o => { if (o !== id) clearMsg(o); });
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
    function setToday() { today = C.todayKey(); cw = C.weekOf(today, state.weekStart); }
    const live = () => C.livePeople(state);
    const liveChores = () => C.liveChores(state);
    const person = id => state.people.find(p => p.id === id);
    const chore = id => state.chores.find(c => c.id === id);
    const sameName = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
    function freshStart() { if (!state.people.length && !state.chores.length) { state.start = cw; state.frozen = {}; state.overrides = {}; state.done = {}; } }
    function commit() { save(); render(); }
    function weekTitle(k) {
        const d = C.weeksBetween(cw, k);
        return d === 0 ? 'This week' : d === 1 ? 'Next week' : d === -1 ? 'Last week' : 'Week of ' + C.shortDate(k, k.slice(0, 4) !== today.slice(0, 4));
    }
    function whenText(k) { const d = C.weeksBetween(cw, k); return d === 0 ? 'this week' : d === 1 ? 'next week' : d === -1 ? 'last week' : 'in the week of ' + C.shortDate(k); }
    function relWeek(k) { const d = C.weeksBetween(cw, k); return d === 0 ? 'This week' : d === 1 ? 'Next week' : d === -1 ? 'Last week' : d > 1 ? 'In ' + d + ' weeks' : -d + ' weeks ago'; }
    const effortText = e => C.EFFORT[e] + ' · ' + e + (e === 1 ? ' point' : ' points');

    // ---------- people ----------
    function addPeople() {
        const input = $('p-name'), names = C.splitNames(input.value), err = $('p-name-err');
        err.textContent = ''; input.removeAttribute('aria-invalid');
        if (!names.length) { err.textContent = 'Type a name first.'; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
        const added = [], skipped = [];
        const before = snapshot();
        freshStart(); C.freeze(state, cw);
        names.forEach(n => {
            if (live().some(p => sameName(p.name, n))) { skipped.push(n + ' (already added)'); return; }
            if (live().length >= C.MAX_PEOPLE) { skipped.push(n + ' (20 people is the most)'); return; }
            state.people.push({ id: state.nextId++, name: n, from: cw, away: [] }); added.push(n);
        });
        if (!added.length) {
            state = C.validate(JSON.parse(before));
            err.textContent = names.length === 1 && skipped[0].includes('already') ? 'There is already someone called ' + names[0] + '.' : 'Not added: ' + skipped.join(', ') + '.';
            input.setAttribute('aria-invalid', 'true'); input.focus(); return;
        }
        input.value = '';
        commit();
        show('people-msg', 'Added ' + C.listJoin(added) + '.' + (skipped.length ? ' Not added: ' + skipped.join(', ') + '.' : ''));
        input.focus();
    }
    function renamePerson(id, value) {
        const p = person(id), name = C.cleanName(value, 30), err = $('rn-err');
        if (!name) { err.textContent = 'Type a name.'; return false; }
        if (live().some(q => q.id !== id && sameName(q.name, name))) { err.textContent = 'There is already someone called ' + name + '.'; return false; }
        p.name = name; renaming = null; commit(); show('people-msg', 'Renamed to ' + name + '.'); return true;
    }
    function removePerson(id) {
        const before = snapshot(), p = person(id);
        C.freeze(state, cw);
        p.removed = cw;
        state.chores.forEach(c => { if (c.only) { c.only = c.only.filter(x => x !== id); if (!c.only.length) c.only = null; } });
        Object.keys(state.overrides).forEach(k => { if (k >= cw) Object.keys(state.overrides[k]).forEach(cid => { if (state.overrides[k][cid] === id) delete state.overrides[k][cid]; }); });
        commit(); show('people-msg', p.name + ' is off the rota from this week.', before);
    }
    function toggleAway(id, wk) {
        if (wk < cw) return;
        const p = person(id), i = p.away.indexOf(wk);
        if (i >= 0) p.away.splice(i, 1);
        else {
            p.away.push(wk); p.away.sort();
            const ov = state.overrides[wk]; if (ov) Object.keys(ov).forEach(cid => { if (ov[cid] === id) delete ov[cid]; });
        }
        commit();
        show('week-msg', i >= 0 ? p.name + ' is home ' + whenText(wk) + '.' : p.name + ' is away. Their jobs went to the others.');
    }

    // ---------- chores ----------
    function openForm(id) {
        editing = id || 0;
        const c = id ? chore(id) : null;
        $('c-form').hidden = false; $('c-open').hidden = true;
        $('c-form-h').textContent = c ? 'Edit chore' : 'Add a chore';
        $('c-save').textContent = c ? 'Save chore' : 'Add chore';
        $('c-name').value = c ? c.name : '';
        const ev = c ? (c.daily ? 'd' : [1, 2, 4].includes(c.every) ? String(c.every) : 'c') : '1';
        $('c-every').value = ev; $('c-weeks').value = c && ev === 'c' ? String(c.every) : '3'; $('c-custom').hidden = ev !== 'c';
        setEffort(c ? c.effort : 2);
        ['c-name-err', 'c-weeks-err', 'c-only-err'].forEach(e => { $(e).textContent = ''; });
        $('c-name').removeAttribute('aria-invalid'); $('c-weeks').removeAttribute('aria-invalid');
        const list = $('c-only-list'); list.textContent = '';
        live().forEach(p => {
            const lab = el('label', 'check'), box = el('input'); box.type = 'checkbox'; box.value = p.id;
            box.checked = !c || !c.only || c.only.includes(p.id);
            lab.append(box, el('span', 'j-name', p.name)); list.appendChild(lab);
        });
        const some = !!(c && c.only);
        $('c-only').hidden = !some; $('c-only-open').hidden = some || !live().length;
        $('c-name').focus();
    }
    function closeForm() { editing = null; $('c-form').hidden = true; $('c-open').hidden = false; }
    function setEffort(e) { formEffort = e; document.querySelectorAll('#c-effort .chip').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.e === e))); }
    function saveChore() {
        const name = C.cleanName($('c-name').value, 40), ev = $('c-every').value;
        let ok = true;
        ['c-name-err', 'c-weeks-err', 'c-only-err'].forEach(e => { $(e).textContent = ''; });
        $('c-name').removeAttribute('aria-invalid'); $('c-weeks').removeAttribute('aria-invalid');
        if (!name) { $('c-name-err').textContent = 'Type the chore, for example "Clean the bathroom".'; ok = false; }
        else if (liveChores().some(c => c.id !== editing && sameName(c.name, name))) { $('c-name-err').textContent = 'There is already a chore called ' + name + '.'; ok = false; }
        if (!ok) $('c-name').setAttribute('aria-invalid', 'true');
        let every = 1;
        if (ev === 'c') { every = C.parseEvery($('c-weeks').value); if (!every) { $('c-weeks-err').textContent = 'Type a whole number of weeks from 1 to 12.'; $('c-weeks').setAttribute('aria-invalid', 'true'); ok = false; } }
        else if (ev !== 'd') every = +ev;
        let only = null;
        if (!$('c-only').hidden) {
            const ticked = [...document.querySelectorAll('#c-only-list input:checked')].map(b => +b.value);
            if (!ticked.length) { $('c-only-err').textContent = 'Tick at least one person.'; ok = false; }
            else if (ticked.length < live().length) only = ticked;
        }
        if (!ok) { const first = document.querySelector('#c-form [aria-invalid="true"]') || $('c-only'); if (first.focus) first.focus(); return; }
        if (!editing && liveChores().length >= C.MAX_CHORES) { $('c-name-err').textContent = '40 chores is the most.'; return; }
        const before = snapshot();
        freshStart(); C.freeze(state, cw);
        const data = { name, every: ev === 'd' ? 1 : every, daily: ev === 'd', effort: formEffort, only };
        if (editing) Object.assign(chore(editing), data);
        else state.chores.push(Object.assign({ id: state.nextId++, from: cw }, data));
        const wasEdit = !!editing;
        closeForm(); commit();
        show('chores-msg', (wasEdit ? 'Saved ' : 'Added ') + name + '.', wasEdit ? before : null);
        $('c-open').focus();
    }
    function removeChore(id) {
        const before = snapshot(), c = chore(id);
        C.freeze(state, cw); c.removed = cw;
        if (editing === id) closeForm();
        commit(); show('chores-msg', c.name + ' is off the rota from this week.', before);
    }
    function addExamples() {
        const before = snapshot();
        freshStart(); C.freeze(state, cw);
        let n = 0;
        EXAMPLES.forEach(([name, effort, ev]) => {
            if (liveChores().some(c => sameName(c.name, name)) || liveChores().length >= C.MAX_CHORES) return;
            state.chores.push({ id: state.nextId++, name, effort, every: ev === 'd' ? 1 : ev, daily: ev === 'd', only: null, from: cw }); n++;
        });
        commit(); show('chores-msg', 'Added ' + n + ' example chores. Edit or remove any that do not fit your home.', before);
    }

    // ---------- this week ----------
    function setOverride(wk, cid, value, base) {
        state.overrides[wk] = state.overrides[wk] || {};
        if (value === 'rota' || +value === base) delete state.overrides[wk][cid]; else state.overrides[wk][cid] = +value;
        if (!Object.keys(state.overrides[wk]).length) delete state.overrides[wk];
        openChange = null; commit();
        const who = +value === base || value === 'rota' ? (person(base) || {}).name : person(+value).name;
        show('week-msg', chore(cid).name + ': ' + (who || 'nobody') + ' does it ' + whenText(wk) + '.');
    }
    function toggleDone(wk, cid, on) {
        if (wk > cw) return;
        state.done[wk] = state.done[wk] || {};
        if (on) state.done[wk][cid] = true; else delete state.done[wk][cid];
        if (!Object.keys(state.done[wk]).length) delete state.done[wk];
        commit();
    }
    function jobItem(job, view, ownerId) {
        const li = el('li', 'job' + (job.done ? ' done' : '')), row = el('div', 'job-row');
        const lab = el('label', 'check'), box = el('input');
        box.type = 'checkbox'; box.checked = job.done; box.disabled = view.week > cw;
        if (box.disabled) lab.title = 'Jobs can be ticked in this week or earlier weeks';
        box.addEventListener('change', () => toggleDone(view.week, job.id, box.checked));
        const txt = el('span', 'j-text'); txt.appendChild(el('span', 'j-name', job.name));
        const meta = el('span', 'j-meta', C.EFFORT[job.effort] + ' · ' + job.freq);
        if (job.swapped) { const b = person(job.base); meta.appendChild(document.createTextNode(' · ')); meta.appendChild(el('span', 'sw', 'swapped' + (b ? ', rota said ' + b.name : ''))); }
        txt.appendChild(meta); lab.append(box, txt); row.appendChild(lab);
        const key = view.week + ':' + job.id;
        const ch = el('button', 'change-btn', openChange === key ? 'Close' : 'Change'); ch.type = 'button';
        ch.setAttribute('aria-label', (openChange === key ? 'Close' : 'Change who does ') + (openChange === key ? '' : job.name));
        ch.setAttribute('aria-expanded', String(openChange === key));
        ch.addEventListener('click', () => { openChange = openChange === key ? null : key; render(); const s = $('sel-' + job.id); if (s) s.focus(); });
        row.appendChild(ch); li.appendChild(row);
        if (openChange === key) {
            const wrap = el('div', 'change-wrap'), l = el('label', null, 'Who does it ' + whenText(view.week)), sel = el('select');
            sel.id = 'sel-' + job.id; l.htmlFor = sel.id;
            const homeP = state.people.filter(p => C.isHome(p, view.week));
            if (ownerId == null) { const o = el('option', null, 'Nobody free'); o.value = ''; o.disabled = true; sel.appendChild(o); }
            homeP.forEach(p => { const o = el('option', null, p.name + (p.id === job.base && job.swapped ? ' (the rota)' : '')); o.value = p.id; sel.appendChild(o); });
            sel.value = ownerId == null ? '' : String(ownerId);
            sel.addEventListener('change', () => setOverride(view.week, job.id, sel.value, job.base));
            wrap.append(l, sel);
            if (job.swapped) { const back = el('button', 'link', 'Back to the rota (' + ((person(job.base) || {}).name || 'nobody') + ')'); back.type = 'button'; back.addEventListener('click', () => setOverride(view.week, job.id, 'rota', job.base)); wrap.appendChild(back); }
            li.appendChild(wrap);
        }
        return li;
    }
    function renderWeek() {
        const ready = live().length > 0 && liveChores().length > 0;
        $('app').classList.toggle('setup', !ready);
        $('week-h').textContent = weekTitle(vw);
        $('week-range').textContent = C.weekRange(vw, today);
        $('prev').disabled = vw <= state.start;
        $('next').disabled = C.weeksBetween(cw, vw) >= 104;
        $('this-week').hidden = vw === cw;
        $('start-here').hidden = ready;
        $('step-people').classList.toggle('ok', live().length > 0);
        $('step-chores').classList.toggle('ok', liveChores().length > 0);
        const list = $('who-list'); list.textContent = '';
        const nob = $('nobody-jobs'); nob.textContent = '';
        $('week-tools').hidden = !ready; $('nobody').hidden = true; $('bar').hidden = true; $('last-note').hidden = true;
        if (!ready) { $('week-sum').textContent = ''; return; }
        const view = C.weekView(state, vw);
        view.people.forEach(p => {
            const li = el('li', 'person-box' + (p.away ? ' away' : '')), head = el('div', 'p-head'), nw = el('div', 'p-name-wrap');
            nw.appendChild(el('h3', null, p.name));
            const pts = p.jobs.reduce((t, j) => t + j.effort, 0);
            if (p.jobs.length) nw.appendChild(el('span', 'p-pts', p.jobs.length + (p.jobs.length === 1 ? ' job · ' : ' jobs · ') + pts + (pts === 1 ? ' point' : ' points')));
            head.appendChild(nw);
            if (!p.gone) {
                if (vw >= cw) {
                    const b = el('button', 'away-btn', p.away ? 'Away: tap if home' : 'Mark away'); b.type = 'button';
                    b.setAttribute('aria-pressed', String(p.away)); b.setAttribute('aria-label', p.name + ' away ' + (vw === cw ? 'this week' : 'that week'));
                    b.addEventListener('click', () => toggleAway(p.id, vw)); head.appendChild(b);
                } else if (p.away) head.appendChild(el('span', 'badge', 'Was away'));
            }
            li.appendChild(head);
            if (!p.jobs.length) li.appendChild(el('p', 'p-off', p.away ? 'Away. Their jobs go to the people at home.' : 'Nothing this week. A week off!'));
            const ul = el('ul', 'jobs'); p.jobs.sort((a, b) => b.effort - a.effort).forEach(j => ul.appendChild(jobItem(j, view, p.id))); li.appendChild(ul);
            list.appendChild(li);
        });
        if (view.unassigned.length) { $('nobody').hidden = false; view.unassigned.forEach(j => nob.appendChild(jobItem(j, view, null))); }
        const sum = $('week-sum'), past = vw <= cw;
        sum.classList.remove('good');
        const home = view.people.filter(p => !p.away).length;
        if (!view.count) sum.textContent = 'No chores are due ' + (vw === cw ? 'this week.' : 'that week.');
        else if (!home) sum.textContent = 'Everyone is away. ' + view.count + (view.count === 1 ? ' job has' : ' jobs have') + ' nobody to do ' + (view.count === 1 ? 'it.' : 'them.');
        else if (past && view.done === view.count) { sum.textContent = 'All ' + view.count + ' jobs done. Well done, everyone!'; sum.classList.add('good'); }
        else sum.textContent = home + (home === 1 ? ' person shares ' : ' people share ') + view.count + (view.count === 1 ? ' job' : ' jobs') + (past ? ' · ' + view.done + ' done' : '') + '.';
        if (past && view.count) { $('bar').hidden = false; $('bar-fill').style.width = Math.round(100 * view.done / view.count) + '%'; }
        // jobs not ticked last week, only when the household uses the ticks
        if (vw === cw) {
            const lw = C.addWeeks(cw, -1);
            if (lw >= state.start) {
                const lv = C.weekView(state, lw);
                if (lv.done > 0 && lv.done < lv.count) {
                    const missed = [];
                    lv.people.forEach(p => p.jobs.forEach(j => { if (!j.done) missed.push(j.name + ' (' + p.name + ')'); }));
                    lv.unassigned.forEach(j => { if (!j.done) missed.push(j.name); });
                    $('last-note').textContent = 'Not ticked last week: ' + missed.join(', ') + '.';
                    $('last-note').hidden = false;
                }
            }
        }
        const text = C.weekText(state, vw, today);
        $('email').href = 'mailto:?subject=' + encodeURIComponent('Chore rota, ' + C.weekRange(vw, today)) + '&body=' + encodeURIComponent(text + '\n');
        $('copy').textContent = vw === cw ? 'Copy this week' : 'Copy this rota';
        $('share').textContent = vw === cw ? 'Share this week' : 'Share this rota';
        $('email').textContent = vw === cw ? 'Email this week' : 'Email this rota';
    }
    function renderComing() {
        const ready = live().length > 0 && liveChores().length > 0;
        $('coming').hidden = !ready;
        const ol = $('coming-list'); ol.textContent = '';
        if (!ready) return;
        const end = C.addWeeks(vw, 4), r = C.compute(state, end);
        for (let i = 1; i <= 4; i++) {
            const wk = C.addWeeks(vw, i), v = C.weekView(state, wk, r);
            const li = el('li'), b = el('button', 'coming-week'); b.type = 'button';
            b.appendChild(el('span', 'cw-h', relWeek(wk) + ': ' + C.weekRange(wk, today)));
            v.people.forEach(p => {
                const line = el('span', 'cw-line' + (p.jobs.length ? '' : ' off'));
                line.appendChild(el('b', null, p.name + ': '));
                line.appendChild(document.createTextNode(p.away && !p.jobs.length ? 'away' : p.jobs.length ? p.jobs.map(j => j.name).join(', ') : 'week off'));
                b.appendChild(line);
            });
            if (v.unassigned.length) b.appendChild(el('span', 'cw-line', 'Nobody free: ' + v.unassigned.map(j => j.name).join(', ')));
            b.setAttribute('aria-label', 'Open ' + C.weekRange(wk, today));
            b.addEventListener('click', () => { vw = wk; openChange = null; render(); $('week').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('week-h').focus({ preventScroll: true }); });
            li.appendChild(b); ol.appendChild(li);
        }
    }
    function renderPeople() {
        const ul = $('people-list'); ul.textContent = '';
        const st = C.stats(state, cw);
        live().forEach(p => {
            const li = el('li', 'box'), top = el('div', 'box-top');
            top.appendChild(el('h3', 'box-name', p.name)); li.appendChild(top);
            const s = st[p.id] || { jobs: 0, points: 0, away: 0 };
            li.appendChild(el('p', 'box-sub', 'So far, with this week: ' + s.jobs + (s.jobs === 1 ? ' job, ' : ' jobs, ') + s.points + (s.points === 1 ? ' point' : ' points') +
                (s.away ? ' · away ' + s.away + (s.away === 1 ? ' week' : ' weeks') : '')));
            if (renaming === p.id) {
                const row = el('div', 'rename-row'), inp = el('input'), ok = el('button', 'primary small', 'Save'), no = el('button', 'secondary small', 'Cancel');
                inp.type = 'text'; inp.id = 'rn-input'; inp.maxLength = 30; inp.value = p.name; inp.autocomplete = 'off'; inp.setAttribute('aria-label', 'New name for ' + p.name); inp.setAttribute('aria-describedby', 'rn-err');
                ok.type = no.type = 'button';
                ok.addEventListener('click', () => renamePerson(p.id, inp.value));
                inp.addEventListener('keydown', e => { if (e.key === 'Enter') renamePerson(p.id, inp.value); if (e.key === 'Escape') { renaming = null; render(); } });
                no.addEventListener('click', () => { renaming = null; render(); });
                row.append(inp, ok, no); li.appendChild(row);
                const err = el('p', 'err'); err.id = 'rn-err'; err.setAttribute('role', 'alert'); li.appendChild(err);
            } else {
                const btns = el('div', 'box-btns'), rn = el('button', 'secondary small', 'Rename'), rm = el('button', 'secondary small', 'Remove');
                rn.type = rm.type = 'button';
                rn.setAttribute('aria-label', 'Rename ' + p.name); rm.setAttribute('aria-label', 'Remove ' + p.name);
                rn.addEventListener('click', () => { renaming = p.id; render(); const i = $('rn-input'); if (i) { i.focus(); i.select(); } });
                rm.addEventListener('click', () => removePerson(p.id));
                btns.append(rn, rm); li.appendChild(btns);
            }
            ul.appendChild(li);
        });
        $('p-name').placeholder = live().length ? 'Name, e.g. Sam' : 'Names, e.g. Ali, Sam, Zoe';
    }
    function renderChores() {
        const ul = $('chore-list'); ul.textContent = '';
        const names = new Map(state.people.map(p => [p.id, p.name]));
        liveChores().forEach(c => {
            const li = el('li', 'box'), top = el('div', 'box-top');
            top.append(el('h3', 'box-name', c.name), el('span', 'badge', effortText(c.effort))); li.appendChild(top);
            const freq = c.daily ? 'Every day, one person for the whole week' : c.every === 1 ? 'Every week' : 'Every ' + c.every + ' weeks';
            li.appendChild(el('p', 'box-sub', freq + ' · ' + (c.only ? 'only ' + C.listJoin(c.only.map(id => names.get(id))) : 'anyone')));
            const btns = el('div', 'box-btns'), ed = el('button', 'secondary small', 'Edit'), rm = el('button', 'secondary small', 'Remove');
            ed.type = rm.type = 'button'; ed.setAttribute('aria-label', 'Edit ' + c.name); rm.setAttribute('aria-label', 'Remove ' + c.name);
            ed.addEventListener('click', () => { openForm(c.id); $('c-form').scrollIntoView({ block: 'nearest' }); });
            rm.addEventListener('click', () => removeChore(c.id));
            btns.append(ed, rm); li.appendChild(btns); ul.appendChild(li);
        });
        $('examples').hidden = liveChores().length > 0;
        if (!$('c-form').hidden) $('c-only-open').hidden = !$('c-only').hidden || !live().length;
    }
    function render() {
        if (!state.people.some(p => p.id === renaming && !p.removed)) renaming = null;
        renderWeek(); renderComing(); renderPeople(); renderChores();
        $('wstart').value = String(state.weekStart);
        $('restart').disabled = !(live().length && liveChores().length) || state.start === cw && !Object.keys(state.frozen).length;
        $('storage-warn').hidden = canSave;
    }

    // ---------- copy, share, print ----------
    function copyText(text) {
        const done = () => show('week-msg', 'Copied. Paste it in your group chat.');
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove(); ok ? done() : show('week-msg', 'Copying is blocked here. Use "Email this week" instead.');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function buildPrint() {
        const area = $('print-area'); area.textContent = '';
        area.appendChild(el('h1', null, 'Chore rota'));
        const r = C.compute(state, C.addWeeks(vw, 3));
        for (let i = 0; i < 4; i++) {
            const wk = C.addWeeks(vw, i), v = C.weekView(state, wk, r), sec = el('section', 'pw'), table = el('table');
            sec.appendChild(el('h2', null, C.weekRange(wk, today)));
            v.people.forEach(p => {
                const tr = el('tr'), td = el('td'); tr.appendChild(el('th', null, p.name));
                if (!p.jobs.length) td.textContent = p.away ? 'Away' : 'Week off';
                p.jobs.forEach(j => { const s = el('span', 'job'); s.append(el('span', 'tick'), document.createTextNode(j.name)); td.appendChild(s); });
                tr.appendChild(td); table.appendChild(tr);
            });
            if (v.unassigned.length) { const tr = el('tr'); tr.append(el('th', null, 'Nobody free'), el('td', null, v.unassigned.map(j => j.name).join(', '))); table.appendChild(tr); }
            sec.appendChild(table); area.appendChild(sec);
        }
    }

    // ---------- settings ----------
    function restart(ws) {
        const before = snapshot();
        if (ws != null) state.weekStart = ws;
        setToday();
        state.start = cw; state.frozen = {};
        state.people = state.people.filter(p => !p.removed); state.chores = state.chores.filter(c => !c.removed);
        state.people.forEach(p => { p.from = cw; p.away = p.away.filter(k => k >= cw && C.weekOf(k, state.weekStart) === k); });
        state.chores.forEach(c => { c.from = cw; });
        const keep = m => { const o = {}; Object.keys(m).forEach(k => { if (k >= cw && C.weekOf(k, state.weekStart) === k) o[k] = m[k]; }); return o; };
        state.overrides = keep(state.overrides); state.done = keep(state.done);
        state = C.validate(state);
        vw = cw; openChange = null; commit();
        show('set-msg', ws != null ? 'Weeks now start on ' + C.DAY_NAMES[ws] + '. The rota starts again from this week.' : 'The rota starts again from this week.', before);
    }
    function backup() {
        const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'chore-rota-' + today + '.json';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        show('set-msg', 'Backup file saved. Keep it somewhere safe, or open it on another device with "Restore a backup".');
    }
    function restoreFile(file) {
        if (!file) return;
        if (file.size > 3e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
        const reader = new FileReader();
        reader.onload = () => {
            let s = null; try { s = C.validate(JSON.parse(reader.result)); } catch (e) { s = null; }
            if (!s) { show('set-msg', 'That file is not a backup from this app, so nothing changed.'); return; }
            const before = snapshot(); state = s; setToday(); vw = cw; openChange = null; closeForm(); commit();
            show('set-msg', 'Backup restored: ' + live().length + ' people and ' + liveChores().length + ' chores.', before);
        };
        reader.onerror = () => show('set-msg', 'That file could not be read.');
        reader.readAsText(file);
    }

    // ---------- start ----------
    state = load(); setToday(); vw = cw;
    C.DAY_NAMES.forEach((d, i) => { const o = el('option', null, d); o.value = i; $('wstart').appendChild(o); });
    // Monday first in the list
    $('wstart').appendChild($('wstart').options[0]);

    $('p-add').addEventListener('click', addPeople);
    $('p-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPeople(); } });
    $('p-name').addEventListener('input', () => { $('p-name-err').textContent = ''; $('p-name').removeAttribute('aria-invalid'); });
    $('c-open').addEventListener('click', () => openForm(0));
    $('c-cancel').addEventListener('click', () => { closeForm(); $('c-open').focus(); });
    $('c-save').addEventListener('click', saveChore);
    $('c-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveChore(); } });
    $('c-weeks').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveChore(); } });
    $('c-every').addEventListener('change', () => { $('c-custom').hidden = $('c-every').value !== 'c'; if ($('c-every').value === 'c') $('c-weeks').focus(); });
    document.querySelectorAll('#c-effort .chip').forEach(b => b.addEventListener('click', () => setEffort(+b.dataset.e)));
    $('c-effort').addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault(); const n = Math.min(3, Math.max(1, formEffort + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1)));
        setEffort(n); document.querySelector('#c-effort .chip[data-e="' + n + '"]').focus();
    });
    $('c-only-open').addEventListener('click', () => { $('c-only').hidden = false; $('c-only-open').hidden = true; const f = document.querySelector('#c-only-list input'); if (f) f.focus(); });
    $('examples').addEventListener('click', addExamples);
    $('prev').addEventListener('click', () => { if (vw > state.start) { vw = C.addWeeks(vw, -1); openChange = null; render(); } });
    $('next').addEventListener('click', () => { vw = C.addWeeks(vw, 1); openChange = null; render(); });
    $('this-week').addEventListener('click', () => { vw = cw; openChange = null; render(); $('prev').focus(); });
    $('copy').addEventListener('click', () => copyText(C.weekText(state, vw, today)));
    if (navigator.share) {
        $('share').hidden = false;
        $('share').addEventListener('click', () => { navigator.share({ title: 'Chore rota', text: C.weekText(state, vw, today) }).catch(() => {}); });
    }
    $('print').addEventListener('click', () => { buildPrint(); window.print(); });
    window.addEventListener('beforeprint', buildPrint);
    $('wstart').addEventListener('change', () => restart(+$('wstart').value));
    $('restart').addEventListener('click', () => restart(null));
    $('backup').addEventListener('click', backup);
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', e => { restoreFile(e.target.files[0]); e.target.value = ''; });
    $('wipe').addEventListener('click', () => {
        const before = snapshot(); state = C.emptyState(state.weekStart, C.todayKey()); setToday(); vw = cw; openChange = null; closeForm(); commit();
        show('set-msg', 'Everything is deleted.', before);
    });
    $('week-h').tabIndex = -1;

    // the rota moves on by itself when a new week starts
    setInterval(() => {
        const t = C.todayKey(); if (t === today) return;
        const old = cw; setToday(); if (vw === old) vw = cw; if (vw < state.start) vw = state.start; render();
    }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayKey() !== today) { const old = cw; setToday(); if (vw === old) vw = cw; render(); } });

    render(); save();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
