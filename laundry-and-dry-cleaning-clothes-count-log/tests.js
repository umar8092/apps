// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.LDC;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const L = 'en-GB';
    const c = (s, o) => C.parseAmount(s, o).cents, err = (s, o) => !!C.parseAmount(s, o).error;
    const n = s => C.parseCount(s).n, nerr = s => !!C.parseCount(s).error;

    // typed prices and counts
    eq('40', c('40'), 4000); eq('12.50', c('12.50'), 1250); eq('12,50', c('12,50'), 1250); eq('Rs 1,240', c('Rs 1,240'), 124000); eq('lakh', c('1,00,000'), 10000000);
    eq('price 0 allowed', c('0', { zeroOk: true }), 0); eq('payment 0 refused', err('0'), true); eq('minus', err('-5'), true); eq('words', err('forty'), true);
    eq('3 decimals', err('0.505'), true); eq('price too big', err('100001', { max: C.MAXP }), true); eq('price max', c('100000', { max: C.MAXP }), 10000000);
    eq('count 5', n('5'), 5); eq('count 05', n('05'), 5); eq('count 5 pcs', n('5 pcs'), 5); eq('count 0', n('0'), 0); eq('count blank', nerr(''), true);
    eq('count minus', nerr('-1'), true); eq('count half', nerr('1.5'), true); eq('count huge', nerr('1000'), true); eq('count max', n('999'), 999); eq('count words', nerr('five'), true);
    eq('priceInput 40', C.priceInput(4000), '40'); eq('priceInput 12.50', C.priceInput(1250), '12.50'); eq('priceInput 0', C.priceInput(0), '');

    // the main situation: 14 pieces given on 18 Oct, 12 back by 23 Oct
    const b = { id: 'b1', shop: 's1', date: '2026-10-18', svc: 'wash', note: '', pays: [], done: '', comp: 0, extra: { label: 'Express', c: 25000 }, lines: [
        { t: 'Shirt', n: 5, back: 3, lost: 0, p: 4000 }, { t: 'Trousers or jeans', n: 3, back: 3, lost: 0, p: 5000 },
        { t: 'Shalwar kameez', n: 4, back: 4, lost: 0, p: 12000 }, { t: 'Bedsheet', n: 2, back: 2, lost: 0, p: 8000 }] };
    let k = C.calc(b);
    eq('given 14', k.given, 14); eq('back 12', k.back, 12); eq('out 2', k.out, 2);
    eq('bill 200+150+480+160+250 = 1,240', k.bill, 124000); eq('to pay 1,240', C.fmt(k.toPay, '', 'en-US'), '1,240');
    eq('out list', C.outList(b), 'Shirt × 2');
    eq('status 5 days', C.status(b, 0, '2026-10-23', L).text, '2 pieces still with the laundry (5 days)');
    eq('status ready in 3, 2 days late', C.status(b, 3, '2026-10-23', L).text, '2 pieces still with the laundry (5 days), 2 days late');
    eq('status late kind', C.status(b, 3, '2026-10-23', L).kind, 'late');
    eq('status due today', C.status(b, 5, '2026-10-23', L).kind, 'due');
    eq('status ready by', /ready by/.test(C.status(b, 7, '2026-10-23', L).text), true);
    eq('status same day', C.status(b, 0, '2026-10-18', L).text, '2 pieces still with the laundry (0 days)');

    // part payment
    b.pays.push({ id: 'p1', d: '2026-10-23', c: 100000 });
    k = C.calc(b); eq('paid 1,000', k.paid, 100000); eq('left 240', k.toPay, 24000); eq('payText', C.payText(k.toPay, 'Rs', 'en-US'), 'To pay: Rs 240');
    // everything back
    b.lines[0].back = 5; C.markDone(b, '2026-10-24'); eq('done date set', b.done, '2026-10-24');
    eq('all back text', C.status(b, 0, '2026-10-25', L).text, 'All back on 24 Oct');
    C.markDone(b, '2026-10-25'); eq('done date kept', b.done, '2026-10-24');
    b.lines[0].back = 4; C.markDone(b, '2026-10-25'); eq('done cleared when one goes back out', b.done, '');
    // a lost shirt: not charged, and the shop agreed to pay 500 for it
    b.lines[0].lost = 1; b.comp = 50000; C.markDone(b, '2026-10-25');
    k = C.calc(b); eq('lost not charged', k.charge, 4 * 4000 + 15000 + 48000 + 16000); eq('bill after comp', k.bill, 4 * 4000 + 15000 + 48000 + 16000 + 25000 - 50000);
    eq('shop owes you', C.payText(k.toPay, '', 'en-US'), 'The shop owes you 300'); eq('lost status', C.status(b, 0, '2026-10-25', L).text, 'All back on 25 Oct, except 1 lost piece');
    eq('paid in full', C.payText(0, '', 'en-US'), 'Paid in full');

    // odd cents
    const o = { id: 'b2', shop: 's1', date: '2026-10-02', svc: 'iron', note: '', pays: [], done: '', comp: 0, extra: null, lines: [{ t: 'Shirt', n: 3, back: 0, lost: 0, p: 1250 }, { t: 'Towel', n: 1, back: 0, lost: 0, p: 0 }] };
    k = C.calc(o); eq('3 × 12.50 = 37.50', C.fmt(k.bill, '$', 'en-US'), '$37.50'); eq('price missing counted', k.noPrice, 1);
    eq('text price not set', /Towel × 1 \(price not set\)/.test(C.batchText(o, 'City Laundry', '', 'en-US')), true);

    // month and shop totals
    const st = C.cleanState({ v: 1, cur: 'Rs', last: 's1', shops: [{ id: 's1', name: 'City Laundry', ready: 3, prices: { 'wash|shirt': 4000 } }, { id: 's2', name: 'Star Dry Cleaners', prices: {} }],
        batches: [o, { id: 'b3', shop: 's2', date: '2026-10-10', svc: 'dry', lines: [{ t: 'Suit', n: 1, back: 1, lost: 0, p: 60000 }], pays: [{ d: '2026-10-12', c: 60000 }], comp: 0 },
            { id: 'b4', shop: 's1', date: '2026-09-28', svc: 'wash', lines: [{ t: 'Shirt', n: 2, back: 2, lost: 0, p: 4000 }], pays: [], comp: 0 }] });
    eq('clean kept all', [st.shops.length, st.batches.length], [2, 3]);
    const ms = C.monthSummary(st, '2026-10');
    eq('month rows', ms.rows.map(r => [r.shop.name, r.batches, r.given, r.bill, r.toPay]), [['City Laundry', 1, 4, 3750, 3750], ['Star Dry Cleaners', 1, 1, 60000, 0]]);
    eq('month total bill', ms.tot.bill, 63750);
    eq('shop balance all months', C.shopBalance(st, 's1'), 3750 + 8000);
    eq('out now', C.outNow(st), { n: 4, batches: 1 }); eq('owed now', C.owedNow(st), { owe: 11750, ahead: 0 });
    const mt = C.monthText(st, '2026-10', 's1', 'Rs', 'en-GB');
    eq('month text', mt.split('\n')[0], 'City Laundry: October 2026'); eq('month text to pay', mt.split('\n').pop(), 'To pay: Rs 37.50');
    eq('price memory', C.priceFor(st.shops[0], 'wash', 'Shirt'), 4000); eq('price memory other service', C.priceFor(st.shops[0], 'iron', 'Shirt'), 0);
    const sh = st.shops[1]; C.rememberPrices(sh, 'dry', [{ t: 'Suit', p: 65000 }, { t: 'Coat', p: 0 }]);
    eq('remember new price only', sh.prices, { 'dry|suit': 65000 });

    // corrupt and odd saved data
    eq('null state', C.cleanState(null), null); eq('no arrays', C.cleanState({ shops: 1 }), null);
    const bad = C.cleanState({ cur: '<b>', last: 'zz', shops: [{ id: 's1', name: '  ', ready: 99 }, { id: 's2', name: 'A', ready: 99, prices: { 'x|y': 5, 'wash|shirt': -1 } }],
        batches: [{ id: 'x', shop: 'nope', date: '2026-10-01', lines: [{ t: 'Shirt', n: 1 }] }, { id: 'y', shop: 's2', date: '2026-02-30', lines: [] },
            { id: 'z', shop: 's2', date: '2026-10-01', svc: 'zzz', lines: [{ t: 'Shirt', n: 5, back: 9, lost: 2, p: -3 }, { t: '', n: 1 }, { t: 'Towel', n: 0 }], pays: [{ d: 'x', c: 5 }, { d: '2026-10-02', c: 100 }], comp: -1, extra: { c: 0 } }] });
    eq('bad cur', bad.cur, ''); eq('blank shop dropped', bad.shops.length, 1); eq('ready out of range', bad.shops[0].ready, 0); eq('bad prices dropped', bad.shops[0].prices, {});
    eq('last falls back', bad.last, 's2'); eq('only valid batch kept', bad.batches.map(x => x.id), ['z']);
    eq('clamped line', bad.batches[0].lines, [{ t: 'Shirt', n: 5, back: 0, lost: 2, p: 0 }]); eq('svc default', bad.batches[0].svc, 'wash');
    eq('bad pay dropped', bad.batches[0].pays.length, 1); eq('bad comp', bad.batches[0].comp, 0); eq('bad extra', bad.batches[0].extra, null);
    eq('custom kinds cleaned', C.cleanState({ shops: [], batches: [], kinds: ['Abaya', 'abaya', 'Shirt', '', 5, 'Prayer mat'] }).kinds, ['Abaya', 'Prayer mat']);
    eq('long text cut', C.cleanState({ shops: [{ id: 'a', name: 'x'.repeat(500) }], batches: [] }).shops[0].name.length, 60);

    const summary = (fail ? 'FAILED ' : 'ALL PASSED ') + pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = summary + '\n\n' + out.join('\n');
    else { out.filter(l => l.startsWith('FAIL')).forEach(l => console.log(l)); console.log(summary); process.exitCode = fail ? 1 : 0; }
})();
