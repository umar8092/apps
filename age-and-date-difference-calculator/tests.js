// Checks on the date maths, against answers worked out by hand. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const P = C.parseISO, D = C.fmtDate;
        const ymd = x => [x.years, x.months, x.days].join('/');

        // ---- dates
        check('1 Jan 1970 is day 0 and a Thursday', P('1970-01-01') === 0 && C.weekday(0) === 4);
        check('11 Oct 2026 is a Sunday', C.DAY_NAMES[C.weekday(P('2026-10-11'))] === 'Sunday');
        check('15 Aug 1990 was a Wednesday', C.DAY_NAMES[C.weekday(P('1990-08-15'))] === 'Wednesday');
        check('year 1000 and 9999 round-trip', C.toISO(P('1000-01-01')) === '1000-01-01' && C.toISO(P('9999-12-31')) === '9999-12-31');
        check('31 April is not a date', P('2026-04-31') === null);
        check('29 Feb 2023 is not a date, 29 Feb 2024 is', P('2023-02-29') === null && P('2024-02-29') !== null);
        check('2000 is leap, 1900 and 2100 are not', C.isLeap(2000) && !C.isLeap(1900) && !C.isLeap(2100));
        check('year 999 and 10000 are out of range', P('0999-12-31') === null && P('10000-01-01') === null);
        check('blank and junk are not dates', P('') === null && P(null) === null && P('12/03/1990') === null && P('2026-1-5') === null);
        check('fmtDate short and long', D(P('2026-10-11')) === 'Sun 11 Oct 2026' && D(P('2026-10-11'), true) === 'Sunday 11 October 2026');
        check('today() uses the device calendar date, not UTC', C.today(new Date(2026, 9, 11, 23, 59)) === P('2026-10-11') && C.today(new Date(2026, 9, 11, 0, 1)) === P('2026-10-11'));

        // ---- 1. Age, the README examples
        let a = C.age(P('1990-08-15'), P('2026-10-11'));
        check('born 15 Aug 1990, on 11 Oct 2026: 36 years, 1 month, 26 days', ymd(a) === '36/1/26');
        check('... 13,206 days in total (36*365 + 9 leap days + 57)', a.totalDays === 13206);
        check('... 433 months and 26 days', a.totalMonths === 433);
        check('... 1,886 weeks and 4 days', a.weeks === 1886 && a.weekDays === 4 && C.weeksText(a.totalDays) === '1,886 weeks and 4 days');
        check('... next birthday: turns 37 on Sun 15 Aug 2027, in 308 days', a.next.turning === 37 && D(a.next.date) === 'Sun 15 Aug 2027' && a.next.inDays === 308);
        check('... wait is 10 months and 4 days', C.ymdText(a.next.wait) === '10 months and 4 days');
        check('... words: 36 years, 1 month and 26 days', C.ymdText(a) === '36 years, 1 month and 26 days');
        a = C.age(P('2002-01-20'), P('2027-01-01'));
        check('job form: born 20 Jan 2002, age on 1 Jan 2027: 24 years, 11 months, 12 days', ymd(a) === '24/11/12');
        a = C.age(P('2000-10-11'), P('2026-10-11'));
        check('birthday today: exactly 26, next is in 365 days', ymd(a) === '26/0/0' && a.birthdayToday && a.next.turning === 27 && a.next.inDays === 365);
        a = C.age(P('2026-10-11'), P('2026-10-11'));
        check('born today: 0 days old, flagged', ymd(a) === '0/0/0' && a.bornToday && !a.birthdayToday && C.ymdText(a) === '0 days');
        check('born after the age-on date: error', C.age(P('2026-10-12'), P('2026-10-11')).err === 'future');
        check('missing date: error', C.age(null, P('2026-10-11')).err === 'date');
        a = C.age(P('2026-10-10'), P('2026-10-11'));
        check('one day old', ymd(a) === '0/0/1' && C.ymdText(a) === '1 day');
        // month ends
        check('born 31 Jan, on 28 Feb 2026: 1 month (no 31 Feb)', ymd(C.age(P('2026-01-31'), P('2026-02-28'))) === '0/1/0');
        check('born 31 Jan, on 1 Mar 2026: 1 month and 1 day', ymd(C.age(P('2026-01-31'), P('2026-03-01'))) === '0/1/1');
        check('born 31 Jan, on 30 Mar 2026: 1 month and 30 days', ymd(C.age(P('2026-01-31'), P('2026-03-30'))) === '0/1/30');
        check('born 31 Jan, on 31 Mar 2026: 2 months', ymd(C.age(P('2026-01-31'), P('2026-03-31'))) === '0/2/0');
        check('born 30 Nov 2025, on 29 Dec 2025: 29 days', ymd(C.age(P('2025-11-30'), P('2025-12-29'))) === '0/0/29');
        // 29 February
        a = C.age(P('2004-02-29'), P('2026-02-28'), 'last');
        check('29 Feb birthday, 28 Feb rule: turns 22 on 28 Feb 2026', ymd(a) === '22/0/0' && a.birthdayToday);
        a = C.age(P('2004-02-29'), P('2026-02-28'), 'next');
        check('29 Feb birthday, 1 March rule: still 21 on 28 Feb 2026, birthday tomorrow', a.years === 21 && a.next.inDays === 1 && D(a.next.date) === 'Sun 1 Mar 2026');
        a = C.age(P('2004-02-29'), P('2028-02-29'), 'next');
        check('29 Feb birthday in a leap year: exactly 24 on 29 Feb 2028 either way', ymd(a) === '24/0/0' && ymd(C.age(P('2004-02-29'), P('2028-02-29'), 'last')) === '24/0/0');
        check('the 1 March rule is ignored for people not born on 29 Feb', C.age(P('2004-01-31'), P('2026-02-28'), 'next').rule === 'last');
        // extremes
        a = C.age(P('1000-01-01'), P('9999-12-31'));
        check('huge: 1000 to 9999 is 8999 years, 11 months, 30 days', ymd(a) === '8999/11/30');

        // ---- 2. Between
        let b = C.between(P('2026-06-01'), P('2026-11-01'), {});
        check('1 Jun to 1 Nov 2026: 153 days', b.days === 153);
        check('... 5 months', C.ymdText(b.ymd) === '5 months');
        check('... 21 weeks and 6 days', b.weeks === 21 && b.weekDays === 6);
        check('... 110 working days (Mon to Fri)', b.workdays === 110);
        check('... last day counted is Sat 31 Oct', D(b.lastCounted) === 'Sat 31 Oct 2026' && D(b.firstCounted) === 'Mon 1 Jun 2026');
        b = C.between(P('2026-06-01'), P('2026-11-01'), { includeEnd: true });
        check('counting the end date: 154 days, 5 months and 1 day, last counted Sun 1 Nov', b.days === 154 && C.ymdText(b.ymd) === '5 months and 1 day' && D(b.lastCounted) === 'Sun 1 Nov 2026');
        check('... working days unchanged (1 Nov is a Sunday)', b.workdays === 110);
        b = C.between(P('2026-10-05'), P('2026-10-09'), { includeEnd: true });
        check('Mon 5 to Fri 9 Oct counting both: 5 days, 5 working days', b.days === 5 && b.workdays === 5);
        b = C.between(P('2026-10-05'), P('2026-10-09'), {});
        check('Mon 5 to Fri 9 Oct not counting the end: 4 days, 4 working days (Mon to Thu)', b.days === 4 && b.workdays === 4 && D(b.lastCounted) === 'Thu 8 Oct 2026');
        b = C.between(P('2026-10-05'), P('2026-10-17'), { includeEnd: true, holidays: [P('2026-10-07'), P('2026-10-07'), P('2026-10-10'), P('2026-12-25')] });
        check('holidays: one weekday off (twice in the list), one on a Saturday, one outside: Mon 5 to Sat 17 Oct is 10 weekdays minus Wed 7 = 9 working days, 1 skipped', b.workdays === 9 && b.holidaysSkipped === 1);
        b = C.between(P('2026-10-04'), P('2026-10-10'), { includeEnd: true, weekend: [5, 6] });
        check('Friday and Saturday weekend: Sun 4 to Sat 10 Oct is 5 working days', b.workdays === 5);
        check('all 7 days off is treated as Sat and Sun', C.cleanWeekend([0, 1, 2, 3, 4, 5, 6]).join() === '0,6');
        b = C.between(P('2026-11-01'), P('2026-06-01'), {});
        check('dates the other way round: still 153 days, flagged as swapped', b.days === 153 && b.swapped && D(b.from) === 'Mon 1 Jun 2026');
        b = C.between(P('2026-10-11'), P('2026-10-11'), {});
        check('same day: 0 days, 0 working days', b.days === 0 && b.workdays === 0 && b.lastCounted === null);
        check('same day counting the end: 1 day', C.between(P('2026-10-11'), P('2026-10-11'), { includeEnd: true }).days === 1);
        b = C.between(P('2023-12-31'), P('2024-12-31'), {});
        check('a leap year: 366 days and 1 year', b.days === 366 && C.ymdText(b.ymd) === '1 year');
        b = C.between(P('2026-03-28'), P('2026-03-30'), {});
        check('across a summer time change: 2 days', b.days === 2);
        b = C.between(P('1000-01-01'), P('9999-12-31'), {});
        check('huge range is quick and exact: 3,287,181 days', b.days === 3287181);
        check('working days over 9000 years equal a day-by-day count rate (5/7)', Math.abs(b.workdays - b.days * 5 / 7) < 3);
        check('countWorkdays agrees with a slow count', (() => { const a0 = P('2026-01-01'), b0 = P('2026-12-31'); let n = 0; for (let d = a0; d <= b0; d++) { const w = C.weekday(d); if (w !== 0 && w !== 6) n++; } return n === C.countWorkdays(a0, b0, [0, 6], []) && n === 261; })());

        // ---- 3. Add or subtract
        const add = (s, n, u, sign, o) => C.addAmount(P(s), n, u, sign || 1, o);
        check('90 days after Sun 11 Oct 2026 is Sat 9 Jan 2027', D(add('2026-10-11', 90, 'days').date) === 'Sat 9 Jan 2027');
        check('30 days before 11 Oct 2026 is Fri 11 Sep 2026', D(add('2026-10-11', 30, 'days', -1).date) === 'Fri 11 Sep 2026');
        check('6 weeks after 11 Oct 2026 is 22 Nov 2026', C.toISO(add('2026-10-11', 6, 'weeks').date) === '2026-11-22');
        let x = add('2026-01-31', 1, 'months');
        check('1 month after 31 Jan 2026 is 28 Feb, and says it moved', C.toISO(x.date) === '2026-02-28' && x.moved && x.wanted.d === 31);
        check('1 month after 31 Jan 2028 is 29 Feb (leap year)', C.toISO(add('2028-01-31', 1, 'months').date) === '2028-02-29');
        check('6 months after 11 Oct 2026 is 11 Apr 2027, not moved', C.toISO(add('2026-10-11', 6, 'months').date) === '2027-04-11' && !add('2026-10-11', 6, 'months').moved);
        check('1 month before 31 Mar 2026 is 28 Feb 2026', C.toISO(add('2026-03-31', 1, 'months', -1).date) === '2026-02-28');
        check('1 year after 29 Feb 2024 is 28 Feb 2025', C.toISO(add('2024-02-29', 1, 'years').date) === '2025-02-28');
        check('13 months after 15 Dec 2026 is 15 Jan 2028', C.toISO(add('2026-12-15', 13, 'months').date) === '2028-01-15');
        check('0 days: the same date', add('2026-10-11', 0, 'days').date === P('2026-10-11'));
        check('5 working days after Fri 9 Oct 2026 is Fri 16 Oct', C.toISO(add('2026-10-09', 5, 'workdays').date) === '2026-10-16');
        check('1 working day after Sat 10 Oct is Mon 12 Oct', C.toISO(add('2026-10-10', 1, 'workdays').date) === '2026-10-12');
        check('1 working day before Mon 12 Oct is Fri 9 Oct', C.toISO(add('2026-10-12', 1, 'workdays', -1).date) === '2026-10-09');
        x = add('2026-10-09', 5, 'workdays', 1, { holidays: [P('2026-10-12'), P('2026-10-10')] });
        check('5 working days after Fri 9 Oct with Mon 12 off: Mon 19 Oct, 1 day skipped (the Saturday holiday does not count)', C.toISO(x.date) === '2026-10-19' && x.holidaysSkipped === 1);
        check('10 working days with a Fri/Sat weekend after Thu 8 Oct: Thu 22 Oct', C.toISO(add('2026-10-08', 10, 'workdays', 1, { weekend: [5, 6] }).date) === '2026-10-22');
        check('big working days jump agrees with a slow count', (() => { const s = P('2026-10-11'); let d = s, left = 1000; while (left) { d++; const w = C.weekday(d); if (w !== 0 && w !== 6) left--; } return add('2026-10-11', 1000, 'workdays').date === d; })());
        check('past year 9999: range error', add('9999-12-01', 31, 'days').err === 'range' && add('9990-01-01', 20, 'years').err === 'range' && add('1000-01-02', 1, 'months', -1).err === 'range');
        check('working days past 9999: range error', add('9999-12-20', 30, 'workdays').err === 'range');
        check('2,000,000 working days from 1000 stays quick and lands on a weekday', (() => { const t = Date.now(), x = add('1000-01-01', 2000000, 'workdays'); return !x.err && Date.now() - t < 500 && C.weekday(x.date) % 6 !== 0; })());
        check('2,500,000 working days from 1000 goes past 9999', add('1000-01-01', 2500000, 'workdays').err === 'range');
        // amounts typed
        check('amount "30" is 30', C.parseAmount('30', 'days').n === 30);
        check('amount " 1,000 " is 1000', C.parseAmount(' 1,000 ', 'days').n === 1000);
        check('amount "+5" is 5', C.parseAmount('+5', 'days').n === 5);
        check('amount blank is blank', C.parseAmount('', 'days').err === 'blank' && C.parseAmount('   ', 'days').err === 'blank');
        check('amount "-5" is negative', C.parseAmount('-5', 'days').err === 'negative');
        check('amount "1.5" is not whole', C.parseAmount('1.5', 'weeks').err === 'whole');
        check('amount "abc" and "1e3" are not numbers', C.parseAmount('abc', 'days').err === 'number' && C.parseAmount('1e3', 'days').err === 'number');
        check('amount over the limit is big', C.parseAmount('9001', 'years').err === 'big' && C.parseAmount('9000', 'years').n === 9000);

        // ---- My dates
        const on = P('2026-10-11');
        let s = C.describeSaved({ name: 'Mum', date: '1966-03-14', kind: 'birthday' }, on);
        check('Mum born 14 Mar 1966: Turns 61 in 154 days, Sun 14 Mar 2027', s.head === 'Turns 61 in 154 days' && s.sub.indexOf('Sun 14 Mar 2027') === 0);
        s = C.describeSaved({ name: 'Wedding', date: '2016-10-12', kind: 'anniversary' }, on);
        check('Wedding 12 Oct 2016: 10th anniversary tomorrow', s.head === '10th anniversary tomorrow');
        s = C.describeSaved({ name: 'Me', date: '2000-10-11', kind: 'birthday' }, on);
        check('birthday today: Today! Turns 26', s.head === 'Today! Turns 26' && s.next.inDays === 0);
        s = C.describeSaved({ name: 'Trip', date: '2026-11-22', kind: 'event' }, on);
        check('trip on 22 Nov: 42 days to go (1 month and 11 days)', s.head === '42 days to go' && s.sub === 'Sun 22 Nov 2026 (1 month and 11 days)');
        s = C.describeSaved({ name: 'Exam', date: '2026-10-12', kind: 'event' }, on);
        check('exam tomorrow: Tomorrow, no months part', s.head === 'Tomorrow' && s.sub === 'Mon 12 Oct 2026');
        s = C.describeSaved({ name: 'Moved in', date: '2026-08-30', kind: 'event' }, on);
        check('past event: 42 days ago', s.head === '42 days ago' && s.next.past);
        s = C.describeSaved({ name: 'Today', date: '2026-10-11', kind: 'event' }, on);
        check('event today: Today', s.head === 'Today');
        s = C.describeSaved({ name: 'Baby due', date: '2027-01-02', kind: 'birthday' }, on);
        check('a birthday in the future (baby due): 83 days to go', s.head === '83 days to go');
        s = C.describeSaved({ name: 'Leap', date: '2004-02-29', kind: 'birthday' }, P('2027-02-27'), 'last');
        check('29 Feb birthday, 28 Feb rule, on 27 Feb 2027: turns 23 tomorrow', s.head === 'Turns 23 tomorrow');
        s = C.describeSaved({ name: 'Leap', date: '2004-02-29', kind: 'birthday' }, P('2027-02-27'), 'next');
        check('... 1 March rule: turns 23 in 2 days', s.head === 'Turns 23 in 2 days');
        check('ordinals: 1st 2nd 3rd 4th 11th 12th 13th 21st 101st 111th', [1, 2, 3, 4, 11, 12, 13, 21, 101, 111].map(C.ordinal).join() === '1st,2nd,3rd,4th,11th,12th,13th,21st,101st,111th');
        const sorted = C.sortSaved([
            { id: 'a', name: 'Past', date: '2026-08-30', kind: 'event' }, { id: 'b', name: 'Mum', date: '1966-03-14', kind: 'birthday' },
            { id: 'c', name: 'Wedding', date: '2016-10-12', kind: 'anniversary' }, { id: 'd', name: 'Trip', date: '2026-11-22', kind: 'event' },
            { id: 'e', name: 'Older past', date: '2026-01-01', kind: 'event' }], on).map(i => i.id).join('');
        check('sorted soonest first, past events last (most recent first)', sorted === 'cdbae');

        // ---- saved state
        check('clean(null) is the default', JSON.stringify(C.clean(null)) === JSON.stringify(C.defaultState()));
        check('clean of junk is the default', C.clean('{bad').mode === 'age' && C.clean([1, 2]).saved.length === 0 && C.clean(42).mode === 'age');
        const c = C.clean({ mode: 'add', birth: '2026-02-31', from: '2026-01-01', unit: 'fortnights', sign: 5, weekend: [6, 6, 9, 'x', 0], amount: 'x'.repeat(50),
            holidays: ['2026-12-25', '2026-12-25', 'nope', 7], saved: [{ id: 'a', name: '  Mum  ', date: '1966-03-14', kind: 'birthday' }, { id: 'a', name: 'Dup id', date: '2020-01-01', kind: 'nope' },
                { name: '', date: '2020-01-01' }, { name: 'Bad date', date: '2020-13-01' }, null, 'str'] });
        check('clean keeps a valid mode and drops a bad date', c.mode === 'add' && c.birth === '' && c.from === '2026-01-01');
        check('clean fixes unit, sign and weekend', c.unit === 'days' && c.sign === 1 && c.weekend.join() === '0,6');
        check('clean cuts long text', c.amount.length === 12);
        check('clean dedupes holidays and drops junk', c.holidays.join() === '2026-12-25');
        check('clean keeps valid saved dates, trims names, fixes duplicate ids and kinds', c.saved.length === 2 && c.saved[0].name === 'Mum' && c.saved[1].id !== 'a' && c.saved[1].kind === 'event');
        check('clean caps saved dates at ' + C.MAX_SAVED, C.clean({ saved: Array.from({ length: 300 }, (_, i) => ({ name: 'n' + i, date: '2020-01-01', kind: 'event' })) }).saved.length === C.MAX_SAVED);
        check('cleanText removes line breaks and control characters', C.cleanText('a\nb\t\u0000c', 60) === 'a b c');
        return r;
    }
    if (typeof module !== 'undefined' && module.exports) {
        const res = runTests(require('./core.js')), bad = res.filter(t => !t.ok);
        res.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
        console.log('\n' + (res.length - bad.length) + ' of ' + res.length + ' checks passed');
        process.exit(bad.length ? 1 : 0);
    } else root.runTests = runTests;
})(this);
