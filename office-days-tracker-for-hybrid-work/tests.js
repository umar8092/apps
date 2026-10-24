// Logic checks for core.js. Run: node tests.js  (or open test.html in a browser)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.OfficeCore;
    let pass = 0, failed = 0; const out = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); } };
    const T = '2026-10-21';   // a Wednesday
    const st = (o, days) => Object.assign(C.emptyState(), o || {}, { days: days || {} });
    const rule = r => Object.assign({}, C.DEFAULT_RULE, r);

    // ---- dates and ranges
    eq(C.weekRange(T, 1), ['2026-10-19', '2026-10-25'], 'week from Monday');
    eq(C.weekRange(T, 0), ['2026-10-18', '2026-10-24'], 'week from Sunday');
    eq(C.weekRange(T, 6), ['2026-10-17', '2026-10-23'], 'week from Saturday');
    eq(C.weekRange('2026-10-19', 1), ['2026-10-19', '2026-10-25'], 'Monday is its own week start');
    eq(C.weekRange('2026-12-30', 1), ['2026-12-28', '2027-01-03'], 'week across new year');
    eq(C.monthRange('2028-02-10'), ['2028-02-01', '2028-02-29'], 'leap February');
    eq(C.quarterRange(T), ['2026-10-01', '2026-12-31'], 'Q4');
    eq(C.quarterRange('2026-03-31'), ['2026-01-01', '2026-03-31'], 'Q1');
    eq(C.rangeName('2026-10-01', '2026-12-31', 'quarter'), 'Q4 (Oct to Dec 2026)', 'quarter name');
    eq(C.shortDate('2027-01-04', T), 'Mon 4 Jan 2027', 'other year shows year');
    eq(C.num(5), '2.5', 'half days'); eq(C.num(6), '3', 'whole days');
    eq(C.workdaysText([1, 2, 3, 4, 5]), 'Mon to Fri', 'Mon to Fri');
    eq(C.workdaysText([0, 1, 2, 3, 4]), 'Sun to Thu', 'Sun to Thu');
    eq(C.workdaysText([1, 3, 5]), 'Mon, Wed, Fri', 'part time list');
    eq(C.workdaysText([6, 0, 1, 2, 3]), 'Sat to Wed', 'run across the week end');
    eq(C.workdaysText([0, 1, 2, 3, 4, 5, 6]), 'every day', 'every day');
    eq(C.workdaysText([1, 2]), 'Mon, Tue', 'two days listed');

    // ---- Sana's week: 3 a week, Mon office, Tue home, Wed office (today)
    let s = st({}, { '2026-10-19': 'O', '2026-10-20': 'H', '2026-10-21': 'O' });
    let c = C.current(s, T);
    eq([c.req, c.doneH, c.need, c.state, c.avail], [6, 4, 2, 'ontrack', ['2026-10-22', '2026-10-23']], 'Sana: 1 more, Thu and Fri left');
    eq(C.headline(c), '1 more office day needed this week', 'Sana headline');
    // today not marked yet counts as available
    c = C.current(st({}, { '2026-10-19': 'O', '2026-10-20': 'O' }), T);
    eq(c.avail, ['2026-10-21', '2026-10-22', '2026-10-23'], 'today unmarked is still available');
    // met
    c = C.current(st({}, { '2026-10-19': 'O', '2026-10-20': 'O', '2026-10-21': 'O' }), T);
    eq([c.state, C.headline(c)], ['met', 'Target met for this week'], 'met');
    // over target
    c = C.current(st({}, { '2026-10-19': 'O', '2026-10-20': 'O', '2026-10-21': 'O', '2026-10-22': 'O' }), T);
    eq(c.state, 'met', 'planned Thursday on top still met');
    // planned
    c = C.current(st({}, { '2026-10-19': 'O', '2026-10-21': 'O', '2026-10-23': 'O' }), T);
    eq([c.state, c.planH, c.planned], ['planned', 2, ['2026-10-23']], 'planned meets');
    // not reachable: Mon Tue Wed home
    c = C.current(st({}, { '2026-10-19': 'H', '2026-10-20': 'H', '2026-10-21': 'H' }), T);
    eq([c.state, C.headline(c)], ['short', 'Not reachable this week: 3 office days still needed, 2 working days left'], 'not reachable');
    // half days
    c = C.current(st({}, { '2026-10-19': 'HO', '2026-10-20': 'O', '2026-10-21': 'HO' }), T);
    eq([c.doneH, c.need, C.headline(c)], [4, 2, '1 more office day needed this week'], 'two half days = one day');
    c = C.current(st({}, { '2026-10-19': 'HO', '2026-10-20': 'O', '2026-10-21': 'O' }), T);
    eq(C.headline(c), '0.5 more office days needed this week', 'half a day still needed');
    // work trip and a Saturday office day
    c = C.current(st({}, { '2026-10-19': 'T', '2026-10-17': 'O', '2026-10-24': 'O' }), T);
    eq([c.doneH, c.planH, c.extra], [2, 2, 1], 'trip counts, Saturday counts (planned)');

    // ---- days off
    c = C.current(st({}, { '2026-10-19': 'L' }), T);
    eq([c.req, c.off], [4, 1], 'leave lowers 3 to 2');
    c = C.current(st({}, { '2026-10-19': 'L', '2026-10-20': 'S', '2026-10-21': 'P' }), T);
    eq([c.req, c.state], [0, 'none'], 'three days off: none needed');
    eq(C.headline(c), 'No office days needed this week', 'none headline');
    eq(C.lines(c, st({}, { '2026-10-19': 'L', '2026-10-20': 'S', '2026-10-21': 'P' }), T), ['Every working day here is off, so no office days are needed.'], 'none line');
    // keep target
    s = st({ rule: rule({ offRule: 'keep' }) }, { '2026-10-19': 'L' });
    eq(C.current(s, T).req, 6, 'keep: still 3 with one day off');
    s = st({ rule: rule({ offRule: 'keep' }) }, { '2026-10-19': 'L', '2026-10-20': 'L', '2026-10-21': 'L' });
    eq(C.current(s, T).req, 4, 'keep: only 2 days left, so 2');
    // leave on a weekend does not lower
    eq(C.current(st({}, { '2026-10-24': 'L' }), T).req, 6, 'leave on Saturday changes nothing');
    // start date mid-week
    s = st({ start: '2026-10-21' });
    c = C.current(s, T);
    eq([c.req, c.before, c.unmarked], [2, 2, []], 'start Wed: 3 - 2 = 1, Mon Tue not asked');
    eq(C.previous(s, T), null, 'no last week before the start');
    // part-time Mon Wed Fri, rule 3
    s = st({ workdays: [1, 3, 5] }, { '2026-10-19': 'O', '2026-10-21': 'O' });
    c = C.current(s, T);
    eq([c.req, c.avail], [6, ['2026-10-23']], 'part time 3 days');
    // rule bigger than the working days
    s = st({ rule: rule({ n: 5 }), workdays: [1, 2, 3] });
    eq(C.current(s, T).req, 6, 'target capped at working days');

    // ---- percentage
    // Q4 2026 has 66 weekdays
    s = st({ rule: rule({ type: 'pct', pct: 60, period: 'quarter' }) });
    c = C.current(s, T);
    eq([c.wd, c.countable, c.req / 2], [66, 66, 40], '60% of 66 = 39.6 -> 40');
    // the FAQ example: 3 public holidays and 5 days of leave -> 58 days -> 34.8 -> 35
    const offs = { '2026-12-24': 'P', '2026-12-25': 'P', '2026-12-31': 'P', '2026-11-02': 'L', '2026-11-03': 'L', '2026-11-04': 'L', '2026-11-05': 'L', '2026-11-06': 'L' };
    c = C.current(st({ rule: rule({ type: 'pct', pct: 60 }) }, offs), T);
    eq([c.countable, c.req / 2], [58, 35], 'FAQ example');
    // monthly 50%: Oct has 22 weekdays
    s = st({ rule: rule({ type: 'pct', pct: 50, period: 'month' }) }, { '2026-10-05': 'O', '2026-10-06': 'O', '2026-10-10': 'O' });
    c = C.current(s, T);
    eq([c.wd, c.extra, c.countable, c.req / 2, c.doneH / 2], [22, 1, 23, 12, 3], 'Saturday office adds to both counts, 11.5 -> 12');
    // 100% and 1%
    eq(C.current(st({ rule: rule({ type: 'pct', pct: 1, period: 'month' }) }), T).req, 2, '1% rounds up to 1 day');
    eq(C.current(st({ rule: rule({ type: 'pct', pct: 100, period: 'month' }) }), T).req, 44, '100% = every working day');
    // the README example (19 working days, 60% -> 11.4 -> 12)
    eq(Math.ceil(60 * 19 / 100), 12, 'help example');

    // ---- per month
    s = st({ rule: rule({ type: 'month', n: 8 }) }, { '2026-10-14': 'L', '2026-10-30': 'L' });
    eq(C.current(s, T).req, 12, 'month 8 lowered by 2 leave');

    // ---- quarter weeks
    const q = { '2026-10-05': 'O', '2026-10-06': 'O', '2026-10-08': 'O', '2026-10-12': 'O', '2026-10-14': 'L', '2026-10-15': 'O', '2026-10-19': 'O', '2026-10-21': 'O' };
    eq(C.quarterLine(st({}, q), T), 'Q4 (Oct to Dec 2026): 2 of 2 finished weeks met.', 'two weeks met');
    const q2 = Object.assign({}, q, { '2026-10-15': 'H' });
    eq(C.quarterLine(st({}, q2), T), 'Q4 (Oct to Dec 2026): 1 of 2 finished weeks met. Missed: week of Mon 12 Oct.', 'missed week');
    eq(C.prevLine(st({}, q2), T), 'Last week: 1 of 2 office days, missed by 1.', 'last week missed');
    eq(C.quarterLine(st({}, {}), T), 'Q4 (Oct to Dec 2026): this is the first week counted.', 'nothing marked before');
    eq(C.prevLine(st({}, {}), T), '', 'no last week when nothing marked');

    // ---- marking
    s = C.mark(st(), T, 'O'); eq(s.days[T], 'O', 'mark');
    s = C.mark(s, T, ''); eq(s.days[T], undefined, 'clear');
    s = C.mark(s, T, 'nonsense'); eq(s.days[T], undefined, 'bad mark ignored');
    let r = C.markRange(st(), '2026-11-02', '2026-11-08', 'L');
    eq([r.n, Object.keys(r.st.days).length], [5, 5], 'range marks weekdays only');
    eq(C.markRange(st(), '2026-11-08', '2026-11-02', 'L').n, -1, 'backwards range refused');
    eq(C.markRange(st(), '2025-01-01', '2026-11-02', 'L').n, -1, 'over a year refused');
    r = C.markRange(r.st, '2026-11-02', '2026-11-03', ''); eq(Object.keys(r.st.days).length, 3, 'range clear');

    // ---- the rule form
    eq(C.readRule({ type: 'week', n: '3' }).rule.n, 3, 'n 3');
    eq(C.readRule({ type: 'week', n: '' }).errs.n, 'Type how many office days, for example 3.', 'blank');
    eq(C.readRule({ type: 'week', n: '0' }).errs.n, 'A week has 1 to 7 days.', 'zero');
    eq(C.readRule({ type: 'week', n: '8' }).errs.n, 'A week has 1 to 7 days.', '8 a week');
    eq(C.readRule({ type: 'month', n: '8' }).ok, true, '8 a month');
    eq(C.readRule({ type: 'month', n: '32' }).errs.n, 'Use 1 to 31 days a month.', '32 a month');
    eq(C.readRule({ type: 'week', n: '-2' }).errs.n, 'Type a whole number of days.', 'negative');
    eq(C.readRule({ type: 'week', n: '99999999999999' }).errs.n, 'A week has 1 to 7 days.', 'huge');
    eq(C.readRule({ type: 'pct', pct: ' 60 % ' }).rule.pct, 60, 'pasted 60 %');
    eq(C.readRule({ type: 'pct', pct: '60.5' }).errs.pct, 'Type a whole number from 1 to 100.', 'decimal pct');
    eq(C.readRule({ type: 'pct', pct: '0' }).errs.pct, 'Use a number from 1 to 100.', 'zero pct');

    // ---- text
    s = st({}, { '2026-10-19': 'O', '2026-10-20': 'H', '2026-10-21': 'O' });
    eq(C.summaryText(s, T).split('\n').slice(0, 6), ['Office days, Wed 21 Oct 2026', 'Rule: 3 office days a week (Mon to Fri)', '', 'Mon 19 Oct to Sun 25 Oct: 1 more office day needed this week.', '- 2 of 3 office days done.', '- 2 working days left: Thu 22 Oct, Fri 23 Oct.'], 'summary');
    eq(C.csv(st({}, { '2026-10-20': 'HO', '2026-10-19': 'O' }), T), 'Date,Day,Where,Office days\r\n2026-10-19,Monday,Office,1\r\n2026-10-20,Tuesday,Half day in office,0.5\r\n', 'csv sorted');
    eq(C.monthCounts(st({}, { '2026-10-19': 'O', '2026-10-20': 'P', '2026-10-21': 'P', '2026-10-22': 'T' }), 2026, 10, T), 'October: 1 office, 1 work trip, 2 public holidays.', 'month counts');
    eq(C.ruleText(st({ rule: rule({ type: 'pct', pct: 50, period: 'month' }) })), '50% of working days in the office, counted each month (Mon to Fri)', 'pct rule text');
    eq(C.ruleText(st({ rule: rule({ n: 1 }) })), '1 office day a week (Mon to Fri)', 'one day');

    // ---- month grid
    const g = C.monthGrid(st(), 2026, 10, T);
    eq([g.heads[0], g.cells.slice(0, 4).map(x => x && x.n), g.cells.length % 7], ['Mon', [null, null, null, 1], 0], 'October starts on Thursday');
    eq(C.monthGrid(st({ weekStart: 0 }), 2026, 10, T).cells.slice(0, 5).map(x => x && x.n), [null, null, null, null, 1], 'Sunday weeks');

    // ---- saved data
    eq(C.validate(null), null, 'null');
    eq(C.validate({ days: [] }), null, 'days as a list refused');
    const v = C.validate({ rule: { type: 'week', n: 30 }, workdays: [], weekStart: 4, start: 'x', days: { '2026-13-01': 'O', '2026-10-19': 'O', '2026-10-20': 'Z' } });
    eq([v.rule.n, v.workdays, v.weekStart, v.start, v.days], [3, [1, 2, 3, 4, 5], 1, '', { '2026-10-19': 'O' }], 'cleaned');
    const big = {}; for (let i = 0; i < 7000; i++) big[C.addDays('2000-01-01', i)] = 'O';
    eq(Object.keys(C.validate({ rule: {}, days: big }).days).length, 6000, 'keeps the newest 6000 days');

    const msg = (failed ? out.join('\n') + '\n' : '') + (failed ? 'FAILED ' + failed : 'ALL PASSED') + ' (' + pass + ' passed)';
    if (typeof document !== 'undefined') { const pre = document.createElement('pre'); pre.textContent = msg; document.body.appendChild(pre); } else { console.log(msg); if (failed) process.exit(1); }
})();
