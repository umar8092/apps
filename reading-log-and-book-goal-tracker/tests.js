// Logic checks for core.js, with answers worked out by hand. Run: node tests.js  (or open test.html)
(function () {
    const C = typeof module === 'object' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.ReadCore;
    let pass = 0; const fails = [];
    const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(name + ': got ' + g + ', want ' + w); };
    const T = '2026-10-20'; // a Tuesday
    const mk = (o) => Object.assign({ id: 1, title: 'The Kite Runner', author: '', format: 'pages', total: 320, start: 0, status: 'reading', added: '2026-10-15', by: '', finished: '', log: [] }, o);

    // dates
    eq('fmtDate', C.fmtDate('2026-10-23'), 'Fri 23 Oct');
    eq('fmtDateY', C.fmtDateY('2026-01-01'), '1 Jan 2026');
    eq('addDays over a month end', C.addDays('2026-10-31', 1), '2026-11-01');
    eq('addDays over the year end', C.addDays('2026-12-31', 1), '2027-01-01');
    eq('diffDays', C.diffDays('2026-10-17', '2026-10-20'), 3);
    eq('daysInYear 2026', C.daysInYear(2026), 365);
    eq('daysInYear 2028 leap', C.daysInYear(2028), 366);
    eq('dayOfYear 20 Oct 2026', C.dayOfYear(T), 293);
    eq('dayOfYear 31 Dec 2028', C.dayOfYear('2028-12-31'), 366);
    eq('isIso rejects 31 Feb', C.isIso('2026-02-31'), false);
    eq('isIso accepts 29 Feb 2028', C.isIso('2028-02-29'), true);

    // amounts
    eq('fmtAmount 1 page', C.fmtAmount('pages', 1), '1 page');
    eq('fmtAmount 46 pages', C.fmtAmount('pages', 46), '46 pages');
    eq('fmtAmount percent', C.fmtAmount('percent', 8), '8%');
    eq('fmtMin 65', C.fmtMin(65), '1 h 5 min');
    eq('fmtMin 60', C.fmtMin(60), '1 h');
    eq('fmtMin 45', C.fmtMin(45), '45 min');
    eq('fmtPos audio', C.fmtPos({ format: 'audio' }, 130), '2 h 10 min in');

    // typed numbers
    eq('readInt plain', C.readInt(' 182 '), 182);
    eq('readInt comma', C.readInt('1,204'), 1204);
    eq('readInt blank', Number.isNaN(C.readInt('')), true);
    eq('readInt negative', Number.isNaN(C.readInt('-5')), true);
    eq('readInt decimal', Number.isNaN(C.readInt('4.5')), true);
    eq('readInt text', Number.isNaN(C.readInt('abc')), true);
    eq('readHM 2 h 15', C.readHM('2', '15'), 135);
    eq('readHM minutes only, 90', C.readHM('', '90'), 90);
    eq('readHM 1 h 75 min is a mistake', Number.isNaN(C.readHM('1', '75')), true);
    eq('readHM blank', Number.isNaN(C.readHM('', '')), true);
    eq('readHM hours only', C.readHM('9', ''), 540);
    eq('cleanText long and pasted', C.cleanText('  A\n\tbook  ' + 'x'.repeat(200), 150).length, 150);

    // one book: 320 pages, read to 40 on Sat, 90 on Sun, 182 today
    const A = mk({ log: [{ d: '2026-10-17', at: 40 }, { d: '2026-10-18', at: 90 }, { d: T, at: 182 }], by: '2026-10-23' });
    eq('position', C.position(A), 182);
    eq('left', C.leftOf(A), 138);
    eq('daily amounts', C.dailyAmounts(A), { '2026-10-17': 40, '2026-10-18': 50, '2026-10-20': 92 });
    // 138 pages left, read today, so Wed, Thu, Fri = 3 days: 46 a day
    eq('finish by Fri, read today', C.finishPlan(A, T), { passed: false, left: 138, by: '2026-10-23', days: 3, perDay: 46, from: 'tomorrow' });
    // not read today yet: 230 left over Tue..Fri = 4 days = 57.5, rounded up to 58
    const A2 = mk({ log: [{ d: '2026-10-17', at: 40 }, { d: '2026-10-18', at: 90 }], by: '2026-10-23' });
    eq('finish by Fri, not read today', C.finishPlan(A2, T), { passed: false, left: 230, by: '2026-10-23', days: 4, perDay: 58, from: 'today' });
    // finish-by is today and today is already logged: what is left is still for today
    eq('finish by today, read today', C.finishPlan(mk({ log: A.log, by: T }), T), { passed: false, left: 138, by: T, days: 1, perDay: 138, from: 'today' });
    eq('finish by date passed', C.finishPlan(mk({ log: A.log, by: '2026-10-19' }), T), { passed: true, left: 138, by: '2026-10-19' });
    eq('no finish-by date', C.finishPlan(mk({ log: A.log }), T), null);
    eq('finished book has no plan', C.finishPlan(mk({ log: [{ d: T, at: 320 }], by: '2026-10-23' }), T), null);
    // pace: 182 pages from Sat to Tue = 4 days = 45.5 a day; 138 left needs 3.03 days -> 4 days from Wed -> Sat 24 Oct
    eq('pace', C.pace(A, T).perDay, 45.5);
    eq('estimate', C.estimate(A, T), { perDay: 45.5, days: 4, date: '2026-10-24' });
    eq('no estimate without reading', C.estimate(mk({}), T), null);
    // pace only looks at the last 30 days: 300 pages read 60 days ago do not count
    const old = mk({ log: [{ d: '2026-08-21', at: 300 }, { d: T, at: 310 }] });
    eq('pace last 30 days', C.pace(old, T).perDay, 10 / 30);
    // already on page 100 when added: those pages are not counted as read
    const S = mk({ start: 100, log: [{ d: T, at: 130 }] });
    eq('start page not counted', C.dailyAmounts(S), { '2026-10-20': 30 });
    eq('totalRead with start', C.totalRead(S), 30);

    // going back to re-read: going back counts nothing, re-read pages count again
    const R = mk({ log: [{ d: '2026-10-19', at: 182 }, { d: T, at: 120 }, { d: T, at: 150 }] });
    eq('re-read amounts', C.dailyAmounts(R), { '2026-10-19': 182, '2026-10-20': 30 });
    eq('re-read position', C.position(R), 150);

    // checking a new reading
    eq('check: fine', C.checkLog(A2, T, 120, T), { ok: true, back: false, prev: 90 });
    eq('check: same page', C.checkLog(A, T, 182, T).error, 'You were already at page 182. Type where you stopped this time.');
    eq('check: past the end', !!C.checkLog(A, T, 400, T).error, true);
    eq('check: last page is fine', C.checkLog(A, T, 320, T).ok, true);
    eq('check: future day', C.checkLog(A, '2026-10-21', 200, T).error, 'That day has not come yet. Pick today or an earlier day.');
    eq('check: lower than last time asks', C.checkLog(A, T, 100, T), { ok: true, back: true, prev: 182 });
    eq('check: forgot Monday, between Sun and Tue', C.checkLog(A, '2026-10-19', 120, T), { ok: true, back: false });
    eq('check: Monday cannot be past Tuesday', !!C.checkLog(A, '2026-10-19', 200, T).error, true);
    eq('check: negative', !!C.checkLog(A, T, -1, T).error, true);
    eq('check: bad date', !!C.checkLog(A, '2026-02-31', 10, T).error, true);
    eq('check: percent over 100', !!C.checkLog(mk({ format: 'percent', total: 100 }), T, 101, T).error, true);
    eq('check: zero is fine on a fresh book', C.checkLog(mk({ format: 'percent', total: 100, start: 0 }), T, 0, T).error, 'You were already at 0%. Type where you stopped this time.');

    // percent and audio books
    const P = mk({ format: 'percent', total: 100, log: [{ d: '2026-10-19', at: 30 }, { d: T, at: 42 }], by: '2026-10-25' });
    eq('percent plan: 58% over Wed..Sun 5 days = 11.6 -> 12', C.finishPlan(P, T).perDay, 12);
    const AU = mk({ format: 'audio', total: 570, log: [{ d: T, at: 130 }] });
    eq('audio left', C.leftOf(AU), 440);
    eq('audio fmt', C.fmtAmount('audio', C.leftOf(AU)), '7 h 20 min');

    // the year
    const st = C.emptyState(); st.goals['2026'] = 24;
    for (let i = 0; i < 21; i++) st.books.push(mk({ id: i + 1, status: 'finished', finished: '2026-0' + (1 + i % 9) + '-10' }));
    st.books.push(mk({ id: 50, status: 'finished', finished: '2025-12-31' }));
    st.books.push(mk({ id: 51, status: 'stopped' }));
    st.books.push(mk({ id: 52, status: 'finished', finished: '2026-01-01' }));
    // 22 finished in 2026 (21 + the 1 Jan one). By day 293 of 365 the goal of 24 wants floor(19.27) = 19, so 3 ahead.
    const y = C.yearSummary(st, 2026, T);
    eq('year done', y.done, 22);
    eq('year target', y.target, 19);
    eq('year ahead', y.ahead, 3);
    eq('year remaining', y.remaining, 2);
    eq('year days left', y.daysLeft, 73);
    eq('year every', y.every, 36.5);
    eq('31 Dec counts for that year', C.finishedIn(st, 2025).length, 1);
    eq('no goal', C.yearSummary(st, 2025, T), { year: 2025, done: 1, goal: 0 });
    st.goals['2025'] = 20;
    const y25 = C.yearSummary(st, 2025, T);
    eq('past year is over', [y25.target, y25.ahead, y25.daysLeft, y25.over], [20, -19, 0, true]);
    const st2 = C.emptyState(); st2.goals['2026'] = 24;
    eq('behind early in the year', C.yearSummary(st2, 2026, '2026-03-01').ahead, -3); // day 60: floor(24*60/365)=3
    eq('1 January: nothing due yet', C.yearSummary(st2, 2026, '2026-01-01').target, 0);
    eq('31 December: all due', C.yearSummary(st2, 2026, '2026-12-31').target, 24);

    // streak: read Fri, Sat, Sun, skipped Mon, read today
    const sk = C.emptyState();
    sk.books.push(mk({ log: [{ d: '2026-10-16', at: 10 }, { d: '2026-10-17', at: 20 }, { d: '2026-10-18', at: 30 }, { d: T, at: 40 }] }));
    eq('streak', C.streak(sk, T), { current: 1, longest: 3, readToday: true });
    eq('streak counts to yesterday if not read today', C.streak(sk, '2026-10-19'), { current: 3, longest: 3, readToday: false });
    eq('streak broken', C.streak(sk, '2026-10-22').current, 0);
    eq('no reading at all', C.streak(C.emptyState(), T), { current: 0, longest: 0, readToday: false });
    // days and mixed formats
    sk.books.push(mk({ id: 2, format: 'audio', total: 600, log: [{ d: T, at: 45 }] }));
    const days = C.lastDays(sk, T, 7);
    eq('last 7 days length', days.length, 7);
    eq('today mixed', [days[6].pages, days[6].audio], [10, 45]);
    eq('amounts text', C.amountsText(C.sumDays(days)), '40 pages, 45 min listened');

    // list to share
    const ls = C.emptyState(); ls.goals['2026'] = 24;
    ls.books.push(mk({ id: 1, title: 'Atomic Habits', author: 'James Clear', status: 'finished', finished: '2026-03-12' }));
    ls.books.push(mk({ id: 2, title: 'Dune', log: [{ d: T, at: 160 }] }));
    eq('list text', C.listText(ls, 2026, T), 'Books I read in 2026: 1 of my goal of 24\n\n1. Atomic Habits by James Clear (finished 12 Mar 2026)\n\nReading now:\n- Dune, 50% done\n');

    // saved state
    eq('validate garbage', C.validate('x'), null);
    eq('validate no books', C.validate({}), null);
    eq('validate empty', C.validate({ books: [] }).books.length, 0);
    eq('validate page past the end', C.validate({ books: [mk({ log: [{ d: T, at: 999 }] })] }), null);
    eq('validate bad format', C.validate({ books: [mk({ format: 'scroll' })] }), null);
    eq('validate finished without date', C.validate({ books: [mk({ status: 'finished' })] }), null);
    eq('validate start at the end', C.validate({ books: [mk({ start: 320 })] }), null);
    const dup = C.validate({ books: [mk({ id: 3 }), mk({ id: 3 })], goals: { 2026: 24, 2025: -1, abc: 5, 2024: 2.5 } });
    eq('validate duplicate ids fixed', dup.books.map(b => b.id), [3, 4]);
    eq('validate goals filtered', dup.goals, { 2026: 24 });
    eq('validate seq', dup.seq, 5);
    eq('validate percent total forced to 100', C.validate({ books: [mk({ format: 'percent', total: 7 })] }).books[0].total, 100);

    const out = pass + ' passed, ' + fails.length + ' failed' + (fails.length ? '\n - ' + fails.join('\n - ') : '');
    if (typeof document !== 'undefined') { const p = document.createElement('pre'); p.textContent = out; document.body.appendChild(p); document.title = fails.length ? 'FAILED' : 'PASSED'; }
    else { console.log(out); if (fails.length) process.exit(1); }
})();
