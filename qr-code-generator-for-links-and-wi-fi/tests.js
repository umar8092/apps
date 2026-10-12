// Logic checks. Run with: node tests.js   (or open test.html in a browser)
function runTests(C) {
    const out = [];
    const t = (name, fn) => { let ok = false; try { ok = fn() === true; } catch (e) { ok = false; name += ' (threw ' + e.message + ')'; } out.push({ name, ok }); };
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const P = C.buildPayload;

    // Link
    t('link: https added when missing', () => P('link', { url: 'example.com/menu' }).text === 'https://example.com/menu');
    t('link: kept as typed with http', () => P('link', { url: 'http://shop.example.com/a?b=1#c' }).text === 'http://shop.example.com/a?b=1#c');
    t('link: spaces and pasted new lines trimmed', () => P('link', { url: '  https://ex.com/a\n' }).text === 'https://ex.com/a');
    t('link: inner spaces become %20 with a note', () => { const p = P('link', { url: 'ex.com/my file.pdf' }); return p.text === 'https://ex.com/my%20file.pdf' && p.notes.length === 1; });
    t('link: blank refused', () => !P('link', { url: '   ' }).ok && P('link', { url: '' }).field === 'url');
    t('link: port is not taken for a scheme', () => P('link', { url: 'example.com:8080/x' }).text === 'https://example.com:8080/x');
    t('link: whatsapp/mailto schemes kept', () => P('link', { url: 'mailto:a@b.com' }).text === 'mailto:a@b.com');
    t('link: host with no dot warns but works', () => { const p = P('link', { url: 'mycafe' }); return p.ok && p.notes.some(n => /no ending/.test(n)); });
    t('link: localhost no warning', () => P('link', { url: 'http://localhost:3000' }).notes.length === 0);

    // Wi-Fi
    t('wifi: WPA code exact', () => P('wifi', { ssid: 'Cafe Guest', security: 'WPA', password: 'coffee2024' }).text === 'WIFI:T:WPA;S:Cafe Guest;P:coffee2024;;');
    t('wifi: special characters escaped', () => P('wifi', { ssid: 'My;Net,1', security: 'WPA', password: 'a:b"c\\d;e' }).text === 'WIFI:T:WPA;S:My\\;Net\\,1;P:a\\:b\\"c\\\\d\\;e;;');
    t('wifi: open network has no password', () => P('wifi', { ssid: 'Library', security: 'nopass', password: 'ignored' }).text === 'WIFI:T:nopass;S:Library;;');
    t('wifi: hidden network', () => P('wifi', { ssid: 'Home', security: 'WPA', password: '12345678x', hidden: true }).text === 'WIFI:T:WPA;S:Home;P:12345678x;H:true;;');
    t('wifi: hex-looking name and password quoted', () => P('wifi', { ssid: 'ABCD', security: 'WPA', password: '12345678' }).text === 'WIFI:T:WPA;S:"ABCD";P:"12345678";;');
    t('wifi: odd-length hex not quoted', () => P('wifi', { ssid: 'ABC', security: 'WPA', password: '123456789' }).text === 'WIFI:T:WPA;S:ABC;P:123456789;;');
    t('wifi: missing name refused', () => P('wifi', { ssid: ' ', security: 'WPA', password: 'x' }).field === 'ssid');
    t('wifi: missing password refused for WPA', () => P('wifi', { ssid: 'A', security: 'WPA', password: '' }).field === 'password');
    t('wifi: short WPA password warns but still makes a code', () => { const p = P('wifi', { ssid: 'A', security: 'WPA', password: 'short' }); return p.ok && p.notes.some(n => /8 characters/.test(n)); });
    t('wifi: password spaces kept and warned', () => { const p = P('wifi', { ssid: 'A', security: 'WPA', password: ' pass word1 ' }); return p.text === 'WIFI:T:WPA;S:A;P: pass word1 ;;' && p.notes.some(n => /space/.test(n)); });
    t('wifi: WEP length warning', () => P('wifi', { ssid: 'A', security: 'WEP', password: 'abcd' }).notes.some(n => /WEP/.test(n)) && P('wifi', { ssid: 'A', security: 'WEP', password: 'abcde' }).notes.length === 0);
    t('wifi: name over 32 bytes refused', () => !P('wifi', { ssid: 'x'.repeat(33), security: 'nopass' }).ok && P('wifi', { ssid: 'x'.repeat(32), security: 'nopass' }).ok);
    t('wifi: unknown security falls back to WPA', () => P('wifi', { ssid: 'A', security: 'zzz', password: 'abcdefgh1' }).text.startsWith('WIFI:T:WPA;'));
    t('wifi: emoji and Urdu name', () => P('wifi', { ssid: 'گھر ☕', security: 'nopass' }).text === 'WIFI:T:nopass;S:گھر ☕;;');

    // Text
    t('text: kept, trailing space trimmed', () => P('text', { text: 'Hello\r\nworld  ' }).text === 'Hello\nworld');
    t('text: blank refused', () => !P('text', { text: ' \n ' }).ok);

    // Contact
    const vc = P('contact', { first: 'Sara', last: 'Khan', mobile: '+92 300 123-4567', email: 'sara@example.com', org: 'Khan & Co, Ltd', title: 'Owner', website: 'khan.example.com', address: '12 Mall Rd\nLahore', note: 'Call after 5; thanks' });
    t('contact: vCard exact', () => vc.text === ['BEGIN:VCARD', 'VERSION:3.0', 'N:Khan;Sara;;;', 'FN:Sara Khan', 'ORG:Khan & Co\\, Ltd', 'TITLE:Owner', 'TEL;TYPE=CELL:+923001234567', 'EMAIL:sara@example.com', 'URL:https://khan.example.com', 'ADR:;;12 Mall Rd\\, Lahore;;;;', 'NOTE:Call after 5\\; thanks', 'END:VCARD'].join('\n'));
    t('contact: company only', () => P('contact', { org: 'Bakery' }).text.includes('FN:Bakery'));
    t('contact: nothing refused', () => P('contact', { email: 'a@b.co' }).field === 'first');
    t('contact: bad phone refused with field', () => P('contact', { first: 'A', mobile: 'call me' }).field === 'mobile');
    t('contact: bad email refused', () => P('contact', { first: 'A', email: 'a@b' }).field === 'email');

    // Phone, SMS, email
    t('phone: cleaned', () => P('phone', { number: '+44 (0)20 7946-0958' }).text === 'tel:+4402079460958');
    t('phone: no country code gives a tip', () => P('phone', { number: '0300 1234567' }).notes.length === 1 && P('phone', { number: '+923001234567' }).notes.length === 0);
    t('phone: letters refused', () => !P('phone', { number: '0800-FLOWERS' }).ok);
    t('phone: + in the middle refused', () => !P('phone', { number: '12+34' }).ok);
    t('phone: too short / blank refused', () => !P('phone', { number: '12' }).ok && !P('phone', { number: '' }).ok);
    t('sms: number and message', () => P('sms', { number: '+1 555 0100', message: 'STOP' }).text === 'SMSTO:+15550100:STOP');
    t('sms: message optional', () => P('sms', { number: '5550100' }).text === 'SMSTO:5550100:');
    t('email: subject and body encoded', () => P('email', { to: 'help@shop.com', subject: 'Order #12 & more', body: 'Hi,\nthanks' }).text === 'mailto:help@shop.com?subject=Order%20%2312%20%26%20more&body=Hi%2C%0D%0Athanks');
    t('email: address only', () => P('email', { to: ' help@shop.com ' }).text === 'mailto:help@shop.com');
    t('email: bad address refused', () => !P('email', { to: 'help at shop' }).ok && !P('email', { to: '' }).ok);
    t('unknown type refused', () => !P('nope', {}).ok);

    // Encoding
    t('encode: short link is version 2 or less at M', () => { const e = C.encode('https://example.com/menu', 'M'); return e.ok && e.version <= 2 && e.size === e.modules.length; });
    t('encode: higher error correction never smaller', () => C.encode('https://example.com/menu', 'H').size >= C.encode('https://example.com/menu', 'L').size);
    t('encode: byte limit exact at M', () => C.encode('#'.repeat(2331), 'M').ok && !C.encode('#'.repeat(2332), 'M').ok);
    t('encode: too long at M explains and suggests Low', () => { const e = C.encode('#'.repeat(2500), 'M'); return !e.ok && e.max === 2331 && /Low/.test(e.error); });
    t('encode: too long even at Low says make it shorter', () => { const e = C.encode('#'.repeat(3000), 'L'); return !e.ok && /shorter/.test(e.error) && !/Choose Low/.test(e.error); });
    t('encode: byte limit exact at L', () => C.encode('#'.repeat(2953), 'L').ok && !C.encode('#'.repeat(2954), 'L').ok);
    t('encode: emoji counted as 4 bytes', () => C.utf8Length('☕a😀') === 3 + 1 + 4);
    t('encode: bad level falls back to M', () => C.encode('hi', 'Z').ok);

    // Layout and files
    t('layout: whole-pixel squares, exact width, border at least 4 squares', () => { const l = C.layout(25, 1024); return l.width === 1024 && l.unit === 31 && l.offset === 124 && l.offset >= 4 * l.unit; });
    t('layout: too small grows to the minimum', () => { const l = C.layout(25, 10); return l.width === 33 && l.unit === 1 && l.grew; });
    t('svg path: one row run', () => C.svgPath([[true, true, false, true]], 0) === 'M0 0h2v1h-2zM3 0h1v1h-1z');
    t('svg file: caption escaped, no raw tags', () => { const s = C.svgFile([[true]], { lines: [{ text: '<b>Wi & Fi</b>' }] }); return s.includes('&lt;b&gt;Wi &amp; Fi&lt;/b&gt;') && !s.includes('<b>'); });
    t('svg file: transparent has no background rect', () => !C.svgFile([[true]], { transparent: true }).includes('<rect') && C.svgFile([[true]], {}).includes('<rect'));
    t('svg file: bad colours fall back to black on white', () => C.svgFile([[true]], { fg: 'red;"', bg: 'x' }).includes('fill="#000000"'));
    t('print width: small code 2 cm, big code wider', () => C.printWidthCm(21) === 2 && C.printWidthCm(77) === 4.5);

    // Colours
    t('colour: black on white fine', () => C.colourCheck('#000000', '#ffffff').ok && C.colourCheck('#000000', '#ffffff').warning === '');
    t('colour: inverted warned', () => { const c = C.colourCheck('#ffffff', '#000000'); return !c.ok && /lighter/.test(c.warning); });
    t('colour: too alike warned', () => !C.colourCheck('#777777', '#888888').ok);
    t('colour: dark blue on cream fine', () => C.colourCheck('#1e3a8a', '#fff8e7').ok);
    t('colour: see-through warns to use a light background', () => /light background/.test(C.colourCheck('#000000', '#ffffff', true).warning));

    // Words and saved data
    t('describe: wifi', () => C.describe('wifi', { ssid: 'Cafe Guest' }) === 'Joins Wi-Fi Cafe Guest');
    t('describe: link drops https', () => C.describe('link', { url: 'https://ex.com/a' }) === 'Opens ex.com/a');
    t('caption: own words then network and password', () => eq(C.captionLines('wifi', { ssid: 'Cafe', security: 'WPA', password: 'beans1234' }, { caption: 'Scan to join' }).map(l => l.text), ['Scan to join', 'Network: Cafe', 'Password: beans1234']));
    t('caption: open network says No password', () => eq(C.captionLines('wifi', { ssid: 'Cafe', security: 'nopass' }, {}).map(l => l.text), ['Network: Cafe', 'No password']));
    t('caption: wifi text can be turned off', () => C.captionLines('wifi', { ssid: 'Cafe', security: 'nopass' }, { wifiText: false }).length === 0);
    t('caption: link has only own words', () => eq(C.captionLines('link', { url: 'x.com' }, { caption: ' Menu ' }).map(l => l.text), ['Menu']));
    t('clean fields: odd values dropped', () => eq(C.cleanFields('wifi', { ssid: 5, password: 'p', hidden: 'yes', security: 'bad', extra: 'x' }), { security: 'WPA', password: 'p', hidden: false }));
    t('clean look: defaults and limits', () => { const l = C.cleanLook({ ecl: 'X', fg: 'red', size: 99999, caption: 7 }); return l.ecl === 'M' && l.fg === '#000000' && l.size === 1024 && l.caption === ''; });
    t('clean look: custom size kept', () => C.cleanLook({ size: 300 }).size === 300 && C.cleanLook({ size: 63 }).size === 1024);
    t('clean saved: corrupt list ignored', () => eq(C.cleanSaved('nope'), []) && eq(C.cleanSaved([null, { type: 'x', id: 'a' }]), []));
    t('clean saved: duplicates dropped, blank name described', () => { const s = C.cleanSaved([{ id: 'a', type: 'link', name: ' ', fields: { url: 'x.com' } }, { id: 'a', type: 'link' }]); return s.length === 1 && s[0].name === 'Opens x.com'; });
    return out;
}
if (typeof module !== 'undefined' && require.main === module) {
    const r = runTests(require('./core.js'));
    r.filter(x => !x.ok).forEach(x => console.log('FAIL', x.name));
    console.log(r.filter(x => x.ok).length + ' of ' + r.length + ' checks passed');
    process.exit(r.every(x => x.ok) ? 0 : 1);
}
