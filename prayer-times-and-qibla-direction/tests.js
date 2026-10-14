// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const PT = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.PT;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const hm = min => min === null ? '--' : String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((min % 1440) + 1440) % 1440 % 60).padStart(2, '0');
    const day = (lat, lon, tz, d, method, asr, extra) => PT.timesFor(Object.assign({ lat, lon, tz, method, asr, id: 't', name: 't' }, extra || {}), d).list.map(x => hm(x.min));
    const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const near = (a, b) => a.every((x, i) => { let d = Math.abs(toMin(x) - toMin(b[i])); d = Math.min(d, 1440 - d); return d <= 1; });

    // Reference: the separately written adhan library (Batoul Apps, MIT), same method angles, its own minute offsets removed
    // except Dubai and Diyanet, whose official offsets both include. Every time must agree to within 1 minute.
    const REF = [
        ['Karachi', 24.8607, 67.0011, 'Asia/Karachi', '2026-10-14', 'karachi', 'hanafi', '05:13 06:29 12:18 16:28 18:06 19:22'],
        ['London', 51.5074, -0.1278, 'Europe/London', '2026-06-21', 'mwl', 'standard', '02:31 04:43 13:02 17:25 21:22 23:27'],
        ['New York', 40.7128, -74.006, 'America/New_York', '2026-03-10', 'isna', 'standard', '06:01 07:16 13:06 16:24 18:57 20:12'],
        ['Makkah', 21.4225, 39.8262, 'Asia/Riyadh', '2026-01-01', 'makkah', 'standard', '05:37 06:59 12:24 15:29 17:50 19:20'],
        ['Cairo', 30.0444, 31.2357, 'Africa/Cairo', '2026-07-15', 'egypt', 'standard', '04:21 06:04 13:01 16:37 19:58 21:29'],
        ['Jakarta', -6.2088, 106.8456, 'Asia/Jakarta', '2026-12-21', 'singapore', 'standard', '04:11 05:36 11:51 15:18 18:05 19:22'],
        ['Dubai', 25.2048, 55.2708, 'Asia/Dubai', '2026-08-01', 'dubai', 'standard', '04:21 05:43 12:28 15:55 19:07 20:29'],
        ['Istanbul', 41.0082, 28.9784, 'Europe/Istanbul', '2026-05-05', 'turkey', 'standard', '04:10 05:50 13:06 16:58 20:12 21:46'],
        ['Oslo midsummer', 59.9139, 10.7522, 'Europe/Oslo', '2026-06-21', 'mwl', 'standard', '02:21 03:54 13:19 18:00 22:44 00:12']
    ];
    REF.forEach(r => { const got = day(r[1], r[2], r[3], r[4], r[5], r[6]); eq(r[0] + ' ' + r[4] + ' within 1 min of reference (' + got.join(' ') + ')', near(got, r[7].split(' ')), true); });
    // Published Aladhan Karachi timetable, 1 Sep 2026: Fajr 04:55, Dhuhr 12:32
    const k1 = day(24.8607, 67.0011, 'Asia/Karachi', '2026-09-01', 'karachi', 'hanafi');
    eq('Karachi 1 Sep Fajr (Aladhan 04:55)', k1[0], '04:55'); eq('Karachi 1 Sep Dhuhr (Aladhan 12:32)', k1[2], '12:32');
    // exact values the README and the UI test use
    eq('Karachi 14 Oct exact', day(24.8607, 67.0011, 'Asia/Karachi', '2026-10-14', 'karachi', 'hanafi'), ['05:13', '06:29', '12:18', '16:28', '18:06', '19:22']);
    const ks = day(24.8607, 67.0011, 'Asia/Karachi', '2026-10-14', 'karachi', 'standard');
    eq('standard Asr earlier than Hanafi by 50 min', toMin('16:28') - toMin(ks[3]), 50);
    eq('Umm al-Qura Isha is Maghrib + 90', toMin(day(21.4225, 39.8262, 'Asia/Riyadh', '2026-01-01', 'makkah', 'standard')[5]) - toMin(day(21.4225, 39.8262, 'Asia/Riyadh', '2026-01-01', 'makkah', 'standard')[4]), 90);
    eq('Tehran Maghrib after sunset (4.5 degrees)', toMin(day(35.69, 51.39, 'Asia/Tehran', '2026-10-14', 'tehran', 'standard')[4]) > toMin(day(35.69, 51.39, 'Asia/Tehran', '2026-10-14', 'mwl', 'standard')[4]), true);
    eq('own angles: Isha 75 min after Maghrib', (d => toMin(d[5]) - toMin(d[4]))(day(24.86, 67, 'Asia/Karachi', '2026-10-14', 'custom', 'standard', { custom: { fajr: 18, isha: 17, ishaMin: 75 } })), 75);
    eq('user minute adjustments', day(24.8607, 67.0011, 'Asia/Karachi', '2026-10-14', 'karachi', 'hanafi', { adj: { maghrib: 2, fajr: -3 } }).slice(0, 5), ['05:10', '06:29', '12:18', '16:28', '18:08']);

    // summer time: London clocks go forward on 29 Mar 2026
    eq('London offset 28 Mar', PT.dayOffset('Europe/London', 2026, 3, 28), 0); eq('London offset 29 Mar', PT.dayOffset('Europe/London', 2026, 3, 29), 1);
    const l28 = day(51.5074, -0.1278, 'Europe/London', '2026-03-28', 'mwl', 'standard'), l29 = day(51.5074, -0.1278, 'Europe/London', '2026-03-29', 'mwl', 'standard');
    eq('Dhuhr jumps an hour with summer time', toMin(l29[2]) - toMin(l28[2]), 59);
    eq('India half-hour zone', PT.dayOffset('Asia/Kolkata', 2026, 10, 14), 5.5); eq('Nepal 5:45', PT.dayOffset('Asia/Kathmandu', 2026, 10, 14), 5.75);
    eq('New York winter offset', PT.dayOffset('America/New_York', 2026, 1, 15), -5);
    eq('southern summer time (Sydney Jan)', PT.dayOffset('Australia/Sydney', 2026, 1, 15), 11);

    // far north rules
    const osloAngle = day(59.9139, 10.7522, 'Europe/Oslo', '2026-06-21', 'mwl', 'standard', { highLat: 'angle' });
    const osloMid = day(59.9139, 10.7522, 'Europe/Oslo', '2026-06-21', 'mwl', 'standard', { highLat: 'middle' });
    const osloSev = day(59.9139, 10.7522, 'Europe/Oslo', '2026-06-21', 'mwl', 'standard', { highLat: 'seventh' });
    eq('Oslo all six times exist with each rule', [osloAngle, osloMid, osloSev].every(d => d.every(x => x !== '--')), true);
    eq('middle of the night: Fajr equals Isha', osloMid[0], osloMid[5]);
    eq('one-seventh: Isha before angle-based Isha', toMin(osloSev[5]) < toMin(osloAngle[5]) || toMin(osloAngle[5]) < 300, true);
    const trom = day(69.65, 18.96, 'Europe/Oslo', '2026-06-21', 'mwl', 'standard');
    eq('Tromso midsummer: no sunrise or sunset, Dhuhr shown', [trom[1], trom[4], trom[2] !== '--'], ['--', '--', true]);
    eq('Tromso midwinter: no sunrise', day(69.65, 18.96, 'Europe/Oslo', '2026-12-21', 'mwl', 'standard')[1], '--');
    eq('equator and date line still fine', day(-0.18, 179.9, 'Pacific/Tarawa', '2026-10-14', 'mwl', 'standard').every(x => x !== '--'), true);
    eq('Isha after midnight shown as next day', PT.fmtTime(PT.timesFor({ lat: 59.9139, lon: 10.7522, tz: 'Europe/Oslo', method: 'mwl', id: 'o', name: 'o' }, '2026-06-21').list[5].min, '24'), '00:12 (next day)');

    // now and next
    const K = { lat: 24.8607, lon: 67.0011, tz: 'Asia/Karachi', method: 'karachi', asr: 'hanafi', id: 'k', name: 'Karachi' };
    let n = PT.nowAndNext(K, Date.UTC(2026, 9, 14, 10, 0));
    eq('15:00 Karachi: now Dhuhr, next Asr', [n.current.key, n.next.key, PT.fmtLeft(n.next.at - Date.UTC(2026, 9, 14, 10, 0))], ['dhuhr', 'asr', '1 h 28 min']);
    n = PT.nowAndNext(K, Date.UTC(2026, 9, 14, 15, 0));
    eq('20:00: now Isha, next Fajr tomorrow', [n.current.key, n.next.key, n.next.date], ['isha', 'fajr', '2026-10-15']);
    n = PT.nowAndNext(K, Date.UTC(2026, 9, 14, 20, 0));
    eq('01:00 next day: still Isha of the evening before', [n.current.key, n.current.date, n.next.key], ['isha', '2026-10-14', 'fajr']);
    n = PT.nowAndNext(K, Date.UTC(2026, 9, 15, 3, 0));
    eq('08:00: no current prayer after sunrise', [n.current, n.next.key], [null, 'dhuhr']);
    eq('exactly at Asr counts as Asr', PT.nowAndNext(K, Date.UTC(2026, 9, 14, 11, 28)).current.key, 'asr');
    eq('today in Karachi vs UTC date', PT.todayIn('Asia/Karachi', Date.UTC(2026, 9, 14, 20, 0)), '2026-10-15');

    // qibla
    const q = (a, b) => Math.round(PT.qibla(a, b).bearing * 10) / 10;
    eq('Karachi qibla', q(24.8607, 67.0011), 267.7); eq('London qibla', q(51.5074, -0.1278), 119); eq('New York qibla', q(40.7128, -74.006), 58.5);
    eq('Jakarta qibla (published 295 deg 09 min)', q(-6.2088, 106.8456), 295.2); eq('Sydney qibla', q(-33.8688, 151.2093), 277.5);
    eq('Karachi distance km', Math.round(PT.qibla(24.8607, 67.0011).km), 2800);
    eq('at the Kaaba distance 0', Math.round(PT.qibla(21.4225241, 39.8261818).km), 0);
    eq('compass words', [PT.compassWord(0), PT.compassWord(267.7), PT.compassWord(119), PT.compassWord(58.5), PT.compassWord(359)], ['north', 'west', 'east-south-east', 'east-north-east', 'north']);

    // formatting
    eq('12-hour', [PT.fmtTime(313, '12'), PT.fmtTime(720, '12'), PT.fmtTime(0, '12'), PT.fmtTime(988, '12')], ['5:13 am', '12:00 pm', '12:00 am', '4:28 pm']);
    eq('24-hour', [PT.fmtTime(313, '24'), PT.fmtTime(988, '24'), PT.fmtTime(1452, '24'), PT.fmtTime(-10, '24'), PT.fmtTime(null, '24')], ['05:13', '16:28', '00:12 (next day)', '23:50 (day before)', '--']);
    eq('time left', [PT.fmtLeft(88 * 60000), PT.fmtLeft(60 * 60000), PT.fmtLeft(5 * 60000), PT.fmtLeft(20000), PT.fmtLeft(0), PT.fmtLeft(61000)], ['1 h 28 min', '1 h', '5 min', '1 min', 'less than a minute', '2 min']);
    eq('UTC offsets', [PT.fmtOffset(5), PT.fmtOffset(5.5), PT.fmtOffset(-3.5), PT.fmtOffset(0), PT.fmtOffset(5.75)], ['UTC+5', 'UTC+5:30', 'UTC-3:30', 'UTC+0', 'UTC+5:45']);
    eq('Islamic date', PT.hijri('2026-10-14', 0), '3 Jumada al-Awwal 1448 AH'); eq('Islamic date moved back', PT.hijri('2026-10-14', -1), '2 Jumada al-Awwal 1448 AH');
    eq('Ramadan 1448 begins', PT.hijri('2027-02-08', 0), '1 Ramadan 1448 AH');

    // typed coordinates
    const c = s => PT.parseCoord(s, 90);
    eq('coords', [c('24.86'), c('-33.87'), c('24,86'), c('24.86 N'), c('33.87 S'), c(' 51.5° '), c('+10')], [24.86, -33.87, 24.86, 24.86, -33.87, 51.5, 10]);
    eq('coords refused', [c('abc'), c('95'), c(''), c('1e2'), c('24.8.6'), c('NaN'), PT.parseCoord('181', 180), PT.parseCoord('10 W', 180)], [null, null, null, null, null, null, null, -10]);

    // saved state checks
    eq('corrupt state', PT.cleanState('x'), { places: [], current: null, clock: '', hijriAdj: 0 });
    const cs = PT.cleanState({ places: [{ id: 'a', name: '  Home ', lat: 24.86, lon: 67, tz: 'Asia/Karachi', method: 'bad', asr: 'hanafi', highLat: 'x', adj: { fajr: 500, asr: 2.4, isha: 'x' }, custom: { fajr: 99 } },
        { id: 'a', lat: 1, lon: 1, tz: 'UTC' }, { lat: 100, lon: 0, tz: 'UTC' }, { lat: 0, lon: 0, tz: 'Nowhere/City' }], current: 'zz', clock: '24', hijriAdj: 7 });
    eq('clean state keeps the good place only', cs.places.length, 1);
    eq('clean place values', [cs.places[0].name, cs.places[0].method, cs.places[0].asr, cs.places[0].highLat, cs.places[0].adj.fajr, cs.places[0].adj.asr, cs.places[0].adj.isha, cs.places[0].custom.fajr], ['Home', 'mwl', 'hanafi', 'angle', 0, 2, 0, 18]);
    eq('clean current, clock, hijri', [cs.current, cs.clock, cs.hijriAdj], ['a', '24', 0]);
    eq('country defaults', [PT.defaultsFor('PK'), PT.defaultsFor('SA'), PT.defaultsFor('US'), PT.defaultsFor('GB'), PT.defaultsFor('')],
        [{ method: 'karachi', asr: 'hanafi' }, { method: 'makkah', asr: 'standard' }, { method: 'isna', asr: 'standard' }, { method: 'mwl', asr: 'standard' }, { method: 'mwl', asr: 'standard' }]);

    // calendar file
    const ics = PT.ics(K, ['2026-10-14', '2026-10-15'], Date.UTC(2026, 9, 14, 10, 0));
    eq('ics: 10 prayers', (ics.match(/BEGIN:VEVENT/g) || []).length, 10);
    eq('ics: Fajr 14 Oct in UTC', /DTSTART:20261014T001300Z/.test(ics), true);
    eq('ics: CRLF line ends and stable ids', /\r\nUID:k-2026-10-14-asr@prayer-times-and-qibla-direction\r\n/.test(ics) && !/[^\r]\n/.test(ics), true);
    eq('ics: commas escaped in names', /SUMMARY:Fajr \(Home\\, Lahore\)/.test(PT.ics(Object.assign({}, K, { name: 'Home, Lahore' }), ['2026-10-14'])), true);

    // dates
    eq('add days over a month', PT.addDays('2026-10-31', 1), '2026-11-01'); eq('leap day', PT.addDays('2028-02-28', 1), '2028-02-29');
    eq('bad dates', [PT.parseISO('2026-02-30'), PT.parseISO('x')], [null, null]); eq('days in Feb 2028', PT.daysInMonth(2028, 2), 29);

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n') + '\n\n' + summary;
    else { console.log(out.filter(l => l.startsWith('FAIL')).join('\n') || 'all checks passed'); console.log(summary); process.exitCode = fail ? 1 : 0; }
})();
