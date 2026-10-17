// Logic checks for core.js. Run: node tests.js  (or open test.html in a browser)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.ExpiryCore;
    let pass = 0, failed = 0; const out = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); } };
    const T = '2026-10-17';   // a Saturday
    let nid = 1;
    const item = o => Object.assign({ id: nid++, name: 'Thing', place: 'fridge', kind: 'use', date: '2026-10-18', monthOnly: false, opened: '', openDays: 0, qty: '', note: '', status: 'active', statusDate: '', added: T }, o);
    const form = o => Object.assign({ name: 'Milk', place: 'fridge', kind: 'use', mode: 'day', date: '2026-10-18', month: '', year: '', opened: null, openDays: '', qty: '', note: '' }, o);

    // ---- relative words
    eq(C.rel(T, T), 'today', 'today');
    eq(C.rel(T, '2026-10-18'), 'tomorrow', 'tomorrow');
    eq(C.rel(T, '2026-10-16'), 'yesterday', 'yesterday');
    eq(C.rel(T, '2026-10-20'), 'in 3 days', 'in 3 days');
    eq(C.rel(T, '2026-10-30'), 'in 13 days', '13 days stays days');
    eq(C.rel(T, '2026-10-31'), 'in 2 weeks', '14 days is 2 weeks');
    eq(C.rel(T, '2026-10-03'), '2 weeks ago', '2 weeks ago');
    eq(C.rel(T, '2026-12-15'), 'in 8 weeks', '59 days is 8 weeks');
    eq(C.rel(T, '2026-12-14'), 'in 8 weeks', '58 days is 8 weeks');
    eq(C.rel(T, '2026-12-16'), 'in 1 month', '60 days is 1 month');
    eq(C.rel(T, '2027-01-15'), 'in 2 months', 'mid January is 2 months');
    eq(C.rel(T, '2028-01-17'), 'in 1 year 3 months', 'years and months');
    eq(C.rel(T, '2025-10-17'), '1 year ago', 'a year ago');
    eq(C.monthEnd(2027, 2), '2027-02-28', 'end of Feb');
    eq(C.monthEnd(2028, 2), '2028-02-29', 'end of Feb in a leap year');
    eq(C.monthEnd(2027, 12), '2027-12-31', 'end of Dec');

    // ---- the main situation (Ayesha unpacking on Sat 17 Oct)
    const milk = item({ name: 'Milk', date: '2026-10-18', qty: '2 litres' });
    const yog = item({ name: 'Yoghurt', date: '2026-10-20' });
    const chicken = item({ name: 'Chicken', place: 'freezer', date: '2027-01-15' });
    const sauce = item({ name: 'Pasta sauce', kind: 'best', date: '2027-03-01', opened: '2026-10-15', openDays: 5 });
    const bread = item({ name: 'Bread', place: 'cupboard', kind: 'best', date: '2026-10-16' });
    const para = item({ name: 'Paracetamol syrup', place: 'medicine', kind: 'exp', date: '2026-10-03' });
    const drops = item({ name: 'Eye drops', place: 'medicine', kind: 'exp', date: '2027-03-31', monthOnly: true });
    const cough = item({ name: 'Cough syrup', place: 'medicine', kind: 'exp', date: '2026-11-10' });
    const all = [milk, yog, chicken, sauce, bread, para, drops, cough];
    eq(C.statusLine(milk, T), 'Use by Sun 18 Oct (tomorrow)', 'milk');
    eq(C.statusLine(yog, T), 'Use by Tue 20 Oct (in 3 days)', 'yoghurt');
    eq(C.statusLine(chicken, T), 'Use by Fri 15 Jan 2027 (in 2 months)', 'chicken next year shows the year');
    eq(C.effDate(sauce), '2026-10-20', 'opened sauce: 15 Oct + 5 days');
    eq(C.statusLine(sauce, T), 'Use by Tue 20 Oct (in 3 days), 5 days after opening', 'sauce after opening');
    eq(C.subLine(sauce, T), 'Fridge · opened Thu 15 Oct · best before Mon 1 Mar 2027 on the pack', 'sauce sub line');
    eq(C.statusLine(bread, T), 'Best before passed on Fri 16 Oct (yesterday): check it before eating', 'bread best before passed');
    eq(C.statusLine(para, T), 'Expired on Sat 3 Oct (2 weeks ago): do not use', 'paracetamol expired');
    eq(C.statusLine(drops, T), 'Expires end of Mar 2027 (in 5 months)', 'eye drops month only');
    eq(C.statusLine(cough, T), 'Expires Tue 10 Nov (in 3 weeks)', 'cough syrup');
    eq(C.subLine(milk, T), 'Fridge · 2 litres', 'milk sub line');
    const g = C.groups(all, T);
    eq(g.expired.map(i => i.name), ['Paracetamol syrup', 'Bread'], 'expired oldest first');
    eq(g.soon.map(i => i.name), ['Milk', 'Pasta sauce', 'Yoghurt', 'Cough syrup'], 'use soon: food within 3 days, medicine within 30, same date by name');
    eq(g.later.map(i => i.name), ['Chicken', 'Eye drops'], 'later');
    const s = C.summary(all, T);
    eq([s.expired, s.soon, s.later, s.total, s.next.name], [2, 4, 2, 8, 'Milk'], 'summary counts and next to use');
    eq(C.countPlaces(all), { fridge: 3, freezer: 1, cupboard: 1, medicine: 3 }, 'place counts');

    // ---- edges of the date rules
    eq(C.statusLine(item({ date: T }), T), 'Use by today, Sat 17 Oct', 'use by today');
    eq(C.classify(item({ date: T }), T).section, 'soon', 'today is still usable');
    eq(C.classify(item({ date: '2026-10-21' }), T).section, 'later', 'food 4 days away is later');
    eq(C.classify(item({ kind: 'exp', date: '2026-11-16' }), T).section, 'soon', 'medicine 30 days away is soon');
    eq(C.classify(item({ kind: 'exp', date: '2026-11-17' }), T).section, 'later', 'medicine 31 days away is later');
    eq(C.statusLine(item({ kind: 'exp', date: '2026-10-31', monthOnly: true }), T), 'Expires end of Oct 2026 (in 2 weeks)', 'month only this month');
    eq(C.statusLine(item({ kind: 'exp', date: T }), T), 'Expires today, Sat 17 Oct', 'medicine expires today');
    eq(C.statusLine(item({ kind: 'use', date: '2026-10-10' }), T), 'Use by date passed on Sat 10 Oct (7 days ago): do not eat', 'use by passed');
    eq(C.statusLine(item({ kind: 'best', date: '2026-10-25', opened: '2026-10-10', openDays: 3 }), T), 'Use by date passed on Tue 13 Oct (4 days ago), 3 days after opening: do not eat', 'opened limit passed');
    eq(C.statusLine(item({ kind: 'exp', date: '2027-06-30', monthOnly: true, opened: '2026-10-01', openDays: 28 }), T), 'Use by Thu 29 Oct (in 12 days), 28 days after opening', 'eye drops 28 days after opening');
    eq(C.classify(item({ kind: 'exp', date: '2027-06-30', opened: '2026-10-01', openDays: 28 }), T).section, 'later', 'opened medicine uses the 3-day window');
    eq(C.effDate(item({ date: '2026-10-19', opened: '2026-10-17', openDays: 5 })), '2026-10-19', 'printed date wins when it comes first');
    eq(C.byOpening(item({ date: '2026-10-19', opened: '2026-10-17', openDays: 5 })), false, 'not by opening then');
    eq(C.subLine(item({ date: '2026-10-19', opened: '2026-10-17', openDays: 5 }), T), 'Fridge · opened Sat 17 Oct', 'opened shown even when the printed date wins');
    eq(C.classify(item({ status: 'used', statusDate: T }), T).section, 'archive', 'used goes to archive');

    // ---- copy texts and shopping list
    eq(C.itemText(milk, T), 'Milk (2 litres), fridge: use by Sun 18 Oct (tomorrow)', 'item text');
    const lt = C.listText(all, T).split('\n');
    eq(lt[0], 'Food and medicine expiry dates, Sat 17 Oct 2026', 'list title');
    eq(lt[2], 'Expired:', 'list first group');
    eq(lt[3], '- Paracetamol syrup, medicine box: expired on Sat 3 Oct (2 weeks ago): do not use', 'list line');
    eq(C.listText([], T), '', 'empty list text');
    const used = [item({ name: 'Eggs', status: 'used', statusDate: '2026-10-16' }), item({ name: 'eggs', status: 'wasted', statusDate: '2026-10-12' }),
        item({ name: 'Butter', status: 'wasted', statusDate: '2026-10-15' }), item({ name: 'Rice', status: 'used', statusDate: '2026-08-01' }),
        item({ name: 'Milk', status: 'used', statusDate: '2026-10-14' }), item({ name: 'Bread', status: 'used', statusDate: '2026-10-14' })];
    eq(C.shoppingList(used.concat([milk, bread]), T), ['Bread', 'Butter', 'Eggs'], 'shopping A to Z: recent, one each, skips milk we have, keeps expired bread, skips old rice');
    eq(C.shoppingList([], T), [], 'shopping empty');
    const s2 = C.summary(used, T);
    eq([s2.used30, s2.wasted30, s2.total, s2.next], [3, 2, 0, null], 'used and thrown away in 30 days');

    // ---- calendar
    const cal = C.ics(all, T, '20261017T090000Z');
    eq(cal.count, 6, 'calendar skips the 2 expired items');
    eq(cal.text.includes('SUMMARY:Use by today: Milk (fridge)'), true, 'milk event');
    eq(cal.text.includes('DTSTART;VALUE=DATE:20261018'), true, 'milk date');
    eq(cal.text.includes('SUMMARY:Expires: Eye drops (medicine box)'), true, 'medicine event');
    eq(cal.text.includes('DTSTART;VALUE=DATE:20270331'), true, 'end of month');
    eq((cal.text.match(/TRIGGER:-P30D/g) || []).length, 1, 'only the eye drops (5 months away) get the 30-day reminder');
    eq((cal.text.match(/TRIGGER:-P7D/g) || []).length, 2, 'both future medicines get the 7-day reminder');
    eq(C.ics([item({ date: T, name: 'Fish' })], T, 'x').text.includes('TRIGGER:-PT15H'), false, 'no day-before reminder for today');
    eq(C.ics([item({ date: T, name: 'Fish' })], T, 'x').text.includes('TRIGGER:PT9H'), true, 'morning reminder for today');
    eq(C.ics([item({ name: 'A,b;c' })], T, 'x').text.includes('A\\,b\\;c'), true, 'escapes commas');
    eq(cal.text.endsWith('END:VCALENDAR\r\n'), true, 'ends right');

    // ---- the form
    let r = C.readForm(form(), T);
    eq([r.ok, r.item.name, r.item.date, r.item.monthOnly, r.item.opened], [true, 'Milk', '2026-10-18', false, ''], 'simple form');
    eq(C.readForm(form({ name: '   ' }), T).errs.name !== undefined, true, 'blank name');
    eq(C.readForm(form({ date: '' }), T).errs.date, 'Choose the date printed on the pack, or tap a button such as "In 1 week".', 'no date');
    eq(C.readForm(form({ date: '2026-02-30' }), T).errs.date, 'That date is not valid.', 'bad date');
    eq(C.readForm(form({ date: '2016-10-16' }), T).errs.date, 'That is more than 10 years ago. Check the year.', 'too old');
    eq(C.readForm(form({ date: '2057-01-01' }), T).errs.date, 'That is more than 30 years away. Check the year.', 'too far');
    eq(C.readForm(form({ date: '2026-10-01' }), T).ok, true, 'already passed date is allowed (found an old pack)');
    r = C.readForm(form({ mode: 'month', month: '3', year: '2027', date: '' }), T);
    eq([r.ok, r.item.date, r.item.monthOnly], [true, '2027-03-31', true], 'month and year only');
    eq(C.readForm(form({ mode: 'month', month: '', year: '2027' }), T).errs.date, 'Choose the month and the year printed on the pack.', 'month missing');
    r = C.readForm(form({ opened: '2026-10-15', openDays: '5' }), T);
    eq([r.ok, r.item.opened, r.item.openDays], [true, '2026-10-15', 5], 'opened');
    eq(C.readForm(form({ opened: '2026-10-18', openDays: '5' }), T).errs.opened, 'The opening day cannot be in the future.', 'opened in future');
    eq(C.readForm(form({ opened: '', openDays: '5' }), T).errs.opened, 'Choose the day you opened it.', 'opened blank');
    ['0', '-3', '2.5', '366', '', 'abc'].forEach(v => eq(C.readForm(form({ opened: T, openDays: v }), T).errs.openDays !== undefined, true, 'bad open days ' + v));
    eq(C.readForm(form({ opened: T, openDays: '365' }), T).ok, true, '365 open days ok');
    r = C.readForm(form({ name: '  Very   long ' + 'x'.repeat(200), qty: ' 500 g ', note: 'Line 1\r\nLine 2', place: 'nope', kind: 'zzz' }), T);
    eq([r.item.name.length, r.item.qty, r.item.note, r.item.place, r.item.kind], [80, '500 g', 'Line 1\nLine 2', 'fridge', 'use'], 'clipping and bad selects');
    eq(C.readForm(form({ name: '<img src=x onerror=alert(1)>' }), T).item.name, '<img src=x onerror=alert(1)>', 'tags kept as plain text (page uses textContent)');

    // ---- saved data
    eq(C.validate(null), null, 'null state');
    eq(C.validate({ items: 'x' }), null, 'bad items');
    const v = C.validate({ nextId: 2, lastPlace: 'medicine', items: [{ id: 5, name: 'Milk', date: '2026-10-18', place: 'fridge' }, { id: 5, name: 'Dup', date: '2026-10-18' },
        { id: 6, name: '', date: '2026-10-18' }, { id: 7, name: 'Bad date', date: '18/10/2026' }, { id: 8, name: 'Drops', date: '2027-03-05', monthOnly: true, kind: 'exp', place: 'medicine', opened: '2026-10-01', openDays: 999 },
        { id: 9, name: 'Gone', date: '2026-10-01', status: 'wasted', statusDate: '2026-10-10' }, 'junk', null] });
    eq(v.items.map(i => i.id), [5, 8, 9], 'keeps valid, drops duplicates and broken');
    eq(v.nextId, 10, 'next id above the biggest');
    eq(v.lastPlace, 'medicine', 'last place');
    eq(v.items[1].date, '2027-03-31', 'month only moved to month end');
    eq([v.items[1].opened, v.items[1].openDays], ['', 0], 'bad open days dropped');
    eq(v.items[2].status, 'wasted', 'status kept');
    eq(C.validate(C.emptyState()).items, [], 'empty state round trip');

    const msg = (failed ? out.join('\n') + '\n' : '') + pass + ' passed, ' + failed + ' failed';
    if (typeof document !== 'undefined') { const p = document.createElement('pre'); p.textContent = msg; document.body.appendChild(p); }
    else { console.log(msg); if (failed) process.exitCode = 1; }
})();
