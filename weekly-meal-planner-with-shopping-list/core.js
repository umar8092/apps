// Meal plan and shopping list maths, no page code.
// Amounts are kept as exact fractions [numerator, denominator] while scaling and adding up,
// so ¾ onion for 3 people from a recipe for 4 is exactly 9/16; rounding happens only when an amount is shown.
(function (root) {
    const SLUG = 'weekly-meal-planner-with-shopping-list';
    const LIMITS = { meals: 300, lines: 60, lineLen: 120, name: 60, people: 50, extras: 100, entries: 8, note: 60 };
    const SLOTS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snacks', 'Snacks']];
    const SLOT_KEYS = SLOTS.map(s => s[0]);
    const NOTES = ['Leftovers', 'Eating out'];

    // ---- exact fractions
    const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
    const R = (n, d = 1) => { const g = gcd(n, d); return d < 0 ? [-n / g, -d / g] : [n / g, d / g]; };
    const mul = (a, b) => R(a[0] * b[0], a[1] * b[1]);
    const add = (a, b) => R(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
    const num = a => a[0] / a[1];

    // ---- units. fam: wtm (grams), wti (ounces), volm (ml), spoon (teaspoons), count (its own unit), stop (no amount)
    const UNITS = {};
    const unit = (key, fam, size, words, one, many) => words.forEach(w => { UNITS[w] = { key, fam, size: R(size[0], size[1] || 1), one: one || key, many: many || key }; });
    unit('g', 'wtm', [1], ['g', 'gr', 'gram', 'grams', 'gramme', 'grammes', 'gm', 'gms']);
    unit('kg', 'wtm', [1000], ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms']);
    unit('oz', 'wti', [1], ['oz', 'ounce', 'ounces']);
    unit('lb', 'wti', [16], ['lb', 'lbs', 'pound', 'pounds']);
    unit('ml', 'volm', [1], ['ml', 'mL', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters']);
    unit('cl', 'volm', [10], ['cl', 'centilitre', 'centilitres']);
    unit('dl', 'volm', [100], ['dl', 'decilitre', 'decilitres']);
    unit('l', 'volm', [1000], ['l', 'L', 'litre', 'litres', 'liter', 'liters', 'ltr', 'ltrs']);
    unit('tsp', 'spoon', [1], ['tsp', 'tsps', 'teaspoon', 'teaspoons']);
    unit('tbsp', 'spoon', [3], ['tbsp', 'tbsps', 'tbs', 'tbl', 'tblsp', 'Tbsp', 'Tbs', 'tablespoon', 'tablespoons']);
    unit('cup', 'spoon', [48], ['cup', 'cups'], 'cup', 'cups');
    unit('pinch', 'stop', [1], ['pinch', 'pinches', 'dash', 'dashes', 'splash', 'drizzle', 'sprinkle']);
    [['fl oz', 'fl oz', ['fl oz', 'fl. oz', 'fl.oz', 'floz', 'fluid ounce', 'fluid ounces']], ['pint', 'pints', ['pint', 'pints', 'pt']],
        ['quart', 'quarts', ['quart', 'quarts', 'qt']], ['gallon', 'gallons', ['gallon', 'gallons', 'gal']],
        ['stick', 'sticks'], ['clove', 'cloves'], ['can', 'cans'], ['tin', 'tins'], ['slice', 'slices'], ['piece', 'pieces'], ['handful', 'handfuls'],
        ['bunch', 'bunches'], ['sprig', 'sprigs'], ['sheet', 'sheets'], ['packet', 'packets'], ['pack', 'packs'], ['sachet', 'sachets'],
        ['head', 'heads'], ['stalk', 'stalks'], ['bag', 'bags'], ['jar', 'jars'], ['bottle', 'bottles'], ['box', 'boxes'], ['carton', 'cartons'],
        ['cube', 'cubes'], ['fillet', 'fillets'], ['rasher', 'rashers'], ['loaf', 'loaves'], ['dozen', 'dozen'], ['tub', 'tubs'], ['punnet', 'punnets'], ['pot', 'pots']]
        .forEach(([one, many, words]) => unit(one, 'count', [1], words || [one, many], one, many));
    const UNIT_RE = new RegExp('^(' + Object.keys(UNITS).sort((a, b) => b.length - a.length).map(w => w.replace(/[.]/g, '\\.').replace(/ /g, '\\s*')).join('|') + ')\\.?(?![A-Za-z])');

    // ---- reading numbers: 2, 1.5, 1,5, 1/2, 1 1/2, ½, 1½, one, a, half
    const UF = { '½': [1, 2], '⅓': [1, 3], '⅔': [2, 3], '¼': [1, 4], '¾': [3, 4], '⅛': [1, 8], '⅜': [3, 8], '⅝': [5, 8], '⅞': [7, 8], '⅕': [1, 5], '⅙': [1, 6] };
    const UFC = Object.keys(UF).join('');
    const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
    const dec = s => { const [w, f = ''] = s.split('.'); return R(Number(w || 0) * Math.pow(10, f.length) + Number(f || 0), Math.pow(10, f.length)); };
    function readNum(s) {
        let m;
        if ((m = s.match(new RegExp('^(\\d+)\\s*([' + UFC + '])')))) return { r: add(R(+m[1]), UF[m[2]]), len: m[0].length };
        if ((m = s.match(new RegExp('^[' + UFC + ']')))) return { r: UF[m[0]], len: 1 };
        if ((m = s.match(/^(\d+)(?:\s+|\s*-\s*)(\d+)\/(\d+)/)) && +m[3] > 0 && +m[2] < +m[3]) return { r: add(R(+m[1]), R(+m[2], +m[3])), len: m[0].length };
        if ((m = s.match(/^(\d+)\/(\d+)/)) && +m[2] > 0) return { r: R(+m[1], +m[2]), len: m[0].length };
        if ((m = s.match(/^\d{1,3}(?:,\d{3})+(?![\d,.])/))) return { r: R(+m[0].replace(/,/g, '')), len: m[0].length };
        if ((m = s.match(/^(\d*)[.,](\d{1,3})(?!\d)/)) && (m[1] || m[2])) return { r: dec((m[1] || '0') + '.' + m[2]), len: m[0].length };
        if ((m = s.match(/^\d{1,6}(?!\d)/))) return { r: R(+m[0]), len: m[0].length };
        if ((m = s.match(/^half(?:\s+an?)?(?![a-z])/i))) return { r: [1, 2], len: m[0].length, word: true };
        if ((m = s.match(/^(an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?![a-z])/i))) {
            const w = m[1].toLowerCase();
            // "a" and "an" only count when a unit follows: "a tin of tomatoes", not "a little oil"
            if ((w === 'a' || w === 'an') && !s.slice(m[0].length).trimStart().match(UNIT_RE)) return null;
            return { r: R(WORDS[w]), len: m[0].length, word: true };
        }
        return null;
    }
    // a number or a range (2-3, 2 to 3: the bigger one is what you buy)
    function readAmount(s) {
        const a = readNum(s); if (!a) return null;
        let len = a.len, r = a.r;
        const m = s.slice(len).match(/^\s*(?:-|–|—|to|or)\s*/i);
        if (m) { const b = readNum(s.slice(len + m[0].length)); if (b && !b.word && num(b.r) > num(a.r)) { r = b.r; len += m[0].length + b.len; } }
        // "2 x 400 g tins": multiply
        const x = s.slice(len).match(/^\s*[x×*]\s*/i);
        if (x) { const b = readNum(s.slice(len + x[0].length)); if (b && !b.word) { r = mul(r, b.r); len += x[0].length + b.len; } }
        return { r, len };
    }
    function readUnit(s) {
        const t = s.replace(/^\s+/, ''), sp = s.length - t.length;
        const m = t.match(UNIT_RE);
        if (!m) return { u: null, len: 0 };
        const raw = m[1].replace(/\s+/g, ' ');
        return { u: UNITS[raw] || UNITS[raw.toLowerCase()] || null, len: sp + m[0].length };
    }

    // ---- names: "2 large onions, finely chopped" -> name "onions", key "onion"
    const PREP = /^(?:a little|a few|a bit of|some|a pinch of|pinch of|a splash of|splash of|a dash of|dash of|a drizzle of|drizzle of|a handful of|large|small|medium|big|fresh|freshly|chopped|diced|sliced|minced|grated|finely|roughly|thinly|ripe|boneless|skinless|peeled|crushed|cooked|uncooked|dried|ground|whole|of|about|approx\.?|heaped|level|good|extra|tinned|canned|frozen)\s+/i;
    function cleanName(s) {
        let n = String(s).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
        n = n.split(/,|;|\s+-\s+|\s+–\s+/)[0].trim();
        n = n.replace(/\s+(?:to taste|for frying|for serving|to serve|optional|or more|if needed)\.?$/i, '').replace(/[.:]+$/, '').trim();
        let prev;
        do { prev = n; n = n.replace(PREP, ''); } while (n !== prev && n);
        return n.trim();
    }
    const KEEP_S = /(?:ss|us|is|ous)$/;
    function singular(w) {
        if (w.length <= 3 || KEEP_S.test(w)) return w;
        if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
        if (/(?:oes|ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
        if (/ves$/.test(w)) return w.slice(0, -3) + 'f';
        if (/s$/.test(w)) return w.slice(0, -1);
        return w;
    }
    function nameKey(name) {
        const words = String(name).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9à-ÿ' ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
        if (!words.length) return '';
        words[words.length - 1] = singular(words[words.length - 1]);
        return words.join(' ');
    }

    // One ingredient line. Returns null for blank lines and headings ("For the sauce:"),
    // else { name, key, qty: [n,d] | null, unit | null, fam | null }.
    function clean(line) {
        return String(line == null ? '' : line).replace(/[\u00a0\u2009\u202f\t]/g, ' ').replace(/\u2044/g, '/')
            .replace(/^\s*(?:[-*•▢☐□◻▪·‣◦○●]|\[\s?\]|\d{1,2}[.)](?=\s))\s*/, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.lineLen);
    }
    function parseLine(line) {
        let text = clean(line);
        if (!text || /:$/.test(text)) return null;
        text = text.replace(/^(?:the\s+)?(?:juice|zest|zest and juice|juice and zest)\s+of\s+(?=\S)/i, '');
        let qty = null, u = null, rest = text;
        const a = readAmount(text);
        if (a) {
            const after = text.slice(a.len).replace(/^\s*\([^)]*\)/, ''), un = readUnit(after);
            // a number glued to letters that are not a unit ("3rd") is not an amount
            if (un.u || !/^[A-Za-z]/.test(after)) { qty = a.r; u = un.u; rest = after.slice(un.len).replace(/^\s*(?:\([^)]*\))?\s*(?:of\s+)?/i, '');
                // "800 g tins chickpeas": the pack word after a weight is not part of the name
                if (un.u && un.u.fam !== 'count') rest = rest.replace(/^(?:tins?|cans?|jars?|packs?|packets?|bags?|bottles?|cartons?|tubs?)\s+(?:of\s+)?/i, ''); }
        } else {
            // the amount at the end: "Chicken 500 g", "Eggs: 6", "Milk - 2 litres", "Eggs x 6"
            const m = text.match(new RegExp('^(.*?[A-Za-z)])[\\s:,–-]*(?:[x×]\\s*)?((?:\\d|[' + UFC + '])[\\d\\s.,/' + UFC + '-]*)\\s*([A-Za-z. ]{0,14})$'));
            if (m) {
                const b = readAmount(m[2].trim()), un = readUnit(m[3]);
                if (b && b.len === m[2].trim().length && (!m[3].trim() || (un.u && un.len >= m[3].trim().length))) { qty = b.r; u = un.u; rest = m[1]; }
            }
        }
        if (u && u.fam === 'stop') { qty = null; u = null; }
        if (qty && num(qty) <= 0) { qty = null; u = null; }
        let name = cleanName(rest) || cleanName(text) || text;
        if (/^dozen$/i.test(name)) name = text;
        if (u && u.key === 'dozen') { qty = mul(qty, R(12)); u = null; }
        const key = nameKey(name);
        if (!key) return null;
        return { name: name.charAt(0).toUpperCase() + name.slice(1), key, qty, unit: u ? u.key : null, fam: u ? u.fam : (qty ? 'count' : null) };
    }
    function parseLines(text) {
        return String(text == null ? '' : text).split(/\r?\n/).slice(0, LIMITS.lines).map(parseLine).filter(Boolean);
    }

    // ---- aisles
    const AISLES = [
        ['veg', 'Fruit and veg'], ['meat', 'Meat and fish'], ['dairy', 'Dairy and eggs'], ['bakery', 'Bread and bakery'],
        ['cupboard', 'Cupboard: tins, pasta, rice'], ['spice', 'Oils, sauces and spices'], ['frozen', 'Frozen'], ['other', 'Other']
    ];
    const W = s => s.split('|');
    const AISLE_WORDS = [
        ['other', W('toilet roll|toilet paper|kitchen roll|paper towel|tissue|washing up liquid|washing powder|detergent|soap|shampoo|toothpaste|nappy|diaper|wipe|bin bag|foil|cling film|baking paper|battery|bleach|sponge|dishwasher tablet')],
        ['frozen', W('frozen|ice cream|fish finger|oven chip')],
        ['cupboard', W('stock|broth|stock cube|bouillon|coconut milk|coconut cream|peanut butter|chopped tomato|tinned tomato|tomato puree|tomato paste|passata|baked bean|tomato sauce|kidney bean|black bean|chickpea|lentil|bean|pasta|spaghetti|penne|fusilli|macaroni|lasagne|noodle|rice|couscous|quinoa|oat|flour|sugar|cereal|cornflake|granola|breadcrumb|jam|honey|tuna|sweetcorn|corn|crisp|biscuit|cracker|chocolate|cocoa|nut|almond|walnut|cashew|peanut|raisin|sultana|tea|coffee|tortilla chip|stuffing|gravy|baking powder|yeast|custard')],
        ['spice', W('oil|vinegar|sauce|ketchup|mayonnaise|mayo|mustard|salt|pepper|paprika|cumin|coriander powder|ground coriander|turmeric|chilli powder|chili powder|chilli flake|curry powder|curry paste|garam masala|masala|cinnamon|nutmeg|oregano|basil dried|dried|herb|spice|seasoning|soy|pesto|salsa|stock pot|vanilla|bay leaf|thyme dried|cardamom|clove|chutney|harissa|sriracha|worcestershire')],
        ['meat', W('chicken|beef|lamb|mutton|pork|mince|minced|steak|bacon|ham|sausage|turkey|duck|salmon|tuna steak|cod|haddock|fish|prawn|shrimp|mussel|chorizo|salami|pepperoni|keema|kebab|meatball|gammon|veal|goat|liver')],
        ['dairy', W('milk|cheese|cheddar|mozzarella|parmesan|feta|halloumi|paneer|butter|cream|yogurt|yoghurt|egg|creme fraiche|crème fraîche|ghee|custard pot|margarine')],
        ['bakery', W('bread|loaf|roll|bun|bagel|baguette|naan|pitta|pita|wrap|tortilla|croissant|brioche|chapati|roti|paratha|pastry|pizza base|crumpet|muffin')],
        ['veg', W('onion|garlic|ginger|potato|carrot|tomato|pepper|chilli|chili|lettuce|salad|spinach|cabbage|broccoli|cauliflower|courgette|zucchini|aubergine|eggplant|mushroom|pea|bean|cucumber|celery|leek|spring onion|scallion|lemon|lime|orange|apple|banana|grape|berry|strawberry|blueberry|raspberry|blackberry|avocado|mango|melon|pineapple|kiwi|pear|peach|plum|cherry|coriander|cilantro|parsley|mint|basil|dill|rosemary|thyme|herb|kale|rocket|squash|pumpkin|sweet potato|corn on the cob|beetroot|radish|okra|asparagus|fruit|veg|vegetable|turnip|parsnip|swede|shallot|date|fig')]
    ];
    function aisle(key) {
        const k = ' ' + key + ' ';
        // a fresh herb or vegetable mentioned first wins over a word inside it ("pepper" is a spice on its own, "red pepper" is veg)
        if (/ (?:red|green|yellow|bell|sweet|orange) pepper | green bean | runner bean | broad bean | corn on the cob | sweetcorn cob /.test(k)) return 'veg';
        for (const [a, words] of AISLE_WORDS) for (const w of words) if (k.includes(' ' + w + ' ')) return a;
        return 'other';
    }

    // ---- formatting amounts
    const GLYPH = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞' };
    function round(x, dp) { const p = Math.pow(10, dp); return Math.round(x * p + 1e-9) / p; }
    function numText(r) {
        const w = Math.floor(r[0] / r[1]), f = R(r[0] - w * r[1], r[1]);
        if (f[0] === 0) return String(w);
        const g = GLYPH[f[0] + '/' + f[1]];
        if (g) return (w ? w : '') + g;
        return String(round(num(r), 2));
    }
    const plain = x => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    function metricText(r, small, big) {   // grams or ml
        const v = num(r);
        if (v >= 1000) return String(round(v / 1000, 2)) + ' ' + (big === 'litres' && round(v / 1000, 2) === 1 ? 'litre' : big);
        if (v < 10) return String(round(v, 1)) + ' ' + small;
        return plain(Math.round(v)) + ' ' + small;
    }
    function ozText(r) {
        const v = num(r);
        if (v >= 16) return String(round(v / 16, 2)) + ' lb';
        return String(round(v, 1)) + ' oz';
    }
    function spoonText(r) {      // r in teaspoons
        const t = num(r);
        if (t >= 12) return numText(R(r[0], r[1] * 48)) + ' ' + (t > 48 ? 'cups' : 'cup');
        if (t >= 3) return numText(R(r[0], r[1] * 3)) + ' tbsp';
        return numText(r) + ' tsp';
    }
    function countText(r, uKey) {
        const u = uKey ? Object.values(UNITS).find(x => x.key === uKey && x.fam === 'count') : null;
        const word = u ? ' ' + (num(r) > 1 ? u.many : u.one) : '';
        let t = numText(r) + word;
        if (r[1] !== 1) t += ' (buy ' + Math.ceil(num(r) - 1e-9) + ')';
        return t;
    }

    // ---- dates as 'YYYY-MM-DD' calendar days, so time zones and summer time never move a meal
    const pad = n => String(n).padStart(2, '0');
    const iso = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    const parseIso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return iso(d) === s ? d : null; };
    const addDays = (s, n) => { const d = parseIso(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
    const dow = s => parseIso(s).getUTCDay();
    const todayIso = (now) => { const d = now || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    function weekStartOf(s, startDow) { return addDays(s, -((dow(s) - startDow + 7) % 7)); }
    function weekDays(start) { return [0, 1, 2, 3, 4, 5, 6].map(i => addDays(start, i)); }
    const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayShort = s => DAY[dow(s)].slice(0, 3);
    function dateText(s, long) { const d = parseIso(s); return (long ? DAY[d.getUTCDay()] : DAY[d.getUTCDay()].slice(0, 3)) + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; }
    function rangeText(a, b) {
        const x = parseIso(a), y = parseIso(b);
        const yr = x.getUTCFullYear() !== y.getUTCFullYear() ? ' ' + x.getUTCFullYear() : '';
        return dateText(a) + yr + ' to ' + dateText(b) + ' ' + y.getUTCFullYear();
    }

    // ---- state
    function newState() {
        return { v: 1, settings: { people: 4, weekStart: 1, slots: ['dinner'] }, meals: [], plan: {}, ticks: {}, extras: {} };
    }
    const int = (v, lo, hi, d) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : d; };
    const str = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f]/g, '').slice(0, max) : '';
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    // Anything read from storage or a backup file goes through here: wrong types are dropped, numbers kept in range.
    function sanitize(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not a meal plan');
        if (!Array.isArray(raw.meals) || !raw.plan || typeof raw.plan !== 'object') throw new Error('not a meal plan');
        const s = newState(), st = raw.settings || {};
        s.settings.people = int(st.people, 1, LIMITS.people, 4);
        s.settings.weekStart = int(st.weekStart, 0, 6, 1);
        s.settings.slots = Array.isArray(st.slots) ? SLOT_KEYS.filter(k => st.slots.includes(k)) : ['dinner'];
        if (!s.settings.slots.length) s.settings.slots = ['dinner'];
        const ids = new Set(), names = new Set();
        for (const m of raw.meals.slice(0, LIMITS.meals)) {
            if (!m || typeof m !== 'object') continue;
            const name = str(m.name, LIMITS.name).trim(), id = str(m.id, 40) || uid();
            if (!name || ids.has(id) || names.has(name.toLowerCase())) continue;
            ids.add(id); names.add(name.toLowerCase());
            s.meals.push({ id, name, makes: int(m.makes, 1, LIMITS.people, 4), ingredients: str(m.ingredients, LIMITS.lines * (LIMITS.lineLen + 1)).split(/\r?\n/).slice(0, LIMITS.lines).map(l => l.slice(0, LIMITS.lineLen)).join('\n') });
        }
        for (const [date, list] of Object.entries(raw.plan)) {
            if (!parseIso(date) || !Array.isArray(list)) continue;
            const out = [];
            for (const e of list) {
                if (!e || typeof e !== 'object' || !SLOT_KEYS.includes(e.slot)) continue;
                const entry = { id: str(e.id, 40) || uid(), slot: e.slot, people: int(e.people, 1, LIMITS.people, s.settings.people) };
                if (typeof e.meal === 'string' && ids.has(e.meal)) entry.meal = e.meal;
                else if (str(e.note, LIMITS.note).trim()) entry.note = str(e.note, LIMITS.note).trim();
                else continue;
                if (out.filter(x => x.slot === e.slot).length < LIMITS.entries) out.push(entry);
            }
            if (out.length) s.plan[date] = out;
        }
        for (const [wk, list] of Object.entries(raw.ticks || {})) {
            if (parseIso(wk) && Array.isArray(list)) s.ticks[wk] = list.filter(k => typeof k === 'string').map(k => k.slice(0, 200)).slice(0, 500);
        }
        for (const [wk, list] of Object.entries(raw.extras || {})) {
            if (!parseIso(wk) || !Array.isArray(list)) continue;
            const out = list.filter(x => x && typeof x === 'object' && str(x.text, LIMITS.lineLen).trim())
                .map(x => ({ id: str(x.id, 40) || uid(), text: str(x.text, LIMITS.lineLen).trim() })).slice(0, LIMITS.extras);
            if (out.length) s.extras[wk] = out;
        }
        return s;
    }

    // "Onion" bought as 2 reads as "Onions"
    function listName(it) {
        const ks = Object.keys(it.parts);
        if (ks.length !== 1 || ks[0] !== 'count:' || num(it.parts['count:']) <= 1 || it.name.toLowerCase() !== it.key) return it.name;
        const n = it.name;
        if (/[^aeiou]y$/i.test(n)) return n.slice(0, -1) + 'ies';
        if (/(?:o|s|x|ch|sh)$/i.test(n)) return n + 'es';
        return n + 's';
    }
    function partsText(P) {
        const parts = [];
        if (P.wtm && P.wti) parts.push('about ' + metricText(add(P.wtm, mul(P.wti, R(283495, 10000))), 'g', 'kg'));
        else { if (P.wtm) parts.push(metricText(P.wtm, 'g', 'kg')); if (P.wti) parts.push(ozText(P.wti)); }
        if (P.volm) parts.push(metricText(P.volm, 'ml', 'litres'));
        if (P.spoon) parts.push(spoonText(P.spoon));
        Object.keys(P).filter(k => k.startsWith('count:')).sort().forEach(k => parts.push(countText(P[k], k.slice(6))));
        return parts.join(' + ');
    }
    // how one ingredient line goes on the list, for the preview while typing
    function lineAmount(p) {
        if (!p || !p.qty) return '';
        return partsText(p.fam === 'count' ? { ['count:' + (p.unit || '')]: p.qty } : { [p.fam]: mul(p.qty, UNITS[p.unit].size) });
    }

    // ---- the shopping list for some days
    // Returns { items: [{ key, name, aisle, amount, meals: ['Mon: Chilli'], extra: bool }], meals: count of planned meals with ingredients, notes }
    function buildList(state, dates, extras) {
        const byId = new Map(state.meals.map(m => [m.id, m]));
        const items = new Map();
        let mealCount = 0;
        const take = (p, factor, label) => {
            let it = items.get(p.key);
            if (!it) { it = { key: p.key, name: p.name, aisle: /^(?:tin|can|jar)$/.test(p.unit || '') ? 'cupboard' : aisle(p.key), parts: {}, plain: false, meals: [], extra: false }; items.set(p.key, it); }
            if (label && !it.meals.includes(label)) it.meals.push(label);
            if (p.name.toLowerCase() !== p.key && it.name.toLowerCase() === p.key) it.name = p.name;   // "Onions" reads better than "Onion" on a list
            if (!p.qty) { it.plain = true; return; }
            const q = mul(p.qty, factor);
            let k, v;
            if (p.fam === 'count') { k = 'count:' + (p.unit || ''); v = q; }
            else { const u = UNITS[p.unit]; k = p.fam; v = mul(q, u.size); }
            it.parts[k] = it.parts[k] ? add(it.parts[k], v) : v;
        };
        for (const date of dates) {
            for (const e of state.plan[date] || []) {
                const m = e.meal && byId.get(e.meal);
                if (!m) continue;
                const lines = parseLines(m.ingredients);
                if (!lines.length) continue;
                mealCount++;
                const factor = R(e.people, m.makes);
                const label = dayShort(date) + ': ' + m.name;
                lines.forEach(p => take(p, factor, label));
            }
        }
        for (const x of extras || []) {
            const p = parseLine(x.text); if (!p) continue;
            take(p, [1, 1], '');
            items.get(p.key).extra = true;
            (items.get(p.key).extraIds = items.get(p.key).extraIds || []).push(x.id);
        }
        const order = AISLES.map(a => a[0]);
        const out = [...items.values()].map(it => ({ key: it.key, name: listName(it), aisle: it.aisle, amount: partsText(it.parts), meals: it.meals, extra: it.extra, extraIds: it.extraIds || [] }));
        out.sort((a, b) => order.indexOf(a.aisle) - order.indexOf(b.aisle) || a.name.localeCompare(b.name));
        return { items: out, meals: mealCount };
    }

    // ---- text for copy, email and print
    function slotName(k) { const s = SLOTS.find(x => x[0] === k); return s ? s[1] : k; }
    function entryText(state, e) {
        const m = e.meal && state.meals.find(x => x.id === e.meal);
        return m ? m.name + (e.people !== state.settings.people ? ' (for ' + e.people + ')' : '') : e.note;
    }
    function planText(state, dates) {
        const lines = [];
        for (const d of dates) {
            const list = state.plan[d] || [];
            if (!list.length) continue;
            const used = SLOT_KEYS.filter(k => list.some(e => e.slot === k));
            const bits = used.map(k => {
                const names = list.filter(e => e.slot === k).map(e => entryText(state, e)).join(', ');
                return (used.length > 1 || k !== 'dinner' ? slotName(k) + ': ' : '') + names;
            });
            lines.push(dateText(d) + ' - ' + bits.join('; '));
        }
        return lines.join('\n');
    }
    function listText(list, ticked, title) {
        const t = new Set(ticked || []);
        const left = list.items.filter(i => !t.has(i.key));
        const out = [title];
        let last = '';
        for (const i of left) {
            if (i.aisle !== last) { out.push(''); out.push((AISLES.find(a => a[0] === i.aisle) || [0, 'Other'])[1].toUpperCase()); last = i.aisle; }
            out.push('- ' + i.name + (i.amount ? ': ' + i.amount : ''));
        }
        if (!left.length) out.push('', 'Nothing left to buy.');
        const got = list.items.length - left.length;
        if (got) out.push('', '(' + got + ' already ticked off)');
        return out.join('\n');
    }

    const api = { SLUG, LIMITS, SLOTS, SLOT_KEYS, NOTES, AISLES, R, num, parseLine, parseLines, nameKey, singular, aisle, numText, spoonText, metricText, countText,
        iso, parseIso, addDays, dow, todayIso, weekStartOf, weekDays, dateText, dayShort, rangeText, DAY, newState, sanitize, uid, buildList,
        planText, listText, slotName, entryText, lineAmount };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MealCore = api;
})(typeof self !== 'undefined' ? self : this);
