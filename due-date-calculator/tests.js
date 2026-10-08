// Checks on the maths, with answers worked out by hand. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const D = s => C.parseISO(s);
        const due = (o, today) => C.dueDate(o, today === undefined ? undefined : D(today));
        const dueISO = (o) => C.toISO(C.dueDate(o).due);

        check('parseISO rejects 30 February', C.parseISO('2026-02-30') === null);
        check('parseISO rejects junk and blanks', ['', 'abc', '2026-13-01', null, undefined].every(v => C.parseISO(v) === null));
        check('toISO round-trips', C.toISO(D('2028-02-29')) === '2028-02-29');
        check('fmtDate gives weekday, day, month name, year', C.fmtDate(D('2027-06-08')) === 'Tuesday 8 June 2027');

        // Naegele's rule by hand: +7 days, -3 months, +1 year
        check('LMP 1 Sep 2026 -> due Tue 8 Jun 2027', dueISO({ method: 'lmp', date: '2026-09-01' }) === '2027-06-08');
        check('LMP 1 Jan 2026 -> due 8 Oct 2026', dueISO({ method: 'lmp', date: '2026-01-01' }) === '2026-10-08');
        check('LMP 25 Mar 2026 -> due 30 Dec 2026', dueISO({ method: 'lmp', date: '2026-03-25' }) === '2026-12-30');
        check('LMP across a leap day: 1 Jun 2027 -> 7 Mar 2028', dueISO({ method: 'lmp', date: '2027-06-01' }) === '2028-03-07');
        check('LMP 29 Feb 2028 -> 5 Dec 2028', dueISO({ method: 'lmp', date: '2028-02-29' }) === '2028-12-05');
        check('35-day cycle moves the date 7 days later', dueISO({ method: 'lmp', date: '2026-09-01', cycle: 35 }) === '2027-06-15');
        check('24-day cycle moves the date 4 days earlier', dueISO({ method: 'lmp', date: '2026-09-01', cycle: 24 }) === '2027-06-04');
        check('blank or silly cycle length falls back to 28 or the limits', dueISO({ method: 'lmp', date: '2026-09-01', cycle: '' }) === '2027-06-08' && dueISO({ method: 'lmp', date: '2026-09-01', cycle: 999 }) === '2027-06-25');
        check('conception 15 Sep 2026 -> 266 days -> 8 Jun 2027', dueISO({ method: 'conception', date: '2026-09-15' }) === '2027-06-08');
        check('IVF day-5 transfer 1 Feb 2026 -> +261 days = 20 Oct 2026', dueISO({ method: 'ivf', date: '2026-02-01', embryoDay: 5 }) === '2026-10-20');
        check('IVF day-3 transfer 1 Feb 2026 -> +263 days = 22 Oct 2026', dueISO({ method: 'ivf', date: '2026-02-01', embryoDay: 3 }) === '2026-10-22');
        check('scan 8w3d on 1 Jan 2026 -> 280-59 = 221 days -> 10 Aug 2026', dueISO({ method: 'scan', date: '2026-01-01', weeks: 8, days: 3 }) === '2026-08-10');
        check('scan with no weeks is an error', !!due({ method: 'scan', date: '2026-01-01', weeks: '' }).error);
        check('no date is an error', !!due({ method: 'lmp', date: '' }).error);
        check('future last period is an error', !!due({ method: 'lmp', date: '2026-10-09' }, '2026-10-08').error);
        check('today is accepted', !due({ method: 'lmp', date: '2026-10-08' }, '2026-10-08').error);

        const R = due({ method: 'lmp', date: '2026-09-01' });
        let p = C.progress(R, D('2026-10-08'));
        check('37 days in = 5 weeks 2 days', p.weeks === 5 && p.days === 2 && p.age === '5 weeks 2 days');
        check('first trimester, 243 days to go', p.trimester === 1 && p.toGo === 243);
        check('line says it in words', p.line === 'Today you are 5 weeks 2 days pregnant (1st trimester).' && p.togo === '243 days to go (34 weeks 5 days)');
        check('day 0 = 0 weeks', C.progress(R, D('2026-09-01')).age === '0 days');
        check('13w6d is still trimester 1, 14w0d is trimester 2', C.progress(R, D('2026-09-01') + 97).trimester === 1 && C.progress(R, D('2026-09-01') + 98).trimester === 2);
        check('27w6d is trimester 2, 28w0d is trimester 3', C.progress(R, D('2026-09-01') + 195).trimester === 2 && C.progress(R, D('2026-09-01') + 196).trimester === 3);
        p = C.progress(R, D('2027-06-08'));
        check('on the due date: 40 weeks, due today', p.age === '40 weeks' && p.line === 'Your due date is today.' && p.percent === 100);
        p = C.progress(R, D('2027-06-11'));
        check('3 days late is reported plainly', p.line === 'Your due date was 3 days ago (40 weeks 3 days).' && p.togo === '3 days past the due date');
        check('1 day to go is singular', C.progress(R, D('2027-06-07')).togo === '1 day to go');
        check('very old dates warn', C.progress(R, D('2027-09-01')).notes.length === 1);

        const M = C.milestones(R, D('2026-10-08'));
        check('milestone 12 weeks is 24 Nov 2026 and in 47 days', C.toISO(M.find(m => m.weeks === 12).date) === '2026-11-24' && M.find(m => m.weeks === 12).status === 'in 47 days');
        check('6 weeks (13 Oct) is still ahead, none passed yet', M[0].status === 'in 5 days' && M.every(m => m.status !== 'passed'));
        check('40-week milestone equals the due date', M[M.length - 1].date === R.due);
        check('passed / today statuses', C.milestones(R, D('2026-10-13'))[0].status === 'today' && C.milestones(R, D('2026-10-14'))[0].status === 'passed');

        const s = C.summary(R, D('2026-10-08'));
        check('summary has the due date and the age', s.includes('Estimated due date: Tuesday 8 June 2027') && s.includes('5 weeks 2 days'));
        check('summary has no currency symbols', !/[$€£¥]/.test(s));
        const ics = C.ics(R);
        check('calendar file is an all-day event on the due date', ics.includes('DTSTART;VALUE=DATE:20270608') && ics.includes('DTEND;VALUE=DATE:20270609') && ics.startsWith('BEGIN:VCALENDAR'));
        return r;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = runTests; else root.runTests = runTests;
    if (typeof require !== 'undefined' && require.main === module) {
        const res = runTests(require('./core.js'));
        res.filter(t => !t.ok).forEach(t => console.log('FAIL', t.name));
        console.log(res.filter(t => t.ok).length + ' of ' + res.length + ' checks passed');
        process.exit(res.every(t => t.ok) ? 0 : 1);
    }
})(typeof self !== 'undefined' ? self : this);
