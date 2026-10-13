// Home Blood Pressure Log: the page. The maths and checks live in core.js.
(function () {
    const C = window.BPCore;
    const KEY = 'home-blood-pressure-log.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const URL_APP = 'https://umar8092.github.io/apps/home-blood-pressure-log/';

    // ---------- saved state
    const defaultGuide = /-US\b/i.test(navigator.language || '') ? 'aha' : 'nice';
    let storageOk = true, state = load();
    function fresh() { const p = C.newPerson('', defaultGuide); return { people: [p], current: p.id, period: '7', from: '', to: '', skipFirst: false, pulseOpen: false, arm: '' }; }
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; }
        if (!raw) return fresh();
        try {
            const data = JSON.parse(raw), s = C.clean(data, defaultGuide);
            if (!s) return fresh();
            s.pulseOpen = data.pulseOpen === true; s.arm = data.arm === 'L' || data.arm === 'R' ? data.arm : '';
            return s;
        } catch (e) { return fresh(); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; }
        catch (e) { storageOk = false; }
    }
    const person = () => state.people.find(p => p.id === state.current) || state.people[0];
    const snapshot = () => JSON.stringify(state);
    function restoreSnapshot(snap) {
        const data = JSON.parse(snap), s = C.clean(data, defaultGuide);
        if (s) { s.pulseOpen = data.pulseOpen === true; s.arm = data.arm || ''; state = s; save(); }
        renderAll();
    }

    // ---------- dates and words
    const nowStamp = () => C.stamp(new Date());
    const today = () => nowStamp().slice(0, 10);
    const toDate = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); };
    function fmtDay(d, year) {
        try { return toDate(d).toLocaleDateString(undefined, year ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' }); }
        catch (e) { return d; }
    }
    function fmtTime(t) {
        const [h, m] = t.slice(11).split(':').map(Number);
        // 24-hour clocks show 07:10 and 00:30, not 7:10 and 0:30
        try { return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(/^(\d):(\d\d)$/, '0$1:$2'); } catch (e) { return t.slice(11); }
    }
    // time and, when it was after midnight, the calendar date too
    function fmtWhen(t, withDay) {
        const day = t.slice(0, 10), shifted = C.logDay(t) !== day;
        return (withDay || shifted ? fmtDay(day) + ', ' : '') + fmtTime(t);
    }
    const bp = r => r.sys + '/' + r.dia;
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    const name = p => p.name || ('Person ' + (state.people.indexOf(p) + 1));

    function period() {
        const t = today();
        if (state.period === 'all') return { from: null, to: null };
        if (state.period === 'dates') {
            let f = state.from || C.addDays(t, -6), to = state.to || t;
            if (f > to) [f, to] = [to, f];
            return { from: f, to };
        }
        return { from: C.addDays(t, -(Number(state.period) - 1)), to: t };
    }
    function currentSummary() {
        const p = person(), per = period();
        return { p, per, s: C.summary(p.readings, { from: per.from, to: per.to, skipFirst: state.skipFirst, guide: p.guide, target: p.target }),
            list: C.inPeriod(p.readings, per.from, per.to) };
    }
    function periodText(s, per) {
        if (!s.n) return per.from ? fmtDay(per.from, per.from.slice(0, 4) !== per.to.slice(0, 4)) + ' to ' + fmtDay(per.to, true) : 'all readings';
        return s.first === s.last ? fmtDay(s.first, true) : fmtDay(s.first, s.first.slice(0, 4) !== s.last.slice(0, 4)) + ' to ' + fmtDay(s.last, true);
    }

    // ---------- messages with Undo
    function say(box, text, opt) {
        const o = opt || {};
        box.textContent = ''; box.className = 'msg show' + (o.kind ? ' ' + o.kind : '');
        const p = el('p', null, text); box.appendChild(p);
        if (o.extra) box.appendChild(el('p', 'msg-extra', o.extra));
        if (o.undo) {
            const b = el('button', 'link inline undo', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { restoreSnapshot(o.undo); say(box, o.undoText || 'Undone.'); if (o.afterUndo) o.afterUndo(); });
            p.appendChild(document.createTextNode(' ')); p.appendChild(b);
        }
    }
    const clearMsg = box => { box.textContent = ''; box.className = 'msg'; };

    // ---------- add a reading
    const f = { sys: $('sys'), dia: $('dia'), pulse: $('pulse'), when: $('when'), arm: $('arm'), note: $('note') };
    function setErr(id, text) { const e = $(id + '-err'); if (e) e.textContent = text || ''; const i = f[id]; if (i) i.setAttribute('aria-invalid', text ? 'true' : 'false'); }
    // "128/82" or "128/82/70" typed or pasted into the top box is split into the boxes;
    // "82/70" in the bottom box (someone carrying on typing after the split) gives the bottom number and the pulse
    function splitInto(input) {
        const v = input.value.trim();
        if (input === f.dia) {
            const m = v.match(/^(\d{2,3})\s*[\/\\,;: ]\s*(\d{2,3})$/);
            if (m) { f.dia.value = m[1]; f.pulse.value = m[2]; openPulse(); f.pulse.focus(); }
            return;
        }
        const s = C.splitPasted(v);
        if (!s) return;
        f.sys.value = s.sys; f.dia.value = s.dia;
        if (s.pulse) { f.pulse.value = s.pulse; openPulse(); }
        (s.pulse ? f.pulse : f.dia).focus();
    }
    [f.sys, f.dia, f.pulse].forEach(i => {
        i.addEventListener('input', () => { if (i !== f.pulse && /[\/\s,;:\\-]/.test(i.value.trim())) splitInto(i); setErr(i.id, ''); $('swap').hidden = true; });
        i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveReading(); } });
    });
    f.note.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveReading(); } });
    $('swap').addEventListener('click', () => { const a = f.sys.value; f.sys.value = f.dia.value; f.dia.value = a; setErr('sys'); setErr('dia'); $('swap').hidden = true; f.sys.focus(); });
    function openPulse() { $('pulse-box').hidden = false; $('pulse-open').hidden = true; if (!state.pulseOpen) { state.pulseOpen = true; save(); } }
    $('pulse-open').addEventListener('click', () => { openPulse(); f.pulse.focus(); });
    $('when-open').addEventListener('click', () => {
        $('when-box').hidden = false; $('when-open').hidden = true; $('when-text').textContent = 'the time below';
        if (!f.when.value) f.when.value = nowStamp();
        f.when.max = nowStamp(); f.when.focus();
    });
    $('when-now').addEventListener('click', closeWhen);
    function closeWhen() { $('when-box').hidden = true; $('when-open').hidden = false; f.when.value = ''; $('when-text').textContent = 'now'; setErr('when'); }
    $('more-open').addEventListener('click', () => { $('more-box').hidden = false; $('more-open').hidden = true; f.arm.focus(); });
    f.arm.addEventListener('change', () => { state.arm = f.arm.value; save(); });

    function whenValue(input, errId) {
        if (!input.value) return { t: nowStamp() };
        const t = input.value.slice(0, 16);
        if (!C.validStamp(t)) { setErr(errId, 'Choose a date and time, or tap "Use the time now".'); return null; }
        if (t > nowStamp()) { setErr(errId, 'That time is in the future. Choose the time the reading was taken.'); return null; }
        return { t };
    }
    function saveReading() {
        const box = $('add-msg');
        ['sys', 'dia', 'pulse', 'when'].forEach(k => setErr(k));
        $('swap').hidden = true;
        const chk = C.checkReading(f.sys.value, f.dia.value, $('pulse-box').hidden ? '' : f.pulse.value);
        const w = $('when-box').hidden ? { t: nowStamp() } : whenValue(f.when, 'when');
        if (chk.errors) {
            Object.keys(chk.errors).forEach(k => setErr(k, chk.errors[k]));
            if (chk.swap) $('swap').hidden = false;
            clearMsg(box);
            f[Object.keys(chk.errors)[0]].focus();
            return;
        }
        if (!w) { f.when.focus(); return; }
        const p = person(), snap = snapshot();
        const r = { id: C.newId(), t: w.t, sys: chk.reading.sys, dia: chk.reading.dia, pulse: chk.reading.pulse, arm: $('more-box').hidden ? state.arm : f.arm.value, note: f.note.value.trim().slice(0, C.NOTE_MAX) };
        const dup = p.readings.some(x => x.t === r.t && x.sys === r.sys && x.dia === r.dia);
        p.readings = C.sortReadings(p.readings.concat(r));
        save();
        f.sys.value = ''; f.dia.value = ''; f.pulse.value = ''; f.note.value = '';
        if (!$('when-box').hidden) closeWhen();
        const lv = C.level(r.sys, r.dia, p.guide);
        const per = period(), d = C.logDay(r.t), outside = (per.from && d < per.from) || (per.to && d > per.to);
        let extra = C.advice(lv);
        if (dup) extra = (extra ? extra + ' ' : '') + 'You already had the same reading at this time; delete one if it was a double tap.';
        if (outside) extra = (extra ? extra + ' ' : '') + 'This day is outside the days chosen under Your average.';
        if (!storageOk) extra = (extra ? extra + ' ' : '') + 'This browser is not letting the app save, so readings will be lost when the page is closed.';
        renderAll();
        say(box, 'Saved ' + bp(r) + (r.pulse ? ', pulse ' + r.pulse : '') + ' at ' + fmtWhen(r.t, r.t.slice(0, 10) !== today()) + ': ' + C.levelText(lv, p.guide) + '.',
            { undo: snap, undoText: 'Reading removed.', kind: lv === 'severe' ? 'bad' : '', extra });
        f.sys.focus();
    }
    $('save').addEventListener('click', saveReading);

    // ---------- people
    function renderPeople() {
        const nav = $('people'); nav.textContent = '';
        nav.hidden = state.people.length < 2;
        state.people.forEach(p => {
            const b = el('button', 'person', name(p)); b.type = 'button';
            b.setAttribute('aria-pressed', String(p.id === state.current));
            b.addEventListener('click', () => { state.current = p.id; save(); renderAll(); ['add-msg', 'set-msg', 'list-msg', 'share-msg'].forEach(id => clearMsg($(id))); });
            nav.appendChild(b);
        });
    }
    $('person-add').addEventListener('click', () => {
        if (state.people.length >= C.MAX_PEOPLE) { say($('set-msg'), 'You can keep up to ' + C.MAX_PEOPLE + ' people.'); return; }
        const snap = snapshot(), p = C.newPerson('', person().guide);
        state.people.push(p); state.current = p.id; save(); renderAll();
        say($('set-msg'), 'Added ' + name(p) + '. Type their name above; their readings are kept apart.', { undo: snap, undoText: 'Person removed.' });
        $('name').focus();
    });
    $('person-remove').addEventListener('click', () => {
        if (state.people.length < 2) return;
        const snap = snapshot(), p = person();
        state.people = state.people.filter(x => x !== p); state.current = state.people[0].id; save(); renderAll();
        say($('set-msg'), 'Removed ' + name(p) + ' and ' + plural(p.readings.length, 'reading') + '.', { undo: snap, undoText: name(p) + ' is back.' });
    });

    // ---------- settings
    $('name').addEventListener('input', () => { person().name = $('name').value.trim().slice(0, C.NAME_MAX); save(); renderPeople(); renderShare(); renderSettingsLabels(); });
    $('guide').addEventListener('change', () => { person().guide = $('guide').value === 'aha' ? 'aha' : 'nice'; save(); renderAll(); });
    $('target-open').addEventListener('click', () => { $('target-box').hidden = false; $('target-open').hidden = true; $('t-sys').focus(); });
    function readTarget() {
        const a = $('t-sys').value.trim(), b = $('t-dia').value.trim();
        $('t-err').textContent = '';
        if (!a && !b) { person().target = null; save(); renderSummary(); renderShare(); return; }
        if (!a || !b) { $('t-err').textContent = 'Type both numbers, for example 140 and 90.'; return; }
        const t = C.cleanTarget({ sys: /^\d+$/.test(a) ? +a : NaN, dia: /^\d+$/.test(b) ? +b : NaN });
        if (!t) { $('t-err').textContent = 'Use whole numbers, with the top bigger than the bottom (for example 140 and 90).'; return; }
        person().target = t; save(); renderSummary(); renderShare();
    }
    ['t-sys', 't-dia'].forEach(id => $(id).addEventListener('input', readTarget));
    $('target-remove').addEventListener('click', () => { $('t-sys').value = ''; $('t-dia').value = ''; readTarget(); $('target-box').hidden = true; $('target-open').hidden = false; $('target-open').focus(); });
    function renderSettings() {
        const p = person();
        if (document.activeElement !== $('name')) $('name').value = p.name;
        $('guide').value = p.guide;
        $('t-err').textContent = '';
        if (p.target) { $('t-sys').value = p.target.sys; $('t-dia').value = p.target.dia; $('target-box').hidden = false; $('target-open').hidden = true; }
        else { $('t-sys').value = ''; $('t-dia').value = ''; $('target-box').hidden = true; $('target-open').hidden = false; }
        renderSettingsLabels();
    }
    function renderSettingsLabels() {
        const p = person();
        $('person-remove').hidden = state.people.length < 2;
        $('person-remove').textContent = 'Remove ' + name(p);
        $('wipe').textContent = state.people.length < 2 ? 'Delete all readings' : 'Delete all of ' + name(p) + "'s readings";
        $('wipe').disabled = !p.readings.length;
    }
    $('wipe').addEventListener('click', () => {
        const p = person(); if (!p.readings.length) return;
        const snap = snapshot(), n = p.readings.length;
        p.readings = []; save(); renderAll();
        say($('set-msg'), 'Deleted ' + plural(n, 'reading') + '.', { undo: snap, undoText: 'Readings are back.' });
    });

    // backup and restore
    function download(name, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    $('backup').addEventListener('click', () => {
        download('blood-pressure-backup-' + today() + '.json', JSON.stringify({ app: 'home-blood-pressure-log', saved: nowStamp(), ...state }, null, 1), 'application/json');
        const n = state.people.reduce((a, p) => a + p.readings.length, 0);
        say($('set-msg'), 'Backup saved with ' + plural(n, 'reading') + '. Keep the file somewhere safe.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const file = $('restore-file').files[0]; $('restore-file').value = '';
        if (!file) return;
        if (file.size > 10e6) { say($('set-msg'), 'That file is too big to be a backup from this app.', { kind: 'bad' }); return; }
        file.text().then(text => {
            let data = null; try { data = C.clean(JSON.parse(text), defaultGuide); } catch (e) { data = null; }
            if (!data) { say($('set-msg'), 'That file is not a backup from this app, so nothing was changed.', { kind: 'bad' }); return; }
            const snap = snapshot();
            data.pulseOpen = state.pulseOpen; data.arm = state.arm; state = data; save(); renderAll();
            const n = state.people.reduce((a, p) => a + p.readings.length, 0);
            say($('set-msg'), 'Backup restored: ' + plural(state.people.length, 'person').replace('persons', 'people') + ', ' + plural(n, 'reading') + '.', { undo: snap, undoText: 'Back to how it was before the restore.' });
        }).catch(() => say($('set-msg'), 'That file could not be read.', { kind: 'bad' }));
    });

    // ---------- period
    $('period').addEventListener('change', () => {
        state.period = $('period').value;
        if (state.period === 'dates' && !state.from) { state.from = C.addDays(today(), -6); state.to = today(); }
        save(); renderAll();
    });
    $('skip').addEventListener('change', () => { state.skipFirst = $('skip').checked; save(); renderAll(); });
    ['from', 'to'].forEach(id => $(id).addEventListener('change', () => {
        const v = $(id).value;
        $('dates-err').textContent = '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { $('dates-err').textContent = 'Choose a date.'; return; }
        state[id] = v;
        if (state.from && state.to && state.from > state.to) { [state.from, state.to] = [state.to, state.from]; $('dates-err').textContent = 'From was after To, so the two dates were swapped.'; }
        save(); renderAll();
    }));

    // ---------- summary
    function renderSummary() {
        const { p, per, s, list } = currentSummary();
        $('period').value = state.period;
        $('skip').checked = state.skipFirst;
        $('dates-box').hidden = state.period !== 'dates';
        if (state.period === 'dates') { $('from').value = per.from; $('to').value = per.to; }
        const has = s.n > 0;
        $('sum-empty').hidden = has; $('sum-body').hidden = !has;
        if (!has) {
            $('sum-empty-text').textContent = !p.readings.length
                ? 'Add a reading above. Most doctors ask for 2 readings a minute apart, morning and evening, for a week.'
                : list.length ? 'The only day with readings was left out (the first day). Add more days, or untick "Leave out the first day".'
                    : 'No readings in these days. Choose more days under "Readings from".';
            return;
        }
        $('avg').textContent = bp(s.avg);
        const lv = $('avg-lvl'); lv.textContent = C.levelText(s.level, p.guide); lv.dataset.level = s.level;
        $('avg-meta').textContent = 'Average of ' + plural(s.n, 'reading') + ' over ' + plural(s.days, 'day') + ', ' + periodText(s, per) + '.' + (s.avg.pulse ? ' Average pulse ' + s.avg.pulse + '.' : '');
        const tl = $('target-line');
        if (s.target) {
            tl.hidden = false; tl.className = 'target ' + (s.target.met ? 'ok' : 'no');
            tl.textContent = s.target.met ? 'Under your doctor\'s target of ' + bp(p.target) + '.'
                : 'Not under your doctor\'s target of ' + bp(p.target) + ': the ' + (!s.target.sysOk && !s.target.diaOk ? 'top and bottom numbers are' : !s.target.sysOk ? 'top number is' : 'bottom number is') + ' at or above it.';
        } else tl.hidden = true;
        $('skip-note').hidden = !s.skipped;
        if (s.skipped) $('skip-note').textContent = 'Left out the first day, ' + fmtDay(s.skipped.day) + ' (' + plural(s.skipped.n, 'reading') + ').';
        const warn = $('sum-warn');
        warn.hidden = !s.severe.length;
        if (s.severe.length) warn.textContent = (s.severe.length === 1 ? '1 reading was very high (' + bp(s.severe[0]) + ' at ' + fmtWhen(s.severe[0].t, true) + '). '
            : s.severe.length + ' readings were very high (highest ' + bp(s.highest) + '). ') + C.advice('severe');
        const tile = (v, sub, a) => { $(v).textContent = a ? bp(a) : 'none'; $(sub).textContent = a ? plural(a.n, 'reading') : 'no readings'; };
        tile('t-am', 't-am-n', s.morning); tile('t-pm', 't-pm-n', s.evening);
        $('t-hi').textContent = bp(s.highest); $('t-hi-when').textContent = fmtWhen(s.highest.t, true);
        $('t-lo').textContent = bp(s.lowest); $('t-lo-when').textContent = fmtWhen(s.lowest.t, true);
        const ul = $('counts'); ul.textContent = '';
        ['severe', 's2', 's1', 'elevated', 'normal', 'low'].filter(k => s.counts[k]).forEach(k => {
            const li = el('li'); li.dataset.level = k;
            const bar = el('span', 'bar'); bar.style.width = Math.max(4, Math.round(s.counts[k] / s.n * 100)) + '%';
            li.append(el('span', 'c-name', C.levelText(k, p.guide)), el('span', 'c-n', String(s.counts[k])), el('span', 'track'));
            li.lastChild.appendChild(bar);
            ul.appendChild(li);
        });
        renderChart(s, p);
    }

    // ---------- chart: readings in time order, with the guide's line (or the doctor's target)
    function renderChart(s, p) {
        const svg = $('chart'), NS = 'http://www.w3.org/2000/svg';
        svg.textContent = '';
        let list = C.sortReadings(C.inPeriod(p.readings, period().from, period().to));
        if (s.skipped) list = list.filter(r => C.logDay(r.t) !== s.skipped.day);
        const W = 600, H = 240, L = 40, R = 10, T = 12, B = 28;
        const line = p.target ? [p.target.sys, p.target.dia] : C.GUIDES[p.guide].line;
        $('line-label').textContent = p.target ? 'Your target ' + line.join('/') : (p.guide === 'aha' ? 'High from ' : 'Raised from ') + line.join('/');
        let lo = Math.min(...list.map(r => r.dia), line[1]) - 10, hi = Math.max(...list.map(r => r.sys), line[0]) + 10;
        lo = Math.floor(lo / 20) * 20; hi = Math.ceil(hi / 20) * 20;
        const x = i => list.length === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (list.length - 1);
        const y = v => T + (hi - v) * (H - T - B) / (hi - lo);
        const add = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k])); if (text != null) e.textContent = text; svg.appendChild(e); return e; };
        for (let v = lo; v <= hi; v += 20) { add('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }); add('text', { x: L - 6, y: y(v) + 4, class: 'ax', 'text-anchor': 'end' }, String(v)); }
        line.forEach(v => add('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'limit' }));
        ['sys', 'dia'].forEach(k => {
            if (list.length > 1) add('polyline', { points: list.map((r, i) => x(i).toFixed(1) + ',' + y(r[k]).toFixed(1)).join(' '), class: 'pl ' + k });
            if (list.length <= 120) list.forEach((r, i) => add('circle', { cx: x(i).toFixed(1), cy: y(r[k]).toFixed(1), r: list.length > 40 ? 2.5 : 4, class: 'pt ' + k }));
        });
        const d0 = C.logDay(list[0].t), d1 = C.logDay(list[list.length - 1].t);
        add('text', { x: L, y: H - 8, class: 'ax', 'text-anchor': 'start' }, fmtDay(d0));
        if (d1 !== d0) add('text', { x: W - R, y: H - 8, class: 'ax', 'text-anchor': 'end' }, fmtDay(d1));
        svg.setAttribute('aria-label', 'Chart of ' + plural(list.length, 'reading') + ' from ' + fmtDay(d0) + ' to ' + fmtDay(d1) + ', top numbers from ' + s.lowest.sys + ' to ' + s.highest.sys + '.');
    }

    // ---------- readings list
    let editing = null;
    function groupDays(list) {
        const days = new Map();
        C.sortReadings(list).forEach(r => { const d = C.logDay(r.t); if (!days.has(d)) days.set(d, { morning: [], evening: [] }); days.get(d)[C.partOfDay(r.t)].push(r); });
        return [...days.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1);
    }
    function renderList() {
        const { p, s, list } = currentSummary(), box = $('days');
        box.textContent = '';
        $('list-h').textContent = list.length ? 'Readings (' + list.length + ')' : 'Readings';
        $('list-hint').textContent = list.length ? 'Readings from the days chosen above, newest day first.' : (p.readings.length ? 'No readings in the days chosen above.' : 'Your readings will appear here.');
        groupDays(list).forEach(([d, parts]) => {
            const day = el('div', 'day');
            const h = el('h3', 'day-h', fmtDay(d, true));
            if (s.skipped && s.skipped.day === d) h.append(' ', el('span', 'tag', 'left out of the average'));
            day.appendChild(h);
            ['morning', 'evening'].forEach(part => {
                const rs = parts[part]; if (!rs.length) return;
                const ph = el('p', 'part-h', part === 'morning' ? 'Morning' : 'Evening');
                if (rs.length > 1) { const a = C.average(rs); ph.append(' ', el('span', 'part-avg', 'average ' + bp(a))); }
                day.appendChild(ph);
                const ul = el('ul', 'rds');
                rs.forEach(r => ul.appendChild(editing === r.id ? editRow(r, p) : readingRow(r, p)));
                day.appendChild(ul);
            });
            box.appendChild(day);
        });
    }
    function readingRow(r, p) {
        const li = el('li', 'rd'), lv = C.level(r.sys, r.dia, p.guide);
        li.dataset.level = lv;
        const main = el('div', 'rd-main');
        main.append(el('span', 'rd-time', fmtWhen(r.t)), el('span', 'rd-val', bp(r)), el('span', 'rd-lvl', C.levelName(lv, p.guide)));
        const info = [r.pulse ? 'pulse ' + r.pulse : '', r.arm === 'L' ? 'left arm' : r.arm === 'R' ? 'right arm' : ''].filter(Boolean).join(', ');
        if (info) main.appendChild(el('span', 'rd-info', info));
        if (r.note) main.appendChild(el('span', 'rd-note', r.note));
        const btns = el('div', 'rd-btns');
        const eb = el('button', 'secondary small', 'Edit'); eb.type = 'button'; eb.setAttribute('aria-label', 'Edit ' + bp(r) + ' at ' + fmtWhen(r.t, true));
        const db = el('button', 'secondary small', 'Delete'); db.type = 'button'; db.setAttribute('aria-label', 'Delete ' + bp(r) + ' at ' + fmtWhen(r.t, true));
        eb.addEventListener('click', () => { editing = r.id; renderList(); const i = document.querySelector('.rd-edit input'); if (i) i.focus(); });
        db.addEventListener('click', () => {
            const snap = snapshot(); p.readings = p.readings.filter(x => x.id !== r.id); if (editing === r.id) editing = null; save(); renderAll();
            say($('list-msg'), 'Deleted ' + bp(r) + ' at ' + fmtWhen(r.t, true) + '.', { undo: snap, undoText: 'Reading is back.' });
        });
        btns.append(eb, db);
        li.append(main, btns);
        return li;
    }
    let editSeq = 0;
    function editRow(r, p) {
        const li = el('li', 'rd rd-edit'), n = ++editSeq;
        const mk = (label, value, attrs) => {
            const w = el('div', 'field'), id = 'e' + n + '-' + label.replace(/\W+/g, '').toLowerCase();
            const lab = el('label', null, label); lab.htmlFor = id;
            const i = el(attrs.tag || 'input'); i.id = id;
            if (!attrs.tag) { i.type = attrs.type || 'text'; i.autocomplete = 'off'; if (attrs.inputmode) i.inputMode = attrs.inputmode; if (attrs.max) i.maxLength = attrs.max; }
            if (attrs.options) attrs.options.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; i.appendChild(o); });
            i.value = value; const err = el('p', 'err'); err.setAttribute('role', 'alert');
            w.append(lab, i, err); return { w, i, err };
        };
        const a = mk('Top number', String(r.sys), { inputmode: 'numeric', max: 3 }), b = mk('Bottom number', String(r.dia), { inputmode: 'numeric', max: 3 }),
            c = mk('Pulse (optional)', r.pulse == null ? '' : String(r.pulse), { inputmode: 'numeric', max: 3 }), t = mk('Date and time', r.t, { type: 'datetime-local' }),
            arm = mk('Arm', r.arm, { tag: 'select', options: [['', 'Not noted'], ['L', 'Left arm'], ['R', 'Right arm']] }), note = mk('Note', r.note, { max: C.NOTE_MAX });
        t.i.max = nowStamp();
        const g1 = el('div', 'two'); g1.append(a.w, b.w);
        const g2 = el('div', 'two'); g2.append(c.w, arm.w);
        const btns = el('div', 'rd-btns');
        const sv = el('button', 'primary small', 'Save'); sv.type = 'button';
        const cn = el('button', 'secondary small', 'Cancel'); cn.type = 'button';
        btns.append(sv, cn);
        li.append(g1, g2, t.w, note.w, btns);
        const cancel = () => { editing = null; renderList(); };
        const commit = () => {
            [a, b, c, t].forEach(x => { x.err.textContent = ''; });
            const chk = C.checkReading(a.i.value, b.i.value, c.i.value);
            let bad = false;
            if (chk.errors) { if (chk.errors.sys) a.err.textContent = chk.errors.sys; if (chk.errors.dia) b.err.textContent = chk.errors.dia; if (chk.errors.pulse) c.err.textContent = chk.errors.pulse; bad = true; }
            const tv = t.i.value.slice(0, 16);
            if (!C.validStamp(tv)) { t.err.textContent = 'Choose a date and time.'; bad = true; }
            else if (tv > nowStamp()) { t.err.textContent = 'That time is in the future.'; bad = true; }
            if (bad) return;
            const snap = snapshot();
            p.readings = C.sortReadings(p.readings.map(x => x.id === r.id ? { id: r.id, t: tv, sys: chk.reading.sys, dia: chk.reading.dia, pulse: chk.reading.pulse, arm: arm.i.value, note: note.i.value.trim().slice(0, C.NOTE_MAX) } : x));
            editing = null; save(); renderAll();
            say($('list-msg'), 'Saved the change: ' + chk.reading.sys + '/' + chk.reading.dia + ' at ' + fmtWhen(tv, true) + '.', { undo: snap, undoText: 'Change undone.' });
        };
        sv.addEventListener('click', commit);
        cn.addEventListener('click', cancel);
        li.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); commit(); } });
        return li;
    }

    // ---------- share: text, email, print, spreadsheet
    function reportLines() {
        const { p, per, s, list } = currentSummary(), g = C.GUIDES[p.guide];
        const head = ['Blood pressure readings' + (p.name ? ': ' + p.name : '')];
        if (!s.n) return { head: head.concat(['No readings in ' + periodText(s, per) + '.']), rows: [], p, s, list };
        head.push(periodText(s, per) + (s.skipped ? ' (first day, ' + fmtDay(s.skipped.day) + ', left out)' : ''));
        head.push('Average: ' + bp(s.avg) + ' mmHg from ' + plural(s.n, 'reading') + ' over ' + plural(s.days, 'day'));
        head.push('Range: ' + C.levelText(s.level, p.guide) + ', ' + g.short);
        if (p.target) head.push('Doctor\'s target under ' + bp(p.target) + ': ' + (s.target.met ? 'met' : 'not met'));
        if (s.avg.pulse) head.push('Average pulse: ' + s.avg.pulse);
        if (s.morning) head.push('Morning average: ' + bp(s.morning) + ' (' + plural(s.morning.n, 'reading') + ')');
        if (s.evening) head.push('Evening average: ' + bp(s.evening) + ' (' + plural(s.evening.n, 'reading') + ')');
        head.push('Highest: ' + bp(s.highest) + ' on ' + fmtWhen(s.highest.t, true));
        head.push('Lowest: ' + bp(s.lowest) + ' on ' + fmtWhen(s.lowest.t, true));
        const rows = [];
        groupDays(list).forEach(([d, parts]) => {
            rows.push(fmtDay(d, true) + (s.skipped && s.skipped.day === d ? ' (left out of the average)' : ''));
            parts.morning.concat(parts.evening).forEach(r => rows.push('  ' + fmtWhen(r.t) + '  ' + bp(r) + (r.pulse ? '  pulse ' + r.pulse : '') + (r.arm ? '  ' + (r.arm === 'L' ? 'left' : 'right') + ' arm' : '') + (r.note ? '  (' + r.note + ')' : '')));
        });
        return { head, rows, p, s, list };
    }
    function reportText(maxLen) {
        const { head, rows } = reportLines();
        const tail = ['', 'Made with Home Blood Pressure Log: ' + URL_APP];
        let body = head.concat(rows.length ? ['', 'Readings:'] : [], rows);
        if (maxLen) {
            const short = ['', '(Only the newest readings fit in an email. Use Print or Download spreadsheet for all of them.)'];
            while (body.length > head.length + 2 && encodeURIComponent(body.concat(short, tail).join('\n')).length > maxLen) body.pop();
            if (body.length - head.length - 2 < rows.length) body = body.concat(short);
        }
        return body.concat(tail).join('\n');
    }
    $('copy').addEventListener('click', () => {
        const text = reportText();
        const done = () => say($('share-msg'), 'Copied. Paste it into a message or email.');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        else fallbackCopy(text, done);
    });
    function fallbackCopy(text, done) {
        const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        t.remove();
        if (ok) done(); else say($('share-msg'), 'This browser blocked copying. Use Email or Print instead.', { kind: 'bad' });
    }
    // a real link, so it works with no address typed and the mail app fills in the rest
    function setMailLink() {
        const { p, list } = currentSummary(), a = $('email');
        if (!list.length) { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); return; }
        a.removeAttribute('aria-disabled');
        a.href = 'mailto:?subject=' + encodeURIComponent('Blood pressure readings' + (p.name ? ': ' + p.name : '')) + '&body=' + encodeURIComponent(reportText(1800));
    }
    $('email').addEventListener('click', e => {
        if (!$('email').hasAttribute('href')) { e.preventDefault(); return; }
        setMailLink();
        say($('share-msg'), 'Your mail app should open with the readings. Type your doctor\'s address there.');
    });
    function buildReport() {
        const { head, p, s, list } = reportLines(), rep = $('report');
        rep.textContent = '';
        rep.appendChild(el('h2', null, head[0]));
        head.slice(1).forEach((line, i) => rep.appendChild(el('p', i === 1 ? 'r-big' : null, line)));
        if (!s.n) return;
        const table = el('table'), tr = el('tr');
        ['Date', 'Time', 'Top', 'Bottom', 'Pulse', 'Arm', 'Range', 'Note'].forEach(h => tr.appendChild(el('th', null, h)));
        const thead = el('thead'); thead.appendChild(tr); table.appendChild(thead);
        const tb = el('tbody');
        C.sortReadings(list).forEach(r => {
            const row = el('tr');
            const skippedDay = s.skipped && s.skipped.day === C.logDay(r.t);
            [fmtDay(C.logDay(r.t)) + (skippedDay ? ' *' : ''), fmtWhen(r.t), r.sys, r.dia, r.pulse == null ? '' : r.pulse, r.arm === 'L' ? 'Left' : r.arm === 'R' ? 'Right' : '', C.levelName(C.level(r.sys, r.dia, p.guide), p.guide), r.note]
                .forEach(v => row.appendChild(el('td', null, String(v))));
            tb.appendChild(row);
        });
        table.appendChild(tb); rep.appendChild(table);
        if (s.skipped) rep.appendChild(el('p', 'r-foot', '* First day, left out of the average.'));
        rep.appendChild(el('p', 'r-foot', 'Ranges: ' + C.GUIDES[p.guide].name + '. Made with Home Blood Pressure Log, ' + URL_APP));
    }
    $('print').addEventListener('click', () => { buildReport(); window.print(); });
    window.addEventListener('beforeprint', buildReport);
    $('csv').addEventListener('click', () => {
        const { p, per, list } = currentSummary();
        if (!list.length) { say($('share-msg'), 'There are no readings in the days chosen above.', { kind: 'bad' }); return; }
        const who = (p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const d = C.sortReadings(list);
        download('blood-pressure-' + (who ? who + '-' : '') + C.logDay(d[0].t) + '-to-' + C.logDay(d[d.length - 1].t) + '.csv', '﻿' + C.csv(list, p.guide), 'text/csv');
        say($('share-msg'), 'Spreadsheet saved with ' + plural(list.length, 'reading') + '.' + (per.from ? '' : ''));
    });

    // ---------- draw everything
    function renderAdd() {
        $('pulse-box').hidden = !state.pulseOpen; $('pulse-open').hidden = state.pulseOpen;
        f.arm.value = state.arm;
    }
    function renderShare() {
        const { list } = currentSummary();
        ['print', 'copy', 'csv'].forEach(id => { $(id).disabled = !list.length; });
        setMailLink();
        $('share-hint').textContent = list.length ? 'Uses the readings from the days chosen above.' : 'Add readings first. Sharing uses the days chosen above.';
    }
    function renderAll() { renderPeople(); renderSettings(); renderSummary(); renderShare(); renderList(); }
    renderAdd(); renderAll();
    if (!storageOk) say($('add-msg'), 'This browser is not letting the app save (private mode or blocked storage). Readings will be lost when the page is closed.', { kind: 'bad' });

    // new day at midnight: "Last 7 days" moves on by itself
    let lastDay = today();
    setInterval(() => { if (today() !== lastDay) { lastDay = today(); if (!editing) renderAll(); } }, 30000);

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
