// Checks for core.js. Run with: node tests.js  (or open test.html)
(function () {
    'use strict';
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.GJR;
    let pass = 0, failN = 0; const out = [];
    function eq(got, want, name) {
        const ok = JSON.stringify(got) === JSON.stringify(want);
        if (ok) pass++; else { failN++; out.push('FAIL ' + name + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }
    }
    const err = (r, name) => eq(!!(r && r.error), true, name + ' gives an error');

    // ---------- weights ----------
    eq(C.parseWeight('1', 'tola').ug, 11663804, '1 tola = 11.6638038 g');
    eq(C.parseWeight('5', 'tola').ug, 58319019, '5 tola');
    eq(C.parseWeight('2.5', 'tola').ug, 29159510, '2.5 tola rounds to the nearest microgram');
    eq(C.parseWeight('2,5', 'tola').ug, 29159510, 'decimal comma');
    eq(C.parseWeight('2,500', 'tola').ug, 29159510, '"2,500" tola is 2.5, weights have no thousands');
    eq(C.parseWeight('29.16', 'g').ug, 29160000, 'grams');
    eq(C.parseWeight('1,250.5', 'g').ug, 1250500000, 'grams with a thousands comma and a decimal point');
    eq(C.parseWeight('11.664 g', 'g').ug, 11664000, 'a unit typed after the number');
    eq(C.parseWeight('2.5 tola', 'tola').ug, 29159510, 'tola typed after the number');
    eq(C.parseWeight('1', 'oz').ug, 31103477, '1 troy ounce');
    err(C.parseWeight('', 'tola'), 'blank weight');
    err(C.parseWeight('0', 'tola'), 'zero weight');
    err(C.parseWeight('-2', 'g'), 'negative weight');
    err(C.parseWeight('abc', 'g'), 'letters');
    err(C.parseWeight('1.2345', 'g'), 'four decimals of a gram');
    err(C.parseWeight('200000', 'g'), '200 kg');
    eq(C.parseWeight('0', 'g', { zeroOk: true }).ug, 0, 'zero allowed for stones');
    // tola, masha, ratti
    eq(C.parseTMR('2', '6', '').ug, C.parseWeight('2.5', 'tola').ug, '2 tola 6 masha = 2.5 tola');
    eq(C.parseTMR('', '1', '').ug, 971984, '1 masha = 0.971984 g');
    eq(C.parseTMR('0', '0', '1').ug, 121498, '1 ratti = 0.121498 g');
    eq(C.parseTMR('1', '0', '0').ug, 11663804, '1 tola from tola-masha-ratti');
    err(C.parseTMR('1', '12', ''), '12 masha');
    err(C.parseTMR('1', '', '8'), '8 ratti');
    err(C.parseTMR('', '', ''), 'all blank');
    eq(C.parseTMR('', '', '', { zeroOk: true }).ug, 0, 'blank stones in tola-masha-ratti');
    err(C.parseTMR('1', '2.5', ''), 'half a masha');
    eq(C.parseTMR('0', '3', '4.5').ug, Math.round((3 * 80 + 45) * 11663803.8 / 960), 'ratti with a half');
    eq(C.fmtTMR(C.parseTMR('2', '6', '4').ug), '2 tola 6 masha 4 ratti', 'back to tola masha ratti');
    eq(C.fmtTMR(C.parseWeight('7.5', 'tola').ug), '7 tola 6 masha', 'zero ratti left out');
    eq(C.fmtTMR(C.parseWeight('10', 'g').ug), '10 masha 2.3 ratti', '10 grams');
    eq(C.weightInput(C.parseWeight('2.5', 'tola').ug, 'tola'), '2.5', 'weight back into the box');
    eq(C.weightInput(29160000, 'g'), '29.16', 'grams back into the box');
    eq(C.fmtTola(C.parseWeight('7.5', 'tola').ug), '7.500 tola', 'tola shown with 3 decimals');
    eq(C.fmtGram(87478529), '87.48 g', 'grams shown with 2 decimals');
    eq(C.fmtGram(1234567890, 'lakh'), '1,234.57 g', 'grams grouped');

    // ---------- money ----------
    eq(C.parseMoney('3,50,000').n, 35000000, 'lakh commas');
    eq(C.parseMoney('3.5 lakh').n, 35000000, '3.5 lakh');
    eq(C.parseMoney('498.25').n, 49825, 'rate with paisa or fils');
    err(C.parseMoney('-5'), 'negative money');
    eq(C.fmtMoney(240625000, 'Rs', 'lakh'), 'Rs 24,06,250', 'lakh style with Rs');
    eq(C.fmtMoney(240625000, '', 'west'), '2,406,250', 'plain numbers by default');
    eq(C.fmtMoney(240625000, '₹', 'lakh'), '₹24,06,250', 'rupee sign');

    // ---------- the main case: Ayesha's 7.5 tola of 22k at 3,50,000 per tola of 24k ----------
    const mk = (o) => Object.assign({ id: 'p' + Math.random().toString(36).slice(2, 8), owner: 'a', name: 'Piece', metal: 'gold', k: 22, fine: 999, ug: 0, stoneUg: 0, unit: 'tola', place: '', got: '', paid: null, note: '', photo: false, status: 'have', out: null, log: [] }, o);
    const rates = Object.assign(C.emptyRates(), { unit: 'tola', d: '2026-10-29', gold: 35000000 });
    const set = mk({ name: 'Wedding set', ug: C.parseWeight('5', 'tola').ug });
    const bangles = mk({ name: 'Bangles', ug: C.parseWeight('2.5', 'tola').ug });
    eq(C.value(set, rates), 160416700, '5 tola of 22k = 16,04,167 (5 x 22/24 x 3,50,000 = 16,04,166.67)');
    eq(C.value(bangles, rates), 80208300, '2.5 tola of 22k = 8,02,083');
    const s = C.sums([set, bangles], rates);
    eq(s.value, 240625000, 'Ayesha: worth 24,06,250');
    eq(C.fmtTola(s.goldUg), '7.500 tola', 'Ayesha: 7.500 tola of gold');
    eq(C.fmtTola(s.pureGoldUg), '6.875 tola', 'Ayesha: 6.875 tola pure');
    eq(C.value(mk({ k: 24, ug: C.parseWeight('1', 'tola').ug }), rates), 35000000, '1 tola of 24k = the rate');
    eq(C.value(mk({ k: 24, ug: C.parseWeight('10', 'g').ug }), Object.assign({}, rates, { unit: '10g', gold: 30007500 })), 30007500, '10 g at the per-10 g rate');
    eq(C.value(mk({ k: 21, ug: C.parseWeight('10', 'g').ug }), Object.assign(C.emptyRates(), { unit: 'g', gold: 49825 })), 436000, '10 g of 21k at AED 498.25 a gram = 4,359.69, shown as 4,360');
    eq(C.value(mk({ k: 18, ug: C.parseWeight('1', 'oz').ug }), Object.assign(C.emptyRates(), { unit: 'oz', gold: 400000 })), 300000, '1 oz of 18k at 4,000 an ounce = 3,000');
    // a separate rate for 22k is used as it is, not scaled
    eq(C.value(bangles, Object.assign({}, rates, { k22: 32000000 })), 80000000, '2.5 tola at the jeweller\'s 22k rate of 3,20,000 = 8,00,000');
    eq(C.value(mk({ k: 18, ug: C.parseWeight('1', 'tola').ug }), Object.assign({}, rates, { k22: 32000000 })), 26250000, '18k with only a 22k rate uses the 24k rate x 18/24');
    // stones taken off
    const ring = mk({ ug: C.parseWeight('3', 'tola').ug, stoneUg: C.parseWeight('0.5', 'tola').ug });
    eq(C.fmtTola(C.net(ring)), '2.500 tola', 'stones taken off the weight');
    eq(C.value(ring, rates), 80208300, 'value of the gold only');
    // silver
    const silver = mk({ metal: 'silver', fine: 925, ug: C.parseWeight('10', 'tola').ug });
    eq(C.value(silver, rates), null, 'silver with no silver rate has no value');
    eq(C.value(silver, Object.assign({}, rates, { silver: 450000 })), 4162500, '10 tola of 925 silver at 4,500 = 41,625');
    eq(C.value(set, C.emptyRates()), null, 'no rate, no value');
    const s2 = C.sums([set, silver], rates);
    eq([s2.priced, s2.unpriced, s2.value], [1, 1, 160416700], 'a piece with no rate is counted apart');
    eq(C.purityName(set), '22k (916) gold', 'purity name');
    eq(C.purityName(silver), 'Sterling silver (925)', 'silver name');
    // a huge weight does not lose precision
    const big = mk({ k: 24, ug: C.MAXUG });
    eq(C.value(big, Object.assign({}, rates, { gold: C.MAXC })) > 0, true, '100 kg at the biggest rate still works');

    // ---------- state ----------
    const st = C.emptyState();
    st.people.push({ id: 'a', name: 'Ayesha' }, { id: 'b', name: 'Ammi' });
    st.rates = rates;
    st.pieces.push(set, bangles, mk({ owner: 'b', name: 'Kara', ug: C.parseWeight('2', 'tola').ug, place: 'Bank locker' }), mk({ owner: 'b', name: 'Old chain', ug: 5000000, status: 'sold', out: { d: '2026-01-02', amt: 9000000, to: '' } }));
    const g = C.byPerson(st);
    eq(g.map(x => [x.person.name, x.list.length]), [['Ayesha', 2], ['Ammi', 1]], 'by person, sold pieces left out');
    eq(C.sums(C.have(st), st.rates).value, 240625000 + 64166700, 'whole family');
    eq(C.byPlace(st).map(x => [x.place, x.list.length]), [['Place not written', 2], ['Bank locker', 1]], 'by place');
    eq(C.change(st), null, 'no change without an earlier rate');
    st.prev = Object.assign({}, rates, { d: '2026-10-20', gold: 34000000 });
    eq(C.change(st).diff, C.sums(C.have(st), st.rates).value - C.sums(C.have(st), st.prev).value, 'change since the last rate');
    eq(C.change(st).diff > 0, true, 'gold went up');
    eq(C.rateAge(st, '2026-11-08'), 10, 'rate is 10 days old');
    eq(C.allText(st, '2026-10-29').includes('Ayesha: 2 pieces'), true, 'text for the family');
    eq(C.allText(st, '2026-10-29').includes('Old chain'), false, 'sold pieces not in the list');
    eq(C.placeText(C.byPlace(st)[1], st).includes('[ ] Kara (Ammi)'), true, 'locker checklist');
    eq(C.csv(st).split('\r\n')[0].startsWith('Person,Piece'), true, 'CSV header');
    eq(C.csv(mk && st).includes('Sold'), true, 'CSV has sold pieces');
    eq(C.csv(Object.assign({}, st, { pieces: [mk({ name: '=SUM(A1)', ug: 1000 })] })).includes("'=SUM"), true, 'CSV formula guard');
    // saved state is checked
    const round = C.cleanState(JSON.parse(JSON.stringify(st)));
    eq(round.pieces.length, 4, 'state survives a round trip');
    eq(round.rates.gold, 35000000, 'rate kept');
    eq(C.cleanState(null), null, 'null state');
    eq(C.cleanState({ pieces: 'x', people: [] }), null, 'bad pieces');
    const bad = C.cleanState({ people: [{ id: 'a', name: 'A' }, { id: 'b', name: 'a' }, { id: '!', name: 'X' }], pieces: [
        mk({ ug: -5 }), mk({ k: 30, ug: 1000 }), mk({ owner: 'zz', ug: 1000 }), mk({ ug: 1000, stoneUg: 5000 }), mk({ name: '', ug: 1000 }), mk({ metal: 'silver', fine: 2000, ug: 1000 })], rates: { unit: 'kg', gold: -1 } });
    eq(bad.people.map(p => p.name), ['A'], 'duplicate and bad people dropped');
    eq(bad.pieces.length, 1, 'bad pieces dropped');
    eq(bad.pieces[0].stoneUg, 0, 'stones heavier than the piece dropped');
    eq([bad.rates.unit, bad.rates.gold], ['tola', null], 'bad rates dropped');
    const long = C.cleanState({ people: [{ id: 'a', name: 'x'.repeat(300) }], pieces: [mk({ name: 'y'.repeat(500), ug: 1000, note: 'z\n\n\n\nw' })] });
    eq([long.people[0].name.length, long.pieces[0].name.length, long.pieces[0].note], [40, 80, 'z\n\nw'], 'long text cut');
    const pr = C.emptyState(); pr.people = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]; pr.pieces = [mk({ owner: 'a', ug: 1 })];
    C.prunePeople(pr); eq(pr.people.map(p => p.id), ['a'], 'person with no pieces dropped');

    const msg = pass + ' passed, ' + failN + ' failed' + (out.length ? '\n' + out.join('\n') : '');
    if (typeof document !== 'undefined') document.getElementById('out').textContent = msg; else { console.log(msg); if (failN) process.exit(1); }
})();
