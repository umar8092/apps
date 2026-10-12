// Checks on the maths. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const inv = (items, extra) => Object.assign({ items: items.map(([d, q, rr, notax]) => ({ d, q, r: rr, notax: !!notax })), status: 'unpaid' }, extra || {});

        // typed numbers
        check('price 1250, 1,250.00, $1,250, 1.250,00 -> 125000 cents', ['1250', '1,250.00', '$1,250', '1.250,00', ' 1250 '].every(v => C.parsePrice(v).v === 125000));
        check('letters inside a number are rejected (1e5, 12abc34) but a currency word around it is fine (Rs 500, 500 kr)', C.parsePrice('1e5').err === 'nan' && C.parsePrice('12abc34').err === 'nan' && C.parsePrice('Rs 500').v === 50000 && C.parsePrice('500 kr').v === 50000);
        check('price 2,5 -> 250; 0.995 -> 100 (half a cent up); 33.333 -> 3333', C.parsePrice('2,5').v === 250 && C.parsePrice('0.995').v === 100 && C.parsePrice('33.333').v === 3333);
        check('price -50 and (50) are credits of -5000; -0.005 -> -1', C.parsePrice('-50').v === -5000 && C.parsePrice('(50)').v === -5000 && C.parsePrice('-0.005').v === -1);
        check('price blank, words, huge', C.parsePrice('').blank && C.parsePrice('abc').err === 'nan' && C.parsePrice('20000000').err === 'big' && C.parsePrice('99999999999999999').err === 'big');
        check('price 0 is allowed (a free item)', C.parsePrice('0').v === 0);
        check('style 1.234,56: "1.250" is 1250.00 and "2,5" is 2.50', C.parsePrice('1.250', '1.234,56').v === 125000 && C.parsePrice('2,5', '1.234,56').v === 250);
        check('style 1,234.56: "1.250" is 1.25 and "1,250" is 1250', C.parsePrice('1.250').v === 125 && C.parsePrice('1,250').v === 125000);
        check('style 1 234,56: "1 250,50" -> 125050', C.parsePrice('1 250,50', '1 234,56').v === 125050);
        check('qty blank = 1; 2.5 -> 2500; 0 / -1 / 1.0005 / words / 200000 refused', C.parseQty('').v === 1000 && C.parseQty('2.5').v === 2500 && C.parseQty('0').err === 'zero' && C.parseQty('-1').err === 'negative' && C.parseQty('1.0005').err === 'decimals' && C.parseQty('two').err === 'nan' && C.parseQty('200000').err === 'big');
        check('percent 8.875 -> 8875; 101 refused; -5 refused; blank', C.parsePct('8.875').v === 8875 && C.parsePct('101').err === 'over100' && C.parsePct('-5').err === 'negative' && C.parsePct('').blank && C.parsePct('8,5').v === 8500);
        check('mulDiv rounds half away from zero', C.mulDiv(1005, 999, 1000) === 1004 && C.mulDiv(-1005, 999, 1000) === -1004 && C.mulDiv(1, 1, 2) === 1 && C.mulDiv(1, 1, 3) === 0);

        // README example: designer invoice
        const ex = inv([['Logo design', '1', '600'], ['Business card design', '', '150'], ['Website banners', '3', '75']], { discOn: true, discType: 'pct', disc: '10', taxOn: true, taxName: 'Sales tax', taxRate: '8', paidOn: true, paid: '300' });
        const c = C.compute(ex);
        check('example: subtotal 975.00, discount 97.50, tax 70.20, total 947.70, paid 300.00, due 647.70', c.ok && c.subtotal === 97500 && c.discount === 9750 && c.tax === 7020 && c.total === 94770 && c.paid === 30000 && c.balance === 64770);
        check('example: line amounts 600.00, 150.00 (blank qty = 1), 225.00', c.lines.map(l => l.amount).join() === '60000,15000,22500');

        // hours
        const h = C.compute(inv([['Consulting, October', '12.5', '45']]));
        check('12.5 hours × 45.00 = 562.50, no tax = total', h.total === 56250 && h.balance === 56250 && h.tax === 0);
        check('odd cents: 1.005 × 9.99 = 10.04; 3 × 33.33 = 99.99', C.compute(inv([['a', '1.005', '9.99']])).total === 1004 && C.compute(inv([['a', '3', '33.33']])).total === 9999);

        // tax
        check('add 8.875% to 100.00 -> 8.88, total 108.88', (x => x.tax === 888 && x.total === 10888)(C.compute(inv([['a', '1', '100']], { taxOn: true, taxRate: '8.875' }))));
        check('prices include 20% VAT: 120.00 -> VAT 20.00, total stays 120.00', (x => x.tax === 2000 && x.total === 12000)(C.compute(inv([['a', '1', '120']], { taxOn: true, taxRate: '20', taxIncl: true }))));
        check('prices include 8.875%: 100.00 -> 8.15 inside', C.compute(inv([['a', '1', '100']], { taxOn: true, taxRate: '8.875', taxIncl: true })).tax === 815);
        check('tax switched on but rate blank: no tax, no problem', (x => x.ok && x.tax === 0 && x.total === 10000)(C.compute(inv([['a', '1', '100']], { taxOn: true, taxRate: '' }))));
        check('tax switched off ignores a typed rate', C.compute(inv([['a', '1', '100']], { taxOn: false, taxRate: '10' })).total === 10000);
        check('0% tax: total unchanged', C.compute(inv([['a', '1', '100']], { taxOn: true, taxRate: '0' })).total === 10000);
        const mix = C.compute(inv([['Labour', '1', '200', true], ['Parts', '1', '100']], { discOn: true, discType: 'amt', disc: '30', taxOn: true, taxRate: '10' }));
        check('no tax on labour: discount 30 shared, tax 10% of 90.00 = 9.00, total 279.00', mix.tax === 900 && mix.total === 27900);

        // discount
        check('discount 100% -> total 0', C.compute(inv([['a', '2', '50']], { discOn: true, disc: '100' })).total === 0);
        check('discount amount more than the items -> problem', C.compute(inv([['a', '1', '50']], { discOn: true, discType: 'amt', disc: '60' })).problems.some(p => p.where === 'disc' && p.code === 'over'));
        check('discount 150% / -5 / words -> problems', ['150', '-5', 'ten'].every(v => C.compute(inv([['a', '1', '50']], { discOn: true, disc: v })).problems.some(p => p.where === 'disc')));
        check('discount 33.333% of 100.00 = 33.33', C.compute(inv([['a', '1', '100']], { discOn: true, disc: '33.333' })).discount === 3333);
        check('discount switched off ignores a typed value', C.compute(inv([['a', '1', '100']], { discOn: false, disc: '50' })).total === 10000);

        // paid
        check('paid more than total -> problem', C.compute(inv([['a', '1', '100']], { paidOn: true, paid: '150' })).problems.some(p => p.where === 'paid'));
        check('paid exactly total -> 0.00 due', C.compute(inv([['a', '1', '100']], { paidOn: true, paid: '100' })).balance === 0);
        check('status paid -> paid = total, nothing due', (x => x.paid === 10000 && x.balance === 0)(C.compute(inv([['a', '1', '100']], { status: 'paid' }))));

        // items
        const e = C.compute(inv([['', '', '']]));
        check('only an empty row -> not ok, asks for an item', !e.ok && e.problems[0].where === 'items' && e.lines[0].empty);
        const half = C.compute(inv([['Logo', '', ''], ['', '2', '10']]));
        check('description without price and price without description: both flagged', half.lines[0].errors.r === 'blank' && half.lines[1].errors.d === 'blank' && half.problems.length === 2);
        const cr = C.compute(inv([['Website', '1', '1000'], ['Deposit already invoiced', '1', '-250']]));
        check('credit line below 0 is taken off: 750.00', cr.ok && cr.total === 75000);
        check('items below 0 overall -> problem', C.compute(inv([['Refund', '1', '-20']])).problems.some(p => p.text.includes('less than 0')));
        check('empty rows are skipped between real ones', C.compute(inv([['a', '1', '10'], ['', '', ''], ['b', '1', '5']])).total === 1500);
        const big = C.compute(inv(Array.from({ length: 50 }, () => ['x', '100000', '10000000'])));
        check('50 rows at the largest size stay exact', big.ok && big.total === 50 * 100000 * 1000000000 && Number.isSafeInteger(big.total));

        // showing numbers
        check('money styles: 1,234.56 / 1.234,56 / 1 234,56', C.money(123456, '', '1,234.56') === '1,234.56' && C.money(123456, '', '1.234,56') === '1.234,56' && C.money(123456, '', '1 234,56') === '1 234,56');
        check('money symbols: $947.70, Rs 947.70, -$50.00, 0.05', C.money(94770, '$') === '$947.70' && C.money(94770, 'Rs') === 'Rs 947.70' && C.money(-5000, '$') === '-$50.00' && C.money(5, '') === '0.05');
        check('qty shown 1, 2.5, 1,500, 1.005; percent 8.875%', C.fmtQty(1000) === '1' && C.fmtQty(2500) === '2.5' && C.fmtQty(1500000) === '1,500' && C.fmtQty(1005) === '1.005' && C.fmtPct(8875) === '8.875%' && C.fmtQty(2500, '1.234,56') === '2,5');

        // dates
        check('31 Jan + 30 days = 2 Mar; 14 Feb 2028 + 15 = 29 Feb 2028; year end', C.addDays('2026-01-31', 30) === '2026-03-02' && C.addDays('2028-02-14', 15) === '2028-02-29' && C.addDays('2026-12-20', 14) === '2027-01-03');
        check('fmtDate 13 Oct 2026; bad dates refused', C.fmtDate('2026-10-13') === '13 Oct 2026' && !C.isYmd('2026-02-30') && !C.isYmd('') && !C.isYmd('13/10/2026'));
        check('due: 30 days, on receipt, custom, custom before the date, no date', C.dueOf({ issue: '2026-10-13', terms: '30' }).due === '2026-11-12' && C.dueOf({ issue: '2026-10-13', terms: '0' }).onReceipt && C.dueOf({ issue: '2026-10-13', terms: 'custom', due: '2026-10-20' }).due === '2026-10-20' && C.dueOf({ issue: '2026-10-13', terms: 'custom', due: '2026-10-01' }).err === 'due-before' && C.dueOf({ issue: '2026-10-13', terms: 'custom', due: '' }).err === 'due-blank' && C.dueOf({ issue: '', terms: '7' }).err === 'issue');
        check('due text says the days', C.dueOf({ issue: '2026-10-13', terms: '14' }).text === 'Due 27 Oct 2026 (14 days)');
        const st = (terms, status, t) => C.statusText({ issue: '2026-10-01', terms, status }, t).text;
        check('status: due in 9 days, due today, overdue by 1 day, overdue by 5 days, paid', st('14', 'unpaid', '2026-10-06') === 'Due in 9 days' && st('14', 'unpaid', '2026-10-15') === 'Due today' && st('14', 'unpaid', '2026-10-16') === 'Overdue by 1 day' && st('14', 'unpaid', '2026-10-20') === 'Overdue by 5 days' && st('14', 'paid', '2026-12-01') === 'Paid');
        check('today() uses the local calendar date', C.today(new Date(2026, 9, 13, 0, 5)) === '2026-10-13' && C.today(new Date(2026, 9, 12, 23, 59)) === '2026-10-12');

        // invoice numbers
        check('bump INV-0009 -> INV-0010, 2026-099 -> 2026-100, 7 -> 8, 99 -> 100, ABC -> ABC-2, A12/B -> A13/B', C.bump('INV-0009') === 'INV-0010' && C.bump('2026-099') === '2026-100' && C.bump('7') === '8' && C.bump('99') === '100' && C.bump('ABC') === 'ABC-2' && C.bump('A12/B') === 'A13/B');
        check('next number: first is INV-0001; follows the newest; skips used ones', C.nextNumber([]) === 'INV-0001' && C.nextNumber([{ number: 'INV-0004', created: 1 }, { number: 'INV-0002', created: 2 }]) === 'INV-0003' && C.nextNumber([{ number: 'A-1', created: 2 }, { number: 'A-2', created: 1 }]) === 'A-3');
        check('next number with a huge counter stays exact', C.nextNumber([{ number: 'X99999999999999999999', created: 1 }]) === 'X100000000000000000000');

        // text
        const s = C.summary(Object.assign({ number: 'INV-0007', issue: '2026-10-13', terms: '30', client: { name: 'Blue Bird Cafe' }, notes: 'Bank: 12-34-56' }, ex), { name: 'Sara Khan Design' }, '$');
        check('summary has who, dates, lines, sums and notes', ['Invoice INV-0007', 'From: Sara Khan Design', 'To: Blue Bird Cafe', 'Date: 13 Oct 2026', 'Due: 12 Nov 2026', 'Website banners: 3 × $75.00 = $225.00', 'Subtotal: $975.00', 'Discount 10%: -$97.50', 'Sales tax 8%: $70.20', 'Total: $947.70', 'Already paid: -$300.00', 'Amount due: $647.70, due by 12 Nov 2026', 'Bank: 12-34-56'].every(t => s.includes(t)));
        const sp = C.summary({ number: '1', issue: '2026-10-13', terms: '0', client: {}, items: [{ d: 'a', q: '', r: '10' }], status: 'paid' }, {}, '');
        check('summary paid: "Paid in full", no "Amount due"', sp.includes('Paid in full') && !sp.includes('Amount due') && sp.includes('Due: on receipt'));

        // saved data
        const cl = C.clean({ me: { name: 5, logo: 'javascript:alert(1)' }, saved: [{ id: 'a', number: 'INV-1', items: 'x' }, null, { id: 'a', number: 'INV-2' }], clients: [{ name: '' }, { name: 'Bob' }], cur: 'XXX', style: 'odd', inv: { issue: '2026-99-99', terms: 'bad', items: [{ d: 'x', q: 2 }] } });
        check('clean: bad values replaced, duplicate ids fixed, bad logo dropped', cl.me.name === '5' && cl.me.logo === '' && cl.saved.length === 2 && cl.saved[0].id !== cl.saved[1].id && cl.saved[0].items.length === 1 && cl.clients.length === 1 && cl.cur === '' && cl.style === '1,234.56' && C.isYmd(cl.inv.issue) && cl.inv.terms === '30' && cl.inv.items[0].q === '2');
        check('clean(null), clean("x") give a fresh start', C.clean(null).inv.number === 'INV-0001' && C.clean('x').saved.length === 0);
        check('clean cuts very long text', C.clean({ inv: { items: [{ d: 'x'.repeat(5000) }] } }).inv.items[0].d.length === 300);
        const nb = C.blankInvoice([{ number: 'INV-0003', created: 1 }], { terms: '14', taxOn: true, taxRate: '8', taxName: 'GST', notes: 'Bank X', discOn: true }, new Date(2026, 9, 13));
        check('new invoice keeps terms, tax and notes, not the discount; next number; today', nb.number === 'INV-0004' && nb.terms === '14' && nb.taxOn && nb.taxRate === '8' && nb.taxName === 'GST' && nb.notes === 'Bank X' && !nb.discOn && nb.issue === '2026-10-13' && nb.items.length === 1);
        check('upsertClient: same name updates, sorted', (l => l.length === 2 && l[0].name === 'Ann' && l[1].details === 'new')(C.upsertClient(C.upsertClient([{ name: 'Bob', details: 'old', email: '' }], { name: 'bob', details: 'new' }), { name: 'Ann' })));
        const rs = C.restyle({ items: [{ d: 'a', q: '1,5', r: '1,250.50' }, { d: 'b', q: '', r: 'abc' }], discType: 'amt', disc: '10.5', taxRate: '8.875', paid: '' }, '1,234.56', '1.234,56');
        check('restyle 1,234.56 -> 1.234,56 keeps values: 1,5 -> 1,5; 1,250.50 -> 1250,5; words kept', rs.items[0].q === '1,5' && rs.items[0].r === '1250,5' && rs.items[1].r === 'abc' && rs.disc === '10,5' && rs.taxRate === '8,875' && rs.style === '1.234,56' && C.parsePrice(rs.items[0].r, '1.234,56').v === 125050);
        const back = C.restyle(rs, '1.234,56', '1,234.56');
        check('restyle back again', back.items[0].r === '1250.5' && back.items[0].q === '1.5' && C.parseQty(back.items[0].q).v === 1500);
        check('per-invoice currency and style kept by new invoice and clean', C.blankInvoice([], { cur: 'Rs', style: '1 234,56' }).cur === 'Rs' && C.cleanInvoice({ cur: 'bad', style: 'x' }).cur === '' && C.cleanInvoice({ cur: '€', style: '1.234,56' }).style === '1.234,56');
        return r;
    }
    if (typeof module !== 'undefined' && module.exports) {
        const res = runTests(require('./core.js'));
        res.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
        const f = res.filter(t => !t.ok).length;
        console.log(res.length - f + ' of ' + res.length + ' passed'); if (f) process.exit(1);
    } else root.runTests = runTests;
})(typeof window !== 'undefined' ? window : this);
