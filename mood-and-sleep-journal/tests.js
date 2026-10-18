// Checks for core.js. Run: node mood-and-sleep-journal/tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.MoodCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; if (!ok) out.push('FAIL ' + name + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); };

    // ---- Hina's two weeks from the README (5 to 18 Oct 2026, one missed day: 11 Oct)
    // day, mood, sleep minutes, tags (t0 Exercise, t1 Time outside, t2 Work or study stress, t3 Caffeine after 2 pm)
    const DAYS = [
        ['05', 3, 420, ['t2']], ['06', 2, 330, ['t2', 't3']], ['07', 4, 450, ['t0', 't1']], ['08', 3, 400, ['t2']], ['09', 4, 480, ['t0']],
        ['10', 5, 510, ['t0', 't1']], ['12', 2, 300, ['t2', 't3']], ['13', 3, 390, []], ['14', 4, 460, ['t0']], ['15', 2, 340, ['t2', 't3']],
        ['16', 4, 440, ['t0', 't1']], ['17', 5, 500, ['t1']], ['18', 3, null, ['t2']]];
    const E = {}; DAYS.forEach(([d, m, s, tags]) => { E['2026-10-' + d] = { m, s, tags, note: '' }; });
    const T = C.defaultTags();
    const s = C.summary(E, { from: '2026-10-05', to: '2026-10-18', tags: T });
    eq('n and span', [s.n, s.span], [13, 14]);
    eq('avg mood', s.avg, 3.4);                     // 44 / 13 = 3.38
    eq('avg sleep', [s.sleep, s.sleepN], [418, 12]); // 5020 / 12 = 418.3 -> 6 h 58 min
    eq('fmt sleep', C.fmtSleep(418), '6 h 58 min');
    eq('counts', s.counts, { 1: 0, 2: 3, 3: 4, 4: 4, 5: 2 });
    eq('low days', s.lowDays, 3);
    const ex = s.byTag.find(t => t.id === 't0');
    eq('exercise', [ex.withN, ex.withAvg, ex.withoutN, ex.withoutAvg, ex.diff, ex.few], [5, 4.2, 8, 2.9, 1.3, false]);   // 21/5 = 4.2, 23/8 = 2.875
    const st = s.byTag.find(t => t.id === 't2');
    eq('stress', [st.withN, st.withAvg, st.withoutN, st.withoutAvg, st.diff], [6, 2.5, 7, 4.1, -1.6]);  // 15/6 = 2.5, 29/7 = 4.14
    const cf = s.byTag.find(t => t.id === 't3');
    eq('caffeine', [cf.withN, cf.withAvg, cf.withoutAvg, cf.diff, cf.few], [3, 2, 3.8, -1.8, false]);   // 6/3 = 2.0, 38/10 = 3.8
    eq('unused tags left out', s.byTag.some(t => t.id === 't4'), false);
    eq('biggest difference first', s.byTag.map(t => t.id), ['t3', 't2', 't1', 't0']);   // 1.8, 1.6 (shown -1.6), time outside 4.5 vs 2.9 = 1.6, exercise 1.3
    eq('sleep bands', s.sleepBands, { short: { n: 3, avg: 2 }, mid: { n: 2, avg: 3 }, long: { n: 7, avg: 4.1 } });  // under 6 h, 6 h to 6 h 59, 7 h or more: 29/7 = 4.14
    eq('best and worst', [s.best.day, s.worst.day], ['2026-10-17', '2026-10-06']);
    eq('mood word', [C.moodWord(3.4), C.moodWord(3.5), C.moodWord(1.2), C.moodWord(4.9)], ['Okay', 'Good', 'Very low', 'Very good']);
    eq('empty period', C.summary(E, { from: '2026-11-01', to: '2026-11-07', tags: T }).n, 0);
    eq('empty span', C.summary(E, { from: '2026-11-01', to: '2026-11-07', tags: T }).span, 7);
    eq('nothing at all', C.summary({}, {}).n, 0);
    eq('all: span from first entry', C.summary(E, { tags: T }).span, 14);
    const one = C.summary({ '2026-10-18': { m: 4, s: null, tags: ['t0'], note: '' } }, { tags: T });
    eq('one day: no without', [one.byTag[0].withoutAvg, one.byTag[0].diff, one.byTag[0].few, one.sleep], [null, null, true, null]);

    // ---- averages round half up exactly
    eq('avg half up', C.avgMood([{ m: 3 }, { m: 4 }, { m: 4 }, { m: 3 }]), 3.5);
    eq('avg 3.25 -> 3.3', C.avgMood([{ m: 3 }, { m: 3 }, { m: 3 }, { m: 4 }]), 3.3);
    eq('avg 3.35 -> 3.4 (20 days)', C.avgMood(Array.from({ length: 20 }, (_, i) => ({ m: i < 13 ? 3 : i < 20 ? 4 : 3 })).concat([])), 3.4);
    eq('sleep half up', C.avgSleep([{ s: 420 }, { s: 421 }]), 421);
    eq('sleep skips blanks', C.avgSleep([{ s: null }, { s: 400 }]), 400);

    // ---- sleep typing
    const p = t => C.parseSleep(t);
    eq('7.5', p('7.5').minutes, 450); eq('7,5', p('7,5').minutes, 450); eq('7', p('7').minutes, 420); eq('7:30', p('7:30').minutes, 450);
    eq('7h30', p('7h30').minutes, 450); eq('7 h 30 min', p('7 h 30 min').minutes, 450); eq('8 hours', p('8 hours').minutes, 480);
    eq('45 min', p('45 min').minutes, 45); eq('0', p('0').minutes, 0); eq('blank is fine', p('  ').minutes, null);
    eq('6.25', p('6.25').minutes, 375); eq('24', p('24').minutes, 1440);
    eq('25 refused', !!p('25').error, true); eq('7:75 refused', !!p('7:75').error, true); eq('letters', !!p('lots').error, true);
    eq('negative', !!p('-3').error, true); eq('huge', !!p('99999').error, true);
    // bedtime and wake-up time, across midnight
    eq('23:30 to 07:00', C.sleepFromTimes('23:30', '07:00').minutes, 450);
    eq('01:15 to 08:45', C.sleepFromTimes('01:15', '08:45').minutes, 450);
    eq('day sleep after a night shift 09:00 to 15:30', C.sleepFromTimes('09:00', '15:30').minutes, 390);
    eq('same time', !!C.sleepFromTimes('07:00', '07:00').error, true);
    eq('missing time', !!C.sleepFromTimes('', '07:00').error, true);
    eq('fmt whole hours', C.fmtSleep(480), '8 h'); eq('fmt zero', C.fmtSleep(0), '0 h'); eq('fmt null', C.fmtSleep(null), '');

    // ---- tags
    eq('tag ok', C.checkTag('  Meditated ', T).name, 'Meditated');
    eq('tag blank', !!C.checkTag('   ', T).error, true);
    eq('tag repeat any case', !!C.checkTag('exercise', T).error, true);
    eq('tag too long', !!C.checkTag('x'.repeat(30), T).error, true);
    eq('tag limit', !!C.checkTag('New', Array.from({ length: 24 }, (_, i) => ({ id: 'x' + i, name: 'T' + i }))).error, true);

    // ---- dates
    eq('add days over month', C.addDays('2026-10-31', 1), '2026-11-01'); eq('leap', C.addDays('2028-02-28', 1), '2028-02-29');
    eq('valid day', [C.validDay('2026-02-29'), C.validDay('2028-02-29'), C.validDay('2026-13-01'), C.validDay('x')], [false, true, false, false]);

    // ---- saved data
    eq('clean null', C.clean(null), null); eq('clean array entries', C.clean({ entries: [] }), null);
    const c = C.clean({ entries: { '2026-10-18': { m: 4, s: 450, tags: ['t0', 't0', 'zzz'], note: 'ok\nline two' }, '2026-02-30': { m: 3 }, '2026-10-17': { m: 9 }, '2026-10-16': { m: 2, s: 5000 } },
        tags: [{ id: 't0', name: 'Exercise' }, { id: 't0', name: 'Dup id' }, { id: 't9', name: 'exercise' }, { id: '', name: 'x' }, { id: 't5', name: '  Prayed  ' }], period: 'zz', month: '2026-13', helpline: 'Umang 0311 7786264' });
    eq('clean entries', Object.keys(c.entries), ['2026-10-16', '2026-10-18']);
    eq('clean tags', c.tags.map(t => t.name), ['Exercise', 'Prayed']);
    eq('clean entry', c.entries['2026-10-18'], { m: 4, s: 450, tags: ['t0'], note: 'ok\nline two' });
    eq('clean bad sleep dropped', c.entries['2026-10-16'].s, null);
    eq('clean defaults', [c.period, c.month, c.helpline], ['30', '', 'Umang 0311 7786264']);
    eq('clean no tags list gives defaults', C.clean({ entries: {} }).tags.length, 8);

    // ---- spreadsheet
    eq('csv', C.csv({ '2026-10-18': { m: 4, s: 450, tags: ['t0', 't2'], note: '=bad, "x"' } }, T).split('\r\n')[1], '2026-10-18,4,Good,7.5,Exercise; Work or study stress,"\'=bad, ""x"""');
    eq('csv header', C.csv({}, T).split('\r\n')[0], 'Date,Mood (1-5),Mood,Hours slept,Tags,Note');

    const summaryLine = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined' && document.getElementById('out')) document.getElementById('out').textContent = summaryLine + '\n' + out.join('\n');
    else { console.log(out.join('\n')); console.log(summaryLine); if (fail) process.exitCode = 1; }
})();
