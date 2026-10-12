// Checks on the maths. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const I = (price, size, unit, count, name) => ({ price, size, unit, count: count || '', name: name || '' });

        // typed input
        check('price 2.49, 2,49, $2.49, " 2.49 " -> 249', [ '2.49', '2,49', '$2.49', ' 2.49 ' ].every(v => C.parsePrice(v).cents === 249));
        check('price 1,299.00 / 1.299,00 € -> 129900; 0.995 -> 100 (half a cent up)', C.parsePrice('1,299.00').cents === 129900 && C.parsePrice('1.299,00 €').cents === 129900 && C.parsePrice('0.995').cents === 100);
        check('price blank, words, negative, zero, 0.004, huge', C.parsePrice('').blank && C.parsePrice('abc').err === 'nan' && C.parsePrice('-2').err === 'negative' && C.parsePrice('0').err === 'zero' && C.parsePrice('0.004').err === 'zero' && C.parsePrice('2000000000').err === 'big');
        check('size 1,5 -> 1.5; 1,500 -> 1500; 0 refused; 0.0000001 refused; 2000000 too big', C.parseSize('1,5').n === 1.5 && C.parseSize('1,500').n === 1500 && C.parseSize('0').err === 'zero' && C.parseSize('0.0000001').err === 'zero' && C.parseSize('2000000').err === 'big');
        check('how many: blank = 1, 6 -> 6, 1.5 / 0 / -2 / 20000 refused', C.parseCount('').n === 1 && C.parseCount('6').n === 6 && C.parseCount('1.5').err === 'whole' && C.parseCount('0').err === 'zero' && C.parseCount('-2').err === 'negative' && C.parseCount('20000').err === 'big');

        // README example: rice
        const rice = C.compare([I('2.49', '500', 'g', '', 'Small bag'), I('5.29', '1.2', 'kg', '', 'Big bag'), I('4.60', '250', 'g', '4', '4-pack')]);
        check('rice: per kg, Big bag cheapest at 4.41', rice.per.key === 'kg' && rice.best.label === 'Big bag' && C.perText(rice, rice.best.unitPrice) === '4.41 per kg');
        check('rice: order Big bag, 4-pack, Small bag', rice.ranked.map(i => i.label).join() === 'Big bag,4-pack,Small bag');
        const four = rice.ranked[1], small = rice.ranked[2];
        check('rice: 4-pack 4.60 per kg, 4% more, 0.19 more per kg', C.perText(rice, four.unitPrice) === '4.60 per kg' && C.moreText(rice, four, '') === '4% more (0.19 more per kg)');
        check('rice: Small bag 4.98 per kg, 13% more, 0.57 more per kg', C.perText(rice, small.unitPrice) === '4.98 per kg' && C.moreText(rice, small, '') === '13% more (0.57 more per kg)');
        check('rice: same 1.2 kg costs 5.52 (0.23 more) and 5.98 (0.69 more)', C.sameAmountText(rice, four, '') === 'The same 1.2 kg bought this way costs 5.52, 0.23 more.' && C.sameAmountText(rice, small, '') === 'The same 1.2 kg bought this way costs 5.98, 0.69 more.');
        const v = C.verdict(rice, '$');
        check('rice verdict', v.head === 'Big bag is cheapest' && v.sub === '$4.41 per kg. The next cheapest, 4-pack, costs 4% more per kg.');
        check('rice: 4-pack size text 4 × 250 g', C.sizeText(four) === '4 × 250 g');
        check('per 100 g: under 1 shows 3 decimals: 0.441, 0.460, 0.498', (() => { const x = C.compare([I('2.49', '500', 'g'), I('5.29', '1.2', 'kg'), I('4.60', '250', 'g', '4')], '100g'); return x.ranked.map(i => C.perText(x, i.unitPrice)).join('|') === '0.441 per 100 g|0.460 per 100 g|0.498 per 100 g'; })());

        // mixed units: 16 oz for 3.99 vs 500 g for 4.20 -> per oz default (first is oz)
        const mix = C.compare([I('3.99', '16', 'oz'), I('4.20', '500', 'g')]);
        check('16 oz 3.99 vs 500 g 4.20: per oz, the 500 g pack is cheaper', mix.per.key === 'oz' && mix.best.letter === 'B');
        // 3.99/453.59g = 0.008796/g ; 4.20/500 = 0.0084/g -> B cheaper by 4.7%
        check('mixed: the 16 oz pack costs 5% more (4.7%)', mix.ranked[1].letter === 'A' && C.pctText(mix.ranked[1].pct) === '5%');
        check('mixed: same 500 g costs 4.40 the oz way', C.sameAmountText(mix, mix.ranked[1], '') === 'The same 500 g bought this way costs 4.40, 0.20 more.');
        // volume: 2 L 1.89 vs 6 x 330 ml 3.00 vs 1 US gallon 4.50
        const drink = C.compare([I('1.89', '2', 'l'), I('3.00', '330', 'ml', '6'), I('4.50', '1', 'gal')]);
        check('drinks: per litre, 2 L cheapest 0.945 (under 1, so 3 decimals; 0.945 not shown as 0.944), gallon 1.189, cans 1.515', drink.per.label === 'litre' && drink.decimals === 3 && drink.ranked.map(i => i.letter + C.money(i.unitPrice, '', drink.decimals)).join() === 'A0.945,C1.189,B1.515');
        check('half up: 0.945 at 2 decimals is 0.95', C.money(0.945, '', 2) === '0.95' && C.money(1.005, '', 2) === '1.01');
        check('drinks: gallon text "1 US gallon", 2 L text', C.sizeText(drink.ranked[1]) === '1 US gallon' && C.sizeText(drink.ranked[0]) === '2 L');
        // count: toilet roll 9 rolls 4.50 vs 24 rolls 11.00 -> per item
        const tp = C.compare([I('4.50', '9', 'item'), I('11.00', '24', 'item')]);
        check('toilet rolls: 24 for 11.00 (0.458 each) cheaper than 9 for 4.50 (0.500 each): under 1 shows 3 decimals', tp.best.letter === 'B' && tp.decimals === 3);
        check('rolls per item text', C.perText(tp, tp.ranked[0].unitPrice) === '0.458 per item' && C.perText(tp, tp.ranked[1].unitPrice) === '0.500 per item');

        // ties
        const tie = C.compare([I('2.00', '1', 'kg'), I('1.00', '500', 'g')]);
        check('1 kg 2.00 vs 500 g 1.00: both the same', tie.cheapest.length === 2 && C.verdict(tie).head === 'Both cost the same' && C.verdict(tie).tie);
        const tie3 = C.compare([I('2.00', '1', 'kg', '', 'X'), I('1.00', '500', 'g', '', 'Y'), I('3.00', '1', 'kg', '', 'Z')]);
        check('two of three tie: "X and Y are cheapest"', C.verdict(tie3).head === 'X and Y are cheapest' && tie3.ranked[2].label === 'Z');
        check('all three tie', C.verdict(C.compare([I('1', '1', 'kg'), I('2', '2', 'kg'), I('0.5', '500', 'g')])).head === 'All 3 cost the same');
        // nearly the same: more decimals to show the difference
        const near = C.compare([I('4.41', '1', 'kg'), I('4.412', '1', 'kg'), I('8.83', '2', 'kg')]);
        check('4.412 rounds to 4.41 (tie with 4.41); 8.83 for 2 kg = 4.415 shows 4.42, diff matches the shown prices', near.cheapest.length === 2 && near.decimals === 2 && C.money(near.ranked[2].unitPrice, '', 2) === '4.42' && C.moreText(near, near.ranked[2], '') === '0.1% more (0.01 more per kg)');
        check('a difference that rounds to 0.00 gets more decimals', (() => { const x = C.compare([I('10', '1', 'kg'), I('10.004', '1', 'kg')]); return x.cheapest.length === 2; })() && (() => { const x = C.compare([I('1000.00', '1', 'kg'), I('1000.04', '1', 'kg')], '100g'); return C.moreText(x, x.ranked[1], '') === 'less than 0.1% more (0.004 more per 100 g)'; })());
        const near2 = C.compare([I('4.41', '1', 'kg'), I('4.42', '1.002', 'kg')]);
        check('4.41 vs 4.4112/kg: both would show 4.41, so 3 decimals', near2.decimals === 3 && C.perText(near2, near2.ranked[1].unitPrice) === '4.411 per kg');
        check('tiny difference percent: less than 0.1% / 0.4%', C.pctText(0.05) === 'less than 0.1%' && C.pctText(0.4) === '0.4%' && C.pctText(12.97) === '13%');

        // single and empty and wrong kinds
        check('nothing typed -> no verdict', C.verdict(C.compare([I('', '', 'g'), I('', '', 'g')])) === null);
        const one = C.compare([I('2.49', '500', 'g'), I('', '', 'g')]);
        check('one pack: its unit price and ask for another', C.verdict(one).head === 'Item A: 4.98 per kg' && C.verdict(one).single && one.skipped.length === 1);
        const kinds = C.compare([I('2.49', '500', 'g'), I('1.00', '1', 'l'), I('3.00', '1', 'kg')]);
        check('litre among kg: not compared, kg ones still ranked', kinds.other.length === 1 && kinds.other[0].letter === 'B' && kinds.ranked.length === 2 && kinds.best.letter === 'C');
        check('errors per field', (() => { const x = C.readItem(I('-1', 'abc', 'g', '0')); return x.errors.price === 'negative' && x.errors.size === 'nan' && x.errors.count === 'zero'; })());
        check('summary text', C.summaryText(rice, '£').split('\n')[3] === '1. Big bag: 1.2 kg for £5.29 = £4.41 per kg (cheapest)');
        check('money: Rs and CHF get a space, big numbers grouped', C.money(1234.5, 'Rs') === 'Rs 1,234.50' && C.money(2, '€') === '€2.00' && C.fmtCents(123456789, '') === '1,234,567.89');
        check('trimNum 1500 -> 1,500, 1.25 -> 1.25', C.trimNum(1500) === '1,500' && C.trimNum(1.25) === '1.25' && C.trimNum(12345.5) === '12,345.5');
        check('huge numbers: 999,999,999 for 1 g and 0.01 for 1,000,000 kg compare fine', (() => { const x = C.compare([I('999999999', '1', 'g'), I('0.01', '1000000', 'kg')]); return x.best.letter === 'B' && isFinite(x.ranked[1].pct) && /per kg$/.test(C.perText(x, x.best.unitPrice)); })());
        check('per option kept only when it fits the kind', C.compare([I('1', '1', 'kg'), I('2', '1', 'kg')], 'l').per.key === 'kg' && C.compare([I('1', '1', 'kg'), I('2', '1', 'kg')], 'lb').per.key === 'lb');
        check('per lb: 1 kg 2.00 -> 0.907 per lb', (() => { const x = C.compare([I('2', '1', 'kg'), I('3', '1', 'kg')], 'lb'); return C.perText(x, x.best.unitPrice) === '0.907 per lb'; })());

        // saved state
        const c1 = C.clean(null);
        check('clean(null): two empty packs', c1.items.length === 2 && c1.items[0].unit === 'g' && c1.cur === '');
        const c2 = C.clean({ items: [{ id: '<x>', name: 5, price: { a: 1 }, unit: 'bad', size: '1' }, 'junk', null], per: { weight: 'lb', volume: 'kg' }, cur: '<b>' });
        check('clean: bad id, unit, price, per and symbol dropped', c2.items.length === 1 && c2.items[0].id !== '<x>' && c2.items[0].unit === 'g' && c2.items[0].price === '' && c2.items[0].name === '5' && c2.per.weight === 'lb' && !c2.per.volume && c2.cur === '');
        check('clean: at most 10 packs, duplicate ids renamed', (() => { const x = C.clean({ items: Array.from({ length: 14 }, () => ({ id: 'a', price: '1' })) }); return x.items.length === 10 && new Set(x.items.map(i => i.id)).size === 10; })());
        check('clean: long name cut to 40', C.clean({ items: [{ name: 'x'.repeat(200) }] }).items[0].name.length === 40);
        return r;
    }
    if (typeof module !== 'undefined' && module.exports) {
        const res = runTests(require('./core.js'));
        res.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
        const bad = res.filter(t => !t.ok).length;
        console.log(res.length - bad + ' of ' + res.length + ' checks passed');
        process.exitCode = bad ? 1 : 0;
    } else root.runTests = runTests;
})(this);
