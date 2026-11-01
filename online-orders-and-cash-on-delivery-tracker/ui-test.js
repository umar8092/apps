// Full page test with Playwright. Run: node ui-test.js     BASE=https://umar8092.github.io/apps node ui-test.js  tests the live site.
// "Today" is fixed to Mon 16 Nov 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { STATE } = require('./shots.js');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'online-orders-and-cash-on-delivery-tracker', KEY = SLUG + '.state';
const NOW = new Date('2026-11-16T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); };
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
    async function newPage(opts, seed) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark', locale: 'en-GB' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        if (seed !== undefined) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, typeof seed === 'string' ? seed : JSON.stringify(seed)]);
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.$eval(sel, e => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
    const vis = (page, sel) => page.isVisible(sel);
    const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    const box = (page, n) => page.locator('article.box', { has: page.locator('.box-sub', { hasText: new RegExp('^#' + n + ' ') }) });
    const boxBtn = (page, n, label) => box(page, n).locator('.box-btns button', { hasText: new RegExp('^' + label + '$') });
    const clip = page => page.evaluate(() => navigator.clipboard.readText());
    const tabTo = (page, t) => page.click('label[for=t-' + t + ']');

    // ---------- 1. first use and the empty state ----------
    let { ctx, page } = await newPage();
    ok('first use: setup layout, form only', await page.$eval('#app', e => e.classList.contains('setup')) && await vis(page, '#form') && !(await vis(page, '#sum')) && !(await vis(page, '#list')) && !(await vis(page, '#jump-add')));
    ok('first use: optional fields hidden', !(await vis(page, '#f-ordered')) && !(await vis(page, '#f-track')) && !(await vis(page, '#f-ret')) && !(await vis(page, '#f-cur')) && !(await vis(page, '#f-note')) && !(await vis(page, '#f-exp-date')));
    ok('first use: cash on delivery, not sure when', await page.isChecked('#p-cod') && await page.inputValue('#f-exp') === '' && (await txt(page, '#l-price')) === 'Amount to pay the rider');
    ok('expected options show the dates', (await page.$$eval('#f-exp option', l => l.map(o => o.textContent))).slice(0, 3).join('|') === 'Not sure yet|Today (Mon 16 Nov)|Tomorrow (Tue 17 Nov)');
    await page.click('label[for=p-online]');
    ok('paid online relabels the amount', (await txt(page, '#l-price')) === 'Amount you paid');
    await page.click('label[for=p-cod]');
    // ---------- 2. validation ----------
    await page.click('#save');
    ok('blank: two errors', (await txt(page, '#e-what')) === 'Type what you ordered.' && (await txt(page, '#e-price')) === 'Type the amount (0 if it is free).');
    ok('blank: shop is not forced', (await page.$$('#f-shop[aria-invalid="true"]')).length === 0);
    ok('blank: nothing saved', (await page.evaluate(k => localStorage.getItem(k), KEY)) === null);
    for (const bad of ['abc', '-50', '12.345', '99999999999']) { await page.fill('#f-price', bad); await page.click('#save'); ok('price refused: ' + bad, (await txt(page, '#e-price') || '').startsWith('Type a number')); }
    await page.fill('#f-what', 'Phone case');
    await page.fill('#f-price', '1250');
    await page.selectOption('#f-exp', 'date'); await page.fill('#f-exp-date', ''); await page.click('#save');
    ok('pick a date left blank refused', (await txt(page, '#e-exp')).startsWith('Pick the day it should arrive'));
    await page.click('#o-ordered'); await page.fill('#f-ordered', '2026-11-20'); await page.fill('#f-exp-date', '2026-11-21'); await page.click('#save');
    ok('future order date refused', (await txt(page, '#e-ordered')) === 'The order date cannot be after today.');
    await page.fill('#f-ordered', '2026-11-10'); await page.fill('#f-exp-date', '2026-11-08'); await page.click('#save');
    ok('arrives before order date refused', (await txt(page, '#e-exp')) === 'It cannot arrive before the order date (Tue 10 Nov).');
    await page.click('#o-ret'); await page.selectOption('#f-ret', 'other'); await page.fill('#f-ret-days', '400'); await page.fill('#f-exp-date', '2026-11-19'); await page.click('#save');
    ok('return days 400 refused', (await txt(page, '#e-ret')) === 'Type a number of days from 1 to 365.');
    await page.fill('#f-ret-days', '0'); await page.click('#save');
    ok('return days 0 refused', (await txt(page, '#e-ret')) === 'Type a number of days from 1 to 365.');
    ok('still nothing saved', (await page.evaluate(k => localStorage.getItem(k), KEY)) === null);
    // ---------- 3. the main situation: add a cash on delivery parcel ----------
    await page.fill('#f-ret-days', '10');
    await page.fill('#f-shop', 'Temu'); await page.fill('#f-price', ' 1,250 ');
    await page.selectOption('#f-exp', '3');
    await page.locator('#f-price').dispatchEvent('input');
    ok('preview', (await txt(page, '#preview')) === 'Cash on delivery: keep 1,250 ready for the rider, expected in 3 days (Thu 19 Nov). 10 days to return it after it arrives.', await txt(page, '#preview'));
    await page.click('#save');
    let st = await saved(page);
    ok('saved one order', st.orders.length === 1 && st.orders[0].price === 125000 && st.orders[0].pay === 'cod' && st.orders[0].ordered === '2026-11-10' && st.orders[0].expected === '2026-11-19' && st.orders[0].retDays === 10 && st.orders[0].shop === 'Temu');
    ok('summary: keep 1,250 cash', (await txt(page, '.cash .v')) === 'Keep 1,250 cash ready' && (await txt(page, '.cash .k')) === 'On the way: 1 parcel');
    ok('toast with undo', (await txt(page, '#form-msg')).startsWith('Added: Phone case. Keep 1,250 cash ready.'));
    ok('form is reset, options hidden again', (await page.inputValue('#f-what')) === '' && !(await vis(page, '#f-ret')) && !(await vis(page, '#f-ordered')));
    await page.click('#form-msg .undo');
    ok('undo add: back to empty', (await saved(page)).orders.length === 0 && await page.$eval('#app', e => e.classList.contains('setup')));
    // ---------- 4. currency setting and an order in dollars ----------
    await page.selectOption('#s-cur', 'Rs');
    await page.fill('#f-shop', 'Daraz'); await page.fill('#f-what', 'Kurta'); await page.fill('#f-price', '3200'); await page.selectOption('#f-exp', '1'); await page.click('#save');
    await page.fill('#f-shop', 'Amazon'); await page.fill('#f-what', 'Earbuds'); await page.click('label[for=p-online]'); await page.fill('#f-price', '24.99');
    await page.click('#o-cur'); await page.selectOption('#f-cur', '$');
    ok('currency label beside the amount', (await txt(page, '#f-cur-label')) === '$');
    ok('the usual currency is not offered twice', !(await page.$$eval('#f-cur option', l => l.map(o => o.value))).includes('Rs'));
    await page.click('#save');
    ok('summary in Rs, dollars not added', (await txt(page, '.cash .v')) === 'Keep Rs 3,200 cash ready' && (await txt(page, '.cash .s')) === 'for 1 cash on delivery parcel. 1 parcel already paid online.');
    ok('arriving tomorrow listed', (await txt(page, '.alert.info')) === 'Arriving today or tomorrow Kurta from Daraz, tomorrow: pay Rs 3,200', await txt(page, '.alert.info'));
    ok('dollar order money line', (await box(page, 2).locator('.line').nth(1).textContent()) === 'Paid online $24.99');
    ok('month: paid so far', (await page.$eval('.month dl', e => e.textContent)).includes('$24.99'));
    // a free cash on delivery item: nothing to pay
    await page.fill('#f-what', 'Free sample'); await page.fill('#f-price', '0'); await page.click('#save');
    ok('zero amount allowed and adds nothing', (await txt(page, '.cash .v')) === 'Keep Rs 3,200 cash ready' && (await saved(page)).orders.length === 3);
    // reload keeps everything
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps orders and currency', (await page.locator('article.box').count()) === 3 && (await page.inputValue('#s-cur')) === 'Rs');
    await ctx.close();

    // ---------- 5. Ayesha's list: the full answer ----------
    ({ ctx, page } = await newPage({}, STATE));
    ok('glance: 4 parcels, keep Rs 7,450', (await txt(page, '.cash')) === 'On the way: 4 parcels Keep Rs 7,450 cash ready for 3 cash on delivery parcels. 1 parcel already paid online.');
    const alerts = await page.$$eval('#sum-body .alert', l => l.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
    ok('glance alerts', JSON.stringify(alerts) === JSON.stringify([
        'Arriving today or tomorrow Kurta, size M from Daraz, tomorrow: pay Rs 3,200',
        'Late: 1 parcel Phone case from Temu, expected Fri 13 Nov (3 days late)',
        'You can still return 2 items Table lamp from Daraz: return by Fri 20 Nov (4 days left) Shoes from Shein: return by Sat 21 Nov (5 days left)',
        'Refunds waiting: Rs 6,500 from 2 orders Rs 5,000 for Watch from Daraz, 20 days since you sent it back Rs 1,500 for Handbag from Instagram shop, 12 days since it was cancelled']), alerts);
    ok('month box', (await txt(page, '.month')) === 'Ordered in November 2026 Orders 7 Paid so far Rs 9,550 + $24.99 After Rs 1,000 refunded. Most from: Daraz (2), Amazon (1), Shein (1). Cash on delivery counts once you pay the rider.', await txt(page, '.month'));
    ok('tab counts', (await txt(page, '#n-coming')) === '(4)' && (await txt(page, '#n-arrived')) === '(3)' && (await txt(page, '#n-returns')) === '(2)' && (await txt(page, '#n-all')) === '(10)');
    ok('on the way order', JSON.stringify(await page.$$eval('article.box .box-name', l => l.map(e => e.textContent))) === JSON.stringify(['Phone case', 'Kurta, size M', "Kids' school shoes", 'Wireless earbuds']));
    ok('late box words', (await box(page, 1).locator('.badge').textContent()) === 'Late' && (await box(page, 1).locator('.line').first().textContent()) === 'Late: expected Fri 13 Nov, 3 days ago');
    // copy what is on the way
    await page.click('#copy-coming');
    ok('copy what is on the way', (await clip(page)).startsWith('On the way: 4 parcels (Mon 16 Nov 2026)\n- Phone case from Temu, LATE') && (await clip(page)).endsWith('Keep Rs 7,450 cash ready for 3 cash on delivery parcels.'));
    // copy a tracking number
    await box(page, 1).locator('.track button').click();
    ok('copy tracking number', (await clip(page)) === 'TM123456789' && (await txt(page, '#list-msg')).startsWith('Tracking number copied'));
    // ask the shop about the late parcel
    await boxBtn(page, 1, 'Ask the shop').click();
    ok('late message', (await page.inputValue('#sheet-text')).includes('It was expected on Fri 13 Nov 2026 (3 days ago) and has not arrived.') && (await txt(page, '#sheet-h')) === 'Ask where your parcel is');
    ok('email link with no recipient', (await page.getAttribute('#sheet-mail', 'href')).startsWith('mailto:?subject=Where%20is%20my%20order%3A%20Phone%20case&body=Hello'));
    await page.fill('#sheet-text', 'Edited words'); await page.click('#sheet-copy');
    ok('copy edited message', (await clip(page)) === 'Edited words' && (await page.getAttribute('#sheet-mail', 'href')).endsWith('body=Edited%20words'));
    await page.click('#sheet-close');
    ok('message closes', !(await page.$('#sheet[open]')));
    // it arrived: cash paid and return window
    await boxBtn(page, 1, 'It arrived').click();
    ok('arrived panel: cash prefilled', (await page.inputValue('#a-cash-1')) === '1250' && (await page.inputValue('#a-date-1')) === '2026-11-16');
    await page.fill('#a-date-1', '2026-11-17'); await page.click('text=Save: it arrived');
    ok('arrived in the future refused', (await box(page, 1).locator('.panel .err').textContent()) === 'The day it arrived cannot be after today.');
    await page.fill('#a-date-1', '2026-11-16'); await page.fill('#a-cash-1', '1200'); await page.selectOption('#a-ret-1', '7'); await page.click('text=Save: it arrived');
    st = await saved(page); let o1 = st.orders.find(o => o.id === 1);
    ok('arrived saved', o1.status === 'arrived' && o1.codPaid === 120000 && o1.retDays === 7 && o1.arrived === '2026-11-16');
    ok('arrived toast', (await txt(page, '#list-msg')).startsWith('Arrived: Phone case. Return by Mon 23 Nov'));
    ok('cash to keep drops to 6,200', (await txt(page, '.cash .v')) === 'Keep Rs 6,200 cash ready');
    await page.click('#list-msg .undo');
    ok('undo arrived', (await saved(page)).orders.find(o => o.id === 1).status === 'coming' && (await txt(page, '.cash .v')) === 'Keep Rs 7,450 cash ready');
    await boxBtn(page, 1, 'It arrived').click(); await page.click('text=Save: it arrived');
    await tabTo(page, 'arrived');
    ok('arrived box words', (await box(page, 1).locator('.line').first().textContent()) === 'Arrived Mon 16 Nov' && (await box(page, 1).locator('.line').nth(1).textContent()) === 'Paid Rs 1,250 cash to the rider');
    // keeping it / undo keeping it
    await boxBtn(page, 5, 'Keeping it').click();
    ok('keeping it hides the reminder', (await saved(page)).orders.find(o => o.id === 5).keep === true && !(await page.$eval('#sum-body', e => e.textContent)).includes('Shoes from Shein: return by'));
    ok('keeping it words', (await box(page, 5).locator('.line').first().textContent()) === 'Arrived Sat 7 Nov, keeping it');
    await boxBtn(page, 5, 'Undo keeping it').click();
    ok('undo keeping it', (await page.$eval('#sum-body', e => e.textContent)).includes('Shoes from Shein: return by Sat 21 Nov'));
    // not arrived yet
    await boxBtn(page, 10, 'Not arrived yet').click();
    ok('not arrived yet moves it back', (await saved(page)).orders.find(o => o.id === 10).status === 'coming' && (await txt(page, '#n-coming')) === '(4)');
    await page.click('#list-msg .undo');
    // sending it back with a part refund
    await boxBtn(page, 5, 'Sending it back').click();
    ok('refund prefilled with what was paid', (await page.inputValue('#r-ref-5')) === '4800');
    await page.fill('#r-ref-5', '5000'); await page.click('text=Save: sending it back');
    ok('refund more than paid refused', (await box(page, 5).locator('.panel .err').textContent()) === 'The refund cannot be more than you paid (Rs 4,800).');
    await page.fill('#r-ref-5', '4,600'); await page.click('text=Save: sending it back');
    ok('sending back: refund waiting', (await txt(page, '#n-returns')) === '(3)' && (await txt(page, '#sum-body')).includes('Refunds waiting: Rs 11,100 from 3 orders'));
    await tabTo(page, 'returns');
    await boxBtn(page, 5, 'Refund received').click();
    ok('refund received prefilled with what is owed', (await page.inputValue('#f-ra-5')) === '4600');
    await page.fill('#f-ra-5', '5000'); await page.click('text=Save refund');
    ok('refund more than owed refused', (await box(page, 5).locator('.panel .err').textContent()) === 'That is more than you are owed (Rs 4,600).');
    await page.fill('#f-ra-5', '0'); await page.click('text=Save refund');
    ok('refund 0 refused', (await box(page, 5).locator('.panel .err').textContent()).startsWith('Type the amount that came back'));
    await page.fill('#f-ra-5', '3000'); await page.click('text=Save refund');
    ok('part refund: still waiting for 1,600', (await box(page, 5).locator('.line').nth(1).textContent()) === 'Refund Rs 4,600: got Rs 3,000, still waiting for Rs 1,600' && (await txt(page, '#list-msg')) .startsWith('Rs 3,000 refund recorded. Rs 1,600 still to come.'));
    await boxBtn(page, 5, 'Ask the shop').click();
    ok('refund message', (await page.inputValue('#sheet-text')).includes('I have received Rs 3,000 so far. Rs 1,600 is still to be refunded.') && (await txt(page, '#sheet-h')) === 'Ask about your refund');
    await page.keyboard.press('Escape');
    await boxBtn(page, 5, 'No more refund coming').click();
    ok('no more refund coming', (await saved(page)).orders.find(o => o.id === 5).refundClosed === true && (await txt(page, '#n-returns')) === '(3)');
    ok('closed refund words', (await box(page, 5).locator('.line').nth(1).textContent()) === 'Refunded Rs 3,000 of Rs 4,600, no more coming');
    await boxBtn(page, 5, 'Still waiting for refund').click();
    ok('reopened refund', (await saved(page)).orders.find(o => o.id === 5).refundClosed === false);
    await boxBtn(page, 5, 'Refund received').click(); await page.click('text=Save refund');
    ok('refund in full', (await box(page, 5).locator('.line').nth(1).textContent()) === 'Refunded Rs 4,600 of Rs 4,800' && (await box(page, 5).locator('.badge').textContent()) === 'Returned, refunded');
    await boxBtn(page, 5, 'Not sending it back').click();
    ok('not sending it back clears the refund', (() => true)() && (await saved(page)).orders.find(o => o.id === 5).status === 'arrived' && (await saved(page)).orders.find(o => o.id === 5).refunds.length === 0);
    // cancelled or refused: cash on delivery refused at the door
    await tabTo(page, 'coming');
    await boxBtn(page, 2, 'Cancelled or refused').click();
    ok('cod cancel: no refund field', (await box(page, 2).locator('.panel input[inputmode=decimal]').count()) === 0 && (await box(page, 2).locator('.panel .hint').textContent()) === 'Nothing was paid, so no refund is needed.');
    await box(page, 2).locator('label', { hasText: 'Refused at the door' }).click();
    await box(page, 2).locator('.panel button[type=submit]').click();
    st = await saved(page);
    ok('refused saved, no refund', st.orders.find(o => o.id === 2).status === 'refused' && st.orders.find(o => o.id === 2).refundDue === 0 && (await txt(page, '.cash .v')) === 'Keep Rs 3,000 cash ready');
    // cancelled online order: refund owed, 0 allowed
    await boxBtn(page, 3, 'Cancelled or refused').click();
    ok('online cancel: refund prefilled', (await page.inputValue('#c-ref-3')) === '24.99');
    await page.fill('#c-ref-3', '30'); await box(page, 3).locator('.panel button[type=submit]').click();
    ok('cancel refund more than paid refused', (await box(page, 3).locator('.panel .err').textContent()) === 'The refund cannot be more than you paid ($24.99).');
    await page.fill('#c-ref-3', '0'); await box(page, 3).locator('.panel button[type=submit]').click();
    ok('cancel with no refund due', (await saved(page)).orders.find(o => o.id === 3).status === 'cancelled' && !(await txt(page, '#sum-body')).includes('for Wireless earbuds') && (await txt(page, '#n-returns')) === '(2)');
    await tabTo(page, 'all');
    await boxBtn(page, 3, 'Undo cancel').click();
    ok('undo cancel restores it', (await saved(page)).orders.find(o => o.id === 3).status === 'coming');
    // edit an order
    await tabTo(page, 'coming');
    await boxBtn(page, 4, 'Edit').click();
    ok('edit fills the form', (await txt(page, '#form-h')) === 'Edit order #4' && (await page.inputValue('#f-what')) === "Kids' school shoes" && (await page.inputValue('#f-exp')) === 'date' && (await page.inputValue('#f-exp-date')) === '2026-11-19' && (await page.inputValue('#f-ret')) === '7' && await vis(page, '#del'));
    await page.fill('#f-price', '3500'); await page.click('#save');
    ok('edit saved', (await saved(page)).orders.find(o => o.id === 4).price === 350000 && (await txt(page, '.cash .v')) === 'Keep Rs 3,500 cash ready' && (await saved(page)).orders.length === 10);
    await boxBtn(page, 4, 'Edit').click(); await page.fill('#f-price', '1'); await page.click('#cancel');
    ok('cancel edit changes nothing', (await saved(page)).orders.find(o => o.id === 4).price === 350000 && (await txt(page, '#form-h')) === 'Add an order');
    // order again
    await tabTo(page, 'arrived');
    await boxBtn(page, 6, 'Order again').click();
    ok('order again copies shop, item, amount, not the dates', (await page.inputValue('#f-shop')) === 'Daraz' && (await page.inputValue('#f-what')) === 'Table lamp' && (await page.inputValue('#f-price')) === '2150' && (await page.inputValue('#f-exp')) === '' && !(await vis(page, '#del')));
    await page.click('#save');
    ok('order again adds #11', (await saved(page)).orders.some(o => o.id === 11 && o.status === 'coming'));
    // delete with undo
    await tabTo(page, 'all');
    await boxBtn(page, 9, 'Delete').click();
    ok('deleted', !(await saved(page)).orders.some(o => o.id === 9));
    await page.click('#list-msg .undo');
    ok('undo delete', (await saved(page)).orders.some(o => o.id === 9));
    // search
    await page.fill('#q', 'tm1234');
    ok('search tracking', (await page.locator('article.box').count()) === 1);
    await page.fill('#q', 'nothing like this');
    ok('search no match message', (await txt(page, '#boxes')) === 'No orders match "nothing like this".');
    await page.fill('#q', '');
    // shop suggestions
    ok('shop suggestions: used shops first, then popular ones', (await page.$$eval('#shop-list option', l => l.map(o => o.value))).slice(0, 6).join('|') === 'Temu|Daraz|Amazon|Shein|Instagram shop|AliExpress');
    // backup, csv, restore, delete everything
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupPath = await dl.path();
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    ok('backup file', backup.orders.length === 11 && dl.suggestedFilename() === 'online-orders-backup-2026-11-16.json');
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok('csv file', csv.split('\r\n').length === 13 && csv.includes('Phone case'));
    await page.click('#wipe');
    ok('delete everything', (await saved(page)).orders.length === 0 && await page.$eval('#app', e => e.classList.contains('setup')) && (await saved(page)).cur === 'Rs');
    await page.click('#set-msg .undo');
    ok('undo delete everything', (await saved(page)).orders.length === 11);
    await page.click('#wipe');
    const bad = path.join(path.dirname(backupPath), 'not-a-backup.json'); fs.writeFileSync(bad, '{"hello":1}');
    await page.setInputFiles('#restore-file', bad);
    await page.waitForTimeout(200);
    ok('restore a wrong file refused', (await txt(page, '#set-msg')) === 'That file is not a backup from this app. Nothing was changed.');
    const good = path.join(path.dirname(backupPath), 'good.json'); fs.writeFileSync(good, JSON.stringify(backup));
    await page.setInputFiles('#restore-file', good);
    await page.waitForTimeout(200);
    ok('restore a backup', (await saved(page)).orders.length === 11 && (await txt(page, '#set-msg')).startsWith('Backup restored: 11 orders.'));
    await ctx.close();

    // ---------- 6. saved data that is broken ----------
    ({ ctx, page } = await newPage({}, '{not json'));
    ok('corrupt save starts fresh', await page.$eval('#app', e => e.classList.contains('setup')));
    await ctx.close();
    ({ ctx, page } = await newPage({}, JSON.stringify({ orders: [{ id: 1, what: 'b', ordered: '2026-13-01', price: 1 }, { id: 2, what: 'Ok', ordered: '2026-11-05', price: 100, refunds: 'x', status: 'weird' }] })));
    ok('broken order dropped, good one kept', (await page.locator('article.box').count()) === 1);
    await ctx.close();
    // very long text and huge amounts at 320
    const LONG = 'Supercalifragilisticexpialidocious'.repeat(5);
    ({ ctx, page } = await newPage({ viewport: { width: 320, height: 700 } }, { cur: 'KSh', orders: [{ id: 1, shop: LONG.slice(0, 60), what: LONG + ' ' + LONG, note: LONG, track: 'X'.repeat(60), courier: LONG.slice(0, 40), orderNo: '9'.repeat(60), ordered: '2026-11-01', expected: '2026-11-02', price: 999999999999, pay: 'cod' }] }));
    ok('long text: no sideways scroll at 320', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    ok('huge amount shown exactly', (await txt(page, '.cash .v')) === 'Keep KSh 9,999,999,999.99 cash ready');
    await ctx.close();

    // ---------- 7. every width, dark and light, filled and cleared ----------
    for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) for (const scheme of ['dark', 'light']) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme }, STATE));
        await boxBtn(page, 1, 'It arrived').click();
        ok('filled, no sideways scroll at ' + w + ' ' + scheme, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('main *')].every(e => e.getBoundingClientRect().right <= innerWidth + 1)));
        await page.click('#wipe');
        ok('cleared, no sideways scroll at ' + w + ' ' + scheme, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await ctx.close();
    }
    // light and dark switch
    ({ ctx, page } = await newPage({}, STATE));
    await page.click('.theme-toggle');
    const th1 = await page.getAttribute('html', 'data-theme');
    await page.click('.theme-toggle');
    ok('theme switch flips', th1 === 'light' && (await page.getAttribute('html', 'data-theme')) === 'dark');
    await ctx.close();

    // ---------- 8. help dialog and no overlapping controls on phones ----------
    for (const w of [320, 360, 390, 820, 1280]) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 800 }, colorScheme: w === 360 ? 'light' : 'dark' }, STATE));
        await page.click('.help-btn');
        const dlg = await page.$('dialog.help[open]');
        if (dlg) {
            const r = await dlg.boundingBox();
            ok('help inside screen at ' + w, r.x >= 0 && r.x + r.width <= w + 1 && r.y >= 0 && r.y + r.height <= 801);
            ok('help title at ' + w, (await txt(page, 'dialog.help h2')) === 'How to use Online Orders and Cash on Delivery Tracker');
            await page.keyboard.press('Escape');
            ok('help closes with Escape at ' + w, !(await page.$('dialog.help[open]')));
            await page.click('.help-btn'); await page.click('dialog.help button:has-text("Got it")');
            ok('help closes with Got it at ' + w, !(await page.$('dialog.help[open]')));
        } else ok('help opens at ' + w, false);
        const bar = await page.$$eval('.topbar > *', l => l.map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
        ok('top bar on one line at ' + w, bar.every(b => Math.abs(b[0] - bar[0][0]) < 3));
        ok('top bar buttons do not overlap at ' + w, bar.every((a, i) => bar.every((b, j) => i >= j || a[3] <= b[2] + 1 || b[3] <= a[2] + 1)));
        if (w <= 390) {
            for (const id of ['o-ordered', 'o-track', 'o-ret', 'o-cur', 'o-note']) await page.click('#' + id);
            await page.selectOption('#f-exp', 'date'); await page.selectOption('#f-ret', 'other');
            for (const [n, label] of [[1, 'It arrived'], [3, 'Cancelled or refused']]) {
                await boxBtn(page, n, label).click();
                const overlaps = await page.evaluate(() => {
                    const els = [...document.querySelectorAll('main input:not([type=radio]):not([type=file]), main select, main textarea, main button, main .seg label, main a.primary')].filter(e => e.offsetParent).map(e => [e.id || e.textContent.trim().slice(0, 20), e.getBoundingClientRect()]);
                    const out = [];
                    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i][1], b = els[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(els[i][0] + ' / ' + els[j][0]); }
                    return out;
                });
                ok('no overlapping controls at ' + w + ' with ' + label, overlaps.length === 0, overlaps);
            }
            await tabTo(page, 'returns'); await boxBtn(page, 8, 'Refund received').click();
            ok('no sideways scroll with all open at ' + w, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            const clipped = await page.$$eval('main input[placeholder]', l => l.filter(e => e.offsetParent).filter(e => { const c = document.createElement('canvas').getContext('2d'); const s = getComputedStyle(e); c.font = s.fontSize + ' ' + s.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1; }).map(e => e.id));
            ok('placeholders fit at ' + w, clipped.length === 0, clipped);
        }
        await ctx.close();
    }
    // ---------- 9. desktop scroll: blocks never overlap ----------
    for (const w of [900, 1024, 1280, 1418, 1920]) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 900 } }, STATE));
        for (const y of [0, 0.5, 1]) {
            await page.evaluate(f => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), y);
            const n = await page.evaluate(() => { const kids = [...document.querySelectorAll('main > *, .col-main > *, .col-side > *, #boxes > *, #sum-body > *')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents').map(e => e.getBoundingClientRect()); let n = 0; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], b = kids[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1 && !(a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom) && !(b.left <= a.left && b.right >= a.right && b.top <= a.top && b.bottom >= a.bottom)) n++; } return n; });
            ok('no overlap at ' + w + ' scroll ' + y, n === 0);
        }
        ok('wide layout uses two columns at ' + w, await page.evaluate(() => document.querySelector('.col-side').getBoundingClientRect().left > document.querySelector('.col-main').getBoundingClientRect().right));
        ok('no sticky or fixed blocks at ' + w, await page.evaluate(() => [...document.querySelectorAll('main *')].every(e => !['sticky', 'fixed'].includes(getComputedStyle(e).position))));
        await ctx.close();
    }

    // every file the page asked for loaded
    ['style.css', 'core.js', 'script.js'].forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith(SLUG + '/' + f))));
    { const c = await browser.newContext(); const files = ['', 'index.html', 'favicon.svg', 'manifest.webmanifest', 'sw.js', 'style.css', 'core.js', 'script.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../theme.js', '../help.js', '../apps.json'];
      for (const f of files) { const r = await c.request.get(URL + f); ok('200 for ' + (f || './'), r.status() === 200, r.status()); }
      const hub = await c.request.get(base + '/apps.json'); ok('hub lists the app with its colour', (await hub.json()).some(a => a.slug === SLUG && a.color === '#1b8aa0'));
      await c.close(); }
    ok('theme.js and help.js requested', [...requested].some(u => u.endsWith('/theme.js')) && [...requested].some(u => u.endsWith('/help.js')));
    ok('no failed requests', failed.length === 0, failed);
    ok('no console errors', errors.length === 0, errors);
    await browser.close(); if (srv) srv.close();
    console.log('Online Orders UI: ' + pass + ' passed, ' + fail + ' failed' + (process.env.BASE ? ' (LIVE ' + base + ')' : ''));
    process.exitCode = fail ? 1 : 0;
})();
