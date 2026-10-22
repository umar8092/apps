// Checks the maths and the words in core.js. Run: node tests.js (or open test.html). Every expected answer was worked out by hand.
const C = typeof module !== 'undefined' && typeof require === 'function' ? require('./core.js') : window.HouseCore;
let pass = 0, failed = 0;
const out = [];
function eq(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) pass++; else failed++;
    out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}
const nb = s => String(s).replace(/[  ]/g, ' ');

// ---- amounts ----
eq('plain', C.parseAmount('2500').cents, 250000);
eq('commas', C.parseAmount('60,000').cents, 6000000);
eq('lakh', C.parseAmount('1,25,000').cents, 12500000);
eq('decimals', C.parseAmount('12.5').cents, 1250);
eq('comma decimals', C.parseAmount('12,50').cents, 1250);
eq('Rs prefix', C.parseAmount('Rs 1500').cents, 150000);
eq('/- suffix', C.parseAmount('1500/-').cents, 150000);
eq('dollar', C.parseAmount('$40.99').cents, 4099);
eq('pasted spaces', C.parseAmount('  8 400 ').cents, 840000);
eq('blank', !!C.parseAmount('').error, true);
eq('zero', C.parseAmount('0').error, 'Type an amount more than 0.');
eq('negative', C.parseAmount('-50').error, 'Type the amount without a minus sign.');
eq('words', !!C.parseAmount('abc').error, true);
eq('3 decimals', !!C.parseAmount('1.234.5').error, true);
eq('huge', !!C.parseAmount('99999999999').error, true);
eq('max ok', C.parseAmount('9999999999.99').cents, 999999999999);
eq('share 1', C.parseShare('1').n, 100);
eq('share 1.5', C.parseShare('1,5').n, 150);
eq('share 0', C.parseShare('0').error, 'zero');
eq('share blank', C.parseShare(' ').error, 'blank');
eq('share neg', C.parseShare('-1').error, 'bad');

// ---- formatting ----
eq('fmt plain', nb(C.fmt(3240000, '')), '32,400');
eq('fmt Rs lakh', nb(C.fmt(12500000, 'Rs')), 'Rs 1,25,000');
eq('fmt $ cents', nb(C.fmt(3334, '$')), '$33.34');
eq('fmt negative', nb(C.fmt(-720000, '')), '−7,200');

// ---- allocate ----
eq('100 by 3', C.allocate(10000, [1, 1, 1]), [3334, 3333, 3333]);
eq('1 cent by 3', C.allocate(1, [1, 1, 1]), [1, 0, 0]);
eq('shares 2:1:1:1', C.allocate(6000000, [200, 100, 100, 100]), [2400000, 1200000, 1200000, 1200000]);
eq('huge exact', C.allocate(999999999999, [100000, 1, 1]).reduce((a, b) => a + b, 0), 999999999999);
eq('1.5 shares', C.allocate(1000, [150, 100]), [600, 400]);

// ---- the October flat: Ali, Sara, Omar, Hina ----
const st = C.emptyState();
['Ali', 'Sara', 'Omar', 'Hina'].forEach((n, i) => st.people.push({ id: 'p' + i, name: n, out: false }));
const add = d => { const r = C.makeExpense(st, d); if (r.error) throw new Error(r.error); r.item.id = 'e' + st.items.length; st.items.push(r.item); return r.item; };
add({ what: 'Rent', amount: '60,000', by: 'p0', date: '2026-10-01', split: 'shares', sel: ['p0', 'p1', 'p2', 'p3'], vals: { p0: '2', p1: '1', p2: '1', p3: '1' } });
add({ what: 'Electricity', amount: '8400', by: 'p1', date: '2026-10-05', split: 'equal', sel: ['p0', 'p1', 'p2', 'p3'] });
add({ what: 'Internet', amount: '2000', by: 'p3', date: '2026-10-08', split: 'equal', sel: ['p0', 'p1', 'p2', 'p3'] });
const groc = add({ what: 'Groceries', amount: '3000', by: 'p2', date: '2026-10-12', split: 'equal', sel: ['p2', 'p0', 'p1'] });
eq('balances', C.balances(st), { p0: 3240000, p1: -720000, p2: -1260000, p3: -1260000 });
eq('balances add to 0', Object.values(C.balances(st)).reduce((a, b) => a + b, 0), 0);
eq('settle', C.settle(st), [{ from: 'p2', to: 'p0', c: 1260000 }, { from: 'p3', to: 'p0', c: 1260000 }, { from: 'p1', to: 'p0', c: 720000 }]);
eq('words owed', nb(C.balanceWords('Ali', 3240000, 'Rs')), 'Ali gets back Rs 32,400');
eq('words owes', nb(C.balanceWords('Sara', -720000, '')), 'Sara owes 7,200');
eq('words zero', C.balanceWords('Omar', 0, ''), 'Omar is settled up');
eq('rent words', nb(C.splitWords(st, st.items[0], '')), 'Split by shares: Ali 24,000 (2 shares), Sara 12,000 (1 share), Omar 12,000 (1 share), Hina 12,000 (1 share)');
eq('all 4 words', nb(C.splitWords(st, st.items[1], '')), 'Split equally between all 4: 2,100 each');
eq('groceries words (list order)', nb(C.splitWords(st, groc, '')), 'Split equally between Ali, Sara, Omar: 1,000 each');
const oct = C.monthSummary(st, '2026-10');
eq('month total', oct.total, 7340000);
eq('month by what', oct.byWhat.map(w => [w.what, w.c]), [['Rent', 6000000], ['Electricity', 840000], ['Groceries', 300000], ['Internet', 200000]]);
eq('month Ali', oct.people.p0, { paid: 6000000, share: 2760000 });
eq('month Hina', oct.people.p3, { paid: 200000, share: 1460000 });

// pay back: Sara pays Ali 7,200, then only Omar and Hina owe
const pay = C.makePayment(st, { from: 'p1', to: 'p0', amount: '7200', date: '2026-10-20' });
pay.item.id = 'pay1'; st.items.push(pay.item);
eq('after Sara pays', C.balances(st), { p0: 2520000, p1: 0, p2: -1260000, p3: -1260000 });
eq('settle after', C.settle(st).length, 2);
// a part payment: Omar pays 5,000 of 12,600
st.items.push(Object.assign(C.makePayment(st, { from: 'p2', to: 'p0', amount: '5000', date: '2026-10-21' }).item, { id: 'pay2' }));
eq('part payment', C.balances(st).p2, -760000);
// overpaying makes the other person owe
st.items.push(Object.assign(C.makePayment(st, { from: 'p3', to: 'p0', amount: '13000', date: '2026-10-21' }).item, { id: 'pay3' }));
eq('overpaid Hina is owed', C.balances(st).p3, 40000);
eq('settle overpay', C.settle(st), [{ from: 'p2', to: 'p0', c: 720000 }, { from: 'p2', to: 'p3', c: 40000 }]);

// ---- validation ----
const v = d => C.makeExpense(st, Object.assign({ what: 'Gas', amount: '1000', by: 'p0', date: '2026-10-10', split: 'equal', sel: ['p0', 'p1'] }, d));
eq('no what', v({ what: '  ' }).field, 'what');
eq('no amount', v({ amount: '' }).field, 'amount');
eq('no payer', v({ by: '' }).field, 'by');
eq('bad date', v({ date: '2026-02-30' }).field, 'date');
eq('nobody ticked', v({ sel: [] }).error, 'Tick at least one person who shares this.');
eq('share blank', v({ split: 'shares', vals: { p0: '1', p1: '' } }).error, "Type Sara's share, such as 1 or 2 (more than 0).");
eq('share zero', v({ split: 'shares', vals: { p0: '1', p1: '0' } }).who, 'p1');
eq('exact short', v({ split: 'exact', vals: { p0: '600', p1: '300' } }).error, 'The parts add up to 900 but the amount is 1,000: 100 is not given to anyone yet.');
eq('exact over', v({ split: 'exact', vals: { p0: '600', p1: '500' } }).error, 'The parts add up to 1,100 but the amount is 1,000: 100 too much.');
eq('exact zero part', v({ split: 'exact', vals: { p0: '1000', p1: '0' } }).error, "Sara's part is 0. Untick Sara instead.");
eq('exact ok', v({ split: 'exact', vals: { p0: '600.50', p1: '399.50' } }).item.parts, { p0: 60050, p1: 39950 });
eq('exact left', C.exactLeft('1000', { p0: '600', p1: '' }, ['p0', 'p1']), 40000);
eq('only payer shares', C.sharesOf(st, v({ sel: ['p0'] }).item), { p0: 100000 });
eq('long name trimmed', v({ what: 'x'.repeat(80) }).item.what.length, 40);
eq('pay same person', C.makePayment(st, { from: 'p0', to: 'p0', amount: '5', date: '2026-10-01' }).error, 'Choose two different people.');
eq('pay zero', C.makePayment(st, { from: 'p0', to: 'p1', amount: '0', date: '2026-10-01' }).field, 'amount');

// odd cents: 100.00 between 3 -> 33.34 + 33.33 + 33.33
const odd = { people: st.people.slice(0, 3), items: [] };
odd.items.push(Object.assign(C.makeExpense(odd, { what: 'Pizza', amount: '100', by: 'p0', date: '2026-11-01', split: 'equal', sel: ['p0', 'p1', 'p2'] }).item, { id: 'x' }));
eq('odd cents balances', C.balances(odd), { p0: 6666, p1: -3333, p2: -3333 });
eq('odd cents words', nb(C.splitWords(odd, odd.items[0], '$')), 'Split equally between all 3: $33.34 or $33.33 each');

// ---- summary text ----
const txt = nb(C.summaryText(st, '2026-10', '', '2026-10-23'));
eq('text settle line', txt.includes('- Omar pays Ali 7,200'), true);
eq('text month line', txt.includes('October 2026: spent 73,400 (Rent 60,000, Electricity 8,400, Groceries 3,000, Internet 2,000)'), true);
eq('text payments', txt.includes('- 20 Oct Sara paid Ali 7,200'), true);
const settled = C.emptyState(); settled.people.push({ id: 'a', name: 'A', out: false });
eq('text settled', C.summaryText(settled, '', '', '2026-10-23').includes('Everyone is settled up.'), true);

// ---- saved data ----
const round = C.normalize(JSON.parse(JSON.stringify(st)));
const sk = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, x) => (a[x] = v[x], a), {}) : v));
eq('round trip', sk(round), sk(st));
eq('not our data', (() => { try { C.normalize({ days: {} }); return 'no'; } catch (e) { return 'threw'; } })(), 'threw');
eq('drops bad items', C.normalize({ people: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'a' }],
    items: [{ id: 1, k: 'exp', d: '2026-10-01', what: 'X', c: 100, by: 'a', split: 'exact', parts: { a: 50, b: 40 } },
        { k: 'exp', d: '2026-10-01', what: 'Y', c: 100, by: 'zz', split: 'equal', parts: { a: 1 } },
        { k: 'pay', d: '2026-10-01', from: 'a', to: 'a', c: 5 },
        { k: 'pay', d: 'bad', from: 'a', to: 'b', c: 5 },
        { k: 'exp', d: '2026-10-01', what: '', c: 100.5, by: 'a', split: 'equal', parts: { a: 1 } },
        { id: 'ok', k: 'exp', d: '2026-10-01', what: '', c: 100, by: 'a', split: 'equal', parts: { a: 7, b: 1 } }] }),
    { v: 1, people: [{ id: 'a', name: 'A', out: false }, { id: 'b', name: 'B', out: false }], items: [{ id: 'ok', k: 'exp', d: '2026-10-01', what: 'Other', c: 100, by: 'a', split: 'equal', parts: { a: 1, b: 1 } }] });
eq('months', C.months(st), ['2026-10']);

const summary = '\n' + pass + ' passed, ' + failed + ' failed';
if (typeof module !== 'undefined' && typeof process !== 'undefined' && process.argv) { console.log(out.join('\n') + summary); if (failed) process.exit(1); }
else { document.getElementById('out').textContent = out.join('\n') + summary; }
