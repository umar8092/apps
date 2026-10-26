// Logic checks for core.js. Run with: node tests.js   (or open test.html)
(function () {
    'use strict';
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : window.MileageCore;
    let pass = 0; const fails = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(what + '\n   got:  ' + g + '\n   want: ' + w); };
    const ok = (v, what) => eq(!!v, true, what);
    const T = '2026-10-26';
    let nid = 100;
    const V = (id, rule, custom, name) => ({ id, name: name || 'My car', rule, custom: custom || null });
    const tr = (veh, date, miles, o) => Object.assign({ id: nid++, veh, date, from: 'Home', to: 'Customer', purpose: 'Job', t: Math.round(miles * 10), back: false, odo: null, pass: 0 }, o || {});
    const st = (vehicles, trips) => C.validate({ v: 1, nextId: 1, vehicles, trips });
    const amt = (s, id) => C.toCents(C.compute(s).get(id).x);

    // ---- parsing
    eq(C.parseDist('12').t, 120, 'distance 12');
    eq(C.parseDist('12.5').t, 125, 'distance 12.5');
    eq(C.parseDist('12,5').t, 125, 'distance with a decimal comma');
    eq(C.parseDist('1,234').t, 12340, 'distance with a thousands comma');
    eq(C.parseDist(' 24 mi ').t, 240, 'distance with "mi"');
    eq(C.parseDist('18 km', 'km').t, 180, 'distance with "km"');
    eq(C.parseDist('3.46').t, 35, 'two decimals round to the nearest tenth');
    ok(C.parseDist('').error, 'blank distance refused');
    ok(C.parseDist('0').error, 'zero distance refused');
    ok(C.parseDist('0.01').error, 'distance that rounds to 0 refused');
    ok(C.parseDist('-5').error, 'negative distance refused');
    ok(C.parseDist('abc').error, 'text distance refused');
    ok(C.parseDist('5000.1').error, 'over 5,000 in one trip refused');
    eq(C.parseDist('5000').t, 50000, '5,000 exactly is fine');
    eq(C.parseRate('0.45').r, 450, 'rate 0.45');
    eq(C.parseRate('45p').r, 450, 'rate 45p');
    eq(C.parseRate('72.5c').r, 725, 'rate 72.5c');
    eq(C.parseRate('£0.25').r, 250, 'rate with a £ sign');
    eq(C.parseRate('0.725').r, 725, 'rate with 3 decimals');
    eq(C.parseRate('30').r, 30000, 'rate 30 (rupees a km)');
    eq(C.parseRate('0,45').r, 450, 'rate with a decimal comma');
    ok(C.parseRate('0.4567').error, 'rate with 4 decimals refused');
    ok(C.parseRate('0').error, 'zero rate refused');
    ok(C.parseRate('').error, 'blank rate refused');
    ok(C.parseRate('x').error, 'text rate refused');
    eq(C.parseRate('abc').error, 'Type the rate as a number, like 0.45 or 45p.', 'text rate: clear message');
    eq(C.parseRate('Rs 30').r, 30000, 'rate with Rs');
    eq(C.parseRate('$0.725').r, 725, 'rate with $');
    eq(C.parseOdo('48,213').t, 482130, 'odometer with a comma');
    ok(C.parseOdo('48213.55').error, 'odometer with 2 decimals refused');

    // ---- display
    eq(C.money(18540, '£'), '£185.40', 'money £');
    eq(C.money(123456789, 'Rs'), 'Rs 1,234,567.89', 'money with a word symbol');
    eq(C.money(5, ''), '0.05', 'money plain');
    eq(C.rate(450, '£'), '45p', 'rate 45p');
    eq(C.rate(725, '$'), '72.5¢', 'rate 72.5¢');
    eq(C.rate(730, 'C$'), '73¢', 'rate 73¢');
    eq(C.rate(450, ''), '0.45', 'rate plain');
    eq(C.rate(30000, 'Rs'), 'Rs 30.00', 'rate in rupees');
    eq(C.rate(1250, '£'), '£1.25', 'rate over 1 pound');
    eq(C.dist(41200), '4,120.0', 'distance with a thousands comma');

    // ---- tax years
    eq(C.yearStart('2026-04-05', '04-06'), '2025-04-06', 'UK tax year: 5 Apr belongs to the year before');
    eq(C.yearStart('2026-04-06', '04-06'), '2026-04-06', 'UK tax year starts on 6 Apr');
    eq(C.yearEnd('2026-04-06'), '2027-04-05', 'UK tax year ends on 5 Apr');
    eq(C.yearName('2026-04-06'), '2026-27', 'UK tax year name');
    eq(C.yearName('2026-01-01'), '2026', 'calendar year name');
    eq(C.range('year', T, '04-06').label, 'Tax year 2026-27 (6 Apr 2026 to 5 Apr 2027)', 'this tax year label');
    eq(C.range('lastyear', '2026-03-10', '04-06').from, '2024-04-06', 'last tax year from March');
    eq(C.range('last', '2026-01-15', '01-01').label, 'December 2025', 'last month across the new year');
    eq(C.range('month', '2028-02-10', '01-01').to, '2028-02-29', 'February in a leap year');
    eq([C.range('custom', T, '01-01', '2026-10-20', '2026-10-01').from, C.range('custom', T, '01-01', '2026-10-20', '2026-10-01').to], ['2026-10-01', '2026-10-20'], 'picked dates the wrong way round are swapped');

    // ---- the main situation: Sarah, UK plumber, October trips with HMRC 45p
    nid = 100;
    let s = st([V(1, 'uk-car')], [
        tr(1, '2026-10-01', 24, { back: true }), tr(1, '2026-10-05', 18.5), tr(1, '2026-10-12', 62), tr(1, '2026-10-20', 107.5),
        tr(1, '2026-10-21', 176, { pass: 1 }), tr(1, '2026-09-28', 30)]);
    let cl = C.claim(s, '2026-10-01', '2026-10-31');
    eq(cl.trips.length, 5, 'October: 5 trips (the September one left out)');
    eq(cl.units.mi, 4120, 'October: 412.0 miles (24 there and back = 48, + 18.5 + 62 + 107.5 + 176)');
    eq(cl.cents, 18540 + 880, 'October: 412 miles at 45p = £185.40, plus 176 passenger miles at 5p = £8.80');
    eq(cl.lines.map(l => C.lineText(l, '£')), ['412.0 miles at 45p = £185.40', 'Passenger extra: 176.0 passenger miles at 5p = £8.80'], 'October breakdown lines');
    eq(amt(s, 100), 2160, 'there and back 24 miles = 48 miles = £21.60');
    eq(amt(s, 101), 833, '18.5 miles at 45p = 832.5p, shown as £8.33');
    eq(C.unitsText(cl.units), '412.0 mi', 'units text');

    // ---- crossing 10,000 miles in the tax year
    nid = 200;
    s = st([V(1, 'uk-car')], [tr(1, '2026-05-01', 4985), tr(1, '2026-06-01', 4985), tr(1, '2026-10-21', 48)]);
    let c = C.compute(s).get(202);
    eq(c.parts, [{ d: 300, r: 450, low: false }, { d: 180, r: 250, low: true }], 'trip crossing 10,000 miles is split 30 at 45p and 18 at 25p');
    eq(C.toCents(c.x), 1800, 'split trip: £13.50 + £4.50 = £18.00');
    ok(c.crossed, 'split trip is marked as crossing the limit');
    let ys = C.yearStatus(s, T)[0];
    eq([ys.used, ys.left, ys.after], [100180, 0, 10000], 'year status after the limit');
    eq(C.yearText(ys, '£').line, 'Past the 10,000-mile limit: the rest of this tax year is at 25p a mile (resets on 6 Apr 2027).', 'year text past the limit');
    // a trip added later with an earlier date moves the split
    s.trips.push(tr(1, '2026-07-01', 20));
    c = C.compute(s);
    eq(c.get(203).parts, [{ d: 200, r: 450, low: false }], 'earlier trip added later: all at 45p');
    eq(c.get(202).parts, [{ d: 100, r: 450, low: false }, { d: 380, r: 250, low: true }], 'the crossing trip now has 10 at 45p and 38 at 25p');
    eq(C.claim(s, '2026-04-06', '2027-04-05').cents, 450000 + 950, 'tax year total: 10,000 miles at 45p (£4,500) + 38 miles at 25p (£9.50)');
    // the new tax year starts again at 45p
    nid = 300;
    s = st([V(1, 'uk-car')], [tr(1, '2026-05-01', 5000), tr(1, '2026-06-01', 5000), tr(1, '2027-04-05', 10), tr(1, '2027-04-06', 10)]);
    c = C.compute(s);
    eq(c.get(302).parts[0].r, 250, '5 Apr: still the old tax year, 25p');
    eq(c.get(303).parts[0].r, 450, '6 Apr: new tax year, back to 45p');
    // exactly 10,000 then the next mile
    nid = 320;
    s = st([V(1, 'uk-car')], [tr(1, '2026-05-01', 5000), tr(1, '2026-06-01', 5000), tr(1, '2026-06-02', 1)]);
    c = C.compute(s);
    eq([c.get(321).parts.length, c.get(321).parts[0].r, c.get(322).parts[0].r, c.get(322).crossed], [1, 450, 250, false], 'exactly 10,000 at 45p, the next mile at 25p, no split');

    // ---- two cars share the HMRC limit; a motorbike does not
    nid = 400;
    s = st([V(1, 'uk-car'), V(2, 'uk-car', null, 'Van'), V(3, 'uk-moto', null, 'Motorbike')], [tr(1, '2026-05-01', 5000), tr(2, '2026-06-01', 5000), tr(1, '2026-07-01', 10), tr(3, '2026-07-01', 10)]);
    c = C.compute(s);
    eq(c.get(402).parts[0].r, 250, 'car after the van passed 10,000 shared miles: 25p');
    eq(C.toCents(c.get(403).x), 240, 'motorbike 10 miles at 24p = £2.40');
    eq(C.yearStatus(s, T).length, 2, 'year status: one box for car and van, one for the motorbike');
    eq(C.yearStatus(s, T)[0].names, ['My car', 'Van'], 'car and van listed together');

    // ---- IRS: the rate changed on 1 July 2026
    nid = 500;
    s = st([V(1, 'us-irs')], [tr(1, '2026-06-30', 100), tr(1, '2026-07-01', 100), tr(1, '2025-12-31', 100), tr(1, '2026-01-02', 0.5), tr(1, '2024-03-01', 10)]);
    c = C.compute(s);
    eq([C.toCents(c.get(500).x), C.toCents(c.get(501).x), C.toCents(c.get(502).x), C.toCents(c.get(504).x)], [7250, 7600, 7000, 670], 'IRS: 72.5¢ to 30 Jun, 76¢ from 1 Jul, 70¢ in 2025, 67¢ in 2024');
    eq(c.get(503).x, 3625, '0.5 mile at 72.5¢ is exactly 36.25¢');
    cl = C.claim(s, '2026-01-01', '2026-12-31');
    eq(cl.cents, 7250 + 7600 + 36, '2026 total: $72.50 + $76.00 + $0.36 (exact sum rounded once)');
    eq(cl.lines.map(l => C.lineText(l, '$')), ['100.5 miles at 72.5¢ = $72.86', '100.0 miles at 76¢ = $76.00'], 'IRS 2026 breakdown by rate');
    eq(C.yearText(C.yearStatus(s, T)[0], '$').line, 'No yearly limit: every mile is at 76¢.', 'IRS has no limit');

    // ---- CRA: 5,000 km
    nid = 600;
    s = st([V(1, 'ca-cra')], [tr(1, '2026-02-01', 4990), tr(1, '2026-03-01', 20)]);
    c = C.compute(s).get(601);
    eq(c.parts, [{ d: 100, r: 730, low: false }, { d: 100, r: 670, low: true }], 'CRA: 10 km at 73¢ and 10 km at 67¢');
    eq(C.toCents(c.x), 1400, 'CRA split trip = $14.00');
    eq(C.yearText(C.yearStatus(s, T)[0], 'C$').line, 'Past the 5,000-km limit: the rest of this tax year is at 67¢ a km (resets on 1 Jan 2027).', 'CRA year text');
    s = st([V(1, 'ca-cra')], [tr(1, '2026-02-01', 1200)]);
    eq(C.yearText(C.yearStatus(s, T)[0], 'C$').line, '3,800.0 km left at 73¢ before the rate drops to 67¢ (limit 5,000 km, resets on 1 Jan 2027).', 'CRA km left');

    // ---- own rate, changed from a date
    const own = { unit: 'km', ys: '07-01', periods: [{ from: '2000-01-01', rate: 30000, after: 0, rate2: 0, pass: 0 }] };
    const v = V(1, 'custom', own, 'Bike');
    const fresh = C.readRule({ name: 'Bike', rule: 'custom', unit: 'km', rate: '35', ys: '07-01' });
    eq(fresh.veh.custom.periods[0].rate, 35000, 'own rate read');
    const newer = C.applyRates(v, fresh.veh, 'from', '2026-09-01');
    eq(newer.periods.map(p => [p.from, p.rate]), [['2000-01-01', 30000], ['2026-09-01', 35000]], 'new rate from 1 Sep keeps the old one before');
    nid = 700;
    s = st([Object.assign({}, v, { custom: newer })], [tr(1, '2026-08-31', 10), tr(1, '2026-09-01', 10)]);
    c = C.compute(s);
    eq([C.toCents(c.get(700).x), C.toCents(c.get(701).x)], [30000, 35000], 'own rate: Rs 300 before, Rs 350 from 1 Sep');
    eq(C.applyRates(v, fresh.veh, 'all', '').periods.length, 1, 'new rate for all trips replaces the old one');
    eq(C.range('year', T, '07-01').label, 'Tax year 2026-27 (1 Jul 2026 to 30 Jun 2027)', 'year from 1 July');
    eq(C.ruleText(Object.assign({}, v, { custom: newer }), 'Rs'), 'Rs 30.00 a km. From 1 Sep 2026: Rs 35.00 a km. Year from 1 Jul.', 'own rate text');
    let rr = C.readRule({ name: 'Car', rule: 'custom', unit: 'mi', rate: '0.45', useLimit: true, after: '10000', rate2: '25p', usePass: true, pass: '5p', ys: '04-06' });
    eq(rr.veh.custom.periods[0], { from: '2000-01-01', rate: 450, after: 10000, rate2: 250, pass: 50 }, 'own rate like HMRC');
    rr = C.readRule({ name: '', rule: 'custom', unit: 'mi', rate: '', useLimit: true, after: '', rate2: 'x', ys: '02-30' });
    eq(Object.keys(rr.errors).sort(), ['after', 'name', 'rate', 'rate2', 'ys'], 'own rate errors');
    ok(C.readRule({ name: 'Car', rule: 'nope' }).errors.rule, 'unknown rule refused');
    eq(C.readRule({ name: '  My   car ', rule: 'uk-car' }).veh, { name: 'My car', rule: 'uk-car', custom: null }, 'official rate with a tidied name');

    // ---- reading a trip
    s = st([V(1, 'uk-car')], []);
    const f = o => Object.assign({ veh: '1', date: T, from: 'Home', to: 'Leeds', purpose: 'Repair', dist: '24', back: false, useOdo: false, pass: '' }, o);
    eq(C.readTrip(f(), s, T).trip, { veh: 1, date: T, from: 'Home', to: 'Leeds', purpose: 'Repair', t: 240, back: false, odo: null, pass: 0 }, 'trip read');
    eq(C.readTrip(f(), s, T).warn, '', 'no warning for a normal trip');
    ok(C.readTrip(f({ date: '2026-10-27' }), s, T).errors.date, 'future date refused');
    ok(C.readTrip(f({ date: '' }), s, T).errors.date, 'blank date refused');
    ok(C.readTrip(f({ to: '   ' }), s, T).errors.to, 'blank To refused');
    ok(C.readTrip(f({ dist: '0' }), s, T).errors.dist, 'zero miles refused');
    ok(C.readTrip(f({ dist: '-3' }), s, T).errors.dist, 'negative miles refused');
    ok(C.readTrip(f({ veh: '9' }), s, T).errors.veh, 'unknown vehicle refused');
    ok(C.readTrip(f({ pass: '9' }), s, T).errors.pass, '9 passengers refused');
    ok(C.readTrip(f({ pass: 'one' }), s, T).errors.pass, 'text passengers refused');
    eq(C.readTrip(f({ from: '', purpose: '' }), s, T).trip.from, '', 'From is optional');
    ok(/purpose/.test(C.readTrip(f({ purpose: '' }), s, T).warn), 'no purpose: gentle tip, not an error');
    eq(C.readTrip(f({ to: 'A'.repeat(300) }), s, T).trip.to.length, 80, 'very long To is cut to 80');
    eq(C.readTrip(f({ to: 'Line1\nLine2\t x' }), s, T).trip.to, 'Line1 Line2 x', 'pasted text with new lines is tidied');
    eq(C.readTrip(f({ useOdo: true, odoStart: '48213', odoEnd: '48261.5', back: true }), s, T).trip, { veh: 1, date: T, from: 'Home', to: 'Leeds', purpose: 'Repair', t: 485, back: false, odo: [482130, 482615], pass: 0 }, 'odometer readings give 48.5 miles, never doubled');
    ok(C.readTrip(f({ useOdo: true, odoStart: '48261', odoEnd: '48213' }), s, T).errors.odoEnd, 'odometer going down refused');
    ok(C.readTrip(f({ useOdo: true, odoStart: '', odoEnd: '5' }), s, T).errors.odoStart, 'blank odometer refused');
    ok(C.readTrip(f({ useOdo: true, odoStart: '1', odoEnd: '9000' }), s, T).errors.odoEnd, 'odometer over 5,000 in one trip refused');
    ok(/Check the number/.test(C.readTrip(f({ dist: '3000', back: true }), s, T).warn), 'very long day: a warning');

    // ---- repeat routes and places
    nid = 800;
    s = st([V(1, 'uk-car')], [tr(1, '2026-10-01', 10, { to: 'A' }), tr(1, '2026-10-02', 10, { to: 'B' }), tr(1, '2026-10-03', 10, { to: 'A' })]);
    eq(C.recentRoutes(s, 6).map(t => t.to), ['A', 'B'], 'repeat chips: newest first, no doubles');
    eq(C.places(s), ['A', 'B', 'Home'], 'places for the suggestions');
    eq(C.route({ from: 'Home', to: 'Leeds', back: true }), 'Home ⇄ Leeds', 'route there and back');
    eq(C.route({ from: '', to: 'Leeds', back: false }), 'Leeds', 'route with no From');

    // ---- sharing
    nid = 900;
    s = st([V(1, 'uk-car')], [tr(1, '2026-10-01', 24, { back: true, to: 'Smith Ltd, Leeds', purpose: 'Boiler repair' }), tr(1, '2026-10-05', 10, { purpose: '=HYPERLINK("x")' })]);
    const rg = C.range('month', T, '04-06');
    eq(C.claimText(s, rg, '£', 'Sarah Khan').split('\n'), ['Mileage claim: October 2026', 'Name: Sarah Khan', '2 trips, 58.0 mi', 'Rate: UK: HMRC car or van', '58.0 miles at 45p = £26.10', 'Total to claim: £26.10', '',
        'Trips:', 'Thu 1 Oct 2026 · Home ⇄ Smith Ltd, Leeds · Boiler repair · 48.0 mi · £21.60', 'Mon 5 Oct 2026 · Home → Customer · =HYPERLINK("x") · 10.0 mi · £4.50'], 'claim text');
    const lines = C.csv(s, rg).replace('﻿', '').trim().split('\r\n');
    eq(lines[0], 'Date,Vehicle,From,To,Purpose,Distance,Unit,There and back,Odometer start,Odometer end,Passengers,Rate,Amount', 'CSV header');
    eq(lines[1], '2026-10-01,My car,Home,"Smith Ltd, Leeds",Boiler repair,48.0,mi,yes,,,,0.45,21.60', 'CSV row with a comma in a name');
    eq(lines[2], '2026-10-05,My car,Home,Customer,"\'=HYPERLINK(""x"")",10.0,mi,no,,,,0.45,4.50', 'CSV formula is made safe');
    eq(lines[3], 'Total,,,,,58.0,mi,,,,,,26.10', 'CSV total');
    eq(C.claimText(st([V(1, 'uk-car')], []), rg, '', '').split('\n').slice(-1)[0], '(no trips in this period)', 'empty claim text');
    ok(/Total,,,,,0.0/.test(C.csv(st([V(1, 'uk-car')], []), rg)), 'empty CSV still has a total');

    // ---- saved data
    eq(C.validate(null), null, 'null state refused');
    eq(C.validate({ vehicles: 'x', trips: [] }), null, 'broken state refused');
    s = C.validate({ nextId: 2, vehicles: [V(1, 'uk-car'), { id: 2, name: '', rule: 'uk-car' }, V(3, 'custom', { unit: 'mi', ys: '01-01', periods: [] })],
        trips: [tr(1, '2026-10-01', 5, { id: 50 }), tr(9, '2026-10-01', 5, { id: 51 }), tr(1, 'bad', 5, { id: 52 }), tr(1, '2026-10-01', 5, { id: 50 }), Object.assign(tr(1, '2026-10-02', 5, { id: 53 }), { odo: [1, 99], back: true }), Object.assign(tr(1, '2026-10-03', 5, { id: 54 }), { t: -5 })] });
    eq(s.vehicles.map(v => v.id), [1], 'bad vehicles dropped');
    eq(s.trips.map(t => t.id), [50, 53], 'trips with unknown vehicles, bad dates, double ids or bad distances dropped');
    eq([s.trips[1].odo, s.trips[1].back], [null, true], 'odometer that does not match the distance is dropped');
    eq(s.nextId, 54, 'nextId repaired above the largest id');

    const out = fails.length ? 'FAILED ' + fails.length + ' of ' + (pass + fails.length) + ':\n\n' + fails.join('\n\n') : 'All ' + pass + ' checks passed.';
    if (typeof module !== 'undefined' && module.exports) { console.log(out); if (fails.length) process.exitCode = 1; }
    else { const p = document.createElement('pre'); p.textContent = out; document.body.appendChild(p); }
})();
