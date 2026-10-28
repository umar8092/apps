// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.EVB;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const T = '2026-10-29', fl = c => C.fmtMoney(c, '', 'lakh'), fw = c => C.fmtMoney(c, '', 'west');

    // typed money
    const m = s => C.parseMoney(s);
    eq('250000', m('250000').n, 25000000); eq('2,50,000 (lakh)', m('2,50,000').n, 25000000); eq('250,000.50', m('250,000.50').n, 25000050);
    eq('2.5 lakh', m('2.5 lakh').n, 25000000); eq('9 lakh', m('9 lakh').n, 90000000); eq('Rs 2.5 Lakh', m('Rs 2.5 Lakh').n, 25000000); eq('9 lac', m('9 lac').n, 90000000);
    eq('50k', m('50k').n, 5000000); eq('1.2 crore', m('1.2 crore').n, 1200000000); eq('1.5m', m('1.5m').n, 150000000);
    eq('blank refused', !!m('').error, true); eq('minus refused', !!m('-500').error, true); eq('words refused', !!m('a lot').error, true);
    eq('3 decimals refused', !!m('10.5555').error, true); eq('10.555 read as ten thousand (thousands dot)', m('10.555').n, 1055500); eq('huge refused', !!m('9999999999999').error, true); eq('huge lakh refused', !!m('99999999 crore').error, true);
    eq('0 allowed for a free item', m('0').n, 0); eq('pasted with spaces', m('  1,20,000  ').n, 12000000);
    eq('optional blank is null', C.parseOptMoney('  ').n, null);
    eq('guests 250', C.parseGuests('250').n, 250); eq('guests 0 refused', !!C.parseGuests('0').error, true); eq('guests 2.5 refused', !!C.parseGuests('2.5').error, true);
    eq('guests huge refused', !!C.parseGuests('1000000').error, true); eq('guests 1,200', C.parseGuests('1,200').n, 1200);

    // numbers on screen
    eq('lakh grouping', fl(84000000), '8,40,000'); eq('lakh grouping crore', fl(1234567800), '1,23,45,678'); eq('west grouping', fw(84000000), '840,000');
    eq('small number', fl(50000), '500'); eq('cents shown', fw(12345), '123.45'); eq('odd cent', fw(1), '0.01'); eq('zero', fw(0), '0');
    eq('currency Rs', C.fmtMoney(84000000, 'Rs', 'lakh'), 'Rs 8,40,000'); eq('currency $', C.fmtMoney(150000, '$', 'west'), '$1,500'); eq('negative', fw(-5000), '-50');

    // the mehndi example from the README
    const V = (id, name, cat, price, pays, plan, extra) => Object.assign({ id, name, cat, catName: '', mode: 'fixed', price, rate: 0, guests: 0, history: [], pays, plan, status: 'booked', contact: '', note: '' }, extra || {});
    const P = (id, d, amt, kind) => ({ id, d, amt, kind: kind || 'pay', note: '' });
    const hall = V('h', 'Royal Marquee', 'venue', 25000000, [P('p1', '2026-09-01', 10000000)], [{ id: 'd1', d: '2026-12-10', amt: 15000000 }]);
    const food = V('f', 'Al-Noor Caterers', 'food', 0, [P('p2', '2026-09-05', 15000000)], [{ id: 'd2', d: '2026-12-11', amt: 20000000 }], { mode: 'perhead', rate: 140000, guests: 250 });
    const decor = V('d', 'Gul Decor', 'decor', 12000000, [P('p3', '2026-10-01', 5000000)], [{ id: 'd3', d: '2026-10-20', amt: 7000000 }]);
    const photo = V('p', 'Lens Studio', 'photo', 12000000, [P('p4', '2026-10-02', 5000000)], []);
    const mehndi = { id: 'e1', name: 'Mehndi', date: '2026-12-12', budget: 90000000, catBudgets: { food: 30000000 }, note: '', vendors: [hall, food, decor, photo] };
    const st = { v: 1, cur: '', group: 'lakh', events: [mehndi] };
    const fs = C.vStats(food);
    eq('per guest agreed 250 x 1,400 = 3,50,000', fl(fs.agreed), '3,50,000'); eq('caterer still to pay', fl(fs.balance), '2,00,000'); eq('caterer unplanned 0', fs.unplanned, 0);
    const es = C.eStats(mehndi);
    eq('event agreed 8,40,000', fl(es.agreed), '8,40,000'); eq('event paid 3,50,000', fl(es.paid), '3,50,000'); eq('event still to pay 4,90,000', fl(es.toPay), '4,90,000');
    eq('budget left 60,000', fl(es.left), '60,000'); eq('agreed = paid + to pay', es.agreed, es.paid + es.toPay);
    const foodCat = es.cats.find(c => c.key === 'food');
    eq('food over budget by 50,000', fl(foodCat.overBy), '50,000'); eq('venue no budget', es.cats.find(c => c.key === 'venue').budget, null);
    eq('budget words', C.budgetWords(es.agreed, mehndi.budget, fl), '8,40,000 agreed of 9,00,000 budget: 60,000 not promised yet');
    eq('budget words over', C.budgetWords(100, 50, fw), '1 agreed of 0.50 budget: over budget by 0.50');
    eq('no budget words', C.budgetWords(500, null, fw), '5 agreed, no budget set');
    const up = C.upcoming(st, T);
    eq('upcoming order (late first)', up.map(u => u.v.name), ['Gul Decor', 'Royal Marquee', 'Al-Noor Caterers']);
    eq('decor late', up[0].late, true); eq('decor 9 days late', C.dueRel(up[0].due.d, T), '9 days late');
    eq('hall in 42 days', C.dueRel('2026-12-10', T), 'in 42 days'); eq('due today', C.dueRel(T, T), 'due today'); eq('due tomorrow', C.dueRel('2026-10-30', T), 'due tomorrow');
    eq('photo no due date: all unplanned', C.vStats(photo).unplanned, 7000000);
    eq('vendor line', C.vendorLine(hall, fl, T), 'Royal Marquee (Venue or hall): agreed 2,50,000, paid 1,00,000, still to pay 1,50,000. Due: 1,50,000 on Thu 10 Dec.');
    eq('per guest line', C.priceWords(food, fl), '3,50,000 (250 guests × 1,400)');
    eq('event text first line', C.eventText(mehndi, st, T).split('\n')[0], 'Mehndi (Sat 12 Dec 2026)');
    eq('event text over budget line', C.eventText(mehndi, st, T).split('\n').pop(), 'Over budget: Food and catering by 50,000.');

    // part payments of a due, overpaid, overplanned
    const over = V('o', 'Tailor', 'clothes', 1000000, [P('a', T, 1200000)], []);
    eq('overpaid', C.vStats(over).over, 200000); eq('overpaid balance 0', C.vStats(over).balance, 0);
    const op = V('q', 'DJ', 'music', 1000000, [P('a', T, 400000)], [{ id: 'x', d: '2026-11-01', amt: 800000 }]);
    eq('over planned by 2,000', C.vStats(op).overPlanned, 200000); eq('nothing unplanned', C.vStats(op).unplanned, 0);
    const odd = V('r', 'Cake', 'cake', 1001, [P('a', T, 333), P('b', T, 333)], []);
    eq('odd cents exact', C.vStats(odd).balance, 335);

    // cancellations and refunds
    const canc = V('c', 'Band', 'music', 6000000, [P('a', '2026-09-01', 2000000), P('b', '2026-10-01', 1200000, 'refund')], [{ id: 'z', d: '2026-12-01', amt: 4000000 }], { status: 'cancelled' });
    const cs = C.vStats(canc);
    eq('cancelled lost 8,000', fw(cs.cost), '8,000'); eq('cancelled nothing to pay', cs.balance, 0); eq('cancelled dues ignored', cs.dues.length, 0);
    const ev2 = { id: 'e2', name: 'Barat', date: '', budget: null, catBudgets: {}, note: '', vendors: [canc] };
    eq('event with cancelled', [C.eStats(ev2).agreed, C.eStats(ev2).lost, C.eStats(ev2).toPay], [800000, 800000, 0]);
    eq('cancelled not in upcoming', C.upcoming({ events: [ev2] }, T).length, 0);
    const partRefund = V('s', 'Hall', 'venue', 5000000, [P('a', T, 3000000), P('b', T, 500000, 'refund')], []);
    eq('refund on active vendor', [C.vStats(partRefund).net, C.vStats(partRefund).balance], [2500000, 2500000]);
    eq('cancelled line', C.vendorLine(canc, fw, T), 'Band (Music, DJ and sound): cancelled. Paid 20,000, refunded 12,000, lost 8,000.');

    // other category, empty event, totals
    const oth = V('t', 'Fireworks', 'other', 500000, [], [], { catName: 'Fireworks' });
    eq('custom category label', C.catLabel(oth), 'Fireworks');
    const empty = { id: 'e3', name: 'Eid dinner', date: '', budget: 5000000, catBudgets: {}, note: '', vendors: [] };
    eq('empty event', [C.eStats(empty).agreed, C.eStats(empty).left], [0, 5000000]);
    eq('empty event text', C.eventText(empty, st, T), 'Eid dinner\n0 agreed of 50,000 budget: 50,000 not promised yet. Paid 0. Still to pay 0.\nNo vendors yet.');
    const tot = C.totals({ events: [mehndi, ev2, empty] });
    eq('totals all events', [tot.agreed, tot.paid, tot.toPay], [84800000, 35800000, 49000000]);

    // csv
    const csv = C.csv({ events: [{ id: 'e', name: '=Mehndi, "big"', date: '', budget: null, catBudgets: {}, note: '', vendors: [hall] }] });
    eq('csv header', csv.split('\r\n')[0], 'Event,Event date,Vendor,Category,Status,Agreed price,Type,Date,Amount,Note');
    eq('csv formula and quotes escaped', csv.split('\r\n')[1].startsWith('"\'=Mehndi, ""big""",'), true);
    eq('csv rows (1 paid + 1 due)', csv.trim().split('\r\n').length, 3);
    eq('csv due row', csv.split('\r\n')[2].split(',').slice(-4), ['Still due', '2026-12-10', '150000.00', '']);

    // saved state is checked
    eq('null state', C.cleanState(null), null); eq('junk state', C.cleanState({ events: 'x' }), null);
    const cleaned = C.cleanState(JSON.parse(JSON.stringify(st)));
    eq('round trip', JSON.stringify(cleaned), JSON.stringify(st));
    const bad = C.cleanState({ cur: 'XXX', group: 'odd', events: [{ id: 'e', name: '  ', vendors: [] }, { id: 'f', name: 'Ok', budget: -5, date: '2026-02-30', catBudgets: { food: 'x', other: 5, zzz: 9 },
        vendors: [{ id: 'v', name: 'A', mode: 'fixed', price: 1.5 }, { id: 'w', name: 'B', price: 100, pays: [{ id: 'p', d: T, amt: 50, kind: 'refund' }, { id: 'p', d: T, amt: 10 }, { id: 'q', d: 'bad', amt: 10 }] },
            { id: 'g', name: 'G', mode: 'perhead', rate: 100, guests: 0 }] }] });
    eq('bad currency dropped', bad.cur, ''); eq('bad group', bad.group, 'west'); eq('blank event dropped', bad.events.length, 1);
    eq('bad budget dropped', bad.events[0].budget, null); eq('bad date dropped', bad.events[0].date, ''); eq('bad category budgets dropped', bad.events[0].catBudgets, {});
    eq('bad vendors dropped', bad.events[0].vendors.map(v => v.name), ['B']);
    eq('refund bigger than paid dropped, dup ids dropped', bad.events[0].vendors[0].pays.length, 0);
    eq('long name cut', C.cleanEvent({ id: 'a', name: 'x'.repeat(200), vendors: [] }).name.length, 60);

    // dates
    eq('fmtDate other year', C.fmtDate('2027-01-02', T), 'Sat 2 Jan 2027'); eq('rel past', C.rel('2026-10-20', T), '9 days ago'); eq('isDate 31 Apr', C.isDate('2026-04-31'), false);

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = summary + '\n\n' + out.join('\n');
    else { out.filter(l => l.startsWith('FAIL')).forEach(l => console.log(l)); console.log(summary); if (fail) process.exitCode = 1; }
})();
