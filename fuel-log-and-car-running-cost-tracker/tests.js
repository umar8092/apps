// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const M = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.FLC;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const L = 'en-GB', T = '2026-10-14';

    // typed numbers
    const odo = s => M.parseOdo(s).v, vol = s => M.parseVol(s).v, pr = (s, d) => M.parsePrice(s, d).v, mon = s => M.parseMoney(s).v;
    const e = r => !!r.error;
    eq('odo 45320', odo('45320'), 453200); eq('odo 45,320', odo('45,320'), 453200); eq('odo 45.320 (dot thousands)', odo('45.320'), 453200); eq('odo 45 320', odo('45 320'), 453200);
    eq('odo 45320.5', odo('45320.5'), 453205); eq('odo 0 allowed', odo('0'), 0); eq('odo 45320 km', odo('45320 km'), 453200); eq('odo 1,00,000 lakh', odo('1,00,000'), 1000000);
    eq('odo 2 decimals refused', e(M.parseOdo('45320.55')), true); eq('odo negative', e(M.parseOdo('-5')), true); eq('odo blank', e(M.parseOdo('')), true);
    eq('odo words', e(M.parseOdo('lots')), true); eq('odo too big', e(M.parseOdo('10000000')), true); eq('odo 5e3', e(M.parseOdo('5e3')), true);
    eq('vol 32.5', vol('32.5'), 32500); eq('vol 32,5', vol('32,5'), 32500); eq('vol 32.457 is decimal', vol('32.457'), 32457); eq('vol 32,457 is decimal', vol('32,457'), 32457);
    eq('vol 40 L', vol('40 L'), 40000); eq('vol 12 litres', vol('12 litres'), 12000); eq('vol 10 gal', vol('10 gal'), 10000); eq('vol .5', vol('.5'), 500);
    eq('vol zero', e(M.parseVol('0')), true); eq('vol 4 decimals', e(M.parseVol('1.2345')), true); eq('vol huge', e(M.parseVol('20000')), true); eq('vol blank', e(M.parseVol('  ')), true);
    eq('price 279.50', pr('279.50'), 279500); eq('price 1.799 (en)', pr('1.799', '.'), 1799); eq('price 1,799 (de)', pr('1,799', ','), 1799);
    eq('price 10,000 (en) is thousands', pr('10,000', '.'), 10000000); eq('price 10.000 (de) is thousands', pr('10.000', ','), 10000000); eq('price Rs 280', pr('Rs 280'), 280000);
    eq('money 9,100', mon('9,100'), 910000); eq('money 45.50', mon('45.50'), 4550); eq('money $40', mon('$40'), 4000); eq('money 1.234,56', mon('1.234,56'), 123456);
    eq('money zero', e(M.parseMoney('0')), true); eq('money negative', e(M.parseMoney('-3')), true); eq('money 3 decimals = thousands', mon('9.100'), 910000);
    eq('pasted nbsp', odo('45 320'), 453200);

    // fuel, price and total: any two give the third
    let f = M.solveFuel('32.5', '280', '');
    eq('fuel+price -> total', [f.vol, f.total, f.worked], [32500, 910000, 'total']);
    f = M.solveFuel('32.5', '', '9100'); eq('fuel+total -> price', [f.price, f.worked], [280000, 'price']);
    f = M.solveFuel('', '280', '5000'); eq('price+total -> fuel (Rs 5000 at 280)', [f.vol, f.worked], [17857, 'vol']);
    f = M.solveFuel('40', '', ''); eq('fuel only, no cost', [f.vol, f.total], [40000, null]);
    f = M.solveFuel('32.5', '280', '9100'); eq('all three match', [f.vol, f.total, f.error], [32500, 910000, undefined]);
    f = M.solveFuel('32.457', '279.9', '9085'); eq('all three, pump rounding ok', !!f.error, false);
    f = M.solveFuel('32.5', '280', '12000'); eq('all three mismatch', [!!f.error, f.field], [true, 'total']);
    eq('nothing typed', M.solveFuel('', '', '').field, 'vol'); eq('total only', !!M.solveFuel('', '', '5000').error, true); eq('price only', !!M.solveFuel('', '280', '').error, true);
    eq('bad fuel', M.solveFuel('abc', '', '').field, 'vol'); eq('bad price', M.solveFuel('30', 'x', '').field, 'price'); eq('bad total', M.solveFuel('30', '', '-1').field, 'total');
    eq('tiny total huge price', !!M.solveFuel('', '9999999', '0.01').error, true);

    // formatting
    eq('fmt 9,100', M.fmt(910000, 'Rs', L), 'Rs 9,100'); eq('fmt $45.50', M.fmt(4550, '$', L), '$45.50'); eq('fmt plain', M.fmt(910000, '', L), '9,100');
    eq('price whole', M.fmtPrice(280000, 'Rs', L), 'Rs 280'); eq('price 1.799', M.fmtPrice(1799, '$', L), '$1.799'); eq('price 279.50', M.fmtPrice(279500, '', L), '279.50');
    eq('rate', M.fmtRate(22.8877, 'Rs', L), 'Rs 22.89'); eq('tiny rate', M.fmtRate(0.0812, '$', L), '$0.081');
    eq('vol', M.fmtVol(32457, 'L', L), '32.457 L'); eq('odo', M.fmtOdo(453205, 'km', L), '45,320.5 km'); eq('inputNum', [M.inputNum(32500, 3), M.inputNum(453200, 1), M.inputNum(910000, 2)], ['32.5', '45320', '9100']);

    // fuel use units: 480 km on 40 L
    eq('km/L', M.fmtEco(480, 40, 'kmL', L), '12.0 km/L'); eq('L/100 km', M.fmtEco(480, 40, 'L100', L), '8.3 L/100 km');
    eq('mpg US', M.fmtEco(480, 40, 'mpgus', L), '28.2 mpg (US)'); eq('mpg UK', M.fmtEco(480, 40, 'mpguk', L), '33.9 mpg (UK)'); eq('miles/L', M.fmtEco(480, 40, 'miL', L), '7.5 miles/L');
    eq('no distance', M.ecoValue(0, 40, 'kmL'), null);
    eq('compare worse', M.compareWords(M.comparePct({ km: 480, L: 40 }, { km: 935, L: 75 })), '4% worse than your average');
    eq('compare better', M.compareWords(10), '10% better than your average'); eq('compare same', M.compareWords(0.3), 'about the same as your average');
    eq('unusual 200 km/L', M.unusual(2000, 10), true); eq('normal 12 km/L', M.unusual(480, 40), false);

    // the README situation: Ahmed's Honda City
    let n = 0; const fill = (date, o, v, total, full, extra) => Object.assign({ id: 'f' + (++n), t: 'fill', date, seq: n, du: 'km', odo: o * 10, vol: v * 1000, vu: 'L', total: total == null ? null : total * 100, full: full !== false, missed: false, note: '' }, extra || {});
    const car = { id: 'c1', name: 'Honda City', du: 'km', vu: 'L', eco: 'kmL', read: 'odo', entries: [
        fill('2026-09-01', 45000, 30, 8400), fill('2026-09-10', 45200, 15, 4200, false), fill('2026-09-18', 45455, 20, 5600), fill('2026-10-01', 45935, 40, 11600),
        { id: 's1', t: 'cost', date: '2026-10-05', seq: ++n, du: 'km', cat: 'Service', amount: 600000, odo: null, note: 'oil change' }] };
    let s = M.summary(car, T);
    eq('statuses', s.rows.map(r => r.status), ['first', 'partial', 'seg', 'seg']);
    eq('tank 1: 455 km on 35 L = 13.0 km/L', M.fmtEco(s.segs[0].km, s.segs[0].L, 'kmL', L), '13.0 km/L');
    eq('tank 2: 480 km on 40 L = 12.0 km/L', M.fmtEco(s.last.km, s.last.L, 'kmL', L), '12.0 km/L');
    eq('average 935 km / 75 L = 12.5 km/L', [Math.round(s.avg.km), s.avg.L, M.fmtEco(s.avg.km, s.avg.L, 'kmL', L)], [935, 75, '12.5 km/L']);
    eq('fuel cost per km 21,400 / 935 = 22.89', M.fmtRate(s.fuelPerKm.cents / 100 / s.fuelPerKm.km, 'Rs', L), 'Rs 22.89');
    eq('all costs per km 27,400 / 935 = 29.30', M.fmtRate(s.allPerKm.cents / 100 / s.allPerKm.km, 'Rs', L), 'Rs 29.30');
    eq('this month', [s.month.fuel, s.month.other, s.month.total], [1160000, 600000, 1760000]);
    eq('last month', [s.lastMonth.fuel, s.lastMonth.other, s.lastMonth.fills], [1820000, 0, 3]);
    eq('this year', s.year.total, 3580000);
    eq('row words seg', M.rowWords(s.rows[3], car, L).text, '12.0 km/L over 480 km');
    eq('row words first', /First full tank/.test(M.rowWords(s.rows[0], car, L).text), true);
    eq('summary text', M.summaryText({ cur: 'Rs' }, car, T, L).split('\n').slice(0, 9), ['Fuel log for Honda City, 14 Oct 2026', 'Last full tank: 12.0 km/L over 480 km (to 1 Oct)', 'Average fuel use: 12.5 km/L over 935 km',
        'Fuel cost per km: Rs 22.89', 'All costs per km: Rs 29.30 (fuel and other costs over 935 km)', 'This month: Rs 17,600 (fuel Rs 11,600, other Rs 6,000)', 'Last month: Rs 18,200 (fuel Rs 18,200, other Rs 0)', 'This year: Rs 35,800 (fuel Rs 29,800, other Rs 6,000)', '']);
    eq('entry line', M.entryLine(car.entries[3], s.rows[3], car, 'Rs', T, L), '1 Oct: Fill-up 40 L, Rs 11,600 (Rs 290 per litre), odometer 45,935 km, 12.0 km/L');

    // same car shown in L/100 km and miles: only the display changes
    const car2 = Object.assign({}, car, { du: 'mi', eco: 'L100' });
    s = M.summary(car2, T); eq('L/100 km display', M.fmtEco(s.last.km, s.last.L, 'L100', L), '8.3 L/100 km'); eq('distance in miles', M.fmtDist(s.last.km, 'mi', L), '298 miles');

    // a missed fill-up: that tank is skipped, the next one counts again
    n = 0; const m = { id: 'c', name: 'x', du: 'km', vu: 'L', eco: 'kmL', entries: [fill('2026-10-01', 1000, 40, 1), fill('2026-10-05', 1900, 30, 1, true, { missed: true }), fill('2026-10-09', 2300, 32, 1)] };
    s = M.summary(m, T); eq('missed statuses', s.rows.map(r => r.status), ['first', 'missed', 'seg']); eq('after missed: 400 km / 32 L', [s.segs.length, s.segs[0].km, s.segs[0].L], [1, 400, 32]);
    // part fill missed in the middle
    n = 0; const m2 = { id: 'c', name: 'x', du: 'km', vu: 'L', eco: 'kmL', entries: [fill('2026-10-01', 1000, 40, 1), fill('2026-10-05', 1300, 10, 1, false, { missed: true }), fill('2026-10-09', 1500, 32, 1)] };
    eq('missed part fill breaks that tank', M.summary(m2, T).rows.map(r => r.status), ['first', 'partial', 'missed']);
    // part fill before any full tank, unknown price
    n = 0; const m3 = { id: 'c', name: 'x', du: 'km', vu: 'L', eco: 'kmL', entries: [fill('2026-10-01', 1000, 10, null, false), fill('2026-10-02', 1100, 40, null), fill('2026-10-09', 1500, 32, null)] };
    s = M.summary(m3, T); eq('part first + no prices', [s.rows.map(r => r.status), s.fuelPerKm, s.segs[0].cost], [['partial-first', 'first', 'seg'], null, null]);
    eq('all costs flag unpriced', s.allPerKm.unpriced, true);
    // same odometer twice
    n = 0; const m4 = { id: 'c', name: 'x', du: 'km', vu: 'L', eco: 'kmL', entries: [fill('2026-10-01', 1000, 40, 1), fill('2026-10-01', 1000, 2, 1)] };
    eq('zero distance', M.summary(m4, T).rows[1].status, 'nodist');
    // empty car and one fill-up
    eq('empty car', [M.summary({ entries: [] }, T).fills, M.summary({ entries: [] }, T).avg, M.summary({ entries: [] }, T).allPerKm], [0, null, null]);
    n = 0; eq('one fill', [M.summary({ entries: [fill('2026-10-01', 1000, 40, 100)] }, T).last, M.summary({ entries: [fill('2026-10-01', 1000, 40, 100)] }, T).allPerKm], [null, null]);

    // trip meter readings add up
    n = 0; const tr = { id: 'c', name: 'x', du: 'km', vu: 'L', eco: 'kmL', entries: [fill('2026-10-01', 0, 40, 1, true, { odo: undefined, trip: 3000 }), fill('2026-10-05', 0, 30, 1, true, { odo: undefined, trip: 4200 })] };
    tr.entries.forEach(x => delete x.odo);
    s = M.summary(tr, T); eq('trip: 420 km on 30 L = 14.0', M.fmtEco(s.last.km, s.last.L, 'kmL', L), '14.0 km/L');
    // US units: 300 miles on 10 US gallons = 30 mpg
    n = 0; const us = { id: 'c', name: 'x', du: 'mi', vu: 'usgal', eco: 'mpgus', entries: [Object.assign(fill('2026-10-01', 12000, 10, 40), { du: 'mi', vu: 'usgal' }), Object.assign(fill('2026-10-08', 12300, 10, 40), { du: 'mi', vu: 'usgal' })] };
    s = M.summary(us, T); eq('US 30.0 mpg', M.fmtEco(s.last.km, s.last.L, 'mpgus', 'en-US'), '30.0 mpg (US)');
    eq('US cost per mile $0.13', M.fmtRate(s.fuelPerKm.cents / 100 / (s.fuelPerKm.km / M.KM.mi), '$', 'en-US'), '$0.13');

    // odometer checks against the fill-ups around it
    n = 0; const oc = { entries: [fill('2026-10-01', 1000, 40, 1), fill('2026-10-09', 1500, 32, 1)] };
    eq('lower than before', /lower than the reading at your fill-up on 9 Oct \(1,500 km\)/.test(M.odoProblem(oc, { id: 'n', date: '2026-10-12', seq: 99, du: 'km', odo: 9000 }, L, T)), true);
    eq('higher than later', /higher than the reading at your later fill-up on 9 Oct/.test(M.odoProblem(oc, { id: 'n', date: '2026-10-05', seq: 99, du: 'km', odo: 16000 }, L, T)), true);
    eq('in between ok', M.odoProblem(oc, { id: 'n', date: '2026-10-05', seq: 99, du: 'km', odo: 12000 }, L, T), '');
    eq('editing itself ok', M.odoProblem(oc, Object.assign({}, oc.entries[1], { odo: 14000 }), L, T), '');
    eq('trip skips check', M.odoProblem(oc, { id: 'n', date: '2026-10-12', seq: 99, du: 'km', trip: 10 }, L, T), '');
    eq('miles reading vs km log', M.odoProblem(oc, { id: 'n', date: '2026-10-12', seq: 99, du: 'mi', odo: 9400 }, L, T), '');

    // dates
    eq('prevMonth Jan', M.prevMonth('2026-01'), '2025-12'); eq('isDay 31 Feb', M.isDay('2026-02-31'), false); eq('isDay ok', M.isDay('2024-02-29'), true);

    // units by country
    eq('US', M.defaultUnits('en-US'), { du: 'mi', vu: 'usgal', eco: 'mpgus' }); eq('UK', M.defaultUnits('en-GB'), { du: 'mi', vu: 'L', eco: 'mpguk' });
    eq('Pakistan', M.defaultUnits('en-PK'), { du: 'km', vu: 'L', eco: 'kmL' }); eq('Germany', M.defaultUnits('de-DE'), { du: 'km', vu: 'L', eco: 'L100' }); eq('bare de', M.defaultUnits('de').eco, 'L100');

    // saved state is checked
    eq('null', M.normalize(null), null); eq('no cars', M.normalize({ cars: [] }), null); eq('string', M.normalize('x'), null);
    const bad = M.normalize({ cur: '<b>', carId: 'zz', cars: [{ id: 'a', name: '  Honda\n City  ', du: 'parsec', eco: 'x', entries: [
        { t: 'fill', date: '2026-10-01', vol: 40000, vu: 'L', odo: 10000, total: 500 }, { t: 'fill', date: 'yesterday', vol: 1, vu: 'L', odo: 1 }, { t: 'fill', date: '2026-10-01', vol: -5, vu: 'L', odo: 1 },
        { t: 'fill', date: '2026-10-02', vol: 1000, vu: 'pints', odo: 1 }, { t: 'fill', date: '2026-10-02', vol: 1000, vu: 'L' }, { t: 'cost', date: '2026-10-03', amount: 500, cat: 'Bribe' },
        { t: 'cost', date: '2026-10-03', amount: 1.5 }, { t: 'other' }, null, 7] }, null, 'x'] }, 'en-PK');
    eq('bad cur dropped', bad.cur, ''); eq('one car kept', bad.cars.length, 1); eq('name cleaned', bad.cars[0].name, 'Honda City'); eq('units fall back', [bad.cars[0].du, bad.cars[0].eco], ['km', 'kmL']);
    eq('only good entries', bad.cars[0].entries.map(x => x.t + ':' + (x.cat || x.vol)), ['fill:40000', 'cost:Other']); eq('carId fixed', bad.carId, 'a');
    eq('round trip', M.normalize(JSON.parse(JSON.stringify(Object.assign(M.emptyState('en-PK'), { cars: [car] })))).cars[0].entries.length, 5);
    eq('empty state', M.emptyState('en-US').cars[0], { id: 'c1', name: 'My car', du: 'mi', vu: 'usgal', eco: 'mpgus', read: 'odo', entries: [] });

    // CSV for a spreadsheet
    const c = M.csv(car, 'Rs').split('\r\n');
    eq('csv header', c[0].split(',').slice(0, 4), ['Car', 'Date', 'Type', 'Odometer']); eq('csv rows', c.length, 7);
    eq('csv fill row', c[4], 'Honda City,2026-10-01,Fill-up,45935,,km,40,litres,yes,no,11600.00,290.000,12.00,km/L,,,Rs');
    eq('csv cost row', c[5], 'Honda City,2026-10-05,Other cost,,,,,,,,6000.00,,,,Service,oil change,Rs');
    const q = M.csv({ name: 'Car, "red"', eco: 'kmL', entries: [{ id: 'x', t: 'cost', date: '2026-10-03', seq: 1, du: 'km', cat: 'Other', amount: 100, odo: null, note: 'a\nb' }] }, '').split('\r\n');
    eq('csv quotes', q[1].startsWith('"Car, ""red""",2026-10-03'), true);

    const msg = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = msg + '\n\n' + out.join('\n');
    else { console.log(out.filter(l => l.startsWith('FAIL')).join('\n')); console.log(msg); if (fail) process.exit(1); }
})();
