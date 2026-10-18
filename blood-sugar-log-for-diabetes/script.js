// Blood Sugar Log for Diabetes: the page. The maths and checks live in core.js.
(function () {
    const C = window.SugarCore;
    const KEY = 'blood-sugar-log-for-diabetes.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const URL_APP = 'https://umar8092.github.io/apps/blood-sugar-log-for-diabetes/';

    // ---------- saved state
    // mmol/L is used in the UK, Europe (most), Canada, Australia and elsewhere; mg/dL in the US, South Asia, the Middle East and elsewhere
    const defaultUnit = /-(GB|IE|CA|AU|NZ|ZA|NL|SE|NO|FI|DK|CZ|SK|HU|RU|UA|CN|HK|MY|SG)\b/i.test(navigator.language || '') ? 'mmol' : 'mg';
    let storageOk = true, state = load();
    function fresh() { const p = C.newPerson('', defaultUnit); return { people: [p], current: p.id, period: '14', from: '', to: '', noteOpen: false }; }
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; }
        if (!raw) return fresh();
        try {
            const data = JSON.parse(raw), s = C.clean(data, defaultUnit);
            if (!s) return fresh();
            s.noteOpen = data.noteOpen === true;
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
        const data = JSON.parse(snap), s = C.clean(data, defaultUnit);
        if (s) { s.noteOpen = data.noteOpen === true; state = s; save(); }
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
        try { return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(/^(\d):(\d\d)$/, '0$1:$2'); } catch (e) { return t.slice(11); }
    }
    function fmtWhen(t, withDay) {
        const day = t.slice(0, 10), shifted = C.logDay(t) !== day;
        return (withDay || shifted ? fmtDay(day) + ', ' : '') + fmtTime(t);
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    const name = p => p.name || ('Person ' + (state.people.indexOf(p) + 1));
    const U = () => person().unit;
    const val = (r, u) => { const unit = u || U(); return r.hl ? r.hl : C.fmtReading(r, unit) + ' ' + C.unitName(unit); };
    const st = (r, p) => C.status(r, p.targets[r.tag], p.unit);

    function period() {
        const t = today();
        if (state.period === 'all') return { from: null, to: null };
        if (state.period === 'dates') {
            let f = state.from || C.addDays(t, -13), to = state.to || t;
            if (f > to) [f, to] = [to, f];
            return { from: f, to };
        }
        return { from: C.addDays(t, -(Number(state.period) - 1)), to: t };
    }
    function currentSummary() {
        const p = person(), per = period();
        return { p, per, s: C.summary(p.readings, { from: per.from, to: per.to, unit: p.unit, targets: p.targets }), list: C.inPeriod(p.readings, per.from, per.to) };
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
            b.addEventListener('click', () => { restoreSnapshot(o.undo); say(box, o.undoText || 'Undone.'); });
            p.appendChild(document.createTextNode(' ')); p.appendChild(b);
        }
    }
    const clearMsg = box => { box.textContent = ''; box.className = 'msg'; };

    // ---------- add a reading
    const f = { val: $('val'), when: $('when'), note: $('note') };
    let tag = '', suggestion = null;
    function setErr(id, text) { const e = $(id + '-err'); if (e) e.textContent = text || ''; const i = f[id]; if (i) i.setAttribute('aria-invalid', text ? 'true' : 'false'); }
    function renderTags() {
        const box = $('tags'); box.textContent = '';
        C.TAGS.forEach(k => {
            const b = el('button', 'chip', C.TAG_SHORT[k]); b.type = 'button'; b.dataset.tag = k;
            b.setAttribute('aria-pressed', String(tag === k));
            b.addEventListener('click', () => { tag = k; setErr('tag'); renderTagState(); });
            box.appendChild(b);
        });
    }
    function renderTagState() { document.querySelectorAll('#tags .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tag === tag))); }
    f.val.addEventListener('input', () => { setErr('val'); $('suggest').hidden = true; suggestion = null; });
    f.val.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveReading(); } });
    f.note.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveReading(); } });
    $('suggest').addEventListener('click', () => { if (suggestion) saveReading(suggestion); });
    $('when-open').addEventListener('click', () => {
        $('when-box').hidden = false; $('when-open').hidden = true; $('when-text').textContent = 'the time below';
        if (!f.when.value) f.when.value = nowStamp();
        f.when.max = nowStamp(); f.when.focus();
    });
    $('when-now').addEventListener('click', closeWhen);
    function closeWhen() { $('when-box').hidden = true; $('when-open').hidden = false; f.when.value = ''; $('when-text').textContent = 'now'; setErr('when'); }
    function openNote() { $('note-box').hidden = false; $('note-open').hidden = true; if (!state.noteOpen) { state.noteOpen = true; save(); } }
    $('note-open').addEventListener('click', () => { openNote(); f.note.focus(); });

    function whenValue() {
        if ($('when-box').hidden || !f.when.value) return { t: nowStamp() };
        const t = f.when.value.slice(0, 16);
        if (!C.validStamp(t)) { setErr('when', 'Choose a date and time, or tap "Use the time now".'); return null; }
        if (t > nowStamp()) { setErr('when', 'That time is in the future. Choose the time the reading was taken.'); return null; }
        return { t };
    }
    // forced: a {v, u} the person confirmed with the "Save as" button
    function saveReading(forced) {
        const box = $('add-msg'), p = person();
        ['val', 'tag', 'when'].forEach(k => setErr(k));
        $('suggest').hidden = true;
        const chk = forced && forced.v != null ? { reading: { v: forced.v, u: forced.u, hl: '' } } : C.parseValue(f.val.value, p.unit);
        suggestion = null;
        let bad = false;
        if (chk.error) {
            setErr('val', chk.error); bad = true;
            if (chk.suggest) { suggestion = chk.suggest; const b = $('suggest'); b.hidden = false; b.textContent = 'Save as ' + chk.suggest.v + ' ' + C.unitName(chk.suggest.u); }
        }
        if (!tag) { setErr('tag', 'Choose when you checked, for example Fasting or 2 h after meal.'); bad = true; }
        const w = whenValue();
        if (bad || !w) { clearMsg(box); (chk.error ? f.val : !tag ? $('tags').firstChild : f.when).focus(); return; }
        const snap = snapshot();
        const r = { id: C.newId(), t: w.t, tag, v: chk.reading.v, u: chk.reading.u, hl: chk.reading.hl, note: f.note.value.trim().slice(0, C.NOTE_MAX) };
        const dup = p.readings.some(x => x.t === r.t && x.tag === r.tag && x.v === r.v && x.hl === r.hl);
        p.readings = C.sortReadings(p.readings.concat(r));
        save();
        f.val.value = ''; f.note.value = ''; tag = ''; renderTagState();
        if (!$('when-box').hidden) closeWhen();
        const s = st(r, p), per = period(), d = C.logDay(r.t), outside = (per.from && d < per.from) || (per.to && d > per.to);
        let extra = C.advice(s, p.unit, p.plan);
        if (r.u !== p.unit && !r.hl) extra = (extra ? extra + ' ' : '') + 'You typed ' + r.v + ' ' + C.unitName(r.u) + '; it is shown as ' + val(r) + '. If your meter is in ' + C.unitName(r.u) + ', change "Your meter shows" in Person and settings.';
        if (dup) extra = (extra ? extra + ' ' : '') + 'You already had the same reading at this time; delete one if it was a double tap.';
        if (outside) extra = (extra ? extra + ' ' : '') + 'This day is outside the days chosen under Your results.';
        if (!storageOk) extra = (extra ? extra + ' ' : '') + 'This browser is not letting the app save, so readings will be lost when the page is closed.';
        renderAll();
        const target = p.targets[r.tag];
        const what = s === 'in' || s === 'above' || s === 'below' ? C.STATUS[s].name.toLowerCase() + ' (' + C.targetText(target, p.unit) + ')' : C.STATUS[s].name.toLowerCase();
        say(box, 'Saved ' + val(r) + ', ' + C.TAG_NAMES[r.tag].toLowerCase() + ', at ' + fmtWhen(r.t, r.t.slice(0, 10) !== today()) + ': ' + what + '.',
            { undo: snap, undoText: 'Reading removed.', kind: s === 'low' || s === 'vlow' || s === 'vhigh' ? 'bad' : (s === 'in' ? 'good' : ''), extra });
        f.val.focus();
    }
    $('save').addEventListener('click', () => saveReading());

    // ---------- people
    function renderPeople() {
        const nav = $('people'); nav.textContent = '';
        nav.hidden = state.people.length < 2;
        state.people.forEach(p => {
            const b = el('button', 'person', name(p)); b.type = 'button';
            b.setAttribute('aria-pressed', String(p.id === state.current));
            b.addEventListener('click', () => { state.current = p.id; editing = null; save(); renderAll(); ['add-msg', 'set-msg', 'list-msg', 'share-msg'].forEach(id => clearMsg($(id))); });
            nav.appendChild(b);
        });
    }
    $('person-add').addEventListener('click', () => {
        if (state.people.length >= C.MAX_PEOPLE) { say($('set-msg'), 'You can keep up to ' + C.MAX_PEOPLE + ' people.'); return; }
        const snap = snapshot(), p = C.newPerson('', person().unit);
        state.people.push(p); state.current = p.id; editing = null; save(); renderAll();
        say($('set-msg'), 'Added ' + name(p) + '. Type their name above; their readings and targets are kept apart.', { undo: snap, undoText: 'Person removed.' });
        $('name').focus();
    });
    $('person-remove').addEventListener('click', () => {
        if (state.people.length < 2) return;
        const snap = snapshot(), p = person();
        state.people = state.people.filter(x => x !== p); state.current = state.people[0].id; editing = null; save(); renderAll();
        say($('set-msg'), 'Removed ' + name(p) + ' and ' + plural(p.readings.length, 'reading') + '.', { undo: snap, undoText: name(p) + ' is back.' });
    });

    // ---------- settings
    $('name').addEventListener('input', () => { person().name = $('name').value.trim().slice(0, C.NAME_MAX); save(); renderPeople(); renderShare(); renderSettingsLabels(); });
    $('unit').addEventListener('change', () => {
        person().unit = $('unit').value === 'mmol' ? 'mmol' : 'mg'; save(); renderAll();
        say($('set-msg'), 'Readings now show in ' + C.unitName(person().unit) + '. Nothing you typed was changed.');
    });
    $('preset').addEventListener('change', () => {
        const p = person(), v = $('preset').value, snap = snapshot();
        p.preset = v === 'preg' || v === 'custom' ? v : 'ada';
        if (p.preset !== 'custom') p.targets = C.presetTargets(p.preset);
        save(); renderAll();
        if (p.preset === 'custom') { $('targets-box').hidden = false; $('targets-open').hidden = true; const i = document.querySelector('#targets input'); if (i) i.focus(); say($('set-msg'), 'Type your doctor\'s numbers in the boxes below.'); }
        else say($('set-msg'), 'Using ' + C.PRESETS[p.preset].name + ': fasting ' + C.targetText(p.targets.fasting, p.unit) + ', 2 hours after a meal ' + C.targetText(p.targets.after2, p.unit) + '.', { undo: snap, undoText: 'Targets are back as they were.' });
    });
    $('targets-open').addEventListener('click', () => { $('targets-box').hidden = false; $('targets-open').hidden = true; const i = document.querySelector('#targets input'); if (i) i.focus(); });
    function renderTargets() {
        const p = person(), box = $('targets');
        if (box.contains(document.activeElement)) return;   // do not redraw under the person's fingers
        box.textContent = '';
        C.TAGS.forEach(k => {
            const row = el('div', 'trow'); row.dataset.tag = k;
            const lab = el('span', 'tname', C.TAG_NAMES[k]);
            const mk = (end, v) => {
                const i = el('input'); i.type = 'text'; i.inputMode = 'decimal'; i.maxLength = 5; i.autocomplete = 'off'; i.value = C.fmt(v, p.unit);
                i.setAttribute('aria-label', C.TAG_NAMES[k] + ', ' + end + ' (' + C.unitName(p.unit) + ')');
                i.addEventListener('input', () => readTarget(k, row));
                return i;
            };
            const lo = mk('lowest', p.targets[k].lo), hi = mk('highest', p.targets[k].hi);
            const pair = el('span', 'tpair'); pair.append(lo, el('span', 'tto', 'to'), hi, el('span', 'tunit', C.unitName(p.unit)));
            row.append(lab, pair);
            box.appendChild(row);
        });
    }
    function readTarget(k, row) {
        const p = person(), ins = row.querySelectorAll('input');
        $('targets-err').textContent = '';
        ins.forEach(i => i.setAttribute('aria-invalid', 'false'));
        const r = C.parseTarget(ins[0].value, ins[1].value, p.unit);
        if (r.error) { $('targets-err').textContent = C.TAG_NAMES[k] + ': ' + r.error; ins.forEach(i => i.setAttribute('aria-invalid', 'true')); return; }
        p.targets[k] = r.t; p.preset = 'custom'; $('preset').value = 'custom';
        save(); renderSummary(); renderList(); renderShare();
    }
    $('plan-open').addEventListener('click', () => { $('plan-box').hidden = false; $('plan-open').hidden = true; $('plan').focus(); });
    $('plan').addEventListener('input', () => { person().plan = $('plan').value.slice(0, C.PLAN_MAX); save(); });
    function renderSettings() {
        const p = person();
        if (document.activeElement !== $('name')) $('name').value = p.name;
        $('unit').value = p.unit; $('preset').value = p.preset;
        if (document.activeElement !== $('plan')) $('plan').value = p.plan;
        const hasPlan = !!p.plan;
        if (hasPlan) { $('plan-box').hidden = false; $('plan-open').hidden = true; }
        else if (document.activeElement !== $('plan')) { $('plan-box').hidden = true; $('plan-open').hidden = false; }
        $('targets-err').textContent = '';
        renderTargets();
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
        p.readings = []; editing = null; save(); renderAll();
        say($('set-msg'), 'Deleted ' + plural(n, 'reading') + '.', { undo: snap, undoText: 'Readings are back.' });
    });

    // backup and restore
    function download(fname, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = fname;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    $('backup').addEventListener('click', () => {
        download('blood-sugar-backup-' + today() + '.json', JSON.stringify({ app: 'blood-sugar-log-for-diabetes', saved: nowStamp(), ...state }, null, 1), 'application/json');
        const n = state.people.reduce((a, p) => a + p.readings.length, 0);
        say($('set-msg'), 'Backup saved with ' + plural(n, 'reading') + '. Keep the file somewhere safe.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const file = $('restore-file').files[0]; $('restore-file').value = '';
        if (!file) return;
        if (file.size > 10e6) { say($('set-msg'), 'That file is too big to be a backup from this app.', { kind: 'bad' }); return; }
        file.text().then(text => {
            let data = null; try { data = C.clean(JSON.parse(text), defaultUnit); } catch (e) { data = null; }
            if (!data) { say($('set-msg'), 'That file is not a backup from this app, so nothing was changed.', { kind: 'bad' }); return; }
            const snap = snapshot();
            data.noteOpen = state.noteOpen; state = data; editing = null; save(); renderAll();
            const n = state.people.reduce((a, p) => a + p.readings.length, 0);
            say($('set-msg'), 'Backup restored: ' + (state.people.length === 1 ? '1 person' : state.people.length + ' people') + ', ' + plural(n, 'reading') + '.', { undo: snap, undoText: 'Back to how it was before the restore.' });
        }).catch(() => say($('set-msg'), 'That file could not be read.', { kind: 'bad' }));
    });

    // ---------- period
    $('period').addEventListener('change', () => {
        state.period = $('period').value;
        if (state.period === 'dates' && !state.from) { state.from = C.addDays(today(), -13); state.to = today(); }
        save(); renderAll();
    });
    ['from', 'to'].forEach(id => $(id).addEventListener('change', () => {
        const v = $(id).value;
        $('dates-err').textContent = '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { $('dates-err').textContent = 'Choose a date.'; return; }
        state[id] = v;
        if (state.from && state.to && state.from > state.to) { [state.from, state.to] = [state.to, state.from]; $('dates-err').textContent = 'From was after To, so the two dates were swapped.'; }
        save(); renderAll();
    }));

    // ---------- summary
    function tagLine(k, b, p) {
        const parts = [plural(b.n, 'reading')];
        if (b.above) parts.push(b.above + ' above target');
        if (b.below) parts.push(b.below + ' below target or low');
        if (!b.above && !b.below) parts.push('all in target');
        return parts.join(', ');
    }
    function renderSummary() {
        const { p, per, s, list } = currentSummary();
        $('period').value = state.period;
        $('dates-box').hidden = state.period !== 'dates';
        if (state.period === 'dates') { $('from').value = per.from; $('to').value = per.to; }
        const has = s.n > 0;
        $('sum-empty').hidden = has; $('sum-body').hidden = !has;
        if (!has) {
            $('sum-empty-text').textContent = !p.readings.length
                ? 'Add a reading above. Many doctors ask for a fasting reading every morning and one 2 hours after a meal.'
                : 'No readings in these days. Choose more days under "Readings from".';
            return;
        }
        const pct = $('pct'); pct.textContent = s.percent + '%';
        $('pct-meta').textContent = s.inTarget + ' of ' + plural(s.n, 'reading') + ' in your target ranges, over ' + plural(s.days, 'day') + ', ' + periodText(s, per) + '.';
        const warn = $('sum-warn'), notes = [];
        if (s.lows) notes.push((s.lows === 1 ? '1 low reading' : s.lows + ' low readings') + ' (under ' + C.fmt(C.LOW, p.unit) + '): ' + s.lowList.slice(-3).reverse().map(r => val(r) + ' on ' + fmtWhen(r.t, true)).join('; ') + (s.lows > 3 ? '; and more in the list' : '') + '.');
        if (s.veryHighs) notes.push((s.veryHighs === 1 ? '1 very high reading' : s.veryHighs + ' very high readings') + ' (' + C.fmt(C.VERY_HIGH, p.unit) + ' or more): ' + s.vhighList.slice(-3).reverse().map(r => val(r) + ' on ' + fmtWhen(r.t, true)).join('; ') + (s.veryHighs > 3 ? '; and more in the list' : '') + '.');
        if (s.lows) notes.push('Tell your doctor about lows: your medicine may need changing.');
        warn.hidden = !notes.length; warn.textContent = notes.join(' ');
        const ul = $('bytag'); ul.textContent = '';
        C.TAGS.filter(k => s.byTag[k]).forEach(k => {
            const b = s.byTag[k], li = el('li', 'bt'), avgOk = b.avg == null ? null : C.status({ v: b.avg, u: p.unit, hl: '' }, p.targets[k], p.unit);
            li.dataset.status = avgOk || 'none';
            const top = el('div', 'bt-top');
            top.append(el('span', 'bt-name', C.TAG_NAMES[k]), el('span', 'bt-avg', b.avg == null ? (b.hi ? 'HI' : 'LO') : C.fmt(C.toMg(b.avg, p.unit), p.unit) + ' ' + C.unitName(p.unit)));
            li.append(top, el('span', 'bt-sub', 'Target ' + C.targetText(p.targets[k], p.unit) + '. ' + tagLine(k, b, p) + (b.hi || b.lo ? ' (' + [b.hi ? b.hi + ' HI' : '', b.lo ? b.lo + ' LO' : ''].filter(Boolean).join(', ') + ' not in the average)' : '') + '.'));
            ul.appendChild(li);
        });
        $('t-avg').textContent = s.avg == null ? 'none' : C.fmt(C.toMg(s.avg, p.unit), p.unit);
        $('t-avg-n').textContent = s.avg == null ? 'only HI or LO readings' : C.unitName(p.unit) + ', ' + plural(s.numbers, 'reading') + (s.hiCount + s.loCount ? ' (HI and LO left out)' : '');
        $('t-hi').textContent = C.fmtReading(s.highest, p.unit); $('t-hi-when').textContent = fmtWhen(s.highest.t, true);
        $('t-lo').textContent = C.fmtReading(s.lowest, p.unit); $('t-lo-when').textContent = fmtWhen(s.lowest.t, true);
        $('t-lows-label').textContent = 'Lows (under ' + C.fmt(C.LOW, p.unit) + ')';
        $('t-lows').textContent = String(s.lows); $('t-lows-sub').textContent = s.lows ? 'tell your doctor' : 'none in these days';
        renderChart(s, p, list);
    }

    // ---------- chart: readings in time order, the fasting target as a band and the low line
    function renderChart(s, p, list0) {
        const svg = $('chart'), NS = 'http://www.w3.org/2000/svg';
        svg.textContent = '';
        const list = C.sortReadings(list0), u = p.unit;
        const W = 600, H = 240, L = 44, R = 10, T = 12, B = 28;
        const y0 = r => r.hl === 'HI' ? C.LIMITS.mg[1] : r.hl === 'LO' ? C.LIMITS.mg[0] : C.readingMg(r);
        const band = p.targets.fasting;
        $('band-label').textContent = 'Fasting target ' + C.targetText(band, u);
        $('line-label').textContent = 'Low under ' + C.fmt(C.LOW, u);
        const step = u === 'mmol' ? 2 * C.MG : 40;  // grid every 2 mmol/L or 40 mg/dL
        let lo = Math.min(...list.map(y0), C.LOW) - 10, hi = Math.max(...list.map(y0), band.hi) + 10;
        lo = Math.max(0, Math.floor(lo / step) * step); hi = Math.ceil(hi / step) * step;
        const x = i => list.length === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (list.length - 1);
        const y = v => T + (hi - v) * (H - T - B) / (hi - lo);
        const add = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k])); if (text != null) e.textContent = text; svg.appendChild(e); return e; };
        add('rect', { x: L, width: W - L - R, y: y(band.hi), height: Math.max(1, y(band.lo) - y(band.hi)), class: 'band' });
        for (let v = lo; v <= hi + 0.001; v += step) { add('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }); add('text', { x: L - 6, y: y(v) + 4, class: 'ax', 'text-anchor': 'end' }, C.fmt(v, u).replace(/\.0$/, '')); }
        add('line', { x1: L, x2: W - R, y1: y(C.LOW), y2: y(C.LOW), class: 'limit' });
        if (list.length > 1) add('polyline', { points: list.map((r, i) => x(i).toFixed(1) + ',' + y(y0(r)).toFixed(1)).join(' '), class: 'pl' });
        list.forEach((r, i) => { const k = st(r, p); add('circle', { cx: x(i).toFixed(1), cy: y(y0(r)).toFixed(1), r: list.length > 60 ? 3 : 5, class: 'pt ' + (k === 'in' ? 'in' : k === 'low' || k === 'vlow' ? 'lowd' : 'out') }); });
        const d0 = C.logDay(list[0].t), d1 = C.logDay(list[list.length - 1].t);
        add('text', { x: L, y: H - 8, class: 'ax', 'text-anchor': 'start' }, fmtDay(d0));
        if (d1 !== d0) add('text', { x: W - R, y: H - 8, class: 'ax', 'text-anchor': 'end' }, fmtDay(d1));
        svg.setAttribute('aria-label', 'Chart of ' + plural(list.length, 'reading') + ' from ' + fmtDay(d0) + ' to ' + fmtDay(d1) + ', from ' + C.fmtReading(s.lowest, u) + ' to ' + C.fmtReading(s.highest, u) + ' ' + C.unitName(u) + '.');
    }

    // ---------- readings list
    let editing = null;
    function groupDays(list) {
        const days = new Map();
        C.sortReadings(list).forEach(r => { const d = C.logDay(r.t); if (!days.has(d)) days.set(d, []); days.get(d).push(r); });
        return [...days.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1);
    }
    function renderList() {
        const { p, list } = currentSummary(), box = $('days');
        box.textContent = '';
        $('list-h').textContent = list.length ? 'Readings (' + list.length + ')' : 'Readings';
        $('list-hint').textContent = list.length ? 'Readings from the days chosen above, newest day first.' : (p.readings.length ? 'No readings in the days chosen above.' : 'Your readings will appear here.');
        groupDays(list).forEach(([d, rs]) => {
            const day = el('div', 'day');
            day.appendChild(el('h3', 'day-h', fmtDay(d, true)));
            const ul = el('ul', 'rds');
            rs.forEach(r => ul.appendChild(editing === r.id ? editRow(r, p) : readingRow(r, p)));
            day.appendChild(ul);
            box.appendChild(day);
        });
    }
    function readingRow(r, p) {
        const li = el('li', 'rd'), s = st(r, p);
        li.dataset.status = s;
        const main = el('div', 'rd-main');
        const v = el('span', 'rd-val', C.fmtReading(r, p.unit)); if (!r.hl) v.appendChild(el('small', null, ' ' + C.unitName(p.unit)));
        main.append(el('span', 'rd-time', fmtWhen(r.t)), v, el('span', 'rd-lvl', C.STATUS[s].name));
        main.appendChild(el('span', 'rd-tag', C.TAG_NAMES[r.tag]));
        if (r.note) main.appendChild(el('span', 'rd-note', r.note));
        const btns = el('div', 'rd-btns');
        const label = val(r) + ' at ' + fmtWhen(r.t, true);
        const eb = el('button', 'secondary small', 'Edit'); eb.type = 'button'; eb.setAttribute('aria-label', 'Edit ' + label);
        const db = el('button', 'secondary small', 'Delete'); db.type = 'button'; db.setAttribute('aria-label', 'Delete ' + label);
        eb.addEventListener('click', () => { editing = r.id; renderList(); const i = document.querySelector('.rd-edit input'); if (i) i.focus(); });
        db.addEventListener('click', () => {
            const snap = snapshot(); p.readings = p.readings.filter(x => x.id !== r.id); if (editing === r.id) editing = null; save(); renderAll();
            say($('list-msg'), 'Deleted ' + label + '.', { undo: snap, undoText: 'Reading is back.' });
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
        const a = mk('Reading (' + C.unitName(p.unit) + ')', C.fmtReading(r, p.unit), { inputmode: 'decimal', max: 24 }),
            w = mk('When', r.tag, { tag: 'select', options: C.TAGS.map(k => [k, C.TAG_NAMES[k]]) }),
            t = mk('Date and time', r.t, { type: 'datetime-local' }), note = mk('Note', r.note, { max: C.NOTE_MAX });
        t.i.max = nowStamp();
        const g1 = el('div', 'two'); g1.append(a.w, w.w);
        const btns = el('div', 'rd-btns');
        const sv = el('button', 'primary small', 'Save'); sv.type = 'button';
        const cn = el('button', 'secondary small', 'Cancel'); cn.type = 'button';
        btns.append(sv, cn);
        li.append(g1, t.w, note.w, btns);
        const cancel = () => { editing = null; renderList(); };
        const commit = () => {
            [a, t].forEach(x => { x.err.textContent = ''; });
            // an unchanged number keeps the value exactly as first typed (for example 7.2 mmol/L shown as 130 mg/dL)
            const same = a.i.value.trim() === C.fmtReading(r, p.unit);
            const chk = same ? { reading: { v: r.v, u: r.u, hl: r.hl } } : C.parseValue(a.i.value, p.unit);
            let bad = false;
            if (chk.error) { a.err.textContent = chk.error + (chk.suggest ? ' To use ' + C.unitName(chk.suggest.u) + ', type the unit after the number, for example "' + chk.suggest.v + ' ' + C.unitName(chk.suggest.u) + '".' : ''); bad = true; }
            const tv = t.i.value.slice(0, 16);
            if (!C.validStamp(tv)) { t.err.textContent = 'Choose a date and time.'; bad = true; }
            else if (tv > nowStamp()) { t.err.textContent = 'That time is in the future.'; bad = true; }
            if (bad) return;
            const snap = snapshot();
            const nr = { id: r.id, t: tv, tag: C.TAGS.includes(w.i.value) ? w.i.value : r.tag, v: chk.reading.v, u: chk.reading.u, hl: chk.reading.hl, note: note.i.value.trim().slice(0, C.NOTE_MAX) };
            p.readings = C.sortReadings(p.readings.map(x => x.id === r.id ? nr : x));
            editing = null; save(); renderAll();
            say($('list-msg'), 'Saved the change: ' + val(nr) + ', ' + C.TAG_NAMES[nr.tag].toLowerCase() + ', ' + fmtWhen(tv, true) + ' (' + C.STATUS[st(nr, p)].name.toLowerCase() + ').', { undo: snap, undoText: 'Change undone.' });
        };
        sv.addEventListener('click', commit);
        cn.addEventListener('click', cancel);
        li.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); commit(); } });
        return li;
    }

    // ---------- share: text, email, print, spreadsheet
    function reportLines() {
        const { p, per, s, list } = currentSummary(), u = p.unit;
        const head = ['Blood sugar readings' + (p.name ? ': ' + p.name : '')];
        if (!s.n) return { head: head.concat(['No readings in ' + periodText(s, per) + '.']), rows: [], p, s, list };
        head.push(periodText(s, per) + ', ' + plural(s.n, 'reading') + ' over ' + plural(s.days, 'day'));
        head.push('In target: ' + s.inTarget + ' of ' + s.n + ' (' + s.percent + '%)');
        C.TAGS.filter(k => s.byTag[k]).forEach(k => {
            const b = s.byTag[k];
            head.push(C.TAG_NAMES[k] + ': average ' + (b.avg == null ? 'none' : C.fmt(C.toMg(b.avg, u), u) + ' ' + C.unitName(u)) + ' from ' + plural(b.n, 'reading') + ', ' + (b.above ? b.above + ' above' : '0 above') + ', ' + (b.below ? b.below + ' below or low' : '0 below') + ' (target ' + C.targetText(p.targets[k], u) + ')');
        });
        if (s.avg != null) head.push('Average of all: ' + C.fmt(C.toMg(s.avg, u), u) + ' ' + C.unitName(u));
        head.push('Lows (under ' + C.fmt(C.LOW, u) + '): ' + s.lows + '. Very high (' + C.fmt(C.VERY_HIGH, u) + ' or more): ' + s.veryHighs + '.');
        head.push('Highest: ' + val(s.highest) + ' on ' + fmtWhen(s.highest.t, true) + '. Lowest: ' + val(s.lowest) + ' on ' + fmtWhen(s.lowest.t, true) + '.');
        const rows = [];
        groupDays(list).forEach(([d, rs]) => {
            rows.push(fmtDay(d, true));
            rs.forEach(r => rows.push('  ' + fmtWhen(r.t) + '  ' + val(r) + '  ' + C.TAG_NAMES[r.tag].toLowerCase() + (st(r, p) !== 'in' ? '  ' + C.STATUS[st(r, p)].name.toUpperCase() : '') + (r.note ? '  (' + r.note + ')' : '')));
        });
        return { head, rows, p, s, list };
    }
    function reportText(maxLen) {
        const { head, rows } = reportLines();
        const tail = ['', 'Made with Blood Sugar Log for Diabetes: ' + URL_APP];
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
    function setMailLink() {
        const { p, list } = currentSummary(), a = $('email');
        if (!list.length) { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); return; }
        a.removeAttribute('aria-disabled');
        a.href = 'mailto:?subject=' + encodeURIComponent('Blood sugar readings' + (p.name ? ': ' + p.name : '')) + '&body=' + encodeURIComponent(reportText(1800));
    }
    $('email').addEventListener('click', e => {
        if (!$('email').hasAttribute('href')) { e.preventDefault(); return; }
        setMailLink();
        say($('share-msg'), 'Your mail app should open with the readings. Type your doctor\'s address there.');
    });
    // printed log book: one row per day, one column per time of day, like the paper diaries clinics hand out
    function buildReport() {
        const { head, p, s, list } = reportLines(), rep = $('report');
        rep.textContent = '';
        rep.appendChild(el('h2', null, head[0]));
        head.slice(1).forEach((line, i) => rep.appendChild(el('p', i === 1 ? 'r-big' : null, line)));
        if (!s.n) return;
        const used = C.TAGS.filter(k => s.byTag[k]);
        const table = el('table'), tr = el('tr');
        ['Date'].concat(used.map(k => C.TAG_SHORT[k] + ' (' + C.unitName(p.unit) + ')'), ['Notes']).forEach(h => tr.appendChild(el('th', null, h)));
        const thead = el('thead'); thead.appendChild(tr); table.appendChild(thead);
        const tb = el('tbody');
        groupDays(list).reverse().forEach(([d, rs]) => {
            const row = el('tr');
            row.appendChild(el('td', null, fmtDay(d)));
            used.forEach(k => {
                const these = rs.filter(r => r.tag === k);
                row.appendChild(el('td', null, these.map(r => C.fmtReading(r, p.unit) + (these.length > 1 ? ' (' + fmtTime(r.t) + ')' : '') + ({ low: ' L', vlow: ' L!', above: ' *', vhigh: ' H!', below: ' -' }[st(r, p)] || '')).join(', ')));
            });
            row.appendChild(el('td', null, rs.filter(r => r.note).map(r => r.note).join('; ')));
            tb.appendChild(row);
        });
        table.appendChild(tb); rep.appendChild(table);
        rep.appendChild(el('p', 'r-foot', '* above target, - below target, L low (under ' + C.fmt(C.LOW, p.unit) + '), L! very low, H! very high (' + C.fmt(C.VERY_HIGH, p.unit) + ' or more). Targets: ' + (p.preset === 'custom' ? 'set by the doctor' : C.PRESETS[p.preset].name) + '. Made with Blood Sugar Log for Diabetes, ' + URL_APP));
    }
    $('print').addEventListener('click', () => { buildReport(); window.print(); });
    window.addEventListener('beforeprint', buildReport);
    $('csv').addEventListener('click', () => {
        const { p, list } = currentSummary();
        if (!list.length) { say($('share-msg'), 'There are no readings in the days chosen above.', { kind: 'bad' }); return; }
        const who = (p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const d = C.sortReadings(list);
        download('blood-sugar-' + (who ? who + '-' : '') + C.logDay(d[0].t) + '-to-' + C.logDay(d[d.length - 1].t) + '.csv', '﻿' + C.csv(list, p.unit, p.targets), 'text/csv');
        say($('share-msg'), 'Spreadsheet saved with ' + plural(list.length, 'reading') + '.');
    });

    // ---------- draw everything
    function renderAdd() {
        const u = U();
        $('val-unit').textContent = '(' + C.unitName(u) + ')';
        f.val.placeholder = u === 'mmol' ? 'e.g. 7.0' : 'e.g. 126';
        if (state.noteOpen) { $('note-box').hidden = false; $('note-open').hidden = true; }
    }
    function renderShare() {
        const { list } = currentSummary();
        ['print', 'copy', 'csv'].forEach(id => { $(id).disabled = !list.length; });
        setMailLink();
        $('share-hint').textContent = list.length ? 'Uses the readings from the days chosen above.' : 'Add readings first. Sharing uses the days chosen above.';
    }
    function renderAll() { renderPeople(); renderAdd(); renderSettings(); renderSummary(); renderShare(); renderList(); }
    renderTags(); renderAll();
    if (!storageOk) say($('add-msg'), 'This browser is not letting the app save (private mode or blocked storage). Readings will be lost when the page is closed.', { kind: 'bad' });

    // new day at midnight: "Last 14 days" moves on by itself
    let lastDay = today();
    setInterval(() => { if (today() !== lastDay) { lastDay = today(); if (!editing) renderAll(); } }, 30000);

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
