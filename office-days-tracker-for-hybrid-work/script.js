// Office Days Tracker for Hybrid Work: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.OfficeCore;
    const KEY = 'office-days-tracker-for-hybrid-work.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    let canSave = true, state, today = C.todayIso();
    let sel = today;                       // the day being marked
    let view = C.parseDate(today);         // the month shown { y, m }

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved days could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; fillRule(); commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['mark-msg', 'rule-msg', 'range-msg', 'set-msg'];
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
    function mailto(subject, text) {
        let body = text;
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(Too long for an email link. Use "Copy my summary" and paste it.)';
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
    const dayName = d => C.shortDate(d, today) + (d === today ? ' (today)' : '');

    // ---------- render ----------
    function render() {
        renderSummary();
        renderMarker();
        renderCal();
        $('rule-text').textContent = 'Rule: ' + C.ruleText(state) + '.';
        $('mail').href = mailto('My office days', C.summaryText(state, today));
    }

    function renderSummary() {
        const b = $('sum-body'); b.textContent = '';
        const s = C.current(state, today);
        b.appendChild(el('p', 'period', C.rangeName(s.a, s.b, s.kind, today)));
        b.appendChild(el('p', 'next st-' + s.state, C.headline(s)));
        if (s.req > 0) {
            const bar = el('div', 'bar'); bar.setAttribute('aria-hidden', 'true');
            const done = el('span', 'done'), plan = el('span', 'plan');
            done.style.width = Math.min(100, 100 * s.doneH / s.req) + '%';
            plan.style.width = Math.max(0, Math.min(100 - 100 * s.doneH / s.req, 100 * s.planH / s.req)) + '%';
            bar.append(done, plan); b.appendChild(bar);
        }
        const ul = el('ul', 'facts');
        C.lines(s, state, today).forEach(l => ul.appendChild(el('li', null, l)));
        b.appendChild(ul);
        const more = [];
        if (state.rule.type === 'week') more.push(C.quarterLine(state, today));
        const p = C.prevLine(state, today); if (p) more.push(p);
        if (more.length) { const u2 = el('ul', 'facts more'); more.forEach(l => u2.appendChild(el('li', null, l))); b.appendChild(u2); }
        if (!Object.keys(state.days).length) b.appendChild(el('p', 'hint', 'Start by marking today below. Check that "Your office rule" matches your employer\'s.'));
    }

    function renderMarker() {
        $('sel-day').textContent = dayName(sel) + (state.workdays.includes(C.dow(sel)) ? '' : ', not a working day');
        $('to-today').hidden = sel === today;
        const cur = state.days[sel] || '';
        document.querySelectorAll('#marks .mk').forEach(b => {
            const on = b.dataset.m !== '' && b.dataset.m === cur;
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            if (b.dataset.m === '') b.disabled = !cur;
        });
    }

    function renderCal() {
        const g = C.monthGrid(state, view.y, view.m, today), cal = $('cal');
        $('m-name').textContent = C.MONTHS_LONG[view.m - 1] + ' ' + view.y;
        cal.textContent = '';
        const head = el('div', 'cal-row heads'); head.setAttribute('role', 'row');
        g.heads.forEach(h => { const c = el('span', 'h', h); c.setAttribute('role', 'columnheader'); head.appendChild(c); });
        cal.appendChild(head);
        for (let i = 0; i < g.cells.length; i += 7) {
            const row = el('div', 'cal-row'); row.setAttribute('role', 'row');
            g.cells.slice(i, i + 7).forEach(c => {
                if (!c) { const e = el('span', 'cell empty'); e.setAttribute('role', 'gridcell'); row.appendChild(e); return; }
                const b = el('button', 'cell' + (c.mark ? ' m-' + c.mark : '') + (c.work ? '' : ' off-day') + (c.today ? ' today' : '') + (c.d === sel ? ' sel' : '') + (c.before ? ' before' : ''));
                b.type = 'button'; b.dataset.d = c.d; b.setAttribute('role', 'gridcell');
                b.appendChild(el('span', 'n', String(c.n)));
                b.appendChild(el('span', 'k', c.mark ? C.MARKS[c.mark].short : ''));
                b.setAttribute('aria-label', C.shortDate(c.d, today) + (c.today ? ', today' : '') + ': ' + (c.mark ? C.MARKS[c.mark].label : c.work ? 'not marked' : 'not a working day'));
                if (c.d === sel) b.setAttribute('aria-current', 'date');
                row.appendChild(b);
            });
            cal.appendChild(row);
        }
        $('m-counts').textContent = C.monthCounts(state, view.y, view.m, today);
    }

    // ---------- marking ----------
    function setMark(m) {
        if (!m && !state.days[sel]) return;
        if (m && state.days[sel] === m) { show('mark-msg', dayName(sel) + ' is already marked ' + C.MARKS[m].label + '.'); return; }
        const before = snapshot();
        state = C.mark(state, sel, m);
        commit();
        const s = C.current(state, today);
        show('mark-msg', (m ? dayName(sel) + ': ' + C.MARKS[m].label + '.' : dayName(sel) + ': mark removed.') + ' ' + C.headline(s) + '.', before);
    }
    function pick(d) {
        if (!C.isDate(d)) return;
        sel = d; const p = C.parseDate(d); view = { y: p.y, m: p.m };
        clearMsg('mark-msg');
        renderMarker(); renderCal();
    }

    // ---------- the rule form ----------
    function fillRule() {
        const r = state.rule;
        document.querySelectorAll('input[name=type]').forEach(i => { i.checked = i.value === r.type; });
        document.querySelectorAll('input[name=offRule]').forEach(i => { i.checked = i.value === r.offRule; });
        $('r-n').value = String(r.n); $('r-pct').value = String(r.pct); $('r-period').value = r.period;
        $('r-ws').value = String(state.weekStart);
        $('r-start').value = state.start; showStart(!!state.start);
        ['e-n', 'e-pct', 'e-wd'].forEach(id => { $(id).textContent = ''; });
        $('r-n').removeAttribute('aria-invalid'); $('r-pct').removeAttribute('aria-invalid');
        drawWorkdays(); ruleParts();
    }
    function ruleParts() {
        const type = document.querySelector('input[name=type]:checked').value;
        $('w-n').hidden = type === 'pct'; $('w-pct').hidden = type !== 'pct';
        $('w-off').hidden = type === 'pct'; $('h-off-pct').hidden = type !== 'pct';
        $('l-n').textContent = type === 'month' ? 'Office days each month' : 'Office days each week';
        const q = $('quick-n'); q.textContent = '';
        (type === 'month' ? [4, 8, 10, 12] : [1, 2, 3, 4]).forEach(v => { const b = el('button', 'chip', String(v)); b.type = 'button'; b.dataset.v = v; b.setAttribute('aria-label', v + ' office days'); q.appendChild(b); });
    }
    function drawWorkdays() {
        const w = $('wd'); w.textContent = '';
        [1, 2, 3, 4, 5, 6, 0].forEach(d => {
            const l = el('label', 'wd-day'), i = el('input');
            i.type = 'checkbox'; i.value = d; i.checked = state.workdays.includes(d);
            l.append(i, el('span', null, C.DAYS[d]));
            w.appendChild(l);
        });
    }
    function applyRule(ev) {
        const f = { type: document.querySelector('input[name=type]:checked').value, n: $('r-n').value, pct: $('r-pct').value, period: $('r-period').value,
            offRule: document.querySelector('input[name=offRule]:checked').value };
        const r = C.readRule(f);
        // keep the other kind's last good number
        if (r.rule.type === 'pct') r.rule.n = state.rule.n; else r.rule.pct = state.rule.pct;
        $('e-n').textContent = r.errs.n || ''; $('e-pct').textContent = r.errs.pct || '';
        r.errs.n ? $('r-n').setAttribute('aria-invalid', 'true') : $('r-n').removeAttribute('aria-invalid');
        r.errs.pct ? $('r-pct').setAttribute('aria-invalid', 'true') : $('r-pct').removeAttribute('aria-invalid');
        const wd = [...document.querySelectorAll('#wd input:checked')].map(i => Number(i.value)).sort();
        $('e-wd').textContent = wd.length ? '' : 'Tick at least one working day.';
        if (!r.ok || !wd.length) return;
        // a week target cannot be more than 7; switching from month to week with 8 asks for a new number
        const before = snapshot();
        const next = Object.assign({}, state, { rule: r.rule, workdays: wd, weekStart: Number($('r-ws').value), start: C.isDate($('r-start').value) ? $('r-start').value : '' });
        if (JSON.stringify(next) === before) return;
        state = C.validate(next) || state;
        commit();
        if (ev && ev.type === 'change') show('rule-msg', 'Saved. ' + C.headline(C.current(state, today)) + '.', before);
    }
    function showStart(on) { $('w-start').hidden = !on; $('o-start').hidden = on; }

    // ---------- several days ----------
    function markRange() {
        const a = $('g-from').value, b = $('g-to').value, m = $('g-mark').value;
        let err = '';
        if (!C.isDate(a) || !C.isDate(b)) err = 'Choose both dates.';
        else if (b < a) err = '"To" is before "From".';
        else if (C.diff(a, b) > 365) err = 'Choose up to one year at a time.';
        $('e-range').textContent = err;
        if (err) return;
        const before = snapshot(), r = C.markRange(state, a, b, m);
        if (!r.n) { $('e-range').textContent = 'There are no working days between those dates.'; return; }
        state = r.st; commit();
        show('range-msg', (m ? 'Marked ' : 'Cleared ') + C.plural(r.n, 'working day') + (m ? ' as ' + C.MARKS[m].label : '') + ', ' + C.shortDate(a, today) + ' to ' + C.shortDate(b, today) + '.', before);
    }

    // ---------- wiring ----------
    function init() {
        state = load();
        fillRule();
        $('marks').addEventListener('click', e => { const b = e.target.closest('.mk'); if (b && !b.disabled) setMark(b.dataset.m); });
        $('cal').addEventListener('click', e => { const b = e.target.closest('button.cell'); if (b) pick(b.dataset.d); });
        $('day-prev').addEventListener('click', () => pick(C.addDays(sel, -1)));
        $('day-next').addEventListener('click', () => pick(C.addDays(sel, 1)));
        $('to-today').addEventListener('click', () => pick(today));
        const month = n => { let y = view.y, m = view.m + n; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } if (y < 1990 || y > 2200) return; view = { y, m }; renderCal(); };
        $('m-prev').addEventListener('click', () => month(-1));
        $('m-next').addEventListener('click', () => month(1));
        $('to-rule').addEventListener('click', () => { $('rule').scrollIntoView({ behavior: 'smooth', block: 'start' }); const i = document.querySelector('input[name=type]:checked'); if (i) i.focus({ preventScroll: true }); });

        const form = $('rule-form');
        form.addEventListener('submit', e => e.preventDefault());
        form.addEventListener('change', e => { if (e.target.name === 'type') ruleParts(); applyRule(e); });
        $('r-n').addEventListener('input', () => applyRule());
        $('r-pct').addEventListener('input', () => applyRule());
        $('quick-n').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $('r-n').value = b.dataset.v; applyRule({ type: 'change' }); });
        $('quick-pct').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $('r-pct').value = b.dataset.v; applyRule({ type: 'change' }); });
        $('o-start').addEventListener('click', () => { showStart(true); $('r-start').focus(); });
        $('clear-start').addEventListener('click', () => { $('r-start').value = ''; showStart(false); applyRule({ type: 'change' }); $('o-start').focus(); });

        $('g-go').addEventListener('click', markRange);
        $('g-from').addEventListener('change', () => { if (C.isDate($('g-from').value) && (!$('g-to').value || $('g-to').value < $('g-from').value)) $('g-to').value = C.addDays($('g-from').value, 4); });

        $('copy').addEventListener('click', () => copyText(C.summaryText(state, today)).then(ok => show('set-msg', ok ? 'Copied your summary.' : 'Could not copy. Try "Email my summary" instead.')));
        $('csv').addEventListener('click', () => {
            const n = Object.keys(state.days).length;
            if (!n) { show('set-msg', 'No days marked yet, so there is nothing to download.'); return; }
            download('office-days-' + today + '.csv', 'text/csv', C.csv(state, today));
            show('set-msg', 'Saved a CSV file with ' + C.plural(n, 'marked day') + '.');
        });
        $('print').addEventListener('click', () => window.print());
        $('backup').addEventListener('click', () => {
            download('office-days-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1));
            show('set-msg', 'Saved a backup file with ' + C.plural(Object.keys(state.days).length, 'marked day') + '.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => {
            const f = e.target.files && e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (f.size > 2e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            const r = new FileReader();
            r.onload = () => {
                let s = null; try { const j = JSON.parse(String(r.result)); s = j && j.days && j.rule ? C.validate(j) : null; } catch (err) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
                const before = snapshot(); state = s; fillRule(); commit();
                show('set-msg', 'Restored ' + C.plural(Object.keys(s.days).length, 'marked day') + '.', before);
            };
            r.onerror = () => show('set-msg', 'Could not read that file.');
            r.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            const before = snapshot(), empty = JSON.stringify(C.emptyState());
            if (before === empty) { show('set-msg', 'There is nothing to delete.'); return; }
            state = C.emptyState(); fillRule(); commit();
            show('set-msg', 'Deleted everything: all marked days and your rule.', before);
        });
        // a new day while the page stays open
        const tick = () => { const t = C.todayIso(); if (t !== today) { if (sel === today) sel = t; today = t; render(); } };
        setInterval(tick, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        if (!canSave) $('storage-warn').hidden = false;
        $('g-from').value = ''; $('g-to').value = '';
        render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
