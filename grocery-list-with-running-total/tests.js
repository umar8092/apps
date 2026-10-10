// Checks on the maths. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const it = (name, qty, price, got = false) => ({ id: name, name, qty, price, got });
        const P = v => C.parsePrice(v), Q = v => C.parseQty(v);

        // prices
        check('1.29 -> 129 cents', P('1.29').cents === 129);
        check('1,29 (comma decimal) -> 129', P('1,29').cents === 129);
        check('$1,299.00 pasted -> 129900', P('$1,299.00').cents === 129900);
        check('1.299,00 € (European) -> 129900', P('1.299,00 €').cents === 129900);
        check('" 12 " -> 1200', P(' 12 ').cents === 1200);
        check('0 is allowed (free item)', P('0').cents === 0);
        check('.5 -> 50', P('.5').cents === 50);
        check('third decimal rounds half up: 1.005 -> 101, 1.004 -> 100', P('1.005').cents === 101 && P('1.004').cents === 100);
        check('blank price is allowed (no price yet)', P('').blank && P('   ').blank);
        check('negative price refused', P('-5').err === 'negative' && P('- 5').err === 'negative');
        check('words refused', P('abc').err === 'nan' && P('1.2.3').err === 'nan' && P('.').err === 'nan');
        check('over 100,000.00 refused', P('100000.01').err === 'big' && P('9999999').err === 'big' && P('100000').cents === 10000000);

        // quantities
        check('blank quantity = 1', Q('').n === 1000);
        check('2 -> 2000, 1.5 -> 1500, 0,25 -> 250', Q('2').n === 2000 && Q('1.5').n === 1500 && Q('0,25').n === 250);
        check('0.0005 rounds to 0.001, 0.0004 is zero', Q('0.0005').n === 1 && Q('0.0004').err === 'zero');
        check('0 and negative refused', Q('0').err === 'zero' && Q('-1').err === 'negative');
        check('1000 refused, 999 allowed', Q('1000').err === 'big' && Q('999').n === 999000);
        check('words refused', Q('two').err === 'nan');
        check('qtyText 1500 -> 1.5, 2000 -> 2, 125 -> 0.125', C.qtyText(1500) === '1.5' && C.qtyText(2000) === '2' && C.qtyText(125) === '0.125');

        // money text
        check('fmt 4144 -> 41.44, 123456789 -> 1,234,567.89', C.fmt(4144) === '41.44' && C.fmt(123456789) === '1,234,567.89');
        check('fmt with $ and with kr, negative', C.fmt(999, '$') === '$9.99' && C.fmt(999, 'kr') === 'kr 9.99' && C.fmt(-210, '£') === '-£2.10');
        check('fmt 0 and 5 cents', C.fmt(0) === '0.00' && C.fmt(5) === '0.05');

        // line totals, rounded half up to the cent
        check('2 x 1.29 = 2.58', C.lineCents(it('Milk', 2000, 129)) === 258);
        check('1.2 kg x 1.10 = 1.32', C.lineCents(it('Bananas', 1200, 110)) === 132);
        check('0.333 x 1.00 = 0.33, 0.335 x 1.00 = 0.34 (half up)', C.lineCents(it('a', 333, 100)) === 33 && C.lineCents(it('a', 335, 100)) === 34);
        check('no price -> null', C.lineCents(it('Card', 1000, null)) === null);
        check('biggest line 999 x 100,000.00 is exact', C.lineCents(it('x', 999000, 10000000)) === 9990000000);

        // the README example: 12 items, budget 50.00
        const LIST = [it('Milk', 2000, 129), it('Bread', 1000, 145), it('Eggs (12)', 1000, 320), it('Chicken breast', 1000, 650), it('Bananas', 1200, 110),
            it('Rice 5 kg', 1000, 899), it('Tomatoes', 500, 280), it('Cheddar', 1000, 375), it('Washing-up liquid', 1000, 199), it('Coffee', 1000, 549),
            it('Apples', 6000, 35), it('Pasta', 3000, 89)];
        let s = C.summary({ items: LIST, budget: 5000 });
        check('example: whole list 41.44, 8.56 to spare, nothing in trolley', s.whole === 4144 && s.spare === 856 && s.trolley === 0 && s.budgetLeft === 5000 && s.toGet === 12);
        const shop = LIST.map(x => Object.assign({}, x, { got: ['Milk', 'Bread', 'Eggs (12)', 'Chicken breast', 'Bananas', 'Rice 5 kg'].includes(x.name) }));
        shop.push(it('Chocolate', 2000, 249, true));                 // unplanned
        shop.find(x => x.name === 'Chicken breast').price = 725;      // shelf price was higher
        s = C.summary({ items: shop, budget: 5000 });
        // trolley: 2.58 + 1.45 + 3.20 + 7.25 + 1.32 + 8.99 + 4.98 = 29.77; still to get: 1.40 + 3.75 + 1.99 + 5.49 + 2.10 + 2.67 = 17.40
        check('shop: trolley 29.77, still to get 17.40, whole 47.17', s.trolley === 2977 && s.left === 1740 && s.whole === 4717);
        check('shop: 20.23 left to spend, 2.83 to spare at the end', s.budgetLeft === 2023 && s.spare === 283);
        check('shop: 7 of 13 in the trolley', s.got === 7 && s.count === 13 && s.toGet === 6);
        shop.push(it('Wine', 1000, 899));
        s = C.summary({ items: shop, budget: 5000 });
        check('add wine 8.99: whole 56.16, 6.16 over budget', s.whole === 5616 && s.spare === -616);
        s = C.summary({ items: shop.map(x => Object.assign({}, x, { got: true })), budget: 5000 });
        check('all in trolley: trolley 56.16, 6.16 over right now', s.trolley === 5616 && s.budgetLeft === -616 && s.left === 0);

        // tax
        check('tax 41.44 at 8.875% = 3.68', C.taxOn(4144, 8875) === 368);
        check('tax 0 when no rate', C.taxOn(4144, null) === 0 && C.taxOn(4144, 0) === 0);
        s = C.summary({ items: LIST, budget: 5000, tax: 8875 });
        check('with 8.875% tax: whole 45.12, 4.88 to spare', s.whole === 4512 && s.spare === 488 && s.wholeTax === 368);
        s = C.summary({ items: shop, tax: 10000 });
        check('with tax: trolley + still to get always equals the whole list', s.trolley + s.left === s.whole);
        check('parseTax 8.875 -> 8875, 30 ok, 30.1 refused, blank', C.parseTax('8.875').n === 8875 && C.parseTax('30').n === 30000 && C.parseTax('30.1').err === 'big' && C.parseTax('').blank);

        // no budget, no prices, empty
        s = C.summary({ items: [] });
        check('empty list: all zero, no budget fields', s.whole === 0 && s.trolley === 0 && s.count === 0 && s.budget === null && s.spare === undefined);
        s = C.summary({ items: [it('Birthday card', 1000, null), it('Milk', 1000, 129, true), it('Plant', 1000, null, true)] });
        check('items with no price are counted and reported', s.noPrice === 2 && s.noPriceGot === 1 && s.whole === 129 && s.trolley === 129);
        s = C.summary({ items: [it('Free sample', 1000, 0, true)], budget: 100 });
        check('a 0.00 item costs nothing', s.trolley === 0 && s.budgetLeft === 100 && s.noPrice === 0);
        s = C.summary({ items: [it('x', 999000, 10000000)], budget: 100 });
        check('huge totals stay exact', s.whole === 9990000000 && s.spare === 100 - 9990000000);

        // pasting a list
        const L = v => C.parseLine(v);
        const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        check('"Milk" -> 1, no price', eq(L('Milk'), { name: 'Milk', qty: 1000, price: null }));
        check('"2 x Milk 1.29"', eq(L('2 x Milk 1.29'), { name: 'Milk', qty: 2000, price: 129 }));
        check('"2x Milk"', eq(L('2x Milk'), { name: 'Milk', qty: 2000, price: null }));
        check('"Milk x2 - 1.29"', eq(L('Milk x2 - 1.29'), { name: 'Milk', qty: 2000, price: 129 }));
        check('"- Bread", "• Bread", "* Bread", "[ ] Bread", "[x] Bread", "1. Bread"', ['- Bread', '• Bread', '* Bread', '[ ] Bread', '[x] Bread', '1. Bread', '3) Bread'].every(v => eq(L(v), { name: 'Bread', qty: 1000, price: null })));
        check('"Eggs 12" stays a name (no decimals, no currency sign)', eq(L('Eggs 12'), { name: 'Eggs 12', qty: 1000, price: null }));
        check('"Rice $9" and "Rice £8.99" and "Rice 8,99 €"', L('Rice $9').price === 900 && L('Rice £8.99').price === 899 && L('Rice 8,99 €').price === 899 && L('Rice 8,99 €').name === 'Rice');
        check('"7 Up 1.50" keeps 7 Up', eq(L('7 Up 1.50'), { name: '7 Up', qty: 1000, price: 150 }));
        check('"1.5 x Bananas: 1.10"', eq(L('1.5 x Bananas: 1.10'), { name: 'Bananas', qty: 1500, price: 110 }));
        check('blank lines and bare bullets are skipped', C.parseList('Milk\n\n  \n-\nBread\r\nEggs').map(x => x.name).join() === 'Milk,Bread,Eggs');
        check('very long name is cut to 80 characters', L('a'.repeat(200)).name.length === 80);
        check('"1.29" on its own line is not an item', L('1.29') === null);

        // merging the same item
        const items = [it('Milk', 1000, 129), it('Bread', 1000, null), it('Eggs', 1000, 320, true)];
        check('same name, same price merges (any case)', C.findMerge(items, { name: ' milk ', price: 129 }) === items[0]);
        check('same name, no price merges', C.findMerge(items, { name: 'Milk', price: null }) === items[0] && C.findMerge(items, { name: 'bread', price: 199 }) === items[1]);
        check('different price does not merge', C.findMerge(items, { name: 'Milk', price: 150 }) === null);
        check('item already in the trolley does not merge', C.findMerge(items, { name: 'Eggs', price: 320 }) === null);

        // saved data
        check('corrupt saved data -> empty list', eq(C.clean(null), { items: [], budget: null, tax: null, cur: '' }) && C.clean('x').items.length === 0 && C.clean({ items: 'no' }).items.length === 0);
        const c = C.clean({ items: [{ id: 'a', name: '  Milk  ', qty: 2000, price: 129, got: true }, { name: '' }, null, { id: 'a', name: 'Bread', qty: -1, price: -5 }, { name: 'Tea', qty: 1.5, price: 1.2, got: 'yes' }],
            budget: 5000, tax: 99999, cur: '<b>' });
        check('clean keeps good rows and fixes bad values', c.items.length === 3 && c.items[0].name === 'Milk' && c.items[0].got === true && c.items[1].qty === 1000 && c.items[1].price === null && c.items[2].got === false && c.items[2].price === null);
        check('clean gives duplicate ids new ids', c.items[0].id !== c.items[1].id);
        check('clean keeps budget, drops bad tax and unknown currency', c.budget === 5000 && c.tax === null && c.cur === '');
        check('clean keeps a known currency', C.clean({ cur: '€' }).cur === '€');
        check('clean caps at 300 items', C.clean({ items: Array.from({ length: 400 }, (_, i) => ({ name: 'x' + i })) }).items.length === 300);

        // text for copy and email
        const txt = C.listText({ items: [it('Milk', 2000, 129, true), it('Bread', 1000, 145), it('Card', 1000, null), it('Apples', 1500, null)], budget: 1000 }, '$');
        check('list text has totals, budget and both sections', txt.includes('Grocery list: 4 items, $4.03 in total') && txt.includes('Budget $10.00: $5.97 to spare') && txt.includes('Still to get ($1.45):') && txt.includes('In the trolley ($2.58):'));
        check('list text lines', txt.includes('[x] Milk: 2 x $1.29 = $2.58') && txt.includes('[ ] Bread: $1.45') && txt.includes('[ ] Card\n') && txt.includes('[ ] Apples (1.5)') && txt.includes('2 items have no price yet.'));
        check('list text over budget', C.listText({ items: [it('Wine', 1000, 1500)], budget: 1000 }).includes('5.00 over budget'));
        return r;
    }
    if (typeof module === 'object' && module.exports) {
        const r = runTests(require('./core.js'));
        r.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
        const bad = r.filter(t => !t.ok).length;
        console.log((r.length - bad) + ' of ' + r.length + ' checks passed');
        process.exit(bad ? 1 : 0);
    } else root.runTests = runTests;
})(this);
