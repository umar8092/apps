// Logic checks for core.js. Run: node tests.js (or open test.html)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.GIFTS;
    let pass = 0, fail = 0; const out = [];
    const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; out.push((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want))); };
    const T = '2026-10-29', fm = c => C.fmtMoney(c, '', 'en-US');

    // typed money
    const m = s => C.parseOptMoney(s);
    eq('blank price is no price', m('').n, null); eq('spaces only', m('   ').n, null);
    eq('4500', m('4500').n, 450000); eq('4,500', m('4,500').n, 450000); eq('1,00,000 (lakh)', m('1,00,000').n, 10000000); eq('Rs 23.5', m('Rs 23.5').n, 2350);
    eq('0 is allowed (free gift)', m('0').n, 0); eq('minus refused', !!m('-5').error, true); eq('words refused', !!m('cheap').error, true);
    eq('1.234 is one thousand two hundred thirty-four', m('1.234').n, 123400); eq('3 decimals refused', !!m('0.345').error, true); eq('huge refused', !!m('999999999999999').error, true);

    // text and links
    eq('name tidy', C.cleanText('  Sana \n  baji ', 40), 'Sana baji'); eq('name cut at 40', C.cleanText('x'.repeat(90), 40).length, 40);
    eq('note keeps lines', C.cleanNote('a\r\n\r\n\r\n\r\nb  ', 500), 'a\n\nb');
    eq('link without https', C.cleanLink('daraz.pk/item/123'), 'https://daraz.pk/item/123');
    eq('link https kept', C.cleanLink('https://www.amazon.co.uk/dp/B0?x=1'), 'https://www.amazon.co.uk/dp/B0?x=1');
    eq('javascript link refused', C.cleanLink('javascript:alert(1)'), null); eq('data link refused', C.cleanLink('data:text/html,hi'), null);
    eq('not a link refused', C.cleanLink('the blue one'), null); eq('blank link', C.cleanLink(''), '');
    eq('link host', C.linkHost('https://www.amazon.co.uk/dp/B0'), 'amazon.co.uk');

    // dates
    eq('isDate 31 Apr', C.isDate('2026-04-31'), false); eq('isDate 29 Feb 2028', C.isDate('2028-02-29'), true);
    eq('valid 31 Apr', C.validDM(31, 4), false); eq('valid 29 Feb', C.validDM(29, 2), true); eq('valid 30 Feb', C.validDM(30, 2), false);
    const bday = { id: 'o1', name: 'Birthday', kind: 'yearly', d: 16, m: 11, budget: 600000 };
    eq('birthday next', C.next(bday, T), { d: '2026-11-16', days: 18, past: false });
    eq('birthday today', C.next(bday, '2026-11-16'), { d: '2026-11-16', days: 0, past: false });
    eq('birthday the day after rolls to next year', C.next(bday, '2026-11-17').d, '2027-11-16');
    eq('new year crossing', C.next({ kind: 'yearly', d: 2, m: 1 }, '2026-12-30'), { d: '2027-01-02', days: 3, past: false });
    eq('29 Feb in 2027 falls on 28 Feb', C.next({ kind: 'yearly', d: 29, m: 2 }, T).d, '2027-02-28');
    eq('29 Feb in 2028 stays', C.next({ kind: 'yearly', d: 29, m: 2 }, '2027-03-01').d, '2028-02-29');
    const eid = { id: 'o2', name: 'Eid ul-Fitr', kind: 'once', date: '2027-03-10', budget: null };
    eq('one time ahead', C.next(eid, T), { d: '2027-03-10', days: 132, past: false });
    eq('one time passed', C.next(eid, '2027-03-11').past, true);
    eq('no date', C.next({ kind: 'none' }, T), null);
    eq('when words', [C.whenWords(bday, T), C.whenWords(eid, '2027-03-11'), C.whenWords({ kind: 'none' }, T)], ['Mon 16 Nov (in 18 days)', 'Was on Wed 10 Mar', 'No date yet']);
    eq('when tomorrow', C.whenWords(bday, '2026-11-15'), 'Sun 15 Nov'.replace('Sun 15 Nov', 'Mon 16 Nov (tomorrow)'));
    eq('repeat words', [C.repeatWords(bday), C.repeatWords(eid)], ['Every year on 16 November', 'One time']);
    eq('cycle start: the day after last year\'s birthday', C.cycleStart(bday, T), '2025-11-17');
    eq('cycle start on the day itself', C.cycleStart(bday, '2026-11-16'), '2025-11-17');
    eq('cycle start the day after', C.cycleStart(bday, '2026-11-17'), '2026-11-17');

    // the main situation: Hina on Thu 29 Oct 2026
    const I = (id, what, st, x) => Object.assign({ id, what, st, price: null, paid: null, occ: '', where: '', link: '', note: '' }, x || {});
    const sana = { id: 'p1', name: 'Sana', likes: 'Size M. Loves green.', occ: [bday, eid], ideas: [
        I('g1', 'Rose perfume', 'bought', { price: 450000, paid: 420000, occ: 'o1', bd: '2026-10-20', keep: 'Top of the wardrobe' }),
        I('g2', 'Silk scarf', 'idea', { price: 250000, occ: 'o1', where: 'Khaadi' }),
        I('g3', 'Book: The Forty Rules of Love', 'idea', { occ: '' }),
        I('g4', 'Perfume', 'given', { paid: 380000, gd: '2025-11-16', go: 'o1', gon: 'Birthday', bd: '2025-11-10' }),
        I('g5', 'Scarf', 'given', { paid: 150000, gd: '2024-11-16', go: 'o1', gon: 'Birthday', bd: '2024-11-01' })] };
    const mum = { id: 'p2', name: 'Mum', likes: '', occ: [{ id: 'o3', name: 'Anniversary', kind: 'yearly', d: 6, m: 11, budget: null }], ideas: [] };
    const ali = { id: 'p3', name: 'Ali', likes: '', occ: [], ideas: [I('g6', 'Cricket bat', 'idea', { price: 900000 })] };
    const people = [ali, sana, mum];

    let st = C.occStats(sana, bday, T);
    eq('Sana birthday: 1 bought, 1 idea, 4,200 spent of 6,000, 1,800 left', [st.bought, st.ideas, st.given, st.spent, st.left, st.over], [1, 1, 0, 420000, 180000, 0]);
    eq('last year\'s gift is not in this year\'s budget', st.given, 0);
    eq('budget words', C.budgetWords(st, fm), '4,200 spent of 6,000: 1,800 left');
    eq('gift words', C.giftWords(st), '1 bought, 1 idea');
    const over = Object.assign({}, bday, { budget: 400000 });
    eq('over budget', C.budgetWords(C.occStats(sana, over, T), fm), '4,200 spent of 4,000: 200 over budget');
    eq('no budget, money spent', C.budgetWords(C.occStats(sana, Object.assign({}, bday, { budget: null }), T), fm), '4,200 spent');
    eq('nothing at all', C.giftWords(C.occStats(mum, mum.occ[0], T)), 'No gift ideas yet');
    // a gift given early (before the birthday) still counts for this birthday
    const early = { id: 'p9', name: 'E', occ: [bday], ideas: [I('x', 'Watch', 'given', { paid: 500000, gd: '2026-10-28', go: 'o1', bd: '2026-10-01' })] };
    eq('given early counts against this year', C.occStats(early, bday, T).spent, 500000);
    eq('a bought gift with only a rough price counts the rough price', C.occStats({ occ: [bday], ideas: [I('y', 'Ring', 'bought', { price: 99999, occ: 'o1', bd: T })] }, bday, T).spent, 99999);

    eq('next for Sana', C.personNext(sana, T).o.name, 'Birthday');
    eq('Ali has no dated day', C.personNext(ali, T), null);
    eq('people order: soonest first, no date last', C.orderPeople(people, T).map(p => p.name), ['Mum', 'Sana', 'Ali']);
    const up = C.upcoming(people, T, 60, 3);
    eq('upcoming: Mum 6 Nov, Sana 16 Nov, then Eid (outside 60 days but at least 3 shown)', up.map(r => r.p.name + ' ' + r.o.name + ' ' + r.days), ['Mum Anniversary 8', 'Sana Birthday 18', 'Sana Eid ul-Fitr 132']);
    eq('upcoming without min', C.upcoming(people, T, 60, 0).length, 2);
    eq('given before: "perfume" matches "Perfume"', C.givenBefore(sana, 'perfume').map(i => i.id), ['g4']);
    eq('given before: "Dior perfume 50ml" matches by word', C.givenBefore(sana, 'Dior perfume 50ml').map(i => i.id), ['g4']);
    eq('given before: "Rose perfume" also matches', C.givenBefore(sana, 'Rose perfume').length, 1);
    eq('given before: "Silk scarf" matches the 2024 scarf', C.givenBefore(sana, 'Silk scarf').map(i => i.id), ['g5']);
    eq('given before: short words do not match', C.givenBefore(sana, 'a b').length, 0);
    eq('given before: unrelated', C.givenBefore(sana, 'Handbag').length, 0);
    eq('given when', C.givenWhen(sana.ideas[3]), 'Birthday 2025');
    eq('given sorted newest first', C.givenIdeas(sana).map(i => i.id), ['g4', 'g5']);
    eq('spent in 2026', C.spentInYear(people, 2026), { total: 420000, count: 1 });
    eq('spent in 2025', C.spentInYear(people, 2025), { total: 380000, count: 1 });

    const txt = C.personText(sana, T, 'Rs', 'en-US');
    eq('person text', txt, ['Sana', 'Birthday: Mon 16 Nov (in 18 days), budget Rs 6,000', 'Eid ul-Fitr: Wed 10 Mar 2027 (in 132 days)', 'About them: Size M. Loves green.',
        'Bought, not given yet:', '- Rose perfume, Rs 4,200, for Birthday (kept: Top of the wardrobe)', 'Gift ideas:', '- Silk scarf, Rs 2,500, for Birthday, from Khaadi', '- Book: The Forty Rules of Love',
        'Already given: Perfume (Birthday 2025), Scarf (Birthday 2024)'].join('\n'));
    const sum = C.summaryText({ cur: '', people }, T, 'en-US');
    eq('summary starts', sum.split('\n').slice(0, 6), ['Gift ideas: Thu 29 Oct 2026', '', 'Coming up:', '- Mum, Anniversary: Fri 6 Nov (in 8 days), no gift ideas yet',
        '- Sana, Birthday: Mon 16 Nov (in 18 days), 1 bought, 1 idea', '- Sana, Eid ul-Fitr: Wed 10 Mar 2027 (in 132 days), no gift ideas yet']);
    eq('summary has every person', ['Mum', 'Sana', 'Ali'].every(n => sum.includes('\n' + n + '\n')), true);
    eq('empty summary', C.summaryText({ cur: '', people: [] }, T, 'en-US').includes('No one on the list yet.'), true);

    // calendar file
    const cal = C.ics(people, T, '20261029T100000Z');
    eq('calendar has 3 dated days', cal.count, 3);
    eq('calendar yearly rule and week reminder', [cal.text.includes('RRULE:FREQ=YEARLY'), cal.text.includes('TRIGGER:-P7D'), cal.text.includes('DTSTART;VALUE=DATE:20261116')], [true, true, true]);
    eq('calendar escapes commas', C.ics([{ id: 'a', name: 'Ali, Sara', occ: [bday], ideas: [] }], T, 'x').text.includes('SUMMARY:Ali\\, Sara: Birthday'), true);
    eq('29 Feb repeats on the last day of February', C.ics([{ id: 'a', name: 'L', occ: [{ id: 'z', name: 'Birthday', kind: 'yearly', d: 29, m: 2 }], ideas: [] }], T, 'x').text.includes('BYMONTHDAY=-1'), true);
    eq('passed one-time days are left out', C.ics([{ id: 'a', name: 'L', occ: [eid], ideas: [] }], '2027-04-01', 'x').count, 0);

    // saved data checks
    eq('clean empty', C.cleanState({ people: [] }), { v: 1, cur: '', people: [] });
    eq('junk is refused', [C.cleanState(null), C.cleanState('x'), C.cleanState({}), C.cleanState({ people: 'no' })], [null, null, null, null]);
    const dirty = { cur: '<b>', people: [{ id: 'a', name: '  Sana  ', occ: [{ id: 'o', name: 'B', kind: 'yearly', d: 31, m: 4 }, { id: 'o2', name: 'E', kind: 'once', date: '2026-13-01' }, bday],
        ideas: [I('i1', 'X', 'idea', { price: -5 }), I('i2', '', 'idea'), I('i3', 'Ok', 'idea', { occ: 'gone', link: 'javascript:alert(1)', photo: 'data:text/html;base64,AAA' }), I('i4', 'B', 'bought'), I('i5', 'G', 'given', { gd: 'x' })] },
        { id: 'a', name: 'dupe' }, { id: 'bad id!', name: 'x' }, { id: 'b', name: '' }] };
    const cl = C.cleanState(dirty);
    eq('bad currency dropped', cl.cur, '');
    eq('one valid person, name tidied', cl.people.map(p => p.name), ['Sana']);
    eq('bad occasions dropped', cl.people[0].occ.map(o => o.id), ['o1']);
    eq('bad ideas dropped, unknown occasion cleared, bad link and photo removed', cl.people[0].ideas, [{ id: 'i3', what: 'Ok', st: 'idea', price: null, paid: null, occ: '', where: '', link: '', note: '', added: null }]);
    eq('round trip keeps the main situation', JSON.stringify(C.cleanState(JSON.parse(JSON.stringify({ cur: 'Rs', people })))).length > 500, true);
    eq('round trip given gift', C.cleanState({ people: [sana] }).people[0].ideas[3].gon, 'Birthday');
    eq('money format', [fm(450000), fm(2350), C.fmtMoney(450000, 'Rs', 'en-US'), C.fmtMoney(450000, '$', 'en-US'), fm(0)], ['4,500', '23.50', 'Rs 4,500', '$4,500', '0']);

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n') + '\n\n' + summary;
    else { out.filter(l => l.startsWith('FAIL')).forEach(l => console.log(l)); console.log(summary); if (fail) process.exitCode = 1; }
})();
