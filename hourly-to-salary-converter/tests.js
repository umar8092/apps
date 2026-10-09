// Checks on the maths, against examples worked out by hand. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const job = o => C.readJob(Object.assign({ pay: '', per: 'hour', hours: '40', days: 5, paid: '', unpaid: '', ot: '', mult: '1.5' }, o));
        const M = v => C.parseMoney(v);

        // typing and pasting money
        check('22.50 -> 2250 cents', M('22.50').cents === 2250);
        check('22,50 (comma decimal) -> 2250', M('22,50').cents === 2250);
        check('45,000 -> 4500000', M('45,000').cents === 4500000);
        check('$ 45,000.00 pasted -> 4500000', M('$ 45,000.00').cents === 4500000);
        check('45.000,00 € (European) -> 4500000', M('45.000,00 €').cents === 4500000);
        check('1.234.567 (dots as thousands) -> 123456700', M('1.234.567').cents === 123456700);
        check('0 is allowed', M('0').cents === 0);
        check('blank, negative, words are errors', M('  ').err === 'blank' && M('-5').err === 'negative' && M('abc').err === 'nan' && M('1.2.3').err === 'nan');
        check('over 100,000,000 is too big', M('100000000.01').err === 'big' && M('100000000').cents === 10000000000);
        check('third decimal rounds half up: 1.005 -> 101', M('1.005').cents === 101 && M('1.004').cents === 100);
        check('hours 37.5 and 37,5 -> 3750', C.parseNum('37.5', 100).v === 3750 && C.parseNum('37,5', 100).v === 3750);

        // 1. the classic: 20 an hour, 40 hours, 5 days
        let x = job({ pay: '20' }).res;
        check('20/h x 40h: day 160, week 800, 2 weeks 1,600', x.hour === 2000 && x.day === 16000 && x.week === 80000 && x.twoWeeks === 160000);
        check('20/h x 40h: year 41,600 (x 2,080 hours), month 3,466.67', x.year === 4160000 && x.month === 346667 && x.hoursYear === 2080);
        check('no time off and no overtime: per hour actually worked = hourly rate', x.eff === 2000 && !x.effDiffers);

        // 2. salary to hourly: 45,000 a year, 40 hours
        x = job({ pay: '45000', per: 'year' }).res;
        check('45,000/yr: hour 21.63, day 173.08, week 865.38, month 3,750.00', x.hour === 2163 && x.day === 17308 && x.week === 86538 && x.month === 375000 && x.year === 4500000);
        check('45,000/yr: every 2 weeks 1,730.77 (rounded from the exact value, not 2 x 865.38)', x.twoWeeks === 173077);

        // 3. the README example, job 1: 22.50 an hour, 37.5 hours, 20 unpaid days
        x = job({ pay: '22.50', hours: '37.5', unpaid: '20' }).res;
        check('agency job: day 168.75 (7.5 h), week 843.75, 2 weeks 1,687.50', x.day === 16875 && x.dayHours === 750 && x.week === 84375 && x.twoWeeks === 168750);
        check('agency job: 43,875 full year minus 3,375 for 20 unpaid days = 40,500', x.full === 4387500 && x.unpaidCut === 337500 && x.year === 4050000);
        check('agency job: month 3,375.00, 1,800 hours in 48 weeks, 22.50 per hour worked', x.month === 337500 && x.hoursYear === 1800 && x.weeksWorked === 48 && x.eff === 2250);

        // 4. job 2: 43,000 a year, 45 hours, 33 paid holiday days
        x = job({ pay: '43000', per: 'year', hours: '45', paid: '33' }).res;
        check('office job: hour 18.38, day 165.38, week 826.92, 2 weeks 1,653.85, month 3,583.33', x.hour === 1838 && x.day === 16538 && x.week === 82692 && x.twoWeeks === 165385 && x.month === 358333);
        check('office job: paid holiday does not lower the year (43,000)', x.year === 4300000 && x.unpaidCut === 0);
        check('office job: 45.4 weeks, 2,043 hours, 21.05 per hour actually worked', x.weeksWorked === 45.4 && x.hoursYear === 2043 && x.eff === 2105 && x.effDiffers);

        // 5. compare them
        const cmp = C.compare([{ name: 'Agency job', res: job({ pay: '22.50', hours: '37.5', unpaid: '20' }).res }, { name: 'Office job', res: x }]);
        check('office job pays 2,500.00 more a year and 208.33 more a month', cmp.top.name === 'Office job' && cmp.rows[0].less === 250000 && cmp.rows[0].lessMonth === 20833);
        check('but per hour you actually work the agency job pays more', cmp.hourDiffers && cmp.hourTop.name === 'Agency job');
        const tie = C.compare([{ name: 'A', res: job({ pay: '20' }).res }, { name: 'B', res: job({ pay: '41600', per: 'year' }).res }]);
        check('20/h x 40h and 41,600 a year are a tie', tie.tie && tie.hourTie && !tie.hourDiffers);
        check('one job only: nothing to compare', C.compare([{ name: 'A', res: job({ pay: '20' }).res }]) === null);
        check('an unfinished job is left out of the comparison', C.compare([{ name: 'A', res: job({ pay: '20' }).res }, { name: 'B', res: null }]) === null);

        // 6. overtime: 20/h, 40h + 5h at 1.5x, 10 paid days (2 weeks) -> overtime only in the 50 weeks at work
        x = job({ pay: '20', ot: '5', mult: '1.5', paid: '10' }).res;
        check('overtime: week 800 + 150 = 950, 2 weeks 1,900', x.week === 95000 && x.twoWeeks === 190000);
        check('overtime: 7,500 a year (50 weeks x 150), year 49,100', x.otYear === 750000 && x.year === 4910000);
        check('overtime: hour and day stay the normal rate', x.hour === 2000 && x.day === 16000);
        check('overtime: 2,250 hours worked, 21.82 per hour worked', x.hoursYear === 2250 && x.eff === 2182);
        check('overtime at 2x and custom 1.25x', job({ pay: '20', ot: '1', mult: '2' }).res.otYear === 208000 && job({ pay: '20', ot: '4', mult: '1.25' }).res.week === 90000);

        // 7. other periods
        check('150 a day, 4 days, 32 hours: hour 18.75, week 600, year 31,200', (x = job({ pay: '150', per: 'day', days: 4, hours: '32' }).res) && x.hour === 1875 && x.week === 60000 && x.year === 3120000);
        check('1,000 a week: year 52,000, month 4,333.33', (x = job({ pay: '1000', per: 'week' }).res) && x.year === 5200000 && x.month === 433333);
        check('1,500 every 2 weeks: week 750, year 39,000', (x = job({ pay: '1500', per: '2week' }).res) && x.week === 75000 && x.year === 3900000);
        check('3,000 a month: year 36,000, month 3,000, hour 17.31', (x = job({ pay: '3000', per: 'month' }).res) && x.year === 3600000 && x.month === 300000 && x.hour === 1731);
        check('3,000 a month with 10 unpaid days: year 36,000 - 1,384.62 = 34,615.38', (x = job({ pay: '3000', per: 'month', unpaid: '10' }).res) && x.year === 3461538 && x.unpaidCut === 138462);
        check('half days: 2.5 unpaid days on 20/h = 41,600 - 400 = 41,200', job({ pay: '20', unpaid: '2.5' }).res.year === 4120000);
        check('part time 20 h, 3 days: day 133.33 (6.67 h)', (x = job({ pay: '20', hours: '20', days: 3 }).res) && x.day === 13333 && x.dayHours === 667);

        // 8. odd and extreme inputs
        check('0 pay gives all zeros', (x = job({ pay: '0' }).res) && x.year === 0 && x.hour === 0 && x.eff === 0);
        check('blank pay is not an error message, just waiting', job({}).errs.pay === 'blank' && !job({}).ok);
        check('negative pay is refused', /negative/.test(job({ pay: '-20' }).errs.pay));
        check('words for pay are refused', /number/.test(job({ pay: 'twenty' }).errs.pay));
        check('0 hours, blank hours, 169 hours are refused', job({ pay: '20', hours: '0' }).errs.hours && job({ pay: '20', hours: '' }).errs.hours && job({ pay: '20', hours: '169' }).errs.hours);
        check('168 hours is allowed', job({ pay: '1', hours: '168' }).ok);
        check('quarter-day off is refused (whole or half days)', /half/.test(job({ pay: '20', unpaid: '1.25' }).errs.unpaid));
        check('days off over the year are refused', /more than the 260/.test(job({ pay: '20', paid: '200', unpaid: '61' }).errs.unpaid));
        check('a whole year unpaid: year 0, no per-hour-worked figure', (x = job({ pay: '20', unpaid: '260' }).res) && x.year === 0 && x.eff === null);
        check('overtime that pushes past 168 hours is refused', job({ pay: '20', hours: '160', ot: '9' }).errs.ot);
        check('overtime rate under 1x or over 5x is refused', job({ pay: '20', ot: '5', mult: '0.5' }).errs.mult && job({ pay: '20', ot: '5', mult: '6' }).errs.mult);
        check('blank overtime hours ignore the rate', job({ pay: '20', ot: '', mult: 'zzz' }).ok);
        check('huge: 100,000,000 a year stays exact', job({ pay: '100000000', per: 'year' }).res.month === 833333333);
        check('huge: 100,000,000 an hour x 168 h does not lose cents', job({ pay: '100000000', hours: '168' }).res.year === 87360000000000);
        check('bad per and bad days fall back to hour and 5', (x = job({ pay: '20', per: 'fortnight', days: 'x' })) && x.job.per === 'hour' && x.job.days === 5);

        check('fmt 4387500 -> 43,875.00, with $ and with Rs', C.fmt(4387500) === '43,875.00' && C.fmt(999, '$') === '$9.99' && C.fmt(999, 'Rs') === 'Rs 9.99');
        check('num 37.5, 2043, 45.4', C.num(37.5) === '37.5' && C.num(2043) === '2,043' && C.num(45.4) === '45.4');
        return r;
    }
    if (typeof module !== 'undefined' && module.exports && require.main === module) {
        const r = runTests(require('./core.js'));
        r.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
        const bad = r.filter(t => !t.ok).length;
        console.log('\n' + (r.length - bad) + ' of ' + r.length + ' checks passed');
        process.exit(bad ? 1 : 0);
    } else root.runTests = runTests;
})(this);
