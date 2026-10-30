// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.WISHLIST;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const T = '2026-10-30', fm = c => C.fmtMoney(c, '', 'en-US');

    // typed money: blank = no price yet, 0 and minus refused
    const m = s => C.parseOptMoney(s);
    eq('blank price is no price', m('').n, null); eq('spaces only', m('   ').n, null);
    eq('18500', m('18500').n, 1850000); eq('18,500', m('18,500').n, 1850000); eq('1,12,000 (lakh)', m('1,12,000').n, 11200000); eq('$ 49.99', m('$ 49.99').n, 4999);
    eq('0 refused', m('0').error, 'Type an amount bigger than 0, or leave it blank.'); eq('minus refused', !!m('-5').error, true); eq('words refused', !!m('cheap').error, true);
    eq('3 decimals refused', !!m('0.345').error, true); eq('huge refused', !!m('999999999999999').error, true); eq('odd cents', m('10.01').n, 1001);
    // wait days
    eq('days 14', C.parseDays('14').n, 14); eq('days blank', !!C.parseDays('').error, true); eq('days 0', C.parseDays('0').error, 'Wait at least 1 day.');
    eq('days 366', C.parseDays('366').error, 'Wait at most 365 days.'); eq('days 2.5', !!C.parseDays('2.5').error, true); eq('days -3', !!C.parseDays('-3').error, true);
    eq('wait names', [1, 2, 7, 14, 30, 45].map(C.waitName), ['1 day', '2 days', '1 week', '2 weeks', '30 days', '45 days']);

    // text and links
    eq('name tidy', C.cleanText('  Air \n fryer ', 80), 'Air fryer'); eq('name cut at 80', C.cleanText('x'.repeat(200), 80).length, 80);
    eq('link without https', C.cleanLink('daraz.pk/item/123'), 'https://daraz.pk/item/123');
    eq('javascript link refused', C.cleanLink('javascript:alert(1)'), null); eq('not a link refused', C.cleanLink('the blue one'), null); eq('blank link', C.cleanLink(''), '');
    eq('link host', C.linkHost('https://www.daraz.pk/products/x'), 'daraz.pk');

    // the wait
    eq('1 week from Fri 30 Oct ends Fri 6 Nov', C.endFor(T, 7, null), '2026-11-06');
    eq('30 days crosses the month', C.endFor(T, 30, null), '2026-11-29');
    eq('1 day ends tomorrow', C.endFor(T, 1, null), '2026-10-31');
    eq('need-by first shortens the wait', C.endFor(T, 30, '2026-11-10'), '2026-11-10');
    eq('need-by later changes nothing', C.endFor(T, 7, '2026-12-01'), '2026-11-06');
    eq('need-by in the past ends on the day added', C.endFor(T, 7, '2026-10-01'), T);
    eq('across the new year', C.endFor('2026-12-20', 30, null), '2027-01-19');
    eq('leap year', C.endFor('2028-02-28', 1, null), '2028-02-29');
    eq('date words', C.fmtDate('2026-11-06', T), 'Fri 6 Nov'); eq('next year shows the year', C.fmtDate('2027-01-19', T), 'Tue 19 Jan 2027');

    const item = x => Object.assign({ id: 'a', name: 'Air fryer', prices: [{ d: T, c: 1850000 }], where: '', link: '', why: '', added: T, wait: 7, ends: '2026-11-06', needBy: null, st: 'wait', dd: null, paid: null, early: false }, x || {});
    const a = item();
    eq('waiting', C.status(a, T), 'wait'); eq('waiting the day before', C.status(a, '2026-11-05'), 'wait'); eq('ready on the last day', C.status(a, '2026-11-06'), 'ready');
    eq('words waiting', C.waitWords(a, T), 'Wait ends Fri 6 Nov (in 7 days)'); eq('words tomorrow', C.waitWords(a, '2026-11-05'), 'Wait ends Fri 6 Nov (tomorrow)');
    eq('words today', C.waitWords(a, '2026-11-06'), 'Wait ended today'); eq('words 3 days ago', C.waitWords(a, '2026-11-09'), 'Wait ended Fri 6 Nov (3 days ago)');
    eq('words yesterday', C.waitWords(a, '2026-11-07'), 'Wait ended Fri 6 Nov (yesterday)');
    eq('progress start', C.progress(a, T), 0); eq('progress half', C.progress(item({ wait: 2, ends: '2026-11-01' }), '2026-10-31'), 0.5); eq('progress after end', C.progress(a, '2026-12-01'), 1);

    // price history: a drop while waiting
    const b = item();
    C.setPrice(b, 1850000, T); eq('same price adds nothing', b.prices.length, 1);
    C.setPrice(b, 1690000, '2026-11-02'); eq('new price kept with the old', b.prices.map(p => p.c), [1850000, 1690000]);
    eq('price change', C.priceChange(b), { from: 1850000, now: 1690000, diff: -160000 });
    C.setPrice(b, 1650000, '2026-11-02'); eq('same day replaces', b.prices.map(p => p.c), [1850000, 1650000]);
    C.setPrice(b, 1850000, '2026-11-02'); eq('back to the first price on the same day', b.prices.map(p => p.c), [1850000]);
    eq('no change', C.priceChange(b), null);
    C.setPrice(b, null, T); eq('blank clears the price', b.prices, []); eq('no price', C.price(b), null);

    // wait longer
    const w = item(); C.waitLonger(w, 7, T); eq('wait longer while waiting adds to the end', w.ends, '2026-11-13');
    const r = item(); C.waitLonger(r, 7, '2026-11-09'); eq('wait longer after the wait ended starts today', r.ends, '2026-11-16');
    const nb = item({ needBy: '2026-11-03', ends: '2026-11-03' }); C.waitLonger(nb, 1, '2026-11-03'); eq('wait longer clears need-by', [nb.ends, nb.needBy], ['2026-11-04', null]);

    // decide
    const d1 = item(); C.decide(d1, 'buy', '2026-11-06', 1690000); eq('bought on the day', [d1.st, d1.dd, d1.paid, d1.early], ['bought', '2026-11-06', 1690000, false]);
    const d2 = item(); C.decide(d2, 'buy', '2026-11-01', null); eq('bought early, no price', [d2.st, d2.paid, d2.early], ['bought', null, true]);
    const d3 = item(); C.decide(d3, 'skip', '2026-11-07'); eq('skipped', [d3.st, d3.dd, d3.paid], ['skipped', '2026-11-07', null]);
    C.reopen(d3); eq('back on the list', [d3.st, d3.dd, C.status(d3, '2026-11-07')], ['wait', null, 'ready']);

    // same name
    const list = [item({ id: 'x1', name: 'Running shoes', st: 'skipped', dd: '2026-09-01' }), item({ id: 'x2', name: 'Air Fryer!' })];
    eq('same name ignores case and marks', C.sameAs(list, 'air fryer', null).id, 'x2'); eq('skipped one found', C.sameAs(list, 'RUNNING  shoes', null).id, 'x1');
    eq('itself ignored', C.sameAs(list, 'Air fryer', 'x2'), null); eq('blank', C.sameAs(list, '   ', null), null);

    // the summary: Ayesha on Fri 30 Oct 2026
    const S = { v: 1, cur: '', limit: 3000000, items: [
        item({ id: 'i1', name: 'Air fryer', ends: '2026-10-30', added: '2026-10-23' }),                                                          // ready today
        item({ id: 'i2', name: 'Headphones', prices: [{ d: T, c: 1299900 }], ends: '2026-11-29', wait: 30 }),                                      // waiting
        item({ id: 'i3', name: 'Book', prices: [], ends: '2026-11-01', wait: 2 }),                                                                 // waiting, no price
        item({ id: 'i4', name: 'Sneakers', prices: [{ d: '2026-10-01', c: 1200000 }], added: '2026-10-01', ends: '2026-10-08', st: 'skipped', dd: '2026-10-09' }),
        item({ id: 'i5', name: 'Watch', prices: [{ d: '2026-09-01', c: 2500050 }], added: '2026-09-01', ends: '2026-10-01', st: 'skipped', dd: '2026-10-02' }),
        item({ id: 'i6', name: 'Old jacket', prices: [{ d: '2025-11-01', c: 900000 }], added: '2025-11-01', ends: '2025-11-08', st: 'skipped', dd: '2025-12-01' }),
        item({ id: 'i7', name: 'Kettle', prices: [{ d: '2026-10-01', c: 800000 }, { d: '2026-10-05', c: 650000 }], added: '2026-10-01', ends: '2026-10-08', st: 'bought', dd: '2026-10-09', paid: 650000 }),
        item({ id: 'i8', name: 'Lamp', prices: [{ d: '2026-09-20', c: 300000 }], added: '2026-09-20', ends: '2026-09-27', st: 'bought', dd: '2026-09-22', paid: 300000, early: true })] };
    const sm = C.summary(S, T);
    eq('ready 1, waiting 2', [sm.ready, sm.waiting, sm.open], [1, 2, 3]);
    eq('wishlist total 18,500 + 12,999 (book has no price)', [fm(sm.openTotal), sm.noPrice], ['31,499', 1]);
    eq('not spent this year 12,000 + 25,000.50, last year not counted', [fm(sm.notSpentYear), sm.skippedYear], ['37,000.50', 2]);
    eq('not spent all time', fm(sm.notSpentAll), '46,000.50');
    eq('bought this year', [sm.boughtYear, fm(sm.spentYear), sm.boughtEarlyYear], [2, '9,500', 1]);
    eq('bought this month and limit left', [fm(sm.spentMonth), fm(sm.left)], ['6,500', '23,500']);
    eq('saved on the price drop', fm(sm.dropSaved), '1,500');
    const ord = C.sorted(S.items, T);
    eq('order', [ord.ready.map(i => i.id), ord.wait.map(i => i.id), ord.bought.map(i => i.id), ord.skipped.map(i => i.id)], [['i1'], ['i3', 'i2'], ['i7', 'i8'], ['i4', 'i5', 'i6']]);
    eq('new month resets the month', C.summary(S, '2026-11-01').spentMonth, 0);
    eq('new year resets the year', C.summary(S, '2027-01-01').notSpentYear, 0);
    eq('no limit', C.summary(Object.assign({}, S, { limit: null }), T).left, null);
    const txt = C.listText(S, T, 'Rs', 'en-US');
    eq('copy text', txt.split('\n').slice(0, 5), ['My shopping wishlist (Fri 30 Oct)', '', 'Ready to decide:', '- Air fryer: Rs 18,500, wait ended today', '']);
    eq('copy text totals', txt.includes('Wishlist total: Rs 31,499 for 3 items') && txt.includes('Not spent this year (skipped): Rs 37,000.50 on 2 items'), true);
    eq('money formats', [C.fmtMoney(4999, '$', 'en-US'), C.fmtMoney(1850000, 'AED', 'en-US'), C.fmtMoney(1850000, '', 'en-IN')], ['$49.99', 'AED 18,500', '18,500']);

    // calendar file
    const ic = C.ics(item({ name: 'Air fryer, 5 L; black' }), T, '20261030T050000Z');
    eq('ics all-day on the end day', ic.includes('DTSTART;VALUE=DATE:20261106') && ic.includes('DTEND;VALUE=DATE:20261107'), true);
    eq('ics escapes', ic.includes('SUMMARY:Buy or skip: Air fryer\\, 5 L\; black?'), true); eq('ics alarm at 9', ic.includes('TRIGGER;RELATED=START:PT9H'), true);

    // saved data
    eq('empty', C.cleanState(null), null); eq('no items array', C.cleanState({ items: 'x' }), null);
    const good = C.cleanState(JSON.parse(JSON.stringify(S)));
    eq('round trip', good.items.length, 8); eq('limit kept', good.limit, 3000000);
    const bad = C.cleanState({ cur: 'BTC', limit: -5, items: [{ id: 'z', name: '', st: 'wait' }, { id: 'q', name: 'X', st: 'wait', added: T, ends: '2026-10-01', wait: 7, prices: [] }, Object.assign(item(), { id: 'ok' }), Object.assign(item(), { id: 'ok' }),
        Object.assign(item(), { id: 'nb', st: 'bought', dd: 'soon' }), Object.assign(item(), { id: 'pp', prices: [{ d: T, c: -1 }, { d: 'x', c: 5 }, { d: T, c: 100 }], link: 'javascript:alert(1)', wait: 9999 }),
        Object.assign(item(), { id: 'p2', prices: [{ d: T, c: 100 }], link: 'javascript:alert(1)' })] });
    eq('bad values dropped', [bad.cur, bad.limit, bad.items.map(i => i.id)], ['', null, ['ok', 'p2']]);
    eq('bad link cleared, bad prices dropped', [bad.items[1].link, bad.items[1].prices], ['', [{ d: T, c: 100 }]]);

    const summaryLine = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n') + '\n\n' + summaryLine;
    else { out.filter(l => l.startsWith('FAIL')).forEach(l => console.log(l)); console.log(summaryLine); if (fail) process.exitCode = 1; }
})();
