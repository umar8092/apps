// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.MRL;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const L = 'en-GB';
    const rd = s => C.parseReading(s).n, rerr = s => !!C.parseReading(s).error;
    const pr = s => C.parsePrice(s).n, perr = s => !!C.parsePrice(s).error;

    // typed meter readings (thousandths)
    eq('12345', rd('12345'), 12345000); eq('12,345', rd('12,345'), 12345000); eq('12345.6', rd('12345.6'), 12345600); eq('12345,6', rd('12345,6'), 12345600);
    eq('12.345,6', rd('12.345,6'), 12345600); eq('12 345', rd('12 345'), 12345000); eq('pasted nbsp', rd('12 345'), 12345000); eq('1,00,000 lakh', rd('1,00,000'), 100000000);
    eq('leading zeros 00123', rd('00123'), 123000); eq('zero allowed', rd('0'), 0); eq('0.345', rd('0.345'), 345); eq('12345 kWh', rd('12345 kWh'), 12345000); eq('trailing zeros 5.1000', rd('5.1000'), 5100);
    eq('blank', rerr(''), true); eq('minus', rerr('-5'), true); eq('words', rerr('abc'), true); eq('4 decimals', rerr('1.2345'), true); eq('huge', rerr('123456789012'), true);
    eq('max', rd('99999999.999'), 99999999999); eq('mistyped 1,2,3', rerr('1,2,3'), true); eq('two decimal marks', rerr('1.2.3'), true);
    // prices (ten-thousandths)
    eq('price 25', pr('25'), 250000); eq('price 0.2734', pr('0.2734'), 2734); eq('price Rs 23.5', pr('Rs 23.5'), 235000); eq('price £0.27', pr('£0.27'), 2700);
    eq('price 0', perr('0'), true); eq('price blank', perr(''), true); eq('price 5 decimals', perr('0.12345'), true); eq('price huge', perr('2000000'), true);
    eq('money 300', C.parseMoney('300').n, 30000); eq('money 12.50', C.parseMoney('12.50').n, 1250); eq('money 0 allowed', C.parseMoney('0').n, 0);
    eq('pct 17', C.parsePct('17').n, 1700); eq('pct 5.5%', C.parsePct('5.5%').n, 550); eq('pct 101', !!C.parsePct('101').error, true);
    eq('units 200', C.parseUnits('200').n, 200000); eq('units 0', !!C.parseUnits('0').error, true);

    // dates and bill periods
    const D = C.dayNum, S = C.dayStr;
    const per = (d, cd) => { const p = C.periodOf(D(d), cd); return [S(p.start), S(p.end)]; };
    eq('period day 5 on 20 Oct', per('2026-10-20', 5), ['2026-10-05', '2026-11-05']);
    eq('period day 5 on 3 Oct', per('2026-10-03', 5), ['2026-09-05', '2026-10-05']);
    eq('period on the reading day itself', per('2026-10-05', 5), ['2026-10-05', '2026-11-05']);
    eq('period day 1', per('2026-10-20', 1), ['2026-10-01', '2026-11-01']);
    eq('period day 31 in Feb', per('2027-02-28', 31), ['2027-02-28', '2027-03-31']);
    eq('period day 31 on 15 Feb', per('2027-02-15', 31), ['2027-01-31', '2027-02-28']);
    eq('period day 30 in leap Feb', per('2028-02-29', 30), ['2028-02-29', '2028-03-30']);
    eq('period over new year', per('2027-01-02', 10), ['2026-12-10', '2027-01-10']);
    eq('isDay rejects 31 Feb', C.isDay('2026-02-31'), false);

    // the main situation: Bilal, reading day 5, limit 200 units, three price steps and a fixed charge
    const bilal = {
        name: 'Electricity', unit: 'units', day: 5, limit: 200000, tax: 0, fixed: { c: 30000, per: 'bill' },
        price: { mode: 'steps', steps: [{ upTo: 100000, p: 100000 }, { upTo: 200000, p: 150000 }, { upTo: null, p: 220000 }], whole: false },
        readings: [{ id: 'a', d: '2026-09-05', v: 8000000 }, { id: 'b', d: '2026-10-05', v: 8186000 }, { id: 'c', d: '2026-10-12', v: 8236000 }, { id: 'd', d: '2026-10-19', v: 8334000 }]
    };
    const s = C.summary(bilal, '2026-10-20');
    eq('period', s.period, { start: '2026-10-05', end: '2026-11-05', days: 31 });
    eq('used so far 148 units', s.soFar, 148000); eq('exact', s.exact, true); eq('known days 14', s.knownDays, 14);
    eq('rate 148/14 a day (this period, 14 days)', Math.round(s.rate * 100) / 100, 10571.43); eq('rate from the period', s.rateFrom, 'period'); eq('days left 17', s.daysLeft, 17); eq('projected 148 + 17 x 10.571 = 327.714', s.projected, 327714);
    eq('allow 52 units over 17 days', Math.round(s.allow * 1000) / 1000, 3058.824); eq('will pass the limit', s.willPass, true); eq('passes on 24 Oct (52 / 10.57 = 4.9 days)', s.passOn, '2026-10-24');
    eq('bill so far: 100x10 + 48x15 + 300', s.billSoFar, { energy: 172000, fixed: 30000, tax: 0, total: 202000 });
    eq('bill at end: 1000 + 1500 + 127.714x22 + 300', s.billEnd, { energy: 530971, fixed: 30000, tax: 0, total: 560971 });
    eq('words: so far', C.fmtUnits(s.soFar, L), '148'); eq('words: rate', C.fmtRate(s.rate, L), '10.6'); eq('words: projected', C.fmtUnits(s.projected, L), '328');
    eq('words: allow', C.fmtRate(s.allow, L), '3.1'); eq('words: bill', C.fmtMoney(s.billEnd.total, 'Rs', 'en-US'), 'Rs 5,609.71');
    const h = C.history(bilal, '2026-10-20');
    eq('history: one finished period', h.length, 1);
    eq('history: Sep 5 to Oct 5, 186 units', [h[0].start, h[0].end, h[0].mu, h[0].part], ['2026-09-05', '2026-10-05', 186000, false]);
    eq('history: bill 1000 + 86x15 + 300 = 2590', h[0].bill.total, 259000);
    const rows = C.readingRows(bilal);
    eq('rows newest first, used 98 in 7 days', [rows[0].r.d, rows[0].used, rows[0].days], ['2026-10-19', 98000, 7]); eq('first row', rows[3].first, true);

    // early in a bill period (under 7 days of readings) the last 30 days are used: 8.24 a day
    const early = C.summary(Object.assign({}, bilal, { readings: bilal.readings.slice(0, 2) }), '2026-10-08');
    eq('early: no reading after the reading day yet, 186/30 = 6.2 a day', [early.rateFrom, early.rate, early.inPeriod, early.soFar], ['30', 6200, false, 0]);
    const bil2 = Object.assign({}, bilal, { readings: bilal.readings.concat([{ id: 'e', d: '2026-11-08', v: 8400000 }]) });
    const s2 = C.summary(bil2, '2026-11-08');
    eq('3 days into a period: last 30 days, 185.429 / 30', [s2.rateFrom, Math.round(s2.rate * 100) / 100], ['30', 6180.97]);
    eq('3 days into a period: 9.9 used since 5 Nov (8390.1 spread)', [s2.soFar, s2.exact], [9900, true]);
    // over the limit already
    const over = Object.assign({}, bilal, { limit: 100000 });
    eq('over by 48', C.summary(over, '2026-10-20').over, 48000);
    // limit not reached at this rate
    const low = Object.assign({}, bilal, { limit: 400000 });
    const sl = C.summary(low, '2026-10-20');
    eq('under the limit: will not pass', sl.willPass, false); eq('allow (400-148)/17', Math.round(sl.allow), 14824);

    // same price for every unit, whole-bill-at-the-top-step, tax and daily charge
    eq('flat 25 x 148', C.energyCost(148000, { mode: 'flat', flat: 250000 }), 370000);
    eq('flat 0.2734 x 312.5 = 85.44 (85.4375 rounds up)', C.energyCost(312500, { mode: 'flat', flat: 2734 }), 8544);
    const steps = { mode: 'steps', steps: [{ upTo: 100000, p: 100000 }, { upTo: 200000, p: 150000 }, { upTo: null, p: 220000 }] };
    eq('steps 100 exactly', C.energyCost(100000, steps), 100000); eq('steps 100.5', C.energyCost(100500, steps), 100750);
    eq('steps 0 units', C.energyCost(0, steps), 0); eq('steps 250', C.energyCost(250000, steps), 100000 + 150000 + 110000);
    const whole = Object.assign({}, steps, { whole: true });
    eq('whole: 150 all at 15', C.energyCost(150000, whole), 225000); eq('whole: 201 all at 22', C.energyCost(201000, whole), 442200); eq('whole: 100 at 10', C.energyCost(100000, whole), 100000);
    eq('no price: no bill', C.billFor({ price: { mode: 'none' } }, 100000, 30), null);
    eq('tax 17% on (2500+300)', C.billFor({ price: { mode: 'flat', flat: 250000 }, fixed: { c: 30000, per: 'bill' }, tax: 1700 }, 100000, 30), { energy: 250000, fixed: 30000, tax: 47600, total: 327600 });
    eq('daily charge 0.53 x 31 days', C.billFor({ price: { mode: 'flat', flat: 2734 }, fixed: { c: 53, per: 'day' }, tax: 0 }, 300000, 31).fixed, 1643);
    eq('half a cent rounds up', C.costOf(1000, 50), 1);
    eq('1,000,000 units at 1,000 stays exact', C.costOf(1000000000, 10000000), 100000000000);

    // only one reading, no readings
    eq('no readings', C.summary({ day: 1, readings: [], price: { mode: 'none' } }, '2026-10-20').count, 0);
    const one = C.summary({ day: 1, readings: [{ id: 'x', d: '2026-10-18', v: 5000 }], price: { mode: 'none' } }, '2026-10-20');
    eq('one reading: no rate yet', [one.count, one.rate, one.ago], [1, null, 2]);

    // readings started in the middle of the bill period: the start is estimated
    const mid = { day: 1, price: { mode: 'none' }, readings: [{ id: 'a', d: '2026-10-10', v: 1000000 }, { id: 'b', d: '2026-10-20', v: 1100000 }] };
    const sm = C.summary(mid, '2026-10-20');
    eq('mid: not exact', sm.exact, false); eq('mid: known 100 since 10 Oct', [sm.known, sm.knownFrom], [100000, '2026-10-10']);
    eq('mid: so far adds 9 days at 10 a day', sm.soFar, 190000); eq('mid: projected to 1 Nov', sm.projected, 310000);
    eq('mid: history empty (no finished period)', C.history(mid, '2026-10-20').length, 0);

    // last reading before this bill period started
    const old = { day: 1, price: { mode: 'none' }, readings: [{ id: 'a', d: '2026-09-01', v: 0 }, { id: 'b', d: '2026-09-21', v: 200000 }] };
    const so = C.summary(old, '2026-10-20');
    eq('old: no reading in this period', so.inPeriod, false); eq('old: so far 0, whole period ahead', [so.soFar, so.daysLeft, so.projected], [0, 31, 310000]);
    eq('old: September part covered', (h2 => [h2[0].part, h2[0].mu, h2[0].covered])(C.history(old, '2026-10-20')), [true, 300000, 20]);

    // a meter change (reset) is not counted as use
    const reset = { day: 1, price: { mode: 'none' }, readings: [{ id: 'a', d: '2026-10-01', v: 99990000 }, { id: 'b', d: '2026-10-05', v: 99998000 }, { id: 'c', d: '2026-10-06', v: 2000, reset: true }, { id: 'd', d: '2026-10-11', v: 12000 }] };
    eq('reset: use is 8 + 10, covered 4 + 5 days', C.usageBetween(reset.readings, -Infinity, Infinity), { mu: 18000, covered: 9 });
    const rr = C.readingRows(reset);
    eq('reset row is marked', rr[1].reset, true);
    eq('reset: not exact (1 day missing)', C.summary(reset, '2026-10-11').exact, false);

    // checking a new reading
    const ch = (r, id) => C.checkReading(bilal.readings, Object.assign({ today: '2026-10-20', loc: L }, r), id);
    eq('ok', ch({ d: '2026-10-20', v: 8340000 }), {});
    eq('same value is fine (away)', ch({ d: '2026-10-20', v: 8334000 }), {});
    eq('lower than before', ch({ d: '2026-10-20', v: 8300000 }).kind, 'low');
    eq('lower message names the date and reading', /19 Oct 2026 \(8,334\)/.test(ch({ d: '2026-10-20', v: 8300000 }).error), true);
    eq('lower but reset ticked', ch({ d: '2026-10-20', v: 5, reset: true }), {});
    eq('future', !!ch({ d: '2026-10-21', v: 8340000 }).error, true);
    eq('bad date', !!ch({ d: '2026-02-31', v: 1 }).error, true);
    eq('before 2000', !!ch({ d: '1999-12-31', v: 1 }).error, true);
    eq('out of order, higher than later one', ch({ d: '2026-10-15', v: 8400000 }).kind, 'high');
    eq('out of order, fits between', ch({ d: '2026-10-15', v: 8280000 }), {});
    eq('editing a reading to a new value', ch({ d: '2026-10-19', v: 8330000 }, 'd'), {});
    eq('typo warning: 10x the usual', ch({ d: '2026-10-20', v: 9334000 }).warn, true);

    // saved data
    eq('corrupt state', C.cleanState('nonsense'), null); eq('missing meters', C.cleanState({}), null);
    const cs = C.cleanState({ cur: 'Rs', meters: [{ id: 'm', name: ' Gas ', unit: 'm³', day: 40, price: { mode: 'steps', steps: [{ upTo: 5, p: 1 }] }, tax: -1, limit: 'x',
        readings: [{ d: '2026-10-01', v: 5 }, { d: '2026-10-01', v: 9 }, { d: 'bad', v: 1 }, { d: '2026-10-03', v: -1 }, { d: '2026-10-05', v: 3 }] }, { name: '', unit: 'x' }] });
    eq('clean: one meter kept, name trimmed', [cs.meters.length, cs.meters[0].name, cs.cur], [1, 'Gas', 'Rs']);
    eq('clean: bad day becomes 1, bad price none, bad tax/limit 0', [cs.meters[0].day, cs.meters[0].price.mode, cs.meters[0].tax, cs.meters[0].limit], [1, 'none', 0, 0]);
    eq('clean: duplicate date and bad rows dropped', cs.meters[0].readings.map(r => r.d), ['2026-10-01', '2026-10-05']);
    eq('clean: a drop becomes a meter change', cs.meters[0].readings[1].reset, true);
    eq('clean keeps good steps', C.cleanState({ meters: [Object.assign({ id: 'q' }, bilal)] }).meters[0].price, bilal.price);

    // words
    eq('reading words', C.fmtReading(12345600, L), '12,345.6'); eq('small units keep a decimal', C.fmtUnits(5400, L), '5.4'); eq('units 0', C.fmtUnits(0, L), '0');
    eq('money none', C.fmtMoney(202000, '', 'en-US'), '2,020'); eq('money $', C.fmtMoney(8544, '$', 'en-US'), '$85.44'); eq('price words', C.fmtPrice(2734, '£', 'en-US'), '£0.2734');
    eq('date words', C.fmtDate('2026-10-05', L), '5 Oct'); eq('date with year', C.fmtDate('2026-10-05', L, true), '5 Oct 2026');

    out.push('', pass + ' passed, ' + fail + ' failed');
    if (typeof document !== 'undefined' && document.getElementById('out')) document.getElementById('out').textContent = out.join('\n');
    else { console.log(out.filter(l => !l.startsWith('PASS')).join('\n')); if (fail && typeof process !== 'undefined') process.exitCode = 1; }
})();
