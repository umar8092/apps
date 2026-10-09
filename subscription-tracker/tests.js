// Checks on the maths. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const sub = o => Object.assign({ id: 'x', name: 'X', price: 1000, every: 1, unit: 'month', date: '', status: 'active', note: '' }, o);
        const P = v => C.parsePrice(v);

        // typing and pasting prices
        check('9.99 -> 999 cents', P('9.99').cents === 999);
        check('9,99 (comma decimal) -> 999', P('9,99').cents === 999);
        check('$1,299.00 pasted -> 129900', P('$1,299.00').cents === 129900);
        check('1.299,00 € (European) -> 129900', P('1.299,00 €').cents === 129900);
        check('1,299 (thousands) -> 129900', P('1,299').cents === 129900);
        check('"  12 " -> 1200', P('  12 ').cents === 1200);
        check('0 is allowed (free plan)', P('0').cents === 0);
        check('.5 -> 50', P('.5').cents === 50);
        check('rounds the third decimal half up: 1.005 -> 101, 1.004 -> 100', P('1.005').cents === 101 && P('1.004').cents === 100);
        check('blank is an error', P('').err === 'blank' && P('   ').err === 'blank');
        check('negative is an error', P('-5').err === 'negative');
        check('words are an error', P('abc').err === 'nan' && P('1.2.3').err === 'nan' && P('.').err === 'nan');
        check('over 1,000,000 is too big', P('1000000.01').err === 'big' && P('99999999999').err === 'big' && P('1000000').cents === 100000000);

        check('fmt 107264 -> 1,072.64', C.fmt(107264) === '1,072.64');
        check('fmt with $ and with kr', C.fmt(999, '$') === '$9.99' && C.fmt(999, 'kr') === 'kr 9.99');
        check('fmt 0 and 5 cents', C.fmt(0) === '0.00' && C.fmt(5) === '0.05');

        // yearly and monthly cost
        check('15.49 monthly = 185.88 a year, 15.49 a month', C.yearly(sub({ price: 1549 })) === 18588 && C.monthly(sub({ price: 1549 })) === 1549);
        check('10.00 weekly = 520.00 a year (52 weeks), 43.33 a month', C.yearly(sub({ price: 1000, unit: 'week' })) === 52000 && C.monthly(sub({ price: 1000, unit: 'week' })) === 4333);
        check('139.00 yearly = 11.58 a month', C.monthly(sub({ price: 13900, unit: 'year' })) === 1158);
        check('every 4 weeks 12.00 = 156.00 a year', C.yearly(sub({ price: 1200, unit: 'week', every: 4 })) === 15600);
        check('every 3 months 30.00 = 120.00 a year', C.yearly(sub({ price: 3000, every: 3 })) === 12000);
        check('every 2 years 100.00 = 50.00 a year', C.yearly(sub({ price: 10000, unit: 'year', every: 2 })) === 5000);
        check('daily 1.00 = 365.00 a year', C.yearly(sub({ price: 100, unit: 'day' })) === 36500);
        check('odd cents: 9.99 every 7 months = 17.13 a year', C.yearly(sub({ price: 999, every: 7 })) === 1713);

        // dates
        check('31 Jan + 1 month = 28 Feb (2027), + 2 = 31 Mar', C.addMonths('2027-01-31', 1) === '2027-02-28' && C.addMonths('2027-01-31', 2) === '2027-03-31');
        check('leap year: 31 Jan 2028 + 1 month = 29 Feb', C.addMonths('2028-01-31', 1) === '2028-02-29');
        check('29 Feb yearly -> 28 Feb next year, 29 Feb in 4 years', C.nth(sub({ date: '2028-02-29', unit: 'year' }), 1) === '2029-02-28' && C.nth(sub({ date: '2028-02-29', unit: 'year' }), 4) === '2032-02-29');
        check('December + 1 month crosses the year', C.addMonths('2026-12-15', 1) === '2027-01-15');
        const m31 = sub({ date: '2026-01-31' });
        check('a past monthly date rolls forward to the next payment', C.nextOn(m31, '2026-10-09') === '2026-10-31');
        check('rolls forward keeping the 31st after a short month', C.nextOn(m31, '2026-11-01') === '2026-11-30' && C.nextOn(m31, '2026-12-01') === '2026-12-31');
        check('a date today is due today', C.nextOn(sub({ date: '2026-10-09' }), '2026-10-09') === '2026-10-09');
        check('a future date stays', C.nextOn(sub({ date: '2027-03-01' }), '2026-10-09') === '2027-03-01');
        check('weekly rolls forward by whole weeks', C.nextOn(sub({ date: '2026-09-01', unit: 'week' }), '2026-10-09') === '2026-10-13');
        check('every 2 weeks rolls forward', C.nextOn(sub({ date: '2026-09-01', unit: 'week', every: 2 }), '2026-10-09') === '2026-10-13' && C.nextOn(sub({ date: '2026-09-01', unit: 'week', every: 2 }), '2026-10-14') === '2026-10-27');
        check('years-old date rolls forward fast and right', C.nextOn(sub({ date: '2001-03-15', unit: 'day', every: 3 }), '2026-10-09') === C.addDays('2001-03-15', 3 * Math.ceil(C.diff('2001-03-15', '2026-10-09') / 3)));
        check('no date -> no next payment', C.nextOn(sub({ date: '' }), '2026-10-09') === null);
        check('weekly payments in a 30-day window', C.between(sub({ date: '2026-10-10', unit: 'week' }), '2026-10-09', '2026-11-07').join() === '2026-10-10,2026-10-17,2026-10-24,2026-10-31,2026-11-07');

        // the worked example in the README (today Fri 9 Oct 2026)
        const T = '2026-10-09';
        const list = [
            sub({ id: 'n', name: 'Netflix', price: 1549, date: '2026-10-12' }),
            sub({ id: 's', name: 'Spotify', price: 1199, date: '2026-09-21' }),
            sub({ id: 'i', name: 'iCloud+', price: 299, date: '2026-10-28' }),
            sub({ id: 'a', name: 'Amazon Prime', price: 13900, unit: 'year', date: '2027-03-02' }),
            sub({ id: 'g', name: 'Gym', price: 1000, unit: 'week', date: '2026-10-05' }),
            sub({ id: 't', name: 'The Daily News', price: 400, date: '2026-10-14', status: 'trial' }),
            sub({ id: 'd', name: 'Disney+', price: 1399, status: 'cancelled', date: '2026-10-20' }),
            sub({ id: 'p', name: 'Audible', price: 1495, status: 'paused', date: '2026-10-15' })
        ];
        const s = C.summary(list, T);
        check('6 subscriptions counted (paused and cancelled left out)', s.count === 6 && s.paused === 1 && s.cancelled === 1);
        check('total 1,072.64 a year', s.year === 107264);
        check('total 89.39 a month', s.month === 8939);
        check('cancelling Disney+ saves 167.88 a year', s.saved === 16788);
        check('first coming up: Gym 10.00 on Mon 12 Oct and Netflix 15.49 the same day (bigger first)', s.upcoming[0].name === 'Netflix' && s.upcoming[0].date === '2026-10-12' && s.upcoming[1].name === 'Gym');
        check('the trial shows as trial end on 14 Oct', s.upcoming.some(u => u.name === 'The Daily News' && u.trialEnd && u.date === '2026-10-14'));
        check('trial ending in 5 days is flagged', s.trialsSoon.length === 1 && s.trialsSoon[0].days === 5);
        // next 7 days (9-15 Oct): Netflix 15.49 + Gym 10.00 (12th) + Daily News 4.00 (14th) = 29.49
        check('next 7 days = 29.49', s.next7 === 2949);
        // next 30 days (9 Oct - 7 Nov): Netflix 15.49, Spotify 11.99 (21 Oct), iCloud 2.99, Gym x4 (12,19,26 Oct, 2 Nov) 40.00, News 4.00 = 74.47
        check('next 30 days = 74.47', s.next30 === 7447);
        check('Spotify rolled forward to 21 Oct', s.upcoming.some(u => u.name === 'Spotify' && u.date === '2026-10-21'));
        check('Amazon Prime is not in the next 30 days', !s.upcoming.some(u => u.name === 'Amazon Prime'));
        check('biggest cost is the gym (520.00 a year, 48%)', s.biggest[0].name === 'Gym' && s.biggest[0].pct === 48 && s.biggest[0].month === 4333);
        check('biggest list has at most 5', s.biggest.length === 5);
        check('a trial whose date passed counts as paying', C.status(sub({ status: 'trial', date: '2026-10-01' }), T) === 'active');
        check('no duplicates in the example', s.dups.length === 0);
        check('same name twice is flagged (case and spaces ignored)', C.summary([sub({ name: 'Netflix' }), sub({ id: 'y', name: ' netflix ' })], T).dups.length === 1);
        check('a cancelled copy is not a duplicate', C.summary([sub({ name: 'Netflix' }), sub({ id: 'y', name: 'Netflix', status: 'cancelled' })], T).dups.length === 0);
        check('missing date is listed so the person can add it', C.summary([sub({ name: 'Gym', date: '' })], T).undated[0] === 'Gym');
        const e = C.summary([], T);
        check('empty list: all zero, nothing coming up', e.count === 0 && e.year === 0 && e.month === 0 && e.upcoming.length === 0 && e.biggest.length === 0);
        check('a free (0.00) plan counts but is not in biggest', C.summary([sub({ price: 0 })], T).count === 1 && C.summary([sub({ price: 0 })], T).biggest.length === 0);

        // saved data and backups
        check('clean keeps a valid subscription', JSON.stringify(C.clean(list[0], 0)) === JSON.stringify(list[0]));
        check('clean rejects blank name, negative price, bad unit, every 0', [{ name: '', price: 1, every: 1, unit: 'month' }, { name: 'a', price: -1, every: 1, unit: 'month' }, { name: 'a', price: 1, every: 1, unit: 'decade' }, { name: 'a', price: 1, every: 0, unit: 'month' }].every(x => C.clean(x, 0) === null));
        check('clean caps the name, drops a bad date and bad status', (() => { const c = C.clean({ name: 'x'.repeat(99), price: 5, every: 1, unit: 'week', date: '2026-02-30', status: 'zzz' }, 0); return c.name.length === 60 && c.date === '' && c.status === 'active'; })());
        check('cleanList reads a backup file object and an array', C.cleanList({ subs: list }).length === 8 && C.cleanList(list).length === 8);
        check('cleanList returns null for junk', C.cleanList('nope') === null && C.cleanList({}) === null && C.cleanList(null) === null);
        check('cleanList skips bad rows and fixes duplicate ids', (() => { const c = C.cleanList([list[0], list[0], 5, null]); return c.length === 2 && c[0].id !== c[1].id; })());

        // calendar file
        const cal = C.ics(list, T, '$', '20261009T120000Z');
        check('calendar: 6 subscriptions, paused and cancelled left out', cal.count === 6 && !/Disney|Audible/.test(cal.text));
        check('calendar: Netflix repeats monthly from 12 Oct with a reminder the day before', /DTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261013\r\nSUMMARY:Netflix payment: \$15.49/.test(cal.text) && /RRULE:FREQ=MONTHLY\r\n/.test(cal.text) && /TRIGGER:-P1D/.test(cal.text));
        check('calendar: gym weekly, Prime yearly', /RRULE:FREQ=WEEKLY/.test(cal.text) && /RRULE:FREQ=YEARLY/.test(cal.text));
        check('calendar: trial end warning 2 days before, payments from the next month', /SUMMARY:The Daily News free trial ends/.test(cal.text) && /TRIGGER:-P2D/.test(cal.text) && /DTSTART;VALUE=DATE:20261114\r\nDTEND;VALUE=DATE:20261115\r\nSUMMARY:The Daily News payment/.test(cal.text));
        check('calendar: on the 31st it uses the last day of shorter months', C.rrule(sub({ date: '2026-01-31' })) === 'RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1');
        check('calendar: every 3 months', C.rrule(sub({ date: '2026-01-05', every: 3 })) === 'RRULE:FREQ=MONTHLY;INTERVAL=3');
        check('calendar: commas and semicolons in names are escaped', /SUMMARY:A\\, B\\; C payment/.test(C.ics([sub({ name: 'A, B; C', date: '2026-10-10' })], T, '', 'x').text));
        check('calendar: CRLF line endings, lines folded under 76', C.ics([sub({ name: 'y'.repeat(60), date: '2026-10-10' })], T, '', 'x').text.split('\r\n').every(l => l.length <= 75));
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
