// Logic checks for Emergency Medical Info Lock Screen and Wallet Card. Run: node tests.js (or open test.html).
(function () {
    'use strict';
    const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : window.IceCore;
    let pass = 0, fail = 0; const out = [];
    const eq = (got, want, what) => {
        const ok = JSON.stringify(got) === JSON.stringify(want);
        ok ? pass++ : fail++;
        if (!ok) out.push('FAIL ' + what + '\n   got:  ' + JSON.stringify(got) + '\n   want: ' + JSON.stringify(want));
    };
    const T = '2026-10-19';
    // a simple stand-in for the browser's text measuring: every character is 0.55 of the size wide (0.6 when bold)
    const measure = (t, size, bold) => Array.from(t).length * size * (bold ? 0.6 : 0.55);

    // ---- dates and age
    eq(C.fmtDate('1958-03-03'), '3 Mar 1958', 'date is written with the month name, never 03/03');
    eq(C.age('1958-03-03', T), 68, 'age after the birthday this year');
    eq(C.age('1958-10-20', T), 67, 'birthday tomorrow: not older yet');
    eq(C.age('1958-10-19', T), 68, 'birthday today counts');
    eq(C.age('2008-02-29', '2027-02-28'), 18, '29 Feb birthday: not 19 on 28 Feb');
    eq(C.age('2008-02-29', '2027-03-01'), 19, '29 Feb birthday: 19 on 1 Mar');
    eq(C.bornText('2026-05-01', T), '1 May 2026 (under 1 year)', 'a baby');
    eq(C.dobError('2027-01-01', T), 'The date of birth is after today.', 'future date of birth');
    eq(C.dobError('1850-01-01', T), 'Check the year of birth.', 'year before 1900');
    eq(C.dobError('2026-02-30', T), 'Pick a real date of birth.', '30 Feb');
    eq(C.dobError('', T), '', 'blank date of birth is fine');
    eq(C.bornText('2027-01-01', T), '', 'a wrong date of birth is left off the card');

    // ---- text clean-up
    eq(C.line('Peni\ncillin\t x', 80), 'Peni cillin  x', 'pasted line breaks become spaces');
    eq(C.line('x'.repeat(200), 80).length, 80, 'cut to the limit');
    eq(C.phoneError('123'), 'This number looks too short.', 'too short');
    eq(C.phoneError('+44 7700 900123'), '', 'a real number');
    eq(C.phoneError(''), '', 'blank number is not an error');
    eq(C.needsCountryCode('07700 900123'), true, 'no country code: hint');
    eq(C.needsCountryCode('+44 7700'), false, 'with +');
    eq(C.needsCountryCode('0044 7700'), false, 'with 00');

    // ---- the situation from the README
    const P = C.blankPerson('Fatima Khan');
    Object.assign(P, { dob: '1958-03-03', blood: 'O+', updated: '2026-10-19',
        allergies: [{ t: 'Penicillin', sev: 'life' }, { t: 'Peanuts', sev: 'moderate' }, { t: '  ', sev: 'mild' }],
        conditions: [{ t: 'Type 2 diabetes' }, { t: 'Atrial fibrillation' }, { t: '' }],
        meds: [{ t: 'Warfarin (blood thinner)', dose: '5 mg every evening' }, { t: 'Metformin', dose: '500 mg twice a day' }],
        contacts: [{ name: 'Bilal Khan', rel: 'Son', phone: '+44 7700 900123' }, { name: '', rel: '', phone: '' }] });
    const text = C.plainText(P, T);
    eq(text, ['IN CASE OF EMERGENCY', '', 'Name: Fatima Khan', 'Born: 3 Mar 1958 (age 68)', 'Blood group: O+',
        'Allergies:', '- Penicillin: life-threatening (anaphylaxis)', '- Peanuts: moderate',
        'Conditions:', '- Type 2 diabetes', '- Atrial fibrillation',
        'Medicines:', '- Warfarin (blood thinner), 5 mg every evening', '- Metformin, 500 mg twice a day',
        'Emergency contacts:', '- Bilal Khan (Son): +44 7700 900123', '', 'Updated 19 Oct 2026'].join('\n'), 'the Medical ID text, blank rows left off');
    eq(C.missing(P), [], 'nothing missing');
    const mAll = C.model(P, T, 'all');
    eq(mAll.sections.map(s => s.key), ['allergies', 'conditions', 'meds', 'contacts'], 'lock screen order');
    eq(mAll.sections[0].items.map(i => i.strong), [true, false], 'life-threatening allergy is bold red, moderate is not');
    eq(mAll.sections[3].items[0].t, 'Bilal Khan (Son): +44 7700 900123', 'on the picture the number never breaks');
    eq(C.model(P, T, 'front').sections.map(s => s.key), ['allergies', 'contacts'], 'card front: allergies and who to call');
    eq(C.model(P, T, 'back').sections.map(s => s.key), ['conditions', 'meds'], 'card back: conditions and medicines');
    eq(C.model(P, T, 'front').updated, '', 'updated date only on the back');
    eq(C.model(P, T, 'back').updated, 'Updated 19 Oct 2026', 'updated date on the back');

    // ---- blank fields are never printed as "none"
    const B = C.blankPerson('Ali');
    eq(C.plainText(B, T), 'IN CASE OF EMERGENCY\n\nName: Ali', 'only the name');
    eq(C.missing(B), ['Add at least one person to call, with their number.', 'Add allergies, or tick "No known allergies" so a paramedic knows you checked.'], 'what is still worth adding');
    B.noAllergies = true;
    eq(C.plainText(B, T), 'IN CASE OF EMERGENCY\n\nName: Ali\nAllergies: None known', 'None known only when ticked');
    B.allergies = [{ t: 'Latex', sev: '' }];
    eq(C.sections(B, T, '')[0].items.map(i => i.t), ['Latex'], 'a typed allergy wins over the tick');
    eq(C.isEmpty(C.blankPerson('  ')), true, 'a name of spaces is empty');

    // ---- second language
    B.out.lang = 'es';
    eq(C.model(B, T, 'all').title, 'IN CASE OF EMERGENCY · EN CASO DE EMERGENCIA', 'title in two languages');
    eq(C.sections(B, T, 'es')[0].label, 'Allergies · Alergias', 'labels in two languages');
    const tr = C.blankPerson('Ayşe'); tr.out.lang = 'tr'; tr.allergies = [{ t: 'Polen', sev: '' }];
    const trLay = C.layoutAt(C.model(tr, T, 'all'), 30, 2000, measure);
    eq(trLay.lines.find(l => l.role === 'label').t, 'ALLERGIES · ALERJİLER', 'Turkish capital İ');

    // ---- doctor and notes
    B.out.lang = ''; B.doctor = { name: 'Dr Ahmed', phone: '+92 42 111 222' }; B.notes = 'Organ donor\n\nHas a pacemaker\n';
    eq(C.plainText(B, T).split('\n').slice(4), ['Doctor: Dr Ahmed: +92 42 111 222', 'Notes:', '- Organ donor', '- Has a pacemaker'], 'doctor and notes, blank note lines left off');

    // ---- wrapping
    eq(C.wrap('aa bb cc', 10, false, 25, measure), ['aa', 'bb', 'cc'], 'wraps at spaces');
    eq(C.wrap('abcdefghij', 10, false, 22, measure), ['abcd', 'efgh', 'ij'], 'breaks a very long word');
    eq(C.wrap('a +44 77', 10, false, 40, measure), ['a', '+44 77'], 'the number moves to the next line whole');

    // ---- fitting
    const box = { w: 900, h: 1200 };
    const f1 = C.fit(mAll, box, measure, { maxU: 60, minU: 25 });
    eq([f1.fits, f1.cut], [true, []], 'Fatima fits');
    eq(f1.height <= box.h, true, 'within the box');
    eq(f1.u > 25 && f1.u <= 60, true, 'biggest size between the limits');
    eq(C.fit(mAll, box, measure, { maxU: 60, minU: 25 }).u, f1.u, 'same answer every time');
    // a much smaller box: smaller text first
    const f2 = C.fit(mAll, { w: 900, h: 700 }, measure, { maxU: 60, minU: 20 });
    eq(f2.fits && f2.u < f1.u && f2.cut.length === 0, true, 'smaller text before anything is left off');
    // a very long list: notes go first, then the doctor, then the last items of the longest list; the first of each stays
    const L = C.blankPerson('Long List');
    L.meds = Array.from({ length: 20 }, (_, i) => ({ t: 'Medicine number ' + (i + 1), dose: '10 mg twice a day' }));
    L.allergies = [{ t: 'Penicillin', sev: 'life' }];
    L.contacts = [{ name: 'Bilal', rel: 'Son', phone: '+44 7700 900123' }];
    L.notes = 'Organ donor'; L.doctor = { name: 'Dr Ahmed', phone: '' };
    const f3 = C.fit(C.model(L, T, 'all'), { w: 900, h: 900 }, measure, { maxU: 60, minU: 25 });
    eq(f3.fits, true, 'long list fits after leaving some off');
    eq(f3.cut.slice(0, 3), ['Notes', 'Doctor', 'Medicines: Medicine number 20, 10 mg twice a day'], 'notes, then doctor, then the last medicine');
    eq(f3.lines.some(l => l.role === 'more' && /^\+ \d+ more not shown$/.test(l.t)), true, 'says how many more are not shown');
    eq(f3.lines.some(l => l.t.indexOf('Penicillin') === 0) && f3.lines.some(l => /^Bilal/.test(l.t)), true, 'the allergy and the contact are kept');
    const shown = f3.lines.filter(l => /^Medicine number/.test(l.t)).length, gone = f3.cut.filter(c => /^Medicines/.test(c)).length;
    eq(shown + gone, 20, 'every medicine is either shown or listed as left off');
    // nothing left to trim and still too big: fits is false and nothing is drawn outside the box
    const H = C.blankPerson('W'.repeat(80));
    const f4 = C.fit(C.model(H, T, 'all'), { w: 300, h: 120 }, measure, { maxU: 30, minU: 20 });
    eq(f4.fits, false, 'a giant name in a tiny box does not fit');
    eq(f4.lines.every(l => l.y + l.h <= 120.5), true, 'no line drawn below the box');
    // wallet card and lock screen boxes
    eq(C.wallBox(1179, 2556), { x: 83, y: 767, w: 1013, h: 1444 }, 'lock screen text sits below the clock, above the buttons');

    // ---- saved and restored data
    eq(C.validate(null), null, 'null is not a backup');
    eq(C.validate({ people: [] }), null, 'no people');
    eq(C.validate({ people: 'x' }), null, 'people not a list');
    const S = C.validate({ people: [{ id: 'a', name: 'X\nY', dob: '2026-02-30', blood: 'Q+', allergies: [{ t: 'Nuts', sev: 'deadly' }, null, 'x'],
        meds: [{ t: 'A', dose: 5 }], contacts: [{ name: 'B', phone: 12345 }], out: { size: 'custom', w: 99999, h: 1600, theme: 'neon', lang: 'xx' } },
        { id: 'a', name: 'Dup id' }], cur: 'zzz' });
    eq(S.people[0].name, 'X Y', 'name cleaned');
    eq([S.people[0].dob, S.people[0].blood], ['', ''], 'bad date and blood group dropped');
    eq(S.people[0].allergies, [{ t: 'Nuts', sev: '' }], 'bad severity dropped, bad rows dropped');
    eq(S.people[0].meds, [{ t: 'A', dose: '5' }], 'numbers become text');
    eq(S.people[0].contacts[0].phone, '12345', 'phone as text');
    eq(S.people[0].out, { size: 'custom', w: 1080, h: 1600, theme: 'dark', lang: '' }, 'bad sizes, look and language fixed');
    eq(S.people[1].id !== 'a', true, 'a repeated id gets a new one');
    eq(S.cur, 'a', 'unknown current person: the first');
    const S2 = C.validate({ people: [{ name: 'Z', out: { size: 'iphone-se', w: 5, h: 5 } }] });
    eq([S2.people[0].out.w, S2.people[0].out.h], [750, 1334], 'a preset size always uses its own pixels');
    eq(C.validate({ people: Array.from({ length: 30 }, () => ({ name: 'n' })) }).people.length, 12, 'at most 12 people');

    // ---- files and email
    eq(C.fileName('emergency-lock-screen', { name: 'Fatima Khān!' }), 'emergency-lock-screen-fatima-khan.png', 'file name');
    eq(C.fileName('emergency-lock-screen', { name: '' }), 'emergency-lock-screen.png', 'file name with no name');
    eq(C.mailto(P, T).startsWith('mailto:?subject=Emergency%20medical%20information%3A%20Fatima%20Khan&body=IN%20CASE'), true, 'email with no recipient needed');

    const summary = pass + ' passed, ' + fail + ' failed';
    if (typeof module !== 'undefined' && module.exports) { out.forEach(l => console.log(l)); console.log(summary); process.exit(fail ? 1 : 0); }
    else { const pre = document.createElement('pre'); pre.textContent = out.concat(summary).join('\n'); document.body.appendChild(pre); }
})();
