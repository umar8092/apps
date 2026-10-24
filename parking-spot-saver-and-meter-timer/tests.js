// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const P = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.Park;
    let pass = 0, fail = 0; const out = [];
    function eq(a, b, name) { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++; if (!ok) out.push('FAIL ' + name + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
    function ok(c, name) { eq(!!c, true, name); }
    const M = P.MIN, H = P.HOUR, D = P.DAY;
    const at = (h, m, s = 0, day = 25) => new Date(2026, 9, day, h, m, s).getTime();   // Sun 25 Oct 2026, local time
    const L = 'en-US';

    // typed lengths
    eq(P.readLength('', '1.5', '').ms, 90 * M, '1.5 hours');
    eq(P.readLength('', '1,5', '').ms, 90 * M, '1,5 hours (comma)');
    eq(P.readLength('', '', '90').ms, 90 * M, '90 minutes');
    eq(P.readLength('2', '3', '').ms, 2 * D + 3 * H, '2 days 3 hours');
    eq(P.readLength('30', '', '').ms, 30 * D, '30 days is the most');
    ok(P.readLength('30', '', '1').error, 'over 30 days');
    ok(P.readLength('', '', '').error, 'blank');
    ok(P.readLength('0', '0', '0').error, 'zero');
    ok(P.readLength('', '-1', '').error, 'negative');
    ok(P.readLength('', 'two', '').error, 'words');
    ok(P.readLength('', '', '0.4').error, 'under a minute rounds to 0');
    eq(P.readLength(' ', ' 2 ', ' ').ms, 2 * H, 'spaces around');
    eq(P.readLength('', '', '1e3').error !== undefined, true, '1e3 is not a number here');

    // "until a time"
    const t0 = at(13, 40);
    eq(P.untilTime(t0, '15:40'), { endAt: at(15, 40), tomorrow: false }, 'until 15:40 today');
    eq(P.untilTime(t0, '01:30'), { endAt: at(1, 30, 0, 26), tomorrow: true }, 'until 01:30 means tomorrow (past midnight)');
    eq(P.untilTime(t0, '13:40').tomorrow, true, 'same minute as now means tomorrow');
    eq(P.untilTime(t0, '9:05').endAt, at(9, 5, 0, 26), 'one-digit hour');
    ok(P.untilTime(t0, '24:00').error, '24:00 is not a time');
    ok(P.untilTime(t0, '').error, 'blank time');
    ok(P.untilTime(t0, '12:61').error, 'bad minutes');

    // paid choice
    eq(P.paidEnd(t0, 'none'), { endAt: null }, 'no limit');
    eq(P.paidEnd(t0, '7200000').endAt, at(15, 40), '2 hours from 13:40 = 15:40');
    eq(P.paidEnd(t0, 'other', { days: '', hours: '1', mins: '15' }).endAt, at(14, 55), 'other 1 h 15');
    eq(P.paidEnd(t0, 'until', { until: '18:30' }).endAt, at(18, 30), 'until 18:30');
    ok(P.paidEnd(t0, 'other', {}).error, 'other blank');
    ok(P.paidEnd(t0, 'bogus').error, 'unknown choice');
    ok(P.paidEnd(t0, '-5').error, 'negative preset');

    // the worked example: parked 13:40, paid 2 hours, warn 10 min before
    const spot = { id: 's1', car: 'My car', note: 'Level B2, row F, bay 34', loc: { lat: 24.8607, lon: 67.0011, acc: 12 }, parkedAt: t0, endAt: at(15, 40), paidFrom: t0, warnMin: 10, warned: false, ended: false };
    eq(P.statusText(spot, at(15, 18), L), { st: 'ok', big: '22 min left', line: 'Paid until 3:40 PM' }, 'Paid until 3:40 PM, 22 min left');
    eq(P.statusText(spot, at(15, 17, 1), L).big, '22 min left', 'rounded down: 22 min 59 s shows 22 min');
    eq(P.state(spot, at(15, 29, 59)), 'ok', 'just before the warning');
    eq(P.state(spot, at(15, 30)), 'soon', 'warning at 15:30');
    eq(P.statusText(spot, at(15, 35, 30), L).big, '4 min 30 s left', 'seconds in the last 10 minutes');
    eq(P.statusText(spot, at(15, 39, 15), L).big, '45 s left', 'last minute');
    eq(P.state(spot, at(15, 40)), 'over', 'over at 15:40');
    eq(P.statusText(spot, at(15, 43), L), { st: 'over', big: 'Paid time ran out', line: 'Ran out 3 min ago, at 3:40 PM' }, 'ran out 3 min ago');
    eq(P.statusText(spot, at(15, 40, 20), L).line, 'Ran out just now, at 3:40 PM', 'ran out just now');
    eq(P.state(Object.assign({}, spot, { warnMin: 0 }), at(15, 39)), 'ok', 'no warning: stays ok until the end');
    eq(P.used(spot, at(14, 40)), 0.5, 'bar half way at 14:40');
    eq(P.used(spot, at(16, 0)), 1, 'bar full when over');
    eq(P.used(spot, at(13, 0)), 0, 'bar never negative');

    // alerts fire once
    let r = P.dueAlert(spot, at(15, 20)); eq(r.alert, null, 'no alert at 15:20'); eq(r.spot, spot, 'unchanged object');
    r = P.dueAlert(spot, at(15, 30)); eq(r.alert, 'warn', 'warning at 15:30'); eq(r.spot.warned, true, 'marked warned');
    eq(P.dueAlert(r.spot, at(15, 31)).alert, null, 'warning only once');
    r = P.dueAlert(r.spot, at(15, 40)); eq(r.alert, 'end', 'end alert at 15:40'); eq(P.dueAlert(r.spot, at(15, 41)).alert, null, 'end only once');
    eq(P.dueAlert(spot, at(15, 42)).alert, 'end', 'reopened 2 min after the end: rings');
    r = P.dueAlert(spot, at(15, 52)); eq([r.alert, r.spot.ended], [null, true], 'reopened 12 min after: quiet, marked ended');
    eq(P.dueAlert(spot, at(15, 37)).alert, 'warn', 'reopened during warning time: warns');
    eq(P.dueAlert(Object.assign({}, spot, { endAt: null }), at(20, 0)).alert, null, 'no limit never rings');

    // adding time
    let e = P.extend(spot, at(15, 20), 30 * M); eq([e.endAt, e.paidFrom, e.warned], [at(16, 10), t0, false], '+30 min while running adds to the end');
    e = P.extend(Object.assign({}, spot, { warned: true, ended: true }), at(15, 50), 30 * M); eq([e.endAt, e.paidFrom, e.ended], [at(16, 20), at(15, 50), false], '+30 min after it ran out counts from now');
    e = P.extend(Object.assign({}, spot, { endAt: null }), at(14, 0), H); eq(e.endAt, at(15, 0), '+1 hour on no limit');
    e = P.extend(Object.assign({}, spot, { endAt: at(15, 20) + 30 * D - M }), at(15, 20), H); eq(e.endAt, at(15, 20) + 30 * D, 'capped at 30 days');

    // formats
    eq(P.fmtLeft(22 * M), '22 min', '22 min');
    eq(P.fmtLeft(65 * M), '1 h 05 min', '1 h 05');
    eq(P.fmtLeft(2 * H), '2 h', '2 h');
    eq(P.fmtLeft(3 * D + 4 * H + 5 * M), '3 days 4 h', 'days');
    eq(P.fmtLeft(D), '1 day', 'one day');
    eq(P.fmtLeft(-5), '0 s', 'never negative');
    eq(P.fmtSpan(20 * 1000), 'less than 1 min', 'under a minute');
    eq(P.fmtWhen(at(1, 30, 0, 26), t0, L), 'tomorrow at 1:30 AM', 'tomorrow');
    eq(P.fmtWhen(at(9, 0, 0, 24), t0, L), 'yesterday at 9:00 AM', 'yesterday');
    eq(P.fmtWhen(at(9, 0, 0, 28), t0, L), 'Wed, Oct 28 at 9:00 AM', 'later date');
    eq(P.fmtAt(t0, at(14, 0), L), 'at 1:40 PM', 'parked at');
    eq(P.fmtAt(at(9, 0, 0, 20), t0, L), 'on Tue, Oct 20 at 9:00 AM', 'parked days ago');
    eq(P.statusText(Object.assign({}, spot, { endAt: null }), at(14, 45), L), { st: 'free', big: 'No time limit', line: 'Parked 1 h 05 min ago' }, 'no limit status');
    eq(P.statusText(Object.assign({}, spot, { endAt: at(1, 30, 0, 26) }), at(23, 0), L).line, 'Paid until tomorrow at 1:30 AM', 'midnight crossing');

    // distance and direction
    const car = { lat: 24.8607, lon: 67.0011, acc: 10 };
    const d1 = P.distance({ lat: 24.8607 - 0.0018, lon: 67.0011 }, car);
    ok(Math.abs(d1.metres - 200) < 2 && Math.abs(d1.bearing) < 0.5, '200 m to the north: ' + JSON.stringify(d1));
    eq(P.farText({ lat: 24.8607 - 0.0018, lon: 67.0011, acc: 10 }, car), 'Your car is about 200 m away, to the north.', 'far text north');
    eq(P.farText({ lat: 24.8607 + 0.001, lon: 67.0011 + 0.0011, acc: 10 }, car).includes('to the south-west'), true, 'south-west');
    ok(P.farText({ lat: 24.86072, lon: 67.0011, acc: 8 }, car).startsWith('You are very close'), 'very close');
    ok(P.farText({ lat: 24.8507, lon: 67.0011, acc: 300 }, car).includes('rough'), 'rough location says so');
    const lp = P.distance({ lat: 51.5074, lon: -0.1278 }, { lat: 48.8566, lon: 2.3522 }).metres;
    ok(Math.abs(lp - 343500) < 1500, 'London to Paris about 343.5 km: ' + Math.round(lp));
    eq(P.fmtMetres(1234), '1.2 km', 'km');
    eq(P.fmtMetres(47), '45 m', 'rounded to 5 m');
    eq(P.fmtMetres(237), '240 m', 'rounded to 10 m');
    eq(P.fmtMetres(25300), '25 km', 'whole km');

    // maps, share, calendar
    eq(P.mapsUrl(car), 'https://www.google.com/maps/dir/?api=1&destination=24.8607,67.0011&travelmode=walking', 'walking directions link');
    eq(P.pinUrl({ lat: -33.8688197, lon: 151.2092955 }), 'https://maps.google.com/?q=-33.86882,151.209296', 'pin link, 6 decimals, negative');
    eq(P.shareText(spot, at(14, 0), L), 'My car is parked at: Level B2, row F, bay 34\nParked at 1:40 PM. Paid until 3:40 PM.\nMap: https://maps.google.com/?q=24.8607,67.0011', 'share text');
    eq(P.shareText(Object.assign({}, spot, { note: '', loc: null, endAt: null }), at(14, 0), L), 'My car is parked.\nParked at 1:40 PM.', 'share text with nothing saved');
    const cal = P.ics(Object.assign({}, spot, { note: 'Level B2, row F; bay 34\nnear lift' }), at(14, 0));
    const utc = ts => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    ok(cal.includes('DTSTART:' + utc(at(15, 40)) + '\r\n'), 'calendar starts at the end of paid time');
    ok(cal.includes('DTEND:' + utc(at(15, 55)) + '\r\n'), 'calendar 15 min long');
    ok(cal.includes('TRIGGER:-PT10M\r\n') && cal.includes('TRIGGER:PT0M\r\n'), 'two alarms: 10 min before and at the end');
    ok(cal.includes('Where: Level B2\\, row F\\; bay 34\\nnear lift'), 'text escaped');
    ok(cal.includes('SUMMARY:Parking ends: My car') && cal.startsWith('BEGIN:VCALENDAR\r\n') && cal.endsWith('END:VCALENDAR\r\n'), 'calendar shape');
    ok(!P.ics(Object.assign({}, spot, { warnMin: 0 }), at(14, 0)).includes('TRIGGER:-PT'), 'no warning: only the end alarm');

    // names and text
    eq(P.nextCarName([]), 'My car', 'first car');
    eq(P.nextCarName([{ car: 'My car' }]), 'Car 2', 'second car');
    eq(P.nextCarName([{ car: 'My car' }, { car: 'Car 2' }]), 'Car 3', 'third car');
    eq(P.cleanText('  a\u0007b \t c\n\n\n\nd  ', 300), 'a b c\n\nd', 'pasted text tidied');
    eq(P.cleanText('x'.repeat(500), 300).length, 300, 'long note cut to 300');

    // restoring saved data
    const def = P.restore(null);
    eq([def.spots.length, def.settings.warnMin, def.settings.sound, def.settings.notify], [0, 10, true, false], 'defaults');
    eq(P.restore('{bad').spots.length, 0, 'string is ignored');
    const bad = P.restore({ nextId: 'x', settings: { warnMin: 7, lastChoice: '<b>', notify: 'yes' }, spots: [
        { id: 's3', car: '', note: 'n'.repeat(400), parkedAt: t0, endAt: 'soon', loc: { lat: 200, lon: 0 }, warnMin: 99 },
        { id: 's3', car: 'Dup', parkedAt: t0 },
        { id: 's9', car: 'Honda', parkedAt: t0, endAt: at(15, 40), paidFrom: at(16, 0), loc: { lat: '24.8', lon: 67, acc: -3 }, hasPhoto: true },
        { id: '', parkedAt: t0 }, null, { id: 's10', parkedAt: -1 }, 'x'] });
    eq(bad.spots.length, 2, 'broken and duplicate spots dropped');
    eq([bad.spots[0].car, bad.spots[0].note.length, bad.spots[0].endAt, bad.spots[0].loc, bad.spots[0].warnMin], ['My car', 300, null, null, 10], 'bad values cleaned');
    eq([bad.spots[1].loc, bad.spots[1].paidFrom, bad.spots[1].hasPhoto], [{ lat: 24.8, lon: 67, acc: 0, at: 0 }, t0, true], 'paid-from after end fixed, number strings read');
    eq([bad.nextId, bad.settings.warnMin, bad.settings.lastChoice, bad.settings.notify], [10, 10, undefined, false], 'next id after s9, bad settings reset');
    const many = P.restore({ spots: Array.from({ length: 8 }, (_, i) => ({ id: 's' + (i + 1), parkedAt: t0 })) });
    eq(many.spots.length, 5, 'at most 5 cars');
    eq(P.restore({ settings: { lastChoice: '7200000', warnMin: 15, sound: false } }).settings, { sound: false, vibrate: true, notify: false, warnMin: 15, lastChoice: '7200000' }, 'settings kept');

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.concat(summary).join('\n');
    else { out.forEach(l => console.log(l)); console.log(summary); if (fail) process.exitCode = 1; }
})();
