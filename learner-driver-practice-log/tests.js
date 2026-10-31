// core.js checks. Run: node learner-driver-practice-log/tests.js  (or open test.html). Times are checked in Sydney time.
if (typeof process !== 'undefined' && process.env) process.env.TZ = 'Australia/Sydney';
const C = typeof window !== 'undefined' ? window.LearnerCore : require('./core.js');
let pass = 0, failed = 0;
function eq(got, want, what) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) pass++; else { failed++; console.log('FAIL ' + what + ': got ' + g + ', want ' + w); }
}
const inBrowserSydney = typeof window === 'undefined' || Intl.DateTimeFormat().resolvedOptions().timeZone === 'Australia/Sydney';

// times typed in many ways
eq(['17:30', '5:30 pm', '5:30pm', '1730', '5.30pm', '7pm', '12am', '12pm', '00:30', '9', ''].map(C.parseTime), [1050, 1050, 1050, 1050, 1050, 1140, 0, 720, 30, 540, null], 'parseTime');
eq(['25:00', '13pm', '7:60', 'abc', '0pm'].map(C.parseTime), [null, null, null, null, null], 'parseTime refuses');
eq([C.dur(0), C.dur(45), C.dur(60), C.dur(75), C.dur(5190)], ['0 min', '45 min', '1 h', '1 h 15 min', '86 h 30 min'], 'dur');
eq(['40', '1:10', '1h10', '90 min', 'x', ''].map(C.parseDur), [40, 70, 70, 90, null, null], 'parseDur');
eq(['32', '32.5', '32,5', '32:30', '0', '1:75', '-1', '1001'].map(C.parseHours), [1920, 1950, 1950, 1950, 0, null, null, null], 'parseHours');
eq(C.addDays('2026-12-31', 1), '2027-01-01', 'addDays year end');
eq(C.addDays('2028-02-28', 1), '2028-02-29', 'addDays leap day');
eq(C.parseIso('2026-02-30'), null, 'no 30 Feb');

// sunset and sunrise (published: Sydney 21 Jun 2026 about 07:00 and 16:54; London 21 Jun about 04:43 and 21:21)
if (inBrowserSydney) {
    const s = C.sunTimes('2026-06-21', -33.87, 151.21);
    eq([C.clockOf(s.rise), C.clockOf(s.set)], ['06:59', '16:53'], 'Sydney winter sunrise/sunset');
    const o = C.sunTimes('2026-10-31', -33.87, 151.21);
    eq([C.clockOf(o.rise), C.clockOf(o.set)], ['05:56', '19:21'], 'Sydney 31 Oct (daylight saving)');
}
eq(C.sunTimes('2026-06-21', 69.65, 18.96).polar, 'day', 'midnight sun in Tromso');
eq(C.sunTimes('2026-12-21', 69.65, 18.96).polar, 'night', 'polar night in Tromso');

const syd = { mode: 'sun', lat: -33.87, lon: 151.21, place: 'Sydney' };
if (inBrowserSydney) {
    // part day, part night: 18:45 to 20:00 on 31 Oct, sunset 19:21 -> 39 min night
    eq(C.nightMinutes('2026-10-31', 1125, 1200, syd), 39, 'drive across sunset');
    eq(C.nightMinutes('2026-10-31', 540, 600, syd), 0, 'morning drive all day');
    eq(C.nightMinutes('2026-10-31', 1380, 60, syd), 120, 'past midnight all night');
    eq(C.nightMinutes('2026-10-31', 300, 420, syd), 56, 'drive across sunrise 05:56');
    eq(C.nightMinutes('2026-06-21', 1020, 1080, syd), 60, 'winter 17:00 all dark');
}
const fixed = { mode: 'fixed', from: 21 * 60, to: 5 * 60 };
eq(C.nightMinutes('2026-10-31', 20 * 60, 22 * 60, fixed), 60, 'fixed 9pm: 20-22 -> 60');
eq(C.nightMinutes('2026-10-31', 23 * 60, 2 * 60, fixed), 180, 'fixed past midnight');
eq(C.nightMinutes('2026-10-31', 4 * 60, 6 * 60, fixed), 60, 'fixed early morning');
eq(C.nightMinutes('2026-10-31', 10 * 60, 12 * 60, fixed), 0, 'fixed daytime');
eq(C.nightMinutes('2026-10-31', 17 * 60, 19 * 60, { mode: 'fixed', from: 18 * 60, to: 23 * 60 }), 60, 'fixed window inside one day');

// checking a drive
const now = new Date(2026, 9, 31, 21, 0).getTime();
const L = C.newLearner('Aisha', 'au-nsw');
let r = C.checkDrive({ date: '2026-10-31', start: '18:45', end: '20:00' }, L, { now });
eq([r.ok, r.min], [true, 75], 'ok drive');
if (inBrowserSydney) eq(r.nightMin, 39, 'night from Sydney sunset');
r = C.checkDrive({ date: '2026-11-01', start: '9:00', end: '10:00' }, L, { now });
eq(!!r.errs.date, true, 'future date refused');
r = C.checkDrive({ date: '2026-10-31', start: '21:30', end: '22:00' }, L, { now });
eq(!!r.errs.start, true, 'start later today refused');
r = C.checkDrive({ date: '2026-10-31', start: '', end: '' }, L, { now });
eq([r.errs.start, r.errs.end], ['Type the time you started.', 'Type the time you finished.'], 'blank times');
r = C.checkDrive({ date: '2026-10-30', start: '10:00', end: '10:00' }, L, { now });
eq(!!r.errs.end, true, 'same start and end');
r = C.checkDrive({ date: '2026-10-30', start: '8:00', end: '21:00' }, L, { now });
eq(!!r.errs.end, true, '13 hour drive refused');
r = C.checkDrive({ date: '2026-10-30', start: '23:15', end: '00:40' }, L, { now });
eq([r.ok, r.min], [true, 85], 'past midnight');
eq(r.warns[0], 'Finished after midnight, on Sat 31 Oct.', 'midnight warning');
r = C.checkDrive({ date: '2026-10-30', start: '9:00', end: '10:00', nightManual: '90' }, L, { now });
eq(!!r.errs.night, true, 'typed night longer than drive');
r = C.checkDrive({ date: '2026-10-30', start: '9:00', end: '10:00', nightManual: '20' }, L, { now });
eq(r.nightMin, 20, 'typed night used');
L.drives.push(C.validDrive({ id: 'a', date: '2026-10-30', start: 600, end: 660, night: 0 }));
r = C.checkDrive({ date: '2026-10-30', start: '10:30', end: '11:30' }, L, { now });
eq(!!r.errs.start, true, 'overlap refused');
r = C.checkDrive({ date: '2026-10-30', start: '10:30', end: '11:30' }, L, { now, editId: 'a' });
eq(r.ok, true, 'editing the same drive is no overlap');
r = C.checkDrive({ date: '2026-10-30', start: '11:00', end: '12:00' }, L, { now });
eq(r.ok, true, 'back to back is fine');

// the main situation: NSW, 120 h with 20 at night, lessons 3 for 1 up to 30 h, lessons not towards night
const A = C.newLearner('Aisha', 'au-nsw');
A.prior = { total: 60 * 60, night: 8 * 60 };
const add = (date, s, e, night, extra) => A.drives.push(C.validDrive(Object.assign({ id: C.uid(), date, start: s, end: e, night }, extra || {})));
add('2026-10-05', 17 * 60, 19 * 60, 30);
add('2026-10-12', 18 * 60, 20 * 60, 40);
add('2026-10-19', 9 * 60, 10 * 60, 0, { lesson: true });
add('2026-10-26', 19 * 60, 21 * 60, 100, { lesson: true });
let t = C.totals(A);
// driven 7 h; night 30+40 = 70 (lesson night 100 left out in NSW); bonus = 3 h lessons * 2 = 6 h; prior 60 h / 8 h
eq([t.drive, t.night, t.lessonMin, t.bonus, t.total], [420, 8 * 60 + 70, 180, 360, 60 * 60 + 420 + 360], 'NSW totals');
eq([t.left.total, t.left.night, t.toGo], [2820, 650, 2820], 'left');
eq(C.headline(A, '2026-10-31')[0], '73 h of 120 hours, 9 h 10 min of 20 at night', 'headline');
// pace: last 4 weeks (4 Oct to 31 Oct) = 7 h -> 1 h 45 min a week; 47 h to go -> 26.9 -> 27 weeks
const f = C.finishEstimate(A, '2026-10-31');
eq([f.weeks, f.perWeek, f.date], [27, 105, '2027-05-08'], 'finish estimate');
eq(C.headline(A, '2026-10-31')[1], '47 h of driving to go (10 h 50 min of it at night): about 27 weeks at your pace of 1 h 45 min a week (around Sat 8 May 2027).', 'to-go sentence');

// lesson cap: 12 h of lessons in NSW -> only 10 h get the bonus (30 logbook hours)
const B = C.newLearner('Ben', 'au-nsw');
for (let i = 0; i < 12; i++) B.drives.push(C.validDrive({ id: 'l' + i, date: C.addDays('2026-08-01', i), start: 600, end: 660, night: 0, lesson: true }));
t = C.totals(B);
eq([t.drive, t.bonus, t.total], [720, 1200, 1920], 'lesson cap: 12 h lessons count as 32 h');
// Tasmania: double, up to 20 logbook hours
B.rule = 'au-tas'; t = C.totals(B);
eq([t.bonus, t.total], [600, 1320], 'Tasmania double up to 20 h');
// Victoria: no bonus
B.rule = 'au-vic'; eq(C.totals(B).bonus, 0, 'Victoria no bonus');
// Queensland: lesson night counts
B.rule = 'au-qld'; B.drives[0].night = 30; eq(C.totals(B).night, 30, 'QLD lesson night counts');
B.rule = 'au-nsw'; eq(C.totals(B).night, 0, 'NSW lesson night does not count');

// Pennsylvania: bad weather hours
const P = C.newLearner('Jake', 'us-pa');
P.drives.push(C.validDrive({ id: 'p1', date: '2026-10-01', start: 600, end: 720, night: 0, roads: ['rain'] }));
P.drives.push(C.validDrive({ id: 'p2', date: '2026-10-02', start: 600, end: 660, night: 0, roads: ['snow', 'highway'] }));
P.drives.push(C.validDrive({ id: 'p3', date: '2026-10-03', start: 600, end: 660, night: 0, roads: ['highway'] }));
t = C.totals(P);
eq([t.weather, t.left.weather, t.need.weather], [180, 120, 300], 'PA weather');
// when total is done but night is not, to go = night left
const N = C.newLearner('Nia', 'custom'); N.custom = { total: 2, night: 1, weather: 0, lessonMult: 1, lessonCap: 0 };
N.drives.push(C.validDrive({ id: 'n1', date: '2026-10-01', start: 600, end: 780, night: 0 }));
t = C.totals(N);
eq([t.left.total, t.left.night, t.toGo, t.done], [0, 60, 60, false], 'night left after total done');
N.drives.push(C.validDrive({ id: 'n2', date: '2026-10-02', start: 1200, end: 1260, night: 60 }));
t = C.totals(N); eq([t.done, C.headline(N, '2026-10-31')[1]], [true, 'All 2 hours done, including 1 at night.'], 'done');
eq(C.finishEstimate(N, '2026-10-31'), null, 'no estimate when done');
// pace when nothing in the last 4 weeks: average since the first drive
const O = C.newLearner('Old', 'us-ca');
O.drives.push(C.validDrive({ id: 'o', date: '2026-01-01', start: 600, end: 720, night: 0 }));
const pc = C.pace(O, '2026-10-31');
eq(pc.basis, 'since the first drive', 'pace basis');
eq(C.finishEstimate(C.newLearner('Zero', 'us-ca'), '2026-10-31'), null, 'no estimate with no drives');

// skills and readiness
const S = C.newLearner('Sam', 'custom'); S.custom.total = 1; S.custom.night = 0;
S.drives.push(C.validDrive({ id: 's1', date: '2026-10-01', start: 600, end: 700, night: 0, skills: ['parallel', 'hill', 'bogus'] }));
S.drives.push(C.validDrive({ id: 's2', date: '2026-10-03', start: 600, end: 700, night: 0, skills: ['parallel'] }));
const st = C.skillStats(S).find(x => x.id === 'parallel');
eq([st.count, st.last], [2, '2026-10-03'], 'skill count and last');
eq(S.drives[0].skills, ['parallel', 'hill'], 'unknown skills dropped');
eq(C.readiness(S).ready, false, 'not ready until all confident');
C.SKILLS.forEach(s => { S.confident[s.id] = true; });
eq(C.readiness(S).ready, true, 'ready');

// CSV and summary
const csv = C.csv(A);
eq(csv.split('\r\n')[0], 'Date,Start,Finish,Minutes,Night minutes,Hours,Lesson with instructor,Supervisor,Car,Roads and conditions,Skills practised,Notes', 'csv header');
eq(csv.split('\r\n')[1].slice(0, 26), '2026-10-05,17:00,19:00,120', 'csv oldest first');
const X = C.newLearner('X', 'us-ca'); X.drives.push(C.validDrive({ id: 'x', date: '2026-10-01', start: 600, end: 660, night: 0, sup: '=HYPERLINK("x")', notes: 'a, "b"\nc' }));
eq(C.csv(X).split('\r\n')[1].includes('"\'=HYPERLINK(""x"")"'), true, 'csv formula injection guarded');
eq(C.summaryText(A, '2026-10-31').split('\n').slice(0, 3), ['Learner driver log: Aisha', 'Rule: Australia, NSW, under 25', '73 h of 120 hours, 9 h 10 min of 20 at night'], 'summary');

// saved state: corrupt, odd and hostile values
eq(C.validate(null), null, 'null state');
eq(C.validate({ learners: 'x' }), null, 'bad learners');
const v = C.validate({ learners: [{ id: 'q', name: '<b>x</b>'.repeat(20), rule: 'nope', custom: { total: -5, night: 900 }, night: { mode: 'sun', lat: 999, lon: 0 },
    prior: { total: 100, night: 500 }, drives: [{ id: 'd', date: '2026-02-30', start: 1, end: 2 }, { id: 'e', date: '2026-10-01', start: 600, end: 660, night: 9999 }, { id: 'e', date: '2026-10-02', start: 600, end: 660 }, 'junk'],
    confident: { parallel: true, hack: true }, live: { a: 'x' } }], cur: 'missing' });
const q = v.learners[0];
eq([q.name.length, q.rule, q.custom.total, q.custom.night, q.night.mode, q.prior.night, q.drives.length, q.drives[0].night, Object.keys(q.confident), q.live, v.cur],
    [40, 'custom', 50, 10, 'fixed', 100, 1, 0, ['parallel'], null, 'q'], 'validate cleans everything');
eq(C.validate({ learners: [] }).cur, null, 'empty learners');

console.log((failed ? 'FAILED ' + failed + ', ' : '') + pass + ' checks passed');
if (typeof process !== 'undefined' && process.exitCode !== undefined && failed) process.exitCode = 1;
