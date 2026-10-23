// Exam Result and Report Card Tracker for Parents: the maths and the words, with no page code, so tests.js can check it in node.
// Marks are whole hundredths (23.5 is 2350) and percentages are whole tenths (62.5% is 625), so every total and change is exact.
// Each child has their own subjects and results. A result is marks out of any total, a grade from the school's scale, or absent.
// Absent is never counted as zero. Dates are calendar days ('2026-10-17').
(function (root) {
    'use strict';
    const MAXOUT = 1000000;   // 10,000 marks, in hundredths
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // grade -> counts as % (tenths); a common scale (A+ 80 to 100, A 70 to 79 ... F below 33); the parent can change it
    const DEFAULT_GRADES = [{ g: 'A+', p: 900 }, { g: 'A', p: 750 }, { g: 'B', p: 650 }, { g: 'C', p: 550 }, { g: 'D', p: 450 }, { g: 'E', p: 360 }, { g: 'F', p: 200 }];
    const FLAG_BELOW = [330, 400, 500, 600, 700], FLAG_DROP = [50, 100, 150, 200];

    // ---------- small helpers ----------
    const pad = n => String(n).padStart(2, '0');
    const dayStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dayStr(new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8))) === s;
    const niceDate = s => +s.slice(8) + ' ' + MONTHS[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4);
    const shortDate = s => +s.slice(8) + ' ' + MONTHS[+s.slice(5, 7) - 1];
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
    const key = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const tidy = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    // ---------- numbers ----------
    // one number: "45" "23.5" "23,5" -> hundredths, or null
    function num(s) {
        s = String(s).trim();
        s = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
        if (/^\d*\.\d{3,}$/.test(s)) return NaN;
        if (!/^\d+(\.\d{1,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null;
        const v = Math.round(parseFloat(s) * 100);
        return Number.isFinite(v) ? v : null;
    }
    // what a parent types in the marks box: "45", "23.5", "45/50", "45 out of 50", "62%"
    // -> { got, out? } in hundredths, or { error }
    function parseMarks(text) {
        let s = String(text == null ? '' : text).replace(/ /g, ' ').trim().toLowerCase();
        if (!s) return { blank: true };
        if (/^[-−–]/.test(s)) return { error: 'Marks cannot be below zero.' };
        let out;
        const pc = s.match(/^(.+?)\s*%$/);
        if (pc) { s = pc[1]; out = 10000; }
        const m = s.match(/^(.+?)\s*(?:\/|out of|of)\s*(.+)$/);
        if (m && out == null) { s = m[1]; out = num(m[2]); if (out == null || Number.isNaN(out)) return { error: 'Type the marks like 45, or 45/50.' }; }
        const got = num(s);
        if (Number.isNaN(got)) return { error: 'Use at most 2 decimals, like 23.5.' };
        if (got == null) return { error: 'Type the marks as a number, like 45 or 23.5.' };
        return out == null ? { got } : { got, out };
    }
    function parseOut(text) {
        const s = String(text == null ? '' : text).trim();
        if (!s) return { error: 'Type the total marks, such as 50 or 100.' };
        const v = num(s);
        if (v == null || Number.isNaN(v)) return { error: 'Type the total as a number, such as 50.' };
        if (v <= 0) return { error: 'The total must be more than 0.' };
        if (v > MAXOUT) return { error: 'The total can be at most 10,000.' };
        return { out: v };
    }
    // hundredths -> "45", "23.5", "1,250"
    function marks(h) {
        const neg = h < 0; h = Math.abs(h);
        const w = Math.floor(h / 100), f = h % 100;
        const ws = String(w).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return (neg ? '-' : '') + ws + (f ? '.' + (f % 10 ? pad(f) : String(f / 10)) : '');
    }
    // percentage in tenths, rounded half up; got and out in hundredths
    const pctOf = (got, out) => Math.floor((got * 1000 * 2 + out) / (2 * out));
    // tenths -> "62%" or "62.5%"
    const pct = t => (t % 10 ? (t / 10).toFixed(1) : String(t / 10)) + '%';
    // tenths of percentage points -> "12" or "3.2"
    const pts = t => { t = Math.abs(t); return t % 10 ? (t / 10).toFixed(1) : String(t / 10); };

    // ---------- grades ----------
    function gradeOf(grades, g) { const k = key(g); return grades.find(x => key(x.g) === k) || null; }
    // one result -> % in tenths, or null when absent or unknown grade
    function resultPct(r, grades) {
        if (!r || r.absent) return null;
        if (r.grade != null) { const g = gradeOf(grades, r.grade); return g ? g.p : null; }
        return pctOf(r.got, r.out);
    }
    function resultText(r) {
        if (r.absent) return 'Absent';
        if (r.grade != null) return 'Grade ' + r.grade;
        return marks(r.got) + ' / ' + marks(r.out);
    }

    // ---------- exams ----------
    const byDate = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.at || 0) - (b.at || 0);
    function sorted(child) { return child.exams.slice().sort(byDate); }
    // the name used in sentences: "Term 2", or "Monthly test (12 Oct)" when the child has another with the same name
    function examLabel(child, ex) {
        const same = child.exams.filter(e => key(e.name) === key(ex.name)).length;
        return same > 1 ? ex.name + ' (' + shortDate(ex.date) + (child.exams.some(e => e !== ex && key(e.name) === key(ex.name) && e.date.slice(0, 4) !== ex.date.slice(0, 4)) ? ' ' + ex.date.slice(0, 4) : '') + ')' : ex.name;
    }
    // overall for one exam: total marks of the subjects with marks; if only grades, the average of what the grades count as
    function overall(ex, grades) {
        let got = 0, out = 0, n = 0, gsum = 0, gn = 0, absent = 0;
        ex.results.forEach(r => {
            if (r.absent) { absent++; return; }
            if (r.grade != null) { const g = gradeOf(grades, r.grade); if (g) { gsum += g.p; gn++; } return; }
            got += r.got; out += r.out; n++;
        });
        if (n) return { got, out, p: pctOf(got, out), n, fromGrades: false, mixed: gn > 0, absent };
        if (gn) return { p: Math.floor((gsum * 2 + gn) / (2 * gn)), n: gn, fromGrades: true, mixed: false, absent };
        return null;
    }
    function overallText(o) {
        if (!o) return 'No marks';
        if (o.fromGrades) return 'about ' + pct(o.p) + ' (from grades)';
        return marks(o.got) + ' / ' + marks(o.out) + ' = ' + pct(o.p);
    }

    // ---------- the picture for one child ----------
    // subjects shown: the child's subject list, plus any subject in the latest exam
    function subjectNames(child) {
        const list = child.subjects.slice(), ks = new Set(list.map(key));
        const ex = sorted(child), last = ex[ex.length - 1];
        if (last) last.results.forEach(r => { if (!ks.has(key(r.s))) { ks.add(key(r.s)); list.push(r.s); } });
        return list;
    }
    function series(child, subject, grades) {
        const k = key(subject), pts = [];
        sorted(child).forEach(ex => {
            const r = ex.results.find(x => key(x.s) === k);
            if (!r) return;
            pts.push({ ex, r, p: resultPct(r, grades) });
        });
        return pts;
    }
    function analyse(child, st) {
        const grades = st.grades, ex = sorted(child);
        const subs = subjectNames(child).map(name => {
            const all = series(child, name, grades), have = all.filter(x => x.p != null);
            const last = have[have.length - 1] || null, prev = have.length > 1 ? have[have.length - 2] : null;
            const lastAny = all[all.length - 1] || null;
            const change = last && prev ? last.p - prev.p : null;
            const flags = [];
            if (last && last.p < st.flagBelow) flags.push('below');
            if (change != null && change <= -st.flagDrop) flags.push('drop');
            return { name, all, have, last, prev, change, flags, absentLast: !!(lastAny && lastAny.r.absent) };
        });
        const ov = ex.map(e => ({ ex: e, o: overall(e, grades) })).filter(x => x.o);
        const lastOv = ov[ov.length - 1] || null, prevOv = ov.length > 1 ? ov[ov.length - 2] : null;
        const withLast = subs.filter(s => s.last);
        const weakest = withLast.length > 1 ? withLast.reduce((a, b) => b.last.p < a.last.p ? b : a) : null;
        const best = withLast.length > 1 ? withLast.reduce((a, b) => b.last.p > a.last.p ? b : a) : null;
        const ups = subs.filter(s => s.change > 0), downs = subs.filter(s => s.change < 0);
        const improved = ups.length ? ups.reduce((a, b) => b.change > a.change ? b : a) : null;
        const dropped = downs.length ? downs.reduce((a, b) => b.change < a.change ? b : a) : null;
        return { exams: ex, subs, ov, lastOv, prevOv, weakest: weakest && best && weakest.last.p !== best.last.p ? weakest : null,
            best: weakest && best && weakest.last.p !== best.last.p ? best : null, improved, dropped, attention: subs.filter(s => s.flags.length) };
    }
    function shown(child, x) { return x.r.grade != null ? 'grade ' + x.r.grade : pct(x.p); }
    // "Maths: 62% in Term 2, down from 74% in Term 1"
    function subjectLine(child, s) {
        if (!s.last) return s.name + ': ' + (s.absentLast ? 'absent in ' + examLabel(child, s.all[s.all.length - 1].ex) : 'no result yet');
        let t = s.name + ': ' + shown(child, s.last) + ' in ' + examLabel(child, s.last.ex);
        if (s.prev) {
            const word = s.change > 0 ? 'up' : s.change < 0 ? 'down' : 'same as';
            t += s.change === 0 ? ', same as ' + examLabel(child, s.prev.ex) : ', ' + word + ' from ' + shown(child, s.prev) + ' in ' + examLabel(child, s.prev.ex);
        }
        if (s.absentLast) t += ' (absent in ' + examLabel(child, s.all[s.all.length - 1].ex) + ')';
        return t;
    }
    function changeText(c) { return c == null ? '' : c > 0 ? 'up ' + pts(c) : c < 0 ? 'down ' + pts(c) : 'no change'; }
    function overallLine(child, a) {
        if (!a.lastOv) return '';
        const l = a.lastOv;
        let t = 'Overall in ' + examLabel(child, l.ex) + ': ' + overallText(l.o);
        if (a.prevOv) {
            const c = l.o.p - a.prevOv.o.p;
            t += c === 0 ? ', same as ' + examLabel(child, a.prevOv.ex) : ', ' + (c > 0 ? 'up' : 'down') + ' from ' + pct(a.prevOv.o.p) + ' in ' + examLabel(child, a.prevOv.ex);
        }
        return t;
    }
    function attentionText(s, st) {
        const parts = [];
        if (s.flags.includes('below')) parts.push('below ' + pct(st.flagBelow));
        if (s.flags.includes('drop')) parts.push('down ' + pts(s.change) + ' from ' + pct(s.prev.p));
        return s.name + ' ' + pct(s.last.p) + ' (' + parts.join(', ') + ')';
    }
    function positionText(ex) { return ex.pos ? 'Position ' + ex.pos + (ex.posOf ? ' of ' + ex.posOf : '') : ''; }
    // the summary a parent copies for a tutor or the other parent
    function summaryText(child, st) {
        const a = analyse(child, st), L = [];
        L.push(child.name + (child.cls ? ' (' + child.cls + ')' : '') + ': exam results');
        if (!a.exams.length) { L.push('No results yet.'); return L.join('\n'); }
        const last = a.exams[a.exams.length - 1];
        L.push('Latest: ' + examLabel(child, last) + ', ' + niceDate(last.date) + (positionText(last) ? '. ' + positionText(last) : ''));
        const ol = overallLine(child, a); if (ol) L.push(ol);
        L.push('');
        a.subs.forEach(s => L.push(subjectLine(child, s)));
        if (a.attention.length) { L.push(''); L.push('Needs attention: ' + a.attention.map(s => attentionText(s, st)).join('; ')); }
        if (a.improved) L.push('Most improved: ' + a.improved.name + ' (up ' + pts(a.improved.change) + ')');
        if (a.best) L.push('Best: ' + a.best.name + ' ' + shown(child, a.best.last));
        return L.join('\n');
    }

    // ---------- state ----------
    function emptyState() { return { v: 1, children: [], grades: DEFAULT_GRADES.map(g => ({ g: g.g, p: g.p })), flagBelow: 500, flagDrop: 100 }; }
    const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    function cleanGrades(a) {
        if (!Array.isArray(a)) return null;
        const out = [], seen = new Set();
        a.slice(0, 30).forEach(x => {
            if (!x || typeof x !== 'object') return;
            const g = tidy(x.g, 6); if (!g || seen.has(key(g)) || !intIn(x.p, 0, 1000)) return;
            seen.add(key(g)); out.push({ g, p: x.p });
        });
        return out.length ? out : null;
    }
    function cleanResult(r) {
        if (!r || typeof r !== 'object') return null;
        const s = typeof r.s === 'string' ? tidy(r.s, 30) : ''; if (!s) return null;
        if (r.absent === true) return { s, absent: true };
        if (r.grade != null) { const g = tidy(r.grade, 6); return g ? { s, grade: g } : null; }
        if (!intIn(r.out, 1, MAXOUT) || !intIn(r.got, 0, r.out)) return null;
        return { s, got: r.got, out: r.out };
    }
    function cleanExam(e) {
        if (!e || typeof e !== 'object' || !isDay(e.date)) return null;
        const name = typeof e.name === 'string' ? tidy(e.name, 40) : ''; if (!name) return null;
        const results = [], seen = new Set();
        (Array.isArray(e.results) ? e.results : []).slice(0, 40).forEach(r => { const c = cleanResult(r); if (c && !seen.has(key(c.s))) { seen.add(key(c.s)); results.push(c); } });
        if (!results.length) return null;
        const x = { id: tidy(e.id, 40) || newId(), name, date: e.date, at: Number.isFinite(e.at) ? e.at : 0, cls: tidy(e.cls, 30), results };
        if (intIn(e.pos, 1, 100000)) { x.pos = e.pos; if (intIn(e.posOf, e.pos, 100000)) x.posOf = e.posOf; }
        return x;
    }
    function cleanChild(c) {
        if (!c || typeof c !== 'object') return null;
        const name = typeof c.name === 'string' ? tidy(c.name, 40) : ''; if (!name) return null;
        const subjects = [], ks = new Set();
        (Array.isArray(c.subjects) ? c.subjects : []).slice(0, 40).forEach(s => { const t = typeof s === 'string' ? tidy(s, 30) : ''; if (t && !ks.has(key(t))) { ks.add(key(t)); subjects.push(t); } });
        const exams = [], ids = new Set();
        (Array.isArray(c.exams) ? c.exams : []).slice(0, 500).forEach(e => { const x = cleanExam(e); if (x && !ids.has(x.id)) { ids.add(x.id); exams.push(x); } });
        return { id: tidy(c.id, 40) || newId(), name, cls: tidy(c.cls, 30), subjects, exams, out: intIn(c.out, 1, MAXOUT) ? c.out : 10000 };
    }
    function cleanState(o) {
        if (!o || typeof o !== 'object' || !Array.isArray(o.children)) return null;
        const s = emptyState();
        s.grades = cleanGrades(o.grades) || s.grades;
        if (intIn(o.flagBelow, 0, 1000)) s.flagBelow = o.flagBelow;
        if (intIn(o.flagDrop, 1, 1000)) s.flagDrop = o.flagDrop;
        const ids = new Set();
        o.children.slice(0, 30).forEach(x => { const c = cleanChild(x); if (c && !ids.has(c.id)) { ids.add(c.id); s.children.push(c); } });
        return s;
    }
    // "English, Maths; Science" -> ['English', 'Maths', 'Science'] without repeats
    function splitSubjects(text) {
        const out = [], ks = new Set();
        String(text || '').split(/[,;\n]+/).forEach(p => { const t = tidy(p, 30); if (t && !ks.has(key(t))) { ks.add(key(t)); out.push(t); } });
        return out;
    }

    const api = { MAXOUT, MONTHS, DEFAULT_GRADES, FLAG_BELOW, FLAG_DROP, pad, dayStr, isDay, niceDate, shortDate, plural, key, tidy, newId,
        num, parseMarks, parseOut, marks, pctOf, pct, pts, gradeOf, resultPct, resultText, sorted, examLabel, overall, overallText,
        subjectNames, series, analyse, subjectLine, changeText, overallLine, attentionText, positionText, summaryText,
        emptyState, cleanGrades, cleanResult, cleanExam, cleanChild, cleanState, splitSubjects };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ERT = api;
})(typeof window !== 'undefined' ? window : this);
