// Checks for core.js. Run: node tests.js (also TZ=Europe/London node tests.js for summer time), or open test.html.
if (typeof require !== 'undefined') require('./core.js');
const C = globalThis.TTCore;
let pass = 0, failed = 0;
function eq(got, want, name) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) pass++; else { failed++; console.log('FAIL ' + name + '\n  got  ' + g + '\n  want ' + w); }
}
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
const T = s => C.parseTimes(s).times;
const ALL = [0, 1, 2, 3, 4, 5, 6], WD = [1, 2, 3, 4, 5];

// ---------- reading typed and pasted times ----------
eq(T('07:15 07:40 08:05'), [435, 460, 485], 'spaces');
eq(T('7:15\n7.40\n8h05'), [435, 460, 485], 'one per line, dots and h');
eq(T('08:05, 07:15; 07:40'), [435, 460, 485], 'unsorted and commas are sorted');
eq(T('7:15 7:15 7:15'), [435], 'duplicates once');
eq(T('7:15am 1:30pm 12:00 am 12pm 7pm'), [0, 435, 720, 810, 1140], 'am and pm');
eq(T('0715 0740 1305'), [435, 460, 785], 'compact four digits');
eq(T('Bus 42 to City: 06:00 06:30* 07:00 (Fridays only)'), [360, 390, 420], 'words, footnotes and route numbers skipped');
eq(C.parseTimes('Bus 42 to City: 06:00').skipped > 0, true, 'skipped words are counted');
eq(T('Timetable 2026 valid from 12.11.2026: 06:00 06:30'), [360, 390], 'a year and a date are not times');
eq(C.parseTimes('07:15 25:70 07:99').bad, ['25:70', '07:99'], 'impossible times reported');
eq(C.parseTimes('13pm').bad, ['13pm'], '13pm reported');
eq(T(''), [], 'blank');
eq(T(null), [], 'null');
eq(T('hello world'), [], 'only words');
eq(T('-07:15'), [435], 'a minus sign is ignored');
// after midnight belongs to the night before
let p = C.parseTimes('22:40 23:20 00:10 00:50');
eq(p.times, [1360, 1400, 1450, 1490], 'after midnight becomes 24:10');
eq(p.afterMidnight, 2, 'after midnight count');
eq(T('00:10 05:40 06:00'), [10, 340, 360], 'early morning alone stays early morning');
eq(T('23:30 24:15 25:00'), [1410, 1455, 1500], '24:15 typed directly');
eq(T('30:00'), [], '30:00 is too late');
eq(T('12:00 01:00'), [60, 720], 'noon then 01:00 is not after midnight (only evening to small hours)');
// round trip
[[435, 460], [1360, 1450, 1490], [10, 1455], [0, 1439]].forEach(t => eq(T(C.timesText(t)), t, 'round trip ' + t));
eq(C.timesText([1360, 1450]), '22:40 00:10', 'plain text when it reads back');
eq(C.timesText([10, 1455]), '00:10 24:15', '24-hour text when needed');

// ---------- every N minutes ----------
eq(C.everyN(360, 420, 20), [360, 380, 400, 420], 'every 20 min');
eq(C.everyN(360, 410, 20), [360, 380, 400], 'end not on the step');
eq(C.everyN(1380, 30, 15), [1380, 1395, 1410, 1425, 1440, 1455, 1470], 'past midnight');
eq(C.everyN(360, 420, 0), null, 'step 0');
eq(C.everyN(360, 420, -5), null, 'negative step');
eq(C.everyN(360, 420, 2.5), null, 'decimal step');
eq(C.everyN(null, 420, 5), null, 'blank start');
eq(C.everyN(0, 1439, 1).length, 500, 'capped at 500');

// ---------- which times run on a date ----------
const shuttle = { id: 'a', name: 'Shuttle to Campus', stop: '', walk: 5, groups: [
    { days: WD, times: T('07:15 07:40 08:05 08:30 09:00'), from: '', until: '' },
    { days: [6], times: T('08:00 10:00'), from: '', until: '' }] };
// Thu 29 Oct 2026
eq(C.dayInfo(shuttle, new Date(2026, 9, 29), []).times, [435, 460, 485, 510, 540], 'Thursday times');
eq(C.dayInfo(shuttle, new Date(2026, 9, 31), []).times, [480, 600], 'Saturday times');
eq(C.dayInfo(shuttle, new Date(2026, 10, 1), []).times, [], 'Sunday none');
eq(C.dayInfo(shuttle, new Date(2026, 9, 29), ['2026-10-29']).times, [], 'holiday Thursday runs Sunday (none)');
eq(C.dayInfo(shuttle, new Date(2026, 9, 29), ['2026-10-29']).holiday, true, 'holiday flag');
const summer = { id: 'b', name: 'x', walk: 0, groups: [
    { days: ALL, times: [480, 540], from: '', until: '' },
    { days: ALL, times: [600], from: '2026-07-01', until: '2026-08-31' }] };
eq(C.dayInfo(summer, new Date(2026, 6, 15), []).times, [600], 'dated timetable replaces the normal one');
eq(C.dayInfo(summer, new Date(2026, 8, 1), []).times, [480, 540], 'normal again after the dates');
eq(C.dayInfo(summer, new Date(2026, 7, 31), []).times, [600], 'until date is included');
const twice = { id: 'c', name: 'x', walk: 0, groups: [{ days: [1, 2], times: [480] }, { days: [2, 3], times: [540] }] };
eq(C.dayInfo(twice, new Date(2026, 9, 27), []).times, [480, 540], 'a day in two timetables combines them');
eq(C.daysTwice(twice), [2], 'daysTwice');
eq(C.daysWithout(shuttle), [0], 'no service on Sunday');

// ---------- next departures ----------
let now = at(2026, 10, 29, 7, 33);   // Thu 07:33
let up = C.upcoming(shuttle, now, [], 3);
eq(up.map(x => C.hhmm(x.min)), ['07:40', '08:05', '08:30'], 'next three');
eq(C.minsTo(up[0].at, now), 7, 'in 7 min');
eq(C.inText(7), 'in 7 min', 'text 7');
eq(C.catchable(up, now, 5).min, 460, '5 min walk still catches 07:40');
eq(C.catchable(up, now, 8).min, 485, '8 min walk misses 07:40, aim for 08:05');
eq(C.minsTo(C.upcoming(shuttle, at(2026, 10, 29, 7, 40), [], 1)[0].at, at(2026, 10, 29, 7, 40)), 0, 'due now in its minute');
eq(C.upcoming(shuttle, at(2026, 10, 29, 7, 40) + 59000, [], 1)[0].min, 460, 'still due at 07:40:59');
eq(C.upcoming(shuttle, at(2026, 10, 29, 7, 41), [], 1)[0].min, 485, 'gone at 07:41');
// after the last one: Saturday morning
up = C.upcoming(shuttle, at(2026, 10, 30, 9, 30), [], 2);
eq(up.map(x => C.dateStr(x.svc) + ' ' + C.hhmm(x.min)), ['2026-10-31 08:00', '2026-10-31 10:00'], 'Friday after the last: Saturday');
eq(C.whenLabel(up[0].at, at(2026, 10, 30, 9, 30)), 'Tomorrow', 'tomorrow label');
up = C.upcoming(shuttle, at(2026, 10, 31, 11, 0), [], 1);
eq(C.dateStr(up[0].svc) + ' ' + C.hhmm(up[0].min), '2026-11-02 07:15', 'Saturday after the last: Monday');
eq(C.whenLabel(up[0].at, at(2026, 10, 31, 11, 0)), 'Mon 2 Nov', 'Monday label');
eq(C.minsTo(up[0].at, at(2026, 10, 31, 11, 0)), Math.round((up[0].at - at(2026, 10, 31, 11, 0)) / 60000), 'real minutes, also across a clock change');
eq(C.inText(44 * 60 + 15), 'in 1 day 20 h', 'long wait text');
eq(C.inText(65), 'in 1 h 05 min', '1 h 05');
eq(C.inText(120), 'in 2 h', '2 h');
eq(C.inText(1445), 'in 1 day', 'a day, no 0 h');
eq(C.inText(0), 'due now', 'due now');
// night bus: after-midnight times belong to the night before
const night = { id: 'n', name: 'Night bus', walk: 0, groups: [{ days: [5], times: T('22:00 23:30 00:30 01:30') }] };  // Fri only
up = C.upcoming(night, at(2026, 10, 31, 0, 10), [], 3);   // Sat 00:10 (Friday night)
eq(up.map(x => C.dateStr(x.svc) + ' ' + C.hhmm(x.min)), ['2026-10-30 00:30', '2026-10-30 01:30', '2026-11-06 22:00'], 'Friday night buses after midnight on Saturday');
eq(C.whenLabel(up[0].at, at(2026, 10, 31, 0, 10)), '', 'after-midnight bus is today on the clock');
eq(T('8:00am, 10am, 12pm'), [480, 600, 720], 'Saturday set from the README');
eq(T('Bus 42 to City (Mon-Fri): 06:00 06:30* 07:00'), [360, 390, 420], 'README pasted line');
const home = { id: 'h', name: 'Bus 42 home', walk: 0, groups: [{ days: WD, times: C.everyN(360, 1320, 20).concat(T('22:40 23:20 00:10').map(t => t < 360 ? t + 1440 : t)) }] };
up = C.upcoming(home, at(2026, 10, 30, 0, 5), [], 1);   // Fri 00:05
eq([C.dateStr(up[0].svc), C.hhmm(up[0].min), C.minsTo(up[0].at, at(2026, 10, 30, 0, 5))], ['2026-10-29', '00:10', 5], 'Thursday-night 00:10 at Friday 00:05');
// a holiday today
up = C.upcoming(shuttle, at(2026, 10, 29, 7, 0), ['2026-10-29'], 1);
eq(C.dateStr(up[0].svc), '2026-10-30', 'holiday skips to the next working day');
// nothing at all
eq(C.upcoming({ id: 'z', name: 'z', groups: [{ days: [3], times: [600], from: '2025-01-01', until: '2025-01-31' }] }, now, [], 1), [], 'only an old dated timetable: none');

// ---------- labels ----------
eq(C.daysLabel(WD), 'Mon–Fri', 'Mon–Fri');
eq(C.daysLabel(ALL), 'Every day', 'Every day');
eq(C.daysLabel([6]), 'Sat', 'Sat');
eq(C.daysLabel([0, 6]), 'Sat, Sun', 'weekend');
eq(C.daysLabel([1, 3, 5]), 'Mon, Wed, Fri', 'MWF');
eq(C.daysLabel([1, 2, 3, 4, 6]), 'Mon–Thu, Sat', 'run plus one');
eq(C.routeText(shuttle), 'Shuttle to Campus\nMon–Fri: 07:15 07:40 08:05 08:30 09:00\nSat: 08:00 10:00\nNo service: Sun', 'copy text');

// ---------- saved data ----------
eq(C.cleanState(null), null, 'null state');
eq(C.cleanState({}), null, 'no routes');
eq(C.cleanState({ routes: 'x' }), null, 'routes not a list');
let s = C.cleanState({ routes: [shuttle, { name: '' }, { name: 'No times', groups: [{ days: [1], times: [] }] }, 5, null], holidays: ['2026-12-25', 'bad', '2026-02-30'] });
eq(s.routes.length, 1, 'bad routes dropped');
eq(s.holidays, ['2026-12-25'], 'bad holidays dropped');
s = C.cleanState({ routes: [{ id: 'q', name: 'x'.repeat(200), walk: -3, groups: [{ days: [9, 1, 1, 'a'], times: [5000, 480, 480, -1, 1.5], from: '2026-09-01', until: '2026-06-01' }] }] });
eq([s.routes[0].name.length, s.routes[0].walk, s.routes[0].groups[0].days, s.routes[0].groups[0].times, s.routes[0].groups[0].from], [60, 0, [1], [480], '2026-06-01'], 'values cleaned');
s = C.cleanState({ routes: [{ id: 'd', name: 'A', groups: [{ days: [1], times: [1] }] }, { id: 'd', name: 'B', groups: [{ days: [1], times: [1] }] }] });
eq(s.routes[0].id !== s.routes[1].id, true, 'duplicate ids fixed');

console.log((failed ? 'FAILED ' + failed + ', ' : '') + 'passed ' + pass + ' checks');
if (typeof process !== 'undefined' && failed) process.exitCode = 1;
