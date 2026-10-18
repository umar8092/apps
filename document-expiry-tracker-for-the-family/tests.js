// Logic checks for Document Expiry Tracker for the Family. Run: node tests.js (or open test.html).
(function () {
    'use strict';
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : window.DocCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (got, want, what) => {
        const ok = JSON.stringify(got) === JSON.stringify(want);
        ok ? pass++ : fail++;
        if (!ok) out.push('FAIL ' + what + '\n   got:  ' + JSON.stringify(got) + '\n   want: ' + JSON.stringify(want));
    };
    const T = '2026-10-18';   // a Sunday

    // ---- dates
    eq(C.addMonths('2027-03-31', -1), '2027-02-28', '31 Mar minus 1 month is 28 Feb');
    eq(C.addMonths('2028-03-31', -1), '2028-02-29', 'leap year: 31 Mar 2028 minus 1 month is 29 Feb');
    eq(C.monthEnd(2028, 2), '2028-02-29', 'Feb 2028 ends on the 29th');
    eq(C.leftText(T, '2027-03-03'), '4 months left', '18 Oct to 3 Mar is 4 whole months');
    eq(C.leftText(T, '2031-05-12'), '4 years 6 months left', 'long time left');
    eq(C.leftText(T, '2026-10-31'), '13 days left', 'days left under 2 months');
    eq(C.leftText(T, T), 'last day today', 'the expiry day itself is still valid');
    eq(C.leftText(T, '2026-10-19'), 'expires tomorrow', 'tomorrow');
    eq(C.agoText(T, '2026-10-10'), '8 days ago', 'expired 8 days ago');
    eq(C.agoText(T, '2026-10-17'), 'yesterday', 'expired yesterday');
    eq(C.parseDate('2026-02-30'), null, 'no 30 Feb');
    eq(C.parseDate(''), null, 'blank date');

    // ---- the family from the README
    const S = C.emptyState();
    S.people = [{ id: 1, name: 'Aisha' }, { id: 2, name: 'Ali' }, { id: 3, name: 'Me' }, { id: 4, name: 'Car' }];
    const D = (id, who, type, exp, extra) => Object.assign({ id, who, type, name: '', exp, remind: C.typeOf(type).remind, number: '', country: '', note: '', applied: '', history: [] }, extra || {});
    S.docs = [
        D(10, 1, 'passport', { t: 'date', d: '2027-03-03' }, { number: 'AB1234567', country: 'Pakistan' }),
        D(11, 2, 'licence', { t: 'month', y: 2026, m: 10 }),
        D(12, 3, 'passport', { t: 'date', d: '2031-05-12' }),
        D(13, 4, 'carins', { t: 'date', d: '2026-10-10' }),
        D(14, 3, 'id', { t: 'none' }),
        D(15, 1, 'visa', { t: 'date', d: '2027-08-20' })
    ];
    S.nextId = 16;
    const k = id => C.classify(S.docs.find(d => d.id === id), T);
    eq(C.remindDate(S.docs[0]), '2026-06-03', 'passport reminder 9 months before 3 Mar 2027');
    eq(k(10).state, 'soon', "Aisha's passport: renew now");
    eq(C.underSix(S.docs[0], T), true, 'Aisha passport under 6 months left');
    eq(C.statusLine(S.docs[0], T), 'Valid until Wed 3 Mar 2027 (4 months left)', 'status line');
    eq(C.adviceLine(S.docs[0], T), 'Renew it now: under 6 months left, and many countries will not let you in with it.', 'six month advice');
    eq(C.expiry(S.docs[1]), '2026-10-31', 'month-only licence lasts to the end of October');
    eq(k(11).state, 'soon', 'licence inside its 2 month reminder');
    eq(C.statusLine(S.docs[1], T), 'Valid until the end of October 2026 (13 days left)', 'month-only status');
    eq(k(12).state, 'ok', 'my passport is fine');
    eq(C.adviceLine(S.docs[2], T), 'Start renewing on 12 Aug 2030 (keeps 6 months for travel).', 'start renewing date');
    eq(k(13).state, 'expired', 'car insurance expired');
    eq(C.statusLine(S.docs[3], T), 'Expired on Sat 10 Oct 2026 (8 days ago)', 'expired line');
    eq(k(14).state, 'none', 'ID with no expiry');
    eq(C.statusLine(S.docs[4], T), 'Does not expire', 'no expiry line');
    eq(k(15).state, 'ok', 'visa with 10 months left and a 3 month reminder is fine');

    const s = C.summary(S, T);
    eq(s.todoLines, ['Car: Car insurance expired 8 days ago', 'Ali: Driving licence expires Sat 31 Oct 2026 (13 days left)', 'Aisha: Passport (Pakistan) expires Wed 3 Mar 2027 (4 months left)'], 'what to renew, soonest first');
    eq(s.expired, 1, 'one expired');
    eq(s.nextLine, 'Aisha: Visa or residence permit, start renewing on Thu 20 May 2027 (expires 20 Aug 2027)', 'next to renew');

    // applied for renewal moves it to waiting
    S.docs[0].applied = '2026-10-15';
    const s2 = C.summary(S, T);
    eq(s2.todoLines.length, 2, 'applied passport is no longer to-do');
    eq(s2.waitingLines, ['Aisha: Passport (Pakistan), applied for on 15 Oct 2026'], 'waiting line');
    eq(C.classify(S.docs[0], T).applied, true, 'applied flag');
    S.docs[0].applied = '';
    // an applied flag on a valid document does not hide it
    S.docs[2].applied = '2026-10-01';
    eq(C.classify(S.docs[2], T).applied, false, 'applied only matters when renewal is due');
    S.docs[2].applied = '';

    // ---- travel check: back on 20 Dec 2026
    const tc = C.travelCheck(S, '2026-12-20', 6, T);
    eq(tc.bad, 2, 'two documents not good for the trip');
    eq(tc.rows.map(r => [r.person, r.title, r.ok]), [['Aisha', 'Passport (Pakistan)', false], ['Aisha', 'Visa or residence permit', true], ['Ali', 'Driving licence', false], ['Me', 'Passport', true], ['Me', 'National ID card', true]], 'travel rows');
    eq(tc.rows[0].text, 'ends on 3 Mar 2027, only 2 months after you come back. Many countries want 6 months. Renew it first.', 'passport 2 months after trip');
    eq(tc.rows[2].text, 'ends on 31 Oct 2026, before you come back. Renew it before you go.', 'licence ends during trip');
    eq(tc.rows[3].text, 'valid until 12 May 2031, 4 years 4 months after you come back', 'my passport fine');
    eq(C.travelCheck(S, '2026-12-20', 0, T).bad, 1, 'until-return rule: only the licence fails');
    eq(C.travelCheck(S, '2026-12-20', 3, T).rows[0].ok, false, '3 month rule still fails Aisha (2 months)');
    eq(C.travelCheck(S, '2026-10-01', 6, T).err, 'The day you come back cannot be before today.', 'trip in the past');
    eq(C.travelCheck(S, '', 6, T).err, 'Choose the day you come back.', 'no trip date');
    eq(C.travelCheck(S, '2027-03-03', 0, T).rows[0].text, 'valid until 3 Mar 2027, the day you come back', 'valid on the day you come back');

    // ---- reminders
    const w = D(20, 1, 'travelins', { t: 'date', d: '2026-11-01' });
    eq(C.remindDate(w), '2026-10-18', '2 weeks before 1 Nov is 18 Oct');
    eq(C.classify(w, T).state, 'soon', 'reminder day itself counts as renew now');
    eq(C.remindText({ n: 2, u: 'w' }), '2 weeks', 'weeks text');
    eq(C.remindText({ n: 12, u: 'm' }), '1 year', 'year text');

    // ---- calendar file
    const cal = C.ics(S, S.docs, T, '20261018T000000Z');
    // Aisha passport: reminder passed -> expiry only (1); licence: expiry only (1); my passport: 2; car expired: 0; ID none: 0; visa: 2
    eq(cal.count, 6, 'calendar events still to come');
    eq(/DTSTART;VALUE=DATE:20300812/.test(cal.text), true, 'start-renewing day for my passport');
    eq(/SUMMARY:Me: Passport expires today/.test(cal.text), true, 'expiry event title');
    eq(cal.text.split('\r\n').every(l => l.length <= 75), true, 'lines folded');
    eq(C.ics(S, [S.docs[3]], T, 'x').count, 0, 'expired document has no events');

    // ---- copy text
    const lt = C.listText(S, T);
    eq(lt.includes('AB1234567'), false, 'list text leaves numbers out');
    eq(C.docText(S.docs[0], T, true).includes('Number: AB1234567'), true, 'single document copy includes the number');
    eq(lt.startsWith('Family documents and expiry dates (18 Oct 2026)\n\nTO RENEW NOW\n- Car: Car insurance expired 8 days ago'), true, 'list text head');
    eq(C.listText(C.emptyState(), T), '', 'empty list text');

    // ---- the form
    const F = o => Object.assign({ who: '1', newName: '', type: 'passport', name: '', expKind: 'date', expDate: '2030-01-15', expMonth: '', expYear: '', remSel: '9m', remNum: '', remUnit: 'm', number: '', country: '', note: '' }, o);
    let r = C.readForm(F(), S, T);
    eq([r.ok, r.doc.who, r.doc.exp, r.doc.remind], [true, 1, { t: 'date', d: '2030-01-15' }, { n: 9, u: 'm' }], 'good form');
    eq(C.readForm(F({ who: 'new', newName: '  ' }), S, T).errs.who, 'Type whose document it is, such as "Aisha" or "Me".', 'blank new name');
    eq(C.readForm(F({ who: 'new', newName: 'aisha' }), S, T).errs.who, 'aisha is already on the list. Choose them under "Whose document is it?".', 'duplicate name');
    eq(C.readForm(F({ who: 'new', newName: '  Sara   Khan ' }), S, T).doc.newName, 'Sara Khan', 'name tidied');
    eq(C.readForm(F({ who: 'new', newName: 'x'.repeat(100) }), S, T).doc.newName.length, 40, 'very long name clipped');
    eq(C.readForm(F({ who: '999', newName: 'Zed' }), S, T).doc.who, null, 'unknown person id treated as new');
    eq(C.readForm(F({ type: 'other' }), S, T).errs.name, 'Type what the document is, such as "Gym membership card".', 'other needs a name');
    eq(C.readForm(F({ type: 'other', name: 'Gym card' }), S, T).doc.name, 'Gym card', 'other name kept');
    eq(C.readForm(F({ type: 'passport', name: 'stale' }), S, T).doc.name, '', 'name dropped for known types');
    eq(C.readForm(F({ expDate: '' }), S, T).errs.exp, 'Choose the date it expires. It is printed on the document.', 'blank date');
    eq(C.readForm(F({ expKind: 'month', expMonth: '3', expYear: '28' }), S, T).errs.exp, 'Type the year it expires, with 4 digits, such as 2031.', 'two-digit year');
    eq(C.readForm(F({ expKind: 'month', expMonth: '', expYear: '2028' }), S, T).errs.exp, 'Choose the month it expires.', 'no month');
    eq(C.readForm(F({ expKind: 'month', expMonth: '3', expYear: ' 2028 ' }), S, T).doc.exp, { t: 'month', y: 2028, m: 3 }, 'month and year');
    eq(C.readForm(F({ expKind: 'none', expDate: '' }), S, T).ok, true, 'no expiry needs no date');
    eq(C.readForm(F({ remSel: 'custom', remNum: '0' }), S, T).errs.rem, 'Type how long before: 1 to 104 weeks, or 1 to 36 months.', 'zero custom reminder');
    eq(C.readForm(F({ remSel: 'custom', remNum: '-3' }), S, T).ok, false, 'negative reminder');
    eq(C.readForm(F({ remSel: 'custom', remNum: '105', remUnit: 'w' }), S, T).ok, false, 'too many weeks');
    eq(C.readForm(F({ remSel: 'custom', remNum: '18', remUnit: 'm' }), S, T).doc.remind, { n: 18, u: 'm' }, '18 months');
    eq(C.readForm(F({ remSel: 'custom', remNum: '1.5' }), S, T).ok, false, 'decimal reminder rejected');
    eq(C.readForm(F({ note: 'a\r\n\r\n\r\n\r\nb' }), S, T).doc.note, 'a\n\nb', 'pasted note tidied');
    eq(C.readForm(F({ number: ' AB 123 ' }), S, T).doc.number, 'AB 123', 'number trimmed');
    eq(C.previewText(F({ expDate: '2027-03-03' }), S, T), 'Expires Wed 3 Mar 2027 (4 months left). That is inside the reminder time, so it will show as "Renew now".', 'preview inside reminder');
    eq(C.previewText(F({ expDate: '2031-05-12' }), S, T), 'Expires Mon 12 May 2031 (4 years 6 months left). Start renewing on Mon 12 Aug 2030.', 'preview normal');
    eq(C.previewText(F({ expDate: '2026-01-02' }), S, T), 'Already expired 9 months ago. It will show as "Renew now".', 'preview expired');
    eq(C.previewText(F({ expKind: 'none' }), S, T), 'Does not expire, so there is no reminder.', 'preview none');
    eq(C.previewText(F({ expKind: 'month', expMonth: '2', expYear: '2028' }), S, T), 'Valid until the end of February 2028 (1 year 4 months left). Start renewing on Sat 29 May 2027.', 'preview month-only (leap Feb, 9 months before)');

    // ---- saved state
    eq(C.validate(null), null, 'null state');
    eq(C.validate({ people: 'x', docs: [] }), null, 'bad people');
    const v = C.validate(JSON.parse(JSON.stringify(S)));
    eq([v.people.length, v.docs.length, v.nextId], [4, 6, 16], 'round trip');
    const bad = C.validate({ people: [{ id: 1, name: 'A' }, { id: 1, name: 'B' }, { id: 2, name: 'a' }, { id: -1, name: 'C' }, { id: 3, name: '<img src=x onerror=alert(1)>' }],
        docs: [{ id: 5, who: 9, type: 'passport', exp: { t: 'none' } }, { id: 6, who: 1, type: 'hack', exp: { t: 'date', d: '2030-13-01' } }, { id: 7, who: 1, type: 'hack', name: '', exp: { t: 'date', d: '2030-01-01' }, remind: { n: 999, u: 'm' }, history: [{ exp: { t: 'none' } }, { exp: { t: 'date', d: '2020-01-01' }, on: 'x' }], applied: 'yes' }, { id: 1, who: 1, type: 'id', exp: { t: 'none' } }],
        trip: { back: 'soon', rule: 9 }, nextId: 'x' });
    eq(bad.people.map(p => p.name), ['A', '<img src=x onerror=alert(1)>'], 'duplicate and bad people dropped, text kept as text');
    eq(bad.docs.map(d => [d.id, d.type, d.name, d.remind, d.applied, d.history.length]), [[7, 'other', 'Document', { n: 1, u: 'm' }, '', 1]], 'bad documents dropped or cleaned');
    eq(bad.trip, { back: '', rule: 6 }, 'bad trip reset');
    eq(bad.nextId, 8, 'next id above every id');

    const msg = (fail ? out.join('\n') + '\n' : '') + pass + ' passed, ' + fail + ' failed';
    if (typeof module !== 'undefined' && module.exports) { console.log(msg); process.exitCode = fail ? 1 : 0; }
    else { const p = document.createElement('pre'); p.id = 'out'; p.textContent = msg; document.body.appendChild(p); }
})();
