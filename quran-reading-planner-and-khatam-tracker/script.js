// Quran Reading Planner and Khatam Tracker: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.QuranCore;
    const KEY = 'quran-reading-planner-and-khatam-tracker.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };

    let canSave = true, state, today = C.todayIso();
    let editingPlan = false;      // the plan form is open over an existing plan
    let renaming = 0;             // id of the person being renamed in the group khatam

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved reading could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; editingPlan = false; renaming = 0; commit(); if (!state.plan) openPlan(true); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['today-msg', 'k-msg', 'g-msg', 'set-msg'];
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        MSGS.forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) box.appendChild(btn('undo', 'Undo', () => { restoreSnap(undoSnap); show(id, 'Undone.'); }));
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
        return Promise.resolve(fallbackCopy(text));
    }
    function fallbackCopy(text) {
        const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); return ok;
    }
    function download(name, type, body) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    function bar(fraction, label) {
        const w = el('div', 'bar'); w.setAttribute('role', 'progressbar'); w.setAttribute('aria-valuemin', '0'); w.setAttribute('aria-valuemax', '100');
        const pct = Math.max(0, Math.min(100, Math.floor(fraction * 100))); w.setAttribute('aria-valuenow', String(pct)); w.setAttribute('aria-label', label);
        const s = el('span'); s.style.width = pct + '%'; w.appendChild(s); return w;
    }
    const P = n => C.pages(n);
    const dayWord = d => (d === today ? 'today' : d === C.addDays(today, -1) ? 'yesterday' : C.fmtDate(d));
    const dateWord = d => (d === today ? 'today' : d === C.addDays(today, 1) ? 'tomorrow, ' + C.fmtDate(d) : C.fmtDate(d) + (d.slice(0, 4) !== today.slice(0, 4) ? ' ' + d.slice(0, 4) : ''));
    const about = () => (C.juzExact(state.total) ? '' : 'about ');
    // "about 1 juz", shown beside pages a day
    function juzWord(n) {
        const j = n / (state.total / 30);
        if (j >= 0.9 && j <= 1.1) return ' (about 1 juz)';
        if (j > 1.1) return ' (about ' + (Math.round(j * 2) / 2) + ' juz)';
        if (j >= 0.45 && j <= 0.55) return ' (about half a juz)';
        return '';
    }
    function whereLine(pos) {
        if (pos <= 0) return 'Not started yet: ' + state.total + ' pages.';
        const pct = Math.floor(100 * pos / state.total);
        let t = 'Page ' + pos + ' of ' + state.total + ', ' + pct + '%';
        if (pos < state.total) {
            t += ', in ' + (C.juzExact(state.total) ? '' : 'about ') + 'Juz ' + C.juzOfPage(state.total, pos + 1);
            if (state.total === 604) t += ', Surah ' + C.surahOfPage(pos + 1).name.replace(/-/g, '\u2011');
        }
        return t + '.';
    }

    // ---------- render ----------
    function render() {
        today = C.todayIso();
        const hasPlan = !!state.plan;
        $('app').classList.toggle('setup', !hasPlan);
        $('plan').hidden = hasPlan && !editingPlan;
        $('today').hidden = !hasPlan;
        $('juz').hidden = !hasPlan;
        if (hasPlan) { renderToday(); renderJuz(); }
        $('khatams').hidden = !hasPlan && !state.khatams.length;
        renderKhatams(); renderGroup();
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('My Quran reading') + '&body=' + encodeURIComponent(C.progressText(state, today));
    }

    function renderToday() {
        const st = C.status(state, today), body = $('today-body');
        body.textContent = '';
        body.appendChild(el('p', 'box-line', whereLine(st.pos)));
        body.appendChild(bar(st.pos / state.total, 'Read ' + st.pos + ' of ' + state.total + ' pages'));
        const big = (strong, rest) => { const p = el('p', 'big'); p.appendChild(el('strong', null, strong)); if (rest) p.appendChild(document.createTextNode(rest)); body.appendChild(p); };
        const line = (cls, t) => body.appendChild(el('p', cls, t));
        const k = st.kind;
        if (k === 'complete') {
            big('Khatam complete, Mashallah!', '');
            line('state good', 'You read all ' + state.total + ' pages in ' + C.plural(st.days, 'day', 'days') + '.');
            body.appendChild(btn('primary', 'Save this khatam and start the next', saveKhatam));
        } else if (k === 'future') {
            big('Your plan starts ' + dateWord(st.start) + '.', '');
            line('sub-line', st.mode === 'date' ? 'Then read ' + P(st.perDay) + ' a day' + juzWord(st.perDay) + ' to finish by ' + C.fmtDate(st.end) + '.' : 'Then read ' + P(st.perDay) + ' a day to finish on ' + C.fmtDate(st.end) + '.');
        } else if (k === 'passed') {
            big('Your finish date, ' + C.fmtDate(st.by) + ', has passed.', '');
            line('state bad', P(st.left) + ' left. Tap "Change plan" to pick a new date.');
        } else {
            if (st.todo > 0) big('Read ' + P(st.todo) + ' today', ': up to page ' + st.goal + '.');
            else big('Today\'s reading is done.', ' ' + (st.readToday ? P(st.readToday) + ' read today.' : ''));
            if (st.behind > 0) line('state bad', P(st.behind) + ' behind your plan. The missed pages are spread over the days left.');
            else if (st.ahead > 0) line('state good', P(st.ahead) + ' ahead of your plan.');
            else line('state good', 'On plan.');
            if (k === 'date') {
                if (st.daysLeft === 1) line('sub-line', 'Today is your last day: finish by ' + C.fmtDate(st.by) + '.');
                else if (st.todo > 0) line('sub-line', 'To finish by ' + C.fmtDate(st.by) + ': ' + P(st.need) + ' a day' + juzWord(st.need) + ', ' + C.plural(st.daysLeft, 'day', 'days') + ' left counting today.');
                else line('sub-line', 'From tomorrow: ' + P(st.next) + ' a day' + juzWord(st.next) + ' to finish by ' + C.fmtDate(st.by) + ' (' + C.plural(st.daysLeft - 1, 'day', 'days') + ').');
            } else {
                let t = 'At ' + P(state.plan.perDay) + ' a day you finish ' + dateWord(st.finish);
                if (st.late > 0) t += ', ' + C.plural(st.late, 'day', 'days') + ' later than planned (' + C.fmtDate(st.end) + ').';
                else if (st.late < 0) t += ', ' + C.plural(-st.late, 'day', 'days') + ' earlier than planned.';
                else t += '.';
                line('sub-line', t);
            }
        }
        // the log form
        const done = k === 'complete';
        $('log-form').hidden = done;
        const inp = $('l-page');
        inp.placeholder = st.goal && st.goal > st.pos ? 'e.g. ' + st.goal : 'e.g. ' + Math.min(state.total, st.pos + 20);
        const sel = $('l-juz'), keep = sel.value; sel.textContent = '';
        const o0 = el('option', null, 'Pick a juz'); o0.value = ''; sel.appendChild(o0);
        for (let j = 1; j <= 30; j++) {
            const end = C.juzEnd(state.total, j);
            if (end <= st.pos) continue;
            const o = el('option', null, 'End of Juz ' + j + ' (' + about() + 'page ' + end + ')'); o.value = String(end); sel.appendChild(o);
        }
        sel.value = [...sel.options].some(o => o.value === keep) ? keep : '';
        const dayBox = $('l-day');
        dayBox.max = today; dayBox.min = state.plan.start;
        if (!dayBox.value || dayBox.value > today) dayBox.value = C.addDays(today, -1) < state.plan.start ? today : C.addDays(today, -1);
        dayText();
        renderHistory();
    }
    function dayText() {
        const other = !$('w-day').hidden;
        $('l-day-text').textContent = other ? 'Reading for ' + dayWord($('l-day').value || today) + '.' : 'Reading for today.';
        $('l-day-open').textContent = other ? 'Back to today' : 'Another day?';
    }
    function renderHistory() {
        const list = $('hist-list'), rows = C.sortedLog(state); list.textContent = '';
        $('hist-empty').hidden = rows.length > 0;
        let prev = state.plan.from - 1; const steps = rows.map(e => { const s = e.at - prev; prev = e.at; return s; });
        rows.map((e, k) => ({ e, step: steps[k] })).reverse().forEach(({ e, step }) => {
            const li = el('li');
            li.appendChild(el('span', null, C.fmtDate(e.d) + ': up to page ' + e.at + ' (' + (step ? '+' + P(step) : 'no new pages') + ')'));
            li.appendChild(btn('mini del', 'Delete', () => {
                const snap = snapshot();
                state.log.splice(e.i, 1); commit();
                show('today-msg', 'Deleted the reading for ' + C.fmtDate(e.d) + '.', snap);
            }, 'Delete the reading for ' + C.fmtDate(e.d) + ', up to page ' + e.at));
            list.appendChild(li);
        });
    }

    function renderJuz() {
        const pos = C.position(state), grid = $('juz-grid'), done = C.juzDone(state.total, pos), complete = pos >= state.total;
        grid.textContent = '';
        const cur = complete ? 0 : C.juzOfPage(state.total, pos + 1);
        for (let j = 1; j <= 30; j++) {
            const isDone = C.juzEnd(state.total, j) <= pos;
            const li = el('li', 'jz' + (isDone ? ' done' : '') + (j === cur ? ' now' : ''), String(j));
            li.setAttribute('aria-label', 'Juz ' + j + ': ' + (isDone ? 'done' : j === cur ? 'reading now' : 'not yet') + ', ' + about() + 'pages ' + C.juzStart(state.total, j) + ' to ' + C.juzEnd(state.total, j));
            li.title = 'Juz ' + j + ': ' + about() + 'pages ' + C.juzStart(state.total, j) + '-' + C.juzEnd(state.total, j);
            grid.appendChild(li);
        }
        $('juz-line').textContent = done + ' of 30 juz done' + (cur ? ', reading Juz ' + cur + ' now.' : '.');
        $('juz-hint').textContent = C.juzExact(state.total) ? 'Filled: finished. Outlined: the juz you are in.' : 'Filled: finished. Outlined: the juz you are in. In a ' + state.total + '-page copy the juz are worked out evenly, so they are about right.';
    }

    function renderKhatams() {
        const body = $('k-body'), list = $('k-list'); body.textContent = ''; list.textContent = '';
        const pending = C.isComplete(state) ? 1 : 0, n = state.khatams.length + pending;
        const p = el('p', 'big'); p.appendChild(el('strong', null, String(n))); p.appendChild(document.createTextNode(n === 1 ? ' khatam finished' : ' khatams finished'));
        body.appendChild(p);
        const s = C.streak(state, today);
        body.appendChild(el('p', 'sub-line', s ? 'Reading streak: ' + C.plural(s, 'day', 'days') + ' in a row.' : 'Reading streak: log your reading to start one.'));
        if (pending) body.appendChild(el('p', 'sub-line', 'Your last khatam is finished: tap "Save this khatam and start the next" in the Today box.'));
        if (!state.khatams.length) { body.appendChild(el('p', 'empty', 'Each khatam you finish is listed here with its dates.')); return; }
        state.khatams.map((k, i) => ({ k, i })).reverse().forEach(({ k, i }) => {
            const li = el('li');
            const t = el('span', 'k-text');
            t.appendChild(el('b', null, 'Khatam ' + (i + 1)));
            t.appendChild(el('span', 'k-sub', C.fmtDateY(k.start) + ' to ' + C.fmtDateY(k.end) + ' (' + C.plural(C.diffDays(k.start, k.end) + 1, 'day', 'days') + ')'));
            li.appendChild(t);
            li.appendChild(btn('mini del', 'Delete', () => {
                const snap = snapshot(); state.khatams.splice(i, 1); commit();
                show('k-msg', 'Deleted khatam ' + (i + 1) + '.', snap);
            }, 'Delete khatam ' + (i + 1)));
            list.appendChild(li);
        });
    }

    // ---------- the plan form ----------
    function openPlan(quiet) {
        editingPlan = true;
        const p = state.plan;
        $('p-copy').value = state.copy; $('p-pages').value = state.copy === 'custom' ? String(state.total) : '';
        $('m-date').checked = !p || p.mode === 'date'; $('m-pace').checked = !!p && p.mode === 'pace';
        $('p-by').value = p && p.mode === 'date' ? p.by : '';
        $('p-per').value = p && p.mode === 'pace' ? String(p.perDay) : '';
        $('p-start').value = p ? p.start : today;
        $('p-from').value = p && p.from > 1 ? String(p.from) : '';
        $('w-from').hidden = !(p && p.from > 1); $('o-from').hidden = !$('w-from').hidden;
        $('plan-h').textContent = p ? 'Change your plan' : 'Set up your plan';
        $('plan-save').textContent = p ? 'Save changes' : 'Start my plan';
        $('plan-cancel').hidden = !p;
        $('restart').hidden = !(p && state.log.length);
        clearPlanErrors(); planFields(); render();
        if (quiet === true) return;
        $('plan').scrollIntoView({ block: 'start' });
        $('p-copy').focus({ preventScroll: true });
    }
    function closePlan() { editingPlan = false; render(); }
    function clearPlanErrors() {
        ['e-pages', 'e-by', 'e-per', 'e-start', 'e-from'].forEach(id => { $(id).textContent = ''; });
        ['p-pages', 'p-by', 'p-per', 'p-start', 'p-from'].forEach(id => $(id).removeAttribute('aria-invalid'));
    }
    function planFields() {
        $('w-pages').hidden = $('p-copy').value !== 'custom';
        const date = $('m-date').checked;
        $('w-by').hidden = !date; $('w-per').hidden = date;
        preview();
    }
    // reads the form; returns { copy, total, plan, errs }
    function readPlan() {
        const errs = {}, copy = $('p-copy').value;
        let total = copy === 'custom' ? C.readInt($('p-pages').value) : C.COPIES[copy].pages;
        if (copy === 'custom' && !(total >= C.LIMITS.minPages && total <= C.LIMITS.maxPages)) errs.pages = 'Type the number of pages in your copy, from ' + C.LIMITS.minPages + ' to ' + C.LIMITS.maxPages + '.';
        const mode = $('m-date').checked ? 'date' : 'pace';
        const fromRaw = $('w-from').hidden ? '' : $('p-from').value.trim();
        const plan = { start: $('p-start').value, from: fromRaw === '' ? 1 : C.readInt(fromRaw), mode, by: mode === 'date' ? $('p-by').value : '', perDay: mode === 'pace' ? C.readInt($('p-per').value) : 0 };
        if (!errs.pages) {
            const e = C.checkPlan(plan, total, today);
            if (e) {
                if (/start from/.test(e)) errs.from = e;
                else if (/start day|day you start/.test(e) && !/finish/.test(e)) errs.start = e;
                else if (mode === 'date') errs.by = e;
                else errs.per = e;
            }
        }
        // a plan that is changed after reading has started must still fit what was read
        if (state.plan && state.log.length && !Object.keys(errs).length) {
            const rows = C.sortedLog(state), last = rows[rows.length - 1], first = rows[0];
            if (last.at > total) errs.pages = 'You have already logged page ' + last.at + '. Pick a copy with at least that many pages, or delete readings under History first.';
            else if (plan.start > first.d) errs.start = 'You logged reading on ' + C.fmtDate(first.d) + '. Start on that day or earlier.';
            else if (plan.from - 1 > first.at) errs.from = 'You logged page ' + first.at + ' already. Start from page ' + (first.at + 1) + ' or lower.';
        }
        return { copy, total, plan, errs };
    }
    function preview() {
        const out = $('preview'); out.textContent = '';
        const r = readPlan(); if (Object.keys(r.errs).length) return;
        const sc = C.schedule(r.plan, r.total), pages = r.total - r.plan.from + 1;
        const range = C.fmtDate(r.plan.start) + ' to ' + C.fmtDateY(sc.end);
        if (r.plan.mode === 'date') out.textContent = P(sc.perDay) + ' a day' + juzWordFor(sc.perDay, r.total) + ': ' + P(pages) + ' in ' + C.plural(sc.days, 'day', 'days') + ', ' + range + '.';
        else out.textContent = 'You finish on ' + C.fmtDateY(sc.end) + ': ' + P(pages) + ' in ' + C.plural(sc.days, 'day', 'days') + ', from ' + C.fmtDate(r.plan.start) + '.';
    }
    function juzWordFor(n, total) { const t = state.total; state.total = total; const w = juzWord(n); state.total = t; return w; }
    function submitPlan(ev) {
        ev.preventDefault(); clearPlanErrors();
        const r = readPlan(), keys = Object.keys(r.errs);
        if (keys.length) {
            keys.forEach(k => { $('e-' + k).textContent = r.errs[k]; const f = { pages: 'p-pages', by: 'p-by', per: 'p-per', start: 'p-start', from: 'p-from' }[k]; $(f).setAttribute('aria-invalid', 'true'); });
            const first = { pages: 'p-pages', by: 'p-by', per: 'p-per', start: 'p-start', from: 'p-from' }[keys[0]];
            if (first === 'p-pages' && $('w-pages').hidden) $('p-copy').focus(); else $(first).focus();
            return;
        }
        const snap = snapshot(), had = !!state.plan;
        state.copy = r.copy; state.total = r.total; state.plan = r.plan;
        editingPlan = false; commit();
        show('today-msg', had ? 'Plan changed.' : 'Your plan is ready. Read today, then type the page where you stopped.', had ? snap : null);
        $('today').scrollIntoView({ block: 'nearest' });
    }

    // ---------- logging ----------
    function submitLog(ev) {
        ev.preventDefault();
        const err = $('e-log'), inp = $('l-page'); err.textContent = ''; inp.removeAttribute('aria-invalid');
        const day = $('w-day').hidden ? today : $('l-day').value;
        const at = C.readInt(inp.value);
        const e = C.checkReading(state, day, at, today);
        if (e) { err.textContent = e; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
        const snap = snapshot(), before = C.positionOn(state, day);
        state.log.push({ d: day, at });
        inp.value = ''; $('l-juz').value = ''; $('w-day').hidden = true;
        commit();
        const step = at - before;
        show('today-msg', at >= state.total ? 'Saved: you reached the last page.' : 'Saved: ' + (step ? P(step) : 'no new pages') + ' ' + dayWord(day) + ', up to page ' + at + '.', snap);
    }
    function saveKhatam() {
        const snap = snapshot(), last = state.plan;
        if (!C.completeKhatam(state)) return;
        commit();
        show('k-msg', 'Khatam ' + state.khatams.length + ' saved. Set up the next one.', snap);
        // the next khatam starts with the same kind of plan, from today
        openPlan();
        $('m-date').checked = last.mode === 'date'; $('m-pace').checked = last.mode === 'pace';
        if (last.mode === 'pace') $('p-per').value = String(last.perDay);
        else $('p-by').value = C.addDays(today, C.diffDays(last.start, last.by));
        $('p-start').value = today; $('p-from').value = ''; $('w-from').hidden = true; $('o-from').hidden = false;
        planFields();
    }

    // ---------- group khatam ----------
    function renderGroup() {
        const g = state.group;
        $('g-none').hidden = !!g; $('g-on').hidden = !g;
        if (!g) return;
        if (document.activeElement !== $('g-title')) $('g-title').value = g.title;
        $('g-by').value = g.by;
        const sum = $('g-sum'), n = C.groupDone(g); sum.textContent = '';
        const p = el('p', 'big'); p.appendChild(el('strong', null, n + ' of 30')); p.appendChild(document.createTextNode(' juz read')); sum.appendChild(p);
        sum.appendChild(bar(n / 30, n + ' of 30 juz read'));
        if (n === 30) sum.appendChild(el('p', 'state good', 'All 30 juz are read. Khatam complete, Mashallah!'));
        else {
            const free = g.who.filter(w => !w).length;
            if (g.by) {
                const d = C.diffDays(today, g.by);
                sum.appendChild(el('p', d < 0 ? 'state bad' : 'sub-line', d < 0 ? 'The finish date, ' + C.fmtDate(g.by) + ', has passed. ' + C.plural(30 - n, 'juz is', 'juz are') + ' still to read.' : 'Finish by ' + dateWord(g.by) + (d > 0 ? ' (' + C.plural(d + 1, 'day', 'days') + ' left counting today)' : '') + '. ' + (30 - n) + ' juz to go.'));
            }
            if (!g.people.length) sum.appendChild(el('p', 'sub-line', 'Add the people who will read, then tap "Share the juz out evenly".'));
            else if (free === 30) sum.appendChild(el('p', 'sub-line', 'Nobody has a juz yet. Tap "Share the juz out evenly" or pick under "Change who reads which juz".'));
            else if (free) sum.appendChild(el('p', 'state bad', C.plural(free, 'juz is', 'juz are') + ' not taken yet.'));
        }
        $('g-share').hidden = !g.people.length;
        // a box for each person, and one for the juz nobody has taken
        const list = $('g-people'); list.textContent = '';
        g.people.forEach(person => list.appendChild(personBox(g, person)));
        const free = []; g.who.forEach((w, i) => { if (!w) free.push(i + 1); });
        if (free.length && free.length < 30) {
            const li = el('li', 'box small free');
            li.appendChild(el('h3', 'box-name', 'Not taken yet'));
            li.appendChild(el('p', 'box-sub', 'Juz ' + C.ranges(free)));
            li.appendChild(chips(g, free, 'not taken'));
            list.appendChild(li);
        }
        renderAssign(g);
    }
    function personBox(g, person) {
        const li = el('li', 'box'); li.dataset.id = String(person.id);
        const js = C.juzOf(g, person.id), read = js.filter(j => g.done[j - 1]).length;
        if (renaming === person.id) {
            const f = el('form', 'rename'); f.noValidate = true;
            const lab = el('label', null, 'New name'); const inp = el('input'); inp.type = 'text'; inp.maxLength = C.LIMITS.name; inp.id = 'rn-' + person.id; inp.value = person.name; inp.autocomplete = 'off';
            lab.htmlFor = inp.id;
            const row = el('div', 'log-row'); row.append(inp, (() => { const b = el('button', 'primary small', 'Save'); b.type = 'submit'; return b; })());
            const err = el('p', 'err'); err.setAttribute('role', 'alert');
            f.append(lab, row, err);
            f.addEventListener('submit', ev => {
                ev.preventDefault();
                const name = C.cleanText(inp.value, C.LIMITS.name);
                const e = nameError(name, person.id); if (e) { err.textContent = e; inp.focus(); return; }
                const snap = snapshot(); person.name = name; renaming = 0; commit(); show('g-msg', 'Renamed to ' + name + '.', snap);
            });
            li.appendChild(f);
            li.appendChild(btn('mini', 'Cancel', () => { renaming = 0; render(); }));
            setTimeout(() => inp.focus(), 0);
            return li;
        }
        const top = el('div', 'box-top');
        top.appendChild(el('h3', 'box-name', person.name));
        top.appendChild(el('span', 'badge' + (js.length && read === js.length ? ' all' : ''), js.length ? read + ' of ' + js.length + ' read' : 'no juz yet'));
        li.appendChild(top);
        li.appendChild(el('p', 'box-sub', js.length ? 'Juz ' + C.ranges(js) + '. Tap a juz when it is read.' : 'Give this person a juz under "Change who reads which juz", or tap "Share the juz out evenly".'));
        if (js.length) li.appendChild(chips(g, js, person.name));
        const b = el('div', 'box-btns two');
        b.appendChild(btn('mini', 'Rename', () => { renaming = person.id; render(); }, 'Rename ' + person.name));
        b.appendChild(btn('mini', 'Remove', () => {
            const snap = snapshot();
            g.people = g.people.filter(x => x.id !== person.id);
            g.who = g.who.map(w => (w === person.id ? 0 : w));
            commit(); show('g-msg', person.name + ' removed. Their juz are not taken now.', snap);
        }, 'Remove ' + person.name));
        li.appendChild(b);
        return li;
    }
    function chips(g, js, who) {
        const wrap = el('div', 'jchips');
        js.forEach(j => {
            const on = g.done[j - 1];
            const b = btn('jchip' + (on ? ' on' : ''), (on ? '✓ ' : '') + 'Juz ' + j, () => {
                g.done[j - 1] = !g.done[j - 1]; commit();
                const again = document.querySelector('[data-juz="' + j + '"]'); if (again) again.focus();
            }, 'Juz ' + j + ' (' + who + ')' + (on ? ', read. Tap to mark as not read' : ', not read yet. Tap when it is read'));
            b.dataset.juz = String(j); b.setAttribute('aria-pressed', String(on));
            wrap.appendChild(b);
        });
        return wrap;
    }
    function renderAssign(g) {
        const list = $('g-assign-list'); list.textContent = '';
        for (let j = 1; j <= 30; j++) {
            const li = el('li', 'arow');
            const lab = el('label', null, 'Juz ' + j); lab.htmlFor = 'as-' + j;
            const sel = el('select'); sel.id = 'as-' + j;
            const o0 = el('option', null, 'Not taken'); o0.value = '0'; sel.appendChild(o0);
            g.people.forEach(p => { const o = el('option', null, p.name); o.value = String(p.id); sel.appendChild(o); });
            sel.value = String(g.who[j - 1]);
            sel.addEventListener('change', () => { g.who[j - 1] = Number(sel.value); commit(); const s = $('as-' + j); if (s) s.focus(); });
            li.append(lab, sel);
            list.appendChild(li);
        }
    }
    function nameError(name, selfId) {
        if (!name) return 'Type a name.';
        if (state.group.people.some(p => p.id !== selfId && p.name.toLowerCase() === name.toLowerCase())) return name + ' is already in the list. Add a surname or an initial.';
        return '';
    }

    // ---------- events ----------
    function wire() {
        // plan
        $('plan-form').addEventListener('submit', submitPlan);
        ['p-copy', 'm-date', 'm-pace'].forEach(id => $(id).addEventListener('change', () => { clearPlanErrors(); planFields(); }));
        ['p-pages', 'p-by', 'p-per', 'p-start', 'p-from'].forEach(id => $(id).addEventListener('input', preview));
        $('p-start').addEventListener('change', preview); $('p-by').addEventListener('change', preview);
        document.querySelectorAll('.chip[data-days]').forEach(b => b.addEventListener('click', () => {
            const start = C.isIso($('p-start').value) ? $('p-start').value : today;
            $('p-by').value = C.addDays(start, Number(b.dataset.days) - 1); $('e-by').textContent = ''; $('p-by').removeAttribute('aria-invalid'); preview();
        }));
        document.querySelectorAll('.chip[data-per]').forEach(b => b.addEventListener('click', () => {
            const n = Number(b.dataset.per), total = $('p-copy').value === 'custom' ? C.readInt($('p-pages').value) : C.COPIES[$('p-copy').value].pages;
            // half a juz and one juz depend on the copy: 604 / 30 = 20 pages a juz
            const per = n >= 10 && total > 0 ? Math.round((total / 30) * (n / 20)) : n;
            $('p-per').value = String(per); $('e-per').textContent = ''; $('p-per').removeAttribute('aria-invalid'); preview();
        }));
        $('o-from').addEventListener('click', () => { $('w-from').hidden = false; $('o-from').hidden = true; $('p-from').focus(); preview(); });
        $('plan-cancel').addEventListener('click', closePlan);
        $('change-plan').addEventListener('click', () => openPlan());
        $('restart').addEventListener('click', () => {
            const snap = snapshot(); state.log = []; editingPlan = false; commit();
            show('today-msg', 'Your reading for this khatam was cleared. It starts again from your plan\'s first page.', snap);
        });
        // log
        $('log-form').addEventListener('submit', submitLog);
        $('l-juz').addEventListener('change', () => { if ($('l-juz').value) { $('l-page').value = $('l-juz').value; $('e-log').textContent = ''; } });
        $('l-day-open').addEventListener('click', () => { $('w-day').hidden = !$('w-day').hidden; dayText(); if (!$('w-day').hidden) $('l-day').focus(); });
        $('l-day').addEventListener('change', dayText);
        $('hist-btn').addEventListener('click', () => {
            const h = $('history'); h.hidden = !h.hidden;
            $('hist-btn').textContent = h.hidden ? 'History' : 'Hide history'; $('hist-btn').setAttribute('aria-expanded', String(!h.hidden));
        });
        // group
        $('g-start').addEventListener('click', () => { state.group = C.emptyGroup(); commit(); $('g-name').focus(); });
        $('g-title').addEventListener('input', () => { state.group.title = C.cleanText($('g-title').value, C.LIMITS.title); save(); });
        $('g-title').addEventListener('blur', () => render());
        $('g-by').addEventListener('change', () => { state.group.by = C.isIso($('g-by').value) ? $('g-by').value : ''; commit(); });
        $('g-add').addEventListener('submit', ev => {
            ev.preventDefault();
            const inp = $('g-name'), err = $('e-name'); err.textContent = ''; inp.removeAttribute('aria-invalid');
            const name = C.cleanText(inp.value, C.LIMITS.name);
            let e = nameError(name, 0);
            if (!e && state.group.people.length >= C.LIMITS.people) e = 'That is 30 people already: one juz each.';
            if (e) { err.textContent = e; inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
            state.group.people.push({ id: state.nextId++, name }); inp.value = ''; commit(); inp.focus();
        });
        $('g-share').addEventListener('click', () => {
            const g = state.group, snap = snapshot();
            C.shareOut(g); commit();
            const k = g.people.length, base = Math.floor(30 / k), extra = 30 % k;
            show('g-msg', 'Shared out: ' + (extra ? C.plural(extra, 'person reads', 'people read') + ' ' + (base + 1) + ' juz, the others ' + base : (k === 1 ? 'all 30 juz' : base + ' juz each')) + '.', snap);
        });
        $('g-assign-open').addEventListener('click', () => {
            const a = $('g-assign'); a.hidden = !a.hidden;
            $('g-assign-open').setAttribute('aria-expanded', String(!a.hidden));
            $('g-assign-open').textContent = a.hidden ? 'Change who reads which juz' : 'Close the juz list';
        });
        $('g-copy').addEventListener('click', () => copyText(C.groupText(state.group)).then(ok => show('g-msg', ok ? 'Copied. Paste it in your WhatsApp group.' : 'Your browser did not allow copying.')));
        $('g-again').addEventListener('click', () => {
            const snap = snapshot(); state.group.who = Array(30).fill(0); state.group.done = Array(30).fill(false); commit();
            show('g-msg', 'Ready for a new khatam with the same people. Tap "Share the juz out evenly".', snap);
        });
        $('g-del').addEventListener('click', () => { const snap = snapshot(); state.group = null; commit(); show('g-msg', 'Group khatam deleted.', snap); });
        // share and backup
        $('copy').addEventListener('click', () => copyText(C.progressText(state, today)).then(ok => show('set-msg', ok ? 'Copied your progress.' : 'Your browser did not allow copying.')));
        $('backup').addEventListener('click', () => { download('quran-reading-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1)); show('set-msg', 'Backup file saved. Keep it somewhere safe.'); });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', () => {
            const f = $('restore-file').files[0]; $('restore-file').value = '';
            if (!f) return;
            if (f.size > 2e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            f.text().then(t => {
                let s = null; try { s = C.validate(JSON.parse(t)); } catch (e) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app, so nothing was changed.'); return; }
                const snap = snapshot(); state = s; editingPlan = false; renaming = 0; commit(); if (!state.plan) openPlan(true); show('set-msg', 'Backup restored.', snap);
            });
        });
        $('wipe').addEventListener('click', () => { const snap = snapshot(); state = C.emptyState(); editingPlan = false; renaming = 0; commit(); openPlan(true); show('set-msg', 'Everything was deleted.', snap); });
        // a new day while the app is open
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayIso() !== today) render(); });
        setInterval(() => { if (C.todayIso() !== today) render(); }, 60000);
    }

    state = load();
    wire();
    if (!state.plan) openPlan(true); else render();
    save();
})();
