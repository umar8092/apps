// Drives the real page in headless Chromium through the shopkeeper's situation and every edge case.
// Run from the repo root with a static server on the repo:  node stock-reorder-list-for-small-shops/ui-test.js [base url]
// Default base: http://localhost:8765 (python3 -m http.server 8765). For the live site: https://umar8092.github.io/apps
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const BASE = (process.argv[2] || 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/stock-reorder-list-for-small-shops/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  got: ' + JSON.stringify(extra) : '')); } };
const txt = s => s.replace(/\s+/g, ' ').trim();

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const bad = []; p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
    await p.goto(URL, { waitUntil: 'networkidle' });
    await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle' });
    const T = async sel => txt(await p.locator(sel).first().innerText());
    const vis = sel => p.isVisible(sel);

    // ---------- first use, empty state ----------
    ok('empty: orders hidden', !(await vis('#orders')));
    ok('empty: stock list hidden', !(await vis('#list')));
    ok('empty: restore link offered', await vis('#restore-first'));
    ok('optional price is hidden behind a button', !(await vis('#f-price')) && await vis('#f-price-open'));
    ok('optional shop name hidden behind a button', !(await vis('#shop')) && await vis('#shop-open'));
    ok('presets filled for pieces', await p.inputValue('#f-low') === '5' && await p.inputValue('#f-full') === '20');
    await p.selectOption('#f-unit', 'carton');
    ok('presets follow the unit', await p.inputValue('#f-low') === '2' && await p.inputValue('#f-full') === '6');
    ok('stock label names the unit', (await T('#f-stock-l')) === 'In stock now (cartons)');

    // ---------- validation ----------
    await p.click('#f-save');
    ok('blank item refused', /Type the item/.test(await T('#f-name-err')));
    ok('blank stock refused', /Type how many you have now/.test(await T('#f-stock-err')));
    ok('focus goes to the first error', await p.evaluate(() => document.activeElement.id) === 'f-name');
    await p.fill('#f-name', 'Cooking oil 5 L'); await p.fill('#f-stock', '-2'); await p.click('#f-save');
    ok('negative stock refused', /minus/.test(await T('#f-stock-err')));
    await p.fill('#f-stock', '2'); await p.fill('#f-low', '6'); await p.click('#f-save');
    ok('full must be more than order level', /must be more than/.test(await T('#f-full-err')));
    await p.fill('#f-low', '2'); await p.fill('#f-full', '0'); await p.click('#f-save');
    ok('full 0 refused', /more than 0/.test(await T('#f-full-err')));
    await p.fill('#f-full', '6'); await p.fill('#f-low', '');  await p.click('#f-save');
    ok('blank order level refused', /Type the number to order at/.test(await T('#f-low-err')));
    await p.fill('#f-low', '2');
    await p.click('#f-price-open'); await p.fill('#f-price', 'abc'); await p.click('#f-save');
    ok('bad price refused', /Type a number/.test(await T('#f-price-err')));
    await p.fill('#f-price', '4,600'); await p.fill('#f-sup', 'Ali Traders');
    ok('preview says it goes straight on the list', (await T('#f-preview')) === 'Now 2 cartons: this goes straight on the list. Order 4 cartons from Ali Traders (about 18,400).', await T('#f-preview'));
    await p.click('#f-save');
    ok('item added message', /Cooking oil 5 L added\. It is on the list to order\./.test(await T('#add-msg')));
    ok('form keeps unit and supplier for the next item', await p.inputValue('#f-sup') === 'Ali Traders' && await p.inputValue('#f-unit') === 'carton' && await p.inputValue('#f-name') === '');
    ok('errors cleared after save', (await T('#f-full-err')) === '' && (await T('#f-price-err')) === '');

    async function add(name, unit, stock, low, full, sup, price) {
        await p.fill('#f-name', name); await p.selectOption('#f-unit', unit);
        await p.fill('#f-stock', stock); await p.fill('#f-low', low); await p.fill('#f-full', full); await p.fill('#f-sup', sup);
        if (price) { if (await vis('#f-price-open')) await p.click('#f-price-open'); await p.fill('#f-price', price); }
        await p.press('#f-full', 'Enter');   // Enter saves, keyboard only
    }
    // duplicate name with the same supplier
    await add('cooking OIL 5 l', 'carton', '1', '2', '6', 'ali traders', '');
    ok('same item twice refused', /You already have Cooking oil 5 L from Ali Traders/.test(await T('#f-name-err')), await T('#f-name-err'));
    await add('Sugar 50 kg', 'bag', '1', '1', '3', 'Ali Traders', '7250');
    await add('Shopping bags', 'packet', '3', '10', '40', 'Bilal Packaging', '180');
    await add('UHT milk 1 L', 'carton', '0', '2', '8', '', '');
    await add('Rice 25 kg', 'bag', '5', '2', '6', 'Ali Traders', '9000');
    await add('Loose daal', 'kg', '12.5', '5', '25', 'Ali Traders', '');
    ok('decimal stock kept', await p.locator('#items > li', { hasText: 'Loose daal' }).locator('input.step-in').inputValue() === '12.5');

    // ---------- the answer ----------
    ok('summary', (await T('#ord-sum')) === '4 items to order from 2 suppliers (1 item has no supplier set), about 39,560 (1 item has no price).', await T('#ord-sum'));
    const groups = await p.$$eval('#groups > li', ls => ls.map(l => l.innerText.replace(/\s+/g, ' ')));
    ok('Ali Traders first with oil and sugar', /^Ali Traders 2 items Cooking oil 5 L 4 cartons about 18,400 Sugar 50 kg 2 bags about 14,500 About 32,900/.test(groups[0]), groups[0]);
    ok('Bilal Packaging 37 packets', /Bilal Packaging 1 item Shopping bags 37 packets about 6,660 About 6,660/.test(groups[1]), groups[1]);
    ok('no supplier last, out of stock, no price', /^No supplier set/.test(groups[2]) && /out of stock/.test(groups[2]) && /8 cartons no price/.test(groups[2]), groups[2]);
    ok('enough items not listed', !/Rice|daal/.test(await T('#groups')));
    ok('filter counts', (await T('#cnt-order')) === '4' && (await T('#cnt-ordered')) === '0' && (await T('#cnt-all')) === '6');

    // ---------- copy and WhatsApp ----------
    await p.click('#groups > li:nth-child(1) >> text=Copy order');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copied message', clip === 'Hello Ali Traders, please send:\n1. Cooking oil 5 L: 4 cartons\n2. Sugar 50 kg: 2 bags\nOrder of ' + await p.evaluate(() => new Date(new Date().setHours(12)).toLocaleDateString(navigator.language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })) + '. Thank you.', clip);
    ok('copy confirmation', /Copied/.test(await T('#ord-msg')));
    let href = await p.getAttribute('#groups > li:nth-child(1) a.wa', 'href');
    ok('WhatsApp link with no number', href.startsWith('https://wa.me/?text=Hello%20Ali%20Traders') && !/4%2C600|4600/.test(href), href);
    await p.click('#phl-ali-traders');
    await p.fill('#ph-ali-traders', '0300 1234567'); await p.press('#ph-ali-traders', 'Enter');
    ok('local number asks for the country code', /country code/.test(await T('#ph-ali-traders-err')));
    await p.fill('#ph-ali-traders', '+92 300 1234567'); await p.click('text=Save number');
    href = await p.getAttribute('#groups > li:nth-child(1) a.wa', 'href');
    ok('WhatsApp link to the supplier', href.startsWith('https://wa.me/923001234567?text='), href);
    ok('number shown', /WhatsApp: \+923001234567 \(change\)/.test(await T('#groups > li:nth-child(1)')));
    // shop name goes in the message
    await p.click('#shop-open'); await p.fill('#shop', 'Madina General Store'); await p.press('#shop', 'Enter');
    ok('shop name saved', /Shop name saved/.test(await T('#tools-msg')));
    href = await p.getAttribute('#groups > li:nth-child(1) a.wa', 'href');
    ok('message includes the shop', decodeURIComponent(href).includes('please send to Madina General Store:'));

    // ---------- currency ----------
    await p.selectOption('#cur', 'Rs');
    ok('currency shown', /about Rs 39,560/.test(await T('#ord-sum')));
    ok('price shown with symbol in item', /Rs 4,600 each/.test(await T('#items')));

    // ---------- stock changes with − and + and typing ----------
    const rice = p.locator('#items > li', { hasText: 'Rice 25 kg' });
    await rice.locator('button[aria-label="One less Rice 25 kg"]').click();
    await rice.locator('button[aria-label="One less Rice 25 kg"]').click();
    await rice.locator('button[aria-label="One less Rice 25 kg"]').click();
    ok('rice down to 2 goes on the list', /Rice 25 kg: 2 bags in stock\. Now on the list: order 4 bags\./.test(await T('#list-msg')), await T('#list-msg'));
    ok('focus stays on the − button', await p.evaluate(() => document.activeElement.getAttribute('aria-label')) === 'One less Rice 25 kg');
    await p.click('#list-msg .undo');
    ok('undo puts rice back to 3', await rice.locator('input.step-in').inputValue() === '3' && !/Rice/.test(await T('#groups')));
    const riceIn = rice.locator('input.step-in');
    await riceIn.fill('abc'); await riceIn.press('Enter');
    ok('typed nonsense shows an error', /Type a number/.test(await T('#items > li:has-text("Rice 25 kg") .err')));
    await riceIn.fill(''); await riceIn.press('Enter');
    ok('blank stock shows an error', /Type 0 if it has run out/.test(await T('#items > li:has-text("Rice 25 kg") .err')));
    await riceIn.fill('-1'); await riceIn.press('Enter');
    ok('negative typed stock refused', /minus/.test(await T('#items > li:has-text("Rice 25 kg") .err')));
    await riceIn.press('Escape');
    ok('Escape restores the number', await riceIn.inputValue() === '3');
    const milk = p.locator('#items > li', { hasText: 'UHT milk' });
    ok('− disabled at 0', await milk.locator('button[aria-label="One less UHT milk 1 L"]').isDisabled());
    await milk.locator('input.step-in').fill('12'); await milk.locator('input.step-in').press('Enter');
    ok('counted milk off the list', /UHT milk 1 L: 12 cartons in stock\. Off the list\./.test(await T('#list-msg')) && !/UHT/.test(await T('#groups')));
    ok('no-supplier group gone', !/No supplier set/.test(await T('#groups')));
    await milk.locator('input.step-in').fill('999999'); await milk.locator('input.step-in').press('Enter');
    ok('huge stock accepted', /999,999 cartons/.test(await T('#list-msg')));
    ok('+ disabled at the maximum', await milk.locator('button[aria-label="One more UHT milk 1 L"]').isDisabled());
    await milk.locator('input.step-in').fill('1000000'); await milk.locator('input.step-in').press('Enter');
    ok('more than the maximum refused', /The most is 999,999/.test(await T('#items > li:has-text("UHT milk") .err')));
    await milk.locator('input.step-in').fill('0.5'); await milk.locator('input.step-in').press('Enter');
    ok('half a carton', /0\.5 cartons in stock\. Now on the list: order 7\.5 cartons/.test(await T('#list-msg')), await T('#list-msg'));
    await milk.locator('input.step-in').fill('12'); await milk.locator('input.step-in').press('Enter');
    ok('counted today shown', /Counted today/.test(await T('#items > li:has-text("UHT milk")')));

    // ---------- order sent ----------
    await p.click('#groups > li:nth-child(1) >> text=Mark as ordered');
    ok('marked as ordered', /Ali Traders: 2 items marked as ordered/.test(await T('#ord-msg')));
    ok('waiting list shows both', /Cooking oil 5 L: 4 cartons From Ali Traders, ordered today/.test(await T('#wait')) && /Sugar 50 kg: 2 bags/.test(await T('#wait')));
    ok('ordered items no longer to order', !/Cooking oil/.test(await T('#groups')));
    ok('summary now', (await T('#ord-sum')) === '1 item to order from 1 supplier, about Rs 6,660.', await T('#ord-sum'));
    ok('on order count 2', (await T('#cnt-ordered')) === '2');
    // even if more is used while on order, it is not ordered twice
    const oil = p.locator('#items > li', { hasText: 'Cooking oil 5 L' });
    await oil.locator('button[aria-label="One less Cooking oil 5 L"]').click();
    ok('on-order item stays on order', /On order: 4 cartons/.test(await T('#items > li:has-text("Cooking oil 5 L")')) && !/Cooking oil/.test(await T('#groups')));
    // delivery short with a new price
    await p.click('#wait > li:has-text("Cooking oil") >> text=Delivery came');
    ok('delivery panel prefilled', await p.inputValue('[id^="rq-"]') === '4' && await p.inputValue('[id^="rp-"]') === '4600');
    await p.fill('[id^="rq-"]', '0'); await p.click('text=Add to stock');
    ok('nothing came refused', /If nothing came/.test(await T('#wait')));
    await p.fill('[id^="rq-"]', '3'); await p.fill('[id^="rp-"]', '4700'); await p.click('text=Add to stock');
    ok('delivery added, short noted', /Cooking oil 5 L: 3 cartons added\. Now 4 cartons in stock\. \(1 carton less than ordered\.\)/.test(await T('#ord-msg')), await T('#ord-msg'));
    ok('new price kept', /Rs 4,700 each/.test(await T('#items > li:has-text("Cooking oil 5 L")')));
    ok('last delivery shown', /last delivery today: 3 cartons at Rs 4,700/.test(await T('#items > li:has-text("Cooking oil 5 L")')));
    // cancel the sugar order: back on the list
    await p.click('#wait > li:has-text("Sugar") >> text=Cancel order');
    ok('cancel puts it back on the list', /Sugar 50 kg: order cancelled\. It is back on the list\./.test(await T('#ord-msg')) && /Sugar/.test(await T('#groups')));
    ok('waiting box hidden when empty', !(await vis('#wait-box')));
    // mark one item as ordered from its box, then delivery from the box
    await p.click('#items > li:has-text("Sugar 50 kg") >> text=Mark as ordered');
    ok('single item ordered', /Sugar 50 kg: 2 bags marked as ordered/.test(await T('#list-msg')));
    await p.click('#items > li:has-text("Sugar 50 kg") >> text=Delivery came');
    await p.click('#items > li:has-text("Sugar 50 kg") >> text=Add to stock');
    ok('delivery from the box', /Sugar 50 kg: 2 bags added\. Now 3 bags in stock\./.test(await T('#list-msg')));

    // ---------- filters and find ----------
    await p.check('input[name=filter][value=order]', { force: true });
    ok('To order filter', (await p.$$eval('#items > li', l => l.length)) === 1);
    await p.check('input[name=filter][value=ordered]', { force: true });
    ok('On order empty message', /Nothing is on order/.test(await T('#list-empty')));
    await p.check('input[name=filter][value=all]', { force: true });
    ok('find hidden under 7 items', !(await vis('#find')));
    await add('Tea 950 g', 'packet', '18', '6', '24', 'Lipton Distributor', '1650');
    ok('find shown at 7 items', await vis('#find'));
    await p.fill('#find', 'ali'); ok('find by supplier', (await p.$$eval('#items > li', l => l.length)) === 4);
    await p.fill('#find', 'zzz'); ok('nothing matches message', /No item matches "zzz"/.test(await T('#list-empty')));
    await p.fill('#find', '');

    // ---------- edit ----------
    await p.click('#items > li:has-text("Shopping bags") >> text=Edit');
    ok('edit fills the form', await p.inputValue('#f-name') === 'Shopping bags' && await p.inputValue('#f-full') === '40' && (await T('#add-h')) === 'Change Shopping bags');
    ok('edit keeps the unit presets untouched', await p.inputValue('#f-low') === '10');
    await p.fill('#f-full', '20'); await p.click('#f-save');
    ok('edit saved', /Shopping bags saved/.test(await T('#add-msg')) && /Shopping bags 17 packets/.test(await T('#groups')));
    await p.click('#items > li:has-text("Rice") >> text=Edit'); await p.click('#f-cancel');
    ok('cancel edit resets the form', (await T('#add-h')) === 'Add an item' && await p.inputValue('#f-name') === '');
    // own unit
    await p.selectOption('#f-unit', '+own');
    ok('own unit box shown', await vis('#f-unit-own'));
    await p.fill('#f-name', 'Honey'); await p.fill('#f-stock', '1'); await p.fill('#f-sup', ''); await p.click('#f-save');
    ok('own unit required', /Type the unit/.test(await T('#f-unit-own-err')));
    await p.fill('#f-unit-own', 'jars'); await p.click('#f-save');
    ok('own unit used', /Honey/.test(await T('#items')) && /1 jars|Order \d+ jars/.test(await T('#items > li:has-text("Honey")')));

    // ---------- no longer sold, delete, undo ----------
    await p.click('#items > li:has-text("Honey") >> text=No longer sold');
    ok('archived', await vis('#arch') && /Honey/.test(await T('#arch-list')) && !/Honey/.test(await T('#items')));
    await p.click('#arch-list >> text=Sell again');
    ok('sell again', /Honey is back in Your stock/.test(await T('#list-msg')) && /Honey/.test(await T('#items')) && !(await vis('#arch')));
    await p.click('#items > li:has-text("Honey") >> text=Delete');
    ok('deleted', !/Honey/.test(await T('#items')));
    await p.click('#list-msg .undo');
    ok('undo delete', /Honey/.test(await T('#items')));
    await p.click('#items > li:has-text("Honey") >> text=Delete');
    // very long and pasted name
    await p.fill('#f-name', 'Super long item name '.repeat(6)); await p.selectOption('#f-unit', 'piece'); await p.fill('#f-stock', '0'); await p.fill('#f-low', '0'); await p.fill('#f-full', '3'); await p.click('#f-save');
    ok('long name cut to 60 and saved', (await p.$$eval('#items h3', h => h.map(x => x.textContent.length))).some(n => n === 60));
    ok('order level 0 lists when out', /Order 3 pieces/.test(await T('#items > li:has-text("Super long")')));

    // ---------- saved state ----------
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps items', (await T('#cnt-all')) === '8' && /Cooking oil 5 L/.test(await T('#items')));
    ok('reload keeps currency and shop', (await p.inputValue('#cur')) === 'Rs' && /Madina General Store/.test(await T('#shop-open')));
    ok('reload keeps the WhatsApp number', await p.evaluate(() => JSON.parse(localStorage.getItem('stock-reorder-list-for-small-shops.state')).phones['ali traders']) === '923001234567');

    // backup and restore
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const file = path.join(os.tmpdir(), 'srl-backup.json'); await dl.saveAs(file);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('backup has items', saved.items.length === 8 && dl.suggestedFilename().startsWith('stock-reorder-list-for-small-shops-'));
    const junk = path.join(os.tmpdir(), 'srl-junk.json'); fs.writeFileSync(junk, '{"hello":1}');
    await p.setInputFiles('#restore-file', junk);
    await p.waitForFunction(() => /not a backup/.test(document.getElementById('tools-msg').textContent));
    ok('wrong file refused', true);
    await p.click('#del-all');
    ok('delete everything', /Everything deleted/.test(await T('#tools-msg')) && !(await vis('#list')) && !(await vis('#orders')));
    await p.click('#tools-msg .undo');
    ok('undo delete everything', (await T('#cnt-all')) === '8');
    await p.click('#del-all');
    await p.setInputFiles('#restore-file', file);
    await p.waitForFunction(() => /Backup restored/.test(document.getElementById('tools-msg').textContent));
    ok('restore brings 8 items back', (await T('#cnt-all')) === '8');

    // corrupt saved state starts fresh
    await p.evaluate(() => localStorage.setItem('stock-reorder-list-for-small-shops.state', '{"items":[{"name":5}],'));
    await p.reload({ waitUntil: 'networkidle' });
    ok('corrupt state starts fresh', !(await vis('#list')) && await vis('#restore-first'));
    await p.evaluate(() => localStorage.setItem('stock-reorder-list-for-small-shops.state', JSON.stringify({ items: [{ name: 'X', unit: 'kg', stock: 1, low: 9, full: 2 }, { name: 'Y', unit: 'kg', stock: 1, low: 0, full: 2 }] })));
    await p.reload({ waitUntil: 'networkidle' });
    ok('invalid saved item dropped, good one kept', (await T('#cnt-all')) === '1');

    // storage blocked
    const ctx2 = await browser.newContext({ locale: 'en-US' });
    await ctx2.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await ctx2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const p2 = await ctx2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
    await p2.goto(URL, { waitUntil: 'networkidle' });
    ok('blocked storage warns and does not crash', await p2.isVisible('#store-warn') && !e2.length, e2);
    await ctx2.close();

    // files the page needs
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css']) {
        const r = await p.request.get(URL + f); ok('200 ' + f, r.status() === 200, r.status());
    }
    ok('no console errors', !errs.length, errs);
    ok('no failed requests', !bad.length, bad);
    await browser.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
