// Checks for core.js, against dates worked out by hand. Run: node shift-work-calendar/tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.ShiftCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; if (!ok) out.push('FAIL ' + name + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); };
    const d = C.dayNum, on = (p, iso) => C.shiftOn(p, d(iso)).id;

    // calendar days
    eq('day numbers', d('1970-01-02'), 1);
    eq('round trip', C.isoOf(d('2026-10-13')), '2026-10-13');
    eq('31 Feb is not a date', isNaN(d('2026-02-31')), true);
    eq('blank date', isNaN(d('')), true);
    eq('leap year', d('2028-03-01') - d('2028-02-28'), 2);
    eq('summer time change is one day', d('2026-03-30') - d('2026-03-29'), 1);
    eq('weekday Tue', C.weekday(d('2026-10-13')), 2);
    eq('weekday Sun', C.weekday(d('2026-10-18')), 0);
    eq('October has 31 days', C.monthDays(2026, 10).count, 31);
    eq('Feb 2028 has 29 days', C.monthDays(2028, 2).count, 29);
    eq('today from a local date', C.todayNum(new Date(2026, 9, 13, 23, 59)), d('2026-10-13'));

    // times
    eq('mins', C.mins('19:30'), 1170);
    eq('mins bad', C.mins('25:00'), null);
    eq('day shift 12 h', C.lengthMins({ start: '07:00', end: '19:00' }), 720);
    eq('night shift over midnight 12 h', C.lengthMins({ start: '19:00', end: '07:00' }), 720);
    eq('24-hour shift', C.lengthMins({ start: '07:00', end: '07:00' }), 1440);
    eq('no times = 0', C.lengthMins({ start: '', end: '07:00' }), 0);
    eq('fmt hours', C.fmtHours(10800), '180 h');
    eq('fmt hours minutes', C.fmtHours(510), '8 h 30 min');

    // Sara: 2 days, 2 nights, 4 off, day 1 = Tue 13 Oct 2026
    const sara = C.newPerson('Sara', '2d2n4off', '2026-10-13');
    eq('preset types', sara.types.map(t => t.id), ['D', 'N']);
    eq('13 Oct day', on(sara, '2026-10-13'), 'D');
    eq('15 Oct night', on(sara, '2026-10-15'), 'N');
    eq('17 Oct off', on(sara, '2026-10-17'), 'off');
    eq('21 Oct day again', on(sara, '2026-10-21'), 'D');
    eq('Sat 14 Nov (32 days later) = day 1', on(sara, '2026-11-14'), 'D');
    eq('before day 1 goes backwards: 12 Oct off', on(sara, '2026-10-12'), 'off');
    eq('8 Oct night', on(sara, '2026-10-08'), 'N');
    eq('day of pattern', C.shiftOn(sara, d('2026-10-16')).dayOfPattern, 4);
    eq('years ahead', on(sara, '2030-01-01'), ['D','D','N','N','off','off','off','off'][C.mod(d('2030-01-01') - d('2026-10-13'), 8)]);
    eq('next day off from a work day', C.nextOff(sara, d('2026-10-13')), { day: d('2026-10-17'), run: 4 });
    eq('next day off when off today', C.nextOff(sara, d('2026-10-18')), { day: d('2026-10-18'), run: 3 });
    eq('next shift', C.nextWork(sara, d('2026-10-18')), d('2026-10-21'));
    const oct = C.monthStats(sara, 2026, 10);
    eq('October shifts', [oct.shifts, oct.by.D, oct.by.N, oct.off, oct.minutes], [15, 8, 7, 16, 10800]);

    // at work right now
    eq('5 a.m. after a night: still at work', C.atWorkNow(sara, d('2026-10-16'), 300), { id: 'N', until: '07:00', fromYesterday: true });
    eq('8 a.m. after a night: not at work', C.atWorkNow(sara, d('2026-10-16'), 480), null);
    eq('20:00 on a night', C.atWorkNow(sara, d('2026-10-16'), 1200), { id: 'N', until: '07:00', fromYesterday: false });
    eq('10:00 on a day', C.atWorkNow(sara, d('2026-10-13'), 600), { id: 'D', until: '19:00', fromYesterday: false });
    eq('19:00 day ended', C.atWorkNow(sara, d('2026-10-13'), 1140), null);

    // changed by hand
    C.setChange(sara, d('2026-10-13'), 'hol');
    eq('holiday', C.shiftOn(sara, d('2026-10-13')), { id: 'hol', planned: 'D', changed: true, dayOfPattern: 1 });
    eq('holiday is a day off', C.nextOff(sara, d('2026-10-13')).day, d('2026-10-13'));
    eq('stats count holiday', [C.monthStats(sara, 2026, 10).hol, C.monthStats(sara, 2026, 10).shifts], [1, 14]);
    C.setChange(sara, d('2026-10-13'), 'D');
    eq('back to pattern removes the change', Object.keys(sara.changes).length, 0);
    C.setChange(sara, d('2026-10-18'), 'N');
    eq('extra shift on a day off', [on(sara, '2026-10-18'), C.shiftOn(sara, d('2026-10-18')).changed], ['N', true]);
    C.setChange(sara, d('2026-10-18'), '');
    eq('blank change = pattern', on(sara, '2026-10-18'), 'off');

    // partner Ali on 4 on 4 off from 15 Oct; both off 19, 20, 27, 28 Oct
    const ali = C.newPerson('Ali', '4on4off', '2026-10-15');
    eq('both off', C.allOff([sara, ali], d('2026-10-13'), 4).map(C.isoOf), ['2026-10-19', '2026-10-20', '2026-10-27', '2026-10-28']);
    eq('one person: no together list', C.allOff([sara], d('2026-10-13'), 4), []);
    const never = C.newPerson('X', '', '2026-10-13'); never.types.push(Object.assign({}, C.BUILT_IN.D)); never.seq = ['D'];
    eq('never off together', C.allOff([sara, never], d('2026-10-13'), 3), []);
    eq('pattern with no days off', C.nextOff(never, d('2026-10-13')), null);
    const empty = C.newPerson('E', '', '2026-10-13');
    eq('empty pattern = off', on(empty, '2026-10-13'), 'off');
    eq('no shifts at all', C.nextWork(empty, d('2026-10-13')), null);

    // presets
    eq('Pitman is 14 days, 7 worked', [C.PRESETS.find(p => p.id === 'pitman').seq.length, C.PRESETS.find(p => p.id === 'pitman').seq.filter(x => x === 'D').length], [14, 7]);
    eq('DuPont 28 days, 14 worked', [C.PRESETS.find(p => p.id === 'dupont').seq.length, C.PRESETS.find(p => p.id === 'dupont').seq.filter(x => x !== 'off').length], [28, 14]);
    eq('preset found from pattern', C.presetFor(sara.seq), '2d2n4off');
    eq('own pattern has no preset', C.presetFor(['D', 'off', 'N']), '');
    const mf = C.newPerson('M', '', '2026-10-13'); C.applyPreset(mf, 'mon-fri', d('2026-10-13'));
    eq('Monday to Friday starts on Monday', [mf.start, on(mf, '2026-10-17'), on(mf, '2026-10-16'), on(mf, '2026-10-19')], ['2026-10-12', 'off', 'D', 'D']);
    const ff = C.newPerson('F', '24-48', '2026-10-13');
    eq('24 on 48 off', [on(ff, '2026-10-13'), on(ff, '2026-10-14'), on(ff, '2026-10-16')], ['T', 'off', 'T']);
    eq('24h at work at 03:00 next day', C.atWorkNow(ff, d('2026-10-14'), 180), { id: 'T', until: '07:00', fromYesterday: true });
    eq('24h short label', C.shortOf(ff, 'T'), '24');

    // own shift types
    const own = C.newPerson('O', '', '2026-10-13');
    const tw = C.addType(own, '', '  Twilight   shift ').type;
    eq('custom name tidied', tw.name, 'Twilight shift');
    eq('custom short', C.shortOf(own, tw.id), 'T');
    const t2 = C.addType(own, '', 'Training').type;
    eq('clash uses two letters', [C.shortOf(own, tw.id), C.shortOf(own, t2.id)], ['TS', 'Tr']);
    eq('duplicate built-in refused', !!(C.addType(own, 'D').type && C.addType(own, 'D').error), true);
    own.seq = [tw.id, 'off'];
    eq('cannot remove a type in the pattern', !!C.removeType(own, tw.id).error, true);
    eq('remove unused type', [C.removeType(own, t2.id).ok, own.types.map(t => t.id)], [true, [tw.id, 'D']]);
    eq('blank name gets a name', C.addType(own, '', '   ').type.name, 'Shift 3');
    eq('no times: hours 0', C.monthStats(own, 2026, 10).noTime > 0, true);

    // calendar file
    const cal = C.ics(sara, d('2026-10-15'), d('2026-10-17'), true, '20261013T000000Z');
    eq('ics 2 shifts (17th off)', cal.events, 2);
    eq('night ends next morning', /DTSTART:20261015T190000\r\nDTEND:20261016T070000/.test(cal.text), true);
    eq('ics name', cal.text.includes('SUMMARY:Sara: Night shift'), true);
    eq('ics CRLF', cal.text.endsWith('END:VCALENDAR\r\n'), true);
    const cal2 = C.ics(own, d('2026-10-13'), d('2026-10-13'), false, 'x');
    eq('no times = all-day event', cal2.text.includes('DTSTART;VALUE=DATE:20261013'), true);
    const p3 = C.newPerson('A;B, C', '24-48', '2026-10-13');
    eq('ics escaping', C.ics(p3, d('2026-10-13'), d('2026-10-13'), true, 'x').text.includes('SUMMARY:A\\;B\\, C: 24-hour shift'), true);
    eq('24h ends next day', C.ics(p3, d('2026-10-13'), d('2026-10-13'), true, 'x').text.includes('DTEND:20261014T070000'), true);

    // saved data
    eq('corrupt = null', C.cleanState(null), null);
    eq('no people = null', C.cleanState({ people: [] }), null);
    eq('bad start date dropped', C.cleanState({ people: [{ name: 'x', start: '2026-13-40', seq: [] }] }), null);
    const cs = C.cleanState({ people: [{ id: 'a', name: '<b>x</b>', start: '2026-10-13', seq: ['D', 'Z', 'off', 'hol'], types: [{ id: 'D', name: 'Day', start: '7:00', end: '19:00', color: 'red' }, { id: 'D' }], changes: { '2026-10-13': 'N', 'junk': 'D', '2026-10-14': 'hol' } }], active: 7, weekStart: 0 });
    eq('cleaned', [cs.people[0].name, cs.people[0].seq, cs.people[0].types.length, cs.people[0].types[0].start, cs.people[0].types[0].color.length, cs.people[0].changes, cs.active, cs.weekStart],
        ['<b>x</b>', ['D', 'off'], 1, '', 7, { '2026-10-14': 'hol' }, 0, 0]);
    eq('five people cut to four', C.cleanState({ people: [1, 2, 3, 4, 5].map(i => ({ id: 'p' + i, start: '2026-10-13', seq: [] })) }).people.length, 4);
    eq('same id twice fixed', new Set(C.cleanState({ people: [{ id: 'a', start: '2026-10-13' }, { id: 'a', start: '2026-10-13' }] }).people.map(p => p.id)).size, 2);
    eq('long pattern cut', C.cleanState({ people: [{ start: '2026-10-13', seq: Array(200).fill('off') }] }).people[0].seq.length, C.MAX_DAYS);

    const summary = pass + ' passed, ' + fail + ' failed' + (out.length ? '\n' + out.join('\n') : '');
    if (typeof document !== 'undefined') document.getElementById('out').textContent = summary; else { console.log(summary); if (fail) process.exit(1); }
})();
