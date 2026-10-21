// CGPA and Semester GPA Planner: the page. The maths lives in core.js (window.GPA).
(function () {
    'use strict';
    const G = window.GPA, KEY = 'cgpa-and-semester-gpa-planner-for-university-students.state';
    const $ = id => document.getElementById(id);
    const fmt = G.fmt, fmtCr = G.fmtCr;
    let state, storageOk = true, loadNote = '';

    // ---------- state ----------
    function emptyRows(n) { return Array.from({ length: n }, () => ({ id: newId('c'), name: '', credits: '', grade: '' })); }
    function newId(p) { state.nextId = (state.nextId || 1) + 1; return p + state.nextId; }
    function fresh() {
        state = { v: 1, scale: 'hec', custom: G.SCALES.hec.grades.map(([g, p]) => ({ g, p })), customEdited: false, pointsMax: '4', rounding: 'round', retake: 'latest',
            target: '', total: '', base: { on: false, cgpa: '', credits: '' }, semesters: [], nextId: 1 };
        state.semesters.push({ id: newId('s'), name: 'Semester 1', plan: false, courses: emptyRows(5) });
        return state;
    }
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; }
        if (!raw) return fresh();
        try {
            const data = JSON.parse(raw), clean = G.cleanState(data);
            clean.customEdited = !!data.customEdited;
            state = clean;
            if (!state.semesters.length) state.semesters.push({ id: newId('s'), name: 'Semester 1', plan: false, courses: emptyRows(5) });
            return state;
        } catch (e) { loadNote = 'Your saved grades could not be read, so the planner started fresh.'; return fresh(); }
    }
    function save() {
        if (!storageOk) return;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOk = false; say($('share-msg'), 'Your browser is not letting this page save. Your grades will be lost when you close it: use "Save a backup file".', null, true); }
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { const d = JSON.parse(snap); state = G.cleanState(d); state.customEdited = !!d.customEdited; save(); renderAll(); }

    // ---------- small helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function say(box, text, undoSnap, bad, extra) {
        box.textContent = '';
        box.className = 'msg' + (text ? ' show' : '') + (bad ? ' bad' : '');
        if (!text) return;
        const p = el('p', null, text + ' ');
        if (undoSnap) {
            const u = el('button', 'link inline undo', 'Undo'); u.type = 'button';
            u.addEventListener('click', () => { restoreSnap(undoSnap); say(box, 'Undone.'); });
            p.appendChild(u);
        }
        box.appendChild(p);
        if (extra) box.appendChild(el('p', 'msg-extra', extra));
    }
    const semName = (s, i) => (s.name || '').trim() || 'Semester ' + (i + 1);
    const courseName = (c, i) => (c.name || '').trim() || 'Course ' + (i + 1);
    function gradeLabel(g) { return G.SPECIAL[g] ? G.SPECIAL[g].label.split(' (')[0] : g; }

    // ---------- grading scale ----------
    function renderScale() {
        const sel = $('scale'); sel.textContent = '';
        Object.entries(G.SCALES).forEach(([k, v]) => { const o = el('option', null, v.name); o.value = k; sel.appendChild(o); });
        sel.value = state.scale;
        $('rounding').value = state.rounding; $('retake').value = state.retake;
        $('points-box').hidden = state.scale !== 'points';
        $('points-max').value = state.pointsMax;
        $('custom-box').hidden = state.scale !== 'custom';
        if (state.scale === 'custom') renderCustom();
        scaleList();
    }
    function scaleList() {
        const g = G.scaleGrades(state);
        const note = G.SCALES[state.scale].note;
        $('scale-list').textContent = state.scale === 'points'
            ? note + ' Each grade point is from 0 to ' + fmt(G.scaleMax(state)) + '.'
            : state.scale === 'custom' ? (g.length ? g.map(x => x.g + '\u00a0' + fmt(x.p)).join(' · ') : 'Add at least one grade below.')
            : note + ' ' + g.map(x => x.g + '\u00a0' + fmt(x.p)).join(' · ');
    }
    function renderCustom() {
        const box = $('custom-rows'); box.textContent = '';
        state.custom.forEach((r, i) => {
            const row = el('div', 'cg');
            const g = el('input'); g.type = 'text'; g.maxLength = 6; g.value = r.g; g.placeholder = 'A'; g.setAttribute('aria-label', 'Grade ' + (i + 1));
            const p = el('input'); p.type = 'text'; p.inputMode = 'decimal'; p.maxLength = 5; p.value = r.p; p.placeholder = '4.00'; p.setAttribute('aria-label', 'Grade points for grade ' + (i + 1));
            const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Delete grade ' + (r.g || i + 1));
            g.addEventListener('input', () => { r.g = g.value; state.customEdited = true; changed(); scaleList(); renderSemesters(); });
            p.addEventListener('input', () => { r.p = p.value; state.customEdited = true; const v = G.toHundredths(p.value); p.setAttribute('aria-invalid', v !== null && !Number.isFinite(v) ? 'true' : 'false'); changed(); scaleList(); renderSemesters(); });
            x.addEventListener('click', () => { const snap = snapshot(); state.custom.splice(i, 1); state.customEdited = true; save(); renderAll(); say($('scale-msg'), 'Grade deleted.', snap); });
            row.append(g, p, x); box.appendChild(row);
        });
    }
    function setScale(k) {
        const snap = snapshot(), before = countBad();
        if (k === 'custom' && !state.customEdited && G.SCALES[state.scale].grades) state.custom = G.SCALES[state.scale].grades.map(([g, p]) => ({ g, p }));
        state.scale = k; save(); renderAll();
        const after = countBad();
        if (after > before) say($('scale-msg'), after + (after === 1 ? ' grade does' : ' grades do') + ' not exist on this scale, so ' + (after === 1 ? 'that course is' : 'those courses are') + ' not counted. Pick their grades again.', snap, true);
        else say($('scale-msg'), 'Grading scale changed.', snap);
    }
    function countBad() { const r = G.compute(state); return Object.values(r.info).filter(x => x.status === 'bad' && /scale|grade point/i.test(x.why || '')).length; }

    // ---------- semesters ----------
    function renderSemesters() {
        const box = $('sems'), focusId = document.activeElement && document.activeElement.id;
        box.textContent = '';
        state.semesters.forEach((s, si) => box.appendChild(semBox(s, si)));
        if (focusId && $(focusId)) { const f = $(focusId); f.focus(); if (f.setSelectionRange && f.type === 'text') { try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) { /* not a text field */ } } }
        refresh();
    }
    function semBox(s, si) {
        const box = el('section', 'sem' + (s.plan ? ' plan' : '')); box.id = 'sem-' + s.id; box.setAttribute('aria-label', semName(s, si));
        const head = el('div', 'sem-h');
        const nf = el('div', 'field');
        const nl = el('label', null, 'Semester name'); nl.htmlFor = 'sn-' + s.id;
        const ni = el('input'); ni.type = 'text'; ni.id = 'sn-' + s.id; ni.maxLength = 40; ni.value = s.name; ni.placeholder = 'Semester ' + (si + 1); ni.autocomplete = 'off';
        ni.addEventListener('input', () => { s.name = ni.value; box.setAttribute('aria-label', semName(s, si)); changed(); });
        nf.append(nl, ni);
        const pf = el('div', 'field');
        const pl = el('label', null, 'Grades are'); pl.htmlFor = 'sp-' + s.id;
        const ps = el('select'); ps.id = 'sp-' + s.id;
        [['0', 'Final results'], ['1', 'Expected (what-if)']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; ps.appendChild(o); });
        ps.value = s.plan ? '1' : '0';
        ps.addEventListener('change', () => { s.plan = ps.value === '1'; box.classList.toggle('plan', s.plan); changed(); });
        pf.append(pl, ps);
        head.append(nf, pf);
        box.appendChild(head);
        const list = el('div', 'courses');
        s.courses.forEach((c, ci) => list.appendChild(courseRow(s, si, c, ci)));
        box.appendChild(list);
        const add = el('button', 'link', '+ Add course'); add.type = 'button'; add.id = 'addc-' + s.id;
        add.addEventListener('click', () => { const c = { id: newId('c'), name: '', credits: '', grade: '' }; s.courses.push(c); save(); renderSemesters(); const f = $('cn-' + c.id); if (f) f.focus(); });
        const sum = el('div', 'sem-sum'); sum.id = 'sum-' + s.id; sum.setAttribute('aria-live', 'polite');
        const foot = el('div', 'sem-f');
        const rm = el('button', 'link danger-link', 'Remove semester'); rm.type = 'button';
        rm.addEventListener('click', () => {
            const snap = snapshot(), name = semName(s, si);
            state.semesters.splice(si, 1); save(); renderSemesters();
            say($('sems-msg'), name + ' removed.', snap);
        });
        foot.append(add, rm);
        box.append(sum, foot);
        return box;
    }
    function courseRow(s, si, c, ci) {
        const row = el('div', 'course'); row.id = 'row-' + c.id;
        const top = el('div', 'c-top');
        const nl = el('label', 'sr', 'Course name (optional)'); nl.htmlFor = 'cn-' + c.id;
        const ni = el('input'); ni.type = 'text'; ni.id = 'cn-' + c.id; ni.maxLength = 80; ni.value = c.name; ni.placeholder = 'Course name'; ni.autocomplete = 'off';
        ni.addEventListener('input', () => { c.name = ni.value; changed(); });
        const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Delete ' + courseName(c, ci) + ' from ' + semName(s, si));
        x.addEventListener('click', () => {
            const snap = snapshot(), name = courseName(c, ci);
            s.courses.splice(ci, 1); save(); renderSemesters();
            say($('sems-msg'), name + ' deleted from ' + semName(s, si) + '.', snap);
        });
        top.append(nl, ni, x);
        const bot = el('div', 'c-bot');
        const cf = el('div', 'field cr');
        const cl = el('label', null, 'Credit hours'); cl.htmlFor = 'cc-' + c.id;
        const cin = el('input'); cin.type = 'text'; cin.inputMode = 'decimal'; cin.id = 'cc-' + c.id; cin.maxLength = 5; cin.value = c.credits; cin.placeholder = 'e.g. 3'; cin.autocomplete = 'off';
        cin.addEventListener('input', () => { c.credits = cin.value; changed(); });
        cf.append(cl, cin);
        const gf = el('div', 'field gr');
        const gl = el('label', null, state.scale === 'points' ? 'Grade point' : 'Grade'); gl.htmlFor = 'cg-' + c.id;
        let gin;
        if (state.scale === 'points') {
            gin = el('input'); gin.type = 'text'; gin.inputMode = 'decimal'; gin.maxLength = 5; gin.value = G.SPECIAL[c.grade] ? '' : c.grade; gin.placeholder = 'e.g. 3.5'; gin.autocomplete = 'off';
            gin.addEventListener('input', () => { c.grade = gin.value; changed(); });
        } else {
            gin = el('select');
            const o0 = el('option', null, 'Pick grade'); o0.value = ''; gin.appendChild(o0);
            const grades = G.scaleGrades(state);
            grades.forEach(g => { const o = el('option', null, g.g + '  (' + fmt(g.p) + ')'); o.value = g.g; gin.appendChild(o); });
            const og = el('optgroup'); og.label = 'Not in GPA';
            Object.entries(G.SPECIAL).forEach(([k, v]) => { const o = el('option', null, v.label); o.value = k; og.appendChild(o); });
            gin.appendChild(og);
            const cur = String(c.grade || '');
            if (cur && !G.SPECIAL[cur] && !grades.some(g => g.g.toUpperCase() === cur.toUpperCase())) { const o = el('option', null, cur + ' (not on this scale)'); o.value = cur; gin.insertBefore(o, og); }
            const match = grades.find(g => g.g.toUpperCase() === cur.toUpperCase());
            gin.value = match ? match.g : cur;
            gin.addEventListener('change', () => { c.grade = gin.value; changed(); });
        }
        gin.id = 'cg-' + c.id;
        gf.append(gl, gin);
        bot.append(cf, gf);
        const note = el('p', 'c-note'); note.id = 'cnote-' + c.id;
        row.append(top, bot, note);
        return row;
    }

    // ---------- results ----------
    function changed() { save(); refresh(); }
    function refresh() {
        const r = G.compute(state);
        // each course's note and each semester's summary
        state.semesters.forEach((s, si) => {
            s.courses.forEach((c, ci) => {
                const n = $('cnote-' + c.id), row = $('row-' + c.id); if (!n) return;
                const info = (s.plan ? r.info : r.infoDone)[c.id] || r.info[c.id];
                let t = '', cls = 'c-note';
                if (info.status === 'bad') { t = info.why; cls += ' bad'; }
                else if (info.status === 'nograde') t = s.plan ? 'Pick the grade you expect' : 'No grade yet: not counted';
                else if (info.status === 'special') t = info.earned ? 'Not in GPA. Credit hours completed' : 'Not in GPA';
                else if (info.status === 'zero') t = '0 credit hours: not in GPA';
                else if (info.status === 'gpa' && info.replacedBy) { const rb = info.replacedBy; t = 'Not counted: retaken in ' + semName(stateSem(rb.semId), semIndex(rb.semId)) + (state.retake === 'best' ? ' (best grade counts)' : ' (latest grade counts)'); cls += ' muted'; }
                else if (info.status === 'gpa' && info.retaken) t = state.retake === 'all' ? 'Retaken: every attempt counts' : 'Counts (retaken course)';
                n.textContent = t; n.className = cls; n.hidden = !t;
                const inp = $('cc-' + c.id); if (inp) inp.setAttribute('aria-invalid', info.status === 'bad' && /credit/i.test(info.why) ? 'true' : 'false');
                const gi = $('cg-' + c.id); if (gi) gi.setAttribute('aria-invalid', info.status === 'bad' && !/credit/i.test(info.why) ? 'true' : 'false');
                if (row) row.classList.toggle('replaced', !!info.replacedBy);
            });
            const sum = $('sum-' + s.id); if (!sum) return;
            const row = r.rows[si]; sum.textContent = '';
            if (row.gpa === null) {
                sum.appendChild(el('p', 'sem-none', s.plan ? 'Pick expected grades to see this semester\'s GPA.' : 'Type credit hours and pick grades to see this semester\'s GPA.'));
            } else {
                const p = el('p', 'sem-gpa');
                p.append(el('span', 'k', s.plan ? 'Expected GPA ' : 'Semester GPA '), el('b', 'v', fmt(row.gpa)), el('span', 'k', ' · ' + fmtCr(row.cr) + ' credit hours'));
                sum.appendChild(p);
                const q = el('p', 'sem-cg'); q.append(el('span', 'k', s.plan ? 'CGPA would be ' : 'CGPA after this semester '), el('b', null, fmt(row.cgpa)));
                sum.appendChild(q);
            }
            const issues = [];
            if (row.nograde && !s.plan) issues.push(row.nograde + (row.nograde === 1 ? ' course has' : ' courses have') + ' no grade yet');
            if (row.bad) issues.push(row.bad + (row.bad === 1 ? ' course needs' : ' courses need') + ' fixing (see the red note)');
            if (issues.length) sum.appendChild(el('p', 'sem-warn', issues.join('. ') + '.'));
        });
        // base record
        const b = r.base;
        $('base-card').hidden = !state.base.on; $('base-open').hidden = state.base.on;
        $('base-err').textContent = b.bad || '';
        $('base-cgpa').setAttribute('aria-invalid', b.bad && /CGPA/.test(b.bad) ? 'true' : 'false');
        $('base-cr').setAttribute('aria-invalid', b.bad && /credit/.test(b.bad) ? 'true' : 'false');
        renderResults(r); renderAnswer(r);
        $('email').href = 'mailto:?subject=' + encodeURIComponent('My CGPA and semester GPAs') + '&body=' + encodeURIComponent(summaryText(r));
    }
    function stateSem(id) { return state.semesters.find(s => s.id === id) || {}; }
    function semIndex(id) { return state.semesters.findIndex(s => s.id === id); }

    function renderResults(r) {
        const has = r.soFar.cr > 0 || r.hasPlan;
        $('res-empty').hidden = has; $('res-body').hidden = !has;
        if (!has) return;
        if (r.soFar.cr > 0) {
            $('cgpa').textContent = fmt(r.soFar.cgpa);
            $('cgpa-of').textContent = 'CGPA';
            $('cgpa-line').textContent = r.soFar.cr === r.soFar.earned ? 'Over ' + fmtCr(r.soFar.cr) + ' credit hours.' : fmtCr(r.soFar.cr) + ' credit hours counted in your GPA · ' + fmtCr(r.soFar.earned) + ' credit hours completed.';
        } else {
            $('cgpa').textContent = '-'; $('cgpa-of').textContent = 'no final results yet';
            $('cgpa-line').textContent = 'Only expected (what-if) grades so far.';
        }
        const pl = $('plan-line'); pl.hidden = !r.hasPlan;
        if (r.hasPlan) {
            const names = state.semesters.filter(s => s.plan).map((s) => semName(s, semIndex(s.id))).join(', ');
            pl.textContent = 'With your expected grades for ' + names + ': CGPA ' + fmt(r.withPlan.cgpa) + '.';
        }
        const tb = $('sem-rows'); tb.textContent = '';
        if (r.base.qp !== undefined) {
            const tr = el('tr', 'base-row');
            tr.append(el('th', null, 'Earlier record'), el('td', null, fmtCr(r.base.cr)), el('td', null, '-'), el('td', null, fmt(r.base.g)));
            tr.firstChild.scope = 'row'; tb.appendChild(tr);
        }
        r.rows.forEach((row, i) => {
            if (row.gpa === null) return;
            const tr = el('tr', row.plan ? 'plan' : '');
            const th = el('th', null, semName(state.semesters[i], i) + (row.plan ? ' (what-if)' : '')); th.scope = 'row';
            tr.append(th, el('td', null, fmtCr(row.cr)), el('td', null, fmt(row.gpa)), el('td', null, fmt(row.cgpa)));
            tb.appendChild(tr);
        });
    }

    function nearestGrade(need) {
        const g = G.scaleGrades(state).filter(x => x.p >= need);
        return g.length ? g[g.length - 1] : null;
    }
    // The target answer as { big, lines[], tone } so the page, the copied text and the print use the same words.
    function answerParts(t, r, soFar) {
        const T = t.T !== undefined ? fmt(t.T) : '';
        switch (t.status) {
            case 'notarget': return { lines: ['Type your target CGPA, for example 3.00 for a scholarship or a master\'s admission.'], tone: 'muted' };
            case 'badtarget': return { lines: ['Type a target CGPA from 0 to ' + fmt(t.max) + ', for example 3.00.'], tone: 'bad' };
            case 'nototal': return { lines: ['Type the credit hours in your whole degree to see the GPA you need.'], tone: 'muted' };
            case 'badtotal': return { lines: ['Type the credit hours in your degree as a number, for example 136.'], tone: 'bad' };
            case 'finished':
                if (t.final === null) return { lines: ['No credit hours are left in your degree.'], tone: 'muted' };
                return { big: 'Final CGPA ' + fmt(t.final), lines: [(t.over ? 'You have completed ' + fmtCr(soFar.earned) + ' credit hours, more than the ' + fmtCr(t.total) + ' in your degree, so no credit hours are left. Check the degree total.' : 'You have completed all ' + fmtCr(t.total) + ' credit hours of your degree.'),
                    t.reached ? 'That is at or above your ' + T + ' target.' : 'That is below your ' + T + ' target.'], tone: t.reached ? 'good' : 'bad' };
            case 'safe': return { big: 'Target ' + T + ' is safe', lines: ['You will finish at or above ' + T + ' whatever grades you get in the remaining ' + fmtCr(t.R) + ' credit hours.', 'Even with 0 in all of them your CGPA would end at ' + fmt(t.worst) + '. With top grades it could reach ' + fmt(t.best) + '.'], tone: 'good' };
            case 'impossible': return { big: T + ' can no longer be reached', lines: ['Even with ' + fmt(t.max) + ' in all ' + fmtCr(t.R) + ' remaining credit hours, your CGPA would end at ' + fmt(t.best) + '.', 'Retaking a low-graded course can help if your university replaces the old grade.'], tone: 'bad' };
            default: {
                const ng = nearestGrade(t.need), low = r.low;
                const lines = ['on average in your remaining ' + fmtCr(t.R) + ' credit hours to finish with a ' + T + ' CGPA.'];
                if (low && t.need <= low.p) lines.push('Passing every remaining course, even with ' + low.g + ' (' + fmt(low.p) + '), is enough.');
                else if (ng) lines.push('For example, ' + ng.g + ' (' + fmt(ng.p) + ') or better in every remaining course would do it.');
                lines.push('Highest CGPA you can still reach: ' + fmt(t.best) + '.');
                return { big: 'You need at least ' + fmt(t.need), lines, tone: 'need' };
            }
        }
    }
    function renderAnswer(r) {
        const t = r.target, box = $('answer'); box.textContent = '';
        const left = t.R !== undefined && t.status !== 'finished';
        $('total-hint').textContent = left ? 'Credit hours left: ' + fmtCr(t.total) + ' in your degree − ' + fmtCr(r.soFar.earned) + ' completed = ' + fmtCr(t.R) + '.' : 'The total on your degree plan, for example 130 to 140 for a 4-year degree.';
        $('target').setAttribute('aria-invalid', t.status === 'badtarget' ? 'true' : 'false');
        $('total').setAttribute('aria-invalid', t.status === 'badtotal' ? 'true' : 'false');
        const a = answerParts(t, r, r.soFar);
        box.className = 'answer ' + a.tone;
        if (a.big) box.appendChild(el('p', 'a-big', a.big));
        a.lines.forEach(l => box.appendChild(el('p', 'a-line', l)));
        const pb = $('answer-plan'); pb.textContent = '';
        const tp = r.targetPlan;
        pb.hidden = !tp || ['notarget', 'badtarget', 'nototal', 'badtotal'].includes(t.status);
        if (!pb.hidden) {
            pb.appendChild(el('p', 'a-h', 'If your expected grades come true'));
            pb.appendChild(el('p', 'a-line', planSentence(tp, r)));
        }
    }
    function planSentence(tp, r) {
        const c = 'Your CGPA becomes ' + fmt(r.withPlan.cgpa) + '. ';
        if (tp.status === 'need') return c + 'You would then need at least ' + fmt(tp.need) + ' in the last ' + fmtCr(tp.R) + ' credit hours.';
        if (tp.status === 'safe') return c + 'Your ' + fmt(tp.T) + ' target would then be safe.';
        if (tp.status === 'impossible') return c + 'Your ' + fmt(tp.T) + ' target could then no longer be reached (at most ' + fmt(tp.best) + ').';
        if (tp.status === 'finished') return c + (tp.reached ? 'That finishes your degree at or above your target.' : 'That finishes your degree below your target.');
        return c;
    }

    // ---------- share ----------
    function summaryText(r) {
        r = r || G.compute(state);
        const L = ['My CGPA and semester GPAs', 'Grading scale: ' + G.SCALES[state.scale].name, ''];
        if (r.base.qp !== undefined) L.push('Earlier record: CGPA ' + fmt(r.base.g) + ' over ' + fmtCr(r.base.cr) + ' credit hours');
        r.rows.forEach((row, i) => { if (row.gpa !== null) L.push(semName(state.semesters[i], i) + (row.plan ? ' (expected grades)' : '') + ': GPA ' + fmt(row.gpa) + ' over ' + fmtCr(row.cr) + ' credit hours, CGPA after ' + fmt(row.cgpa)); });
        L.push('');
        if (r.soFar.cr > 0) L.push('CGPA: ' + fmt(r.soFar.cgpa) + ' (' + fmtCr(r.soFar.cr) + ' credit hours in GPA, ' + fmtCr(r.soFar.earned) + ' completed)');
        if (r.hasPlan) L.push('With expected grades: CGPA ' + fmt(r.withPlan.cgpa));
        const a = answerParts(r.target, r, r.soFar);
        if (!['notarget', 'nototal'].includes(r.target.status)) {
            L.push('', 'Target: ' + (a.big ? a.big + ' ' : '') + a.lines.join(' '));
            if (r.targetPlan && r.target.status !== 'badtarget' && r.target.status !== 'badtotal') L.push('If the expected grades come true: ' + planSentence(r.targetPlan, r));
        }
        return L.join('\n');
    }
    function buildReport() {
        const r = G.compute(state), rep = $('report'); rep.textContent = '';
        rep.appendChild(el('h2', null, 'CGPA and semester GPAs'));
        rep.appendChild(el('p', null, 'Grading scale: ' + G.SCALES[state.scale].name + ' · Printed ' + new Date().toLocaleDateString()));
        if (r.soFar.cr > 0) rep.appendChild(el('p', 'r-big', 'CGPA ' + fmt(r.soFar.cgpa) + ' over ' + fmtCr(r.soFar.cr) + ' credit hours (' + fmtCr(r.soFar.earned) + ' completed)'));
        const a = answerParts(r.target, r, r.soFar);
        if (!['notarget', 'nototal'].includes(r.target.status)) rep.appendChild(el('p', null, (a.big ? a.big + ' ' : '') + a.lines.join(' ')));
        if (r.base.qp !== undefined) rep.appendChild(el('p', null, 'Earlier record: CGPA ' + fmt(r.base.g) + ' over ' + fmtCr(r.base.cr) + ' credit hours'));
        state.semesters.forEach((s, si) => {
            const row = r.rows[si];
            rep.appendChild(el('h3', null, semName(s, si) + (s.plan ? ' (expected grades)' : '') + (row.gpa !== null ? ': GPA ' + fmt(row.gpa) + ', CGPA after ' + fmt(row.cgpa) : '')));
            const tbl = el('table'), th = el('thead'), hr = el('tr');
            ['Course', 'Credit hours', 'Grade', 'Grade points', 'Note'].forEach(h => hr.appendChild(el('th', null, h)));
            th.appendChild(hr); tbl.appendChild(th);
            const tb = el('tbody');
            s.courses.forEach((c, ci) => {
                const info = (s.plan ? r.info : r.infoDone)[c.id] || r.info[c.id];
                if (info.status === 'ignored') return;
                const tr = el('tr');
                const note = $('cnote-' + c.id) ? $('cnote-' + c.id).textContent : '';
                tr.append(el('td', null, courseName(c, ci)), el('td', null, c.credits), el('td', null, gradeLabel(c.grade)), el('td', null, info.status === 'gpa' ? fmt(info.p) : '-'), el('td', null, note));
                tb.appendChild(tr);
            });
            tbl.appendChild(tb); rep.appendChild(tbl);
        });
        rep.appendChild(el('p', 'r-foot', 'Worked out from the grades typed in, not an official transcript.'));
    }

    // ---------- events ----------
    function renderAll() {
        renderScale();
        $('target').value = state.target; $('total').value = state.total;
        $('base-cgpa').value = state.base.cgpa; $('base-cr').value = state.base.credits;
        renderSemesters();
    }
    $('scale').addEventListener('change', e => setScale(e.target.value));
    $('rounding').addEventListener('change', e => { state.rounding = e.target.value; changed(); });
    $('retake').addEventListener('change', e => { state.retake = e.target.value; changed(); });
    $('points-max').addEventListener('input', e => { state.pointsMax = e.target.value; const v = G.toHundredths(e.target.value); e.target.setAttribute('aria-invalid', v !== null && (!Number.isFinite(v) || v === 0) ? 'true' : 'false'); changed(); scaleList(); });
    $('custom-add').addEventListener('click', () => { state.custom.push({ g: '', p: '' }); state.customEdited = true; save(); renderCustom(); const ins = $('custom-rows').querySelectorAll('input'); if (ins.length) ins[ins.length - 2].focus(); });
    $('target').addEventListener('input', e => { state.target = e.target.value; changed(); });
    $('total').addEventListener('input', e => { state.total = e.target.value; changed(); });
    $('base-cgpa').addEventListener('input', e => { state.base.cgpa = e.target.value; changed(); });
    $('base-cr').addEventListener('input', e => { state.base.credits = e.target.value; changed(); });
    $('base-open').addEventListener('click', () => { state.base.on = true; save(); refresh(); $('base-cgpa').focus(); });
    $('base-remove').addEventListener('click', () => { const snap = snapshot(); state.base = { on: false, cgpa: '', credits: '' }; save(); renderAll(); say($('sems-msg'), 'Earlier record removed.', snap); $('base-open').focus(); });
    $('add-sem').addEventListener('click', () => {
        const s = { id: newId('s'), name: 'Semester ' + (state.semesters.length + 1), plan: false, courses: emptyRows(5) };
        state.semesters.push(s); save(); renderSemesters(); say($('sems-msg'), '');
        const f = $('cn-' + s.courses[0].id); if (f) { f.focus(); f.scrollIntoView({ block: 'center' }); }
    });
    $('copy').addEventListener('click', () => {
        const text = summaryText();
        const done = () => say($('share-msg'), 'Copied. Paste it into a message or email.');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        else fallbackCopy(text, done);
    });
    function fallbackCopy(text, done) {
        const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        if (ok) done(); else say($('share-msg'), 'Copying is blocked in this browser. Use Email or Print instead.', null, true);
    }
    $('print').addEventListener('click', () => { buildReport(); window.print(); });
    window.addEventListener('beforeprint', buildReport);
    $('backup').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'cgpa-planner-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        say($('share-msg'), 'Backup file saved. Keep it somewhere safe; "Restore a backup" loads it on any device.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', e => {
        const f = e.target.files && e.target.files[0]; e.target.value = '';
        if (!f) return;
        if (f.size > 2000000) return say($('share-msg'), 'That file is too big to be a CGPA planner backup.', null, true);
        const rd = new FileReader();
        rd.onload = () => {
            try {
                const d = JSON.parse(rd.result), clean = G.cleanState(d), snap = snapshot();
                clean.customEdited = !!d.customEdited;
                if (!clean.semesters.length) throw new Error('The backup has no semesters.');
                state = clean; save(); renderAll();
                say($('share-msg'), 'Backup restored: ' + clean.semesters.length + (clean.semesters.length === 1 ? ' semester.' : ' semesters.'), snap);
            } catch (err) { say($('share-msg'), 'That file could not be restored. ' + (err instanceof SyntaxError ? 'It is not a backup file.' : err.message), null, true); }
        };
        rd.onerror = () => say($('share-msg'), 'That file could not be read.', null, true);
        rd.readAsText(f);
    });
    $('reset').addEventListener('click', () => {
        const snap = snapshot(), keepScale = { scale: state.scale, custom: state.custom, customEdited: state.customEdited, pointsMax: state.pointsMax, rounding: state.rounding, retake: state.retake };
        fresh(); Object.assign(state, keepScale); save(); renderAll();
        say($('share-msg'), 'Started over: every semester, the earlier record and the target were cleared. Your grading scale is kept.', snap);
    });

    load(); renderAll();
    if (loadNote) say($('sems-msg'), loadNote, null, true);
    if (!storageOk) say($('share-msg'), 'Your browser is not letting this page save. Your grades will be lost when you close it: use "Save a backup file".', null, true);
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { /* offline copy is optional */ });
})();
