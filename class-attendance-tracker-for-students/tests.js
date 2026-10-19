// Logic checks for Class Attendance Tracker for Students. Run: node tests.js (or open test.html).
// Every expected answer below was worked out by hand first.
(function () {
    'use strict';
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : window.AttendCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (got, want, what) => {
        const ok = JSON.stringify(got) === JSON.stringify(want);
        ok ? pass++ : fail++;
        if (!ok) out.push('FAIL ' + what + '\n   got:  ' + JSON.stringify(got) + '\n   want: ' + JSON.stringify(want));
    };
    const S = (held, att, bp, w, left) => ({ held, att, bp: bp || 7500, w: w || 1, left: left == null ? null : left });

    // ---- percents: cut to one decimal, never rounded up
    eq(C.pctOf(18, 24), '75.0%', '18 of 24 is exactly 75.0%');
    eq(C.pctOf(30, 34), '88.2%', '30 of 34 is 88.23..., shown 88.2%');
    eq(C.pctOf(20, 30), '66.6%', '20 of 30 is 66.66..., shown 66.6% (not rounded up to 66.7%)');
    eq(C.pctOf(2999, 4000), '74.9%', '74.975% shows 74.9%, never 75.0%');
    eq(C.pctOf(0, 5), '0.0%', 'none attended');
    eq(C.pctOf(0, 0), '', 'no classes held: no percent');
    eq(C.pctLabel(7500), '75%', 'rule label 75%');
    eq(C.pctLabel(6667), '66.67%', 'rule label 66.67%');
    eq(C.pctLabel(6650), '66.5%', 'rule label 66.5%');

    // ---- the main situation: Physics 18 of 24 at 75%
    let st = C.stats(S(24, 18));
    eq([st.status, st.canMiss, st.ifMiss, st.ifAttend, st.toSpare], ['edge', 0, '72.0%', '76.0%', 3], 'Physics 18/24: on the line, missing drops to 72.0%, attend 3 to spare 1');
    eq(C.advice(st), { main: 'Do not miss the next class: it would drop you to 72.0%.', extra: 'Attend the next 3 classes to be able to miss 1.' }, 'Physics advice');
    // check toSpare by hand: 21/27 then miss -> 21/28 = 75% ok; with 2: 20/26 then miss -> 20/27 = 74.07% not ok

    st = C.stats(S(34, 30));
    eq([st.status, st.canMiss, st.pct], ['safe', 6, '88.2%'], 'Maths 30/34: can miss 6 (30/40 = 75%)');
    eq(C.advice(st).main, 'You can miss 6 classes and stay at 75% or above.', 'Maths advice');
    eq(C.stats(S(40, 30)).canMiss, 0, '30/40 after missing 6 is exactly on the line');

    st = C.stats(S(30, 20));
    eq([st.status, st.need, st.pct], ['below', 10, '66.6%'], 'Chemistry 20/30: attend the next 10 (30/40 = 75%, 29/39 = 74.4%)');
    eq(C.advice(st).main, 'Attend the next 10 classes in a row to get back to 75%.', 'Chemistry advice');
    eq(C.stats(S(4000, 2999)).status, 'below', '2999/4000 is below 75% (no rounding up)');
    eq(C.stats(S(4000, 3000)).status, 'edge', '3000/4000 is exactly 75%');

    // one class only
    eq(C.advice(C.stats(S(4, 4))).main, 'You can miss 1 class and stay at 75% or above.', 'singular "class"');
    eq(C.stats(S(3, 2)).need, 1, '2/3: one more class gets 3/4 = 75%');
    eq(C.advice(C.stats(S(3, 2))).main, 'Attend the next 1 class in a row to get back to 75%.', 'need 1 class');

    // ---- zero / empty
    st = C.stats(S(0, 0));
    eq([st.status, st.pct, st.ifMiss, st.ifAttend], ['none', '', '0.0%', '100.0%'], 'no classes yet');
    eq(C.advice(st).main, 'No classes yet. Tap Present or Absent after each class.', 'no classes advice');
    eq(C.badge(st, 7500), 'No classes yet', 'badge none');
    eq(C.stats(S(5, 0)).need, 15, '0/5 needs 15 in a row (15/20 = 75%)');

    // ---- other rules
    eq(C.stats(S(24, 18, 8000)).need, 6, '80%: 18/24 needs 6 (24/30 = 80%; 23/29 = 79.3%)');
    eq(C.stats(S(20, 20, 8500)).canMiss, 3, '85%: 20/20 can miss 3 (20/23 = 86.9%, 20/24 = 83.3%)');
    eq(C.stats(S(3, 2, 6667)).status, 'below', '66.67%: 2/3 = 66.666...% is below 66.67% (20000 < 20001)');
    eq(C.stats(S(3, 2, 6666)).status, 'edge', '66.66%: 2/3 is just over the line');
    // ---- 100%
    st = C.stats(S(10, 9, 10000));
    eq([st.status, st.need], ['below', null], '100% rule with one miss can never be reached again');
    eq(C.advice(st).main, 'You have missed a class, so you can no longer get back to 100%.', '100% advice');
    st = C.stats(S(10, 10, 10000));
    eq([st.status, st.canMiss, st.toSpare], ['edge', 0, undefined], '100% with full attendance: on the line, never a spare');

    // ---- labs that count as 2 classes
    st = C.stats(S(16, 12, 7500, 2));
    eq([st.status, st.canMiss, st.ifMiss, st.ifAttend], ['edge', 0, '66.6%', '77.7%'], 'lab x2 12/16: missing one lab -> 12/18');
    eq(C.stats(S(16, 12, 7500, 2)).toSpare, 3, 'lab x2 12/16: attend 3 labs (18/22) then miss one -> 18/24 = 75%');
    eq(C.stats(S(20, 12, 7500, 2)).need, 6, 'lab x2 12/20: 6 labs in a row -> 24/32 = 75% (5 labs -> 22/30 = 73.3%)');
    eq(C.stats(S(24, 20, 7500, 2)).canMiss, 1, 'lab x2 20/24: miss one lab -> 20/26 = 76.9%, two -> 20/28 = 71.4%');

    // ---- term plan
    st = C.stats(S(24, 18, 7500, 1, 12));
    eq(st.plan, { left: 12, must: 9, spare: 3, ifAll: '83.3%' }, 'Physics with 12 left: attend 9 of 12 (27/36 = 75%)');
    eq(C.planText(st), 'To end the term at 75%, attend at least 9 of the 12 classes left (you can miss 3).', 'plan text');
    st = C.stats(S(30, 20, 7500, 1, 8));
    eq(st.plan, { left: 8, impossible: true, best: '73.6%' }, 'Chemistry 20/30 with 8 left cannot reach 75% (28/38 = 73.68%)');
    eq(C.planText(st), 'Even if you attend all 8 classes left, you end the term at 73.6%, below 75%. Ask your college about medical leave or extra classes.', 'impossible text');
    st = C.stats(S(30, 20, 7500, 1, 10));
    eq([st.plan.must, st.plan.spare], [10, 0], 'Chemistry with exactly 10 left must attend all 10');
    eq(C.planText(st), 'To end the term at 75%, attend all 10 classes left.', 'attend all text');
    st = C.stats(S(0, 0, 7500, 1, 40));
    eq([st.plan.must, st.plan.spare], [30, 10], 'new term with 40 classes: attend 30, miss 10');
    eq(C.stats(S(0, 0, 7500, 1, 0)).plan, { left: 0, none: true }, 'no classes at all');
    eq(C.planText(C.stats(S(24, 20, 7500, 1, 0))), 'No classes left this term. You end at 83.3%.', 'term over, safe');
    eq(C.planText(C.stats(S(24, 10, 7500, 1, 0))), 'The term is over at 41.6%, below 75%.', 'term over, below');
    eq(C.stats(S(16, 12, 7500, 2, 4)).plan, { left: 4, must: 3, spare: 1, ifAll: '83.3%' }, 'labs x2, 4 labs left: end 24 held, need 18 -> 3 of 4');

    // ---- marking
    let s = { id: 1, name: 'Physics', held: 24, att: 18, bp: 7500, w: 1, left: 12, log: [] };
    let n = C.mark(s, 'p', '2026-10-19');
    eq([n.held, n.att, n.left, n.log], [25, 19, 11, [{ d: '2026-10-19', k: 'p' }]], 'Present adds to held and attended, one fewer left');
    eq([s.held, s.log.length], [24, 0], 'mark does not change the original (undo keeps working)');
    n = C.mark(s, 'a', '2026-10-19'); eq([n.held, n.att, n.left], [25, 18, 11], 'Absent adds to held only');
    n = C.mark(s, 'c', '2026-10-19'); eq([n.held, n.att, n.left, n.log[0].k], [24, 18, 11, 'c'], 'Cancelled does not count, one fewer left');
    n = C.mark(Object.assign({}, s, { w: 2 }), 'p', '2026-10-19'); eq([n.held, n.att], [26, 20], 'a lab counted as 2');
    n = C.mark(Object.assign({}, s, { left: 0 }), 'p', '2026-10-19'); eq(n.left, 0, 'left never goes below 0');
    n = C.mark(Object.assign({}, s, { left: null }), 'p', '2026-10-19'); eq(n.left, null, 'no term plan stays none');
    eq(C.mark(Object.assign({}, s, { held: 5000, att: 5000 }), 'p', '2026-10-19'), null, 'cannot go past 5000 classes');
    eq(C.mark(s, 'x', '2026-10-19'), null, 'unknown kind');

    // ---- the form
    const F = o => Object.assign({ name: 'Physics', rule: '75', pct: '', held: '24', att: '18', w: '1', left: '' }, o);
    eq(C.readForm(F(), []), { ok: true, subject: { name: 'Physics', bp: 7500, w: 1, held: 24, att: 18, left: null } }, 'normal subject');
    eq(C.readForm(F({ held: '', att: '' }), []).subject.held, 0, 'blank totals mean the term has just started');
    eq(C.readForm(F({ name: '  ' }), []).errors.name, 'Type the subject name, like Physics.', 'blank name');
    eq(C.readForm(F({ name: 'physics' }), [{ name: 'Physics' }]).errors.name, 'You already have physics. Use a different name, like physics lab.', 'same name twice');
    eq(C.readForm(F({ att: '30' }), []).errors.att, 'Attended (30) cannot be more than held (24).', 'attended over held');
    eq(C.readForm(F({ held: '-3' }), []).errors.held, 'Classes held cannot be below 0.', 'negative');
    eq(C.readForm(F({ held: '24.5' }), []).errors.held, 'Use a whole number of classes for classes held.', 'decimal');
    eq(C.readForm(F({ held: 'abc' }), []).errors.held, 'Type a whole number, like 24.', 'not a number');
    eq(C.readForm(F({ held: '99999' }), []).errors.held, 'Use a number up to 5000.', 'huge');
    eq(C.readForm(F({ held: ' 1,200 ', att: '900' }), []).subject.held, 1200, 'pasted with spaces and a thousands comma');
    eq(C.readForm(F({ rule: 'other', pct: '66,67' }), []).subject.bp, 6667, 'own percent with a comma decimal');
    eq(C.readForm(F({ rule: 'other', pct: '66.67%' }), []).subject.bp, 6667, 'own percent with a % sign');
    eq(C.readForm(F({ rule: 'other', pct: '0' }), []).errors.pct, 'Type a percent from 1 to 100, like 75.', '0% refused');
    eq(C.readForm(F({ rule: 'other', pct: '101' }), []).errors.pct, 'Type a percent from 1 to 100, like 75.', '101% refused');
    eq(C.readForm(F({ rule: 'other', pct: '' }), []).errors.pct, 'Type a percent from 1 to 100, like 75.', 'blank own percent');
    eq(C.readForm(F({ left: '12' }), []).subject.left, 12, 'classes left');
    eq(C.readForm(F({ left: '0' }), []).subject.left, 0, 'zero classes left is allowed');
    eq(C.readForm(F({ left: 'x' }), []).errors.left, 'Type a whole number of classes, like 12, or leave it blank.', 'bad classes left');
    eq(C.readForm(F({ w: '2' }), []).subject.w, 2, 'labs count as 2');
    eq(C.readForm(F({ w: '9' }), []).subject.w, 1, 'odd weight falls back to 1');
    eq(C.readForm(F({ name: 'A'.repeat(80) }), []).subject.name.length, 50, 'very long name is cut to 50');

    // ---- summary and overall
    const subs = [
        { id: 1, name: 'Physics', held: 24, att: 18, bp: 7500, w: 1, left: 12, log: [] },
        { id: 2, name: 'Maths', held: 34, att: 30, bp: 7500, w: 1, left: null, log: [] },
        { id: 3, name: 'Chemistry', held: 30, att: 20, bp: 7500, w: 1, left: null, log: [] },
        { id: 4, name: 'English', held: 0, att: 0, bp: 7500, w: 1, left: null, log: [] }];
    const sm = C.summary(subs);
    eq([sm.below.map(r => r.s.name), sm.edge.map(r => r.s.name), sm.safe.map(r => r.s.name), sm.none.map(r => r.s.name)],
        [['Chemistry'], ['Physics'], ['Maths'], ['English']], 'summary groups');
    eq([sm.all.att, sm.all.held, sm.all.pct, sm.all.safe], [68, 88, '77.2%', true], 'all subjects: 68 of 88 = 77.27% -> 77.2%');
    eq(C.overall([subs[0], Object.assign({}, subs[1], { bp: 8000 })]).oneRule, null, 'mixed rules: no single overall rule');
    eq(C.overall([]).pct, '', 'no subjects');

    // ---- copy text
    const txt = C.listText({ term: 'Fall 2026', subjects: subs }, '2026-10-19');
    eq(txt.split('\n')[0], 'Class attendance on 19 Oct 2026 (Fall 2026)', 'copy title');
    eq(txt.includes('Physics: 18 of 24 (75.0%), needs 75%. Do not miss the next class: it would drop you to 72.0%. To end the term at 75%, attend at least 9 of the 12 classes left (you can miss 3).'), true, 'copy Physics line');
    eq(txt.includes('English: no classes yet, needs 75%.'), true, 'copy empty subject');
    eq(txt.split('\n').pop(), 'All subjects together: 68 of 88 (77.2%)', 'copy overall');

    // ---- saved state and backups
    eq(C.validate(null), null, 'null state');
    eq(C.validate({ subjects: 'x' }), null, 'bad subjects');
    const v = C.validate({ subjects: [subs[0], { id: 9, name: 'Bad', held: 3, att: 5 }, { id: 1, name: 'Dup id', held: 1, att: 1 }, { id: 5, name: '', held: 1, att: 1 },
        { id: 6, name: 'Odd', held: 4, att: 2, bp: 99999, w: 7, left: -1, log: [{ d: 'x', k: 'p' }, { d: '2026-10-01', k: 'a' }, { d: '2026-10-02', k: 'z' }] }], nextId: 2 });
    eq(v.subjects.map(s => s.name), ['Physics', 'Odd'], 'bad rows dropped: attended > held, duplicate id, blank name');
    eq([v.subjects[1].bp, v.subjects[1].w, v.subjects[1].left, v.subjects[1].log], [7500, 1, null, [{ d: '2026-10-01', k: 'a' }]], 'bad values repaired');
    eq(v.nextId, 7, 'nextId moved past the largest id');
    eq(C.readBackup('not json'), null, 'broken backup');
    eq(C.readBackup(JSON.stringify({ app: 'other-app', state: { subjects: [] } })), null, 'another app\'s backup');
    eq(C.readBackup(JSON.stringify({ app: C.SLUG, state: { subjects: subs } })).subjects.length, 4, 'good backup');
    eq(C.validate({ subjects: [], last: { ended: '2026-06-30', term: 'Spring', subjects: [subs[1]] } }).last.subjects[0].name, 'Maths', 'last term kept');

    // ---- dates
    eq(C.shortDate('2026-10-19'), 'Mon 19 Oct', 'short date');
    eq(C.longDate('2026-10-19'), '19 Oct 2026', 'long date');
    eq(C.isDate('2026-02-29'), false, 'no 29 Feb 2026');

    const summaryLine = 'Logic checks: ' + pass + ' passed, ' + fail + ' failed';
    if (typeof module !== 'undefined' && module.exports) { out.forEach(l => console.log(l)); console.log(summaryLine); process.exitCode = fail ? 1 : 0; }
    else { const pre = document.createElement('pre'); pre.textContent = out.concat([summaryLine]).join('\n'); document.body.appendChild(pre); }
})();
