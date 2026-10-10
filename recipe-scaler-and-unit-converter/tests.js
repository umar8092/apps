// Checks on the maths. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const one = (line, f = [1, 1], mode = 'same', sys = 'us') => C.scaleRecipe(line, C.R(f[0], f[1]), mode, sys)[0];
        const out = (line, f, mode, sys) => one(line, f, mode, sys).out;
        const N = s => { const n = C.readNum(s); return n ? C.num(n.r) : null; };

        // reading numbers
        check('1 1/2, 1-1/2, 1½, 1 ½, 1.5 and 1,5 are all 1.5', [N('1 1/2'), N('1-1/2'), N('1½'), N('1 ½'), N('1.5'), N('1,5')].every(v => v === 1.5));
        check('½ = 0.5, ¾ = 0.75, .5 = 0.5, 1/3 = 1/3', N('½') === 0.5 && N('¾') === 0.75 && N('.5') === 0.5 && Math.abs(N('1/3') - 1 / 3) < 1e-12);
        check('1,000 is a thousand, 1,5 is one and a half', N('1,000') === 1000 && N('1,5') === 1.5);
        check('words: one = 1, twelve = 12, half a = 0.5, a dozen = 12', N('one') === 1 && N('twelve') === 12 && N('half a') === 0.5 && N('a dozen') === 12);
        check('range 2-3 and 2 to 3', (a => C.num(a.a) === 2 && C.num(a.b) === 3)(C.readAmount('2-3')) && C.num(C.readAmount('2 to 3 cloves').b) === 3);
        check('exact fractions: 3/4 x 7/4 = 21/16', (m => m[0] === 21 && m[1] === 16)(C.mul([3, 4], [7, 4])));

        // servings boxes
        const S = v => C.parseServings(v);
        check('servings 4, 2.5, 1/2 are fine', C.num(S('4').r) === 4 && C.num(S('2.5').r) === 2.5 && C.num(S('1/2').r) === 0.5);
        check('servings blank, 0, negative, words, huge are refused', S('').blank && S('0').err === 'zero' && S('-2').err === 'negative' && S('four').r && S('abc').err === 'nan' && S('10001').err === 'big' && S('10000').r);
        check('servings "4 people" is refused (only a number)', S('4 people').err === 'nan');

        // the README situation: pancakes for 4 made for 7 (x7/4)
        const P = [7, 4];
        check('1 1/2 cups flour x1.75 = 2⅔ cups (2.625, within 3%)', out('1 1/2 cups all-purpose flour', P) === '2⅔ cups all-purpose flour');
        check('3 1/2 tsp baking powder x1.75 = 2 tbsp (6.125 tsp)', out('3 1/2 tsp baking powder', P) === '2 tbsp baking powder');
        check('1 tbsp sugar x1.75 = 1 tbsp + 2¼ tsp (exactly 1¾ tbsp)', out('1 tbsp sugar', P) === '1 tbsp + 2¼ tsp sugar');
        check('1/4 tsp salt x1.75 = ½ tsp (0.4375)', out('1/4 tsp salt', P) === '½ tsp salt');
        check('1 1/4 cups milk x1.75 = 2¼ cups (2.1875)', out('1 1/4 cups milk', P) === '2¼ cups milk');
        check('3 tbsp butter x1.75 = ⅓ cup (5¼ tbsp)', out('3 tbsp butter, melted', P) === '⅓ cup butter, melted');
        const egg = one('1 egg', P);
        check('1 egg x1.75 = 1¾ eggs, use 1 egg plus 2 tbsp of another', egg.out === '1¾ eggs' && egg.hint === 'Use 1 egg, plus 2 tbsp of another beaten egg.');
        check('3/4 cup x1.75 = 1⅓ cups', out('3/4 cup sugar', P) === '1⅓ cups sugar');
        check('1/2 cup honey x1.75 = ¾ cup + 2 tbsp (exactly ⅞ cup)', out('1/2 cup honey', P) === '¾ cup + 2 tbsp honey');
        check('2 tsp x1.75 = 1 tbsp + ½ tsp', out('2 tsp vanilla', P) === '1 tbsp + ½ tsp vanilla');
        check('250 g butter x1.75 = 438 g (437.5 rounds half up)', out('250 g butter', P) === '438 g butter');
        check('2-3 cloves garlic x1.75 = 3½–5¼ cloves', out('2-3 cloves garlic', P) === '3½–5¼ cloves garlic');
        check('2 or 3 tomatoes x2 = 4–6 tomatoes', out('2 or 3 tomatoes', [2, 1]) === '4–6 tomatoes');
        check('1 cup + 2 tbsp milk x2 = 2¼ cups', out('1 cup + 2 tbsp milk', [2, 1]) === '2¼ cups milk');
        check('1 lb 4 oz beef x1.75 = 2 lb 3 oz', out('1 lb 4 oz beef', P) === '2 lb 3 oz beef');
        check('1 lb 4 oz beef in grams = 990 g (992.2 to the nearest 5)', out('1 lb 4 oz beef', P, 'metric') === '990 g beef');

        // halving and small amounts
        check('1 egg halved = ½ egg, beat 1 egg and use 1½ tbsp', (e => e.out === '½ egg' && e.hint === 'Beat 1 egg and use 1½ tbsp of it.')(one('1 egg', [1, 2])));
        check('2 eggs halved = 1 egg, no hint', (e => e.out === '1 egg' && !e.hint)(one('2 eggs', [1, 2])));
        check('3 eggs x2 = 6 eggs, no hint', (e => e.out === '6 eggs' && !e.hint)(one('3 eggs', [2, 1])));
        check('1/8 tsp halved is a pinch', out('1/8 tsp cayenne', [1, 2]) === 'a pinch of cayenne');
        check('1 tsp x1/100 is a pinch', out('1 tsp salt', [1, 100]) === 'a pinch of salt');
        check('3 cups flour x1/3 = 1 cup', out('3 cups flour', [1, 3]) === '1 cup flour');
        check('6 tbsp butter = ¼ cup + 2 tbsp', out('6 tbsp butter', [1, 1]) === '¼ cup + 2 tbsp butter');
        check('1 quart halved = ½ quart', out('1 quart milk', [1, 2]) === '½ quart milk');
        check('12 oz pasta doubled = 1 lb 8 oz', out('12 oz pasta', [2, 1]) === '1 lb 8 oz pasta');
        check('3/4 lb beef = 12 oz', out('3/4 lb ground beef', [1, 1]) === '12 oz ground beef');
        check('1 kg halved = 500 g, 1.5 l x1.75 = 2.63 L', out('1 kg potatoes', [1, 2]) === '500 g potatoes' && out('1,5 l water', P) === '2.63 L water');

        // grams and ml
        check('1 cup flour = ≈ 120 g', out('1 cup flour', [1, 1], 'metric') === '≈ 120 g flour');
        check('1 cup sugar = ≈ 200 g, ¼ cup = ≈ 50 g', out('1 cup sugar', [1, 1], 'metric') === '≈ 200 g sugar' && out('¼ cup sugar', [1, 1], 'metric') === '≈ 50 g sugar');
        check('1 cup milk = 235 ml (liquids stay ml)', out('1 cup milk', [1, 1], 'metric') === '235 ml milk');
        check('baking powder stays in spoons in grams mode', out('3 1/2 tsp baking powder', P, 'metric') === '2 tbsp baking powder');
        check('2 sticks butter = 225 g', out('2 sticks butter', [1, 1], 'metric') === '225 g butter');
        check('Australian 1 tbsp = 20 ml = 1 tbsp + 1 tsp metric', out('1 tbsp butter', [1, 1], 'metric', 'au') === '1 tbsp + 1 tsp butter');
        check('2 Australian cups water = 500 ml', out('2 cups water', [1, 1], 'metric', 'au') === '500 ml water');
        check('unknown solid in cups stays ml (always right)', out('1 cup chopped onion', [1, 1], 'metric') === '235 ml chopped onion');
        check('egg hint in grams: 1¾ eggs, plus 38 g', one('1 egg', P, 'metric').hint === 'Use 1 egg, plus 38 g of another beaten egg.');

        // cups and spoons
        check('250 ml milk = 1 cup + 1 tbsp', out('250 ml milk', [1, 1], 'us') === '1 cup + 1 tbsp milk');
        check('500 ml stock = 2 cups + 2 tbsp', out('500 ml stock', [1, 1], 'us') === '2 cups + 2 tbsp stock');
        check('200 g sugar = ≈ 1 cup', out('200 g sugar', [1, 1], 'us') === '≈ 1 cup sugar');
        check('200 g chicken (unknown) = 7 oz', out('200 g chicken', [1, 1], 'us') === '7 oz chicken');
        check('trailing amount: Butter 100g in cups = Butter ≈ ⅓ cup + 1½ tbsp (101 ml of 104, fewest scoops)', out('Butter 100g', [1, 1], 'us') === 'Butter ≈ ⅓ cup + 1½ tbsp');

        // lines that are not scaled
        check('a pinch of salt is kept', one('a pinch of salt', P).kind === 'note' && out('a pinch of salt', P) === 'a pinch of salt');
        check('salt and pepper to taste is kept', one('Salt and pepper to taste', P).kind === 'note');
        check('heading "For the sauce:"', one('For the sauce:').kind === 'heading');
        check('numbered step is not scaled', one('1. Preheat oven to 180C', P).kind === 'note');
        check('20 minutes, 9-inch, 20 cm are not amounts', one('Bake for 20 minutes', P).kind === 'note' && one('20 cm cake tin', P).kind === 'note');
        check('1 9-inch pie crust doubled = 2 9-inch pie crust', out('1 9-inch pie crust', [2, 1]) === '2 9-inch pie crust');
        check('200g 70% dark chocolate x1.75 = 350 g, the 70% untouched', out('200g 70% dark chocolate', P) === '350 g 70% dark chocolate');
        check('Juice of 1 lemon doubled = Juice of 2 lemons', out('Juice of 1 lemon', [2, 1]) === 'Juice of 2 lemons');
        check('1 (14 oz) can tomatoes x2 keeps the can size', out('1 (14 oz) can tomatoes', [2, 1]) === '2 (14 oz) can tomatoes');
        check('1 cup (2 sticks) butter: the same amount in brackets is dropped', out('1 cup (2 sticks) butter', [2, 1]) === '2 cups butter');
        check('bullets and tick boxes from websites are removed', out('▢ 2 cups flour') === '2 cups flour' && out('• 1 egg') === '1 egg' && out('- 3 tbsp oil') === '3 tbsp oil');
        check('2 c flour and 1 T sugar (short units)', out('2 c flour', [1, 2]) === '1 cup flour' && out('1 T sugar', [2, 1]) === '2 tbsp sugar');
        check('a cup of sugar doubled = 2 cups of sugar', out('a cup of sugar', [2, 1]) === '2 cups of sugar');
        check('blank lines are skipped, 300 lines max', C.parseRecipe('\n\n1 egg\n\n').length === 1 && C.parseRecipe(Array(400).fill('1 egg').join('\n')).length === 300);
        check('very long text line kept whole', out('x'.repeat(500)) === 'x'.repeat(500));

        // oven temperatures
        const T = s => C.temps(s).text;
        check('350°F -> 180°C, 160°C fan, gas 4', T('Bake at 350°F') === 'Bake at 350°F (180°C, 160°C fan, gas 4)');
        check('375°F -> 190°C, gas 5', T('375°F') === '375°F (190°C, 170°C fan, gas 5)');
        check('180C -> 350°F, gas 4', T('oven to 180C') === 'oven to 180C (350°F, gas 4)');
        check('200 °C -> 400°F, gas 6', T('200 °C') === '200 °C (400°F, gas 6)');
        check('180°C fan = 200°C normal -> 400°F', T('180°C fan') === '180°C fan (400°F in a normal oven, gas 6)');
        check('gas mark 4 -> 350°F, 180°C', T('gas mark 4') === 'gas mark 4 (350°F, 180°C)');
        check('already converted: 350°F / 180°C is left alone', T('350°F / 180°C') === '350°F / 180°C');
        check('2 C flour is not a temperature', !C.temps('2 C flour').changed);
        check('method lines: blank lines dropped, temps added', (m => m.length === 2 && m[1] === 'Bake at 425°F (220°C, 200°C fan, gas 7).')(C.methodLines('Mix.\n\nBake at 425°F.')));

        // scale to what I have
        const lines = C.parseRecipe('3 eggs\n2-3 cloves garlic\n1 cup + 2 tbsp milk\nSalt to taste\n200 g flour');
        check('"I have" lists single amounts only (no ranges, two-part or no amount)', C.haveChoices(lines).map(h => h.p.text).join('|') === '3 eggs|200 g flour');
        const h = C.parseHave('2');
        check('have 2 of 3 eggs: x2/3', C.factorText(C.div(h.r, lines[0].a)) === '×0.67');
        check('have 0, -1, words refused; blank is fine', C.parseHave('0').err === 'zero' && C.parseHave('-1').err === 'negative' && C.parseHave('lots').err === 'nan' && C.parseHave('').blank);

        // saved data
        check('corrupt draft starts fresh', (d => d.ingredients === '' && d.mode === 'same' && d.sys === 'us')(C.cleanDraft('nonsense')));
        check('draft keeps valid values and drops bad ones', (d => d.mode === 'metric' && d.sys === 'us' && d.from === '4')(C.cleanDraft({ mode: 'metric', sys: 'mars', from: '4', ingredients: 5 })));
        check('saved list drops broken rows', C.cleanSaved([null, 5, { name: 'A', ingredients: '1 egg' }, { name: '', ingredients: 'x' }, { name: 'B' }]).length === 1 && C.cleanSaved('x').length === 0);

        // plain text for copy and email
        const txt = C.recipeText({ title: 'Pancakes for 7', subtitle: 'Scaled ×1.75', lines: C.scaleRecipe('For the batter:\n1 egg\nSalt', C.R(7, 4), 'same', 'us'), method: ['Mix.'] });
        check('copy text has title, heading, amounts, egg hint and method', txt === 'Pancakes for 7\nScaled ×1.75\n\nIngredients:\n\nFor the batter:\n- 1¾ eggs (Use 1 egg, plus 2 tbsp of another beaten egg.)\n- Salt\n\nMethod:\n1. Mix.');
        return r;
    }
    if (typeof module === 'object' && module.exports) {
        const r = runTests(require('./core.js'));
        r.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
        const bad = r.filter(t => !t.ok).length;
        console.log('\n' + (r.length - bad) + ' of ' + r.length + ' checks passed');
        if (bad) process.exitCode = 1;
    } else root.runTests = runTests;
})(typeof self !== 'undefined' ? self : this);
