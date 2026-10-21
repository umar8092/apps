// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Wed 21 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'school-fee-and-tuition-payment-tracker-for-parents', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-21T16:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// the family from the README
const P = (id, d, amt, note) => ({ id, d, amt: Math.round(amt * 100), note: note || '', photo: '' });
const F = (id, name, amt, every, due, start, payments, extra) => Object.assign({ id, name, amts: [{ from: start, amt: Math.round(amt * 100) }], every, due, start, end: '', skip: [], payments }, extra || {});
const FAMILY = { v: 1, cur: 'Rs', style: 'sa', nextId: 20, children: [
    { id: 1, name: 'Ali', school: 'City School, Grade 4', fees: [F(2, 'School fee', 8000, 1, 10, '2026-08', [P(3, '2026-08-10', 8000, 'Receipt 4410'), P(4, '2026-09-09', 8000), P(5, '2026-10-12', 4000)], { skip: [6, 7] }),
        F(6, 'Van or bus', 3500, 1, 25, '2026-08', [P(7, '2026-08-25', 3500), P(8, '2026-09-24', 3500)], { skip: [6, 7] })] },
    { id: 9, name: 'Sara', school: 'City School, Grade 2', fees: [F(12, 'School fee', 7200, 1, 10, '2026-08', [P(13, '2026-08-08', 14400), P(14, '2026-10-10', 7200)]),
        F(10, 'Academy', 6000, 3, 1, '2026-09', [P(11, '2026-09-01', 6000)]), F(15, 'Annual charges', 15000, 12, 15, '2026-08', [P(16, '2026-08-14', 15000)])] }] };
// a tiny PNG receipt photo
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGklEQVR4nGP8z8Dwn4EIwESMolGFowqpqxAAy2oCHkTFGbcAAAAASUVORK5CYII=', 'base64');

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, seed) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark', locale: 'en-GB' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        if (seed !== undefined) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, typeof seed === 'string' ? seed : JSON.stringify(seed)]);
        await ctx.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
        const page = await ctx.newPage();
        page.setDefaultTimeout(8000);
        await page.clock.setFixedTime(NOW);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error' && !/rate limit/.test(m.text())) errors.push(m.text()); });  // the hub asks the GitHub API for new folders, which may be rate limited
        page.on('response', r => { requested.add(r.url()); if (r.status() >= 400 && !/goatcounter|zgo|api\.github\.com/.test(r.url())) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    const child = (page, name) => page.locator('#boxes > li.box').filter({ has: page.locator('h3.box-name', { hasText: new RegExp('^' + name + '$') }) });
    const fee = (page, kid, name) => child(page, kid).locator('li.fee').filter({ has: page.locator('h4.fee-name', { hasText: new RegExp('^' + name + '$') }) });
    const text = async loc => (await loc.innerText()).replace(/\s+/g, ' ').trim();
    const msg = page => text(page.locator('#list-msg'));
    let ctx, page;

    // ---------- 1. first use: empty state, add Ali's school fee ----------
    ({ ctx, page } = await newPage());
    ok('first use: form open', await page.locator('#form').isVisible());
    ok('first use: lists hidden', !(await page.locator('#list').isVisible()) && !(await page.locator('#due').isVisible()));
    ok('first use: child picker hidden', !(await page.locator('#f-child').isVisible()));
    ok('first use: school name optional and hidden', !(await page.locator('#f-school').isVisible()) && await page.locator('#o-school').isVisible());
    ok('first use: no Cancel', !(await page.locator('#cancel').isVisible()));
    ok('first use: start defaults to this month', await page.locator('#f-sm').inputValue() === '10' && await page.locator('#f-sy').inputValue() === '2026');
    // blank submit
    await page.click('#save');
    ok('blank: child error', (await page.locator('#e-child').innerText()).includes('child'));
    ok('blank: fee error', (await page.locator('#e-name').innerText()).length > 0);
    ok('blank: amount error', (await page.locator('#e-amt').innerText()).length > 0);
    ok('blank: focus on name', await page.evaluate(() => document.activeElement.id) === 'f-name');
    ok('blank: nothing saved', (await saved(page)).children.length === 0);
    await page.fill('#f-name', '  Ali  ');
    await page.click('#fee-chips .chip[data-fee="School fee"]');
    ok('chip fills the fee', await page.locator('#f-fee').inputValue() === 'School fee');
    ok('chip marked on', await page.locator('#fee-chips .chip[data-fee="School fee"]').getAttribute('aria-pressed') === 'true');
    for (const [v, want] of [['abc', 'number'], ['0', 'Type the fee'], ['-5', 'number'], ['999999999999', 'too large']]) {
        await page.fill('#f-amt', v); await page.click('#save');
        ok('amount "' + v + '" refused', (await page.locator('#e-amt').innerText()).includes(want), await page.locator('#e-amt').innerText());
    }
    await page.fill('#f-amt', '8,000');
    await page.selectOption('#f-due', '10');
    await page.selectOption('#f-sm', '08');
    ok('preview', (await page.locator('#preview').innerText()).includes('Ali: School fee, 8,000 every month. First: August 2026, due Mon 10 Aug 2026 (already due'), await page.locator('#preview').innerText());
    await page.click('#save');
    ok('added: box shows', await child(page, 'Ali').count() === 1);
    ok('added: owes 3 months', (await text(fee(page, 'Ali', 'School fee'))).includes('Owes 24,000 since August 2026 (3 fees), 72 days late.'), await text(fee(page, 'Ali', 'School fee')));
    ok('added: nothing paid yet', (await text(fee(page, 'Ali', 'School fee'))).includes('Nothing paid yet.'));
    ok('added: form folds away', !(await page.locator('#form').isVisible()) && await page.locator('#open-form').isVisible());
    ok('added: name trimmed', (await saved(page)).children[0].name === 'Ali');
    ok('due card: 24,000 left in October', (await text(page.locator('#due-body'))).includes('24,000 left to pay in October'));

    // ---------- 2. record a payment: 20,000 pays August, September and half of October ----------
    await fee(page, 'Ali', 'School fee').getByRole('button', { name: /^Record a payment/ }).click();
    const pf = fee(page, 'Ali', 'School fee').locator('form.panel');
    ok('pay: date defaults to today', await pf.locator('input[type=date]').inputValue() === '2026-10-21');
    ok('pay: note and photo optional', !(await pf.locator('.opt').isVisible()) && await pf.getByRole('button', { name: '+ Add a photo of the receipt (optional)' }).count() === 1);
    await pf.getByRole('button', { name: 'Fill in what is owed: 24,000' }).click();
    ok('pay: fill in owed', await pf.locator('input[inputmode=decimal]').inputValue() === '24000');
    await pf.locator('input[type=date]').fill('2026-10-22');
    await pf.locator('input[inputmode=decimal]').fill('');
    await pf.getByRole('button', { name: 'Save payment' }).click();
    ok('pay: future date refused', (await text(pf)).includes('That day has not come yet.'));
    ok('pay: blank amount refused', (await text(pf)).includes('Type the amount paid'));
    await pf.locator('input[type=date]').fill('2026-10-20');
    await pf.locator('input[inputmode=decimal]').fill('20000');
    await pf.getByRole('button', { name: '+ Add a note (optional)' }).click();
    await pf.locator('.opt input').fill('Receipt\n4471');
    await pf.getByRole('button', { name: 'Save payment' }).click();
    let ft = await text(fee(page, 'Ali', 'School fee'));
    ok('paid: owes 4,000 for October', ft.includes('Owes 4,000 for October 2026, 11 days late.'), ft);
    ok('paid: paid up to September', ft.includes('Paid up to September 2026.'));
    ok('paid: message', (await msg(page)).includes('Payment saved: 8,000') === false && (await msg(page)).includes('Payment saved: 20,000 yesterday') && (await msg(page)).includes('Still owes 4,000.'), await msg(page));
    ok('paid: note cleaned', (await saved(page)).children[0].fees[0].payments[0].note === 'Receipt 4471');
    // undo and redo
    await page.locator('#list-msg .undo').click();
    ok('undo payment', (await text(fee(page, 'Ali', 'School fee'))).includes('Owes 24,000'));
    await fee(page, 'Ali', 'School fee').getByRole('button', { name: /^Record a payment/ }).click();
    await pf.locator('input[type=date]').fill('2026-10-20'); await pf.locator('input[inputmode=decimal]').fill('20000');
    await pf.getByRole('button', { name: 'Save payment' }).click();
    ok('redo payment', (await text(fee(page, 'Ali', 'School fee'))).includes('Owes 4,000 for October 2026'));
    ok('child badge owes', (await text(child(page, 'Ali').locator('.badge'))) === 'Owes 4,000');

    // ---------- 3. second fee for Ali from his box, then a new child ----------
    await child(page, 'Ali').getByRole('button', { name: 'Add a fee for Ali' }).click();
    ok('add fee: child picked', await page.locator('#f-child').isVisible() && await page.locator('#f-child option:checked').innerText() === 'Ali');
    ok('add fee: no name field for an existing child', !(await page.locator('#f-name').isVisible()));
    ok('add fee: focus on fee', await page.evaluate(() => document.activeElement.id) === 'f-fee');
    await page.click('#fee-chips .chip[data-fee="Van or bus"]');
    await page.fill('#f-amt', '3500'); await page.selectOption('#f-due', '25'); await page.selectOption('#f-sm', '10');
    await page.click('#save');
    ok('van added', await fee(page, 'Ali', 'Van or bus').count() === 1);
    ok('van due in 4 days', (await text(page.locator('#due-body'))).includes('Ali: Van or bus, 3,500') && (await text(page.locator('#due-body'))).includes('due Sun 25 Oct (in 4 days)'), await text(page.locator('#due-body')));
    await page.click('#open-form');
    await page.selectOption('#f-child', 'new');
    ok('new child: name field shows', await page.locator('#f-name').isVisible());
    await page.fill('#f-name', 'Sara'); await page.click('#o-school'); await page.fill('#f-school', 'City School');
    await page.fill('#f-fee', 'Academy'); await page.fill('#f-amt', '6000'); await page.selectOption('#f-every', '3'); await page.selectOption('#f-due', '1'); await page.selectOption('#f-sm', '09');
    ok('every 3 months: hint', (await page.locator('#h-start').innerText()).includes('first month of a term'));
    await page.click('#save');
    ok('Sara added with school', (await text(child(page, 'Sara'))).includes('City School'));
    ok('term fee schedule', (await text(fee(page, 'Sara', 'Academy'))).includes('6,000 every 3 months, due on the 1st of Sep, Dec, Mar and Jun.'));
    ok('term fee owes Sep to Nov', (await text(fee(page, 'Sara', 'Academy'))).includes('Owes 6,000 for Sep 2026 to Nov 2026, 50 days late.'), await text(fee(page, 'Sara', 'Academy')));
    // typing an existing child's name adds to that child, not a second Sara
    await page.click('#open-form'); await page.selectOption('#f-child', 'new');
    await page.fill('#f-name', 'sara'); await page.click('#fee-chips .chip[data-fee="Admission fee"]');
    ok('admission chip sets Only once', await page.locator('#f-every').inputValue() === '0');
    ok('only once: label', await page.locator('#l-start').innerText() === 'Month it is due');
    await page.fill('#f-amt', '25000'); await page.selectOption('#f-sm', '08'); await page.selectOption('#f-due', '1');
    await page.click('#save');
    ok('same name joins the child', await page.locator('#boxes > li.box').count() === 2 && await fee(page, 'Sara', 'Admission fee').count() === 1);
    ok('once: owes', (await text(fee(page, 'Sara', 'Admission fee'))).includes('Owes 25,000, 81 days late.'));
    // pay admission with extra
    await fee(page, 'Sara', 'Admission fee').getByRole('button', { name: /^Record a payment/ }).click();
    await fee(page, 'Sara', 'Admission fee').locator('input[inputmode=decimal]').fill('26000');
    await fee(page, 'Sara', 'Admission fee').getByRole('button', { name: 'Save payment' }).click();
    ft = await text(fee(page, 'Sara', 'Admission fee'));
    ok('once: paid with extra', ft.includes('Paid.') && ft.includes('Paid 1,000 more than the fee.'), ft);

    // ---------- 4. payments list: edit and delete with undo ----------
    await fee(page, 'Ali', 'School fee').getByRole('button', { name: /^Payments \(1\)/ }).click();
    const pl = fee(page, 'Ali', 'School fee').locator('.panel');
    ok('list: what it paid for', (await text(pl)).includes('For August 2026, September 2026 (2 in all), part of October 2026 (4,000 of 8,000).'), await text(pl));
    await pl.getByRole('button', { name: /^Edit the payment/ }).click();
    const ef = fee(page, 'Ali', 'School fee').locator('form.panel');
    ok('edit: amount filled', await ef.locator('input[inputmode=decimal]').inputValue() === '20000');
    await ef.locator('input[inputmode=decimal]').fill('24000');
    await ef.getByRole('button', { name: 'Save changes' }).click();
    ft = await text(fee(page, 'Ali', 'School fee'));
    ok('edit: now paid up to October', ft.includes('Paid up to October 2026.') && !ft.includes('Owes'), ft);
    await fee(page, 'Ali', 'School fee').getByRole('button', { name: /^Payments/ }).click();
    await pl.getByRole('button', { name: /^Delete the payment/ }).click();
    ok('delete payment', (await text(fee(page, 'Ali', 'School fee'))).includes('Owes 24,000'));
    await page.locator('#list-msg .undo').click();
    ok('undo delete payment', (await text(fee(page, 'Ali', 'School fee'))).includes('Paid up to October 2026.'));

    // ---------- 5. change or stop: new amount, holiday months, stop ----------
    await fee(page, 'Ali', 'Van or bus').getByRole('button', { name: /^Change or stop/ }).click();
    const cp = fee(page, 'Ali', 'Van or bus').locator('.panel');
    await cp.locator('select').nth(0).selectOption('10'); await cp.locator('select').nth(1).selectOption('2026');
    await cp.locator('input[inputmode=decimal]').fill('4000');
    await cp.getByRole('button', { name: 'Save the new amount' }).click();
    ok('change: first month refused', (await text(cp)).includes('must start after the first month'));
    await cp.locator('select').nth(0).selectOption('11');
    await cp.getByRole('button', { name: 'Save the new amount' }).click();
    ok('change: saved', (await msg(page)).includes('Van or bus is 4,000 from November 2026'));
    ok('change: schedule shows the current amount', (await text(fee(page, 'Ali', 'Van or bus'))).includes('3,500 every month'));
    ok('change: next is 3,500 for October', (await text(fee(page, 'Ali', 'Van or bus'))).includes('Next: October 2026, 3,500'));
    await fee(page, 'Ali', 'Van or bus').getByRole('button', { name: /^Change or stop/ }).click();
    for (let m = 1; m <= 12; m++) await cp.locator('#g6-s' + m).check().catch(() => {});
    const vanId = (await saved(page)).children[0].fees[1].id;
    for (let m = 1; m <= 12; m++) await cp.locator('#g' + vanId + '-s' + m).check();
    await cp.getByRole('button', { name: 'Save these months' }).click();
    ok('skip: all 12 refused', (await text(cp)).includes('At least one month must have the fee'));
    for (let m = 1; m <= 12; m++) if (m !== 6 && m !== 7) await cp.locator('#g' + vanId + '-s' + m).uncheck();
    await cp.getByRole('button', { name: 'Save these months' }).click();
    ok('skip saved', (await msg(page)).includes('No Van or bus in June, July, every year.') && (await text(fee(page, 'Ali', 'Van or bus'))).includes('No fee in Jun, Jul.'));
    await fee(page, 'Ali', 'Van or bus').getByRole('button', { name: /^Change or stop/ }).click();
    await cp.locator('select').nth(2).selectOption('09'); await cp.locator('select').nth(3).selectOption('2026');
    await cp.getByRole('button', { name: 'Stop this fee' }).click();
    ok('stop: before start refused', (await text(cp)).includes('Pick October 2026 or later.'));
    await cp.locator('select').nth(2).selectOption('10');
    await cp.getByRole('button', { name: 'Stop this fee' }).click();
    ft = await text(fee(page, 'Ali', 'Van or bus'));
    ok('stopped: still owes October when due, no November', ft.includes('Stopped after October 2026.') && !ft.includes('November'), ft);
    await fee(page, 'Ali', 'Van or bus').getByRole('button', { name: /^Change or stop/ }).click();
    await cp.getByRole('button', { name: 'Start it again' }).click();
    ok('start again', !(await text(fee(page, 'Ali', 'Van or bus'))).includes('Stopped'));

    // ---------- 6. edit a fee in the form, delete with undo ----------
    await fee(page, 'Ali', 'Van or bus').getByRole('button', { name: /^Change or stop/ }).click();
    await cp.getByRole('button', { name: 'Edit the fee' }).click();
    ok('edit fee: form title', (await page.locator('#form-h').innerText()) === 'Edit Ali\'s Van or bus');
    ok('edit fee: child locked', await page.locator('#f-child').isDisabled());
    ok('edit fee: first amount label', (await page.locator('#l-amt').innerText()).startsWith('First amount'));
    await page.selectOption('#f-sm', '12'); await page.click('#save');
    ok('edit fee: start after a change refused', (await page.locator('#e-start').innerText()).includes('The fee changes in November 2026'));
    await page.selectOption('#f-sm', '10'); await page.fill('#f-fee', 'School van'); await page.click('#save');
    ok('edit fee: renamed', await fee(page, 'Ali', 'School van').count() === 1);
    await fee(page, 'Ali', 'School van').getByRole('button', { name: /^Change or stop/ }).click();
    await fee(page, 'Ali', 'School van').getByRole('button', { name: 'Edit the fee' }).click();
    await page.click('#del');
    ok('delete fee', await fee(page, 'Ali', 'School van').count() === 0);
    await page.locator('#list-msg .undo').click();
    ok('undo delete fee', await fee(page, 'Ali', 'School van').count() === 1);
    // edit child
    await child(page, 'Sara').getByRole('button', { name: 'Edit child: Sara' }).click();
    const cf = child(page, 'Sara').locator('form.panel');
    await cf.locator('input').first().fill(''); await cf.getByRole('button', { name: 'Save changes' }).click();
    ok('edit child: blank refused', (await text(cf)).includes('Type the child\'s name.'));
    await cf.locator('input').first().fill('Sara Khan'); await cf.getByRole('button', { name: 'Save changes' }).click();
    ok('edit child: renamed', await child(page, 'Sara Khan').count() === 1);
    await child(page, 'Sara Khan').getByRole('button', { name: 'Edit child: Sara Khan' }).click();
    await child(page, 'Sara Khan').getByRole('button', { name: 'Delete Sara Khan and all their fees' }).click();
    ok('delete child', await page.locator('#boxes > li.box').count() === 1);
    await page.locator('#list-msg .undo').click();
    ok('undo delete child', await page.locator('#boxes > li.box').count() === 2);

    // ---------- 7. receipt photo, reload, saved state ----------
    await fee(page, 'Ali', 'School fee').getByRole('button', { name: /^Record a payment/ }).click();
    await pf.locator('input[inputmode=decimal]').fill('8000');
    const chooser = page.waitForEvent('filechooser');
    await pf.getByRole('button', { name: '+ Add a photo of the receipt (optional)' }).click();
    await (await chooser).setFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector('#boxes .photo-pick img');
    ok('photo: amount kept after picking', await pf.locator('input[inputmode=decimal]').inputValue() === '8000');
    await pf.getByRole('button', { name: 'Save payment' }).click();
    await page.waitForFunction(() => document.querySelector('#list-msg').textContent.includes('Payment saved'));
    ok('photo: paid ahead of November', (await text(fee(page, 'Ali', 'School fee'))).includes('Paid up to November 2026.'));
    // a bad file
    await fee(page, 'Ali', 'School fee').getByRole('button', { name: /^Record a payment/ }).click();
    const ch2 = page.waitForEvent('filechooser');
    await pf.getByRole('button', { name: '+ Add a photo of the receipt (optional)' }).click();
    await (await ch2).setFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') });
    await page.waitForFunction(() => /could not be opened/.test(document.querySelector('#boxes form.panel').textContent));
    ok('photo: bad file message', true);
    await pf.getByRole('button', { name: 'Cancel' }).click();
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload: state kept', (await text(fee(page, 'Ali', 'School fee'))).includes('Paid up to November 2026.') && await child(page, 'Sara Khan').count() === 1);
    await fee(page, 'Ali', 'School fee').getByRole('button', { name: /^Payments/ }).click();
    await pl.getByRole('button', { name: /^Receipt photo/ }).click();
    await page.waitForSelector('#sheet img.sheet-photo');
    ok('photo opens after reload', await page.locator('#sheet img.sheet-photo').evaluate(i => i.complete && i.naturalWidth > 0));
    ok('photo sheet: only Close', !(await page.locator('#sheet-print').isVisible()) && await page.locator('#sheet-close').isVisible());
    await page.keyboard.press('Escape');
    ok('Escape closes the sheet', !(await page.locator('#sheet').evaluate(d => d.open)));

    // ---------- 8. backup with the photo, delete everything, restore ----------
    const dl = page.waitForEvent('download'); await page.click('#backup');
    const file = await (await dl).path(); const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('backup has state and photo', bk.state.children.length === 2 && Object.values(bk.photos).length === 1 && Object.values(bk.photos)[0].startsWith('data:image/jpeg;base64,'));
    await page.click('#wipe');
    ok('wipe: back to first use', await page.locator('#form').isVisible() && !(await page.locator('#list').isVisible()));
    await page.locator('#set-msg .undo').click();
    ok('wipe undo', await page.locator('#boxes > li.box').count() === 2);
    await page.click('#wipe');
    await page.evaluate(() => new Promise(r => { const q = indexedDB.open('school-fee-and-tuition-payment-tracker-for-parents.photos'); q.onsuccess = () => { const tx = q.result.transaction('photos', 'readwrite'); tx.objectStore('photos').clear(); tx.oncomplete = r; }; }));
    const ch3 = page.waitForEvent('filechooser'); await page.click('#restore');
    await (await ch3).setFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk)) });
    await page.waitForFunction(() => document.querySelector('#set-msg').textContent.includes('Backup restored'));
    ok('restore: children back', await page.locator('#boxes > li.box').count() === 2);
    await fee(page, 'Ali', 'School fee').getByRole('button', { name: /^Payments/ }).click();
    await pl.getByRole('button', { name: /^Receipt photo/ }).click();
    await page.waitForSelector('#sheet img.sheet-photo');
    ok('restore: photo back', await page.locator('#sheet img.sheet-photo').evaluate(i => i.complete && i.naturalWidth > 0));
    await page.click('#sheet-close');
    const ch4 = page.waitForEvent('filechooser'); await page.click('#restore');
    await (await ch4).setFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from('{"v":1,"children":[{"id":"x"}]}') });
    await page.waitForFunction(() => document.querySelector('#set-msg').textContent.includes('not a backup'));
    ok('restore: bad file refused', await page.locator('#boxes > li.box').count() === 2);
    await ctx.close();

    // ---------- 9. the README family: answers, statement, copy, email, currency ----------
    ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, FAMILY));
    const due = await text(page.locator('#due-body'));
    ok('family: 7,500 left in October', due.includes('Rs 7,500 left to pay in October'), due);
    ok('family: late', due.includes('Ali: School fee, Rs 4,000') && due.includes('October 2026, 11 days late'));
    ok('family: soon', due.includes('Ali: Van or bus, Rs 3,500') && due.includes('due Sun 25 Oct (in 4 days)'));
    ok('Ali year line', (await text(child(page, 'Ali').locator('.year'))) === '2026: Rs 57,500 in fees. Rs 27,000 paid, Rs 4,000 owed, Rs 26,500 still to come.', await text(child(page, 'Ali').locator('.year')));
    ok('Sara all paid', (await text(child(page, 'Sara').locator('.badge'))) === 'All paid');
    ok('Sara academy', (await text(fee(page, 'Sara', 'Academy'))).includes('Paid up to November 2026.') && (await text(fee(page, 'Sara', 'Academy'))).includes('Next: Dec 2026 to Feb 2027, Rs 6,000, due Tue 1 Dec.'));
    ok('annual: next year shown', (await text(fee(page, 'Sara', 'Annual charges'))).includes('due Sun 15 Aug 2027.'));
    await child(page, 'Ali').getByRole('button', { name: 'Statement: Ali' }).click();
    const sp = child(page, 'Ali').locator('.panel');
    ok('statement: table rows', await sp.locator('table').count() === 2 && (await text(sp.locator('table').first())).includes('Oct 8,000 4,000 4,000'), await text(sp.locator('table').first()));
    ok('statement: not due', (await text(sp.locator('table').first())).includes('Nov 8,000 0 not due'));
    await sp.getByRole('button', { name: 'Copy statement' }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('statement copied', clip.startsWith('Fee statement 2026: Ali, City School, Grade 4') && clip.includes('Fees for 2026: Rs 57,500'), clip.slice(0, 200));
    await sp.getByRole('button', { name: 'Print or save as PDF' }).click();
    ok('statement sheet open', await page.locator('#sheet').evaluate(d => d.open) && (await text(page.locator('#sheet-paper'))).includes('Payments made in 2026'));
    await page.click('#sheet-print'); ok('print called', await page.evaluate(() => window.__printed) === 1);
    await page.click('#sheet-copy'); await page.waitForFunction(() => document.getElementById('sheet-msg').textContent !== '').catch(() => {}); ok('sheet copy', (await page.locator('#sheet-msg').innerText()).includes('Copied'), await page.locator('#sheet-msg').innerText());
    await page.click('#sheet-close');
    ok('statement year 2025 empty', await sp.locator('select option').count() === 1);
    await page.click('#copy');
    const sum = await page.evaluate(() => navigator.clipboard.readText());
    ok('summary copied', sum.includes('Ali (City School, Grade 4)') && sum.includes('Owed now: Rs 4,000'), sum);
    const mail = await page.locator('#mail').getAttribute('href');
    ok('email: no recipient needed', mail.startsWith('mailto:?subject=School%20fees&body=') && decodeURIComponent(mail).includes('Owed now: Rs 4,000'));
    await page.selectOption('#s-cur', '$'); await page.selectOption('#s-style', 'intl');
    ok('currency switch', (await text(page.locator('#due-body'))).includes('$7,500 left'));
    await page.reload({ waitUntil: 'networkidle' });
    ok('currency remembered', (await page.locator('#s-cur').inputValue()) === '$' && (await text(page.locator('#due-body'))).includes('$7,500'));
    await page.selectOption('#s-cur', ''); ok('no currency', (await text(page.locator('#due-body'))).startsWith('7,500 left'));
    // theme switch
    const tbtn = page.locator('.theme-toggle');
    if (await tbtn.count()) { const b0 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor); await tbtn.click(); const b1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor); ok('theme switch changes the look', b0 !== b1); }
    else ok('theme switch exists', false);
    await ctx.close();

    // ---------- 10. damaged or blocked storage, long and pasted text ----------
    ({ ctx, page } = await newPage({}, '{"v":1,"children":[{bad'));
    ok('corrupt state: starts fresh with a message', await page.locator('#form').isVisible() && (await page.locator('#set-msg').innerText()).includes('could not be read'));
    await page.fill('#f-name', 'A'.repeat(80)); await page.fill('#f-fee', 'Tuition\twith\nnew lines ' + 'x'.repeat(60)); await page.fill('#f-amt', '1234.56');
    await page.click('#save');
    const st = await saved(page);
    ok('long text cut', st.children[0].name.length === 50 && st.children[0].fees[0].name.length === 50 && !/[\t\n]/.test(st.children[0].fees[0].name));
    ok('decimals kept', st.children[0].fees[0].amts[0].amt === 123456);
    ok('long name wraps, no scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await ctx.close();
    ({ ctx, page } = await newPage());
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
    await page.fill('#f-name', 'Ali'); await page.fill('#f-fee', 'Tuition'); await page.fill('#f-amt', '5000'); await page.click('#save');
    ok('blocked storage warns', await page.locator('#storage-warn').isVisible());
    await ctx.close();

    // ---------- 11. screen sizes, filled and cleared, with every panel open ----------
    for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        for (const scheme of ['dark', 'light']) {
            ({ ctx, page } = await newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme }, FAMILY));
            ok(w + scheme + ': no horizontal scroll (filled)', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            await fee(page, 'Ali', 'School fee').getByRole('button', { name: /^Record a payment/ }).click();
            await fee(page, 'Ali', 'School fee').getByRole('button', { name: '+ Add a note (optional)' }).click();
            await fee(page, 'Ali', 'Van or bus').getByRole('button', { name: /^Change or stop/ }).click();
            await fee(page, 'Sara', 'School fee').getByRole('button', { name: /^Payments/ }).click();
            await child(page, 'Sara').getByRole('button', { name: 'Statement: Sara' }).click();
            await child(page, 'Ali').getByRole('button', { name: 'Edit child: Ali' }).click();
            await page.click('#open-form'); await page.click('#o-school').catch(() => {}); await page.selectOption('#f-child', 'new'); await page.click('#o-school');
            ok(w + scheme + ': no horizontal scroll (panels open)', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.stmt'); }).slice(0, 3).map(e => e.tagName + '.' + e.className));
            ok(w + scheme + ': nothing sticks out', !out.length, out);
            if (w <= 390) {
                const lap = await page.evaluate(() => { const k = [...document.querySelectorAll('main input:not([type=checkbox]):not([type=file]), main select, main button, main a.secondary')].filter(e => e.offsetWidth > 0); const bad = []; for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((k[i].id || k[i].textContent) + ' / ' + (k[j].id || k[j].textContent)); } return bad.slice(0, 3); });
                ok(w + scheme + ': no overlapping controls', !lap.length, lap);
                const cut = await page.evaluate(() => [...document.querySelectorAll('main input[placeholder]')].filter(e => e.offsetWidth > 0).filter(e => { const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }).map(e => e.id + ':' + e.placeholder));
                ok(w + scheme + ': placeholders fit', !cut.length, cut);
                const clip = await page.evaluate(() => [...document.querySelectorAll('main .mini, main .primary, main .secondary, main .chip, main .link')].filter(e => e.offsetWidth > 0 && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
                ok(w + scheme + ': no clipped button text', !clip.length, clip);
                const sel = await page.evaluate(() => [...document.querySelectorAll('main select')].filter(e => e.offsetWidth > 0).filter(e => { const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.options[e.selectedIndex].text).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 22; }).map(e => e.id + ':' + e.options[e.selectedIndex].text));
                ok(w + scheme + ': selected choices fit', !sel.length, sel);
            }
            if (w >= 900) {
                for (const pos of [0, 0.5, 1]) {
                    await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                    const o = await page.evaluate(() => { const k = [...document.querySelector('main').children].filter(c => c.offsetHeight > 4), bad = []; for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } return bad; });
                    ok(w + scheme + ': no overlap at scroll ' + pos, !o.length, o);
                }
                const two = await page.evaluate(() => { const a = document.querySelector('.col-main').getBoundingClientRect(), b = document.querySelector('.col-side').getBoundingClientRect(); return b.left >= a.right - 1 && Math.abs(a.top - b.top) < 4; });
                ok(w + scheme + ': two columns on desktop', two);
            }
            // the statement sheet fits
            await child(page, 'Sara').locator('.panel').getByRole('button', { name: 'Print or save as PDF' }).click();
            const r = await page.locator('#sheet').boundingBox();
            ok(w + scheme + ': statement sheet on screen', r && r.x >= 0 && r.x + r.width <= w + 1, r);
            ok(w + scheme + ': statement no inner overflow', await page.evaluate(() => { const s = document.getElementById('sheet'); return s.scrollWidth <= s.clientWidth + 1; }));
            await page.click('#sheet-close');
            // cleared state
            await page.click('#wipe');
            ok(w + scheme + ': no horizontal scroll (cleared)', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            await ctx.close();
        }
    }

    // ---------- 12. screenshots ----------
    if (SHOTS) {
        ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, FAMILY));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), fullPage: false });
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, FAMILY));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), fullPage: false });
        await ctx.close();
    }

    ['style.css', 'core.js', 'script.js'].forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith('/' + SLUG + '/' + f))));
    ({ ctx, page } = await newPage());
    for (const f of ['manifest.webmanifest', 'favicon.svg', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js'])
        ok('file returns 200: ' + f, await page.evaluate(u => fetch(u, { cache: 'no-store' }).then(r => r.status), f) === 200);
    const man = await page.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()));
    ok('manifest icons', man.icons.length === 2 && man.theme_color === '#e67700');
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const card = page.locator('a[href*="' + SLUG + '"]').first();
    ok('hub lists the app', await card.count() === 1);
    if (await card.count()) { await card.click(); await page.waitForLoadState('networkidle'); ok('hub card opens the app', page.url().includes(SLUG)); }
    await ctx.close();
    ok('help.js and theme.js requested', [...requested].some(u => u.endsWith('/help.js')) && [...requested].some(u => u.endsWith('/theme.js')));
    ok('no console errors', !errors.length, errors);
    ok('no failed requests', !failed.length, failed);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
