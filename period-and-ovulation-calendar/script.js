// Period and Ovulation Calendar: the page. The date maths lives in core.js.
(function () {
    'use strict';
    const C = window.PeriodCore, KEY = 'period-and-ovulation-calendar.state';
    const $ = id => document.getElementById(id);
    let state = C.normalize(null), showAll = false, saveOK = true, undoSnap = null, toastTimer = 0;
    let today = C.localISO(new Date()), view = { y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 }, sel = today, a = null;

    // ---- saving
    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) state = C.normalize(JSON.parse(raw));
        } catch (e) { state = C.normalize(null); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); saveOK = true; } catch (e) { saveOK = false; }
        $('save-warn').hidden = saveOK;
    }
    function snapshot() { return JSON.stringify(state); }
    function toast(text, snap) {
        undoSnap = snap || null;
        $('toast-text').textContent = text;
        $('toast-undo').hidden = !snap;
        $('toast').hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { $('toast').hidden = true; undoSnap = null; }, snap ? 10000 : 5000);
    }
    $('toast-undo').addEventListener('click', () => {
        if (!undoSnap) return;
        state = C.normalize(JSON.parse(undoSnap)); undoSnap = null;
        save(); render(); toast('Undone.');
    });

    // ---- selects
    function fillSelect(el, lo, hi, word, special) {
        el.textContent = '';
        for (let n = lo; n <= hi; n++) {
            const o = document.createElement('option'); o.value = n;
            o.textContent = C.plural(n, word) + (special && special[n] ? ' ' + special[n] : '');
            el.appendChild(o);
        }
    }
    fillSelect($('s-cycle'), 15, 90, 'day', { 28: '(most common)' });
    fillSelect($('s-len'), 1, 15, 'day');
    fillSelect($('set-cycle'), 15, 90, 'day');
    fillSelect($('set-len'), 1, 15, 'day');
    $('s-cycle').value = 28; $('s-len').value = 5;

    // ---- logging a period
    function logStart(iso, errEl) {
        errEl.textContent = '';
        const chk = C.checkStart(state, iso, today);
        if (chk.error) { errEl.textContent = chk.error; return false; }
        const snap = snapshot(), last = state.periods[state.periods.length - 1];
        const afterPause = state.settings.paused && (!last || iso > last.start);
        state.periods.push({ start: iso, len: state.settings.len, skipGap: !!(afterPause && last) });
        state.periods.sort((x, y) => x.start < y.start ? -1 : 1);
        if (afterPause) state.settings.paused = false;
        save();
        sel = iso; view = { y: +iso.slice(0, 4), m: +iso.slice(5, 7) - 1 };
        render();
        toast('Period logged: started ' + C.fmt(iso, { day: true }) + '.' + (afterPause ? ' Predictions are back on; the gap before it is not counted.' : '') + (chk.warn ? ' ' + chk.warn : ''), snap);
        return true;
    }
    function deletePeriod(start) {
        const snap = snapshot();
        state.periods = state.periods.filter(p => p.start !== start);
        save(); render();
        toast('Deleted the period that started ' + C.fmt(start) + '.', snap);
    }

    // ---- top box
    function renderToday() {
        const big = $('t-big'), sub = $('t-sub'), flag = $('flag');
        $('t-date').textContent = 'Today, ' + C.fmt(today, { day: true });
        flag.hidden = true; flag.textContent = '';
        $('keys').hidden = false; $('basis').hidden = false;
        $('resume').hidden = true;
        $('started-today').hidden = false;
        $('today').className = 'card today s-' + a.status;
        if (a.status === 'future') {
            big.textContent = 'Check your dates';
            sub.textContent = 'Your last period is logged as starting ' + C.fmt(a.last, { day: true }) + ', which is after today. Delete it in Your periods if it was a mistake.';
            $('keys').hidden = true; $('basis').hidden = true; $('started-today').hidden = true;
            return;
        }
        const since = 'Your last period started ' + C.fmt(a.last, { day: true }) + '.';
        if (a.status === 'paused') {
            big.textContent = 'Predictions are paused';
            sub.textContent = 'Day ' + a.cycleDay + ' since your last period started (' + C.fmt(a.last, { day: true }) + '). When your period comes back, log it and predictions start again.';
            $('keys').hidden = true; $('basis').hidden = true; $('resume').hidden = false;
            $('started-today').hidden = a.last === today;
            return;
        }
        if (a.status === 'period') {
            big.textContent = 'Period day ' + a.onPeriod;
            sub.textContent = 'Started ' + C.fmt(a.last, { day: true }) + (a.last === today ? ' (today)' : '') + '. You logged it as lasting about ' + C.plural(a.lastLen, 'day') + '.';
            $('started-today').hidden = true;
        } else if (a.status === 'late') {
            big.textContent = 'Period is ' + C.plural(a.late, 'day') + ' late';
            sub.textContent = 'Day ' + a.cycleDay + ' of your cycle. It was expected ' + C.fmt(a.expected, { day: true }) + '.' + (!a.pastLatest ? ' That is still within your usual range (up to ' + C.fmt(a.latest, { day: true, year: false }) + ').' : '');
            flag.hidden = false;
            flag.textContent = a.longGap
                ? 'No period logged for ' + a.sinceDays + ' days. If you missed logging one, add it under Your periods. If you could be pregnant, a home pregnancy test is reliable now.'
                : 'If you could be pregnant, a home pregnancy test is reliable from the day your period was due. Stress, illness and travel can also make a period late.';
        } else {
            big.textContent = a.daysToExpected === 0 ? 'Period expected today' : 'Period expected in ' + C.plural(a.daysToExpected, 'day');
            sub.textContent = 'Day ' + a.cycleDay + ' of your cycle. ' + since;
        }
        // next period
        if (a.status === 'late') {
            $('k-next').textContent = 'Any day now';
            $('k-next-sub').textContent = 'was expected ' + C.fmt(a.expected, { day: true, year: false });
        } else {
            $('k-next').textContent = C.fmt(a.expected, { day: true });
            $('k-next-sub').textContent = a.hasRange ? 'usually ' + C.fmtRange(a.earliest, a.latest) : 'lasting about ' + C.plural(a.avgLen, 'day');
        }
        // fertile days: this cycle's, or the next one when this one has passed
        const w = a.fertileWhen === 'passed' ? a.windows[1] : a.windows[0];
        $('k-fert').textContent = C.fmtRange(w.start, w.end);
        $('k-fert-sub').textContent = (a.fertileWhen === 'now' ? 'now, ' : a.fertileWhen === 'passed' ? 'next cycle, ' : '') + 'ovulation around ' + C.fmt(w.ovulation, { day: true, year: false });
        $('basis').textContent = a.fromTyped
            ? 'Based on the cycle length you typed (' + a.avg + ' days). Once you log your next period, the app uses your own cycles.'
            : 'Based on your last ' + C.plural(a.countedCycles, 'cycle') + ', ' + (a.countedCycles > 1 ? 'average ' : '') + a.avg + ' days.' + (a.irregular ? ' Your cycles vary by more than a week, so the dates are a wide guess.' : '');
    }

    // ---- calendar
    function dayLabel(iso, m) {
        const bits = [C.fmt(iso, { day: true })];
        if (m.today) bits.push('today');
        if (m.logged) bits.push('period day ' + m.logged);
        if (m.predicted) bits.push('expected period');
        if (m.ovulation) bits.push('likely ovulation');
        else if (m.fertile) bits.push('likely fertile');
        if (m.notes) bits.push('has notes');
        return bits.join(', ');
    }
    function renderCal() {
        $('cal-h').textContent = C.MONTHS_LONG[view.m] + ' ' + view.y;
        const ws = state.settings.weekStart, wk = $('wk'); wk.textContent = '';
        for (let i = 0; i < 7; i++) { const s = document.createElement('span'); s.textContent = C.DAYS[(ws + i) % 7].slice(0, 2); wk.appendChild(s); }
        const grid = $('grid'); grid.textContent = '';
        const days = C.monthGrid(view.y, view.m, ws);
        if (!days.includes(sel)) sel = days.find(d => +d.slice(5, 7) === view.m + 1 && d.endsWith(sel.slice(7))) || days.find(d => +d.slice(5, 7) === view.m + 1);
        days.forEach(iso => {
            const m = C.mark(state, a, iso), b = document.createElement('button');
            b.type = 'button'; b.dataset.d = iso;
            b.className = 'dc' + (m.logged ? ' logged' : '') + (m.start ? ' start' : '') + (m.predicted ? ' predicted' : '') + (m.fertile ? ' fertile' : '') + (m.ovulation ? ' ovu' : '') +
                (m.today ? ' is-today' : '') + (+iso.slice(5, 7) !== view.m + 1 ? ' out' : '') + (iso === sel ? ' sel' : '');
            b.tabIndex = iso === sel ? 0 : -1;
            b.setAttribute('aria-label', dayLabel(iso, m));
            b.setAttribute('aria-pressed', iso === sel ? 'true' : 'false');
            if (m.today) b.setAttribute('aria-current', 'date');
            const n = document.createElement('span'); n.textContent = +iso.slice(8); b.appendChild(n);
            if (m.notes) { const dot = document.createElement('i'); dot.className = 'nd'; b.appendChild(dot); }
            grid.appendChild(b);
        });
        $('go-today').hidden = sel === today && view.y === +today.slice(0, 4) && view.m === +today.slice(5, 7) - 1;
        renderDay();
    }
    function renderDay() {
        const m = C.mark(state, a, sel);
        $('day-h').textContent = C.fmt(sel, { day: true }) + (sel === today ? ' (today)' : '');
        let what = '';
        if (m.future) what = 'This day is in the future. ';
        if (m.logged) what += 'Period day ' + m.logged + (m.logged > 1 ? ' (started ' + C.fmt(m.periodStart, { year: false }) + ')' : '') + '.';
        else if (m.predicted) what += 'Your period is expected.';
        else if (m.ovulation) what += 'Likely ovulation day (fertile).';
        else if (m.fertile) what += 'Likely fertile day.';
        $('day-what').textContent = what.trim();
        $('day-start').hidden = !!m.logged || m.future;
        $('day-del').hidden = !m.logged;
        $('day-del').dataset.start = m.periodStart || '';
        $('day-err').textContent = '';
        $('day-notes').hidden = m.future;
        const d = state.days[sel] || { s: [], n: '' }, chips = $('chips'); chips.textContent = '';
        C.SYMPTOMS.forEach(([k, label]) => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.k = k; b.textContent = label;
            b.setAttribute('aria-pressed', d.s.includes(k) ? 'true' : 'false'); chips.appendChild(b);
        });
        if (document.activeElement !== $('day-note')) $('day-note').value = d.n;
    }
    function setDayData(fn) {
        const d = state.days[sel] ? { s: state.days[sel].s.slice(), n: state.days[sel].n } : { s: [], n: '' };
        fn(d);
        if (d.s.length || d.n.trim()) state.days[sel] = d; else delete state.days[sel];
        save();
    }
    function select(iso, focus) {
        sel = iso;
        const y = +iso.slice(0, 4), mo = +iso.slice(5, 7) - 1;
        if (y !== view.y || mo !== view.m) { view = { y, m: mo }; renderCal(); }
        else {
            document.querySelectorAll('#grid .dc').forEach(b => { const on = b.dataset.d === iso; b.classList.toggle('sel', on); b.tabIndex = on ? 0 : -1; b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
            renderDay();
            $('go-today').hidden = sel === today;
        }
        if (focus) { const b = document.querySelector('#grid .dc[data-d="' + iso + '"]'); if (b) b.focus(); }
    }
    $('grid').addEventListener('click', e => { const b = e.target.closest('.dc'); if (b) select(b.dataset.d); });
    $('grid').addEventListener('keydown', e => {
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
        if (step) { e.preventDefault(); select(C.addDays(sel, step), true); }
    });
    function moveMonth(k) {
        let m = view.m + k, y = view.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
        if (y < 1950 || y > 2200) return;
        view = { y, m }; renderCal();
    }
    $('prev').addEventListener('click', () => moveMonth(-1));
    $('next').addEventListener('click', () => moveMonth(1));
    $('go-today').addEventListener('click', () => { view = { y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 }; sel = today; renderCal(); });
    $('chips').addEventListener('click', e => {
        const b = e.target.closest('.chip'); if (!b) return;
        const on = b.getAttribute('aria-pressed') !== 'true';
        setDayData(d => { d.s = on ? d.s.concat(b.dataset.k) : d.s.filter(x => x !== b.dataset.k); });
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        refreshMarks();
    });
    $('day-note').addEventListener('input', () => { setDayData(d => { d.n = $('day-note').value.slice(0, 300); }); refreshMarks(); });
    function refreshMarks() {
        // only the notes dot and labels change; keeps focus where it is
        document.querySelectorAll('#grid .dc').forEach(b => {
            const m = C.mark(state, a, b.dataset.d), dot = b.querySelector('.nd');
            if (m.notes && !dot) { const i = document.createElement('i'); i.className = 'nd'; b.appendChild(i); }
            if (!m.notes && dot) dot.remove();
            b.setAttribute('aria-label', dayLabel(b.dataset.d, m));
        });
        renderSide();
    }
    $('day-start').addEventListener('click', () => logStart(sel, $('day-err')));
    $('day-del').addEventListener('click', () => { if ($('day-del').dataset.start) deletePeriod($('day-del').dataset.start); });

    // ---- your periods
    function renderSide() {
        $('hist-n').textContent = '(' + state.periods.length + ')';
        $('st-avg').textContent = a.fromTyped ? a.avg + ' days (typed)' : a.avg + ' days';
        $('st-range').textContent = a.countedCycles ? (a.min === a.max ? a.min + ' days' : a.min + ' to ' + a.max + ' days') : 'log 2 periods';
        $('st-len').textContent = C.plural(a.avgLen, 'day');
        const notes = [];
        if (a.flags.length) notes.push(C.plural(a.flags.length, 'recent cycle') + ' shorter than 21 or longer than 35 days (marked below). If this happens often, mention it to a doctor.');
        if (a.irregular) notes.push('Your cycles vary by more than a week, so the expected dates are a wide range.');
        $('st-note').hidden = !notes.length; $('st-note').textContent = notes.join(' ');
        const ul = $('plist'); ul.textContent = '';
        const all = a.list.slice().reverse(), SHOW = 6;
        $('more').hidden = all.length <= SHOW;
        $('more').textContent = showAll ? 'Show only the latest ' + SHOW : 'Show all ' + all.length + ' periods';
        all.forEach((r, i, arr) => {
            if (i >= SHOW && !showAll) return;
            const li = document.createElement('li'); li.className = 'pbox' + (r.flag === 'short' || r.flag === 'long' ? ' flagged' : '');
            const h = document.createElement('h3'); h.textContent = 'Started ' + C.fmt(r.start, { day: true }); li.appendChild(h);
            const p = document.createElement('p'); p.className = 'pcyc';
            if (r.cycle == null) p.textContent = 'First period logged';
            else {
                p.textContent = r.cycle + ' days after the one before';
                const tag = { short: 'short cycle', long: 'long cycle', gap: 'not counted: 90 days or more', skipped: 'not counted' }[r.flag];
                if (tag) { const t = document.createElement('span'); t.className = 'ptag ' + r.flag; t.textContent = tag; p.appendChild(t); }
            }
            li.appendChild(p);
            const row = document.createElement('div'); row.className = 'prow';
            const lab = document.createElement('label'); lab.textContent = 'Lasted'; const sid = 'len-' + r.start; lab.htmlFor = sid;
            const s = document.createElement('select'); s.id = sid; s.dataset.start = r.start; s.className = 'plen';
            for (let n = 1; n <= 15; n++) { const o = document.createElement('option'); o.value = n; o.textContent = C.plural(n, 'day'); s.appendChild(o); }
            s.value = r.len;
            const del = document.createElement('button'); del.type = 'button'; del.className = 'mini del'; del.textContent = 'Delete'; del.dataset.start = r.start;
            del.setAttribute('aria-label', 'Delete the period that started ' + C.fmt(r.start));
            row.append(lab, s, del); li.appendChild(row);
            if (i < arr.length - 1) {
                const c = document.createElement('label'); c.className = 'check small';
                const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'pskip'; cb.dataset.start = r.start; cb.checked = r.skipGap;
                c.append(cb, document.createTextNode(" Don't count the gap before this period (missed a log, pregnancy or hormones)"));
                li.appendChild(c);
            }
            ul.appendChild(li);
        });
    }
    $('plist').addEventListener('change', e => {
        const t = e.target, p = state.periods.find(x => x.start === t.dataset.start); if (!p) return;
        if (t.classList.contains('plen')) p.len = +t.value;
        if (t.classList.contains('pskip')) p.skipGap = t.checked;
        save(); render();
        const again = document.getElementById(t.id) || document.querySelector('.pskip[data-start="' + p.start + '"]'); if (again) again.focus();
    });
    $('more').addEventListener('click', () => { showAll = !showAll; renderSide(); });
    $('plist').addEventListener('click', e => { const b = e.target.closest('.del'); if (b) deletePeriod(b.dataset.start); });
    $('add-form').addEventListener('submit', e => {
        e.preventDefault();
        if (logStart($('add-date').value, $('add-err'))) $('add-date').value = '';
    });

    // ---- start
    $('setup-form').addEventListener('submit', e => {
        e.preventDefault();
        if (!$('s-start').value) { $('setup-err').textContent = 'Pick the day your last period started.'; $('s-start').focus(); return; }
        const snap = snapshot();
        state.settings.cycle = +$('s-cycle').value; state.settings.len = +$('s-len').value;
        if (logStart($('s-start').value, $('setup-err'))) { toast('Your calendar is ready. Log each new period on the day it starts.', snap); $('t-big').focus(); }
    });
    $('demo').addEventListener('click', () => {
        const snap = snapshot(), gaps = [28, 30, 27, 29, 28], lens = [5, 6, 5, 4, 5, 5];
        let s = C.addDays(today, -15); const starts = [s];
        gaps.forEach(g => { s = C.addDays(s, -g); starts.unshift(s); });
        state = C.normalize({ periods: starts.map((x, i) => ({ start: x, len: lens[i] })), days: {
            [starts[5]]: { s: ['cramps', 'heavy', 'tired'], n: 'Took a painkiller in the morning' },
            [C.addDays(starts[5], 1)]: { s: ['cramps'], n: '' },
            [C.addDays(starts[5], 13)]: { s: ['discharge'], n: '' } }, settings: state.settings });
        save(); sel = today; view = { y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 }; render();
        toast('Example loaded. "Delete everything" at the bottom clears it.', snap);
    });
    $('started-today').addEventListener('click', () => logStart(today, $('day-err')) || toast($('day-err').textContent));
    $('resume').addEventListener('click', () => { state.settings.paused = false; save(); render(); });

    // ---- tools
    function download(name, type, text) {
        const url = URL.createObjectURL(new Blob([text], { type })), l = document.createElement('a');
        l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    const tmsg = t => { $('tools-msg').textContent = t; };
    $('ics').addEventListener('click', () => {
        if (!a.next) { tmsg('Predictions are paused, so there are no expected periods to add.'); return; }
        const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
        download('expected-periods.ics', 'text/calendar', C.ics(a, state.settings.icsFertile, stamp));
        tmsg('Calendar file downloaded. Open it to add ' + (state.settings.icsFertile ? 'the next 3 periods and fertile windows' : 'the next 3 periods') + ' to your calendar. Download it again after your next period to update the dates.');
    });
    $('ics-fertile').addEventListener('change', e => { state.settings.icsFertile = e.target.checked; save(); });
    $('copy').addEventListener('click', () => {
        const text = C.summary(state, a);
        const done = () => tmsg('Summary copied. Paste it into a message or note.');
        const fallback = () => { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { tmsg('Could not copy. Use Email summary or Print instead.'); } t.remove(); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    });
    $('print').addEventListener('click', () => {
        let pre = $('print-area'); if (!pre) { pre = document.createElement('pre'); pre.id = 'print-area'; document.body.appendChild(pre); }
        pre.textContent = C.summary(state, a); window.print();
    });
    $('export').addEventListener('click', () => {
        download('period-calendar-backup-' + today + '.json', 'application/json', JSON.stringify(Object.assign({ app: 'period-and-ovulation-calendar', saved: today }, state), null, 1));
        tmsg('Backup file saved. Keep it somewhere safe; it holds your periods and notes.');
    });
    $('import').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', e => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        if (f.size > 5e6) { tmsg('That file is too big to be a backup from this app.'); return; }
        const r = new FileReader();
        r.onload = () => {
            let data; try { data = JSON.parse(r.result); } catch (err) { tmsg('That file is not a backup from this app.'); return; }
            if (!data || !Array.isArray(data.periods)) { tmsg('That file is not a backup from this app.'); return; }
            const n = C.normalize(data);
            if (!n.periods.length && !Object.keys(n.days).length) { tmsg('That backup has no periods in it.'); return; }
            const snap = snapshot(); state = n; save(); sel = today; view = { y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 }; render(); tmsg('');
            toast('Backup loaded: ' + C.plural(n.periods.length, 'period') + '.', snap);
        };
        r.onerror = () => tmsg('Could not read that file.');
        r.readAsText(f);
    });
    $('wipe').addEventListener('click', () => {
        const snap = snapshot(); state = C.normalize(null); save(); sel = today; render(); tmsg('');
        toast('Everything deleted.', snap);
    });
    $('paused').addEventListener('change', e => { state.settings.paused = e.target.checked; save(); render(); });
    $('set-cycle').addEventListener('change', e => { state.settings.cycle = +e.target.value; save(); render(); });
    $('set-len').addEventListener('change', e => { state.settings.len = +e.target.value; save(); render(); });
    $('set-week').addEventListener('change', e => { state.settings.weekStart = +e.target.value; save(); render(); });

    // ---- everything
    function render() {
        a = C.analyse(state, today);
        const has = state.periods.length > 0;
        $('setup').hidden = has;
        ['today', 'cal', 'hist', 'tools-data'].forEach(id => { $(id).hidden = !has; });
        $('wipe').hidden = !has && !Object.keys(state.days).length;
        $('paused').checked = state.settings.paused;
        $('set-cycle').value = state.settings.cycle; $('set-len').value = state.settings.len; $('set-week').value = state.settings.weekStart;
        $('ics-fertile').checked = state.settings.icsFertile;
        $('ics').disabled = !a.next;
        if (!has) { $('s-start').max = today; return; }
        $('add-date').max = today;
        renderToday(); renderCal(); renderSide();
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('My period summary') + '&body=' + encodeURIComponent(C.summary(state, a));
    }
    // a new day while the page is open
    function checkDay() {
        const t = C.localISO(new Date()); if (t === today) return;
        if (sel === today) sel = t;
        today = t; render();
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
    setInterval(checkDay, 60000);

    load();
    try { localStorage.setItem(KEY + '.test', '1'); localStorage.removeItem(KEY + '.test'); } catch (e) { saveOK = false; }
    $('save-warn').hidden = saveOK;
    render();

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
