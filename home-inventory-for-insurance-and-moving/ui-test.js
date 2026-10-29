// Drives the real page in headless Chromium. Run from the repo root:
//   node home-inventory-for-insurance-and-moving/ui-test.js [--base https://umar8092.github.io/apps] [--shots]
// Without --base it serves the repo itself. --shots also saves the README screenshots.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const SLUG = 'home-inventory-for-insurance-and-moving', ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2), bi = args.indexOf('--base'), SHOTS = args.includes('--shots');
let pass = 0; const fails = [];
const ok = (c, name) => { if (c) pass++; else fails.push(name); };
const eq = (a, b, name) => ok(a === b, name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const has = (a, b, name) => ok(String(a).includes(b), name + ' (want ' + JSON.stringify(b) + ' in ' + JSON.stringify(String(a).slice(0, 400)) + ')');
const hasnt = (a, b, name) => ok(!String(a).includes(b), name + ' (did not want ' + JSON.stringify(b) + ')');

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2' };
    return new Promise(res => {
        const s = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
            r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
        }).listen(0, () => res({ s, base: 'http://localhost:' + s.address().port + '/apps' }));
    });
}
// a small real PNG to use as a photo
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJElEQVR4nGNkYPjPQApgIkn1qIZRDaMaRjWMahjVMKphVAMAAN0BH8D1rRMAAAAASUVORK5CYII=', 'base64');

(async () => {
    let srv = null, BASE = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : null;
    if (!BASE) { srv = await serve(); BASE = srv.base; }
    const URL_ = BASE + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], bad = [];
    async function ctxPage(o, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 800 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] }, o || {}));
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        if (init) await ctx.addInitScript(init);
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE)) bad.push(r.status() + ' ' + r.url()); });
        await page.goto(URL_, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).first().innerText();
    const vis = (page, sel) => page.locator(sel).first().isVisible();
    async function add(page, o) {
        await page.fill('#i-room', o.room); await page.fill('#i-name', o.name);
        await page.fill('#i-qty', o.qty || '');
        await page.fill('#i-value', o.value || '');
        if (o.brand || o.serial || o.got || o.paid || o.receipt || o.note) {
            if (await vis(page, '#more-open')) await page.click('#more-open');
            await page.fill('#i-brand', o.brand || ''); await page.fill('#i-serial', o.serial || '');
            await page.fill('#i-got', o.got || ''); await page.fill('#i-paid', o.paid || '');
            await page.fill('#i-receipt', o.receipt || ''); await page.fill('#i-note', o.note || '');
        }
        await page.click('#i-save');
    }
    const roomBox = (page, name) => page.locator('.room', { has: page.locator('h3.rm-name', { hasText: new RegExp('^' + name + '$') }) });
    const itemBox = (page, sel, name) => page.locator(sel + ' .item', { has: page.locator('h4', { hasText: name }) }).first();
    const FLAT = [
        { room: 'Living room', name: '55-inch TV', value: '650', brand: 'Samsung QE55Q60', serial: '0B7G3CPW401234', got: '2023-03-12', paid: '799', receipt: 'Email from Currys' },
        { room: 'Living room', name: 'Sofa', value: '1,200' },
        { room: 'Living room', name: 'Books', value: '400' },
        { room: 'Kitchen', name: 'Fridge freezer', value: '549' },
        { room: 'Kitchen', name: 'Dining chairs', qty: '6', value: '85' },
        { room: 'Kitchen', name: 'Dining table', value: '350' },
        { room: 'Kitchen', name: 'Microwave' },
        { room: 'Main bedroom', name: 'Engagement ring', value: '2400', got: '2019-06-01' },
        { room: 'Main bedroom', name: 'Laptop', value: '1099', brand: 'MacBook Air 13', serial: 'C02XG0FDH7JY' },
        { room: 'Main bedroom', name: 'Clothes', value: '1500' },
        { room: 'Hall', name: 'Road bike', value: '1800', serial: 'WTU123K4567' }
    ];

    // ---------- 1. first use, empty state, optional fields hidden ----------
    let { ctx, page } = await ctxPage();
    ok(await vis(page, '#intro'), 'first use shows How it works');
    for (const id of ['#glance', '#rooms', '#valuables', '#claim', '#history', '#more-box', '#i-cancel']) ok(!(await vis(page, id)), 'hidden at first: ' + id);
    eq(await page.locator('#room-quick .chip').count(), 10, 'ten room suggestions');
    eq(await txt(page, '#i-total'), '', 'no total line at first');
    eq(await page.inputValue('#cur'), '', 'no currency forced');

    // ---------- 2. mistakes are caught ----------
    await page.click('#i-save');
    has(await txt(page, '#i-room-err'), 'Type the room', 'blank room');
    has(await txt(page, '#i-name-err'), 'Type what it is', 'blank name');
    eq(await page.evaluate(() => document.activeElement.id), 'i-room', 'focus goes to the first mistake');
    await page.locator('#room-quick .chip', { hasText: 'Kitchen' }).click();
    eq(await page.inputValue('#i-room'), 'Kitchen', 'room chip fills the room');
    eq(await txt(page, '#i-room-err'), '', 'chip clears the room error');
    await page.fill('#i-name', 'Kettle');
    for (const [q, msg] of [['0', 'Type 1 or more'], ['-2', 'without a minus'], ['1.5', 'whole number'], ['10000', 'Up to 9999']]) {
        await page.fill('#i-qty', q); await page.click('#i-save'); has(await txt(page, '#i-qty-err'), msg, 'how many ' + q);
    }
    await page.fill('#i-qty', '');
    for (const [v, msg] of [['-5', 'minus'], ['abc', 'Type an amount'], ['1.2345', 'decimal']]) {
        await page.fill('#i-value', v); await page.click('#i-save'); has(await txt(page, '#i-value-err'), msg, 'value ' + v);
    }
    await page.fill('#i-qty', '9999'); await page.fill('#i-value', '1000000000'); await page.click('#i-save');
    has(await txt(page, '#i-value-err'), 'too much', 'value times how many too big');
    await page.fill('#i-qty', ''); await page.fill('#i-value', '');
    await page.click('#more-open');
    await page.fill('#i-got', '2099-01-01'); await page.click('#i-save');
    has(await txt(page, '#i-got-err'), 'future', 'future date bought');
    await page.fill('#i-got', ''); await page.fill('#i-paid', '-3'); await page.click('#i-save');
    has(await txt(page, '#i-paid-err'), 'minus', 'negative price paid');
    eq(await page.evaluate(() => JSON.parse(localStorage.getItem('home-inventory-for-insurance-and-moving.state') || '{"items":[]}').items.length), 0, 'nothing saved while there are mistakes');
    await ctx.close();

    // ---------- 3. the real situation: Sara and Imran's flat ----------
    ({ ctx, page } = await ctxPage());
    await page.selectOption('#cur', '£');
    // how many: the labels and the total line follow it
    await page.fill('#i-qty', '6'); await page.fill('#i-value', '85');
    eq(await txt(page, '#i-value-l'), 'Value of each, to buy new', 'label says each when more than one');
    eq(await txt(page, '#i-total'), '6 × £85 = £510 for all 6', 'total line for 6 chairs');
    await page.fill('#i-qty', ''); await page.fill('#i-value', '');
    eq(await txt(page, '#i-value-l'), 'Value, to buy it new', 'label back to one');
    for (const it of FLAT) await add(page, it);
    has(await txt(page, '#add-msg'), 'Saved Road bike in Hall: £1,800.', 'saved message');
    eq(await page.inputValue('#i-room'), 'Hall', 'room stays filled for the next item');
    eq(await page.inputValue('#i-name'), '', 'name cleared for the next item');
    ok(!(await vis(page, '#intro')), 'intro hidden once there are items');
    const g = await txt(page, '#glance');
    has(g, '16 items', 'whole home count');
    has(g, '£10,458', 'whole home value');
    has(g, '1 item has no value yet', 'microwave without a value');
    has(g, 'Is your cover enough?', 'asks for the cover');
    eq(await page.locator('#glance .tile').count(), 4, 'a tile per room');
    has(await txt(page, '#glance .tile >> nth=1'), 'Kitchen', 'kitchen tile');
    has(await txt(page, '#glance .tile >> nth=1'), '£1,409', 'kitchen tile value');
    has(await txt(page, '#glance .tile >> nth=1'), '9 items, 1 no value', 'kitchen tile count');
    eq(await page.locator('#room-list .room').count(), 4, 'four room boxes');
    has(await roomBox(page, 'Kitchen').innerText(), '9 items, 1 with no value yet', 'kitchen box sum');
    const tv = await itemBox(page, '#room-list', '55-inch TV').innerText();
    for (const t of ['Samsung QE55Q60', '£650', 'Serial number: 0B7G3CPW401234', 'Bought 12 Mar 2023', 'paid £799', 'Receipt: Email from Currys']) has(tv, t, 'TV box shows ' + t);
    has(await itemBox(page, '#room-list', 'Dining chairs').innerText(), '6 × £85 each', 'chairs show each');
    has(await itemBox(page, '#room-list', 'Dining chairs').innerText(), '£510', 'chairs total');
    has(await itemBox(page, '#room-list', 'Microwave').innerText(), 'No value yet', 'microwave warns');
    has(await txt(page, '#valuables'), 'Engagement ring', 'most valuable list');
    has(await txt(page, '#val-list li >> nth=0'), 'no serial number, receipt, photo', 'missing proof shown');
    ok((await page.getAttribute('#g-mail', 'href')).startsWith('mailto:?subject=Home%20inventory&body='), 'email works with no recipient');

    // ---------- 4. twin warning and undo ----------
    await add(page, { room: 'Living room', name: 'sofa', value: '1200' });
    has(await txt(page, '#add-msg'), 'already had Sofa', 'same thing twice is pointed out');
    await page.locator('#add-msg .undo').click();
    has(await txt(page, '#glance'), '16 items', 'undo removes the double');

    // ---------- 5. the insurance cover ----------
    await page.locator('#glance .link', { hasText: 'Add your insurance cover' }).click();
    eq(await page.evaluate(() => document.activeElement.id), 'c-cover', 'the link goes to the cover');
    await page.fill('#c-cover', '10,000'); await page.fill('#c-limit', '0'); await page.click('#c-save');
    has(await txt(page, '#c-limit-err'), 'bigger than 0', 'zero limit');
    await page.fill('#c-limit', '1500'); await page.click('#c-save');
    has(await txt(page, '#cover-msg'), '£458 less than', 'cover message');
    has(await txt(page, '#cover-msg'), '2 items are worth more than £1,500', 'limit message');
    const gc = await txt(page, '.g-cover');
    has(gc, '£458 short', 'short by 458');
    has(gc, 'at least £10,458', 'what to raise it to');
    has(await txt(page, '#glance'), '2 items are worth more than your single item limit of £1,500: Engagement ring, Road bike', 'over the limit named');
    has(await txt(page, '#val-intro'), '2 items are worth more than your single item limit', 'valuables intro');
    eq(await page.locator('#val-list li.over').count(), 2, 'two marked over');
    has(await itemBox(page, '#room-list', 'Engagement ring').innerText(), 'Add the serial number or receipt', 'ring asks for proof');
    hasnt(await itemBox(page, '#room-list', 'Road bike').innerText(), 'Add the serial', 'bike has a serial');
    hasnt(await itemBox(page, '#room-list', 'Clothes').innerText(), 'single item limit', 'clothes at exactly the limit are fine');
    await page.click('#c-save');
    has(await txt(page, '#cover-msg'), 'Nothing was changed', 'saving the same cover again');

    // ---------- 6. edit, cancel ----------
    await itemBox(page, '#room-list', 'Sofa').locator('button', { hasText: 'Edit' }).click();
    eq(await txt(page, '#add-h'), 'Edit: Sofa', 'edit heading');
    eq(await page.inputValue('#i-value'), '1200', 'value filled in');
    ok(await vis(page, '#i-cancel'), 'cancel shown');
    await page.click('#i-cancel');
    has(await txt(page, '#add-msg'), 'Nothing was changed', 'cancel');
    await itemBox(page, '#room-list', 'Microwave').locator('button', { hasText: 'Edit' }).click();
    await page.fill('#i-value', '120'); await page.press('#i-value', 'Enter');
    has(await txt(page, '#add-msg'), 'Saved the changes to Microwave in Kitchen: £120.', 'Enter saves an edit');
    hasnt(await txt(page, '#glance'), 'no value yet', 'every item has a value now');
    has(await txt(page, '#glance'), '£10,578', 'total with the microwave');
    has(await txt(page, '.g-cover'), '£578 short', 'shortfall updated');
    eq(await page.locator('#room-list .item').count(), 11, 'edit did not add a line');

    // ---------- 7. move ----------
    await itemBox(page, '#room-list', 'Books').locator('button', { hasText: 'Move' }).click();
    eq(await page.evaluate(() => document.activeElement.id), 'mv-room', 'move panel focused');
    await page.selectOption('#mv-room', 'new');
    await page.click('.panel button.primary');
    has(await txt(page, '#mv-new-err'), 'Type the name', 'blank new room');
    await page.fill('#mv-new', 'living ROOM'); await page.click('.panel button.primary');
    has(await txt(page, '#mv-new-err'), 'already', 'moving to the same room');
    await page.fill('#mv-new', 'Study'); await page.click('.panel button.primary');
    has(await txt(page, '#rooms-msg'), 'Moved Books to Study.', 'moved');
    has(await roomBox(page, 'Living room').innerText(), '£1,850', 'living room without the books');
    has(await roomBox(page, 'Study').innerText(), '£400', 'study with the books');
    has(await txt(page, '#glance'), '£10,578', 'moving does not change the total');

    // ---------- 8. stolen: the claim list ----------
    await itemBox(page, '#room-list', 'Road bike').locator('button', { hasText: 'Gone' }).click();
    eq(await page.inputValue('#gp-what'), 'claim', 'Lost, stolen or damaged is first');
    eq(await txt(page, '.panel button.primary'), 'Add to the claim list', 'button says where it goes');
    await page.fill('#gp-d', '2099-01-01'); await page.click('.panel button.primary');
    has(await txt(page, '#gp-d-err'), 'future', 'future loss date');
    await page.fill('#gp-d', '2026-10-20'); await page.fill('#gp-note', 'Taken from the hall, police report 4471');
    await page.click('.panel button.primary');
    ok(await vis(page, '#claim'), 'claim list shown');
    has(await txt(page, '#claim-body'), '1 item, £1,800', 'claim total');
    const cb = await itemBox(page, '#claim-list', 'Road bike').innerText();
    has(cb, 'Lost, stolen or damaged on 20 Oct 2026', 'claim date');
    has(cb, 'was in Hall', 'claim room');
    has(cb, 'police report 4471', 'claim note');
    eq(await roomBox(page, 'Hall').count(), 0, 'the empty hall box is gone');
    has(await txt(page, '.g-cover'), 'Enough: £1,222 to spare', 'cover enough without the bike');
    has(await txt(page, '#glance'), 'Claim list: 1 item, £1,800', 'claim in the summary');
    await page.click('#cl-copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    has(clip, 'Road bike, serial WTU123K4567, value £1,800, Hall, 20 Oct 2026: Taken from the hall, police report 4471', 'claim list copied');
    ok((await page.getAttribute('#cl-mail', 'href')).startsWith('mailto:?subject=Insurance%20claim'), 'claim email link');
    await page.evaluate(() => { window.__printed = []; window.print = () => window.__printed.push(document.body.dataset.print); });
    await page.click('#cl-print'); await page.click('#g-print');
    eq(JSON.stringify(await page.evaluate(() => window.__printed)), '["claim","all"]', 'print the claim list or the whole list');

    // ---------- 9. sold, history, bring back ----------
    await itemBox(page, '#room-list', 'Books').locator('button', { hasText: 'Gone' }).click();
    await page.selectOption('#gp-what', 'sold');
    eq(await txt(page, '.panel button.primary'), 'Mark as sold', 'sold button');
    await page.click('.panel button.primary');
    ok(await vis(page, '#history'), 'history shown');
    has(await itemBox(page, '#h-list', 'Books').innerText(), 'Sold on', 'sold line');
    has(await txt(page, '#glance'), '£8,378', 'sold books not counted');
    await itemBox(page, '#h-list', 'Books').locator('button', { hasText: 'I still have it' }).click();
    ok(!(await vis(page, '#history')), 'history empty again');
    has(await roomBox(page, 'Study').innerText(), 'Books', 'books back in the study');

    // ---------- 10. delete with undo, rename ----------
    await itemBox(page, '#room-list', 'Dining table').locator('button', { hasText: 'Delete' }).click();
    has(await txt(page, '#rooms-msg'), 'Deleted Dining table.', 'deleted');
    await page.locator('#rooms-msg .undo').click();
    has(await roomBox(page, 'Kitchen').innerText(), 'Dining table', 'undo brings it back');
    await roomBox(page, 'Study').locator('button', { hasText: 'Rename' }).click();
    await page.fill('#rn-name', 'kitchen'); await page.click('.panel button.primary');
    has(await txt(page, '#rn-name-err'), 'already', 'rename clash');
    await page.fill('#rn-name', 'Box room'); await page.press('#rn-name', 'Enter');
    has(await txt(page, '#rooms-msg'), 'Renamed Study to Box room.', 'renamed');
    has(await roomBox(page, 'Box room').innerText(), 'Books', 'items follow the new name');

    // ---------- 11. find, hide ----------
    await page.fill('#find', 'samsung');
    eq(await txt(page, '#find-out'), '1 item matches "samsung".', 'find by brand');
    eq(await page.locator('#room-list .item').count(), 1, 'only the match is shown');
    await page.fill('#find', 'C02XG');
    has(await txt(page, '#room-list'), 'Laptop', 'find by serial');
    await page.fill('#find', 'zzz');
    eq(await txt(page, '#find-out'), 'Nothing matches "zzz".', 'nothing found');
    await page.fill('#find', '');
    eq(await page.locator('#room-list .item').count(), 10, 'all back');
    await roomBox(page, 'Kitchen').locator('button', { hasText: 'Hide the items' }).click();
    ok(!(await roomBox(page, 'Kitchen').locator('.item').first().isVisible()), 'kitchen items hidden');
    await roomBox(page, 'Kitchen').locator('button', { hasText: 'Show the items' }).click();
    ok(await roomBox(page, 'Kitchen').locator('.item').first().isVisible(), 'kitchen items shown again');
    await roomBox(page, 'Kitchen').locator('button', { hasText: 'Copy the checklist' }).click();
    eq(await page.evaluate(() => navigator.clipboard.readText()), 'Kitchen: 9 items\n[ ] Fridge freezer\n[ ] Dining chairs × 6\n[ ] Dining table\n[ ] Microwave', 'moving checklist copied');
    await roomBox(page, 'Kitchen').locator('button', { hasText: '+ Add an item here' }).click();
    eq(await page.inputValue('#i-room'), 'Kitchen', 'add here fills the room');
    await page.click('#g-copy');
    has(await page.evaluate(() => navigator.clipboard.readText()), 'Whole home: 15 items, £8,778 to buy new today', 'full list copied');

    // ---------- 12. pasted, long and odd text ----------
    await add(page, { room: '  Garage   or shed ', name: 'Lawn\tmower\n(petrol)', value: '£ 249.99' });
    has(await roomBox(page, 'Garage or shed').innerText(), 'Lawn mower (petrol)', 'pasted name tidied');
    has(await roomBox(page, 'Garage or shed').innerText(), '£249.99', 'cents kept');
    await page.evaluate(() => { document.getElementById('i-name').removeAttribute('maxlength'); });
    await add(page, { room: 'Garage or shed', name: 'Very long '.repeat(30), value: '0' });
    const longName = await page.locator('#room-list h4').last().innerText();
    eq(longName.length <= 80, true, 'very long name cut to 80');
    has(await roomBox(page, 'Garage or shed').innerText(), '£0', 'zero value allowed');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    ok(sw, 'long names do not cause sideways scroll');

    // ---------- 13. photos, saved across a reload ----------
    await itemBox(page, '#room-list', 'Laptop').locator('button', { hasText: 'Edit' }).click();
    await page.setInputFiles('#ph-photo', { name: 'laptop.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector('#ph-photo-img:not([hidden])');
    await page.setInputFiles('#ph-rphoto', { name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector('#ph-rphoto-img:not([hidden])');
    await page.setInputFiles('#ph-photo', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
    has(await txt(page, '#add-msg'), 'not a photo', 'a text file is refused');
    await page.click('#i-save');
    await page.waitForSelector('#room-list .thumb');
    eq(await itemBox(page, '#room-list', 'Laptop').locator('.thumb').count(), 2, 'item and receipt photos shown');
    await itemBox(page, '#room-list', 'Laptop').locator('.thumb-btn').first().click();
    ok(await itemBox(page, '#room-list', 'Laptop').locator('.thumb-btn.on').count() === 1, 'tap a photo to see it bigger');

    // ---------- 14. reload keeps everything ----------
    const before = await txt(page, '#glance');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#room-list .thumb');
    eq(await txt(page, '#glance'), before, 'same summary after reload');
    eq(await page.inputValue('#cur'), '£', 'currency remembered');
    eq(await page.inputValue('#c-cover'), '10000', 'cover remembered');
    eq(await itemBox(page, '#room-list', 'Laptop').locator('.thumb').count(), 2, 'photos come back after reload');
    ok(await vis(page, '#claim'), 'claim list kept');

    // ---------- 15. CSV, backup, restore ----------
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    has(csv, 'Kitchen,Dining chairs,6,85.00,510.00', 'CSV has the chairs');
    has(csv, 'Lost, stolen or damaged', 'CSV has the claim');
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupPath = path.join(os.tmpdir(), SLUG + '-ui-backup.json');
    fs.copyFileSync(await dl.path(), backupPath);
    const bj = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    eq(Object.keys(bj.photos).length, 2, 'backup has both photos');
    has(await txt(page, '#tools-msg'), 'with 2 photos', 'backup message');
    await page.click('#del-all');
    has(await txt(page, '#tools-msg'), 'Deleted everything.', 'deleted everything');
    ok(await vis(page, '#intro'), 'back to the first-use screen');
    eq(await page.inputValue('#c-cover'), '', 'cover cleared');
    await page.locator('#tools-msg .undo').click();
    has(await txt(page, '#glance'), '£9,027.99', 'undo brings everything back');
    eq(await page.inputValue('#c-cover'), '10000', 'undo brings the cover back');
    await page.click('#del-all');
    const badPath = path.join(os.tmpdir(), SLUG + '-bad.json'); fs.writeFileSync(badPath, '{"hello": 1}');
    await page.setInputFiles('#restore-file', badPath);
    await page.waitForFunction(() => document.getElementById('tools-msg').textContent.includes('backup'));
    has(await txt(page, '#tools-msg'), 'not a backup from this app', 'a wrong file is refused');
    await page.setInputFiles('#restore-file', backupPath);
    await page.waitForSelector('#glance:not([hidden])');
    has(await txt(page, '#tools-msg'), 'Restored 18 items in 6 rooms', 'restored');
    has(await txt(page, '#glance'), '£9,027.99', 'restored total');
    await page.waitForSelector('#room-list .thumb');
    eq(await itemBox(page, '#room-list', 'Laptop').locator('.thumb').count(), 2, 'restored photos');
    await ctx.close();

    // ---------- 16. corrupt saved data, blocked storage, no currency ----------
    ({ ctx, page } = await ctxPage({}, () => { try { if (!sessionStorage.getItem('x')) { localStorage.setItem('home-inventory-for-insurance-and-moving.state', '{"rooms":[oops'); sessionStorage.setItem('x', '1'); } } catch (e) {} }));
    has(await txt(page, '#top-msg'), 'could not be read', 'corrupt data: clear message');
    ok(await vis(page, '#intro'), 'corrupt data: starts fresh');
    await add(page, { room: 'Kitchen', name: 'Kettle', value: '25' });
    has(await txt(page, '#glance'), '25', 'works after a corrupt start');
    hasnt(await txt(page, '#glance'), '£', 'no currency symbol unless chosen');
    await ctx.close();
    ({ ctx, page } = await ctxPage({}, () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); }));
    await add(page, { room: 'Kitchen', name: 'Kettle', value: '25' });
    ok(await vis(page, '#store-warn'), 'blocked storage: warning shown');
    has(await txt(page, '#glance'), '1 item', 'blocked storage: still works for this visit');
    await ctx.close();

    // ---------- 17. screen sizes, filled and cleared, dark and light ----------
    // a clean, realistic home for the screenshots and the layout checks
    ({ ctx, page } = await ctxPage({ viewport: { width: 1280, height: 900 } }));
    await page.selectOption('#cur', '£');
    for (const it of FLAT) await add(page, it);
    await page.fill('#c-cover', '10000'); await page.fill('#c-limit', '1500'); await page.click('#c-save');
    await itemBox(page, '#room-list', 'Road bike').locator('button', { hasText: 'Gone' }).click();
    await page.fill('#gp-d', '2026-10-20'); await page.fill('#gp-note', 'Taken from the hall, police report 4471');
    await page.click('.panel button.primary');
    has(await txt(page, '#glance'), '15 items', 'showcase: 15 items at home without the bike');
    has(await txt(page, '.g-cover'), '£1,342 to spare', 'showcase: cover enough');
    has(await txt(page, '#glance'), 'Ask your insurer to name it on the policy', 'one item: it, not them');
    const state = await page.evaluate(k => localStorage.getItem(k), SLUG + '.state');
    if (SHOTS) {
        await page.reload({ waitUntil: 'networkidle' });
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'desktop.png'), clip: { x: 0, y: 0, width: 1280, height: 1400 }, fullPage: true });
    }
    await ctx.close();
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) {
        ({ ctx, page } = await ctxPage({ colorScheme: scheme, viewport: { width: 1280, height: 900 } }));
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SLUG + '.state', state]);
        for (const filled of [true, false]) {
            if (!filled) { await page.click('#del-all'); }
            for (const w of WIDTHS) {
                const tag = scheme + ' ' + w + (filled ? ' filled' : ' cleared') + ': ';
                await page.setViewportSize({ width: w, height: 900 });
                if (filled) await page.reload({ waitUntil: 'networkidle' });
                if (w <= 390) {
                    // reveal every optional field and open a panel
                    if (await vis(page, '#more-open')) await page.click('#more-open');
                    await page.fill('#i-qty', '6'); await page.fill('#i-value', '85');
                    if (filled) {
                        await page.locator('#room-list .item button', { hasText: 'Move' }).first().click();
                        await page.selectOption('#mv-room', 'new');
                    }
                }
                eq(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, tag + 'no horizontal scroll');
                const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 3).map(e => e.tagName + '.' + e.className));
                eq(out.join(','), '', tag + 'nothing sticks out');
                if (w <= 390) {
                    const o = await page.evaluate(() => {
                        const els = [...document.querySelectorAll('main input:not([type=file]):not([type=checkbox]), main select, main button, main a.secondary')].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0);
                        const res = [];
                        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1 && !els[i].contains(els[j]) && !els[j].contains(els[i])) res.push((els[i].id || els[i].textContent.slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.slice(0, 20)));
                        }
                        // placeholders and labels must fit their box
                        document.querySelectorAll('main input[placeholder]').forEach(i => { if (!i.offsetParent) return; const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; const room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); if (c.measureText(i.placeholder).width > room + 1) res.push('placeholder cut: ' + i.id); });
                        return res.slice(0, 4);
                    });
                    eq(o.join('; '), '', tag + 'no controls overlap, placeholders fit');
                }
                if (w >= 900) {
                    for (const pos of [0, 0.5, 1]) {
                        await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                        const o = await page.evaluate(() => { const res = []; document.querySelectorAll('main, .col-a, .col-b').forEach(par => { const k = [...par.children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents'); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) res.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); } }); return res; });
                        eq(o.join(';'), '', tag + 'no blocks overlap at scroll ' + pos);
                    }
                    if (filled && w === 1280) {
                        const cols = await page.evaluate(() => [document.querySelector('.col-a').getBoundingClientRect().left, document.querySelector('.col-b').getBoundingClientRect().left]);
                        ok(cols[1] - cols[0] > 300, tag + 'two columns on desktop');
                    }
                }
                if (w <= 390) { await page.fill('#i-qty', ''); await page.fill('#i-value', ''); if (filled) await page.reload({ waitUntil: 'networkidle' }); }
            }
        }
        await ctx.close();
    }

    // ---------- 18. help dialog and theme switch ----------
    for (const w of [320, 390, 820, 1280]) {
        ({ ctx, page } = await ctxPage({ viewport: { width: w, height: 800 } }));
        await page.click('.help-btn');
        const d = page.locator('dialog.help');
        const r = await d.boundingBox();
        ok(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w + 1 && r.y + r.height <= 801, 'help fits at ' + w);
        has(await d.innerText(), 'How to use the Home Inventory', 'help title at ' + w);
        await page.keyboard.press('Escape'); ok(!(await d.evaluate(e => e.open)), 'Escape closes help at ' + w);
        await page.click('.help-btn'); await page.locator('.help-close').click(); ok(!(await d.evaluate(e => e.open)), 'Got it closes help at ' + w);
        const bb = await page.locator('.help-btn').boundingBox(), tb = await page.locator('.theme-toggle').boundingBox(), bk = await page.locator('.back').boundingBox();
        ok(bb && tb && bk && bb.y < 80 && Math.abs(bb.y - bk.y) < 30 && Math.abs(tb.y - bk.y) < 30, 'top bar buttons sit in one row at ' + w);
        if (w === 390) {
            const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            await page.click('.theme-toggle');
            const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            ok(before !== after, 'light/dark switch changes the look');
        }
        await ctx.close();
    }

    // ---------- 19. phone screenshot ----------
    if (SHOTS) {
        ({ ctx, page } = await ctxPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }));
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SLUG + '.state', state]);
        await page.reload({ waitUntil: 'networkidle' });
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'phone.png'), clip: { x: 0, y: 0, width: 390, height: 1400 }, fullPage: true });
        await ctx.close();
    }
    eq(errors.length, 0, 'no console errors: ' + errors.slice(0, 3).join(' | '));
    eq(bad.length, 0, 'no failed requests: ' + bad.slice(0, 3).join(' | '));
    await browser.close(); if (srv) srv.s.close();
    console.log(pass + ' UI checks passed, ' + fails.length + ' failed' + (fails.length ? '\n' + fails.map(f => 'FAIL ' + f).join('\n') : ''));
    process.exit(fails.length ? 1 : 0);
})();
