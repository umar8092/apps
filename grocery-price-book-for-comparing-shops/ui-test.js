// Drives the real page in headless Chromium. Run from the repo root:
//   node grocery-price-book-for-comparing-shops/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/grocery-price-book-for-comparing-shops/';
const KEY = 'grocery-price-book-for-comparing-shops.state';
const DIR = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-10-27T10:00:00');

async function open(browser, width, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 900 }, deviceScaleFactor: opts.scale || 1, colorScheme: opts.scheme || 'dark', locale: 'en-GB', acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
    const page = await ctx.newPage();
    await page.clock.setFixedTime(NOW);
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/goatcounter|gc\.zgo|ERR_NAME|ERR_INTERNET|ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
    page.bad = [];
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE)) page.bad.push(r.status() + ' ' + r.url()); });
    if (opts.block) await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    if (opts.state !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, opts.state]);
    await page.goto(URL, { waitUntil: 'load' });
    return page;
}
const txt = (page, sel) => page.locator(sel).first().innerText();
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

// layout checks used at every width
async function layout(page) {
    return page.evaluate(() => {
        const W = document.documentElement.clientWidth, out = [];
        if (document.documentElement.scrollWidth > W + 1) out.push('horizontal scroll ' + document.documentElement.scrollWidth);
        document.querySelectorAll('main *').forEach(e => {
            const r = e.getBoundingClientRect();
            if (r.width && (r.right > W + 1 || r.left < -1) && getComputedStyle(e).position !== 'absolute' && !e.closest('[hidden]')) out.push('sticks out: ' + (e.id || e.className || e.tagName));
        });
        // placeholders that do not fit their box
        const cv = document.createElement('canvas').getContext('2d');
        document.querySelectorAll('input[placeholder]').forEach(i => {
            if (!i.offsetParent || i.value) return;
            const cs = getComputedStyle(i); cv.font = cs.fontSize + ' ' + cs.fontFamily;
            const room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            if (cv.measureText(i.placeholder).width > room + 1) out.push('placeholder cut: ' + i.id);
        });
        return out.slice(0, 5);
    });
}
async function controlsOverlap(page) {
    return page.evaluate(() => {
        const els = [...document.querySelectorAll('main input:not([type=file]), main select, main button, main a.secondary, main .back')].filter(e => e.offsetParent).map(e => [e, e.getBoundingClientRect()]);
        const out = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i][1], b = els[j][1];
            if (els[i][0].contains(els[j][0]) || els[j][0].contains(els[i][0])) continue;
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push((els[i][0].id || els[i][0].textContent.trim().slice(0, 20)) + ' / ' + (els[j][0].id || els[j][0].textContent.trim().slice(0, 20)));
        }
        return out.slice(0, 5);
    });
}
async function siblingsOverlap(page) {
    const out = [];
    for (const pos of [0, 0.5, 1]) {
        await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
        await page.waitForTimeout(50);
        out.push(...await page.evaluate(() => {
            const o = [];
            document.querySelectorAll('main, .app, .col-a, .col-b, .i-list, .items').forEach(par => {
                const k = [...par.children].filter(e => e.offsetParent || getComputedStyle(e).display !== 'none').map(e => [e, e.getBoundingClientRect()]).filter(x => x[1].height);
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) {
                    const a = k[i][1], b = k[j][1];
                    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) o.push((k[i][0].id || k[i][0].className) + ' / ' + (k[j][0].id || k[j][0].className));
                }
            });
            return o;
        }));
    }
    return [...new Set(out)];
}

const box = (page, name) => page.locator('.item', { has: page.locator('.i-name', { hasText: new RegExp('^' + name + '$') }) });
async function addItem(page, name, per) {
    await page.fill('#f-name', name);
    if (per) await page.selectOption('#f-per', per);
    await page.click('#f-save');
}
// shop: an existing shop name, or a new one
async function addPrice(page, item, shop, price, size, o) {
    o = o || {};
    const b = box(page, item);
    const names = await b.locator('select[id^="ps-"] option').allInnerTexts();
    if (names.includes(shop)) await b.locator('select[id^="ps-"]').selectOption({ label: shop });
    else { await b.locator('select[id^="ps-"]').selectOption('__new'); await b.locator('input[id^="pn-"]').fill(shop); }
    await b.locator('input[id^="pc-"]').fill(price);
    await b.locator('input[id^="pq-"]').fill(size);
    if (o.unit) await b.locator('select[id^="pu-"]').selectOption(o.unit);
    if (o.packs) { await b.getByRole('button', { name: /Multipack/ }).click(); await b.locator('input[id^="pk-"]').fill(o.packs); }
    if (o.date) await b.locator('input[id^="pd-"]').fill(o.date);
    if (o.sale) await b.locator('input[id^="pa-"]').check();
    if (!o.noSave) await b.locator('.save-p').click();
}
async function sana(page) {
    await page.selectOption('#cur', 'Rs');
    await page.click('#quick .chip[data-name="Cooking oil"]');
    await page.click('#f-save');
    await addPrice(page, 'Cooking oil', 'Imtiaz', '2580', '5', { date: '2026-10-01' });
    await addPrice(page, 'Cooking oil', 'Metro', '2,690', '5', { date: '2026-10-12' });
    await addPrice(page, 'Cooking oil', 'Imtiaz', '2850', '5', { date: '2026-10-20' });
    await addPrice(page, 'Cooking oil', 'Corner shop', 'Rs 595', '1 L', { date: '2026-10-25' });
    await page.click('#quick .chip[data-name="Rice"]'); await page.click('#f-save');
    await addPrice(page, 'Rice', 'Metro', '1500', '5', { date: '2026-10-12' });
    await addPrice(page, 'Rice', 'Corner shop', '320', '1', { date: '2026-10-25' });
    await page.click('#quick .chip[data-name="Eggs"]'); await page.click('#f-save');
    await addPrice(page, 'Eggs', 'Metro', '930', '30', { date: '2026-10-12' });
    await addPrice(page, 'Eggs', 'Corner shop', '380', '12', { date: '2026-10-25' });
    await page.click('#quick .chip[data-name="Tea"]'); await page.click('#f-save');
    await addPrice(page, 'Tea', 'Imtiaz', '720', '250 g', { date: '2026-10-20' });
    await addPrice(page, 'Tea', 'Metro', '1350', '475', { date: '2026-10-12' });
}

(async () => {
    const browser = await chromium.launch();

    // ---------- first use ----------
    let page = await open(browser, 390);
    ok('first use: intro shown', await page.locator('#intro').isVisible());
    ok('first use: no item list', !(await page.locator('#items').isVisible()));
    ok('first use: where-to-buy hidden', !(await page.locator('#plan').isVisible()));
    ok('first use: no shops list', !(await page.locator('#shops-box').isVisible()));
    ok('title', (await page.title()).startsWith('Grocery Price Book for Comparing Shops'));
    ok('h1', (await txt(page, 'h1')) === 'Grocery Price Book for Comparing Shops');
    await page.click('#f-save');
    ok('blank name refused', (await txt(page, '#f-name-err')).includes('Type a name'));
    await page.fill('#f-name', '    '); await page.click('#f-save');
    ok('spaces-only name refused', (await page.locator('.item').count()) === 0);

    // ---------- the main situation ----------
    await sana(page);
    ok('no errors while adding', !page.errors.length, page.errors.join(' | '));
    let oil = box(page, 'Cooking oil');
    ok('cheapest oil is Metro', (await oil.locator('.r-big').innerText()) === 'Metro');
    ok('cheapest oil line', (await oil.locator('.r-line').innerText()) === 'Rs 2,690 for 5 L · Rs 538 per litre');
    const rows = await oil.locator('.s-row').allInnerTexts();
    ok('3 shops cheapest first', rows.length === 3 && rows[0].startsWith('Metro') && rows[1].startsWith('Imtiaz') && rows[2].startsWith('Corner shop'), rows.join(' / '));
    ok('Imtiaz +5.9% and up 10% since 1 Oct', /\+5\.9%/.test(rows[1]) && /up 10% since 1 Oct/.test(rows[1]), rows[1]);
    ok('Corner shop +11%', /\+11%/.test(rows[2]), rows[2]);
    ok('Metro marked cheapest', /Cheapest/.test(rows[0]));
    ok('the last shop used is picked', (await oil.locator('select[id^="ps-"] option:checked').innerText()) === 'Metro');
    ok('pack size remembered from the last price', (await oil.locator('input[id^="pq-"]').inputValue()) === '1');
    ok('unit remembered from the last price', (await oil.locator('select[id^="pu-"]').inputValue()) === 'l');
    // the price in front of you in the shop
    await addPrice(page, 'Cooking oil', 'Imtiaz', '2750', '5', { sale: true, noSave: true });
    let v = await oil.locator('.verdict').innerText();
    ok('verdict per litre', v.includes('That is Rs 550 per litre.'), v);
    ok('verdict: Metro is cheaper by 60', v.includes('Cheaper at Metro (Rs 2,690 for 5 L, 12 Oct). This price is 2.2% more: the same 5 L would cost about Rs 2,690 there, Rs 60 less.'), v);
    ok('verdict: the sale is real', v.includes('The sale is real: 3.5% less than the usual price at Imtiaz (Rs 2,850 for 5 L on 20 Oct).'), v);
    ok('verdict box red', await oil.locator('.verdict.is-bad').count() === 1);
    await oil.locator('input[id^="pc-"]').fill('2500');
    v = await oil.locator('.verdict').innerText();
    ok('verdict cheapest, saves 190', v.includes('Cheapest you have seen: 7.1% less than Metro') && v.includes('You save Rs 190 on 5 L.'), v);
    ok('verdict box green', await oil.locator('.verdict.is-good').count() === 1);
    await oil.locator('input[id^="pc-"]').fill('abc');
    ok('bad price: waits quietly', (await oil.locator('.verdict').innerText()).includes('Type the price and the pack size'));
    await oil.locator('.save-p').click();
    ok('bad price refused on save', (await oil.locator('[id^="pc-"][id$="-err"]').innerText()).length > 0);
    for (const [val, word] of [['0', 'bigger than 0'], ['-20', 'minus'], ['99999999999999', 'too big'], ['', 'Type the price']]) {
        await oil.locator('input[id^="pc-"]').fill(val); await oil.locator('.save-p').click();
        ok('price "' + val + '" refused', (await oil.locator('[id^="pc-"][id$="-err"]').innerText()).includes(word));
    }
    await oil.locator('input[id^="pc-"]').fill('2750');
    await oil.locator('input[id^="pq-"]').fill('0'); await oil.locator('.save-p').click();
    ok('size 0 refused', (await oil.locator('[id^="pq-"][id$="-err"]').innerText()).includes('bigger than 0'));
    await oil.locator('input[id^="pq-"]').fill('2 kg'); await oil.locator('.save-p').click();
    ok('weight unit in a litre item refused', (await oil.locator('[id^="pq-"][id$="-err"]').innerText()).includes('compared per litre'));
    await oil.locator('input[id^="pq-"]').fill('500 ml');
    ok('typed ml picks ml', (await oil.locator('select[id^="pu-"]').inputValue()) === 'ml');
    await oil.locator('input[id^="pq-"]').fill('5'); await oil.locator('select[id^="pu-"]').selectOption('l');
    await oil.locator('input[id^="pd-"]').fill('2026-10-28'); await oil.locator('.save-p').click();
    ok('future date refused', (await oil.locator('[id^="pd-"][id$="-err"]').innerText()).includes('today or an earlier'));
    await oil.locator('input[id^="pd-"]').fill('2026-10-27');
    // draft survives a re-render (currency change)
    await page.selectOption('#cur', 'Rs');
    await oil.locator('.save-p').click();
    oil = box(page, 'Cooking oil');
    ok('sale price saved', (await oil.locator('.msg.show').innerText()).includes('Saved: Rs 2,750 for 5 L at Imtiaz.'));
    ok('sale tag shown', await oil.locator('.s-row .tag.sale').count() === 1);
    ok('Metro still cheapest', (await oil.locator('.r-big').innerText()) === 'Metro');
    // a fake sale
    await addPrice(page, 'Cooking oil', 'Corner shop', '600', '1', { sale: true, noSave: true });
    v = await oil.locator('.verdict').innerText();
    ok('fake sale spotted', v.includes('This "sale" is not cheaper: 0.8% more than the usual price at Corner shop'), v);
    // multipack: 2 x 1 L for 1,000 = 500 per litre
    await oil.locator('input[id^="pa-"]').uncheck();
    await oil.locator('input[id^="pc-"]').fill('1000'); await oil.getByRole('button', { name: /Multipack/ }).click(); await oil.locator('input[id^="pk-"]').fill('2');
    v = await oil.locator('.verdict').innerText();
    ok('multipack per litre', v.includes('That is Rs 500 per litre.'), v);
    await oil.locator('input[id^="pk-"]').fill('1.5'); await oil.locator('.save-p').click();
    ok('half pack refused', (await oil.locator('[id^="pk-"][id$="-err"]').innerText()).includes('whole number'));
    await oil.getByRole('button', { name: 'Remove the multipack' }).click();
    ok('multipack removed', !(await oil.locator('input[id^="pk-"]').isVisible()));
    await oil.locator('input[id^="pc-"]').fill('');

    // eggs and tea
    const egg = box(page, 'Eggs');
    ok('eggs: Metro 372 a dozen', (await egg.locator('.r-line').innerText()) === 'Rs 930 for 30 items · Rs 372 per dozen');
    const tea = box(page, 'Tea');
    ok('tea typed 250 g picked g', (await tea.locator('.s-row').allInnerTexts()).some(t => t.includes('Rs 720 for 250 g · Rs 288 per 100 g')));
    const tl = await tea.locator('.r-line').innerText(); ok('tea 475 kept g as unit', tl === 'Rs 1,350 for 475 g · Rs 284.21 per 100 g', tl);

    // where to buy
    let plan = await page.locator('#plan').innerText();
    ok('plan: Metro 4 items', plan.includes('Metro (4 items)'), plan);
    ok('plan: oil line', plan.includes('Cooking oil: Rs 2,690 for 5 L (Rs 538 per litre)'), plan);
    ok('plan: rice at Metro 300 a kg', plan.includes('Rice: Rs 1,500 for 5 kg (Rs 300 per kg)'), plan);
    const mail = await page.getAttribute('#plan-mail', 'href');
    ok('email link has no recipient and the list', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('- Rice: Rs 1,500 for 5 kg'));
    await page.click('#plan-copy'); await page.waitForTimeout(300);
    ok('copy list', (await txt(page, '#plan-msg')).includes('Copied'), await txt(page, '#plan-msg'));
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('clipboard has the list', clip.includes('Where to buy') && clip.includes('Metro:'), clip.slice(0, 80));

    // duplicate and very long names
    await addItem(page, 'cooking OIL', 'l');
    ok('duplicate item refused', (await txt(page, '#f-name-err')).includes('You already have Cooking oil'));
    const long = 'Basmati rice extra long grain from the big sack at the back of the';
    await addItem(page, long, 'kg');
    ok('long name kept to 60 characters', await page.locator('.i-name', { hasText: long.slice(0, 60) }).count() === 1);
    // find
    ok('find shown with 4+ items', await page.locator('#find').isVisible());
    await page.fill('#find', 'oil');
    ok('find filters', await page.locator('.item:visible').count() === 1);
    await page.fill('#find', 'ghee');
    ok('find none offers to add', (await txt(page, '#find-none')).includes('No item called "ghee"'));
    await page.getByRole('button', { name: 'Add it as a new item' }).click();
    ok('find add fills the name', (await page.inputValue('#f-name')) === 'ghee');
    await page.selectOption('#f-per', 'kg'); await page.click('#f-save');
    ok('ghee added and find cleared', await page.locator('.i-name', { hasText: 'ghee' }).count() === 1 && (await page.inputValue('#find')) === '');
    // first price for a new item and new shop name matching an old one
    await addPrice(page, 'ghee', 'metro', '2400', '1', { noSave: true });
    ok('first price words', (await box(page, 'ghee').locator('.verdict').innerText()).includes('This is the first price for ghee.'));
    await box(page, 'ghee').locator('.save-p').click();
    ok('typing an old shop name reuses it', (await saved(page)).shops.length === 3);
    ok('only one shop note', (await box(page, 'ghee').innerText()).includes('Only one shop so far'));

    // edit a price, delete with undo
    await oil.getByRole('button', { name: /All prices/ }).click();
    ok('all prices listed', await oil.locator('.h-row').count() === 5);
    await oil.getByRole('button', { name: 'Edit the price of 12 Oct at Metro' }).click();
    ok('edit loads the price', (await oil.locator('input[id^="pc-"]').inputValue()) === '2690' && (await oil.locator('h3').first().innerText()) === 'Change this price');
    v = await oil.locator('.verdict').innerText();
    ok('editing leaves its own price out', v.includes('Cheapest you have seen: 2.2% less than Imtiaz'), v);
    await oil.locator('input[id^="pc-"]').fill('2950'); await oil.locator('.save-p').click();
    ok('edited: Imtiaz sale now cheapest', (await oil.locator('.r-big').innerText()) === 'Imtiaz');
    ok('edit kept 5 prices', (await saved(page)).items.find(i => i.name === 'Cooking oil').entries.length === 5);
    await oil.getByRole('button', { name: 'Delete the price of 27 Oct at Imtiaz' }).click();
    ok('deleted: Imtiaz back to 2,850', (await oil.locator('.s-row').first().innerText()).includes('Rs 2,850 for 5 L'));
    ok('delete message with undo', (await oil.locator('.msg.show').innerText()).includes('Deleted the price of 27 Oct at Imtiaz'));
    await oil.locator('.msg.show .undo').click();
    ok('undo brings it back', (await saved(page)).items.find(i => i.name === 'Cooking oil').entries.length === 5);
    ok('undo message', (await oil.locator('.msg.show').innerText()).includes('Undone'));
    // rename and delete a shop
    await page.getByRole('button', { name: 'Rename Corner shop' }).click();
    await page.fill('input[id^="rn-"]', 'metro'); await page.getByRole('button', { name: 'Save name' }).click();
    ok('rename to an existing name refused', (await page.locator('[id^="rn-"][id$="-err"]').innerText()).includes('already have'));
    await page.fill('input[id^="rn-"]', 'Bilal Store'); await page.getByRole('button', { name: 'Save name' }).click();
    ok('shop renamed everywhere', (await oil.innerText()).includes('Bilal Store') && !(await oil.innerText()).includes('Corner shop'));
    await page.getByRole('button', { name: 'Delete Bilal Store' }).click();
    ok('shop deleted with its prices', (await txt(page, '#tools-msg')).includes('Deleted Bilal Store and its 3 prices'), await txt(page, '#tools-msg'));
    ok('rice now Metro only', (await box(page, 'Rice').innerText()).includes('Only one shop so far'));
    await page.locator('#tools-msg .undo').click();
    ok('shop undo', (await saved(page)).shops.some(s => s.name === 'Bilal Store'));
    // change and delete an item
    await box(page, 'Tea').getByRole('button', { name: 'Change Tea' }).click();
    ok('change item: only weight choices', (await page.locator('#f-per option').allInnerTexts()).every(t => /kg|g|lb/.test(t)));
    await page.fill('#f-name', 'Green tea'); await page.selectOption('#f-per', 'kg'); await page.click('#f-save');
    ok('item renamed and compared per kg', (await box(page, 'Green tea').locator('.r-line').innerText()).includes('per kg'));
    await box(page, 'Green tea').getByRole('button', { name: 'Delete Green tea' }).click();
    ok('item deleted', await box(page, 'Green tea').count() === 0 && (await txt(page, '#top-msg')).includes('Deleted Green tea and its 2 prices'));
    await page.locator('#top-msg .undo').click();
    ok('item undo', await box(page, 'Green tea').count() === 1);

    // reload keeps everything
    const before = await saved(page);
    await page.reload();
    ok('reload keeps items', await page.locator('.item').count() === before.items.length);
    ok('reload keeps currency', (await page.inputValue('#cur')) === 'Rs');
    ok('reload keeps last shop', before.last && (await box(page, 'Rice').locator('select[id^="ps-"]').inputValue()) === before.last);

    // keyboard: Enter saves a price
    await box(page, 'Rice').locator('select[id^="ps-"]').selectOption({ label: 'Imtiaz' });
    await box(page, 'Rice').locator('input[id^="pc-"]').fill('1450');
    await box(page, 'Rice').locator('input[id^="pq-"]').fill('5');
    await box(page, 'Rice').locator('input[id^="pq-"]').press('Enter');
    ok('Enter saves', (await box(page, 'Rice').locator('.r-big').innerText()) === 'Imtiaz');

    // backup and restore
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const file = path.join(require('os').tmpdir(), 'gpb-backup.json');
    await dl.saveAs(file);
    const back = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('backup has the items', back.state.items.length === before.items.length);
    await page.click('#del-all');
    ok('delete everything', await page.locator('.item').count() === 0 && (await page.locator('#intro').isVisible()));
    await page.locator('#tools-msg .undo').click();
    ok('delete everything undo', await page.locator('.item').count() === before.items.length);
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    ok('bad backup refused', (await page.locator('.msg.bad').first().innerText()).includes('not a backup'));
    await page.setInputFiles('#restore-file', file);
    await page.waitForTimeout(300); ok('restore', await page.locator('.item').count() === before.items.length, (await page.locator('.item').count()) + ' ' + await page.locator('.msg.show').allInnerTexts());
    ok('no errors in the main run', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
    const full = JSON.stringify(await saved(page));
    await page.context().close();

    // ---------- corrupt and blocked storage ----------
    page = await open(browser, 390, { state: '{not json' });
    ok('corrupt storage starts fresh', await page.locator('#intro').isVisible() && !page.errors.length, page.errors.join(' | '));
    await page.context().close();
    page = await open(browser, 390, { state: JSON.stringify({ v: 1, shops: [{ id: 'a', name: 'A' }], items: [{ id: 'x', name: 'Milk', per: 'l', entries: [{ id: 'e', s: 'a', c: -1, q: 1000, u: 'l', d: '2026-10-01' }, { id: 'f', s: 'zz', c: 100, q: 1000, u: 'l', d: '2026-10-01' }] }] }) });
    ok('bad saved prices dropped', (await box(page, 'Milk').innerText()).includes('No prices yet') && !page.errors.length);
    await page.context().close();
    page = await open(browser, 390, { block: true });
    ok('blocked storage warns', await page.locator('#store-warn').isVisible());
    await addItem(page, 'Milk', 'l');
    ok('blocked storage still works', await page.locator('.item').count() === 1 && !page.errors.length, page.errors.join(' | '));
    await page.context().close();

    // ---------- light/dark switch ----------
    page = await open(browser, 390, { state: full });
    const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.locator('.theme-toggle').click();
    const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('theme switch changes the look', bg1 !== bg2);
    await page.context().close();

    // ---------- Help at 4 widths ----------
    for (const w of [320, 390, 820, 1280]) {
        page = await open(browser, w, { state: full });
        await page.getByRole('button', { name: /help/i }).first().click();
        const dlg = page.locator('dialog[open]');
        const r = await dlg.boundingBox();
        ok('help opens inside the screen at ' + w, r && r.x >= 0 && r.x + r.width <= w + 1 && (await dlg.innerText()).includes('How to use the Grocery Price Book'));
        await page.keyboard.press('Escape');
        ok('Escape closes help at ' + w, !(await dlg.isVisible()));
        await page.getByRole('button', { name: /help/i }).first().click();
        await page.getByRole('button', { name: 'Got it' }).click();
        ok('Got it closes help at ' + w, !(await page.locator('dialog[open]').isVisible()));
        const top = await page.evaluate(() => [...document.querySelectorAll('.topbar a, .topbar button')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
        let clash = false;
        for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) { const a = top[i], b = top[j]; if (a[2] < b[3] - 1 && b[2] < a[3] - 1 && a[0] < b[1] - 1 && b[0] < a[1] - 1) clash = true; }
        ok('top bar buttons do not overlap at ' + w, !clash);
        await page.context().close();
    }

    // ---------- every width, filled and cleared, dark and light ----------
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        page = await open(browser, w, { state: full, scheme });
        let l = await layout(page);
        ok(scheme + ' ' + w + ' filled: no scroll or overflow', !l.length, l.join(' | '));
        if (w >= 900) { const o = await siblingsOverlap(page); ok(scheme + ' ' + w + ' no blocks overlap while scrolling', !o.length, o.join(' | ')); }
        if (w <= 390) {
            // every optional field open: a new shop, a multipack, a price being edited, a shop being renamed
            const oilb = box(page, 'Cooking oil');
            await oilb.getByRole('button', { name: /All prices/ }).click();
            await oilb.getByRole('button', { name: 'Edit the price of 12 Oct at Metro' }).click();
            await oilb.getByRole('button', { name: /Multipack/ }).click();
            const rb = box(page, 'Rice');
            await rb.locator('select[id^="ps-"]').selectOption('__new');
            await rb.locator('input[id^="pc-"]').fill('1450');
            await page.getByRole('button', { name: 'Rename Metro' }).click();
            await page.fill('#find', '');
            l = await layout(page);
            ok(scheme + ' ' + w + ' all fields open: no overflow', !l.length, l.join(' | '));
            const c = await controlsOverlap(page);
            ok(scheme + ' ' + w + ' no controls overlap', !c.length, c.join(' | '));
        }
        await page.evaluate(k => localStorage.removeItem(k), KEY); await page.reload();
        l = await layout(page);
        ok(scheme + ' ' + w + ' cleared: no overflow', !l.length, l.join(' | '));
        if (w >= 900) { const o = await siblingsOverlap(page); ok(scheme + ' ' + w + ' cleared: no blocks overlap', !o.length, o.join(' | ')); }
        ok(scheme + ' ' + w + ' no errors', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
        await page.context().close();
    }

    // ---------- screenshots ----------
    if (args.includes('--shots')) {
        for (const [w, scale, h, name] of [[1280, 1, 1640, 'desktop'], [390, 2, 1420, 'phone']]) {
            page = await open(browser, w, { scale });
            await sana(page);
            await page.locator('#top-msg').evaluate(e => { e.textContent = ''; e.className = 'msg'; });
            await page.evaluate(() => document.querySelectorAll('.msg.show').forEach(e => { e.textContent = ''; e.className = 'msg'; }));
            await addPrice(page, 'Cooking oil', 'Imtiaz', '2750', '5', { sale: true, noSave: true });
            await page.locator('input[id^="pc-"]').first().blur();
            await page.setViewportSize({ width: w, height: h });
            if (w > 900) await page.evaluate(() => window.scrollTo(0, 0));
            else await page.evaluate(() => window.scrollTo(0, document.querySelector('.item').getBoundingClientRect().top + scrollY - 12));
            await page.screenshot({ path: path.join(DIR, 'screenshots/' + name + '.png') });
            await page.context().close();
        }
    }
    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
