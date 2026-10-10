// Recipe maths, no page code. Amounts are kept as exact fractions (numerator / denominator) while scaling,
// so 3/4 cup x 7/4 is exactly 21/16 cup; rounding to friendly kitchen measures happens only when it is shown.
(function (root) {
    const MAX_SERVINGS = 10000;
    const MAX_LINES = 300;

    // ---- exact fractions [n, d]
    const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
    const R = (n, d = 1) => { const g = gcd(n, d); return d < 0 ? [-n / g, -d / g] : [n / g, d / g]; };
    const mul = (a, b) => R(a[0] * b[0], a[1] * b[1]);
    const div = (a, b) => R(a[0] * b[1], a[1] * b[0]);
    const add = (a, b) => R(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
    const num = a => a[0] / a[1];

    // ---- cup and spoon sizes in ml
    const SYSTEMS = {
        us: { name: 'US', cup: 236.588, tbsp: 14.787, tsp: 4.929, floz: 29.574, pint: 473.176, quart: 946.353, gallon: 3785.41 },
        metric: { name: 'UK, Canada and metric', cup: 250, tbsp: 15, tsp: 5, floz: 28.413, pint: 568.261, quart: 1136.52, gallon: 4546.09 },
        au: { name: 'Australia', cup: 250, tbsp: 20, tsp: 5, floz: 28.413, pint: 568.261, quart: 1136.52, gallon: 4546.09 }
    };
    const STD = { cup: 250, tbsp: 15, tsp: 5 };     // metric spoons used when showing grams and ml

    // ---- units people type. fam: vol (ml), wt (grams), count (scaled as a number), stop (not scaled)
    const UNITS = {};
    const unit = (key, fam, words, extra) => words.forEach(w => { UNITS[w] = Object.assign({ key, fam }, extra || {}); });
    unit('cup', 'vol', ['cup', 'cups', 'c', 'C']);
    unit('tbsp', 'vol', ['tablespoon', 'tablespoons', 'tbsp', 'tbsps', 'tbs', 'tbl', 'tbls', 'tblsp', 'T', 'Tb', 'Tbsp', 'Tbs']);
    unit('tsp', 'vol', ['teaspoon', 'teaspoons', 'tsp', 'tsps', 't', 'ts']);
    unit('ml', 'vol', ['ml', 'mL', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters'], { ml: 1 });
    unit('cl', 'vol', ['cl', 'centilitre', 'centilitres', 'centiliter', 'centiliters'], { ml: 10 });
    unit('dl', 'vol', ['dl', 'decilitre', 'decilitres', 'deciliter', 'deciliters'], { ml: 100 });
    unit('l', 'vol', ['l', 'L', 'litre', 'litres', 'liter', 'liters', 'ltr', 'ltrs'], { ml: 1000 });
    unit('floz', 'vol', ['fl oz', 'fl. oz', 'fl.oz', 'floz', 'fluid ounce', 'fluid ounces']);
    unit('pint', 'vol', ['pint', 'pints', 'pt', 'pts']);
    unit('quart', 'vol', ['quart', 'quarts', 'qt', 'qts']);
    unit('gallon', 'vol', ['gallon', 'gallons', 'gal']);
    unit('g', 'wt', ['g', 'gr', 'grs', 'gram', 'grams', 'gramme', 'grammes', 'gm', 'gms'], { g: 1 });
    unit('kg', 'wt', ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes'], { g: 1000 });
    unit('oz', 'wt', ['oz', 'ounce', 'ounces'], { g: 28.3495 });
    unit('lb', 'wt', ['lb', 'lbs', 'pound', 'pounds'], { g: 453.592 });
    unit('pinch', 'stop', ['pinch', 'pinches', 'dash', 'dashes', 'smidgen', 'smidgens']);
    const COUNTS = [['stick', 'sticks'], ['clove', 'cloves'], ['can', 'cans'], ['tin', 'tins'], ['slice', 'slices'], ['piece', 'pieces'], ['handful', 'handfuls'],
        ['bunch', 'bunches'], ['sprig', 'sprigs'], ['sheet', 'sheets'], ['packet', 'packets'], ['pack', 'packs'], ['sachet', 'sachets'], ['envelope', 'envelopes'],
        ['head', 'heads'], ['stalk', 'stalks'], ['leaf', 'leaves'], ['drop', 'drops'], ['bag', 'bags'], ['jar', 'jars'], ['bottle', 'bottles'], ['box', 'boxes'],
        ['cube', 'cubes'], ['scoop', 'scoops'], ['square', 'squares'], ['fillet', 'fillets'], ['rasher', 'rashers'], ['strip', 'strips'], ['pod', 'pods'], ['knob', 'knobs']];
    COUNTS.forEach(([one, many]) => unit(one, 'count', [one, many], { one, many }));
    const NOT_AMOUNT = /^(?:%|°|º|degrees?\b|deg\b|minutes?\b|mins?\b|hours?\b|hrs?\b|seconds?\b|secs?\b|inch(?:es)?\b|cm\b|mm\b|x\s*\d+\s*(?:cm|inch|in)\b|-?inch\b)/i;
    const UNIT_RE = new RegExp('^(' + Object.keys(UNITS).sort((a, b) => b.length - a.length).map(w => w.replace(/[.]/g, '\\.').replace(/ /g, '\\s*')).join('|') + ')\\.?(?![A-Za-z])');

    // ---- typical weight of 1 US cup (236.6 ml) in grams. liquid: shown in ml when converting to metric.
    const WEIGHTS = [
        ['all-purpose flour', 120], ['all purpose flour', 120], ['plain flour', 120], ['bread flour', 120], ['strong flour', 120], ['cake flour', 120],
        ['self-raising flour', 120], ['self raising flour', 120], ['self-rising flour', 120], ['self rising flour', 120], ['pastry flour', 120],
        ['whole wheat flour', 113], ['wholemeal flour', 113], ['almond flour', 96], ['ground almonds', 96], ['almond meal', 96], ['rye flour', 106],
        ['rice flour', 142], ['cornstarch', 112], ['corn starch', 112], ['cornflour', 112], ['cornmeal', 138], ['semolina', 163], ['flour', 120],
        ['granulated sugar', 198], ['white sugar', 198], ['caster sugar', 198], ['castor sugar', 198], ['superfine sugar', 198],
        ['brown sugar', 213], ['light brown sugar', 213], ['dark brown sugar', 213], ['muscovado sugar', 213], ['muscovado', 213],
        ['powdered sugar', 113], ['icing sugar', 113], ['confectioners sugar', 113], ["confectioners' sugar", 113], ['sugar', 198],
        ['peanut butter', 270], ['butter', 227], ['margarine', 227], ['shortening', 184],
        ['honey', 336], ['maple syrup', 312], ['golden syrup', 336], ['corn syrup', 312], ['molasses', 337], ['treacle', 336],
        ['greek yogurt', 227], ['greek yoghurt', 227], ['yogurt', 227], ['yoghurt', 227], ['sour cream', 227], ['cream cheese', 227], ['ricotta', 246],
        ['rolled oats', 89], ['porridge oats', 89], ['oats', 89], ['white rice', 190], ['basmati rice', 190], ['jasmine rice', 190], ['rice', 190], ['quinoa', 170],
        ['cocoa powder', 84], ['cocoa', 84], ['chocolate chips', 170], ['raisins', 149], ['sultanas', 149], ['chopped walnuts', 113], ['walnuts', 113],
        ['pecans', 113], ['almonds', 142], ['shredded coconut', 85], ['desiccated coconut', 85], ['grated parmesan', 100], ['parmesan', 100],
        ['shredded cheese', 113], ['grated cheese', 113], ['cheddar', 113], ['breadcrumbs', 112], ['bread crumbs', 112],
        ['table salt', 288, 2], ['fine salt', 288, 2], ['salt', 288, 2], ['baking powder', 192, 2], ['baking soda', 288, 2], ['bicarbonate of soda', 288, 2], ['bicarb', 288, 2],
        ['instant yeast', 150, 2], ['dry yeast', 150, 2], ['yeast', 150, 2],
        ['cream of tartar', 0], ['ice cream', 0], ['kosher salt', 0], ['sea salt', 0],
        ['buttermilk', 242, 1], ['coconut milk', 240, 1], ['milk', 242, 1], ['heavy cream', 232, 1], ['double cream', 232, 1], ['single cream', 232, 1],
        ['whipping cream', 232, 1], ['cream', 232, 1], ['water', 237, 1], ['olive oil', 198, 1], ['vegetable oil', 198, 1], ['sunflower oil', 198, 1],
        ['canola oil', 198, 1], ['oil', 198, 1], ['stock', 237, 1], ['broth', 237, 1], ['juice', 240, 1], ['wine', 236, 1], ['vinegar', 238, 1],
        ['soy sauce', 255, 1], ['vanilla extract', 208, 1], ['vanilla', 208, 1]
    ].sort((a, b) => b[0].length - a[0].length);
    function ingredient(text) {
        const t = ' ' + String(text).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
        for (const [name, cup, liquid] of WEIGHTS) if (t.includes(' ' + name + ' ')) return cup ? { name, gPerMl: cup / 236.588, liquid: liquid === 1, spoon: liquid === 2 } : null;
        return null;
    }
    const isEgg = rest => /\beggs?\b(?!\s*(yolks?|whites?))/i.test(rest);

    // ---- reading numbers: 2, 1.5, 1,5, 1,000, 1/2, 1 1/2, 1-1/2, ½, 1½, one, a, half a
    const UF = { '½': [1, 2], '⅓': [1, 3], '⅔': [2, 3], '¼': [1, 4], '¾': [3, 4], '⅕': [1, 5], '⅖': [2, 5], '⅗': [3, 5], '⅘': [4, 5], '⅙': [1, 6], '⅚': [5, 6],
        '⅛': [1, 8], '⅜': [3, 8], '⅝': [5, 8], '⅞': [7, 8] };
    const UFC = Object.keys(UF).join('');
    const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12 };
    const dec = s => { const [w, f = ''] = s.split('.'); return R(Number(w || 0) * Math.pow(10, f.length) + Number(f || 0), Math.pow(10, f.length)); };
    function readNum(s) {
        let m;
        if ((m = s.match(new RegExp('^(\\d+)\\s*([' + UFC + '])')))) return { r: add(R(+m[1]), UF[m[2]]), len: m[0].length };
        if ((m = s.match(new RegExp('^[' + UFC + ']')))) return { r: UF[m[0]], len: 1 };
        if ((m = s.match(/^(\d+)(?:\s+|\s*-\s*|\s+and\s+)(\d+)\/(\d+)/)) && +m[3] > 0 && +m[2] < +m[3]) return { r: add(R(+m[1]), R(+m[2], +m[3])), len: m[0].length };
        if ((m = s.match(/^(\d+)\/(\d+)/)) && +m[2] > 0) return { r: R(+m[1], +m[2]), len: m[0].length };
        if ((m = s.match(/^\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])/))) return { r: dec(m[0].replace(/,/g, '')), len: m[0].length };
        if ((m = s.match(/^(\d*)[.,](\d+)/)) && (m[1] || m[2])) return { r: dec((m[1] || '0') + '.' + m[2]), len: m[0].length };
        if ((m = s.match(/^\d+/))) return { r: R(+m[0]), len: m[0].length };
        if ((m = s.match(/^half(?:\s+an?)?(?![a-z])/i))) return { r: [1, 2], len: m[0].length, word: true };
        if ((m = s.match(/^(an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?![a-z])/i))) {
            const w = m[1].toLowerCase(), after = s.slice(m[0].length).trimStart();
            const dz = after.match(/^dozen(?![a-z])/i);
            if (dz) return { r: R((w === 'a' || w === 'an' ? 1 : WORDS[w]) * 12), len: s.length - after.length + dz[0].length, word: true };
            if (w === 'a' || w === 'an') { const u = after.match(UNIT_RE); if (!u) return null; return { r: [1, 1], len: m[0].length, word: true }; }
            return { r: R(WORDS[w]), len: m[0].length, word: true };
        }
        return null;
    }
    // a number, or a range like 2-3 / 2 to 3
    function readAmount(s) {
        const a = readNum(s); if (!a) return null;
        let len = a.len, b = null;
        const m = s.slice(len).match(/^\s*(?:-|–|—|to|or)\s*/i);
        if (m) { const n = readNum(s.slice(len + m[0].length)); if (n && !n.word && num(n.r) > num(a.r)) { b = n.r; len += m[0].length + n.len; } }
        return { a: a.r, b, len, word: a.word };
    }
    // How many servings: a single number above 0 and up to 10,000. Returns { r } or { err } or { blank }.
    function parseServings(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s) return { blank: true };
        if (/^-/.test(s)) return { err: 'negative' };
        const n = readNum(s);
        if (!n || n.len !== s.length) return { err: 'nan' };
        if (num(n.r) <= 0) return { err: 'zero' };
        if (num(n.r) > MAX_SERVINGS) return { err: 'big' };
        return { r: n.r };
    }
    // An amount someone has, for "scale to what I have": like servings but it may be up to 1,000,000.
    function parseHave(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s) return { blank: true };
        if (/^-/.test(s)) return { err: 'negative' };
        const n = readNum(s);
        if (!n || n.len !== s.length) return { err: 'nan' };
        if (num(n.r) <= 0) return { err: 'zero' };
        if (num(n.r) > 1e6) return { err: 'big' };
        return { r: n.r };
    }

    // ---- reading one ingredient line
    function clean(line) {
        return String(line).replace(/[\u00a0\u2009\u202f\t]/g, ' ').replace(/\u2044/g, '/').replace(/^\s*(?:[-*•▢☐□◻▪·‣◦○●]|\[\s?\])\s*/, '').replace(/\s+/g, ' ').trim();
    }
    // after a number: a unit, or nothing. Returns { u, raw, len } or null when the number is not an amount (350°F, 20 minutes, 9-inch).
    function readUnit(s) {
        const t = s.replace(/^\s+/, ''), sp = s.length - t.length;
        if (NOT_AMOUNT.test(t)) return null;
        const m = t.match(UNIT_RE);
        if (m) {
            const raw = m[1].replace(/\s+/g, ' ');
            // single letters need a space or the end after them ("2 c flour", "2 T sugar"), and "2 Tbsp" etc.
            if (raw.length === 1 && t.length > 1 && !/^.\.?\s/.test(t)) return { u: null, raw: '', len: 0 };
            return { u: UNITS[raw] || UNITS[raw.toLowerCase()], raw, len: sp + m[0].length };
        }
        return { u: null, raw: '', len: 0 };
    }
    // "(1 stick)", "(113 g)" right after a unit is the same amount written another way: dropped, because it would not be scaled
    const SAME_AMOUNT = new RegExp('^\\s*\\((?:about\\s+|approx\\.?\\s+)?[\\d' + UFC + '][^)]*\\)');
    function sameAmount(rest) {
        const m = rest.match(SAME_AMOUNT); if (!m) return rest;
        const inside = m[0].replace(/^\s*\((?:about\s+|approx\.?\s+)?/i, '');
        const a = readAmount(inside); if (!a) return rest;
        const u = readUnit(inside.slice(a.len));
        return u && u.u && u.u.fam !== 'stop' ? rest.slice(m[0].length) : rest;
    }

    function parseLine(raw) {
        const text = clean(raw);
        if (!text) return { kind: 'blank', text };
        if (/^\d{1,2}[.)]\s+[A-Za-z]/.test(text) || /^(step\s*\d+|method|directions|instructions)\b/i.test(text)) return { kind: 'note', text, why: 'step' };
        if (/:$/.test(text) || /^(for the|for)\s.+:?$/i.test(text) && !/\d/.test(text)) return { kind: 'heading', text: text.replace(/:$/, '') };
        if (/gas\s*mark\s*\d/i.test(text) && !/^\s*[\d½⅓⅔¼¾⅛]/.test(text)) return { kind: 'note', text, why: 'temp' };
        // amount at the start
        const lead = tryAt(text, 0);
        if (lead) return lead;
        // "Juice of 1 lemon", "Zest of 2 oranges"
        const of = text.match(/^([A-Za-z][A-Za-z ,]{1,30}?\bof)\s+/i);
        if (of) { const t = tryAt(text.slice(of[0].length), 0); if (t && t.kind === 'amount') { t.pre = of[1]; t.mid = true; t.text = text; return t; } }
        // or at the end: "Butter 100 g", "Eggs: 2"
        const m = text.match(new RegExp('^(.*?[A-Za-z)][^\\d' + UFC + ']*?)[\\s:,-]+((?:\\d|[' + UFC + '])[^A-Za-z]*(?:[A-Za-z. ]{0,14})?)$'));
        if (m) {
            const t = tryAt(m[2], 0);
            if (t && t.kind === 'amount' && !t.rest.trim()) { t.pre = m[1].replace(/[\s:,-]+$/, ''); t.rest = ''; t.restRaw = ''; t.text = text; return t; }
        }
        if (/\bpinch\b|\bdash\b/i.test(text)) return { kind: 'note', text, why: 'pinch' };
        return { kind: 'note', text, why: 'none' };
    }
    function tryAt(text, from) {
        const s = text.slice(from);
        const a = readAmount(s); if (!a) return null;
        let after = s.slice(a.len);
        const u = readUnit(after);
        if (!u) return null;    // 350°F, 20 minutes, 9-inch
        if (num(a.a) >= 100 && /^\s*(?:F|C|Fahrenheit|Celsius)(?![A-Za-z])/.test(after)) return null;    // 350 F, 180C
        if (u.u && u.u.fam === 'stop') return { kind: 'note', text, why: 'pinch' };
        // a number glued to letters that are not a unit ("2x", "3rd") is not an amount
        if (!u.u && /^[A-Za-z]/.test(after) && !/^x\s/i.test(after)) return null;
        after = after.slice(u.len);
        const out = { kind: 'amount', text, pre: '', a: a.a, b: a.b, unit: u.u, unitRaw: u.raw, word: a.word };
        // "1 cup + 2 tbsp", "1 lb 4 oz", "1 cup plus 2 tablespoons"
        if (u.u && !a.b) {
            const m = after.match(/^\s*(?:\+|plus|and|&)?\s*/i), rest2 = after.slice(m[0].length);
            const a2 = readAmount(rest2);
            if (a2 && !a2.b && !a2.word) {
                const u2 = readUnit(rest2.slice(a2.len));
                if (u2 && u2.u && u2.u.fam === u.u.fam && (u.u.fam === 'vol' || u.u.fam === 'wt') && u2.u.key !== u.u.key && (m[0].trim() || u.u.fam === 'wt')) {
                    out.extra = { a: a2.a, unit: u2.u, raw: u2.raw }; after = rest2.slice(a2.len + u2.len);
                }
            }
        }
        if (u.u) after = sameAmount(after);
        out.restRaw = after;
        out.rest = after.trim();
        return out;
    }

    // ---- showing numbers
    const FR = { 0.125: '⅛', 0.25: '¼', 0.5: '½', 0.75: '¾' };
    function fracText(whole, f) {
        const ch = f === 0 ? '' : Math.abs(f - 1 / 3) < 1e-9 ? '⅓' : Math.abs(f - 2 / 3) < 1e-9 ? '⅔' : FR[f];
        if (!ch) return String(whole);
        return whole ? whole + ch : ch;
    }
    // nearest friendly value from a list of fractions (0..1). Returns { v, text }.
    function nearest(x, fracs) {
        const w = Math.floor(x + 1e-9); const f = x - w;
        let best = 0, d = Infinity;
        for (const c of fracs.concat([1])) { const e = Math.abs(c - f); if (e < d - 1e-9) { d = e; best = c; } }
        const v = w + best;
        return { v, text: best === 1 ? String(w + 1) : fracText(w, best) };
    }
    const TSP_F = [0, 1 / 8, 1 / 4, 1 / 2, 3 / 4], TSP_Q = [0, 1 / 4, 1 / 2, 3 / 4];
    const CUP_F = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];
    const COUNT_F = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];
    const roundHalfUp = (x, step) => Math.floor(x / step + 0.5 + 1e-9) * step;
    const trim = x => String(Math.round(x * 100) / 100);
    const plural = (v, one, many) => v > 1 ? many : one;

    // Volume in ml to cups and spoons of a system: "1¼ cups + 1 tbsp", "2 tbsp + 1½ tsp", "¾ tsp", "a pinch".
    // tol is how far (as a share of the amount) a single friendly measure may be from the exact one.
    function volText(ml, sys, tol, tolAbs, spoonsOnly) {
        const T = sys.tsp, B = sys.tbsp, C = sys.cup, tolMl = Math.max(T / 16, tol * ml, tolAbs || 0);
        if (ml < T / 16) return { text: 'a pinch', ml: 0, parts: 1 };
        if (ml < B - tolMl) {
            const n = nearest(ml / T, ml / T >= 1 ? TSP_Q : TSP_F);
            if (n.v === 0) return { text: 'a pinch', ml: 0, parts: 1 };
            if (n.v * T < B - 1e-9) return { text: n.text + ' tsp', ml: n.v * T, parts: Math.ceil(n.v) };
        }
        if (spoonsOnly || ml < C / 4 - tolMl) {
            const t = ml / B, h = Math.round(t * 2) / 2;
            if (h >= 1 && Math.abs(h - t) * B <= tolMl) return { text: fracText(Math.floor(h), h % 1) + ' tbsp', ml: h * B, parts: Math.ceil(h) };
            const w = Math.floor(t + 1e-9), r = nearest((ml - w * B) / T, (ml - w * B) / T >= 1 ? TSP_Q : TSP_F);
            if (r.v === 0) return { text: w + ' tbsp', ml: w * B, parts: w };
            if (w === 0) return { text: r.text + ' tsp', ml: r.v * T, parts: Math.ceil(r.v) };
            if (r.v * T >= B - 1e-9) return { text: (w + 1) + ' tbsp', ml: (w + 1) * B, parts: w + 1 };
            return { text: w + ' tbsp + ' + r.text + ' tsp', ml: w * B + r.v * T, parts: w + Math.ceil(r.v) };
        }
        const c = ml / C, w = Math.floor(c + 1e-9), f = c - w;
        let best = null;
        for (const F of CUP_F.concat([1])) { const e = Math.abs(F - f) * C; if (e <= tolMl && (!best || e < best.e - 1e-9)) best = { F, e }; }
        if (best) { const v = w + best.F; return { text: cupText(v), ml: v * C, parts: 1 }; }
        const bases = [Math.floor(f * 4 + 1e-9) / 4, Math.floor(f * 3 + 1e-9) / 3].filter(F => w + F > 0 && ml - (w + F) * C < C / 4 - 1e-9);
        if (!bases.length) return { text: cupText(Math.max(0.25, c)), ml: Math.max(0.25, c) * C, parts: 1 };
        const options = [];
        bases.forEach(F => [T / 4, Math.min(tolMl, B / 4)].forEach(t => {
            const rem = volText(ml - (w + F) * C, sys, 0, t, true), v = w + F;
            options.push({ text: (v ? cupText(v) + ' + ' : '') + rem.text, ml: v * C + rem.ml, parts: (v ? 1 : 0) + rem.parts });
        }));
        const err = o => { const e = Math.abs(o.ml - ml); return e <= tolMl ? 0 : e; };
        options.sort((x, y) => err(x) - err(y) || x.parts - y.parts);
        return options[0];
    }
    function cupText(v) { const n = nearest(v, CUP_F); return n.text + ' ' + plural(n.v, 'cup', 'cups'); }

    // grams or ml: under 10 to the half, then whole numbers (to 5 when it came from cups), 1000 and up as kg / L
    function metricText(x, u, converted) {
        if (x >= 1000) return trim(roundHalfUp(x, 10) / 1000) + ' ' + (u === 'g' ? 'kg' : 'L');
        const r = x < 10 ? roundHalfUp(x, 0.5) : roundHalfUp(x, converted && x >= 100 ? 5 : 1);
        if (r === 0) return u === 'g' ? 'a pinch' : 'a few drops';
        return trim(r) + ' ' + u;
    }
    function ozText(oz) {
        if (oz < 16 - 1 / 8) { const n = nearest(oz, [0, 1 / 4, 1 / 2, 3 / 4]); return n.v ? n.text + ' oz' : 'a pinch'; }
        let lb = Math.floor(oz / 16), r = Math.round(oz - lb * 16);
        if (r === 16) { lb++; r = 0; }
        return lb + ' lb' + (r ? ' ' + r + ' oz' : '');
    }
    function countText(x) {
        const n = nearest(x, x >= 10 ? [0, 1 / 2] : x < 1 ? [0, 1 / 8, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4] : COUNT_F);
        return n.v ? n : { v: x, text: '⅛' };
    }
    const unitMl = (u, sys) => u.ml || sys[u.key];

    // One amount (a number in a unit) shown in a mode: 'same' (as written), 'metric' (grams and ml) or 'us' (cups and spoons).
    // Returns { text, approx } where approx means it was turned between weight and volume using a typical weight.
    function show(x, u, mode, sys, rest, simple, conv) {
        if (!u) { const n = countText(x); return { text: n.text, v: n.v }; }
        const ing = ingredient(rest);
        if (u.fam === 'count') {
            if (u.key === 'stick' && /\bbutter|margarine\b/i.test(rest) && mode === 'metric') return { text: metricText(x * 113.4, 'g', true) };
            const n = countText(x); return { text: n.text + ' ' + plural(n.v, u.one, u.many), v: n.v };
        }
        if (u.fam === 'vol') {
            const ml = x * unitMl(u, sys);
            if (mode === 'same') {
                if (u.key === 'cup' || u.key === 'tbsp' || u.key === 'tsp') {
                    if (simple) { const n = nearest(x, u.key === 'cup' ? CUP_F : TSP_F); return { text: n.text + ' ' + (u.key === 'cup' ? plural(n.v, 'cup', 'cups') : u.key) }; }
                    return { text: volText(ml, sys, 0.03).text };
                }
                if (u.key === 'ml' || u.key === 'cl' || u.key === 'dl' || u.key === 'l') return { text: metricText(ml, 'ml', false) };
                const n = nearest(x, [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4]);
                const names = { floz: 'fl oz', pint: ['pint', 'pints'], quart: ['quart', 'quarts'], gallon: ['gallon', 'gallons'] }[u.key];
                return { text: (n.v ? n.text : trim(x)) + ' ' + (Array.isArray(names) ? plural(n.v, names[0], names[1]) : names) };
            }
            if (mode === 'metric') {
                const spoonMax = ing && ing.spoon ? 60 : ing && !ing.liquid ? 30 : 45;
                if (ml < spoonMax - 0.5) return { text: simple ? metricSpoon(ml) : volText(ml, STD, 0.03).text };
                if (ing && !ing.liquid) return { text: metricText(ml * ing.gPerMl, 'g', true), approx: true };
                return { text: metricText(ml, 'ml', conv || (u.key !== 'ml' && u.key !== 'l')) };
            }
            // us cups and spoons
            const us = SYSTEMS.us, same = sys === us && (u.key === 'cup' || u.key === 'tbsp' || u.key === 'tsp');
            return { text: simple ? usSimple(ml) : volText(ml, us, 0.03).text };
        }
        // weight
        const g = x * u.g;
        if (mode === 'same') {
            if (u.key === 'g') return { text: metricText(g, 'g', false) };
            if (u.key === 'kg') return { text: metricText(g, 'g', false) };
            if (u.key === 'oz') return { text: ozText(x) };
            const n = nearest(x, [0, 1 / 4, 1 / 2, 3 / 4]);
            if (x < 1) return { text: ozText(g / 28.3495) };
            if (Math.abs(n.v - x) <= 0.02 * x) return { text: n.text + ' lb' };
            return { text: ozText(g / 28.3495) };
        }
        if (mode === 'metric') return { text: metricText(g, 'g', conv || u.key === 'oz' || u.key === 'lb') };
        if (ing) {
            const ml = g / ing.gPerMl;
            return { text: simple ? usSimple(ml) : volText(ml, SYSTEMS.us, 0.05).text, approx: true };
        }
        return { text: ozText(g / 28.3495) };
    }
    function metricSpoon(ml) { const t = ml / 15; if (t >= 1) { const n = nearest(t, [0, 1 / 2]); return n.text + ' tbsp'; } return nearest(ml / 5, TSP_F).text + ' tsp'; }
    function usSimple(ml) {
        const us = SYSTEMS.us;
        if (ml >= us.cup / 4) return cupText(ml / us.cup);
        if (ml >= us.tbsp) return nearest(ml / us.tbsp, [0, 1 / 2]).text + ' tbsp';
        return nearest(ml / us.tsp, TSP_F).text + ' tsp';
    }

    // ---- oven temperatures in any text: 350°F, 180 C, 180°C fan, gas mark 4
    const fToC = f => Math.round((f - 32) * 5 / 9 / 10) * 10;
    const cToF = c => { const f = c * 9 / 5 + 32; return f >= 250 ? Math.round(f / 25) * 25 : Math.round(f / 5) * 5; };
    const gasOf = f => { const g = Math.round((f - 250) / 25); return f >= 262 && f <= 487 && g >= 1 && g <= 9 ? g : null; };
    const GAS_F = { 1: 275, 2: 300, 3: 325, 4: 350, 5: 375, 6: 400, 7: 425, 8: 450, 9: 475 };
    function temps(text) {
        const parts = [];
        const re = /(\d{2,3})\s*(?:(°|º|˚|degrees?|deg\.?)\s*(F|C|Fahrenheit|Celsius|centigrade)?|(F|C|Fahrenheit|Celsius|centigrade))(?![A-Za-z])(\s*(?:fan|fan-forced|fan forced|convection))?|gas\s*mark\s*(\d)/gi;
        let m, last = 0, out = '';
        while ((m = re.exec(text))) {
            let add = '';
            const near = text.slice(m.index + m[0].length, m.index + m[0].length + 22);
            if (m[6]) { const f = GAS_F[m[6]]; if (f && !/°|\d{3}/.test(near)) add = ' (' + f + '°F, ' + fToC(f) + '°C)'; }
            else {
                const n = +m[1], scale = (m[3] || m[4] || (m[2] ? '' : '')).toLowerCase()[0];
                const isTemp = scale && (m[2] || n >= 100);
                const before = text.slice(Math.max(0, m.index - 14), m.index);
                if (isTemp && !/^\s*(?:\/|\(|or|=)\s*\d/.test(near) && !/\d\s*(?:°|º|degrees?)?\s*[CF]?\s*(?:\/|\(|or|=)\s*$/i.test(before)) {
                    const fan = !!m[5];
                    if (scale === 'f') { const c = fToC(n), g = gasOf(n); add = ' (' + c + '°C, ' + (c - 20) + '°C fan' + (g ? ', gas ' + g : '') + ')'; }
                    else if (scale === 'c') { const c = fan ? n + 20 : n, f = cToF(c), g = gasOf(f); add = ' (' + f + '°F' + (fan ? ' in a normal oven' : '') + (g ? ', gas ' + g : '') + ')'; }
                }
            }
            if (add) { out += text.slice(last, m.index + m[0].length) + add; last = m.index + m[0].length; parts.push(add); }
        }
        return { text: out + text.slice(last), changed: parts.length > 0 };
    }

    // ---- one line, scaled and shown
    // factor is an exact fraction; mode 'same' | 'metric' | 'us'; sysKey 'us' | 'metric' | 'au'
    function scaleLine(p, factor, mode, sysKey) {
        const sys = SYSTEMS[sysKey] || SYSTEMS.us;
        if (p.kind !== 'amount') return Object.assign({}, p, { out: temps(p.text).text });
        const rest = p.rest || '', ingText = (p.pre ? p.pre + ' ' : '') + rest;
        let amt, approx = false, hint = '', v = null;
        const xa = num(mul(p.a, factor));
        if (p.b) {
            const xb = num(mul(p.b, factor));
            const A = show(xa, p.unit, mode, sys, ingText, true), B = show(xb, p.unit, mode, sys, ingText, true);
            const ua = A.text.replace(/^[\d⅛¼⅓½⅔¾.]+\s*/, ''), ub = B.text.replace(/^[\d⅛¼⅓½⅔¾.]+\s*/, '');
            amt = ua === ub ? A.text.slice(0, A.text.length - ua.length).trim() + '–' + B.text : A.text + ' – ' + B.text;
            approx = A.approx || B.approx; v = B.v;
        } else {
            let x = xa, u = p.unit;
            if (p.extra) {   // two parts of the same kind: add them up in ml or grams
                const sys0 = sys, base = q => p.unit.fam === 'vol' ? unitMl(q, sys0) : q.g;
                x = xa * base(p.unit) + num(mul(p.extra.a, factor)) * base(p.extra.unit);
                u = p.unit.fam === 'vol' ? UNITS.ml : UNITS.g;
                if (mode === 'same') {   // keep the kitchen measures the recipe uses
                    if (p.unit.fam === 'vol' && ['cup', 'tbsp', 'tsp'].includes(p.unit.key)) { amt = volText(x, sys, 0.03).text; }
                    else if (p.unit.fam === 'wt' && (p.unit.key === 'lb' || p.unit.key === 'oz')) { amt = ozText(x / 28.3495); }
                }
            }
            if (!amt) { const r = show(x, u, mode, sys, ingText, false, !!p.extra); amt = r.text; approx = r.approx; v = r.v; }
            if (!p.unit && isEgg(ingText)) hint = eggHint(xa, mode);
            if (p.unit && p.unit.key === 'stick' && /\bbutter\b/i.test(rest) && mode === 'us' && xa > 0) hint = '1 stick of butter is ½ cup (8 tbsp, 113 g).';
        }
        let restOut = rest;
        if (/^a pinch$|^a few drops$/.test(amt) && rest && !/^of\b/i.test(rest)) restOut = 'of ' + rest;
        else if (!p.unit && v != null && v > 1 && /^[a-z]+$/i.test(rest) && !/s$/i.test(rest) && !isEgg(rest)) restOut = rest + 's';
        if (!p.unit && isEgg(rest) && v != null) restOut = v > 1 ? rest.replace(/\begg\b/i, 'eggs') : rest.replace(/\beggs\b/i, 'egg');
        if (p.unit && p.unit.key === 'stick' && mode === 'metric' && /\bbutter|margarine\b/i.test(rest)) restOut = rest.replace(/^\s*(of\s+)?/i, '');
        restOut = temps(restOut).text;
        const shown = (approx ? '≈ ' : '') + amt;
        const out = p.pre && !p.mid ? temps(p.pre).text + ' ' + shown : (p.mid ? p.pre + ' ' : '') + shown + (restOut ? ' ' + restOut : '');
        return Object.assign({}, p, { amt: shown, restOut, pre: p.pre ? temps(p.pre).text : '', approx, hint, out });
    }
    // what to do with part of an egg: a large egg is about 50 g, or 3 tbsp beaten
    function eggHint(x, mode) {
        const w = Math.floor(x + 1e-9), f = x - w;
        if (f < 1e-6) return '';
        if (f < 0.2 || f > 0.8) { const n = f > 0.8 ? w + 1 : w; return n ? 'Use ' + n + ' ' + plural(n, 'egg', 'eggs') + '.' : 'Beat 1 egg and use a little of it.'; }
        const t = f * 3, part = mode === 'metric' ? metricText(f * 50, 'g', false) : t >= 1 ? nearest(t, [0, 1 / 2]).text + ' tbsp' : nearest(t * 3, TSP_F).text + ' tsp';
        return w ? 'Use ' + w + ' ' + plural(w, 'egg', 'eggs') + ', plus ' + part + ' of another beaten egg.' : 'Beat 1 egg and use ' + part + ' of it.';
    }
    // the amount as it was written, for the "was" line
    function wasText(p) {
        if (p.kind !== 'amount') return '';
        const fmt = r => { const v = num(r), w = Math.floor(v + 1e-9), f = v - w; const n = nearest(v, [0, 1 / 8, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4]); return Math.abs(n.v - v) < 1e-6 ? n.text : trim(v); };
        let t = fmt(p.a) + (p.b ? '–' + fmt(p.b) : '');
        if (p.unitRaw) t += ' ' + p.unitRaw;
        else if (!p.pre && p.rest) t += ' ' + (p.rest.length > 40 ? p.rest.slice(0, 38) + '…' : p.rest);
        if (p.extra) t += (p.unit.fam === 'wt' ? ' ' : ' + ') + fmt(p.extra.a) + ' ' + (p.extra.raw || p.extra.unit.key);
        return t;
    }

    // ---- the whole recipe
    function parseRecipe(text) {
        return String(text || '').split(/\r?\n/).slice(0, MAX_LINES).map(parseLine).filter(p => p.kind !== 'blank');
    }
    function scaleRecipe(text, factor, mode, sysKey) { return parseRecipe(text).map(p => scaleLine(p, factor, mode, sysKey)); }
    function methodLines(text) {
        return String(text || '').split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, MAX_LINES).map(l => temps(l).text);
    }
    // Lines a person can scale by ("I have 2 eggs"): a single amount, not a range or two parts.
    function haveChoices(lines) {
        return lines.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === 'amount' && !p.b && !p.extra && num(p.a) > 0);
    }
    const factorText = f => { const v = num(f); return '×' + (Math.abs(v - Math.round(v * 100) / 100) < 1e-9 ? trim(v) : trim(v)); };
    const numText = r => { const v = num(r); return Math.abs(v - Math.round(v * 100) / 100) < 1e-9 ? trim(v) : '' + (Math.round(v * 100) / 100); };

    // plain text of the scaled recipe for copy, email and print
    function recipeText(o) {
        const lines = [];
        lines.push(o.title);
        if (o.subtitle) lines.push(o.subtitle);
        lines.push('', 'Ingredients:');
        o.lines.forEach(l => {
            if (l.kind === 'heading') lines.push('', l.text + ':');
            else lines.push('- ' + l.out + (l.hint ? ' (' + l.hint + ')' : ''));
        });
        if (o.method && o.method.length) { lines.push('', 'Method:'); o.method.forEach((m, i) => lines.push((/^\d+[.)]/.test(m) ? '' : (i + 1) + '. ') + m)); }
        if (o.lines.some(l => l.approx)) lines.push('', '≈ turned between cups and grams using a typical weight for that ingredient.');
        return lines.join('\n');
    }

    // saved data: keep only what is valid
    function cleanDraft(d) {
        const s = v => typeof v === 'string' ? v.slice(0, 20000) : '';
        const o = d && typeof d === 'object' ? d : {};
        return {
            ingredients: s(o.ingredients), method: s(o.method), from: s(o.from).slice(0, 12), to: s(o.to).slice(0, 12), name: s(o.name).slice(0, 80),
            mode: ['same', 'metric', 'us'].includes(o.mode) ? o.mode : 'same', sys: SYSTEMS[o.sys] ? o.sys : 'us', showMethod: !!o.showMethod,
            id: typeof o.id === 'string' ? o.id.slice(0, 40) : ''
        };
    }
    function cleanSaved(list) {
        if (!Array.isArray(list)) return [];
        return list.filter(r => r && typeof r === 'object' && typeof r.name === 'string' && typeof r.ingredients === 'string' && r.name.trim() && r.ingredients.trim())
            .slice(0, 200).map(r => Object.assign(cleanDraft(r), { id: typeof r.id === 'string' ? r.id.slice(0, 40) : 'r' + Math.random().toString(36).slice(2), saved: Number.isFinite(r.saved) ? r.saved : 0 }));
    }

    const api = { MAX_SERVINGS, MAX_LINES, SYSTEMS, R, mul, div, num, readNum, readAmount, parseServings, parseHave, parseLine, parseRecipe, scaleLine, scaleRecipe,
        volText, metricText, ozText, temps, fToC, cToF, ingredient, eggHint, wasText, haveChoices, methodLines, factorText, numText, recipeText, cleanDraft, cleanSaved };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.RecipeCore = api;
})(typeof self !== 'undefined' ? self : this);
