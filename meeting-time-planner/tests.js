// Logic checks, hand-worked. Run with: node tests.js (or open test.html).
function runTests(C) {
    const out = [];
    const eq = (name, got, want) => out.push({ name: name + (JSON.stringify(got) === JSON.stringify(want) ? '' : ' (got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want) + ')'), ok: JSON.stringify(got) === JSON.stringify(want) });
    const U = (iso) => Date.parse(iso);
    const P = (tz, s, e) => ({ tz, start: s === undefined ? 540 : s, end: e === undefined ? 1020 : e });

    // time zone offsets, daylight saving included
    eq('New York in July is UTC-4', C.offsetMinutes('America/New_York', U('2026-07-01T12:00:00Z')), -240);
    eq('New York in January is UTC-5', C.offsetMinutes('America/New_York', U('2026-01-15T12:00:00Z')), -300);
    eq('Mumbai is UTC+5:30', C.offsetMinutes('Asia/Kolkata', U('2026-10-08T00:00:00Z')), 330);
    eq('Kathmandu is UTC+5:45', C.offsetMinutes('Asia/Kathmandu', U('2026-10-08T00:00:00Z')), 345);
    eq('Sydney on 8 Oct 2026 is UTC+11 (summer time started 4 Oct)', C.offsetMinutes('Australia/Sydney', U('2026-10-08T00:00:00Z')), 660);
    eq('London on 8 Oct 2026 is UTC+1', C.offsetMinutes('Europe/London', U('2026-10-08T12:00:00Z')), 60);
    eq('Tokyo has no daylight saving', C.offsetMinutes('Asia/Tokyo', U('2026-07-01T00:00:00Z')), 540);
    eq('clock time to moment, London 15:00 on 8 Oct = 14:00Z', C.zonedToUtc('Europe/London', '2026-10-08', 900), U('2026-10-08T14:00:00Z'));
    eq('clock time to moment across the US spring change (9 Mar 2026 09:00 New York = 13:00Z)', C.zonedToUtc('America/New_York', '2026-03-09', 540), U('2026-03-09T13:00:00Z'));
    eq('local time in Mumbai for 14:00Z is 19:30', C.local('Asia/Kolkata', U('2026-10-08T14:00:00Z')).minutes, 1170);
    eq('8 Oct 2026 is a Thursday', C.local('Europe/London', U('2026-10-08T12:00:00Z')).dow, 4);

    // outside-hours maths
    eq('inside hours = 0 outside', C.outsideMinutes(600, 60, 540, 1020), 0);
    eq('starting 30 min early = 30 outside', C.outsideMinutes(510, 60, 540, 1020), 30);
    eq('entirely outside = whole length', C.outsideMinutes(1200, 60, 540, 1020), 60);
    eq('comfort: 10:00-11:00 in 9-17 is 60', C.comfort(600, 60, 540, 1020), 60);
    eq('comfort when it does not fit is -1', C.comfort(510, 60, 540, 1020), -1);

    // London + New York, 9-17, 60 min, 8 Oct 2026 (London is 5 h ahead)
    let p = C.plan([P('Europe/London'), P('America/New_York')], '2026-10-08', 60);
    const t = (utc, tz) => C.fmtTime(C.local(tz, utc).minutes, false);
    eq('London+NY: valid starts are 14:00-16:00 London', [t(p.ranges[0].from, 'Europe/London'), t(p.ranges[0].to, 'Europe/London')], ['14:00', '16:00']);
    eq('London+NY: one range', p.ranges.length, 1);
    eq('London+NY: best is 15:00 London', t(p.best.utc, 'Europe/London'), '15:00');
    eq('London+NY: that is 10:00 in New York', t(p.best.utc, 'America/New_York'), '10:00');
    eq('London+NY: 5 valid half-hour starts', p.valid.length, 5);

    // London + New York + Chicago
    p = C.plan([P('Europe/London'), P('America/New_York'), P('America/Chicago')], '2026-10-08', 60);
    eq('3 cities: best is 15:30 London', t(p.best.utc, 'Europe/London'), '15:30');
    eq('3 cities: 09:30 in Chicago', t(p.best.utc, 'America/Chicago'), '09:30');
    eq('3 cities: starts 15:00-16:00 London are the only ones', [p.valid.length, t(p.valid[0].utc, 'Europe/London')], [3, '15:00']);

    // London + Mumbai: London start 09:00-11:30; best 10:00 (ties go to the earlier one)
    p = C.plan([P('Europe/London'), P('Asia/Kolkata')], '2026-10-08', 60);
    eq('London+Mumbai best 10:00 London', t(p.best.utc, 'Europe/London'), '10:00');
    eq('London+Mumbai: 14:30 in Mumbai', t(p.best.utc, 'Asia/Kolkata'), '14:30');

    // no overlap: London, New York, Mumbai
    p = C.plan([P('Europe/London'), P('America/New_York'), P('Asia/Kolkata')], '2026-10-08', 60);
    eq('NY+London+Mumbai: no time works for everyone', [p.best, p.valid.length], [null, 0]);
    eq('NY+London+Mumbai: a closest option exists', !!p.fallback && p.fallback.total > 0, true);
    const minTotal = Math.min.apply(null, p.cands.map(c => c.total));
    eq('closest option has the least total time outside hours', p.fallback.total, minTotal);
    eq('closest option: nobody is more than the meeting length out', p.fallback.worst <= 60, true);

    // daylight saving gap: 20 Mar 2026 US is already on summer time, UK is not (4 h apart)
    p = C.plan([P('Europe/London'), P('America/New_York')], '2026-03-20', 60);
    eq('March gap: best is 14:30 London', t(p.best.utc, 'Europe/London'), '14:30');
    eq('March gap: 10:30 in New York', t(p.best.utc, 'America/New_York'), '10:30');

    // same zone twice, longer meeting, own hours
    p = C.plan([P('Europe/London'), P('Europe/London', 600, 780)], '2026-10-08', 120);
    eq('own hours 10-13, 2 h meeting: starts 10:00-11:00', [t(p.ranges[0].from, 'Europe/London'), t(p.ranges[0].to, 'Europe/London')], ['10:00', '11:00']);
    eq('best is 10:30', t(p.best.utc, 'Europe/London'), '10:30');
    p = C.plan([P('Europe/London', 540, 600)], '2026-10-08', 120);
    eq('meeting longer than the hours has no valid time', p.valid.length, 0);

    // views and day labels
    p = C.plan([P('Pacific/Auckland', 480, 1080), P('America/Los_Angeles', 480, 1080)], '2026-10-08', 60);
    const people = [P('Pacific/Auckland', 480, 1080), P('America/Los_Angeles', 480, 1080)];
    const hd = C.local('Pacific/Auckland', p.cands[0].utc).dayNo;
    eq('Auckland and LA have an overlap (3 h)', p.valid.length > 0, true);
    const v = C.view(people[1], C.zonedToUtc('Pacific/Auckland', '2026-10-08', 60), 60, hd);
    eq('01:00 Auckland on Thursday is Wednesday in Los Angeles (previous day)', [v.dow, v.dayDiff], [3, -1]);
    eq('day text', C.dayText(v), 'Wed (previous day)');

    // formatting
    eq('24h format', C.fmtTime(905, false), '15:05');
    eq('12h format pm', C.fmtTime(905, true), '3:05 pm');
    eq('12h format midnight', C.fmtTime(0, true), '12:00 am');
    eq('12h format noon', C.fmtTime(720, true), '12:00 pm');
    eq('length text', [C.fmtLen(60), C.fmtLen(90), C.fmtLen(30), C.fmtLen(120)], ['1 h', '1 h 30 min', '30 min', '2 h']);
    eq('offset text', [C.utcOffsetText('Asia/Kolkata', U('2026-10-08T00:00:00Z')), C.utcOffsetText('America/New_York', U('2026-10-08T00:00:00Z'))], ['UTC+5:30', 'UTC-4']);

    // cities
    eq('Mumbai finds India time', C.findCity('mumbai').tz, 'Asia/Kolkata');
    eq('typed IANA name works', C.findCity('Europe/Paris').tz, 'Europe/Paris');
    eq('extra spaces and case', C.findCity('  new   YORK ').tz, 'America/New_York');
    eq('unknown city is null', C.findCity('Atlantis'), null);
    eq('empty is null', C.findCity(''), null);
    eq('every listed city name resolves', C.cityNames().filter(n => !C.findCity(n)).length, 0);
    eq('every alias zone is valid', Object.keys(C.ALIASES).filter(k => !C.validZone(C.ALIASES[k])).length, 0);

    // calendar file
    const ics = C.buildIcs(U('2026-10-08T14:00:00Z'), 60, 'Line 1, with comma\nLine 2', U('2026-10-01T00:00:00Z'));
    eq('ics start is UTC', ics.includes('DTSTART:20261008T140000Z'), true);
    eq('ics end is one hour later', ics.includes('DTEND:20261008T150000Z'), true);
    eq('ics escapes commas and newlines', ics.includes('DESCRIPTION:Line 1\\, with comma\\nLine 2'), true);
    return out;
}
if (typeof module !== 'undefined' && module.exports && require.main === module) {
    const r = runTests(require('./core.js'));
    r.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
    const bad = r.filter(t => !t.ok).length;
    console.log(r.length - bad + ' of ' + r.length + ' passed');
    process.exit(bad ? 1 : 0);
}
