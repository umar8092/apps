// Checks for the scheduling and text maths in core.js. Run: node tests.js  (or open test.html in a browser)
(function (root) {
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.CardCore;
    let pass = 0, failed = 0;
    const out = [];
    function eq(got, want, what) {
        const g = JSON.stringify(got), w = JSON.stringify(want);
        if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); }
    }
    const T = C.dayOfISO('2026-10-16');
    const S = (ivl, ease = 2500, reps = 3, lapses = 0) => ({ reps, ivl, due: T, ease, lapses });

    // ---- days
    eq(T, 20742, '16 Oct 2026 day number');
    eq(C.isoOf(T), '2026-10-16', 'and back');
    eq(C.dayOfDate(new Date(2026, 9, 16, 10, 0)), T, '10 am is that day');
    eq(C.dayOfDate(new Date(2026, 9, 17, 1, 30)), T, '1:30 am the next night still counts for the evening before');
    eq(C.dayOfDate(new Date(2026, 9, 17, 4, 0)), T + 1, 'a new day starts at 4 am');
    eq(C.dayOfDate(new Date(2027, 0, 1, 2, 0)), C.dayOfISO('2026-12-31'), 'new year night');
    eq(C.dayOfISO('2026-02-29'), null, 'no 29 Feb 2026');
    eq(C.dayOfISO(''), null, 'blank date');
    eq(C.fmtDay(T), 'Fri 16 Oct', 'format');
    eq(C.fmtDay(T, { year: true }), 'Fri 16 Oct 2026', 'format with year');
    eq([0, 1, 3, 29, 30, 45, 364, 365, 400, 3650].map(C.fmtIvl), ['today', '1 day', '3 days', '29 days', '1 month', '1 month', '12 months', '1 year', '1.1 years', '10 years'], 'interval words');
    eq(C.whenDue(T - 3, T), 'Due today', 'overdue says due today');
    eq(C.whenDue(T + 1, T), 'Due tomorrow', 'tomorrow');
    eq(C.whenDue(T + 8, T), 'Due in 8 days (Sat 24 Oct)', 'in 8 days');

    // ---- answering a new card
    const n = C.newSched();
    eq(C.answer(n, 1, T).requeue, 3, 'new + Again: back in 3 cards');
    eq(C.answer(n, 1, T).s.due, T, 'new + Again: still due today');
    eq(C.answer(n, 1, T).s.reps, 1, 'new + Again: no longer new');
    eq(C.answer(n, 2, T).requeue, 6, 'new + Hard: later today');
    eq(C.answer(n, 3, T).s.ivl, 1, 'new + Good: tomorrow');
    eq(C.answer(n, 3, T).s.due, T + 1, 'new + Good: due tomorrow');
    eq(C.answer(n, 4, T).s.ivl, 4, 'new + Easy: 4 days');
    eq(C.preview(n, T), ['again soon', 'later today', '1 day', '4 days'], 'new card button labels');

    // ---- answering a card seen before (hand-worked: ease 2.5)
    eq([2, 3, 4].map(g => C.answer(S(1), g, T).s.ivl), [2, 3, 4], 'interval 1: Hard 2, Good max(2+1, 1x2.5=3)=3, Easy 4');
    eq([2, 3, 4].map(g => C.answer(S(3), g, T).s.ivl), [4, 8, 10], 'interval 3: Hard 3x1.2=4, Good 3x2.5=7.5->8, Easy 9.75->10');
    eq([2, 3, 4].map(g => C.answer(S(10), g, T).s.ivl), [12, 25, 33], 'interval 10: 12, 25, 32.5->33');
    eq(C.answer(S(10), 2, T).s.ease, 2350, 'Hard lowers ease by 0.15');
    eq(C.answer(S(10), 4, T).s.ease, 2650, 'Easy raises ease by 0.15');
    eq(C.answer(S(10), 3, T).s.ease, 2500, 'Good keeps ease');
    const lapse = C.answer(S(10), 1, T);
    eq([lapse.s.ivl, lapse.s.lapses, lapse.s.ease, lapse.requeue, lapse.s.due], [0, 1, 2300, 3, T], 'forgotten: learnt again today, ease -0.2');
    eq(C.answer(lapse.s, 3, T).s.ivl, 1, 'after forgetting, Good gives tomorrow');
    eq(C.answer(S(10, 1300), 1, T).s.ease, 1300, 'ease never below 1.3');
    eq(C.answer(S(10, 4000), 4, T).s.ease, 4000, 'ease never above 4.0');
    eq([2, 3, 4].map(g => C.answer(S(3, 1300), g, T).s.ivl), [4, 5, 6], 'low ease still keeps Hard < Good < Easy');
    eq(C.answer(S(3000), 4, T).s.ivl, 3650, 'never more than 10 years');
    eq(C.preview(S(3), T), ['again soon', '4 days', '8 days', '10 days'], 'review button labels');

    // ---- exam date
    eq(C.answer(S(10), 3, T, T + 10).s.due, T + 9, 'exam in 10 days: back by the day before');
    eq(C.answer(S(10), 3, T, T + 10).s.ivl, 9, 'and the interval is the real gap');
    eq(C.answer(S(10), 3, T, T + 1).s.due, T + 1, 'exam tomorrow: no sooner than tomorrow');
    eq(C.answer(S(1), 3, T, T + 30).s.ivl, 3, 'short intervals not touched by a far exam');
    eq(C.answer(S(10), 3, T, T).s.ivl, 25, 'exam today: no cap');
    eq(C.answer(S(10), 3, T, T - 5).s.ivl, 25, 'exam passed: no cap');
    eq(C.preview(S(10), T, T + 6), ['again soon', '5 days', '5 days', '5 days'], 'labels show the exam cap');

    // ---- counts, queue and plan
    const mk = (id, s) => ({ id, f: 'F' + id, b: 'B' + id, s: s || C.newSched(), r: null });
    const deck = { id: 'd1', name: 'Bio', newPerDay: 3, reverse: false, exam: null, newDay: 0, newCount: 0, extra: 0,
        cards: [mk('a', S(3)), mk('b', Object.assign(S(5), { due: T - 2 })), mk('c', Object.assign(S(20), { due: T + 1 })), mk('d', Object.assign(S(8), { due: T + 5 })), mk('e'), mk('f'), mk('g'), mk('h'), mk('i')] };
    const cnt = C.deckCounts(deck, T);
    eq([cnt.due, cnt.newToday, cnt.total, cnt.newLeft, cnt.learning, cnt.known, cnt.tomorrow, cnt.week], [2, 3, 5, 5, 2, 2, 1, 2], 'deck counts');
    eq(C.buildQueue([deck], T).map(q => q.card), ['b', 'a', 'e', 'f', 'g'], 'queue: most overdue first, then 3 new');
    deck.newDay = T; deck.newCount = 2;
    eq(C.deckCounts(deck, T).newToday, 1, '2 new already started today: 1 left');
    eq(C.deckCounts(deck, T + 1).newToday, 3, 'next day the new allowance is back');
    deck.extra = 10;
    eq(C.deckCounts(deck, T).newToday, 5, 'learn more today: up to all 5 new');
    deck.newDay = 0; deck.newCount = 0; deck.extra = 0;
    eq(C.plan(deck, T), { left: 5, per: 3, finish: T + 1, fits: true, need: 0, examIn: null }, '5 new at 3 a day: all started tomorrow');
    deck.exam = T + 1;
    eq(C.plan(deck, T).fits, false, 'exam tomorrow and new cards left for tomorrow: does not fit');
    eq(C.plan(deck, T).need, 5, 'need 5 a day');
    deck.exam = T + 5;
    eq([C.plan(deck, T).fits, C.plan(deck, T).examIn], [true, 5], 'exam in 5 days fits');
    deck.newPerDay = 0;
    eq([C.plan(deck, T).finish, C.plan(deck, T).fits, C.plan(deck, T).need], [null, false, 1], 'new cards paused before an exam');
    deck.newPerDay = 3; deck.exam = null;
    deck.reverse = true;
    const rc = C.deckCounts(deck, T);
    eq([rc.items, rc.newLeft], [18, 14], 'back to front doubles the questions (5 new fronts + 9 new backs)');
    const q = C.buildQueue([deck], T);
    eq(q.length, 5, 'reverse: still one side per card in a session');
    eq(rc.total, q.length, 'reverse: the count shown matches the session');
    eq(new Set(q.map(x => x.card)).size, q.length, 'no card twice in one session');
    deck.reverse = false;
    eq(C.buildQueue([], T), [], 'no decks: empty queue');
    eq(C.deckCounts({ id: 'x', newPerDay: 20, cards: [], newDay: 0, newCount: 0, extra: 0 }, T).total, 0, 'empty deck: nothing due');

    // ---- streak
    eq(C.streak({}, T), { days: 0, today: false }, 'no study yet');
    eq(C.streak({ [T]: 5, [T - 1]: 3, [T - 2]: 1, [T - 4]: 9 }, T), { days: 3, today: true }, '3 days in a row');
    eq(C.streak({ [T - 1]: 3, [T - 2]: 1 }, T), { days: 2, today: false }, 'not yet today: streak kept until tonight');
    eq(C.streak({ [T - 2]: 3 }, T), { days: 0, today: false }, 'missed yesterday: streak over');

    // ---- pasting cards
    const p = C.parsePaste('der Hund - the dog\ndie Katze\t the cat\nhaus = house\nApfel; apple\nH2O: water\n\nmitochondria\nBerlin, Germany\n - nothing\nder Hund - the dog\nDER HUND - The Dog\n"Paris, France","capital, of France"\nsehr gut – very good\n', 'auto');
    eq(p.cards.map(c => c.f + '|' + c.b), ['der Hund|the dog', 'die Katze|the cat', 'haus|house', 'Apfel|apple', 'H2O|water', 'Berlin|Germany', 'Paris, France|capital, of France', 'sehr gut|very good'], 'auto separators');
    eq(p.noSep.map(x => x.line), [7], 'line without separator reported with its line number');
    eq(p.empty.map(x => x.line), [9], 'missing front reported');
    eq(p.dup.map(x => x.line), [10, 11], 'duplicates (any case) skipped');
    eq(C.parsePaste('a - b - c', 'auto').cards[0], { f: 'a', b: 'b - c' }, 'only the first dash splits');
    eq(C.parsePaste('well-known - famous', 'auto').cards[0], { f: 'well-known', b: 'famous' }, 'hyphen inside a word is not a separator');
    eq(C.parsePaste('3 + 4 = 7, prime', 'comma').cards[0], { f: '3 + 4 = 7', b: 'prime' }, 'chosen separator wins');
    eq(C.parsePaste('a: b', 'tab').noSep.length, 1, 'chosen tab, none in line');
    eq(C.parsePaste('x - y', 'auto', [{ f: 'X', b: 'Y ' }]).dup.length, 1, 'already in the deck');
    eq(C.parsePaste('', 'auto').cards, [], 'blank paste');
    eq(C.parsePaste('a\r\nb - c\r\n', 'auto').cards.length, 1, 'Windows line ends');
    eq(C.parsePaste('a' + 'x'.repeat(1000) + ' - b', 'auto').tooLong.length, 1, 'over 1000 characters refused');
    eq(C.parsePaste('  lots   of   space  -  here ', 'auto').cards[0], { f: 'lots of space', b: 'here' }, 'spaces tidied');

    // ---- export
    const ex = { cards: [{ f: 'a "quote"', b: '=SUM(1)' }, { f: 'tab\there', b: 'x' }] };
    eq(C.toCSV(ex), 'Front,Back\r\n"a ""quote""","\'=SUM(1)"\r\n"tab\there","x"\r\n', 'CSV quoted, formulas guarded');
    eq(C.toText(ex), 'a "quote"\t=SUM(1)\ntab here\tx', 'text for pasting elsewhere');
    eq(C.parsePaste(C.toText({ cards: [{ f: 'one - two', b: 'three' }] }), 'auto').cards[0], { f: 'one - two', b: 'three' }, 'copied text pastes back the same (tab wins)');

    // ---- saved data
    eq(C.normalize(null).decks, [], 'nothing saved');
    eq(C.normalize({ decks: 'x' }).decks, [], 'broken decks');
    const nd = C.normalize({ decks: [{ id: 'd1', name: '  <b>Bio</b> ', newPerDay: -3, exam: 'soon', cards: [{ id: 'c1', f: 'a', b: '' }, { id: 'c1', f: 'x', b: 'y', s: { reps: 2, ivl: 99999, due: 'x', ease: 99 } }, null] }, null], log: { [T]: 4, foo: 1, [T - 1]: -2 } });
    eq(nd.decks.length, 1, 'bad deck dropped');
    eq(nd.decks[0].name, '<b>Bio</b>', 'name kept as plain text');
    eq([nd.decks[0].newPerDay, nd.decks[0].exam], [20, null], 'bad settings reset');
    eq(nd.decks[0].cards.length, 1, 'card with no back dropped');
    eq(nd.decks[0].cards[0].s, { reps: 2, ivl: 0, due: 0, ease: 2500, lapses: 0 }, 'bad schedule values reset');
    eq(nd.log, { [T]: 4 }, 'bad log entries dropped');
    eq(nd.decks[0].cards[0].id !== 'c1' || nd.decks[0].id !== 'c1', true, 'ids stay unique');
    eq(C.normalize({ decks: [{ name: '', cards: [] }] }).decks[0].name, 'My deck', 'blank name');

    const result = { pass, failed, out: out.concat(['', pass + ' passed, ' + failed + ' failed']) };
    if (typeof module !== 'undefined' && module.exports) { console.log(result.out.join('\n')); process.exit(failed ? 1 : 0); } else root.testResult = result;
})(this);
