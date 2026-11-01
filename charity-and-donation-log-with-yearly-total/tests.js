// Logic checks for core.js. Run: node tests.js  (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.GIVING;
    let pass = 0, fail = 0; const out = [];
    const eq = (a, b, name) => { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) pass++; else { fail++; out.push('FAIL ' + name + ': got ' + A + ', want ' + B); } };

    // typed amounts
    eq(C.parseMoney('5000').n, 500000, 'plain');
    eq(C.parseMoney('1,00,000').n, 10000000, 'lakh');
    eq(C.parseMoney('Rs 2,500.50').n, 250050, 'with Rs');
    eq(C.parseMoney(' 12 345 ').n, 1234500, 'spaces');
    eq(C.parseMoney('12,5').n, 1250, 'comma decimal');
    eq(C.parseMoney('1.234').n, 123400, 'dot as thousands');
    eq(!!C.parseMoney('').error, true, 'blank');
    eq(!!C.parseMoney('0').error, true, 'zero');
    eq(!!C.parseMoney('-50').error, true, 'negative');
    eq(!!C.parseMoney('abc').error, true, 'letters');
    eq(!!C.parseMoney('0.125').error, true, '3 decimals');
    eq(!!C.parseMoney('999999999999').error, true, 'too big');
    eq(C.parseMoney('100000000').n, 10000000000, 'max ok');

    // years
    eq(C.yearOf('2026-11-01', '07-01'), { y: 2026, from: '2026-07-01', to: '2027-06-30', label: '2026-27' }, 'Pakistan year');
    eq(C.yearOf('2026-06-30', '07-01').label, '2025-26', 'day before July');
    eq(C.yearOf('2027-04-05', '04-06').label, '2026-27', 'UK 5 April');
    eq(C.yearOf('2027-04-06', '04-06').label, '2027-28', 'UK 6 April');
    eq(C.yearOf('2026-03-31', '04-01').label, '2025-26', 'India 31 March');
    eq(C.yearOf('2026-12-31', '01-01'), { y: 2026, from: '2026-01-01', to: '2026-12-31', label: '2026' }, 'calendar');
    eq(C.yearOf('2026-05-05', 'bad').label, '2026', 'bad start falls back');
    eq(C.guessYearStart('Asia/Karachi'), '07-01', 'tz PK');
    eq(C.guessYearStart('Asia/Kolkata'), '04-01', 'tz IN');
    eq(C.guessYearStart('Europe/London'), '04-06', 'tz UK');
    eq(C.guessYearStart('America/New_York'), '01-01', 'tz US');

    // regular gifts
    const m31 = { start: '2026-01-31', freq: 'month', n: 0 };
    eq([0, 1, 2, 3].map(k => C.occ(m31, k)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'], 'monthly on the 31st');
    eq(C.occ({ start: '2028-02-29', freq: 'year' }, 1), '2029-02-28', 'yearly from 29 Feb');
    eq(C.occ({ start: '2026-10-30', freq: 'week' }, 2), '2026-11-13', 'weekly');
    const plan = { start: '2026-07-01', freq: 'month', n: 4, stopped: '' };
    eq(C.duesOf(plan, '2026-11-01'), [{ k: 4, date: '2026-11-01' }], 'one due today');
    eq(C.duesOf(plan, '2026-10-31'), [], 'nothing due yet');
    eq(C.dueCount(Object.assign({}, plan, { n: 1 }), '2026-11-01'), 4, 'four due');
    eq(C.duesOf(Object.assign({}, plan, { n: 1 }), '2026-11-01', 2).length, 2, 'cap');
    eq(C.duesOf(Object.assign({}, plan, { stopped: '2026-10-02' }), '2026-12-01'), [], 'stopped plan has no dues');
    eq(C.nextOf(plan), '2026-11-01', 'next');
    eq(C.dueCount({ start: '2000-01-01', freq: 'week', n: 0 }, '2200-01-01'), 5000, 'huge count capped');
    eq(C.freqWords({ freq: 'month', start: '2026-07-01' }), 'Every month on the 1st', 'words 1st');
    eq(C.freqWords({ freq: 'month', start: '2026-07-22' }), 'Every month on the 22nd', 'words 22nd');
    eq(C.freqWords({ freq: 'month', start: '2026-07-11' }), 'Every month on the 11th', 'words 11th');
    eq(C.freqWords({ freq: 'month', start: '2026-07-31' }), 'Every month on the 31st (or the last day)', 'words 31st');
    eq(C.freqWords({ freq: 'week', start: '2026-10-16' }), 'Every Friday', 'words Friday');
    eq(C.freqWords({ freq: 'year', start: '2026-03-19' }), 'Every year on 19 Mar', 'words year');

    // Ayesha's year (README example): 1 July to 30 June, today Sun 1 Nov 2026
    const G = (date, to, amt, kind, how, receipt, behalf) => ({ id: 'g' + date + to, date, to, amt: amt * 100, kind, how, receipt, behalf: behalf || '', note: '', plan: '' });
    const raw = { gifts: [
        G('2026-07-01', 'Edhi Foundation', 5000, 'Sadqa', 'bank', 'kept'), G('2026-08-01', 'Edhi Foundation', 5000, 'Sadqa', 'bank', 'kept'),
        G('2026-09-01', 'Edhi Foundation', 5000, 'Sadqa', 'bank', 'kept'), G('2026-10-01', 'Edhi Foundation', 5000, 'Sadqa', 'bank', 'kept'),
        G('2026-07-03', 'Ration drive at the office', 8000, 'Help to someone in need', 'goods', 'none'),
        G('2026-08-07', 'Masjid Al-Noor', 10000, 'General donation', 'bank', 'todo'),
        G('2026-08-20', "Neighbour's family", 25000, 'Zakat', 'cash', 'none'),
        G('2026-09-12', 'Shaukat Khanum Hospital', 50000, 'Zakat', 'cheque', 'kept'),
        G('2026-09-28', 'The Citizens Foundation', 15000, 'General donation', 'online', 'todo'),
        G('2026-10-05', 'Al-Khidmat Foundation', 10000, 'Zakat', 'bank', 'todo', 'Ammi'),
        G('2026-10-16', 'masjid al-noor ', 2500, 'Sadqa', 'cash', 'none'),
        G('2026-03-19', 'Masjid Al-Noor', 2400, 'Fitrana', 'cash', 'none')],
        plans: [{ id: 'r1', start: '2026-07-01', freq: 'month', n: 4, to: 'Edhi Foundation', amt: 500000, kind: 'Sadqa', how: 'bank', receipt: 'kept' }],
        pledges: [{ id: 'p1', to: 'Masjid Al-Noor', amt: 3000000, from: '2026-08-01' }], cur: 'Rs', yearStart: '07-01', goal: 20000000 };
    const st = C.cleanState(raw), T = '2026-11-01', yr = C.yearOf(T, st.yearStart);
    eq(st.gifts.length, 12, 'all gifts kept');
    eq(st.gifts[10].to, 'masjid al-noor', 'name tidied');
    const s = C.yearStats(st, yr.from, yr.to);
    eq(s.total, 14050000, 'year total 140,500');
    eq(s.count, 11, '11 gifts');
    eq(s.causeList.length, 7, '7 causes (same masjid in two spellings)');
    eq(s.own, 13050000, 'own giving 130,500');
    eq(s.behalfList.map(b => [b.name, b.total]), [['Ammi', 1000000]], 'on behalf of Ammi');
    eq(s.kindList.map(k => [k.name, k.total]), [['Zakat', 8500000], ['General donation', 2500000], ['Sadqa', 2250000], ['Help to someone in need', 800000]], 'by kind');
    eq([s.receipts.kept.n, s.receipts.kept.amt, s.receipts.todo.n, s.receipts.todo.amt, s.receipts.none.n, s.receipts.none.amt], [5, 7000000, 3, 3500000, 3, 3550000], 'receipts');
    eq(s.receipts.todo.list.map(g => g.to), ['Masjid Al-Noor', 'The Citizens Foundation', 'Al-Khidmat Foundation'], 'receipts to get');
    eq(s.causeList[0].name, 'Shaukat Khanum Hospital', 'top cause');
    eq(s.causeList.find(c => C.norm(c.name) === 'masjid al-noor').total, 1250000, 'masjid merged');
    eq(s.months.length, 12, '12 months');
    eq(s.months.map(m => m.total / 100).slice(0, 5), [13000, 40000, 70000, 17500, 0], 'months Jul to Nov');
    const g = C.goalStats(st.goal, s.total, yr, T);
    eq([g.left, g.pct, g.monthsLeft, g.perMonth, g.reached], [5950000, 70, 8, 743750, false], 'goal: 59,500 left, 7,437.50 a month for 8 months');
    eq(C.goalStats(0, 5, yr, T), null, 'no goal');
    const past = C.yearFrom(2025, '07-01');
    const gp = C.goalStats(st.goal, C.yearStats(st, past.from, past.to).total, past, T);
    eq([gp.past, gp.monthsLeft, gp.left], [true, 0, 19760000], 'past year short');
    eq(C.goalStats(100, 150, yr, T).over, 50, 'over the goal');
    eq(C.goalStats(100, 150, yr, T).pct, 100, 'pct capped at 100');
    eq(C.goalStats(300, 100, yr, '2027-06-15').monthsLeft, 1, 'last month');
    eq(C.goalStats(300, 100, yr, '2027-06-15').perMonth, 200, 'last month rest');
    eq(C.goalStats(10, 1, { from: '2026-01-01', to: '2026-12-31' }, '2026-10-01').perMonth, 3, 'per month rounds up (9 / 3)');
    eq(C.goalStats(10, 0, { from: '2026-01-01', to: '2026-12-31' }, '2026-06-01').perMonth, 2, '10 cents over 7 months rounds up');
    const pl = C.pledgeStats(st, st.pledges[0]);
    eq([pl.paid, pl.count, pl.left, pl.done, pl.pct], [1250000, 2, 1750000, false, 41], 'promise: paid 12,500 of 30,000 (fitrana in March not counted)');
    eq(C.pledgeStats(st, { to: 'Edhi Foundation', amt: 1000000, from: '2026-07-01' }).over, 1000000, 'over-paid promise');
    eq(C.names(st, 'to')[0], 'masjid al-noor', 'newest name first');
    eq(C.names(st, 'to').filter(n => C.norm(n) === 'masjid al-noor').length, 1, 'names unique');
    eq(C.kinds({ gifts: [{ kind: 'Qurbani share' }, { kind: 'zakat' }], plans: [] }).slice(-1), ['Qurbani share'], 'custom kind added once');

    // words
    eq(C.fmtMoney(14050000, 'Rs', 'en-US'), 'Rs 140,500', 'money Rs');
    eq(C.fmtMoney(743750, '$', 'en-US'), '$7,437.50', 'money $');
    eq(C.fmtMoney(5, '', 'en-US'), '0.05', 'money plain');
    const txt = C.summaryText(st, yr, T, 'en-US');
    eq(txt.split('\n').slice(0, 4), ['My giving for 2026-27 (1 Jul 2026 to 30 Jun 2027)', 'Given: Rs 140,500 in 11 gifts to 7 causes', 'Of this, on behalf of others: Ammi Rs 10,000. My own giving: Rs 130,500',
        'Yearly goal Rs 200,000: Rs 59,500 still to give (about Rs 7,437.50 a month)'], 'summary top');
    eq(txt.includes('- Receipt still to get: 3 gifts, Rs 35,000'), true, 'summary receipts');
    const csv = C.csv(st, yr.from, yr.to).split('\r\n');
    eq(csv[0], 'Date,Given to,Amount (Rs),Kind,How paid,Receipt,On behalf of,Note', 'csv head');
    eq(csv.length, 13, 'csv rows + end');
    eq(csv[1], '2026-07-01,Edhi Foundation,5000,Sadqa,Bank transfer,Receipt kept,,', 'csv first row');
    eq(C.csv({ gifts: [G('2026-01-01', '=HYPERLINK("x")', 1, 'Sadqa', 'cash', 'none')], cur: '' }, '2026-01-01', '2026-12-31').split('\r\n')[1].split(',')[1], '"\'=HYPERLINK(""x"")"', 'csv formula made safe');

    // saved data
    eq(C.cleanState(null), null, 'null state');
    eq(C.cleanState({ gifts: 'x' }), null, 'bad gifts');
    eq(C.cleanState({ gifts: [] }).yearStart, '01-01', 'defaults');
    const junk = C.cleanState({ gifts: [{ date: '2026-02-30', to: 'x', amt: 5 }, { date: '2026-02-03', to: ' ', amt: 5 }, { date: '2026-02-03', to: 'x', amt: -5 }, { date: '2026-02-03', to: 'x', amt: 1.5 },
        { id: 'a', date: '2026-02-03', to: 'x'.repeat(99), amt: 5, how: 'gold', receipt: 'maybe', kind: '' }, { id: 'a', date: '2026-02-03', to: 'y', amt: 5 }],
        plans: [{ start: '2026-01-01', freq: 'daily', to: 'x', amt: 5 }, { start: '2026-01-01', freq: 'week', to: 'x', amt: 5, n: -3 }], pledges: [{ to: 'x', amt: 0, from: '2026-01-01' }], cur: 'TOOLONG', goal: -1 });
    eq(junk.gifts.length, 2, 'bad gifts dropped');
    eq([junk.gifts[0].to.length, junk.gifts[0].how, junk.gifts[0].receipt, junk.gifts[0].kind], [60, 'cash', 'none', 'General donation'], 'gift fixed');
    eq(junk.gifts[0].id !== junk.gifts[1].id, true, 'ids unique');
    eq([junk.plans.length, junk.plans[0].n, junk.pledges.length, junk.cur, junk.goal], [1, 0, 0, '', 0], 'plans, pledges, settings cleaned');
    eq(C.tidy('a\u0000b\n  c', 10), 'a b c', 'tidy');

    const msg = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') { document.body.textContent = msg + '\n' + out.join('\n'); document.title = fail ? 'FAIL' : 'PASS'; }
    else { out.forEach(x => console.log(x)); console.log(msg); if (fail) process.exit(1); }
})();
