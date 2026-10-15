// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Thu 15 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'warranty-and-return-deadline-tracker', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-15T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 300) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, now) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        await page.clock.setFixedTime(now || NOW);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).innerText();
    const boxOf = (page, name) => page.locator('li.box', { has: page.locator('.box-name', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) });
    const linesOf = async (page, name) => (await boxOf(page, name).locator('.dl li').allInnerTexts());
    async function add(page, f) {
        if (!(await page.locator('#form').isVisible())) await page.click('#open-form');
        await page.fill('#f-name', f.name);
        if (f.shop != null) await page.fill('#f-shop', f.shop);
        if (f.bought) await page.fill('#f-bought', f.bought);
        if (f.deliv) { await page.click('#o-deliv'); await page.fill('#f-deliv', f.deliv); }
        if (f.ret) await page.selectOption('#f-ret', f.ret);
        if (f.retDays != null) await page.fill('#f-retdays', String(f.retDays));
        if (f.retUntil) await page.fill('#f-retuntil', f.retUntil);
        if (f.war) await page.selectOption('#f-war', f.war);
        if (f.warNum != null) { await page.fill('#f-warnum', String(f.warNum)); await page.selectOption('#f-warunit', f.warUnit || 'y'); }
        if (f.warUntil) await page.fill('#f-waruntil', f.warUntil);
        if (f.ext) { await page.click('#o-ext'); await page.selectOption('#f-ext', f.ext); }
        if (f.price != null || f.order || f.serial || f.note) {
            if (await page.locator('#o-more').isVisible()) await page.click('#o-more');
            if (f.price != null) await page.fill('#f-price', String(f.price));
            if (f.order) await page.fill('#f-order', f.order);
            if (f.serial) await page.fill('#f-serial', f.serial);
            if (f.note) await page.fill('#f-note', f.note);
        }
        if (f.check) await f.check();
        await page.click('#save');
    }
    const WASHER = { name: 'Washing machine', shop: 'Currys', bought: '2026-10-03', ret: '30', war: '24', price: '449.99', order: 'CUR-55120', serial: 'WM8X-2207' };
    const SHOES = { name: 'Running shoes', shop: 'Zara', bought: '2026-10-09', ret: '14', war: 'none', price: '59.90' };
    const PHONE = { name: 'Phone', shop: 'amazon.com', bought: '2026-10-10', deliv: '2026-10-14', ret: '28', war: '12', ext: '24', price: '799' };
    const TV = { name: 'TV', shop: 'Argos', bought: '2025-11-01', war: '12', price: '379' };
    const KETTLE = { name: 'Kettle', shop: 'Tesco', bought: '2023-02-01', war: '12', price: '24.99' };
    const BAG = { name: 'Backpack', shop: 'Osprey', bought: '2025-05-01', ret: '60', war: 'life', price: '120' };

    // ---------- first use ----------
    let { ctx, page } = await newPage();
    ok('first use: empty message', (await txt(page, '#empty')).startsWith('Nothing here yet'));
    ok('first use: form open, no "+ Add" button', await page.locator('#form').isVisible() && !(await page.locator('#open-form').isVisible()));
    ok('first use: no Cancel when there is nothing to go back to', !(await page.locator('#cancel').isVisible()));
    ok('first use: form comes before the summary on a phone', (await page.locator('#add').boundingBox()).y < (await page.locator('#summary').boundingBox()).y);
    ok('first use: bought on is today', (await page.inputValue('#f-bought')) === '2026-10-15');
    ok('first use: defaults 30 days and 2 years', (await page.inputValue('#f-ret')) === '30' && (await page.inputValue('#f-war')) === '24');
    ok('first use: preview shows the answer before saving', (await txt(page, '#preview')) === 'Return by Sat 14 Nov · Warranty until 14 Oct 2028', await txt(page, '#preview'));
    ok('optional fields hidden behind + buttons', !(await page.locator('#w-deliv').isVisible()) && !(await page.locator('#w-ext').isVisible()) && !(await page.locator('#w-more').isVisible()) && !(await page.locator('#w-photo').isVisible()));
    ok('copy all disabled while empty', await page.locator('#copy-all').isDisabled());

    // ---------- mistakes in the form ----------
    await page.click('#save');
    ok('blank name refused', (await txt(page, '#e-name')).includes('Type what you bought'));
    ok('blank name marked invalid and focused', (await page.getAttribute('#f-name', 'aria-invalid')) === 'true' && await page.evaluate(() => document.activeElement.id) === 'f-name');
    await page.fill('#f-name', 'Test'); await page.fill('#f-bought', '2026-10-20'); await page.click('#save');
    ok('future purchase refused', (await txt(page, '#e-bought')) === 'The day you bought it cannot be after today.');
    await page.fill('#f-bought', '2026-10-01'); await page.selectOption('#f-ret', 'custom');
    ok('custom days field appears', await page.locator('#f-retdays').isVisible());
    for (const bad of ['0', '366', '-3', '1.5', 'abc', '']) { await page.fill('#f-retdays', bad); await page.click('#save'); ok('return days "' + bad + '" refused', (await txt(page, '#e-ret')).includes('1 to 365')); }
    await page.fill('#f-retdays', '45');
    await page.selectOption('#f-war', 'custom'); await page.fill('#f-warnum', '51'); await page.selectOption('#f-warunit', 'y'); await page.click('#save');
    ok('51-year warranty refused', (await txt(page, '#e-war')).includes('1 to 50 years'));
    await page.selectOption('#f-war', 'until'); await page.fill('#f-waruntil', '2026-09-01'); await page.click('#save');
    ok('warranty ending before purchase refused', (await txt(page, '#e-war')).includes('cannot end before'));
    await page.selectOption('#f-war', 'life');
    ok('lifetime hides the extended warranty button', !(await page.locator('#o-ext').isVisible()));
    await page.click('#o-more'); await page.fill('#f-price', '-5'); await page.click('#save');
    ok('negative price refused', (await txt(page, '#e-price')).includes('negative'));
    await page.fill('#f-price', '99999999'); await page.click('#save');
    ok('huge price refused', (await txt(page, '#e-price')).includes('too big'));
    await page.fill('#f-price', '');
    await page.click('#o-deliv'); await page.fill('#f-deliv', '2026-09-20'); await page.click('#save');
    ok('delivery before purchase refused', (await txt(page, '#e-deliv')).includes('before the day you bought'));
    await page.click('#x-deliv');
    ok('remove delivery hides it again', !(await page.locator('#w-deliv').isVisible()) && await page.locator('#o-deliv').isVisible());
    // only a name is needed: everything optional is left blank
    await page.selectOption('#f-war', '24'); await page.selectOption('#f-ret', '30'); await page.fill('#f-bought', '2026-10-15'); await page.fill('#f-name', 'Toaster');
    await page.click('#save');
    ok('only a name is needed (optional fields not forced)', await boxOf(page, 'Toaster').count() === 1);
    ok('added message with Undo', (await txt(page, '#form-msg')).startsWith('Added Toaster. Return by Sat 14 Nov (30 days left).') && await page.locator('#form-msg .undo').isVisible());
    ok('form closes after adding, "+ Add" button shows', !(await page.locator('#form').isVisible()) && await page.locator('#open-form').isVisible() && !(await page.locator('#form-h').isVisible()));
    await page.click('#form-msg .undo');
    ok('undo add', await boxOf(page, 'Toaster').count() === 0 && await page.locator('#form').isVisible());

    // ---------- the real situation ----------
    await add(page, WASHER);
    ok('washer return line', (await linesOf(page, 'Washing machine'))[0] === 'Return by Mon 2 Nov (18 days left)', await linesOf(page, 'Washing machine'));
    ok('washer warranty line', (await linesOf(page, 'Washing machine'))[1] === 'Warranty until 2 Oct 2028 (1 year 11 months left)');
    ok('washer sub line', (await boxOf(page, 'Washing machine').locator('.box-sub').first().innerText()) === 'Currys · bought 3 Oct 2026');
    ok('washer order and serial shown', (await boxOf(page, 'Washing machine').innerText()).includes('Order: CUR-55120 · Serial: WM8X-2207'));
    ok('price shown plain by default', (await boxOf(page, 'Washing machine').locator('.badge').innerText()) === '449.99');
    await add(page, SHOES);
    ok('next deadline is the shoes', (await txt(page, '#sum-body .next')) === 'Return Running shoes to Zara by Fri 23 Oct' && (await txt(page, '#sum-body .next-left')) === '8 days left');
    ok('shoes say no warranty', (await linesOf(page, 'Running shoes'))[1] === 'No warranty');
    await add(page, PHONE);
    ok('phone counts from delivery', (await linesOf(page, 'Phone'))[0] === 'Return by Wed 11 Nov (27 days left)', await linesOf(page, 'Phone'));
    ok('phone extended warranty', (await linesOf(page, 'Phone'))[2] === 'Extended warranty until 13 Oct 2029 (2 years 11 months left)');
    await add(page, TV); await add(page, KETTLE); await add(page, BAG);
    ok('sections in order', JSON.stringify(await page.locator('#l-return .box-name').allInnerTexts()) === JSON.stringify(['Running shoes', 'Washing machine', 'Phone'])
        && JSON.stringify(await page.locator('#l-warranty .box-name').allInnerTexts()) === JSON.stringify(['TV', 'Backpack'])
        && JSON.stringify(await page.locator('#l-ended .box-name').allInnerTexts()) === JSON.stringify(['Kettle']), await page.locator('li.box .box-name').allInnerTexts());
    ok('TV warranty ending in 16 days is orange', await boxOf(page, 'TV').locator('.dl li.urgent').count() === 1 && (await linesOf(page, 'TV'))[1] === 'Warranty until 31 Oct 2026 (16 days left)');
    ok('kettle ended line', (await linesOf(page, 'Kettle'))[1] === 'Warranty ended 31 Jan 2024 (2 years 8 months ago)', await linesOf(page, 'Kettle'));
    ok('backpack lifetime', (await linesOf(page, 'Backpack'))[1] === 'Lifetime warranty');
    ok('summary counts', (await page.locator('.counts li').allInnerTexts()).join('|') === '3 can still be returned|4 under warranty|1 cover ended', await page.locator('.counts li').allInnerTexts());
    ok('summary worth line', (await txt(page, '#sum-body .hint')) === '1 warranty ends within 30 days. 1,747.99 of your things are under warranty.', await txt(page, '#sum-body .hint'));
    ok('search shows at 6 items', await page.locator('#find').isVisible());
    await page.fill('#find', 'wm8x');
    ok('search by serial number', JSON.stringify(await page.locator('li.box .box-name').allInnerTexts()) === '["Washing machine"]');
    await page.fill('#find', 'nothing like this');
    ok('search with no match says so', await page.locator('#find-none').isVisible());
    await page.fill('#find', '');

    // ---------- currency ----------
    await page.selectOption('#cur', '£');
    ok('currency on prices', (await boxOf(page, 'Washing machine').locator('.badge').innerText()) === '£449.99');

    // ---------- edit a mistake ----------
    await boxOf(page, 'Running shoes').getByRole('button', { name: 'Edit' }).click();
    ok('edit fills the form', (await page.inputValue('#f-name')) === 'Running shoes' && (await page.inputValue('#f-bought')) === '2026-10-09' && (await txt(page, '#form-h')) === 'Edit Running shoes' && (await txt(page, '#save')) === 'Save changes');
    ok('edit shows the price field it has', await page.locator('#f-price').isVisible() && (await page.inputValue('#f-price')) === '59.90');
    await page.fill('#f-bought', '2026-10-11'); await page.click('#save');
    ok('edit saved', (await linesOf(page, 'Running shoes'))[0] === 'Return by Sun 25 Oct (10 days left)');
    await page.click('#form-msg .undo');
    ok('undo edit', (await linesOf(page, 'Running shoes'))[0] === 'Return by Fri 23 Oct (8 days left)');
    // custom values come back into the form
    await boxOf(page, 'Toaster').count();
    await add(page, { name: 'Drill', shop: 'B&Q', bought: '2026-10-01', ret: 'custom', retDays: 45, war: 'custom', warNum: 18, warUnit: 'm' });
    ok('custom return days and warranty months', (await linesOf(page, 'Drill')).join('|') === 'Return by Sun 15 Nov (31 days left)|Warranty until 31 Mar 2028 (1 year 5 months left)', await linesOf(page, 'Drill'));
    await boxOf(page, 'Drill').getByRole('button', { name: 'Edit' }).click();
    ok('custom values restored in edit', (await page.inputValue('#f-ret')) === 'custom' && (await page.inputValue('#f-retdays')) === '45' && (await page.inputValue('#f-warnum')) === '18' && (await page.inputValue('#f-warunit')) === 'm');
    await page.click('#del');
    ok('delete from the edit form', await boxOf(page, 'Drill').count() === 0 && (await txt(page, '#form-msg')).startsWith('Deleted Drill.'));
    await page.click('#form-msg .undo');
    ok('undo delete', await boxOf(page, 'Drill').count() === 1);
    await boxOf(page, 'Drill').getByRole('button', { name: 'Edit' }).click(); await page.click('#cancel');
    ok('cancel closes the form without changes', !(await page.locator('#form').isVisible()) && await boxOf(page, 'Drill').count() === 1);

    // ---------- keeping, returning, no longer have ----------
    await boxOf(page, 'Washing machine').getByRole('button', { name: 'Keeping it' }).click();
    ok('keeping it moves to under warranty', (await page.locator('#l-warranty .box-name').allInnerTexts()).includes('Washing machine') && (await linesOf(page, 'Washing machine'))[0] === 'Keeping it (could return until Mon 2 Nov)');
    await boxOf(page, 'Washing machine').getByRole('button', { name: 'Might return it' }).click();
    ok('might return it brings the countdown back', (await page.locator('#l-return .box-name').allInnerTexts()).includes('Washing machine'));
    await boxOf(page, 'Running shoes').getByRole('button', { name: 'Returned it' }).click();
    ok('returned moves to archive', (await page.locator('#l-archive .box-name').allTextContents()).includes('Running shoes') && (await txt(page, '#archive-sum')) === 'Returned or no longer have (1)');
    ok('next deadline moves on', (await txt(page, '#sum-body .next')) === 'Warranty on TV ends Sat 31 Oct 2026', await txt(page, '#sum-body .next'));
    await page.click('#list-msg .undo');
    ok('undo returned', (await page.locator('#l-return .box-name').allInnerTexts()).includes('Running shoes'));
    await boxOf(page, 'Kettle').getByRole('button', { name: 'No longer have it' }).click();
    await page.click('#archive-sum');
    ok('archived item has Put back and Delete', await boxOf(page, 'Kettle').getByRole('button', { name: 'Put back' }).isVisible() && await boxOf(page, 'Kettle').getByRole('button', { name: 'Delete' }).isVisible());
    await boxOf(page, 'Kettle').getByRole('button', { name: 'Put back' }).click();
    ok('put back', (await page.locator('#l-ended .box-name').allInnerTexts()).includes('Kettle'));

    // ---------- copy, email, calendar ----------
    await boxOf(page, 'Washing machine').getByRole('button', { name: 'Copy' }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy for a claim', clip === 'Washing machine (Currys)\nBought 3 Oct 2026, £449.99\nReturn by Mon 2 Nov (18 days left)\nWarranty until 2 Oct 2028 (1 year 11 months left)\nOrder or receipt number: CUR-55120\nSerial number: WM8X-2207', clip);
    const mail = await page.getAttribute('#mail-all', 'href');
    ok('email works with no recipient', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('Return by Mon 2 Nov'));
    let [dl] = await Promise.all([page.waitForEvent('download'), boxOf(page, 'Washing machine').getByRole('button', { name: 'Calendar' }).click()]);
    let ics = fs.readFileSync(await dl.path(), 'utf8');
    ok('item calendar file', dl.suggestedFilename() === 'washing-machine-deadlines.ics' && ics.includes('DTSTART;VALUE=DATE:20261102') && ics.includes('DTSTART;VALUE=DATE:20281002') && (ics.match(/BEGIN:VEVENT/g) || []).length === 2);
    ok('no Calendar button when nothing is left to remind', await boxOf(page, 'Kettle').getByRole('button', { name: 'Calendar' }).count() === 0);
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cal-all')]);
    ics = fs.readFileSync(await dl.path(), 'utf8');
    ok('all deadlines file', (ics.match(/BEGIN:VEVENT/g) || []).length === 9 && (await txt(page, '#set-msg')).startsWith('Saved a calendar file with 9 deadlines'), (ics.match(/BEGIN:VEVENT/g) || []).length);
    await page.click('#copy-all');
    const all = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy the list', all.startsWith('My purchases, return deadlines and warranties (15 Oct 2026)') && all.includes('CAN STILL BE RETURNED') && all.includes('COVER ENDED'));

    // ---------- receipt photo ----------
    await boxOf(page, 'TV').getByRole('button', { name: 'Edit' }).click();
    await page.click('#o-photo');
    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 2400; c.height = 3200; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 2400, 3200); g.fillStyle = '#000'; g.font = '200px sans-serif'; g.fillText('RECEIPT', 300, 600); return c.toDataURL('image/png').split(',')[1]; });
    await page.setInputFiles('#f-file', { name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForSelector('#f-thumb:not([hidden])');
    ok('photo preview shows', await page.locator('#f-thumb').isVisible() && await page.locator('#f-unpick').isVisible());
    await page.setInputFiles('#f-file', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    ok('non-image refused', (await txt(page, '#e-photo')) === 'Choose a photo or a PDF.' && await page.locator('#f-thumb').isVisible());
    await page.click('#save');
    await page.waitForSelector('li.box[data-id] >> text=Receipt');
    await boxOf(page, 'TV').getByRole('button', { name: 'Receipt' }).click();
    await page.waitForFunction(() => document.getElementById('photo-dlg').open && document.getElementById('photo-img').naturalWidth > 0);
    const size = await page.evaluate(() => [document.getElementById('photo-img').naturalWidth, document.getElementById('photo-img').naturalHeight]);
    ok('receipt opens, made smaller to 1600px', size[0] === 1200 && size[1] === 1600, size);
    await page.click('#photo-close');
    ok('receipt viewer closes', !(await page.evaluate(() => document.getElementById('photo-dlg').open)));
    // PDF receipt
    await boxOf(page, 'Phone').getByRole('button', { name: 'Edit' }).click(); await page.click('#o-photo');
    await page.setInputFiles('#f-file', { name: 'order.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%fake\n') });
    await page.waitForSelector('#f-pdf:not([hidden])');
    ok('PDF receipt accepted', await page.locator('#f-pdf').isVisible());
    await page.click('#save');
    await page.waitForSelector('#form', { state: 'hidden' });
    ok('PDF receipt saved', await boxOf(page, 'Phone').getByRole('button', { name: 'Receipt' }).count() === 1);

    // ---------- reload keeps everything ----------
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps items', (await page.locator('li.box').count()) === 7 && (await linesOf(page, 'Washing machine'))[0] === 'Return by Mon 2 Nov (18 days left)');
    ok('reload keeps currency', (await page.inputValue('#cur')) === '£');
    ok('reload: form closed when there are items', !(await page.locator('#form').isVisible()));
    await boxOf(page, 'TV').getByRole('button', { name: 'Receipt' }).click();
    await page.waitForFunction(() => document.getElementById('photo-dlg').open && document.getElementById('photo-img').naturalWidth > 0);
    ok('receipt photo kept after reload', true);
    await page.click('#photo-close');

    // ---------- backup, delete everything, restore ----------
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupPath = path.join(__dirname, '..', '.tmp-backup.json'); fs.copyFileSync(await dl.path(), backupPath);
    const bk = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    ok('backup has items and receipts', bk.app === SLUG && bk.state.items.length === 7 && Object.keys(bk.photos).length === 2);
    await page.click('#wipe');
    ok('delete everything', (await page.locator('li.box').count()) === 0 && await page.locator('#form').isVisible() && await page.locator('#set-msg .undo').isVisible());
    await page.click('#set-msg .undo');
    ok('undo delete everything', (await page.locator('li.box').count()) === 7);
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await page.waitForFunction(() => document.getElementById('set-msg').textContent.includes('not a backup'));
    ok('bad backup refused, nothing changed', (await page.locator('li.box').count()) === 0);
    // a fresh device: clear the receipts too, then restore
    await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('warranty-and-return-deadline-tracker.receipts'); q.onsuccess = q.onerror = q.onblocked = () => r(); setTimeout(r, 1500); }));
    await page.setInputFiles('#restore-file', backupPath);
    await page.waitForFunction(() => document.getElementById('set-msg').textContent.startsWith('Restored 7 items'));
    ok('restore brings items back', (await page.locator('li.box').count()) === 7);
    fs.unlinkSync(backupPath);
    await ctx.close();

    // ---------- second use the next day, odd input, corrupt state ----------
    ({ ctx, page } = await newPage({}, new Date('2026-10-15T10:00:00+05:00')));
    await add(page, { name: '  Big   TV   from the  sale  ' + 'x'.repeat(200), bought: '2026-10-15', ret: '7', war: 'none' });
    ok('pasted long name cleaned and clipped', (await page.locator('.box-name').first().innerText()).length <= 80 && !/\s\s/.test(await page.locator('.box-name').first().innerText()) && (await page.locator('.box-name').first().innerText()).startsWith('Big TV from the sale x'));
    ok('long name: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await add(page, { name: '<img src=x onerror=alert(1)>', bought: '2026-10-15' });
    ok('typed HTML shown as text', await page.locator('.box-name', { hasText: '<img src=x onerror=alert(1)>' }).count() === 1);
    await page.clock.setFixedTime(new Date('2026-10-21T09:00:00+05:00'));
    await page.reload({ waitUntil: 'networkidle' });
    ok('next day: days left move on', (await linesOf(page, '<img src=x onerror=alert(1)>'))[0] === 'Return by Sat 14 Nov (24 days left)', await linesOf(page, '<img src=x onerror=alert(1)>'));
    ok('7-day window, 1 day left is orange', await page.locator('li.box.soon').count() === 1);
    await page.clock.setFixedTime(new Date('2026-10-22T09:00:00+05:00'));
    await page.reload({ waitUntil: 'networkidle' });
    ok('last day says today', (await page.locator('li.box').first().locator('.dl li').first().innerText()) === 'Return by Thu 22 Oct (today is the last day)');
    await page.evaluate(k => localStorage.setItem(k, '{"items":[{"id":1,"name":"ok","bought":"2026-10-01"},{"id":"bad"}],"cur":"<b>"}'), KEY);
    await page.reload({ waitUntil: 'networkidle' });
    ok('half-broken saved state keeps the good items', (await page.locator('li.box').count()) === 1);
    await page.evaluate(k => localStorage.setItem(k, '{broken'), KEY);
    await page.reload({ waitUntil: 'networkidle' });
    ok('corrupt saved state starts fresh with a message', (await page.locator('li.box').count()) === 0 && (await txt(page, '#set-msg')).includes('could not be read'));
    // keyboard only
    await page.focus('#f-name'); await page.keyboard.type('Headphones'); await page.keyboard.press('Enter');
    ok('keyboard: Enter adds the item', await boxOf(page, 'Headphones').count() === 1);
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')].filter(e => !(e.labels && e.labels.length) && !e.getAttribute('aria-label')).map(e => e.id));
    ok('every field has a label', !unlabelled.length, unlabelled);
    await ctx.close();

    // ---------- layout with everything open, at every width, dark and light ----------
    const fill = async p => {
        for (const f of [WASHER, SHOES, PHONE, TV, KETTLE, BAG]) await add(p, f);
        await p.selectOption('#cur', '£');
        await p.click('#open-form');
        await p.click('#o-deliv'); await p.click('#o-ext'); await p.click('#o-more'); await p.click('#o-photo');
        await p.selectOption('#f-ret', 'custom'); await p.selectOption('#f-war', 'custom'); await p.selectOption('#f-ext', 'custom');
    };
    for (const scheme of ['dark', 'light']) {
        ({ ctx, page } = await newPage({ colorScheme: scheme }));
        await fill(page);
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await page.setViewportSize({ width: w, height: 900 });
            await page.waitForTimeout(60);
            const tag = scheme + ' ' + w + 'px';
            ok(tag + ' no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.id || e.className).slice(0, 3));
            ok(tag + ' nothing sticks out', !out.length, out);
            for (const pos of [0, .5, 1]) {
                await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const bad = await page.evaluate(() => { const o = []; document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(c).display !== 'contents'; });
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) o.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); } }); return o; });
                ok(tag + ' no overlapping blocks at scroll ' + pos, !bad.length, bad);
            }
            if (w <= 390) {
                const c = await page.evaluate(() => { const k = [...document.querySelectorAll('main input:not([type=checkbox]):not([type=file]), main select, main button, main textarea, main a.secondary')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const bad = [];
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((k[i].id || k[i].textContent) + '/' + (k[j].id || k[j].textContent)); } return bad; });
                ok(tag + ' no overlapping controls with every option open', !c.length, c);
                // placeholders fit their boxes
                const cut = await page.evaluate(() => { const cv = document.createElement('canvas').getContext('2d'); return [...document.querySelectorAll('main input[placeholder], main textarea[placeholder]')].filter(e => e.offsetWidth).filter(e => { const cs = getComputedStyle(e); cv.font = cs.fontSize + ' ' + cs.fontFamily; const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); return e.tagName === 'INPUT' && cv.measureText(e.placeholder).width > room; }).map(e => e.id); });
                ok(tag + ' placeholders fit', !cut.length, cut);
                const narrow = await page.evaluate(() => [...document.querySelectorAll('main input[type=date]')].filter(e => e.offsetWidth && e.getBoundingClientRect().width < 150).map(e => e.id));
                ok(tag + ' date boxes are full width', !narrow.length, narrow);
            }
        }
        if (scheme === 'dark') {
            await page.setViewportSize({ width: 1280, height: 900 }); await page.evaluate(() => scrollTo(0, 0));
            const side = await page.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect().left, document.querySelector('.col-side').getBoundingClientRect().left]);
            ok('desktop: two columns side by side', side[1] > side[0] + 300, side);
            const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            await page.click('.theme-toggle');
            const after = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, document.documentElement.getAttribute('data-theme')]);
            ok('light/dark switch changes the look', before !== after[0] && after[1] === 'light', after);
        }
        await ctx.close();
    }

    // ---------- every file the page asks for loads ----------
    ok('no failed requests', !failed.length, failed);
    ok('help.js, theme.js and the app files requested', ['help.js', 'theme.js', 'core.js', 'script.js', 'style.css'].every(f => [...requested].some(u => u.endsWith(f))), [...requested].map(u => u.replace(base, '')));
    for (const f of ['favicon.svg', 'manifest.webmanifest', '../help.js', '../theme.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'sw.js', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await (await browser.newContext()).request.get(URL + f); ok('file loads: ' + f, r.status() === 200, r.status());
    }
    ok('no console errors', !errors.length, errors);

    // ---------- screenshots for the README ----------
    if (SHOTS) {
        for (const [name, vp, scale] of [['desktop', { width: 1280, height: 1000 }, 1], ['phone', { width: 390, height: 1240 }, 2]]) {
            ({ ctx, page } = await newPage({ viewport: vp, deviceScaleFactor: scale, colorScheme: 'dark' }));
            for (const f of [WASHER, SHOES, PHONE, TV, KETTLE, BAG]) await add(page, f);
            await page.selectOption('#cur', '£');
            await page.evaluate(() => { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.classList.remove('show'); }); scrollTo(0, 0); });
            if (name === 'desktop') await page.click('#open-form'), await page.fill('#f-name', 'Coffee machine'), await page.fill('#f-shop', 'John Lewis'), await page.fill('#f-bought', '2026-10-12'), await page.evaluate(() => { scrollTo(0, 0); document.activeElement.blur(); });
            await page.screenshot({ path: path.join(__dirname, 'screenshots', name + '.png'), fullPage: name === 'desktop' ? false : false });
            await ctx.close();
        }
        console.log('screenshots saved');
    }

    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
