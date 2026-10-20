// Logic checks for Birthday and Anniversary Reminder List. Run: node tests.js (or open test.html).
(function () {
    'use strict';
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : window.BdayCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (got, want, what) => {
        const ok = JSON.stringify(got) === JSON.stringify(want);
        ok ? pass++ : fail++;
        if (!ok) out.push('FAIL ' + what + '\n   got:  ' + JSON.stringify(got) + '\n   want: ' + JSON.stringify(want));
    };
    const T = '2026-10-20';   // a Tuesday
    const E = (id, name, kind, d, m, y, extra) => Object.assign({ id, name, kind, label: '', d, m, y, feb29: '28', group: '', note: '', wished: '' }, extra || {});

    // ---- words
    eq([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(C.ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th', '112th'], 'ordinals');
    eq(C.shortDate('2026-10-24', T), 'Sat 24 Oct', 'this year: no year shown');
    eq(C.shortDate('2027-01-01', T), 'Fri 1 Jan 2027', 'next year: year shown');

    // ---- the family from the README
    const sara = E(1, 'Sara', 'birthday', 24, 10, 1995);
    const mum = E(2, 'Mum', 'birthday', 20, 10, 1960, { note: 'Likes roses' });
    const dad = E(3, 'Dad', 'birthday', 21, 10, 0);
    const wed = E(4, 'Ali and Sara', 'anniversary', 12, 6, 2015);
    const hina = E(5, 'Hina', 'birthday', 17, 10, 1990);
    const work = E(6, 'Ahmed', 'other', 2, 11, 2021, { label: 'Work anniversary' });
    const leap = E(7, 'Zain', 'birthday', 29, 2, 2000);
    const james = E(8, 'James', 'birthday', 5, 11, 0);
    eq(C.nextOcc(sara, T), { date: '2026-10-24', days: 4, years: 31 }, 'Sara: 4 days, turns 31');
    eq(C.upLine(sara, T), 'Sara turns 31 on Sat 24 Oct (in 4 days)', 'Sara line');
    eq(C.upLine(mum, T), 'Mum turns 66 today', 'birthday today');
    eq(C.upLine(dad, T), "Dad's birthday tomorrow (Wed 21 Oct)", 'no year, tomorrow');
    eq(C.upLine(wed, T), 'Ali and Sara: 12th wedding anniversary on Sat 12 Jun 2027 (in 235 days)', 'anniversary next year (hand count: 11+30+31+31+28+31+30+31+12 = 235)');
    eq(C.upLine(work, T), 'Ahmed: Work anniversary, 5 years on Mon 2 Nov (in 13 days)', 'other kind with years');
    eq(C.upLine(james, T), "James' birthday on Thu 5 Nov (in 16 days)", "name ending in s gets James'");
    eq(C.pastLine(hina, T), 'Hina turned 36 on Sat 17 Oct (3 days ago)', 'just passed');
    eq(C.pastLine(E(9, 'Bo', 'birthday', 19, 10, 0), T), "Bo's birthday was on Mon 19 Oct (yesterday)", 'yesterday, no year');
    eq(C.pastLine(E(9, 'Ali and Sara', 'anniversary', 19, 10, 2020), T), 'Ali and Sara: 6th wedding anniversary was on Mon 19 Oct (yesterday)', 'anniversary passed');
    eq(C.boxLine(sara, T), 'Turns 31 on Sat 24 Oct (in 4 days)', 'box line');
    eq(C.boxLine(wed, T), '12th anniversary on Sat 12 Jun 2027 (in 235 days)', 'box line anniversary');
    eq(C.since(sara), 'Born 24 Oct 1995', 'since birthday');
    eq(C.since(dad), '21 Oct, year not known', 'since no year');
    eq(C.since(wed), 'Married 12 Jun 2015', 'since wedding');
    eq(C.since(leap), 'Born 29 Feb 2000 (kept on 28 Feb in other years)', 'since leap day');

    // ---- 29 February, year ends, born today
    eq(C.nextOcc(leap, T), { date: '2027-02-28', days: 131, years: 27 }, '29 Feb kept on 28 Feb in 2027');
    eq(C.nextOcc(Object.assign({}, leap, { feb29: '1' }), T).date, '2027-03-01', '29 Feb kept on 1 Mar when chosen');
    eq(C.occIn(leap, 2028), '2028-02-29', 'leap year: on the day');
    eq(C.nextOcc(leap, '2028-02-29'), { date: '2028-02-29', days: 0, years: 28 }, 'leap day itself');
    eq(C.nextOcc(Object.assign({}, leap, { feb29: '1' }), '2027-03-01').days, 0, '1 Mar rule: today on 1 Mar 2027');
    eq(C.lastOcc(leap, '2027-03-02'), { date: '2027-02-28', days: 2, years: 27 }, 'leap day just passed in a normal year');
    eq(C.upLine(E(9, 'Nida', 'birthday', 1, 1, 1990), '2026-12-31'), 'Nida turns 37 tomorrow (Fri 1 Jan 2027)', 'across new year');
    eq(C.pastLine(E(9, 'Nida', 'birthday', 31, 12, 1990), '2027-01-01'), 'Nida turned 36 on Thu 31 Dec 2026 (yesterday)', 'back across new year');
    eq(C.upLine(E(9, 'Baby', 'birthday', 20, 10, 2026), T), 'Baby was born today', 'born today');
    eq(C.upLine(E(9, 'Baby', 'birthday', 1, 10, 2026), T), 'Baby turns 1 on Fri 1 Oct 2027 (in 346 days)', 'first birthday next year');
    eq(C.upLine(E(9, 'Old', 'birthday', 2, 1, 1900), T), 'Old turns 127 on Sat 2 Jan 2027 (in 74 days)', 'very old');

    // ---- the top box
    const all = [sara, mum, dad, wed, hina, work, leap, james];
    const u = C.upcoming(all, T);
    eq(u.today.map(x => x.e.name), ['Mum'], 'today');
    eq(u.tomorrow.map(x => x.e.name), ['Dad'], 'tomorrow');
    eq(u.soon.map(x => x.e.name), ['Sara', 'Ahmed', 'James'], 'next 30 days, soonest first');
    eq(u.passed.map(x => x.e.name), ['Hina'], 'last 7 days');
    eq(C.sorted(all, T).map(x => x.e.name), ['Mum', 'Dad', 'Sara', 'Ahmed', 'James', 'Zain', 'Ali and Sara', 'Hina'], 'whole list, next first; Hina last (a year away)');
    eq(C.upcoming([], T), { today: [], tomorrow: [], soon: [], passed: [] }, 'empty list');
    eq(C.wishedFor(mum, T), false, 'not wished yet');
    eq(C.wishedFor(Object.assign({}, mum, { wished: '2026-10-20' }), T), true, 'wished today');
    eq(C.wishedFor(Object.assign({}, mum, { wished: '2025-10-20' }), T), false, 'last year\'s tick does not count');
    eq(C.wishedFor(Object.assign({}, hina, { wished: '2026-10-17' }), T), true, 'belated wish ticked');

    const txt = C.listText([sara, mum, wed], T);
    eq(txt, 'Birthdays and anniversaries, the next 12 months from Tue 20 Oct 2026:\n\nTue 20 Oct 2026: Mum turns 66 (Likes roses)\nSat 24 Oct 2026: Sara turns 31\nSat 12 Jun 2027: Ali and Sara: 12th wedding anniversary', 'copied list');
    eq(C.listText(all, T, 2).split('\n').slice(-1)[0], '...and 6 more', 'email list is cut short with a count');

    // ---- the form
    const F = o => Object.assign({ name: 'Sara', kind: 'birthday', label: '', day: '24', month: '10', year: '1995', feb29: '28', group: 'family', note: '' }, o);
    eq(C.readForm(F({}), T, []).entry, { name: 'Sara', kind: 'birthday', label: '', d: 24, m: 10, y: 1995, feb29: '28', group: 'family', note: '', wished: '' }, 'good form');
    eq(C.readForm(F({ year: '' }), T, []).entry.y, 0, 'year optional');
    eq(C.readForm(F({ name: '   ' }), T, []).err, { name: 'Type a name.' }, 'blank name');
    eq(C.readForm(F({ name: '', kind: 'anniversary' }), T, []).err.name, 'Type whose anniversary it is, such as "Ali and Sara".', 'blank anniversary name');
    eq(C.readForm(F({ kind: 'other', label: '' }), T, []).err, { label: 'Type what the day is, such as "Work anniversary".' }, 'other needs a label');
    eq(C.readForm(F({ day: '' }), T, []).err, { date: 'Pick the day and the month.' }, 'no day');
    eq(C.readForm(F({ day: '31', month: '4' }), T, []).err, { date: 'April has only 30 days.' }, '31 April');
    eq(C.readForm(F({ day: '29', month: '2', year: '1995' }), T, []).err, { date: '1995 had no 29 February. Check the day or the year.' }, '29 Feb in a normal year');
    eq(C.readForm(F({ day: '29', month: '2', year: '' }), T, []).entry.d, 29, '29 Feb with no year is fine');
    eq(C.readForm(F({ day: '1', month: '12', year: '2026' }), T, []).err, { date: 'That date has not happened yet. Leave the year empty if it is still to come.' }, 'future date');
    eq(C.readForm(F({ year: '95' }), T, []).err, { year: 'Type the year as 4 digits, such as 1995, or leave it empty.' }, '2 digit year');
    eq(C.readForm(F({ year: '1899' }), T, []).err, { year: 'Type a year from 1900 to 2026, or leave it empty.' }, 'too old');
    eq(C.readForm(F({ year: '-5' }), T, []).err.year !== undefined, true, 'negative year');
    eq(C.readForm(F({ name: 'x'.repeat(200) }), T, []).entry.name.length, 60, 'very long name is cut to 60');
    eq(C.readForm(F({ name: '  Sara \n Khan ' }), T, []).entry.name, 'Sara Khan', 'pasted spaces and line breaks tidied');
    eq(C.readForm(F({ name: 'sara' }), T, [sara]).err, { name: "sara's birthday on 24 Oct is already on the list." }, 'duplicate');
    eq(!!C.readForm(F({ name: 'Sara', kind: 'anniversary' }), T, [sara]).entry, true, 'same name, other kind is fine');
    eq(C.readForm(F({ group: 'bogus' }), T, []).entry.group, '', 'unknown group');

    // ---- pasting a list
    const P = (l, o) => { const r = C.parseLine(l, o || 'dm', T); return r.entry ? [r.entry.name, r.entry.kind, r.entry.d, r.entry.m, r.entry.y] : r.error; };
    eq(P('Sara 24/10/1995'), ['Sara', 'birthday', 24, 10, 1995], 'day/month/year');
    eq(P('Bob 10/24'), ['Bob', 'birthday', 24, 10, 0], '10/24 can only be month/day');
    eq(P('Bob 5/6/1990'), ['Bob', 'birthday', 5, 6, 1990], 'day first');
    eq(P('Bob 5/6/1990', 'md'), ['Bob', 'birthday', 6, 5, 1990], 'month first');
    eq(P('Zed 5.6.88'), ['Zed', 'birthday', 5, 6, 1988], 'dots and 2 digit year');
    eq(P('Kid 5-6-15'), ['Kid', 'birthday', 5, 6, 2015], '2 digit year this century');
    eq(P('Mum - 3 March'), ['Mum', 'birthday', 3, 3, 0], 'words');
    eq(P('Dad, March 3rd 1960'), ['Dad', 'birthday', 3, 3, 1960], 'month first in words');
    eq(P('Ali and Sara anniversary 2015-06-12'), ['Ali and Sara', 'anniversary', 12, 6, 2015], 'ISO and anniversary word');
    eq(P('Hina b-day: 12.11'), ['Hina', 'birthday', 12, 11, 0], 'birthday word removed');
    eq(P('24 Dec 1990 Uncle Tariq'), ['Uncle Tariq', 'birthday', 24, 12, 1990], 'date first');
    eq(P('Ann 31/02'), 'February has only 29 days.', 'no 31 Feb');
    eq(P('Jo 29 Feb 2001'), '2001 had no 29 February. Check the day or the year.', 'no 29 Feb 2001');
    eq(P('Just a name'), 'no date found', 'no date');
    eq(P('12/10/1990'), 'Type a name.', 'no name');
    eq(C.parsePaste('Sara 24/10/1995\n\n  \nMum 3 March\n', 'dm', T).length, 2, 'blank lines skipped');
    const imp = C.sortImport(C.parsePaste('Sara 24/10/1995\nMum 3 March\nMum 3 March\nNo date', 'dm', T), [sara]);
    eq([imp.add.length, imp.dup.length, imp.bad.length], [1, 2, 1], 'import: 1 new, Sara already there and Mum twice, 1 unreadable');

    // ---- contacts file
    const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Sara Khan\r\nBDAY:19951024\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:4.0\r\nFN:Mum\r\nBDAY:--0303\r\nANNIVERSARY:19850412\r\nEND:VCARD\r\n' +
        'BEGIN:VCARD\nVERSION:3.0\nN:Lee;Ann;;;\nBDAY;VALUE=date:1604-07-09\nEND:VCARD\nBEGIN:VCARD\nFN:No Birthday\nTEL:123\nEND:VCARD\nBEGIN:VCARD\nFN:Long\n  Name\nitem1.X-ABDATE:2010-05-05\nEND:VCARD';
    eq(C.parseVcf(vcf, T).map(r => r.entry ? [r.entry.name, r.entry.kind, r.entry.d, r.entry.m, r.entry.y] : r.error),
        [['Sara Khan', 'birthday', 24, 10, 1995], ['Mum', 'birthday', 3, 3, 0], ['Mum', 'anniversary', 12, 4, 1985], ['Ann Lee', 'birthday', 9, 7, 0], ['Long Name', 'anniversary', 5, 5, 2010]], 'contacts file');
    eq(C.parseVcf('hello', T), [], 'not a contacts file');

    // ---- calendar file
    const cal = C.ics([sara], T, '20261020T050000Z', 1).text;
    eq(cal.includes('DTSTART;VALUE=DATE:20261024') && cal.includes('RRULE:FREQ=YEARLY') && cal.includes("SUMMARY:Sara's birthday (born 1995)"), true, 'yearly event');
    eq((cal.match(/BEGIN:VALARM/g) || []).length, 2, 'reminder on the day and 1 day before');
    eq(cal.includes('TRIGGER;RELATED=START:-PT15H') && cal.includes('TRIGGER;RELATED=START:PT9H'), true, '9:00 the day before and 9:00 on the day');
    eq(C.ics([sara], T, 'X', 7).text.includes('TRIGGER;RELATED=START:-P6DT15H'), true, 'a week before');
    eq((C.ics([sara], T, 'X', 0).text.match(/BEGIN:VALARM/g) || []).length, 1, 'on the day only');
    const lc = C.ics([leap], T, 'X', 1);
    eq([(lc.text.match(/BEGIN:VEVENT/g) || []).length, lc.text.includes('RRULE'), lc.text.includes('DTSTART;VALUE=DATE:20270228'), lc.text.includes('DTSTART;VALUE=DATE:20280229'), lc.count], [30, false, true, true, 1], '29 Feb: 30 single events');
    eq(C.ics([E(9, 'A, B; C', 'birthday', 1, 1, 0)], T, 'X', 0).text.includes("SUMMARY:A\\, B\\; C's birthday"), true, 'commas escaped');
    eq(cal.split('\r\n').every(l => l.length <= 75), true, 'lines folded');

    // ---- saved state
    eq(C.validate(null), null, 'nothing saved');
    eq(C.validate({ entries: 'x' }), null, 'corrupt');
    const v = C.validate({ nextId: 2, order: 'md', before: 7, entries: [sara, { id: 1, name: 'dup id', kind: 'birthday', d: 1, m: 1 }, { id: 'x' }, { id: 20, name: '', d: 1, m: 1 },
        { id: 21, name: 'Bad day', d: 31, m: 4 }, { id: 22, name: 'Leap', kind: 'birthday', d: 29, m: 2, y: 1995 }, { id: 23, name: 'Odd', kind: 'zzz', d: 3, m: 3, y: 1990, group: 'x', wished: 'nope', note: 5 }] });
    eq(v.entries.map(e => e.id), [1, 22, 23], 'bad entries dropped');
    eq(v.entries[1].y, 0, 'impossible 29 Feb year dropped, date kept');
    eq([v.entries[2].kind, v.entries[2].group, v.entries[2].wished, v.entries[2].note], ['birthday', '', '', '5'], 'odd values cleaned');
    eq([v.nextId, v.order, v.before], [24, 'md', 7], 'next id and settings');
    eq(C.validate({ entries: [], before: 5 }).before, 1, 'unknown reminder setting');
    eq(C.guessOrder('en-US'), 'md', 'US: month first');
    eq(C.guessOrder('en-GB'), 'dm', 'UK: day first');
    eq(C.guessOrder('ur-PK'), 'dm', 'Pakistan: day first');

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof module !== 'undefined' && module.exports) { out.forEach(l => console.log(l)); console.log(summary); process.exitCode = fail ? 1 : 0; }
    else { const pre = document.createElement('pre'); pre.textContent = out.concat(summary).join('\n'); document.body.appendChild(pre); }
})();
