// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Sun 25 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'laundry-and-dry-cleaning-clothes-count-log', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-25T10:00:00+05:00');
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
    async function newPage(opts, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark', locale: 'en-GB' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        if (init) await page.addInitScript(init);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).first().innerText();
    const kind = (page, name) => page.locator('#kinds .kind').filter({ has: page.locator('label.kind-name', { hasText: new RegExp('^' + name + '$') }) });
    async function count(page, name, n) { const k = kind(page, name); await k.locator('.step-in').fill(String(n)); }
    async function price(page, name, p) { await kind(page, name).locator('.kind-price input').fill(String(p)); }
    const batch = (page, i) => page.locator('#batches > li.batch').nth(i);
    const batchBy = (page, title) => page.locator('#batches > li.batch').filter({ has: page.locator('.b-title', { hasText: title }) });
    async function plusBack(page, b, kindName, times) {
        const row = b.locator('.b-row').filter({ has: page.locator('.b-kind', { hasText: new RegExp('^' + kindName + ' ×') }) });
        for (let i = 0; i < times; i++) await row.locator('button[aria-label^="One more"]').click();
    }
    const clip = page => page.evaluate(() => navigator.clipboard.readText());
    const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

    // ---------- first use ----------
    let { ctx, page } = await newPage();
    ok('first use: shop name asked, no picker', await page.locator('#f-shop-name').isVisible() && !(await page.locator('#f-shop').isVisible()));
    ok('first use: no totals or list yet', !(await page.locator('#summary').isVisible()) && !(await page.locator('#list').isVisible()));
    ok('first use: restore link shown', await page.locator('#restore-first').isVisible());
    ok('first use: optional boxes hidden', !(await page.locator('#f-extra-box').isVisible()) && !(await page.locator('#f-note-box').isVisible()));
    ok('first use: 8 kinds shown', await page.locator('#kinds .kind').count() === 8);
    ok('first use: preview prompt', /Tap \+ next to each kind/.test(await txt(page, '#f-preview')));
    ok('day given defaults to today', await page.locator('#f-date').inputValue() === '2026-10-25');
    // empty save
    await page.click('#f-save');
    ok('empty save: shop error', /Type the name of the shop/.test(await txt(page, '#f-shop-name-err')));
    ok('empty save: pieces error', /Count at least one piece/.test(await txt(page, '#f-lines-err')));
    ok('empty save: nothing stored', await page.evaluate(k => localStorage.getItem(k), KEY) === null);

    // ---------- the main situation: 14 pieces to City Laundry on Tue 20 Oct ----------
    await page.fill('#f-shop-name', '  City   Laundry ');
    await page.fill('#f-date', '2026-10-27');
    for (let i = 0; i < 5; i++) await kind(page, 'Shirt').locator('button[aria-label="One more Shirt"]').click();
    ok('plus taps count 5', await kind(page, 'Shirt').locator('.step-in').inputValue() === '5');
    ok('price box appears once counted', await kind(page, 'Shirt').locator('.kind-price input').isVisible());
    ok('no price yet: says so', /price not set for 5 pieces/.test(await txt(page, '#f-preview')));
    await price(page, 'Shirt', '40');
    ok('line sum', (await kind(page, 'Shirt').locator('.kind-sum').innerText()) === '= 200');
    await count(page, 'Trousers or jeans', ' 3 pcs'); await price(page, 'Trousers or jeans', '50');
    await count(page, 'Shalwar kameez', '4'); await price(page, 'Shalwar kameez', '120');
    await count(page, 'Bedsheet', '2'); await price(page, 'Bedsheet', '80');
    await page.click('#f-extra-open'); await page.fill('#f-extra-label', 'Express'); await page.fill('#f-extra', '250');
    ok('preview 14 pieces bill 1,240', (await txt(page, '#f-preview')) === '14 pieces · Bill 1,240', await txt(page, '#f-preview'));
    await page.click('#f-save');
    ok('future day refused', /cannot be after today/.test(await txt(page, '#f-date-err')));
    await page.fill('#f-date', '2026-10-20');
    await page.click('#f-save');
    ok('saved message with undo', /Saved: 14 pieces to City Laundry, bill 1,240\./.test(await txt(page, '#add-msg')) && await page.locator('#add-msg .undo').isVisible(), await txt(page, '#add-msg'));
    ok('form reset after save', await kind(page, 'Shirt').locator('.step-in').inputValue() === '0' && !(await page.locator('#f-extra-box').isVisible()));
    ok('picker shown with the shop', await page.locator('#f-shop').isVisible() && (await page.locator('#f-shop option:checked').innerText()) === 'City Laundry');
    let b0 = batch(page, 0);
    ok('batch title', (await b0.locator('.b-title').innerText()) === 'Tue 20 Oct · City Laundry', await b0.locator('.b-title').innerText());
    ok('batch status 14 out 5 days', (await b0.locator('.tag').innerText()) === '14 pieces still with the laundry (5 days)', await b0.locator('.tag').innerText());
    ok('batch bill', /Bill 1,240 · Paid 0/.test(await b0.locator('.b-money').innerText()) && (await b0.locator('.b-topay').innerText()) === 'To pay: 1,240');
    ok('extra shown', /Express 250/.test(await b0.locator('.b-bill').innerText()));
    // pieces come back
    await plusBack(page, b0, 'Trousers or jeans', 3); await plusBack(page, b0, 'Shalwar kameez', 4); await plusBack(page, b0, 'Bedsheet', 2); await plusBack(page, b0, 'Shirt', 3);
    b0 = batch(page, 0);
    ok('2 still out', (await b0.locator('.tag').innerText()) === '2 pieces still with the laundry (5 days)', await b0.locator('.tag').innerText());
    ok('which ones', (await b0.locator('.b-out').innerText()) === 'Not back yet: Shirt × 2');
    ok('back count in line', /14 pieces given · 12 back/.test(await b0.locator('.b-line').innerText()));
    ok('back + is capped', await b0.locator('.b-row').nth(1).locator('button[aria-label^="One more"]').isDisabled());
    ok('tile: 2 at the laundry', (await txt(page, '#tile-out-n')) === '2' && /2 pieces in 1 batch/.test(await txt(page, '#tile-out-s')));
    ok('tile: to pay 1,240', (await txt(page, '#tile-pay-n')) === '1,240');
    ok('message after tick, with undo', /Shirt: 3 of 5 back\./.test(await b0.locator('.msg').innerText()));
    // keyboard: focus stays on the + after a tap
    const shirtPlus = b0.locator('.b-row').first().locator('button[aria-label^="One more"]');
    await shirtPlus.focus(); await page.keyboard.press('Enter');
    ok('keyboard + works and keeps focus', /4 of 5/.test(await batch(page, 0).locator('.msg').innerText()) && await page.evaluate(() => /-plus$/.test(document.activeElement.id)));
    await batch(page, 0).locator('.b-row').first().locator('button[aria-label^="One less"]').click();
    // payment
    await batch(page, 0).locator('button', { hasText: 'Record a payment' }).click();
    ok('payment prefilled with what is left', await page.locator('#p-amt').inputValue() === '1240');
    await page.fill('#p-amt', '2000'); await page.click('.panel >> text=Save payment');
    ok('overpay refused', /more than the 1,240 still to pay/.test(await txt(page, '#p-amt-err')));
    await page.fill('#p-amt', '-5'); await page.click('.panel >> text=Save payment');
    ok('minus refused', /minus/.test(await txt(page, '#p-amt-err')));
    await page.fill('#p-amt', '1,000'); await page.click('.panel >> text=Save payment');
    b0 = batch(page, 0);
    ok('part payment', (await b0.locator('.b-topay').innerText()) === 'To pay: 240' && /Paid 1,000 on 25 Oct/.test(await b0.locator('.pays').innerText()));
    ok('payment message', /Payment of 1,000 saved\. To pay: 240\./.test(await b0.locator('.msg').innerText()));

    // ---------- reload: everything kept, prices remembered ----------
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps batch', (await batch(page, 0).locator('.tag').innerText()) === '2 pieces still with the laundry (5 days)');
    ok('reload keeps payment', (await batch(page, 0).locator('.b-topay').innerText()) === 'To pay: 240');
    await kind(page, 'Shirt').locator('button[aria-label="One more Shirt"]').click();
    ok('price remembered for the shop', await kind(page, 'Shirt').locator('.kind-price input').inputValue() === '40');
    await count(page, 'Bedsheet', '2');
    ok('typed count also gets the remembered price', await kind(page, 'Bedsheet').locator('.kind-price input').inputValue() === '80');
    await count(page, 'Bedsheet', '0');
    await page.check('input[name=svc][value=iron]', { force: true });
    ok('ironing has its own price list', await kind(page, 'Shirt').locator('.kind-price input').inputValue() === '');
    await price(page, 'Shirt', '12.50'); await count(page, 'Shirt', '3');
    ok('odd cents 3 × 12.50', (await kind(page, 'Shirt').locator('.kind-sum').innerText()) === '= 37.50');
    await count(page, 'Shirt', 'abc');
    ok('typed words marked', await kind(page, 'Shirt').locator('.step-in').getAttribute('aria-invalid') === 'true');
    await page.click('#f-save');
    ok('typed words refused on save', /mistyped/.test(await txt(page, '#f-lines-err')));
    await count(page, 'Shirt', '1000');
    ok('huge count marked', await kind(page, 'Shirt').locator('.step-in').getAttribute('aria-invalid') === 'true');
    await count(page, 'Shirt', '0');
    ok('zero removes the price row', await kind(page, 'Shirt').locator('.kind-price').count() === 0);
    await page.check('input[name=svc][value=wash]', { force: true });

    // ---------- a second shop, dry cleaning, more kinds ----------
    await page.selectOption('#f-shop', '+new');
    ok('new shop name box', await page.locator('#f-shop-name').isVisible());
    await page.fill('#f-shop-name', 'city laundry');
    await count(page, 'Towel', '1'); await page.click('#f-save');
    ok('duplicate shop refused', /already have "City Laundry"/.test(await txt(page, '#f-shop-name-err')));
    await count(page, 'Towel', '0');
    await page.fill('#f-shop-name', 'Star Dry Cleaners');
    await page.check('input[name=svc][value=dry]', { force: true });
    await page.click('#f-more');
    ok('more kinds shown', await page.locator('#kinds .kind').count() === 17 && !(await page.locator('#f-more').isVisible()));
    await count(page, 'Suit', '1'); await price(page, 'Suit', '600');
    await page.click('#f-kind-open'); await page.fill('#f-kind', 'Abaya'); await page.click('#f-kind-add');
    ok('own kind added with 1 piece', await kind(page, 'Abaya').locator('.step-in').inputValue() === '1');
    await price(page, 'Abaya', '350');
    await page.click('#f-note-open'); await page.fill('#f-note', 'Slip 4512 <b>x</b>');
    await page.fill('#f-date', '2026-10-23');
    ok('preview 2 pieces 950', (await txt(page, '#f-preview')) === '2 pieces · Bill 950');
    await page.click('#f-save');
    let sb = batchBy(page, 'Star Dry Cleaners');
    ok('second batch saved, newest first', (await batch(page, 0).locator('.b-title').innerText()) === 'Fri 23 Oct · Star Dry Cleaners');
    ok('note shown as text', (await sb.locator('.b-note').innerText()) === 'Slip 4512 <b>x</b>');
    ok('dry cleaning label', /^Dry cleaning · 2 pieces given/.test(await sb.locator('.b-line').innerText()));
    await sb.locator('button', { hasText: 'All back' }).click();
    sb = batchBy(page, 'Star Dry Cleaners');
    ok('all back today', (await sb.locator('.tag').innerText()) === 'All back on 25 Oct');
    ok('own kind kept for next time', (await stored(page)).kinds.includes('Abaya'));
    await sb.locator('button', { hasText: 'Record a payment' }).click(); await page.click('.panel >> text=Save payment');
    ok('paid in full', (await batchBy(page, 'Star Dry Cleaners').locator('.b-topay').innerText()) === 'Paid in full');
    ok('no pay button when paid', await batchBy(page, 'Star Dry Cleaners').locator('button', { hasText: 'Record a payment' }).count() === 0);

    // ---------- month box ----------
    ok('month name', (await txt(page, '#mo-h')) === 'October 2026');
    const rows = await page.locator('.mo-shop').allInnerTexts();
    ok('month rows per shop', rows.length === 2 && /City Laundry/.test(rows[0]) && /1 batch, 14 pieces · Bill 1,240 · Paid 1,000/.test(rows[0]) && /To pay: 240/.test(rows[0]) && /Paid in full/.test(rows[1]), rows);
    ok('month total for 2 shops', /All shops in October 2026: 16 pieces, bill 2,190\. To pay: 240\./.test(await txt(page, '#mo-tot')), await txt(page, '#mo-tot'));
    await page.locator('.mo-shop').first().locator('button', { hasText: 'Copy month bill' }).click();
    const mtext = await clip(page);
    ok('copied month bill', /^City Laundry: October 2026\n20 Oct \(Wash and iron\): 14 pieces, 1,240 \(2 not back yet\)\nTotal: 14 pieces, bill 1,240, paid 1,000\nTo pay: 240$/.test(mtext), mtext);
    ok('copy confirmed', /Copied/.test(await txt(page, '#sum-msg')));
    ok('previous month disabled at first month', await page.locator('#mo-prev').isDisabled() && await page.locator('#mo-next').isDisabled());

    // ---------- shop ready time ----------
    const cityShop = page.locator('.shop').filter({ has: page.locator('.shop-name', { hasText: 'City Laundry' }) });
    ok('shop line', /1 batch · To pay: 240/.test(await cityShop.innerText()) && /Ready time not set · prices remembered for 4 kinds/.test(await cityShop.innerText()), await cityShop.innerText());
    await cityShop.locator('button', { hasText: 'Edit' }).click();
    await page.selectOption('#s-ready', 'o'); await page.fill('#s-ready-o', '99'); await page.click('.shop .panel >> text=Save');
    ok('ready days limit', /from 1 to 60/.test(await txt(page, '#s-ready-o-err')));
    await page.selectOption('#s-ready', '3'); await page.click('.shop .panel >> text=Save');
    let cb = batchBy(page, 'City Laundry');
    ok('late after 3 days', (await cb.locator('.tag').innerText()) === '2 pieces still with the laundry (5 days), 2 days late' && /st-late/.test(await cb.getAttribute('class')));

    // ---------- lost or damaged, then undo ----------
    await cb.locator('button', { hasText: 'Lost or damaged' }).click();
    await page.locator('.lost-row').first().locator('button[aria-label^="One more"]').click();
    await page.fill('#l-amt', '500'); await page.fill('#l-note', 'Blue shirt lost');
    await page.click('.batch .panel >> text=Save');
    cb = batchBy(page, 'City Laundry');
    ok('lost shirt not charged, 500 off', /Bill 700 · Paid 1,000/.test(await cb.locator('.b-money').innerText()), await cb.locator('.b-money').innerText());
    ok('shop owes you 300', (await cb.locator('.b-topay').innerText()) === 'The shop owes you 300');
    ok('1 still out after lost', /^1 piece still with the laundry/.test(await cb.locator('.tag').innerText()));
    ok('tile shows shop owes', /A shop owes you 300/.test(await txt(page, '#tile-pay-s')), await txt(page, '#tile-pay-s'));
    await cb.locator('.msg .undo').click();
    cb = batchBy(page, 'City Laundry');
    ok('undo lost', (await cb.locator('.b-topay').innerText()) === 'To pay: 240' && !(await cb.locator('.b-note').count()));

    // ---------- edit keeps ticks ----------
    await cb.locator('button', { hasText: 'Edit' }).click();
    ok('edit loads the batch', (await txt(page, '#add-h')) === 'Change the batch of Tue 20 Oct' && await kind(page, 'Shirt').locator('.step-in').inputValue() === '5' && await page.locator('#f-extra').inputValue() === '250');
    await count(page, 'Shirt', '6'); await page.click('#f-save');
    cb = batchBy(page, 'City Laundry');
    ok('edit: bill up by 40, ticks kept', /Bill 1,280/.test(await cb.locator('.b-money').innerText()) && /15 pieces given · 12 back/.test(await cb.locator('.b-line').innerText()), await cb.innerText());
    ok('edit message', /Changed: 15 pieces to City Laundry, bill 1,280\./.test(await txt(page, '#add-msg')));
    await cb.locator('button', { hasText: 'Edit' }).click(); await page.click('#f-cancel');
    ok('cancel edit resets form', (await txt(page, '#add-h')) === 'Give clothes to the laundry');

    // ---------- filters ----------
    await page.check('input[name=filter][value=out]', { force: true });
    ok('filter at the laundry', await page.locator('#batches > li').count() === 1 && (await txt(page, '#cnt-out')) === '1');
    await page.check('input[name=filter][value=unpaid]', { force: true });
    ok('filter not paid', await page.locator('#batches > li').count() === 1);
    await page.click('#tile-out'); ok('tile filters', await page.locator('input[name=filter][value=out]').isChecked());
    await page.click('#tile-out'); ok('tile again shows all', await page.locator('input[name=filter][value=all]').isChecked() && await page.locator('#batches > li').count() === 2);

    // ---------- copy one batch ----------
    await batchBy(page, 'City Laundry').locator('button', { hasText: 'Copy the list' }).click();
    const btext = await clip(page);
    ok('batch list text', btext.startsWith('City Laundry: clothes given on Tue, 20 Oct 2026 (Wash and iron)\nShirt × 6 at 40 = 240') && /Express: 250/.test(btext) && /Still with the laundry: Shirt × 3/.test(btext) && /To pay: 280$/.test(btext), btext);

    // ---------- currency ----------
    await page.selectOption('#cur', 'Rs');
    ok('currency on amounts', (await batchBy(page, 'City Laundry').locator('.b-topay').innerText()) === 'To pay: Rs 280' && (await txt(page, '#tile-pay-n')) === 'Rs 280');
    await page.reload({ waitUntil: 'networkidle' });
    ok('currency remembered', await page.locator('#cur').inputValue() === 'Rs');

    // ---------- delete with undo ----------
    await batchBy(page, 'Star Dry Cleaners').locator('button.secondary.del').click();
    ok('deleted', await page.locator('#batches > li').count() === 1 && /Deleted the batch of Fri 23 Oct/.test(await txt(page, '#list-msg')));
    await page.click('#list-msg .undo');
    ok('undo delete', await page.locator('#batches > li').count() === 2);

    // ---------- backup and restore ----------
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const file = path.join(os.tmpdir(), SLUG + '-test.json'); await dl.saveAs(file);
    ok('backup name', /^laundry-and-dry-cleaning-clothes-count-log-2026-10-25\.json$/.test(dl.suggestedFilename()));
    await page.click('#del-all');
    ok('delete everything', !(await page.locator('#list').isVisible()) && await page.locator('#f-shop-name').isVisible());
    await page.click('#tools-msg .undo');
    ok('undo delete everything', await page.locator('#batches > li').count() === 2);
    await page.click('#del-all');
    const bad = path.join(os.tmpdir(), SLUG + '-bad.json'); fs.writeFileSync(bad, '{"hello":1}');
    await page.setInputFiles('#restore-file', bad);
    await page.waitForFunction(() => /backup/.test(document.getElementById('tools-msg').textContent), null, { timeout: 5000 }).catch(() => {});
    ok('bad backup refused', /not a backup from this app/.test(await txt(page, '#tools-msg')));
    await page.setInputFiles('#restore-file', file);
    await page.waitForFunction(() => /restored/.test(document.getElementById('tools-msg').textContent), null, { timeout: 5000 }).catch(() => {});
    ok('backup restored', /Backup restored: 2 shops, 2 batches\./.test(await txt(page, '#tools-msg')) && await page.locator('#batches > li').count() === 2);
    ok('restored shop picker', (await page.locator('#f-shop option').allInnerTexts()).join('|') === 'City Laundry|Star Dry Cleaners|+ A new shop…');

    // ---------- delete a shop with its batches ----------
    await page.locator('.shop').filter({ hasText: 'Star Dry Cleaners' }).locator('button', { hasText: 'Delete' }).click();
    ok('shop deleted with its batch', /Deleted Star Dry Cleaners and its 1 batch\./.test(await txt(page, '#shops-msg')) && await page.locator('#batches > li').count() === 1);
    await page.click('#shops-msg .undo');
    ok('undo shop delete', await page.locator('#batches > li').count() === 2 && await page.locator('#f-shop option').count() === 3);

    // ---------- light/dark switch ----------
    const tog = page.locator('.theme-toggle');
    if (await tog.count()) { const before = await page.evaluate(() => getComputedStyle(document.body).color); await tog.click(); const after = await page.evaluate(() => getComputedStyle(document.body).color); ok('theme switch changes colours', before !== after); await tog.click(); }
    else ok('theme switch present', false);

    // ---------- small screens: nothing overlaps with every box open ----------
    await batchBy(page, 'City Laundry').locator('button', { hasText: 'Lost or damaged' }).click();
    await page.click('#f-more'); await page.click('#f-extra-open'); await page.click('#f-note-open'); await page.click('#f-kind-open');
    for (const n of ['Shirt', 'Suit', 'Blanket or quilt']) await count(page, n, '12');
    await page.selectOption('#f-shop', '+new');
    for (const w of [320, 360, 390]) {
        await page.setViewportSize({ width: w, height: 800 });
        const r = await page.evaluate(() => {
            const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select, button, textarea')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height; });
            const bad = [];
            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); }
            const ph = [...document.querySelectorAll('input[placeholder]')].filter(e => e.offsetWidth && e.scrollWidth > e.clientWidth + 1).map(e => e.id);
            return { bad: bad.slice(0, 4), scroll: document.documentElement.scrollWidth > innerWidth + 1, ph };
        });
        ok('no overlap at ' + w, !r.bad.length, r.bad); ok('no side scroll at ' + w, !r.scroll); ok('placeholders fit at ' + w, !r.ph.length, r.ph);
        const fits = await page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(e => e.offsetWidth).map(e => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return [e.id, c.measureText(e.placeholder).width <= e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1]; }).filter(x => !x[1]).map(x => x[0]));
        ok('placeholder text fits its box at ' + w, !fits.length, fits);
    }
    // all widths, filled-in and cleared state
    for (const scheme of ['dark', 'light']) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await page.setViewportSize({ width: w, height: 900 });
            for (const pos of [0, 0.5, 1]) {
                await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const r = await page.evaluate(() => {
                    const bad = [];
                    document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => c.offsetWidth && c.offsetHeight); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } });
                    const out = [...document.querySelectorAll('main *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1); }).map(e => e.className).slice(0, 3);
                    return { bad, out, scroll: document.documentElement.scrollWidth > innerWidth + 1 };
                });
                ok(scheme + ' ' + w + ' at ' + pos + ': no overlap, nothing sticks out', !r.bad.length && !r.out.length && !r.scroll, r);
            }
        }
    }
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1280, height: 900 });
    ok('desktop puts the list and the form side by side', await page.evaluate(() => { const a = document.querySelector('.col-main').getBoundingClientRect(), b = document.querySelector('.col-side').getBoundingClientRect(); return b.left > a.right - 1 && a.width > 450; }));
    await ctx.close();

    // ---------- corrupt saved data, blocked storage ----------
    ({ ctx, page } = await newPage({}, `try { localStorage.setItem('${KEY}', '{"shops":[{"id":"a","name":"X"}],"batches":"oops'); } catch (e) {}`));
    ok('corrupt data: fresh start', await page.locator('#f-shop-name').isVisible() && !(await page.locator('#list').isVisible()));
    await ctx.close();
    ({ ctx, page } = await newPage({}, `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });`));
    ok('blocked storage: warning', await page.locator('#store-warn').isVisible());
    await page.fill('#f-shop-name', 'Dhobi'); await count(page, 'Shirt', '2'); await page.click('#f-save');
    ok('blocked storage: still works this visit', await page.locator('#batches > li').count() === 1);
    await ctx.close();

    // ---------- screenshots: the real situation ----------
    if (SHOTS) {
        const seed = {
            v: 1, cur: '', last: 's1', kinds: [],
            shops: [{ id: 's1', name: 'City Laundry', ready: 3, prices: { 'wash|shirt': 4000, 'wash|trousers or jeans': 5000, 'wash|shalwar kameez': 12000, 'wash|bedsheet': 8000, 'wash|towel': 3000 } },
                { id: 's2', name: 'Star Dry Cleaners', ready: 4, prices: { 'dry|suit': 60000, 'dry|coat or jacket': 45000 } }],
            batches: [
                { id: 'b1', shop: 's1', date: '2026-10-20', svc: 'wash', lines: [{ t: 'Shirt', n: 5, back: 3, lost: 0, p: 4000 }, { t: 'Trousers or jeans', n: 3, back: 3, lost: 0, p: 5000 }, { t: 'Shalwar kameez', n: 4, back: 4, lost: 0, p: 12000 }, { t: 'Bedsheet', n: 2, back: 2, lost: 0, p: 8000 }], extra: { label: 'Express', c: 25000 }, comp: 0, note: 'Slip 4512', pays: [{ id: 'p1', d: '2026-10-23', c: 100000 }], done: '' },
                { id: 'b2', shop: 's2', date: '2026-10-16', svc: 'dry', lines: [{ t: 'Suit', n: 1, back: 1, lost: 0, p: 60000 }, { t: 'Coat or jacket', n: 1, back: 1, lost: 0, p: 45000 }], extra: null, comp: 0, note: '', pays: [{ id: 'p2', d: '2026-10-19', c: 105000 }], done: '2026-10-19' },
                { id: 'b3', shop: 's1', date: '2026-10-11', svc: 'wash', lines: [{ t: 'Shirt', n: 6, back: 6, lost: 0, p: 4000 }, { t: 'Towel', n: 4, back: 4, lost: 0, p: 3000 }], extra: null, comp: 0, note: '', pays: [], done: '2026-10-14' }]
        };
        const init = `if (!sessionStorage.getItem('seeded')) { localStorage.setItem('${KEY}', ${JSON.stringify(JSON.stringify(seed))}); sessionStorage.setItem('seeded', '1'); }`;
        ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 800 } }, init));
        await count(page, 'Shirt', '4'); await count(page, 'Trousers or jeans', '2'); await count(page, 'Towel', '2');
        await page.addStyleTag({ content: '*{caret-color:transparent!important}' });
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'desktop.png'), fullPage: true });
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, init));
        const top = await page.evaluate(() => document.getElementById('list').getBoundingClientRect().top + scrollY - 12);
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'phone.png'), fullPage: true, clip: { x: 0, y: top, width: 390, height: 844 } });
        await ctx.close();
    }

    // every file the page asked for answered
    ok('no failed requests', !failed.length, failed);
    ok('no page or console errors', !errors.length, errors);
    for (const f of ['../theme.js', '../help.js', 'core.js', 'script.js', 'style.css'])
        ok('requested ' + f, [...requested].some(u => u.endsWith('/' + f.replace('../', ''))), f);
    for (const f of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'sw.js', 'manifest.webmanifest', 'favicon.svg', '../theme.js', '../help.js']) {
        const r = await fetch(URL + f); ok('file answers ' + f, r.status === 200, r.status);
    }
    await browser.close();
    if (srv) srv.close();
    console.log((fail ? 'FAILED ' : 'ALL UI CHECKS PASSED ') + pass + ' passed, ' + fail + ' failed');
    process.exitCode = fail ? 1 : 0;
})();
