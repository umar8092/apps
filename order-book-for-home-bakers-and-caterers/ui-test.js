// Full page test with Playwright. Run: node ui-test.js     BASE=https://umar8092.github.io/apps node ui-test.js  tests the live site.
// "Today" is fixed to Wed 4 Nov 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { BOOK } = require('./shots.js');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'order-book-for-home-bakers-and-caterers', KEY = SLUG + '.state';
const NOW = new Date('2026-11-04T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); };
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
    const txt = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
    const vis = (page, sel) => page.isVisible(sel);
    const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    const box = (page, n) => page.locator('article.box', { has: page.locator('.box-sub', { hasText: new RegExp('^#' + n + ' ') }) });
    const clip = page => page.evaluate(() => navigator.clipboard.readText());

    // ---------- 1. first use and the empty state ----------
    let { ctx, page } = await newPage();
    ok('first use: setup layout, form only', await page.$eval('#app', e => e.classList.contains('setup')) && await vis(page, '#form') && !(await vis(page, '#sum')) && !(await vis(page, '#list')) && !(await vis(page, '#jump-add')));
    ok('first use: optional fields hidden', !(await vis(page, '#f-phone')) && !(await vis(page, '#f-note')) && !(await vis(page, '#f-adv')) && !(await vis(page, '#w-delivery')));
    ok('first use: date is tomorrow, any time', await page.inputValue('#f-date') === '2026-11-05' && await page.inputValue('#f-time') === '');
    ok('time options', (await page.$$eval('#f-time option', l => l.map(o => o.textContent))).filter((t, i, a) => i < 2 || i === 33 || i === a.length - 1).join('|') === 'Any time|12:00 am|4:00 pm|Other time...');
    // ---------- 2. validation: blank, text, negative ----------
    await page.click('#save');
    ok('blank: three errors', (await txt(page, '#e-name')) === "Type the customer's name." && (await txt(page, '#e-what')) === 'Type what they ordered.' && (await txt(page, '#e-price')) === 'Type the price (0 if it is free).');
    ok('blank: nothing saved', (await page.evaluate(k => localStorage.getItem(k), KEY)) === null);
    await page.fill('#f-price', 'abc'); await page.click('#save');
    ok('text price refused', (await txt(page, '#e-price')).startsWith('Type a number'));
    await page.fill('#f-price', '-50'); await page.click('#save');
    ok('negative price refused', (await txt(page, '#e-price')).startsWith('Type a number'));
    // ---------- 3. the main situation: Sana's cake ----------
    await page.fill('#f-name', 'Sana Ahmed');
    await page.click('#o-phone'); await page.fill('#f-phone', '+92 300 1234567');
    await page.fill('#f-what', 'Chocolate cake, 2 pounds');
    await page.click('#o-note'); await page.fill('#f-note', 'Happy Birthday Ayesha');
    await page.selectOption('#f-time', '16:00');
    await page.fill('#f-price', '4,500');
    await page.click('#o-adv'); await page.fill('#f-adv', '5000');
    await page.click('#save');
    ok('advance above total refused', (await txt(page, '#e-adv')) === 'The advance is more than the total (4,500).');
    await page.fill('#f-adv', '1500');
    ok('preview', (await txt(page, '#preview')) === 'Pickup Thu 5 Nov, 4:00 pm. Total 4,500, paid 1,500, balance 3,000 to collect.', await txt(page, '#preview'));
    await page.click('#save');
    ok('added message with undo', (await txt(page, '#form-msg')).startsWith('Order #1 added for Thu 5 Nov.') && await page.isVisible('#form-msg .undo'));
    ok('form reset after add', await page.inputValue('#f-name') === '' && !(await vis(page, '#f-phone')) && !(await vis(page, '#f-adv')));
    ok('summary tomorrow', (await txt(page, '#sum-body .day-sum:nth-child(2) .big')) === 'Tomorrow, Thu 5 Nov1 order · collect 3,000', await txt(page, '#sum-body .day-sum:nth-child(2) .big'));
    ok('summary today empty', (await txt(page, '#sum-body .day-sum:nth-child(1) .big')) === 'Today, Wed 4 NovNo orders');
    ok('box money line', (await txt(page, 'article.box .line')) === 'Total 4,500, paid 1,500, balance 3,000');
    ok('box note', (await txt(page, 'article.box .note')) === '"Happy Birthday Ayesha"');
    let st = await saved(page);
    ok('saved exactly', st.orders.length === 1 && st.orders[0].price === 450000 && st.orders[0].adv === 150000 && st.orders[0].time === '16:00' && st.orders[0].phone === '+92 300 1234567');
    ok('jump button on phone', await vis(page, '#jump-add'));
    // message sheet straight after adding
    await page.click('#form-msg button:has-text("Send confirmation")');
    ok('sheet opens with confirmation', (await page.inputValue('#sheet-text')).startsWith('Hi Sana, your order is confirmed.') && (await page.inputValue('#sheet-text')).includes('Balance to pay on pickup: 3,000'));
    ok('WhatsApp link goes to the number', (await page.getAttribute('#sheet-wa', 'href')).startsWith('https://wa.me/923001234567?text=Hi%20Sana'));
    await page.click('label[for=k-remind]');
    ok('reminder text', (await page.inputValue('#sheet-text')) === 'Hi Sana, a reminder that your order (Chocolate cake, 2 pounds) is for pickup on Thursday 5 November at 4:00 pm.\nBalance to pay: 3,000.\nSee you then!');
    await page.fill('#sheet-text', 'Edited words');
    ok('edited words go to WhatsApp', (await page.getAttribute('#sheet-wa', 'href')).endsWith('?text=Edited%20words'));
    await page.click('#sheet-copy');
    ok('copy message', (await clip(page)) === 'Edited words');
    await page.keyboard.press('Escape');
    ok('sheet closes with Escape', !(await page.$eval('#sheet', d => d.open)));
    // ---------- 4. undo an add ----------
    await page.fill('#f-name', 'Test'); await page.fill('#f-what', 'x'); await page.fill('#f-price', '0'); await page.click('#save');
    ok('free order allowed', (await saved(page)).orders.length === 2);
    await page.click('#form-msg .undo');
    ok('undo add', (await saved(page)).orders.length === 1);
    // ---------- 5. delivery, other time, local phone ----------
    await page.fill('#f-name', 'Bilal Khan'); await page.click('#o-phone'); await page.fill('#f-phone', '0321 7654321');
    await page.fill('#f-what', 'Chicken biryani, 1 deg');
    await page.selectOption('#f-time', 'other'); await page.fill('#f-time-other', '13:15');
    await page.click('label[for=m-delivery]');
    ok('delivery extras appear', await vis(page, '#o-addr') && await vis(page, '#o-deliv'));
    await page.click('#o-addr'); await page.fill('#f-addr', 'House 12, Street 4');
    await page.click('#o-deliv'); await page.fill('#f-deliv', '250');
    await page.fill('#f-price', '9000'); await page.click('#o-adv'); await page.fill('#f-adv', '3000');
    await page.click('#save');
    ok('tomorrow now 2 orders, collect 9,250', (await txt(page, '#sum-body .day-sum:nth-child(2) .big')) === 'Tomorrow, Thu 5 Nov2 orders · collect 9,250');
    ok('time order in summary', (await page.$$eval('#sum-body .day-sum:nth-child(2) .mini-list b', l => l.map(e => e.textContent))).join('|') === '1:15 pm|4:00 pm');
    ok('delivery line', (await txt(page, 'article.box:has-text("Bilal") .line')) === 'Total 9,250 (with 250 delivery), paid 3,000, balance 6,250');
    await box(page, 2).locator('button:has-text("Message")').click();
    ok('local number: WhatsApp without a number', (await page.getAttribute('#sheet-wa', 'href')).startsWith('https://wa.me/?text='));
    ok('tomorrow order opens the reminder', await page.isChecked('#k-remind'));
    await page.click('#sheet-close');
    // ---------- 6. daily limit ----------
    await page.selectOption('#s-limit', '2');
    await page.fill('#f-date', '2026-11-05'); await page.locator('#f-date').dispatchEvent('change');
    ok('full day warning', (await txt(page, '#limit-warn')) === 'Thu 5 Nov is full: you already have 2 orders (your limit is 2). You can still add it.' && await page.$eval('#limit-warn', e => e.classList.contains('full')));
    await page.fill('#f-date', '2026-11-03'); await page.locator('#f-date').dispatchEvent('change');
    ok('past date warning', (await txt(page, '#limit-warn')) === 'This date has passed.');
    // ---------- 7. repeat customer and a past-date order ----------
    await page.fill('#f-name', 'Sana Ahmed'); await page.locator('#f-name').dispatchEvent('change');
    ok('repeat customer fills phone', await vis(page, '#f-phone') && await page.inputValue('#f-phone') === '+92 300 1234567');
    await page.fill('#f-what', 'Kheer, 1 kg'); await page.fill('#f-price', '1200'); await page.click('#save');
    ok('late order shown', (await txt(page, '#sum-body .alert')).startsWith('Not handed over yet from earlier days: 1 order') && (await txt(page, '.group.late .group-h')) === 'Earlier days, not handed over yet');
    // ---------- 8. ready, handed over, payments ----------
    await box(page, 1).locator('button:has-text("Mark ready")').click();
    ok('ready badge', (await box(page, 1).locator('.badge').textContent()) === 'Ready');
    await box(page, 1).locator('button:has-text("Handed over, pays later")').click();
    ok('pays later: owed list', (await txt(page, '#sum-body .alert:has-text("Still owed")')).startsWith('Still owed: 3,000 from 1 order already handed over'));
    await page.click('label[for=t-done]');
    await box(page, 1).locator('button:has-text("Record a payment")').click();
    ok('payment prefilled with balance', await box(page, 1).locator('.panel input[type=text]').inputValue() === '3000');
    await box(page, 1).locator('.panel input[type=text]').fill('3500'); await box(page, 1).locator('.panel button[type=submit]').click();
    ok('payment above balance refused', (await box(page, 1).locator('.panel .err').textContent()) === 'That is more than the balance (3,000).');
    await box(page, 1).locator('.panel input[type=text]').fill('0'); await box(page, 1).locator('.panel button[type=submit]').click();
    ok('zero payment refused', (await box(page, 1).locator('.panel .err').textContent()).startsWith('Type the amount'));
    await box(page, 1).locator('.panel input[type=text]').fill('1000'); await box(page, 1).locator('.panel button[type=submit]').click();
    ok('part payment', (await txt(page, '#list-msg')).startsWith('1,000 recorded for Sana Ahmed. Balance now 2,000.'));
    await box(page, 1).locator('button:has-text("Record a payment")').click(); await box(page, 1).locator('.panel button[type=submit]').click();
    ok('paid in full, owed list gone', (await txt(page, '#list-msg')).includes('Paid in full.') && !(await page.isVisible('#sum-body .alert:has-text("Still owed")')));
    await page.click('label[for=t-upcoming]');
    await box(page, 2).locator('button:has-text("Handed over and paid")').click();
    st = await saved(page);
    ok('handed over and paid records the balance today', st.orders.find(o => o.id === 2).pays.slice(-1)[0].amt === 625000 && st.orders.find(o => o.id === 2).pays.slice(-1)[0].d === '2026-11-04' && st.orders.find(o => o.id === 2).status === 'done');
    await page.click('#list-msg .undo');
    ok('undo hand over', (await saved(page)).orders.find(o => o.id === 2).status === 'open');
    // ---------- 9. cancel: kept and given back ----------
    await box(page, 2).locator('button:has-text("Cancel order")').click();
    ok('cancel asks about the advance', await box(page, 2).locator('button:has-text("Gave the advance back")').isVisible());
    await box(page, 2).locator('button:has-text("Kept the advance")').click();
    ok('cancel kept', (await txt(page, '#list-msg')).startsWith('Order #2 cancelled, you kept 3,000.'));
    ok('week sales: Sana 4,500 + Kheer 1,200 + kept 3,000', (await page.$$eval('#sum-body .stat:first-child dd', l => l.map(e => e.textContent))).join('|') === '2|8,700|7,500|1,200', await page.$$eval('#sum-body .stat:first-child dd', l => l.map(e => e.textContent)));
    await page.click('label[for=t-cancel]');
    await box(page, 2).locator('button:has-text("Restore order")').click();
    await page.click('label[for=t-upcoming]');
    await box(page, 2).locator('button:has-text("Cancel order")').click(); await box(page, 2).locator('button:has-text("Gave the advance back")').click();
    ok('cancel refund leaves sales', (await page.$$eval('#sum-body .stat:first-child dd', l => l.map(e => e.textContent))).join('|') === '2|5,700|4,500|1,200');
    // ---------- 10. edit, order again, delete ----------
    await box(page, 3).locator('button:has-text("Edit")').click();
    ok('edit fills the form', await page.inputValue('#f-name') === 'Sana Ahmed' && await page.inputValue('#f-price') === '1200' && (await txt(page, '#form-h')) === 'Edit order #3' && await vis(page, '#del') && await vis(page, '#cancel'));
    await page.fill('#f-price', '1300'); await page.click('#save');
    ok('edit saved', (await saved(page)).orders.find(o => o.id === 3).price === 130000 && (await saved(page)).orders.length === 3);
    await page.click('label[for=t-done]');
    await box(page, 1).locator('button:has-text("Order again")').click();
    ok('order again copies without date or advance', await page.inputValue('#f-what') === 'Chocolate cake, 2 pounds' && await page.inputValue('#f-date') === '2026-11-05' && !(await vis(page, '#f-adv')) && (await txt(page, '#save')) === 'Add the order');
    await page.click('#cancel');
    await page.click('label[for=t-all]');
    await box(page, 3).locator('button:has-text("Delete")').click();
    ok('delete', (await saved(page)).orders.length === 2 && (await txt(page, '#list-msg')).startsWith('Order #3 for Sana Ahmed deleted.'));
    await page.click('#list-msg .undo');
    ok('undo delete', (await saved(page)).orders.length === 3);
    await box(page, 3).locator('button:has-text("Edit")').click(); await page.click('#del');
    ok('delete from the form', (await saved(page)).orders.length === 2);
    // ---------- 11. search and tabs ----------
    await page.fill('#q', 'BIRYANI');
    ok('search', (await page.locator('article.box').count()) === 1);
    await page.fill('#q', 'pizza');
    ok('search no match', (await txt(page, '#groups .empty')) === 'No orders match "pizza".');
    await page.fill('#q', '');
    ok('tab counts', (await txt(page, '#tabs')) === 'To make (0) Handed over (1) Cancelled (1) All (2)', await txt(page, '#tabs'));
    // ---------- 12. currency, lakh, reload ----------
    await page.selectOption('#s-cur', 'Rs'); await page.selectOption('#s-style', 'sa');
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps orders and settings', await page.inputValue('#s-cur') === 'Rs' && await page.inputValue('#s-style') === 'sa' && await page.inputValue('#s-limit') === '2' && (await page.locator('#tabs small').first().textContent()) === '(0)');
    ok('currency shown', (await page.locator('.cur').first().textContent()) === 'Rs');
    // ---------- 13. backup, CSV, restore, wipe ----------
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupPath = await dl.path(); const backup = fs.readFileSync(backupPath, 'utf8');
    ok('backup file', JSON.parse(backup).orders.length === 2);
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok('csv', csv.split('\r\n').length === 3 && csv.includes('Chicken biryani'));
    await page.click('#wipe');
    ok('delete everything', (await saved(page)).orders.length === 0 && await page.$eval('#app', e => e.classList.contains('setup')) && (await saved(page)).cur === 'Rs');
    await page.click('#set-msg .undo');
    ok('undo delete everything', (await saved(page)).orders.length === 2);
    await page.click('#wipe');
    const bad = path.join(path.dirname(backupPath), 'bad.json'); fs.writeFileSync(bad, '{"hello":1}');
    await page.setInputFiles('#restore-file', bad);
    await page.waitForTimeout(200);
    ok('bad backup refused', (await txt(page, '#set-msg')) === 'That file is not an Order Book backup. Nothing was changed.');
    await page.setInputFiles('#restore-file', backupPath);
    await page.waitForTimeout(200);
    ok('restore backup', (await saved(page)).orders.length === 2 && (await txt(page, '#set-msg')).startsWith('Backup restored: 2 orders.'));
    await ctx.close();

    // ---------- 14. saved book: the README answers, copy lists ----------
    ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, BOOK));
    ok('README: today', (await txt(page, '#sum-body .day-sum:nth-child(1) .big')) === 'Today, Wed 4 Nov1 order · collect Rs 2,800');
    ok('README: tomorrow', (await txt(page, '#sum-body .day-sum:nth-child(2) .big')) === 'Tomorrow, Thu 5 Nov3 orders · collect Rs 9,250');
    ok('README: week', (await page.$$eval('#sum-body .stat:first-child dd', l => l.map(e => e.textContent))).join('|') === '7|Rs 28,450|Rs 9,400|Rs 19,050');
    ok('README: month', (await page.$$eval('#sum-body .stat:nth-child(2) dd', l => l.map(e => e.textContent))).join('|') === '8|Rs 31,950|Rs 12,900|Rs 19,050');
    ok('README: owed', (await txt(page, '#sum-body .alert:has-text("Still owed")')).startsWith('Still owed: Rs 1,800'));
    ok('desktop: no jump button', !(await vis(page, '#jump-add')));
    await page.click('#copy-tomorrow');
    ok('copy tomorrow list', (await clip(page)).startsWith('Orders for Thu 5 Nov 2026: 3 orders, collect Rs 9,250\n\n1:00 pm - Bilal Khan (0321 7654321) - #2'));
    await page.click('#copy-today');
    ok('copy today list', (await clip(page)).startsWith('Orders for Wed 4 Nov 2026: 1 order, collect Rs 2,800'));
    await box(page, 1).locator('button:has-text("Message")').click();
    ok('signed message', (await page.inputValue('#sheet-text')).endsWith("Sana's Bakes"));
    await page.click('#sheet-close');
    // light/dark switch
    const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click('.theme-toggle');
    ok('theme switch', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'light' && bg1 !== await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
    await ctx.close();

    // ---------- 15. corrupt and partly broken saves ----------
    ({ ctx, page } = await newPage({}, '{not json'));
    ok('corrupt save starts fresh', await page.$eval('#app', e => e.classList.contains('setup')) && errors.length === 0);
    await ctx.close();
    ({ ctx, page } = await newPage({}, JSON.stringify({ orders: [{ id: 1, name: 'A', what: 'b', date: '2026-13-01', price: 1 }, { id: 2, name: 'Ok', what: 'cake', date: '2026-11-05', time: '', price: 100, pays: 'x' }] })));
    ok('broken order dropped, good one kept', (await page.locator('article.box').count()) === 1);
    await ctx.close();
    // very long text
    const LONG = 'Supercalifragilisticexpialidocious'.repeat(5);
    ({ ctx, page } = await newPage({ viewport: { width: 320, height: 700 } }, { orders: [{ id: 1, name: LONG, what: LONG + ' ' + LONG, note: LONG, phone: '+92 300 1234567 8888', date: '2026-11-05', time: '09:15', mode: 'delivery', addr: LONG, price: 999999999999, deliv: 0, adv: 0 }] }));
    ok('long text: no sideways scroll at 320', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    ok('odd time shown', (await txt(page, '.when')) === '9:15 am');
    await ctx.close();

    // ---------- 16. phones: help dialog and no overlapping controls with everything open ----------
    for (const w of [320, 360, 390, 820, 1280]) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 800 }, colorScheme: w === 360 ? 'light' : 'dark' }, BOOK));
        await page.click('.help-btn, button[aria-label*="Help"], .topbar button:has-text("Help")').catch(() => {});
        const dlg = await page.$('dialog.help[open]');
        if (dlg) {
            const r = await dlg.boundingBox();
            ok('help inside screen at ' + w, r.x >= 0 && r.x + r.width <= w + 1);
            await page.keyboard.press('Escape');
            ok('help closes at ' + w, !(await page.$('dialog.help[open]')));
        } else ok('help opens at ' + w, false);
        const bar = await page.$$eval('.topbar > *', l => l.map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom]));
        ok('top bar on one line at ' + w, bar.every(b => Math.abs(b[0] - bar[0][0]) < 3));
        if (w <= 390) {
            for (const id of ['o-phone', 'o-note', 'o-adv']) await page.click('#' + id);
            await page.click('label[for=m-delivery]'); await page.click('#o-addr'); await page.click('#o-deliv');
            await page.selectOption('#f-time', 'other');
            await box(page, 2).locator('button:has-text("Record a payment")').click();
            const overlaps = await page.evaluate(() => {
                const els = [...document.querySelectorAll('main input:not([type=radio]):not([type=file]), main select, main textarea, main button, main .seg label, main a.primary')].filter(e => e.offsetParent).map(e => [e.id || e.textContent.trim().slice(0, 20), e.getBoundingClientRect()]);
                const out = [];
                for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i][1], b = els[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(els[i][0] + ' / ' + els[j][0]); }
                return out;
            });
            ok('no overlapping controls at ' + w, overlaps.length === 0, overlaps);
            ok('no sideways scroll with all open at ' + w, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            const clipped = await page.$$eval('main input[placeholder]', l => l.filter(e => e.offsetParent).filter(e => { const c = document.createElement('canvas').getContext('2d'); const s = getComputedStyle(e); c.font = s.fontSize + ' ' + s.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1; }).map(e => e.id));
            ok('placeholders fit at ' + w, clipped.length === 0, clipped);
        }
        await ctx.close();
    }
    // ---------- 17. desktop scroll: blocks never overlap ----------
    for (const w of [900, 1024, 1280, 1418, 1920]) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 900 } }, BOOK));
        for (const y of [0, 0.5, 1]) {
            await page.evaluate(f => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), y);
            const bad = await page.evaluate(() => { const kids = [...document.querySelectorAll('main > *, .col-main > *, .col-side > *')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents').map(e => e.getBoundingClientRect()); let n = 0; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], b = kids[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1 && !(a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom) && !(b.left <= a.left && b.right >= a.right && b.top <= a.top && b.bottom >= a.bottom)) n++; } return n; });
            ok('no overlap at ' + w + ' scroll ' + y, bad === 0);
        }
        ok('wide layout uses two columns at ' + w, await page.evaluate(() => document.querySelector('.col-side').getBoundingClientRect().left > document.querySelector('.col-main').getBoundingClientRect().right));
        await ctx.close();
    }

    // every file the page asked for loaded
    ['style.css', 'core.js', 'script.js'].forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith(SLUG + '/' + f))));
    { const c = await browser.newContext(); const files = ['', 'index.html', 'favicon.svg', 'manifest.webmanifest', 'sw.js', 'style.css', 'core.js', 'script.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../theme.js', '../help.js', '../apps.json'];
      for (const f of files) { const r = await c.request.get(URL + f); ok('200 for ' + (f || './'), r.status() === 200, r.status()); }
      const hub = await c.request.get(base + '/apps.json'); ok('hub lists the app with its colour', (await hub.json()).some(a => a.slug === SLUG && a.color === '#a0522d'));
      await c.close(); }
    ok('theme.js and help.js requested', [...requested].some(u => u.endsWith('/theme.js')) && [...requested].some(u => u.endsWith('/help.js')));
    ok('no failed requests', failed.length === 0, failed);
    ok('no console errors', errors.length === 0, errors);
    await browser.close(); if (srv) srv.close();
    console.log('Order Book UI: ' + pass + ' passed, ' + fail + ' failed' + (process.env.BASE ? ' (LIVE ' + base + ')' : ''));
    process.exitCode = fail ? 1 : 0;
})();
