// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.DECLUTTER;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const T = '2026-10-30', fm = c => C.fmtMoney(c, '', 'en-US');
    const item = x => Object.assign({ id: 'a', name: 'Cot', st: 'sale', listed: T, sites: [], note: '', prices: [], min: null, photo: '', dep: 0, offers: [], log: [], deal: null, done: null }, x || {});
    const priced = (id, name, c, x) => item(Object.assign({ id, name, prices: [{ d: T, c }] }, x || {}));

    // typed money
    const m = s => C.parseOptMoney(s);
    eq('blank asking price = offers wanted', m('').n, null); eq('9000', m('9000').n, 900000); eq('9,000', m('9,000').n, 900000); eq('1,12,000 (lakh)', m('1,12,000').n, 11200000);
    eq('Rs 8,500.50', m('Rs 8,500.50').n, 850050); eq('£ 12.99', m('£ 12.99').n, 1299); eq('0 refused', !!m('0').error, true); eq('minus refused', !!m('-50').error, true);
    eq('words refused', !!m('cheap').error, true); eq('3 decimals refused', !!m('0.345').error, true); eq('1.005 is one thousand and five', m('1.005').n, 100500); eq('huge refused', !!m('9999999999999').error, true); eq('pasted with spaces', m('  7 500 ').n, 750000);
    eq('deposit blank is 0', C.parseZeroMoney('').n, 0); eq('deposit 0 ok', C.parseZeroMoney('0').n, 0); eq('deposit minus refused', !!C.parseZeroMoney('-1').error, true);

    // splitting a bundle exactly
    eq('9,000 + 3,000 asked, sold for 10,000', C.split(1000000, [900000, 300000]), [750000, 250000]);
    eq('odd cents go to the first', C.split(1000, [1, 1, 1]), [334, 333, 333]);
    eq('no prices: equal shares', C.split(1001, [null, null]), [501, 500]);
    eq('one missing price: equal shares', C.split(500, [100, null]), [250, 250]);
    eq('split always adds up', [[999, [7, 13, 21]], [1, [5, 5]], [0, [3, 4]], [123457, [100, 200, 333, 1]]].map(([n, w]) => C.split(n, w).reduce((a, b) => a + b, 0) === n), [true, true, true, true]);
    eq('biggest remainder wins', C.split(100, [1, 2]), [33, 67]);

    // text and places
    eq('name tidy', C.cleanText('  Baby \n cot ', 80), 'Baby cot'); eq('name cut at 80', C.cleanText('x'.repeat(200), 80).length, 80);
    eq('note keeps line breaks', C.cleanNote('Good\r\n\r\n\r\ncondition', 300), 'Good\n\ncondition');
    eq('sites in usual order, no repeats', C.cleanSites(['eBay', 'olx', 'Shpock', 'OLX', ' ']), ['OLX', 'eBay', 'Shpock']);
    eq('other places split', C.splitSites('Shpock, school group;  '), ['Shpock', 'school group']);

    // dates
    eq('date words', [C.dayWord('2026-10-30', T), C.dayWord('2026-10-31', T), C.dayWord('2026-10-29', T), C.dayWord('2026-11-07', T)], ['today', 'tomorrow', 'yesterday', 'Sat 7 Nov']);
    eq('ago', [C.ago(0), C.ago(1), C.ago(16)], ['today', 'yesterday', '16 days ago']);
    eq('bad date refused', [C.isDate('2026-02-30'), C.isDate('2026-02-28')], [false, true]);

    // price history and price drop due
    const cot = priced('c', 'Cot', 1500000, { listed: '2026-10-01', prices: [{ d: '2026-10-01', c: 1500000 }] });
    eq('drop due after 29 days with no offer', C.dropDue(cot, T), 29);
    C.setPrice(cot, 1350000, '2026-10-20'); C.setPrice(cot, 1200000, '2026-10-25');
    eq('price trail', C.priceTrail(cot, '', 'en-US'), 'Was 15,000, then 13,500, now 12,000');
    eq('not due 5 days after a drop', C.dropDue(cot, T), 0);
    eq('due 14 days after the last drop', C.dropDue(cot, '2026-11-08'), 14);
    eq('13 days is not due', C.dropDue(cot, '2026-11-07'), 0);
    C.setPrice(cot, 1100000, '2026-10-25');
    eq('same-day change replaces', cot.prices.length, 3);
    eq('no price: never due', C.dropDue(item({ listed: '2026-01-01' }), T), 0);
    const off = priced('o', 'Pram', 500000, { listed: '2026-09-01' });
    C.addOffer(off, { id: 'o1', who: 'Ali', c: 400000 }, T);
    eq('an open offer stops the drop note', C.dropDue(off, T), 0);
    C.addOffer(off, { id: 'o2', who: 'Sara', c: 450000 }, T);
    eq('best offer', C.bestOffer(off).who, 'Sara');
    C.setOffer(off, 'o2', 'declined');
    eq('declined offer is not best', C.bestOffer(off).who, 'Ali');

    // reserve, no-show with deposit, sell
    const r = priced('r', 'High chair', 300000);
    C.addOffer(r, { id: 'o3', who: 'Bilal', c: 250000 }, T);
    C.reserve(r, { who: 'Bilal', c: 250000, pick: '2026-10-31', paid: 50000 }, T);
    eq('reserved', [r.st, r.deal.paid, r.offers[0].st], ['reserved', 50000, 'accepted']);
    eq('deal words', C.dealWords(r, T, '', 'en-US'), 'Bilal, 2,500, collecting tomorrow, 500 paid, 2,000 to collect');
    C.noShow(r, '2026-11-01', true);
    eq('no-show: back on sale, deposit kept', [r.st, r.deal, r.dep, r.offers[0].st, r.log[r.log.length - 1].text], ['sale', null, 50000, 'noshow', 'Bilal did not come, deposit kept']);
    const r2 = priced('r2', 'Lamp', 100000);
    C.reserve(r2, { who: 'Zara', c: 90000, paid: 200000 }, T);
    eq('deposit never more than the price', r2.deal.paid, 90000);
    C.noShow(r2, T, false);
    eq('deposit given back adds nothing', r2.dep, 0);
    C.sell(r, { who: 'Hina', c: 280000 }, '2026-11-02');
    eq('sold', [r.st, r.done.c, r.done.who], ['sold', 280000, 'Hina']);
    eq('sold words', C.doneWords(r, '2026-11-05', '', 'en-US'), 'Sold to Hina on Mon 2 Nov for 2,800 (first asked 3,000)');
    C.relist(r, '2026-11-03');
    eq('put back on sale', [r.st, r.done], ['sale', null]);

    // the totals: the worked example
    const st = { cur: '', items: [
        priced('1', 'Cot', 1000000, { st: 'sold', done: { d: T, who: 'Ali', c: 800000, swap: '', bundle: null } }),
        priced('2', 'Bike', 500000, { st: 'sold', done: { d: T, who: '', c: 500000, swap: '', bundle: null } }),
        priced('3', 'Toys', 200000, { st: 'sold', done: { d: T, who: 'Neighbour', c: 0, swap: 'Car seat', bundle: null } }),
        item({ id: '4', name: 'Books', st: 'sold', done: { d: T, who: '', c: 30000, swap: '', bundle: null } }),
        priced('5', 'Sofa', 2500000, { sites: ['OLX', 'Facebook Marketplace'] }),
        item({ id: '6', name: 'Rug', sites: ['OLX'] }),
        priced('7', 'Desk', 600000, { st: 'reserved', deal: { who: 'Omar', c: 550000, pick: '2026-10-31', paid: 100000, d: T } }),
        priced('8', 'Old TV', 100000, { st: 'given', done: { d: T, who: 'Charity shop', c: 0, swap: '', bundle: null } }),
        priced('9', 'Lamp', 50000, { st: 'kept', done: { d: T, who: '', c: 0, swap: '', bundle: null }, dep: 20000 })] };
    const s = C.summary(st, T);
    eq('money made = sold + kept deposits', s.made, 800000 + 500000 + 0 + 30000 + 20000);
    eq('% of first asking: 13,000 of 15,000 = 87%', s.pct, 87);
    eq('for sale count and asking', [s.sale, s.asking, s.noPrice], [2, 2500000, 1]);
    eq('to collect after deposit', [s.reserved, s.agreed, s.toCollect], [1, 550000, 450000]);
    eq('counts', [s.sold, s.swaps, s.given, s.kept], [4, 1, 1, 1]);
    eq('by place', C.bySite(st.items).filter(e => e.site !== 'Not set'), [{ site: 'OLX', sale: 2, sold: 0 }, { site: 'Facebook Marketplace', sale: 1, sold: 0 }]);
    eq('empty list totals', (x => [x.made, x.pct, x.sale])(C.summary({ items: [] }, T)), [0, null, 0]);
    eq('swap words', C.doneWords(st.items[2], T, '', 'en-US'), 'Sold to Neighbour today, swapped for Car seat');
    const txt = C.listText(st, T, 'Rs', 'en-US');
    eq('list text has the answer', [txt.includes('Money made: Rs 13,500 from 4 items sold (87% of what I first asked)'), txt.includes('- Desk: Omar, Rs 5,500, collecting tomorrow, Rs 1,000 paid, Rs 4,500 to collect'), txt.includes('Still to collect: Rs 4,500')], [true, true, true]);
    eq('ad text', C.adText(priced('x', 'Cot', 900000, { note: 'Wooden, with mattress' }), '£', 'en-GB'), 'For sale: Cot, £9,000\nWooden, with mattress');

    // a bundle
    const b1 = priced('b1', 'Cot', 900000), b2 = priced('b2', 'High chair', 300000), b3 = item({ id: 'b3', name: 'Bath' });
    eq('bundle with priced items', C.sellBundle([b1, b2], 1000000, { who: 'Ali' }, T, 'bx'), [750000, 250000]);
    eq('bundle marks both sold', [b1.st, b2.st, b1.done.bundle, b2.done.who], ['sold', 'sold', 'bx', 'Ali']);
    eq('bundle with an unpriced item: equal', C.sellBundle([priced('q', 'A', 500), b3], 1001, {}, T, 'by'), [501, 500]);

    // money display
    eq('money formats', [fm(1850000), fm(1001), C.fmtMoney(5000, 'Rs', 'en-US'), C.fmtMoney(5000, '$', 'en-US'), fm(-500)], ['18,500', '10.01', 'Rs 50', '$50', '-5']);

    // saved data: corrupt and odd values
    eq('not an object', C.cleanState('x'), null); eq('no items', C.cleanState({}), null);
    const bad = C.cleanState({ cur: 'BTC', items: [null, { id: '<x>', name: 'a', st: 'sale', listed: T }, { id: 'n', name: '', st: 'sale', listed: T }, { id: 'z', name: 'Z', st: 'weird', listed: T },
        { id: 'res', name: 'R', st: 'reserved', listed: T }, priced('ok', 'Fine', 100, { photo: 'javascript:alert(1)', min: -5, dep: 1.5, offers: [{ id: 'o', who: 'A', c: -1, d: T, st: 'open' }, { id: 'o2', who: 'B', c: 10, d: T, st: 'open' }] }),
        priced('ok', 'Duplicate id', 100), item({ id: 'sd', name: 'Sold', st: 'sold', done: { d: T, c: 'lots', swap: 'x' } })] });
    eq('bad values dropped', [bad.cur, bad.items.map(i => i.id)], ['', ['ok', 'sd']]);
    eq('bad photo, min, deposit, offer dropped', [bad.items[0].photo, bad.items[0].min, bad.items[0].dep, bad.items[0].offers.map(o => o.id)], ['', null, 0, ['o2']]);
    eq('bad sold price becomes 0', bad.items[1].done.c, 0);
    eq('a real photo is kept', C.okPhoto('data:image/jpeg;base64,/9j/4AAQ=='), true);
    eq('round trip', JSON.stringify(C.cleanState(JSON.parse(JSON.stringify(st))).items), JSON.stringify(st.items));

    const summaryLine = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n') + '\n\n' + summaryLine;
    else { out.filter(l => l.startsWith('FAIL')).forEach(l => console.log(l)); console.log(summaryLine); if (fail) process.exitCode = 1; }
})();
