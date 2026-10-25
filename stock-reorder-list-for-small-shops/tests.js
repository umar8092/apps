// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.SRL;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const L = 'en-US';
    const q = (s, o) => C.parseQty(s, o).q, qerr = (s, o) => !!C.parseQty(s, o).error;

    // typed quantities
    eq('4', q('4'), 400); eq('2.5', q('2.5'), 250); eq('2,5', q('2,5'), 250); eq('0', q('0'), 0); eq('4 cartons', q('4 cartons'), 400); eq('12.5 kg', q('12.5kg'), 1250);
    eq('1,000', q('1,000'), 100000); eq('max 999999', q('999999'), C.MAXQ); eq('too many', qerr('1000000'), true); eq('minus', qerr('-1'), true);
    eq('blank', qerr(''), true); eq('words', qerr('four'), true); eq('letters only', C.parseQty('abc').error, 'Type a number, such as 4 or 2.5.'); eq('3 decimals', qerr('0.125'), true); eq('zero refused when asked', qerr('0', { zeroOk: false }), true);
    eq('pasted with spaces', q('  6  '), 600);
    eq('qtyInput 250', C.qtyInput(250), '2.5'); eq('qtyInput 400', C.qtyInput(400), '4'); eq('qtyInput 1225', C.qtyInput(1225), '12.25');
    eq('4 cartons text', C.qtyText(400, 'carton', L), '4 cartons'); eq('1 carton', C.qtyText(100, 'carton', L), '1 carton'); eq('2.5 kg', C.qtyText(250, 'kg', L), '2.5 kg');
    eq('2 boxes', C.qtyText(200, 'box', L), '2 boxes'); eq('own unit stays', C.qtyText(300, 'jars', L), '3 jars'); eq('0 bags', C.qtyText(0, 'bag', L), '0 bags');
    eq('presets carton', C.presets('carton'), { low: 200, full: 600 }); eq('presets own unit', C.presets('jars'), { low: 200, full: 1000 });
    eq('price 4600', C.parseAmount('4,600').cents, 460000); eq('price 12.50', C.parseAmount('12.50').cents, 1250); eq('price Rs 180', C.parseAmount('Rs 180').cents, 18000);
    eq('cost 4 x 4600', C.lineCost(460000, 400), 1840000); eq('cost 2.5 kg x 3.33 rounds to cent', C.lineCost(333, 250), 833); eq('cost 0.5 x 0.01', C.lineCost(1, 50), 1);
    eq('phone local refused', !!C.parsePhone('0300 1234567').error, true); eq('phone intl', C.parsePhone('+92 300 123-4567').digits, '923001234567'); eq('phone blank', C.parsePhone('').digits, '');

    // the main situation
    const it = (o) => Object.assign({ id: o.name, unit: 'piece', sup: '', stock: 0, low: 0, full: 100, price: 0, arch: false, upd: '2026-10-26', ord: null, got: [] }, o);
    const s = C.emptyState();
    s.items = [
        it({ name: 'Cooking oil 5 L', unit: 'carton', sup: 'Ali Traders', stock: 200, low: 200, full: 600, price: 460000 }),
        it({ name: 'Sugar 50 kg', unit: 'bag', sup: 'ali traders ', stock: 100, low: 100, full: 300, price: 725000 }),
        it({ name: 'Shopping bags', unit: 'packet', sup: 'Bilal Packaging', stock: 300, low: 1000, full: 4000, price: 18000 }),
        it({ name: 'UHT milk 1 L', unit: 'carton', sup: '', stock: 0, low: 200, full: 800 }),
        it({ name: 'Rice 25 kg', unit: 'bag', sup: 'Ali Traders', stock: 500, low: 200, full: 600, price: 900000 }),
        it({ name: 'Loose daal', unit: 'kg', sup: 'Ali Traders', stock: 1250, low: 500, full: 2500 }),
        it({ name: 'Biscuits', unit: 'box', sup: 'Ali Traders', stock: 100, low: 200, full: 700, ord: { q: 600, d: '2026-10-24' } }),
        it({ name: 'Old soap', unit: 'box', sup: 'Ali Traders', stock: 0, low: 200, full: 700, arch: true })];
    const o = C.orders(s);
    eq('2 named suppliers + no supplier, no supplier last', o.groups.map(g => g.sup), ['Ali Traders', 'Bilal Packaging', '']);
    eq('ali traders spelled differently is one supplier', o.groups[0].lines.map(l => l.name), ['Cooking oil 5 L', 'Sugar 50 kg']);
    eq('oil 4 cartons', o.groups[0].lines[0].q, 400); eq('sugar 2 bags', o.groups[0].lines[1].q, 200);
    eq('Ali Traders about 32,900', C.fmt(o.groups[0].est, '', L), '32,900');
    eq('bags 37 packets = 6,660', [o.groups[1].lines[0].q, o.groups[1].est], [3700, 666000]);
    eq('milk 8 cartons, out of stock, no price', [o.groups[2].lines[0].q, o.groups[2].lines[0].out, o.groups[2].noPrice], [800, true, 1]);
    eq('all suppliers 39,560, 1 no price, 4 items', [o.est, o.noPrice, o.items], [3956000, 1, 4]);
    eq('archived and on-order items not listed', o.groups.some(g => g.lines.some(l => l.name === 'Old soap' || l.name === 'Biscuits')), false);
    eq('rice enough', C.need(s.items[4]).kind, 'ok'); eq('daal 12.5 kg enough', C.need(s.items[5]).kind, 'ok');
    eq('stock exactly at level is listed', C.need(s.items[0]).kind, 'order');
    eq('one above level is not', C.need(Object.assign({}, s.items[0], { stock: 201 })).kind, 'ok');
    eq('level 0 lists only when out', [C.need(it({ stock: 0, low: 0, full: 500 })).kind, C.need(it({ stock: 100, low: 0, full: 500 })).kind], ['order', 'ok']);
    eq('waiting list', C.waiting(s).map(x => x.name), ['Biscuits']);
    const msg = C.orderText(o.groups[0], 'Madina General Store', '2026-10-26', L);
    eq('message', msg, 'Hello Ali Traders, please send to Madina General Store:\n1. Cooking oil 5 L: 4 cartons\n2. Sugar 50 kg: 2 bags\nOrder of Mon, Oct 26, 2026. Thank you.\nMadina General Store');
    eq('message has no prices', /4,600|32,900/.test(msg), false);
    eq('message with no shop or supplier', C.orderText(o.groups[2], '', '2026-10-26', L).split('\n')[0], 'Please send:');

    // order sent, delivery short, new price
    const oil = JSON.parse(JSON.stringify(s.items[0]));
    C.markOrdered(oil, 400, '2026-10-26');
    eq('ordered not listed again', C.need(oil).kind, 'ordered');
    C.receive(oil, 300, 470000, '2026-10-28');
    eq('received 3 of 4: stock 5, order closed, new price', [oil.stock, oil.ord, oil.price, oil.upd], [500, null, 470000, '2026-10-28']);
    eq('delivery remembered', oil.got[0], { d: '2026-10-28', q: 300, p: 470000 });
    C.receive(oil, 100, 0, '2026-10-29');
    eq('no price typed keeps the old one', [oil.price, oil.got[0].p], [470000, 470000]);
    eq('received caps at max', (() => { const x = it({ stock: C.MAXQ - 50 }); C.receive(x, 100, 0, '2026-10-29'); return x.stock; })(), C.MAXQ);

    // names and suppliers
    eq('same item ignores case and spaces', C.sameItem({ name: 'Sugar  50 kg', sup: 'Ali Traders' }, { name: 'sugar 50 kg', sup: ' ali traders' }), true);
    eq('other supplier is another item', C.sameItem({ name: 'Sugar', sup: 'Ali' }, { name: 'Sugar', sup: 'Bilal' }), false);

    // dates
    eq('ago today', C.ago('2026-10-26', '2026-10-26', L), 'today'); eq('ago yesterday', C.ago('2026-10-25', '2026-10-26', L), 'yesterday');
    eq('ago 4 days', C.ago('2026-10-22', '2026-10-26', L), '4 days ago'); eq('ago long', C.ago('2026-08-01', '2026-10-26', L), 'on Sat, Aug 1');
    eq('ago over the year end', C.ago('2026-12-30', '2027-01-02', L), '3 days ago');

    // saved data
    eq('clean state keeps good items', C.cleanState(JSON.parse(JSON.stringify(s))).items.length, 8);
    eq('corrupt state', C.cleanState({ items: 'x' }), null); eq('not an object', C.cleanState(null), null);
    const bad = C.cleanState({ cur: 'XX', shop: 5, phones: { a: '123', b: '923001234567', c: 9 }, items: [
        { name: '', unit: 'kg', stock: 1, low: 0, full: 2 }, { name: 'A', unit: 'kg', stock: -1, low: 0, full: 2 }, { name: 'B', unit: 'kg', stock: 1, low: 5, full: 5 },
        { name: 'C', unit: 'kg', stock: 1.5, low: 0, full: 2 }, { name: 'D', unit: 'kg', stock: 100, low: 0, full: 200, ord: { q: 0, d: 'x' }, price: -4, got: [{ d: 'bad', q: 1 }] }] });
    eq('bad items dropped', bad.items.map(x => x.name), ['D']); eq('bad order dropped', bad.items[0].ord, null); eq('bad price 0', bad.items[0].price, 0);
    eq('bad delivery dropped', bad.items[0].got, []); eq('bad currency', bad.cur, ''); eq('bad shop', bad.shop, ''); eq('phones', bad.phones, { b: '923001234567' });
    eq('very long name cut to 60', C.cleanItem({ name: 'x'.repeat(200), unit: 'kg', stock: 0, low: 0, full: 1 }).name.length, 60);

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function') { console.log(out.filter(x => x.startsWith('FAIL')).join('\n')); console.log(summary); if (fail) process.exitCode = 1; }
    else document.getElementById('out').textContent = summary + '\n\n' + out.join('\n');
})();
