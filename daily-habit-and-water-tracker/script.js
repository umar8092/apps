// Daily Habit and Water Tracker: the page. The date maths, goals and streaks live in core.js.
(function () {
    const H = window.HabitCore;
    const SLUG = 'daily-habit-and-water-tracker';
    const KEY = SLUG + '.state';
    const URL_APP = 'https://umar8092.github.io/apps/' + SLUG + '/';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const today = () => H.fromDate(new Date());

    const PICKS = [
        { label: 'Drink water (8 glasses)', name: 'Drink water', kind: 'count', target: 8, unit: 'glasses', step: 1, color: '#0891b2' },
        { label: 'Drink water (2,000 ml)', name: 'Drink water', kind: 'count', target: 2000, unit: 'ml', step: 250, color: '#0891b2' },
        { label: 'Walk 10,000 steps', name: 'Walk', kind: 'count', target: 10000, unit: 'steps', step: 1000, color: '#22c55e' },
        { label: 'Read 20 minutes', name: 'Read', kind: 'count', target: 20, unit: 'minutes', step: 5, color: '#8b5cf6' },
        { label: 'Exercise 3 times a week', name: 'Exercise', kind: 'check', sched: { type: 'week', times: 3 }, color: '#f97316' },
        { label: 'Take vitamins', name: 'Take vitamins', kind: 'check', color: '#f59e0b' },
        { label: 'Meditate', name: 'Meditate', kind: 'check', color: '#3b82f6' },
        { label: 'Stretch', name: 'Stretch', kind: 'check', color: '#22c55e' },
        { label: 'Floss teeth', name: 'Floss teeth', kind: 'check', color: '#64748b' },
        { label: 'No sugar', name: 'No sugar', kind: 'check', color: '#f43f5e' },
        { label: 'In bed by 11 pm', name: 'In bed by 11 pm', kind: 'check', color: '#8b5cf6' },
        { label: 'Coffee: no more than 2', name: 'Coffee', kind: 'limit', target: 2, unit: 'cups', step: 1, color: '#f97316' }
    ];

    // ---------- saved state
    const lang = navigator.language || '';
    const defaultWs = /-(US|CA|BR|JP|MX|PH|IL|KR|TW|ZA)\b/i.test(lang) ? 0 : 1;
    let storageOk = true, brokeOnLoad = false;
    const fresh = () => ({ habits: [], log: {}, weekStart: defaultWs });
    let state = load();
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; return fresh(); }
        if (!raw) return fresh();
        try { const s = H.clean(JSON.parse(raw)); if (s) return s; } catch (e) { /* falls through */ }
        brokeOnLoad = true;
        try { localStorage.setItem(KEY + '.broken', raw); } catch (e) { /* nothing more to do */ }
        return fresh();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; } catch (e) { storageOk = false; }
        storageNote();
    }
    const snapshot = () => JSON.stringify(state);
    const restore = snap => { state = H.clean(JSON.parse(snap)) || fresh(); save(); };

    // ---------- what is on screen
    let now = today();
    let view = now;
    const openDetails = new Set();
    let lastMsg = null; // { where: habit id or 'list', text, snap }
    let typing = null;  // habit id whose "Type the amount" row is open
    const minDay = () => H.add(now, -730);

    // ---------- words for dates
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const fmt = (d, year) => { const [y, m, dd] = d.split('-').map(Number); return H.DAY3[H.dow(d)] + ' ' + dd + ' ' + MON[m - 1] + (year ? ' ' + y : ''); };
    const dayName = d => d === now ? 'Today' : d === H.add(now, -1) ? 'Yesterday' : FULL[H.dow(d)];
    const STATE_WORDS = { met: 'done', extra: 'done (not planned)', missed: 'missed', skip: 'skipped', rest: 'not planned', todo: 'to do', ontrack: 'under the limit so far', open: 'not done', future: 'still to come', before: 'before the habit started' };

    function storageNote() {
        const m = $('storage-msg');
        if (!storageOk) { m.textContent = 'This browser is not letting the app save (private mode or storage turned off). Your habits will be lost when you close the page.'; m.className = 'msg show bad'; }
        else if (brokeOnLoad) { m.textContent = 'Your saved habits could not be read, so the app started fresh. A copy of the old data was kept on this device.'; m.className = 'msg show bad'; }
        else { m.textContent = ''; m.className = 'msg'; }
    }

    // ---------- top: day and summary
    function renderDay() {
        $('day-title').textContent = dayName(view);
        $('day-date').textContent = fmt(view, true);
        $('prev').disabled = view <= minDay();
        $('next').disabled = view >= now;
        $('past-note').hidden = view === now;
        const t = H.dayTotals(state.habits, state.log, view, now, state.weekStart), big = $('sum-big'), meta = $('sum-meta');
        $('sum-box').hidden = false;
        big.className = 'big';
        if (!state.habits.length) {
            big.textContent = 'Start with one habit'; big.className = 'big muted';
            meta.textContent = 'Drinking enough water is a good first one.';
            $('sum-bar').style.width = '0%';
            return;
        }
        if (!t.list.length) {
            big.textContent = 'No habits on this day'; big.className = 'big muted';
            meta.textContent = 'Your habits started after ' + fmt(view) + '.';
            $('sum-bar').style.width = '0%';
            return;
        }
        if (!t.due) {
            big.textContent = 'Nothing planned'; big.className = 'big muted';
            meta.textContent = view === now ? 'No habit is planned for today. Enjoy the rest day.' : 'No habit was planned for this day.';
            $('sum-bar').style.width = '0%';
            return;
        }
        big.textContent = t.done + ' of ' + t.due + ' done' + (view === now ? ' today' : '');
        if (t.done === t.due) big.className = 'big good';
        $('sum-bar').style.width = Math.round(100 * t.done / t.due) + '%';
        const left = t.list.filter(i => i.due && !i.done);
        if (!left.length) meta.textContent = view === now ? 'All done for today. Well done!' : 'Everything was done on this day.';
        else meta.textContent = (view === now ? 'Still to do: ' : 'Not done: ') + left.map(i => i.h.name + (i.v.kind === 'count' ? ' (' + H.amount(i.v.target - i.n, i.v.unit) + ' to go)' : '')).join(', ') + '.';
    }

    // ---------- the habit boxes
    function setMsg(where, text, snap) { lastMsg = { where, text, snap }; }
    function msgNode(where) {
        const box = el('p', 'msg');
        box.setAttribute('role', 'status');
        if (lastMsg && lastMsg.where === where) {
            box.className = 'msg show';
            box.appendChild(document.createTextNode(lastMsg.text + ' '));
            if (lastMsg.snap) {
                const u = el('button', 'link inline undo', 'Undo'); u.type = 'button'; u.dataset.fk = 'undo-' + where;
                const snap = lastMsg.snap;
                u.addEventListener('click', () => { restore(snap); lastMsg = { where, text: 'Undone.', snap: null }; renderAll(); focusKey('list-top'); });
                box.appendChild(u);
            }
        }
        return box;
    }
    // change one habit's amount on the day being viewed
    function change(h, n, skip, words) {
        const snap = snapshot();
        H.setN(state.log, h.id, view, n, skip);
        save();
        const i = H.info(h, state.log, view, now, state.weekStart);
        setMsg(h.id, words || H.statusText(i, view === now) + '.', snap);
        renderAll();
    }

    function stripNode(h) {
        const ws = H.weekStart(view, state.weekStart), wrap = el('div', 'strip');
        wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Week of ' + fmt(ws));
        for (let k = 0; k < 7; k++) {
            const d = H.add(ws, k), st = H.dayState(h, state.log, d, now), b = el('button', 'sd ' + st);
            b.type = 'button'; b.dataset.fk = 'sd-' + h.id + '-' + d;
            b.appendChild(el('span', 'sd-w', H.DAY3[H.dow(d)].slice(0, 2)));
            b.appendChild(el('span', 'sd-n', String(Number(d.slice(8)))));
            b.appendChild(el('span', 'sd-m', st === 'met' || st === 'extra' ? '✓' : st === 'missed' ? '–' : st === 'skip' ? 'S' : st === 'rest' ? '·' : ''));
            b.setAttribute('aria-label', fmt(d) + ': ' + STATE_WORDS[st] + (d === view ? ' (showing)' : ''));
            if (d === view) b.setAttribute('aria-current', 'date');
            if (d > now || d < minDay()) b.disabled = true;
            else b.addEventListener('click', () => { view = d; lastMsg = null; typing = null; renderAll(); focusKey('sd-' + h.id + '-' + d); });
            wrap.appendChild(b);
        }
        return wrap;
    }

    function detailsNode(h) {
        const box = el('div', 'details'), v = H.settings(h, now) || h.versions[h.versions.length - 1];
        const s = H.streak(h, state.log, now, state.weekStart), r = H.rate(h, state.log, now, state.weekStart);
        const u = s.unit === 'week' ? 'week' : 'day', pl = n => n + ' ' + u + (n === 1 ? '' : 's');
        let total = 0;
        Object.keys(state.log[h.id] || {}).forEach(d => { const st = H.dayState(h, state.log, d, now); if (st === 'met' || st === 'extra') total++; });
        const tiles = el('div', 'tiles');
        const tile = (label, val, sub) => { const t = el('div', 'tile'); t.appendChild(el('span', 't-label', label)); t.appendChild(el('span', 't-val', val)); if (sub) t.appendChild(el('span', 't-sub', sub)); tiles.appendChild(t); };
        tile('Streak now', pl(s.cur), H.first(h) === now ? 'Started today' : 'Started ' + fmt(H.first(h), true));
        tile('Best streak', pl(s.best));
        tile(r.unit === 'week' ? 'Last 5 weeks' : 'Last 30 days', r.of ? Math.round(100 * r.met / r.of) + '%' : '-', r.of ? r.met + ' of ' + r.of + ' ' + (r.unit === 'week' ? 'weeks' : 'planned days') : 'Nothing to count yet');
        tile('Days done in total', String(total));
        box.appendChild(tiles);
        // 12 weeks, one column per week, one row per day
        const end = H.add(H.weekStart(now, state.weekStart), 6), start = H.add(end, -83);
        const g = el('div', 'grid12'), lab = el('div', 'g-days');
        lab.setAttribute('aria-hidden', 'true');
        for (let k = 0; k < 7; k++) lab.appendChild(el('span', '', k % 2 === 0 ? H.DAY3[(state.weekStart + k) % 7].slice(0, 1) : ''));
        const cells = el('div', 'g-cells');
        let met = 0, of = 0;
        for (let k = 0; k < 84; k++) {
            const d = H.add(start, k), st = H.dayState(h, state.log, d, now), c = el('span', 'gc ' + st);
            c.title = fmt(d, true) + ': ' + STATE_WORDS[st];
            if (st === 'met') { met++; of++; } else if (st === 'missed') of++;
            cells.appendChild(c);
        }
        cells.setAttribute('role', 'img');
        cells.setAttribute('aria-label', 'Last 12 weeks: ' + (v.sched.type === 'week' ? met + ' days done' : 'done on ' + met + ' of ' + of + ' planned days that are over'));
        g.appendChild(lab); g.appendChild(cells);
        box.appendChild(el('h4', 'small-h', 'Last 12 weeks'));
        box.appendChild(g);
        const legend = $('legend').cloneNode(true); legend.hidden = false; legend.removeAttribute('id');
        box.appendChild(legend);
        // calendar reminder
        const rem = el('div', 'reminder'), lbl = el('label', '', 'Remind me at'), tin = el('input'), btn = el('button', 'secondary', 'Add reminder to my calendar');
        tin.type = 'time'; tin.value = h.id === remindFor.id ? remindFor.time : '09:00'; tin.id = 'rt-' + h.id; lbl.htmlFor = tin.id; tin.dataset.fk = 'rt-' + h.id;
        tin.addEventListener('change', () => { remindFor = { id: h.id, time: tin.value }; });
        btn.type = 'button'; btn.dataset.fk = 'rb-' + h.id;
        const note = el('p', 'hint', v.sched.type === 'days' ? 'Your calendar app will remind you on ' + H.schedText(v, state.weekStart) + '.' : v.sched.type === 'week' ? 'Your calendar app will remind you every day (any ' + v.sched.times + ' days of the week count).' : 'Your calendar app will remind you every day.');
        const err = el('p', 'err'); err.setAttribute('role', 'alert');
        btn.addEventListener('click', () => {
            if (!/^\d{2}:\d{2}$/.test(tin.value)) { err.textContent = 'Choose a time first, like 09:00.'; return; }
            err.textContent = '';
            const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
            download(H.ics(h, v, tin.value, now, stamp), fileName(h.name) + '-reminder.ics', 'text/calendar');
            note.textContent = 'Reminder file saved. Open it to add it to your calendar.';
        });
        rem.appendChild(lbl); rem.appendChild(tin); rem.appendChild(btn); rem.appendChild(err); rem.appendChild(note);
        box.appendChild(rem);
        return box;
    }
    let remindFor = { id: '', time: '09:00' };

    function habitNode(h, i) {
        const v = i.v, li = el('li', 'habit' + (i.state === 'rest' ? ' resting' : '') + (i.done ? ' is-done' : ''));
        li.style.setProperty('--hc', h.color);
        li.id = 'h-' + h.id;
        const head = el('div', 'h-head');
        head.appendChild(el('h3', 'h-name', h.name));
        head.appendChild(el('p', 'h-plan', (v.kind === 'check' ? '' : H.goalText(v) + ' · ') + H.schedText(v, state.weekStart)));
        li.appendChild(head);
        const status = el('p', 'h-status ' + (i.state === 'missed' ? 'bad' : i.done || i.state === 'met' ? 'good' : ''), H.statusText(i, view === now));
        li.appendChild(status);

        const ctl = el('div', 'h-ctl');
        if (v.kind === 'check') {
            const b = el('button', 'tick' + (i.n >= 1 ? ' on' : ''), i.n >= 1 ? '✓ Done' : 'Mark as done');
            b.type = 'button'; b.dataset.fk = 'tick-' + h.id;
            b.setAttribute('aria-pressed', String(i.n >= 1));
            b.setAttribute('aria-label', h.name + ': ' + (i.n >= 1 ? 'done, tap to take it back' : 'mark as done'));
            b.addEventListener('click', () => change(h, i.n >= 1 ? 0 : 1, i.skipped && i.n >= 1, i.n >= 1 ? h.name + ': taken back.' : h.name + ': done.'));
            ctl.appendChild(b);
        } else {
            const minus = el('button', 'step minus', '−'), plus = el('button', 'step plus', '+ ' + H.amount(v.step, v.unit));
            minus.type = plus.type = 'button';
            minus.dataset.fk = 'minus-' + h.id; plus.dataset.fk = 'plus-' + h.id;
            minus.setAttribute('aria-label', 'Take off ' + H.amount(v.step, v.unit) + ' from ' + h.name);
            plus.setAttribute('aria-label', 'Add ' + H.amount(v.step, v.unit) + ' to ' + h.name);
            minus.disabled = i.n <= 0;
            plus.disabled = i.n >= H.MAX_N;
            minus.addEventListener('click', () => change(h, Math.max(0, i.n - v.step), i.skipped));
            plus.addEventListener('click', () => change(h, Math.min(H.MAX_N, i.n + v.step), false));
            const num = el('div', 'num');
            num.appendChild(el('span', 'num-n', H.fmtN(i.n)));
            num.appendChild(el('span', 'num-t', '/ ' + H.fmtN(v.target) + (v.unit ? ' ' + H.unitText(v.unit, v.target) : '')));
            num.setAttribute('aria-hidden', 'true');
            ctl.appendChild(minus); ctl.appendChild(num); ctl.appendChild(plus);
        }
        li.appendChild(ctl);
        if (v.kind !== 'check') {
            const pct = v.target ? Math.min(100, Math.round(100 * i.n / v.target)) : (i.n ? 100 : 0);
            const tr = el('div', 'track' + (v.kind === 'limit' ? ' limit' : '') + (v.kind === 'limit' && i.n > v.target ? ' over' : ''));
            tr.setAttribute('aria-hidden', 'true');
            const bar = el('span', 'bar'); bar.style.width = pct + '%'; tr.appendChild(bar);
            li.appendChild(tr);
            if (typing === h.id) {
                const row = el('div', 'type-row'), lab = el('label', '', 'Amount for ' + (view === now ? 'today' : fmt(view)) + (v.unit ? ' (' + v.unit + ')' : '')), inp = el('input'), ok = el('button', 'primary small', 'Save'), no = el('button', 'secondary small', 'Cancel'), er = el('p', 'err');
                inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 12; inp.autocomplete = 'off'; inp.id = 'amt-' + h.id; lab.htmlFor = inp.id; inp.value = String(i.n); inp.dataset.fk = 'amt-' + h.id;
                ok.type = no.type = 'button'; er.setAttribute('role', 'alert'); er.id = 'amt-err-' + h.id; inp.setAttribute('aria-describedby', er.id);
                const done = () => {
                    const p = H.parseWhole(inp.value, 0, H.MAX_N);
                    if (p.error) { er.textContent = numErr(p, 0, H.MAX_N); inp.setAttribute('aria-invalid', 'true'); return; }
                    typing = null; change(h, p.n, i.skipped && p.n === 0);
                    focusKey('type-' + h.id);
                };
                const cancel = () => { typing = null; renderAll(); focusKey('type-' + h.id); };
                ok.addEventListener('click', done); no.addEventListener('click', cancel);
                inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } else if (e.key === 'Escape') { e.preventDefault(); cancel(); } });
                const btns = el('div', 'type-btns'); btns.appendChild(no); btns.appendChild(ok);
                row.appendChild(lab); row.appendChild(inp); row.appendChild(er); row.appendChild(btns);
                li.appendChild(row);
            }
        }
        li.appendChild(stripNode(h));
        li.appendChild(el('p', 'h-streak', H.streakText(H.streak(h, state.log, now, state.weekStart))));

        const acts = el('div', 'h-acts');
        const mk = (text, key, fn) => { const b = el('button', 'act', text); b.type = 'button'; b.dataset.fk = key + '-' + h.id; b.addEventListener('click', fn); acts.appendChild(b); return b; };
        if (v.kind !== 'check') mk(typing === h.id ? 'Close amount' : 'Type the amount', 'type', () => { typing = typing === h.id ? null : h.id; renderAll(); if (typing) { const a = $('amt-' + h.id); a.focus(); a.select(); } else focusKey('type-' + h.id); });
        mk(i.skipped ? 'Undo skip' : 'Skip this day', 'skip', () => change(h, i.n, !i.skipped, i.skipped ? h.name + ': no longer skipped.' : h.name + ': skipped on ' + fmt(view) + '. The streak is not broken.'));
        const det = mk(openDetails.has(h.id) ? 'Hide details' : 'Details', 'det', () => { openDetails.has(h.id) ? openDetails.delete(h.id) : openDetails.add(h.id); renderAll(); focusKey('det-' + h.id); });
        det.setAttribute('aria-expanded', String(openDetails.has(h.id)));
        mk('Edit', 'edit', () => openForm(h));
        li.appendChild(acts);
        if (openDetails.has(h.id)) li.appendChild(detailsNode(h));
        li.appendChild(msgNode(h.id));
        return li;
    }

    function renderList() {
        const list = $('list');
        list.textContent = '';
        let hidden = 0;
        state.habits.forEach(h => {
            const i = H.info(h, state.log, view, now, state.weekStart);
            if (!i) { hidden++; return; }
            list.appendChild(habitNode(h, i));
        });
        $('empty').hidden = state.habits.length > 0;
        const hn = $('hidden-note');
        hn.hidden = !hidden;
        hn.textContent = hidden ? (hidden === 1 ? '1 habit started' : hidden + ' habits started') + ' after ' + fmt(view) + ', so ' + (hidden === 1 ? 'it is' : 'they are') + ' not shown. To fill in earlier days, tap Edit on the habit and set Started on earlier.' : '';
        const lm = $('list-msg'), node = msgNode('list');
        lm.textContent = ''; lm.className = node.className;
        while (node.firstChild) lm.appendChild(node.firstChild);
    }

    // ---------- this week table
    function weekRows(ws) {
        return state.habits.map(h => {
            const days = [];
            let met = 0, planned = 0;
            for (let k = 0; k < 7; k++) {
                const d = H.add(ws, k), st = H.dayState(h, state.log, d, now), dv = H.settings(h, d), e = H.entry(state.log, h, d);
                days.push({ d, st, n: e.n });
                if (st === 'met') met++;
                if (dv && !e.s && dv.sched.type !== 'week' && H.planned(dv, d)) planned++;
            }
            const v = H.settings(h, H.add(ws, 6) < now ? H.add(ws, 6) : now) || H.settings(h, H.add(ws, 6));
            let sub = '';
            if (!v) sub = 'Starts later';
            else if (v.sched.type === 'week') { const w = H.week(h, state.log, ws, now); sub = w ? w.done + ' of ' + w.target + ' times' : ''; }
            else if (v.kind === 'limit') sub = 'Kept ' + met + ' of ' + planned + ' days';
            else sub = met + ' of ' + planned + ' days';
            return { h, v, days, sub };
        });
    }
    function renderWeek() {
        const ws = H.weekStart(view, state.weekStart);
        $('week-h').textContent = ws === H.weekStart(now, state.weekStart) ? 'This week' : 'Week of ' + fmt(ws);
        $('week-range').textContent = fmt(ws) + ' to ' + fmt(H.add(ws, 6), true);
        const has = state.habits.length > 0;
        $('wk').hidden = !has; $('legend').hidden = !has; $('week-empty').hidden = has;
        ['copy', 'print'].forEach(id => { $(id).disabled = !has; });
        $('email').setAttribute('aria-disabled', String(!has));
        const head = $('wk-head');
        while (head.children.length > 1) head.removeChild(head.lastChild);
        for (let k = 0; k < 7; k++) {
            const d = H.add(ws, k), th = el('th', d === now ? 'is-today' : '');
            th.scope = 'col';
            th.appendChild(el('span', 'wd', H.DAY3[H.dow(d)].slice(0, 2)));
            th.appendChild(el('span', 'wn', String(Number(d.slice(8)))));
            th.setAttribute('aria-label', fmt(d));
            head.appendChild(th);
        }
        const body = $('wk-body');
        body.textContent = '';
        weekRows(ws).forEach(r => {
            const tr = el('tr'), th = el('th', 'wk-name');
            th.scope = 'row';
            th.style.setProperty('--hc', r.h.color);
            th.appendChild(el('span', 'wk-h', r.h.name));
            th.appendChild(el('span', 'wk-s', r.sub));
            tr.appendChild(th);
            r.days.forEach(x => {
                const td = el('td', 'c ' + x.st + (x.d === now ? ' is-today' : ''), x.st === 'met' || x.st === 'extra' ? '✓' : x.st === 'missed' ? '–' : x.st === 'skip' ? 'S' : x.st === 'rest' ? '·' : '');
                const v = H.settings(r.h, x.d);
                td.title = fmt(x.d) + ': ' + STATE_WORDS[x.st] + (v && v.kind !== 'check' && x.d <= now ? ' (' + H.amount(x.n, v.unit) + ')' : '');
                td.setAttribute('aria-label', td.title);
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
        $('email').href = has ? 'mailto:?subject=' + encodeURIComponent('My habits: ' + $('week-range').textContent) + '&body=' + encodeURIComponent(shortText(weekText(), 1800)) : 'mailto:';
    }

    function weekText() {
        const ws = H.weekStart(view, state.weekStart), t = H.dayTotals(state.habits, state.log, view, now, state.weekStart);
        const lines = ['My habits: week of ' + fmt(ws) + ' to ' + fmt(H.add(ws, 6), true)];
        if (t.due) lines.push((view === now ? 'Today' : fmt(view)) + ': ' + t.done + ' of ' + t.due + ' done');
        weekRows(ws).forEach(r => {
            if (!r.v) return;
            lines.push('');
            lines.push(r.h.name + ' (' + (r.v.kind === 'check' ? '' : H.goalText(r.v) + ', ') + lowFirst(H.schedText(r.v, state.weekStart)) + ')');
            lines.push('  This week: ' + r.sub + '. ' + H.streakText(H.streak(r.h, state.log, now, state.weekStart)) + '.');
            const ds = r.days.filter(x => x.st !== 'future' && x.st !== 'before').map(x => {
                const v = H.settings(r.h, x.d);
                const amt = v.kind === 'check' ? '' : ' ' + H.fmtN(x.n);
                return H.DAY3[H.dow(x.d)] + amt + (x.st === 'met' || x.st === 'extra' ? ' ✓' : x.st === 'missed' ? ' missed' : x.st === 'skip' ? ' skipped' : x.st === 'rest' ? ' rest day' : '');
            });
            if (ds.length) lines.push('  ' + ds.join(', '));
        });
        lines.push('', 'Made with Daily Habit and Water Tracker: ' + URL_APP);
        return lines.join('\n');
    }
    const lowFirst = t => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(t) ? t : t[0].toLowerCase() + t.slice(1);
    const shortText = (s, max) => s.length <= max ? s : s.slice(0, max - 60).replace(/\n[^\n]*$/, '') + '\n...\n(Shortened. Use Copy this week for the whole text.)';

    // ---------- keeping focus on the same control after the page is redrawn
    function focusKey(k) { if (k === 'list-top') { const b = document.querySelector('#list-msg .undo') || $('add-open'); if (b && !b.hidden) b.focus(); return; } const e = document.querySelector('[data-fk="' + k + '"]'); if (e) e.focus(); }
    function renderAll() {
        const a = document.activeElement, key = a && a.dataset ? a.dataset.fk : null;
        renderDay(); renderList(); renderWeek();
        if (key && document.activeElement !== a) { const e = document.querySelector('[data-fk="' + key + '"]'); if (e && !e.disabled) e.focus({ preventScroll: true }); }
        $('ws').value = String(state.weekStart);
    }

    // ---------- day buttons
    $('prev').addEventListener('click', () => { if (view > minDay()) { view = H.add(view, -1); lastMsg = null; typing = null; renderAll(); } });
    $('next').addEventListener('click', () => { if (view < now) { view = H.add(view, 1); lastMsg = null; typing = null; renderAll(); if ($('next').disabled) $('prev').focus(); } });
    $('to-today').addEventListener('click', () => { view = now; lastMsg = null; typing = null; renderAll(); $('prev').focus(); });

    // ---------- the add / edit form
    let editing = null, fColor = H.COLORS[0], fDays = [];
    const kindVal = () => document.querySelector('input[name=kind]:checked').value;
    const errs = ['f-name', 'f-target', 'f-unit', 'f-step', 'f-days', 'f-start'];
    function clearErrs() { errs.forEach(id => { $(id + '-err').textContent = ''; const inp = $(id === 'f-unit' ? 'f-unit-own' : id); if (inp && inp.removeAttribute) inp.removeAttribute('aria-invalid'); }); }
    function showErr(id, text, inputId) { $(id + '-err').textContent = text; const i = $(inputId || id); if (i) i.setAttribute('aria-invalid', 'true'); return i; }
    function buildPicks() {
        const box = $('picks');
        PICKS.forEach((p, k) => {
            const b = el('button', 'pick', p.label); b.type = 'button'; b.dataset.k = k;
            b.style.setProperty('--hc', p.color);
            b.addEventListener('click', () => fillForm(p));
            box.appendChild(b);
        });
    }
    function buildDays() {
        const box = $('f-days');
        box.textContent = '';
        for (let k = 0; k < 7; k++) {
            const d = (state.weekStart + k) % 7, b = el('button', 'dayb', H.DAY3[d]);
            b.type = 'button'; b.setAttribute('aria-pressed', String(fDays.includes(d)));
            b.addEventListener('click', () => { fDays = fDays.includes(d) ? fDays.filter(x => x !== d) : fDays.concat(d); b.setAttribute('aria-pressed', String(fDays.includes(d))); $('f-days-err').textContent = ''; });
            box.appendChild(b);
        }
    }
    function buildColors() {
        const box = $('f-colors');
        box.textContent = '';
        const names = ['Teal', 'Blue', 'Green', 'Yellow', 'Orange', 'Red', 'Purple', 'Grey'];
        H.COLORS.forEach((c, k) => {
            const b = el('button', 'sw'); b.type = 'button'; b.style.background = c;
            b.setAttribute('aria-label', names[k]); b.setAttribute('aria-pressed', String(c === fColor));
            b.addEventListener('click', () => { fColor = c; buildColors(); box.children[k].focus(); });
            box.appendChild(b);
        });
    }
    function syncForm() {
        const k = kindVal();
        $('amount-box').hidden = k === 'check';
        $('f-target-label').textContent = k === 'limit' ? 'Most each day' : 'Goal each day';
        $('f-target').placeholder = k === 'limit' ? 'e.g. 2' : 'e.g. 8';
        $('unit-own-box').hidden = $('f-unit').value !== 'other';
        const weekOpt = $('f-sched').querySelector('option[value=week]');
        weekOpt.disabled = k === 'limit';
        if (k === 'limit' && $('f-sched').value === 'week') $('f-sched').value = 'daily';
        const s = $('f-sched').value;
        $('days-box').hidden = s !== 'days';
        $('times-box').hidden = s !== 'week';
        $('sched-hint').textContent = s === 'week' ? 'Any days count. The week starts on ' + (state.weekStart ? 'Monday' : 'Sunday') + ' (change it in Settings and backup).' : k === 'limit' ? 'A limit is checked on each planned day, so "a number of times a week" is not offered.' : '';
    }
    function fillForm(p) {
        clearErrs();
        $('f-name').value = p.name;
        document.querySelector('input[name=kind][value=' + p.kind + ']').checked = true;
        if (p.kind !== 'check') {
            $('f-target').value = String(p.target);
            const known = [...$('f-unit').options].some(o => o.value === p.unit && o.value !== 'other');
            $('f-unit').value = known ? p.unit : 'other';
            $('f-unit-own').value = known ? '' : p.unit;
            $('f-step').value = String(p.step || 1);
        } else { $('f-target').value = ''; $('f-step').value = ''; $('f-unit').value = 'glasses'; $('f-unit-own').value = ''; }
        const sc = p.sched || { type: 'daily' };
        $('f-sched').value = sc.type;
        fDays = sc.type === 'days' ? sc.days.slice() : [];
        if (sc.type === 'week') $('f-times').value = String(Math.min(6, sc.times));
        if (p.color) fColor = p.color;
        buildDays(); buildColors(); syncForm();
    }
    function openForm(h) {
        editing = h || null;
        typing = null;
        $('form').hidden = false;
        $('add-open').hidden = true;
        $('form-h').textContent = h ? 'Change ' + h.name : 'Add a habit';
        $('picks-box').hidden = !!h;
        $('edit-extra').hidden = !h;
        $('f-delete').hidden = !h;
        $('f-all').checked = false;
        $('form-msg').textContent = ''; $('form-msg').className = 'msg';
        $('f-start').max = now; $('f-start').min = '1900-01-01';
        if (h) {
            const v = H.settings(h, now) || h.versions[h.versions.length - 1];
            fColor = h.color;
            fillForm({ name: h.name, kind: v.kind, target: v.target, unit: v.unit, step: v.step, sched: v.sched, color: h.color });
            $('f-start').value = H.first(h);
            $('start-box').hidden = false; $('start-open').hidden = true;
            updateMove();
        } else {
            fColor = H.COLORS[state.habits.length % H.COLORS.length];
            fillForm({ name: '', kind: 'check', sched: { type: 'daily' } });
            $('f-start').value = now;
            $('start-box').hidden = true; $('start-open').hidden = false;
        }
        $('form').scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('f-name').focus({ preventScroll: true });
        if (h) renderAll();
    }
    function closeForm() {
        $('form').hidden = true; editing = null;
        $('add-open').hidden = false;
        clearErrs();
    }
    function updateMove() {
        const k = state.habits.indexOf(editing);
        $('f-up').disabled = k <= 0; $('f-down').disabled = k < 0 || k >= state.habits.length - 1;
    }
    function numErr(p, min, max) {
        return p.error === 'empty' ? 'Type a number.' : p.error === 'negative' ? 'The number cannot be below ' + min + '.' : p.error === 'decimal' ? 'Use a whole number, like 8. For half amounts pick a smaller unit (ml instead of litres).'
            : p.error === 'notnumber' ? 'Type only the number, like 8.' : p.error === 'small' ? 'The least is ' + min + '.' : 'The most is ' + H.fmtN(max) + '.';
    }
    function readForm() {
        clearErrs();
        let first = null;
        const bad = (id, text, inputId) => { const i = showErr(id, text, inputId); if (!first) first = i; };
        const name = $('f-name').value.replace(/\s+/g, ' ').trim();
        if (!name) bad('f-name', 'Type a name for the habit, like Drink water.');
        else if (state.habits.some(h => h !== editing && h.name.toLowerCase() === name.toLowerCase())) bad('f-name', 'You already have a habit called "' + name + '". Use another name, or Edit that one.');
        const kind = kindVal();
        let target = 1, unit = '', step = 1;
        if (kind !== 'check') {
            const min = kind === 'limit' ? 0 : 1, p = H.parseWhole($('f-target').value, min, H.MAX_TARGET);
            if (p.error) bad('f-target', (kind === 'limit' ? 'Most each day: ' : 'Goal each day: ') + numErr(p, min, H.MAX_TARGET)); else target = p.n;
            unit = $('f-unit').value;
            if (unit === 'other') {
                unit = $('f-unit-own').value.replace(/\s+/g, ' ').trim();
                if (!unit) bad('f-unit', 'Type what you count, like cigarettes.', 'f-unit-own');
            }
            const sv = $('f-step').value.trim();
            if (sv) { const q = H.parseWhole(sv, 1, H.MAX_TARGET); if (q.error) bad('f-step', 'Each + tap adds: ' + numErr(q, 1, H.MAX_TARGET)); else step = q.n; }
        }
        const st = $('f-sched').value;
        let sched;
        if (st === 'days') {
            if (!fDays.length) { bad('f-days', 'Tap at least one day.', 'f-days'); sched = null; }
            else sched = fDays.length === 7 ? { type: 'daily' } : { type: 'days', days: fDays.slice().sort() };
        } else if (st === 'week') sched = { type: 'week', times: Number($('f-times').value) };
        else sched = { type: 'daily' };
        let start = editing ? H.first(editing) : now;
        if (!$('start-box').hidden) {
            const s = $('f-start').value;
            if (!H.valid(s)) bad('f-start', 'Choose the day you started.');
            else if (s > now) bad('f-start', 'Started on cannot be after today.');
            else start = s;
        }
        if (first) { first.focus(); return null; }
        return { name, color: fColor, start, v: { kind, target: kind === 'check' ? 1 : target, unit: kind === 'check' ? '' : unit, step: kind === 'check' ? 1 : step, sched } };
    }
    function saveForm() {
        const f = readForm();
        if (!f) return;
        const snap = snapshot();
        if (!editing) {
            if (state.habits.length >= H.MAX_HABITS) { $('form-msg').textContent = 'You can have up to ' + H.MAX_HABITS + ' habits. Delete one first.'; $('form-msg').className = 'msg show bad'; return; }
            const h = { id: H.newId(), name: f.name, color: f.color, versions: [Object.assign({ from: f.start }, f.v)] };
            state.habits.push(h);
            save(); closeForm();
            setMsg('list', 'Added ' + h.name + '.', snap);
            if (view < f.start) view = now;
            renderAll();
            const box = $('h-' + h.id);
            if (box) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            focusKey(f.v.kind === 'check' ? 'tick-' + h.id : 'plus-' + h.id);
            return;
        }
        const h = editing, cur = H.settings(h, now) || h.versions[h.versions.length - 1];
        h.name = f.name; h.color = f.color;
        if (f.start !== H.first(h)) H.setStart(h, f.start);
        const changed = ['kind', 'target', 'unit', 'step'].some(k => cur[k] !== f.v[k]) || JSON.stringify(cur.sched) !== JSON.stringify(f.v.sched);
        if ($('f-all').checked) H.applyVersion(h, f.v, now, true);
        else if (changed) H.applyVersion(h, f.v, now, false);
        save();
        const id = h.id;
        closeForm();
        setMsg(id, 'Saved changes to ' + h.name + '.', snap);
        renderAll();
        focusKey('edit-' + id);
    }
    $('add-open').addEventListener('click', () => openForm(null));
    $('f-cancel').addEventListener('click', () => { const id = editing && editing.id; closeForm(); renderAll(); if (id) focusKey('edit-' + id); else $('add-open').focus(); });
    $('f-save').addEventListener('click', saveForm);
    $('form').addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); $('f-cancel').click(); }
        else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') { e.preventDefault(); saveForm(); }
    });
    document.querySelectorAll('input[name=kind]').forEach(r => r.addEventListener('change', syncForm));
    $('f-unit').addEventListener('change', () => { syncForm(); if ($('f-unit').value === 'other') $('f-unit-own').focus(); });
    $('f-sched').addEventListener('change', () => { if ($('f-sched').value === 'days' && !fDays.length) { fDays = [1, 2, 3, 4, 5]; buildDays(); } syncForm(); });
    $('start-open').addEventListener('click', () => { $('start-box').hidden = false; $('start-open').hidden = true; $('f-start').focus(); });
    $('f-delete').addEventListener('click', () => {
        const h = editing, snap = snapshot();
        state.habits = state.habits.filter(x => x !== h);
        delete state.log[h.id];
        openDetails.delete(h.id);
        save(); closeForm();
        setMsg('list', 'Deleted ' + h.name + ' and its history.', snap);
        renderAll(); focusKey('list-top');
    });
    const move = d => {
        const k = state.habits.indexOf(editing), j = k + d;
        if (k < 0 || j < 0 || j >= state.habits.length) return;
        state.habits.splice(k, 1); state.habits.splice(j, 0, editing);
        save(); renderAll(); updateMove();
        $('form-msg').textContent = 'Moved ' + (d < 0 ? 'up' : 'down') + '. It is number ' + (j + 1) + ' of ' + state.habits.length + '.'; $('form-msg').className = 'msg show';
        const b = $(d < 0 ? 'f-up' : 'f-down'); if (b.disabled) $(d < 0 ? 'f-down' : 'f-up').focus();
    };
    $('f-up').addEventListener('click', () => move(-1));
    $('f-down').addEventListener('click', () => move(1));

    // ---------- share
    function flash(id, text, bad) { const m = $(id); m.textContent = text; m.className = 'msg show' + (bad ? ' bad' : ''); }
    $('copy').addEventListener('click', () => {
        const text = weekText();
        const fallback = () => { const t = el('textarea'); t.value = text; t.style.position = 'absolute'; t.style.left = '-9999px'; document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); flash('share-msg', ok ? 'Copied. Paste it into a message or note.' : 'Could not copy here. Use Email this week instead.', !ok); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => flash('share-msg', 'Copied. Paste it into a message or note.'), fallback);
        else fallback();
    });
    $('email').addEventListener('click', e => { if (!state.habits.length) { e.preventDefault(); flash('share-msg', 'Add a habit first.', true); } });
    $('print').addEventListener('click', () => {
        const r = $('report');
        r.textContent = '';
        r.appendChild(el('h2', '', 'My habits: ' + $('week-range').textContent));
        const t = H.dayTotals(state.habits, state.log, view, now, state.weekStart);
        if (t.due) r.appendChild(el('p', '', (view === now ? 'Today' : fmt(view)) + ': ' + t.done + ' of ' + t.due + ' done'));
        const tab = $('wk').cloneNode(true); tab.removeAttribute('id'); tab.hidden = false;
        tab.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
        r.appendChild(tab);
        weekRows(H.weekStart(view, state.weekStart)).forEach(x => { if (x.v) r.appendChild(el('p', '', x.h.name + ': ' + (x.v.kind === 'check' ? '' : H.goalText(x.v) + ', ') + H.schedText(x.v, state.weekStart) + '. ' + H.streakText(H.streak(x.h, state.log, now, state.weekStart)) + '.')); });
        r.appendChild(el('p', 'r-foot', '✓ done, – missed, S skipped, · not planned. Made with Daily Habit and Water Tracker: ' + URL_APP));
        window.print();
    });

    // ---------- settings and backup
    function download(text, name, type) {
        const blob = new Blob([text], { type }), a = el('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    const fileName = s => (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'habit').slice(0, 40);
    $('ws').addEventListener('change', () => {
        state.weekStart = $('ws').value === '0' ? 0 : 1;
        save(); renderAll();
        flash('set-msg', 'Weeks now start on ' + (state.weekStart ? 'Monday' : 'Sunday') + '.');
    });
    $('backup').addEventListener('click', () => {
        if (!state.habits.length) { flash('set-msg', 'There is nothing to back up yet.', true); return; }
        download(JSON.stringify(Object.assign({ app: SLUG, version: 1, saved: new Date().toISOString() }, state), null, 1), 'habits-backup-' + now + '.json', 'application/json');
        flash('set-msg', 'Backup file saved. Keep it somewhere safe, like your email or cloud drive.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0];
        $('restore-file').value = '';
        if (!f) return;
        if (f.size > 5e6) { flash('set-msg', 'That file is too big to be a backup from this app.', true); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let data = null;
            try { data = JSON.parse(rd.result); } catch (e) { data = null; }
            const s = data && (!data.app || data.app === SLUG) ? H.clean(data) : null;
            if (!s || !s.habits.length) { flash('set-msg', 'That file is not a backup from Daily Habit and Water Tracker, or it is damaged. Nothing was changed.', true); return; }
            const snap = snapshot();
            state = s; save(); view = now; openDetails.clear(); closeForm();
            const dropped = Array.isArray(data.habits) ? data.habits.length - s.habits.length : 0;
            renderAll();
            const m = $('set-msg');
            m.textContent = 'Restored ' + s.habits.length + ' habit' + (s.habits.length === 1 ? '' : 's') + (dropped > 0 ? ' (' + dropped + ' damaged one' + (dropped === 1 ? ' was' : 's were') + ' left out)' : '') + '. ';
            m.className = 'msg show';
            const u = el('button', 'link inline undo', 'Undo'); u.type = 'button';
            u.addEventListener('click', () => { restore(snap); renderAll(); flash('set-msg', 'Undone. Your habits are back as they were.'); });
            m.appendChild(u);
        };
        rd.onerror = () => flash('set-msg', 'Could not read that file.', true);
        rd.readAsText(f);
    });
    $('wipe').addEventListener('click', () => {
        if (!state.habits.length) { flash('set-msg', 'There are no habits to delete.', true); return; }
        const snap = snapshot(), n = state.habits.length;
        state = { habits: [], log: {}, weekStart: state.weekStart };
        save(); openDetails.clear(); closeForm(); view = now;
        renderAll();
        const m = $('set-msg');
        m.textContent = 'Deleted ' + n + ' habit' + (n === 1 ? '' : 's') + ' and their history. ';
        m.className = 'msg show';
        const u = el('button', 'link inline undo', 'Undo'); u.type = 'button';
        u.addEventListener('click', () => { restore(snap); renderAll(); flash('set-msg', 'Undone. Your habits are back.'); });
        m.appendChild(u); u.focus();
        $('form').hidden = false; $('add-open').hidden = true; // first-use look again
        fillForm({ name: '', kind: 'check', sched: { type: 'daily' } });
    });

    // ---------- midnight and coming back to the app
    function tick() {
        const t = today();
        if (t === now) return;
        const wasToday = view === now;
        now = t;
        if (wasToday || view > now) view = now;
        lastMsg = null; typing = null;
        renderAll();
    }
    setInterval(tick, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); renderAll(); } });

    // ---------- start
    buildPicks();
    $('ws').value = String(state.weekStart);
    storageNote();
    renderAll();
    if (!state.habits.length) { $('form').hidden = false; $('add-open').hidden = true; fillForm({ name: '', kind: 'check', sched: { type: 'daily' } }); }
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
