// Baby and Child Growth Chart: the page. The logic lives in core.js, the WHO tables in who-data.js.
(function () {
    'use strict';
    const C = window.GrowthCore;
    const KEY = 'baby-and-child-growth-chart.state';
    const SVGNS = 'http://www.w3.org/2000/svg';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };
    const svg = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

    let canSave = true, state, today = C.todayIso();
    let editKid = 0;          // id of the child whose details are being edited
    let kidFormOpen = false;  // "+ Add another child" is open
    let editM = 0;            // id of the measurement being edited
    let shown = 0;            // id of the measurement shown in "Latest result" (0 = the newest)
    let kind = 'weight';      // the chart tab

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved measurements could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; editKid = 0; editM = 0; shown = 0; commit(); }
    function commit() { save(); render(); }
    const kid = () => state.children.find(c => c.id === state.active) || null;
    const units = () => state.units;

    // ---------- messages with Undo ----------
    const MSGS = ['k-msg', 'r-msg', 'l-msg', 'set-msg'];
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
    function setErr(id, text, inputs) { $(id).textContent = text || ''; (inputs || []).forEach(i => i.setAttribute('aria-invalid', text ? 'true' : 'false')); }

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
    const sexWord = c => (c.sex === 1 ? 'boys' : 'girls');
    const val = (k, v) => (k === 'weight' ? C.showWeight(v, units()) : C.showLen(v, units()));
    const shortPct = a => (a.p == null ? '' : a.words.replace(/^the /, '').replace(' percentile', ''));
    function flagText(c, a) {
        const what = a.name;
        if (a.flag === 'check') return 'This is very far from usual for ' + c.name + '\'s age. Check the number, the unit (' + (units() === 'imperial' ? 'lb or in' : 'kg or cm') + ') and the date of birth.';
        if (a.flag === 'low') return 'Below the 3rd percentile. Ask your doctor or health visitor to check ' + c.name + '\'s ' + what.toLowerCase() + '.';
        if (a.flag === 'high') return 'Above the 97th percentile. Ask your doctor or health visitor to check ' + c.name + '\'s ' + what.toLowerCase() + '.';
        if (a.crossed && (a.kind === 'weight' || a.kind === 'length')) return what + ' has gone from ' + C.pctWords(a.crossed.from) + ' to ' + a.words + ' since ' + C.fmtDateY(a.crossed.since) + ', crossing ' + a.crossed.n + ' chart lines. Ask your doctor to check.';
        return '';
    }
    function stopText(a) {
        if (a.stop === 'over5') return 'Over 5 years: the WHO chart for birth to 5 years stops here, so there is no percentile. Ask your doctor for the 5 to 19 years chart.';
        if (a.stop === 'beforeDue') return 'Before the due date (born early): the WHO chart starts at the due date. Your doctor uses a chart for babies born early.';
        return '';
    }

    // ---------- the child form ----------
    function openKidForm(id) {
        editKid = id || 0; kidFormOpen = true;
        const c = state.children.find(x => x.id === id);
        $('k-form-h').textContent = c ? 'Change ' + c.name + '\'s details' : state.children.length ? 'Add another child' : 'Add your child';
        $('k-save').textContent = c ? 'Save the details' : 'Add child';
        $('k-name').value = c ? c.name : '';
        $('k-boy').checked = !!c && c.sex === 1; $('k-girl').checked = !!c && c.sex === 2;
        $('k-birth').value = c ? c.birth : ''; $('k-birth').max = today;
        $('k-weeks').value = c && c.weeks ? String(c.weeks) : '';
        $('w-early').hidden = !(c && c.weeks); $('o-early').setAttribute('aria-expanded', String(!!(c && c.weeks)));
        ['e-kname', 'e-sex', 'e-birth', 'e-weeks'].forEach(e => setErr(e, ''));
        render();
        $('k-name').focus();
    }
    function saveKid(ev) {
        ev.preventDefault();
        const name = C.cleanText($('k-name').value, 30), sex = $('k-boy').checked ? 1 : $('k-girl').checked ? 2 : 0, birth = $('k-birth').value;
        const wt = $('k-weeks').value.trim(), weeks = wt ? Number(wt) : 0;
        let bad = null;
        const err = (id, msg, input) => { setErr(id, msg, input ? [input] : []); if (msg && !bad) bad = input || $('k-boy'); };
        err('e-kname', name ? '' : 'Type a name, or a nickname such as Baby.', $('k-name'));
        err('e-sex', sex ? '' : 'Pick Boy or Girl: the WHO charts are different for each.');
        let be = '';
        if (!C.isIso(birth)) be = 'Pick the date of birth.';
        else if (C.diffDays(today, birth) > 0) be = 'The date of birth cannot be in the future.';
        else if (C.diffDays(birth, today) > 366 * 19) be = 'That is over 19 years ago. Check the year.';
        const c = state.children.find(x => x.id === editKid);
        if (!be && c && c.m.some(m => m.d < birth)) be = 'There are measurements before that day. Check the date, or delete those measurements first.';
        err('e-birth', be, $('k-birth'));
        err('e-weeks', wt && !(/^\d{2}$/.test(wt) && weeks >= 22 && weeks <= 42) ? 'Type the weeks as a number from 22 to 42, or leave it empty.' : '', $('k-weeks'));
        if (bad) { bad.focus(); return; }
        const snap = snapshot();
        if (c) { Object.assign(c, { name, sex, birth, weeks }); editKid = 0; kidFormOpen = false; commit(); show('k-msg', 'Saved ' + name + '\'s details.', snap); return; }
        const k = { id: state.nextId++, name, sex, birth, weeks, m: [] };
        state.children.push(k); state.active = k.id; kidFormOpen = false; shown = 0; editM = 0;
        commit(); resetMForm();
        show('k-msg', 'Added ' + name + '. Now add a measurement.');
        $('add').scrollIntoView({ block: 'start' });
    }
    function removeKid(id) {
        const c = state.children.find(x => x.id === id); if (!c) return;
        const snap = snapshot();
        state.children = state.children.filter(x => x.id !== id);
        if (state.active === id) state.active = state.children[0] ? state.children[0].id : 0;
        editKid = 0; editM = 0; shown = 0; commit();
        show('k-msg', 'Removed ' + c.name + ' and ' + (c.m.length === 1 ? '1 measurement' : c.m.length + ' measurements') + '.', snap);
    }

    // ---------- the measurement form ----------
    function resetMForm() {
        editM = 0;
        $('m-day').value = today; $('m-day').max = today;
        ['m-kg', 'm-lb', 'm-oz', 'm-len', 'm-head'].forEach(i => { $(i).value = ''; $(i).setAttribute('aria-invalid', 'false'); });
        ['e-day', 'e-weight', 'e-len', 'e-head', 'e-m'].forEach(e => setErr(e, ''));
        $('w-head').hidden = true; $('o-head').setAttribute('aria-expanded', 'false'); $('o-head').hidden = false;
        $('m-save').textContent = 'Save and see the percentile'; $('m-cancel').hidden = true;
        $('add-h').textContent = 'Add a measurement' + (kid() ? ' for ' + kid().name : '');
        lenLabel();
    }
    function fillMForm(m) {
        resetMForm(); editM = m.id;
        $('m-day').value = m.d;
        writeWeight(m.weight); $('m-len').value = m.length != null ? String(units() === 'imperial' ? C.inFromCm(m.length) : C.r1(m.length)) : '';
        if (m.head != null) { $('w-head').hidden = false; $('o-head').hidden = true; $('m-head').value = String(units() === 'imperial' ? C.inFromCm(m.head) : C.r1(m.head)); }
        $('m-save').textContent = 'Save changes'; $('m-cancel').hidden = false;
        $('add-h').textContent = 'Change the measurement of ' + C.fmtDateY(m.d);
        lenLabel();
        $('add').scrollIntoView({ block: 'start' }); $('m-day').focus();
    }
    function writeWeight(kg) {
        if (kg == null) { $('m-kg').value = ''; $('m-lb').value = ''; $('m-oz').value = ''; return; }
        $('m-kg').value = String(Math.round(kg * 1000) / 1000);
        const x = C.lbOz(kg); $('m-lb').value = String(x.lb); $('m-oz').value = String(x.oz);
    }
    // the weight typed, in kg; null when blank, NaN when not a number
    function readWeight() {
        if (units() === 'metric') { const t = $('m-kg').value.trim(); return t ? C.readNum(t) : null; }
        const lt = $('m-lb').value.trim(), ot = $('m-oz').value.trim();
        if (!lt && !ot) return null;
        const lb = lt ? C.readNum(lt) : 0, oz = ot ? C.readNum(ot) : 0;
        if (Number.isNaN(lb) || Number.isNaN(oz) || !Number.isInteger(lb)) return NaN;
        if (oz >= 16) return 'oz';
        return C.kgFromLbOz(lb, oz);
    }
    function readLen(id) {
        const t = $(id).value.trim(); if (!t) return null;
        const n = C.readNum(t); if (Number.isNaN(n)) return NaN;
        return units() === 'imperial' ? C.cmFromIn(n) : n;
    }
    function lenLabel() {
        const c = kid(), d = $('m-day').value;
        const tall = c && C.isIso(d) && C.diffDays(c.birth, d) > 730;
        $('l-len').textContent = tall ? 'Height (standing)' : 'Length (lying down)';
        const imp = units() === 'imperial';
        $('u-len').textContent = imp ? 'in' : 'cm'; $('u-head').textContent = imp ? 'in' : 'cm';
        $('m-len').placeholder = imp ? 'e.g. 26.5' : 'e.g. 67.5'; $('m-head').placeholder = imp ? 'e.g. 17' : 'e.g. 43.5';
        $('w-kg').hidden = imp; $('w-lb').hidden = !imp;
        $('l-weight').htmlFor = imp ? 'm-lb' : 'm-kg';
    }
    function saveM(ev) {
        ev.preventDefault();
        const c = kid(); if (!c) return;
        const day = $('m-day').value;
        let first = null;
        const mark = (id, msg, inputs) => { setErr(id, msg, inputs); if (msg && !first) first = inputs[0]; };
        mark('e-day', C.checkDay(c, day, today), [$('m-day')]);
        const w = readWeight(), l = readLen('m-len'), h = $('w-head').hidden ? null : readLen('m-head');
        const wIn = units() === 'imperial' ? [$('m-lb'), $('m-oz')] : [$('m-kg')];
        const unitMsg = (k, v) => {
            const imp = units() === 'imperial';
            if (v == null) return '';
            if (v === 'oz') return 'Ounces go from 0 to 15.9; 16 oz is 1 lb.';
            if (Number.isNaN(v)) return imp && k === 'weight' ? 'Type whole pounds and the ounces, such as 16 lb 5 oz.' : 'Type a number, such as ' + { weight: '7.4', length: imp ? '26.5' : '67.5', head: imp ? '17' : '43.5' }[k] + '.';
            const e = C.checkValue(k, v);
            return e && imp ? (k === 'weight' ? 'That weight' : k === 'head' ? 'That head size' : 'That length') + ' is not possible for a child up to 5. Check the number and the unit.' : e;
        };
        mark('e-weight', unitMsg('weight', w), wIn);
        mark('e-len', unitMsg('length', l), [$('m-len')]);
        mark('e-head', h == null ? '' : unitMsg('head', h), [$('m-head')]);
        if (!first && w == null && l == null && h == null) { setErr('e-m', 'Type at least one of the weight, the length or the head size.'); first = units() === 'imperial' ? $('m-lb') : $('m-kg'); }
        else setErr('e-m', '');
        if (first) { clearMsg('r-msg'); first.focus(); return; }
        const snap = snapshot();
        const m = { id: editM || state.nextId++, d: day };
        if (w != null) m.weight = w; if (l != null) m.length = C.r2(l); if (h != null) m.head = C.r2(h);
        const was = editM;
        if (was) c.m = c.m.map(x => (x.id === was ? m : x)); else c.m.push(m);
        shown = m.id; commit(); resetMForm();
        show('r-msg', was ? 'Changes saved.' : 'Saved.', snap);
        if (window.innerWidth < 900) $('result').scrollIntoView({ block: 'start' });
    }
    function delM(id) {
        const c = kid(), m = c && c.m.find(x => x.id === id); if (!m) return;
        const snap = snapshot();
        c.m = c.m.filter(x => x.id !== id); if (shown === id) shown = 0; if (editM === id) resetMForm();
        commit(); show('l-msg', 'Deleted the measurement of ' + C.fmtDateY(m.d) + '.', snap);
    }

    // ---------- render ----------
    function render() {
        today = C.todayIso();
        const c = kid(), many = state.children.length > 1;
        $('u-metric').checked = units() === 'metric'; $('u-imperial').checked = units() === 'imperial';
        const formShown = !state.children.length || kidFormOpen || editKid;
        $('k-form').hidden = !formShown;
        $('k-open').hidden = !state.children.length || formShown;
        $('k-cancel').hidden = !state.children.length;
        $('kids-h').textContent = state.children.length ? (many ? 'Your children' : 'Your child') : 'Add your child';
        $('k-form-h').hidden = !state.children.length;
        // nothing to share before a child is added; a backup can still be restored
        $('copy').parentElement.hidden = !c; $('backup').hidden = !state.children.length; $('wipe').hidden = !state.children.length;
        renderKids(many);
        $('add').hidden = !c; $('result').hidden = !c || !c.m.length; $('chart').hidden = !c; $('list').hidden = !c;
        if (!c) return;
        if (!editM) $('add-h').textContent = 'Add a measurement for ' + c.name;
        lenLabel();
        const rows = C.series(c);
        renderResult(c, rows); renderChart(c, rows); renderList(c, rows);
        const body = C.table(c, units(), today);
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('Growth measurements: ' + c.name) + '&body=' + encodeURIComponent(body + '\n');
    }

    function renderKids(many) {
        const ul = $('k-list'); ul.textContent = '';
        state.children.forEach(c => {
            const on = c.id === state.active;
            const li = el('li', 'box kid' + (on && many ? ' on' : '') + (c.sex === 2 ? ' girl' : ''));
            const top = el('div', 'box-top'); top.appendChild(el('h3', 'box-name', c.name));
            if (on && many) top.appendChild(el('span', 'badge', 'Open now'));
            li.appendChild(top);
            li.appendChild(el('p', 'box-sub', (c.sex === 1 ? 'Boy' : 'Girl') + ', ' + C.ageWords(c.birth, today) + ' old today (born ' + C.fmtDateY(c.birth) + (c.weeks && c.weeks < 37 ? ', at ' + c.weeks + ' weeks' : '') + ')'));
            const rows = C.series(c), last = rows[rows.length - 1];
            if (last) {
                const bits = ['weight', 'length', 'head'].filter(k => last.res[k]).map(k => val(k, last.res[k].value) + (last.res[k].p != null ? ' (' + shortPct(last.res[k]) + ')' : ''));
                li.appendChild(el('p', 'box-sub', 'Last: ' + C.fmtDateY(last.m.d) + ', ' + bits.join(', ')));
            } else li.appendChild(el('p', 'box-sub', 'No measurements yet.'));
            const row = el('div', 'box-btns ' + (many ? 'three' : 'two'));
            if (many) { const o = btn('mini', 'Open', () => { state.active = c.id; editM = 0; shown = 0; editKid = 0; kidFormOpen = false; commit(); resetMForm(); show('k-msg', 'Showing ' + c.name + '.'); }, 'Open ' + c.name); o.disabled = on; row.appendChild(o); }
            row.append(btn('mini', 'Edit', () => openKidForm(c.id), 'Edit ' + c.name + '\'s details'), btn('mini del', 'Remove', () => removeKid(c.id), 'Remove ' + c.name));
            li.appendChild(row);
            ul.appendChild(li);
        });
    }

    function renderResult(c, rows) {
        const box = $('res-body'); box.textContent = '';
        if (!rows.length) return;
        const row = rows.find(r => r.m.id === shown) || rows[rows.length - 1];
        $('res-h').textContent = row === rows[rows.length - 1] ? 'Latest result' : 'Result';
        const head = el('p', 'res-when');
        head.appendChild(el('strong', null, c.name + ' on ' + C.fmtDateY(row.m.d)));
        head.appendChild(document.createTextNode(', ' + C.ageWords(c.birth, row.m.d) + (row.age.corrected && row.age.days >= 0 ? ' (corrected age ' + C.ageWords(c.birth, C.addDays(c.birth, row.age.days)) + ')' : '')));
        box.appendChild(head);
        const prevOf = k => { const i = rows.indexOf(row); for (let j = i - 1; j >= 0; j--) if (rows[j].res[k] && rows[j].res[k].p != null) return rows[j]; return null; };
        ['weight', 'length', 'head'].forEach(k => {
            const a = row.res[k]; if (!a) return;
            const div = el('div', 'res-line' + (a.flag ? ' flag' : ''));
            const t = el('p', 'res-main'); t.appendChild(el('span', 'res-k', a.name + ' ' + val(k, a.value)));
            if (a.p != null) t.append(document.createTextNode(' '), el('span', 'res-p', a.words));
            div.appendChild(t);
            if (a.p != null) div.appendChild(el('p', 'res-mean', meaningLine(c, a)));
            const st = stopText(a); if (st) div.appendChild(el('p', 'res-mean', st));
            const pr = prevOf(k);
            if (a.p != null && pr) div.appendChild(el('p', 'res-prev', 'Last time (' + C.fmtDateY(pr.m.d) + '): ' + val(k, pr.res[k].value) + ', ' + pr.res[k].words + '.'));
            const f = flagText(c, a); if (f) div.appendChild(el('p', 'res-flag', f));
            box.appendChild(div);
        });
        if (Object.keys(row.res).some(k => row.res[k].p != null)) box.appendChild(el('p', 'hint', 'The usual range is the 3rd to the 97th percentile. Growing steadily along the same line matters more than which line it is.'));
    }
    function meaningLine(c, a) {
        const verb = a.kind === 'weight' ? ['weigh less', 'weigh more'] : a.kind === 'head' ? ['have a smaller head', 'have a bigger head'] : ['are shorter', 'are taller'];
        const who = sexWord(c) + ' of the same age';
        if (a.p < 1) return 'Fewer than 1 in 100 ' + who + ' ' + verb[0] + '.';
        if (a.p > 99) return 'Fewer than 1 in 100 ' + who + ' ' + verb[1] + '.';
        return 'About ' + Math.round(a.p) + ' in 100 ' + who + ' ' + verb[0] + '.';
    }

    // ---------- the chart ----------
    function niceStep(range) { const raw = range / 6, steps = [0.5, 1, 2, 5, 10, 20]; return steps.find(s => s >= raw) || 20; }
    function renderChart(c, rows) {
        ['weight', 'length', 'head'].forEach(k => { const t = $('t-' + k); t.setAttribute('aria-selected', String(k === kind)); t.tabIndex = k === kind ? 0 : -1; });
        $('t-length').textContent = rows.some(r => r.res.length && r.age.real > 730) ? 'Length / height' : 'Length';
        const wrap = $('svg-wrap'); wrap.textContent = '';
        const imp = units() === 'imperial';
        const conv = v => (kind === 'weight' ? (imp ? v / 0.45359237 : v) : (imp ? v / 2.54 : v));
        const unit = kind === 'weight' ? (imp ? 'lb' : 'kg') : (imp ? 'in' : 'cm');
        const pts = rows.filter(r => r.res[kind] && r.res[kind].p != null).map(r => ({ x: r.age.days, y: conv(r.res[kind].value), a: r.res[kind], d: r.m.d }));
        const lastX = pts.length ? Math.max(...pts.map(p => p.x)) : C.diffDays(c.birth, today);
        let months = Math.max(6, Math.ceil((Math.max(0, lastX) + 45) / 30.4375));
        const stepM = months <= 6 ? 1 : months <= 12 ? 2 : months <= 24 ? 3 : 6;
        months = Math.min(60, Math.ceil(months / stepM) * stepM);
        const xMax = Math.min(C.MAX_DAY, Math.round(months * 30.4375));
        const lines = C.LINES.map(p => { const a = []; for (let i = 0; i <= 90; i++) { const d = Math.round(xMax * i / 90); a.push([d, conv(C.valueAt(kind, c.sex, d, p))]); } return { p, a }; });
        // the step from length to height at 2 years
        if (kind === 'length' && xMax > 731) lines.forEach(l => { const i = l.a.findIndex(q => q[0] > 730); if (i > 0) l.a.splice(i, 0, [730, conv(C.valueAt(kind, c.sex, 730, l.p))], [731, conv(C.valueAt(kind, c.sex, 731, l.p))]); });
        let yMin = Math.min(lines[0].a[0][1], ...pts.map(p => p.y)), yMax = Math.max(lines[4].a[lines[4].a.length - 1][1], ...pts.map(p => p.y));
        const step = niceStep(yMax - yMin);
        yMin = Math.floor((yMin - step * 0.3) / step) * step; yMax = Math.ceil((yMax + step * 0.3) / step) * step; if (yMin < 0) yMin = 0;
        // drawn at the box's real width, so the text stays readable on phones
        const W = Math.max(280, Math.min(720, Math.round(wrap.clientWidth || 640))), H = W < 480 ? Math.round(W * 0.82) : Math.round(W * 0.62), L = 40, R = 42, T = 26, B = 38;
        const X = d => L + (W - L - R) * d / xMax, Y = v => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin));
        const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'gc', role: 'img' });
        const last = pts[pts.length - 1];
        s.setAttribute('aria-label', C.kindName(kind, 0) + ' chart for ' + c.name + ': ' + (pts.length ? pts.length + (pts.length === 1 ? ' measurement' : ' measurements') + ', the latest at ' + last.a.words : 'no measurements yet') + '.');
        // the usual range, 3rd to 97th
        const band = lines[0].a.map(q => X(q[0]) + ',' + Y(q[1])).concat(lines[4].a.slice().reverse().map(q => X(q[0]) + ',' + Y(q[1])));
        s.appendChild(svg('polygon', { points: band.join(' '), class: 'gc-band' }));
        for (let v = yMin; v <= yMax + 1e-9; v += step) {
            s.appendChild(svg('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: 'gc-grid' }));
            const t = svg('text', { x: L - 6, y: Y(v) + 4, class: 'gc-ax', 'text-anchor': 'end' }); t.textContent = String(Math.round(v * 10) / 10); s.appendChild(t);
        }
        for (let m = 0; m <= months; m += stepM) {
            const x = X(Math.min(xMax, Math.round(m * 30.4375)));
            s.appendChild(svg('line', { x1: x, x2: x, y1: T, y2: H - B, class: 'gc-grid' }));
            const t = svg('text', { x, y: H - B + 16, class: 'gc-ax', 'text-anchor': 'middle' });
            t.textContent = m === 0 ? 'Birth' : m < 24 ? m + ' m' : (m % 12 ? Math.floor(m / 12) + 'y ' + (m % 12) + 'm' : m / 12 + ' y'); s.appendChild(t);
        }
        const ut = svg('text', { x: L - 6, y: 13, class: 'gc-ax gc-unit', 'text-anchor': 'end' }); ut.textContent = unit; s.insertBefore(ut, s.firstChild.nextSibling);
        const at = svg('text', { x: (L + W - R) / 2, y: H - 4, class: 'gc-ax', 'text-anchor': 'middle' }); at.textContent = 'Age' + (rows.some(r => r.age.corrected) ? ' (corrected to 2 years)' : ''); s.appendChild(at);
        lines.forEach(l => {
            s.appendChild(svg('polyline', { points: l.a.map(q => X(q[0]) + ',' + Y(q[1])).join(' '), class: 'gc-line' + (l.p === 50 ? ' mid' : '') }));
            const e = l.a[l.a.length - 1], t = svg('text', { x: W - R + 5, y: Y(e[1]) + 4, class: 'gc-lab' }); t.textContent = C.ordinal(l.p); s.appendChild(t);
        });
        if (pts.length > 1) s.appendChild(svg('polyline', { points: pts.map(p => X(p.x) + ',' + Y(p.y)).join(' '), class: 'gc-child' }));
        pts.forEach(p => {
            const dot = svg('circle', { cx: X(p.x), cy: Y(p.y), r: 6, class: 'gc-dot' + (p.a.flag ? ' flag' : '') });
            const tt = svg('title', {}); tt.textContent = C.fmtDateY(p.d) + ': ' + val(kind, p.a.value) + ', ' + p.a.words; dot.appendChild(tt);
            s.appendChild(dot);
        });
        wrap.appendChild(s);
        $('legend').textContent = 'Lines: the WHO 3rd, 15th, 50th (middle), 85th and 97th percentiles for ' + sexWord(c) + '. The shaded band is the usual range. Dots: ' + c.name + '.';
        const notes = [];
        if (!pts.length) notes.push('No ' + (kind === 'weight' ? 'weights' : kind === 'head' ? 'head sizes' : 'lengths') + ' yet.');
        if (rows.some(r => r.res[kind] && r.res[kind].stop === 'over5')) notes.push('Measurements after 5 years are not on this chart.');
        if (rows.some(r => r.res[kind] && r.res[kind].stop === 'beforeDue')) notes.push('Measurements before the due date are not on this chart.');
        if (kind === 'length' && xMax > 730) notes.push('At 2 years the lines step down a little: standing height is about 0.7 cm less than length lying down.');
        $('chart-note').textContent = notes.join(' ');
    }

    function renderList(c, rows) {
        const ul = $('m-list'); ul.textContent = '';
        $('l-empty').hidden = rows.length > 0;
        $('list-h').textContent = 'All measurements' + (rows.length ? ' (' + rows.length + ')' : '');
        rows.slice().reverse().forEach(r => {
            const li = el('li', 'box meas' + (r.m.id === editM ? ' editing' : ''));
            const top = el('div', 'box-top'); top.append(el('h3', 'box-name', C.fmtDateY(r.m.d)), el('span', 'box-age', C.ageWords(c.birth, r.m.d) + (r.age.corrected && r.age.days >= 0 ? ' (corrected ' + C.ageWords(c.birth, C.addDays(c.birth, r.age.days)) + ')' : '')));
            li.appendChild(top);
            const ul2 = el('ul', 'vals');
            ['weight', 'length', 'head'].forEach(k => {
                const a = r.res[k]; if (!a) return;
                const v = el('li', a.flag ? 'flag' : '');
                v.append(el('span', 'vk', a.name), el('span', 'vv', val(k, a.value) + (a.p != null ? ' · ' + shortPct(a) : a.stop === 'over5' ? ' · over 5 years' : a.stop === 'beforeDue' ? ' · before due date' : '')));
                ul2.appendChild(v);
            });
            li.appendChild(ul2);
            const row = el('div', 'box-btns three');
            row.append(btn('mini', 'Result', () => { shown = r.m.id; render(); $('result').scrollIntoView({ block: 'start' }); }, 'Show the result of ' + C.fmtDateY(r.m.d)),
                btn('mini', 'Edit', () => fillMForm(r.m), 'Edit the measurement of ' + C.fmtDateY(r.m.d)),
                btn('mini del', 'Delete', () => delM(r.m.id), 'Delete the measurement of ' + C.fmtDateY(r.m.d)));
            li.appendChild(row);
            ul.appendChild(li);
        });
    }

    // ---------- events ----------
    function bind() {
        $('k-form').addEventListener('submit', saveKid);
        $('k-open').addEventListener('click', () => { openKidForm(0); $('k-open').setAttribute('aria-expanded', 'true'); });
        $('k-cancel').addEventListener('click', () => { editKid = 0; kidFormOpen = false; render(); $('k-open').setAttribute('aria-expanded', 'false'); });
        $('o-early').addEventListener('click', () => { const h = !$('w-early').hidden; $('w-early').hidden = h; $('o-early').setAttribute('aria-expanded', String(!h)); if (h) $('k-weeks').value = ''; else $('k-weeks').focus(); });
        $('m-form').addEventListener('submit', saveM);
        $('m-cancel').addEventListener('click', () => { resetMForm(); render(); });
        $('m-day').addEventListener('input', lenLabel);
        $('o-head').addEventListener('click', () => { $('w-head').hidden = false; $('o-head').hidden = true; $('m-head').focus(); });
        ['u-metric', 'u-imperial'].forEach(id => $(id).addEventListener('change', () => {
            const w = readWeight(), l = readLen('m-len'), h = readLen('m-head');
            state.units = $('u-imperial').checked ? 'imperial' : 'metric'; save();
            // keep what was typed, in the new unit
            if (typeof w === 'number' && !Number.isNaN(w)) writeWeight(w);
            const imp = units() === 'imperial';
            if (typeof l === 'number' && !Number.isNaN(l)) $('m-len').value = String(imp ? C.inFromCm(l) : C.r1(l));
            if (typeof h === 'number' && !Number.isNaN(h)) $('m-head').value = String(imp ? C.inFromCm(h) : C.r1(h));
            render();
        }));
        document.querySelectorAll('.tab').forEach(t => {
            t.addEventListener('click', () => { kind = t.dataset.kind; render(); });
            t.addEventListener('keydown', e => {
                const order = ['weight', 'length', 'head'], i = order.indexOf(kind);
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); kind = order[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3]; render(); $('t-' + kind).focus(); }
            });
        });
        $('copy').addEventListener('click', () => {
            const c = kid(); if (!c) { show('set-msg', 'Add your child first.'); return; }
            copyText(C.table(c, units(), today)).then(ok => show('set-msg', ok ? 'Copied ' + c.name + '\'s table. Paste it in a message to the doctor.' : 'Could not copy. Use "Email the table" instead.'));
        });
        $('mail').addEventListener('click', e => { if (!kid()) { e.preventDefault(); show('set-msg', 'Add your child first.'); } });
        $('backup').addEventListener('click', () => { download('growth-chart-backup-' + today + '.json', 'application/json', JSON.stringify(Object.assign({ app: 'baby-and-child-growth-chart', saved: today }, state), null, 1)); show('set-msg', 'Backup saved to your downloads.'); });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', ev => {
            const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (!f) return;
            if (f.size > 5e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            const rd = new FileReader();
            rd.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(String(rd.result))); } catch (e) { s = null; }
                if (!s || !s.children.length) { show('set-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
                const snap = snapshot(); state = s; editKid = 0; editM = 0; shown = 0; kidFormOpen = false; commit(); resetMForm();
                show('set-msg', 'Backup restored: ' + s.children.length + (s.children.length === 1 ? ' child.' : ' children.'), snap);
            };
            rd.onerror = () => show('set-msg', 'Could not read that file.');
            rd.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            const snap = snapshot(), u = state.units; state = C.emptyState(); state.units = u; editKid = 0; editM = 0; shown = 0; kidFormOpen = false; commit(); openKidForm(0);
            show('set-msg', 'Everything deleted.', snap);
        });
        let rz = 0, lastW = 0;
        window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const w = $('svg-wrap').clientWidth; if (w && w !== lastW) { lastW = w; if (kid()) render(); } }, 150); });
        setInterval(() => { if (C.todayIso() !== today) { today = C.todayIso(); if (!editM) $('m-day').value = today; render(); } }, 60000);
    }

    state = load();
    bind();
    resetMForm();
    render();
    if (!state.children.length) { $('k-form-h').hidden = true; }
    save();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
