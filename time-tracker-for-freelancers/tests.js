// Logic checks with hand-worked answers. Run: node tests.js  (or open test.html)
(function () {
    'use strict';
    var T = typeof module === 'object' ? require('./core.js') : window.TT;
    var pass = 0, fails = [];
    function eq(got, want, what) {
        var g = JSON.stringify(got), w = JSON.stringify(want);
        if (g === w) pass++; else fails.push(what + ': got ' + g + ', want ' + w);
    }

    // ---- rates people type ----
    eq(T.parseMoney('40').cents, 4000, 'rate 40');
    eq(T.parseMoney('$40.50').cents, 4050, 'rate $40.50');
    eq(T.parseMoney('1,200').cents, 120000, 'rate 1,200');
    eq(T.parseMoney('1.200').cents, 120000, 'rate 1.200 (thousands)');
    eq(T.parseMoney('1.200,50').cents, 120050, 'rate 1.200,50');
    eq(T.parseMoney('40,5').cents, 4050, 'rate 40,5');
    eq(T.parseMoney('Rs 1,500').cents, 150000, 'rate Rs 1,500');
    eq(T.parseMoney('0').cents, 0, 'rate 0');
    eq(T.parseMoney('').empty, true, 'rate blank');
    eq(T.parseMoney('   ').empty, true, 'rate spaces');
    eq(!!T.parseMoney('-5').error, true, 'rate below zero refused');
    eq(!!T.parseMoney('abc').error, true, 'rate words refused');
    eq(T.parseMoney('40.555').cents, 4055500, '40.555 read as thousands (the form shows the rate it read)');
    eq(!!T.parseMoney('40,555.123').error, true, 'rate 3 decimals refused');
    eq(!!T.parseMoney('200000').error, true, 'rate too big refused');

    // ---- how long ----
    eq(T.parseDuration('1:30').min, 90, '1:30');
    eq(T.parseDuration('1h 30m').min, 90, '1h 30m');
    eq(T.parseDuration('1 h 30 min').min, 90, '1 h 30 min');
    eq(T.parseDuration('1.5').min, 90, '1.5');
    eq(T.parseDuration('1,5').min, 90, '1,5');
    eq(T.parseDuration('45m').min, 45, '45m');
    eq(T.parseDuration('45 minutes').min, 45, '45 minutes');
    eq(T.parseDuration('2h').min, 120, '2h');
    eq(T.parseDuration('2 hours').min, 120, '2 hours');
    eq(T.parseDuration('0:05').min, 5, '0:05');
    eq(!!T.parseDuration('90').error, true, '90 alone = 90 hours refused');
    eq(/90m/.test(T.parseDuration('90').error), true, '90 alone suggests 90m');
    eq(!!T.parseDuration('0').error, true, '0 refused');
    eq(!!T.parseDuration('').error, true, 'blank refused');
    eq(!!T.parseDuration('25h').error, true, 'over 24 h refused');
    eq(!!T.parseDuration('1:75').error, true, '1:75 refused');
    eq(!!T.parseDuration('abc').error, true, 'words refused');
    eq(!!T.parseDuration('-1').error, true, 'minus refused');

    // ---- showing ----
    eq(T.fmtDur(0), '0 min', 'fmt 0');
    eq(T.fmtDur(45), '45 min', 'fmt 45');
    eq(T.fmtDur(60), '1 h', 'fmt 60');
    eq(T.fmtDur(67), '1 h 07 min', 'fmt 67');
    eq(T.fmtDur(1500), '25 h', 'fmt 25 h');
    eq(T.fmtDecimal(225), '3.75', 'decimal 225');
    eq(T.fmtDecimal(445), '7.42', 'decimal 445');
    eq(T.fmtMoney(123456789, '$'), '$1,234,567.89', 'money $');
    eq(T.fmtMoney(4250, 'Rs'), 'Rs 42.50', 'money Rs');
    eq(T.fmtMoney(5, ''), '0.05', 'money plain');
    eq(T.fmtClockSec(3725), '1:02:05', 'clock');

    // ---- periods (today Thursday 15 Oct 2026) ----
    var today = '2026-10-15';
    eq(T.periodRange('week', today, 1), { from: '2026-10-12', to: '2026-10-18' }, 'week from Monday');
    eq(T.periodRange('week', today, 0), { from: '2026-10-11', to: '2026-10-17' }, 'week from Sunday');
    eq(T.periodRange('week', today, 6), { from: '2026-10-10', to: '2026-10-16' }, 'week from Saturday');
    eq(T.periodRange('week', '2026-10-12', 1), { from: '2026-10-12', to: '2026-10-18' }, 'week on its first day');
    eq(T.periodRange('lastweek', today, 1), { from: '2026-10-05', to: '2026-10-11' }, 'last week');
    eq(T.periodRange('month', today, 1), { from: '2026-10-01', to: '2026-10-31' }, 'this month');
    eq(T.periodRange('lastmonth', today, 1), { from: '2026-09-01', to: '2026-09-30' }, 'last month');
    eq(T.periodRange('lastmonth', '2026-01-03', 1), { from: '2025-12-01', to: '2025-12-31' }, 'last month over new year');
    eq(T.periodRange('month', '2028-02-10', 1), { from: '2028-02-01', to: '2028-02-29' }, 'leap February');
    eq(T.periodRange('custom', today, 1, '2026-10-20', '2026-10-01'), { from: '2026-10-01', to: '2026-10-20' }, 'custom dates the other way round');
    eq(T.periodRange('custom', today, 1, '', '2026-10-01'), null, 'custom with a blank date');
    eq(T.isDate('2026-02-30'), false, '30 Feb is not a date');

    // ---- time added afterwards ----
    var r = T.entryFromForm({ mode: 'times', date: '2026-10-14', start: '22:30', finish: '01:15' }, today);
    eq([r.entry.start, r.entry.sec, r.nextDay], [1350, 9900, true], 'past midnight 22:30-01:15 = 2 h 45 min');
    eq(T.crossesMidnight(r.entry), true, 'crosses midnight');
    r = T.entryFromForm({ mode: 'times', date: '2026-10-14', start: '09:00', finish: '17:30' }, today);
    eq([r.entry.sec / 60, r.nextDay], [510, false], '09:00-17:30 = 8 h 30 min');
    eq(T.entryFromForm({ mode: 'times', date: '2026-10-14', start: '09:00', finish: '09:00' }, today).field, 'finish', 'same start and finish refused');
    eq(T.entryFromForm({ mode: 'times', date: '2026-10-14', start: '', finish: '09:00' }, today).field, 'start', 'blank start refused');
    eq(T.entryFromForm({ mode: 'times', date: '2026-10-16', start: '09:00', finish: '10:00' }, today).field, 'date', 'future day refused');
    eq(T.entryFromForm({ mode: 'times', date: '', start: '09:00', finish: '10:00' }, today).field, 'date', 'blank day refused');
    r = T.entryFromForm({ mode: 'length', date: today, length: '1h 15m' }, today);
    eq([r.entry.start, r.entry.sec], [null, 4500], 'just how long 1h 15m');
    eq(T.entryFromForm({ mode: 'length', date: today, length: 'x' }, today).field, 'length', 'bad length refused');

    // ---- the timer ----
    var start = new Date(2026, 9, 15, 9, 0, 0).getTime();
    var tr = T.entryFromTimer({ client: 'c1', task: '  Logo   redesign ', startMs: start }, start + 4020 * 1000, { rate: 4000 });
    eq([tr.entry.date, tr.entry.start, tr.entry.sec, tr.entry.rate, tr.entry.task], ['2026-10-15', 540, 4020, 4000, 'Logo redesign'], 'timer 09:00 for 1 h 07 min');
    eq(T.entryFromTimer({ client: 'c1', task: '', startMs: start }, start + 20000, null).tooShort, true, 'under 30 seconds not saved');
    eq(!!T.entryFromTimer({ client: 'c1', task: '', startMs: start }, start + 25 * 3600000, null).error, true, 'over 24 hours asks for the stop time');
    eq(!!T.entryFromTimer({ client: 'c1', task: '', startMs: start }, start - 60000, null).error, true, 'stop before start refused');
    var late = new Date(2026, 9, 14, 23, 30, 0).getTime();
    tr = T.entryFromTimer({ client: 'c1', task: '', startMs: late }, late + 2 * 3600000, { rate: 0 });
    eq([tr.entry.date, tr.entry.start, T.crossesMidnight(tr.entry)], ['2026-10-14', 1410, true], 'timer past midnight belongs to the day it started');

    // ---- rounding and money ----
    eq(T.roundUp(67, 15), 75, '67 min rounded up to 15 = 75');
    eq(T.roundUp(60, 15), 60, '60 stays 60');
    eq(T.roundUp(1, 6), 6, '1 min up to 6');
    eq(T.roundUp(67, 0), 67, 'exact');
    eq(T.centsFor(7, 4000), 467, '7 min at 40.00 = 4.67 (odd cents)');
    eq(T.centsFor(445, 4000), 29667, '7 h 25 min at 40.00 = 296.67');
    eq(T.entryMin({ sec: 89 }), 1, '89 s = 1 min');
    eq(T.entryMin({ sec: 90 }), 2, '90 s = 2 min');

    // ---- the worked week ----
    var acme = { id: 'c1', name: 'Acme Ltd', rate: 4000, sym: '$', round: 15 };
    var beta = { id: 'c2', name: 'Beta Books', rate: 2550, sym: '£', round: 0 };
    var free = { id: 'c3', name: 'Charity', rate: 0, sym: '', round: 0 };
    var st = { clients: [acme, beta, free], entries: [
        { id: 'e1', client: 'c1', task: 'Logo redesign', date: '2026-10-12', start: 540, sec: 4020, rate: 4000, billable: true, bill: null },
        { id: 'e2', client: 'c1', task: 'logo redesign', date: '2026-10-13', start: 840, sec: 9000, rate: 4000, billable: true, bill: null },
        { id: 'e3', client: 'c1', task: 'Website fixes', date: '2026-10-13', start: null, sec: 3000, rate: 4000, billable: true, bill: null },
        { id: 'e4', client: 'c2', task: 'Copywriting', date: '2026-10-14', start: 600, sec: 6000, rate: 2550, billable: true, bill: null },
        { id: 'e5', client: 'c1', task: 'Sales call', date: '2026-10-14', start: 900, sec: 1800, rate: 4000, billable: false, bill: null },
        { id: 'e6', client: 'c3', task: 'Poster', date: '2026-10-15', start: 600, sec: 3600, rate: 0, billable: true, bill: null },
        { id: 'e7', client: 'c1', task: 'Logo redesign', date: '2026-10-05', start: 540, sec: 3600, rate: 4000, billable: true, bill: null }
    ] };
    var week = T.periodRange('week', today, 1);
    var sum = T.summarize(st, week);
    var a = sum.clients[0];
    eq(a.client.name, 'Acme Ltd', 'most hours first');
    eq([a.min, a.chargedMin, a.cents, a.freeMin], [297, 285, 19000, 30], 'Acme: worked 4 h 57, charged 4 h 45 = 190.00, 30 min free');
    eq(a.lines.map(function (l) { return [l.task, l.chargedMin, l.cents]; }), [['Logo redesign', 225, 15000], ['Website fixes', 60, 4000]], 'Acme lines grouped by work (case ignored)');
    eq(T.invoiceText(a, '12 Oct - 18 Oct 2026'), [
        'Acme Ltd - 12 Oct - 18 Oct 2026',
        'Logo redesign: 3 h 45 min (3.75 h) x $40.00/h = $150.00',
        'Website fixes: 1 h (1.00 h) x $40.00/h = $40.00',
        'Total: 4 h 45 min (4.75 h) = $190.00',
        'Also worked, not charged: 30 min',
        'Each entry rounded up to the next 15 minutes.'].join('\n'), 'Acme invoice text');
    var b = sum.clients.filter(function (t) { return t.client.id === 'c2'; })[0];
    eq([b.chargedMin, b.cents], [100, 4250], 'Beta 1 h 40 min at 25.50 = 42.50');
    eq(T.moneyLine(sum.money), '$190.00 + £42.50', 'money per currency, no-rate client left out');
    var c = sum.clients.filter(function (t) { return t.client.id === 'c3'; })[0];
    eq(T.invoiceText(c, 'x'), 'Charity - x\nPoster: 1 h (1.00 h)\nTotal: 1 h (1.00 h)', 'hours only for a client with no rate');
    eq(sum.min, 297 + 100 + 60, 'all clients minutes');
    eq(T.summarize(st, T.periodRange('lastweek', today, 1)).clients[0].cents, 4000, 'last week only has e7');
    eq(T.summarize({ clients: [acme], entries: [] }, week).clients.length, 0, 'empty week');

    // billing freezes the charged minutes; later rounding changes do not alter billed time
    st.entries[0].bill = { at: today, min: 75 };
    acme.round = 0;
    var s2 = T.summarize(st, week);
    eq(s2.clients[0].lines[0].chargedMin, 75 + 150, 'billed entry keeps its 75 min');
    var un = T.summarize(st, T.periodRange('unbilled', today, 1), 'unbilled');
    var ua = un.clients.filter(function (t) { return t.client.id === 'c1'; })[0];
    eq([ua.min, ua.cents], [150 + 50 + 60, T.centsFor(260, 4000)], 'not billed yet leaves out billed and not-charged time');
    acme.round = 15;
    st.entries[0].bill = null;

    // ---- overlaps ----
    var x = { id: 'n', date: '2026-10-12', start: 570, sec: 1800 };
    eq(T.overlaps(x, st.entries).map(function (o) { return o.id; }), ['e1'], '09:30 overlaps 09:00-10:07');
    eq(T.overlaps({ id: 'n', date: '2026-10-12', start: 607, sec: 600 }, st.entries).length, 0, 'starting when the other ends is fine');
    eq(T.overlaps({ id: 'n', date: '2026-10-13', start: 15, sec: 600 }, [{ id: 'm', date: '2026-10-12', start: 1410, sec: 3600 }]).length, 1, 'overlap past midnight');
    eq(T.overlaps({ id: 'n', date: '2026-10-13', start: null, sec: 600 }, st.entries).length, 0, 'just-how-long never overlaps');

    // ---- spreadsheet ----
    var csv = T.toCSV({ clients: [acme], entries: [{ id: 'z', client: 'c1', task: '=SUM(A1), "big"', date: '2026-10-12', start: 1410, sec: 3600, rate: 4000, billable: true, bill: null }] }, week);
    eq(csv.split('\r\n')[1], '2026-10-12,23:30,00:30,Acme Ltd,"\'=SUM(A1), ""big""",60,60,1.00,40.00,40.00,$,Not billed yet', 'csv row with formula guard and midnight');

    // ---- saved data ----
    eq(T.validate(null).clients.length, 0, 'nothing saved');
    eq(T.validate('junk').entries.length, 0, 'junk saved');
    var v = T.validate({ clients: [{ id: 'c5', name: '  Big   Co ', rate: 5000, sym: '€', round: 6 }, { id: 'c5', name: 'dupe' }, { id: 'c6', name: '' }, { id: 'c7', name: 'X', rate: -4, sym: '<b>', round: 7 }],
        entries: [{ id: 'e9', client: 'c5', task: 't', date: '2026-10-01', start: 60, sec: 600, rate: 5000 },
            { id: 'e10', client: 'nope', date: '2026-10-01', sec: 600 }, { id: 'e11', client: 'c5', date: '2026-13-01', sec: 600 },
            { id: 'e12', client: 'c5', date: '2026-10-01', sec: -5 }, { id: 'e13', client: 'c5', date: '2026-10-01', sec: 600, start: 5000 },
            { id: 'e14', client: 'c5', date: '2026-10-01', sec: 600, bill: { at: 'x', min: 3 } }],
        timer: { client: 'c5', task: 'go', startMs: 'soon' }, weekStart: 3, period: 'evil', nextId: 2 });
    eq(v.clients.map(function (c) { return [c.id, c.name, c.rate, c.sym, c.round]; }), [['c5', 'Big Co', 5000, '€', 6], ['c7', 'X', 0, '', 0]], 'clients checked');
    eq(v.entries.map(function (e) { return e.id; }), ['e9', 'e14'], 'bad entries dropped');
    eq(v.entries[1].bill, null, 'bad bill dropped');
    eq([v.timer, v.weekStart, v.period, v.nextId], [null, 1, 'week', 15], 'timer, settings and next id checked');

    var msg = pass + ' checks passed' + (fails.length ? ', ' + fails.length + ' FAILED:\n' + fails.join('\n') : '');
    if (typeof module === 'object') { console.log(msg); if (fails.length) process.exit(1); }
    else { var pre = document.createElement('pre'); pre.textContent = msg; document.body.appendChild(pre); }
})();
