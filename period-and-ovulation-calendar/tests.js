// Checks for the date maths in core.js. Run: node tests.js  (or open test.html in a browser)
(function (root) {
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.PeriodCore;
    let pass = 0, failed = 0;
    const out = [];
    function eq(got, want, what) {
        const g = JSON.stringify(got), w = JSON.stringify(want);
        if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); }
    }
    const st = (starts, extra = {}) => C.normalize(Object.assign({ periods: starts.map(s => typeof s === 'string' ? { start: s, len: 5 } : s) }, extra));

    // ---- days
    eq(C.validISO('2026-02-29'), false, 'no 29 Feb in 2026');
    eq(C.validISO('2028-02-29'), true, '29 Feb in a leap year');
    eq(C.validISO('2026-13-01'), false, 'month 13');
    eq(C.validISO(''), false, 'blank');
    eq(C.validISO('16/10/2026'), false, 'other format');
    eq(C.addDays('2026-10-01', 29), '2026-10-30', '1 Oct + 29');
    eq(C.addDays('2026-12-20', 28), '2027-01-17', 'over new year');
    eq(C.addDays('2028-02-10', 28), '2028-03-09', 'over 29 Feb');
    eq(C.diff('2026-03-20', '2026-04-17'), 28, 'over summer time change is still 28');
    eq(C.fmt('2026-10-30', { day: true }), 'Fri 30 Oct 2026', 'weekday');
    eq(C.fmtRange('2026-10-09', '2026-10-18'), '9 to 18 Oct 2026', 'range same month');
    eq(C.fmtRange('2026-10-28', '2026-11-02'), '28 Oct to 2 Nov 2026', 'range over months');
    eq(C.fmtRange('2026-12-30', '2027-01-03'), '30 Dec 2026 to 3 Jan 2027', 'range over years');

    // ---- the worked example from the README: six periods, today 16 Oct 2026
    const aisha = st([{ start: '2026-05-11', len: 5 }, { start: '2026-06-08', len: 5 }, { start: '2026-07-07', len: 6 }, { start: '2026-08-03', len: 5 }, { start: '2026-09-02', len: 4 }, { start: '2026-10-01', len: 5 }]);
    let a = C.analyse(aisha, '2026-10-16');
    eq(a.list.map(r => r.cycle), [null, 28, 29, 27, 30, 29], 'cycle lengths');
    eq([a.avg, a.min, a.max, a.countedCycles, a.avgLen], [29, 27, 30, 5, 5], 'average 143/5 = 28.6 -> 29, shortest 27, longest 30');
    eq([a.status, a.cycleDay, a.onPeriod], ['waiting', 16, 0], 'day 16, not on period');
    eq([a.expected, a.earliest, a.latest, a.daysToExpected], ['2026-10-30', '2026-10-28', '2026-10-31', 14], 'next period 30 Oct, range 28 to 31 Oct, in 14 days');
    eq([a.ovulation, a.fertileStart, a.fertileEnd, a.fertileWhen], ['2026-10-16', '2026-10-09', '2026-10-18', 'now'], 'ovulation 16 Oct, fertile 9 to 18 Oct, now');
    eq(a.next.map(n => n.start), ['2026-10-30', '2026-11-28', '2026-12-27'], 'next three periods');
    eq(a.windows[1], { start: '2026-11-07', end: '2026-11-16', ovulation: '2026-11-14' }, 'next fertile window (14 Nov -2 -5 to +1 +1)');
    eq(a.irregular, false, 'spread of 3 days is regular');

    // on the period, day 3
    a = C.analyse(aisha, '2026-10-03');
    eq([a.status, a.onPeriod, a.cycleDay], ['period', 3, 3], 'period day 3');
    // late: 3 days after 30 Oct, and past the latest of the range
    a = C.analyse(aisha, '2026-11-02');
    eq([a.status, a.late, a.pastLatest, a.cycleDay], ['late', 3, true, 33], '3 days late');
    eq(a.next[0].start, '2026-11-02', 'late: next expected from today');
    eq(a.fertileWhen, 'passed', 'late: fertile window passed');
    // the expected day itself is not late
    a = C.analyse(aisha, '2026-10-30');
    eq([a.status, a.late, a.daysToExpected], ['waiting', 0, 0], 'due today is not late');
    // day before the fertile window
    eq(C.analyse(aisha, '2026-10-08').fertileWhen, 'ahead', 'fertile window ahead');

    // ---- first use with one period: the typed usual length is used
    let one = st(['2026-10-01'], { settings: { cycle: 32, len: 4 } });
    one.periods[0].len = 4;
    a = C.analyse(one, '2026-10-16');
    eq([a.fromTyped, a.avg, a.expected, a.hasRange, a.avgLen], [true, 32, '2026-11-02', false, 4], 'one period uses typed 32 days');
    eq([a.fertileStart, a.fertileEnd, a.ovulation], ['2026-10-14', '2026-10-20', '2026-10-19'], 'typed: 6-day window ending day after ovulation');
    // two periods: one counted cycle
    a = C.analyse(st(['2026-09-01', '2026-10-01']), '2026-10-05');
    eq([a.fromTyped, a.avg, a.countedCycles, a.onPeriod], [false, 30, 1, 5], 'one cycle of 30 days, period day 5');

    // ---- irregular cycles show a wide range
    a = C.analyse(st(['2026-03-01', '2026-03-24', '2026-05-02', '2026-05-28', '2026-07-05']), '2026-07-10');
    eq(a.list.map(r => r.cycle), [null, 23, 39, 26, 38], 'irregular cycles');
    eq([a.avg, a.min, a.max, a.irregular], [32, 23, 39, true], 'average 31.5 -> 32, irregular');
    eq([a.earliest, a.latest, a.expected], ['2026-07-28', '2026-08-13', '2026-08-06'], 'range 28 Jul to 13 Aug');
    eq(a.flags.map(f => f.cycle), [39, 38], 'long cycles flagged');

    // ---- very short cycle flagged, huge gap ignored, skipped gap ignored
    a = C.analyse(st(['2026-01-01', '2026-01-17', '2026-05-20', '2026-06-17']), '2026-06-20');
    eq(a.list.map(r => [r.cycle, r.counted, r.flag]), [[null, false, ''], [16, true, 'short'], [123, false, 'gap'], [28, true, '']], 'short counted and flagged, 123 days not counted');
    eq(a.avg, 22, '(16 + 28) / 2 = 22');
    const sk = st(['2026-01-01', '2026-01-29', { start: '2026-03-20', len: 5, skipGap: true }]);
    a = C.analyse(sk, '2026-03-25');
    eq([a.list[2].flag, a.list[2].counted, a.avg], ['skipped', false, 28], 'ticked gap not counted');

    // ---- only the last six cycles count
    const many = ['2025-01-01', '2025-02-15', '2025-03-01', '2025-03-29', '2025-04-26', '2025-05-24', '2025-06-21', '2025-07-19', '2025-08-16'];
    a = C.analyse(st(many), '2025-08-20');
    eq([a.countedCycles, a.avg, a.min, a.max], [6, 28, 28, 28], 'old 45 and 14 day cycles dropped');

    // ---- paused (pregnant or breastfeeding)
    a = C.analyse(st(['2026-01-01'], { settings: { paused: true } }), '2026-06-01');
    eq([a.status, a.expected, a.cycleDay], ['paused', undefined, 152], 'paused: no predictions');
    // empty
    eq(C.analyse(st([]), '2026-10-16').status, 'empty', 'empty');
    // long gap note
    a = C.analyse(st(['2026-01-01', '2026-01-29']), '2026-04-10');
    eq([a.status, a.longGap, a.late], ['late', true, 43], '26 Feb expected, 43 days late on 10 Apr');

    // ---- logging a start
    eq(C.checkStart(aisha, '2026-10-17', '2026-10-16').error, 'That day is in the future. Log a period on the day it starts.', 'future refused');
    eq(C.checkStart(aisha, '2026-10-01', '2026-10-16').error, 'A period starting 1 Oct 2026 is already logged.', 'same day refused');
    eq(/^That is day 3 of the period that started 1 Oct 2026/.test(C.checkStart(aisha, '2026-10-03', '2026-10-16').error), true, 'inside a period refused');
    eq(C.checkStart(aisha, '2026-10-06', '2026-10-16'), { warn: 'Only 5 days from another period. If this was light spotting, you can delete it again.' }, 'spotting warning');
    eq(C.checkStart(aisha, '2026-10-16', '2026-10-16'), {}, 'today is fine');
    eq(C.checkStart(aisha, 'x', '2026-10-16').error, 'Pick the day your period started.', 'blank refused');
    eq(!!C.checkStart(aisha, '2010-01-01', '2026-10-16').error, true, 'more than 10 years ago refused');
    eq(C.checkStart(aisha, '2026-04-13', '2026-10-16'), {}, 'adding an older forgotten period');

    // ---- calendar marks
    a = C.analyse(aisha, '2026-10-16');
    eq(C.mark(aisha, a, '2026-10-01').logged, 1, 'logged day 1');
    eq(C.mark(aisha, a, '2026-10-05').logged, 5, 'logged day 5');
    eq(C.mark(aisha, a, '2026-10-06').logged, 0, 'day after period');
    eq(C.mark(aisha, a, '2026-10-30').predicted, true, 'predicted start');
    eq(C.mark(aisha, a, '2026-11-03').predicted, true, 'predicted day 5');
    eq(C.mark(aisha, a, '2026-11-04').predicted, false, 'predicted ends');
    eq([C.mark(aisha, a, '2026-10-16').ovulation, C.mark(aisha, a, '2026-10-16').today], [true, true], 'ovulation today');
    eq(C.mark(aisha, a, '2026-10-09').fertile, true, 'fertile (current cycle, past day)');
    eq(C.mark(aisha, a, '2026-11-14').ovulation, true, 'next ovulation');

    // ---- saved data checks
    const bad = C.normalize({ periods: [{ start: '2026-10-01', len: 99 }, { start: '2026-10-01' }, { start: 'nope' }, null, { start: '2026-09-02', len: 4, skipGap: 'yes' }],
        days: { '2026-10-02': { s: ['cramps', 'cramps', 'evil'], n: 'x'.repeat(500) }, 'bad': { s: [] }, '2026-10-03': { s: [], n: '  ' } }, settings: { cycle: 500, len: 0, paused: 'true', weekStart: 0 } });
    eq(bad.periods, [{ start: '2026-09-02', len: 4, skipGap: false }, { start: '2026-10-01', len: 5, skipGap: false }], 'bad periods dropped, sorted, length clamped');
    eq([bad.days['2026-10-02'].s, bad.days['2026-10-02'].n.length, Object.keys(bad.days).length], [['cramps'], 300, 1], 'symptoms checked');
    eq(bad.settings, { cycle: 28, len: 5, paused: false, weekStart: 0, icsFertile: true }, 'settings checked');
    eq(C.normalize('garbage').periods, [], 'garbage');
    eq(C.normalize(null).settings.cycle, 28, 'null');

    // ---- summary and calendar file
    const withNotes = C.normalize(Object.assign({}, aisha, { days: { '2026-10-01': { s: ['cramps', 'heavy'], n: 'Took ibuprofen' } } }));
    const sum = C.summary(withNotes, C.analyse(withNotes, '2026-10-16'));
    eq(sum.includes('Next period expected: around Fri 30 Oct 2026 (usual range 28 to 31 Oct 2026)'), true, 'summary next');
    eq(sum.includes('Likely fertile window: 9 to 18 Oct 2026, ovulation around 16 Oct 2026'), true, 'summary fertile');
    eq(sum.includes('Average cycle: 29 days (shortest 27, longest 30, from the last 5 cycles)'), true, 'summary average');
    eq(sum.includes('- 1 Oct 2026: cramps, heavy flow, Took ibuprofen'), true, 'summary notes');
    eq(sum.includes('- 1 Oct 2026, lasted 5 days, 29 days after the one before'), true, 'summary list');
    const cal = C.ics(a, true, '20261016T100000Z');
    eq((cal.match(/BEGIN:VEVENT/g) || []).length, 6, '3 periods + 3 fertile windows');
    eq(cal.includes('DTSTART;VALUE=DATE:20261030\r\nDTEND;VALUE=DATE:20261104'), true, 'period 30 Oct for 5 days');
    eq((C.ics(a, false, 'x').match(/BEGIN:VEVENT/g) || []).length, 3, 'without fertile windows');

    // ---- month grid
    const g = C.monthGrid(2026, 9, 1);
    eq([g[0], g[3], g.length], ['2026-09-28', '2026-10-01', 35], 'Oct 2026 Monday first');
    const gs = C.monthGrid(2026, 1, 0);
    eq([gs[0], gs.length], ['2026-02-01', 28], 'Feb 2026 Sunday first fits 4 weeks');

    const result = { pass, failed, out: out.concat(['', pass + ' passed, ' + failed + ' failed']) };
    if (typeof module !== 'undefined' && module.exports) { console.log(result.out.join('\n')); process.exit(failed ? 1 : 0); }
    root.testResult = result;
})(this);
