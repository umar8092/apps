// Logic checks for core.js, with answers worked out by hand. Run: node tests.js  (or open test.html)
(function () {
    const C = typeof module === 'object' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.QuranCore;
    let pass = 0; const fails = [];
    const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(name + ': got ' + g + ', want ' + w); };
    const pick = (o, keys) => { const r = {}; keys.forEach(k => { r[k] = o[k]; }); return r; };
    const mk = (plan, log, extra) => Object.assign(C.emptyState(), { plan, log: log || [] }, extra || {});

    // dates
    eq('fmtDate', C.fmtDate('2027-03-09'), 'Tue 9 Mar');
    eq('addDays over Feb in 2027', C.addDays('2027-02-28', 1), '2027-03-01');
    eq('diffDays 11 Feb to 9 Mar 2027', C.diffDays('2027-02-11', '2027-03-09'), 26);
    eq('isIso rejects 29 Feb 2027', C.isIso('2027-02-29'), false);

    // typed numbers
    eq('readInt plain', C.readInt(' 221 '), 221);
    eq('readInt comma', C.readInt('1,204'), 1204);
    eq('readInt blank', Number.isNaN(C.readInt('')), true);
    eq('readInt negative', Number.isNaN(C.readInt('-5')), true);
    eq('readInt decimal', Number.isNaN(C.readInt('20.5')), true);
    eq('readInt text', Number.isNaN(C.readInt('page')), true);
    eq('cleanText pasted and long', C.cleanText('  Ali\n\tKhan ' + 'x'.repeat(80), 40).length, 40);

    // juz in the Madani copy: juz 1 is pages 1-21, juz 2 starts on 22, every juz after is 20 pages, juz 30 starts on 582
    eq('juz 1 start', C.juzStart(604, 1), 1);
    eq('juz 1 end', C.juzEnd(604, 1), 21);
    eq('juz 2 start', C.juzStart(604, 2), 22);
    eq('juz 11 end', C.juzEnd(604, 11), 221);
    eq('juz 30 start', C.juzStart(604, 30), 582);
    eq('juz 30 end', C.juzEnd(604, 30), 604);
    eq('page 221 is in juz 11', C.juzOfPage(604, 221), 11);
    eq('page 222 is in juz 12', C.juzOfPage(604, 222), 12);
    eq('juz done at page 221', C.juzDone(604, 221), 11);
    eq('juz done at page 220', C.juzDone(604, 220), 10);
    eq('juz done at page 0', C.juzDone(604, 0), 0);
    eq('juz done at the end', C.juzDone(604, 604), 30);
    eq('13-line copy, juz 2 about page 29', C.juzStart(848, 2), 29);
    eq('13-line copy, juz 30 ends on 848', C.juzEnd(848, 30), 848);
    eq('only 604 is exact', [C.juzExact(604), C.juzExact(610)], [true, false]);
    // surahs
    eq('page 221 is Surah Hud', C.surahOfPage(221), { n: 11, name: 'Hud' });
    eq('page 293 is Al-Kahf', C.surahOfPage(293).name, 'Al-Kahf');
    eq('page 1 is Al-Fatihah', C.surahOfPage(1).name, 'Al-Fatihah');
    eq('page 604 ends with An-Nas', C.surahOfPage(604).name, 'An-Nas');
    eq('114 surahs', [C.SURAH_PAGE.length, C.SURAH_NAME.length], [114, 114]);
    eq('surah pages never go down', C.SURAH_PAGE.every((p, i) => i === 0 || p >= C.SURAH_PAGE[i - 1]), true);

    // Ramadan plan: 604 pages from page 1, 8 Feb to 9 Mar 2027 = 30 days
    const R = { start: '2027-02-08', from: 1, mode: 'date', by: '2027-03-09', perDay: 0 };
    const sc = C.schedule(R, 604);
    eq('Ramadan plan is 30 days', sc.days, 30);
    eq('Ramadan plan, 21 pages a day (604 / 30 = 20.13, rounded up)', sc.perDay, 21);
    eq('Ramadan plan target after day 1', sc.target(0), 21);
    eq('Ramadan plan target after day 3 (ceil 60.4)', sc.target(2), 61);
    eq('Ramadan plan last day is the end', sc.target(29), 604);
    const S = (log, today) => C.status(mk(R, log), today);
    eq('first day, nothing read', pick(S([], '2027-02-08'), ['kind', 'daysLeft', 'need', 'goal', 'todo', 'behind', 'ahead']),
        { kind: 'date', daysLeft: 30, need: 21, goal: 21, todo: 21, behind: 0, ahead: 0 });
    // read 21 pages on day 1: today is done, 583 left over the 29 days from tomorrow = 20.1 -> 21
    eq('first day done', pick(S([{ d: '2027-02-08', at: 21 }], '2027-02-08'), ['todo', 'next', 'readToday', 'ahead']), { todo: 0, next: 21, readToday: 21, ahead: 0 });
    // missed 10 Feb: at page 42 on the morning of 11 Feb, the plan wanted 61, so 19 behind; 562 left over 27 days = 20.8 -> 21 a day
    const miss = S([{ d: '2027-02-08', at: 21 }, { d: '2027-02-09', at: 42 }], '2027-02-11');
    eq('missed a day', pick(miss, ['kind', 'behind', 'daysLeft', 'need', 'goal', 'todo']), { kind: 'date', behind: 19, daysLeft: 27, need: 21, goal: 63, todo: 21 });
    eq('read ahead', pick(S([{ d: '2027-02-08', at: 40 }], '2027-02-08'), ['ahead', 'todo']), { ahead: 19, todo: 0 });
    eq('finish date passed', S([{ d: '2027-02-08', at: 500 }], '2027-03-10').kind, 'passed');
    eq('plan not started yet', S([], '2027-02-01').kind, 'future');
    eq('khatam complete', pick(S([{ d: '2027-02-08', at: 300 }, { d: '2027-03-05', at: 604 }], '2027-03-06'), ['kind', 'days', 'left']), { kind: 'complete', days: 26, left: 0 });
    // last day: everything left is for today
    eq('last day', pick(S([{ d: '2027-02-08', at: 590 }], '2027-03-09'), ['daysLeft', 'need', 'todo', 'next']), { daysLeft: 1, need: 14, todo: 14, next: 0 });

    // already started: from page 222, 10 days, 383 pages = 38.3 -> 39 a day
    const F = { start: '2026-10-21', from: 222, mode: 'date', by: '2026-10-30', perDay: 0 };
    eq('started from page 222', pick(C.status(mk(F), '2026-10-21'), ['pos', 'need', 'goal', 'daysLeft']), { pos: 221, need: 39, goal: 260, daysLeft: 10 });

    // a fixed amount: 20 pages a day from 21 Oct 2026, 604 pages = 31 days, ends 20 Nov
    const P = { start: '2026-10-21', from: 1, mode: 'pace', by: '', perDay: 20 };
    eq('20 a day takes 31 days', [C.schedule(P, 604).days, C.schedule(P, 604).end], [31, '2026-11-20']);
    eq('pace, first day', pick(C.status(mk(P), '2026-10-21'), ['kind', 'goal', 'todo', 'finish', 'late']), { kind: 'pace', goal: 20, todo: 20, finish: '2026-11-20', late: 0 });
    // read 25 today: 579 left from tomorrow = 28.95 -> 29 days -> 19 Nov, a day early
    eq('pace, read 25 today', pick(C.status(mk(P, [{ d: '2026-10-21', at: 25 }]), '2026-10-21'), ['todo', 'ahead', 'finish', 'late']), { todo: 0, ahead: 5, finish: '2026-11-19', late: -1 });
    // missed 22 Oct: 23 Oct starts at page 20, 20 behind; 584 left = 29.2 -> 30 days from today -> 21 Nov, a day late
    eq('pace, missed a day', pick(C.status(mk(P, [{ d: '2026-10-21', at: 20 }]), '2026-10-23'), ['behind', 'goal', 'todo', 'finish', 'late']), { behind: 20, goal: 40, todo: 20, finish: '2026-11-21', late: 1 });
    eq('pace, near the end the goal stops at the last page', C.status(mk(P, [{ d: '2026-10-21', at: 600 }]), '2026-10-22').goal, 604);

    // checking a reading
    const L = mk(R, [{ d: '2027-02-08', at: 21 }, { d: '2027-02-10', at: 63 }]);
    eq('page 0', C.checkReading(L, '2027-02-11', 0, '2027-02-11'), 'Your copy has 604 pages. Type a page from 1 to 604.');
    eq('page 605', C.checkReading(L, '2027-02-11', 605, '2027-02-11') !== '', true);
    eq('blank page', C.checkReading(L, '2027-02-11', NaN, '2027-02-11'), 'Type the page number where you stopped, such as 221.');
    eq('a page before the last one', C.checkReading(L, '2027-02-11', 50, '2027-02-11'), 'Page 50 is before page 63, where you had already reached. If that was a mistake, delete it under "History".');
    eq('the same page again is fine', C.checkReading(L, '2027-02-11', 63, '2027-02-11'), '');
    eq('a future day', C.checkReading(L, '2027-02-12', 80, '2027-02-11'), 'That day has not come yet.');
    eq('before the plan', C.checkReading(L, '2027-02-01', 5, '2027-02-11') !== '', true);
    eq('a missed day filled in between', C.checkReading(L, '2027-02-09', 42, '2027-02-11'), '');
    eq('a missed day past a later reading', C.checkReading(L, '2027-02-09', 70, '2027-02-11'), 'On Wed 10 Feb you had only reached page 63. Type a page up to 63 for this day.');
    eq('daily amounts', C.dailyAmounts(L), { '2027-02-08': 21, '2027-02-10': 42 });

    // checking a plan
    eq('plan ok', C.checkPlan(R, 604, '2027-02-08'), '');
    eq('finish before start', C.checkPlan(Object.assign({}, R, { by: '2027-02-01' }), 604, '2027-01-01'), 'The finish day is before the start day.');
    eq('finish already passed', C.checkPlan(R, 604, '2027-03-10'), 'That finish day has already passed. Pick today or a later day.');
    eq('0 pages a day', C.checkPlan(Object.assign({}, P, { perDay: 0 }), 604, '2026-10-21'), 'Type how many pages a day, 1 or more.');
    eq('start page past the end', C.checkPlan(Object.assign({}, P, { from: 700 }), 604, '2026-10-21'), 'Type the page you start from: 1 to 604.');
    eq('same day start and finish is fine', C.checkPlan(Object.assign({}, R, { start: '2027-02-08', by: '2027-02-08' }), 604, '2027-02-08'), '');

    // streak and finishing a khatam
    const K = mk(P, [{ d: '2026-10-21', at: 20 }, { d: '2026-10-22', at: 40 }, { d: '2026-10-23', at: 604 }]);
    eq('streak 3', C.streak(K, '2026-10-23'), 3);
    eq('streak still counts on a new day before reading', C.streak(K, '2026-10-24'), 3);
    eq('streak broken', C.streak(K, '2026-10-25'), 0);
    eq('complete', C.isComplete(K), true);
    eq('completeKhatam', C.completeKhatam(K), true);
    eq('after a khatam', [K.khatams.length, K.khatams[0].start, K.khatams[0].end, K.log.length, K.plan], [1, '2026-10-21', '2026-10-23', 0, null]);
    eq('streak kept after a khatam', C.streak(K, '2026-10-23'), 3);
    eq('cannot complete twice', C.completeKhatam(K), false);

    // group khatam: 7 people share 30 juz, the first two read 5
    const g = C.emptyGroup(); ['Ali', 'Sara', 'Ammi', 'Abbu', 'Hina', 'Omar', 'Zara'].forEach((n, i) => g.people.push({ id: i + 1, name: n }));
    C.shareOut(g);
    eq('share out counts', g.people.map(p => C.juzOf(g, p.id).length), [5, 5, 4, 4, 4, 4, 4]);
    eq('Ali reads 1-5', C.juzOf(g, 1), [1, 2, 3, 4, 5]);
    eq('Zara reads 27-30', C.juzOf(g, 7), [27, 28, 29, 30]);
    eq('ranges', C.ranges([1, 2, 3, 5, 7, 8]), '1-3, 5, 7, 8');
    eq('ranges empty', C.ranges([]), '');
    const g2 = C.emptyGroup(); g2.title = 'Dada Abbu'; g2.by = '2026-10-30';
    g2.people.push({ id: 1, name: 'Ali' }, { id: 2, name: 'Sara' });
    g2.who[0] = 1; g2.who[1] = 1; g2.who[2] = 2; g2.done[0] = true;
    eq('group text', C.groupText(g2), 'Khatam: Dada Abbu\nFinish by 30 Oct 2026\n1 of 30 juz read\n\nAli: Juz 1 ✓, 2\nSara: Juz 3\nNot taken yet: Juz 4-30\n\nStill to read: Juz 2-30');
    eq('nobody to share with', C.shareOut(C.emptyGroup()), false);
    eq('one person reads all 30', (() => { const x = C.emptyGroup(); x.people.push({ id: 4, name: 'Me' }); C.shareOut(x); return C.juzOf(x, 4).length; })(), 30);

    // saved state
    eq('validate empty', C.validate(C.emptyState()) !== null, true);
    eq('validate junk', C.validate('x'), null);
    eq('validate wrong version', C.validate({ v: 2, total: 604 }), null);
    eq('validate pages too small', C.validate({ v: 1, total: 5 }), null);
    eq('validate a page going down', C.validate({ v: 1, total: 604, plan: R, log: [{ d: '2027-02-08', at: 50 }, { d: '2027-02-09', at: 40 }] }), null);
    eq('validate a page past the end', C.validate({ v: 1, total: 604, plan: R, log: [{ d: '2027-02-08', at: 700 }] }), null);
    eq('validate a custom copy', C.validate({ v: 1, copy: '604', total: 620 }).copy, 'custom');
    const back = C.validate(JSON.parse(JSON.stringify(Object.assign(mk(R, [{ d: '2027-02-08', at: 21 }]), { group: g2 }))));
    eq('round trip', [back.plan.by, back.log.length, back.group.people.length, back.group.done[0], back.nextId], ['2027-03-09', 1, 2, true, 3]);
    eq('validate group with a name missing', C.validate({ v: 1, total: 604, group: { people: [{ id: 1, name: '  ' }], who: Array(30).fill(0), done: Array(30).fill(false) } }), null);
    eq('validate group who points to nobody', C.validate({ v: 1, total: 604, group: { people: [], who: Array(30).fill(9), done: Array(30).fill(false) } }).group.who[0], 0);

    // my progress text
    eq('progress text', C.progressText(mk(R, [{ d: '2027-02-08', at: 21 }, { d: '2027-02-09', at: 42 }]), '2027-02-11'),
        'My Quran reading\nPage 42 of 604 (2 of 30 juz done)\nFinishing by 9 Mar 2027: 21 pages a day\nKhatams finished: 0');

    const out = 'Quran planner logic: ' + pass + ' passed, ' + fails.length + ' failed' + (fails.length ? '\n' + fails.join('\n') : '');
    if (typeof document !== 'undefined') { const p = document.createElement('pre'); p.textContent = out; document.body.appendChild(p); } else { console.log(out); if (fails.length) process.exit(1); }
})();
