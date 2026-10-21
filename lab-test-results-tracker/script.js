// Lab Test Results Tracker: the page. The maths and checks live in core.js.
(function () {
    const C = window.LabCore;
    const KEY = 'lab-test-results-tracker.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); return b; };
    const URL_APP = 'https://umar8092.github.io/apps/lab-test-results-tracker/';
    const COMMON = ['hba1c', 'fbs', 'tchol', 'ldl', 'hdl', 'tg', 'tsh', 'vitd', 'b12', 'creat', 'hb-w', 'hb-m'];
    const SHORT = { hba1c: 'HbA1c', fbs: 'Fasting sugar', tchol: 'Total cholesterol', ldl: 'LDL', hdl: 'HDL', tg: 'Triglycerides', tsh: 'TSH', vitd: 'Vitamin D', b12: 'Vitamin B12', creat: 'Creatinine', 'hb-w': 'Haemoglobin (women)', 'hb-m': 'Haemoglobin (men)' };

    // ---------- saved state
    let storageOk = true, state = load();
    function fresh() { const p = C.newPerson(''); return { people: [p], current: p.id, labOpen: false, lab: '' }; }
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; }
        if (!raw) return fresh();
        try {
            const data = JSON.parse(raw), s = C.clean(data);
            if (!s) return fresh();
            s.labOpen = data.labOpen === true; s.lab = typeof data.lab === 'string' ? data.lab.slice(0, C.LAB_MAX) : '';
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
        const data = JSON.parse(snap), s = C.clean(data);
        if (s) { s.labOpen = data.labOpen === true; s.lab = data.lab || ''; state = s; save(); }
        editing = null; editingTest = null; renderAll();
    }

    // ---------- dates and words
    const pad = n => String(n).padStart(2, '0');
    const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const toDate = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); };
    function fmtDate(d) {
        try { return toDate(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return d; }
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    const name = p => p.name || ('Person ' + (state.people.indexOf(p) + 1));
    const withUnit = (text, u) => u ? text + ' ' + u : text;
    const isOut = s => s === 'high' || s === 'low';
    const statusLine = (r) => { const s = C.status(r.v, r.q, r.range); return C.STATUS_WORDS[s] + (r.range ? ' (' + withUnit(r.range, r.unit) + ')' : ''); };

    // ---------- messages with Undo
    function say(box, text, opt) {
        const o = opt || {};
        box.textContent = ''; box.className = 'msg show' + (o.kind ? ' ' + o.kind : '');
        const p = el('p', null, text); box.appendChild(p);
        (o.lines || []).forEach(l => box.appendChild(el('p', 'msg-line' + (l.out ? ' out' : ''), l.text)));
        if (o.extra) box.appendChild(el('p', 'msg-extra', o.extra));
        if (o.undo) {
            const b = btn('link inline undo', 'Undo');
            b.addEventListener('click', () => { restoreSnapshot(o.undo); say(box, o.undoText || 'Undone.'); });
            p.appendChild(document.createTextNode(' ')); p.appendChild(b);
        }
    }
    const clearMsg = box => { box.textContent = ''; box.className = 'msg'; };
    const clearAllMsgs = () => ['add-msg', 'test-msg', 'set-msg', 'list-msg', 'share-msg'].forEach(id => clearMsg($(id)));

    // ---------- the report form: one row per test, typed values kept while the page redraws
    let draft = {};   // test id -> { value, unit, range, rangeOpen }
    let dateTouched = false;
    const dateIn = $('date');
    function draftOf(t) {
        if (!draft[t.id]) draft[t.id] = { value: '', unit: t.unit, range: null, rangeOpen: false };
        const d = draft[t.id];
        if (!C.unitsOf(t).includes(d.unit)) d.unit = t.unit;
        return d;
    }
    function rowRange(t, d) { return d.rangeOpen && d.range != null ? d.range : C.suggestRange(t, d.unit); }
    function renderRows() {
        const p = person(), box = $('rows');
        box.textContent = '';
        $('no-tests').hidden = p.tests.length > 0;
        $('rows-hint').hidden = !p.tests.length;
        $('save').hidden = !p.tests.length;
        $('addtest-h').textContent = p.tests.length ? 'Add another test to your list' : 'Add a test to your list';
        p.tests.forEach((t, i) => {
            const d = draftOf(t), row = el('div', 'row'), id = 'v-' + i;
            row.dataset.test = t.id;
            const lab = el('label', 'row-name', t.name); lab.htmlFor = id;
            const line = el('div', 'row-in');
            const inp = el('input'); inp.id = id; inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off'; inp.maxLength = 20;
            inp.placeholder = 'Result'; inp.value = d.value; inp.className = 'val';
            const err = el('p', 'err'); err.id = id + '-err'; err.setAttribute('role', 'alert');
            inp.setAttribute('aria-describedby', err.id);
            inp.addEventListener('input', () => { d.value = inp.value; err.textContent = ''; inp.removeAttribute('aria-invalid'); });
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveResults(); } });
            line.appendChild(inp);
            const units = C.unitsOf(t);
            if (units.length > 1) {
                const sel = el('select', 'unit'); sel.setAttribute('aria-label', 'Unit for ' + t.name);
                units.forEach(u => { const o = el('option', null, u); o.value = u; sel.appendChild(o); });
                sel.value = d.unit;
                sel.addEventListener('change', () => { d.unit = sel.value; if (!d.rangeOpen) d.range = null; renderRows(); const n = document.querySelector('[data-test="' + t.id + '"] .unit'); if (n) n.focus(); });
                line.appendChild(sel);
            } else if (t.unit) line.appendChild(el('span', 'unit-fixed', t.unit));
            row.append(lab, line);
            const rr = rowRange(t, d), rl = el('p', 'row-range');
            if (!d.rangeOpen) {
                rl.append(rr ? 'Normal range: ' + withUnit(rr, d.unit) + ' ' : 'No normal range ');
                const cb = btn('link inline', rr ? 'Change range' : 'Add range', (rr ? 'Change range for ' : 'Add range for ') + t.name);
                cb.addEventListener('click', () => { d.rangeOpen = true; d.range = rr; renderRows(); const n = $(id + '-r'); if (n) n.focus(); });
                rl.appendChild(cb);
                row.appendChild(rl);
            } else {
                const rlab = el('label', 'row-rlab', 'Normal range on this report' + (d.unit ? ' (' + d.unit + ')' : '')); rlab.htmlFor = id + '-r';
                const ri = el('input'); ri.id = id + '-r'; ri.type = 'text'; ri.maxLength = 40; ri.autocomplete = 'off'; ri.placeholder = 'e.g. 70-99 or <200'; ri.value = d.range || '';
                ri.addEventListener('input', () => { d.range = ri.value; err.textContent = ''; });
                ri.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveResults(); } });
                row.append(rlab, ri);
            }
            row.appendChild(err);
            const tr = C.trend(t);
            if (tr) row.appendChild(el('p', 'row-last', 'Last: ' + withUnit(C.valueText(tr.last), tr.last.unit) + ' on ' + fmtDate(tr.last.date)));
            box.appendChild(row);
        });
    }

    dateIn.addEventListener('change', () => { dateTouched = true; $('date-err').textContent = ''; dateIn.removeAttribute('aria-invalid'); });
    $('lab-open').addEventListener('click', () => { state.labOpen = true; save(); renderLab(); $('lab').focus(); });
    $('lab').addEventListener('input', () => { state.lab = $('lab').value.slice(0, C.LAB_MAX); save(); });
    function renderLab() { $('lab-box').hidden = !state.labOpen; $('lab-open').hidden = state.labOpen; if (document.activeElement !== $('lab')) $('lab').value = state.lab; }

    function saveResults() {
        const p = person(), box = $('add-msg');
        $('date-err').textContent = ''; dateIn.removeAttribute('aria-invalid');
        if (!p.tests.length) { say(box, 'Add the tests on your report first.', { kind: 'bad' }); return; }
        const date = dateIn.value;
        let firstBad = null;
        if (!C.validDate(date)) { $('date-err').textContent = 'Choose the date of the test (on the report).'; firstBad = dateIn; }
        else if (date > today()) { $('date-err').textContent = 'That date is in the future. Choose the date the test was done.'; firstBad = dateIn; }
        if (firstBad) dateIn.setAttribute('aria-invalid', 'true');
        const adds = [];
        p.tests.forEach((t, i) => {
            const d = draftOf(t), row = document.querySelector('[data-test="' + t.id + '"]'), err = $('v-' + i + '-err'), inp = $('v-' + i);
            if (!row) return;
            err.textContent = ''; inp.removeAttribute('aria-invalid');
            const pv = C.parseValue(d.value, !t.key);
            if (pv.empty) return;
            if (pv.error) { err.textContent = pv.error; inp.setAttribute('aria-invalid', 'true'); firstBad = firstBad || inp; return; }
            const rtext = rowRange(t, d), pr = C.parseRange(rtext);
            if (pr.error) { err.textContent = pr.error; firstBad = firstBad || $('v-' + i + '-r') || inp; return; }
            adds.push({ t, d, r: { id: C.newId(), date, v: pv.v, q: pv.q, unit: d.unit, range: C.rangeText(pr.range), lab: state.labOpen ? state.lab.trim() : '', note: '' } });
        });
        if (firstBad) { clearMsg(box); firstBad.focus(); return; }
        if (!adds.length) {
            say(box, 'Type at least one result next to its test, then tap "Save results".', { kind: 'bad' });
            const first = $('v-0'); if (first) first.focus();
            return;
        }
        if (adds.some(a => a.t.results.length >= C.MAX_RESULTS)) { say(box, 'One of these tests already has ' + C.MAX_RESULTS + ' results, the most the app keeps.', { kind: 'bad' }); return; }
        const snap = snapshot(), dups = [];
        adds.forEach(a => {
            if (a.t.results.some(x => x.date === a.r.date && x.v === a.r.v && x.unit === a.r.unit)) dups.push(a.t.name);
            a.t.results.push(a.r);
            a.t.ranges[a.r.unit] = a.r.range;
            a.d.value = ''; a.d.rangeOpen = false; a.d.range = null; a.d.unit = a.t.unit;
        });
        save(); renderAll();
        const lines = adds.map(a => {
            const s = C.status(a.r.v, a.r.q, a.r.range);
            return { text: a.t.name + ': ' + withUnit(C.valueText(a.r), a.r.unit) + ', ' + statusLine(a.r).replace(/^./, c => c.toLowerCase()) + '.', out: isOut(s) };
        });
        let extra = '';
        if (dups.length) extra = 'You already had the same result on this date for ' + dups.join(', ') + '; delete one if it was saved twice.';
        if (!storageOk) extra = (extra ? extra + ' ' : '') + 'This browser is not letting the app save, so results will be lost when the page is closed.';
        say(box, 'Saved ' + plural(adds.length, 'result') + ' for ' + fmtDate(date) + '.', { undo: snap, undoText: 'Results removed.', lines, extra });
    }
    $('save').addEventListener('click', saveResults);

    // ---------- adding tests to the list
    function renderPicker() {
        const p = person(), have = new Set(p.tests.map(t => t.key).filter(Boolean));
        const chips = $('chips'); chips.textContent = '';
        COMMON.filter(k => !have.has(k)).forEach(k => {
            const b = btn('chip', '+ ' + SHORT[k], 'Add ' + C.preset(k).name);
            b.addEventListener('click', () => addTest(k));
            chips.appendChild(b);
        });
        chips.hidden = !chips.children.length;
        const sel = $('pick'), keep = sel.value;
        sel.textContent = '';
        const o0 = el('option', null, 'Choose a test'); o0.value = ''; sel.appendChild(o0);
        const groups = {};
        C.PRESETS.filter(x => !have.has(x.key)).forEach(x => { (groups[x.group] = groups[x.group] || []).push(x); });
        Object.keys(groups).forEach(g => {
            const og = el('optgroup'); og.label = g;
            groups[g].forEach(x => { const o = el('option', null, x.name); o.value = x.key; og.appendChild(o); });
            sel.appendChild(og);
        });
        const oo = el('option', null, 'Other test (type its name)'); oo.value = '__other'; sel.appendChild(oo);
        sel.value = [...sel.options].some(o => o.value === keep) ? keep : '';
        $('custom-box').hidden = sel.value !== '__other';
    }
    $('pick').addEventListener('change', () => { $('custom-box').hidden = $('pick').value !== '__other'; clearMsg($('test-msg')); if ($('pick').value === '__other') $('c-name').focus(); });
    ['c-name', 'c-unit', 'c-range'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addFromPicker(); } }));
    ['c-name', 'c-range'].forEach(id => $(id).addEventListener('input', () => { $(id + '-err').textContent = ''; }));
    $('pick-add').addEventListener('click', addFromPicker);
    function addFromPicker() {
        const v = $('pick').value;
        if (!v) { say($('test-msg'), 'Choose a test in "All tests" first, or tap one of the tests above.', { kind: 'bad' }); $('pick').focus(); return; }
        if (v !== '__other') { addTest(v); return; }
        const nm = $('c-name').value.trim(), rg = $('c-range').value.trim();
        $('c-name-err').textContent = ''; $('c-range-err').textContent = '';
        if (!nm) { $('c-name-err').textContent = 'Type the test name, for example Calcium.'; $('c-name').focus(); return; }
        if (person().tests.some(t => t.name.toLowerCase() === nm.toLowerCase())) { $('c-name-err').textContent = nm + ' is already on your list.'; $('c-name').focus(); return; }
        const pr = C.parseRange(rg);
        if (pr.error) { $('c-range-err').textContent = pr.error; $('c-range').focus(); return; }
        addTest('', { name: nm, unit: $('c-unit').value, range: rg });
        $('c-name').value = ''; $('c-unit').value = ''; $('c-range').value = '';
    }
    function addTest(key, custom) {
        const p = person(), box = $('test-msg');
        if (p.tests.length >= C.MAX_TESTS) { say(box, 'You can keep up to ' + C.MAX_TESTS + ' tests for each person.', { kind: 'bad' }); return; }
        if (key && p.tests.some(t => t.key === key)) { say(box, C.preset(key).name + ' is already on your list.'); return; }
        const snap = snapshot(), t = C.newTest(key, custom);
        p.tests.push(t); save();
        $('pick').value = '';
        renderAll();
        say(box, 'Added ' + t.name + '. Type its result in the form above.', { undo: snap, undoText: t.name + ' taken off the list.' });
        const i = p.tests.indexOf(t), inp = $('v-' + i);
        if (inp && !key) inp.focus();
    }

    // ---------- people
    function renderPeople() {
        const nav = $('people'); nav.textContent = '';
        nav.hidden = state.people.length < 2;
        state.people.forEach(p => {
            const b = btn('person', name(p));
            b.setAttribute('aria-pressed', String(p.id === state.current));
            b.addEventListener('click', () => { state.current = p.id; editing = null; editingTest = null; save(); renderAll(); clearAllMsgs(); });
            nav.appendChild(b);
        });
    }
    $('person-add').addEventListener('click', () => {
        if (state.people.length >= C.MAX_PEOPLE) { say($('set-msg'), 'You can keep up to ' + C.MAX_PEOPLE + ' people.'); return; }
        const snap = snapshot(), p = C.newPerson('');
        state.people.push(p); state.current = p.id; save(); renderAll();
        say($('set-msg'), 'Added ' + name(p) + '. Type their name above; their tests and results are kept apart.', { undo: snap, undoText: 'Person removed.' });
        $('name').focus();
    });
    $('person-remove').addEventListener('click', () => {
        if (state.people.length < 2) return;
        const snap = snapshot(), p = person(), n = p.tests.reduce((a, t) => a + t.results.length, 0);
        state.people = state.people.filter(x => x !== p); state.current = state.people[0].id; save(); renderAll();
        say($('set-msg'), 'Removed ' + name(p) + ' and ' + plural(n, 'result') + '.', { undo: snap, undoText: name(p) + ' is back.' });
    });
    $('name').addEventListener('input', () => { person().name = $('name').value.trim().slice(0, C.NAME_MAX); save(); renderPeople(); renderSettingsLabels(); });
    function renderSettings() { if (document.activeElement !== $('name')) $('name').value = person().name; renderSettingsLabels(); }
    function renderSettingsLabels() {
        const p = person(), n = p.tests.reduce((a, t) => a + t.results.length, 0);
        $('person-remove').hidden = state.people.length < 2;
        $('person-remove').textContent = 'Remove ' + name(p);
        $('wipe').textContent = state.people.length < 2 ? 'Delete all tests and results' : 'Delete all of ' + name(p) + "'s tests and results";
        $('wipe').disabled = !p.tests.length && !n;
    }
    $('wipe').addEventListener('click', () => {
        const p = person(); if (!p.tests.length) return;
        const snap = snapshot(), n = p.tests.reduce((a, t) => a + t.results.length, 0), k = p.tests.length;
        p.tests = []; draft = {}; save(); renderAll();
        say($('set-msg'), 'Deleted ' + plural(k, 'test') + ' and ' + plural(n, 'result') + '.', { undo: snap, undoText: 'Tests and results are back.' });
    });

    // backup and restore
    function download(fname, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = fname;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    const countAll = s => s.people.reduce((a, p) => a + p.tests.reduce((b, t) => b + t.results.length, 0), 0);
    $('backup').addEventListener('click', () => {
        download('lab-results-backup-' + today() + '.json', JSON.stringify({ app: 'lab-test-results-tracker', saved: today(), ...state }, null, 1), 'application/json');
        say($('set-msg'), 'Backup saved with ' + plural(countAll(state), 'result') + '. Keep the file somewhere safe.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const file = $('restore-file').files[0]; $('restore-file').value = '';
        if (!file) return;
        if (file.size > 10e6) { say($('set-msg'), 'That file is too big to be a backup from this app.', { kind: 'bad' }); return; }
        file.text().then(text => {
            let data = null; try { data = C.clean(JSON.parse(text)); } catch (e) { data = null; }
            if (!data) { say($('set-msg'), 'That file is not a backup from this app, so nothing was changed.', { kind: 'bad' }); return; }
            const snap = snapshot();
            data.labOpen = state.labOpen; data.lab = state.lab; state = data; draft = {}; editing = null; editingTest = null; save(); renderAll();
            say($('set-msg'), 'Backup restored: ' + (state.people.length === 1 ? '1 person' : state.people.length + ' people') + ', ' + plural(countAll(state), 'result') + '.', { undo: snap, undoText: 'Back to how it was before the restore.' });
        }).catch(() => say($('set-msg'), 'That file could not be read.', { kind: 'bad' }));
    });

    // ---------- latest results
    function latestList(p) {
        const rows = p.tests.map((t, i) => ({ t, i, tr: C.trend(t) })).filter(x => x.tr);
        // outside the range first, then in the order the tests were added
        return rows.sort((a, b) => (isOut(b.tr.status) - isOut(a.tr.status)) || a.i - b.i);
    }
    function headline(rows) {
        const out = rows.filter(x => isOut(x.tr.status)), none = rows.filter(x => x.tr.status === 'none').length;
        let s;
        if (out.length) s = (out.length === rows.length ? (rows.length === 1 ? 'The latest result is' : 'All ' + rows.length + ' latest results are') : out.length + ' of ' + rows.length + ' latest results ' + (out.length === 1 ? 'is' : 'are')) + ' outside the normal range: ' + out.map(x => x.t.name).join(', ') + '.';
        else if (none === rows.length) s = rows.length === 1 ? 'The latest result has no normal range typed.' : 'None of the ' + rows.length + ' latest results has a normal range typed.';
        else s = (rows.length - none === 1 ? 'The latest result with a range is' : 'All ' + (rows.length - none) + ' latest results with a range are') + ' inside the normal range.';
        if (none && none < rows.length) s += ' ' + (none === 1 ? '1 has' : none + ' have') + ' no range typed.';
        return { text: s, out: out.length };
    }
    function renderSummary() {
        const p = person(), rows = latestList(p);
        $('sum-empty').hidden = rows.length > 0; $('sum-body').hidden = !rows.length;
        if (!rows.length) return;
        const h = headline(rows), hl = $('headline');
        hl.textContent = h.text; hl.className = 'headline ' + (h.out ? 'out' : 'ok');
        const ul = $('latest'); ul.textContent = '';
        rows.forEach(({ t, tr }) => {
            const li = el('li', 'lt-row'); li.dataset.status = tr.status;
            const top = el('div', 'lt-top');
            top.append(el('span', 'lt-name', t.name), el('span', 'lt-val', withUnit(tr.shown.text, tr.shown.v === null ? '' : t.unit)));
            const sub = el('div', 'lt-sub');
            sub.append(el('span', 'pill', C.STATUS_WORDS[tr.status]), el('span', 'lt-date', fmtDate(tr.last.date) + (tr.change ? ', ' + (tr.change.dir === 'same' ? 'same as before' : tr.change.dir + ' ' + tr.change.text) : '')));
            li.append(top, sub);
            ul.appendChild(li);
        });
    }

    // ---------- results by test: each test in its own box
    let editing = null, editingTest = null;
    const expanded = new Set();
    function renderTests() {
        const p = person(), box = $('tests');
        box.textContent = '';
        $('list-hint').textContent = p.tests.length ? 'Each test has its own box with a chart and every result, newest first.' : 'Your tests will appear here, each in its own box.';
        p.tests.forEach(t => box.appendChild(testBox(t, p)));
    }
    function testBox(t, p) {
        const art = el('article', 'test'), tr = C.trend(t);
        art.dataset.test = t.id;
        if (tr) art.dataset.status = tr.status;
        const head = el('div', 'test-h');
        const h = el('h3', null, t.name);
        if (t.unit) h.append(' ', el('span', 'tag', t.unit));
        const eb = btn('secondary small', 'Edit test', 'Edit test ' + t.name);
        eb.addEventListener('click', () => { editingTest = editingTest === t.id ? null : t.id; renderTests(); const n = document.querySelector('.test-edit input'); if (n) n.focus(); });
        head.append(h, eb);
        art.appendChild(head);
        if (editingTest === t.id) art.appendChild(testEditForm(t, p));
        if (!tr) { art.appendChild(el('p', 'muted-line', 'No results yet. Type one in "Add results from a report".')); return art; }
        const big = el('p', 'test-big');
        big.append(el('span', 'tb-val', tr.shown.text), el('span', 'tb-unit', tr.shown.v === null ? '' : ' ' + t.unit), ' ', el('span', 'pill', C.STATUS_WORDS[tr.status]));
        art.appendChild(big);
        art.appendChild(el('p', 'test-line', C.sentence(t, fmtDate)));
        if (t.results.length > 1) art.appendChild(chart(t));
        const list = C.sortResults(t.results), show = expanded.has(t.id) ? list : list.slice(0, 5);
        const ul = el('ul', 'rs');
        show.forEach(r => ul.appendChild(editing === r.id ? editRow(t, r) : resultRow(t, r)));
        art.appendChild(ul);
        if (list.length > 5) {
            const more = btn('link', expanded.has(t.id) ? 'Show only the newest 5' : 'Show all ' + list.length + ' results');
            more.addEventListener('click', () => { if (expanded.has(t.id)) expanded.delete(t.id); else expanded.add(t.id); renderTests(); });
            art.appendChild(more);
        }
        return art;
    }
    function resultRow(t, r) {
        const li = el('li', 'r'), s = C.status(r.v, r.q, r.range);
        li.dataset.status = s;
        const main = el('div', 'r-main');
        main.append(el('span', 'r-date', fmtDate(r.date)), el('span', 'r-val', withUnit(C.valueText(r), r.unit)), el('span', 'r-st', C.STATUS_WORDS[s]));
        const conv = r.unit !== t.unit ? C.shown(t, r) : null;
        const info = [r.range ? 'range ' + withUnit(r.range, r.unit) : '', conv && conv.v !== null ? '= ' + withUnit(conv.text, t.unit) : '', r.lab].filter(Boolean).join(' · ');
        if (info) main.appendChild(el('span', 'r-info', info));
        if (r.note) main.appendChild(el('span', 'r-note', r.note));
        const btns = el('div', 'r-btns');
        const label = t.name + ' ' + C.valueText(r) + ' on ' + fmtDate(r.date);
        const e = btn('secondary small', 'Edit', 'Edit ' + label), d = btn('secondary small', 'Delete', 'Delete ' + label);
        e.addEventListener('click', () => { editing = r.id; renderTests(); const n = document.querySelector('.r-edit input'); if (n) n.focus(); });
        d.addEventListener('click', () => {
            const snap = snapshot(); t.results = t.results.filter(x => x.id !== r.id); if (editing === r.id) editing = null; save(); renderAll();
            say($('list-msg'), 'Deleted ' + t.name + ' ' + withUnit(C.valueText(r), r.unit) + ' from ' + fmtDate(r.date) + '.', { undo: snap, undoText: 'Result is back.' });
        });
        btns.append(e, d);
        li.append(main, btns);
        return li;
    }
    let seqId = 0;
    function field(label, value, o) {
        const w = el('div', 'field'), id = 'f' + (++seqId);
        const lab = el('label', null, label); lab.htmlFor = id;
        let i;
        if (o && o.options) { i = el('select'); o.options.forEach(u => { const op = el('option', null, u); op.value = u; i.appendChild(op); }); }
        else { i = el('input'); i.type = (o && o.type) || 'text'; i.autocomplete = 'off'; if (o && o.max) i.maxLength = o.max; if (o && o.mode) i.inputMode = o.mode; if (o && o.ph) i.placeholder = o.ph; }
        i.id = id; i.value = value;
        const err = el('p', 'err'); err.setAttribute('role', 'alert');
        w.append(lab, i, err);
        return { w, i, err };
    }
    function editRow(t, r) {
        const li = el('li', 'r r-edit');
        const dt = field('Date of the test', r.date, { type: 'date' });
        dt.i.max = today();
        const val = field('Result', C.valueText(r), { max: 20, mode: 'decimal' });
        const units = C.unitsOf(t);
        const un = units.length > 1 ? field('Unit', r.unit, { options: units }) : null;
        const rg = field('Normal range', r.range, { max: 40, ph: 'e.g. 70-99' });
        const lb = field('Lab (optional)', r.lab, { max: C.LAB_MAX });
        const nt = field('Note (optional)', r.note, { max: C.NOTE_MAX, ph: 'e.g. not fasting' });
        const g1 = el('div', 'two'); g1.append(dt.w, val.w);
        const g2 = el('div', 'two'); if (un) g2.appendChild(un.w); g2.appendChild(rg.w);
        const g3 = el('div', 'two'); g3.append(lb.w, nt.w);
        const btns = el('div', 'r-btns');
        const sv = btn('primary small', 'Save'), cn = btn('secondary small', 'Cancel');
        btns.append(sv, cn);
        li.append(g1, g2, g3, btns);
        const cancel = () => { editing = null; renderTests(); };
        const commit = () => {
            [dt, val, rg].forEach(x => { x.err.textContent = ''; });
            let bad = false;
            if (!C.validDate(dt.i.value)) { dt.err.textContent = 'Choose a date.'; bad = true; }
            else if (dt.i.value > today()) { dt.err.textContent = 'That date is in the future.'; bad = true; }
            const pv = C.parseValue(val.i.value, !t.key);
            if (pv.empty) { val.err.textContent = 'Type the result, or tap Delete to remove it.'; bad = true; }
            else if (pv.error) { val.err.textContent = pv.error; bad = true; }
            const pr = C.parseRange(rg.i.value);
            if (pr.error) { rg.err.textContent = pr.error; bad = true; }
            if (bad) return;
            const snap = snapshot(), unit = un ? un.i.value : r.unit;
            t.results = t.results.map(x => x.id === r.id ? { id: r.id, date: dt.i.value, v: pv.v, q: pv.q, unit, range: C.rangeText(pr.range), lab: lb.i.value.trim().slice(0, C.LAB_MAX), note: nt.i.value.trim().slice(0, C.NOTE_MAX) } : x);
            editing = null; save(); renderAll();
            say($('list-msg'), 'Saved the change: ' + t.name + ' ' + withUnit((pv.q || '') + C.fmt(pv.v), unit) + ' on ' + fmtDate(dt.i.value) + '.', { undo: snap, undoText: 'Change undone.' });
        };
        sv.addEventListener('click', commit);
        cn.addEventListener('click', cancel);
        li.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); commit(); } });
        return li;
    }
    function testEditForm(t, p) {
        const box = el('div', 'test-edit');
        const nm = field('Test name', t.name, { max: C.NAME_MAX });
        const units = C.unitsOf(t);
        const un = units.length > 1 ? field('Show results in', t.unit, { options: units }) : null;
        const g = el('div', 'two'); g.appendChild(nm.w); if (un) g.appendChild(un.w);
        if (!un) g.className = '';
        const btns = el('div', 'r-btns');
        const sv = btn('primary small', 'Save'), cn = btn('secondary small', 'Cancel');
        btns.append(sv, cn);
        const rm = btn('danger', 'Remove ' + t.name + (t.results.length ? ' and its ' + plural(t.results.length, 'result') : ''));
        box.append(g, btns, rm);
        const close = () => { editingTest = null; renderTests(); };
        const commit = () => {
            const v = nm.i.value.trim().slice(0, C.NAME_MAX);
            nm.err.textContent = '';
            if (!v) { nm.err.textContent = 'Type a name for the test.'; nm.i.focus(); return; }
            if (p.tests.some(x => x !== t && x.name.toLowerCase() === v.toLowerCase())) { nm.err.textContent = v + ' is already on your list.'; nm.i.focus(); return; }
            const snap = snapshot();
            t.name = v; if (un) t.unit = un.i.value;
            editingTest = null; save(); renderAll();
            say($('list-msg'), 'Saved ' + t.name + (un ? ', shown in ' + t.unit : '') + '.', { undo: snap, undoText: 'Change undone.' });
        };
        sv.addEventListener('click', commit);
        cn.addEventListener('click', close);
        rm.addEventListener('click', () => {
            const snap = snapshot(), n = t.results.length;
            p.tests = p.tests.filter(x => x !== t); delete draft[t.id]; editingTest = null; save(); renderAll();
            say($('list-msg'), 'Removed ' + t.name + (n ? ' and ' + plural(n, 'result') : '') + '.', { undo: snap, undoText: t.name + ' is back.' });
        });
        box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); commit(); } });
        return box;
    }

    // ---------- chart: every result over time, in the test's unit, with the latest range as a band
    function chart(t) {
        const NS = 'http://www.w3.org/2000/svg', fig = el('figure', 'chart');
        const svg = document.createElementNS(NS, 'svg');
        const W = 340, H = 170, L = 40, R = 8, T = 10, B = 24;
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('role', 'img');
        const pts = C.sortResults(t.results).slice().reverse().map(r => ({ r, s: C.shown(t, r), st: C.status(r.v, r.q, r.range) })).filter(x => x.s.v !== null);
        if (pts.length < 2) return el('span');
        const band = C.rangeIn(t, C.sortResults(t.results)[0]);
        const vals = pts.map(x => x.s.v);
        let lo = Math.min(...vals), hi = Math.max(...vals);
        if (band) { if (band.lo != null) { lo = Math.min(lo, band.lo); hi = Math.max(hi, band.lo); } if (band.hi != null) { hi = Math.max(hi, band.hi); lo = Math.min(lo, band.hi); } }
        if (hi === lo) { hi += Math.abs(hi) * 0.1 || 1; lo -= Math.abs(lo) * 0.1 || 1; }
        const padv = (hi - lo) * 0.12; lo -= padv; hi += padv;
        if (lo < 0 && Math.min(...vals) >= 0) lo = Math.max(lo, 0);
        const t0 = toDate(pts[0].r.date).getTime(), t1 = toDate(pts[pts.length - 1].r.date).getTime();
        const x = (r, i) => t1 === t0 ? L + i * (W - L - R) / (pts.length - 1) : L + (toDate(r.date).getTime() - t0) * (W - L - R) / (t1 - t0);
        const y = v => T + (hi - v) * (H - T - B) / (hi - lo);
        const add = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k])); if (text != null) e.textContent = text; svg.appendChild(e); return e; };
        if (band) {
            const top = band.hi != null ? y(band.hi) : T, bot = band.lo != null ? y(band.lo) : H - B;
            add('rect', { x: L, y: Math.max(T, top).toFixed(1), width: W - L - R, height: Math.max(0, Math.min(H - B, bot) - Math.max(T, top)).toFixed(1), class: 'band' });
        }
        const step = niceStep((hi - lo) / 4), d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
        for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
            add('line', { x1: L, x2: W - R, y1: y(v).toFixed(1), y2: y(v).toFixed(1), class: 'grid' });
            add('text', { x: L - 6, y: (y(v) + 4).toFixed(1), class: 'ax', 'text-anchor': 'end' }, C.fmt(v, Math.min(d, 3)));
        }
        add('polyline', { points: pts.map((p, i) => x(p.r, i).toFixed(1) + ',' + y(p.s.v).toFixed(1)).join(' '), class: 'pl' });
        pts.forEach((p, i) => add('circle', { cx: x(p.r, i).toFixed(1), cy: y(p.s.v).toFixed(1), r: pts.length > 40 ? 2.5 : 4, class: 'pt' + (isOut(p.st) ? ' out' : '') }));
        add('text', { x: L, y: H - 5, class: 'ax', 'text-anchor': 'start' }, fmtDate(pts[0].r.date));
        add('text', { x: W - R, y: H - 5, class: 'ax', 'text-anchor': 'end' }, fmtDate(pts[pts.length - 1].r.date));
        svg.setAttribute('aria-label', 'Chart of ' + plural(pts.length, 'result') + ' of ' + t.name + ' from ' + fmtDate(pts[0].r.date) + ' to ' + fmtDate(pts[pts.length - 1].r.date) + ', from ' + C.fmt(Math.min(...vals)) + ' to ' + C.fmt(Math.max(...vals)) + (t.unit ? ' ' + t.unit : '') + '.');
        fig.appendChild(svg);
        const cap = el('figcaption');
        const item = (cls, text) => { const s = el('span', 'k-item'); s.append(el('span', 'key ' + cls), text); return s; };
        cap.append(item('dot', 'Result'), item('dot out', 'Outside the range'));
        if (band) cap.appendChild(item('band', 'Normal range'));
        fig.appendChild(cap);
        return fig;
    }
    function niceStep(raw) {
        const p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
        return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    }

    // ---------- share: text, email, print, spreadsheet
    function reportParts() {
        const p = person(), rows = latestList(p);
        const title = 'Lab test results' + (p.name ? ': ' + p.name : '');
        if (!rows.length) return { title, head: [], all: [], rows, p };
        const h = headline(rows);
        const head = [h.text].concat(rows.map(({ t }) => t.name + ': ' + C.sentence(t, fmtDate)));
        const all = [];
        p.tests.filter(t => t.results.length).forEach(t => {
            all.push(t.name + (t.unit ? ' (' + t.unit + ')' : ''));
            C.sortResults(t.results).forEach(r => all.push('  ' + fmtDate(r.date) + ': ' + withUnit(C.valueText(r), r.unit) + ', ' + statusLine(r).replace(/^./, c => c.toLowerCase()) + (r.lab ? ', ' + r.lab : '') + (r.note ? ' (' + r.note + ')' : '')));
        });
        return { title, head, all, rows, p };
    }
    function reportText(maxLen) {
        const { title, head, all } = reportParts();
        const tail = ['', 'Made with Lab Test Results Tracker: ' + URL_APP];
        let body = [title, ''].concat(['Latest results'], head, all.length ? ['', 'All results'] : [], all);
        if (maxLen) {
            const short = ['', '(Only part of the list fits in an email. Use Print or Download spreadsheet for every result.)'];
            const min = head.length + 4;
            let cut = false;
            while (body.length > min && encodeURIComponent(body.concat(short, tail).join('\n')).length > maxLen) { body.pop(); cut = true; }
            if (cut) body = body.concat(short);
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
        const { title, rows } = reportParts(), a = $('email');
        if (!rows.length) { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); return; }
        a.removeAttribute('aria-disabled');
        a.href = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(reportText(1800));
    }
    $('email').addEventListener('click', e => {
        if (!$('email').hasAttribute('href')) { e.preventDefault(); return; }
        setMailLink();
        say($('share-msg'), 'Your mail app should open with the results. Type your doctor\'s address there.');
    });
    function buildReport() {
        const { title, rows, p } = reportParts(), rep = $('report');
        rep.textContent = '';
        rep.appendChild(el('h2', null, title));
        if (!rows.length) { rep.appendChild(el('p', null, 'No results yet.')); return; }
        rep.appendChild(el('p', 'r-big', headline(rows).text));
        const table = (heads, data) => {
            const tb = el('table'), th = el('thead'), tr = el('tr');
            heads.forEach(h => tr.appendChild(el('th', null, h))); th.appendChild(tr); tb.appendChild(th);
            const body = el('tbody');
            data.forEach(row => { const r = el('tr'); if (row.out) r.className = 'out'; row.cells.forEach(c => r.appendChild(el('td', null, String(c)))); body.appendChild(r); });
            tb.appendChild(body); return tb;
        };
        rep.appendChild(table(['Test', 'Latest', 'Date', 'Normal range', 'In range?', 'Before'], rows.map(({ t, tr }) => ({
            out: isOut(tr.status),
            cells: [t.name, withUnit(tr.shown.text, tr.shown.v === null ? '' : t.unit), fmtDate(tr.last.date), tr.last.range ? withUnit(tr.last.range, tr.last.unit) : '-', C.STATUS_WORDS[tr.status],
                tr.prev ? withUnit(tr.prevShown.text, tr.prevShown.v === null ? '' : t.unit) + ' on ' + fmtDate(tr.prev.date) : '-']
        }))));
        rep.appendChild(el('h3', null, 'Every result'));
        const all = [];
        p.tests.forEach(t => C.sortResults(t.results).forEach(r => {
            const s = C.status(r.v, r.q, r.range);
            all.push({ out: isOut(s), cells: [t.name, fmtDate(r.date), withUnit(C.valueText(r), r.unit), r.range ? withUnit(r.range, r.unit) : '-', C.STATUS_WORDS[s], [r.lab, r.note].filter(Boolean).join(', ')] });
        }));
        rep.appendChild(table(['Test', 'Date', 'Result', 'Normal range', 'In range?', 'Lab and note'], all));
        rep.appendChild(el('p', 'r-foot', 'Each result is marked by the normal range printed on its own report. Made with Lab Test Results Tracker, ' + URL_APP));
    }
    $('print').addEventListener('click', () => { buildReport(); window.print(); });
    window.addEventListener('beforeprint', buildReport);
    $('csv').addEventListener('click', () => {
        const p = person(), n = p.tests.reduce((a, t) => a + t.results.length, 0);
        if (!n) { say($('share-msg'), 'There are no results to save yet.', { kind: 'bad' }); return; }
        const who = (p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        download('lab-results-' + (who ? who + '-' : '') + today() + '.csv', '﻿' + C.csv({ name: name(p), tests: p.tests }), 'text/csv');
        say($('share-msg'), 'Spreadsheet saved with ' + plural(n, 'result') + '.');
    });

    // ---------- draw everything
    function renderShare() {
        const has = latestList(person()).length > 0;
        ['print', 'copy', 'csv'].forEach(id => { $(id).disabled = !has; });
        setMailLink();
        $('share-hint').textContent = has ? 'The latest result of each test, the one before it, and every result.' : 'Save some results first.';
    }
    function renderDate() { if (!dateTouched || !dateIn.value) dateIn.value = today(); dateIn.max = today(); }
    function renderAll() { renderPeople(); renderSettings(); renderDate(); renderLab(); renderRows(); renderPicker(); renderSummary(); renderShare(); renderTests(); }
    renderAll();
    if (!storageOk) say($('add-msg'), 'This browser is not letting the app save (private mode or blocked storage). Results will be lost when the page is closed.', { kind: 'bad' });

    // a new day: the date box moves on by itself unless it was changed by hand
    let lastDay = today();
    setInterval(() => { if (today() !== lastDay) { lastDay = today(); renderDate(); } }, 30000);

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
