// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Wed 21 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'rent-payment-log-and-receipts-for-landlords-and-tenants', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-21T16:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// Bilal's three rooms from the README
const P = (id, n, d, amt, method) => ({ id, n, d, amt: amt * 100, method: method || 'cash', note: '' });
const HOUSE = { v: 1, cur: 'Rs', style: 'intl', nextId: 30, tenancies: [
    { id: 1, place: 'Flat 2, 14 Garden Road', tenant: 'Ahmed Khan', landlord: 'Bilal Ahmed', rents: [{ from: '2026-06', amt: 3000000 }, { from: '2026-10', amt: 3200000 }], due: 5, start: '2026-06-17', firstByDays: true, end: '',
        deposit: { amt: 6000000, back: null, backDate: '' }, payments: [P(2, 1, '2026-06-17', 14000), P(3, 2, '2026-07-04', 30000, 'bank'), P(4, 3, '2026-08-06', 30000), P(5, 4, '2026-09-10', 20000), P(6, 5, '2026-09-25', 10000), P(7, 6, '2026-10-08', 17000, 'bank')], nextN: 7 },
    { id: 8, place: 'Room 1, top floor', tenant: 'Sara Malik', landlord: 'Bilal Ahmed', rents: [{ from: '2026-03', amt: 1800000 }], due: 1, start: '2026-03-01', firstByDays: false, end: '', deposit: null,
        payments: [3, 4, 5, 6, 7, 8, 9, 10].map((m, i) => P(10 + i, i + 1, '2026-' + String(m).padStart(2, '0') + '-0' + (1 + (i % 3)), 18000, 'wallet')).concat([P(18, 9, '2026-10-15', 18000, 'wallet')]), nextN: 10 },
    { id: 9, place: 'Shop 3, Main Bazaar', tenant: 'Usman Traders', landlord: 'Bilal Ahmed', rents: [{ from: '2025-11', amt: 4500000 }], due: 10, start: '2025-11-10', firstByDays: false, end: '', deposit: null,
        payments: [P(20, 1, '2025-11-10', 45000, 'cheque'), P(21, 2, '2026-01-12', 90000, 'cheque'), P(22, 3, '2026-04-10', 135000, 'cheque'), P(23, 4, '2026-07-15', 90000, 'cheque')], nextN: 5 }] };

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
        await page.clock.setFixedTime(NOW);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error' && page.url().includes(SLUG)) errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
    const vis = (page, sel) => page.isVisible(sel);
    const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    const box = (page, place) => page.locator('#app li.box', { has: page.locator('h3', { hasText: place }) });
    const boxText = async (page, place, sel) => (await box(page, place).locator(sel).allTextContents()).map(s => s.replace(/\s+/g, ' ').trim());
    async function pay(page, place, d, amount, method) {
        const b = box(page, place);
        if (!(await b.locator('form.panel').count())) await b.locator('.rec').click();
        const b2 = box(page, place);
        await b2.locator('input[type=date]').fill(d);
        await b2.locator('.panel .money input').fill(String(amount));
        if (method) await b2.locator('.panel select').selectOption(method);
        await b2.locator('.panel button[type=submit]').click();
    }

    // ---------- 1. first use ----------
    let { ctx, page } = await newPage();
    ok('first use: form first, lists hidden', await vis(page, '#form') && !(await vis(page, '#month')) && !(await vis(page, '#list')) && await page.$eval('#app', e => e.classList.contains('setup')));
    ok('first use: optional fields hidden', !(await vis(page, '#f-landlord')) && !(await vis(page, '#f-deposit')) && await vis(page, '#o-landlord') && await vis(page, '#o-deposit'));
    ok('first use: no cancel', !(await vis(page, '#cancel')));
    ok('first use: moved in today', await page.inputValue('#f-start') === '2026-10-21');
    ok('due day choices', (await page.$$eval('#f-due option', l => l.map(o => o.textContent))).slice(0, 1).concat((await page.$$eval('#f-due option', l => l.map(o => o.textContent))).slice(30)).join('|') === '1st of the month|31st (or last day)');

    // ---------- 2. form errors ----------
    await page.click('#save');
    ok('blank place', (await txt(page, '#e-place')) === 'Type the flat, house or room, such as "Flat 2, 14 Garden Road".');
    ok('blank tenant', (await txt(page, '#e-tenant')) === "Type the tenant's name.");
    ok('blank rent', (await txt(page, '#e-rent')) === 'Type the monthly rent, such as 30000.');
    ok('focus on the first error', await page.evaluate(() => document.activeElement.id) === 'f-place');
    for (const bad of ['abc', '-5', '12.345']) { await page.fill('#f-rent', bad); await page.click('#save'); ok('bad rent "' + bad + '"', (await txt(page, '#e-rent')) === 'Type the rent as a number, such as 30000 or 30000.50.', await txt(page, '#e-rent')); }
    await page.fill('#f-rent', '0'); await page.click('#save'); ok('zero rent', (await txt(page, '#e-rent')) === 'Type the monthly rent, such as 30000.');
    ok('nothing saved', (await saved(page)).tenancies.length === 0);

    // ---------- 3. the real situation ----------
    await page.fill('#f-place', '  Flat 2, 14 Garden Road ');
    await page.fill('#f-tenant', 'Ahmed Khan');
    await page.click('#o-landlord'); await page.fill('#f-landlord', 'Bilal Ahmed');
    await page.fill('#f-rent', '30,000'); await page.selectOption('#f-due', '5');
    await page.fill('#f-start', '2026-06-17'); await page.dispatchEvent('#f-start', 'change');
    ok('days lived option shows 14 of 30', (await txt(page, '#l-bydays')) === 'Charge the first month only for the days lived (14 of 30 days)');
    ok('preview full first month', (await txt(page, '#preview')) === 'First rent: June 2026, 30,000, due on 17 Jun 2026. Then 30,000 due on the 5th of each month.', await txt(page, '#preview'));
    await page.check('#f-bydays');
    ok('preview by days', (await txt(page, '#preview')) === 'First rent: June 2026, 14,000 (14 days), due on 17 Jun 2026. Then 30,000 due on the 5th of each month.', await txt(page, '#preview'));
    await page.click('#o-deposit'); await page.fill('#f-deposit', '60000');
    await page.click('#save');
    ok('added', (await txt(page, '#list-msg')).startsWith('Added Flat 2, 14 Garden Road.'));
    ok('form folds away', !(await vis(page, '#form')) && await vis(page, '#open-form'));
    ok('nothing paid: owes 134,000 since June, 126 days late', (await boxText(page, 'Flat 2', '.line.bad'))[0] === 'Owes 134,000 since June 2026, 126 days late.', await boxText(page, 'Flat 2', '.line.bad'));
    ok('box sub line', (await boxText(page, 'Flat 2', '.box-sub'))[0] === 'Tenant: Ahmed Khan. Landlord: Bilal Ahmed. Rent 30,000 due on the 5th, since 17 Jun 2026.');
    ok('deposit held', (await boxText(page, 'Flat 2', '.sub-line')).includes('Deposit 60,000 held.'));
    // the rent goes up in October
    await box(page, 'Flat 2').getByRole('button', { name: /^Change the rent/ }).click();
    await box(page, 'Flat 2').locator('.panel select').first().selectOption('06');
    await box(page, 'Flat 2').locator('.panel .money input').fill('32000');
    await box(page, 'Flat 2').locator('.panel button[type=submit]').click();
    ok('rent change in the first month refused', (await boxText(page, 'Flat 2', '.panel .err'))[0] === 'The new rent must start after the first month (June 2026). To fix the first rent, use Edit.');
    await box(page, 'Flat 2').locator('.panel select').first().selectOption('10');
    await box(page, 'Flat 2').locator('.panel button[type=submit]').click();
    ok('rent changed', (await txt(page, '#list-msg')).startsWith('Rent for Flat 2, 14 Garden Road is 32,000 from October 2026.'));
    ok('owes 136,000 now', (await boxText(page, 'Flat 2', '.badge'))[0] === 'Owes 136,000');
    // payment errors
    await box(page, 'Flat 2').locator('.rec').click();
    ok('payment form defaults to today, cash', await box(page, 'Flat 2').locator('.panel input[type=date]').inputValue() === '2026-10-21' && await box(page, 'Flat 2').locator('.panel select').inputValue() === 'cash');
    ok('note hidden behind a button', await box(page, 'Flat 2').getByRole('button', { name: '+ Add a note (optional)' }).isVisible());
    await box(page, 'Flat 2').locator('.panel button[type=submit]').click();
    ok('blank amount', (await boxText(page, 'Flat 2', '.panel .err'))[1] === 'Type the amount paid, such as 30000.', await boxText(page, 'Flat 2', '.panel .err'));
    await pay(page, 'Flat 2', '2026-10-22', 'abc');
    const errs = await boxText(page, 'Flat 2', '.panel .err');
    ok('future date and text amount', errs[0] === 'That day has not come yet.' && errs[1] === 'Type the amount as a number, such as 30000 or 30000.50.', errs);
    ok('no payment saved', (await saved(page)).tenancies[0].payments.length === 0);
    // the six payments
    for (const [d, a, m] of [['2026-06-17', 14000], ['2026-07-04', 30000, 'bank'], ['2026-08-06', 30000], ['2026-09-10', 20000], ['2026-09-25', 10000], ['2026-10-08', 17000, 'bank']]) await pay(page, 'Flat 2', d, a, m);
    ok('payment message', (await txt(page, '#list-msg')).startsWith('Payment saved: 17,000 Thu 8 Oct. Still owes 15,000.'), await txt(page, '#list-msg'));
    ok('THE ANSWER: owes 15,000 for October, 16 days late', (await boxText(page, 'Flat 2', '.line.bad'))[0] === 'Owes 15,000 for October 2026, 16 days late.', await boxText(page, 'Flat 2', '.line.bad'));
    ok('paid up to September', (await boxText(page, 'Flat 2', '.line'))[1] === 'Paid up to September 2026.', await boxText(page, 'Flat 2', '.line'));
    ok('next rent', (await boxText(page, 'Flat 2', '.sub-line'))[0] === 'Next: November 2026 rent 32,000 due on Thu 5 Nov.', await boxText(page, 'Flat 2', '.sub-line'));
    ok('this month card', (await txt(page, '#month-h')) === 'October 2026' && (await txt(page, '#month-body .big')) === '17,000 of 32,000 rent for this month paid', await txt(page, '#month-body .big'));
    ok('who owes', (await txt(page, '#month-body .owing li')) === 'Ahmed Khan owes 15,000Flat 2, 14 Garden Road, since October 2026, 16 days late', await txt(page, '#month-body .owing li'));
    ok('receipt numbers 1 to 6', (await saved(page)).tenancies[0].payments.map(p => p.n).join() === '1,2,3,4,5,6');
    // fill in what is owed, then undo
    await box(page, 'Flat 2').locator('.rec').click();
    await box(page, 'Flat 2').getByRole('button', { name: 'Fill in what is owed: 15,000' }).click();
    ok('owed filled in', await box(page, 'Flat 2').locator('.panel .money input').inputValue() === '15000');
    await box(page, 'Flat 2').locator('.panel button[type=submit]').click();
    ok('paid up to October', (await boxText(page, 'Flat 2', '.line'))[0] === 'Paid up to October 2026.' && (await txt(page, '#month-body .state')) === 'Nobody owes rent today.');
    await page.click('#list-msg .undo');
    ok('payment undone', (await saved(page)).tenancies[0].payments.length === 6 && (await boxText(page, 'Flat 2', '.badge'))[0] === 'Owes 15,000');

    // ---------- 4. receipts ----------
    await box(page, 'Flat 2').getByRole('button', { name: /^Payments and receipts/ }).click();
    const items = await boxText(page, 'Flat 2', '.pays li .pay-text');
    ok('newest payment first with what it paid for', items[0] === '8 Oct 2026: 17,000Receipt 6, bank transfer. For part of the rent for October 2026 (17,000 of 32,000).', items[0]);
    // the method is remembered from the last payment, so payments 3 to 5 were by bank transfer too
    ok('rest of September', items[1] === '25 Sep 2026: 10,000Receipt 5, bank transfer. For the rest of the rent for September 2026 (10,000 of 30,000).', items[1]);
    await box(page, 'Flat 2').getByRole('button', { name: 'Receipt 6' }).click();
    ok('receipt dialog open', await page.$eval('#sheet', d => d.open));
    const rc = await txt(page, '#sheet-paper');
    ok('receipt says it all', ['Rent receipt', 'No. 6', 'Date: 8 Oct 2026', '17,000', 'Seventeen thousand only', 'Received fromAhmed Khan', 'Forpart of the rent for October 2026 (17,000 of 32,000)', 'PropertyFlat 2, 14 Garden Road', 'Paid bybank transfer', 'Rent still owed15,000', 'Received byBilal Ahmed'].every(s => rc.includes(s)), rc);
    await page.click('#sheet-copy');
    ok('receipt text copied', (await page.evaluate(() => navigator.clipboard.readText())).startsWith('RENT RECEIPT No. 6\nDate: 8 Oct 2026\n\nReceived from Ahmed Khan the sum of 17,000 (Seventeen thousand only) by bank transfer,'));
    await page.click('#sheet-print');
    ok('print called', await page.evaluate(() => window.__printed) === 1);
    await page.keyboard.press('Escape');
    ok('receipt closes with Escape', !(await page.$eval('#sheet', d => d.open)));
    // edit and delete a payment
    await box(page, 'Flat 2').getByRole('button', { name: 'Edit payment of 8 Oct 2026' }).click();
    ok('edit form filled', await box(page, 'Flat 2').locator('.panel .money input').inputValue() === '17000' && await box(page, 'Flat 2').locator('.panel select').inputValue() === 'bank');
    await box(page, 'Flat 2').locator('.panel .money input').fill('18000'); await box(page, 'Flat 2').locator('.panel button[type=submit]').click();
    ok('edited', (await boxText(page, 'Flat 2', '.badge'))[0] === 'Owes 14,000' && (await saved(page)).tenancies[0].payments.length === 6);
    await page.click('#list-msg .undo');
    await box(page, 'Flat 2').getByRole('button', { name: /^Payments and receipts/ }).click();
    await box(page, 'Flat 2').getByRole('button', { name: 'Delete payment of 8 Oct 2026' }).click();
    ok('deleted', (await boxText(page, 'Flat 2', '.badge'))[0] === 'Owes 32,000');
    await page.click('#list-msg .undo');
    ok('delete undone', (await boxText(page, 'Flat 2', '.badge'))[0] === 'Owes 15,000');

    // ---------- 5. statement ----------
    await box(page, 'Flat 2').getByRole('button', { name: /^Statement/ }).click();
    const cells = sel => box(page, 'Flat 2').locator(sel).evaluateAll(l => l.map(tr => [...tr.children].map(c => c.textContent.trim()).join('|')));
    const rows = await cells('.stmt tbody tr');
    ok('statement months', rows.length === 5 && rows[0] === 'Jun|14,000|14,000|0' && rows[4] === 'Oct|32,000|17,000|15,000', rows);
    ok('statement totals', (await cells('.stmt tfoot tr'))[0] === 'Total|136,000|121,000|15,000', await cells('.stmt tfoot tr'));
    await box(page, 'Flat 2').getByRole('button', { name: 'Copy statement' }).click();
    ok('statement copied', (await page.evaluate(() => navigator.clipboard.readText())).includes('October 2026: rent 32,000, paid 17,000, owed 15,000'));
    await box(page, 'Flat 2').getByRole('button', { name: 'Print or save as PDF' }).click();
    ok('statement sheet', (await txt(page, '#sheet-h')) === 'Rent statement 2026' && await page.locator('#sheet .stmt-pays li').count() === 6);
    await page.click('#sheet-close');

    // ---------- 6. currency and lakh ----------
    await page.selectOption('#s-cur', 'Rs'); await page.selectOption('#s-style', 'sa');
    ok('currency shown', (await boxText(page, 'Flat 2', '.badge'))[0] === 'Owes Rs 15,000');
    ok('lakh total', (await cells('.stmt tfoot tr'))[0] === 'Total|1,36,000|1,21,000|15,000' && (await cells('.stmt thead tr'))[0] === 'Month|Rent (Rs)|Paid (Rs)|Owed (Rs)', await cells('.stmt thead tr'));
    await page.reload({ waitUntil: 'networkidle' });
    ok('currency remembered after reload', await page.inputValue('#s-cur') === 'Rs' && await page.inputValue('#s-style') === 'sa' && (await boxText(page, 'Flat 2', '.badge'))[0] === 'Owes Rs 15,000');
    await page.selectOption('#s-cur', ''); await page.selectOption('#s-style', 'intl');

    // ---------- 7. paying ahead ----------
    await pay(page, 'Flat 2', '2026-10-21', '47000');
    ok('paid ahead', (await boxText(page, 'Flat 2', '.line'))[0] === 'Paid up to November 2026.' && (await boxText(page, 'Flat 2', '.line.good'))[0] === '32,000 paid ahead.', await boxText(page, 'Flat 2', '.line'));
    ok('next is December', (await boxText(page, 'Flat 2', '.sub-line'))[0] === 'Next: December 2026 rent 32,000 due on Sat 5 Dec.', await boxText(page, 'Flat 2', '.sub-line'));
    await page.click('#list-msg .undo');

    // ---------- 8. a second tenancy who moved out ----------
    await page.click('#open-form');
    ok('form opens with cancel', await vis(page, '#form') && await vis(page, '#cancel'));
    await page.fill('#f-place', 'Room 1'); await page.fill('#f-tenant', 'Sara Malik'); await page.fill('#f-rent', '20000');
    await page.fill('#f-start', '2026-01-01'); await page.dispatchEvent('#f-start', 'change');
    ok('days lived hidden for the 1st', !(await vis(page, '#f-bydays')));
    await page.click('#save');
    await pay(page, 'Room 1', '2026-01-01', '200000', 'wallet');
    ok('paid ahead until October', (await boxText(page, 'Room 1', '.line'))[0] === 'Paid up to October 2026.');
    await box(page, 'Room 1').getByRole('button', { name: /^Moved out/ }).click();
    await box(page, 'Room 1').locator('.panel input[type=date]').fill('2025-12-01'); await box(page, 'Room 1').locator('.panel button[type=submit]').click();
    ok('move-out before move-in refused', (await boxText(page, 'Room 1', '.panel .err'))[0] === 'Pick the last day, on or after the move-in day (1 Jan 2026).');
    await box(page, 'Room 1').locator('.panel input[type=date]').fill('2026-08-10'); await box(page, 'Room 1').locator('.panel button[type=submit]').click();
    ok('moved out message', (await txt(page, '#list-msg')).startsWith('Sara Malik moved out on 10 Aug 2026.'));
    ok('moved out list', await vis(page, '#ended-btn') && (await txt(page, '#ended-btn')) === 'Hide moved out (1)');
    ok('paid too much', (await boxText(page, 'Room 1', '.sub-line')).includes('Moved out on 10 Aug 2026. Paid 40,000 more than the rent.'), await boxText(page, 'Room 1', '.sub-line'));
    await page.click('#ended-btn');
    ok('moved out folded away', (await txt(page, '#ended-btn')) === 'Show moved out (1)' && await box(page, 'Room 1').count() === 0);
    ok('month card ignores a moved-out tenancy', (await txt(page, '#month-body .big')) === '17,000 of 32,000 rent for this month paid');

    // ---------- 9. edit and delete a tenancy ----------
    await box(page, 'Flat 2').getByRole('button', { name: 'Edit Flat 2, 14 Garden Road' }).click();
    ok('edit form', (await txt(page, '#form-h')) === 'Edit Flat 2, 14 Garden Road' && await page.inputValue('#f-tenant') === 'Ahmed Khan' && await page.inputValue('#f-rent') === '30000' && await vis(page, '#del'));
    ok('edit label says first rent', (await txt(page, '#l-rent')) === 'First monthly rent (from June 2026)');
    await page.fill('#f-tenant', ''); await page.click('#save');
    ok('edit error', (await txt(page, '#e-tenant')) === "Type the tenant's name.");
    await page.fill('#f-tenant', 'Ahmed Raza Khan'); await page.click('#save');
    ok('edit saved', (await boxText(page, 'Flat 2', '.box-sub'))[0].startsWith('Tenant: Ahmed Raza Khan.'));
    await box(page, 'Flat 2').getByRole('button', { name: 'Edit Flat 2, 14 Garden Road' }).click();
    await page.click('#del');
    ok('tenancy deleted', await box(page, 'Flat 2').count() === 0);
    await page.click('#list-msg .undo');
    ok('tenancy delete undone', await box(page, 'Flat 2').count() === 1);

    // ---------- 10. share, backup, delete everything ----------
    ok('mail link', decodeURIComponent(await page.getAttribute('#mail', 'href')).startsWith('mailto:?subject=Rent summary&body=Rent summary, 21 Oct 2026\n\nFlat 2, 14 Garden Road (Ahmed Raza Khan)\nPaid up to September 2026\nOwed: 15,000 since October 2026'), decodeURIComponent(await page.getAttribute('#mail', 'href')));
    await page.click('#copy');
    ok('summary copied', (await page.evaluate(() => navigator.clipboard.readText())).includes('Room 1 (Sara Malik), moved out'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backup = fs.readFileSync(await dl.path(), 'utf8');
    ok('backup file', dl.suggestedFilename() === 'rent-log-backup-2026-10-21.json' && JSON.parse(backup).tenancies.length === 2);
    await page.click('#wipe');
    ok('delete everything shows the form', await vis(page, '#form') && !(await vis(page, '#list')));
    await page.click('#set-msg .undo');
    ok('delete everything undone', await box(page, 'Flat 2').count() === 1);
    await page.setInputFiles('#restore-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"v":1,"tenancies":[{"id":1}]}') });
    ok('bad backup refused', (await txt(page, '#set-msg')) === 'That file is not a backup from this app, so nothing was changed.');
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    ok('backup restored', (await txt(page, '#set-msg')).startsWith('Backup restored.') && (await boxText(page, 'Flat 2', '.badge'))[0] === 'Owes 15,000');
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'system');
    await page.click('.theme-toggle');
    ok('theme switch', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== before);
    await ctx.close();

    // ---------- 11. a tenant's own record and the house ----------
    ({ ctx, page } = await newPage({}, HOUSE));
    ok('house: month card', (await txt(page, '#month-body .big')) === 'Rs 35,000 of Rs 95,000 rent for this month paid', await txt(page, '#month-body .big'));
    ok('house: Sara paid ahead to November', (await boxText(page, 'Room 1', '.line'))[0] === 'Paid up to November 2026.');
    // Usman: 45,000 a month from 10 Nov 2025, 12 months due by 10 Oct = 540,000; paid 360,000 -> 180,000 owed since July
    ok('house: shop owes 4 months', (await boxText(page, 'Shop 3', '.line.bad'))[0] === 'Owes Rs 180,000 since July 2026, 103 days late.', await boxText(page, 'Shop 3', '.line.bad'));
    await ctx.close();

    // ---------- 12. corrupt saved state ----------
    ({ ctx, page } = await newPage({}, '{broken'));
    ok('corrupt state starts fresh', (await txt(page, '#set-msg')).startsWith('The saved records could not be read') && await vis(page, '#form'));
    await ctx.close();
    ({ ctx, page } = await newPage({}, JSON.stringify({ v: 1, tenancies: [{ id: 1, place: 'x' }] })));
    ok('invalid state starts fresh', await vis(page, '#form') && !(await vis(page, '#list')));
    await ctx.close();

    // ---------- 13. layout at every width, dark and light ----------
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) {
        for (const seed of [HOUSE, undefined]) {
            ({ ctx, page } = await newPage({ colorScheme: scheme, viewport: { width: 1280, height: 900 } }, seed));
            if (seed) { await box(page, 'Flat 2').getByRole('button', { name: /^Statement/ }).click(); await box(page, 'Room 1').getByRole('button', { name: /^Payments and receipts/ }).click(); await box(page, 'Shop 3').locator('.rec').click(); }
            for (const w of WIDTHS) {
                await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
                const tag = scheme + (seed ? ' filled ' : ' empty ') + w + ': ';
                ok(tag + 'no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.id || e.className || e.tagName).slice(0, 5));
                ok(tag + 'nothing sticks out', !out.length, out);
                for (const pos of [0, 0.5, 1]) {
                    await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                    const o = await page.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => c.getBoundingClientRect().height > 4 && getComputedStyle(c).display !== 'none'); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
                    ok(tag + 'no overlap at ' + pos, !o.length, o);
                }
                if (w >= 900 && seed) ok(tag + 'two columns', await page.evaluate(() => document.querySelector('.col-side').getBoundingClientRect().left > document.querySelector('.col-main').getBoundingClientRect().right - 1));
            }
            await ctx.close();
        }
    }
    // phones with every optional part and panel open: nothing overlaps, placeholders and button text fit
    for (const w of [320, 360, 390]) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 844 } }, HOUSE));
        await box(page, 'Flat 2').locator('.rec').click(); await box(page, 'Flat 2').getByRole('button', { name: '+ Add a note (optional)' }).click();
        await box(page, 'Room 1').getByRole('button', { name: /^Statement/ }).click();
        await box(page, 'Shop 3').getByRole('button', { name: /^Change the rent/ }).click();
        await page.click('#open-form'); await page.click('#o-landlord'); await page.click('#o-deposit');
        const sets = [['panels', null], ['payments', async () => { await box(page, 'Room 1').getByRole('button', { name: /^Payments and receipts/ }).click(); await box(page, 'Shop 3').getByRole('button', { name: /^Moved out/ }).click(); }]];
        for (const [name, fn] of sets) {
            if (fn) await fn();
            const c = await page.evaluate(() => { const k = [...document.querySelectorAll('main input:not([type=hidden]):not([type=file]), main select, main button, main textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const bad = [];
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((k[i].id || k[i].className || k[i].textContent) + ' / ' + (k[j].id || k[j].className || k[j].textContent)); }
                return bad; });
            ok(w + ' ' + name + ': no controls overlap', !c.length, c);
            ok(w + ' ' + name + ': no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            const cut = await page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(e => e.offsetWidth > 0).filter(e => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.id + ':' + e.placeholder));
            ok(w + ' ' + name + ': placeholders fit', !cut.length, cut);
            const clip = await page.evaluate(() => [...document.querySelectorAll('.mini, .primary, .secondary, .chip, .link')].filter(e => e.offsetWidth > 0 && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
            ok(w + ' ' + name + ': no clipped button text', !clip.length, clip);
            const sel = await page.evaluate(() => [...document.querySelectorAll('main select')].filter(e => e.offsetWidth > 0).filter(e => { const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.options[e.selectedIndex].text).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 22; }).map(e => e.id + ':' + e.options[e.selectedIndex].text));
            ok(w + ' ' + name + ': selected choices fit', !sel.length, sel);
        }
        // the receipt fits a phone
        await box(page, 'Room 1').getByRole('button', { name: 'Receipt 9' }).click();
        const r = await page.locator('#sheet').boundingBox();
        ok(w + ': receipt on screen', r && r.x >= 0 && r.x + r.width <= w + 1, r);
        ok(w + ': receipt no inner overflow', await page.evaluate(() => { const s = document.getElementById('sheet'); return s.scrollWidth <= s.clientWidth + 1; }));
        await page.click('#sheet-close');
        await ctx.close();
    }

    // ---------- 14. screenshots ----------
    if (SHOTS) {
        ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, HOUSE));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), fullPage: false });
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, HOUSE));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), fullPage: false });
        await ctx.close();
    }

    ['style.css', 'core.js', 'script.js'].forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith('/' + SLUG + '/' + f))));
    ({ ctx, page } = await newPage());
    for (const f of ['manifest.webmanifest', 'favicon.svg', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js'])
        ok('file returns 200: ' + f, await page.evaluate(u => fetch(u, { cache: 'no-store' }).then(r => r.status), f) === 200);
    const man = await page.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()));
    ok('manifest icons', man.icons.length === 2 && man.theme_color === '#1864ab');
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
