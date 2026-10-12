// Checks on the maths. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    const G = (o) => Object.assign({ id: 'g', name: 'Goal', target: 100000, start: 0, mode: 'date', date: '2027-06-01', pay: 0, freq: 'month', rate: 0, color: '#eab308', log: [] }, o);

    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const A = v => C.parseAmount(v), R = v => C.parseRate(v);
        const T = '2026-10-12';

        // input
        check('3,000 -> 300000, 1.299,99 € -> 129999, 12,50 -> 1250', A('3,000').cents === 300000 && A('1.299,99 €').cents === 129999 && A('12,50').cents === 1250);
        check('blank, negative, words, huge', A('').blank && A('-5').err === 'negative' && A('lots').err === 'nan' && A('123456789').err === 'big');
        check('rate 4.5 -> 4500, 4,25% -> 4250, 0 -> 0, blank', R('4.5').n === 4500 && R('4,25%').n === 4250 && R('0').n === 0 && R('').blank);
        check('rate negative, words and over 30% refused', R('-1').err === 'negative' && R('abc').err === 'nan' && R('31').err === 'big' && R('30').n === 30000);
        check('rateText 4500 -> 4.5, 4250 -> 4.25, 5000 -> 5', C.rateText(4500) === '4.5' && C.rateText(4250) === '4.25' && C.rateText(5000) === '5');
        check('fmt', C.fmt(22500) === '225.00' && C.fmt(129999, '$') === '$1,299.99' && C.fmt(5, 'Rs') === 'Rs 0.05');

        // dates
        check('31 Jan + 1 month = 28 Feb, + 2 months = 31 Mar (from the 31st)', C.addMonths('2027-01-31', 1) === '2027-02-28' && C.addMonths('2027-01-31', 2) === '2027-03-31');
        check('29 Feb 2028 + 12 months = 28 Feb 2029; 15 Dec + 1 = 15 Jan next year', C.addMonths('2028-02-29', 12) === '2029-02-28' && C.addMonths('2026-12-15', 1) === '2027-01-15');
        check('payment dates: monthly, every 2 weeks, weekly', C.payDate(T, 7, 'month') === '2027-05-12' && C.payDate(T, 2, '2weeks') === '2026-11-09' && C.payDate(T, 10, 'week') === '2026-12-21');
        check('dateText', C.dateText('2027-05-12') === '12 May 2027');

        // README goal 1: Trip to Japan, 3,000, 1,200 saved, by 1 Jun 2027, every month
        const japan = G({ id: 'japan', name: 'Trip to Japan', target: 300000, start: 120000, date: '2027-06-01' });
        const pj = C.plan(japan, T);
        check('Japan: 8 monthly payments of 225.00, 12 Oct 2026 to 12 May 2027', pj.status === 'plan' && pj.pay === 22500 && pj.count === 8 && pj.last === 22500 && pj.first === T && pj.lastDate === '2027-05-12' && pj.rem === 180000);

        // README goal 3: New laptop, 1,299.99, nothing saved, by 24 Dec 2026, every week
        const laptop = G({ name: 'New laptop', target: 129999, date: '2026-12-24', freq: 'week' });
        const pl = C.plan(laptop, T);
        check('Laptop: 11 weekly payments of 118.19, the last 118.09 on 21 Dec', pl.status === 'plan' && pl.pay === 11819 && pl.count === 11 && pl.last === 11809 && pl.lastDate === '2026-12-21');
        check('Laptop: 10 x 118.19 + 118.09 = 1,299.99 exactly', pl.pay * (pl.count - 1) + pl.last === 129999);

        // README goal 2: Emergency fund, 5,000, 750 saved, 300 a month at 4% a year
        const fund = G({ id: 'fund', name: 'Emergency fund', target: 500000, start: 75000, mode: 'amount', date: null, pay: 30000, rate: 4000 });
        const pf = C.plan(fund, T);
        // independent check: month by month by hand-style simulation
        let bal = 75000, k = 0, intr = 0, last = 0;
        for (; ; k++) { if (k) { const i = Math.round(bal * 0.04 / 12 + 1e-9); bal += i; intr += i; } const need = 500000 - bal; if (need <= 0) break; const d = Math.min(30000, need); bal += d; last = d; if (d === need) { k++; break; } }
        check('Emergency fund: payments, last payment and interest match a month-by-month check', pf.status === 'when' && pf.count === k && pf.last === last && pf.interest === intr);
        check('Emergency fund: 14 payments, the last 224.60 on 12 Nov 2027, 125.40 interest (750 + 13 x 300 + 224.60 + 125.40 = 5,000)', pf.status === 'when' && pf.count === 14 && pf.last === 22460 && pf.date === '2027-11-12' && pf.interest === 12540 && 75000 + 13 * 30000 + 22460 + 12540 === 500000);
        const noInt = C.plan(Object.assign({}, fund, { rate: 0 }), T);
        check('without interest: 15 payments, 14 of 300.00 and a last 50.00 (4,250 / 300)', noInt.count === 15 && noInt.last === 5000 && noInt.date === '2027-12-12');

        // by a date with interest: the payment found is the smallest that works
        const wi = G({ target: 1000000, start: 0, date: '2028-10-12', rate: 5000 });
        const pw = C.plan(wi, T);
        check('by a date with interest: smallest payment that reaches it', pw.status === 'plan' && !C.run(0, pw.pay, 5000, 12, 1000000, pw.n).never && C.run(0, pw.pay - 1, 5000, 12, 1000000, pw.n).never && pw.pay < 1000000 / 25);
        check('interest lowers the monthly amount', pw.pay < C.plan(Object.assign({}, wi, { rate: 0 }), T).pay);

        // odd cents and tiny amounts
        const odd = C.plan(G({ target: 180100, start: 0, date: '2027-06-01' }), T);
        check('1,801.00 over 8 months: 225.13 each, the last 225.09', odd.pay === 22513 && odd.count === 8 && odd.last === 22509);
        const tiny = C.plan(G({ target: 10, start: 0, date: '2027-06-01' }), T);
        check('0.10 over 8 months: 0.02 x 5 payments (the smallest amount that gets there)', tiny.pay === 2 && tiny.count === 5 && tiny.last === 2);

        // states
        check('already reached: 200.00 more than needed', (() => { const p = C.plan(G({ target: 100000, start: 120000 }), T); return p.status === 'reached' && p.extra === 20000; })());
        check('exactly reached: extra 0', C.plan(G({ target: 100000, start: 100000 }), T).status === 'reached');
        check('goal date today or past', C.plan(G({ date: T }), T).status === 'past' && C.plan(G({ date: '2026-01-01' }), T).status === 'past');
        check('goal date tomorrow: one payment today of everything', (() => { const p = C.plan(G({ date: '2026-10-13' }), T); return p.status === 'plan' && p.count === 1 && p.pay === 100000; })());
        check('set amount of 0 with no interest: never', C.plan(G({ mode: 'amount', pay: 0 }), T).status === 'never');
        check('set amount 0.01 a month for 1,000: more than 100 years', C.plan(G({ mode: 'amount', pay: 1 }), T).status === 'too-long');
        check('interest only (0 a month, 10% on 900 toward 1,000) is reached', (() => { const p = C.plan(G({ mode: 'amount', pay: 0, start: 90000, rate: 10000 }), T); return p.status === 'when' && p.count === 0 && p.date > '2027-10-01' && p.date < '2028-01-01'; })());

        // money already put in this month moves the first payment to next month
        const paid = G({ id: 'paid', target: 300000, start: 120000, date: '2027-06-01', log: [{ id: 'd1', date: '2026-10-02', cents: 22500 }] });
        check('paid 225 on 2 Oct: first payment 2 Nov, 7 payments of 225.00', (() => { const p = C.plan(paid, T); return C.firstPayDate(paid, T) === '2026-11-02' && p.first === '2026-11-02' && p.count === 7 && p.pay === 22500; })());
        check('paid last month: first payment is today', C.firstPayDate(G({ log: [{ id: 'd', date: '2026-09-05', cents: 100 }] }), T) === T);
        check('a withdrawal does not move the first payment', C.firstPayDate(G({ start: 500, log: [{ id: 'd', date: '2026-10-10', cents: -100 }] }), T) === T);
        check('weekly: paid 3 days ago, next is in 4 days', C.firstPayDate(G({ freq: 'week', log: [{ id: 'd', date: '2026-10-09', cents: 100 }] }), T) === '2026-10-16');
        check('saved = start + money in - money out', C.saved(G({ start: 1000, log: [{ cents: 500 }, { cents: -200 }] })) === 1300);
        check('too soon: paid this month and the date is before the next payment', (() => { const p = C.plan(G({ date: '2026-10-30', log: [{ id: 'd', date: '2026-10-02', cents: 100 }] }), T); return p.status === 'too-soon' && p.first === '2026-11-02' && p.rem === 99900; })());

        check('per month: 100 a week is about 433.33 a month, 2 weeks 216.67', C.perMonth(10000, 'week') === 43333 && C.perMonth(10000, '2weeks') === 21667 && C.perMonth(10000, 'month') === 10000);

        // cleaning saved data
        check('clean(null) is empty', C.clean(null).goals.length === 0 && C.clean('x').cur === '');
        check('clean drops goals without a name, target or date', C.clean({ goals: [{ name: '', target: 5 }, { name: 'A', target: 0, date: '2027-01-01' }, { name: 'B', target: 5, mode: 'date', date: 'x' }, 5] }).goals.length === 0);
        check('clean keeps a good goal unchanged', JSON.stringify(C.clean({ cur: '$', goals: [japan, fund, paid] })) === JSON.stringify({ v: 1, cur: '$', goals: [japan, fund, paid] }));
        check('clean fixes bad freq, rate and start', (() => { const g = C.clean({ goals: [{ name: 'A', target: 5, date: '2027-01-01', freq: 'year', rate: 99999, start: -3 }] }).goals[0]; return g.freq === 'month' && g.rate === 0 && g.start === 0; })());
        check('clean never leaves savings below 0', C.saved(C.clean({ goals: [{ name: 'A', target: 5000, date: '2027-01-01', start: 100, log: [{ date: '2026-10-01', cents: -500 }, { date: '2026-10-02', cents: 50 }] }] }).goals[0]) === 0);
        check('clean keeps a negative start when the total is fine (edited after money was added)', (() => { const g = C.clean({ goals: [{ name: 'A', target: 5000, date: '2027-01-01', start: -100, log: [{ date: '2026-10-01', cents: 300 }] }] }).goals[0]; return g.start === -100 && C.saved(g) === 200; })());
        check('clean trims long names to 50 and gives duplicate ids new ones', (() => { const s = C.clean({ goals: [{ id: 'a', name: 'x'.repeat(90), target: 5, date: '2027-01-01' }, { id: 'a', name: 'y', target: 5, date: '2027-01-01' }] }); return s.goals[0].name.length === 50 && s.goals[0].id !== s.goals[1].id; })());
        return r;
    }

    const api = { runTests };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
        if (require.main === module) {
            const res = runTests(require('./core.js'));
            res.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
            const bad = res.filter(t => !t.ok).length;
            console.log('\n' + (res.length - bad) + ' of ' + res.length + ' checks passed');
            process.exit(bad ? 1 : 0);
        }
    } else root.runTests = runTests;
})(this);
