// Logic checks for core.js. Run: node tests.js  (or open test.html in a browser)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.WarrantyCore;
    let pass = 0, failed = 0; const out = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); } };
    const T = '2026-10-15';   // a Thursday
    const item = o => Object.assign({ id: 1, name: 'Thing', shop: '', bought: '2026-10-03', delivered: '', ret: { t: 'days', days: 30 }, war: { t: 'months', months: 24 },
        ext: 0, price: null, order: '', serial: '', note: '', photo: '', status: 'active', statusDate: '', kept: false }, o);
    const form = o => Object.assign({ name: 'Washing machine', shop: 'Currys', bought: '2026-10-03', delivered: '', retSel: '30', retDays: '', retUntil: '',
        warSel: '24', warNum: '', warUnit: 'm', warUntil: '', extSel: '0', extNum: '', extUnit: 'y', price: '', order: '', serial: '', note: '' }, o);

    // ---- warranty periods: the day before the same date N months later, or the month's last day
    eq(C.periodEnd('2026-10-03', 24), '2028-10-02', '2 years from 3 Oct 2026');
    eq(C.periodEnd('2026-01-31', 1), '2026-02-28', '1 month from 31 Jan');
    eq(C.periodEnd('2026-01-30', 1), '2026-02-28', '1 month from 30 Jan (Feb has 28)');
    eq(C.periodEnd('2024-01-31', 1), '2024-02-29', '1 month from 31 Jan in a leap year');
    eq(C.periodEnd('2024-02-29', 12), '2025-02-28', '1 year from 29 Feb');
    eq(C.periodEnd('2024-02-29', 48), '2028-02-28', '4 years from 29 Feb (next 29 Feb exists, day before)');
    eq(C.periodEnd('2026-03-01', 1), '2026-03-31', '1 month from 1 Mar');
    eq(C.periodEnd('2026-12-15', 3), '2027-03-14', '3 months crossing the new year');
    eq(C.periodEnd('2026-03-31', 6), '2026-09-30', '6 months from 31 Mar (Sep has 30)');
    eq(C.addMonths('2026-01-31', 1), '2026-02-28', 'addMonths keeps month end');

    // ---- the main situation
    const washer = item({ name: 'Washing machine', shop: 'Currys', price: 44999 });
    eq(C.returnEnd(washer), '2026-11-02', 'washer return by 30 days after 3 Oct');
    eq(C.returnLine(washer, T), 'Return by Mon 2 Nov (18 days left)', 'washer return line');
    eq(C.warrantyEnd(washer), '2028-10-02', 'washer warranty end');
    eq(C.warrantyLine(washer, T), 'Warranty until 2 Oct 2028 (1 year 11 months left)', 'washer warranty line');
    const shoes = item({ id: 2, name: 'Running shoes', shop: 'Zara', bought: '2026-10-09', ret: { t: 'days', days: 14 }, war: { t: 'none' } });
    eq(C.returnLine(shoes, T), 'Return by Fri 23 Oct (8 days left)', 'shoes return line');
    eq(C.warrantyLine(shoes, T), 'No warranty', 'shoes no warranty');
    const phone = item({ id: 3, name: 'Phone', shop: 'amazon.com', bought: '2026-10-10', delivered: '2026-10-14', ret: { t: 'days', days: 28 }, war: { t: 'months', months: 12 }, ext: 24 });
    eq(C.returnEnd(phone), '2026-11-11', 'online order counts from delivery');
    eq(C.warrantyEnd(phone), '2027-10-13', 'warranty from delivery');
    eq(C.extEnd(phone), '2029-10-13', 'extended warranty starts the day after the maker\'s ends');
    eq(C.extLine(phone, T), 'Extended warranty until 13 Oct 2029 (2 years 11 months left)', 'extended line');
    eq(C.coverEnd(phone), '2029-10-13', 'cover end is the extended end');

    // ---- time left texts
    eq(C.leftText(T, T), 'today is the last day', 'last day');
    eq(C.leftText(T, '2026-10-16'), '1 day left', '1 day');
    eq(C.leftText(T, C.addDays(T, 61)), '61 days left', '61 days');
    eq(C.leftText(T, C.addDays(T, 62)), '2 months left', '62 days is 2 months');
    eq(C.leftText(T, '2027-10-15'), '1 year left', 'exactly a year');
    eq(C.leftText(T, '2026-10-14'), '', 'past has no left text');
    eq(C.agoText(T, '2026-10-14'), 'yesterday', 'ago yesterday');
    eq(C.agoText(T, '2025-08-01'), '1 year 2 months ago', 'ago years');
    eq(C.returnLine(item({ bought: '2026-09-01' }), T), 'Return window closed Thu 1 Oct', 'closed return');
    eq(C.returnLine(item({ ret: { t: 'none' } }), T), 'No returns', 'no returns');
    eq(C.returnLine(item({ kept: true }), T), 'Keeping it (could return until Mon 2 Nov)', 'kept line');
    eq(C.returnLine(item({ bought: '2026-10-12', delivered: '2026-10-20', ret: { t: 'days', days: 14 } }), T), 'Return by Tue 3 Nov (19 days left) (counts from delivery on Tue 20 Oct)', 'not delivered yet');
    eq(C.returnLine(item({ ret: { t: 'until', until: '2027-01-31' } }), T), 'Return by Sun 31 Jan 2027 (3 months left)', 'returns until a date, next year shows year');
    eq(C.warrantyLine(item({ war: { t: 'life' } }), T), 'Lifetime warranty', 'lifetime');
    eq(C.warrantyLine(item({ bought: '2024-01-10', war: { t: 'months', months: 12 } }), T), 'Warranty ended 9 Jan 2025 (1 year 9 months ago)', 'ended warranty');
    eq(C.warrantyLine(item({ war: { t: 'none' }, ext: 12 }), T), '', 'no maker warranty but extended: no "No warranty" line');
    eq(C.extEnd(item({ war: { t: 'none' }, ext: 12 })), '2027-10-02', 'extended with no maker warranty starts on the day bought');
    eq(C.extEnd(item({ war: { t: 'life' }, ext: 12 })), null, 'no extended on lifetime');

    // ---- sections and order
    const old = item({ id: 4, name: 'Kettle', bought: '2023-02-01', war: { t: 'months', months: 12 } });
    const life = item({ id: 5, name: 'Backpack', bought: '2025-05-01', war: { t: 'life' } });
    const tv = item({ id: 6, name: 'TV', bought: '2025-11-01', war: { t: 'months', months: 12 } });   // ends 31 Oct 2026, 16 days
    const gone = item({ id: 7, name: 'Old phone', status: 'gone', statusDate: '2026-10-01' });
    const list = [washer, shoes, phone, old, life, tv, gone];
    const g = C.groups(list, T);
    eq(g.return.map(i => i.name), ['Running shoes', 'Washing machine', 'Phone'], 'return section sorted by deadline');
    eq(g.warranty.map(i => i.name), ['TV', 'Backpack'], 'warranty sorted, lifetime last');
    eq(g.ended.map(i => i.name), ['Kettle'], 'ended');
    eq(g.archive.map(i => i.name), ['Old phone'], 'archive');
    eq(C.classify(tv, T).soon, true, 'TV warranty ends within 30 days');
    eq(C.classify(shoes, T).soon, false, 'shoes 8 days left is not within 7');
    eq(C.classify(item({ bought: '2026-09-20' }), T).soon, true, '2 days left to return is soon');
    eq(C.classify(item({ kept: true }), T).section, 'warranty', 'kept item moves to warranty');
    eq(C.classify(item({ kept: true, war: { t: 'none' } }), T).section, 'ended', 'kept item with no warranty has no cover');
    const s = C.summary(list, T, '');
    eq([s.canReturn, s.covered, s.ended, s.archived, s.soonReturn, s.soonWar, s.total], [3, 4, 1, 1, 0, 1, 6], 'summary counts (shoes have no warranty)');
    eq(s.next && [s.next.name, s.next.date, s.next.left], ['Running shoes', '2026-10-23', '8 days left'], 'next deadline');
    eq(C.summary([life], T, '').next, null, 'only lifetime: no next deadline');
    eq(C.summary([washer, tv], T, '').next.name, 'TV', 'next deadline is the earliest, even a warranty before a return');
    eq(C.cleanItem(Object.assign({}, washer, { photo: 'p1792040400000' + '57' })).photo, 'p179204040000057', 'real receipt ids kept');
    eq(C.summary([], T, '').total, 0, 'empty summary');
    eq(C.summary([washer, item({ id: 9, price: 1001, war: { t: 'none' }, ret: { t: 'none' } })], T, '').coveredWorth, 44999, 'worth only counts covered items');

    // ---- money
    eq(C.parsePrice('449.99').cents, 44999, 'price');
    eq(C.parsePrice('$1,299.00').cents, 129900, 'price with symbol and thousands');
    eq(C.parsePrice('1.299,50 €').cents, 129950, 'european price');
    eq(C.parsePrice('9,99').cents, 999, 'comma decimal');
    eq(C.parsePrice('0').cents, 0, 'zero price');
    eq(C.parsePrice('').cents, null, 'blank price is fine');
    eq(!!C.parsePrice('-5').err, true, 'negative price');
    eq(!!C.parsePrice('abc').err, true, 'text price');
    eq(!!C.parsePrice('99999999').err, true, 'huge price');
    eq(C.parsePrice('0.005').cents, 1, 'rounds half a cent up');
    eq(C.fmt(129950, '£'), '£1,299.50', 'fmt symbol');
    eq(C.fmt(500, 'AED'), 'AED 5.00', 'fmt letters');
    eq(C.fmt(0, ''), '0.00', 'fmt zero');

    // ---- reading the form
    let r = C.readForm(form(), T);
    eq(r.ok, true, 'good form');
    eq([r.item.name, r.item.shop, r.item.ret, r.item.war, r.item.ext, r.item.price], ['Washing machine', 'Currys', { t: 'days', days: 30 }, { t: 'months', months: 24 }, 0, null], 'form values, price optional');
    eq(C.readForm(form({ name: '   ' }), T).errs.name !== undefined, true, 'blank name');
    eq(C.readForm(form({ name: '  Big   TV \n 55"  ' }), T).item.name, 'Big TV 55"', 'pasted name cleaned');
    eq(C.readForm(form({ name: 'x'.repeat(300) }), T).item.name.length, 80, 'very long name clipped');
    eq(C.readForm(form({ bought: '2026-10-16' }), T).errs.bought, 'The day you bought it cannot be after today.', 'future purchase');
    eq(C.readForm(form({ bought: '' }), T).errs.bought, 'Choose the day you bought it.', 'blank date');
    eq(C.readForm(form({ bought: '2026-02-30' }), T).errs.bought !== undefined, true, 'impossible date');
    eq(C.readForm(form({ delivered: '2026-10-01' }), T).errs.delivered, 'Delivery cannot be before the day you bought it.', 'delivery before purchase');
    eq(C.readForm(form({ delivered: '2026-10-20' }), T).item.delivered, '2026-10-20', 'future delivery allowed');
    eq(C.readForm(form({ delivered: '2027-03-01' }), T).errs.delivered !== undefined, true, 'delivery too far ahead');
    eq(C.readForm(form({ delivered: '2026-10-03' }), T).item.delivered, '', 'delivery same day as bought is dropped');
    eq(C.readForm(form({ retSel: 'custom', retDays: '0' }), T).errs.ret !== undefined, true, '0 return days');
    eq(C.readForm(form({ retSel: 'custom', retDays: '366' }), T).errs.ret !== undefined, true, '366 return days');
    eq(C.readForm(form({ retSel: 'custom', retDays: '1.5' }), T).errs.ret !== undefined, true, 'decimal return days');
    eq(C.readForm(form({ retSel: 'custom', retDays: '-3' }), T).errs.ret !== undefined, true, 'negative return days');
    eq(C.readForm(form({ retSel: 'custom', retDays: ' 45 ' }), T).item.ret, { t: 'days', days: 45 }, 'custom return days');
    eq(C.readForm(form({ retSel: 'none' }), T).item.ret, { t: 'none' }, 'no returns');
    eq(C.readForm(form({ retSel: 'until', retUntil: '2026-09-01' }), T).errs.ret !== undefined, true, 'return until before purchase');
    eq(C.readForm(form({ retSel: 'until', retUntil: '2027-01-31' }), T).item.ret, { t: 'until', until: '2027-01-31' }, 'return until a date');
    eq(C.readForm(form({ warSel: 'custom', warNum: '51', warUnit: 'y' }), T).errs.war !== undefined, true, '51 years');
    eq(C.readForm(form({ warSel: 'custom', warNum: '50', warUnit: 'y' }), T).item.war, { t: 'months', months: 600 }, '50 years');
    eq(C.readForm(form({ warSel: 'custom', warNum: '18', warUnit: 'm' }), T).item.war, { t: 'months', months: 18 }, '18 months');
    eq(C.readForm(form({ warSel: 'custom', warNum: '', warUnit: 'm' }), T).errs.war !== undefined, true, 'blank warranty length');
    eq(C.readForm(form({ warSel: 'until', warUntil: '2026-01-01' }), T).errs.war !== undefined, true, 'warranty until before purchase');
    eq(C.readForm(form({ warSel: 'life', extSel: '12' }), T).errs.ext !== undefined, true, 'extended on lifetime refused');
    eq(C.readForm(form({ extSel: 'custom', extNum: '3', extUnit: 'y' }), T).item.ext, 36, 'extended custom years');
    eq(C.readForm(form({ price: '-1' }), T).errs.price !== undefined, true, 'negative price in form');
    eq(C.readForm(form({ note: 'line 1\r\n\r\n\r\n\r\nline 2' }), T).item.note, 'line 1\n\nline 2', 'notes keep line breaks');
    eq(C.previewText(form(), T), 'Return by Mon 2 Nov · Warranty until 2 Oct 2028', 'form preview');
    eq(C.previewText(form({ bought: '2026-09-01', retSel: '14', warSel: 'none' }), T), 'Return window closed Tue 15 Sep · No warranty', 'preview closed');
    eq(C.previewText(form({ extSel: '36' }), T), 'Return by Mon 2 Nov · Warranty until 2 Oct 2028 · Extended until 2 Oct 2031', 'preview extended');

    // ---- copy text
    eq(C.itemText(washer, T, '£'), 'Washing machine (Currys)\nBought 3 Oct 2026, £449.99\nReturn by Mon 2 Nov (18 days left)\nWarranty until 2 Oct 2028 (1 year 11 months left)', 'item text');
    eq(C.listText([], T, ''), '', 'empty list text');
    eq(C.listText([washer, old], T, '').split('\n')[0], 'My purchases, return deadlines and warranties (15 Oct 2026)', 'list text title');
    eq(C.listText([washer, old, gone], T, '').includes('Old phone'), false, 'archived not in list text');

    // ---- calendar
    const cal = C.ics([washer, shoes, phone, old, life, gone], T, '20261015T050000Z');
    eq(cal.count, 6, 'calendar events: 3 returns + 2 warranties + 1 extended');
    eq(cal.text.includes('DTSTART;VALUE=DATE:20261102'), true, 'washer return date in calendar');
    eq(cal.text.includes('SUMMARY:Last day to return Running shoes to Zara'), true, 'return summary');
    eq(cal.text.includes('DTSTART;VALUE=DATE:20281002'), true, 'washer warranty date');
    eq(cal.text.includes('Kettle'), false, 'ended items have no events');
    eq(cal.text.includes('Old phone'), false, 'archived items have no events');
    eq(cal.text.split('\r\n').every(l => l.length <= 75), true, 'lines folded');
    eq(C.ics([item({ kept: true })], T, 'x').count, 1, 'kept item only gets the warranty event');

    // ---- saved state
    eq(C.validate(null), null, 'null state');
    eq(C.validate({ items: 'x' }), null, 'bad items');
    const v = C.validate({ items: [washer, { id: 'x' }, { id: 8, name: '', bought: T }, { id: 9, name: 'A', bought: 'nope' }, Object.assign({}, washer), { id: 10, name: 'Hack', bought: T, ret: { t: 'days', days: 9999 }, war: { t: 'months', months: -1 }, price: -5, photo: '../evil', status: 'weird', ext: 99999 }], cur: '<b>', nextId: 2 });
    eq(v.items.length, 2, 'bad items and duplicate ids dropped');
    eq(v.items[1].ret, { t: 'none' }, 'bad return window dropped');
    eq(v.items[1].war, { t: 'none' }, 'bad warranty dropped');
    eq([v.items[1].price, v.items[1].photo, v.items[1].status, v.items[1].ext, v.cur], [null, '', 'active', 0, ''], 'bad values cleaned');
    eq(v.nextId, 11, 'nextId above every id');
    eq(C.okPhoto('data:image/jpeg;base64,AAAA'), true, 'photo ok');
    eq(C.okPhoto('data:text/html;base64,AAAA'), false, 'html refused');
    eq(C.okPhoto('javascript:alert(1)'), false, 'script refused');

    const msg = (failed ? out.join('\n') + '\n' : '') + pass + ' passed, ' + failed + ' failed';
    if (typeof document !== 'undefined') { const p = document.createElement('pre'); p.textContent = msg; document.body.appendChild(p); document.title = failed ? 'FAILED' : 'PASSED'; }
    else { console.log(msg); if (failed) process.exit(1); }
})();
