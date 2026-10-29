// Logic tests: node food-allergy-card-for-eating-out-and-school/tests.js, or open test.html in a browser.
const NODE = typeof module !== 'undefined' && module.exports;
const C = NODE ? require('./core.js') : window.AllergyCore;
const log = m => (NODE ? console.log(m) : document.body.appendChild(Object.assign(document.createElement('pre'), { textContent: m })));
let n = 0, bad = 0;
function eq(a, b, what) { n++; const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) { bad++; log('FAIL ' + what + '\n  got  ' + A + '\n  want ' + B); } }
const ok = (v, what) => eq(!!v, true, what);

// every language has every sentence and every food
const KEYS = Object.keys(C.LANGS.en.s);
C.LANG_ORDER.forEach(l => {
    KEYS.forEach(k => ok(typeof C.LANGS[l].s[k] === 'string' && C.LANGS[l].s[k].trim(), l + ' has sentence ' + k));
    ['trace', 'avoid', 'pen'].forEach(k => ok(C.LANGS[l].s[k].includes('{n}'), l + ' ' + k + ' has the name'));
    C.ALLERGENS.forEach(a => ok(C.has(a.t[l]), l + ' names ' + a.k));
});
eq(C.ALLERGENS.length, 22, '22 foods');
eq(C.LANGS.ar.dir + C.LANGS.ur.dir + C.LANGS.es.dir, 'rtlrtlltr', 'Arabic and Urdu right to left');

// the main situation
const p = C.blankPerson('Ayaan');
let r = C.addFoods(p, C.parseFoods('peanuts, tree nuts, eggs'));
eq(r.added, ['Peanuts', 'Tree nuts', 'Eggs'], 'known foods added');
r = C.addFoods(p, C.parseFoods('kiwi'));
eq(r.added, ['Kiwi'], 'typed food capitalised');
p.foods.find(f => f.k === 'eggs').lvl = 'avoid';
p.pen = true; p.penWhere = 'Front pocket of the red school bag'; p.cName = 'Mum (Sara)'; p.cPhone = '+92 300 1234567';
const en = C.cardModel(p, 'en');
eq(en.groups.map(g => [g.line, g.items]), [
    ['Ayaan must not eat even a trace of:', ['Peanuts', 'Tree nuts (almonds, cashews, walnuts, hazelnuts, pistachios)', 'Kiwi']],
    ['Ayaan must not eat:', ['Eggs']]], 'English groups');
eq(en.care.length, 2, 'cross-contact sentence when a trace food exists');
eq(en.emerg.map(e => e.v ? e.t + ' ' + e.v : e.t), ['Ayaan carries an adrenaline pen (EpiPen). Please use it and call an ambulance.', 'Where it is: Front pocket of the red school bag', 'Call: Mum (Sara) +92 300 1234567'], 'English emergency');
const es = C.cardModel(p, 'es');
eq(es.groups[0].line, 'Ayaan no puede comer ni siquiera trazas de:', 'Spanish trace line');
eq(es.groups[1].items, ['Huevos'], 'Spanish eggs');
eq(es.missing, ['Kiwi'], 'kiwi has no Spanish yet');
p.foods.find(f => f.c === 'Kiwi').tr.es = 'Kiwi';
eq(C.cardModel(p, 'es').missing, [], 'own translation fills it');
eq(C.cardModel(p, 'fr').missing, ['Kiwi'], 'translation is per language');
const ur = C.cardModel(p, 'ur');
eq(ur.groups[1].line, 'Ayaan کے لیے یہ چیزیں منع ہیں:', 'Urdu avoid line');
eq(ur.dir, 'rtl', 'Urdu card rtl');
const txt = C.cardText(p, 'es');
ok(txt.startsWith('Please read: food allergy\n\nAyaan must not eat even a trace of:\n• Peanuts'), 'card text starts in English');
ok(txt.includes('— Spanish (Español) —') && txt.includes('• Cacahuetes (maní)'), 'card text has the Spanish card');
ok(!C.cardText(p, '').includes('—'), 'English only text has one card');
const note = C.note(p, '2026-10-30');
ok(note.includes('Ayaan must not eat even a trace of: Peanuts, Tree nuts, Kiwi.'), 'note trace list');
ok(note.includes('Ayaan must not eat: Eggs.'), 'note avoid list');
ok(note.includes('Where it is: Front pocket of the red school bag.') && note.includes('Call: Mum (Sara) +92 300 1234567'), 'note pen and call');
ok(note.includes('Updated 30 Oct 2026'), 'note date');

// empty, blank name, only avoid foods
const q = C.blankPerson('');
eq(C.cardModel(q, 'en'), null, 'no foods: no card');
eq(C.note(q, '2026-10-30').split('\n')[3], 'No foods listed yet.', 'empty note');
C.addFoods(q, [{ k: 'lactose' }]);
eq(q.foods[0].lvl, 'avoid', 'lactose defaults to must not eat');
const qm = C.cardModel(q, 'en');
eq(qm.groups[0].line, 'This person must not eat:', 'no name says this person, capitalised');
eq(qm.care.length, 1, 'no cross-contact sentence without trace foods');
eq(qm.emerg, [], 'no emergency part when nothing given');
eq(C.cardModel(q, 'es').groups[0].line, 'Esta persona no puede comer:', 'Spanish no name');
eq(C.cardModel(q, 'hi').groups[0].line, 'इस व्यक्ति के लिए ये चीज़ें मना हैं:', 'Hindi no name');
q.cPhone = '0300 1234567';
eq(C.cardModel(q, 'en').emerg, [{ t: 'Call:', v: '0300 1234567' }], 'a phone alone shows call');
q.cPhone = ''; q.cName = 'Dad';
eq(C.cardModel(q, 'en').emerg, [], 'a name without a phone or pen is not enough for the card');

// pasted lists, duplicates, limits
eq(C.parseFoods('1. Peanuts\n- sesame;  KIWI (raw, not cooked), peanut, , nuts'), [{ k: 'peanuts' }, { k: 'sesame' }, { c: 'KIWI (raw, not cooked)' }, { k: 'treenuts' }], 'pasted list');
eq(C.parseFoods('   ,, ;\n'), [], 'blank text adds nothing');
eq(C.parseFoods('coeliac'), [{ k: 'gluten' }], 'coeliac means gluten');
const d = C.blankPerson('X'); C.addFoods(d, C.parseFoods('kiwi'));
r = C.addFoods(d, C.parseFoods('Kiwi, peanuts'));
eq([r.added, r.dupes], [['Peanuts'], ['Kiwi']], 'duplicates skipped, case-insensitive');
const many = Array.from({ length: 35 }, (_, i) => 'food ' + i).join(',');
r = C.addFoods(C.blankPerson('Y'), C.parseFoods(many));
eq([r.added.length, r.full.length], [30, 5], '30-food limit');
eq(C.parseFoods('x'.repeat(200))[0].c.length, 60, 'very long food cut to 60');

// phone numbers
eq(['+92 300 1234567', '(020) 7946-0000', '', '999', 'call mum', '12', '+'].map(C.phoneOk), [true, true, true, true, false, false, false], 'phone check');
eq(C.telHref(' +44 (20) 7946 0000'), 'tel:+442079460000', 'tel link');

// restoring saved data
eq(C.validate(null), null, 'null');
eq(C.validate({ people: [] }), null, 'no people');
eq(C.validate('junk'), null, 'junk');
const v = C.validate({ people: [{ id: 'a', name: '  Ayaan\n ', foods: [{ k: 'peanuts', lvl: 'x' }, { k: 'nope' }, { c: '' }, { c: 'kiwi', tr: { es: 'Kiwi', xx: 'bad' }, lvl: 'avoid' }, { k: 'peanuts' }, 5],
    pen: 'yes', updated: '2026-13-45', cPhone: 12 }, { id: 'a', name: 'Twin' }], cur: 'zzz', lang: 'xx' });
eq(v.people[0].name, 'Ayaan', 'name trimmed');
eq(v.people[0].foods.map(f => [f.k || f.c, f.lvl]), [['peanuts', 'trace'], ['kiwi', 'avoid']], 'bad foods dropped, duplicates dropped');
eq(v.people[0].foods[1].tr, { es: 'Kiwi' }, 'unknown translation language dropped');
eq([v.people[0].pen, v.people[0].updated, v.people[0].cPhone], [false, '', ''], 'bad values reset');
ok(v.people[1].id !== 'a', 'duplicate id replaced');
eq([v.cur, v.lang], ['a', ''], 'cur and lang fixed');
const round = C.validate(JSON.parse(JSON.stringify({ v: 1, people: [p], cur: p.id, lang: 'es' })));
eq(C.cardText(round.people[0], 'es'), C.cardText(p, 'es'), 'save and load keeps the card');
eq(C.validate({ people: Array.from({ length: 20 }, () => ({ name: 'a' })) }).people.length, 12, '12 people max');

log(bad ? bad + ' of ' + n + ' FAILED' : 'All ' + n + ' logic tests passed');
if (NODE) process.exit(bad ? 1 : 0);
