// Checks for core.js. Run: TZ=Asia/Karachi node tests.js (also try TZ=Europe/London for summer time)
if (typeof require !== 'undefined') require('./core.js');
const C = globalThis.LSCore;
let pass = 0, failed = 0;
function eq(got, want, name) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) pass++; else { failed++; console.log('FAIL ' + name + '\n  got  ' + g + '\n  want ' + w); }
}
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
const ALL = [0, 1, 2, 3, 4, 5, 6];

// ---------- typed times ----------
eq(C.parseTime('14:00'), 840, '14:00');
eq(C.parseTime('14.30'), 870, '14.30');
eq(C.parseTime('1430'), 870, '1430');
eq(C.parseTime('2pm'), 840, '2pm');
eq(C.parseTime('2:30 PM'), 870, '2:30 PM');
eq(C.parseTime('12 am'), 0, '12 am is midnight');
eq(C.parseTime('12pm'), 720, '12 pm is noon');
eq(C.parseTime('24:00'), 1440, '24:00');
eq(C.parseTime('8'), 480, '8');
eq(C.parseTime('25:00'), null, '25:00');
eq(C.parseTime('10:75'), null, '10:75');
eq(C.parseTime('13pm'), null, '13pm');
eq(C.parseTime(''), null, 'blank');
eq(C.parseTime('abc'), null, 'letters');

// ---------- pasted schedule ----------
let p = C.parseScheduleText('Feeder Model Town\n08:00-10:00, 14:00 to 16:00\n20:00 – 21:00');
eq(p.slots, [{ s: 480, e: 600 }, { s: 840, e: 960 }, { s: 1200, e: 1260 }], 'pasted 24 h list');
eq(p.bad, [], 'no bad lines');
p = C.parseScheduleText('2-4pm and 11-1pm\n10pm to 1am');
eq(p.slots, [{ s: 840, e: 960 }, { s: 660, e: 780 }, { s: 1320, e: 60 }], 'am/pm shorthands and across midnight');
p = C.parseScheduleText('1400-1600\nCall 118 for help\n22:00-24:00\n9:00-9:00');
eq(p.slots, [{ s: 840, e: 960 }, { s: 1320, e: 0 }], '4 digit times, 24:00, same start and end skipped');
eq(p.bad, ['Call 118 for help', '9:00-9:00'], 'lines with numbers but no times reported');
eq(C.parseScheduleText('').slots, [], 'empty paste');
eq(C.parseScheduleText('08:00-10:00\n08:00-10:00').slots.length, 1, 'duplicate times kept once');

// ---------- durations ----------
eq(C.dur(0), '0 min', '0 min');
eq(C.dur(45 * 60000), '45 min', '45 min');
eq(C.dur(120 * 60000), '2 h', '2 h');
eq(C.dur(73 * 60000), '1 h 13 min', '1 h 13 min');
eq(C.dur(29 * 1000), '0 min', 'half a minute rounds down');
eq(C.dur(-5), '0 min', 'never negative');

// ---------- a place: Ayesha in Lahore, 3 cuts a day, a different evening cut on Fridays ----------
const since = at(2026, 10, 1, 9, 0);
function home() {
    const pl = { id: 'h', name: 'Home', since, schedules: [], cuts: [] };
    C.setSchedule(pl, [{ s: 480, e: 540, days: ALL }, { s: 840, e: 960, days: ALL }, { s: 1200, e: 1260, days: [0, 1, 2, 3, 4, 6] }, { s: 1320, e: 1380, days: [5] }], since);
    return pl;
}
let h = home();
eq(h.schedules.length, 1, 'one schedule');
eq(C.slotsOn(h, at(2026, 10, 30)).map(C.slotText), ['08:00 to 09:00', '14:00 to 16:00', '22:00 to 23:00'], 'Friday 30 Oct has the late cut');
eq(C.slotsOn(h, at(2026, 10, 29)).map(C.slotText), ['08:00 to 09:00', '14:00 to 16:00', '20:00 to 21:00'], 'Thursday');
eq(C.slotsOn(h, at(2026, 9, 30)).length, 3, 'the first schedule also covers earlier days (Wed 30 Sep: 3 cuts)');
eq(C.daysText([1, 2, 3, 4, 5]), 'Mon to Fri', 'weekdays');
eq(C.daysText(ALL), 'Every day', 'every day');
eq(C.daysText([5]), 'Fri', 'Friday');
eq(C.daysText([0, 6]), 'Sat and Sun', 'weekend');
eq(C.plannedPerDay(h, at(2026, 10, 29)), 4 * 3600000, '4 h planned a day');

// status at 12:20 on Thu 29 Oct: next cut 14:00 to 16:00 in 1 h 40 min
let st = C.status(h, at(2026, 10, 29, 12, 20));
eq([st.cur, st.next && [C.clock(st.next[0]), C.clock(st.next[1])], C.dur(st.next[0] - at(2026, 10, 29, 12, 20))], [null, ['14:00', '16:00'], '1 h 40 min'], 'next cut');
st = C.status(h, at(2026, 10, 29, 15, 25));
eq([C.clock(st.cur[1]), C.dur(st.cur[1] - at(2026, 10, 29, 15, 25))], ['16:00', '35 min'], 'in a planned cut: back at 16:00 in 35 min');
st = C.status(h, at(2026, 10, 29, 21, 30));
eq([C.dayWord(st.next[0], at(2026, 10, 29, 21, 30)), C.clock(st.next[0])], ['Tomorrow', '08:00'], 'next cut tomorrow morning');
st = C.status(h, at(2026, 10, 29, 14, 0));
eq(!!st.cur, true, 'exactly at the start counts as in the cut');
st = C.status(h, at(2026, 10, 29, 16, 0));
eq([st.cur, C.clock(st.next[0])], [null, '20:00'], 'exactly at the end the power is back');

// a cut across midnight, and two cuts that touch, merge into one
const night = { id: 'n', name: 'Shop', since, schedules: [], cuts: [] };
C.setSchedule(night, [{ s: 1380, e: 0, days: ALL }, { s: 0, e: 90, days: ALL }], since);
st = C.status(night, at(2026, 10, 29, 23, 30));
eq([C.clock(st.cur[0]), C.clock(st.cur[1]), C.dayWord(st.cur[1], at(2026, 10, 29, 23, 30))], ['23:00', '01:30', 'Tomorrow'], '23:00 to 00:00 plus 00:00 to 01:30 is one cut');
st = C.status(night, at(2026, 10, 30, 0, 45));
eq(C.clock(st.cur[1]), '01:30', 'still in the cut after midnight');
eq(C.slotText({ s: 1320, e: 60 }), '22:00 to 01:00 (next day)', 'next day label');

// no schedule
const empty = { id: 'e', name: 'Office', since, schedules: [], cuts: [] };
st = C.status(empty, at(2026, 10, 29, 12, 0));
eq([st.cur, st.next, st.hasSlots], [null, null, false], 'no cut times');

// a schedule change keeps the old times for earlier days
h = home();
C.setSchedule(h, [{ s: 600, e: 720, days: ALL }], at(2026, 10, 20, 10, 0));
eq(C.slotsOn(h, at(2026, 10, 19)).length, 3, 'old schedule before the change');
eq(C.slotsOn(h, at(2026, 10, 20)).map(C.slotText), ['10:00 to 12:00'], 'new schedule from the change day');
C.setSchedule(h, [{ s: 600, e: 660, days: ALL }], at(2026, 10, 20, 18, 0));
eq(h.schedules.length, 2, 'a second change on the same day replaces that day');
eq(C.slotsOn(h, at(2026, 10, 25)).map(C.slotText), ['10:00 to 11:00'], 'latest change wins');

// ---------- logged cuts ----------
h = home();
const now = at(2026, 10, 29, 18, 30);
eq(C.cutError(h, at(2026, 10, 29, 14, 0), at(2026, 10, 29, 13, 0), null, now), 'The power must come back after it went. Check the times.', 'back before it went');
eq(C.cutError(h, at(2026, 10, 29, 14, 0), at(2026, 10, 29, 14, 0), null, now), 'The power must come back after it went. Check the times.', 'zero length');
eq(C.cutError(h, at(2026, 10, 30, 8, 0), null, null, now), 'The power cannot go in the future. Check the date and time.', 'future');
eq(C.cutError(h, at(2026, 10, 29, 14, 0), at(2026, 10, 29, 20, 0), null, now), 'The power cannot come back in the future. Leave it as still off, or check the time.', 'future end');
eq(C.cutError(h, at(2026, 9, 1, 14, 0), at(2026, 10, 29, 14, 0), null, now), 'That is longer than 31 days. Check the dates.', 'too long');
eq(C.cutError(h, null, null, null, now), 'Pick the date and time the power went.', 'blank');
h.cuts.push({ id: 'a', s: at(2026, 10, 29, 13, 50), e: at(2026, 10, 29, 16, 10), note: '' });
eq(C.cutError(h, at(2026, 10, 29, 15, 0), at(2026, 10, 29, 17, 0), null, now), 'This overlaps the cut on Thu 29 Oct from 13:50 to 16:10. Edit that one instead.', 'overlap');
eq(C.cutError(h, at(2026, 10, 29, 15, 0), at(2026, 10, 29, 17, 0), 'a', now), '', 'editing the same cut is not an overlap');
eq(C.cutError(h, at(2026, 10, 29, 16, 10), at(2026, 10, 29, 17, 0), null, now), '', 'a cut that starts when the last ended is fine');
h.cuts.push({ id: 'o', s: at(2026, 10, 29, 18, 0), e: null, note: '' });
eq(C.cutError(h, at(2026, 10, 29, 18, 20), null, null, now), 'This overlaps the cut on Thu 29 Oct from 18:00 (still off). Edit that one instead.', 'overlap with a running cut');
eq(C.openCut(h).id, 'o', 'running cut found');

// ---------- the month report (hand-worked) ----------
// Schedule since 1 Oct 09:00: 08-09, 14-16 every day, 20-21 (not Fri), 22-23 (Fri) = 4 h a day.
// Logged in the week Mon 26 Oct to Sun 1 Nov, report "Last 7 days" on Fri 30 Oct at 21:00 (24 Oct to now):
//  Sat 24 Oct 14:00-16:00 (2 h, planned)
//  Sun 25 Oct 13:50-18:00 (4 h 10 min, 2 h over: 10 min before + 2 h after)
//  Tue 27 Oct 03:00-05:30 (2 h 30 min, unplanned)
//  Thu 29 Oct 23:30 - Fri 30 Oct 00:40 (1 h 10 min, unplanned, across midnight)
//  Fri 30 Oct 20:15 - still off at 21:00 (45 min, unplanned: on Fridays the cut is at 22:00)
h = home();
h.cuts = [
    { id: '1', s: at(2026, 10, 24, 14, 0), e: at(2026, 10, 24, 16, 0), note: '' },
    { id: '2', s: at(2026, 10, 25, 13, 50), e: at(2026, 10, 25, 18, 0), note: 'transformer' },
    { id: '3', s: at(2026, 10, 27, 3, 0), e: at(2026, 10, 27, 5, 30), note: '' },
    { id: '4', s: at(2026, 10, 29, 23, 30), e: at(2026, 10, 30, 0, 40), note: '' },
    { id: '5', s: at(2026, 10, 30, 20, 15), e: null, note: '' },
];
let n2 = at(2026, 10, 30, 21, 0), pr = C.period('7d', n2), r = C.report(h, pr.from, pr.to, n2);
eq([C.shortDate(pr.from), C.shortDate(pr.to)], ['24 Oct', '31 Oct'], 'last 7 days is 24 to 30 Oct');
// off: 120 + 250 + 150 + 70 + 45 = 635 min = 10 h 35 min
eq(C.dur(r.off), '10 h 35 min', 'total without power');
eq(r.count, 5, '5 cuts');
// planned: 24..29 Oct = 6 days x 4 h = 24 h, plus 30 Oct until 21:00: 08-09, 14-16 = 3 h (22:00 cut has not come yet) = 27 h
eq(C.dur(r.planned), '27 h', 'planned so far');
eq(C.diffText(r), '16 h 25 min less than planned', 'fewer hours than planned');
// outside: 0 + 130 + 150 + 70 + 45 = 395 min
eq(C.dur(r.outside), '6 h 35 min', 'outside planned times');
eq(r.unplanned, 3, '3 unplanned cuts');
eq(r.rows.map(x => x.kind), ['unplanned', 'unplanned', 'unplanned', 'over', 'planned'], 'each cut judged');
eq(C.dur(r.longest.e - r.longest.s), '4 h 10 min', 'longest');
eq(r.days, 7, '7 days');
eq(C.dur(r.perDay), '1 h 31 min', '635 / 7 = 90.7 min a day');
eq(C.rowLine(r.rows[1]), 'Thu 29 Oct  23:30 to Fri 30 Oct 00:40  1 h 10 min  (not planned)', 'row across midnight');
eq(C.rowLine(r.rows[0]), 'Fri 30 Oct  20:15 to still off  45 min  (not planned)', 'running cut row');
eq(C.rowLine(r.rows[3]), 'Sun 25 Oct  13:50 to 18:00  4 h 10 min  (2 h 10 min outside planned times)', 'partly planned row');

// the month so far: the app was set up on 1 Oct at 09:00, so planned counts from 1 Oct 00:00 (whole days)
pr = C.period('month', n2); r = C.report(h, pr.from, pr.to, n2);
eq(C.periodText(r), '1 Oct to 30 Oct 2026', 'month text (to today)');
eq(C.dur(r.planned), (29 * 4 + 3 - 1) + ' h', 'from 1 Oct 09:00 (the 08:00 cut that day was before the start) to now');
eq(r.days, 30, '30 days so far');
// a cut logged from before the start moves the start back to that day
h.cuts.push({ id: '0', s: at(2026, 9, 28, 10, 0), e: at(2026, 9, 28, 11, 0) });
pr = C.period('7d', at(2026, 10, 2, 0, 0)); r = C.report(h, pr.from, pr.to, at(2026, 10, 2, 0, 0));
eq(C.dur(r.planned), '16 h', 'a cut logged on 28 Sep: planned counts from 28 Sep, 4 days of 4 h');
eq(C.shortDate(r.planFrom), '28 Sep', 'counted from the day of the earliest logged cut');
h.cuts.pop();
// first evening: started 20:22, a 14:00 cut that day is not counted as planned
const fresh = { id: 'f', name: 'Home', since: at(2026, 10, 30, 20, 22), schedules: [], cuts: [] };
C.setSchedule(fresh, [{ s: 840, e: 960, days: ALL }], fresh.since);
pr = C.period('month', at(2026, 10, 30, 20, 30)); r = C.report(fresh, pr.from, pr.to, at(2026, 10, 30, 20, 30));
eq([r.planned, C.diffText(r)], [0, ''], 'first evening: nothing planned yet');

// a period before the app was used has nothing planned
pr = C.period('custom', n2, '2026-09-01', '2026-09-30'); r = C.report(h, pr.from, pr.to, n2);
eq([r.planned, r.off, r.count, C.diffText(r)], [0, 0, 0, ''], 'September: nothing');
eq(C.period('custom', n2, '2026-10-10', '2026-10-01').error, 'The "To" date is before the "From" date.', 'dates the wrong way round');
eq(C.period('custom', n2, '', '2026-10-01').error, 'Pick both dates.', 'blank date');

// a cut that started before the period counts only the part inside, but is listed
pr = C.period('custom', n2, '2026-10-30', '2026-10-30'); r = C.report(h, pr.from, pr.to, n2);
eq([C.dur(r.off), r.count], ['1 h 25 min', 2], '30 Oct: 40 min after midnight + 45 min');
eq(C.periodText(r), 'Fri 30 Oct 2026', 'one day text');

// more cuts than planned
const shop = { id: 's', name: 'Shop', since: at(2026, 10, 1), schedules: [], cuts: [] };
C.setSchedule(shop, [{ s: 600, e: 660, days: ALL }], at(2026, 10, 1));
shop.cuts = [{ id: 'x', s: at(2026, 10, 2, 9, 0), e: at(2026, 10, 2, 13, 0) }];
pr = C.period('custom', n2, '2026-10-02', '2026-10-02'); r = C.report(shop, pr.from, pr.to, n2);
eq([C.dur(r.off), C.dur(r.planned), C.diffText(r), C.dur(r.outside), r.rows[0].kind], ['4 h', '1 h', '3 h more than planned', '3 h', 'over'], 'more than planned');
shop.cuts = [{ id: 'x', s: at(2026, 10, 2, 10, 0), e: at(2026, 10, 2, 11, 0) }];
r = C.report(shop, pr.from, pr.to, n2);
eq([C.diffText(r), r.outside, r.rows[0].kind], ['the same as planned', 0, 'planned'], 'exactly as planned');

// summary text for a complaint
pr = C.period('7d', n2); r = C.report(h, pr.from, pr.to, n2);
eq(C.summaryText(h, r).split('\n').slice(0, 5), [
    'Power cuts at Home, 24 Oct to 30 Oct 2026',
    'Without power: 10 h 35 min in 5 cuts, about 1 h 31 min a day',
    'Planned load shedding in this time: 27 h (16 h 25 min less than planned)',
    'Outside the planned times: 6 h 35 min, including 3 unplanned cuts',
    'Longest cut: 4 h 10 min on Sun 25 Oct, 13:50 to 18:00'], 'summary');
eq(C.summaryText(h, r).split('\n')[6], 'Sat 24 Oct  14:00 to 16:00  2 h', 'oldest cut first in the list');
const c = C.csv(h, r).split('\r\n');
eq(c[0], 'Place,Power went,Power came back,Minutes without power,Planned?,Minutes outside planned times,Note', 'csv header');
eq(c[2], 'Home,2026-10-25 13:50,2026-10-25 18:00,250,Partly,130,transformer', 'csv row');
eq(c[5], 'Home,2026-10-30 20:15,still off,45,No,45,', 'csv running cut');
h.name = '=SUM(A1)'; eq(C.csv(h, r).split('\r\n')[1].slice(0, 10), "'=SUM(A1),", 'csv formula guard');

// ---------- calendar file ----------
h = home();
const cal = C.ics(h, at(2026, 10, 29, 12, 0), 15);
eq((cal.match(/BEGIN:VEVENT/g) || []).length, 4, '4 events');
eq(cal.includes('DTSTART:20261029T080000\r\nDTEND:20261029T090000\r\nRRULE:FREQ=DAILY'), true, 'daily 08:00');
eq(cal.includes('DTSTART:20261030T220000\r\nDTEND:20261030T230000\r\nRRULE:FREQ=WEEKLY;BYDAY=FR'), true, 'Friday only starts on Friday');
eq(cal.includes('RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,SA'), true, 'all but Friday');
eq(cal.includes('TRIGGER:-PT15M'), true, 'reminder');
eq((C.ics(night, at(2026, 10, 29, 12, 0), 0).match(/DTEND:20261030T000000/g) || []).length, 1, 'cut to midnight ends next day');
eq(C.ics(night, at(2026, 10, 29, 12, 0), 0).includes('VALARM'), false, 'no reminder when 0');
eq(C.ics(empty, at(2026, 10, 29), 15).includes('VEVENT'), false, 'no events without times');

// ---------- saved data ----------
eq(C.cleanState(null), null, 'null');
eq(C.cleanState({ places: 'x' }), null, 'bad places');
let cs = C.cleanState({ places: [{ id: 'a', name: '  Home  ', since: 5, schedules: [{ from: '2026-10-01', slots: [{ s: 480, e: 540, days: [1, 1, 9, 2] }, { s: 3000, e: 1, days: [1] }, { s: 60, e: 60, days: [1] }, { s: 60, e: 120, days: [] }] }, { from: 'bad', slots: [] }],
    cuts: [{ id: 'c', s: 1000, e: 500 }, { id: 'c', s: 2000, e: 3000, note: 7 }, { id: 'd', s: 4000, e: null }, { id: 'e', s: 5000, e: null }, 'x'] }, null, 5], period: 'nope', remind: 99 });
eq(cs.places.length, 1, 'bad place dropped');
eq(cs.places[0].name, 'Home', 'name trimmed');
eq(cs.places[0].schedules, [{ from: '2026-10-01', slots: [{ s: 480, e: 540, days: [1, 2] }] }], 'bad slots and schedules dropped');
eq(cs.places[0].cuts.map(x => [x.id, x.s, x.e, x.note]), [['c', 2000, 3000, ''], ['d', 4000, 5000], ['e', 5000, null, '']].map(x => x.length === 3 ? [x[0], x[1], x[2], ''] : x), 'bad cut dropped, only the last cut stays open');
eq([cs.period, cs.remind], ['month', 15], 'defaults');
const big = { places: Array.from({ length: 15 }, (_, i) => ({ id: 'p', name: 'x'.repeat(100) })) };
cs = C.cleanState(big);
eq([cs.places.length, cs.places[0].name.length, new Set(cs.places.map(x => x.id)).size], [10, 40, 10], 'limits and unique ids');

// summer time: London clocks go back on Sun 25 Oct 2026 at 02:00; a 01:00-03:00 cut that day is 3 h of real time there
if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/London') {
    const lon = { id: 'l', name: 'Flat', since: at(2026, 10, 1), schedules: [], cuts: [] };
    C.setSchedule(lon, [{ s: 60, e: 180, days: ALL }], at(2026, 10, 1));
    eq(C.total(C.planned(lon, at(2026, 10, 25), at(2026, 10, 26))), 3 * 3600000, 'clock change day: 3 real hours');
    eq(C.total(C.planned(lon, at(2026, 10, 26), at(2026, 10, 27))), 2 * 3600000, 'normal day: 2 h');
}

console.log(pass + ' passed, ' + failed + ' failed (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')');
if (failed && typeof process !== 'undefined') process.exit(1);
