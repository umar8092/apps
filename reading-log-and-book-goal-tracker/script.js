// Reading Log and Book Goal Tracker: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.ReadCore;
    const KEY = 'reading-log-and-book-goal-tracker.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };
    const q = s => '“' + s + '”';
    const narrow = () => window.matchMedia('(max-width: 899px)').matches;

    let canSave = true, state, today = C.todayIso();
    let year = C.yearOf(today);       // the year shown in "Books this year" and "Finished books"
    let editing = null;               // id of the book in the form, or null for a new one
    const openHistory = new Set();    // books whose History is open
    const otherDay = new Set();       // books whose "Another day?" date box is open
    const pendingBack = {};           // id -> {day, at} waiting for "did you go back?"
    const audioMode = {};             // id -> 'in' | 'left'

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved books could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeForm(); commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['goal-msg', 'now-msg', 'form-msg', 'done-msg', 'set-msg'];
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
    const book = id => state.books.find(b => b.id === id);
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
    const FORMAT_NAME = { pages: 'Pages', percent: 'Ebook %', audio: 'Audiobook' };
    // a pace, rounded so it reads naturally: "about 23 pages a day", "about 1 h 5 min a day"
    // rounded down, so "about 45 pages a day" never promises more than the person really reads
    function paceText(format, perDay) {
        const n = Math.floor(perDay + 1e-9);
        if (format === 'pages') return n < 1 ? 'less than 1 page a day' : 'about ' + C.fmtAmount('pages', n) + ' a day';
        if (format === 'percent') return n < 1 ? 'less than 1% a day' : 'about ' + n + '% a day';
        return n < 1 ? 'less than 1 min a day' : 'about ' + C.fmtMin(n) + ' a day';
    }
    const dayWord = d => (d === today ? 'today' : d === C.addDays(today, -1) ? 'yesterday' : C.fmtDate(d));
    function whereLine(b) {
        const at = C.position(b), total = C.totalOf(b), pct = Math.floor(100 * at / total), left = total - at;
        if (b.format === 'percent') return at + '% read, ' + left + '% left';
        if (b.format === 'audio') return C.fmtMin(at) + ' of ' + C.fmtMin(total) + ', ' + pct + '%, ' + C.fmtMin(left) + ' left';
        return (at ? 'Page ' + at + ' of ' + total : 'Not started: ' + total + ' pages') + (at ? ', ' + pct + '%, ' + C.fmtAmount('pages', left) + ' left' : '');
    }
    function planLines(b) {
        const out = [], plan = C.finishPlan(b, today), p = C.pace(b, today);
        if (plan && plan.passed) out.push(['warn', 'Your finish-by date, ' + C.fmtDate(plan.by) + ', has passed with ' + C.fmtAmount(b.format, plan.left) + ' left. Tap Edit to pick a new date.']);
        else if (plan) {
            const amt = C.fmtAmount(b.format, plan.perDay);
            let t;
            if (plan.days === 1) t = plan.by === today ? 'To finish today read the last ' + amt + ' today.' : 'To finish by ' + C.fmtDate(plan.by) + ' read the last ' + amt + ' ' + plan.from + '.';
            else t = 'To finish by ' + C.fmtDate(plan.by) + ' read ' + amt + ' a day from ' + plan.from + ' (' + plan.days + ' days).';
            out.push(['plan', t]);
            if (p) out.push(['sub', p.perDay >= plan.perDay ? 'Your pace, ' + paceText(b.format, p.perDay) + ', is enough.' : 'That is more than your pace, ' + paceText(b.format, p.perDay) + '.']);
        }
        const est = C.estimate(b, today);
        if (est) out.push(['sub', 'At your pace (' + paceText(b.format, est.perDay) + ') you finish around ' + (est.date === today ? 'today' : est.date === C.addDays(today, 1) ? 'tomorrow, ' + C.fmtDate(est.date) : C.fmtDate(est.date) + (C.yearOf(est.date) !== C.yearOf(today) ? ' ' + C.yearOf(est.date) : '')) + '.']);
        else if (!b.log.length) out.push(['sub', 'Log where you stop each time and you will see when you finish at your pace.']);
        return out;
    }
    function bar(fraction, label) {
        const w = el('div', 'bar'); w.setAttribute('role', 'progressbar'); w.setAttribute('aria-valuemin', '0'); w.setAttribute('aria-valuemax', '100');
        const pct = Math.max(0, Math.min(100, Math.round(fraction * 100))); w.setAttribute('aria-valuenow', String(pct)); w.setAttribute('aria-label', label);
        const s = el('span'); s.style.width = pct + '%'; w.appendChild(s); return w;
    }
    function years() {
        const ys = new Set([C.yearOf(today)]);
        state.books.forEach(b => { if (b.status === 'finished' && b.finished && C.yearOf(b.finished) <= C.yearOf(today)) ys.add(C.yearOf(b.finished)); });
        Object.keys(state.goals).forEach(k => { if (Number(k) <= C.yearOf(today)) ys.add(Number(k)); });
        return [...ys].sort((a, b) => b - a);
    }

    // ---------- render ----------
    function render() {
        today = C.todayIso();
        const ys = years(); if (!ys.includes(year)) year = C.yearOf(today);
        $('app').classList.toggle('setup', !state.books.length);
        renderGoal(ys); renderNow(); renderStats(); renderWant(); renderDone();
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('Books I read in ' + year) + '&body=' + encodeURIComponent(C.listText(state, year, today));
        $('open-form').hidden = editing !== null || !$('form').hidden;
    }

    function renderGoal(ys) {
        const sel = $('year'); sel.textContent = '';
        ys.forEach(y => { const o = el('option', null, String(y)); o.value = String(y); sel.appendChild(o); });
        sel.value = String(year); $('year-wrap').hidden = ys.length < 2;
        const y = C.yearSummary(state, year, today), cur = year === C.yearOf(today), body = $('goal-body');
        $('goal-h').textContent = cur ? 'Books this year' : 'Books in ' + year;
        body.textContent = '';
        const big = el('p', 'big');
        if (y.goal) { big.appendChild(el('strong', null, y.done + ' of ' + y.goal)); big.appendChild(document.createTextNode(' books finished in ' + year)); }
        else if (y.done) { big.appendChild(el('strong', null, String(y.done))); big.appendChild(document.createTextNode((y.done === 1 ? ' book' : ' books') + ' finished in ' + year)); }
        else big.textContent = cur ? 'No books finished in ' + year + ' yet.' : 'No books finished in ' + year + '.';
        body.appendChild(big);
        if (y.goal) {
            body.appendChild(bar(y.done / y.goal, y.done + ' of ' + y.goal + ' books'));
            if (y.done >= y.goal) body.appendChild(el('p', 'state good', 'Goal reached! ' + (y.done > y.goal ? (y.done - y.goal) + ' more than you planned.' : cur ? 'Every book from now is a bonus.' : '')));
            else if (!cur) body.appendChild(el('p', 'state bad', 'Goal not reached: ' + C.plural(y.remaining, 'book', 'books') + ' short.'));
            else {
                if (y.ahead > 0) body.appendChild(el('p', 'state good', C.plural(y.ahead, 'book', 'books') + ' ahead of schedule.'));
                else if (y.ahead === 0) body.appendChild(el('p', 'state good', 'On track: about ' + y.target + ' by today.'));
                else body.appendChild(el('p', 'state bad', C.plural(-y.ahead, 'book', 'books') + ' behind: by today you would have about ' + y.target + ' finished.'));
                const every = y.every >= 10 ? Math.round(y.every) : y.every;
                const how = every < 1 ? 'more than one book a day' : every === 1 ? 'one book every day' : 'about one book every ' + every + ' days';
                body.appendChild(el('p', 'sub-line', 'To reach ' + y.goal + ' by 31 Dec: ' + C.plural(y.remaining, 'more book', 'more books') + ' in ' + C.plural(y.daysLeft, 'day', 'days') + ', ' + how + '.'));
            }
        }
        const reading = state.books.filter(b => b.status === 'reading').length;
        if (cur && reading) body.appendChild(el('p', 'sub-line', 'Reading now: ' + C.plural(reading, 'book', 'books') + '.'));
        $('goal-open').textContent = y.goal ? 'Change goal' : 'Set a yearly goal (optional)';
        $('goal-l').textContent = 'How many books do you want to read in ' + year + '?';
    }

    function renderNow() {
        const list = $('now-list'), books = state.books.filter(b => b.status === 'reading');
        list.textContent = ''; $('now-empty').hidden = books.length > 0;
        books.forEach(b => list.appendChild(nowBox(b)));
    }
    function nowBox(b) {
        const li = el('li', 'box'); li.dataset.id = b.id;
        const top = el('div', 'box-top');
        top.appendChild(el('h3', 'box-name', b.title)); top.appendChild(el('span', 'badge', FORMAT_NAME[b.format]));
        li.appendChild(top);
        if (b.author) li.appendChild(el('p', 'box-sub', 'by ' + b.author));
        li.appendChild(bar(C.position(b) / C.totalOf(b), 'Progress in ' + b.title));
        li.appendChild(el('p', 'box-line', whereLine(b)));
        planLines(b).forEach(([cls, t]) => li.appendChild(el('p', 'plan-' + cls, t)));
        const am = C.dailyAmounts(b);
        if (C.readOn(b, today)) li.appendChild(el('p', 'today-line', 'Today: ' + C.fmtAmount(b.format, am[today] || 0) + (am[today] ? '' : ' (went back)') + '.'));
        li.appendChild(logForm(b));
        const btns = el('div', 'box-btns');
        const hb = btn('mini', openHistory.has(b.id) ? 'Hide history' : 'History', () => { openHistory.has(b.id) ? openHistory.delete(b.id) : openHistory.add(b.id); render(); focusIn(b.id, '.mini'); }, (openHistory.has(b.id) ? 'Hide history of ' : 'History of ') + b.title);
        hb.setAttribute('aria-expanded', String(openHistory.has(b.id)));
        btns.appendChild(hb);
        btns.appendChild(btn('mini', 'Edit', () => openForm(b.id), 'Edit ' + b.title));
        btns.appendChild(btn('mini', 'Finished', () => finishNow(b.id), 'Mark ' + b.title + ' as finished'));
        btns.appendChild(btn('mini', 'Stop reading', () => stopBook(b.id), 'Stop reading ' + b.title));
        li.appendChild(btns);
        if (openHistory.has(b.id)) li.appendChild(historyList(b));
        return li;
    }
    function logForm(b) {
        const f = el('form', 'logf'); f.noValidate = true;
        const id = 'b' + b.id, last = C.sortedLog(b).slice(-1)[0];
        const lab = el('label', null, b.format === 'audio' ? 'How far are you?' : 'Where did you stop?');
        const row = el('div', 'log-row');
        let inputs;
        if (b.format === 'audio') {
            lab.className = 'label-like'; lab.id = id + '-l';
            const mode = el('select', 'mode'); mode.id = id + '-mode'; mode.setAttribute('aria-label', 'Type the time listened or the time left');
            [['in', 'Listened so far'], ['left', 'Time left']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; mode.appendChild(o); });
            mode.value = audioMode[b.id] || 'in';
            mode.addEventListener('change', () => { audioMode[b.id] = mode.value; });
            const hm = el('div', 'hm');
            const h = el('input'); h.id = id + '-h'; h.type = 'text'; h.inputMode = 'numeric'; h.maxLength = 3; h.autocomplete = 'off'; h.placeholder = '0'; h.setAttribute('aria-label', 'Hours');
            const m = el('input'); m.id = id + '-m'; m.type = 'text'; m.inputMode = 'numeric'; m.maxLength = 2; m.autocomplete = 'off'; m.placeholder = '0'; m.setAttribute('aria-label', 'Minutes');
            hm.append(h, el('span', 'unit', 'h'), m, el('span', 'unit', 'min'));
            row.append(mode, hm); inputs = { h, m, mode };
            row.classList.add('audio');
        } else {
            const inp = el('input'); inp.id = id + '-at'; inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 6; inp.autocomplete = 'off';
            inp.placeholder = b.format === 'percent' ? 'e.g. ' + Math.min(100, C.position(b) + 5) : 'e.g. ' + Math.min(b.total, C.position(b) + 20);
            lab.htmlFor = inp.id;
            const wrap = el('div', 'inline');
            if (b.format === 'pages') wrap.appendChild(el('span', 'unit pre', 'page'));
            wrap.appendChild(inp);
            if (b.format === 'percent') wrap.appendChild(el('span', 'unit', '%'));
            row.appendChild(wrap); inputs = { at: inp };
        }
        const save = el('button', 'primary small save', 'Save'); save.type = 'submit'; save.setAttribute('aria-label', 'Save reading for ' + b.title);
        row.appendChild(save);
        f.append(lab, row);
        // the day: today unless the person picks another
        const dayRow = el('div', 'day-row');
        let dayInput = null;
        if (otherDay.has(b.id)) {
            const dl = el('label', null, 'Day you read'); dayInput = el('input'); dayInput.type = 'date'; dayInput.id = id + '-day'; dl.htmlFor = dayInput.id;
            dayInput.max = today; dayInput.value = C.addDays(today, -1);
            dayRow.append(dl, dayInput, btn('link small-link', 'Back to today', () => { otherDay.delete(b.id); render(); focusIn(b.id, 'input'); }));
        } else {
            dayRow.appendChild(el('span', 'day-now', 'For today, ' + C.fmtDate(today) + '.'));
            dayRow.appendChild(btn('link small-link', 'Another day?', () => { otherDay.add(b.id); render(); focusIn(b.id, 'input[type=date]'); }, 'Log ' + b.title + ' for another day'));
        }
        f.appendChild(dayRow);
        f.appendChild(el('p', 'hint', last ? 'Last time: ' + C.fmtPos(b, last.at) + ', ' + dayWord(last.d) + '.' : b.start ? 'You started on ' + C.fmtPos(b, b.start) + '.' : ''));
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); err.id = id + '-err'; f.appendChild(err);
        Object.values(inputs).forEach(i => { if (i.tagName === 'INPUT') i.setAttribute('aria-describedby', err.id); });
        const pb = pendingBack[b.id];
        if (pb) {
            const box = el('div', 'confirm'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Did you go back?');
            box.appendChild(el('p', null, C.fmtPos(b, pb.at).replace(/^p/, 'P') + ' is before ' + C.fmtPos(b, pb.prev) + ', where you were last time. Did you go back to re-read?'));
            const r = el('div', 'row-btns');
            r.append(btn('primary small', 'Yes, I went back', () => { delete pendingBack[b.id]; addLog(b.id, pb.day, pb.at); }),
                btn('secondary small', 'No, let me fix it', () => { delete pendingBack[b.id]; render(); focusIn(b.id, 'input'); }));
            box.appendChild(r); f.appendChild(box);
        }
        f.addEventListener('submit', ev => {
            ev.preventDefault(); err.textContent = '';
            const day = dayInput ? dayInput.value : today;
            let at;
            if (b.format === 'audio') {
                const v = C.readHM(inputs.h.value, inputs.m.value);
                if (Number.isNaN(v)) { err.textContent = 'Type the hours and minutes, such as 2 h 15 min.'; inputs.h.focus(); return; }
                if (inputs.mode.value === 'left') { if (v > b.total) { err.textContent = 'The audiobook is only ' + C.fmtMin(b.total) + ' long. Check the time left, or change the length under Edit.'; inputs.h.focus(); return; } at = b.total - v; }
                else at = v;
            } else {
                const raw = inputs.at.value.trim();
                at = C.readInt(raw);
                if (!raw) { err.textContent = b.format === 'percent' ? 'Type the percent your ebook shows.' : 'Type the page you stopped on.'; inputs.at.focus(); return; }
                if (Number.isNaN(at)) { err.textContent = b.format === 'percent' ? 'Type a whole percent from 0 to 100, such as 45.' : 'Type a page number, such as 182.'; inputs.at.focus(); return; }
            }
            const chk = C.checkLog(b, day, at, today);
            if (chk.error) { err.textContent = chk.error; (inputs.at || inputs.h).focus(); return; }
            if (chk.back) { pendingBack[b.id] = { day, at, prev: chk.prev }; render(); focusIn(b.id, '.confirm .primary'); return; }
            addLog(b.id, day, at);
        });
        return f;
    }
    function addLog(id, day, at) {
        const b = book(id); if (!b) return;
        const snap = snapshot(), before = C.dailyAmounts(b)[day] || 0;
        b.log.push({ d: day, at });
        const read = (C.dailyAmounts(b)[day] || 0) - before;
        otherDay.delete(id);
        if (C.position(b) >= C.totalOf(b)) {
            const last = C.sortedLog(b).slice(-1)[0];
            b.status = 'finished'; b.finished = last.d; openHistory.delete(id);
            year = C.yearOf(b.finished);
            commit();
            const y = C.yearSummary(state, year, today);
            show('now-msg', 'You finished ' + q(b.title) + '! That is ' + (y.goal ? y.done + ' of ' + y.goal : C.plural(y.done, 'book', 'books')) + ' in ' + year + '.', snap);
            return;
        }
        commit();
        show('now-msg', 'Saved ' + q(b.title) + ': ' + (read ? C.fmtAmount(b.format, read) + ' read ' + dayWord(day) : 'went back to ' + C.fmtPos(b, at)) + '. ' + C.fmtAmount(b.format, C.leftOf(b)) + ' left.', snap);
        focusIn(id, '.logf input');
    }
    function historyList(b) {
        const wrap = el('div', 'history');
        wrap.appendChild(el('h4', null, 'History'));
        const l = C.sortedLog(b);
        if (!l.length) { wrap.appendChild(el('p', 'hint', 'Nothing logged yet.')); return wrap; }
        const ul = el('ul'); let prev = b.start;
        const rows = l.map(e => { const step = e.at - prev; prev = e.at; return { e, step }; }).reverse();
        rows.forEach(({ e, step }) => {
            const li = el('li');
            li.appendChild(el('span', null, C.fmtDate(e.d) + (C.yearOf(e.d) !== C.yearOf(today) ? ' ' + C.yearOf(e.d) : '') + ': ' + C.fmtPos(b, e.at) + (step > 0 ? ' (read ' + C.fmtAmount(b.format, step) + ')' : step < 0 ? ' (went back)' : '')));
            li.appendChild(btn('mini del', 'Delete', () => {
                const snap = snapshot(); b.log.splice(e.i, 1); commit();
                show('now-msg', 'Deleted the reading of ' + C.fmtDate(e.d) + ' from ' + q(b.title) + '.', snap);
            }, 'Delete the reading of ' + C.fmtDate(e.d) + ', ' + C.fmtPos(b, e.at)));
            ul.appendChild(li);
        });
        wrap.appendChild(ul);
        return wrap;
    }
    function focusIn(id, sel) {
        const li = document.querySelector('[data-id="' + id + '"]'); if (!li) return;
        const t = li.querySelector(sel); if (t) t.focus({ preventScroll: !narrow() });
    }
    function finishNow(id) {
        const b = book(id), snap = snapshot();
        b.status = 'finished'; b.finished = today; openHistory.delete(id); year = C.yearOf(today);
        commit();
        const y = C.yearSummary(state, year, today);
        show('now-msg', 'You finished ' + q(b.title) + '! That is ' + (y.goal ? y.done + ' of ' + y.goal : C.plural(y.done, 'book', 'books')) + ' in ' + year + '.', snap);
    }
    function stopBook(id) {
        const b = book(id), snap = snapshot();
        b.status = 'stopped'; openHistory.delete(id); commit();
        show('now-msg', 'Stopped reading ' + q(b.title) + '. It is under "Stopped reading" and does not count towards your goal.', snap);
    }

    function renderStats() {
        const body = $('stats-body'); body.textContent = '';
        const all = C.daily(state);
        if (!Object.keys(all).length) { body.appendChild(el('p', 'empty', 'Your streak and the pages you read each day show here after you log your first reading.')); return; }
        const st = C.streak(state, today), d30 = C.lastDays(state, today, 30), s7 = C.sumDays(d30.slice(-7)), s30 = C.sumDays(d30);
        const big = el('p', 'big');
        if (st.current) { big.appendChild(document.createTextNode('Streak: ')); big.appendChild(el('strong', null, C.plural(st.current, 'day', 'days'))); big.appendChild(document.createTextNode(st.current > 1 ? ' in a row' : '')); }
        else big.textContent = 'No streak right now.';
        body.appendChild(big);
        const sub = [];
        if (st.current && !st.readToday) sub.push('Log today’s reading to keep it going.');
        if (!st.current) sub.push('Read today to start one.');
        if (st.longest > 1) sub.push('Longest: ' + st.longest + ' days.');
        if (sub.length) body.appendChild(el('p', 'sub-line', sub.join(' ')));
        const dl = el('dl', 'totals');
        const row = (k, v) => { const w = el('div'); w.append(el('dt', null, k), el('dd', null, v)); dl.appendChild(w); };
        row('Today', all[today] ? C.amountsText(all[today]) || 'went back only' : 'Nothing logged yet');
        row('Last 7 days', s7.n ? C.amountsText(s7) + ' (on ' + s7.n + ' of 7 days)' : 'Nothing logged');
        row('Last 30 days', s30.n ? C.amountsText(s30) + ' (on ' + s30.n + ' of 30 days)' : 'Nothing logged');
        body.appendChild(dl);
        if (!s30.n) return;
        const unit = s30.pages ? 'pages' : s30.audio ? 'audio' : 'percent';
        const max = Math.max(...d30.map(x => x[unit]), 1), mixed = d30.some(x => x.any && !x[unit]);
        const fig = el('figure', 'chart-wrap');
        const cap = el('figcaption', null, (unit === 'pages' ? 'Pages read' : unit === 'audio' ? 'Minutes listened' : 'Ebook percent read') + ' each day, last 30 days. Highest: ' + C.fmtAmount(unit, max) + '.');
        const chart = el('div', 'chart'); chart.setAttribute('aria-hidden', 'true');
        d30.forEach(x => {
            const c = el('div', 'col' + (x.d === today ? ' now' : '')), s = el('span');
            const v = x[unit];
            if (v) s.style.height = Math.max(4, Math.round(100 * v / max)) + '%';
            else if (x.any) { s.style.height = '4%'; s.className = 'other'; }
            c.title = C.fmtDate(x.d) + ': ' + (x.any ? C.amountsText(x) || 'went back' : 'no reading');
            c.appendChild(s); chart.appendChild(c);
        });
        const axis = el('div', 'axis'); axis.setAttribute('aria-hidden', 'true');
        axis.append(el('span', null, C.fmtDate(d30[0].d)), el('span', null, 'Today'));
        fig.append(chart, axis, cap);
        if (mixed) fig.appendChild(el('p', 'hint', 'Small grey bars: days with only ' + (unit === 'pages' ? 'ebook percent or audiobook' : 'other') + ' reading.'));
        body.appendChild(fig);
    }

    function renderWant() {
        const list = $('want-list'), books = state.books.filter(b => b.status === 'want');
        list.textContent = ''; $('want').hidden = !books.length;
        books.forEach(b => {
            const li = el('li', 'box small'); li.dataset.id = b.id;
            const top = el('div', 'box-top'); top.append(el('h3', 'box-name', b.title), el('span', 'badge', FORMAT_NAME[b.format])); li.appendChild(top);
            const bits = [];
            if (b.author) bits.push('by ' + b.author);
            if (b.format !== 'percent') bits.push(b.format === 'audio' ? C.fmtMin(b.total) : C.fmtAmount('pages', b.total));
            if (b.by) bits.push('finish by ' + C.fmtDate(b.by));
            if (bits.length) li.appendChild(el('p', 'box-sub', bits.join(', ')));
            const btns = el('div', 'box-btns');
            btns.append(btn('mini', 'Start reading', () => {
                const snap = snapshot(); b.status = 'reading'; commit();
                show('now-msg', 'Started ' + q(b.title) + '. Log where you stop each time under "Reading now".', snap);
                if (narrow()) $('now').scrollIntoView({ block: 'start', behavior: 'smooth' });
                focusIn(b.id, '.logf input');
            }, 'Start reading ' + b.title), btn('mini', 'Edit', () => openForm(b.id), 'Edit ' + b.title));
            li.appendChild(btns); list.appendChild(li);
        });
    }

    function renderDone() {
        const list = $('done-list'), books = C.finishedIn(state, year);
        list.textContent = '';
        $('done-h').textContent = 'Finished books in ' + year;
        $('done-empty').hidden = books.length > 0;
        $('done-empty').textContent = year === C.yearOf(today) ? 'Books you finish this year are listed here, with the day you finished.' : 'No books finished in ' + year + '.';
        books.forEach((b, i) => {
            const li = el('li'); li.dataset.id = b.id;
            li.appendChild(el('span', 'num', (i + 1) + '.'));
            const t = el('div', 'done-text');
            t.appendChild(el('strong', null, b.title));
            if (b.author) t.appendChild(el('span', null, ' by ' + b.author));
            const first = C.sortedLog(b)[0];
            const took = first && first.d <= b.finished ? C.diffDays(first.d, b.finished) + 1 : 0;
            t.appendChild(el('span', 'done-sub', 'Finished ' + C.fmtDate(b.finished) + (took ? ', read in ' + C.plural(took, 'day', 'days') : '')));
            li.append(t, btn('mini', 'Edit', () => openForm(b.id), 'Edit ' + b.title));
            list.appendChild(li);
        });
        const stopped = state.books.filter(b => b.status === 'stopped'), sl = $('stopped-list');
        sl.textContent = ''; $('stopped-wrap').hidden = !stopped.length;
        stopped.forEach(b => {
            const li = el('li'); li.dataset.id = b.id;
            const t = el('div', 'done-text');
            t.appendChild(el('strong', null, b.title));
            t.appendChild(el('span', 'done-sub', 'Stopped at ' + C.fmtPos(b, C.position(b)) + (b.format === 'pages' ? ' of ' + b.total : '')));
            const bb = el('div', 'done-btns');
            bb.append(btn('mini', 'Read again', () => {
                const snap = snapshot(); b.status = 'reading'; commit();
                show('now-msg', q(b.title) + ' is back under "Reading now".', snap);
            }, 'Read ' + b.title + ' again'), btn('mini', 'Edit', () => openForm(b.id), 'Edit ' + b.title));
            li.append(t, bb); sl.appendChild(li);
        });
    }

    // ---------- the add / edit form ----------
    const radio = name => document.querySelector('input[name="' + name + '"]:checked').value;
    const setRadio = (name, v) => { const r = document.querySelector('input[name="' + name + '"][value="' + v + '"]'); if (r) r.checked = true; };
    function syncForm() {
        const f = radio('format'), st = radio('status');
        $('w-pages').hidden = f !== 'pages'; $('w-len').hidden = f !== 'audio';
        $('h-format').textContent = f === 'percent' ? 'You will type the percent your ebook shows, from 0 to 100.' : f === 'audio' ? 'You will type how far in you are, or the time left.' : '';
        $('w-done').hidden = st !== 'finished';
        $('w-reading-opts').hidden = st === 'finished';
        $('start-pages').hidden = f === 'audio'; $('start-hm').hidden = f !== 'audio';
        $('start-pre').hidden = f !== 'pages'; $('start-suf').hidden = f !== 'percent';
        $('h-start').textContent = f === 'audio' ? 'Time before this is not counted as listened today.' : f === 'percent' ? 'The percent before this is not counted as read today.' : 'Pages before this are not counted as read today.';
        $('save').textContent = editing !== null ? 'Save changes' : st === 'want' ? 'Add to Want to read' : st === 'finished' ? 'Add as finished' : 'Add the book';
        preview();
    }
    function readForm() {
        const errs = {}, f = radio('format'), st = radio('status');
        const old = editing !== null ? book(editing) : null, logs = old ? C.sortedLog(old) : [];
        const title = C.cleanText($('f-title').value, C.LIMITS.title);
        if (!title) errs.title = 'Type the book title.';
        let total = 100;
        if (f === 'pages') {
            const raw = $('f-pages').value.trim(); total = C.readInt(raw);
            if (!raw) errs.total = 'Type the number of pages.';
            else if (Number.isNaN(total) || total < 1 || total > C.LIMITS.pages) errs.total = 'Type a whole number of pages from 1 to ' + C.LIMITS.pages.toLocaleString('en') + '.';
        } else if (f === 'audio') {
            total = C.readHM($('f-lh').value, $('f-lm').value);
            if (Number.isNaN(total) || total < 1) errs.total = 'Type the length in hours and minutes, such as 9 h 30 min.';
            else if (total > C.LIMITS.audio) errs.total = 'An audiobook can be up to 200 hours here.';
        }
        const maxAt = logs.length ? Math.max(...logs.map(e => e.at)) : 0;
        if (!errs.total && maxAt > total) errs.total = 'You have logged ' + C.fmtPos({ format: f }, maxAt) + ', so the book cannot be shorter than that. Delete that entry under History first.';
        let start = 0;
        if (!$('w-start').hidden && st !== 'finished') {
            if (f === 'audio') { const hs = $('f-sh').value.trim(), ms = $('f-sm').value.trim(); start = hs || ms ? C.readHM(hs, ms) : 0; }
            else { const raw = $('f-start').value.trim(); start = raw ? C.readInt(raw) : 0; }
            if (Number.isNaN(start)) errs.start = f === 'audio' ? 'Type the hours and minutes, or leave it empty.' : f === 'percent' ? 'Type a whole percent, or leave it empty.' : 'Type the page you are on, or leave it empty.';
            else if (!errs.total && start >= total) errs.start = f === 'pages' ? 'That is the last page or past it. Choose "Already finished" instead.' : 'That is the end of the book. Choose "Already finished" instead.';
            else if (logs.length && start > logs[0].at) errs.start = 'Your first reading was at ' + C.fmtPos({ format: f }, logs[0].at) + ', so you started on that or earlier.';
        } else if (old) start = Math.min(old.start, Math.max(0, total - 1));
        let by = '';
        if (!$('w-by').hidden && st !== 'finished') {
            by = $('f-by').value;
            if (by && !C.isIso(by)) errs.by = 'Pick a date, or leave it empty.';
            else if (by && by < today && !(old && old.by === by)) errs.by = 'Pick today or a later day.';
        } else if (old && st !== 'finished') by = old.by;
        let finished = '';
        if (st === 'finished') {
            finished = $('f-done').value;
            if (!C.isIso(finished)) errs.done = 'Pick the day you finished it.';
            else if (finished > today) errs.done = 'That day has not come yet. Pick today or an earlier day.';
            else if (logs.length && finished < logs[logs.length - 1].d) errs.done = 'Your last reading was on ' + C.fmtDateY(logs[logs.length - 1].d) + ', so pick that day or later.';
        }
        return { errs, data: { title, author: $('w-author').hidden ? (old ? old.author : '') : C.cleanText($('f-author').value, C.LIMITS.author), format: f, total, start, status: st, by, finished } };
    }
    function showErrs(errs) {
        ['title', 'total', 'start', 'by', 'done'].forEach(k => { $('e-' + k).textContent = errs[k] || ''; });
        ['f-title', 'f-pages', 'f-lh', 'f-lm', 'f-start', 'f-sh', 'f-sm', 'f-by', 'f-done'].forEach(i => $(i).removeAttribute('aria-invalid'));
        if (errs.title) $('f-title').setAttribute('aria-invalid', 'true');
        if (errs.total) (radio('format') === 'audio' ? ['f-lh', 'f-lm'] : ['f-pages']).forEach(i => $(i).setAttribute('aria-invalid', 'true'));
        if (errs.start) (radio('format') === 'audio' ? ['f-sh', 'f-sm'] : ['f-start']).forEach(i => $(i).setAttribute('aria-invalid', 'true'));
        if (errs.by) $('f-by').setAttribute('aria-invalid', 'true');
        if (errs.done) $('f-done').setAttribute('aria-invalid', 'true');
    }
    function preview() {
        const { errs, data } = readForm(), p = $('preview');
        p.textContent = '';
        if (!data.title || errs.total || (data.format !== 'percent' && !data.total)) return;
        const dup = state.books.find(b => b.id !== editing && b.title.toLowerCase() === data.title.toLowerCase());
        let t = '';
        if (data.status === 'finished') t = C.isIso(data.finished) && data.finished <= today ? 'Counts as finished in ' + C.yearOf(data.finished) + '.' : '';
        else if (data.status === 'want') t = 'Goes on your Want to read list.';
        else {
            const left = C.totalOf(data) - (data.start || 0);
            t = C.fmtAmount(data.format, left) + ' to go.';
            if (data.by && data.by >= today) {
                const plan = C.finishPlan(Object.assign({ log: editing !== null ? book(editing).log : [] }, data), today);
                if (plan && !plan.passed) t += ' To finish by ' + C.fmtDate(data.by) + ': ' + C.fmtAmount(data.format, plan.perDay) + ' a day.';
            }
        }
        if (dup) t += ' You already have ' + q(dup.title) + (dup.status === 'finished' ? ' (finished ' + C.fmtDateY(dup.finished) + ')' : '') + '; it will be added again, for example as a re-read.';
        p.textContent = t.trim();
    }
    function resetFields() {
        $('form').reset(); setRadio('format', 'pages'); setRadio('status', 'reading');
        ['w-author', 'w-start', 'w-by'].forEach(i => { $(i).hidden = true; });
        ['o-author', 'o-start', 'o-by'].forEach(i => { $(i).hidden = false; });
        document.querySelectorAll('input[name="format"]').forEach(r => { r.disabled = false; });
        $('st-stopped').hidden = true; $('lb-stopped').hidden = true;
        $('f-done').value = today; $('f-done').max = today; $('f-by').min = today;
        showErrs({});
    }
    function openForm(id) {
        editing = id; resetFields();
        const b = book(id);
        $('form').hidden = false; $('del').hidden = false; $('open-form').hidden = true;
        $('form-h').textContent = 'Edit ' + q(b.title);
        $('f-title').value = b.title;
        if (b.author) { $('w-author').hidden = false; $('o-author').hidden = true; $('f-author').value = b.author; }
        setRadio('format', b.format);
        if (b.log.length) document.querySelectorAll('input[name="format"]').forEach(r => { r.disabled = r.value !== b.format; });
        if (b.format === 'pages') $('f-pages').value = b.total;
        if (b.format === 'audio') { $('f-lh').value = Math.floor(b.total / 60); $('f-lm').value = b.total % 60; }
        $('st-stopped').hidden = false; $('lb-stopped').hidden = false;
        setRadio('status', b.status);
        if (b.finished) $('f-done').value = b.finished;
        $('w-start').hidden = false; $('o-start').hidden = true;
        if (b.format === 'audio') { $('f-sh').value = b.start ? Math.floor(b.start / 60) : ''; $('f-sm').value = b.start ? b.start % 60 : ''; }
        else $('f-start').value = b.start || '';
        if (b.by) { $('w-by').hidden = false; $('o-by').hidden = true; $('f-by').value = b.by; $('f-by').min = b.by < today ? b.by : today; }
        $('h-format').textContent = '';
        syncForm();
        if (b.log.length) $('h-format').textContent = 'The format cannot change after you have logged reading.';
        $('add').scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('f-title').focus({ preventScroll: true });
    }
    function closeForm() {
        editing = null; resetFields();
        $('form-h').textContent = 'Add a book'; $('del').hidden = true;
        // after the first book the form folds away behind "+ Add a book" so the page stays short
        const fold = state && state.books.length > 0;
        $('form').hidden = fold; $('open-form').hidden = !fold;
        syncForm();
    }
    function bindForm() {
        $('open-form').addEventListener('click', () => { $('form').hidden = false; $('open-form').hidden = true; $('f-title').focus(); });
        [['o-author', 'w-author', 'f-author'], ['o-start', 'w-start', null], ['o-by', 'w-by', 'f-by']].forEach(([o, w, f]) => {
            $(o).addEventListener('click', () => {
                $(w).hidden = false; $(o).hidden = true;
                const t = f ? $(f) : (radio('format') === 'audio' ? $('f-sh') : $('f-start')); t.focus(); preview();
            });
        });
        document.querySelectorAll('input[name="format"], input[name="status"]').forEach(r => r.addEventListener('change', syncForm));
        $('form').addEventListener('input', preview);
        $('cancel').addEventListener('click', () => { closeForm(); clearMsg('form-msg'); });
        $('form').addEventListener('submit', ev => {
            ev.preventDefault();
            const { errs, data } = readForm(); showErrs(errs);
            const firstBad = ['title', 'total', 'start', 'by', 'done'].find(k => errs[k]);
            if (firstBad) { const t = { title: 'f-title', total: radio('format') === 'audio' ? 'f-lh' : 'f-pages', start: radio('format') === 'audio' ? 'f-sh' : 'f-start', by: 'f-by', done: 'f-done' }[firstBad]; $(t).focus(); return; }
            const snap = snapshot();
            if (editing !== null) {
                const b = book(editing);
                Object.assign(b, { title: data.title, author: data.author, total: data.total, start: data.start, status: data.status, by: data.by, finished: data.status === 'finished' ? data.finished : '' });
                if (!b.log.length) b.format = data.format;
                if (b.status === 'finished') year = C.yearOf(b.finished);
                closeForm(); commit();
                show('form-msg', 'Saved the changes to ' + q(b.title) + '.', snap);
                return;
            }
            const b = { id: state.seq++, title: data.title, author: data.author, format: data.format, total: data.total, start: data.status === 'finished' ? 0 : data.start, status: data.status, added: today, by: data.status === 'finished' ? '' : data.by, finished: data.status === 'finished' ? data.finished : '', log: [] };
            state.books.push(b);
            if (b.status === 'finished') year = C.yearOf(b.finished);
            closeForm(); commit();
            show('form-msg', b.status === 'finished' ? 'Added ' + q(b.title) + ' to the books finished in ' + C.yearOf(b.finished) + '.' : b.status === 'want' ? 'Added ' + q(b.title) + ' to Want to read.' : 'Added ' + q(b.title) + '. Log where you stop under "Reading now".', snap);
            if (b.status === 'reading' && narrow()) { $('now').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
            if (b.status === 'reading') focusIn(b.id, '.logf input');
        });
        $('del').addEventListener('click', () => {
            const b = book(editing); if (!b) return;
            const snap = snapshot();
            state.books = state.books.filter(x => x.id !== b.id); openHistory.delete(b.id);
            closeForm(); commit();
            show('form-msg', 'Deleted ' + q(b.title) + '.', snap);
        });
    }

    // ---------- goal, year, share, backup ----------
    function bindRest() {
        $('goal-open').addEventListener('click', () => {
            $('goal-form').hidden = false; $('goal-open').hidden = true;
            $('goal-n').value = state.goals[String(year)] || ''; $('goal-e').textContent = ''; $('goal-n').focus();
        });
        $('goal-form').addEventListener('submit', ev => {
            ev.preventDefault();
            const raw = $('goal-n').value.trim(), n = C.readInt(raw), snap = snapshot();
            if (raw && (Number.isNaN(n) || n < 1 || n > C.LIMITS.goal)) { $('goal-e').textContent = 'Type a whole number of books from 1 to ' + C.LIMITS.goal + ', or leave it empty.'; $('goal-n').setAttribute('aria-invalid', 'true'); $('goal-n').focus(); return; }
            $('goal-n').removeAttribute('aria-invalid'); $('goal-e').textContent = '';
            const had = state.goals[String(year)];
            if (raw) state.goals[String(year)] = n; else delete state.goals[String(year)];
            $('goal-form').hidden = true; $('goal-open').hidden = false;
            commit();
            show('goal-msg', raw ? 'Your goal for ' + year + ' is ' + C.plural(n, 'book', 'books') + '.' : had ? 'Removed the goal for ' + year + '.' : 'No goal set.', had !== (raw ? n : undefined) ? snap : null);
        });
        $('year').addEventListener('change', () => { year = Number($('year').value); $('goal-form').hidden = true; $('goal-open').hidden = false; render(); });
        $('copy').addEventListener('click', () => copyText(C.listText(state, year, today)).then(ok => show('set-msg', ok ? 'Copied the books of ' + year + '. Paste it in a chat or a note.' : 'Could not copy here. Use "Email my book list" instead.')));
        $('backup').addEventListener('click', () => {
            download('reading-log-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1));
            show('set-msg', 'Saved a backup file with ' + C.plural(state.books.length, 'book', 'books') + '. Keep it somewhere safe.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', () => {
            const f = $('restore-file').files[0]; $('restore-file').value = '';
            if (!f) return;
            if (f.size > 5e6) { show('set-msg', 'That file is too big to be a backup from this app, so nothing was changed.'); return; }
            const r = new FileReader();
            r.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(r.result)); } catch (e) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app, so nothing was changed.'); return; }
                const snap = snapshot(); state = s; closeForm(); commit();
                show('set-msg', 'Restored ' + C.plural(s.books.length, 'book', 'books') + ' from the backup.', snap);
            };
            r.onerror = () => show('set-msg', 'Could not read that file, so nothing was changed.');
            r.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.books.length && !Object.keys(state.goals).length) { show('set-msg', 'There is nothing to delete.'); return; }
            const snap = snapshot(); state = C.emptyState(); openHistory.clear(); closeForm(); commit();
            show('set-msg', 'Deleted everything.', snap);
        });
        // a new day: the days left, today and the streak move on by themselves
        const tick = () => { if (C.todayIso() !== today) { const old = C.yearOf(today); render(); if (year === old && C.yearOf(today) !== old) { year = C.yearOf(today); render(); } } };
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        setInterval(tick, 60000);
    }

    // ---------- start ----------
    state = load();
    bindForm(); bindRest();
    closeForm();
    save(); render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
