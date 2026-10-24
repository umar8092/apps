// Checks for core.js, every expected value worked out by hand. Run: node symptom-and-pain-diary-for-doctor-visits/tests.js
// (or open test.html in a browser).
(function () {
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : window.SPDCore;
    let pass = 0, failed = 0;
    const out = [];
    function eq(got, want, what) {
        const g = JSON.stringify(got), w = JSON.stringify(want);
        if (g === w) pass++; else { failed++; out.push('FAIL ' + what + '\n   got  ' + g + '\n   want ' + w); }
    }
    const ep = (id, start, end, pain, triggers, meds, extra) => Object.assign({ id, sid: 'm', start, end, pain, where: '', triggers: triggers || [], meds: meds || [], note: '' }, extra || {});
    const med = (name, helped) => ({ name, helped: helped || '' });

    // ---- dates and durations
    eq(C.isStamp('2026-02-29T10:00'), false, '29 Feb 2026 is not a date');
    eq(C.isStamp('2028-02-29T10:00'), true, '29 Feb 2028 is a date');
    eq(C.isStamp('2026-10-22T24:00'), false, '24:00 is not a time');
    eq(C.isStamp(''), false, 'blank is not a time');
    eq(C.addDays('2026-12-31', 1), '2027-01-01', 'next day over new year');
    eq(C.addDays('2026-03-01', -1), '2026-02-28', 'day before 1 March');
    eq(C.addMin('2026-03-29T00:30', 120), '2026-03-29T02:30', 'summer time night does not shift wall clock');
    eq(C.fmtDay('2026-10-22', true), 'Thu 22 Oct 2026', 'day format');
    eq([45, 60, 200, 1439, 1440, 1560, 2880, 2850, 0].map(C.fmtDur), ['45 min', '1 h', '3 h 20 min', '23 h 59 min', '1 day', '1 day 2 h', '2 days', '2 days', '0 min'], 'durations');
    eq([C.avg1(37, 6), C.avg1(13, 4), C.avg1(36, 6), C.avg1(0, 0)], ['6.2', '3.3', '6', ''], 'one-decimal averages round half up');

    // ---- days an episode touches
    const now = '2026-10-24T10:00', today = '2026-10-24';
    eq(C.episodeDays(ep('a', '2026-10-03T22:00', '2026-10-04T06:00', 5), now), ['2026-10-03', '2026-10-04'], 'over midnight counts both days');
    eq(C.episodeDays(ep('a', '2026-10-03T22:00', '2026-10-04T00:00', 5), now), ['2026-10-03'], 'ending at exactly midnight counts one day');
    eq(C.episodeDays(ep('a', '2026-10-22T23:00', null, 5), now), ['2026-10-22', '2026-10-23', '2026-10-24'], 'still going counts up to today');
    eq(C.durationMin(ep('a', '2026-10-24T08:15', null, 5), now), 105, 'still going: 1 h 45 min so far');

    // ---- periods
    let r = C.periodRange('30', today);
    eq([r.from, r.to, r.prev.from, r.prev.to], ['2026-09-25', '2026-10-24', '2026-08-26', '2026-09-24'], 'last 30 days and the 30 before');
    r = C.periodRange('month', today);
    eq([r.from, r.to, r.prev.from, r.prev.to, r.prev.label], ['2026-10-01', '2026-10-24', '2026-09-01', '2026-09-30', 'all of September 2026'], 'this month vs all of last month');
    r = C.periodRange('last', '2026-01-05');
    eq([r.from, r.to, r.prev.from, r.prev.to], ['2025-12-01', '2025-12-31', '2025-11-01', '2025-11-30'], 'last month over new year');
    r = C.periodRange('90', today);
    eq([r.from, r.prev.to], ['2026-07-27', '2026-07-26'], 'last 90 days');
    eq(C.periodRange('all', today).from, null, 'all entries has no start');

    // ---- Sara's month (the README example)
    const eps = [
        ep('1', '2026-09-28T07:30', '2026-09-28T19:30', 7, ['Short or poor sleep', 'Stress'], [med('Sumatriptan 50 mg', 'yes')]),
        ep('2', '2026-10-03T22:00', '2026-10-04T06:00', 6, ['Short or poor sleep'], [med('Ibuprofen 400 mg', 'yes')]),
        ep('3', '2026-10-09T15:00', '2026-10-09T18:30', 4, ['Screens'], [med('Ibuprofen 400 mg', 'some')]),
        ep('4', '2026-10-15T09:00', '2026-10-16T11:00', 8, ['Period', 'Short or poor sleep'], [med('ibuprofen 400 mg', 'no'), med('Sumatriptan 50 mg', 'yes')]),
        ep('5', '2026-10-21T13:10', '2026-10-21T17:40', 5, ['Stress', 'Missed or late meal'], [med('Ibuprofen 400 mg', 'yes')]),
        ep('6', '2026-10-24T08:15', null, 6, ['Short or poor sleep'], [med('Ibuprofen 400 mg')]),
        // the 30 days before
        ep('p1', '2026-08-30T09:00', '2026-08-30T12:00', 4), ep('p2', '2026-09-01T08:00', '2026-09-01T20:00', 6),
        ep('p3', '2026-09-05T07:00', '2026-09-06T09:00', 7), ep('p4', '2026-09-08T10:00', '2026-09-08T15:00', 5),
        ep('p5', '2026-09-12T10:00', '2026-09-12T16:00', 5), ep('p6', '2026-09-18T21:00', '2026-09-19T08:00', 6),
        ep('p7', '2026-09-23T06:00', '2026-09-23T14:00', 7),
        // another symptom must not be counted
        Object.assign(ep('x', '2026-10-20T10:00', '2026-10-20T11:00', 9), { sid: 'b' })
    ];
    const s = C.summary(eps, 'm', '30', today, now);
    eq([s.n, s.days, s.spanDays, s.prevDays, s.prevN], [6, 8, 30, 9, 7], 'episodes, days with it, compared with before');
    eq(s.dayList, ['2026-09-28', '2026-10-03', '2026-10-04', '2026-10-09', '2026-10-15', '2026-10-16', '2026-10-21', '2026-10-24'], 'the 8 days');
    eq([s.avgPain, s.worst, s.longest, s.avgLen, s.ongoing], ['6', 8, 1560, 648, 1], 'pain and length: (720+480+210+1560+270)/5 = 648');
    eq(C.fmtDur(648), '10 h 48 min', 'usual length');
    eq(s.meds.map(C.medLine), ['Ibuprofen 400 mg: helped 2 of 5 times (helped a bit 1, did not help 1, not noted 1)', 'Sumatriptan 50 mg: helped 2 of 2 times'], 'medicine lines, names matched ignoring case');
    eq(s.medDays, 6, 'medicine days');
    eq(s.overuse, false, '6 medicine days is not overuse');
    eq(s.triggers.slice(0, 4).map(t => t.name + ' ' + t.n), ['Short or poor sleep 4', 'Stress 2', 'Missed or late meal 1', 'Period 1'], 'most common triggers');
    const lines = C.headLines({ name: 'Migraine' }, s, today);
    eq(lines[0], 'Days with migraine: 8 of 30 (the 30 days before: 9)', 'head line 1');
    eq(lines[1], '6 episodes, average pain 6/10, worst 8/10', 'head line 2');
    eq(lines[2], 'Usually lasts 10 h 48 min, longest 1 day 2 h, 1 still going', 'head line 3');
    eq(lines[5], 'Most often after: Short or poor sleep (4 of 6), Stress (2 of 6), Missed or late meal (1 of 6), Period (1 of 6)', 'head line triggers');
    eq(C.episodeLine(eps[1], now), 'Sat 3 Oct 2026, 22:00 to Sun 4 Oct 06:00 (8 h), pain 6/10. Possible triggers: Short or poor sleep. Took: Ibuprofen 400 mg (helped).', 'episode over midnight in words');
    eq(C.episodeLine(eps[5], now), 'Sat 24 Oct 2026, 08:15, still going (1 h 45 min so far), pain 6/10. Possible triggers: Short or poor sleep. Took: Ibuprofen 400 mg.', 'still going in words');

    // this month and all
    const sm = C.summary(eps, 'm', 'month', today, now);
    eq([sm.n, sm.days, sm.prevDays, sm.spanDays], [5, 7, 9, 24], "this month: 7 days so far, September had 9 (28 Sep + 8 before)");
    const sa = C.summary(eps, 'm', 'all', today, now);
    eq([sa.n, sa.days, sa.prevDays, sa.overuse], [13, 17, null, false], 'all entries');
    eq(C.summary(eps, 'b', '30', today, now).n, 1, 'other symptom counted on its own');
    eq(C.summary([], 'm', '30', today, now).n, 0, 'empty diary');
    eq(C.headLines({ name: 'Migraine' }, C.summary([], 'm', '30', today, now), today), ['Days with migraine: 0 of 30 (the 30 days before: 0)'], 'empty summary words');

    // an episode across the edge of the period counts in both, only for its own days
    const edge = [ep('e', '2026-09-24T20:00', '2026-09-25T02:00', 5)];
    const se = C.summary(edge, 'm', '30', today, now);
    eq([se.n, se.days, se.prevDays], [1, 1, 1], 'edge episode: one day each side');

    // pain medicine on 10 or more days
    const many = n => Array.from({ length: n }, (_, i) => ep('o' + i, C.addDays('2026-10-01', i) + 'T09:00', C.addDays('2026-10-01', i) + 'T12:00', 5, [], [med('Paracetamol')]));
    eq(C.summary(many(9), 'm', '30', today, now).overuse, false, '9 medicine days: no warning');
    eq(C.summary(many(10), 'm', '30', today, now).overuse, true, '10 medicine days: warning');
    eq(C.summary(many(10), 'm', '90', today, now).overuse, false, '10 days in 90 is about 3 a month: no warning');
    eq(C.summary(many(10), 'm', 'all', today, now).overuse, false, 'no warning for all entries (no fixed length)');
    const two = [ep('t1', '2026-10-05T08:00', '2026-10-05T10:00', 5, [], [med('A')]), ep('t2', '2026-10-05T18:00', '2026-10-05T20:00', 5, [], [med('B')])];
    eq(C.summary(two, 'm', '30', today, now).medDays, 1, 'two episodes on one day is one medicine day');

    // calendar
    const dm = C.dayMap(s.list, s.range.from, s.range.to, now);
    eq([dm['2026-10-15'].pain, dm['2026-10-16'].pain, dm['2026-10-16'].med, dm['2026-10-15'].med, Object.keys(dm).length], [8, 8, false, true, 8], 'calendar days');

    // ---- form checks
    eq(C.checkEpisode({ start: '2026-10-24T09:00', end: null, pain: 5 }, now), {}, 'good still-going entry');
    eq(C.checkEpisode({ start: '2026-10-24T09:00', end: '2026-10-24T09:30', pain: 0 }, now), {}, 'pain 0 is allowed');
    eq(Object.keys(C.checkEpisode({ start: '', end: null, pain: null }, now)), ['start', 'pain'], 'blank start and no pain');
    eq(C.checkEpisode({ start: '2026-10-24T11:00', end: null, pain: 5 }, now).start, 'The start time is in the future. Choose a time up to now.', 'future start');
    eq(C.checkEpisode({ start: '2026-10-24T09:00', end: '2026-10-24T08:00', pain: 5 }, now).end, 'It must stop after it started (Sat 24 Oct, 09:00).', 'end before start');
    eq(C.checkEpisode({ start: '2026-10-24T09:00', end: '2026-10-24T09:00', pain: 5 }, now).end !== undefined, true, 'end same as start');
    eq(C.checkEpisode({ start: '2026-10-24T09:00', end: '2026-10-24T13:00', pain: 5 }, now).end, 'That would end in the future. Choose a shorter time, or "Still going".', 'end in future');
    eq(C.checkEpisode({ start: '2026-09-01T09:00', end: '2026-10-05T09:00', pain: 5 }, now).end, 'That is longer than 31 days. Check the dates.', 'too long');
    eq(C.checkEpisode({ start: '2026-09-01T09:00', end: null, pain: 5 }, now).end, 'Still going for more than 31 days? Choose when it stopped.', 'still going too long');
    eq(C.checkEpisode({ start: '2026-10-24T09:00', end: null, pain: 11 }, now).pain !== undefined, true, 'pain 11 refused');
    eq(C.checkEpisode({ start: '2026-10-24T09:00', end: null, pain: -1 }, now).pain !== undefined, true, 'pain -1 refused');

    // ---- cleaning saved data
    eq(C.clean(null), null, 'null');
    eq(C.clean('nonsense'), null, 'text');
    eq(C.clean({ symptoms: 'x' }), null, 'symptoms not a list');
    const dirty = C.clean({ symptoms: [{ id: 'm', name: '  Migraine ', triggers: ['Stress', 'Stress', '', 5] }, { id: 'm', name: 'Dup' }, { id: 'z', name: '' }, null],
        episodes: [ep('1', '2026-10-01T10:00', '2026-10-01T12:00', 5, [], [med('Ibu', 'maybe'), med('', 'yes')]), ep('2', '2026-10-01T10:00', '2026-10-01T09:00', 5),
            ep('3', 'bad', null, 5), ep('4', '2026-10-02T10:00', null, 12), Object.assign(ep('5', '2026-10-02T10:00', null, 3), { sid: 'nobody' }), ep('1', '2026-10-03T10:00', null, 2),
            ep('6', '2026-10-04T10:00', null, '7')], current: 'q', period: 'weird', name: 7 });
    eq(dirty.symptoms, [{ id: 'm', name: 'Migraine', triggers: ['Stress'], wheres: [] }], 'symptoms cleaned');
    eq(dirty.episodes.map(e => e.id), ['1', '6'], 'bad episodes left out');
    eq(dirty.episodes[0].meds, [{ name: 'Ibu', helped: '' }], 'medicine cleaned');
    eq(dirty.episodes[1].pain, 7, 'pain as text "7" read as 7');
    eq([dirty.current, dirty.period, dirty.name], ['m', '30', ''], 'settings defaults');
    eq(C.newSymptom('back PAIN', 'b').wheres[0], 'Lower back', 'preset lists for a known symptom, any case');
    eq(C.newSymptom('Dizziness', 'd').triggers.length > 0, true, 'own symptom gets general triggers');

    // ---- report text and spreadsheet
    const sym = { name: 'Migraine' };
    const full = C.reportText(sym, s, today, now, 'Sara Khan');
    eq(full.split('\n').slice(0, 2), ['Symptom diary: Migraine, Sara Khan', 'Period: Fri 25 Sep to Sat 24 Oct 2026 (the last 30 days)'], 'report heading');
    eq((full.match(/\n- /g) || []).length, 6, 'all 6 episodes in the full report');
    const short = C.reportText(sym, C.summary(many(10).concat(eps), 'm', '30', today, now), today, now, '', 1200);
    eq(short.length <= 1200, true, 'email text kept short');
    eq(/More episodes: use Print/.test(short), true, 'short text says where the rest is');
    const sheet = C.csv(sym, [ep('c', '2026-10-01T10:00', '2026-10-01T11:30', 5, ['Stress'], [med('=cmd', 'yes')], { note: 'said "ouch", then slept' })], now);
    eq(sheet.split('\r\n')[1], 'Migraine,2026-10-01 10:00,2026-10-01 11:30,90,1 h 30 min,5,,Stress,\'=cmd,helped,"said ""ouch"", then slept"', 'csv row is safe and quoted');

    const summaryText = pass + ' passed, ' + failed + ' failed';
    if (typeof module !== 'undefined' && module.exports) {
        out.forEach(l => console.log(l)); console.log(summaryText); if (failed) process.exitCode = 1;
    } else {
        document.getElementById('out').textContent = out.concat(summaryText).join('\n');
        document.title = (failed ? 'FAIL ' : 'PASS ') + summaryText;
    }
})();
