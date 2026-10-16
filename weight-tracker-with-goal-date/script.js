// Weight Tracker with Goal Date: the page. The maths and checks live in core.js.
(function () {
    const C = window.WTCore;
    const KEY = 'weight-tracker-with-goal-date.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const SVGNS = 'http://www.w3.org/2000/svg';
    const URL_APP = 'https://umar8092.github.io/apps/weight-tracker-with-goal-date/';
    const defaultUnit = /-(US|LR|MM)\b/i.test(navigator.language || '') ? 'lb' : /-GB\b/i.test(navigator.language || '') ? 'st' : 'kg';

    // ---------- saved state
    let storageOk = true, state = load();
    function fresh() { const p = C.newPerson(''); p.unit = defaultUnit; if (defaultUnit !== 'kg') p.hUnit = 'ftin'; return { v: 1, people: [p], current: p.id }; }
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; }
        if (!raw) return fresh();
        try { return C.clean(JSON.parse(raw)) || fresh(); } catch (e) { return fresh(); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; } catch (e) { storageOk = false; }
        $('store-warn').hidden = storageOk;
    }
    const person = () => state.people.find(p => p.id === state.current) || state.people[0];
    const snapshot = () => JSON.stringify(state);
    function restoreSnapshot(snap) { const s = C.clean(JSON.parse(snap)); if (s) { state = s; save(); } fillInputs(); render(); }

    // ---------- words and dates
    const today = () => C.localDate(new Date());
    const toDate = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); };
    function fmtDay(d, opts) {
        const o = opts === 'short' ? { day: 'numeric', month: 'short' } : opts === 'year' ? { day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
        try { return toDate(d).toLocaleDateString(undefined, o); } catch (e) { return d; }
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    const pname = p => p.name || ('Person ' + (state.people.indexOf(p) + 1));
    function weeksText(days) {
        if (days < 14) return plural(days, 'day');
        const w = Math.round(days / 7);
        return w < 17 ? 'about ' + plural(w, 'week') : 'about ' + plural(Math.round(days / 30.44), 'month');
    }
    const lossWord = g => g < 0 ? 'lose' : 'gain';

    // ---------- messages, with an optional Undo
    let msgTimer = {};
    function say(id, text, opts) {
        opts = opts || {};
        const box = $(id); box.textContent = ''; box.className = 'msg' + (text ? ' show' : '') + (opts.bad ? ' bad' : '');
        clearTimeout(msgTimer[id]);
        if (!text) return;
        const p = el('p', null, text);
        if (opts.undo) {
            const b = el('button', 'link inline undo', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { opts.undo(); say(id, opts.undone || 'Undone.'); });
            p.append(' ', b);
        }
        box.append(p);
        if (opts.extra) box.append(el('p', 'msg-extra', opts.extra));
        if (!opts.keep && !opts.undo) msgTimer[id] = setTimeout(() => say(id, ''), 6000);
    }
    const setErr = (id, text, inputs) => { $(id).textContent = text || ''; (inputs || []).forEach(i => $(i).setAttribute('aria-invalid', text ? 'true' : 'false')); };

    // ---------- inputs that follow the person's unit
    const wInputs = () => person().unit === 'st' ? ['w-st', 'w-lb'] : ['w'];
    function fillInputs() {
        const p = person();
        // goal
        if (p.goalG) {
            if (p.unit === 'st') { const s = C.stoneParts(p.goalG); $('goal-st').value = s.st; $('goal-lb').value = s.lb; $('goal').value = ''; }
            else { $('goal').value = C.inUnit(p.goalG, p.unit); $('goal-st').value = $('goal-lb').value = ''; }
        } else $('goal').value = $('goal-st').value = $('goal-lb').value = '';
        $('target').value = p.target || '';
        $('target-box').hidden = !p.target; $('target-open').hidden = !!p.target;
        // height
        if (p.heightMm) {
            $('h-cm').value = String(p.heightMm / 10);
            const h = C.heightParts(p.heightMm); $('h-ft').value = h.ft; $('h-in').value = h.inch;
        } else $('h-cm').value = $('h-ft').value = $('h-in').value = '';
        $('no-bmi').checked = p.noBmi;
        $('height-box').hidden = !p.heightMm && !heightOpen; $('height-open').hidden = !$('height-box').hidden;
        $('name').value = p.name;
        ['w-err', 'goal-err', 'target-err', 'h-err', 'when-err'].forEach(id => setErr(id, ''));
        ['w', 'w-st', 'w-lb', 'goal', 'goal-st', 'goal-lb', 'h-cm', 'h-ft', 'h-in'].forEach(i => $(i).removeAttribute('aria-invalid'));
    }
    let heightOpen = false;

    // ---------- render
    function render() {
        const p = person();
        $('store-warn').hidden = storageOk;
        // people
        const nav = $('people'); nav.textContent = ''; nav.hidden = state.people.length < 2;
        state.people.forEach(q => {
            const b = el('button', 'person', pname(q)); b.type = 'button'; b.setAttribute('aria-pressed', String(q.id === p.id));
            b.addEventListener('click', () => { if (q.id === state.current) return; state.current = q.id; save(); heightOpen = false; fillInputs(); render(); say('add-msg', ''); });
            nav.append(b);
        });
        // units
        document.querySelectorAll('.unit-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.unit === p.unit)));
        const st = p.unit === 'st';
        $('w-one').hidden = st; $('w-two').hidden = !st; $('g-one').hidden = st; $('g-two').hidden = !st;
        $('w-label').textContent = 'Weight in ' + p.unit; $('goal-label').textContent = 'Goal weight in ' + p.unit;
        $('w').placeholder = p.unit === 'kg' ? 'e.g. 82.4' : 'e.g. 181.6'; $('goal').placeholder = p.unit === 'kg' ? 'e.g. 75' : 'e.g. 165';
        document.querySelectorAll('.h-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.h === p.hUnit)));
        $('h-one').hidden = p.hUnit !== 'cm'; $('h-two').hidden = p.hUnit === 'cm';
        // date line
        const t = today(), wd = $('when').value;
        $('when').max = t; $('target').min = C.addDays(t, 1);
        $('when-text').textContent = !wd || wd === t ? 'Today, ' + fmtDay(t, 'short') : fmtDay(wd);
        // settings
        $('person-remove').hidden = state.people.length < 2;
        $('person-remove').textContent = 'Remove ' + pname(p);
        $('wipe').textContent = state.people.length < 2 ? 'Delete all weights' : 'Delete all of ' + pname(p) + "'s weights";
        $('wipe').disabled = !p.entries.length;
        renderSummary(); renderList();
    }

    let S = null;
    function renderSummary() {
        const p = person(), u = p.unit;
        S = C.stats(p.entries, { goalG: p.goalG, target: p.target });
        $('sum-empty').hidden = !S.empty; $('sum-body').hidden = !!S.empty;
        ['copy', 'print', 'csv'].forEach(id => { $(id).disabled = !!S.empty; });
        $('email').setAttribute('aria-disabled', String(!!S.empty));
        if (S.empty) { say('goal-msg', ''); return; }
        $('avg').textContent = C.fmtW(S.avg7.g, u);
        $('avg-meta').textContent = 'From ' + plural(S.avg7.days, 'day') + ' weighed, ' + fmtDay(S.avg7.from, 'short') + ' to ' + fmtDay(S.avg7.to, 'short') + '. It hides day-to-day water swings.';
        // tiles
        $('t-last').textContent = C.fmtW(S.last.g, u);
        $('t-last-sub').textContent = fmtDay(S.last.d) + (S.last.n > 1 ? ' (average of ' + S.last.n + ')' : '');
        $('t-since').textContent = S.days.length > 1 ? C.fmtDiff(S.since, u) : '-';
        $('t-since-sub').textContent = S.days.length > 1 ? 'from ' + C.fmtW(S.first.g, u) + ' on ' + fmtDay(S.first.d, 'year') : 'Your first weigh-in. Weigh in again to see the change.';
        $('t-week').textContent = S.week ? C.fmtDiff(S.week.g, u) : '-';
        $('t-week-sub').textContent = S.week ? '7-day average vs the 7 days before (' + C.fmtW(S.week.prev.g, u) + ')' : 'Needs weigh-ins in this week and the week before.';
        const pc = S.pace;
        if (pc.none) { $('t-pace').textContent = '-'; $('t-pace-sub').textContent = pc.none === 'few' ? 'Needs 3 weigh-ins in the last 4 weeks (' + pc.n + ' so far).' : 'Needs weigh-ins spread over at least a week.'; }
        else if (Math.abs(pc.perWeek) < 50) { $('t-pace').textContent = 'Steady'; $('t-pace-sub').textContent = 'Less than ' + C.fmtPace(50, u) + ' a week up or down.'; }
        else { $('t-pace').textContent = (pc.perWeek < 0 ? '−' : '+') + C.fmtPace(pc.perWeek, u); $('t-pace-sub').textContent = 'a week. ' + (pc.perWeek < 0 ? 'Losing' : 'Gaining') + ', from ' + plural(pc.n, 'day') + ' weighed since ' + fmtDay(pc.from, 'short'); }
        // BMI
        const b = C.bmi(S.avg7.g, p.heightMm);
        $('tile-bmi').hidden = !b;
        if (b) {
            const words = { under: 'underweight range', healthy: 'healthy range', over: 'overweight range', obese: 'obese range' };
            const hr = C.healthyRange(p.heightMm);
            $('t-bmi').textContent = b.v.toFixed(1);
            $('t-bmi-sub').textContent = p.noBmi ? 'From your 7-day average and height.' : 'In the ' + words[b.cat] + '. Healthy for your height: ' + C.fmtW(hr.lo, u) + ' to ' + C.fmtW(hr.hi, u) + '.';
        }
        // goal
        const box = $('goalbox'); box.textContent = ''; box.className = 'goalbox';
        const G = S.goal;
        $('t-left').textContent = G ? (G.status === 'reached' ? 'Reached' : C.fmtDiff(G.left, u).replace(/^[+−]/, '') + ' to ' + lossWord(G.left)) : '-';
        $('t-left-sub').textContent = G ? (G.status === 'reached' ? 'Goal ' + C.fmtW(G.goal, u) : 'to reach ' + C.fmtW(G.goal, u)) : 'Add a goal weight in Your goal.';
        if (!G) {
            box.append(el('p', 'g-main', 'Add a goal weight to see the date you reach it.'));
            const bt = el('button', 'secondary small', 'Set a goal weight'); bt.type = 'button';
            bt.addEventListener('click', () => { const f = person().unit === 'st' ? $('goal-st') : $('goal'); f.scrollIntoView({ block: 'center' }); f.focus(); });
            box.append(bt);
        } else {
            const gw = C.fmtW(G.goal, u);
            let main, sub = '';
            if (G.status === 'reached') { box.classList.add('ok'); main = 'Goal reached! Your 7-day average is ' + (G.dir < 0 ? 'at or under' : G.dir > 0 ? 'at or over' : 'at') + ' ' + gw + '.'; sub = 'Keep weighing in to hold it there, or set a new goal.'; }
            else if (G.status === 'date') { main = 'You reach ' + gw + ' around ' + fmtDay(G.date) + '.'; sub = 'That is in ' + weeksText(G.days) + ', if you keep your pace of ' + C.fmtPace(S.pace.perWeek, u) + ' a week (' + C.fmtDiff(G.left, u).replace(/^[+−]/, '') + ' to ' + lossWord(G.left) + ').'; }
            else if (G.status === 'far') { box.classList.add('warnbox'); main = 'At this pace, ' + gw + ' is more than 5 years away.'; sub = 'Your pace is ' + C.fmtPace(S.pace.perWeek, u) + ' a week, and you have ' + C.fmtDiff(G.left, u).replace(/^[+−]/, '') + ' to ' + lossWord(G.left) + '.'; }
            else if (G.status === 'away') { box.classList.add('warnbox'); main = 'No goal date: your weight is going ' + (S.pace.perWeek > 0 ? 'up' : 'down') + ', away from ' + gw + '.'; sub = 'Pace over the last 4 weeks: ' + (S.pace.perWeek > 0 ? '+' : '−') + C.fmtPace(S.pace.perWeek, u) + ' a week. The date appears once your trend turns towards your goal.'; }
            else if (G.status === 'still') { main = 'No goal date yet: your weight has hardly changed in the last 4 weeks.'; sub = 'You have ' + C.fmtDiff(G.left, u).replace(/^[+−]/, '') + ' to ' + lossWord(G.left) + ' to reach ' + gw + '.'; }
            else { main = 'Your goal date appears after a few more weigh-ins.'; sub = S.pace.none === 'few' ? 'It needs at least 3 weigh-ins in the last 4 weeks, spread over a week or more (' + S.pace.n + ' so far).' : 'It needs weigh-ins spread over at least a week. Keep going.'; }
            box.append(el('p', 'g-main', main)); if (sub) box.append(el('p', 'g-sub', sub));
            const T = G.target;
            if (T && G.status !== 'reached') {
                let tl;
                if (T.passed) tl = 'Your date, ' + fmtDay(T.date) + ', has passed. Choose a new date in Your goal.';
                else {
                    tl = 'To reach it by ' + fmtDay(T.date) + ': ' + lossWord(T.perWeek) + ' ' + C.fmtPace(T.perWeek, u) + ' a week.';
                    if (T.diffDays != null) {
                        const n = Math.abs(T.diffDays), w = weeksText(n).replace(/^about /, '');
                        tl += T.diffDays === 0 ? ' On track: right on the day.' : T.diffDays > 0 ? ' On track: about ' + w + ' early.' : ' At your pace you are about ' + w + ' late.';
                    }
                }
                const tp = el('p', 'g-target' + (T.passed || (T.diffDays != null && T.diffDays < 0) ? ' late' : T.diffDays != null ? ' early' : ''), tl);
                box.append(tp);
            }
        }
        // a fast loss note
        const fast = S.pace.perWeek && S.pace.perWeek < 0 && -S.pace.perWeek > S.avg7.g * 0.01;
        $('fast').hidden = !fast;
        if (fast) $('fast').textContent = 'You are losing more than 1% of your weight a week. Most guides suggest about 0.5 to 1 kg (1 to 2 lb) a week. Talk to your doctor if this is not planned.';
        document.querySelectorAll('.r-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.r === p.range)));
        drawChart();
    }

    // ---------- chart: a dot for each day, the 7-day average line, the goal as a dashed line
    function drawChart() {
        const p = person(), svg = $('chart'), u = p.unit;
        svg.textContent = '';
        if (!S || S.empty) return;
        const W = Math.max(260, Math.round(svg.parentNode.clientWidth || 560)), H = W < 420 ? 200 : 240;
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
        const end = S.last.d, start = p.range === 'all' ? S.first.d : (S.first.d > C.addDays(end, -(+p.range - 1)) ? S.first.d : C.addDays(end, -(+p.range - 1)));
        const days = S.days.filter(x => x.d >= start);
        const avg = days.map(x => ({ d: x.d, g: C.avgWindow(S.days, x.d, 7).g }));
        const vals = days.map(x => x.g).concat(avg.map(x => x.g));
        if (p.goalG) vals.push(p.goalG);
        const disp = g => u === 'kg' ? g / 1000 : g / C.LB;
        let lo = Math.min(...vals.map(disp)), hi = Math.max(...vals.map(disp));
        const step = [0.5, 1, 2, 5, 10, 20, 50].find(s => (hi - lo) / s <= 5) || 100;
        lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step; if (hi - lo < step * 2) { hi += step; lo -= step; }
        const L = 46, R = 12, T = 12, B = 26, x0 = C.toDay(start), span = Math.max(1, C.toDay(end) - x0);
        const X = d => L + (C.toDay(d) - x0) / span * (W - L - R), Y = g => T + (hi - disp(g)) / (hi - lo) * (H - T - B);
        const add = (tag, attrs, text) => { const e = document.createElementNS(SVGNS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); if (text != null) e.textContent = text; svg.append(e); return e; };
        for (let v = lo; v <= hi + 1e-9; v += step) {
            const y = T + (hi - v) / (hi - lo) * (H - T - B);
            add('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'grid' });
            add('text', { x: L - 6, y: y + 4, 'text-anchor': 'end', class: 'ax' }, (step < 1 ? v.toFixed(1) : String(Math.round(v))) + (u === 'kg' ? '' : ''));
        }
        add('text', { x: 4, y: T + 2, class: 'ax unit-ax' }, u === 'kg' ? 'kg' : 'lb');
        add('text', { x: L, y: H - 6, 'text-anchor': 'start', class: 'ax' }, fmtDay(start, 'short'));
        if (span > 0 && start !== end) add('text', { x: W - R, y: H - 6, 'text-anchor': 'end', class: 'ax' }, fmtDay(end, 'short'));
        if (p.goalG) add('line', { x1: L, x2: W - R, y1: Y(p.goalG), y2: Y(p.goalG), class: 'goal-l' });
        $('key-goal').hidden = $('key-goal-t').hidden = !p.goalG;
        if (p.goalG) $('key-goal-t').textContent = 'Goal ' + C.fmtW(p.goalG, u);
        days.forEach(x => add('circle', { cx: X(x.d), cy: Y(x.g), r: days.length > 120 ? 2.2 : 3.4, class: 'pt' }));
        if (avg.length > 1) add('polyline', { points: avg.map(a => X(a.d).toFixed(1) + ',' + Y(a.g).toFixed(1)).join(' '), class: 'avg-l' });
        else add('circle', { cx: X(avg[0].d), cy: Y(avg[0].g), r: 5, class: 'avg-pt' });
        $('chart-cap').setAttribute('aria-label', 'Chart of ' + plural(days.length, 'day') + ' weighed from ' + fmtDay(start) + ' to ' + fmtDay(end) + '. 7-day average now ' + C.fmtW(S.avg7.g, u) + (p.goalG ? ', goal ' + C.fmtW(p.goalG, u) : '') + '.');
    }

    // ---------- the list: each weigh-in in its own box
    let shown = 30, editing = null;
    function renderList() {
        const p = person(), u = p.unit, ul = $('entries'); ul.textContent = '';
        const list = C.sortEntries(p.entries), daysAsc = C.daily(p.entries);
        $('list-hint').textContent = list.length ? 'Newest first. ' + plural(list.length, 'weigh-in') + '. The change is from the last day you weighed before.' : 'Your weigh-ins will be listed here.';
        const prevOf = d => { let r = null; for (const x of daysAsc) { if (x.d < d) r = x; else break; } return r; };
        list.slice(0, shown).forEach(e => {
            const li = el('li', 'entry');
            if (editing === e.id) { li.append(editForm(e)); li.classList.add('editing'); ul.append(li); return; }
            const main = el('div', 'e-main');
            main.append(el('span', 'e-date', fmtDay(e.d)), el('span', 'e-w', C.fmtW(e.g, u)));
            const pr = prevOf(e.d);
            if (pr) { const df = e.g - pr.g; const c = el('span', 'e-ch ' + (df < 0 ? 'down' : df > 0 ? 'up' : ''), C.fmtDiff(df, u)); c.title = 'Change from ' + fmtDay(pr.d); main.append(c); }
            else main.append(el('span', 'e-ch', 'First weigh-in'));
            if (e.note) main.append(el('span', 'e-note', e.note));
            const btns = el('div', 'e-btns');
            const ed = el('button', 'secondary small', 'Edit'); ed.type = 'button'; ed.setAttribute('aria-label', 'Edit ' + fmtDay(e.d) + ' ' + C.fmtW(e.g, u));
            ed.addEventListener('click', () => { editing = e.id; renderList(); const f = ul.querySelector('.editing input'); if (f) f.focus(); });
            const del = el('button', 'secondary small', 'Delete'); del.type = 'button'; del.setAttribute('aria-label', 'Delete ' + fmtDay(e.d) + ' ' + C.fmtW(e.g, u));
            del.addEventListener('click', () => {
                const snap = snapshot(); p.entries = p.entries.filter(x => x.id !== e.id); save(); render();
                say('list-msg', 'Deleted ' + C.fmtW(e.g, u) + ' on ' + fmtDay(e.d) + '.', { undo: () => restoreSnapshot(snap), undone: 'Brought back.' });
            });
            btns.append(ed, del); li.append(main, btns); ul.append(li);
        });
        $('more').hidden = list.length <= shown;
        $('more').textContent = 'Show more (' + (list.length - shown) + ' older)';
    }
    function editForm(e) {
        const p = person(), u = p.unit, f = el('div', 'e-edit');
        const mk = (lab, val, mode, ph) => { const w = el('div', 'field'), id = 'ed-' + lab.replace(/\W/g, ''); const l = el('label', null, lab); l.htmlFor = id; const i = el('input'); i.id = id; i.type = mode === 'date' ? 'date' : 'text'; if (mode !== 'date' && mode !== 'text') i.inputMode = mode; i.value = val; i.autocomplete = 'off'; i.maxLength = mode === 'text' ? 200 : 24; if (ph) i.placeholder = ph; w.append(l, i); return { w, i }; };
        let a, b;
        if (u === 'st') { const s = C.stoneParts(e.g); a = mk('Stones', s.st, 'numeric'); b = mk('Pounds', s.lb, 'decimal'); const two = el('div', 'two'); two.append(a.w, b.w); f.append(two); }
        else { a = mk('Weight in ' + u, C.inUnit(e.g, u), 'decimal'); f.append(a.w); }
        const dt = mk('Date', e.d, 'date'); dt.i.max = today(); f.append(dt.w);
        const nt = mk('Note', e.note, 'text', 'optional'); f.append(nt.w);
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); f.append(err);
        const btns = el('div', 'e-btns');
        const sv = el('button', 'primary small', 'Save'); sv.type = 'button';
        const cn = el('button', 'secondary small', 'Cancel'); cn.type = 'button';
        const cancel = () => { editing = null; renderList(); };
        const doSave = () => {
            const r = u === 'st' ? (/[a-z]/i.test(a.i.value) ? C.parseWeight(a.i.value, u) : C.parseStone(a.i.value, b.i.value)) : C.parseWeight(a.i.value, u);
            if (r.err) { err.textContent = r.err + (r.hint ? ' ' + r.hint : ''); a.i.focus(); return; }
            const d = dt.i.value;
            if (!C.isDate(d) || d < '1900-01-01') { err.textContent = 'Choose the date you weighed.'; dt.i.focus(); return; }
            if (d > today()) { err.textContent = 'That date is in the future.'; dt.i.focus(); return; }
            const snap = snapshot(); e.g = r.g; e.d = d; e.note = nt.i.value.trim().slice(0, 200); editing = null; save(); render();
            say('list-msg', 'Changed to ' + C.fmtW(e.g, u) + ' on ' + fmtDay(e.d) + '.', { undo: () => restoreSnapshot(snap), undone: 'Change undone.' });
        };
        sv.addEventListener('click', doSave); cn.addEventListener('click', cancel);
        f.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); cancel(); } else if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') { ev.preventDefault(); doSave(); } });
        btns.append(sv, cn); f.append(btns);
        return f;
    }

    // ---------- add a weigh-in
    function addWeight() {
        const p = person(), u = p.unit;
        let r;
        if (u === 'st') r = /[a-z]/i.test($('w-st').value) ? C.parseWeight($('w-st').value, u) : C.parseStone($('w-st').value, $('w-lb').value);
        else r = C.parseWeight($('w').value, u);
        if (r.err) { setErr('w-err', r.err + (r.hint ? ' ' + r.hint : ''), wInputs()); $(wInputs()[0]).focus(); return; }
        setErr('w-err', '', wInputs());
        const t = today(), d = $('when').value || t;
        if (!C.isDate(d) || d < '1900-01-01') { setErr('when-err', 'Choose the date you weighed.', ['when']); $('when').focus(); return; }
        if (d > t) { setErr('when-err', 'That date is in the future. Choose today or an earlier day.', ['when']); $('when').focus(); return; }
        setErr('when-err', '', ['when']);
        if (p.entries.length >= 20000) { say('add-msg', 'This log is full (20,000 weigh-ins). Save a backup and delete old ones.', { bad: true, keep: true }); return; }
        const before = C.daily(p.entries), snap = snapshot();
        const entry = { id: C.newId('e'), d, g: r.g, note: $('note').value.trim().slice(0, 200) };
        p.entries.push(entry); save();
        $('w').value = $('w-st').value = $('w-lb').value = $('note').value = '';
        render();
        // compare with the nearest earlier day
        let prev = null; for (const x of before) { if (x.d <= d) prev = x; }
        const head = 'Saved ' + C.fmtW(r.g, u) + ' for ' + (d === t ? 'today' : fmtDay(d)) + '.';
        let extra = '', bad = false;
        if (prev) {
            const df = r.g - prev.g, gap = C.daysBetween(prev.d, d);
            extra = (prev.d === d ? 'Second weigh-in today: the day counts as the average. ' : '') + (df === 0 ? 'Same as ' : C.fmtDiff(df, u) + ' from ') + (prev.d === d ? 'the first one.' : fmtDay(prev.d) + '.');
            if (Math.abs(df) > Math.max(3000, prev.g * 0.04) && gap <= 7) { bad = true; extra = 'That is ' + C.fmtDiff(df, u).replace(/^[+−]/, '') + (df > 0 ? ' more' : ' less') + ' than on ' + fmtDay(prev.d) + '. Please check it; if it was a typo, tap Undo.'; }
        } else extra = p.goalG ? 'Your first weigh-in. Weigh in on a few more days to see your goal date.' : 'Your first weigh-in. Add a goal weight in Your goal to see the date you reach it.';
        say('add-msg', head, { extra, bad, undo: () => restoreSnapshot(snap), undone: 'Removed.' });
        $(wInputs()[0]).focus();
    }

    // ---------- goal, date and height
    function saveGoal() {
        const p = person(), u = p.unit;
        const blank = u === 'st' ? !$('goal-st').value.trim() && !$('goal-lb').value.trim() : !$('goal').value.trim();
        const ins = u === 'st' ? ['goal-st', 'goal-lb'] : ['goal'];
        if (blank) { if (p.goalG) { const snap = snapshot(); p.goalG = null; save(); render(); say('goal-msg', 'Goal removed.', { undo: () => restoreSnapshot(snap), undone: 'Goal back.' }); } setErr('goal-err', '', ins); return; }
        const r = u === 'st' ? (/[a-z]/i.test($('goal-st').value) ? C.parseWeight($('goal-st').value, u) : C.parseStone($('goal-st').value, $('goal-lb').value)) : C.parseWeight($('goal').value, u);
        if (r.err) { setErr('goal-err', r.err.replace('Type your weight.', 'Type your goal weight.') + (r.hint ? ' ' + r.hint : ''), ins); return; }
        setErr('goal-err', '', ins);
        if (r.g === p.goalG) return;
        p.goalG = r.g; save(); render();
        say('goal-msg', 'Goal saved: ' + C.fmtW(r.g, u) + '.');
    }
    function saveTarget() {
        const p = person(), v = $('target').value;
        if (!v) { p.target = null; setErr('target-err', '', ['target']); save(); render(); return; }
        if (!C.isDate(v)) { setErr('target-err', 'Choose a date.', ['target']); return; }
        if (v <= today()) { setErr('target-err', 'Choose a date after today.', ['target']); return; }
        if (v > C.addDays(today(), 365 * 10)) { setErr('target-err', 'Choose a date within the next 10 years.', ['target']); return; }
        setErr('target-err', '', ['target']); p.target = v; save(); render();
        if (!p.goalG) say('goal-msg', 'Date saved. Add your goal weight above to see the weekly change you need.', { keep: true });
    }
    function saveHeight() {
        const p = person(), r = p.hUnit === 'cm' ? C.parseHeight($('h-cm').value, '', 'cm') : C.parseHeight($('h-ft').value, $('h-in').value, 'ftin');
        const ins = p.hUnit === 'cm' ? ['h-cm'] : ['h-ft', 'h-in'];
        if (r.err) { setErr('h-err', r.err, ins); return; }
        setErr('h-err', '', ins);
        p.heightMm = r.blank ? null : r.mm; save(); render();
        if (!r.blank) { const h = C.heightParts(r.mm); if (p.hUnit === 'cm') { $('h-ft').value = h.ft; $('h-in').value = h.inch; } else $('h-cm').value = Math.round(r.mm / 10); }
    }

    // ---------- text for copy, email and print
    function summaryLines() {
        const p = person(), u = p.unit, L = [];
        L.push('Weight log' + (p.name ? ': ' + p.name : ''));
        L.push('7-day average: ' + C.fmtW(S.avg7.g, u) + ' (' + fmtDay(S.avg7.from, 'short') + ' to ' + fmtDay(S.avg7.to, 'year') + ')');
        L.push('Latest: ' + C.fmtW(S.last.g, u) + ' on ' + fmtDay(S.last.d));
        if (S.days.length > 1) L.push('Since the start (' + C.fmtW(S.first.g, u) + ' on ' + fmtDay(S.first.d) + '): ' + C.fmtDiff(S.since, u));
        if (S.week) L.push('This week (7-day average vs the 7 days before): ' + C.fmtDiff(S.week.g, u));
        if (!S.pace.none) L.push('Pace over the last 4 weeks: ' + (Math.abs(S.pace.perWeek) < 50 ? 'steady' : (S.pace.perWeek < 0 ? '−' : '+') + C.fmtPace(S.pace.perWeek, u) + ' a week'));
        const b = C.bmi(S.avg7.g, p.heightMm); if (b) L.push('BMI: ' + b.v.toFixed(1));
        const G = S.goal;
        if (G) L.push('Goal: ' + C.fmtW(G.goal, u) + ' - ' + (G.status === 'reached' ? 'reached' : G.status === 'date' ? 'around ' + fmtDay(G.date) + ' at this pace' : 'no date yet'));
        return L;
    }
    function entriesText(max) {
        const p = person(), list = C.sortEntries(p.entries), L = ['', 'Weights (newest first):'];
        list.slice(0, max).forEach(e => L.push(fmtDay(e.d) + '  ' + C.fmtW(e.g, p.unit) + (e.note ? '  (' + e.note + ')' : '')));
        if (list.length > max) L.push('... and ' + (list.length - max) + ' earlier weigh-ins');
        return L;
    }
    const fullText = max => summaryLines().concat(entriesText(max), ['', 'Made with Weight Tracker with Goal Date: ' + URL_APP]).join('\n');

    function copyText(text, done) {
        const fallback = () => { const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.append(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); done(ok); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), fallback); else fallback();
    }
    function download(name, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    const fileName = ext => 'weights' + (person().name ? '-' + person().name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '') + '-' + today() + '.' + ext;
    function buildReport() {
        const r = $('report'), p = person(); r.textContent = '';
        r.append(el('h2', null, 'Weight log' + (p.name ? ': ' + p.name : '')));
        summaryLines().slice(1).forEach(l => r.append(el('p', null, l)));
        const tb = el('table'), th = el('thead'), hr = el('tr'); ['Date', 'Weight', 'Note'].forEach(h => hr.append(el('th', null, h))); th.append(hr); tb.append(th);
        const body = el('tbody'); C.sortEntries(p.entries).forEach(e => { const tr = el('tr'); [fmtDay(e.d), C.fmtW(e.g, p.unit), e.note].forEach(v => tr.append(el('td', null, v))); body.append(tr); }); tb.append(body);
        r.append(tb, el('p', 'r-foot', 'Printed ' + fmtDay(today()) + ' from Weight Tracker with Goal Date, ' + URL_APP));
    }

    // ---------- events
    $('save').addEventListener('click', addWeight);
    ['w', 'w-st', 'w-lb', 'note'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addWeight(); } }));
    ['w', 'w-st', 'w-lb'].forEach(id => $(id).addEventListener('input', () => { if ($('w-err').textContent) setErr('w-err', '', wInputs()); }));
    // pasting "12 st 6" into the stones box fills both boxes
    $('w-st').addEventListener('paste', e => {
        const t = (e.clipboardData || window.clipboardData).getData('text'), m = t.trim().match(/^(\d+)\s*(?:st|stone)s?\s*(\d+(?:[.,]\d+)?)?\s*(?:lb|lbs)?$/i);
        if (m) { e.preventDefault(); $('w-st').value = m[1]; $('w-lb').value = (m[2] || '').replace(',', '.'); }
    });
    document.querySelectorAll('.unit-btn').forEach(b => b.addEventListener('click', () => {
        const p = person(); if (p.unit === b.dataset.unit) return;
        p.unit = b.dataset.unit; save(); fillInputs(); render(); $(wInputs()[0]).focus();
    }));
    document.querySelectorAll('.h-btn').forEach(b => b.addEventListener('click', () => { const p = person(); if (p.hUnit === b.dataset.h) return; p.hUnit = b.dataset.h; save(); setErr('h-err', '', ['h-cm', 'h-ft', 'h-in']); render(); }));
    document.querySelectorAll('.r-btn').forEach(b => b.addEventListener('click', () => { person().range = b.dataset.r; save(); renderSummary(); }));
    $('when-open').addEventListener('click', () => { $('when-box').hidden = false; $('when-open').hidden = true; if (!$('when').value) $('when').value = today(); $('when').focus(); });
    $('when').addEventListener('change', () => { setErr('when-err', '', ['when']); render(); });
    $('when-today').addEventListener('click', () => { $('when').value = ''; $('when-box').hidden = true; $('when-open').hidden = false; setErr('when-err', '', ['when']); render(); $('when-open').focus(); });
    $('note-open').addEventListener('click', () => { $('note-box').hidden = false; $('note-open').hidden = true; $('note').focus(); });
    ['goal', 'goal-st', 'goal-lb'].forEach(id => { $(id).addEventListener('change', saveGoal); $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveGoal(); } }); });
    $('target-open').addEventListener('click', () => { $('target-box').hidden = false; $('target-open').hidden = true; $('target').focus(); });
    $('target').addEventListener('change', saveTarget);
    $('target-remove').addEventListener('click', () => { const p = person(); $('target').value = ''; p.target = null; save(); $('target-box').hidden = true; $('target-open').hidden = false; setErr('target-err', '', ['target']); render(); $('target-open').focus(); });
    $('height-open').addEventListener('click', () => { heightOpen = true; $('height-box').hidden = false; $('height-open').hidden = true; (person().hUnit === 'cm' ? $('h-cm') : $('h-ft')).focus(); });
    ['h-cm', 'h-ft', 'h-in'].forEach(id => { $(id).addEventListener('change', saveHeight); $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveHeight(); } }); });
    $('no-bmi').addEventListener('change', () => { person().noBmi = $('no-bmi').checked; save(); render(); });
    $('height-remove').addEventListener('click', () => { const p = person(); p.heightMm = null; heightOpen = false; save(); fillInputs(); render(); $('height-open').focus(); });
    $('more').addEventListener('click', () => { shown += 60; renderList(); });
    $('name').addEventListener('input', () => { person().name = $('name').value.slice(0, 40); save(); render(); });

    $('copy').addEventListener('click', () => copyText(fullText(5000), ok => say('share-msg', ok ? 'Copied. Paste it into a message or note.' : 'Could not copy here. Use Email or Download spreadsheet instead.', { bad: !ok })));
    $('email').addEventListener('click', e => {
        if (!S || S.empty) { e.preventDefault(); return; }
        const p = person();
        $('email').href = 'mailto:?subject=' + encodeURIComponent('Weight log' + (p.name ? ': ' + p.name : '')) + '&body=' + encodeURIComponent(fullText(60));
    });
    $('print').addEventListener('click', () => { buildReport(); window.print(); });
    $('csv').addEventListener('click', () => {
        const p = person(), rows = [['Date', 'Weight (kg)', 'Weight (lb)', 'Note']];
        C.sortEntries(p.entries).forEach(e => rows.push([e.d, (e.g / 1000).toFixed(1), C.inUnit(e.g, 'lb').toFixed(1), e.note]));
        download(fileName('csv'), '﻿' + rows.map(r => r.map(C.csvCell).join(',')).join('\r\n'), 'text/csv');
        say('share-msg', 'Spreadsheet saved to your downloads.');
    });

    $('person-add').addEventListener('click', () => {
        if (state.people.length >= 20) { say('set-msg', 'You can keep up to 20 people.', { bad: true }); return; }
        const q = C.newPerson(''); q.unit = person().unit; q.hUnit = person().hUnit;
        state.people.push(q); state.current = q.id; save(); heightOpen = false; fillInputs(); render();
        say('set-msg', 'Added ' + pname(q) + '. Type a name above if you like.'); $('name').focus();
    });
    $('person-remove').addEventListener('click', () => {
        const p = person(), snap = snapshot(), n = p.entries.length;
        state.people = state.people.filter(x => x !== p); state.current = state.people[0].id; save(); fillInputs(); render();
        say('set-msg', 'Removed ' + pname(p) + (n ? ' and ' + plural(n, 'weigh-in') : '') + '.', { undo: () => restoreSnapshot(snap), undone: 'Brought back.' });
    });
    $('wipe').addEventListener('click', () => {
        const p = person(), snap = snapshot(), n = p.entries.length; if (!n) return;
        p.entries = []; save(); render();
        say('set-msg', 'Deleted ' + plural(n, 'weigh-in') + '. Your goal and settings are kept.', { undo: () => restoreSnapshot(snap), undone: 'Weights brought back.' });
    });
    $('backup').addEventListener('click', () => { download('weight-tracker-backup-' + today() + '.json', JSON.stringify(state, null, 1), 'application/json'); say('set-msg', 'Backup saved to your downloads.'); });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; $('restore-file').value = '';
        if (!f) return;
        if (f.size > 20e6) { say('set-msg', 'That file is too big to be a backup from this app.', { bad: true }); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let s = null; try { s = C.clean(JSON.parse(rd.result)); } catch (e) { s = null; }
            if (!s) { say('set-msg', 'That file is not a backup from this app. Nothing was changed.', { bad: true }); return; }
            const snap = snapshot(), n = s.people.reduce((a, q) => a + q.entries.length, 0);
            state = s; save(); fillInputs(); render();
            say('set-msg', 'Restored ' + plural(s.people.length, 'person').replace('persons', 'people') + ' and ' + plural(n, 'weigh-in') + '.', { undo: () => restoreSnapshot(snap), undone: 'Back to how it was before.' });
        };
        rd.onerror = () => say('set-msg', 'Could not read that file.', { bad: true });
        rd.readAsText(f);
    });

    // a new day while the page stays open; the chart follows the width
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
    let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawChart, 120); });
    // another tab changed the data
    window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); fillInputs(); render(); } });

    fillInputs(); render();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
