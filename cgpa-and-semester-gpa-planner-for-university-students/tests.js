// Checks for core.js. Run: node tests.js   (or open test.html in a browser)
// Every expected number below was worked out by hand first.
(function () {
    const G = typeof module !== 'undefined' && module.exports !== undefined && typeof require !== 'undefined' ? require('./core.js') : window.GPA;
    let pass = 0, failN = 0; const out = [];
    function eq(name, got, want) {
        const ok = JSON.stringify(got) === JSON.stringify(want);
        if (ok) pass++; else { failN++; out.push('FAIL ' + name + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }
    }
    let n = 0;
    const C = (name, credits, grade) => ({ id: 'c' + (++n), name, credits, grade });
    const S = (name, courses, plan) => ({ id: 's' + (++n), name, plan: !!plan, courses });
    const st = (o) => Object.assign({ scale: 'hec', custom: [], pointsMax: '4', rounding: 'round', retake: 'latest', target: '', total: '', base: { on: false }, semesters: [] }, o);

    // parsing
    eq('parse 3.67', G.toHundredths('3.67'), 367);
    eq('parse comma 3,5', G.toHundredths('3,5'), 350);
    eq('parse .5', G.toHundredths('.5'), 50);
    eq('parse blank', G.toHundredths('  '), null);
    eq('parse 3.675 is not allowed', Number.isNaN(G.toHundredths('3.675')), true);
    eq('parse negative not allowed', Number.isNaN(G.toHundredths('-1')), true);
    eq('parse text not allowed', Number.isNaN(G.toHundredths('abc')), true);
    eq('fmt 1000', G.fmt(1000), '10.00');
    eq('fmtCr 150', G.fmtCr(150), '1.5');
    eq('fmtCr 1500', G.fmtCr(1500), '15');

    // Semester 1 on the HEC scale: 3 cr A, 4 cr B+, 3 cr B-, 2 cr A- = 40.67 / 12 = 3.38916..
    const s1 = S('Semester 1', [C('Calculus', '3', 'A'), C('Programming', '4', 'B+'), C('English', '3', 'B-'), C('Islamic Studies', '2', 'A-')]);
    let r = G.compute(st({ semesters: [s1] }));
    eq('semester GPA rounded 3.39', G.fmt(r.rows[0].gpa), '3.39');
    eq('semester credits 12', r.rows[0].cr, 1200);
    eq('CGPA after 3.39', G.fmt(r.soFar.cgpa), '3.39');
    r = G.compute(st({ semesters: [s1], rounding: 'cut' }));
    eq('semester GPA cut 3.38', G.fmt(r.rows[0].gpa), '3.38');
    // grade letters are matched without case
    r = G.compute(st({ semesters: [S('x', [C('a', '3', 'b+')])] }));
    eq('lowercase b+ is B+', G.fmt(r.soFar.cgpa), '3.33');

    // Two semesters: S2 = 3 cr C (2.00), 3 cr B (3.00) -> 15 / 6 = 2.50; CGPA = (40.67 + 15) / 18 = 3.0927 -> 3.09
    const s2 = S('Semester 2', [C('Physics', '3', 'C'), C('Stats', '3', 'B')]);
    r = G.compute(st({ semesters: [s1, s2] }));
    eq('S2 GPA 2.50', G.fmt(r.rows[1].gpa), '2.50');
    eq('CGPA after S2 3.09', G.fmt(r.rows[1].cgpa), '3.09');
    eq('earned 18', r.soFar.earned, 1800);

    // Target: earlier record 2.84 over 92, degree 136, target 3.00 -> (408 - 261.28) / 44 = 3.3345 -> at least 3.34
    let t = G.compute(st({ base: { on: true, cgpa: '2.84', credits: '92' }, target: '3.00', total: '136' })).target;
    eq('target status need', t.status, 'need');
    eq('need 3.34', G.fmt(t.need), '3.34');
    eq('left 44', t.R, 4400);
    eq('best reachable 3.21', G.fmt(t.best), '3.21');   // (261.28 + 176) / 136 = 3.2153
    // needing exactly a round number: 3.00 over 60, degree 120, target 3.50 -> (420 - 180) / 60 = 4.00 exactly: reachable
    t = G.compute(st({ base: { on: true, cgpa: '3', credits: '60' }, target: '3.5', total: '120' })).target;
    eq('need exactly 4.00 is still reachable', [t.status, G.fmt(t.need)], ['need', '4.00']);
    // impossible: 2.00 over 120, degree 130, target 3.00 -> needs 15.00
    t = G.compute(st({ base: { on: true, cgpa: '2.00', credits: '120' }, target: '3.00', total: '130' })).target;
    eq('impossible', t.status, 'impossible');
    eq('impossible best 2.15', G.fmt(t.best), '2.15');  // (240 + 40) / 130 = 2.1538
    // safe: 3.90 over 120, degree 130, target 3.50 -> 0 x 10 left still gives 468 / 130 = 3.60
    t = G.compute(st({ base: { on: true, cgpa: '3.90', credits: '120' }, target: '3.50', total: '130' })).target;
    eq('safe', [t.status, G.fmt(t.worst)], ['safe', '3.60']);
    // finished: all credits done
    t = G.compute(st({ base: { on: true, cgpa: '3.10', credits: '136' }, target: '3.00', total: '136' })).target;
    eq('finished reached', [t.status, t.reached, G.fmt(t.final)], ['finished', true, '3.10']);
    t = G.compute(st({ base: { on: true, cgpa: '3.10', credits: '140' }, target: '3.20', total: '136' })).target;
    eq('more credits than the degree', [t.status, t.over, t.reached], ['finished', true, false]);
    // no grades yet: you need the target itself in every credit hour
    t = G.compute(st({ target: '3.00', total: '130' })).target;
    eq('nothing typed: need = target', [t.status, G.fmt(t.need), t.R], ['need', '3.00', 13000]);
    // missing or bad inputs
    eq('no target', G.compute(st({ total: '130' })).target.status, 'notarget');
    eq('no total', G.compute(st({ target: '3' })).target.status, 'nototal');
    eq('target above scale', G.compute(st({ target: '4.5', total: '130' })).target.status, 'badtarget');
    eq('target text', G.compute(st({ target: 'abc', total: '130' })).target.status, 'badtarget');
    eq('total zero', G.compute(st({ target: '3', total: '0' })).target.status, 'badtotal');
    eq('total huge', G.compute(st({ target: '3', total: '99999999' })).target.status, 'badtotal');
    // 10-point scale: O (10) 4 cr + B (6) 3 cr = 58 / 7 = 8.2857 -> 8.29; target 9 above 8.29 over 7 with 160 total
    r = G.compute(st({ scale: 'ten', semesters: [S('Sem 1', [C('Maths', '4', 'O'), C('Chem', '3', 'B')])], target: '9', total: '160' }));
    eq('10-point SGPA 8.29', G.fmt(r.rows[0].gpa), '8.29');
    // (9 x 160 - 58) / 153 = 1382 / 153 = 9.0327 -> 9.04
    eq('10-point need 9.04', G.fmt(r.target.need), '9.04');
    eq('10-point max 10', r.max, 1000);
    // 10-point P is a real grade (4 points), not a pass/fail mark
    r = G.compute(st({ scale: 'ten', semesters: [S('Sem 1', [C('Lab', '2', 'P')])] }));
    eq('10-point P = 4.00', G.fmt(r.soFar.cgpa), '4.00');
    // 5.0 scale
    r = G.compute(st({ scale: 'five', semesters: [S('100L', [C('a', '3', 'A'), C('b', '2', 'C'), C('c', '1', 'E')])] }));
    eq('5-point 22 / 6 = 3.67', G.fmt(r.soFar.cgpa), '3.67');   // 15 + 6 + 1 = 22 / 6 = 3.666
    // US scale A- = 3.7: 3 cr A- + 3 cr B+ = 21 / 6 = 3.50
    r = G.compute(st({ scale: 'us', semesters: [S('Fall', [C('a', '3', 'A-'), C('b', '3', 'B+')])] }));
    eq('US scale 3.50', G.fmt(r.soFar.cgpa), '3.50');
    // grade points typed directly, top 4: 3.5 x 3 + 2.8 x 2 = 16.1 / 5 = 3.22
    r = G.compute(st({ scale: 'points', semesters: [S('Sem', [C('a', '3', '3.5'), C('b', '2', '2,8')])] }));
    eq('typed points 3.22', G.fmt(r.soFar.cgpa), '3.22');
    r = G.compute(st({ scale: 'points', semesters: [S('Sem', [C('a', '3', '4.5')])] }));
    eq('typed point above max is flagged', Object.values(r.info)[0].status, 'bad');
    // custom scale, with junk rows ignored
    const cust = [{ g: 'A', p: '4' }, { g: 'B', p: '3.5' }, { g: '', p: '2' }, { g: 'X', p: 'abc' }, { g: 'b', p: '1' }];
    eq('custom scale keeps valid unique grades', G.scaleGrades(st({ scale: 'custom', custom: cust })).map(x => x.g + x.p), ['A400', 'B350']);

    // Pass / Withdrawn / Incomplete: not in GPA. Pass earns credits.
    r = G.compute(st({ semesters: [S('S', [C('a', '3', 'A'), C('Internship', '3', '#pass'), C('c', '3', '#w'), C('d', '3', '#i')])] }));
    eq('pass/fail not in GPA', [G.fmt(r.soFar.cgpa), r.soFar.cr, r.soFar.earned], ['4.00', 300, 600]);
    // F counts in GPA but earns nothing
    r = G.compute(st({ semesters: [S('S', [C('a', '3', 'A'), C('b', '3', 'F')])], target: '3', total: '12' }));
    eq('F in GPA', [G.fmt(r.soFar.cgpa), r.soFar.earned], ['2.00', 300]);
    eq('F credits stay in credit hours left', r.target.R, 900);
    // 0 credit hours course: not counted
    r = G.compute(st({ semesters: [S('S', [C('a', '3', 'B'), C('Seminar', '0', 'A')])] }));
    eq('0 credit course not counted', G.fmt(r.soFar.cgpa), '3.00');
    // blank rows skipped, half-filled rows flagged
    r = G.compute(st({ semesters: [S('S', [C('', '', ''), C('Maths', '3', ''), C('', '', 'A'), C('', 'abc', 'A'), C('', '40', 'A'), C('Art', '1.5', 'B')])] }));
    const st2 = Object.values(r.info).map(x => x.status);
    eq('row statuses', st2, ['ignored', 'nograde', 'bad', 'bad', 'bad', 'gpa']);
    eq('half-credit course 1.5', [r.soFar.cr, G.fmt(r.soFar.cgpa)], [150, '3.00']);
    eq('no grade counted', r.rows[0].nograde, 1);
    eq('bad counted', r.rows[0].bad, 3);
    // grade no longer on the scale after switching (B+ does not exist on letters-only)
    r = G.compute(st({ scale: 'abcdf', semesters: [S('S', [C('a', '3', 'B+')])] }));
    eq('grade not on scale', Object.values(r.info)[0].status, 'bad');
    // empty everything
    r = G.compute(st({ semesters: [] }));
    eq('empty: no CGPA', r.soFar.cgpa, null);
    r = G.compute(st({ semesters: [S('S', [C('', '', '')])] }));
    eq('blank semester: no GPA', r.rows[0].gpa, null);

    // Retakes: Calculus D (1.00) in S1, retaken B (3.00) in S2, 3 cr each, plus 3 cr A in S1
    const rA = S('S1', [C('Calculus', '3', 'D'), C('English', '3', 'A')]);
    const rB = S('S2', [C(' calculus ', '3', 'B')]);
    r = G.compute(st({ semesters: [rA, rB] }));
    eq('latest replaces: (12 + 9) / 6 = 3.50', [G.fmt(r.soFar.cgpa), r.soFar.cr, r.soFar.earned], ['3.50', 600, 600]);
    eq('old attempt marked replaced', !!r.info[rA.courses[0].id].replacedBy, true);
    eq('S1 GPA as it was then (1+4)/2 = 2.50', G.fmt(r.rows[0].gpa), '2.50');
    r = G.compute(st({ semesters: [rA, rB], retake: 'all' }));
    eq('all count: (3 + 12 + 9) / 9 = 2.67', [G.fmt(r.soFar.cgpa), r.soFar.cr, r.soFar.earned], ['2.67', 900, 600]);
    // best: retake got worse (F) -> the D still counts
    const rC = S('S3', [C('Calculus', '3', 'F')]);
    r = G.compute(st({ semesters: [rA, rC], retake: 'best' }));
    eq('best keeps D: (3 + 12) / 6 = 2.50', [G.fmt(r.soFar.cgpa), r.soFar.earned], ['2.50', 600]);
    r = G.compute(st({ semesters: [rA, rC], retake: 'latest' }));
    eq('latest takes the F: (0 + 12) / 6 = 2.00, D credits lost', [G.fmt(r.soFar.cgpa), r.soFar.earned], ['2.00', 300]);
    // courses with no name are never treated as retakes
    r = G.compute(st({ semesters: [S('a', [C('', '3', 'A')]), S('b', [C('', '3', 'C')])] }));
    eq('unnamed courses both count: 3.00', [G.fmt(r.soFar.cgpa), r.soFar.earned], ['3.00', 600]);

    // What-if: S1 final (3.39 over 12), S2 expected 3 cr A + 3 cr A = 4.00
    const plan = S('Semester 2', [C('x', '3', 'A'), C('y', '3', 'A')], true);
    r = G.compute(st({ semesters: [s1, plan], target: '3.6', total: '30' }));
    eq('plan not in real CGPA', [G.fmt(r.soFar.cgpa), r.soFar.cr], ['3.39', 1200]);
    eq('with plan (40.67 + 24) / 18 = 3.5927 -> 3.59', G.fmt(r.withPlan.cgpa), '3.59');
    eq('has plan', r.hasPlan, true);
    // real: (3.6 x 30 - 40.67) / 18 = 67.33 / 18 = 3.7405 -> 3.75; with plan: (108 - 64.67) / 12 = 3.6108 -> 3.62
    eq('need now 3.75', G.fmt(r.target.need), '3.75');
    eq('need after plan 3.62', [G.fmt(r.targetPlan.need), r.targetPlan.R], ['3.62', 1200]);
    // a plan retake replaces only in the what-if view
    r = G.compute(st({ semesters: [rA, S('S2', [C('Calculus', '3', 'A')], true)] }));
    eq('plan retake: real keeps D', G.fmt(r.soFar.cgpa), '2.50');
    eq('plan retake: what-if (12+12)/6 = 4.00', G.fmt(r.withPlan.cgpa), '4.00');

    // rounding half up exactly at .xx5: 2 cr A (4.00) + 2 cr ... make 3.245: 3.245 = 12.98 / 4? use points scale: 3.25 x 1 + 3.24 x 1 = 6.49 / 2 = 3.245
    r = G.compute(st({ scale: 'points', semesters: [S('S', [C('a', '1', '3.25'), C('b', '1', '3.24')])] }));
    eq('3.245 rounds to 3.25', G.fmt(r.soFar.cgpa), '3.25');
    r = G.compute(st({ scale: 'points', rounding: 'cut', semesters: [S('S', [C('a', '1', '3.25'), C('b', '1', '3.24')])] }));
    eq('3.245 cuts to 3.24', G.fmt(r.soFar.cgpa), '3.24');
    // huge: 40 semesters x 10 courses of 30 credits still exact
    const big = []; for (let i = 0; i < 40; i++) big.push(S('S' + i, Array.from({ length: 10 }, (_, j) => C('c' + i + '-' + j, '30', j % 2 ? 'A' : 'B'))));
    r = G.compute(st({ semesters: big }));
    eq('huge input exact 3.50', [G.fmt(r.soFar.cgpa), r.soFar.cr], ['3.50', 1200000]);

    // base record validation
    eq('base above scale flagged', !!G.compute(st({ base: { on: true, cgpa: '4.2', credits: '30' } })).base.bad, true);
    eq('base without credits flagged', !!G.compute(st({ base: { on: true, cgpa: '3.2', credits: '' } })).base.bad, true);
    eq('base off ignored', G.compute(st({ base: { on: false, cgpa: '3.2', credits: '30' } })).soFar.cr, 0);
    // base + semester: 2.84 x 92 = 261.28; + S1 40.67 over 12 = 301.95 / 104 = 2.9033 -> 2.90
    r = G.compute(st({ base: { on: true, cgpa: '2.84', credits: '92' }, semesters: [s1] }));
    eq('base + semester 2.90', G.fmt(r.soFar.cgpa), '2.90');

    // backup cleaning
    let threw = false; try { G.cleanState({ foo: 1 }); } catch (e) { threw = true; }
    eq('bad backup rejected', threw, true);
    const cl = G.cleanState({ scale: 'nope', retake: 'x', semesters: [{ name: '', courses: [{ name: 'A'.repeat(200), credits: 3, grade: 'A' }, null] }, null] });
    eq('clean fixes scale', cl.scale, 'hec');
    eq('clean fixes retake', cl.retake, 'latest');
    eq('clean names semester', cl.semesters[0].name, 'Semester 1');
    eq('clean trims long names', cl.semesters[0].courses[0].name.length, 80);
    eq('clean keeps null course as blank', cl.semesters[0].courses[1].credits, '');
    eq('clean semester 2 from null', cl.semesters[1].courses.length, 0);

    const ids = G.cleanState({ nextId: 9, semesters: [{ id: 's2', courses: [{ id: 'c3' }, { id: 'c3' }, { id: '<b>' }] }, { id: 's2', courses: [] }] });
    eq('clean keeps valid ids, renames duplicates and junk', ids.semesters.map(x => [x.id, x.courses.map(c => c.id)]), [['s2', ['c3', 'c10', 'c11']], ['s12', []]]);
    eq('clean nextId above every id', ids.nextId, 13);

    const summary = pass + ' passed, ' + failN + ' failed';
    if (typeof module !== 'undefined' && typeof require !== 'undefined' && typeof window === 'undefined') { out.forEach(l => console.log(l)); console.log(summary); process.exit(failN ? 1 : 0); }
    else { document.getElementById('out').textContent = out.concat(summary).join('\n'); document.title = (failN ? 'FAIL ' : 'PASS ') + summary; }
})();
