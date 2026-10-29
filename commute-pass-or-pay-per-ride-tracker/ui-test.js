// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Fri 30 Oct 2026, 10:00 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'commute-pass-or-pay-per-ride-tracker', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-30T10:00:00+05:00');
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
    async function newPage(opts, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        await page.clock.install({ time: NOW });
        await page.clock.pauseAt(NOW);
        if (init) await page.addInitScript(init);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'load' });
        await page.waitForTimeout(300);
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).first().innerText();
    const head = page => txt(page, '#sum-body .next');
    const verdict = page => txt(page, '#sum-body .verdict');
    const visible = (page, sel) => page.locator(sel).first().isVisible();
    async function setFare(page, i, name, price) {
        const box = page.locator('#fares > li').nth(i);
        await box.locator('.f-name').fill(name); await box.locator('.f-name').press('Tab');
        await box.locator('.f-price').fill(price); await box.locator('.f-price').press('Tab');
    }
    async function setPass(page, i, name, price, kind, n) {
        const box = page.locator('#passes > li').nth(i);
        await box.locator('.p-name').fill(name); await box.locator('.p-name').press('Tab');
        await box.locator('.p-price').fill(price); await box.locator('.p-price').press('Tab');
        if (kind) await box.locator('.p-kind').selectOption(kind);
        if (kind === 'rides' && n) { await box.locator('.p-rides').fill(n); await box.locator('.p-rides').press('Tab'); }
        if (kind === 'dN' && n) { await box.locator('.p-days').fill(n); await box.locator('.p-days').press('Tab'); }
    }
    async function deleteDay(page, label) {
        const day = page.locator('#days > li', { hasText: label });
        await day.locator('button', { hasText: 'Delete' }).first().click();
    }
    // Ayesha's October: metro 80, monthly pass 3,000, there and back on 19 weekdays (off 12, 13 and 26 Oct)
    async function ayesha(page) {
        await setFare(page, 0, 'Metro', '80');
        await setPass(page, 0, 'Monthly pass', '3000');
        await page.fill('#g-from', '2026-10-01'); await page.fill('#g-to', '2026-10-29'); await page.click('#g-go');
        await page.click('#add2');
        if (await visible(page, '#more-days') && (await txt(page, '#more-days')).startsWith('Show all')) await page.click('#more-days');
        for (const d of ['Mon 12 Oct', 'Tue 13 Oct', 'Mon 26 Oct']) await deleteDay(page, d);
    }

    // ================= first use =================
    let { ctx, page } = await newPage();
    ok('first use: set-up first', await page.evaluate(() => document.body.classList.contains('setup-first')));
    ok('first use: prompt', (await head(page)) === 'Start by typing what one ride costs', await head(page));
    ok('first use: log buttons off until a fare', await page.locator('#add2').isDisabled());
    ok('first use: one fare hides "Which ride?"', !(await visible(page, '#w-fare')));
    ok('optional: more rides hidden', !(await visible(page, '#w-more')));
    ok('optional: covers hidden with one fare', !(await visible(page, '#passes .covers')));
    ok('optional: bought form hidden', !(await visible(page, '#passes .buy-form')));
    ok('no passes bought yet', await visible(page, '#mine-empty'));
    await page.click('#sum-body .go');
    ok('"Type my fare" focuses the price', await page.evaluate(() => document.activeElement.classList.contains('f-price')));
    // bad prices
    await page.locator('.f-price').fill('-5'); await page.locator('.f-price').press('Tab');
    ok('negative fare refused', (await txt(page, '#fares .err')).includes('0 or more'));
    await page.locator('.f-price').fill('abc'); await page.locator('.f-price').press('Tab');
    ok('text fare refused', (await txt(page, '#fares .err')).includes('Type a number'));
    await page.locator('.f-price').fill('2.555'); await page.locator('.f-price').press('Tab');
    ok('3 decimals refused', (await txt(page, '#fares .err')).includes('2 decimals'));
    await page.locator('.p-price').fill('0'); await page.locator('.p-price').press('Tab');
    ok('pass price 0 refused', (await txt(page, '#passes .err')).includes('costs 0'));
    await page.locator('#passes .buy-btn').click({ force: true });   // aria-disabled still answers a tap
    ok('buying a pass with no price asks for it', (await txt(page, '#passes .err')).includes('price of this pass'));
    await page.locator('.p-price').fill(''); await page.locator('.p-price').press('Tab');

    // ================= the main situation =================
    await ayesha(page);
    ok('set-up no longer first', !(await page.evaluate(() => document.body.classList.contains('setup-first'))));
    ok('Ayesha: headline', (await head(page)) === 'October so far: 38 rides, 3,040 paying per ride', await head(page));
    ok('Ayesha: days and fare', (await txt(page, '#sum-body .facts-line')) === '19 days of travel, 80 a ride', await txt(page, '#sum-body .facts-line'));
    ok('Ayesha: monthly saves 40', (await verdict(page)) === 'The Monthly pass would save 40', await verdict(page));
    ok('Ayesha: cheapest line', (await txt(page, '#sum-body .opt-line.best')).includes('Monthly pass: 1 pass = 3,000, saves 40'));
    ok('rides list: 7 days, Show all', (await page.locator('#days > li').count()) === 19 || (await page.locator('#days > li').count()) === 7);
    // ride card 700 for 10
    await page.click('#add-pass');
    await setPass(page, 1, '10-ride card', '700', 'rides', '10');
    ok('card wins: 38 x 70 = 2,660', (await verdict(page)) === 'Buying the 10-ride card would save 380', await verdict(page));
    ok('card line', (await txt(page, '#sum-body .opt-line.best')).includes('38 rides on it at 70 a ride = 2,660, saves 380 (4 cards, 2 rides left for later)'));

    // looking ahead
    const aheadT = await txt(page, '#ahead-body');
    ok('buy today: monthly on the 30th', aheadT.includes('no more travel days before it ends'), aheadT);
    ok('buy today: card', aheadT.includes('Worth it if you use all 10 rides: they would cost 800 paying per ride, so it saves 100. It pays for itself at the 9th ride.'));
    ok('November plan', aheadT.includes('Buy the 10-ride card for November: saves about 420') && aheadT.includes('21 travel days × 2 rides = 42 rides.'), aheadT);
    ok('days off label names next month', (await txt(page, '#l-off')) === 'Days you will not travel in November');
    await page.fill('#p-off', '3'); await page.press('#p-off', 'Tab');
    ok('days off lowers rides', (await txt(page, '#ahead-body')).includes('18 travel days × 2 rides = 36 rides. (3 days off taken away)') || (await txt(page, '#ahead-body')).includes('18 travel days × 2 rides = 36 rides (3 days off taken away).'));
    await page.fill('#p-off', '40'); await page.press('#p-off', 'Tab');
    ok('days off 40 refused', (await txt(page, '#e-off')).includes('0 to 31'));
    await page.fill('#p-off', ''); await page.press('#p-off', 'Tab');
    ok('blank days off = 0', (await txt(page, '#ahead-body')).includes('21 travel days'));
    await page.click('#quick-per .chip[data-v="1"]');
    ok('one ride a day: monthly pass 1,320 more', (await txt(page, '#ahead-body')).includes('Monthly pass: 1 pass = 3,000, 1,320 more'), await txt(page, '#ahead-body'));
    await page.click('#quick-per .chip[data-v="2"]');
    await page.fill('#p-per', '0'); await page.press('#p-per', 'Tab');
    ok('0 rides a day refused', (await txt(page, '#e-per')).includes('1 to 20'));
    await page.fill('#p-per', '2'); await page.press('#p-per', 'Tab');
    ok('last 4 weeks line', (await txt(page, '#recent')).startsWith('Your last 4 weeks: 34 rides on 17 days'), await txt(page, '#recent'));
    // untick every day
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) await page.locator('#wd label', { hasText: d }).locator('input').uncheck();
    ok('no usual days: asks to tick', (await txt(page, '#ahead-body')).includes('Tick at least one day'));
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) await page.locator('#wd label', { hasText: d }).locator('input').check();

    // ================= logging: undo, more rides, edit, delete =================
    await page.click('#add1');
    ok('one way added', (await txt(page, '#log-msg')).startsWith('Added 1 ride on Fri 30 Oct (80)'));
    ok('today shows 3 rides', (await txt(page, '#l-day')).includes('3 rides logged'), await txt(page, '#l-day'));
    await page.locator('#log-msg .undo').click();
    ok('undo one way', (await txt(page, '#l-day')).includes('2 rides logged'));
    await page.click('#o-more');
    ok('more rides shown, link hidden', await visible(page, '#w-more') && !(await visible(page, '#o-more')));
    await page.fill('#l-n', '0'); await page.click('#add-n');
    ok('0 rides refused', (await txt(page, '#e-n')).includes('1 to 50'));
    await page.fill('#l-n', ''); await page.click('#add-n');
    ok('blank rides refused', (await txt(page, '#e-n')).length > 0);
    await page.fill('#l-n', '3'); await page.press('#l-n', 'Enter');
    ok('3 rides added with Enter', (await txt(page, '#l-day')).includes('5 rides logged'));
    await page.locator('#log-msg .undo').click();
    // future day
    await page.click('#d-prev');
    ok('day before', (await txt(page, '#l-day')).startsWith('Thu 29 Oct (yesterday)'));
    await page.fill('#l-date', '2026-11-05'); await page.dispatchEvent('#l-date', 'change');
    ok('future day refused', (await txt(page, '#e-date')).includes('has not come yet'));
    await page.fill('#l-date', '2026-10-30'); await page.dispatchEvent('#l-date', 'change');
    ok('next disabled on today', await page.locator('#d-next').isDisabled());
    // minus / plus / edit / delete on today's rides
    const todayBox = () => page.locator('#days > li', { hasText: 'Fri 30 Oct (today)' });
    await todayBox().locator('button', { hasText: '+' }).click();
    ok('plus', (await todayBox().innerText()).includes('3 rides'));
    await todayBox().locator('button', { hasText: '−' }).click();
    ok('minus', (await todayBox().innerText()).includes('2 rides × 80'));
    await todayBox().locator('button', { hasText: 'Edit' }).click();
    ok('edit focuses rides', await page.evaluate(() => document.activeElement.classList.contains('e-n')));
    await page.keyboard.press('Escape');
    ok('Escape cancels edit', (await todayBox().locator('.e-n').count()) === 0);
    await todayBox().locator('button', { hasText: 'Edit' }).click();
    await todayBox().locator('.e-p').fill('-1'); await todayBox().locator('button', { hasText: 'Save' }).click();
    ok('edit: bad price refused', (await todayBox().locator('.err').innerText()).includes('0 or more'));
    await todayBox().locator('.e-p').fill('90'); await todayBox().locator('button', { hasText: 'Save' }).click();
    ok('edit: fare rise on one day', (await todayBox().innerText()).includes('2 rides × 90 = 180'));
    ok('edit changes the month total', (await head(page)) === 'October so far: 38 rides, 3,060 paying per ride', await head(page));
    await page.locator('#list-msg .undo').click();
    await todayBox().locator('button', { hasText: 'Delete' }).click();
    ok('delete day', (await head(page)).startsWith('October so far: 36 rides'));
    await page.locator('#list-msg .undo').click();
    ok('undo delete', (await head(page)).startsWith('October so far: 38 rides'));

    // ================= I bought this pass =================
    const monthly = page.locator('#passes > li').first();
    await monthly.locator('.buy-btn').click();
    await monthly.locator('.b-date').fill('2026-10-01'); await monthly.locator('.b-date').dispatchEvent('input');
    ok('bought: covers hint', (await monthly.locator('.buy-form .hint').innerText()) === 'Covers Thu 1 Oct to Sat 31 Oct.');
    await monthly.locator('.buy-form button', { hasText: 'Save' }).click();
    const mine = await txt(page, '#mine-list');
    ok('bought: in use and paid for itself', mine.includes('In use') && mine.includes('Already paid for itself: 40 saved so far'), mine);
    ok('rides marked on the pass', (await todayBox().innerText()).includes('On Monthly pass'));
    ok('spent line', (await txt(page, '#sum-body .spent')) === 'You spent 3,000 this month: 3,000 on passes bought this month + 0 on rides not on a pass.', await txt(page, '#sum-body .spent'));
    // lost card: bought again
    await monthly.locator('.buy-btn').click(); await monthly.locator('.b-date').fill('2026-10-20'); await monthly.locator('.buy-form button', { hasText: 'Save' }).click();
    ok('lost card: spent twice', (await txt(page, '#sum-body .spent')).startsWith('You spent 6,000'));
    await page.locator('#mine-list > li').first().locator('button', { hasText: 'Delete' }).click();
    ok('delete bought pass', (await page.locator('#mine-list > li').count()) === 1);
    await page.locator('#mine-msg .undo').click();
    ok('undo bought delete', (await page.locator('#mine-list > li').count()) === 2);
    await page.locator('#mine-list > li').first().locator('button', { hasText: 'Delete' }).click();

    // ================= second fare: peak / off-peak =================
    await page.click('#add-fare');
    ok('new fare name focused', await page.evaluate(() => document.activeElement.classList.contains('f-name')));
    await setFare(page, 1, 'Bus to gym', '50');
    ok('two fares: "Which ride?" shown', await visible(page, '#w-fare'));
    ok('two fares: covers shown', await visible(page, '#passes .covers'));
    await page.selectOption('#l-fare', { label: 'Bus to gym · 50' });
    await page.click('#add2');
    ok('bus rides logged', (await todayBox().innerText()).includes('Bus to gym: 2 rides × 50 = 100'));
    await page.locator('#passes > li').first().locator('.covers label', { hasText: 'Bus to gym' }).locator('input').uncheck();
    ok('monthly pass does not cover the bus', !(await todayBox().innerText()).match(/Bus to gym[^\n]*\n[^\n]*On Monthly/));
    ok('spent counts the bus', (await txt(page, '#sum-body .spent')).includes('100 on rides not on a pass'), await txt(page, '#sum-body .spent'));
    // a price change keeps old rides
    await setFare(page, 0, 'Metro', '90');
    ok('fare rise message', (await txt(page, '#setup-msg')).includes('Rides already logged keep 80'));
    ok('old rides keep 80', (await todayBox().innerText()).includes('Metro: 2 rides × 80'));
    await page.locator('#fares > li').nth(1).locator('button', { hasText: 'Delete this fare' }).click();
    ok('delete fare: one left, select hidden', !(await visible(page, '#w-fare')));
    await page.locator('#setup-msg .undo').click();
    ok('undo fare delete', await visible(page, '#w-fare'));

    // ================= currency, reload, share =================
    await page.selectOption('#s-cur', 'Rs');
    ok('currency shown', (await head(page)).includes('Rs '), await head(page));
    await page.reload(); await page.waitForTimeout(200);
    ok('reload keeps rides and currency', (await head(page)).startsWith('October so far: 40 rides, Rs 3,140'), await head(page));
    ok('reload keeps bought pass', (await page.locator('#mine-list > li').count()) === 1);
    await page.click('#copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy summary', clip.startsWith('Commute costs: October 2026\nOctober so far: 40 rides, Rs 3,140 paying per ride.'), clip);
    const mail = await page.getAttribute('#mail', 'href');
    ok('email works with no address', mail.startsWith('mailto:?subject=My%20commute%20costs'));
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok('CSV', csv.startsWith('Date,Ride,Rides,Price per ride,Total,On a pass\n2026-10-01,Metro,2,80.00,160.00,2 on Monthly pass'), csv.slice(0, 200));
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupPath = await dl.path();
    // month navigation
    await page.click('#m-prev');
    ok('September is empty', (await head(page)) === 'No rides logged in September', await head(page));
    ok('back to this month shown', await visible(page, '#to-now'));
    await page.click('#to-now');
    ok('next month disabled', await page.locator('#m-next').isDisabled());
    // delete everything, undo, restore
    await page.click('#wipe');
    ok('wiped', (await head(page)) === 'Start by typing what one ride costs');
    await page.locator('#set-msg .undo').click();
    ok('undo wipe', (await head(page)).startsWith('October so far: 40 rides'));
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await page.waitForTimeout(200);
    ok('bad backup refused', (await txt(page, '#set-msg')).includes('not a backup'));
    await page.setInputFiles('#restore-file', backupPath);
    await page.waitForTimeout(200);
    ok('backup restored', (await head(page)).startsWith('October so far: 40 rides, Rs 3,140'), await head(page));
    // fill in: errors
    await page.fill('#g-from', '2026-10-10'); await page.fill('#g-to', '2026-10-01'); await page.click('#g-go');
    ok('fill: reversed dates', (await txt(page, '#e-fill')).includes('Swap'));
    await page.fill('#g-from', '2026-10-01'); await page.fill('#g-to', '2026-10-29'); await page.click('#g-go');
    ok('fill: days already logged are not doubled', (await txt(page, '#fill-msg')).includes('12 Oct') || (await txt(page, '#fill-msg')).includes('Added 6 rides on 3 days') , await txt(page, '#fill-msg'));
    await page.fill('#g-to', '2026-11-29'); await page.click('#g-go');
    ok('fill: future refused', (await txt(page, '#e-fill')).includes('after today'));
    ok('no errors so far', errors.length === 0, errors);
    await ctx.close();

    // ================= saved data problems and midnight =================
    ({ ctx, page } = await newPage({}, `try { localStorage.setItem('${KEY}', '{broken'); } catch (e) {}`));
    ok('corrupt data: fresh start with a note', (await head(page)) === 'Start by typing what one ride costs' && (await txt(page, '#set-msg')).includes('could not be read'));
    await ctx.close();
    ({ ctx, page } = await newPage({}, `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });`));
    ok('storage blocked: warning', await visible(page, '#storage-warn'));
    await ctx.close();
    ({ ctx, page } = await newPage());
    await setFare(page, 0, 'Metro', '80');
    await page.clock.runFor(14 * 3600 * 1000 + 60000);   // to 00:01 on Sat 31 Oct
    ok('midnight: log day moves on', (await txt(page, '#l-day')).startsWith('Sat 31 Oct (today)'), await txt(page, '#l-day'));
    await ctx.close();
    errors.length = 0;

    // ================= help, layout, theme =================
    const stateJson = await (async () => { const { ctx, page } = await newPage(); await ayesha(page); await page.click('#add-pass'); await setPass(page, 1, '10-ride card', '700', 'rides', '10'); const s = await page.evaluate(k => localStorage.getItem(k), KEY); await ctx.close(); return s; })();
    const init = `try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('${KEY}', ${JSON.stringify(stateJson)}); sessionStorage.setItem('seeded', '1'); } } catch (e) {}`;
    for (const w of [320, 390, 820, 1280]) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 800 } }, init));
        await page.click('.help-btn, button:has-text("Help")');
        const box = await page.locator('dialog').boundingBox();
        ok('help fits at ' + w, box && box.x >= 0 && box.x + box.width <= w + 1 && box.y >= 0, box);
        ok('help title at ' + w, (await page.locator('dialog').innerText()).includes('How to use Commute Pass or Pay Per Ride Tracker'));
        await page.keyboard.press('Escape'); await page.waitForTimeout(100);
        ok('Escape closes help at ' + w, !(await page.locator('dialog[open]').count()));
        await page.click('.help-btn, button:has-text("Help")');
        await page.click('dialog button:has-text("Got it")'); await page.waitForTimeout(100);
        ok('Got it closes help at ' + w, !(await page.locator('dialog[open]').count()));
        const bar = await page.evaluate(() => [...document.querySelectorAll('.topbar a, .topbar button')].map(e => e.getBoundingClientRect()).map(r => [r.left, r.right, r.top, r.bottom]));
        let over = false; for (let i = 0; i < bar.length; i++) for (let j = i + 1; j < bar.length; j++) { const a = bar[i], b = bar[j]; if (a[0] < b[1] - 1 && b[0] < a[1] - 1 && a[2] < b[3] - 1 && b[2] < a[3] - 1) over = true; }
        ok('top bar buttons do not overlap at ' + w, !over);
        await ctx.close();
    }
    // every width, dark and light, filled and cleared
    for (const scheme of ['dark', 'light']) {
        ({ ctx, page } = await newPage({ colorScheme: scheme }, init));
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await page.setViewportSize({ width: w, height: 900 });
            for (const mode of ['filled', 'open']) {
                if (mode === 'open') {   // reveal every optional field
                    if (await visible(page, '#o-more')) await page.click('#o-more');
                    if (!(await visible(page, '#passes .buy-form'))) await page.locator('#passes .buy-btn').first().click();
                    if (!(await page.locator('#days .e-n').count())) await page.locator('#days button:has-text("Edit")').first().click();
                }
                const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
                ok(scheme + ' ' + w + ' ' + mode + ': no sideways scroll', noScroll);
                const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).length);
                ok(scheme + ' ' + w + ' ' + mode + ': nothing sticks out', out === 0, out);
                if (w <= 390) {
                    const hit = await page.evaluate(() => {
                        const els = [...document.querySelectorAll('main input:not([type=checkbox]):not([type=file]), main select, main button')].filter(e => e.offsetParent).map(e => [e, e.getBoundingClientRect()]);
                        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i][1], b = els[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1 && !els[i][0].contains(els[j][0])) return (els[i][0].id || els[i][0].className) + ' / ' + (els[j][0].id || els[j][0].className); }
                        const ph = [...document.querySelectorAll('main input[placeholder]')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map(e => e.id);
                        return ph.length ? 'placeholder cut: ' + ph.join() : null;
                    });
                    ok(scheme + ' ' + w + ' ' + mode + ': controls do not overlap', !hit, hit);
                }
                if (w >= 900) {
                    for (const at of ['top', 'middle', 'bottom']) {
                        await page.evaluate(a => window.scrollTo(0, a === 'top' ? 0 : a === 'middle' ? document.body.scrollHeight / 2 : document.body.scrollHeight), at);
                        const ov = await page.evaluate(() => {
                            const groups = [document.querySelector('main'), ...document.querySelectorAll('.col-main, .col-side')];
                            for (const g of groups) { const kids = [...g.children].filter(e => e.offsetParent).map(e => e.getBoundingClientRect());
                                for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], b = kids[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) return true; } }
                            return false; });
                        ok(scheme + ' ' + w + ' scroll ' + at + ': no overlapping blocks', !ov);
                    }
                }
            }
            if (await page.locator('#days .e-n').count()) await page.locator('#days button:has-text("Cancel")').click();
        }
        // cleared state
        await page.click('#wipe');
        for (const w of [320, 390, 1280]) { await page.setViewportSize({ width: w, height: 900 }); ok(scheme + ' ' + w + ' cleared: no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
        await ctx.close();
    }
    // light / dark switch
    ({ ctx, page } = await newPage({ colorScheme: 'dark' }));
    await page.click('.theme-toggle');
    ok('switch to light', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    ok('light accent', bg === '#0b7a70', bg);
    await page.reload();
    ok('theme remembered', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
    await ctx.close();

    // ================= screenshots =================
    if (SHOTS) {
        for (const [name, vp] of [['desktop', { width: 1280, height: 1000 }], ['phone', { width: 390, height: 844, deviceScaleFactor: 2 }]]) {
            ({ ctx, page } = await newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor || 1, colorScheme: 'dark' }, init));
            await page.locator('#passes > li').first().locator('.buy-btn').click(); await page.locator('#passes > li').first().locator('.b-date').fill('2026-10-01');
            await page.locator('#passes > li').first().locator('.buy-form button', { hasText: 'Save' }).click();
            await page.evaluate(() => { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.classList.remove('show'); }); window.scrollTo(0, 0); });
            await page.screenshot({ path: path.join(__dirname, 'screenshots', name + '.png'), fullPage: name === 'desktop' ? false : false, clip: name === 'desktop' ? { x: 0, y: 0, width: 1280, height: 1000 } : undefined });
            await ctx.close();
        }
    }

    // files the page asked for
    const need = ['style.css', 'core.js', 'script.js'].map(f => URL + f).concat([base + '/help.js', base + '/theme.js']);
    need.forEach(u => ok('requested ' + u.replace(base, ''), requested.has(u)));
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'sw.js', 'screenshots/desktop.png', 'screenshots/phone.png']) { const r = await fetch(URL + f); ok(f + ' is served', r.status === 200, r.status); }
    ok('no failed requests', failed.length === 0, failed);
    ok('no console errors', errors.length === 0, errors);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
