// Checks on the maths. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const d = (s, e, b) => ({ s, e, b: b == null ? '0' : String(b) });

        check('parseTime 09:30', C.parseTime('09:30') === 570);
        check('parseTime rejects 24:00, 12:60, blank, junk', ['24:00', '12:60', '', 'abc', null].every(v => C.parseTime(v) === null));
        check('parseBreak junk and negatives are 0', ['', 'x', '-5', null].every(v => C.parseBreak(v) === 0));
        check('parseBreak 30 and capped', C.parseBreak('30') === 30 && C.parseBreak('99999') === 720);
        check('parseMoney 12.50, 12,5, 0.005', C.parseMoney('12.50') === 1250 && C.parseMoney('12,5') === 1250 && C.parseMoney('0.005') === 1);
        check('parseMoney junk is 0', ['', 'abc', '-5', '.', null].every(v => C.parseMoney(v) === 0));
        check('parseMult 1.5 -> 150, 0.5 -> 100, 99 -> 1000', C.parseMult('1.5') === 150 && C.parseMult('0.5') === 100 && C.parseMult('99') === 1000);

        check('9:00-17:30 break 30 = 8h', C.shift(d('09:00', '17:30', 30)).minutes === 480);
        check('night shift 22:00-06:00 = 8h, overnight', C.shift(d('22:00', '06:00')).minutes === 480 && C.shift(d('22:00', '06:00')).overnight);
        check('night shift with break 30 = 7h30', C.shift(d('22:00', '06:00', 30)).minutes === 450);
        check('crossing midnight 23:45-00:15 = 30m', C.shift(d('23:45', '00:15')).minutes === 30);
        check('start = finish is 0 and flagged', C.shift(d('09:00', '09:00')).minutes === 0 && C.shift(d('09:00', '09:00')).state === 'same');
        check('break longer than shift is 0 and flagged', C.shift(d('09:00', '09:20', 30)).minutes === 0 && C.shift(d('09:00', '09:20', 30)).state === 'break');
        check('empty day is blank 0', C.shift(d('', '')).state === 'blank' && C.shift(d('09:00', '')).minutes === 0);
        check('rounding to 15: 8h07 -> 8h00, 8h08 -> 8h15', C.shift(d('09:00', '17:07'), 15).minutes === 480 && C.shift(d('09:00', '17:08'), 15).minutes === 495);
        check('rounding to 5: 8h02 -> 8h00, 8h03 -> 8h05', C.shift(d('09:00', '17:02'), 5).minutes === 480 && C.shift(d('09:00', '17:03'), 5).minutes === 485);

        // The worked example in the README
        const wk = [d('09:00', '17:30', 30), d('09:00', '18:00', 30), d('08:30', '17:00', 60), d('09:00', '19:00', 30), d('09:00', '17:00', 30), d('22:00', '06:00', 30), d('', '')];
        const a = C.week(wk, {});
        check('example week total 2910 min = 48h 30m, 6 days', a.total === 2910 && a.worked === 6 && C.fmtHM(a.total) === '48h 30m' && C.fmtDec(a.total) === '48.50');
        check('no overtime limit: all regular', a.overtime === 0 && a.regular === 2910);
        const b = C.week(wk, { thrMin: 2400, rate: 2000, mult: 150 });
        check('overtime after 40h: 40h regular + 8h30 overtime', b.regular === 2400 && b.overtime === 510);
        check('pay 20/h, x1.5: 800.00 + 255.00 = 1055.00', b.payRegular === 80000 && b.payOvertime === 25500 && C.fmtMoney(b.pay) === '1,055.00');
        check('under the limit has no overtime', C.week([d('09:00', '17:00')], { thrMin: 2400, rate: 1000, mult: 150 }).overtime === 0);
        check('odd cents round half up: 20 min at 10.01/h = 3.34', C.week([d('09:00', '09:20')], { rate: 1001 }).pay === 334);
        check('fmtMoney 0, 5, 1234567.8', C.fmtMoney(0) === '0.00' && C.fmtMoney(5) === '0.05' && C.fmtMoney(123456780) === '1,234,567.80');
        check('fmtHM 0, 59m, 1h', C.fmtHM(0) === '0h' && C.fmtHM(59) === '0h 59m' && C.fmtHM(60) === '1h');
        check('fmtDec 20 min = 0.33', C.fmtDec(20) === '0.33');
        check('hhmm', C.hhmm(570) === '09:30' && C.hhmm(0) === '00:00');
        check('empty week is all zero', C.week([], {}).total === 0);
        return r;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = runTests;
        if (require.main === module) {
            const res = runTests(require('./core.js'));
            res.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
            const bad = res.filter(t => !t.ok).length;
            console.log(res.length - bad + ' of ' + res.length + ' passed');
            process.exit(bad ? 1 : 0);
        }
    } else root.runTests = runTests;
})(typeof self !== 'undefined' ? self : this);
