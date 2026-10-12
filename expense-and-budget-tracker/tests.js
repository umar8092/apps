// Checks on the maths. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    // The README month: 12 October 2026, six budgets, 16 expenses including a split and a refund.
    function exampleState(C) {
        const s = C.defaults();
        const id = n => s.cats.find(c => c.name === n).id;
        const budgets = { Groceries: 40000, 'Eating out': 15000, Transport: 12000, 'Home and bills': 90000, Shopping: 10000, Fun: 8000 };
        s.cats.forEach(c => { if (budgets[c.name] != null) c.budget = budgets[c.name]; });
        const E = (date, cat, cents, note, refund) => s.entries.push({ id: 'e' + s.entries.length, date, note, refund: !!refund, parts: [{ cat: id(cat), cents }] });
        E('2026-10-01', 'Home and bills', 85000, 'Rent');
        E('2026-10-02', 'Groceries', 6235, 'Supermarket');
        E('2026-10-03', 'Transport', 4500, 'Bus pass');
        E('2026-10-04', 'Eating out', 3850, 'Pizza night');
        s.entries.push({ id: 'split', date: '2026-10-05', note: 'Big shop', refund: false, parts: [{ cat: id('Groceries'), cents: 6420 }, { cat: id('Home and bills'), cents: 2000 }] });
        E('2026-10-06', 'Fun', 2400, 'Cinema');
        E('2026-10-07', 'Eating out', 5680, 'Birthday dinner');
        E('2026-10-08', 'Shopping', 4999, 'Shoes');
        E('2026-10-09', 'Shopping', 7450, 'Jacket');
        E('2026-10-09', 'Shopping', 1500, 'Returned T-shirt', true);
        E('2026-10-09', 'Transport', 3000, 'Fuel');
        E('2026-10-10', 'Groceries', 7115, 'Supermarket');
        E('2026-10-10', 'Health', 875, 'Pharmacy');
        E('2026-10-11', 'Eating out', 4260, 'Takeaway');
        E('2026-10-11', 'Fun', 1299, 'Concert ticket');
        E('2026-10-12', 'Groceries', 1840, 'Bakery and fruit');
        E('2026-09-28', 'Groceries', 9999, 'Last month');
        return s;
    }

    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const A = v => C.parseAmount(v);

        // amounts
        check('12.50 -> 1250 cents', A('12.50').cents === 1250);
        check('12,50 (comma decimal) -> 1250', A('12,50').cents === 1250);
        check('$1,299.00 pasted -> 129900', A('$1,299.00').cents === 129900);
        check('1.299,00 € (European) -> 129900', A('1.299,00 €').cents === 129900);
        check('" 7 " -> 700, .5 -> 50', A(' 7 ').cents === 700 && A('.5').cents === 50);
        check('third decimal rounds half up: 1.005 -> 101, 1.004 -> 100', A('1.005').cents === 101 && A('1.004').cents === 100);
        check('blank is blank', A('').blank && A('  ').blank);
        check('negative refused', A('-5').err === 'negative' && A('5-').err === 'negative');
        check('words refused', A('abc').err === 'nan' && A('1.2.3').err === 'nan' && A('.').err === 'nan');
        check('over 10,000,000 refused', A('10000000.01').err === 'big' && A('999999999').err === 'big' && A('10000000').cents === 1000000000);
        check('0 parses (the page refuses it for an expense)', A('0').cents === 0);
        check('fmt: 1234567 -> 12,345.67, with $ and with Rs', C.fmt(1234567) === '12,345.67' && C.fmt(1234567, '$') === '$12,345.67' && C.fmt(5, 'Rs') === 'Rs 0.05');
        check('fmt negative -> -9.49', C.fmt(-949) === '-9.49');

        // dates
        check('validDate', C.validDate('2026-02-28') && !C.validDate('2026-02-29') && C.validDate('2028-02-29') && !C.validDate('2026-13-01') && !C.validDate('') && !C.validDate('12/10/2026'));
        check('today() uses the device calendar date', C.today(new Date(2026, 9, 12, 23, 59)) === '2026-10-12' && C.today(new Date(2026, 9, 13, 0, 0)) === '2026-10-13');
        const oct = C.periodOf('2026-10-12');
        check('calendar month: 1 to 31 Oct, 31 days', oct.start === '2026-10-01' && oct.end === '2026-10-31' && oct.days === 31);
        check('February 2028 has 29 days', C.periodOf('2028-02-10').end === '2028-02-29');
        const pay = C.periodOf('2026-10-12', 25);
        check('month from the 25th: 12 Oct is in 25 Sep - 24 Oct', pay.start === '2026-09-25' && pay.end === '2026-10-24' && pay.days === 30);
        check('month from the 25th: 25 Oct starts a new one', C.periodOf('2026-10-25', 25).start === '2026-10-25' && C.periodOf('2026-10-24', 25).start === '2026-09-25');
        check('month from the 25th across the new year', C.periodOf('2027-01-03', 25).start === '2026-12-25' && C.periodOf('2027-01-03', 25).end === '2027-01-24');
        check('previous and next month', C.shiftPeriod('2026-10-01', -1).start === '2026-09-01' && C.shiftPeriod('2026-12-01', 1).start === '2027-01-01' && C.shiftPeriod('2026-01-25', -1, 25).start === '2025-12-25');
        check('labels', C.periodLabel(oct) === 'October 2026' && C.periodLabel(pay, 25) === '25 Sep – 24 Oct 2026' && C.periodLabel(C.periodOf('2027-01-03', 25), 25) === '25 Dec 2026 – 24 Jan 2027');
        check('dayLabel', C.dayLabel('2026-10-12') === 'Mon 12 Oct' && C.dayLabel('2026-10-12', true) === 'Mon 12 Oct 2026');

        // the README month
        const s = exampleState(C), sum = C.summary(s, oct, '2026-10-12');
        const cat = n => sum.cats.find(c => c.name === n);
        check('README: budget 1,750.00, spent 1,454.23, 295.77 left', sum.budget === 175000 && sum.spent === 145423 && sum.left === 29577);
        check('README: 20 days left including today, 14.78 a day (rounded down)', sum.daysLeft === 20 && sum.perDay === 1478);
        check('README: 16 expenses this month (last month\'s not counted)', sum.count === 16);
        check('README: Groceries 216.10, 183.90 left, ok', cat('Groceries').spent === 21610 && cat('Groceries').left === 18390 && cat('Groceries').status === 'ok');
        check('README: Eating out 137.90 of 150.00, 12.10 left, nearly used', cat('Eating out').spent === 13790 && cat('Eating out').left === 1210 && cat('Eating out').status === 'near');
        check('README: Home and bills 870.00 (split counted), nearly used', cat('Home and bills').spent === 87000 && cat('Home and bills').status === 'near');
        check('README: Shopping 109.49 after the 15.00 refund, 9.49 over', cat('Shopping').spent === 10949 && cat('Shopping').left === -949 && cat('Shopping').status === 'over' && cat('Shopping').pct === 100);
        check('README: Health 8.75 with no budget', cat('Health').spent === 875 && cat('Health').status === 'none' && cat('Health').left === undefined && sum.unbudgeted === 875);
        check('README: refunds 15.00', sum.refunds === 1500);
        const sep = C.summary(s, C.shiftPeriod(oct.start, -1), '2026-10-12');
        check('September is past: 99.99 spent, no days left', sep.spent === 9999 && sep.isPast && sep.daysLeft === null && sep.perDay === null);
        const nov = C.summary(s, C.shiftPeriod(oct.start, 1), '2026-10-12');
        check('November is empty and not current', nov.count === 0 && nov.spent === 0 && !nov.isCurrent && nov.left === 175000);
        check('last day of the month: 1 day left, whole rest for today', C.summary(s, oct, '2026-10-31').daysLeft === 1 && C.summary(s, oct, '2026-10-31').perDay === 29577);
        const listed = C.entriesIn(s, oct);
        check('list: newest day first, later-added first within a day', listed[0].note === 'Bakery and fruit' && listed[1].note === 'Concert ticket' && listed[listed.length - 1].note === 'Rent');
        check('list filtered by Groceries includes the split', C.entriesIn(s, oct, s.cats[0].id).length === 4);

        // no budgets, zero budget, overspent month
        const nb = C.defaults(); nb.entries.push({ id: 'a', date: '2026-10-02', note: '', refund: false, parts: [{ cat: 'other', cents: 500 }] });
        const nbs = C.summary(nb, oct, '2026-10-12');
        check('no budgets: left is null, spent 5.00, no per-day', nbs.budget === null && nbs.left === null && nbs.spent === 500 && nbs.perDay === null);
        nb.cats[0].budget = 0;
        check('budget 0 with nothing spent is ok and 0% used', C.summary(nb, oct, '2026-10-12').cats[0].status === 'ok' && C.summary(nb, oct, '2026-10-12').cats[0].pct === 0);
        nb.entries.push({ id: 'b', date: '2026-10-03', note: '', refund: false, parts: [{ cat: nb.cats[0].id, cents: 1 }] });
        check('budget 0 and 0.01 spent is over', C.summary(nb, oct, '2026-10-12').cats[0].status === 'over');
        const over = C.summary(s, oct, '2026-10-12');
        check('per day is null when the month is already over budget', (() => { const t = JSON.parse(JSON.stringify(s)); t.cats.forEach(c => { if (c.budget != null) c.budget = 100; }); return C.summary(t, oct, '2026-10-12').perDay === null && C.summary(t, oct, '2026-10-12').left < 0; })() && over.perDay > 0);
        const rf = C.defaults(); rf.cats[4].budget = 5000;
        rf.entries.push({ id: 'r', date: '2026-10-02', note: '', refund: true, parts: [{ cat: rf.cats[4].id, cents: 2000 }] });
        const rfs = C.summary(rf, oct, '2026-10-12');
        check('refund alone: spent -20.00, 70.00 left of 50.00', rfs.cats[4].spent === -2000 && rfs.cats[4].left === 7000 && rfs.cats[4].pct === 0 && rfs.spent === -2000);

        // split
        const sp = (t, p) => C.resolveSplit(t, p);
        check('split 80.00 = 60.00 + 20.00', JSON.stringify(sp(8000, [{ cat: 'a', cents: 6000 }, { cat: 'b', cents: 2000 }]).parts) === '[{"cat":"a","cents":6000},{"cat":"b","cents":2000}]');
        check('split with one empty part gets the rest: 80.00 - 60.00 = 20.00', sp(8000, [{ cat: 'a', cents: 6000 }, { cat: 'b', cents: null }]).parts[1].cents === 2000);
        check('split short by 20.00', sp(8000, [{ cat: 'a', cents: 6000 }, { cat: 'b', cents: 0 }]).err === 'short' && sp(8000, [{ cat: 'a', cents: 6000 }, { cat: 'b', cents: 0 }]).rest === 2000);
        check('split over by 5.00', sp(8000, [{ cat: 'a', cents: 6000 }, { cat: 'b', cents: 2500 }]).err === 'over' && sp(8000, [{ cat: 'a', cents: 6000 }, { cat: 'b', cents: 2500 }]).rest === -500);
        check('split two empty parts refused', sp(8000, [{ cat: 'a', cents: null }, { cat: 'b', cents: null }]).err === 'blanks');
        check('split empty part with nothing left refused', sp(8000, [{ cat: 'a', cents: 8000 }, { cat: 'b', cents: null }]).err === 'nothing-left');
        check('split same category twice is merged', JSON.stringify(sp(1000, [{ cat: 'a', cents: 300 }, { cat: 'a', cents: 700 }]).parts) === '[{"cat":"a","cents":1000}]');
        check('split odd cents: 10.01 = 3.34 + 3.33 + rest 3.34', sp(1001, [{ cat: 'a', cents: 334 }, { cat: 'b', cents: 333 }, { cat: 'c', cents: null }]).parts[2].cents === 334);

        // cleaning saved or restored data
        check('clean(null) gives the 8 starting categories with Other last', C.clean(null).cats.length === 8 && C.clean(null).cats[7].id === 'other' && C.clean(null).entries.length === 0);
        check('clean drops bad entries', C.clean({ entries: [{ date: 'x', parts: [{ cat: 'other', cents: 5 }] }, { date: '2026-10-01', parts: [{ cat: 'other', cents: -5 }] }, { date: '2026-10-01', parts: [] }, 7, null] }).entries.length === 0);
        check('clean moves expenses of a missing category to Other', C.clean({ cats: [{ id: 'x', name: 'Food' }], entries: [{ id: 'e1', date: '2026-10-01', parts: [{ cat: 'gone', cents: 500 }] }] }).entries[0].parts[0].cat === 'other');
        check('clean adds Other when missing', C.clean({ cats: [{ id: 'x', name: 'Food' }] }).cats.map(c => c.id).join() === 'x,other');
        check('clean drops duplicate category names and bad budgets', (() => { const c = C.clean({ cats: [{ id: 'a', name: 'Food', budget: -1 }, { id: 'b', name: 'food', budget: 100 }, { id: 'other', name: 'Other', budget: 2.5 }] }).cats; return c.length === 2 && c[0].budget === null && c[1].budget === null; })());
        check('clean keeps a valid state unchanged', JSON.stringify(C.clean(JSON.parse(JSON.stringify(s)))) === JSON.stringify(s));
        check('clean rejects a bad currency and start day', C.clean({ cur: '<b>', startDay: 31 }).cur === '' && C.clean({ startDay: 31 }).startDay === 1 && C.clean({ startDay: 25 }).startDay === 25);
        check('clean trims very long notes to 80 characters', C.clean({ entries: [{ date: '2026-10-01', note: 'x'.repeat(500), parts: [{ cat: 'other', cents: 5 }] }] }).entries[0].note.length === 80);
        check('clean gives duplicate ids new ids', (() => { const c = C.clean({ entries: [{ id: 'a', date: '2026-10-01', parts: [{ cat: 'other', cents: 5 }] }, { id: 'a', date: '2026-10-01', parts: [{ cat: 'other', cents: 5 }] }] }).entries; return c.length === 2 && c[0].id !== c[1].id; })());

        // text summary
        const txt = C.summaryText(s, oct, '2026-10-12', '$');
        check('summary text', txt.startsWith('Spending for October 2026\nSpent $1,454.23 of a $1,750.00 budget. $295.77 left.\nThat is $14.78 a day for the 20 days left.') &&
            txt.includes('Shopping: $109.49 of $100.00 ($9.49 over)') && txt.includes('Health: $8.75\n') && txt.includes('Fri 9 Oct  -$15.00  Shopping (refund)  Returned T-shirt') &&
            txt.includes('Mon 5 Oct  $84.20  Groceries $64.20 + Home and bills $20.00  Big shop'));
        return r;
    }

    const api = { runTests, exampleState };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
        if (require.main === module) {
            const res = runTests(require('./core.js'));
            res.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
            const bad = res.filter(t => !t.ok).length;
            console.log('\n' + (res.length - bad) + ' of ' + res.length + ' checks passed');
            process.exit(bad ? 1 : 0);
        }
    } else { root.runTests = runTests; root.exampleState = exampleState; }
})(this);
