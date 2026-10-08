function runTests(C) {
    const out = [];
    const t = (name, fn) => { let ok = false; try { ok = !!fn(); } catch (e) { ok = false; } out.push({ name, ok }); };
    const room = o => Object.assign({ name: '', l: '', w: '', h: '', doors: 0, windows: 0, coats: 2, walls: true, ceiling: false, cCoats: 2, colour: '', dw: '', dh: '', ww: '', wh: '', take: '', add: '' }, o);
    const st = rooms => ({ units: 'metric', cov: 10, extra: 10, rooms });
    const living = room({ name: 'Living room', l: '5', w: '4', h: '2.4', doors: 1, windows: 2, ceiling: true });
    const bed = room({ name: 'Bedroom', l: '4', w: '3.5', h: '2.4', doors: 1, windows: 1, colour: 'Grey', ceiling: true });

    t('number parsing', () => C.num('4,5') === 4.5 && isNaN(C.num('')) && isNaN(C.num('-1')) && isNaN(C.num('abc')) && C.num(' 3 ') === 3);
    t('living room walls = 43.2 - 1.89 - 2.88 = 38.43 m2', () => C.roomAreas(living, 'metric').walls === 38430000);
    t('ceiling 20 m2', () => C.roomAreas(living, 'metric').ceiling === 20000000);
    t('bedroom walls 36 - 1.89 - 1.44 = 32.67', () => C.roomAreas(bed, 'metric').walls === 32670000);
    const p = C.plan(st([living, bed]));
    t('three paints: wall paint, Grey, ceiling', () => p.paints.map(g => g.label).join('|') === 'Wall paint|Grey|Ceiling paint');
    t('wall paint needs 8.455 L (38.43*2*1.1/10 = 8.4546)', () => p.paints[0].need === 8455);
    t('wall paint buy 5+2.5+1 = 8.5 L', () => C.fmtCans(p.paints[0].buy) === '1 × 5 L + 1 × 2.5 L + 1 × 1 L' && p.paints[0].buy.total === 8500);
    t('grey needs 7.188 L, buy 5 + 2.5', () => p.paints[1].need === 7188 && C.fmtCans(p.paints[1].buy) === '1 × 5 L + 1 × 2.5 L');
    t('ceiling 34 m2 *2*1.1/10 = 7.48 L, buy 5 + 2.5', () => p.paints[2].need === 7480 && C.fmtCans(p.paints[2].buy) === '1 × 5 L + 1 × 2.5 L');
    t('same colour in two rooms is combined', () => {
        const q = C.plan(st([room({ l: '4', w: '4', h: '2.5', colour: 'Blue' }), room({ l: '3', w: '3', h: '2.5', colour: ' blue ' })]));
        return q.paints.length === 1 && q.paints[0].area === (2 * 8 * 2500 + 2 * 6 * 2500) * 1000 && q.paints[0].rooms.length === 2;
    });
    t('per-room coats: 1 coat vs 3 coats add up', () => {
        const q = C.plan({ units: 'metric', cov: 10, extra: 0, rooms: [room({ l: '4', w: '4', h: '2.5', coats: 1 }), room({ l: '4', w: '4', h: '2.5', coats: 3 })] });
        return q.paints[0].need === 16000;  // 40 m2 * (1+3 coats) = 160 / 10 = 16 L
    });
    t('exact multiples are not rounded up', () => C.plan({ units: 'metric', cov: 10, extra: 0, rooms: [room({ l: '5', w: '5', h: '2.5', coats: 1, walls: true })] }).paints[0].need === 5000);
    t('fewest cans when equal waste', () => C.fmtCans(C.bestCans(5000, C.UNITS.metric.cans)) === '1 × 5 L');
    t('10 L tin for 9.5 L need (fewer tins, 0.5 L spare)', () => C.fmtCans(C.bestCans(9500, C.UNITS.metric.cans)) === '1 × 10 L');
    t('0.4 L need -> one 1 L tin', () => C.fmtCans(C.bestCans(400, C.UNITS.metric.cans)) === '1 × 1 L');
    t('imperial 350 sq ft/gal, 1 coat, no extra, 350 sq ft -> 1 gallon', () => {
        const q = C.plan({ units: 'imperial', cov: 350, extra: 0, rooms: [room({ l: '10', w: '10', h: '8.75', coats: 1 })] });  // 40*8.75 = 350
        return q.paints[0].need === 128 && C.fmtCans(q.paints[0].buy) === '1 × 1 gallon';
    });
    t('imperial 1.5 gal -> 1 gallon + 2 quarts', () => {
        const q = C.plan({ units: 'imperial', cov: 350, extra: 0, rooms: [room({ l: '10', w: '10', h: '13.125', coats: 1 })] });  // 525 sq ft
        return q.paints[0].need === 192 && C.fmtCans(q.paints[0].buy) === '1 × 1 gallon + 2 × 1 quart';
    });
    t('openings bigger than walls give 0, flagged', () => { const a = C.roomAreas(room({ l: '1', w: '1', h: '1', doors: 50 }), 'metric'); return a.walls === 0 && a.over; });
    t('empty room is not counted', () => C.plan(st([room({})])).paints.length === 0 && !C.plan(st([room({})])).rooms[0].ok);
    t('ceiling only needs no height', () => { const a = C.roomAreas(room({ l: '4', w: '3', walls: false, ceiling: true }), 'metric'); return a.ok && a.ceiling === 12000000; });
    t('custom door size is used', () => C.roomAreas(room({ l: '4', w: '4', h: '2.5', doors: 1, dw: '1', dh: '2' }), 'metric').walls === 40000000 - 2000000);
    t('take off and add area', () => C.roomAreas(room({ l: '4', w: '4', h: '2.5', take: '2', add: '1.5' }), 'metric').walls === 40000000 - 2000000 + 1500000);
    t('unit conversion', () => C.convertLen('10', 'imperial', 'metric') === '3.05' && C.convertLen('3', 'metric', 'imperial') === '9.84');
    t('summary has no currency symbols', () => !/[$€£¥]/.test(C.summary(p, 'x')));
    t('summary lists the cans', () => /Wall paint: buy 1 × 5 L \+ 1 × 2.5 L \+ 1 × 1 L \(8.5 L\)/.test(C.summary(p, '')));
    return out;
}
if (typeof module !== 'undefined') {
    const r = runTests(require('./core.js'));
    r.forEach(x => { if (!x.ok) console.log('FAIL', x.name); });
    console.log(r.filter(x => x.ok).length + ' of ' + r.length + ' checks passed');
    process.exit(r.every(x => x.ok) ? 0 : 1);
}
