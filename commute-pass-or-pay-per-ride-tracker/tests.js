// Logic checks for core.js. Run: node tests.js  (or open test.html in a browser)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.CommuteCore;
    let pass = 0, failed = 0; const out = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); } };

    // ---- money and numbers
    eq(C.parseMoney('80').value, 8000, '80');
    eq(C.parseMoney('2.5').value, 250, '2.5');
    eq(C.parseMoney('1,200.75').value, 120075, 'grouped');
    eq(C.parseMoney(' 3 000 ').value, 300000, 'spaces');
    eq(C.parseMoney('.5').value, 50, '.5');
    eq(C.parseMoney('0').value, 0, 'zero is allowed');
    eq(!!C.parseMoney('').empty, true, 'blank');
    eq(!!C.parseMoney('-5').error, true, 'negative');
    eq(!!C.parseMoney('2.555').error, true, '3 decimals');
    eq(!!C.parseMoney('abc').error, true, 'text');
    eq(!!C.parseMoney('.').error, true, 'just a dot');
    eq(!!C.parseMoney('100000000').error, true, 'too large');
    eq(C.parseMoney('99999999.99').value, 9999999999, 'largest');
    eq(C.money(304000, ''), '3,040', 'plain');
    eq(C.money(250, '$'), '$2.50', 'symbol');
    eq(C.money(8000, 'Rs'), 'Rs 80', 'letters get a space');
    eq(C.money(-26000, '€'), '-€260', 'negative');
    eq(C.money(9999999999, ''), '99,999,999.99', 'huge');
    eq(C.parseCount('12', 1, 50).value, 12, 'count'); eq(!!C.parseCount('0', 1, 50).error, true, 'count 0'); eq(!!C.parseCount('2.5', 1, 50).error, true, 'count decimal');
    eq(C.ordinal(1) + C.ordinal(2) + C.ordinal(3) + C.ordinal(11) + C.ordinal(22) + C.ordinal(38), '1st2nd3rd11th22nd38th', 'ordinals');

    // ---- dates
    eq(C.addDays('2026-10-30', 29), '2026-11-28', '30-day pass end');
    eq(C.addDays('2028-02-28', 1), '2028-02-29', 'leap day');
    eq(C.monthEnd('2026-02-10'), '2026-02-28', 'Feb end');
    eq(C.addMonths('2026-12', 1), '2027-01', 'next month over new year');
    eq(C.shortDate('2026-10-30', '2026-10-30'), 'Fri 30 Oct', 'short date');
    eq(C.shortDate('2027-01-04', '2026-10-30'), 'Mon 4 Jan 2027', 'other year');
    eq(C.isDate('2026-02-30'), false, '30 Feb is not a date');
    eq(C.passWindow({ kind: 'days', days: 7 }, '2026-10-29'), { from: '2026-10-29', to: '2026-11-04' }, 'weekly window');
    eq(C.passWindow({ kind: 'month' }, '2026-10-15'), { from: '2026-10-15', to: '2026-10-31' }, 'calendar month bought mid-month');

    // ---- Ayesha's October: metro 80 a ride, there and back on 19 weekdays (off 12, 13 and 26 Oct)
    const OFF = ['2026-10-12', '2026-10-13', '2026-10-26'];
    function october(extra) {
        const s = C.emptyState();
        s.fares = [{ id: 'f1', name: 'Metro', price: 8000 }];
        s.passes = [{ id: 'p1', name: 'Monthly pass', price: 300000, kind: 'month', days: 30, rides: 10, covers: null }];
        s.pace.fare = 'f1';
        for (let d = '2026-10-01'; d <= '2026-10-31'; d = C.addDays(d, 1)) {
            const w = C.weekday(d); if (w === 0 || w === 6 || OFF.includes(d)) continue;
            s.rides.push({ id: 'r' + d, date: d, fareId: 'f1', fareName: 'Metro', price: 8000, n: 2 });
        }
        return Object.assign(s, extra || {});
    }
    let s = october(), rep = C.monthReport(s, '2026-10', '2026-11-02');
    eq([rep.rides, rep.travelDays, rep.perRide], [38, 19, 304000], '38 rides on 19 days = 3,040');
    eq(C.monthHeadline(rep, ''), 'October: 38 rides, 3,040 paying per ride', 'headline');
    eq(C.monthVerdict(rep, '').text, 'The Monthly pass would have saved 40', 'monthly saves 40');
    eq(C.optionText(rep.cmp.options[0], rep.perRide, ''), 'Monthly pass: 1 pass = 3,000, saves 40', 'monthly line');
    // during October the wording is "would save"
    rep = C.monthReport(s, '2026-10', '2026-10-31');
    eq(C.monthHeadline(rep, ''), 'October so far: 38 rides, 3,040 paying per ride', 'so far');
    eq(C.monthVerdict(rep, '').text, 'The Monthly pass would save 40', 'current month wording');

    // weekly pass 450 (7 days from any day): worked by hand = 4 passes + 29 and 30 Oct paid (320) = 2,120
    s = october(); s.passes.push({ id: 'p2', name: 'Weekly pass', price: 45000, kind: 'days', days: 7, rides: 10, covers: null });
    // 10-ride card 700 = 70 a ride: 38 rides x 70 = 2,660 (4 cards, 2 rides left)
    s.passes.push({ id: 'p3', name: '10-ride card', price: 70000, kind: 'rides', days: 30, rides: 10, covers: null });
    rep = C.monthReport(s, '2026-10', '2026-11-02');
    const wk = rep.cmp.options[1], cd = rep.cmp.options[2];
    eq([wk.cost, wk.count, wk.paid], [212000, 4, 32000], 'weekly: 4 passes + 320');
    eq(C.optionText(wk, rep.perRide, ''), 'Weekly pass: 4 passes + 320 paid per ride = 2,120, saves 920', 'weekly line');
    eq([cd.cost, cd.count, cd.left], [266000, 4, 2], 'card 2,660');
    eq(C.optionText(cd, rep.perRide, ''), '10-ride card: 38 rides on it at 70 a ride = 2,660, saves 380 (4 cards, 2 rides left for later)', 'card line');
    eq(rep.cmp.best.pass.id, 'p2', 'weekly is cheapest');
    eq(C.monthVerdict(rep, '').text, 'The Weekly pass would have saved 920', 'verdict weekly');

    // ---- a quiet month: 5 rides of 80 = 400
    s = october(); s.rides = [{ id: 'a', date: '2026-11-03', fareId: 'f1', fareName: 'Metro', price: 8000, n: 2 }, { id: 'b', date: '2026-11-04', fareId: 'f1', fareName: 'Metro', price: 8000, n: 3 }];
    rep = C.monthReport(s, '2026-11', '2026-12-01');
    eq(C.monthVerdict(rep, '').text, 'Paying per ride was cheapest: the Monthly pass would have cost 2,600 more', 'pay per ride wins');
    eq(C.optionText(rep.cmp.options[0], rep.perRide, ''), 'Monthly pass: 1 pass = 3,000, 2,600 more', 'forced monthly line');
    // exactly the same cost
    s.passes[0].price = 40000; rep = C.monthReport(s, '2026-11', '2026-12-01');
    eq(C.monthVerdict(rep, '').text, 'Paying per ride and the Monthly pass cost the same', 'tie goes to paying per ride');
    // a card that is not cheaper per ride: 10 rides for 900 with an 80 fare
    s = october(); s.passes = [{ id: 'c', name: '10-ride card', price: 90000, kind: 'rides', days: 30, rides: 10, covers: null }];
    rep = C.monthReport(s, '2026-10', '2026-11-02');
    eq(C.monthVerdict(rep, '').text, 'Paying per ride was cheapest: buying the 10-ride card would have cost 380 more', 'dear card');
    // card rate with odd cents: 3 rides for 10.00 = about 3.33
    eq(C.cardRate({ price: 1000, rides: 3 }, '$'), 'about $3.33', 'card rate rounding');

    // ---- empty month, no passes priced, zero fare
    s = october(); rep = C.monthReport(s, '2026-09', '2026-10-30');
    eq([rep.rides, C.monthHeadline(rep, ''), C.monthVerdict(rep, '')], [0, 'No rides logged in September', null], 'empty month');
    rep = C.monthReport(s, '2026-11', '2026-10-30');
    eq(C.monthHeadline(rep, ''), 'No rides logged for November', 'future month');
    s.passes[0].price = null; rep = C.monthReport(s, '2026-10', '2026-11-02');
    eq([rep.cmp.options.length, C.monthVerdict(rep, '')], [0, null], 'no priced pass: no verdict');
    s = october(); s.rides.forEach(r => r.price = 0); rep = C.monthReport(s, '2026-10', '2026-11-02');
    eq(C.monthVerdict(rep, '').text, 'Paying per ride was cheapest: the Monthly pass would have cost 3,000 more', 'free rides');

    // ---- two routes, a pass that covers only one, and a fare rise mid-month
    s = C.emptyState();
    s.fares = [{ id: 'm', name: 'Metro', price: 8000 }, { id: 'b', name: 'Bus to gym', price: 5000 }];
    s.passes = [{ id: 'p', name: 'Metro monthly', price: 200000, kind: 'month', days: 30, rides: 10, covers: ['m'] }];
    for (let i = 1; i <= 15; i++) s.rides.push({ id: 'm' + i, date: '2026-10-' + String(i).padStart(2, '0'), fareId: 'm', fareName: 'Metro', price: i > 10 ? 9000 : 8000, n: 2 });
    s.rides.push({ id: 'g', date: '2026-10-05', fareId: 'b', fareName: 'Bus to gym', price: 5000, n: 2 });
    rep = C.monthReport(s, '2026-10', '2026-11-01');
    // metro: 20 x 80 + 10 x 90 = 2,500; bus 100; total 2,600. With the pass: 2,000 + 100 = 2,100
    eq([rep.perRide, rep.cmp.options[0].cost, rep.cmp.options[0].paid], [260000, 210000, 10000], 'pass covers one route only');
    eq(C.optionText(rep.cmp.options[0], rep.perRide, ''), 'Metro monthly: 1 pass + 100 paid per ride = 2,100, saves 500', 'route line');

    // ---- bought passes: what was spent and whether it paid
    s = october(); s.bought = [{ id: 'b1', passId: 'p1', name: 'Monthly pass', price: 300000, kind: 'month', days: 30, rides: 10, covers: null, start: '2026-10-01' }];
    rep = C.monthReport(s, '2026-10', '2026-11-02');
    eq([rep.spent, rep.passSpend, rep.notCovered, rep.anyBought], [300000, 300000, 0, true], 'spent = the pass');
    let bs = C.boughtStatus(s, '2026-11-02', '');
    eq(bs[0].lines, ['1 Oct to 31 Oct: 38 rides on the pass', 'Worth it: paying per ride would have cost 3,040, so it saved 40'], 'pass ended, worth it');
    // still running on 20 Oct: rides up to 20 Oct logged = 1,2,5,6,7,8,9,14,15,16,19,20 = 12 days = 24 rides = 1,920
    s.rides = s.rides.filter(r => r.date <= '2026-10-20');
    bs = C.boughtStatus(s, '2026-10-20', '');
    eq(bs[0].state, 'active', 'active');
    eq(bs[0].lines, ['1 Oct to 31 Oct (12 days left, today included): 24 rides so far, worth 1,920 paying per ride', '1,080 more in rides to pay for itself: about 14 more rides at 80 by Sat 31 Oct'], 'active pass progress');
    // a ride card used on 7 rides, 3 left; the card covers rides from its start only
    s = october(); s.bought = [{ id: 'k', passId: 'p3', name: '10-ride card', price: 70000, kind: 'rides', days: 30, rides: 10, covers: null, start: '2026-10-28' }];
    bs = C.boughtStatus(s, '2026-10-30', '');
    eq(bs[0].lines, ['6 of 10 rides used, 4 rides left', 'So far the rides on it would have cost 480 paying per ride'], 'card in use');
    rep = C.monthReport(s, '2026-10', '2026-10-30');
    eq([rep.passSpend, rep.notCovered, rep.spent], [70000, 32 * 8000, 70000 + 32 * 8000], 'card: spent = card + rides not on it');
    // used up
    s.bought[0].start = '2026-10-01'; bs = C.boughtStatus(s, '2026-10-30', '');
    eq(bs[0].lines, ['10 of 10 rides used', 'Worth it: the 10 rides would have cost 800 paying per ride, so it saved 100'], 'card used up');
    // two passes: the first bought uses the rides first; the second (lost card, bought again) only gets what is left
    s = october(); s.bought = [{ id: 'x', passId: 'p1', name: 'Monthly pass', price: 300000, kind: 'month', covers: null, days: 30, rides: 10, start: '2026-10-01' },
                               { id: 'y', passId: 'p1', name: 'Monthly pass', price: 300000, kind: 'month', covers: null, days: 30, rides: 10, start: '2026-10-15' }];
    s = C.validate(s);
    bs = C.boughtStatus(s, '2026-11-02', '');
    eq([bs[0].used, bs[1].used], [38, 0], 'lost card: rides counted once');
    eq(C.monthReport(s, '2026-10', '2026-11-02').spent, 600000, 'lost card: both prices spent');

    // a pass bought before a second fare was added follows what the pass on offer covers
    s = october(); s.fares.push({ id: 'bus', name: 'Bus', price: 5000 }); s.rides.push({ id: 'bus1', date: '2026-10-05', fareId: 'bus', fareName: 'Bus', price: 5000, n: 2 });
    s.bought = [{ id: 'b1', passId: 'p1', name: 'Monthly pass', price: 300000, kind: 'month', days: 30, rides: 10, covers: null, start: '2026-10-01' }];
    eq(C.monthReport(s, '2026-10', '2026-11-02').notCovered, 0, 'covers everything by default');
    s.passes[0].covers = ['f1'];
    eq(C.monthReport(s, '2026-10', '2026-11-02').notCovered, 10000, 'bus no longer on the pass');
    s.passes = []; eq(C.monthReport(s, '2026-10', '2026-11-02').notCovered, 0, 'pass deleted: the bought copy decides');

    // ---- looking ahead from Fri 30 Oct 2026: Mon to Fri, 2 a day, 80
    s = october(); s.passes.push({ id: 'p2', name: 'Weekly pass', price: 45000, kind: 'days', days: 7, rides: 10, covers: null });
    let plan = C.nextMonthPlan(s, '2026-10-30');
    eq([plan.ym, plan.days, plan.rides, plan.perRide], ['2026-11', 21, 42, 336000], 'November: 21 weekdays, 42 rides, 3,360');
    eq(plan.best.pass.id, 'p2', 'weekly best for November');
    s.pace.off = 3; plan = C.nextMonthPlan(s, '2026-10-30');
    eq([plan.days, plan.rides, plan.perRide], [18, 36, 288000], '3 days off');
    s.pace.wd = [0, 1, 2, 3, 4]; s.pace.off = 0; plan = C.nextMonthPlan(s, '2026-10-30');
    eq(plan.days, 22, 'Sun to Thu week: 22 days in November 2026 (5 Sundays, 5 Mondays)');
    s.pace.wd = []; plan = C.nextMonthPlan(s, '2026-10-30');
    eq([plan.rides, C.planHeadline(plan, '')], [0, 'No travel days in November with your usual days'], 'no days ticked');
    s = october(); plan = C.nextMonthPlan(s, '2026-10-30');
    eq(C.planHeadline(plan, ''), 'Buy the Monthly pass for November: saves about 360', 'plan headline monthly');
    s.pace.perDay = 1; plan = C.nextMonthPlan(s, '2026-10-30');
    eq(C.planHeadline(plan, ''), 'Pay per ride in November: no pass would save money', 'one ride a day');
    s.fares[0].price = null; plan = C.nextMonthPlan(s, '2026-10-30');
    eq(plan.noFare, true, 'no fare yet');

    // buying today: a 30-day pass of 3,000 bought Fri 30 Oct, Mon to Fri: 21 weekdays to 28 Nov = 42 rides = 3,360, pays at 38 rides
    s = october(); s.rides = []; s.passes = [{ id: 'd', name: '30-day pass', price: 300000, kind: 'days', days: 30, rides: 10, covers: null }];
    let lines = C.buyTodayLines(s, '2026-10-30', '');
    eq(lines[0].text, 'Bought today (today to Sat 28 Nov): about 42 rides at your usual pace, 3,360 paying per ride. Worth it: saves about 360. It pays for itself at 38 rides, around Wed 25 Nov.', 'buy today 30-day');
    // rides already logged today are paid already
    s.rides = [{ id: 't', date: '2026-10-30', fareId: 'f1', fareName: 'Metro', price: 8000, n: 2 }];
    lines = C.buyTodayLines(s, '2026-10-30', '');
    eq(lines[0].rides, 40, 'today already paid');
    // monthly pass bought on the 30th: only 2 days left
    s = october(); s.rides = []; lines = C.buyTodayLines(s, '2026-10-30', '');
    eq(lines[0].text, 'Bought today (today to Sat 31 Oct): about 2 rides at your usual pace, 160 paying per ride. Not worth it: about 2,840 more than paying per ride. You would need 38 rides to make it pay.', 'monthly bought late');
    // last day of the month
    s.passes[0].kind = 'month'; lines = C.buyTodayLines(s, '2026-10-31', '');
    eq(lines[0].text, 'Bought today (today only): no more travel days before it ends at your usual pace, so it would not pay for itself.', 'Sat 31 Oct: no travel days left');
    lines = C.buyTodayLines(s, '2026-11-30', '');
    eq(lines[0].text.slice(0, 43), 'Bought today (today only): about 2 rides at', 'Mon 30 Nov: today only, 2 rides');
    s.passes = [{ id: 'k', name: '10-ride card', price: 70000, kind: 'rides', days: 30, rides: 10, covers: null }];
    lines = C.buyTodayLines(s, '2026-10-30', '');
    eq(lines[0].text, 'Worth it if you use all 10 rides: they would cost 800 paying per ride, so it saves 100. It pays for itself at the 9th ride.', 'card buy today');
    s.passes[0].price = 80000; eq(C.buyTodayLines(s, '2026-10-30', '')[0].text, 'The same as paying per ride: 10 × 80 = 800.', 'card same');
    s.passes[0].covers = []; eq(C.buyTodayLines(s, '2026-10-30', '')[0].text, 'Does not cover your usual ride (Metro).', 'not covered');
    s.passes[0].covers = null; s.fares[0].price = 0; eq(C.buyTodayLines(s, '2026-10-30', '')[0].verdict, 'no', 'free ride');

    // ---- recent pace
    s = october(); eq(C.recentPace(s, '2026-10-31'), { rides: 34, days: 17, perWeek: 8.5 }, 'last 4 weeks: 4 to 31 Oct (17 travel days)');

    // ---- copy text and CSV
    s = october(); let t = C.summaryText(s, '2026-10', '2026-10-30');
    eq(t.split('\n').slice(0, 5), ['Commute costs: October 2026', 'October so far: 38 rides, 3,040 paying per ride.', '19 days of travel.', 'The Monthly pass would save 40.', '- Monthly pass: 1 pass = 3,000, saves 40'], 'summary text');
    s.rides = [{ id: 'q', date: '2026-10-02', fareId: 'f1', fareName: 'Home, "office"', price: 8050, n: 2 }];
    eq(C.csv(s), 'Date,Ride,Rides,Price per ride,Total,On a pass\n2026-10-02,"Home, ""office""",2,80.50,161.00,\n', 'csv quoting');

    // ---- restoring saved data
    eq(C.validate(null), null, 'null'); eq(C.validate({}), null, 'no fares'); eq(C.validate({ fares: [], passes: [] }), null, 'empty fares');
    const v = C.validate({ cur: '<b>', fares: [{ id: 'a', name: '  x '.repeat(30), price: -5 }, { id: 'a', name: 'dup', price: 1 }],
        passes: [{ id: 'p', name: '', price: 1.5, kind: 'weird', days: 0, rides: 9999, covers: ['a', 'nope'] }],
        rides: [{ id: 'r', date: '2026-13-01', n: 1, price: 1 }, { id: 'r2', date: '2026-10-01', n: 51, price: 1 }, { id: 'r3', date: '2026-10-01', n: 3, price: 100, fareName: '' }],
        bought: [{ id: 'b', start: 'x', price: 1 }], pace: { wd: [1, 1, 9, 3], perDay: 0, fare: 'zz', off: 40 } });
    eq([v.cur, v.fares.length, v.fares[0].price, v.fares[0].name.length <= 40], ['', 1, null, true], 'bad fares cleaned');
    eq([v.passes[0].name, v.passes[0].price, v.passes[0].kind, v.passes[0].days, v.passes[0].rides, v.passes[0].covers], ['Pass', null, 'month', 30, 10, ['a']], 'bad pass cleaned');
    eq([v.rides.length, v.rides[0].fareName, v.bought.length], [1, 'Ride', 0], 'bad rides dropped');
    eq(v.pace, { wd: [1, 3], perDay: 2, fare: 'a', off: 0 }, 'bad pace cleaned');
    eq(C.validate(JSON.parse(JSON.stringify(october()))).rides.length, 19, 'round trip');

    const msg = pass + ' passed, ' + failed + ' failed';
    if (typeof document !== 'undefined') { const p = document.createElement('pre'); p.textContent = out.concat(msg).join('\n'); document.body.appendChild(p); }
    else { out.forEach(l => console.log(l)); console.log(msg); if (failed) process.exitCode = 1; }
})();
