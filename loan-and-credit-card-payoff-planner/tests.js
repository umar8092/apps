// Checks on the maths, against examples worked out by hand (and cross-checked with a separate Decimal program).
// Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const M = v => C.parseMoney(v), R = v => C.parseRate(v);

        // typing and pasting
        check('3,200 -> 320000 cents; 3200.50 -> 320050', M('3,200').cents === 320000 && M('3200.50').cents === 320050);
        check('pasted "$ 8,500.00" and European "8.500,00" -> 850000', M('$ 8,500.00').cents === 850000 && M('8.500,00').cents === 850000);
        check('money blank / negative / words / too big', M(' ').err === 'blank' && M('-5').err === 'negative' && M('abc').err === 'nan' && M('100000000.01').err === 'big');
        check('rate 19.99 -> 19990; "24,9 %" -> 24900; "24.9% APR" -> 24900', R('19.99').rate === 19990 && R('24,9 %').rate === 24900 && R('24.9% APR').rate === 24900);
        check('rate 0 allowed; blank, negative, words and over 1000% are errors', R('0').rate === 0 && R('').err === 'blank' && R('-1').err === 'negative' && R('x').err === 'nan' && R('1000.001').err === 'big' && R('1000').rate === 1000000);

        // interest for one month, rounded half up
        check('1,000 at 12%: 10.00 a month', C.monthInterest(100000, 12000) === 1000);
        check('819.10 at 12%: 8.191 -> 8.19; 58.40 at 12%: 0.584 -> 0.58', C.monthInterest(81910, 12000) === 819 && C.monthInterest(5840, 12000) === 58);
        check('half cent rounds up: 50.00 at 1.2% = 0.05; 0.50 at 12% = 0.005 -> 0.01', C.monthInterest(5000, 1200) === 5 && C.monthInterest(50, 12000) === 1);
        check('0% rate and 0 balance give 0 interest', C.monthInterest(100000, 0) === 0 && C.monthInterest(0, 24900) === 0);
        check('huge balance x huge rate stays exact (BigInt): 100,000,000 at 1000% = 83,333,333.33', C.monthInterest(10000000000, 1000000) === 8333333333);

        // 1. one loan, worked by hand month by month: 1,000 at 12%, paying 100
        let x = C.simulate([{ bal: 100000, rate: 12000, min: 10000 }], {});
        check('1,000 at 12% paying 100: 11 payments, interest 58.98, last payment 58.98', x.months === 11 && x.interest === 5898 && x.rows[10].pay === 5898);
        check('... month 1: interest 10.00, owed 910.00; month 3: interest 8.19, owed 727.29', x.rows[0].interest === 1000 && x.rows[0].owed === 91000 && x.rows[2].interest === 819 && x.rows[2].owed === 72729);
        check('... total paid = balance + interest (1,058.98)', x.paid === 105898);

        // 2. a credit card: 5,000 at 19.99% paying 150 (Decimal program: 50 months, 2,357.03)
        x = C.simulate([{ bal: 500000, rate: 19990, min: 15000 }], {});
        check('5,000 at 19.99% paying 150: 50 payments, interest 2,357.03', x.months === 50 && x.interest === 235703);

        // 3. rolling over, 0%: A 500 pay 50, B 1,000 pay 50, extra 100 (worked by hand)
        const ab = [{ bal: 50000, rate: 0, min: 5000 }, { bal: 100000, rate: 0, min: 5000 }];
        x = C.simulate(ab, { extra: 10000, order: 'avalanche' });
        check('rollover: A paid off in month 4, B in month 8, 0 interest', x.months === 8 && x.per[0].payoff === 4 && x.per[1].payoff === 8 && x.interest === 0);
        check('rollover month 4: A gets its last 50, the other 100 goes to B (B pays 150)', x.rows[3].each[0] === 5000 && x.rows[3].each[1] === 15000);
        check('month 1: A gets 50 + 100 extra = 150, B 50', x.first[0] === 15000 && x.first[1] === 5000);
        x = C.simulate(ab, { extra: 10000, order: 'listed' });
        x.order = x.order.join();
        check('equal rates: highest interest first picks the smaller balance', C.orderOf(ab, 'avalanche').join() === '0,1');
        const ba = [ab[1], ab[0]], y = C.simulate(ba, { extra: 10000, order: 'listed' });
        check('listed order, B first: B paid off month 7, A month 8', y.per[0].payoff === 7 && y.per[1].payoff === 8 && y.months === 8);
        check('without the plan (own): A 10 months, B 20 months', (() => { const o = C.simulate(ab, { own: true }); return o.per[0].payoff === 10 && o.per[1].payoff === 20 && o.months === 20; })());

        // 4. the README example: credit card 3,200 at 24.9% pay 96, store card 650 at 18.9% pay 25, car loan 8,500 at 6.9% pay 250, extra 129
        const sara = [{ bal: 320000, rate: 24900, min: 9600 }, { bal: 65000, rate: 18900, min: 2500 }, { bal: 850000, rate: 6900, min: 25000 }];
        const av = C.simulate(sara, { extra: 12900, order: 'avalanche' }), sn = C.simulate(sara, { extra: 12900, order: 'snowball' }), own = C.simulate(sara, { own: true });
        check('example, highest interest first: 28 payments, interest 1,628.84, total 13,978.84', av.months === 28 && av.interest === 162884 && av.paid === 1397884);
        check('example: credit card paid off month 18, store card 19, car loan 28', av.per[0].payoff === 18 && av.per[1].payoff === 19 && av.per[2].payoff === 28);
        check('example, smallest balance first: 29 payments, interest 1,676.86 (48.02 more)', sn.months === 29 && sn.interest === 167686 && sn.per[1].payoff === 5);
        check('example, without the plan: 58 payments, interest 3,477.89', own.months === 58 && own.interest === 347789);
        check('example: month 1 pays 225 / 25 / 250 (500 in total)', av.first.join() === '22500,2500,25000' && av.budget === 50000);
        check('paid always equals balances + interest', av.paid === 1235000 + av.interest && sn.paid === 1235000 + sn.interest);

        // 5. one-off payments
        const one = C.simulate(sara, { extra: 12900, order: 'avalanche', oneoffs: [{ at: 4, cents: 100000 }] });
        check('a 1,000 one-off in month 4 finishes sooner and costs less', one.months < av.months && one.interest < av.interest && one.rows[3].pay === 150000);
        check('one-offs in the past (at 0) and of 0 are ignored', C.simulate(sara, { extra: 12900, oneoffs: [{ at: 0, cents: 100000 }, { at: 3, cents: 0 }] }).interest === av.interest);
        check('a one-off bigger than everything owed clears it that month', C.simulate([{ bal: 10000, rate: 0, min: 1000 }], { oneoffs: [{ at: 2, cents: 999999 }] }).months === 2);

        // 6. payments that never pay it off
        x = C.simulate([{ bal: 500000, rate: 24000, min: 5000 }], {});
        check('5,000 at 24% paying 50 (interest 100 a month): never paid off', x.never && x.months === null);
        x = C.simulate([{ bal: 500000, rate: 12000, min: 5000 }], {});
        check('payment exactly equal to the interest: never paid off', x.never);
        check('0% and a 0 payment: never paid off', C.simulate([{ bal: 1000, rate: 0, min: 0 }], {}).never);
        x = C.simulate([{ bal: 500000, rate: 24000, min: 5000 }, { bal: 20000, rate: 0, min: 10000 }], { extra: 0 });
        check('rolling over can rescue a debt whose payment is too low (after the other is paid, its 100 moves over)', !x.never && x.per[1].payoff === 2);

        // 7. paying more and goals
        check('extra needed to finish 1,000 at 12% in 6 payments: the smallest that works', (() => { const d = [{ bal: 100000, rate: 12000, min: 10000 }]; const e = C.extraFor(d, 6, {}); const a = C.simulate(d, { extra: e }), b = C.simulate(d, { extra: e - 1 }); return a.months <= 6 && b.months > 6; })());
        check('goal already met: extra needed is 0', C.extraFor([{ bal: 100000, rate: 12000, min: 10000 }], 24, {}) === 0);
        check('goal for a never-paid debt is found', (() => { const d = [{ bal: 500000, rate: 24000, min: 5000 }], e = C.extraFor(d, 60, {}); return e > 0 && C.simulate(d, { extra: e }).months <= 60; })());

        // 8. odd sizes
        check('payment bigger than the balance: paid off in month 1 with the exact amount', (() => { const z = C.simulate([{ bal: 12345, rate: 12000, min: 100000 }], {}); return z.months === 1 && z.rows[0].pay === 12345 + 123; })());
        check('100,000,000 at 1000% paying 1: never (stops without overflowing)', C.simulate([{ bal: 10000000000, rate: 1000000, min: 100 }], {}).never);
        check('10 debts at 0.01 each, paying 0.01: 1 payment', C.simulate(Array.from({ length: 10 }, () => ({ bal: 1, rate: 0, min: 1 })), {}).months === 1);

        // 9. reading a debt
        check('readDebt: full -> ok; balance 0 -> paid; blank rate -> wait; words -> bad', C.readDebt({ bal: '100', rate: '5', pay: '10' }).status === 'ok' && C.readDebt({ bal: '0', rate: '', pay: '' }).status === 'paid' && C.readDebt({ bal: '100', rate: '', pay: '10' }).status === 'wait' && C.readDebt({ bal: 'abc', rate: '5', pay: '10' }).status === 'bad');
        check('readDebt gives the first month of interest: 3,200 at 24.9% = 66.40', C.readDebt({ bal: '3200', rate: '24.9', pay: '50' }).debt.interest1 === 6640);

        // 10. dates and words
        const st = { y: 2026, m: 10 };     // payment 1 = November 2026
        check('payment 1 = Nov 2026, payment 28 = February 2029, payment 3 = January 2027', C.monthName(st, 1) === 'Nov 2026' && C.monthName(st, 28, true) === 'February 2029' && C.monthName(st, 3) === 'Jan 2027');
        check('month keys round-trip; a past month gives 0 or less', C.monthKey(st, 14) === '2027-12' && C.indexOfKey(st, '2027-12') === 14 && C.indexOfKey(st, '2026-10') === 0 && C.indexOfKey(st, 'bad') === null && C.indexOfKey(st, '2026-13') === null);
        check('next month from 10 Oct 2026 is Nov 2026; from 31 Dec 2026 is Jan 2027', (() => { const a = C.nextMonth(new Date(2026, 9, 10)), b = C.nextMonth(new Date(2026, 11, 31)); return a.y === 2026 && a.m === 10 && b.y === 2027 && b.m === 0; })());
        check('span: 28 -> 2 years 4 months, 12 -> 1 year, 1 -> 1 month', C.span(28) === '2 years 4 months' && C.span(12) === '1 year' && C.span(1) === '1 month' && C.span(13) === '1 year 1 month');
        check('fmt with symbols: 1628.84 / $1,628.84 / Rs 1,628.84', C.fmt(162884) === '1,628.84' && C.fmt(162884, '$') === '$1,628.84' && C.fmt(162884, 'Rs') === 'Rs 1,628.84');
        check('rateText: 19990 -> 19.99, 24900 -> 24.9, 6000 -> 6', C.rateText(19990) === '19.99' && C.rateText(24900) === '24.9' && C.rateText(6000) === '6');
        return r;
    }
    if (typeof module !== 'undefined' && module.exports) {
        const res = runTests(require('./core.js')), bad = res.filter(t => !t.ok);
        res.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
        console.log('\n' + (res.length - bad.length) + ' of ' + res.length + ' checks passed');
        process.exit(bad.length ? 1 : 0);
    } else root.runTests = runTests;
})(this);
