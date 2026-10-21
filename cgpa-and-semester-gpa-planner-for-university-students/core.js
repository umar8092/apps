// CGPA and Semester GPA Planner: the maths, with no page code, so tests.js can check it in Node.
// Exact arithmetic: grade points are kept in hundredths (3.67 -> 367) and credit hours in hundredths (1.5 -> 150),
// so quality points are whole numbers and every GPA is worked out with integer division, never floats.
(function (root) {
    'use strict';

    const SCALES = {
        hec: { name: '4.00 scale (A- = 3.67)', note: 'Used in Pakistan (HEC) and many other countries.', grades: [['A', '4.00'], ['A-', '3.67'], ['B+', '3.33'], ['B', '3.00'], ['B-', '2.67'], ['C+', '2.33'], ['C', '2.00'], ['C-', '1.67'], ['D+', '1.33'], ['D', '1.00'], ['F', '0.00']] },
        us: { name: '4.00 scale (A- = 3.70)', note: 'Used in the US, Canada and many other countries.', grades: [['A+', '4.00'], ['A', '4.00'], ['A-', '3.70'], ['B+', '3.30'], ['B', '3.00'], ['B-', '2.70'], ['C+', '2.30'], ['C', '2.00'], ['C-', '1.70'], ['D+', '1.30'], ['D', '1.00'], ['D-', '0.70'], ['F', '0.00']] },
        abcdf: { name: '4.00 scale, A B C D F only', note: 'No plus or minus grades.', grades: [['A', '4.00'], ['B', '3.00'], ['C', '2.00'], ['D', '1.00'], ['F', '0.00']] },
        ten: { name: '10-point scale', note: 'SGPA and CGPA out of 10, used in India.', grades: [['O', '10'], ['A+', '9'], ['A', '8'], ['B+', '7'], ['B', '6'], ['C', '5'], ['P', '4'], ['F', '0']] },
        five: { name: '5.00 scale', note: 'Used in Nigeria and some other countries.', grades: [['A', '5'], ['B', '4'], ['C', '3'], ['D', '2'], ['E', '1'], ['F', '0']] },
        custom: { name: 'My own grades', note: 'Type each grade and its points below.', grades: null },
        points: { name: 'I type grade points', note: 'For results that show a grade point, such as 3.5, for each course.', grades: null }
    };
    // Grades that are not part of the GPA. Stored with a leading '#' so they never clash with a letter such as P.
    const SPECIAL = {
        '#pass': { label: 'Pass', earned: true },
        '#nopass': { label: 'Fail (pass/fail)', earned: false },
        '#w': { label: 'Withdrawn', earned: false },
        '#i': { label: 'Incomplete', earned: false }
    };
    const MAX_CREDITS = 3000;   // 30 credit hours, in hundredths

    // "3.67", "3,67", " 4 " -> 367 (hundredths). Returns null for blank, NaN for anything not a plain number with up to 2 decimals.
    function toHundredths(text) {
        const s = String(text == null ? '' : text).trim().replace(',', '.');
        if (s === '') return null;
        const m = /^(\d{1,6})(?:\.(\d{0,2}))?$|^\.(\d{1,2})$/.exec(s);
        if (!m) return NaN;
        if (m[3] !== undefined) return Number((m[3] + '0').slice(0, 2));
        return Number(m[1]) * 100 + Number(((m[2] || '') + '00').slice(0, 2));
    }

    // The grade list of the chosen scale: [{ g, p }] with p in hundredths, highest first. Invalid custom rows are skipped.
    function scaleGrades(state) {
        const sc = SCALES[state.scale] || SCALES.hec;
        if (state.scale === 'points') return [];
        const list = state.scale === 'custom' ? (state.custom || []).map(r => [String(r.g || '').trim(), r.p]) : sc.grades;
        const out = [], seen = new Set();
        list.forEach(([g, p]) => {
            const v = toHundredths(p);
            if (!g || g.startsWith('#') || seen.has(g.toUpperCase()) || v === null || !Number.isFinite(v) || v > 10000) return;
            seen.add(g.toUpperCase()); out.push({ g, p: v });
        });
        return out.sort((a, b) => b.p - a.p);
    }

    function scaleMax(state) {
        if (state.scale === 'points') { const m = toHundredths(state.pointsMax); return Number.isFinite(m) && m > 0 ? m : 400; }
        const g = scaleGrades(state); return g.length ? g[0].p : 0;
    }
    // Lowest grade that still passes (above 0), used to say "any passing grade does it".
    function lowestPass(state) {
        if (state.scale === 'points') return null;
        const g = scaleGrades(state).filter(x => x.p > 0); return g.length ? g[g.length - 1] : null;
    }

    // What one course's grade means: { kind: 'gpa', p } | { kind: 'special', earned } | { kind: 'none' } | { kind: 'bad', why }
    function readGrade(state, grade) {
        const s = String(grade == null ? '' : grade).trim();
        if (s === '') return { kind: 'none' };
        if (SPECIAL[s]) return { kind: 'special', earned: SPECIAL[s].earned };
        if (state.scale === 'points') {
            const v = toHundredths(s), max = scaleMax(state);
            if (!Number.isFinite(v)) return { kind: 'bad', why: 'Type the grade point as a number, for example 3.5' };
            if (v > max) return { kind: 'bad', why: 'Grade point is above the top of your scale (' + fmt(max) + ')' };
            return { kind: 'gpa', p: v };
        }
        const hit = scaleGrades(state).find(x => x.g.toUpperCase() === s.toUpperCase());
        if (!hit) return { kind: 'bad', why: 'Grade "' + s + '" is not on your grading scale. Pick it again' };
        return { kind: 'gpa', p: hit.p };
    }

    function readCredits(text) {
        const v = toHundredths(text);
        if (v === null) return { blank: true };
        if (!Number.isFinite(v) || v > MAX_CREDITS) return { bad: 'Type credit hours from 0 to 30, for example 3 or 1.5' };
        return { c: v };
    }

    const keyOf = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

    // Works out every course of the given semesters (in order). Returns per course info keyed by course id, plus totals.
    // policy: 'latest' (newest attempt replaces older), 'best' (highest grade counts), 'all' (every attempt counts).
    function resolve(state, semesters) {
        const info = {}, attempts = {};
        semesters.forEach((sem, si) => sem.courses.forEach((c, ci) => {
            const cr = readCredits(c.credits), gr = readGrade(state, c.grade), name = String(c.name || '').trim();
            const row = { semId: sem.id, si, ci, name, status: 'ignored', c: 0, p: 0 };
            info[c.id] = row;
            if (cr.blank && gr.kind === 'none' && !name) return;               // an untouched empty row
            if (cr.bad) { row.status = 'bad'; row.why = cr.bad; return; }
            if (cr.blank) { row.status = 'bad'; row.why = 'Type the credit hours'; return; }
            if (gr.kind === 'bad') { row.status = 'bad'; row.why = gr.why; return; }
            row.c = cr.c;
            if (gr.kind === 'none') { row.status = 'nograde'; return; }
            if (gr.kind === 'special') { row.status = 'special'; row.earned = gr.earned; return; }
            row.status = 'gpa'; row.p = gr.p;
            if (cr.c === 0) { row.status = 'zero'; return; }
            const k = name ? keyOf(name) : '#' + c.id;
            (attempts[k] = attempts[k] || []).push(row);
        }));
        const policy = state.retake || 'latest';
        Object.values(attempts).forEach(list => {
            if (list.length < 2 || policy === 'all') { list.forEach(r => { r.counts = true; }); if (list.length > 1) list.forEach(r => { r.retaken = true; }); return; }
            let keep = list[list.length - 1];
            // best: the highest grade counts; a tie goes to the later attempt
            if (policy === 'best') keep = list.reduce((k, r) => (r.p >= k.p ? r : k), list[0]);
            list.forEach(r => { r.retaken = true; r.counts = r === keep; if (r !== keep) r.replacedBy = keep; });
        });
        // totals per semester and overall
        const per = {}; semesters.forEach(s => { per[s.id] = { qp: 0, cr: 0, earned: 0, nograde: 0, bad: 0 }; });
        const tot = { qp: 0, cr: 0, earned: 0 };
        const earnedKeys = new Set();
        // credits are earned once per course (a retake does not add degree credits twice)
        const rows = Object.values(info).sort((a, b) => a.si - b.si || a.ci - b.ci);
        rows.forEach(r => {
            const t = per[r.semId];
            if (r.status === 'bad') t.bad++;
            if (r.status === 'nograde') t.nograde++;
            if (r.status === 'gpa' && r.counts) { t.qp += r.p * r.c; t.cr += r.c; tot.qp += r.p * r.c; tot.cr += r.c; }
            const passed = (r.status === 'gpa' && r.counts && r.p > 0) || (r.status === 'special' && r.earned);
            if (passed) {
                const k = r.name ? keyOf(r.name) : '#' + r.si + '.' + r.ci;
                if (!earnedKeys.has(k)) { earnedKeys.add(k); t.earned += r.c; tot.earned += r.c; }
            }
        });
        return { info, per, tot };
    }

    // GPA in hundredths from quality points (p*c) and credits (both hundredths): rounded half up, or cut off.
    function gpa(qp, cr, mode) {
        if (!cr) return null;
        return mode === 'cut' ? Math.floor(qp / cr) : Math.floor((2 * qp + cr) / (2 * cr));
    }

    // The earlier record typed as one CGPA over some credit hours, instead of every old course.
    function readBase(state) {
        const b = state.base || {};
        if (!b.on) return { on: false };
        const g = toHundredths(b.cgpa), c = toHundredths(b.credits), max = scaleMax(state);
        if (g === null && c === null) return { on: true, empty: true };
        if (!Number.isFinite(g) || g === null || g > max) return { on: true, bad: 'Type your CGPA from 0 to ' + fmt(max) };
        if (!Number.isFinite(c) || c === null || c === 0 || c > 100000) return { on: true, bad: 'Type the credit hours that CGPA covers' };
        return { on: true, qp: g * c, cr: c, earned: c, g };
    }

    // The full picture: per semester GPA and CGPA after it, results so far, with the expected (what-if) grades, and the target answer.
    function compute(state) {
        const mode = state.rounding === 'cut' ? 'cut' : 'round';
        const sems = state.semesters || [];
        const base = readBase(state);
        const done = sems.filter(s => !s.plan);
        const rDone = resolve(state, done), rAll = resolve(state, sems);
        const add = (r) => ({ qp: r.tot.qp + (base.qp || 0), cr: r.tot.cr + (base.cr || 0), earned: r.tot.earned + (base.earned || 0) });
        const soFar = add(rDone), withPlan = add(rAll);
        soFar.cgpa = gpa(soFar.qp, soFar.cr, mode); withPlan.cgpa = gpa(withPlan.qp, withPlan.cr, mode);
        // CGPA after each semester, in order (expected semesters use the what-if grades)
        const rows = [];
        sems.forEach((s, i) => {
            const r = resolve(state, sems.slice(0, i + 1));
            const t = r.per[s.id], run = add(r);
            rows.push({ id: s.id, name: s.name, plan: !!s.plan, gpa: gpa(t.qp, t.cr, mode), cr: t.cr, earned: t.earned, nograde: t.nograde, bad: t.bad,
                cgpa: gpa(run.qp, run.cr, mode), runCr: run.cr });
        });
        const hasPlan = sems.some(s => s.plan && rAll.per[s.id].cr > 0);
        return { mode, base, info: rAll.info, infoDone: rDone.info, rows, soFar, withPlan, hasPlan,
            target: target(state, soFar), targetPlan: hasPlan ? target(state, withPlan) : null, max: scaleMax(state), low: lowestPass(state) };
    }

    // "To finish with T you need at least N in the R credit hours left." Every number exact; N is rounded UP so it is always enough.
    function target(state, t) {
        const T = toHundredths(state.target), total = toHundredths(state.total), max = scaleMax(state);
        if (T === null) return { status: 'notarget' };
        if (!Number.isFinite(T) || T > max) return { status: 'badtarget', max };
        if (total === null) return { status: 'nototal' };
        if (!Number.isFinite(total) || total === 0 || total > 100000) return { status: 'badtotal' };
        const R = total - t.earned;
        if (R <= 0) return { status: 'finished', T, total, R: 0, final: gpa(t.qp, t.cr, state.rounding === 'cut' ? 'cut' : 'round'), reached: t.cr ? t.qp >= T * t.cr : null, over: R < 0 };
        const num = T * (t.cr + R) - t.qp;                      // quality points still needed
        const need = num <= 0 ? 0 : Math.ceil(num / R);          // exact ceiling of an integer division
        const best = Math.floor((t.qp + max * R) / (t.cr + R));  // CGPA if every remaining course gets the top grade (cut, never flattering)
        const worst = Math.floor(t.qp / (t.cr + R));             // CGPA if every remaining course gets 0
        let status = 'need';
        if (need > max) status = 'impossible';
        else if (num <= 0) status = 'safe';
        return { status, T, total, R, need, best, worst, max };
    }

    // 367 -> "3.67", 1000 -> "10.00"; credits 1500 -> "15", 150 -> "1.5"
    function fmt(h) { if (h === null || h === undefined) return '-'; const neg = h < 0; h = Math.abs(h); return (neg ? '-' : '') + Math.floor(h / 100) + '.' + String(h % 100).padStart(2, '0'); }
    function fmtCr(h) { if (h === null || h === undefined) return '-'; const s = fmt(h); return s.replace(/\.?0+$/, ''); }

    // Checks a restored backup and returns a clean state, or throws with a plain reason.
    function cleanState(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.semesters)) throw new Error('This is not a CGPA planner backup file.');
        const str = (v, n) => String(v == null ? '' : v).slice(0, n);
        // keep the saved ids when they are valid and unique, so the page and the saved copy agree; give new ones otherwise
        const seen = new Set(); let max = 0;
        const all = raw.semesters.slice(0, 40).flatMap(s => [s && s.id].concat(s && Array.isArray(s.courses) ? s.courses.slice(0, 60).map(c => c && c.id) : []));
        all.forEach(v => { const m = /^[sc](\d{1,9})$/.exec(String(v)); if (m) max = Math.max(max, Number(m[1])); });
        let id = Math.max(max, Number(raw.nextId) > 0 && Number(raw.nextId) < 1e9 ? Number(raw.nextId) : 0) + 1;
        const pick = (v, p) => { const ok = typeof v === 'string' && new RegExp('^' + p + '\\d{1,9}$').test(v) && !seen.has(v); const r = ok ? v : p + (id++); seen.add(r); return r; };
        const out = {
            v: 1, scale: SCALES[raw.scale] ? raw.scale : 'hec',
            custom: Array.isArray(raw.custom) ? raw.custom.slice(0, 40).map(r => ({ g: str(r && r.g, 6), p: str(r && r.p, 8) })) : [],
            pointsMax: str(raw.pointsMax || '4', 8), rounding: raw.rounding === 'cut' ? 'cut' : 'round',
            retake: ['latest', 'best', 'all'].includes(raw.retake) ? raw.retake : 'latest',
            target: str(raw.target, 8), total: str(raw.total, 8),
            base: { on: !!(raw.base && raw.base.on), cgpa: str(raw.base && raw.base.cgpa, 8), credits: str(raw.base && raw.base.credits, 8) },
            semesters: raw.semesters.slice(0, 40).map((s, i) => ({
                id: pick(s && s.id, 's'), name: str(s && s.name, 40) || 'Semester ' + (i + 1), plan: !!(s && s.plan),
                courses: (s && Array.isArray(s.courses) ? s.courses : []).slice(0, 60).map(c => ({ id: pick(c && c.id, 'c'), name: str(c && c.name, 80), credits: str(c && c.credits, 8), grade: str(c && c.grade, 8) }))
            }))
        };
        if (!out.custom.length) out.custom = SCALES.hec.grades.map(([g, p]) => ({ g, p }));
        out.nextId = id;
        return out;
    }

    const api = { SCALES, SPECIAL, toHundredths, scaleGrades, scaleMax, lowestPass, readGrade, readCredits, resolve, gpa, compute, target, fmt, fmtCr, cleanState, keyOf };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GPA = api;
})(this);
