// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const W = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.WGR;
    let pass = 0, fail = 0; const out = [];
    // amounts keep their symbol with a no-break space (Rs\u00a05,000); compare as plain spaces
    const eq = (name, got, want) => { const ok = JSON.stringify(got).replace(/\\u00a0|\u00a0/g, ' ') === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const L = 'en-GB';
    const c = s => W.parseAmount(s).cents, err = s => !!W.parseAmount(s).error;

    // typed amounts (envelopes are often written 5000, 5,000 or 1,00,000)
    eq('5000', c('5000'), 500000); eq('5,000', c('5,000'), 500000); eq('1,00,000 lakh', c('1,00,000'), 10000000); eq('Rs 1500', c('Rs 1500'), 150000);
    eq('12.50', c('12.50'), 1250); eq('12,50 comma decimal', c('12,50'), 1250); eq('pasted nbsp', c('2 500'), 250000); eq('$40', c('$40'), 4000);
    eq('blank', err(''), true); eq('zero', err('0'), true); eq('negative', err('-500'), true); eq('negative words', W.parseAmount('-5').error, 'Type the amount without a minus sign.');
    eq('words', err('five thousand'), true); eq('3 decimals', err('0.505'), true); eq('max', c('9999999999.99'), 999999999999); eq('too big', err('10000000000'), true);

    // formatting: lakh grouping for rupees
    eq('Rs lakh', W.fmt(34500000, 'Rs', W.localeFor('Rs', L)), 'Rs 3,45,000'); eq('₹ lakh', W.fmt(10000000, '₹', W.localeFor('₹', L)), '₹1,00,000');
    eq('$ thousands', W.fmt(34500000, '$', W.localeFor('$', 'en-US')), '$345,000'); eq('plain', W.fmt(500000, '', L), '5,000'); eq('cents', W.fmt(2550, '', L), '25.50');
    eq('localeFor none keeps reader locale', W.localeFor('', 'de-DE'), 'de-DE');

    // dates
    eq('isDay ok', W.isDay('2024-02-29'), true); eq('isDay bad', W.isDay('2023-02-29'), false); eq('isDay junk', W.isDay('12/03/2024'), false); eq('nice date', W.niceDate('2024-03-12', L), '12 Mar 2024');

    // the README situation
    let st = W.emptyState(); st.cur = 'Rs';
    st.families = [
        { id: 'f1', name: 'Ahmed Khan', relation: 'cousin', city: 'Lahore' },
        { id: 'f2', name: 'Ahmed Khan', relation: '', city: 'Karachi' },
        { id: 'f3', name: 'Fatima Aunty', relation: 'neighbour', city: '' },
        { id: 'f4', name: 'Rizwan', relation: '', city: '' }];
    st.events = [{ id: 'e1', name: "Sara's wedding" }, { id: 'e2', name: "Omar's aqiqah" }];
    let q = 0; const g = (fam, dir, event, amount, date, item, note) => ({ id: 'g' + (++q), fam, dir, event, amount: amount * 100, item: item || '', date, note: note || '', seq: q });
    st.gifts = [g('f1', 'out', "Bilal's wedding", 3000, '2022-11-05'), g('f1', 'in', 'e1', 5000, '2024-03-12'),
        g('f2', 'in', 'e1', 2000, '2024-03-12', 'gold ring'), g('f3', 'in', 'e1', 0, '2024-03-12', 'two suits'),
        g('f4', 'in', 'e2', 1000, '2025-06-01'), g('f4', 'out', 'their housewarming', 1000, '2025-09-01'),
        g('f4', 'in', 'e1', 1500, '2024-03-12', '', 'sent with his brother')];
    st.seq = q;
    st = W.normalize(st);
    eq('normalize keeps everything', [st.families.length, st.events.length, st.gifts.length], [4, 2, 7]);

    // which family? same name in two cities
    eq('find by label', W.findFamily(st, 'Ahmed Khan (Lahore)').fam.id, 'f1');
    eq('find by name + city field', W.findFamily(st, 'ahmed khan', 'karachi').fam.id, 'f2');
    eq('find ambiguous name', W.findFamily(st, 'Ahmed Khan').many.length, 2);
    eq('find unique name ignores case and spaces', W.findFamily(st, '  fatima   aunty ').fam.id, 'f3');
    eq('find new', W.findFamily(st, 'Zainab').none, true); eq('find blank', W.findFamily(st, '  ').none, true);
    eq('find with unknown city is new', W.findFamily(st, 'Ahmed Khan', 'Multan').none, true);

    // family boxes: the "when they invite you" answer
    let l = W.familyLines(st, st.families[0], L);
    eq('Ahmed Lahore gave', l.gave, "Gave you: Rs 5,000 at Sara's wedding, 12 Mar 2024");
    eq('Ahmed Lahore you gave', l.you, "You gave them: Rs 3,000 at Bilal's wedding, 5 Nov 2022");
    eq('Ahmed Lahore balance', [l.bal, l.tone], ['They have given you Rs 2,000 more than you gave them.', 'owe']);
    l = W.familyLines(st, st.families[1], L);
    eq('Ahmed Karachi cash and kind', l.gave, "Gave you: Rs 2,000 and gold ring at Sara's wedding, 12 Mar 2024");
    eq('Ahmed Karachi nothing given yet', l.you, 'You gave them: nothing yet');
    eq('kind not counted note', l.bal, 'They have given you Rs 2,000 more than you gave them. Gifts in kind are not counted in this.');
    l = W.familyLines(st, st.families[2], L);
    eq('kind only', [l.gave, l.bal, l.tone], ["Gave you: two suits at Sara's wedding, 12 Mar 2024", 'Gifts in kind only, no cash.', 'even']);
    l = W.familyLines(st, st.families[3], L);
    eq('two gifts in, summed', l.gave, "Gave you: Rs 2,500 in all (2 gifts, last Rs 1,000 at Omar's aqiqah, 1 Jun 2025)");
    eq('they gave more after two gifts (2,500 in, 1,000 out)', [l.bal, l.tone], ['They have given you Rs 1,500 more than you gave them.', 'owe']);
    st.gifts.push(g('f4', 'out', 'their son’s wedding', 1500, '2026-01-10'));
    l = W.familyLines(st, st.families[3], L);
    eq('even', [l.bal, l.tone], ['Even: you have each given Rs 2,500.', 'even']);
    st.gifts.push(g('f4', 'out', 'their daughter\u2019s wedding', 1000, '2026-05-10'));
    l = W.familyLines(st, st.families[3], L);
    eq('we gave more', [l.bal, l.tone], ['You have given them Rs 1,000 more than they gave you.', 'ahead']);
    st.gifts.pop(); st.gifts.pop();
    eq('no gifts', W.familyLines({ cur: '', gifts: [], events: [] }, { id: 'x', name: 'New' }, L).bal, 'No gifts written down yet.');

    // our events
    eq('Sara wedding words', W.eventWords(st, 'e1', L), 'Received Rs 8,500 from 3 families · 2 gifts in kind');
    eq('Sara wedding summary', (s => [s.total, s.cashFamilies, s.families, s.items, s.date])(W.eventSummary(st, 'e1')), [850000, 3, 4, 2, '2024-03-12']);
    eq('aqiqah words', W.eventWords(st, 'e2', L), 'Received Rs 1,000 from 1 family');
    eq('events newest first', W.eventsByDate(st).map(e => e.id), ['e2', 'e1']);
    eq('empty event', W.eventWords({ cur: '', gifts: [], events: [], guests: [] }, 'zz', L), 'No gifts written down yet');
    eq('totals', (t => [t.received, t.given, t.nIn, t.nOut])(W.totals(st)), [950000, 400000, 5, 2]);

    // copy texts
    eq('event register text', W.eventText(st, 'e1', L), "Gifts received at Sara's wedding (12 Mar 2024)\nReceived Rs 8,500 from 3 families · 2 gifts in kind\n\n1. Ahmed Khan (Karachi): Rs 2,000 and gold ring\n2. Ahmed Khan (Lahore), cousin: Rs 5,000\n3. Fatima Aunty, neighbour: two suits\n4. Rizwan: Rs 1,500 (sent with his brother)");
    const rt = W.registerText(st, L, '2026-10-22').replace(/\u00a0/g, ' ');
    eq('register text top', rt.split('\n').slice(0, 2), ['Gift register, 22 Oct 2026', 'Received in all: Rs 9,500. Given in all: Rs 4,000.']);
    eq('register text family', rt.includes("Ahmed Khan (Lahore), cousin\n  Gave you: Rs 5,000 at Sara's wedding, 12 Mar 2024\n  You gave them: Rs 3,000 at Bilal's wedding, 5 Nov 2022\n  They have given you Rs 2,000 more than you gave them."), true);

    // guest list and headcount
    st.guests = [{ id: 'x1', event: 'e1', fam: 'f1', n: 4, status: 'yes' }, { id: 'x2', event: 'e1', fam: 'f2', n: 3, status: 'wait' },
        { id: 'x3', event: 'e1', fam: 'f3', n: 2, status: 'no' }, { id: 'x4', event: 'e1', fam: 'f4', n: 5, status: 'yes' }, { id: 'x5', event: 'e2', fam: 'f1', n: 2, status: 'wait' }];
    st = W.normalize(st);
    eq('guest counts', (c2 => [c2.all.f, c2.all.p, c2.yes.p, c2.no.f, c2.wait.p, c2.gave])(W.guestSummary(st, 'e1')), [4, 14, 9, 1, 3, 4]);
    eq('guest words', W.guestWords(st, 'e1'), 'Invited 4 families (14 people). Coming: 9 people. No reply yet from 1 family (3 people), so plan for 9 to 12 people.');
    st.guests[1].status = 'yes';
    eq('guest words all replied', W.guestWords(st, 'e1'), 'Invited 4 families (14 people). Coming: 12 people. Everyone has replied, so plan for 12 people.');
    eq('guest words empty', W.guestWords(st, 'zz'), 'Nobody on the guest list yet.');
    eq('guest text', W.guestText(st, 'e1', L).split('\n').slice(3, 7), ['Coming (3 families, 12 people)', '- Ahmed Khan (Karachi): 3 people', '- Ahmed Khan (Lahore): 4 people', '- Rizwan: 5 people']);
    st.guests[1].status = 'wait';

    // sorting and search
    eq('sort name', W.sortFamilies(st, 'name').map(f => f.id), ['f2', 'f1', 'f3', 'f4']);
    eq('sort gave most', W.sortFamilies(st, 'gave').map(f => f.id), ['f1', 'f4', 'f2', 'f3']);
    eq('sort recent (same day: A to Z)', W.sortFamilies(st, 'recent').map(f => f.id), ['f4', 'f2', 'f1', 'f3']);
    eq('search city', st.families.filter(f => W.matches(st, f, 'lahore')).map(f => f.id), ['f1']);
    eq('search two words', st.families.filter(f => W.matches(st, f, 'khan kar')).map(f => f.id), ['f2']);
    eq('search event name', st.families.filter(f => W.matches(st, f, 'aqiqah')).map(f => f.id), ['f4']);
    eq('search blank shows all', st.families.filter(f => W.matches(st, f, '  ')).length, 4);

    // restoring a backup: everything is checked
    eq('normalize junk', W.normalize('{bad'), null); eq('normalize null', W.normalize(null), null); eq('normalize no families', W.normalize({ gifts: [] }), null);
    const bad = W.normalize({ cur: 'XX', sort: 'zzz', families: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }, { id: 'b', name: '  ' }, { id: 'c', name: 'a' }, null, { id: '<x>', name: 'Q' }],
        events: [{ id: 'e', name: 'Party' }, { id: 'e2', name: 'party' }],
        gifts: [{ id: 'g1', fam: 'a', dir: 'in', event: 'e', amount: 100, date: '2024-01-01' }, { id: 'g2', fam: 'zz', dir: 'in', event: 'e', amount: 100, date: '2024-01-01' },
            { id: 'g3', fam: 'a', dir: 'in', event: 'nope', amount: 100, date: '2024-01-01' }, { id: 'g4', fam: 'a', dir: 'out', event: 'x', amount: -5, date: '2024-01-01' },
            { id: 'g5', fam: 'a', dir: 'out', event: 'x', amount: 0, date: '2024-01-01' }, { id: 'g6', fam: 'a', dir: 'out', event: 'x', amount: 1.5, date: '2024-01-01' },
            { id: 'g7', fam: 'a', dir: 'up', event: 'x', amount: 100, date: '2024-01-01' }, { id: 'g8', fam: 'a', dir: 'out', event: 'x', amount: 100, date: '2024-13-01' },
            { id: 'g9', fam: 'a', dir: 'out', event: '', amount: 0, item: 'shawl', date: '2024-02-02' }],
        guests: [{ id: 'h1', event: 'e', fam: 'a', n: 5000, status: 'yes' }, { id: 'h2', event: 'e', fam: 'a', n: 2, status: 'no' }, { id: 'h3', event: 'e', fam: 'a', n: 2, status: 'maybe' }] });
    eq('normalize drops bad rows', [bad.cur, bad.sort, bad.families.map(f => f.id), bad.events.length, bad.gifts.map(x => x.id), bad.guests.map(x => [x.id, x.n])],
        ['', 'name', ['a'], 1, ['g1', 'g9'], [['h1', 1]]]);
    const big = W.emptyState(); for (let i = 0; i < 500; i++) { big.families.push({ id: 'f' + i, name: 'Family ' + i, relation: '', city: '' }); }
    big.events.push({ id: 'e', name: 'Wedding' }); big.families.forEach((f, i) => big.gifts.push({ id: 'g' + i, fam: f.id, dir: 'in', event: 'e', amount: 100000 + i * 100, item: '', date: '2026-10-01', note: '', seq: i }));
    const t0 = Date.now(); const big2 = W.normalize(big); const words = W.eventWords(big2, 'e', L); W.sortFamilies(big2, 'gave');
    eq('500 families total', words, 'Received 6,24,750 from 500 families'.replace('6,24,750', W.fmt(50000000 + 100 * 124750, '', L)));
    eq('500 families fast', Date.now() - t0 < 1500, true);

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = summary + '\n\n' + out.join('\n');
    else { out.filter(x => x.startsWith('FAIL')).forEach(x => console.log(x)); console.log(summary); if (fail) process.exitCode = 1; }
})();
