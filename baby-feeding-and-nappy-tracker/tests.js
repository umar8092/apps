// Checks for core.js. Run: node baby-feeding-and-nappy-tracker/tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.BabyCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; if (!ok) out.push('FAIL ' + name + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); };
    const M = C.MIN, H = C.HOUR;
    const T = new Date(2026, 9, 13, 3, 0).getTime();   // 13 Oct 2026, 3:00 a.m. local

    // amounts
    eq('amount 120', C.parseAmount('120', 'ml').value, 120);
    eq('amount comma', C.parseAmount('4,5', 'oz').value, 4.5);
    eq('amount .5', C.parseAmount('.5', 'oz').value, 0.5);
    eq('amount blank', !!C.parseAmount('  ', 'ml').error, true);
    eq('amount zero', !!C.parseAmount('0', 'ml').error, true);
    eq('amount negative', !!C.parseAmount('-30', 'ml').error, true);
    eq('amount words', !!C.parseAmount('abc', 'ml').error, true);
    eq('amount 1e3', !!C.parseAmount('1e3', 'ml').error, true);
    eq('amount huge ml', !!C.parseAmount('1200', 'ml').error, true);
    eq('amount huge oz', !!C.parseAmount('40', 'oz').error, true);
    eq('amount max ml ok', C.parseAmount('1000', 'ml').value, 1000);
    eq('minutes blank is 0', C.parseMinutes('').value, 0);
    eq('minutes 12', C.parseMinutes(' 12 ').value, 12);
    eq('minutes decimal', !!C.parseMinutes('1.5').error, true);
    eq('minutes too many', !!C.parseMinutes('200').error, true);
    eq('fmt ml', C.fmtAmount(C.toMl(4, 'oz'), 'ml'), '118 ml');
    eq('fmt oz', C.fmtAmount(120, 'oz'), '4.1 oz');
    eq('sum same unit ml', C.sumBottles([{ amount: 90, unit: 'ml' }, { amount: 120, unit: 'ml' }, { amount: 30.5, unit: 'ml' }], 'ml'), '240.5 ml');
    eq('sum same unit oz', C.sumBottles([{ amount: 4, unit: 'oz' }, { amount: 4.25, unit: 'oz' }], 'oz'), '8.25 oz');
    eq('sum oz whole', C.sumBottles([{ amount: 4, unit: 'oz' }, { amount: 4, unit: 'oz' }], 'oz'), '8.0 oz');
    eq('sum mixed', C.sumBottles([{ amount: 4, unit: 'oz' }, { amount: 60, unit: 'ml' }], 'ml'), '178 ml');

    // durations
    eq('dur under', C.fmtDur(40000), 'under 1 min');
    eq('dur 45', C.fmtDur(45 * M + 59000), '45 min');
    eq('dur 2h10', C.fmtDur(2 * H + 10 * M), '2 h 10 min');
    eq('dur 3h', C.fmtDur(3 * H), '3 h');
    eq('dur negative', C.fmtDur(-5000), 'under 1 min');
    eq('secs 0', C.fmtSecs(0), '0 min');
    eq('secs 20', C.fmtSecs(20), 'under 1 min');
    eq('secs 90 rounds', C.fmtSecs(90), '2 min');
    eq('secs 3700', C.fmtSecs(3700), '1 h 2 min');
    eq('clock', C.clock(65000), '1:05');
    eq('clock hours', C.clock(H + 4 * M + 5000), '1:04:05');

    // days
    eq('dayKey', C.dayKey(T), '2026-10-13');
    eq('addDays month end', C.addDays('2026-10-31', 1), '2026-11-01');
    eq('addDays back year', C.addDays('2026-01-01', -1), '2025-12-31');
    eq('isDay bad', C.isDay('2026-02-30'), false);

    // timer: Left 10 min, switch, Right 6 min, pause 5, resume Right 2 min
    let f = C.startFeed('L', T);
    C.switchSide(f, 'R', T + 10 * M);
    eq('switch same side no-op', C.switchSide(f, 'R', T + 11 * M).segs.length, 2);
    C.pauseFeed(f, T + 16 * M);
    eq('paused no open', C.openSeg(f), null);
    C.switchSide(f, 'R', T + 21 * M);
    eq('secs while running', C.sideSecs(f, T + 23 * M), { L: 600, R: 480 });
    let e = C.finishFeed(f, T + 23 * M, 'x1');
    eq('finish left', e.left, 600); eq('finish right', e.right, 480);
    eq('finish first/last', [e.first, e.last], ['L', 'R']);
    eq('finish start/end', [e.start, e.end], [T, T + 23 * M]);
    // stop while paused: end is the pause time
    f = C.startFeed('R', T); C.pauseFeed(f, T + 7 * M);
    e = C.finishFeed(f, T + 40 * M, 'x2');
    eq('stop while paused end', e.end, T + 7 * M);
    eq('one side', [e.left, e.right, e.first, e.last], [0, 420, 'R', 'R']);
    // a mistaken tap on Left then quickly Right: first side is Right
    f = C.startFeed('L', T); C.switchSide(f, 'R', T + 300);
    e = C.finishFeed(f, T + 5 * M, 'x3');
    eq('ignore sub-second segment', e.first, 'R');

    // next side
    eq('next none', C.nextSide([]), null);
    eq('next after both: finished side', C.nextSide([{ t: 'breast', start: T, left: 600, right: 300, first: 'L', last: 'R' }]).side, 'R');
    eq('next after one: other side', C.nextSide([{ t: 'breast', start: T, left: 600, right: 0, first: 'L', last: 'L' }]).side, 'R');
    eq('next uses latest', C.nextSide([{ t: 'breast', start: T, left: 0, right: 600, first: 'R', last: 'R' }, { t: 'breast', start: T - H, left: 600, right: 0, first: 'L', last: 'L' }]).side, 'L');
    eq('bottle ignored for side', C.nextSide([{ t: 'bottle', start: T + H, amount: 90, unit: 'ml' }, { t: 'breast', start: T, left: 600, right: 0, first: 'L', last: 'L' }]).side, 'R');

    // totals for a day with a sleep across midnight
    const D = new Date(2026, 9, 13).getTime(), D2 = new Date(2026, 9, 14).getTime();
    const list = [
        { t: 'breast', start: D + 1 * H, left: 600, right: 480, first: 'L', last: 'R' },
        { t: 'bottle', start: D + 4 * H, amount: 90, unit: 'ml' },
        { t: 'breast', start: D + 7 * H, left: 0, right: 900, first: 'R', last: 'R' },
        { t: 'nappy', start: D + 2 * H, wet: true, dirty: false },
        { t: 'nappy', start: D + 5 * H, wet: true, dirty: true },
        { t: 'nappy', start: D - 10 * M, wet: false, dirty: true },        // yesterday
        { t: 'sleep', start: D - 2 * H, end: D + 30 * M },                 // 30 min counts today
        { t: 'sleep', start: D + 22 * H, end: D2 + 2 * H }                 // 2 h counts today
    ];
    let x = C.totals(list, D, D2, 'ml');
    eq('feeds', [x.feeds, x.breast, x.bottles], [3, 2, 1]);
    eq('breast secs', x.breastSecs, 1980);
    eq('bottle text', x.bottleText, '90 ml');
    eq('nappies', [x.wet, x.dirty, x.nappies], [2, 1, 2]);
    eq('sleep split at midnight', x.sleep, 2.5 * H);
    eq('avg gap start to start', x.avgGap, 3 * H);
    x = C.totals(list, D, D2, 'ml', { sleep: { start: D + 10 * H }, feed: { start: D + 9 * H, segs: [] }, now: D + 11 * H });
    eq('running sleep counted', x.sleep, 3.5 * H);
    eq('running feed counted', x.feeds, 4);
    x = C.totals([], D, D2, 'oz');
    eq('empty day', [x.feeds, x.bottleText, x.sleep, x.avgGap], [0, '', 0, 0]);

    // entry checks
    const now = T + H;
    eq('future refused', !!C.checkEntry({ t: 'nappy', start: now + 10 * M, wet: true }, now).error, true);
    eq('nappy needs a kind', !!C.checkEntry({ t: 'nappy', start: T, wet: false, dirty: false }, now).error, true);
    eq('breast needs minutes', !!C.checkEntry({ t: 'breast', start: T, left: 0, right: 0 }, now).error, true);
    eq('breast one side fixes first/last', (r => [r.first, r.last])(C.checkEntry({ t: 'breast', start: T, left: 0, right: 300, first: 'L', last: 'L' }, now).entry), ['R', 'R']);
    eq('sleep end before start', !!C.checkEntry({ t: 'sleep', start: T, end: T - M }, now).error, true);
    eq('sleep 25 h', !!C.checkEntry({ t: 'sleep', start: T - 25 * H, end: T }, now).error, true);
    eq('bottle too big', !!C.checkEntry({ t: 'bottle', start: T, amount: 2000, unit: 'ml' }, now).error, true);
    eq('long note cut', C.checkEntry({ t: 'nappy', start: T, wet: true, note: 'x'.repeat(500) }, now).entry.note.length, 200);
    eq('unknown type', !!C.checkEntry({ t: 'bath', start: T }, now).error, true);

    // clean: corrupt or odd saved data
    eq('clean null', C.clean(null, now).babies.length, 1);
    eq('clean junk', C.clean('junk', now).babies[0].name, 'Baby');
    let st = C.clean({ unit: 'oz', current: 'b2', babies: [
        { id: 'b1', name: '  Amina ', entries: [{ id: 'a', t: 'nappy', start: T, wet: true }, { id: 'a', t: 'nappy', start: T, wet: true }, { t: 'nappy', start: 'x' }, null], feed: { start: T, segs: [{ side: 'L', from: T, to: null }] } },
        { id: 'b2', name: '', entries: 'bad', feed: { start: T, segs: [{ side: 'X', from: T }] }, sleep: { start: T } },
        { id: 'b1', name: 'Dup id' }, { name: 'Four' }, { name: 'Five' }] }, now);
    eq('clean unit', st.unit, 'oz');
    eq('clean max 4 babies', st.babies.length, 4);
    eq('clean name trimmed', st.babies[0].name, 'Amina');
    eq('clean dedupe and drop bad', st.babies[0].entries.length, 1);
    eq('clean running feed kept', !!st.babies[0].feed, true);
    eq('clean bad feed dropped', st.babies[1].feed, null);
    eq('clean blank name', st.babies[1].name, 'Baby');
    eq('clean sleep kept', !!st.babies[1].sleep, true);
    eq('clean current', st.current, 'b2');
    eq('clean unique ids', new Set(st.babies.map(b => b.id)).size, 4);

    // describe
    eq('describe both', C.describe({ t: 'breast', left: 720, right: 480, first: 'L' }, 'ml').detail, 'Left 12 min, then Right 8 min (20 min)');
    eq('describe right first', C.describe({ t: 'breast', left: 300, right: 600, first: 'R' }, 'ml').detail, 'Right 10 min, then Left 5 min (15 min)');
    eq('describe bottle', C.describe({ t: 'bottle', amount: 4.5, unit: 'oz', milk: 'formula' }, 'oz').detail, '4.5 oz, formula');
    eq('describe bottle other unit', C.describe({ t: 'bottle', amount: 4, unit: 'oz', milk: 'breast' }, 'ml').detail, '118 ml (4.0 oz), breast milk');
    eq('describe nappy', C.describe({ t: 'nappy', wet: true, dirty: true }).detail, 'Wet and dirty');

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') { document.getElementById('out').textContent = out.concat(summary).join('\n'); document.title = fail ? 'FAIL' : 'PASS'; }
    else { out.forEach(l => console.log(l)); console.log(summary); if (fail) process.exitCode = 1; }
})();
