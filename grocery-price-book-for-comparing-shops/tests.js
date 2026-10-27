// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.GPB;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const L = 'en-GB', T = '2026-10-27';
    const m = s => C.parseMoney(s).n, merr = s => !!C.parseMoney(s).error;

    // typed numbers
    eq('2690', m('2690'), 269000); eq('Rs 2,690', m('Rs 2,690'), 269000); eq('2,689.50', m('2,689.50'), 268950); eq('lakh 1,00,000', m('1,00,000'), 10000000);
    eq('2.689,50', m('2.689,50'), 268950); eq('pasted nbsp', m('2 690'), 269000); eq('price 0', merr('0'), true); eq('price blank', merr(''), true); eq('price minus', merr('-5'), true);
    eq('price words', merr('cheap'), true); eq('price 3 decimals', merr('0.125'), true); eq('price huge', merr('99999999999999'), true);
    eq('size 5', C.parseSize('5'), { n: 5000 }); eq('size 1.5L', C.parseSize('1.5L'), { n: 1500, u: 'l' }); eq('size 500 g', C.parseSize('500 g'), { n: 500000, u: 'g' });
    eq('size 0.25', C.parseSize('0.25').n, 250); eq('size 0', !!C.parseSize('0').error, true); eq('size blank', !!C.parseSize('').error, true); eq('size minus', !!C.parseSize('-1').error, true);
    eq('size 4 decimals', !!C.parseSize('1.2345').error, true); eq('size huge', !!C.parseSize('5000000').error, true); eq('size 30 items', C.parseSize('30 items'), { n: 30000, u: 'pc' });
    eq('packs blank = 1', C.parsePacks('').n, 1); eq('packs 6', C.parsePacks('6').n, 6); eq('packs 0', !!C.parsePacks('0').error, true); eq('packs 1.5', !!C.parsePacks('1.5').error, true); eq('packs 1000', !!C.parsePacks('1000').error, true);
    eq('same name ignores case and spaces', C.same(' Cooking  Oil', 'cooking oil'), true);
    eq('checkDay future', !!C.checkDay('2026-10-28', T), true); eq('checkDay today', C.checkDay(T, T), null); eq('checkDay 31 Feb', !!C.checkDay('2026-02-31', T), true); eq('checkDay blank', !!C.checkDay('', T), true);

    // unit prices, worked by hand
    const oil5 = { c: 269000, q: 5000, u: 'l', k: 1 };
    eq('2,690 for 5 L = 538 per litre', C.unitPrice(oil5, 'l'), 53800);
    eq('6 x 500 ml for 1,800 = 600 per litre', C.unitPrice({ c: 180000, q: 500000, u: 'ml', k: 6 }, 'l'), 60000);
    eq('1 lb for 4.54 = about 10.01 per kg', Math.round(C.unitPrice({ c: 454, q: 1000, u: 'lb', k: 1 }, 'kg')), 1001);
    eq('tray of 30 eggs 930 = 31 per item', C.unitPrice({ c: 93000, q: 30000, u: 'pc', k: 1 }, 'pc'), 3100);
    eq('2 dozen for 744 = 372 per dozen', C.unitPrice({ c: 74400, q: 2000, u: 'dz', k: 1 }, 'dz'), 37200);
    eq('250 g tea 720 = 288 per 100 g', C.unitPrice({ c: 72000, q: 250000, u: 'g', k: 1 }, '100g'), 28800);
    eq('fmtUnit odd cents 1/3', C.fmtUnit(100 / 3, '', L), '0.333');
    eq('fmtUnit 538', C.fmtUnit(53800, 'Rs', L), 'Rs 538'); eq('fmtUnit 26.67', C.fmtUnit(2666.6667, '$', L), '$26.67');
    eq('packText multipack', C.packText({ q: 500000, u: 'ml', k: 6 }, L), '6 × 500 ml'); eq('packText 1 item', C.packText({ q: 1000, u: 'pc', k: 1 }, L), '1 item');
    eq('pctText', [C.pctText(2.2304), C.pctText(-12.6), C.pctText(0.3)], ['2.2%', '13%', 'less than 1%']);
    eq('ago', [C.ago(0), C.ago(1), C.ago(15), C.ago(95), C.ago(800)], ['today', 'yesterday', '15 days ago', '3 months ago', '2 years ago']);

    // the main situation: Sana compares cooking oil at three shops
    const S = { v: 1, cur: 'Rs', seq: 6, shops: [{ id: 'm', name: 'Metro' }, { id: 'i', name: 'Imtiaz' }, { id: 'c', name: 'Corner shop' }], items: [
        { id: 'oil', name: 'Cooking oil', per: 'l', entries: [
            { id: 'e1', s: 'i', c: 258000, q: 5000, u: 'l', k: 1, d: '2026-10-01', n: 1 },
            { id: 'e2', s: 'm', c: 269000, q: 5000, u: 'l', k: 1, d: '2026-10-12', n: 2 },
            { id: 'e3', s: 'i', c: 285000, q: 5000, u: 'l', k: 1, d: '2026-10-20', n: 3 },
            { id: 'e4', s: 'c', c: 59500, q: 1000, u: 'l', k: 1, d: '2026-10-25', n: 4 },
            { id: 'e5', s: 'm', c: 250000, q: 5000, u: 'l', k: 1, d: '2026-06-03', n: 5 }] },
        { id: 'egg', name: 'Eggs', per: 'dz', entries: [
            { id: 'g1', s: 'c', c: 38000, q: 12000, u: 'pc', k: 1, d: '2026-10-25', n: 6 },
            { id: 'g2', s: 'm', c: 93000, q: 30000, u: 'pc', k: 1, d: '2026-10-12', n: 7 }] }] };
    const oil = S.items[0], a = C.analyse(oil, T);
    eq('rows cheapest first', a.rows.map(r => [r.s, r.up]), [['m', 53800], ['i', 57000], ['c', 59500]]);
    eq('the old Metro price of June is not the latest', a.rows[0].e.id, 'e2');
    eq('Imtiaz is 5.9% dearer', Math.round(a.rows[1].pct * 10) / 10, 5.9);
    eq('Imtiaz went up 10.5% since 1 Oct', Math.round(a.rows[1].change * 10) / 10, 10.5);
    eq('Metro went up since June', Math.round(a.rows[0].change * 10) / 10, 7.6);
    eq('lowest ever is June', a.lowest.e.id, 'e5'); eq('one cheapest', a.ties.length, 1);
    // typing a price in the shop
    const v1 = C.verdict(S, oil, { s: 'i', c: 275000, q: 5000, u: 'l', k: 1, d: T, sale: true }, T, L);
    eq('verdict per litre', v1[0].text, 'That is Rs 550 per litre.');
    eq('verdict dearer than Metro', v1[1], { tone: 'bad', text: 'Cheaper at Metro (Rs 2,690 for 5 L, 12 Oct). This price is 2.2% more: the same 5 L would cost about Rs 2,690 there, Rs 60 less.' });
    eq('sale compared with the usual price', v1[2], { tone: 'good', text: 'The sale is real: 3.5% less than the usual price at Imtiaz (Rs 2,850 for 5 L on 20 Oct).' });
    eq('lowest ever line', v1[3], { tone: 'info', text: 'Lowest you have recorded: Rs 500 per litre at Metro (Rs 2,500 for 5 L, 3 Jun).' });
    const v2 = C.verdict(S, oil, { s: 'c', c: 52000, q: 1000, u: 'l', k: 1, d: T }, T, L);
    eq('verdict cheapest', v2[1], { tone: 'good', text: 'Cheapest you have seen: 3.3% less than Metro (Rs 2,690 for 5 L, 12 Oct). You save Rs 18 on 1 L.' });
    eq('verdict last time at this shop', v2[2].text, 'At Corner shop last time (25 Oct): Rs 595 for 1 L. Now 13% less.');
    const v3 = C.verdict(S, oil, { s: 'i', c: 269000, q: 5000, u: 'l', k: 1, d: T }, T, L);
    eq('verdict same as Metro', v3[1].tone, 'same');
    const v4 = C.verdict(S, oil, { s: 'i', c: 290000, q: 5000, u: 'l', k: 1, d: T, sale: true }, T, L);
    eq('a fake sale', v4[2].tone, 'bad'); eq('fake sale words', /not cheaper: 1.8% more/.test(v4[2].text), true);
    // first price and only one shop
    const lone = { id: 'r', name: 'Rice', per: 'kg', entries: [] };
    eq('first price', C.verdict(S, lone, { s: 'm', c: 150000, q: 5000, u: 'kg', k: 1, d: T }, T, L)[1].tone, 'first');
    lone.entries.push({ id: 'r1', s: 'm', c: 150000, q: 5000, u: 'kg', k: 1, d: T, n: 9 });
    eq('same shop only', /No other shop/.test(C.verdict(S, lone, { s: 'm', c: 140000, q: 5000, u: 'kg', k: 1, d: T }, T, L)[1].text), true);
    eq('editing leaves the entry out', C.verdict(S, lone, { s: 'm', c: 140000, q: 5000, u: 'kg', k: 1, d: T }, T, L, 'r1')[1].text, 'This is the first price for Rice. Add prices from other shops to compare.');
    // an old price is flagged
    const oldItem = { id: 'o', name: 'Sugar', per: 'kg', entries: [{ id: 'x', s: 'm', c: 15000, q: 1000, u: 'kg', k: 1, d: '2026-05-01', n: 1 }] };
    eq('old price flagged', C.analyse(oldItem, T).rows[0].old, true);
    eq('old price in verdict', /may have changed/.test(C.verdict(S, oldItem, { s: 'i', c: 16000, q: 1000, u: 'kg', k: 1, d: T }, T, L)[1].text), true);
    // two prices on one day at one shop: the one typed later counts
    const twice = { id: 't', name: 'Milk', per: 'l', entries: [{ id: 'a', s: 'm', c: 22000, q: 1000, u: 'l', k: 1, d: T, n: 2 }, { id: 'b', s: 'm', c: 21000, q: 1000, u: 'l', k: 1, d: T, n: 3 }] };
    eq('later typed wins on same day', C.analyse(twice, T).rows[0].e.id, 'b');
    // a price added later with an older date does not replace the newer one
    twice.entries.push({ id: 'c', s: 'm', c: 19000, q: 1000, u: 'l', k: 1, d: '2026-10-01', n: 9 });
    eq('back-dated entry is not the latest', C.analyse(twice, T).rows[0].e.id, 'b');
    // ties
    const tie = { id: 'y', name: 'Bread', per: 'pc', entries: [{ id: 'a', s: 'm', c: 20000, q: 1000, u: 'pc', k: 1, d: '2026-10-20', n: 1 }, { id: 'b', s: 'c', c: 20000, q: 1000, u: 'pc', k: 1, d: '2026-10-22', n: 2 }] };
    eq('tie: both cheapest', C.analyse(tie, T).ties.length, 2);

    // where to buy
    const P = C.plan(S, T);
    eq('plan groups', P.map(g => [g.name, g.items.map(i => i.item.name)]), [['Metro', ['Cooking oil', 'Eggs']]]);
    eq('plan eggs: 30 for 930 (372 a dozen) beats 12 for 380', Math.round(P[0].items[1].row.up), 37200);
    const txt = C.planText(S, T, L);
    eq('plan text', txt.split('\n').slice(0, 5), ['Where to buy: the cheapest price I have seen for each item', '', 'Metro:', '- Cooking oil: Rs 2,690 for 5 L (Rs 538 per litre, 12 Oct)', '- Eggs: Rs 930 for 30 items (Rs 372 per dozen, 12 Oct)']);
    eq('plan empty', C.planText(C.emptyState(), T, L), '');

    // saved data
    eq('clean keeps good data', C.cleanState(JSON.parse(JSON.stringify(S))).items[0].entries.length, 5);
    eq('clean rejects junk', [C.cleanState(null), C.cleanState({}), C.cleanState({ items: 'x', shops: [] })], [null, null, null]);
    const bad = JSON.parse(JSON.stringify(S));
    bad.items[0].entries.push({ id: 'z1', s: 'nope', c: 100, q: 1000, u: 'l', k: 1, d: T }, { id: 'z2', s: 'm', c: 100, q: 1000, u: 'kg', k: 1, d: T },
        { id: 'z3', s: 'm', c: -5, q: 1000, u: 'l', k: 1, d: T }, { id: 'z4', s: 'm', c: 100, q: 1000, u: 'l', k: 1, d: '2026-02-31' }, { id: 'z5', s: 'm', c: 100, q: 0, u: 'l', k: 1, d: T });
    bad.items.push({ id: 'd', name: 'cooking OIL', per: 'l', entries: [] }, { id: 'q', name: 'Flour', per: 'stone', entries: [] }, { name: '', per: 'kg' });
    bad.shops.push({ id: 'x', name: 'metro' });
    const cl = C.cleanState(bad);
    eq('clean drops bad entries', cl.items[0].entries.length, 5); eq('clean drops duplicate and bad items', cl.items.length, 2); eq('clean drops duplicate shop', cl.shops.length, 3);
    eq('clean keeps the counter ahead', cl.seq >= 7, true);

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n') + '\n\n' + summary;
    else { out.filter(l => l.startsWith('FAIL')).forEach(l => console.log(l)); console.log(summary); if (fail) process.exitCode = 1; }
})();
