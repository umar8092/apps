// Qaza Prayer and Fast Tracker: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.QazaCore;
    const KEY = 'qaza-prayer-and-fast-tracker.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };

    let canSave = true, state, today = C.todayIso();
    let editing = false;      // the totals form is open over an existing setup
    let logDay = '';          // '' = today, otherwise the earlier day being counted
    let renaming = 0;         // id of the person being renamed
    let allHist = false;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved counts could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; editing = false; renaming = 0; commit(); if (!C.hasSetup(cur())) openSetup(); }
    function commit() { save(); render(); }
    const cur = () => state.people.find(p => p.id === state.active) || state.people[0];

    // ---------- messages with Undo ----------
    const MSGS = ['today-msg', 'f-msg', 'p-msg', 'set-msg'];
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
    function setErr(id, text, input) { $(id).textContent = text || ''; if (input) input.setAttribute('aria-invalid', text ? 'true' : 'false'); }

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
        const s = el('span'); s.style.width = (fraction > 0 ? Math.max(1, pct) : 0) + '%'; w.appendChild(s); return w;
    }
    // 0.6%, 12%, never 100% until everything is done
    function pct(done, all) {
        if (!all) return '0%';
        const v = Math.floor(done * 1000 / all) / 10;
        return (v < 10 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.floor(v))) + '%';
    }
    // "497 days" as "about 1 year 4 months"
    function span(days) {
        if (days <= 1) return 'today';
        if (days < 60) return 'in ' + C.plural(days, 'day', 'days');
        const months = Math.round(days / 30.44);
        if (months < 24) return 'in about ' + C.plural(months, 'month', 'months');
        const y = Math.floor(months / 12), m = months % 12;
        return 'in about ' + C.plural(y, 'year', 'years') + (m ? ' ' + C.plural(m, 'month', 'months') : '');
    }
    const daysWord = n => C.plural(n, 'day', 'days') + ' of prayers';
    const dayName = d => (d === today ? 'today' : d === C.addDays(today, -1) ? 'yesterday' : C.fmtDate(d));
    const theDay = () => logDay || today;

    // ---------- the totals form ----------
    function numGrid() {
        const g = $('num-grid'); if (g.children.length) return;
        C.PRAYERS.forEach(k => {
            const w = el('div', 'num'); w.dataset.k = k;
            const l = el('label', null, C.NAMES[k]); l.htmlFor = 'n-' + k;
            const i = el('input'); i.id = 'n-' + k; i.type = 'text'; i.inputMode = 'numeric'; i.maxLength = 7; i.autocomplete = 'off'; i.placeholder = '0';
            i.addEventListener('input', preview);
            w.append(l, i); g.appendChild(w);
        });
    }
    const mode = () => ($('m-numbers').checked ? 'numbers' : 'dates');
    function openSetup() {
        const p = cur(); numGrid();
        editing = C.hasSetup(p);
        $('s-name').value = p.name;
        const st = p.setup || { mode: 'dates' };
        $(st.mode === 'numbers' ? 'm-numbers' : 'm-dates').checked = true;
        $('s-from').value = st.from || ''; $('s-to').value = st.to || '';
        $('s-leave').value = st.leaveOut ? String(st.leaveOut) : '';
        $('w-leave').hidden = !st.leaveOut; $('o-leave').setAttribute('aria-expanded', String(!!st.leaveOut));
        $('w-age').hidden = true; $('o-age').setAttribute('aria-expanded', 'false'); $('s-birth').value = ''; $('s-age').value = '';
        C.PRAYERS.forEach(k => { $('n-' + k).value = p.owed[k] != null && editing ? C.fmt(p.owed[k]) : ''; });
        $('n-all').value = '';
        $('s-witr').checked = p.witr;
        $('s-to').max = today; $('s-from').max = today; $('s-birth').max = today;
        ['e-name', 'e-from', 'e-to', 'e-leave', 'e-num', 'e-age'].forEach(id => setErr(id, ''));
        document.querySelectorAll('#setup-form [aria-invalid]').forEach(i => i.setAttribute('aria-invalid', 'false'));
        render();
        if (editing) $('setup').scrollIntoView({ block: 'start' });
    }
    function readDates(showErrors) {
        const leaveTxt = $('s-leave').value.trim();
        const leave = leaveTxt ? C.readInt(leaveTxt) : 0;
        if (Number.isNaN(leave)) { if (showErrors) setErr('e-leave', 'Type the days as a whole number, such as 700.', $('s-leave')); return null; }
        const r = C.owedFromDates($('s-from').value, $('s-to').value, leave, today);
        if (showErrors) {
            setErr('e-from', r.error === 'from' ? r.msg : '', $('s-from')); setErr('e-to', r.error === 'to' ? r.msg : '', $('s-to'));
            setErr('e-leave', r.error === 'leave' ? r.msg : '', $('s-leave'));
        }
        return r.error ? null : Object.assign(r, { leave });
    }
    function readNumbers() {
        const owed = {}; let bad = null;
        C.PRAYERS.forEach(k => {
            const t = $('n-' + k).value.trim();
            if (k === 'witr' && !$('s-witr').checked) return;
            const n = t === '' ? 0 : C.readInt(t);
            if (Number.isNaN(n) && !bad) bad = k;
            owed[k] = n;
        });
        return { owed, bad };
    }
    function preview() {
        const out = $('preview'), witr = $('s-witr').checked, n = witr ? 6 : 5;
        $('num-grid').querySelector('[data-k="witr"]').hidden = !witr;
        $('w-dates').hidden = mode() !== 'dates'; $('w-numbers').hidden = mode() !== 'numbers';
        if (mode() === 'dates') {
            const r = readDates(false);
            if (!r) { out.textContent = ''; return; }
            out.textContent = C.fmt(r.days) + ' days' + (r.leave ? ' (' + C.fmt(r.span) + ' less ' + C.fmt(r.leave) + ' left out)' : '') + ': ' + C.fmt(r.days) + ' of each prayer, ' + C.fmt(r.days * n) + ' prayers in all' + (witr ? ' with Witr.' : '.');
        } else {
            const { owed, bad } = readNumbers();
            if (bad) { out.textContent = ''; return; }
            const t = C.kinds({ witr }).reduce((a, k) => a + (owed[k] || 0), 0);
            out.textContent = t ? C.fmt(t) + ' prayers in all.' : '';
        }
    }
    function submitSetup(ev) {
        ev.preventDefault();
        const p = cur(), witr = $('s-witr').checked;
        const name = C.cleanText($('s-name').value, C.LIMITS.name) || 'Me';
        let owed = {}, setup;
        if (mode() === 'dates') {
            const r = readDates(true);
            if (!r) { const bad = document.querySelector('#w-dates [aria-invalid="true"]'); if (bad) bad.focus(); return; }
            C.PRAYERS.forEach(k => { owed[k] = r.days; });
            setup = { mode: 'dates', from: $('s-from').value, to: $('s-to').value, leaveOut: r.leave };
        } else {
            const rn = readNumbers();
            if (rn.bad) { setErr('e-num', 'Type a whole number for ' + C.NAMES[rn.bad] + ', such as 0 or 1,204.'); $('n-' + rn.bad).focus(); return; }
            owed = rn.owed; setup = { mode: 'numbers' };
        }
        if (!witr) owed.witr = p.owed.witr || 0;
        const err = C.checkOwed(p, owed, witr);
        if (err) {
            if (mode() === 'numbers') { setErr('e-num', err.msg); $('n-' + err.error).focus(); }
            else setErr('e-to', err.msg, $('s-to'));
            return;
        }
        const snap = snapshot(), was = editing;
        Object.assign(p, { name, witr, owed, setup });
        editing = false; commit();
        show('today-msg', was ? 'Totals saved. What you made up is kept.' : 'Saved: ' + C.fmt(C.owedTotal(p)) + ' prayers to make up. Tap +1 as you pray each one.', was ? snap : null);
        $('today').scrollIntoView({ block: 'start' });
    }

    // ---------- render ----------
    function render() {
        today = C.todayIso();
        if (logDay && (!C.isIso(logDay) || logDay >= today)) logDay = '';
        const p = cur(), set = C.hasSetup(p);
        $('setup').hidden = set && !editing;
        $('setup-h').textContent = set ? 'Change the totals' + (state.people.length > 1 ? ': ' + p.name : '') : 'How many prayers do you owe?';
        $('setup-save').textContent = set ? 'Save the totals' : 'Save and start counting';
        $('setup-cancel').hidden = !set; $('clear-made').hidden = !set;
        if (!$('setup').hidden) preview();
        $('today').hidden = !set || editing; $('left').hidden = !set || editing;
        renderToday(p); renderLeft(p); renderFasts(p); renderHist(p); renderPeople(); renderShare(p);
    }

    function renderToday(p) {
        if (!C.hasSetup(p)) return;
        const d = theDay(), ks = C.kinds(p);
        $('today-h').textContent = 'Make up ' + (logDay ? 'on ' + C.fmtDate(d) : 'today') + (state.people.length > 1 ? ': ' + p.name : '');
        const opt = ['1', '2', '3', '5'].includes(String(p.perDay)) ? String(p.perDay) : 'custom';
        if (document.activeElement !== $('g-custom')) {
            $('g-per').value = opt; $('w-per').hidden = opt !== 'custom';
            if (opt === 'custom') $('g-custom').value = String(p.perDay);
        }
        $('day-text').textContent = logDay ? 'Counting for ' + C.fmtDateY(d) + '.' : 'Counting for today.';
        $('day-open').textContent = logDay ? 'Back to today' : 'Another day?';
        const left = C.leftTotal(p), need = p.perDay * ks.length, got = C.dayPrayers(p, d), line = $('today-line');
        line.className = 'state';
        if (!left && C.owedTotal(p)) { line.textContent = 'All your qaza prayers are made up. Alhamdulillah!'; line.classList.add('good'); }
        else if (got >= need) {
            const s = C.streak(p, p.perDay, today);
            line.textContent = (logDay ? C.fmtDate(d) + ': goal reached, ' : 'Goal reached for today: ') + C.plural(got, 'prayer', 'prayers') + ' made up.' + (!logDay && s > 1 ? ' ' + C.fmt(s) + ' days in a row.' : '');
            line.classList.add('good');
        } else {
            const s = C.streak(p, p.perDay, today);
            line.textContent = (logDay ? C.fmtDate(d) : 'Today') + ': ' + C.fmt(got) + ' of ' + C.fmt(need) + ' made up. ' + C.plural(need - got, 'more reaches', 'more reach') + ' your goal.' + (!logDay && s ? ' Streak: ' + C.plural(s, 'day', 'days') + '.' : '');
        }
        $('full').hidden = !left;
        $('full').textContent = '+1 of every prayer (a full day' + (p.witr ? ', with Witr)' : ')');
        const ul = $('counters'); ul.textContent = '';
        ks.forEach(k => {
            const l = C.leftOf(p, k), li = el('li', 'box counter' + (l ? '' : ' done'));
            const top = el('div', 'c-top'); top.append(el('h3', null, C.NAMES[k]), el('span', 'c-left', l ? C.fmt(l) + ' left' : 'Done ✓'));
            const sub = el('p', 'c-sub', 'Made up ' + dayName(d) + ': ' + C.fmt(C.dayCount(p, d, k)));
            const bs = el('div', 'c-btns');
            const plus = btn('primary', '+1', () => tap(k, 1), 'Made up one ' + C.NAMES[k]); plus.disabled = !l;
            const minus = btn('secondary', '−1', () => tap(k, -1), 'Take back one ' + C.NAMES[k]); minus.disabled = !C.doneOf(p, k);
            bs.append(plus, minus); li.append(top, sub, bs); ul.appendChild(li);
        });
    }
    function tap(k, n) {
        const p = cur(), d = theDay();
        if (n > 0) { if (!C.addOne(p, k, d)) return; commit(); clearMsg('today-msg'); }
        else {
            const from = C.takeBack(p, k, d); if (!from) return;
            commit(); show('today-msg', 'Took back one ' + C.NAMES[k] + (from !== d ? ' from ' + C.fmtDate(from) : '') + '.');
        }
        const b = document.querySelector('#counters [aria-label="' + (n > 0 ? 'Made up one ' : 'Take back one ') + C.NAMES[k] + '"]');
        if (b && !b.disabled) b.focus();
    }

    function renderLeft(p) {
        const box = $('left-body'); box.textContent = '';
        if (!C.hasSetup(p)) return;
        $('left-h').textContent = 'Still to make up' + (state.people.length > 1 ? ': ' + p.name : '');
        const owed = C.owedTotal(p), done = C.doneTotal(p), left = C.leftTotal(p);
        const big = el('p', 'big'); big.append(el('strong', null, C.fmt(left)), document.createTextNode(' ' + (left === 1 ? 'prayer' : 'prayers') + ' left'));
        box.append(big, el('p', 'sub-line', 'of ' + C.fmt(owed) + ' · ' + C.fmt(done) + ' made up (' + pct(done, owed) + ')'), bar(owed ? done / owed : 0, 'Prayers made up'));
        const ul = el('ul', 'left-list');
        C.kinds(p).forEach(k => {
            const li = el('li'); li.append(el('span', 'k', C.NAMES[k]), el('span', 'v', C.leftOf(p, k) ? C.fmt(C.leftOf(p, k)) + ' left of ' + C.fmt(p.owed[k] || 0) : 'Done ✓ (' + C.fmt(p.owed[k] || 0) + ')'));
            ul.appendChild(li);
        });
        box.appendChild(ul);
        if (!left) { box.appendChild(el('p', 'state good', owed ? 'All your qaza prayers are made up. Alhamdulillah!' : 'Nothing to make up.')); }
        else {
            const f = C.finishPrayers(p, p.perDay, today);
            box.appendChild(el('p', 'state good', 'At ' + daysWord(p.perDay) + ' a day you finish around ' + C.fmtDateY(f.date) + ' (' + span(f.days) + ').'));
            const pc = C.pace(p, today);
            if (pc) {
                const per = Math.round(pc.perDay * 10) / 10;
                let t = 'Your pace ' + (pc.span < 30 ? 'since you started (' + C.plural(pc.span, 'day', 'days') + ')' : 'in the last 30 days') + ': ' + C.plural(pc.prayers, 'prayer', 'prayers') + ', about ' + (per < 0.1 ? 'less than 0.1' : String(per)) + ' ' + (per === 1 ? 'day' : 'days') + ' of prayers a day.';
                if (pc.perDay >= 0.05) { const days = C.kinds(p).reduce((a, k) => Math.max(a, Math.ceil(C.leftOf(p, k) / pc.perDay)), 0); t += ' At that pace: around ' + C.fmtMonthY(C.addDays(today, days)) + '.'; }
                box.appendChild(el('p', 'sub-line', t));
            }
        }
        if (C.fastsOwed(p)) box.appendChild(el('p', 'sub-line', 'Fasts: ' + (C.fastsLeft(p) ? C.fmt(C.fastsLeft(p)) + ' left of ' + C.fmt(C.fastsOwed(p)) : 'all ' + C.fmt(C.fastsOwed(p)) + ' made up ✓') + '.'));
    }

    function renderFasts(p) {
        $('fasts-h').textContent = 'Missed fasts' + (state.people.length > 1 ? ': ' + p.name : '');
        const ul = $('ram-list'); const focusId = document.activeElement && document.activeElement.id;
        ul.textContent = '';
        $('f-empty').hidden = p.ramadans.length > 0;
        p.ramadans.forEach(r => {
            const li = el('li', 'box ram');
            const top = el('div', 'c-top'); top.append(el('h3', null, r.year ? 'Ramadan ' + r.year : 'Ramadan'), btn('mini del', 'Remove', () => removeRam(r.id), 'Remove Ramadan ' + (r.year || '')));
            const two = el('div', 'two');
            const a = el('div'), la = el('label', null, 'Year (optional)'), ia = el('input'); ia.id = 'ry-' + r.id; la.htmlFor = ia.id; ia.type = 'text'; ia.inputMode = 'numeric'; ia.maxLength = 4; ia.autocomplete = 'off'; ia.placeholder = 'e.g. 2019'; ia.value = r.year;
            const b = el('div'), lb = el('label', null, 'Days missed'), ib = el('input'); ib.id = 'rd-' + r.id; lb.htmlFor = ib.id; ib.type = 'text'; ib.inputMode = 'numeric'; ib.maxLength = 2; ib.autocomplete = 'off'; ib.placeholder = '1 to 30'; ib.value = String(r.days);
            a.append(la, ia); b.append(lb, ib); two.append(a, b);
            const er = el('p', 'err'); er.id = 'er-' + r.id; er.setAttribute('role', 'alert');
            ia.setAttribute('aria-describedby', er.id); ib.setAttribute('aria-describedby', er.id);
            const change = () => editRam(r.id, ia, ib, er);
            ia.addEventListener('change', change); ib.addEventListener('change', change);
            li.append(top, two, er); ul.appendChild(li);
        });
        if (focusId && $(focusId)) $(focusId).focus();
        const owed = C.fastsOwed(p);
        $('fast-count').hidden = !owed;
        if (!owed) return;
        const left = C.fastsLeft(p), d = theDay();
        $('f-left').textContent = left ? C.fmt(left) + ' left of ' + C.fmt(owed) : 'All ' + C.fmt(owed) + ' made up ✓';
        $('f-today').textContent = 'Made up ' + dayName(d) + ': ' + C.fmt(C.dayCount(p, d, 'fast')) + ' · ' + C.fmt(Math.min(owed, C.fastsDone(p))) + ' in all';
        $('f-plus').disabled = !left; $('f-minus').disabled = !C.fastsDone(p);
        $('f-week').value = String(p.fastsPerWeek);
        const f = C.finishFasts(p, p.fastsPerWeek, today), line = $('f-finish');
        line.className = 'state good';
        line.textContent = !left ? 'All your missed fasts are made up. Alhamdulillah!' : 'At ' + (p.fastsPerWeek === 7 ? 'one fast every day' : p.fastsPerWeek + ' a week') + ' you finish around ' + C.fmtDateY(f.date) + ' (' + span(f.days) + ').';
    }
    function addRam() {
        const p = cur();
        if (p.ramadans.length >= C.LIMITS.ramadans) { show('f-msg', 'That is the most Ramadans one person can have.'); return; }
        const used = new Set(p.ramadans.map(r => r.year)); let y = Number(today.slice(0, 4));
        if (today.slice(5) < '03-01') y--;   // the last Ramadan that has passed is a guess; the person can change it
        while (used.has(String(y)) && y > 1950) y--;
        const id = state.rid++;
        p.ramadans.push({ id, year: String(y), days: 1 });
        commit();
        const i = $('rd-' + id); if (i) { i.focus(); i.select(); }
        show('f-msg', 'Added Ramadan ' + y + '. Type the days you missed (and change the year if it is wrong).');
    }
    function editRam(id, iy, id2, er) {
        const p = cur(), r = p.ramadans.find(x => x.id === id); if (!r) return;
        const y = iy.value.trim(), days = C.readInt(id2.value);
        if (y && !/^\d{4}$/.test(y)) { er.textContent = 'Type the year as 4 digits, such as 2019, or leave it empty.'; iy.setAttribute('aria-invalid', 'true'); return; }
        if (Number.isNaN(days) || days < 1 || days > 30) { er.textContent = 'Type the days missed as a number from 1 to 30.'; id2.setAttribute('aria-invalid', 'true'); return; }
        const done = C.fastsDone(p), after = C.fastsOwed(p) - r.days + days;
        if (after < done) { er.textContent = 'You have already made up ' + C.plural(done, 'fast', 'fasts') + ', so the days cannot total less than that.'; id2.setAttribute('aria-invalid', 'true'); return; }
        r.year = y; r.days = days; commit();
    }
    function removeRam(id) {
        const p = cur(), r = p.ramadans.find(x => x.id === id); if (!r) return;
        if (C.fastsOwed(p) - r.days < C.fastsDone(p)) { show('f-msg', 'You have already made up ' + C.plural(C.fastsDone(p), 'fast', 'fasts') + '. Take some back with −1 first, or lower the days in another box.'); return; }
        const snap = snapshot();
        p.ramadans = p.ramadans.filter(x => x.id !== id); commit();
        show('f-msg', 'Removed ' + (r.year ? 'Ramadan ' + r.year : 'that Ramadan') + '.', snap);
    }

    function renderHist(p) {
        const h = C.history(p), ul = $('hist-list'); ul.textContent = '';
        $('hist-empty').hidden = h.length > 0;
        const shown = allHist ? h : h.slice(0, 10);
        shown.forEach(x => {
            const li = el('li');
            const parts = [];
            if (x.prayers) parts.push(C.plural(x.prayers, 'prayer', 'prayers'));
            if (x.fasts) parts.push(C.plural(x.fasts, 'fast', 'fasts'));
            li.append(el('span', 'k', C.fmtDateY(x.d)), el('span', 'v', parts.join(', ') || '0'));
            const ks = C.kinds(p).filter(k => x.byKind[k]);
            if (ks.length) {
                const same = ks.length === C.kinds(p).length && ks.every(k => x.byKind[k] === x.byKind[ks[0]]);
                li.appendChild(el('span', 'detail', same ? C.fmt(x.byKind[ks[0]]) + ' of each prayer' : ks.map(k => C.NAMES[k] + ' ' + C.fmt(x.byKind[k])).join(', ')));
            }
            ul.appendChild(li);
        });
        $('hist-more').hidden = h.length <= 10;
        $('hist-more').textContent = allHist ? 'Show fewer days' : 'Show all ' + h.length + ' days';
    }

    function renderPeople() {
        const ul = $('p-list'); ul.textContent = '';
        state.people.forEach(p => {
            const li = el('li', 'box person' + (p.id === state.active ? ' on' : ''));
            if (renaming === p.id) {
                const f = el('form', 'rename'); f.noValidate = true;
                const l = el('label', null, 'New name'), i = el('input'); i.id = 'rn-' + p.id; l.htmlFor = i.id; i.type = 'text'; i.maxLength = C.LIMITS.name; i.value = p.name; i.autocomplete = 'off';
                const row = el('div', 'box-btns two');
                const sv = el('button', 'primary small', 'Save'); sv.type = 'submit';
                row.append(sv, btn('secondary small', 'Cancel', () => { renaming = 0; render(); }));
                f.append(l, i, row);
                f.addEventListener('submit', e => { e.preventDefault(); const n = C.cleanText(i.value, C.LIMITS.name); if (!n) { i.focus(); return; } p.name = n; renaming = 0; commit(); });
                li.appendChild(f); ul.appendChild(li); setTimeout(() => i.focus(), 0); return;
            }
            const top = el('div', 'c-top'); top.appendChild(el('h3', 'box-name', p.name));
            if (p.id === state.active) top.appendChild(el('span', 'badge', 'Open now'));
            const parts = [];
            if (C.hasSetup(p)) parts.push(C.leftTotal(p) ? C.fmt(C.leftTotal(p)) + ' prayers left' : 'all prayers made up ✓');
            else parts.push('totals not set yet');
            if (C.fastsOwed(p)) parts.push(C.fastsLeft(p) ? C.fmt(C.fastsLeft(p)) + ' fasts left' : 'all fasts made up ✓');
            const single = state.people.length === 1, row = el('div', 'box-btns ' + (single ? 'one' : 'three'));
            const open = btn('mini', 'Open', () => { state.active = p.id; editing = false; logDay = ''; commit(); if (!C.hasSetup(p)) openSetup(); show('p-msg', 'Now counting for ' + p.name + '.'); window.scrollTo(0, 0); }, 'Open ' + p.name);
            open.disabled = p.id === state.active;
            const del = btn('mini del', 'Remove', () => removePerson(p.id), 'Remove ' + p.name); del.disabled = state.people.length === 1;
            const ren = btn('mini', 'Rename', () => { renaming = p.id; render(); }, 'Rename ' + p.name);
            if (single) row.append(ren); else row.append(open, ren, del);
            li.append(top, el('p', 'box-sub', parts.join(', ')), row);
            ul.appendChild(li);
        });
    }
    function removePerson(id) {
        const p = state.people.find(x => x.id === id); if (!p || state.people.length === 1) return;
        const snap = snapshot();
        state.people = state.people.filter(x => x.id !== id);
        if (state.active === id) { state.active = state.people[0].id; editing = false; }
        commit(); show('p-msg', 'Removed ' + p.name + ' and their counts.', snap);
    }
    function addPerson(ev) {
        ev.preventDefault();
        const name = C.cleanText($('p-name').value, C.LIMITS.name);
        if (!name) { setErr('e-pname', 'Type their name.', $('p-name')); $('p-name').focus(); return; }
        if (state.people.length >= C.LIMITS.people) { setErr('e-pname', 'That is the most people for one phone (' + C.LIMITS.people + ').', $('p-name')); return; }
        if (state.people.some(p => p.name.toLowerCase() === name.toLowerCase())) { setErr('e-pname', name + ' is already on the list. Use another name, such as ' + name + ' 2.', $('p-name')); return; }
        setErr('e-pname', '', $('p-name'));
        const p = C.newPerson(state.nextId++, name); state.people.push(p); state.active = p.id; logDay = '';
        $('p-name').value = ''; $('p-add').hidden = true; $('p-open').setAttribute('aria-expanded', 'false');
        commit(); openSetup(); show('p-msg', 'Added ' + name + '. Set their totals at the top.');
        $('setup').scrollIntoView({ block: 'start' });
    }

    function renderShare(p) {
        const body = C.summary(p, p.perDay, today);
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('Qaza made up: ' + p.name) + '&body=' + encodeURIComponent(body + '\n');
    }

    // ---------- events ----------
    function bind() {
        $('setup-form').addEventListener('submit', submitSetup);
        ['s-from', 's-to', 's-leave', 's-witr', 'm-dates', 'm-numbers'].forEach(id => $(id).addEventListener('input', preview));
        $('s-witr').addEventListener('change', preview);
        $('m-numbers').addEventListener('change', () => {
            const r = readDates(false);
            if (r && C.PRAYERS.every(k => !$('n-' + k).value.trim())) C.PRAYERS.forEach(k => { $('n-' + k).value = C.fmt(r.days); });
            preview(); setErr('e-num', '');
        });
        $('m-dates').addEventListener('change', preview);
        $('o-age').addEventListener('click', () => { const h = !$('w-age').hidden; $('w-age').hidden = h; $('o-age').setAttribute('aria-expanded', String(!h)); if (!h) $('s-birth').focus(); });
        $('o-leave').addEventListener('click', () => { const h = !$('w-leave').hidden; $('w-leave').hidden = h; $('o-leave').setAttribute('aria-expanded', String(!h)); if (!h) $('s-leave').focus(); else { $('s-leave').value = ''; preview(); } });
        const age = () => {
            const b = $('s-birth').value, t = $('s-age').value.trim(); if (!b || !t) { setErr('e-age', ''); return; }
            const a = C.readInt(t);
            if (Number.isNaN(a) || a > 120) { setErr('e-age', 'Type the age as a whole number of years, such as 12.', $('s-age')); return; }
            const d = C.dayAtAge(b, a);
            if (!d || d > today) { setErr('e-age', 'That birthday has not come yet.', $('s-age')); return; }
            setErr('e-age', '', $('s-age')); $('s-from').value = d; $('h-age').textContent = 'First day missed set to ' + C.fmtDateY(d) + '.'; preview();
        };
        $('s-birth').addEventListener('input', age); $('s-age').addEventListener('input', age);
        document.querySelectorAll('[data-to]').forEach(b => b.addEventListener('click', () => { $('s-to').value = C.addDays(today, Number(b.dataset.to)); setErr('e-to', '', $('s-to')); preview(); }));
        $('n-all-btn').addEventListener('click', () => {
            const n = C.readInt($('n-all').value);
            if (Number.isNaN(n)) { setErr('e-num', 'Type a whole number in "Same number for every prayer" first.'); $('n-all').focus(); return; }
            C.PRAYERS.forEach(k => { $('n-' + k).value = C.fmt(n); }); setErr('e-num', ''); preview();
        });
        $('setup-cancel').addEventListener('click', () => { editing = false; render(); $('left').scrollIntoView({ block: 'start' }); });
        $('clear-made').addEventListener('click', () => {
            const p = cur(), snap = snapshot(); p.log = {}; editing = false; commit();
            show('today-msg', 'Cleared everything ' + p.name + ' made up. The totals are kept.', snap);
        });
        $('edit-totals').addEventListener('click', openSetup);

        $('g-per').addEventListener('change', () => {
            const v = $('g-per').value;
            if (v === 'custom') { $('w-per').hidden = false; $('g-custom').value = String(cur().perDay); $('g-custom').focus(); return; }
            $('w-per').hidden = true; cur().perDay = Number(v); commit();
        });
        const setCustom = () => {
            const n = C.readInt($('g-custom').value);
            if (Number.isNaN(n) || n < 1 || n > C.LIMITS.perDay) { setErr('e-per', 'Type a number from 1 to ' + C.LIMITS.perDay + '.', $('g-custom')); return; }
            setErr('e-per', '', $('g-custom')); cur().perDay = n; $('g-custom').blur(); commit();
        };
        $('g-custom-btn').addEventListener('click', setCustom);
        $('g-custom').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setCustom(); } });
        $('day-open').addEventListener('click', () => {
            if (logDay) { logDay = ''; $('w-day').hidden = true; $('day-open').setAttribute('aria-expanded', 'false'); render(); return; }
            const h = !$('w-day').hidden; $('w-day').hidden = h; $('day-open').setAttribute('aria-expanded', String(!h));
            if (!h) { $('day').max = C.addDays(today, -1); $('day').value = C.addDays(today, -1); logDay = $('day').value; render(); $('day').focus(); }
        });
        $('day').addEventListener('change', () => {
            const v = $('day').value;
            if (!C.isIso(v) || v >= today) { logDay = ''; $('day').value = ''; $('w-day').hidden = true; } else logDay = v;
            render();
        });
        $('full').addEventListener('click', () => {
            const p = cur(), snap = snapshot(), n = C.fullDay(p, theDay()); if (!n) return;
            commit(); show('today-msg', 'Added one of each: ' + C.plural(n, 'prayer', 'prayers') + '.', snap);
        });

        $('ram-add').addEventListener('click', addRam);
        $('f-plus').addEventListener('click', () => { if (C.addOne(cur(), 'fast', theDay())) { commit(); $('f-plus').focus(); } });
        $('f-minus').addEventListener('click', () => { const from = C.takeBack(cur(), 'fast', theDay()); if (from) { commit(); show('f-msg', 'Took back one fast' + (from !== theDay() ? ' from ' + C.fmtDate(from) : '') + '.'); } });
        $('f-week').addEventListener('change', () => { cur().fastsPerWeek = Number($('f-week').value) || 2; commit(); });

        $('hist-more').addEventListener('click', () => { allHist = !allHist; render(); });
        $('p-open').addEventListener('click', () => { const h = !$('p-add').hidden; $('p-add').hidden = h; $('p-open').setAttribute('aria-expanded', String(!h)); if (!h) $('p-name').focus(); });
        $('p-add').addEventListener('submit', addPerson);

        $('copy').addEventListener('click', () => { const p = cur(); copyText(C.summary(p, p.perDay, today)).then(ok => show('set-msg', ok ? 'Copied. Paste it in a message or a note.' : 'Could not copy. Use "Email my progress" instead.')); });
        $('backup').addEventListener('click', () => { download('qaza-tracker-backup-' + today + '.json', 'application/json', JSON.stringify(Object.assign({ app: 'qaza-prayer-and-fast-tracker', saved: today }, state), null, 1)); show('set-msg', 'Backup saved to your downloads.'); });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', ev => {
            const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (!f) return;
            if (f.size > 5e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            const rd = new FileReader();
            rd.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(String(rd.result))); } catch (e) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
                const snap = snapshot(); state = s; editing = false; logDay = ''; commit(); if (!C.hasSetup(cur())) openSetup();
                show('set-msg', 'Backup restored: ' + C.plural(s.people.length, 'person', 'people') + '.', snap);
            };
            rd.onerror = () => show('set-msg', 'Could not read that file.');
            rd.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            const snap = snapshot(); state = C.emptyState(); editing = false; logDay = ''; commit(); openSetup();
            show('set-msg', 'Everything deleted.', snap);
        });
        // a new day while the page stays open
        setInterval(() => { if (C.todayIso() !== today) render(); }, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayIso() !== today) render(); });
    }

    state = load();
    bind();
    if (!C.hasSetup(cur())) openSetup(); else render();
    save();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
