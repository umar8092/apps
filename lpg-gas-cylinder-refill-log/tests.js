// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.LPG;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const L = 'en-GB';
    const g = s => C.parseGas(s).n, gerr = s => !!C.parseGas(s).error, m = s => C.parseMoney(s).n, merr = s => !!C.parseMoney(s).error;

    // typed amounts
    eq('11.8', g('11.8'), 11800); eq('11,8', g('11,8'), 11800); eq('14.2 kg', g('14.2 kg'), 14200); eq('20 lb', g('20 lb'), 20000); eq('45.4kg', g('45.4kg'), 45400);
    eq('0.5', g('0.5'), 500); eq('gas blank', gerr(''), true); eq('gas zero', gerr('0'), true); eq('gas minus', gerr('-3'), true); eq('gas words', gerr('full'), true);
    eq('gas 4 decimals', gerr('1.2345'), true); eq('gas huge', gerr('5000'), true);
    eq('money 3200', m('3200'), 320000); eq('money 3,162.40', m('3,162.40'), 316240); eq('money Rs 3162.4', m('Rs 3162.4'), 316240); eq('money 1,00,000 lakh', m('1,00,000'), 10000000);
    eq('money pasted nbsp', m('3 162'), 316200); eq('money 0 allowed', m('0'), 0); eq('money minus', merr('-50'), true); eq('money 3 decimals', merr('1.2345'), true); eq('money words', merr('abc'), true);
    eq('days 25', C.parseDays('25').n, 25); eq('days "30 days"', C.parseDays('30 days').n, 30); eq('days 0', !!C.parseDays('0').error, true); eq('days 2.5', !!C.parseDays('2.5').error, true); eq('days 731', !!C.parseDays('731').error, true); eq('days blank', !!C.parseDays('').error, true);

    // dates
    eq('isDay 31 Feb', C.isDay('2026-02-31'), false); eq('isDay ok', C.isDay('2028-02-29'), true); eq('addDays over year', C.addDays('2026-12-30', 5), '2027-01-04'); eq('diff', C.diff('2026-10-10', '2026-11-05'), 26);
    eq('inDays', [C.inDays(0), C.inDays(1), C.inDays(9), C.inDays(-2)], ['today', 'tomorrow', 'in 9 days', '2 days ago']);

    // the main situation: Ayesha's 11.8 kg kitchen cylinder, refill 2 days before, today 27 Oct 2026
    const T = '2026-10-27';
    const ayesha = { id: 'k', name: 'Kitchen', size: 11800, unit: 'kg', lead: 2, spare: false, refills: [
        { id: 'a', d: '2026-05-15', g: 11800, c: 283200 }, { id: 'b', d: '2026-06-10', g: 11800, c: 283200 }, { id: 'c', d: '2026-07-06', g: 11800, c: 283200 },
        { id: 'd', d: '2026-07-24', g: 11800, c: 295000 }, { id: 'e', d: '2026-08-19', g: 11800, c: 306800 }, { id: 'f', d: '2026-09-14', g: 11800, c: 316240 },
        { id: 'h', d: '2026-10-10', g: 11800, c: 316240 }] };
    let a = C.analyse(ayesha, T);
    eq('rate from the last 3 cylinders', a.rate, { g: 35400, d: 78, n: 3, typed: false });
    eq('a full one lasts 26 days', a.fullDays, 26);
    eq('likely empty 5 Nov', a.emptyDay, '2026-11-05'); eq('in 9 days', a.daysLeft, 9); eq('book by 3 Nov', a.bookDay, '2026-11-03'); eq('status ok', a.status, 'ok');
    eq('about 4.085 kg left (11.8 - 17 x 0.4538)', a.left, 4085); eq('35% left', a.leftPct, 35);
    eq('price 268 a kg', a.price.ppu, 26800); eq('up 12% since 15 May (240)', a.price.trend, { pct: 12, since: '2026-05-15', was: 24000 });
    eq('about 3,649 a month (268 x 35.4/78 x 30)', a.month, 364900);
    eq('spent in October', a.spentMonth, { c: 316240, n: 1 }); eq('spent this year', a.spentYear, { c: 2083880, n: 7 });
    const byId = id => a.rows.find(x => x.r.id === id);
    eq('7 Jul refill flagged: 18 days, usual 26', byId('c').flag, { kind: 'short', usual: 26, by: 8 });
    eq('the others are not flagged', ['a', 'b', 'd', 'e', 'f'].map(i => byId(i).flag), [null, null, null, null, null]);
    eq('lasted days', ['a', 'b', 'c', 'd', 'e', 'f'].map(i => byId(i).days), [26, 26, 18, 26, 26, 26]);
    eq('current in use 17 days', [byId('h').inUse, byId('h').running], [true, 17]);
    eq('rows newest first', a.rows[0].r.id, 'h');
    // the booking day passed: status due
    eq('due on 3 Nov', C.analyse(ayesha, '2026-11-03').status, 'due');
    eq('due today on 5 Nov', [C.analyse(ayesha, '2026-11-05').status, C.analyse(ayesha, '2026-11-05').daysLeft], ['due', 0]);
    eq('late on 7 Nov, nothing left', [C.analyse(ayesha, '2026-11-07').status, C.analyse(ayesha, '2026-11-07').left], ['late', 0]);
    eq('refill on the empty day itself (lead 0)', C.analyse(Object.assign({}, ayesha, { lead: 0 }), '2026-11-04').bookDay, '2026-11-05');

    // ran out today, then the refill came 3 days later: the gap does not count as use
    const ro = JSON.parse(JSON.stringify(ayesha)); ro.refills[6].out = '2026-11-04';
    a = C.analyse(ro, '2026-11-05');
    eq('empty since 4 Nov', [a.status, a.emptySince, a.emptyDays], ['empty', '2026-11-04', 1]);
    ro.refills.push({ id: 'i', d: '2026-11-07', g: 11800 });
    a = C.analyse(ro, '2026-11-07');
    eq('lasted 25 days, then 3 days without gas', [a.rows[1].days, a.rows[1].gap], [25, 3]);
    eq('new rate: 26 + 26 + 25 days', a.rate, { g: 35400, d: 77, n: 3, typed: false });
    eq('no price typed: amount assumed and no price', [a.rows[0].assumed, a.rows[0].ppu], [false, null]);

    // first use: no finished cylinder, nothing typed
    const first = { id: 'x', name: 'Heater', size: 11800, unit: 'kg', lead: 2, spare: false, refills: [{ id: 'p', d: '2026-10-20' }] };
    a = C.analyse(first, T);
    eq('learning, in use 7 days', [a.status, a.rate, a.cur.running, a.cur.assumed, a.cur.g], ['learning', null, 7, true, 11800]);
    eq('no price: no money lines', [a.price, a.month, a.spentYear], [undefined, undefined, { c: 0, n: 0 }]);
    // first use with "usually lasts 12 days" typed
    first.usual = 12; a = C.analyse(first, T);
    eq('typed 12 days: empty 1 Nov', [a.status, a.rate.typed, a.emptyDay, a.daysLeft, a.bookDay], ['ok', true, '2026-11-01', 5, '2026-10-30']);
    // a partial refill: 6 kg in an 11.8 kg cylinder lasts about half as long
    first.refills[0].g = 6000; a = C.analyse(first, T);
    eq('6 kg partial at 11.8 kg per 12 days: 6 days', [a.emptyDay, a.status], ['2026-10-26', 'late']);
    // empty list
    a = C.analyse({ id: 'e', name: 'E', size: 11800, unit: 'kg', lead: 2, refills: [] }, T);
    eq('no refills yet', [a.status, a.count, a.rows.length], ['start', 0, 0]);

    // winter: the heater makes every cylinder go faster; the usual adapts within 3 cylinders and stops flagging
    const w = { id: 'w', name: 'Kitchen', size: 11800, unit: 'kg', lead: 2, refills: [] };
    ['2026-08-01', '2026-08-27', '2026-09-22', '2026-10-18', '2026-11-05', '2026-11-23', '2026-12-11', '2026-12-29'].forEach((d, i) => w.refills.push({ id: 'w' + i, d }));
    a = C.analyse(w, '2026-12-30');
    eq('winter flags: first fast one only', a.rows.slice().reverse().map(x => x.flag ? x.flag.kind[0] : '-').join(''), '---s----');
    eq('winter usual is 18 days now', a.fullDays, 18);
    // a long gap (forgot to log): flagged long
    const gap = { id: 'g', name: 'K', size: 11800, unit: 'kg', lead: 2, refills: [{ id: 1, d: '2026-01-01' }, { id: 2, d: '2026-01-27' }, { id: 3, d: '2026-02-22' }, { id: 4, d: '2026-05-01' }, { id: 5, d: '2026-05-10' }] };
    a = C.analyse(gap, '2026-05-12');
    eq('68 days is flagged long (usual 26)', a.rows[2].flag, { kind: 'long', usual: 26, by: 42 });
    eq('the gap is left out of the usual: 9 days after it is short', [a.rows[1].flag && a.rows[1].flag.kind, a.rate.d], ['short', 61]);
    // odd cents: 3,162.37 for 11.8 kg = 267.997 -> 268.00; 1,000 for 3 kg = 333.33
    eq('price per kg rounds to the cent', [C.perUnit(316237, 11800), C.perUnit(100000, 3000)], [26800, 33333]);
    // pounds: a 20 lb BBQ tank
    const bbq = { id: 'b', name: 'BBQ', size: 20000, unit: 'lb', lead: 0, refills: [{ id: 1, d: '2026-06-01', c: 2499 }, { id: 2, d: '2026-07-15', c: 2599 }, { id: 3, d: '2026-08-29', c: 2599 }, { id: 4, d: '2026-10-01', c: 2699 }] };
    a = C.analyse(bbq, '2026-10-05');
    eq('20 lb tank: 1.35 a lb, 122 days for 60 lb = 41 days', [a.price.ppu, a.fullDays, a.emptyDay], [135, 41, '2026-11-11']);
    eq('fmtGas lb', C.fmtGas(20000, 'lb', L), '20 lb');

    // checking a refill
    const chk = (r, id) => { const e = C.checkRefill(ayesha, r, T, id); return e ? e.field : null; };
    eq('ok refill', chk({ d: '2026-10-26' }), null);
    eq('future date', chk({ d: '2026-10-28' }), 'd'); eq('bad date', chk({ d: '2026-02-31' }), 'd'); eq('same day as another', chk({ d: '2026-10-10' }), 'd');
    eq('same day is fine when editing that one', chk({ d: '2026-10-10' }, 'h'), null);
    eq('more than the cylinder holds', chk({ d: '2026-10-26', g: 15000 }), 'g'); eq('a little over is fine (12 kg)', chk({ d: '2026-10-26', g: 12000 }), null);
    eq('ran out before put on', chk({ d: '2026-10-10', out: '2026-10-09' }, 'h'), 'out');
    eq('ran out after the next refill', chk({ d: '2026-09-14', out: '2026-10-12' }, 'f'), 'out');
    eq('ran out on the next refill day is fine', chk({ d: '2026-09-14', out: '2026-10-10' }, 'f'), null);
    eq('ran out in the future', chk({ d: '2026-10-10', out: '2026-10-30' }, 'h'), 'out');

    // words
    eq('money', [C.fmtMoney(316240, '', L), C.fmtMoney(364900, 'Rs', L), C.fmtMoney(2499, '$', L), C.fmtMoney(0, '', L)], ['3,162.40', 'Rs 3,649', '$24.99', '0']);
    eq('dates', [C.fmtDate('2026-11-05', L), C.fmtDate('2026-11-05', L, 'wd'), C.fmtDate('2026-11-05', L, true)], ['5 Nov', 'Thu 5 Nov', '5 Nov 2026']);
    eq('gas', [C.fmtGas(11800, 'kg', L), C.fmtGas(4085, 'kg', L, 1)], ['11.8 kg', '4.1 kg']);

    // saved data
    eq('clean keeps good data', C.cleanState({ cur: 'Rs', cyls: [ayesha] }).cyls[0].refills.length, 7);
    eq('clean rejects junk', [C.cleanState(null), C.cleanState({}), C.cleanState({ cyls: 'x' })], [null, null, null]);
    eq('clean drops a bad cylinder', C.cleanState({ cyls: [{ name: '', size: 1, unit: 'kg' }, { name: 'A', size: -1, unit: 'kg' }, { name: 'B', size: 5000, unit: 'gal' }] }).cyls.length, 0);
    const dirty = C.cleanState({ cyls: [{ name: 'K', size: 11800, unit: 'kg', lead: 99, usual: 'x', refills: [{ d: '2026-01-01', g: 99999, c: 5 }, { d: 'nope' }, { d: '2026-01-02', c: -1 }, { d: '2026-01-03', g: 11800, c: 300000, out: '2026-02-01' }, { d: '2026-01-20' }, { d: '2026-01-20' }] }] }).cyls[0];
    eq('clean fixes bad fields', [dirty.lead, dirty.usual, dirty.refills.length, dirty.refills[0].out], [2, undefined, 2, undefined]);
    eq('clean name trimmed and cut', C.cleanCyl({ name: '  ' + 'x'.repeat(60), size: 1000, unit: 'kg' }).name.length, 40);

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = summary + '\n\n' + out.join('\n');
    else { out.filter(l => l.startsWith('FAIL')).forEach(l => console.log(l)); console.log(summary); if (fail) process.exitCode = 1; }
})();
