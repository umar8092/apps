// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const M = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.SPC;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const T = '2026-10-14';  // a Wednesday
    const mk = (id, name, date, n, rev, done) => ({ id, name, date, rev: rev == null ? 1 : rev, time: '', place: '', topics: Array.from({ length: n }, (_, i) => ({ id: id + 't' + i, name: name + ' ' + (i + 1), done: done && done[i] || null })) });
    const st = (exams, rest, off) => M.normalize({ exams, rest: rest || [], off: off || [] });
    const topicsOf = (p, d) => { const day = p.days.find(x => x.date === d); return day ? day.items.filter(i => i.type === 'topic').map(i => i.topic.name) : []; };
    const where = p => { const m = {}; p.days.forEach(d => d.items.forEach(i => { if (i.type === 'topic') (m[i.topic.name] = m[i.topic.name] || []).push(d.date); })); return m; };

    // ---------- dates ----------
    eq('valid date', M.valid('2026-02-28'), true); eq('no 30 Feb', M.valid('2026-02-30'), false); eq('leap day', M.valid('2028-02-29'), true); eq('junk', M.valid('14/10/2026'), false);
    eq('add days over month', M.addDays('2026-10-30', 3), '2026-11-02'); eq('diff', M.diff('2026-10-14', '2026-10-26'), 12);
    eq('diff over a summer-time change', M.diff('2026-03-28', '2026-03-30'), 2); eq('diff over new year', M.diff('2026-12-31', '2027-01-01'), 1);
    eq('weekday Wed', M.weekday(T), 3);
    eq('until today', M.untilWords(T, T), 'Today'); eq('until tomorrow', M.untilWords(T, '2026-10-15'), 'Tomorrow'); eq('until 12', M.untilWords(T, '2026-10-26'), 'In 12 days'); eq('past', M.untilWords(T, '2026-10-10'), '4 days ago');
    eq('todayOf local', M.todayOf(new Date(2026, 9, 14, 23, 59)), '2026-10-14'); eq('todayOf just after midnight', M.todayOf(new Date(2026, 9, 15, 0, 1)), '2026-10-15');
    eq('plural 1', M.plural(1, 'topic'), '1 topic'); eq('plural 0', M.plural(0, 'topic'), '0 topics');

    // ---------- topics typed or pasted ----------
    let r = M.parseTopics('Algebra\nGeometry\n\n  Statistics  ');
    eq('lines', r.names, ['Algebra', 'Geometry', 'Statistics']);
    eq('one line with commas', M.parseTopics('Algebra, Geometry; Statistics').names, ['Algebra', 'Geometry', 'Statistics']);
    eq('commas kept inside lines when there are several lines', M.parseTopics('Acids, bases and salts\nRates').names, ['Acids, bases and salts', 'Rates']);
    eq('bullets and numbers removed', M.parseTopics('- Algebra\n• Geometry\n1. Statistics\n2) Vectors\na) Calculus\n[ ] Sets\n* Probability').names, ['Algebra', 'Geometry', 'Statistics', 'Vectors', 'Calculus', 'Sets', 'Probability']);
    eq('a number that is the topic stays', M.parseTopics('1984 the novel\n3D shapes').names, ['1984 the novel', '3D shapes']);
    r = M.parseTopics('Algebra\nalgebra\nALGEBRA\nGeometry'); eq('repeats skipped (any case)', [r.names, r.repeats], [['Algebra', 'Geometry'], 2]);
    eq('existing names count as repeats', M.parseTopics('Algebra\nTrig', ['algebra']).names, ['Trig']);
    eq('blank', M.parseTopics('   \n\n').names, []); eq('null', M.parseTopics(null).names, []);
    r = M.parseTopics('x'.repeat(200)); eq('long topic shortened', [r.names[0].length, r.cut], [80, 1]);
    eq('windows line ends and tabs', M.parseTopics('Algebra\r\n\tGeometry\r\n').names, ['Algebra', 'Geometry']);
    eq('emoji and accents kept', M.parseTopics('Équations ✓\nПрограмма').names, ['Équations ✓', 'Программа']);

    // ---------- saved state is checked ----------
    eq('corrupt: null', M.normalize(null), null); eq('corrupt: array', M.normalize([1, 2]), null); eq('corrupt: no exams', M.normalize({ a: 1 }), null);
    let s = M.normalize({ exams: [{ id: 'a', name: '  Maths ', date: '2026-10-26', rev: 99, time: '25:00', place: 7, topics: [{ id: 'x', name: 'A', done: 'nope' }, { name: 'a' }, null, { name: '' }, { id: 'x', name: 'B', done: '2026-10-01' }] },
        { name: '', date: '2026-10-26' }, { name: 'Bad date', date: '2026-13-01' }, { id: 'a', name: 'Dup id', date: '2026-11-01' }], rest: [5, 5, 9, -1, 'x'], off: ['2026-10-20', 'junk', '2026-10-20'], seq: 'x' });
    eq('bad exams dropped', s.exams.map(e => e.name), ['Maths', 'Dup id']);
    eq('fixed values', [s.exams[0].rev, s.exams[0].time, s.exams[0].place], [1, '', '']);
    eq('topics checked', s.exams[0].topics.map(t => [t.name, t.done]), [['A', null], ['B', '2026-10-01']]);
    const ids = [s.exams[0].id, s.exams[1].id].concat(s.exams[0].topics.map(t => t.id));
    eq('ids unique', new Set(ids).size, ids.length);
    eq('rest and off cleaned', [s.rest, s.off], [[5], ['2026-10-20']]);
    eq('seq is past every id', s.seq >= 1, true);
    eq('round trip', M.normalize(JSON.parse(JSON.stringify(s))), s);

    // ---------- editing a topic list keeps ticks ----------
    let n = 0; const nid = () => 'n' + (++n);
    const old = [{ id: 'a', name: 'Algebra', done: '2026-10-10' }, { id: 'b', name: 'Geometry', done: null }];
    eq('merge keeps tick, adds new, drops removed', M.mergeTopics(old, ['Trig', 'algebra'], nid), [{ id: 'n1', name: 'Trig', done: null }, { id: 'a', name: 'algebra', done: '2026-10-10' }]);

    // ---------- the plan: one exam ----------
    // 10 topics, exam in 21 days (study days 14 Oct .. 3 Nov = 21), no revision day: alternate days, 1 a day at most
    let p = M.plan(st([mk('a', 'Maths', '2026-11-04', 10, 0)]), T);
    eq('one exam: max 1 a day', p.maxLoad, 1);
    eq('one exam: 10 topics planned once each', Object.values(where(p)).map(v => v.length), Array(10).fill(1));
    eq('one exam: last topic by 3 Nov', where(p)['Maths 10'][0] <= '2026-11-03', true);
    eq('one exam: spread, not all at the start', where(p)['Maths 10'][0] > '2026-10-28', true);
    // 8 topics, exam in 5 days (Mon 19 Oct), 1 revision day: topics on 14..17 Oct, revision on 18 Oct: 2 a day
    p = M.plan(st([mk('a', 'Maths', '2026-10-19', 8, 1)]), T);
    eq('8 topics in 4 days', [topicsOf(p, '2026-10-14').length, topicsOf(p, '2026-10-15').length, topicsOf(p, '2026-10-16').length, topicsOf(p, '2026-10-17').length, topicsOf(p, '2026-10-18').length], [2, 2, 2, 2, 0]);
    eq('revision day', p.info.a.revDays, ['2026-10-18']);
    eq('revision item on 18 Oct', p.days.find(d => d.date === '2026-10-18').items.map(i => i.type), ['revise']);
    eq('exam item on 19 Oct', p.days.find(d => d.date === '2026-10-19').items.map(i => i.type), ['exam']);
    eq('finish day', p.info.a.finish, '2026-10-17');
    eq('days list runs today .. exam', [p.days[0].date, p.days[p.days.length - 1].date, p.days.length], [T, '2026-10-19', 6]);
    // 9 topics in 4 days: 2,2,2,3 never more than 3 and none over
    p = M.plan(st([mk('a', 'Maths', '2026-10-19', 9, 1)]), T);
    eq('9 topics in 4 days: max 3, total 9', [p.maxLoad, Object.keys(where(p)).length], [3, 9]);
    eq('topics in typed order', ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'].flatMap(d => topicsOf(p, d)), Array.from({ length: 9 }, (_, i) => 'Maths ' + (i + 1)));

    // ---------- several exams (the README example) ----------
    const four = () => st([mk('m', 'Maths', '2026-10-26', 8), mk('p', 'Physics', '2026-10-29', 6), mk('c', 'Chemistry', '2026-11-03', 7), mk('e', 'English', '2026-11-05', 4)], [5]);
    p = M.plan(four(), T);
    eq('four exams: up to 2 topics a day', p.maxLoad, 2);
    eq('four exams: 25 topics left', p.left, 25);
    const w = where(p);
    const lastOf = (name, k) => Array.from({ length: k }, (_, i) => w[name + ' ' + (i + 1)][0]).sort().pop();
    eq('Maths done before its revision day (Sun 25 Oct)', [lastOf('Maths', 8) < '2026-10-25', p.info.m.revDays], [true, ['2026-10-25']]);
    eq('Physics done before 28 Oct', lastOf('Physics', 6) < '2026-10-28', true);
    eq('Chemistry done before 2 Nov', lastOf('Chemistry', 7) < '2026-11-02', true);
    eq('English done before 4 Nov', lastOf('English', 4) < '2026-11-04', true);
    eq('no topic on a Friday', Object.values(w).flat().some(d => M.weekday(d) === 5), false);
    eq('Fridays are rest days', p.days.filter(d => M.weekday(d.date) === 5).every(d => !d.study && d.rest), true);
    eq('today: Maths 1', topicsOf(p, T), ['Maths 1']);
    eq('exam days still used for later exams', topicsOf(p, '2026-10-26').length > 0, true);

    // ticking today's topic keeps the list and the rest of the plan the same
    let s2 = four(); s2.exams[0].topics[0].done = T;
    let p2 = M.plan(s2, T);
    eq('tick today: same list', topicsOf(p2, T), ['Maths 1']);
    eq('tick today: rest of plan unchanged', p2.days.slice(1).map(d => topicsOf(p2, d.date)), p.days.slice(1).map(d => topicsOf(p, d.date)));
    // studying ahead: a later topic ticked today joins today's list, the plan gets lighter
    s2 = four(); s2.exams[2].topics[6].done = T;
    p2 = M.plan(s2, T);
    eq('studied ahead: on today\'s list', topicsOf(p2, T).includes('Chemistry 7'), true);
    eq('studied ahead: one fewer left', p2.left, 24);
    eq('studied ahead: not planned again', where(p2)['Chemistry 7'], [T]);
    // topics ticked on an earlier day are not planned
    s2 = four(); s2.exams[0].topics[0].done = '2026-10-12'; s2.exams[0].topics[1].done = '2026-10-13';
    p2 = M.plan(s2, T); eq('earlier ticks not planned', [where(p2)['Maths 1'], where(p2)['Maths 2'], p2.left], [undefined, undefined, 23]);
    // the next day the plan starts again from that day (fell behind: nothing ticked)
    p2 = M.plan(four(), '2026-10-15');
    eq('next day, nothing ticked: all 25 still planned', [p2.left, Object.keys(where(p2)).length, p2.days[0].date], [25, 25, '2026-10-15']);

    // ---------- revision days and short time ----------
    p = M.plan(st([mk('a', 'Maths', '2026-10-15', 3, 1)]), T);
    eq('exam tomorrow: no room for revision, all today', [p.info.a.rev, p.info.a.revShort, topicsOf(p, T).length], [0, true, 3]);
    p = M.plan(st([mk('a', 'Maths', '2026-10-24', 4, 3)]), T);
    eq('3 revision days kept', p.info.a.revDays, ['2026-10-21', '2026-10-22', '2026-10-23']);
    eq('3 revision days: topics done by 20 Oct', p.info.a.finish <= '2026-10-20', true);
    p = M.plan(st([mk('a', 'Maths', '2026-10-24', 4, 0)]), T); eq('no revision day', [p.info.a.rev, p.info.a.revDays], [0, []]);
    p = M.plan(st([mk('a', 'Maths', T, 5)]), T);
    eq('exam today: nothing planned, 5 not planned', [p.info.a.noDays, p.info.a.unplanned, p.left, p.days[0].items.map(i => i.type)], [true, 5, 0, ['exam']]);
    p = M.plan(st([mk('a', 'Maths', '2026-10-17', 2)], [3, 4, 5]), T);
    eq('every day before the exam is a rest day', [p.info.a.noDays, p.info.a.unplanned], [true, 2]);
    p = M.plan(st([mk('a', 'Maths', '2026-10-19', 4)], [], ['2026-10-15', '2026-10-16']), T);
    eq('days off skipped', [topicsOf(p, '2026-10-15'), topicsOf(p, '2026-10-16'), p.days.find(d => d.date === '2026-10-15').off], [[], [], true]);
    eq('days off: 4 topics on 14 and 17 Oct, revise 18 Oct', [topicsOf(p, T).length + topicsOf(p, '2026-10-17').length, p.info.a.revDays], [4, ['2026-10-18']]);
    p = M.plan(st([mk('a', 'Maths', '2026-10-26', 0)]), T); eq('exam with no topics: countdown only', [p.left, p.maxLoad, p.info.a.total], [0, 0, 0]);
    p = M.plan(st([mk('a', 'Maths', '2026-10-01', 5)]), T); eq('past exam: no plan', [p.days.length, p.info.a.past], [0, true]);
    p = M.plan(st([]), T); eq('no exams', [p.days.length, p.left], [0, 0]);
    p = M.plan(st([mk('a', 'Maths', '2026-10-20', 3), mk('b', 'Art', '2026-10-20', 3)]), T);
    eq('two exams on the same day share revision day', [p.info.a.revDays, p.info.b.revDays, p.days.find(d => d.date === '2026-10-19').items.filter(i => i.type === 'revise').length], [['2026-10-19'], ['2026-10-19'], 2]);
    p = M.plan(st([mk('a', 'Maths', '2026-10-16', 30)]), T); eq('30 topics in 1 day: all planned, busy', [topicsOf(p, T).length, p.maxLoad], [30, 30]);
    eq('done topic dated in the future counts as done', M.plan(st([mk('a', 'Maths', '2026-10-20', 2, 1, ['2026-12-01'])]), T).left, 1);

    // ---------- every topic once, always before its revision days (random) ----------
    let seed = 7; const rnd = k => { seed = (seed * 16807) % 2147483647; return seed % k; };
    let bad = 0, worst = 0;
    for (let run = 0; run < 400; run++) {
        const ex = []; const ne = 1 + rnd(5);
        for (let i = 0; i < ne; i++) ex.push(mk('x' + i, 'S' + i, M.addDays(T, rnd(40)), rnd(15), rnd(4), Array.from({ length: 15 }, () => rnd(5) === 0 ? M.addDays(T, -rnd(3)) : null)));
        const rest = rnd(3) === 0 ? [rnd(7)] : [];
        const sx = st(ex, rest), px = M.plan(sx, T), wx = where(px);
        sx.exams.forEach(e => {
            const I = px.info[e.id];
            e.topics.forEach(t => {
                const at = wx[t.name];
                if (t.done && t.done !== T) { if (at) bad++; return; }
                if (I.noDays) { if (at) bad++; return; }
                if (!at || at.length !== 1 || at[0] > I.last || at[0] >= e.date) bad++;
            });
        });
        // never busier than needed: compare with the best possible busiest day
        let best = 0; const S = px.study;
        sx.exams.filter(e => e.date >= T && !px.info[e.id].noDays).forEach(e => {
            const dl = px.info[e.id].last, k = S.filter(d => d <= dl).length;
            const c = sx.exams.filter(f => f.date >= T && !px.info[f.id].noDays && px.info[f.id].last <= dl).reduce((n, f) => n + f.topics.filter(t => !t.done).length, 0);
            best = Math.max(best, Math.ceil(c / k));
        });
        worst = Math.max(worst, px.maxLoad - best);
    }
    eq('400 random plans: every topic once, before its revision days', bad, 0);
    eq('400 random plans: busiest day at most 1 more than the best possible', worst, 1);

    // ticking today's topics one by one never changes today's list or any later day (random)
    let moved = 0;
    for (let run = 0; run < 200; run++) {
        const ex = []; const ne = 1 + rnd(4);
        for (let i = 0; i < ne; i++) ex.push(mk('y' + i, 'S' + i, M.addDays(T, 1 + rnd(30)), rnd(12), rnd(3), Array.from({ length: 12 }, () => rnd(6) === 0 ? T : null)));
        const sx = st(ex), base = M.plan(sx, T), show = p => p.days.map(d => d.items.filter(i => i.type === 'topic').map(i => i.topic.name).join(',')).join('|');
        const want = show(base);
        base.days[0].items.filter(i => i.type === 'topic' && !i.topic.done).forEach(i => {
            sx.exams.find(e => e.id === i.exam.id).topics.find(t => t.id === i.topic.id).done = T;
            if (show(M.plan(sx, T)) !== want) moved++;
        });
    }
    eq('200 random plans: ticking today\'s topics changes nothing else', moved, 0);

    // ---------- sharing ----------
    const s3 = four(); s3.exams[0].time = '09:00'; s3.exams[0].place = 'Hall 3, Block B';
    const sum = M.summary(s3, M.plan(s3, T), 'en-GB', 0);
    eq('summary: exam line', /- Maths: .*26 Oct 2026 at 0?9:00, Hall 3, Block B \(in 12 days\), 0 of 8 topics done/.test(sum), true);
    eq('summary: today line', sum.includes('Today, Wed 14 Oct:\n  [ ] Maths: Maths 1'), true);
    eq('summary: rest day', sum.includes('Fri 16 Oct: rest day'), true);
    eq('summary: revision', sum.includes('Revise Maths: go over all 8 topics'), true);
    eq('summary limit', M.summary(s3, M.plan(s3, T), 'en-GB', 3).trim().endsWith('...'), true);
    const cal = M.ics(s3, T, '20261014T100000Z');
    eq('ics: 4 events', (cal.match(/BEGIN:VEVENT/g) || []).length, 4);
    eq('ics: timed exam', cal.includes('DTSTART:20261026T090000'), true);
    eq('ics: all-day exam', cal.includes('DTSTART;VALUE=DATE:20261029') && cal.includes('DTEND;VALUE=DATE:20261030'), true);
    eq('ics: commas escaped', cal.includes('LOCATION:Hall 3\\, Block B'), true);
    eq('ics: reminder the day before', cal.includes('TRIGGER:-P1D'), true);
    eq('ics: lines folded to 75', cal.split('\r\n').every(l => l.length <= 75), true);
    eq('ics: past exams left out', M.ics(st([mk('a', 'Old', '2026-10-01', 1)]), T, 'x').includes('VEVENT'), false);

    out.push('', pass + ' passed, ' + fail + ' failed');
    if (typeof document !== 'undefined' && document.getElementById('out')) document.getElementById('out').textContent = out.join('\n');
    else { console.log(out.join('\n')); if (fail) process.exitCode = 1; }
})();
