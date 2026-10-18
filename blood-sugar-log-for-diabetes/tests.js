// Checks for core.js. Run: node blood-sugar-log-for-diabetes/tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.SugarCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; if (!ok) out.push('FAIL ' + name + ': got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)); };

    // ---- Tariq's week from the README: fasting every morning, 2 hours after dinner every evening, one low before lunch
    const FAST = [142, 136, 131, 128, 125, 122, 118], AFTER = [210, 195, 188, 176, 169, 182, 160];
    const R = []; let k = 0;
    const mk = (t, tag, v, u, hl) => ({ id: 'r' + (k++), t, tag, v: v == null ? null : v, u: u || 'mg', hl: hl || '', note: '' });
    FAST.forEach((v, i) => R.push(mk('2026-10-' + (12 + i) + 'T07:15', 'fasting', v)));
    AFTER.forEach((v, i) => R.push(mk('2026-10-' + (12 + i) + 'T21:30', 'after2', v)));
    R.push(mk('2026-10-16T12:40', 'before', 64));
    const T = C.presetTargets('ada');
    const s = C.summary(R, { from: '2026-10-12', to: '2026-10-18', unit: 'mg', targets: T });
    eq('week n', s.n, 15); eq('week days', s.days, 7);
    eq('fasting avg', s.byTag.fasting.avg, 129);              // 902 / 7 = 128.86
    eq('fasting above', [s.byTag.fasting.above, s.byTag.fasting.in, s.byTag.fasting.n], [3, 4, 7]);   // 142, 136, 131 over 130
    eq('after avg', s.byTag.after2.avg, 183);                 // 1280 / 7 = 182.86
    eq('after above', [s.byTag.after2.above, s.byTag.after2.in], [4, 3]);    // 210, 195, 188, 182 over 180
    eq('before low', [s.byTag.before.n, s.byTag.before.below, s.byTag.before.avg], [1, 1, 64]);
    eq('in target', [s.inTarget, s.percent], [7, 47]);        // 7 / 15 = 46.7 %
    eq('avg all', s.avg, 150);                                // 2246 / 15 = 149.73
    eq('lows', [s.lows, s.lowList.length, s.lowList[0].v], [1, 1, 64]);
    eq('highest/lowest', [s.highest.v, s.lowest.v], [210, 64]);
    eq('first/last', [s.first, s.last], ['2026-10-12', '2026-10-18']);
    const sm = C.summary(R, { from: '2026-10-12', to: '2026-10-18', unit: 'mmol', targets: T });
    eq('mmol fasting avg', sm.byTag.fasting.avg, 7.2);        // 128.86 / 18.016 = 7.15
    eq('mmol after avg', sm.byTag.after2.avg, 10.1);          // 182.86 / 18.016 = 10.15 (10.1497)
    eq('mmol fasting above same', sm.byTag.fasting.above, 3); // 131 mg = 7.3 > 7.2
    eq('empty period', C.summary(R, { from: '2026-11-01', to: '2026-11-07' }).n, 0);
    eq('no readings', C.summary([], {}).n, 0);

    // ---- conversion and showing
    eq('mg to mmol', C.fmt(130, 'mmol'), '7.2'); eq('180 mmol', C.fmt(180, 'mmol'), '10.0'); eq('70 mmol', C.fmt(70, 'mmol'), '3.9');
    eq('54 mmol', C.fmt(54, 'mmol'), '3.0'); eq('250 mmol', C.fmt(250, 'mmol'), '13.9'); eq('95 mmol', C.fmt(95, 'mmol'), '5.3');
    eq('mmol to mg', C.fmt(C.toMg(7.2, 'mmol'), 'mg'), '130'); eq('5.5 mmol to mg', C.fmt(C.toMg(5.5, 'mmol'), 'mg'), '99');
    eq('mmol round trip', C.fmt(C.toMg(7.2, 'mmol'), 'mmol'), '7.2');
    eq('reading HI shows HI', C.fmtReading({ hl: 'HI', v: null, u: 'mg' }, 'mmol'), 'HI');
    eq('target text ada fasting', C.targetText(T.fasting, 'mg'), '80 to 130 mg/dL');
    eq('target text under', C.targetText(T.after2, 'mg'), 'under 180 mg/dL');
    eq('target text mmol', C.targetText(T.fasting, 'mmol'), '4.4 to 7.2 mmol/L');
    eq('preg fasting', C.targetText(C.presetTargets('preg').fasting, 'mmol'), 'under 5.3 mmol/L');

    // ---- status, judged on the numbers as shown
    const st = (v, u, tag, unit, targets) => C.status({ v, u, hl: '', tag }, (targets || T)[tag], unit || u);
    eq('80 in', st(80, 'mg', 'fasting'), 'in'); eq('130 in', st(130, 'mg', 'fasting'), 'in'); eq('131 above', st(131, 'mg', 'fasting'), 'above');
    eq('79 below', st(79, 'mg', 'fasting'), 'below'); eq('70 below', st(70, 'mg', 'fasting'), 'below'); eq('69 low', st(69, 'mg', 'fasting'), 'low');
    eq('54 low', st(54, 'mg', 'fasting'), 'low'); eq('53 very low', st(53, 'mg', 'fasting'), 'vlow');
    eq('250 very high', st(250, 'mg', 'after2'), 'vhigh'); eq('249 above', st(249, 'mg', 'after2'), 'above');
    eq('4.4 mmol is in (shown 80 = 4.4)', st(4.4, 'mmol', 'fasting'), 'in'); eq('7.2 mmol in', st(7.2, 'mmol', 'fasting'), 'in'); eq('7.3 mmol above', st(7.3, 'mmol', 'fasting'), 'above');
    eq('3.9 mmol not low', st(3.9, 'mmol', 'fasting'), 'below'); eq('3.8 mmol low', st(3.8, 'mmol', 'fasting'), 'low'); eq('2.9 mmol very low', st(2.9, 'mmol', 'fasting'), 'vlow');
    eq('13.9 mmol very high', st(13.9, 'mmol', 'after2'), 'vhigh');
    eq('mg reading shown in mmol', st(131, 'mg', 'fasting', 'mmol'), 'above');
    eq('HI', C.status({ hl: 'HI', tag: 'fasting' }, T.fasting, 'mg'), 'vhigh'); eq('LO', C.status({ hl: 'LO', tag: 'fasting' }, T.fasting, 'mg'), 'vlow');
    const own = C.parseTarget('7.0', '9.0', 'mmol').t;  // a target typed in mmol/L agrees with readings typed in mmol/L
    eq('own target edge in', C.status({ v: 7.0, u: 'mmol', hl: '', tag: 'fasting' }, own, 'mmol'), 'in');
    eq('own target edge above', C.status({ v: 9.1, u: 'mmol', hl: '', tag: 'fasting' }, own, 'mmol'), 'above');

    // ---- HI and LO in the summary: counted, not averaged, and named as highest / lowest
    const H = [mk('2026-10-12T07:00', 'fasting', 120), mk('2026-10-12T21:00', 'after2', null, 'mg', 'HI'), mk('2026-10-13T03:00', 'night', null, 'mg', 'LO')];
    const sh = C.summary(H, { unit: 'mg', targets: T });
    eq('HI LO counts', [sh.n, sh.numbers, sh.hiCount, sh.loCount, sh.avg], [3, 1, 1, 1, 120]);
    eq('HI highest LO lowest', [sh.highest.hl, sh.lowest.hl], ['HI', 'LO']);
    eq('HI LO in counts', [sh.veryHighs, sh.lows, sh.inTarget], [1, 1, 1]);
    eq('3am belongs to the day before', C.logDay('2026-10-13T03:00'), '2026-10-12');
    eq('4am is the new day', C.logDay('2026-10-13T04:00'), '2026-10-13');
    eq('only HI: no average', C.summary([H[1]], { unit: 'mg', targets: T }).avg, null);

    // ---- typing
    const p = (t, u) => C.parseValue(t, u);
    eq('130 mg', p('130', 'mg').reading, { v: 130, u: 'mg', hl: '' });
    eq('7.2 mmol', p('7.2', 'mmol').reading, { v: 7.2, u: 'mmol', hl: '' });
    eq('7,2 comma', p('7,2', 'mmol').reading, { v: 7.2, u: 'mmol', hl: '' });
    eq('7 mmol whole', p('7', 'mmol').reading, { v: 7, u: 'mmol', hl: '' });
    eq('spaces', p('  126 ', 'mg').reading.v, 126);
    eq('typed unit wins', p('7.2 mmol/L', 'mg').reading, { v: 7.2, u: 'mmol', hl: '' });
    eq('typed mg/dl', p('130 mg/dL', 'mmol').reading, { v: 130, u: 'mg', hl: '' });
    eq('HI', p('hi', 'mg').reading.hl, 'HI'); eq('High', p('High', 'mmol').reading.hl, 'HI'); eq('LO', p('LO', 'mg').reading.hl, 'LO');
    eq('blank', !!p('', 'mg').error, true); eq('blank spaces', !!p('   ', 'mmol').error, true);
    eq('letters', !!p('abc', 'mg').error, true); eq('negative', !!p('-5', 'mg').error, true);
    eq('7.2 in mg suggests mmol', p('7.2', 'mg').suggest, { v: 7.2, u: 'mmol' });
    eq('7 in mg suggests mmol', p('7', 'mg').suggest, { v: 7, u: 'mmol' });
    eq('130 in mmol suggests mg', p('130', 'mmol').suggest, { v: 130, u: 'mg' });
    eq('130.5 mg no suggest', [!!p('130.5', 'mg').error, p('130.5', 'mg').suggest], [true, undefined]);
    eq('601 mg too high', [!!p('601', 'mg').error, p('601', 'mg').suggest], [true, undefined]);
    eq('600 mg ok', p('600', 'mg').reading.v, 600); eq('20 mg ok', p('20', 'mg').reading.v, 20);
    eq('19 mg suggests mmol', p('19', 'mg').suggest, { v: 19, u: 'mmol' });
    eq('0 mg', [!!p('0', 'mg').error, p('0', 'mg').suggest], [true, undefined]);
    eq('7.25 mmol', !!p('7.25', 'mmol').error, true); eq('1.0 mmol too low', !!p('1.0', 'mmol').error, true);
    eq('33.3 ok', p('33.3', 'mmol').reading.v, 33.3); eq('35.5 mmol', [!!p('35.5', 'mmol').error, p('35.5', 'mmol').suggest], [true, undefined]);
    eq('huge', !!p('99999999999', 'mg').error, true);
    eq('very long', !!p('1'.repeat(500), 'mg').error, true);

    // ---- targets typed by the person
    eq('target mg', C.parseTarget('80', '130', 'mg').t, { lo: 80, hi: 130 });
    eq('target reversed', !!C.parseTarget('130', '80', 'mg').error, true);
    eq('target blank', !!C.parseTarget('', '130', 'mg').error, true);
    eq('target silly', !!C.parseTarget('10', '900', 'mg').error, true);
    eq('target mmol', C.fmt(C.parseTarget('4,0', '7.0', 'mmol').t.lo, 'mmol'), '4.0');

    // ---- saved data
    eq('clean null', C.clean(null), null); eq('clean junk', C.clean({ people: 'x' }), null); eq('clean empty people', C.clean({ people: [] }), null);
    const good = C.clean({ people: [{ id: 'a', name: 'Tariq', unit: 'mmol', preset: 'custom', targets: { fasting: { lo: 72, hi: 126 }, before: { lo: 500, hi: 10 } },
        readings: [{ id: 'x', t: '2026-10-12T07:00', tag: 'fasting', v: 7.2, u: 'mmol', hl: '' }, { id: 'x', t: '2026-10-12T08:00', tag: 'fasting', v: 7.3, u: 'mmol' },
            { id: 'y', t: 'bad', tag: 'fasting', v: 7, u: 'mmol' }, { id: 'z', t: '2026-10-12T09:00', tag: 'lunch', v: 7, u: 'mmol' },
            { id: 'w', t: '2026-10-12T09:00', tag: 'other', v: 5000, u: 'mg' }, { id: 'v', t: '2026-10-12T10:00', tag: 'other', v: 'x', u: 'mg' },
            { id: 'h', t: '2026-10-12T11:00', tag: 'after2', v: null, u: 'mg', hl: 'HI' }, { id: 'f', t: '2026-10-12T12:00', tag: 'after2', v: 130.5, u: 'mg' }] }], period: 'zzz' }, 'mg');
    eq('clean keeps good', good.people[0].readings.map(r => r.id), ['x', 'h']);
    eq('clean unit', good.people[0].unit, 'mmol'); eq('clean period default', good.period, '14');
    eq('clean custom target kept, bad one reset', [good.people[0].targets.fasting, good.people[0].targets.before], [{ lo: 72, hi: 126 }, { lo: 80, hi: 130 }]);
    eq('clean preset forces values', C.clean({ people: [{ preset: 'preg', targets: { fasting: { lo: 1, hi: 2 } } }] }).people[0].targets.fasting, { lo: 70, hi: 95 });
    eq('clean name trimmed', C.clean({ people: [{ name: '  ' + 'a'.repeat(80) }] }).people[0].name.length, 40);
    eq('clean max people', C.clean({ people: Array.from({ length: 10 }, () => ({})) }).people.length, 6);

    // ---- spreadsheet
    eq('csv formula guard', C.csvCell('=1+1'), "'=1+1"); eq('csv quote', C.csvCell('a,"b"'), '"a,""b"""');
    const c = C.csv([R[0], H[1]], 'mmol', T).split('\r\n');
    eq('csv header', c[0], 'Date,Time,Reading (mmol/L),When,Result,Note');
    eq('csv row', c[1], '2026-10-12,07:15,7.9,Fasting (on waking),Above target,');
    eq('csv HI', c[2], '2026-10-12,21:00,HI,2 hours after a meal,Very high,');

    // ---- advice
    eq('advice low mentions 15', /15 g/.test(C.advice('low', 'mg')), true);
    eq('advice low unit', /under 3\.9 mmol\/L/.test(C.advice('low', 'mmol')), true);
    eq('advice own plan', C.advice('low', 'mg', 'Take 4 tablets').startsWith('Your low-sugar plan: Take 4 tablets'), true);
    eq('advice very low emergency', /emergency/.test(C.advice('vlow', 'mg')), true);
    eq('advice in target none', C.advice('in', 'mg'), '');

    const summaryLine = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined' && document.getElementById('out')) document.getElementById('out').textContent = summaryLine + '\n' + out.join('\n');
    else { console.log(out.join('\n')); console.log(summaryLine); if (fail) process.exitCode = 1; }
})();
