// Logic checks for core.js. Run: node loyalty-and-membership-card-wallet/tests.js  (or open test.html)
(function (root) {
    const C = typeof require !== 'undefined' ? require('./core.js') : root.WalletCore;
    let pass = 0; const fails = [];
    const eq = (got, want, name) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(name + ': got ' + g + ', want ' + w); };

    // check digits worked by hand: 9501101530003 -> 9+15+0+3+1+0+1+15+3+0+0+0 = 47 (weights 1,3 from the left) -> 3
    eq(C.checkDigit('950110153000'), '3', 'EAN-13 check digit');
    eq(C.checkDigit('400638133393'), '1', 'EAN-13 check digit 2');
    eq(C.checkDigit('03600029145'), '2', 'UPC-A check digit');
    eq(C.checkDigit('9638507'), '4', 'EAN-8 check digit');
    eq(C.validCheck('9501101530004'), false, 'wrong check digit');

    // cleaning what was typed or pasted
    eq(C.clean(' 9 501101 530003 '), '9501101530003', 'spaces removed from digits');
    eq(C.clean('1234-5678-9012'), '123456789012', 'dashes removed');
    eq(C.clean('AB 12  34'), 'AB 12 34', 'text keeps single spaces');
    eq(C.clean('​123﻿'), '123', 'invisible characters removed');
    eq(C.clean(''), '', 'blank');
    eq(C.clean(null), '', 'null');

    // working out the type
    eq(C.validate('9501101530003', 'auto').format, 'ean13', 'auto EAN-13');
    eq(C.validate('036000291452', 'auto').format, 'upca', 'auto UPC-A');
    eq(C.validate('96385074', 'auto').format, 'ean8', 'auto EAN-8');
    eq(C.validate('6000123456789012', 'auto').format, 'code128', 'auto long number Code 128');
    const bad = C.validate('9501101530004', 'auto');
    eq([bad.ok, bad.format, /does not match/.test(bad.warn)], [true, 'code128', true], 'auto wrong check digit warns and uses Code 128');
    eq(C.validate('MEM-00451', 'auto').format, 'code128', 'auto letters Code 128');
    eq(C.validate('كارت 12', 'auto').format, 'qr', 'auto non-English letters QR');
    eq(C.validate('0', 'auto').format, 'code128', 'zero is a valid number');
    eq(C.validate('   ', 'auto').ok, false, 'blank refused');
    eq(C.validate('1'.repeat(81), 'auto').ok, false, 'too long refused');
    eq(C.validate('1'.repeat(80), 'auto').ok, true, '80 characters allowed');

    // chosen types
    eq(C.validate('950110153000', 'ean13').error, 'EAN-13 needs 13 digits. You typed 12.', 'EAN-13 length');
    eq(/should be 3/.test(C.validate('9501101530004', 'ean13').error), true, 'EAN-13 says the right last digit');
    eq(/only have digits/.test(C.validate('95011A1530003', 'ean13').error), true, 'EAN-13 digits only');
    eq(C.validate('96385074', 'ean8').ok, true, 'EAN-8 ok');
    eq(C.validate('036000291452', 'upca').ok, true, 'UPC-A ok');
    eq(C.validate('abc 123', 'code39'), { ok: true, value: 'ABC 123', format: 'code39', warn: 'Code 39 has capital letters only, so it is shown in capitals.' }, 'Code 39 capitals');
    eq(C.validate('a@b', 'code39').ok, false, 'Code 39 refuses @');
    eq(C.validate('é', 'code128').ok, false, 'Code 128 refuses non-English letters');
    eq(C.validate('Any text, ünïcode', 'qr').ok, true, 'QR takes any text');
    eq(C.validate('12 34', 'none'), { ok: true, value: '1234', format: 'none' }, 'number only');
    eq(C.validate('x', 'nonsense').format, 'code128', 'unknown type treated as auto');

    // bars: EAN-13 always 95 modules, EAN-8 67, start and end guards
    const e13 = C.encode('9501101530003', 'ean13');
    eq([e13.type, e13.bits.length, e13.bits.slice(0, 3), e13.bits.slice(45, 50), e13.bits.slice(-3)], ['bars', 95, '101', '01010', '101'], 'EAN-13 shape');
    eq(C.encode('96385074', 'ean8').bits.length, 67, 'EAN-8 shape');
    eq(C.encode('036000291452', 'upca').bits, C.encode('0036000291452', 'ean13').bits, 'UPC-A is EAN-13 with a leading 0');
    // Code 128 values worked by hand for "12345678": start C (105), 12, 34, 56, 78, checksum (105+12+68+168+312) % 103 = 47
    eq(C.code128Values('12345678'), [105, 12, 34, 56, 78, 47], 'Code 128 set C');
    // "AB": start B (104), 33, 34, checksum (104+33+68) % 103 = 102
    eq(C.code128Values('AB'), [104, 33, 34, 102], 'Code 128 set B');
    eq(C.code128Values('123').slice(0, 4), [104, 17, 18, 19], 'short digits stay in set B');
    eq(C.code128('AB').length, 11 * 4 + 13, 'Code 128 width');
    eq(C.code39('A').split('').filter(b => b === '1').length > 0, true, 'Code 39 draws');
    eq(C.encode('hello', 'qr').type, 'qr', 'QR encodes');
    eq(C.encode('123', 'none').type, 'none', 'number only draws nothing');

    // display
    eq(C.display('9501101530003', 'ean13'), '9 501101 530003', 'EAN-13 grouping');
    eq(C.display('036000291452', 'upca'), '0 36000 29145 2', 'UPC-A grouping');
    eq(C.display('96385074', 'ean8'), '9638 5074', 'EAN-8 grouping');
    eq(C.display('6000123456789012', 'code128'), '6000 1234 5678 9012', 'long number in fours');
    eq(C.display('MEM-00451', 'code128'), 'MEM-00451', 'text unchanged');

    // expiry
    eq(C.expiry('2026-10-30', '2026-10-31'), { text: 'Expired 30 Oct 2026', level: 'expired' }, 'expired');
    eq(C.expiry('2026-10-31', '2026-10-31').text, 'Expires today', 'today');
    eq(C.expiry('2026-11-01', '2026-10-31').text, 'Expires tomorrow', 'tomorrow');
    eq(C.expiry('2026-11-30', '2026-10-31'), { text: 'Expires in 30 days (30 Nov 2026)', level: 'soon' }, '30 days');
    eq(C.expiry('2027-03-28', '2026-10-31').level, 'ok', 'far away');
    eq(C.expiry('2027-02-30', '2026-10-31'), null, 'impossible date ignored');
    eq(C.expiry('', '2026-10-31'), null, 'no date');
    eq(C.daysBetween('2026-03-28', '2026-03-30'), 2, 'days across a clock change');

    // stored or restored cards are checked
    eq(C.sanitize({ name: '  Imtiaz  ', number: '9 501101 530003', format: 'auto', color: 'zzz', uses: -4, expires: '2026-13-01' }) && true, true, 'messy card kept');
    const s = C.sanitize({ name: '  Imtiaz  ', number: '9 501101 530003', format: 'auto', color: 'zzz', uses: -4, expires: '2026-13-01' });
    eq([s.name, s.number, s.format, s.color, s.uses, s.expires], ['Imtiaz', '9501101530003', 'ean13', 'pink', 0, ''], 'messy card cleaned');
    eq(C.sanitize({ name: '', number: '123' }), null, 'no name refused');
    eq(C.sanitize({ name: 'X', number: '' }), null, 'no number refused');
    eq(C.sanitize({ name: 'X', number: '9501101530004', format: 'ean13' }), null, 'bad EAN-13 refused');
    eq(C.sanitize('<img>'), null, 'not an object refused');
    eq(C.sanitize({ name: 'A'.repeat(500), number: 5 }).name.length, 60, 'long name cut, number as number');
    eq(C.sanitizeList([{ id: 'a', name: 'X', number: '1' }, { id: 'a', name: 'Y', number: '2' }, null]).map(c => c.id === 'a'), [true, false], 'duplicate ids fixed');
    eq(C.sanitizeList('nope'), [], 'not a list');

    // backup merge
    const mine = C.sanitizeList([{ id: 'a', name: 'Imtiaz', number: '9501101530003' }]);
    const file = C.backup([...mine, ...C.sanitizeList([{ id: 'b', name: 'Library', number: 'LIB-778' }])], Date.UTC(2026, 9, 31));
    const m = C.merge(mine, file);
    eq([m.added, m.skipped, m.bad, m.cards.length], [1, 1, 0, 2], 'merge adds only new cards');
    eq(C.merge(mine, '{bad json').error, 'This file is not a card wallet backup.', 'bad json');
    eq(C.merge(mine, '{"cards":[]}').error, 'This file is not a card wallet backup.', 'other app json');
    eq(C.merge(mine, JSON.stringify([{ name: 'X' }, { name: 'Gym', number: 'G1' }])).bad, 1, 'bad rows counted');
    eq(C.findDuplicate(mine, '9501101530003', 'ean13', null).name, 'Imtiaz', 'duplicate found');
    eq(C.findDuplicate(mine, '9501101530003', 'ean13', 'a'), null, 'not a duplicate of itself');

    // order and search
    const many = C.sanitizeList([
        { id: '1', name: 'boots', number: '1', uses: 2, lastUsed: 5, created: 1 },
        { id: '2', name: 'Asda', number: '2', uses: 9, lastUsed: 1, created: 2 },
        { id: '3', name: 'Costa', number: '3', uses: 2, lastUsed: 9, created: 3, owner: 'Mum', note: 'gift card' }]);
    eq(C.list(many, 'used').map(c => c.id), ['2', '3', '1'], 'most used first, then most recent');
    eq(C.list(many, 'az').map(c => c.id), ['2', '1', '3'], 'A to Z ignores capitals');
    eq(C.list(many, 'new').map(c => c.id), ['3', '2', '1'], 'newest first');
    eq(C.list(many, 'used', 'mum').map(c => c.id), ['3'], 'search whose card');
    eq(C.list(many, 'used', 'GIFT').map(c => c.id), ['3'], 'search notes');
    eq(C.list(many, 'used', 'zzz'), [], 'no match');
    eq(C.textList(mine), 'Imtiaz: 9 501101 530003 [EAN-13]', 'text list');

    const out = { pass, fails };
    if (typeof module !== 'undefined' && module.exports) { module.exports = out; if (require.main === module) { console.log(pass + ' passed, ' + fails.length + ' failed'); fails.forEach(f => console.log('FAIL ' + f)); process.exit(fails.length ? 1 : 0); } }
    else root.TEST_RESULT = out;
})(typeof window !== 'undefined' ? window : globalThis);
