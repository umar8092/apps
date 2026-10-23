// Logic checks for core.js. Run: node tests.js (or open test.html). Works in any time zone.
(function () {
    const M = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.STA;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const at = (key, hm) => M.atTime(key, hm);
    const T = '2026-10-23'; // a Friday
    const d = s => M.parseDuration(s).min, bad = (s, o) => !!M.parseDuration(s, o).error;

    // typed durations
    eq('45', d('45'), 45); eq('45 min', d('45 min'), 45); eq('90m', d('90m'), 90); eq('1:30', d('1:30'), 90); eq('0:45', d('0:45'), 45);
    eq('1h30', d('1h30'), 90); eq('1 h 30 min', d('1 h 30 min'), 90); eq('2 hours', d('2 hours'), 120); eq('1.5 h', d('1.5 h'), 90); eq('1,5 h', d('1,5 h'), 90);
    eq('1 hour and 15 minutes', d('1 hour and 15 minutes'), 75); eq('spaces and caps', d('  2 HOURS '), 120); eq('pasted nbsp', d('1 h'), 60);
    eq('zero allowed (no screen time)', d('0'), 0); eq('zero refused for bonus', bad('0', { min: 1 }), true);
    eq('blank refused', bad(''), true); eq('negative refused', bad('-10'), true); eq('words refused', bad('lots'), true); eq('1:75 refused', bad('1:75'), true);
    eq('1 h 75 refused', bad('1 h 75'), true); eq('24 h allowed', d('24 h'), 1440); eq('25 h refused', bad('25 h'), true); eq('huge refused', bad('99999'), true);
    eq('bonus max 6 h', bad('7 h', { min: 1, max: 360 }), true);
    eq('fmtDur', [M.fmtDur(0), M.fmtDur(45), M.fmtDur(60), M.fmtDur(90), M.fmtDur(125)], ['0 min', '45 min', '1 h', '1 h 30 min', '2 h 5 min']);
    eq('fmtClock', [M.fmtClock(1499), M.fmtClock(60), M.fmtClock(5), M.fmtClock(3900), M.fmtClock(-3)], ['24:59', '1:00', '0:05', '1:05:00', '0:00']);

    // days
    eq('addDays over month end', M.addDays('2026-10-31', 1), '2026-11-01'); eq('addDays over year', M.addDays('2026-12-31', 1), '2027-01-01');
    eq('weekday Fri', M.weekday(T), 5); eq('isKey', [M.isKey('2026-02-30'), M.isKey('2026-02-28'), M.isKey('x')], [false, true, false]);

    // the main situation: Ali 1 h on school days, 2 h at weekends; Sara 1 h 30 min and 3 h
    let st = M.emptyState();
    const ali = { id: M.nextId(st), name: 'Ali', school: 60, weekend: 120 }, sara = { id: M.nextId(st), name: 'Sara', school: 90, weekend: 180 };
    st.kids.push(ali, sara);
    eq('Friday is a school day', M.dayType(st, T), 'school'); eq('Saturday is weekend', M.dayType(st, '2026-10-24'), 'weekend');
    eq('school allowance', M.allowanceMin(st, ali, T), 60); eq('weekend allowance', M.allowanceMin(st, ali, '2026-10-24'), 120);
    M.start(st, ali.id, at(T, '17:00'));
    eq('cannot start twice', M.start(st, ali.id, at(T, '17:05')), null);
    let s = M.status(st, ali, T, at(T, '17:20'));
    eq('running 20 min', [s.running, s.usedMin, s.leftMin, s.leftSec, s.state], [true, 20, 40, 2400, 'ok']);
    s = M.status(st, ali, T, at(T, '17:20') + 30000);
    eq('half minutes: used and left add up', [s.usedMin, s.leftMin, s.usedMin + s.leftMin], [21, 39, 60]);
    M.stop(st, ali.id, at(T, '17:35'));
    s = M.status(st, ali, T, at(T, '18:00'));
    eq('Ali after stopping: 25 min left', [s.running, s.usedMin, s.leftMin, s.state], [false, 35, 25, 'ok']);
    eq('status line', M.statusLine(ali, s), 'Ali: 25 min left today (35 min of 1 h used).');
    // second session in the evening, warning and time up
    M.start(st, ali.id, at(T, '19:00'));
    eq('warn at 5 min left', M.status(st, ali, T, at(T, '19:20')).state, 'warn');
    eq('not warned at 6 min left', M.status(st, ali, T, at(T, '19:19')).state, 'ok');
    s = M.status(st, ali, T, at(T, '19:25'));
    eq('time up exactly', [s.state, s.leftSec, s.overMin], ['up', 0, 0]);
    s = M.status(st, ali, T, at(T, '19:37'));
    eq('over by 12', [s.state, s.overMin, s.usedMin], ['up', 12, 72]);
    eq('over line', M.statusLine(ali, s), 'Ali: time is up, over by 12 min (1 h 12 min of 1 h used).');
    M.stop(st, ali.id, at(T, '19:37'));
    // bonus
    st.bonus.push({ id: M.nextId(st), kid: sara.id, date: T, min: 15, note: 'Homework' });
    s = M.status(st, sara, T, at(T, '18:00'));
    eq('Sara with bonus', [s.allowMin, s.bonusMin, s.leftMin, s.state], [105, 15, 105, 'ok']);
    eq('bonus is only for that day', M.allowanceMin(st, sara, M.addDays(T, 1)), 180);
    eq('warning off', (() => { const c = M.emptyState(); c.kids.push({ id: 1, name: 'A', school: 60, weekend: 60 }); c.settings.warn = 0; c.manual.push({ id: 2, kid: 1, date: T, min: 58, note: '' }); return M.status(c, c.kids[0], T, at(T, '19:21')).state; })(), 'ok');

    // two children at once are counted separately
    M.start(st, sara.id, at(T, '20:00'));
    eq('Sara runs, Ali stays stopped', [M.status(st, sara, T, at(T, '20:30')).usedMin, M.status(st, ali, T, at(T, '20:30')).usedMin], [30, 72]);
    M.stop(st, sara.id, at(T, '20:30'));

    // midnight: 23:30 to 00:30 counts 30 min on each day
    let m = M.emptyState(); const k = { id: M.nextId(m), name: 'Zain', school: 60, weekend: 120 }; m.kids.push(k);
    M.start(m, k.id, at(T, '23:30'));
    const sat = '2026-10-24', after = at(sat, '00:30');
    eq('running over midnight', [Math.ceil(M.usedSec(m, k.id, T, after) / 60), Math.ceil(M.usedSec(m, k.id, sat, after) / 60)], [30, 30]);
    eq('the session shows on both days', [M.dayEntries(m, k.id, T).sessions.length, M.dayEntries(m, k.id, sat).sessions.length], [1, 1]);
    M.stop(m, k.id, after);
    eq('Saturday left after midnight session', M.status(m, k, sat, after).leftMin, 90);
    eq('next day not counted', M.dayEntries(m, k.id, '2026-10-25').sessions.length, 0);
    // forgot to stop: never more than a day
    M.start(m, k.id, at(sat, '10:00'));
    M.stop(m, k.id, at(sat, '10:00') + 3 * 86400000);
    eq('a forgotten session is capped at 24 h', (m.sessions[1].end - m.sessions[1].start) / 60000, 1440);
    eq('a zero-length session at midnight shows once', (() => { const z = M.emptyState(); z.kids.push({ id: 1, name: 'A', school: 60, weekend: 60 }); z.seq = 2; z.sessions.push({ id: 2, kid: 1, start: at(sat, '00:00'), end: at(sat, '00:00') }); return [M.dayEntries(z, 1, T).sessions.length, M.dayEntries(z, 1, sat).sessions.length]; })(), [0, 1]);

    // no screen time on school days
    const none = { id: 99, name: 'Baby', school: 0, weekend: 30 };
    let n = M.emptyState(); n.kids.push(none);
    eq('zero allowance', M.status(n, none, T, at(T, '12:00')).state, 'none');
    eq('zero allowance line', M.statusLine(none, M.status(n, none, T, at(T, '12:00'))), 'Baby: no screen time today.');
    n.manual.push({ id: 100, kid: 99, date: T, min: 10, note: '' });
    eq('zero allowance used anyway is over', [M.status(n, none, T, at(T, '12:00')).state, M.status(n, none, T, at(T, '12:00')).overMin], ['up', 10]);

    // holidays and weekend days
    st.days[T] = 'weekend';
    eq('holiday uses weekend allowance', M.allowanceMin(st, ali, T), 120);
    eq('plain day type stays school', M.plainDayType(st, T), 'school');
    st.days['2026-10-24'] = 'school';
    eq('a school Saturday', M.allowanceMin(st, ali, '2026-10-24'), 60);
    delete st.days[T]; delete st.days['2026-10-24'];
    const fs = JSON.parse(JSON.stringify(st)); fs.settings.weekend = [5, 6];
    eq('Friday-Saturday weekend', M.dayType(fs, T), 'weekend');

    // time added by hand
    st.manual.push({ id: M.nextId(st), kid: ali.id, date: '2026-10-22', min: 30, note: 'At Grandma\'s' });
    eq('manual on yesterday', Math.ceil(M.usedSec(st, ali.id, '2026-10-22', at(T, '20:00')) / 60), 30);

    // the week view
    const w = M.week(st, ali, T, at(T, '21:00'));
    eq('7 days, oldest first, ending today', [w.length, w[0].key, w[6].key], [7, '2026-10-17', T]);
    eq('week values', [w[5].used, w[6].used, w[6].allow, w[0].allow], [30, 72, 60, 120]);

    // typing a session's times
    const now = at(T, '21:00');
    eq('session times', M.sessionTimes(T, '17:00', '17:35', now, false).end - M.sessionTimes(T, '17:00', '17:35', now, false).start, 35 * 60000);
    const yday = '2026-10-22';
    const nd = M.sessionTimes(yday, '23:30', '00:15', now, false);
    eq('end before start means next day', [nd.nextDay, (nd.end - nd.start) / 60000], [true, 45]);
    eq('start in the future refused', !!M.sessionTimes(T, '22:00', '22:30', now, false).error, true);
    eq('end in the future refused', !!M.sessionTimes(T, '20:30', '21:30', now, false).error, true);
    eq('end next day in the future refused', !!M.sessionTimes(T, '20:30', '20:00', now, false).error, true);
    eq('missing start', !!M.sessionTimes(T, '', '20:00', now, false).error, true);
    eq('running session: only the start', M.sessionTimes(T, '20:00', '', now, true).end, null);
    eq('bad time', !!M.sessionTimes(T, '25:00', '20:00', now, false).error, true);

    eq('overlap found', M.overlap(st, ali.id, at(T, '17:30'), at(T, '18:00'), -1, now).start, at(T, '17:00'));
    eq('no overlap end to end', M.overlap(st, ali.id, at(T, '17:35'), at(T, '18:00'), -1, now), null);
    eq('own session ignored', M.overlap(st, ali.id, at(T, '17:00'), at(T, '17:40'), st.sessions.find(x => x.kid === ali.id).id, now), null);

    // saved data
    const round = M.normalize(JSON.parse(JSON.stringify(st)));
    eq('round trip keeps everything', [round.kids.length, round.sessions.length, round.manual.length, round.bonus.length, round.seq >= st.seq], [2, st.sessions.length, 1, 1, true]);
    eq('not this app', [M.normalize(null), M.normalize('x'), M.normalize({}), M.normalize([1, 2])], [null, null, null, null]);
    const junk = M.normalize({ kids: [{ id: 1, name: 'A', school: 60, weekend: 60 }, { id: 1, name: 'Dup', school: 60, weekend: 60 }, { id: 2, name: '', school: 60, weekend: 60 }, { id: 3, name: 'Neg', school: -5, weekend: 60 }, { id: 4, name: '<b>x</b>', school: 30, weekend: 9999 }, null],
        sessions: [{ id: 5, kid: 1, start: 'x', end: null }, { id: 6, kid: 9, start: at(T, '10:00'), end: null }, { id: 7, kid: 1, start: at(T, '10:00'), end: at(T, '09:00') }, { id: 8, kid: 1, start: at(T, '10:00'), end: null }, { id: 9, kid: 1, start: at(T, '11:00'), end: null }],
        manual: [{ id: 10, kid: 1, date: '2026-13-01', min: 5 }, { id: 11, kid: 1, date: T, min: 0 }, { id: 12, kid: 1, date: T, min: 20, note: 5 }],
        bonus: 'x', days: { [T]: 'weekend', bad: 'weekend', '2026-10-24': 'party' }, settings: { weekend: [6, 6, 9, 0], warn: 7, sound: 'yes' }, seq: 2 });
    eq('bad kids dropped', junk.kids.map(k => k.name), ['A']);
    eq('bad sessions dropped, one running kept', junk.sessions.map(s => [s.id, s.end === null]), [[8, false], [9, true]]);
    eq('bad manual dropped', junk.manual.map(m => [m.id, m.note]), [[12, '']]);
    eq('days and settings cleaned', [junk.days, junk.settings], [{ [T]: 'weekend' }, { weekend: [0, 6], warn: 5, sound: true }]);
    eq('seq above every id', junk.seq, 13);
    eq('long names cut', M.normalize({ kids: [{ id: 1, name: 'x'.repeat(80), school: 1, weekend: 1 }] }).kids[0].name.length, 40);

    // prune
    const p = M.normalize(JSON.parse(JSON.stringify(st))); p.manual.push({ id: 500, kid: ali.id, date: '2026-07-01', min: 5, note: '' }); p.days['2026-07-01'] = 'weekend';
    M.prune(p, T);
    eq('old entries pruned', [p.manual.some(x => x.id === 500), '2026-07-01' in p.days, p.sessions.length], [false, false, st.sessions.length]);

    // the summary
    const sum = M.summary(st, T, at(T, '21:00'), 'en-GB');
    eq('summary', sum.split('\n').slice(0, 4), ['Screen time, Friday 23 October (school day)', '', 'Ali: time is up, over by 12 min (1 h 12 min of 1 h used).', '   Past 7 days: 1 h 42 min of 9 h allowed.']);
    eq('summary Sara', sum.split('\n')[4], 'Sara: 1 h 15 min left today (30 min of 1 h 45 min used). Includes 15 min bonus.');
    eq('bad locale falls back', M.longDay(T, 'en-US@posix') !== '', true);

    const text = out.join('\n') + '\n\n' + pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = text; else { console.log(text); if (fail) process.exitCode = 1; }
})();
