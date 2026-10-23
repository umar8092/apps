// Exam Result and Report Card Tracker for Parents: the page. The maths and the words are in core.js (window.ERT).
(function () {
    'use strict';
    const C = window.ERT, SLUG = 'exam-result-and-report-card-tracker-for-parents', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const SUBJECTS = ['English', 'Maths', 'Science', 'Urdu', 'Islamiat', 'Social Studies', 'Computer', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography'];
    const TESTS = ['Class test', 'Monthly test', 'Term 1', 'Term 2', 'Mid-term', 'Final exam'];
    const SVGNS = 'http://www.w3.org/2000/svg';
    let state = C.emptyState(), today = C.dayStr(new Date());
    let panel = null;        // { id, what: 'result' | 'edit', exId }
    let flash = null;        // { where, text, undo, bad }
    let undoSnap = null, canSave = true, rowSeq = 0;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (!raw) return;
        try { const s = C.cleanState(JSON.parse(raw)); if (s) state = s; } catch (e) { /* corrupt: start fresh */ }
    }
    function save() {
        if (!canSave) return;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canSave = false; $('store-warn').hidden = false; }
    }
    function change(fn, where, text) {
        const before = JSON.stringify(state);
        fn();
        save();
        undoSnap = before;
        flash = { where, text, undo: true };
        render();
    }
    function undo() {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap));
        if (s) state = s;
        const where = flash && flash.where && $(flash.where) ? flash.where : 'add-msg';
        undoSnap = null; panel = null;
        save();
        flash = { where, text: 'Undone.' };
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    function svg(tag, attrs) { const e = document.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach(k => e.setAttribute(k, attrs[k])); return e; }
    const byId = id => state.children.find(x => x.id === id);
    const msgId = id => 'msg-' + id;
    const outText = h => C.marks(h).replace(/,/g, '');
    function showMsg(where, text, withUndo, bad) {
        const box = typeof where === 'string' ? $(where) : where;
        if (!box) return;
        box.textContent = '';
        box.className = 'msg show' + (bad ? ' bad' : '');
        box.appendChild(document.createTextNode(text + ' '));
        if (withUndo) box.appendChild(btn('Undo', 'link inline undo', undo));
    }
    function say(where, text, bad) { flash = { where, text, bad }; render(); }
    function copyText(text, where) {
        const done = () => say(where, 'Copied. Paste it into a message.');
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
            if (ok) done(); else say(where, 'Could not copy here. Use Share instead.', true);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function setErr(input, box, msg) {
        if (box) box.textContent = msg || '';
        if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
        return !msg;
    }
    function textInput(id, val, ph, max, mode) {
        const i = el('input'); i.type = 'text'; i.id = id; i.value = val || ''; i.autocomplete = 'off'; i.maxLength = max || 40;
        if (ph) i.placeholder = ph; if (mode) i.inputMode = mode; return i;
    }
    function labelled(parent, id, text, input) { const l = el('label', '', text); l.htmlFor = id; parent.appendChild(l); parent.appendChild(input); return input; }

    // ---------- add a child ----------
    function subsChips() {
        const have = new Set(C.splitSubjects($('c-subs').value).map(C.key));
        $('c-subs-quick').querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', have.has(C.key(c.textContent)) ? 'true' : 'false'));
    }
    function toggleSub(name) {
        const list = C.splitSubjects($('c-subs').value), k = C.key(name), i = list.findIndex(s => C.key(s) === k);
        if (i >= 0) list.splice(i, 1); else list.push(name);
        $('c-subs').value = list.join(', ');
        subsChips();
    }
    function addChild() {
        const name = C.tidy($('c-name').value, 40), err = $('c-name-err');
        if (!setErr($('c-name'), err, name ? '' : "Type your child's name.")) { $('c-name').focus(); return; }
        if (state.children.some(c => C.key(c.name) === C.key(name))) { setErr($('c-name'), err, 'You already have a child called ' + name + '. Add a surname or initial.'); $('c-name').focus(); return; }
        if (state.children.length >= 30) { setErr($('c-name'), err, 'You can add up to 30 children.'); return; }
        const c = C.cleanChild({ name, cls: $('c-cls').value, subjects: C.splitSubjects($('c-subs').value), exams: [] });
        $('c-name').value = ''; $('c-cls').value = ''; $('c-subs').value = ''; subsChips();
        $('c-cls-box').hidden = true; $('c-cls-open').hidden = false;
        change(() => { state.children.push(c); }, msgId(c.id), name + ' added. Tap Add a result after the next test or report card.');
        const box = $('child-' + c.id); if (box) box.focus();
    }

    // ---------- the result form (inside a child's box) ----------
    function rowFor(child, subject, res, isNew, outH) {
        const n = ++rowSeq, row = el('div', 'r-row'), head = el('div', 'r-head');
        row.dataset.subject = subject || '';
        if (isNew) {
            const lab = el('label', '', 'Subject'); lab.htmlFor = 'rs-' + n; lab.style.margin = '0 0 .3rem';
            row.appendChild(lab);
            const inp = textInput('rs-' + n, subject, 'e.g. Art', 30); inp.className = 'r-sname';
            head.appendChild(inp);
            head.appendChild(btn('Remove', 'link', () => row.remove(), 'Remove this subject from the form'));
        } else {
            head.appendChild(el('p', 'r-subj', subject));
        }
        row.appendChild(head);
        const last = !res && subject ? C.series(child, subject, state.grades).pop() : null;
        const mode = res ? (res.absent ? 'absent' : res.grade != null ? 'grade' : 'marks') : (last && last.r.grade != null ? 'grade' : 'marks');
        const seg = el('div', 'seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', (subject || 'New subject') + ': how the result was given');
        [['marks', 'Marks'], ['grade', 'Grade'], ['absent', 'Absent']].forEach(([v, t]) => {
            const l = el('label', 'seg-b'), r = el('input'); r.type = 'radio'; r.name = 'rm-' + n; r.value = v; r.checked = v === mode;
            l.appendChild(r); l.appendChild(el('span', '', t)); seg.appendChild(l);
            r.addEventListener('change', () => showMode());
        });
        row.appendChild(seg);
        const mbox = el('div', 'two');
        const g1 = el('div', 'field'), g2 = el('div', 'field');
        const got = labelled(g1, 'rg-' + n, 'Marks', textInput('rg-' + n, res && res.got != null ? C.marks(res.got) : '', '', 12, 'decimal')); got.className = 'r-got';
        const out = labelled(g2, 'ro-' + n, 'Out of', textInput('ro-' + n, outText(res && res.out != null ? res.out : outH), '', 12, 'decimal')); out.className = 'r-out';
        got.setAttribute('aria-label', (subject || 'New subject') + ' marks'); out.setAttribute('aria-label', (subject || 'New subject') + ' out of');
        mbox.appendChild(g1); mbox.appendChild(g2); row.appendChild(mbox);
        const gbox = el('div', 'field'), gsel = el('select'); gsel.id = 'rgr-' + n; gsel.className = 'r-grade';
        gsel.appendChild(Object.assign(el('option', '', 'Choose the grade'), { value: '' }));
        state.grades.forEach(g => { const o = el('option', '', g.g); o.value = g.g; gsel.appendChild(o); });
        if (res && res.grade != null) {
            if (!C.gradeOf(state.grades, res.grade)) { const o = el('option', '', res.grade); o.value = res.grade; gsel.appendChild(o); }
            gsel.value = (C.gradeOf(state.grades, res.grade) || { g: res.grade }).g;
        }
        labelled(gbox, gsel.id, 'Grade', gsel); row.appendChild(gbox);
        const live = el('p', 'r-pct'); live.setAttribute('aria-live', 'polite'); row.appendChild(live);
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); err.className = 'err r-err'; row.appendChild(err);
        function showMode() {
            const m = seg.querySelector('input:checked').value;
            mbox.hidden = m !== 'marks'; gbox.hidden = m !== 'grade';
            preview();
        }
        function preview() {
            const m = seg.querySelector('input:checked').value;
            live.textContent = '';
            if (m === 'absent') { live.textContent = 'Not counted as zero.'; return; }
            if (m !== 'marks') return;
            const g = C.parseMarks(got.value);
            if (g.blank || g.error) return;
            const o = g.out != null ? { out: g.out } : C.parseOut(out.value);
            if (o.error || g.got > o.out) return;
            live.textContent = '= ' + C.pct(C.pctOf(g.got, o.out));
        }
        got.addEventListener('input', () => { setErr(got, err, ''); row.classList.remove('bad'); preview(); });
        out.addEventListener('input', () => { setErr(out, err, ''); row.classList.remove('bad'); out.dataset.edited = '1'; preview(); });
        showMode();
        return row;
    }
    function resultPanel(child, ex) {
        const p = el('div', 'panel'), pre = 'rf-' + child.id;
        p.id = 'panel-' + child.id;
        p.appendChild(el('h3', '', ex ? 'Edit ' + ex.name + ' for ' + child.name : 'Add a result for ' + child.name));
        const name = labelled(p, pre + '-name', 'Test or exam name', textInput(pre + '-name', ex ? ex.name : '', 'e.g. Term 1', 40));
        const nameErr = el('p', 'err'); nameErr.setAttribute('role', 'alert'); p.appendChild(nameErr);
        const q = el('div', 'quick'); q.setAttribute('role', 'group'); q.setAttribute('aria-label', 'Common test names');
        TESTS.forEach(t => q.appendChild(btn(t, 'chip', () => { name.value = t; setErr(name, nameErr, ''); })));
        p.appendChild(q);
        const date = el('input'); date.type = 'date'; date.id = pre + '-date'; date.value = ex ? ex.date : today; date.max = today;
        labelled(p, date.id, 'Date', date);
        const dateErr = el('p', 'err'); dateErr.setAttribute('role', 'alert'); p.appendChild(dateErr);
        const outAll = labelled(p, pre + '-out', 'Every subject is out of', textInput(pre + '-out', outText(child.out), 'e.g. 100', 12, 'decimal'));
        const outErr = el('p', 'err'); outErr.setAttribute('role', 'alert'); p.appendChild(outErr);
        const oq = el('div', 'quick'); oq.setAttribute('role', 'group'); oq.setAttribute('aria-label', 'Common totals');
        [25, 50, 100].forEach(n => oq.appendChild(btn(String(n), 'chip', () => { outAll.value = String(n); applyOut(); }, 'Every subject out of ' + n)));
        p.appendChild(oq);
        let lastOut = outAll.value;
        function applyOut() {
            p.querySelectorAll('.r-out').forEach(o => { if (!o.dataset.edited || o.value.trim() === lastOut.trim() || !o.value.trim()) { o.value = outAll.value.trim(); delete o.dataset.edited; o.dispatchEvent(new Event('input')); delete o.dataset.edited; } });
            lastOut = outAll.value;
            setErr(outAll, outErr, '');
        }
        outAll.addEventListener('input', applyOut);
        p.appendChild(el('h3', '', 'Results for each subject'));
        p.appendChild(el('p', 'hint top', 'Leave a subject blank if it was not in this test. You can type 31/50 in Marks.'));
        const rows = el('div', 'r-rows'); p.appendChild(rows);
        const ks = new Set(), outH = C.parseOut(outAll.value).out || 10000;
        child.subjects.forEach(s => { ks.add(C.key(s)); rows.appendChild(rowFor(child, s, ex && ex.results.find(r => C.key(r.s) === C.key(s)), false, outH)); });
        if (ex) ex.results.forEach(r => { if (!ks.has(C.key(r.s))) { ks.add(C.key(r.s)); rows.appendChild(rowFor(child, r.s, r, false, outH)); } });
        if (!rows.children.length) rows.appendChild(rowFor(child, '', null, true, outH));
        p.appendChild(btn('+ Add a subject', 'link', () => {
            const r = rowFor(child, '', null, true, C.parseOut(outAll.value).out || 10000); rows.appendChild(r); r.querySelector('input').focus();
        }));
        const posOpen = btn('+ Add position in class (optional)', 'link', () => { posBox.hidden = false; posOpen.hidden = true; pos.focus(); });
        p.appendChild(posOpen);
        const posBox = el('div', 'two'), pa = el('div', 'field'), pb = el('div', 'field');
        const pos = labelled(pa, pre + '-pos', 'Position', textInput(pre + '-pos', ex && ex.pos ? String(ex.pos) : '', 'e.g. 5', 6, 'numeric'));
        const posOf = labelled(pb, pre + '-posof', 'Out of (students)', textInput(pre + '-posof', ex && ex.posOf ? String(ex.posOf) : '', 'e.g. 32', 6, 'numeric'));
        posBox.appendChild(pa); posBox.appendChild(pb); p.appendChild(posBox);
        const posErr = el('p', 'err'); posErr.setAttribute('role', 'alert'); p.appendChild(posErr);
        posBox.hidden = !(ex && ex.pos); posOpen.hidden = !posBox.hidden;
        const bs = el('div', 'row-btns');
        bs.appendChild(btn(ex ? 'Save changes' : 'Save result', 'primary', () => saveResult(child, ex, p)));
        bs.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); focusChild(child.id); }));
        p.appendChild(bs);
        const allErr = el('p', 'err'); allErr.id = pre + '-err'; allErr.setAttribute('role', 'alert'); p.appendChild(allErr);
        p.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); saveResult(child, ex, p); } });
        p._f = { name, nameErr, date, dateErr, outAll, outErr, rows, pos, posOf, posErr, allErr };
        return p;
    }
    function saveResult(child, ex, p) {
        const f = p._f;
        let ok = true, firstBad = null;
        const bad = (input) => { ok = false; if (!firstBad) firstBad = input; };
        Object.values(f).forEach(x => { if (x && x.classList && x.classList.contains('err')) x.textContent = ''; });
        const name = C.tidy(f.name.value, 40);
        if (!setErr(f.name, f.nameErr, name ? '' : 'Type a name for the test, or tap one below.')) bad(f.name);
        const date = f.date.value;
        if (!C.isDay(date)) { setErr(f.date, f.dateErr, 'Pick the date of the test.'); bad(f.date); }
        else if (date > today) { setErr(f.date, f.dateErr, 'The date cannot be after today.'); bad(f.date); }
        else setErr(f.date, f.dateErr, '');
        const outAll = C.parseOut(f.outAll.value);
        const results = [], skipped = [], seen = new Set(), newSubs = [];
        f.rows.querySelectorAll('.r-row').forEach(row => {
            const err = row.querySelector('.r-err'), sIn = row.querySelector('.r-sname');
            const mode = row.querySelector('.seg input:checked').value;
            const got = row.querySelector('.r-got'), out = row.querySelector('.r-out'), gsel = row.querySelector('.r-grade');
            setErr(got, err, ''); setErr(out, null, ''); if (sIn) setErr(sIn, null, ''); row.classList.remove('bad');
            const fail = (input, msg) => { setErr(input, err, msg); row.classList.add('bad'); bad(input); };
            let subject = sIn ? C.tidy(sIn.value, 30) : row.dataset.subject;
            const blank = mode === 'marks' ? !got.value.trim() : mode === 'grade' ? !gsel.value : false;
            if (sIn && !subject) { if (!blank) fail(sIn, 'Type the subject name.'); return; }
            if (blank) { if (subject) skipped.push(subject); return; }
            if (seen.has(C.key(subject))) { fail(sIn || got, subject + ' is in the list twice.'); return; }
            if (sIn) { const known = child.subjects.find(s => C.key(s) === C.key(subject)); if (known) subject = known; else newSubs.push(subject); }
            seen.add(C.key(subject));
            if (mode === 'absent') { results.push({ s: subject, absent: true }); return; }
            if (mode === 'grade') { results.push({ s: subject, grade: gsel.value }); return; }
            const g = C.parseMarks(got.value);
            if (g.error) { fail(got, g.error); return; }
            let o = g.out;
            if (o == null) { const po = C.parseOut(out.value); if (po.error) { fail(out, po.error); return; } o = po.out; }
            else if (o <= 0 || o > C.MAXOUT) { fail(got, 'The total must be between 1 and 10,000.'); return; }
            if (g.got > o) { fail(got, 'Marks are more than the total (' + C.marks(o) + '). Check the marks or the Out of box.'); return; }
            results.push({ s: subject, got: g.got, out: o });
        });
        let pos = null, posOf = null;
        const pt = f.pos.value.trim(), pot = f.posOf.value.trim();
        if (pt || pot) {
            pos = /^\d{1,6}$/.test(pt) ? +pt : NaN; posOf = pot ? (/^\d{1,6}$/.test(pot) ? +pot : NaN) : null;
            if (!(pos >= 1)) { setErr(f.pos, f.posErr, 'Type the position as a whole number, such as 5.'); bad(f.pos); }
            else if (posOf != null && !(posOf >= pos)) { setErr(f.posOf, f.posErr, 'The number of students must be at least the position.'); bad(f.posOf); }
            else { setErr(f.pos, f.posErr, ''); setErr(f.posOf, null, ''); }
        }
        if (ok && !results.length) { f.allErr.textContent = 'Type the marks for at least one subject, or pick Grade or Absent.'; ok = false; const g = f.rows.querySelector('input'); if (g) firstBad = g; }
        if (!ok) { if (firstBad) firstBad.focus(); return; }
        const exam = { id: ex ? ex.id : C.newId(), name, date, at: ex ? ex.at : Date.now(), cls: ex ? ex.cls : child.cls, results };
        if (pos) { exam.pos = pos; if (posOf) exam.posOf = posOf; }
        const clean = C.cleanExam(exam);
        const note = skipped.length ? ' ' + skipped.join(', ') + (skipped.length === 1 ? ' was' : ' were') + ' left blank and not counted.' : '';
        panel = null;
        change(() => {
            const c = byId(child.id); if (!c) return;
            newSubs.forEach(s => c.subjects.push(s));
            if (!outAll.error) c.out = outAll.out;
            if (ex) { const i = c.exams.findIndex(e => e.id === ex.id); if (i >= 0) c.exams[i] = clean; else c.exams.push(clean); }
            else c.exams.push(clean);
        }, msgId(child.id), (ex ? 'Saved changes to ' : 'Saved ') + name + ': ' + C.plural(results.length, 'subject') + '.' + note);
        focusChild(child.id);
    }

    // ---------- edit a child ----------
    function editPanel(child) {
        const p = el('div', 'panel'), pre = 'ef-' + child.id;
        p.id = 'panel-' + child.id;
        p.appendChild(el('h3', '', 'Edit ' + child.name));
        const name = labelled(p, pre + '-name', "Child's name", textInput(pre + '-name', child.name, '', 40));
        const nameErr = el('p', 'err'); nameErr.setAttribute('role', 'alert'); p.appendChild(nameErr);
        const cls = labelled(p, pre + '-cls', 'Class or year (optional)', textInput(pre + '-cls', child.cls, 'e.g. Class 6', 30));
        p.appendChild(el('p', 'hint', 'New school year? Change the class. Old results keep the class they were in.'));
        p.appendChild(el('p', 'legend-like', 'Subjects'));
        const list = el('div', 'sub-list'); p.appendChild(list);
        function addRow(s) {
            const n = ++rowSeq, r = el('div', 'sub-row'), i = textInput('es-' + n, s, 'e.g. Art', 30);
            i.dataset.orig = s || ''; i.setAttribute('aria-label', s ? 'Subject: ' + s : 'New subject');
            r.appendChild(i); r.appendChild(btn('Remove', 'secondary small', () => r.remove(), 'Remove ' + (s || 'this subject')));
            list.appendChild(r); return i;
        }
        child.subjects.forEach(addRow);
        p.appendChild(btn('+ Add a subject', 'link', () => addRow('').focus()));
        p.appendChild(el('p', 'hint', 'Removing a subject keeps its old results in All results. Renaming it renames it in every result.'));
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); p.appendChild(err);
        const bs = el('div', 'row-btns');
        bs.appendChild(btn('Save changes', 'primary', () => {
            const nm = C.tidy(name.value, 40);
            if (!setErr(name, nameErr, nm ? '' : "Type your child's name.")) { name.focus(); return; }
            if (state.children.some(c => c.id !== child.id && C.key(c.name) === C.key(nm))) { setErr(name, nameErr, 'You already have a child called ' + nm + '.'); name.focus(); return; }
            const subs = [], renames = [], ks = new Set();
            for (const i of list.querySelectorAll('input')) {
                const t = C.tidy(i.value, 30); if (!t) continue;
                if (ks.has(C.key(t))) { err.textContent = t + ' is in the list twice.'; i.focus(); return; }
                ks.add(C.key(t)); subs.push(t);
                if (i.dataset.orig && i.dataset.orig !== t) renames.push([i.dataset.orig, t]);
            }
            panel = null;
            change(() => {
                const c = byId(child.id); if (!c) return;
                c.name = nm; c.cls = C.tidy(cls.value, 30); c.subjects = subs;
                renames.forEach(([a, b]) => c.exams.forEach(e => {
                    if (e.results.some(r => C.key(r.s) === C.key(b)) && C.key(a) !== C.key(b)) return;
                    e.results.forEach(r => { if (C.key(r.s) === C.key(a)) r.s = b; });
                }));
            }, msgId(child.id), 'Saved changes to ' + nm + '.');
            focusChild(child.id);
        }));
        bs.appendChild(btn('Cancel', 'secondary', () => { panel = null; render(); focusChild(child.id); }));
        p.appendChild(bs);
        return p;
    }

    // ---------- charts ----------
    function spark(points) {
        const w = 72, h = 30, s = svg('svg', { class: 'spark', viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': 'true', focusable: 'false' });
        const xs = i => points.length === 1 ? w / 2 : 3 + i * (w - 6) / (points.length - 1), ys = v => h - 3 - v / 1000 * (h - 6);
        s.appendChild(svg('path', { d: points.map((v, i) => (i ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(v).toFixed(1)).join(' ') }));
        s.appendChild(svg('circle', { cx: xs(points.length - 1).toFixed(1), cy: ys(points[points.length - 1]).toFixed(1), r: 3 }));
        return s;
    }
    function overallChart(child, a) {
        const wrap = el('div', 'chart'), id = 'ch-' + child.id;
        const h3 = el('h3', '', 'Overall over time'); h3.id = id; wrap.appendChild(h3);
        const box = el('div', 'chart-box'); wrap.appendChild(box);
        // drawn at the width it is shown at, so text stays the same size on phones and laptops
        const W = chartWidth(), H = W > 480 ? 180 : 150, L = 34, R = 14, T = 18, B = 26, pts = a.ov;
        const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'group', 'aria-labelledby': id });
        [0, 50, 100].forEach(v => {
            const y = T + (1 - v / 100) * (H - T - B);
            s.appendChild(svg('line', { class: 'grid', x1: L, x2: W - R, y1: y, y2: y }));
            const t = svg('text', { class: 'axis', x: L - 6, y: y + 4, 'text-anchor': 'end' }); t.textContent = v + '%'; s.appendChild(t);
        });
        const xs = i => pts.length === 1 ? (L + W - R) / 2 : L + 8 + i * (W - R - L - 16) / (pts.length - 1), ys = p => T + (1 - p / 1000) * (H - T - B);
        s.appendChild(svg('path', { class: 'line', d: pts.map((x, i) => (i ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(x.o.p).toFixed(1)).join(' ') }));
        const every = pts.length <= 6 ? 1 : Math.ceil(pts.length / 5);
        const tip = el('div', 'tip'); tip.hidden = true; box.appendChild(tip);
        pts.forEach((x, i) => {
            const cx = xs(i), cy = ys(x.o.p), label = C.examLabel(child, x.ex) + ', ' + C.niceDate(x.ex.date) + ': ' + C.pct(x.o.p);
            if (i % every === 0 || i === pts.length - 1) {
                const t = svg('text', { class: 'axis', x: cx, y: H - 8, 'text-anchor': pts.length === 1 ? 'middle' : i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle' });
                t.textContent = C.shortDate(x.ex.date); s.appendChild(t);
            }
            const hit = svg('circle', { class: 'hit', cx, cy, r: 14, tabindex: '0', role: 'img', 'aria-label': label });
            const dot = svg('circle', { class: 'dot', cx, cy, r: 4.5 });
            const show = () => {
                s.querySelectorAll('.dot.on').forEach(d => d.classList.remove('on')); dot.classList.add('on');
                tip.textContent = C.examLabel(child, x.ex) + ': ' + C.pct(x.o.p); tip.hidden = false;
                const r = s.getBoundingClientRect(), k = r.width / W;
                let left = cx * k; const half = Math.min(tip.offsetWidth / 2, r.width / 2);
                left = Math.max(half, Math.min(r.width - half, left));
                tip.style.left = left + 'px'; tip.style.top = cy * k + 'px';
            };
            const hide = () => { tip.hidden = true; dot.classList.remove('on'); };
            hit.addEventListener('pointerenter', show); hit.addEventListener('pointerdown', show); hit.addEventListener('focus', show);
            hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
            s.appendChild(hit); s.appendChild(dot);
            if (i === pts.length - 1) {
                const t = svg('text', { class: 'axis', x: cx, y: cy - 9, 'text-anchor': pts.length === 1 ? 'middle' : 'end', 'font-weight': '700' }); t.textContent = C.pct(x.o.p); s.appendChild(t);
            }
        });
        box.appendChild(s);
        return wrap;
    }

    // ---------- each child's box ----------
    function changeSpan(c) {
        const sp = el('span', 's-chg ' + (c > 0 ? 'up' : c < 0 ? 'down' : 'same'), c > 0 ? '▲ ' + C.pts(c) : c < 0 ? '▼ ' + C.pts(c) : '= same');
        sp.setAttribute('aria-label', C.changeText(c) + (c ? ' points' : ''));
        return sp;
    }
    function renderChild(child) {
        const a = C.analyse(child, state), box = el('article', 'item');
        box.id = 'child-' + child.id; box.tabIndex = -1; box.setAttribute('aria-labelledby', 'cn-' + child.id);
        const top = el('div', 'i-top'), h = el('h2', 'i-name', child.name); h.id = 'cn-' + child.id;
        top.appendChild(h); if (child.cls) top.appendChild(el('span', 'tag', child.cls));
        box.appendChild(top);
        const last = a.exams[a.exams.length - 1];
        if (!last) {
            box.appendChild(el('p', 'i-empty', child.subjects.length ? 'No results yet. Subjects: ' + child.subjects.join(', ') + '. Tap Add a result after the next test or report card.' : 'No results yet. Tap Add a result after the next test or report card.'));
        } else {
            box.appendChild(el('p', 'i-latest', 'Latest: ' + C.examLabel(child, last) + ' · ' + C.niceDate(last.date) + (last.cls && last.cls !== child.cls ? ' · ' + last.cls : '') + (last.pos ? ' · ' + C.positionText(last) : '')));
            const o = C.overall(last, state.grades);
            if (o) {
                box.appendChild(el('p', 'i-big', (o.fromGrades ? 'About ' : '') + C.pct(o.p) + ' overall'));
                if (!o.fromGrades) box.appendChild(el('p', 'i-latest', C.marks(o.got) + ' out of ' + C.marks(o.out) + ' marks' + (o.mixed ? ' (subjects with marks)' : '') + (o.absent ? ' · absent in ' + C.plural(o.absent, 'subject') : '')));
                else box.appendChild(el('p', 'i-latest', 'Worked out from the grades.'));
                const prev = a.ov.filter(x => x.ex !== last).pop();
                if (prev && a.lastOv && a.lastOv.ex === last) {
                    const c = o.p - prev.o.p;
                    box.appendChild(el('p', 'i-change ' + (c > 0 ? 'up' : c < 0 ? 'down' : 'same'), c === 0 ? 'Same as ' + C.examLabel(child, prev.ex) + ' (' + C.pct(prev.o.p) + ')' : (c > 0 ? '▲ Up ' : '▼ Down ') + C.pts(c) + ' from ' + C.pct(prev.o.p) + ' in ' + C.examLabel(child, prev.ex)));
                }
            } else box.appendChild(el('p', 'i-big', 'Absent'));
            if (a.attention.length) {
                const at = el('div', 'att'); at.appendChild(el('h3', '', 'Needs attention'));
                const ul = el('ul'); a.attention.forEach(s => ul.appendChild(el('li', '', C.attentionText(s, state)))); at.appendChild(ul);
                box.appendChild(at);
            }
            if (a.best || a.improved) {
                const w = el('div', 'wins'), ul = el('ul');
                w.appendChild(el('h3', '', 'Doing well'));
                if (a.best) ul.appendChild(el('li', '', 'Best subject: ' + a.best.name + ' ' + (a.best.last.r.grade != null ? 'grade ' + a.best.last.r.grade : C.pct(a.best.last.p))));
                if (a.improved) ul.appendChild(el('li', '', 'Most improved: ' + a.improved.name + ', up ' + C.pts(a.improved.change) + ' to ' + C.pct(a.improved.last.p)));
                if (a.weakest && !a.attention.includes(a.weakest)) ul.appendChild(el('li', '', 'Lowest now: ' + a.weakest.name + ' ' + C.pct(a.weakest.last.p)));
                w.appendChild(ul); box.appendChild(w);
            }
            if (a.ov.length >= 2) box.appendChild(overallChart(child, a));
            const sl = el('div', 's-list'); sl.setAttribute('role', 'list'); sl.setAttribute('aria-label', child.name + "'s subjects");
            a.subs.forEach(s => {
                const r = el('div', 's-row' + (s.flags.length ? ' flag' : '')); r.setAttribute('role', 'listitem');
                const l = el('div', ''); l.style.minWidth = '0';
                l.appendChild(el('p', 's-name', s.name));
                let sub;
                if (!s.last) sub = s.absentLast ? 'Absent in ' + C.examLabel(child, s.all[s.all.length - 1].ex) : 'No result yet';
                else {
                    sub = (s.last.r.grade != null ? 'Grade ' + s.last.r.grade + ' in ' : C.marks(s.last.r.got) + '/' + C.marks(s.last.r.out) + ' in ') + C.examLabel(child, s.last.ex);
                    if (s.prev) sub += s.change === 0 ? ', same as before' : ', ' + (s.change > 0 ? 'up' : 'down') + ' from ' + (s.prev.r.grade != null ? s.prev.r.grade : C.pct(s.prev.p));
                    if (s.absentLast) sub += ' · absent in ' + C.examLabel(child, s.all[s.all.length - 1].ex);
                }
                l.appendChild(el('p', 's-sub', sub));
                r.appendChild(l);
                const rr = el('div', 's-r');
                if (s.have.length >= 2) rr.appendChild(spark(s.have.map(x => x.p)));
                const pc = el('p', 's-pct', s.last ? (s.last.r.grade != null ? s.last.r.grade : C.pct(s.last.p)) : '–');
                if (s.change != null) pc.appendChild(changeSpan(s.change));
                rr.appendChild(pc); r.appendChild(rr);
                sl.appendChild(r);
            });
            if (a.subs.length) box.appendChild(sl);
        }
        const acts = el('div', 'i-acts');
        acts.appendChild(btn('Add a result', 'primary', () => { panel = { id: child.id, what: 'result' }; render(); focusPanel(child.id); }, 'Add a result for ' + child.name));
        if (last) acts.appendChild(btn('Copy summary', 'secondary', () => copyText(C.summaryText(byId(child.id), state), msgId(child.id)), 'Copy summary for ' + child.name));
        if (last && navigator.share) acts.appendChild(btn('Share', 'secondary', () => { navigator.share({ title: child.name + ': exam results', text: C.summaryText(byId(child.id), state) }).catch(() => {}); }, 'Share summary for ' + child.name));
        acts.appendChild(btn('Edit child', 'secondary', () => { panel = { id: child.id, what: 'edit' }; render(); focusPanel(child.id); }, 'Edit ' + child.name));
        acts.appendChild(btn('Delete child', 'secondary danger-t', () => {
            panel = null;
            change(() => { state.children = state.children.filter(c => c.id !== child.id); }, 'add-msg', child.name + ' and ' + C.plural(child.exams.length, 'result') + ' deleted.');
        }, 'Delete ' + child.name));
        box.appendChild(acts);
        if (panel && panel.id === child.id) {
            if (panel.what === 'edit') box.appendChild(editPanel(child));
            else box.appendChild(resultPanel(child, panel.exId ? child.exams.find(e => e.id === panel.exId) : null));
        }
        const m = el('div', 'msg'); m.id = msgId(child.id); m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite'); box.appendChild(m);
        if (a.exams.length) {
            const d = el('details', 'hist'); d.id = 'hist-' + child.id; if (openHist.has(child.id)) d.open = true;
            d.addEventListener('toggle', () => { if (d.open) openHist.add(child.id); else openHist.delete(child.id); });
            d.appendChild(el('summary', '', 'All results (' + a.exams.length + ')'));
            const list = el('div', 'ex-list');
            a.exams.slice().reverse().forEach(ex => {
                const e = el('div', 'ex'), t = el('div', 'ex-top');
                t.appendChild(el('p', 'ex-name', ex.name)); t.appendChild(el('p', 'ex-date', C.niceDate(ex.date) + (ex.cls ? ' · ' + ex.cls : '')));
                e.appendChild(t);
                const o = C.overall(ex, state.grades);
                e.appendChild(el('p', 'ex-ov', 'Overall: ' + C.overallText(o) + (ex.pos ? ' · ' + C.positionText(ex) : '')));
                const ul = el('ul', 'ex-res');
                ex.results.forEach(r => { const li = el('li'); const p = C.resultPct(r, state.grades); li.appendChild(el('span', '', r.s)); li.appendChild(el('span', '', C.resultText(r) + (p != null && r.grade == null ? ' = ' + C.pct(p) : ''))); ul.appendChild(li); });
                e.appendChild(ul);
                const b = el('div', 'ex-btns');
                b.appendChild(btn('Edit', 'secondary small', () => { panel = { id: child.id, what: 'result', exId: ex.id }; render(); focusPanel(child.id); }, 'Edit ' + ex.name + ', ' + C.niceDate(ex.date)));
                b.appendChild(btn('Delete', 'secondary small danger-t', () => {
                    panel = null;
                    change(() => { const c = byId(child.id); c.exams = c.exams.filter(x => x.id !== ex.id); }, msgId(child.id), ex.name + ' (' + C.niceDate(ex.date) + ') deleted.');
                }, 'Delete ' + ex.name + ', ' + C.niceDate(ex.date)));
                e.appendChild(b); list.appendChild(e);
            });
            d.appendChild(list); box.appendChild(d);
        }
        return box;
    }
    const openHist = new Set();
    let drawnAt = 0;
    function chartWidth() {
        const list = $('i-list'), w = list.clientWidth || Math.min(innerWidth, 560) - 32;
        drawnAt = innerWidth;
        return Math.max(240, Math.min(720, Math.round(w - (innerWidth <= 400 ? 28 : 38))));
    }
    function focusPanel(id) { const p = $('panel-' + id); if (p) { const i = p.querySelector('input'); if (i) i.focus(); p.scrollIntoView({ block: 'nearest' }); } }
    function focusChild(id) { const b = $('child-' + id); if (b) b.focus({ preventScroll: false }); }

    // ---------- settings ----------
    function fillSettings() {
        const fb = $('flag-below'), fd = $('flag-drop');
        fb.textContent = ''; fd.textContent = '';
        const below = C.FLAG_BELOW.slice(); if (!below.includes(state.flagBelow)) below.push(state.flagBelow); below.sort((x, y) => x - y);
        below.forEach(v => { const o = el('option', '', C.pct(v) + (v === 330 ? ' (pass mark in many schools)' : '')); o.value = v; fb.appendChild(o); });
        const drop = C.FLAG_DROP.slice(); if (!drop.includes(state.flagDrop)) drop.push(state.flagDrop); drop.sort((x, y) => x - y);
        drop.forEach(v => { const o = el('option', '', C.pts(v) + ' points or more'); o.value = v; fd.appendChild(o); });
        [fb, fd].forEach(s => { const o = el('option', '', 'Other…'); o.value = 'other'; s.appendChild(o); });
        fb.value = $('fb-other').hidden ? String(state.flagBelow) : 'other'; fd.value = $('fd-other').hidden ? String(state.flagDrop) : 'other';
    }
    // "Other…" in a select shows a small box to type any value
    function other(which, lo, hi, apply) {
        const v = C.num($(which + '-v').value.trim().replace('%', ''));
        if (v == null || Number.isNaN(v) || v / 100 < lo || v / 100 > hi) { setErr($(which + '-v'), $(which + '-err'), 'Type a number from ' + lo + ' to ' + hi + '.'); $(which + '-v').focus(); return; }
        $(which).hidden = true; $(which + '-v').value = '';
        apply(Math.round(v / 10));
    }
    function addGradeRow(g) {
        const n = ++rowSeq, r = el('div', 'g-row'), a = el('div', 'field'), b = el('div', 'field');
        labelled(a, 'gn-' + n, 'Grade', textInput('gn-' + n, g.g, 'e.g. B', 6)).className = 'g-name';
        labelled(b, 'gp-' + n, 'Counts as %', textInput('gp-' + n, g.p == null ? '' : C.pct(g.p).replace('%', ''), 'e.g. 65', 5, 'decimal')).className = 'g-pct';
        r.appendChild(a); r.appendChild(b);
        r.appendChild(btn('Remove', 'secondary small', () => r.remove(), 'Remove grade ' + (g.g || '')));
        $('g-list').appendChild(r);
        return r;
    }
    function gradeRows(list) { $('g-list').textContent = ''; list.forEach(addGradeRow); }
    function saveGrades() {
        const out = [], ks = new Set(), err = $('g-err');
        err.textContent = '';
        for (const r of $('g-list').querySelectorAll('.g-row')) {
            const g = C.tidy(r.querySelector('.g-name').value, 6), pt = r.querySelector('.g-pct').value.trim().replace('%', '');
            if (!g && !pt) continue;
            if (!g) { err.textContent = 'Type a name for each grade, or remove the row.'; r.querySelector('.g-name').focus(); return; }
            if (ks.has(C.key(g))) { err.textContent = 'Grade ' + g + ' is in the list twice.'; return; }
            const v = C.num(pt);
            if (v == null || Number.isNaN(v) || v > 10000) { err.textContent = 'Type what grade ' + g + ' counts as, from 0 to 100.'; r.querySelector('.g-pct').focus(); return; }
            ks.add(C.key(g)); out.push({ g, p: Math.round(v / 10) });
        }
        if (!out.length) { err.textContent = 'Keep at least one grade.'; return; }
        for (const c of state.children) for (const e of c.exams) for (const r of e.results) {
            if (r.grade != null && !ks.has(C.key(r.grade))) { err.textContent = 'Grade ' + r.grade + ' is used in ' + c.name + "'s " + e.name + '. Keep it, or edit that result first.'; return; }
        }
        $('grades-box').hidden = true; $('grades-open').hidden = false;
        change(() => { state.grades = out; }, 'tools-msg', 'Grades saved: ' + out.map(g => g.g + ' ' + C.pct(g.p)).join(', ') + '.');
    }

    // ---------- page ----------
    function render() {
        const list = $('i-list');
        list.textContent = '';
        $('items').hidden = !state.children.length;
        state.children.forEach(c => list.appendChild(renderChild(c)));
        $('add-h').textContent = state.children.length ? 'Add another child' : 'Add a child';
        $('add-intro').hidden = state.children.length > 0;
        $('restore-first').hidden = state.children.length > 0;
        $('c-save').textContent = 'Add child';
        fillSettings();
        $('store-warn').hidden = canSave;
        if (flash) { showMsg(flash.where, flash.text, flash.undo, flash.bad); flash = null; }
    }
    function backup() {
        const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = SLUG + '-' + today + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        say('tools-msg', 'Backup file saved to your downloads.');
    }
    function restore(file) {
        const rd = new FileReader();
        rd.onload = () => {
            let s = null;
            try { s = C.cleanState(JSON.parse(rd.result)); } catch (e) { s = null; }
            if (!s) { say('tools-msg', 'That file is not a backup from this app.', true); return; }
            panel = null;
            change(() => { state = s; }, 'tools-msg', 'Backup restored: ' + C.plural(s.children.length, 'child', 'children') + '.');
        };
        rd.onerror = () => say('tools-msg', 'Could not read that file.', true);
        rd.readAsText(file);
    }
    function init() {
        SUBJECTS.forEach(s => $('c-subs-quick').appendChild(btn(s, 'chip', () => toggleSub(s))));
        subsChips();
        load();
        try { localStorage.setItem(SLUG + '.test', '1'); localStorage.removeItem(SLUG + '.test'); } catch (e) { canSave = false; }
        $('c-subs').addEventListener('input', subsChips);
        $('c-name').addEventListener('input', () => setErr($('c-name'), $('c-name-err'), ''));
        $('c-cls-open').addEventListener('click', () => { $('c-cls-box').hidden = false; $('c-cls-open').hidden = true; $('c-cls').focus(); });
        $('c-save').addEventListener('click', addChild);
        $('add').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); addChild(); } });
        const setBelow = v => change(() => { state.flagBelow = v; }, 'tools-msg', 'Subjects below ' + C.pct(v) + ' now show under Needs attention.');
        const setDrop = v => change(() => { state.flagDrop = v; }, 'tools-msg', 'Subjects that drop by ' + C.pts(v) + ' points or more now show under Needs attention.');
        $('flag-below').addEventListener('change', e => { if (e.target.value === 'other') { $('fb-other').hidden = false; $('fb-other-v').focus(); } else { $('fb-other').hidden = true; setBelow(+e.target.value); } });
        $('flag-drop').addEventListener('change', e => { if (e.target.value === 'other') { $('fd-other').hidden = false; $('fd-other-v').focus(); } else { $('fd-other').hidden = true; setDrop(+e.target.value); } });
        $('fb-other-save').addEventListener('click', () => other('fb-other', 1, 100, setBelow));
        $('fd-other-save').addEventListener('click', () => other('fd-other', 1, 100, setDrop));
        ['fb-other', 'fd-other'].forEach(w => $(w + '-v').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $(w + '-save').click(); } }));
        $('grades-open').addEventListener('click', () => { gradeRows(state.grades); $('g-err').textContent = ''; $('grades-box').hidden = false; $('grades-open').hidden = true; $('g-list').querySelector('input').focus(); });
        $('g-add').addEventListener('click', () => addGradeRow({ g: '', p: null }).querySelector('input').focus());
        $('g-reset').addEventListener('click', () => { gradeRows(C.DEFAULT_GRADES); $('g-err').textContent = ''; });
        $('g-save').addEventListener('click', saveGrades);
        $('backup').addEventListener('click', backup);
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-first').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) restore(f); e.target.value = ''; });
        $('del-all').addEventListener('click', () => {
            if (!state.children.length) { say('tools-msg', 'There is nothing to delete.'); return; }
            panel = null;
            change(() => { const keep = { grades: state.grades, flagBelow: state.flagBelow, flagDrop: state.flagDrop }; state = Object.assign(C.emptyState(), keep); }, 'tools-msg', 'Everything deleted.');
        });
        // a new day while the page stays open
        const tick = () => { const t = C.dayStr(new Date()); if (t !== today) { today = t; if (!panel) render(); } };
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        setInterval(tick, 60000);
        // redraw the charts after a big change of width (turning a tablet), but never while a form is open
        let rt = 0;
        addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!panel && Math.abs(innerWidth - drawnAt) > 60 && document.querySelector('.chart')) render(); }, 250); });
        render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
