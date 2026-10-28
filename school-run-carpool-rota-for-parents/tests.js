// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.CarpoolCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const ok = (name, cond) => eq(name, !!cond, true);

    // three families who start sharing the school run on Mon 26 Oct 2026
    function group(start) {
        const s = C.emptyState(start || '2026-10-26');
        const fam = (name, kids, extra) => { const f = Object.assign({ id: s.nextId++, name, kids: [], seats: 4, no: [], away: [], joined: s.start, left: null }, extra || {});
            kids.forEach(k => f.kids.push({ id: s.nextId++, name: k, rides: 'both' })); s.families.push(f); return f; };
        fam('Ayesha', ['Ali', 'Sara']); fam('Bilal', ['Omar']); fam('Hina', ['Zain'], { no: ['2am', '2pm'] });
        return s;
    }
    const id = (s, n) => s.families.find(f => f.name === n).id;
    const kid = (s, n) => { for (const f of s.families) for (const k of f.kids) if (k.name === n) return k.id; };
    const who = (r, s, k, run) => { const d = r.days[k]; return d && d.runs[run] && d.runs[run].d != null ? C.famName(s, d.runs[run].d) : null; };
    const week = (s, mon, today) => { const r = C.compute(s, today || mon, C.addDays(mon, 6)); const o = [];
        for (let i = 0; i < 5; i++) { const k = C.addDays(mon, i); o.push((who(r, s, k, 'am') || '-') + '/' + (who(r, s, k, 'pm') || '-')); } return o; };

    // ---------- dates ----------
    eq('weekday of Wed 28 Oct 2026', C.weekday('2026-10-28'), 3);
    eq('Monday of a Sunday', C.mondayOf('2026-11-01'), '2026-10-26');
    eq('Monday across new year', C.mondayOf('2027-01-01'), '2026-12-28');
    eq('add days over summer time change', C.addDays('2026-10-24', 2), '2026-10-26');
    eq('leap day is a date', C.isKey('2028-02-29'), true);
    eq('30 Feb is not a date', C.isKey('2026-02-30'), false);
    eq('short date', C.shortDate('2026-10-28'), 'Wed 28 Oct');
    eq('month after December', C.addMonths('2026-12', 1), '2027-01');
    eq('month before January', C.addMonths('2027-01', -1), '2026-12');
    eq('today key uses the local date', C.todayKey(new Date(2026, 9, 29, 0, 5)), '2026-10-29');

    // ---------- money ----------
    eq('plain amount', C.parseMoney('300'), 30000);
    eq('decimals', C.parseMoney('2.5'), 250);
    eq('thousands', C.parseMoney('1,200.50'), 120050);
    eq('lakhs', C.parseMoney('1,20,000'), 12000000);
    eq('comma decimal', C.parseMoney('12,50'), 1250);
    eq('european', C.parseMoney('1.299,00'), 129900);
    eq('pasted with symbol', C.parseMoney(' $ 4.75 '), 475);
    eq('Rs prefix', C.parseMoney('Rs. 350'), 35000);
    ok('blank refused', isNaN(C.parseMoney('')));
    ok('negative refused', isNaN(C.parseMoney('-5')));
    ok('words refused', isNaN(C.parseMoney('ten')));
    ok('three decimals refused', isNaN(C.parseMoney('1.234')));
    ok('huge refused', isNaN(C.parseMoney('99999999999')));
    eq('zero allowed', C.parseMoney('0'), 0);
    eq('money with symbol', C.money(123456, '$'), '$1,234.56');
    eq('money with code', C.money(30000, 'Rs'), 'Rs 300.00');
    eq('money plain', C.money(-15000, ''), '-150.00');

    // ---------- the fair rota (worked by hand) ----------
    // Mon: Ayesha / Bilal. Tue (Hina cannot drive on Tuesdays): Ayesha / Bilal. Wed: Hina catches up in the morning, Ayesha
    // in the afternoon (Hina already drove that day). Thu: Hina / Bilal. Fri: Hina / Ayesha.
    let s = group();
    eq('first week', week(s, '2026-10-26'), ['Ayesha/Bilal', 'Ayesha/Bilal', 'Hina/Ayesha', 'Hina/Bilal', 'Hina/Ayesha']);
    let r = C.compute(s, '2026-10-30', '2026-10-30');
    eq('drives after the first week', [r.drives[id(s, 'Ayesha')], r.drives[id(s, 'Bilal')], r.drives[id(s, 'Hina')]], [4, 3, 3]);
    r = C.compute(s, '2026-10-26', '2027-01-29');
    let tot = { Ayesha: 0, Bilal: 0, Hina: 0 };
    Object.values(r.days).forEach(d => C.RUNS.forEach(x => { if (d.runs[x] && d.runs[x].d) tot[C.famName(s, d.runs[x].d)]++; }));
    ok('over 14 weeks nobody is more than one drive apart', Math.max(...Object.values(tot)) - Math.min(...Object.values(tot)) <= 1);
    eq('140 drives in 14 weeks', tot.Ayesha + tot.Bilal + tot.Hina, 140);
    ok('Hina never drives on a Tuesday', Object.keys(r.days).every(k => C.weekday(k) !== 2 || C.RUNS.every(x => who(r, s, k, x) !== 'Hina')));
    eq('all the children ride', C.kidNames(s, r.days['2026-10-26'].runs.am.k), ['Ali', 'Sara', 'Omar', 'Zain']);
    ok('weekends have no drives', !r.days['2026-10-31'] && !r.days['2026-11-01']);

    // ---------- one-way and odd settings ----------
    s = group(); s.runs.pm = false;
    eq('mornings only', week(s, '2026-10-26'), ['Ayesha/-', 'Bilal/-', 'Hina/-', 'Ayesha/-', 'Bilal/-']);
    s = group(); s.days = [1, 3, 5];
    r = C.compute(s, '2026-10-26', '2026-11-01'); eq('only Mon, Wed, Fri', Object.keys(r.days), ['2026-10-26', '2026-10-28', '2026-10-30']);
    s = group(); s.families[0].kids[1].rides = 'am';
    r = C.compute(s, '2026-10-26', '2026-10-26');
    eq('a child who only rides in the morning', [C.kidNames(s, r.days['2026-10-26'].runs.am.k).length, C.kidNames(s, r.days['2026-10-26'].runs.pm.k)], [4, ['Ali', 'Omar', 'Zain']]);
    s = group(); s.families[0].no = ['1pm', '2pm', '3pm', '4pm', '5pm'];
    ok('a family that only drives mornings never gets an afternoon', Object.values(C.compute(s, '2026-10-26', '2026-11-27').days).every(d => !d.runs.pm || C.famName(s, d.runs.pm.d) !== 'Ayesha'));

    // ---------- holidays, days off, away ----------
    s = group(); s.holidays.push({ from: '2026-10-28', to: '2026-10-29', name: 'Half term' });
    r = C.compute(s, '2026-10-26', '2026-10-30');
    eq('holiday has no drives', [r.days['2026-10-28'].off, Object.keys(r.days['2026-10-28'].runs).length], ['Half term', 0]);
    eq('rota carries on after the holiday', who(r, s, '2026-10-30', 'am'), 'Hina');
    s = group(); s.over['2026-10-26'] = { off: true };
    eq('one day off', week(s, '2026-10-26').slice(0, 2), ['-/-', 'Ayesha/Bilal']);
    s = group(); s.families[0].away.push({ from: '2026-10-26', to: '2026-10-27', name: '' });
    r = C.compute(s, '2026-10-26', '2026-10-27');
    eq('family away: does not drive and its children do not ride', [who(r, s, '2026-10-26', 'am'), C.kidNames(s, r.days['2026-10-26'].runs.am.k)], ['Bilal', ['Omar', 'Zain']]);

    // ---------- swaps, children off sick, nobody free ----------
    s = group(); s.over['2026-10-26'] = { am: { driver: id(s, 'Hina') } };
    r = C.compute(s, '2026-10-26', '2026-10-26');
    eq('swap: Hina drives instead', [who(r, s, '2026-10-26', 'am'), r.days['2026-10-26'].runs.am.sw], ['Hina', true]);
    eq('the rota rebalances after a swap', week(s, '2026-10-26').slice(0, 2), ['Hina/Ayesha', 'Bilal/Ayesha']);
    s = group(); s.over['2026-10-26'] = { am: { out: [kid(s, 'Zain')] } };
    r = C.compute(s, '2026-10-26', '2026-10-26');
    eq('child off sick is left out', C.kidNames(s, r.days['2026-10-26'].runs.am.k), ['Ali', 'Sara', 'Omar']);
    eq('...only for that ride', C.kidNames(s, r.days['2026-10-26'].runs.pm.k).length, 4);
    s = group(); s.over['2026-10-26'] = { pm: { out: s.families.flatMap(f => f.kids.map(k => k.id)) } };
    r = C.compute(s, '2026-10-26', '2026-10-27');
    eq('nobody riding: no drive and nobody charged', [r.days['2026-10-26'].runs.pm.d, r.drives[id(s, 'Bilal')]], [null, 0]);
    s = group(); s.families.forEach(f => { f.no = ['1am']; });
    r = C.compute(s, '2026-10-26', '2026-10-26');
    eq('nobody can drive Monday morning', [r.days['2026-10-26'].runs.am.d, r.days['2026-10-26'].runs.am.k.length], [null, 4]);
    eq('the week text says so', C.runLine(s, r.days['2026-10-26'].runs.am, 'am'), 'Morning: NOBODY CAN DRIVE yet (Ali, Sara, Omar, Zain)');

    // ---------- seats ----------
    s = group(); s.families[0].seats = 3;
    r = C.compute(s, '2026-10-26', '2026-10-26');
    eq('4 children: the 3-seat car is passed over', who(r, s, '2026-10-26', 'am'), 'Bilal');
    s = group(); s.families.forEach(f => { f.seats = 2; });
    r = C.compute(s, '2026-10-26', '2026-10-26');
    eq('nobody has enough seats: still a driver (the page warns)', who(r, s, '2026-10-26', 'am'), 'Ayesha');

    // ---------- families joining and leaving ----------
    s = group(); r = C.compute(s, '2026-11-06', '2026-11-06');
    s.families.push({ id: s.nextId++, name: 'Sana', kids: [{ id: s.nextId++, name: 'Mia', rides: 'both' }], seats: 4, no: [], away: [], joined: '2026-11-09', left: null });
    r = C.compute(s, '2026-11-09', '2026-11-20');
    tot = { Ayesha: 0, Bilal: 0, Hina: 0, Sana: 0 };
    for (let n = C.dayNum('2026-11-09'); n <= C.dayNum('2026-11-20'); n++) { const d = r.days[C.keyOf(n)]; if (d) C.RUNS.forEach(x => { if (d.runs[x] && d.runs[x].d) tot[C.famName(s, d.runs[x].d)]++; }); }
    ok('a family joining mid-term does not drive every day to catch up', tot.Sana <= 6 && tot.Sana >= 4);
    eq('the new child rides from the day they join', [C.kidNames(s, C.compute(s, '2026-11-06', '2026-11-06').days['2026-11-06'].runs.am.k).includes('Mia'), C.kidNames(s, r.days['2026-11-09'].runs.am.k).includes('Mia')], [false, true]);
    s = group(); s.families[1].left = '2026-10-28';
    r = C.compute(s, '2026-10-26', '2026-10-30');
    ok('a family that left drives no more', ['2026-10-28', '2026-10-29', '2026-10-30'].every(k => C.RUNS.every(x => who(r, s, k, x) !== 'Bilal')));
    ok('...and its child no longer rides', !C.kidNames(s, r.days['2026-10-29'].runs.am.k).includes('Omar'));
    eq('...but its past drives stay', who(r, s, '2026-10-26', 'pm'), 'Bilal');

    // ---------- the past never changes ----------
    s = group(); ok('freeze saves past days', C.freeze(s, '2026-10-29'));
    eq('three school days saved', Object.keys(s.log), ['2026-10-26', '2026-10-27', '2026-10-28']);
    s.families[0].no = ['1am', '1pm', '2am', '2pm', '3am', '3pm']; // Ayesha now cannot drive Mon-Wed
    r = C.compute(s, '2026-10-29', '2026-10-30');
    eq('changing a family later keeps what already happened', [who(r, s, '2026-10-26', 'am'), who(r, s, '2026-10-28', 'pm')], ['Ayesha', 'Ayesha']);
    ok('freeze twice changes nothing', !C.freeze(s, '2026-10-29'));
    s.over['2026-10-27'] = { am: { driver: id(s, 'Bilal') } }; C.unfreeze(s, '2026-10-27');
    r = C.compute(s, '2026-10-29', '2026-10-29');
    eq('correcting a past day', who(r, s, '2026-10-27', 'am'), 'Bilal');

    // ---------- fuel cost sharing (worked by hand) ----------
    // 10 drives at 300.00 = 3,000.00. Every car has 4 children: Ayesha's 2, Bilal's 1, Hina's 1, so each drive costs
    // Ayesha 150.00, Bilal 75.00 and Hina 75.00. Ayesha drove 4 (owed 1,200, share 1,500: -300), Bilal 3 (900 - 750 = +150),
    // Hina 3 (+150). So Ayesha pays Bilal 150.00 and Hina 150.00, and then everyone has paid the same per child.
    s = group(); s.cost = { on: true, cents: 30000 };
    r = C.compute(s, '2026-10-30', '2026-10-30');
    let st = C.settle(s, r, '2026-10', '2026-10-30');
    eq('drives and total', [st.count, st.total], [10, 300000]);
    eq('rows', st.rows.map(x => [x.name, x.drove, x.owed, x.share, x.net]), [['Ayesha', 4, 120000, 150000, -30000], ['Bilal', 3, 90000, 75000, 15000], ['Hina', 3, 90000, 75000, 15000]]);
    eq('payments', st.pays.map(p => p.from + ' pays ' + p.to + ' ' + C.money(p.cents)), ['Ayesha pays Bilal 150.00', 'Ayesha pays Hina 150.00']);
    eq('everything adds up to zero', st.rows.reduce((a, x) => a + x.net, 0), 0);
    st = C.settle(s, r, '2026-10', '2026-10-27');
    eq('only drives up to today count', st.count, 4);
    st = C.settle(s, r, '2026-11', '2026-10-30'); eq('a month with no drives', [st.count, st.pays.length], [0, 0]);
    // odd cents: 1.00 shared by 3 children of 3 families = 34 + 33 + 33
    s = group(); s.families[0].kids.pop(); s.cost = { on: true, cents: 100 }; s.runs.pm = false; s.days = [1];
    r = C.compute(s, '2026-10-26', '2026-10-26'); st = C.settle(s, r, '2026-10', '2026-10-26');
    eq('odd cents', st.rows.map(x => x.share), [34, 33, 33]);
    eq('odd cents payments', st.pays.map(p => p.from + '>' + p.to + ':' + p.cents), ['Bilal>Ayesha:33', 'Hina>Ayesha:33']);
    s.cost.cents = 0; st = C.settle(s, r, '2026-10', '2026-10-26'); eq('zero cost: nobody pays', st.pays, []);
    eq('payments settle a chain with fewest transfers', C.payments([{ id: 1, name: 'A', net: -500 }, { id: 2, name: 'B', net: 200 }, { id: 3, name: 'C', net: 300 }]).map(p => p.from + p.to + p.cents), ['AC300', 'AB200']);

    // ---------- text ----------
    s = group(); r = C.compute(s, '2026-10-28', '2026-11-01');
    const t = C.weekText(s, r, '2026-10-26', '2026-10-28');
    ok('week text has the heading', t.startsWith('School run rota, week of Mon 26 Oct'));
    ok('week text marks today', t.includes('Wed 28 Oct (today)\n  Morning: Hina drives (Ali, Sara, Omar, Zain)\n  Afternoon: Ayesha drives (Ali, Sara, Omar, Zain)'));
    ok('week text skips the weekend', !t.includes('Sat'));
    s.holidays.push({ from: '2026-10-30', to: '2026-10-30', name: '' });
    ok('week text shows a day off', C.weekText(s, C.compute(s, '2026-10-28', '2026-11-01'), '2026-10-26', '2026-10-28').includes('Fri 30 Oct\n  No school: No school'));

    // ---------- saved data ----------
    eq('nothing saved', C.validate(null), null);
    eq('not ours', C.validate({ hello: 1 }), null);
    eq('a list is not ours', C.validate([1, 2]), null);
    s = group(); s.over['2026-10-26'] = { am: { driver: id(s, 'Hina'), out: [kid(s, 'Zain')] } }; C.freeze(s, '2026-10-28');
    eq('a good state survives a round trip', C.validate(JSON.parse(JSON.stringify(s))), s);
    const bad = JSON.parse(JSON.stringify(s));
    bad.families[0].seats = 99; bad.families[0].no = ['9am', '1am', 'x']; bad.families[1].name = '   '; bad.families[2].kids.push({ id: 'x', name: 'Bad' });
    bad.days = [1, 1, 9, 'a']; bad.runs = { am: false, pm: false }; bad.holidays = [{ from: '2026-12-01', to: '2026-11-01' }, 5];
    bad.over['2026-02-30'] = { off: true }; bad.over['2026-10-26'].am.driver = id(s, 'Bilal'); bad.over['2026-10-27'] = { am: { driver: 999 } }; bad.cost = { on: 'yes', cents: -4 }; bad.nextId = -1;
    bad.families[0].name = '<img src=x onerror=alert(1)>';
    const v = C.validate(bad);
    eq('bad values are cleaned', [v.families.length, v.families[0].seats, v.families[0].no, v.days, v.runs, v.holidays.length, Object.keys(v.over), v.cost], [2, 4, ['1am'], [1], { am: true, pm: false }, 0, ['2026-10-26'], { on: false, cents: 0 }]);
    ok('a removed family\'s swap is dropped', !v.over['2026-10-26'].am.driver);
    eq('names are kept as plain text', v.families[0].name, '<img src=x onerror=alert(1)>'.slice(0, 30));
    ok('next id stays above every id', v.nextId > Math.max(...v.families.flatMap(f => [f.id, ...f.kids.map(k => k.id)])));
    eq('very long names are cut', C.cleanName('x'.repeat(200), 30).length, 30);
    eq('names split', C.splitNames('Ali, Sara and Omar'), ['Ali', 'Sara', 'Omar']);

    out.push('', pass + ' passed, ' + fail + ' failed');
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n');
    else { console.log(out.join('\n')); if (fail) process.exitCode = 1; }
})();
