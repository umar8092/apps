// Checks for core.js: run with `node tests.js`, or open test.html in a browser.
// Every expected value below was worked out by hand.
(function () {
    'use strict';
    const C = typeof require !== 'undefined' ? require('./core.js') : window.ERT;
    let pass = 0, fail = 0;
    const out = [];
    function eq(got, want, what) {
        const g = JSON.stringify(got), w = JSON.stringify(want);
        if (g === w) pass++; else { fail++; out.push('FAIL ' + what + '\n   got:  ' + g + '\n   want: ' + w); }
    }
    const M = (s, got, outOf) => ({ s, got: got * 100, out: outOf * 100 });
    const exam = (id, name, date, results, more) => Object.assign({ id, name, date, at: 0, cls: 'Class 6', results }, more || {});

    // ---------- typed marks ----------
    eq(C.parseMarks('45'), { got: 4500 }, 'plain marks');
    eq(C.parseMarks(' 23,5 '), { got: 2350 }, 'comma decimal');
    eq(C.parseMarks('23.25'), { got: 2325 }, 'two decimals');
    eq(C.parseMarks('23.255').error, 'Use at most 2 decimals, like 23.5.', 'three decimals refused');
    eq(C.parseMarks('31/50'), { got: 3100, out: 5000 }, 'pasted 31/50');
    eq(C.parseMarks('31 out of 50'), { got: 3100, out: 5000 }, '31 out of 50');
    eq(C.parseMarks('62%'), { got: 6200, out: 10000 }, '62% means out of 100');
    eq(C.parseMarks('0'), { got: 0 }, 'zero marks are allowed');
    eq(C.parseMarks(''), { blank: true }, 'blank is skipped, not zero');
    eq(C.parseMarks('   '), { blank: true }, 'spaces only is blank');
    eq(!!C.parseMarks('-5').error, true, 'negative refused');
    eq(!!C.parseMarks('abc').error, true, 'text refused');
    eq(!!C.parseMarks('31/x').error, true, 'bad total refused');
    eq(C.parseMarks('1,050'), { got: 105000 }, 'thousands comma');
    eq(C.parseOut('1,100'), { out: 110000 }, 'board exam total 1,100');
    eq(!!C.parseOut('0').error, true, 'total 0 refused');
    eq(!!C.parseOut('').error, true, 'blank total refused');
    eq(!!C.parseOut('10001').error, true, 'huge total refused');
    eq(C.parseOut('10000'), { out: 1000000 }, 'largest total accepted');

    // ---------- percentages (tenths, half up) ----------
    eq(C.pct(C.pctOf(3100, 5000)), '62%', '31/50 = 62%');
    eq(C.pct(C.pctOf(1800, 2500)), '72%', '18/25 = 72%');
    eq(C.pct(C.pctOf(100, 300)), '33.3%', '1/3 = 33.3%');
    eq(C.pct(C.pctOf(200, 300)), '66.7%', '2/3 = 66.7%');
    eq(C.pct(C.pctOf(2350, 2500)), '94%', '23.5/25 = 94%');
    eq(C.pct(C.pctOf(1, 800)), '0.1%', '0.01/8 = 0.125% -> 0.1%');
    eq(C.pct(C.pctOf(5, 800)), '0.6%', '0.05/8 = 0.625% -> 0.6%');
    eq(C.pct(C.pctOf(0, 2500)), '0%', 'zero marks = 0%');
    eq(C.pct(C.pctOf(1000000, 1000000)), '100%', 'full marks of 10,000');
    eq(C.pct(C.pctOf(37400, 50000)), '74.8%', '374/500 = 74.8%');
    eq(C.marks(2350), '23.5', 'marks 23.5'); eq(C.marks(2325), '23.25', 'marks 23.25'); eq(C.marks(110000), '1,100', 'marks 1,100');
    eq(C.pts(-120), '12', 'points 12'); eq(C.pts(4), '0.4', 'points 0.4');

    // ---------- the main situation: Ali in Class 6 ----------
    const st = C.emptyState();
    const ali = C.cleanChild({ id: 'ali', name: 'Ali', cls: 'Class 6', subjects: ['English', 'Maths', 'Science', 'Urdu', 'Islamiat'], exams: [
        exam('e2', 'Term 1', '2026-03-12', [M('English', 80, 100), M('Maths', 74, 100), M('Science', 70, 100), M('Urdu', 65, 100), M('Islamiat', 85, 100)]),
        exam('e1', 'Monthly test', '2026-02-12', [M('English', 19, 25), M('Maths', 18, 25), M('Science', 16, 25), M('Urdu', 15, 25), { s: 'Islamiat', absent: true }]),
        exam('e3', 'Term 2', '2026-10-15', [M('English', 88, 100), M('Maths', 62, 100), M('Science', 68, 100), M('Urdu', 74, 100), M('Islamiat', 80, 100)], { pos: 5, posOf: 32 })] });
    st.children.push(ali);
    eq(C.sorted(ali).map(e => e.name), ['Monthly test', 'Term 1', 'Term 2'], 'exams sorted by date');
    const o1 = C.overall(ali.exams[1], st.grades);
    eq([o1.got, o1.out, C.pct(o1.p), o1.absent], [6800, 10000, '68%', 1], 'monthly test: 68/100 with Islamiat absent, not zero');
    eq(C.overallText(C.overall(ali.exams[0], st.grades)), '374 / 500 = 74.8%', 'Term 1 overall');
    eq(C.overallText(C.overall(ali.exams[2], st.grades)), '372 / 500 = 74.4%', 'Term 2 overall');
    const a = C.analyse(ali, st);
    eq(C.overallLine(ali, a), 'Overall in Term 2: 372 / 500 = 74.4%, down from 74.8% in Term 1', 'overall line');
    const sub = n => a.subs.find(s => s.name === n);
    eq(C.subjectLine(ali, sub('Maths')), 'Maths: 62% in Term 2, down from 74% in Term 1', 'the answer the parent wants');
    eq(sub('Maths').change, -120, 'Maths down 12 points');
    eq(C.subjectLine(ali, sub('Urdu')), 'Urdu: 74% in Term 2, up from 65% in Term 1', 'Urdu up');
    eq(C.subjectLine(ali, sub('Islamiat')), 'Islamiat: 80% in Term 2, down from 85% in Term 1', 'absent test skipped in comparison');
    eq(sub('Islamiat').have.length, 2, 'Islamiat has 2 results, absent not counted');
    eq(a.attention.map(s => C.attentionText(s, st)), ['Maths 62% (down 12 from 74%)'], 'needs attention: only Maths (Islamiat down 5 is below the 10 point warning)');
    eq(a.improved.name + ' ' + a.improved.change, 'Urdu 90', 'most improved Urdu +9');
    eq(a.best.name, 'English', 'best subject English 88%');
    eq(a.weakest.name, 'Maths', 'lowest subject Maths');
    eq(C.positionText(ali.exams[2]), 'Position 5 of 32', 'position');
    eq(C.summaryText(ali, st).split('\n'), ['Ali (Class 6): exam results', 'Latest: Term 2, 15 Oct 2026. Position 5 of 32', 'Overall in Term 2: 372 / 500 = 74.4%, down from 74.8% in Term 1', '',
        'English: 88% in Term 2, up from 80% in Term 1', 'Maths: 62% in Term 2, down from 74% in Term 1', 'Science: 68% in Term 2, down from 70% in Term 1', 'Urdu: 74% in Term 2, up from 65% in Term 1', 'Islamiat: 80% in Term 2, down from 85% in Term 1', '',
        'Needs attention: Maths 62% (down 12 from 74%)', 'Most improved: Urdu (up 9)', 'Best: English 88%'], 'summary text for a tutor');

    // ---------- settings change what needs attention ----------
    const st2 = Object.assign(C.emptyState(), { flagBelow: 700, flagDrop: 50 });
    eq(C.analyse(ali, st2).attention.map(s => s.name), ['Maths', 'Science', 'Islamiat'], 'below 70% or down 5: Maths, Science (68), Islamiat (down 5)');
    eq(C.attentionText(C.analyse(ali, st2).attention[1], st2), 'Science 68% (below 70%)', 'below text');
    eq(C.attentionText(C.analyse(ali, st2).attention[0], st2), 'Maths 62% (below 70%, down 12 from 74%)', 'both reasons');

    // ---------- grades only: Hira in Class 3 ----------
    const hira = C.cleanChild({ id: 'hira', name: 'Hira', cls: 'Class 3', subjects: ['English', 'Maths', 'Urdu', 'Art'], exams: [
        exam('h1', 'Term 1', '2026-03-10', [{ s: 'English', grade: 'A' }, { s: 'Maths', grade: 'B' }, { s: 'Urdu', grade: 'A+' }, { s: 'Art', grade: 'A' }]),
        exam('h2', 'Term 2', '2026-10-14', [{ s: 'English', grade: 'A+' }, { s: 'Maths', grade: 'c' }, { s: 'Urdu', grade: 'A' }, { s: 'Art', grade: 'A' }])] });
    const h = C.analyse(hira, st), hs = n => h.subs.find(s => s.name === n);
    eq(C.subjectLine(hira, hs('Maths')), 'Maths: grade c in Term 2, down from grade B in Term 1', 'grade line (lowercase grade still matched)');
    eq(hs('Maths').change, -100, 'B 65% to C 55% = down 10');
    eq(h.attention.map(s => s.name), ['Maths', 'Urdu'], 'Maths (B to C, down 10) and Urdu (A+ 90 to A 75, down 15) flagged for the drop');
    eq(C.overallText(C.overall(hira.exams[1], st.grades)), 'about 73.8% (from grades)', 'grade-only overall: A+ 90, C 55, A 75, A 75 = 295/4 = 73.75%');
    eq(C.overall(hira.exams[1], st.grades).p, 738, 'grade average 73.75% -> 73.8%');
    eq(hs('Art').change, 0, 'Art same grade');
    eq(C.subjectLine(hira, hs('Art')), 'Art: grade A in Term 2, same as Term 1', 'same grade text');

    // ---------- mixed marks and grades in one exam ----------
    const mix = C.overall(exam('m', 'Final exam', '2026-06-01', [M('Maths', 40, 50), { s: 'Art', grade: 'A' }, { s: 'PE', absent: true }]), st.grades);
    eq([C.pct(mix.p), mix.mixed, mix.absent], ['80%', true, 1], 'overall uses marks subjects only');
    eq(C.overall(exam('x', 'X', '2026-06-01', [{ s: 'Maths', absent: true }]), st.grades), null, 'all absent: no overall');
    eq(C.resultPct({ s: 'Art', grade: 'Z' }, st.grades), null, 'unknown grade is not counted');

    // ---------- duplicate names, first result, empty child ----------
    const zed = C.cleanChild({ name: 'Zed', subjects: ['Maths'], exams: [
        exam('z1', 'Monthly test', '2026-09-11', [M('Maths', 20, 25)]), exam('z2', 'Monthly test', '2026-10-09', [M('Maths', 15, 25)])] });
    eq(C.subjectLine(zed, C.analyse(zed, st).subs[0]), 'Maths: 60% in Monthly test (9 Oct), down from 80% in Monthly test (11 Sep)', 'same test name gets its date');
    const one = C.cleanChild({ name: 'One', subjects: ['Maths', 'Art'], exams: [exam('o1', 'Term 1', '2026-03-10', [M('Maths', 45, 50)])] });
    const oa = C.analyse(one, st);
    eq(C.subjectLine(one, oa.subs[0]), 'Maths: 90% in Term 1', 'first ever result has no change');
    eq(C.subjectLine(one, oa.subs[1]), 'Art: no result yet', 'subject with no result');
    eq([oa.improved, oa.best, oa.weakest, oa.attention.length], [null, null, null, 0], 'one result: no best/weakest/improved');
    eq(C.summaryText(C.cleanChild({ name: 'New' }), st), 'New: exam results\nNo results yet.', 'empty child summary');
    eq(C.analyse(C.cleanChild({ name: 'New' }), st).subs, [], 'empty child has no subjects');
    // subject in latest exam but not in the list is still shown; a dropped subject is not
    const drop = C.cleanChild({ name: 'D', subjects: ['Maths'], exams: [exam('d1', 'T1', '2026-01-01', [M('Maths', 5, 10), M('Drawing', 5, 10)]), exam('d2', 'T2', '2026-02-01', [M('Maths', 6, 10), M('Physics', 7, 10)])] });
    eq(C.subjectNames(drop), ['Maths', 'Physics'], 'dropped subject hidden, new one shown');

    // ---------- clean state (backup / corrupt save) ----------
    eq(C.cleanState(null), null, 'null refused'); eq(C.cleanState({}), null, 'no children refused'); eq(C.cleanState('x'), null, 'string refused');
    const bad = C.cleanState({ children: [
        { name: '', exams: [] },
        { id: 'k', name: '  Kid   one ', subjects: ['Maths', 'maths', '', 7], out: -5, exams: [
            { id: 'a', name: 'T', date: '2026-02-30', results: [M('Maths', 1, 2)] },
            { id: 'b', name: 'T', date: '2026-02-03', results: [{ s: 'Maths', got: 900, out: 500 }, { s: 'Art', grade: '' }, { s: 'Urdu', absent: true }, { s: 'urdu', absent: true }], pos: 3, posOf: 2 },
            { id: 'c', name: '', date: '2026-02-03', results: [M('Maths', 1, 2)] },
            { id: 'd', name: 'Empty', date: '2026-02-03', results: [] }] }], grades: [{ g: 'A', p: 2000 }], flagBelow: 'x', flagDrop: 0 });
    eq(bad.children.length, 1, 'nameless child dropped');
    eq(C.cleanState({ children: [{ name: 5 }, { name: ['x'] }] }).children.length, 0, 'a number or list as a name is refused');
    eq(bad.children[0].name, 'Kid one', 'name tidied');
    eq(bad.children[0].subjects, ['Maths'], 'duplicate and empty subjects dropped');
    eq(bad.children[0].out, 10000, 'bad usual total reset to 100');
    eq(bad.children[0].exams.map(e => [e.id, e.results, e.pos, e.posOf]), [['b', [{ s: 'Urdu', absent: true }], 3, undefined]], 'bad dates, marks above total, empty grades, repeats, nameless and empty exams dropped; position kept, bad class size dropped');
    eq(bad.grades, C.DEFAULT_GRADES, 'bad grades reset');
    eq([bad.flagBelow, bad.flagDrop], [500, 100], 'bad settings reset');
    const round = C.cleanState(JSON.parse(JSON.stringify(st)));
    eq(C.summaryText(round.children[0], round), C.summaryText(ali, st), 'backup round trip');
    eq(C.splitSubjects('English, maths;Maths\n Science ,,'), ['English', 'maths', 'Science'], 'split typed subjects');
    eq(C.tidy('a'.repeat(100), 40).length, 40, 'very long text cut to 40');

    const result = (fail ? fail + ' FAILED, ' : 'ALL PASSED, ') + pass + ' checks';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.concat(result).join('\n');
    else { out.forEach(x => console.log(x)); console.log(result); if (fail) process.exitCode = 1; }
})();
