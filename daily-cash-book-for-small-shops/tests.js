// Checks for core.js. Run: node daily-cash-book-for-small-shops/tests.js  (or open test.html)
(function (root) {
    'use strict';
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.CashBook;
    let pass = 0; const fails = [];
    const eq = (a, b, name) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (ok) pass++; else fails.push(name + ': got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b)); };
    const it = (t, c, extra) => Object.assign({ id: 'x' + Math.random().toString(36).slice(2), t, c, cat: '', note: '', at: '' }, extra || {});

    // amounts
    eq(C.parseAmount('18,200').cents, 1820000, '18,200');
    eq(C.parseAmount('1,00,000').cents, 10000000, 'lakh grouping');
    eq(C.parseAmount('Rs 1500').cents, 150000, 'Rs prefix');
    eq(C.parseAmount('1500/-').cents, 150000, '/- suffix');
    eq(C.parseAmount('12.5').cents, 1250, 'decimal');
    eq(C.parseAmount('12,50').cents, 1250, 'comma decimal');
    eq(C.parseAmount('2 500').cents, 250000, 'space grouping');
    eq(!!C.parseAmount('').error, true, 'blank refused');
    eq(!!C.parseAmount('0').error, true, 'zero refused for an entry');
    eq(C.parseAmount('0', { zero: true }).cents, 0, 'zero allowed for a count');
    eq(C.parseAmount('-50').error, 'Type the amount without a minus sign.', 'negative refused');
    eq(!!C.parseAmount('abc').error, true, 'words refused');
    eq(!!C.parseAmount('1.234').error, false, '1.234 is one thousand');
    eq(!!C.parseAmount('1.2345').error, true, 'too many decimals');
    eq(!!C.parseAmount('99999999999').error, true, 'too big refused');
    eq(C.parseAmount('9,999,999,999.99').cents, C.MAX, 'max allowed');
    eq(C.fmt(1820000, 'Rs'), 'Rs 18,200', 'fmt Rs');
    eq(C.fmt(10000000, 'Rs'), 'Rs 1,00,000', 'fmt lakh');
    eq(C.fmt(10000000, '$'), '$100,000', 'fmt dollars');
    eq(C.fmt(-25000, ''), '−250', 'fmt negative');
    eq(C.fmt(1050, ''), '10.50', 'fmt cents');

    // the worked example: Wed 21 Oct and Thu 22 Oct 2026
    const st = C.emptyState();
    st.days['2026-10-21'] = { open: 200000, count: 1240000, items: [it('sale', 1500000), it('stock', 400000), it('exp', 50000, { cat: 'Electricity' })] };
    st.days['2026-10-22'] = { open: null, count: 1820000, items: [it('sale', 980000), it('sale', 425000), it('sale', 370000), it('card', 230000),
        it('stock', 600000, { note: 'Ali Traders' }), it('exp', 20000, { cat: 'Tea and food' }), it('exp', 150000, { cat: 'Wages' }), it('owner', 400000)] };
    let ch = C.chain(st);
    eq(ch['2026-10-21'].expected, 1250000, '21 Oct should be 12,500');
    eq(C.diffWords(ch['2026-10-21'].diff, ''), '100 short', '21 Oct 100 short');
    eq([ch['2026-10-22'].open, ch['2026-10-22'].from], [1240000, 'count'], '22 Oct opens with 21 Oct count');
    eq(ch['2026-10-22'].expected, 1845000, '22 Oct should be 18,450');
    eq(C.diffWords(ch['2026-10-22'].diff, ''), '250 short', '22 Oct 250 short');
    eq(ch['2026-10-22'].tot.sales, 2005000, 'sales 20,050');
    eq(ch['2026-10-22'].tot.net, 1235000, 'sales minus stock and expenses 12,350');
    eq(ch['2026-10-22'].tot.byCat, { 'Tea and food': 20000, Wages: 150000 }, 'expenses by category');
    eq(C.diffWords(0, ''), 'Matches exactly', 'matches');
    eq(C.diffWords(30000, 'Rs'), 'Rs 300 over', 'over');

    // shop closed on Friday 23rd: Saturday 24th opens with Thursday's count
    eq(C.dayView(st, '2026-10-23', ch).open, 1820000, 'closed day shows carried cash');
    st.days['2026-10-24'] = { open: null, count: null, items: [it('sale', 500000)] };
    ch = C.chain(st);
    eq([ch['2026-10-24'].open, ch['2026-10-24'].prevKey], [1820000, '2026-10-22'], 'after a closed day');
    // a day not counted carries what should be there
    eq(C.dayView(st, '2026-10-25').open, 2320000, 'not counted: carries expected');
    eq(C.chain(st)['2026-10-24'].from, 'count', 'from count');
    // correcting Thursday's count re-carries Saturday
    st.days['2026-10-22'].count = 1845000;
    eq(C.chain(st)['2026-10-24'].open, 1845000, 'correction re-carries');
    eq(C.chain(st)['2026-10-22'].diff, 0, 'now matches');
    // a typed opening wins over the carried one
    st.days['2026-10-24'].open = 100000;
    eq([C.chain(st)['2026-10-24'].open, C.chain(st)['2026-10-24'].from], [100000, 'typed'], 'typed opening');
    st.days['2026-10-24'].open = null;
    // first day with nothing typed opens at 0
    const st2 = C.emptyState(); st2.days['2026-10-01'] = { open: null, count: null, items: [it('stock', 50000)] };
    eq([C.chain(st2)['2026-10-01'].from, C.chain(st2)['2026-10-01'].expected], ['none', -50000], 'more out than in goes negative');
    eq(C.dayView(C.emptyState(), '2026-10-22').from, 'none', 'empty book');
    // odd cents stay exact
    const st3 = C.emptyState(); st3.days['2026-10-02'] = { open: 10, count: 39, items: [it('sale', 10), it('sale', 20)] };
    eq(C.chain(st3)['2026-10-02'].expected, 40, '0.10 + 0.10 + 0.20 = 0.40');
    eq(C.diffWords(C.chain(st3)['2026-10-02'].diff, ''), '0.01 short', 'one cent short');
    // a count of 0 is a real count
    st3.days['2026-10-02'].count = 0;
    eq(C.diffWords(C.chain(st3)['2026-10-02'].diff, ''), '0.40 short', 'count 0');
    // only a typed opening still makes a day
    const st4 = C.emptyState(); st4.days['2026-10-05'] = { open: 300000, count: null, items: [] };
    eq(C.dayKeys(st4), ['2026-10-05'], 'opening only is a day');

    // weeks and months
    eq(C.weekStart('2026-10-22'), '2026-10-19', 'Monday start');
    eq(C.weekStart('2026-10-19'), '2026-10-19', 'Monday itself');
    eq(C.weekStart('2026-10-25'), '2026-10-19', 'Sunday belongs to the week before');
    eq(C.monthEnd('2026-02'), '2026-02-28', 'Feb');
    eq(C.monthEnd('2028-02'), '2028-02-29', 'leap Feb');
    const s = C.summarize(st, '2026-10-19', '2026-10-25');
    eq([s.days.length, s.sales, s.sale, s.card, s.stock, s.exp, s.owner], [3, 4005000, 3775000, 230000, 1000000, 220000, 400000], 'week sums');
    eq(s.sales, 1500000 + 1775000 + 230000 + 500000, 'week sales');
    eq(s.cats, [{ cat: 'Wages', c: 150000 }, { cat: 'Electricity', c: 50000 }, { cat: 'Tea and food', c: 20000 }], 'week categories, biggest first');
    eq([s.counted, s.diff, s.shortDays], [2, -10000, 1], 'week count difference');
    eq(s.net, 4005000 - 1000000 - 220000, 'week net');
    eq(s.endCash, 2345000, 'cash at the end of the week');
    const ps = C.periods(st, '2026-10-22');
    eq(ps.map(p => p.id), ['w:2026-10-19', 'w:2026-10-12', 'm:2026-10', 'm:2026-09'], 'periods');
    const st5 = C.normalize(JSON.parse(JSON.stringify(st))); st5.days['2026-07-03'] = { open: 100, count: null, items: [] };
    eq(C.periods(st5, '2026-10-22').map(p => p.id).slice(4), ['m:2026-07'], 'older months listed');
    eq(C.periods(st, '2026-01-05')[3].id, 'm:2025-12', 'last month across the year');
    const txt = C.periodText(st, ps[0], 'Rs', 'Asad General Store');
    eq(txt.split('\n')[0], 'Asad General Store cash book: Week of 19 Oct 2026 (19 Oct 2026 to 25 Oct 2026)', 'period title');
    eq(txt.includes('Cash count: Rs 100 short in total over 2 counted days'), true, 'period count words');
    eq(C.periodText(C.emptyState(), ps[0], '', '').includes('Nothing written'), true, 'empty period');
    const dt = C.dayText(st, '2026-10-22', 'Rs', '');
    eq(dt.includes('Cash should be: Rs 18,450'), true, 'day text should be');
    eq(dt.includes('Stock (Ali Traders)') || dt.includes('Bought stock: Rs 6,000 (Ali Traders)'), true, 'day text note');

    // saved data
    eq((() => { try { C.normalize('x'); return 'ok'; } catch (e) { return 'threw'; } })(), 'threw', 'junk refused');
    eq((() => { try { C.normalize({ days: [] }); return 'ok'; } catch (e) { return 'threw'; } })(), 'threw', 'array days refused');
    const n = C.normalize({ shop: '  My  shop ', days: { 'bad': {}, '2026-02-30': { open: 5 }, '2026-10-22': { open: -5, count: 1.5, items: [{ t: 'sale', c: 100, id: 'a' }, { t: 'sale', c: 100, id: 'a' }, { t: 'zzz', c: 5 }, { t: 'exp', c: 0 }, { t: 'exp', c: 300 }] } }, cats: ['Rent', 'rent', 5] });
    eq(Object.keys(n.days), ['2026-10-22'], 'bad days dropped');
    eq([n.shop, n.days['2026-10-22'].open, n.days['2026-10-22'].count], ['My shop', null, null], 'bad numbers dropped');
    eq(n.days['2026-10-22'].items.map(i => i.id + i.t + i.c + i.cat), ['asale100', 'axsale100', 'xexp300Other'.replace('x', n.days['2026-10-22'].items[2].id)], 'items cleaned, ids unique');
    eq(n.cats, ['Rent', '5'], 'categories deduped');
    eq(C.denomsFor('Rs')[0], 500000, 'Rs 5000 note');
    eq(C.denomsFor('zz')[0], 500000, 'generic notes');

    const out = fails.length ? 'FAILED ' + fails.length + ':\n' + fails.join('\n') : 'All ' + pass + ' checks passed';
    if (typeof module !== 'undefined' && module.exports) { console.log(out); if (fails.length) process.exit(1); }
    else { document.getElementById('out').textContent = out; }
})(this);
