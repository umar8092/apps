// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.MealCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const P = l => { const p = C.parseLine(l); return p && [p.name, p.qty ? p.qty[0] + '/' + p.qty[1] : null, p.unit]; };
    const A = l => C.lineAmount(C.parseLine(l));

    // ---------- reading ingredient lines ----------
    eq('grams', P('500 g beef mince'), ['Beef mince', '500/1', 'g']);
    eq('glued grams', P('200g pasta'), ['Pasta', '200/1', 'g']);
    eq('count with size and prep words', P('2 large onions, finely chopped'), ['Onions', '2/1', null]);
    eq('tin', P('1 tin chopped tomatoes'), ['Tomatoes', '1/1', 'tin']);
    eq('2 x 400 g tins', P('2 x 400g tins chickpeas'), ['Chickpeas', '800/1', 'g']);
    eq('size in brackets is not the amount', P('1 (400 g) can coconut milk'), ['Coconut milk', '1/1', 'can']);
    eq('fraction', P('1/2 cup milk'), ['Milk', '1/2', 'cup']);
    eq('fraction glyph', P('½ tsp salt'), ['Salt', '1/2', 'tsp']);
    eq('mixed number', P('1 1/2 cups rice'), ['Rice', '3/2', 'cup']);
    eq('range buys the bigger number', P('2-3 carrots'), ['Carrots', '3/1', null]);
    eq('comma decimal', P('1,5 kg potatoes'), ['Potatoes', '3/2', 'kg']);
    eq('thousands comma', P('1,000 g flour'), ['Flour', '1000/1', 'g']);
    eq('amount at the end', P('Chicken 500 g'), ['Chicken', '500/1', 'g']);
    eq('amount after colon', P('Eggs: 6'), ['Eggs', '6/1', null]);
    eq('amount after x', P('Eggs x 6'), ['Eggs', '6/1', null]);
    eq('amount after dash', P('Milk - 2 litres'), ['Milk', '2/1', 'l']);
    eq('a tin of', P('a tin of tuna'), ['Tuna', '1/1', 'tin']);
    eq('a little oil has no amount', P('a little oil'), ['Oil', null, null]);
    eq('pinch has no amount', P('pinch of salt'), ['Salt', null, null]);
    eq('no amount', P('Salt and pepper'), ['Salt and pepper', null, null]);
    eq('juice of a lemon', P('Juice of 1 lemon'), ['Lemon', '1/1', null]);
    eq('dozen', P('1 dozen eggs'), ['Eggs', '12/1', null]);
    eq('word number', P('two onions'), ['Onions', '2/1', null]);
    eq('bullet removed', P('- 2 tbsp olive oil'), ['Olive oil', '2/1', 'tbsp']);
    eq('numbered line', P('3. 100 g butter'), ['Butter', '100/1', 'g']);
    eq('heading ignored', C.parseLine('For the sauce:'), null);
    eq('blank ignored', C.parseLine('   '), null);
    eq('null ignored', C.parseLine(null), null);
    eq('zero amount means no amount', P('0 g sugar'), ['Sugar', null, null]);
    eq('3rd is not an amount', P('3rd shelf spice'), ['3rd shelf spice', null, null]);
    eq('very long line cut to 120', C.parseLine('x'.repeat(500)).name.length, 120);
    eq('to taste dropped', P('Black pepper, to taste'), ['Black pepper', null, null]);
    eq('lines: up to 60', C.parseLines(Array(80).fill('1 egg').join('\n')).length, 60);
    eq('lines with CRLF', C.parseLines('1 egg\r\n2 eggs').length, 2);

    // ---------- names that are the same thing ----------
    eq('plural onions', C.nameKey('Onions'), 'onion');
    eq('tomatoes', C.nameKey('tomatoes'), 'tomato');
    eq('berries', C.nameKey('berries'), 'berry');
    eq('couscous kept', C.nameKey('couscous'), 'couscous');
    eq('hummus kept', C.nameKey('Hummus'), 'hummus');
    eq('case and spaces', C.nameKey('  Basmati   RICE '), 'basmati rice');

    // ---------- aisles ----------
    const ais = n => C.aisle(C.nameKey(n));
    eq('onion veg', ais('onions'), 'veg'); eq('chicken meat', ais('chicken thighs'), 'meat'); eq('milk dairy', ais('milk'), 'dairy');
    eq('coconut milk cupboard', ais('coconut milk'), 'cupboard'); eq('chicken stock cupboard', ais('chicken stock'), 'cupboard');
    eq('pepper spice', ais('black pepper'), 'spice'); eq('red pepper veg', ais('red peppers'), 'veg'); eq('green beans veg', ais('green beans'), 'veg');
    eq('salted butter dairy', ais('salted butter'), 'dairy'); eq('toilet roll other', ais('toilet roll'), 'other'); eq('bread roll bakery', ais('bread rolls'), 'bakery');
    eq('frozen peas frozen', ais('frozen peas'), 'frozen'); eq('unknown other', ais('xylophone'), 'other');

    // ---------- showing amounts ----------
    eq('1/3 cup', A('1/3 cup sugar'), '⅓ cup');
    eq('1.5 lb', A('1.5 lb beef'), '1.5 lb');
    eq('1500 g as kg', A('1500 g flour'), '1.5 kg');
    eq('1000 ml as litres', A('1000 ml milk'), '1 litre');
    eq('half an onion buys 1', A('1/2 onion'), '½ (buy 1)');
    eq('cloves plural', A('3 cloves garlic'), '3 cloves');
    eq('1 clove singular', A('1 clove garlic'), '1 clove');
    eq('no amount', A('salt'), '');

    // ---------- dates ----------
    eq('week from Monday', C.weekStartOf('2026-10-14', 1), '2026-10-12');
    eq('week from Sunday', C.weekStartOf('2026-10-14', 0), '2026-10-11');
    eq('week from Saturday', C.weekStartOf('2026-10-14', 6), '2026-10-10');
    eq('start day itself', C.weekStartOf('2026-10-12', 1), '2026-10-12');
    eq('week over a month end', C.weekDays('2026-10-26').slice(-2), ['2026-10-31', '2026-11-01']);
    eq('week over summer time end (25 Oct 2026)', C.weekDays('2026-10-19'), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    eq('week over new year', C.rangeText('2026-12-28', '2027-01-03'), 'Mon 28 Dec 2026 to Sun 3 Jan 2027');
    eq('range text', C.rangeText('2026-10-12', '2026-10-18'), 'Mon 12 Oct to Sun 18 Oct 2026');
    eq('today just before midnight', C.todayIso(new Date(2026, 9, 14, 23, 59)), '2026-10-14');
    eq('today just after midnight', C.todayIso(new Date(2026, 9, 15, 0, 1)), '2026-10-15');
    eq('bad date', C.parseIso('2026-02-30'), null);

    // ---------- the worked example: a family of 4, Sunday guests ----------
    const st = C.sanitize({ settings: { people: 4, weekStart: 1, slots: ['dinner'] }, meals: [
        { id: 'bol', name: 'Spaghetti bolognese', makes: 4, ingredients: '500 g beef mince\n1 onion\n2 cloves garlic\n1 tin chopped tomatoes\n400 g spaghetti\nOlive oil' },
        { id: 'cur', name: 'Chicken curry', makes: 4, ingredients: '600 g chicken thighs\n2 onions\n3 cloves garlic\n1 tin coconut milk\n300 g basmati rice\n2 tbsp olive oil' },
        { id: 'oml', name: 'Omelette', makes: 1, ingredients: '3 eggs\n1 tbsp butter' },
        { id: 'emp', name: 'Pizza night', makes: 4, ingredients: '' }],
        plan: {
            '2026-10-12': [{ id: '1', slot: 'dinner', meal: 'bol', people: 4 }],
            '2026-10-13': [{ id: '2', slot: 'dinner', meal: 'cur', people: 6 }],
            '2026-10-14': [{ id: '3', slot: 'dinner', note: 'Leftovers', people: 4 }],
            '2026-10-15': [{ id: '4', slot: 'lunch', meal: 'oml', people: 2 }, { id: '5', slot: 'dinner', meal: 'bol', people: 2 }],
            '2026-10-16': [{ id: '6', slot: 'dinner', meal: 'emp', people: 4 }],
            '2026-10-19': [{ id: '7', slot: 'dinner', meal: 'cur', people: 4 }]
        } });
    let L = C.buildList(st, C.weekDays('2026-10-12'), []);
    const item = k => { const i = L.items.find(x => x.key === k); return i && i.amount; };
    eq('meals with ingredients counted', L.meals, 4);
    // onions: 1 (Mon) + 2 x 6/4 = 3 (Tue) + 1 x 2/4 = ½ (Thu) = 4½
    eq('onions added and scaled', item('onion'), '4½ (buy 5)');
    // garlic: 2 + 3 x 1.5 = 4.5 + 2 x ½ = 1 -> 7½ cloves
    eq('garlic cloves', item('garlic'), '7½ cloves (buy 8)');
    // beef: 500 + 250 = 750 g
    eq('beef', item('beef mince'), '750 g');
    eq('chicken for 6', item('chicken thigh'), '900 g');
    eq('rice for 6', item('basmati rice'), '450 g');
    eq('tins of tomatoes 1 + ½', item('tomato'), '1½ tins (buy 2)');
    eq('coconut milk 1½ tins', item('coconut milk'), '1½ tins (buy 2)');
    eq('spaghetti 400 + 200', item('spaghetti'), '600 g');
    // eggs: 3 x 2 = 6
    eq('omelette for 2 at lunch', item('egg'), '6');
    // olive oil: no amount (Mon, Thu) + 2 tbsp x 1.5 = 3 tbsp
    eq('oil with and without amount', item('olive oil'), '3 tbsp');
    eq('butter 2 tbsp', item('butter'), '2 tbsp');
    eq('next week not counted', L.items.find(x => x.key === 'chicken thigh').meals, ['Tue: Chicken curry']);
    eq('which meals need onions', L.items.find(x => x.key === 'onion').meals, ['Mon: Spaghetti bolognese', 'Tue: Chicken curry', 'Thu: Spaghetti bolognese']);
    eq('plural name preferred', L.items.find(x => x.key === 'onion').name, 'Onions');
    eq('aisle order: veg first', L.items[0].aisle, 'veg');
    // only from Thursday on
    L = C.buildList(st, C.weekDays('2026-10-12').slice(3), []);
    eq('from Thursday: onions ½', item('onion'), '½ (buy 1)');
    eq('from Thursday: 2 meals', L.meals, 2);
    L = C.buildList(C.sanitize({ meals: [{ id: 'a', name: 'A', makes: 1, ingredients: '1 onion\n1 lemon\n1 potato\n1 cherry\n1 egg' }], plan: { '2026-10-12': [{ id: '1', slot: 'dinner', meal: 'a', people: 2 }] } }), ['2026-10-12'], []);
    eq('names made plural when buying more than one', L.items.map(i => i.name).sort(), ['Cherries', 'Eggs', 'Lemons', 'Onions', 'Potatoes']);
    L = C.buildList(C.sanitize({ meals: [{ id: 'a', name: 'A', makes: 1, ingredients: '1 onion' }], plan: { '2026-10-12': [{ id: '1', slot: 'dinner', meal: 'a', people: 1 }] } }), ['2026-10-12'], []);
    eq('one stays singular', L.items[0].name, 'Onion');
    // extras merge with meals
    L = C.buildList(st, C.weekDays('2026-10-12'), [{ id: 'x1', text: 'Toilet roll' }, { id: 'x2', text: '2 onions' }, { id: 'x3', text: '1 litre milk' }]);
    eq('extra onions add on', item('onion'), '6½ (buy 7)');
    eq('extra marked', L.items.find(x => x.key === 'onion').extra, true);
    eq('extra on its own, no amount', item('toilet roll'), '');
    eq('extra milk in litres', item('milk'), '1 litre');
    // units that cannot be added exactly stay side by side
    const st2 = C.sanitize({ meals: [{ id: 'a', name: 'A', makes: 1, ingredients: '1 cup milk\n300 ml milk\n1 lb beef\n500 g beef\n1 tsp salt\n1 tbsp salt\n1 tin tomatoes\n400 g tomatoes' }], plan: { '2026-10-12': [{ id: '1', slot: 'dinner', meal: 'a', people: 1 }] } });
    L = C.buildList(st2, ['2026-10-12'], []);
    eq('cups and ml side by side', item('milk'), '300 ml + 1 cup');
    eq('pounds and grams added as about', item('beef'), 'about 954 g');
    eq('tsp and tbsp added exactly', item('salt'), '1⅓ tbsp');
    eq('tin and grams side by side', item('tomato'), '400 g + 1 tin');
    // nothing planned
    eq('empty week', C.buildList(st, C.weekDays('2026-11-02'), []).items, []);
    // a meal whose ingredients are deleted later still shows on the plan but adds nothing
    eq('meal with no ingredients adds nothing', C.buildList(st, ['2026-10-16'], []).meals, 0);

    // ---------- text for copy and email ----------
    L = C.buildList(st, C.weekDays('2026-10-12'), []);
    const txt = C.listText(L, ['olive oil', 'egg'], 'Shopping list');
    eq('text has aisle headings', /FRUIT AND VEG\n- Garlic: 7½ cloves \(buy 8\)\n- Onions: 4½ \(buy 5\)/.test(txt), true);
    eq('ticked left out', /Olive oil|Eggs/.test(txt), false);
    eq('ticked count', /\(2 already ticked off\)/.test(txt), true);
    eq('all ticked', /Nothing left to buy/.test(C.listText(L, L.items.map(i => i.key), 'T')), true);
    const plan = C.planText(st, C.weekDays('2026-10-12'));
    eq('plan text', plan.split('\n')[1], 'Tue 13 Oct - Chicken curry (for 6)');
    eq('plan text two meal times', plan.split('\n')[3], 'Thu 15 Oct - Lunch: Omelette (for 2); Dinner: Spaghetti bolognese (for 2)');

    // ---------- saved data and backups ----------
    let threw = false; try { C.sanitize('nonsense'); } catch (e) { threw = true; } eq('string refused', threw, true);
    threw = false; try { C.sanitize({ meals: 'x', plan: {} }); } catch (e) { threw = true; } eq('wrong shape refused', threw, true);
    threw = false; try { C.sanitize(null); } catch (e) { threw = true; } eq('null refused', threw, true);
    const bad = C.sanitize({ settings: { people: 999, weekStart: 9, slots: ['brunch'] }, meals: [{ id: 'a', name: '  ', makes: 4 }, { id: 'b', name: 'Soup', makes: -2, ingredients: 5 }, { id: 'c', name: 'soup', makes: 2 }, 7, null],
        plan: { 'not-a-date': [{ slot: 'dinner', note: 'x' }], '2026-10-12': [{ slot: 'dinner', meal: 'zzz' }, { slot: 'tea', note: 'x' }, { slot: 'dinner', meal: 'b', people: 0 }, { slot: 'lunch', note: '<b>hi</b>' }], '2026-10-13': [] },
        ticks: { '2026-10-12': ['onion', 5], 'bad': ['x'] }, extras: { '2026-10-12': [{ text: '' }, { text: 'Milk' }, 'x'] } });
    eq('people out of range -> 4', bad.settings.people, 4);
    eq('week start out of range -> Monday', bad.settings.weekStart, 1);
    eq('unknown slots -> dinner', bad.settings.slots, ['dinner']);
    eq('blank name and duplicate dropped', bad.meals.map(m => m.name), ['Soup']);
    eq('bad makes -> 4, bad ingredients -> empty', [bad.meals[0].makes, bad.meals[0].ingredients], [4, '']);
    eq('plan cleaned', bad.plan['2026-10-12'].map(e => e.meal || e.note), ['b', '<b>hi</b>']);
    eq('bad people -> household size', bad.plan['2026-10-12'][0].people, 4);
    eq('empty days and bad dates dropped', Object.keys(bad.plan), ['2026-10-12']);
    eq('ticks cleaned', bad.ticks, { '2026-10-12': ['onion'] });
    eq('extras cleaned', bad.extras['2026-10-12'].map(x => x.text), ['Milk']);
    eq('round trip keeps everything', JSON.stringify(C.sanitize(JSON.parse(JSON.stringify(st)))), JSON.stringify(st));

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') { document.getElementById('out').textContent = out.join('\n') + '\n\n' + summary; }
    else { console.log(out.filter(l => l.startsWith('FAIL')).join('\n')); console.log(summary); if (fail) process.exitCode = 1; }
})();
