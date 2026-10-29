// Checks for core.js. Run with: node tests.js  (or open test.html)
(function () {
    'use strict';
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.HIN;
    let pass = 0, failN = 0; const out = [];
    function eq(got, want, name) {
        const ok = JSON.stringify(got) === JSON.stringify(want);
        if (ok) pass++; else { failN++; out.push('FAIL ' + name + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }
    }
    const err = (r, name) => eq(!!(r && r.error), true, name + ' gives an error');

    // ---------- amounts ----------
    eq(C.parseMoney('650').n, 65000, 'plain amount');
    eq(C.parseMoney('1,250.50').n, 125050, 'thousands comma and cents');
    eq(C.parseMoney('1.250,50').n, 125050, 'European style');
    eq(C.parseMoney('1,50,000').n, 15000000, 'lakh style');
    eq(C.parseMoney('1.5 lakh').n, 15000000, 'lakh word');
    eq(C.parseMoney('£ 799').n, 79900, 'currency sign typed');
    eq(C.parseMoney('2k').n, 200000, '2k');
    eq(C.parseMoney('0').n, 0, 'zero is allowed (worthless but listed)');
    eq(C.parseOptMoney('').n, null, 'blank value is no value yet');
    eq(C.parseOptMoney('   ').n, null, 'spaces only is no value yet');
    err(C.parseMoney('-50'), 'negative amount');
    eq(C.parseMoney('12.345').n, 1234500, '12.345 is twelve thousand in European style');
    err(C.parseMoney('12.3456'), 'four decimals');
    err(C.parseMoney('abc'), 'letters');
    err(C.parseMoney('99999999999999'), 'huge amount');
    eq(C.parseMoney('1,000,000,000').n, C.MAXC, 'the biggest amount');

    // ---------- how many ----------
    eq(C.parseQty('').n, 1, 'blank is 1');
    eq(C.parseQty('6').n, 6, '6');
    eq(C.parseQty('x6').n, 6, 'x6 pasted');
    eq(C.parseQty('6 ×').n, 6, '6 × pasted');
    err(C.parseQty('0'), 'zero of a thing');
    err(C.parseQty('-2'), 'negative count');
    err(C.parseQty('1.5'), 'half a chair');
    err(C.parseQty('10000'), 'too many');

    // ---------- money words ----------
    eq(C.fmtMoney(1045800, '£', 'west'), '£10,458', 'whole pounds');
    eq(C.fmtMoney(125050, '', 'west'), '1,250.50', 'cents shown');
    eq(C.fmtMoney(1234567800, 'Rs', 'lakh'), 'Rs 1,23,45,678', 'lakh style with Rs');
    eq(C.fmtMoney(-45800, '£', 'west'), '-£458', 'negative');

    // ---------- dates ----------
    eq(C.ageWords('2023-03-12', '2026-10-29'), '3 years 7 months old', 'age of the TV');
    eq(C.ageWords('2026-10-01', '2026-10-29'), 'less than a month old', 'new');
    eq(C.ageWords('2025-10-29', '2026-10-29'), '1 year old', 'exactly a year');
    eq(C.ageWords('2025-10-30', '2026-10-29'), '11 months old', 'a day short of a year');
    eq(C.ageWords('2024-02-29', '2025-02-28'), '11 months old', 'leap day');
    eq(C.ageWords('2027-01-01', '2026-10-29'), '', 'future date');
    eq(C.isDate('2026-02-30'), false, '30 Feb is not a date');
    eq(C.fmtDate('2026-10-29'), '29 Oct 2026', 'date words');

    // ---------- the worked example: Sara and Imran's flat ----------
    const raw = { cur: '£', rooms: [{ id: 'r1', name: 'Living room' }, { id: 'r2', name: 'Kitchen' }, { id: 'r3', name: 'Main bedroom' }, { id: 'r4', name: 'Hall' }], items: [
        { id: 'a', room: 'r1', name: '55-inch TV', qty: 1, value: 65000, brand: 'Samsung QE55Q60', serial: '0B7G3CPW401234', got: '2023-03-12', paid: 79900, receipt: 'Email from Currys' },
        { id: 'b', room: 'r1', name: 'Sofa', qty: 1, value: 120000 },
        { id: 'c', room: 'r1', name: 'Books', qty: 1, value: 40000 },
        { id: 'd', room: 'r2', name: 'Fridge freezer', qty: 1, value: 54900 },
        { id: 'e', room: 'r2', name: 'Dining chairs', qty: 6, value: 8500 },
        { id: 'f', room: 'r2', name: 'Dining table', qty: 1, value: 35000 },
        { id: 'g', room: 'r2', name: 'Microwave', qty: 1, value: null },
        { id: 'h', room: 'r3', name: 'Engagement ring', qty: 1, value: 240000, got: '2019-06-01' },
        { id: 'i', room: 'r3', name: 'Laptop', qty: 1, value: 109900, brand: 'MacBook Air 13', serial: 'C02XG0FDH7JY' },
        { id: 'j', room: 'r3', name: 'Clothes', qty: 1, value: 150000 },
        { id: 'k', room: 'r4', name: 'Road bike', qty: 1, value: 180000, serial: 'WTU123K4567' }
    ] };
    let s = C.cleanState(raw);
    eq(s.items.length, 11, 'all 11 lines kept');
    const all = C.sums(C.atHome(s));
    eq([all.n, all.value, all.unvaluedN], [16, 1045800, 1], 'whole home: 16 items, 10,458, 1 without a value');
    eq(C.byRoom(s).map(g => [g.room.name, g.s.n, g.s.value]), [['Living room', 3, 225000], ['Kitchen', 9, 140900], ['Main bedroom', 3, 499900], ['Hall', 1, 180000]], 'room totals');
    eq(C.byRoom(s).reduce((a, g) => a + g.s.value, 0), all.value, 'rooms add up to the whole home');
    eq(C.total(s.items[4]), 51000, '6 chairs at 85 = 510');
    eq(C.sumWords(C.byRoom(s)[1].s, s), '9 items, £1,409 (1 without a value)', 'kitchen words');
    // no cover yet
    eq(C.coverCheck(s), null, 'no cover typed');
    eq(C.overLimit(s), [], 'no limit typed');
    s.cover = 1000000; s.limit = 150000;
    eq(C.coverCheck(s).spare, -45800, 'cover 10,000 is 458 short');
    eq(C.coverWords(s), 'Contents cover £10,000: £458 less than your things add up to.', 'short in words');
    eq(C.overLimit(s).map(x => x.name), ['Engagement ring', 'Road bike'], 'over the 1,500 limit (clothes at exactly 1,500 are not over)');
    eq(C.topValued(s, 3).map(x => x.name), ['Engagement ring', 'Road bike', 'Clothes'], 'most valuable first');
    // the bike is stolen
    s.items[10].status = 'claim'; s.items[10].out = { d: '2026-10-20', note: 'Taken from the hall, police report 4471' };
    const after = C.sums(C.atHome(s));
    eq([after.n, after.value], [15, 865800], 'home total without the bike');
    eq(C.coverCheck(s).spare, 134200, 'now 1,342 to spare');
    eq(C.coverWords(s), 'Contents cover £10,000: enough, £1,342 to spare before the 1 item without a value.', 'enough in words');
    eq(C.overLimit(s).map(x => x.name), ['Engagement ring'], 'a stolen bike is no longer over the limit at home');
    eq(C.claims(s).length, 1, 'one claim');
    const ct = C.claimText(s, '2026-10-29');
    eq(ct.split('\n')[1], '1 item, £1,800 to buy new today', 'claim total line');
    eq(ct.includes('Road bike, serial WTU123K4567, value £1,800, Hall, 20 Oct 2026: Taken from the hall, police report 4471'), true, 'claim line has serial, value, room, date and note');
    // the full list
    const at = C.allText(s, '2026-10-29');
    eq(at.split('\n')[1], 'Whole home: 15 items, £8,658 (1 without a value) to buy new today', 'full list total');
    eq(at.includes('- 55-inch TV, Samsung QE55Q60, serial 0B7G3CPW401234, bought 12 Mar 2023 (3 years 7 months old), paid £799, receipt: Email from Currys, value £650'), true, 'TV line');
    eq(at.includes('- Dining chairs × 6, value £85 each, £510'), true, 'chairs line');
    eq(at.includes('- Microwave, no value yet'), true, 'microwave line');
    eq(at.includes('Road bike'), false, 'stolen bike not in the home list');
    eq(C.checklist(C.byRoom(s)[1]), 'Kitchen: 9 items\n[ ] Fridge freezer\n[ ] Dining chairs × 6\n[ ] Dining table\n[ ] Microwave', 'moving checklist');
    // sold
    s.items[2].status = 'sold'; s.items[2].out = { d: '2026-10-25', note: '' };
    eq(C.gone(s).map(x => x.name), ['Books'], 'sold goes to history');
    eq(C.sums(C.atHome(s)).value, 825800, 'sold no longer counted');

    // ---------- finding, twins ----------
    eq(C.matches(s.items[0], 'samsung'), true, 'find by brand');
    eq(C.matches(s.items[8], 'C02XG'), true, 'find by serial');
    eq(C.matches(s.items[1], 'tv'), false, 'sofa is not a tv');
    eq(C.matches(s.items[1], '  '), true, 'blank search shows all');
    eq(C.twin(s, 'r1', 'sofa', 'zz').id, 'b', 'same name in the same room is found');
    eq(C.twin(s, 'r2', 'sofa', 'zz'), null, 'other rooms are not twins');
    eq(C.twin(s, 'r1', 'Sofa', 'b'), null, 'an item is not its own twin');

    // ---------- CSV ----------
    const csv = C.csv(s).split('\r\n');
    eq(csv[0].startsWith('Room,Item,How many,Value each,Total value'), true, 'csv header');
    eq(csv[5], 'Kitchen,Dining chairs,6,85.00,510.00,,,,,,At home,,,,,', 'csv chairs row');
    eq(csv[11].includes('Lost\\, stolen or damaged') || csv[11].includes('"Lost, stolen or damaged"'), true, 'csv quotes commas');
    eq(C.csv(C.cleanState({ rooms: [{ id: 'r', name: '=cmd' }], items: [{ id: 'x', room: 'r', name: '+SUM(A1)', qty: 1 }] })).split('\r\n')[1].startsWith("'=cmd,'+SUM(A1)"), true, 'csv formula injection guarded');

    // ---------- saved state is checked ----------
    eq(C.cleanState(null), null, 'null');
    eq(C.cleanState({ items: 'x', rooms: [] }), null, 'items not a list');
    eq(C.cleanState('{bad json'), null, 'a string');
    const bad = C.cleanState({ cur: 'XYZ', group: 'odd', cover: -5, limit: 0, rooms: [{ id: 'r1', name: 'Kitchen' }, { id: 'r2', name: 'kitchen' }, { id: 'r1', name: 'Again' }, { id: 'bad id!', name: 'X' }, { id: 'r3', name: '' }],
        items: [{ id: 'a', room: 'r1', name: 'Kettle', qty: 1, value: 2500 }, { id: 'a', room: 'r1', name: 'Dup id', qty: 1 }, { id: 'b', room: 'r9', name: 'No room', qty: 1 }, { id: 'c', room: 'r1', name: '', qty: 1 },
            { id: 'd', room: 'r1', name: 'Zero', qty: 0 }, { id: 'e', room: 'r1', name: 'Half', qty: 1.5 }, { id: 'f', room: 'r1', name: 'Neg value', qty: 1, value: -100 }, { id: 'g', room: 'r1', name: 'Odd', qty: 1, status: 'eaten', got: '2026-13-01', photo: '../x' },
            { id: 'h', room: 'r1', name: 'Too much', qty: 9999, value: C.MAXC }, { id: 'i', room: 'r1', name: 'x'.repeat(500), qty: 2, value: 100, status: 'claim', out: { d: 'nope', note: 5 } }] });
    eq([bad.cur, bad.group, bad.cover, bad.limit], ['', 'west', null, null], 'bad settings reset');
    eq(bad.rooms.map(r => r.name), ['Kitchen'], 'duplicate and broken rooms dropped');
    eq(bad.items.map(x => x.id), ['a', 'f', 'g', 'h', 'i'], 'broken items dropped');
    eq(bad.items[1].value, null, 'negative value becomes no value');
    eq([bad.items[2].status, bad.items[2].got, bad.items[2].photo], ['have', '', ''], 'odd status, date and photo key fixed');
    eq(bad.items[3].value, null, 'a value times how many that is too big is dropped');
    eq([bad.items[4].name.length, bad.items[4].status, bad.items[4].out], [80, 'claim', { d: '', note: '' }], 'long name cut, broken claim details cleaned');
    const pr = C.cleanState({ rooms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }], items: [{ id: 'a', room: 'r2', name: 'Lamp', qty: 1 }] });
    C.pruneRooms(pr);
    eq(pr.rooms.map(r => r.name), ['B'], 'empty rooms are dropped');
    eq(JSON.stringify(C.cleanState(JSON.parse(JSON.stringify(s)))), JSON.stringify(s), 'a saved state comes back the same');
    eq(C.cleanText('  a\tb\n c  ', 20), 'a b c', 'pasted text is tidied');

    const summary = pass + ' checks passed, ' + failN + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = summary + '\n' + out.join('\n');
    else { console.log(out.join('\n')); console.log(summary); if (failN) process.exit(1); }
})();
